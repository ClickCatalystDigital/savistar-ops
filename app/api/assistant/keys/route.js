import { randomBytes, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { isAiAdmin } from '@/lib/assistant';
import { queryAll, execute } from '@/lib/db';

// AI app keys (Settings → My assistant), owners and admins: a key lets an AI app (Claude, via /mcp) act as its maker.
// The key is shown once; only its SHA-256 is stored. Each person sees and revokes only their own.
async function who(req) {
  const user = await getUserFromRequest(req);
  return isAiAdmin(user) ? user : null;
}
const forbidden = () => NextResponse.json({ error: 'Owners and admins only' }, { status: 403 });

export async function GET(req) {
  const user = await who(req);
  if (!user) return forbidden();
  return NextResponse.json(await queryAll('SELECT id, name, created_at, last_used_at FROM api_keys WHERE username = ? AND revoked = 0 ORDER BY id DESC', [user.username]));
}

export async function POST(req) {
  const user = await who(req);
  if (!user) return forbidden();
  const { name } = await req.json().catch(() => ({}));
  if (!String(name || '').trim()) return NextResponse.json({ error: 'Give the key a name, e.g. "Claude on my laptop"' }, { status: 400 });
  const key = `dops_${randomBytes(24).toString('base64url')}`;
  const { lastId } = await execute('INSERT INTO api_keys (username, name, hash) VALUES (?, ?, ?)', [user.username, String(name).trim().slice(0, 60), createHash('sha256').update(key).digest('hex')]);
  return NextResponse.json({ id: lastId, key, url: new URL('/mcp', req.url).href });
}

export async function DELETE(req) {
  const user = await who(req);
  if (!user) return forbidden();
  const id = Number(new URL(req.url).searchParams.get('id'));
  await execute('UPDATE api_keys SET revoked = 1 WHERE id = ? AND username = ?', [id, user.username]);
  return NextResponse.json({ ok: true });
}
