// lib/db.js — Turso (libsql) with local-file fallback. Schema-in-code, idempotent.
// Same pattern as shanti-ops/ls_crm: CREATE TABLE IF NOT EXISTS + addColumn migrations.
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

let db = null;
let initPromise = null;

function getClient() {
  if (db) return db;
  if (process.env.TURSO_URL) {
    db = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
      intMode: 'number'
    });
  } else {
    db = createClient({ url: 'file:./savistar-ops-local.db', intMode: 'number' });
  }
  return db;
}

async function migrate(client) {
  // ---- Auth ----------------------------------------------------------------
  // role: admin | manager | user (office staff). Workshop employees never log in.
  await client.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    display_name TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ---- Clients (shared between Saag & Savistar) ----------------------------
  await client.execute(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Conversation log with a client — optionally pinned to a project.
  await client.execute(`CREATE TABLE IF NOT EXISTS client_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    project_id INTEGER,
    body TEXT NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ---- Savistar projects ---------------------------------------------------
  await client.execute(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    start_date DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'pending',
    completed_at DATETIME,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS site_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    visit_date DATE NOT NULL,
    visited_by TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ---- Saag orders ---------------------------------------------------------
  // An order can belong to a client directly (walk-in) and/or to a Savistar project.
  // status: pending | in_progress | done | delivered | cancelled
  await client.execute(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id),
    project_id INTEGER REFERENCES projects(id),
    item TEXT NOT NULL,
    qty REAL NOT NULL DEFAULT 1,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    start_date DATE,
    due_date DATE,
    delivered_at DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ---- People (workshop employees) ----------------------------------------
  // pay_type: salary (monthly amount) | daily (per-day wage). pay_rate is that amount.
  await client.execute(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    profession TEXT,
    phone TEXT,
    pay_type TEXT NOT NULL DEFAULT 'daily',
    pay_rate REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    joined_at DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // One row per employee per day. status: present | absent | half
  await client.execute(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'present',
    in_time TEXT,
    out_time TEXT,
    UNIQUE(employee_id, date)
  )`);

  // What an employee did on an order that day — the daily worksheet line.
  await client.execute(`CREATE TABLE IF NOT EXISTS work_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    start_time TEXT,
    end_time TEXT,
    description TEXT,
    rating INTEGER,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // kind: expense (reimbursable/company cost) | advance (deducted from payroll)
  await client.execute(`CREATE TABLE IF NOT EXISTS employee_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    kind TEXT NOT NULL DEFAULT 'advance',
    amount REAL NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // A recorded payout for a period (e.g. '2026-07'). gross/deductions kept for the record.
  await client.execute(`CREATE TABLE IF NOT EXISTS payroll_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    gross REAL NOT NULL DEFAULT 0,
    deductions REAL NOT NULL DEFAULT 0,
    net REAL NOT NULL DEFAULT 0,
    paid_on DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ---- Vendors -------------------------------------------------------------
  await client.execute(`CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    material TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Expected freight per route — the rate card overcharges are flagged against.
  await client.execute(`CREATE TABLE IF NOT EXISTS vendor_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    from_loc TEXT NOT NULL,
    to_loc TEXT NOT NULL,
    expected_amount REAL NOT NULL,
    UNIQUE(vendor_id, from_loc, to_loc)
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS freight_charges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    vendor_po_id INTEGER,
    date DATE NOT NULL,
    from_loc TEXT NOT NULL,
    to_loc TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Material order placed with a vendor. status: open | complete | cancelled
  await client.execute(`CREATE TABLE IF NOT EXISTS vendor_pos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    item TEXT NOT NULL,
    qty_ordered REAL NOT NULL,
    rate REAL,
    status TEXT NOT NULL DEFAULT 'open',
    ordered_on DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Each partial delivery / return event against a PO. Outstanding = ordered − Σdelivered + Σreturned.
  await client.execute(`CREATE TABLE IF NOT EXISTS vendor_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_po_id INTEGER NOT NULL REFERENCES vendor_pos(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    qty_delivered REAL NOT NULL DEFAULT 0,
    qty_returned REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ---- Finance (one combined book for both companies) ----------------------
  // kind: credit (money in) | debit (money out)
  await client.execute(`CREATE TABLE IF NOT EXISTS cash_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    kind TEXT NOT NULL,
    amount REAL NOT NULL,
    party TEXT,
    description TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Uploaded bank statements (ls_crm model minus Tally). line_items = JSON array of
  // {date, description, amount (neg=debit/pos=credit), comment, attachment_url}.
  // status: reading | pending | approved | extract_failed
  await client.execute(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_type TEXT NOT NULL DEFAULT 'bank_statement',
    original_filename TEXT,
    file_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    bank_name TEXT,
    account_no TEXT,
    statement_from DATE,
    statement_to DATE,
    opening_balance REAL,
    closing_balance REAL,
    total_debit REAL,
    total_credit REAL,
    line_items TEXT NOT NULL DEFAULT '[]',
    extract_error TEXT,
    uploaded_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Generic file attachments (R2): entity_type = cash_transaction | order | site_visit | bank_line …
  await client.execute(`CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    file_url TEXT NOT NULL,
    name TEXT,
    uploaded_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ---- Invoices --------------------------------------------------------------
  // GST invoice raised against a client, optionally scoped to a project.
  // Totals (subtotal/CGST/SGST/grand total) are derived from invoice_items, never stored.
  // status: draft | sent | paid
  await client.execute(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id),
    invoice_no TEXT,
    submitted_on DATE,
    due_date DATE,
    payment_terms TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ponytail: CGST/SGST split assumes an intra-state (Gujarat) client — add an IGST path
  // if an out-of-state client needs invoicing.
  await client.execute(`CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    hsn TEXT,
    gst_pct REAL NOT NULL DEFAULT 0,
    qty REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`);

  // ---- Tasks (also feed the calendar) --------------------------------------
  await client.execute(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    assigned_to TEXT,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    created_by TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Soft delete: nothing is ever really removed, it just stops showing. `users` is excluded —
  // it already has `active`, which is the same mechanism for accounts, and a hidden username
  // would collide with UNIQUE(username) when re-creating the person.
  for (const t of SOFT_DELETE_TABLES) {
    await addColumn(client, t, 'is_deleted_record INTEGER NOT NULL DEFAULT 0');
  }

  // Site (Savistar project) location, shown on the project's Site visits tab.
  await addColumn(client, 'projects', 'address TEXT');
  // Optional link from a cash entry to the vendor/client it was paid to/by — `party` stays
  // as a free-text fallback for anything else (staff reimbursements, misc).
  await addColumn(client, 'cash_transactions', 'party_type TEXT');
  await addColumn(client, 'cash_transactions', 'party_id INTEGER');
  // Which letterhead the invoice PDF is generated under, and the client's PAN for that
  // invoice (billing detail, not stored on the shared `clients` record).
  await addColumn(client, 'invoices', "company TEXT NOT NULL DEFAULT 'savistar'");
  await addColumn(client, 'invoices', 'client_pan TEXT');
  // Short subject line, e.g. "Transport Invoice" — printed under the submitted date.
  await addColumn(client, 'invoices', 'title TEXT');

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_conversations_client ON client_conversations(client_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_orders_project ON orders(project_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(date)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_work_logs_order ON work_logs(order_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_deliveries_po ON vendor_deliveries(vendor_po_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_cash_date ON cash_transactions(date)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)`);

  await seedIfEmpty(client);
}

// Add a column if it doesn't already exist (libsql throws "duplicate column name" on re-run).
async function addColumn(client, table, columnDef) {
  try {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (e) {
    if (!String(e).toLowerCase().includes('duplicate column')) throw e;
  }
}

// Every table carrying `is_deleted_record`. Reads must filter on it; deletes set it to 1.
export const SOFT_DELETE_TABLES = [
  'clients', 'client_conversations', 'projects', 'milestones', 'site_visits', 'orders',
  'employees', 'attendance', 'work_logs', 'employee_expenses', 'payroll_payments',
  'vendors', 'vendor_rates', 'freight_charges', 'vendor_pos', 'vendor_deliveries',
  'cash_transactions', 'documents', 'attachments', 'tasks', 'invoices', 'invoice_items',
];

// What a soft delete drags down with it: [childTable, foreignKeyColumn].
// Mirrors the ON DELETE CASCADE intent declared in the schema — note those FK clauses never
// actually fire, since libsql leaves PRAGMA foreign_keys off, so we do it explicitly here.
// Relationships declared SET NULL (orders → work_logs) are deliberately absent: that work
// genuinely happened and should survive the order being removed.
const CASCADE_MAP = {
  clients: [['client_conversations', 'client_id'], ['projects', 'client_id'], ['orders', 'client_id'], ['invoices', 'client_id']],
  projects: [['milestones', 'project_id'], ['site_visits', 'project_id'], ['client_conversations', 'project_id']],
  invoices: [['invoice_items', 'invoice_id']],
  employees: [['attendance', 'employee_id'], ['work_logs', 'employee_id'],
              ['employee_expenses', 'employee_id'], ['payroll_payments', 'employee_id']],
  vendors: [['vendor_rates', 'vendor_id'], ['freight_charges', 'vendor_id'], ['vendor_pos', 'vendor_id']],
  vendor_pos: [['vendor_deliveries', 'vendor_po_id']],
};

// Vendor total expense = Σ(PO ordered×rate) + Σ(freight) − Σ(returned×rate) − Σ(cash debited to
// vendor). One reusable fragment so this formula isn't copy-pasted like `outstanding` was.
// A cancelled PO was never fulfilled or owed on, so it's excluded from both PO terms.
// vAlias is always a fixed literal supplied by our own call sites, never user input.
export function vendorExpenseSQL(vAlias = 'v') {
  return `(
    COALESCE((SELECT SUM(vp.qty_ordered * COALESCE(vp.rate,0)) FROM vendor_pos vp
      WHERE vp.vendor_id = ${vAlias}.id AND vp.is_deleted_record = 0 AND vp.status != 'cancelled'), 0)
    + COALESCE((SELECT SUM(f.amount) FROM freight_charges f
      WHERE f.vendor_id = ${vAlias}.id AND f.is_deleted_record = 0), 0)
    - COALESCE((SELECT SUM(d.qty_returned * COALESCE(vp2.rate,0)) FROM vendor_deliveries d
      JOIN vendor_pos vp2 ON vp2.id = d.vendor_po_id
      WHERE vp2.vendor_id = ${vAlias}.id AND d.is_deleted_record = 0 AND vp2.is_deleted_record = 0
        AND vp2.status != 'cancelled'), 0)
    - COALESCE((SELECT SUM(c.amount) FROM cash_transactions c
      WHERE c.party_type = 'vendor' AND c.party_id = ${vAlias}.id AND c.kind = 'debit'
        AND c.is_deleted_record = 0), 0)
  )`;
}

// Hide a row and everything hanging off it. Recurses (client → projects → milestones).
export async function softDelete(table, id) {
  await execute(`UPDATE ${table} SET is_deleted_record = 1 WHERE id = ?`, [id]);

  // Cash transactions own polymorphic attachment rows rather than a FK'd child table.
  if (table === 'cash_transactions') {
    await execute(
      `UPDATE attachments SET is_deleted_record = 1
       WHERE entity_type = 'cash_transaction' AND entity_id = ?`, [id]);
  }

  for (const [childTable, fk] of CASCADE_MAP[table] || []) {
    const children = await queryAll(
      `SELECT id FROM ${childTable} WHERE ${fk} = ? AND is_deleted_record = 0`, [id]);
    for (const child of children) await softDelete(childTable, child.id);
  }
}

// Seed the real logins so the app is usable on first run: two owners + a general admin + office staff.
// ponytail: default password is <username>123 for each — change them via the nav menu right after first login.
async function seedIfEmpty(client) {
  const users = await client.execute('SELECT COUNT(*) AS n FROM users');
  if (users.rows[0].n > 0) return;
  const mk = (username, role, displayName) => client.execute({
    sql: `INSERT INTO users (username, password, role, display_name) VALUES (?, ?, ?, ?)`,
    args: [username, bcrypt.hashSync(`${username}123`, 10), role, displayName]
  });
  await mk('hari', 'owner', 'Hari');
  await mk('sachi', 'owner', 'Sachi');
  await mk('admin', 'admin', 'Admin');
  await mk('dristi', 'user', 'Dristi');
}

export async function initDB() {
  if (!initPromise) {
    const client = getClient();
    initPromise = migrate(client).then(() => client);
  }
  return initPromise;
}

export async function queryAll(sql, params = []) {
  const client = await initDB();
  const result = await client.execute({ sql, args: params });
  return result.rows;
}

export async function queryOne(sql, params = []) {
  const client = await initDB();
  const result = await client.execute({ sql, args: params });
  return result.rows.length ? result.rows[0] : null;
}

export async function execute(sql, params = []) {
  const client = await initDB();
  const result = await client.execute({ sql, args: params });
  return { changes: result.rowsAffected, lastId: Number(result.lastInsertRowid) };
}
