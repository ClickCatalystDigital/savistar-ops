// Public demo: the assistant asks this on load — hidden when the demo has no AI key, locked when none are left.
import { NextResponse } from 'next/server';
import { AI_QUESTIONS, aiLeft } from '@/lib/demo-leads';

export async function GET(req) {
  if (process.env.DEMO_MODE !== '1') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const enabled = !!process.env.OPENROUTER_API_KEY;
  return NextResponse.json({ enabled, left: enabled ? await aiLeft(req.cookies.get('demo_lead')?.value) : 0, limit: AI_QUESTIONS });
}
