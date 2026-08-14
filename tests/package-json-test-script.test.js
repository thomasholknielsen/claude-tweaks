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
// This pins the fix (shell `find`, never node --test's own glob support) so
// a future edit can't silently regress to the version-dependent shape.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('package.json test/test:perf scripts never pass a raw glob string to `node --test` directly', () => {
  // The exact anti-pattern that broke CI: a quoted glob positional arg,
  // relying on node --test's own (Node-version-gated) glob expansion.
  assert.doesNotMatch(pkg.scripts.test, /node --test ['"][^'"]*\*\*/);
  assert.doesNotMatch(pkg.scripts['test:perf'], /node --test ['"][^'"]*\*\*/);
});

test('package.json test/test:perf scripts resolve their file list via shell `find`, not node --test glob support', () => {
  assert.match(pkg.scripts.test, /\bfind\b/);
  assert.match(pkg.scripts['test:perf'], /\bfind\b/);
});

test('the test script\'s find pipeline actually discovers tests/ files when run standalone (proves the mechanism, independent of node --test)', () => {
  // Extract just the `find ... | sort` substitution and run it directly —
  // this is the part that must work identically on every Node version,
  // since it never touches node --test's own argument parsing at all.
  const match = pkg.scripts.test.match(/\$\((find[^)]+)\)/);
  assert.ok(match, 'expected a $(find ...) command substitution in the test script');
  const files = execSync(match[1], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  assert.ok(files.length > 50, `expected the recursive tests/ walk to find well over 50 files, got ${files.length}`);
  assert.ok(files.some((f) => f.endsWith('reconcile.test.js')), 'expected this very file\'s own sibling to be discovered');
  assert.ok(files.every((f) => f.endsWith('.test.js')), 'every discovered path must be a .test.js file');
});
