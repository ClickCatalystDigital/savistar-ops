import { NextResponse } from 'next/server';
import { queryOne, execute, softDelete } from '@/lib/db';
import { getUserFromRequest, canAccessCash } from '@/lib/auth';

export async function PUT(req, ctx) {
  const params = await ctx.params;
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const existing = await queryOne('SELECT created_by FROM cash_transactions WHERE id = ?', [params.id]);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canAccessCash(user, existing.created_by)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json();
  await execute(
    `UPDATE cash_transactions SET date = ?, kind = ?, amount = ?, party = ?, party_type = ?,
       party_id = ?, description = ? WHERE id = ?`,
    [b.date, b.kind, b.amount, b.party || null, b.party_type || null, b.party_id || null,
     b.description || null, params.id]);
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
