// Public demo only: visitors' contact details, kept in their own database (LEADS_TURSO_URL) so the
// nightly reset of the demo data never touches them. Read them with: turso db shell sav-demo-leads
import { createClient } from '@libsql/client/web';
import { createHmac, timingSafeEqual } from 'node:crypto';

let client = null;
function db() {
  if (!process.env.LEADS_TURSO_URL) throw new Error('LEADS_TURSO_URL is not set');
  client ||= createClient({ url: process.env.LEADS_TURSO_URL, authToken: process.env.LEADS_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN });
  return client;
}

// The table, plus the AI columns added later (token = the visitor's demo_lead cookie, ai_used = questions asked).
let ready = null;
function table() {
  ready ||= (async () => {
    const c = db();
    await c.execute(`CREATE TABLE IF NOT EXISTS demo_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, company TEXT NOT NULL, email TEXT NOT NULL,
      phone TEXT, business TEXT, ip TEXT, user_agent TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    for (const col of ['token TEXT', 'ai_used INTEGER NOT NULL DEFAULT 0']) {
      await c.execute(`ALTER TABLE demo_leads ADD COLUMN ${col}`).catch(() => {}); // already there
    }
    return c;
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

// Saves the visitor and returns their lead token (the demo_lead cookie).
export async function saveDemoLead({ name, company, email, phone, business, ip, userAgent }) {
  const token = crypto.randomUUID();
  await (await table()).execute({
    sql: 'INSERT INTO demo_leads (name, company, email, phone, business, ip, user_agent, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [name, company, email, phone || null, business || null, ip || null, userAgent || null, token],
  });
  return token;
}

// The assistant in the demo: each visitor (one lead form) gets this many questions, counted in the leads DB so the
// nightly reset doesn't refill them. Then the button locks and points them to us. Same as reel-inventory's demo.
// Visitors from before the token (cookie '1') can enter but get no questions.
export const AI_QUESTIONS = 2;
const real = (token) => token && token !== '1';

// Owner pass: the owner's own browser opens /demo#pass=<DEMO_PASS> (a Worker secret, 24+ characters). The page trades
// it once at /api/demo/pass for a demo_lead cookie holding an HMAC of the secret (never the secret itself): that
// browser skips the form, is never saved as a lead, and asks the assistant without a limit. No DEMO_PASS, no pass.
const passKey = () => (process.env.DEMO_PASS?.length >= 24 ? process.env.DEMO_PASS : null);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
export const ownerPassToken = () => (passKey() ? `pass.${createHmac('sha256', passKey()).update('demo-owner-pass').digest('base64url')}` : null);
export const passMatches = (given) => !!passKey() && typeof given === 'string' && same(given, passKey());
export const isOwnerPass = (token) => !!ownerPassToken() && !!token && same(token, ownerPassToken());

export async function aiLeft(token) {
  if (isOwnerPass(token)) return Infinity;
  if (!real(token)) return 0;
  const r = await (await table()).execute({ sql: 'SELECT ai_used FROM demo_leads WHERE token = ?', args: [token] });
  return r.rows.length ? Math.max(0, AI_QUESTIONS - Number(r.rows[0].ai_used)) : 0;
}
// Takes one question atomically; false when none are left.
export async function takeAiQuestion(token) {
  if (isOwnerPass(token)) return true;
  if (!real(token)) return false;
  const r = await (await table()).execute({ sql: 'UPDATE demo_leads SET ai_used = ai_used + 1 WHERE token = ? AND ai_used < ?', args: [token, AI_QUESTIONS] });
  return r.rowsAffected === 1;
}
// Gives it back when the answer failed, so a visitor never loses one to an error.
export async function returnAiQuestion(token) {
  if (real(token) && !isOwnerPass(token)) await (await table()).execute({ sql: 'UPDATE demo_leads SET ai_used = ai_used - 1 WHERE token = ? AND ai_used > 0', args: [token] });
}

// Emails the lead to us through ahromlabs.com (its /api/demo-lead, shared DEMO_LEAD_KEY). Never blocks or
// fails the visitor's entry: the lead is already saved, so a mail problem is only logged.
export async function emailDemoLead(lead) {
  if (!process.env.DEMO_LEAD_KEY) return;
  try {
    const res = await fetch('https://ahromlabs.com/api/demo-lead', {
      method: 'POST', signal: AbortSignal.timeout(5000),
      headers: { 'content-type': 'application/json', 'x-demo-key': process.env.DEMO_LEAD_KEY },
      body: JSON.stringify({ demo: 'interiors', name: lead.name, company: lead.company, email: lead.email, phone: lead.phone, about: lead.business }),
    });
    if (!res.ok) console.error('demo lead email failed', res.status);
  } catch (e) { console.error('demo lead email failed', e.message); }
}
