# CLAUDE.md — claude-tweaks plugin

## What this is

A Claude Code plugin (v4.17.0) containing markdown skill files that guide Claude through a structured development lifecycle, with browser automation, QA pipeline support, a statusline, and a subagent contract for parallel dispatch.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Claude Code plugin system + Node 18+ (for the statusline) |
| Content | Markdown (SKILL.md files with YAML frontmatter); Node modules under `bin/` |
| Dependencies | Superpowers plugin (`/superpowers:brainstorming`, `/superpowers:writing-plans`, `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, `/superpowers:using-git-worktrees`, `/superpowers:finishing-a-development-branch`, `/superpowers:dispatching-parallel-agents`, `/superpowers:systematic-debugging`), code-simplifier (built-in subagent), agent-browser (optional), git CLI (optional — required only for the statusline git segment) |
| Test runner | `node --test tests/` (built-in, no external deps) |
| Distribution | Plugin marketplace via `thomasholknielsen/claude-tweaks-marketplace` |

## Structure

```
.claude-plugin/plugin.json        → Plugin manifest (name, version, description)
skills/{name}/SKILL.md            → Skill definition (frontmatter + body)
skills/{name}/*.md                → Sub-files lazy-loaded by the skill
skills/_shared/*.md               → Cross-skill shared content (subagent contract, auto-mode contract, auto-decision log, browser detection, pipeline run dir, dev URL detection, git discipline, design-wrapper handling, multi-agent coordination, decision records / ADR gate, **shared analysis criteria: architecture-depth / simplification / review-quality**)
agents/{name}.md                  → Agent definitions (frontmatter + body)
hooks/hooks.json                  → Hook definitions (SessionStart)
bin/                              → Node executables (statusline, deps check)
bin/lib/                          → Shared Node helpers (color, deps, coordination)
tests/                            → Node test files (node --test runner)
README.md                         → User-facing documentation
LICENSE                           → MIT
```

### Skill directories (22 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design
**Utility:** help, tidy, flow, browse, ledger, version, research

### Skills with sub-files

| Skill | Sub-files | Purpose |
|-------|-----------|---------|
| init | detection-tables.md, profile-templates.md, claude-md-template.md, skill-template.md, skill-categories.md, summary-templates.md, docs-structure.md, bootstrap-steps.md, phase-3-classification.md, phase-4-scoring.md, update-mode.md | Lazy-loaded reference content per phase; doc registry format, tier detection, folder taxonomy; Phase 0 bootstrap procedures; Phase 3 auto/confirmation gate template; Phase 4 scoring procedure + manifest template; Update-Mode procedures (Phase 1u inventory, contract-drift, early-exit gate) loaded only when existing config is detected |
| browse | agent-browser-reference.md | Operation vocabulary and advanced commands (batch, find, snapshot, vitals, trace, auth, react) used by consumer skills |
| build | plan-audit.md, worktree-setup.md, operational-checklist.md, design-prebuild.md, architecture-alignment.md, failure-recovery.md | Plan audit; worktree setup; Common Step 5.5 operational tables + ledger format; Common Step 1.7 (design pre-build invocation + result handling); Common Step 4.5 (architecture alignment diff + batch table); Superpowers execution failure recovery table + behavioral-bug reproduce-first escalation (delegates to /superpowers:systematic-debugging) |
| test | verification.md, qa-procedures.md, qa-prompts.md, qa-reporting.md | Shared verification procedure (used by /build, /review, /test); QA Phases 1-2.5 (pre-flight + discovery); Phase 3 parallel dispatch + agent prompt templates (loaded only when stories exist); Phases 4-5.5 (selector recoveries, reporting, ledger writes, report.json schema) |
| stories | source-analysis.md, story-examples.md, migration.md, source-aware-design.md, coverage-report.md, journey-ingest.md, auth-resolution.md, refine.md | Source extraction patterns for behavioral contracts; YAML story examples + locator-type reference; v1→v2 and legacy auth.yml migration; source-aware story design (Step 1.5 + Step 3 source/diff-aware bodies); Step 6 coverage report template loaded only when journeys exist; Step 1.1 journey ingest loaded only when docs/journeys/*.md exists; Step 2 auth resolution loaded only when an auth-gated page is found; Step 5 refine procedure loaded only when REFINE=true |
| review | review-summary-template.md, ux-analysis.md, step3-routing.md | Structured summary template; UX analysis procedure; Step 3 routing (severity-based auto routing, interactive batch table, parallel-fix dispatch) — lazy-loaded only when findings exist |
| reflect | hindsight-mode.md, full-mode.md | Mode-specific procedures: hindsight (5-eval action gate, /review caller) vs full (4 lenses + tradeoff review + auto-apply-when-uniform optimization, /wrap-up caller). SKILL.md owns shared dispatch table + Step 1 + Step 4 + ledger integration |
| deepen | depth-analysis.md | Depth model (leverage, not line ratio), the deletion test, leverage ranking, dependency classification (pure / local stand-in / network-boundary→port+adapter), and the controlled vocabulary — loaded by Steps 2-4 of the architectural depth pass |
| journeys | journey-template.md | Journey file template + key principles (loaded only when creating a new journey file) |
| visual-review | browser-review.md, reconnaissance.md, journey-mode.md, discover-mode.md, qa-accelerated.md | Shared visual-review prerequisites + Page Mode steps; contextual page reconnaissance; mode-specific procedures; QA-accelerated paths for Steps 1, 3, 4 (loaded only when QA_DATA_AVAILABLE) |
| specify | spec-template.md, design-pre-steps.md | Spec file template with field rationale; Step 2.5 frontend-detection + shape pre-step + design-intent question (lazy-loaded only for frontend specs) |
| wrap-up | leftover-routing.md, review-console.md, cleanup-procedures.md, skill-curation.md | Leftover routing rules for unfinished work; Review Console consolidation template; Step 5 cleanup procedures (design wrapper caches, pipeline run dir archival, worktree teardown); Step 7 skill curation (seed gather, independent domain-scoped scan + gap detection, 6-dimension analysis, ≥2-of-3 new-skill gate, stage/present) — generates candidates from the work itself, not only ledger-tagged seeds |
| tidy | scan-procedures.md | Per-step scan rules for Steps 1-5.5 (INBOX, deferred, specs, design-docs+briefs, plans, git worktrees, doc registry, sizing, cross-spec patterns) — inlined into each parallel agent's prompt at dispatch time |
| ledger | resolve-gate.md | Three-phase nothing-left-behind resolve gate (fix-exhaust → per-item user input → apply) referenced by /wrap-up Step 8.5 and /flow Step 5 |
| flow | manifesto.md, multi-spec.md, multispec-review-console.md, steps-and-gates.md, survey.md, validation.md, worktree-merge.md, failure-cards.md | Pipeline Config Manifesto; multi-spec batching; consolidated multi-spec Review Console; Allowed Steps + Step Arguments + Gate Behavior + polish-phase decision tree (single canonical home); Creative Opportunities + Depth Opportunities survey ownership (end-of-run analysis-only surveys; Depth surfaces `/deepen` candidates without auto-refactoring); pre-flight validation; worktree-merge handoff; on-failure card templates (generic + polish-broke-verification) loaded only when a gate fails |
| design | command-map.md, frontend-detection.md, impeccable-cli.md, modes/{test,review,shape,pre-build,polish,survey,reset-recommendations}.md | Canonical dispatch tables (auto-fit / issue-driven / intent-driven / survey "would help" criteria); frontend-vs-backend detection rules; Impeccable CLI invocation patterns; per-mode full procedures (steps, decision rules, output format) lazy-loaded by the active mode |
| help | reference-card.md, context-flow.md, status-scan.md | Quick reference card (single source of truth for the command catalog); artifact flow documentation; pipeline status scan parallel-dispatch procedure (Stages 1-7) |
| research | methodology.md | Delegates to Claude Code's built-in `/deep-research` Dynamic Workflow when available; otherwise runs the lean inline model-driven method in `methodology.md` (decompose → parallel search → adversarial verify → synthesize). Citation-audited markdown reports under `.claude-tweaks/research/`. |

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
- **Component-skill contract** — Skills that are routinely invoked by other skills (e.g., `/simplify`, `/reflect`, `/deepen`, `/journeys`, `/visual-review`, `/design`, `/capture`, `/challenge`, `/stories`) MUST detect whether they were invoked by a parent skill or directly by a user. When invoked by a parent, omit the `## Next Actions` block — the parent owns the handoff and Next Actions belong to the parent's flow. When invoked directly, render Next Actions as usual. Document this contract explicitly with a labeled `## Component-Skill Contract` paragraph placed **immediately before `## Anti-Patterns`** (after any post-workflow documentation sections such as Output contract or Reference sub-files). The paragraph must name the parent skills and use a **programmatic detection signal** — preferred is `$PIPELINE_RUN_DIR` (set by `/flow` and all pipeline orchestrators), with an explicit `--source <parent-skill>` flag as fallback for direct invocation where ambiguity exists. Vague signals like "pipeline context arguments" or "whether the caller consumes the return value" are insufficient — the model cannot reliably detect those at invocation time.

  **Canonical CSC template** (copy-paste, customize the parent list):

  ```markdown
  ## Component-Skill Contract

  When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:{this-skill}` is running inside a pipeline (invoked by `/claude-tweaks:{parent-1}`, `/claude-tweaks:{parent-2}`, or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

  Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal).
  ```

- **Next Actions placement** — Render as `## Next Actions` (top-level section, NOT `###`) placed **at the end of the workflow steps and before Component-Skill Contract / Anti-Patterns / Relationship to Other Skills**. Conceptually: Next Actions is the user-facing handoff after the last workflow Step; CSC, Anti-Patterns, and Relationship are meta-documentation for skill authors and should come last. A skill with no Component-Skill Contract still places Next Actions before Anti-Patterns.

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

### Releasing (two repos)

A release touches **both** this repo and the separate marketplace repo (`thomasholknielsen/claude-tweaks-marketplace`):

1. Bump `version` in `.claude-plugin/plugin.json` here; commit + push `main`.
2. In the marketplace repo, edit `.claude-plugin/marketplace.json`:
   - `plugins[].version` **mirrors this plugin's version** (e.g., `4.17.0`).
   - `metadata.version` is the **marketplace's own independent scheme** (currently `2.x`) — bump it on catalog changes, not in lockstep with the plugin.
   - Keep `plugins[].description` aligned with `plugin.json`'s description.
   - Commit + push `main`.

The marketplace `source` is an **unpinned git URL**, so installs and updates track this repo's `main` HEAD — there are no git tags. The marketplace `version` is catalog metadata, not what gates the install.

### Cross-references

- Every skill's Relationship table must be bidirectional — if A references B, B must reference A
- Workflow diagrams in `/help` must list all skills
- The artifact lifecycle diagram in `/help` and `README.md` must stay in sync

## Commands

```bash
claude --plugin-dir ./              # Local development — load plugin from current directory
node --test tests/                  # Run Node tests (statusline + libs)
```

### Subagent Contract (v4.2+)

Skills that dispatch parallel Task agents must reference `skills/_shared/subagent-output-contract.md` and follow its full contract: minimal **input** (scope + paths + literal output template — no conversation history), a **status line** (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`) as the agent's first reply line, an **output template** (Template A/B/C) inlined verbatim in the dispatch prompt, and **model tier selection** (`Fast | Standard | Capable`) appropriate to the work. Agents only see what's in their prompt — references to sibling files don't reach them. Used by `/browse`, `/challenge`, `/help`, `/init`, `/review`, `/specify`, `/test` (qa-prompts), `/tidy`, and `/visual-review`. When adding a new dispatch site, follow the full pattern, not just the output template.

### Auto-Mode Contract + Bookend Architecture (v4.6+)

claude-tweaks pipelines have at most two stops in `auto` mode: a **Pipeline Config Manifesto** at the start (one structured numbered-options block collecting all policy levers in a single message) and a **Wrap-Up Review Console** at the end (one batch table consolidating everything auto-decided or staged). Everything in between is policy-driven automation logged to the auto-decision log.

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
- Don't write to `~/.claude-tweaks/` from skill content — that path is runtime state owned by the harness layer (statusline wrapper, caches, usage state)
- Don't dispatch parallel Task agents without inlining a literal output template (Template A/B/C) from `skills/_shared/subagent-output-contract.md` in the agent prompt — references won't reach the agent
- Don't dispatch agents that run `git` or `node --test` without anchoring the working directory in the prompt — see "Working Directory Discipline" in `skills/_shared/subagent-output-contract.md`. CWD does not propagate reliably; without an explicit `cd "$WORKTREE"` or `git -C "$WORKTREE"` and a `pwd` + `git rev-parse --show-toplevel` check before commit, commits and test runs can land in the wrong checkout
- Don't invent new mid-flow stops in `auto` mode — if a decision is decision-worthy, stage it to the auto-decision log and surface at the Wrap-Up Review Console. Mid-flow stops are reserved for HARD-GATEs and the explicit "not silenced" list in `_shared/auto-mode-contract.md`
- Don't auto-resolve a decision without writing to the auto-decision log — silent automation without an audit trail is forbidden
