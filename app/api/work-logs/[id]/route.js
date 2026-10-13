import { NextResponse } from 'next/server';
import { execute, softDelete } from '@/lib/db';

export async function PUT(req, ctx) {
  const params = await ctx.params;
  const b = await req.json();
  await execute(
    `UPDATE work_logs SET order_id = ?, start_time = ?, end_time = ?, description = ?, rating = ? WHERE id = ?`,
    [b.order_id || null, b.start_time || null, b.end_time || null, b.description || null, b.rating || null, params.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  await softDelete('work_logs', params.id);
  return NextResponse.json({ ok: true });
}
