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
const SKILLS_DIR = path.join(ROOT, 'plugin', 'skills');

// docs/skill-authoring.md's "Interaction style directive" section: this exact
// line, byte for byte, after the frontmatter of every skill. Asserting the
// whole line (not just the `> **Interaction style:**` prefix) is what makes
// "identical across all skills" enforceable.
const INTERACTION_STYLE =
  '> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option '
  + 'marked Recommended. Multi-item → batch table with recommendations pre-filled, then '
  + 'one `AskUserQuestion` for apply-all/override. Never more than one call per decision; '
  + 'resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready '
  + 'fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` '
  + 'there only for a documented machine-consumed decision, named inline.';

// Explicit, justified exceptions. A skill belongs here only when the rule
// genuinely cannot apply to it — never to quiet a real failure.
//
// assess-agent-autonomy: an inline helper that is never invoked directly by a
// human. Its own Component-Skill Contract states it "never renders a
// `## Next Actions` block", so requiring the section would contradict the
// skill's documented contract. The guard test below re-derives that
// justification from the file, so the exemption cannot outlive its reason.
//
// routine-kickoff: machine-invoked only, by a routine kernel's closing line —
// it is a wrapper that passes control entirely to its target skill, so the
// terminal output the user sees is the target skill's own Next Actions (if
// any), never this skill's.
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

// #646: terminal `## Next Actions` renders as plain markdown, never an
// `AskUserQuestion` menu (docs/skill-authoring.md's Skill handoffs convention).
// A skill's Next Actions section may mention AskUserQuestion only for a
// documented machine-consumed terminal decision, listed here with its
// justification. Empty today — the reservation exists in the convention;
// no current skill uses it. (flow/failure-cards.md's claims-release decision
// is a sub-file, outside this SKILL.md-scoped pin.)
const TERMINAL_ASK_EXCEPTIONS = new Set([]);

test('no SKILL.md instructs a terminal-menu AskUserQuestion outside the documented reservation', () => {
  for (const name of skills) {
    if (NO_NEXT_ACTIONS.has(name) || TERMINAL_ASK_EXCEPTIONS.has(name)) continue;
    const body = readSkill(name);
    const start = sectionIndex(body, '## Next Actions');
    if (start === -1) continue; // absence is the house-order test's concern
    const rest = body.slice(start + '## Next Actions'.length);
    const end = rest.search(/^## /m);
    const section = end === -1 ? rest : rest.slice(0, end);
    assert.ok(
      !section.includes('AskUserQuestion'),
      `skills/${name}/SKILL.md's Next Actions section still instructs an AskUserQuestion terminal menu`,
    );
  }
});

test('every terminal-ask exception still names a skill that exists', () => {
  // Mirrors NO_NEXT_ACTIONS's own staleness guard above — vacuous while the
  // set is empty, armed the moment a first exception lands.
  for (const name of TERMINAL_ASK_EXCEPTIONS) {
    assert.ok(skills.includes(name), `stale exception: skills/${name}/SKILL.md is gone`);
  }
});

test('the terminal-ask exception is still exercised by the excepted skill itself', () => {
  // If an excepted skill stops using AskUserQuestion in its Next Actions
  // section, the exception is stale — remove it so the pin covers that skill
  // again. Same re-derivation shape as the NO_NEXT_ACTIONS justification guard.
  for (const name of TERMINAL_ASK_EXCEPTIONS) {
    const body = readSkill(name);
    const start = sectionIndex(body, '## Next Actions');
    assert.ok(start > 0, `skills/${name}/SKILL.md is excepted but has no Next Actions section`);
    const rest = body.slice(start + '## Next Actions'.length);
    const end = rest.search(/^## /m);
    const section = end === -1 ? rest : rest.slice(0, end);
    assert.ok(
      section.includes('AskUserQuestion'),
      `skills/${name}/SKILL.md no longer uses AskUserQuestion in Next Actions — remove the stale exception`,
    );
  }
});
