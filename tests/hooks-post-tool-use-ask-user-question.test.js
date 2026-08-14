// tests/hooks-post-tool-use-ask-user-question.test.js
//
// #452's ask-user-question event: one PostToolUse log-tier event per
// AskUserQuestion call, holding every question posed in that call (1-4 per
// AskUserQuestionInput) with its header, option labels, and resolved
// answer. Schema confirmed against @anthropic-ai/claude-agent-sdk's
// sdk-tools.d.ts (see evals/NOTES.md) — answers is a map keyed by each
// question's own literal text, not by header.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const post = require('../bin/lib/hooks/post-tool-use');

function readEvents(runDir) {
  const raw = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function makeRunDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-auq-run-'));
}

function askCtx({ toolInput, toolResponse, ownedRun } = {}) {
  const input = { tool_name: 'AskUserQuestion' };
  if (toolInput !== undefined) input.tool_input = toolInput;
  if (toolResponse !== undefined) input.tool_response = toolResponse;
  return { input, cwd: '/does/not/matter', ownedRun };
}

test('logs one ask-user-question event with header, option labels, and the matched answer', () => {
  const runDir = makeRunDir();
  const toolInput = {
    questions: [
      {
        question: 'Which library should we use?',
        header: 'Library choice',
        options: [
          { label: 'date-fns', description: 'Lightweight, tree-shakeable' },
          { label: 'moment', description: 'Legacy, larger bundle' },
        ],
        multiSelect: false,
      },
    ],
  };
  const toolResponse = {
    questions: toolInput.questions,
    answers: { 'Which library should we use?': 'date-fns' },
  };
  const out = post.run(askCtx({ toolInput, toolResponse, ownedRun: { dir: runDir } }));
  assert.deepStrictEqual(out, {});
  const events = readEvents(runDir).filter((e) => e.type === 'ask-user-question');
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].questions, [
    { header: 'Library choice', options: ['date-fns', 'moment'], answer: 'date-fns' },
  ]);
});

test('handles multiple questions in one call, including a multiSelect comma-separated answer', () => {
  const runDir = makeRunDir();
  const toolInput = {
    questions: [
      {
        question: 'Pick a color',
        header: 'Color',
        options: [{ label: 'red' }, { label: 'blue' }],
        multiSelect: false,
      },
      {
        question: 'Pick features',
        header: 'Features',
        options: [{ label: 'dark-mode' }, { label: 'offline' }, { label: 'sync' }],
        multiSelect: true,
      },
    ],
  };
  const toolResponse = {
    questions: toolInput.questions,
    answers: { 'Pick a color': 'blue', 'Pick features': 'dark-mode, offline' },
  };
  const out = post.run(askCtx({ toolInput, toolResponse, ownedRun: { dir: runDir } }));
  assert.deepStrictEqual(out, {});
  const events = readEvents(runDir).filter((e) => e.type === 'ask-user-question');
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].questions, [
    { header: 'Color', options: ['red', 'blue'], answer: 'blue' },
    { header: 'Features', options: ['dark-mode', 'offline', 'sync'], answer: 'dark-mode, offline' },
  ]);
});

test('records answer: null when a posed question has no matching key in answers', () => {
  const runDir = makeRunDir();
  const toolInput = { questions: [{ question: 'Unanswered?', header: 'H', options: [{ label: 'a' }] }] };
  const toolResponse = { questions: toolInput.questions, answers: {} };
  post.run(askCtx({ toolInput, toolResponse, ownedRun: { dir: runDir } }));
  const events = readEvents(runDir).filter((e) => e.type === 'ask-user-question');
  assert.strictEqual(events[0].questions[0].answer, null);
});

test('does not fire for a tool other than AskUserQuestion', () => {
  const runDir = makeRunDir();
  const out = post.run({ input: { tool_name: 'ExitWorktree' }, cwd: '/x', ownedRun: { dir: runDir } });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(runDir, 'events.jsonl')), 'no event file should be created');
});

test('no-ops (writes nothing, never throws) when ctx.ownedRun.dir is unset', () => {
  const toolInput = { questions: [{ question: 'Q?', header: 'H', options: [{ label: 'a' }] }] };
  const toolResponse = { questions: toolInput.questions, answers: { 'Q?': 'a' } };
  const out = post.run(askCtx({ toolInput, toolResponse }));
  assert.deepStrictEqual(out, {});
  const out2 = post.run(askCtx({ toolInput, toolResponse, ownedRun: {} }));
  assert.deepStrictEqual(out2, {});
});

test('never throws on malformed tool_input/tool_response', () => {
  const runDir = makeRunDir();
  // No tool_input at all.
  assert.doesNotThrow(() => post.run(askCtx({ ownedRun: { dir: runDir } })));
  // tool_input.questions missing.
  assert.doesNotThrow(() => post.run(askCtx({ toolInput: {}, ownedRun: { dir: runDir } })));
  // tool_input.questions not an array.
  assert.doesNotThrow(() => post.run(askCtx({ toolInput: { questions: 'nope' }, ownedRun: { dir: runDir } })));
  // A posed question missing header/options entirely.
  assert.doesNotThrow(() => post.run(askCtx({
    toolInput: { questions: [{ question: 'Q?' }] },
    toolResponse: { answers: { 'Q?': 'a' } },
    ownedRun: { dir: runDir },
  })));
  // tool_response missing entirely.
  assert.doesNotThrow(() => post.run(askCtx({
    toolInput: { questions: [{ question: 'Q?', header: 'H', options: [{ label: 'a' }] }] },
    ownedRun: { dir: runDir },
  })));
  // tool_response.answers not an object.
  assert.doesNotThrow(() => post.run(askCtx({
    toolInput: { questions: [{ question: 'Q?', header: 'H', options: [{ label: 'a' }] }] },
    toolResponse: { answers: 'not-an-object' },
    ownedRun: { dir: runDir },
  })));
  // An option missing its label.
  assert.doesNotThrow(() => post.run(askCtx({
    toolInput: { questions: [{ question: 'Q?', header: 'H', options: [{ description: 'no label' }] }] },
    toolResponse: { answers: { 'Q?': 'a' } },
    ownedRun: { dir: runDir },
  })));
  const events = readEvents(runDir).filter((e) => e.type === 'ask-user-question');
  assert.ok(events.length >= 6, 'every malformed call above should still log something, never throw');
});
