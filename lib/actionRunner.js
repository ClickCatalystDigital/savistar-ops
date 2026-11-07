// Runs an assistant action (lib/assistantActions.js) through the app's own API route, in the same process: the request
// the screen would send, signed as the person asking (Bearer token, which lib/auth.js getUserFromRequest reads). So the
// route's checks, validation and side effects (QuickBooks sync, demo rules) apply exactly as on screen.
import { signToken } from './auth.js';
import { check, ACTION_BY_KEY } from './assistantActions.js';
import { logAsk } from './assistant.js';

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
].map(([pattern, load]) => ({ pattern, load, re: new RegExp(`^${pattern.replace(/:id/g, '(\\d+)')}$`) }));

export function routeFor(path) {
  for (const r of ROUTES) { const m = r.re.exec(path); if (m) return { ...r, params: m[1] ? { id: m[1] } : {} }; }
  return null;
}

// Check the fields again (never trust a card or an MCP client), then run. Returns { ok, status, summary, link, result | error }.
export async function runAction(user, key, given) {
  const t0 = Date.now();
  const a = ACTION_BY_KEY[key];
  if (!a) return { ok: false, status: 400, error: `Unknown action: ${key}` };
  const c = await check(key, given);
  if (!c.ready) return { ok: false, status: 400, error: [...c.errors, ...(c.missing.length ? [`Missing: ${c.missing.join(', ')}`] : [])].join('. '), card: c };
  let out;
  try {
    const { method, path, body } = await a.request(c.values);
    const route = routeFor(path);
    if (!route) throw new Error(`No route for ${path}`);
    const handler = (await route.load())[method];
    if (!handler) throw new Error(`${path} has no ${method}`);
    const req = new Request(`http://assistant.local${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${signToken(user)}` }, body: method === 'DELETE' ? undefined : JSON.stringify(body) });
    const res = await handler(req, { params: Promise.resolve(route.params) });
    const data = await res.json().catch(() => ({}));
    out = res.ok ? { ok: true, status: res.status, summary: c.summary, link: a.link?.(data, c.values) || null, result: data }
      : { ok: false, status: res.status, summary: c.summary, error: data.error || `The app refused it (${res.status})` };
  } catch (e) {
    out = { ok: false, status: 500, summary: c.summary, error: e.message };
  }
  logAsk(user.username, c.summary, 'action', key, out.ok, Date.now() - t0, 0);
  return out;
}
