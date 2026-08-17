'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'harness-health.js');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-durable-'));
  return dir;
}

test('retry-queue drain prints [] against a repo with no health-state branch', () => {
  const root = tmpRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/nonexistent.git'], { cwd: root });
  const out = execFileSync('node', [CLI, 'retry-queue', 'drain', '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out), []);
});

// bin/harness-health.js's main() dispatches `retry-queue update` by rebasing
// args._ (dropping the leading 'retry-queue' entry) before handing off to
// retryQueueCommands.update(), which expects its own args._[1] to be the
// results-file path (see the comment above that dispatch line). Nothing
// exercised that dispatch/rebase through the real CLI before this test —
// only `retry-queue drain` had CLI coverage. A repo with no health-state
// branch (same invalid-remote setup as the drain test above) means
// writeDurableState's write attempt fails before ever invoking its mutator,
// so `escalated` stays at its initial `[]` regardless of the results file's
// contents — what's actually under test here is that the CLI routes
// `retry-queue update <file>` to the right function with the right args,
// not makeRetryQueueCommands' own internal enqueue/escalate logic (that's
// covered by bin/lib/health-core/tests/retry-cli.test.js).
test('retry-queue update <results.json> dispatches correctly against a repo with no health-state branch', () => {
  const root = tmpRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/nonexistent.git'], { cwd: root });

  const resultsFile = path.join(root, 'results.json');
  fs.writeFileSync(resultsFile, JSON.stringify([
    { fingerprint: 'harnesshealth-aaaa0001', payload: { title: 'Stale example path' }, ok: false, error: 'filing failed: 500' },
  ]));

  // spawnSync, not execFileSync: against this fixture's unreachable fake git
  // remote, the durable-state write itself genuinely fails after exhausting
  // its retries, so the CLI now correctly exits non-zero (a real, intended
  // consequence of the retry-cli.js fix — a genuinely failed persistence
  // attempt must not silently report success to the calling shell/Routine).
  // execFileSync would throw on that non-zero exit before this test ever got
  // to inspect stdout; spawnSync returns a result object instead.
  const result = spawnSync('node', [CLI, 'retry-queue', 'update', resultsFile, '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(result.stdout), [], 'a single failed attempt has not crossed the 3-attempt escalation threshold');
  assert.notStrictEqual(result.status, 0, 'the durable write against this unreachable remote genuinely fails, so this must not exit 0');
});
