const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'plugin', 'bin', 'docs-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-word-count-')); }

test('word-count returns a word count for a plain doc', () => {
  const root = tmp();
  const docPath = path.join(root, 'doc.md');
  fs.writeFileSync(docPath, 'one two three four five');
  const output = JSON.parse(execFileSync('node', [CLI, 'word-count', docPath], { encoding: 'utf8' }));
  assert.strictEqual(output.result, 5);
});

test('word-count returns the depth-hint frontmatter value as-is', () => {
  const root = tmp();
  const docPath = path.join(root, 'doc.md');
  fs.writeFileSync(docPath, ['---', 'depth-hint: deep-dive', '---', 'one two three'].join('\n'));
  const output = JSON.parse(execFileSync('node', [CLI, 'word-count', docPath], { encoding: 'utf8' }));
  assert.strictEqual(output.result, 'deep-dive');
});

test('word-count exits non-zero when the path arg is missing', () => {
  const result = spawnSync('node', [CLI, 'word-count'], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('word-count exits non-zero when the file does not exist', () => {
  const result = spawnSync('node', [CLI, 'word-count', '/nonexistent/doc.md'], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});
