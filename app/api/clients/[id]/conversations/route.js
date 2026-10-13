import { NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(req, ctx) {
  const params = await ctx.params;
  const user = await getUserFromRequest(req);
  const b = await req.json();
  if (!b.body?.trim()) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  const { lastId } = await execute(
    'INSERT INTO client_conversations (client_id, project_id, body, created_by) VALUES (?, ?, ?, ?)',
    [params.id, b.project_id || null, b.body.trim(), user?.username || null]);
  return NextResponse.json({ id: lastId });
}
