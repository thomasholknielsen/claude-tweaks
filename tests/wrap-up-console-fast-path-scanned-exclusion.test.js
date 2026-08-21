// tests/wrap-up-console-fast-path-scanned-exclusion.test.js — #899
//
// The Wrap-Up Review Console's Empty-console fast path required "decisions.md
// has zero entries," but the curation engine (bin/lib/wrap-up/engine-record.js)
// writes a SCANNED audit line for every registry row — closed rows included —
// at `plan` time, so decisions.md always holds at least one entry by the time
// the fast path is evaluated. The condition was unsatisfiable: dead code.
//
// The fix redefines the test to count only decision-bearing entries (AUTO /
// STAGED / KEPT-PROMPT / REFUSED) — SCANNED lines are excluded, alongside the
// pre-existing unconditional-bookkeeping-cleanup carve-out. This suite pins
// (a) the prose actually states the SCANNED exclusion in every file that
// restates the condition, (b) the old bare "zero entries" phrasing is gone
// from plugin/skills/wrap-up/ (AC2's literal grep), and (c) a small mirror of
// the documented counting rule, run against constructed decisions.md
// fixtures, proves the combined exclusion (SCANNED-only + bookkeeping
// carve-out) is now a reachable skip — not just each exclusion alone.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.join(__dirname, '..', 'plugin', 'skills');
const read = (...p) => fs.readFileSync(path.join(SKILLS, ...p), 'utf8');

const REVIEW_CONSOLE = read('wrap-up', 'review-console.md');
const WRAP_UP_SKILL = read('wrap-up', 'SKILL.md');
const MULTISPEC_CONSOLE = read('flow', 'multispec-review-console.md');
const REVIEW_CONSOLE_INTERACTIVE = read('wrap-up', 'review-console-interactive.md');
const CONSOLE_TEMPLATE = read('wrap-up', 'console-template.md');
const ADR_CURATION = read('wrap-up', 'adr-curation.md');

test('AC2: no file under plugin/skills/wrap-up/ states the old bare "zero entries" condition', () => {
  const WRAP_UP_DIR = path.join(SKILLS, 'wrap-up');
  const files = fs.readdirSync(WRAP_UP_DIR).filter((f) => f.endsWith('.md'));
  for (const f of files) {
    const content = fs.readFileSync(path.join(WRAP_UP_DIR, f), 'utf8');
    assert.doesNotMatch(content, /zero entries/, `${f} still states the old bare "zero entries" condition`);
  }
});

test('review-console.md: Empty-console fast path names the SCANNED exclusion alongside the bookkeeping carve-out', () => {
  assert.match(REVIEW_CONSOLE, /no decision-bearing entries/);
  assert.match(REVIEW_CONSOLE, /`AUTO` \/ `STAGED` \/ `KEPT-PROMPT` \/ `REFUSED`/);
  assert.match(REVIEW_CONSOLE, /`SCANNED` audit lines are excluded/);
  // The pre-existing bookkeeping carve-out must still be present — this is an
  // added exclusion, not a replacement.
  assert.match(REVIEW_CONSOLE, /Cleanup rows that are unconditional bookkeeping/);
});

test('SKILL.md Phase 4 restatement carries the same SCANNED exclusion', () => {
  assert.match(WRAP_UP_SKILL, /decisions\.md.*no decision-bearing entries.*SCANNED.*excluded/s);
});

test('multispec-review-console.md cites review-console.md\'s test rather than re-deriving it', () => {
  assert.match(MULTISPEC_CONSOLE, /passes `wrap-up\/review-console\.md`'s Empty-console fast path decision-bearing-entries test/);
  // Must not independently restate a bare zero-entries condition either.
  assert.doesNotMatch(MULTISPEC_CONSOLE, /decisions\.md` has zero entries/);
});

test('AC4: terminal option descriptions no longer claim unconditional "no further prompts"', () => {
  assert.match(
    REVIEW_CONSOLE_INTERACTIVE,
    /no further prompts except rows marked drills-individually/,
    'Approve all + merge option description must condition its "no further prompts" claim'
  );
  assert.match(
    CONSOLE_TEMPLATE,
    /no further prompts, except rows marked drills-individually/,
    'console-template.md preamble must condition its "no further prompts" claim'
  );
});

test('review-console-interactive.md Hard requirements defines the drills-individually class once', () => {
  assert.match(REVIEW_CONSOLE_INTERACTIVE, /The "drills individually" class/);
  assert.match(REVIEW_CONSOLE_INTERACTIVE, /\[adr-convention\]` row \(one three-way `AskUserQuestion`/);
  assert.match(REVIEW_CONSOLE_INTERACTIVE, /restructural/);
  assert.match(REVIEW_CONSOLE_INTERACTIVE, /_shared\/batched-item-drill\.md.*multiSelect chunking/);
});

test('AC3: the [adr-convention] post-Approve-all outcome is specified, not left unanswered', () => {
  // No prose path may claim Approve all simply "leaves it unanswered" any more.
  for (const [name, content] of [
    ['review-console-interactive.md', REVIEW_CONSOLE_INTERACTIVE],
    ['console-template.md', CONSOLE_TEMPLATE],
  ]) {
    assert.doesNotMatch(content, /leaves it unanswered/, `${name} still claims the row is left unanswered`);
    assert.doesNotMatch(content, /leaves any `\[\{genre\}-convention\}\]` row unanswered/, `${name} still claims the row is left unanswered`);
    assert.doesNotMatch(content, /unanswered and blocks every/, `${name} still uses the retired "unanswered and blocks" phrasing`);
  }
  assert.match(REVIEW_CONSOLE_INTERACTIVE, /still fires its own three-way `AskUserQuestion`/);
  assert.match(ADR_CURATION, /drills-individually class/);
});

// ---------------------------------------------------------------------------
// Mirror of the documented counting rule (prose has no executable form of its
// own — this is a hand-rolled classifier over the same vocabulary
// `_shared/auto-decision-log.md` defines, used only to prove the combined
// condition is now satisfiable).
// ---------------------------------------------------------------------------

const DECISION_BEARING_STATUSES = ['AUTO', 'STAGED', 'KEPT-PROMPT', 'REFUSED'];

function hasDecisionBearingEntry(decisionsMdContent) {
  return decisionsMdContent
    .split('\n')
    .some((line) => DECISION_BEARING_STATUSES.some((status) => line.trim().startsWith(`- ${status} `) || line.trim().startsWith(`${status} `)));
}

test('fixture: a decisions.md holding only SCANNED lines has no decision-bearing entry (fast path reachable)', () => {
  const decisionsMd = [
    '# Auto-Decision Log — pipeline 2026-08-21T000000-spec-899',
    '',
    '## /wrap-up',
    '- SCANNED 12:00:00 — claude-md-curation: gate closed (n/a); read 1 (CLAUDE.md); gap detection: run. Result: clean. Reversibility: N/A.',
    '- SCANNED 12:00:01 — skill-curation: gate closed (n/a); read 3 (none); gap detection: run. Result: clean. Reversibility: N/A.',
  ].join('\n');
  assert.equal(hasDecisionBearingEntry(decisionsMd), false, 'an all-SCANNED log must read as having no decision-bearing entry');
});

test('fixture: a decisions.md with SCANNED plus a real AUTO finding still has a decision-bearing entry (fast path does not fire)', () => {
  const decisionsMd = [
    '# Auto-Decision Log — pipeline 2026-08-21T000000-spec-899',
    '',
    '## /wrap-up',
    '- SCANNED 12:00:00 — claude-md-curation: gate open (CLAUDE.md changed); read 1 (CLAUDE.md); gap detection: run. Result: 1 applied. Reversibility: high (separate commit).',
    '- AUTO 12:00:01 — claude-md-curation: applied CLAUDE.md finding #3. Reversibility: high (commit abc1234).',
  ].join('\n');
  assert.equal(hasDecisionBearingEntry(decisionsMd), true, 'a log carrying a real AUTO finding alongside SCANNED must still read as decision-bearing');
});

test('fixture: combined with the bookkeeping-cleanup carve-out, a SCANNED-only + archival-only run is a reachable skip', () => {
  // Mirrors review-console.md's full condition: no decision-bearing entries,
  // empty staged/, and the only "cleanup action" present is the unconditional
  // run-dir-archival bookkeeping row, which the carve-out excludes from the
  // cleanup-actions-apply test.
  const decisionsMd = [
    '# Auto-Decision Log — pipeline 2026-08-21T000000-spec-899',
    '',
    '## /wrap-up',
    '- SCANNED 12:00:00 — claude-md-curation: gate closed (n/a); read 1 (CLAUDE.md); gap detection: run. Result: clean. Reversibility: N/A.',
  ].join('\n');
  const stagedIsEmpty = true;
  const onlyCleanupActionIsUnconditionalArchival = true; // item 8 — excluded by the carve-out
  const noQueueMemoryOrUpstreamPending = true;

  const fastPathFires =
    !hasDecisionBearingEntry(decisionsMd) &&
    stagedIsEmpty &&
    onlyCleanupActionIsUnconditionalArchival && // does NOT count as "cleanup actions apply"
    noQueueMemoryOrUpstreamPending;

  assert.equal(fastPathFires, true, 'the two exclusions must compose to a reachable skip, not just each alone');
});
