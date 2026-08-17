'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildValidateFindingsUpdate } = require('../../../plugin/bin/lib/harness-health/cache');

// Pure unit coverage for the merge logic cmdValidateFindings (bin/harness-health.js)
// hands to writeDurableState as its mutator. This closure previously lived
// inline and had zero automated coverage: every CLI-level test that reaches
// cmdValidateFindings's persistence step fails its `git fetch origin
// health-state` first (no real GitHub-hosted remote configured in any test),
// so the mutator itself was never actually invoked. Extracting it as a pure
// function (no git, no gh, no I/O) lets these plain-object fixtures exercise
// its behaviors directly. Mirrors code-health's own `remembered` merge
// (bin/lib/code-health/cache.js) for findings held below a `--min-confidence`
// floor.

function baseCurrent(overrides = {}) {
  return {
    cursors: {},
    retryQueue: [],
    runs: [],
    ...overrides,
  };
}

test('buildValidateFindingsUpdate: target+kind creates a new namespaced cursor entry', () => {
  const current = baseCurrent();
  const now = 1_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'auth',
    kind: 'skill',
    gapScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors['skill:auth'], { lastAuditedSha: null, lastAuditedMs: now });
});

test('buildValidateFindingsUpdate: target+kind on an existing cursor overwrites it in place, leaving other keys untouched', () => {
  const current = baseCurrent({
    cursors: {
      'skill:auth': { lastAuditedSha: 'old-sha', lastAuditedMs: 500 },
      'skill:billing': { lastAuditedSha: 'keep-me', lastAuditedMs: 999 },
    },
  });
  const now = 2_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'auth',
    kind: 'skill',
    gapScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(
    next.cursors['skill:auth'],
    { lastAuditedSha: null, lastAuditedMs: now },
    'the targeted cursor must be overwritten with the fresh value',
  );
  assert.deepStrictEqual(
    next.cursors['skill:billing'],
    { lastAuditedSha: 'keep-me', lastAuditedMs: 999 },
    'an unrelated existing cursor entry must survive untouched',
  );
});

test('buildValidateFindingsUpdate: gapScan sets the global __gapScan cursor', () => {
  const current = baseCurrent();
  const now = 3_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    kind: undefined,
    gapScan: true,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors.__gapScan, { lastScannedSha: null, lastScannedMs: now });
});

test('buildValidateFindingsUpdate: neither target/kind nor gapScan leaves cursors unchanged', () => {
  const current = baseCurrent({ cursors: { 'skill:auth': { lastAuditedSha: 'a', lastAuditedMs: 1 } } });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    kind: undefined,
    gapScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.cursors, current.cursors);
});

test('buildValidateFindingsUpdate: the new run record is appended to (not replacing) current.runs', () => {
  const priorRun = { runId: 'r0', runAt: 'earlier', fingerprints: ['harnesshealth-aaaa0001'] };
  const current = baseCurrent({ runs: [priorRun] });
  const newRun = { runId: 'r1', runAt: 'later', fingerprints: ['harnesshealth-bbbb0002'] };
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    kind: undefined,
    gapScan: false,
    runRecord: newRun,
    now: 1,
  });
  assert.deepStrictEqual(next.runs, [priorRun, newRun], 'prior run must be preserved and the new run appended in order');
});

test('buildValidateFindingsUpdate: target+kind and gapScan set together both update, with no cross-interference', () => {
  const current = baseCurrent({
    cursors: {
      'skill:billing': { lastAuditedSha: 'keep-me', lastAuditedMs: 999 },
    },
  });
  const now = 4_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'auth',
    kind: 'skill',
    gapScan: true,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(
    next.cursors['skill:auth'],
    { lastAuditedSha: null, lastAuditedMs: now },
    'the per-target cursor must be set when target+kind and gapScan are both present',
  );
  assert.deepStrictEqual(
    next.cursors.__gapScan,
    { lastScannedSha: null, lastScannedMs: now },
    'the gap-scan cursor must be set when target+kind and gapScan are both present',
  );
  assert.deepStrictEqual(
    next.cursors['skill:billing'],
    { lastAuditedSha: 'keep-me', lastAuditedMs: 999 },
    'an unrelated existing cursor entry must survive untouched',
  );
});

test('buildValidateFindingsUpdate: passes through unrelated current fields (e.g. retryQueue) untouched', () => {
  const current = baseCurrent({ retryQueue: [{ fingerprint: 'harnesshealth-xyz', attempts: 1 }] });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    kind: undefined,
    gapScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.retryQueue, current.retryQueue);
});

test('buildValidateFindingsUpdate: rememberCandidates below the --min-confidence floor are merged into remembered, not lost', () => {
  const current = baseCurrent();
  const next = buildValidateFindingsUpdate(current, {
    target: 'auth',
    kind: 'skill',
    gapScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    rememberCandidates: [{ id: 'harnesshealth-aaaa0001', confidence: 'low' }],
    now: 1,
  });
  assert.deepStrictEqual(next.remembered['harnesshealth-aaaa0001'], { status: 'remembered', confidence: 'low' });
});

test('buildValidateFindingsUpdate: an already-remembered fingerprint is left untouched, not overwritten, by a later run', () => {
  const current = baseCurrent({
    remembered: { 'harnesshealth-aaaa0001': { status: 'remembered', confidence: 'low' } },
  });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    kind: undefined,
    gapScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    rememberCandidates: [{ id: 'harnesshealth-aaaa0001', confidence: 'med' }],
    now: 2,
  });
  assert.deepStrictEqual(
    next.remembered['harnesshealth-aaaa0001'],
    { status: 'remembered', confidence: 'low' },
    'the pre-existing remembered entry must not be clobbered by a same-run re-remember',
  );
});

test('buildValidateFindingsUpdate: no rememberCandidates leaves an existing remembered map untouched', () => {
  const current = baseCurrent({
    remembered: { 'harnesshealth-bbbb0002': { status: 'remembered', confidence: 'low' } },
  });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    kind: undefined,
    gapScan: false,
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
    target: 'auth',
    kind: 'skill',
    gapScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    wontfixSuppressed: ['harnesshealth-aaaa0001'],
    now: 500,
  });
  assert.deepStrictEqual(
    next.declined['harnesshealth-aaaa0001'],
    { lastSeenMs: 500, origin: 'wontfix-label' },
  );
});

test('buildValidateFindingsUpdate: an existing declined entry is not clobbered by a wontfix suppression', () => {
  const current = baseCurrent({ declined: { 'harnesshealth-aaaa0001': { lastSeenMs: 1 } } });
  const next = buildValidateFindingsUpdate(current, {
    target: 'auth',
    kind: 'skill',
    gapScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    wontfixSuppressed: ['harnesshealth-aaaa0001'],
    now: 500,
  });
  assert.deepStrictEqual(next.declined['harnesshealth-aaaa0001'], { lastSeenMs: 1 });
});

test('buildValidateFindingsUpdate: omitting wontfixSuppressed leaves declined untouched', () => {
  const current = baseCurrent({ declined: { 'harnesshealth-bbbb0002': { lastSeenMs: 9 } } });
  const next = buildValidateFindingsUpdate(current, {
    target: 'auth',
    kind: 'skill',
    gapScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 500,
  });
  assert.deepStrictEqual(next.declined, current.declined);
});
