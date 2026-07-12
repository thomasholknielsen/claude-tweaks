// bin/lib/issues/tests/labels.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { ensureLabelPayload } = require('../labels');

test('returns { name, description } for a valid description', () => {
  assert.deepStrictEqual(
    ensureLabelPayload('backlog', 'Inbox-stage backlog entry'),
    { name: 'backlog', description: 'Inbox-stage backlog entry' },
  );
});

test('accepts a description of exactly 100 characters', () => {
  const d = 'x'.repeat(100);
  assert.deepStrictEqual(ensureLabelPayload('x', d), { name: 'x', description: d });
});

test('throws for a description of 101 characters', () => {
  const d = 'x'.repeat(101);
  assert.throws(() => ensureLabelPayload('x', d), /100 chars/);
});

test('throws when description is not a string', () => {
  assert.throws(() => ensureLabelPayload('x', undefined), /must be a string/);
  assert.throws(() => ensureLabelPayload('x', 42), /must be a string/);
});

test('error message names the label', () => {
  assert.throws(() => ensureLabelPayload('code-health:review-quality', 'x'.repeat(101)), /code-health:review-quality/);
});

// Every real label description this plan introduces or keeps must pass — a single place
// that would have caught the status:in-progress (commit 54ab897) and code-health:*
// criterion (this plan's Task 3) 100-char overruns before they shipped.
const REAL_LABEL_DESCRIPTIONS = [
  ['code-health', 'Filed by the code-health engine — a systematic maintainability finding'],
  ['code-health:risk-low', "Risk tier if this finding's suggested fix goes wrong"],
  ['code-health:risk-medium', "Risk tier if this finding's suggested fix goes wrong"],
  ['code-health:risk-high', "Risk tier if this finding's suggested fix goes wrong"],
  ['code-health:effort-low', "Estimated effort to implement this finding's suggested fix"],
  ['code-health:effort-medium', "Estimated effort to implement this finding's suggested fix"],
  ['code-health:effort-high', "Estimated effort to implement this finding's suggested fix"],
  ['harness-health', 'Filed by the harness-health engine — a plugin harness maintenance finding'],
  ['harness-health:additive', 'Safe, mechanical patch — additive change with no removed behavior'],
  ['harness-health:restructural', 'Structural change requiring human review before applying'],
  ['harness-health:new-skill', 'Proposes a new skill candidate surfaced by harness-health'],
  ['tier:needs-review', 'Triage flagged this - needs a closer human look before authorizing'],
  ['tier:approved', 'Triage authorized this for building - human approves the merge'],
  ['tier:fast-track', 'Triage authorized this for building - auto-merges if the run comes back clean'],
  ['status:in-progress', 'Claimed and being built by an autonomous claude-tweaks run'],
  ['parked', 'Backlog entry parked until its trigger condition is met'],
];

test('every real label description used across the skill tree stays under the cap', () => {
  for (const [name, description] of REAL_LABEL_DESCRIPTIONS) {
    assert.doesNotThrow(() => ensureLabelPayload(name, description), `${name}: "${description}" (${description.length} chars)`);
  }
});
