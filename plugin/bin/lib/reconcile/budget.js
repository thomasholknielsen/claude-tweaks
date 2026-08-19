// bin/lib/reconcile/budget.js — an overall wall-clock ceiling for one
// reconcile() pass, so total time is bounded regardless of how much stale
// branch/claim/console state has accumulated (#820, D4). Deliberately not a
// per-check timeout — those already exist (git-exec's DEFAULT_TIMEOUT_MS,
// each gh call's own 5s) — this bounds the SUM across the whole pass.
'use strict';

const DEFAULT_BUDGET_MS = 18000;

// nowFn is injectable — no Date.now() call baked into exceeded()/remainingMs()
// themselves — matching cache.js's isFresh() purity convention for this same
// feature (#820 review): a test can pass a fake clock instead of sleeping on
// a real one to observe a deadline pass.
function createBudget(ms = DEFAULT_BUDGET_MS, nowFn = Date.now) {
  const deadline = nowFn() + ms;
  return {
    exceeded: () => nowFn() >= deadline,
    remainingMs: () => Math.max(0, deadline - nowFn()),
  };
}

module.exports = { createBudget, DEFAULT_BUDGET_MS };
