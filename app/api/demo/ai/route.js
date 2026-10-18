// Public demo: the assistant asks this on load — hidden when the demo has no AI key, locked when none are left.
import { NextResponse } from 'next/server';
import { AI_QUESTIONS, aiLeft, isOwnerPass } from '@/lib/demo-leads';

export async function GET(req) {
  if (process.env.DEMO_MODE !== '1') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const enabled = !!process.env.OPENROUTER_API_KEY;
  const lead = req.cookies.get('demo_lead')?.value;
  const pass = isOwnerPass(lead);
  return NextResponse.json({ enabled, pass, left: !enabled ? 0 : pass ? AI_QUESTIONS : await aiLeft(lead), limit: AI_QUESTIONS });
}
