'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #296's second Task() call must resume the FIRST call's run directory rather than
// starting a disconnected fresh one — otherwise build/test's decisions.md and staged
// proposals are orphaned from the eventual Review Console. This was reviewed as fixed
// twice and found inert both times: the sending half (dispatch derives {run-dir} and
// substitutes it into the second call's literal command line) and the receiving half
// (/flow Step 3 actually adopts a pre-set PIPELINE_RUN_DIR instead of always creating a
// fresh one) were each individually plausible but never verified as connected. This test
// pins both halves of that chain directly in the operative prose, so a future edit to
// either side that breaks the link fails the suite instead of shipping silently a third
// time.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const TASK_PROMPT = read('skills', 'dispatch', 'task-prompt.md');
const FLOW_SKILL = read('skills', 'flow', 'SKILL.md');
const STEPS_AND_GATES = read('skills', 'flow', 'steps-and-gates.md');

test('task-prompt.md: the second call\'s literal command line carries PIPELINE_RUN_DIR', () => {
  const start = TASK_PROMPT.indexOf('## Second call');
  assert.notStrictEqual(start, -1, 'task-prompt.md no longer has a "## Second call" heading — this guard has lost its anchor');
  const end = TASK_PROMPT.indexOf('None of Templates A/B/C', start);
  assert.notStrictEqual(end, -1, 'the second call is no longer followed by its template note — this guard has lost its anchor');
  const region = TASK_PROMPT.slice(start, end);

  assert.match(
    region,
    /PIPELINE_RUN_DIR="\{run-dir\}"\s+CLAIM_RUN_ID="\{RUN_ID\}"/,
    'the second call\'s fenced command line must inline PIPELINE_RUN_DIR="{run-dir}" — a dispatched Task agent inherits no environment, so this cannot be an "exported before this call" claim; it must be substituted into the literal command like every other placeholder',
  );
});

test('flow/SKILL.md Step 3: an inherited PIPELINE_RUN_DIR is adopted, not overwritten', () => {
  const start = FLOW_SKILL.indexOf('### Step 3:');
  assert.notStrictEqual(start, -1, 'flow/SKILL.md no longer has a "### Step 3:" heading — this guard has lost its anchor');
  const end = FLOW_SKILL.indexOf('\n### Step 4', start);
  const region = FLOW_SKILL.slice(start, end === -1 ? FLOW_SKILL.length : end);

  assert.match(
    region,
    /Adopt-if-set/i,
    'Step 3 must state an adopt-if-set branch for a PIPELINE_RUN_DIR already present on entry — without it, dispatch\'s second call always starts a fresh, disconnected run regardless of what it was handed',
  );
});

test('steps-and-gates.md: the adopt branch actually reads the existing run rather than re-initializing it', () => {
  const start = STEPS_AND_GATES.indexOf('### Adopting an inherited run directory');
  assert.notStrictEqual(start, -1, 'steps-and-gates.md no longer has an "### Adopting an inherited run directory" heading — this guard has lost its anchor');
  const end = STEPS_AND_GATES.indexOf('\n### Partial step lists', start);
  const region = STEPS_AND_GATES.slice(start, end === -1 ? STEPS_AND_GATES.length : end);

  assert.match(
    region,
    /adopt it/i,
    'the adopt branch must actually adopt the existing directory on a match',
  );
  assert.match(
    region,
    /do\s+\W*not\W*\s+re-initialize/i,
    'adopting an existing run directory must not overwrite config.yml/decisions.md — that would destroy the first call\'s auto-decision trail, the exact thing this handoff exists to preserve',
  );
});
