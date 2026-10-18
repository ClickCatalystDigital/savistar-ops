// Material swatches for project cards. A project's own "Materials" field wins (comma-separated,
// e.g. "warm oak, brass, white lacquer"); without it they are read from the project's name, notes,
// client notes and order items. Words not in the table still get a neutral chip with their name.
// ponytail: a fixed word→colour table, upgrade to a colour picker per material if designers ask.
const COLOURS = {
  oak: '#c8a165', walnut: '#5d4030', teak: '#a0672e', ash: '#d9c7a7', maple: '#e3c99a', pine: '#e6c88f',
  birch: '#e9dcc0', rosewood: '#6b2e2a', mahogany: '#7a3b2e', plywood: '#d8b98a', mdf: '#b9a58a',
  laminate: '#d8c7a5', veneer: '#c49a6c', cane: '#c9a66b', rattan: '#c9a66b', jute: '#b8955f', linen: '#e6dccb',
  leather: '#8b5a3c', velvet: '#6d2f4a', brass: '#b5a642', gold: '#c9a74b', copper: '#b87333', bronze: '#8c6a3f',
  steel: '#a8adb3', hardware: '#8d9399', chrome: '#c4c8cc', marble: '#e8e6e1', granite: '#6f6a66', quartz: '#e2ddd5',
  terrazzo: '#d9d2c5', glass: '#cfe3e8', lacquer: '#f5f3ee', white: '#f4f2ee', ivory: '#efe8d8', cream: '#efe3c8',
  beige: '#d9c8a9', grey: '#9aa0a6', gray: '#9aa0a6', charcoal: '#3a3d40', black: '#232323', sage: '#9caf88',
  olive: '#6b7243', navy: '#22324f', terracotta: '#c46a4a', blush: '#e8b4a8', emerald: '#2e6b52', mustard: '#d1a33a',
};
const NEUTRAL = '#d6d0c4';
const WORD = new RegExp(`\\b(${Object.keys(COLOURS).join('|')})(?:ed|s)?\\b`, 'gi');

const swatch = name => ({ name, hex: COLOURS[name.toLowerCase()] || NEUTRAL });

// [{ name, hex }], at most `max`, no repeats.
export function projectMaterials(p, max = 5) {
  if (p.materials?.trim()) {
    return p.materials.split(',').map(s => s.trim()).filter(Boolean).slice(0, max).map(part => {
      const known = [...part.matchAll(WORD)][0]?.[1];
      return { name: part, hex: known ? COLOURS[known.toLowerCase()] : NEUTRAL };
    });
  }
  return materialsIn([p.name, p.notes, p.client_notes, p.order_items].filter(Boolean).join(' '), max);
}

// Known material words in free text, e.g. a vendor's "Plywood and MDF".
export function materialsIn(text, max = 5) {
  const seen = [...new Set([...(text || '').matchAll(WORD)].map(m => m[1].toLowerCase()))];
  return seen.slice(0, max).map(swatch);
}
