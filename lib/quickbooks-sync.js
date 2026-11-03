// lib/quickbooks-sync.js — QuickBooks Online Phase 2, sales side (North American public demo): clients,
// invoices and payments received. An invoice goes to QuickBooks when it is sent or paid (autoSend, best-effort,
// in the background) and a client payment when it is recorded in the cash book; a failure is kept with its reason
// and shown on the row and in the QuickBooks card with Retry (POST /api/quickbooks/send). Builders: lib/quickbooks.mjs.
// Purchase side: a completed vendor PO goes over as a Bill (sendBill); vendor payments do not (the cash book names no bill).
// Ported from shanti-ops (SYSTEM.md §5fl there). Differences: one QuickBooks connection per site, and the cash
// book names the client but no invoice, so a payment goes over unapplied (no LinkedTxn).
//
// The send history is one R2 document per site (loadSyncDoc), keyed by number + fingerprint so the nightly
// reset never re-sends seeded records nor mistakes a new one for an old one:
//   { realm_id, items: {code: qboId}, customers: {name: qboId}, invoices: {key: entry}, receipts: {key: entry} }
//   entry = { local_id, no, status: 'sent'|'failed', qbo_id, qbo_doc, ours, theirs, error, at }
// ponytail: one document per site, rewritten on every send; split it per record if it ever outgrows a demo.
import { queryOne, queryAll } from './db';
import { isStaff } from './auth';
import { qboConfig, qboCall, qboGet, connectionStatus, loadSyncDoc, saveSyncDoc, setHost } from './quickbooks';
import { fingerprint, syncKey, requestId, customerQuery, itemQuery, SALES_ITEMS, buildCustomer, buildInvoice, buildPayment, buildVendor, buildBill, vendorQuery } from './quickbooks.mjs';

// Who may send or retry: any office role, demo visitors included (the target is the Intuit sandbox).
export const canSend = user => !!user && !isStaff(user);

const BANK_CODE = 'bank'; // where payments are deposited
const PURCHASES_CODE = 'purchases'; // the account a bill's lines post to

// Invoice total as the app shows it (lines plus sales tax), one expression so the fingerprint always matches.
const INV_TOTAL = 'ROUND(COALESCE((SELECT SUM(qty * unit_price * (1 + gst_pct / 100)) FROM invoice_items WHERE invoice_id = i.id), 0), 2)';
const INV_COLS = `i.id, i.client_id, i.company, i.invoice_no, COALESCE(i.submitted_on, substr(i.created_at, 1, 10)) AS date, ${INV_TOTAL} AS total`;
const invNo = i => i.invoice_no || String(i.id);
const invoiceFp = i => fingerprint(i.date, i.total, i.client_id);
const receiptNo = t => `CR-${t.id}`;
const receiptFp = t => fingerprint(t.date, t.amount, t.party_id);
// Money in from a client, as the cash book records it (Finance picks the client from the party list).
const CLIENT_CREDIT = "t.kind = 'credit' AND t.party_type = 'client' AND t.party_id IS NOT NULL AND t.is_deleted_record = 0";

async function freshDoc(realm) {
  const rec = await loadSyncDoc();
  const data = rec?.data?.realm_id === realm ? rec.data : { realm_id: realm, items: {}, customers: {}, invoices: {}, receipts: {} };
  for (const k of ['vendors', 'bills']) data[k] ??= {}; // purchase side came later
  return { data, version: rec?.version };
}

// Read-modify-write of the history with compare-and-set; `change` mutates data.
async function updateDoc(realm, change) {
  for (let i = 0; i < 4; i++) {
    const { data, version } = await freshDoc(realm);
    change(data);
    if (await saveSyncDoc(data, version)) return data;
  }
  throw new Error('Could not save the QuickBooks send history; try again');
}

async function connected() {
  if (!qboConfig()) throw new Error('QuickBooks is not set up on this server');
  const conn = await connectionStatus();
  if (conn.status !== 'connected') throw new Error('QuickBooks is not connected');
  return conn;
}

async function findOrCreate(query, entity, create) {
  const found = (await qboGet('/query', { query }))?.QueryResponse?.[entity]?.[0];
  if (found) return String(found.Id);
  return String((await qboCall('POST', `/${entity.toLowerCase()}`, { body: create() }))[entity].Id);
}

async function customerId(doc, client) {
  if (doc.customers[client.name]) return doc.customers[client.name];
  const id = await findOrCreate(customerQuery(client.name), 'Customer', () => buildCustomer(client));
  await updateDoc(doc.realm_id, d => { d.customers[client.name] = id; });
  doc.customers[client.name] = id;
  return id;
}

// One Service item per mapped income account, created once.
async function itemId(doc, conn, company) {
  const { code, name } = SALES_ITEMS[company] || SALES_ITEMS.savistar;
  if (doc.items[code]) return doc.items[code];
  const income = conn.account_map[code];
  if (!income) throw new Error(`Map the "${LOCAL_NAMES[code]}" account to a QuickBooks income account first (Settings → Integrations)`);
  const id = await findOrCreate(itemQuery(name), 'Item', () => ({ Name: name, Type: 'Service', IncomeAccountRef: { value: income } }));
  await updateDoc(doc.realm_id, d => { d.items[code] = id; });
  doc.items[code] = id;
  return id;
}
const LOCAL_NAMES = { sales_studio: 'Sales - Design studio', sales_workshop: 'Sales - Furniture workshop' };

const record = (realm, bucket, key, entry) =>
  updateDoc(realm, d => { d[bucket][key] = { ...entry, at: new Date().toISOString() }; });

export async function sendInvoice(invoiceId) {
  const inv = await queryOne(`SELECT ${INV_COLS}, i.status, i.due_date, i.created_at, i.submitted_on FROM invoices i WHERE i.id = ? AND i.is_deleted_record = 0`, [invoiceId]);
  if (!inv) throw new Error('Invoice not found');
  if (inv.status === 'draft') throw new Error('Only an invoice that has been sent goes to QuickBooks');
  const conn = await connected();
  const key = syncKey(invNo(inv), invoiceFp(inv));
  const { data: doc } = await freshDoc(conn.realm_id);
  if (doc.invoices[key]?.status === 'sent') return doc.invoices[key];
  const base = { local_id: inv.id, no: invNo(inv), ours: inv.total };
  try {
    const [client, items] = await Promise.all([
      queryOne('SELECT * FROM clients WHERE id = ?', [inv.client_id]),
      queryAll('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id', [inv.id]),
    ]);
    if (!items.length) throw new Error('The invoice has no lines');
    const body = buildInvoice(inv, items, client, { customerId: await customerId(doc, client), itemId: await itemId(doc, conn, inv.company) });
    const res = await qboCall('POST', '/invoice', { params: { requestid: requestId(conn.realm_id, 'invoice', key), include: 'allowduplicatedocnum' }, body });
    const entry = { ...base, status: 'sent', qbo_id: String(res.Invoice.Id), qbo_doc: res.Invoice.DocNumber, theirs: res.Invoice.TotalAmt, error: null };
    await record(conn.realm_id, 'invoices', key, entry);
    return entry;
  } catch (err) {
    await record(conn.realm_id, 'invoices', key, { ...base, status: 'failed', error: err.message });
    throw err;
  }
}

// A client payment from the cash book. Sent unapplied: it names the client, not an invoice.
export async function sendReceipt(txnId) {
  const t = await queryOne(`SELECT t.* FROM cash_transactions t WHERE t.id = ? AND ${CLIENT_CREDIT}`, [txnId]);
  if (!t) throw new Error('Only money received from a client goes to QuickBooks');
  const conn = await connected();
  const key = syncKey(receiptNo(t), receiptFp(t));
  const { data: doc } = await freshDoc(conn.realm_id);
  if (doc.receipts[key]?.status === 'sent') return doc.receipts[key];
  const base = { local_id: t.id, no: receiptNo(t), ours: t.amount };
  try {
    const client = await queryOne('SELECT * FROM clients WHERE id = ?', [t.party_id]);
    if (!client) throw new Error('The client was not found');
    const body = buildPayment(t, { customerId: await customerId(doc, client), depositAccountId: conn.account_map[BANK_CODE] });
    const res = await qboCall('POST', '/payment', { params: { requestid: requestId(conn.realm_id, 'payment', key) }, body });
    const entry = { ...base, status: 'sent', qbo_id: String(res.Payment.Id), theirs: res.Payment.TotalAmt, error: null };
    await record(conn.realm_id, 'receipts', key, entry);
    return entry;
  } catch (err) {
    await record(conn.realm_id, 'receipts', key, { ...base, status: 'failed', error: err.message });
    throw err;
  }
}

// A vendor PO is the bill once it is complete (everything delivered), for what the app counts as spend: qty x rate.
const BILL_COLS = "po.id, po.vendor_id, po.item, po.qty_ordered, po.rate, po.status, COALESCE(po.ordered_on, substr(po.created_at, 1, 10)) AS bill_date, ROUND(po.qty_ordered * COALESCE(po.rate, 0), 2) AS total";
const billNo = po => `PO-${po.id}`;
const billFp = po => fingerprint(po.bill_date, po.total, po.vendor_id);

async function vendorId(doc, vendor) {
  if (doc.vendors[vendor.name]) return doc.vendors[vendor.name];
  const id = await findOrCreate(vendorQuery(vendor.name), 'Vendor', () => buildVendor(vendor));
  await updateDoc(doc.realm_id, d => { d.vendors[vendor.name] = id; });
  doc.vendors[vendor.name] = id;
  return id;
}

export async function sendBill(poId) {
  const po = await queryOne(`SELECT ${BILL_COLS} FROM vendor_pos po WHERE po.id = ? AND po.is_deleted_record = 0`, [poId]);
  if (!po) throw new Error('Purchase order not found');
  if (po.status !== 'complete') throw new Error('Only a completed purchase order goes to QuickBooks as a bill');
  const conn = await connected();
  const key = syncKey(billNo(po), billFp(po));
  const { data: doc } = await freshDoc(conn.realm_id);
  if (doc.bills[key]?.status === 'sent') return doc.bills[key];
  const base = { local_id: po.id, no: billNo(po), ours: po.total };
  try {
    const account = conn.account_map[PURCHASES_CODE];
    if (!account) throw new Error('Map the "Purchases" account to a QuickBooks expense account first (Settings → Integrations)');
    if (!(po.total > 0)) throw new Error('The purchase order has no rate, so there is no amount to bill');
    const vendor = await queryOne('SELECT * FROM vendors WHERE id = ?', [po.vendor_id]);
    if (!vendor) throw new Error('The vendor was not found');
    const body = buildBill({ bill_no: billNo(po), bill_date: po.bill_date }, [{ description: po.item, qty: po.qty_ordered, rate: po.rate }], { vendorId: await vendorId(doc, vendor), accountId: account });
    const res = await qboCall('POST', '/bill', { params: { requestid: requestId(conn.realm_id, 'bill', key) }, body });
    const entry = { ...base, status: 'sent', qbo_id: String(res.Bill.Id), qbo_doc: res.Bill.DocNumber, theirs: res.Bill.TotalAmt, error: null };
    await record(conn.realm_id, 'bills', key, entry);
    return entry;
  } catch (err) {
    await record(conn.realm_id, 'bills', key, { ...base, status: 'failed', error: err.message });
    throw err;
  }
}

const SENDERS = { invoice: sendInvoice, receipt: sendReceipt, bill: sendBill };
export const KINDS = Object.keys(SENDERS);
export const sendRecord = (kind, id) => SENDERS[kind](id);

// Called right after an invoice is sent / a client payment is recorded. Never fails the user's own save: runs in
// the background where the runtime allows it, and a failure is already kept in the history with its reason.
export function autoSend(req, kind, id) {
  if (!qboConfig()) return;
  setHost(req);
  const job = sendRecord(kind, id).catch(() => {});
  const ctx = globalThis[Symbol.for('__cloudflare-context__')]?.ctx;
  if (ctx?.waitUntil) ctx.waitUntil(job);
  return job;
}

// For the screens: each invoice's state by local id (latest matching entry), the failures to retry, and
// each cash-book receipt's state.
export async function syncState() {
  const out = { invoices: {}, bills: {}, failures: [], sentToday: 0 };
  const conn = await connectionStatus().catch(() => null);
  if (conn?.status !== 'connected') return out;
  const { data } = await freshDoc(conn.realm_id);
  const [invs, rcts, pos] = await Promise.all([
    queryAll(`SELECT ${INV_COLS} FROM invoices i WHERE i.is_deleted_record = 0 AND i.status != 'draft'`),
    queryAll(`SELECT t.id, t.date, t.amount, t.party_id FROM cash_transactions t WHERE ${CLIENT_CREDIT}`),
    queryAll(`SELECT ${BILL_COLS} FROM vendor_pos po WHERE po.is_deleted_record = 0 AND po.status = 'complete'`),
  ]);
  for (const i of invs) {
    const e = data.invoices[syncKey(invNo(i), invoiceFp(i))];
    out.invoices[i.id] = e ? { status: e.status, no: e.no, qbo_doc: e.qbo_doc, ours: e.ours, theirs: e.theirs, error: e.error } : { status: 'not_sent', no: invNo(i) };
    if (e?.status === 'failed') out.failures.push({ kind: 'invoice', id: i.id, no: e.no, error: e.error, at: e.at });
  }
  for (const t of rcts) {
    const e = data.receipts[syncKey(receiptNo(t), receiptFp(t))];
    if (e?.status === 'failed') out.failures.push({ kind: 'receipt', id: t.id, no: e.no, error: e.error, at: e.at });
  }
  for (const po of pos) {
    const e = data.bills[syncKey(billNo(po), billFp(po))];
    out.bills[po.id] = e ? { status: e.status, no: e.no, qbo_doc: e.qbo_doc, ours: e.ours, theirs: e.theirs, error: e.error } : { status: 'not_sent', no: billNo(po) };
    if (e?.status === 'failed') out.failures.push({ kind: 'bill', id: po.id, no: e.no, error: e.error, at: e.at });
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const e of [...Object.values(data.invoices), ...Object.values(data.receipts), ...Object.values(data.bills)]) if (e.status === 'sent' && e.at?.startsWith(today)) out.sentToday++;
  return out;
}
