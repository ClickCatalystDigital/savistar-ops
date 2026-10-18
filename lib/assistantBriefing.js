// AI assistant — the time-aware briefing shown when the panel opens. Pure code over the look-ups' own queries
// (lib/assistantTools.js), so the numbers match the answers: no model, no OpenRouter call, nothing leaves the server
// (it works without a key and with data questions switched off). Ported from reel-inventory's utils/assistantBriefing.js.
// Morning: what today holds. Afternoon: today so far. Evening: today's wrap-up and what tomorrow holds.
import { queryOne } from './db';
import { BY_KEY } from './assistantTools';
import { nowIST } from './assistant';
import { add } from './assistantEntities';

const n = (x) => Number(x || 0).toLocaleString('en-IN');
const inr = (x) => `₹${Math.round(Number(x) || 0).toLocaleString('en-IN')}`;
const dayPart = (hour) => (hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening');

// Staff (role 'user') see their own tasks and no money lines — same as what Home and Finance show them.
export async function briefing({ role, user }) {
  const staff = role === 'user';
  const now = nowIST(), today = now.slice(0, 10), part = dayPart(Number(now.slice(11, 13)));
  const ahead = part === 'evening' ? add(today, 1) : today; // the evening looks at tomorrow
  const aheadLabel = part === 'evening' ? 'Tomorrow' : 'Today';
  const ctx = (extra) => ({ question: '', today, user, staff, ...extra });
  const safe = (p) => p.catch(() => null); // one failing line never blanks the briefing

  const mine = staff ? ' AND assigned_to = ?' : '';
  const [cal, tasks, ms, late, att, owed, quiet, pos, cash] = await Promise.all([
    safe(BY_KEY.calendar.run(ctx({ period: { from: ahead, to: ahead, label: aheadLabel } }))),
    safe(queryOne(`SELECT COALESCE(SUM(due_date < ?), 0) AS overdue, COALESCE(SUM(due_date = ?), 0) AS today FROM tasks WHERE status = 'open' AND is_deleted_record = 0${mine}`, staff ? [today, today, user] : [today, today])),
    safe(BY_KEY.milestones.run(ctx({ question: 'overdue' }))),
    safe(BY_KEY.orders.run(ctx({ question: 'late' }))),
    safe(BY_KEY.attendance.run(ctx({}))),
    safe(BY_KEY.outstanding_invoices.run(ctx({}))),
    safe(BY_KEY.quiet_clients.run(ctx({ question: '' }))),
    safe(BY_KEY.vendor_pos.run(ctx({}))),
    staff ? null : safe(BY_KEY.cash.run(ctx({ period: { from: today, to: today, label: 'Today' } }))),
  ]);

  const count = (r) => (r ? r.total ?? r.rows.length : 0);
  const kinds = (cal?.rows || []).reduce((a, r) => ({ ...a, [r.kind]: (a[r.kind] || 0) + 1 }), {});
  const od = Number(tasks?.overdue || 0), dueToday = Number(tasks?.today || 0);
  const lateMs = count(ms), lateOrders = count(late), quietN = count(quiet);
  const owedSum = (owed?.rows || []).reduce((a, r) => a + r.amount, 0), pastDue = (owed?.rows || []).filter((r) => r.late > 0).length;
  const toCome = (pos?.rows || []).filter((r) => r.outstanding > 0).length;
  const marked = (att?.rows || []).filter((r) => r.status !== 'Not marked').length, staffN = (att?.rows || []).length;

  const items = [
    { label: `${aheadLabel}: on the calendar`, value: cal?.rows.length ? Object.entries(kinds).map(([k, v]) => `${v} ${k.toLowerCase()}${v > 1 && !k.endsWith('due') ? 's' : ''}`).join(', ') : 'Nothing', link: '/' },
    { label: staff ? 'Your overdue tasks' : 'Overdue tasks', value: n(od), tone: od ? 'warn' : null, link: '/' },
    ...(part !== 'evening' && dueToday ? [{ label: staff ? 'Your tasks due today' : 'Tasks due today', value: n(dueToday), link: '/' }] : []),
    { label: 'Overdue milestones', value: n(lateMs), tone: lateMs ? 'warn' : null, link: '/projects' },
    { label: 'Late workshop orders', value: n(lateOrders), tone: lateOrders ? 'warn' : null, link: '/orders' },
    ...(part !== 'morning' && staffN ? [{ label: 'Attendance marked today', value: `${marked} of ${staffN}`, tone: marked < staffN && new Date(`${today}T00:00:00Z`).getUTCDay() !== 0 ? 'warn' : null, link: '/people' }] : []),
    ...(owed?.rows.length ? [{ label: 'Unpaid invoices', value: `${inr(owedSum)}${pastDue ? ` · ${pastDue} past due` : ''}`, tone: pastDue ? 'warn' : null, link: '/clients' }] : []),
    ...(quietN ? [{ label: 'Active clients gone quiet (14 days)', value: n(quietN), tone: 'warn', link: '/clients' }] : []),
    ...(toCome ? [{ label: 'Material still to come', value: `${toCome} PO line${toCome > 1 ? 's' : ''}`, link: '/vendors' }] : []),
    ...(cash && part === 'evening' ? [{ label: 'Cash today', value: `${inr(cash.rows[0].amount)} in · ${inr(cash.rows[1].amount)} out`, link: '/finance' }] : []),
  ];
  const bits = [];
  if (cal?.rows.length) bits.push(`${cal.rows.length} thing${cal.rows.length > 1 ? 's' : ''} on ${aheadLabel.toLowerCase()}`);
  if (od) bits.push(`${od} task${od > 1 ? 's' : ''} overdue`);
  if (lateOrders) bits.push(`${lateOrders} order${lateOrders > 1 ? 's' : ''} late`);
  if (lateMs) bits.push(`${lateMs} milestone${lateMs > 1 ? 's' : ''} overdue`);
  return { part, day: today, dayLabel: aheadLabel, headline: bits.length ? bits.join(' · ') : 'All clear: nothing overdue or late.', items };
}
