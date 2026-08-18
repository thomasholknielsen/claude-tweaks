'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { computeBlastRadius, BlastRadiusError, parseNumstat } = require(
  path.join(__dirname, '..', '..', 'plugin', 'bin', 'lib', 'blast-radius-cli.js')
);

const SHA = 'a'.repeat(40);

// A fake git runner keyed by the subcommand (argv[0]). Records calls.
function fakeGit(handlers) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    const handler = handlers[args[0]];
    if (!handler) throw new Error(`unexpected git ${args.join(' ')}`);
    return handler(args);
  };
  git.calls = calls;
  return git;
}

test('happy path: derives merge base from integration branch, classifies, resolves config', () => {
  const git = fakeGit({
    'merge-base': () => `${SHA}\n`,
    diff: () => '10\t2\tplugin/bin/foo.js\n5\t0\ttests/foo.test.js\n',
    'rev-parse': () => '/repo\n',
  });
  const readFile = (p) => (p.endsWith('policy.yml')
    ? 'merge-sensitive-paths: plugin/bin/hooks.js\nauto-merge-max-lines: 50\n'
    : null);
  const out = computeBlastRadius({ integrationBranch: 'main' }, { git, readFile });
  assert.strictEqual(out.mergeBase, SHA);
  assert.strictEqual(out.summary.implLines, 12);
  assert.strictEqual(out.summary.implFiles, 1);
  assert.strictEqual(out.summary.testLines, 5);
  assert.strictEqual(out.summary.testFiles, 1);
  assert.deepStrictEqual(out.summary.sensitiveFilesTouched, []);
  assert.strictEqual(out.config.autoMergeMaxLines, 50);
  assert.strictEqual(out.config.autoMergeMaxFiles, 2); // schema default
  assert.deepStrictEqual(out.config.mergeSensitivePaths, ['plugin/bin/hooks.js']);
});

test('--base short-circuits merge-base derivation and is verified via rev-parse', () => {
  const git = fakeGit({
    'rev-parse': (args) => (args.includes('--show-toplevel') ? '/repo\n' : `${SHA}\n`),
    diff: () => '',
  });
  const out = computeBlastRadius({ base: 'abc123' }, { git, readFile: () => null });
  assert.strictEqual(out.mergeBase, SHA);
  assert.ok(!git.calls.some((c) => c[0] === 'merge-base'), 'merge-base must not run when base is given');
});

test('unresolvable merge base throws BlastRadiusError — never a zero summary', () => {
  const git = fakeGit({
    'merge-base': () => { throw new Error('fatal: Not a valid object name'); },
    'rev-parse': () => '/repo\n',
  });
  assert.throws(
    () => computeBlastRadius({ integrationBranch: 'main' }, { git, readFile: () => null }),
    BlastRadiusError
  );
});

test('git diff --numstat failure after a resolved merge base throws BlastRadiusError', () => {
  const git = fakeGit({
    'merge-base': () => `${SHA}\n`,
    diff: () => { throw new Error('fatal: bad revision'); },
    'rev-parse': () => '/repo\n',
  });
  assert.throws(
    () => computeBlastRadius({ integrationBranch: 'main' }, { git, readFile: () => null }),
    (err) => err instanceof BlastRadiusError && /git diff --numstat failed/.test(err.message)
  );
});

test('unverifiable --base throws BlastRadiusError', () => {
  const git = fakeGit({
    'rev-parse': (args) => {
      if (args.includes('--show-toplevel')) return '/repo\n';
      throw new Error('fatal: Needed a single revision');
    },
  });
  assert.throws(
    () => computeBlastRadius({ base: 'nonsense' }, { git, readFile: () => null }),
    BlastRadiusError
  );
});

test('genuinely empty diff with a valid base yields zero summary WITH the mergeBase attached', () => {
  const git = fakeGit({
    'merge-base': () => `${SHA}\n`,
    diff: () => '',
    'rev-parse': () => '/repo\n',
  });
  const out = computeBlastRadius({ integrationBranch: 'main' }, { git, readFile: () => null });
  assert.strictEqual(out.mergeBase, SHA);
  assert.strictEqual(out.summary.implFiles, 0);
  assert.strictEqual(out.summary.implLines, 0);
});

test('neither base nor integrationBranch throws BlastRadiusError', () => {
  assert.throws(
    () => computeBlastRadius({}, { git: fakeGit({}), readFile: () => null }),
    BlastRadiusError
  );
});

test('binary-file numstat dashes count the file with zero lines', () => {
  const parsed = parseNumstat('-\t-\tassets/logo.png\n3\t1\tplugin/bin/foo.js\n');
  assert.deepStrictEqual(parsed[0], { path: 'assets/logo.png', additions: 0, deletions: 0 });
  assert.deepStrictEqual(parsed[1], { path: 'plugin/bin/foo.js', additions: 3, deletions: 1 });
});

test('numstat rename paths with tabs survive (path is everything after the second tab)', () => {
  const parsed = parseNumstat('1\t1\tdir/a\tb.md\n');
  assert.deepStrictEqual(parsed[0], { path: 'dir/a\tb.md', additions: 1, deletions: 1 });
});

test('sensitive-path hit from resolved policy lands in sensitiveFilesTouched', () => {
  const git = fakeGit({
    'merge-base': () => `${SHA}\n`,
    diff: () => '2\t0\tplugin/bin/hooks.js\n',
    'rev-parse': () => '/repo\n',
  });
  const readFile = (p) => (p.endsWith('policy.yml') ? 'merge-sensitive-paths: plugin/bin/hooks.js\n' : null);
  const out = computeBlastRadius({ integrationBranch: 'main' }, { git, readFile });
  assert.deepStrictEqual(out.summary.sensitiveFilesTouched, ['plugin/bin/hooks.js']);
});
