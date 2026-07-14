// bin/lib/issues/tests/labels.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { ensureLabelPayload } = require('../labels');

test('returns { name, description } for a valid description', () => {
  assert.deepStrictEqual(
    ensureLabelPayload('by:capture', 'Origin: filed via /capture'),
    { name: 'by:capture', description: 'Origin: filed via /capture' },
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
// that would have caught the bot:in-progress (commit 54ab897) and code-health:*
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
  ['auto:build', 'Grant: agents may build this record autonomously (human-granted; machinery only removes)'],
  ['auto:merge', 'Grant: a clean autonomous run may merge unreviewed (stacks on auto:build; alone inert)'],
  ['bot:in-progress', 'Bot state: an agent currently holds the claim on this record'],
  ['bot:blocked', 'Bot state: retry ceiling reached — needs human re-triage before autonomous retry'],
  ['wontfix', 'Closed as not-planned; health skills will not re-file findings with this fingerprint'],
  ['ready', "Stage: spec-shaped and agent-sized — in the authorization gate's worklist"],
  ['parked', 'Stage: deliberately on hold until its trigger fires (milestone due or watched path change)'],
];

test('every real label description used across the skill tree stays under the cap', () => {
  for (const [name, description] of REAL_LABEL_DESCRIPTIONS) {
    assert.doesNotThrow(() => ensureLabelPayload(name, description), `${name}: "${description}" (${description.length} chars)`);
  }
});
