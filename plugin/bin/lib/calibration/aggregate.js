'use strict';
const { classifyDecisionLine } = require('./decisions-classifier.js');

const NARROWING_MIN_APPEARANCES = 10;
const CEILING_MIN_STOPS = 10;

function aggregate({ tsv, runs, rowIds, windowN }) {
  const sortedRuns = [...runs].sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0));
  const windowRuns = sortedRuns.slice(-windowN);
  const windowRunIds = new Set(windowRuns.map((r) => r.runId));

  const perRow = {};
  for (const rowId of rowIds) {
    const rowsInWindow = (tsv.rows || []).filter((r) => r.rowId === rowId && windowRunIds.has(r.runId));
    if (rowsInWindow.length === 0) { perRow[rowId] = 'no runs in window'; continue; }
    const findings = rowsInWindow.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
    perRow[rowId] = { appearances: rowsInWindow.length, findings };
  }

  const consoleDist = { unlogged: 0 };
  const reversibilityDist = { high: 0, med: 0, low: 0, 'n/a': 0 };
  const frictionCounts = {};
  let refusedCount = 0;
  let consoleStops = 0;

  for (const run of windowRuns) {
    let sawTerminal = false;
    for (const line of run.decisionLines || []) {
      const c = classifyDecisionLine(line);
      if (c.terminalDecision) {
        consoleDist[c.terminalDecision] = (consoleDist[c.terminalDecision] || 0) + 1;
        sawTerminal = true;
        consoleStops++;
      }
      if (c.reversibility) reversibilityDist[c.reversibility] = (reversibilityDist[c.reversibility] || 0) + 1;
      if (c.kind === 'REFUSED') refusedCount++;
    }
    if (!sawTerminal) consoleDist.unlogged++;
    for (const [kind, n] of Object.entries((run.events && run.events.counts) || {})) {
      frictionCounts[kind] = (frictionCounts[kind] || 0) + n;
    }
  }

  const narrowingSignal = rowIds.filter((id) => {
    const r = perRow[id];
    return r !== 'no runs in window' && r.appearances >= NARROWING_MIN_APPEARANCES && r.findings === 0;
  });
  const narrowingSuppressed = rowIds.filter((id) => {
    const r = perRow[id];
    return r !== 'no runs in window' && r.appearances < NARROWING_MIN_APPEARANCES;
  });
  const ceiling = consoleStops < CEILING_MIN_STOPS;

  return {
    window: { runIds: windowRuns.map((r) => r.runId) },
    perRow,
    consoleDist,
    reversibilityDist,
    frictionCounts,
    refusedCount,
    narrowingSignal,
    suppressions: { narrowing: narrowingSuppressed, ceiling },
  };
}

module.exports = { aggregate, NARROWING_MIN_APPEARANCES, CEILING_MIN_STOPS };
