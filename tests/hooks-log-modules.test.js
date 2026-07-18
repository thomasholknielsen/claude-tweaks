// tests/hooks-log-modules.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const post = require('../bin/lib/hooks/post-tool-use');
const substop = require('../bin/lib/hooks/subagent-stop');

function gitRepoWithCommit() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e2-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'seed', '-q'], {
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  return fs.realpathSync(dir);
}
function mkRun() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e2run-'));
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(run, { recursive: true });
  return run;
}
const readEvents = (run) => fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);

test('post-tool-use logs commit breadcrumb with hash', () => {
  const repo = gitRepoWithCommit();
  const run = mkRun();
  post.run({ input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: repo }, runDir: run, runState: { status: 'active' }, cwd: repo });
  const ev = readEvents(run);
  assert.strictEqual(ev[0].type, 'commit');
  assert.strictEqual(ev[0].action, 'commit');
  assert.match(ev[0].hash, /^[0-9a-f]{4,}$/);
});

test('post-tool-use without run dir or without git targets is a no-op', () => {
  const repo = gitRepoWithCommit();
  assert.deepStrictEqual(post.run({ input: { tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: repo }, runDir: null, runState: null, cwd: repo }), {});
  const run = mkRun();
  post.run({ input: { tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: repo }, runDir: run, runState: null, cwd: repo });
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});

function transcript(lastText) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e3-')), 'agent.jsonl');
  const lines = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'task' }] } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: lastText }] } }),
  ];
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
}

test('subagent-stop flags a missing status line as contract violation (warn, non-blocking)', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('I did some things.') }, runDir: run, runState: null, cwd: '/x' });
  assert.match(out.json.systemMessage, /status line/i);
  assert.strictEqual(readEvents(run)[0].type, 'contract-violation');
});

test('subagent-stop accepts a compliant status line silently', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('DONE\nAll checks green.') }, runDir: run, runState: null, cwd: '/x' });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});

function multiTurnTranscript(texts) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e3-multi-')), 'agent.jsonl');
  const lines = [];
  for (const t of texts) {
    lines.push(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'go' }] } }));
    lines.push(JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: t }] } }));
  }
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
}

test('subagent-stop checks the LAST assistant message, not an earlier compliant one', () => {
  const run = mkRun();
  const t = multiTurnTranscript(['DONE\nfirst pass looked fine.', 'Actually let me also check this other thing.']);
  const out = substop.run({ input: { agent_transcript_path: t }, runDir: run, runState: null, cwd: '/x' });
  assert.match(out.json.systemMessage, /status line/i);
  assert.strictEqual(readEvents(run)[0].type, 'contract-violation');
});

test('subagent-stop checks the LAST assistant message, not an earlier non-compliant one', () => {
  const run = mkRun();
  const t = multiTurnTranscript(['still investigating', 'DONE\nAll checks green.']);
  const out = substop.run({ input: { agent_transcript_path: t }, runDir: run, runState: null, cwd: '/x' });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});

test('subagent-stop with unreadable transcript or no run dir is a silent no-op', () => {
  const run = mkRun();
  assert.deepStrictEqual(substop.run({ input: { agent_transcript_path: '/nope.jsonl' }, runDir: run, runState: null, cwd: '/x' }), {});
  assert.deepStrictEqual(substop.run({ input: {} , runDir: null, runState: null, cwd: '/x' }), {});
});
