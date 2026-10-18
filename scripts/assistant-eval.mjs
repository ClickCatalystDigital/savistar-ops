// AI assistant evaluation: sends a fixed set of questions through the real pipeline in DRY mode (no daily-cap use, no
// question log) with the REAL Jev model, and checks what it decided. Costs a fraction of a cent per question.
// Runs against a server (local dev by default) with an owner/admin login:
//   EVAL_USER=owner EVAL_PASS=… node scripts/assistant-eval.mjs [http://localhost:3010]
// The questions name the demo's sample records (scripts/demo/seed.mjs), so run it on a copy of the demo data.
const BASE = process.argv[2] || 'http://localhost:3000';
const login = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: process.env.EVAL_USER, password: process.env.EVAL_PASS }) });
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
if (!login.ok || !cookie) { console.error('Login failed: set EVAL_USER and EVAL_PASS (an owner or admin)'); process.exit(1); }

// [question, expect, previous turn?] — expect: { type, tool, has: ['Label=value' params], second: tool }
const CASES = [
  // home
  ["What's overdue?", { type: 'table', tool: 'tasks' }],
  ['my tasks this week', { type: 'table', tool: 'tasks', has: ['Period=This week'] }],
  ["What's on this week?", { type: 'table', tool: 'calendar' }],
  ['anything due tomorrow?', { type: 'table', tool: 'calendar' }],
  // studio
  ['How are the projects doing?', { type: 'table', tool: 'projects' }],
  ['which projects are on hold', { type: 'table', tool: 'projects' }],
  ['How is the Mehta bungalow going?', { type: 'table', tool: 'project_overview', has: ['Project=Mehta bungalow — full interiors'] }],
  ['status of the Brewnest cafe', { type: 'table', tool: 'project_overview' }],
  ['Which milestones are overdue?', { type: 'table', tool: 'milestones' }],
  ['site visits last month', { type: 'table', tool: 'site_visits', has: ['Period=Last month'] }],
  ['When did we last talk to Kiran Joshi?', { type: 'table', tool: 'client_contact', has: ['Client=Kiran Joshi'] }],
  ["Which clients haven't we spoken to in a while?", { type: 'table', tool: 'quiet_clients' }],
  // money
  ['Who owes us money?', { type: 'table', tool: 'outstanding_invoices' }],
  ['How much did we invoice in September?', { type: 'table', tool: 'invoiced', has: ['Period=September 2026'] }],
  ['GST collected by the furniture side this year', { type: 'table', tool: 'invoiced', has: ['Company='] }],
  ['How much cash came in this month?', { type: 'table', tool: 'cash' }],
  // workshop
  ['Which workshop orders are late?', { type: 'table', tool: 'orders' }],
  ['orders due this week', { type: 'table', tool: 'orders', has: ['Period=This week'] }],
  ['Who worked on the cafe counter?', { type: 'table', tool: 'order_history' }],
  ['are we delivering orders on time?', { type: 'table', tool: 'turnaround' }],
  ['who is in today', { type: 'table', tool: 'attendance' }],
  ['How many days did Suresh work this month?', { type: 'table', tool: 'days_worked', has: ['Person=Suresh Chauhan'] }],
  ['payroll for last month', { type: 'table', tool: 'payroll' }],
  ['advances not recovered yet', { type: 'table', tool: 'advances' }],
  ["who's doing the best work?", { type: 'table', tool: 'work_ratings' }],
  // vendors
  ['What material is still to be delivered?', { type: 'table', tool: 'vendor_pos' }],
  ['How much have we spent with vendors?', { type: 'table', tool: 'vendor_spend' }],
  ['Did Sardar Transport overcharge us?', { type: 'table', tool: 'freight_overcharges', has: ['Vendor=Sardar Transport'] }],
  // two-part, compare, follow-up
  ['Which workshop orders are late, and which milestones are overdue?', { type: 'table', tool: 'orders', second: 'milestones' }],
  ['cash this month compared to last month', { type: 'table', tool: 'cash', compare: true }],
  ['and last month?', { type: 'table', tool: 'invoiced', has: ['Period=Last month'] }, ['How much did we invoice this month?', { tool: 'invoiced', period: { from: null, to: null, label: 'x' } }]],
  // reminders and notes (drafts only; nothing is saved)
  ['remind me to call the Mehtas on Friday', { type: 'draft', draft: 'task', due: true, client: true }],
  ['remind me to send the revised quote to Kiran Joshi tomorrow', { type: 'draft', draft: 'task', due: true, client: true }],
  ['note that Mrs Mehta prefers WhatsApp', { type: 'draft', draft: 'note', client: true }],
  ['what did I note about the Mehtas?', { type: 'table', tool: 'my_notes' }],
  // not data
  ['how do I log a site visit?', { type: 'text', text: /site visit/i }],
  ['how is payroll worked out?', { type: 'text', text: /days/i }],
  ['mark the Mehta invoice paid', { type: 'text', text: /only look things up/i }],
  ['what is our bank balance?', { type: 'text', text: /bank/i }],
  ['what profit did we make on the Kapadia job?', { type: 'text', text: /profit|margin/i }],
  ['hello', { type: 'text', text: /^Hi/ }],
  ['write me a poem about chairs', { type: 'text', text: /only help/i }],
];

let pass = 0;
for (const [q, want, prev] of CASES) {
  const messages = prev ? [{ role: 'user', content: prev[0] }, { role: 'assistant', content: 'ok' }, { role: 'user', content: q }] : [{ role: 'user', content: q }];
  let context = null;
  if (prev) { // build real context by asking the previous question first
    const r0 = await fetch(`${BASE}/api/assistant/chat`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ dry: true, messages: [{ role: 'user', content: prev[0] }] }) }).then((r) => r.json());
    context = r0.reply?.context || null;
  }
  const res = await fetch(`${BASE}/api/assistant/chat`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ dry: true, messages, context }) });
  const d = await res.json();
  const r = d.reply || {};
  const params = (r.params || []).map((p) => `${p.label}=${p.value}`);
  const fails = [];
  if (!res.ok) fails.push(`HTTP ${res.status} ${d.error}`);
  if (want.type && r.type !== want.type) fails.push(`type ${r.type}`);
  if (want.tool && r.tool !== want.tool) fails.push(`tool ${r.tool}`);
  for (const h of want.has || []) if (!params.some((p) => (h.endsWith('=') ? p.startsWith(h) : p === h))) fails.push(`missing ${h}`);
  if (want.second && r.cards?.[0]?.tool !== want.second) fails.push(`second ${r.cards?.[0]?.tool}`);
  if (want.compare && !String(r.toolLabel).includes('comparison')) fails.push('no comparison');
  if (want.text && !want.text.test(r.text || '')) fails.push(`text "${String(r.text).slice(0, 60)}"`);
  if (want.draft && r.draft?.kind !== want.draft) fails.push(`draft ${r.draft?.kind}`);
  if (want.due && !r.draft?.due) fails.push('no due date');
  if (want.client && !r.draft?.client) fails.push('no client');
  if (!fails.length) pass++;
  console.log(`${fails.length ? 'FAIL' : 'ok  '}  ${q}${fails.length ? `\n      ${fails.join('; ')}\n      ${(d.meta?.trace || []).join(' | ')}` : `  →  ${r.draft ? JSON.stringify(r.draft) : r.summary || String(r.text).slice(0, 70)}`}`);
}
console.log(`\n${pass}/${CASES.length} passed`);
process.exit(pass === CASES.length ? 0 : 1);
