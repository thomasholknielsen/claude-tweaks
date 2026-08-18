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
