const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  registerHouseSectionOrderTest,
  registerInteractionStyleTest,
  registerPipelineRunDirTest,
  registerNoEmojiTest,
  registerRequiredTokenTests,
} = require('../../health-core/tests/skill-md-house-checks');

const SKILL = path.resolve(__dirname, '..', '..', '..', '..', 'skills', 'docs-health', 'SKILL.md');
const read = () => fs.readFileSync(SKILL, 'utf8');

test('exists', () => {
  assert.ok(fs.existsSync(SKILL), `SKILL.md not found at ${SKILL}`);
});

test('frontmatter declares the canonical name', () => {
  assert.match(read(), /name:\s*claude-tweaks:docs-health/);
});

registerInteractionStyleTest(test, assert, read);

test('invokes the CLI via ${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js (not $SKILL_DIR)', () => {
  const body = read();
  assert.ok(body.includes('${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js'));
  assert.ok(!body.includes('$SKILL_DIR'), 'must not use the non-existent $SKILL_DIR variable');
});

test('documents the dry-run-first procedure and hands payloads to gh', () => {
  const body = read();
  assert.ok(body.includes('--dry-run'));
  assert.ok(/gh issue create/.test(body));
});

registerHouseSectionOrderTest(test, assert, read);
registerPipelineRunDirTest(test, assert, read);

test('Relationship table references harness-health, code-health, tidy, triage, routine', () => {
  const body = read();
  for (const s of [
    '/claude-tweaks:harness-health', '/claude-tweaks:code-health', '/claude-tweaks:tidy',
    '/claude-tweaks:triage', '/claude-tweaks:routine',
  ]) {
    assert.ok(body.includes(s), `missing relationship to ${s}`);
  }
});

registerNoEmojiTest(test, assert, read);

registerRequiredTokenTests(test, assert, read, [
  'validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', '_shared/health-state.md',
  'work-record.md', 'work-fingerprint', 'by:docs-health', 'criteria-docs-diataxis.md',
  'docs-health:additive', 'docs-health:restructural', 'docs/superpowers',
  'relatedSections', 'Bundling rule',
]);

test('states the classification -> scoring fold table literally', () => {
  const body = read();
  assert.ok(/\|\s*`?additive`?\s*\|\s*`risk:low`\s*\|\s*`effort:low`\s*\|/.test(body));
  assert.ok(/\|\s*`?restructural`?\s*\|\s*`risk:medium`\s*\|\s*`effort:high`\s*\|/.test(body));
});

test('states the born-ready rule explicitly', () => {
  assert.ok(read().includes('born-`ready`'), 'missing an explicit born-ready statement');
});

test('routine-template.yml exists and points at /claude-tweaks:docs-health', () => {
  const templatePath = path.join(path.dirname(SKILL), 'routine-template.yml');
  assert.ok(fs.existsSync(templatePath));
  const content = fs.readFileSync(templatePath, 'utf8');
  assert.ok(content.includes('/claude-tweaks:docs-health'));
});
