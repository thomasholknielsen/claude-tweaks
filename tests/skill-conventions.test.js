'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

const CANONICAL_DIRECTIVE =
  '> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked ' +
  'Recommended. Multi-item → batch table with recommendations pre-filled, then one ' +
  '`AskUserQuestion` for apply-all/override. Never more than one call per decision. End with ' +
  '`## Next Actions` via `AskUserQuestion`, not a navigation menu.';

function skillNames() {
  return fs
    .readdirSync(SKILLS_DIR)
    .filter((d) => fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md')))
    .sort();
}

const read = (name) => fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');

test('every skill directory with a SKILL.md is discovered', () => {
  assert.strictEqual(skillNames().length, 32);
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

module.exports = { CANONICAL_DIRECTIVE, skillNames, read, SKILLS_DIR };
