'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { aggregate } = require('../../../plugin/bin/lib/calibration/aggregate.js');

function makeRuns(n, { withFindingsOnRow = null } = {}) {
  const runs = [];
  for (let i = 0; i < n; i++) {
    const runId = `2026-08-${String(i + 1).padStart(2, '0')}T000000-run`;
    const decisionLines = [
      '- AUTO 12:00:00 — Review Console: terminal decision approve-all. Reversibility: n/a.',
    ];
    runs.push({ runId, decisionLines, events: { counts: {} } });
  }
  return runs;
}

test('aggregate: a row absent from every run in the window is "no runs in window"', () => {
  const result = aggregate({ tsv: { rows: [] }, runs: makeRuns(3), rowIds: ['skills', 'docs'], windowN: 20 });
  assert.strictEqual(result.perRow.skills, 'no runs in window');
});

test('aggregate: narrowing signal suppressed under 10 appearances, present at >=10', () => {
  const runs5 = makeRuns(5);
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push({ date: '2026-08-01', runId: runs5[i].runId, rowId: 'skills', gate: 'closed', count: '0', outcome: 'na' });
  const under = aggregate({ tsv: { rows }, runs: runs5, rowIds: ['skills'], windowN: 20 });
  assert.ok(under.suppressions.narrowing.includes('skills'));

  const runs10 = makeRuns(10);
  const rowsFull = [];
  for (let i = 0; i < 10; i++) rowsFull.push({ date: '2026-08-01', runId: runs10[i].runId, rowId: 'skills', gate: 'closed', count: '0', outcome: 'na' });
  const over = aggregate({ tsv: { rows: rowsFull }, runs: runs10, rowIds: ['skills'], windowN: 20 });
  assert.ok(!over.suppressions.narrowing.includes('skills'));
  assert.strictEqual(over.perRow.skills.appearances, 10);
  assert.strictEqual(over.perRow.skills.findings, 0);
});

test('aggregate: console distribution counts terminal decisions and buckets unlogged runs', () => {
  const runs = makeRuns(3);
  runs.push({ runId: '2026-08-04T000000-run', decisionLines: ['- AUTO 09:00:00 — Step 1.5: scope-creep.'], events: { counts: {} } });
  const result = aggregate({ tsv: { rows: [] }, runs, rowIds: [], windowN: 20 });
  assert.strictEqual(result.consoleDist['approve-all'], 3);
  assert.strictEqual(result.consoleDist.unlogged, 1);
});

test('aggregate: ceiling signal suppressed under 10 console stops', () => {
  const result = aggregate({ tsv: { rows: [] }, runs: makeRuns(9), rowIds: [], windowN: 20 });
  assert.strictEqual(result.suppressions.ceiling, true);
});

test('aggregate: failedCount counts FAILED lines across the window, starting at 0', () => {
  const clean = aggregate({ tsv: { rows: [] }, runs: makeRuns(2), rowIds: [], windowN: 20 });
  assert.strictEqual(clean.failedCount, 0);

  const runs = makeRuns(2);
  runs.push({
    runId: '2026-08-05T000000-run',
    decisionLines: [
      '- FAILED 09:00:00 — apply-refine-labels: priority write failed on #42: HTTP 500.',
      '- FAILED 09:00:05 — apply-refine-labels: grant write failed on #43: HTTP 500.',
    ],
    events: { counts: {} },
  });
  const withFailures = aggregate({ tsv: { rows: [] }, runs, rowIds: [], windowN: 20 });
  assert.strictEqual(withFailures.failedCount, 2);
});

test('aggregate: window selects the last N runIds by name sort', () => {
  const runs = makeRuns(25);
  const result = aggregate({ tsv: { rows: [] }, runs, rowIds: [], windowN: 20 });
  assert.strictEqual(result.window.runIds.length, 20);
  assert.strictEqual(result.window.runIds[19], runs[24].runId);
});
