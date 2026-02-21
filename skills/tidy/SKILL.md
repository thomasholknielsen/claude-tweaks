---
name: claude-tweaks:tidy
description: Use when the backlog needs hygiene — review stale INBOX items, partially-complete specs, orphaned plans, and overall spec health
---
> **Interaction style:** Present choices as numbered options (1, 2, 3…) so the user can reply with just a number. Do the same when suggesting the next skill to run.


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

## Step 1: Audit the INBOX

Read `specs/INBOX.md` and evaluate each entry:

| Age | Classification |
|-----|---------------|
| < 2 weeks | Fresh — leave it |
| 2-4 weeks | Review — is it still relevant? |
| > 4 weeks | Stale — promote, merge, or delete |

For each entry, present numbered options:

```
INBOX: "{item title}" ({age} old)
1. Promote — Run brainstorming on this topic
2. Merge — Add to existing spec {N}
3. Delete — No longer relevant
4. Keep — Not ready yet
```

## Step 1.5: Audit Deferred Work

Read `specs/DEFERRED.md` and evaluate each entry:

| Trigger Status | Classification |
|---------------|---------------|
| Trigger met (referenced spec complete) | Actionable — promote to spec or merge |
| Trigger not met, < 4 weeks | Active — leave it |
| Trigger not met, > 4 weeks | Stale — re-evaluate trigger or drop |
| No clear trigger | Incomplete — add a trigger or move to INBOX |

For each entry, present numbered options:

```
DEFERRED: "{item title}" (from spec {N}, {age} old)
1. Promote — Create a spec or run brainstorming
2. Merge — Add to existing spec {N}
3. Move to INBOX — Lost its context, treat as a new idea
4. Delete — No longer relevant
5. Keep — Trigger not yet met
```

## Step 2: Audit Existing Specs

Read `specs/INDEX.md` and all spec files. Check each spec against the codebase:

### Completion Check

For each spec, do a lightweight scan:
- Search for key files, endpoints, tests mentioned in the spec
- Estimate completion: `not started`, `in progress (~X%)`, `mostly done (~90%+)`, `appears complete`

Flag specs that need attention. **For each flagged spec, present a decision:**

```
SPEC {N}: "{title}" — {issue}
1. Act now — {recommended action: run /review, run /wrap-up, resume /build}
2. Defer — Keep as-is, revisit next tidy
3. Drop — Spec is no longer relevant (remove from INDEX.md)
```

Issues to flag:
- **Appears complete, not reviewed** → recommend `/claude-tweaks:review {N}`
- **Appears complete, reviewed but not wrapped up** → recommend `/claude-tweaks:wrap-up {N}`
- **In progress for 4+ weeks** → recommend resuming `/claude-tweaks:build` or re-evaluating scope
- **Unmet prerequisites that are themselves stale** → recommend re-prioritizing the blocking spec
- **Overlaps significantly with another spec** → recommend merging

### Dependency Health

Check the INDEX.md dependency graph:
- Circular dependencies?
- Specs blocked by specs that haven't been started?
- Orphan specs with no tier placement?

For each dependency issue found, present a decision:

```
DEPENDENCY: {description of issue}
1. Fix now — {recommended fix}
2. Defer — Address in next tidy cycle
```

## Step 3: Audit Design Docs and Briefs

Scan `docs/plans/*-design.md` and `docs/plans/*-brief.md`.

**For each design doc, present a decision:**

```
DESIGN DOC: "{filename}" — {status}
1. Act now — {recommended action: run /specify, delete, mark as specified}
2. Keep — Still needed
3. Delete — No longer relevant
```

Use this table to determine the recommended action:

| Status | Recommended Action |
|--------|--------|
| Marked as specified, derived specs complete | Delete |
| No status, matches existing specs | Mark as specified |
| No status, no matching specs | Run `/claude-tweaks:specify` |
| Very old (4+ weeks), no specs | Delete or re-brainstorm |

**For each brief, present a decision:**

```
BRIEF: "{filename}" — {status}
1. Act now — {recommended action}
2. Keep — Still needed
3. Delete — No longer relevant
```

| Status | Recommended Action |
|--------|--------|
| Matching design doc exists | Keep |
| No matching design doc, specs exist | Delete |
| No matching design doc, no specs | Re-run `brainstorming` or delete |
| Very old (4+ weeks), no design doc | Delete |

## Step 4: Audit Execution Plans

Scan `docs/plans/` for non-design plan files and `~/.claude/plans/`.

**For each plan, present a decision:**

```
PLAN: "{filename}" — {status}
1. Delete — {reason: served its purpose / orphaned / stale}
2. Keep — Related spec is in progress
```

| Status | Recommended Action |
|--------|--------|
| Related spec is complete | Delete |
| Related spec is in progress | Keep |
| No related spec found | Delete (orphan) |
| Very old, spec not started | Delete or flag for review |

## Step 4.5: Audit Git Worktrees and Build Branches

Check for leftover worktrees and branches from previous builds.

### Worktrees

```bash
git worktree list
```

Any worktree beyond the main working tree is a candidate for cleanup. Also check for worktree directories that may have been left behind:

```bash
ls -d .worktrees/ worktrees/ 2>/dev/null
```

For each extra worktree, present numbered options:

```
WORKTREE: "{path}" on branch {branch} ({last commit age} old)
1. Remove — Work is merged or no longer needed
2. Keep — Still in use
```

To remove: `git worktree remove {path}` (removes the directory and unregisters the worktree).

### Build Branches

```bash
git branch --list "build/*"
```

For each build branch, check whether the related spec is complete, merged, or abandoned:

| Branch Status | Classification |
|--------------|---------------|
| Related spec complete + changes merged | Stale — safe to delete |
| Related spec in progress | Active — leave it |
| No related spec found | Orphan — likely safe to delete |
| Unmerged changes | Caution — confirm with user before deleting |

For each build branch, present numbered options:

```
BRANCH: "build/{name}" ({last commit age} old, {merged/unmerged})
1. Delete — `git branch -d build/{name}`
2. Keep — Still in use
```

Use `git branch -d` (safe delete, refuses if unmerged) unless the user explicitly confirms force-deleting unmerged work.

## Step 5: Spec Sizing Review

For specs not yet built, check sizing:

- **Too large** (10+ tasks): recommend splitting
- **Too small** (1-2 trivial tasks): recommend merging with a related spec
- **Too vague** (no concrete deliverables or acceptance criteria): recommend re-specifying

---

## Step 6: Present Findings

```markdown
## Tidy Report — {date}

### INBOX ({N} items)
| Item | Age | Recommendation | Reason |
|------|-----|---------------|--------|
| {title} | {days} | Promote / Merge / Delete / Keep | {reason} |

### Deferred Work ({N} items)
| Item | Origin | Age | Trigger | Recommendation |
|------|--------|-----|---------|---------------|
| {title} | spec {N} | {days} | {trigger status} | Promote / Merge / Move to INBOX / Delete / Keep |

### Specs Requiring Attention
| Spec | Issue | Recommendation |
|------|-------|---------------|
| {N} | Appears complete, not reviewed | Run `/claude-tweaks:review {N}` |
| {N} | Appears complete, reviewed | Run `/claude-tweaks:wrap-up {N}` |
| {N} | Stale (4+ weeks) | Deprioritize or re-evaluate |
| {N} | Too large | Split into {suggestion} |

### Design Docs
| File | Status | Action |
|------|--------|--------|
| {filename} | All derived specs done | Delete |
| {filename} | Never specified | Run `/claude-tweaks:specify` or delete |

### Orphaned Plans
| File | Action |
|------|--------|
| {filename} | Delete (no related spec) |

### Git Cleanup
| Item | Type | Age | Status | Recommendation |
|------|------|-----|--------|---------------|
| {path or branch name} | Worktree / Branch | {age} | {merged/unmerged/orphan} | Remove / Keep |

### Summary
- INBOX: {X} items ({Y} stale, {Z} ready to promote)
- Deferred: {X} items ({Y} actionable, {Z} stale)
- Specs: {A} total, {B} appear complete, {C} need attention
- Plans to clean: {D} design docs, {E} execution plans
- Git cleanup: {F} worktrees, {G} build branches
```

Present the full action list as numbered options:

```
Approve actions (reply with numbers, e.g. "1,3,5"):
1. Delete INBOX entry: {title}
2. Delete design doc: {filename}
3. Run `/claude-tweaks:review {N}` — Spec appears complete
4. Run `/claude-tweaks:wrap-up {N}` — Spec reviewed, needs wrap-up
5. Delete orphaned plan: {filename}
```

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
| Listing recommendations in a summary without per-item decisions | Every flagged item must get an explicit vote: act now, defer, or drop. No implicit "we'll get to it." |

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
