// node scripts/check-materials.mjs: the swatch matcher in lib/materials.js.
import assert from 'node:assert/strict';
import { projectMaterials as f } from '../lib/materials.js';

assert.equal(f({ name: 'Mehta bungalow', client_notes: 'prefers warm oak and brass.', order_items: 'wardrobe, oak veneer; table, solid teak' }).map(x => x.name).join(), 'oak,brass,veneer,teak');
const own = f({ materials: 'Warm oak, brushed brass, Kota stone, Glass', notes: 'teak' });
assert.deepEqual(own.map(x => x.hex), ['#c8a165', '#b5a642', '#d6d0c4', '#cfe3e8']);
assert.equal(f({ name: 'Wardrobe lacquered white' }).map(x => x.name).join(), 'lacquer,white');
assert.equal(f({ name: 'Trivedi dental clinic' }).length, 0);
console.log('materials ok');
