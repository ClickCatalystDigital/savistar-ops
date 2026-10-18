// Starter chips: this person's own most-asked questions (last 60 days, answered, asked at least twice, not thumbed
// down) first, then the defaults.
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { queryAll } from '@/lib/db';
import { nowIST } from '@/lib/assistant';
import { STARTERS } from '@/lib/assistant-starters';

export async function GET(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const since = new Date(Date.parse(nowIST().replace(' ', 'T') + 'Z') - 60 * 86400e3).toISOString().replace('T', ' ').slice(0, 19);
  const rows = await queryAll(
    `SELECT MIN(question) AS q, COUNT(*) AS n FROM assistant_log WHERE asked_by = ? AND kind = 'data' AND tool IS NOT NULL AND ok = 1 AND at >= ?
       AND LOWER(TRIM(question)) NOT IN (SELECT LOWER(TRIM(question)) FROM assistant_log WHERE asked_by = ? AND kind = 'feedback' AND ok = 0)
     GROUP BY LOWER(TRIM(question)) HAVING COUNT(*) >= 2 ORDER BY n DESC, MAX(at) DESC LIMIT 3`,
    [user.username, since, user.username]);
  return NextResponse.json({ usual: rows.map((r) => r.q), defaults: STARTERS });
}
