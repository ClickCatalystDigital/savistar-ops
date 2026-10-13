import { NextResponse } from 'next/server';
import { queryAll, queryOne, execute, softDelete } from '@/lib/db';

export async function GET(req, ctx) {
  const params = await ctx.params;
  const order = await queryOne(`
    SELECT o.*, c.name AS client_name, p.name AS project_name FROM orders o
    LEFT JOIN clients c ON c.id = o.client_id
    LEFT JOIN projects p ON p.id = o.project_id
    WHERE o.id = ? AND o.is_deleted_record = 0`, [params.id]);
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [workLogs, vendorPos] = await Promise.all([
    queryAll(`SELECT w.*, e.name AS employee_name, e.profession FROM work_logs w
              JOIN employees e ON e.id = w.employee_id
              WHERE w.order_id = ? AND w.is_deleted_record = 0 AND e.is_deleted_record = 0
              ORDER BY w.date DESC, w.id DESC`, [params.id]),
    queryAll(`SELECT vp.*, v.name AS vendor_name,
        COALESCE((SELECT SUM(qty_delivered) FROM vendor_deliveries d WHERE d.vendor_po_id = vp.id AND d.is_deleted_record = 0), 0) AS delivered,
        COALESCE((SELECT SUM(qty_returned) FROM vendor_deliveries d WHERE d.vendor_po_id = vp.id AND d.is_deleted_record = 0), 0) AS returned
      FROM vendor_pos vp JOIN vendors v ON v.id = vp.vendor_id
      WHERE vp.order_id = ? AND vp.is_deleted_record = 0 ORDER BY vp.created_at DESC`, [params.id]),
  ]);
  return NextResponse.json({ ...order, workLogs, vendorPos });
}

export async function PUT(req, ctx) {
  const params = await ctx.params;
  const b = await req.json();
  await execute(
    `UPDATE orders SET client_id = ?, project_id = ?, item = ?, qty = ?, description = ?,
       status = ?, start_date = ?, due_date = ?,
       delivered_at = CASE WHEN ? = 'delivered' AND delivered_at IS NULL THEN date('now') WHEN ? != 'delivered' THEN NULL ELSE delivered_at END
     WHERE id = ?`,
    [b.client_id || null, b.project_id || null, b.item, b.qty || 1, b.description || null,
     b.status, b.start_date || null, b.due_date || null, b.status, b.status, params.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  await softDelete('orders', params.id);
  return NextResponse.json({ ok: true });
}
