---
record: 689
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 689: flow: gh pr merge fails on a still-draft PR; worktree-name derivation can produce invalid characters

Surface: backend

## Current State

- Under `pr-first`, `_shared/pr-early-run-lifecycle.md` opens a draft PR at run start. The canonical merge procedure `_shared/pr-first-merge.md` **does** undraft at its Step 2 (`gh pr ready {pr-number}`) — so the observed "Pull Request is still a draft" failure came from a merge site that never entered that procedure: `flow/multispec-review-console.md`'s Shared teardown (Cleanup row 16 / step 2) finishes the shared branch via `/superpowers:finishing-a-development-branch`, which runs `gh pr merge` on the draft directly. `flow/worktree-merge.md` already routes its pr-first case through `pr-first-merge.md`; the bundle console does not. (The file named in the original request, `_shared/pr-early-lifecycle.md`, doesn't exist — the files are `pr-early-run-lifecycle.md` and `pr-first-merge.md`.)
- `pr-first-merge.md` Step 2 runs `gh pr ready` unconditionally — no `isDraft` read first, so re-entry on an already-ready PR depends on `gh`'s own idempotency.
- Worktree naming: no procedure defines how `/flow` / `/build` derive the worktree name passed to `EnterWorktree` (`build/worktree-setup.md`, `_shared/worktree-setup.md`, `flow/multi-spec.md` are silent). A multi-spec run derived `flow+spec-654-655`; `EnterWorktree` rejects names outside letters/digits/`.`/`_`/`-` per `/`-segment (≤64 chars), and `+`-named worktrees exist today from the git fallback path.
- **Related:** #688 (same teardown routing — third stop), #693 (same teardown — worktree-removal order), #683 (pr-first merge leaves the remote branch behind).

## Deliverables

1. `flow/multispec-review-console.md` Shared teardown: under `pr-first`, "Finish the shared branch" invokes `_shared/pr-first-merge.md` (which undrafts, applies the merge-verification gate, merges/arms) with the bundle's issue list; `/superpowers:finishing-a-development-branch` remains the `local-merge` path only. (Shared with #688 item 3 — implement once.)
2. `_shared/pr-first-merge.md` Step 2: read `isDraft` (`gh pr view {n} --json isDraft`) and run `gh pr ready` only when true; log the AUTO line either way.
3. A worktree-name derivation rule in `build/worktree-setup.md` (cited by `flow/SKILL.md`'s worktree step and `flow/multi-spec.md`): `{skill}-spec-{N1}-{N2}…` (or the record slug), sanitized to `[A-Za-z0-9._-]` — every other character mapped to `-`, runs collapsed, ≤64 chars — before `EnterWorktree` / `git worktree add`.
4. A unit-testable helper for the sanitization (e.g. `bin/lib/worktree/name.js`, or beside `bin/lib/hooks/worktree-detect.js`) with a test; the prose cites it.

## Acceptance Criteria

- `grep -n "pr-first-merge.md" skills/flow/multispec-review-console.md` hits in the Shared teardown; `finishing-a-development-branch` there is scoped to `local-merge`.
- `pr-first-merge.md` Step 2 contains an `isDraft` guard.
- `sanitizeWorktreeName("flow+spec-654-655")` → `flow-spec-654-655`; the test covers `+`, space, `/`, `#`, and the length cap.
- `grep -rn "sanitiz" skills/build/worktree-setup.md skills/flow/multi-spec.md` shows the rule and the helper cited.
- `npm test` green.

## Technical Approach

Prose edits + one small helper module + test. Probe `gh pr ready` on an already-ready PR (throwaway PR) before writing the guard's wording — empirical premise-check before contract text.

## Gotchas

- `EnterWorktree` name rule: letters, digits, dots, underscores, dashes per `/`-segment, ≤64 chars total — mirror it exactly.
- Don't add a second undraft step in the console; route to `pr-first-merge.md` and let its Step 2 own it.

## Original request

flow: gh pr merge fails on a still-draft PR; worktree-name derivation can produce invalid characters

**Related:** none

Context: The pr-first lifecycle opens a draft PR at run start but its merge step never marks it ready first -- `gh pr merge` failed with "Pull Request is still a draft" and needed an unplanned `gh pr ready` call. Separately, `EnterWorktree` was called with a `+`-containing name derived from a multi-spec issue list and was rejected as invalid.

Scope: Add an explicit `gh pr ready {N}` pre-merge step (guarded by an isDraft check) to `_shared/pr-early-lifecycle.md`'s merge procedure; sanitize the derived worktree name to `[A-Za-z0-9._-]` before calling `EnterWorktree` in flow's worktree-setup step.

## Build note

Deliverable 1 was already implemented while building sibling issue #688 (explicitly shared scope, "implement once" per both issues). This build's actual remaining scope was Deliverables 2-4.
