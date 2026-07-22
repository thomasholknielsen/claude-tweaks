import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { freshRepo, seedFiles, applyPatch, seedLocalWorkRecord, walkFiles } from '../fixtures/git-fixtures.js';

test('freshRepo: creates an isolated repo with a HEAD commit', () => {
  const dir = freshRepo();
  const log = execFileSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
  assert.match(log, /init/);
});

test('seedFiles: writes and commits files', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'src/index.js': "module.exports = {};\n" });
  assert.ok(fs.existsSync(path.join(dir, 'src/index.js')));
  const log = execFileSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
  assert.match(log, /seed fixture files/);
});

test('applyPatch: applies a unified diff and commits it', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'src/a.js': 'line one\nline two\n' });
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'line one\nline TWO\n', 'utf8');
  const patch = execFileSync('git', ['-C', dir, 'diff'], { encoding: 'utf8' });
  execFileSync('git', ['-C', dir, 'checkout', '--', 'src/a.js']);
  applyPatch(dir, patch);
  const content = fs.readFileSync(path.join(dir, 'src/a.js'), 'utf8');
  assert.strictEqual(content, 'line one\nline TWO\n');
});

test('seedLocalWorkRecord: writes a record readable by local-store', () => {
  const dir = freshRepo();
  const record = seedLocalWorkRecord(dir, {
    slug: 'test-record',
    title: 'Test Record',
    facets: { stage: 'ready', risk: 'low' },
  });
  assert.strictEqual(record.title, 'Test Record');
  assert.strictEqual(record.facets.stage, 'ready');
  assert.ok(fs.existsSync(record.path));
});

test('walkFiles: recursively reads a directory into a flat {relPath: content} map', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'a.txt': 'top', 'nested/b.txt': 'deep' });
  const files = walkFiles(path.join(dir));
  assert.strictEqual(files['a.txt'], 'top');
  assert.strictEqual(files['nested/b.txt'], 'deep');
});
