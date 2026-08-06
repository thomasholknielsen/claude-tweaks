'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

const CANONICAL_DIRECTIVE =
  '> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked ' +
  'Recommended. Multi-item → batch table with recommendations pre-filled, then one ' +
  '`AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each ' +
  'before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.';

function skillNames() {
  return fs
    .readdirSync(SKILLS_DIR)
    .filter((d) => fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md')))
    .sort();
}

const read = (name) => fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');

test('every skill directory with a SKILL.md is discovered', () => {
  assert.strictEqual(skillNames().length, 33);
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
  'specify', 'stories', 'test', 'version', 'wrap-up',
];

test('the 11 linear-diagram skills carry a one-line Lifecycle marker', () => {
  for (const name of LINEAR_DIAGRAM_SKILLS) {
    assert.match(read(name), /^Lifecycle: .+$/m, `${name} missing Lifecycle marker`);
  }
});

test('the 11 linear-diagram skills no longer open with a fenced block', () => {
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

test('no YOU ARE HERE marker survives in the 11 rewritten skills', () => {
  for (const name of LINEAR_DIAGRAM_SKILLS) {
    assert.ok(!read(name).includes('YOU ARE HERE'), `${name} still has YOU ARE HERE`);
  }
});

test('the 22 untouched skills keep their diagrams', () => {
  const untouched = skillNames().filter((n) => !LINEAR_DIAGRAM_SKILLS.includes(n));
  assert.strictEqual(untouched.length, 22);
  for (const name of ['code-health', 'browse', 'help', 'dispatch']) {
    const lines = read(name).split('\n');
    const h1 = lines.findIndex((l) => /^# /.test(l));
    const fence = lines.findIndex((l, i) => i > h1 && /^```/.test(l));
    assert.ok(fence > h1 && fence <= h1 + 15, `${name} lost its diagram`);
  }
});

module.exports = { CANONICAL_DIRECTIVE, skillNames, read, SKILLS_DIR, LINEAR_DIAGRAM_SKILLS };
