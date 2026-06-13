const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'research', 'SKILL.md');

function readSkill() {
  return fs.readFileSync(SKILL_PATH, 'utf8');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-z-]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2];
  }
  return fm;
}

test('SKILL.md exists', () => {
  assert.ok(fs.existsSync(SKILL_PATH), `Expected ${SKILL_PATH} to exist`);
});

test('SKILL.md frontmatter has required fields', () => {
  const fm = parseFrontmatter(readSkill());
  assert.ok(fm, 'frontmatter block missing');
  assert.strictEqual(fm.name, 'claude-tweaks:research');
  assert.ok(fm.description && fm.description.length > 20, 'description must be present and substantive');
  assert.match(fm.description, /research/i, 'description must mention research');
});

test('SKILL.md contains interaction style directive', () => {
  const body = readSkill();
  assert.match(body, /Interaction style:\*\* Present decisions as numbered options/);
});

test('SKILL.md has the four required sections', () => {
  const body = readSkill();
  assert.match(body, /## When to Use/);
  assert.match(body, /## Anti-Patterns/);
  assert.match(body, /## Relationship to Other Skills/);
  assert.match(body, /## Next Actions/);
});

test('SKILL.md mode picker mentions all four modes with standard recommended', () => {
  const body = readSkill();
  assert.match(body, /quick/i);
  assert.match(body, /standard/i);
  assert.match(body, /deep/i);
  assert.match(body, /ultradeep/i);
  assert.match(body, /standard.*recommended|recommended.*standard/i);
});

test('SKILL.md output path is project-local under .claude-tweaks/research/', () => {
  const body = readSkill();
  assert.match(body, /\.claude-tweaks\/research\//);
  assert.doesNotMatch(body, /~\/Documents/, 'should not reference upstream ~/Documents path');
});

test('SKILL.md describes delegation to the built-in /deep-research', () => {
  const body = readSkill();
  assert.match(body, /deep-research/, 'must reference the built-in /deep-research');
  assert.match(body, /Dynamic Workflow/i, 'must name the Dynamic Workflows feature');
});

test('SKILL.md describes an inline fallback path', () => {
  const body = readSkill();
  assert.match(body, /fallback/i, 'must describe a fallback');
  assert.match(body, /methodology\.md/, 'fallback must point at reference/methodology.md');
});

test('SKILL.md includes the built-in setup/enablement note', () => {
  const body = readSkill();
  assert.match(body, /2\.1\.154/, 'must state the minimum Claude Code version');
  assert.match(body, /disableWorkflows|CLAUDE_CODE_DISABLE_WORKFLOWS/, 'must mention how the feature is gated');
});

test('SKILL.md has a Component-Skill Contract keyed on PIPELINE_RUN_DIR', () => {
  const body = readSkill();
  assert.match(body, /## Component-Skill Contract/);
  assert.match(body, /\$PIPELINE_RUN_DIR/);
});
