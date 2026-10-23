// The studio's BOQ library (table boq_items). Everyone reads it (the quote editor's picker); owners,
// admins and managers add their own items. Most used and most recent first within a trade.
import { NextResponse } from 'next/server';
import { queryAll, execute } from '@/lib/db';
import { getUserFromRequest, requireApprover } from '@/lib/auth';
import { BOQ_LIBRARY } from '@/lib/boq-library';
import { differs } from '@/lib/boq-sync';

export async function GET() {
  const rows = await queryAll(
    `SELECT b.*,
       (SELECT COUNT(*) FROM quotation_items qi JOIN quotations q ON q.id = qi.quotation_id
         WHERE qi.boq_item_id = b.id AND qi.is_deleted_record = 0 AND q.is_deleted_record = 0) AS used,
       (SELECT MAX(q.quoted_on) FROM quotation_items qi JOIN quotations q ON q.id = qi.quotation_id
         WHERE qi.boq_item_id = b.id AND qi.is_deleted_record = 0 AND q.is_deleted_record = 0) AS last_used
     FROM boq_items b WHERE b.is_deleted_record = 0
     ORDER BY b.trade, used DESC, last_used DESC, b.name`);
  // An item they reworded whose central text has since changed: offered back on the library page.
  const central = new Map(BOQ_LIBRARY.map((c) => [c.library_id, c]));
  for (const r of rows) {
    const c = r.library_id && central.get(r.library_id);
    r.central_newer = !!(c && Number(r.edited) && differs(r, c));
    if (r.central_newer) r.central = c;
  }
  return NextResponse.json(rows);
}

export async function POST(req) {
  const user = await getUserFromRequest(req);
  const denied = requireApprover(user);
  if (denied) return denied;
  const b = await req.json();
  if (!b.name?.trim() || !b.unit) return NextResponse.json({ error: 'Name and unit are required' }, { status: 400 });
  const { lastId } = await execute(
    `INSERT INTO boq_items (source, trade, name, unit, units, basis_required, measure, spec_keys, omits, description, match, updated_by, updated_at)
     VALUES ('own', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [b.trade?.trim() || 'Other', b.name.trim(), b.unit, b.units || null, b.basis_required ? 1 : 0, b.measure?.trim() || null,
     b.spec_keys || null, b.omits?.trim() || null, b.description?.trim() || null, (b.match || b.name).toLowerCase().trim(), user.username]);
  return NextResponse.json({ id: lastId });
}
