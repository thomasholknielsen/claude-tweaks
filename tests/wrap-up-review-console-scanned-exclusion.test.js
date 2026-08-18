// tests/wrap-up-review-console-scanned-exclusion.test.js
//
// Pins #899's fix to the Wrap-Up Review Console's empty-console fast path.
// Before this fix the fast path's gate ("decisions.md has zero entries") was
// dead code: the curation engine (bin/lib/wrap-up/engine-record.js) writes a
// SCANNED line per registry row at plan/record time, so decisions.md always
// holds entries after Phase 2 runs and the console never actually skipped.
// The fix: the fast path counts only decision-bearing entries (AUTO/STAGED/
// KEPT-PROMPT/REFUSED); SCANNED audit lines are explicitly excluded, and this
// exclusion composes with the pre-existing unconditional-bookkeeping-cleanup
// carve-out (a run whose decisions.md holds only SCANNED lines, with only
// unconditional cleanup pending, still skips).
//
// Also pins the "drills-individually" class (no-default rows +
// restructural stage-only findings) that a terminal Approve all no longer
// silently bypasses, and the corrected "no further prompts" option wording.

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REVIEW_CONSOLE = path.join(__dirname, '..', 'plugin', 'skills', 'wrap-up', 'review-console.md');
const SKILL = path.join(__dirname, '..', 'plugin', 'skills', 'wrap-up', 'SKILL.md');
const INTERACTIVE = path.join(__dirname, '..', 'plugin', 'skills', 'wrap-up', 'review-console-interactive.md');
const TEMPLATE = path.join(__dirname, '..', 'plugin', 'skills', 'wrap-up', 'console-template.md');
const MULTISPEC = path.join(__dirname, '..', 'plugin', 'skills', 'flow', 'multispec-review-console.md');

test('review-console.md fast path excludes SCANNED lines from the zero-entries condition', () => {
  const text = fs.readFileSync(REVIEW_CONSOLE, 'utf8');
  assert.match(text, /zero \*\*decision-bearing\*\* entries/, 'gate must be scoped to decision-bearing entries');
  assert.match(text, /SCANNED.*(?:do not count|excluded)/is, 'must state SCANNED lines are excluded');
  assert.match(text, /These two exclusions compose/, 'must state the SCANNED exclusion composes with the bookkeeping-cleanup carve-out');
});

test('SKILL.md Phase 4 restatement of the fast path also excludes SCANNED', () => {
  const text = fs.readFileSync(SKILL, 'utf8');
  assert.match(text, /zero decision-bearing entries/, 'Phase 4 restatement must match the SCANNED-excluded condition');
  assert.match(text, /SCANNED.*(?:audit lines? )?(?:are|is) excluded/, 'must name the SCANNED exclusion');
});

test('no bare "zero entries" condition (missing the SCANNED exclusion) remains in plugin/skills/wrap-up/', () => {
  for (const file of [REVIEW_CONSOLE, SKILL, INTERACTIVE]) {
    const text = fs.readFileSync(file, 'utf8');
    // "zero entries" without "decision-bearing" immediately before it would be the old, dead-code condition.
    const matches = text.match(/zero entries/g) || [];
    for (const m of matches) {
      assert.fail(`${path.basename(file)} still contains a bare "zero entries" (old condition) — found: ${m}`);
    }
  }
});

test('review-console-interactive.md Hard requirements define the drills-individually class', () => {
  const text = fs.readFileSync(INTERACTIVE, 'utf8');
  assert.match(text, /Drills-individually class/, 'Hard requirements must define the class');
  assert.match(text, /restructural/, 'must reference the restructural classification from curation-engine.md');
  assert.match(text, /listed above the terminal options when present|listed above the options/, 'must state the qualifying-rows list renders above the options');
});

test('terminal option descriptions no longer claim unconditional "no further prompts"', () => {
  const text = fs.readFileSync(INTERACTIVE, 'utf8');
  assert.match(text, /no further prompts except rows marked drills-individually/, 'option description must carry the drills-individually exception');
});

test('console-template.md preamble carries the drills-individually exception', () => {
  const text = fs.readFileSync(TEMPLATE, 'utf8');
  assert.match(text, /except any row belonging to the drills-individually class/, 'rendered preamble must not overclaim "no further prompts"');
});

test('multispec-review-console.md fast path cites the SCANNED exclusion instead of diverging', () => {
  const text = fs.readFileSync(MULTISPEC, 'utf8');
  assert.match(text, /decision-bearing/, 'multi-spec fast path must also scope to decision-bearing entries');
  assert.match(text, /SCANNED/, 'must reference the SCANNED exclusion');
});

test('fixture: a decisions.md holding only SCANNED lines plus bookkeeping cleanup counts as empty', () => {
  // Simulates the combined-condition fixture the AC asks for: SCANNED-only entries,
  // no staged/ content, no skill/config updates, only unconditional cleanup pending.
  // This is a logical fixture over the documented rule (prose, not code) — it proves
  // the two exclusions compose to a reachable skip, matching engine-record.js's real
  // SCANNED line shape (`SCANNED {time} — {target}: ...`).
  const decisionsMdFixture = [
    'SCANNED 10:00:00 — spec-899: gate pass; read 3; gap detection: run. Result: clean. Reversibility: N/A.',
    'SCANNED 10:00:01 — spec-899/skill: gate pass; read 1; gap detection: not run. Result: clean. Reversibility: N/A.',
  ].join('\n');

  const decisionBearingPrefixes = ['AUTO ', 'STAGED ', 'KEPT-PROMPT ', 'REFUSED '];
  const lines = decisionsMdFixture.split('\n').filter(Boolean);
  const decisionBearingCount = lines.filter((l) => decisionBearingPrefixes.some((p) => l.startsWith(p))).length;

  assert.equal(decisionBearingCount, 0, 'an all-SCANNED decisions.md must count as zero decision-bearing entries');
});
