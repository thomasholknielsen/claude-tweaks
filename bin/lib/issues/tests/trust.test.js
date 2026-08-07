'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { riskBand, trustRows, MIN_SAMPLES } = require('../trust.js');

test('riskBand splits low from everything else', () => {
  assert.equal(riskBand(['risk:low']), 'low');
  assert.equal(riskBand(['risk:medium']), 'elevated');
  assert.equal(riskBand(['risk:high']), 'elevated');
});

test('an unscored record is elevated, never low', () => {
  // Absence of a score is not evidence of safety.
  assert.equal(riskBand([]), 'elevated');
  assert.equal(riskBand(undefined), 'elevated');
});

test('conflicting risk labels resolve to elevated, not low', () => {
  // Conflicting evidence gets the same conservative default as absent evidence.
  assert.equal(riskBand(['risk:low', 'risk:high']), 'elevated');
  assert.equal(riskBand(['risk:high', 'risk:low']), 'elevated');
});

test('rows key on provenance and band together', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 2, labels: ['by:capture', 'risk:high', 'demo:approved'], body: '', state: 'CLOSED' },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.key).sort(), ['producer:capture|elevated', 'producer:capture|low']);
});

test('approved and changes-requested are tallied separately', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 2, labels: ['by:capture', 'risk:low', 'demo:changes-requested'], body: '', state: 'CLOSED' },
  ]);
  assert.equal(rows[0].approved, 1);
  assert.equal(rows[0].changesRequested, 1);
});

test('an undispositioned record counts as unknown, never as success', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED' },
  ]);
  assert.equal(rows[0].undispositioned, 1);
  assert.equal(rows[0].approved, 0);
  assert.equal(rows[0].verdict, 'insufficient-evidence');
});

test('a cell with many records but no verdicts is still insufficient evidence', () => {
  const many = Array.from({ length: MIN_SAMPLES + 10 }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED',
  }));
  const rows = trustRows(many);
  assert.equal(rows[0].total, MIN_SAMPLES + 10);
  assert.equal(rows[0].verdict, 'insufficient-evidence');
});

test('a follow-up record counts against the record it names', () => {
  const rows = trustRows([
    { number: 7, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 8, labels: [], body: 'Origin: demo changes-requested from #7', state: 'OPEN' },
  ]);
  const capture = rows.find((r) => r.key === 'producer:capture|low');
  assert.equal(capture.followUps, 1);
});

test('a follow-up record still counts despite trailing punctuation after #N', () => {
  for (const suffix of ['.', ',', ')']) {
    const rows = trustRows([
      { number: 7, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
      { number: 8, labels: [], body: `Origin: demo changes-requested from #7${suffix}`, state: 'OPEN' },
    ]);
    const capture = rows.find((r) => r.key === 'producer:capture|low');
    assert.equal(capture.followUps, 1, `suffix ${JSON.stringify(suffix)} should still count`);
  }
});

test('a follow-up reference to #71 counts against #71, not #7', () => {
  const rows = trustRows([
    { number: 7, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 71, labels: ['by:docs-health', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 8, labels: [], body: 'Origin: demo changes-requested from #71', state: 'OPEN' },
  ]);
  const capture = rows.find((r) => r.key === 'producer:capture|low');
  const docsHealth = rows.find((r) => r.key === 'producer:docs-health|low');
  assert.equal(capture.followUps, 0);
  assert.equal(docsHealth.followUps, 1);
});

test('only corrective Origin markers count as follow-ups', () => {
  // The Follow-ups column means "this work generated corrective work". Of the
  // three `... from #N` markers emitted today, only changes-requested is that.
  const cases = [
    ['demo changes-requested', 1],
    ['demo scope-fork', 0],
    ['wrap-up leftover', 0],
  ];
  for (const [context, expected] of cases) {
    const rows = trustRows([
      { number: 7, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
      { number: 8, labels: [], body: `Origin: ${context} from #7`, state: 'OPEN' },
    ]);
    const capture = rows.find((r) => r.key === 'producer:capture|low');
    assert.equal(capture.followUps, expected, `"${context}" should contribute ${expected}`);
  }
});

test('a scope-fork alone leaves a cell clean; a changes-requested does not', () => {
  // The verdict consequence of the rule above: one miscounted scope-fork is
  // enough to force a whole cell from 'clean' to 'mixed'.
  const closed = Array.from({ length: MIN_SAMPLES }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED',
  }));
  const scopeFork = trustRows([
    ...closed,
    { number: 100, labels: [], body: 'Origin: demo scope-fork from #1', state: 'OPEN' },
  ]);
  assert.equal(scopeFork[0].verdict, 'clean');

  const changesRequested = trustRows([
    ...closed,
    { number: 100, labels: [], body: 'Origin: demo changes-requested from #1', state: 'OPEN' },
  ]);
  assert.equal(changesRequested[0].verdict, 'mixed');
});

test('an unrecognized "from #N" context still counts as a follow-up', () => {
  // Denylist, not allowlist: undercounting follow-ups flips a cell from
  // 'mixed' to 'clean', so an unknown marker is treated as corrective.
  const rows = trustRows([
    { number: 7, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 8, labels: [], body: 'Origin: some future corrective flow from #7', state: 'OPEN' },
  ]);
  assert.equal(rows.find((r) => r.key === 'producer:capture|low').followUps, 1);
});

test('the unstructured cell is ungradable at any sample count', () => {
  // A bucket defined by "these records could not be classified" has no
  // coherent class to earn trust for. Well past MIN_SAMPLES, fully
  // dispositioned, and clean on every negative signal — still ungradable.
  const overlong = 'Origin: ' + 'x'.repeat(80);
  const many = Array.from({ length: MIN_SAMPLES + 4 }, (_, i) => ({
    number: i + 1, labels: ['risk:low', 'demo:approved'], body: overlong, state: 'CLOSED',
  }));
  const rows = trustRows(many);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provenance, 'unstructured:unstructured');
  assert.equal(rows[0].total, MIN_SAMPLES + 4);
  assert.equal(rows[0].approved, MIN_SAMPLES + 4);
  assert.equal(rows[0].changesRequested, 0);
  assert.equal(rows[0].followUps, 0);
  assert.equal(rows[0].notPlanned, 0);
  assert.equal(rows[0].verdict, 'insufficient-evidence');
});

test('an identically-shaped classified cell does grade — the pin is the kind, not the shape', () => {
  // Control for the test above: same counts, same signals, real provenance.
  // Without this, "insufficient-evidence" could be coming from anything.
  const many = Array.from({ length: MIN_SAMPLES + 4 }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED',
  }));
  assert.equal(trustRows(many)[0].verdict, 'clean');
});

test('the empty-origin cell is ungradable too — same kind, same pin', () => {
  const many = Array.from({ length: MIN_SAMPLES + 4 }, (_, i) => ({
    number: i + 1, labels: ['risk:low', 'demo:approved'], body: 'Origin: .', state: 'CLOSED',
  }));
  const rows = trustRows(many);
  assert.equal(rows[0].provenance, 'unstructured:empty-origin');
  assert.equal(rows[0].verdict, 'insufficient-evidence');
});

test('NOT_PLANNED is tallied as its own negative-ish signal', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED', stateReason: 'NOT_PLANNED' },
  ]);
  assert.equal(rows[0].notPlanned, 1);
});

test('open records are excluded — trust is about outcomes', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low'], body: '', state: 'OPEN' },
  ]);
  assert.equal(rows.length, 0);
});

test('rows are returned in a stable order', () => {
  const input = [
    { number: 1, labels: ['by:docs-health', 'risk:low'], body: '', state: 'CLOSED' },
    { number: 2, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED' },
  ];
  assert.deepEqual(trustRows(input).map((r) => r.key), trustRows(input.reverse()).map((r) => r.key));
});
