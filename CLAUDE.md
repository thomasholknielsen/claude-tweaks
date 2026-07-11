# CLAUDE.md — claude-tweaks plugin

## What this is

A Claude Code plugin (v5.7.0) containing markdown skill files that guide Claude through a structured development lifecycle, with browser automation, QA pipeline support, a statusline, and a subagent contract for parallel dispatch.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Claude Code plugin system + Node 18+ (for the statusline) |
| Content | Markdown (SKILL.md files with YAML frontmatter); Node modules under `bin/` |
| Dependencies | Superpowers plugin (`/superpowers:brainstorming`, `/superpowers:writing-plans`, `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, `/superpowers:using-git-worktrees`, `/superpowers:finishing-a-development-branch`, `/superpowers:dispatching-parallel-agents`, `/superpowers:systematic-debugging`), code-simplifier (built-in subagent), agent-browser (optional), git CLI (optional — required only for the statusline git segment), gh CLI (optional — required for /code-health issue filing and the GitHub PR/issue scans in /tidy and /help) |
| Test runner | `node --test tests/` (built-in, no external deps) |
| Distribution | Plugin marketplace via `thomasholknielsen/claude-tweaks-marketplace` |

## Structure

```
.claude-plugin/plugin.json        → Plugin manifest (name, version, description)
skills/{name}/SKILL.md            → Skill definition (frontmatter + body)
skills/{name}/*.md                → Sub-files lazy-loaded by the skill
skills/_shared/*.md               → Cross-skill shared content (subagent contract, auto-mode contract, auto-decision log, browser detection, pipeline run dir, dev URL detection, git discipline, design-wrapper handling, multi-agent coordination, decision records / ADR gate, **shared analysis criteria: architecture-depth / simplification / review-quality**, harness-health-analysis (canonical harness-drift judge shared by /init, /wrap-up, and /harness-health), issue-claims contract (refs/claims/* atomic lock), github-pr-scan (GitHub PR/issue state for /tidy Step 4.8 + /help Stage 4.5))
agents/{name}.md                  → Agent definitions (frontmatter + body)
hooks/hooks.json                  → Hook definitions (SessionStart/SessionEnd/PreCompact continuity + PreToolUse/PostToolUse/SubagentStop enforcement, all via bin/hooks.js)
bin/hooks.js                      → Hook dispatcher (one entry point for all hook events + record-worktree/close-run subcommands)
bin/                              → Node executables (statusline, deps check)
bin/lib/                          → Shared Node helpers (color, deps, coordination, issue claims + ingestion, policy). Multi-file modules live directly at bin/lib/{name}/ (e.g. bin/lib/issues/, bin/lib/hooks/, bin/lib/watchman-core/) — flat sibling directories, NOT a nested _shared/ wrapper. That convention is specific to skills/_shared/; don't assume it applies here.
tests/                            → Node test files (node --test runner)
README.md                         → User-facing documentation
LICENSE                           → MIT
```

### Skill directories (27 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, triage

### Skills with sub-files

| Skill | Sub-files | Purpose |
|-------|-----------|---------|
| init | detection-tables.md, profile-templates.md, claude-md-template.md, skill-template.md, skill-categories.md, summary-templates.md, docs-structure.md, bootstrap-steps.md, phase-3-classification.md, phase-4-scoring.md, update-mode.md | Lazy-loaded reference content per phase; doc registry format, tier detection, folder taxonomy; Phase 0 bootstrap procedures; Step 9 GitHub issue form offer (agent-task.yml); Phase 3 auto/confirmation gate template; Phase 4 scoring procedure + manifest template; Update-Mode procedures (Phase 1u inventory, contract-drift, early-exit gate) loaded only when existing config is detected |
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
| wrap-up | leftover-routing.md, review-console.md, cleanup-procedures.md, skill-curation.md | Leftover routing rules for unfinished work; Review Console consolidation template; Step 5 cleanup procedures (design wrapper caches, pipeline run dir archival, worktree teardown, issue-claim release (item 8) with ownership check); Step 7 skill curation (seed gather, independent domain-scoped scan + gap detection, 6-dimension analysis, ≥2-of-3 new-skill gate, stage/present) — generates candidates from the work itself, not only ledger-tagged seeds |
| tidy | scan-procedures.md | Per-step scan rules for Steps 1-5.5 (backlog, specs, design-docs+briefs, plans, git worktrees, doc registry, sizing, cross-spec patterns, issue claims (Step 4.7), GitHub PRs + code-health issues (Step 4.8 via _shared/github-pr-scan.md)) — inlined into each parallel agent's prompt at dispatch time |
| ledger | resolve-gate.md | Three-phase nothing-left-behind resolve gate (fix-exhaust → per-item user input → apply) referenced by /wrap-up Step 8.5 and /flow Step 5 |
| flow | manifesto.md, multi-spec.md, multispec-review-console.md, steps-and-gates.md, survey.md, validation.md, worktree-merge.md, failure-cards.md | Pipeline Config Manifesto; multi-spec batching; consolidated multi-spec Review Console; Allowed Steps + Step Arguments + Gate Behavior + polish-phase decision tree (single canonical home); Creative Opportunities + Depth Opportunities survey ownership (end-of-run analysis-only surveys; Depth surfaces `/deepen` candidates without auto-refactoring); pre-flight validation; worktree-merge handoff; on-failure card templates (generic + polish-broke-verification) loaded only when a gate fails; close-via-merge mapping (issues close on the user's merge, never `gh issue close`); pure executor — accepts a spec number or an issue reference (`#<issue>`) handed off by `/claude-tweaks:triage dispatch`, never selects/filters/claims issues itself |
| design | command-map.md, frontend-detection.md, impeccable-cli.md, modes/{test,review,shape,pre-build,polish,survey,reset-recommendations}.md | Canonical dispatch tables (auto-fit / issue-driven / intent-driven / survey "would help" criteria); frontend-vs-backend detection rules; Impeccable CLI invocation patterns; per-mode full procedures (steps, decision rules, output format) lazy-loaded by the active mode |
| help | reference-card.md, context-flow.md, status-scan.md | Quick reference card (single source of truth for the command catalog); artifact flow documentation; pipeline status scan parallel-dispatch procedure (Stages 1-7 incl. sub-stages 1.5/4.5/4.6, current-PR scan, and triage-queue counts) |
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

- **Decisions** — call the `AskUserQuestion` tool with human-readable options (2-4 typical) so the user gets a native rendered choice instead of typing a digit back. Mark the recommended option's label with `(Recommended)`.
- **Multi-item decisions** — batch table with pre-filled recommendations, rendered as markdown (AskUserQuestion cannot display dense multi-row data). Then capture the terminal apply-all/override decision with one `AskUserQuestion` call (2-4 options: at minimum "Apply all recommended" and "Override specific items"). When "Override specific items" is chosen, the user's #-by-# corrections are ordinary free-text chat in the next message — not the tool's `Other` field, which is a single answer to the batch question, not a per-item list. For 10+ items, lead with a severity/count summary before the full table so the user sees the scope before the details.
- **One decision per message** — never make more than one `AskUserQuestion` call in a single response. If a skill produces multiple decision tables, present them sequentially (one call per message, wait for resolution before showing the next).
- **Skill handoffs (Next Actions)** — End each skill with a `## Next Actions` block (standalone, top-level; a Next Actions block nested inside a larger rendered report template — Pipeline Summary, failure cards, review summary — may stay `### Next Actions` as that report's own subsection heading), rendered as one `AskUserQuestion` call: 2-4 options, each option's description carrying the full command with all parameters pre-filled, each label a short one-line summary, one option's label suffixed `(Recommended)` based on context. `Other` (always available on `AskUserQuestion`) covers "none of these, I'll type something else." Options are dynamically generated from available context (journeys, UI changes, worktree mode, QA stories, browser availability). Never a navigation menu, never generic commands without parameters. If situational filtering would leave fewer than 2 options, do not call `AskUserQuestion` — state or execute the single remaining action directly (a lone option isn't a decision).
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
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.
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

1. Before bumping, check `git log --oneline -5 .claude-plugin/plugin.json` for a bump landed by another concurrent session — two sessions bumping to the same next version merges with no textual conflict (the field resolves to the same string either way), so the collision only surfaces semantically, as two features claiming one version number. If one landed after you branched, renumber yours to the next free version first. Then bump `version` in `.claude-plugin/plugin.json` here; commit + push `main`.
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

### Hooks

All hook registrations route through `bin/hooks.js <event>` — one dispatcher, one module per event in `bin/lib/hooks/`. Rules:

- **Never break a session.** Every path exits 0 on error; the only deliberate non-zero outcome is the pre-tool-use deny. New modules must pass the garbage-stdin invariant test in `tests/hooks-dispatcher.test.js`.
- **Tiered posture per `_shared/auto-mode-contract.md`:** block (E1 wrong-checkout commit; the `worktree.always` policy gate on Edit/Write/NotebookEdit/commit), warn (non-blocking systemMessage), inform (SessionStart additionalContext), log (append to the run dir's `events.jsonl`).
- **Project-agnostic by construction:** modules key off plugin-owned state (`$PIPELINE_RUN_DIR`, `.claude-tweaks/pipelines/`, `.claude-tweaks/policy.yml`), never off project structure. E1/E2/E3 no-op without a resolved run dir — the `worktree.always` policy gate is the one PreToolUse check that is deliberately run-independent, since its job is to require a worktree even before any pipeline run exists. `post-tool-use.js`'s closing-keyword check (warn tier) is the analogous exception on the PostToolUse side — it fires on any `git commit` regardless of run-dir state, since the gap it catches (a fix commit made outside the structured `/specify` → `/build` → `/wrap-up` pipeline, with no closing keyword) is exactly a commit that would never resolve a run dir in the first place.
- **Ambiguity resolves to allow** — E1 denies only provable mismatches. A recorded worktree whose path no longer exists also resolves to allow (fail-open) — tear-down without close-run ends enforcement, not the session. Ownership counts toward provability: `record-worktree` stamps the recording session's id (`CLAUDE_CODE_SESSION_ID`), and a wrong-checkout commit from a *different* session is allowed with a warn (`wd-foreign-session` event) instead of denied; missing identity on either side falls back to deny.
- Run-dir state files written by hooks: `events.jsonl` (append-only typed events) and `run-state.json` (status: active | interrupted | clean, worktree assignment, owning session id). Skills write run-state only through `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree <path>` / `close-run`.
- Hook processes are spawned with the harness's own environment, so a `PIPELINE_RUN_DIR` exported inside a Bash tool call does not reach them; hooks instead resolve runs via the newest-non-terminal fallback from the Bash call's cwd, and a commit issued from inside a worktree that contains no `.claude-tweaks/` resolves no run dir and is allowed (fail-open).

Referenced by (worktree assignment, enforcement, and `events.jsonl` consumption): `_shared/git-discipline.md`, `_shared/subagent-output-contract.md`, `_shared/pipeline-run-dir.md`, `_shared/auto-mode-contract.md`, `build/worktree-setup.md`, `flow/worktree-merge.md`, `wrap-up/cleanup-procedures.md`, `wrap-up/SKILL.md`, `wrap-up/review-console.md`.

## Commands

```bash
claude --plugin-dir ./              # Local development — load plugin from current directory
npm test                            # Runs node --test over tests/ AND bin/lib/code-health/tests/ AND bin/lib/issues/tests/ AND bin/lib/harness-health/tests/ AND bin/lib/journey-health/tests/
node --test bin/lib/code-health/tests/*.test.js   # Code-health unit suite only
node bin/code-health.js <cmd>             # Code-health CLI: validate-findings, classify, next-slice, status, churn-report, pull-issues
node --test bin/lib/harness-health/tests/*.test.js   # Harness-health unit suite only
node bin/harness-health.js <cmd>     # Harness-health CLI: next-target, validate-findings, mark, churn-report
node --test bin/lib/journey-health/tests/*.test.js   # Journey-health unit suite only
node bin/journey-health.js <cmd>     # Journey-health CLI: next-target, validate-findings, mark, churn-report, qa-evidence
```

### Subagent Contract (v4.2+)

Skills that dispatch parallel Task agents must reference `skills/_shared/subagent-output-contract.md` and follow its full contract: minimal **input** (scope + paths + literal output template — no conversation history), a **status line** (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`) as the agent's first reply line, an **output template** (Template A/B/C) inlined verbatim in the dispatch prompt, and **model tier selection** (`Fast | Standard | Capable`) appropriate to the work. Agents only see what's in their prompt — references to sibling files don't reach them. Used by `/browse`, `/challenge`, `/help`, `/init`, `/review`, `/specify`, `/test` (qa-prompts), `/tidy`, and `/visual-review`. When adding a new dispatch site, follow the full pattern, not just the output template.

### Auto-Mode Contract + Bookend Architecture (v4.6+)

claude-tweaks pipelines have at most two stops in `auto` mode: a **Pipeline Config Manifesto** at the start (one structured numbered-options block collecting all policy levers in a single message) and a **Wrap-Up Review Console** at the end (one batch table consolidating everything auto-decided or staged). Everything in between is policy-driven automation logged to the auto-decision log.

**Single source of truth:** `skills/_shared/auto-mode-contract.md` — defines mode states, decision precedence (CLI arg > pipeline config > project policy > skill default), reversibility/confidence/severity floors, the HARD-GATE exemption list, and what `auto` never silences (ledger resolve Phase 2, specs/backlog/ writes, `/challenge` lenses, governance gates).

**Audit trail:** `skills/_shared/auto-decision-log.md` — every auto-resolution writes a one-line entry to `.claude-tweaks/pipelines/{run-id}/decisions.md` with status (`AUTO` / `STAGED` / `KEPT-PROMPT`), rationale, and reversibility. The Review Console reads this log.

**Strict rule:** skills MUST NOT invent new mid-flow stops in `auto` mode. If a decision is decision-worthy, stage it (log it, don't act) and surface at the Review Console. Mid-flow stops are reserved for HARD-GATEs (test failures, spec compliance, structural coupling, plan validation) and the explicit "not silenced" list in the contract.

**Per-pipeline run directory** (collision-safe across parallel agents): `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/` contains `config.yml` (Manifesto answers), `decisions.md` (audit log), and `staged/` (proposals awaiting Review Console). Skills locate the active run via `PIPELINE_RUN_DIR` env var or by selecting the most recent matching run. **Project policy** lives in CLAUDE.md or `.claude-tweaks/policy.yml` — read as defaults by the Manifesto, overridable per-run.

## Backlog integration

backlog-backend: github-issues

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
- Don't spread parsed external JSON after derived/trusted fields — `{ ...parsedFields, derivedField }`, never `{ derivedField, ...parsedFields }`; parsed data silently overrides whatever follows it (bit the claim-marker parser: a spoofed `"kind"` in comment JSON overrode the regex-derived kind)
- Don't leave any cross-file promise — a deferred action, a staged artifact awaiting review, a documented lifecycle step (label removal, cleanup, close-the-loop) — without the same change-set adding the consumer that acts on it. The promise and its executor are a cross-file invariant; task-scoped review only sees one file at a time, so this recurred four separate times across one program (claim-release deferred to a console step that didn't exist; staged translations no console read; a closing carrier homed in a section current-branch mode skips; a documented label-removal instruction absent from every executing procedure) before whole-branch review caught each one. When a plan says "X happens elsewhere," grep for where "elsewhere" actually reads it before considering the task done.
- Don't consider a producer/consumer task pair complete just because each task's own review passed — verify the producer's actual output shape satisfies every field the consumer's documented workflow reads from it. Task-scoped review only sees one task's diff at a time and can't catch a shape mismatch across the task boundary; only a whole-branch review (or an explicit cross-check while planning) will. This bit harness-health (as skill-health, before its rename): `issue-payload.js`'s payload dropped `classification`/`confidence`/`reversibility`/`oldString`/`newString`/`id`, while `harness-health/SKILL.md`'s Step 7 branched on exactly those fields to decide auto-apply vs. file — both tasks passed their own review, and the gap survived until the final whole-branch pass caught it. It recurred in a later program too: `/tidy`'s merged backlog-audit scan judged parked-entry staleness against a `**Deferred:**` field that only one of six skills producing parked-stage entries actually wrote — again both the producing and consuming tasks passed their own task-scoped review, and the gap surfaced only at whole-branch review.
- Don't run merges or branch deletes in the main checkout without verifying `git branch --show-current` in the same compound command — concurrent sessions switch its branch underfoot. Prefer checkout-free fast-forward ref updates (`git push . <sha>:main`, rejects non-ff) over `git checkout main && git merge` — but note `git push` refuses to update a branch that IS currently checked out ("refusing to update checked out branch"); when `main` is checked out, fall back to a branch-guarded `git merge --ff-only <branch>` run inside that checkout instead. If main has genuinely diverged (not just checked out), `merge --ff-only` there will correctly refuse rather than silently do the wrong thing — resolve the conflict inside a worktree first, then `merge --ff-only` that resulting descendant commit into the main checkout.
- Don't suggest a `.gitignore` block (in `/init`'s bootstrap steps or elsewhere) that blanket-ignores a directory this plugin also needs a committable child of — git's `!` negation cannot reliably re-include a subdirectory of an already-ignored parent, so a blanket rule silently and permanently defeats "safe to commit" state living underneath it. This bit `.claude-tweaks/routines/{name}.yml` (documented as safe to commit) under a blanket `.claude-tweaks/` suggestion for a full release cycle before being caught. List transient subdirectories explicitly instead of ignoring the parent.
- Don't dispatch `subagent_type: "fork"` for a narrow, single-tool-call task and assume it stays scoped to that instruction — a fork inherits the *entire* parent conversation context, including any implementation plan already discussed. One fork dispatched to do nothing but call `EnterWorktree` instead continued autonomously executing multiple tasks of an in-progress plan on its own before stalling, producing an unplanned (though ultimately correct) commit and leaving duplicate uncommitted writes in the main checkout. Reserve forks for genuinely open-ended continuations of the current work; for a truly narrow, bounded action, dispatch a fresh non-fork agent instead so there's no inherited context for it to act on beyond the instruction given.
- Don't trust that a performance-motivated control-flow reorder (checking a cheap condition before an expensive one) preserves correctness just because the early-return still sits in the same place — verify which *value* now flows into any downstream security-relevant check, not just where the return happens. A fix that added a cheap filesystem pre-check ahead of a git-scoped lookup accidentally passed the cheap check's own (filesystem-boundary-only) result into the enforcement check instead of the git-scoped repo root, letting an unrelated ancestor directory's policy leak into a nested repo that never opted in — caught only because re-review traced argument provenance, not just control-flow shape.
- Don't assume a shared, kind-agnostic function (e.g. `cache.js`'s `recordAudit`, or any module documented as "shared by X/Y/Z") stays generic just because the test suite is green after a change — a caller can narrow it (e.g. hardcoding an assumption true for the only caller that exists *today*) with zero failing tests, since the caller that would expose the narrowing doesn't exist yet. This bit harness-health: `recordAudit` was changed to hardcode a `"skill:"` prefix during a task whose only call sites were skill-kind, passing the full suite, but would have silently corrupted every rule/claude-md cursor once a later, already-drafted task's call site landed. When reviewing a change to a function documented as shared/generic, explicitly check whether the change preserves that genericity — don't rely on the test suite to catch a narrowing no current caller can exercise.
- Don't assume a phase's own file list is complete just because every task's diff is internally consistent — grep the wider repo for prose that assumes the OLD state the phase is replacing, even in files no task touched. In a 5-phase code-health rename + risk-triage design, 4 of 5 phases' whole-branch reviews each found exactly one such orphan file: `skills/tidy/scan-procedures.md` (stale `--min-severity`/"critical" language after the label rename), `skills/flow/steps-and-gates.md` (missing `--quick-wins` after it was added), shared criteria fragments (a stale "critical" severity tier after it was dropped from the schema), and `README.md`'s v5.1.0 changelog (claimed hooks are "near-inert outside pipeline runs," contradicting the very CLAUDE.md section a later phase had just added an exception to). Task-scoped review can't catch this by construction — only a whole-branch review, cross-referenced against a repo-wide grep for the terms/behavior being replaced, reliably does.
- Don't assume a third-party tool's own local-state exclusion works correctly inside a linked git worktree just because it relies on `.git/info/exclude` rather than a tracked `.gitignore` — that path lives at `<main>/.git/worktrees/<name>/info/exclude`, which real git only reads for that specific worktree via `--git-common-dir` resolution, and a tool that resolves the write location from the session's raw cwd instead can silently write to the wrong worktree's exclude file, leaking its local state into every other worktree's `git status`. This bit Impeccable's automatic-hook consent/cache files (`.impeccable/config.local.json`, `hook.cache.json`, `hook.pending.json`) — confirmed by direct experimentation, not a tracked upstream issue. Given `worktree.always`, prefer adding a third-party tool's local-state files to this project's own committed `.gitignore` (which checks out identically into every worktree) over trusting the tool's own `.git/info/exclude` mechanism, regardless of what its docs recommend.
- Don't let a phase's version bump depend on remembering to add it — write an explicit "bump version" step into every phase plan whose scope is a feature addition, the same way Task lists spell out every other step. In that same 5-phase design, only Phase 1's plan included a version-bump step; Phases 2-5 didn't, and a concurrent session's unrelated feature bump (5.13.0→5.14.0) landed mid-stream and silently absorbed all four unbumped phases with no dedicated version, changelog entry, or marketplace mirror for any of them. Discovered only during a later `/wrap-up`, well after the fact.
- Don't call `mcp__claude-in-chrome__*` tools directly in plugin skills — `/browse` and its consumers (`/stories`, `/visual-review`, `/review`, `qa-agent`, `/flow`) use `agent-browser` exclusively, since it's the only backend that works in both interactive sessions and hosted Routines (claude-in-chrome has no headless/cloud mode). Exception: `/browse backend=chrome`, human-invoked only, never from auto mode or a Routine.
- Don't pass `isolation: "worktree"` to the Agent tool when dispatching from inside a worktree already set up for the task — it spins up a second, unrelated worktree instead of reusing the current one, orphaning the subagent's commit from the branch. Anchor the dispatch to the existing path via the prompt (explicit `cd`/`pwd`/`git rev-parse` check) instead, and reserve `isolation: "worktree"` for genuinely parallel agents that would otherwise conflict on the same files.
- Don't assume migrating a documented free-text bulk convention (e.g. a skill's `all: {choice}` reply pattern) onto a structured `AskUserQuestion` UI preserves that capability's visibility — the escape hatch can move into an undocumented `Other` field with no on-screen hint, discoverable only by reading the skill source. When redesigning a bulk-override mechanism onto AskUserQuestion, restate the hint in the rendered question/table text itself. This shipped in `ledger/resolve-gate.md`'s Phase 2 redesign and went unnoticed until a user hit the friction.
- Don't reuse an absolute file path captured before `EnterWorktree` switched the session's cwd — the path still resolves (it's the main checkout), so Read/Edit/Write don't error on a stale path the way a missing file would; this project's own wrong-checkout policy hook (E1) catches it instead, as a denial. Re-derive the path under the new worktree root after entering it.
- Don't defer a filesystem write to "wherever this invocation ends" in an LLM-executed skill file by enumerating known termination paths — enumeration silently misses paths, and the resulting ordering bugs are invisible to any test suite (it's prose, not code). State an unconditional rule with known cases as non-exhaustive examples, and have final review read the affected section's live end-to-end prose, not just diff hunks. Cost the `worktree.always` `/init` rollout 5 fix rounds, including a real write-ordering bug matching this exact shape.
- Don't audit for "does anything fail to handle X" with a grep for the literal keyword X — a keyword grep only finds files that already mention X, even wrongly; it structurally cannot find a file whose defect is total silence on the topic. Search for the structural pattern instead (e.g. "an array of directory names used to skip a recursive walk") across the whole subsystem. A `worktree.always`-adjacent fix's own grep-based follow-up audit found 4 lens files with a stale `.worktrees`-only skip list, but missed `code-health/scope.js` — the actual run-spine file with the identical bug — because its `SKIP_DIRS` never mentioned `.worktrees` at all; only a whole-branch review caught it.
- Don't write a plan-verification `grep` pattern with an unescaped backtick inside a single-quoted alternation — the shell reads it as command substitution, not literal grep syntax, and can break the command outright (e.g. `command not found: error`) rather than just mismatch it. Execute every planned grep against a reconstructed sample of the after-state text before handing it to an implementer, not just read the pattern — this is exactly what caught the bug in the Impeccable CLI schema-fix plan's Task 1 verification step.
- Don't consider a stale cross-skill relationship description fixed after correcting the first place it appears — the same fact can recur in a second, non-adjacent location (e.g. two separate Relationship-to-Other-Skills-style tables in paired files, each describing the same two-skill contract from its own side). Grep the touched file(s) for other occurrences of the same relationship before calling an edit complete. This bit the Impeccable CLI schema-fix: `skills/design/SKILL.md` has two tables both describing the `/design`↔`/test` severity contract, and the first pass fixed only one — only the final whole-branch review caught the other.
- Don't start `superpowers:subagent-driven-development` execution with pre-existing uncommitted work sitting in the working tree — a later task's `git add` on any overlapping file silently sweeps both bodies of work into one commit, misattributing history and requiring git surgery to split back apart. Commit (or stash) anything uncommitted before dispatching Task 1. Bit the GitHub-issues taxonomy/dispatch program: an earlier, separate bug-fix pass was left uncommitted going into SDD execution, and Task 3's own `git add` on 5 overlapping files bundled it into that task's commit.
- Don't wait until finishing a long-running branch to check how far `main` has diverged — for multi-hour/multi-task sessions, check `git log --oneline <branch>..main` periodically so conflict resolution isn't back-loaded onto the single riskiest moment (the final merge). In the same program, `main` had moved ~30 commits (including a same-file harness-health redesign) by the time the branch was finished, discovered only when attempting the merge.
- Don't rely solely on a migration plan's own literal-path verification grep (e.g. `specs/OLD\.md`) to confirm a terminology/mechanism retirement is complete — it structurally can't catch generic-vocabulary occurrences of the same retiring concept (a bare word without the `.md` suffix, a relationship-table row phrased in different words). Bake an explicit bare-word sweep into every implementer dispatch from the first task of a migration, not just once a reviewer happens to notice the gap. Across a two-design terminology migration in one session, this recurred in nearly every task until the sweep was added mid-plan, after which controller-fix rounds dropped sharply for the remaining tasks.
- Don't assume a shell-redirection trick shipped in a skill's bash snippet is portable just because it works when tested in your own interactive shell — zsh and bash disagree on what a repeated same-fd redirection does (`cmd <<< "a" <<< "b"` concatenates both under zsh but keeps only the last under bash), and a fix relying on this silently produced the wrong `jq` input under real bash despite looking correct under manual zsh testing. Verify any redirection-based snippet against `bash -c` explicitly before shipping it in a skill file, regardless of which shell you authored it in.
- Don't take a request to strip a recently-added dual-behavior or compatibility path at face value — check git log for why it was added (it may be a deliberate bug fix) and verify against a dependency's *current* instruction file, not its historical release-notes prose, before reversing it. A request to drop this repo's `.claude/worktrees/` vs `.worktrees/` split (added 3 days earlier to stop a live-worktree-deletion bug) turned out to be based on outdated release-notes phrasing — the installed superpowers skill's actual text already matched what was being asked for.
- Don't assert in a design doc or plan how existing, unchanged code or prose currently behaves without grepping the literal text at design time — a paraphrased summary can be wrong in ways every task-scoped review will trust rather than re-derive. The journey-health tier-improvements design doc claimed `validate-findings --tier deep` "still runs... via the same call already in use," but the actual unchanged `SKILL.md` gating only ran that call when the findings array was non-empty — the claim went unchecked against the literal file, and the resulting deep-tier-starvation bug survived all 4 task reviews until the final whole-branch review traced the real control flow.
- Don't add a new force-select phase to a rotation-based selector (like `scope.js`'s `selectTarget`) without checking whether it needs its own within-batch exclusion — a phase that ignores cursor state (because the signal it checks, e.g. file existence, isn't cursor-tracked) will repeat the same pick on every slot of a `--budget > 1`-style multi-target call, since the caller's usual cursor-bump-between-picks trick never reaches it. Caught during journey-health's deletion-force-select plan-writing, before any code existed, by tracing the `--budget` loop's interaction with the new phase by hand.
