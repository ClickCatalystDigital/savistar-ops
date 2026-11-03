import { NextResponse } from 'next/server';
import { queryOne, execute, softDelete } from '@/lib/db';
import { autoSend } from '@/lib/quickbooks-sync';

// Both edit and delete are open to any logged-in user (incl. staff) — consistent with
// every other entity's PUT/DELETE routes in the app (clients, orders, projects, vendors…).
export async function PUT(req, ctx) {
  const params = await ctx.params;
  const b = await req.json();
  const before = await queryOne('SELECT status FROM vendor_pos WHERE id = ?', [params.id]);
  await execute(
    `UPDATE vendor_pos SET item = ?, qty_ordered = ?, rate = ?, order_id = ?, project_id = ?,
       ordered_on = ?, notes = ?, status = ? WHERE id = ?`,
    [b.item, b.qty_ordered, b.rate || null, b.order_id || null, b.project_id || null,
     b.ordered_on || null, b.notes || null, b.status, params.id]);
  // QuickBooks: a PO that has just become complete goes over as a bill.
  if (b.status === 'complete' && before?.status !== 'complete') autoSend(req, 'bill', params.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  await softDelete('vendor_pos', params.id);
  return NextResponse.json({ ok: true });
}
