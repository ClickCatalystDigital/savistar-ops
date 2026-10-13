// Public demo only: visitors' contact details, kept in their own database (LEADS_TURSO_URL) so the
// nightly reset of the demo data never touches them. Read them with: turso db shell sav-demo-leads
import { createClient } from '@libsql/client/web';

let client = null;
function db() {
  if (!process.env.LEADS_TURSO_URL) throw new Error('LEADS_TURSO_URL is not set');
  client ||= createClient({ url: process.env.LEADS_TURSO_URL, authToken: process.env.LEADS_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN });
  return client;
}

export async function saveDemoLead({ name, company, email, phone, business, ip, userAgent }) {
  const c = db();
  await c.execute(`CREATE TABLE IF NOT EXISTS demo_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, company TEXT NOT NULL, email TEXT NOT NULL,
    phone TEXT, business TEXT, ip TEXT, user_agent TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await c.execute({
    sql: 'INSERT INTO demo_leads (name, company, email, phone, business, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [name, company, email, phone || null, business || null, ip || null, userAgent || null],
  });
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
