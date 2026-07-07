# Deferred Work

### Scope harness-health's runs/ + churn-report to a single coherent caller

**Origin:** Reflection during `/claude-tweaks:wrap-up` for the skill-health feature (2026-07-06, renamed harness-health 2026-07-07), seeded by whole-branch review Minor finding #3.

**Context:** `bin/harness-health.js`'s `validate-findings` command calls `recordRun` on every non-dry-run invocation, and it's invoked by three different callers with different scopes: the harness-health routine (one target per firing), `/claude-tweaks:wrap-up` Step 7 (once per skill in its read set), and `/claude-tweaks:init` Phase 6 (once per drifted skill). Each of wrap-up's/init's per-skill calls writes its own single-skill run record to `.claude-tweaks/harness-health/runs/`, so `churn-report`'s appeared/disappeared/ratio math — designed around one coherent sweep per run — ends up computed across interleaved, incomparable run boundaries from three unrelated callers.

**Trigger:** Revisit when someone actually wants to use `churn-report` for real diagnostics (it currently has no documented reader in `harness-health/SKILL.md`), or when the `runs/` directory's unbounded growth becomes a practical nuisance.

**Options considered:** (a) gate `recordRun` behind `--run-id` actually being passed by a real sweep (wrap-up/init don't currently pass one, so this would naturally exclude them without new code), or (b) drop run-logging/`churn-report` entirely until a real consumer needs it, or (c) give each caller its own run-log namespace so the three don't collide.

### Impeccable CLI schema has drifted from documented shape

**Origin:** Discovered 2026-07-07 during Task 4 of the Impeccable re-baseline plan (`docs/superpowers/plans/2026-07-07-impeccable-rebaseline.md`), commit `ebf5762`, while live-verifying the `--fast` CLI flag against the real Impeccable CLI 3.2.0.

**Context:** `skills/design/impeccable-cli.md` documents the Impeccable CLI's `detect --fast --json` output as a JSON object shaped `{files_scanned, findings: [...]}`, with each finding carrying `rule`/`message` fields. Live output from CLI 3.2.0 does not match this: it's a bare JSON array (no `files_scanned`/`findings` wrapper), and each element uses `antipattern`/`description` instead of `rule`/`message`. Separately, CLI 3.2.0 exits non-zero whenever any finding is present, regardless of severity — but `impeccable-cli.md`'s own defensive-parsing rules treat "non-zero exit" as "malformed output" and instruct the wrapper to skip rather than fail. The two affected files are `skills/design/impeccable-cli.md` (the schema documentation, whose "Expected JSON output schema" section and non-zero-exit handling were deliberately left untouched by the Task 4 fix) and `skills/design/modes/test.md` (the mode that invokes the CLI per that schema and computes the `pass`/`fail` result consumed by `/claude-tweaks:design test`). As documented today, a real failing gate — findings with `severity: error` — would exit non-zero and get classified as "CLI returned malformed output" → skip, rather than surfacing as a fail.

**Trigger:** Revisit before trusting `/claude-tweaks:test`'s deterministic Impeccable gate against any project running current Impeccable CLI (3.x). Also revisit proactively whenever someone next touches the `/design test`/`review`/`audit` modes.

**Options considered:** (a) rewrite `impeccable-cli.md`'s schema section to match the new bare-array/`antipattern`-field shape and update `test.md`'s pass/fail logic accordingly, verified against real CLI output; (b) pin the wrapper to invoke an older CLI version if one is still available; (c) treat this as a signal to move toward Impeccable's own new automatic hook (see `skills/build/worktree-setup.md`'s "Impeccable hook consent" section) as the primary detection mechanism instead of the CLI-based `test` mode, if the hook's own output format proves more stable.
