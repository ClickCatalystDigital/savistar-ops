import { NextResponse } from 'next/server';
import { softDelete } from '@/lib/db';
import { loadQuotation, saveQuotation } from '@/lib/quotations';

export async function GET(req, ctx) {
  const { id } = await ctx.params;
  const q = await loadQuotation(Number(id));
  return q ? NextResponse.json(q) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// The editor autosaves here: header, lines and stages in one body.
export async function PUT(req, ctx) {
  const { id } = await ctx.params;
  try {
    await saveQuotation(Number(id), await req.json());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === 'Not found' ? 404 : 400 });
  }
}

export async function DELETE(req, ctx) {
  const { id } = await ctx.params;
  await softDelete('quotations', Number(id));
  return NextResponse.json({ ok: true });
}
