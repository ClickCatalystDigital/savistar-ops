// Everything the calendar plots in one call: tasks, project milestones, site visits, order due dates.
import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import { getUserFromRequest, isStaff } from '@/lib/auth';

export async function GET(req) {
  const user = await getUserFromRequest(req);
  const { searchParams } = new URL(req.url);
  // Only the task layer is scoped by ?who — milestones, visits and order dates stay visible
  // in both modes so the month never loses its shape.
  const mineOnly = isStaff(user) || searchParams.get('who') === 'mine';
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 });
  const [tasks, milestones, visits, orders] = await Promise.all([
    queryAll(`SELECT t.id, t.title, t.due_date AS date, t.status, t.assigned_to, c.name AS client_name
              FROM tasks t LEFT JOIN clients c ON c.id = t.client_id
              WHERE t.due_date BETWEEN ? AND ? AND t.is_deleted_record = 0
                ${mineOnly ? 'AND t.assigned_to = ?' : ''}`,
              mineOnly ? [from, to, user.username] : [from, to]),
    queryAll(`SELECT m.id, m.title, m.due_date AS date, m.status, p.name AS project_name, m.project_id
              FROM milestones m JOIN projects p ON p.id = m.project_id
              WHERE m.due_date BETWEEN ? AND ?
                AND m.is_deleted_record = 0 AND p.is_deleted_record = 0`, [from, to]),
    queryAll(`SELECT v.id, v.visit_date AS date, v.visited_by, v.notes, p.name AS project_name, v.project_id
              FROM site_visits v JOIN projects p ON p.id = v.project_id
              WHERE v.visit_date BETWEEN ? AND ?
                AND v.is_deleted_record = 0 AND p.is_deleted_record = 0`, [from, to]),
    queryAll(`SELECT o.id, o.item, o.qty, o.due_date AS date, o.status
              FROM orders o WHERE o.due_date BETWEEN ? AND ? AND o.status IN ('pending', 'in_progress')
                AND o.is_deleted_record = 0`, [from, to]),
  ]);
  return NextResponse.json({ tasks, milestones, visits, orders });
}
