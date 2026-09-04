'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildValidateFindingsUpdate } = require('../../../plugin/bin/lib/code-health/cache');

// Pure unit coverage for the merge logic cmdValidateFindings (bin/code-health.js)
// hands to writeDurableState as its mutator. This closure previously lived
// inline and had zero automated coverage: every CLI-level test that reaches
// cmdValidateFindings's persistence step fails its `git fetch origin
// health-state` first (no real GitHub-hosted remote configured in any test),
// so the mutator itself was never actually invoked. Extracting it as a pure
// function (no git, no gh, no I/O) lets these plain-object fixtures exercise
// its four behaviors directly.

function baseCurrent(overrides = {}) {
  return {
    cursors: {},
    remembered: {},
    retryQueue: [],
    runs: [],
    ...overrides,
  };
}

test('buildValidateFindingsUpdate: a swept area cursor gets lastSweptMs/lastHash updated', () => {
  const current = baseCurrent();
  const now = 1_000_000;
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: ['src/api'],
    hashes: { 'src/api': 'hash-abc' },
    rememberCandidates: [],
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors['src/api'], { lastSweptMs: now, lastHash: 'hash-abc' });
});

test('buildValidateFindingsUpdate: an un-swept area\'s existing cursor is preserved unchanged', () => {
  const current = baseCurrent({
    cursors: {
      'src/util': { lastSweptMs: 500, lastHash: 'old-hash', someOtherField: 'keep-me' },
    },
  });
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: ['src/api'], // only src/api is swept this run
    hashes: { 'src/api': 'hash-abc' },
    rememberCandidates: [],
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 999,
  });
  assert.deepStrictEqual(
    next.cursors['src/util'],
    { lastSweptMs: 500, lastHash: 'old-hash', someOtherField: 'keep-me' },
    'un-swept area cursor must not be touched',
  );
  assert.ok(next.cursors['src/api'], 'swept area must still get its own cursor entry');
});

test('buildValidateFindingsUpdate: a new rememberCandidate is merged into (not replacing) current.remembered', () => {
  const current = baseCurrent({
    remembered: { 'codehealth-existing01': { status: 'remembered', issue: null, severity: 'medium', risk: 'medium' } },
  });
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: [],
    hashes: {},
    rememberCandidates: [{ id: 'codehealth-newone02', severity: 'low', risk: 'low' }],
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.ok(next.remembered['codehealth-existing01'], 'pre-existing remembered entry must survive the merge');
  assert.ok(next.remembered['codehealth-newone02'], 'new rememberCandidate entry must be present');
  assert.strictEqual(Object.keys(next.remembered).length, 2);
});

// REGRESSION: the "already remembered, don't touch it" check must be
// evaluated against `current.remembered` (the state passed INTO this
// invocation — i.e. whatever writeDurableState's CAS loop most recently
// fetched), never a caller-side pre-computed delta that already decided
// which candidates to include/exclude before this function ever saw the
// freshest state. A candidate whose id already exists in current.remembered
// must be left untouched, not overwritten with this run's own values.
test('buildValidateFindingsUpdate: a rememberCandidate already present in current.remembered is left untouched (its original entry wins)', () => {
  const current = baseCurrent({
    remembered: { 'codehealth-existing01': { status: 'remembered', issue: null, severity: 'high', risk: 'high' } },
  });
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: [],
    hashes: {},
    // Same id, different severity/risk this run — must NOT overwrite.
    rememberCandidates: [{ id: 'codehealth-existing01', severity: 'low', risk: 'low' }],
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(
    next.remembered['codehealth-existing01'],
    { status: 'remembered', issue: null, severity: 'high', risk: 'high' },
    'an already-remembered entry (from current.remembered, the freshest available state) must not be overwritten',
  );
});

test('buildValidateFindingsUpdate: the new run record is appended to (not replacing) current.runs', () => {
  const priorRun = { runId: 'r0', runAt: 'earlier', fingerprints: ['codehealth-aaaa0001'] };
  const current = baseCurrent({ runs: [priorRun] });
  const newRun = { runId: 'r1', runAt: 'later', fingerprints: ['codehealth-bbbb0002'] };
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: [],
    hashes: {},
    rememberCandidates: [],
    runRecord: newRun,
    now: 1,
  });
  assert.deepStrictEqual(next.runs, [priorRun, newRun], 'prior run must be preserved and the new run appended in order');
});

test('buildValidateFindingsUpdate: passes through unrelated current fields (e.g. retryQueue) untouched', () => {
  const current = baseCurrent({ retryQueue: [{ fingerprint: 'codehealth-xyz', attempts: 1 }] });
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: [],
    hashes: {},
    rememberCandidates: [],
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.retryQueue, current.retryQueue);
});

// #171 — wontfixSuppressed is folded into the durable `declined` slice
// (mergeWontfixIntoDeclined), the same durable-suppression hand-off
// harness-health/journey-health/docs-health already perform, so a wontfix
// label read this run survives a later firing whose local cache is empty.
test('buildValidateFindingsUpdate: wontfixSuppressed fingerprints are merged into declined', () => {
  const current = baseCurrent();
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: [],
    hashes: {},
    rememberCandidates: [],
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    wontfixSuppressed: ['codehealth-suppress01'],
    now: 500,
  });
  assert.deepStrictEqual(next.declined, { 'codehealth-suppress01': { lastSeenMs: 500, origin: 'wontfix-label' } });
});

test('buildValidateFindingsUpdate: an existing declined entry is preserved (first write wins) and merged with new suppressions', () => {
  const current = baseCurrent({
    declined: { 'codehealth-existing-decl': { lastSeenMs: 1, origin: 'wontfix-label' } },
  });
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: [],
    hashes: {},
    rememberCandidates: [],
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    wontfixSuppressed: ['codehealth-existing-decl', 'codehealth-new-decl'],
    now: 999,
  });
  assert.deepStrictEqual(next.declined, {
    'codehealth-existing-decl': { lastSeenMs: 1, origin: 'wontfix-label' },
    'codehealth-new-decl': { lastSeenMs: 999, origin: 'wontfix-label' },
  });
});

test('buildValidateFindingsUpdate: no wontfixSuppressed (undefined) leaves declined unchanged (backward compatible with pre-#171 callers)', () => {
  const current = baseCurrent({ declined: { 'codehealth-prior': { lastSeenMs: 1, origin: 'wontfix-label' } } });
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: [],
    hashes: {},
    rememberCandidates: [],
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.declined, { 'codehealth-prior': { lastSeenMs: 1, origin: 'wontfix-label' } });
});
