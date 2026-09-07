'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('verification.md: the runner owns flake retries — the section is "Flake handling" and the agent is no longer told to re-run every failed file first (#1925)', () => {
  const text = read('plugin/skills/test/verification.md');
  assert.ok(text.includes('### Flake handling (tests check only)'));
  assert.ok(!text.includes('### Flake adjudication'));
  assert.ok(!text.includes('Before reporting a `tests` check failure, re-run each failed file in isolation once'));
  assert.ok(text.includes('CAVEAT: flaky-retried:'));
  assert.ok(text.includes('CAVEAT: flaky-allowlist:'));
  assert.ok(text.includes('`flaky.files`'));
  assert.ok(text.includes('kind `flaky-allowlist`'), 'the agent stages an allowlist proposal, never edits the allowlist itself');
  assert.ok(text.includes('AUTO {time} — Flaky retry: {files} passed on isolated rerun (declared in verify-scope.json). Reversibility: high.'));
  assert.ok(text.includes('node --test path/to/file.test.js'), 'the isolated rerun still applies to an UNLISTED failing file');
});

test('docs/plugin-structure.md names flaky.js and the count stamp\'s flakyHits (#1925)', () => {
  const text = read('docs/plugin-structure.md');
  assert.ok(text.includes('flaky.js (#1925'));
  assert.ok(text.includes('flakyHits'));
  assert.ok(text.includes('extractFailingFiles'));
});
