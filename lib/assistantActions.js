// What the assistant (chat and MCP) may do, one entry per task. Each action is a plain description of an existing API
// route: the same request the screen sends, so the route's own checks (who may, what is valid, QuickBooks sync, the demo
// rules) decide, and nothing about permissions is written twice. lib/actionRunner.js runs them; the chat turns a message
// into a card (fill), MCP passes fields in (check). Every write is confirmed first: a card in chat, propose/confirm in MCP.
import * as E from './assistantEntities.js';
import { queryOne, queryAll } from './db.js';
import { todayIST } from './assistant.js';
import { BRAND } from './brand.js';
import { US, TAX, w } from './market.js';

const field = (name, label, type = 'text', extra = {}) => ({ name, label, type, required: false, ...extra });
const need = (f) => ({ ...f, required: true });
const ref = (name, label, kind, required = true) => ({ name, label, type: 'ref', ref: kind, required });
const today = (name = 'date', label = 'Date') => field(name, label, 'date', { default: 'today', required: true });

const TRADES_RE = /\b(carpenters?|painters?|polish(er|ers|wala)?|helpers?|electricians?|plumbers?|supervisors?|fitters?|welders?|masons?|designers?|drivers?|labou?rers?)\b/i;
// This month's payroll row for one employee, from the payroll route itself (days × rate − advances, as on People → Payroll).
async function payrollRow(employee, period) {
  const { GET } = await import('../app/api/payroll/route.js');
  const { rows } = await (await GET(new Request(`http://assistant.local/api/payroll?period=${period}`))).json();
  return rows.find((r) => r.id === Number(employee)) || null;
}
// Start from the stored record and change only the fields given (the route saves the whole record).
async function edited(table, id, v, names, what) {
  const row = await queryOne(`SELECT * FROM ${table} WHERE id = ? AND is_deleted_record = 0`, [id]);
  if (!row) throw new Error(`That ${what} no longer exists`);
  const given = names.filter((n) => v[n] != null && v[n] !== '');
  if (!given.length) throw new Error(`Give what to change: ${names.join(', ').replace(/_/g, ' ')}`);
  return { ...row, ...Object.fromEntries(given.map((n) => [n, v[n]])) };
}

const ORDER_STATUS = [
  { value: 'pending', label: 'Pending', words: /\bpending|not started|queued\b/i },
  { value: 'in_progress', label: 'In progress', words: /\bin[ _-]?progress|started|working on|on the floor\b/i },
  { value: 'done', label: 'Done', words: /\b(done|ready|finished|complete[d]?)\b/i },
  { value: 'delivered', label: 'Delivered', words: /\bdelivered|dispatched\b/i },
  { value: 'cancelled', label: 'Cancelled', words: /\bcancell?ed|cancel\b/i },
];

export const ACTIONS = [
  { key: 'add_client', about: 'Add a new client (a person or company) to the client list, with a phone or email if given.', risk: 'create',
    strip: /^(please )?(add|create|new)( a)?( new)? client(:| called| named)?/i,
    fields: [need(field('name', 'Name', 'text', { cut: true })), field('phone', 'Phone', 'phone'), field('email', 'Email', 'email')],
    request: (v) => ({ method: 'POST', path: '/api/clients', body: { name: v.name, phone: v.phone || null, email: v.email || null } }),
    summary: (v) => `Add client ${v.name}`, link: (r) => `/clients/${r.id}` },

  { key: 'log_conversation', about: 'Log a conversation, call or meeting with a client: what was discussed or agreed.', risk: 'create',
    strip: /^(please )?(log|note|record|add)( a)? (call|conversation|meeting|chat)( with)?/i,
    fields: [ref('client', 'Client', 'client'), need(field('body', 'What was said', 'longtext'))],
    request: (v) => ({ method: 'POST', path: `/api/clients/${v.client}/conversations`, body: { body: v.body } }),
    summary: (v, l) => `Log a conversation with ${l.client}`, link: (r, v) => `/clients/${v.client}` },

  { key: 'add_task', about: 'Add a task or to-do for the team (with a due date), not a personal reminder.', risk: 'create',
    strip: /^(please )?(add|create)( a)?( new)? (task|to-?do)( to| for)?/i,
    fields: [need(field('title', 'Task')), field('due_date', 'Due', 'date', { when: 'future', default: 'today', required: true }), ref('client', 'Client', 'client', false)],
    request: (v) => ({ method: 'POST', path: '/api/tasks', body: { title: v.title, due_date: v.due_date, client_id: v.client || null } }),
    summary: (v) => `Add task “${v.title}”`, link: () => '/' },

  { key: 'complete_task', about: 'Mark an open task (a to-do item on the task list) as done.', risk: 'change',
    fields: [ref('task', 'Task', 'task')],
    request: (v) => ({ method: 'PUT', path: `/api/tasks/${v.task}`, body: { status: 'done' } }),
    summary: (v, l) => `Mark task “${l.task}” done`, link: () => '/' },

  { key: 'add_project', about: 'Start a new project for a client.', risk: 'create',
    strip: /^(please )?(add|create|start|open)( a)?( new)? project( for| called| named)?/i,
    fields: [need(field('name', 'Project name')), ref('client', 'Client', 'client', false), today('start_date', 'Start date')],
    request: (v) => ({ method: 'POST', path: '/api/projects', body: { name: v.name, client_id: v.client || null, start_date: v.start_date } }),
    summary: (v) => `Start project ${v.name}`, link: (r) => `/projects/${r.id}` },

  { key: 'add_milestone', about: "Add a milestone (a stage with a due date) to a project's timeline.", risk: 'create',
    strip: /^(please )?(add|create)( a)?( new)? milestone( to| for)?/i,
    fields: [ref('project', 'Project', 'project'), need(field('title', 'Milestone')), field('due_date', 'Due', 'date', { when: 'future' })],
    request: (v) => ({ method: 'POST', path: '/api/milestones', body: { project_id: v.project, title: v.title, due_date: v.due_date || null } }),
    summary: (v, l) => `Add milestone “${v.title}” to ${l.project}`, link: (r, v) => `/projects/${v.project}` },

  { key: 'complete_milestone', about: 'Mark a project milestone as done or completed.', risk: 'change',
    fields: [ref('milestone', 'Milestone', 'milestone')],
    request: (v) => ({ method: 'PUT', path: `/api/milestones/${v.milestone}`, body: { status: 'done' } }),
    summary: (v, l) => `Mark milestone ${l.milestone} done`, link: () => '/projects' },

  { key: 'log_site_visit', about: 'Log a site visit to a project, with notes on what was seen or done.', risk: 'create',
    strip: /^(please )?(log|add|record)( a)? (site )?visit( to| at)?/i,
    fields: [ref('project', 'Project', 'project'), today('visit_date', 'Visit date'), field('notes', 'Notes', 'longtext')],
    request: (v) => ({ method: 'POST', path: '/api/site-visits', body: { project_id: v.project, visit_date: v.visit_date, notes: v.notes || null } }),
    summary: (v, l) => `Log a site visit to ${l.project}`, link: (r, v) => `/projects/${v.project}` },

  { key: 'add_order', about: 'Add a workshop (furniture) order: an item to make, how many, for which project, and when it is due.', risk: 'create',
    strip: /^(please )?(add|create|place)( a)?( new)? (workshop )?order( for)?/i,
    fields: [need(field('item', 'Item')), field('qty', 'Quantity', 'number', { default: 1 }), ref('project', 'Project', 'project', false), field('due_date', 'Due', 'date', { when: 'future' })],
    request: (v) => ({ method: 'POST', path: '/api/orders', body: { item: v.item, qty: Number(v.qty) || 1, project_id: v.project || null, due_date: v.due_date || null } }),
    summary: (v) => `Add workshop order: ${v.qty || 1} × ${v.item}`, link: () => '/orders' },

  { key: 'set_order_status', about: 'Change the status of a workshop order (pending, in progress, done, delivered or cancelled).', risk: 'change',
    fields: [ref('order', 'Order', 'order'), need(field('status', 'New status', 'enum', { options: ORDER_STATUS }))],
    // The order route saves the whole record, so start from what is stored.
    request: async (v) => {
      const o = await queryOne('SELECT * FROM orders WHERE id = ? AND is_deleted_record = 0', [v.order]);
      if (!o) throw new Error('That order no longer exists');
      return { method: 'PUT', path: `/api/orders/${v.order}`, body: { ...o, status: v.status } };
    },
    summary: (v, l) => `Set order ${l.order} to ${ORDER_STATUS.find((s) => s.value === v.status)?.label || v.status}`, link: (r, v) => `/orders/${v.order}` },

  { key: 'mark_attendance', about: 'Mark a workshop employee present, absent or half day for a day.', risk: 'change',
    fields: [ref('employee', 'Employee', 'employee'), need(field('status', 'Attendance', 'enum', { options: [
      { value: 'present', label: 'Present', words: /\bpresent|came|in today\b/i },
      { value: 'absent', label: 'Absent', words: /\babsent|off|leave|did ?n.?t come|not coming\b/i },
      { value: 'half', label: 'Half day', words: /\bhalf\b/i }] })), today()],
    request: (v) => ({ method: 'POST', path: '/api/attendance', body: { employee_id: v.employee, date: v.date, status: v.status } }),
    summary: (v, l) => `Mark ${l.employee} ${v.status === 'half' ? 'half day' : v.status}`, link: () => '/people' },

  { key: 'add_expense', about: "Record an employee's advance or expense (money given to or spent by a workshop employee).", risk: 'create',
    fields: [ref('employee', 'Employee', 'employee'), need(field('amount', 'Amount', 'money')), need(field('kind', 'Type', 'enum', { options: [
      { value: 'advance', label: 'Advance', words: /\badvance\b/i }, { value: 'expense', label: 'Expense', words: /\bexpense|spent|bought\b/i }], default: 'advance' })),
    field('description', 'Note'), today()],
    request: (v) => ({ method: 'POST', path: '/api/expenses', body: { employee_id: v.employee, amount: Number(v.amount), kind: v.kind, description: v.description || null, date: v.date } }),
    summary: (v, l) => `${v.kind === 'expense' ? 'Expense' : 'Advance'} of ${v.amount} for ${l.employee}`, link: (r, v) => `/people/${v.employee}` },

  { key: 'cash_entry', about: 'Record cash received (in) or paid out (out) from the cash box, with who it was from or to, including paying a transporter or vendor in cash.', risk: 'create',
    fields: [need(field('kind', 'In or out', 'enum', { options: [
      { value: 'credit', label: 'Cash in', words: /\b(received|got|collected|in|from)\b/i }, { value: 'debit', label: 'Cash out', words: /\b(paid|spent|gave|out|to)\b/i }] })),
    need(field('amount', 'Amount', 'money')), field('party', 'From / to'), field('description', 'For'), today()],
    request: (v) => ({ method: 'POST', path: '/api/cash', body: { kind: v.kind, amount: Number(v.amount), party: v.party || null, description: v.description || null, date: v.date } }),
    summary: (v) => `Cash ${v.kind === 'credit' ? 'in' : 'out'}: ${v.amount}${v.party ? ` ${v.kind === 'credit' ? 'from' : 'to'} ${v.party}` : ''}`, link: () => '/finance' },

  { key: 'new_quote', about: 'Start a new quotation (estimate) for a client, as a draft.', risk: 'create',
    strip: /^(please )?(make|create|start|draft|new)( a)?( new)? (quotation|quote|estimate)( for)?/i,
    fields: [ref('client', 'Client', 'client'), field('title', 'For (title)')],
    request: (v) => ({ method: 'POST', path: '/api/quotations', body: { client_id: v.client, title: v.title || null } }),
    summary: (v, l) => `Start a draft quote for ${l.client}`, link: (r) => `/quotes/${r.id}` },

  ...[['send_quote', 'send', 'Send a quote (quotation, estimate) to its client, or mark it as sent; adds a follow-up task.', 'Send'],
    ['accept_quote', 'accept', 'Mark a quote (quotation, estimate) accepted: the client said yes or won it.', 'Accept'],
    ['decline_quote', 'decline', 'Mark a quote (quotation, estimate) declined or lost: the client said no.', 'Decline']].map(([key, action, about, verb]) => ({
    key, about, risk: 'change', fields: [ref('quote', 'Quotation', 'quote')],
    request: (v) => ({ method: 'POST', path: `/api/quotations/${v.quote}/action`, body: { action } }),
    summary: (v, l) => `${verb} quotation ${l.quote}`, link: (r, v) => `/quotes/${v.quote}` })),
  { key: 'revise_quote', about: 'Revise a quotation: a new revision with the same lines, the old one kept as superseded.', risk: 'create',
    fields: [ref('quote', 'Quotation', 'quote')],
    request: (v) => ({ method: 'POST', path: `/api/quotations/${v.quote}/action`, body: { action: 'revise' } }),
    summary: (v, l) => `Revise quotation ${l.quote}`, link: (r) => `/quotes/${r.id}` },

  { key: 'mark_invoice_paid', about: 'Mark a client invoice as paid (the client has paid it).', risk: 'change',
    fields: [ref('invoice', 'Invoice', 'invoice')],
    // The invoice route saves the whole invoice with its lines, so start from what is stored.
    request: async (v) => {
      const inv = await queryOne('SELECT * FROM invoices WHERE id = ? AND is_deleted_record = 0', [v.invoice]);
      if (!inv) throw new Error('That invoice no longer exists');
      const items = await queryAll('SELECT description, hsn, gst_pct, qty, unit_price FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order', [v.invoice]);
      return { method: 'PUT', path: `/api/invoices/${v.invoice}`, body: { ...inv, items, status: 'paid' } };
    },
    summary: (v, l) => `Mark invoice ${l.invoice} paid`, link: () => '/clients' },

  { key: 'add_vendor', about: 'Add a new vendor or supplier (with what they supply and a phone if given).', risk: 'create',
    strip: /^(please )?(add|create|new)( a)?( new)? (vendor|supplier)(:| called| named)?/i,
    fields: [need(field('name', 'Name')), field('material', 'Supplies'), field('phone', 'Phone', 'phone')],
    request: (v) => ({ method: 'POST', path: '/api/vendors', body: { name: v.name, material: v.material || null, phone: v.phone || null } }),
    summary: (v) => `Add vendor ${v.name}`, link: (r) => `/vendors/${r.id}` },

  { key: 'add_vendor_po', about: 'Place a purchase order (PO) with a vendor for material: the item, quantity and rate.', risk: 'create',
    strip: /^(please )?(place|add|create|raise)( a)?( new)? (po|purchase order)( with| to| for)?/i,
    fields: [ref('vendor', 'Vendor', 'vendor'), need(field('item', 'Item')), need(field('qty_ordered', 'Quantity', 'number')), field('rate', 'Rate', 'money'), ref('project', 'Project', 'project', false)],
    request: (v) => ({ method: 'POST', path: '/api/vendor-pos', body: { vendor_id: v.vendor, item: v.item, qty_ordered: Number(v.qty_ordered), rate: v.rate ? Number(v.rate) : null, project_id: v.project || null } }),
    summary: (v, l) => `PO to ${l.vendor}: ${v.qty_ordered} × ${v.item}`, link: (r, v) => `/vendors/${v.vendor}` },

  { key: 'record_delivery', about: "Record material delivered against a vendor's purchase order (how much arrived).", risk: 'create',
    fields: [ref('po', 'Purchase order', 'po'), need(field('qty_delivered', 'Quantity delivered', 'number')), today()],
    request: (v) => ({ method: 'POST', path: `/api/vendor-pos/${v.po}/deliveries`, body: { qty_delivered: Number(v.qty_delivered), date: v.date } }),
    summary: (v, l) => `Record ${v.qty_delivered} delivered on ${l.po}`, link: () => '/vendors' },

  { key: 'add_freight', about: "Log a transporter's freight bill for a trip (from where to where, and what they charged), to check it against their agreed rate; not a cash payment.", risk: 'create',
    fields: [ref('vendor', 'Transporter', 'vendor'), need(field('from_loc', 'From')), need(field('to_loc', 'To')), need(field('amount', 'Amount', 'money')), today()],
    request: (v) => ({ method: 'POST', path: '/api/freight', body: { vendor_id: v.vendor, from_loc: v.from_loc, to_loc: v.to_loc, amount: Number(v.amount), date: v.date } }),
    summary: (v, l) => `Freight ${v.from_loc || '…'} → ${v.to_loc || '…'}, ${v.amount} to ${l.vendor}`, link: (r, v) => `/vendors/${v.vendor}` },

  { key: 'reschedule_task', about: 'Move an open task to a different due date.', risk: 'change',
    fields: [ref('task', 'Task', 'task'), need(field('due_date', 'New due date', 'date', { when: 'future' }))],
    request: (v) => ({ method: 'PUT', path: `/api/tasks/${v.task}`, body: { due_date: v.due_date } }),
    summary: (v, l) => `Move task “${l.task}” to ${v.due_date}`, link: () => '/' },

  { key: 'reschedule_milestone', about: "Move a project milestone's due date.", risk: 'change',
    fields: [ref('milestone', 'Milestone', 'milestone'), need(field('due_date', 'New due date', 'date', { when: 'future' }))],
    request: (v) => ({ method: 'PUT', path: `/api/milestones/${v.milestone}`, body: { due_date: v.due_date } }),
    summary: (v, l) => `Move milestone ${l.milestone} to ${v.due_date}`, link: () => '/projects' },

  { key: 'delete_task', about: 'Delete a task that is no longer needed (not the same as marking it done).', risk: 'delete',
    fields: [ref('task', 'Task', 'task')],
    request: (v) => ({ method: 'DELETE', path: `/api/tasks/${v.task}`, body: {} }),
    summary: (v, l) => `Delete task “${l.task}”`, link: () => '/' },
  { key: 'edit_client', about: "Change a client's phone number, email or address.", risk: 'change',
    fields: [ref('client', 'Client', 'client'), field('phone', 'New phone', 'phone'), field('email', 'New email', 'email'), field('address', 'New address', 'longtext', { fill: false })],
    // The client route saves the whole record: start from what is stored and change only what was given.
    request: async (v) => {
      const c = await queryOne('SELECT * FROM clients WHERE id = ? AND is_deleted_record = 0', [v.client]);
      if (!c) throw new Error('That client no longer exists');
      if (!v.phone && !v.email && !v.address) throw new Error('Give a new phone, email or address');
      return { method: 'PUT', path: `/api/clients/${v.client}`, body: { ...c, phone: v.phone || c.phone, email: v.email || c.email, address: v.address || c.address } };
    },
    summary: (v, l) => `Update ${l.client}'s ${[v.phone && 'phone', v.email && 'email', v.address && 'address'].filter(Boolean).join(', ') || 'details'}`, link: (r, v) => `/clients/${v.client}` },

  { key: 'set_project_status', about: "Change a project's status: active, on hold, completed (the project is finished or handed over) or cancelled.", risk: 'change',
    fields: [ref('project', 'Project', 'project'), need(field('status', 'New status', 'enum', { options: [
      { value: 'active', label: 'Active', words: /\b(active|resume[d]?|restart(ed)?|back on)\b/i },
      { value: 'on_hold', label: 'On hold', words: /\b(on hold|hold|pause[d]?)\b/i },
      { value: 'completed', label: 'Completed', words: /\b(complete[d]?|finished|handed over|done)\b/i },
      { value: 'cancelled', label: 'Cancelled', words: /\b(cancell?ed|cancel|dropped|called off)\b/i }] }))],
    request: async (v) => {
      const p = await queryOne('SELECT * FROM projects WHERE id = ? AND is_deleted_record = 0', [v.project]);
      if (!p) throw new Error('That project no longer exists');
      return { method: 'PUT', path: `/api/projects/${v.project}`, body: { ...p, status: v.status } };
    },
    summary: (v, l) => `Set ${l.project} to ${({ active: 'active', on_hold: 'on hold', completed: 'completed', cancelled: 'cancelled' })[v.status] || v.status}`, link: (r, v) => `/projects/${v.project}` },

  { key: 'add_employee', about: 'Add a new workshop employee (carpenter, painter, helper…) with their daily rate or monthly salary.', risk: 'create',
    strip: /^(please )?(add|hire[d]?|new)( a)?( new)? (employee|worker|staff|person|carpenter|painter|polisher|helper|electrician|plumber|supervisor|fitter)( called| named|:)?/i,
    fields: [need(field('name', 'Name', 'text', { cut: true })), field('profession', 'Trade', 'text', { pick: TRADES_RE }),
      need(field('pay_type', 'Paid', 'enum', { options: [{ value: 'daily', label: 'Per day', words: /\b(a day|per day|daily|\/day)\b/i }, { value: 'monthly', label: 'Per month', words: /\b(a month|per month|monthly|salary|\/month)\b/i }], default: 'daily' })),
      field('pay_rate', 'Rate', 'money'), field('phone', 'Phone', 'phone')],
    request: (v) => ({ method: 'POST', path: '/api/employees', body: { name: v.name, profession: v.profession || null, pay_type: v.pay_type, pay_rate: Number(v.pay_rate) || 0, phone: v.phone || null } }),
    summary: (v) => `Add ${v.name}${v.profession ? `, ${String(v.profession).toLowerCase()}` : ''}`, link: (r) => `/people/${r.id}` },

  { key: 'set_pay_rate', about: "Change a workshop employee's daily rate or monthly salary.", risk: 'change',
    fields: [ref('employee', 'Employee', 'employee'), need(field('pay_rate', 'New rate', 'money'))],
    request: async (v) => {
      const e = await queryOne('SELECT * FROM employees WHERE id = ? AND is_deleted_record = 0', [v.employee]);
      if (!e) throw new Error('That employee no longer exists');
      return { method: 'PUT', path: `/api/employees/${v.employee}`, body: { ...e, pay_rate: Number(v.pay_rate) } };
    },
    summary: (v, l) => `Set ${l.employee}'s rate to ${v.pay_rate}`, link: (r, v) => `/people/${v.employee}` },

  { key: 'employee_left', about: 'Mark a workshop employee as having left (no longer working here); their history is kept.', risk: 'change',
    fields: [ref('employee', 'Employee', 'employee')],
    request: async (v) => {
      const e = await queryOne('SELECT * FROM employees WHERE id = ? AND is_deleted_record = 0', [v.employee]);
      if (!e) throw new Error('That employee no longer exists');
      return { method: 'PUT', path: `/api/employees/${v.employee}`, body: { ...e, active: false } };
    },
    summary: (v, l) => `Mark ${l.employee} as left`, link: () => '/people' },

  { key: 'log_work', about: "Log what a workshop employee worked on (the daily worksheet), optionally against a workshop order.", risk: 'create',
    fields: [ref('employee', 'Employee', 'employee'), need(field('description', 'Work done')), ref('order', 'Order', 'order', false), today()],
    request: (v) => ({ method: 'POST', path: '/api/work-logs', body: { employee_id: v.employee, description: v.description, order_id: v.order || null, date: v.date } }),
    summary: (v, l) => `Log work for ${l.employee}${l.order ? ` on ${l.order}` : ''}`, link: (r, v) => `/people/${v.employee}` },

  { key: 'add_vendor_rate', about: "Set a transporter's agreed rate for a route (from where to where), used to catch freight overcharges.", risk: 'change',
    fields: [ref('vendor', 'Transporter', 'vendor'), need(field('from_loc', 'From', 'text', { fill: false })), need(field('to_loc', 'To', 'text', { fill: false })), need(field('expected_amount', 'Agreed rate', 'money'))],
    request: (v) => ({ method: 'POST', path: '/api/vendor-rates', body: { vendor_id: v.vendor, from_loc: v.from_loc, to_loc: v.to_loc, expected_amount: Number(v.expected_amount) } }),
    summary: (v, l) => `Agreed rate ${v.from_loc || '…'} → ${v.to_loc || '…'}: ${v.expected_amount} with ${l.vendor}`, link: (r, v) => `/vendors/${v.vendor}` },

  { key: 'cancel_po', about: "Cancel a vendor's purchase order that is no longer needed.", risk: 'delete',
    fields: [ref('po', 'Purchase order', 'po')],
    request: async (v) => {
      const po = await queryOne('SELECT * FROM vendor_pos WHERE id = ? AND is_deleted_record = 0', [v.po]);
      if (!po) throw new Error('That PO no longer exists');
      return { method: 'PUT', path: `/api/vendor-pos/${v.po}`, body: { ...po, status: 'cancelled' } };
    },
    summary: (v, l) => `Cancel ${l.po}`, link: () => '/vendors' },

  { key: 'raise_stage_invoice', about: "Raise the next payment stage of an accepted quotation as a draft invoice (advance, material delivered, handover…).", risk: 'create',
    fields: [ref('quote', 'Accepted quotation', 'accepted_quote')],
    request: async (v) => {
      const st = await queryOne('SELECT id FROM quotation_stages WHERE quotation_id = ? AND invoice_id IS NULL AND is_deleted_record = 0 ORDER BY sort_order LIMIT 1', [v.quote]);
      if (!st) throw new Error('Every stage of that quotation already has an invoice');
      return { method: 'POST', path: `/api/quotations/${v.quote}/invoice`, body: { stage_id: st.id } };
    },
    summary: (v, l) => `Raise the next stage invoice on ${l.quote}`, link: () => '/finance' },

  { key: 'delete_order', about: 'Delete a workshop order entered by mistake (to stop one that was real, set it cancelled instead).', risk: 'delete',
    fields: [ref('order', 'Order', 'order')],
    request: (v) => ({ method: 'DELETE', path: `/api/orders/${v.order}`, body: {} }),
    summary: (v, l) => `Delete order ${l.order}`, link: () => '/orders' },

  { key: 'delete_milestone', about: "Delete a milestone from a project's timeline.", risk: 'delete',
    fields: [ref('milestone', 'Milestone', 'milestone')],
    request: (v) => ({ method: 'DELETE', path: `/api/milestones/${v.milestone}`, body: {} }),
    summary: (v, l) => `Delete milestone ${l.milestone}`, link: () => '/projects' },
  { key: 'record_payroll', about: "Record a workshop employee's salary or wages for a month as paid (the amount payroll works out: days × rate − advances).", risk: 'create',
    fields: [ref('employee', 'Employee', 'employee'), need(field('period', 'Month', 'month', { default: 'last_month' }))],
    note: async (v) => { const r = await payrollRow(v.employee, v.period); return r && (r.payment_id ? `already recorded as paid on ${r.paid_on}` : `${r.net} (${r.gross} − ${r.advances} advances)`); },
    request: async (v) => {
      const r = await payrollRow(v.employee, v.period);
      if (!r) throw new Error('No pay for that employee in that month');
      if (r.payment_id) throw new Error(`Already recorded as paid on ${r.paid_on}`);
      return { method: 'POST', path: '/api/payroll', body: { employee_id: r.id, period: v.period, gross: r.gross, deductions: r.advances, net: r.net } };
    },
    summary: (v, l) => `Record ${l.employee}'s pay for ${v.period} as paid`, link: () => '/people' },

  { key: 'add_invoice', about: 'Make a new client invoice by hand, as a draft with one line (what it is for and the amount before GST); not a quotation payment stage.', risk: 'create',
    strip: /^(please )?(make|create|raise|add|draft|new)( an?)?( new)? (invoice|bill)( for| to)?/i,
    fields: [ref('client', 'Client', 'client'), ref('project', 'Project', 'project', false), need(field('description', 'For')), need(field('amount', 'Amount before GST', 'money')),
      US ? need(field('gst_pct', 'Sales tax %', 'number', { default: TAX.defaultPct, fill: false }))
        : need(field('gst_pct', 'GST', 'enum', { options: [18, 12, 5, 0].map((n) => ({ value: String(n), label: `${n}%`, words: new RegExp(`\\b${n}\\s*%`) })), default: '18' })),
      need(field('company', 'Letterhead', 'enum', { options: [{ value: 'savistar', label: BRAND.studioShort, words: /\b(savistar|studio)\b/i }, { value: 'saag', label: BRAND.workshopShort, words: /\b(saag|workshop)\b/i }], default: 'savistar' })),
      field('due_date', 'Due', 'date', { when: 'future' })],
    request: (v) => ({ method: 'POST', path: '/api/invoices', body: { client_id: v.client, project_id: v.project || null, company: v.company, due_date: v.due_date || null, status: 'draft',
      items: [{ description: v.description, gst_pct: Number(v.gst_pct), qty: 1, unit_price: Number(v.amount) }] } }),
    summary: (v, l) => `Draft invoice for ${l.client}: ${v.amount} + ${v.gst_pct}% ${TAX.name}`, link: (r, v) => `/clients/${v.client}` },

  { key: 'edit_cash_entry', about: 'Correct a cash entry already recorded: its amount, date, who it was from or to, or what it was for.', risk: 'change',
    fields: [ref('entry', 'Cash entry', 'cash'), field('amount', 'New amount', 'money'), field('date', 'New date', 'date', { fill: false }),
      field('party', 'New from / to', 'text', { fill: false }), field('description', 'New for', 'text', { fill: false })],
    request: async (v) => ({ method: 'PUT', path: `/api/cash/${v.entry}`, body: await edited('cash_transactions', v.entry, { ...v, amount: v.amount != null ? Number(v.amount) : null }, ['amount', 'date', 'party', 'description'], 'cash entry') }),
    summary: (v, l) => `Correct ${l.entry}`, link: () => '/finance' },

  { key: 'edit_vendor', about: "Change a vendor's or supplier's details: name, phone, what they supply, or notes.", risk: 'change',
    fields: [ref('vendor', 'Vendor', 'vendor'), field('phone', 'New phone', 'phone'), field('material', 'Supplies', 'text', { fill: false }), field('name', 'New name', 'text', { fill: false }), field('notes', 'Notes', 'longtext', { fill: false })],
    request: async (v) => ({ method: 'PUT', path: `/api/vendors/${v.vendor}`, body: await edited('vendors', v.vendor, v, ['phone', 'material', 'name', 'notes'], 'vendor') }),
    summary: (v, l) => `Update ${l.vendor}'s ${[v.name && 'name', v.phone && 'phone', v.material && 'supplies', v.notes && 'notes'].filter(Boolean).join(', ') || 'details'}`, link: (r, v) => `/vendors/${v.vendor}` },

  // Deletes: the same DELETE the screen's bin button sends. The `about` steers a real change to its own action.
  ...[['delete_cash_entry', 'entry', 'Cash entry', 'cash', '/api/cash', 'Delete a cash entry recorded by mistake (to fix its amount or date, correct it instead).', '/finance'],
    ['delete_expense', 'expense', 'Advance or expense', 'expense', '/api/expenses', "Delete an employee's advance or expense entered by mistake.", '/people'],
    ['delete_client', 'client', 'Client', 'client', '/api/clients', 'Delete a client added by mistake, together with their projects, quotations, invoices, orders and conversation log.', '/clients', ' with their projects, quotes, invoices and orders'],
    ['delete_project', 'project', 'Project', 'project', '/api/projects', 'Delete a project added by mistake, with its milestones and site visits (to close or cancel a real project, change its status instead).', '/projects', ' with its milestones and site visits'],
    ['delete_quote', 'quote', 'Quotation', 'quote', '/api/quotations', 'Delete a draft or sent quotation (estimate) made by mistake (if the client said no, decline it instead).', '/quotes'],
    ['delete_invoice', 'invoice', 'Invoice', 'invoice', '/api/invoices', 'Delete an unpaid client invoice made by mistake.', '/clients'],
    ['delete_vendor', 'vendor', 'Vendor', 'vendor', '/api/vendors', 'Delete a vendor or supplier added by mistake, with their rate card, freight bills and purchase orders.', '/vendors', ' with their rates, freight and POs'],
    ['delete_employee', 'employee', 'Employee', 'employee', '/api/employees', 'Delete an employee added by mistake, erasing all their attendance, work and pay history (someone who left should be marked as left instead).', '/people', ' and all their attendance, work and pay history'],
    ['delete_site_visit', 'visit', 'Site visit', 'site_visit', '/api/site-visits', 'Delete a site visit logged by mistake.', '/projects'],
    ['delete_vendor_rate', 'rate', 'Agreed rate', 'vendor_rate', '/api/vendor-rates', "Delete a transporter's agreed route rate that no longer applies.", '/vendors'],
    ['delete_po', 'po', 'Purchase order', 'po', '/api/vendor-pos', 'Delete a purchase order entered by mistake, with its deliveries (to stop a real order, cancel it instead).', '/vendors', ' with its deliveries'],
    ['delete_freight', 'freight', 'Freight bill', 'freight', '/api/freight', "Delete a transporter's freight bill logged by mistake.", '/vendors'],
    ['delete_work_log', 'log', 'Work log', 'work_log', '/api/work-logs', "Delete a line from an employee's daily worksheet (work log) entered by mistake.", '/people'],
  ].map(([key, name, label, kind, base, about, back, also = '']) => ({
    key, about, risk: 'delete', fields: [ref(name, label, kind)],
    request: (v) => ({ method: 'DELETE', path: `${base}/${v[name]}`, body: {} }),
    summary: (v, l) => `Delete ${label.toLowerCase()} ${l[name]}${also}`, link: () => back })),
];
// US demo: the same actions in US wording (quote, sales tax…), as the look-ups do.
if (US) for (const a of ACTIONS) {
  a.about = w(a.about); a.fields = a.fields.map((f) => ({ ...f, label: w(f.label) }));
  const s = a.summary; a.summary = (v, l) => w(s(v, l));
}
export const ACTION_BY_KEY = Object.fromEntries(ACTIONS.map((a) => [a.key, a]));

const FIND = { client: E.clientCandidates, project: E.projectCandidates, order: E.orderCandidates, vendor: E.vendorCandidates,
  employee: E.employeeCandidates, task: E.taskCandidates, milestone: E.milestoneCandidates, quote: E.quoteCandidates,
  invoice: E.invoiceCandidates, po: E.poCandidates, accepted_quote: E.acceptedQuoteCandidates, cash: E.cashCandidates,
  expense: E.expenseCandidates, site_visit: E.siteVisitCandidates, vendor_rate: E.vendorRateCandidates, freight: E.freightCandidates, work_log: E.workLogCandidates };
const LABEL_SQL = { client: 'SELECT name AS l FROM clients WHERE id = ?', project: 'SELECT name AS l FROM projects WHERE id = ?',
  order: "SELECT '#' || id || ' ' || item AS l FROM orders WHERE id = ?", employee: 'SELECT name AS l FROM employees WHERE id = ?',
  task: 'SELECT title AS l FROM tasks WHERE id = ?', milestone: 'SELECT title AS l FROM milestones WHERE id = ?',
  quote: "SELECT quote_no || CASE WHEN revision > 1 THEN ' R' || revision ELSE '' END || ' · ' || COALESCE(title, '') AS l FROM quotations WHERE id = ?",
  vendor: 'SELECT name AS l FROM vendors WHERE id = ?', invoice: "SELECT COALESCE(invoice_no, '#' || id) AS l FROM invoices WHERE id = ?",
  po: "SELECT 'PO #' || id || ' ' || item AS l FROM vendor_pos WHERE id = ?",
  accepted_quote: "SELECT quote_no || CASE WHEN revision > 1 THEN ' R' || revision ELSE '' END || ' · ' || COALESCE(title, '') AS l FROM quotations WHERE id = ?",
  // Staff: only their own cash entries (args: id, is staff, username).
  cash: "SELECT 'Cash ' || CASE kind WHEN 'credit' THEN 'in ' ELSE 'out ' END || amount || COALESCE(' · ' || party, '') || ' · ' || date AS l FROM cash_transactions WHERE id = ? AND (? = 0 OR created_by = ?)",
  expense: "SELECT CASE x.kind WHEN 'expense' THEN 'Expense ' ELSE 'Advance ' END || x.amount || ' · ' || e.name || ' · ' || x.date AS l FROM employee_expenses x JOIN employees e ON e.id = x.employee_id WHERE x.id = ?",
  site_visit: "SELECT 'Visit · ' || p.name || ' · ' || x.visit_date AS l FROM site_visits x JOIN projects p ON p.id = x.project_id WHERE x.id = ?",
  vendor_rate: "SELECT x.from_loc || ' → ' || x.to_loc || ' ' || x.expected_amount || ' · ' || v.name AS l FROM vendor_rates x JOIN vendors v ON v.id = x.vendor_id WHERE x.id = ?",
  freight: "SELECT 'Freight ' || x.from_loc || ' → ' || x.to_loc || ' ' || x.amount || ' · ' || v.name AS l FROM freight_charges x JOIN vendors v ON v.id = x.vendor_id WHERE x.id = ?",
  work_log: "SELECT e.name || ' · ' || COALESCE(x.description, 'work') || ' · ' || x.date AS l FROM work_logs x JOIN employees e ON e.id = x.employee_id WHERE x.id = ?" };
const labelArgs = (kind, id, who) => (kind === 'cash' ? [id, who?.role === 'user' ? 1 : 0, who?.username ?? ''] : [id]);
const lastMonth = (day) => E.add(`${day.slice(0, 7)}-01`, -1).slice(0, 7);
const defaultOf = (f, day) => (f.default === 'today' ? day : f.default === 'last_month' ? lastMonth(day) : f.default);

const MONEY = /(?:₹|rs\.?|inr|\$|usd)\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|l)?\b|\b([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|rupees|dollars)\b|\b(\d[\d,]{1,8}(?:\.\d+)?)\b/i;
function money(q) {
  const m = MONEY.exec(q.replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, ' '));
  if (!m) return null;
  const n = Number((m[1] || m[3] || m[5]).replace(/,/g, '')), u = (m[2] || m[4] || '').toLowerCase();
  return u === 'k' ? n * 1000 : ['lakh', 'lac', 'l'].includes(u) ? n * 100000 : n;
}
const tidy = (t) => { const x = String(t || '').replace(/\s+/g, ' ').replace(/^[\s,.:-]+|[\s,.:!?-]+$/g, ''); return x.charAt(0).toUpperCase() + x.slice(1); };
const PHONE = /(\+?\d[\d\s-]{8,13}\d)/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;

// One field's value from the user's own words. Refs: a clear winner is picked; otherwise the card offers the top three.
async function fillOne(f, q, day, action, who) {
  if (f.type === 'ref') {
    const c = await FIND[f.ref](q, who);
    const win = E.clearWinner(c);
    return win ? { value: win.id, display: win.label } : { value: null, options: c.slice(0, 3).map((x) => ({ value: x.id, label: x.label })) };
  }
  if (f.type === 'month') { const p = E.parsePeriod(q, day); return { value: p?.from ? p.from.slice(0, 7) : defaultOf(f, day) }; }
  if (f.type === 'date' && f.fill === false) return { value: null };
  if (f.type === 'date') {
    if (f.when === 'future') {
      const p = E.parsePeriod(q, day);
      const wd = /\b(sun|mon|tues|wednes|thurs|fri|satur)day\b/i.exec(q);
      if (wd) { const want = ['sun', 'mon', 'tues', 'wednes', 'thurs', 'fri', 'satur'].indexOf(wd[1].toLowerCase()); const now = new Date(`${day}T00:00:00Z`).getUTCDay(); return { value: E.add(day, ((want - now + 7) % 7) || 7) }; }
      const n = /\bin (\d{1,3}) (day|week)s?\b/i.exec(q);
      if (n) return { value: E.add(day, Number(n[1]) * (n[2].toLowerCase() === 'week' ? 7 : 1)) };
      if (p?.from && p.from >= day) return { value: p.from };
    } else {
      const p = E.parsePeriod(q, day);
      if (p?.from && p.from === p.to) return { value: p.from };
    }
    return { value: f.default === 'today' ? day : null };
  }
  if (f.type === 'money') return { value: money(q) };
  if (f.type === 'number' && f.fill !== false) { const m = /\b(\d{1,4})\s*(?:x|×|nos|pcs|pieces|units|sets)?\b/i.exec(q); return { value: m ? Number(m[1]) : f.default ?? null }; }
  if (f.type === 'phone') return { value: PHONE.exec(q)?.[1]?.replace(/\s+/g, '') || null };
  if (f.type === 'email') return { value: EMAIL.exec(q)?.[0] || null };
  if (f.type === 'enum') return { value: f.options.find((o) => o.words.test(q))?.value || f.default || null };
  // Text the words name directly (a trade like "carpenter"), or left for the person to type.
  if (f.pick) { const m = f.pick.exec(q); return { value: m ? tidy(m[0]) : null }; }
  if (f.fill === false) return { value: f.default ?? null };
  // Free text: the message without its command words, phone, email and dates (edited on the card if need be).
  let t = q.replace(/^\s*(hey|please|can you|could you|kindly)[\s,]*/i, '');
  if (action.strip) t = t.replace(action.strip, '');
  t = t.replace(PHONE, '').replace(EMAIL, '').replace(/\b(today|tomorrow|yesterday|on (sun|mon|tues|wednes|thurs|fri|satur)day|by (sun|mon|tues|wednes|thurs|fri|satur)day)\b/gi, '');
  if (f.cut) t = t.split(/,|\bwho\b|\bat\b|\bfor\b|\bon\b/i)[0]; // a name ends at the first comma or clause
  return { value: tidy(t).slice(0, f.type === 'longtext' ? 1000 : 200) || null };
}

// Chat: the message → a card's fields.
// `who` ({ username, role }) keeps a staff member's cards to their own cash entries.
export async function fill(key, question, day = todayIST(), who = null) {
  const a = ACTION_BY_KEY[key];
  const fields = [];
  for (const f of a.fields) fields.push({ ...publicField(f), ...(await fillOne(f, question, day, a, who)) });
  return card(a, fields);
}

// MCP and the card's Save: fields given directly (refs as an id or a name) → checked values, or what is missing.
export async function check(key, given = {}, day = todayIST(), who = null) {
  const a = ACTION_BY_KEY[key];
  if (!a) throw new Error(`Unknown action: ${key}`);
  const fields = [];
  for (const f of a.fields) {
    let v = given[f.name];
    if (v === '' || v === undefined) v = null;
    let out = { value: v };
    if (f.type === 'ref' && v != null) {
      if (/^\d+$/.test(String(v))) {
        const row = await queryOne(LABEL_SQL[f.ref], labelArgs(f.ref, Number(v), who));
        out = row ? { value: Number(v), display: row.l } : { value: null, error: `No ${f.ref} with id ${v}` };
      } else out = await fillOne(f, String(v), day, a, who);
    } else if (f.type === 'enum' && v != null && !f.options.some((o) => o.value === v)) {
      out = { value: f.options.find((o) => o.words.test(String(v)) || o.label.toLowerCase() === String(v).toLowerCase())?.value ?? null, error: undefined };
      if (out.value == null) out.error = `${f.label} must be one of: ${f.options.map((o) => o.value).join(', ')}`;
    } else if (v == null && f.default != null) out = { value: defaultOf(f, day) };
    else if (f.type === 'month' && !/^\d{4}-\d{2}$/.test(String(v))) out = { value: null, error: `${f.label} must be YYYY-MM` };
    else if (['money', 'number'].includes(f.type) && v != null && !Number.isFinite(Number(v))) out = { value: null, error: `${f.label} must be a number` };
    fields.push({ ...publicField(f), ...out });
  }
  return card(a, fields);
}

const publicField = ({ name, label, type, required, ref, options }) => ({ name, label, type, required, ...(ref ? { ref } : {}),
  ...(options ? { options: options.map((o) => ({ value: o.value, label: o.label })) } : {}) });

async function card(a, fields) {
  const values = Object.fromEntries(fields.map((f) => [f.name, f.value]));
  // What the summary says for each field: a record's name for refs, the value otherwise.
  const labels = Object.fromEntries(fields.map((f) => [f.name, f.type === 'ref' ? f.display || '' : f.value]));
  const missing = fields.filter((f) => f.required && (f.value == null || f.value === '')).map((f) => f.name);
  const errors = fields.filter((f) => f.error).map((f) => f.error);
  let summary = a.key;
  try { summary = a.summary(values, labels); } catch { /* fields still missing */ }
  // A figure worth seeing before Save (the pay payroll works out), added to the summary once the card is complete.
  if (a.note && !missing.length && !errors.length) { const n = await a.note(values).catch(() => null); if (n) summary += `: ${n}`; }
  return { action: a.key, risk: a.risk, about: a.about, summary, fields, values, missing, errors, ready: !missing.length && !errors.length };
}
