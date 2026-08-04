---
name: claude-tweaks:wrap-up
description: Use when /claude-tweaks:review passes and you need to capture learnings, clean up specs/plans, update skills, and decide next steps. The lifecycle closure step.
argument-hint: "[#N|<spec>|<context>|resume] [--dry-run] [--skill-budget <n>] [--doc-budget <n>]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.


# Wrap-Up — Capture learnings, clean up, and close the lifecycle

Post-review reflection, knowledge capture, and lifecycle cleanup. Part of the workflow lifecycle:

Lifecycle: `/claude-tweaks:review` → **`/claude-tweaks:wrap-up`** — last step of the chain; the full chain is in `/claude-tweaks:help`.

## When to Use

- `/claude-tweaks:review` just passed and the work needs reflection and cleanup
- A record or spec is complete and needs its artifacts (plans, design docs) cleaned up
- You finished conversation-based work and want to capture learnings
- `/claude-tweaks:help` flags specs awaiting wrap-up

## Overview

`/claude-tweaks:review` verified the code is good. `/claude-tweaks:wrap-up` asks: what did we learn, and what needs cleaning up?

This skill handles reflection (capturing learnings), spec lifecycle (completion/cleanup), and knowledge routing (updating skills, CLAUDE.md, memory). It does NOT re-review code quality — that's `/claude-tweaks:review`'s job.

## Step 1: Identify the Work Context

Determine what type of work was completed:

### If `$ARGUMENTS` is provided:

- If it's exactly `resume` (case-insensitive), this is not conversation-based work — see "Resuming a halted Review Console" below instead of falling through to the branches below.
- If it's a `#`-prefixed record reference (e.g., `#42` — the primary form) or a bare spec/record number (e.g., "42", "73" — legacy alias), strip the leading `#` if present, then proceed as **record- or spec-based work**.
- Otherwise, use it as context for **conversation-based work**.

Flags (`--dry-run`, `--skill-budget <n>`, `--doc-budget <n>`) may appear anywhere in `$ARGUMENTS` alongside any of the above forms — strip them before applying the branches above. See "Flags" below.

### Resuming a halted Review Console

`resume` recovers a run halted at Step 8.6's "Stop and re-engage" option (`review-console.md`'s "On stop"). Locate the run directory: per `_shared/pipeline-run-dir.md`'s resolution order, find the most recent directory under `.claude-tweaks/pipelines/` whose `run-state.json` has `status: interrupted`. If none exists, report "No halted wrap-up run found to resume" and stop — do not fall through to conversation-based work. Otherwise, set `$PIPELINE_RUN_DIR` to that directory and jump directly to Step 8.6, which re-reads `decisions.md`, `staged/`, and `config.yml` from it and re-presents the console exactly as it stood before the stop.

### Flags

- **`--dry-run`** — run the full analysis (reflection, leftover routing, config/skill scans, the Step 8.6 auto-merge verdict) but make no commits, no file deletions or archival, and no `gh issue create` / `git merge` / `git push` calls. Console and summary tables render as previews of what *would* happen instead of records of what *did*. See `review-console.md`'s "Dry-run mode" section and Step 10's dry-run note below. Most useful for validating a `/claude-tweaks:dispatch`- or Routine-driven `auto`-mode wrap-up before letting it merge and push for real.
- **`--skill-budget <n>`** — override Step 7.2's default domain-overlap skill-read cap (top ~5, or top ~2 under a `fast-lane` ceremony profile) for this invocation only. See `skill-curation.md` 7.2.
- **`--doc-budget <n>`** — override Step 7.7's default domain-overlap doc-read cap (top ~3, or top ~1 under a `fast-lane` ceremony profile) for this invocation only. See `docs-health-integration.md`'s domain-overlap scan (D0).

### If no arguments, detect from context:

1. Check whether a materialized header exists for this run (`${RUN_DIR}/work/*-spec.md`) — record mode
2. Check recent git commits for spec references, and current branch name for spec patterns — legacy spec-file alias
3. Review conversation for references to spec files, records, or features

| Type | Characteristics | Primary Focus |
|------|----------------|---------------|
| **Record- or spec-based** | A materialized header exists for this run, or — legacy alias — a spec file exists in `specs/` | Full lifecycle: record/spec completion + plans + all assessments |
| **Conversation-based** | No record or spec, just work discussed | Assessments only (skip spec/plan cleanup steps) |

## Step 2: Summarize Completed Work

> Note: Spec compliance (deliverables + acceptance criteria) was already verified in `/claude-tweaks:review` Step 1. This step summarizes what was done — it does not re-verify.

### For record- or spec-based work:

Summarize the implementation against the record or spec:

1. List what was delivered (high-level, not a re-audit)
2. **100% complete** (confirmed by `/claude-tweaks:review`) → record mode, `github-issues`: the record closes via merge (`cleanup-procedures.md` Section C's carrier commit); record mode, `local-files`: the record file is marked `closed: true` in place (`cleanup-procedures.md` item 5); legacy spec-file alias: the spec file will be deleted
3. **Partial** (if `/claude-tweaks:review` passed with minor gaps flagged) → identify what remains

### For conversation-based work:

Review conversation and recent commits to identify what was implemented and which key files changed.

## Step 3: Reflect on Implementation

When a pipeline run directory exists, read `config.yml`'s `ceremony-profile`. Run `/claude-tweaks:reflect` in **light** mode when it is `fast-lane`; **full** mode otherwise (including standalone wrap-up, where no `config.yml` exists to read). Pass:
- **Scope** — files changed during this work
- **Ledger phase** — `wrap-up`
- **Seed context** — review summary (Key Learnings section), tradeoffs accepted
- **`--source wrap-up`** — only when no pipeline run directory exists (standalone wrap-up has no `$PIPELINE_RUN_DIR` to signal parent invocation on its own) — see `/claude-tweaks:reflect`'s Component-Skill Contract

Full mode handles all four reflection lenses (Surprises, Approach, Near-misses, Fresh start), the tradeoff review, insight routing, and ledger writes. Light mode (`skills/reflect/light-mode.md`) runs only the Near-misses and Fresh-start lenses and skips the tradeoff review — see `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` for the rationale. See `/claude-tweaks:reflect` for details on both.

If any insight is "Implement now", the reflect skill handles it before returning control. Proceed after all insights are resolved.

## Step 3.5: Ceremony Escape Hatch (fast-lane runs only)

Skip entirely when `config.yml`'s `ceremony-profile` is not `fast-lane` (including standalone wrap-up, where no `config.yml` exists). Otherwise, check both trigger conditions:

- Did `/claude-tweaks:review`'s summary (passed into this run) contain a finding at any severity?
- Did Step 3's reflect pass produce a Safety regression finding (`reflect/SKILL.md` Step 3's routing table)?

If either is true, downgrade `config.yml`'s `ceremony-profile` to `standard` in place and log:

```
AUTO {time} — Ceremony profile downgraded fast-lane → standard: {trigger}. Remaining wrap-up steps run at standard depth.
```

Steps 6 and 7 below read the (possibly just-downgraded) value fresh at their own point of use — no other propagation needed. This never re-runs Step 3 itself, or any build-side step already completed under the original `fast-lane` value — see the design doc's Escape Hatch section for why this is deliberate, not a gap.

---

## Step 4: Analyze Leftover Work (record- or spec-based only)

Identify unfinished spec sections that cannot be completed in the current work context. If at least one such section exists, read `leftover-routing.md` in this skill's directory and route them per that file — which owns the fix-exhaust qualification criteria, the auto-mode stage entry format, the interactive routing table (5 routing options), and the per-item routing semantics. If every spec section is complete, report "No leftover work to route" and skip this step entirely — do not read the file.

---

## Step 5: Plan Cleanup Actions

This step **plans** the cleanup — it does not execute. Actual deletions and archival run in Step 10 *after* the nothing-left-behind gate (Step 8.5) and the Review Console / batch decision (Step 8.6 or Step 9) approve them.

Step 5 enumerates 8 items, in canonical order: execution plans, ledger, design caches, worktree, record/spec lifecycle, ephemeral dev server, issue claim release, pipeline run dir (always last — see the canonical list's ordering rule).

First check whether **any** of the 8 conditions holds for this run — record- or spec-based work (items 1, 5), a ledger exists (2), the design wrapper was active (3), a worktree strategy was used (4), `${RUN_DIR}/ephemeral-server.txt` exists (6), a materialized header exists at `${RUN_DIR}/work/*-spec.md` (7), or a pipeline run directory exists (8):

- **At least one holds** → read `cleanup-procedures.md` in this skill's directory for the canonical cleanup list, filter it to rows whose Condition holds for this run (e.g., skip the worktree row when no worktree strategy was used), and carry the filtered list forward into Step 9's summary and Step 10's execution.
- **None holds** → report "No cleanup actions apply" and skip this step entirely; do not read the file.

On any pipeline run, items 4 and 8 hold by construction, so this gate is open there. It closes only for conversation-based standalone wrap-up with no ledger, no worktree, and no run directory.

## Step 6: Assess Configuration Updates

> **Batch collection.** Step 6 collects potential CLAUDE.md/rules and decision-record updates in a single pass across two sub-scans (CLAUDE.md and Rules, Decision Records). No decisions are made here — everything is presented together in Step 9 for batch approval. Skill updates are handled separately in Step 7; documentation updates are handled separately in Step 7.7.

> **Parallel execution:** Run both sub-scans (CLAUDE.md/rules, decision records) as parallel tool calls — each checks independent sources and collects findings in the `[type] target — change` format.

### Fast-lane pre-check (skip condition)

When `config.yml`'s `ceremony-profile` is `fast-lane` (read fresh — see Step 3.5), skip both sub-scans below entirely — report "No configuration updates needed (fast-lane: diff touches no registry-matched path, no new dependency, no schema/config file)" and proceed to Step 7 — when ALL of the following hold:

- `git diff --name-only` against this work's base ref matches none of `docs/REGISTRY.md`'s Auto-detect patterns. Reuse `bin/lib/issues/blast-radius.js`'s `classifyDiffFiles` — it reads `f.path` off each element of the `files` array, so map each bare filename from `git diff --name-only` to `{path: f}` before calling it (a bare string has no `.path` and would otherwise silently classify as `isSensitive: false` regardless of content). Pass the registry's patterns as the `sensitivePaths` argument — a result's `isSensitive: true` means a registry-pattern hit here, not a merge-sensitivity one; the function is generic path-glob matching regardless of which patterns list it's fed, and is already fully tested.
- The diff shows no added dependency in the project's own dependency manifest(s) — `package.json` (and any workspace-level equivalent), or `pyproject.toml`, `Cargo.toml`, `go.mod`, or equivalent for the project's stack (same manifest set `verification.md` Step 1 scans).
- No file in the diff matches a schema/env/IaC/CI/platform-config pattern — reuse Build Common Step 5.5's own Category A/B trigger list (`operational-checklist.md` in `skills/build/`).

If `docs/REGISTRY.md` doesn't exist, this pre-check cannot resolve the first condition — treat it as unmet (run the sub-scans normally) rather than skipping on incomplete information. This pre-check only applies under `fast-lane`; a `standard`-profile run (or standalone wrap-up, where no `config.yml` exists) always runs both sub-scans as before.

### 6.1: CLAUDE.md and Rules

CLAUDE.md describes **how to work in this codebase** — patterns to follow, commands to run, conventions to respect, mistakes to avoid. Every update must describe something that exists and is actively used, not aspirational improvements.

Check if the work introduced project-wide conventions:
1. New commands or scripts (verify they exist and work)
2. New naming conventions or patterns (observed, not aspirational)
3. New don'ts — anti-patterns discovered during this build that are guardrails for existing patterns, not wishes for missing infrastructure
4. Stack changes (new dependencies actually added)
5. Path-scoped rules for `.claude/rules/`

Before adding to CLAUDE.md, check the size budget — keep it concise. Move detailed content to skills or rules. Route improvement ideas to a new backlog record (no stage label — the unified taxonomy's equivalent of the pre-migration "inbox" destination; per `_shared/work-record.md`), not CLAUDE.md — subject to the same per-item work-record-creation approval as any other new record (`_shared/auto-mode-contract.md`).

**For a new Don't, write the incident account before the rule.** Put the specifics — which build, how it was caught, what it cost — wherever this project keeps that evidence (an incident log if it has one, otherwise the work record or the commit message), then compress to what lands in CLAUDE.md: one sentence of rule, one clause of why. The order is the whole point. Write the rule first and the vivid detail leaks into it clause by clause, and CLAUDE.md is paid for by every session *and* every dispatched subagent, so that leak is charged per agent. Length here is not a style preference.

→ Collect each needed update as: `[claude.md] {section} — {what to add/change}` or `[rule] {path scope} — {convention}`

### 6.2: Decision Records (ADRs)

Capture the *why* behind significant decisions made during this work — distinct from `decisions.md` (the per-run auto-decision audit log) and the spec (which records *what*). Apply the **ADR gate** from `_shared/decision-records.md` (read it for the gate, the location convention, and the template).

1. **Gather decision candidates** from this work's surfaces:
   - `[ADR-candidate]`-tagged constraints in the brainstorming brief (flagged by `/claude-tweaks:challenge`)
   - Architectural deviations classified in `/build` Common Step 4.5
   - Interface trade-offs flagged `[ADR-candidate]` by `/claude-tweaks:deepen`
   - Tradeoffs accepted during `/review` and reflection insights about approach
2. **Run the ADR gate** on each candidate — write an ADR only when ALL THREE hold: **hard to reverse** AND **surprising without context** AND **the result of a real trade-off**. If any factor is missing, do not propose an ADR (the decision belongs in the spec, a code comment, or nowhere).
3. For each decision that passes, propose creating `docs/decisions/NNNN-{slug}.md` using the template in `_shared/decision-records.md` (find the highest existing `NNNN` and increment).

→ Collect each as: `[adr] docs/decisions/NNNN-{slug}.md — {decision title}`

ADR proposals are routed through the Step 9 batch table / Review Console alongside other configuration updates — never written silently. Most wrap-ups produce **zero** ADRs; that is correct. ADRs are valuable because they are rare.

---

## Step 7: Skill Curation

Analyze whether project skills need updating, and whether the work warrants a **new** skill — based on what was built. This step runs standalone (not batched with Step 6) because it requires reading and comparing full skill files — a heavier weight of analysis.

Unlike a pure consumer, Step 7 **generates** candidates from the work itself. Ledger entries (`build/skill`, `review/skill`, `[skill: …]`-tagged) and reflection insights are **seeds** that focus the analysis — but an independent, domain-scoped scan inspects the skills whose domain overlaps the changed files **even when nothing was tagged**, and gap detection looks for reusable patterns no skill covers. New-skill candidates are proposed when **≥2 of 3** criteria (reusability, complexity, project-specificity) are met — not all three.

**Gate the read.** Read `skill-curation.md` in this skill's directory — the full procedure: seed gathering (7.1), the independent scan + gap detection (7.2), the dimension analysis (7.3), the ≥2-of-3 new-skill gate (7.4), quality gates (7.5), and auto/interactive stage-or-present (7.6) — when **either** holds:

- `.claude/skills/*.md` exists (there is a skill library to scan or patch), **or**
- `git diff --name-only` against this work's base ref contains a *cohesive* set of files implementing one reusable pattern — 7.2's gap-detection precondition (multiple files implementing a single pattern, not scattered one-off edits).

The second condition is not optional. `skill-curation.md` 7.2 step 2 calls a project with no skills "the strongest case for a first one" and requires gap detection to run even when `.claude/skills/` is absent — so the library's existence alone must never gate this read.

When **neither** holds, skip the read and emit the mandatory summary line directly:

```
SCANNED {time} — Step 7 skill curation summary: 0 seeds, 0 skills read (no .claude/skills/ library present), gap detection: not run (no cohesive multi-file pattern in the diff).
Result: 0 applied, 0 staged, 0 new-skill candidates (0/0).
Reversibility: N/A.
```

Auto mode appends this line to `decisions.md` under the `SCANNED` tag (`_shared/auto-decision-log.md`); interactive mode prints it inline. `gap detection: not run` is deliberate — reporting `not found` for a check that never executed is the silent skip this summary exists to prevent.

Skill curation declares "No skill updates needed" only when seeds, the independent scan, and gap detection all come up empty — never merely because no ledger entry was tagged, and even then a mandatory `SCANNED` summary line (naming the seed count, skills read, and gap-detection outcome — see `skill-curation.md` 7.6) is logged so the null result is auditable. Staged updates and new-skill candidates surface at the Wrap-Up Review Console (Step 8.6), or the interactive batch table per `skill-curation.md`.

## Step 7.7: Documentation Curation

Analyze whether project documentation needs updating, and detect documentation this work should have produced but didn't — based on what was actually built. This step runs standalone (not batched with Step 6) because it includes a domain-overlap scan across existing docs (reading relevant docs even when this work didn't touch them directly) in addition to the docs this work edited or created — a heavier weight of analysis than Step 6's CLAUDE.md/rules/ADR scans.

**Fast-lane narrows breadth, never gates existence.** Same principle as Step 7's skill curation (`skill-curation.md`'s opening paragraph) — under `ceremony-profile: fast-lane`, the domain-overlap scan's cap shrinks (top-1 instead of top-3) but the scan itself always runs.

**Gate the read.** If a `docs/` directory exists and is non-empty, read `docs-health-integration.md` in this skill's directory for the full procedure — registry maintenance (new/deleted/moved docs, stale Auto-detect patterns), the domain-overlap scan (D0) with its `docs/REGISTRY.md`-absent fallback and `--doc-budget` cap, the shared JUDGE application (D1) across both touched and domain-overlap docs, missing-documentation gap detection (D2), and the mandatory null-result summary line.

If `docs/` does not exist or is empty, skip the read and emit the mandatory summary line directly:

```
SCANNED {time} — Step 7.7 documentation curation summary: 0 docs touched, 0 domain-overlap docs read (no docs/ tree present), gap detection: not run.
Result: 0 applied, 0 staged, 0 restructural filed.
Reversibility: N/A.
```

Auto mode appends this line to `decisions.md` under the `SCANNED` tag (`_shared/auto-decision-log.md`); interactive mode prints it inline. `gap detection: not run` is deliberate — see Step 7's equivalent note. Known narrowing: a project with no `docs/` tree at all never gets D2's missing-doc proposal, since D2 is what would create the first doc. Accepted for now — `/claude-tweaks:init` Phase 8.5 covers first-doc scaffolding for such a project.

Documentation curation declares "No documentation updates needed" only when the domain-overlap scan (D0), the touched-docs judgment (D1), and the missing-doc gap detection (D2) all come up empty — never merely because nothing was flagged elsewhere — and even then a mandatory `SCANNED` summary line (naming docs touched, domain-overlap docs read, and gap-detection outcome — see `docs-health-integration.md`) is logged so the null result is auditable. Staged updates and restructural filings surface at the Wrap-Up Review Console (Step 8.6) in the "Documentation updates" section, or Step 9's generic Configuration Updates batch table in interactive/standalone mode (Step 9's template is intentionally not split further — see `docs-health-integration.md`'s own Gotcha note).

## Step 7.8: Journey Curation

Analyze whether journeys the current diff touches have drifted out of sync, and detect a persona-facing flow this work introduced with zero journey coverage — based on what was actually built, always recomputed fresh (no reuse of `/review`'s 3g-cov lens, which computes journey-to-story coverage, not diff overlap, and is purely informational with no persisted artifact to reuse). This step runs standalone (not batched with Step 6) for the same reason Steps 7 and 7.7 do — full-file reads and shared-criteria judgment, not a lightweight registry/CLAUDE.md scan.

Unlike Step 7's skill curation and Step 7.7's documentation curation, journey scope-selection is a direct computation — `docs/journeys/*.md` whose `files:` frontmatter overlaps `git diff --name-only` against this work's base ref — not a ranked domain-overlap scan over the whole library. There is no `--journey-budget` flag and no fast-lane-narrows-the-cap behavior to document; the computation itself is cheap and deterministic regardless of ceremony profile.

**Gate the read.** If `docs/journeys/*.md` matches at least one file, read `journey-curation.md` in this skill's directory for the full procedure — the fresh diff-vs-`files:`-frontmatter overlap computation, the inline application of `_shared/journey-self-review.md`'s four checks plus structural-validity check, missing-journey gap detection, and the mandatory null-result summary line.

If no `docs/journeys/*.md` file exists, skip the read and emit the mandatory summary line directly:

```
SCANNED {time} — Step 7.8 journey curation summary: 0 journeys checked (none exist), self-review: n/a, gap detection: not run.
Result: 0 fixed inline, 0 new journey(s) created, 0 gap(s) found.
Reversibility: N/A.
```

Auto mode appends this line to `decisions.md` under the `SCANNED` tag (`_shared/auto-decision-log.md`); interactive mode prints it inline. `gap detection: not run` is deliberate — see Step 7's equivalent note. This gate is safe precisely because Step 7.8 is a **drift** check: `journey-curation.md`'s own framing calls it "a wrap-up-time safety net for drift introduced after build's own journey check ran," and drift presupposes an existing journey. First-journey *creation* is `/claude-tweaks:journeys`' job at build time, not this step's.

Journey curation declares "No journey updates needed" only when no journey's `files:` frontmatter overlaps the diff AND missing-journey gap detection finds no persona-facing flow with zero coverage — and even then a mandatory summary line (naming journeys checked, self-review outcome per journey, and gap-detection outcome — see `journey-curation.md`) is logged so the null result is auditable. Findings surface at the Wrap-Up Review Console (Step 8.6) in the "Journey updates" section.

## Step 8: Analyze Next Steps (record- or spec-based only)

Determine:
1. **Newly unblocked records** — what can now be worked on? Record mode only (below); the legacy spec-file alias has no equivalent check here — suggest `/claude-tweaks:help` for that case.
2. **Parallel opportunities** — which specs have no dependencies?
3. **Recommended next spec** — based on dependencies and logical flow

Suggest running `/claude-tweaks:help` to see the full workflow status.

### Newly unblocked records (record mode only)

The record this run just closed is already known — `record: {n}` from the materialized header (the same field the close-via-merge carrier commit used). Check whether closing it unblocked anything, purely informational — this must never gate, block, or delay the wrap-up; on any error, log and continue.

**Gate the read.** If this run is record mode (a materialized header exists at `${RUN_DIR}/work/*-spec.md`), read `unblocked-records.md` in this skill's directory — it holds the `work-backend: github-issues` (`work-links: body-text` or `native`) and `work-backend: local-files` procedures, the failure-mode handling, and the `decisions.md` log line. Otherwise — conversation-based work, or the legacy spec-file alias, neither of which has a record whose closure could unblock a dependent — skip this sub-step entirely and do not read the file.

---

## Step 8.5: Nothing Left Behind (Gate)

Run the resolve gate from `/claude-tweaks:ledger` (see ledger skill for the three-phase procedure: Phase 1 fix-exhaust silently → Phase 2 present remainder for per-item user decision → Phase 3 apply).

**Gate the read.** Read `ledger/resolve-gate.md` when the ledger exists **and holds at least one item** — of any status, not just `open`. If the ledger doesn't exist (standalone wrap-up, or work predating the ledger), or exists but is empty, report "No ledger items to resolve" and skip this gate entirely without reading the file.

The gate is item-*existence*, not open-item-existence: the bulk-resolve fast path below still stages proposals for `acknowledged` items via that file's Phase 3 `Acknowledge` disposition, and the Ops acknowledgment sub-step below applies the same disposition — both operate on items that are already terminal. Gating on `open` items alone would skip the read while those two paths still need it.

**Hard requirements:**

- Phase 1 must run before any user-facing output. The agent fixes everything that qualifies for fix-now, commits, then presents only the genuine residue.
- Phase 2 always requires explicit per-item user input for `fix` / `defer` / `accept` decisions. Status `acknowledged` (e.g., ops items the user has read — each one stages a work record proposal, resolved via the Review Console's own mandatory per-item approval) may be bulk-*staged* via a single explicit "I've read every item" choice, since the actual record creation still gets its own per-item gate downstream. Never bulk-resolve `fix` / `defer` / `accept`. Never assume "obvious" defers. Never offer a "Fix all (Recommended)" or "Defer all" shortcut — those bias the user toward whichever bulk action is easier to type.
- `auto` mode does NOT silence this gate.
- Both `parked` and `backlog` are valid stage destinations for a new work record, but every individual item requires an explicit per-item user choice — no record is ever staged autonomously.

### Bulk-resolve fast path (terminal-status only)

The fast path applies **only when every ledger item already has terminal status** (`fixed`, `deferred`, `accepted`, `acknowledged`, `observation`) at gate entry. If a single item has status `open`, the fast path does NOT apply — Phase 1 → Phase 2 → Phase 3 must run in full sequence without exception. Before reporting completion, check every `acknowledged` item for a staged proposal (a producer can create an item pre-set to `acknowledged`, bypassing Phase 3 entirely — e.g. `build/worktree-setup.md`'s auto-mode divergence entry): stage one now, per `ledger/resolve-gate.md` Phase 3's `Acknowledge` disposition, for any that lack one. Then report: "All {N} ledger items resolved. No open items." and proceed to Step 9.

Phase 2 is on the "What `auto` does NOT silence" list in `_shared/auto-mode-contract.md` — it is never skipped, regardless of `auto` state, when any `open` item exists.

### Ops acknowledgment (when ops items exist)

Ops items represent infrastructure changes the user needs to action post-merge — bulk-acknowledging them risks the user not reading them. Present each item, and require explicit confirmation rather than a shortcut that defaults to bulk action:

```
The following ops items need acknowledgment. These represent infrastructure changes you need to action post-merge — read each one before choosing:

| # | What | Where |
|---|------|-------|
| 1 | {description} | {source} |
```

**Unattended-tier auto-acknowledge:** if `unattended-tier: on` (see `_shared/unattended-tier.md`),
skip the `AskUserQuestion` below entirely — for every item, stage a record proposal and update
status to `acknowledged` per `ledger/resolve-gate.md` Phase 3's `Acknowledge` disposition, log
`AUTO {time} — Ops acknowledgment: {N} items auto-acknowledged, staged for filing. Reversibility: high.` to
`decisions.md`, and continue to Step 8.6. Otherwise, present the block below.

Call `AskUserQuestion` with `question`: `"How do you want to handle these ops items?"`, `header`: `"Ops items"`, `multiSelect`: `false` — neither option's label is marked as the default:

- Option 1 — `label`: `"Acknowledge all"`, `description`: `"I've read every item"`
- Option 2 — `label`: `"Show details"`, `description`: `"I have questions about specific items"`

After option 1, apply `ledger/resolve-gate.md` Phase 3's `Acknowledge` disposition to every item — stage a record proposal per item and update status to `acknowledged`. The actual record creation is a separate, mandatory per-item approval at the Review Console's Queue writes section (bulk-acknowledging here only stages the proposal; it does not silently create N records). After option 2, surface each item with full detail and apply the same per-item `Acknowledge` disposition on confirmation.

---

## Step 8.6: Wrap-Up Review Console (back-loaded review)

The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). Runs in `auto` or `hybrid` mode when a pipeline run directory exists. Skipped in `interactive` mode and in standalone wrap-up. Reads `decisions.md`, `staged/`, and `config.yml` from the run directory, then presents one consolidated batch table with up to nine sections (Auto-applied / Pending review / Low-confidence findings / Contested findings / Skill updates / Documentation updates / Journey updates / Configuration updates / Cleanup actions) and three actions (Approve all / Override / Stop). The two coordination-derived sections (Low-confidence findings, Contested findings) render only when non-empty.

**Multi-spec defer:** when `MULTISPEC_REVIEW_DEFER=1` is set by `/flow` multi-spec orchestration, skip the per-spec console — the consolidated end-of-run console at `/flow` handles all approvals across every spec in the run. Leave `staged/` and `decisions.md` untouched, append a "deferred" log entry, and proceed to Step 9.

Empty-console fast path: skip the console entirely and proceed to Step 9 when all of `review-console.md`'s Empty-console fast path conditions hold (`decisions.md` has zero entries, `staged/` is empty, no skill/config updates exist, no cleanup actions apply, no queue writes are pending).

**Gate the read.** Read `review-console.md` in this skill's directory — for the run-directory resolution sequence, the multi-spec defer protocol, the Auto-merge short-circuit, the full console template with all nine section tables (including the conditionally-rendered Low-confidence and Contested findings sections), approval/override/stop semantics, and the sort-order requirement — when **either** holds:

- The console runs: mode is `auto` or `hybrid`, a pipeline run directory exists, `MULTISPEC_REVIEW_DEFER` is unset, and the empty-console fast path above does not apply; **or**
- This run has a materialized header (`${RUN_DIR}/work/*-spec.md`) whose issue carries a live `auto:merge` label (re-fetch via `gh issue view --json labels`).

The second condition exists because the **Auto-merge short-circuit** lives in `review-console.md`, not in this file — it is not part of the console rendering it precedes. Without it, a run that qualified for the empty-console fast path would silently skip its authorized auto-merge. In practice the fast path cannot fire on such a run (it requires "no cleanup actions apply," while items 4 and 8 always apply when a run directory exists), so this is a belt-and-braces guard against a latent ordering hazard, not a live bug.

In `interactive` mode and standalone wrap-up — where Step 8.6 is skipped outright — do not read the file at all.

---

## Step 9: Present Consolidated Summary

**Standalone multi-record batch.** When this wrap-up covers N already-completed, already-merged records from one batch (e.g. following up on a `/flow` multi-record run whose pipeline run directory was already archived — no live materialized header to key a single-record template on), render **one consolidated summary** covering all N records — a table with one row per record, mirroring `flow/multi-spec.md`'s Multi-Spec Summary shape — rather than forcing the single-record template below N separate times.

```
## Wrap-Up: {"Record #{n}" when a materialized header exists, else "Spec {number}"} — {title}
{Origin: {origin} — record mode only, the materialized header's origin field: by:code-health / by:harness-health / by:journey-health / by:docs-health / by:capture / by:dispatch, or "human" when absent. Omit this line entirely for legacy spec-file-mode runs.}

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
| 1 | {doc/claude.md/rule/adr/docs-health-issue} | {target} | {what to add/change} |
| 2 | ... | ... | ... |
(or: No configuration updates needed.)

### Manual Steps Required
| # | What | Where | Status |
|---|------|-------|--------|
| 1 | {description} | {source} | Filed as #{n} |
(or: No manual steps — nothing to do outside the codebase.)

> Complete these after merging. Each row is a real, trackable record (`ledger/resolve-gate.md`'s `Acknowledge` disposition) — not just a note in this transcript.

### Skill Updates
Resolved in Step 7 — {N} updates applied, {M} staged, {K} new-skill candidates ({proposed}/{declined}); {R} skills read, gap detection: {found/not found}. See `decisions.md` for the full `SCANNED` summary line.

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Closed record #{n} via merge (`Fixes #{n}`) — no local file to delete | `{hash}` |
| Operational | Deleted spec `specs/{N}.md`, updated `specs/INDEX.md` (legacy spec-file-mode alias only) | `{hash}` |
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
- **Step 8.6 was skipped** — interactive mode, standalone wrap-up, or empty-console fast path → present the batch decision below. **Except** `MULTISPEC_REVIEW_DEFER=1` (Step 8.6's multi-spec defer branch): that case also skips the per-spec console, but do NOT present the batch decision here — `staged/` and `decisions.md` were deliberately left untouched for the parent `/flow`'s single consolidated end-of-run console to approve later across every spec in the run. Proceed straight to Step 10 the same as the "Step 8.6 ran" branch above; presenting this batch table here would reintroduce the duplicate, premature approval prompt the defer protocol exists to prevent.

Render the cleanup rows from `cleanup-procedures.md`'s canonical list (filtered by Condition), followed by configuration update rows from Step 6:

```
| # | Type | Action | Details |
|---|------|--------|---------|
| 1 | cleanup | {row from cleanup-procedures.md canonical list} | {details} |
| ... | cleanup | ... | ... |
| N | config | {doc/claude.md/rule/adr/docs-health-issue} | {what to add/change} |
```

The table renders as markdown, as above. Immediately below it, call `AskUserQuestion` with:

- `question`: `"How do you want to apply these changes?"`, `header`: `"Apply changes"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply all cleanup and configuration items"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

If the user chooses to override, let them pick which items to skip or change.

After presenting the summary, output an explicit closure line — record mode (materialized header present):

```
Work archived. Record #{n} closes via this merge (or the wrap-up commit, in current-branch mode); its plans and ledger have been deleted. The code and learnings remain.
```

Legacy spec-file-mode alias (no materialized header):

```
Work archived. Spec {N}, its plans, and ledger have been deleted. The code and learnings remain.
```

This signals clearly that the lifecycle is complete — there's nothing left to do for this spec.

Next Actions are rendered as a top-level `## Next Actions` section after Step 10's verification — see the section near the end of this file. They replace the old single-line handoff with a context-signal-driven table.

## Step 10: Execute Approved Actions

**Dry-run mode.** When `--dry-run` was passed (Step 1's Flags), skip actual execution entirely — print each planned cleanup / configuration / skill / acceptance-labeling action as a preview line instead of running it, skip the final commit and the closing line, and stop after Step 9's summary. This applies whether Step 8.6 rendered (which already previewed instead of applied — see `review-console.md`'s "Dry-run mode") or was skipped (interactive mode, standalone wrap-up).

Execute the cleanup planned in Step 5 (canonical list in `cleanup-procedures.md`) plus the configuration / skill updates approved at the Review Console (Step 8.6) or batch decision (Step 9). The 8 cleanup items, in execution order, are defined in `cleanup-procedures.md`'s canonical list — do not re-enumerate here. Filter rows by Condition.

**MULTISPEC_REVIEW_DEFER branch:** When `$MULTISPEC_REVIEW_DEFER=1` is set, Step 10 SKIPS the state-changing cleanups marked deferred in `cleanup-procedures.md` (items 3 Design caches, 4 Git worktree, 6 Ephemeral dev server, 7 Issue claim release, 8 Pipeline run dir archival). Those defer to `/flow`'s consolidated multi-spec Review Console at end-of-run, which has authority to apply or override them across all specs in the run. Step 10 still executes the idempotent cleanups (items 1 Execution plans, 2 Open items ledger, 5 Record/spec lifecycle) — those do not interact with parent-orchestrated cleanup.

After the cleanup, also apply:

- **Documentation** — apply the registry / doc edits collected in Step 7.7 and approved at the Console or batch
- **CLAUDE.md, rules** — apply the edits collected in Step 6 and approved at the Console or batch
- **New docs from missing-doc detection** — for a `[doc] {file} — Create: …` row (wrap-up's own D2 gap-detection, `docs-health-integration.md`), scaffold the new file from the matching section of `skills/_shared/diataxis-genre-templates.md` and fill in real content from this work's session context, then register it in `docs/REGISTRY.md` if a registry exists
- **Docs-health restructural filings** — for restructural docs-health findings (`docs-health-integration.md`'s D1) approved at the Console or batch, re-run `validate-findings` without `--dry-run` and file each surviving payload via `gh issue create`, per that file's filing procedure
- **Decision records (ADRs)** — write the approved `docs/decisions/NNNN-{slug}.md` files (Step 6.2) using the template in `_shared/decision-records.md`, and add them to `docs/REGISTRY.md` if a registry exists
- **Skill updates** — apply patches and create new skills (Step 7 staged or approved items)
- **Acceptance labeling** (record mode only — a materialized header exists for this run) — for testable records, gate on a clean visual-review pass (triggering one now via Step 2.5's safety net if `/review` only produced a recommendation), then apply `demo:pending` and post the Verification Brief. **Gate the read:** only when this run is record mode *and* the record is testable, read `verification-brief.md` in this skill's directory for the full bootstrap, safety-net, sourcing, and posting procedure. Conversation-based work and the legacy spec-file alias have no work record to label — skip this bullet and do not read the file (that file's own header states the same restriction)

Commit with a message summarizing the wrap-up actions. When the run is `current-branch` mode
and a materialized header exists for this spec (`${RUN_DIR}/work/*-spec.md` — its `record:`
field is the issue number), include one `Fixes #{issue}` line per resolved issue in this commit
message — it is the closing-keyword carrier for current-branch runs (see
`cleanup-procedures.md` Section C); GitHub closes the issues when the commit reaches the
default branch. A legacy spec-file-mode run (no materialized header) carries no closing
keyword — there was never an issue to close.

### Verify execution

Before emitting the closure line, confirm every approved action actually ran:

- Spec file deleted or status updated (legacy spec-file-mode alias only — record mode has no spec file) — `ls specs/{N}*.md` returns nothing (or `git status` shows the status edit committed)
- INDEX.md updated (legacy spec-file-mode alias only — record mode never touches it) — `git log -1 --stat specs/INDEX.md` shows this run's commit
- Plans + ledger removed — `ls docs/superpowers/plans/*{spec-slug}* docs/plans/*-ledger.md` returns nothing
- Design caches deleted (when applicable) — no `*-audit.json` / `*-recommendations.json` / `*-declined.json` for this spec remain in `docs/plans/`
- Pipeline run dir archived — `.claude-tweaks/pipelines/{run-id}/` is gone; `.claude-tweaks/pipelines/archive/{run-id}/` exists, with the `work/` subdirectory (when present) still git-tracked at its new path (skipped when `MULTISPEC_REVIEW_DEFER=1`)
- Worktree removed (worktree strategy) — `git worktree list` no longer shows the feature worktree path
- Closing-keyword carrier commit landed (worktree strategy + a materialized header was present for this spec) — `git log {default-branch} --grep="Fixes #{issue}"` shows the carrier commit for each resolved issue once merged (or `git log {feature-branch} --grep=...` if the branch is still open under "keep as-is" or a pending PR)
- Acceptance labeling landed (record mode only) — `work-backend: github-issues`: `gh issue view {issue} --json labels -q '.labels[].name'` includes `demo:pending` and the issue's last comment contains `## Verification Brief` with a `### Confirmed` section; `work-backend: local-files`: the record's body contains `## Verification Brief` with a `### Confirmed` section and its frontmatter has `acceptance: pending`. For a testable record, confirm the safety-net gate actually resolved (no high/critical visual-review finding left unfixed) before this line was reached.

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

When invoked directly by a user (standalone wrap-up), resolve 2-4 options based on context signals; always include the "next unblocked spec" option when one exists so the user doesn't have to run `/help` to find it. The signal-to-option lookup table below stays as-is — the assistant's own logic for picking which options apply, never itself shown to the user or converted into an `AskUserQuestion` option:

| Signal | Option |
|--------|--------|
| Next spec exists (Step 8) | `/claude-tweaks:flow {N}` — full pipeline on spec {N}: "{title}" **(Recommended)** |
| Newly unblocked records (Step 8's dependent check — `/tmp/wrapup-unblocked.json`, one option per entry) | `/claude-tweaks:flow #{N}` — record #{N} "{title}" now unblocked by this closure (bare `{N}` under `work-backend: local-files`) |
| Always | `/claude-tweaks:help` — full pipeline status |

Once the signals are resolved, call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 (when a next spec exists) — `label`: `"Full pipeline (Recommended)"`, `description`: `"/claude-tweaks:flow {N} — full pipeline on spec {N}: \"{title}\""`
- Option 2 (one per entry in `/tmp/wrapup-unblocked.json`, up to the tool's option cap) — `label`: `"Pipeline #{N}"`, `description`: `"/claude-tweaks:flow #{N} — record #{N} \"{title}\" now unblocked by this closure"`
- Option 3 (always) — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — full pipeline status"`

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:wrap-up` is running inside a `/claude-tweaks:flow` pipeline. In that case:
- Omit the `## Next Actions` block at the end of Step 9 — the parent `/claude-tweaks:flow` renders its own pipeline summary.
- Step 8.6 (Review Console) honors `$MULTISPEC_REVIEW_DEFER` — if set, skip the per-spec console and let `/claude-tweaks:flow`'s consolidated console handle approvals.

When `$PIPELINE_RUN_DIR` is unset, `/claude-tweaks:wrap-up` runs standalone — render Next Actions as usual.

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
| Scanning the entire skill library on every wrap-up | Step 7's independent scan is bounded to the ~5 skills whose domain overlaps the changed files (~2 under a fast-lane ceremony profile; plus seeded skills) — a whole-library audit on every wrap-up wastes effort and produces noise. Domain-scoped scanning is expected; whole-library scanning is the anti-pattern |
| Skipping skill curation because nothing was ledger-tagged | Step 7 generates candidates from the work itself — the independent scan and gap detection run even with zero seeds. Declaring "no skill updates needed" just because no entry was tagged is the failure this step exists to fix |
| Declaring "no skill updates needed" with no logged scan scope | The null result is unfalsifiable without a record of what was scanned and how deep the ranking went — Step 7's mandatory `SCANNED` summary line (`skill-curation.md` 7.6) exists precisely so "nothing needed updating" is auditable, not just asserted |
| Skipping documentation curation because nothing was directly touched | Step 7.7's domain-overlap scan (D0) reads relevant docs even when this work didn't edit them directly — declaring "no documentation updates needed" without running D0 skips exactly the check this step exists to add |
| Declaring "no documentation updates needed" with no logged scan scope | The null result is unfalsifiable without a record of what was scanned — Step 7.7's mandatory `SCANNED` summary line (`docs-health-integration.md`) exists precisely so "nothing needed updating" is auditable, not just asserted |
| Declaring "no journey updates needed" without checking `files:` frontmatter against the diff | Step 7.8's fresh diff-vs-frontmatter computation exists precisely because build-time `/journeys` and review's 3g-cov lens don't catch drift introduced after their own pass ran — skipping the recomputation reintroduces the exact silent-drift gap this step exists to close |
| Letting a closed sub-file gate suppress the step's `SCANNED` summary line | Steps 7 / 7.7 / 7.8 gate the *read* of their procedure file, never the *reporting*. When a gate is closed, the summary line is emitted from that step's own inline template with `gap detection: not run` — an unreported step is indistinguishable from a step that ran and found nothing, which is exactly the silent skip the summary exists to prevent |
| Gating `skill-curation.md`'s read on `.claude/skills/*.md` alone | `skill-curation.md` 7.2 step 2 requires gap detection to run even when the directory is absent — "a project with no skills is the strongest case for a first one." Step 7's gate therefore also opens on a cohesive multi-file diff; existence of the skill library is not a sufficient gate on its own |
| Proposing generic skill updates with no concrete anchor | Every skill update must trace to a ledger entry, a reflection insight, or a specific changed-file observation from the independent scan — updates with no anchor are indistinguishable from hallucinated ones |
| Mixing skill updates into the doc/CLAUDE.md batch table | Skill updates require full file reads and Update Mode patches — they get their own decision table in Step 7 |
| Writing an ADR for every decision | ADRs are valuable because they are rare — Step 6.2's ADR gate (hard-to-reverse AND surprising AND a real trade-off) keeps them so. Most wrap-ups produce zero ADRs, and that is correct |
| Treating `demo:pending` as optional for "trivial" record-mode work | The Acceptance axis applies uniformly — triviality gets a fast path at `/demo`'s own verdict step, not wrap-up's labeling step |
