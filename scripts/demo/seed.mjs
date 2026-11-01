// Builds the demo data (Acme Interiors + Acme Furniture, two made-up sister companies: in Ahmedabad from
// seed-data-in.mjs, or in Austin, Texas from seed-data-us.mjs with MARKET=NA) in an EMPTY Turso database, which then becomes the golden copy the nightly reset restores
// (workers/demo-reset-cron).
//
// 1. Start the Node build against that database:   TURSO_URL=... TURSO_AUTH_TOKEN=... SESSION_SECRET=... next start -p 8791
// 2. Run:   DB_URL=... DB_TOKEN=... BASE=http://localhost:8791 node scripts/demo/seed.mjs
// 3. Check: DB_URL=... DB_TOKEN=... node scripts/demo/scrub-check.mjs
//
// The app's first request creates the schema (lib/db.js migrate) and its default logins; this script
// replaces those logins with the demo ones, then enters everything else through the real API, so
// derived values (PO balances, freight checks, payroll) behave exactly as in real use.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const D = await import(process.env.MARKET === 'NA' ? './seed-data-us.mjs' : './seed-data-in.mjs');
const { CLIENTS, PROJECTS, MATERIALS, PHOTOS, VISITS, PEOPLE, ORDERS, WORK, TASKS, VENDORS, POS, INVOICES, CONVERSATIONS, TASK_LIST } = D;

const { DB_URL, DB_TOKEN, BASE = 'http://localhost:8791' } = process.env;
if (!DB_URL || !/sav(-us)?-demo/.test(DB_URL)) throw new Error('DB_URL must be a sav-demo or sav-us-demo database (never the live one)');
// A local file database (file:…, for testing a seed before it goes to Turso) needs the Node client.
const { createClient } = await import(DB_URL.startsWith('file:') ? '@libsql/client' : '@libsql/client/web');
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
  ...D.USERS.map(([username, role, name, color]) => ({ sql: 'INSERT INTO users (username, password, role, display_name, avatar_color) VALUES (?, ?, ?, ?, ?)', args: [username, hash, role, name, color] })),
], 'write');
for (const u of ['owner', 'manager', 'office']) await login(u, PASSWORD);

// --- 2. Clients --------------------------------------------------------------------------------------

const client = {};
const clientAddress = {};
for (const [name, phone, address, notes] of CLIENTS) {
  client[name] = idOf(await api('owner', 'POST', '/api/clients', { name, phone, address, notes, email: `${name.split(/[ &.]/)[0].toLowerCase()}@example.com` }));
  clientAddress[name] = address;
}

// --- 3. Projects (design studio) with milestones and site visits ---------------------------------------


const project = {};
for (const [c, name, status, ago, milestones] of PROJECTS) {
  const id = idOf(await api('owner', 'POST', '/api/projects', { client_id: client[c], name, status, start_date: day(-ago), notes: D.PROJECT_NOTES, materials: MATERIALS[name] }));
  project[name] = id;
  // Creating a project takes no address (it's added later from the project page), so set it here.
  await db.execute({ sql: 'UPDATE projects SET address = ? WHERE id = ?', args: [clientAddress[c], id] });
  // Sample photos (uploads are off in the demo, so written straight in). Free Unsplash images,
  // linked rather than copied as Unsplash asks; the last one listed is the card's cover.
  for (const [caption, photo] of PHOTOS[name] || []) {
    await db.execute({ sql: "INSERT INTO attachments (entity_type, entity_id, file_url, name, uploaded_by) VALUES ('project', ?, ?, ?, 'owner')",
      args: [id, `https://images.unsplash.com/photo-${photo}?w=1200&q=70&auto=format&fit=crop`, caption] });
  }
  for (const [title, due, done] of milestones) {
    const m = idOf(await api('manager', 'POST', '/api/milestones', { project_id: id, title, due_date: day(due) }));
    if (done) {
      await api('manager', 'PUT', `/api/milestones/${m}`, { status: 'done' });
      // The API stamps completed_at with "now"; a milestone done 60 days ago should say so.
      await db.execute({ sql: 'UPDATE milestones SET completed_at = ? WHERE id = ?', args: [`${day(due)} 17:00:00`, m] });
    }
  }
}

for (const [p, d, by, notes] of VISITS) await api('manager', 'POST', '/api/site-visits', { project_id: project[p], visit_date: day(d), visited_by: by, notes });

// --- 4. Workshop people ----------------------------------------------------------------------------------

const emp = {};
let phoneNo = 201;
for (const [name, profession, pay_type, pay_rate, ago] of PEOPLE) emp[name] = idOf(await api('owner', 'POST', '/api/employees', { name, profession, pay_type, pay_rate, joined_at: day(-ago), phone: D.phone(phoneNo++) }));

// --- 5. Workshop orders (furniture) and who worked on them ------------------------------------------------

const order = {};
for (const [c, p, item, qty, status, start, due] of ORDERS) {
  order[item] = idOf(await api('owner', 'POST', '/api/orders', { client_id: client[c], project_id: p ? project[p] : null, item, qty, status, start_date: day(-start), due_date: day(due), description: `${item} — ${qty} no(s)` }));
  // POST doesn't stamp delivered_at (only a status change does, with today's date); delivered on its due date.
  if (status === 'delivered') await db.execute({ sql: 'UPDATE orders SET delivered_at = ? WHERE id = ?', args: [day(due), order[item]] });
}

// Three weeks of attendance and work logs (Mon-Sat), so the daily worksheet and payroll have history.

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
for (const [e, d, amount, kind, description] of D.EXPENSES) await api('office', 'POST', '/api/expenses', { employee_id: emp[e], date: day(d), amount, kind, description });
// Salaries for last calendar month, paid on the 1st of this one.
const payDay = `${day(0).slice(0, 7)}-01`;
const lastMonth = day(-new Date().getUTCDate()).slice(0, 7);
for (const [e, gross, deductions, net, notes] of D.PAYROLL) await api('owner', 'POST', '/api/payroll', { employee_id: emp[e], period: lastMonth, gross, deductions, net, paid_on: payDay, notes });

// --- 6. Vendors, POs, deliveries, freight ---------------------------------------------------------------

const vendor = {};
for (const [name, material, notes] of VENDORS) vendor[name] = idOf(await api('owner', 'POST', '/api/vendors', { name, material, notes, phone: D.phone(phoneNo++) }));

const po = [];
for (const [v, item, qty, rate, p, o, ago, deliveries] of POS) {
  const id = idOf(await api('manager', 'POST', '/api/vendor-pos', { vendor_id: vendor[v], item, qty_ordered: qty, rate, project_id: project[p], order_id: o ? order[o] : null, ordered_on: day(-ago), notes: D.PO_NOTE }));
  po.push(id);
  for (const [q, d, ret] of deliveries) await api('manager', 'POST', `/api/vendor-pos/${id}/deliveries`, { qty_delivered: q, qty_returned: ret, date: day(-d), notes: ret ? `${ret} returned: edge damage` : 'Received in full' });
}
// Freight against a rate card; the Gandhinagar trip is billed above the agreed rate on purpose.
for (const [from_loc, to_loc, expected_amount] of D.RATES) await api('owner', 'POST', '/api/vendor-rates', { vendor_id: vendor[D.TRANSPORTER], from_loc, to_loc, expected_amount });
for (const [from_loc, to_loc, amount, ago, poIdx, notes] of D.FREIGHT) {
  await api('manager', 'POST', '/api/freight', { vendor_id: vendor[D.TRANSPORTER], from_loc, to_loc, amount, date: day(-ago), ...(poIdx === null ? {} : { vendor_po_id: po[poIdx] }), notes });
}

// --- 7. Money: invoices and the cash book ------------------------------------------------------------------

for (const [c, p, company, invoice_no, title, sub, due, payment_terms, status, items] of INVOICES) {
  await api('owner', 'POST', '/api/invoices', {
    client_id: client[c], project_id: project[p], company, invoice_no, title, payment_terms, status,
    submitted_on: sub === null ? null : day(sub), due_date: day(due),
    items: items.map(([description, hsn, qty, unit_price, pct]) => ({ description, hsn, gst_pct: pct ?? D.TAX_PCT, qty, unit_price })),
  });
}
// [date, kind, amount, party, party type, description, by]; party type links the entry to that client or vendor.
const CASH = D.cash(day, payDay);
for (const [date, kind, amount, party, party_type, description, by] of CASH) {
  const party_id = party_type === 'client' ? client[party] : party_type === 'vendor' ? vendor[party] : null;
  await api(by, 'POST', '/api/cash', { date, kind, amount, party, party_type, party_id, description });
}

// --- 8. Client conversations ------------------------------------------------------------------------------

for (const [c, p, ago, by, body] of CONVERSATIONS) {
  const id = idOf(await api(by, 'POST', `/api/clients/${client[c]}/conversations`, { project_id: p ? project[p] : null, body }));
  await db.execute({ sql: 'UPDATE client_conversations SET created_at = ? WHERE id = ?', args: [`${day(-ago)} 11:30:00`, id] });
}

// --- 9. Tasks on the calendar ----------------------------------------------------------------------------

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
console.log(`${D.LABEL} demo data seeded:`, counts);
const empty = Object.entries(counts).filter(([, n]) => n <= 0).map(([t]) => t);
if (empty.length) throw new Error(`Empty tables after seeding: ${empty.join(', ')}`);
