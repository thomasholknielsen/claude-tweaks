# Journey Curation for /wrap-up Step 7.8

Loaded by `/claude-tweaks:wrap-up` Step 7.8 to detect journey drift introduced by this work — journeys whose documented flow has fallen out of sync with the diff — and to detect a persona-facing flow this work introduced with zero journey coverage anywhere. Two checks, both always recomputed fresh: J1 judges journeys the diff touches, J2 judges the diff for missing coverage.

## J1: Diff-vs-frontmatter overlap + inline self-review

**Scope:** every journey file under `docs/journeys/*.md` whose `files:` frontmatter overlaps this work's `git diff --name-only` against the run's base ref. Always computed fresh — never reused from `/review`'s Step 6 visual-review recommendation or the 3g-cov lens (see this skill's own `SKILL.md` Step 7.8 body for why neither produces a reusable, persisted artifact).

For each journey in scope:

1. Read the journey file in full.
2. Apply the four checks and the structural-validity check from `_shared/journey-self-review.md` (persona, step shape, origin coverage, outcome clarity — structural validity checked first) — the identical criteria `/claude-tweaks:journeys` Step 3.5 (write-time) and `/claude-tweaks:journey-health` (audit-time) already apply, reused inline here as this project's third consumer, rather than invoking either skill as a nested call (same reuse pattern `docs-health-integration.md` already applies to `_shared/criteria-docs-diataxis.md`).
3. A structural-validity failure (missing frontmatter, missing `## Steps`, no steps) is a harder failure than the four content checks — treat it as a finding requiring fix, not a soft note.

Route surviving findings by severity, mirroring the shape `_shared/journey-self-review.md`'s own consumers use:

- **Structural-validity failure, or any content-check failure** → collect as `[journey] {file} — {description}` rows, surfaced in the Wrap-Up Review Console's own "Journey updates" section (Step 8.6). Applied inline in Step 10, following the same fix-inline behavior `/claude-tweaks:journeys` Step 3.5 uses (one fix attempt per issue) rather than filing a GitHub issue — wrap-up has full session context on what was just built, unlike `/claude-tweaks:journey-health`'s audit-time pass on journeys nobody has touched recently.

## J2: Missing-journey gap-detection

**Scope:** this work's full diff, not any existing journey — mirrors D2's missing-doc gap detection (record #56's documentation curation) structurally.

Ask: did this work introduce a new persona-facing flow (for any persona: end users, admins, developers, internal tooling users) with **zero journey coverage anywhere** in the project — not merely a flow that doesn't map to J1's touched-journey scope, but something no existing journey documents at all? This is a deliberately high bar, identical in spirit to D2's "zero existing doc coverage anywhere." Examples that clear it: a new slash command with a real end-to-end flow, a new persona-facing capability with no journey even adjacent to it. Examples that don't: a change to an existing flow's implementation with no new persona-facing behavior, a bug fix, an internal refactor.

This check runs independent of what `/claude-tweaks:journeys` Step 1 already concluded during build — it is a wrap-up-time safety net for drift introduced after build's own journey check ran, or for a project where the "journeys build-time recalibration" leaf's 3-signal checklist (record #57) hasn't caught the gap for some other reason.

On a hit:

1. Propose a `[journey] {new-journey-name} — Create: {one-line rationale}` row, folded into the same Journey updates collection as J1's findings.
2. On approval, Step 10 creates the new journey file using `journey-template.md` (in `/claude-tweaks:journeys`' skill directory) and fills in real content from this work's own session context — the same reasoning `docs-health-integration.md`'s D2 already documents for why wrap-up (unlike `/claude-tweaks:init` Phase 8.5) writes real content immediately instead of backlogging a template pointer.

## Mandatory summary (always, regardless of outcome)

Emit exactly one summary line every Step 7.8 run, auto mode or interactive:

```
SCANNED {time} — Step 7.8 journey curation summary: {N} journeys checked ({names}), self-review: {selfReview}, gap detection: {gapResult}.
Result: {A} fixed inline, {C} new journey(s) created, {G} gap(s) found.
Reversibility: N/A.
```

`{N}`/`{names}` are J1's in-scope journeys (files: frontmatter overlapping the diff — `0`/`none` when no journey overlaps). `{selfReview}` summarizes pass/fail per journey checked. `{gapResult}` names whether J2 found a hit (`found`/`not found`). Auto mode appends this line to `decisions.md` under the `SCANNED` tag (see `_shared/auto-decision-log.md`); interactive mode prints the equivalent line inline instead of `decisions.md`.

Declare **"No journey updates needed"** only when J1 finds no journey in scope (or every in-scope journey passes every check) AND J2 finds no missing-journey gap — and even then, the mandatory summary line above is still emitted, naming the journeys checked and the gap-detection outcome. A "no updates needed" outcome that skips the summary line is a Step 7.8 defect, not a valid completion.
