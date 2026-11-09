import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { runAction, runUndo } from '@/lib/actionRunner';

// Save on an assistant action card: { action, fields } → the app's own route, as this person (lib/actionRunner.js).
// { action, fields, auto: true }: chat's Auto mode (the server decides if it may skip the card). { undo }: Undo.
export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { action, fields, auto, undo } = await req.json().catch(() => ({}));
  const out = undo ? await runUndo(user, undo) : await runAction(user, action, fields || {}, { auto: auto === true });
  return NextResponse.json(out, { status: out.ok ? 200 : [403, 409, 500].includes(out.status) ? out.status : 400 });
}
