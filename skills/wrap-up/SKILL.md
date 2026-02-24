---
name: claude-tweaks:wrap-up
description: Use when /claude-tweaks:review passes and you need to capture learnings, clean up specs/plans, update skills, and decide next steps. The lifecycle closure step.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." End skills with a recommended next step, not a navigation menu.


# Wrap Up

Post-review reflection, knowledge capture, and lifecycle cleanup. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorm → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → [ /claude-tweaks:wrap-up ]
                                                                                                                                            ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- `/claude-tweaks:review` just passed and the work needs reflection and cleanup
- A spec is complete and needs its artifacts (plans, design docs) cleaned up
- You finished conversation-based work and want to capture learnings
- `/claude-tweaks:help` flags specs awaiting wrap-up

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

| Lens | Question | Surfaces |
|------|----------|----------|
| **1. Surprises** | "What surprised us?" — Unexpected constraints, library behavior, shape changes | Don'ts, skill updates |
| **2. Hindsight** | "What would we do differently?" — Better patterns discovered midway, over/under-engineering | Skill updates, conventions, spec adjustments |
| **3. Near-misses** | "What broke or almost broke?" — Unexpected test failures, type errors, cross-platform ripples | Don'ts, testing patterns, gotchas |
| **4. Fresh start** | "If we started fresh?" — Would we choose the same approach? What would v2 look like? | Architectural alternatives, memory files |

### Review Tradeoffs

Check the `/claude-tweaks:review` summary for the **Tradeoffs Accepted** section. For each accepted tradeoff, assess whether it represents:

- A **project-wide pattern** worth documenting (e.g., "we always choose X over Y because Z") → route to CLAUDE.md or a skill
- A **one-off decision** specific to this work → no action needed
- A **known limitation** others should be aware of → route to Don'ts or memory

### Route Insights (batch)

Collect all insights from the four lenses and the tradeoff review into a single table. Use this routing guide to pre-fill recommended destinations:

| Finding Type | Suggested Destination |
|-------------|-----------|
| "Never do X because Y" | CLAUDE.md Don'ts |
| "When building Z, always do W" | Existing skill update |
| "This reusable pattern emerged" | New skill candidate |
| "Remaining specs should use X instead" | Spec amendments |
| "A fundamentally better approach exists" | Skill update + Memory file |
| "We chose X over Y because Z" (from review tradeoffs) | CLAUDE.md Convention or Memory file (if it's a recurring decision) |

Present all insights as a batch:

```
### Reflection Insights

| # | Insight | Recommended Destination |
|---|---------|------------------------|
| 1 | {description} | Implement now → CLAUDE.md Don'ts |
| 2 | {description} | Implement now → Skill: {name} |
| 3 | {description} | Defer — bigger, not relevant now |
| 4 | {description} | Capture to INBOX — needs brainstorming |

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

**Recommendation rules:**
- **Implement now** — the strong default. If an insight leads to a concrete change (update CLAUDE.md, update a skill, add a rule, update memory), make the change during wrap-up. Most insights are small enough to implement immediately.
- **Defer** (DEFERRED.md) — the insight leads to a known improvement but it's bigger and not relevant to the current work. Include origin, context, trigger.
- **Capture to INBOX** — the insight is complex or uncertain and needs brainstorming/exploration before it can be acted on.
- **Don't capture** — only for insights that are genuinely not actionable (one-off observations, context-specific facts, things already documented elsewhere). Must state why.

If any insight is "Implement now", handle it before continuing wrap-up.

**Write all actionable insights to the open items ledger** (`docs/plans/*-ledger.md` for this work). "Implement now" items get status `open` until implemented (then `fixed`); "Defer" items get status `deferred`.

> **Routing bias:** Implement it now — always the recommended default. Defer when the improvement is bigger and not relevant now. Capture to INBOX when the insight needs brainstorming. The goal is to close gaps while the context is fresh.

---

## Step 4: Analyze Leftover Work (spec-based only)

For any unfinished sections, determine placement:
1. Merge into an existing spec — work fits naturally into another spec's scope
2. Add to `specs/DEFERRED.md` — work needs its own context (include origin spec, files, trigger)
3. Create a new INBOX item — genuinely new idea discovered during implementation
4. Drop entirely — no longer relevant

---

## Step 5: Clean Up Artifacts

### Execution Plans

Search `docs/plans/` for plan files related to this spec → **delete them**.

Note: Design docs (`*-design.md`) should already have been deleted by `/claude-tweaks:specify`. If any are found, delete them now.

### Auto-Generated Plans

Search `~/.claude/plans/` for related plans → **delete them**.

### Open Items Ledger

Delete `docs/plans/*-ledger.md` for this work. All items have been resolved by the nothing-left-behind gate (Step 9.5). If the file doesn't exist (standalone wrap-up), skip this.

## Steps 6-8: Assess Configuration Updates

> **Batch collection.** Steps 6-8 collect all potential updates in a single pass. No decisions are made here — everything is presented together in Step 10 for batch approval.

> **Parallel execution:** Run all three scans (documentation, skills, CLAUDE.md/rules) as parallel tool calls — each checks independent sources and collects findings in the `[type] target — change` format.

### 6: Documentation

Check if the work requires updates to project documentation:
- Setup guides
- Architecture references
- API documentation
- ADRs for significant architectural decisions

→ Collect each needed update as: `[doc] {file} — {what to add/change}`

### 7: Skills

Compare implementation patterns against existing skills in `.claude/skills/`:
1. **Deviations** — different patterns than documented?
2. **Gaps** — new reusable patterns not yet documented?
3. **Reflection findings** — route tagged insights to appropriate skills

→ Collect each needed update as: `[skill] {skill name} — {what to update/create}`

### 8: CLAUDE.md and Rules

Check if the work introduced project-wide conventions:
1. New commands or scripts
2. New naming conventions or patterns
3. New don'ts (anti-patterns discovered)
4. Stack changes
5. Path-scoped rules for `.claude/rules/`

Before adding to CLAUDE.md, check the size budget — keep it concise. Move detailed content to skills or rules.

→ Collect each needed update as: `[claude.md] {section} — {what to add/change}` or `[rule] {path scope} — {convention}`

## Step 9: Analyze Next Steps (spec-based only)

Determine:
1. **Newly unblocked specs** — what can now be worked on?
2. **Parallel opportunities** — which specs have no dependencies?
3. **Recommended next spec** — based on dependencies and logical flow

Suggest running `/claude-tweaks:help` to see the full workflow status.

---

## Step 9.5: Nothing Left Behind (Gate)

Read the open items ledger (`docs/plans/*-ledger.md` for this work). If the ledger doesn't exist (standalone wrap-up, or work predating the ledger), skip this gate.

### Bulk-resolve fast path

If all ledger items already have a terminal status (`fixed`, `deferred`, or `accepted`), skip the interactive resolution — just report: "All {N} ledger items resolved. No open items." and proceed to Step 10. This avoids re-presenting items that were already resolved during earlier pipeline phases.

### Interactive resolution (when open items exist)

Present all items in a single table:

```
### Open Items Resolution

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | ... | fixed | Commit abc123 |
| 2 | review | ... | fixed | Commit def456 |
| 3 | review | ... | deferred | DEFERRED.md — pre-existing pattern |
| 4 | wrap-up | ... | open | — |
```

**Gate:** Every item must have a terminal status (`fixed`, `deferred`, or `accepted`). If any item is still `open`:

1. Assess whether it can be fixed now (most can — especially items flagged during this session)
2. Present remaining open items:
   ```
   These items are still open:

   | # | Item | Recommended |
   |---|------|-------------|
   | 4 | ... | Fix now — {N} lines, {reason} |

   1. Fix all **(Recommended)**
   2. I'll tell you which to defer
   ```
3. Fix approved items, update ledger status to `fixed`
4. Defer remaining items to DEFERRED.md (with origin, files, trigger), update ledger status to `deferred`

**No item may remain `open` when wrap-up completes.**

---

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
- [ ] Delete open items ledger
- [ ] Leftover work: {recommendation}

### Configuration Updates (from Steps 6-8)
| # | Type | Target | Change |
|---|------|--------|--------|
| 1 | {doc/skill/claude.md/rule} | {target} | {what to add/change} |
| 2 | ... | ... | ... |
(or: No configuration updates needed.)

### Next Steps
(spec-based only — from Step 9)
- Newly unblocked: {specs}
- Recommended next: {spec}
```

Present **two batch decisions** (not per-step):

```
Cleanup Actions:
1. Apply all cleanup (delete spec, update INDEX, delete plans)
2. Apply selectively (I'll tell you which)
3. Skip cleanup for now

Configuration Updates:
(Present all collected items from Steps 6-8 as a numbered list)
1. Apply all {N} updates **(Recommended)**
2. Apply selectively — I'll tell you which items to skip
3. Skip all configuration updates
```

If the user chooses "Apply selectively", present the numbered list from the summary table and let them pick which to apply.

**Recommended next:** `/claude-tweaks:build {next spec number}` — {next spec title}. Or run `/claude-tweaks:help` for full pipeline status.

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
- Reflection insights with no clear destination must still be explicitly resolved — the user confirms "don't capture" with a reason, rather than the skill silently dropping them

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Running wrap-up before review | Wrap-up assumes code quality is verified — skipping review means capturing learnings from unvalidated work |
| Deleting specs that aren't 100% complete | Partial specs need leftover work routed, not deleted — use Step 4 first |
| Adding every insight to CLAUDE.md | CLAUDE.md has a size budget — route detailed content to skills, rules, or memory files |
| Skipping reflection for "simple" work | Simple work still surfaces surprises and near-misses worth capturing |
| Keeping design docs and plans after wrap-up | Consumed artifacts create stale references — the spec and code are the durable records |
| Silently dropping insights with no obvious destination | Every insight gets an explicit decision — even "don't capture" requires a stated reason from the user |
| Completing wrap-up with open ledger items | The nothing-left-behind gate exists to prevent dropped work — resolve every item before presenting the summary |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:review` | Must pass before /claude-tweaks:wrap-up — handles verification, code review, and simplification |
| `/claude-tweaks:capture` | /claude-tweaks:wrap-up may create INBOX items for genuinely new ideas discovered during implementation |
| `specs/DEFERRED.md` | /claude-tweaks:wrap-up routes leftover work here (with origin spec, files, trigger) |
| `/claude-tweaks:help` | /claude-tweaks:wrap-up suggests running /claude-tweaks:help to see what's unblocked |
| `/claude-tweaks:tidy` | /claude-tweaks:wrap-up cleans artifacts for a single spec — /claude-tweaks:tidy does periodic bulk cleanup |
| `/claude-tweaks:build` | Runs BEFORE /claude-tweaks:review — produces the code and journeys that wrap-up reflects on |
| `/claude-tweaks:review` (visual modes) | Visual complement — findings from visual review may feed into wrap-up's reflection lenses |
