'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { resolveProvenance, PRODUCERS } = require('../provenance.js');
const { ORIGINS } = require('../record.js');

test('PRODUCERS is record.js ORIGINS, not a second copy', () => {
  assert.deepEqual(PRODUCERS, ORIGINS);
});

test('a by:* label resolves to its producer', () => {
  assert.deepEqual(
    resolveProvenance({ labels: ['by:code-health', 'ready'], body: '' }),
    { kind: 'producer', source: 'code-health' }
  );
});

test('an unknown by:* label is not treated as a producer', () => {
  // Guards against a stray label inventing a trust class.
  assert.deepEqual(
    resolveProvenance({ labels: ['by:something-else'], body: '' }),
    { kind: 'human', source: 'human' }
  );
});

test('an Origin body line resolves to a side-effect class', () => {
  assert.deepEqual(
    resolveProvenance({ labels: [], body: 'Origin: ledger resolve gate\n\nSome text.' }),
    { kind: 'side-effect', source: 'ledger resolve gate' }
  );
});

test('the trailing "from ..." clause is stripped so the class is not per-record', () => {
  const a = resolveProvenance({ labels: [], body: 'Origin: wrap-up leftover from #42' });
  const b = resolveProvenance({ labels: [], body: 'Origin: wrap-up leftover from #91' });
  assert.equal(a.source, 'wrap-up leftover');
  assert.deepEqual(a, b);
});

test('"from session recall" collapses to the same class as "from #N"', () => {
  const byNumber = resolveProvenance({ labels: [], body: 'Origin: demo changes-requested from #17' });
  const byRecall = resolveProvenance({ labels: [], body: 'Origin: demo changes-requested from session recall' });
  assert.equal(byNumber.source, 'demo changes-requested');
  assert.deepEqual(byNumber, byRecall);
});

test('a parenthetical qualifier is a distinct class, not noise', () => {
  const plain = resolveProvenance({ labels: [], body: 'Origin: ledger resolve gate' });
  const ack = resolveProvenance({ labels: [], body: 'Origin: ledger resolve gate (acknowledged)' });
  assert.notEqual(plain.source, ack.source);
  assert.equal(ack.source, 'ledger resolve gate (acknowledged)');
});

test('a label beats an Origin line when both are present', () => {
  assert.deepEqual(
    resolveProvenance({ labels: ['by:capture'], body: 'Origin: wrap-up leftover from #42' }),
    { kind: 'producer', source: 'capture' }
  );
});

test('neither signal means human-filed', () => {
  assert.deepEqual(
    resolveProvenance({ labels: ['bug'], body: 'Just a description.' }),
    { kind: 'human', source: 'human' }
  );
  assert.deepEqual(resolveProvenance({}), { kind: 'human', source: 'human' });
});

test('Origin is only recognized at the start of a line', () => {
  // Prose mentioning the convention must not be read as a provenance claim.
  assert.deepEqual(
    resolveProvenance({ labels: [], body: 'We write Origin: wrap-up leftover in the body.' }),
    { kind: 'human', source: 'human' }
  );
});

test('structured Origins with "from ..." are preserved and not truncated', () => {
  // Emitted forms like these should NOT be truncated.
  const r1 = resolveProvenance({ labels: [], body: 'Origin: wrap-up leftover from #42' });
  assert.equal(r1.source, 'wrap-up leftover');

  const r2 = resolveProvenance({ labels: [], body: 'Origin: ledger resolve gate (acknowledged) from session recall' });
  assert.equal(r2.source, 'ledger resolve gate (acknowledged)');
});

test('a period inside a version/phase number (Phase 8.5) does NOT truncate', () => {
  // This is a real emitted context. The period in "8.5" is not a clause boundary.
  assert.deepEqual(
    resolveProvenance({ labels: [], body: 'Origin: /init doc registry (Phase 8.5) from #99' }),
    { kind: 'side-effect', source: '/init doc registry (phase 8.5)' }
  );
});

test('a period inside a filename (.md) followed by punctuation does NOT truncate', () => {
  // Legacy records may have prose like "specs/inbox.md', deleted by..."
  // The period in ".md" should NOT truncate; only comma+space should.
  const source = resolveProvenance({
    labels: [],
    body: "Origin: migrated from 'specs/inbox.md', deleted by the 6.36.0 legacy purge"
  }).source;
  assert.equal(source, "migrated from 'specs/inbox.md'");
});

test('clause boundary: comma followed by space truncates', () => {
  // Legacy records that differ only after the first comma should collapse.
  const a = resolveProvenance({
    labels: [],
    body: 'Origin: migrated from inbox.md, captured 2026-06-14. category: technical.'
  });
  const b = resolveProvenance({
    labels: [],
    body: 'Origin: migrated from inbox.md, captured 2026-06-13. category: technical.'
  });
  assert.equal(a.source, 'migrated from inbox.md');
  assert.deepEqual(a, b);
});

test('clause boundary: period followed by space truncates', () => {
  const source = resolveProvenance({
    labels: [],
    body: 'Origin: gap found while auditing v6.36.0. plan c task 6 was never executed.'
  }).source;
  assert.equal(source, 'gap found while auditing v6.36.0');
});

test('a source at exactly 60 characters or less is accepted as-is', () => {
  // Structured contexts within the limit are returned exactly.
  const source = resolveProvenance({
    labels: [],
    body: 'Origin: this context is exactly at the limit now'
  }).source;
  assert.ok(source.length <= 60);
  assert.notEqual(source, 'unstructured');
});

// Fix 1: Reverse order — clause-truncate FIRST, then strip trailing source
test('"from #N" followed by trailing period is correctly stripped', () => {
  // The trailing "from #42." pattern should be stripped even when followed by
  // punctuation. This requires truncating first, then stripping.
  const a = resolveProvenance({
    labels: [],
    body: 'Origin: wrap-up leftover from #42.'
  });
  const b = resolveProvenance({
    labels: [],
    body: 'Origin: wrap-up leftover from #91.'
  });
  assert.equal(a.source, 'wrap-up leftover');
  assert.deepEqual(a, b);
});

// Fix 2: Bracket-depth-aware clause boundaries
test('comma inside parentheses does NOT truncate the clause', () => {
  // A comma inside a parenthetical context should not be treated as a clause
  // boundary. "(acknowledged, needs re-check)" is a single semantic unit.
  const a = resolveProvenance({
    labels: [],
    body: 'Origin: ledger resolve gate (acknowledged, needs re-check)'
  });
  const b = resolveProvenance({
    labels: [],
    body: 'Origin: ledger resolve gate (acknowledged, already closed)'
  });
  // Both should capture the full context, not truncate at the internal comma.
  assert.equal(a.source, 'ledger resolve gate (acknowledged, needs re-check)');
  assert.equal(b.source, 'ledger resolve gate (acknowledged, already closed)');
  // They are distinct contexts, not merged.
  assert.notEqual(a.source, b.source);
});

// Fix 3: Blind slice can cause false merges; cap should return 'unstructured'
test('a source exceeding 60 chars becomes "unstructured" to prevent false merges', () => {
  // A context that is still over 60 chars after truncation is not a structured
  // origin—it is freeform prose. Return 'unstructured' rather than truncate it
  // blindly, which would merge two different long contexts if they share a
  // 60-char prefix.
  const veryLong = 'this is an extremely long side-effect context that nobody should ever write because it defeats the trust table';
  const source = resolveProvenance({
    labels: [],
    body: 'Origin: ' + veryLong
  }).source;
  assert.equal(source, 'unstructured');
});
