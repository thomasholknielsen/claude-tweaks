'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildValidateFindingsUpdate } = require('../../../plugin/bin/lib/journey-health/cache');

// Pure unit coverage for the merge logic cmdValidateFindings (bin/journey-health.js)
// hands to writeDurableState as its mutator. This closure previously lived
// inline and had zero automated coverage: every CLI-level test that reaches
// cmdValidateFindings's persistence step fails its `git fetch origin
// health-state` first (no real GitHub-hosted remote configured in any test),
// so the mutator itself was never actually invoked. Extracting it as a pure
// function (no git, no gh, no I/O) lets these plain-object fixtures exercise
// its behaviors directly. Like harness-health, journey-health has no
// `remembered` tier to merge — every surviving finding files unconditionally
// — so there's no rememberedDelta parameter here. Unlike harness-health,
// journey-health's per-target cursor tracks light and deep tiers
// independently on the SAME entry (merged via `{ ...existing, ...patch }`),
// not overwritten — a light-tier firing must never clobber a sibling
// deep-tier cursor field, or vice versa.

function baseCurrent(overrides = {}) {
  return {
    cursors: {},
    retryQueue: [],
    runs: [],
    ...overrides,
  };
}

test('buildValidateFindingsUpdate: target with light tier creates a fresh cursor entry', () => {
  const current = baseCurrent();
  const now = 1_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'checkout-flow',
    tier: 'light',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors['checkout-flow'], { lastLightAuditMs: now, lastLightHash: null });
});

test('buildValidateFindingsUpdate: target with deep tier creates a fresh cursor entry', () => {
  const current = baseCurrent();
  const now = 2_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'checkout-flow',
    tier: 'deep',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors['checkout-flow'], { lastDeepAuditMs: now, lastDeepHash: null });
});

test('buildValidateFindingsUpdate: a light-tier update merges onto an existing deep-tier entry without clobbering it', () => {
  const current = baseCurrent({
    cursors: { 'checkout-flow': { lastDeepAuditMs: 500, lastDeepHash: 'd1' } },
  });
  const now = 3_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'checkout-flow',
    tier: 'light',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors['checkout-flow'], {
    lastDeepAuditMs: 500, lastDeepHash: 'd1',
    lastLightAuditMs: now, lastLightHash: null,
  });
});

test('buildValidateFindingsUpdate: a deep-tier update merges onto an existing light-tier entry without clobbering it', () => {
  const current = baseCurrent({
    cursors: { 'checkout-flow': { lastLightAuditMs: 500, lastLightHash: 'l1' } },
  });
  const now = 4_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'checkout-flow',
    tier: 'deep',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors['checkout-flow'], {
    lastLightAuditMs: 500, lastLightHash: 'l1',
    lastDeepAuditMs: now, lastDeepHash: null,
  });
});

test('buildValidateFindingsUpdate: a sibling journey cursor entry survives untouched', () => {
  const current = baseCurrent({
    cursors: {
      'signup-flow': { lastLightAuditMs: 999, lastLightHash: 'keep-me' },
    },
  });
  const now = 5_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'checkout-flow',
    tier: 'light',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(
    next.cursors['signup-flow'],
    { lastLightAuditMs: 999, lastLightHash: 'keep-me' },
    'an unrelated existing journey cursor entry must survive untouched',
  );
});

test('buildValidateFindingsUpdate: coverageScan sets the global __coverageScan cursor', () => {
  const current = baseCurrent();
  const now = 6_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    tier: undefined,
    coverageScan: true,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors.__coverageScan, { lastScannedMs: now });
});

test('buildValidateFindingsUpdate: neither target nor coverageScan leaves cursors unchanged', () => {
  const current = baseCurrent({ cursors: { 'checkout-flow': { lastLightAuditMs: 1, lastLightHash: 'a' } } });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    tier: undefined,
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.cursors, current.cursors);
});

test('buildValidateFindingsUpdate: the new run record is appended to (not replacing) current.runs', () => {
  const priorRun = { runId: 'r0', runAt: 'earlier', fingerprints: ['journeyhealth-aaaa0001'] };
  const current = baseCurrent({ runs: [priorRun] });
  const newRun = { runId: 'r1', runAt: 'later', fingerprints: ['journeyhealth-bbbb0002'] };
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    tier: undefined,
    coverageScan: false,
    runRecord: newRun,
    now: 1,
  });
  assert.deepStrictEqual(next.runs, [priorRun, newRun], 'prior run must be preserved and the new run appended in order');
});

test('buildValidateFindingsUpdate: a per-journey update and coverageScan set together both update, with no cross-interference', () => {
  const current = baseCurrent({
    cursors: {
      'signup-flow': { lastLightAuditMs: 999, lastLightHash: 'keep-me' },
    },
  });
  const now = 7_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'checkout-flow',
    tier: 'light',
    coverageScan: true,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(
    next.cursors['checkout-flow'],
    { lastLightAuditMs: now, lastLightHash: null },
    'the per-journey cursor must be set when target and coverageScan are both present',
  );
  assert.deepStrictEqual(
    next.cursors.__coverageScan,
    { lastScannedMs: now },
    'the coverage-scan cursor must be set when target and coverageScan are both present',
  );
  assert.deepStrictEqual(
    next.cursors['signup-flow'],
    { lastLightAuditMs: 999, lastLightHash: 'keep-me' },
    'an unrelated existing journey cursor entry must survive untouched',
  );
});

// ─── deletedFileSig, the light tier's Phase 0 acknowledgement (#131) ─────────
// scope.js's Phase 0 suppresses a repeat deleted-file force-pick by comparing
// the live missing set against this field, so what this mutator writes is the
// whole mechanism — an unwritten (or wrongly-cleared) field puts the engine
// straight back to re-picking one broken journey forever.

test('buildValidateFindingsUpdate: a light-tier update records deletedFileSig alongside the cursor bump', () => {
  const now = 8_000_000;
  const next = buildValidateFindingsUpdate(baseCurrent(), {
    target: 'checkout-flow',
    tier: 'light',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    deletedFileSig: 'src/checkout/Cart.tsx',
    now,
  });
  assert.deepStrictEqual(next.cursors['checkout-flow'], {
    lastLightAuditMs: now, lastLightHash: null, deletedFileSig: 'src/checkout/Cart.tsx',
  });
});

test('buildValidateFindingsUpdate: deletedFileSig null clears a stale acknowledgement (the file came back)', () => {
  const current = baseCurrent({
    cursors: { 'checkout-flow': { lastLightAuditMs: 500, deletedFileSig: 'src/checkout/Cart.tsx' } },
  });
  const now = 9_000_000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'checkout-flow',
    tier: 'light',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    deletedFileSig: null,
    now,
  });
  assert.deepStrictEqual(next.cursors['checkout-flow'], { lastLightAuditMs: now, lastLightHash: null });
});

test('buildValidateFindingsUpdate: an omitted deletedFileSig leaves an existing acknowledgement untouched', () => {
  const current = baseCurrent({
    cursors: { 'checkout-flow': { lastLightAuditMs: 500, deletedFileSig: 'src/checkout/Cart.tsx' } },
  });
  const next = buildValidateFindingsUpdate(current, {
    target: 'checkout-flow',
    tier: 'light',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 10_000_000,
  });
  assert.strictEqual(next.cursors['checkout-flow'].deletedFileSig, 'src/checkout/Cart.tsx');
});

test('buildValidateFindingsUpdate: a deep-tier update never writes deletedFileSig, even when handed one', () => {
  const next = buildValidateFindingsUpdate(baseCurrent(), {
    target: 'checkout-flow',
    tier: 'deep',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    deletedFileSig: 'src/checkout/Cart.tsx',
    now: 11_000_000,
  });
  assert.strictEqual(
    next.cursors['checkout-flow'].deletedFileSig, undefined,
    'Phase 0 is light-tier only — a deep audit must not suppress a light force-pick that never happened',
  );
});

test('buildValidateFindingsUpdate: passes through unrelated current fields (e.g. retryQueue) untouched', () => {
  const current = baseCurrent({ retryQueue: [{ fingerprint: 'journeyhealth-xyz', attempts: 1 }] });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    tier: undefined,
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.retryQueue, current.retryQueue);
});

// wontfixSuppressed — the durable half of the gh-absent wontfix fix (#163).
// A firing that CAN read the issue index persists its `wontfix` label
// readings, so a later index-less firing still suppresses them.

test('buildValidateFindingsUpdate: wontfixSuppressed fingerprints land in the durable declined slice', () => {
  const current = baseCurrent({ declined: {} });
  const next = buildValidateFindingsUpdate(current, {
    target: 'checkout-flow',
    tier: 'light',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    wontfixSuppressed: ['journeyhealth-aaaa0001'],
    now: 500,
  });
  assert.deepStrictEqual(
    next.declined['journeyhealth-aaaa0001'],
    { lastSeenMs: 500, origin: 'wontfix-label' },
  );
});

test('buildValidateFindingsUpdate: an existing declined entry is not clobbered by a wontfix suppression', () => {
  const current = baseCurrent({ declined: { 'journeyhealth-aaaa0001': { lastSeenMs: 1 } } });
  const next = buildValidateFindingsUpdate(current, {
    target: 'checkout-flow',
    tier: 'light',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    wontfixSuppressed: ['journeyhealth-aaaa0001'],
    now: 500,
  });
  assert.deepStrictEqual(next.declined['journeyhealth-aaaa0001'], { lastSeenMs: 1 });
});

test('buildValidateFindingsUpdate: omitting wontfixSuppressed leaves declined untouched', () => {
  const current = baseCurrent({ declined: { 'journeyhealth-bbbb0002': { lastSeenMs: 9 } } });
  const next = buildValidateFindingsUpdate(current, {
    target: 'checkout-flow',
    tier: 'light',
    coverageScan: false,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 500,
  });
  assert.deepStrictEqual(next.declined, current.declined);
});
