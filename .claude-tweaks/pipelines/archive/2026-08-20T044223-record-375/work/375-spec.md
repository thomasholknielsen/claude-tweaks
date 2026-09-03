---
record: 375
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 375: Gate-authoring guidance: trace sanctioned callers and non-destructive modes at plan time

Surface: backend

## Current State

`/claude-tweaks:specify`'s spec-template (`skills/specify/spec-template.md`) and `/superpowers:writing-plans`'s downstream plan authoring have no guidance step for a spec/plan that adds a new gate (a PreToolUse/PostToolUse hook check, a permission rule, a teardown/cleanup guard). Nothing in the plan-authoring path prompts the author to enumerate the sanctioned callers of the operation being gated, or the gated tool's non-destructive modes, and check each against the proposed gate before implementation.

Spec #373 hit this gap concretely: its plan added a new teardown gate, and its whole-branch review had to catch — after implementation — two collisions the plan itself missed: (1) the gate denied the plugin's own documented cleanup sequence (`skills/wrap-up/cleanup-procedures.md` Section C's ordering, which calls `close-run` before the worktree is removed), and (2) `ExitWorktree`'s non-destructive `action: "keep"` was gated even though an earlier task in the same plan had already pinned the `action` field to a non-destructive value. Both are instances of the same missing check. Both collisions are already fixed in the current `cleanup-procedures.md` (Section C step 3.6's ordering, verified present at shaping time) — this record is forward-looking process guidance to prevent the *class* of gap from recurring on the next gate-adding spec, not a fix for a still-broken bug.

## Deliverables

Add one short new section to `skills/specify/spec-template.md`, immediately after the existing `## Empirical Premise-Check Deliverables` section and before `## Why Each Section Matters for /superpowers:writing-plans`. The new section instructs spec/plan authors: when a plan adds a new gate (a PreToolUse/PostToolUse hook check, a permission rule, or a teardown/cleanup guard), enumerate every sanctioned caller of the operation being gated and every non-destructive/safe mode of the gated tool or operation, and trace each of them against the proposed gate — confirming neither a sanctioned caller nor a non-destructive mode is blocked — before implementation begins. Match the existing enumeration-style voice of the Empirical Premise-Check Deliverables section (an authoring instruction with a short illustrative example) rather than narrative prose, and cite spec #373's two-collision case as the motivating example without inventing any other named incident.

## Acceptance Criteria

- `skills/specify/spec-template.md` contains exactly one new `##`-level section between `## Empirical Premise-Check Deliverables` and `## Why Each Section Matters for /superpowers:writing-plans` — verify with `grep -n "^## " skills/specify/spec-template.md` and confirm the new heading appears exactly once, in that position.
- The new section's body names both required enumerations explicitly: sanctioned callers of the gated operation, and the gated tool/operation's non-destructive modes — a reader must not have to infer either from generic "consider edge cases" phrasing.
- The new section references spec #373's motivating example (the teardown-gate/cleanup-sequence collision and the `ExitWorktree` non-destructive-mode collision) without introducing a new incident name.
- No other section of `spec-template.md` is edited — a diff review shows only the one inserted section.
- No files outside `skills/specify/spec-template.md` are changed by this record's build (pure documentation addition, no code/test changes required).
- The new text contains no unresolved placeholder markers or deferred-work comments, per `_shared/work-record.md`'s spec-shaped-body check.

## Technical Approach

Target file and location: `skills/specify/spec-template.md`, directly after `## Empirical Premise-Check Deliverables` (that section already documents a similar "author must enumerate before writing the plan" pattern for empirical-premise assumptions — this is the same authoring discipline applied to gate-adding plans, so it belongs beside its nearest analog rather than in a new part of the file).

Why `spec-template.md` and not "the review checklist" (the original issue's other candidate): the issue's own title says "at plan time" — `spec-template.md` is read by `/claude-tweaks:specify` and cited by `/superpowers:writing-plans` as the plan-authoring source, i.e. exactly the point in the pipeline where a gate-adding plan is first written. A review-time check (there is no single canonical "review checklist" file in this repo today — confirmed by a repo-wide grep for that literal phrase at shaping time) would only catch the gap *after* the plan is already written, which is the failure mode spec #373 already demonstrated: the whole-branch review caught both collisions, but only after they were implemented. Placing the guidance at plan-authoring time prevents the defect from being written in the first place, rather than relying on review to catch it after the fact.

Write style: a short instructional paragraph plus a compact enumeration (matching the existing Empirical Premise-Check Deliverables section's own two-bullet enumeration style), not a lengthy new subsystem of guidance — this is documentation-only and should stay proportionate to the section it sits beside.

## Gotchas

- The original issue named two candidate homes for this guidance (spec-template.md's Empirical Premise-Check area, or "the review checklist"). This record resolves that choice to spec-template.md, with rationale in Technical Approach above — a build agent that disagrees should revisit the rationale explicitly rather than silently dropping the guidance from both candidate homes.
- "The review checklist" referenced in the original issue does not name a specific existing file in this repo (verified: no file or heading contains that literal phrase) — treat it as informal shorthand for `/claude-tweaks:review`'s structural-coupling checks if this decision is ever revisited, not as a pointer to a file that already exists.
- Both concrete collisions cited as the motivating example (the teardown-gate/cleanup-sequence ordering, and `ExitWorktree`'s non-destructive `action: "keep"`) are already resolved in the current codebase — this deliverable is preventive guidance for future gate-adding specs, not a bug fix. Do not treat this record as blocked on, or requiring changes to, any currently-live gate behavior.

## Original request

Gate-authoring guidance: trace sanctioned callers and non-destructive modes at plan time

From spec #373's hindsight (review/hindsight ledger item), approved as a backlog record at the 2026-08-13 multi-spec flow run's consolidated Review Console.

## Problem

Spec #373's plan missed two collisions its whole-branch review had to catch after the fact: (1) the new teardown gate denied the plugin's OWN documented cleanup sequence (`cleanup-procedures.md` Section C removed the worktree before item 8's `close-run`), and (2) `ExitWorktree`'s non-destructive `action: "keep"` was gated even though Task 0's capture had already pinned the `action` field. Both are instances of one gap: when adding a gate, nothing prompts the plan author to enumerate the sanctioned callers of the gated operation and the tool's non-destructive modes, and trace each against the gate at PLAN time.

## Deliverable

Add gate-authoring guidance to the right home — candidates: `/claude-tweaks:specify`'s spec-template (beside the new Empirical Premise-Check Deliverables section) or the review checklist — one short section: enumerate sanctioned callers + non-destructive modes, trace each against the proposed gate before implementation.

Refs #373.
