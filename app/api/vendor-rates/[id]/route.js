import { NextResponse } from 'next/server';
import { softDelete } from '@/lib/db';

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  await softDelete('vendor_rates', params.id);
  return NextResponse.json({ ok: true });
}
