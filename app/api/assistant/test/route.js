// Proves the stored key works: reads the credit balance and makes one trivial Jev decision.
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import * as A from '@/lib/assistant';

export async function POST(req) {
  if (!A.isAiAdmin(await getUserFromRequest(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const key = await A.getKey().catch(() => null);
  if (!key) return NextResponse.json({ error: 'Save an OpenRouter key first.' }, { status: 400 });
  const t0 = Date.now();
  try {
    const { answers, cost } = await A.jevDecide(key, 'Which milestones of the Mehta bungalow are still open?', {
      kind: { type: 'choice', instructions: 'What kind of question is this?', criteria: { data: 'Asks for numbers or records from the business data.', other: 'Anything else.' } },
    });
    const kind = answers?.kind?.choice;
    if (!kind) return NextResponse.json({ error: 'Jev answered, but not in the expected format.' }, { status: 502 });
    return NextResponse.json({ ok: true, jevModel: A.JEV_MODEL, answered: kind, ms: Date.now() - t0, cost, balance: await A.getBalance(key) });
  } catch (e) {
    const up = e.upstream || { status: 502, error: e.message };
    return NextResponse.json({ error: up.error, link: up.link, linkLabel: up.linkLabel }, { status: [401, 402, 429].includes(up.status) ? up.status : 502 });
  }
}
