'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// CLAUDE.md is inherited by every dispatched subagent (72-144 per /dispatch run),
// so bytes here are the most expensive bytes in the repo. #233/#234 landed the file
// at ~51.8 KB against a ~22 KB aspiration — not a miss, a stale estimate: `## Don'ts`
// holds 139 bullets carrying 116 immutable [IL-nn] tags, each pinned to a real
// incident and never renumbered once shipped, which is a ~28 KB floor at the
// mandated rule+clause shape (the spec's ~90-rule estimate undercounted this).
// BUDGET_BYTES is measured-landing (51,809 B) rounded up to the next KiB (51 KiB = 52,224 B)
// plus 2 KiB headroom. Shrinking further means fewer bullets — rule-expiry via
// /claude-tweaks:harness-health, or merging duplicate-tag pairs — which needs its
// own decision, not a quiet edit here.
// Lowering this budget as the file shrinks is encouraged; raising it is an
// explicit decision with the incident-log discipline behind it (ADR-0010 regrew
// 77% with nothing watching).
const BUDGET_BYTES = 54272;

test('CLAUDE.md stays within its context-cost budget', () => {
  const size = fs.statSync(path.join(__dirname, '..', 'CLAUDE.md')).size;
  assert.ok(
    size <= BUDGET_BYTES,
    `CLAUDE.md is ${size} B, over its ${BUDGET_BYTES} B budget. Every dispatched agent inherits ` +
      'this file; evict or compress per docs/skill-authoring.md and ADR-0010 rather than raising the budget.',
  );
});
