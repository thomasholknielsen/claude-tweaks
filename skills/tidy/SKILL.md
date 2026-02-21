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

## Step 2: Audit Existing Specs

Read `specs/INDEX.md` and all spec files. Check each spec against the codebase:

### Completion Check

For each spec, do a lightweight scan:
- Search for key files, endpoints, tests mentioned in the spec
- Estimate completion: `not started`, `in progress (~X%)`, `mostly done (~90%+)`, `appears complete`

Flag specs that:
- **Appear complete, not reviewed** → run `/claude-tweaks:review` first (check if `/claude-tweaks:review` was run by looking for review commits or summary artifacts)
- **Appear complete, reviewed but not wrapped up** → run `/claude-tweaks:wrap-up`
- **Have been in progress for 4+ weeks** → may be stuck
- **Have unmet prerequisites** that are themselves stale
- **Overlap significantly** with other specs → candidates for merging

### Dependency Health

Check the INDEX.md dependency graph:
- Circular dependencies?
- Specs blocked by specs that haven't been started?
- Orphan specs with no tier placement?

## Step 3: Audit Design Docs and Briefs

Scan `docs/plans/*-design.md` and `docs/plans/*-brief.md`:

| Status | Action |
|--------|--------|
| Marked as specified | Check if derived specs are complete → if yes, delete |
| No status, matches existing specs | Mark as specified |
| No status, no matching specs | Flag — brainstormed but never `/claude-tweaks:specify`'d |
| Very old (4+ weeks), no specs | Candidate for deletion or re-brainstorming |

**Briefs** (`*-brief.md`) follow a simpler lifecycle:

| Status | Action |
|--------|--------|
| Matching design doc exists | Keep — brief is waiting for `/claude-tweaks:specify` to consume both |
| No matching design doc, matching specs exist | Delete — brief was absorbed into specs, `/claude-tweaks:specify` missed cleanup |
| No matching design doc, no specs | Orphan — brainstorming never happened. Re-run `brainstorming` or delete |
| Very old (4+ weeks), no design doc | Delete — the challenge output went stale |

## Step 4: Audit Execution Plans

Scan `docs/plans/` for non-design plan files and `~/.claude/plans/`:

| Status | Action |
|--------|--------|
| Related spec is complete | Delete — served its purpose |
| Related spec is in progress | Keep |
| No related spec found | Orphan — delete |
| Very old, spec not started | Flag for review |

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

### Summary
- INBOX: {X} items ({Y} stale, {Z} ready to promote)
- Specs: {A} total, {B} appear complete, {C} need attention
- Plans to clean: {D} design docs, {E} execution plans
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
3. Update INDEX.md if specs were merged or removed
4. Note items flagged for brainstorming or `/claude-tweaks:specify`

Commit with a message summarizing the tidy-up.

## Anti-Patterns

- Deleting specs without checking if they're implemented (always scan the codebase first)
- Promoting INBOX items directly to specs without brainstorming
- Keeping everything "just in case" — stale items create noise and slow down `/claude-tweaks:help`

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | Feeds the INBOX that /claude-tweaks:tidy audits |
| `/claude-tweaks:specify` | /claude-tweaks:tidy flags unspecified design docs for /claude-tweaks:specify |
| `/claude-tweaks:review` | /claude-tweaks:tidy flags specs that appear complete but lack review |
| `/claude-tweaks:wrap-up` | /claude-tweaks:tidy flags reviewed specs that need wrap-up |
| `/claude-tweaks:help` | /claude-tweaks:help suggests /claude-tweaks:tidy when maintenance signals are detected |
