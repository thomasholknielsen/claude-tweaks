---
name: claude-tweaks:tidy
description: Use when the backlog needs hygiene — review stale INBOX items, partially-complete specs, orphaned plans, and overall spec health
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a recommended next step, not a navigation menu.


# Tidy

Periodic backlog hygiene to keep the spec system healthy. Run when the backlog feels cluttered, before a brainstorming session, or on a regular cadence.

```
/claude-tweaks:capture → /claude-tweaks:challenge → /brainstorm → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
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

> **Parallel execution:** Dispatch Steps 1 through 4.5 as parallel Task agents — each scan is independent (INBOX, Deferred, Specs, Design Docs, Plans, Git). Each agent returns findings in the `[type] item — detail — recommendation` format. Assemble all findings into the Step 6 report after all agents complete. Step 5 (Sizing Review) and Step 5.5 (Cross-Spec Pattern Detection) run after, since they depend on the spec scan results.

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

### Step 5.5: Cross-Spec Pattern Detection

Scan recent git history for recurring findings across review summaries and wrap-up reflections. Patterns that appear in 2+ specs signal systemic issues worth addressing at the project level rather than per-spec.

#### How to scan

1. Search recent commits for review and wrap-up artifacts:
   - `git log --all --oneline --grep="review" --grep="wrap-up" --since="4 weeks ago"` (or check `docs/plans/*-review-summary*` and recent wrap-up commits)
2. Read the review summaries and wrap-up reflections referenced in those commits
3. Extract findings by category (Security, Convention, Performance, Error Handling, Architecture, Test Quality)

#### What to look for

| Signal | Example | Recommendation |
|--------|---------|---------------|
| Same finding category in 3+ reviews | "Convention: import from shared package" in specs 41, 43, 45 | Add rule to CLAUDE.md or `.claude/rules/` |
| Same file flagged across specs | `src/utils/validate.ts` modified and reviewed in 4 specs | Refactor — this file may be a responsibility magnet |
| Same gotcha rediscovered | "Use upsert not delete+insert" in 3 spec Gotchas | Add to CLAUDE.md as a project convention |
| Recurring deferred items with similar themes | "Add error boundary" deferred in 3 specs | Promote to its own spec — it's not going away |

→ Collect each as: `[pattern] {description} — seen in {spec list} — {recommendation}`

Patterns are informational — they surface systemic issues the user may want to address. They appear in the tidy report alongside actionable items but don't require immediate action.

---

## Action Vocabulary

Every recommendation in the tidy report uses one of these actions. Each action is atomic — either fully executed or not at all. Do not commit partial state (e.g., removing from INBOX without creating the destination artifact).

| Action | What It Means | Execution | Removes from Source? |
|--------|--------------|-----------|---------------------|
| **Delete** | Item is no longer needed — stale, already implemented, or out of scope | Remove entry from source file | Yes |
| **Defer** | Valid but not timely — park with a trigger condition | (1) Add to `specs/DEFERRED.md` with `**Deferred:** {date} \| **From:** {source} \| **Trigger:** {condition}`, (2) remove from source | Yes — moves to DEFERRED.md |
| **Merge** | Scope belongs in an existing spec | (1) Integrate scope into target spec's **Deliverables**, **Acceptance Criteria**, and **Technical Approach** — not as an appendix, as first-class spec content, (2) update target spec's `Last Updated`, (3) remove from source | Yes |
| **Promote** | Ready for the brainstorm → specify pipeline | Tag in INBOX as `**Promoted:** {date} — awaiting brainstorm`. Do NOT remove from INBOX | No — stays in INBOX with tag |
| **Keep** | No action needed | None | No |

### Why "Promote" keeps the item in INBOX

The lifecycle is: INBOX → brainstorm → design doc → specify → spec file. "Promote" means the item is ready to enter that pipeline, but until a spec file exists, the INBOX entry is the only tracking artifact. Removing it creates a gap where the item exists nowhere — decided on but with no durable record. The INBOX entry stays as a pointer until `/claude-tweaks:specify` creates the spec, at which point `/claude-tweaks:specify` Step 6 removes it from INBOX.

### Merge means integrate, not append

When merging an INBOX or deferred item into an existing spec, the merged content must be indistinguishable from original spec content. Add new deliverables to the Deliverables checklist, new assertions to Acceptance Criteria, new architectural notes to Technical Approach, and new caveats to Gotchas. Do NOT create a "Merged Scope" appendix section at the bottom of the spec — that creates second-class content that `/write-plan` may miss or treat differently.

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
| 3 | INBOX | "{title}" (clean, ready) | Promote — tag, awaiting brainstorm |
| 4 | INBOX | "{title}" (overlaps spec {N}) | Merge → Spec {N} |
| 5 | INBOX | "{title}" (valid, not timely) | Defer — trigger: {condition} |
| 6 | Deferred | "{title}" (trigger met) | Promote — move to INBOX for brainstorm |
| 7 | Spec | Spec {N} (appears complete) | Run `/review {N}` |
| 8 | Spec | Spec {N} (4+ weeks in progress) | Re-evaluate scope |
| 9 | Dependency | Circular: {A} ↔ {B} | Fix now |
| 10 | Design doc | "{filename}" (specified) | Delete |
| 11 | Plan | "{filename}" (orphaned) | Delete |
| 12 | Worktree | "{path}" (merged) | Remove |
| 13 | Branch | "build/{name}" (merged) | Delete |

### Cross-Spec Patterns (if any)

| # | Pattern | Seen In | Recommended |
|---|---------|---------|-------------|
| 14 | {description} | Specs {list} | Add rule to CLAUDE.md |
| 15 | {description} | Specs {list} | Promote to spec |

*Patterns are informational — they highlight systemic issues across multiple specs. Address them to prevent the same findings from recurring.*

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

Execute each approved action per the Action Vocabulary. Every action must be atomic — complete all its execution steps or none.

### Deletes

Remove entries from their source file (`specs/INBOX.md`, `specs/DEFERRED.md`, design docs, plans, worktrees, branches).

### Defers

1. Add entry to `specs/DEFERRED.md` with `**Deferred:** {date} | **From:** {source} | **Trigger:** {condition}`
2. Remove from source file

### Merges

1. Read the target spec file
2. Integrate the merged scope into the spec's existing structure:
   - Add new items to the **Deliverables** checklist
   - Add new assertions to **Acceptance Criteria**
   - Update **Technical Approach** if the merge adds architectural decisions
   - Add to **Gotchas** if the merged item has caveats
3. Update the spec's `Last Updated` date
4. Remove from source file (INBOX or DEFERRED)

### Promotes

Tag the INBOX entry with `**Promoted:** {date} — awaiting brainstorm`. Do NOT remove from INBOX.

For deferred items being promoted: move the entry to INBOX with the `**Promoted:**` tag, then remove from DEFERRED.md.

### Other actions

- Update `specs/INDEX.md` if specs were merged, split, or removed
- Remove worktrees with `git worktree remove {path}`, delete branches with `git branch -d {name}`

## Step 7.5: Verify Execution

After all actions are applied, verify every decision was fully executed. Present a verification checklist:

```markdown
### Verification

- [x] Deleted: "{title}" — removed from INBOX
- [x] Deferred: "{title}" — in DEFERRED.md (trigger: {condition}), removed from INBOX
- [x] Merged: "{title}" → Spec {N} — integrated into Deliverables/AC, removed from INBOX
- [x] Promoted: "{title}" — tagged in INBOX, still present
- [ ] FAILED: "{title}" — {what went wrong}
```

If any verification fails, fix it before committing. Do not commit partial state.

Commit with a message summarizing the tidy-up.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Deleting specs without checking if they're implemented | Always scan the codebase first — the spec may be partially or fully built |
| Promoting INBOX items directly to specs without brainstorming | Brainstorming catches assumptions that skip straight to implementation |
| Keeping everything "just in case" | Stale items create noise and slow down `/claude-tweaks:help` |
| Presenting items one-at-a-time for individual decisions | Scan silently, present one batch report, let the user approve all or override specific items. Per-item prompts scale badly. |
| Removing INBOX items marked as "Promote" | Promoted items stay in INBOX until a spec file exists. The INBOX entry is the tracking artifact — removing it drops the item on the floor. |
| Appending a "Merged Scope" section to a spec | Merged content must be integrated into existing Deliverables, Acceptance Criteria, and Technical Approach. Appendix sections create second-class content that `/write-plan` may miss. |
| Committing without running verification | Always verify every action landed (Step 7.5) before committing. Partial execution creates orphaned or lost items. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | Feeds the INBOX that /claude-tweaks:tidy audits |
| `/claude-tweaks:specify` | /claude-tweaks:tidy flags unspecified design docs for /claude-tweaks:specify. /claude-tweaks:specify Step 6 removes promoted items from INBOX after creating the spec |
| `/claude-tweaks:review` | /claude-tweaks:tidy flags specs that appear complete but lack review |
| `/claude-tweaks:wrap-up` | /claude-tweaks:tidy flags reviewed specs that need wrap-up |
| `/claude-tweaks:help` | /claude-tweaks:help suggests /claude-tweaks:tidy when maintenance signals are detected |
| `/claude-tweaks:review` | /claude-tweaks:tidy scans review summaries for cross-spec patterns (recurring findings, flagged files) |
| `/claude-tweaks:wrap-up` | /claude-tweaks:tidy scans wrap-up reflections for cross-spec patterns (recurring gotchas, deferred themes) |
| `specs/DEFERRED.md` | /claude-tweaks:tidy audits deferred items — promotes, merges, moves to INBOX, or deletes |
| `/claude-tweaks:build` | /claude-tweaks:tidy cleans up leftover worktrees and `build/*` branches from previous builds |
