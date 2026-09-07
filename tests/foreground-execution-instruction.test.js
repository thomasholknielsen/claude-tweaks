// tests/foreground-execution-instruction.test.js — pins #1965: three dispatched Task calls this
// firing (1442 build, 1442 review, 1821 build) ended their turn narrating "Waiting for the
// background test run / fix-round / simplify subagent" with no status line. A Task agent that
// yields expecting a completion notification is never re-woken inside the Task — the dispatching
// session had to detect the missing status line and resume each one via SendMessage manually.
// Neither dispatch/task-prompt.md's two fenced Task-prompt templates nor build/dispatch.md's
// implementer/reviewer instruction paragraph said anything about foreground execution, so a
// dispatched agent (or the SDD implementer/reviewer sub-dispatches it composes) had no textual
// reason not to background a long-running command and wait on it. This suite pins the
// foreground-execution instruction in all three locations, and proves the check can actually go
// red (parse-signal-discipline).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = path.join(__dirname, '..', 'plugin');
const TASK_PROMPT = path.join(PLUGIN, 'skills', 'dispatch', 'task-prompt.md');
const BUILD_DISPATCH = path.join(PLUGIN, 'skills', 'build', 'dispatch.md');

// The load-bearing facts a reader (human or dispatched agent) must come away with: never
// background a long-running command, and never end the turn waiting on one (or a child agent's
// completion notification) — the exact failure mode #1965 documents.
const NEVER_BACKGROUND_RE = /never\s+(?:with\s+)?`?run_in_background`?/i;
const NEVER_END_TURN_RE = /never end\s+(?:this|the) turn waiting on a background/i;

function fencedBlocks(text) {
  const blocks = [];
  const lines = text.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('```')) continue;
    if (start === -1) { start = i + 1; } else { blocks.push(lines.slice(start, i).join('\n')); start = -1; }
  }
  assert.equal(start, -1, 'unbalanced ``` fences — the last fenced block is unclosed');
  return blocks;
}

test('task-prompt.md: both fenced Task-prompt templates carry the foreground-execution instruction', () => {
  const text = fs.readFileSync(TASK_PROMPT, 'utf8');
  const blocks = fencedBlocks(text);
  assert.equal(blocks.length, 2, `expected exactly two fenced Task-prompt blocks, found ${blocks.length}`);

  const [firstCall, secondCall] = blocks;
  for (const [label, block] of [['first call (build,test)', firstCall], ['second call (review,polish,wrap-up)', secondCall]]) {
    assert.match(
      block,
      NEVER_BACKGROUND_RE,
      `${label} template must instruct the dispatched agent never to background a long-running command (#1965)`,
    );
    assert.match(
      block,
      NEVER_END_TURN_RE,
      `${label} template must instruct the dispatched agent never to end its turn waiting on a background run or child agent (#1965)`,
    );
  }
});

test('build/dispatch.md: the SDD invocation instruction directs implementer and reviewer dispatches to run in the foreground', () => {
  const text = fs.readFileSync(BUILD_DISPATCH, 'utf8');
  assert.match(
    text,
    NEVER_BACKGROUND_RE,
    'build/dispatch.md must instruct SDD to forbid backgrounding a long-running command in its per-task implementer/reviewer dispatches (#1965)',
  );
  assert.match(
    text,
    NEVER_END_TURN_RE,
    'build/dispatch.md must instruct SDD to forbid ending the turn waiting on a background run or child agent in its per-task implementer/reviewer dispatches (#1965)',
  );
  assert.match(
    text,
    /implementer dispatch and every reviewer dispatch/i,
    'build/dispatch.md must scope the foreground instruction to every per-task implementer AND reviewer dispatch — the grandchildren that actually launched the background runs in #1965',
  );
});

test('the foreground-instruction predicate can actually go red (discrimination proof)', () => {
  const text = fs.readFileSync(TASK_PROMPT, 'utf8');
  const doctored = text.replace(
    /Foreground execution \(required\):[^\r\n]*(?:\r?\n[^\r\n]*){0,4}\r?\n\r?\n/g,
    '',
  );
  assert.notEqual(doctored, text, 'doctoring did not remove any foreground-execution paragraph — anchor text not found');
  const blocks = fencedBlocks(doctored);
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    assert.doesNotMatch(block, NEVER_BACKGROUND_RE, 'doctored block unexpectedly still matches — test cannot discriminate');
  }
});
