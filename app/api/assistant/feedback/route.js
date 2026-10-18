// Thumbs up/down on an answer: one assistant_log row (kind 'feedback'), no new table. A thumbs-down also drops the
// question from "your usual" and lands in Settings → AI → "Questions it couldn't answer".
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { logAsk } from '@/lib/assistant';

export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { question, tool, good } = await req.json().catch(() => ({}));
  if (typeof question !== 'string' || !question.trim() || typeof good !== 'boolean') return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  await logAsk(user.username, question.trim().slice(0, 600), 'feedback', typeof tool === 'string' ? tool.slice(0, 40) : null, good, 0, 0);
  return NextResponse.json({ ok: true });
}
