// Settings → AI (owner/admin): OpenRouter key, model, answer mode, daily limit, data-questions switch.
// The key is write-only: responses carry `hasKey` + the last 4 characters, never the key.
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import * as A from '@/lib/assistant';

async function payload() {
  const s = await A.getSettings();
  const [balance, used] = await Promise.all([
    s.hasKey ? A.getKey().then(A.getBalance).catch(() => null) : null,
    A.usedToday(),
  ]);
  return { ...s, balance, usedToday: used, creditsUrl: A.CREDITS_URL };
}

export async function GET(req) {
  if (!A.isAiAdmin(await getUserFromRequest(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await payload());
}

export async function PUT(req) {
  const me = await getUserFromRequest(req);
  if (!A.isAiAdmin(me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const user = me.username;
  const b = await req.json().catch(() => ({}));
  const bad = (error) => NextResponse.json({ error }, { status: 400 });

  if (typeof b.dataAccess === 'boolean') {
    await A.setSettings(user, [['assistant_data_access', JSON.stringify({ on: b.dataAccess, by: user, at: A.nowIST() })]]);
    await A.audit(user, b.dataAccess ? 'data_access_on' : 'data_access_off', {});
    return NextResponse.json(await payload());
  }

  if (b.cap !== undefined) {
    const cap = Number(b.cap);
    if (!Number.isInteger(cap) || cap < 1 || cap > 10000) return bad('Daily limit must be a whole number from 1 to 10000.');
    await A.setSettings(user, [['assistant_cap', String(cap)]]);
    await A.audit(user, 'cap', { cap });
    return NextResponse.json(await payload());
  }

  const entries = [];
  const detail = {};
  if (b.model !== undefined) {
    const model = String(b.model).trim();
    if (!model || model.length > 120) return bad('Pick a model.');
    entries.push(['assistant_model', model]); detail.model = model;
  }
  if (b.mode !== undefined) {
    if (!A.MODES.includes(b.mode)) return bad('Unknown answer mode.');
    entries.push(['assistant_mode', b.mode]); detail.mode = b.mode;
  }
  if (entries.length) await A.setSettings(user, entries);

  if (b.key !== undefined) {
    const key = String(b.key).trim();
    if (key && !/^sk-or-\S{8,}$/.test(key)) return bad("That doesn't look like an OpenRouter key (it starts with sk-or-).");
    try { await A.saveKey(user, key); } catch (e) {
      return bad(String(e.message).includes('SETTINGS_ENC_KEY') ? 'The encryption key (SETTINGS_ENC_KEY) is not set on the server, so the key cannot be saved.' : 'Could not save the key.');
    }
    detail.key_changed = key ? 'set' : 'removed'; // never the key itself
  }
  if (Object.keys(detail).length) await A.audit(user, 'settings', detail);
  return NextResponse.json(await payload());
}
