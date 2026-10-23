// Quotation arithmetic and defaults, shared by the editor, the API, the PDF and the self-check.
// Totals are always worked out from the lines, never stored (same rule as invoices).
// Pure; runs in the browser. Self-check: node scripts/check-quotations.mjs

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const lineAmount = (it) => round2((Number(it.qty) || 0) * (Number(it.rate) || 0));

// Optional lines (release 2) are shown but never counted.
const counted = (items) => items.filter((it) => !Number(it.optional));

// Tax by GST rate, then split: same state → CGST + SGST (half each), other state → IGST.
// Paise are rounded per tax line, as on a GST invoice.
export function quoteTotals(items, placeOfSupply = 'same_state') {
  const byRate = new Map();
  let subtotal = 0;
  for (const it of counted(items)) {
    const amt = lineAmount(it);
    subtotal += amt;
    const r = Number(it.gst_pct) || 0;
    byRate.set(r, (byRate.get(r) || 0) + amt);
  }
  const taxes = [];
  for (const [rate, base] of [...byRate].sort((a, b) => a[0] - b[0])) {
    if (!rate) continue;
    if (placeOfSupply === 'other_state') taxes.push({ label: `IGST @ ${rate}%`, amount: round2((base * rate) / 100) });
    else {
      taxes.push({ label: `CGST @ ${rate / 2}%`, amount: round2((base * rate) / 200) });
      taxes.push({ label: `SGST @ ${rate / 2}%`, amount: round2((base * rate) / 200) });
    }
  }
  subtotal = round2(subtotal);
  const tax = round2(taxes.reduce((s, t) => s + t.amount, 0));
  return { subtotal, taxes, tax, total: round2(subtotal + tax) };
}

// Rooms in the order they first appear, each with its counted subtotal.
export function roomTotals(items) {
  const rooms = new Map();
  for (const it of items) {
    const name = (it.section || '').trim() || 'General';
    if (!rooms.has(name)) rooms.set(name, { name, items: [], subtotal: 0 });
    const room = rooms.get(name);
    room.items.push(it);
    if (!Number(it.optional)) room.subtotal = round2(room.subtotal + lineAmount(it));
  }
  return [...rooms.values()];
}

// A stage invoice: pct of the quote's pre-tax value, one line per GST rate so the invoice taxes it the
// same way the quote did. Description names the stage and the quote it comes from.
export function stageInvoiceLines(items, stage, quoteRef) {
  const byRate = new Map();
  for (const it of counted(items)) {
    const r = Number(it.gst_pct) || 0;
    byRate.set(r, (byRate.get(r) || 0) + lineAmount(it));
  }
  const rates = [...byRate].sort((a, b) => b[1] - a[1]);
  return rates.map(([rate, base]) => ({
    description: `${stage.label}: ${stage.pct}% against quotation ${quoteRef}${rates.length > 1 ? ` (items at ${rate}% GST)` : ''}`,
    hsn: '',
    gst_pct: rate,
    qty: 1,
    unit_price: round2((base * Number(stage.pct)) / 100),
  }));
}

// Indian financial year of an ISO date: 2026-10-23 → "26-27", 2027-02-01 → "26-27".
export function fyOf(iso) {
  const [y, m] = String(iso).split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

// Next number in a company's series for the year: SAV/Q/26-27/001, 002, … (gaps are fine; never reused).
export function nextQuoteNo(prefix, fy, existing) {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/Q/${fy}/(\\d+)$`);
  const max = existing.reduce((m, no) => { const x = re.exec(no || ''); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${prefix}/Q/${fy}/${String(max + 1).padStart(3, '0')}`;
}

// What a list shows: a sent quote past its validity reads as expired (worked out, not stored).
export function displayStatus(q, today) {
  return q.status === 'sent' && q.valid_until && q.valid_until < today ? 'expired' : q.status;
}

export const STATUS_LABEL = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', superseded: 'Superseded', expired: 'Expired' };

// Defaults a studio changes per quote. Ahrom Labs' starting point (QUOTATIONS-PLAN.md), not Savistar's yet.
export const DEFAULT_STAGES = [
  { label: 'Advance with order', pct: 40 },
  { label: 'Material delivered to site', pct: 40 },
  { label: 'On handover', pct: 20 },
];
export const DEFAULT_VALID_DAYS = 15;
export const DEFAULT_TERMS = [
  'Prices are valid for 15 days from the quotation date.',
  'GST is charged as shown; any change in the GST rate applies on the date of invoice.',
  'Quantities are from drawings; final bills follow measurement at site on the basis stated in each line.',
  'Work not listed here, or changed after acceptance, is quoted separately as a variation.',
  'Electricity, water and storage space at site are provided by the client.',
].join('\n');

// Indian numbering (lakh, crore), as in shanti-ops lib/service-expense.mjs.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n) => (n < 100 ? below100(n) : `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${below100(n % 100)}` : ''}`);

export function amountInWords(amount) {
  if (!amount) return '';
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  const parts = [];
  const crore = Math.floor(rupees / 10000000), lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000), rest = rupees % 1000;
  if (crore) parts.push(`${crore < 1000 ? below1000(crore) : String(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return `Rupees ${parts.join(' ') || 'Zero'}${paise ? ` and ${below100(paise)} Paise` : ''} Only`;
}
