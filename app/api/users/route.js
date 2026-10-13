// app/api/users/route.js

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryAll, execute } from '@/lib/db';
import { getUserFromRequest, requireApprover } from '@/lib/auth';

export async function GET(req) {
  const guard = requireApprover(await getUserFromRequest(req));
  if (guard) return guard;
  const rows = await queryAll('SELECT id, username, role, display_name, active, created_at, avatar_color, avatar_font, avatar_image_key AS avatar_url FROM users ORDER BY username');
  return NextResponse.json(rows);
}

export async function POST(req) {
  const guard = requireApprover(await getUserFromRequest(req));
  if (guard) return guard;
  const b = await req.json();
  if (!b.username?.trim() || !b.password) {
    return NextResponse.json({ error: 'username and password required' }, { status: 400 });
  }
  try {
    const { lastId } = await execute(
      'INSERT INTO users (username, password, role, display_name) VALUES (?, ?, ?, ?)',
      [b.username.trim(), bcrypt.hashSync(b.password, 10), b.role || 'user', b.display_name || null]);
    return NextResponse.json({ id: lastId });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    throw e;
  }
}
