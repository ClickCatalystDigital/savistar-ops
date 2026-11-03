// QuickBooks Online (North American public demo; lib/quickbooks.js). One file for the six endpoints:
//   GET  status | accounts      — card state / the QuickBooks company's active accounts (office roles)
//   GET  connect | callback     — Intuit's OAuth 2.0 authorization-code round trip (owner pass only)
//   POST disconnect, PUT account-map {map: {code: qboAccountId|''}} (owner pass only)
// Register this exact redirect URI in the Intuit app: https://interiors-erp-us.ahromlabs.com/api/quickbooks/callback
import { NextResponse } from 'next/server';
import { getUserFromRequest, isStaff } from '@/lib/auth';
import { audit } from '@/lib/assistant';
import { qboConfig, redirectUri, setHost, completeConnection, connectionStatus, qboAccounts, saveAccountMap, disconnect, manageDenied } from '@/lib/quickbooks';
import { authorizeUrl, checkState, normalizeAccounts, cleanAccountMap, LOCAL_ACCOUNTS, STATE_TTL_MS } from '@/lib/quickbooks.mjs';

const json = (body, status = 200) => NextResponse.json(body, { status });
const back = (req, q) => {
  const res = NextResponse.redirect(new URL(`/settings?tab=integrations&${new URLSearchParams(q)}`, req.url));
  res.cookies.set('qbo_state', '', { path: '/api/quickbooks', maxAge: 0 });
  return res;
};
const randomState = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' })[c]);

async function guard(req, action) {
  const user = await getUserFromRequest(req);
  if (!user || isStaff(user)) return { error: json({ error: 'Forbidden' }, 403) };
  setHost(req);
  const cfg = qboConfig();
  if (!['status'].includes(action) && !cfg) return { error: json({ error: 'QuickBooks is not set up on this server' }, 404) };
  return { user, cfg };
}

export async function GET(req, { params }) {
  const { action } = await params;
  const { user, cfg, error } = await guard(req, action);
  if (error) return ['connect', 'callback'].includes(action) ? NextResponse.redirect(new URL('/login', req.url)) : error;

  if (action === 'status') {
    if (!cfg) return json({ enabled: false });
    const [connection, manage] = await Promise.all([connectionStatus().catch(err => ({ status: 'error', last_error: err.message })), manageDenied()]);
    return json({ enabled: true, environment: cfg.environment, canManage: !manage, manageNote: manage, connection, localAccounts: LOCAL_ACCOUNTS });
  }
  if (action === 'accounts') {
    try { return json({ accounts: normalizeAccounts(await qboAccounts()) }); } catch (err) { return json({ error: err.message }, 502); }
  }
  if (action === 'connect') {
    const why = await manageDenied();
    if (why) return back(req, { qbo_error: why });
    const state = randomState();
    const res = NextResponse.redirect(authorizeUrl({ clientId: cfg.clientId, redirectUri: redirectUri(req), state }));
    res.cookies.set('qbo_state', btoa(JSON.stringify({ state, userId: user.id, exp: Date.now() + STATE_TTL_MS })), {
      path: '/api/quickbooks', httpOnly: true, sameSite: 'lax', secure: true, maxAge: STATE_TTL_MS / 1000,
    });
    return res;
  }
  if (action === 'callback') {
    const sp = new URL(req.url).searchParams;
    if (sp.get('error')) return back(req, { qbo_error: sp.get('error') === 'access_denied' ? 'Connection cancelled in QuickBooks' : sp.get('error') });
    let cookie = null;
    try { cookie = JSON.parse(atob(req.cookies.get('qbo_state')?.value || '')); } catch { /* bad cookie = expired */ }
    const bad = checkState({ cookie, state: sp.get('state'), userId: user.id }) || await manageDenied();
    if (bad) return back(req, { qbo_error: bad });
    if (!sp.get('code') || !sp.get('realmId')) return back(req, { qbo_error: 'QuickBooks did not send back a company' });
    try { await completeConnection({ code: sp.get('code'), realmId: sp.get('realmId'), req, user }); } catch (err) { return back(req, { qbo_error: err.message }); }
    await audit(user.username, 'quickbooks_connected', { realm: sp.get('realmId') });
    return back(req, { qbo: 'connected' });
  }
  return json({ error: 'Not found' }, 404);
}

export async function POST(req, { params }) {
  const { action } = await params;
  const { user, error } = await guard(req, action);
  if (error) return error;
  if (action !== 'disconnect') return json({ error: 'Not found' }, 404);
  const why = await manageDenied();
  if (why) return json({ error: why }, 403);
  await disconnect();
  await audit(user.username, 'quickbooks_disconnected');
  return json({ ok: true });
}

export async function PUT(req, { params }) {
  const { action } = await params;
  const { user, error } = await guard(req, action);
  if (error) return error;
  if (action !== 'account-map') return json({ error: 'Not found' }, 404);
  const why = await manageDenied();
  if (why) return json({ error: why }, 403);
  const { map } = await req.json().catch(() => ({}));
  try {
    const { rows, error: bad } = cleanAccountMap(map, LOCAL_ACCOUNTS.map(a => a.code), normalizeAccounts(await qboAccounts()).map(a => a.id));
    if (bad) return json({ error: bad }, 400);
    const saved = await saveAccountMap(rows);
    await audit(user.username, 'quickbooks_account_map', { accounts: rows.length });
    return json({ account_map: saved });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}
