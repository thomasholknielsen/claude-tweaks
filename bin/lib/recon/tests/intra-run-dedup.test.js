/**
 * Intra-run fingerprint dedup tests.
 *
 * Uses Node module-cache patching to inject a stub lens that intentionally
 * emits two findings with the same fingerprint-producing fields.  No external
 * dependencies — pure node:test + node:assert.
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

// Returns a lens that emits `count` findings with identical fingerprint fields.
function makeDupLens(count) {
  return {
    id: 'dup-stub',
    kind: 'mechanical',
    run(_area, _root, _cfg) {
      const findings = [];
      for (let i = 0; i < count; i++) {
        findings.push({
          lens: 'dup-stub',
          area: '.',
          signature: 'identical-signature',
          title: 'Duplicate finding',
          files: ['a.js'],
          evidence: 'a.js:1',
          suggestion: 'Fix it.',
          acceptance: 'No duplicates.',
          severity: 'high',
          confidence: 'high',
          category: 'Convention',
          id: null,
        });
      }
      return findings;
    },
  };
}

// Capture stdout written by cmdRun / cmdIngestJudgment into a string, then
// restore process.stdout.write.
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
const LENSES_INDEX = path.resolve(__dirname, '..', 'lenses', 'index.js');

test('cmdRun: two identical-signature findings produce exactly one plan entry', () => {
  const root = tmp();

  // Patch the lenses/index module in the require cache to return our dup lens.
  // Must happen before requiring recon.js (or after clearing its cache entry).
  delete require.cache[RECON_JS];
  delete require.cache[LENSES_INDEX];

  const realLensesModule = require(LENSES_INDEX);
  const { buildLenses: _orig } = realLensesModule;

  // Override buildLenses on the cached module object so recon.js picks it up.
  realLensesModule.buildLenses = () => [makeDupLens(2)];

  let output;
  try {
    const { cmdRun } = require(RECON_JS);
    output = captureStdout(() => {
      cmdRun({ root, area: '.', dryRun: true, runId: 'test-dedup' });
    });
  } finally {
    realLensesModule.buildLenses = _orig;
    delete require.cache[RECON_JS];
  }

  const result = JSON.parse(output);

  // The dup lens emits 2 identical findings; the plan must contain exactly 1 entry.
  assert.strictEqual(
    result.plan.length,
    1,
    `Expected 1 plan entry after intra-run dedup, got ${result.plan.length}`,
  );

  // The single entry should be the fingerprint (not a duplicate).
  assert.ok(result.plan[0].fingerprint.startsWith('recon-'), 'fingerprint should start with recon-');

  // Summary must count the fingerprint exactly once (file or remember, not 2×).
  const totalDecisions = Object.values(result.summary).reduce((a, b) => a + b, 0);
  assert.strictEqual(totalDecisions, 1, `Expected 1 total decision in summary, got ${totalDecisions}`);
});

test('cmdIngestJudgment: two identical-signature findings in results produce exactly one payload', () => {
  const root = tmp();

  // Write a results file with two findings that share the same fingerprint fields.
  const resultsPath = path.join(root, 'results.json');
  const dupFinding = {
    lens: 'dup-stub',
    area: '.',
    signature: 'identical-signature',
    title: 'Duplicate finding',
    files: ['a.js'],
    evidence: 'a.js:1',
    suggestion: 'Fix it.',
    acceptance: 'No duplicates.',
    severity: 'high',
    confidence: 'high',
    category: 'Convention',
  };
  fs.writeFileSync(
    resultsPath,
    JSON.stringify([{ lensId: 'dup-stub', area: '.', findings: [dupFinding, dupFinding] }]),
    'utf8',
  );

  delete require.cache[RECON_JS];

  let output;
  // cmdIngestJudgment writes to stderr too; suppress stderr noise.
  const stderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true;
  try {
    const { cmdIngestJudgment } = require(RECON_JS);
    output = captureStdout(() => {
      cmdIngestJudgment({ root, _: ['ingest-judgment', resultsPath], runId: 'test-dedup' });
    });
  } finally {
    process.stderr.write = stderrWrite;
    delete require.cache[RECON_JS];
  }

  const payloads = JSON.parse(output);

  // Two identical findings must collapse to 1 payload after intra-run dedup.
  assert.strictEqual(
    payloads.length,
    1,
    `Expected 1 payload after intra-run dedup, got ${payloads.length}`,
  );
});
