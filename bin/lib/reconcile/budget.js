// bin/lib/reconcile/budget.js — an overall wall-clock ceiling for one
// reconcile() pass, so total time is bounded regardless of how much stale
// branch/claim/console state has accumulated (#820, D4). Deliberately not a
// per-check timeout — those already exist (git-exec's DEFAULT_TIMEOUT_MS,
// each gh call's own 5s) — this bounds the SUM across the whole pass.
'use strict';

const DEFAULT_BUDGET_MS = 18000;

function createBudget(ms = DEFAULT_BUDGET_MS) {
  const deadline = Date.now() + ms;
  return {
    exceeded: () => Date.now() >= deadline,
    remainingMs: () => Math.max(0, deadline - Date.now()),
  };
}

module.exports = { createBudget, DEFAULT_BUDGET_MS };
