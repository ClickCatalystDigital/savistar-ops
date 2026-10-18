// lib/format.js — pure formatters, safe to import from both server and client components.

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length <= 10 ? dateStr + 'T00:00:00+05:30' : dateStr.replace(' ', 'T') + '+05:30');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function capitalize(s) {
  return s ? (s.charAt(0).toUpperCase() + s.slice(1)).replaceAll('_', ' ') : s;
}

// Indian-format money: ₹42L / ₹4.2Cr.
export function formatMoney(n) {
  if (!n) return '—';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2).replace(/\.00$/, '')}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  return `₹${n.toLocaleString('en-IN')}`;
}
