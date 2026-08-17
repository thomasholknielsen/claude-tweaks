// Statusline performance budget — deliberately NOT part of `npm test`.
//
// Run with: npm run test:perf
//
// Why this lives outside tests/: a wall-clock assertion cannot be made deterministic in a
// suite that routinely runs while other agent sessions run their own full suites in sibling
// worktrees. Measured on this repo, a competing `npm test` inflated a bare `node -e ""` spawn
// from 34ms to 566ms — a 16x swing in a term the renderer neither owns nor can influence.
// Keeping a timing assertion in the correctness run therefore trains the reader to dismiss
// failures as "probably load," which is exactly how a real regression gets waved through
// (see issue #107). Correctness runs stay deterministic; this file keeps the coverage.
//
// Carries its own model-fixture copy, outside npm test's coverage — check this file too
// when refreshing tests/statusline.test.js's model literals for a Claude model-family rename.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STATUSLINE = path.resolve(__dirname, '..', 'plugin', 'bin', 'claude-tweaks-statusline.js');

function withTempHome(run) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-perf-'));
  try {
    return run(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// Control: identical spawn and temp-HOME shape to the subject below, running a no-op instead
// of the renderer. Subtracting it removes Node process startup, which dominates the raw
// wall-clock figure — measured idle, startup is ~34ms of a ~58ms total.
const runControlSpawn = () => withTempHome((home) => execFileSync('node', ['-e', ''], {
  encoding: 'utf8',
  env: { ...process.env, HOME: home },
}));

const runStatusline = (input) => withTempHome((home) => execFileSync('node', [STATUSLINE], {
  input: JSON.stringify(input),
  encoding: 'utf8',
  env: { ...process.env, HOME: home, NO_COLOR: '1' },
}));

function bestOf(attempts, fn) {
  let best = Infinity;
  for (let i = 0; i < attempts; i += 1) {
    const start = Date.now();
    fn();
    best = Math.min(best, Date.now() - start);
  }
  return best;
}

test('statusline render cost stays under 250ms above bare-Node startup', () => {
  // Budget basis, measured on a 12-core machine with no competing suite: bare spawn ~34ms,
  // full statusline spawn ~58ms, so the renderer's own share is ~24ms. 250ms is ~10x that.
  // Verified to discriminate: injecting a 300ms synchronous stall into the renderer fails
  // this assertion at 335ms (422ms absolute) — a figure the previous 1000ms absolute
  // threshold would have passed, so this is a tighter bound than the one it replaces.
  const control = bestOf(3, runControlSpawn);
  const absolute = bestOf(3, () => runStatusline({
    model: { display_name: 'Sonnet 5' },
    context_window: { used_percentage: 18 },
  }));
  const renderCost = absolute - control;

  assert.ok(
    renderCost < 250,
    `statusline render cost ${renderCost}ms exceeds the 250ms budget `
    + `(absolute ${absolute}ms, bare-Node control ${control}ms). `
    + 'If another test suite is running concurrently, re-run this alone before investigating.',
  );
});
