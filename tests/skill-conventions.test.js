'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { listSkillDirs, KNOWN_SKILLS } = require('../bin/lib/skill-audit/skill-catalog');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const ROOT = path.join(__dirname, '..');

const CANONICAL_DIRECTIVE =
  '> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked ' +
  'Recommended. Multi-item → batch table with recommendations pre-filled, then one ' +
  '`AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each ' +
  'before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified ' +
  'commands, recommended first and bold, one per line — `AskUserQuestion` there only for a ' +
  'documented machine-consumed decision, named inline.';

function skillNames() {
  return listSkillDirs(ROOT);
}

const read = (name) => fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');

test('every skill directory with a SKILL.md is discovered', () => {
  // Directory-derived, not a hard-coded literal (was `33` -- see skill-catalog.js's
  // header for why that stopped being a real check). The floor + known-name
  // assertions are what actually catches a broken glob/filter.
  assert.ok(skillNames().length >= 30, `expected the whole skill corpus, found ${skillNames().length}`);
  for (const known of KNOWN_SKILLS) {
    assert.ok(skillNames().includes(known), `corpus is missing a known skill: ${known}`);
  }
});

test('every skill carries the canonical compressed interaction directive', () => {
  for (const name of skillNames()) {
    assert.ok(read(name).includes(CANONICAL_DIRECTIVE), `${name} missing canonical directive`);
  }
});

test('no skill retains the superseded long-form directive', () => {
  for (const name of skillNames()) {
    assert.ok(
      !read(name).includes('Present single decisions via the `AskUserQuestion` tool'),
      `${name} still carries the long-form directive`
    );
  }
});

test('the directive keeps the prefix five existing tests assert on', () => {
  assert.ok(CANONICAL_DIRECTIVE.startsWith('> **Interaction style:**'));
  for (const name of skillNames()) {
    assert.ok(read(name).includes('> **Interaction style:**'), `${name} lost the prefix`);
  }
});

const LINEAR_DIAGRAM_SKILLS = [
  'capture', 'challenge', 'design-wrapper', 'feedback', 'init', 'review',
  'specify', 'stories', 'test', 'wrap-up',
];

test('the 10 linear-diagram skills carry a one-line Lifecycle marker', () => {
  for (const name of LINEAR_DIAGRAM_SKILLS) {
    assert.match(read(name), /^Lifecycle: .+$/m, `${name} missing Lifecycle marker`);
  }
});

test('the 10 linear-diagram skills no longer open with a fenced block', () => {
  for (const name of LINEAR_DIAGRAM_SKILLS) {
    const lines = read(name).split('\n');
    const h1 = lines.findIndex((l) => /^# /.test(l));
    const fence = lines.findIndex((l, i) => i > h1 && /^```/.test(l));
    assert.ok(
      fence === -1 || fence > h1 + 15,
      `${name} still opens with a fenced block at line ${fence + 1}`
    );
  }
});

test('no YOU ARE HERE marker survives in the 10 rewritten skills', () => {
  for (const name of LINEAR_DIAGRAM_SKILLS) {
    assert.ok(!read(name).includes('YOU ARE HERE'), `${name} still has YOU ARE HERE`);
  }
});

test('the skills outside LINEAR_DIAGRAM_SKILLS keep their diagrams', () => {
  const untouched = skillNames().filter((n) => !LINEAR_DIAGRAM_SKILLS.includes(n));
  // Directory-derived, not a hard-coded `22` -- this still catches a real
  // regression: if LINEAR_DIAGRAM_SKILLS names a skill directory that no
  // longer exists, the arithmetic below goes out of sync with the filter.
  assert.strictEqual(
    untouched.length,
    skillNames().length - LINEAR_DIAGRAM_SKILLS.length,
    'LINEAR_DIAGRAM_SKILLS contains a name that is not a real skill directory',
  );
  for (const name of ['code-health', 'browse', 'help', 'dispatch', 'research']) {
    const lines = read(name).split('\n');
    const h1 = lines.findIndex((l) => /^# /.test(l));
    const fence = lines.findIndex((l, i) => i > h1 && /^```/.test(l));
    assert.ok(fence > h1 && fence <= h1 + 15, `${name} lost its diagram`);
  }
});

test('no skill carries a Relationship section any more', () => {
  // Relocated from bin/lib/skill-audit/tests/relationship-rows.test.js when
  // relationship-rows.js was deleted as consumerless (#392) -- that file's own
  // corpus-wide guard used the module's extractRelationshipRows parser, which no
  // longer exists. This is a plain heading scan instead: Phase 2b removed the
  // `## Relationship to Other Skills` convention outright (see docs/skill-graph.md),
  // and this is the guard that stops it creeping back one skill at a time.
  for (const name of skillNames()) {
    assert.ok(
      !/^##\s+Relationship to Other Skills/m.test(read(name)),
      `${name}/SKILL.md has a Relationship section again — put the edge in docs/skill-graph.md`,
    );
  }
});

test('challenge SKILL.md Input section names all three input forms', () => {
  const body = read('challenge');
  const input = body.split(/^## Input$/m)[1].split(/^## /m)[0];
  assert.ok(/framing-check/.test(input), 'Input section must name framing-check');
  assert.ok(/bare record reference/.test(input), 'Input section must name the bare record-reference form');
  assert.ok(/--lens=/.test(input), 'Input section must name --lens');
});

test('challenge SKILL.md keeps the bare-#N mode section', () => {
  const body = read('challenge');
  assert.ok(/^## Mode: bare `#N` \(evidence-or-accept-risk\)$/m.test(body), 'the bare-#N mode section must exist');
});

module.exports = { CANONICAL_DIRECTIVE, skillNames, read, SKILLS_DIR, LINEAR_DIAGRAM_SKILLS };
