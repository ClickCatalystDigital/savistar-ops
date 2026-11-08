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
  ["Kiran Joshi's new number is 98250 99999", { type: 'draft', draft: 'action', action: 'edit_client' }],
  ['put the Trivedi clinic on hold', { type: 'draft', draft: 'action', action: 'set_project_status' }],
  ['the Kapadia living room is completed', { type: 'draft', draft: 'action', action: 'set_project_status' }],
  ['add a new carpenter Mahesh Solanki, 850 a day', { type: 'draft', draft: 'action', action: 'add_employee' }],
  ["raise Ramesh's rate to 950", { type: 'draft', draft: 'action', action: 'set_pay_rate' }],
  ['Javed has left the workshop', { type: 'draft', draft: 'action', action: 'employee_left' }],
  ['Ramesh worked on the cafe counter today, fluting done', { type: 'draft', draft: 'action', action: 'log_work' }],
  ['agreed rate with Sardar Transport for Vatva to Satellite is 1400', { type: 'draft', draft: 'action', action: 'add_vendor_rate' }],
  ['cancel the edge band PO', { type: 'draft', draft: 'action', action: 'cancel_po' }],
  ['raise the next stage invoice for the Mehta loose furniture quote', { type: 'draft', draft: 'action', action: 'raise_stage_invoice' }],
  ['delete the low activity tables order, it was entered by mistake', { type: 'draft', draft: 'action', action: 'delete_order' }],
  ['remove the Trivedi approval milestone', { type: 'draft', draft: 'action', action: 'delete_milestone' }],
  ['what is the value of our stock?', { type: 'text', text: /stock/i }],
  ['hello', { type: 'text', text: /^Hi/ }],
  ['write me a poem about chairs', { type: 'text', text: /only help/i }],
];

// Conversations, turn by turn, the way the chat widget sends them: the last six messages (replies as their text) and
// the last table's context, kept across text replies. The Atelier episodes, plus follow-ups that must carry over.
const P = { mehta: 'Project=Mehta bungalow — full interiors', brew: 'Project=Brewnest cafe, Sindhu Bhavan Road', joshi: 'Project=Joshi apartment — kitchen and wardrobes', kap: 'Project=Kapadia living room', north: 'Project=Northbridge office fit-out, 40 seats' };
const CHAINS = [
  ['Ep 1 profit', [['Which projects are most profitable?', { tool: 'project_profit', notSum: /100%|costs incomplete/ }], ['Did Northbridge make money?', { tool: 'project_profit', has: [P.north] }], ['what about the Kapadia living room?', { tool: 'project_profit', has: [P.kap] }]]],
  ['Ep 1 pronoun', [['How is the Mehta bungalow going?', { tool: 'project_overview', has: [P.mehta] }], ['Did it make money?', { tool: 'project_profit', has: [P.mehta] }]]],
  ['Ep 2 receivables', [['Who owes us money?', { tool: 'outstanding_invoices', sum: /past due/ }]]],
  ['Ep 3 quotes', [['Which quotations are still waiting for a reply?', { tool: 'open_quotes', sum: /waiting for a reply/ }], ['How many quotes did we win this month?', { tool: 'quotes_won' }], ['and last month?', { tool: 'quotes_won', has: ['Period=Last month'] }]]],
  ['Ep 4 delays', [['Which milestones are overdue?', { tool: 'milestones' }], ['How is the Brewnest cafe going?', { tool: 'project_overview', has: [P.brew] }]]],
  ['Ep 5 materials', [['What material is still to come for the Mehta bungalow?', { tool: 'vendor_pos', has: [P.mehta] }], ['What about Brewnest Cafe?', { tool: 'vendor_pos', has: [P.brew] }], ['Which workshop orders are late?', { tool: 'orders' }]]],
  ['context survives a text turn', [['What material is still to come for Brewnest?', { tool: 'vendor_pos', has: [P.brew] }], ['thanks', { type: 'text' }], ['and for the Joshi apartment?', { tool: 'vendor_pos', has: [P.joshi] }]]],
  ['Ep 6 on time', [['Are we delivering workshop orders on time?', { tool: 'turnaround' }]]],
  ['Ep 7 quiet clients', [["Which clients haven't we spoken to in two weeks?", { tool: 'quiet_clients' }], ['Remind me to call Kiran Joshi on Friday', { type: 'draft', draft: 'task', due: true, client: true }]]],
  ['Ep 8 stage invoice', [['Raise the next stage invoice for the Mehta loose furniture quote', { type: 'draft', draft: 'action', action: 'raise_stage_invoice' }]]],
  ['Ep 9 freight', [['Did a transporter charge us above the rate card?', { tool: 'freight_overcharges' }]]],
  ['Ep 10 billing', [['How much did we bill this month, and how much GST?', { tool: 'invoiced', notSum: /Nothing invoiced/ }], ['How did billing this month compare with last month?', { tool: 'invoiced', compare: true }]]],
];

// Every Cue Card (app/cue-cards, lib/cue-cards.js) is a promise that the prompt works: ask each one too.
const cue = await fetch(`${BASE}/api/assistant/cue-cards`, { headers: { cookie } }).then((r) => r.json()).catch(() => null);
for (const c of cue?.cards || []) if (!CASES.some(([q]) => q.toLowerCase() === c.q.toLowerCase())) CASES.push([c.q, c.expect]);
// EVAL_ONLY=<regex>: run just the matching questions.
const only = process.env.EVAL_ONLY ? new RegExp(process.env.EVAL_ONLY, 'i') : null;
if (only) CASES.splice(0, CASES.length, ...CASES.filter(([q]) => only.test(q)));
let pass = 0, total = CASES.length;
// What went wrong with one reply, against what we expected of it.
function check(res, d, want) {
  const r = d.reply || {};
  const params = (r.params || []).map((p) => `${p.label}=${p.value}`);
  const fails = [];
  if (!res.ok) fails.push(`HTTP ${res.status} ${d.error}`);
  if (want.type && r.type !== want.type) fails.push(`type ${r.type}`);
  if (want.tool && r.tool !== want.tool) fails.push(`tool ${r.tool}`);
  for (const h of want.has || []) if (!params.some((p) => (h.endsWith('=') ? p.startsWith(h) : p === h))) fails.push(`missing ${h} (got ${params.join(', ') || 'none'})`);
  if (want.sum && !want.sum.test(r.summary || '')) fails.push(`summary "${String(r.summary).slice(0, 80)}"`);
  if (want.notSum && want.notSum.test(r.summary || '')) fails.push(`summary says ${want.notSum}: "${String(r.summary).slice(0, 120)}"`);
  if (want.second && !(r.cards || []).some((c) => c.tool === want.second)) fails.push(`second ${(r.cards || []).map((c) => c.tool)}`);
  if (want.compare && !String(r.toolLabel).includes('comparison')) fails.push('no comparison');
  if (want.text && !want.text.test(r.text || '')) fails.push(`text "${String(r.text).slice(0, 60)}"`);
  if (want.draft && r.draft?.kind !== want.draft) fails.push(`draft ${r.draft?.kind}`);
  if (want.action && r.draft?.action !== want.action) fails.push(`action ${r.draft?.action}`);
  if (want.due && !r.draft?.due) fails.push('no due date');
  if (want.client && !r.draft?.client) fails.push('no client');
  return fails;
}
const show = (q, fails, d) => { const r = d.reply || {}; console.log(`${fails.length ? 'FAIL' : 'ok  '}  ${q}${fails.length ? `\n      ${fails.join('; ')}\n      ${(d.meta?.trace || []).join(' | ')}` : `  →  ${r.draft ? JSON.stringify(r.draft) : r.summary || String(r.text).slice(0, 70)}`}`); };
const onlyChains = only ? CHAINS.filter(([name, turns]) => only.test(name) || turns.some(([q]) => only.test(q))) : CHAINS;
for (const [name, turns] of onlyChains) {
  console.log(`\n— ${name}`);
  const history = []; let context = null;
  for (const [q, want] of turns) {
    history.push({ role: 'user', content: q });
    const res = await fetch(`${BASE}/api/assistant/chat`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ dry: true, messages: history.slice(-6), context }) });
    const d = await res.json();
    const r = d.reply || {};
    history.push({ role: 'assistant', content: r.summary || r.text || 'ok' });
    if (r.type === 'table') context = r.context ?? null;
    const fails = check(res, d, want);
    total++; if (!fails.length) pass++;
    show(`  ${q}`, fails, d);
  }
}
console.log('\n— single questions');
for (const [q, want, prev] of CASES) {
  const messages = prev ? [{ role: 'user', content: prev[0] }, { role: 'assistant', content: 'ok' }, { role: 'user', content: q }] : [{ role: 'user', content: q }];
  let context = null;
  if (prev) { // build real context by asking the previous question first
    const r0 = await fetch(`${BASE}/api/assistant/chat`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ dry: true, messages: [{ role: 'user', content: prev[0] }] }) }).then((r) => r.json());
    context = r0.reply?.context || null;
  }
  const res = await fetch(`${BASE}/api/assistant/chat`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ dry: true, messages, context }) });
  const d = await res.json();
  const fails = check(res, d, want);
  if (!fails.length) pass++;
  show(q, fails, d);
}
console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
