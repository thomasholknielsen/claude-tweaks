---
record: 561
origin: human
risk: low
size: medium
ceremony: standard
grants: [build, merge]
fingerprint: merge-verification:reconcile-red-tip-detection-on-the-integration-branch
surface: backend
---
# 561: reconcile: red-tip detection on the integration branch

Surface: backend

## Overview

Add an unconditional, inform-tier red-tip check to the reconcile layer: when the integration branch's tip commit has a failing CI conclusion, say so at SessionStart and at reconcile's other trigger points (via the shared result object — see Deliverables). This is the only coverage for direct pushes (fast-lane commits, bookkeeping, releases — the majority of writes in solo-fleet repos), which no merge gate can see. It is deliberately not gated on the `merge-verification` policy value.

**Complexity:** Medium
**Estimated tasks:** 4

## Non-Goals

- No merge behavior changes, no blocking of anything — inform tier only
- No policy gating (runs whatever `merge-verification` resolves to)
- No pending-status reporting — a run still in progress is not a finding
- Checks API only: the legacy commit-status API (`/commits/{sha}/status`) is deliberately out of scope — a repo whose only CI signal is status-API-based reads as "no CI" here; accepted, since the plugin's CI detection (#559) is GitHub-Actions-scoped for the same reason

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| — | none | — |

## Current State

- Reconcile modules: `bin/lib/reconcile/` — `mirror-ff.js` (fetch + fast-forward), worktree reap, claim release, run-dir archive, `archive-branches.js`, `release-merged.js`, orchestrated by `bin/lib/reconcile/index.js`, whose `ALL_CHECKS` execution order is load-bearing (its own header comment) and which already threads `resolveIntegrationBranch(root)` into `mirrorFastForward`/`archiveBranches`; runs from SessionStart and dispatch's own trigger points (`integration-model: pr-first` only — `skills/_shared/integration-model.md`; CLAUDE.md Hooks section / `docs/hooks.md`). Dispatch's trigger point logs the whole `reconcile()` JSON result to `decisions.md`.
- SessionStart hook: `bin/lib/hooks/session-start.js` emits additionalContext (inform tier)
- Tier vocabulary: block / warn / inform / log — `docs/hooks.md`
- Tests: `tests/bin-lib/reconcile/` per-module suites; `tests/hooks-dispatcher.test.js` garbage-stdin invariant (every hook path exits 0)

## Deliverables

- [ ] `bin/lib/reconcile/red-tip.js`: take the already-resolved integration branch (reuse `resolveIntegrationBranch(root)` via `index.js`'s existing threading — never a second resolution path), read `origin/{branch}`'s tip sha, fetch that commit's check runs via `gh api --paginate repos/{owner}/{repo}/commits/{sha}/check-runs`, **dedupe to the newest run per check name** (a superseded failed run followed by a green rerun on the same sha is not a finding), and return a finding when any deduped conclusion is `failure` or `timed_out` — `cancelled`, `neutral`, `stale`, `action_required`, `skipped` are deliberately not red; green, pending (`in_progress`/`queued`), no CI, `gh` absent, or any API error → `null` (silent no-op, matching reconcile's existing degrade posture)
- [ ] Wire into `bin/lib/reconcile/index.js`'s `ALL_CHECKS` **immediately after `mirror`** (so it reads the ref `mirror-ff`'s fetch just refreshed — placement is load-bearing, document it in the header comment), returning under `result.redTip` in the same shape as the sibling checks' result keys so dispatch's existing JSON logging picks it up with no dispatch-side change; `session-start.js` renders the prose line: `CI is red on {branch} tip at {short-sha} — {failing check names, first 3, then "+N more"}`
- [ ] The check never throws out of the hook path — every failure mode resolves to "no finding," preserving the exit-0 invariant
- [ ] Tests: red tip surfaces (single and multi-failure, including the rerun-dedup case: same check name failed-then-green surfaces nothing); green/pending/no-CI/gh-absent each produce no finding; pagination path exercised; module passes the dispatcher garbage-stdin invariant when wired

## Acceptance Criteria

1. With a mocked check-runs response containing a `failure` conclusion (newest for its check name), the reconcile pass returns `result.redTip` with the message naming branch, short sha, and the failing check name(s) — multi-failure lists the first 3 names then `+N more`.
2. A mocked response where a check's `failure` run is followed by a newer `success` run of the same name returns no finding (rerun dedup).
3. Mocked green, pending-only, empty (no CI), and gh-unavailable responses each return no finding and no error.
4. `node --test tests/bin-lib/reconcile/` and `tests/hooks-dispatcher.test.js` pass; no hook path exits non-zero.
5. On this repo, a session started while `main`'s tip CI is green produces no red-tip line in SessionStart output.

## Technical Approach

Follow the existing reconcile module shape (single-purpose file, pure logic testable without a live `gh`, index.js does the wiring). One paginated `gh` call per reconcile pass, no caching layer — reconcile already rate-limits itself by running at discrete trigger points, and the staleness question is answered by placement after `mirror`'s fetch rather than a fetch of its own.

### Data / API Surface

- Read-only: `gh api --paginate repos/{owner}/{repo}/commits/{sha}/check-runs` (conclusions per check run). No writes, no labels, no state files.
- Returns: `result.redTip` — `null`, or `{ branch, sha, failing: [names], message }` matching the sibling result-key convention in `index.js`.

### Key Files

- `bin/lib/reconcile/red-tip.js` — new module
- `bin/lib/reconcile/index.js` — wiring (after `mirror` in `ALL_CHECKS`) + header-comment order note
- `bin/lib/hooks/session-start.js` — render the finding (inform tier)
- `tests/bin-lib/reconcile/red-tip.test.js` — new suite

### Package Dependencies

- none (Node built-ins + `gh` subprocess, per reconcile convention)

## Gotchas

- **Never break a session** — every path exits 0; a deny/throw from a hook module is a contract violation (`docs/hooks.md`; `tests/hooks-dispatcher.test.js` enforces). New modules must pass the garbage-stdin invariant.
- Reconcile is `integration-model: pr-first` only — the red-tip check inherits that scoping for free by living in reconcile; do not add a separate `local-merge` path (nothing to read there). Any prose naming `integration-model` must cite `skills/_shared/integration-model.md` (`tests/integration-model.test.js`).
- Conclusion vs. status: red = conclusion `failure` or `timed_out` only; `in_progress`/`queued` are status values, not conclusions — pending is not red (see Non-Goals), and the excluded-conclusions list in Deliverables is exhaustive on purpose.
- Hook processes get the harness's own environment — resolve repo/branch from cwd, not from exported shell vars (CLAUDE.md Hooks section).

<!-- work-fingerprint: merge-verification:reconcile-red-tip-detection-on-the-integration-branch -->
