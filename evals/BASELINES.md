# Recorded eval baselines

One section per scenario whose live (billed) run has been executed and recorded. Expected
outcomes in each corpus are authored from design intent and are never edited to match an
observed run (`[IL-62]`) — a baseline that disagrees with the corpus is a measurement of the
judgment's current behavior, i.e. exactly the signal these evals exist to produce.

## research-consequence-filter-matrix

- **Current baseline: 5/6** — measured 2026-08-09 against plugin 6.73.0 plus this branch's calibrated filter prose (`plugin/skills/research/verify-mode.md` as of commit `4979d9ed`). ≈ $0.95–1.15/case per run.
- **Remaining failure:** `convergence-boundary` — filter states **keep** for `Q-DBTYPE` despite the brief's stated infra-policy constraint fixing the choice. The subtlest corpus case; deliberately recorded rather than iterated further (calibration was capped at two prose passes).
- **Calibration history (same day, three runs):**
  1. Uncalibrated v6.73.0 prose: **4/6** — under-keeping (`clear-keep`'s `Q-WEBHOOK` and green-ground's `Q-RETRY` dropped against design intent).
  2. First calibration (`b0027999` — branch-selection-is-divergence + positive-demonstration-to-drop): **4/6** — overcorrected into over-keeping (`clear-drop`, `convergence-boundary` kept despite brief-stated convergence reasons).
  3. Symmetric refinement (`4979d9ed` — which-system vs knob-within-one-system; a brief-stated reason IS the demonstration): **5/6**, only `convergence-boundary` failing.
- **Reading for future changes:** any further prose change re-runs this matrix; an improvement claim needs `convergence-boundary` to flip without regressing the five passing cases. Note the swing between runs 1 and 2 — this filter's prose is sensitive, so never change it without re-measuring.
- **Harness note:** result JSONs persist assertions + metrics only, not `resultText`, so a failed case's reasoning is not recoverable after the run — diagnose by re-running the single case and reading the live output.
- Command: `cd evals && node runner.js run research-consequence-filter-matrix` (history recorded in `history.jsonl`).

## assess-merge-check-matrix

Not yet measured — offline wiring only (see `NOTES.md`'s live-run section, including the
unprobed `CLAUDE_PLUGIN_ROOT` sandbox assumption its first live run must confirm).
