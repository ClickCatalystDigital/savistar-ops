import { NextResponse } from 'next/server';
import { queryAll, execute } from '@/lib/db';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const where = q ? `AND (c.name LIKE ? OR c.phone LIKE ?)` : '';
  const args = q ? [`%${q}%`, `%${q}%`] : [];
  const rows = await queryAll(`
    SELECT c.*,
      (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.is_deleted_record = 0) AS projects_count,
      (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id AND o.is_deleted_record = 0) AS orders_count,
      (SELECT p.name FROM projects p WHERE p.client_id = c.id AND p.is_deleted_record = 0 AND p.status = 'active' ORDER BY p.created_at DESC LIMIT 1) AS active_project,
      (SELECT cc.body FROM client_conversations cc WHERE cc.client_id = c.id AND cc.is_deleted_record = 0 ORDER BY cc.created_at DESC LIMIT 1) AS last_note,
      (SELECT cc.created_at FROM client_conversations cc WHERE cc.client_id = c.id AND cc.is_deleted_record = 0 ORDER BY cc.created_at DESC LIMIT 1) AS last_note_at
    FROM clients c
    WHERE c.is_deleted_record = 0 ${where}
    ORDER BY c.created_at DESC`, args);
  return NextResponse.json(rows);
}

export async function POST(req) {
  const b = await req.json();
  if (!b.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  const { lastId } = await execute(
    'INSERT INTO clients (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)',
    [b.name.trim(), b.phone || null, b.email || null, b.address || null, b.notes || null]);
  return NextResponse.json({ id: lastId });
}
