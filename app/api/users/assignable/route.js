// app/api/users/assignable/route.js

// Active users any authenticated person can assign a task to — no role/password exposed.
import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await queryAll(
    'SELECT id, username, display_name, avatar_color, avatar_font, avatar_preset, avatar_image_key AS avatar_url FROM users WHERE active = 1 ORDER BY display_name, username');
  return NextResponse.json(rows);
}
