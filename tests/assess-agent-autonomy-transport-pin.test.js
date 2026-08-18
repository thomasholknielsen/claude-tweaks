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

const SKILL_MD = path.join(__dirname, '..', 'plugin/skills/assess-agent-autonomy/SKILL.md');

test('SKILL.md Error Handling names both could-not-gather and gathered-but-inconclusive cases', () => {
  const source = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(source.includes('could-not-gather'), 'expected the literal case name "could-not-gather" in SKILL.md');
  assert.ok(
    source.includes('gathered-but-inconclusive'),
    'expected the literal case name "gathered-but-inconclusive" in SKILL.md'
  );
});

test('SKILL.md Anti-Patterns table pins the content-judgment-rationale rule', () => {
  const source = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(
    source.includes('content-judgment'),
    'expected an Anti-Patterns row naming the content-judgment rationale hazard in SKILL.md'
  );
});

const GRANT_CHECK_MD = path.join(__dirname, '..', 'plugin/skills/assess-agent-autonomy/grant-check.md');
const FAILURE_CHECK_MD = path.join(__dirname, '..', 'plugin/skills/assess-agent-autonomy/failure-check.md');

test('grant-check.md Step 1 references the issue_read MCP mapping and the could-not-gather case', () => {
  const source = fs.readFileSync(GRANT_CHECK_MD, 'utf8');
  assert.ok(source.includes('issue_read'), 'expected grant-check.md to cite the issue_read MCP mapping');
  assert.ok(
    source.includes('could-not-gather'),
    'expected grant-check.md to reference the could-not-gather case by name'
  );
});

test('failure-check.md Step 1 references the issue_read MCP mapping and the could-not-gather case', () => {
  const source = fs.readFileSync(FAILURE_CHECK_MD, 'utf8');
  assert.ok(source.includes('issue_read'), 'expected failure-check.md to cite the issue_read MCP mapping');
  assert.ok(
    source.includes('could-not-gather'),
    'expected failure-check.md to reference the could-not-gather case by name'
  );
});
