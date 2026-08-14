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

## Overview

Spec #414 (sweep backstop) shipped a `housekeeping-auto-merge` policy key and a
`<!-- tidy-housekeeping-pr -->` PR-body marker convention on the premise — inherited from #71's
original report — that `/claude-tweaks:tidy` Step 7 opens a PR for its housekeeping commits. The
shipped `tidy/SKILL.md` shows this is no longer true: Step 7 either commits directly on the
current branch (no `worktree.always`) or, under `worktree.always: true`, provisions a scratch
worktree and merges back directly into the main checkout via `_shared/scratch-worktree.md` — never
opening a PR under either configuration. The path predates and was never updated for
`integration-model: pr-first` (#405–#415). Net effect: the #414 machinery (policy key,
`github-pr-scan.md` repo-wide item 9 detection, `Arm ready PR` action, `step-6-auto.md` tier row)
is implemented and correct but has no producer — tidy never creates a PR the marker could be
stamped on.

**Complexity:** Medium
**Estimated tasks:** 3

## Non-Goals

- No new merge mechanics in `_shared/scratch-worktree.md` itself — that file has 3+ callers and
  #414's own Non-Goals deliberately kept merge mechanics stable. Prefer caller-side conditioning
  inside `tidy/SKILL.md` Step 7.5.
- No rewrite of tidy's default (`local-merge` / non-worktree) commit path — this is a
  `pr-first`-scoped addition only.
- No second PR-creation implementation — reuse `_shared/pr-early-run-lifecycle.md`'s create/reopen
  logic (its Step 1 existing-PR check and Step 3 compose-and-create), not a parallel one.

## Current State

- `skills/tidy/SKILL.md` Step 7.5's `worktree.always: true` handling: provisions a scratch
  worktree, applies the Step 7 commit inside it, then follows `_shared/scratch-worktree.md`'s full
  procedure end to end — including §5 (merge back into the main checkout's integration branch) and
  §6 (teardown) — with no branch on `integration-model` at all.
- The same file's housekeeping-marker paragraph (just below) already documents the marker/grant
  contract fully but explicitly states: "As of this writing, Step 7 above does not itself open a
  PR" — both paths (worktree.always merge-back, and the no-worktree direct commit) never produce
  one.
- `skills/_shared/github-pr-scan.md` repo-wide item 9 already detects a PR carrying
  `<!-- tidy-housekeeping-pr -->` in its body and lets `housekeeping-auto-merge` arm `--auto` on it
  — this machinery has no live producer to exercise it against.
- `skills/_shared/integration-model.md`'s consumer table already lists tidy's housekeeping-marker
  note as a `pr-first`-only concern, but the note itself still describes the pre-fix (no-PR) state.
- `skills/_shared/scratch-worktree.md`'s other two callers: `skills/flow/worktree-merge.md`
  explicitly routes its own `pr-first` merges through `_shared/pr-first-merge.md` instead
  (scratch-worktree is stated to be `local-merge`-only there — no gap). `skills/wrap-up/residue-sweep.md`
  uses scratch-worktree unconditionally for `remedy: auto` findings, with no `integration-model`
  branch at all.

## Deliverables

- [ ] `skills/tidy/SKILL.md` Step 7.5: under `worktree.always: true` **and** `integration-model:
  pr-first`, after applying the Step 7 commit inside the scratch worktree (scratch-worktree.md
  §1-4 unchanged), push the branch and open (or reuse/reopen, on a resumed run) a PR instead of
  merging back — reusing `_shared/pr-early-run-lifecycle.md`'s Step 1 (existing-PR check by head
  branch) and Step 3 (compose body, `gh pr create --draft`) shape, stamping the PR body with
  `<!-- tidy-housekeeping-pr -->` at creation. Tear the scratch worktree down via `ExitWorktree`
  once the branch is safely on origin (its commit no longer needs merging back locally — the PR
  carries it). Under `local-merge` (or `worktree.always` off, or no worktree at all), Step 7.5's
  existing behavior is unchanged.
- [ ] Update the housekeeping-marker paragraph in the same file to describe the new pr-first
  behavior instead of the stale "Step 7 above does not itself open a PR" statement.
- [ ] Update `skills/_shared/integration-model.md`'s tidy consumer-table row to describe the actual
  routed behavior (PR-open vs. direct-commit) rather than only "the note applies under pr-first."
- [ ] Cross-check `_shared/scratch-worktree.md`'s other two callers and record one outcome each
  (fixed here / filed separately / shown unaffected) in `scratch-worktree.md` itself, near its
  Callers list.
- [ ] Live demonstration: produce a real pushed branch and an open PR whose body carries
  `<!-- tidy-housekeeping-pr -->` against this project's own repo, and confirm `github-pr-scan.md`
  item 9's detection logic (the `HOUSEKEEPING_MARKER` regex + `[pr-unarmed]` classification) finds
  it. Evidence lands in the run's test-step output.

## Acceptance Criteria

- Under `pr-first` + `worktree.always`, a tidy Step 7 housekeeping run demonstrably produces a
  pushed branch and an open PR whose body carries `<!-- tidy-housekeeping-pr -->` (live run or eval
  transcript shown, PR linked).
- `github-pr-scan.md`'s repo-wide item 9 detects that PR and the `Arm ready PR` action can target
  it — the previously dead #414 machinery now has a live producer (demonstrated, not asserted).
- `local-merge` and non-worktree paths are untouched: the diff is scoped to the `pr-first` branch
  of Step 7.5 (diff stat shown).
- The three-caller cross-check result is recorded with one stated outcome per caller.

## Technical Approach

### Key Files

- `skills/tidy/SKILL.md` — Step 7.5's `worktree.always` handling and the housekeeping-marker
  paragraph immediately below it.
- `skills/_shared/scratch-worktree.md` — cross-check note only (no mechanics change).
- `skills/_shared/integration-model.md` — consumer-table row update.
- `skills/_shared/pr-early-run-lifecycle.md` — consumed (Step 1 + Step 3 shape reused), not
  modified.
- `skills/_shared/github-pr-scan.md` — consumed for the item-9 detection demonstration, not
  modified (already correct per #414).

## Gotchas

- This record *is* the work #414 explicitly deferred ("No new merge mechanics") — keep
  `_shared/scratch-worktree.md` changes minimal or zero; caller-side conditioning in
  `tidy/SKILL.md` is the preferred shape.
- Reuse of `pr-early-run-lifecycle.md` is a deliverable, not a suggestion — a second
  PR-creation implementation is the failure mode to avoid. That file's phase-checklist update
  section is build/test/review/polish/wrap-up-specific and does not apply to tidy (a single-shot
  procedure, no phases) — reuse only its Step 1 (existing-PR check) and Step 3 (compose+create)
  shapes, not the phase-checklist mechanism.
- The prior attempt at this record shipped skill-prose edits plus a regex-based text-conformance
  test with no PR ever opened and no live/eval evidence — that was assessed as a correctness
  failure against the two empirically-worded Acceptance Criteria above. This build must produce
  the actual evidence, not another prose-only diff.
