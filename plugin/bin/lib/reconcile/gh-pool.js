// bin/lib/reconcile/gh-pool.js — a small concurrency-capped async mapper
// for the reconcile family's per-item `gh` calls (release-merged.js's
// per-claim issue-state reads, console-execute.js's per-run `gh pr view`
// calls), replacing serial execFileSync loops with bounded parallelism
// (#820, D5). Per-item failures never abort the batch — matching
// gh-api-module-pattern's "one failed edge never aborts the batch" —
// caught and returned in place so the caller can branch on
// `result instanceof Error` per item.
'use strict';

const DEFAULT_CONCURRENCY = 6;

// (items, worker) -> Promise<results[]> — results[i] corresponds to
// items[i] regardless of completion order; a rejected worker resolves to
// the caught Error at that index instead of rejecting the whole batch.
async function runWithConcurrency(items, worker, cap = DEFAULT_CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next;
      next += 1;
      try {
        results[i] = await worker(items[i]);
      } catch (e) {
        results[i] = e instanceof Error ? e : new Error(String(e));
      }
    }
  }
  // Floor the cap at 1 (and treat a non-finite cap as 1): an unclamped
  // `Math.min(cap, items.length)` with cap <= 0 or NaN spawns ZERO workers
  // and resolves to an all-`undefined` array — the whole batch silently
  // dropped, with no error anywhere. No caller passes a bad cap today; this
  // closes it by construction rather than by that assumption holding
  // (CLAUDE.md: no silent caps).
  const poolSize = Math.min(Number.isFinite(cap) ? Math.max(1, cap) : 1, items.length);
  const workers = Array.from({ length: poolSize }, () => runOne());
  await Promise.all(workers);
  return results;
}

module.exports = { runWithConcurrency, DEFAULT_CONCURRENCY };
