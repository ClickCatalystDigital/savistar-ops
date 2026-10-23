// BOQ line checks for the quote editor: what a line leaves open that lets two people price it
// differently. Ported from ahrom-labs src/lib/boq-check.ts (the /boq/check tool), but it checks
// against Savistar's own library (table boq_items) passed in, not a fixed list. Pure, no I/O:
// runs in the browser. Self-check: node scripts/check-quotations.mjs

export const UNIT_LABEL = {
  sqft: 'sq ft', sqm: 'sq m', rft: 'running ft', rm: 'running m', nos: 'nos', set: 'set', point: 'point', ls: 'lump sum', cum: 'cu m',
};
export const UNITS = Object.keys(UNIT_LABEL);

// Spellings seen in real BOQs, lower-cased with dots and spaces dropped.
const UNIT_ALIASES = {
  sqft: 'sqft', sft: 'sqft', sqf: 'sqft', ft2: 'sqft', squarefeet: 'sqft', squarefoot: 'sqft', sf: 'sqft',
  sqm: 'sqm', sqmt: 'sqm', m2: 'sqm', squaremetre: 'sqm', squaremeter: 'sqm', smt: 'sqm',
  rft: 'rft', rf: 'rft', runningft: 'rft', runningfeet: 'rft', runningfoot: 'rft', lft: 'rft', ft: 'rft',
  rm: 'rm', rmt: 'rm', runningm: 'rm', runningmetre: 'rm', runningmeter: 'rm', mtr: 'rm', m: 'rm',
  nos: 'nos', no: 'nos', nr: 'nos', each: 'nos', ea: 'nos', pcs: 'nos', pc: 'nos', unit: 'nos', units: 'nos',
  set: 'set', sets: 'set', pair: 'set',
  point: 'point', points: 'point', pt: 'point', pts: 'point',
  ls: 'ls', lumpsum: 'ls', lot: 'ls', job: 'ls', item: 'ls',
  cum: 'cum', m3: 'cum', cumt: 'cum',
};
export function normalizeUnit(raw) {
  if (!raw) return undefined;
  return UNIT_ALIASES[String(raw).toLowerCase().replace(/[.\s]/g, '')];
}

// What a line must name. Loose on purpose: "did the line say anything about this?".
export const SPEC = {
  board: { label: 'Board and its grade', hint: 'e.g. IS 303 BWP plywood, HDHMR', test: /IS ?(303|710|1659|3087|12823)\b|\b(MR|BWR|BWP)\b|marine|HDHMR|\bMDF\b|\bWPC\b|particle ?board|block ?board/i },
  thickness: { label: 'Thickness', hint: 'in mm, e.g. 18 mm carcass', test: /\b\d{1,3}(\.\d+)? ?mm\b/i },
  finish: { label: 'Finish', hint: 'laminate, veneer, PU, acrylic', test: /laminate|\blam\b|veneer|lacquer|acrylic|\bPU\b|duco|membrane|polish|\bglass\b|paint/i },
  edge: { label: 'Edge band', hint: 'e.g. 2 mm PVC edge band', test: /edge ?band|edging|\bABS\b|PVC edge/i },
  hardware: { label: 'Hardware make', hint: "hinges and channels by make, or 'or equal'", test: /hettich|h[aä]fele|blum|ebco|godrej|dorset|grass\b|soft[- ]?close|tandem|hinge|channel|hydraulic|hardware|\bmake\b|or equal|equivalent/i },
  ceilingBoard: { label: 'Ceiling board', hint: 'gypsum, calcium silicate, POP', test: /gypsum|calcium silicate|cement board|\bPOP\b|plaster of paris|mineral fib|metal|\bPVC\b|wooden/i },
  framing: { label: 'Framing', hint: 'GI sections, grid', test: /frame|framing|\bGI\b|galvani[sz]ed|section|grid|suspension|channel/i },
  tile: { label: 'Tile or stone size', hint: 'e.g. 600 × 1200 mm', test: /\d{2,4} ?(mm)? ?[x×*] ?\d{2,4}/i },
  make: { label: 'Make and model', hint: "brand and product, or 'or equal'", test: /\bmake\b|\bbrand\b|\bmodel\b|or equal|equivalent|approved|asian paints|berger|nerolac|dulux|jaquar|kohler|grohe|hindware|cera\b|parryware|legrand|schneider|havells|anchor|polycab|finolex|philips|wipro|astral|supreme|ashirvad|fosroc|sika|dr\.? ?fixit/i },
  coats: { label: 'Number of coats', hint: 'putty, primer and finish coats', test: /\bcoats?\b|\b(one|two|three|[123]) ?(coat|layer)s?\b/i },
  wire: { label: 'Wire or cable', hint: 'e.g. 1.5 sq mm FRLS, CAT6', test: /\d(\.\d+)? ?sq\.? ?mm|FRLS|\bFR\b|HFFR|wire|cable|\bcat ?[5-7]a?\b|coaxial|\bRG ?6\b/i },
  material: { label: 'Material', hint: 'named, e.g. granite, quartz, sal wood', test: /granite|quartz|marble|corian|solid surface|stainless|\btile|stone|acrylic|glass|ceramic|teak|\bsal\b|hardwood|aluminium|steel|engineered|brick|block|\bAAC\b|gypsum|PVC|WPC/i },
  size: { label: 'Size', hint: 'a dimension in mm, ft or inches', test: /\d+(\.\d+)? ?(mm|cm|ft|feet|inch|in\b|"|')/i },
  pipe: { label: 'Pipe material and size', hint: 'CPVC, PPR, UPVC, with size', test: /CPVC|\bPPR\b|UPVC|\bGI\b|\bPVC\b|HDPE|composite/i },
};

// Words that show a line says how it was measured.
export const BASIS_TEST = /\b(incl|including|inclusive|excl|excluding|exclusive|measured|basis|shutter area|carcass|elevation|running|r\.?ft|overall)\b/i;

const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

// The library row a line is about. A line names its subject first ("Loft above wardrobe"), so the
// earliest keyword wins; at the same spot the longer one is more specific. Keywords start a word.
export function matchItem(text, items) {
  const t = ` ${String(text || '').toLowerCase()} `;
  const at = (k) => {
    for (let i = t.indexOf(k); i >= 0; i = t.indexOf(k, i + 1)) if (!/[a-z0-9]/.test(t[i - 1])) return i;
    return -1;
  };
  let best = null, bestPos = Infinity, bestLen = 0;
  for (const item of items) {
    if (item.hidden) continue;
    for (const k of list(item.match).map((x) => x.toLowerCase())) {
      const pos = at(k);
      if (pos < 0) continue;
      if (pos < bestPos || (pos === bestPos && k.length > bestLen)) { best = item; bestPos = pos; bestLen = k.length; }
    }
  }
  return best;
}

// Flags for one quote line against its library item. Each flag has a stable `key` so the designer can
// dismiss it for that line ("basis agreed on site") and it stays dismissed (quotation_items.dismissed_flags).
export function checkLine(line, item) {
  const flags = [];
  const text = `${line.description || ''} ${line.measurement_basis || ''}`;
  const unit = normalizeUnit(line.unit) || line.unit;
  if (String(line.description || '').trim().split(/\s+/).length < 5) {
    flags.push({ key: 'vague', text: 'Too short to price the same way twice. Name the material, size and finish.' });
  }
  if (!line.unit) flags.push({ key: 'no-unit', text: 'No unit.' });
  if (item) {
    const units = [item.unit, ...list(item.units)];
    if (unit && !units.includes(unit)) flags.push({ key: 'unit', text: `${item.name} is usually priced in ${UNIT_LABEL[item.unit] || item.unit}, not ${UNIT_LABEL[unit] || unit}.` });
    for (const k of list(item.spec_keys)) {
      if (SPEC[k] && !SPEC[k].test.test(text)) flags.push({ key: `spec:${k}`, text: `Missing: ${SPEC[k].label.toLowerCase()} (${SPEC[k].hint}).` });
    }
    if (item.basis_required && !BASIS_TEST.test(text) && !String(line.dims || '').trim()) {
      flags.push({ key: 'basis', text: "Doesn't say how it's measured. No standard covers this item, so the line has to." });
    }
  }
  if (line.unit && !(Number(line.qty) > 0)) flags.push({ key: 'qty', text: 'No quantity.' });
  const dismissed = new Set(list(line.dismissed_flags));
  return flags.filter((f) => !dismissed.has(f.key));
}

// Excel copies cells as tab-separated text; a cell holding a tab, newline or quote is quoted.
export function parseTsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function parseNum(s) {
  if (s === undefined || s === null) return undefined;
  const t = String(s).replace(/[₹,\s]|rs\.?/gi, '');
  if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return undefined;
  return Number(t);
}

const HEAD = {
  desc: /descri|particular|specification|item of work|scope|work/i,
  unit: /^\s*(unit|units|uom)\b/i,
  qty: /qty|quantity/i,
  rate: /rate/i,
  basis: /basis|measured|measurement/i,
};

// Pasted rows → quote lines. A header row names its columns; without one, columns are guessed.
// Rows with words but no unit or quantity are room headings ("KITCHEN"), which start a new section.
export function linesFromPaste(text, items, section = '') {
  const rows = parseTsv(text);
  let cols = null, start = 0;
  for (let r = 0; r < Math.min(rows.length, 10) && !cols; r++) {
    const find = (re) => { const i = rows[r].findIndex((c) => re.test(c)); return i < 0 ? undefined : i; };
    const desc = find(HEAD.desc);
    if (desc !== undefined && (find(HEAD.unit) !== undefined || find(HEAD.qty) !== undefined)) {
      cols = { desc, unit: find(HEAD.unit), qty: find(HEAD.qty), rate: find(HEAD.rate), basis: find(HEAD.basis) };
      start = r + 1;
    }
  }
  const out = [];
  let room = section;
  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    let c = cols;
    if (!c) {
      let desc = 0;
      row.forEach((v, i) => { if (/[a-z]/i.test(v) && v.length > row[desc].length) desc = i; });
      const unit = row.findIndex((v, i) => i !== desc && normalizeUnit(v.trim()));
      const nums = row.map((v, i) => (i > Math.max(desc, unit) && parseNum(v) !== undefined ? i : -1)).filter((i) => i >= 0);
      c = { desc, unit: unit < 0 ? undefined : unit, qty: nums[0], rate: nums[1] };
    }
    const description = (row[c.desc] || '').trim();
    if (!description) continue;
    const unitRaw = c.unit !== undefined ? (row[c.unit] || '').trim() : '';
    const qty = c.qty !== undefined ? parseNum(row[c.qty]) : undefined;
    if (!unitRaw && qty === undefined && description.split(/\s+/).length <= 4) { room = description; continue; }
    const item = matchItem(description, items);
    out.push({
      section: room,
      description,
      boq_item_id: item ? item.id : null,
      unit: normalizeUnit(unitRaw) || unitRaw || (item ? item.unit : ''),
      measurement_basis: c.basis !== undefined ? (row[c.basis] || '').trim() : '',
      qty: qty ?? '',
      rate: c.rate !== undefined ? (parseNum(row[c.rate]) ?? '') : '',
    });
  }
  return out;
}
