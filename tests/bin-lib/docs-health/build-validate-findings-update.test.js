'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildValidateFindingsUpdate } = require('../../../plugin/bin/lib/docs-health/cache');

function baseCurrent(overrides = {}) {
  return { cursors: {}, remembered: {}, retryQueue: [], runs: [], ...overrides };
}

test('buildValidateFindingsUpdate: target creates a new namespaced cursor entry', () => {
  const current = baseCurrent();
  const now = 1000000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'decisions/0007-foo',
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors['doc:decisions/0007-foo'], { lastAuditedMs: now });
});

test('buildValidateFindingsUpdate: target on an existing cursor overwrites it, leaving other keys untouched', () => {
  const current = baseCurrent({
    cursors: {
      'doc:decisions/0007-foo': { lastAuditedMs: 500 },
      'doc:guides/setup': { lastAuditedMs: 999 },
    },
  });
  const now = 2000000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'decisions/0007-foo',
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors['doc:decisions/0007-foo'], { lastAuditedMs: now });
  assert.deepStrictEqual(next.cursors['doc:guides/setup'], { lastAuditedMs: 999 });
});

test('buildValidateFindingsUpdate: no target leaves cursors unchanged', () => {
  const current = baseCurrent({ cursors: { 'doc:a': { lastAuditedMs: 1 } } });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.cursors, current.cursors);
});

test('buildValidateFindingsUpdate: the new run record is appended to (not replacing) current.runs', () => {
  const priorRun = { runId: 'r0', runAt: 'earlier', fingerprints: ['docshealth-aaaa0001'] };
  const current = baseCurrent({ runs: [priorRun] });
  const newRun = { runId: 'r1', runAt: 'later', fingerprints: ['docshealth-bbbb0002'] };
  const next = buildValidateFindingsUpdate(current, { target: undefined, runRecord: newRun, now: 1 });
  assert.deepStrictEqual(next.runs, [priorRun, newRun]);
});

test('buildValidateFindingsUpdate: passes through unrelated current fields (e.g. retryQueue) untouched', () => {
  const current = baseCurrent({ retryQueue: [{ fingerprint: 'docshealth-xyz', attempts: 1 }] });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.retryQueue, current.retryQueue);
});

// ── --min-confidence: remembered-cache merge (mirrors code-health's own
// buildValidateFindingsUpdate coverage for rememberCandidates) ──

test('buildValidateFindingsUpdate: a new rememberCandidate is merged into (not replacing) current.remembered', () => {
  const current = baseCurrent({
    remembered: { 'docshealth-existing01': { status: 'remembered', issue: null, confidence: 'med' } },
  });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    rememberCandidates: [{ id: 'docshealth-newone02', confidence: 'low' }],
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.ok(next.remembered['docshealth-existing01'], 'pre-existing remembered entry must survive the merge');
  assert.ok(next.remembered['docshealth-newone02'], 'new rememberCandidate entry must be present');
  assert.strictEqual(Object.keys(next.remembered).length, 2);
});

test('buildValidateFindingsUpdate: a rememberCandidate already present in current.remembered is left untouched (its original entry wins)', () => {
  const current = baseCurrent({
    remembered: { 'docshealth-existing01': { status: 'remembered', issue: null, confidence: 'high' } },
  });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    // Same id, different confidence this run — must NOT overwrite.
    rememberCandidates: [{ id: 'docshealth-existing01', confidence: 'low' }],
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(
    next.remembered['docshealth-existing01'],
    { status: 'remembered', issue: null, confidence: 'high' },
    'an already-remembered entry must not be overwritten',
  );
});

test('buildValidateFindingsUpdate: no rememberCandidates leaves current.remembered unchanged', () => {
  const current = baseCurrent({
    remembered: { 'docshealth-existing01': { status: 'remembered', issue: null, confidence: 'med' } },
  });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.remembered, current.remembered);
});

// wontfixSuppressed — the durable half of the gh-absent wontfix fix (#163).
// A firing that CAN read the issue index persists its `wontfix` label
// readings, so a later index-less firing still suppresses them.

test('buildValidateFindingsUpdate: wontfixSuppressed fingerprints land in the durable declined slice', () => {
  const current = baseCurrent({ declined: {} });
  const next = buildValidateFindingsUpdate(current, {
    target: 'decisions/0007-foo',
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    wontfixSuppressed: ['docshealth-aaaa0001'],
    now: 500,
  });
  assert.deepStrictEqual(
    next.declined['docshealth-aaaa0001'],
    { lastSeenMs: 500, origin: 'wontfix-label' },
  );
});

test('buildValidateFindingsUpdate: an existing declined entry is not clobbered by a wontfix suppression', () => {
  const current = baseCurrent({ declined: { 'docshealth-aaaa0001': { lastSeenMs: 1 } } });
  const next = buildValidateFindingsUpdate(current, {
    target: 'decisions/0007-foo',
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    wontfixSuppressed: ['docshealth-aaaa0001'],
    now: 500,
  });
  assert.deepStrictEqual(next.declined['docshealth-aaaa0001'], { lastSeenMs: 1 });
});

test('buildValidateFindingsUpdate: omitting wontfixSuppressed leaves declined untouched', () => {
  const current = baseCurrent({ declined: { 'docshealth-bbbb0002': { lastSeenMs: 9 } } });
  const next = buildValidateFindingsUpdate(current, {
    target: 'decisions/0007-foo',
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 500,
  });
  assert.deepStrictEqual(next.declined, current.declined);
});
