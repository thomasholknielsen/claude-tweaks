---
record: 464
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
blocked-by: [463]
surface: backend
---
# 464: Move claim acquisition into flow pre-flight (Step 2.8), with file-overlap warning for direct runs

Surface: backend

## Overview

Claim acquisition is currently the only phase of the claim lifecycle still living in dispatch —
release (wrap-up Section E) and settle/retry bookkeeping already run inside flow's own Task
calls. Because acquisition is the odd one out, a human running `/flow #N` directly claims
nothing at all, and nothing stops that invocation from racing a scheduled `dispatch next` firing
over the same record.

This work unit moves claim acquisition into a new flow pre-flight substep (Step 2.8), so both a
dispatched run and a direct human invocation go through the same lock. It also adds a small,
related check in the same substep: a file-overlap warning when a human targets a record directly
without its file-overlap partners, closing the last piece of the grouping gap for a bypass-
dispatch invocation without reintroducing dispatch's queue-wide group computation into flow.

**Complexity:** Medium
**Estimated tasks:** 8

## Non-Goals

- The claim procedure itself (`_shared/issue-claims.md`'s read-classify-write, transport split,
  `classifyClaimBlob`) is unchanged — only the call site moves.
- The group-claim invariant (claim every file-overlap member before starting any) is unchanged —
  dispatch still computes groups and hands flow the whole group; flow claims what it's handed.
- No new grouping computation is added to flow — the overlap warning reuses the existing
  `groupByFileOverlap` module (`bin/lib/issues/grouping.js`) that dispatch and `/help` already
  call; flow does not gain queue-wide knowledge.
- The overlap check is a warning, never a gate — it never blocks or auto-expands a human's
  explicitly named target list.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #463 | Unify dispatch/flow run identity: dispatch mints the run dir, flow adopts it, CLAIM_RUN_ID retires | ready — must land first, since this unit's Step 2.8 claim identity is `basename($PIPELINE_RUN_DIR)`, which only exists after #463 ships |

## Current State

- Claim write: `skills/dispatch/SKILL.md` Step 4 currently performs the read-classify-write claim
  procedure, then bootstraps and adds `bot:in-progress`, then posts the claim comment — all before
  any Task call runs.
- Claim posture logic: `skills/dispatch/claim-outcomes.md` holds the `classifyClaimBlob`-keyed
  posture branch (skip / break-and-take-over / treat-as-live) and the `--claim-only` modifier's
  stop-point behavior.
- Headless trace: `skills/dispatch/headless-self-report.md` files a deduplicated GitHub trace for
  `next`-form Preflight failures — does not currently cover a claim contest, since claiming
  doesn't happen inside a flow invocation yet.
- Flow pre-flight: `skills/flow/SKILL.md` Step 2 runs three checks (2.5 branch-divergence, 2.6
  shape, 2.7 design-doc rejection) before Step 3's Config Manifesto — there is no claim step in
  this sequence today.
- Direct human runs: `/claude-tweaks:flow #N` run by a human with no `CLAIM_RUN_ID`/claim in
  place today claims nothing — it proceeds straight from materialize's shape gate to the Config
  Manifesto.
- Overlap detection module: `bin/lib/issues/grouping.js`'s `groupByFileOverlap` (and
  `selectGroupsForExplicitList`, which already consumes it) is the existing, tested module for
  file-overlap grouping — used today by dispatch Step 2/Step 3 and `/help`'s dashboard.

## Deliverables

- [ ] New flow pre-flight substep, Step 2.8 ("Claim the targets"), ordered after materialize's
  shape gate (2.7) and before the Config Manifesto / worktree creation.
- [ ] Skip-guard logic for Step 2.8: skip (not fail) when `work-backend: local-files`, when in
  topic-name mode before resolution, or when every target's claim already shows
  `claim.runId === basename($PIPELINE_RUN_DIR)` (covers the second Task call, a failure-path
  `wrap-up`-only teardown call, and a human resuming a parked run — one guard, no per-caller
  special-casing).
- [ ] Step 2.8 claims every named target via `_shared/issue-claims.md`'s existing
  read-classify-write procedure, over whichever transport `_shared/github-write-transport.md`
  selects — no new claim mechanics, only a new call site.
- [ ] Relocate `skills/dispatch/claim-outcomes.md`'s posture logic (skip / break-and-take-over /
  treat-as-live keyed off `classifyClaimBlob`'s five states) into a new flow sub-file.
- [ ] Contest handling: single-record run aborts with the holder's identity and TTL surfaced in
  the failure card; multi-record run aborts the whole run by default (group-claim invariant), with
  `keep-going` downgrading a contested member to a skip, consistent with `keep-going`'s existing
  meaning elsewhere in flow.
- [ ] Dispatch Step 4 shrinks to mint-only (per #463): remove the claim
  write, the `bot:in-progress` label bootstrap/add, and the claim comment post — these move to
  flow Step 2.8. Retire the `--claim-only` modifier from dispatch's argument table (its
  diagnostic purpose is served by invoking the claim module directly).
- [ ] Step 2.8 also runs the file-overlap warning: before claiming, check whether any named
  target file-overlaps an open record via `groupByFileOverlap` (`bin/lib/issues/grouping.js`); on
  a hit, surface a warn-tier note ("record #N overlaps open #M; consider `/flow #N,#M`") and
  proceed with only the named target(s) — never a gate.
- [ ] `skills/dispatch/headless-self-report.md`'s `next`-form trigger list gains one new case: a
  Step 2.8 claim contest hit during a `dispatch next` firing files the same deduplicated GitHub
  trace the file already produces for other Preflight-style failures.

## Acceptance Criteria

1. `/claude-tweaks:flow #N` run directly by a human, with no prior claim, successfully claims
   `#N` at Step 2.8 before the Config Manifesto runs — verified by inspecting the claim blob for
   `#N` after the run starts and before it reaches Step 3.
2. `/claude-tweaks:flow #N` run against a record already claimed by a *different* run id aborts
   at Step 2.8 with the holder's identity and TTL surfaced, before any worktree is created —
   verified by checking no worktree exists after the abort.
3. A dispatched run's second Task call (already claimed by the first) skips Step 2.8 entirely —
   verified by confirming no duplicate claim-comment is posted.
4. `grep -n "claim-only" skills/dispatch/SKILL.md` returns zero matches for the modifier's
   argument-table entry (retirement confirmed); `--batch-size` and other modifiers remain
   present.
5. `/claude-tweaks:flow #N` run directly against a record that file-overlaps an open, unclaimed
   `#M` surfaces the warn-tier overlap note and still proceeds with only `#N` claimed — verified
   by confirming `#M` carries no claim after the run.
6. Bare-mode dispatch selections beyond `dispatch-batch-size` are no longer claimed — verified by
   selecting more groups than the batch size and confirming the excess groups' claim blobs are
   absent (they remain in the unclaimed queue for a later firing).
7. A `next`-form dispatch firing whose flow invocation hits a claim contest at Step 2.8 files the
   same deduplicated GitHub trace `headless-self-report.md` already produces for other
   Preflight-style failures.

## Technical Approach

Step 2.8 sits between materialize's shape gate (2.7 — read-only, cheap) and the Config
Manifesto/worktree creation deliberately: a contested claim aborts before any run-dir
initialization or worktree exists, so there is nothing to tear down on the failure path.

### Key Files

- `skills/flow/SKILL.md` — new Step 2.8, referencing the relocated claim-posture sub-file.
- `skills/flow/` (new sub-file, e.g. `claim-targets.md`) — relocated posture logic from
  `skills/dispatch/claim-outcomes.md`, plus the skip-guard and overlap-warning procedure.
- `skills/dispatch/SKILL.md` — Step 4: remove claim write, label bootstrap/add, comment post;
  retire `--claim-only` from the argument table.
- `skills/dispatch/claim-outcomes.md` — deleted; content moves to the new flow sub-file above.
- `skills/dispatch/headless-self-report.md` — add the claim-contest case to the `next`-form
  self-report trigger list.

### Package Dependencies

- `bin/lib/issues/grouping.js` — reused directly (`groupByFileOverlap`), no changes needed.
- `bin/lib/issues/claims.js` (or equivalent claim-payload module already used by
  `_shared/issue-claims.md`) — reused directly.

## Gotchas

- **Behavior change, not a bug:** bare-mode selections beyond `dispatch-batch-size` used to stay
  claimed for a later firing (a liability in its own right — claims with no run attached,
  recoverable only via TTL). After this change they remain unclaimed in the queue. This is
  intentional — confirm Acceptance Criterion 6 reflects the new behavior, don't "fix" it back.
- **`work-backend: local-files` has no claim infrastructure** — Step 2.8 must skip cleanly on
  that backend, not error. Verify against a `local-files`-configured test fixture, not just
  `github-issues`.
- **The skip-guard is one condition, not three.** Resist the temptation to special-case "second
  Task call" vs. "teardown-only wrap-up call" vs. "human resume" separately — all three collapse
  to the single `claim.runId === basename($PIPELINE_RUN_DIR)` check per the prerequisite
  sub-issue's identity unification. Three separate branches would silently diverge over time.


<!-- work-fingerprint: dispatch-flow-identity-unification:move-claim-acquisition-into-flow-pre-flight-step-2-8-with-fi -->


