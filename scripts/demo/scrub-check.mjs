// Fails if any text in a demo database mentions Savistar, Saag, their owners/staff, address or GSTIN.
// Run before publishing a golden database:
//   DB_URL=... DB_TOKEN=... node scripts/demo/scrub-check.mjs
import { createClient } from '@libsql/client/web';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DENY = ['savistar', 'saag', 'hari', 'sachi', 'dristi', 'haripriya', 'afafs7926q', 'shree narayan darshan', 'hebatpur'];
const SKIP = new Set(['invoices.company']); // stored keys 'savistar'/'saag'; shown as BRAND names (lib/brand.js)
const db = createClient({ url: process.env.DB_URL, authToken: process.env.DB_TOKEN });
const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).rows.map((r) => r.name);
let hits = 0;
for (const t of tables) {
  const cols = (await db.execute(`PRAGMA table_info("${t}")`)).rows.filter((c) => /TEXT|CHAR|^$/i.test(c.type)).map((c) => c.name);
  for (const c of cols) {
    if (SKIP.has(`${t}.${c}`)) continue;
    for (const w of DENY) {
      const r = await db.execute({ sql: `SELECT COUNT(*) n, MIN(substr("${c}",1,80)) ex FROM "${t}" WHERE "${c}" LIKE ?`, args: [`%${w}%`] });
      if (Number(r.rows[0].n)) { hits += Number(r.rows[0].n); console.log(`${t}.${c} ~ "${w}": ${r.rows[0].n} (e.g. ${r.rows[0].ex})`); }
    }
  }
}
console.log(`${tables.length} tables scanned, ${hits} hit(s)`);

// What browsers download: the demo build's static assets (`npm run cf:build` writes .open-next/assets).
// Only the demo build: a normal build is the client's own app and rightly says Savistar. The stored keys
// 'savistar'/'saag' legitimately appear in client code, so this list is display names, staff, address and GSTIN.
const ASSET_DENY = ['savistar interiors', 'saag furniture', 'savistar ops', 'haripriya', 'afafs7926q', 'narayan darshan', 'hebatpur', '/logos/savistar', '/logos/saag'];
const assets = existsSync('.open-next/assets') ? '.open-next/assets' : null;
if (assets) {
  let files = 0;
  for (const f of readdirSync(assets, { recursive: true })) {
    const p = join(assets, f);
    if (!/\.(js|html|css|json|txt)$/.test(p) || !statSync(p).isFile()) continue;
    files++;
    const text = readFileSync(p, 'utf8').toLowerCase();
    for (const w of ASSET_DENY) if (text.includes(w)) { hits++; console.log(`${p} ~ "${w}"`); }
  }
  console.log(`${files} built files in ${assets} scanned`);
} else console.log('No demo build found; run `npm run cf:build` to also scan what browsers download');
process.exit(hits ? 1 : 0);
