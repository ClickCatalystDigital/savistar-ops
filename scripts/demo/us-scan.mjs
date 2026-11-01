// Checks a running local demo for anything Indian a North American visitor would see, and (with --snapshot) writes
// every page's visible text to a file so two builds can be diffed (the India-unchanged check).
//
//   1. Build and start a demo locally against a seeded file database:
//        NEXT_PUBLIC_DEMO=1 NEXT_PUBLIC_MARKET=NA npx next build
//        DEMO_MODE=1 DEMO_PASS=<pin> TURSO_URL=file:/tmp/sav-us.db LEADS_TURSO_URL=file:/tmp/leads.db SESSION_SECRET=x npx next start -p 8791
//   2. node scripts/demo/us-scan.mjs --base http://localhost:8791 --pass <pin> --db /tmp/sav-us.db [--snapshot out.txt] [--india]
//
// Needs Chrome and puppeteer-core (not a project dependency): PUPPETEER=/path/to/node_modules/puppeteer-core.
// --india skips the deny list (an Indian build is meant to say GST) and only writes the snapshot.
// What it reads, as each demo role: every page under app/ (dynamic ones with ids from the database), every invoice and
// quotation PDF (via pdftotext), the assistant's starter questions, and every text value in the database.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient } from '@libsql/client';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:8791'), PASS = arg('pass'), DB = arg('db'), SNAP = arg('snapshot');
const INDIA = process.argv.includes('--india');
if (!PASS || !DB) throw new Error('--pass and --db are required');

// What a North American visitor must never see. Word-bounded and case-sensitive where the word is common in English.
export const DENY = [
  /₹/, /\bRs\.?\s?\d/, /\bINR\b/, /\blakhs?\b/i, /\bcrores?\b/i, /\bGSTIN?\b/, /\b[CSI]GST\b/, /\bHSN\b/, /\bSAC\b/, /\bPAN\b/, /\bTDS\b/,
  /\be-?way bill/i, /\bIRN\b/, /\bTally/, /\bIFSC\b/, /\bUPI\b/, /\bNEFT\b/, /\bRTGS\b/, /\+91/, /\bIST\b/, /Kolkata/, /\bPvt\.? Ltd\b/, /\bLLP\b/,
  /Aadhaar/i, /kharchi/i, /\bIBR\b/, /kg\/cm/, /\bBHK\b/, /Diwali/i, /pooja|mandir/i, /\bTempo\b/,
  /Ahmedabad|Gujarat|Gandhinagar|Vatva|Navrangpura|Bodakdev|Thaltej|Satellite|Vastrapur|Usmanpura|Prahlad Nagar|Mumbai|Pune|Delhi|Maharashtra/,
  /\b\d{2}-\d{2}(?!\d)(?=.*\/)|\/\d{2}-\d{2}\//, // Indian financial-year numbering like AI/26-27/009
  /\b\d{1,2},\d{2},\d{3}\b/, // Indian digit grouping: 1,23,456
  /\bWhatsApp\b/, /\bquotation\b/i, /\bBOQ\b/, /\benquir/i, /\bMehta\b|\bPatel\b|\bShah\b|\bDesai\b/,
];
const hits = [];
const check = (where, text) => {
  if (INDIA) return;
  for (const line of String(text).split('\n')) for (const re of DENY) if (re.test(line)) hits.push(`${where}: [${re.source}] ${line.trim().slice(0, 160)}`);
};

// ---- pages ----
const APP = join(process.cwd(), 'app');
const pages = [];
(function walk(dir, route) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!f.startsWith('api') && !f.startsWith('_')) walk(p, `${route}/${f}`); }
    else if (f === 'page.js' || f === 'page.jsx') pages.push(route.replace(/\/\([^)]+\)/g, '') || '/');
  }
})(APP, '');
const db = createClient({ url: `file:${DB}` });
const ids = async (table, where = '1=1') => (await db.execute(`SELECT id FROM ${table} WHERE ${where} ORDER BY id`)).rows.map((r) => r.id);
const TABLE = { clients: 'clients', projects: 'projects', quotes: 'quotations', vendors: 'vendors', people: 'employees', orders: 'orders' };
const urls = [];
for (const p of pages) {
  const m = /^\/(\w+)\/\[id\]$/.exec(p);
  if (m) { for (const id of await ids(TABLE[m[1]] || m[1]).catch(() => [])) urls.push(`/${m[1]}/${id}`); }
  else if (!p.includes('[')) urls.push(p);
}

const { default: puppeteer } = await import(process.env.PUPPETEER || 'puppeteer-core');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const snapshot = [];
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
// The /demo page as a visitor sees it, before entering.
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle0' });
let text = await page.evaluate(() => document.body.innerText + '\n' + document.title + '\n' + [...document.querySelectorAll('meta[name=description],input[placeholder],[title]')].map((e) => e.content || e.placeholder || e.title).join('\n'));
check('/demo', text); snapshot.push(`=== /demo\n${text}`);
await page.evaluate(async (pass) => fetch('/api/demo/pass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pass }) }), PASS);

for (const role of ['owner', 'manager', 'office']) {
  await page.evaluate(async (username) => fetch('/api/demo/enter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username }) }), role);
  for (const u of urls) {
    await page.goto(`${BASE}${u}`, { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    // Visible text plus placeholders, titles and option labels (Selects render their items only when opened).
    text = await page.evaluate(() => document.body.innerText + '\n' + [...document.querySelectorAll('input[placeholder],textarea[placeholder],[title],[aria-label]')].map((e) => e.placeholder || e.title || e.getAttribute('aria-label')).join('\n'));
    check(`${role} ${u}`, text); snapshot.push(`=== ${role} ${u}\n${text}`);
  }
}

// ---- PDFs, as the owner ----
const tmp = mkdtempSync(join(tmpdir(), 'us-scan-'));
const pdfs = [...(await ids('invoices')).map((id) => `/api/invoices/${id}/pdf`), ...(await ids('quotations')).map((id) => `/api/quotations/${id}/pdf`)];
await page.evaluate(async () => fetch('/api/demo/enter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'owner' }) }));
for (const u of pdfs) {
  const b64 = await page.evaluate(async (url) => { const r = await fetch(url); if (!r.ok) return null; const a = new Uint8Array(await r.arrayBuffer()); let s = ''; for (const x of a) s += String.fromCharCode(x); return btoa(s); }, u);
  if (!b64) { hits.push(`${u}: could not download`); continue; }
  const f = join(tmp, 'x.pdf'); writeFileSync(f, Buffer.from(b64, 'base64'));
  const t = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
  const size = execFileSync('pdfinfo', [f], { encoding: 'utf8' }).match(/Page size:\s+(.*)/)?.[1] || '';
  check(u, t); check(`${u} page size`, /612 x 792/.test(size) || INDIA ? '' : `not Letter: ${size}`); snapshot.push(`=== ${u}\n${t}`);
}

// ---- the assistant's starter questions (what a visitor taps first) ----
const starters = await page.evaluate(async () => (await (await fetch('/api/assistant/starters')).json()));
check('/api/assistant/starters', JSON.stringify(starters));
snapshot.push(`=== starters\n${JSON.stringify(starters)}`);

// ---- every text value in the database ----
if (!INDIA) {
  const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).rows.map((r) => r.name);
  for (const t of tables) {
    const rows = (await db.execute(`SELECT * FROM "${t}"`)).rows;
    for (const r of rows) for (const [k, v] of Object.entries(r)) if (typeof v === 'string' && !/^(password|token|.*_hash|file_url|avatar.*)$/.test(k)) check(`db ${t}.${k}`, v);
  }
}

await browser.close();
if (SNAP) writeFileSync(SNAP, snapshot.join('\n\n'));
console.log(`us-scan: ${urls.length} pages × 3 roles, ${pdfs.length} PDFs, starters${INDIA ? '' : ', database'}${SNAP ? `; snapshot ${SNAP}` : ''}`);
if (hits.length) { console.log(`${hits.length} hit(s):\n${[...new Set(hits)].join('\n')}`); process.exit(1); }
if (!INDIA) console.log('us-scan: nothing Indian found');
