import { NextResponse } from 'next/server';
import { queryAll, queryOne, execute, softDelete } from '@/lib/db';

export async function GET(req, { params }) {
  const client = await queryOne('SELECT * FROM clients WHERE id = ? AND is_deleted_record = 0', [params.id]);
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [conversations, projects, orders, invoices] = await Promise.all([
    queryAll(`SELECT cc.*, p.name AS project_name FROM client_conversations cc
              LEFT JOIN projects p ON p.id = cc.project_id
              WHERE cc.client_id = ? AND cc.is_deleted_record = 0 ORDER BY cc.created_at DESC`, [params.id]),
    queryAll('SELECT * FROM projects WHERE client_id = ? AND is_deleted_record = 0 ORDER BY created_at DESC', [params.id]),
    queryAll('SELECT * FROM orders WHERE client_id = ? AND is_deleted_record = 0 ORDER BY created_at DESC', [params.id]),
    queryAll(`SELECT i.*,
        (SELECT COALESCE(SUM(qty * unit_price), 0) FROM invoice_items WHERE invoice_id = i.id) AS subtotal,
        (SELECT COALESCE(SUM(qty * unit_price * gst_pct / 100), 0) FROM invoice_items WHERE invoice_id = i.id) AS tax
      FROM invoices i WHERE i.client_id = ? AND i.is_deleted_record = 0 ORDER BY i.created_at DESC`, [params.id]),
  ]);
  return NextResponse.json({ ...client, conversations, projects, orders, invoices });
}

export async function PUT(req, { params }) {
  const b = await req.json();
  await execute(
    'UPDATE clients SET name = ?, phone = ?, email = ?, address = ?, notes = ? WHERE id = ?',
    [b.name, b.phone || null, b.email || null, b.address || null, b.notes || null, params.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  await softDelete('clients', params.id);
  return NextResponse.json({ ok: true });
}
