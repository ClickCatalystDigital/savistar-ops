// app/api/demo-files/[...key]/route.js — public demo only: serves a file the owner uploaded to the demo
// bucket (lib/r2.js), e.g. a user's picture. Signed-in demo users only (middleware), demo folder only.
import { NextResponse } from 'next/server';
import { demoBucket, isDemoFileKey } from '@/lib/r2';

export async function GET(req, ctx) {
  const bucket = demoBucket();
  const key = (await ctx.params).key.join('/');
  if (!bucket || !isDemoFileKey(key)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const obj = await bucket.get(key);
  if (!obj) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // The key has a timestamp in it and is replaced on every upload, so it can be cached hard.
  return new NextResponse(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private, max-age=604800' } });
}
