'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { evaluateGrantGate } = require('../../../plugin/bin/lib/issues/grant-gate.js');

// Fixture: an agent-filed, clean-trust, low-risk record — every gate clear.
// Individual tests mutate one dimension at a time (record labels/facets, policy,
// or grantCheck) to isolate exactly one failing key per #269 AC2 ("a single
// combined scenario cannot attribute the refusal" — IL-105).
function baseRecord(overrides) {
  return {
    number: 201,
    labels: ['by:code-health', 'ready', 'risk:low', 'size:low'],
    body: 'Surface: backend\n\n## Current State\n...\n\n## Deliverables\n- [ ] x\n\n## Acceptance Criteria\n1. x\n\n### Key Files\n\n- bin/lib/foo.js\n',
    keyFiles: ['bin/lib/foo.js'],
    ...overrides,
  };
}

function basePolicy(overrides) {
  return {
    ceiling: 'unattended',
    grantOriginationEnabled: true,
    sensitivePaths: [],
    ...overrides,
  };
}

const cleanVerdict = new Map([['producer:code-health|low', { verdict: 'clean', kind: 'producer', dispositioned: 9, coverage: 0.9 }]]);

const clearGrantCheck = { clear: true, rationale: 'well-scoped, low-risk change' };

test('AC1: all keys satisfied grants auto:build + auto:merge', () => {
  const result = evaluateGrantGate({
    record: baseRecord(),
    policy: basePolicy(),
    trustVerdicts: cleanVerdict,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, true);
  assert.equal(result.autoMerge, true);
  assert.equal(result.failedKey, null);
});

test('phase 1 (no grantCheck passed) reports needsGrantCheck when gates 1-3 clear', () => {
  const result = evaluateGrantGate({
    record: baseRecord(),
    policy: basePolicy(),
    trustVerdicts: cleanVerdict,
  });
  assert.equal(result.grant, false);
  assert.equal(result.needsGrantCheck, true);
  assert.equal(result.failedKey, null);
});

test('AC2 key 1: ceiling trusted (not unattended) refuses, named in failedKey', () => {
  const result = evaluateGrantGate({
    record: baseRecord(),
    policy: basePolicy({ ceiling: 'trusted' }),
    trustVerdicts: cleanVerdict,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.autoMerge, false);
  assert.equal(result.failedKey, 'ceiling');
});

test('AC2 key 2: grant-origination opt-in unset refuses even at unattended', () => {
  const result = evaluateGrantGate({
    record: baseRecord(),
    policy: basePolicy({ grantOriginationEnabled: false }),
    trustVerdicts: cleanVerdict,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'grant-origination-opt-in');
});

test('AC2 key 3: no cell at all for this class refuses (distinct from a present insufficient-evidence row)', () => {
  const result = evaluateGrantGate({
    record: baseRecord(),
    policy: basePolicy(),
    trustVerdicts: new Map(), // no closed records for this class yet — no cell
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'trust');
  assert.match(result.reason, /no-cell/);
});

test('AC2 key 3c: a present row whose own verdict is insufficient-evidence refuses, and names that exact string', () => {
  const thin = new Map([['producer:code-health|low', { verdict: 'insufficient-evidence', kind: 'producer' }]]);
  const result = evaluateGrantGate({
    record: baseRecord(),
    policy: basePolicy(),
    trustVerdicts: thin,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'trust');
  assert.match(result.reason, /insufficient-evidence/);
});

test('AC2 key 3b: class trust mixed refuses, names the actual verdict string', () => {
  const mixed = new Map([['producer:code-health|low', { verdict: 'mixed', kind: 'producer' }]]);
  const result = evaluateGrantGate({
    record: baseRecord(),
    policy: basePolicy(),
    trustVerdicts: mixed,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'trust');
  assert.match(result.reason, /mixed/);
});

test('AC2 key 4: record with no by:* label refuses (origin gate)', () => {
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['ready', 'risk:low', 'size:low'] }),
    policy: basePolicy(),
    trustVerdicts: new Map([['human:human|low', { verdict: 'clean', kind: 'human' }]]),
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'origin');
});

test('AC3: a human-filed record refuses even with every other key satisfied (own scenario)', () => {
  // Every other key deliberately clear: ceiling unattended + opt-in, trust
  // clean for the human:human class, grant-check clear, no floors — only the
  // by:* origin is missing.
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['ready', 'risk:low', 'size:low'] }),
    policy: basePolicy(),
    trustVerdicts: new Map([['human:human|low', { verdict: 'clean', kind: 'human' }]]),
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'origin');
});

test('AC2 key 5: grant-check flagging refuses', () => {
  const result = evaluateGrantGate({
    record: baseRecord(),
    policy: basePolicy(),
    trustVerdicts: cleanVerdict,
    grantCheck: { clear: false, rationale: 'body proposes an irreversible external action' },
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'grant-check');
  assert.match(result.reason, /irreversible/);
});

test('AC2 key 6: merge-sensitive-paths match on the record\'s Key Files refuses', () => {
  const result = evaluateGrantGate({
    record: baseRecord({ keyFiles: ['bin/hooks.js'] }),
    policy: basePolicy({ sensitivePaths: ['bin/hooks.js'] }),
    trustVerdicts: cleanVerdict,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'merge-sensitive-paths');
});

test('AC2 key 7 / #366 AC11: risk:high refuses via the oversight floor', () => {
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:high', 'size:low'] }),
    policy: basePolicy(),
    trustVerdicts: new Map([['producer:code-health|elevated', { verdict: 'clean', kind: 'producer' }]]),
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'oversight-floor');
});

test('#366 AC12: risk:medium + size:high now refuses too (old check never read size)', () => {
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:medium', 'size:high'] }),
    policy: basePolicy(),
    trustVerdicts: new Map([['producer:code-health|elevated', { verdict: 'clean', kind: 'producer' }]]),
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'oversight-floor');
});

test('#366: riskFloor/sizeFloor default to \'high\' when policy omits them (medium tier still grants)', () => {
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:medium', 'size:medium'] }),
    policy: basePolicy(), // no riskFloor/sizeFloor keys at all
    trustVerdicts: new Map([['producer:code-health|elevated', { verdict: 'clean', kind: 'producer' }]]),
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, true);
  assert.equal(result.failedKey, null);
});

test('AC2 key 8: fleet daily grant cap spent refuses', () => {
  const result = evaluateGrantGate({
    record: baseRecord(),
    policy: basePolicy({ dailyGrantCap: 3, grantsIssuedToday: 3 }),
    trustVerdicts: cleanVerdict,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'daily-grant-cap');
});

test('AC4: cap check with no cap key configured passes (optional-when-absent)', () => {
  const result = evaluateGrantGate({
    record: baseRecord(),
    policy: basePolicy({ grantsIssuedToday: 9999 }), // no dailyGrantCap set at all
    trustVerdicts: cleanVerdict,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, true);
  assert.equal(result.failedKey, null);
});

test('cap under the configured limit still grants', () => {
  const result = evaluateGrantGate({
    record: baseRecord(),
    policy: basePolicy({ dailyGrantCap: 3, grantsIssuedToday: 2 }),
    trustVerdicts: cleanVerdict,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, true);
});

test('gate order: ceiling failure short-circuits before trust/origin/grant-check are even consulted', () => {
  // Every other key deliberately broken too — only the ceiling failure should
  // be attributed, proving evaluation order and short-circuit.
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['ready', 'risk:high', 'size:low'] }), // no by:*, risk:high
    policy: basePolicy({ ceiling: 'supervised', grantOriginationEnabled: false }),
    trustVerdicts: new Map(), // no-cell
    grantCheck: { clear: false },
  });
  assert.equal(result.failedKey, 'ceiling');
});

test('re-authorization (bot:blocked) path is unaffected by this module — it is a caller-level distinction', () => {
  // grant-gate itself doesn't special-case bot:blocked records; the mode's own
  // prose treats a passing gate result on a bot:blocked record as
  // "re-authorize" rather than "first grant" (auto:merge withheld regardless
  // of autoMerge, per grant-mode.md). Confirm the gate's own output shape does
  // not vary by bot state so that distinction is safe to layer on top.
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:low', 'size:low', 'bot:blocked'] }),
    policy: basePolicy(),
    trustVerdicts: cleanVerdict,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, true);
});
