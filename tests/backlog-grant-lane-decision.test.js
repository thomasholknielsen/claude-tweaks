'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

const REFINE_MODE_FLAT = readFlat('plugin/skills/backlog/refine-mode.md');

test('grant-lane-decision.md exists and documents the RECOMMEND_BUILD: false branch', () => {
  const p = path.join(ROOT, 'plugin', 'skills', 'backlog', 'grant-lane-decision.md');
  assert.ok(fs.existsSync(p), 'expected plugin/skills/backlog/grant-lane-decision.md to exist');
  const flat = readFlat('plugin/skills/backlog/grant-lane-decision.md');
  assert.ok(flat.includes('flag back'), 'flag-back branch missing from grant-lane-decision.md');
  assert.ok(flat.includes('needs:decision'), 'needs:decision branch missing from grant-lane-decision.md');
  assert.ok(flat.includes('<!-- needs-decision: {unit} -->') || flat.includes('needs-decision: {unit}'), 'decision-comment marker missing from grant-lane-decision.md');
  assert.ok(flat.includes('grant despite the flag, or build it yourself'), 'canonical Proposed text missing');
  assert.ok(flat.includes('/claude-tweaks:backlog refine #{n}'), 'canonical Command text missing');
  assert.ok(flat.includes('contains("**Resolved:**")'), 'idempotence check must exclude already-resolved comments');
});

test('refine-mode.md Step 3 cites grant-lane-decision.md for the RECOMMEND_BUILD: false branch', () => {
  assert.ok(REFINE_MODE_FLAT.includes('grant-lane-decision.md'), 'refine-mode.md Step 3 must cite grant-lane-decision.md');
});

test('refine-mode.md Step 3.5 body-shape re-verification also covers records headed to needs:decision', () => {
  assert.ok(REFINE_MODE_FLAT.includes('grant-lane-decision.md'), 'Step 3.5 population must reference the needs:decision branch via grant-lane-decision.md');
});

test('refine-mode.md Step 5 has a Needs-decision rows subsection pointing at grant-lane-decision.md', () => {
  assert.ok(REFINE_MODE_FLAT.includes('Needs-decision rows'), 'Step 5 Needs-decision rows subsection missing');
});

// Go-red control: pre-#1488 Step 3 had exactly a two-bullet RECOMMEND_BUILD:true/false shape with
// no mention of needs:decision or grant-lane-decision.md at all.
const PRE_CHANGE_STEP_3_BULLETS = '- **`RECOMMEND_BUILD: true`** → `auto:build` (append `+ auto:merge` when `RECOMMEND_MERGE` is also `true`).\n- **`RECOMMEND_BUILD: false`** → `flag back (needs scoring)`. The human may supply scoring inline as a free-text override instead of flagging back — the gate then stamps the supplied `risk:*`/ `size:*` labels alongside the grant (Step 5).';

test('go-red control: pre-change Step 3 bullets do not cite grant-lane-decision.md or needs:decision', () => {
  assert.ok(!PRE_CHANGE_STEP_3_BULLETS.includes('grant-lane-decision.md'), 'control must not already cite grant-lane-decision.md');
  assert.ok(!PRE_CHANGE_STEP_3_BULLETS.includes('needs:decision'), 'control must not already mention needs:decision');
});
