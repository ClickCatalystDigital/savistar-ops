// Bank statements: list + upload (PDF → R2 → async AI extraction).
import { NextResponse } from 'next/server';
import { queryAll, queryOne, execute } from '@/lib/db';

const PAGE_SIZES = [10, 20, 30, 50, 100];
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

  const { searchParams } = new URL(req.url);
  const pageSize = PAGE_SIZES.includes(Number(searchParams.get('pageSize'))) ? Number(searchParams.get('pageSize')) : 20;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  // ?month=YYYY-MM: statements whose period overlaps that month (dates are YYYY-MM-DD strings,
  // so '-31' is a safe month end for the comparison even in short months).
  const month = /^\d{4}-\d{2}$/.test(searchParams.get('month') || '') ? searchParams.get('month') : null;
  const account = searchParams.get('account') || null; // extracted account_no, not the typed label
  const conds = ['is_deleted_record = 0'], args = [];
  if (month) { conds.push('statement_from <= ? AND statement_to >= ?'); args.push(`${month}-31`, `${month}-01`); }
  if (account) { conds.push('account_no = ?'); args.push(account); }
  const where = conds.join(' AND ');

  // Every account seen so far, for the filter: label from its newest statement.
  const accounts = await queryAll(
    `SELECT account_no, COUNT(*) AS statements,
       (SELECT d2.bank_name FROM documents d2 WHERE d2.account_no = d.account_no AND d2.is_deleted_record = 0
        ORDER BY d2.created_at DESC LIMIT 1) AS bank_name
     FROM documents d WHERE is_deleted_record = 0 AND account_no IS NOT NULL AND account_no != ''
     GROUP BY account_no ORDER BY bank_name, account_no`);

  const { total } = await queryOne(`SELECT COUNT(*) AS total FROM documents WHERE ${where}`, args);
  const rows = await queryAll(
    `SELECT id, doc_type, original_filename, file_url, status, bank_name, account_no,
       statement_from, statement_to, opening_balance, closing_balance, total_debit, total_credit,
       extract_error, uploaded_by, created_at
     FROM documents WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize]);
  return NextResponse.json({ rows, total, page, pageSize, accounts });
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
