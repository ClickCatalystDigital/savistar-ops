// Raise one payment stage of an accepted quotation as a draft invoice.
import { NextResponse } from 'next/server';
import { raiseStageInvoice } from '@/lib/quotations';

export async function POST(req, ctx) {
  const { id } = await ctx.params;
  const { stage_id } = await req.json();
  try {
    return NextResponse.json({ invoice_id: await raiseStageInvoice(Number(id), stage_id) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
