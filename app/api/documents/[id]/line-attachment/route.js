// Attach a receipt file to one transaction line of a bank statement (stored in line_items JSON).
import { NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { getDocument } from '@/lib/extract';
import { uploadToR2, deleteFromR2, isR2Configured } from '@/lib/r2';
import { getUserFromRequest, requireNonStaff } from '@/lib/auth';

export async function POST(req, ctx) {
  const params = await ctx.params;
  const guard = requireNonStaff(await getUserFromRequest(req));
  if (guard) return guard;
  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File storage not configured (R2_* env vars missing)' }, { status: 503 });
  }
  const form = await req.formData();
  const file = form.get('file');
  const index = Number(form.get('line_index'));
  const doc = await getDocument(params.id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!file || Number.isNaN(index) || !doc.line_items[index]) {
    return NextResponse.json({ error: 'file and valid line_index required' }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadToR2(buffer, `tx-${file.name}`, file.type);
  doc.line_items[index].attachment_url = url;
  await execute('UPDATE documents SET line_items = ? WHERE id = ?', [JSON.stringify(doc.line_items), params.id]);
  return NextResponse.json({ file_url: url });
}

export async function DELETE(req, ctx) {
  const params = await ctx.params;
  const guard = requireNonStaff(await getUserFromRequest(req));
  if (guard) return guard;
  const { searchParams } = new URL(req.url);
  const index = Number(searchParams.get('line_index'));
  const doc = await getDocument(params.id);
  if (!doc || Number.isNaN(index) || !doc.line_items[index]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const url = doc.line_items[index].attachment_url;
  if (url) { try { await deleteFromR2(url); } catch { /* already gone */ } }
  doc.line_items[index].attachment_url = null;
  await execute('UPDATE documents SET line_items = ? WHERE id = ?', [JSON.stringify(doc.line_items), params.id]);
  return NextResponse.json({ ok: true });
}
