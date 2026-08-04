import { NextResponse } from 'next/server';
import { queryAll, queryOne, execute, softDelete } from '@/lib/db';

export async function GET(req, { params }) {
  const invoice = await queryOne('SELECT * FROM invoices WHERE id = ? AND is_deleted_record = 0', [params.id]);
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const items = await queryAll('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order', [params.id]);
  return NextResponse.json({ ...invoice, items });
}

export async function PUT(req, { params }) {
  const b = await req.json();
  const items = (b.items || []).filter(i => i.description?.trim());
  if (items.length === 0) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });

  await execute(
    `UPDATE invoices SET project_id = ?, company = ?, invoice_no = ?, title = ?, client_pan = ?, submitted_on = ?, due_date = ?,
       payment_terms = ?, status = ?, notes = ? WHERE id = ?`,
    [b.project_id || null, b.company || 'savistar', b.invoice_no || null, b.title || null, b.client_pan || null,
     b.submitted_on || null, b.due_date || null, b.payment_terms || null, b.status || 'draft', b.notes || null, params.id]);

  await execute('DELETE FROM invoice_items WHERE invoice_id = ?', [params.id]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await execute(
      `INSERT INTO invoice_items (invoice_id, description, hsn, gst_pct, qty, unit_price, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [params.id, it.description.trim(), it.hsn || null, Number(it.gst_pct) || 0, Number(it.qty) || 1, Number(it.unit_price) || 0, i]);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  await softDelete('invoices', params.id);
  return NextResponse.json({ ok: true });
}
