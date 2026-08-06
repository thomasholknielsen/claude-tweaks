'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractRelationshipRows, bodyOutsideSection } = require('../relationship-rows.js');

const SECTION = [
  '## Relationship to Other Skills',
  '',
  '| Skill | Relationship |',
  '|-------|-------------|',
  '| `/claude-tweaks:build` | Produces the code review reads |',
  '| `_shared/work-record.md` | Taxonomy home |',
].join('\n');

test('extractRelationshipRows: parses target and description, skipping header and rule', () => {
  const rows = extractRelationshipRows(`# Skill\n\nProse.\n\n${SECTION}\n`);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].target, '`/claude-tweaks:build`');
  assert.strictEqual(rows[0].description, 'Produces the code review reads');
  assert.strictEqual(rows[1].target, '`_shared/work-record.md`');
});

test('extractRelationshipRows: reports 1-based line numbers', () => {
  const rows = extractRelationshipRows(`line1\n${SECTION}\n`);
  // line1=1, heading=2, blank=3, header=4, rule=5, first row=6
  assert.strictEqual(rows[0].line, 6);
});

test('extractRelationshipRows: handles the section being last in the file', () => {
  // 31 of 32 skills are shaped this way — the case an ad-hoc walker gets wrong.
  assert.strictEqual(extractRelationshipRows(SECTION).length, 2);
});

test('extractRelationshipRows: stops at the next ## heading', () => {
  const rows = extractRelationshipRows(`${SECTION}\n\n## Background\n\n| a | b |\n`);
  assert.strictEqual(rows.length, 2);
});

test('extractRelationshipRows: returns [] when there is no such section', () => {
  assert.deepStrictEqual(extractRelationshipRows('# Skill\n\n## Anti-Patterns\n'), []);
});

test('extractRelationshipRows: keeps an escaped pipe inside a description', () => {
  const md = `${SECTION}\n| \`/x\` | reads a \\| b |\n`;
  const rows = extractRelationshipRows(md);
  assert.strictEqual(rows[2].description, 'reads a \\| b');
});

test('bodyOutsideSection: excludes the section and keeps everything else', () => {
  const body = bodyOutsideSection(`# Skill\n\nUses \`work-record.md\` in Step 3.\n\n${SECTION}\n`);
  assert.ok(body.includes('Step 3'));
  assert.ok(!body.includes('Taxonomy home'));
});

test('bodyOutsideSection: returns the whole document when there is no section', () => {
  assert.strictEqual(bodyOutsideSection('# Skill\n'), '# Skill\n');
});

test('no skill carries a Relationship section any more', () => {
  // This assertion used to read `assert.strictEqual(total, 510)`. Phase 2b removed the
  // convention outright — 127.6 KB of author-facing meta that every skill invocation
  // paid for, describing edges the running model never acts on. The edges now live once
  // in docs/skill-graph.md, which ships to nobody.
  //
  // The parser keeps its unit tests above and gains a second job here: the guard that
  // stops the convention creeping back one skill at a time.
  const skillsDir = path.join(__dirname, '..', '..', '..', '..', 'skills');
  const names = fs
    .readdirSync(skillsDir)
    .filter((n) => fs.existsSync(path.join(skillsDir, n, 'SKILL.md')))
    .sort();
  assert.strictEqual(names.length, 33);

  for (const name of names) {
    const md = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
    assert.strictEqual(
      extractRelationshipRows(md).length,
      0,
      `${name}/SKILL.md has a Relationship section again — put the edge in docs/skill-graph.md`,
    );
  }
});
