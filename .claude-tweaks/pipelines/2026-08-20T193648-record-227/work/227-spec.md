---
record: 227
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 227: Residue sweep hygiene batch: silent evidence cap, missing degradation test, stale prose

Surface: backend

## Current State

Five small items were flagged during 6.69.0's task reviews and whole-branch review and triaged as
ship-with rather than fixed inline. Fact-checking each against current `main` at shaping time found
four still accurate and one now obsolete:

- **Evidence cap** — `bin/lib/residue/probes/suite.js:20` (`probeSuite`) still caps `not ok` lines
  at `.slice(0, 5)` with no signal that lines were dropped; confirmed present.
- **Missing `probeClaims` gh-unavailable test** — **obsolete**. `bin/lib/residue/probes/claims.js`
  (and its `gh`-unavailable test coverage) was deleted in commit `3cd8719b` ("Close the claim
  deprecation window — retire the refs/claims keyspace surface, refs #247"), which landed the day
  after this issue was filed. There is no `probeClaims` function anywhere in the current codebase.
  Dropped from scope below.
- **Stale prose in `residue-sweep.md`** — still accurate, but the line has moved: the "a resolved
  gate denial, *once* `events.jsonl` carries `gate-denial` entries" future-conditional now sits
  around line 90-91 of `skills/wrap-up/residue-sweep.md` (not line 71). `bin/lib/hooks/pre-tool-use.js:606`
  already calls `ctxLib.appendEvent(ownedRun.dir, 'gate-denial', ...)`, so the conditional has
  resolved and the prose should say so plainly.
- **`validateFinding(null)` throws** — confirmed in `bin/lib/residue/finding.js:21`; the `= {}`
  default only substitutes on `undefined`, so a literal `null` argument reaches
  `requireNonEmptyStrings(null, [...])` unguarded.
- **Detached-HEAD edge in `probeWorktrees`** — confirmed in `bin/lib/residue/probes/worktrees.js:22`,
  guarded on `scope.headBranch &&`, the same shape as `bin/lib/residue/probes/branches.js:43`.

## Deliverables

1. `bin/lib/residue/probes/suite.js` (`probeSuite`) — when the raw `not ok` line count exceeds the
   5-line cap, append an explicit truncation signal (e.g. `+N more`) to the evidence string instead
   of silently dropping the remainder. `evidence` is excluded from the fingerprint basis
   (`bin/lib/residue/finding.js`), so this mints no new finding ids.
2. `skills/wrap-up/residue-sweep.md` (~line 90-91) — reword the gate-denial sentence from a future
   conditional ("once `events.jsonl` carries `gate-denial` entries") to present tense, since
   `bin/lib/hooks/pre-tool-use.js` already writes those entries.
3. `bin/lib/residue/finding.js` (`validateFinding`) — guard against a literal `null` argument (the
   `= {}` default only covers `undefined`) so `validateFinding(null)` returns an error array like
   any other invalid-shape input, instead of throwing.
4. `bin/lib/residue/probes/worktrees.js` (head-worktree exclusion, ~line 22) — either close the
   detached-HEAD gap so a detached-HEAD session doesn't report its own worktree as residue (matching
   guard shape in `bin/lib/residue/probes/branches.js:43`), or, if it's confirmed unreachable for
   plugin-provisioned worktrees, leave the guard as-is and add a one-line comment stating why.

Out of scope: a `probeClaims` gh-unavailable test (original item 2) — the probe it would have
tested no longer exists (see Current State).

## Acceptance Criteria

- `probeSuite`'s evidence string includes an explicit cap signal whenever raw `not ok` lines exceed
  5; no existing finding id changes as a result.
- `skills/wrap-up/residue-sweep.md`'s gate-denial sentence reads as present-tense fact, not a future
  conditional.
- `validateFinding(null)` returns a non-throwing error array; a new test case in
  `bin/lib/residue`'s test suite covers this input and fails against the current code before the
  fix.
- `probeWorktrees` either no longer reports the running session's own worktree as residue under a
  detached HEAD, or the record's own comment states why that path is unreachable for
  plugin-provisioned worktrees.
- `npm test` passes.

## Technical Approach

Four independent, small, single-file changes — no shared abstraction needed. Land as one commit or
several; either is fine given the size. Verify the `validateFinding(null)` fix and the
`probeSuite` cap-signal change with new/updated unit tests in `bin/lib/residue`'s existing suite
rather than relying on manual inspection.

## Gotchas

- The original item 2 ("probeClaims has no test for its own gh-unavailable branch") is obsolete —
  `bin/lib/residue/probes/claims.js` was deleted in commit `3cd8719b` as part of closing #247's
  claim-deprecation window, one day after this issue was filed. Do not resurrect a test for a
  function that no longer exists; if `gh`-unavailable degradation needs coverage for whatever
  replaced `refs/claims`, that's a new issue, not this one.
- `validateFinding`'s `null` guard is defensive: no current caller passes `null` (every consumer
  validates a `makeFinding()` result) — per the original triage this is future-proofing against
  external input, not a live bug.
- The detached-HEAD guard in `probeWorktrees` is, per the original triage, likely unreachable for
  plugin-provisioned worktrees today — confirm that's still true before spending effort on a fix
  nothing can currently trigger; narrowing the AC to "document why" is an acceptable outcome if so.

## Original request

Residue sweep hygiene batch: silent evidence cap, missing degradation test, stale prose

Four small items deferred from 6.69.0's reviews, grouped because each is a few lines.

**1. `probeSuite` caps evidence at 5 `not ok` lines with no '+N more'.** The design's own risk table says 'Cap it, and report the cap — no silent truncation', and `render.js` honors that for finding counts. A broadly-red suite can bury the relevant failure past line 5 with nothing signalling more exist. Cheap because `evidence` is excluded from the fingerprint basis, so changing it mints no new ids.

**2. `probeClaims` has no test for its own gh-unavailable branch.** `probeForge` has one. This matters more since 6.69.0 made `gh` the only path to claim data — that branch now carries the whole degradation guarantee.

**3. `residue-sweep.md` line ~71 is stale:** 'a resolved gate denial, *once* `events.jsonl` carries `gate-denial` entries' — `pre-tool-use.js` writes them as of 6.69.0, so the future conditional already holds.

**4. `validateFinding(null)` throws** instead of returning an error array; the `= {}` default substitutes on `undefined` only. No current caller can reach it (every consumer validates a `makeFinding()` result), so it is a guard for future external input.

**5. Detached-HEAD edge:** `probeWorktrees`' head-worktree exclusion is guarded on `scope.headBranch &&`, so a detached-HEAD session reports its own worktree again. Same guard shape as `probeBranches`; unreachable for plugin-provisioned worktrees.

All found by 6.69.0's task reviews and whole-branch review, triaged as ship-with.

