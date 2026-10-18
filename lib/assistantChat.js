// AI assistant — one chat turn. Ported from reel-inventory's utils/assistantChat.js.
// Jev decides (kind / look-up / company / period / guide section / follow-up / compare / second look-up / unsupported);
// code resolves the records named (clients, projects, orders, vendors, people) and runs a fixed read-only look-up
// (lib/assistantTools.js); the answer is a table the UI renders as-is (mode "show") or with a short writing-model
// summary on top (mode "write"). Jev only ever CHOOSES between options we give it: it never writes SQL or supplies a value.
import * as A from './assistant';
import * as E from './assistantEntities';
import { TOOLS, BY_KEY } from './assistantTools';
import { GUIDE, SCREEN_LABEL, pickSections } from './assistantGuide';
import { queryAll, queryOne } from './db';
import { BRAND } from './brand';
import { STARTERS } from './assistant-starters';
import { personaOf, numbersOk } from './assistant-personas';

export { STARTERS };

const MAX_Q = 600;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const KINDS = {
  data: `Asks for numbers, lists or records from ${BRAND.app}'s own data: projects, milestones, site visits, clients and conversations, invoices and GST, workshop orders, employees, attendance, payroll, advances, vendors, POs, freight, cash or tasks.`,
  howto: 'Asks how to do something in the app, or where to find a screen or feature.',
  action: "Asks to create, change, delete, mark, send or otherwise act on data (for example 'mark the Mehta invoice paid', 'add a task', 'delete order 3').",
  smalltalk: 'A greeting, thanks or small talk.',
  offtopic: `Not about ${BRAND.studio}, ${BRAND.workshop} or this app (general knowledge, design ideas, other companies, coding, jokes).`,
  unclear: 'Too vague or incomplete to tell what is wanted.',
};
const PERIODS = { today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday', this_week: 'This week', next_week: 'Next week', last_week: 'Last week', this_month: 'This month', last_month: 'Last month', next_month: 'Next month', last_30_days: 'The last 30 days', this_year: 'This year', all_time: 'All time, overall, ever', none: 'No period is mentioned' };
const COMPANIES = {
  all: 'Both companies, or no company is named',
  savistar: `${BRAND.studio} — the interior design studio — only when the question names it or says studio / interiors / design side`,
  saag: `${BRAND.workshop} — the furniture workshop — only when the question names it or says workshop / furniture`,
};

// Jev's answers for a question are remembered for an hour (per server instance): asking the same thing again skips the
// Jev call — faster and free — while the look-up still runs fresh, so numbers are never stale.
const JEV_CACHE = new Map();
const JEV_TTL = 3600e3, JEV_MAX = 300;
function cacheGet(k) { const e = JEV_CACHE.get(k); if (e && Date.now() - e.t < JEV_TTL) return e.v; JEV_CACHE.delete(k); return null; }
function cacheSet(k, v) { if (JEV_CACHE.size >= JEV_MAX) JEV_CACHE.delete(JEV_CACHE.keys().next().value); JEV_CACHE.set(k, { t: Date.now(), v }); }

const UNSUPPORTED = {
  none: 'No — what it asks for could be found in project, client, invoice, order, people, vendor, cash or task records',
  bank: 'Bank statements, bank balance or bank transactions (NOT the cash book, which exists)',
  quotes: 'Quotations, estimates or proposals sent to clients (the app has invoices, not quotations)',
  profit: 'Profit, margin or cost of a project or order (labour and materials are not costed per project), or the value of stock',
  advice: 'Advice, a recommendation, a forecast or an opinion, such as "which vendor should we use", "will this project finish on time", "is this client reliable" (NOT clients we have not spoken to, NOT what is late)',
};
const UNSUPPORTED_REPLY = {
  bank: ['Bank statements are not part of the assistant: it reads the cash book only. Open Finance → Bank to review statements.', ['How much cash came in this month?', 'Who owes us money?']],
  quotes: ["The app doesn't keep quotations, only invoices. I can show what has been invoiced and what is unpaid.", ['Who owes us money?', 'How much did we invoice this month?']],
  profit: ["Projects and orders don't carry their labour and material costs, so I can't work out profit or margin. I can show a project's invoices, its vendor POs, or vendor spend.", ['What do we spend with vendors?', 'How much did we invoice this month?']],
  advice: ["I only report what the data shows — I can't give recommendations or forecasts. I can show what is late, overdue or gone quiet.", ['Which workshop orders are late?', "Which clients haven't we spoken to in a while?"]],
};

function ranked(a) {
  const probs = a?.probabilities || (a?.choice ? { [a.choice]: 1 } : {});
  return Object.entries(probs).map(([key, p]) => ({ key, p: Number(p) || 0 })).sort((x, y) => y.p - x.p);
}
const top = (a) => ranked(a)[0] || { key: null, p: 0 };

// ---- deterministic router used when Jev can't be reached (timeout / 5xx / rate limit) ----
function fallbackRoute(question) {
  const q = question.toLowerCase();
  if (/^\s*(hi|hello|hey|thanks|thank you)\b/.test(q)) return { kind: 'smalltalk' };
  if (/^\s*(please\s+)?(delete|remove|create|add|mark|update|change|cancel|send|edit|assign|undo)\b/.test(q)) return { kind: 'action' };
  const scored = TOOLS.map((t) => ({ t, s: (t.keywords || []).reduce((a, k) => a + (q.includes(k) ? k.split(' ').length : 0), 0) })).sort((a, b) => b.s - a.s);
  if (scored[0].s > 0 && !/^\s*(how (do|can|to)|where (do|can|is the)|what is the (way|process))\b/.test(q)) return { kind: 'data', tool: scored[0].t.key };
  const sec = pickSections(question, 1)[0];
  return sec ? { kind: 'howto', section: sec.key } : { kind: 'unclear' };
}

const text = (t, extra = {}) => ({ type: 'text', text: t, ...extra });
const chips = (list) => list.map((q) => ({ label: q, send: q }));

// Choose one candidate with Jev (record resolution). Returns { pick, p, cost }
async function chooseCandidate(key, question, kind, cands) {
  const criteria = {}; cands.forEach((c, i) => { criteria[`c${i}`] = c.label + (c.client ? ` (client ${c.client})` : ''); }); criteria.none = 'None of these is what the question is about';
  const { answers, cost } = await A.jevDecide(key, { question, candidates_are: kind }, { pick: { type: 'choice', instructions: `Which ${kind} is the question about?`, criteria } });
  const r = top(answers.pick);
  if (r.key === 'none' || !r.key) return { pick: null, cost, p: r.p };
  return { pick: cands[Number(r.key.slice(1))] || null, p: r.p, cost };
}

// Follow-up context sent back by the browser (we issued it; still re-validated here, never trusted).
const ENTITY_SQL = {
  client: "SELECT id, name AS label FROM clients WHERE id = ? AND is_deleted_record = 0",
  project: "SELECT id, name AS label FROM projects WHERE id = ? AND is_deleted_record = 0",
  order: "SELECT id, '#' || id || ' ' || item AS label FROM orders WHERE id = ? AND is_deleted_record = 0",
  vendor: "SELECT id, name AS label FROM vendors WHERE id = ? AND is_deleted_record = 0",
  employee: "SELECT id, name AS label FROM employees WHERE id = ? AND is_deleted_record = 0",
};
async function resolveContext(c) {
  if (!c || typeof c !== 'object' || !BY_KEY[c.tool]) return null;
  const out = { tool: c.tool, company: ['all', 'savistar', 'saag'].includes(c.company) ? c.company : null, period: null };
  const isD = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
  if (c.period && ((c.period.from === null && c.period.to === null) || (isD(c.period.from) && isD(c.period.to))) && typeof c.period.label === 'string') out.period = { from: c.period.from, to: c.period.to, label: c.period.label.slice(0, 60) };
  for (const k of Object.keys(ENTITY_SQL)) {
    if (Number.isInteger(c[k])) { const r = await queryOne(ENTITY_SQL[k], [c[k]]); if (r) out[k] = { id: r.id, label: r.label }; }
  }
  if (Array.isArray(c.users)) { const all = (await queryAll('SELECT username FROM users')).map((u) => u.username); out.users = c.users.filter((u) => all.includes(u)).slice(0, 3); if (!out.users.length) out.users = null; }
  return out;
}
const contextOf = (toolKey, ctx) => ({ tool: toolKey, company: ctx.company || null, period: ctx.period || null, users: ctx.users || null,
  ...Object.fromEntries(Object.keys(ENTITY_SQL).map((k) => [k, ctx[k]?.id ?? null])) });

function paramsFor(tool, ctx) {
  const params = [];
  for (const [k, l] of [['client', 'Client'], ['project', 'Project'], ['order', 'Order'], ['vendor', 'Vendor'], ['employee', 'Person']]) if (ctx[k]) params.push({ label: l, value: ctx[k].label });
  if (ctx.users) params.push({ label: 'Assigned', value: ctx.users.join(', ') });
  if (['outstanding_invoices', 'invoiced'].includes(tool.key) && ctx.company) params.push({ label: 'Company', value: E.COMPANY_NAME[ctx.company] });
  if (tool.period && ctx.period) params.push({ label: 'Period', value: ctx.period.label });
  return params;
}

// Two periods side by side: rows matched on their label column, with the change (tool.compareKey is the number compared).
function compareCard(tool, a, b, ctx, prev) {
  const k = tool.compareKey;
  const rowsA = a.compareRows || a.rows, rowsB = b.compareRows || b.rows;
  const first = (a.compareCols || a.columns)[0];
  if (!k || !first) return null;
  const map = new Map();
  for (const r of rowsA) map.set(r[first.key], { label: r[first.key], a: Number(r[k]) || 0, b: 0 });
  for (const r of rowsB) { const m = map.get(r[first.key]) || { label: r[first.key], a: 0, b: 0 }; m.b = Number(r[k]) || 0; map.set(r[first.key], m); }
  const isNet = tool.key === 'cash'; // the cash rows are in / out / net: don't add them up
  const all = [...map.values()];
  const ta = isNet ? (map.get('Net')?.a ?? 0) : all.reduce((x, r) => x + r.a, 0), tb = isNet ? (map.get('Net')?.b ?? 0) : all.reduce((x, r) => x + r.b, 0);
  const money = (a.columns.find((c) => c.key === k) || {}).type === 'money';
  const fmt = (v) => (money ? `${v < 0 ? '−' : ''}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}` : (Math.round(v * 10) / 10).toLocaleString('en-IN'));
  const rows = all.sort((x, y) => (isNet ? 0 : Math.max(y.a, y.b) - Math.max(x.a, x.b))).slice(0, 25)
    .map((r) => ({ [first.key]: r.label, a: r.a, b: r.b, d: r.a - r.b }));
  const pct = tb ? ` (${ta >= tb ? '+' : '−'}${Math.abs(Math.round(((ta - tb) / Math.abs(tb)) * 100))}%)` : '';
  const what = isNet ? 'net cash' : (a.columns.find((c) => c.key === k) || {}).label?.toLowerCase() || 'total';
  const type = money ? 'money' : 'int';
  return { type: 'table', tool: tool.key, toolLabel: `${tool.label} · comparison`, params: paramsFor(tool, ctx).filter((p) => p.label !== 'Period').concat([{ label: 'Compared', value: `${ctx.period.label} vs ${prev.label}` }]),
    title: `${tool.label}: ${ctx.period.label} vs ${prev.label}`,
    summary: `${ctx.period.label}: ${fmt(ta)} · ${prev.label}: ${fmt(tb)} ${what} — ${ta === tb ? 'no change' : `${ta > tb ? 'up' : 'down'} ${fmt(Math.abs(ta - tb))}${pct}`}.`,
    columns: [{ key: first.key, label: first.label, type: 'text' }, { key: 'a', label: 'Now', type }, { key: 'b', label: 'Before', type }, { key: 'd', label: 'Change', type: money ? 'money_delta' : 'delta' }],
    rows, total: map.size, truncated: map.size > 25, note: a.note || null, link: a.link };
}

// Run one turn. Returns { status, body }.
export async function turn({ user, role, messages, path, dry, context, persona: personaKey }) {
  // A persona rewords (and switches "Show, then write" on for this person); it never changes a look-up or a number.
  const persona = personaOf(personaKey);
  const isAdmin = A.isAiAdmin({ role }), isStaff = role === 'user';
  const t0 = Date.now(); let cost = 0; const trace = [];
  const msgs = (Array.isArray(messages) ? messages : []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim());
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== 'user') return { status: 400, body: { error: 'Ask a question first.' } };
  const question = last.content.trim().slice(0, MAX_Q);
  const previous = msgs.filter((m) => m.role === 'user').slice(-2, -1)[0]?.content?.slice(0, MAX_Q) || null;

  const settings = await A.getSettings();
  const writeMode = settings.mode === 'write' || !!persona;
  const voice = persona ? `\n\nVOICE: ${persona.voice} The voice changes the wording only: copy every number, amount, name and date exactly.` : '';
  // A summary that mentions a number the data doesn't have is dropped; the table stays.
  const checked = (w, data) => { if (numbersOk(w.text, data)) return w.text; trace.push('writer dropped: a number not in the data'); return null; };
  const key = await A.getKey().catch(() => null);
  if (!key) return { status: 400, body: isAdmin ? { error: 'No OpenRouter key yet. Add one in Settings → AI.', link: '/settings', linkLabel: 'Open Settings' } : { error: `${settings.name} is not set up yet. Ask an owner to add the key in Settings → AI.` } };

  let usage;
  if (!dry) {
    usage = await A.useQuestion(settings.cap);
    if (!usage.ok) return { status: 429, body: { error: `${settings.name} has used today's ${settings.cap} questions. The limit resets at midnight IST.` } };
  } else usage = { used: await A.usedToday(), cap: settings.cap };

  const today = A.todayIST();
  const done = async (reply, kind, tool, ok = true) => {
    const ms = Date.now() - t0;
    if (!dry) await A.logAsk(user, question, kind, tool, ok, ms, cost).catch(() => {});
    return { status: 200, body: { reply, meta: { used: usage.used, cap: settings.cap, ms, cost: Number(cost.toFixed(6)), ...(dry ? { trace } : {}) } } };
  };
  const upstreamError = (e) => {
    const up = e.upstream || { status: 502, error: e.message };
    return { status: [401, 402, 429].includes(up.status) ? up.status : 502, body: isAdmin ? { error: up.error, link: up.link, linkLabel: up.linkLabel } : { error: [401, 402].includes(up.status) ? `${settings.name} is unavailable right now. Please tell an owner.` : up.error } };
  };

  // ---- Jev call 1: what is this, which look-up, which company / period, which guide section, and the extras ----
  const pool = pickSections(`${question} ${previous || ''}`, 8);
  const toolCriteria = Object.fromEntries(TOOLS.map((t) => [t.key, t.about])); toolCriteria.none = 'None of these look-ups can answer it, or it is not a data question';
  const questions = {
    kind: { type: 'choice', instructions: 'What kind of message is the latest question?', criteria: KINDS },
    tool: { type: 'choice', instructions: `If the latest question asks for ${BRAND.app} data, which look-up answers it?`, criteria: toolCriteria },
    company: { type: 'choice', instructions: 'Which company is the latest question about?', criteria: COMPANIES },
    period: { type: 'choice', instructions: 'Which time period is the latest question about?', criteria: PERIODS },
  };
  if (context) questions.follow_up = { type: 'noul', instructions: "Is the latest question a short follow-up that only makes sense together with the previous question, because it leaves out the subject (for example 'and last month?', 'what about the workshop?', 'same for the Joshi apartment', 'and next week?')?", criteria: { true: 'It leaves out something it expects us to remember from the previous question.', false: 'It is complete on its own.' } };
  questions.second_tool = { type: 'choice', instructions: "Does the latest question ALSO ask for a second, different look-up besides its main one (for example 'late orders and overdue milestones', 'unpaid invoices and cash this month')? If so, which one?", criteria: { ...toolCriteria, none: 'No second look-up is needed — one look-up answers the whole question' } };
  questions.compare = { type: 'noul', instructions: "Does the latest question ask to compare two time periods or how something changed between them (for example 'September vs August', 'compared to last month', 'is it up or down')?", criteria: { true: 'It compares two periods or asks about a change over time.', false: 'It asks about a single period or no period.' } };
  questions.unsupported = { type: 'choice', instructions: "Does the latest question ask for something the app's records do not contain?", criteria: UNSUPPORTED };
  if (pool.length) {
    const sc = {}; pool.forEach((g, i) => { sc[`s${i}`] = `${g.label}: ${g.text.slice(0, 160)}`; }); sc.none = 'None of these sections is about what the question asks';
    questions.section = { type: 'choice', instructions: 'Which section of the app guide answers the latest question?', criteria: sc };
  }
  let route, jev = null;
  try {
    const d = new Date(`${today}T00:00:00Z`);
    const ck = JSON.stringify([question.toLowerCase(), previous, !!context, today]);
    const hit = cacheGet(ck);
    if (hit) { jev = hit; trace.push('jev: remembered answer (no Jev call)'); }
    else {
      const r = await A.jevDecide(key, { latest_question: question, previous_question: previous, today: `${today} (${DAYS[d.getUTCDay()]})`, screen_the_user_is_on: String(path || '').slice(0, 100) }, questions);
      cost += r.cost; jev = r.answers; cacheSet(ck, jev);
    }
    const k = top(jev.kind), s = top(jev.section), tp = top(jev.tool);
    let kind = k.key || 'unclear';
    // "offtopic" is only trusted at 90%+; a clearly matching guide section turns an awkward question into how-to
    if (kind === 'offtopic' && k.p < 0.9) kind = s.key && s.key !== 'none' && s.p >= 0.6 ? 'howto' : 'unclear';
    // the kind answer sometimes hesitates on short questions ("late orders?") while the look-up choice is certain
    if ((kind === 'unclear' || kind === 'smalltalk') && tp.key && tp.key !== 'none' && tp.p >= 0.9 && k.p < 0.9) kind = 'data';
    route = { kind, kindP: k.p, tool: tp.key, toolP: tp.p, section: s.key && s.key !== 'none' && pool[Number(s.key.slice(1))] ? pool[Number(s.key.slice(1))].key : null, sectionP: s.p };
    trace.push(`jev: kind=${kind} (${Math.round(k.p * 100)}%) tool=${route.tool} (${Math.round(route.toolP * 100)}%) section=${route.section || 'none'} (${Math.round(s.p * 100)}%)`);
  } catch (e) {
    if ([401, 402].includes(e.upstream?.status)) return upstreamError(e);
    const f = fallbackRoute(question);
    route = { kind: f.kind, tool: f.tool || null, toolP: 0, section: f.section || null, sectionP: 0, fallback: true };
    trace.push(`jev unavailable (${e.message}); keyword router: kind=${f.kind} tool=${f.tool || '-'}`);
  }

  // "and last month?" on its own reads as unclear — if Jev says it is a follow-up, it is a data question about the previous look-up
  if (context && jev && (jev.follow_up?.noul ?? 0) >= 0.7 && ['unclear', 'smalltalk'].includes(route.kind) && BY_KEY[context.tool]) {
    route.kind = 'data'; if (!route.tool || route.tool === 'none') route.tool = context.tool;
    trace.push(`follow-up rescued a short question -> ${route.tool}`);
  }

  const sectionOf = (k) => GUIDE.find((g) => g.key === k);
  const link = (p) => (p ? { path: p, label: `Open ${SCREEN_LABEL[p] || p}` } : null);
  const kind = route.kind;

  // Say plainly what the data cannot answer instead of answering a neighbouring question.
  const un = jev ? top(jev.unsupported) : { key: 'none', p: 0 };
  if (['data', 'unclear'].includes(kind) && un.key && un.key !== 'none' && un.p >= 0.8 && UNSUPPORTED_REPLY[un.key]) {
    trace.push(`unsupported: ${un.key} (${Math.round(un.p * 100)}%)`);
    return done(text(UNSUPPORTED_REPLY[un.key][0], { chips: chips(UNSUPPORTED_REPLY[un.key][1]) }), kind, `unsupported:${un.key}`, false);
  }
  if (kind === 'smalltalk') return done(text(persona?.smalltalk || `Hi! I can look things up for you — projects, clients, invoices, workshop orders, people, vendors, cash and tasks — and explain how the app works. Try one of these:`, { chips: chips(STARTERS) }), kind, null);
  if (kind === 'offtopic') return done(text(`I only help with ${BRAND.app}: projects, clients, orders, people, vendors, money, tasks and how this app works. Ask me something about those.`, { chips: chips(STARTERS) }), kind, null);
  if (kind === 'unclear') return done(text("I'm not sure what you'd like to know. Could you name a project, client, order or period? For example:", { chips: chips(STARTERS) }), kind, null, false);

  if (kind === 'action') {
    const sec = route.sectionP >= 0.6 ? sectionOf(route.section) : null;
    return done(text("I can only look things up — I can't add, change or delete anything." + (sec ? ` You can do that from ${sec.label.split(':')[0]}.` : ''), { link: sec ? link(sec.path) : null }), kind, null);
  }

  if (kind === 'howto') {
    const sec = sectionOf(route.section) || pickSections(question, 1)[0];
    if (!sec) return done(text('I couldn\'t find that in the app guide. Try describing the screen or task, for example “how do I log a site visit?”.', { chips: chips(['How do I log a site visit?', 'How do I make a GST invoice?', 'How is payroll worked out?']) }), kind, null);
    let body = sec.text;
    if (writeMode && route.sectionP >= 0.3) {
      try {
        const w = await A.writeAnswer(key, settings.model, `You are ${settings.name}, the help assistant inside ${BRAND.app}, the operations app of an interior design studio and its furniture workshop. Answer the question using ONLY the GUIDE below. Short numbered steps, plain text, no markdown symbols. Use the guide's exact screen names. Never invent screens or buttons.${voice}`, sec.text, question);
        body = checked(w, sec.text) || sec.text; cost += w.cost; trace.push('writer: how-to');
      } catch (e) { trace.push(`writer failed: ${e.message}`); }
    }
    return done(text(body, { title: sec.label, link: link(sec.path) }), kind, 'howto');
  }

  // ---- data ----
  if (!settings.dataAccess.on) {
    return done(text(isAdmin ? 'Questions about business data are switched off. You can turn them on in Settings → AI.' : 'Questions about business data are switched off. Ask an owner to turn them on in Settings → AI.', isAdmin ? { link: { path: '/settings', label: 'Open Settings' } } : {}), kind, null);
  }
  let toolKey = route.tool && route.tool !== 'none' ? route.tool : null;
  if (!toolKey || !BY_KEY[toolKey]) return done(text(`I couldn't match that to a look-up. I can look up: ${TOOLS.map((t) => t.label.toLowerCase()).join(', ')}.`, { chips: chips(STARTERS) }), kind, null, false);
  const staffNo = (t) => isStaff && t.staffBlocked;
  if (staffNo(BY_KEY[toolKey])) return done(text(`${BY_KEY[toolKey].label} is visible to owners, admins and managers only.`), kind, toolKey);

  const explicitCompany = E.parseCompany(question) || (jev && top(jev.company).p >= 0.7 && top(jev.company).key !== 'all' ? top(jev.company).key : null);
  const explicitPeriod = E.parsePeriod(question, today) || (jev && top(jev.period).p >= 0.6 && top(jev.period).key !== 'none' ? E.periodFromPreset(top(jev.period).key, today) : null);

  // Follow-ups inherit what the question leaves out from the previous answer (context, re-validated against the DB).
  const prior = context ? await resolveContext(context).catch(() => null) : null;
  const followUp = !!prior && jev && (jev.follow_up?.noul ?? 0) >= 0.7;
  if (followUp) trace.push(`follow-up of ${prior.tool} (${Math.round(jev.follow_up.noul * 100)}%)`);

  const base = (tk) => {
    const c = { question, today, user, staff: isStaff, company: explicitCompany || (followUp ? prior.company : null) };
    if (BY_KEY[tk].period) c.period = explicitPeriod || (followUp ? prior.period : null);
    return c;
  };

  const FIND = { client: E.clientCandidates, project: E.projectCandidates, order: E.orderCandidates, vendor: E.vendorCandidates, employee: E.employeeCandidates };
  const NOUN = { client: 'client', project: 'project', order: 'workshop order', vendor: 'vendor', employee: 'person' };
  const EXAMPLE = { client: '“notes on the Joshis”', project: '“how is the Brewnest cafe going”', order: '“who worked on order 4”', vendor: '“open POs with the plywood vendor”', employee: '“days Suresh worked this month”' };

  // Resolves the records a look-up needs, runs it, returns { ctx, result } or { reply } when we must stop and ask.
  const lookup = async (tk, { carry }) => {
    const tool = BY_KEY[tk];
    const ctx = base(tk);
    const askWhich = (what, cands) => ({ reply: { type: 'ask', text: `Which ${what} do you mean?`, options: cands.slice(0, 4).map((c) => ({ label: c.label, send: `${question} (${c.label})` })) } });
    for (const e of [].concat(tool.entity || [])) {
      if (e === 'user') {
        const u = await E.userMentions(question, user);
        if (u.length) ctx.users = u; else if (carry && prior?.users) ctx.users = prior.users;
        continue;
      }
      const cands = await FIND[e](question);
      const clear = E.clearWinner(cands);
      if (clear) ctx[e] = { id: clear.id, label: clear.label };
      else if (cands.length > 1) {
        // several near-equal matches: let Jev choose; ask when it isn't sure (or skip an optional filter)
        try {
          const r = await chooseCandidate(key, question, NOUN[e], cands); cost += r.cost;
          trace.push(`${e} pick: ${r.pick ? r.pick.label : 'none'} (${Math.round((r.p || 0) * 100)}%)`);
          if (r.pick && r.p >= 0.6) ctx[e] = { id: r.pick.id, label: r.pick.label };
          else if (tool.required) return askWhich(NOUN[e], cands);
        } catch { if (tool.required) return askWhich(NOUN[e], cands); }
      } else if (carry && prior?.[e]) ctx[e] = prior[e];
    }
    if (tool.required) {
      const need = [].concat(tool.entity).find((e) => e !== 'user' && !ctx[e]);
      if (need) return { reply: text(`Which ${NOUN[need]}? For example ${EXAMPLE[need]}.`) };
    }
    // staff only see their own tasks (same as Home), whoever the question names
    if (isStaff && tk === 'tasks') ctx.users = [user];
    let result;
    try {
      result = await tool.run(ctx);
      if (isStaff && tk === 'tasks') result.note = `Showing your own tasks only. ${result.note || ''}`.trim();
    } catch (err) {
      trace.push(`tool error: ${tk}: ${err.message}`);
      return { reply: text(err.staff ? 'That is visible to owners, admins and managers only.' : 'I could not read that data just now. Please try again in a moment.'), failed: !err.staff };
    }
    return { ctx, result };
  };

  // ---- main look-up ----
  const main = await lookup(toolKey, { carry: followUp });
  if (main.reply) return done(main.reply, kind, toolKey, !main.failed);
  const tool = BY_KEY[toolKey];
  const { ctx, result } = main;

  // ---- compare two periods: run the same look-up for the period right before, line the rows up ----
  let card = null;
  if (jev && (jev.compare?.noul ?? 0) >= 0.75 && tool.comparable) {
    const cur = ctx.period?.from ? ctx.period : E.periodFromPreset('this_month', today);
    const prev = E.previousPeriod(cur, { fullMonth: /\b(last|previous|prior) month\b/i.test(question) });
    if (prev) {
      try {
        const base0 = ctx.period?.from ? result : await tool.run({ ...ctx, period: cur });
        const other = await tool.run({ ...ctx, period: prev });
        card = compareCard(tool, base0, other, { ...ctx, period: cur }, prev);
        if (card && !ctx.period) ctx.period = cur;
        trace.push(`compare: ${cur.label} vs ${prev.label} ${card ? 'ok' : 'unsupported'}`);
      } catch (e) { trace.push(`compare failed: ${e.message}`); }
    }
  }

  // ---- grounding check: only when Jev was not sure of the look-up. Sends the look-up and parameters, never rows. ----
  const st = jev ? top(jev.second_tool) : { key: null, p: 0 };
  trace.push(`second_tool: ${st.key} (${Math.round(st.p * 100)}%)`);
  const wantsSecond = st.key && st.key !== 'none' && st.p >= 0.75;
  if (!card && !wantsSecond && route.toolP && route.toolP < 0.85 && !route.fallback) {
    try {
      const g = await A.jevDecide(key, { question, look_up: tool.label, what_it_does: tool.about, parameters_used: Object.fromEntries(paramsFor(tool, ctx).map((p) => [p.label, p.value])), columns_returned: result.columns.map((c) => c.label), row_count: result.rows.length },
        { fits: { type: 'noul', instructions: 'Does this look-up, with these parameters, answer the question that was asked?', criteria: { true: 'Yes, it answers the question.', false: 'No, it answers a different question or misses an important part of it.' } } });
      cost += g.cost; trace.push(`grounding: ${Math.round((g.answers.fits?.noul || 0) * 100)}%`);
      if ((g.answers.fits?.noul ?? 1) < 0.4) result.note = `This may not answer your question exactly. ${result.note || ''}`.trim();
    } catch (e) { trace.push(`grounding skipped: ${e.message}`); }
  }

  // ---- optional writing-model summary (the rows go to OpenRouter only in this mode) ----
  const shown = card || result;
  let written = null;
  if (writeMode && shown.rows.length) {
    // dates as people write them ("12 Oct 2026"), so the summary doesn't copy ISO dates
    const dateCols = shown.columns.filter((c) => c.type === 'date').map((c) => c.key);
    const rowsForWriter = shown.rows.slice(0, 20).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, dateCols.includes(k) && v ? E.fmtD(v) : v])));
    const dataStr = JSON.stringify({ title: shown.title, summary: shown.summary, screen: shown.link?.label?.replace(/^Open /, '') || null, rows: rowsForWriter }).slice(0, 6000);
    try {
      const w = await A.writeAnswer(key, settings.model,
        `You are ${settings.name}, the assistant inside ${BRAND.app}, the operations app of an interior design studio and its furniture workshop. Answer the QUESTION in one to three short sentences using ONLY the DATA. Copy numbers, amounts (₹), dates and names exactly as written in the DATA. Never estimate or add up numbers that are not shown. Plain text, no markdown symbols. If the DATA does not answer the question, say what it does show.${voice}`,
        dataStr, question);
      written = checked(w, dataStr); cost += w.cost; trace.push('writer: data');
    } catch (e) { trace.push(`writer failed: ${e.message}`); }
  }

  const params = paramsFor(tool, ctx);
  trace.push(`tool: ${toolKey} params=${JSON.stringify(params)}`);
  const { compareRows, compareCols, ...plain } = result;
  const reply = card ? { ...card, text: written, context: contextOf(toolKey, ctx) } : { type: 'table', tool: toolKey, toolLabel: tool.label, params, text: written, context: contextOf(toolKey, ctx), ...plain };

  // ---- second look-up: "late orders AND overdue milestones" — run it only when it needs nothing we don't already have ----
  if (wantsSecond && st.key !== toolKey && BY_KEY[st.key] && !staffNo(BY_KEY[st.key])) {
    const t2 = BY_KEY[st.key];
    const needs = t2.required && [].concat(t2.entity).some((e) => e !== 'user' && !ctx[e]);
    if (!needs) {
      try {
        const c2 = { ...ctx }; if (isStaff && st.key === 'tasks') c2.users = [user]; if (!t2.period) delete c2.period; else if (!c2.period) c2.period = explicitPeriod || null;
        const { compareRows: _r, compareCols: _c, ...r2 } = await t2.run(c2);
        reply.cards = [...(reply.cards || []), { type: 'table', tool: st.key, toolLabel: t2.label, params: paramsFor(t2, c2), ...r2 }];
        trace.push(`second: ${st.key} (${Math.round(st.p * 100)}%)`);
      } catch (e) { trace.push(`second failed: ${e.message}`); }
    } else trace.push(`second: ${st.key} skipped (needs a record)`);
  }

  return done(reply, kind, toolKey);
}
