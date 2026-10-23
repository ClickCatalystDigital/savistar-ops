// app/api/users/[id]/route.js

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { execute } from '@/lib/db';
import { getUserFromRequest, requireApprover } from '@/lib/auth';

export async function PUT(req, ctx) {
  const params = await ctx.params;
  const user = await getUserFromRequest(req);
  const guard = requireApprover(user);
  if (guard) return guard;
  const b = await req.json();
  // Public demo: middleware lets this through only so the owner-pass browser can restyle a user's avatar
  // (colour, font); nothing else about a login can change there, and visitors can't change anything.
  if (process.env.DEMO_MODE === '1') {
    const [{ cookies }, { isOwnerPass }] = await Promise.all([import('next/headers'), import('@/lib/demo-leads')]);
    const onlyStyle = Object.keys(b).every(k => ['avatar_color', 'avatar_font', 'avatar_preset'].includes(k));
    if (!onlyStyle || !isOwnerPass((await cookies()).get('demo_lead')?.value)) {
      return NextResponse.json({ error: 'Not available in the demo' }, { status: 403 });
    }
  }
  if (b.password) {
    await execute('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(b.password, 10), params.id]);
  }
  await execute(
    'UPDATE users SET role = COALESCE(?, role), display_name = COALESCE(?, display_name), active = COALESCE(?, active), avatar_color = COALESCE(?, avatar_color), avatar_font = COALESCE(?, avatar_font), avatar_preset = COALESCE(?, avatar_preset) WHERE id = ?',
    [b.role ?? null, b.display_name ?? null, b.active === undefined ? null : (b.active ? 1 : 0), b.avatar_color ?? null, b.avatar_font ?? null, b.avatar_preset ?? null, params.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  const user = await getUserFromRequest(req);
  const guard = requireApprover(user);
  if (guard) return guard;
  if (Number(params.id) === user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }
  await execute('DELETE FROM users WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
