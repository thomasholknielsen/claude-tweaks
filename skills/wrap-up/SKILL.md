---
name: claude-tweaks:wrap-up
description: Use after /claude-tweaks:review passes to capture learnings, clean up specs/plans, update skills, and suggest next steps. The lifecycle closure step.
---

# Wrap Up

Post-review reflection, knowledge capture, and lifecycle cleanup. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
```

## Overview

`/claude-tweaks:review` verified the code is good. `/claude-tweaks:wrap-up` asks: what did we learn, and what needs cleaning up?

This skill handles reflection (capturing learnings), spec lifecycle (completion/cleanup), and knowledge routing (updating skills, CLAUDE.md, memory). It does NOT re-review code quality — that's `/claude-tweaks:review`'s job.

## Step 1: Identify the Work Context

Determine what type of work was completed:

### If `$ARGUMENTS` is provided:

- If it's a spec number (e.g., "42", "73"), proceed as **spec-based work**
- Otherwise, use it as context for **conversation-based work**

### If no arguments, detect from context:

1. Check recent git commits for spec references
2. Check current branch name for spec patterns
3. Review conversation for references to spec files or features

| Type | Characteristics | Primary Focus |
|------|----------------|---------------|
| **Spec-based** | Has a spec file in `specs/` | Full lifecycle: spec completion + plans + all assessments |
| **Conversation-based** | No spec, just work discussed | Assessments only (skip spec/plan cleanup steps) |

## Step 2: Summarize Completed Work

> Note: Spec compliance (deliverables + acceptance criteria) was already verified in `/claude-tweaks:review` Step 1. This step summarizes what was done — it does not re-verify.

### For spec-based work:

Summarize the implementation against the spec:

1. List what was delivered (high-level, not a re-audit)
2. **100% complete** (confirmed by `/claude-tweaks:review`) → spec will be deleted
3. **Partial** (if `/claude-tweaks:review` passed with minor gaps flagged) → identify what remains

### For conversation-based work:

Review conversation and recent commits to identify what was implemented and which key files changed.

## Step 3: Reflect on Implementation

### Four Reflection Lenses

**Lens 1: "What surprised us?"** — Unexpected constraints, library behavior, or shape changes. Surfaces: don'ts, skill updates.

**Lens 2: "What would we do differently?"** — Better patterns discovered midway, over/under-engineering. Surfaces: skill updates, conventions, spec adjustments.

**Lens 3: "What broke or almost broke?"** — Unexpected test failures, type errors, cross-platform ripples. Surfaces: don'ts, testing patterns, gotchas.

**Lens 4: "If we started fresh?"** — Would we choose the same approach? What would v2 look like? Surfaces: architectural alternatives, memory files.

### Review Tradeoffs

Check the `/claude-tweaks:review` summary for the **Tradeoffs Accepted** section. For each accepted tradeoff, assess whether it represents:

- A **project-wide pattern** worth documenting (e.g., "we always choose X over Y because Z") → route to CLAUDE.md or a skill
- A **one-off decision** specific to this work → no action needed
- A **known limitation** others should be aware of → route to Don'ts or memory

### Route Each Insight

| Finding Type | Routed To |
|-------------|-----------|
| "Never do X because Y" | CLAUDE.md Don'ts |
| "When building Z, always do W" | Existing skill update |
| "This reusable pattern emerged" | New skill candidate |
| "Remaining specs should use X instead" | Spec amendments |
| "A fundamentally better approach exists" | Skill update + Memory file |
| "We chose X over Y because Z" (from review tradeoffs) | CLAUDE.md Convention or Memory file (if it's a recurring decision) |

## Step 4: Analyze Leftover Work (spec-based only)

For any unfinished sections, determine placement:
- Merge into an existing spec
- Create a new focused spec
- Defer to a later tier
- Drop entirely (if no longer relevant)

## Step 5: Clean Up Artifacts

### Execution Plans

Search `docs/plans/` for plan files related to this spec → **delete them**.

Note: Design docs (`*-design.md`) should already have been deleted by `/claude-tweaks:specify`. If any are found, delete them now.

### Auto-Generated Plans

Search `~/.claude/plans/` for related plans → **delete them**.

## Step 6: Assess Documentation

Check if the work requires updates to project documentation:
- Setup guides
- Architecture references
- API documentation
- ADRs for significant architectural decisions

## Step 7: Assess Skills

Compare implementation patterns against existing skills in `.claude/skills/`:
1. **Deviations** — different patterns than documented?
2. **Gaps** — new reusable patterns not yet documented?
3. **Reflection findings** — route tagged insights to appropriate skills

## Step 8: Assess CLAUDE.md and Rules

Check if the work introduced project-wide conventions:
1. New commands or scripts
2. New naming conventions or patterns
3. New don'ts (anti-patterns discovered)
4. Stack changes
5. Path-scoped rules for `.claude/rules/`

Before adding to CLAUDE.md, check the size budget — keep it concise. Move detailed content to skills or rules.

## Step 9: Analyze Next Steps (spec-based only)

Determine:
1. **Newly unblocked specs** — what can now be worked on?
2. **Parallel opportunities** — which specs have no dependencies?
3. **Recommended next spec** — based on dependencies and logical flow

Suggest running `/claude-tweaks:next` to see the full workflow status.

## Step 10: Present Consolidated Summary

```
## Wrap-Up: Spec {number} — {title}

### Reflection Insights
1. {insight} → {destination}
(or: No significant insights.)

### Implementation Status
- {section}: {status}
Overall: {X}% complete

### Cleanup Actions
- [ ] Delete spec (if 100%) or update status
- [ ] Update INDEX.md
- [ ] Delete plans from docs/plans/
- [ ] Leftover work: {recommendation}

### Documentation / Skills / CLAUDE.md
- [ ] {specific changes or "No changes needed"}

### Next Steps
**Recommended next:** Spec {number} — {title}
```

Ask the user to confirm or modify each action category.

## Step 11: Execute Approved Actions

1. Delete or edit spec files
2. Update INDEX.md
3. Delete plans
4. Update documentation, skills, CLAUDE.md, memory files

Commit with a message summarizing the wrap-up actions.

## Important Notes

- `/claude-tweaks:review` should have been run before `/claude-tweaks:wrap-up` — this skill assumes code quality is verified
- INDEX.md is forward-looking only — remove completed entries
- Skills document reusable patterns, not one-off implementations
- CLAUDE.md stays concise — use skills, rules, or reference docs for details
- Reflection insights with no clear destination can be safely dropped

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:review` | Must pass before /claude-tweaks:wrap-up — handles verification, code review, and simplification |
| `/claude-tweaks:capture` | /claude-tweaks:wrap-up may create INBOX items for leftover work |
| `/claude-tweaks:next` | /claude-tweaks:wrap-up suggests running /claude-tweaks:next to see what's unblocked |
| `/claude-tweaks:tidy` | /claude-tweaks:wrap-up cleans artifacts for a single spec — /claude-tweaks:tidy does periodic bulk cleanup |
