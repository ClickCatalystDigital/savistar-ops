// "Connect Claude to Designer Ops?" — the consent step of the MCP sign-in (lib/oauth.js). The middleware sends a
// signed-out person to /login first and back here after. Allow posts to /oauth/approve.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { checkAuthorize } from '@/lib/oauth';
import { BRAND } from '@/lib/brand';
import { isAiAdmin } from '@/lib/assistant';

export const metadata = { title: 'Connect an AI app' };
const FIELDS = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'];

export default async function Authorize({ searchParams }) {
  if (process.env.DEMO_MODE === '1') notFound();
  const p = await searchParams;
  const user = await getSessionUser();
  let client = null, problem = null;
  try { client = await checkAuthorize(p); } catch (e) { problem = e.message; }
  // Owners and admins connect AI apps (and see and disconnect them in Settings → My assistant).
  if (!problem && !isAiAdmin(user)) problem = 'Only owners and admins can connect an AI app. Ask one of them, or sign in with that login.';
  const here = `/oauth/authorize?${new URLSearchParams(Object.fromEntries(FIELDS.filter((k) => p[k]).map((k) => [k, p[k]]))).toString()}`;

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-10">
      <div className="paper-surface w-full max-w-md rounded-xl p-6">
        {problem ? (
          <>
            <h1 className="font-hand text-2xl">Couldn’t connect</h1>
            <p className="mt-2 text-sm text-muted-foreground">{problem}</p>
          </>
        ) : (
          <>
            <h1 className="font-hand text-2xl">Connect {client.name} to {BRAND.app}?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{user.display_name || user.username}</span>.{' '}
              <Link href={`/login?next=${encodeURIComponent(here)}`} className="underline underline-offset-2">Not you?</Link>
            </p>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              <li>• It can ask about your projects, clients, quotes, orders, people, vendors and money, the same as the in-app assistant.</li>
              <li>• It can prepare everyday changes. Each one is shown to you there first, and made only when you confirm it.</li>
              <li>• It acts as you: it sees and does only what your login may.</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">You can disconnect it any time in Settings → My assistant.</p>
            <form method="post" action="/oauth/approve" className="mt-5 flex justify-end gap-2">
              {FIELDS.filter((k) => p[k]).map((k) => <input key={k} type="hidden" name={k} value={p[k]} />)}
              <button name="decision" value="deny" className="rounded-md px-4 py-2 text-sm opacity-70 hover:opacity-100">Cancel</button>
              <button name="decision" value="allow" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90">Allow</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
