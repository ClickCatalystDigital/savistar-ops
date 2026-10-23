// Self-check for quotations and the BOQ library: the pure logic behind the editor, the API and the PDF.
//   node --no-warnings scripts/check-quotations.mjs
import assert from 'node:assert/strict';
import { BOQ_LIBRARY, BOQ_LIBRARY_VERSION } from '../lib/boq-library.js';
import { planSync, differs } from '../lib/boq-sync.js';
import { matchItem, checkLine, linesFromPaste, normalizeUnit, parseNum, SPEC } from '../lib/boq-check.js';
import { parseLength, qtyFromDims } from '../lib/dims.js';
import { quoteTotals, roomTotals, stageInvoiceLines, fyOf, nextQuoteNo, displayStatus, amountInWords, lineAmount } from '../lib/quote-math.js';

// Library rows as the DB holds them (ids added).
const lib = BOQ_LIBRARY.map((c, i) => ({ id: i + 1, source: 'library', edited: 0, hidden: 0, ...c }));
const byLib = (id) => lib.find((r) => r.library_id === id);

// --- Central library: every spec key known, every sample line passes its own checks.
assert.ok(BOQ_LIBRARY.length >= 40 && /^[0-9a-f]{10}$/.test(BOQ_LIBRARY_VERSION));
for (const r of lib) {
  for (const k of r.spec_keys.split(',').filter(Boolean)) assert.ok(SPEC[k], `${r.library_id}: unknown spec ${k}`);
  const line = { description: r.description.replace(/[[\]]/g, ''), unit: r.unit, qty: 1 };
  assert.equal(matchItem(line.description, lib)?.library_id, r.library_id, `${r.library_id} matches its own line`);
  assert.deepEqual(checkLine(line, r).map((f) => f.key), [], `${r.library_id}: own line flagged`);
}

// --- Sync: insert what's new, update untouched library rows, never touch edited or own rows.
{
  const rows = [
    { ...byLib('wardrobes.hinged'), edited: 1, description: 'Our wording' },        // edited → kept
    { ...byLib('wardrobes.loft'), description: 'old central text' },                // untouched, stale → updated
    { id: 900, library_id: null, source: 'own', name: 'Pooja unit', unit: 'nos' }, // own → kept
    { ...byLib('civil.demolition') },                                                 // up to date → nothing
  ];
  const plan = planSync(rows, BOQ_LIBRARY, 'v2');
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].id, byLib('wardrobes.loft').id);
  assert.equal(plan.inserts.length, BOQ_LIBRARY.length - 3);
  assert.ok(!plan.inserts.some((c) => ['wardrobes.hinged', 'wardrobes.loft', 'civil.demolition'].includes(c.library_id)));
  assert.ok(differs({ ...byLib('wardrobes.hinged'), description: 'x' }, BOQ_LIBRARY.find((c) => c.library_id === 'wardrobes.hinged')));
  assert.equal(planSync(lib, BOQ_LIBRARY, 'v1').inserts.length + planSync(lib, BOQ_LIBRARY, 'v1').updates.length, 0, 'in sync = no writes');
}

// --- Matching and checks against the studio's library (hidden items are skipped).
assert.equal(matchItem('Loft above wardrobe', lib)?.library_id, 'wardrobes.loft');
assert.equal(matchItem('Granite countertop', lib)?.library_id, 'modular-kitchen.countertop');
assert.equal(matchItem('Loft above wardrobe', lib.map((r) => (r.library_id === 'wardrobes.loft' ? { ...r, hidden: 1 } : r)))?.library_id, 'wardrobes.hinged');
{
  const item = byLib('wardrobes.hinged');
  const flags = checkLine({ description: 'Wardrobe in ply with laminate', unit: 'sqft', qty: 64 }, item);
  const keys = flags.map((f) => f.key);
  assert.ok(keys.includes('spec:board') && keys.includes('spec:thickness') && keys.includes('basis'));
  assert.ok(!keys.includes('spec:finish'), 'laminate is a finish');
  // Dismissed flags stay dismissed; typed dimensions count as a measurement basis.
  assert.ok(!checkLine({ description: 'Wardrobe in ply with laminate', unit: 'sqft', qty: 64, dismissed_flags: 'spec:board,basis' }, item).some((f) => ['spec:board', 'basis'].includes(f.key)));
  assert.ok(!checkLine({ description: 'Wardrobe in ply with laminate', unit: 'sqft', qty: 64, dims: "7' x 8'" }, item).some((f) => f.key === 'basis'));
  assert.ok(checkLine({ description: 'Wardrobe 18 mm BWP ply, laminate, 2 mm PVC edge band, Hettich, measured by elevation', unit: 'point', qty: 2 }, item).some((f) => f.key === 'unit'));
}

// --- Paste from Excel: header row, room headings, units as people write them.
{
  const lines = linesFromPaste(['S.No\tDescription\tUnit\tQty\tRate', '\tKITCHEN\t\t\t', '1\tGranite countertop 20 mm\tRFT\t14\t1,600', '\tBEDROOM\t\t\t', '2\tLoft above wardrobe\tSq.Ft.\t24\t950'].join('\n'), lib);
  assert.deepEqual(lines.map((l) => [l.section, l.unit, l.qty, l.rate]), [['KITCHEN', 'rft', 14, 1600], ['BEDROOM', 'sqft', 24, 950]]);
  assert.equal(lines[1].boq_item_id, byLib('wardrobes.loft').id);
}
assert.equal(normalizeUnit('Nos.'), 'nos');
assert.equal(parseNum('₹ 1,25,000.50'), 125000.5);

// --- Dimensions → quantity.
assert.equal(Math.round(parseLength(`7'6"`)), 2286);
assert.equal(parseLength('2100'), 2100);   // ≥ 100 → mm
assert.equal(Math.round(parseLength('8')), 2438); // bare small number → feet
assert.equal(qtyFromDims(`7'6" x 8'`, 'sqft'), 60);
assert.equal(qtyFromDims(`7'x8' + 3'x8'`, 'sqft'), 80);
assert.equal(qtyFromDims('2100 x 1800', 'sqm'), 3.78);
assert.equal(qtyFromDims(`12', 8'6"`, 'rft'), 20.5);
assert.equal(qtyFromDims('2 + 1', 'nos'), 3);
assert.equal(qtyFromDims('7 x', 'sqft'), null);
assert.equal(qtyFromDims('12', 'ls'), null);

// --- Totals, rooms, tax split, optional lines left out.
{
  const items = [
    { section: 'Kitchen', qty: 14, rate: 4800, gst_pct: 18 },
    { section: 'Kitchen', qty: 1, rate: 10000, gst_pct: 18, optional: 1 },
    { section: 'Bedroom', qty: 64, rate: 1450, gst_pct: 18 },
    { section: 'Bedroom', qty: 2, rate: 5000, gst_pct: 12 },
  ];
  const same = quoteTotals(items, 'same_state');
  assert.equal(same.subtotal, 67200 + 92800 + 10000);
  assert.deepEqual(same.taxes, [
    { label: 'CGST @ 6%', amount: 600 }, { label: 'SGST @ 6%', amount: 600 },
    { label: 'CGST @ 9%', amount: 14400 }, { label: 'SGST @ 9%', amount: 14400 },
  ]);
  assert.equal(same.total, 170000 + 30000);
  const other = quoteTotals(items, 'other_state');
  assert.deepEqual(other.taxes, [{ label: 'IGST @ 12%', amount: 1200 }, { label: 'IGST @ 18%', amount: 28800 }]);
  assert.equal(other.total, same.total);
  assert.deepEqual(roomTotals(items).map((r) => [r.name, r.subtotal]), [['Kitchen', 67200], ['Bedroom', 102800]]);
  // Stage invoice: 40% of the pre-tax value, one line per GST rate, naming the quote.
  const lines = stageInvoiceLines(items, { label: 'Advance with order', pct: 40 }, 'SAV/Q/26-27/003');
  assert.deepEqual(lines.map((l) => [l.gst_pct, l.unit_price]), [[18, 64000], [12, 4000]]);
  assert.match(lines[0].description, /^Advance with order: 40% against quotation SAV\/Q\/26-27\/003 \(items at 18% GST\)$/);
  assert.equal(stageInvoiceLines(items.slice(0, 3), { label: 'Advance', pct: 40 }, 'Q1')[0].description, 'Advance: 40% against quotation Q1');
  assert.equal(lineAmount({ qty: 2.5, rate: 99.99 }), 249.98);
}

// --- Numbering, financial year, expiry, words.
assert.equal(fyOf('2026-10-23'), '26-27');
assert.equal(fyOf('2027-03-31'), '26-27');
assert.equal(fyOf('2027-04-01'), '27-28');
assert.equal(nextQuoteNo('SAV', '26-27', []), 'SAV/Q/26-27/001');
assert.equal(nextQuoteNo('SAV', '26-27', ['SAV/Q/26-27/007', 'SAV/Q/25-26/020', 'SAAG/Q/26-27/030', null]), 'SAV/Q/26-27/008');
assert.equal(displayStatus({ status: 'sent', valid_until: '2026-10-01' }, '2026-10-23'), 'expired');
assert.equal(displayStatus({ status: 'accepted', valid_until: '2026-10-01' }, '2026-10-23'), 'accepted');
assert.equal(amountInWords(125000), 'Rupees One Lakh Twenty Five Thousand Only');
assert.equal(amountInWords(12345678.5), 'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only');

console.log(`quotations: ${lib.length} library items, checks OK`);
