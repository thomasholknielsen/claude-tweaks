---
record: 810
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 810: tidy: a harness-managed worktree/branch deliberately left in place by a finish flow is never surfaced as residue

Surface: backend

## Current State

When a project's lifecycle finish flow deliberately leaves a harness-managed worktree and its branch in place (a legitimate, rule-based decision, not a failure), no claude-tweaks health sweep or `/claude-tweaks:tidy` pass records or surfaces it — it sits on disk indefinitely with nothing pointing back to it. Measured: one worktree + one branch left in place a full day after the finish flow ran, still present with no open record naming them, plus 2 additional stale worktree directories found alongside them in the same manual `git worktree list`/`git branch` scan. Possible duplicate #644 is related but distinct — #644 covers reconcile's own removal-failure escalation, not a worktree the finish flow never attempted to remove in the first place.

## Deliverables

- [ ] Identify every finish-flow path that can legitimately leave a harness-managed worktree/branch in place (not a failure — a deliberate rule-based decision) and confirm none of them currently record that decision anywhere queryable.
- [ ] Add a `/claude-tweaks:tidy` scan that surfaces a left-in-place worktree/branch — listing it even when leaving it was the correct call, so it stays visible until a human or a later sweep disposes of it.
- [ ] Disambiguate this scan's scope from #644's reconcile removal-failure escalation explicitly in the new scan's own doc/prose, so the two don't get conflated or duplicated.

## Acceptance Criteria

1. `/claude-tweaks:tidy` lists a worktree/branch a finish flow intentionally left in place, distinct from #644's removal-failure case.
2. The new scan is tested against a fixture reproducing "finish flow completes, worktree/branch deliberately kept" and confirms the resulting row appears in tidy's output.
3. `npm test` passes with the new coverage.

## Technical Approach

This needs a marker written at the moment a finish flow decides to leave a worktree/branch in place (so a later `/tidy` sweep has something queryable to find), rather than trying to infer "intentionally kept vs. forgotten" purely from `git worktree list`/`git branch` output after the fact — those two states are otherwise indistinguishable on disk. The marker could be a `decisions.md` entry (if a run dir exists) or a lightweight sentinel file; the exact mechanism should follow whatever pattern `tidy/scan-procedures.md` already uses for similar residue-tracking (e.g. the `parked`-trigger pattern) rather than inventing a new one.

### Key Files

- `plugin/skills/_shared/cleanup-procedures.md` — the finish-flow paths that can leave a worktree/branch in place
- `plugin/skills/tidy/scan-procedures.md` — new scan for left-in-place worktrees/branches
- `tests/` — fixture + test for the new scan

## Gotchas

- Distinguish clearly from #644 in both the code and the record's own documentation — #644 is about reconcile's removal *failing*; this record is about a worktree the finish flow never attempted to remove because leaving it was correct.
- The detection mechanism must not falsely flag every worktree currently in use by an active session — only ones a finish flow has already completed and deliberately decided to keep.

## Original request

tidy: a harness-managed worktree/branch deliberately left in place by a finish flow is never surfaced as residue

**Summary:** When a project's lifecycle finish flow deliberately leaves a harness-managed worktree and its branch in place (a legitimate, rule-based decision, not a failure), no claude-tweaks health sweep or `/claude-tweaks:tidy` pass records or surfaces it — it just sits on disk indefinitely with nothing pointing back to it.

**Kind:** Defect

**Affected component:** `/claude-tweaks:tidy`

**Objective:** Recovery quality

**Measurement:** 1 worktree + 1 branch left in place a full day after the finish flow ran, still present on disk with no open record naming them; 2 additional stale worktree directories found alongside them in the same scan.

**Repro steps:**
1. Complete a lifecycle finish flow that, per its own rules, leaves a harness-managed worktree and branch in place rather than removing them.
2. Run `/claude-tweaks:tidy` (or any health sweep) afterward.
3. Observe no row, finding, or record referencing the left-in-place worktree/branch — it is indistinguishable from residue nobody knows about.

**Expected vs. actual:**
Expected: a worktree/branch a finish flow intentionally leaves behind is still a live, disk-resident thing someone eventually needs to deal with — `/claude-tweaks:tidy` should list it, even if leaving it was the correct call at the time.
Actual: nothing in the plugin ever mentions it again; it was only found by manually running `git worktree list`/`git branch` well after the fact.

**Possible duplicate:** #644 (related but distinct — #644 covers reconcile's own removal-failure escalation, not a worktree the finish flow never attempted to remove)

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-7428e099 -->

