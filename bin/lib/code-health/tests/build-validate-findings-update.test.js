'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildValidateFindingsUpdate } = require('../cache');

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
    rememberedDelta: {},
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
    rememberedDelta: {},
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

test('buildValidateFindingsUpdate: rememberedDelta is merged into (not replacing) current.remembered', () => {
  const current = baseCurrent({
    remembered: { 'recon-existing01': { status: 'remembered', issue: null, severity: 'medium', risk: 'medium' } },
  });
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: [],
    hashes: {},
    rememberedDelta: { 'recon-newone02': { status: 'remembered', issue: null, severity: 'low', risk: 'low' } },
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.ok(next.remembered['recon-existing01'], 'pre-existing remembered entry must survive the merge');
  assert.ok(next.remembered['recon-newone02'], 'new rememberedDelta entry must be present');
  assert.strictEqual(Object.keys(next.remembered).length, 2);
});

test('buildValidateFindingsUpdate: the new run record is appended to (not replacing) current.runs', () => {
  const priorRun = { runId: 'r0', runAt: 'earlier', fingerprints: ['recon-aaaa0001'] };
  const current = baseCurrent({ runs: [priorRun] });
  const newRun = { runId: 'r1', runAt: 'later', fingerprints: ['recon-bbbb0002'] };
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: [],
    hashes: {},
    rememberedDelta: {},
    runRecord: newRun,
    now: 1,
  });
  assert.deepStrictEqual(next.runs, [priorRun, newRun], 'prior run must be preserved and the new run appended in order');
});

test('buildValidateFindingsUpdate: passes through unrelated current fields (e.g. retryQueue) untouched', () => {
  const current = baseCurrent({ retryQueue: [{ fingerprint: 'recon-xyz', attempts: 1 }] });
  const next = buildValidateFindingsUpdate(current, {
    areasSwept: [],
    hashes: {},
    rememberedDelta: {},
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.retryQueue, current.retryQueue);
});
