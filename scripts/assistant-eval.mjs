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
  // how people actually type: fragments, typos, Hinglish, a bare name
  ['mehta update?', { type: 'table', tool: 'project_overview' }],
  ['northbridge?', { type: 'table', tool: 'project_overview' }],
  ['kapadia job details', { type: 'table', tool: 'project_overview' }],
  ['receivables', { type: 'table', tool: 'outstanding_invoices' }],
  ['sardar overcharge?', { type: 'table', tool: 'freight_overcharges' }],
  ['what do i have today', { type: 'table', tool: 'calendar' }],
  ['material not recieved yet', { type: 'table', tool: 'vendor_pos' }],
  ['mehta ka kaam kaha tak pahucha', { type: 'table', tool: 'project_overview' }],
  ['kitna paisa aaya is mahine', { type: 'table', tool: 'cash' }],
  ['late orders and overdue milestones', { type: 'table', tool: 'orders', second: 'milestones' }],
  ['unpaid invoices and cash this month', { type: 'table', tool: 'outstanding_invoices', second: 'cash' }],
  // bank, overall position, project profit (the demo has no bank statements: these check routing, the tables are empty)
  ['what is our bank balance?', { type: 'table', tool: 'bank_balance' }],
  ['how much is in HDFC', { type: 'table', tool: 'bank_balance' }],
  ['biggest debits from the bank in July', { type: 'table', tool: 'bank_transactions', has: ['Period=July 2026'] }],
  ['what came into the bank last month?', { type: 'table', tool: 'bank_transactions' }],
  ['bank payments to Rahul Kumar', { type: 'table', tool: 'bank_transactions' }],
  ['how much money do we have?', { type: 'table', tool: 'money_position' }],
  ['where do we stand financially', { type: 'table', tool: 'money_position' }],
  ['what profit did we make on the Kapadia job?', { type: 'table', tool: 'project_profit' }],
  ['which projects are most profitable?', { type: 'table', tool: 'project_profit' }],
  ['mehta project mein kitna margin hai', { type: 'table', tool: 'project_profit' }],
  ['what is the cash balance?', { type: 'table', tool: 'cash' }],
  ['tell me a joke about plywood', { type: 'text', text: /only help/i }],
  ['what should we charge northbridge next', { type: 'text', text: /only report/i }],
  // reminders and notes (drafts only; nothing is saved)
  ['remind me to call the Mehtas on Friday', { type: 'draft', draft: 'task', due: true, client: true }],
  ['remind me to send the revised quote to Kiran Joshi tomorrow', { type: 'draft', draft: 'task', due: true, client: true }],
  ['note that Mrs Mehta prefers WhatsApp', { type: 'draft', draft: 'note', client: true }],
  ['what did I note about the Mehtas?', { type: 'table', tool: 'my_notes' }],
  // not data
  ['how do I log a site visit?', { type: 'text', text: /site visit/i }],
  ['how is payroll worked out?', { type: 'text', text: /days/i }],
  ['mark the Mehta invoice paid', { type: 'draft', draft: 'action', action: 'mark_invoice_paid' }],
  ['run payroll for October', { type: 'text', text: /can't do that one|payroll/i }],
  // actions (a card only; nothing is saved: dry mode, and the card needs Save)
  ['add a new client Anita Desai, 98250 12345', { type: 'draft', draft: 'action', action: 'add_client' }],
  ['new client: Rohan Shah', { type: 'draft', draft: 'action', action: 'add_client' }],
  ['log a call with Kiran Joshi, wants walnut veneer on the wardrobe', { type: 'draft', draft: 'action', action: 'log_conversation' }],
  ['spoke to the Mehtas, they approved the dining table drawing', { type: 'draft', draft: 'action', action: 'log_conversation' }],
  ['add a task for the office to collect the Northbridge cheque by Monday', { type: 'draft', draft: 'action', action: 'add_task' }],
  ['the Northbridge cheque task is done', { type: 'draft', draft: 'action', action: 'complete_task' }],
  ['start a new project for Greenleaf Montessori: classroom storage', { type: 'draft', draft: 'action', action: 'add_project' }],
  ['add a milestone to the Brewnest cafe: final snag list by the 20th', { type: 'draft', draft: 'action', action: 'add_milestone' }],
  ['mark the Joshi kitchen carcass install milestone done', { type: 'draft', draft: 'action', action: 'complete_milestone' }],
  ['log a site visit to the Mehta bungalow today, false ceiling checked', { type: 'draft', draft: 'action', action: 'log_site_visit' }],
  ['add a workshop order for 2 study tables for the Joshi apartment', { type: 'draft', draft: 'action', action: 'add_order' }],
  ['the Brewnest counter order is delivered', { type: 'draft', draft: 'action', action: 'set_order_status' }],
  ['move the dining table order to in progress', { type: 'draft', draft: 'action', action: 'set_order_status' }],
  ['Ramesh is absent today', { type: 'draft', draft: 'action', action: 'mark_attendance' }],
  ['mark Suresh half day', { type: 'draft', draft: 'action', action: 'mark_attendance' }],
  ['gave Imran an advance of 2000', { type: 'draft', draft: 'action', action: 'add_expense' }],
  ['received 50,000 cash from Brewnest', { type: 'draft', draft: 'action', action: 'cash_entry' }],
  ['paid 800 cash to Sardar Transport for freight', { type: 'draft', draft: 'action', action: 'cash_entry' }],
  ['make a quote for Vikram Rathod for the farmhouse living room', { type: 'draft', draft: 'action', action: 'new_quote' }],
  ['send the Rathod quote', { type: 'draft', draft: 'action', action: 'send_quote' }],
  ['Greenleaf accepted our quotation', { type: 'draft', draft: 'action', action: 'accept_quote' }],
  ['the Joshi study unit quote is lost, they went elsewhere', { type: 'draft', draft: 'action', action: 'decline_quote' }],
  ['revise the Greenleaf quote', { type: 'draft', draft: 'action', action: 'revise_quote' }],
  ['Northbridge has paid their invoice', { type: 'draft', draft: 'action', action: 'mark_invoice_paid' }],
  ['add a new supplier Shree Hardware for hinges', { type: 'draft', draft: 'action', action: 'add_vendor' }],
  ['place a PO with the plywood vendor for 30 sheets', { type: 'draft', draft: 'action', action: 'add_vendor_po' }],
  ['12 sheets of plywood arrived today against the PO', { type: 'draft', draft: 'action', action: 'record_delivery' }],
  ['Sardar Transport charged 1800 for Vatva to Bodakdev', { type: 'draft', draft: 'action', action: 'add_freight' }],
  ['move the Northbridge cheque task to next Friday', { type: 'draft', draft: 'action', action: 'reschedule_task' }],
  ['push the Brewnest opening milestone to the 30th', { type: 'draft', draft: 'action', action: 'reschedule_milestone' }],
  ['delete the glass delivery task', { type: 'draft', draft: 'action', action: 'delete_task' }],
  ['what is the value of our stock?', { type: 'text', text: /stock/i }],
  ['hello', { type: 'text', text: /^Hi/ }],
  ['write me a poem about chairs', { type: 'text', text: /only help/i }],
];

// EVAL_ONLY=<regex>: run just the matching questions.
const only = process.env.EVAL_ONLY ? new RegExp(process.env.EVAL_ONLY, 'i') : null;
if (only) CASES.splice(0, CASES.length, ...CASES.filter(([q]) => only.test(q)));
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
  if (want.second && !(r.cards || []).some((c) => c.tool === want.second)) fails.push(`second ${(r.cards || []).map((c) => c.tool)}`);
  if (want.compare && !String(r.toolLabel).includes('comparison')) fails.push('no comparison');
  if (want.text && !want.text.test(r.text || '')) fails.push(`text "${String(r.text).slice(0, 60)}"`);
  if (want.draft && r.draft?.kind !== want.draft) fails.push(`draft ${r.draft?.kind}`);
  if (want.action && r.draft?.action !== want.action) fails.push(`action ${r.draft?.action}`);
  if (want.due && !r.draft?.due) fails.push('no due date');
  if (want.client && !r.draft?.client) fails.push('no client');
  if (!fails.length) pass++;
  console.log(`${fails.length ? 'FAIL' : 'ok  '}  ${q}${fails.length ? `\n      ${fails.join('; ')}\n      ${(d.meta?.trace || []).join(' | ')}` : `  →  ${r.draft ? JSON.stringify(r.draft) : r.summary || String(r.text).slice(0, 70)}`}`);
}
console.log(`\n${pass}/${CASES.length} passed`);
process.exit(pass === CASES.length ? 0 : 1);
