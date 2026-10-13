// app/api/milestones/[id]/route.js

import { NextResponse } from 'next/server';
import { execute, softDelete } from '@/lib/db';

export async function PUT(req, ctx) {
  const params = await ctx.params;
  const b = await req.json();
  if (b.status !== undefined) {
    await execute(
      `UPDATE milestones SET status = ?, completed_at = CASE WHEN ? = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?`,
      [b.status, b.status, params.id]);
  }
  if (b.title !== undefined || b.due_date !== undefined) {
    await execute('UPDATE milestones SET title = COALESCE(?, title), due_date = ? WHERE id = ?',
      [b.title ?? null, b.due_date ?? null, params.id]);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  await softDelete('milestones', params.id);
  return NextResponse.json({ ok: true });
}
