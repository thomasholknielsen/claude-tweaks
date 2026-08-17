// tests/hooks-post-tool-use-closing-keyword.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const post = require('../plugin/bin/lib/hooks/post-tool-use');

function gitRepoWithMessage(message, dateOverride) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ck-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  if (dateOverride) {
    env.GIT_AUTHOR_DATE = dateOverride;
    env.GIT_COMMITTER_DATE = dateOverride;
  }
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', message, '-q'], { env });
  return fs.realpathSync(dir);
}

function runPostToolUse(repo, runDir = null) {
  return post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "..."' }, cwd: repo },
    runDir,
    runState: null,
    cwd: repo,
  });
}

test('warns when a commit references an issue without a recognized closing keyword', () => {
  const repo = gitRepoWithMessage('Addresses #306, #305, #304 — bounded-concurrency fixes');
  const out = runPostToolUse(repo);
  assert.ok(out.json && typeof out.json.systemMessage === 'string', 'expected a systemMessage warning');
  assert.match(out.json.systemMessage, /closing keyword/i);
});

test('does not warn when the commit uses "Fixes"', () => {
  const repo = gitRepoWithMessage('Fixes #42');
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('does not warn when the commit uses "Closes" or "Resolves" case-insensitively', () => {
  const repo1 = gitRepoWithMessage('closes #5');
  assert.deepStrictEqual(runPostToolUse(repo1), {});
  const repo2 = gitRepoWithMessage('RESOLVES #5');
  assert.deepStrictEqual(runPostToolUse(repo2), {});
});

test('does not warn when the commit has no issue reference at all', () => {
  const repo = gitRepoWithMessage('Just a normal commit with no issue mention');
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('fires with no runDir set, unlike E2\'s breadcrumb logic', () => {
  const repo = gitRepoWithMessage('Addresses #7');
  const out = runPostToolUse(repo, null);
  assert.match(out.json.systemMessage, /closing keyword/i);
});

test('fires even when a runDir IS set (both checks run independently)', () => {
  const repo = gitRepoWithMessage('Addresses #7');
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ck-run-'));
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "..."' }, cwd: repo },
    runDir, runState: { status: 'active' }, ownedRun: { dir: runDir, attribution: 'session' }, cwd: repo,
  });
  assert.match(out.json.systemMessage, /closing keyword/i);
  // E2's breadcrumb still logs independently, unaffected by the new check:
  const events = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.strictEqual(events[0].type, 'commit');
});

test('does not warn when the Bash command is not a git commit', () => {
  const repo = gitRepoWithMessage('Addresses #7'); // real repo state irrelevant — command isn't a commit
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: repo },
    runDir: null, runState: null, cwd: repo,
  });
  assert.deepStrictEqual(out, {});
});

test('warns on a comma-separated trailing ref with no keyword of its own ("Fixes #100, #200" only closes #100)', () => {
  // GitHub requires the keyword immediately before EACH ref it closes; a bare trailing
  // ref after a comma is a well-known gotcha this check exists to catch — the naive
  // "does a keyword appear anywhere in the lookback window" check would wrongly treat
  // #200 as closed here, since "Fixes #100" sits within the window before it.
  const repo = gitRepoWithMessage('Fixes #100, #200');
  const out = runPostToolUse(repo);
  assert.match(out.json.systemMessage, /closing keyword/i);
});

test('does not warn when every ref has its own keyword ("Fixes #100, fixes #200")', () => {
  const repo = gitRepoWithMessage('Fixes #100, fixes #200');
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('does not warn when the same issue is cited twice, once bare and once with a keyword (finding 1 regression)', () => {
  // A repeated identical ref used to break the "before" slice: message.indexOf(ref)
  // always resolves to the FIRST occurrence, so both the bare mention and the
  // properly-closed mention were tested against the same (bare) slice, producing
  // a false "unclosed" warning even though the issue is legitimately closed.
  const repo = gitRepoWithMessage('See #100 for context. Fixes #100.');
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('warns when a word merely ENDS in a closing-keyword suffix, glued to a disqualifying prefix, with a long gap before the ref (fixed-lookback-window regression)', () => {
  // "unresolved" ends in "resolved" (a recognized keyword), and enough
  // whitespace separates it from the ref that a fixed 20-char lookback
  // window slices the "un" prefix off entirely — leaving just "resolved"
  // at the very start of the truncated slice, where JS regex's \b wrongly
  // treats that truncation point as a real word boundary. The real message
  // has no genuine closing keyword here at all.
  const repo = gitRepoWithMessage('This is unresolved            #123');
  const out = runPostToolUse(repo);
  assert.ok(out.json && typeof out.json.systemMessage === 'string', 'expected a systemMessage warning — "unresolved" is not a real closing keyword');
  assert.match(out.json.systemMessage, /closing keyword/i);
});

test('two real commits to the SAME dir in one Bash invocation are each evaluated on their OWN message, not both against current HEAD (finding regression)', () => {
  // Previously, checkClosingKeyword re-read `git log -1` for EVERY
  // commit-action target sharing a dir — always returning the SAME
  // (current-HEAD, i.e. the LAST) commit's message. An earlier commit in
  // the same compound command with its own unclosed ref was never actually
  // evaluated at all.
  const repo = gitRepoWithMessage('Addresses #100 — no closing keyword'); // the OLDER commit
  execFileSync('git', ['-C', repo, 'commit', '--allow-empty', '-q', '-m', 'Fixes #200'], {
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }); // the NEWER commit — fully closes its own ref, but must not mask the older one's
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "a" && git commit --allow-empty -m "b"' }, cwd: repo },
    runDir: null, runState: null, cwd: repo,
  });
  assert.ok(out.json && typeof out.json.systemMessage === 'string',
    'the older commit (#100, no closing keyword) must still be caught even though the newer commit in the same invocation properly closes its own ref');
  assert.match(out.json.systemMessage, /closing keyword/i);
});

test('does not evaluate a stale HEAD left over from a git commit that never landed (finding 2 regression)', () => {
  // Simulates a rejected/failed `git commit` attempt: PostToolUse still fires, but
  // HEAD is an old, unrelated commit rather than anything the just-attempted Bash
  // command actually created. Without a freshness check, reading this stale HEAD
  // back (message has a bare ref, no closing keyword) would fire a warning that's
  // misattributed to the current tool call.
  const repo = gitRepoWithMessage('Addresses #999 — old, unrelated commit', '2020-01-01T00:00:00');
  assert.deepStrictEqual(runPostToolUse(repo), {});
});
