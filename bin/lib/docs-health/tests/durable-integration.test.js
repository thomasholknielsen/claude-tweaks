'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI = path.join(__dirname, '..', '..', '..', 'docs-health.js');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-durable-'));
}

test('retry-queue drain prints [] against a repo with no health-state branch', () => {
  const root = tmpRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/nonexistent.git'], { cwd: root });
  const out = execFileSync('node', [CLI, 'retry-queue', 'drain', '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out), []);
});

test('retry-queue update <results.json> dispatches correctly against a repo with no health-state branch', () => {
  const root = tmpRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/nonexistent.git'], { cwd: root });

  const resultsFile = path.join(root, 'results.json');
  fs.writeFileSync(resultsFile, JSON.stringify([
    { fingerprint: 'docshealth-aaaa0001', payload: { title: 'Stale skill count' }, ok: false, error: 'filing failed: 500' },
  ]));

  const out = execFileSync('node', [CLI, 'retry-queue', 'update', resultsFile, '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out), [], 'a single failed attempt has not crossed the 3-attempt escalation threshold');
});
