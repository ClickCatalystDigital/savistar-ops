// Generic file attachments: upload to R2, link to any entity (cash_transaction, order, …).
import { NextResponse } from 'next/server';
import { queryAll, queryOne, execute, softDelete } from '@/lib/db';
import { uploadToR2, isR2Configured } from '@/lib/r2';
import { getUserFromRequest, canAccessCash } from '@/lib/auth';

// Cash-transaction attachments are financial data — staff can attach files to their own
// cash entries (and to orders, site visits, etc. through this same generic endpoint), but
// never to a cash transaction someone else created.
async function guardCashEntity(user, entityType, entityId) {
  if (entityType !== 'cash_transaction') return null;
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const txn = await queryOne('SELECT created_by FROM cash_transactions WHERE id = ?', [entityId]);
  if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canAccessCash(user, txn.created_by)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('entity_type');
  const id = searchParams.get('entity_id');
  if (!type || !id) return NextResponse.json({ error: 'entity_type and entity_id required' }, { status: 400 });
  const guard = await guardCashEntity(await getUserFromRequest(req), type, id);
  if (guard) return guard;
  const rows = await queryAll(
    `SELECT * FROM attachments WHERE entity_type = ? AND entity_id = ?
     AND is_deleted_record = 0 ORDER BY id DESC`, [type, id]);
  return NextResponse.json(rows);
}

export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!isR2Configured()) {
    return NextResponse.json({ error: 'File storage not configured (R2_* env vars missing)' }, { status: 503 });
  }
  const form = await req.formData();
  const file = form.get('file');
  const entityType = form.get('entity_type');
  const entityId = form.get('entity_id');
  if (!file || !entityType || !entityId) {
    return NextResponse.json({ error: 'file, entity_type and entity_id required' }, { status: 400 });
  }
  const guard = await guardCashEntity(user, entityType, entityId);
  if (guard) return guard;
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'Max file size is 20 MB' }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadToR2(buffer, file.name, file.type);
  const { lastId } = await execute(
    'INSERT INTO attachments (entity_type, entity_id, file_url, name, uploaded_by) VALUES (?, ?, ?, ?, ?)',
    [entityType, entityId, url, file.name, user?.username || null]);
  return NextResponse.json({ id: lastId, file_url: url, name: file.name });
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const row = await queryOne('SELECT * FROM attachments WHERE id = ? AND is_deleted_record = 0', [id]);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const guard = await guardCashEntity(await getUserFromRequest(req), row.entity_type, row.entity_id);
  if (guard) return guard;
  // File stays in R2 so a restored row still resolves.
  await softDelete('attachments', id);
  return NextResponse.json({ ok: true });
}
