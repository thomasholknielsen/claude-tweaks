---
name: claude-tweaks:wrap-up
description: Use when /claude-tweaks:review passes and you need to capture learnings, clean up specs/plans, update skills, and decide next steps. The lifecycle closure step.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Wrap-Up — Capture learnings, clean up, and close the lifecycle

Post-review reflection, knowledge capture, and lifecycle cleanup. Part of the workflow lifecycle:

```
/claude-tweaks:init → /claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:stories → /claude-tweaks:test → /claude-tweaks:review → [ /claude-tweaks:wrap-up ]
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

Run `/claude-tweaks:reflect` in **full** mode. Pass:
- **Scope** — files changed during this work
- **Ledger phase** — `wrap-up`
- **Seed context** — review summary (Key Learnings section), tradeoffs accepted

The reflect skill handles all four reflection lenses (Surprises, Hindsight, Near-misses, Fresh start), the tradeoff review, insight routing, and ledger writes. See `/claude-tweaks:reflect` for details.

If any insight is "Implement now", /reflect handles it before returning control. Proceed after all insights are resolved.

---

## Step 4: Analyze Leftover Work (spec-based only)

Identify unfinished spec sections that cannot be completed in the current work context, then route them per `leftover-routing.md` in this skill's directory — which owns the fix-exhaust qualification criteria, the auto-mode stage entry format, the interactive routing table (5 routing options), and the per-item routing semantics.

---

## Step 5: Plan Cleanup Actions

This step **plans** the cleanup — it does not execute. Actual deletions and archival run in Step 10 *after* the nothing-left-behind gate (Step 8.5) and the Review Console / batch decision (Step 8.6 or Step 9) approve them.

See `cleanup-procedures.md` in this skill's directory for the canonical cleanup list — Step 5 enumerates the same 8 items: execution plans, ledger, design caches, pipeline run dir, worktree, spec lifecycle, ephemeral dev server, issue claim release. Filter the list to rows whose Condition holds for this run (e.g., skip the worktree row when no worktree strategy was used). Carry the filtered list forward into Step 9's summary and Step 10's execution.

## Step 6: Assess Configuration Updates

> **Batch collection.** Step 6 collects potential documentation, CLAUDE.md/rules, and decision-record updates in a single pass across three sub-scans (Documentation, CLAUDE.md and Rules, Decision Records). No decisions are made here — everything is presented together in Step 9 for batch approval. Skill updates are handled separately in Step 7.

> **Parallel execution:** Run all three sub-scans (documentation, CLAUDE.md/rules, decision records) as parallel tool calls — each checks independent sources and collects findings in the `[type] target — change` format.

### 6.1: Documentation

> **Parallel execution:** Read `docs/REGISTRY.md` and all doc files referenced in it as parallel Read calls.

Check if the work requires updates to project documentation, using the doc registry as a guide:

1. **Registry-guided check** — Read `docs/REGISTRY.md`. For each entry:
   - Match Auto-detect patterns against all files changed in this work (`git diff --name-only`)
   - If matched: check if `/build` Step 6.5 already updated this doc (look for doc commits in git log)
   - If not yet updated: read the doc, assess whether it needs changes
2. **Non-registry docs** — Also check setup guides, architecture references, API documentation, and ADRs as before (catches docs not yet in the registry, or projects without a registry)
3. **Registry maintenance** — Check if:
   - New docs were created during this work (e.g., ADR for a significant decision) → propose adding to registry
   - Existing docs were deleted or moved → propose removing/updating registry entries
   - Auto-detect patterns need adjustment (directories renamed, new code areas)

→ Collect each needed update as: `[doc] {file} — {what to add/change}`
→ Collect registry updates as: `[registry] {action} — {detail}`

Registry updates are included in the Step 9 consolidated batch table alongside other config changes.

### 6.2: CLAUDE.md and Rules

CLAUDE.md describes **how to work in this codebase** — patterns to follow, commands to run, conventions to respect, mistakes to avoid. Every update must describe something that exists and is actively used, not aspirational improvements.

Check if the work introduced project-wide conventions:
1. New commands or scripts (verify they exist and work)
2. New naming conventions or patterns (observed, not aspirational)
3. New don'ts — anti-patterns discovered during this build that are guardrails for existing patterns, not wishes for missing infrastructure
4. Stack changes (new dependencies actually added)
5. Path-scoped rules for `.claude/rules/`

Before adding to CLAUDE.md, check the size budget — keep it concise. Move detailed content to skills or rules. Route improvement ideas to INBOX, not CLAUDE.md.

→ Collect each needed update as: `[claude.md] {section} — {what to add/change}` or `[rule] {path scope} — {convention}`

### 6.3: Decision Records (ADRs)

Capture the *why* behind significant decisions made during this work — distinct from `decisions.md` (the per-run auto-decision audit log) and the spec (which records *what*). Apply the **3-factor gate** from `_shared/decision-records.md` (read it for the gate, the location convention, and the template).

1. **Gather decision candidates** from this work's surfaces:
   - `[ADR-candidate]`-tagged constraints in the brainstorming brief (flagged by `/claude-tweaks:challenge`)
   - Architectural deviations classified in `/build` Common Step 4.5
   - Interface trade-offs flagged `[ADR-candidate]` by `/claude-tweaks:deepen`
   - Tradeoffs accepted during `/review` and reflection insights about approach
2. **Run the 3-factor gate** on each candidate — write an ADR only when ALL THREE hold: **hard to reverse** AND **surprising without context** AND **the result of a real trade-off**. If any factor is missing, do not propose an ADR (the decision belongs in the spec, a code comment, or nowhere).
3. For each decision that passes, propose creating `docs/decisions/NNNN-{slug}.md` using the template in `_shared/decision-records.md` (find the highest existing `NNNN` and increment).

→ Collect each as: `[adr] docs/decisions/NNNN-{slug}.md — {decision title}`

ADR proposals are routed through the Step 9 batch table / Review Console alongside other configuration updates — never written silently. Most wrap-ups produce **zero** ADRs; that is correct. ADRs are valuable because they are rare.

---

## Step 7: Skill Curation

Analyze whether project skills need updating, and whether the work warrants a **new** skill — based on what was built. This step runs standalone (not batched with Step 6) because it requires reading and comparing full skill files — a heavier weight of analysis.

Unlike a pure consumer, Step 7 **generates** candidates from the work itself. Ledger entries (`build/skill`, `review/skill`, `[skill: …]`-tagged) and reflection insights are **seeds** that focus the analysis — but an independent, domain-scoped scan inspects the skills whose domain overlaps the changed files **even when nothing was tagged**, and gap detection looks for reusable patterns no skill covers. New-skill candidates are proposed when **≥2 of 3** criteria (reusability, complexity, project-specificity) are met — not all three.

For the full procedure — seed gathering (7.1), the independent scan + gap detection (7.2), the 6-dimension analysis (7.3), the ≥2-of-3 new-skill gate (7.4), quality gates (7.5), and auto/interactive stage-or-present (7.6) — read `skill-curation.md` in this skill's directory.

Skill curation declares "No skill updates needed" only when seeds, the independent scan, and gap detection all come up empty — never merely because no ledger entry was tagged. Staged updates and new-skill candidates surface at the Wrap-Up Review Console (Step 8.6), or the interactive batch table per `skill-curation.md`.

## Step 8: Analyze Next Steps (spec-based only)

Determine:
1. **Newly unblocked specs** — what can now be worked on?
2. **Parallel opportunities** — which specs have no dependencies?
3. **Recommended next spec** — based on dependencies and logical flow

Suggest running `/claude-tweaks:help` to see the full workflow status.

---

## Step 8.5: Nothing Left Behind (Gate)

Run the resolve gate from `/claude-tweaks:ledger` (see ledger skill for the three-phase procedure: Phase 1 fix-exhaust silently → Phase 2 present remainder for per-item user decision → Phase 3 apply). If the ledger doesn't exist (standalone wrap-up, or work predating the ledger), skip this gate.

**Hard requirements:**

- Phase 1 must run before any user-facing output. The agent fixes everything that qualifies for fix-now, commits, then presents only the genuine residue.
- Phase 2 always requires explicit per-item user input for `fix` / `defer` / `accept` decisions. Status `acknowledged` (informational, e.g., ops items the user has read) may be applied in bulk via a single explicit "I've read every item" choice. Never bulk-resolve `fix` / `defer` / `accept`. Never assume "obvious" defers. Never offer a "Fix all (Recommended)" or "Defer all" shortcut — those bias the user toward whichever bulk action is easier to type.
- `auto` mode does NOT silence this gate.
- Both `specs/DEFERRED.md` and `specs/INBOX.md` are valid routing destinations, but every individual entry requires an explicit per-item user choice — neither file is ever written autonomously.

### Bulk-resolve fast path (terminal-status only)

The fast path applies **only when every ledger item already has terminal status** (`fixed`, `deferred`, `accepted`, `acknowledged`, `observation`) at gate entry. If a single item has status `open`, the fast path does NOT apply — Phase 1 → Phase 2 → Phase 3 must run in full sequence without exception. When the fast path applies, report: "All {N} ledger items resolved. No open items." and proceed to Step 9.

Phase 2 is on the "What `auto` does NOT silence" list in `_shared/auto-mode-contract.md` — it is never skipped, regardless of `auto` state, when any `open` item exists.

### Ops acknowledgment (when ops items exist)

Ops items represent infrastructure changes the user needs to action post-merge — bulk-acknowledging them risks the user not reading them. Present each item, and require explicit confirmation rather than offering a `(Recommended)` shortcut:

```
The following ops items need acknowledgment. These represent infrastructure changes you need to action post-merge — read each one before choosing:

| # | What | Where |
|---|------|-------|
| 1 | {description} | {source} |

1. I've read every item — acknowledge all
2. I have questions about specific items — show details
```

After choice 1, update status to `acknowledged` for every item. After choice 2, surface each item with full detail and ask per item.

---

## Step 8.6: Wrap-Up Review Console (back-loaded review)

The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). Runs in `auto` or `hybrid` mode when a pipeline run directory exists. Skipped in `interactive` mode and in standalone wrap-up. Reads `decisions.md`, `staged/`, and `config.yml` from the run directory, then presents one consolidated batch table with up to six sections (Auto-applied / Pending review / Low-confidence findings / Contested findings / Skill updates / Configuration updates) and three actions (Approve all / Override / Stop). The two coordination-derived sections (Low-confidence findings, Contested findings) render only when non-empty.

**Multi-spec defer:** when `MULTISPEC_REVIEW_DEFER=1` is set by `/flow` multi-spec orchestration, skip the per-spec console — the consolidated end-of-run console at `/flow` handles all approvals across every spec in the run. Leave `staged/` and `decisions.md` untouched, append a "deferred" log entry, and proceed to Step 9.

Empty-console fast path: if `decisions.md` has zero entries AND `staged/` is empty AND no skill/config updates exist, skip the console entirely and proceed to Step 9.

For the run-directory resolution sequence, the multi-spec defer protocol, the full console template with all six section tables (including the conditionally-rendered Low-confidence and Contested findings sections), approval/override/stop semantics, and the sort-order requirement, read `review-console.md` in this skill's directory.

---

## Step 9: Present Consolidated Summary

```
## Wrap-Up: Spec {number} — {title}

### Reflection Insights
1. {insight} → {destination}
(or: No significant insights.)

### Implementation Status
- {section}: {status}
Overall: {X}% complete

### Cleanup Actions (planned in Step 5; executed in Step 10)
See `cleanup-procedures.md` for the canonical cleanup list. Render only rows whose Condition holds (e.g., no worktree, no design caches). Under `MULTISPEC_REVIEW_DEFER=1`, items marked deferred in `cleanup-procedures.md` are skipped here too.
- [ ] Leftover work: {recommendation}

### Configuration Updates (from Step 6)
| # | Type | Target | Change |
|---|------|--------|--------|
| 1 | {doc/claude.md/rule/adr} | {target} | {what to add/change} |
| 2 | ... | ... | ... |
(or: No configuration updates needed.)

### Manual Steps Required
| # | What | Where | Status |
|---|------|-------|--------|
| 1 | {description} | {source} | Acknowledged |
(or: No manual steps — nothing to do outside the codebase.)

> Complete these after merging.

### Skill Updates
Resolved in Step 7 — {N} updates applied / 0 updates needed.

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Deleted spec `specs/{N}.md` | — |
| Operational | Updated `specs/INDEX.md` | `{hash}` |
| Operational | Deleted plans `docs/plans/{files}` | — |
| Operational | Deleted ledger | — |
| Operational | Deleted design wrapper caches (`*-audit.json`, `*-recommendations.json`, `*-declined.json`) | — |
| Operational | Removed worktree `{path}`, deleted branch `{branch}` | — |
| Ledger fix | {item} ({phase}) — {resolution} | `{hash}` |

Generate from: cleanup actions in Step 10, config/skill updates applied, ledger items resolved in Step 8.5, and, when present, the run dir's `events.jsonl` (hook-recorded commit breadcrumbs — hash reflects HEAD at hook time, not verified against commit success — and contract violations).

(Next Actions are rendered as a top-level section after Step 10 — see `## Next Actions` below. Do NOT render them here in the per-spec summary template.)
```

**Conditional batch decision** — only present when the Wrap-Up Review Console (Step 8.6) did NOT run:

- **Step 8.6 ran** (`auto` or `hybrid` mode with a pipeline run directory) → cleanup + config items were already approved at the Review Console. Skip this batch table and proceed to Step 10 execution. Rendering a second batch table here duplicates the Review Console and violates the "one decision per message" + bookend ("at most two stops in auto") promises.
- **Step 8.6 was skipped** (interactive mode, standalone wrap-up, or empty-console fast path) → present the batch decision below.

Render the cleanup rows from `cleanup-procedures.md`'s canonical list (filtered by Condition), followed by configuration update rows from Step 6:

```
| # | Type | Action | Details |
|---|------|--------|---------|
| 1 | cleanup | {row from cleanup-procedures.md canonical list} | {details} |
| ... | cleanup | ... | ... |
| N | config | {doc/claude.md/rule/adr} | {what to add/change} |

1. Apply all **(Recommended)**
2. Override specific items (tell me which #s to change)
```

If the user chooses to override, let them pick which items to skip or change.

After presenting the summary, output an explicit closure line:

```
Work archived. Spec {N}, its plans, and ledger have been deleted. The code and learnings remain.
```

This signals clearly that the lifecycle is complete — there's nothing left to do for this spec.

Next Actions are rendered as a top-level `## Next Actions` section after Step 10's verification — see the section near the end of this file. They replace the old single-line handoff with a context-signal-driven table.

## Step 10: Execute Approved Actions

Execute the cleanup planned in Step 5 (canonical list in `cleanup-procedures.md`) plus the configuration / skill updates approved at the Review Console (Step 8.6) or batch decision (Step 9). The 6 cleanup items, in execution order, are defined in `cleanup-procedures.md`'s canonical list — do not re-enumerate here. Filter rows by Condition.

**MULTISPEC_REVIEW_DEFER branch:** When `$MULTISPEC_REVIEW_DEFER=1` is set, Step 10 SKIPS the state-changing cleanups marked deferred in `cleanup-procedures.md` (items 3 Design caches, 4 Pipeline run dir archival, 5 Worktree removal). Those defer to `/flow`'s consolidated multi-spec Review Console at end-of-run, which has authority to apply or override them across all specs in the run. Step 10 still executes the idempotent cleanups (items 1 Execution plans, 2 Open items ledger, 6 Spec lifecycle + INDEX) — those do not interact with parent-orchestrated cleanup.

After the cleanup, also apply:

- **Documentation, CLAUDE.md, rules** — apply the registry / doc / rule edits collected in Step 6 and approved at the Console or batch
- **Decision records (ADRs)** — write the approved `docs/decisions/NNNN-{slug}.md` files (Step 6.3) using the template in `_shared/decision-records.md`, and add them to `docs/REGISTRY.md` if a registry exists
- **Skill updates** — apply patches and create new skills (Step 7 staged or approved items)

Commit with a message summarizing the wrap-up actions.

### Verify execution

Before emitting the closure line, confirm every approved action actually ran:

- Spec file deleted (or status updated) — `ls specs/{N}*.md` returns nothing (or `git status` shows the status edit committed)
- INDEX.md updated — `git log -1 --stat specs/INDEX.md` shows this run's commit
- Plans + ledger removed — `ls docs/superpowers/plans/*{spec-slug}* docs/plans/*-ledger.md` returns nothing
- Design caches deleted (when applicable) — no `*-audit.json` / `*-recommendations.json` / `*-declined.json` for this spec remain in `docs/plans/`
- Pipeline run dir archived — `.claude-tweaks/pipelines/{run-id}/` is gone; `.claude-tweaks/pipelines/archive/{run-id}/` exists (skipped when `MULTISPEC_REVIEW_DEFER=1`)
- Worktree removed (worktree strategy) — `git worktree list` no longer shows the feature worktree path

If any approved action did not land, do NOT emit the closure line. Surface the gap (`BLOCKED — cleanup step {N} did not complete: {reason}`) and stop.

## Important Notes

- `/claude-tweaks:review` should have been run before `/claude-tweaks:wrap-up` — this skill assumes code quality is verified
- INDEX.md is forward-looking only — remove completed entries
- Skills document reusable patterns, not one-off implementations
- CLAUDE.md stays concise — use skills, rules, or reference docs for details
- Reflection insights with no clear destination must still be explicitly resolved — the user confirms "don't capture" with a reason, rather than the skill silently dropping them
- **Merge conflicts during wrap-up** (e.g., when merging a worktree feature branch back to main): resolve conflicts by understanding both sides' intent — read both versions, pick the correct merge. Never use `git reset` or `git checkout .` to discard changes. If the conflict involves spec or INDEX.md files being deleted by wrap-up but modified on main, prefer the deletion (the spec is complete).

## Next Actions

When invoked by `/flow` (`$PIPELINE_RUN_DIR` is set), omit this block — the parent `/flow` renders its own Pipeline Summary + Next Actions after Step 9.

When invoked directly by a user (standalone wrap-up), render the table below. Generate 2-4 numbered options based on context signals; always include the "next unblocked spec" option when one exists so the user doesn't have to run `/help` to find it.

| Signal | Option |
|--------|--------|
| Next spec exists (Step 8) | `/claude-tweaks:flow {N}` — full pipeline on spec {N}: "{title}" **(Recommended)** |
| Newly unblocked specs | `/claude-tweaks:build {N}` — spec {N} "{title}" now unblocked |
| Always | `/claude-tweaks:help` — full pipeline status |

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/wrap-up` is running inside a `/flow` pipeline. In that case:
- Omit the `## Next Actions` block at the end of Step 9 — the parent `/flow` renders its own pipeline summary.
- Step 8.6 (Review Console) honors `$MULTISPEC_REVIEW_DEFER` — if set, skip the per-spec console and let `/flow`'s consolidated console handle approvals.

When `$PIPELINE_RUN_DIR` is unset, `/wrap-up` runs standalone — render Next Actions as usual.

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
| Scanning the entire skill library on every wrap-up | Step 7's independent scan is bounded to the ~5 skills whose domain overlaps the changed files (plus seeded skills) — a whole-library audit on every wrap-up wastes effort and produces noise. Domain-scoped scanning is expected; whole-library scanning is the anti-pattern |
| Skipping skill curation because nothing was ledger-tagged | Step 7 generates candidates from the work itself — the independent scan and gap detection run even with zero seeds. Declaring "no skill updates needed" just because no entry was tagged is the failure this step exists to fix |
| Proposing generic skill updates with no concrete anchor | Every skill update must trace to a ledger entry, a reflection insight, or a specific changed-file observation from the independent scan — updates with no anchor are indistinguishable from hallucinated ones |
| Mixing skill updates into the doc/CLAUDE.md batch table | Skill updates require full file reads and Update Mode patches — they get their own decision table in Step 7 |
| Writing an ADR for every decision | ADRs are valuable because they are rare — Step 6.3's 3-factor gate (hard-to-reverse AND surprising AND a real trade-off) keeps them so. Most wrap-ups produce zero ADRs, and that is correct |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:review` | Must pass before /claude-tweaks:wrap-up — handles verification, code review, and simplification. Skill-routed ledger entries from lens 3a (phase `review/skill`) and /reflect hindsight findings tagged `[skill: …]` (phase `review/hindsight`) feed into Step 7 skill analysis. |
| `/claude-tweaks:test` | Indirect dependency — /test passes before /review, which passes before /wrap-up. Open QA ledger entries (`test/qa` phase) carried forward from /test surface in Step 8.5's resolve gate as items requiring per-item user decision. |
| `/claude-tweaks:review` (visual modes) | Visual complement — findings from visual review may feed into wrap-up's reflection lenses |
| `/claude-tweaks:reflect` | Invoked BY /wrap-up (Step 3) in full mode. Handles all four reflection lenses, tradeoff review, insight routing, and ledger writes with phase `wrap-up`. |
| `/claude-tweaks:capture` | /claude-tweaks:wrap-up may create INBOX items for genuinely new ideas discovered during implementation |
| `specs/DEFERRED.md` | /claude-tweaks:wrap-up routes leftover work here (with origin spec, files, trigger) |
| `/claude-tweaks:help` | /claude-tweaks:wrap-up suggests running /claude-tweaks:help to see what's unblocked |
| `/claude-tweaks:tidy` | /claude-tweaks:wrap-up cleans artifacts for a single spec — /claude-tweaks:tidy does periodic bulk cleanup |
| `/claude-tweaks:build` | Runs BEFORE /claude-tweaks:review — produces the code and journeys that wrap-up reflects on. `build/skill` ledger entries from Step 4.5 feed into Step 7 skill analysis (alongside `[skill: …]`-tagged entries from any other phase). |
| `/superpowers:finishing-a-development-branch` | When build used worktree git strategy, wrap-up Step 10 verifies the feature branch was completed (merged, PR created, or discarded), then removes the worktree directory and deletes the merged branch |
| `/claude-tweaks:init` | Step 7 references `skill-template.md` for Update Mode format and quality gates. /wrap-up Step 6 maintains the doc registry created by /init Phase 8.5. |
| `/claude-tweaks:ledger` | Manages the open items ledger. /wrap-up appends reflection insights (Step 3), runs the resolve gate (Step 8.5), plans deletion in Step 5, and executes deletion in Step 10. |
| `/claude-tweaks:design` | /wrap-up plans cleanup of the design wrapper's per-spec caches (`*-audit.json`, `*-recommendations.json`, `*-declined.json` in `docs/plans/`) in Step 5 and executes the deletion in Step 10 alongside the ledger. |
| `/claude-tweaks:flow` | Invoked BY /flow as the pipeline's final step; flow waits for /wrap-up's Review Console (Step 8.6) before archiving the run directory. Multi-spec runs set `MULTISPEC_REVIEW_DEFER=1` so per-spec wrap-ups defer to flow's consolidated console. |
| `/claude-tweaks:deepen` | Interface trade-offs /deepen flags `[ADR-candidate]` are picked up by Step 6.3 and run through the 3-factor gate for possible ADR creation |
| `_shared/decision-records.md` | Canonical 3-factor ADR gate, location convention, and template applied by Step 6.3 |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
| `_shared/issue-claims.md` | Cleanup item 8 (Section E of `cleanup-procedures.md`) releases claims for specs with `recon-issue:` frontmatter, with the branch outcome as the release reason. |
