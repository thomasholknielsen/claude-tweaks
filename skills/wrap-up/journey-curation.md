# Journey Curation — judge file

Judge file for the `journeys` registry row (`Journeys`), loaded per that row when its gate opens. The gate, the scope, and the row's `SCANNED` line are **engine-owned** — see `curation-engine.md`; this file is judgment only.

Loaded by `/claude-tweaks:wrap-up`'s Journeys curation row to detect journey drift introduced by this work — journeys whose documented flow has fallen out of sync with the diff — and to detect a persona-facing flow this work introduced with zero journey coverage anywhere. Two checks, both always recomputed fresh: J1 judges journeys the diff touches, J2 judges the diff for missing coverage.

## J1: Diff-vs-frontmatter overlap + inline self-review

**Scope:** the journeys in the worklist row's `scope.candidates` — the engine computed the `files:`-frontmatter overlap against this work's diff. Always computed fresh — never reused from `/review`'s Step 6 visual-review recommendation or the 3g-cov lens (neither produces a reusable, persisted artifact).

For each journey in scope:

1. Read the journey file in full.
2. Apply the four checks and the structural-validity check from `_shared/journey-self-review.md` (persona, step shape, origin coverage, outcome clarity — structural validity checked first) — the identical criteria `/claude-tweaks:journeys` Step 3.5 (write-time) and `/claude-tweaks:journey-health` (audit-time) already apply, reused inline here as this project's third consumer, rather than invoking either skill as a nested call (same reuse pattern `docs-health-integration.md` already applies to `_shared/criteria-docs-diataxis.md`).
3. A structural-validity failure (missing frontmatter, missing `## Steps`, no steps) is a harder failure than the four content checks — treat it as a finding requiring fix, not a soft note.

Route surviving findings by severity, mirroring the shape `_shared/journey-self-review.md`'s own consumers use:

- **Structural-validity failure, or any content-check failure** → collect as `[journey] {file} — {description}` rows. In every mode they surface in the Review Console's own "Journey updates" section (`review-console.md`), which owns the one terminal decision. Applied at Phase 4's execution step exactly like any other approved fix — never filed as a GitHub issue, unlike `/claude-tweaks:journey-health`'s audit-time pass on journeys nobody has touched recently; wrap-up has full session context on what was just built.

## J2: Missing-journey gap-detection

**Scope:** this work's full diff, not any existing journey — mirrors D2's missing-doc gap detection (record #56's documentation curation) structurally.

Ask: did this work introduce a new persona-facing flow (for any persona: end users, admins, developers, internal tooling users) with **zero journey coverage anywhere** in the project — not merely a flow that doesn't map to J1's touched-journey scope, but something no existing journey documents at all? This is a deliberately high bar, identical in spirit to D2's "zero existing doc coverage anywhere." Examples that clear it: a new slash command with a real end-to-end flow, a new persona-facing capability with no journey even adjacent to it. Examples that don't: a change to an existing flow's implementation with no new persona-facing behavior, a bug fix, an internal refactor.

This check runs independent of what `/claude-tweaks:journeys` Step 1 already concluded during build — it is a wrap-up-time safety net for drift introduced after build's own journey check ran, or for a project where the "journeys build-time recalibration" leaf's 3-signal checklist (record #57) hasn't caught the gap for some other reason.

On a hit:

1. Propose a `[journey] {new-journey-name} — Create: {one-line rationale}` row, folded into the same Journey updates collection as J1's findings.
2. On approval, Phase 4's execution step creates the new journey file using `journey-template.md` (in `/claude-tweaks:journeys`' skill directory) and fills in real content from this work's own session context — the same reasoning `docs-health-integration.md`'s D2 already documents for why wrap-up (unlike `/claude-tweaks:init` Phase 8.5) writes real content immediately instead of backlogging a template pointer.

Declare **"No journey updates needed"** only when J1 finds no journey in scope (or every in-scope journey passes every check) AND J2 finds no missing-journey gap.
