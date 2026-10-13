import { NextResponse } from 'next/server';
import { queryAll, queryOne, execute, softDelete, vendorExpenseSQL } from '@/lib/db';

export async function GET(req, ctx) {
  const params = await ctx.params;
  const vendor = await queryOne(
    `SELECT v.*, ${vendorExpenseSQL('v')} AS total_expense FROM vendors v
     WHERE v.id = ? AND v.is_deleted_record = 0`, [params.id]);
  if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [rates, freight, pos] = await Promise.all([
    queryAll('SELECT * FROM vendor_rates WHERE vendor_id = ? AND is_deleted_record = 0 ORDER BY from_loc, to_loc', [params.id]),
    // expected_amount joined in so the UI can flag charges above the rate card.
    queryAll(`SELECT f.*, r.expected_amount FROM freight_charges f
              LEFT JOIN vendor_rates r ON r.vendor_id = f.vendor_id
                AND LOWER(r.from_loc) = LOWER(f.from_loc) AND LOWER(r.to_loc) = LOWER(f.to_loc)
                AND r.is_deleted_record = 0
              WHERE f.vendor_id = ? AND f.is_deleted_record = 0 ORDER BY f.date DESC, f.id DESC`, [params.id]),
    queryAll(`SELECT vp.*, o.item AS order_item, p.name AS project_name,
        COALESCE((SELECT SUM(qty_delivered) FROM vendor_deliveries d WHERE d.vendor_po_id = vp.id AND d.is_deleted_record = 0), 0) AS delivered,
        COALESCE((SELECT SUM(qty_returned) FROM vendor_deliveries d WHERE d.vendor_po_id = vp.id AND d.is_deleted_record = 0), 0) AS returned
      FROM vendor_pos vp
      LEFT JOIN orders o ON o.id = vp.order_id
      LEFT JOIN projects p ON p.id = vp.project_id
      WHERE vp.vendor_id = ? AND vp.is_deleted_record = 0
      ORDER BY vp.status = 'open' DESC, vp.created_at DESC`, [params.id]),
  ]);
  // Attach delivery events per PO.
  const poIds = pos.map(p => p.id);
  let deliveries = [];
  if (poIds.length) {
    deliveries = await queryAll(
      `SELECT * FROM vendor_deliveries WHERE vendor_po_id IN (${poIds.map(() => '?').join(',')})
       AND is_deleted_record = 0 ORDER BY date, id`, poIds);
  }
  const byPo = {};
  for (const d of deliveries) (byPo[d.vendor_po_id] ||= []).push(d);
  return NextResponse.json({
    ...vendor, rates, freight,
    pos: pos.map(p => ({ ...p, deliveries: byPo[p.id] || [] })),
  });
}

export async function PUT(req, ctx) {
  const params = await ctx.params;
  const b = await req.json();
  await execute('UPDATE vendors SET name = ?, phone = ?, material = ?, notes = ? WHERE id = ?',
    [b.name, b.phone || null, b.material || null, b.notes || null, params.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  await softDelete('vendors', params.id);
  return NextResponse.json({ ok: true });
}
