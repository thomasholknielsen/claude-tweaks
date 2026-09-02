// tests/hooks-post-tool-use-ownership-mismatch.test.js
//
// #1520: when context.js's resolveRun finds this session owns SOME pipeline
// run but it's bound to a different worktree than the one a commit just
// landed in, it hands back `ownedElsewhere` instead of a dir. post-tool-use's
// commit-breadcrumb block already no-ops on a falsy `ownedRun.dir` (nothing
// to log to) — this pins the loud, non-blocking nudge that now fires instead
// of the silence #815 reported, and that it stays silent for the ordinary
// "nothing is mine at all" case (no `ownedElsewhere`) so as not to nag on
// every ad-hoc/unrecorded commit.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const post = require('../plugin/bin/lib/hooks/post-tool-use');

function gitRepoWithCommit() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ownmis-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'seed', '-q'], {
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  return fs.realpathSync(dir);
}

test('warns when a commit lands with no owned run here, but this session owns a run bound elsewhere', () => {
  const repo = gitRepoWithCommit();
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: repo },
    runDir: null,
    runState: null,
    ownedRun: { dir: null, attribution: null, ownedElsewhere: '/some/other/run-dir/2026-07-01T090000-elsewhere' },
    cwd: repo,
  });
  assert.ok(out.json && typeof out.json.systemMessage === 'string', 'expected a systemMessage warning');
  assert.match(out.json.systemMessage, /bound to a different worktree/i);
  assert.match(out.json.systemMessage, /2026-07-01T090000-elsewhere/);
});

test('does not warn on an ordinary unowned commit — no ownedElsewhere means nothing to flag', () => {
  const repo = gitRepoWithCommit();
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: repo },
    runDir: null,
    runState: null,
    ownedRun: { dir: null, attribution: null },
    cwd: repo,
  });
  assert.deepStrictEqual(out, {});
});

test('does not warn when the commit-breadcrumb already logged cleanly (ownedRun.dir is set)', () => {
  const repo = gitRepoWithCommit();
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ownmis-run-'));
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: repo },
    runDir: run,
    runState: { status: 'active' },
    ownedRun: { dir: run, attribution: 'session' },
    cwd: repo,
  });
  // The breadcrumb logged normally — closing-keyword's own unrelated nudge
  // may still fire for this message, but never the ownership-mismatch one.
  assert.ok(!out.json || !/bound to a different worktree/i.test(out.json.systemMessage || ''));
});

test('does not warn for a non-commit git write (e.g. a push) even with ownedElsewhere set', () => {
  const repo = gitRepoWithCommit();
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git push origin HEAD' }, cwd: repo },
    runDir: null,
    runState: null,
    ownedRun: { dir: null, attribution: null, ownedElsewhere: '/some/other/run-dir/2026-07-01T090000-elsewhere' },
    cwd: repo,
  });
  assert.deepStrictEqual(out, {});
});
