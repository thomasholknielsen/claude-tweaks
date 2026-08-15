# Plan: Surface hidden alternatives in Multi-item decision tables (#469)

## For agentic workers

Executed via `/claude-tweaks:build` (subagent strategy). Documentation-only. One primary edit + a bounded audit.

## Investigation findings (re-verified live against v6.82.0, not assumed from the v6.81.0 report)

- **`skills/init/bootstrap/step-17-work-record-backend.md`** (the report's named example): the gate-succeeds path writes `work-backend: github-issues` silently — no prompt, no table row at all. The gate-fails path renders the choice as two full `AskUserQuestion` options (native option list, both values visible). Neither path currently exhibits the reported "table row hides the alternative" pattern. No change needed — confirmed inline with a dated note.
- **`skills/init/bootstrap/step-15-routine-installation.md`** (the report's second cited instance): its preview table's rows are independently selectable routine candidates, each becoming its own checkable `multiSelect` option — the "Chunked multiSelect batch" convention, not "Multi-item decisions." No hidden alternative exists structurally. No change needed — confirmed inline with a dated note.
- **`skills/flow/manifesto.md`'s Policy levers table**: already does this correctly today — an `Options` column lists every value with the recommended one bolded. Used as the canonical positive example in the convention fix.
- **Broader plugin audit** (grep for `| Recommend` across `skills/`): every other match found is a per-item *action-proposal* table (a tidy action, a backlog label change, a review finding's suggested fix) — each row's "recommendation" is a proposed action on an independent finding, not a closed-set value choice with a concealed alternative. These are out of scope by the spec's own "leave alone any table whose rows aren't a recommendation-vs-alternative choice" instruction.

## Task 1: Fix the canonical convention; document the audit's negative findings inline

**Files:**
- `docs/skill-authoring.md` (modify) — the "Multi-item decisions" bullet: require an `Options` column (or an inline `**{rec}** (Recommended) — alt: {alt}` cell) for a genuine recommendation-vs-alternative row; explicitly exempt per-item action-proposal tables.
- `skills/init/bootstrap/step-17-work-record-backend.md` (modify) — inline note recording the confirmed-no-change finding, so a future editor doesn't re-open this.
- `skills/init/bootstrap/step-15-routine-installation.md` (modify) — same, for its candidate table.

**Acceptance criteria (from the spec):**
- AC1 (convention documents both recommended + alternative(s), one acceptable row format shown, not mandated verbatim) — satisfied by the `docs/skill-authoring.md` edit.
- AC2 (every audited init table that genuinely hides an alternative gets fixed, after confirming which path(s) actually reproduce) — satisfied vacuously: neither Step 17 nor Step 15 currently exhibits the pattern, confirmed live rather than assumed.
- AC3 (tables with no meaningful alternative left unchanged, reasoning noted at the point of decision) — satisfied by the inline notes in both step files.
- AC4 (no regression to the Single-decisions/`AskUserQuestion` convention) — satisfied: that bullet is untouched.

**Verification:** No executable code changed. `npm test` (regression check — no test should reference the old convention wording). Manual: re-read `flow/manifesto.md`'s table to confirm it already matches the corrected convention (used as the positive example, not edited).
