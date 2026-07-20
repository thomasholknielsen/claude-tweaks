'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI = path.join(__dirname, '..', '..', '..', 'code-health.js');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-health-durable-'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'const x = 1;\n');
  return dir;
}

test('retry-queue drain prints [] against a repo with no health-state branch (real git, no gh network call needed since it degrades before ever calling gh)', () => {
  const root = tmpRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/nonexistent.git'], { cwd: root });
  const out = execFileSync('node', [CLI, 'retry-queue', 'drain', '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out), []);
});

// Regression: main()'s `retry-queue update` dispatch line rebases args._ via
// `args._.slice(1)` before handing it to makeRetryQueueCommands().update(),
// which reads its results-file path from args._[1] (i.e. args._[0] after the
// rebase). A typo in that rebase (e.g. `.slice(2)`, or dropping it) would
// make args._[1] resolve to the literal string 'update' instead of the real
// results-file path, so this real-CLI (argv-parsed) invocation is what
// actually exercises that dispatch line — bin/lib/health-core/tests/
// retry-cli.test.js calls makeRetryQueueCommands directly and bypasses argv
// parsing entirely, so it can't catch this class of bug.
test('retry-queue update <results.json> dispatches correctly against a repo with no health-state branch', () => {
  const root = tmpRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/nonexistent.git'], { cwd: root });

  const resultsFile = path.join(root, 'results.json');
  fs.writeFileSync(resultsFile, JSON.stringify([
    { fingerprint: 'codehealth-aaaa0001', payload: { title: 'Stale skill count' }, ok: false, error: 'filing failed: 500' },
  ]));

  const out = execFileSync('node', [CLI, 'retry-queue', 'update', resultsFile, '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out), [], 'a single failed attempt has not crossed the 3-attempt escalation threshold');
});
