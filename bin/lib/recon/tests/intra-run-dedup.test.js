/**
 * Intra-run fingerprint dedup tests.
 *
 * In v2 the mechanical-lens spine is removed; cmdRun emits a slices-only
 * stub (plan: [], summary: {}). The ingest-judgment command is also removed.
 * This file now tests that cmdRun emits the expected v2 slices-only shape.
 *
 * No external dependencies — pure node:test + node:assert.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-dedup-'));
}

// Capture stdout written by cmdRun into a string, then restore process.stdout.write.
function captureStdout(fn) {
  const chunks = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { chunks.push(chunk); return true; };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

// Resolve the real path to bin/recon.js from this test file's location.
const RECON_JS = path.resolve(__dirname, '..', '..', '..', 'recon.js');

test('cmdRun: emits v2 slices-only output shape (plan:[], summary:{})', () => {
  const root = tmp();

  delete require.cache[RECON_JS];

  let output;
  try {
    const { cmdRun } = require(RECON_JS);
    output = captureStdout(() => {
      cmdRun({ root, area: '.', dryRun: true, runId: 'test-dedup' });
    });
  } finally {
    delete require.cache[RECON_JS];
  }

  const result = JSON.parse(output);

  // v2 cmdRun emits no findings — the SKILL drives the judge directly.
  assert.deepStrictEqual(result.plan, [], 'plan must be empty in v2');
  assert.deepStrictEqual(result.summary, {}, 'summary must be empty in v2');
  assert.ok(Array.isArray(result.areas), 'areas must be an array');
  assert.strictEqual(result.runId, 'test-dedup');
  assert.strictEqual(result.dryRun, true);
});
