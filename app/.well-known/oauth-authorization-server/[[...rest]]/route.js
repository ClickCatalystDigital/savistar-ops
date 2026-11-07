// The sign-in server's addresses for AI apps (lib/oauth.js).
import { originOf, authServerMetadata } from '@/lib/oauth';
export function GET(req) {
  if (process.env.DEMO_MODE === '1') return new Response('Not found', { status: 404 });
  return Response.json(authServerMetadata(originOf(req)), { headers: { 'Access-Control-Allow-Origin': '*' } });
}
