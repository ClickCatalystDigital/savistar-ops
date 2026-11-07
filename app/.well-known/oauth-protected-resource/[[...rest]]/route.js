// Where an AI app learns that /mcp signs in here (lib/oauth.js). Also answers at /.well-known/oauth-protected-resource/mcp.
import { originOf, resourceMetadata } from '@/lib/oauth';
export function GET(req) {
  if (process.env.DEMO_MODE === '1') return new Response('Not found', { status: 404 });
  return Response.json(resourceMetadata(originOf(req)), { headers: { 'Access-Control-Allow-Origin': '*' } });
}
