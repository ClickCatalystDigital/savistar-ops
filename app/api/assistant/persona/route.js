// Each person's persona (app_settings key 'assistant_persona:<username>') and chat mode, Manual or Auto
// ('assistant_auto:<username>'). Anyone signed in reads and sets their own; `mayAuto` says whether their role may use Auto.
// The demo keeps it in the browser instead (its logins are shared): the guard lets only GET through there (for the name).
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { setSettings, getAiName, getSettings, mayAuto } from '@/lib/assistant';
import { PERSONA_BY_KEY } from '@/lib/assistant-personas';

const keyFor = (u) => `assistant_persona:${u}`;
const autoKey = (u) => `assistant_auto:${u}`;

export async function GET(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const row = await queryOne('SELECT value FROM app_settings WHERE key = ?', [keyFor(user.username)]);
  const auto = await queryOne('SELECT value FROM app_settings WHERE key = ?', [autoKey(user.username)]);
  return NextResponse.json({ persona: PERSONA_BY_KEY[row?.value] ? row.value : 'plain', name: await getAiName(), mayAuto: mayAuto(user, await getSettings()), auto: auto?.value === '1' });
}

export async function PUT(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { persona, auto } = await req.json().catch(() => ({}));
  if (typeof auto === 'boolean') { await setSettings(user.username, [[autoKey(user.username), auto ? '1' : '0']]); return NextResponse.json({ auto }); }
  if (!PERSONA_BY_KEY[persona]) return NextResponse.json({ error: 'Unknown persona.' }, { status: 400 });
  await setSettings(user.username, [[keyFor(user.username), persona]]);
  return NextResponse.json({ persona });
}
