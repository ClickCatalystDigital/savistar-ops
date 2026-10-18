// AI assistant — turning words in a question into exact records: clients, projects, workshop orders, vendors,
// employees, logins, the company (studio / workshop) and periods. Deterministic code; Jev is only asked to choose
// between the candidates found here. Periods are ported unchanged from reel-inventory's utils/assistantEntities.js.
import { queryAll } from './db';
import { BRAND } from './brand';
import { todayIST } from './assistant';

// ---------- text helpers ----------
export const STOP = new Set(('a an and any are as at be by can could did do does for from get give have how i in is it its list me my of on or our please '
  + 'show tell that the their there these this those to us was we were what whats when where which who whom why will with would you your '
  + 'many much total number numbers count left remaining still now current currently latest recent next last past days day weeks week months month '
  + 'years year ago since between during till until today yesterday tomorrow due overdue late pending open done status '
  + 'project projects client clients order orders job jobs ticket vendor vendors supplier suppliers employee employees staff worker workers people '
  + 'task tasks milestone milestones visit visits site invoice invoices bill bills po pos purchase cash money paid pay payroll salary advance advances '
  + 'about update progress happening going on doing work worked working who whom summary detail details overview '
  + 'pvt ltd llp private limited co company dr mr mrs ms both studio workshop interiors furniture '
  + 'january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec '
  + 'monday tuesday wednesday thursday friday saturday sunday quarter compared compare versus vs before').split(/\s+/));
export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9₹.%/+-]+/g, ' ').replace(/\s+/g, ' ').trim();
export const words = (s) => norm(s).split(' ').filter(Boolean);
export const distinctive = (q) => words(q).map((w) => w.replace(/^[.%/+-]+|[.%/+-]+$/g, '').replace(/'s$/, '')).filter((w) => w && !STOP.has(w) && (w.length >= 3 || /\d/.test(w)));

// Rank `rows` by how well the question's distinctive words hit `text(row)`. Words are weighted by rarity (a word in
// many records, like "apartment", counts for little), and a prefix match ("mehtas" / "mehta") counts.
function rank(question, rows, text) {
  const toks = [...new Set(distinctive(question))];
  if (!toks.length || !rows.length) return [];
  const hay = rows.map((r) => ({ r, w: new Set(words(text(r)).map((x) => x.replace(/'s$/, ''))) }));
  const match = (w, t) => w.has(t) || (t.length >= 4 && [...w].some((x) => x.length >= 4 && (x.startsWith(t) || t.startsWith(x))));
  const N = rows.length;
  const idf = new Map(toks.map((t) => [t, Math.log((N + 1) / ((hay.filter((h) => match(h.w, t)).length) || N + 1)) + 1]));
  return hay.map((h) => ({ r: h.r, hits: toks.filter((t) => match(h.w, t)).length, score: toks.reduce((a, t) => a + (match(h.w, t) ? idf.get(t) : 0), 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}

// ---------- records ----------
export async function clientCandidates(question) {
  const rows = await queryAll('SELECT id, name FROM clients WHERE is_deleted_record = 0');
  return rank(question, rows, (r) => r.name).slice(0, 5).map((x) => ({ id: x.r.id, label: x.r.name, score: x.score }));
}

// A project is found by its own name or its client's ("the Mehta job").
export async function projectCandidates(question) {
  const rows = await queryAll(`SELECT p.id, p.name, p.status, c.name AS client FROM projects p LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.is_deleted_record = 0`);
  return rank(question, rows, (r) => `${r.name} ${r.client || ''}`).slice(0, 5)
    .map((x) => ({ id: x.r.id, label: x.r.name, client: x.r.client, status: x.r.status, score: x.score }));
}

// "order 3" / "#3" by number, else by the item, its project or client.
export async function orderCandidates(question) {
  const rows = await queryAll(`SELECT o.id, o.item, o.status, p.name AS project, c.name AS client FROM orders o
    LEFT JOIN projects p ON p.id = o.project_id LEFT JOIN clients c ON c.id = o.client_id WHERE o.is_deleted_record = 0`);
  const num = /(?:\border\s*(?:no\.?|number)?\s*#?|#)(\d{1,6})\b/i.exec(question);
  if (num) {
    const r = rows.find((x) => x.id === Number(num[1]));
    if (r) return [{ id: r.id, label: `#${r.id} ${r.item}`, status: r.status, score: 99 }];
  }
  return rank(question, rows, (r) => `${r.item} ${r.project || ''} ${r.client || ''}`).slice(0, 5)
    .map((x) => ({ id: x.r.id, label: `#${x.r.id} ${x.r.item}`, status: x.r.status, score: x.score }));
}

// By name or by what they supply ("the plywood vendor").
export async function vendorCandidates(question) {
  const rows = await queryAll('SELECT id, name, material FROM vendors WHERE is_deleted_record = 0');
  return rank(question, rows, (r) => `${r.name} ${r.material || ''}`).slice(0, 5).map((x) => ({ id: x.r.id, label: x.r.name, score: x.score }));
}

export async function employeeCandidates(question) {
  const rows = await queryAll('SELECT id, name, profession FROM employees WHERE is_deleted_record = 0');
  return rank(question, rows, (r) => r.name).slice(0, 5).map((x) => ({ id: x.r.id, label: x.r.name, score: x.score }));
}

// Logins named in the question (username or display name), and "my / me / mine" = the asker.
export async function userMentions(question, me) {
  const users = await queryAll('SELECT username, display_name FROM users WHERE active = 1');
  const qw = new Set(words(question));
  const hit = users.filter((u) => qw.has(u.username.toLowerCase()) || (u.display_name && words(u.display_name).some((w) => w.length >= 3 && qw.has(w)))).map((u) => u.username);
  if (/\b(my|me|mine|i)\b/i.test(question) && me) hit.push(me);
  return [...new Set(hit)];
}

// Is a candidate list one clear winner? (top scores well above the runner-up)
export const clearWinner = (cands, ratio = 1.4) => cands[0] && (!cands[1] || cands[0].score >= ratio * cands[1].score) ? cands[0] : null;

// ---------- company: invoices carry 'savistar' (studio) or 'saag' (workshop) ----------
export const COMPANY_NAME = { all: 'Both companies', savistar: BRAND.studioShort, saag: BRAND.workshopShort };
export function parseCompany(question) {
  const q = question.toLowerCase();
  if (/\bboth\b|\ball companies\b|\bcombined\b/.test(q)) return 'all';
  const studio = new RegExp(`\\b(${[BRAND.studioShort.split(' ').pop(), 'savistar', 'studio', 'interiors?', 'design side'].join('|').toLowerCase()})\\b`);
  const workshop = new RegExp(`\\b(${[BRAND.workshopShort.split(' ').pop(), 'saag', 'workshop', 'furniture'].join('|').toLowerCase()})\\b`);
  const s = studio.test(q), w = workshop.test(q);
  return s && !w ? 'savistar' : w && !s ? 'saag' : null;
}

// ---------- periods (IST, Monday-first weeks) ----------
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const iso = (d) => d.toISOString().substring(0, 10);
const D = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const add = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const monthRange = (y, m) => ({ from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) });
export const fmtD = (s) => { if (!s) return '—'; const d = D(String(s).slice(0, 10)); return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`; };
const monthIdx = (w) => MONTHS.indexOf(w.slice(0, 3).toLowerCase());
export const daysBetween = (a, b) => Math.round((D(String(b).slice(0, 10)) - D(String(a).slice(0, 10))) / 86400000);

export function parsePeriod(question, today = todayIST()) {
  const q = question.toLowerCase();
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7)) - 1;
  const lab = (from, to, label) => ({ from, to, label: label || (from === to ? fmtD(from) : `${fmtD(from)} – ${fmtD(to)}`) });
  let m;
  if ((m = q.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|-|till|until|and)\s*(\d{4}-\d{2}-\d{2})/))) return lab(m[1], m[2]);
  if ((m = q.match(/\b(\d{4}-\d{2}-\d{2})\b/))) return lab(m[1], m[1]);
  const mon = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  if ((m = q.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*${mon}\\w*\\s*(?:(\\d{4}))?\\s*(?:to|-|till|until|and)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*${mon}\\w*\\s*(?:(\\d{4}))?`)))) {
    const y2 = Number(m[6] || ty), y1 = Number(m[3] || y2);
    return lab(iso(new Date(Date.UTC(y1, monthIdx(m[2]), Number(m[1])))), iso(new Date(Date.UTC(y2, monthIdx(m[5]), Number(m[4])))));
  }
  if ((m = q.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*${mon}\\w*\\s*(?:(\\d{4}))?`)))) {
    const day = iso(new Date(Date.UTC(Number(m[3] || ty), monthIdx(m[2]), Number(m[1])))); return lab(day, day);
  }
  if ((m = q.match(new RegExp(`\\b${mon}\\b\\w*\\s*(?:(\\d{4}))?`)))) {
    const mi = monthIdx(m[1]); const y = m[2] ? Number(m[2]) : (mi > tm ? ty - 1 : ty);
    const r = monthRange(y, mi); return lab(r.from, r.to, `${MONTH_NAMES[mi]} ${y}`);
  }
  if ((m = q.match(/\b(?:last|past|previous)\s+(\d{1,3})\s*(day|week|month)s?\b/))) {
    const n = Number(m[1]); const days = m[2] === 'day' ? n : m[2] === 'week' ? n * 7 : n * 30;
    return lab(add(today, -days + 1), today, `Last ${n} ${m[2]}${n > 1 ? 's' : ''}`);
  }
  if ((m = q.match(/\bnext\s+(\d{1,3})\s*(day|week)s?\b/))) {
    const n = Number(m[1]); const days = m[2] === 'day' ? n : n * 7;
    return lab(today, add(today, days - 1), `Next ${n} ${m[2]}${n > 1 ? 's' : ''}`);
  }
  if (/\btoday\b/.test(q)) return lab(today, today, `Today (${fmtD(today)})`);
  if (/\btomorrow\b/.test(q)) { const t = add(today, 1); return lab(t, t, `Tomorrow (${fmtD(t)})`); }
  if (/\byesterday\b/.test(q)) { const y = add(today, -1); return lab(y, y, `Yesterday (${fmtD(y)})`); }
  if (/\b(this|current) week\b/.test(q)) { const dow = (D(today).getUTCDay() + 6) % 7; return lab(add(today, -dow), add(today, 6 - dow), 'This week'); }
  if (/\bnext week\b/.test(q)) { const dow = (D(today).getUTCDay() + 6) % 7; const s = add(today, 7 - dow); return lab(s, add(s, 6), 'Next week'); }
  if (/\blast week\b/.test(q)) { const dow = (D(today).getUTCDay() + 6) % 7; const s = add(today, -dow - 7); return lab(s, add(s, 6), 'Last week'); }
  if (/\b(this|current) month\b/.test(q)) { const r = monthRange(ty, tm); return lab(r.from, today, 'This month'); }
  if (/\blast month\b/.test(q)) { const r = monthRange(tm === 0 ? ty - 1 : ty, (tm + 11) % 12); return lab(r.from, r.to, 'Last month'); }
  if (/\bnext month\b/.test(q)) { const r = monthRange(tm === 11 ? ty + 1 : ty, (tm + 1) % 12); return lab(r.from, r.to, 'Next month'); }
  if (/\b(this|current) year\b/.test(q)) return lab(`${ty}-01-01`, today, 'This year');
  if (/\blast year\b/.test(q)) return lab(`${ty - 1}-01-01`, `${ty - 1}-12-31`, 'Last year');
  if (/\ball[- ]time\b|\bever\b|\boverall\b|\bso far\b|\bin total\b/.test(q)) return { from: null, to: null, label: 'All time' };
  return null;
}

// The period right before p (see reel-inventory): previous calendar month for a month, same days of the month before
// for month-to-date, else the same number of days just before it.
export function previousPeriod(p, { fullMonth = false } = {}) {
  if (!p || !p.from) return null;
  const f = D(p.from), t = D(p.to);
  const isMonth = f.getUTCDate() === 1 && iso(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0))) === p.to;
  const monthToDate = f.getUTCDate() === 1 && t.getUTCMonth() === f.getUTCMonth() && !isMonth;
  if (isMonth || (monthToDate && fullMonth)) { const y = f.getUTCMonth() === 0 ? f.getUTCFullYear() - 1 : f.getUTCFullYear(), m = (f.getUTCMonth() + 11) % 12; return { ...monthRange(y, m), label: `${MONTH_NAMES[m]} ${y}` }; }
  if (monthToDate) {
    const y = f.getUTCMonth() === 0 ? f.getUTCFullYear() - 1 : f.getUTCFullYear(), m = (f.getUTCMonth() + 11) % 12;
    const end = Math.min(t.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
    const from = iso(new Date(Date.UTC(y, m, 1))), to = iso(new Date(Date.UTC(y, m, end)));
    return { from, to, label: `${fmtD(from)} – ${fmtD(to)}` };
  }
  const days = Math.round((t - f) / 86400000) + 1;
  const to = add(p.from, -1), from = add(p.from, -days);
  return { from, to, label: `${fmtD(from)} – ${fmtD(to)}` };
}

// Jev's period choice (when the question has no explicit period).
export function periodFromPreset(preset, today = todayIST()) {
  const map = { today: 'today', tomorrow: 'tomorrow', yesterday: 'yesterday', this_week: 'this week', next_week: 'next week', last_week: 'last week', this_month: 'this month', last_month: 'last month', next_month: 'next month', last_30_days: 'last 30 days', this_year: 'this year', all_time: 'all time' };
  return map[preset] ? parsePeriod(map[preset], today) : null;
}

// A period that is one calendar month (or month-to-date) → 'YYYY-MM', for payroll.
export function monthOf(p, today = todayIST()) {
  if (!p || !p.from) return today.slice(0, 7);
  return p.from.slice(0, 7) === p.to.slice(0, 7) ? p.from.slice(0, 7) : null;
}
