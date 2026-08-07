---
name: wrap-up
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
- If it's a `#`-prefixed record reference (e.g., `#42` — the primary form) or a bare record id under `work-backend: local-files` (e.g., "42", "73"), strip the leading `#` if present, then proceed as **record-based work**.
- Otherwise, use it as context for **conversation-based work**.

Flags (`--dry-run`, `--skill-budget <n>`, `--doc-budget <n>`) may appear anywhere in `$ARGUMENTS` alongside any of the above forms — strip them before applying the branches above. See "Flags" below.

### Resuming a halted Review Console

`resume` recovers a run halted at Step 8.6's "Stop and re-engage" option (`review-console.md`'s "On stop"). Locate the run directory: per `_shared/pipeline-run-dir.md`'s resolution order, find the most recent directory under `.claude-tweaks/pipelines/` whose `run-state.json` has `status: interrupted`. If none exists, report "No halted wrap-up run found to resume" and stop — do not fall through to conversation-based work. Otherwise, set `$PIPELINE_RUN_DIR` to that directory and jump directly to Step 8.6, which re-reads `decisions.md`, `staged/`, and `config.yml` from it and re-presents the console exactly as it stood before the stop.

### Flags

- **`--dry-run`** — run the full analysis (reflection, leftover routing, config/skill scans, the Step 8.6 auto-merge verdict) but make no commits, no file deletions or archival, and no `gh issue create` / `gh issue edit` / `gh issue comment` / `git merge` / `git push` calls — the three `gh` shapes cover both Step 10's acceptance labeling and the Step 8.6 auto-merge branch's own copy of it. Console and summary tables render as previews of what *would* happen instead of records of what *did*. See `review-console.md`'s "Dry-run mode" section and Step 10's dry-run note below. Most useful for validating a `/claude-tweaks:dispatch`- or Routine-driven `auto`-mode wrap-up before letting it merge and push for real.
- **`--skill-budget <n>`** — override Step 7.2's default domain-overlap skill-read cap (top ~5, or top ~2 under a `fast-lane` ceremony profile) for this invocation only. See `skill-curation.md` 7.2.
- **`--doc-budget <n>`** — override Step 7.7's default domain-overlap doc-read cap (top ~3, or top ~1 under a `fast-lane` ceremony profile) for this invocation only. See `docs-health-integration.md`'s domain-overlap scan (D0).

### If no arguments, detect from context:

1. Check whether a materialized header exists for this run (`${RUN_DIR}/work/*-spec.md`) — record mode
2. Check recent git commits and the current branch name for record references
3. Review conversation for references to records or features

| Type | Characteristics | Primary Focus |
|------|----------------|---------------|
| **Record-based** | A materialized header exists for this run | Full lifecycle: record completion + plans + all assessments |
| **Conversation-based** | No record, just work discussed | Assessments only (skip record/plan cleanup steps) |

## Step 2: Summarize Completed Work

> Note: Spec compliance (deliverables + acceptance criteria) was already verified in `/claude-tweaks:review` Step 1. This step summarizes what was done — it does not re-verify.

### For record-based work:

Summarize the implementation against the record:

1. List what was delivered (high-level, not a re-audit)
2. **100% complete** (confirmed by `/claude-tweaks:review`) → `github-issues`: the record closes via merge (`cleanup-procedures.md` Section C's carrier commit); `local-files`: the record file is marked `closed: true` in place (`cleanup-procedures.md` item 5)
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

## Step 4: Analyze Leftover Work (record-based only)

Identify unfinished spec sections that cannot be completed in the current work context. If at least one such section exists, read `leftover-routing.md` in this skill's directory and route them per that file — which owns the fix-exhaust qualification criteria, the auto-mode stage entry format, the interactive routing table (5 routing options), and the per-item routing semantics. If every spec section is complete, report "No leftover work to route" and skip this step entirely — do not read the file.

---

## Step 5: Plan Cleanup Actions

This step **plans** the cleanup — it does not execute. Actual deletions and archival run in Step 10 *after* the nothing-left-behind gate (Step 8.5) and the Review Console / batch decision (Step 8.6 or Step 9) approve them.

Step 5 enumerates 8 items, in canonical order: execution plans, ledger, design caches, worktree, record/spec lifecycle, ephemeral dev server, issue claim release, pipeline run dir (always last — see the canonical list's ordering rule).

First check whether **any** of the 8 conditions holds for this run — record-based work (items 1, 5), a ledger exists (2), the design wrapper was active (3), a worktree strategy was used (4), `${RUN_DIR}/ephemeral-server.txt` exists (6), a materialized header exists at `${RUN_DIR}/work/*-spec.md` (7), or a pipeline run directory exists (8):

- **At least one holds** → read `cleanup-procedures.md` in this skill's directory for the canonical cleanup list, filter it to rows whose Condition holds for this run (e.g., skip the worktree row when no worktree strategy was used), and carry the filtered list forward into Step 9's summary and Step 10's execution.
- **None holds** → report "No cleanup actions apply" and skip this step entirely; do not read the file.

On any pipeline run, items 4 and 8 hold by construction, so this gate is open there. It closes only for conversation-based standalone wrap-up with no ledger, no worktree, and no run directory.

## Step 6: Assess Configuration Updates

> **Batch collection.** Step 6 collects potential CLAUDE.md/rules and decision-record updates in a single pass across two sub-scans (CLAUDE.md and Rules, Decision Records). No decisions are made here — everything is presented together in Step 9 for batch approval. Skill updates are handled separately in Step 7; documentation updates are handled separately in Step 7.7.

### Fast-lane pre-check (skip condition)

When `config.yml`'s `ceremony-profile` is `fast-lane` (read fresh — see Step 3.5), skip both sub-scans below entirely — report "No configuration updates needed (fast-lane: diff touches no registry-matched path, no new dependency, no schema/config file)" and proceed to Step 7 — when ALL of the following hold:

- `git diff --name-only` against this work's base ref matches none of `docs/REGISTRY.md`'s Auto-detect patterns. Reuse `bin/lib/issues/blast-radius.js`'s `classifyDiffFiles` — it reads `f.path` off each element of the `files` array, so map each bare filename from `git diff --name-only` to `{path: f}` before calling it (a bare string has no `.path` and would otherwise silently classify as `isSensitive: false` regardless of content). Pass the registry's patterns as the `sensitivePaths` argument — a result's `isSensitive: true` means a registry-pattern hit here, not a merge-sensitivity one; the function is generic path-glob matching regardless of which patterns list it's fed, and is already fully tested.
- The diff shows no added dependency in the project's own dependency manifest(s) — `package.json` (and any workspace-level equivalent), or `pyproject.toml`, `Cargo.toml`, `go.mod`, or equivalent for the project's stack (same manifest set `verification.md` Step 1 scans).
- No file in the diff matches a schema/env/IaC/CI/platform-config pattern — reuse Build Common Step 5.5's own Category A/B trigger list (`operational-checklist.md` in `skills/build/`).

If `docs/REGISTRY.md` doesn't exist, this pre-check cannot resolve the first condition — treat it as unmet (run the sub-scans normally) rather than skipping on incomplete information. This pre-check only applies under `fast-lane`; a `standard`-profile run (or standalone wrap-up, where no `config.yml` exists) always runs both sub-scans as before.

**Gate the read.** When the pre-check above did not fire, read `config-updates.md` in this skill's directory for both sub-scans in full — 6.1 CLAUDE.md and Rules (which conventions qualify, the size budget, and the write-the-incident-account-before-the-rule discipline for a new Don't) and 6.2 Decision Records (candidate gathering, the three-factor ADR gate from `_shared/decision-records.md`, and the `docs/decisions/NNNN-{slug}.md` proposal). Neither sub-scan writes anything; both only collect rows, which surface at the Step 8.6 Review Console or Step 9's batch table. When the pre-check fired, skip the read entirely.

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

## Step 7.9: CLAUDE.md Curation

The end of a piece of work is when a convention changed, a command was renamed, or an incident happened — the moment CLAUDE.md is most likely to have gone stale, and the moment the context explaining why is still available. Rotation finds the same drift weeks later, cold.

**Gate the read.** Run the audit when **any** of these holds:

- `/claude-tweaks:reflect` or the ledger produced a Don't candidate (a `[claude-md: …]`-tagged ledger entry, or a reflection insight naming a pattern that should not be repeated)
- A command listed in CLAUDE.md's `## Commands` section was renamed or removed in this work's diff
- A convention asserted in CLAUDE.md's `## Conventions` section is contradicted by this work's diff
- An incident account was recorded for this work

When one holds, read `_shared/harness-health-analysis.md` and apply it with `assetType: claude-md` against the project's `CLAUDE.md` — the same procedure Step 7 applies to skills. Findings **stage**; they never auto-apply, per that file's standing CLAUDE.md exception.

When **none** holds, skip the read and emit the mandatory summary line directly:

```
SCANNED {time} — Step 7.9 CLAUDE.md curation summary: audit not run (no CLAUDE.md-relevant signal in this work — no Don't candidate, no renamed command, no contradicted convention, no recorded incident).
Result: 0 staged.
Reversibility: N/A.
```

Auto mode appends this line to `decisions.md` under the `SCANNED` tag (`_shared/auto-decision-log.md`); interactive mode prints it inline. **`audit not run` is deliberate and must never be rendered as `no findings`** — a gate that never opened is indistinguishable from a clean CLAUDE.md unless the summary says which one happened. When the gate did open, the summary instead names the signal that opened it and the finding count, so the two cases are never confusable.

## Step 7.10: Memory curation (D4)

**Gate the read.** Classify every reflection insight and ledger learning not already routed by
Steps 6–7.9 through `_shared/learning-routing.md`. When none resolves to **D4**, emit the summary
line below with `0` resolved and skip this step. Otherwise read `memory-curation.md` in this
skill's directory for the full procedure — the dedup-and-stage rule and its `STAGED` line, the
standalone-wrap-up path, and the re-classification table for when no memory directory is available
(the lesson is never dropped for that reason alone).

**Mandatory summary**, emitted every run regardless of outcome:

```
SCANNED {time} — Step 7.10 memory curation: {N} insights classified, {M} resolved D4, {K} deduped against MEMORY.md. Reversibility: N/A.
```

Auto mode appends this line to `decisions.md` under the `SCANNED` tag; interactive mode prints it inline.

## Step 7.11: Upstream feedback (D5)

**Gate the read.** When `_shared/learning-routing.md` resolved **no** learning to D5, there is
nothing to stage: emit the summary line below with `0` resolved and skip this step. Otherwise read
`upstream-feedback.md` in this skill's directory for the full procedure — the self-reference check
that can collapse D5, the stage-never-file rule and its `STAGED` line, and the standalone-wrap-up
path that has no console to stage for.

**Mandatory summary**, emitted every run regardless of outcome:

```
SCANNED {time} — Step 7.11 upstream feedback: {N} learnings classified, {M} resolved D5 ({D} defect / {G} gap), self-reference: {collapsed|not applicable}. Reversibility: N/A.
```

Auto mode appends this line to `decisions.md` under the `SCANNED` tag; interactive mode prints it inline.

## Step 7.12: Broken-reference sweep

Find references pointing at something **this run renamed, moved, or removed**, and — when the
`autonomy` ceiling allows — repair them within the initiative budget. Unlike Step 7.7's D1 this
scans files this run did **not** touch, where orphans live and task-scoped review cannot reach.

**Gate the read.** Compute the rename/move/delete set (`git diff --diff-filter=RD --name-status
{base}...HEAD`) plus any heading or anchor a modified file renamed. Empty means no orphan can
exist: emit the summary with `0 targets` and skip — read neither file. Otherwise read
`reference-sweep.md` in this skill's directory, which owns the procedure and, at
`trusted`/`unattended`, defers to `_shared/initiative-budget.md` for the floor rule.

Mandatory summary line, regardless of outcome:

```
SCANNED {time} — Step 7.12 broken-reference sweep: {T} rename/delete targets, {H} surviving references, ceiling {ceiling}. Result: {A} repaired, {S} staged. Reversibility: high (separate commit).
```

Auto mode appends this line to `decisions.md`; interactive mode prints it inline. `0 targets` is a
real result and is reported, never omitted.

## Step 8: Analyze Next Steps (record-based only)

Determine:
1. **Newly unblocked records** — what can now be worked on? See below.
2. **Parallel opportunities** — which specs have no dependencies?
3. **Recommended next spec** — based on dependencies and logical flow

Suggest running `/claude-tweaks:help` to see the full workflow status.

### Newly unblocked records (record mode only)

The record this run just closed is already known — `record: {n}` from the materialized header (the same field the close-via-merge carrier commit used). Check whether closing it unblocked anything, purely informational — this must never gate, block, or delay the wrap-up; on any error, log and continue.

**Gate the read.** If this run is record mode (a materialized header exists at `${RUN_DIR}/work/*-spec.md`), read `unblocked-records.md` in this skill's directory — it holds the `work-backend: github-issues` (`work-links: body-text` or `native`) and `work-backend: local-files` procedures, the failure-mode handling, and the `decisions.md` log line. Otherwise — conversation-based work, which has no record whose closure could unblock a dependent — skip this sub-step entirely and do not read the file.

---

## Step 8.5: Nothing Left Behind (Gate)

Run the resolve gate from `/claude-tweaks:ledger` (see ledger skill for the three-phase procedure: Phase 1 fix-exhaust silently → Phase 2 present remainder for per-item user decision → Phase 3 apply).

**Gate the read.** Read `ledger/resolve-gate.md` when the ledger exists **and holds at least one item** — of any status, not just `open`. If the ledger doesn't exist (standalone wrap-up, or work predating the ledger), or exists but is empty, report "No ledger items to resolve" and skip this gate entirely without reading the file.

The same condition gates `nothing-left-behind.md` in this skill's directory — wrap-up's own wrapper around that gate: the item-existence rationale, the hard requirements (Phase 1 fix-exhaust before any user-facing output, Phase 2's mandatory per-item input, and what `auto` never silences), the terminal-status bulk-resolve fast path, and the ops-acknowledgment sub-step with its `unattended-tier` branch. When the gate is closed, read neither file.

---

## Step 8.6: Wrap-Up Review Console (back-loaded review)

The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). Runs in `auto` or `hybrid` mode when a pipeline run directory exists. Skipped in `interactive` mode and in standalone wrap-up. Reads `decisions.md`, `staged/`, and `config.yml` from the run directory, then presents one consolidated batch table with up to nine sections (Auto-applied / Pending review / Low-confidence findings / Contested findings / Skill updates / Documentation updates / Journey updates / Configuration updates / Cleanup actions) and three actions (Approve all / Override / Stop). The two coordination-derived sections (Low-confidence findings, Contested findings) render only when non-empty.

**Multi-spec defer:** when `MULTISPEC_REVIEW_DEFER=1` is set by `/flow` multi-spec orchestration, skip the per-spec console — the consolidated end-of-run console at `/flow` handles all approvals across every spec in the run. Leave `staged/` and `decisions.md` untouched, append a "deferred" log entry, and proceed to Step 9.

Empty-console fast path: skip the console entirely and proceed to Step 9 when all of `review-console.md`'s Empty-console fast path conditions hold (`decisions.md` has zero entries, `staged/` is empty, no skill/config updates exist, no cleanup actions apply, no queue writes, memory updates, or upstream feedback proposals are pending).

**Gate the read.** Read `review-console.md` in this skill's directory — for the run-directory resolution sequence, the multi-spec defer protocol, the Auto-merge short-circuit, the full console template with all nine section tables (including the conditionally-rendered Low-confidence and Contested findings sections), approval/override/stop semantics, and the sort-order requirement — when **either** holds:

- The console runs: mode is `auto` or `hybrid`, a pipeline run directory exists, `MULTISPEC_REVIEW_DEFER` is unset, and the empty-console fast path above does not apply; **or**
- This run has a materialized header (`${RUN_DIR}/work/*-spec.md`) whose issue carries a live `auto:merge` label (re-fetch via `gh issue view --json labels`).

The second condition exists because the **Auto-merge short-circuit** lives in `review-console.md`, not in this file — it is not part of the console rendering it precedes. Without it, a run that qualified for the empty-console fast path would silently skip its authorized auto-merge. In practice the fast path cannot fire on such a run (it requires "no cleanup actions apply," while items 4 and 8 always apply when a run directory exists), so this is a belt-and-braces guard against a latent ordering hazard, not a live bug.

In `interactive` mode and standalone wrap-up — where Step 8.6 is skipped outright — do not read the file at all.

---

## Step 9: Present Consolidated Summary

Render one consolidated summary of this run — State (from `bin/wrap-up-state.js`), Actions Performed, Decisions, Evidence — then, **only when Step 8.6's Review Console did not run** (interactive mode, standalone wrap-up, or the empty-console fast path — and never under `MULTISPEC_REVIEW_DEFER=1`), present the cleanup + configuration batch decision, followed by the per-item Queue writes / Memory updates / Upstream feedback sections for any proposal staged during this run. Close with the archival line.

**Read the template.** Read `summary-template.md` in this skill's directory for the standalone multi-record batch variant, the full render template, the conversation-mode variant, the conditional batch-decision branch with its `AskUserQuestion` shape, the three per-item sections that sit beside that batch but outside it (Queue writes `Q#`, Memory updates `M#`, Upstream feedback `U#` — each approved and executed one row at a time), and both closure lines (record mode and the legacy spec-file alias). Step 9 always runs, so this read is unconditional.

Next Actions are rendered as a top-level `## Next Actions` section after Step 10's verification — see the section near the end of this file. They replace the old single-line handoff with a context-signal-driven table.

## Step 10: Execute Approved Actions

Execute the cleanup planned in Step 5 (canonical list in `cleanup-procedures.md`, filtered by Condition) plus the configuration, documentation, skill, and acceptance-labeling actions approved at the Review Console (Step 8.6) or the Step 9 batch decision — then verify each one landed before the closure line is emitted.

**Gate the read.** Read `execution-and-verification.md` in this skill's directory — the `--dry-run` preview branch, the `MULTISPEC_REVIEW_DEFER` skip list, the full apply list (documentation, CLAUDE.md/rules, D2 new docs, docs-health restructural filings, ADRs, skill updates, and acceptance labeling with its own gated read of `verification-brief.md`), the closing-keyword carrier commit, and the Verify-execution checklist — when at least one approved action exists: a cleanup row surviving Step 5's Condition filter, an approved configuration / documentation / skill update, an approved memory write or upstream filing, or record-mode acceptance labeling. When Step 5 reported "No cleanup actions apply" and nothing else was approved, report "No actions to execute" and skip the read — there is nothing to commit or verify.

## Important Notes

- `/claude-tweaks:review` should have been run before `/claude-tweaks:wrap-up` — this skill assumes code quality is verified
- Skills document reusable patterns, not one-off implementations
- CLAUDE.md stays concise — use skills, rules, or reference docs for details
- Reflection insights with no clear destination must still be explicitly resolved — the user confirms "don't capture" with a reason, rather than the skill silently dropping them
- **Merge conflicts during wrap-up** (e.g., when merging a worktree feature branch back to main): resolve conflicts by understanding both sides' intent — read both versions, pick the correct merge. Never use `git reset` or `git checkout .` to discard changes.

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
| Running wrap-up before review | Captures learnings from unvalidated work |
| Deleting specs that aren't 100% complete | Leftover work needs routing first — use Step 4 |
| Adding every insight to CLAUDE.md | Size budget — route detail to skills, rules, or memory files |
| Skipping reflection for "simple" work | It still surfaces surprises and near-misses |
| Keeping design docs and plans after wrap-up | Consumed artifacts go stale — spec and code are the durable records |
| Silently dropping insights with no obvious destination | Every insight needs an explicit decision — "don't capture" needs a user-stated reason |
| Completing wrap-up with open ledger items | The nothing-left-behind gate: resolve every item before the summary |
| Scanning the entire skill library every wrap-up | Step 7's scan is bounded to the ~5 skills overlapping the changed files (~2 under a fast-lane ceremony profile, plus seeded skills) — a whole-library audit is noise |
| Skipping skill curation because nothing was ledger-tagged | Step 7's scan and gap detection run with zero seeds — candidates come from the work, not just tagged entries |
| Declaring "no skill updates needed" with no logged scan scope | Unfalsifiable without a record of scan scope and ranking depth — Step 7's mandatory `SCANNED` line (`skill-curation.md` 7.6) makes it auditable |
| Skipping doc curation because nothing was directly touched | Step 7.7's domain-overlap scan (D0) reads relevant docs this work didn't edit — skipping D0 skips the whole check |
| Declaring "no documentation updates needed" with no logged scan scope | Unfalsifiable without a record of scan scope — Step 7.7's mandatory `SCANNED` line (`docs-health-integration.md`) makes it auditable |
| Declaring "no journey updates needed" without checking `files:` frontmatter against the diff | Build-time `/journeys` and review's 3g-cov lens miss drift landing after their pass — only Step 7.8's fresh diff-vs-frontmatter recomputation catches it |
| Letting a closed sub-file gate suppress the step's `SCANNED` summary line | Steps 7 / 7.7 / 7.8 / 7.9 gate the *read* of their procedure file, never the *reporting* — a closed gate still emits the line from the step's inline template with `gap detection: not run`; silence and "found nothing" are otherwise indistinguishable |
| Gating `skill-curation.md`'s read on `.claude/skills/*.md` alone | `skill-curation.md` 7.2 step 2 requires gap detection even with no skills directory — Step 7's gate also opens on a cohesive multi-file diff |
| Proposing generic skill updates with no concrete anchor | Every update must trace to a ledger entry, a reflection insight, or a changed-file observation — unanchored ones read as hallucinated |
| Mixing skill updates into the doc/CLAUDE.md batch table | They require full file reads and Update Mode patches — own decision table in Step 7 |
| Writing an ADR for every decision | ADRs are valuable because rare — Step 6.2's ADR gate (hard-to-reverse AND surprising AND a real trade-off) keeps them so; zero per wrap-up is normal |
| Treating `demo:pending` as optional for "trivial" record-mode work | The Acceptance axis applies uniformly — triviality gets a fast path at `/demo`'s verdict step, not wrap-up's labeling step |
