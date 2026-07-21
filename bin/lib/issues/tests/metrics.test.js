'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { computeStageDurations, computeWontfixRate, summarizeFunnel } = require('../metrics');

// Real fixture captured from this repo's own issue #21 via:
//   gh issue view 21 --json createdAt,closedAt
//   gh api repos/{owner}/{repo}/issues/21/timeline --jq '.[] | select(.event == "labeled" or .event == "unlabeled")'
// #21 was built by direct human /flow invocation, never triaged — so it has no
// auto:build/auto:merge label. This is exactly the "still missing a later
// transition" case: shapingMs is present, grantMs/buildMs are not.
// The real API returns `label` as an object ({name, color}), not a plain
// string — the fixture below matches that real shape (previously hand-flattened
// to plain strings, which masked a bug where the comparison never matched).
const ISSUE_21_FIXTURE = {
  createdAt: '2026-07-15T08:29:30Z',
  closedAt: '2026-07-19T14:46:04Z',
  events: [
    { event: 'labeled', label: { name: 'by:capture', color: '5319e7' }, created_at: '2026-07-15T08:29:31Z' },
    { event: 'labeled', label: { name: 'type:feature', color: 'a2eeef' }, created_at: '2026-07-15T08:29:31Z' },
    { event: 'labeled', label: { name: 'priority:medium', color: 'fbca04' }, created_at: '2026-07-19T07:21:32Z' },
    { event: 'labeled', label: { name: 'ready', color: '0e8a16' }, created_at: '2026-07-19T14:40:42Z' },
    { event: 'labeled', label: { name: 'risk:low', color: 'c2e0c6' }, created_at: '2026-07-19T14:40:42Z' },
    { event: 'labeled', label: { name: 'effort:medium', color: 'c2e0c6' }, created_at: '2026-07-19T14:40:42Z' },
    { event: 'labeled', label: { name: 'demo:pending', color: 'd4c5f9' }, created_at: '2026-07-19T14:46:59Z' },
  ],
};

test('computeStageDurations against the real #21 fixture: only shapingMs is present', () => {
  const durations = computeStageDurations(ISSUE_21_FIXTURE);
  assert.strictEqual(durations.shapingMs, 367872000);
  assert.strictEqual('grantMs' in durations, false, 'no auto:build/auto:merge label in this fixture');
  assert.strictEqual('buildMs' in durations, false, 'grantMs missing means buildMs cannot be computed either');
});

test('computeStageDurations computes all three durations when every transition is present', () => {
  const durations = computeStageDurations({
    createdAt: '2026-01-01T00:00:00Z',
    closedAt: '2026-01-10T00:00:00Z',
    events: [
      { event: 'labeled', label: 'ready', created_at: '2026-01-03T00:00:00Z' },
      { event: 'labeled', label: 'auto:build', created_at: '2026-01-05T00:00:00Z' },
    ],
  });
  const DAY = 24 * 60 * 60 * 1000;
  assert.strictEqual(durations.shapingMs, 2 * DAY);
  assert.strictEqual(durations.grantMs, 2 * DAY);
  assert.strictEqual(durations.buildMs, 5 * DAY);
});

test('computeStageDurations uses whichever authorization label comes first, auto:build or auto:merge', () => {
  const durations = computeStageDurations({
    createdAt: '2026-01-01T00:00:00Z',
    closedAt: '2026-01-10T00:00:00Z',
    events: [
      { event: 'labeled', label: 'ready', created_at: '2026-01-02T00:00:00Z' },
      { event: 'labeled', label: 'auto:merge', created_at: '2026-01-03T00:00:00Z' },
      { event: 'labeled', label: 'auto:build', created_at: '2026-01-04T00:00:00Z' },
    ],
  });
  const DAY = 24 * 60 * 60 * 1000;
  assert.strictEqual(durations.grantMs, 1 * DAY, 'should use auto:merge (earlier), not auto:build');
});

test('computeStageDurations on a record with no events at all returns an empty object', () => {
  assert.deepStrictEqual(computeStageDurations({ createdAt: '2026-01-01T00:00:00Z', events: [] }), {});
});

test('computeStageDurations treats a truthy-but-unparseable createdAt like the missing case (omits shapingMs), never leaks a NaN', () => {
  const durations = computeStageDurations({
    createdAt: 'not-a-real-date',
    closedAt: '2026-01-10T00:00:00Z',
    events: [
      { event: 'labeled', label: 'ready', created_at: '2026-01-03T00:00:00Z' },
      { event: 'labeled', label: 'auto:build', created_at: '2026-01-05T00:00:00Z' },
    ],
  });
  assert.strictEqual('shapingMs' in durations, false, 'a malformed createdAt must omit shapingMs, not set it to NaN');
  // grantMs/buildMs don't depend on createdAt at all and must still compute normally.
  assert.strictEqual(typeof durations.grantMs, 'number');
  assert.strictEqual(typeof durations.buildMs, 'number');
});

test('computeStageDurations treats a truthy-but-unparseable closedAt like the missing case (omits buildMs), never leaks a NaN', () => {
  const durations = computeStageDurations({
    createdAt: '2026-01-01T00:00:00Z',
    closedAt: 'also-not-a-real-date',
    events: [
      { event: 'labeled', label: 'ready', created_at: '2026-01-03T00:00:00Z' },
      { event: 'labeled', label: 'auto:build', created_at: '2026-01-05T00:00:00Z' },
    ],
  });
  assert.strictEqual('buildMs' in durations, false, 'a malformed closedAt must omit buildMs, not set it to NaN');
  assert.strictEqual(typeof durations.shapingMs, 'number');
  assert.strictEqual(typeof durations.grantMs, 'number');
});

test('summarizeFunnel computes the median across an odd-length sample', () => {
  const perIssue = [{ shapingMs: 100 }, { shapingMs: 300 }, { shapingMs: 200 }];
  const summary = summarizeFunnel(perIssue, {}, { failedAttempts: 0, totalAttempts: 0 });
  assert.strictEqual(summary.transitions.shapingMs.medianMs, 200);
  assert.strictEqual(summary.transitions.shapingMs.sampleSize, 3);
});

test('summarizeFunnel computes the median across an even-length sample', () => {
  const perIssue = [{ shapingMs: 100 }, { shapingMs: 200 }, { shapingMs: 300 }, { shapingMs: 400 }];
  const summary = summarizeFunnel(perIssue, {}, { failedAttempts: 0, totalAttempts: 0 });
  assert.strictEqual(summary.transitions.shapingMs.medianMs, 250);
});

test('summarizeFunnel reports independent sample sizes per transition when issues stop at different stages', () => {
  const perIssue = [
    { shapingMs: 100 }, // never reached ready->grant
    { shapingMs: 200, grantMs: 50 }, // never reached grant->build
    { shapingMs: 150, grantMs: 60, buildMs: 400 },
  ];
  const summary = summarizeFunnel(perIssue, {}, { failedAttempts: 0, totalAttempts: 0 });
  assert.strictEqual(summary.transitions.shapingMs.sampleSize, 3);
  assert.strictEqual(summary.transitions.grantMs.sampleSize, 2);
  assert.strictEqual(summary.transitions.buildMs.sampleSize, 1);
});

test('summarizeFunnel omits a transition entirely when no sampled issue reached it', () => {
  const perIssue = [{ shapingMs: 100 }];
  const summary = summarizeFunnel(perIssue, {}, { failedAttempts: 0, totalAttempts: 0 });
  assert.strictEqual('grantMs' in summary.transitions, false);
  assert.strictEqual('buildMs' in summary.transitions, false);
});

test('summarizeFunnel computes retryRate from failedAttempts/totalAttempts', () => {
  const summary = summarizeFunnel([], {}, { failedAttempts: 3, totalAttempts: 12 });
  assert.strictEqual(summary.retryRate, 25);
});

test('summarizeFunnel retryRate is 0 when totalAttempts is 0, no division-by-zero error', () => {
  const summary = summarizeFunnel([], {}, { failedAttempts: 0, totalAttempts: 0 });
  assert.strictEqual(summary.retryRate, 0);
});

test('computeWontfixRate buckets by origin label and computes rate as a percentage', () => {
  const closedIssues = [
    { number: 1, labels: ['by:code-health'], stateReason: 'NOT_PLANNED' },
    { number: 2, labels: ['by:code-health'], stateReason: 'COMPLETED' },
    { number: 3, labels: ['by:code-health'], stateReason: 'COMPLETED' },
    { number: 4, labels: ['by:capture'], stateReason: 'COMPLETED' },
    { number: 5, labels: [], stateReason: 'NOT_PLANNED' }, // no by:* label -> 'human'
  ];
  const rates = computeWontfixRate(closedIssues);
  assert.deepStrictEqual(rates['code-health'], { total: 3, wontfix: 1, rate: (1 / 3) * 100 });
  assert.deepStrictEqual(rates['capture'], { total: 1, wontfix: 0, rate: 0 });
  assert.deepStrictEqual(rates['human'], { total: 1, wontfix: 1, rate: 100 });
});

test('computeWontfixRate attributes a bare pre-migration origin label (code-health/harness-health, no by: prefix) correctly instead of falling back to "human"', () => {
  const closedIssues = [
    { number: 1, labels: ['code-health'], stateReason: 'NOT_PLANNED' },
    { number: 2, labels: ['harness-health'], stateReason: 'COMPLETED' },
  ];
  const rates = computeWontfixRate(closedIssues);
  assert.deepStrictEqual(rates['code-health'], { total: 1, wontfix: 1, rate: 100 });
  assert.deepStrictEqual(rates['harness-health'], { total: 1, wontfix: 0, rate: 0 });
  assert.strictEqual('human' in rates, false, 'must not misattribute bare pre-migration labels to human');
});

test('computeWontfixRate on an empty list returns an empty object', () => {
  assert.deepStrictEqual(computeWontfixRate([]), {});
});

test('computeWontfixRate handles real gh issue list label shape ({name, color} objects), not just plain strings', () => {
  const closedIssues = [
    { number: 1, labels: [{ id: 1, name: 'by:code-health', color: '5319e7' }], stateReason: 'NOT_PLANNED' },
    { number: 2, labels: [{ id: 2, name: 'by:code-health', color: '5319e7' }], stateReason: 'COMPLETED' },
  ];
  assert.doesNotThrow(() => computeWontfixRate(closedIssues));
  const rates = computeWontfixRate(closedIssues);
  assert.deepStrictEqual(rates['code-health'], { total: 2, wontfix: 1, rate: 50 });
});
