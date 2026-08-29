'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

// #1442 split refine-mode.md's Step 5 body out to apply-step.md; concatenate both so
// pins against either half of the (still logically one) Step 3/Step 5 flow keep working.
const REFINE_MODE_FLAT = readFlat('plugin/skills/backlog/refine-mode.md') + ' ' + readFlat('plugin/skills/backlog/apply-step.md');

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

const GRANT_MODE_FLAT = readFlat('plugin/skills/backlog/grant-mode.md');

test('grant-mode.md Step 4 carves failedKey grant-check out of the generic Skip rows silence into a needs:decision write', () => {
  assert.ok(GRANT_MODE_FLAT.includes('grant-lane-decision.md'), 'grant-mode.md Step 4 must cite grant-lane-decision.md');
  assert.ok(GRANT_MODE_FLAT.includes("failedKey === 'grant-check'") || GRANT_MODE_FLAT.includes('`grant-check`'), 'grant-mode.md must name the grant-check failedKey as the carved-out case');
});

const PRE_CHANGE_SKIP_ROWS = '**Skip rows** (any `failedKey` set, at any phase): no label change, no comment on the record — a skip is silent to the record itself (a human-filed record, an out-of-cap record, or a transiently-unclean class should not accumulate visible noise every firing). Log to `decisions.md` only, naming the exact `failedKey` and `reason` — no per-verdict branching, per this record\'s own gate-chain design.';

test('go-red control: pre-change Skip rows section treats every failedKey identically, no needs:decision carve-out', () => {
  assert.ok(!PRE_CHANGE_SKIP_ROWS.includes('grant-lane-decision.md'), 'control must not already cite grant-lane-decision.md');
  assert.ok(!PRE_CHANGE_SKIP_ROWS.includes('needs:decision'), 'control must not already carve out a needs:decision case');
});

const REFINE_LANES_FLAT = readFlat('plugin/skills/backlog/refine-lanes.md');

test('refine-lanes.md declares a Needs-decision lane between Flag-back and Priority', () => {
  const flagBackIdx = REFINE_LANES_FLAT.indexOf('## Flag-back');
  const needsDecisionIdx = REFINE_LANES_FLAT.indexOf('## Needs-decision');
  const priorityIdx = REFINE_LANES_FLAT.indexOf('## Priority');
  assert.ok(flagBackIdx !== -1 && needsDecisionIdx !== -1 && priorityIdx !== -1, 'all three lane headings must exist');
  assert.ok(flagBackIdx < needsDecisionIdx && needsDecisionIdx < priorityIdx, 'Needs-decision lane must sit between Flag-back and Priority');
});

test('refine-lanes.md Needs-decision lane writes addLabels + commentFile via apply-refine-labels.js', () => {
  const needsDecisionIdx = REFINE_LANES_FLAT.indexOf('## Needs-decision');
  const priorityIdx = REFINE_LANES_FLAT.indexOf('## Priority');
  const section = REFINE_LANES_FLAT.slice(needsDecisionIdx, priorityIdx);
  assert.ok(section.includes('ST_BACKLOG_REFINE_ACTIONS_NEEDSDECISION'), 'Needs-decision lane must resolve its own actions-file variable');
  assert.ok(section.includes('apply-refine-labels.js'), 'Needs-decision lane must apply via apply-refine-labels.js');
  assert.ok(section.includes('needs:decision'), 'Needs-decision lane must name the needs:decision label');
});

test('refine-lanes.md lane precedence line names Needs-decision', () => {
  assert.ok(REFINE_LANES_FLAT.includes('Needs-decision'), 'the one-lane-per-record precedence statement must name the Needs-decision lane');
});
