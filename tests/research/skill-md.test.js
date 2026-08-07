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

const VERIFY_MODE_PATH = path.join(REPO_ROOT, 'skills', 'research', 'verify-mode.md');

function readVerifyMode() {
  return fs.readFileSync(VERIFY_MODE_PATH, 'utf8');
}

test('SKILL.md exists', () => {
  assert.ok(fs.existsSync(SKILL_PATH), `Expected ${SKILL_PATH} to exist`);
});

test('SKILL.md frontmatter has required fields', () => {
  const fm = parseFrontmatter(readSkill());
  assert.ok(fm, 'frontmatter block missing');
  assert.strictEqual(fm.name, 'research');
  assert.ok(fm.description && fm.description.length > 20, 'description must be present and substantive');
  assert.match(fm.description, /research/i, 'description must mention research');
});

test('SKILL.md contains interaction style directive', () => {
  const body = readSkill();
  assert.ok(body.includes('> **Interaction style:**'));
});

test('SKILL.md has the required sections', () => {
  const body = readSkill();
  assert.match(body, /## When to Use/);
  assert.match(body, /## Anti-Patterns/);
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

test('verify-mode.md exists', () => {
  assert.ok(fs.existsSync(VERIFY_MODE_PATH), `Expected ${VERIFY_MODE_PATH} to exist`);
});

test('verify-mode.md documents the no-brief path so skipping /challenge does not skip grounding', () => {
  const body = readVerifyMode();
  // [IL-66]: tolerate both the hyphenated "No-brief case" heading and the prose
  // "a record with no brief" — the phrase appears in both shapes in the file.
  assert.match(body, /no[\s-]brief/i, 'must name the no-brief case');
  assert.match(
    body,
    /generate\s+the\s+candidate\s+set\s+from\s+the\s+topic/i,
    'must say the candidate set is generated from the topic directly',
  );
});

test('verify-mode.md resolves the bare-verify ambiguity by presenting a choice', () => {
  const body = readVerifyMode();
  assert.match(body, /ambiguous|ambiguity/i, 'must name the bare-verify ambiguity');
  assert.match(body, /AskUserQuestion/, 'must resolve it by presenting a choice, not by assuming');
});

test('verify-mode.md states that verify is not reachable from /flow', () => {
  const body = readVerifyMode();
  assert.match(body, /\/claude-tweaks:flow|\/flow/, 'must name /flow');
  assert.match(body, /not\s+reachable/i, 'must state the resolved decision explicitly');
});
