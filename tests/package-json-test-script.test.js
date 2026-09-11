// tests/package-json-test-script.test.js
//
// #407's own "fix" for npm test silently skipping tests/ (ledger #1) relied
// on `node --test`'s own glob-argument matching (`node --test 'tests/**/*.test.js'`)
// — verified only against the local dev machine's Node v22, never against
// CI's actual Node 20 runner. That shape silently failed on Node 20 with
// "Could not find 'tests/**/*.test.js'" (Node treats the literal glob string
// as a module path to require(), not a pattern to expand, on that version),
// breaking every CI run of #405-#415's own PR and the follow-up hotfix PR —
// caught only by checking GitHub's actual CI status, not by any local run.
// This pins the fix (an explicit, version-independent file list) so a future
// edit can't silently regress to the version-dependent glob shape.
//
// #2043 replaced the follow-up fix (shell `find ... | sort`, POSIX-only —
// broke `npm test` under Windows `cmd.exe`) with `tools/run-tests.js`, a
// portable Node script that walks the same roots. This file's assertions
// were updated in lockstep: they now pin the `run-tests.js` shape instead
// of the shell `find` shape, but the underlying concern (never regress to
// a raw glob string passed straight to `node --test`) is unchanged.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const { listTestFiles } = require(path.join(ROOT, 'tools', 'run-tests.js'));

test('package.json test/test:perf scripts never pass a raw glob string to `node --test` directly', () => {
  // The exact anti-pattern that broke CI: a quoted glob positional arg,
  // relying on node --test's own (Node-version-gated) glob expansion.
  assert.doesNotMatch(pkg.scripts.test, /node --test ['"][^'"]*\*\*/);
  assert.doesNotMatch(pkg.scripts['test:perf'], /node --test ['"][^'"]*\*\*/);
});

test('package.json test script resolves its file list via the portable tools/run-tests.js script, not shell `find`', () => {
  assert.match(pkg.scripts.test, /\brun-tests\.js\b/);
  assert.doesNotMatch(pkg.scripts.test, /\bfind\b/);
  assert.doesNotMatch(pkg.scripts.test, /\$\(/);
});

test('run-tests.js\'s listTestFiles actually discovers tests/ files when called standalone (proves the mechanism, independent of node --test)', () => {
  // This is the part that must work identically on every Node version and
  // every OS, since it never touches node --test's own argument parsing,
  // a shell, or command substitution at all.
  const files = listTestFiles(ROOT);
  assert.ok(files.length > 50, `expected the recursive tests/ walk to find well over 50 files, got ${files.length}`);
  assert.ok(files.some((f) => f.endsWith('reconcile.test.js')), 'expected this very file\'s own sibling to be discovered');
  assert.ok(files.every((f) => f.endsWith('.test.js')), 'every discovered path must be a .test.js file');
});

test('listTestFiles treats a missing root as empty rather than throwing (ENOENT, not a check-then-act race)', () => {
  // Neither ROOTS entry exists under this cwd — collectTestFiles must read each root
  // directly and swallow ENOENT, never a pre-check that could race a concurrent delete.
  const files = listTestFiles(path.join(ROOT, 'plugin', 'bin'));
  assert.deepStrictEqual(files, []);
});
