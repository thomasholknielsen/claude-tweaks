---
record: 797
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 797: wrap-up: review-console.md and cleanup-procedures.md fragments dominate a standalone run's context

Surface: backend

## Current State

A single standalone `/claude-tweaks:wrap-up` run loaded roughly 190K characters (~47K tokens) of wrap-up-related skill text, with `skills/wrap-up/review-console.md` and `skills/wrap-up/cleanup-procedures.md` alone contributing about 74K characters — most of it describing branches (multi-spec defer, dispatch-claim, pr-first auto-merge, worktree teardown) that don't apply to a simple, non-pipeline, current-branch run.

## Deliverables

- A lighter-weight fragment for the common case — wrapping up a small, standalone, conversation-based change (no record, no worktree, no multi-spec run) — that goes straight to "render the console, apply on approval, archive the run dir" without requiring a read of the full `review-console.md`/`cleanup-procedures.md` text.
- A routing rule at the top of `wrap-up/SKILL.md` (or wherever the standalone case is first detected) that loads the light fragment instead of the two full files when none of the branch-triggering conditions (record, worktree, multi-spec, dispatch-claim, pr-first) apply.

## Acceptance Criteria

- A standalone wrap-up run (no record, no worktree, no multi-spec run) loads meaningfully less than the current ~74K characters of `review-console.md` + `cleanup-procedures.md` combined.
- The light fragment still correctly renders the console, applies on approval, and archives the run dir for the common case.
- A run that *does* need one of the branches (multi-spec, dispatch-claim, pr-first, worktree teardown) still reaches the full file's coverage of that branch — the light fragment is an addition, not a replacement that drops coverage.

## Technical Approach

Extract the "render console → apply on approval → archive run dir" happy path already present inside `review-console.md`/`cleanup-procedures.md` into its own lazy-loaded fragment, and add a routing check (record present? worktree present? multi-spec manifest present?) that picks the light fragment when none apply, falling through to the existing full files otherwise.

## Gotchas

- The full files stay as the source of truth for every branch — the light fragment only needs to cover the no-branch happy path; don't let the two drift by duplicating logic that should live in one place.

## Original request

wrap-up: review-console.md and cleanup-procedures.md fragments dominate a standalone run's context

**Summary:** A single standalone wrap-up run loaded roughly 190K characters (~47K tokens) of wrap-up-related skill text, with `review-console.md` and `cleanup-procedures.md` alone contributing about 74K characters — most of it describing branches (multi-spec defer, dispatch-claim, pr-first auto-merge, worktree teardown) that don't apply to a simple, non-pipeline, current-branch run.

**Kind:** Gap

**Affected component:** skills/wrap-up/review-console.md, skills/wrap-up/cleanup-procedures.md

**Use case:** Wrapping up a small, standalone, conversation-based change (no record, no worktree, no multi-spec run) still requires reading the full text of both files to correctly determine which branches don't apply — there's no lighter-weight fragment for the common case that goes straight to "render the console, apply on approval, archive the run dir."

**Definition:** Clear

**Plugin version:** 6.89.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-3f482d8e -->

