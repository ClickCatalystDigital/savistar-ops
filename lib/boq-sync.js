// Keeps Savistar's own BOQ library (table boq_items) in step with the central one from Ahrom Labs
// (lib/boq-library.js) without ever overwriting what Savistar changed. The rule, as in the items
// project's BYOB: the customer owns its master; we link to it.
//   - a central item they don't have yet → insert it
//   - a library row they never edited → update it to the central text
//   - a row they edited, their own rows, and rows whose central item was removed → never touched
// Edited rows whose central text moved on are offered back in the library page ("Use library version").
// Pure: returns the writes; lib/db.js migrate() runs them. Self-check: node scripts/check-quotations.mjs

export const SYNC_FIELDS = ['trade', 'name', 'unit', 'units', 'basis_required', 'measure', 'spec_keys', 'omits', 'description', 'match'];

export const differs = (row, central) => SYNC_FIELDS.some((f) => String(row[f] ?? '') !== String(central[f] ?? ''));

export function planSync(rows, central, version) {
  const byLib = new Map(rows.filter((r) => r.library_id).map((r) => [r.library_id, r]));
  const inserts = [], updates = [];
  for (const c of central) {
    const row = byLib.get(c.library_id);
    if (!row) inserts.push(c);
    else if (row.source === 'library' && !Number(row.edited) && differs(row, c)) updates.push({ id: row.id, ...c });
  }
  return { inserts, updates, version };
}
