// /mcp — Designer Ops for Claude or any MCP client, acting as the person whose AI app key is sent
// (Authorization: Bearer <key>, made in Settings → My assistant). Tools: lib/mcp-tools.js. Off in the public demo.
import { createHash } from 'node:crypto';
import { handle } from '@/lib/mcp';
import { TOOLS, INSTRUCTIONS } from '@/lib/mcp-tools';
import { queryOne, execute } from '@/lib/db';

const server = { name: 'designer-ops', tools: TOOLS, instructions: INSTRUCTIONS };

async function keyUser(req) {
  const key = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!key) return null;
  const hash = createHash('sha256').update(key).digest('hex');
  const u = await queryOne(`SELECT u.id, u.username, u.role, u.display_name, k.id AS key_id FROM api_keys k JOIN users u ON u.username = k.username
    WHERE k.hash = ? AND k.revoked = 0`, [hash]);
  if (u) execute('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [u.key_id]).catch(() => {});
  return u;
}

export async function POST(req) {
  if (process.env.DEMO_MODE === '1') return new Response('Not available in the demo', { status: 404 });
  // A web page elsewhere must not drive this (the MCP spec's Origin rule); AI apps send no Origin.
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return new Response('Forbidden', { status: 403 });
  const user = await keyUser(req);
  if (!user) return Response.json({ error: 'Send an AI app key: Authorization: Bearer <key> (Settings → My assistant)' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  if (!req.headers.get('content-type')?.includes('application/json')) return new Response('Expected application/json', { status: 415 });
  let msg;
  try { msg = await req.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
  const res = await handle(msg, server, user);
  return res ? Response.json(res) : new Response(null, { status: 202 });
}

// No server-to-client stream.
export const GET = () => new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
