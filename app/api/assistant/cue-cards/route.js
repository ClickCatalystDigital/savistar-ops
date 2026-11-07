import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { LEVELS, AREAS, fillCards } from '@/lib/cue-cards';

// Cue Cards: the ladder, the areas and the prompts, filled with this system's own records (lib/cue-cards.js).
export async function GET(req) {
  if (!(await getUserFromRequest(req))) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ levels: LEVELS, areas: AREAS, cards: await fillCards() });
}
