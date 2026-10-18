// The persona number guard (lib/assistant-personas.js numbersOk): a reworded summary may only use numbers from the data.
//   node scripts/check-persona-numbers.mjs
import assert from 'node:assert/strict';
import { numbersOk, personaOf } from '../lib/assistant-personas.js';

const data = JSON.stringify({ summary: '₹6,21,860 outstanding on 1 invoice; ₹2,45,000 past due.', rows: [{ due: '2026-10-23', late: 12 }] });
assert.ok(numbersOk('We are owed ₹6,21,860, and ₹2,45,000 of it is 12 days late.', data));
assert.ok(numbersOk('One invoice is still open, due 23 Oct.', data));
assert.ok(!numbersOk('We are owed about ₹6,20,000.', data), 'rounded figure must fail');
assert.ok(!numbersOk('That is ₹8,66,860 in total.', data), 'added-up figure must fail');
assert.ok(!numbersOk('It is 15 days late.', data), 'invented count must fail');
assert.equal(personaOf('plain'), null);
assert.equal(personaOf('nope'), null);
assert.equal(personaOf('site_supervisor').label, 'Site supervisor');
console.log('persona number guard: ok');
