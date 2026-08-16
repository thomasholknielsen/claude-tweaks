'use strict';

// Corpus-wide SKILL.md house-structure guard.
//
// The per-skill checks in bin/lib/{code,docs,harness,journey}-health/tests/
// skill-md.test.js cover four skills; skills/research has its own. That left
// the rest of skills/*/SKILL.md with nothing enforcing docs/skill-authoring.md's documented
// house structure at all. This file closes that gap: it applies the subset of
// the house rules that holds for EVERY skill, to every skill.
//
// Deliberately NOT checked here:
//   - `## Component-Skill Contract` — only component skills carry it
//     (docs/skill-authoring.md's Component-skill contract section), so it is
//     a per-skill rule, not a corpus rule. The health skills' own suites
//     still assert it.
//   - `$PIPELINE_RUN_DIR` — same reason; it is the CSC's detection signal.
//   - Per-skill required tokens, CLI invocation shapes, sub-file contracts —
//     those belong to the skill's own suite.
//
// sectionIndex and EMOJI_RE are imported rather than re-implemented: an
// unanchored body.indexOf('## Next Actions') finds the backticked mention
// inside the standard interaction-style directive near the top of every
// SKILL.md, which silently makes any ordering assertion vacuous.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { sectionIndex, EMOJI_RE } = require('../health-core/skill-md-house-checks');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SKILLS_DIR = path.join(ROOT, 'skills');

// docs/skill-authoring.md's "Interaction style directive" section: this exact
// line, byte for byte, after the frontmatter of every skill. Asserting the
// whole line (not just the `> **Interaction style:**` prefix) is what makes
// "identical across all skills" enforceable.
const INTERACTION_STYLE =
  '> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option '
  + 'marked Recommended. Multi-item → batch table with recommendations pre-filled, then '
  + 'one `AskUserQuestion` for apply-all/override. Never more than one call per decision; '
  + 'resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a '
  + 'navigation menu.';

// Explicit, justified exceptions. A skill belongs here only when the rule
// genuinely cannot apply to it — never to quiet a real failure.
//
// assess-agent-autonomy: an inline helper that is never invoked directly by a
// human. Its own Component-Skill Contract states it "never renders a
// `## Next Actions` block", so requiring the section would contradict the
// skill's documented contract. The guard test below re-derives that
// justification from the file, so the exemption cannot outlive its reason.
const NO_NEXT_ACTIONS = new Set(['assess-agent-autonomy', 'routine-kickoff']);

const skills = fs
  .readdirSync(SKILLS_DIR)
  .filter((name) => fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md')))
  .sort();

const readSkill = (name) => fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');

test('the corpus resolves to every skill directory that has a SKILL.md', () => {
  // A path or glob mistake that silently matched nothing would make every
  // check below vacuous, so pin the shape of the corpus itself.
  assert.ok(skills.length >= 30, `expected the whole skill corpus, found ${skills.length}`);
  assert.ok(!skills.includes('_shared'), 'skills/_shared holds fragments, not a skill');
  for (const known of ['build', 'flow', 'review', 'wrap-up']) {
    assert.ok(skills.includes(known), `corpus is missing a known skill: ${known}`);
  }
});

test('every documented exception still names a skill that exists', () => {
  for (const name of NO_NEXT_ACTIONS) {
    assert.ok(skills.includes(name), `stale exception: skills/${name}/SKILL.md is gone`);
  }
});

test('the Next Actions exemption is justified by the exempted skill itself', () => {
  // If one of these skills ever starts rendering Next Actions, this fails and
  // the exception gets removed — rather than quietly exempting a skill that
  // now should be checked.
  for (const name of NO_NEXT_ACTIONS) {
    const body = readSkill(name);
    assert.ok(
      /never renders a `## Next Actions` block/.test(body),
      `skills/${name}/SKILL.md no longer documents why it omits Next Actions`,
    );
  }
});

for (const name of skills) {
  test(`${name}: has the required house sections in the documented order`, () => {
    const body = readSkill(name);
    const whenToUse = sectionIndex(body, '## When to Use');
    const antiPatterns = sectionIndex(body, '## Anti-Patterns');
    const nextActions = sectionIndex(body, '## Next Actions');

    assert.ok(whenToUse > 0, `skills/${name}/SKILL.md is missing '## When to Use'`);
    assert.ok(antiPatterns > 0, `skills/${name}/SKILL.md is missing '## Anti-Patterns'`);

    if (NO_NEXT_ACTIONS.has(name)) {
      assert.strictEqual(
        nextActions, -1,
        `skills/${name}/SKILL.md is exempted from '## Next Actions' but now has one — `
        + 'remove it from NO_NEXT_ACTIONS in this file',
      );
      return;
    }

    assert.ok(nextActions > 0, `skills/${name}/SKILL.md is missing '## Next Actions'`);
    assert.ok(
      nextActions < antiPatterns,
      `skills/${name}/SKILL.md orders '## Next Actions' (${nextActions}) after `
      + `'## Anti-Patterns' (${antiPatterns}); docs/skill-authoring.md requires Next Actions first`,
    );
  });

  test(`${name}: carries the standard interaction-style directive verbatim`, () => {
    assert.ok(
      readSkill(name).includes(INTERACTION_STYLE),
      `skills/${name}/SKILL.md does not carry docs/skill-authoring.md's exact interaction-style directive`,
    );
  });

  test(`${name}: contains no emojis`, () => {
    const hit = readSkill(name).match(EMOJI_RE);
    assert.ok(!hit, `skills/${name}/SKILL.md contains an emoji: ${hit && hit[0]}`);
  });
}
