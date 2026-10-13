import { NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { computeStoredStatus } from '@/lib/po';

// Record a partial delivery and/or return against a PO. Auto-completes the PO once
// everything ordered has arrived (returns never reopen it — see lib/po.js).
export async function POST(req, ctx) {
  const params = await ctx.params;
  const b = await req.json();
  if (!b.date || (!b.qty_delivered && !b.qty_returned)) {
    return NextResponse.json({ error: 'date and a delivered or returned qty required' }, { status: 400 });
  }
  const po = await queryOne('SELECT qty_ordered, status FROM vendor_pos WHERE id = ?', [params.id]);
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (po.status === 'cancelled') {
    return NextResponse.json({ error: 'PO is cancelled' }, { status: 400 });
  }
  const totals = await queryOne(
    `SELECT COALESCE(SUM(qty_delivered), 0) AS delivered, COALESCE(SUM(qty_returned), 0) AS returned
     FROM vendor_deliveries WHERE vendor_po_id = ? AND is_deleted_record = 0`, [params.id]);
  const newDelivered = totals.delivered + (b.qty_delivered || 0);
  const newReturned = totals.returned + (b.qty_returned || 0);
  if (newReturned > newDelivered) {
    return NextResponse.json({ error: 'Returned quantity cannot exceed delivered quantity' }, { status: 400 });
  }
  await execute(
    'INSERT INTO vendor_deliveries (vendor_po_id, date, qty_delivered, qty_returned, notes) VALUES (?, ?, ?, ?, ?)',
    [params.id, b.date, b.qty_delivered || 0, b.qty_returned || 0, b.notes || null]);
  const status = computeStoredStatus({ qty_ordered: po.qty_ordered, delivered: newDelivered, status: po.status });
  await execute('UPDATE vendor_pos SET status = ? WHERE id = ?', [status, params.id]);
  return NextResponse.json({ ok: true, outstanding: Math.max(0, po.qty_ordered - newDelivered) });
}
