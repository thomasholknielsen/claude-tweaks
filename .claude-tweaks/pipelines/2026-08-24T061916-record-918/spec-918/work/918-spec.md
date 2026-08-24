---
record: 918
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 918: residue.js branches probe tags ANY merged branch as this-run blast-radius, not just this run's own

Surface: backend

Origin: spec #888 wrap-up (Phase 3 residue sweep)
Defer-reason: needs-human-decision

## Current State

`plugin/bin/lib/residue/scope-filter.js`'s header comment states `--scope blast-radius` "narrows to findings whose own `scope` field is 'blast-radius', dropping `observed` findings (a sibling worktree, another lane's PR)". `residue-sweep.md` repeats this guarantee explicitly: "another session's live worktree, another lane's open PR — and forcing this run's ledger to drill on those is exactly the noise `bin/lib/residue/scope-filter.js` exists to filter out."

This guarantee does not hold for `plugin/bin/lib/residue/probes/branches.js`. `probeBranches` tags **every** merged-not-deleted remote branch as `scope: 'blast-radius'` unconditionally (except the exact current head branch) — it has no notion of "branches this run's own worktree created" vs. "any merged branch anywhere in the repo".

**Reproduced live** during spec #888's own wrap-up (2026-08-18): `node plugin/bin/residue.js --base  --integration-branch main --scope blast-radius` returned `origin/worktree-stories-objective-fixes` as a `blast-radius`-scoped, `remedy: auto` finding — but that branch's local worktree (`stories-objective-fixes`) was listed as **in-use by a live sibling session** in this very session's own SessionStart context at the time. Under a higher-autonomy ceiling (`ledgerNarrowing`/`ledgerRouteRemainder`, `trusted`+), a `remedy: auto` finding is a natural Phase-1 fix-now candidate — this scoping gap could cause a future wrap-up run to delete another live session's remote branch out from under it.

## Deliverables

- [ ] `probeBranches` (or its caller) gains an actual ownership check — e.g. restrict to branches reachable only from this run's own worktree HEAD history, or branches whose name matches this run's own known branch-naming convention (`worktree-*`/`flow-spec-*` created by *this* run specifically), rather than every merged branch in the repo.
- [ ] Either fix `scope-filter.js`'s/`residue-sweep.md`'s documentation to accurately describe the branches probe's actual (repo-wide) behavior, or fix the probe to match the documented guarantee — pick one, but stop the drift between the two.
- [ ] A regression test proving a merged branch tied to a *different* run/worktree is NOT tagged `scope: 'blast-radius'` under `--scope blast-radius`.

## Acceptance Criteria

- [ ] `--scope blast-radius` never surfaces a branch this run's own worktree did not create, matching what `scope-filter.js`'s own header comment already promises.
- [ ] Existing `/tidy`'s `--scope repo` sweep is unaffected (it already wants the repo-wide behavior).

## Technical Approach

Give `probeBranches` (`plugin/bin/lib/residue/probes/branches.js`) an actual ownership predicate instead of its current unconditional tag: restrict `scope: 'blast-radius'` to merged branches reachable from this run's own worktree HEAD history (or matching this run's own known branch-naming convention, e.g. `worktree-*`/`flow-spec-*` created by *this specific run*) — every other merged branch falls through to `scope: 'observed'` instead, matching what `scope-filter.js`'s header comment and `residue-sweep.md` both already promise. Once the probe's actual behavior matches the documented guarantee, no changes to `scope-filter.js` or `residue-sweep.md` are needed; if the ownership check turns out to be impractical for some branch-naming case, fix the documentation instead — pick one direction, not both. `/tidy`'s `--scope repo` sweep reads the unfiltered (`observed`-inclusive) finding set already, so tightening `probeBranches`'s `blast-radius` tagging must not touch what `--scope repo` itself surfaces.

### Key Files

- `plugin/bin/lib/residue/probes/branches.js` — `probeBranches`, the ownership-check gap
- `plugin/bin/lib/residue/scope-filter.js` — header comment states the guarantee this probe currently violates
- `plugin/skills/_shared/residue-sweep.md` — repeats the same guarantee
- `tests/bin-lib/residue/` — new regression test for the ownership check

## Gotchas

- This is a safety-relevant scoping gap, not a cosmetic one: reproduced live, a `blast-radius`-tagged finding with `remedy: auto` is a Phase-1 fix-now candidate at `trusted`+ autonomy ceilings — an unfixed gap here risks a future wrap-up run deleting a live sibling session's remote branch.
- Do not regress `/tidy`'s `--scope repo` sweep, which deliberately wants the repo-wide (unfiltered) branch behavior — the fix is scoped to the `blast-radius` tagging path only.
- Filed by `review` via `specShapedBody` during spec #888's wrap-up — Current State's reproduction (2026-08-18) is the evidence base; no further reproduction is needed before starting the fix.

## Original request

residue.js branches probe tags ANY merged branch as this-run blast-radius, not just this run's own

Origin: spec #888 wrap-up (Phase 3 residue sweep)
Defer-reason: needs-human-decision

## Current State

`plugin/bin/lib/residue/scope-filter.js`'s header comment states `--scope blast-radius` "narrows to findings whose own `scope` field is 'blast-radius', dropping `observed` findings (a sibling worktree, another lane's PR)". `residue-sweep.md` repeats this guarantee explicitly: "another session's live worktree, another lane's open PR — and forcing this run's ledger to drill on those is exactly the noise `bin/lib/residue/scope-filter.js` exists to filter out."

This guarantee does not hold for `plugin/bin/lib/residue/probes/branches.js`. `probeBranches` tags **every** merged-not-deleted remote branch as `scope: 'blast-radius'` unconditionally (except the exact current head branch) — it has no notion of "branches this run's own worktree created" vs. "any merged branch anywhere in the repo".

**Reproduced live** during spec #888's own wrap-up (2026-08-18): `node plugin/bin/residue.js --base  --integration-branch main --scope blast-radius` returned `origin/worktree-stories-objective-fixes` as a `blast-radius`-scoped, `remedy: auto` finding — but that branch's local worktree (`stories-objective-fixes`) was listed as **in-use by a live sibling session** in this very session's own SessionStart context at the time. Under a higher-autonomy ceiling (`ledgerNarrowing`/`ledgerRouteRemainder`, `trusted`+), a `remedy: auto` finding is a natural Phase-1 fix-now candidate — this scoping gap could cause a future wrap-up run to delete another live session's remote branch out from under it.

## Deliverables

- [ ] `probeBranches` (or its caller) gains an actual ownership check — e.g. restrict to branches reachable only from this run's own worktree HEAD history, or branches whose name matches this run's own known branch-naming convention (`worktree-*`/`flow-spec-*` created by *this* run specifically), rather than every merged branch in the repo.
- [ ] Either fix `scope-filter.js`'s/`residue-sweep.md`'s documentation to accurately describe the branches probe's actual (repo-wide) behavior, or fix the probe to match the documented guarantee — pick one, but stop the drift between the two.
- [ ] A regression test proving a merged branch tied to a *different* run/worktree is NOT tagged `scope: 'blast-radius'` under `--scope blast-radius`.

## Acceptance Criteria

- [ ] `--scope blast-radius` never surfaces a branch this run's own worktree did not create, matching what `scope-filter.js`'s own header comment already promises.
- [ ] Existing `/tidy`'s `--scope repo` sweep is unaffected (it already wants the repo-wide behavior).

_Filed by `review` via specShapedBody._

