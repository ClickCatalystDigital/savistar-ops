// app/api/task/route.js

import { NextResponse } from 'next/server';
import { queryAll, execute } from '@/lib/db';
import { getUserFromRequest, isStaff } from '@/lib/auth';

export async function GET(req) {
  const user = await getUserFromRequest(req);
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope') || 'today';
  const mineOnly = isStaff(user) || searchParams.get('who') === 'mine';
  const mineClause = mineOnly ? 'AND t.assigned_to = ?' : '';
  if (scope === 'range') {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const rows = await queryAll(`
      SELECT t.*, c.name AS client_name FROM tasks t
      LEFT JOIN clients c ON c.id = t.client_id
      WHERE t.due_date BETWEEN ? AND ? AND t.is_deleted_record = 0 ${mineClause}
      ORDER BY t.due_date, t.id`, mineOnly ? [from, to, user.username] : [from, to]);
    return NextResponse.json(rows);
  }
  // today + overdue open tasks — "today" is passed by the client (its local date),
  // since SQLite's date('now') is UTC and can lag behind the user's local calendar date.
  const today = searchParams.get('today') || new Date().toISOString().slice(0, 10);
  const rows = await queryAll(`
    SELECT t.*, c.name AS client_name FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE t.status = 'open' AND t.due_date <= ? AND t.is_deleted_record = 0 ${mineClause}
    ORDER BY t.due_date, t.id`, mineOnly ? [today, user.username] : [today]);
  return NextResponse.json(rows);
}

export async function POST(req) {
  const user = await getUserFromRequest(req);
  const b = await req.json();
  if (!b.title?.trim() || !b.due_date) {
    return NextResponse.json({ error: 'title and due_date required' }, { status: 400 });
  }
  // Staff can only create tasks for themselves — ignore any assignee they send.
  const assignedTo = isStaff(user) ? user.username : (b.assigned_to || user?.username || null);
  const { lastId } = await execute(
    'INSERT INTO tasks (title, due_date, assigned_to, client_id, created_by, status) VALUES (?, ?, ?, ?, ?, ?)',
    [b.title.trim(), b.due_date, assignedTo, b.client_id || null, user?.username || null, 'open']);
  return NextResponse.json({ id: lastId });
}
