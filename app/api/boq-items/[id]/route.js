// Edit, hide or remove a library item (owners, admins, managers). Editing a central item marks it
// edited, so the library sync never overwrites it; "reset" takes the central text back.
import { NextResponse } from 'next/server';
import { queryOne, execute, softDelete } from '@/lib/db';
import { getUserFromRequest, requireApprover } from '@/lib/auth';
import { BOQ_LIBRARY, BOQ_LIBRARY_VERSION } from '@/lib/boq-library';
import { SYNC_FIELDS } from '@/lib/boq-sync';

export async function PUT(req, ctx) {
  const user = await getUserFromRequest(req);
  const denied = requireApprover(user);
  if (denied) return denied;
  const { id } = await ctx.params;
  const row = await queryOne('SELECT * FROM boq_items WHERE id = ? AND is_deleted_record = 0', [id]);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await req.json();

  if (b.action === 'hide' || b.action === 'show') {
    await execute('UPDATE boq_items SET hidden = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [b.action === 'hide' ? 1 : 0, user.username, id]);
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'reset') {
    const c = BOQ_LIBRARY.find((x) => x.library_id === row.library_id);
    if (!c) return NextResponse.json({ error: 'This item is not in the central library' }, { status: 400 });
    await execute(`UPDATE boq_items SET ${SYNC_FIELDS.map((f) => `${f} = ?`).join(', ')}, edited = 0, library_version = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...SYNC_FIELDS.map((f) => c[f] ?? null), BOQ_LIBRARY_VERSION, user.username, id]);
    return NextResponse.json({ ok: true });
  }

  if (!b.name?.trim() || !b.unit) return NextResponse.json({ error: 'Name and unit are required' }, { status: 400 });
  await execute(
    `UPDATE boq_items SET trade = ?, name = ?, unit = ?, units = ?, basis_required = ?, measure = ?, spec_keys = ?, omits = ?, description = ?, match = ?,
       edited = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [b.trade?.trim() || row.trade, b.name.trim(), b.unit, b.units || null, b.basis_required ? 1 : 0, b.measure?.trim() || null, b.spec_keys || null,
     b.omits?.trim() || null, b.description?.trim() || null, (b.match || '').toLowerCase().trim() || row.match, row.source === 'library' ? 1 : 0, user.username, id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, ctx) {
  const user = await getUserFromRequest(req);
  const denied = requireApprover(user);
  if (denied) return denied;
  const { id } = await ctx.params;
  await softDelete('boq_items', Number(id));
  return NextResponse.json({ ok: true });
}
