// tests/hooks-log-modules.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const post = require('../plugin/bin/lib/hooks/post-tool-use');
const substop = require('../plugin/bin/lib/hooks/subagent-stop');

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
  post.run({ input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: repo }, runDir: run, runState: { status: 'active' }, ownedRun: { dir: run, attribution: 'session' }, cwd: repo });
  const ev = readEvents(run);
  assert.strictEqual(ev[0].type, 'commit');
  assert.strictEqual(ev[0].action, 'commit');
  assert.match(ev[0].hash, /^[0-9a-f]{4,}$/);
});

test('post-tool-use logs a DISTINCT hash for each of two real commits to the same dir in one invocation, not the current-HEAD hash twice', () => {
  const repo = gitRepoWithCommit();
  const run = mkRun();
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  execFileSync('git', ['-C', repo, 'commit', '--allow-empty', '-q', '-m', 'first'], { env });
  const firstHash = execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  execFileSync('git', ['-C', repo, 'commit', '--allow-empty', '-q', '-m', 'second'], { env });
  const secondHash = execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

  post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "a" && git commit --allow-empty -m "b"' }, cwd: repo },
    runDir: run, runState: { status: 'active' }, ownedRun: { dir: run, attribution: 'session' }, cwd: repo,
  });
  const ev = readEvents(run);
  assert.strictEqual(ev.length, 2);
  assert.strictEqual(ev[0].hash, firstHash, 'the first target should log the OLDER commit\'s own hash');
  assert.strictEqual(ev[1].hash, secondHash, 'the second target should log the NEWER commit\'s own hash');
  assert.notStrictEqual(ev[0].hash, ev[1].hash, 'the two commit targets must not both log the same current-HEAD hash');
});

test('post-tool-use without run dir or without git targets is a no-op', () => {
  const repo = gitRepoWithCommit();
  assert.deepStrictEqual(post.run({ input: { tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: repo }, runDir: null, runState: null, ownedRun: { dir: null, attribution: null }, cwd: repo }), {});
  const run = mkRun();
  post.run({ input: { tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: repo }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: repo });
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});

function transcript(lastText) {
  return multiTurnTranscript([lastText]);
}

test('subagent-stop flags a missing status line as contract violation (warn, non-blocking)', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('I did some things.') }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  assert.match(out.json.systemMessage, /status line/i);
  const ev = readEvents(run)[0];
  assert.strictEqual(ev.type, 'contract-violation');
  assert.strictEqual(ev.attribution, undefined, 'a session-owned run must NOT be tagged fallback');
});

test('subagent-stop accepts a compliant status line silently', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('DONE\nAll checks green.') }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});

test('subagent-stop tags a fallback-attributed (guessed) run\'s contract-violation event as attribution: fallback, not silently trusted (#1431)', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('I did some things.') }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'fallback' }, cwd: '/x' });
  assert.match(out.json.systemMessage, /status line/i);
  const ev = readEvents(run)[0];
  assert.strictEqual(ev.type, 'contract-violation');
  assert.strictEqual(ev.attribution, 'fallback');
});

test('subagent-stop with no confirmed run ownership (ownedRun.dir unset) does not append to a run it does not own (#1431)', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('I did some things.') }, runDir: run, runState: null, ownedRun: { dir: null, attribution: null }, cwd: '/x' });
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
  const out = substop.run({ input: { agent_transcript_path: t }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  assert.match(out.json.systemMessage, /status line/i);
  assert.strictEqual(readEvents(run)[0].type, 'contract-violation');
});

test('subagent-stop checks the LAST assistant message, not an earlier non-compliant one', () => {
  const run = mkRun();
  const t = multiTurnTranscript(['still investigating', 'DONE\nAll checks green.']);
  const out = substop.run({ input: { agent_transcript_path: t }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});

function toolOnlyLastTurnTranscript() {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e3-toolonly-')), 'agent.jsonl');
  const lines = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'go' }] } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'still investigating, not done yet' }] } }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
    // The TRUE last assistant turn — tool-call only, no text block at all.
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'SomeTool', input: {} }] } }),
  ];
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
}

test('subagent-stop treats a tool-call-only LAST assistant turn as nothing to grade, not a fallback to an earlier text message (finding regression)', () => {
  const run = mkRun();
  const t = toolOnlyLastTurnTranscript();
  const out = substop.run({ input: { agent_transcript_path: t }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  // The real last turn has no text at all — best-effort no-op, matching
  // this file's "unreadable/ungradable -> no-op" posture. Previously the
  // scan fell through to the EARLIER "still investigating" text (which
  // doesn't start with a status keyword) and wrongly flagged it as a
  // contract violation.
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});

test('subagent-stop with unreadable transcript or no run dir is a silent no-op', () => {
  const run = mkRun();
  assert.deepStrictEqual(substop.run({ input: { agent_transcript_path: '/nope.jsonl' }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' }), {});
  assert.deepStrictEqual(substop.run({ input: {}, runDir: null, runState: null, ownedRun: { dir: null, attribution: null }, cwd: '/x' }), {});
});
