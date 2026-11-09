// Self-check for the assistant's actions (lib/assistantActions.js + lib/actionRunner.js), no model calls:
//   1. every action's request maps to a real route module and method;
//   2. sample sentences fill the right fields (names, dates, amounts, choices);
//   3. every action runs end to end through its route, on a throwaway copy of the local database;
//   4. Auto mode: allowed by role, always-confirm actions refused, the Settings switch, Undo.
//   node --no-warnings scripts/check-actions.mjs
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(s, c, next) {
  if (s.startsWith('@/')) s = ${JSON.stringify(root)} + s.slice(2);
  if ((s.startsWith('.') || s.startsWith('file:')) && !/\\.[mc]?js(on)?$/.test(s)) s += '.js';
  if (/^next\\/[a-z-]+$/.test(s)) s += '.js';
  return next(s, c);
}`)}`);

const db = join(tmpdir(), `check-actions-${process.pid}.db`);
if (existsSync('savistar-ops-local.db')) copyFileSync('savistar-ops-local.db', db);
process.env.TURSO_URL = `file:${db}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.SESSION_SECRET ||= 'check-actions-only';
delete process.env.GOLDEN_TURSO_URL;
delete process.env.SKIP_MIGRATE;

const { initDB, execute } = await import('../lib/db.js');
await initDB();
const { ACTIONS, fill, check } = await import('../lib/assistantActions.js');
const { routeFor, runAction, runUndo } = await import('../lib/actionRunner.js');
const day = '2026-11-07'; // a Saturday

// Sample records the sentences below name.
const id = async (sql, args) => (await execute(sql, args)).lastId;
const kiran = await id('INSERT INTO clients (name) VALUES (?)', ['Kiran Joshi']);
await id('INSERT INTO clients (name) VALUES (?)', ['Brewnest Cafe LLP']);
const proj = await id("INSERT INTO projects (client_id, name, status) VALUES (?, ?, 'active')", [kiran, 'Joshi apartment — kitchen and wardrobes']);
const ms = await id('INSERT INTO milestones (project_id, title, due_date, sort_order) VALUES (?, ?, ?, 1)', [proj, 'Kitchen carcass install', '2026-11-10']);
const ord = await id("INSERT INTO orders (project_id, item, qty, status) VALUES (?, ?, 1, 'in_progress')", [proj, 'Cafe counter with fluted front']);
const emp = await id("INSERT INTO employees (name, profession, pay_type, pay_rate, active) VALUES (?, 'Carpenter', 'daily', 900, 1)", ['Ramesh Prajapati']);
const task = await id("INSERT INTO tasks (title, due_date, status, client_id) VALUES (?, ?, 'open', ?)", ['Collect cheque from Kiran', day, kiran]);
const vendor = await id('INSERT INTO vendors (name, material) VALUES (?, ?)', ['Gujarat Ply House', 'Plywood']);
const po = await id('INSERT INTO vendor_pos (vendor_id, item, qty_ordered, rate) VALUES (?, ?, 20, 2400)', [vendor, 'BWR plywood 18 mm']);
const inv = await id("INSERT INTO invoices (client_id, project_id, invoice_no, title, status) VALUES (?, ?, 'SAV/26-27/014', 'Stage 2', 'sent')", [kiran, proj]);
await execute('INSERT INTO invoice_items (invoice_id, description, gst_pct, qty, unit_price, sort_order) VALUES (?, ?, 18, 1, 100000, 0)', [inv, 'Stage 2: carcass']);
const cash = await id("INSERT INTO cash_transactions (date, kind, amount, party, description, created_by) VALUES (?, 'debit', 600, 'Office', 'Tea and snacks', 'hari')", ['2026-11-06']);
const exp = await id("INSERT INTO employee_expenses (employee_id, date, kind, amount, description) VALUES (?, ?, 'advance', 1500, 'Diwali advance')", [emp, '2026-11-05']);
const visit = await id('INSERT INTO site_visits (project_id, visit_date, notes) VALUES (?, ?, ?)', [proj, '2026-11-04', 'Plumbing points marked']);
const rate = await id('INSERT INTO vendor_rates (vendor_id, from_loc, to_loc, expected_amount) VALUES (?, ?, ?, 1400)', [vendor, 'Narol', 'Bopal']);
const fr = await id('INSERT INTO freight_charges (vendor_id, date, from_loc, to_loc, amount) VALUES (?, ?, ?, ?, 1800)', [vendor, '2026-11-03', 'Narol', 'Bopal']);
const wl = await id('INSERT INTO work_logs (employee_id, order_id, date, description) VALUES (?, ?, ?, ?)', [emp, ord, '2026-11-05', 'Fluting on the counter front']);
await execute("INSERT INTO attendance (employee_id, date, status) VALUES (?, '2026-10-05', 'present'), (?, '2026-10-06', 'present'), (?, '2026-10-07', 'half')", [emp, emp, emp]);
await execute("INSERT INTO employee_expenses (employee_id, date, kind, amount) VALUES (?, '2026-10-10', 'advance', 500)", [emp]);

// 1. Wiring.
const sample = { ref: 1, date: day, month: '2026-10', money: 500, number: 2, text: 'x', longtext: 'x', phone: '9825012345', email: 'a@b.co', enum: null };
for (const a of ACTIONS) {
  const v = Object.fromEntries(a.fields.map((f) => [f.name, f.type === 'enum' ? f.options[0].value : sample[f.type]]));
  if (a.key === 'set_order_status') v.order = ord;
  // Actions that read the record first need a real one; part 3 runs them end to end.
  const req = await Promise.resolve(a.request(v)).catch(() => null);
  if (!req) continue;
  const { method, path } = req;
  const r = routeFor(path);
  assert.ok(r, `${a.key}: no route for ${path}`);
  assert.equal(typeof (await r.load())[method], 'function', `${a.key}: ${path} has no ${method}`);
}

// 2. Filling from words.
const cases = [
  ['add_client', 'add a new client Anita Desai, 98250 12345, anita@example.com', { name: 'Anita Desai', phone: '9825012345', email: 'anita@example.com' }],
  ['log_conversation', 'log a call with Kiran: wants walnut veneer on the wardrobe', { client: kiran }],
  ['add_task', 'add a task to order the quartz top by Monday', { due_date: '2026-11-09' }],
  ['complete_task', 'mark the Kiran cheque task done', { task }],
  ['complete_milestone', 'kitchen carcass install is done', { milestone: ms }],
  ['set_order_status', 'the cafe counter order is delivered', { order: ord, status: 'delivered' }],
  ['mark_attendance', 'Ramesh is absent today', { employee: emp, status: 'absent', date: day }],
  ['add_expense', 'gave Ramesh an advance of ₹2,000', { employee: emp, amount: 2000, kind: 'advance' }],
  ['cash_entry', 'received 1.5 lakh cash from Brewnest', { kind: 'credit', amount: 150000 }],
  ['log_site_visit', 'log a site visit to the Joshi apartment yesterday, plumbing points checked', { project: proj, visit_date: '2026-11-06' }],
  ['new_quote', 'make a quote for Kiran Joshi for the study unit', { client: kiran }],
  ['mark_invoice_paid', 'Kiran paid the stage 2 invoice', { invoice: inv }],
  ['add_vendor', 'add a new vendor Shree Hardware, supplies hinges and channels, 9824011111', { phone: '9824011111' }],
  ['add_vendor_po', 'place a PO with Gujarat Ply for 30 sheets of plywood at 2400', { vendor, qty_ordered: 30 }],
  ['record_delivery', '12 sheets of the plywood came in from Gujarat Ply', { po, qty_delivered: 12 }],
  ['reschedule_task', 'move the Kiran cheque task to Friday', { task, due_date: '2026-11-13' }],
  ['delete_task', 'delete the Kiran cheque task', { task }],
  ['add_client', 'add client Meera Shah, referred by the Joshis', { name: 'Meera Shah' }],
  ['edit_client', "Kiran Joshi's new number is 98250 99999", { client: kiran, phone: '9825099999' }],
  ['set_project_status', 'put the Joshi apartment on hold', { project: proj, status: 'on_hold' }],
  ['add_employee', 'add a new carpenter Mahesh Solanki, 850 a day', { name: 'Mahesh Solanki', profession: 'Carpenter', pay_type: 'daily', pay_rate: 850 }],
  ['set_pay_rate', "raise Ramesh's rate to 950", { employee: emp, pay_rate: 950 }],
  ['employee_left', 'Ramesh has left', { employee: emp }],
  ['log_work', 'Ramesh worked on the cafe counter order today, fluting done', { employee: emp, order: ord, date: day }],
  ['cancel_po', 'cancel the plywood PO from Gujarat Ply', { po }],
  ['record_payroll', "record Ramesh's October salary as paid", { employee: emp, period: '2026-10' }],
  ['record_payroll', 'paid Ramesh his wages', { employee: emp, period: '2026-10' }], // last month by default
  ['add_invoice', 'make an invoice for Kiran Joshi for the study unit, 45,000 at 18%', { client: kiran, amount: 45000, gst_pct: process.env.NEXT_PUBLIC_MARKET === 'NA' ? 0 : '18', company: 'savistar' }],
  ['edit_cash_entry', 'the tea and snacks cash entry was 650, not 600', { entry: cash, amount: 650 }],
  ['edit_vendor', "Gujarat Ply's new number is 98240 22222", { vendor, phone: '9824022222' }],
  ['delete_cash_entry', 'delete the tea and snacks cash entry', { entry: cash }],
  ['delete_expense', "delete Ramesh's Diwali advance", { expense: exp }],
  ['delete_client', 'delete the client Brewnest Cafe LLP', {}],
  ['delete_project', 'delete the Joshi apartment project', { project: proj }],
  ['delete_invoice', 'delete invoice SAV/26-27/014', { invoice: inv }],
  ['delete_vendor', 'delete the vendor Gujarat Ply House', { vendor }],
  ['delete_employee', 'delete Ramesh Prajapati from people', { employee: emp }],
  ['delete_site_visit', 'delete the Joshi site visit about plumbing points', { visit }],
  ['delete_vendor_rate', 'delete the Narol to Bopal rate for Gujarat Ply', { rate }],
  ['delete_freight', 'delete the Narol Bopal freight bill', { freight: fr }],
  ['delete_work_log', "delete Ramesh's fluting work log", { log: wl }],
];
for (const [key, q, want] of cases) {
  const c = await fill(key, q, day);
  for (const [k, v] of Object.entries(want)) assert.equal(c.values[k], v, `${key}: "${q}" → ${k} = ${c.values[k]}, wanted ${v}`);
}
// A name given as text (how MCP passes it) resolves; a wrong id is an error, not a guess.
assert.equal((await check('mark_attendance', { employee: 'Ramesh', status: 'present' }, day)).values.employee, emp);
assert.ok((await check('complete_task', { task: 99999 }, day)).errors.length);
// The payroll card shows the pay before Save: 2.5 days × 900 − 500 advance.
assert.match((await check('record_payroll', { employee: emp, period: '2026-10' }, day)).summary, /: 1750 \(2250 − 500 advances\)/);
assert.ok((await check('record_payroll', { employee: emp, period: 'October' }, day)).errors.length, 'a month must be YYYY-MM');
// Staff: a card offers and accepts only their own cash entries (the cash routes' rule).
const staff = { username: 'dristi', role: 'user' };
assert.equal((await fill('delete_cash_entry', 'delete the tea and snacks cash entry', day, staff)).values.entry, null);
assert.ok((await check('delete_cash_entry', { entry: cash }, day, staff)).errors.length);

// 3. End to end, as an owner, through the real routes.
const owner = { id: 1, username: 'hari', role: 'owner', display_name: 'Hari' };
const run = async (key, fields) => { const r = await runAction(owner, key, fields); assert.ok(r.ok, `${key}: ${r.error}`); return r; };
const c = await run('add_client', { name: 'Check Client', phone: '9000000000' });
await run('log_conversation', { client: c.result.id, body: 'Wants a site visit next week' });
await run('add_task', { title: 'Check task', due_date: day });
await run('complete_task', { task });
const p = await run('add_project', { name: 'Check project', client: c.result.id, start_date: day });
await run('add_milestone', { project: p.result.id, title: 'Design sign-off', due_date: '2026-11-20' });
await run('complete_milestone', { milestone: ms });
await run('log_site_visit', { project: proj, visit_date: day, notes: 'Checked' });
await run('add_order', { item: 'Study table', qty: 2, project: proj });
await run('set_order_status', { order: ord, status: 'done' });
await run('mark_attendance', { employee: emp, status: 'half', date: day });
await run('add_expense', { employee: emp, amount: 500, kind: 'advance', date: day });
await run('cash_entry', { kind: 'debit', amount: 650, party: 'Office', description: 'Tea', date: day });
const q = await run('new_quote', { client: c.result.id, title: 'Check quote' });
// A quote without lines can be sent, but not accepted: the route's own rule shows up as the card's error.
await run('send_quote', { quote: q.result.id });
const refused = await runAction(owner, 'accept_quote', { quote: q.result.id });
const rev = await run('revise_quote', { quote: q.result.id });
assert.ok(rev.result.id && rev.result.id !== q.result.id, 'revise makes a new revision');
await run('mark_invoice_paid', { invoice: inv });
assert.equal((await (await import('../lib/db.js')).queryOne('SELECT status FROM invoices WHERE id = ?', [inv])).status, 'paid');
assert.equal((await (await import('../lib/db.js')).queryOne('SELECT COUNT(*) AS n FROM invoice_items WHERE invoice_id = ?', [inv])).n, 1, 'invoice lines kept');
const v2 = await run('add_vendor', { name: 'Check Vendor', material: 'Hinges' });
await run('add_vendor_po', { vendor: v2.result.id, item: 'Soft-close hinges', qty_ordered: 50, rate: 120 });
await run('record_delivery', { po, qty_delivered: 5, date: day });
await run('add_freight', { vendor, from_loc: 'Vatva', to_loc: 'Satellite', amount: 1600, date: day });
const t2 = await run('add_task', { title: 'Task to move and delete', due_date: day });
await run('reschedule_task', { task: t2.result.id, due_date: '2026-11-20' });
await run('reschedule_milestone', { milestone: ms, due_date: '2026-11-25' });
await run('delete_task', { task: t2.result.id });
await run('edit_client', { client: kiran, phone: '9825099999' });
await run('set_project_status', { project: proj, status: 'on_hold' });
assert.equal((await (await import('../lib/db.js')).queryOne('SELECT status, name FROM projects WHERE id = ?', [proj])).status, 'on_hold');
const e2 = await run('add_employee', { name: 'Check Worker', profession: 'Helper', pay_type: 'daily', pay_rate: 600 });
await run('set_pay_rate', { employee: e2.result.id, pay_rate: 650 });
await run('log_work', { employee: e2.result.id, description: 'Sanding', order: ord, date: day });
await run('employee_left', { employee: e2.result.id });
assert.equal((await (await import('../lib/db.js')).queryOne('SELECT active, pay_rate FROM employees WHERE id = ?', [e2.result.id])).active, 0);
await run('add_vendor_rate', { vendor, from_loc: 'Vatva', to_loc: 'Satellite', expected_amount: 1400 });
const po2 = await run('add_vendor_po', { vendor, item: 'Edge band', qty_ordered: 10 });
await run('cancel_po', { po: po2.result.id });
const o2 = await run('add_order', { item: 'Mistake order', qty: 1 });
await run('delete_order', { order: o2.result.id });
const m2 = await run('add_milestone', { project: proj, title: 'Mistake milestone' });
await run('delete_milestone', { milestone: (await (await import('../lib/db.js')).queryOne("SELECT id FROM milestones WHERE title = 'Mistake milestone'")).id });
// A stage invoice needs an accepted quote with lines: make one through the quote functions, then raise its first stage.
const Q = await import('../lib/quotations.js');
const qid = await Q.createQuotation({ client_id: kiran, title: 'Stage check' }, owner);
const qq = await Q.loadQuotation(qid);
await Q.saveQuotation(qid, { ...qq, items: [{ description: 'Wardrobe', unit: 'sqft', qty: 10, rate: 1000, gst_pct: 18 }], stages: qq.stages });
await Q.decideQuotation(qid, 'accepted');
const si = await run('raise_stage_invoice', { quote: qid });
assert.ok(si.result.invoice_id, 'stage invoice raised');
assert.ok(!refused.ok && /at least one line/i.test(refused.error), `accept_quote should be refused: ${refused.error}`);
// The new actions, end to end.
const pay = await run('record_payroll', { employee: emp, period: '2026-10' });
assert.equal((await (await import('../lib/db.js')).queryOne('SELECT net FROM payroll_payments WHERE id = ?', [pay.result.id])).net, 1750);
const twice = await runAction(owner, 'record_payroll', { employee: emp, period: '2026-10' });
assert.ok(!twice.ok && /already recorded/i.test(twice.error), `payroll twice: ${twice.error}`);
const ni = await run('add_invoice', { client: kiran, project: proj, description: 'Study unit', amount: 45000, gst_pct: '12', company: 'saag' });
const nir = await (await import('../lib/db.js')).queryOne('SELECT i.company, i.status, it.unit_price, it.gst_pct FROM invoices i JOIN invoice_items it ON it.invoice_id = i.id WHERE i.id = ?', [ni.result.id]);
assert.deepEqual({ ...nir }, { company: 'saag', status: 'draft', unit_price: 45000, gst_pct: 12 });
await run('edit_cash_entry', { entry: cash, amount: 650 });
const ce = await (await import('../lib/db.js')).queryOne('SELECT amount, party, date FROM cash_transactions WHERE id = ?', [cash]);
assert.deepEqual({ ...ce }, { amount: 650, party: 'Office', date: '2026-11-06' }, 'only the amount changed');
const nothing = await runAction(owner, 'edit_cash_entry', { entry: cash });
assert.ok(!nothing.ok && /what to change/i.test(nothing.error));
const staffUser = { id: 4, username: 'dristi', role: 'user', display_name: 'Dristi' };
assert.ok(!(await runAction(staffUser, 'edit_cash_entry', { entry: cash, amount: 1 })).ok, "staff can't touch others' cash");
await run('edit_vendor', { vendor, phone: '9824022222', material: 'Plywood, laminates' });
assert.equal((await (await import('../lib/db.js')).queryOne('SELECT name, phone FROM vendors WHERE id = ?', [vendor])).name, 'Gujarat Ply House');
const gone = async (table, rid) => assert.equal((await (await import('../lib/db.js')).queryOne(`SELECT is_deleted_record AS d FROM ${table} WHERE id = ?`, [rid])).d, 1, `${table} ${rid} deleted`);
for (const [key, f, table, rid] of [['delete_cash_entry', 'entry', 'cash_transactions', cash], ['delete_expense', 'expense', 'employee_expenses', exp],
  ['delete_site_visit', 'visit', 'site_visits', visit], ['delete_vendor_rate', 'rate', 'vendor_rates', rate], ['delete_freight', 'freight', 'freight_charges', fr],
  ['delete_work_log', 'log', 'work_logs', wl], ['delete_invoice', 'invoice', 'invoices', ni.result.id], ['delete_quote', 'quote', 'quotations', rev.result.id],
  ['delete_po', 'po', 'vendor_pos', po]]) { await run(key, { [f]: rid }); await gone(table, rid); }
const dc = await run('add_client', { name: 'Delete Me Client' });
const dp = await run('add_project', { name: 'Delete me project', client: dc.result.id, start_date: day });
await run('delete_project', { project: dp.result.id }); await gone('projects', dp.result.id);
await run('delete_client', { client: dc.result.id }); await gone('clients', dc.result.id);
const dv = await run('add_vendor', { name: 'Delete Me Vendor' });
await run('delete_vendor', { vendor: dv.result.id }); await gone('vendors', dv.result.id);
const de = await run('add_employee', { name: 'Delete Me Worker', pay_type: 'daily', pay_rate: 500 });
await run('delete_employee', { employee: de.result.id }); await gone('employees', de.result.id);
const missing = await runAction(owner, 'add_client', {});
assert.ok(!missing.ok && /Missing: name/.test(missing.error));

// 4. Auto mode. Off for every role until Settings ticks some; the server decides, not the card.
const { setSettings } = await import('../lib/assistant.js');
const Q1 = (await import('../lib/db.js')).queryOne;
const setActions = (v) => setSettings('hari', [['assistant_actions', JSON.stringify(v)]]);
assert.ok((await runAction(owner, 'add_task', { title: 'Auto nobody', due_date: day }, { auto: true })).needsCard, 'no roles ticked: card');
await setActions({ on: true, autoRoles: ['owner'] });
const auto = async (who, key, f) => { const r = await runAction(who, key, f, { auto: true }); assert.ok(r.ok && r.undo, `${key} auto: ${r.error}`); return r; };
assert.ok((await runAction(staffUser, 'cash_entry', { kind: 'credit', amount: 100, date: day }, { auto: true })).needsCard, 'staff role not ticked: card');
// Always the card in Auto: a delete, a payment, an approval, a stage invoice, cash out; and one with no clean reverse.
for (const [key, f] of [['delete_task', { task }], ['mark_invoice_paid', { invoice: inv }], ['accept_quote', { quote: qid }], ['raise_stage_invoice', { quote: qid }],
  ['record_payroll', { employee: emp, period: '2026-09' }], ['cash_entry', { kind: 'debit', amount: 100, date: day }], ['mark_attendance', { employee: emp, status: 'present', date: day }]]) {
  const r = await runAction(owner, key, f, { auto: true });
  assert.ok(!r.ok && r.needsCard, `${key} must need the card in Auto: ${r.error}`);
}
assert.ok(ACTIONS.filter((a) => a.risk === 'delete').every((a) => !a.undo), 'no delete is auto-able');
// Undo: a create is deleted, an edit is put back.
const at = await auto(owner, 'add_task', { title: 'Auto task', due_date: day });
assert.ok((await runUndo(owner, at.undo)).ok); assert.equal((await Q1('SELECT is_deleted_record AS d FROM tasks WHERE id = ?', [at.result.id])).d, 1, 'undo add_task');
const ac = await auto(owner, 'cash_entry', { kind: 'credit', amount: 2500, party: 'Kiran', date: day });
assert.ok((await runUndo(owner, ac.undo)).ok); assert.equal((await Q1('SELECT is_deleted_record AS d FROM cash_transactions WHERE id = ?', [ac.result.id])).d, 1, 'undo cash in');
const before = (await Q1('SELECT pay_rate FROM employees WHERE id = ?', [emp])).pay_rate;
const ap = await auto(owner, 'set_pay_rate', { employee: emp, pay_rate: 1100 });
assert.equal((await Q1('SELECT pay_rate FROM employees WHERE id = ?', [emp])).pay_rate, 1100);
assert.ok(!(await runUndo(staffUser, ap.undo)).ok, "someone else can't use the undo");
assert.ok((await runUndo(owner, ap.undo)).ok); assert.equal((await Q1('SELECT pay_rate FROM employees WHERE id = ?', [emp])).pay_rate, before, 'undo set_pay_rate');
const t3 = await run('add_task', { title: 'Auto move', due_date: day });
const ar = await auto(owner, 'reschedule_task', { task: t3.result.id, due_date: '2026-12-01' });
assert.ok((await runUndo(owner, ar.undo)).ok); assert.equal((await Q1('SELECT due_date FROM tasks WHERE id = ?', [t3.result.id])).due_date, day, 'undo reschedule_task');
assert.ok(!(await runUndo(owner, 'forged')).ok, 'a forged undo is refused');
// Staff ticked: Auto for their own entry; the cash route's own rule still keeps them off others'.
await setActions({ on: true, autoRoles: ['owner', 'user'] });
const sc = await auto(staffUser, 'cash_entry', { kind: 'credit', amount: 300, date: day });
assert.ok((await runUndo(staffUser, sc.undo)).ok);
const other = await run('cash_entry', { kind: 'credit', amount: 400, date: day });
assert.ok(!(await runAction(staffUser, 'edit_cash_entry', { entry: other.result.id, amount: 1 }, { auto: true })).ok, "staff still can't touch others' cash in Auto");
// The Settings switch off: no changes from the assistant at all (chat card, Auto, or MCP confirm).
await setActions({ on: false, autoRoles: ['owner'] });
const off = await runAction(owner, 'add_client', { name: 'Switched off' });
assert.ok(!off.ok && off.status === 403 && /switched off/.test(off.error), `switch off: ${off.error}`);
// (MCP's propose_action reads the same switch; its module needs the native PDF reader, so it is not loaded here.)
await setActions({ on: true, autoRoles: [] });

rmSync(db, { force: true });
console.log(`check-actions: ${ACTIONS.length} actions wired (${ACTIONS.filter((a) => a.undo && !a.confirm).length} auto-able), ${cases.length} sentences filled, end-to-end run, Auto and Undo passed`);
process.exit(0);
