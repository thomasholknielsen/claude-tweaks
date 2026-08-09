# Recorded eval baselines

One section per scenario whose live (billed) run has been executed and recorded. Expected
outcomes in each corpus are authored from design intent and are never edited to match an
observed run (`[IL-62]`) — a baseline that disagrees with the corpus is a measurement of the
judgment's current behavior, i.e. exactly the signal these evals exist to produce.

## research-consequence-filter-matrix

- **Measured:** 2026-08-09, against plugin version 6.73.0 (worktree `worktree-flow-spec-242-243-115-180`, skills tree at the v6.73.0 base plus this branch's own eval-only changes — the filter's prose in `skills/research/verify-mode.md` is byte-identical to v6.73.0's).
- **Result:** 4/6 cases pass. Total cost ≈ $6.06 (≈ $0.95–1.10/case).
- **Failures (both genuine filter judgments, not parsing artifacts):**
  - `clear-keep` — filter stated **drop** for `Q-WEBHOOK` (expected keep: the brief's two answers produce structurally different pipelines).
  - `green-ground` — filter kept `Q-PRIORITY`/`Q-NOTIFY` but stated **drop** for `Q-RETRY` (expected keep-nearly-everything on a stated no-priors topic).
- **Reading:** the filter under-keeps relative to design intent in 2/6 cases, including the corpus's most clear-cut keep. Any future change to the filter's prose should re-run this matrix and compare here — an improvement claim needs `clear-keep` to flip to PASS without the drop cases regressing.
- **Harness note:** result JSONs persist assertions + metrics only, not `resultText`, so a failed case's reasoning is not recoverable after the run — diagnose by re-running the single case and reading the live output if needed.
- Command: `cd evals && node runner.js run research-consequence-filter-matrix` (history recorded in `history.jsonl`).

## assess-merge-check-matrix

Not yet measured — offline wiring only (see `NOTES.md`'s live-run section, including the
unprobed `CLAUDE_PLUGIN_ROOT` sandbox assumption its first live run must confirm).
