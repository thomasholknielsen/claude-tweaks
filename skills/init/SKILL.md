---
name: claude-tweaks:init
description: Use when initializing the workflow system for a project — bootstraps structure, analyzes the codebase, generates CLAUDE.md with adaptive philosophy, skills, and rules. Re-run to find drift, gaps, and stale configuration.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Init — Project Bootstrap + Intelligent Configuration

Bootstrap the workflow system for a project AND generate intelligent configuration from codebase analysis. Handles everything from directory creation to CLAUDE.md generation, skills, rules, and journey discovery — in one command.

```
[ /claude-tweaks:init ] → /claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:stories → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
  ^^^^ YOU ARE HERE ^^^^
```

This skill works for both greenfield and brownfield projects, operating in two modes:

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Initial** | No `.claude/` directory or CLAUDE.md | Full bootstrap + reconnaissance → generate everything from scratch |
| **Update** | Existing `.claude/` config found | Skip bootstrap (idempotent) + diff-based audit → propose targeted patches |

## When to Use

- First time using the workflow system on a project
- After cloning a repo that uses this workflow (to verify dependencies + audit config)
- You've been handed a project you've never worked on before
- You want to audit/refresh an existing Claude Code setup after the codebase has evolved
- When `/claude-tweaks:help` or `/claude-tweaks:build` fails because something is missing
- The user says "set up the workflow," "get me started," "set up Claude Code for this repo," or "update my Claude config"

## Input

If `$ARGUMENTS` is provided, treat it as:
- A path to a repository (e.g., `~/projects/their-app`) — `cd` there first
- A GitHub URL — clone it first, then analyze
- A description of the project context (e.g., "Ruby on Rails monolith, team of 5")
- `--update` or `update` — force Update mode even if the config looks minimal
- `bootstrap` — run Phase 0 only (structure + deps), then stop
- `config` — run Phases 0 + 2 + 3 + 5 (bootstrap + recon + CLAUDE.md)
- `skills` — run Phases 0 + 2 + 3 + 4 + 6 (bootstrap + recon + skills)
- `journeys` — run Phases 0 + 8 (bootstrap + journey discovery)
- `docs` — run Phases 0 + 2 + 3 + 8.5 (bootstrap + doc registry)

If no arguments, analyze the current working directory. Phase 0 runs first, then a scope selection gate determines which remaining phases to run (see "Scope Selection Gate" below).

## Phases at a Glance

| Phase | What Happens | Output |
|-------|-------------|--------|
| **0** | Bootstrap structure (dirs, files, deps, git, browser) | Workflow infrastructure ready |
| **1** | Determine mode (Initial vs Update) | Mode decision + existing config inventory |
| **2** | Codebase reconnaissance (8 detection steps) | Raw findings: stack, architecture, conventions, pain points, maturity |
| **3** | Build profile (Initial) or drift report (Update) | Stack Profile or Configuration Health Report |
| **4** | Generate skill manifest | Scored + prioritized skill candidates. Priority 2-3 → INBOX |
| **5** | Generate / update CLAUDE.md | CLAUDE.md (how to work here). Improvement pain points → INBOX |
| **6** | Generate / update skills | SKILL.md files for approved skills. Aspirational skills → INBOX |
| **7** | Generate / update rules (optional) | Path-scoped `.claude/rules/` files |
| **8** | Discover user journeys (optional) | Journey files or skeleton INBOX items |
| **8.5** | Create doc registry | `docs/REGISTRY.md`. Doc work → INBOX |
| **9** | Present summary and confirm | Final confirmation before writing files |

---

## Phase 0: Bootstrap Structure

Fast, idempotent structural setup. Creates directories, starter files, and verifies dependencies. Skips anything that already exists.

**Core Bootstrap (Steps 1–8):**

### Step 1: Check Plugin Dependencies

Verify Superpowers plugin and the built-in code-simplifier subagent are available. Read `bootstrap-steps.md` (Step 1) for the dependency list, detection commands, and install hint.

### Step 2: Create Directory Structure

Create the required workflow directories — idempotent, only creates what's missing. Read `bootstrap-steps.md` (Step 2) for the directory taxonomy and per-directory rationale.

### Step 3: Create Starter Files

Create `specs/INBOX.md`, `specs/DEFERRED.md`, and `specs/INDEX.md` — only if missing, never overwrite. Read `bootstrap-steps.md` (Step 3) for the canonical starter content.

### Step 4: Suggest .gitignore Entries

Suggest entries for transient workflow artifacts; never modify `.gitignore` without asking. Read `bootstrap-steps.md` (Step 4) for the full suggested block and the stories-commit prompt.

### Step 5: Verify Git

Confirm the directory is a git repo; warn if not (review and wrap-up will be degraded). Read `bootstrap-steps.md` (Step 5) for the full procedure.

### Step 6: Worktree Configuration

Ensure `.worktrees/` exists in the project root; suggest migration if a legacy `.claude/worktrees/` is found. Also offers the `worktree.always` policy opt-in (recommended default: on) — the decision is queued here but the file write is deferred to avoid this same run denying its own later writes; see "Finalizing the worktree.always Decision" and "Worktree Policy Finalization" below. Read `bootstrap-steps.md` (Step 6) for the full procedure.

### Step 7: Browser Integration

Detect `agent-browser`; surface the install command if missing. Never block init, never auto-install, never prompt for backend choice. Read `bootstrap-steps.md` (Step 7) for the full procedure.

### Step 8: Statusline & Dependencies

Detect Node (and optionally git), install the statusline wrapper at `~/.claude-tweaks/bin/statusline.js`, and prompt before wiring `statusLine.command` in `~/.claude/settings.json` — never overwrite a non-claude-tweaks command. Read `bootstrap-steps.md` (Step 8) for the full procedure (detection, package-manager prompts, settings.json migration matrix, NO_COLOR opt-out).

**Optional Enhancements (Steps 9–14):**

### Step 9: GitHub Issue Form Template (Optional)

GitHub issue form template offer (agent-task.yml). Read `bootstrap-steps.md` (Step 9) for the full procedure.

### Step 10: Impeccable Design Integration (Optional)

When Phase 2 detects frontend signals, present the three-option Impeccable setup prompt (Full / Plugin-only / Skip) and write the `design-integration` flag to CLAUDE.md — the `/claude-tweaks:design` wrapper reads this as Layer 1 of its detection logic. Read `bootstrap-steps.md` (Step 10) for the full procedure (frontend-detection list, install sequence, flag-value table, re-run behavior, failure handling).

### Step 11: Diagram Design (Recommended Companion)

Always offered (not frontend-gated). Present the two-option diagram-design setup prompt (Install / Skip) and write the `diagram-integration` flag to CLAUDE.md under the existing `## Design integration` section. Soft-hook nudges in `/specify`, `/build`, and `/review` read this flag to decide whether to surface "consider a diagram here" recommendations. Read `bootstrap-steps.md` (Step 11) for the full procedure.

### Step 12: shadcn Bootstrap (Optional)

When frontend signals are detected and `components.json` doesn't exist (or exists without full AI-agent wiring), present the shadcn/ui setup prompt (Full / CLI-only / Skip, or the narrower "wire remaining layers" offer when the CLI is already initialized) and write the `shadcn-integration` flag to CLAUDE.md. Currently write-only — no other skill reads the flag yet. Read `bootstrap-steps.md` (Step 12) for the full procedure (framework/package-manager detection, install sequence, MCP/skills wiring, flag-value table, re-run behavior, failure handling).

### Step 13: Routine Installation (Optional Companion)

Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` without an existing instantiated record for this project, and offer to walk through `/claude-tweaks:routine create <skill> --source init` for each. Idempotent: skills with an existing record are never re-offered. Read `bootstrap-steps.md` (Step 13) for the full procedure.

### Step 14: Non-Default-Branch Issue Tracking (Optional Companion)

Offer only on projects with a GitHub remote — writes `.github/workflows/track-issue-fixes.yml`, which labels (`fix-on-<branch>`) and comments on issues fixed on non-default branches, then strips those labels once the fix reaches the default branch and GitHub closes the issue natively. Idempotent: skipped silently once the workflow file exists. Read `bootstrap-steps.md` (Step 14) for the full procedure.

---

### Finalizing the worktree.always Decision

If Step 6 (`bootstrap-steps.md`) queued a `worktree.always` decision and `$ARGUMENTS` was `bootstrap` (this invocation stops after Phase 0 — see "Input" above), write it now, as the last action before stopping: create `.claude-tweaks/` if it doesn't exist, then write or update the `worktree.always:` line in `.claude-tweaks/policy.yml` (merge into existing content — preserve every other line in the file untouched; create the file with just that one line if it didn't exist). If the decision was "Yes," tell the user: "`worktree.always` is now enforced — your next edit requires an isolated worktree; run `/superpowers:using-git-worktrees` first."

For every other scope, this decision is instead finalized at the end of Phase 9 — see "Worktree Policy Finalization" there.

---

## Scope Selection Gate

After Phase 0 completes, present the scope selection — unless `$ARGUMENTS` already specified a goal-based scope (e.g., `bootstrap`, `config`, `skills`, `journeys`, `docs`), in which case skip this gate and run the corresponding phases.

**Not silenced by `auto`.** The scope-selection gate is on the "What `auto` does NOT silence" list in `_shared/auto-mode-contract.md` — it is a project-shape governance decision that requires explicit user input regardless of `auto` state. The prompt below always renders unless `$ARGUMENTS` already specified a scope.

Call `AskUserQuestion` (see "Phases at a Glance" above for the full table; Phase 8 is auto-marked "Skip — no UI detected" when reconnaissance finds no user-facing surface):

- `question`: `"Bootstrap complete. How much setup do you want?"`, `header`: `"Setup scope"`, `multiSelect`: `false`
- Option 1 — `label`: `"Auto (Recommended)"`, `description`: `"Run all included phases without stopping"`
- Option 2 — `label`: `"Interactive"`, `description`: `"Pause for confirmation between phases"`
- Option 3 — `label`: `"Essentials"`, `description`: `"Reconnaissance + CLAUDE.md only (phases 2, 3, 5)"`
- Option 4 — `label`: `"Done"`, `description`: `"Just needed the bootstrap structure"`

**Option 1 (Auto):** Run all included phases end-to-end. Phase 3 auto-confirms classification when detection confidence is `high` and signals are consistent (otherwise presents the confirmation gate as a KEPT-PROMPT). Phase 4 still presents the skill selection (governance decision — never silenceable). Phase 9 still presents the final summary for confirmation (governance decision). All other phases run without pausing.

**Option 2 (Interactive):** After each phase completes, present its output, then call `AskUserQuestion`. This is a template — re-issue it once per phase (not a single static site), substituting `{N}`, `{N+1}`, `{description}`, and `{N+2}` each time:

- `question`: `"Phase {N} complete. Continue to Phase {N+1} ({description})?"`, `header`: `"Phase gate"`, `multiSelect`: `false`
- Option 1 — `label`: `"Continue (Recommended)"`, `description`: `"Proceed to Phase {N+1} ({description})"`
- Option 2 — `label`: `"Skip Phase {N+1}"`, `description`: `"Move to Phase {N+2}"`
- Option 3 — `label`: `"Done"`, `description`: `"Stop here"`

**Option 3 (Essentials):** Runs phases 2, 3, 5 only. Produces CLAUDE.md with proper philosophy and Don'ts. Defers skills, rules, journeys, and doc registry for later (suggest re-running `/init` or using goal-based arguments).

**Option 4 (Done):** Stop after Phase 0. The user has the directory structure, starter files, and dependencies — they'll configure manually or run `/init` again later.

### Phase dependencies

When a phase is excluded (by interactive skip, essentials mode, or goal-based argument), handle its dependents:

| If skipped | Impact | Handling |
|------------|--------|----------|
| Phase 2 (recon) | Phases 3-8.5 lose their input | Skip all dependent phases — cannot generate config without reconnaissance |
| Phase 3 (profile) | Phases 4, 5, 8.5 lose maturity/tier classification | Skip dependent phases — philosophy and doc tier need classification |
| Phase 4 (manifest) | Phase 6 has no skill list | Skip Phase 6 |
| Phase 5 (CLAUDE.md) | No downstream dependency | Safe to skip |
| Phase 6 (skills) | No downstream dependency | Safe to skip |
| Phase 7 (rules) | No downstream dependency | Safe to skip |
| Phase 8 (journeys) | No downstream dependency | Safe to skip |
| Phase 8.5 (doc registry) | No downstream dependency | Safe to skip |

When skipping a phase due to a missing dependency, note it: "Skipping Phase {N} ({name}) — requires Phase {dep} which was excluded."

---

## Phase 1: Determine Mode

Before any deep analysis, check what already exists:

```
Check:
- CLAUDE.md exists? Read it.
- .claude/skills/ directory? List all skills, read each SKILL.md frontmatter.
- .claude/rules/ directory? List all rules, read each.
- .claude/settings.json? Read it.
```

### If nothing exists → **Initial Mode** (skip to Phase 2)

### If config exists → **Update Mode** (proceed to Phase 1u)

Update Mode runs three sub-phases before deciding whether to continue with the full reconnaissance:

- **Phase 1u** — inventory existing CLAUDE.md, skills, and rules; classify findings as covered / stale / drifted / gap
- **Phase 1u.5** — detect claude-tweaks contract drift (missing pipeline section, auto-mode flag, bookend paragraph, auto-mode policy block, run-dir reference)
- **Phase 1u.6** — early-exit gate: if drift = 0 AND preliminary gaps < 3, skip to Phase 9 with a quick-audit summary; otherwise continue to Phase 2

Update Mode procedures live in `update-mode.md` — load only when Phase 1 detects existing config. That file contains the inventory template, the contract-drift marker table, and the early-exit decision logic.

---

## Phase 2: Codebase Reconnaissance

Work through these detection steps systematically. Use parallel tool calls aggressively — all glob/grep operations within a substep are independent and should run concurrently.

### 2a: Project Identity

```
Detect:
- README.md, CONTRIBUTING.md, docs/ — project purpose and domain
- LICENSE — open source vs proprietary
- .github/, .gitlab-ci.yml, Jenkinsfile, .circleci/ — CI/CD platform
- Monorepo vs single app (workspaces config, multiple package.json, apps/, packages/)
- Age — earliest commit date (`git log --reverse --format="%ai" -1`)
- Activity — commits in last 90 days, number of contributors
```

Steps 2b–2g cover stack detection, architecture detection, convention detection, workflow detection, pain point detection, and existing AI configuration detection. For the complete detection tables and checklists, read `detection-tables.md` in this skill's directory.

### 2h: Project Maturity Detection

Assess the project's maturity stage (greenfield / pre-launch / early-production / established) to inform the Philosophy section in CLAUDE.md. Gather signals in parallel and classify the project.

See **Phase 2h Maturity Detection** in `detection-tables.md` (this skill's directory) for the full signal table and classification criteria. Carry the classification forward to Phase 3, where it is presented alongside the doc tier for unified confirmation. Do NOT present the classification for confirmation here — Phase 3 is the single confirmation gate for all project classifications.

---

## Phase 3: Build the Profile / Drift Report + Project Classification

**Initial Mode** produces a Stack Profile (identity, stack table, architecture, conventions, workflows, health indicators, skill candidates) followed by a unified Project Classification confirmation. **Update Mode** produces a Drift Report (covered, stale, drifted, gap classifications). Both require user confirmation before proceeding.

For the complete profile and drift report templates, read `profile-templates.md` in this skill's directory.

### Project Classification (confirmation gate)

After presenting the Stack Profile (or Drift Report), present the unified Project Classification gate. This is the single gate where the user confirms or overrides all downstream decisions about philosophy and doc structure.

**Decision logic:**

- Compute detection confidence (`high` / `med` / `low`) for both maturity and doc-tier dimensions.
- **Auto-confirm** only when `auto` mode is set AND both dimensions are `high` confidence AND signals are internally consistent. Log to `decisions.md` and proceed.
- **Confirmation gate** in all other cases — interactive mode, or `auto` with `med`/`low` confidence, or contradictory signals (e.g., greenfield code + production-grade infra).

For the confidence rubric, auto-confirm log format, and full confirmation-gate template (table + philosophy + doc structure + numbered options), read `phase-3-classification.md` in this skill's directory.

Carry the confirmed maturity and doc tier forward to Phase 5 (CLAUDE.md Philosophy) and Phase 8.5 (Doc Registry).

---

## Phase 4: Generate Skill Manifest

**Initial Mode:** Score and prioritize all skill candidates.

**Update Mode:** Score only the **gaps**. Existing skills that need updating are handled as patches, not new skills.

> **Parallel execution:** Use parallel tool calls aggressively — scoring of independent skill candidates is read-only (re-checking grep/glob signals from Phase 2) and should run concurrently.
>
> **Parallel execution (conditional):** When the candidate list has ≥ 8 skills, dispatch scoring as parallel Task agents per the Subagent Contract (`_shared/subagent-output-contract.md`). Otherwise, run the scoring inline in the main thread.

Apply the **Frequency + Complexity + Danger** rubric (max 9). Generate skills scoring 6+ first. Skills not selected (Priority 2-3 or aspirational) become INBOX items with their scoring rationale and Phase 2 evidence — no reconnaissance is wasted.

For the full scoring rubric (with examples), the skill-category mapping reference, and the INBOX deferred-skill format, read `phase-4-scoring.md` in this skill's directory. For the Skill Manifest presentation template and the selection prompt, read `profile-templates.md` (Phase 4 section).

---

## Phase 5: Generate / Update CLAUDE.md

CLAUDE.md describes **how to work in this codebase** — the patterns to follow, the commands to run, the conventions to respect, and the mistakes to avoid. Every entry should help someone working in the codebase right now. Things that don't exist yet belong in INBOX, not here.

**Initial Mode** generates CLAUDE.md from scratch with sections for Stack, Structure, Commands, Conventions, Philosophy, Testing, Environment, Git, and Don'ts. **Update Mode** produces targeted patches, not rewrites. The Philosophy section adapts to detected project maturity. The Don'ts section is the highest-ROI output — mine it from convention conflicts and observed anti-patterns (not from missing infrastructure).

For the complete CLAUDE.md template, patch format, Philosophy generation guide, Don'ts mining guide, and principles, read `claude-md-template.md` in this skill's directory.

### Pain Point Routing

Phase 2f findings split into CLAUDE.md Don'ts (convention conflicts and anti-patterns) and INBOX items (missing infrastructure, practices, stale deps, dead code). For the INBOX item templates and the "Pain Points Routed" summary template, read `pain-point-routing.md` in this skill's directory.

---

## Phase 6: Generate / Update Skills

**Initial Mode** generates full SKILL.md files for each approved skill. **Update Mode** produces targeted patches for drifted skills and full SKILL.md for gap skills. Each generated skill must pass quality gates (codebase-grounded examples, working commands, project-specific anti-patterns). Skill depth scales with complexity score.

Only generate skills for patterns that **actually exist and are actively used** in the codebase. Aspirational skills (e.g., testing for a project with no tests) should have been captured as INBOX items in Phase 4 — do not generate SKILL.md files for them.

For the complete SKILL.md template and depth guide, read `skill-template.md` in this skill's directory. For the drift-patch procedure and quality gates applied to drifted/gap skills, read `_shared/harness-health-analysis.md` — the same procedure `/claude-tweaks:wrap-up` Step 7 and the standalone `/claude-tweaks:harness-health` routine use.

---

## Phase 7: Generate / Update Rules (optional)

Generate `.claude/rules/` files for **path-specific** conventions (e.g., "all files in `src/api/` must use the error handler"). Project-wide conventions belong in CLAUDE.md, not rules. For the rule frontmatter template, common rule candidates, and Update-Mode hint, read `rules-template.md` in this skill's directory.

---

## Phase 8: Discover User Journeys (Optional)

For projects with user-facing surfaces (web app, CLI, API with docs), offer to discover and document user journeys — especially valuable for brownfield projects with features but no documented flows. Skip for pure libraries or when `docs/journeys/` already has comprehensive coverage.

### Present the option:

```
This project has user-facing features but no documented user journeys.
User journeys help /review test the app against experiential expectations.

Would you like to discover and document journeys?
1. Yes — scan codebase for routes and user flows, create journey files **(Recommended)**
2. Yes, with browser — scan codebase AND walk the app in a browser for richer "should feel" details
3. Skip — I'll add journeys later
```

### Option 1: Codebase-only discovery

Use Phase 2 findings to identify routes/pages, infer personas (user roles, auth flows, public vs. authenticated), and group routes into goal-oriented journey skeletons. Write skeleton files to `docs/journeys/` (use `journey-template.md` from the `/claude-tweaks:journeys` skill directory) — each one stamped `**Status:** Skeleton — inferred from code, not yet browser-tested`. Skeletons document the intended flows but "should feel" fields are weaker until browser-tested.

**Capture enrichment as INBOX items** for each skeleton journey:

```markdown
### Browser-test journey: {name}
Skeleton journey inferred from code — "should feel" and "red flags" need browser validation.
Routes covered: {list}. Persona: {persona}. Dev URL: {if known}.
Run `/review journey:{name}` to enrich with experiential details.
```

### Option 2: Hybrid discovery (codebase + browser)

Delegate to `/claude-tweaks:visual-review discover` — runs the full 6-phase discovery process (codebase scan → journey candidates → browser walkthrough → write files → coverage report → handoff). Ask the user for the dev server URL before invoking.

### Option 3: Skip

Note that the user skipped journey discovery. Suggest running `/visual-review discover` later when they're ready.

---

## Phase 8.5: Create Doc Registry

Create the documentation registry that maps project docs to the code areas they cover. This registry is consumed by `/build` (Step 6.5) to auto-update docs when relevant code changes, and by `/wrap-up` (Step 6) for final sweep and registry maintenance.

**Use the confirmed doc tier** from Phase 3 — do not re-detect.

For the complete procedure (registry format, tier definitions, standard folder taxonomy, common Auto-detect patterns, inventory → assess → batch table → create → INBOX-capture flow, and Update-Mode diff logic), read `docs-structure.md` in this skill's directory.

---

## Phase 9: Present Summary and Confirm

Present a consolidated summary of all work done across Phase 0 (bootstrap) and Phases 1-8 (configuration). Wait for user confirmation before writing generated files.

Both modes lead with a **Verified & Consistent** section — an affirmative report of what was checked and found healthy (dependencies present, contract markers up to date, config items still accurate, detections confirmed), not just what changed or was created. This is required, not optional: Update Mode in particular often proposes few or no changes, and the user needs to see *what was audited and deliberately left alone*. The early-exit fast path (Phase 1u.6) carries its own shorter Verified & Consistent block.

For the complete summary templates for both modes, read `summary-templates.md` in this skill's directory.

### Worktree Policy Finalization

If Step 6 (`bootstrap-steps.md`) queued a `worktree.always` decision, write it now — this is the deferred write described in Step 6, deferred specifically so this run's own Steps 7-14 and Phases 1-8.5 writes were never blocked by a policy that turned on mid-run. (The `bootstrap`-only scope already wrote its queued decision immediately after Step 14 — see "Finalizing the worktree.always Decision" after Phase 0 — so there is nothing to do here for that scope.)

Create `.claude-tweaks/` if it doesn't exist. Read `.claude-tweaks/policy.yml` if present; if it has an existing `worktree.always:` line, replace that line, otherwise append a new `worktree.always: {true|false}` line (create the file with just that line if it didn't exist). Preserve every other line in the file untouched.

If the decision was "Yes," add one line to the Phase 9 summary: "`worktree.always` is now enforced — your next edit requires an isolated worktree; run `/superpowers:using-git-worktrees` first."

### Actions Performed

After writing files, surface what was created. Generate the table from the actual artifacts produced this run (only include rows for actions that actually occurred):

| Action | Detail | Ref |
|--------|--------|-----|
| Bootstrap | Created `specs/`, `docs/`, `docs/journeys/`, `.worktrees/`, etc. (only missing dirs) | Step 2 |
| Starter files | Wrote `specs/INBOX.md`, `specs/DEFERRED.md`, `specs/INDEX.md` (only if missing) | Step 3 |
| Statusline | Installed wrapper at `~/.claude-tweaks/bin/statusline.js`; wired `~/.claude/settings.json` | Step 8 |
| Design integration | Set `design-integration: {enabled/plugin-only/disabled}` in CLAUDE.md | Step 10 |
| shadcn integration | Set `shadcn-integration: {enabled/cli-only/disabled}` in CLAUDE.md | Step 12 |
| Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 13 |
| Worktree policy | Set `worktree.always: {true/false}` in `.claude-tweaks/policy.yml` (only if Step 6 asked this run) | Step 6 |
| Classification | Confirmed maturity `{value}`, doc tier `{N}` | Phase 3 |
| CLAUDE.md | Wrote {N} lines (Initial) / Applied {N} patches (Update) | Phase 5 |
| Skills | Generated {N} SKILL.md files: `{list}` | Phase 6 |
| Rules | Created {N} path-scoped rules in `.claude/rules/` | Phase 7 |
| Journeys | Wrote {N} skeleton journey files (or delegated to `/visual-review discover`) | Phase 8 |
| Doc registry | Created `docs/REGISTRY.md` with {N} entries | Phase 8.5 |
| INBOX | Added {N} items (deferred skills, pain points, doc work, skeleton enrichment) | Phases 4-8.5 |

Execute only after user confirmation.

---

## Next Actions

Resolve the recommended action from the signals that fired during this run. This lookup table is the assistant's own resolution logic — it stays internal and is never itself shown to the user or converted into an `AskUserQuestion` option. Resolve signals top-to-bottom; the first matching row is the recommendation. The signal rows are not exhaustive over every possible post-init state (e.g. Update Mode completing normally with zero drift and no INBOX writes matches none of them) — when no signal row matches, use the Fallback row so there is always a defined recommendation.

| Signal | Recommended Next Action |
|--------|------------------------|
| Update Mode ran AND total drift count > 0 | `/claude-tweaks:tidy` — clean up drifted/stale config and INBOX items before resuming feature work |
| INBOX has items written this run (deferred skills, pain points, doc work, skeleton enrichment) | `/claude-tweaks:tidy` — triage what /init just captured |
| Initial Mode ran AND INBOX is empty | `/claude-tweaks:capture {idea}` — capture the first idea or feature into INBOX for triage |
| Everything is clean (Update Mode early-exit OR Initial Mode with nothing routed to INBOX) | `/claude-tweaks:help` — see the full lifecycle overview and current pipeline status |
| Fallback (no row above matches) | `/claude-tweaks:help` — see the full lifecycle overview and current pipeline status |

Once resolved to a single recommended row, call `AskUserQuestion` with exactly 3 options — the resolved recommendation, plus the two "Always" actions below:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — the resolved recommendation from the table above, `label`: a short one-line summary of it suffixed `(Recommended)`, `description`: the full command text from the matched row
- Option 2 — `label`: `"Specify next feature"`, `description`: `"/claude-tweaks:specify {first feature topic} — jump straight to specifying the first lifecycle feature"`
- Option 3 — `label`: `"Tidy backlog"`, `description`: `"/claude-tweaks:tidy — review INBOX and DEFERRED items"`

If the resolved recommendation is itself `/claude-tweaks:tidy` (rows 1 or 2), it and Option 3 refer to the same command — collapse them into a single `(Recommended)` option rather than presenting `/claude-tweaks:tidy` twice, leaving 2 options for that call instead of 3.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Modifying existing INBOX.md or INDEX.md content | Phase 0 is additive — it creates missing files but must not overwrite user content |
| Skipping CLAUDE.md generation | Without CLAUDE.md, /claude-tweaks:review can't find verification commands |
| Running init in a non-git directory without warning | /claude-tweaks:review and /claude-tweaks:wrap-up depend on git — the user should know about degraded behavior |
| Installing browser tools without asking | Browser integration is optional — surface the install command but never run `npm install` automatically |
| Prompting for a browser backend choice | There is only one backend (`agent-browser`) — do not present a choice |
| Generating generic skills (e.g., `auth.md`, `api-routes.md`) | These are not real conventions — they're feature names. Real skills must encode rules, anti-patterns, or "Why this is done this way" insights grounded in patterns actually observed in the codebase. If the project doesn't use WebSockets, don't create a realtime skill. If it has no tests, capture testing as an aspirational INBOX item, not a SKILL.md file. |
| Generating generic skills not grounded in the codebase | Skills must encode observed patterns — generic advice adds noise, not value |
| Rewriting CLAUDE.md in Update Mode | Update Mode produces patches, not rewrites — existing config embeds hard-won lessons |
| Over-generating skills (15 mediocre > 5 excellent) | Each skill must earn its existence by encoding knowledge that would otherwise be lost |
| Skipping team input | Code archaeology alone misses social conventions — PR process, deploy cadence, naming debates |
| Aspirational Don'ts for things that don't exist | Don'ts are guardrails for existing patterns, not wishes for missing infrastructure. "No CI" is an INBOX item, not a Don't. |
| Putting improvement ideas in CLAUDE.md | CLAUDE.md describes how to work in the codebase as it is — improvement opportunities belong in INBOX with Phase 2 context |
| Generating skills for patterns that don't exist yet | Aspirational skills (testing for a project with no tests) become INBOX items with Phase 2 evidence, not SKILL.md files |
| Hardcoding greenfield philosophy for all projects | The Philosophy section must adapt to detected project maturity — what's correct for a greenfield project is dangerous for an established one |
| Creating doc files with only TODO placeholders | Phase 2 reconnaissance has the data — generate real content grounded in actual findings. If a doc would be < 20 lines of real content, it belongs in README instead of its own file. |
| Skipping journey discovery for projects with user-facing features | Journeys are what `/review` tests against — without them, visual QA has no experiential anchor |
| Writing journey "should feel" without actually using the app | Codebase-only skeletons are a starting point but the "should feel" is weaker — mark them as skeletons |

## Important Notes

- **This skill is idempotent** — safe to re-run. Phase 0 only creates what's missing. Phases 1-8 detect whether to generate fresh or patch existing config.
- **One session is not enough** — the initial skill set will be ~70% right. Expect to refine skills after the first week of actual use. Tell the user this explicitly.
- **Re-run periodically** — run in Update Mode after major refactors, stack upgrades, or when skills start feeling stale. A quarterly cadence works for active projects.
- **Update Mode should be fast** — Phase 1u.6's early-exit gate skips Phases 2-8.5 when drift is zero and preliminary gaps are < 3. Re-run with `--full` to force the complete pass.
- **Don't over-generate** — 5 excellent skills beat 15 mediocre ones. The Anti-Patterns section above covers the specific failure modes (aspirational Don'ts, generic skills, improvements-in-CLAUDE.md). Read those before adding to either output.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | First skill to use after /claude-tweaks:init — add ideas to the INBOX |
| `/claude-tweaks:help` | Shows workflow status — useful to verify /claude-tweaks:init worked. Surfaces doc staleness signals from the registry. |
| `/claude-tweaks:review` | /review lens 3i uses the doc registry to check documentation freshness. |
| `/claude-tweaks:visual-review` | Phase 8 (hybrid mode) delegates to `/visual-review discover` for browser-assisted journey discovery. |
| `/claude-tweaks:build` | /init creates `docs/REGISTRY.md` (Phase 8.5) that /build consumes in Step 6.5 for documentation sync |
| `/claude-tweaks:wrap-up` | Captures learnings after features — keeps generated skills alive and accurate. Step 7 references `skill-template.md` from /claude-tweaks:init's directory. /wrap-up Step 6 maintains the doc registry created by /init. |
| `/claude-tweaks:tidy` | /tidy Step 4.6 audits doc registry health — flags stale entries, gaps, pattern drift. Suggests `/init update` for tier drift. |
| `/claude-tweaks:browse` | Depends on `agent-browser`, which /claude-tweaks:init detects (and surfaces install instructions for) in Phase 0 |
| `/claude-tweaks:design` | Step 10 sets up Impeccable design integration (install plugin + CLI, optionally run `init`) and writes the `design-integration` kill-switch flag to CLAUDE.md that the wrapper reads as Layer 1 of its detection logic. |
| `cathrynlavery/diagram-design` (companion) | Step 11 offers to install the external `diagram-design` plugin and writes the `diagram-integration` flag to CLAUDE.md. Soft-hook nudges in `/specify`, `/build`, and `/review` read the flag to decide whether to surface "consider a diagram here" recommendations. |
| `shadcn/ui` (companion) | Step 12 offers to bootstrap the shadcn CLI, wire its official MCP server into `.mcp.json`, and install shadcn's official Skill (`skills add shadcn/ui`) for live Claude Code project context. Writes the `shadcn-integration` flag to CLAUDE.md — currently write-only, no other skill reads it yet. |
| `/superpowers:using-git-worktrees` | /claude-tweaks:init optionally configures the worktree directory that `using-git-worktrees` needs |
| `/claude-tweaks:stories` | /init Phase 8 (journey discovery) feeds /stories — discovered journeys become input for story generation |
| `/claude-tweaks:version` | /version reads the same `plugin.json` that /init may print during bootstrap |
| `/claude-tweaks:routine` | Step 13 discovers claude-tweaks skills shipping a `routine-template.yml` with no existing instantiated record, and offers to invoke `/claude-tweaks:routine create <skill> --source init` for each — pure discovery + handoff. |
| `/claude-tweaks:harness-health` and `_shared/harness-health-analysis.md` | Phase 6's drift-patch procedure and Phase 3/1u's skill classification apply this shared procedure instead of an inline copy, sharing its judgment logic and `.claude-tweaks/harness-health/` cursor/cache state with `/claude-tweaks:wrap-up` Step 7 and the standalone routine. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. Phase 3 classification auto-confirm follows the contract's confidence-gated pattern. |
| All workflow skills | Depend on the structure /claude-tweaks:init creates |
