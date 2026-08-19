'use strict';

// Conformance pin (#889): SKILL.md's Error Handling section must distinguish
// could-not-gather (transport/tooling failure) from gathered-but-inconclusive
// (a genuine content-ambiguity read) -- the two render different RATIONALE
// shapes. If SKILL.md's prose ever collapses this back into one case, this
// pin fails loudly instead of letting the distinction silently erode.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.join(__dirname, '..', 'plugin/skills/assess-agent-autonomy');

// The two modes whose Step 1 gather fetches from GitHub, and so must carry the
// MCP fallback and both no-content short-circuits.
const FETCHING_MODES = ['grant-check', 'failure-check'];

function readSkillFile(name) {
  return fs.readFileSync(path.join(SKILL_DIR, name), 'utf8');
}

test('SKILL.md Error Handling names both could-not-gather and gathered-but-inconclusive cases', () => {
  const source = readSkillFile('SKILL.md');
  assert.ok(source.includes('could-not-gather'), 'expected the literal case name "could-not-gather" in SKILL.md');
  assert.ok(
    source.includes('gathered-but-inconclusive'),
    'expected the literal case name "gathered-but-inconclusive" in SKILL.md'
  );
});

test('SKILL.md Anti-Patterns table pins the content-judgment-rationale rule', () => {
  const source = readSkillFile('SKILL.md');
  assert.ok(
    source.includes('content-judgment'),
    'expected an Anti-Patterns row naming the content-judgment rationale hazard in SKILL.md'
  );
});

for (const mode of FETCHING_MODES) {
  test(`${mode}.md Step 1 references the issue_read MCP mapping and the could-not-gather case`, () => {
    const source = readSkillFile(`${mode}.md`);
    assert.ok(source.includes('issue_read'), `expected ${mode}.md to cite the issue_read MCP mapping`);
    assert.ok(
      source.includes('could-not-gather'),
      `expected ${mode}.md to reference the could-not-gather case by name`
    );
  });
}

test('grant-check.md and failure-check.md both cover the fetch-error scenario', () => {
  const fetchErrorPhrase = 'Or the fetch itself fails';
  for (const mode of FETCHING_MODES) {
    assert.ok(
      readSkillFile(`${mode}.md`).includes(fetchErrorPhrase),
      `expected ${mode}.md to cover the fetch-error scenario with phrase "${fetchErrorPhrase}"`
    );
  }
});
