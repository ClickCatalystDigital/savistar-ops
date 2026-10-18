import { NextResponse } from 'next/server';
import { queryAll, execute } from '@/lib/db';

export async function GET() {
  const rows = await queryAll(`
    SELECT p.*, c.name AS client_name, c.notes AS client_notes,
      (SELECT GROUP_CONCAT(o.item, '; ') FROM orders o WHERE o.project_id = p.id AND o.is_deleted_record = 0) AS order_items,
      (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.is_deleted_record = 0) AS milestones_total,
      (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.is_deleted_record = 0 AND m.status = 'done') AS milestones_done,
      (SELECT COUNT(*) FROM orders o WHERE o.project_id = p.id AND o.is_deleted_record = 0) AS orders_count
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.is_deleted_record = 0
    ORDER BY p.status = 'active' DESC, p.created_at DESC`);
  return NextResponse.json(rows);
}

export async function POST(req) {
  const b = await req.json();
  if (!b.name?.trim()) return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  const { lastId } = await execute(
    'INSERT INTO projects (client_id, name, status, start_date, notes, materials) VALUES (?, ?, ?, ?, ?, ?)',
    [b.client_id || null, b.name.trim(), b.status || 'active', b.start_date || null, b.notes || null, b.materials?.trim() || null]);
  return NextResponse.json({ id: lastId });
}
