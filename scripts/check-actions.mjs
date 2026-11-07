// Self-check for the assistant's actions (lib/assistantActions.js + lib/actionRunner.js), no model calls:
//   1. every action's request maps to a real route module and method;
//   2. sample sentences fill the right fields (names, dates, amounts, choices);
//   3. every action runs end to end through its route, on a throwaway copy of the local database.
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
const { routeFor, runAction } = await import('../lib/actionRunner.js');
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

// 1. Wiring.
const sample = { ref: 1, date: day, money: 500, number: 2, text: 'x', longtext: 'x', phone: '9825012345', email: 'a@b.co', enum: null };
for (const a of ACTIONS) {
  const v = Object.fromEntries(a.fields.map((f) => [f.name, f.type === 'enum' ? f.options[0].value : sample[f.type]]));
  if (a.key === 'set_order_status') v.order = ord;
  const { method, path } = await a.request(v);
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
];
for (const [key, q, want] of cases) {
  const c = await fill(key, q, day);
  for (const [k, v] of Object.entries(want)) assert.equal(c.values[k], v, `${key}: "${q}" → ${k} = ${c.values[k]}, wanted ${v}`);
}
// A name given as text (how MCP passes it) resolves; a wrong id is an error, not a guess.
assert.equal((await check('mark_attendance', { employee: 'Ramesh', status: 'present' }, day)).values.employee, emp);
assert.ok((await check('complete_task', { task: 99999 }, day)).errors.length);

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
assert.ok(!refused.ok && /at least one line/i.test(refused.error), `accept_quote should be refused: ${refused.error}`);
const missing = await runAction(owner, 'add_client', {});
assert.ok(!missing.ok && /Missing: name/.test(missing.error));

rmSync(db, { force: true });
console.log(`check-actions: ${ACTIONS.length} actions wired, ${cases.length} sentences filled, end-to-end run passed`);
process.exit(0);
