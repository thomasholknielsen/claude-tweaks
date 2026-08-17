'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REFINE_MODE_PATH = path.join(__dirname, '..', 'skills', 'backlog', 'refine-mode.md');
const refineModeProse = fs.readFileSync(REFINE_MODE_PATH, 'utf8');

// The pre-change Step 5 text (#741) — no closing-summary block, just the AUTO log-line
// templates followed directly by the Concurrency section. Used below to prove each
// regex actually goes red on the text this change replaces, not just green on the new text.
const PRE_CHANGE_STEP_5_TAIL = `AUTO {time} — Backlog refine: flagged back #{n} — {missing sections | needs scoring}.
\`\`\`

## Concurrency
`;

test('Step 5 requires a closing summary block rendered as assistant text', () => {
  const pattern = /rendered as assistant text — never delegated to tool output/;
  assert.match(refineModeProse, pattern, 'closing-summary requirement missing from refine-mode.md Step 5');
  assert.doesNotMatch(PRE_CHANGE_STEP_5_TAIL, pattern, 'pattern must NOT match the pre-change text (proves it can go red)');
});

test('Step 5 closing summary requires a per-type tally line with an always-present failed count', () => {
  const pattern = /`failed` always\s+present, even at zero/;
  assert.match(refineModeProse, pattern, 'per-type tally / always-present failed-count requirement missing');
  assert.doesNotMatch(PRE_CHANGE_STEP_5_TAIL, pattern, 'pattern must NOT match the pre-change text (proves it can go red)');
});

test('Step 5 closing summary requires a paste-ready retry command per failed write', () => {
  const pattern = /followed by a paste-ready retry\n\s*command on its own line/;
  assert.match(refineModeProse, pattern, 'paste-ready retry-command requirement missing');
  assert.doesNotMatch(PRE_CHANGE_STEP_5_TAIL, pattern, 'pattern must NOT match the pre-change text (proves it can go red)');
});

test('Step 5 closing summary requires the absolute run-directory path', () => {
  const pattern = /run-directory path, absolute\*\* — never relative/;
  assert.match(refineModeProse, pattern, 'absolute run-dir path requirement missing');
  assert.doesNotMatch(PRE_CHANGE_STEP_5_TAIL, pattern, 'pattern must NOT match the pre-change text (proves it can go red)');
});

test('Step 5 closing summary requires an explicit 0 failed on a fully clean run', () => {
  const pattern = /fully clean run still renders `0 failed` explicitly/;
  assert.match(refineModeProse, pattern, 'unconditional 0-failed rendering requirement missing');
  assert.doesNotMatch(PRE_CHANGE_STEP_5_TAIL, pattern, 'pattern must NOT match the pre-change text (proves it can go red)');
});
