import { test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { createActor } from '../actor.js';

const REPO_DIR = '/tmp/ct-eval-fixture-123';

const SAMPLE_INPUT = {
  questions: [
    {
      question: 'Which effort tier?',
      header: 'Effort',
      options: [
        { label: 'Low' },
        { label: 'Medium (Recommended)' },
        { label: 'High' },
      ],
      multiSelect: false,
    },
  ],
};

test('default policy: auto-selects the option labeled (Recommended)', async () => {
  const actor = createActor();
  const result = await actor('AskUserQuestion', SAMPLE_INPUT, {});
  assert.strictEqual(result.behavior, 'allow');
  assert.strictEqual(result.updatedInput.answers['Which effort tier?'], 'Medium (Recommended)');
});

test('answerOverrides: a matching override takes priority over the default', async () => {
  const actor = createActor({ answerOverrides: [{ match: 'effort tier', answer: 'High' }] });
  const result = await actor('AskUserQuestion', SAMPLE_INPUT, {});
  assert.strictEqual(result.updatedInput.answers['Which effort tier?'], 'High');
});

test('non-AskUserQuestion tools are allowed unmodified', async () => {
  const actor = createActor();
  const result = await actor('Read', { file_path: '/tmp/x' }, {});
  assert.deepStrictEqual(result, { behavior: 'allow', updatedInput: { file_path: '/tmp/x' } });
});

test('falls back to the first option when none is marked (Recommended)', async () => {
  const actor = createActor();
  const input = { questions: [{ question: 'Pick one', header: 'X', options: [{ label: 'A' }, { label: 'B' }] }] };
  const result = await actor('AskUserQuestion', input, {});
  assert.strictEqual(result.updatedInput.answers['Pick one'], 'A');
});

// --- Scope guard (repoDir) ---

test('scope guard: a path-bearing tool call targeting a file inside repoDir is allowed', async () => {
  const actor = createActor({ repoDir: REPO_DIR });
  const insidePath = path.join(REPO_DIR, 'CLAUDE.md');
  const result = await actor('Edit', { file_path: insidePath, old_string: 'a', new_string: 'b' }, {});
  assert.strictEqual(result.behavior, 'allow');
  assert.deepStrictEqual(result.updatedInput, { file_path: insidePath, old_string: 'a', new_string: 'b' });
});

test('scope guard: a path-bearing tool call targeting a file outside repoDir is denied with a clear message', async () => {
  const actor = createActor({ repoDir: REPO_DIR });
  const outsidePath = '/Users/thomasholknielsen/Code Workspaces/claude-tweaks/CLAUDE.md';
  const result = await actor('Write', { file_path: outsidePath, content: 'oops' }, {});
  assert.strictEqual(result.behavior, 'deny');
  assert.strictEqual(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
  assert.ok(result.message.includes(outsidePath) || /outside|scope/i.test(result.message));
});

test('scope guard: a sibling directory sharing repoDir as a string prefix is still denied (not treated as inside)', async () => {
  const actor = createActor({ repoDir: REPO_DIR });
  // REPO_DIR + '-evil' is a string-prefix match for REPO_DIR but NOT a path-prefix
  // match (no path.sep boundary) — this must be denied, not incorrectly allowed.
  const siblingPath = path.join(`${REPO_DIR}-evil`, 'file.txt');
  const result = await actor('Write', { file_path: siblingPath, content: 'oops' }, {});
  assert.strictEqual(result.behavior, 'deny');
});

test('scope guard: the repoDir itself (no trailing path) resolves to allowed', async () => {
  const actor = createActor({ repoDir: REPO_DIR });
  const result = await actor('Write', { path: REPO_DIR, content: 'oops' }, {});
  assert.strictEqual(result.behavior, 'allow');
});

test('scope guard: checks the `path` and `notebook_path` keys too, not just `file_path`', async () => {
  const actor = createActor({ repoDir: REPO_DIR });
  const insidePath = path.join(REPO_DIR, 'notebook.ipynb');
  const outsidePath = '/tmp/somewhere-else/notebook.ipynb';
  const insideResult = await actor('NotebookEdit', { notebook_path: insidePath }, {});
  const outsideResult = await actor('NotebookEdit', { notebook_path: outsidePath }, {});
  assert.strictEqual(insideResult.behavior, 'allow');
  assert.strictEqual(outsideResult.behavior, 'deny');
});

test('scope guard: a tool call with no path-like input key is allowed regardless of repoDir', async () => {
  const actor = createActor({ repoDir: REPO_DIR });
  const result = await actor('Bash', { command: 'echo hi' }, {});
  assert.strictEqual(result.behavior, 'allow');
  assert.deepStrictEqual(result.updatedInput, { command: 'echo hi' });
});

test('scope guard: when repoDir is not supplied, non-AskUserQuestion tools are allowed unmodified regardless of path', async () => {
  const actor = createActor();
  const outsidePath = '/Users/thomasholknielsen/Code Workspaces/claude-tweaks/CLAUDE.md';
  const result = await actor('Write', { file_path: outsidePath, content: 'oops' }, {});
  assert.deepStrictEqual(result, { behavior: 'allow', updatedInput: { file_path: outsidePath, content: 'oops' } });
});

test('scope guard: AskUserQuestion is never subject to the scope guard, even with repoDir set', async () => {
  const actor = createActor({ repoDir: REPO_DIR });
  const result = await actor('AskUserQuestion', SAMPLE_INPUT, {});
  assert.strictEqual(result.behavior, 'allow');
  assert.strictEqual(result.updatedInput.answers['Which effort tier?'], 'Medium (Recommended)');
});

// --- Async coordination tools (hang/abort mitigation) ---

test('async coordination guard: ScheduleWakeup is denied with a clear message', async () => {
  const actor = createActor();
  const result = await actor('ScheduleWakeup', { delaySeconds: 90, reason: 'wait for subagent', prompt: 'resume' }, {});
  assert.strictEqual(result.behavior, 'deny');
  assert.ok(result.message.length > 0);
});

test('async coordination guard: SendMessage, Monitor, TaskOutput, and TaskStop are each denied', async () => {
  const actor = createActor();
  for (const toolName of ['SendMessage', 'Monitor', 'TaskOutput', 'TaskStop']) {
    const result = await actor(toolName, {}, {});
    assert.strictEqual(result.behavior, 'deny', `${toolName} should be denied`);
    assert.ok(result.message.length > 0);
  }
});

test('async coordination guard: Agent dispatch with run_in_background:true is denied', async () => {
  const actor = createActor();
  const result = await actor('Agent', { description: 'simplify', prompt: 'do it', run_in_background: true }, {});
  assert.strictEqual(result.behavior, 'deny');
  assert.ok(result.message.length > 0);
});

test('async coordination guard: Agent dispatch with run_in_background:false is allowed', async () => {
  const actor = createActor();
  const result = await actor('Agent', { description: 'simplify', prompt: 'do it', run_in_background: false }, {});
  assert.strictEqual(result.behavior, 'allow');
});

// AgentInput.run_in_background defaults to true (background) when omitted,
// per the SDK's own sdk-tools.d.ts doc comment — an omitted field is NOT
// safe to allow, unlike every other tool's path-based checks. This was a
// real gap in an earlier version of the guard (caught by whole-branch
// review): a check for `=== true` alone missed the omitted case entirely.
test('async coordination guard: Agent dispatch with run_in_background omitted is denied (defaults to background per the SDK)', async () => {
  const actor = createActor();
  const result = await actor('Agent', { description: 'simplify', prompt: 'do it' }, {});
  assert.strictEqual(result.behavior, 'deny');
  assert.ok(result.message.length > 0);
});

test('async coordination guard: applies even when repoDir is set, ahead of the scope guard', async () => {
  const actor = createActor({ repoDir: REPO_DIR });
  const result = await actor('ScheduleWakeup', { delaySeconds: 60, reason: 'x', prompt: 'y' }, {});
  assert.strictEqual(result.behavior, 'deny');
});
