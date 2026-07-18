const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL = path.resolve(__dirname, '..', '..', '..', '..', 'skills', 'harness-health', 'SKILL.md');
const read = () => fs.readFileSync(SKILL, 'utf8');

test('exists', () => {
  assert.ok(fs.existsSync(SKILL), `SKILL.md not found at ${SKILL}`);
});

test('frontmatter declares the canonical name', () => {
  assert.match(read(), /name:\s*claude-tweaks:harness-health/);
});

test('carries the standard interaction-style directive', () => {
  assert.ok(read().includes('> **Interaction style:**'));
});

test('invokes the CLI via ${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js (not $SKILL_DIR)', () => {
  const body = read();
  assert.ok(body.includes('${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js'));
  assert.ok(!body.includes('$SKILL_DIR'), 'must not use the non-existent $SKILL_DIR variable');
});

test('documents the dry-run-first procedure and hands payloads to gh', () => {
  const body = read();
  assert.ok(body.includes('--dry-run'));
  assert.ok(/gh issue create/.test(body));
});

test('has the required house sections in order', () => {
  const body = read();
  const idx = (s) => body.indexOf(s);
  assert.ok(idx('## When to Use') > 0);
  assert.ok(idx('## Anti-Patterns') > 0);
  assert.ok(idx('## Component-Skill Contract') > 0);
  assert.ok(idx('## Relationship to Other Skills') > 0);
  assert.ok(idx('## Next Actions') > 0);
  // Next Actions before Component-Skill Contract before Anti-Patterns before Relationship
  assert.ok(idx('## Next Actions') < idx('## Component-Skill Contract'));
  assert.ok(idx('## Component-Skill Contract') < idx('## Anti-Patterns'));
  assert.ok(idx('## Anti-Patterns') < idx('## Relationship to Other Skills'));
});

test('Component-Skill Contract is keyed on $PIPELINE_RUN_DIR', () => {
  assert.ok(read().includes('$PIPELINE_RUN_DIR'));
});

test('Relationship table references wrap-up, init, tidy, triage, routine', () => {
  const body = read();
  for (const s of [
    '/claude-tweaks:wrap-up', '/claude-tweaks:init', '/claude-tweaks:tidy',
    '/claude-tweaks:triage', '/claude-tweaks:routine',
  ]) {
    assert.ok(body.includes(s), `missing relationship to ${s}`);
  }
});

test('no emojis (common emoji unicode sequences)', () => {
  const content = read();
  const emojiRe = /[\u{1F300}-\u{1FAFF}]/u;
  assert.ok(!emojiRe.test(content), 'SKILL.md must not contain emojis');
});

// ── spec 15: recordPayload migration anchors ────────────────────────────────

[
  'validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', '_shared/health-state.md',
  'work-record.md', 'work-fingerprint', 'by:harness-health', 'extractFingerprint',
  'work-types', 'TYPE_LABELS', 'harness-health:additive', 'harness-health:restructural',
  'harness-health:new-skill', 'relatedSections', 'Bundling rule',
].forEach((token) => {
  test(`contains required token '${token}'`, () => {
    const content = read();
    assert.ok(content.includes(token), `missing required token: ${token}`);
  });
});

test('states the classification -> scoring fold table literally', () => {
  const body = read();
  assert.ok(/\|\s*`?additive`?\s*\|\s*`risk:low`\s*\|\s*`effort:low`\s*\|/.test(body), 'missing literal additive -> risk:low/effort:low table row');
  assert.ok(/\|\s*`?restructural`?\s*\|\s*`risk:medium`\s*\|\s*`effort:high`\s*\|/.test(body), 'missing literal restructural -> risk:medium/effort:high table row');
});

test('states the born-ready rule explicitly', () => {
  assert.ok(read().includes('born-`ready`'), 'missing an explicit born-ready statement');
});

test('never emits the bare harness-health label as mechanical origin (by:harness-health only)', () => {
  const body = read();
  assert.ok(!/`harness-health`-labelled/.test(body), 'must not describe issues as bare `harness-health`-labelled anymore');
  assert.ok(!body.includes('--label harness-health --label'), 'must not file with a bare --label harness-health anymore');
  assert.ok(!body.includes('gh issue list --label harness-health '), 'must not gather issues via the bare harness-health label anymore');
  assert.ok(body.includes('--label by:harness-health'), 'filing snippets must use the qualified by:harness-health label');
});

test('does not carry a "not pulled by / never pulled by" triage carve-out', () => {
  assert.ok(!/not pulled by|never pulled by/.test(read()));
});

test('documents the wontfix suppression and the dual fingerprint marker (legacy harness-health-fingerprint, read via extractFingerprint)', () => {
  const body = read();
  assert.ok(body.includes('wontfix'));
  assert.ok(body.includes('harness-health-fingerprint'), 'legacy marker name must still be documented as a read-only fallback');
  assert.ok(body.includes('extractFingerprint'));
});
