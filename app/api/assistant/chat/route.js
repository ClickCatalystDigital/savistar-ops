// One chat turn. Everyone signed in can ask; what a look-up returns is scoped by role in lib/assistantTools.js.
// History lives in the browser; only the last messages are sent.
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { isAiAdmin } from '@/lib/assistant';
import { turn } from '@/lib/assistantChat';

export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { messages, path, dry, context } = await req.json().catch(() => ({}));
  const out = await turn({ user: user.username, role: user.role, messages, path, dry: dry === true && isAiAdmin(user), context });
  return NextResponse.json(out.body, { status: out.status });
}
