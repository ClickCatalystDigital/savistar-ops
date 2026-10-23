// One endpoint for a quote's moves: send (with a follow-up task), accept (optionally opening a
// project), decline, revise (a new draft revision; the old one is kept as superseded).
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { sendQuotation, decideQuotation, reviseQuotation } from '@/lib/quotations';

export async function POST(req, ctx) {
  const { id } = await ctx.params;
  const user = await getUserFromRequest(req);
  const b = await req.json();
  try {
    if (b.action === 'send') { await sendQuotation(Number(id), user, b.follow_up_days ?? 3); return NextResponse.json({ ok: true }); }
    if (b.action === 'accept') return NextResponse.json({ project_id: await decideQuotation(Number(id), 'accepted', { createProject: !!b.create_project }) });
    if (b.action === 'decline') { await decideQuotation(Number(id), 'declined'); return NextResponse.json({ ok: true }); }
    if (b.action === 'revise') return NextResponse.json({ id: await reviseQuotation(Number(id), user) });
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
