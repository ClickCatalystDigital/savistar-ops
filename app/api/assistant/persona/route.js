// Each person's persona (app_settings key 'assistant_persona:<username>'). Anyone signed in reads and sets their own.
// The demo keeps it in the browser instead (its logins are shared), so the guard leaves this route closed there.
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { setSettings } from '@/lib/assistant';
import { PERSONA_BY_KEY } from '@/lib/assistant-personas';

const keyFor = (u) => `assistant_persona:${u}`;

export async function GET(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const row = await queryOne('SELECT value FROM app_settings WHERE key = ?', [keyFor(user.username)]);
  return NextResponse.json({ persona: PERSONA_BY_KEY[row?.value] ? row.value : 'plain' });
}

export async function PUT(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { persona } = await req.json().catch(() => ({}));
  if (!PERSONA_BY_KEY[persona]) return NextResponse.json({ error: 'Unknown persona.' }, { status: 400 });
  await setSettings(user.username, [[keyFor(user.username), persona]]);
  return NextResponse.json({ persona });
}
