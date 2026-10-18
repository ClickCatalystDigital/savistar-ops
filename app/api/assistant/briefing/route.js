// Time-aware briefing (deterministic; nothing is sent to OpenRouter).
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { briefing } from '@/lib/assistantBriefing';

export async function GET(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json(await briefing({ role: user.role, user: user.username }));
}
