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
  ['today', X, 'Reopen the {done_task} task', act('reopen_task')],
  ['today', X, 'Give the {task} task to {user}', act('assign_task')],
  ['today', X, 'Delete the {task} task', act('delete_task')],

  ['clients', D, 'When did we last talk to {client}?', tool('client_contact')],
  ["clients", D, "Which clients haven't we spoken to in a while?", tool('quiet_clients')],
  ['clients', D, "Which clients haven't we spoken to in two weeks?", tool('quiet_clients')],
  ['clients', X, `Add a new client ${US ? 'Emily Ross' : 'Anita Desai'}, ${PHONE}`, act('add_client')],
  ['clients', X, 'Log a call with {client}: they approved the drawings', act('log_conversation')],
  ['clients', X, `{client}'s new number is ${PHONE2}`, act('edit_client')],
  ['clients', X, 'Delete the client {client}, added by mistake', act('delete_client')],

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
  ['projects', X, 'Start a new project for {client}: master bedroom', act('add_project')],
  ['projects', X, 'Move the {milestone} milestone to next Friday', act('reschedule_milestone')],
  ['projects', X, 'Delete the {milestone} milestone', act('delete_milestone')],
  ['projects', X, 'Delete the site visit to {visit_project}', act('delete_site_visit')],
  ['projects', X, 'Delete the project {project}, added by mistake', act('delete_project')],

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
  ['quotes', X, '{quote_client} said no to our quote', act('decline_quote')],
  ['quotes', X, 'Delete the {quote_client} quotation, made by mistake', act('delete_quote')],
  ['quotes', X, `Make an invoice for {client} for site measurement, ${US ? '500' : '5000'}`, act('add_invoice')],
  ['quotes', X, 'Delete the unpaid {invoice_client} invoice', act('delete_invoice')],

  ['workshop', D, 'Which workshop orders are late?', tool('orders')],
  ['workshop', D, 'Orders due this week', tool('orders')],
  ['workshop', D, 'Are we delivering orders on time?', tool('turnaround')],
  ['workshop', D, 'Who worked on the {order}?', tool('order_history')],
  ['workshop', X, 'Add a workshop order for 2 study tables for {project}', act('add_order')],
  ['workshop', X, 'The {order} order is done', act('set_order_status')],
  ['workshop', X, 'Move the {order} order to next Saturday', act('reschedule_order')],
  ['workshop', X, 'Delete the {order} order, it was entered by mistake', act('delete_order')],

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
  ['people', X, `Raise {employee}'s rate to ${US ? '240' : '950'} a day`, act('set_pay_rate')],
  ['people', X, '{employee} has left the workshop', act('employee_left')],
  ['people', X, "Record {employee}'s pay for last month as paid", act('record_payroll')],
  ['people', X, "Delete {adv_employee}'s advance, it was a mistake", act('delete_expense')],
  ['people', X, "Delete {log_employee}'s work log for {log_work}", act('delete_work_log')],
  ['people', X, 'Delete the employee {employee}, added by mistake', act('delete_employee')],

  ['money', D, 'How much money do we have?', tool('money_position')],
  ['money', D, 'What is the cash balance?', tool('cash')],
  ['money', D, 'Cash this month compared to last month', tool('cash')],
  ['money', D, 'How much cash came in and went out this month?', tool('cash')],
  ...(US ? [] : [['money', D, 'Kitna paisa aaya is mahine?', tool('cash')]]),
  ['money', D, 'What is our bank balance?', tool('bank_balance')],
  ['money', D, 'What were the biggest debits from the bank last month?', tool('bank_transactions')],
  ['money', X, 'Received 50,000 cash from {client}', act('cash_entry')],
  ['money', X, 'Paid 800 cash to {transporter} for freight', act('cash_entry')],
  ['money', X, `Correct the {cash_desc} cash entry to ${US ? '75' : '750'}`, act('edit_cash_entry')],
  ['money', X, 'Delete the {cash_desc} cash entry', act('delete_cash_entry')],

  ['vendors', D, 'What material is still to be delivered?', tool('vendor_pos')],
  ['vendors', D, 'What material is still to come for {project}?', tool('vendor_pos')],
  ['vendors', D, 'How much have we spent with vendors?', tool('vendor_spend')],
  ['vendors', D, 'Did {transporter} overcharge us?', tool('freight_overcharges')],
  ['vendors', X, 'Place a PO with {vendor} for 30 sheets', act('add_vendor_po')],
  ['vendors', X, 'Add a new supplier Shree Hardware for hinges', act('add_vendor')],
  ['vendors', X, '10 {po_item} delivered today', act('record_delivery')],
  ['vendors', X, 'Returned 2 {delivered_item} to the vendor, damaged', act('record_return')],
  ['vendors', X, `Change the {po_item} PO rate to ${US ? '65' : '2600'}`, act('edit_po')],
  ['vendors', X, 'Cancel the {po_item} PO', act('cancel_po')],
  ['vendors', X, 'Delete the {po_item} PO, entered by mistake', act('delete_po')],
  ['vendors', X, `{transporter} charged ${US ? '180' : '1800'} for a trip from {route}`, act('add_freight')],
  ['vendors', X, `Agreed rate with {transporter} from {route} is ${US ? '140' : '1400'}`, act('add_vendor_rate')],
  ['vendors', X, 'Delete the {route} rate for {transporter}', act('delete_vendor_rate')],
  ['vendors', X, 'Delete the {transporter} freight bill from {freight_route}', act('delete_freight')],
  ['vendors', X, `New phone number for {vendor}: ${PHONE2}`, act('edit_vendor')],
  ['vendors', X, 'Delete the vendor {vendor}, added by mistake', act('delete_vendor')],
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
  done_task: "SELECT title AS v FROM tasks WHERE status = 'done' AND is_deleted_record = 0 ORDER BY length(title) LIMIT 1",
  user: "SELECT COALESCE(display_name, username) AS v FROM users WHERE role = 'user' AND active = 1 ORDER BY id LIMIT 1",
  visit_project: `SELECT p.name AS v FROM site_visits x JOIN projects p ON p.id = x.project_id WHERE x.is_deleted_record = 0 AND p.is_deleted_record = 0
    ORDER BY x.visit_date DESC LIMIT 1`,
  adv_employee: `SELECT e.name AS v FROM employee_expenses x JOIN employees e ON e.id = x.employee_id WHERE x.kind = 'advance' AND x.is_deleted_record = 0
    AND e.is_deleted_record = 0 ORDER BY x.id DESC LIMIT 1`,
  // The same work log for both slots: its employee and what was done.
  log_employee: `SELECT e.name AS v FROM work_logs x JOIN employees e ON e.id = x.employee_id WHERE x.is_deleted_record = 0 AND x.description IS NOT NULL ORDER BY x.id DESC LIMIT 1`,
  log_work: 'SELECT x.description AS v FROM work_logs x JOIN employees e ON e.id = x.employee_id WHERE x.is_deleted_record = 0 AND x.description IS NOT NULL ORDER BY x.id DESC LIMIT 1',
  cash_desc: "SELECT description AS v FROM cash_transactions WHERE is_deleted_record = 0 AND description IS NOT NULL AND created_by IS NOT NULL ORDER BY id DESC LIMIT 1",
  po_item: "SELECT item AS v FROM vendor_pos WHERE status NOT IN ('cancelled', 'complete', 'received') AND is_deleted_record = 0 ORDER BY id DESC LIMIT 1",
  delivered_item: `SELECT po.item AS v FROM vendor_pos po WHERE po.status != 'cancelled' AND po.is_deleted_record = 0
    AND EXISTS (SELECT 1 FROM vendor_deliveries d WHERE d.vendor_po_id = po.id AND d.qty_delivered > 0 AND d.is_deleted_record = 0) ORDER BY po.id DESC LIMIT 1`,
  // Routes of the {transporter} above.
  route: "SELECT from_loc || ' to ' || to_loc AS v FROM vendor_rates WHERE is_deleted_record = 0 AND vendor_id = (SELECT v.id FROM vendors v JOIN freight_charges f ON f.vendor_id = v.id WHERE v.is_deleted_record = 0 ORDER BY v.id LIMIT 1) ORDER BY id LIMIT 1",
  freight_route: "SELECT from_loc || ' to ' || to_loc AS v FROM freight_charges WHERE is_deleted_record = 0 AND vendor_id = (SELECT v.id FROM vendors v JOIN freight_charges f ON f.vendor_id = v.id WHERE v.is_deleted_record = 0 ORDER BY v.id LIMIT 1) ORDER BY id DESC LIMIT 1",
};

// How a record reads in a sentence: the part before " — " or a comma ("Mehta bungalow — full interiors" → "Mehta bungalow"),
// and a person's first name.
const short = (slot, v) => {
  const s = String(v).split(' — ')[0].split(',')[0].trim();
  if (['employee', 'adv_employee', 'log_employee', 'user'].includes(slot)) return s.split(' ')[0];
  // things (a task, a milestone, an order's item) sit mid-sentence: "the dining table order"
  return ['task', 'done_task', 'milestone', 'order', 'po_item', 'delivered_item', 'log_work', 'cash_desc'].includes(slot) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
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
