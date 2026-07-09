# Deferred Work

### Scope harness-health's runs/ + churn-report to a single coherent caller

**Origin:** Reflection during `/claude-tweaks:wrap-up` for the skill-health feature (2026-07-06, renamed harness-health 2026-07-07), seeded by whole-branch review Minor finding #3.

**Context:** `bin/harness-health.js`'s `validate-findings` command calls `recordRun` on every non-dry-run invocation, and it's invoked by three different callers with different scopes: the harness-health routine (one target per firing), `/claude-tweaks:wrap-up` Step 7 (once per skill in its read set), and `/claude-tweaks:init` Phase 6 (once per drifted skill). Each of wrap-up's/init's per-skill calls writes its own single-skill run record to `.claude-tweaks/harness-health/runs/`, so `churn-report`'s appeared/disappeared/ratio math — designed around one coherent sweep per run — ends up computed across interleaved, incomparable run boundaries from three unrelated callers.

**Trigger:** Revisit when someone actually wants to use `churn-report` for real diagnostics (it currently has no documented reader in `harness-health/SKILL.md`), or when the `runs/` directory's unbounded growth becomes a practical nuisance.

**Options considered:** (a) gate `recordRun` behind `--run-id` actually being passed by a real sweep (wrap-up/init don't currently pass one, so this would naturally exclude them without new code), or (b) drop run-logging/`churn-report` entirely until a real consumer needs it, or (c) give each caller its own run-log namespace so the three don't collide.

### Fix flaky `tests/statusline.test.js` "render under 500ms" timing assertion

**Origin:** Observed repeatedly during the Impeccable re-baseline work (2026-07-07/08) — passes reliably in isolation but intermittently fails under full-suite load.

**Context:** The test asserts the statusline renders under a fixed 500ms budget. In isolation (`node --test tests/statusline.test.js`) it consistently passes at ~100-130ms. Under the full suite (`npm test`, 631 tests), it intermittently fails with recorded durations up to ~900ms — CPU contention from the rest of the suite, not an actual regression in the statusline renderer. Re-run in isolation every time it was observed failing during this work, and it passed 100% of those checks.

**Trigger:** Revisit when someone next touches `tests/statusline.test.js` or the statusline renderer itself, or if the flake rate becomes disruptive enough to affect CI/PR checks reliably.

**Options considered:** (a) raise the timing budget to absorb reasonable CI/load-time jitter; (b) mock/stub the slow dependency so the test measures logic time, not wall-clock render time under contention; (c) move performance assertions to a separate, non-gating benchmark suite rather than the main correctness suite.
