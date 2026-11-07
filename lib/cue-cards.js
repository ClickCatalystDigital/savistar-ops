// Cue Cards (/cue-cards): the prompts Atelier AI understands, by area and by level. Each card names what it should
// trigger (`expect`), and scripts/assistant-eval.mjs asks every card through the real pipeline, so a card on the page
// is one that works. {slots} are filled from this system's own records (fillCards), so the cards read right on any
// deployment: the demo, the US demo or a client's live data. A card whose record doesn't exist here is left out.
import { queryOne } from './db';

// The capability ladder. Predict and Optimize are built separately and shown as coming.
export const LEVELS = [
  { key: 'know', n: 1, label: 'Know', blurb: 'Explains how the app and the studio’s processes work.', status: 'live' },
  { key: 'diagnose', n: 2, label: 'Diagnose', blurb: 'Reads your records and points out what needs attention. Every number comes straight from the data.', status: 'live' },
  { key: 'predict', n: 3, label: 'Predict', blurb: 'Forecasts risks, costs, delays and outcomes.', status: 'soon' },
  { key: 'optimize', n: 4, label: 'Optimize', blurb: 'Recommends decisions and trade-offs.', status: 'soon' },
  { key: 'execute', n: 5, label: 'Execute', blurb: 'Makes everyday changes for you. Each one shows as a card first and is saved only when you press Save.', status: 'live' },
];

export const AREAS = [
  { key: 'today', label: 'Today' },
  { key: 'clients', label: 'Clients' },
  { key: 'projects', label: 'Projects' },
  { key: 'quotes', label: 'Quotes & invoices' },
  { key: 'workshop', label: 'Workshop' },
  { key: 'people', label: 'People' },
  { key: 'money', label: 'Money' },
  { key: 'vendors', label: 'Vendors' },
];

const K = 'know', D = 'diagnose', X = 'execute';
// The US build (NEXT_PUBLIC_MARKET=NA) leaves out the Hindi cards and uses a US phone number.
const US = process.env.NEXT_PUBLIC_MARKET === 'NA';
const PHONE = US ? '(512) 555-0142' : '98250 12345', PHONE2 = US ? '(512) 555-0199' : '98250 99999';
const text = { type: 'text' };
const tool = (t) => ({ type: 'table', tool: t });
const act = (a) => ({ type: 'draft', draft: 'action', action: a });

// [area, level, prompt, expect]
export const CARDS = [
  ['today', D, "What's overdue?", tool('tasks')],
  ['today', D, 'What do I have today?', tool('calendar')],
  ['today', D, 'Anything due tomorrow?', tool('calendar')],
  ['today', X, 'Add a task for the office to call {client} by Monday', act('add_task')],
  ['today', X, 'Remind me to call {client} on Friday', { type: 'draft', draft: 'task' }],
  ['today', X, 'Move the {task} task to next Friday', act('reschedule_task')],
  ['today', X, 'The {task} task is done', act('complete_task')],

  ['clients', D, 'When did we last talk to {client}?', tool('client_contact')],
  ["clients", D, "Which clients haven't we spoken to in a while?", tool('quiet_clients')],
  ['clients', D, "Which clients haven't we spoken to in two weeks?", tool('quiet_clients')],
  ['clients', X, `Add a new client ${US ? 'Emily Ross' : 'Anita Desai'}, ${PHONE}`, act('add_client')],
  ['clients', X, 'Log a call with {client}: they approved the drawings', act('log_conversation')],
  ['clients', X, `{client}'s new number is ${PHONE2}`, act('edit_client')],

  ['projects', D, 'How are the projects doing?', tool('projects')],
  ['projects', D, 'How is {project} going?', tool('project_overview')],
  ['projects', D, 'Which milestones are overdue?', tool('milestones')],
  ['projects', D, 'Site visits last month', tool('site_visits')],
  ['projects', D, 'Which projects are most profitable?', tool('project_profit')],
  ['projects', D, 'Did {project} make money?', tool('project_profit')],
  ...(US ? [] : [['projects', D, '{project} ka kaam kaha tak pahucha?', tool('project_overview')]]),
  ['projects', D, 'When did we last visit {project}?', tool('site_visits')],
  ['projects', K, 'How do I log a site visit?', text],
  ['projects', X, 'Log a site visit to {project} today: false ceiling checked', act('log_site_visit')],
  ['projects', X, 'Add a milestone to {project}: final snag list by the 20th', act('add_milestone')],
  ['projects', X, 'Mark the {milestone} milestone done', act('complete_milestone')],
  ['projects', X, 'Put {project} on hold', act('set_project_status')],

  ['quotes', D, 'Which quotes are still open?', tool('open_quotes')],
  ['quotes', D, 'Which quotes did we win this month?', tool('quotes_won')],
  ['quotes', D, 'Who owes us money?', tool('outstanding_invoices')],
  ['quotes', D, 'How much did we invoice last month?', tool('invoiced')],
  ['quotes', D, 'Which quotations are still waiting for a reply?', tool('open_quotes')],
  ['quotes', D, 'How much did we bill this month, and how much GST?', tool('invoiced')],
  ['quotes', D, 'How did billing this month compare with last month?', tool('invoiced')],
  ['quotes', K, 'How do I make a quotation?', text],
  ['quotes', X, 'Make a quote for {client}', act('new_quote')],
  ['quotes', X, 'Send the {quote_client} quote', act('send_quote')],
  ['quotes', X, '{quote_client} accepted our quote', act('accept_quote')],
  ['quotes', X, 'Revise the {quote_client} quote', act('revise_quote')],
  ['quotes', X, 'Raise the next stage invoice for the {won_client} quote', act('raise_stage_invoice')],
  ['quotes', X, '{invoice_client} has paid their invoice', act('mark_invoice_paid')],

  ['workshop', D, 'Which workshop orders are late?', tool('orders')],
  ['workshop', D, 'Orders due this week', tool('orders')],
  ['workshop', D, 'Are we delivering orders on time?', tool('turnaround')],
  ['workshop', D, 'Who worked on the {order}?', tool('order_history')],
  ['workshop', X, 'Add a workshop order for 2 study tables for {project}', act('add_order')],
  ['workshop', X, 'The {order} order is done', act('set_order_status')],

  ['people', D, 'Who is in today?', tool('attendance')],
  ['people', D, 'How many days did {employee} work this month?', tool('days_worked')],
  ['people', D, 'Payroll for last month', tool('payroll')],
  ['people', D, 'Advances not recovered yet', tool('advances')],
  ['people', D, 'Who is doing the best work?', tool('work_ratings')],
  ['people', K, 'How is payroll worked out?', text],
  ['people', X, '{employee} is absent today', act('mark_attendance')],
  ['people', X, 'Gave {employee} an advance of 2000', act('add_expense')],
  ['people', X, '{employee} worked on the {order} today', act('log_work')],
  ['people', X, 'Add a new carpenter Mahesh Solanki, 850 a day', act('add_employee')],

  ['money', D, 'How much money do we have?', tool('money_position')],
  ['money', D, 'What is the cash balance?', tool('cash')],
  ['money', D, 'Cash this month compared to last month', tool('cash')],
  ['money', D, 'How much cash came in and went out this month?', tool('cash')],
  ...(US ? [] : [['money', D, 'Kitna paisa aaya is mahine?', tool('cash')]]),
  ['money', D, 'What is our bank balance?', tool('bank_balance')],
  ['money', D, 'What were the biggest debits from the bank last month?', tool('bank_transactions')],
  ['money', X, 'Received 50,000 cash from {client}', act('cash_entry')],
  ['money', X, 'Paid 800 cash to {transporter} for freight', act('cash_entry')],

  ['vendors', D, 'What material is still to be delivered?', tool('vendor_pos')],
  ['vendors', D, 'What material is still to come for {project}?', tool('vendor_pos')],
  ['vendors', D, 'How much have we spent with vendors?', tool('vendor_spend')],
  ['vendors', D, 'Did {transporter} overcharge us?', tool('freight_overcharges')],
  ['vendors', X, 'Place a PO with {vendor} for 30 sheets', act('add_vendor_po')],
  ['vendors', X, 'Add a new supplier Shree Hardware for hinges', act('add_vendor')],
].map(([area, level, q, expect]) => ({ area, level, q, expect }));

// One real record per slot, the kind each card needs (an active project, an open quote's client…).
const SLOT_SQL = {
  client: `SELECT c.name AS v FROM clients c JOIN projects p ON p.client_id = c.id AND p.status = 'active' AND p.is_deleted_record = 0
    WHERE c.is_deleted_record = 0 ORDER BY p.id LIMIT 1`,
  project: "SELECT name AS v FROM projects WHERE status = 'active' AND is_deleted_record = 0 ORDER BY id LIMIT 1",
  milestone: `SELECT m.title AS v FROM milestones m JOIN projects p ON p.id = m.project_id AND p.status = 'active'
    WHERE m.status != 'done' AND m.is_deleted_record = 0 ORDER BY length(m.title) LIMIT 1`,
  task: "SELECT title AS v FROM tasks WHERE status = 'open' AND is_deleted_record = 0 ORDER BY length(title) LIMIT 1",
  order: "SELECT item AS v FROM orders WHERE status IN ('pending', 'in_progress') AND is_deleted_record = 0 ORDER BY length(item) LIMIT 1",
  employee: "SELECT name AS v FROM employees WHERE active = 1 AND is_deleted_record = 0 ORDER BY id LIMIT 1",
  vendor: `SELECT v.name AS v FROM vendors v WHERE v.is_deleted_record = 0
    AND NOT EXISTS (SELECT 1 FROM freight_charges f WHERE f.vendor_id = v.id) ORDER BY v.id LIMIT 1`,
  transporter: 'SELECT v.name AS v FROM vendors v JOIN freight_charges f ON f.vendor_id = v.id WHERE v.is_deleted_record = 0 ORDER BY v.id LIMIT 1',
  quote_client: `SELECT c.name AS v FROM quotations q JOIN clients c ON c.id = q.client_id
    WHERE q.status IN ('draft', 'sent') AND q.is_deleted_record = 0 ORDER BY q.id DESC LIMIT 1`,
  won_client: `SELECT c.name AS v FROM quotations q JOIN clients c ON c.id = q.client_id WHERE q.status = 'accepted' AND q.is_deleted_record = 0
    AND EXISTS (SELECT 1 FROM quotation_stages s WHERE s.quotation_id = q.id AND s.invoice_id IS NULL AND s.is_deleted_record = 0) ORDER BY q.id DESC LIMIT 1`,
  invoice_client: "SELECT c.name AS v FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.status != 'paid' AND i.is_deleted_record = 0 ORDER BY i.id LIMIT 1",
};

// How a record reads in a sentence: the part before " — " or a comma ("Mehta bungalow — full interiors" → "Mehta bungalow"),
// and a person's first name.
const short = (slot, v) => {
  const s = String(v).split(' — ')[0].split(',')[0].trim();
  if (slot === 'employee') return s.split(' ')[0];
  // things (a task, a milestone, an order's item) sit mid-sentence: "the dining table order"
  return ['task', 'milestone', 'order'].includes(slot) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
};

export async function fillCards() {
  const values = {};
  for (const [slot, sql] of Object.entries(SLOT_SQL)) {
    const r = await queryOne(sql).catch(() => null);
    if (r?.v) values[slot] = short(slot, r.v);
  }
  const out = [];
  for (const c of CARDS) {
    const slots = [...c.q.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (slots.some((s) => !values[s])) continue;
    out.push({ ...c, q: c.q.replace(/\{(\w+)\}/g, (_, s) => values[s]) });
  }
  return out;
}
