// lib/format.js — pure formatters, safe to import from both server and client components.
import { LOCALE, CURRENCY, US } from './market.js';

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  // US demo: stored strings are already the business's wall-clock time, so show that calendar date as written.
  if (US) return new Date((dateStr.length <= 10 ? dateStr + 'T00:00:00' : dateStr.replace(' ', 'T')) + 'Z').toLocaleDateString(LOCALE, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const d = new Date(dateStr.length <= 10 ? dateStr + 'T00:00:00+05:30' : dateStr.replace(' ', 'T') + '+05:30');
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function capitalize(s) {
  return s ? (s.charAt(0).toUpperCase() + s.slice(1)).replaceAll('_', ' ') : s;
}

// Indian-format money: ₹42L / ₹4.2Cr.
export function formatMoney(n) {
  if (!n) return '—';
  // US demo: $1.25M above a million, else the full amount ($87,200).
  if (US) return n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.00$/, '')}M` : `$${n.toLocaleString(LOCALE)}`;
  if (n >= 1e7) return `${CURRENCY}${(n / 1e7).toFixed(2).replace(/\.00$/, '')}Cr`;
  if (n >= 1e5) return `${CURRENCY}${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  return `${CURRENCY}${n.toLocaleString(LOCALE)}`;
}
