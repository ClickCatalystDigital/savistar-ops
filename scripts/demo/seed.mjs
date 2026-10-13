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
const CLIENTS = [
  ['Anand & Priya Mehta', '9824000101', 'Bungalow 14, Shivalik Greens, Bodakdev', '3BHK bungalow, full interiors; prefers warm oak and brass.'],
  ['Kiran Joshi', '9824000102', 'B-902, Sky Heights, Prahlad Nagar', 'Kitchen and wardrobes only; tight timeline before Diwali.'],
  ['Brewnest Cafe LLP', '9824000103', 'Ground floor, Sindhu Bhavan Road', 'Second outlet; same palette as their first cafe.'],
  ['Northbridge Consultants Pvt Ltd', '9824000104', '7th floor, Venus Atlantis, Satellite', 'Office fit-out for 40 seats, two meeting rooms.'],
  ['Dr. Nisha Trivedi', '9824000105', 'Clinic, Navrangpura', 'Dental clinic reception and two cabins.'],
  ['Sahil & Ritu Kapadia', '9824000106', 'A-301, Riverview Residency, Usmanpura', 'Living room and study; furniture only.'],
  ['Greenleaf Montessori', '9824000107', 'Thaltej', 'Child-safe furniture for three classrooms.'],
  ['Vikram Rathod', '9824000108', 'Farmhouse, Gandhinagar Highway', 'Enquiry: farmhouse refurbishment, budget pending.'],
];
const client = {};
for (const [name, phone, address, notes] of CLIENTS) client[name] = idOf(await api('owner', 'POST', '/api/clients', { name, phone, address, notes, email: `${name.split(/[ &.]/)[0].toLowerCase()}@example.com` }));

// --- 3. Projects (design studio) with milestones and site visits ---------------------------------------
// [client, name, status, started (days ago), milestones [title, due (days from now), done]]
const PROJECTS = [
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'active', 75, [['Design sign-off', -60, true], ['Civil and electrical done', -30, true], ['False ceiling and paint', -5, true], ['Furniture installation', 10, false], ['Handover', 25, false]]],
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 'active', 40, [['Layout approved', -32, true], ['Partitions and ceiling', -8, true], ['Workstations installed', 6, false], ['Handover', 20, false]]],
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 'active', 28, [['Concept board approved', -20, true], ['Counter and seating fabrication', 3, false], ['Opening', 18, false]]],
  ['Kiran Joshi', 'Joshi apartment — kitchen and wardrobes', 'active', 20, [['Measurements', -18, true], ['Kitchen carcass install', 4, false], ['Shutters and hardware', 12, false]]],
  ['Dr. Nisha Trivedi', 'Trivedi dental clinic', 'on_hold', 50, [['Design sign-off', -35, true], ['Approval from society', 30, false]]],
  ['Sahil & Ritu Kapadia', 'Kapadia living room', 'completed', 120, [['Design sign-off', -110, true], ['Installation', -70, true], ['Handover', -65, true]]],
];
const project = {};
for (const [c, name, status, ago, milestones] of PROJECTS) {
  const id = idOf(await api('owner', 'POST', '/api/projects', { client_id: client[c], name, status, start_date: day(-ago), notes: 'Site supervisor: Imran.' }));
  project[name] = id;
  for (const [title, due, done] of milestones) {
    const m = idOf(await api('manager', 'POST', '/api/milestones', { project_id: id, title, due_date: day(due) }));
    if (done) await api('manager', 'PUT', `/api/milestones/${m}`, { status: 'done' });
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
  ['Ramesh Prajapati', 'Carpenter (head)', 'monthly', 32000, 900], ['Suresh Chauhan', 'Carpenter', 'daily', 950, 600],
  ['Imran Shaikh', 'Site supervisor', 'monthly', 28000, 700], ['Mahesh Solanki', 'Polish and finishing', 'daily', 850, 420],
  ['Dinesh Parmar', 'Helper', 'daily', 600, 200], ['Javed Mansuri', 'Fitter', 'daily', 900, 350],
];
const emp = {};
for (const [name, profession, pay_type, pay_rate, ago] of PEOPLE) emp[name] = idOf(await api('owner', 'POST', '/api/employees', { name, profession, pay_type, pay_rate, joined_at: day(-ago), phone: '9879000000' }));

// --- 5. Workshop orders (furniture) and who worked on them ------------------------------------------------
// [client, project or null, item, qty, status, started (days ago), due (days from now)]
const ORDERS = [
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'Master bedroom wardrobe, oak veneer', 1, 'in_progress', 14, 6],
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'Dining table, 6-seater, solid teak', 1, 'pending', 0, 15],
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 'Linear workstations, 4-seater module', 10, 'in_progress', 10, 5],
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 'Cafe counter with fluted front', 1, 'in_progress', 6, 3],
  ['Greenleaf Montessori', null, 'Low activity tables, rounded edges', 12, 'pending', 0, 21],
  ['Sahil & Ritu Kapadia', 'Kapadia living room', 'TV unit and study table', 2, 'delivered', 95, -72],
];
const order = {};
for (const [c, p, item, qty, status, start, due] of ORDERS) {
  order[item] = idOf(await api('owner', 'POST', '/api/orders', { client_id: client[c], project_id: p ? project[p] : null, item, qty, status, start_date: day(-start), due_date: day(due), description: `${item} — ${qty} no(s)` }));
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
  if (new Date(date).getDay() === 0) continue; // Sunday off
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
const lastMonth = day(-20).slice(0, 7);
await api('owner', 'POST', '/api/payroll', { employee_id: emp['Ramesh Prajapati'], period: lastMonth, gross: 32000, deductions: 0, net: 32000, paid_on: day(-12), notes: 'Paid by bank transfer' });
await api('owner', 'POST', '/api/payroll', { employee_id: emp['Imran Shaikh'], period: lastMonth, gross: 28000, deductions: 1000, net: 27000, paid_on: day(-12), notes: 'Advance recovered' });

// --- 6. Vendors, POs, deliveries, freight ---------------------------------------------------------------
const VENDORS = [
  ['Shree Plywood Traders', 'Plywood and MDF', 'BWP plywood, 18 mm and 12 mm'], ['Kalpana Hardware', 'Hardware', 'Hinges, channels, handles'],
  ['Laminate House', 'Laminates and veneers', 'Oak and walnut veneers'], ['Crystal Glass Works', 'Glass', 'Toughened glass for partitions'],
  ['Sardar Transport', 'Transport', 'Tempo and pickup, Ahmedabad and Gandhinagar'],
];
const vendor = {};
for (const [name, material, notes] of VENDORS) vendor[name] = idOf(await api('owner', 'POST', '/api/vendors', { name, material, notes, phone: '9898000000' }));
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
await api('owner', 'POST', '/api/invoices', {
  client_id: client['Anand & Priya Mehta'], project_id: project['Mehta bungalow — full interiors'], company: 'savistar', invoice_no: 'AI/26-27/014', title: 'Interior design and execution — stage 2',
  submitted_on: day(-10), due_date: day(5), payment_terms: '50% on stage completion', status: 'sent',
  items: [{ description: 'Design and supervision fee, stage 2', hsn: '998391', gst_pct: 18, qty: 1, unit_price: 185000 }, { description: 'False ceiling and painting works', hsn: '995461', gst_pct: 18, qty: 1, unit_price: 342000 }],
});
await api('owner', 'POST', '/api/invoices', {
  client_id: client['Sahil & Ritu Kapadia'], project_id: project['Kapadia living room'], company: 'saag', invoice_no: 'AF/26-27/031', title: 'TV unit and study table',
  submitted_on: day(-70), due_date: day(-55), payment_terms: 'On delivery', status: 'paid',
  items: [{ description: 'TV unit, walnut veneer, 2400 mm', hsn: '9403', gst_pct: 18, qty: 1, unit_price: 96000 }, { description: 'Study table with drawers', hsn: '9403', gst_pct: 18, qty: 1, unit_price: 38000 }],
});
await api('owner', 'POST', '/api/invoices', {
  client_id: client['Northbridge Consultants Pvt Ltd'], project_id: project['Northbridge office fit-out, 40 seats'], company: 'saag', invoice_no: 'AF/26-27/036', title: 'Workstations — first lot',
  submitted_on: day(-1), due_date: day(14), payment_terms: '30 days', status: 'draft',
  items: [{ description: 'Linear workstation, 4-seater module', hsn: '9403', gst_pct: 18, qty: 5, unit_price: 64000 }],
});
// [date, kind, amount, party, description, by]
const CASH = [
  [-62, 'credit', 160000, 'Sahil & Ritu Kapadia', 'Final payment, living room', 'owner'], [-41, 'credit', 250000, 'Anand & Priya Mehta', 'Stage 1 payment', 'owner'],
  [-30, 'credit', 300000, 'Northbridge Consultants Pvt Ltd', 'Mobilisation advance', 'owner'], [-26, 'credit', 120000, 'Brewnest Cafe LLP', 'Advance for counter and seating', 'owner'],
  [-15, 'debit', 66250, 'Shree Plywood Traders', 'Plywood, first delivery', 'manager'], [-12, 'debit', 59000, 'Payroll', 'Monthly salaries', 'owner'],
  [-11, 'debit', 95200, 'Crystal Glass Works', 'Partition glass', 'manager'], [-8, 'debit', 28800, 'Kalpana Hardware', 'Hinges', 'manager'],
  [-7, 'debit', 1800, 'Sardar Transport', 'Freight, Vatva to Bodakdev', 'office'], [-5, 'debit', 1600, 'Sardar Transport', 'Freight, Vatva to Satellite', 'office'],
  [-4, 'debit', 2350, 'Workshop', 'Sandpaper, glue and fevicol', 'office'], [-2, 'debit', 780, 'Office', 'Tea and courier', 'office'],
];
for (const [d, kind, amount, party, description, by] of CASH) await api(by, 'POST', '/api/cash', { date: day(d), kind, amount, party, description });

// --- 8. Tasks on the calendar ----------------------------------------------------------------------------
const TASK_LIST = [
  ['Confirm handle finish with Mehta family', 0, 'manager', 'Anand & Priya Mehta'], ['Send revised counter drawing to Brewnest', 1, 'owner', 'Brewnest Cafe LLP'],
  ['Collect cheque from Northbridge', 3, 'office', 'Northbridge Consultants Pvt Ltd'], ['Follow up farmhouse budget', 2, 'owner', 'Vikram Rathod'],
  ['Book glass delivery slot', -1, 'manager', null], ['Society NOC for Trivedi clinic', 7, 'manager', 'Dr. Nisha Trivedi'],
];
for (const [title, due, to, c] of TASK_LIST) await api('owner', 'POST', '/api/tasks', { title, due_date: day(due), assigned_to: to, client_id: c ? client[c] : null });

const counts = {};
for (const t of ['users', 'clients', 'projects', 'milestones', 'site_visits', 'orders', 'employees', 'attendance', 'work_logs', 'vendors', 'vendor_pos', 'vendor_deliveries', 'freight_charges', 'employee_expenses', 'payroll_payments', 'invoices', 'cash_transactions', 'tasks']) {
  counts[t] = Number((await db.execute(`SELECT COUNT(*) n FROM ${t}`).catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n);
}
console.log('Acme Interiors / Acme Furniture demo data seeded:', counts);
