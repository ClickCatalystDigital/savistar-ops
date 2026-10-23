// Site dimensions → quantity, so nobody multiplies 7'6" × 8' in their head. Pure; runs in the browser.
//   sq ft / sq m: "7'6" x 8'"  (height × width; more pairs add up: "7'x8' + 3'x8'")
//   running ft / m: "12', 8'6"" or "12' + 8'6""  (lengths add up)
//   nos / set / point: "3" or "2 + 1"
// Lengths: 7'6", 7' 6", 7.5', 90" (inches), 2100mm, 210cm, 2.1m. A bare number is feet, unless it is
// 100 or more, which is read as millimetres (no room is 100 ft wide; 2100 is a common mm height).
// ponytail: that cut-off is a heuristic; anyone can type the unit to be exact.

const MM_PER_FT = 304.8;

// One length → millimetres, or NaN.
export function parseLength(raw) {
  const s = String(raw).trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/''/g, '"');
  let m;
  if ((m = /^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/.exec(s))) return (Number(m[1]) * 12 + Number(m[2] || 0)) * 25.4;
  if ((m = /^(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/.exec(s))) return Number(m[1]) * 25.4;
  if ((m = /^(\d+(?:\.\d+)?)\s*mm$/.exec(s))) return Number(m[1]);
  if ((m = /^(\d+(?:\.\d+)?)\s*cm$/.exec(s))) return Number(m[1]) * 10;
  if ((m = /^(\d+(?:\.\d+)?)\s*m$/.exec(s))) return Number(m[1]) * 1000;
  if ((m = /^(\d+(?:\.\d+)?)\s*(?:ft|feet)$/.exec(s))) return Number(m[1]) * MM_PER_FT;
  if ((m = /^(\d+(?:\.\d+)?)$/.exec(s))) return Number(m[1]) >= 100 ? Number(m[1]) : Number(m[1]) * MM_PER_FT;
  return NaN;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Quantity in the line's unit, or null when the text can't be read for that unit.
export function qtyFromDims(text, unit) {
  const parts = String(text || '').split(/\+|,|;/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (unit === 'sqft' || unit === 'sqm') {
    let area = 0; // mm²
    for (const p of parts) {
      const sides = p.split(/\s*[x×*]\s*/i);
      if (sides.length !== 2) return null;
      const [a, b] = sides.map(parseLength);
      if (!(a > 0 && b > 0)) return null;
      area += a * b;
    }
    return round2(unit === 'sqft' ? area / (MM_PER_FT * MM_PER_FT) : area / 1e6);
  }
  if (unit === 'rft' || unit === 'rm') {
    let len = 0;
    for (const p of parts) {
      const l = parseLength(p);
      if (!(l > 0)) return null;
      len += l;
    }
    return round2(unit === 'rft' ? len / MM_PER_FT : len / 1000);
  }
  if (unit === 'nos' || unit === 'set' || unit === 'point') {
    let n = 0;
    for (const p of parts) {
      if (!/^\d+$/.test(p)) return null;
      n += Number(p);
    }
    return n;
  }
  return null;
}
