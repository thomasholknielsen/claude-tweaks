---
record: 424
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 424: tidy needs a pr-first-aware commit-landing path before housekeeping-auto-merge can ever fire

Surface: backend

## Current State

Spec #414 (sweep backstop) shipped a `housekeeping-auto-merge` policy key and a `<!-- tidy-housekeeping-pr -->` PR-body marker convention on the premise — inherited from #71's original report — that `/claude-tweaks:tidy` Step 7 opens a PR for its housekeeping commits. The shipped `tidy/SKILL.md` shows this is no longer true: Step 7 either commits directly on the current branch (no `worktree.always`) or, under `worktree.always: true`, provisions a scratch worktree and merges back directly into the main checkout via `_shared/scratch-worktree.md` — never opening a PR under either configuration. The path predates and was never updated for `integration-model: pr-first` (#405–#415). Net effect: the #414 machinery (policy key, `github-pr-scan.md` repo-wide item 9 detection, `Arm ready PR` action, `step-6-auto.md` tier row) is implemented and correct but has no producer — tidy never creates a PR the marker could be stamped on.

## Deliverables

- Under `integration-model: pr-first`, `tidy/SKILL.md` Step 7 pushes its branch and opens (or updates, on a resumed run) a PR instead of merging back directly via `_shared/scratch-worktree.md` — reusing `_shared/pr-early-run-lifecycle.md`'s create/reopen logic rather than a second implementation, and stamping the PR body with `<!-- tidy-housekeeping-pr -->` at creation (#414's own marker convention).
- Under `local-merge`, or when `worktree.always` is off, behavior is unchanged — this is a `pr-first`-scoped addition, not a rewrite of tidy's default commit path.
- Cross-check whether `_shared/scratch-worktree.md`'s other callers (`wrap-up/residue-sweep.md`, `flow/worktree-merge.md`) have an equivalent gap, or already route around it — do not assume tidy is the only affected caller without checking. Record the answer per caller: fixed here, filed separately, or shown unaffected.

## Acceptance Criteria

- Under `pr-first` + `worktree.always`, a tidy Step 7 housekeeping run demonstrably produces a pushed branch and an open PR whose body carries `<!-- tidy-housekeeping-pr -->` (live run or eval transcript shown, PR linked).
- `github-pr-scan.md`'s repo-wide item 9 detects that PR and the `Arm ready PR` action can target it — the previously dead #414 machinery now has a live producer (demonstrated, not asserted).
- `local-merge` and non-worktree paths are untouched: the diff is scoped to the `pr-first` branch of Step 7 (diff stat shown).
- The three-caller cross-check result is recorded with one stated outcome per caller.

## Technical Approach

Branch from the existing scratch-worktree flow: where `_shared/scratch-worktree.md` would merge back, the `pr-first` branch instead pushes and routes through `_shared/pr-early-run-lifecycle.md`'s create/reopen. Prefer conditioning inside tidy's Step 7 over changing `_shared/scratch-worktree.md` itself — that file has 3+ callers, and #414's Non-Goals deliberately kept merge mechanics stable.

## Gotchas

- This record *is* the work #414 explicitly deferred ("No new merge mechanics") — keep `_shared/scratch-worktree.md` changes minimal or zero; caller-side conditioning is the preferred shape.
- Reuse of `pr-early-run-lifecycle.md` is a deliverable, not a suggestion — a second PR-creation implementation is the failure mode to avoid.

## Original request

tidy needs a pr-first-aware commit-landing path before housekeeping-auto-merge can ever fire

## Overview

Spec #414 (sweep backstop) added a `housekeeping-auto-merge` policy key and a
`<!-- tidy-housekeeping-pr -->` PR-body marker convention, on the premise (stated in #414's own
Current State, inherited from #71's original 2026-era report) that `/claude-tweaks:tidy`'s Step 7
opens a real PR for its housekeeping commits. Auditing the currently-shipped `tidy/SKILL.md`
during #414's implementation found this is no longer true: Step 7 either commits directly on the
current branch (no `worktree.always`), or — under `worktree.always: true` — provisions a scratch
worktree, applies the commit, and **merges back directly into the main checkout**
(`_shared/scratch-worktree.md`), never opening a PR at all, under either configuration. This
predates (and is independent of) the `integration-model: pr-first` work #405-#415 shipped — the
scratch-worktree merge-back path was never updated to be pr-first-aware.

Net effect: `housekeeping-auto-merge` and the `tidy-housekeeping-pr` marker are fully implemented
and correct (policy key, `github-pr-scan.md`'s `repo-wide` item 9 detection, the `Arm ready PR`
action in `tidy/actions-github-issues.md`, the `step-6-auto.md` tier row) but currently have
nothing to ever match against — tidy never produces a PR for the marker to be stamped on.

## Deliverables

- Under `integration-model: pr-first`, `tidy/SKILL.md` Step 7 pushes its branch and opens (or
  updates, on a resumed run) a PR instead of merging back directly via
  `_shared/scratch-worktree.md` — reusing `_shared/pr-early-run-lifecycle.md`'s create/reopen
  logic rather than a second implementation, and stamping the PR body with
  `<!-- tidy-housekeeping-pr -->` at creation (#414's own marker convention).
- Under `local-merge`, or when `worktree.always` is off, behavior is unchanged — this is a
  `pr-first`-scoped addition, not a rewrite of tidy's default commit path.
- Cross-check whether `_shared/scratch-worktree.md`'s other callers (`wrap-up/residue-sweep.md`,
  `flow/worktree-merge.md`) have an equivalent gap, or already route around it — do not assume
  tidy is the only affected caller without checking.

## Origin

Discovered during spec #414's implementation (pr-first-integration-model multi-spec run,
2026-08-14) — flagged rather than fixed in-place, since it requires touching
`_shared/scratch-worktree.md`'s shared merge-back mechanics (used by 3+ callers), which #414's own
Non-Goals ("No new merge mechanics") explicitly put out of scope for that spec.
