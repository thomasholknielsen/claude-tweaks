---
name: claude-tweaks:tidy
description: Use when the backlog needs hygiene — review stale INBOX items, partially-complete specs, orphaned plans, and overall spec health
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." End skills with a recommended next step, not a navigation menu.


# Tidy

Periodic backlog hygiene to keep the spec system healthy. Run when the backlog feels cluttered, before a brainstorming session, or on a regular cadence.

```
/claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                 ↑
                                          [ /claude-tweaks:tidy ] (maintenance loop)
                                            ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- INBOX is getting long (10+ items)
- Starting a new brainstorming session (clean the landscape first)
- After completing a batch of specs (check what's unblocked)
- Monthly hygiene pass
- When `/claude-tweaks:help` flags issues

## Steps 1-4.5: Scan Everything

> **No decisions during scanning.** Steps 1-4.5 silently collect all findings. Everything is presented as one batch in Step 6 for approval. This replaces the previous per-item decision model.

### Step 1: Audit the INBOX

Read `specs/INBOX.md` and classify each entry:

| Age | Classification | Default Recommendation |
|-----|---------------|----------------------|
| < 2 weeks | Fresh | Keep |
| 2-4 weeks | Review | Keep (unless clearly stale) |
| > 4 weeks | Stale | Delete or Promote |

→ Collect each as: `[inbox] {title} — {age} — {recommendation}`

### Step 1.5: Audit Deferred Work

Read `specs/DEFERRED.md` and classify each entry:

| Trigger Status | Default Recommendation |
|---------------|----------------------|
| Trigger met (referenced spec complete) | Promote to spec or merge |
| Trigger not met, < 4 weeks | Keep |
| Trigger not met, > 4 weeks | Re-evaluate or delete |
| No clear trigger | Move to INBOX or delete |

→ Collect each as: `[deferred] {title} — from spec {N} — {recommendation}`

### Step 2: Audit Existing Specs

Read `specs/INDEX.md` and all spec files. For each spec, do a lightweight scan:
- Search for key files, endpoints, tests mentioned in the spec
- Estimate completion: `not started`, `in progress (~X%)`, `mostly done (~90%+)`, `appears complete`

Flag specs that need attention:
- **Appears complete, not reviewed** → recommend `/claude-tweaks:review {N}`
- **Appears complete, reviewed but not wrapped up** → recommend `/claude-tweaks:wrap-up {N}`
- **In progress for 4+ weeks** → recommend resuming `/claude-tweaks:build` or re-evaluating scope
- **Unmet prerequisites that are themselves stale** → recommend re-prioritizing the blocking spec
- **Overlaps significantly with another spec** → recommend merging

Check dependency health: circular dependencies, specs blocked by unstarted specs, orphan specs.

→ Collect each as: `[spec] Spec {N}: {title} — {issue} — {recommendation}`
→ Collect each as: `[dependency] {issue} — {recommendation}`

### Step 3: Audit Design Docs and Briefs

Scan `docs/plans/*-design.md` and `docs/plans/*-brief.md`.

**Design doc classification:**

| Status | Recommendation |
|--------|---------------|
| Marked as specified, derived specs complete | Delete |
| No status, matches existing specs | Mark as specified |
| No status, no matching specs | Run `/claude-tweaks:specify` |
| Very old (4+ weeks), no specs | Delete |

**Brief classification:**

| Status | Recommendation |
|--------|---------------|
| Matching design doc exists | Keep |
| No matching design doc, specs exist | Delete |
| No matching design doc, no specs | Delete |
| Very old (4+ weeks), no design doc | Delete |

→ Collect each as: `[doc] {filename} — {recommendation}`

### Step 4: Audit Execution Plans

Scan `docs/plans/` for non-design plan files and `~/.claude/plans/`.

| Status | Recommendation |
|--------|---------------|
| Related spec is complete | Delete |
| Related spec is in progress | Keep |
| No related spec found | Delete (orphan) |
| Very old, spec not started | Delete |

→ Collect each as: `[plan] {filename} — {recommendation}`

### Step 4.5: Audit Git Worktrees and Build Branches

**Worktrees:** Run `git worktree list`. Any worktree beyond the main working tree is a candidate.

**Build branches:** Run `git branch --list "build/*"`.

| Status | Recommendation |
|--------|---------------|
| Related spec complete + changes merged | Remove/delete |
| Related spec in progress | Keep |
| No related spec found | Remove/delete (orphan) |
| Unmerged changes | Keep (flag for attention) |

→ Collect each as: `[git] {worktree/branch} — {recommendation}`

Use `git branch -d` (safe delete, refuses if unmerged). Use `git worktree remove {path}` for worktrees.

## Step 5: Spec Sizing Review

For specs not yet built, check sizing:

- **Too large** (10+ tasks): recommend splitting
- **Too small** (1-2 trivial tasks): recommend merging with a related spec
- **Too vague** (no concrete deliverables or acceptance criteria): recommend re-specifying

---

## Step 6: Present Tidy Report and Approve

Present all collected findings as a single report. Every item has a pre-filled recommendation from the scanning steps.

```markdown
## Tidy Report — {date}

### Actions

| # | Type | Item | Recommendation |
|---|------|------|---------------|
| 1 | INBOX | "{title}" (4+ weeks) | Delete — stale |
| 2 | INBOX | "{title}" (2 weeks) | Keep — still fresh |
| 3 | Deferred | "{title}" (trigger met) | Promote to spec |
| 4 | Spec | Spec {N} (appears complete) | Run `/review {N}` |
| 5 | Spec | Spec {N} (4+ weeks in progress) | Re-evaluate scope |
| 6 | Dependency | Circular: {A} ↔ {B} | Fix now |
| 7 | Design doc | "{filename}" (specified) | Delete |
| 8 | Plan | "{filename}" (orphaned) | Delete |
| 9 | Worktree | "{path}" (merged) | Remove |
| 10 | Branch | "build/{name}" (merged) | Delete |

### Summary
- INBOX: {X} items ({Y} stale, {Z} ready to promote)
- Deferred: {X} items ({Y} actionable, {Z} stale)
- Specs: {A} total, {B} appear complete, {C} need attention
- Plans to clean: {D} design docs, {E} execution plans
- Git cleanup: {F} worktrees, {G} build branches

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

Items recommended as "Keep" are included for visibility but require no action. Only items with an active recommendation (delete, promote, fix, run) are executed.

**Recommended next** (after execution): `/claude-tweaks:help` for full pipeline status.

---

## Step 7: Execute Approved Actions

1. Delete approved INBOX entries
2. Delete approved design docs and plans
3. Remove approved worktrees and delete approved build branches
4. Update INDEX.md if specs were merged or removed
5. Note items flagged for brainstorming or `/claude-tweaks:specify`

Commit with a message summarizing the tidy-up.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Deleting specs without checking if they're implemented | Always scan the codebase first — the spec may be partially or fully built |
| Promoting INBOX items directly to specs without brainstorming | Brainstorming catches assumptions that skip straight to implementation |
| Keeping everything "just in case" | Stale items create noise and slow down `/claude-tweaks:help` |
| Presenting items one-at-a-time for individual decisions | Scan silently, present one batch report, let the user approve all or override specific items. Per-item prompts scale badly. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | Feeds the INBOX that /claude-tweaks:tidy audits |
| `/claude-tweaks:specify` | /claude-tweaks:tidy flags unspecified design docs for /claude-tweaks:specify |
| `/claude-tweaks:review` | /claude-tweaks:tidy flags specs that appear complete but lack review |
| `/claude-tweaks:wrap-up` | /claude-tweaks:tidy flags reviewed specs that need wrap-up |
| `/claude-tweaks:help` | /claude-tweaks:help suggests /claude-tweaks:tidy when maintenance signals are detected |
| `specs/DEFERRED.md` | /claude-tweaks:tidy audits deferred items — promotes, merges, moves to INBOX, or deletes |
| `/claude-tweaks:build` | /claude-tweaks:tidy cleans up leftover worktrees and `build/*` branches from previous builds |
