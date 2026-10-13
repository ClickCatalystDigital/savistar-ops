// Any logged-in user can change their own password — no admin/manager gate.
// (Resetting someone ELSE's password stays admin/manager-only via /api/users/[id].)
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { execute } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function PUT(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { password } = await req.json();
  if (!password || password.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
  }
  await execute('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(password, 10), user.id]);
  return NextResponse.json({ ok: true });
}
