import { NextResponse } from 'next/server';
import { queryOne, execute, softDelete } from '@/lib/db';
import { getUserFromRequest, canAccessCash } from '@/lib/auth';
import { autoSend } from '@/lib/quickbooks-sync';

export async function PUT(req, ctx) {
  const params = await ctx.params;
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const existing = await queryOne('SELECT created_by, kind, party_type, party_id FROM cash_transactions WHERE id = ?', [params.id]);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canAccessCash(user, existing.created_by)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json();
  await execute(
    `UPDATE cash_transactions SET date = ?, kind = ?, amount = ?, party = ?, party_type = ?,
       party_id = ?, description = ? WHERE id = ?`,
    [b.date, b.kind, b.amount, b.party || null, b.party_type || null, b.party_id || null,
     b.description || null, params.id]);
  // QuickBooks: an entry that has just become money from a client goes over as a payment.
  const wasClientCredit = existing.kind === 'credit' && existing.party_type === 'client' && existing.party_id;
  if (!wasClientCredit && b.kind === 'credit' && b.party_type === 'client' && b.party_id) autoSend(req, 'receipt', params.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const existing = await queryOne('SELECT created_by FROM cash_transactions WHERE id = ?', [params.id]);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canAccessCash(user, existing.created_by)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await softDelete('cash_transactions', params.id); // also hides its attachment rows
  return NextResponse.json({ ok: true });
}
