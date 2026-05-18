---
name: claude-tweaks:tidy
description: Use when the backlog needs hygiene — review stale INBOX items, partially-complete specs, orphaned plans, and overall spec health
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Tidy

Periodic backlog hygiene to keep the spec system healthy. Run when the backlog feels cluttered, before a brainstorming session, or on a regular cadence.

```
/claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
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

## Input

`$ARGUMENTS` is not used by /tidy. The skill scans `specs/INBOX.md`, `specs/DEFERRED.md`, `specs/`, design docs, plans, worktrees, and the doc registry from their canonical locations; an aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments.

## Steps 1-4.6: Scan Everything

> **No decisions during scanning.** Steps 1-4.6 silently collect all findings. Everything is presented as one batch in Step 6 for approval. This replaces the previous per-item decision model.

> **Parallel execution:** Dispatch Steps 1, 1.5, 2, 3, 4, 4.5, and 4.6 as parallel Task agents — each scan is independent (INBOX, Deferred, Specs, Design Docs + Briefs, Plans, Git, Doc Registry). Each agent returns findings in the `[type] item — detail — recommendation` format. Step 3's classification tables are inlined directly into its agent prompt (see Step 3 below) so subagents have everything they need. After parallel scans complete, run Step 5 and Step 5.5 sequentially — they depend on Step 2's spec scan results. Assemble all findings into the Step 6 report.
>
> **Contract:** Each agent follows `_shared/subagent-output-contract.md` — minimal input, status line first, output template inlined verbatim. Model tier: Fast.
>
> **Model tier:** Fast (Haiku) — each scan is a mechanical read of a single data source (INBOX file, DEFERRED file, spec directory, design-doc directory, plan directory, `git worktree list` + branches, REGISTRY). No cross-cutting analysis at the per-scan level; Step 5/5.5 do the synthesis sequentially in the main thread.
>
> **Output template (each agent must follow exactly):**
>
> ```markdown
> OUTPUT FORMAT (required):
> Return ONLY a markdown table, no preamble:
>
> | Severity | Path:Line | Finding | Evidence |
> |---|---|---|---|
> | critical | src/auth.ts:42 | Missing token expiry check | uses `<` not `<=` |
> | medium | src/api.ts:180 | Unhandled rejection | line 184: `await fetch(...)` no try/catch |
>
> Severity scale: critical / high / medium / low / info
> If no findings: return literal text "No findings."
> Do not add narration, headers, or summaries before or after the table.
> ```
>
> Each agent's first reply line must be one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`, then the Template A table verbatim. Agents do not invent a new schema.
>
> **Tidy-specific column semantics (for the dispatcher, not the agents):** when the dispatcher receives Template A rows back from each scan agent, it interprets the four standard columns in this skill's vocabulary — Severity = recommendation urgency (`info` for Keep, `low` for routine cleanup, `medium` for Promote/Merge/Defer, `high` for stale-Delete or registry break); Path:Line = the artifact (`specs/INBOX.md:42`, `specs/DEFERRED.md`, `docs/REGISTRY.md`, worktree path); Finding = `[type] item — short detail` (e.g., `[inbox] "Build redis cache" — 5 weeks old`); Evidence = the recommendation (`Delete — stale` / `Promote — ready for brainstorm` / `Merge → Spec 42`). The dispatcher merges all agents' Template A tables into the Step 6 report using these semantics. **Template A itself is unchanged** — the remapping is purely how the dispatcher reads it.

### Scan steps (data sources + collection format)

Read `scan-procedures.md` in this skill's directory for the full classification tables, age thresholds, and per-step rules. The dispatcher inlines the relevant section into each agent's prompt so subagents have everything they need.

| Step | Data source | Output prefix |
|------|-------------|--------------|
| 1 | `specs/INBOX.md` | `[inbox]` |
| 1.5 | `specs/DEFERRED.md` | `[deferred]` |
| 2 | `specs/INDEX.md` + spec files | `[spec]`, `[dependency]` |
| 3 | `docs/superpowers/specs/*-design.md`, `docs/plans/*-brief.md` | `[doc]` |
| 4 | `docs/superpowers/plans/`, `~/.claude/plans/` | `[plan]` |
| 4.5 | `git worktree list`, `git branch --list "build/*"` | `[git]` |
| 4.6 | `docs/REGISTRY.md` | `[registry]` |
| 5 (sequential, after Step 2) | Specs not yet built | (sizing flags appended to `[spec]` rows) |
| 5.5 (sequential, after Steps 2-4.6) | Recent git history of review/wrap-up commits | `[pattern]`, `[health]` |

Steps 5 and 5.5 require Step 2's spec scan results, so run them sequentially in the main thread after the parallel scans complete.

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

The lifecycle is: INBOX → brainstorm → design doc → specify → spec file. "Promote" means the item is ready to enter that pipeline, but until a spec file exists, the INBOX entry is the only tracking artifact. Removing it creates a gap where the item exists nowhere — decided on but with no durable record. The INBOX entry stays as a pointer until `/claude-tweaks:specify` creates the spec, at which point `/claude-tweaks:specify` Step 8 removes it from INBOX.

### Merge means integrate, not append

When merging an INBOX or deferred item into an existing spec, the merged content must be indistinguishable from original spec content. Add new deliverables to the Deliverables checklist, new assertions to Acceptance Criteria, new architectural notes to Technical Approach, and new caveats to Gotchas. Do NOT create a "Merged Scope" appendix section at the bottom of the spec — that creates second-class content that `/superpowers:writing-plans` may miss or treat differently.

---

## Step 6: Present Tidy Report and Approve

### Auto mode (aggressiveness-based routing)

When a pipeline run directory exists (see `_shared/pipeline-run-dir.md` for the resolution order and bash snippet), read `tidy-aggressiveness` from `config.yml` (default `conservative`).

For each finding, route by recommendation type:

| Recommendation | `conservative` (default) | `moderate` | `aggressive` |
|---|---|---|---|
| **Keep** | Auto (no-op) | Auto (no-op) | Auto (no-op) |
| **Delete** (stale temp files, broken symlinks, marked-as-specified design docs, merged worktrees/branches, orphaned plans whose related spec is complete) | Auto-apply | Auto-apply | Auto-apply |
| **Delete** (any case requiring judgment — old plans whose spec status is unclear, design docs with no specs) | Stage | Auto-apply | Auto-apply |
| **Merge** (INBOX item overlaps existing spec) | Stage | Auto-apply | Auto-apply |
| **Promote** (ready for brainstorm pipeline) | Stage | Stage | Auto-apply |
| **Run `/review {N}`** (spec appears complete) | Stage | Stage | Stage — never auto-run a downstream skill |
| **Fix now** (circular dependencies, registry entries pointing to non-existent files) | Stage | Stage | Stage — fixing requires judgment about which side to keep |
| **Re-evaluate scope** (spec 4+ weeks in progress) | Stage | Stage | Stage — never auto-edit specs |
| **Add rule to CLAUDE.md** (cross-spec patterns) | Stage | Stage | Stage — CLAUDE.md never edited autonomously |

**Log entries:** Write each auto-resolution to `{run-dir}/decisions.md` per `_shared/auto-decision-log.md`. Example entries:
```
AUTO 11:14:32 — Step 6: deleted stale INBOX entry "{title}" (5 weeks old). Reversibility: med (commit {hash}).
STAGED 11:14:35 — Step 6: merge proposal for INBOX "{title}" into spec 42. Stage path: staged/tidy-merge-1.md.
```

Auto-applied items are committed. Staged items surface at the Wrap-Up Review Console for batch approval (`/wrap-up` Step 8.6) when `/tidy` runs as part of a pipeline.

**Standalone auto:** When `/tidy` runs standalone in `auto` mode (no parent pipeline run dir), follow the Standalone auto fallback in `_shared/pipeline-run-dir.md` — create `.claude-tweaks/pipelines/{ISO-timestamp}-tidy-standalone/` with `decisions.md` and `staged/`. The audit log stays on. Apply `tidy-aggressiveness` from CLAUDE.md as the routing key. Present staged items in a Pending Review section at the end of the report (this is the bookend-end for the standalone run; no separate Review Console).

### Interactive mode (batch approval)

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

---

## Step 7: Execute Approved Actions

Execute each approved action per the Action Vocabulary table — that table is the canonical reference for per-action execution rules (remove from source / write to DEFERRED.md / integrate into target spec / tag with `**Promoted:**`). Every action must be atomic: complete all its execution steps or none.

Cross-action housekeeping (apply once per run after all actions execute):

- Update `specs/INDEX.md` if any specs were merged, split, or removed.
- Remove worktrees with `git -C "{REPO_ROOT}" worktree remove {path}`; delete branches with `git -C "{REPO_ROOT}" branch -d {name}` (see Step 4.5 working-directory discipline).

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

## Next Actions

1. `/claude-tweaks:help` — full pipeline status with refreshed counts after the cleanup **(Recommended)**
2. `/claude-tweaks:build {N}` — build the highest-priority ready spec surfaced by the tidy report
3. `/claude-tweaks:specify {topic}` — specify an unspecified design doc surfaced by the audit
4. `/claude-tweaks:review {N}` — review a spec the audit flagged as "appears complete, not reviewed"

## Component-Skill Contract

`/claude-tweaks:tidy` is a **standalone-only** maintenance skill — it is not invoked by any parent skill in the workflow. There is no `PIPELINE_RUN_DIR` signal expected as a caller-side argument (the run dir is only resolved internally for the auto-mode aggressiveness routing in Step 6). The `## Next Actions` block always renders. If a future parent skill ever wraps `/tidy` (e.g., a scheduled hygiene pass inside `/flow`), the parent must update this contract; until then, treat parent invocation as not applicable.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Deleting specs without checking if they're implemented | Always scan the codebase first — the spec may be partially or fully built |
| Promoting INBOX items directly to specs without brainstorming | Brainstorming catches assumptions that skip straight to implementation |
| Keeping everything "just in case" | Stale items create noise and slow down `/claude-tweaks:help` |
| Presenting items one-at-a-time for individual decisions | Scan silently, present one batch report, let the user approve all or override specific items. Per-item prompts scale badly. |
| Removing INBOX items marked as "Promote" | Promoted items stay in INBOX until a spec file exists. The INBOX entry is the tracking artifact — removing it drops the item on the floor. |
| Appending a "Merged Scope" section to a spec | Merged content must be integrated into existing Deliverables, Acceptance Criteria, and Technical Approach. Appendix sections create second-class content that `/superpowers:writing-plans` may miss. |
| Committing without running verification | Always verify every action landed (Step 7.5) before committing. Partial execution creates orphaned or lost items. |
| Auto-running downstream skills like `/review` or `/build` | /tidy never invokes downstream skills autonomously. Recommendations like `Run /review {N}` are staged for the user — they require human judgment about timing and scope. |
| Escalating `git branch -d` to `git branch -D` when delete refuses | `-d` refusing means the branch has unmerged work. Surface as `unmerged — manual review required`; never destructive-delete autonomously. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | Feeds the INBOX that /claude-tweaks:tidy audits |
| `/claude-tweaks:specify` | /claude-tweaks:tidy flags unspecified design docs for /claude-tweaks:specify. /claude-tweaks:specify Step 8 removes promoted items from INBOX after creating the spec |
| `/claude-tweaks:review` | /claude-tweaks:tidy flags specs that appear complete but lack review, and scans review summaries for cross-spec patterns (recurring findings, flagged files) |
| `/claude-tweaks:wrap-up` | /claude-tweaks:tidy flags reviewed specs that need wrap-up, and scans wrap-up reflections for cross-spec patterns (recurring gotchas, deferred themes) |
| `/claude-tweaks:help` | /claude-tweaks:help suggests /claude-tweaks:tidy when maintenance signals are detected |
| `specs/DEFERRED.md` | /claude-tweaks:tidy audits deferred items — promotes, merges, moves to INBOX, or deletes |
| `/claude-tweaks:build` | /claude-tweaks:tidy cleans up leftover worktrees and `build/*` branches from previous builds |
| `/claude-tweaks:init` | /claude-tweaks:tidy Step 4.6 audits doc registry health — flags stale entries, gaps, pattern drift. Suggests `/init update` for tier drift. |
| `/claude-tweaks:ledger` | /ledger creates the per-feature ledger files /tidy scans for stale or orphaned open items during periodic hygiene. /tidy may surface ledgers whose related spec is complete but whose items were never resolved. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. The aggressiveness-routing table in Step 6 (conservative / moderate / aggressive) implements the contract's reversibility/confidence floors for tidy actions. |
| `_shared/pipeline-run-dir.md` | Standalone-auto fallback (Step 6) creates `.claude-tweaks/pipelines/{ts}-tidy-standalone/` with `decisions.md` + `staged/` per this shared procedure. /tidy is on the standalone-auto allowlist. |
| `_shared/subagent-output-contract.md` | Steps 1-4.6 dispatch parallel Task agents per this contract — minimal input, status line first (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`), Template A inlined verbatim. Model tier: Fast. |
