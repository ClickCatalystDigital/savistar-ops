import { NextResponse } from 'next/server';
import { queryAll, queryOne, execute, softDelete } from '@/lib/db';

export async function GET(req, ctx) {
  const params = await ctx.params;
  const project = await queryOne(`
    SELECT p.*, c.name AS client_name, c.notes AS client_notes FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.id = ? AND p.is_deleted_record = 0`, [params.id]);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [milestones, visits, orders, vendorPos, conversations] = await Promise.all([
    queryAll('SELECT * FROM milestones WHERE project_id = ? AND is_deleted_record = 0 ORDER BY sort_order, due_date, id', [params.id]),
    queryAll('SELECT * FROM site_visits WHERE project_id = ? AND is_deleted_record = 0 ORDER BY visit_date DESC', [params.id]),
    queryAll('SELECT * FROM orders WHERE project_id = ? AND is_deleted_record = 0 ORDER BY created_at DESC', [params.id]),
    queryAll(`SELECT vp.*, v.name AS vendor_name,
        COALESCE((SELECT SUM(qty_delivered) FROM vendor_deliveries d WHERE d.vendor_po_id = vp.id AND d.is_deleted_record = 0), 0) AS delivered,
        COALESCE((SELECT SUM(qty_returned) FROM vendor_deliveries d WHERE d.vendor_po_id = vp.id AND d.is_deleted_record = 0), 0) AS returned
      FROM vendor_pos vp JOIN vendors v ON v.id = vp.vendor_id
      WHERE vp.project_id = ? AND vp.is_deleted_record = 0 ORDER BY vp.created_at DESC`, [params.id]),
    queryAll('SELECT * FROM client_conversations WHERE project_id = ? AND is_deleted_record = 0 ORDER BY created_at DESC', [params.id]),
  ]);
  return NextResponse.json({ ...project, milestones, visits, orders, vendorPos, conversations });
}

export async function PUT(req, ctx) {
  const params = await ctx.params;
  const b = await req.json();
  await execute(
    'UPDATE projects SET client_id = ?, name = ?, status = ?, start_date = ?, notes = ?, address = ?, materials = ? WHERE id = ?',
    [b.client_id || null, b.name, b.status, b.start_date || null, b.notes || null, b.address || null, b.materials?.trim() || null, params.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  await softDelete('projects', params.id);
  return NextResponse.json({ ok: true });
}
