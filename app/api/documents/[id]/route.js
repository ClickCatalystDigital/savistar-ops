import { NextResponse } from 'next/server';
import { execute, softDelete } from '@/lib/db';
import { getDocument } from '@/lib/extract';
import { getUserFromRequest, requireApprover, requireNonStaff } from '@/lib/auth';

export async function GET(req, ctx) {
  const params = await ctx.params;
  const guard = requireNonStaff(await getUserFromRequest(req));
  if (guard) return guard;
  const doc = await getDocument(params.id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(doc);
}

// Save reviewed header fields and/or edited line items (comments, corrections).
export async function PUT(req, ctx) {
  const params = await ctx.params;
  const guard = requireNonStaff(await getUserFromRequest(req));
  if (guard) return guard;
  const b = await req.json();
  const doc = await getDocument(params.id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await execute(
    `UPDATE documents SET bank_name = ?, account_no = ?, statement_from = ?, statement_to = ?,
       opening_balance = ?, closing_balance = ?, total_debit = ?, total_credit = ?, line_items = ?, status = ?
     WHERE id = ?`,
    [b.bank_name ?? doc.bank_name, b.account_no ?? doc.account_no,
     b.statement_from ?? doc.statement_from, b.statement_to ?? doc.statement_to,
     b.opening_balance ?? doc.opening_balance, b.closing_balance ?? doc.closing_balance,
     b.total_debit ?? doc.total_debit, b.total_credit ?? doc.total_credit,
     JSON.stringify(b.line_items ?? doc.line_items),
     b.status ?? doc.status, params.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  const guard = requireApprover(await getUserFromRequest(req));
  if (guard) return guard;
  const doc = await getDocument(params.id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // The PDF deliberately stays in R2 — a hidden row pointing at a live file is recoverable,
  // a restored row pointing at a deleted file is not.
  await softDelete('documents', params.id);
  return NextResponse.json({ ok: true });
}
