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
