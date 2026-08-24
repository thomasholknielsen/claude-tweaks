# Surface Maintainer Objectives in CLAUDE.md — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `## Objectives` section to CLAUDE.md naming the maintainer objectives currently defined in `plugin/skills/_shared/feedback-objectives.md`, pointing there for the full rubric, and staying within `tests/claude-md-budget.test.js`'s byte budget.

**Architecture:** Single-file documentation change. No code paths change; no new mechanical reader is added.

**Tech Stack:** Markdown (CLAUDE.md), `node --test` for the budget assertion.

**Spec:** `.claude-tweaks/pipelines/2026-08-24T013414-record-614/work/614-spec.md` (materialized from GitHub issue #614)

## Global Constraints

- CLAUDE.md must stay ≤ 24576 bytes (`tests/claude-md-budget.test.js`'s `BUDGET_BYTES`) — current size is 19293 bytes, so ~5283 bytes of headroom before this change.
- Point at `plugin/skills/_shared/feedback-objectives.md` for the full rubric rather than restating definitions — matches CLAUDE.md's existing Cross-references convention ("point at a canonical file rather than restating its content").
- Keep the new section short (~4 lines), matching the spec's Gotchas note.

## Known drift (source-of-truth check, spec vs. current file)

The spec's issue body claims "eight" objectives (automation efficiency, context overhead, avoidable interactions, friction, developer joy, trust calibration, instruction efficacy, recovery quality). Reading `plugin/skills/_shared/feedback-objectives.md`'s `## Objectives` table directly (as of this build) shows **nine** rows — the spec's list omits "Report fidelity" (a countable objective: "Status claims match what actually happened"), which exists in the canonical file today. This is exactly the "Named-location drift" class `skills/flow/materialize.md` warns about: a filed record's factual claims about a location's content can go stale by build time. The task writes what the canonical file actually contains (nine), not the spec's stale count of eight — CLAUDE.md's own convention is to point at the canonical file rather than restate it, so an inaccurate restated count would be worse than no restated count. This divergence is called out inline in Task 1's step and logged to the pipeline decision log.

---

### Task 1: Add `## Objectives` section to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (insert new `## Objectives` section after `## Philosophy`, before `## Working Approach`)
- Test: `tests/claude-md-budget.test.js` (existing test, no changes — used to verify headroom before/after)

**Interfaces:**
- Consumes: nothing (documentation-only change)
- Produces: nothing (no downstream code reads this section mechanically)

- [ ] **Step 1: Measure current headroom**

Run: `wc -c CLAUDE.md`
Expected: `19293` (current byte count) — confirms starting headroom against the 24576-byte budget before editing.

- [ ] **Step 2: Insert the `## Objectives` section**

Insert this new section into `CLAUDE.md` immediately after the `## Philosophy` section's closing paragraph (the "Established codebase distributed to real users..." paragraph) and before the `## Working Approach` heading:

```markdown
## Objectives

The plugin optimizes for the maintainer objectives `/feedback`'s session judge scores every session against — currently nine: automation efficiency, context overhead, avoidable interactions, friction, developer joy, trust calibration, instruction efficacy, report fidelity, recovery quality. Full definitions, evidence, and class (`judgment`/`countable`) live in `plugin/skills/_shared/feedback-objectives.md` — the canonical rubric; this list is a pointer, not a restatement.

**Decision:** `/reflect`'s five lenses (Surprises, Approach, Near-misses, Fresh start, Friction) evaluate a single build's approach and code, not session-quality across a whole session — a different purpose and a mostly-different vocabulary (only "Friction" genuinely overlaps). They keep their own names rather than adopting these; revisit only if the two rubrics are deliberately merged later.
```

- [ ] **Step 3: Verify the budget test still passes**

Run: `node --test tests/claude-md-budget.test.js`
Expected: PASS (1 test passed). Also run `wc -c CLAUDE.md` and confirm the new size is still ≤ 24576.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Add Objectives section to CLAUDE.md — surface the feedback-objectives rubric

refs #614"
```
