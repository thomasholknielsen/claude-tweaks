'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI = path.join(__dirname, '..', '..', '..', 'harness-health.js');

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
