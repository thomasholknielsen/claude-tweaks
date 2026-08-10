---
record: 297
origin: human
risk: medium
ceremony: standard
grants: []
fingerprint: dispatch-autonomy-model:push-pending-review-branch
blocked-by: [296]
surface: backend
---
# 297: Dispatch: push pending-review branches and open a draft PR for durability

Surface: backend

## Overview

A `pending-review` outcome today writes the `demo:pending` label and posts a Verification Brief
comment on the record (`/wrap-up`'s Review Console) but never pushes the branch itself — it
exists only inside the sandbox/worktree that built it. Observed live 2026-08-09: bundle
#264,#223,#221,#220,#179 built cleanly, landed `pending-review`, and its branch was confirmed
absent from origin (`git ls-remote` returned nothing) — recoverable only by resuming the exact
cloud session that built it before its container recycled.

This leaf pushes the branch to origin and opens a draft PR (Verification Brief as the PR body)
whenever a dispatch-originated run resolves to `pending-review`, replacing "resume this exact
ephemeral session" with an ordinary, durable GitHub review surface. It reuses
`skills/dispatch/settle-and-merge.md`'s existing worktree-safe push mechanics (push from inside
the worktree, never the main checkout, per `worktree.always`) — specifically the `git push` call
itself and its worktree/branch resolution, not the merge-adjacent state transitions
(`close-run`/worktree-assignment clearing) that mechanism also performs for the merge case. This
leaf's push never calls `close-run` and never clears the run's worktree assignment — the run stays
`active` with its worktree still assigned, exactly as an ordinary un-pushed `pending-review`
outcome does today; only the branch additionally exists on origin now, plus an open PR.

**Complexity:** Low
**Estimated tasks:** 7

## Non-Goals

- Pushing or opening a PR for `failed`/`blocked` outcomes — those already have a durability
  answer (`bot:blocked` + the retry ceiling); pushing an incomplete or broken branch would be
  noise, not signal.
- Doing this for interactive, human-run `/flow` sessions — the human already has the branch in
  their own terminal; nothing to protect. `CLAIM_RUN_ID` is exported by exactly one site in this
  codebase — dispatch's Step 5, per its own dispatch template — and never by a human-run `/flow`
  invocation, so its presence is a reliable interactive-vs-headless signal without needing a
  second corroborating check.
- Giving the opened PR any auto-merge path — it stays a normal, human-reviewed PR. #71 (tidy's
  own, unrelated "no auto-merge path for its own PRs" gap) is not addressed or touched here —
  different skill, different PR provenance, and these PRs are deliberately meant to stay
  human-merged.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #296 | Dispatch: split each group's build/test and review/polish/wrap-up into independent Task calls | Blocked by |

## Current State

- `skills/dispatch/settle-and-merge.md`'s Auto-merge gate already has worktree-safe push
  mechanics for the merge case — this leaf reuses the push call and worktree/branch resolution
  only, not the merge-adjacent run-state transitions (see Overview).
- The PR's base ref reuses `_shared/integration-branch.md`'s existing resolution ladder — the
  same one `settle-and-merge.md`'s merge case already uses (`policy.yml` → `git remote HEAD`) —
  rather than introducing a second, competing definition of "target branch."
- `CLAIM_RUN_ID` (already threaded through every dispatch-originated `/flow` invocation per
  `skills/dispatch/SKILL.md` Step 5, confirmed as pre-existing plumbing in #296's own Current
  State) is the existing, reliable signal for "this run has nobody live in a terminal" — #296
  already relies on this same signal for its own gating, so it is established in this family by
  the time this leaf builds.
- Once #296 lands, `pending-review` resolves inside the second Task call's own `/wrap-up` Review
  Console pass — this leaf's push+PR step attaches there. The exact attachment point is described
  by intent here; confirm it against #296's actual shipped code at this leaf's own build start,
  since #296 is itself still unbuilt at spec time (an expected consequence of the Blocked-by
  ordering, not a defect in this spec).

## Deliverables

- [x] A push-branch step added at the point `pending-review` resolves. (Revised during build: not
  `verification-brief.md` as originally scoped — its acceptance-labeling call sites are all
  downstream of the Review Console's blocking human prompt, which a headless run never returns
  from, so nothing attached there runs on this leaf's target path. The shared procedure
  (`skills/_shared/pending-review-durability.md`) instead runs directly inside both console files
  — `skills/wrap-up/review-console.md` and `skills/flow/multispec-review-console.md` — immediately
  before each renders, gated on `CLAIM_RUN_ID`, worktree strategy, and the resolved step list
  containing `review` (a checkable proxy for "heading toward `pending-review`, not a HARD-GATE
  failure" — see Build Notes). See Build Notes for the full review trail.)
- [x] A draft PR opened against the resolved integration branch (per `_shared/integration-branch.md`)
  immediately after the push, with the run's Verification Brief as the PR body and a title of
  `{record title} (#{n})`
- [x] Before creating the PR, check for an existing open PR on the branch; if one already exists
  (e.g. a retried run reaching `pending-review` again), skip creation and leave a note rather than
  erroring
- [x] The push+PR step reuses `settle-and-merge.md`'s existing push call and branch resolution
  only — it does not call `close-run` and does not clear the run's worktree assignment
- [x] Scope guard implemented and tested: only `pending-review` outcomes, only when
  `CLAIM_RUN_ID` is set — never `failed`/`blocked`, never an interactive human run
- [x] Push and PR-open failures handled distinctly: if the push itself fails, fall back to today's
  behavior (branch stays local, label + comment still post) and note the push failure in the
  Verification Brief comment so it isn't silently indistinguishable from success. If the push
  succeeds but PR creation fails, retry once; if it still fails, leave the branch pushed (the
  durability goal is already met) and note the PR-open failure in the same comment so a human
  knows to open it manually. (Revised during build, single-record path only — see Build Notes for
  the bundle path, where the brief is provably posted before the durability push runs and cannot
  carry this note; a separate `gh issue comment` per record substitutes there.)

## Acceptance Criteria

1. A dispatch-originated run that resolves to `pending-review` results in a branch reachable via
   `git ls-remote` on origin.
2. That same run results in a real, open draft PR (verifiable via `gh pr view` or equivalent),
   titled `{record title} (#{n})`, with the Verification Brief as its body, opened against the
   resolved integration branch.
3. An interactive, human-run `/flow` invocation that resolves to `pending-review` triggers
   neither the push nor the PR.
4. A `failed` or `blocked` outcome triggers neither the push nor the PR.
5. A retried run that reaches `pending-review` a second time for the same branch does not error
   or create a duplicate PR — it detects the existing open PR and skips creation.
6. A simulated push failure results in the branch staying local, the label/comment still posting,
   and the comment explicitly noting the push failed. (Single-record path; bundle path posts a
   separate comment per record instead — see Build Notes.)
7. A simulated PR-creation failure (push succeeded) results in the branch on origin, the label/
   comment posting, and the comment explicitly noting the PR-open failure. (Same bundle-path
   caveat as AC 6.)
8. `npm test` green. — Met: 2977/2977.

## Technical Approach

### Key Files

- `skills/_shared/pending-review-durability.md` (new) — the canonical push+draft-PR procedure,
  invoked directly by both console files below rather than by `verification-brief.md` (see
  Build Notes)
- `skills/wrap-up/review-console.md`, `skills/flow/multispec-review-console.md` — the two
  invocation sites, one per single-record/bundle path
- `skills/wrap-up/verification-brief.md` — consumes the procedure's outcome record to render
  it as a `### Branch` section on the single-record path
- `skills/dispatch/settle-and-merge.md` — reused for its push call and branch resolution, not its
  merge-adjacent run-state transitions
- `skills/_shared/integration-branch.md` — PR base-ref resolution

## Gotchas

- This deliberately creates a new, visible object in the repo (a draft PR) where none existed
  before — an accepted trade-off from this family's own Decision Rationale (parent #293), not a
  silent side effect to second-guess at build time.
- Reviewer assignment on the draft PR is left to build-time judgment: leave unassigned by default
  unless a clear existing convention for who reviews dispatch-originated PRs is found elsewhere
  in this repo.
- Do not extend this leaf's scope to also solve #71 (tidy's own PRs having no merge path) —
  different skill, different PR provenance, and this leaf's PRs are deliberately meant to stay
  human-merged, not auto-mergeable.
- This leaf's attachment point and its dependency on `CLAIM_RUN_ID`'s exact semantics are both
  inherited from #296, which is unbuilt at spec time — re-verify both against #296's actual
  shipped implementation at this leaf's build start, the same treatment already given to #222/
  #268's file-overlap risk elsewhere in this family.

## Build Notes

Gotchas re-verification against #296's actual shipped code (2026-08-10, #296 now merged into
this branch at commits through `2ac57706`):

- **Attachment point confirmed.** `pending-review` resolves inside `/wrap-up`'s Review Console
  path, and the canonical `demo:pending`-plus-Verification-Brief procedure lives in
  `skills/wrap-up/verification-brief.md` (not inside dispatch's `task-prompt.md` or
  `two-call-gate.md` directly — those files dispatch the second Task call, which internally
  invokes `/flow #{n} review,polish,wrap-up`, and `/wrap-up` is what actually reaches
  `verification-brief.md`). This matches the spec's Current State claim exactly; no shift from
  #296's shipped shape.
- **`CLAIM_RUN_ID` semantics confirmed unchanged.** Both of #296's two Task-call templates in
  `skills/dispatch/task-prompt.md` export `CLAIM_RUN_ID="{RUN_ID}"` inline (first call line ~14,
  second call line ~64) — still the only site in the codebase that sets it, still absent from
  every interactive human-run `/flow` invocation. The spec's reliance on it as a headless-vs-
  interactive signal holds.
- **New consideration from #296's own final-review findings, not a spec defect:** #296 added a
  failure-path teardown call (`/flow {target} wrap-up` alone, on a first-call `build,test`
  failure) that also reaches `/wrap-up` — but that path resolves to `failed`/`blocked`, not
  `pending-review`, so it is already excluded by this leaf's own Non-Goals/Deliverables scope
  guard (`only pending-review outcomes`). No overlap.

Disjointness: this leaf's Key Files (`verification-brief.md`, `settle-and-merge.md`'s push
mechanics, `_shared/integration-branch.md`) do not overlap #296's shipped edits to
`skills/dispatch/SKILL.md`, `task-prompt.md`, `two-call-gate.md`, or `sequential-execution.md`.

Architecture alignment (2026-08-10, post final-review + fix-round + re-review): the final
whole-branch review found the spec's stated attachment point (`verification-brief.md`) would have
executed on zero of the runs this leaf exists to protect — acceptance labeling is gated behind the
Review Console's own blocking `AskUserQuestion`, which a headless run never returns from. Fixed by
invoking the shared procedure directly from both console files, before each renders. Two reviewers
independently confirmed this ordering and that it correctly covers both the single-record and
dispatched-bundle paths, which the literal spec text alone would have missed (a bundle's per-spec
`verification-brief.md` calls are provably unreachable on this path — attaching only there, even
correctly relocated, would have left the motivating incident's own shape, a five-record bundle,
still unprotected).

A second review round found the scope guard's `failed`/`blocked` exclusion rested on a premise
#296 had already falsified in this same branch (its failure-path teardown call reaches a console
with `CLAIM_RUN_ID` set) — fixed with a genuinely checkable discriminator (resolved step list
contains `review`) rather than a reassuring sentence. The same round found the bundle path's
writer/reader location AND ordering both broken for AC 6/7's promise; fixed by keeping the record
at the bundle's parent root and adding a dedicated per-record `gh issue comment` on failure only,
since the per-spec Verification Brief is provably already posted by the time the bundle's
durability push runs.

Residual risks, tracked rather than fixed here (narrow, non-blocking, each with a one-sentence note
in `pending-review-durability.md` itself): the bundle failure comment has no MCP-transport fallback
for a `gh`-absent environment, and is not deduped against a retry. A PR can go stale if a human
resumes and approves after the durability push already ran (documented as an accepted residual,
not a defect).

A pre-existing, unrelated bug was surfaced during review and filed separately rather than fixed
here (different code path, no test coverage, real scope-creep risk): `skills/wrap-up/review-console.md`'s
auto-merge short-circuit resolves the worktree AND branch via `git -C "$RUN_DIR"`, which — since
run dirs anchor to the main checkout — makes its merge a silent self-merge no-op and its push
denied under `worktree.always`. Tracked as
https://github.com/thomasholknielsen/claude-tweaks/issues/299.

<!-- work-fingerprint: dispatch-autonomy-model:push-pending-review-branch -->
