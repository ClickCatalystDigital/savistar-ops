// app/api/site-visits/route.js

import { NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(req) {
  const user = await getUserFromRequest(req);
  const b = await req.json();
  if (!b.project_id || !b.visit_date) {
    return NextResponse.json({ error: 'project_id and visit_date required' }, { status: 400 });
  }
  const { lastId } = await execute(
    'INSERT INTO site_visits (project_id, visit_date, visited_by, notes) VALUES (?, ?, ?, ?)',
    [b.project_id, b.visit_date, b.visited_by || user?.username || null, b.notes || null]);
  return NextResponse.json({ id: lastId });
}
