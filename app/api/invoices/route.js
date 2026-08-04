import { NextResponse } from 'next/server';
import { execute } from '@/lib/db';

export async function POST(req) {
  const b = await req.json();
  if (!b.client_id) return NextResponse.json({ error: 'Client is required' }, { status: 400 });
  const items = (b.items || []).filter(i => i.description?.trim());
  if (items.length === 0) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });

  const { lastId } = await execute(
    `INSERT INTO invoices (client_id, project_id, company, invoice_no, title, client_pan, submitted_on, due_date, payment_terms, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.client_id, b.project_id || null, b.company || 'savistar', b.invoice_no || null, b.title || null, b.client_pan || null,
     b.submitted_on || null, b.due_date || null, b.payment_terms || null, b.status || 'draft', b.notes || null]);

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await execute(
      `INSERT INTO invoice_items (invoice_id, description, hsn, gst_pct, qty, unit_price, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [lastId, it.description.trim(), it.hsn || null, Number(it.gst_pct) || 0, Number(it.qty) || 1, Number(it.unit_price) || 0, i]);
  }
  return NextResponse.json({ id: lastId });
}
