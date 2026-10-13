import { NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(req) {
  const user = await getUserFromRequest(req);
  const b = await req.json();
  if (!b.employee_id || !b.date) {
    return NextResponse.json({ error: 'employee_id and date required' }, { status: 400 });
  }
  const { lastId } = await execute(
    `INSERT INTO work_logs (employee_id, order_id, date, start_time, end_time, description, rating, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.employee_id, b.order_id || null, b.date, b.start_time || null, b.end_time || null,
     b.description || null, b.rating || null, user?.username || null]);
  return NextResponse.json({ id: lastId });
}
