// Questions the assistant could not answer in the last 30 days (not understood, no look-up matched, not in the data)
// or that were thumbed down — the to-do list for improving it. Owners and admins.
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { queryAll } from '@/lib/db';
import { isAiAdmin, nowIST } from '@/lib/assistant';

export async function GET(req) {
  if (!isAiAdmin(await getUserFromRequest(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const since = new Date(Date.parse(nowIST().replace(' ', 'T') + 'Z') - 30 * 86400e3).toISOString().replace('T', ' ').slice(0, 19);
  const rows = await queryAll(
    `SELECT MIN(question) AS question, kind, COALESCE(tool, '') AS tool, COUNT(*) AS n, MAX(at) AS last_at FROM assistant_log
     WHERE ok = 0 AND at >= ? AND kind IN ('unclear', 'data', 'feedback') GROUP BY LOWER(TRIM(question)), kind ORDER BY n DESC, last_at DESC LIMIT 30`, [since]);
  return NextResponse.json(rows.map((r) => ({
    question: r.question,
    why: r.kind === 'feedback' ? 'thumbs down' : r.tool.startsWith('unsupported') ? `not in the data (${r.tool.slice(12)})` : r.kind === 'unclear' ? 'not understood' : 'no look-up matched',
    times: Number(r.n), last: String(r.last_at).slice(0, 10),
  })));
}
