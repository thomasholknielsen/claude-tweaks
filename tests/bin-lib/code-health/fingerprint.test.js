const { test } = require('node:test');
const assert = require('node:assert');
const { fingerprint, normalizeSignature } = require('../../../plugin/bin/lib/code-health/fingerprint');
const { fingerprintFromBasis } = require('../../../plugin/bin/lib/health-core/fingerprint');

test('fingerprint returns a codehealth-<8hex> id', () => {
  const id = fingerprint({ lens: 'todo-comments', areaId: '.', signature: 'TODO x', file: 'a.js:12' });
  assert.match(id, /^codehealth-[0-9a-f]{8}$/);
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

// ── v2 fingerprint ─────────────────────────────────────────────────────────

const { normalizeAnchor } = require('../../../plugin/bin/lib/code-health/fingerprint');

test('normalizeAnchor lowercases path, strips :line and :line:col on either side of #', () => {
  // symbol side must not be stripped — only :line(:col) artifacts
  assert.strictEqual(
    normalizeAnchor('src/Foo.ts:12#handleRequest'),
    'src/foo.ts#handleRequest',
  );
  assert.strictEqual(
    normalizeAnchor('src/Foo.ts#handleRequest:99:3'),
    'src/foo.ts#handleRequest',
  );
  assert.strictEqual(
    normalizeAnchor('  src/Bar.ts  #  doThing  '),
    'src/bar.ts#doThing',
  );
});

test('v2 fingerprint returns a codehealth-<8hex> id', () => {
  const id = fingerprint({ criterion: 'simplification', areaId: 'src/api', anchor: 'src/api/user.js#getUser' });
  assert.match(id, /^codehealth-[0-9a-f]{8}$/);
});

test('v2 fingerprint is stable when the finding moves lines (anchor stability)', () => {
  // Line number in anchor file ref is stripped by normalizeAnchor.
  const a = fingerprint({ criterion: 'dead-code', areaId: 'src', anchor: 'src/util.js:42#trimPath' });
  const b = fingerprint({ criterion: 'dead-code', areaId: 'src', anchor: 'src/util.js:99#trimPath' });
  assert.strictEqual(a, b, 'moved line must not change the fingerprint');
});

test('v2 fingerprint is stable when prose around the anchor is reworded', () => {
  // The anchor itself is the same; wording of the surrounding evidence is irrelevant.
  const a = fingerprint({ criterion: 'naming-clarity', areaId: 'lib', anchor: 'lib/parser.js#parse' });
  const b = fingerprint({ criterion: 'naming-clarity', areaId: 'lib', anchor: 'lib/parser.js#parse' });
  assert.strictEqual(a, b);
});

test('v2 fingerprint differs when criterion, areaId, or anchor differs', () => {
  const base = { criterion: 'resilience', areaId: 'src', anchor: 'src/http.js#fetch' };
  assert.notStrictEqual(
    fingerprint(base),
    fingerprint({ ...base, criterion: 'security-logic' }),
  );
  assert.notStrictEqual(
    fingerprint(base),
    fingerprint({ ...base, areaId: 'lib' }),
  );
  assert.notStrictEqual(
    fingerprint(base),
    fingerprint({ ...base, anchor: 'src/http.js#retry' }),
  );
});

// REGRESSION: both v1 and v2 branches must delegate to health-core's shared
// fingerprintFromBasis primitive (the same one harness-health/journey-health/
// docs-health use), not a hand-rolled inline sha1 — so a future change to the
// id format lands in one place instead of code-health's copy silently
// drifting out of sync.
test('v1 fingerprint is byte-identical to fingerprintFromBasis(\'codehealth\', [lens, areaId, normFile, normalizeSignature(signature)])', () => {
  const args = { lens: 'todo-comments', areaId: 'src', signature: 'TODO fix this', file: 'src/a.js:12' };
  const expected = fingerprintFromBasis('codehealth', ['todo-comments', 'src', 'src/a.js', normalizeSignature('TODO fix this')]);
  assert.strictEqual(fingerprint(args), expected);
});

test('v2 fingerprint is byte-identical to fingerprintFromBasis(\'codehealth\', [criterion, areaId, normalizeAnchor(anchor)])', () => {
  const args = { criterion: 'simplification', areaId: 'src/api', anchor: 'src/api/user.js#getUser' };
  const expected = fingerprintFromBasis('codehealth', ['simplification', 'src/api', normalizeAnchor('src/api/user.js#getUser')]);
  assert.strictEqual(fingerprint(args), expected);
});

test('v1 and v2 forms coexist — same module, both callable', () => {
  const v1 = fingerprint({ lens: 'todo-comments', areaId: '.', signature: 'TODO x', file: 'a.js:1' });
  const v2 = fingerprint({ criterion: 'bad-practice', areaId: '.', anchor: 'a.js#TODO x' });
  assert.match(v1, /^codehealth-[0-9a-f]{8}$/);
  assert.match(v2, /^codehealth-[0-9a-f]{8}$/);
  // They hash different inputs, so they should differ (unless astronomically unlucky).
  assert.notStrictEqual(v1, v2);
});
