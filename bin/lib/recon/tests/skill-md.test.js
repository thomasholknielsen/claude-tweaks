const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL = path.resolve(__dirname, '..', '..', '..', '..', 'skills', 'recon', 'SKILL.md');
const read = () => fs.readFileSync(SKILL, 'utf8');

test('frontmatter declares the canonical name', () => {
  assert.match(read(), /name:\s*claude-tweaks:recon/);
});

test('carries the standard interaction-style directive', () => {
  assert.ok(read().includes('> **Interaction style:**'));
});

test('invokes the CLI via ${CLAUDE_PLUGIN_ROOT}/bin/recon.js (not $SKILL_DIR)', () => {
  const body = read();
  assert.ok(body.includes('${CLAUDE_PLUGIN_ROOT}/bin/recon.js'));
  assert.ok(!body.includes('$SKILL_DIR'), 'must not use the non-existent $SKILL_DIR variable (PORT.md delta #9)');
});

test('documents the dry-run-first then run procedure and hands payloads to gh', () => {
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

test('Relationship table references specify, capture, tidy, flow', () => {
  const body = read();
  for (const s of ['/claude-tweaks:specify', '/claude-tweaks:capture', '/claude-tweaks:tidy', '/claude-tweaks:flow']) {
    assert.ok(body.includes(s), `missing relationship to ${s}`);
  }
});

// ── v2 recon SKILL.md anchors ──────────────────────────────────────────────

const skillMdPath = path.join(__dirname, '..', '..', '..', '..', 'skills', 'recon', 'SKILL.md');

test('v2 SKILL.md: exists', () => {
  assert.ok(fs.existsSync(skillMdPath), `SKILL.md not found at ${skillMdPath}`);
});

['## When to Use', '## Input', '## Workflow', '## Anti-Patterns',
 '## Component-Skill Contract', '## Relationship to Other Skills',
 '## Next Actions', '## Routine Configuration',
].forEach((anchor) => {
  test(`v2 SKILL.md: contains section '${anchor}'`, () => {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    assert.ok(content.includes(anchor), `missing section: ${anchor}`);
  });
});

['validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', 'criteriaForArea', 'anchor',
 'recon-fingerprint', 'NearestNamedSymbol',
].forEach((token) => {
  test(`v2 SKILL.md: contains required token '${token}'`, () => {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    assert.ok(content.includes(token), `missing required token: ${token}`);
  });
});

test('v2 SKILL.md: no emojis (common emoji unicode sequences)', () => {
  const content = fs.readFileSync(skillMdPath, 'utf8');
  // Match common emoji ranges: U+1F300-U+1FAFF (Misc Symbols, Emoticons, etc.)
  // Using the surrogate pair regex that matches in JS UTF-16 strings.
  const emojiRe = /[\u{1F300}-\u{1FAFF}]/u;
  assert.ok(!emojiRe.test(content), 'SKILL.md must not contain emojis');
});
