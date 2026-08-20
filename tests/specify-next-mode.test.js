'use strict';

// Conformance pins (#967): /specify's headless `next` form (SKILL.md case 0
// + next-mode.md) and the shared headless-self-report contract it uses.
// These pin the load-bearing prose so a later edit that drops the `next`
// argument-hint/Input entry, the eligibility predicate, the claim/release
// discipline, or the citation of `_shared/headless-self-report.md` fails
// loudly instead of silently regressing the headless Routine-fired path.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractArgumentHint } = require('./argument-hint-input.test.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
// Whitespace-flattened for substring pins below: a later re-wrap of the skill
// prose must not fail a pin whose meaning is intact, only its line breaks moved.
// Never used for argument-hint extraction (extractArgumentHint needs real
// newlines to find the frontmatter fence and the line-anchored hint field).
const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

const SPECIFY_SKILL = read('plugin/skills/specify/SKILL.md');
const SPECIFY_SKILL_FLAT = readFlat('plugin/skills/specify/SKILL.md');
const NEXT_MODE_FLAT = readFlat('plugin/skills/specify/next-mode.md');
const DISPATCH_SKILL_FLAT = readFlat('plugin/skills/dispatch/SKILL.md');

test('specify argument-hint names next as the first alternative', () => {
  const hint = extractArgumentHint(SPECIFY_SKILL);
  assert.ok(hint.startsWith('<next|'), `specify argument-hint must open with the headless next form, got: ${hint}`);
});

test('specify Input documents next as the headless-safe form routing to next-mode.md', () => {
  assert.ok(SPECIFY_SKILL_FLAT.includes('**`next` (headless-safe form).**'), '`next` headless-safe form heading missing from specify Input');
  assert.ok(SPECIFY_SKILL_FLAT.includes('work-backend: github-issues` only'), 'github-issues-only restriction missing from specify Input\'s next paragraph');
  assert.ok(SPECIFY_SKILL_FLAT.includes('See `next-mode.md` in this skill\'s directory for the full procedure'), 'pointer to next-mode.md missing from specify Input\'s next paragraph');
});

test('specify resolve-input case 0 routes literal next to next-mode.md with flag rejection', () => {
  assert.ok(SPECIFY_SKILL_FLAT.includes('0. **Literal `next`**'), 'resolve-input case 0 for literal `next` missing');
  assert.ok(SPECIFY_SKILL_FLAT.includes("Read `next-mode.md` in this skill's directory and follow it in full"), 'case 0 must hand off to next-mode.md');
  assert.ok(SPECIFY_SKILL_FLAT.includes('flag-rejection step'), 'case 0 must point at next-mode.md\'s own flag-rejection step');
});

test('next-mode.md states the eligibility predicate excluding all 5 labels', () => {
  assert.ok(NEXT_MODE_FLAT.includes('carrying none of `ready`, `needs:definition`, `parked`, `parent-issue`, and `bot:in-progress`'), 'eligibility predicate must exclude ready, needs:definition, parked, parent-issue, and bot:in-progress');
});

test('next-mode.md states priority-then-age single selection', () => {
  assert.match(NEXT_MODE_FLAT, /priority:high.*priority:medium.*priority:low.*oldest `createdAt` first/s);
});

test('next-mode.md states the zero-eligible clean no-op', () => {
  assert.ok(NEXT_MODE_FLAT.includes('nothing eligible this firing'), 'zero-eligible no-op message missing');
  assert.ok(NEXT_MODE_FLAT.includes('no self-report, no notification'), 'zero-eligible exit must not self-report');
});

test('next-mode.md states claim-time live re-read with clean no-op on contest', () => {
  assert.ok(NEXT_MODE_FLAT.includes("Re-read the selected record's live labels immediately before claiming"), 'claim-time live re-read missing');
  assert.ok(NEXT_MODE_FLAT.includes('exit as a clean no-op for this firing'), 'clean no-op on ineligible re-read/contested claim missing');
});

test('next-mode.md states release-on-every-path claim handling', () => {
  assert.ok(NEXT_MODE_FLAT.includes('on the success path AND on every failure path below this point'), 'release must run on every path');
  assert.ok(NEXT_MODE_FLAT.includes('try/finally semantics'), 'try/finally framing for Release missing');
});

test('next-mode.md states the github-issues-only Preflight hard stop', () => {
  assert.ok(NEXT_MODE_FLAT.includes('**`work-backend: local-files`**'), 'local-files Preflight stop trigger missing');
  assert.ok(NEXT_MODE_FLAT.includes('headless shaping is `github-issues` only'), 'github-issues-only restriction missing from Preflight');
  assert.ok(NEXT_MODE_FLAT.includes('stop this turn completely'), 'hard-stop wording missing from Preflight');
});

test('next-mode.md states self-report on Preflight and shaping-stage failure', () => {
  assert.ok(NEXT_MODE_FLAT.includes('_shared/headless-self-report.md'), 'next-mode.md must cite the shared self-report contract');
  assert.ok(NEXT_MODE_FLAT.includes('any post-claim shaping-stage failure'), 'shaping-stage failure trigger missing from Failure self-report');
});

test('_shared/headless-self-report.md exists and both consumers cite it', () => {
  const sharedPath = path.join(ROOT, 'plugin', 'skills', '_shared', 'headless-self-report.md');
  assert.ok(fs.existsSync(sharedPath), 'expected plugin/skills/_shared/headless-self-report.md to exist');
  assert.ok(DISPATCH_SKILL_FLAT.includes('_shared/headless-self-report.md'), 'dispatch/SKILL.md must cite _shared/headless-self-report.md');
  assert.ok(NEXT_MODE_FLAT.includes('_shared/headless-self-report.md'), 'next-mode.md must cite _shared/headless-self-report.md');
});

test('dispatch/headless-self-report.md no longer exists (extracted, not duplicated)', () => {
  const oldPath = path.join(ROOT, 'plugin', 'skills', 'dispatch', 'headless-self-report.md');
  assert.ok(!fs.existsSync(oldPath), 'expected dispatch/headless-self-report.md to be deleted after extraction to _shared/');
});
