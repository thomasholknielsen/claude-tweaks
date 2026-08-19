---
record: 405
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
blocked-by: []
surface: backend
---
# 405: Spike: measure GitHub API call volume per pr-first pipeline run

Surface: backend

## Overview

Measure how many GitHub API calls a pr-first pipeline run will actually make before the PR-early lifecycle ships. The pr-first integration model makes every run born-public: draft PR created at run start, a branch push at every phase exit, one PR comment per gate verdict, plus label operations. With parallel runs (dispatch bundles, routines) this consumes REST/GraphQL rate budget; nobody has measured whether a realistic fleet stays comfortably inside GitHub's limits (5,000 REST requests/hour authenticated). The output is a decision input for the PR-early lifecycle sub-issue: ship phase-exit pushes as designed, or batch them.

**Complexity:** Low
**Estimated tasks:** 3

## Non-Goals

- No production code changes — this is a measurement, and anything built is throwaway.
- No rate-limit mitigation design beyond a recommendation paragraph.

## Prerequisites

None — runs against today's behavior plus arithmetic for the planned call sites.

## Current State

- `skills/_shared/pending-review-durability.md` — today's late-push procedure: one push + one PR create + one comment per parked run.
- The pr-first design (see parent record) plans: 1 PR create + ~5 phase pushes + ~3 comments + ~4 label ops per run, plus reconciler reads (PR list per trigger point).
- `gh api rate_limit` reports current consumption live.

## Deliverables

- [ ] A call-count table: API calls per single run (create/push/comment/label), per dispatch bundle, per reconciler invocation (reads), under the planned pr-first lifecycle — each call site classified by transport (REST vs GraphQL; several `gh pr` subcommands are GraphQL mutations under the hood), with totals against **both** budgets. Reconciler reads state their complexity explicitly (one PR list per trigger point vs one lookup per open run).
- [ ] A projection: calls/hour for a worst case grounded in this repo's actual usage — dispatch's group cap, the routine fleet's configured cadences, observed session frequency (read them, don't invent) — against the budget of the identity the calls actually run as. Name that identity (local `gh` PAT vs cloud sandbox token): PAT REST is 5,000/hr, GitHub App installations 15,000/hr, Actions tokens 1,000/hr/repo — a 3-15× swing in the denominator.
- [ ] A one-paragraph recommendation in the closing comment: phase-exit pushes as designed, or a named batching change — with the threshold that would trigger revisiting.

## Acceptance Criteria

1. The table enumerates every planned call site by name (run start, per-phase push, verdict comment, console comment, merge, reconciler read) with a per-run count for each — no "misc" bucket.
2. The projection states its fleet assumptions as numbers and shows the arithmetic.
3. The recommendation names a concrete go/no-go: either "phase-exit pushes fit with ≥{N}× headroom" or a specific batching alternative.

## Technical Approach

Count, don't simulate: enumerate call sites from the design (parent record's Overview), take the phase-count **range** across at least three recent runs' decisions.md/events (one sample can't establish typicality), and use the high end for the worst case. `git push` is git-protocol, not REST — but verify the "effectively unmetered" assumption empirically rather than asserting it: sample `gh api rate_limit` (which reports the REST and GraphQL buckets separately) before/after a push-heavy sequence and record what actually moved.

### Key Files

- `docs/superpowers/plans/` — no file output required; findings land as a closing comment on this record.

## Gotchas

- A spike's output is an answer, not code you keep — label anything built as throwaway.
- `gh` itself makes extra calls (e.g. resolving repo from remote); measure with `gh api rate_limit` before/after a sample sequence rather than trusting documentation.
- The go/no-go threshold must cite the measured identity's budget, never a generic 5,000/hr.

<!-- work-fingerprint: pr-first-integration-model:spike-measure-github-api-call-volume-per-pr-first-pipeline-r -->
