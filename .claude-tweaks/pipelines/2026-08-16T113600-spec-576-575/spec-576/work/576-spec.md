---
record: 576
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 576: backlog refine grant worklist includes bot:in-progress records — 6 of 13 candidates were mid-build

Surface: backend

## Current State

`skills/backlog/refine-mode.md` Step 1's worklist script (the `node -e` block around lines 52–55) filters out granted records (`grants.build`/`grants.merge`) and splits the remainder into `fresh` vs `blocked` on `facets.bot.blocked` only. `facets.bot.inProgress` is never consulted, so records actively claimed by a live run (`bot:in-progress`) flow into the `fresh` grant-check worklist. In the live 2026-08-16 refine run, 6 of 13 grant-check candidates were mid-build (claimed by PRs #542/#555) — each consumed a grant-check dispatch that is wasted by construction, since a grant written mid-run changes nothing the executing pipeline reads.

## Deliverables

- In refine-mode.md Step 1's worklist script, partition records with `facets.bot.inProgress` out of `fresh` — a three-way split (`fresh` = neither bot flag, `blocked`, `inProgress`) emitted in the script's JSON output, mirroring the existing `blocked` split.
- The grant-check population (the records Step 2's per-record `grant-check` dispatches run over, and the budget slicing that feeds it) reads only `fresh` — in-progress records get no dispatch and no grant-recommendation table row.
- The rendered report narrates the exclusion with one count line when non-zero (e.g. `{n} in flight — excluded from grant checks; a grant changes nothing mid-run`), absent when zero — the exclusion must be visible, never a silent drop.
- Update the prose sentence describing the fresh/blocked split (and its retired-triage provenance note) to describe the three-way split.

## Acceptance Criteria

- A record whose `facets.bot.inProgress` is true never receives a grant-check dispatch and never appears as a grant-recommendation candidate row.
- `bot:blocked` handling is unchanged: blocked records still bypass the budget and lane as `re-authorize (bot:blocked)` rows.
- Population-wide passes that deliberately cover the whole open set (the trust table's `--state all` fetch, priority sweep, dependency-mismatch detection) are unaffected — the exclusion is scoped to the grant-check worklist only.
- The in-flight exclusion line renders in the report when the count is non-zero and is absent when zero.
- `npm test` passes (conformance suites pin refine-mode.md prose).

## Technical Approach

Edit the Step 1 `node -e` worklist script: derive `inProgress` from the current `fresh` set via `r.facets.bot.inProgress`, remove those rows from `fresh`, and add `inProgress` to the emitted JSON alongside `fresh`/`blocked`. Downstream consumers key on `fresh` and `blocked` by name, so adding a third key is additive; verify each reference to the worklist JSON (`/tmp/backlog-refine-worklist.json`) to confirm none iterates the whole object. Add the narration line where the report assembles its header/summary lines. `parseRecordFacets` already exposes `bot.inProgress` (dispatch's skip rule reads it), so no library change is needed.

## Gotchas

- Scope discipline: only the grant-check worklist excludes in-progress records. Do not filter them from the trust table, priority sweep, or dependency detection — those intentionally read wider populations.
- #574 redesigns this same file's process and report wholesale; this fix lands first and the redesign builds on the three-way split.

## Original request

backlog refine grant worklist includes bot:in-progress records — 6 of 13 candidates were mid-build

**Related:** #574

Context: 2026-08-16 refine run — the worklist filter excludes bot:blocked but not bot:in-progress, so 6 of 13 grant-check candidates were records actively claimed by live runs (PRs #542/#555), where a grant-check dispatch is wasted and a grant changes nothing mid-run.

Scope: exclude (or separately lane) records with facets.bot.inProgress in refine-mode.md Step 1's worklist split, mirroring the existing blocked split.
