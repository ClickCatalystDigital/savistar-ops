import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { runAction } from '@/lib/actionRunner';

// Save on an assistant action card: { action, fields } → the app's own route, as this person (lib/actionRunner.js).
export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { action, fields } = await req.json().catch(() => ({}));
  const out = await runAction(user, action, fields || {});
  return NextResponse.json(out, { status: out.ok ? 200 : out.status === 500 ? 500 : 400 });
}
