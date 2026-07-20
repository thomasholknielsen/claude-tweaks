'use strict';

// Shared churn-report renderer — byte-identical across all four
// health-suite CLIs' cmdChurnReport (code-health.js, harness-health.js,
// journey-health.js, docs-health.js) before this extraction. Each engine
// supplies its own readDurableState/computeChurn: code-health's own
// computeChurn (bin/lib/code-health/cache.js) returns an extra `stayed`
// field the other three's (bin/lib/health-core/runs.js) don't have, but
// this renderer never reads `stayed`, so it works unmodified against
// either shape.
function makeCmdChurnReport({ readDurableState, computeChurn }) {
  return function cmdChurnReport(args) {
    const root = args.root || process.cwd();
    const runs = readDurableState(root).runs;
    if (runs.length === 0) {
      process.stdout.write('no run logs found\n');
      return;
    }
    const threshold = args['fail-on-high-churn'] != null ? parseFloat(args['fail-on-high-churn']) : null;
    const rows = [['runId', 'runAt', 'findings', 'appeared', 'disappeared', 'ratio']];
    let exceeded = false;
    for (let i = 0; i < runs.length; i++) {
      const prior = i > 0 ? runs[i - 1] : null;
      const c = computeChurn(runs[i].fingerprints, prior);
      rows.push([
        runs[i].runId,
        (runs[i].runAt || '').slice(0, 19),
        String(runs[i].fingerprints.length),
        String(c.appeared.length),
        String(c.disappeared.length),
        String(c.ratio),
      ]);
      if (threshold != null && prior != null && c.ratio >= threshold) exceeded = true;
    }
    const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => String(r[col]).length)));
    for (const row of rows) {
      process.stdout.write(row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ') + '\n');
    }
    if (exceeded) {
      process.stdout.write(`\nhigh churn: one or more runs >= ${threshold}\n`);
      process.exit(1);
    }
  };
}

module.exports = { makeCmdChurnReport };
