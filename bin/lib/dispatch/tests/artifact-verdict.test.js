'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deriveTestVerdict } = require('../artifact-verdict');

function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-artifact-verdict-'));
  const file = path.join(dir, 'raw-output.log');
  fs.writeFileSync(file, content);
  return file;
}

test('derives a failing verdict from the raw artifact, ignoring a planted false claim elsewhere', () => {
  // Simulates the #296 threat model: a fixture decisions.md (never read by this
  // function) falsely claims "all tests pass", while the actual raw test-output
  // artifact shows real failures. The function must never even open the decisions.md
  // file -- it only reads what it's given.
  const fixtureDecisionsMd = tmpFile('AUTO 12:00:00 -- Step 5: all tests pass, 0 failures.\n');
  const rawOutput = tmpFile([
    'TAP version 13',
    '# Subtest: some real test',
    'not ok 1 - some real test',
    '1..1',
    '# tests 1',
    '# pass 0',
    '# fail 1',
    '',
  ].join('\n'));

  const verdict = deriveTestVerdict({ rawTestOutputPath: rawOutput });

  assert.strictEqual(verdict.passed, false, 'must derive FAILED from the raw artifact, not the planted claim');
  assert.strictEqual(verdict.failCount, 1);
  assert.strictEqual(verdict.source, 'raw-artifact');

  // Sanity: prove the fixture decisions.md was never touched -- if this function
  // ever grows a decisions.md/ledger fallback path, this line documents the
  // regression it must not reintroduce.
  assert.ok(fs.existsSync(fixtureDecisionsMd), 'fixture exists but must never be read by deriveTestVerdict');
});

test('derives a passing verdict from a clean raw artifact', () => {
  const rawOutput = tmpFile([
    'TAP version 13',
    '# Subtest: some real test',
    'ok 1 - some real test',
    '1..1',
    '# tests 1',
    '# pass 1',
    '# fail 0',
    '',
  ].join('\n'));

  const verdict = deriveTestVerdict({ rawTestOutputPath: rawOutput });

  assert.strictEqual(verdict.passed, true);
  assert.strictEqual(verdict.failCount, 0);
  assert.strictEqual(verdict.source, 'raw-artifact');
});

test('throws on a missing raw artifact rather than silently defaulting to passed', () => {
  assert.throws(() => deriveTestVerdict({ rawTestOutputPath: '/nonexistent/path.log' }));
});
