---
record: 852
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 852: dispatch resume flow: inconsistent Recommended defaults across two prompts for the same PR state, plus a redundant teardown confirm

Surface: backend

## Current State

`/claude-tweaks:dispatch`'s "Confirm before resuming" prompt (`dispatch/SKILL.md`'s Reporting section) always marks "Cancel" (leave parked) as Recommended, even when the confirmation's own sourced state shows the PR is CI-green, reviewed, and tests passing. When a user resumes anyway, `/claude-tweaks:wrap-up`'s Review Console then renders a second, separate merge confirmation that re-derives the same CI/review/test state and marks "Merge now" as Recommended — the opposite posture, one turn later, on identical evidence. Separately, `cleanup-procedures.md` Section C's worktree-removal step always requires a fresh confirmation (via `ExitWorktree`'s own commit-count guard) even when the session has already independently proven via `git merge-base --is-ancestor <worktree-tip> origin/<integration-branch>` that every commit on the worktree branch is safely contained in the just-merged integration branch.

## Deliverables

1. Derive the Recommended marker on dispatch's resume-confirmation prompt from the same verification-state read (CI status + review outcome + test outcome) that wrap-up's merge confirmation already uses, so the two prompts agree when they describe the same PR state.
2. Evaluate folding the resume-and-merge decision into a single stop when both prompts would fire within the same session, to avoid asking the same underlying question twice.
3. For the worktree-removal confirm in `cleanup-procedures.md` Section C, let a proven `git merge-base --is-ancestor` result authorize `discard_changes: true` without requiring a separate human confirmation.

## Acceptance Criteria

- The resume-confirmation prompt's Recommended option is derived from the same CI/review/test verification-state read the merge confirmation uses, and the two never disagree on the same PR state.
- Either: the resume-and-merge decision is folded into one stop when both would otherwise fire in the same session, or a documented rationale explains why they remain separate stops with now-consistent defaults.
- A worktree-removal step preceded by a successful `git merge-base --is-ancestor` check against the integration branch proceeds without an additional human confirmation for that removal.
- Existing dispatch/wrap-up prose-conformance tests still pass after the wording and logic changes.

## Technical Approach

Locate the exact `AskUserQuestion` construction in `dispatch/SKILL.md`'s Reporting section ("Confirm before resuming") and the parallel construction in `wrap-up/review-console.md`'s merge confirmation; identify the verification-state values each already computes (or should compute) and make the Recommended-option selection a function of that shared state rather than a static per-prompt default. For the worktree-removal confirm, thread the `git merge-base --is-ancestor` result forward to the point where `ExitWorktree` is invoked, and pass `discard_changes: true` directly when the check already passed, skipping the extra confirmation step in that case.

## Gotchas

- The two prompts live in different skills (`dispatch` and `wrap-up`) that don't share request-scoped state directly — deriving from "the same verification-state read" means computing it once and threading it through, or re-deriving it identically in both places; either approach must avoid the two computations silently drifting apart again.
- Skipping the worktree-removal confirmation entirely (rather than just fixing its default) removes a real safety check for the case where the ancestor check *hasn't* been run yet — the fix should apply only when the ancestor check has actually been performed and passed, never as a blanket skip.
- Changing Recommended defaults on human-facing confirmations is exactly the kind of change `_shared/auto-mode-contract.md`'s "what auto never silences" list cares about — verify this change doesn't inadvertently reduce a genuine stop to a rubber-stamp.

## Original request

dispatch resume flow: inconsistent Recommended defaults across two prompts for the same PR state, plus a redundant teardown confirm

**Related:** none

Context: Found by /feedback's session-evaluation judge (self-referential to this repo). dispatch/SKILL.md's Confirm-before-resuming prompt defaulted Recommended to Cancel (leave parked) even though its own sourced state showed the PR CI-green, reviewed, and tests passing; the very next prompt (wrap-up's merge confirmation, same PR state re-derived) defaulted Recommended to Merge now -- opposite posture, one turn later. Separately, cleanup-procedures.md Section C's worktree removal always requires a fresh confirm even when a git merge-base --is-ancestor check already proved every commit is safely on the merged integration branch.

Scope: Derive the Recommended marker on the resume-confirmation prompt from the same verification-state read (CI + review + test outcomes) the merge confirmation already uses, so both agree; consider folding resume+merge into one stop. Let a proven ancestor-check result authorize discard_changes: true on worktree removal without a separate confirm.
