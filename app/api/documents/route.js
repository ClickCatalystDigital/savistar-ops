// Bank statements: list + upload (PDF → R2 → async AI extraction).
import { NextResponse } from 'next/server';
import { queryAll, execute } from '@/lib/db';
import { uploadToR2, isR2Configured } from '@/lib/r2';
import { runExtraction } from '@/lib/extract';
import { getUserFromRequest, requireNonStaff } from '@/lib/auth';
import { decryptPdf, getSavedPassword, savePassword } from '@/lib/pdfPassword';

export async function GET(req) {
  const guard = requireNonStaff(await getUserFromRequest(req));
  if (guard) return guard;
  // Stale 'reading' rows (server restarted mid-extraction) get failed after 5 min.
  await execute(`UPDATE documents SET status = 'extract_failed', extract_error = 'Timeout'
    WHERE status = 'reading' AND created_at < datetime('now', '-5 minutes') AND is_deleted_record = 0`);
  const rows = await queryAll(
    `SELECT id, doc_type, original_filename, file_url, status, bank_name, account_no,
       statement_from, statement_to, opening_balance, closing_balance, total_debit, total_credit,
       extract_error, uploaded_by, created_at
     FROM documents WHERE is_deleted_record = 0 ORDER BY created_at DESC`);
  return NextResponse.json(rows);
}

export async function POST(req) {
  const user = await getUserFromRequest(req);
  const guard = requireNonStaff(user);
  if (guard) return guard;
  const form = await req.formData();
  const file = form.get('file');
  const bankName = form.get('bank_name') || null;
  const password = form.get('password') || null;
  const remember = form.get('remember') === 'true';
  if (!file) return NextResponse.json({ error: 'No PDF uploaded' }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Max file size is 20 MB' }, { status: 400 });
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'AI extraction not configured (OPENROUTER_API_KEY missing)' }, { status: 503 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const tryPassword = password || await getSavedPassword(bankName);
  let decrypted;
  try {
    decrypted = decryptPdf(buffer, tryPassword);
  } catch {
    return NextResponse.json({
      error: tryPassword ? 'Incorrect password for this PDF' : 'This PDF is password protected',
      code: 'password_required',
    }, { status: 422 });
  }
  if (password && remember) await savePassword(bankName, password, user?.username || null);

  let fileUrl = null;
  if (isR2Configured()) {
    fileUrl = await uploadToR2(buffer, file.name, 'application/pdf'); // original bytes — still password-protected if it was
  }
  const { lastId } = await execute(
    `INSERT INTO documents (doc_type, original_filename, file_url, status, bank_name, uploaded_by)
     VALUES ('bank_statement', ?, ?, 'reading', ?, ?)`,
    [file.name, fileUrl, bankName, user?.username || null]);
  runExtraction(lastId, decrypted); // fire-and-forget; UI polls status
  return NextResponse.json({ id: lastId, status: 'reading' });
}
