// Fills the interiors demo's golden database with the things the briefing and Atelier AI ask about: quotations in
// every state, a couple of overdue tasks, a running-late cafe counter (order + milestone), a missed kitchen install and
// today's attendance. Goes through lib/quotations.js, so numbers, stages, follow-up tasks and stage invoices come out
// exactly as the app makes them. Run once per golden; safe to re-run (each piece is skipped when it's already there).
//
//   India: TURSO_URL=libsql://sav-demo-golden-pujan.aws-ap-south-1.turso.io node scripts/demo/add-samples.mjs
//   US (on the us-demo branch): MARKET=NA NEXT_PUBLIC_MARKET=NA TURSO_URL=libsql://sav-us-demo-golden-pujan.aws-ap-south-1.turso.io node scripts/demo/add-samples.mjs
//
// Token: TURSO_GROUP_TOKEN (savdemo group) from the environment or the gitignored .demo-secrets. Visitors see the data
// after the next nightly reset (or a manual one). Writes only to the database in TURSO_URL.
import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';

// lib/ imports the Next way ('./brand', '@/lib/x'); plain Node needs the '.js' and the alias spelled out.
const root = new URL('../../', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(s, c, next) {
  if (s.startsWith('@/')) s = ${JSON.stringify(root)} + s.slice(2);
  if ((s.startsWith('.') || s.startsWith('file:')) && !/\\.[mc]?js(on)?$/.test(s)) s += '.js';
  return next(s, c);
}`)}`);

if (!process.env.TURSO_URL?.includes('golden')) throw new Error('TURSO_URL must be a demo golden database');
if (!process.env.TURSO_GROUP_TOKEN && existsSync('.demo-secrets')) {
  const m = /^TURSO_GROUP_TOKEN=(.+)$/m.exec(readFileSync('.demo-secrets', 'utf8'));
  if (m) process.env.TURSO_GROUP_TOKEN = m[1];
}
process.env.TURSO_AUTH_TOKEN = process.env.TURSO_GROUP_TOKEN;
process.env.SKIP_MIGRATE = '1'; // golden is migrated on every deploy
delete process.env.GOLDEN_TURSO_URL; // outside a request: plain TURSO_URL
process.env.NEXT_PUBLIC_DEMO = process.env.DEMO_MODE = '1'; // made-up letterheads (AI/Q/… not the client's prefix)

const US = process.env.MARKET === 'NA';
const { queryOne, queryAll, execute } = await import('../../lib/db.js');
const Q = await import('../../lib/quotations.js');
const { todayISO } = await import('../../lib/date.js');
const today = todayISO();
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const owner = { username: 'owner' };
const log = (...a) => console.log(' ', ...a);

// Sample lines, India (₹, GST 18%) and US ($, Texas sales tax 8.25%).
const TAX = US ? 8.25 : 18;
const L = {
  tvWall: { description: 'Decorative TV wall panel\n\n12 mm BWR plywood backing, 1 mm laminate, concealed cable routing. Measured by finished front elevation.', unit: 'sqft', dims: US ? "8' × 6'" : "6' × 5'", qty: US ? 48 : 30, rate: US ? 58 : 1650 },
  crockery: { description: 'Crockery unit with glass shutters\n\n18 mm BWR plywood carcass, fluted glass shutters, profile lights. Measured by front elevation.', unit: 'sqft', dims: US ? "6' × 7'" : "5' × 7'", qty: US ? 42 : 35, rate: US ? 72 : 2100 },
  sofaBack: { description: 'Upholstered wall panel behind sofa\n\nFabric over foam on plywood, fixed with French cleats.', unit: 'sqft', dims: "10' × 4'", qty: 40, rate: US ? 45 : 1250 },
  wardrobe: { description: 'Full-height hinged wardrobe, laminate finish\n\n18 mm BWR plywood carcass and shutters, soft-close hinges, hanging rod. Measured by front elevation, depth up to 600 mm.', unit: 'sqft', dims: US ? "8' × 8'" : "7'6\" × 8'", qty: US ? 64 : 60, rate: US ? 62 : 1850 },
  bed: { description: 'Queen bed with hydraulic storage\n\nPlywood storage box, laminate finish, gas-lift mechanism. Mattress excluded.', unit: 'nos', dims: "6' × 6'6\"", qty: 1, rate: US ? 1950 : 58500 },
  dining: { description: 'Dining table, 6-seater, solid wood\n\nSolid hardwood top 40 mm, tapered legs, PU matt finish.', unit: 'nos', dims: "6' × 3'", qty: 1, rate: US ? 2400 : 68000 },
  cubbies: { description: 'Classroom cubby storage, rounded edges\n\n18 mm plywood, 2 mm edge band, open cubbies for 12 children per unit.', unit: 'nos', dims: "6' × 3' × 1'4\"", qty: 6, rate: US ? 780 : 22500 },
  benches: { description: 'Low bench seating with storage\n\nPlywood frame, laminate top, child-safe rounded corners.', unit: 'rft', dims: '24', qty: 24, rate: US ? 95 : 2600 },
  outdoor: { description: 'Outdoor bench seating, treated pine\n\nPressure-treated pine slats on powder-coated steel frame, weatherproof finish.', unit: 'rft', dims: '18', qty: 18, rate: US ? 140 : 3800 },
  planters: { description: 'Planter boxes with drip line\n\nGalvanised steel, powder-coated, with drip irrigation point.', unit: 'nos', dims: "3' × 1'6\"", qty: 6, rate: US ? 260 : 7200 },
  study: { description: 'Study unit with overhead shelves\n\n18 mm plywood, laminate finish, cable cut-outs, two drawers.', unit: 'sqft', dims: "5' × 7'", qty: 35, rate: US ? 55 : 1500 },
};
const items = (keys, section) => keys.map((k) => ({ section, ...L[k], gst_pct: TAX }));

// One quotation per title: create, fill, then walk it to its state.
async function quote({ client, project, title, lines, then }) {
  const have = await queryOne('SELECT id FROM quotations WHERE title = ? AND client_id = ? AND is_deleted_record = 0 ORDER BY revision LIMIT 1', [title, client]);
  let id = have?.id;
  if (!id) id = await Q.createQuotation({ client_id: client, title }, owner);
  const q = await Q.loadQuotation(id);
  if (!q.items.length) await Q.saveQuotation(id, { ...q, project_id: project, items: lines, stages: q.stages });
  if (q.status === 'draft' && then) await then(id);
  const after = await Q.loadQuotation(id);
  log(`${after.quote_no} ${title}: ${after.status}`);
  return id;
}

console.log(`Adding samples to ${new URL(process.env.TURSO_URL).hostname} (today ${today})`);

// 1. Quotations, one in each state.
const N = US
  ? { walker: 'Walker ranch — living and dining', carter: 'Carter house — loose furniture', greenleaf: 'Greenleaf classrooms — storage and seating', foster: 'Foster primary bedroom', brewnest: 'Brewnest patio seating add-on', brooks: 'Brooks apartment — study nook' }
  : { walker: 'Rathod villa — living and dining', carter: 'Mehta bungalow — loose furniture', greenleaf: 'Greenleaf classrooms — storage and seating', foster: 'Kapadia master bedroom', brewnest: 'Brewnest outdoor seating add-on', brooks: 'Joshi apartment — study unit' };

await quote({ client: 8, title: N.walker, lines: [...items(['tvWall', 'crockery'], 'Living room'), ...items(['sofaBack'], 'Living room')],
  then: (id) => Q.sendQuotation(id, owner) });
await quote({ client: 1, project: 1, title: N.carter, lines: items(['dining', 'bed'], 'Furniture'),
  then: async (id) => {
    await Q.decideQuotation(id, 'accepted');
    const first = (await Q.loadQuotation(id)).stages[0];
    await Q.raiseStageInvoice(id, first.id);
  } });
const g = await quote({ client: 7, title: N.greenleaf, lines: items(['cubbies', 'benches'], 'Classrooms'),
  then: (id) => Q.sendQuotation(id, owner, 0) });
// The school asked for a smaller first phase: revision 2, four cubby units instead of six, sent again.
if (!(await queryOne("SELECT id FROM quotations WHERE parent_quotation_id = ? AND is_deleted_record = 0", [g]))) {
  const r2 = await Q.reviseQuotation(g, owner);
  const q2 = await Q.loadQuotation(r2);
  await Q.saveQuotation(r2, { ...q2, items: q2.items.map((it) => (it.description.startsWith('Classroom cubby') ? { ...it, qty: 4 } : it)), stages: q2.stages });
  await Q.sendQuotation(r2, owner);
  log(`${q2.quote_no} R2 ${N.greenleaf}: sent (R1 superseded)`);
}
await quote({ client: 6, title: N.foster, lines: items(['wardrobe', 'bed'], 'Bedroom'),
  then: async (id) => { await Q.sendQuotation(id, owner, 0); await Q.decideQuotation(id, 'declined'); } });
const b = await quote({ client: 3, title: N.brewnest, lines: items(['outdoor', 'planters'], 'Patio'),
  then: (id) => Q.sendQuotation(id, owner, 0) });
// Sent three weeks ago and never answered: past its validity, so it shows as expired.
await execute('UPDATE quotations SET quoted_on = ?, sent_on = ?, valid_until = ? WHERE id = ? AND status = ?', [day(-21), day(-21), day(-6), b, 'sent']);
await quote({ client: 2, project: 4, title: N.brooks, lines: items(['study'], 'Study') });

// 2. Two overdue tasks.
const tasks = US
  ? [['Send revised closet shutter samples to Kevin Brooks', -3, 'manager', 2], ['Chase Brewnest for the phase 2 payment', -2, 'owner', 3]]
  : [['Send revised wardrobe shutter samples to Kiran Joshi', -3, 'manager', 2], ['Chase Brewnest for the stage 2 payment', -2, 'owner', 3]];
for (const [title, d, who, client] of tasks) {
  if (await queryOne('SELECT id FROM tasks WHERE title = ?', [title])) continue;
  await execute("INSERT INTO tasks (title, due_date, assigned_to, client_id, created_by, status) VALUES (?, ?, ?, ?, 'owner', 'open')", [title, day(d), who, client]);
  log(`task: ${title} (due ${day(d)})`);
}

// 3. Running late: the cafe counter (order #4 and its milestone, 2 days) and the kitchen install (1 day).
await execute("UPDATE orders SET due_date = ? WHERE id = 4 AND status = 'in_progress'", [day(-2)]);
await execute("UPDATE milestones SET due_date = ? WHERE id = 11 AND status != 'done'", [day(-2)]);
await execute("UPDATE milestones SET due_date = ? WHERE id = 14 AND status != 'done'", [day(-1)]);
log('late: counter order #4 and its milestone, kitchen install milestone');

// 4. Today's attendance: five of six marked (copied from each person's last day), one still to mark.
if (!(await queryOne('SELECT id FROM attendance WHERE date = ? AND is_deleted_record = 0', [today]))) {
  const staff = await queryAll('SELECT id FROM employees WHERE active = 1 AND is_deleted_record = 0 ORDER BY id');
  for (const { id } of staff.slice(0, 5)) {
    const last = await queryOne("SELECT status, in_time, out_time FROM attendance WHERE employee_id = ? AND status = 'present' ORDER BY date DESC LIMIT 1", [id]);
    await execute('INSERT INTO attendance (employee_id, date, status, in_time, out_time) VALUES (?, ?, ?, ?, ?)', [id, today, 'present', last?.in_time ?? null, null]);
  }
  log(`attendance: ${Math.min(5, staff.length)} of ${staff.length} marked today`);
}

// 5. Today's cash: a small spend out (the client receipt in is 6b) (the evening briefing's "Cash today" line).
const cash = US
  ? [['debit', 38, 'Office', 'Coffee and courier', null, null]]
  : [['debit', 650, 'Office', 'Tea and courier', null, null]]; // today's client receipt: 6b
for (const [kind, amount, party, description, ptype, pid] of cash) {
  if (await queryOne('SELECT id FROM cash_transactions WHERE date = ? AND description = ?', [today, description])) continue;
  await execute("INSERT INTO cash_transactions (date, kind, amount, party, description, created_by, party_type, party_id) VALUES (?, ?, ?, ?, ?, 'office', ?, ?)",
    [today, kind, amount, party, description, ptype, pid]);
  log(`cash today: ${kind} ${amount} ${party}`);
}

// 6. Make the books add up, so any question a visitor asks gets a believable answer (India and US):
//    - every project carries its real costs: subcontractors on the full-interiors job, stone and electrics at the cafe,
//      materials and workshop days on the kitchen and the finished living room (it showed a 100% margin);
//    - receivables: one invoice overdue, one raised this week, so "who owes us" and "billed this month" aren't thin;
//    - today's client receipt matches a real invoice (it was a "stage 2" receipt with no stage 2 invoice);
//    - last month's payroll is paid for everyone, daily workers included, and the cash book shows it;
//    - quotes decided last month and older delivered orders, so win rate and on-time delivery have some history.
//    Looked up by name, not id; each piece is skipped once it's there.
const id = async (sql, args) => (await queryOne(sql, args))?.id ?? null;
const cl = (name) => id('SELECT id FROM clients WHERE name = ? AND is_deleted_record = 0', [name]);
const pr = (name) => id('SELECT id FROM projects WHERE name = ? AND is_deleted_record = 0', [name]);
const orderId = (item) => id('SELECT id FROM orders WHERE item = ? AND is_deleted_record = 0', [item]);
const emp = (name) => id('SELECT id FROM employees WHERE name = ? AND is_deleted_record = 0', [name]);
async function vendor(name, material, notes) {
  const have = await id('SELECT id FROM vendors WHERE name = ? AND is_deleted_record = 0', [name]);
  if (have || !material) return have;
  log(`vendor: ${name}`);
  return (await execute('INSERT INTO vendors (name, material, notes) VALUES (?, ?, ?)', [name, material, notes])).lastId;
}
// A PO, delivered in full on `delivered` (days from today) or still open when null.
async function po(v, item, qty, rate, project, order, ordered, delivered) {
  const p = await pr(project);
  if (!p || await id('SELECT id FROM vendor_pos WHERE project_id = ? AND item = ? AND is_deleted_record = 0', [p, item])) return;
  const { lastId } = await execute("INSERT INTO vendor_pos (vendor_id, order_id, project_id, item, qty_ordered, rate, status, ordered_on, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [await vendor(v), order ? await orderId(order) : null, p, item, qty, rate, delivered == null ? 'open' : 'complete', day(ordered), qty === 1 ? 'Lump sum, as agreed on site' : 'Delivery to workshop']);
  if (delivered != null) await execute("INSERT INTO vendor_deliveries (vendor_po_id, date, qty_delivered, qty_returned, notes) VALUES (?, ?, ?, 0, 'Received in full')", [lastId, day(delivered), qty]);
  log(`PO ${project}: ${item} ${qty} × ${rate}${delivered == null ? ' (open)' : ''}`);
}
async function cashOnce(d, kind, amount, party, ptype, pid, description) {
  if (await id('SELECT id FROM cash_transactions WHERE description = ? AND is_deleted_record = 0', [description])) return;
  await execute("INSERT INTO cash_transactions (date, kind, amount, party, description, created_by, party_type, party_id) VALUES (?, ?, ?, ?, ?, 'owner', ?, ?)", [day(d), kind, amount, party, description, ptype, pid]);
  log(`cash ${day(d)}: ${kind} ${amount} ${description}`);
}
async function invoice(c, p, company, no, title, sub, due, terms, status, lines) {
  if (await id('SELECT id FROM invoices WHERE invoice_no = ? AND is_deleted_record = 0', [no])) return;
  const { lastId } = await execute('INSERT INTO invoices (client_id, project_id, company, invoice_no, title, submitted_on, due_date, payment_terms, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [await cl(c), p ? await pr(p) : null, company, no, title, day(sub), day(due), terms, status]);
  for (const [i, [description, hsn, qty, unit_price]] of lines.entries()) await execute('INSERT INTO invoice_items (invoice_id, description, hsn, gst_pct, qty, unit_price, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', [lastId, description, hsn, TAX, qty, unit_price, i]);
  log(`invoice ${no} (${status}): ${day(sub)}, due ${day(due)}`);
}

const D = US ? {
  full: 'Carter house — full interiors', cafe: 'Brewnest coffee bar, South Lamar', kitchen: 'Brooks apartment — kitchen and closets', living: 'Foster living room', office: 'Northbridge office fit-out, 40 seats',
  livingOrder: 'TV console and desk', kitchenOrder: 'Kitchen cabinet boxes, 14 units', cafeOrder: 'Coffee bar counter with fluted front',
  ply: 'Hill Country Plywood', veneer: 'Veneer Supply Co.', hw: 'Lone Star Hardware',
  vendors: [['Austin Drywall & Paint', 'Subcontractor', 'Drywall, ceilings and painting'], ['Hill Country Electric', 'Subcontractor', 'Electrical and light demolition'], ['Lamar Stone Works', 'Stone and quartz', 'Quartz and granite countertops']],
  pos: [
    ['Austin Drywall & Paint', 'Drywall ceilings and painting, whole house (lump sum)', 1, 24500, 'full', null, -40, -6],
    ['Hill Country Electric', 'Electrical and demolition (lump sum)', 1, 6800, 'full', null, -62, -30],
    ['Lamar Stone Works', 'Quartz countertop, 10 ft with cut-outs', 1, 3900, 'cafe', 'cafeOrder', -10, null],
    ['Hill Country Electric', 'Coffee bar electrical and lighting (lump sum)', 1, 3100, 'cafe', null, -15, -4],
    ['Hill Country Plywood', 'Birch plywood 3/4 in (4x8)', 32, 62, 'kitchen', 'kitchenOrder', -14, -11],
    ['Lone Star Hardware', 'Kitchen hardware: hinges, slides, pull-outs (lot)', 1, 1450, 'kitchen', 'kitchenOrder', -13, -9],
    ['Hill Country Plywood', 'Birch plywood 3/4 in (4x8)', 14, 62, 'living', 'livingOrder', -94, -91],
    ['Veneer Supply Co.', 'Walnut veneer sheet', 10, 95, 'living', 'livingOrder', -93, -89],
    ['Lone Star Hardware', 'Drawer slides and hinges (set)', 20, 9, 'living', 'livingOrder', -90, -88],
  ],
  pay: [[-28, 6800, 'Hill Country Electric', 'Electrical and demolition, Carter house, paid in full'], [-5, 15000, 'Austin Drywall & Paint', 'Drywall and paint, Carter house, part payment'],
    [-84, 868, 'Hill Country Plywood', 'Plywood for the Foster TV console'], [-84, 950, 'Veneer Supply Co.', 'Walnut veneer, Foster'], [-84, 180, 'Lone Star Hardware', 'Slides and hinges, Foster']],
  livingCrew: ['Mike Johnson', 'Luis Hernandez'], livingDays: 4, helper: 'Tyler Brown',
  invoices: [
    ['Brewnest Coffee Co.', 'cafe', 'savistar', 'AI-2026-013', 'Counter and seating — second installment', -18, -3, 'Net 15', 'sent', [['Counter and seating fabrication, second installment', '', 1, 19000]]],
    ['Kevin Brooks', 'kitchen', 'savistar', 'AI-2026-016', 'Kitchen and closets — phase 1', -3, 12, 'Net 15', 'sent', [['Kitchen cabinet boxes and installation, phase 1', '', 1, 8800]]],
    ['Ryan & Megan Foster', null, 'saag', 'AF-2026-037', 'Bookshelf wall — 50% deposit', 0, 0, 'Deposit', 'paid', [['Deposit against bookshelf wall (quote accepted)', '', 1, 962.5]]],
  ],
  receipt: [1041.91, 'Ryan & Megan Foster', 'Deposit, invoice AF-2026-037'], oldReceipt: 'Phase 2 payment, ACH',
  oldTask: 'Collect check from Northbridge', newTask: 'Send the workstation first-lot invoice to Northbridge',
  quotes: [['Ryan & Megan Foster', 'Foster study — bookshelf wall', 'study', 'accepted', -34], ['Dr. Lisa Nguyen', 'Nguyen clinic — reception desk', 'reception', 'declined', -31]],
  delivered: [['Greenleaf Montessori School', null, 'Reading nook bookshelves', 3, -88, -60, -61], ['Michael & Jennifer Carter', 'full', 'Entry console, solid walnut', 1, -55, -32, -32], ['Northbridge Consulting LLC', 'office', 'Reception desk, quartz top', 1, -38, -20, -16]],
  wages: 'Wages, hourly crew',
} : {
  full: 'Mehta bungalow — full interiors', cafe: 'Brewnest cafe, Sindhu Bhavan Road', kitchen: 'Joshi apartment — kitchen and wardrobes', living: 'Kapadia living room', office: 'Northbridge office fit-out, 40 seats',
  livingOrder: 'TV unit and study table', kitchenOrder: 'Kitchen carcasses, 14 units', cafeOrder: 'Cafe counter with fluted front',
  vendors: [['Om Ceiling & Paint Contractors', 'Site contractor', 'False ceiling, POP and painting'], ['Patel Electricals & Civil', 'Site contractor', 'Civil, electrical and plumbing'], ['Stone Studio', 'Stone and quartz', 'Quartz and granite tops']],
  pos: [
    ['Om Ceiling & Paint Contractors', 'False ceiling and painting, full house (lump sum)', 1, 246000, 'full', null, -40, -6],
    ['Patel Electricals & Civil', 'Civil and electrical works (lump sum)', 1, 71500, 'full', null, -62, -30],
    ['Stone Studio', 'Quartz counter top, 3.2 m with cut-outs', 1, 64000, 'cafe', 'cafeOrder', -10, null],
    ['Patel Electricals & Civil', 'Cafe electrical and lighting points (lump sum)', 1, 52000, 'cafe', null, -15, -4],
    ['Shree Plywood Traders', 'BWP plywood 18 mm (8x4)', 32, 2650, 'kitchen', 'kitchenOrder', -14, -11],
    ['Kalpana Hardware', 'Kitchen hardware: hinges, channels, baskets (lot)', 1, 28500, 'kitchen', 'kitchenOrder', -13, -9],
    ['Shree Plywood Traders', 'BWP plywood 18 mm (8x4)', 14, 2650, 'living', 'livingOrder', -94, -91],
    ['Laminate House', 'Walnut veneer sheet', 10, 2150, 'living', 'livingOrder', -93, -89],
    ['Kalpana Hardware', 'Drawer channels and hinges (set)', 20, 240, 'living', 'livingOrder', -90, -88],
  ],
  pay: [[-28, 71500, 'Patel Electricals & Civil', 'Civil and electrical, Mehta bungalow, paid in full'], [-5, 150000, 'Om Ceiling & Paint Contractors', 'Ceiling and paint, Mehta bungalow, part payment'],
    [-84, 37100, 'Shree Plywood Traders', 'Plywood for the Kapadia TV unit'], [-84, 21500, 'Laminate House', 'Walnut veneer, Kapadia'], [-84, 4800, 'Kalpana Hardware', 'Channels and hinges, Kapadia'],
    [-9, 51800, 'Laminate House', 'Oak veneer, Mehta wardrobe (net of 2 returned)'], [-6, 104000, 'Shree Plywood Traders', 'Plywood, Northbridge first 40 sheets']],
  livingCrew: ['Suresh Chauhan', 'Mahesh Solanki'], livingDays: 14, helper: 'Dinesh Parmar',
  invoices: [
    ['Brewnest Cafe LLP', 'cafe', 'savistar', 'AI/26-27/013', 'Counter and seating — second instalment', -18, -3, '15 days', 'sent', [['Counter and seating fabrication, second instalment', '995461', 1, 205000]]],
    ['Kiran Joshi', 'kitchen', 'savistar', 'AI/26-27/016', 'Kitchen and wardrobes — stage 1', -3, 12, '15 days', 'sent', [['Kitchen carcasses and installation, stage 1', '995461', 1, 152000]]],
    ['Sahil & Ritu Kapadia', null, 'saag', 'AF/26-27/037', 'Bookshelf wall — 50% advance', 0, 0, 'Advance', 'paid', [['Advance against bookshelf wall (quotation accepted)', '9403', 1, 26250]]],
  ],
  receipt: [30975, 'Sahil & Ritu Kapadia', 'Advance, invoice AF/26-27/037'], oldReceipt: 'Stage 2 receipt, NEFT',
  oldTask: 'Collect cheque from Northbridge', newTask: 'Send the workstation first-lot invoice to Northbridge',
  quotes: [['Sahil & Ritu Kapadia', 'Kapadia study — bookshelf wall', 'study', 'accepted', -34], ['Dr. Nisha Trivedi', 'Trivedi clinic — reception desk', 'reception', 'declined', -31]],
  delivered: [['Greenleaf Montessori', null, 'Reading corner bookshelves', 3, -88, -60, -61], ['Anand & Priya Mehta', 'full', 'Pooja unit, solid teak', 1, -55, -32, -32], ['Northbridge Consultants Pvt Ltd', 'office', 'Reception desk, Corian top', 1, -38, -20, -16]],
  wages: 'Wages, daily workers',
};

// 6a. Costs on every project.
for (const [name, material, notes] of D.vendors) await vendor(name, material, notes);
for (const [v, item, qty, rate, proj, ord, ordered, delivered] of D.pos) await po(v, item, qty, rate, D[proj], ord && D[ord], ordered, delivered);
for (const [d, amount, v, description] of D.pay) await cashOnce(d, 'debit', amount, v, 'vendor', await vendor(v), description);
// The finished living room's workshop days (it was delivered before the seed's three weeks of work logs).
const livingOrder = await orderId(D.livingOrder);
if (livingOrder && !(await id('SELECT id FROM work_logs WHERE order_id = ? AND is_deleted_record = 0', [livingOrder]))) {
  let n = 0;
  for (let d = -92; d <= -74 && n < D.livingDays * 2; d++) {
    if (new Date(day(d)).getUTCDay() === 0) continue;
    for (const name of D.livingCrew) { await execute("INSERT INTO work_logs (employee_id, order_id, date, start_time, end_time, description, rating, created_by) VALUES (?, ?, ?, '09:30', '18:00', ?, 4, 'office')", [await emp(name), livingOrder, day(d), n % 3 ? 'Carcass and veneer work' : 'Sanding and polish']); n++; }
  }
  log(`living room work logs: ${n}`);
}
// The kitchen boxes were built by the helper, whose logs all sat on the office workstations.
const kitchenOrder = await orderId(D.kitchenOrder), officeOrder = await id('SELECT id FROM orders WHERE project_id = ? AND status = ? AND is_deleted_record = 0', [await pr(D.office), 'in_progress']);
if (kitchenOrder && !(await id('SELECT id FROM work_logs WHERE order_id = ? AND is_deleted_record = 0', [kitchenOrder]))) {
  const r = await execute('UPDATE work_logs SET order_id = ?, description = ? WHERE employee_id = ? AND order_id = ? AND date BETWEEN ? AND ?', [kitchenOrder, 'Kitchen box assembly', await emp(D.helper), officeOrder, day(-12), day(-2)]);
  log(`kitchen work logs moved from the office job: ${r.changes}`);
}

// 6b. Invoices, and today's receipt against a real one.
for (const [c, p, company, no, title, sub, due, terms, status, lines] of D.invoices) await invoice(c, p && D[p], company, no, title, sub, due, terms, status, lines);
await execute('UPDATE cash_transactions SET is_deleted_record = 1 WHERE description = ? AND is_deleted_record = 0', [D.oldReceipt]);
await cashOnce(0, 'credit', D.receipt[0], D.receipt[1], 'client', await cl(D.receipt[1]), D.receipt[2]);
await execute('UPDATE tasks SET title = ? WHERE title = ?', [D.newTask, D.oldTask]); // Northbridge owes nothing; its first-lot invoice is still a draft

// 6c. Last month's payroll for everyone: salaries for last month paid on the 1st, daily wages worked out from attendance.
const lastMonth = day(-Number(today.slice(8, 10))).slice(0, 7), payOn = `${today.slice(0, 7)}-01`;
if (!(await id('SELECT id FROM payroll_payments WHERE period = ?', [lastMonth]))) {
  const latest = (await queryOne('SELECT MAX(period) AS p FROM payroll_payments'))?.p;
  if (latest) await execute('UPDATE payroll_payments SET period = ?, paid_on = ? WHERE period = ?', [lastMonth, payOn, latest]);
  await execute("UPDATE cash_transactions SET date = ? WHERE description = 'Monthly salaries' AND is_deleted_record = 0", [payOn]);
}
const unpaid = await queryAll(`SELECT e.id, e.name, e.pay_rate,
    (SELECT COALESCE(SUM(CASE a.status WHEN 'present' THEN 1 WHEN 'half' THEN 0.5 ELSE 0 END), 0) FROM attendance a WHERE a.employee_id = e.id AND a.is_deleted_record = 0 AND substr(a.date, 1, 7) = ?) AS days,
    (SELECT COALESCE(SUM(x.amount), 0) FROM employee_expenses x WHERE x.employee_id = e.id AND x.kind = 'advance' AND x.is_deleted_record = 0 AND substr(x.date, 1, 7) = ?) AS adv
  FROM employees e WHERE e.pay_type = 'daily' AND e.is_deleted_record = 0
    AND NOT EXISTS (SELECT 1 FROM payroll_payments p WHERE p.employee_id = e.id AND p.period = ?)`, [lastMonth, lastMonth, lastMonth]);
let wages = 0;
for (const e of unpaid.filter((x) => x.days > 0)) {
  const gross = e.days * e.pay_rate, net = gross - e.adv; wages += net;
  await execute('INSERT INTO payroll_payments (employee_id, period, gross, deductions, net, paid_on, notes) VALUES (?, ?, ?, ?, ?, ?, ?)', [e.id, lastMonth, gross, e.adv, net, payOn, e.adv ? 'Advance recovered' : 'Paid in cash']);
  log(`payroll ${lastMonth}: ${e.name} ${e.days} days, net ${net}`);
}
if (wages) await execute("INSERT INTO cash_transactions (date, kind, amount, party, description, created_by) VALUES (?, 'debit', ?, 'Payroll', ?, 'owner')", [payOn, wages, `${D.wages}, ${lastMonth}`]);

// 6d. Quotes decided last month (one won, one lost).
L.reception = { description: 'Reception desk with quartz top\n\n18 mm plywood carcass, laminate finish, quartz top, cable tray and drawer pedestal.', unit: 'rft', dims: '8', qty: 8, rate: US ? 420 : 11500 };
for (const [c, title, line, decision, ago] of D.quotes) {
  const before = await id('SELECT id FROM quotations WHERE title = ? AND is_deleted_record = 0', [title]);
  const qid = await quote({ client: await cl(c), title, lines: items([line], 'Furniture'), then: async (x) => { await Q.sendQuotation(x, owner, 0); await Q.decideQuotation(x, decision); } });
  if (!before) await execute('UPDATE quotations SET quoted_on = ?, sent_on = ?, valid_until = ?, decided_on = ? WHERE id = ?', [day(ago - 12), day(ago - 12), day(ago + 18), day(ago), qid]);
}

// 6e. Older delivered orders: two on time, one 4 days late.
for (const [c, p, item, qty, start, due, delivered] of D.delivered) {
  if (await orderId(item)) continue;
  await execute("INSERT INTO orders (client_id, project_id, item, qty, description, status, start_date, due_date, delivered_at) VALUES (?, ?, ?, ?, ?, 'delivered', ?, ?, ?)",
    [await cl(c), p ? await pr(D[p]) : null, item, qty, `${item} — ${qty} no(s)`, day(start), day(due), day(delivered)]);
  log(`delivered order: ${item} (${delivered > due ? `${delivered - due}d late` : 'on time'})`);
}

console.log('Done.');
process.exit(0);
