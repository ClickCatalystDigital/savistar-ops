// Rate memory for the picker: the last 3 times this item was quoted (excluding the quote being edited).
import { NextResponse } from 'next/server';
import { rateMemory } from '@/lib/quotations';

export async function GET(req, ctx) {
  const { id } = await ctx.params;
  const exclude = new URL(req.url).searchParams.get('exclude');
  return NextResponse.json(await rateMemory(Number(id), exclude));
}
