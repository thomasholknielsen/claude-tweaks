---
name: claude-tweaks:init
description: Use when initializing the workflow system for a project — bootstraps structure, analyzes the codebase, generates CLAUDE.md with adaptive philosophy, skills, and rules. Re-run to find drift, gaps, and stale configuration.
argument-hint: "[<path>|<github-url>|<description>|--update|update|--full|--core-only|bootstrap|config|skills|journeys|docs|github-remote|issue-form|design-integration|diagram-suggestions|shadcn-integration|cloud-parity|routines|branch-tracking|work-backend]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.


# Init — Project Bootstrap + Intelligent Configuration

Bootstrap the workflow system for a project AND generate intelligent configuration from codebase analysis. Handles everything from directory creation to CLAUDE.md generation, skills, rules, and journey discovery — in one command.

Lifecycle: **`/claude-tweaks:init`** → `/claude-tweaks:capture` — first step of the chain; the full chain is in `/claude-tweaks:help`.

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

If `$ARGUMENTS` resolves to a path to a repository (e.g., `~/projects/their-app`) or a GitHub URL, `cd`/clone there first, then analyze — evaluated before any token classification below.

Otherwise, `$ARGUMENTS` splits on whitespace into tokens. Each token classifies as one of:

**Modifier flags** — compose with anything else present:
- `--update` or `update` — force Update mode even if the config looks minimal
- `--full` — force the complete reconnaissance pass (Phases 2-8.5) even when Update Mode's Phase 1u.6 early-exit gate would otherwise skip straight to Phase 9; composes with `--update`/`update` (e.g. `update --full`)
- `--core-only` — within Phase 0, skip the Optional Enhancements (Steps 9-17) entirely, equivalent to auto-declining every optional-enhancement offer, then continue into whatever scope this invocation would otherwise run. Contradicts any Enhancement filter token below present in the same invocation — see "Unrecognized and conflicting tokens."

**Phase scopes** — determine which of Phases 2-8.5 run after Phase 0. The union of every Phase scope present runs (e.g. `skills journeys` runs the phases for both).
- `bootstrap` — run Phase 0 only (structure + deps), then stop
- `config` — run Phases 0 + 2 + 3 + 5 (bootstrap + recon + CLAUDE.md)
- `skills` — run Phases 0 + 2 + 3 + 4 + 6 (bootstrap + recon + skills)
- `journeys` — run Phases 0 + 8 (bootstrap + journey discovery)
- `docs` — run Phases 0 + 2 + 3 + 8.5 (bootstrap + doc registry)

**Enhancement filter tokens** — narrow which of Phase 0's Optional Enhancements (Steps 9-17) get offered. With none present, Phase 0 offers every step in the table below (or none, under `--core-only`). With one or more present, Phase 0 offers *only* the named step(s), regardless of which (if any) Phase scope is also present:

| Token | Runs |
|---|---|
| `github-remote` | Step 9 — Establish GitHub remote, alone |
| `issue-form` | Step 10 — GitHub issue form template. Hard-depends on Step 9 having run — if `github-remote` wasn't also given (and no remote exists yet), `issue-form` runs Step 9 first anyway (interactive mode only — Step 9 never runs under `auto`, and it prompts before doing anything) |
| `design-integration` | Step 11 — Impeccable design integration |
| `diagram-suggestions` | Step 12 — Diagram suggestions |
| `shadcn-integration` | Step 13 — shadcn bootstrap |
| `cloud-parity` | Step 14 — Cloud/Routine parity setup, alone. Hard-depends on Step 9 having run — if `github-remote` wasn't also given (and no remote exists yet), `cloud-parity` runs Step 9 first anyway (interactive mode only — Step 9 never runs under `auto`, and it prompts before doing anything) |
| `routines` | Step 15 — Routine installation. Hard-depends on Step 14 having run — if `cloud-parity` wasn't also given (or already configured from an earlier run), `routines` silently runs Step 14 first anyway, matching the unfiltered flow's existing 14-before-15 ordering |
| `branch-tracking` | Step 16 — Non-default-branch issue tracking. Hard-depends on Step 9 having run — if `github-remote` wasn't also given (and no remote exists yet), `branch-tracking` runs Step 9 first anyway (interactive mode only — Step 9 never runs under `auto`, and it prompts before doing anything) |
| `work-backend` | Step 17 — Work-record backend. Hard-depends on Step 9 having run — if `github-remote` wasn't also given (and no remote exists yet), `work-backend` runs Step 9 first anyway (interactive mode only — Step 9 never runs under `auto`, and it prompts before doing anything) |

Examples (assuming Steps 1-8 actually run this time — see "Core Bootstrap Version Check" below for when they're skipped instead): `routines` alone runs Steps 1-8, then only Steps 14+15, then stops (same "stop after Phase 0" behavior as `bootstrap`). `config routines` runs Steps 1-8, then only Steps 14+15, then Phases 2, 3, 5. `shadcn-integration branch-tracking` runs Steps 1-8, then only Steps 13 and 16, then stops.

A description of the project context (e.g., "Ruby on Rails monolith, team of 5") is still accepted as free text — see "Unrecognized and conflicting tokens" for how this is distinguished from an attempted-but-unmatched keyword.

Every Phase scope above still runs Phase 9 as its terminal summary/confirm/write step, except `bootstrap` (which stops the invocation after Phase 0) — this includes the goal-based Phase scopes (`config`, `skills`, `journeys`, `docs`) even though none of them list Phase 9 explicitly in their phase subset above. An invocation with one or more Enhancement filter tokens and no Phase scope also stops after Phase 0, same as `bootstrap` — Enhancement filter tokens narrow *what Phase 0 does*, they don't add phases after it. The interactive Scope Selection Gate's own early-stop choices (Option 4 "Done," and Option 2 Interactive's per-phase "Done") are the other paths that stop before Phase 9; see "Finalizing the worktree.always Decision" for why this distinction matters.

If no arguments, analyze the current working directory. Phase 0 runs first, then a scope selection gate determines which remaining phases to run (see "Scope Selection Gate" below).

### Unrecognized and conflicting tokens

If every token classifies into one of the categories above (or the whole string is a path/URL), proceed as described. If a token matches none of them:

- If the overall string reads as prose (contains a comma, or multiple natural-language words forming a sentence, e.g. "Ruby on Rails monolith, team of 5") — treat the whole string as a project-context description, no interruption. Unchanged from before.
- Otherwise (a single unmatched token, or a short sequence of tokens that looks like an attempted scope rather than prose) — stop before running anything. Call `AskUserQuestion`: name the unrecognized token(s), list the valid tokens grouped by category (modifier flags / Phase scopes / Enhancement filter tokens), and include an explicit "No — treat this literally as a project-context description" option, so a genuine single-word description (e.g. "monorepo") still works, at the cost of one confirmation. Do not silently guess either interpretation — this matches `/claude-tweaks:tidy`'s "Unknown scope name" handling, `/claude-tweaks:capture`'s "Unknown or invalid `N`" handling, and `/claude-tweaks:version`'s "not silently treated as any of the documented modes" rule.

An explicit Enhancement filter token given together with `--core-only` is a contradiction (one asks for exactly that step, the other asks for none) — report it the same way: state plainly that the two conflict and ask which was meant, rather than silently letting one win.

## Phases at a Glance

| Phase | What Happens | Output |
|-------|-------------|--------|
| **0** | Bootstrap structure (dirs, files, deps, git, browser) | Workflow infrastructure ready |
| **1** | Determine mode (Initial vs Update) | Mode decision + existing config inventory |
| **2** | Codebase reconnaissance (8 detection steps) | Raw findings: stack, architecture, conventions, pain points, maturity |
| **3** | Build profile (Initial) or drift report (Update) | Stack Profile or Configuration Health Report |
| **4** | Generate skill manifest | Scored + prioritized skill candidates. Priority 2-3 → backlog |
| **5** | Generate / update CLAUDE.md | CLAUDE.md (how to work here). Improvement pain points → backlog |
| **6** | Generate / update skills | SKILL.md files for approved skills. Aspirational skills → backlog |
| **7** | Generate / update rules (optional) | Path-scoped `.claude/rules/` files |
| **8** | Discover user journeys (optional) | Journey files or skeleton backlog work records |
| **8.5** | Create doc registry | `docs/REGISTRY.md`. Doc work → backlog |
| **9** | Present summary and confirm | Final confirmation before writing files |

---

## Phase 0: Bootstrap Structure

Fast, idempotent structural setup. Creates directories, starter files, and verifies dependencies. Skips anything that already exists.

### Core Bootstrap Version Check (runs before Step 1)

Before running Steps 1-8, read `.claude-tweaks/init-state.yml` (treat as absent if missing or malformed) and compare its `core-bootstrap.plugin-version` against `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`'s `version` field (the same field `/claude-tweaks:version` treats as the sole source of truth) via `bin/lib/changelog.js`'s `compareVersions`. Read `bootstrap/version-check.md` for the exact commands.

| Marker state | Action |
|---|---|
| Missing | Run Steps 1-8 fully. No changelog notice — nothing to diff against yet. |
| Present, versions match, or marker newer than installed (shouldn't happen in practice, treat identically) | Skip Steps 1-8 entirely; print a one-line confirmation naming the marker's own recorded version and date, and mentioning that deleting `.claude-tweaks/init-state.yml` forces a full re-check. |
| Present, marker version older than installed | Run Steps 1-8 fully, then surface the changelog notice below. |

**Exception:** an explicitly-named `bootstrap` Phase scope (see `## Input`) always runs Steps 1-8 fully, regardless of the marker — `bootstrap` documents itself as "run Phase 0 only (structure + deps)," and a version-match skip would silently turn an explicit request for exactly that into a near no-op.

**Changelog notice (version-mismatch case only).** Read the plugin's own `${CLAUDE_PLUGIN_ROOT}/CHANGELOG.md` (not the target project's — the marker records a *plugin* version, so only the plugin's own changelog is meaningful to diff against) and call `bin/lib/changelog.js`'s `extractChangelogRange` for the range between the marker's old version (exclusive) and the installed version (inclusive). Synthesize a short summary limited to entries that change what `/init` offers, writes to CLAUDE.md, or exposes as a scope/config key — omit internal-only entries (bug fixes, refactors with no `/init`-visible behavior change). Present as an informational note, not a gate, ending with a pointer to `/init update --full` (or a narrower scope) if the user wants to act on anything it surfaces. No cap on how large the range is — if it spans an unusually large number of releases, say so explicitly.

**Write the marker** after Steps 1-8 have run (or been skipped) — i.e. as the last step of this whole Core Bootstrap Version Check, not before Steps 1-8 execute — regardless of which branch ran. Unlike the `worktree.always` decision (see "Finalizing the worktree.always Decision" below), this write creates no new gate that could deny this same invocation's own remaining steps, so there is no need to defer it further than that. Create `.claude-tweaks/` if it doesn't exist yet.

**Core Bootstrap (Steps 1–8):**

### Step 1: Check Plugin Dependencies

Verify Superpowers plugin and the built-in code-simplifier subagent are available. Read `bootstrap/step-01-check-plugin-dependencies.md` for the dependency list, detection commands, and install hint.

### Step 2: Create Directory Structure

Create the required workflow directories — idempotent, only creates what's missing. Read `bootstrap/step-02-create-directory-structure.md` for the directory taxonomy and per-directory rationale.

### Step 3: Create Starter Files

Create `specs/INDEX.md` — only if missing, never overwrite. Read `bootstrap/step-03-starter-files.md` for the canonical starter content.

### Step 4: Suggest .gitignore Entries

Suggest entries for transient workflow artifacts; never modify `.gitignore` without asking. Read `bootstrap/step-04-gitignore-suggestions.md` for the full suggested block and the stories-commit prompt.

### Step 5: Verify Git

Confirm the directory is a git repo; warn if not (review and wrap-up will be degraded). Read `bootstrap/step-05-verify-git.md` for the full procedure.

### Step 6: Worktree Configuration

Ensure `.worktrees/` exists in the project root for the git-fallback path; leave any `.claude/worktrees/` directory alone as a separate, harness-owned convention that needs no migration. Also offers the `worktree.always` policy opt-in (recommended default: on) — the decision is queued here but the file write is deferred to avoid this same run denying its own later writes; see "Finalizing the worktree.always Decision" and "Worktree Policy Finalization" below. Read `bootstrap/step-06-worktree-configuration.md` for the full procedure.

### Step 7: Browser Integration

Detect `agent-browser`; surface the install command if missing. Never block init, never auto-install, never prompt for backend choice. Read `bootstrap/step-07-browser-integration.md` for the full procedure.

### Step 8: Statusline & Dependencies

Detect Node (and optionally git), install the statusline wrapper at `~/.claude-tweaks/bin/statusline.js`, and prompt before wiring `statusLine.command` in `~/.claude/settings.json` — never overwrite a non-claude-tweaks command. Read `bootstrap/step-08-statusline-and-dependencies.md` for the full procedure (detection, package-manager prompts, settings.json migration matrix, NO_COLOR opt-out).

**Optional Enhancements (Steps 9–17):** Skipped entirely when `$ARGUMENTS` contains `--core-only` — treat every offer below as declined with no prompt shown, and proceed straight to whatever this invocation runs after Phase 0 (the Scope Selection Gate, or a composed goal-based Phase scope). Narrowed to a subset when `$ARGUMENTS` contains one or more Enhancement filter tokens — see the `## Input` section's Enhancement filter tokens table for the full list and each token's own ordering/hard-depends notes.

### Step 9: Establish GitHub Remote (Optional)

Interactive-only — never runs in `auto`/non-interactive mode. When no git remote is configured at all (any existing remote, GitHub or not, skips this step), offers to get the `gh` CLI installed and authenticated, then offers to create a GitHub repository (personal account or an org, confirmed name defaulting to the project folder, private/public) and link it as `origin`. Establishes the remote that Steps 10/14/16/17 below each independently check for — declining any offer here falls through to their existing behavior unchanged. Read `bootstrap/step-09-establish-github-remote.md` for the full procedure.

### Step 10: GitHub Issue Form Template (Optional)

GitHub issue form template offer (agent-task.yml). Read `bootstrap/step-10-github-issue-form.md` for the full procedure.

### Step 11: Impeccable Design Integration (Optional)

When Phase 2 detects frontend signals, present the three-option Impeccable setup prompt (Full / Plugin-only / Skip) and write the `design-integration` flag to CLAUDE.md — the `/claude-tweaks:design-wrapper` wrapper reads this as Layer 1 of its detection logic. Read `bootstrap/step-11-impeccable-design-integration.md` for the full procedure (frontend-detection list, install sequence, flag-value table, re-run behavior, failure handling).

### Step 12: Diagram Suggestions

Always offered (not frontend-gated). Present the two-option diagram-suggestions prompt (Enable / Skip) and write the `diagram-suggestions` flag to CLAUDE.md under the existing `## Design integration` section. Soft-hook nudges in `/journeys`, `/specify`, and `/review` read this flag to decide whether to suggest invoking `/claude-tweaks:visualize`. No install step — `/claude-tweaks:visualize` is a native skill. Read `bootstrap/step-12-diagram-suggestions.md` for the full procedure.

### Step 13: shadcn Bootstrap (Optional)

When frontend signals are detected and `components.json` doesn't exist (or exists without full AI-agent wiring), present the shadcn/ui setup prompt (Full / CLI-only / Skip, or the narrower "wire remaining layers" offer when the CLI is already initialized) and write the `shadcn-integration` flag to CLAUDE.md. Currently write-only — no other skill reads the flag yet. Read `bootstrap/step-13-shadcn-bootstrap.md` for the full procedure (framework/package-manager detection, install sequence, MCP/skills wiring, flag-value table, re-run behavior, failure handling).

### Step 14: Cloud/Routine Parity Setup (Optional)

Always offered when a GitHub-flavored remote is reachable (same GHE-safe two-tier check as Step 9) — warns live if the current branch differs from the repo's actual GitHub default branch (cloud sessions/Routines check out the default branch, so declarations made elsewhere don't take effect until merged there), declares `claude-tweaks` + `superpowers` in the project's `.claude/settings.json#enabledPlugins` (so cloud sessions and scheduled Routines get the same skills available locally, not just this machine's user-level config), batch-offers mirroring any other plugin the user has enabled locally, generates a committed `scripts/claude-cloud-setup.sh` that materializes them in a fresh cloud sandbox, and writes a `## Cloud parity` CLAUDE.md section documenting the manual Setup-script paste this doesn't automate plus two operational caveats (branch-checkout mismatch, first-exposure registration lag) and a report-only MCP-parity note. Runs before Step 15 (Routine Installation) deliberately — a Routine created before this step would silently fail its first cloud firing. Idempotent: re-running with nothing new to declare or mirror reports "already configured" instead of re-prompting — the branch check itself still runs every time. Read `bootstrap/step-14-cloud-routine-parity.md` for the full procedure.

### Step 15: Routine Installation (Optional Companion)

Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` without an existing instantiated record for this project, present them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, and invoke `/claude-tweaks:routine create <skill> --defaults --environment=<id> --source init` for each selected candidate — no per-candidate interactive walkthrough. Idempotent: candidates with an existing record are never re-offered — but Update Mode does audit existing records for drift, relevance, and environment dedication; see `update-mode.md`'s Routine Drift, Routine Relevance, and Routine Environment Dedication entries. Read `bootstrap/step-15-routine-installation.md` for the full procedure.

### Step 16: Non-Default-Branch Issue Tracking (Optional Companion)

Offer only on projects with a GitHub remote — writes `.github/workflows/track-issue-fixes.yml`, which labels (`fix-on-<branch>`) and comments on issues fixed on non-default branches, then strips those labels once the fix reaches the default branch and GitHub closes the issue natively. Idempotent: skipped silently once the workflow file exists. Read `bootstrap/step-16-non-default-branch-issue-tracking.md` for the full procedure.

### Step 17: Work-Record Backend (Optional)

Decide whether the unified work record — used by `/claude-tweaks:capture`, `/claude-tweaks:specify`, `/claude-tweaks:backlog`, `/claude-tweaks:dispatch`, `/claude-tweaks:tidy`, and the health skills — is backed by GitHub issues or local record files, and write `work-backend` to CLAUDE.md under a `## Work records` section (gated on the same GHE-safe two-tier remote check Step 9 uses). Then probe GitHub-native capabilities once (`work-types`, `work-links`) and offer to provision the full core label set now — see `_shared/work-record.md`'s Label taxonomy table for the current per-family and total counts, rather than a count restated here. See `_shared/work-record.md` for the taxonomy these config keys govern. Read `bootstrap/step-17-work-record-backend.md` for the full procedure.

---

### Finalizing the worktree.always Decision

If Step 6 (`bootstrap/step-06-worktree-configuration.md`) queued a `worktree.always` decision, it must be written to `.claude-tweaks/policy.yml` exactly once, as the very last filesystem action before this `/init` invocation ends — for whatever reason it ends. Phase 9's "Worktree Policy Finalization" (below) is the normal place this happens: per "Input" above, every scope reaches Phase 9 except `bootstrap`, including the goal-based Phase scopes (`config`/`skills`/`journeys`/`docs`) even though none of them list Phase 9 in their own phase subset. The known early-exit paths that stop the invocation before Phase 9 ever runs are: `$ARGUMENTS` was `bootstrap` (stops after Phase 0); the Scope Selection Gate's Option 4 ("Done"); or Option 2 (Interactive)'s own per-phase gate, if the user selects "Done" ("Stop here") after any phase. These are the known cases, not necessarily an exhaustive list of every way this invocation could ever end — whatever the actual reason this invocation is ending, write the decision right there, immediately before it ends: create `.claude-tweaks/` if it doesn't exist, then write or update the `worktree.always:` line in `.claude-tweaks/policy.yml` (merge into existing content — preserve every other line in the file untouched; create the file with just that one line if it didn't exist). If the decision was "Yes," tell the user: "`worktree.always` is now enforced — your next edit requires an isolated worktree; run `/superpowers:using-git-worktrees` first."

If this invocation instead reaches Phase 9, the decision is finalized there — see "Worktree Policy Finalization."

---

## Scope Selection Gate

After Phase 0 completes, present the scope selection — unless `$ARGUMENTS` already specified a goal-based Phase scope (e.g., `bootstrap`, `config`, `skills`, `journeys`, `docs`), in which case skip this gate and run the corresponding phases; or one or more Enhancement filter tokens with no Phase scope, in which case skip this gate and stop after Phase 0 (same as `bootstrap` alone) — see the `## Input` section.

**Not silenced by `auto`.** The scope-selection gate is on the "What `auto` does NOT silence" list in `_shared/auto-mode-contract.md` — it is a project-shape governance decision that requires explicit user input regardless of `auto` state. The prompt below always renders unless `$ARGUMENTS` already specified a scope.

Call `AskUserQuestion` (see "Phases at a Glance" above for the full table):

- `question`: `"Bootstrap complete. How much setup do you want?"`, `header`: `"Setup scope"`, `multiSelect`: `false`
- Option 1 — `label`: `"Auto (Recommended)"`, `description`: `"Run all included phases without stopping"`
- Option 2 — `label`: `"Interactive"`, `description`: `"Pause for confirmation between phases"`
- Option 3 — `label`: `"Essentials"`, `description`: `"Reconnaissance + CLAUDE.md only (phases 2, 3, 5)"`
- Option 4 — `label`: `"Done"`, `description`: `"Just needed the bootstrap structure"`

**Option 1 (Auto):** Run all included phases end-to-end. Phase 3 auto-confirms classification when detection confidence is `high` and signals are consistent (otherwise presents the confirmation gate as a KEPT-PROMPT). Phase 4 still presents the skill selection (governance decision — never silenceable). Phase 9 still presents the final summary for confirmation (governance decision). All other phases run without pausing.

**Option 2 (Interactive):** After each phase completes, present its output, then call `AskUserQuestion`. This is a template — re-issue it once per phase (not a single static site), substituting `{phase}`, `{next phase}`, `{description}`, and `{phase after next}` each time. Resolve "next phase" and "phase after next" by walking the actual sequence in "Phases at a Glance" (0, 1, 2, 3, 4, 5, 6, 7, 8, 8.5, 9) — not `{N+1}`/`{N+2}` integer arithmetic, which breaks at the 8 → 8.5 → 9 step. For example, after Phase 7 the next phase is 8; skipping Phase 8 moves to Phase 8.5, never Phase 9:

- `question`: `"Phase {phase} complete. Continue to Phase {next phase} ({description})?"`, `header`: `"Phase gate"`, `multiSelect`: `false`
- Option 1 — `label`: `"Continue (Recommended)"`, `description`: `"Proceed to Phase {next phase} ({description})"`
- Option 2 — `label`: `"Skip Phase {next phase}"`, `description`: `"Move to Phase {phase after next}"`
- Option 3 — `label`: `"Done"`, `description`: `"Stop here"`

If the user selects this template's "Done" and Step 6 queued a `worktree.always` decision, write it now — see "Finalizing the worktree.always Decision" above.

**Option 3 (Essentials):** Runs phases 2, 3, 5 only — the same phase set as the `config` goal-based Phase scope (see "Input" above; Phase 0 always runs first regardless of scope, so the two are equivalent). Produces CLAUDE.md with proper philosophy and Don'ts. Defers skills, rules, journeys, and doc registry for later (suggest running `/init config` directly next time to skip this gate).

**Option 4 (Done):** Stop after Phase 0. The user has the directory structure, starter files, and dependencies — they'll configure manually or run `/init` again later. If Step 6 queued a `worktree.always` decision, write it now — see "Finalizing the worktree.always Decision" above.

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

### If `$ARGUMENTS` includes `--update` or `update` → **Update Mode** (proceed to Phase 1u), regardless of what the existence check above found — this is the explicit override from the `## Input` section, for a bare/near-empty `.claude/` the existence check alone would otherwise route to Initial Mode

### Else if nothing exists → **Initial Mode** (skip to Phase 2)

### Else (config exists) → **Update Mode** (proceed to Phase 1u)

Update Mode runs three sub-phases before deciding whether to continue with the full reconnaissance:

- **Phase 1u** — inventory existing CLAUDE.md, skills, and rules; classify findings as covered / stale / drifted / gap
- **Phase 1u.5** — detect claude-tweaks contract drift: compare the project's plugin-authored CLAUDE.md sections against the current template via `bin/lib/init/claude-md-conformance.js`, reporting missing and drifted sections
- **Phase 1u.6** — early-exit gate: if drift = 0 AND preliminary gaps < 3, skip to Phase 9 with a quick-audit summary; otherwise continue to Phase 2

Update Mode procedures live in `update-mode.md` — load only when Phase 1 detects existing config. That file contains the inventory template, the contract-drift conformance check, and the early-exit decision logic.

---

## Phase 2: Codebase Reconnaissance

Work through these detection steps systematically.

> **Parallel execution:** Use parallel tool calls aggressively — all glob/grep operations within a substep are independent and should run concurrently.

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
>
> **Model tier:** Standard — applying the Frequency + Complexity + Danger rubric against Phase 2 evidence requires judgment across three dimensions per candidate, not mechanical enough for Fast and not synthesis-heavy enough to need Capable.

Apply the **Frequency + Complexity + Danger** rubric (max 9). Generate skills scoring 6+ first. Skills not selected (Priority 2-3 or aspirational) become backlog work records with their scoring rationale and Phase 2 evidence — no reconnaissance is wasted.

For the full scoring rubric (with examples), the skill-category mapping reference, and the deferred-skill backlog work-record format, read `phase-4-scoring.md` in this skill's directory. For the Skill Manifest presentation template and the selection prompt, read `profile-templates.md` (Phase 4 section).

---

## Phase 5: Generate / Update CLAUDE.md

CLAUDE.md describes **how to work in this codebase** — the patterns to follow, the commands to run, the conventions to respect, and the mistakes to avoid. Every entry should help someone working in the codebase right now. Things that don't exist yet belong in the backlog, not here.

**Initial Mode** generates CLAUDE.md from scratch with sections for Stack, Structure, Commands, Conventions, Philosophy, Testing, Environment, Git, and Don'ts. **Update Mode** produces targeted patches, not rewrites. The Philosophy section adapts to detected project maturity. The Don'ts section is the highest-ROI output — mine it from convention conflicts and observed anti-patterns (not from missing infrastructure).

For the complete CLAUDE.md template, patch format, Philosophy generation guide, Don'ts mining guide, and principles, read `claude-md-template.md` in this skill's directory.

### Pain Point Routing

Phase 2f findings split into CLAUDE.md Don'ts (convention conflicts and anti-patterns) and backlog work records (missing infrastructure, practices, stale deps, dead code). For the backlog work-record templates and the "Pain Points Routed" summary template, read `pain-point-routing.md` in this skill's directory.

---

## Phase 6: Generate / Update Skills

> **Parallel execution (conditional):** Under Update Mode, when the drift-patch audit's read set (`_shared/harness-health-analysis.md`) covers ≥ 8 existing skills, dispatch the per-skill audit as parallel Task agents per the Subagent Contract (`_shared/subagent-output-contract.md`) — the same threshold and pattern Phase 4 already uses for scoring. Otherwise, run the audit inline in the main thread.
>
> **Model tier:** Standard — comparing each skill's content against the canonical template across multiple conformance dimensions (structure, sync with reference files, quality gates) is format-sensitive checking, not synthesis-heavy enough to need Capable; defaulting to Capable across 8+ agents is roughly a 5x cost multiplier for no judgment gain.

**Initial Mode** generates full SKILL.md files for each approved skill. **Update Mode** produces targeted patches for drifted skills and full SKILL.md for gap skills. Each generated skill must pass quality gates (codebase-grounded examples, working commands, project-specific anti-patterns). Skill depth scales with complexity score.

Only generate skills for patterns that **actually exist and are actively used** in the codebase. Aspirational skills (e.g., testing for a project with no tests) should have been captured as backlog work records in Phase 4 — do not generate SKILL.md files for them.

For the complete SKILL.md template and depth guide, read `skill-template.md` in this skill's directory. For the drift-patch procedure and quality gates applied to drifted/gap skills, read `_shared/harness-health-analysis.md` — the same procedure `/claude-tweaks:wrap-up` Step 7 and the standalone `/claude-tweaks:harness-health` routine use.

---

## Phase 7: Generate / Update Rules (optional)

Generate `.claude/rules/` files for **path-specific** conventions (e.g., "all files in `src/api/` must use the error handler"). Project-wide conventions belong in CLAUDE.md, not rules. For the rule frontmatter template, common rule candidates, and Update-Mode hint, read `rules-template.md` in this skill's directory.

---

## Phase 8: Discover User Journeys (Optional)

For projects with user-facing surfaces (web app, CLI, API with docs), offer to discover and document user journeys — especially valuable for brownfield projects with features but no documented flows. Skip for pure libraries or when `docs/journeys/` already has comprehensive coverage.

### Present the option:

**Call `AskUserQuestion`:**

- `question`: `"This project has user-facing features but no documented user journeys. User journeys help /review test the app against experiential expectations. Would you like to discover and document journeys?"`, `header`: `"Journey discovery"`, `multiSelect`: `false`
- Option 1 — `label`: `"Codebase-only (Recommended)"`, `description`: `"Scan codebase for routes and user flows, create journey files."`
- Option 2 — `label`: `"Hybrid (codebase + browser)"`, `description`: `"Scan codebase AND walk the app in a browser for richer 'should feel' details."`
- Option 3 — `label`: `"Skip"`, `description`: `"I'll add journeys later."`

### Option 1: Codebase-only discovery

Use Phase 2 findings to identify routes/pages, infer personas (user roles, auth flows, public vs. authenticated), and group routes into goal-oriented journey skeletons. Write skeleton files to `docs/journeys/` (use `journey-template.md` from the `/claude-tweaks:journeys` skill directory) — each one stamped `**Status:** Skeleton — inferred from code, not yet browser-tested`. Skeletons document the intended flows but "should feel" fields are weaker until browser-tested.

**Capture enrichment as backlog work records** for each skeleton journey:

```markdown
### Browser-test journey: {name}
Skeleton journey inferred from code — "should feel" and "red flags" need browser validation.
Routes covered: {list}. Persona: {persona}. Dev URL: {if known}.
Run `/claude-tweaks:review journey:{name}` to enrich with experiential details.
```

### Option 2: Hybrid discovery (codebase + browser)

Delegate to `/claude-tweaks:visual-review discover` — runs the full 6-phase discovery process (codebase scan → journey candidates → browser walkthrough → write files → coverage report → handoff). Ask the user for the dev server URL before invoking.

### Option 3: Skip

Note that the user skipped journey discovery. Suggest running `/claude-tweaks:visual-review discover` later when they're ready.

---

## Phase 8.5: Create Doc Registry

Create the documentation registry that maps project docs to the code areas they cover. This registry is consumed by `/build` (Step 6.5) to auto-update docs when relevant code changes, and by `/wrap-up` (Step 7.7) for final sweep and registry maintenance.

**Use the confirmed doc tier** from Phase 3 — do not re-detect.

For the complete procedure (registry format, tier definitions, standard folder taxonomy, common Auto-detect patterns, inventory → assess → batch table → create → backlog-capture flow, and Update-Mode diff logic), read `docs-structure.md` in this skill's directory.

---

## Phase 9: Present Summary and Confirm

Present a consolidated summary of all work done across Phase 0 (bootstrap) and Phases 1-8 (configuration). Wait for user confirmation before writing generated files. This phase is the terminal step for every scope except `bootstrap` — see "Input" above — including the goal-based Phase scopes (`config`/`skills`/`journeys`/`docs`) and the Scope Selection Gate's Option 1 (Auto) and Option 3 (Essentials), even though none of the goal-based Phase scopes list Phase 9 explicitly in their own phase subset.

Both modes lead with a **Verified & Consistent** section — an affirmative report of what was checked and found healthy (dependencies present, contract markers up to date, config items still accurate, detections confirmed), not just what changed or was created. This is required, not optional: Update Mode in particular often proposes few or no changes, and the user needs to see *what was audited and deliberately left alone*. The early-exit fast path (Phase 1u.6) carries its own shorter Verified & Consistent block.

For the complete summary templates for both modes, read `summary-templates.md` in this skill's directory.

### Actions Performed

After writing files, surface what was created. Generate the table from the actual artifacts produced this run (only include rows for actions that actually occurred):

| Action | Detail | Ref |
|--------|--------|-----|
| Bootstrap | Created `specs/`, `docs/`, `docs/journeys/`, `.worktrees/`, etc. (only missing dirs) | Step 2 |
| Starter files | Wrote `specs/INDEX.md` (only if missing) | Step 3 |
| Statusline | Installed wrapper at `~/.claude-tweaks/bin/statusline.js`; wired `~/.claude/settings.json` | Step 8 |
| Design integration | Set `design-integration: {enabled/plugin-only/disabled}` in CLAUDE.md | Step 11 |
| shadcn integration | Set `shadcn-integration: {enabled/cli-only/disabled}` in CLAUDE.md | Step 13 |
| Work records | Set work-backend / work-types / work-links in CLAUDE.md; offer core-label bootstrap (see `_shared/work-record.md`'s Label taxonomy table for current per-family and total counts) | Step 17 |
| GitHub remote | Created `{owner}/{name}` ({visibility}) and set as `origin` (only if Step 9 ran and the user confirmed creation) | Step 9 |
| Cloud parity | Declared {N} plugin(s) in .claude/settings.json#enabledPlugins; wrote scripts/claude-cloud-setup.sh; wrote CLAUDE.md's Cloud parity section | Step 14 |
| Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 15 |
| Routine re-sync | Re-synced {M} drifted routine(s) to their current templates: `{list}` (Update Mode only) | Update Mode |
| Worktree policy | Set `worktree.always: {true/false}` in `.claude-tweaks/policy.yml` (only if Step 6 asked this run) — written last, after every other row above, to avoid mid-run self-lockout; see "Worktree Policy Finalization" below | Step 6 |
| Classification | Confirmed maturity `{value}` (written to `.claude-tweaks/policy.yml` as `project.maturity`), doc tier `{N}` | Phase 3 |
| CLAUDE.md | Wrote {N} lines (Initial) / Applied {N} patches (Update) | Phase 5 |
| Skills | Generated {N} SKILL.md files: `{list}` | Phase 6 |
| Rules | Created {N} path-scoped rules in `.claude/rules/` | Phase 7 |
| Journeys | Wrote {N} skeleton journey files (or delegated to `/visual-review discover`) | Phase 8 |
| Doc registry | Created `docs/REGISTRY.md` with {N} entries | Phase 8.5 |
| Backlog | Added {N} work records (deferred skills, pain points, doc work, skeleton enrichment) | Phases 4-8.5 |

Execute only after user confirmation.

### Worktree Policy Finalization

Write this AFTER every write in the Actions Performed table above has completed — it must be the very last filesystem action of the entire `/init` invocation. If Step 6 (`bootstrap/step-06-worktree-configuration.md`) queued a `worktree.always` decision, write it now: this is the deferred write described in Step 6, deferred specifically so this run's own Steps 7-17, Phases 1-8.5, and this same Phase 9's own confirmed generated-file writes (the Actions Performed table above) were never blocked by a policy that turned on mid-run. (The `bootstrap`-only scope already wrote its queued decision immediately after Step 17 — the last Optional Companion step Phase 0 runs through — see "Finalizing the worktree.always Decision" after Phase 0 — so there is nothing to do here for that scope.)

Create `.claude-tweaks/` if it doesn't exist. Read `.claude-tweaks/policy.yml` if present; if it has an existing `worktree.always:` line, replace that line, otherwise append a new `worktree.always: {true|false}` line (create the file with just that line if it didn't exist). Preserve every other line in the file untouched.

If the decision was "Yes," tell the user the same confirmation message quoted in "Finalizing the worktree.always Decision" above.

---

## Important Notes

- **This skill is idempotent** — safe to re-run. Phase 0 only creates what's missing. Phases 1-8 detect whether to generate fresh or patch existing config.
- **One session is not enough** — the initial skill set will be ~70% right. Expect to refine skills after the first week of actual use. Tell the user this explicitly.
- **Re-run periodically** — run in Update Mode after major refactors, stack upgrades, or when skills start feeling stale. A quarterly cadence works for active projects.
- **Update Mode should be fast** — Phase 1u.6's early-exit gate skips Phases 2-8.5 when drift is zero and preliminary gaps are < 3. Re-run with `--full` to force the complete pass.
- **Don't over-generate** — 5 excellent skills beat 15 mediocre ones. The Anti-Patterns section below covers the specific failure modes (aspirational Don'ts, generic skills, improvements-in-CLAUDE.md). Read those before adding to either output.

---

## Next Actions

Resolve the recommended action from the signals that fired during this run. This lookup table is the assistant's own resolution logic — it stays internal and is never itself shown to the user or converted into an `AskUserQuestion` option. Resolve signals top-to-bottom; the first matching row is the recommendation. The last row is also the catch-all: the signal rows above it are not exhaustive over every possible post-init state (e.g. Update Mode completing a full pass with zero drift and no backlog writes matches none of them), so anything that doesn't match falls through to it, guaranteeing there is always a defined recommendation.

| Signal | Recommended Next Action |
|--------|------------------------|
| Update Mode ran AND total drift count > 0 | `/claude-tweaks:tidy` — clean up drifted/stale config and backlog items before resuming feature work |
| Backlog has work records written this run (deferred skills, pain points, doc work, skeleton enrichment) | `/claude-tweaks:tidy` — triage what /init just captured |
| Initial Mode ran AND backlog is empty | `/claude-tweaks:capture {idea}` — capture the first idea or feature into the backlog for triage |
| Everything is clean (Update Mode early-exit or a full pass ending with zero drift, OR Initial Mode with nothing routed to the backlog), or no row above matches | `/claude-tweaks:help` — see the full lifecycle overview and current pipeline status |

Once resolved to a single recommended row, call `AskUserQuestion` with exactly 3 options — the resolved recommendation, plus the two "Always" actions below:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — the resolved recommendation from the table above, `label`: a short one-line summary of it suffixed `(Recommended)`, `description`: the full command text from the matched row
- Option 2 — `label`: `"Specify next feature"`, `description`: `"/claude-tweaks:specify {first feature topic} — jump straight to specifying the first lifecycle feature"`
- Option 3 — `label`: `"Tidy backlog"`, `description`: `"/claude-tweaks:tidy — review backlog entries"`

If the resolved recommendation is itself `/claude-tweaks:tidy` (rows 1 or 2), it and Option 3 refer to the same command — collapse them into a single `(Recommended)` option rather than presenting `/claude-tweaks:tidy` twice, leaving 2 options for that call instead of 3.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Modifying existing backlog work records or INDEX.md content | Phase 0 is additive — it creates missing files but must not overwrite user content |
| Skipping CLAUDE.md generation | Without CLAUDE.md, /claude-tweaks:review can't find verification commands |
| Running init in a non-git directory without warning | /claude-tweaks:review and /claude-tweaks:wrap-up depend on git — the user should know about degraded behavior |
| Installing browser tools without asking | Browser integration is optional — surface the install command but never run `npm install` automatically |
| Prompting for a browser backend choice | There is only one backend (`agent-browser`) — do not present a choice |
| Silently rewriting a legacy `backlog-backend` flag to `work-backend` during Phase 0 | That rename is Update-Mode's job, offered as a staged change (see `update-mode.md`'s Work-Record Backend Drift) — Phase 0 must leave an existing `## Backlog integration` section untouched |
| Generating generic skills (e.g., `auth.md`, `api-routes.md`) | These are not real conventions — they're feature names. Real skills must encode rules, anti-patterns, or "Why this is done this way" insights grounded in patterns actually observed in the codebase. If the project doesn't use WebSockets, don't create a realtime skill. If it has no tests, capture testing as an aspirational backlog item, not a SKILL.md file. |
| Generating generic skills not grounded in the codebase | Skills must encode observed patterns — generic advice adds noise, not value |
| Rewriting CLAUDE.md in Update Mode | Update Mode produces patches, not rewrites — existing config embeds hard-won lessons |
| Over-generating skills (15 mediocre > 5 excellent) | Each skill must earn its existence by encoding knowledge that would otherwise be lost |
| Skipping team input | Code archaeology alone misses social conventions — PR process, deploy cadence, naming debates |
| Aspirational Don'ts for things that don't exist | Don'ts are guardrails for existing patterns, not wishes for missing infrastructure. "No CI" is a backlog item, not a Don't. |
| Putting improvement ideas in CLAUDE.md | CLAUDE.md describes how to work in the codebase as it is — improvement opportunities belong in the backlog with Phase 2 context |
| Generating skills for patterns that don't exist yet | Aspirational skills (testing for a project with no tests) become backlog work records with Phase 2 evidence, not SKILL.md files |
| Hardcoding greenfield philosophy for all projects | The Philosophy section must adapt to detected project maturity — what's correct for a greenfield project is dangerous for an established one |
| Creating doc files with only TODO placeholders | Phase 2 reconnaissance has the data — generate real content grounded in actual findings. If a doc would be < 20 lines of real content, it belongs in README instead of its own file. |
| Skipping journey discovery for projects with user-facing features | Journeys are what `/review` tests against — without them, visual QA has no experiential anchor |
| Writing journey "should feel" without actually using the app | Codebase-only skeletons are a starting point but the "should feel" is weaker — mark them as skeletons |
| Auto-copying local MCP server configs (`~/.claude.json`) into the project's committed `.mcp.json` | MCP server configs can carry embedded credentials (API keys, tokens) — copying them into a committed file leaks secrets. Step 14's MCP-parity check is report-only by design; the user reviews and adds any that matter, manually. |
| Hand-editing `scripts/claude-cloud-setup.sh` | Regenerated in full on every `/init` run from `.claude/settings.json` state — manual edits are silently overwritten. Customize by changing `enabledPlugins`/`extraKnownMarketplaces` instead, then re-run `/init`. |
| Assuming `/init` can set the cloud environment's Setup-script field itself | No API or CLI sets it remotely — confirmed by inspecting `RemoteTrigger`'s own schema (scoped to `/v1/code/triggers` only). It's always a manual, one-time paste per environment, done in the claude.ai/code environment settings UI. |
| Assuming Step 9 can authenticate `gh` non-interactively | `gh auth login --web` is a device-flow browser authorization — it always requires the user to complete a step in their own browser. There is no headless/token-based path this step uses instead. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | First skill to use after /claude-tweaks:init — add ideas to the backlog |
| `/claude-tweaks:help` | Shows workflow status — useful to verify /claude-tweaks:init worked. Surfaces doc staleness signals from the registry. |
| `/claude-tweaks:review` | /review lens 3i uses the doc registry to check documentation freshness. |
| `/claude-tweaks:visual-review` | Phase 8 (hybrid mode) delegates to `/visual-review discover` for browser-assisted journey discovery. |
| `/claude-tweaks:build` | /init creates `docs/REGISTRY.md` (Phase 8.5) that /build consumes in Step 6.5 for documentation sync. Phase 3 also writes `project.maturity` to `.claude-tweaks/policy.yml`, which Common Step 2 reads to scale its test-discipline instruction on early-production/established projects. |
| `/claude-tweaks:specify` | Phase 3 writes `project.maturity` to `.claude-tweaks/policy.yml`; Step 2 reads it to bias decomposition toward strangler-fig-shaped leaves on early-production/established projects when a design doc proposes replacing an existing subsystem. |
| `/claude-tweaks:wrap-up` | Captures learnings after features — keeps generated skills alive and accurate. Step 7 references `skill-template.md` from /claude-tweaks:init's directory. /wrap-up Step 7.7 maintains the doc registry created by /init. |
| `/claude-tweaks:tidy` | /tidy Step 4.6 audits doc registry health — flags stale entries, gaps, pattern drift. Suggests `/init update` for tier drift. |
| `/claude-tweaks:browse` | Depends on `agent-browser`, which /claude-tweaks:init detects (and surfaces install instructions for) in Phase 0 |
| `/claude-tweaks:design-wrapper` | Step 11 sets up Impeccable design integration (install plugin + CLI, optionally run `init`) and writes the `design-integration` kill-switch flag to CLAUDE.md that the wrapper reads as Layer 1 of its detection logic. |
| `/claude-tweaks:visualize` | Step 12 offers to enable diagram suggestions and writes the `diagram-suggestions` flag to CLAUDE.md — no install step, this skill is native. Soft-hook nudges in `/journeys`, `/specify`, and `/review` read the flag to decide whether to suggest invoking it. |
| `shadcn/ui` (companion) | Step 13 offers to bootstrap the shadcn CLI, wire its official MCP server into `.mcp.json`, and install shadcn's official Skill (`skills add shadcn/ui`) for live Claude Code project context. Writes the `shadcn-integration` flag to CLAUDE.md — currently write-only, no other skill reads it yet. |
| `/superpowers:using-git-worktrees` | /claude-tweaks:init optionally configures the worktree directory that `using-git-worktrees` needs |
| `/claude-tweaks:stories` | /init Phase 8 (journey discovery) feeds /stories — discovered journeys become input for story generation |
| `/claude-tweaks:version` | /version reads the same `plugin.json` that /init may print during bootstrap |
| `/claude-tweaks:routine` | Step 15 discovers claude-tweaks skills shipping a `routine-template.yml` with no existing instantiated record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment where possible, then invokes `/claude-tweaks:routine create <skill> --defaults --environment=<id> --source init` for each selected candidate once resolved (or, on a fresh project, lets the first selected candidate's own CREATE flow resolve it via guided creation, so the rest pick it up from the cache) — pure discovery + handoff, no logic duplicated. Update Mode also invokes `/claude-tweaks:routine status --all --source init` and, on confirmation, `update <skill> --defaults --source init` to detect and re-sync drifted routines — see `update-mode.md`'s Routine Drift entry. Update Mode's Routine Environment Dedication entry delegates its own environment audit/creation/re-point actions to `skills/routine/guided-environment-creation.md` — the same sub-file `/claude-tweaks:routine`'s own CREATE Step 4 uses, not a duplicate. |
| `/claude-tweaks:harness-health` and `_shared/harness-health-analysis.md` | Phase 6's drift-patch procedure and Phase 3/1u's skill classification apply this shared procedure instead of an inline copy, sharing its judgment logic with `/claude-tweaks:wrap-up` Step 7 and the standalone routine. Cursor state lives on the durable `health-state` git branch, not local disk (see `skill-template.md`'s Cursor Participation section); only `.claude-tweaks/harness-health/cache.json` is still local (see `bootstrap/step-04-gitignore-suggestions.md`). Update Mode also invokes `skills/harness-health/routine-relevance-analysis.md` directly — outside harness-health's own SELECT/JUDGE/FILE pipeline — to judge whether this project's instantiated routines are still relevant given recent skill changes; see `update-mode.md`'s Routine Relevance entry. |
| `_shared/work-record.md` | Step 17 provisions the record taxonomy this file documents. The label-provisioning offer (Step 17c) runs `_shared/label-bootstrap.md`'s canonical label list, which this file names as the taxonomy home. |
| `_shared/work-record-config.md` | Canonical home of the `work-backend` / `work-types` / `work-links` config keys Step 17 writes — the record taxonomy's driver and capability contract, split out of `work-record.md` so key-only consumers don't load the whole taxonomy. /init is the only writer; every other consumer reads. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. Phase 3 classification auto-confirm follows the contract's confidence-gated pattern. |
| All workflow skills | Depend on the structure /claude-tweaks:init creates |
