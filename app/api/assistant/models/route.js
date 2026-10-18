import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { isAiAdmin, listModels } from '@/lib/assistant';

export async function GET(req) {
  if (!isAiAdmin(await getUserFromRequest(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try { return NextResponse.json(await listModels()); } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
