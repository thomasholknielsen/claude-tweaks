---
record: 560
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: merge-verification:merge-verification-merge-site-consumers-gate-on-ci
blocked-by: [559]
surface: backend
---
# 560: merge-verification: merge-site consumers gate on CI

Surface: backend

## Overview

Make the plugin's merge sites act on the resolved `merge-verification` value: state the merge-gate procedure once in `_shared`, and have dispatch's auto-merge gate, flow's merge step, and the resume-to-merge path cite and apply it. This is the unit that would have prevented PR #540's red merge — the merge waits for (or arms itself on) the checks instead of racing them.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No policy key or derivation work (#559 owns that)
- No integration-branch red-**tip** monitoring (#561's territory: a red tip left by *direct pushes*, observed by reconcile). This sub-issue's red path is different and in scope: a failing check observed on the *PR being merged*, at merge time.
- No gating of direct pushes (fast-lane commits, bookkeeping, releases)
- Never installs, edits, or suggests bypassing branch protection

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #559 | merge-verification: policy key, derivation ladder, and Manifesto lever | ready (Blocked by — hard; its resolver contract `node bin/resolve-policy.js --values merge-verification` must exist as specified before this starts; re-verify the contract against what #559 actually shipped) |

## Current State

- Canonical PR lifecycle: `skills/_shared/pr-early-run-lifecycle.md` — owns draft-PR-at-run-start, per-phase pushes, and the gh-absent degrade table (PR operations have no MCP fallback; `_shared/github-write-transport.md` carries no pull-request row)
- Dispatch auto-merge gate: `skills/dispatch/SKILL.md` — merges via `gh pr merge` after clearing the run's worktree assignment; its resume-to-merge confirmation (shipped in #531) already *surfaces* `gh pr checks` output but does not act on it
- Flow merge: `skills/flow/worktree-merge.md`
- Parking vocabulary: `bot:blocked` label (`_shared/work-record.md`); decision logging per `_shared/auto-decision-log.md`
- Edges: `docs/skill-graph.md` — every skill relationship stated once there

## Deliverables

- [ ] **Task 0 (empirical premise-check, blocking):** capture real `gh` output for the failure modes the gate classifies, before writing the procedure's fixtures: (a) `gh pr merge --auto` on a repo with no protection rules / auto-merge disabled, (b) `gh pr merge` rejected by required checks, (c) `gh pr checks --watch` exiting on a failing check vs. still-pending, covering both a model-driven call and a plain terminal invocation. Record the literal stderr/exit codes in the `_shared` section as the classification fixture.
- [ ] One canonical merge-gate section in `skills/_shared/pr-early-run-lifecycle.md`. Classification is **state-read-first, never stderr-parsing-first**: before any merge attempt, read `gh pr view {n} --json mergeStateStatus,statusCheckRollup`; a failing check in the rollup → red path immediately. Then per resolved value: `merge-when-green` → attempt `gh pr merge --auto`; arming rejected (auto-merge unavailable per Task 0's captured signature) → degrade to `wait`; `wait` → `gh pr checks {n} --watch` bounded at 15 minutes — the watch exits early on completion, so a red result at any minute takes the red path immediately and `checks-pending-timeout` is reserved strictly for checks still running at the bound; on green, re-read PR state (`gh pr view --json state,mergeStateStatus`) and merge with the run's configured merge method — a new push or closed PR re-enters the gate or reports, never merges blind; `off` → current behavior
- [ ] Red path in that section: never merge; park the run — `bot:blocked` on the work-record issue (dispatch's existing `bot:*` home; `run-state.json` statuses are untouched — parking surfaces via label + log, not run-state) — naming the failing check; log an `AUTO` entry per `_shared/auto-decision-log.md` (an action taken autonomously: parked). Timeout still-pending → same parking, reason `checks-pending-timeout`
- [ ] Forge-cooperation path: merge rejected by org-owned required checks (Task 0 signature (b)) → report as the forge enforcing a stricter policy, arm `--auto` so the merge lands when the forge is satisfied, never retry-loop or suggest bypass
- [ ] gh-absent row added to the existing degrade table: lever unenforceable → proceed as `off`, disclosed at **warn** tier (surfaced in the run summary, not a silent log line)
- [ ] Dispatch's auto-merge gate and flow's `worktree-merge.md` cite the `_shared` section (fully-qualified skill references in actionable text) and apply it. The resume-to-merge confirmation path applies a **one-shot read-then-decide** under the lever — green → proceed, red → surface in the existing confirmation (a human is present on resume), pending → arm `--auto` where available, else offer the choice in that same confirmation; resume never runs the 15-minute blocking watch
- [ ] `docs/skill-graph.md` edges updated for the new `_shared` dependency

## Acceptance Criteria

1. The merge-gate procedure appears exactly once (in `_shared/pr-early-run-lifecycle.md`); `grep -ri "merge-when-green" skills/ | grep -v pr-early-run-lifecycle` returns only citation lines (value named, procedure not restated), and the same holds for `grep -ri "checks-pending-timeout" skills/ | grep -v pr-early-run-lifecycle`.
2. `skills/dispatch/SKILL.md`'s auto-merge gate and `skills/flow/worktree-merge.md` each cite the section by filename.
3. The red path's text names `bot:blocked` (target: the work-record issue) and the `AUTO` decision-log entry shape; the pending-timeout path names `checks-pending-timeout` and states it is reserved for the still-running case.
4. The degrade table's gh-absent row covers the lever (proceed as `off` + warn-tier disclosure), consistent with the table's existing rows.
5. The section's classification text carries Task 0's captured `gh` signatures (literal strings/exit codes), not guessed ones.
6. Full `npm test` passes (conformance suites pin `_shared` citations and skill-graph edges).

## Technical Approach

Prose-contract change across skill files — no `bin/` code beyond Task 0's captured fixtures embedded as text. Parking on a red check is a HARD-GATE-class stop (test-failure class), not a new mid-flow prompt: it is allowed under `_shared/auto-mode-contract.md`'s strict rule and must be written as park-and-surface, never as an `AskUserQuestion` mid-pipeline (the resume path's interactive surface is the existing #531 confirmation, which is already human-facing).

The 15-minute watch bound is fixed by design, not a policy key: `merge-when-green` (arming) is the no-wait path, `wait` is its fallback, and a repo where 15 minutes is chronically wrong should enable auto-merge (protection rules) rather than tune a knob. Parent #558 records the one-lever decision; this paragraph is the timeout's own rationale.

### Data / API Surface

- Reads: `node bin/resolve-policy.js --values merge-verification` (#559's contract); `gh pr view {n} --json mergeStateStatus,statusCheckRollup,state`; `gh pr checks {n}` / `--watch`; `gh pr merge {n} --auto`.
- Writes: `bot:blocked` label add on the run's work-record issue; one `AUTO` decision-log line per parked or armed merge.

### Key Files

- `skills/_shared/pr-early-run-lifecycle.md` — new merge-gate section + degrade-table row
- `skills/dispatch/SKILL.md` — auto-merge gate + resume-to-merge path cite/apply
- `skills/flow/worktree-merge.md` — merge step cites/applies
- `docs/skill-graph.md` — edges

### Package Dependencies

- none

## Gotchas

- `docs/skill-graph.md` is concurrently edited by the in-flight #528–#530/#276 family (PR #542) — rebase before merging; append-only edits, no logical dependency.
- Any text naming `integration-model` must cite `skills/_shared/integration-model.md` (`tests/integration-model.test.js`, repo-wide).
- Skill references inside actionable instruction text must use the fully-qualified `/claude-tweaks:{skill}` form (CLAUDE.md Cross-references rule).
- `skills/dispatch/SKILL.md` and `skills/wrap-up/review-console.md` sit near the 40 KB ceiling family (#552, #553 track it) — check `wc -c` after editing any large skill file; prefer pointing at the `_shared` section over inlining.
- Run the full `npm test` before merging — markdown-only diffs are not exempt from the conformance suites.

<!-- work-fingerprint: merge-verification:merge-verification-merge-site-consumers-gate-on-ci -->

## Architecture Deviations (build — /claude-tweaks:build Common Step 4.5)

| # | What the spec said | What was built | Classification |
|---|---|---|---|
| 1 | The canonical merge-gate section lives in `skills/_shared/pr-early-run-lifecycle.md`; AC1 greps exclude that file | The gate is `## Step 2.5: Merge-verification gate` inside `skills/_shared/pr-first-merge.md` — the one canonical `pr-first` merge procedure (#411, which postdates this spec's Current State) that dispatch's Auto-merge gate, `/flow`'s reconciliation and `/wrap-up`'s short-circuit already delegate to, so every merge site applies it by construction. `pr-early-run-lifecycle.md` still owns the gh-absent degrade row. AC1's greps exclude `pr-first-merge.md` instead (pinned by `tests/merge-verification-gate-conformance.test.js`). | Update the spec — the spec was written before `pr-first-merge.md` existed; the intent ("state once in `_shared`; dispatch/flow/resume cite and apply") is met more directly. |
| 2 | "`merge-when-green` → attempt `gh pr merge --auto`; arming rejected (auto-merge unavailable per Task 0's captured signature) → degrade to `wait`" | Task 0 proved there is no rejection signature: on an unprotected repo `--auto` merges immediately (exit 0, empty output — the #540 mechanism). So `merge-when-green` arms only when the state read shows `mergeStateStatus: BLOCKED` (the forge holds it) and otherwise takes the bounded wait; the watch keys on `gh pr checks` exit codes (0/8/1, captured). | Update the spec — Task 0 was the spec's own blocking premise-check, and it corrected the premise. |
| 3 | Key Files: `pr-early-run-lifecycle.md`, `dispatch/SKILL.md`, `flow/worktree-merge.md`, `docs/skill-graph.md` | Also `dispatch/settle-and-merge.md` (where dispatch's Auto-merge gate body actually lives), and — from the whole-branch review's interaction findings — `_shared/github-pr-scan.md` (the `[pr-unarmed]` sweep now excludes `bot:blocked` records from arming, so it can't un-park a gate-parked run), `tidy/actions-github-issues.md` (its Arm-ready-PR action states why Step 2.5 is satisfied by construction), and the `bot:blocked` definition/consumer sites (`_shared/label-bootstrap.md`, `_shared/work-record.md`, `tidy/step-1-records.md`, `backlog/refine-mode.md`) because the red path gives that label a second meaning (parked, grants intact — not failed). | Beneficial — cross-file interactions the spec did not scope; each a one-clause consumer edit that closes a hole in the mechanism this record exists to close. |
| 4 | Task 0 (b): "capture `gh pr merge` rejected by required checks" | Not reproducible on this repo (no branch protection or rulesets) — recorded as not captured; classification rests on the state read (`mergeStateStatus: BLOCKED` with a green rollup). | Update the spec (note) — a repo-fact limit, stated honestly rather than guessed. |
