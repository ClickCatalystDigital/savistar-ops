// app/api/users/[id]/avatar/route.js

import { NextResponse } from 'next/server';
import { queryAll, execute } from '@/lib/db';
import { getUserFromRequest, requireApprover } from '@/lib/auth';
import { uploadToR2, deleteFromR2, isR2Configured } from '@/lib/r2';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB

// WebP files start with "RIFF" (bytes 0-3) and "WEBP" (bytes 8-11) — checked
// server-side so a renamed/mislabeled file can't slip past client-side checks.
function isWebp(buffer) {
  if (buffer.length < 12) return false;
  return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
}

export async function POST(req, ctx) {
  const params = await ctx.params;
  const guard = requireApprover(await getUserFromRequest(req));
  if (guard) return guard;

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File storage is not configured' }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  if (buffer.length > MAX_AVATAR_BYTES) return NextResponse.json({ error: 'Image must be under 2MB' }, { status: 400 });
  if (!isWebp(buffer)) return NextResponse.json({ error: 'File must be a .webp image' }, { status: 400 });

  const rows = await queryAll('SELECT avatar_image_key FROM users WHERE id = ?', [params.id]);
  const previousUrl = rows[0]?.avatar_image_key;

  // No slash in the filename — deleteFromR2 only recovers the last path segment,
  // so a flat filename is what keeps future cleanup working correctly.
  let url;
  try { url = await uploadToR2(buffer, `avatar-${params.id}.webp`, 'image/webp'); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.status || 502 }); }

  await execute('UPDATE users SET avatar_image_key = ? WHERE id = ?', [url, params.id]);
  if (previousUrl) await deleteFromR2(previousUrl).catch(() => {}); // best-effort cleanup

  return NextResponse.json({ avatar_url: url });
}

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  const guard = requireApprover(await getUserFromRequest(req));
  if (guard) return guard;

  const rows = await queryAll('SELECT avatar_image_key FROM users WHERE id = ?', [params.id]);
  const url = rows[0]?.avatar_image_key;

  await execute('UPDATE users SET avatar_image_key = NULL WHERE id = ?', [params.id]);
  if (url) await deleteFromR2(url).catch(() => {});

  return NextResponse.json({ ok: true });
}