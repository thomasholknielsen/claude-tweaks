'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { selectByStaleThenChurn } = require('../../../plugin/bin/lib/health-core/rotation');

const STALE_DAYS = 30;
const DAY_MS = 86400000;

function baseOpts(overrides = {}) {
  return {
    now: 0,
    staleDays: STALE_DAYS,
    getCursorKey: (c) => c.id,
    getLastAuditedMs: (cursor) => (cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null),
    computeScore: (candidate, cursor, sinceMs) => 0, // overridden per test
    ...overrides,
  };
}

test('returns null for an empty candidate list', () => {
  assert.strictEqual(selectByStaleThenChurn([], {}, baseOpts()), null);
});

test('Phase 1: force-picks the MOST overdue candidate, not the first one in list order (#130)', () => {
  // `a` sorts first AND is genuinely stale — under the old first-qualifying-wins
  // rule it won outright, which is exactly what starved the tail of the list.
  const candidates = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const cursors = {
    a: { lastAuditedMs: -(STALE_DAYS + 5) * DAY_MS },
    b: { lastAuditedMs: -(STALE_DAYS + 40) * DAY_MS },
    c: { lastAuditedMs: -(STALE_DAYS + 12) * DAY_MS },
  };
  const result = selectByStaleThenChurn(candidates, cursors, baseOpts());
  assert.strictEqual(result.id, 'b');
  assert.strictEqual(result.why, 'stale');
  assert.strictEqual(result.daysSinceLastAudit, STALE_DAYS + 40);
});

test('Phase 1: a never-audited candidate (Infinity) outranks an audited-but-stale one that sorts earlier', () => {
  const candidates = [{ id: 'a' }, { id: 'b' }];
  const cursors = { a: { lastAuditedMs: -(STALE_DAYS + 5) * DAY_MS }, b: {} };
  const result = selectByStaleThenChurn(candidates, cursors, baseOpts());
  assert.strictEqual(result.id, 'b', 'never audited is infinitely overdue, so it beats any finite staleness');
  assert.strictEqual(result.why, 'stale');
});

test('Phase 1: equal staleness is tie-broken by tieBreakKey, not by list order', () => {
  const candidates = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
  const sameStaleness = -(STALE_DAYS + 3) * DAY_MS;
  const cursors = {
    a: { lastAuditedMs: sameStaleness },
    b: { lastAuditedMs: sameStaleness },
    c: { lastAuditedMs: sameStaleness },
  };
  const result = selectByStaleThenChurn(candidates, cursors, baseOpts());
  assert.strictEqual(result.id, 'a', 'a three-way staleness tie must resolve to the lexicographically smallest id');
});

test('Phase 1: a candidate set larger than staleDays still reaches its last element (#130)', () => {
  // The starvation model, run forward: N candidates, one pick per "day", each
  // pick stamping that candidate's cursor. Under first-qualifying-wins the
  // head of the list re-crossed the threshold on day `staleDays` and was
  // re-picked forever, so anything past position ≈ staleDays was never
  // audited. With max-staleness selection the whole set must be covered.
  const N = STALE_DAYS * 3; // 90 candidates vs. a 30-day threshold
  const candidates = Array.from({ length: N }, (_, i) => ({ id: `s${String(i).padStart(3, '0')}` }));
  const last = candidates[N - 1].id;

  const cursors = {}; // everyone starts never-audited
  const audited = new Set();
  let day = 0;
  for (; day < N * 2; day++) {
    const now = day * DAY_MS;
    const pick = selectByStaleThenChurn(candidates, cursors, baseOpts({
      now,
      computeScore: () => null, // no Phase 2 signal — Phase 1 is the only selector under test
    }));
    if (!pick) continue; // nothing stale yet this day
    audited.add(pick.id);
    cursors[pick.id] = { lastAuditedMs: now };
    if (audited.has(last)) break;
  }

  assert.ok(audited.has(last), `the last candidate (${last}) must be reached within ${N * 2} runs, got ${audited.size}/${N} audited`);
  assert.strictEqual(audited.size, N, 'every candidate must be audited before any is repeated');
  assert.strictEqual(day, N - 1, 'coverage must be one distinct candidate per run, with no wasted repeats');
});

test('Phase 1: a never-audited candidate (no cursor entry) is treated as infinitely stale', () => {
  const candidates = [{ id: 'a' }];
  const result = selectByStaleThenChurn(candidates, {}, baseOpts());
  assert.strictEqual(result.why, 'stale');
  assert.strictEqual(result.daysSinceLastAudit, null, 'Infinity rounds to null, not a numeric value');
});

test('Phase 1: exactly at the threshold is NOT stale (strictly greater-than)', () => {
  const candidates = [{ id: 'a' }];
  const cursors = { a: { lastAuditedMs: -STALE_DAYS * DAY_MS } };
  const result = selectByStaleThenChurn(candidates, cursors, baseOpts({
    computeScore: () => null, // nothing scores -> Phase 2 also empty -> null
  }));
  assert.strictEqual(result, null, 'exactly at the threshold must fall through to Phase 2, not force-pick');
});

test('Phase 2: excludes a candidate whose computeScore returns null', () => {
  const candidates = [{ id: 'a' }, { id: 'b' }];
  const cursors = { a: { lastAuditedMs: 0 }, b: { lastAuditedMs: 0 } }; // fresh — not Phase-1-stale
  const result = selectByStaleThenChurn(candidates, cursors, baseOpts({
    computeScore: (c) => (c.id === 'a' ? null : 5),
  }));
  assert.strictEqual(result.id, 'b');
});

test('Phase 2: a score of exactly 0 is included (not treated as exclusion) — the code-health hash-changed-but-zero-churn case', () => {
  const candidates = [{ id: 'a' }];
  const cursors = { a: { lastAuditedMs: 0 } }; // fresh — not Phase-1-stale
  const result = selectByStaleThenChurn(candidates, cursors, baseOpts({
    computeScore: () => 0,
  }));
  assert.ok(result, 'a score of 0 must still be a valid Phase 2 pick, not silently dropped');
  assert.strictEqual(result.id, 'a');
  assert.strictEqual(result.churnCount, 0);
});

test('Phase 2: returns null when every candidate is excluded (all computeScore -> null)', () => {
  const candidates = [{ id: 'a' }, { id: 'b' }];
  const cursors = { a: { lastAuditedMs: 0 }, b: { lastAuditedMs: 0 } }; // fresh — not Phase-1-stale
  const result = selectByStaleThenChurn(candidates, cursors, baseOpts({ computeScore: () => null }));
  assert.strictEqual(result, null);
});

test('Phase 2: picks the highest score, tie-broken by id ascending', () => {
  const candidates = [{ id: 'b' }, { id: 'a' }, { id: 'c' }];
  const cursors = { a: { lastAuditedMs: 0 }, b: { lastAuditedMs: 0 }, c: { lastAuditedMs: 0 } }; // fresh
  const scores = { a: 3, b: 3, c: 1 };
  const result = selectByStaleThenChurn(candidates, cursors, baseOpts({
    computeScore: (c) => scores[c.id],
  }));
  assert.strictEqual(result.id, 'a', 'a tie between a and b at score 3 must resolve to the lexicographically smaller id');
});

test('a custom getCursorKey and getLastAuditedMs (namespaced key, tier-dependent field) are honored', () => {
  const candidates = [{ kind: 'rule', id: 'x' }];
  const cursors = { 'rule:x': { lastDeepAuditMs: -(STALE_DAYS + 1) * DAY_MS, lastLightAuditMs: 0 } };
  const result = selectByStaleThenChurn(candidates, cursors, baseOpts({
    getCursorKey: (c) => `${c.kind}:${c.id}`,
    getLastAuditedMs: (cursor) => (cursor && cursor.lastDeepAuditMs != null ? cursor.lastDeepAuditMs : null),
  }));
  assert.strictEqual(result.why, 'stale', 'must read the tier-specific field, not lastLightAuditMs (which is fresh)');
});

test('buildStaleResult/buildHotspotResult overrides change the returned shape (code-health omits the extra fields)', () => {
  const candidates = [{ id: 'a' }];
  const staleResult = selectByStaleThenChurn(candidates, {}, baseOpts({
    buildStaleResult: (candidate) => ({ ...candidate, why: 'stale' }),
  }));
  assert.deepStrictEqual(staleResult, { id: 'a', why: 'stale' });

  const hotspotResult = selectByStaleThenChurn(candidates, { a: { lastAuditedMs: 0 } }, baseOpts({
    computeScore: () => 7,
    buildHotspotResult: (candidate) => ({ ...candidate, why: 'hotspot' }),
  }));
  assert.deepStrictEqual(hotspotResult, { id: 'a', why: 'hotspot' });
});

test('computeScore receives (candidate, cursor, sinceMs) so per-candidate churn-since-last-audit can be computed', () => {
  const candidates = [{ id: 'a' }];
  const cursors = { a: { lastAuditedMs: 12345 } };
  let seenSinceMs = null;
  selectByStaleThenChurn(candidates, cursors, baseOpts({
    computeScore: (candidate, cursor, sinceMs) => { seenSinceMs = sinceMs; return 1; },
  }));
  assert.strictEqual(seenSinceMs, 12345);
});

test('sinceMs resolves to 0 for a literal epoch-0 lastAuditedMs (the || 0 fallback must not treat a real zero as absent)', () => {
  // A cursor with NO lastAuditedMs at all can never reach Phase 2 to exercise
  // this: getLastAuditedMs returning null always reads as infinitely stale in
  // Phase 1, so it force-picks before Phase 2 (and computeScore) ever runs —
  // that path is already covered by the Phase 1 "never-audited" test above.
  // What's left to verify here is the boundary case one layer in: a cursor
  // that legitimately WAS audited at epoch 0 (falsy, but not absent) must
  // still flow through as sinceMs === 0, not get corrupted by the `|| 0`
  // fallback into something else.
  const candidates = [{ id: 'a' }];
  const cursors = { a: { lastAuditedMs: 0 } };
  let seenSinceMs = 'unset';
  selectByStaleThenChurn(candidates, cursors, baseOpts({
    computeScore: (candidate, cursor, sinceMs) => { seenSinceMs = sinceMs; return 1; },
  }));
  assert.strictEqual(seenSinceMs, 0);
});
