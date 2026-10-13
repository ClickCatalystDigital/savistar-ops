import { NextResponse } from 'next/server';
import { queryAll, execute } from '@/lib/db';
import { getUserFromRequest, isStaff } from '@/lib/auth';

// Staff only ever see the entries they created themselves — owners/admins/managers see
// everything. The filter lives here so the UI (CashTab) needs no scoping logic of its own.
export async function GET(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // optional YYYY-MM filter
  const conditions = [];
  const args = [];
  if (month) { conditions.push(`strftime('%Y-%m', date) = ?`); args.push(month); }
  if (isStaff(user)) { conditions.push('created_by = ?'); args.push(user.username); }
  const where = conditions.length ? `AND ${conditions.join(' AND ')}` : '';
  const [rows, totals] = await Promise.all([
    queryAll(`SELECT t.*,
        (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'cash_transaction'
          AND a.entity_id = t.id AND a.is_deleted_record = 0) AS attachment_count
      FROM cash_transactions t
      WHERE t.is_deleted_record = 0 ${where}
      ORDER BY t.date DESC, t.id DESC`, args),
    queryAll(`SELECT
        COALESCE(SUM(CASE WHEN kind = 'credit' THEN amount END), 0) AS total_credit,
        COALESCE(SUM(CASE WHEN kind = 'debit' THEN amount END), 0) AS total_debit
      FROM cash_transactions WHERE is_deleted_record = 0 ${where}`, args),
  ]);
  const balance = totals[0].total_credit - totals[0].total_debit;
  return NextResponse.json({ rows, balance, ...totals[0] });
}

export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json();
  if (!b.date || !b.kind || !b.amount) {
    return NextResponse.json({ error: 'date, kind and amount required' }, { status: 400 });
  }
  if (!['credit', 'debit'].includes(b.kind)) {
    return NextResponse.json({ error: 'kind must be credit or debit' }, { status: 400 });
  }
  const { lastId } = await execute(
    `INSERT INTO cash_transactions (date, kind, amount, party, party_type, party_id, description, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.date, b.kind, b.amount, b.party || null, b.party_type || null, b.party_id || null,
     b.description || null, user.username]);
  return NextResponse.json({ id: lastId });
}
