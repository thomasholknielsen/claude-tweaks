// tests/flow-cleanup-only-conformance.test.js — #298: pins both halves of the `cleanup-only`
// fix so either regressing independently fails a test. Live-reads the two prose files rather
// than a frozen fixture — both are current, actively-maintained skill docs, not historical
// snapshots — per the skill-prose-conformance-tests convention.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TWO_CALL_GATE = fs.readFileSync(
  path.join(__dirname, '..', 'plugin', 'skills', 'dispatch', 'two-call-gate.md'), 'utf8',
);
const STEPS_AND_GATES = fs.readFileSync(
  path.join(__dirname, '..', 'plugin', 'skills', 'flow', 'steps-and-gates.md'), 'utf8',
);

test('two-call-gate.md §5\'s teardown command literal invokes cleanup-only', () => {
  assert.match(
    TWO_CALL_GATE,
    /PIPELINE_RUN_DIR="\{run-dir\}" CLAIM_RUN_ID="\{RUN_ID\}" \/claude-tweaks:flow \{target\} wrap-up cleanup-only/,
  );
});

test('two-call-gate.md no longer narrates the ledger-gate stall as an open, accepted risk', () => {
  assert.strictEqual((TWO_CALL_GATE.match(/Accepted, tracked risk/g) || []).length, 0);
});

test("steps-and-gates.md's Partial step lists section names the cleanup-only skip condition", () => {
  assert.match(
    STEPS_AND_GATES,
    /`cleanup-only` produces this same branch even when `wrap-up` IS in the step list/,
  );
  assert.match(STEPS_AND_GATES, /render the identical `## Flow: Steps Complete` note/);
});
