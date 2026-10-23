// AI assistant — the read-only look-ups. Each tool: { key, label, about (what Jev reads to choose it), entity, run(ctx) }.
// The model only CHOOSES a tool; every value in SQL is a bound parameter resolved by code (lib/assistantEntities.js).
// The maths follows the app's own screens, so an answer always matches what the tab shows:
//   - soft-deleted rows (is_deleted_record = 1) never count;
//   - invoice totals come from invoice_items (qty × unit_price, GST = × gst_pct / 100, split half CGST / half SGST);
//     drafts are not invoices yet; outstanding = status 'sent';
//   - PO outstanding = ordered − Σdelivered + Σreturned (Vendors tab); vendor spend = vendorExpenseSQL() (lib/db.js);
//   - freight overcharge = charge above the vendor's rate card for the same route (case-insensitive);
//   - days worked = present 1 + half 0.5; payroll gross = days × rate (daily) or the monthly salary, net = gross − advances
//     that month (app/api/payroll);
//   - staff (role 'user') see only their own tasks and their own cash entries, and no payroll or advances.
import { queryAll, queryOne, vendorExpenseSQL } from './db';
import { COMPANY_NAME, fmtD, daysBetween, add, monthOf, norm, words, distinctive } from './assistantEntities';
import { dupKey } from './extract';

const CAP = 25;
const n = (x) => Number(x || 0).toLocaleString('en-IN');
const PLURAL = { person: 'people', entry: 'entries', 'largest entry': 'largest entries' };
const plural = (k, w) => `${n(k)} ${Number(k) === 1 ? w : PLURAL[w] || `${w}s`}`;
// Rounds the size, then signs it, so −₹2,21,065.50 and ₹2,21,065.50 print as the same rupees.
const inr = (x) => { const r = Number(x) || 0, v = Math.round(Math.abs(r)); return `${r < 0 && v ? '−' : ''}₹${v.toLocaleString('en-IN')}`; };
const col = (key, label, type = 'text') => ({ key, label, type });
const table = (o) => ({ rows: [], total: o.rows ? o.rows.length : 0, ...o });
const cap = (rows) => ({ rows: rows.slice(0, CAP), total: rows.length, truncated: rows.length > CAP });
const label = (s) => String(s || '').replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
const between = (p, colName) => (p && p.from ? { sql: ` AND ${colName} BETWEEN ? AND ?`, args: [p.from, p.to] } : { sql: '', args: [] });
const STAFF_NO = (what) => { const e = new Error(`staff:${what}`); e.staff = what; return e; };

// Invoice totals per invoice, as a reusable sub-select (subtotal, tax).
const INVOICE_TOTALS = `
  (SELECT COALESCE(SUM(qty * unit_price), 0) FROM invoice_items it WHERE it.invoice_id = i.id AND it.is_deleted_record = 0) AS subtotal,
  (SELECT COALESCE(SUM(qty * unit_price * gst_pct / 100), 0) FROM invoice_items it WHERE it.invoice_id = i.id AND it.is_deleted_record = 0) AS tax`;
// Quotation totals: counted lines only (optional ones are shown on the quote but not added up).
const QUOTE_TOTALS = `
  (SELECT COALESCE(SUM(qty * rate), 0) FROM quotation_items WHERE quotation_id = q.id AND optional = 0 AND is_deleted_record = 0) AS subtotal,
  (SELECT COALESCE(SUM(qty * rate * gst_pct / 100), 0) FROM quotation_items WHERE quotation_id = q.id AND optional = 0 AND is_deleted_record = 0) AS tax`;

// Status words in a question → the stored status values.
function statusesIn(q, map) {
  const t = q.toLowerCase();
  return Object.entries(map).filter(([, re]) => re.test(t)).map(([s]) => s);
}

// ---- bank statements (Finance → Bank) ----
// Reviewed and not-yet-reviewed statements both count; unreviewed lines are labelled. Hidden lines (the review
// screen's hide toggle) never count, and a line on two overlapping statements counts once (dupKey, the same key
// the review screen flags duplicates with), keeping the approved copy.
async function bankDocs() {
  return queryAll(`SELECT id, bank_name, account_no, statement_from, statement_to, opening_balance, closing_balance, status, line_items
    FROM documents WHERE is_deleted_record = 0 AND status IN ('pending', 'approved') AND account_no IS NOT NULL AND account_no != ''
    ORDER BY status = 'approved' DESC, statement_to DESC`);
}
const acctLabel = (d) => `${d.bank_name || 'Bank'} …${String(d.account_no).slice(-4)}`;
const BANK_GENERIC = new Set(['bank', 'account', 'current', 'savings', 'saving', 'the', 'and']);
// Accounts the question names, by a word of their label ("HDFC") or their last 4 digits; none named = all.
function accountsIn(question, docs) {
  const q = norm(question), qw = new Set(words(question));
  const accts = new Map();
  for (const d of docs) if (!accts.has(d.account_no)) accts.set(d.account_no, d.bank_name);
  return [...accts].filter(([no, name]) => q.includes(String(no).slice(-4))
    || words(name || '').some((w) => w.length >= 3 && !BANK_GENERIC.has(w) && qw.has(w))).map(([no]) => no);
}
function bankLines(docs, { period, accountNos }) {
  const seen = new Set(), out = [];
  for (const d of docs) {
    if (accountNos.length && !accountNos.includes(d.account_no)) continue;
    let items; try { items = JSON.parse(d.line_items || '[]'); } catch { continue; }
    for (const it of items) {
      if (it.ignored || !it.date) continue;
      if (period?.from && (it.date < period.from || it.date > period.to)) continue;
      const k = `${d.account_no}|${dupKey(it)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ date: it.date, account: acctLabel(d), description: it.description || '', amount: Number(it.amount) || 0, reviewed: d.status === 'approved' });
    }
  }
  return out;
}
// Each account's newest statement (latest period end; the approved one on a tie).
function latestPerAccount(docs) {
  const best = new Map();
  for (const d of docs) {
    const b = best.get(d.account_no);
    if (!b || (d.statement_to || '') > (b.statement_to || '') || (d.statement_to === b.statement_to && d.status === 'approved' && b.status !== 'approved')) best.set(d.account_no, d);
  }
  return [...best.values()];
}
// Statements whose extracted lines don't reach their own closing balance (opening + in − out ≠ closing): the AI
// misread a line or a sign. Every line counts here, hidden ones too: those are real lines of this statement.
function unreconciled(docs) {
  return docs.map((d) => {
    if (d.closing_balance == null || d.opening_balance == null) return null;
    let items; try { items = JSON.parse(d.line_items || '[]'); } catch { return null; }
    const off = Number(d.opening_balance) + items.reduce((a, it) => a + (Number(it.amount) || 0), 0) - Number(d.closing_balance);
    return Math.abs(off) >= 1 ? { label: `${acctLabel(d)} (${fmtD(d.statement_from)} – ${fmtD(d.statement_to)})`, off } : null;
  }).filter(Boolean);
}
const reconcileNote = (bad) => (bad.length
  ? ` Heads up: ${bad.map((b) => `${b.label} is off by ${inr(Math.abs(b.off))}`).join('; ')}: its lines don't add up to its closing balance, so a line may be misread. Check it in Finance → Bank.`
  : '');
const NO_BANK = (title) => table({ title, summary: 'No bank statements uploaded yet. Upload one in Finance → Bank.', columns: [], rows: [], link: { path: '/finance', label: 'Open Finance' } });
// The whole calendar month a date falls in, as a period.
function monthPeriod(ymd) {
  const [y, m] = ymd.slice(0, 7).split('-').map(Number);
  return { from: `${ymd.slice(0, 7)}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
    label: new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}
const BANK_IN = /\b(came in|come in|into the bank|received|credit(s|ed)?|deposit(s|ed)?|incoming|money in|aaya|aaye)\b/;
const BANK_OUT = /\b(went out|money out|paid|debit(s|ed)?|withdraw(n|als?)?|spent|outgoing|payments? to|gaya|gaye|bheja)\b/;
// Words that describe the question rather than a party in the bank description.
const BANK_WORDS = new Set(('bank transactions transaction statement statements debits debit credits credit payments payment biggest largest top '
  + 'money came went received paid spent deposits deposit withdrawals withdrawal incoming outgoing lines entries month months week year last this '
  + 'out into come big large amount amounts spend spending expense expenses income inflow outflow account accounts balance transfer transfers '
  + 'january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec '
  + 'kitna kitne aaya aaye gaya gaye bheja paisa paise mein hai kya wale').split(' '));

// Labour cost per project, estimated from work logs: a person's day cost (daily wage, or monthly salary ÷ days
// worked that month, like payroll) split across the orders they logged that day by logged time (evenly when a
// log has no times). Returns Map(projectId → rupees).
async function labourByProject() {
  const [logs, att, emps] = await Promise.all([
    queryAll(`SELECT w.employee_id, w.date, w.start_time, w.end_time, o.project_id FROM work_logs w
      LEFT JOIN orders o ON o.id = w.order_id AND o.is_deleted_record = 0 WHERE w.is_deleted_record = 0`),
    queryAll(`SELECT employee_id, date, status FROM attendance WHERE is_deleted_record = 0`),
    queryAll(`SELECT id, pay_type, pay_rate FROM employees WHERE is_deleted_record = 0`),
  ]);
  const emp = new Map(emps.map((e) => [e.id, e]));
  const dayFactor = new Map(), monthDays = new Map();
  for (const a of att) {
    const f = a.status === 'present' ? 1 : a.status === 'half' ? 0.5 : 0;
    dayFactor.set(`${a.employee_id}|${a.date}`, f);
    const mk = `${a.employee_id}|${String(a.date).slice(0, 7)}`;
    monthDays.set(mk, (monthDays.get(mk) || 0) + f);
  }
  const mins = (l) => {
    const t = (s) => { const [h, mm] = String(s || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(mm) ? h * 60 + mm : null; };
    const a = t(l.start_time), b = t(l.end_time);
    return a != null && b != null && b > a ? b - a : null;
  };
  const byDay = new Map();
  for (const l of logs) { const k = `${l.employee_id}|${l.date}`; byDay.set(k, [...(byDay.get(k) || []), l]); }
  const out = new Map();
  for (const [k, day] of byDay) {
    const [eid, date] = k.split('|'); const e = emp.get(Number(eid));
    if (!e || !day.some((l) => l.project_id)) continue;
    const f = dayFactor.has(k) ? dayFactor.get(k) : 1;
    const worked = monthDays.get(`${eid}|${date.slice(0, 7)}`);
    const dayCost = (e.pay_type === 'daily' ? Number(e.pay_rate) : Number(e.pay_rate) / (worked || 26)) * f;
    const m = day.map(mins), timed = m.every((x) => x != null), totalM = m.reduce((a, x) => a + (x || 0), 0);
    day.forEach((l, i) => {
      if (!l.project_id) return;
      const share = timed && totalM ? m[i] / totalM : 1 / day.length;
      out.set(l.project_id, (out.get(l.project_id) || 0) + dayCost * share);
    });
  }
  return out;
}

export const TOOLS = [
  // ---------------- home: tasks and the calendar ----------------
  {
    key: 'tasks', label: 'Tasks', entity: ['user', 'client'], period: true, comparable: false,
    about: 'Follow-up tasks: what is overdue, due today or this week, for a person or a client, e.g. "what\'s overdue", "my tasks this week", "tasks for Rohan", "follow-ups with Kiran Joshi".',
    keywords: ['task', 'tasks', 'overdue', 'follow up', 'follow-up', 'to do', 'todo', 'due today', 'reminder'],
    async run(c) {
      const args = []; let where = 't.is_deleted_record = 0';
      if (c.period?.from) { where += ' AND t.due_date BETWEEN ? AND ?'; args.push(c.period.from, c.period.to); }
      else { where += " AND t.status = 'open' AND t.due_date <= ?"; args.push(add(c.today, 7)); }
      if (c.users?.length) { where += ` AND t.assigned_to IN (${c.users.map(() => '?').join(',')})`; args.push(...c.users); }
      if (c.client) { where += ' AND t.client_id = ?'; args.push(c.client.id); }
      const rows = await queryAll(`SELECT t.title, t.due_date, t.status, t.assigned_to, cl.name AS client FROM tasks t
        LEFT JOIN clients cl ON cl.id = t.client_id WHERE ${where} ORDER BY t.status = 'done', t.due_date, t.id`, args);
      const open = rows.filter((r) => r.status === 'open');
      const overdue = open.filter((r) => r.due_date < c.today).length, today = open.filter((r) => r.due_date === c.today).length;
      const out = rows.map((r) => ({ title: r.title, client: r.client, who: r.assigned_to, due: r.due_date, state: r.status === 'done' ? 'Done' : r.due_date < c.today ? `${daysBetween(r.due_date, c.today)}d late` : r.due_date === c.today ? 'Today' : 'Open' }));
      return table({ title: c.period?.from ? `Tasks due ${c.period.label.toLowerCase()}` : 'Open tasks: overdue and the next 7 days',
        summary: rows.length ? `${plural(open.length, 'open task')}${overdue ? `, ${overdue} overdue` : ''}${today ? `, ${today} due today` : ''}${rows.length > open.length ? ` · ${rows.length - open.length} done` : ''}.` : 'No tasks match.',
        columns: [col('title', 'Task'), col('client', 'Client'), col('who', 'Assigned'), col('due', 'Due', 'date'), col('state', 'State')], ...cap(out), link: { path: '/', label: 'Open Home' } });
    },
  },
  {
    key: 'calendar', label: "What's on", entity: null, period: true, comparable: false,
    about: 'Everything on the calendar for a period: project milestones, site visits, workshop order due dates and tasks, e.g. "what\'s on this week", "anything due tomorrow", "schedule for next week".',
    keywords: ['this week', 'schedule', 'calendar', "what's on", 'whats on', 'agenda', 'plan for', 'lined up', 'coming up', 'upcoming'],
    async run(c) {
      const p = c.period?.from ? c.period : { from: c.today, to: add(c.today, 6), label: 'The next 7 days' };
      const mine = c.staff ? ' AND t.assigned_to = ?' : '';
      const [tasks, ms, visits, orders] = await Promise.all([
        queryAll(`SELECT t.due_date AS date, t.title AS what, t.assigned_to AS who FROM tasks t WHERE t.is_deleted_record = 0 AND t.status = 'open' AND t.due_date BETWEEN ? AND ?${mine}`, c.staff ? [p.from, p.to, c.user] : [p.from, p.to]),
        queryAll(`SELECT m.due_date AS date, m.title || ' · ' || pr.name AS what FROM milestones m JOIN projects pr ON pr.id = m.project_id
          WHERE m.is_deleted_record = 0 AND pr.is_deleted_record = 0 AND m.status != 'done' AND m.due_date BETWEEN ? AND ?`, [p.from, p.to]),
        queryAll(`SELECT v.visit_date AS date, pr.name AS what, v.visited_by AS who FROM site_visits v JOIN projects pr ON pr.id = v.project_id
          WHERE v.is_deleted_record = 0 AND pr.is_deleted_record = 0 AND v.visit_date BETWEEN ? AND ?`, [p.from, p.to]),
        queryAll(`SELECT o.due_date AS date, o.item AS what FROM orders o WHERE o.is_deleted_record = 0 AND o.status IN ('pending', 'in_progress') AND o.due_date BETWEEN ? AND ?`, [p.from, p.to]),
      ]);
      const rows = [
        ...ms.map((r) => ({ ...r, kind: 'Milestone' })), ...visits.map((r) => ({ ...r, kind: 'Site visit' })),
        ...orders.map((r) => ({ ...r, kind: 'Order due' })), ...tasks.map((r) => ({ ...r, kind: 'Task' })),
      ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const parts = [[ms.length, 'milestone'], [visits.length, 'site visit'], [orders.length, 'order due'], [tasks.length, 'task']].filter(([k]) => k).map(([k, w]) => plural(k, w));
      return table({ title: `${p.label}: calendar`, summary: rows.length ? `${parts.join(', ')}.` : 'Nothing on the calendar.',
        columns: [col('date', 'Date', 'date'), col('kind', 'What'), col('what', 'Detail'), col('who', 'Who')], ...cap(rows),
        note: c.staff ? 'Tasks: yours only.' : null, link: { path: '/', label: 'Open the calendar' } });
    },
  },

  // ---------------- studio: projects and clients ----------------
  {
    key: 'projects', label: 'Projects and progress', entity: ['client'], period: false, comparable: false,
    about: 'All projects (or by status: active, on hold, completed, cancelled) with milestone progress and what is overdue, e.g. "how are the projects doing", "which projects are on hold", "projects behind schedule".',
    keywords: ['projects', 'progress', 'on hold', 'completed projects', 'behind', 'active projects', 'running projects'],
    async run(c) {
      const st = statusesIn(c.question, { active: /\bactive|running|ongoing|live\b/, on_hold: /\bon[ _-]?hold|paused|stuck\b/, completed: /\bcompleted?|finished|handed over\b/, cancelled: /\bcancell?ed|dropped\b/ });
      const args = [c.today]; let where = 'p.is_deleted_record = 0';
      if (st.length) { where += ` AND p.status IN (${st.map(() => '?').join(',')})`; args.push(...st); }
      if (c.client) { where += ' AND p.client_id = ?'; args.push(c.client.id); }
      const rows = await queryAll(`SELECT p.id, p.name, p.status, cl.name AS client,
          (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.is_deleted_record = 0) AS ms_total,
          (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.is_deleted_record = 0 AND m.status = 'done') AS ms_done,
          (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.is_deleted_record = 0 AND m.status != 'done' AND m.due_date < ?) AS ms_late,
          (SELECT m.title || '|' || COALESCE(m.due_date, '') FROM milestones m WHERE m.project_id = p.id AND m.is_deleted_record = 0 AND m.status != 'done' ORDER BY m.due_date IS NULL, m.due_date, m.sort_order LIMIT 1) AS next_ms
        FROM projects p LEFT JOIN clients cl ON cl.id = p.client_id WHERE ${where}
        ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'on_hold' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END, p.name`, args);
      const out = rows.map((r) => {
        const [title, due] = String(r.next_ms || '').split('|');
        return { project: r.name, client: r.client, status: label(r.status), done: r.ms_total ? `${r.ms_done}/${r.ms_total} (${Math.round((r.ms_done / r.ms_total) * 100)}%)` : '—', late: Number(r.ms_late), next: r.next_ms ? `${title}${due ? ` · ${fmtD(due)}` : ''}` : '—', _link: `/projects/${r.id}` };
      });
      const late = out.filter((r) => r.late > 0).length;
      return table({ title: st.length ? `${st.map(label).join(' / ')} projects` : 'Projects', summary: rows.length ? `${plural(rows.length, 'project')}${late ? `; ${late} with overdue milestones` : ''}.` : 'No projects match.',
        columns: [col('project', 'Project'), col('client', 'Client'), col('status', 'Status'), col('done', 'Milestones'), col('late', 'Overdue', 'int'), col('next', 'Next milestone')], ...cap(out), link: { path: '/projects', label: 'Open Projects' } });
    },
  },
  {
    key: 'project_overview', label: 'One project, end to end', entity: ['project'], required: true, period: false, comparable: false,
    about: 'Everything about ONE named project: milestones done and overdue, next milestone, site visits, its workshop orders, vendor POs and what it has been invoiced and paid, e.g. "how is the Mehta bungalow going", "status of the Brewnest cafe".',
    keywords: ['how is', 'going', 'status of', 'update on', 'where are we'],
    async run(c) {
      const id = c.project.id;
      const [p, ms, visits, orders, pos, inv] = await Promise.all([
        queryOne('SELECT p.*, cl.name AS client FROM projects p LEFT JOIN clients cl ON cl.id = p.client_id WHERE p.id = ?', [id]),
        queryAll('SELECT title, due_date, status FROM milestones WHERE project_id = ? AND is_deleted_record = 0 ORDER BY sort_order, due_date', [id]),
        queryAll('SELECT visit_date, visited_by FROM site_visits WHERE project_id = ? AND is_deleted_record = 0 ORDER BY visit_date', [id]),
        queryAll('SELECT item, status, due_date FROM orders WHERE project_id = ? AND is_deleted_record = 0', [id]),
        queryAll(`SELECT vp.qty_ordered * COALESCE(vp.rate, 0) AS value, vp.status FROM vendor_pos vp WHERE vp.project_id = ? AND vp.is_deleted_record = 0 AND vp.status != 'cancelled'`, [id]),
        queryAll(`SELECT i.status, ${INVOICE_TOTALS} FROM invoices i WHERE i.project_id = ? AND i.is_deleted_record = 0 AND i.status != 'draft'`, [id]),
      ]);
      const done = ms.filter((m) => m.status === 'done').length;
      const late = ms.filter((m) => m.status !== 'done' && m.due_date && m.due_date < c.today);
      const next = ms.find((m) => m.status !== 'done');
      const past = visits.filter((v) => v.visit_date <= c.today), coming = visits.filter((v) => v.visit_date > c.today);
      const byStatus = Object.entries(orders.reduce((a, o) => ({ ...a, [o.status]: (a[o.status] || 0) + 1 }), {})).map(([s, k]) => `${k} ${label(s).toLowerCase()}`).join(', ');
      const total = (r) => Number(r.subtotal) + Number(r.tax);
      const invoiced = inv.reduce((a, r) => a + total(r), 0), paid = inv.filter((r) => r.status === 'paid').reduce((a, r) => a + total(r), 0);
      const rows = [
        { what: 'Status', detail: label(p.status) },
        { what: 'Milestones', detail: ms.length ? `${done} of ${ms.length} done (${Math.round((done / ms.length) * 100)}%)` : 'None yet' },
        { what: 'Overdue milestones', detail: late.length ? late.map((m) => `${m.title} (due ${fmtD(m.due_date)})`).join('; ') : 'None' },
        { what: 'Next milestone', detail: next ? `${next.title}${next.due_date ? `, due ${fmtD(next.due_date)}` : ''}` : 'All done' },
        { what: 'Site visits', detail: `${past.length} so far${past.length ? `, last ${fmtD(past[past.length - 1].visit_date)}` : ''}${coming.length ? `; next ${fmtD(coming[0].visit_date)}` : ''}` },
        { what: 'Workshop orders', detail: orders.length ? byStatus : 'None' },
        { what: 'Vendor POs', detail: pos.length ? `${pos.length} (${inr(pos.reduce((a, r) => a + Number(r.value), 0))}), ${pos.filter((r) => r.status === 'open').length} open` : 'None' },
        { what: 'Invoiced (incl. GST)', detail: inv.length ? `${inr(invoiced)} · paid ${inr(paid)} · outstanding ${inr(invoiced - paid)}` : 'Nothing invoiced yet' },
      ];
      return table({ title: p.name, summary: `${label(p.status)} · ${ms.length ? `${done}/${ms.length} milestones done` : 'no milestones'}${late.length ? `, ${late.length} overdue` : ''}${p.client ? ` · for ${p.client}` : ''}.`,
        columns: [col('what', ''), col('detail', '')], rows, link: { path: `/projects/${id}`, label: 'Open the project' } });
    },
  },
  {
    key: 'milestones', label: 'Milestones', entity: ['project'], period: true, comparable: false,
    about: 'Project milestones that are overdue or coming up (optionally for one project or a period), e.g. "which milestones are overdue", "milestones due this month", "open milestones on the Joshi apartment".',
    keywords: ['milestone', 'milestones', 'deadline', 'deadlines', 'behind schedule'],
    async run(c) {
      const args = []; let where = "m.is_deleted_record = 0 AND p.is_deleted_record = 0 AND m.status != 'done'";
      if (c.project) { where += ' AND m.project_id = ?'; args.push(c.project.id); } else where += " AND p.status = 'active'";
      if (c.period?.from) { where += ' AND m.due_date BETWEEN ? AND ?'; args.push(c.period.from, c.period.to); }
      if (/\b(overdue|late|behind|missed)\b/i.test(c.question)) { where += ' AND m.due_date < ?'; args.push(c.today); }
      const rows = await queryAll(`SELECT m.title, m.due_date, p.name AS project FROM milestones m JOIN projects p ON p.id = m.project_id WHERE ${where} ORDER BY m.due_date IS NULL, m.due_date`, args);
      const out = rows.map((r) => ({ milestone: r.title, project: r.project, due: r.due_date, state: !r.due_date ? 'No date' : r.due_date < c.today ? `${daysBetween(r.due_date, c.today)}d late` : `in ${daysBetween(c.today, r.due_date)}d` }));
      const late = rows.filter((r) => r.due_date && r.due_date < c.today).length;
      return table({ title: `Open milestones${c.project ? `: ${c.project.label}` : ''}${c.period?.from ? ` · ${c.period.label}` : ''}`, summary: rows.length ? `${plural(rows.length, 'open milestone')}, ${late} overdue.` : 'No open milestones.',
        columns: [col('milestone', 'Milestone'), col('project', 'Project'), col('due', 'Due', 'date'), col('state', 'When')], ...cap(out), link: { path: c.project ? `/projects/${c.project.id}` : '/projects', label: c.project ? 'Open the project' : 'Open Projects' } });
    },
  },
  {
    key: 'site_visits', label: 'Site visits', entity: ['project'], period: true, comparable: true, compareKey: 'visits',
    about: 'Site visits: who visited which site and when, upcoming or in a period, e.g. "site visits this week", "when did we last visit the Brewnest cafe", "how many site visits last month".',
    keywords: ['site visit', 'site visits', 'visited', 'visit'],
    async run(c) {
      const p = c.period?.from ? c.period : null;
      const args = []; let where = 'v.is_deleted_record = 0 AND pr.is_deleted_record = 0';
      if (c.project) { where += ' AND v.project_id = ?'; args.push(c.project.id); }
      if (p) { where += ' AND v.visit_date BETWEEN ? AND ?'; args.push(p.from, p.to); }
      else if (!c.project) { where += ' AND v.visit_date >= ?'; args.push(add(c.today, -14)); }
      const rows = await queryAll(`SELECT v.visit_date, v.visited_by, v.notes, pr.name AS project FROM site_visits v JOIN projects pr ON pr.id = v.project_id WHERE ${where} ORDER BY v.visit_date DESC`, args);
      const byProject = Object.entries(rows.reduce((a, r) => ({ ...a, [r.project]: (a[r.project] || 0) + 1 }), {}));
      return table({ title: `Site visits${c.project ? `: ${c.project.label}` : ''} · ${p ? p.label : c.project ? 'all' : 'last 14 days and upcoming'}`,
        summary: rows.length ? `${plural(rows.length, 'visit')} across ${plural(byProject.length, 'site')}${rows[0] ? `; latest ${fmtD(rows[0].visit_date)}` : ''}.` : 'No site visits.',
        columns: [col('visit_date', 'Date', 'date'), col('project', 'Site'), col('visited_by', 'By'), col('notes', 'Notes')], ...cap(rows),
        // for comparisons: one row per site
        compareRows: byProject.map(([project, visits]) => ({ project, visits })), compareCols: [col('project', 'Site')],
        link: { path: c.project ? `/projects/${c.project.id}` : '/projects', label: c.project ? 'Open the project' : 'Open Projects' } });
    },
  },
  {
    key: 'client_contact', label: 'A client: conversations and work', entity: ['client'], required: true, period: false, comparable: false,
    about: 'ONE named client: when we last spoke and what was said, their projects and workshop orders, and their invoices, e.g. "when did we last talk to the Mehtas", "what did Kiran Joshi say", "notes on Brewnest".',
    keywords: ['last talk', 'last spoke', 'conversation', 'said', 'notes on', 'spoke to', 'call with', 'contact'],
    async run(c) {
      const id = c.client.id;
      const [conv, projects, orders, inv] = await Promise.all([
        queryAll(`SELECT cc.created_at, cc.created_by, cc.body, p.name AS project FROM client_conversations cc LEFT JOIN projects p ON p.id = cc.project_id
          WHERE cc.client_id = ? AND cc.is_deleted_record = 0 ORDER BY cc.created_at DESC LIMIT 8`, [id]),
        queryAll('SELECT name, status FROM projects WHERE client_id = ? AND is_deleted_record = 0', [id]),
        queryAll("SELECT COUNT(*) AS k FROM orders WHERE client_id = ? AND is_deleted_record = 0 AND status IN ('pending', 'in_progress')", [id]),
        queryAll(`SELECT i.status, ${INVOICE_TOTALS} FROM invoices i WHERE i.client_id = ? AND i.is_deleted_record = 0 AND i.status = 'sent'`, [id]),
      ]);
      const last = conv[0];
      const owed = inv.reduce((a, r) => a + Number(r.subtotal) + Number(r.tax), 0);
      const rows = conv.map((r) => ({ date: String(r.created_at).slice(0, 10), by: r.created_by, project: r.project, note: String(r.body).slice(0, 220) }));
      const facts = [
        last ? `last spoken to ${fmtD(last.created_at)} (${daysBetween(String(last.created_at).slice(0, 10), c.today)} days ago)` : 'no conversations logged',
        projects.length ? `${plural(projects.length, 'project')} (${projects.map((p) => `${p.name}, ${label(p.status).toLowerCase()}`).join('; ')})` : 'no projects',
        orders[0].k ? `${plural(orders[0].k, 'open order')}` : null,
        inv.length ? `${inr(owed)} outstanding on ${plural(inv.length, 'invoice')}` : null,
      ].filter(Boolean);
      return table({ title: c.client.label, summary: `${facts.join(' · ')}.`.replace(/^./, (x) => x.toUpperCase()),
        columns: [col('date', 'Date', 'date'), col('by', 'By'), col('project', 'Project'), col('note', 'Note')], rows, link: { path: `/clients/${id}`, label: 'Open the client' } });
    },
  },
  {
    key: 'quiet_clients', label: 'Clients gone quiet', entity: null, period: false, comparable: false,
    about: 'Clients with an active project whom nobody has spoken to recently (no conversation logged in 14 days or the number of days asked), e.g. "who haven\'t we called in a while", "clients we need to follow up with", "quiet clients".',
    keywords: ['gone quiet', 'quiet', "haven't spoken", 'havent spoken', 'not spoken', 'in a while', 'need to call', 'follow up with', 'neglected'],
    async run(c) {
      const days = Number((/(\d{1,3})\s*days?/.exec(c.question) || [])[1]) || 14;
      const rows = await queryAll(`SELECT cl.id, cl.name, GROUP_CONCAT(DISTINCT p.name) AS projects,
          (SELECT MAX(cc.created_at) FROM client_conversations cc WHERE cc.client_id = cl.id AND cc.is_deleted_record = 0) AS last_at
        FROM clients cl JOIN projects p ON p.client_id = cl.id AND p.status = 'active' AND p.is_deleted_record = 0
        WHERE cl.is_deleted_record = 0 GROUP BY cl.id ORDER BY last_at IS NOT NULL, last_at`);
      const cutoff = add(c.today, -days);
      const out = rows.filter((r) => !r.last_at || String(r.last_at).slice(0, 10) < cutoff)
        .map((r) => ({ client: r.name, projects: r.projects, last: r.last_at ? String(r.last_at).slice(0, 10) : null, days: r.last_at ? daysBetween(String(r.last_at).slice(0, 10), c.today) : null }));
      return table({ title: `Active clients not spoken to in ${days} days`, summary: out.length ? `${plural(out.length, 'client')} with an active project ${out.length === 1 ? 'has' : 'have'} had no logged conversation in ${days}+ days.` : `Every client with an active project was spoken to in the last ${days} days.`,
        columns: [col('client', 'Client'), col('projects', 'Active project'), col('last', 'Last spoken', 'date'), col('days', 'Days ago', 'int')], ...cap(out), link: { path: '/clients', label: 'Open Clients' } });
    },
  },

  // ---------------- money owed and billed ----------------
  {
    key: 'outstanding_invoices', label: 'Unpaid invoices', entity: ['client', 'project'], period: false, comparable: false,
    about: 'Invoices sent but not yet paid, with amount incl. GST and how overdue they are, optionally for one client, project or company, e.g. "who owes us money", "outstanding invoices", "is the Mehta invoice paid", "unpaid furniture invoices".',
    keywords: ['outstanding', 'unpaid', 'owes', 'owe us', 'receivable', 'receivables', 'pending payment', 'not paid', 'due from'],
    async run(c) {
      const args = []; let where = "i.is_deleted_record = 0 AND i.status = 'sent'";
      if (c.company && c.company !== 'all') { where += ' AND i.company = ?'; args.push(c.company); }
      if (c.client) { where += ' AND i.client_id = ?'; args.push(c.client.id); }
      if (c.project) { where += ' AND i.project_id = ?'; args.push(c.project.id); }
      const rows = await queryAll(`SELECT i.id, i.invoice_no, i.company, i.submitted_on, i.due_date, cl.name AS client, cl.id AS client_id, ${INVOICE_TOTALS}
        FROM invoices i JOIN clients cl ON cl.id = i.client_id WHERE ${where} ORDER BY i.due_date IS NULL, i.due_date`, args);
      const out = rows.map((r) => ({ invoice: r.invoice_no || `#${r.id}`, client: r.client, company: COMPANY_NAME[r.company] || r.company, amount: Number(r.subtotal) + Number(r.tax), due: r.due_date, late: r.due_date && r.due_date < c.today ? daysBetween(r.due_date, c.today) : 0 }));
      const sum = out.reduce((a, r) => a + r.amount, 0), lateSum = out.filter((r) => r.late > 0).reduce((a, r) => a + r.amount, 0);
      return table({ title: `Unpaid invoices${c.company && c.company !== 'all' ? ` · ${COMPANY_NAME[c.company]}` : ''}`, summary: out.length ? `${inr(sum)} outstanding on ${plural(out.length, 'invoice')}${lateSum ? `; ${inr(lateSum)} past due` : ''}.` : 'Nothing outstanding: every sent invoice is paid.',
        columns: [col('invoice', 'Invoice'), col('client', 'Client'), col('company', 'Company'), col('amount', 'Amount', 'money'), col('due', 'Due', 'date'), col('late', 'Days late', 'int')], ...cap(out),
        note: 'Amounts include GST. Drafts are not counted.', link: { path: c.client ? `/clients/${c.client.id}` : '/clients', label: c.client ? 'Open the client' : 'Open Clients' } });
    },
  },
  {
    key: 'invoiced', label: 'Invoiced and GST', entity: ['client'], period: true, comparable: true, compareKey: 'total',
    about: 'How much was invoiced in a period, by company, with the GST split (CGST and SGST) and how much of it is paid, e.g. "how much did we bill this month", "GST collected last quarter", "furniture invoices in September", "billing compared to last month".',
    keywords: ['invoiced', 'billed', 'billing', 'revenue', 'sales', 'turnover', 'gst', 'cgst', 'sgst', 'tax collected'],
    async run(c) {
      const p = c.period || { from: c.today.slice(0, 8) + '01', to: c.today, label: 'This month' };
      const args = []; let where = "i.is_deleted_record = 0 AND i.status != 'draft'";
      if (p.from) { where += ' AND i.submitted_on BETWEEN ? AND ?'; args.push(p.from, p.to); }
      if (c.company && c.company !== 'all') { where += ' AND i.company = ?'; args.push(c.company); }
      if (c.client) { where += ' AND i.client_id = ?'; args.push(c.client.id); }
      const inv = await queryAll(`SELECT i.company, i.status, i.place_of_supply, ${INVOICE_TOTALS} FROM invoices i WHERE ${where}`, args);
      const by = new Map();
      for (const r of inv) {
        const g = by.get(r.company) || { company: COMPANY_NAME[r.company] || r.company, invoices: 0, subtotal: 0, cgst: 0, sgst: 0, igst: 0, total: 0, paid: 0 };
        const t = Number(r.subtotal) + Number(r.tax);
        g.invoices++; g.subtotal += Number(r.subtotal); g.total += t; if (r.status === 'paid') g.paid += t;
        if (r.place_of_supply === 'other_state') g.igst += Number(r.tax); else { g.cgst += Number(r.tax) / 2; g.sgst += Number(r.tax) / 2; }
        by.set(r.company, g);
      }
      const rows = [...by.values()];
      const T = rows.reduce((a, r) => ({ total: a.total + r.total, tax: a.tax + r.cgst + r.sgst + r.igst, paid: a.paid + r.paid }), { total: 0, tax: 0, paid: 0 });
      return table({ title: `Invoiced · ${p.label}${c.client ? ` · ${c.client.label}` : ''}`, summary: inv.length ? `${inr(T.total)} invoiced on ${plural(inv.length, 'invoice')} (GST ${inr(T.tax)}); ${inr(T.paid)} of it paid.` : 'Nothing invoiced in this period.',
        columns: [col('company', 'Company'), col('invoices', 'Invoices', 'int'), col('subtotal', 'Before GST', 'money'), col('cgst', 'CGST', 'money'), col('sgst', 'SGST', 'money'), ...(rows.some((r) => r.igst) ? [col('igst', 'IGST', 'money')] : []), col('total', 'Total', 'money'), col('paid', 'Paid', 'money')], rows,
        note: 'By invoice date; drafts excluded. GST is half CGST, half SGST, or all IGST for a site in another state, as on the PDF.', link: { path: '/clients', label: 'Open Clients' } });
    },
  },

  // ---------------- quotations ----------------
  {
    key: 'open_quotes', label: 'Open quotations', entity: ['client'], period: false, comparable: false,
    about: 'Quotations still open (draft or sent, not yet accepted or declined), with value incl. GST, validity and whether they have expired, optionally for one client or company, e.g. "open quotes", "which quotations are pending", "quotes waiting for a reply", "has the Mehta quote been accepted".',
    keywords: ['quote', 'quotes', 'quotation', 'quotations', 'estimate', 'proposal', 'pending quote', 'open quote'],
    async run(c) {
      const args = []; let where = "q.is_deleted_record = 0 AND q.status IN ('draft', 'sent')";
      if (c.company && c.company !== 'all') { where += ' AND q.company = ?'; args.push(c.company); }
      if (c.client) { where += ' AND q.client_id = ?'; args.push(c.client.id); }
      const rows = await queryAll(`SELECT q.id, q.quote_no, q.revision, q.status, q.quoted_on, q.valid_until, q.company, cl.name AS client, ${QUOTE_TOTALS}
        FROM quotations q JOIN clients cl ON cl.id = q.client_id WHERE ${where} ORDER BY q.valid_until IS NULL, q.valid_until`, args);
      const out = rows.map((r) => ({ quote: `${r.quote_no || `#${r.id}`}${r.revision > 1 ? ` R${r.revision}` : ''}`, client: r.client, status: r.status === 'sent' && r.valid_until && r.valid_until < c.today ? 'Expired' : label(r.status), amount: Number(r.subtotal) + Number(r.tax), dated: r.quoted_on, valid: r.valid_until }));
      const sum = out.reduce((a, r) => a + r.amount, 0), expired = out.filter((r) => r.status === 'Expired').length;
      return table({ title: `Open quotations${c.company && c.company !== 'all' ? ` · ${COMPANY_NAME[c.company]}` : ''}`, summary: out.length ? `${inr(sum)} quoted on ${plural(out.length, 'open quotation')}${expired ? `; ${expired} past ${expired === 1 ? 'its' : 'their'} validity` : ''}.` : 'No open quotations.',
        columns: [col('quote', 'Quote'), col('client', 'Client'), col('status', 'Status'), col('amount', 'Amount', 'money'), col('dated', 'Dated', 'date'), col('valid', 'Valid until', 'date')], ...cap(out),
        note: 'Amounts include GST. Superseded revisions are not counted.', link: { path: '/quotes', label: 'Open Quotes' } });
    },
  },
  {
    key: 'quotes_won', label: 'Quotations won and lost', entity: ['client'], period: true, comparable: true, compareKey: 'amount',
    about: 'Quotations decided in a period: how many and how much was accepted (won) versus declined (lost), and the share won, e.g. "how many quotes did we win this month", "conversion rate", "quotes accepted last month", "what did we lose".',
    keywords: ['won', 'win', 'lost', 'accepted', 'declined', 'conversion', 'converted', 'hit rate'],
    async run(c) {
      const p = c.period?.from ? c.period : { from: c.today.slice(0, 8) + '01', to: c.today, label: 'This month' };
      const args = [p.from, p.to]; let where = "q.is_deleted_record = 0 AND q.status IN ('accepted', 'declined') AND q.decided_on BETWEEN ? AND ?";
      if (c.company && c.company !== 'all') { where += ' AND q.company = ?'; args.push(c.company); }
      if (c.client) { where += ' AND q.client_id = ?'; args.push(c.client.id); }
      const rows = await queryAll(`SELECT q.status, ${QUOTE_TOTALS} FROM quotations q WHERE ${where}`, args);
      const sum = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + Number(r.subtotal) + Number(r.tax), 0);
      const n = (st) => rows.filter((r) => r.status === st).length;
      const won = sum('accepted'), lost = sum('declined');
      const out = [{ result: 'Won (accepted)', quotes: n('accepted'), amount: won }, { result: 'Lost (declined)', quotes: n('declined'), amount: lost }];
      return table({ title: `Quotations decided · ${p.label}`, summary: rows.length ? `${plural(n('accepted'), 'quotation')} won (${inr(won)}) and ${n('declined')} lost; ${Math.round((n('accepted') / rows.length) * 100)}% won by count.` : 'No quotation was accepted or declined in this period.',
        columns: [col('result', 'Result'), col('quotes', 'Quotations', 'int'), col('amount', 'Amount', 'money')], rows: out,
        note: 'By decision date; amounts include GST. Open quotes are not counted.', link: { path: '/quotes', label: 'Open Quotes' } });
    },
  },

  // ---------------- workshop: orders and people ----------------
  {
    key: 'orders', label: 'Workshop orders', entity: ['client', 'project'], period: true, comparable: false,
    about: 'Workshop (furniture) orders by status, which are late or due soon, optionally for a client, project or due period, e.g. "which orders are late", "what is the workshop working on", "orders due this week", "pending orders".',
    keywords: ['orders', 'workshop', 'order board', 'in progress', 'late orders', 'delayed', 'pending orders', 'deliveries', 'delivered'],
    async run(c) {
      const st = statusesIn(c.question, { pending: /\bpending|not started|queued\b/, in_progress: /\bin[ _-]?progress|working on|being made|on the floor\b/, done: /\b(done|ready|finished)\b/, delivered: /\bdelivered\b/, cancelled: /\bcancell?ed\b/ });
      const lateOnly = /\b(late|overdue|delayed|behind)\b/i.test(c.question);
      const args = []; let where = 'o.is_deleted_record = 0';
      if (st.length) { where += ` AND o.status IN (${st.map(() => '?').join(',')})`; args.push(...st); }
      else if (!c.period?.from) where += " AND o.status IN ('pending', 'in_progress', 'done')";
      if (c.period?.from) { where += ' AND o.due_date BETWEEN ? AND ?'; args.push(c.period.from, c.period.to); }
      if (c.client) { where += ' AND (o.client_id = ? OR p.client_id = ?)'; args.push(c.client.id, c.client.id); }
      if (c.project) { where += ' AND o.project_id = ?'; args.push(c.project.id); }
      let rows = await queryAll(`SELECT o.id, o.item, o.qty, o.status, o.due_date, COALESCE(p.name, cl.name) AS for_whom,
          (SELECT COUNT(DISTINCT w.employee_id) FROM work_logs w WHERE w.order_id = o.id AND w.is_deleted_record = 0) AS people
        FROM orders o LEFT JOIN projects p ON p.id = o.project_id LEFT JOIN clients cl ON cl.id = o.client_id WHERE ${where} ORDER BY o.due_date IS NULL, o.due_date`, args);
      const isLate = (r) => ['pending', 'in_progress'].includes(r.status) && r.due_date && r.due_date < c.today;
      if (lateOnly) rows = rows.filter(isLate);
      const out = rows.map((r) => ({ order: `#${r.id} ${r.item}`, for_whom: r.for_whom, status: label(r.status), due: r.due_date, when: isLate(r) ? `${daysBetween(r.due_date, c.today)}d late` : r.due_date && ['pending', 'in_progress'].includes(r.status) ? `in ${daysBetween(c.today, r.due_date)}d` : '', people: Number(r.people) }));
      const counts = Object.entries(rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {})).map(([s, k]) => `${k} ${label(s).toLowerCase()}`);
      return table({ title: lateOnly ? 'Late workshop orders' : `Workshop orders${c.period?.from ? ` due ${c.period.label.toLowerCase()}` : ''}`,
        summary: rows.length ? `${plural(rows.length, 'order')}: ${counts.join(', ')}${!lateOnly && rows.filter(isLate).length ? `; ${rows.filter(isLate).length} late` : ''}.` : lateOnly ? 'No order is late.' : 'No orders match.',
        columns: [col('order', 'Order'), col('for_whom', 'For'), col('status', 'Status'), col('due', 'Due', 'date'), col('when', 'When'), col('people', 'People', 'int')], ...cap(out), link: { path: '/orders', label: 'Open Orders' } });
    },
  },
  {
    key: 'order_history', label: 'Who worked on an order', entity: ['order'], required: true, period: false, comparable: false,
    about: 'The work history of ONE workshop order: who worked on which part, on which days, hours and rating, e.g. "who worked on the cafe counter", "work done on order 3", "history of the dining table".',
    keywords: ['who worked', 'worked on', 'work history', 'history of', 'who made', 'who built'],
    async run(c) {
      const [o, rows] = await Promise.all([
        queryOne('SELECT item, status, due_date FROM orders WHERE id = ?', [c.order.id]),
        queryAll(`SELECT w.date, e.name AS employee, w.description, w.start_time, w.end_time, w.rating FROM work_logs w JOIN employees e ON e.id = w.employee_id
          WHERE w.order_id = ? AND w.is_deleted_record = 0 ORDER BY w.date, w.start_time`, [c.order.id]),
      ]);
      const hrs = (r) => { if (!r.start_time || !r.end_time) return null; const [a, b] = [r.start_time, r.end_time].map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); }); return b > a ? Math.round(((b - a) / 60) * 10) / 10 : null; };
      const out = rows.map((r) => ({ date: r.date, employee: r.employee, part: r.description, hours: hrs(r), rating: r.rating }));
      const people = new Set(rows.map((r) => r.employee)), days = new Set(rows.map((r) => r.date));
      const H = out.reduce((a, r) => a + (r.hours || 0), 0), rated = out.filter((r) => r.rating);
      return table({ title: `#${c.order.id} ${o.item}`, summary: rows.length ? `${plural(people.size, 'person')} over ${plural(days.size, 'day')}${H ? `, ${Math.round(H * 10) / 10} hours logged` : ''}${rated.length ? `, average rating ${(rated.reduce((a, r) => a + r.rating, 0) / rated.length).toFixed(1)}/5` : ''} · ${label(o.status)}${o.due_date ? `, due ${fmtD(o.due_date)}` : ''}.` : `No work logged yet · ${label(o.status)}.`,
        columns: [col('date', 'Date', 'date'), col('employee', 'Who'), col('part', 'Part / work'), col('hours', 'Hours', 'int'), col('rating', 'Rating', 'int')], ...cap(out), link: { path: `/orders/${c.order.id}`, label: 'Open the order' } });
    },
  },
  {
    key: 'turnaround', label: 'Workshop turnaround and on-time delivery', entity: ['client'], period: true, comparable: false,
    about: 'Statistics on delivered workshop orders: how many days from start to delivery on average, and what share were delivered on or before the due date, e.g. "how long do orders take", "are we delivering on time", "average turnaround this year".',
    keywords: ['turnaround', 'on time', 'on-time', 'how long do orders take', 'lead time', 'average time', 'delivery performance'],
    async run(c) {
      const p = c.period?.from ? c.period : { from: add(c.today, -179), to: c.today, label: 'Last 6 months' };
      const args = [p.from, p.to]; let where = "o.is_deleted_record = 0 AND o.status = 'delivered' AND o.delivered_at BETWEEN ? AND ?";
      if (c.client) { where += ' AND (o.client_id = ? OR pr.client_id = ?)'; args.push(c.client.id, c.client.id); }
      const rows = await queryAll(`SELECT o.id, o.item, o.start_date, o.due_date, o.delivered_at, COALESCE(pr.name, cl.name) AS for_whom FROM orders o
        LEFT JOIN projects pr ON pr.id = o.project_id LEFT JOIN clients cl ON cl.id = o.client_id WHERE ${where} ORDER BY o.delivered_at DESC`, args);
      const out = rows.map((r) => ({ order: `#${r.id} ${r.item}`, for_whom: r.for_whom, days: r.start_date ? daysBetween(r.start_date, r.delivered_at) : null, delivered: r.delivered_at,
        vs_due: !r.due_date ? '' : r.delivered_at <= r.due_date ? `On time${r.delivered_at < r.due_date ? ` (${daysBetween(r.delivered_at, r.due_date)}d early)` : ''}` : `${daysBetween(r.due_date, r.delivered_at)}d late` }));
      const timed = out.filter((r) => r.days !== null), dated = rows.filter((r) => r.due_date);
      const onTime = dated.filter((r) => r.delivered_at <= r.due_date).length;
      const avg = timed.length ? Math.round(timed.reduce((a, r) => a + r.days, 0) / timed.length) : null;
      return table({ title: `Delivered orders · ${p.label}`, summary: rows.length ? `${plural(rows.length, 'order')} delivered${avg !== null ? `, ${avg} days from start to delivery on average` : ''}${dated.length ? `; ${onTime} of ${dated.length} on time (${Math.round((onTime / dated.length) * 100)}%)` : ''}.` : 'No orders were delivered in this period.',
        columns: [col('order', 'Order'), col('for_whom', 'For'), col('days', 'Days', 'int'), col('delivered', 'Delivered', 'date'), col('vs_due', 'Against due date')], ...cap(out),
        note: 'Days = start date to delivery date. Orders without a start or due date are left out of that figure.', link: { path: '/orders', label: 'Open Orders' } });
    },
  },
  {
    key: 'attendance', label: 'Attendance on a day', entity: null, period: true, comparable: false,
    about: 'Who is present, half day or absent on ONE day (today unless a day is named), with in and out times, e.g. "who is in today", "attendance yesterday", "who was absent on Monday".',
    keywords: ['attendance', 'present', 'absent', 'who is in', "who's in", 'came in', 'half day', 'on leave'],
    async run(c) {
      const day = c.period?.from && c.period.from === c.period.to ? c.period.from : c.today;
      const rows = await queryAll(`SELECT e.name, e.profession, a.status, a.in_time, a.out_time FROM employees e
        LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ? AND a.is_deleted_record = 0
        WHERE e.is_deleted_record = 0 AND e.active = 1 ORDER BY CASE a.status WHEN 'present' THEN 0 WHEN 'half' THEN 1 WHEN 'absent' THEN 2 ELSE 3 END, e.name`, [day]);
      const k = (s) => rows.filter((r) => r.status === s).length;
      const out = rows.map((r) => ({ employee: r.name, role: r.profession, status: r.status ? label(r.status === 'half' ? 'half day' : r.status) : 'Not marked', in_time: r.in_time, out_time: r.out_time }));
      return table({ title: `Attendance · ${fmtD(day)}`, summary: `${k('present')} present, ${k('half')} half day, ${k('absent')} absent${rows.filter((r) => !r.status).length ? `, ${rows.filter((r) => !r.status).length} not marked` : ''} (of ${rows.length}).`,
        columns: [col('employee', 'Person'), col('role', 'Role'), col('status', 'Status'), col('in_time', 'In'), col('out_time', 'Out')], ...cap(out), link: { path: '/people', label: 'Open People' } });
    },
  },
  {
    key: 'days_worked', label: 'Days worked', entity: ['employee'], period: true, comparable: true, compareKey: 'days',
    about: 'How many days each workshop person worked in a period (present = 1, half day = 0.5) and their absences, e.g. "days worked this month", "how many days did Suresh work in September", "attendance summary last month".',
    keywords: ['days worked', 'how many days', 'attendance summary', 'absences', 'leaves', 'days present'],
    async run(c) {
      const p = c.period?.from ? c.period : { from: c.today.slice(0, 8) + '01', to: c.today, label: 'This month' };
      const args = [p.from, p.to]; let where = 'e.is_deleted_record = 0';
      if (c.employee) { where += ' AND e.id = ?'; args.push(c.employee.id); }
      const rows = await queryAll(`SELECT e.name,
          COALESCE(SUM(CASE a.status WHEN 'present' THEN 1 WHEN 'half' THEN 0.5 ELSE 0 END), 0) AS days,
          COALESCE(SUM(a.status = 'half'), 0) AS halves, COALESCE(SUM(a.status = 'absent'), 0) AS absent
        FROM employees e LEFT JOIN attendance a ON a.employee_id = e.id AND a.is_deleted_record = 0 AND a.date BETWEEN ? AND ?
        WHERE ${where} GROUP BY e.id HAVING e.active = 1 OR days > 0 ORDER BY days DESC, e.name`, args);
      const out = rows.map((r) => ({ employee: r.name, days: Number(r.days), halves: Number(r.halves), absent: Number(r.absent) }));
      return table({ title: `Days worked · ${p.label}`, summary: out.length === 1 ? `${out[0].employee}: ${out[0].days} days (${out[0].halves} half, ${out[0].absent} absent).` : `${plural(out.length, 'person')}, ${out.reduce((a, r) => a + r.days, 0)} person-days in total.`,
        columns: [col('employee', 'Person'), col('days', 'Days', 'int'), col('halves', 'Half days', 'int'), col('absent', 'Absent', 'int')], ...cap(out), note: 'Present = 1 day, half day = 0.5.', link: { path: '/people', label: 'Open People' } });
    },
  },
  {
    key: 'payroll', label: 'Payroll for a month', entity: ['employee'], period: true, comparable: true, compareKey: 'net', staffBlocked: true,
    about: 'Payroll for one month: days × daily rate or the monthly salary, minus advances, what is owed and what is already paid, e.g. "payroll this month", "what do we owe Mahesh for September", "salary bill last month".',
    keywords: ['payroll', 'salary', 'salaries', 'wages', 'wage bill', 'pay the workers', 'owe the workers'],
    async run(c) {
      if (c.staff) throw STAFF_NO('payroll');
      const period = monthOf(c.period, c.today);
      if (!period) return table({ title: 'Payroll', summary: 'Payroll is worked out per calendar month. Ask for one month, for example "payroll for September".', columns: [], rows: [] });
      const args = [period, period, period, period, period]; let where = 'e.is_deleted_record = 0';
      if (c.employee) { where += ' AND e.id = ?'; args.push(c.employee.id); }
      const rows = await queryAll(`SELECT e.name, e.pay_type, e.pay_rate, e.active,
          COALESCE((SELECT SUM(CASE a.status WHEN 'present' THEN 1 WHEN 'half' THEN 0.5 ELSE 0 END) FROM attendance a WHERE a.employee_id = e.id AND strftime('%Y-%m', a.date) = ? AND a.is_deleted_record = 0), 0) AS days,
          COALESCE((SELECT SUM(x.amount) FROM employee_expenses x WHERE x.employee_id = e.id AND x.kind = 'advance' AND strftime('%Y-%m', x.date) = ? AND x.is_deleted_record = 0), 0) AS advances,
          (SELECT p.net FROM payroll_payments p WHERE p.employee_id = e.id AND p.period = ? AND p.is_deleted_record = 0) AS paid_net,
          (SELECT p.paid_on FROM payroll_payments p WHERE p.employee_id = e.id AND p.period = ? AND p.is_deleted_record = 0) AS paid_on
        FROM employees e WHERE ${where} AND (e.active = 1 OR (SELECT COUNT(*) FROM attendance a2 WHERE a2.employee_id = e.id AND strftime('%Y-%m', a2.date) = ? AND a2.is_deleted_record = 0) > 0)
        ORDER BY e.name`, args);
      const out = rows.map((r) => {
        const gross = r.pay_type === 'daily' ? Number(r.days) * Number(r.pay_rate) : Number(r.pay_rate);
        return { employee: r.name, basis: r.pay_type === 'daily' ? `${r.days} days × ${inr(r.pay_rate)}` : `Salary ${inr(r.pay_rate)}`, gross, advances: Number(r.advances), net: gross - Number(r.advances), paid: r.paid_on ? `Paid ${fmtD(r.paid_on)}` : 'Not paid' };
      });
      const T = out.reduce((a, r) => ({ net: a.net + r.net, unpaid: a.unpaid + (r.paid === 'Not paid' ? r.net : 0) }), { net: 0, unpaid: 0 });
      const [y, m] = period.split('-').map(Number);
      return table({ title: `Payroll · ${new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`, summary: `${inr(T.net)} net for ${plural(out.length, 'person')}; ${T.unpaid ? `${inr(T.unpaid)} not paid yet` : 'all paid'}.`,
        columns: [col('employee', 'Person'), col('basis', 'Basis'), col('gross', 'Gross', 'money'), col('advances', 'Advances', 'money'), col('net', 'Net', 'money'), col('paid', 'Paid')], ...cap(out),
        note: 'Gross = days × daily rate, or the monthly salary; net = gross − advances that month. Same as People → Payroll.', link: { path: '/people', label: 'Open People' } });
    },
  },
  {
    key: 'advances', label: 'Advances and expenses', entity: ['employee'], period: true, comparable: false, staffBlocked: true,
    about: 'Advances given to workshop people (and their expenses), and whether that month\'s payroll has recovered them yet, e.g. "advances not recovered", "how much advance did Imran take", "advances this month".',
    keywords: ['advance', 'advances', 'loan', 'recover', 'recovered', 'expense claims'],
    async run(c) {
      if (c.staff) throw STAFF_NO('advances');
      const args = []; let where = 'x.is_deleted_record = 0';
      if (c.period?.from) { where += ' AND x.date BETWEEN ? AND ?'; args.push(c.period.from, c.period.to); }
      else { where += ' AND x.date >= ?'; args.push(add(c.today, -90)); }
      if (c.employee) { where += ' AND x.employee_id = ?'; args.push(c.employee.id); }
      const rows = await queryAll(`SELECT x.date, x.kind, x.amount, x.description, e.name,
          (SELECT p.paid_on FROM payroll_payments p WHERE p.employee_id = x.employee_id AND p.period = strftime('%Y-%m', x.date) AND p.is_deleted_record = 0) AS paid_on
        FROM employee_expenses x JOIN employees e ON e.id = x.employee_id WHERE ${where} ORDER BY x.date DESC`, args);
      const out = rows.map((r) => ({ date: r.date, employee: r.name, kind: label(r.kind), amount: Number(r.amount), recovered: r.kind !== 'advance' ? '' : r.paid_on ? `Yes, payroll paid ${fmtD(r.paid_on)}` : 'Not yet', note: r.description }));
      const open = out.filter((r) => r.recovered === 'Not yet').reduce((a, r) => a + r.amount, 0);
      return table({ title: `Advances and expenses · ${c.period?.from ? c.period.label : 'last 90 days'}`, summary: rows.length ? `${inr(out.filter((r) => r.kind === 'Advance').reduce((a, r) => a + r.amount, 0))} in advances; ${open ? `${inr(open)} not recovered yet` : 'all recovered'}.` : 'No advances or expenses.',
        columns: [col('date', 'Date', 'date'), col('employee', 'Person'), col('kind', 'Kind'), col('amount', 'Amount', 'money'), col('recovered', 'Recovered'), col('note', 'Note')], ...cap(out),
        note: "An advance is recovered from that month's payroll once it is paid.", link: { path: '/people', label: 'Open People' } });
    },
  },
  {
    key: 'work_ratings', label: 'Work-log ratings', entity: ['employee'], period: true, comparable: true, compareKey: 'avg',
    about: 'How each workshop person\'s logged work was rated (1–5) in a period, with how many logs, days and orders, e.g. "who is doing the best work", "Suresh\'s ratings this month", "work quality last month".',
    keywords: ['rating', 'ratings', 'rated', 'best work', 'quality', 'performance', 'productive', 'productivity'],
    async run(c) {
      const p = c.period?.from ? c.period : { from: add(c.today, -29), to: c.today, label: 'Last 30 days' };
      const args = [p.from, p.to]; let where = 'w.is_deleted_record = 0 AND w.date BETWEEN ? AND ?';
      if (c.employee) { where += ' AND w.employee_id = ?'; args.push(c.employee.id); }
      const rows = await queryAll(`SELECT e.name, COUNT(*) AS logs, COUNT(DISTINCT w.date) AS days, COUNT(DISTINCT w.order_id) AS orders,
          AVG(w.rating) AS avg, COUNT(w.rating) AS rated FROM work_logs w JOIN employees e ON e.id = w.employee_id WHERE ${where} GROUP BY e.id ORDER BY avg DESC, logs DESC`, args);
      const out = rows.map((r) => ({ employee: r.name, avg: r.avg === null ? null : Math.round(Number(r.avg) * 10) / 10, rated: Number(r.rated), logs: Number(r.logs), days: Number(r.days), orders: Number(r.orders) }));
      return table({ title: `Work ratings · ${p.label}`, summary: out.length ? `${plural(out.reduce((a, r) => a + r.logs, 0), 'work log')} by ${plural(out.length, 'person')}${out[0]?.avg ? `; highest average ${out[0].employee} (${out[0].avg}/5)` : ''}.` : 'No work logged in this period.',
        columns: [col('employee', 'Person'), col('avg', 'Avg rating', 'int'), col('rated', 'Rated logs', 'int'), col('logs', 'Logs', 'int'), col('days', 'Days', 'int'), col('orders', 'Orders', 'int')], ...cap(out),
        note: 'Ratings are given on the daily worksheet, 1 to 5.', link: { path: '/people', label: 'Open People' } });
    },
  },

  // ---------------- vendors ----------------
  {
    key: 'vendor_pos', label: 'Material still to come (open POs)', entity: ['vendor', 'project'], period: false, comparable: false,
    about: 'Open purchase orders with vendors and how much material is still outstanding (ordered − delivered + returned), optionally for a vendor or project, e.g. "what material is pending", "open POs with Shree Plywood", "what is still to be delivered for the Mehta bungalow".',
    keywords: ['open po', 'open pos', 'purchase order', 'material pending', 'to be delivered', 'not delivered', 'outstanding material', 'pending delivery', 'material'],
    async run(c) {
      const args = []; let where = "vp.is_deleted_record = 0 AND vp.status = 'open'";
      if (c.vendor) { where += ' AND vp.vendor_id = ?'; args.push(c.vendor.id); }
      if (c.project) { where += ' AND vp.project_id = ?'; args.push(c.project.id); }
      const rows = await queryAll(`SELECT vp.item, vp.qty_ordered, vp.rate, vp.ordered_on, v.name AS vendor, p.name AS project,
          COALESCE((SELECT SUM(d.qty_delivered) FROM vendor_deliveries d WHERE d.vendor_po_id = vp.id AND d.is_deleted_record = 0), 0) AS delivered,
          COALESCE((SELECT SUM(d.qty_returned) FROM vendor_deliveries d WHERE d.vendor_po_id = vp.id AND d.is_deleted_record = 0), 0) AS returned
        FROM vendor_pos vp JOIN vendors v ON v.id = vp.vendor_id LEFT JOIN projects p ON p.id = vp.project_id WHERE ${where} ORDER BY vp.ordered_on`, args);
      const out = rows.map((r) => { const outQ = Number(r.qty_ordered) - Number(r.delivered) + Number(r.returned); return { item: r.item, vendor: r.vendor, project: r.project, ordered: Number(r.qty_ordered), delivered: Number(r.delivered), returned: Number(r.returned), outstanding: outQ, value: r.rate ? outQ * Number(r.rate) : null, since: r.ordered_on }; });
      const val = out.reduce((a, r) => a + (r.value || 0), 0);
      return table({ title: `Open POs${c.vendor ? ` · ${c.vendor.label}` : ''}${c.project ? ` · ${c.project.label}` : ''}`, summary: out.length ? `${plural(out.length, 'open PO')}; ${plural(out.filter((r) => r.outstanding > 0).length, 'line')} still to come${val ? `, worth ${inr(val)}` : ''}.` : 'No open purchase orders.',
        columns: [col('item', 'Item'), col('vendor', 'Vendor'), col('project', 'Project'), col('ordered', 'Ordered', 'int'), col('delivered', 'Delivered', 'int'), col('returned', 'Returned', 'int'), col('outstanding', 'Outstanding', 'int'), col('value', 'Value due', 'money'), col('since', 'Ordered', 'date')], ...cap(out),
        note: 'Outstanding = ordered − delivered + returned.', link: { path: '/vendors', label: 'Open Vendors' } });
    },
  },
  {
    key: 'vendor_spend', label: 'What we spend with vendors', entity: ['vendor'], period: false, comparable: false,
    about: 'Total spend per vendor (POs at rate + freight − returns − cash already paid to them), open POs and overcharge count, e.g. "how much have we spent with vendors", "who is our biggest supplier", "what do we owe Laminate House".',
    keywords: ['spend', 'spent', 'biggest supplier', 'vendor total', 'owe the vendor', 'payable', 'payables', 'vendor balance'],
    async run(c) {
      const args = []; let where = 'v.is_deleted_record = 0';
      if (c.vendor) { where += ' AND v.id = ?'; args.push(c.vendor.id); }
      const rows = await queryAll(`SELECT v.id, v.name, v.material, ${vendorExpenseSQL('v')} AS total,
          (SELECT COUNT(*) FROM vendor_pos vp WHERE vp.vendor_id = v.id AND vp.status = 'open' AND vp.is_deleted_record = 0) AS open_pos
        FROM vendors v WHERE ${where} ORDER BY total DESC`, args);
      const out = rows.map((r) => ({ vendor: r.name, material: r.material, total: Number(r.total), open_pos: Number(r.open_pos) }));
      return table({ title: c.vendor ? c.vendor.label : 'Vendor spend', summary: out.length ? `${inr(out.reduce((a, r) => a + r.total, 0))} across ${plural(out.length, 'vendor')}${out.length > 1 ? `; most with ${out[0].vendor} (${inr(out[0].total)})` : ''}.` : 'No vendors.',
        columns: [col('vendor', 'Vendor'), col('material', 'Supplies'), col('total', 'Net expense', 'money'), col('open_pos', 'Open POs', 'int')], ...cap(out),
        note: 'Net expense = POs at rate + freight − returns − cash paid to the vendor (all time), as on the Vendors tab.', link: { path: c.vendor ? `/vendors/${c.vendor.id}` : '/vendors', label: c.vendor ? 'Open the vendor' : 'Open Vendors' } });
    },
  },
  {
    key: 'freight_overcharges', label: 'Freight overcharges', entity: ['vendor'], period: true, comparable: true, compareKey: 'extra',
    about: 'Freight or transport charges above the vendor\'s rate card for that route, and by how much, e.g. "any freight overcharges", "did Sardar Transport overcharge us", "transport charges above the rate card this month".',
    keywords: ['overcharge', 'overcharged', 'overcharges', 'freight', 'transport charge', 'rate card', 'charged more'],
    async run(c) {
      const args = []; let where = 'f.is_deleted_record = 0 AND f.amount > r.expected_amount';
      if (c.vendor) { where += ' AND f.vendor_id = ?'; args.push(c.vendor.id); }
      if (c.period?.from) { where += ' AND f.date BETWEEN ? AND ?'; args.push(c.period.from, c.period.to); }
      const rows = await queryAll(`SELECT f.date, v.name AS vendor, f.from_loc || ' → ' || f.to_loc AS route, f.amount, r.expected_amount FROM freight_charges f
        JOIN vendor_rates r ON r.vendor_id = f.vendor_id AND LOWER(r.from_loc) = LOWER(f.from_loc) AND LOWER(r.to_loc) = LOWER(f.to_loc) AND r.is_deleted_record = 0
        JOIN vendors v ON v.id = f.vendor_id WHERE ${where} ORDER BY f.date DESC`, args);
      const out = rows.map((r) => ({ date: r.date, vendor: r.vendor, route: r.route, charged: Number(r.amount), expected: Number(r.expected_amount), extra: Number(r.amount) - Number(r.expected_amount) }));
      return table({ title: `Freight above the rate card${c.period?.from ? ` · ${c.period.label}` : ''}`, summary: out.length ? `${plural(out.length, 'overcharge')}, ${inr(out.reduce((a, r) => a + r.extra, 0))} above the rate card.` : 'No freight charge is above its rate card.',
        columns: [col('date', 'Date', 'date'), col('vendor', 'Vendor'), col('route', 'Route'), col('charged', 'Charged', 'money'), col('expected', 'Rate card', 'money'), col('extra', 'Extra', 'money')], ...cap(out),
        compareRows: Object.values(out.reduce((a, r) => { a[r.vendor] = a[r.vendor] || { vendor: r.vendor, extra: 0 }; a[r.vendor].extra += r.extra; return a; }, {})), compareCols: [col('vendor', 'Vendor')],
        note: 'Only routes on the vendor\'s rate card can be checked.', link: { path: c.vendor ? `/vendors/${c.vendor.id}` : '/vendors', label: c.vendor ? 'Open the vendor' : 'Open Vendors' } });
    },
  },

  // ---------------- the asker's own notes ----------------
  {
    key: 'my_notes', label: 'Your notes', entity: ['client'], period: false, comparable: false,
    about: 'Notes the person asked the assistant to keep, optionally about one client: "my notes", "what did I note about the Mehtas", "what did I write down about Brewnest".',
    keywords: ['my notes', 'did i note', 'i noted', 'write down', 'wrote down', 'remembered'],
    async run(c) {
      const args = [c.user]; let where = 'n.username = ?';
      if (c.client) { where += ' AND n.client_id = ?'; args.push(c.client.id); }
      const rows = await queryAll(`SELECT n.created_at, n.body, cl.name AS client FROM assistant_notes n LEFT JOIN clients cl ON cl.id = n.client_id WHERE ${where} ORDER BY n.id DESC`, args);
      return table({ title: `Your notes${c.client ? ` · ${c.client.label}` : ''}`, summary: rows.length ? `${plural(rows.length, 'note')}${c.client ? ` about ${c.client.label}` : ''}.` : 'No notes yet. Say “note that …” to keep one.',
        columns: [col('date', 'Noted', 'date'), col('client', 'Client'), col('note', 'Note')],
        ...cap(rows.map((r) => ({ date: String(r.created_at).slice(0, 10), client: r.client, note: r.body }))), note: 'Only you can see your notes. Delete them in Settings → My assistant.', link: { path: '/settings', label: 'Open Settings' } });
    },
  },

  // ---------------- cash ----------------
  {
    key: 'cash', label: 'Cash in and out', entity: null, period: true, comparable: true, compareKey: 'amount',
    about: 'The cash book (NOT bank statements) for a period: money in, money out, net, the running cash balance and the biggest entries, e.g. "how much cash came in this month", "cash spent last week", "what is the cash balance", "cash compared to last month".',
    keywords: ['cash', 'money in', 'money out', 'spent', 'expenses', 'balance', 'received', 'payments', 'cash book', 'petty cash'],
    async run(c) {
      const p = c.period || { from: c.today.slice(0, 8) + '01', to: c.today, label: 'This month' };
      const own = c.staff ? { sql: ' AND created_by = ?', args: [c.user] } : { sql: '', args: [] };
      const b = between(p, 'date');
      const [tot, bal, top] = await Promise.all([
        queryOne(`SELECT COALESCE(SUM(CASE WHEN kind = 'credit' THEN amount END), 0) AS cin, COALESCE(SUM(CASE WHEN kind = 'debit' THEN amount END), 0) AS cout, COUNT(*) AS k
          FROM cash_transactions WHERE is_deleted_record = 0${b.sql}${own.sql}`, [...b.args, ...own.args]),
        queryOne(`SELECT COALESCE(SUM(CASE WHEN kind = 'credit' THEN amount ELSE -amount END), 0) AS bal FROM cash_transactions WHERE is_deleted_record = 0${own.sql}`, own.args),
        queryAll(`SELECT date, kind, amount, party, description FROM cash_transactions WHERE is_deleted_record = 0${b.sql}${own.sql} ORDER BY amount DESC LIMIT 8`, [...b.args, ...own.args]),
      ]);
      const rows = [{ line: 'Money in', amount: Number(tot.cin) }, { line: 'Money out', amount: Number(tot.cout) }, { line: 'Net', amount: Number(tot.cin) - Number(tot.cout) }];
      return table({ title: `Cash · ${p.label}${c.staff ? ' · your entries' : ''}`, summary: `${inr(tot.cin)} in, ${inr(tot.cout)} out, net ${inr(Number(tot.cin) - Number(tot.cout))} over ${plural(tot.k, 'entry')}. ${c.staff ? 'Your entries balance' : 'Cash balance'} today: ${inr(bal.bal)}.`,
        columns: [col('line', ''), col('amount', 'Amount', 'money')], rows,
        cards: top.length ? [{ type: 'table', tool: 'cash', toolLabel: 'Cash in and out', title: 'Largest entries', summary: `The ${plural(top.length, 'largest entry')} in this period.`,
          columns: [col('date', 'Date', 'date'), col('kind', 'In / out'), col('party', 'Party'), col('description', 'For'), col('amount', 'Amount', 'money')],
          rows: top.map((r) => ({ ...r, kind: r.kind === 'credit' ? 'In' : 'Out', amount: Number(r.amount) })), total: top.length }] : undefined,
        note: c.staff ? 'Showing only the cash entries you made (same as your Finance tab).' : 'Cash book only. Ask about the bank for bank statements.', link: { path: '/finance', label: 'Open Finance' } });
    },
  },

  // ---------------- bank, overall position, project profit (owners, admins, managers) ----------------
  {
    key: 'bank_balance', label: 'Bank balance', entity: null, period: false, comparable: false, staffBlocked: true,
    about: 'Bank account balances (NOT the cash book) from the latest uploaded bank statement of each account, e.g. "how much is in the bank", "HDFC balance", "bank balance", "what is in our current account".',
    keywords: ['bank balance', 'in the bank', 'balance in bank', 'account balance', 'bank account'],
    async run(c) {
      const docs = await bankDocs();
      if (!docs.length) return NO_BANK('Bank balance');
      const want = accountsIn(c.question, docs);
      const latest = latestPerAccount(docs).filter((d) => !want.length || want.includes(d.account_no));
      const out = latest.map((d) => ({ account: acctLabel(d), as_of: d.statement_to, age: d.statement_to ? daysBetween(d.statement_to, c.today) : null,
        balance: Number(d.closing_balance) || 0, reviewed: d.status === 'approved' ? 'Yes' : 'Not yet' }));
      const total = out.reduce((a, r) => a + r.balance, 0);
      const oldest = out.map((r) => r.as_of).filter(Boolean).sort()[0];
      const unrev = out.filter((r) => r.reviewed !== 'Yes').length;
      return table({ title: 'Bank balance', summary: `${inr(total)} across ${plural(out.length, 'account')}${oldest ? `, as of ${fmtD(oldest)} (${daysBetween(oldest, c.today)} days ago)` : ''}${unrev ? `; ${plural(unrev, 'statement')} not reviewed yet` : ''}.${reconcileNote(unreconciled(latest))}`,
        columns: [col('account', 'Account'), col('as_of', 'As of', 'date'), col('age', 'Days old', 'int'), col('balance', 'Closing balance', 'money'), col('reviewed', 'Reviewed')], rows: out,
        note: 'Closing balance printed on each account\'s latest uploaded statement, not a live balance. Covers all accounts (they are not split by company).', link: { path: '/finance', label: 'Open Finance' } });
    },
  },
  {
    key: 'bank_transactions', label: 'Bank transactions', entity: null, period: true, comparable: true, compareKey: 'amount', staffBlocked: true,
    about: 'Lines on bank statements (NOT the cash book): money into or out of the bank in a period, the biggest debits or credits, or payments to or from someone by name, e.g. "biggest debits from HDFC in July", "what came into the bank last month", "bank payments to Rahul Kumar", "bank transactions compared to last month".',
    keywords: ['bank transactions', 'bank statement', 'bank debits', 'bank credits', 'from the bank', 'into the bank', 'bank payments', 'neft', 'upi', 'imps', 'rtgs'],
    async run(c) {
      const docs = await bankDocs();
      if (!docs.length) return NO_BANK('Bank transactions');
      const accountNos = accountsIn(c.question, docs);
      const bankWords = new Set(docs.flatMap((d) => words(d.bank_name || '')));
      const party = distinctive(c.question).filter((w) => !BANK_WORDS.has(w) && !bankWords.has(w) && !/^\d+$/.test(w));
      const mineDocs = docs.filter((d) => !accountNos.length || accountNos.includes(d.account_no));
      let p = c.period;
      if (!p?.from) {
        // A named person with no period: their payments ever. Otherwise the latest statement's own period: statements
        // arrive after month end and often end on the 1st, so "this month" or "the newest month" would be near empty.
        const latest = latestPerAccount(mineDocs);
        const from = latest.map((d) => d.statement_from).filter(Boolean).sort()[0], to = latest.map((d) => d.statement_to).filter(Boolean).sort().pop();
        p = party.length || !from || !to ? { from: null, to: null, label: 'All time' } : { from, to, label: `${fmtD(from)} – ${fmtD(to)}` };
      }
      let lines = bankLines(docs, { period: p, accountNos });
      const q = norm(c.question);
      const wantIn = BANK_IN.test(q), wantOut = BANK_OUT.test(q);
      if (wantIn && !wantOut) lines = lines.filter((l) => l.amount > 0);
      if (wantOut && !wantIn) lines = lines.filter((l) => l.amount < 0);
      const touched = mineDocs.filter((d) => !p.from || (d.statement_from <= p.to && d.statement_to >= p.from));
      if (party.length) lines = lines.filter((l) => { const t = norm(l.description); return party.every((w) => t.includes(w)); });
      const cin = lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
      const cout = lines.filter((l) => l.amount < 0).reduce((a, l) => a - l.amount, 0);
      const unrev = lines.filter((l) => !l.reviewed).length;
      const out = [...lines].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).map((l) => ({ ...l, reviewed: l.reviewed ? 'Yes' : 'Not yet' }));
      return table({ title: `Bank · ${p.label}${party.length ? ` · “${party.join(' ')}”` : ''}`,
        summary: (lines.length ? `${inr(cin)} in, ${inr(cout)} out, net ${inr(cin - cout)} over ${plural(lines.length, 'line')}${unrev ? `; ${unrev} not reviewed yet` : ''}.` : `No bank lines${party.length ? ` mentioning “${party.join(' ')}”` : ''} in ${p.from ? p.label : 'any statement'}.`)
          + reconcileNote(unreconciled([...new Map(touched.map((d) => [`${d.account_no}|${d.statement_from}|${d.statement_to}`, d])).values()])),
        columns: [col('date', 'Date', 'date'), col('account', 'Account'), col('description', 'Description'), col('amount', 'Amount', 'money'), col('reviewed', 'Reviewed')], ...cap(out),
        compareRows: [{ line: 'Money in', amount: cin }, { line: 'Money out', amount: cout }, { line: 'Net', amount: cin - cout }], compareCols: [col('line', '')],
        note: 'Largest lines first; out is negative. Hidden duplicate lines are left out and a line on two overlapping statements counts once. Covers all accounts unless one is named.', link: { path: '/finance', label: 'Open Finance' } });
    },
  },
  {
    key: 'money_position', label: 'Money position', entity: null, period: false, comparable: false, staffBlocked: true,
    about: 'Where the business stands overall: cash in hand + money in the bank + money owed to us together (NOT just cash, NOT just the bank), e.g. "how much money do we have", "where do we stand financially", "total funds", "overall position".',
    keywords: ['how much money', 'money do we have', 'where do we stand', 'total funds', 'overall position', 'financial position', 'net position'],
    async run(c) {
      const [cashRow, docs, inv] = await Promise.all([
        queryOne(`SELECT COALESCE(SUM(CASE WHEN kind = 'credit' THEN amount ELSE -amount END), 0) AS bal FROM cash_transactions WHERE is_deleted_record = 0`),
        bankDocs(),
        queryAll(`SELECT i.due_date, ${INVOICE_TOTALS} FROM invoices i WHERE i.is_deleted_record = 0 AND i.status = 'sent'`),
      ]);
      const latest = latestPerAccount(docs);
      const bank = latest.reduce((a, d) => a + (Number(d.closing_balance) || 0), 0);
      const oldest = latest.map((d) => d.statement_to).filter(Boolean).sort()[0];
      const owed = inv.reduce((a, r) => a + Number(r.subtotal) + Number(r.tax), 0);
      const late = inv.filter((r) => r.due_date && r.due_date < c.today).reduce((a, r) => a + Number(r.subtotal) + Number(r.tax), 0);
      const cash = Number(cashRow.bal);
      const rows = [
        { line: 'Cash in hand', amount: cash, detail: 'cash book, all time' },
        { line: 'In the bank', amount: bank, detail: latest.length ? `${plural(latest.length, 'account')}, as of ${fmtD(oldest)}` : 'no statements uploaded' },
        { line: 'Owed to us', amount: owed, detail: inv.length ? `${plural(inv.length, 'unpaid invoice')}${late ? `, ${inr(late)} past due` : ''}` : 'nothing outstanding' },
      ];
      return table({ title: 'Money position', summary: `${inr(cash + bank)} in cash and the bank${latest.length ? ` (bank as of ${fmtD(oldest)})` : ''}, plus ${inr(owed)} owed to us.`,
        columns: [col('line', ''), col('amount', 'Amount', 'money'), col('detail', 'From')], rows,
        note: 'What we owe vendors is left out: vendor totals don\'t know which bills were paid from the bank, so they would overstate it. Bank figures are the latest statements\' closing balances.', link: { path: '/finance', label: 'Open Finance' } });
    },
  },
  {
    key: 'project_profit', label: 'Project profit', entity: ['project', 'client'], period: false, comparable: false, staffBlocked: true,
    about: 'Whether a project made money: billed minus vendor materials minus estimated workshop labour, the margin and margin %, for one project, a client\'s projects, or the most and least profitable projects, e.g. "did the Mehta project make money", "margin on the Joshi flat", "most profitable projects", "which projects lost money".',
    keywords: ['profit', 'profitable', 'margin', 'made money', 'make money', 'lost money', 'loss making', 'earned on'],
    async run(c) {
      const args = []; let where = 'p.is_deleted_record = 0';
      if (c.project) { where += ' AND p.id = ?'; args.push(c.project.id); }
      else if (c.client) { where += ' AND p.client_id = ?'; args.push(c.client.id); }
      const [projects, invs, pos, labour] = await Promise.all([
        queryAll(`SELECT p.id, p.name, p.client_id, cl.name AS client FROM projects p LEFT JOIN clients cl ON cl.id = p.client_id WHERE ${where}`, args),
        queryAll(`SELECT i.project_id, i.client_id, i.status, ${INVOICE_TOTALS} FROM invoices i WHERE i.is_deleted_record = 0 AND i.status != 'draft'`),
        queryAll(`SELECT COALESCE(vp.project_id, o.project_id) AS project_id,
            vp.qty_ordered * COALESCE(vp.rate, 0) AS value,
            COALESCE((SELECT SUM(d.qty_returned) FROM vendor_deliveries d WHERE d.vendor_po_id = vp.id AND d.is_deleted_record = 0), 0) * COALESCE(vp.rate, 0) AS returned,
            COALESCE((SELECT SUM(f.amount) FROM freight_charges f WHERE f.vendor_po_id = vp.id AND f.is_deleted_record = 0), 0) AS freight
          FROM vendor_pos vp LEFT JOIN orders o ON o.id = vp.order_id AND o.is_deleted_record = 0
          WHERE vp.is_deleted_record = 0 AND vp.status != 'cancelled' AND COALESCE(vp.project_id, o.project_id) IS NOT NULL`),
        labourByProject(),
      ]);
      const out = projects.map((p) => {
        const mine = invs.filter((i) => i.project_id === p.id);
        const billed = mine.reduce((a, i) => a + Number(i.subtotal), 0);
        const materials = pos.filter((x) => x.project_id === p.id).reduce((a, x) => a + Number(x.value) - Number(x.returned) + Number(x.freight), 0);
        const lab = Math.round(labour.get(p.id) || 0);
        const margin = billed - materials - lab;
        return { project: p.name, client: p.client, client_id: p.client_id, id: p.id, billed, materials, labour: lab, margin, pct: billed ? `${Math.round((margin / billed) * 100)}%` : '—' };
      }).filter((r) => c.project || r.billed || r.materials || r.labour).sort((a, b) => b.margin - a.margin);
      const T = out.reduce((a, r) => ({ billed: a.billed + r.billed, cost: a.cost + r.materials + r.labour, margin: a.margin + r.margin }), { billed: 0, cost: 0, margin: 0 });
      // Workshop invoices are often raised to the client without a project; say so, or a margin reads low.
      const clientIds = new Set(out.map((r) => r.client_id));
      const unlinked = invs.filter((i) => i.project_id == null && clientIds.has(i.client_id)).reduce((a, i) => a + Number(i.subtotal), 0);
      const one = out.length === 1 ? out[0] : null;
      const summary = !out.length ? 'No project has invoices or costs yet.'
        : one ? `${one.project}: billed ${inr(one.billed)}, costs ${inr(one.materials + one.labour)} (materials ${inr(one.materials)}, labour ${inr(one.labour)} est.), margin ${inr(one.margin)}${one.billed ? ` (${one.pct})` : ''}.`
        : `${inr(T.margin)} margin on ${inr(T.billed)} billed across ${plural(out.length, 'project')}${T.billed ? ` (${Math.round((T.margin / T.billed) * 100)}%)` : ''}; best ${out[0].project} (${inr(out[0].margin)}), weakest ${out[out.length - 1].project} (${inr(out[out.length - 1].margin)}).`;
      return table({ title: one ? `Profit · ${one.project}` : `Project profit${c.client ? ` · ${c.client.label}` : ''}`,
        summary: summary + (unlinked ? ` ${inr(unlinked)} more was billed to ${one ? 'this client' : 'these clients'} without a project, so it isn't counted.` : ''),
        columns: [col('project', 'Project'), col('client', 'Client'), col('billed', 'Billed', 'money'), col('materials', 'Materials', 'money'), col('labour', 'Labour (est.)', 'money'), col('margin', 'Margin', 'money'), col('pct', 'Margin %')],
        ...cap(out.map(({ client_id, id, ...r }) => r)),
        note: 'Before GST. Materials = POs on the project or its orders at rate − returns + their freight. Labour is estimated: each person\'s day cost (daily wage, or salary ÷ days worked that month) split across the orders they logged that day by logged time. Site costs paid in cash aren\'t tied to a project, so they aren\'t included.',
        link: { path: one ? `/projects/${one.id}` : '/projects', label: one ? 'Open the project' : 'Open Projects' } });
    },
  },
];

export const BY_KEY = Object.fromEntries(TOOLS.map((t) => [t.key, t]));
// Paths the assistant may link to: the tabs, and a record's own page.
export const safePath = (p) => (typeof p === 'string' && /^\/(clients|quotes|projects|orders|people|vendors|finance|settings)?(\/\d+)?$/.test(p) ? p : null);
