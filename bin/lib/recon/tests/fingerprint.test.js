const { test } = require('node:test');
const assert = require('node:assert');
const { fingerprint, normalizeSignature } = require('../fingerprint');

test('fingerprint returns a recon-<8hex> id', () => {
  const id = fingerprint({ lens: 'todo-comments', areaId: '.', signature: 'TODO x', file: 'a.js:12' });
  assert.match(id, /^recon-[0-9a-f]{8}$/);
});

// REGRESSION (PORT.md delta #1): a cosmetic line move must NOT mint a new id.
test('fingerprint is stable when the finding moves lines or columns', () => {
  const a = fingerprint({ lens: 'todo-comments', areaId: '.', signature: 'TODO wire it up', file: 'src/a.js:12' });
  const b = fingerprint({ lens: 'todo-comments', areaId: '.', signature: 'TODO wire it up', file: 'src/a.js:480:6' });
  assert.strictEqual(a, b, 'line/col in file must be stripped before hashing');
});

// REGRESSION: signature whitespace/case/line refs are normalized.
test('fingerprint is stable across whitespace, case, and embedded line refs in signature', () => {
  const a = fingerprint({ lens: 'oversized-file', areaId: 'apps/web', signature: 'src/Foo.ts:12  has 900 lines' });
  const b = fingerprint({ lens: 'oversized-file', areaId: 'apps/web', signature: 'SRC/FOO.TS:401 HAS   900 LINES' });
  assert.strictEqual(a, b);
});

test('fingerprint differs when lens or area differs', () => {
  const base = { areaId: '.', signature: 'TODO x', file: 'a.js:1' };
  assert.notStrictEqual(
    fingerprint({ ...base, lens: 'todo-comments' }),
    fingerprint({ ...base, lens: 'dead-export' }),
  );
  assert.notStrictEqual(
    fingerprint({ lens: 'todo-comments', areaId: 'a', signature: 'TODO x' }),
    fingerprint({ lens: 'todo-comments', areaId: 'b', signature: 'TODO x' }),
  );
});

test('normalizeSignature strips line refs, collapses whitespace, lowercases', () => {
  assert.strictEqual(normalizeSignature('Foo.ts:12:3  Bar   BAZ'), 'foo.ts bar baz');
});
