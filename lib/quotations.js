// Server side of quotations (QUOTATIONS-PLAN.md): load, save, number, revise, and raise stage invoices.
// Routes in app/api/quotations stay thin and call these. Arithmetic lives in lib/quote-math.js.
import { queryAll, queryOne, execute } from './db.js';
import { COMPANIES } from './companies.js';
import { todayISO, toISODate } from './date.js';
import { fyOf, nextQuoteNo, quoteTotals, stageInvoiceLines, DEFAULT_STAGES, DEFAULT_TERMS, DEFAULT_VALID_DAYS } from './quote-math.js';

export const EDITABLE = ['draft', 'sent'];
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return toISODate(d); };

// A quote's lines priced the same way everywhere: list, editor, PDF.
const ITEM_TOTALS = `
  (SELECT COALESCE(SUM(qty * rate), 0) FROM quotation_items WHERE quotation_id = q.id AND optional = 0 AND is_deleted_record = 0) AS subtotal,
  (SELECT COALESCE(SUM(qty * rate * gst_pct / 100), 0) FROM quotation_items WHERE quotation_id = q.id AND optional = 0 AND is_deleted_record = 0) AS tax`;

export async function listQuotations({ clientId } = {}) {
  return queryAll(
    `SELECT q.*, c.name AS client_name, p.name AS project_name, ${ITEM_TOTALS}
     FROM quotations q JOIN clients c ON c.id = q.client_id LEFT JOIN projects p ON p.id = q.project_id
     WHERE q.is_deleted_record = 0 AND c.is_deleted_record = 0 ${clientId ? 'AND q.client_id = ?' : ''}
     ORDER BY q.created_at DESC, q.id DESC`,
    clientId ? [clientId] : []);
}

export async function loadQuotation(id) {
  const q = await queryOne('SELECT * FROM quotations WHERE id = ? AND is_deleted_record = 0', [id]);
  if (!q) return null;
  const [items, stages, client, project, revisions] = await Promise.all([
    queryAll('SELECT * FROM quotation_items WHERE quotation_id = ? AND is_deleted_record = 0 ORDER BY sort_order', [id]),
    queryAll(`SELECT s.*, i.status AS invoice_status, i.invoice_no,
                (SELECT COALESCE(SUM(qty * unit_price * (1 + gst_pct / 100.0)), 0) FROM invoice_items WHERE invoice_id = i.id AND is_deleted_record = 0) AS invoice_total
              FROM quotation_stages s LEFT JOIN invoices i ON i.id = s.invoice_id AND i.is_deleted_record = 0
              WHERE s.quotation_id = ? AND s.is_deleted_record = 0 ORDER BY s.sort_order`, [id]),
    queryOne('SELECT * FROM clients WHERE id = ?', [q.client_id]),
    q.project_id ? queryOne('SELECT * FROM projects WHERE id = ?', [q.project_id]) : null,
    q.quote_no
      ? queryAll('SELECT id, revision, status, quoted_on FROM quotations WHERE quote_no = ? AND client_id = ? AND is_deleted_record = 0 ORDER BY revision', [q.quote_no, q.client_id])
      : [],
  ]);
  // A raised stage whose invoice was deleted counts as not raised.
  for (const s of stages) if (s.invoice_id && !s.invoice_status) s.invoice_id = null;
  return { ...q, items, stages, client, project, revisions, totals: quoteTotals(items, q.place_of_supply) };
}

async function nextNumber(company, quotedOn) {
  const prefix = (COMPANIES[company] || COMPANIES.savistar).quotePrefix || 'Q';
  const rows = await queryAll('SELECT quote_no FROM quotations WHERE company = ?', [company]);
  return nextQuoteNo(prefix, fyOf(quotedOn), rows.map((r) => r.quote_no));
}

// New draft: today's date, the default validity, terms and stages, and the next number in the series.
// A prospect typed by name becomes a client on the spot.
export async function createQuotation(b, user) {
  let clientId = Number(b.client_id) || null;
  if (!clientId && b.new_client_name?.trim()) {
    ({ lastId: clientId } = await execute('INSERT INTO clients (name, phone) VALUES (?, ?)', [b.new_client_name.trim(), b.new_client_phone?.trim() || null]));
  }
  if (!clientId) throw new Error('Pick a client or type a new one');
  const company = b.company === 'saag' ? 'saag' : 'savistar';
  const today = todayISO();
  const { lastId } = await execute(
    `INSERT INTO quotations (client_id, project_id, company, quote_no, title, quoted_on, valid_until, status, place_of_supply, terms, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'same_state', ?, ?, CURRENT_TIMESTAMP)`,
    [clientId, Number(b.project_id) || null, company, await nextNumber(company, today), b.title?.trim() || null,
     today, addDays(today, DEFAULT_VALID_DAYS), DEFAULT_TERMS, user?.username || null]);
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    await execute('INSERT INTO quotation_stages (quotation_id, label, pct, sort_order) VALUES (?, ?, ?, ?)', [lastId, DEFAULT_STAGES[i].label, DEFAULT_STAGES[i].pct, i]);
  }
  return lastId;
}

const cleanItems = (items) => (items || []).filter((it) => String(it.description || '').trim());

async function writeItems(quoteId, items) {
  await execute('DELETE FROM quotation_items WHERE quotation_id = ?', [quoteId]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await execute(
      `INSERT INTO quotation_items (quotation_id, section, boq_item_id, description, unit, dims, measurement_basis, qty, rate, gst_pct, hsn, optional, dismissed_flags, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [quoteId, it.section?.trim() || null, Number(it.boq_item_id) || null, String(it.description).trim(), it.unit || null, it.dims?.trim() || null,
       it.measurement_basis?.trim() || null, Number(it.qty) || 0, Number(it.rate) || 0, it.gst_pct === '' || it.gst_pct == null ? 18 : Number(it.gst_pct),
       it.hsn?.trim() || null, it.optional ? 1 : 0, it.dismissed_flags || null, i]);
  }
}

// Stages already raised keep their invoice; the rest are rewritten from the editor.
async function writeStages(quoteId, stages) {
  const raised = await queryAll('SELECT * FROM quotation_stages WHERE quotation_id = ? AND invoice_id IS NOT NULL AND is_deleted_record = 0', [quoteId]);
  await execute('DELETE FROM quotation_stages WHERE quotation_id = ? AND invoice_id IS NULL', [quoteId]);
  const raisedIds = new Set(raised.map((s) => s.id));
  let order = 0;
  for (const s of stages || []) {
    if (s.id && raisedIds.has(Number(s.id))) { await execute('UPDATE quotation_stages SET sort_order = ? WHERE id = ?', [order++, s.id]); continue; }
    if (!String(s.label || '').trim()) continue;
    await execute('INSERT INTO quotation_stages (quotation_id, label, pct, sort_order) VALUES (?, ?, ?, ?)', [quoteId, s.label.trim(), Number(s.pct) || 0, order++]);
  }
}

// Autosave target. Only draft and sent quotes change; accepted ones change through a variation (release 2).
export async function saveQuotation(id, b) {
  const q = await queryOne('SELECT status FROM quotations WHERE id = ? AND is_deleted_record = 0', [id]);
  if (!q) throw new Error('Not found');
  if (!EDITABLE.includes(q.status)) throw new Error(q.status === 'accepted' ? "An accepted quotation can't be edited" : `This quotation is ${q.status} and can't be edited; revise it instead`);
  await execute(
    `UPDATE quotations SET project_id = ?, company = ?, quote_no = ?, title = ?, quoted_on = ?, valid_until = ?, place_of_supply = ?, terms = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [Number(b.project_id) || null, b.company === 'saag' ? 'saag' : 'savistar', b.quote_no?.trim() || null, b.title?.trim() || null,
     b.quoted_on || null, b.valid_until || null, b.place_of_supply === 'other_state' ? 'other_state' : 'same_state', b.terms ?? null, b.notes ?? null, id]);
  await writeItems(id, cleanItems(b.items));
  await writeStages(id, b.stages);
}

export async function sendQuotation(id, user, followUpDays = 3) {
  const q = await loadQuotation(id);
  if (!q) throw new Error('Not found');
  if (q.status !== 'draft' && q.status !== 'sent') throw new Error(`This quotation is ${q.status} and can't be sent`);
  await execute(`UPDATE quotations SET status = 'sent', sent_on = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [todayISO(), id]);
  // The follow-up is an ordinary task, so it shows on Home and the calendar like any other.
  if (followUpDays > 0) {
    await execute('INSERT INTO tasks (title, due_date, assigned_to, client_id, created_by, status) VALUES (?, ?, ?, ?, ?, ?)',
      [`Follow up on quotation ${q.quote_no || `#${q.id}`}${q.revision > 1 ? ` R${q.revision}` : ''}`, addDays(todayISO(), followUpDays),
       user?.username || null, q.client_id, user?.username || null, 'open']);
  }
}

export async function decideQuotation(id, decision, { createProject } = {}) {
  const q = await loadQuotation(id);
  if (!q) throw new Error('Not found');
  if (!EDITABLE.includes(q.status)) throw new Error(`This quotation is already ${q.status}`);
  if (!q.items.length) throw new Error('A quotation needs at least one line');
  let projectId = q.project_id;
  if (decision === 'accepted' && createProject && !projectId) {
    ({ lastId: projectId } = await execute('INSERT INTO projects (client_id, name, status, start_date) VALUES (?, ?, ?, ?)',
      [q.client_id, q.title || `${q.client.name} project`, 'active', todayISO()]));
  }
  await execute(`UPDATE quotations SET status = ?, decided_on = ?, project_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [decision, todayISO(), projectId || null, id]);
  return projectId;
}

// A revision: a new draft with the same number, the next revision, the same lines and stages; the old one
// is kept, marked superseded, so what the client saw stays on record.
export async function reviseQuotation(id, user) {
  const q = await loadQuotation(id);
  if (!q) throw new Error('Not found');
  if (q.status === 'accepted' || q.status === 'superseded') throw new Error(`This quotation is ${q.status} and can't be revised`);
  const latest = await queryOne('SELECT MAX(revision) AS r FROM quotations WHERE quote_no = ? AND client_id = ? AND is_deleted_record = 0', [q.quote_no, q.client_id]);
  const today = todayISO();
  const { lastId } = await execute(
    `INSERT INTO quotations (client_id, project_id, company, quote_no, revision, parent_quotation_id, title, quoted_on, valid_until, status, place_of_supply, terms, notes, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [q.client_id, q.project_id, q.company, q.quote_no, (latest?.r || q.revision) + 1, q.id, q.title, today, addDays(today, DEFAULT_VALID_DAYS),
     q.place_of_supply, q.terms, q.notes, user?.username || null]);
  await writeItems(lastId, q.items);
  await writeStages(lastId, q.stages.map(({ label, pct }) => ({ label, pct })));
  await execute(`UPDATE quotations SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  return lastId;
}

// Raise one payment stage as a draft invoice: one line per GST rate, the quote's place of supply.
export async function raiseStageInvoice(id, stageId) {
  const q = await loadQuotation(id);
  if (!q) throw new Error('Not found');
  if (q.status !== 'accepted') throw new Error('Accept the quotation before raising its stages');
  const stage = q.stages.find((s) => s.id === Number(stageId));
  if (!stage) throw new Error('No such stage');
  if (stage.invoice_id) throw new Error('This stage already has an invoice');
  const ref = `${q.quote_no || `#${q.id}`}${q.revision > 1 ? ` R${q.revision}` : ''}`;
  const lines = stageInvoiceLines(q.items, stage, ref);
  const { lastId } = await execute(
    `INSERT INTO invoices (client_id, project_id, company, title, submitted_on, payment_terms, status, place_of_supply, notes)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    [q.client_id, q.project_id, q.company, `${stage.label} · ${ref}`, todayISO(), `${stage.pct}% ${stage.label.toLowerCase()}`, q.place_of_supply, `Against quotation ${ref}.`]);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await execute('INSERT INTO invoice_items (invoice_id, description, hsn, gst_pct, qty, unit_price, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [lastId, l.description, l.hsn || null, l.gst_pct, l.qty, l.unit_price, i]);
  }
  await execute('UPDATE quotation_stages SET invoice_id = ? WHERE id = ?', [lastId, stage.id]);
  return lastId;
}

// Rate memory: the last few times this library item was quoted, newest first (worked out, never stored).
export async function rateMemory(boqItemId, excludeQuoteId, limit = 3) {
  return queryAll(
    `SELECT qi.rate, qi.unit, q.quoted_on, q.status, q.quote_no, c.name AS client_name
     FROM quotation_items qi JOIN quotations q ON q.id = qi.quotation_id JOIN clients c ON c.id = q.client_id
     WHERE qi.boq_item_id = ? AND qi.rate > 0 AND qi.is_deleted_record = 0 AND q.is_deleted_record = 0 AND q.status != 'superseded'
       AND q.id != ? ORDER BY q.quoted_on DESC, q.id DESC LIMIT ?`,
    [boqItemId, Number(excludeQuoteId) || 0, limit]);
}
