---
name: claude-tweaks:tidy
description: Use when the backlog needs hygiene — review stale INBOX items, partially-complete specs, orphaned plans, and overall spec health
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


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

`$ARGUMENTS` is not used by /tidy. The skill scans `specs/INBOX.md`, `specs/DEFERRED.md` (or `backlog`-labeled GitHub issues, per `backlog-backend` — see `scan-procedures.md` Steps 1/1.5 and 4.8), `specs/`, design docs, plans, worktrees, and the doc registry from their canonical locations; an aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments.

## Steps 1-4.8: Scan Everything

> **No decisions during scanning.** Steps 1-4.8 silently collect all findings. Everything is presented as one batch in Step 6 for approval. This replaces the previous per-item decision model.

> **Parallel execution:** Dispatch Steps 1, 1.5, 2, 3, 4, 4.5, 4.6, 4.7, and 4.8 as parallel Task agents — each scan is independent (INBOX, Deferred, Specs, Design Docs + Briefs, Plans, Git, Doc Registry, Issue Claims, GitHub PRs/Issues). Each agent returns findings in the `[type] item — detail — recommendation` format. Step 3's classification tables are inlined directly into its agent prompt (see Step 3 below) so subagents have everything they need. After parallel scans complete, run Step 5 and Step 5.5 sequentially — they depend on Step 2's spec scan results. Assemble all findings into the Step 6 report.
>
> **Contract:** Each agent follows `_shared/subagent-output-contract.md` — minimal input, status line first, output template inlined verbatim. Model tier: Fast.
>
> **Model tier:** Fast (Haiku) — each scan is a mechanical read of a single data source (INBOX file, DEFERRED file, spec directory, design-doc directory, plan directory, `git worktree list` + branches, REGISTRY, issue-claim refs + comments, gh PR/issue queries). No cross-cutting analysis at the per-scan level; Step 5/5.5 do the synthesis sequentially in the main thread.
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
| 1 | `specs/INBOX.md` (`local-files`) or unsynced-check only (`github-issues` — see Step 4.8) | `[inbox]` / `[unsynced]` |
| 1.5 | `specs/DEFERRED.md` (`local-files`) or unsynced-check only (`github-issues` — see Step 4.8) | `[deferred]` / `[unsynced]` |
| 2 | `specs/INDEX.md` + spec files | `[spec]`, `[dependency]` |
| 3 | `docs/superpowers/specs/*-design.md`, `docs/plans/*-brief.md` | `[doc]` |
| 4 | `docs/superpowers/plans/`, `~/.claude/plans/` | `[plan]` |
| 4.5 | `git worktree list`, `git branch --list "build/*"` | `[git]` |
| 4.6 | `docs/REGISTRY.md` | `[registry]` |
| 4.7 | `gh api git/matching-refs/claims/` + issue comments | `[claim]` |
| 4.8 | `gh pr list` / `gh issue list --label code-health` / `gh issue list --label harness-health` per `_shared/github-pr-scan.md` (`repo-wide` scope) | `[pr]`, `[gh-issue]` |
| 5 (sequential, after Step 2) | Specs not yet built | (sizing flags appended to `[spec]` rows) |
| 5.5 (sequential, after Steps 2-4.8) | Recent git history of review/wrap-up commits | `[pattern]`, `[health]` |

Steps 5 and 5.5 require Step 2's spec scan results, so run them sequentially in the main thread after the parallel scans complete.

---

## Action Vocabulary

Every recommendation in the tidy report uses one of these actions. Each action is atomic — either fully executed or not at all. Do not commit partial state (e.g., removing from INBOX without creating the destination artifact).

| Action | What It Means | Execution | Removes from Source? |
|--------|--------------|-----------|---------------------|
| **Delete** | Item is no longer needed — stale, already implemented, or out of scope | `local-files`: remove entry from source file. `github-issues`: (1) comment explaining why (audit trail — never close silently), (2) `gh issue close {n} --reason "not planned"`. | Yes (file) / issue closes (GitHub) |
| **Defer** | Valid but not timely — park with a trigger condition | `local-files`: (1) add to `specs/DEFERRED.md` with `**Deferred:** {date} \| **From:** {source} \| **Trigger:** {condition}`, (2) remove from source. `github-issues`: (1) build the parked body via `parkedIssuePayload` (origin = the inbox issue's own reference, context carried over, trigger + options considered supplied at triage), write it to a temp file, (2) `gh issue edit {n} --body-file <temp file>`, (3) bootstrap the `parked` label if missing (same check-then-create pattern as `backlog`), then `gh issue edit {n} --add-label parked`, (4) if the trigger names a moment in time, attach a GitHub Milestone: `gh api repos/{owner}/{repo}/milestones --jq '.[].title'` to check existence, `gh api repos/{owner}/{repo}/milestones -f title="{name}"` to create if absent, `gh issue edit {n} --milestone "{name}"` to attach, (5) if the trigger names specific files, pass them as `watchedPaths` to `parkedIssuePayload` in step (1) so the generated body already carries `**Watched paths:**` | Yes (file) / issue stays open, relabeled (GitHub) |
| **Merge** | Scope belongs in an existing spec | Both backends: (1) integrate scope into target spec's **Deliverables**, **Acceptance Criteria**, and **Technical Approach** — not as an appendix, as first-class spec content, (2) update target spec's `Last Updated`. `local-files`: (3) remove from source. `github-issues`: (3) comment naming the target spec (`Merged into spec {N}.`), (4) `gh issue close {n} --reason "not planned"`. | Yes (file) / issue closes (GitHub) |
| **Promote** | Ready for the brainstorm → specify pipeline | `local-files`: tag in INBOX as `**Promoted:** {date} — awaiting brainstorm`. Do NOT remove from INBOX. `github-issues`: no mutation — the open issue is already the durable pointer; recommend `/claude-tweaks:specify #{n}` directly (existing issue-ingestion path). Removing `parked` at promotion (and restoring it on decline) is Phase 3 scope — not yet implemented. | No (file, stays tagged) / No (issue, stays open) |
| **Keep** | No action needed | None | No |
| **Sync to GitHub** | A local `specs/INBOX.md`/`specs/DEFERRED.md` entry exists while `backlog-backend: github-issues` — mirror it to an issue now | INBOX entry: build via `inboxIssuePayload` (category parsed from the entry's `**Category:**` field), bootstrap labels, `gh issue create` with `backlog` + `backlog:category-<value>` labels. DEFERRED entry: judge trigger type live — names files → pass as `watchedPaths`; names a moment in time → build via `parkedIssuePayload` then attach/create a milestone; otherwise carry the prose `**Trigger:**` over unchanged — build via `parkedIssuePayload`, `gh issue create` with `backlog` + `parked` + category labels. Either way: remove the entry from the local file only after `gh issue create` confirms success. | Yes — moves to GitHub, removed from local file |
| **Close (GitHub)** | Open PR or issue is stale or superseded — close it upstream | (1) Comment on the PR/issue explaining why (the comment is the audit trail — never close silently), (2) `gh pr close {n}` / `gh issue close {n}` | N/A — GitHub state |
| **Resolve thread** | Review-thread concern was addressed by a later commit | GraphQL `resolveReviewThread` mutation — only with commit evidence (a commit touching the flagged lines) | N/A — GitHub state |
| **Capture** | PR feedback or GitHub issue needs local follow-up | Add a structured entry to `specs/INBOX.md` referencing the PR/thread/issue URL | No — creates an INBOX entry |

`Capture`, `Close (GitHub)`, and `Resolve thread` are unaffected by `backlog-backend` — they're not part of the backlog-issues design (`docs/superpowers/specs/2026-07-08-backlog-github-issues-design.md`).

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
| **Defer** (`local-files` — pure file move) | Stage | Auto-apply | Auto-apply |
| **Defer** (`github-issues` — label + possible milestone creation, outward-facing) | Stage | Stage | Stage — visible to collaborators; never auto-applied per the auto-mode contract's reversibility floor |
| **Sync to GitHub** (local entry exists under `backlog-backend: github-issues`) | Stage | Stage | Stage — creates GitHub-visible state; never auto-applied per the auto-mode contract's reversibility floor |
| **Delete** (backlog issue, `github-issues` backend — closes a GitHub issue) | Stage | Stage | Stage — visible to collaborators; never auto-applied per the auto-mode contract's reversibility floor |
| **Merge** (backlog issue, `github-issues` backend — closes a GitHub issue) | Stage | Stage | Stage — visible to collaborators; never auto-applied per the auto-mode contract's reversibility floor |
| **Run `/review {N}`** (spec appears complete) | Stage | Stage | Stage — never auto-run a downstream skill |
| **Fix now** (circular dependencies, registry entries pointing to non-existent files) | Stage | Stage | Stage — fixing requires judgment about which side to keep |
| **Re-evaluate scope** (spec 4+ weeks in progress) | Stage | Stage | Stage — never auto-edit specs |
| **Add rule to CLAUDE.md** (cross-spec patterns) | Stage | Stage | Stage — CLAUDE.md never edited autonomously |
| **Close (GitHub) / Resolve thread** (outward-facing GitHub mutations) | Stage | Stage | Stage — visible to collaborators and may trigger notifications; never auto-applied per the auto-mode contract's reversibility floor |
| **Capture** (PR/issue → INBOX entry) | Stage | Stage | Stage — INBOX writes are on the auto-mode contract's never-silenced list |

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
| 6 | Deferred | "{title}" (trigger met) | Promote — ready for brainstorm/specify |
| 7 | Spec | Spec {N} (appears complete) | Run `/review {N}` |
| 8 | Spec | Spec {N} (4+ weeks in progress) | Re-evaluate scope |
| 9 | Dependency | Circular: {A} ↔ {B} | Fix now |
| 10 | Design doc | "{filename}" (specified) | Delete |
| 11 | Plan | "{filename}" (orphaned) | Delete |
| 12 | Worktree | "{path}" (merged) | Remove |
| 13 | Branch | "build/{name}" (merged) | Delete |
| 14 | INBOX (unsynced) | "{title}" — local-only under `backlog-backend: github-issues` | Sync to GitHub |

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
```

Immediately after presenting the report above, call `AskUserQuestion`:

- `question`: `"How do you want to handle these tidy actions?"`, `header`: `"Tidy actions"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply all recommendations shown above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

If "Override specific items" is chosen, the follow-up (#s and target values) is ordinary free-text conversation in the next message, per CLAUDE.md's Multi-item decisions convention — not the tool's built-in `Other` field.

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
- [x] Deferred: "{title}" — in DEFERRED.md (trigger: {condition}), removed from INBOX (`local-files`)
- [x] Deferred: "{title}" — issue #{n} relabeled `parked`{, milestone "{name}" attached} (`github-issues`)
- [x] Synced to GitHub: "{title}" — issue #{n} created ({backlog|backlog+parked} labels), removed from {INBOX.md|DEFERRED.md}
- [x] Merged: "{title}" → Spec {N} — integrated into Deliverables/AC, removed from INBOX
- [x] Promoted: "{title}" — tagged in INBOX, still present
- [x] Captured: "{title}" — added to INBOX with source URL (PR/thread/issue link)
- [x] Closed (GitHub): PR #{n} / issue #{n} — explanatory comment posted, state re-queried as `CLOSED` (`gh pr view {n} --json state` / `gh issue view {n} --json state`)
- [x] Resolved thread: PR #{n} — thread re-queried as `isResolved: true`
- [ ] FAILED: "{title}" — {what went wrong}
```

If any verification fails, fix it before committing. Do not commit partial state.

Commit with a message summarizing the tidy-up.

## Routine Configuration

`/tidy` ships a routine template (`skills/tidy/routine-template.yml`) for unattended backlog hygiene. Instantiate it for the current project with:

```
/claude-tweaks:routine create tidy
```

This resolves the account- and project-specific values a portable template can't hardcode (which environment, which repo) and creates a live cloud Routine via `RemoteTrigger` directly — see `skills/routine/SKILL.md` for the full mechanism. Add `--dry-run` to inspect the assembled configuration before anything is created.

**Unattended execution:** a scheduled firing runs Steps 1-7.5 exactly as an interactive invocation would, except Step 6's Standalone auto fallback takes over in place of the interactive batch-approval prompt — but only when the target project's own CLAUDE.md already sets `auto-mode: default-on` (project policy, not a routine-specific mechanism — see `_shared/auto-mode-contract.md`). A bare scheduled firing (`/claude-tweaks:tidy`, no arguments, no conversation history) has no other way to supply an `auto` mode signal; if the project hasn't configured `auto-mode: default-on`, the routine falls back to interactive and blocks on a batch-approval prompt that will never be answered. When auto-mode is enabled project-wide, safe, atomic actions (stale deletes and cleanly-merged worktree/branch removals) auto-apply per the `conservative` aggressiveness default, and everything requiring judgment is staged to that run's `decisions.md` rather than blocking on input. Nothing is invented here for routines specifically — this is the same Standalone auto path `/tidy` already uses whenever it runs outside a parent pipeline. If Task-based subagent dispatch isn't available in a given cloud routine session, Steps 1-4.8 degrade to running sequentially in the main thread instead of in parallel — same steps, same output, just not parallelized.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

Call `AskUserQuestion`:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Help dashboard (Recommended)"`, `description`: `"/claude-tweaks:help — full pipeline status with refreshed counts after the cleanup"`
- Option 2 — `label`: `"Build {N}"`, `description`: `"/claude-tweaks:build {N} — build the highest-priority ready spec surfaced by the tidy report"`
- Option 3 — `label`: `"Specify {topic}"`, `description`: `"/claude-tweaks:specify {topic} — specify an unspecified design doc surfaced by the audit"`
- Option 4 — `label`: `"Review {N}"`, `description`: `"/claude-tweaks:review {N} — review a spec the audit flagged as \"appears complete, not reviewed\""`

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
| Clearing a local entry before `gh issue create` confirms success | Sync to GitHub writes to GitHub before touching the local file — if the local entry is removed first and the GitHub write fails, the item is lost entirely, not just unsynced. |
| Treating Defer (`github-issues` backend) as a single atomic step | It's a multi-step GitHub-side sequence (body edit → label add → possible milestone attach) with no local file involved — if a later step fails after an earlier one succeeded, the issue is left partially updated. Report exactly which step failed rather than assuming all-or-nothing. |
| Auto-running downstream skills like `/review` or `/build` | /tidy never invokes downstream skills autonomously. Recommendations like `Run /review {N}` are staged for the user — they require human judgment about timing and scope. |
| Escalating `git branch -d` to `git branch -D` when delete refuses | `-d` refusing means the branch has unmerged work. Surface as `unmerged — manual review required`; never destructive-delete autonomously. |
| Closing a PR/issue without a comment | Silent closes destroy the audit trail and confuse collaborators. Comment first, then close — the comment is the record of why. |
| Resolving review threads without commit evidence | Resolving unaddressed feedback is worse than leaving it open — the concern disappears without being fixed. Evidence means a commit touching the flagged lines. |

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
| `/claude-tweaks:code-health` | `/code-health` files improvement findings as `code-health`-labelled GitHub issues; `/tidy` Step 4.8 audits them — stale/superseded issues are closed (with comment) after batch approval, still-valid ones suggested for `/flow --from-code-health` or captured to INBOX. |
| `/claude-tweaks:harness-health` | `/harness-health` files skill/rule/CLAUDE.md drift findings as `harness-health`-labelled GitHub issues; `/tidy` Step 4.8 audits them alongside code-health issues — stale/superseded ones closed after batch approval, still-valid ones suggested for direct application or re-judging. |
| `/claude-tweaks:routine` | `/routine create tidy` instantiates tidy's `routine-template.yml` into a live, scheduled cloud Routine — the mechanism behind this skill's own "Routine Configuration" section. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. The aggressiveness-routing table in Step 6 (conservative / moderate / aggressive) implements the contract's reversibility/confidence floors for tidy actions. |
| `_shared/pipeline-run-dir.md` | Standalone-auto fallback (Step 6) creates `.claude-tweaks/pipelines/{ts}-tidy-standalone/` with `decisions.md` + `staged/` per this shared procedure. /tidy is on the standalone-auto allowlist. |
| `_shared/subagent-output-contract.md` | Steps 1-4.8 dispatch parallel Task agents per this contract — minimal input, status line first (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`), Template A inlined verbatim. Model tier: Fast. |
| `_shared/issue-claims.md` | Step 4.7 sweeps `refs/claims/*` for stale and orphaned claims per this contract — release only after batch approval, never autonomous. |
| `_shared/github-pr-scan.md` | Step 4.8 sweeps open PRs, code-health issues, and harness-health issues per this shared procedure (`repo-wide` scope) — detection ladder, staleness thresholds, findings table, severity mapping |
