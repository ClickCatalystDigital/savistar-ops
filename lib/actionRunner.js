// Runs an assistant action (lib/assistantActions.js) through the app's own API route, in the same process: the request
// the screen would send, signed as the person asking (Bearer token, which lib/auth.js getUserFromRequest reads). So the
// route's checks, validation and side effects (QuickBooks sync, demo rules) apply exactly as on screen.
import jwt from 'jsonwebtoken';
import { signToken } from './auth.js';
import { jwtSecret } from './session.js';
import { queryOne } from './db.js';
import { check, ACTION_BY_KEY, autoOk } from './assistantActions.js';
import { logAsk, getSettings, mayAuto } from './assistant.js';

// path pattern → route module. Static imports so the build bundles them; add a line when an action uses a new route.
const ROUTES = [
  ['/api/clients', () => import('../app/api/clients/route.js')],
  ['/api/clients/:id/conversations', () => import('../app/api/clients/[id]/conversations/route.js')],
  ['/api/tasks', () => import('../app/api/tasks/route.js')],
  ['/api/tasks/:id', () => import('../app/api/tasks/[id]/route.js')],
  ['/api/projects', () => import('../app/api/projects/route.js')],
  ['/api/milestones', () => import('../app/api/milestones/route.js')],
  ['/api/milestones/:id', () => import('../app/api/milestones/[id]/route.js')],
  ['/api/site-visits', () => import('../app/api/site-visits/route.js')],
  ['/api/orders', () => import('../app/api/orders/route.js')],
  ['/api/orders/:id', () => import('../app/api/orders/[id]/route.js')],
  ['/api/attendance', () => import('../app/api/attendance/route.js')],
  ['/api/expenses', () => import('../app/api/expenses/route.js')],
  ['/api/cash', () => import('../app/api/cash/route.js')],
  ['/api/quotations', () => import('../app/api/quotations/route.js')],
  ['/api/quotations/:id/action', () => import('../app/api/quotations/[id]/action/route.js')],
  ['/api/invoices/:id', () => import('../app/api/invoices/[id]/route.js')],
  ['/api/vendors', () => import('../app/api/vendors/route.js')],
  ['/api/vendor-pos', () => import('../app/api/vendor-pos/route.js')],
  ['/api/vendor-pos/:id/deliveries', () => import('../app/api/vendor-pos/[id]/deliveries/route.js')],
  ['/api/freight', () => import('../app/api/freight/route.js')],
  ['/api/clients/:id', () => import('../app/api/clients/[id]/route.js')],
  ['/api/projects/:id', () => import('../app/api/projects/[id]/route.js')],
  ['/api/employees', () => import('../app/api/employees/route.js')],
  ['/api/employees/:id', () => import('../app/api/employees/[id]/route.js')],
  ['/api/work-logs', () => import('../app/api/work-logs/route.js')],
  ['/api/vendor-rates', () => import('../app/api/vendor-rates/route.js')],
  ['/api/vendor-pos/:id', () => import('../app/api/vendor-pos/[id]/route.js')],
  ['/api/quotations/:id/invoice', () => import('../app/api/quotations/[id]/invoice/route.js')],
  ['/api/payroll', () => import('../app/api/payroll/route.js')],
  ['/api/invoices', () => import('../app/api/invoices/route.js')],
  ['/api/cash/:id', () => import('../app/api/cash/[id]/route.js')],
  ['/api/vendors/:id', () => import('../app/api/vendors/[id]/route.js')],
  ['/api/expenses/:id', () => import('../app/api/expenses/[id]/route.js')],
  ['/api/quotations/:id', () => import('../app/api/quotations/[id]/route.js')],
  ['/api/site-visits/:id', () => import('../app/api/site-visits/[id]/route.js')],
  ['/api/vendor-rates/:id', () => import('../app/api/vendor-rates/[id]/route.js')],
  ['/api/freight/:id', () => import('../app/api/freight/[id]/route.js')],
  ['/api/work-logs/:id', () => import('../app/api/work-logs/[id]/route.js')],
].map(([pattern, load]) => ({ pattern, load, re: new RegExp(`^${pattern.replace(/:id/g, '(\\d+)')}$`) }));

export function routeFor(path) {
  for (const r of ROUTES) { const m = r.re.exec(path); if (m) return { ...r, params: m[1] ? { id: m[1] } : {} }; }
  return null;
}

// The request the screen would send, as this person.
async function call(user, { method, path, body }) {
  const route = routeFor(path);
  if (!route) throw new Error(`No route for ${path}`);
  const handler = (await route.load())[method];
  if (!handler) throw new Error(`${path} has no ${method}`);
  const req = new Request(`http://assistant.local${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${signToken(user)}` }, body: method === 'DELETE' ? undefined : JSON.stringify(body) });
  const res = await handler(req, { params: Promise.resolve(route.params) });
  return { res, data: await res.json().catch(() => ({})) };
}

// Undo is a signed request (the action's own reverse), good for 30 minutes and only for the person who made the change.
// ponytail: a put-back restores the row as it was, so an edit someone made in between is overwritten too.
const signUndo = (user, summary, request) => jwt.sign({ u: user.username, s: summary, r: request }, jwtSecret(), { expiresIn: '30m', audience: 'assistant-undo' });

// Check the fields again (never trust a card or an MCP client), then run. Returns { ok, status, summary, link, result | error }.
// auto: chat's Auto mode. The server decides whether this person and this action may skip the card; if not, the card
// comes back (needsCard) and nothing is saved. A saved Auto change carries an undo token.
export async function runAction(user, key, given, { auto = false } = {}) {
  const t0 = Date.now();
  const a = ACTION_BY_KEY[key];
  if (!a) return { ok: false, status: 400, error: `Unknown action: ${key}` };
  const settings = await getSettings();
  if (!settings.actions.on) return { ok: false, status: 403, error: 'Changes from the assistant are switched off in Settings → My assistant.' };
  const c = await check(key, given, undefined, user);
  if (!c.ready) return { ok: false, status: 400, error: [...c.errors, ...(c.missing.length ? [`Missing: ${c.missing.join(', ')}`] : [])].join('. '), card: c };
  if (auto && !(mayAuto(user, settings) && autoOk(a, c.values))) return { ok: false, status: 409, needsCard: true, error: 'This one needs a check: press Save on the card.', card: c };
  let out;
  try {
    const before = auto && a.undo.put ? await queryOne(`SELECT * FROM ${a.undo.put[0]} WHERE id = ?`, [c.values[a.undo.put[2]]]) : null;
    const { res, data } = await call(user, await a.request(c.values));
    out = res.ok ? { ok: true, status: res.status, summary: c.summary, link: a.link?.(data, c.values) || null, result: data }
      : { ok: false, status: res.status, summary: c.summary, error: data.error || `The app refused it (${res.status})` };
    if (out.ok && auto) {
      const back = a.undo.del ? { method: 'DELETE', path: `${a.undo.del}/${data.id}` } : { method: 'PUT', path: `${a.undo.put[1]}/${before.id}`, body: before };
      out.undo = signUndo(user, c.summary, back);
    }
  } catch (e) {
    out = { ok: false, status: 500, summary: c.summary, error: e.message };
  }
  logAsk(user.username, c.summary, auto ? 'action:auto' : 'action', key, out.ok, Date.now() - t0, 0);
  return out;
}

// Run an undo token from runAction, through the same route, as the same person.
export async function runUndo(user, token) {
  let t;
  try { t = jwt.verify(String(token || ''), jwtSecret(), { audience: 'assistant-undo' }); } catch { return { ok: false, status: 400, error: 'Too late to undo here; change it on its screen.' }; }
  if (t.u !== user.username) return { ok: false, status: 403, error: 'That change was made by someone else.' };
  try {
    const { res, data } = await call(user, t.r);
    logAsk(user.username, `Undo: ${t.s}`, 'action:undo', null, res.ok, 0, 0);
    return res.ok ? { ok: true, summary: `Undone: ${t.s}` } : { ok: false, status: res.status, error: data.error || `The app refused it (${res.status})` };
  } catch (e) { return { ok: false, status: 500, error: e.message }; }
}
