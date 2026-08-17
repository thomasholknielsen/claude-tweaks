import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dirFileCount } from '../assertions/dir-file-count.js';

function mkTmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-dir-file-count-test-'));
}

test('dirFileCount: a missing directory counts 0 and passes', () => {
  const repoDir = mkTmpRepo();
  const result = dirFileCount(repoDir, { path: 'specs', max: 0 });
  assert.strictEqual(result.pass, true);
});

test('dirFileCount: count over max fails and names the count', () => {
  const repoDir = mkTmpRepo();
  const specsDir = path.join(repoDir, 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  fs.writeFileSync(path.join(specsDir, '1-a.md'), 'x');
  fs.writeFileSync(path.join(specsDir, '2-b.md'), 'x');
  const result = dirFileCount(repoDir, { path: 'specs', max: 0 });
  assert.strictEqual(result.pass, false);
  assert.match(result.message, /2 file\(s\)/);
});

test('dirFileCount: star-segment skips archive — a real run dir with one staged file fails at max 0', () => {
  const repoDir = mkTmpRepo();
  const pipelinesDir = path.join(repoDir, '.claude-tweaks', 'pipelines');
  const runStagedDir = path.join(pipelinesDir, '2026-01-01T000000-spec-1', 'staged');
  fs.mkdirSync(runStagedDir, { recursive: true });
  fs.writeFileSync(path.join(runStagedDir, 'proposal-1.md'), 'staged proposal');
  const archiveStagedDir = path.join(pipelinesDir, 'archive', 'staged');
  fs.mkdirSync(archiveStagedDir, { recursive: true });
  const result = dirFileCount(repoDir, { path: '.claude-tweaks/pipelines/*/staged', max: 0 });
  assert.strictEqual(result.pass, false);
  assert.match(result.message, /1 file\(s\)/);
});

test('dirFileCount: non-directory entries are not counted', () => {
  const repoDir = mkTmpRepo();
  const dir = path.join(repoDir, 'mixed');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'file.txt'), 'x');
  fs.mkdirSync(path.join(dir, 'subdir'), { recursive: true });
  const result = dirFileCount(repoDir, { path: 'mixed', max: 1 });
  assert.strictEqual(result.pass, true);
  assert.match(result.message, /1 file\(s\)/);
});
