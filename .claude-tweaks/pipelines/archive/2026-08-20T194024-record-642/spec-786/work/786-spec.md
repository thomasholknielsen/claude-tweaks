---
record: 786
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 786: flow: multi-spec runs share one worktree with non-spec-scoped artifact filenames — silent overwrite risk

Surface: backend

## Current State

`/claude-tweaks:flow`'s documented multi-ref form (`#{N1},#{N2},...,#{Nk}`) runs every spec's build/test/review/polish/wrap-up sequence in one shared worktree. Some of the generated task/review artifact filenames are not spec-scoped, so a later spec in the sequence can silently overwrite an earlier spec's artifact rather than erroring or namespacing it.

Use case: a human running `/claude-tweaks:flow #A,#B,#C,...` across several independent specs to save terminal/worktree overhead — exactly the shape the multi-ref form exists to provide, undermined by the silent-overwrite risk it currently carries.

## Deliverables

- Namespace every generated task/review artifact filename by spec id (issue number) inside a multi-spec `/flow` run's shared worktree.
- Add a completion-time check that asserts one artifact set per spec was actually produced, catching a silent overwrite immediately rather than leaving it to be discovered later.

## Acceptance Criteria

- [ ] Every generated task/review artifact filename produced during a multi-spec `/flow #A,#B,...` run includes its spec id, so two specs in the same run cannot collide on the same filename.
- [ ] A completion-time check fails loudly if fewer artifact sets exist than specs run, rather than silently proceeding with an overwritten artifact.
- [ ] `npm test` passes; existing single-spec `/flow` runs are unaffected (filenames for a single-spec run are unchanged, or gain the same id-scoping harmlessly).

## Technical Approach

Audit every task/review artifact filename `/flow`'s build/test/review/polish/wrap-up phases generate inside a shared multi-spec worktree, and add the spec id (issue number) into each filename that isn't already scoped by it. Add a completion-time assertion (likely alongside the multi-spec pipeline's own per-spec bookkeeping) that counts produced artifact sets against the number of specs in the run and fails the run if they don't match.

### Key Files

- `plugin/skills/flow/multi-spec.md` — the multi-spec pipeline's shared-worktree artifact generation
- `plugin/skills/flow/SKILL.md` — multi-ref form documentation, if the completion-time check surfaces here
- test coverage under `tests/` pinning the per-spec namespacing and the completion-time check

## Gotchas

- This is a silent-failure risk, not a crash — the fix must make the failure loud (an assertion or error) rather than merely reducing the odds of collision, since a namespacing fix alone doesn't catch a case the audit missed.
- Scope carefully: single-spec `/flow` runs (no shared worktree) must not regress or gain unnecessary filename churn from this change.

## Original request

flow: multi-spec runs share one worktree with non-spec-scoped artifact filenames — silent overwrite risk

**Summary:** `/claude-tweaks:flow`'s documented multi-ref form (`#{N1},#{N2},...,#{Nk}`) runs every spec's build/test/review/polish/wrap-up sequence in one shared worktree. Some of the generated task/review artifact filenames are not spec-scoped, so a later spec in the sequence can silently overwrite an earlier spec's artifact rather than erroring or namespacing it.

**Kind:** Defect

**Affected component:** `/claude-tweaks:flow` multi-spec pipeline (multi-ref run, per `skills/specify/SKILL.md`'s Next Actions row: "sequential pipeline, all sub-issues")

**Objective:** Developer joy

**Use case:** A human running `/claude-tweaks:flow #A,#B,#C,...` across several independent specs to save terminal/worktree overhead — exactly the shape this session's user asked for and was warned away from ("multi-spec /flow runs share a single worktree, and some of its generated review/task artifact filenames aren't spec-scoped — a later spec in the sequence can silently overwrite an earlier spec's review output rather than erroring") in favor of splitting into smaller batches, undermining the very efficiency the multi-ref form exists to provide.

**Proposed fix:** Namespace every generated task/review artifact filename by spec id (issue number) inside a multi-spec `/flow` run's shared worktree, and add a completion-time check that asserts one artifact set per spec was actually produced, catching a silent overwrite immediately rather than leaving it to be discovered later.

**Definition:** Clear

**Plugin version:** 6.88.0

---
Filed via /claude-tweaks:feedback (session evaluation).

