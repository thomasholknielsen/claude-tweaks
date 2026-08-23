'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  WEEK_MS, weeklyWindow, GRANT_AUDIT_RE, fleetPosture, deriveFleetCounters,
} = require('../../../plugin/bin/lib/issues/fleet-counters.js');

const NOW = Date.parse('2026-08-16T12:00:00Z');

test('weeklyWindow is a rolling 7x24h window ending at now, full ISO boundaries', () => {
  const w = weeklyWindow(NOW);
  assert.strictEqual(w.endMs, NOW);
  assert.strictEqual(w.endMs - w.startMs, WEEK_MS);
  assert.strictEqual(w.startIso, '2026-08-09T12:00:00.000Z');
  assert.strictEqual(w.endIso, '2026-08-16T12:00:00.000Z');
});

test('GRANT_AUDIT_RE matches the landed grant-mode audit marker shape', () => {
  assert.ok(GRANT_AUDIT_RE.test(
    '<!-- grant-mode-audit: date=2026-08-14T09:00:12Z auto-merge=false -->'));
  assert.ok(GRANT_AUDIT_RE.test(
    '<!--  grant-mode-audit:  date=2026-08-14T09:00:12Z  auto-merge=true  -->'));
  assert.ok(GRANT_AUDIT_RE.test(
    '<!-- grant-mode-audit: date=2026-08-22T11:00:00Z auto-merge=pending -->'));
  assert.ok(!GRANT_AUDIT_RE.test('Machine-granted by /claude-tweaks:backlog grant (headless).'));
});

test('fleetPosture: unattended requires grant unit + both unattended keys', () => {
  assert.strictEqual(fleetPosture({ grantUnitProvisioned: true, autonomy: 'unattended', grantOriginationEnabled: true }), 'unattended');
  assert.strictEqual(fleetPosture({ grantUnitProvisioned: false, autonomy: 'unattended', grantOriginationEnabled: true }), 'supervised');
  assert.strictEqual(fleetPosture({ grantUnitProvisioned: true, autonomy: 'supervised', grantOriginationEnabled: true }), 'supervised');
  assert.strictEqual(fleetPosture({ grantUnitProvisioned: true, autonomy: 'unattended', grantOriginationEnabled: false }), 'supervised');
});

test('fleetPosture: accepts the string-scalar shape resolve-policy.js --values emits', () => {
  assert.strictEqual(fleetPosture({ grantUnitProvisioned: true, autonomy: 'unattended', grantOriginationEnabled: 'true' }), 'unattended');
  assert.strictEqual(fleetPosture({ grantUnitProvisioned: true, autonomy: 'unattended', grantOriginationEnabled: 'false' }), 'supervised');
});

// AC1 fixture: two fleet routines, one machine grant, one human grant, one revocation.
test('deriveFleetCounters: AC1 fixture renders all three counter groups, split correct', () => {
  const input = {
    routines: [
      { name: 'acme-code-health-daily', lastFiringIso: '2026-08-15T05:00:00Z' },
      { name: 'acme-docs-health-daily', lastFiringIso: '2026-07-01T06:15:00Z' }, // outside window
    ],
    findings: [
      { number: 101, createdAtIso: '2026-08-14T05:05:00Z' },
      { number: 102, createdAtIso: '2026-08-01T05:05:00Z' }, // outside window
    ],
    grants: [
      // machine: identified by the audit-comment marker, not label history
      { number: 101, grantedAtIso: '2026-08-14T09:00:12Z',
        commentBodies: ['Machine-granted by /claude-tweaks:backlog grant (headless).\n<!-- grant-mode-audit: date=2026-08-14T09:00:12Z auto-merge=false -->'] },
      // human: no marker anywhere
      { number: 103, grantedAtIso: '2026-08-13T10:00:00Z', commentBodies: ['looks good, granting'] },
    ],
    merges: [
      { number: 99, closedAtIso: '2026-08-12T16:00:00Z', viaMergeCommit: true },
      { number: 98, closedAtIso: '2026-08-12T16:00:00Z', viaMergeCommit: false }, // closed by hand — not a merge
    ],
    negativeEvidence: [
      { trustClass: 'code-health/low', atIso: '2026-08-15T20:00:00Z', source: 'marker' },
      { trustClass: 'code-health/low', atIso: '2026-08-15T21:00:00Z', source: 'revert' }, // same class — one downgrade event
      { trustClass: 'docs-health/low', atIso: '2026-06-01T00:00:00Z', source: 'marker' }, // outside window
    ],
  };
  const c = deriveFleetCounters(input, NOW);
  assert.strictEqual(c.firings.fired, 1);
  assert.strictEqual(c.firings.total, 2);
  assert.strictEqual(c.findings, 1);
  assert.strictEqual(c.grants.machine, 1);
  assert.strictEqual(c.grants.human, 1);
  assert.strictEqual(c.merges, 1);
  assert.strictEqual(c.revocations, 1); // per class-downgrade event, not per marker
  assert.strictEqual(c.window.endIso, '2026-08-16T12:00:00.000Z');
});

test('deriveFleetCounters: window boundary is >= start (inclusive) and <= end', () => {
  const atStart = new Date(NOW - WEEK_MS).toISOString();
  const beforeStart = new Date(NOW - WEEK_MS - 1000).toISOString();
  const c = deriveFleetCounters({
    routines: [], findings: [
      { number: 1, createdAtIso: atStart },
      { number: 2, createdAtIso: beforeStart },
    ], grants: [], merges: [], negativeEvidence: [],
  }, NOW);
  assert.strictEqual(c.findings, 1);
});

test('deriveFleetCounters: empty input renders zeros, not errors (partially provisioned fleet)', () => {
  const c = deriveFleetCounters({ routines: [], findings: [], grants: [], merges: [], negativeEvidence: [] }, NOW);
  assert.deepStrictEqual(c.grants, { machine: 0, human: 0 });
  assert.strictEqual(c.firings.total, 0);
  assert.strictEqual(c.revocations, 0);
});

test('deriveFleetCounters: malformed elements degrade to not-counted, never throw', () => {
  const c = deriveFleetCounters({
    routines: [null, { name: 'x', lastFiringIso: '2026-08-15T05:00:00Z' }],
    findings: [undefined],
    grants: [{ number: 1, grantedAtIso: '2026-08-14T09:00:00Z', commentBodies: 'not-an-array' }, null],
    merges: [null],
    negativeEvidence: [{ atIso: '2026-08-15T20:00:00Z' }, null], // missing trustClass — not a revocation
  }, NOW);
  assert.strictEqual(c.firings.fired, 1);
  assert.strictEqual(c.findings, 0);
  assert.deepStrictEqual(c.grants, { machine: 0, human: 1 }); // string commentBodies = no marker seen = human
  assert.strictEqual(c.merges, 0);
  assert.strictEqual(c.revocations, 0);
});
