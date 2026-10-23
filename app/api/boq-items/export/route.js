// The studio's own items (not the central ones) as CSV, names and descriptions only: no rates, no
// clients. Pujan reviews it and may generalise an item into the Ahrom Labs library (QUOTATIONS-PLAN.md).
import { queryAll } from '@/lib/db';
import { getUserFromRequest, requireApprover } from '@/lib/auth';

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req) {
  const denied = requireApprover(await getUserFromRequest(req));
  if (denied) return denied;
  const rows = await queryAll(`SELECT trade, name, unit, measure, description FROM boq_items WHERE source = 'own' AND is_deleted_record = 0 ORDER BY trade, name`);
  const csv = ['trade,name,unit,measure,description', ...rows.map((r) => [r.trade, r.name, r.unit, r.measure, r.description].map(cell).join(','))].join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="own-boq-items.csv"' } });
}
