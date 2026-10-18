// A person's private notes for the assistant. Only the author reads, adds or deletes their own.
// Saved from the chat's draft card ("note that …"); listed with delete under Settings → My assistant.
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/db';

export async function GET(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json(await queryAll(`SELECT n.id, n.body, n.created_at, c.name AS client FROM assistant_notes n
    LEFT JOIN clients c ON c.id = n.client_id WHERE n.username = ? ORDER BY n.id DESC`, [user.username]));
}

export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const body = String(b.body || '').trim().slice(0, 1000);
  if (!body) return NextResponse.json({ error: 'Write something to note.' }, { status: 400 });
  const clientId = Number.isInteger(b.client_id) && (await queryOne('SELECT id FROM clients WHERE id = ? AND is_deleted_record = 0', [b.client_id])) ? b.client_id : null;
  const { lastId } = await execute('INSERT INTO assistant_notes (username, body, client_id) VALUES (?, ?, ?)', [user.username, body, clientId]);
  return NextResponse.json({ id: lastId });
}

export async function DELETE(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  await execute('DELETE FROM assistant_notes WHERE id = ? AND username = ?', [id, user.username]);
  return NextResponse.json({ ok: true });
}
