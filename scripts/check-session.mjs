// node scripts/check-session.mjs: lib/session.js accepts our tokens and refuses forged or expired ones.
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
process.env.SESSION_SECRET = 'test-secret';
const { validSession } = await import('../lib/session.js');

assert.equal(await validSession(jwt.sign({ username: 'a' }, 'test-secret', { expiresIn: '30d' })), true);
assert.equal(await validSession(jwt.sign({ username: 'a' }, 'other-secret', { expiresIn: '30d' })), false);
assert.equal(await validSession(jwt.sign({ username: 'a', exp: Math.floor(Date.now() / 1000) - 10 }, 'test-secret')), false);
assert.equal(await validSession('not-a-token'), false);
console.log('session ok');
