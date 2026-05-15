---
name: claude-tweaks:wrap-up
description: Use when /claude-tweaks:review passes and you need to capture learnings, clean up specs/plans, update skills, and decide next steps. The lifecycle closure step.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Wrap Up

Post-review reflection, knowledge capture, and lifecycle cleanup. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → [ /claude-tweaks:wrap-up ]
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

Same fix-exhaust-first discipline as the resolve gate (Step 9.5): attempt to complete unfinished spec sections in this pipeline before proposing routing. Only sections that genuinely cannot be completed in the current work context get presented for routing.

A section qualifies for "finish now" if **all** of these hold:
- Localized changes (typically ≤5 files)
- No dependency on functionality not yet built in this pipeline
- No required user product/design decisions
- No required external state

Finish qualifying sections silently, commit, then present only the residue.

### Auto mode (policy lookup)

When the pipeline run directory exists (`PIPELINE_RUN_DIR` env var or matching dir in `.claude-tweaks/pipelines/`), read `leftover-default` from `config.yml`. Per the Manifesto default (`defer`), each residue section:

1. **Auto-stage** a routing proposal to `staged/wrap-up-leftover-{N}.md` describing the section, the recommended destination (per policy), and the trigger context
2. **Log entry** to `decisions.md`:
   ```
   STAGED 15:02:18 — Step 4: section "{name}" cannot finish now ({blocker}). Recommended: {leftover-default} → {destination}. Stage path: staged/wrap-up-leftover-{N}.md.
   ```
3. Do NOT write to `specs/DEFERRED.md` or `specs/INBOX.md` autonomously — those writes happen at the Wrap-Up Review Console (Step 9.6) after explicit user approval

The Review Console surfaces each staged leftover as a row in the "Pending review" table. User approval there triggers the actual file writes.

### Interactive mode (per-item user input)

For each unfinished section that genuinely cannot be finished, present a numbered table and **wait for explicit per-item user input**:

```
| # | Section | Status | Why not finish now | Choices |
|---|---------|--------|--------------------|---------| 
| 1 | {section} | partial | {specific blocker} | 1: merge to spec X / 2: DEFERRED.md / 3: INBOX / 4: drop / 5: finish now |
```

Routing options:
1. **Merge into an existing spec** — work fits naturally into another spec's scope
2. **Add to `specs/DEFERRED.md`** — work needs its own context (include origin spec, files, trigger)
3. **Create a new INBOX item** — genuinely new idea discovered during implementation, not part of this spec's planned scope
4. **Drop entirely** — no longer relevant
5. **Finish now** — agent attempts completion in this pipeline (returns to fix-exhaust)

Wait for per-item response. Do not bulk-route. Both `specs/DEFERRED.md` and `specs/INBOX.md` are valid destinations and the user picks per item — but no entry is written to either file without explicit per-item confirmation. Rough guidance: DEFERRED.md fits sections with a clear trigger; INBOX.md fits captured ideas without a specific trigger yet.

---

## Step 5: Clean Up Artifacts

### Execution Plans

Search `docs/superpowers/plans/` for plan files related to this spec → **delete them**.

Note: Design docs (`*-design.md`) in `docs/superpowers/specs/` should already have been deleted by `/claude-tweaks:specify`. If any are found, delete them now.

### Auto-Generated Plans

Search `~/.claude/plans/` for related plans → **delete them**.

### Open Items Ledger

Delete the open items ledger using the ledger skill's delete operation (see `/claude-tweaks:ledger`). All items must have been resolved by the nothing-left-behind gate (Step 9.5).

### Design wrapper caches (v4.5.0)

Delete the per-spec caches written by `/claude-tweaks:design` alongside the ledger:

- `docs/plans/YYYY-MM-DD-{feature}-audit.json` — written by `review` mode; consumed by `polish`. Stale after the spec ships.
- `docs/plans/YYYY-MM-DD-{feature}-recommendations.json` — written by `survey` mode (via `/flow` pipeline summary). Used to detect declines on re-runs; obsolete once the spec is wrapped up.
- `docs/plans/YYYY-MM-DD-{feature}-declined.json` — written by `/flow` decline detection. Obsolete once the spec is wrapped up.

Resolve each path using the same date+feature prefix as the ledger filename. Glob `docs/plans/*-audit.json`, `*-recommendations.json`, and `*-declined.json` matching the spec slug as a fallback when the ledger filename is unavailable. Missing files are not errors — they mean the spec did not exercise the corresponding mode.

Cleanup is silent — no user prompt. The caches are pipeline state, not user-authored content. Resolves the Phase 2 carry-over open item flagged in `skills/design/SKILL.md` (audit cache cleanup); recommendations + declined caches use the same pattern.

### Pipeline run directory (v4.6.0)

If a pipeline run directory exists for this work (`PIPELINE_RUN_DIR` env var or matching dir in `.claude-tweaks/pipelines/`):

1. Verify the Review Console (Step 9.6) ran and applied/dismissed all staged items
2. Move the run directory to `.claude-tweaks/pipelines/archive/{run-id}/` — this preserves the audit trail (`decisions.md`, `config.yml`, and any skipped staged items) for future reference
3. Skipped staged items remain in the archive; they are NOT silently dropped

Do NOT delete the run directory outright — the auto-decision log is project history (for the user's calibration of project policy), not pipeline state.

If no pipeline run directory exists (interactive mode, or pre-v4.6 pipeline), skip this section silently.

### Git Worktree (worktree strategy only)

If the build used worktree git strategy, clean up the worktree directory:

1. Run `git worktree list` to find worktrees associated with this spec's feature branch
2. Verify the feature branch was completed (merged, PR created, or discarded) via `/superpowers:finishing-a-development-branch`:
   - **Already completed** → proceed to step 3
   - **Not completed** → run `/superpowers:finishing-a-development-branch` now (do not stop and ask the user to run it separately). Present the merge/PR/discard options as the skill normally would. After the branch is completed, proceed to step 3.
3. Remove the worktree: `git worktree remove {path}`
4. If the branch was merged (not kept for PR), delete it: `git branch -d {branch}`

If no worktree exists for this spec, skip this section silently.

## Steps 6 + 8: Assess Configuration Updates

> **Batch collection.** Steps 6 and 8 collect potential documentation and CLAUDE.md/rules updates in a single pass. No decisions are made here — everything is presented together in Step 10 for batch approval. Skill updates are handled separately in Step 7.

> **Parallel execution:** Run both scans (documentation, CLAUDE.md/rules) as parallel tool calls — each checks independent sources and collects findings in the `[type] target — change` format.

### 6: Documentation

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

Registry updates are included in the Step 10 consolidated batch table alongside other config changes.

### 8: CLAUDE.md and Rules

CLAUDE.md describes **how to work in this codebase** — patterns to follow, commands to run, conventions to respect, mistakes to avoid. Every update must describe something that exists and is actively used, not aspirational improvements.

Check if the work introduced project-wide conventions:
1. New commands or scripts (verify they exist and work)
2. New naming conventions or patterns (observed, not aspirational)
3. New don'ts — anti-patterns discovered during this build that are guardrails for existing patterns, not wishes for missing infrastructure
4. Stack changes (new dependencies actually added)
5. Path-scoped rules for `.claude/rules/`

Before adding to CLAUDE.md, check the size budget — keep it concise. Move detailed content to skills or rules. Route improvement ideas to INBOX, not CLAUDE.md.

→ Collect each needed update as: `[claude.md] {section} — {what to add/change}` or `[rule] {path scope} — {convention}`

---

## Step 7: Skill Update Analysis

Analyze whether project skills need updating based on what was built. This step runs standalone (not batched with Steps 6 + 8) because skill updates require reading and comparing full skill files — a different weight of analysis.

### 7.1: Gather Inputs

1. Read ledger entries with phase `build/skill` and `review/skill`
2. Check reflection insights (Step 3) tagged for skill destinations
3. List all skill files in `.claude/skills/`
4. Identify **relevant skills** — those referenced by ledger entries, targeted by reflection insights, or in the domain of changed files
5. Read relevant skill files in full

If no ledger entries, no reflection insights targeting skills, and no relevant skills identified → state "No skill updates needed" and proceed to Step 8 (already complete from the parallel pass above).

### 7.2: Analyze Each Relevant Skill

Compare each relevant skill against what the build actually did. Check across 6 dimensions:

| Check | Question |
|-------|----------|
| **Pattern accuracy** | Do the skill's Key Patterns still match how the codebase works? |
| **Convention drift** | Do Project Conventions reflect current practice, or has the build diverged? |
| **Missing patterns** | Did the build introduce patterns that belong in this skill but aren't documented? |
| **Stale examples** | Do code examples still exist at the referenced file paths? |
| **Anti-pattern gaps** | Did the build reveal new anti-patterns worth documenting? |
| **Decision framework completeness** | Does the Decision Framework cover the choices made during this build? |

For each needed change, produce a patch in `/claude-tweaks:init`'s Update Mode format (read `skill-template.md` in the `/claude-tweaks:init` skill's directory for the format):

```
### Edit {N}: {description}
**Section:** {section name}
**Action:** Replace / Add / Remove
**Current:** `{current text or "N/A" for additions}`
**Proposed:** `{new text}`
**Reason:** {what changed — cite the specific build/review observation}
```

### 7.3: Identify New Skill Candidates

Evaluate patterns from `[skill: NEW — {name}]` ledger entries and reflection insights that don't fit existing skills. A new skill is warranted only when **all three** criteria are met:

1. **Reusability** — the pattern applies to 2+ future builds (not a one-off)
2. **Complexity** — the pattern is non-obvious (simple conventions belong in CLAUDE.md)
3. **Project-specific** — the pattern is specific to this project (not generic best practice)

For approved candidates, note the skill name and scope — the actual skill file is created during Step 11 execution.

### 7.4: Quality Check

Verify each proposed update against the quality gates from `skill-template.md` in the `/claude-tweaks:init` skill's directory:

- [ ] Every code example is adapted from actual codebase patterns (not generic)
- [ ] File paths referenced actually exist
- [ ] Commands referenced actually work
- [ ] Conventions described match what the codebase actually does
- [ ] No generic advice that adds no project-specific value
- [ ] Anti-patterns cite project-specific reasons, not textbook warnings

Discard any proposed update that fails these gates. Note what was discarded and why.

### 7.5: Stage or Present Skill Updates

**Auto mode (pipeline run dir exists):**

For each proposed change:

1. Classify as **additive** (new examples, new anti-patterns, new section appended) or **restructural** (changing existing wording, moving content, renaming sections, splitting/merging skills)
2. **Additive + reversibility:high + confidence:high** → auto-apply now. Commit. Log entry:
   ```
   AUTO 14:52:24 — Step 7.5: applied additive update to {skill}/SKILL.md ({section}). Commit: {hash}.
   ```
3. **Restructural OR confidence:med-low** → stage as `staged/wrap-up-skill-{N}.md` containing the Update Mode patch. Log entry:
   ```
   STAGED 14:52:31 — Step 7.5: skill update proposed for {skill}/SKILL.md ({section}). Stage path: staged/wrap-up-skill-{N}.md.
   ```
4. **New skill candidates** (Step 7.3) → always stage (creating a new skill is a structural decision). Log entry:
   ```
   STAGED 14:52:38 — Step 7.5: new skill candidate "{name}". Stage path: staged/wrap-up-skill-new-{name}.md.
   ```

Staged items surface at the Wrap-Up Review Console (Step 9.6) as rows in the "Skill updates" section. Do not present a separate batch decision here.

(Or: "No skill updates needed." if Steps 7.1-7.3 found nothing.)

**Interactive mode:** Present the dedicated batch decision table:

```
### Skill Updates

| # | Skill | Section | Change | Source |
|---|-------|---------|--------|--------|
| 1 | {skill name} | {section} | {change description} | {ledger entry or reflection insight} |
| 2 | {skill name} | {section} | {change description} | {source} |
| 3 | NEW: {name} | — | Create new skill | {source} |

1. Apply all **(Recommended)**
2. Override specific items (tell me which #s to change)
```

Below the table, show the full Update Mode patches for each row so the user can see exactly what will change.

**Wait for resolution before proceeding to Step 9** (interactive mode only).

## Step 9: Analyze Next Steps (spec-based only)

Determine:
1. **Newly unblocked specs** — what can now be worked on?
2. **Parallel opportunities** — which specs have no dependencies?
3. **Recommended next spec** — based on dependencies and logical flow

Suggest running `/claude-tweaks:help` to see the full workflow status.

---

## Step 9.5: Nothing Left Behind (Gate)

Run the resolve gate from `/claude-tweaks:ledger` (see ledger skill for the three-phase procedure: Phase 1 fix-exhaust silently → Phase 2 present remainder for per-item user decision → Phase 3 apply). If the ledger doesn't exist (standalone wrap-up, or work predating the ledger), skip this gate.

**Hard requirements:**

- Phase 1 must run before any user-facing output. The agent fixes everything that qualifies for fix-now, commits, then presents only the genuine residue.
- Phase 2 always requires explicit per-item user input. Never bulk-resolve. Never assume "obvious" defers. Never offer a "Fix all (Recommended)" or "Defer all" shortcut — those bias the user toward whichever bulk action is easier to type.
- `auto` mode does NOT silence this gate.
- Both `specs/DEFERRED.md` and `specs/INBOX.md` are valid routing destinations, but every individual entry requires an explicit per-item user choice — neither file is ever written autonomously.

### Bulk-resolve fast path (terminal-status only)

If every ledger item already has terminal status (`fixed`, `deferred`, `accepted`, `acknowledged`, `observation`) at gate entry, report: "All {N} ledger items resolved. No open items." and proceed to Step 10.

This fast path applies **only when zero items are `open` at gate entry**. It is never a justification to skip Phase 2 — items that arrive `open` always go through Phase 1 → Phase 2 → Phase 3.

### Ops acknowledgment (when ops items exist)

Present all `ops` items for acknowledgment:

| # | What | Where |
|---|------|-------|
| 1 | {description} | {source} |

1. Acknowledge all **(Recommended)** — I've noted these and will handle them
2. I have questions about specific items

After acknowledgment, update status to `acknowledged`.

---

## Step 9.6: Wrap-Up Review Console (back-loaded review)

The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). One consolidated batch table surfaces everything that was auto-decided or staged during the pipeline, plus skill update proposals and leftover-work routing — all the friction that used to live mid-flow now lands here.

**When to run:**

- **`auto` or `hybrid` mode** — always run if a pipeline run directory exists for this work
- **`interactive` mode** — skip; decisions were resolved in-flow

**Locate the pipeline run directory:**

1. Resolve via `PIPELINE_RUN_DIR` env var if set by `/flow`
2. Else find the most recent directory in `.claude-tweaks/pipelines/` whose `spec-slug` matches the current spec
3. Else skip the console (standalone wrap-up, or pre-v4.6 pipeline)

**Read inputs:**

1. `decisions.md` — auto-decision log
2. `staged/` directory — patches and proposals awaiting decisions
3. `config.yml` — the Manifesto answers (for context)

**Present the console:**

```markdown
### Wrap-Up Review Console

The pipeline auto-resolved {N} decisions and staged {M} items for your review. One batch decision below resolves everything.

#### Auto-applied (already in commits — override = revert)

| # | Skill | What | Where | Status |
|---|---|---|---|---|
| 1 | /review | Applied 3 severity:low formatting fixes | commit `def5678` | Applied |
| 2 | /test | Auto-fixed 4 lint failures | commit `ghi9012` | Applied |
| 3 | /build | Scope-creep: added src/utils/cache.ts to plan | commit `abc1234` | Applied |
| 4 | /stories | Applied 2 journey link suggestions | stories/login.yml, stories/logout.yml | Applied |
| 5 | /wrap-up | Routed 2 unfinished sections to DEFERRED queue | (pending — Step 4) | Proposed |

#### Pending review (staged — apply, skip, or modify per item)

| # | Skill | What | Detail | Patch |
|---|---|---|---|---|
| 6 | /review | 2 severity:medium findings | Unhandled rejection in src/api.ts:180; missing null check in src/auth/session.ts:42 | `staged/review-2.patch`, `staged/review-3.patch` |
| 7 | /stories | Legacy v1 stories detected (3 files) | stories/checkout.yml, stories/profile.yml, stories/settings.yml | Migration command: `/claude-tweaks:stories migrate` |
| 8 | /wrap-up | Skill restructure proposed | Split `auth/SKILL.md` into `auth/` + `session-management/` | `staged/wrap-up-skill-restructure.md` |

#### Skill updates (from Step 7.5)

| # | Skill | Section | Change |
|---|---|---|---|
| 9 | auth | Anti-Patterns | Add: "Don't share session tokens via querystring" |
| 10 | NEW | session-management | Create new skill for session lifecycle patterns |

#### Configuration updates (from Steps 6 + 8)

| # | Type | Target | Change |
|---|---|---|---|
| 11 | doc | docs/api.md | Document new /auth/refresh endpoint |
| 12 | claude.md | Commands | Add `npm run lint:fix` to test workflow |

---

1. **Approve all** — apply pending items 6-8, accept auto-applied 1-5, apply skill + config updates 9-12 **(Recommended)**
2. **Override specific items** — reply with #s to skip/modify (e.g., "skip 6, modify 8, revert 2")
3. **Stop and re-engage** — pause the pipeline; I'll resume after manual review

Below each table, show the full patch / diff for each pending item so the user can see exactly what will change.
```

**On approval (option 1):**

1. Apply all staged patches in `staged/` (run `git apply` or equivalent for each)
2. Apply skill updates and create new skills (from Step 7.5)
3. Apply config updates (docs, CLAUDE.md, rules)
4. Commit with a wrap-up message
5. Proceed to Step 10 (Consolidated Summary)

**On override (option 2):**

1. Parse the user's overrides
2. For each item: apply, skip (delete from staged/), or modify (re-edit the staged patch then apply)
3. Auto-applied items the user wants reverted: `git revert {commit}` (one revert commit per item, to keep history clean)
4. Commit, then proceed to Step 10

**On stop (option 3):** halt before applying. Leave the run directory intact. User resumes with `/claude-tweaks:wrap-up resume` (re-reads the same run directory and re-presents the console).

**Empty-console fast path:** if `decisions.md` has zero entries AND `staged/` is empty AND there are no skill or config updates, skip the console entirely. Log "Review Console: nothing to review" and proceed to Step 10.

**Hard requirement:** the console MUST present every entry from `decisions.md` (auto-applied + staged + kept-prompt) and every file in `staged/`. Silently dropping any item is forbidden.

**Sort order within each section:** reversibility:low first (highest-stakes revert), then reversibility:med, then reversibility:high. Within the same reversibility, severity:high first.

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
- [ ] Delete design wrapper caches (audit / recommendations / declined) from docs/plans/
- [ ] Remove worktree and feature branch (if worktree strategy)
- [ ] Leftover work: {recommendation}

### Configuration Updates (from Steps 6 + 8)
| # | Type | Target | Change |
|---|------|--------|--------|
| 1 | {doc/claude.md/rule} | {target} | {what to add/change} |
| 2 | ... | ... | ... |
(or: No configuration updates needed.)

### Manual Steps Required
| # | What | Where | Status |
|---|------|-------|--------|
| 1 | {description} | {source} | Acknowledged |
(or: No manual steps — nothing to do outside the codebase.)

> Complete these after merging.

### Skill Updates
Resolved in Step 7.5 — {N} updates applied / 0 updates needed.

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

Generate from: cleanup actions in Step 11, config/skill updates applied, ledger items resolved in Step 9.5.

### Next Actions

| Signal | Option |
|--------|--------|
| Next spec exists (Step 9) | `/claude-tweaks:flow {N}` — full pipeline on spec {N}: "{title}" **(Recommended)** |
| Newly unblocked specs | `/claude-tweaks:build {N}` — spec {N} "{title}" now unblocked |
| Always | `/claude-tweaks:help` — full pipeline status |
```

Present **one consolidated batch decision** covering both cleanup and configuration:

```
| # | Type | Action | Details |
|---|------|--------|---------|
| 1 | cleanup | Delete spec | specs/{number}.md (100% complete) |
| 2 | cleanup | Update INDEX.md | Remove completed entry |
| 3 | cleanup | Delete plans | docs/plans/{files} |
| 4 | cleanup | Delete ledger | docs/plans/*-ledger.md |
| 5 | cleanup | Remove worktree | `{path}` + branch `{branch}` |
| 6 | config | {doc/claude.md/rule} | {what to add/change} |
| 6 | config | ... | ... |

1. Apply all **(Recommended)**
2. Override specific items (tell me which #s to change)
```

If the user chooses to override, let them pick which items to skip or change.

After presenting the summary, output an explicit closure line:

```
Work archived. Spec {N}, its plans, and ledger have been deleted. The code and learnings remain.
```

This signals clearly that the lifecycle is complete — there's nothing left to do for this spec.

The Next Actions block in the template above replaces the old single-line handoff. Generate 2-4 numbered options based on context signals (next spec, unblocked specs, pipeline status). Always include a "next unblocked spec" option when one exists, so the user doesn't have to run `/help` to find it.

## Step 11: Execute Approved Actions

1. Delete or edit spec files
2. Update INDEX.md
3. Delete plans
4. Remove worktree and delete merged feature branch (if worktree strategy)
5. Update documentation, CLAUDE.md, memory files (from Step 10)
6. Apply skill updates and create new skills (from Step 7.5)

Commit with a message summarizing the wrap-up actions.

## Important Notes

- `/claude-tweaks:review` should have been run before `/claude-tweaks:wrap-up` — this skill assumes code quality is verified
- INDEX.md is forward-looking only — remove completed entries
- Skills document reusable patterns, not one-off implementations
- CLAUDE.md stays concise — use skills, rules, or reference docs for details
- Reflection insights with no clear destination must still be explicitly resolved — the user confirms "don't capture" with a reason, rather than the skill silently dropping them
- **Merge conflicts during wrap-up** (e.g., when merging a worktree feature branch back to main): resolve conflicts by understanding both sides' intent — read both versions, pick the correct merge. Never use `git reset` or `git checkout .` to discard changes. If the conflict involves spec or INDEX.md files being deleted by wrap-up but modified on main, prefer the deletion (the spec is complete).

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
| Auditing all skills instead of ledger-tagged ones | Step 7 scopes to skills referenced by `build/skill` and `review/skill` ledger entries — scanning the entire skill library wastes effort and produces noise |
| Proposing generic skill updates without citing a build/review observation | Every skill update must trace back to a specific ledger entry or reflection insight — generic improvements are indistinguishable from hallucinated ones |
| Mixing skill updates into the doc/CLAUDE.md batch table | Skill updates require full file reads and Update Mode patches — they get their own decision table in Step 7.5 |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:review` | Must pass before /claude-tweaks:wrap-up — handles verification, code review, and simplification. `review/skill` ledger entries from lens 3a and Step 4 feed into Step 7 skill analysis. |
| `/claude-tweaks:review` (visual modes) | Visual complement — findings from visual review may feed into wrap-up's reflection lenses |
| `/claude-tweaks:reflect` | Invoked BY /wrap-up (Step 3) in full mode. Handles all four reflection lenses, tradeoff review, insight routing, and ledger writes with phase `wrap-up`. |
| `/claude-tweaks:capture` | /claude-tweaks:wrap-up may create INBOX items for genuinely new ideas discovered during implementation |
| `specs/DEFERRED.md` | /claude-tweaks:wrap-up routes leftover work here (with origin spec, files, trigger) |
| `/claude-tweaks:help` | /claude-tweaks:wrap-up suggests running /claude-tweaks:help to see what's unblocked |
| `/claude-tweaks:tidy` | /claude-tweaks:wrap-up cleans artifacts for a single spec — /claude-tweaks:tidy does periodic bulk cleanup |
| `/claude-tweaks:build` | Runs BEFORE /claude-tweaks:review — produces the code and journeys that wrap-up reflects on. `build/skill` ledger entries from Step 4.5 feed into Step 7 skill analysis. |
| `/superpowers:finishing-a-development-branch` | When build used worktree git strategy, wrap-up verifies the feature branch was completed (merged, PR created, or discarded), then removes the worktree directory and deletes the merged branch (Step 5) |
| `/claude-tweaks:init` | Step 7 references `skill-template.md` for Update Mode format and quality gates. /wrap-up Step 6 maintains the doc registry created by /init Phase 8.5. |
| `/claude-tweaks:ledger` | Manages the open items ledger. /wrap-up appends reflection insights (Step 3), runs the resolve gate (Step 9.5), and deletes the ledger (Step 5). |
| `/claude-tweaks:design` | /wrap-up Step 5 cleans up the design wrapper's per-spec caches (`*-audit.json`, `*-recommendations.json`, `*-declined.json` in `docs/plans/`) alongside the ledger — consistent with the artifact-cleanup pattern for pipeline state. |
