// Builds the demo data (Acme Interiors + Acme Furniture, two made-up sister companies in Ahmedabad) in an
// EMPTY Turso database, which then becomes the golden copy the nightly reset restores
// (workers/demo-reset-cron).
//
// 1. Start the Node build against that database:   TURSO_URL=... TURSO_AUTH_TOKEN=... SESSION_SECRET=... next start -p 8791
// 2. Run:   DB_URL=... DB_TOKEN=... BASE=http://localhost:8791 node scripts/demo/seed.mjs
// 3. Check: DB_URL=... DB_TOKEN=... node scripts/demo/scrub-check.mjs
//
// The app's first request creates the schema (lib/db.js migrate) and its default logins; this script
// replaces those logins with the demo ones, then enters everything else through the real API, so
// derived values (PO balances, freight checks, payroll) behave exactly as in real use.
import { createClient } from '@libsql/client/web';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const { DB_URL, DB_TOKEN, BASE = 'http://localhost:8791' } = process.env;
if (!DB_URL || !/sav-demo/.test(DB_URL)) throw new Error('DB_URL must be a sav-demo database (never the live one)');
const db = createClient({ url: DB_URL, authToken: DB_TOKEN });

// --- helpers ---------------------------------------------------------------------------------------
const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const cookies = {};
async function login(username, password) {
  const res = await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!res.ok) throw new Error(`login ${username} failed: ${res.status}`);
  cookies[username] = res.headers.get('set-cookie').split(';')[0];
}
async function api(as, method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', cookie: cookies[as] }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${as} ${method} ${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}
const idOf = (r) => r.id ?? r.lastId ?? r.data?.id;

// --- 1. Schema + logins ----------------------------------------------------------------------------
// The first login makes the app migrate and create its default accounts; then they are replaced.
const seeded = await db.execute("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'table' AND name = 'clients'");
if (Number(seeded.rows[0].n)) {
  const n = await db.execute('SELECT COUNT(*) n FROM clients');
  if (Number(n.rows[0].n)) throw new Error('Database already has clients; seed only a fresh one');
}
await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'x', password: 'x' }) });
const PASSWORD = randomBytes(18).toString('base64url'); // never printed; visitors enter through /demo
const hash = bcrypt.hashSync(PASSWORD, 10);
await db.batch([
  'DELETE FROM users',
  { sql: 'INSERT INTO users (username, password, role, display_name, avatar_color) VALUES (?, ?, ?, ?, ?)', args: ['owner', hash, 'owner', 'Meera Shah', '#8b5cf6'] },
  { sql: 'INSERT INTO users (username, password, role, display_name, avatar_color) VALUES (?, ?, ?, ?, ?)', args: ['manager', hash, 'manager', 'Rohan Desai', '#06b6d4'] },
  { sql: 'INSERT INTO users (username, password, role, display_name, avatar_color) VALUES (?, ?, ?, ?, ?)', args: ['office', hash, 'user', 'Kavya Patel', '#ec4899'] },
], 'write');
for (const u of ['owner', 'manager', 'office']) await login(u, PASSWORD);

// --- 2. Clients --------------------------------------------------------------------------------------
// Phone numbers are 99999 000xx so none can belong to a real person.
const CLIENTS = [
  ['Anand & Priya Mehta', '9999900101', 'Bungalow 14, Green Meadows, Bodakdev', '3BHK bungalow, full interiors; prefers warm oak and brass.'],
  ['Kiran Joshi', '9999900102', 'B-902, Sky Heights, Prahlad Nagar', 'Kitchen and wardrobes only; tight timeline before Diwali.'],
  ['Brewnest Cafe LLP', '9999900103', 'Ground floor, Sindhu Bhavan Road', 'Second outlet; same palette as their first cafe.'],
  ['Northbridge Consultants Pvt Ltd', '9999900104', '7th floor, Northbridge House, Satellite', 'Office fit-out for 40 seats, two meeting rooms.'],
  ['Dr. Nisha Trivedi', '9999900105', 'Clinic, Navrangpura', 'Dental clinic reception and two cabins.'],
  ['Sahil & Ritu Kapadia', '9999900106', 'A-301, Riverview Residency, Usmanpura', 'Living room and study; furniture only.'],
  ['Greenleaf Montessori', '9999900107', 'Thaltej', 'Child-safe furniture for three classrooms.'],
  ['Vikram Rathod', '9999900108', 'Farmhouse, Gandhinagar Highway', 'Enquiry: farmhouse refurbishment, budget pending.'],
  ['Harsh & Komal Vora', '9999900109', 'Penthouse, Lake View Towers, Vastrapur', 'Penthouse interiors; cancelled after design stage (moved city).'],
];
const client = {};
const clientAddress = {};
for (const [name, phone, address, notes] of CLIENTS) {
  client[name] = idOf(await api('owner', 'POST', '/api/clients', { name, phone, address, notes, email: `${name.split(/[ &.]/)[0].toLowerCase()}@example.com` }));
  clientAddress[name] = address;
}

// --- 3. Projects (design studio) with milestones and site visits ---------------------------------------
// [client, name, status, started (days ago), milestones [title, due (days from now), done]]
const PROJECTS = [
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'active', 75, [['Design sign-off', -60, true], ['Civil and electrical done', -30, true], ['False ceiling and paint', -5, true], ['Furniture installation', 10, false], ['Handover', 25, false]]],
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 'active', 40, [['Layout approved', -32, true], ['Partitions and ceiling', -8, true], ['Workstations installed', 6, false], ['Handover', 20, false]]],
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 'active', 28, [['Concept board approved', -20, true], ['Counter and seating fabrication', 3, false], ['Opening', 18, false]]],
  ['Kiran Joshi', 'Joshi apartment — kitchen and wardrobes', 'active', 20, [['Measurements', -18, true], ['Kitchen carcass install', 4, false], ['Shutters and hardware', 12, false]]],
  ['Dr. Nisha Trivedi', 'Trivedi dental clinic', 'on_hold', 50, [['Design sign-off', -35, true], ['Approval from society', 30, false]]],
  ['Sahil & Ritu Kapadia', 'Kapadia living room', 'completed', 120, [['Design sign-off', -110, true], ['Installation', -70, true], ['Handover', -65, true]]],
  ['Harsh & Komal Vora', 'Vora penthouse interiors', 'cancelled', 90, [['Concept presentation', -80, true], ['Design sign-off', -60, false]]],
];
// Material palettes for the project cards' swatch strips (projects.materials, savistar-ops PR #2).
// Trivedi is left empty on purpose: it shows a project with no palette yet.
const MATERIALS = {
  'Mehta bungalow — full interiors': 'warm oak, brass, teak, ivory',
  'Northbridge office fit-out, 40 seats': 'ash, charcoal, glass, steel',
  'Brewnest cafe, Sindhu Bhavan Road': 'terrazzo, cane, sage, black',
  'Joshi apartment — kitchen and wardrobes': 'white lacquer, quartz, oak, brass',
  'Kapadia living room': 'teak, linen, olive, brass',
  'Vora penthouse interiors': 'marble, walnut, brass, velvet',
};
const project = {};
for (const [c, name, status, ago, milestones] of PROJECTS) {
  const id = idOf(await api('owner', 'POST', '/api/projects', { client_id: client[c], name, status, start_date: day(-ago), notes: 'Site supervisor: Imran.', materials: MATERIALS[name] }));
  project[name] = id;
  // Creating a project takes no address (it's added later from the project page), so set it here.
  await db.execute({ sql: 'UPDATE projects SET address = ? WHERE id = ?', args: [clientAddress[c], id] });
  for (const [title, due, done] of milestones) {
    const m = idOf(await api('manager', 'POST', '/api/milestones', { project_id: id, title, due_date: day(due) }));
    if (done) {
      await api('manager', 'PUT', `/api/milestones/${m}`, { status: 'done' });
      // The API stamps completed_at with "now"; a milestone done 60 days ago should say so.
      await db.execute({ sql: 'UPDATE milestones SET completed_at = ? WHERE id = ?', args: [`${day(due)} 17:00:00`, m] });
    }
  }
}
const VISITS = [
  ['Mehta bungalow — full interiors', -3, 'Rohan Desai', 'Paint finish checked in living room; touch-ups needed near stair railing.'],
  ['Mehta bungalow — full interiors', -17, 'Meera Shah', 'Client walk-through; approved brass handles for wardrobes.'],
  ['Northbridge office fit-out, 40 seats', -2, 'Rohan Desai', 'Partition glass fixed; cable trays pending from electrician.'],
  ['Brewnest cafe, Sindhu Bhavan Road', -6, 'Meera Shah', 'Counter dimensions re-measured: +40 mm for coffee machine.'],
  ['Joshi apartment — kitchen and wardrobes', -1, 'Rohan Desai', 'Kitchen wall uneven by 12 mm; carcass to be scribed on site.'],
];
for (const [p, d, by, notes] of VISITS) await api('manager', 'POST', '/api/site-visits', { project_id: project[p], visit_date: day(d), visited_by: by, notes });

// --- 4. Workshop people ----------------------------------------------------------------------------------
// [name, profession, pay_type, rate, joined (days ago)]
const PEOPLE = [
  ['Ramesh Prajapati', 'Carpenter (head)', 'salary', 32000, 900], ['Suresh Chauhan', 'Carpenter', 'daily', 950, 600],
  ['Imran Shaikh', 'Site supervisor', 'salary', 28000, 700], ['Mahesh Solanki', 'Polish and finishing', 'daily', 850, 420],
  ['Dinesh Parmar', 'Helper', 'daily', 600, 200], ['Javed Mansuri', 'Fitter', 'daily', 900, 350],
];
const emp = {};
let phoneNo = 201;
for (const [name, profession, pay_type, pay_rate, ago] of PEOPLE) emp[name] = idOf(await api('owner', 'POST', '/api/employees', { name, profession, pay_type, pay_rate, joined_at: day(-ago), phone: `9999900${phoneNo++}` }));

// --- 5. Workshop orders (furniture) and who worked on them ------------------------------------------------
// [client, project or null, item, qty, status, started (days ago), due (days from now)]
const ORDERS = [
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'Master bedroom wardrobe, oak veneer', 1, 'in_progress', 14, 6],
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'Dining table, 6-seater, solid teak', 1, 'pending', 0, 15],
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 'Linear workstations, 4-seater module', 10, 'in_progress', 10, 5],
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 'Cafe counter with fluted front', 1, 'in_progress', 6, 3],
  ['Greenleaf Montessori', null, 'Low activity tables, rounded edges', 12, 'pending', 0, 21],
  ['Sahil & Ritu Kapadia', 'Kapadia living room', 'TV unit and study table', 2, 'delivered', 95, -72],
  ['Kiran Joshi', 'Joshi apartment — kitchen and wardrobes', 'Kitchen carcasses, 14 units', 14, 'done', 12, -1],
  ['Harsh & Komal Vora', 'Vora penthouse interiors', 'Walk-in wardrobe, lacquered', 1, 'cancelled', 70, -40],
];
const order = {};
for (const [c, p, item, qty, status, start, due] of ORDERS) {
  order[item] = idOf(await api('owner', 'POST', '/api/orders', { client_id: client[c], project_id: p ? project[p] : null, item, qty, status, start_date: day(-start), due_date: day(due), description: `${item} — ${qty} no(s)` }));
  // POST doesn't stamp delivered_at (only a status change does, with today's date); delivered on its due date.
  if (status === 'delivered') await db.execute({ sql: 'UPDATE orders SET delivered_at = ? WHERE id = ?', args: [day(due), order[item]] });
}

// Three weeks of attendance and work logs (Mon-Sat), so the daily worksheet and payroll have history.
const WORK = {
  'Ramesh Prajapati': ['Master bedroom wardrobe, oak veneer', 'Cafe counter with fluted front'],
  'Suresh Chauhan': ['Linear workstations, 4-seater module', 'Master bedroom wardrobe, oak veneer'],
  'Mahesh Solanki': ['Master bedroom wardrobe, oak veneer', 'Cafe counter with fluted front'],
  'Dinesh Parmar': ['Linear workstations, 4-seater module'],
  'Javed Mansuri': ['Linear workstations, 4-seater module', 'Cafe counter with fluted front'],
};
const TASKS = ['Carcass assembly', 'Edge banding', 'Veneer pressing', 'Sanding and first coat', 'Hardware fitting', 'Shutter alignment'];
for (let d = -20; d <= 0; d++) {
  const date = day(d);
  if (new Date(date).getUTCDay() === 0) continue; // Sunday off
  let k = 0;
  for (const [name, id] of Object.entries(emp)) {
    const absent = (d + name.length) % 11 === 0;
    await api('office', 'POST', '/api/attendance', { employee_id: id, date, status: absent ? 'absent' : (d + name.length) % 7 === 0 ? 'half' : 'present', in_time: absent ? null : '09:30', out_time: absent ? null : '18:30' });
    if (absent || !WORK[name]) continue;
    const item = WORK[name][(d + 30) % WORK[name].length];
    await api('office', 'POST', '/api/work-logs', { employee_id: id, order_id: order[item], date, start_time: '09:30', end_time: '18:00', description: TASKS[(d + 30 + k++) % TASKS.length], rating: 3 + ((d + name.length) % 3) });
  }
}
await api('office', 'POST', '/api/expenses', { employee_id: emp['Imran Shaikh'], date: day(-4), amount: 1450, kind: 'expense', description: 'Auto and parking for site visits' });
await api('office', 'POST', '/api/expenses', { employee_id: emp['Suresh Chauhan'], date: day(-9), amount: 3000, kind: 'advance', description: 'Advance against salary' });
await api('office', 'POST', '/api/expenses', { employee_id: emp['Dinesh Parmar'], date: day(-12), amount: 1500, kind: 'advance', description: 'Advance against salary' });
await api('office', 'POST', '/api/expenses', { employee_id: emp['Imran Shaikh'], date: day(-38), amount: 1000, kind: 'advance', description: 'Advance against salary' });
// Salaries for last calendar month, paid on the 1st of this one.
const payDay = `${day(0).slice(0, 7)}-01`;
const lastMonth = day(-new Date().getUTCDate()).slice(0, 7);
await api('owner', 'POST', '/api/payroll', { employee_id: emp['Ramesh Prajapati'], period: lastMonth, gross: 32000, deductions: 0, net: 32000, paid_on: payDay, notes: 'Paid by bank transfer' });
await api('owner', 'POST', '/api/payroll', { employee_id: emp['Imran Shaikh'], period: lastMonth, gross: 28000, deductions: 1000, net: 27000, paid_on: payDay, notes: 'Advance recovered' });

// --- 6. Vendors, POs, deliveries, freight ---------------------------------------------------------------
const VENDORS = [
  ['Shree Plywood Traders', 'Plywood and MDF', 'BWP plywood, 18 mm and 12 mm'], ['Kalpana Hardware', 'Hardware', 'Hinges, channels, handles'],
  ['Laminate House', 'Laminates and veneers', 'Oak and walnut veneers'], ['Crystal Glass Works', 'Glass', 'Toughened glass for partitions'],
  ['Sardar Transport', 'Transport', 'Tempo and pickup, Ahmedabad and Gandhinagar'],
];
const vendor = {};
for (const [name, material, notes] of VENDORS) vendor[name] = idOf(await api('owner', 'POST', '/api/vendors', { name, material, notes, phone: `9999900${phoneNo++}` }));
// [vendor, item, qty, rate, for project, for order, ordered (days ago), [delivered qty, days ago, returned]]
const POS = [
  ['Shree Plywood Traders', 'BWP plywood 18 mm (8x4)', 40, 2650, 'Mehta bungalow — full interiors', 'Master bedroom wardrobe, oak veneer', 18, [[25, 15, 0], [15, 8, 1]]],
  ['Shree Plywood Traders', 'BWP plywood 18 mm (8x4)', 60, 2600, 'Northbridge office fit-out, 40 seats', 'Linear workstations, 4-seater module', 12, [[40, 9, 0]]],
  ['Laminate House', 'Oak veneer sheet', 30, 1850, 'Mehta bungalow — full interiors', 'Master bedroom wardrobe, oak veneer', 16, [[30, 12, 2]]],
  ['Kalpana Hardware', 'Soft-close hinges (pair)', 120, 240, 'Mehta bungalow — full interiors', null, 10, [[120, 7, 0]]],
  ['Crystal Glass Works', '12 mm toughened glass panel', 14, 6800, 'Northbridge office fit-out, 40 seats', null, 20, [[14, 11, 0]]],
  ['Laminate House', 'Fluted MDF panel', 18, 2200, 'Brewnest cafe, Sindhu Bhavan Road', 'Cafe counter with fluted front', 5, []],
];
const po = [];
for (const [v, item, qty, rate, p, o, ago, deliveries] of POS) {
  const id = idOf(await api('manager', 'POST', '/api/vendor-pos', { vendor_id: vendor[v], item, qty_ordered: qty, rate, project_id: project[p], order_id: o ? order[o] : null, ordered_on: day(-ago), notes: 'Delivery to workshop, Vatva' }));
  po.push(id);
  for (const [q, d, ret] of deliveries) await api('manager', 'POST', `/api/vendor-pos/${id}/deliveries`, { qty_delivered: q, qty_returned: ret, date: day(-d), notes: ret ? `${ret} returned: edge damage` : 'Received in full' });
}
// Freight against a rate card; the Gandhinagar trip is billed above the agreed rate on purpose.
await api('owner', 'POST', '/api/vendor-rates', { vendor_id: vendor['Sardar Transport'], from_loc: 'Vatva', to_loc: 'Bodakdev', expected_amount: 1800 });
await api('owner', 'POST', '/api/vendor-rates', { vendor_id: vendor['Sardar Transport'], from_loc: 'Vatva', to_loc: 'Satellite', expected_amount: 1600 });
await api('owner', 'POST', '/api/vendor-rates', { vendor_id: vendor['Sardar Transport'], from_loc: 'Vatva', to_loc: 'Gandhinagar', expected_amount: 2600 });
await api('manager', 'POST', '/api/freight', { vendor_id: vendor['Sardar Transport'], from_loc: 'Vatva', to_loc: 'Bodakdev', amount: 1800, date: day(-7), vendor_po_id: po[0], notes: 'Wardrobe carcasses to site' });
await api('manager', 'POST', '/api/freight', { vendor_id: vendor['Sardar Transport'], from_loc: 'Vatva', to_loc: 'Satellite', amount: 1600, date: day(-5), vendor_po_id: po[1], notes: 'Workstation panels' });
await api('manager', 'POST', '/api/freight', { vendor_id: vendor['Sardar Transport'], from_loc: 'Vatva', to_loc: 'Gandhinagar', amount: 3400, date: day(-3), notes: 'Sample furniture for farmhouse enquiry' });

// --- 7. Money: invoices and the cash book ------------------------------------------------------------------
// Every client receipt in the cash book matches an invoice total (base + 18% GST) to the rupee.
// [client, project, company, no, title, submitted (days ago, null = draft), due (days from now), terms, status, items [desc, hsn, qty, unit]]
const INVOICES = [
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'savistar', 'AI/26-27/009', 'Interior design and execution — stage 1', -45, -38, '50% on stage completion', 'paid',
    [['Design and supervision fee, stage 1', '998391', 1, 120000], ['Civil and electrical works', '995461', 1, 92000]]], // 2,50,160
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 'savistar', 'AI/26-27/011', 'Advance — counter and seating', -27, -26, 'Advance', 'paid',
    [['Advance against counter and seating fabrication', '995461', 1, 100000]]], // 1,18,000
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'savistar', 'AI/26-27/014', 'Interior design and execution — stage 2', -10, 5, '50% on stage completion', 'sent',
    [['Design and supervision fee, stage 2', '998391', 1, 185000], ['False ceiling and painting works', '995461', 1, 342000]]], // 6,21,860 outstanding
  ['Sahil & Ritu Kapadia', 'Kapadia living room', 'saag', 'AF/26-27/031', 'TV unit and study table', -70, -55, 'On delivery', 'paid',
    [['TV unit, walnut veneer, 2400 mm', '9403', 1, 96000], ['Study table with drawers', '9403', 1, 38000]]], // 1,58,120
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 'saag', 'AF/26-27/033', 'Mobilisation advance', -31, -24, 'Advance', 'paid',
    [['Mobilisation advance, 40-seat office fit-out', '9403', 1, 250000]]], // 2,95,000
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 'saag', 'AF/26-27/036', 'Workstations — first lot', null, 14, '30 days', 'draft',
    [['Linear workstation, 4-seater module', '9403', 5, 64000]]],
];
for (const [c, p, company, invoice_no, title, sub, due, payment_terms, status, items] of INVOICES) {
  await api('owner', 'POST', '/api/invoices', {
    client_id: client[c], project_id: project[p], company, invoice_no, title, payment_terms, status,
    submitted_on: sub === null ? null : day(sub), due_date: day(due),
    items: items.map(([description, hsn, qty, unit_price]) => ({ description, hsn, gst_pct: 18, qty, unit_price })),
  });
}
// [date, kind, amount, party, party type, description, by]; party type links the entry to that client or vendor.
const CASH = [
  [day(-62), 'credit', 158120, 'Sahil & Ritu Kapadia', 'client', 'Final payment, invoice AF/26-27/031', 'owner'],
  [day(-41), 'credit', 250160, 'Anand & Priya Mehta', 'client', 'Stage 1 payment, invoice AI/26-27/009', 'owner'],
  [day(-30), 'credit', 295000, 'Northbridge Consultants Pvt Ltd', 'client', 'Mobilisation advance, invoice AF/26-27/033', 'owner'],
  [day(-26), 'credit', 118000, 'Brewnest Cafe LLP', 'client', 'Advance, invoice AI/26-27/011', 'owner'],
  [day(-15), 'debit', 66250, 'Shree Plywood Traders', 'vendor', 'Plywood, first delivery', 'manager'],
  [payDay, 'debit', 59000, 'Payroll', null, 'Monthly salaries', 'owner'],
  [day(-11), 'debit', 95200, 'Crystal Glass Works', 'vendor', 'Partition glass', 'manager'],
  [day(-8), 'debit', 28800, 'Kalpana Hardware', 'vendor', 'Hinges', 'manager'],
  [day(-7), 'debit', 1800, 'Sardar Transport', 'vendor', 'Freight, Vatva to Bodakdev', 'office'],
  [day(-5), 'debit', 1600, 'Sardar Transport', 'vendor', 'Freight, Vatva to Satellite', 'office'],
  [day(-4), 'debit', 2350, 'Workshop', null, 'Sandpaper, glue and fevicol', 'office'],
  [day(-2), 'debit', 780, 'Office', null, 'Tea and courier', 'office'],
];
for (const [date, kind, amount, party, party_type, description, by] of CASH) {
  const party_id = party_type === 'client' ? client[party] : party_type === 'vendor' ? vendor[party] : null;
  await api(by, 'POST', '/api/cash', { date, kind, amount, party, party_type, party_id, description });
}

// --- 8. Client conversations ------------------------------------------------------------------------------
// [client, project or null, days ago, by, message]
const CONVERSATIONS = [
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 70, 'owner', 'Kick-off at site. Priya wants warm oak throughout, brass accents only in the dining area.'],
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 17, 'owner', 'Walk-through done. Brass handles approved for wardrobes; dining table moved to teak.'],
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 3, 'manager', 'Shared paint touch-up schedule on WhatsApp; Anand confirmed Saturday access.'],
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 38, 'owner', 'Layout signed off by their admin head. Two meeting rooms need acoustic panels.'],
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 2, 'manager', 'Electrician delay on cable trays; told them workstations shift by two days.'],
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 25, 'owner', 'Concept board approved. Same terrazzo as the first outlet; fluted counter front.'],
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 6, 'owner', 'New coffee machine is 40 mm wider; counter drawing to be revised.'],
  ['Kiran Joshi', 'Joshi apartment — kitchen and wardrobes', 19, 'manager', 'Measurements taken. Kiran needs the kitchen working before Diwali guests arrive.'],
  ['Dr. Nisha Trivedi', 'Trivedi dental clinic', 30, 'owner', 'On hold: society wants an NOC before any work in the commercial wing.'],
  ['Sahil & Ritu Kapadia', 'Kapadia living room', 64, 'owner', 'Handover done; Ritu asked about a matching shoe cabinet later in the year.'],
  ['Harsh & Komal Vora', 'Vora penthouse interiors', 58, 'owner', 'Harsh is relocating to Pune for work; project cancelled after design. Concept fee settled.'],
  ['Vikram Rathod', null, 9, 'owner', 'First call: farmhouse refurbishment, 4 rooms and a verandah. Waiting on his budget.'],
  ['Greenleaf Montessori', null, 14, 'manager', 'Principal wants rounded edges and non-toxic finish on all tables; sample to be shown.'],
];
for (const [c, p, ago, by, body] of CONVERSATIONS) {
  const id = idOf(await api(by, 'POST', `/api/clients/${client[c]}/conversations`, { project_id: p ? project[p] : null, body }));
  await db.execute({ sql: 'UPDATE client_conversations SET created_at = ? WHERE id = ?', args: [`${day(-ago)} 11:30:00`, id] });
}

// --- 9. Tasks on the calendar ----------------------------------------------------------------------------
// [title, due (days from now), assigned to, client, done]
const TASK_LIST = [
  ['Confirm handle finish with Mehta family', 0, 'manager', 'Anand & Priya Mehta', false], ['Send revised counter drawing to Brewnest', 1, 'owner', 'Brewnest Cafe LLP', false],
  ['Collect cheque from Northbridge', 3, 'office', 'Northbridge Consultants Pvt Ltd', false], ['Follow up farmhouse budget', 2, 'owner', 'Vikram Rathod', false],
  ['Book glass delivery slot', -1, 'manager', null, true], ['Society NOC for Trivedi clinic', 7, 'manager', 'Dr. Nisha Trivedi', false],
  ['Courier stage 2 invoice copy to Mehta family', 0, 'office', 'Anand & Priya Mehta', false], ['File plywood bills from site', -3, 'office', null, true],
];
for (const [title, due, to, c, done] of TASK_LIST) {
  const id = idOf(await api('owner', 'POST', '/api/tasks', { title, due_date: day(due), assigned_to: to, client_id: c ? client[c] : null }));
  if (done) await api(to, 'PUT', `/api/tasks/${id}`, { status: 'done' });
}

// The nightly reset (workers/demo-reset-cron) moves every date forward by (today − seeded_on).
await db.batch(['CREATE TABLE IF NOT EXISTS demo_meta (seeded_on TEXT NOT NULL)', 'DELETE FROM demo_meta', { sql: 'INSERT INTO demo_meta VALUES (?)', args: [day(0)] }], 'write');

const counts = {};
for (const t of ['users', 'clients', 'client_conversations', 'projects', 'milestones', 'site_visits', 'orders', 'employees', 'attendance', 'work_logs', 'vendors', 'vendor_pos', 'vendor_deliveries', 'freight_charges', 'employee_expenses', 'payroll_payments', 'invoices', 'invoice_items', 'cash_transactions', 'tasks']) {
  counts[t] = Number((await db.execute(`SELECT COUNT(*) n FROM ${t}`).catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n);
}
console.log('Acme Interiors / Acme Furniture demo data seeded:', counts);
const empty = Object.entries(counts).filter(([, n]) => n <= 0).map(([t]) => t);
if (empty.length) throw new Error(`Empty tables after seeding: ${empty.join(', ')}`);
