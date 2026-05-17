# CLAUDE.md — claude-tweaks plugin

## What this is

A Claude Code plugin (v4.7.0) containing markdown skill files that guide Claude through a structured development lifecycle, with browser automation, QA pipeline support, and v4.2+ token-saving infrastructure (bash filter hook, statusline, subagent contract).

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Claude Code plugin system + Node 18+ (for v4.2 token-saver: filter hook, statusline) |
| Content | Markdown (SKILL.md files with YAML frontmatter); Node modules under `bin/` |
| Dependencies | Superpowers plugin (`/superpowers:brainstorming`, `/superpowers:writing-plans`, `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, `/superpowers:using-git-worktrees`, `/superpowers:finishing-a-development-branch`, `/superpowers:dispatching-parallel-agents`), code-simplifier (built-in subagent), agent-browser (optional), git CLI (optional — required only for the statusline git segment) |
| Test runner | `node --test tests/` (built-in, no external deps) |
| Distribution | Plugin marketplace via `thomasholknielsen/claude-tweaks-marketplace` |

## Structure

```
.claude-plugin/plugin.json        → Plugin manifest (name, version, description)
skills/{name}/SKILL.md            → Skill definition (frontmatter + body)
skills/{name}/*.md                → Sub-files lazy-loaded by the skill
skills/_shared/*.md               → Cross-skill shared content (subagent contract, auto-mode contract, auto-decision log, browser detection, pipeline run dir)
agents/{name}.md                  → Agent definitions (frontmatter + body)
hooks/hooks.json                  → Hook definitions (SessionStart, PostToolUse[Bash])
bin/                              → Node executables (filter, statusline, deps check)
bin/lib/                          → Shared Node helpers (paths, jsonl, color, deps)
tests/                            → Node test files (node --test runner)
README.md                         → User-facing documentation
LICENSE                           → MIT
```

### Skill directories (21 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, journeys, visual-review, design
**Utility:** help, tidy, flow, browse, ledger, version, research

### Skills with sub-files

| Skill | Sub-files | Purpose |
|-------|-----------|---------|
| init | detection-tables.md, profile-templates.md, claude-md-template.md, skill-template.md, summary-templates.md, docs-structure.md, bootstrap-steps.md | Lazy-loaded reference content for each phase; doc registry format, tier detection, standard folder taxonomy; Phase 0 bootstrap procedures (browser, statusline, Impeccable) that are no-ops on most Update Mode runs |
| browse | agent-browser-reference.md | Operation vocabulary and advanced commands (batch, find, snapshot, vitals, trace, auth, react) used by consumer skills |
| build | plan-audit.md, worktree-setup.md, operational-checklist.md | Plan audit procedure (scope-creep detection, structural-coupling check); worktree setup with `/superpowers:using-git-worktrees` consent flow; Common Step 5.5 Category A + B operational tables and ledger format |
| test | verification.md | Shared verification procedure (referenced by /build, /review, and /test) |
| stories | dev-url-detection.md, source-analysis.md, story-examples.md, migration.md | Dev server auto-detection; source code extraction patterns for behavioral contracts; YAML story examples (DOM-only, source-aware, journey-aware) plus canonical locator-type/preference-order reference; v1→v2 and legacy auth.yml migration procedures (loaded only when detected) |
| review | review-summary-template.md, qa-review.md, ux-analysis.md | Structured summary template; QA review procedures; UX analysis procedure |
| visual-review | browser-review.md, reconnaissance.md | Visual review procedures (page, journey, discover modes); contextual page reconnaissance |
| specify | spec-template.md | Spec file template with field rationale |
| wrap-up | leftover-routing.md, review-console.md, cleanup-procedures.md | Leftover routing rules for unfinished work; Review Console consolidation template; Step 5 cleanup procedures (design wrapper caches, pipeline run dir archival, worktree teardown) |
| tidy | triage-tables.md | Design doc + brief classification tables for Step 3 |
| ledger | resolve-gate.md | Three-phase nothing-left-behind resolve gate (fix-exhaust → per-item user input → apply) referenced by /wrap-up Step 8.5 and /flow Step 5 |
| flow | manifesto.md, multi-spec.md, multispec-review-console.md, polish-failure.md, survey.md, validation.md, worktree-merge.md | Pipeline Config Manifesto questions; multi-spec batching; consolidated multi-spec Review Console; polish-failure recovery; Creative Opportunities survey + decline detection; pre-flight validation (merge/shape/design-doc rejection); worktree-merge handoff |
| design | command-map.md, frontend-detection.md, impeccable-cli.md, modes/{test,review,shape,pre-build,polish,survey,reset-recommendations}.md | Canonical dispatch tables (auto-fit / issue-driven / intent-driven / survey "would help" criteria); frontend-vs-backend detection rules; Impeccable CLI invocation patterns; per-mode full procedures (steps, decision rules, output format) lazy-loaded by the active mode |
| help | reference-card.md, context-flow.md | Quick reference card; artifact flow documentation |
| research | reference/ (6 sub-files), scripts/ (Python pipeline), schemas/, templates/, UPSTREAM.md, LICENSE-UPSTREAM | 8-phase research pipeline vendored from 199-biotechnologies/claude-deep-research-skill (MIT); methodology, quality gates, citation validation, HTML/PDF assembly. See `skills/research/UPSTREAM.md` for vendoring contract and update runbook. |

## Conventions

### SKILL.md structure

Every skill follows this structure:
1. YAML frontmatter: `name`, `description` (trigger condition)
2. Interaction style directive (identical across all skills)
3. H1 title with one-line description
4. ASCII lifecycle position diagram
5. "When to Use" section
6. Input resolution (how `$ARGUMENTS` is parsed)
7. Numbered workflow steps
8. Anti-Patterns table (`| Pattern | Why It Fails |`)
9. Relationship to Other Skills table (`| Skill | Relationship |`)

### Interaction patterns

- **Decisions** — numbered options (1, 2, 3...) so users reply with a number
- **Multi-item decisions** — batch table with pre-filled recommendations + "apply all / override". For 10+ items, lead with a severity/count summary before the full table so the user sees the scope before the details.
- **One decision per message** — never present more than one "apply all / override" table in a single response. If a skill produces multiple decision tables, present them sequentially (one per message, wait for resolution before showing the next).
- **Skill handoffs (Next Actions)** — End each skill with a `### Next Actions` block: 2-4 numbered options, full command with all parameters pre-filled, one-line description of what it does and produces, one marked `**(Recommended)**` based on context. Options are dynamically generated from available context (journeys, UI changes, worktree mode, QA stories, browser availability). Never a navigation menu, never generic commands without parameters.
- **Actions Performed table** — When a skill performs autonomous actions beyond what the user explicitly requested, include a `### Actions Performed` table before Next Actions. Columns: `| Action | Detail | Ref |`. Action types: `Implemented`, `Bug fix`, `Simplified`, `Operational`, `Journey`, `Ledger fix`. Ref column shows short commit hash. Resolved ledger items show source phase in parentheses. Generated from git log, git diff, and ledger entries. Omit when no autonomous actions were performed.
- **Hard gates** — BLOCKED/STOP conditions that prevent proceeding with degraded state
- **Adaptive section batching** — when a skill presents multi-section material that requires sequential approval (e.g., design walkthroughs, multi-part summaries), if the user accepts 2 consecutive sections without modification, batch all remaining sections into a single approval gate. The default `Brainstorm / section-confirmation: adaptive` setting makes this the standard behavior; override with `per-section` (always ask) or `batch` (always present once).

### Frontmatter conventions

- **`name`** — required. Format: `claude-tweaks:{skill}`.
- **`description`** — required. Trigger sentence ("Use when …") followed by optional keywords.
- **`allowed-tools`** — **omit by default**. Skills inherit the global tool set when this field is absent. Declare `allowed-tools:` only to **restrict** — e.g., a read-only auditing skill that should never modify files would declare `allowed-tools: Read, Grep, Glob, Bash`. Declaring a narrow set (like `allowed-tools: Bash`) when the skill actually uses Read/Edit/Glob/Task is a bug — it either lies about the contract or silently breaks the skill if the harness enforces it. When in doubt, omit the field.

### Interaction style directive

All skills use this identical directive after the frontmatter:

```
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.
```

### Parallel execution directives

Skills use three standardized blockquote forms to signal when operations should run concurrently:

| Form | Trigger | Use for |
|------|---------|---------|
| **Form A — parallel tool calls** | `> **Parallel execution:** Use parallel tool calls aggressively — all {tools} operations in {scope} are independent and should run concurrently.` | Independent read-only operations (Glob, Grep, Read, Bash). Front-loads I/O before analysis. |
| **Form B — parallel Task agents** | `> **Parallel execution:** Dispatch {scope} as parallel Task agents — each runs independently and returns {output format}. Assemble results after all agents complete.` | Heavier analytical work where each unit can run in a separate agent thread. |
| **Form C — conditional** | `> **Parallel execution (conditional):** When {condition}, dispatch {scope} as parallel Task agents. Otherwise, run sequentially in the main thread.` | Context-dependent dispatch — e.g., only for large diffs or multiple independent journeys. |

Use the exact blockquote prefix (`> **Parallel execution:**` or `> **Parallel execution (conditional):**`) so directives are visually consistent and greppable across skills.

Forms B and C always pair with the **Subagent Contract** (`skills/_shared/subagent-output-contract.md`) — minimal input, one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` as the agent's first line, then Templates A/B/C for output. Each dispatch picks a model tier (`Fast | Standard | Capable`); default to the cheapest that fits the work.

### Versioning

- Version lives in `.claude-plugin/plugin.json`
- Bump minor version for feature additions, patch for fixes
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional commit prefixes)

### Cross-references

- Every skill's Relationship table must be bidirectional — if A references B, B must reference A
- Workflow diagrams in `/help` must list all skills
- The artifact lifecycle diagram in `/help` and `README.md` must stay in sync

## Commands

```bash
claude --plugin-dir ./              # Local development — load plugin from current directory
node --test tests/                  # Run Node tests (filter + statusline) — v4.2+
```

### Subagent Contract (v4.2+)

Skills that dispatch parallel Task agents must reference `skills/_shared/subagent-output-contract.md` and follow its full contract: minimal **input** (scope + paths + literal output template — no conversation history), a **status line** (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`) as the agent's first reply line, an **output template** (Template A/B/C) inlined verbatim in the dispatch prompt, and **model tier selection** (`Fast | Standard | Capable`) appropriate to the work. Agents only see what's in their prompt — references to sibling files don't reach them. Currently used by `/browse`, `/help`, `/review`, `/tidy`. When adding a new dispatch site, follow the full pattern, not just the output template.

### Auto-Mode Contract + Bookend Architecture (v4.6+)

claude-tweaks pipelines have at most two stops in `auto` mode: a **Pipeline Config Manifesto** at the start (one structured `AskUserQuestion` collecting all policy levers) and a **Wrap-Up Review Console** at the end (one batch table consolidating everything auto-decided or staged). Everything in between is policy-driven automation logged to the auto-decision log.

**Single source of truth:** `skills/_shared/auto-mode-contract.md` — defines mode states, decision precedence (CLI arg > pipeline config > project policy > skill default), reversibility/confidence/severity floors, the HARD-GATE exemption list, and what `auto` never silences (ledger resolve Phase 2, INBOX/DEFERRED writes, `/challenge` lenses, governance gates).

**Audit trail:** `skills/_shared/auto-decision-log.md` — every auto-resolution writes a one-line entry to `.claude-tweaks/pipelines/{run-id}/decisions.md` with status (`AUTO` / `STAGED` / `KEPT-PROMPT`), rationale, and reversibility. The Review Console reads this log.

**Strict rule:** skills MUST NOT invent new mid-flow stops in `auto` mode. If a decision is decision-worthy, stage it (log it, don't act) and surface at the Review Console. Mid-flow stops are reserved for HARD-GATEs (test failures, spec compliance, structural coupling, plan validation) and the explicit "not silenced" list in the contract.

**Per-pipeline run directory** (collision-safe across parallel agents): `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/` contains `config.yml` (Manifesto answers), `decisions.md` (audit log), and `staged/` (proposals awaiting Review Console). Skills locate the active run via `PIPELINE_RUN_DIR` env var or by selecting the most recent matching run. **Project policy** lives in CLAUDE.md or `.claude-tweaks/policy.yml` — read as defaults by the Manifesto, overridable per-run.

## Don'ts

- Don't add "What's Next?" / "Pick an action" navigation menus at the end of skills — use `### Next Actions` blocks with numbered options and pre-filled commands
- Don't add per-item decision prompts for lists — use batch tables with "apply all / override"
- Don't create skills without the standard structure (frontmatter, interaction directive, anti-patterns table, relationship table)
- Don't add one-directional cross-references — always update both sides
- Don't silently skip or drop findings — every surfaced item must be explicitly resolved (fix now, defer, accept with reason)
- Don't put detailed reference content inline in a SKILL.md when it would make the file unwieldy — use a sub-file and reference it with "read `{filename}` in this skill's directory"
- Don't forget to update README.md and `/help` when adding or changing skills
- Don't use emojis in skill files — use `**(Recommended)**` bold text for emphasis instead
- Don't write to `~/.claude-tweaks/` from skill content — that path is runtime state owned by the harness layer (filter logs, telemetry, usage cache)
- Don't dispatch parallel Task agents without inlining a literal output template (Template A/B/C) from `skills/_shared/subagent-output-contract.md` in the agent prompt — references won't reach the agent
- Don't dispatch agents that run `git` or `node --test` without anchoring the working directory in the prompt — see "Working Directory Discipline" in `skills/_shared/subagent-output-contract.md`. CWD does not propagate reliably; without an explicit `cd "$WORKTREE"` or `git -C "$WORKTREE"` and a `pwd` + `git rev-parse --show-toplevel` check before commit, commits and test runs can land in the wrong checkout
- Don't invent new mid-flow stops in `auto` mode — if a decision is decision-worthy, stage it to the auto-decision log and surface at the Wrap-Up Review Console. Mid-flow stops are reserved for HARD-GATEs and the explicit "not silenced" list in `_shared/auto-mode-contract.md`
- Don't auto-resolve a decision without writing to the auto-decision log — silent automation without an audit trail is forbidden
