import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileContains } from '../assertions/file-contains.js';

function mkTmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-file-contains-test-'));
}

test('fileContains: passes when all contains present and all absent missing', () => {
  const repoDir = mkTmpRepo();
  fs.writeFileSync(path.join(repoDir, 'greet.js'), "function greet() { return 'Hello'; }\n");
  const result = fileContains(repoDir, { path: 'greet.js', contains: ['function greet'], absent: ['console.log', 'whispers'] });
  assert.strictEqual(result.pass, true);
});

test('fileContains: fails listing a missing needle', () => {
  const repoDir = mkTmpRepo();
  fs.writeFileSync(path.join(repoDir, 'greet.js'), "function greet() { return 'Hello'; }\n");
  const result = fileContains(repoDir, { path: 'greet.js', contains: ['function shout'], absent: [] });
  assert.strictEqual(result.pass, false);
  assert.match(result.message, /function shout/);
});

test('fileContains: fails listing an unexpectedly-present needle', () => {
  const repoDir = mkTmpRepo();
  fs.writeFileSync(path.join(repoDir, 'greet.js'), "console.log('greet called');\n");
  const result = fileContains(repoDir, { path: 'greet.js', contains: [], absent: ['console.log'] });
  assert.strictEqual(result.pass, false);
  assert.match(result.message, /console\.log/);
});

test('fileContains: fails when the file does not exist', () => {
  const repoDir = mkTmpRepo();
  const result = fileContains(repoDir, { path: 'nope.js', contains: ['anything'], absent: [] });
  assert.strictEqual(result.pass, false);
});

test('fileContains: star-segment resolves to the latest non-archive directory', () => {
  const repoDir = mkTmpRepo();
  const pipelinesDir = path.join(repoDir, 'pipelines');
  const runDir = path.join(pipelinesDir, '2026-01-01T000000-spec-1');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'x.md'), 'marker content\n');
  fs.mkdirSync(path.join(pipelinesDir, 'archive'), { recursive: true });
  fs.writeFileSync(path.join(pipelinesDir, 'archive', 'x.md'), 'should not be read\n');
  const result = fileContains(repoDir, { path: 'pipelines/*/x.md', contains: ['marker content'], absent: [] });
  assert.strictEqual(result.pass, true);
});
