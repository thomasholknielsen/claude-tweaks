// tests/apply-refine-labels.test.js
//
// #844: backlog refine's paste-ready lane blocks render one gh command per
// record. bin/apply-refine-labels.js reads a JSON array of label/comment
// actions and applies the whole batch in one dispatched call. run(argv, deps)
// is directly callable (deps-injected, per gh-api-module-pattern) — these
// tests never touch real gh/git.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { run, parseArgs, validateAction } = require('../plugin/bin/apply-refine-labels');

test('parseArgs: missing actions-file argument is an error', () => {
  assert.ok(parseArgs([]).error);
  assert.ok(parseArgs(['--run', '/tmp/x']).error);
});

test('parseArgs: --help short-circuits before the positional is required', () => {
  assert.strictEqual(parseArgs(['--help']).help, true);
});

test('parseArgs: unknown flag is an error', () => {
  assert.match(parseArgs(['actions.json', '--bogus']).error, /unknown argument/);
});

test('parseArgs: --run as the last token with no value is an error, not silently omitted', () => {
  assert.match(parseArgs(['actions.json', '--run']).error, /--run requires a value/);
});

test('parseArgs: --run immediately followed by another flag is an error, not treated as its value', () => {
  assert.match(parseArgs(['actions.json', '--run', '--repo', 'acme/widgets']).error, /--run requires a value/);
});

test('parseArgs: --run "" degrades to omitted, not an error', () => {
  const opts = parseArgs(['actions.json', '--run', '']);
  assert.strictEqual(opts.error, undefined);
  assert.strictEqual(opts.run, null);
  assert.strictEqual(opts.runEmpty, true);
});

test('parseArgs: --run never passed leaves runEmpty false', () => {
  const opts = parseArgs(['actions.json']);
  assert.strictEqual(opts.run, null);
  assert.strictEqual(opts.runEmpty, false);
});

test('parseArgs: a later non-empty --run clears runEmpty set by an earlier empty --run', () => {
  const opts = parseArgs(['actions.json', '--run', '', '--run', '/repo/.claude-tweaks/pipelines/run-1']);
  assert.strictEqual(opts.error, undefined);
  assert.strictEqual(opts.run, '/repo/.claude-tweaks/pipelines/run-1');
  assert.strictEqual(opts.runEmpty, false);
});

test('validateAction: rejects a non-integer issue', () => {
  assert.match(validateAction({ issue: 'x', addLabels: ['a'] }, 0), /must be a positive integer/);
});

test('validateAction: rejects an action with no add/remove/comment', () => {
  assert.match(validateAction({ issue: 1 }, 0), /must set addLabels, removeLabels, or commentFile/);
});

test('validateAction: accepts addLabels only, removeLabels only, or commentFile only', () => {
  assert.strictEqual(validateAction({ issue: 1, addLabels: ['a'] }, 0), null);
  assert.strictEqual(validateAction({ issue: 1, removeLabels: ['a'] }, 0), null);
  assert.strictEqual(validateAction({ issue: 1, commentFile: '/tmp/x.md' }, 0), null);
});

function fakeDeps(overrides = {}) {
  const calls = { gh: [], ghAvailable: 0, stderr: [], stdout: [], appendEntry: [] };
  return {
    calls,
    gh: (args) => { calls.gh.push(args); return ''; },
    ghAvailable: () => { calls.ghAvailable += 1; return true; },
    remoteUrl: () => 'https://github.com/acme/widgets.git',
    readFile: () => { throw new Error('readFile not stubbed for this test'); },
    cwd: () => '/repo',
    mainRoot: () => '/repo',
    isAnchored: () => true,
    now: () => 1700000000000,
    appendEntry: (a) => { calls.appendEntry.push(a); },
    stdout: (s) => { calls.stdout.push(s); },
    stderr: (s) => { calls.stderr.push(s); },
    ...overrides,
  };
}

test('run: actions file that fails to read exits 1', () => {
  const deps = fakeDeps({ readFile: () => { throw new Error('ENOENT'); } });
  const code = run(['missing.json'], deps);
  assert.strictEqual(code, 1);
  assert.match(deps.calls.stderr.join(''), /could not read/);
});

test('run: actions file with invalid JSON exits 1', () => {
  const deps = fakeDeps({ readFile: () => '{not json' });
  const code = run(['bad.json'], deps);
  assert.strictEqual(code, 1);
  assert.match(deps.calls.stderr.join(''), /not valid JSON/);
});

test('run: empty array exits 1', () => {
  const deps = fakeDeps({ readFile: () => '[]' });
  const code = run(['empty.json'], deps);
  assert.strictEqual(code, 1);
  assert.match(deps.calls.stderr.join(''), /non-empty JSON array/);
});

test('run: an invalid action anywhere in the array exits 1 before any gh call', () => {
  const deps = fakeDeps({ readFile: () => JSON.stringify([{ issue: 1, addLabels: ['a'] }, { issue: 2 }]) });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 1);
  assert.strictEqual(deps.calls.gh.length, 0);
});

test('run: applies addLabels and removeLabels via one gh issue edit call, resolving repo from git remote', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 118, addLabels: ['auto:build'], removeLabels: ['bot:blocked'] }]),
  });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 0);
  assert.deepStrictEqual(deps.calls.gh, [
    ['issue', 'edit', '118', '--repo', 'acme/widgets', '--add-label', 'auto:build', '--remove-label', 'bot:blocked'],
  ]);
  const summary = JSON.parse(deps.calls.stdout.join(''));
  assert.deepStrictEqual(summary, { ok: [118], failed: [] });
});

test('run: commentFile action calls gh issue comment --body-file', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 201, removeLabels: ['ready'], commentFile: '/tmp/backlog-refine-flagback-201.md' }]),
  });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 0);
  assert.deepStrictEqual(deps.calls.gh, [
    ['issue', 'edit', '201', '--repo', 'acme/widgets', '--remove-label', 'ready'],
    ['issue', 'comment', '201', '--repo', 'acme/widgets', '--body-file', '/tmp/backlog-refine-flagback-201.md'],
  ]);
});

test('run: --repo flag overrides remote-derived owner/repo, and remoteUrl is never called', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 5, addLabels: ['x'] }]),
    remoteUrl: () => { throw new Error('remoteUrl should not be called when --repo is passed'); },
  });
  const code = run(['actions.json', '--repo', 'other/repo'], deps);
  assert.strictEqual(code, 0);
  assert.deepStrictEqual(deps.calls.gh[0], ['issue', 'edit', '5', '--repo', 'other/repo', '--add-label', 'x']);
});

test('run: one failed gh call is isolated — other actions still apply, failure reported in the summary', () => {
  let call = 0;
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 1, addLabels: ['a'] }, { issue: 2, addLabels: ['b'] }]),
    gh: (args) => {
      call += 1;
      deps.calls.gh.push(args);
      if (call === 1) { throw new Error('HTTP 404'); }
      return '';
    },
  });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 0);
  const summary = JSON.parse(deps.calls.stdout.join(''));
  assert.deepStrictEqual(summary.ok, [2]);
  assert.strictEqual(summary.failed.length, 1);
  assert.strictEqual(summary.failed[0].issue, 1);
  assert.match(summary.failed[0].error, /HTTP 404/);
});

test('run: no owner/repo resolvable from --repo or git remote exits 2', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 1, addLabels: ['a'] }]),
    remoteUrl: () => 'not-a-github-url',
  });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 2);
  assert.match(deps.calls.stderr.join(''), /could not resolve owner\/repo/);
});

test('run: gh not available exits 2 before reading the actions file', () => {
  const deps = fakeDeps({ ghAvailable: () => false, readFile: () => { throw new Error('must not be called'); } });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 2);
  assert.match(deps.calls.stderr.join(''), /`gh` is required/);
});

test('run: --run given logs one AUTO decisions.md line per successfully-applied action, under /backlog', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 118, addLabels: ['auto:build'], removeLabels: ['bot:blocked'] }]),
  });
  const code = run(['actions.json', '--run', '/repo/.claude-tweaks/pipelines/run-1'], deps);
  assert.strictEqual(code, 0);
  assert.strictEqual(deps.calls.appendEntry.length, 1);
  assert.strictEqual(deps.calls.appendEntry[0].runDir, '/repo/.claude-tweaks/pipelines/run-1');
  assert.strictEqual(deps.calls.appendEntry[0].section, '/backlog');
  assert.match(deps.calls.appendEntry[0].entry, /#118: applied \+auto:build, -bot:blocked/);
});

test('run: --run given does not log for a failed action', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 1, addLabels: ['a'] }]),
    gh: () => { throw new Error('boom'); },
  });
  const code = run(['actions.json', '--run', '/repo/.claude-tweaks/pipelines/run-1'], deps);
  assert.strictEqual(code, 0);
  assert.strictEqual(deps.calls.appendEntry.length, 0);
});

test('run: no --run flag never calls appendEntry', () => {
  const deps = fakeDeps({ readFile: () => JSON.stringify([{ issue: 1, addLabels: ['a'] }]) });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 0);
  assert.strictEqual(deps.calls.appendEntry.length, 0);
});

test('run: --run "" degrades to omitted — applies the batch (exit 0), skips appendEntry, notes the skip on stderr', () => {
  const deps = fakeDeps({ readFile: () => JSON.stringify([{ issue: 118, addLabels: ['auto:build'] }]) });
  const code = run(['actions.json', '--run', ''], deps);
  assert.strictEqual(code, 0);
  assert.strictEqual(deps.calls.appendEntry.length, 0);
  assert.match(deps.calls.stderr.join(''), /--run was empty — proceeding without run-dir\/decisions\.md logging/);
  const summary = JSON.parse(deps.calls.stdout.join(''));
  assert.deepStrictEqual(summary, { ok: [118], failed: [] });
});

test('run: no --run flag at all stays silent — no empty-run stderr note', () => {
  const deps = fakeDeps({ readFile: () => JSON.stringify([{ issue: 1, addLabels: ['a'] }]) });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 0);
  assert.doesNotMatch(deps.calls.stderr.join(''), /--run was empty/);
});

test('run: a later non-empty --run after an earlier empty --run logs normally and never prints the empty-run note', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 118, addLabels: ['auto:build'] }]),
  });
  const code = run(['actions.json', '--run', '', '--run', '/repo/.claude-tweaks/pipelines/run-1'], deps);
  assert.strictEqual(code, 0);
  assert.doesNotMatch(deps.calls.stderr.join(''), /--run was empty/);
  assert.strictEqual(deps.calls.appendEntry.length, 1);
  assert.strictEqual(deps.calls.appendEntry[0].runDir, '/repo/.claude-tweaks/pipelines/run-1');
});
