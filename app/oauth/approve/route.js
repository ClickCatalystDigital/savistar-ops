// The Allow / Deny on /oauth/authorize. Signed in (cookie) and same-site only; Allow sends the app a one-time code.
import { getUserFromRequest } from '@/lib/auth';
import { checkAuthorize, createCode, originOf } from '@/lib/oauth';
import { isAiAdmin } from '@/lib/assistant';

export async function POST(req) {
  if (process.env.DEMO_MODE === '1') return new Response('Not found', { status: 404 });
  const origin = req.headers.get('origin');
  if (origin && origin !== originOf(req)) return new Response('Forbidden', { status: 403 });
  const user = await getUserFromRequest(req);
  if (!user) return new Response('Sign in first', { status: 401 });
  if (!isAiAdmin(user)) return new Response('Only owners and admins can connect an AI app', { status: 403 });
  const p = Object.fromEntries(await req.formData());
  try { await checkAuthorize(p); } catch (e) { return new Response(e.message, { status: 400 }); }
  const back = new URL(p.redirect_uri);
  if (p.state) back.searchParams.set('state', p.state);
  if (p.decision !== 'allow') back.searchParams.set('error', 'access_denied');
  else back.searchParams.set('code', await createCode({ client_id: p.client_id, username: user.username, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge }));
  return Response.redirect(back.href, 303);
}
