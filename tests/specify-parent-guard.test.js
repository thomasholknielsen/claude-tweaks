'use strict';

// Prose-pin for /specify's parent-record guard (refs #1071). The guard is
// documented in prose only (skill markdown), so a later slimming pass could
// silently drop it without any test noticing — mirrors
// tests/specify-range-form-readback.test.js's rationale.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

test('specify SKILL.md case 1 defines the parent-record guard before the needs:definition redirect', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  const guardIdx = src.indexOf('**Parent-record guard (before the `needs:definition` check');
  const redirectIdx = src.indexOf('**`needs:definition` redirect (single-record path only).**');
  assert.ok(guardIdx !== -1, 'Parent-record guard paragraph marker missing from SKILL.md case 1');
  assert.ok(redirectIdx !== -1, 'needs:definition redirect paragraph missing from SKILL.md case 1');
  assert.ok(guardIdx < redirectIdx, 'parent-record guard must precede the needs:definition redirect within case 1');
});

test('specify SKILL.md defines exactly the two documented detection tiers', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes('tier 1 (authoritative)'), 'tier 1 definition missing');
  assert.ok(src.includes('Tier 2 (legacy sniff)'), 'tier 2 definition missing');
  assert.ok(src.includes('driver-exclusive'), 'driver-exclusive label/facet clause missing');
  assert.ok(src.includes('line-anchored `## Leaves` heading'), 'line-anchored Leaves sniff definition missing');
});

test('specify SKILL.md tier-1 behavior: hard stop, static-prose leaves pointer, exact residue-strip set', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes('hard stop, no prompt'), 'tier-1 hard-stop clause missing');
  assert.ok(src.includes('the guard makes no additional API call for this pointer'), 'static-prose/no-API-call leaves-pointer clause missing');
  assert.ok(src.includes('`ready`, `risk:*`, `size:*`, `ceremony:*`, `solution:unjustified`'), 'exact residue-strip label set missing');
  assert.ok(src.includes('silent means no prompt, never unreported'), 'strip-always-reported clause missing');
});

test('specify SKILL.md tier-2 behavior: repair/shape-anyway prompt, one-shot escape, headless refusal', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes('stamp `parent-issue`'), 'tier-2 repair option missing');
  assert.ok(src.includes('one-shot escape'), 'one-shot shape-anyway escape missing');
  assert.ok(src.includes('nothing is persisted, so the guard re-prompts'), 'no-persisted-suppressor clause missing');
  assert.ok(src.includes('refuse without repair'), 'headless refuse-without-repair clause missing');
  assert.ok(src.includes("the skill's returned output under `--chained`"), 'chained refusal-delivery clause missing');
  assert.ok(src.includes("the firing's reported outcome under `next`"), 'next refusal-delivery clause missing');
});

test('specify SKILL.md batch branch fails all on a parent element and refuses tier-2 without prompting', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes('A **parent element** (either tier) likewise fails the whole invocation'), 'batch parent-element fail-all clause missing');
  assert.ok(src.includes('a prompt could not change the batch'), 'batch tier-2 no-prompt rationale missing');
  assert.ok(src.includes('to repair interactively'), 'batch single-record repair pointer missing');
  assert.ok(src.includes('still runs; the failure message names any strip that ran'), 'batch strip-reporting clause missing');
});

test('specify SKILL.md case 5 fetches the matched record fully and applies the case-1 guard by reference', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes("the search's narrow field set above is for matching only"), 'case-5 full-fetch rationale missing');
  assert.ok(src.includes("apply case 1's **parent-record guard** by reference"), 'case-5 guard citation missing');
});

test('specify SKILL.md guard states its scope: every shaping entry, cases 2-4 out by construction', () => {
  const src = readFlat('plugin/skills/specify/SKILL.md');
  assert.ok(src.includes('covers every shaping entry'), 'guard scope sentence missing');
  assert.ok(src.includes('out of guard scope by construction'), 'cases-2-4 exclusion clause missing');
});
