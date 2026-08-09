'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  actionableRanges,
  findBareReferences,
} = require('../qualified-refs.js');
const { listSkillDirs, KNOWN_SKILLS } = require('../skill-catalog.js');

const REPO = path.join(__dirname, '..', '..', '..', '..');

test('actionableRanges finds `## Step N` and `## Next Actions` sections, skips others', () => {
  const body = [
    '## When to Use',
    'descriptive prose, not scoped',
    '## Step 1: Do the thing',
    'actionable body',
    '## Overview',
    'more prose',
    '## Step 2.5: A dotted step',
    'more actionable body',
    '## Next Actions',
    'the handoff',
  ].join('\n');
  const ranges = actionableRanges(body);
  assert.strictEqual(ranges.length, 3);
  const texts = ranges.map(([s, e]) => body.slice(s, e));
  assert.ok(texts[0].startsWith('## Step 1'));
  assert.ok(texts[1].startsWith('## Step 2.5'));
  assert.ok(texts[2].startsWith('## Next Actions'));
});

test('findBareReferences flags a bare reference only inside an actionable section', () => {
  const body = [
    '## When to Use',
    'See `/build` for context.',
    '## Step 1: Invoke',
    'Now call `/build` for real.',
  ].join('\n');
  const found = findBareReferences(body, ['build']);
  assert.strictEqual(found.length, 1, 'the When to Use mention must not be flagged');
  assert.strictEqual(found[0].skillName, 'build');
});

test('findBareReferences ignores an already-qualified reference', () => {
  const body = ['## Step 1: Invoke', 'Call `/claude-tweaks:build` now.'].join('\n');
  assert.deepStrictEqual(findBareReferences(body, ['build']), []);
});

test('findBareReferences ignores a heading citation (`` `## /{skill}` ``)', () => {
  const body = [
    '## Step 1: Log',
    'Append to the auto-decision log under the `## /simplify` heading in `decisions.md`.',
  ].join('\n');
  assert.deepStrictEqual(findBareReferences(body, ['simplify']), []);
});

test('findBareReferences ignores a mid-path occurrence', () => {
  const body = ['## Step 1: Run', 'See `bin/test.js` for the runner.'].join('\n');
  assert.deepStrictEqual(findBareReferences(body, ['test']), []);
});

test('findBareReferences CATCHES a bare reference reintroduced next to a fixed one', () => {
  // Discrimination check: a single stray bare reference among otherwise-
  // qualified text must still be caught, not just gross presence/absence.
  const body = [
    '## Next Actions',
    'Run `/claude-tweaks:test` then `/review` to finish up.',
  ].join('\n');
  const found = findBareReferences(body, ['test', 'review']);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].skillName, 'review');
});

// ── Corpus-wide sweep ───────────────────────────────────────────────────

// Explicit, justified exceptions -- ratchet allowlist, empty today. Every
// pre-existing bare reference found when this lint was written (60 across 12
// skills) was fixed rather than allowlisted, per CLAUDE.md's Releasing-
// section precedent: "an allowlist entry is acceptable only where the drift
// is deliberate, with a comment saying why." Add an entry here -- keyed
// `skill-name:exact-match-text` -- only for a genuinely deliberate bare
// reference this module's structural exclusions (already-qualified, heading
// citation, mid-path) don't already cover.
const ALLOWED_BARE_REFERENCES = new Set([]);

const SKILLS = listSkillDirs(REPO);

test('the corpus resolves to every skill directory that has a SKILL.md', () => {
  assert.ok(SKILLS.length >= 30, `expected the whole skill corpus, found ${SKILLS.length}`);
  for (const known of KNOWN_SKILLS) {
    assert.ok(SKILLS.includes(known), `corpus is missing a known skill: ${known}`);
  }
});

test('every documented allowlist exception still names a skill that exists', () => {
  for (const entry of ALLOWED_BARE_REFERENCES) {
    const [skillName] = entry.split(':');
    assert.ok(SKILLS.includes(skillName), `stale allowlist entry: skills/${skillName} is gone`);
  }
});

for (const name of SKILLS) {
  test(`${name}/SKILL.md: no bare skill reference inside a Step/Next-Actions section`, () => {
    const body = fs.readFileSync(path.join(REPO, 'skills', name, 'SKILL.md'), 'utf8');
    const found = findBareReferences(body, SKILLS).filter(
      (f) => !ALLOWED_BARE_REFERENCES.has(`${name}:${f.match}`),
    );
    assert.deepStrictEqual(
      found.map((f) => f.match),
      [],
      `skills/${name}/SKILL.md has a bare reference inside a Step/Next-Actions section -- `
      + 'use the fully-qualified /claude-tweaks:{skill} form, or add a justified entry to '
      + 'ALLOWED_BARE_REFERENCES in this file',
    );
  });
}
