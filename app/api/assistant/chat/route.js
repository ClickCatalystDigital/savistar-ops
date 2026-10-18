// One chat turn. Everyone signed in can ask; what a look-up returns is scoped by role in lib/assistantTools.js.
// History lives in the browser; only the last messages are sent.
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { isAiAdmin } from '@/lib/assistant';
import { turn } from '@/lib/assistantChat';
import { AI_QUESTIONS, takeAiQuestion, returnAiQuestion } from '@/lib/demo-leads';

const DEMO = process.env.DEMO_MODE === '1';

export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { messages, path, dry, context, persona } = await req.json().catch(() => ({}));
  // Public demo: a few questions per visitor, given back if the answer fails.
  const lead = req.cookies.get('demo_lead')?.value;
  if (DEMO && !(await takeAiQuestion(lead))) return NextResponse.json({ error: `That was your ${AI_QUESTIONS} free questions.`, demoLimit: true }, { status: 429 });
  const out = await turn({ user: user.username, role: user.role, messages, path, dry: !DEMO && dry === true && isAiAdmin(user), context, persona });
  if (DEMO && out.status !== 200) {
    await returnAiQuestion(lead).catch(() => {});
    // key or credit trouble is ours to fix; visitors can't open Settings in the demo
    if ([401, 402].includes(out.status) || out.status === 400) out.body = { error: 'The assistant is unavailable right now. Please try again later.' };
  }
  return NextResponse.json(out.body, { status: out.status });
}
