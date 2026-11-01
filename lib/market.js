// lib/market.js — which country this deployment serves. NEXT_PUBLIC_MARKET is set at build time ('NA' for the
// North American demo, interiors-erp-us.ahromlabs.com) and inlined into server and browser code alike.
// Unset = India, so every existing deployment (Savistar's own app, the Indian demo) behaves exactly as before.
export const MARKET = process.env.NEXT_PUBLIC_MARKET === 'NA' ? 'NA' : 'IN';
export const US = MARKET === 'NA';
export const LOCALE = US ? 'en-US' : 'en-IN';
export const CURRENCY = US ? '$' : '₹';
export const TIME_ZONE = US ? 'America/Chicago' : 'Asia/Kolkata';
// Sales tax for the US demo: one rate on the taxable lines, no CGST/SGST/IGST split.
export const TAX = US ? { name: 'Sales tax', defaultPct: 0 } : { name: 'GST', defaultPct: 18 };

// "YYYY-MM-DD HH:MM:SS" wall-clock time where the business is (the shape the app stores). India's branch is the
// original nowIST arithmetic, byte for byte.
export function localNow(d = new Date()) {
  if (!US) return new Date(d.getTime() + 5.5 * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// Wording for the US demo: what a US studio calls things. India's text is returned exactly as written.
const US_WORDS = [
  [/\bQuotations\b/g, 'Quotes'], [/\bquotations\b/g, 'quotes'], [/\bQuotation\b/g, 'Quote'], [/\bquotation\b/g, 'quote'], [/\bQUOTATION\b/g, 'QUOTE'],
  [/\bBOQ library\b/g, 'Item library'], [/\bBOQs\b/g, 'estimates'], [/\bBOQ\b/g, 'estimate'],
  [/\b(\d) ?BHK\b/g, '$1-bedroom'], [/\bmidnight IST\b/g, 'midnight Central time'],
  [/\bincl\. GST\b/g, 'incl. tax'], [/\bBefore GST\b/g, 'Before tax'], [/\bGST\b/g, 'sales tax'],
  [/\bWhatsApp\b/g, 'text'], [/\bMehta\b/g, 'Miller'], [/\bbungalow\b/g, 'house'],
];
export const w = (text) => (US ? US_WORDS.reduce((s, [from, to]) => s.replace(from, to), text) : text);
