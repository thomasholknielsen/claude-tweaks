# Deferred Work

### Scope skill-health's runs/ + churn-report to a single coherent caller

**Origin:** Reflection during `/claude-tweaks:wrap-up` for the skill-health feature (2026-07-06), seeded by whole-branch review Minor finding #3.

**Context:** `bin/skill-health.js`'s `validate-findings` command calls `recordRun` on every non-dry-run invocation, and it's invoked by three different callers with different scopes: the skill-health routine (one skill-target per firing), `/claude-tweaks:wrap-up` Step 7 (once per skill in its read set), and `/claude-tweaks:init` Phase 6 (once per drifted skill). Each of wrap-up's/init's per-skill calls writes its own single-skill run record to `.claude-tweaks/skill-health/runs/`, so `churn-report`'s appeared/disappeared/ratio math — designed around one coherent sweep per run — ends up computed across interleaved, incomparable run boundaries from three unrelated callers.

**Trigger:** Revisit when someone actually wants to use `churn-report` for real diagnostics (it currently has no documented reader in `skill-health/SKILL.md`), or when the `runs/` directory's unbounded growth becomes a practical nuisance.

**Options considered:** (a) gate `recordRun` behind `--run-id` actually being passed by a real sweep (wrap-up/init don't currently pass one, so this would naturally exclude them without new code), or (b) drop run-logging/`churn-report` entirely until a real consumer needs it, or (c) give each caller its own run-log namespace so the three don't collide.
