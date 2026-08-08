# CLAUDE.md — claude-tweaks plugin

## What this is

A Claude Code plugin containing markdown skill files that guide Claude through a structured development lifecycle, with browser automation, QA pipeline support, a statusline, and a subagent contract for parallel dispatch.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Claude Code plugin system + Node 18+ (for the statusline) |
| Content | Markdown (SKILL.md files with YAML frontmatter); Node modules under `bin/` |
| Dependencies | Superpowers plugin (`/superpowers:brainstorming`, `/superpowers:writing-plans`, `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, `/superpowers:using-git-worktrees`, `/superpowers:finishing-a-development-branch`, `/superpowers:dispatching-parallel-agents`, `/superpowers:systematic-debugging`), code-simplifier (built-in subagent), agent-browser (optional), git CLI (optional — required only for the statusline git segment), gh CLI (optional — the default transport whenever `work-backend: github-issues` is active: the unified work-record system, the four health-sweep skills' issue filing, and the GitHub PR/issue scans in /tidy and /help all use it. Not a hard requirement since 6.24.0 — a `gh`-absent environment, typically a cloud Routine sandbox, routes the same CRUD surface through `_shared/github-write-transport.md`'s MCP path, with `_shared/issue-claims.md`'s file-blob claim lock standing in for the ref-level one) |
| Test runner | `node --test tests/` (built-in, no external deps) |
| Distribution | Plugin marketplace via `thomasholknielsen/claude-tweaks-marketplace` |

## Structure

Full directory tree, the per-skill sub-file table, and the command reference live in `docs/plugin-structure.md`. Orientation:

- `skills/{name}/SKILL.md` — skill definition; `skills/{name}/*.md` — sub-files lazy-loaded by that skill
- `skills/_shared/*.md` — cross-skill contracts, criteria, and canonical procedures cited by skills rather than restated
- `bin/` — Node executables; `bin/lib/{name}/` — multi-file modules as flat sibling directories, NOT a nested `_shared/` wrapper (that convention is specific to `skills/_shared/`)
- `hooks/hooks.json` + `bin/hooks.js` — one dispatcher for every hook event
- `tests/` — `node --test` suites; `evals/` — a separate Node project (own `package.json`/`node_modules`), not part of the plugin runtime

## Conventions

### SKILL.md structure

Every skill follows this structure:
1. YAML frontmatter: `name`, `description` (trigger condition)
2. Interaction style directive (identical across all skills)
3. H1 title with one-line description
4. Lifecycle position — a one-line `Lifecycle:` marker where one line suffices, or a diagram where the shape needs more (consumer sets, mechanism flows, cycles); the canonical full chain lives in `/claude-tweaks:help`
5. "When to Use" section
6. Input resolution (how `$ARGUMENTS` is parsed)
7. Numbered workflow steps
8. Anti-Patterns table (`| Pattern | Why It Fails |`)

Skills do **not** carry a Relationship to Other Skills table. That convention was removed in v6.34.0 — every edge is recorded once in `docs/skill-graph.md` instead.

**Size:** treat 40 KB as a soft ceiling for a single SKILL.md — see the extraction rule in `## Don'ts`.

### Interaction patterns

- **Decisions** — call the `AskUserQuestion` tool with human-readable options (2-4 typical) so the user gets a native rendered choice instead of typing a digit back. Mark the recommended option's label with `(Recommended)`.
- **Multi-item decisions** — batch table with pre-filled recommendations, rendered as markdown (AskUserQuestion cannot display dense multi-row data). Then capture the terminal apply-all/override decision with one `AskUserQuestion` call (2-4 options: at minimum "Apply all recommended" and "Override specific items"). When "Override specific items" is chosen, the user's #-by-# corrections are ordinary free-text chat in the next message — not the tool's `Other` field, which is a single answer to the batch question, not a per-item list. For 10+ items, lead with a severity/count summary before the full table so the user sees the scope before the details.
- **One decision per message** — never make more than one `AskUserQuestion` call in a single response. If a skill produces multiple decision tables, present them sequentially (one call per message, wait for resolution before showing the next).
- **Skill handoffs (Next Actions)** — End each skill with a `## Next Actions` block (standalone, top-level; a Next Actions block nested inside a larger rendered report template — Pipeline Summary, failure cards, review summary — may stay `### Next Actions` as that report's own subsection heading), rendered as one `AskUserQuestion` call: 2-4 options, each option's description carrying the full command with all parameters pre-filled, each label a short one-line summary, one option's label suffixed `(Recommended)` based on context. `Other` (always available on `AskUserQuestion`) covers "none of these, I'll type something else." Options are dynamically generated from available context (journeys, UI changes, worktree mode, QA stories, browser availability). Never a navigation menu, never generic commands without parameters. If situational filtering would leave fewer than 2 options, do not call `AskUserQuestion` — state or execute the single remaining action directly (a lone option isn't a decision).
- **Actions Performed table** — When a skill performs autonomous actions beyond what the user explicitly requested, include a `### Actions Performed` table before Next Actions. Columns: `| Action | Detail | Ref |`. Action types: `Implemented`, `Bug fix`, `Simplified`, `Operational`, `Journey`, `Ledger fix`, `History` (a git operation that rewrote or moved history — rebase, reset, cherry-pick, revert, non-fast-forward merge, amend, push; never folded into `Operational`, which means cleanup). Ref column shows short commit hash. Resolved ledger items show source phase in parentheses. Generated from git log, git diff, and ledger entries. Omit when no autonomous actions were performed.
- **Hard gates** — BLOCKED/STOP conditions that prevent proceeding with degraded state
- **Adaptive section batching** — when a skill presents multi-section material that requires sequential approval (e.g., design walkthroughs, multi-part summaries), if the user accepts 2 consecutive sections without modification, batch all remaining sections into a single approval gate. The default `Brainstorm / section-confirmation: adaptive` setting makes this the standard behavior; override with `per-section` (always ask) or `batch` (always present once). The same `adaptive` setting also governs `/superpowers:brainstorming` Step 8 (the spec-review gate before `/superpowers:writing-plans`): skip its blocking wait when Step 5's approval was clean and Step 7's self-review made no substantive change (ambiguity resolved by judgment call, scope/decomposition shift, or a contradiction resolved by interpretation) — state the committed path and proceed directly to writing-plans. A substantive self-review change still stops, surfacing only that delta. This overrides brainstorming's own wait instruction on the claude-tweaks side; no superpowers file is edited.
- **Front-door confirm + opt-in Customize** — when a flow gathers multiple sequential inputs (schedule, environment, etc.) before one consequential action, front-load a defaults-based preview+confirm as the fast path and gate the sequential input-gathering behind an explicit `Customize` choice reached only from that confirm, rather than always running the gathering up front. Collapses N round-trips to 1 for the common case.
- **Component-skill contract** — Skills that are routinely invoked by other skills (e.g., `/simplify`, `/reflect`, `/deepen`, `/journeys`, `/visual-review`, `/design-wrapper`, `/capture`, `/challenge`, `/stories`) MUST detect whether they were invoked by a parent skill or directly by a user. When invoked by a parent, omit the `## Next Actions` block — the parent owns the handoff and Next Actions belong to the parent's flow. When invoked directly, render Next Actions as usual. Document this contract explicitly with a labeled `## Component-Skill Contract` paragraph placed **immediately before `## Anti-Patterns`** (after any post-workflow documentation sections such as Output contract or Reference sub-files). The paragraph must name the parent skills and use a **programmatic detection signal** — preferred is `$PIPELINE_RUN_DIR` (set by `/flow` and all pipeline orchestrators), with an explicit `--source <parent-skill>` flag as fallback for direct invocation where ambiguity exists. Vague signals like "pipeline context arguments" or "whether the caller consumes the return value" are insufficient — the model cannot reliably detect those at invocation time.

  **Canonical CSC template** (copy-paste, customize the parent list):

  ```markdown
  ## Component-Skill Contract

  When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:{this-skill}` is running inside a pipeline (invoked by `/claude-tweaks:{parent-1}`, `/claude-tweaks:{parent-2}`, or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

  Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal).
  ```

- **Next Actions placement** — Render as `## Next Actions` (top-level section, NOT `###`) placed **at the end of the workflow steps and before Component-Skill Contract / Anti-Patterns**. Conceptually: Next Actions is the user-facing handoff after the last workflow Step; CSC and Anti-Patterns are meta-documentation for skill authors and should come last. The retired Relationship table was meta-documentation of the same kind — which is why it could leave the shipped payload entirely rather than merely move down the file. A skill with no Component-Skill Contract still places Next Actions before Anti-Patterns.

### Frontmatter conventions

- **`name`** — required. The **bare** skill name (`wrap-up`), never `claude-tweaks:wrap-up` — the harness prepends the plugin namespace itself, so a prefixed value renders as `/claude-tweaks:claude-tweaks:wrap-up` in the command list. This does not change prose cross-references, which still use the fully-qualified `/claude-tweaks:{skill}` form; the two were conflated in `e9d5cb4a` and separated again in 6.50.1.
- **`description`** — required. Trigger sentence ("Use when …") followed by optional keywords.
- **`allowed-tools`** — **omit by default**. Skills inherit the global tool set when this field is absent. Declare `allowed-tools:` only to **restrict** — e.g., a read-only auditing skill that should never modify files would declare `allowed-tools: Read, Grep, Glob, Bash`. Declaring a narrow set (like `allowed-tools: Bash`) when the skill actually uses Read/Edit/Glob/Task is a bug — it either lies about the contract or silently breaks the skill if the harness enforces it. When in doubt, omit the field.
- **`argument-hint`** — required whenever a skill's `## Input` section documents any accepted argument grammar; omit only for a skill that genuinely takes no arguments at all — none currently do (every skill in this plugin declares a non-empty `argument-hint`), but the convention still applies if one is ever added. Shows as greyed-out placeholder text in the terminal when the user types `/claude-tweaks:{skill}` — purely cosmetic, has no effect on how `$ARGUMENTS`/`$1`/`$2` are parsed at runtime. Always quote the value (`"..."`, or `'...'` when the hint itself contains a literal `"`) — an unquoted value starting with `[` is invalid YAML (parsed as a flow sequence, not a string). Derive the hint directly from the skill's own `## Input` section — same bracket/pipe convention as `.claude/commands/*.md`: `[optional]`, `<required>`, `a|b` for alternatives. Keep it in sync when `## Input` changes.

### Interaction style directive

All skills use this identical directive after the frontmatter:

```
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.
```

### Parallel execution directives

Skills use three standardized blockquote forms to signal when operations should run concurrently:

| Form | Trigger | Use for |
|------|---------|---------|
| **Form A — parallel tool calls** | `> **Parallel execution:** Use parallel tool calls aggressively — all {tools} operations in {scope} are independent and should run concurrently.` | Independent read-only operations (Glob, Grep, Read, Bash). Front-loads I/O before analysis. |
| **Form B — parallel Task agents** | `> **Parallel execution:** Dispatch {scope} as parallel Task agents — each runs independently and returns {output format}. Assemble results after all agents complete.` | Heavier analytical work where each unit can run in a separate agent thread. |
| **Form C — conditional** | `> **Parallel execution (conditional):** When {condition}, dispatch {scope} as parallel Task agents. Otherwise, run sequentially in the main thread.` | Context-dependent dispatch — e.g., only for large diffs or multiple independent journeys. |

Use the exact blockquote prefix (`> **Parallel execution:**` or `> **Parallel execution (conditional):**`) so directives are visually consistent and greppable across skills.

Forms B and C always pair with the **Subagent Contract** (`skills/_shared/subagent-output-contract.md`) — minimal input, one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` as the agent's first line, then Templates A/B/C for output. Each dispatch picks a model tier (`Fast | Standard | Capable`); default to the cheapest that fits the work. Third-party agents are exempt from the agent-side protocol (see the Subagent Contract section below); the dispatcher's side still applies in full.

### Versioning

- Version lives in `.claude-plugin/plugin.json`
- Bump minor version for feature additions, patch for fixes
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional commit prefixes)

### Releasing (two repos)

A release touches **both** this repo and the separate marketplace repo (`thomasholknielsen/claude-tweaks-marketplace`).

**The whole-branch review gates the bump.** When a release concludes multi-task work, run the broad cross-task review *before* step 1, not as a later step in the same plan — per-task reviews are scoped to one task's diff by construction and cannot see a producer and its consumers sitting in different files. A plan that schedules its version bump and push as its final task has, by that ordering alone, decided that any cross-task defect ships and is fixed as a patch. That is exactly what happened in v6.48.0 → v6.48.1 (`[IL-97]`), where the review found a Critical roughly twenty minutes after the release it should have blocked.

1. A version number is claimed by whatever **ships** first — never reserved for an unexecuted plan. Before bumping, `git fetch origin main` first, then check `git log --oneline -5 origin/main -- .claude-plugin/plugin.json` (not just local history) for a bump landed by another concurrent session, **and** grep unexecuted plans under `docs/superpowers/plans/` for version literals: a plan naming your number gets renumbered, not your shipped work. Also check every sibling worktree branch for a committed-but-unmerged bump (`git worktree list`, then `git log --oneline main..<branch> -- .claude-plugin/plugin.json`) — with parallel worktree sessions as the norm here, that is the likeliest collision, and a bump can land there *after* your own pre-check cleared. **And check local `main` itself** (`git show main:.claude-plugin/plugin.json`): it can sit far ahead of `origin/main` with already-executed bumps that are on no branch, in no plan, and invisible to `git log origin/main` `[IL-98]`. Do this before writing a version into *prose* (CLAUDE.md, code comments, CHANGELOG), not just before editing `plugin.json` — local `git log` alone is blind to any bump that landed upstream after your last fetch/merge, including ones bundled inside an unrelated feature PR. Two sessions bumping to the same next version merges with no textual conflict (the field resolves to the same string either way), so the collision only surfaces semantically, as two features claiming one version number. If one landed after you branched (locally or on `origin/main`), renumber yours to the next free version first. Then bump `version` in `.claude-plugin/plugin.json` here; commit + push `main`.
2. Add the release's `CHANGELOG.md` entry **in the same commit as the bump**, as `## v{version} — {one-line summary}` directly under the `# Changelog` header (newest first). The exact heading shape is load-bearing, not cosmetic: `bin/lib/changelog.js`'s parser requires a strict `X.Y.Z` and the em-dash title, and `/claude-tweaks:init`'s upgrade notice silently skips any release whose heading it can't read. `tests/changelog-coverage.test.js` fails the suite when the manifest's version has no entry, when a heading is unparseable or duplicated, or when any version that shipped on `origin/main` is undocumented — so a deferred entry is a red suite, not a forgotten step. If a version collision forces a renumber, renumber the heading too; an entry naming a version that never reached `main` is what the coverage gate calls an orphan.
3. Append the version to `docs/shipped-versions.tsv` **in the same commit as the bump**, as `{version}\t{YYYY-MM-DD}\trelease`. That file — not a git walk — is the authority for which versions shipped, and step 2's coverage gate reads it. Reconstructing the answer from `git rev-list --first-parent` was tried and removed in v6.45.0: it is unstable, not merely lossy, because a branch that merges `main` into itself and is then pushed as `main` moves everything `main` carried since the fork point onto the merge's second parent, where the walk never looks (#144, `[IL-95]`). If a version collision forces a renumber, renumber this line too, exactly as for the changelog heading.
4. In the marketplace repo, edit `.claude-plugin/marketplace.json`:
   - `plugins[].version` **mirrors this plugin's version** (e.g., `4.17.0`).
   - `metadata.version` is the **marketplace's own independent scheme** (currently `2.x`) — bump it on catalog changes, not in lockstep with the plugin.
   - Keep `plugins[].description` aligned with `plugin.json`'s description.
   - Commit + push `main`.

The marketplace `source` is an **unpinned git URL**, so installs and updates track this repo's `main` HEAD — there are no git tags. The marketplace `version` is catalog metadata, not what gates the install.

### Cross-references

- Every relationship between skills is stated **once**, in `docs/skill-graph.md`. Adding or changing a skill means adding or updating its edges there. Do not restate an edge inside a `SKILL.md`: the bidirectional convention this replaces required each edge in two places, and the two copies drifted
- Workflow diagrams in `/help` must list all skills
- The artifact lifecycle diagram in `/help` and `README.md` must stay in sync
- Prefer describing a list's size by reference ("see the table below") over restating it as a literal count — see the cardinality rule in `## Don'ts`
- A skill reference inside actionable instruction text (a `## Step N` body, a `## Next Actions` block) MUST use the fully-qualified `/claude-tweaks:{skill}` form — the `Skill` tool requires it, and a bare `/{skill}` there fails with "Unknown skill" at invocation time. Bare short-form references (`/{skill}`) are reserved for descriptive prose and Relationship-to-Other-Skills tables, where they're never passed to a tool call.

### Hooks

All hook registrations route through `bin/hooks.js <event>` — one dispatcher, one module per event in `bin/lib/hooks/`. Rules:

- **Never break a session.** Every path — including a PreToolUse deny — exits 0; no module ever sets a non-zero `exit`. A deny is communicated entirely via `hookSpecificOutput.permissionDecision: 'deny'` in the stdout JSON, not the process exit code (see `pre-tool-use.js`'s own header comment for why exit 2 doesn't work for this). New modules must pass the garbage-stdin invariant test in `tests/hooks-dispatcher.test.js`.
- **Tiered posture per `_shared/auto-mode-contract.md`:** block (E1 wrong-checkout commit; the `worktree.always` policy gate), warn (non-blocking systemMessage), inform (SessionStart additionalContext), log (append to the run dir's `events.jsonl`). What that gate covers, what it deliberately doesn't, and its one `.claude-tweaks/pipelines/` exemption are stated once — in `skills/_shared/policy-schema.md`'s `worktree.always` coverage block, pinned to `pre-tool-use.js`'s exported `GATE_COVERAGE` by `tests/hooks-gate-coverage.test.js`. Don't restate the list here or anywhere else; five files did and all five went stale `[IL-93]`.
- **Project-agnostic by construction:** modules key off plugin-owned state (`$PIPELINE_RUN_DIR`, `.claude-tweaks/pipelines/`, `.claude-tweaks/policy.yml`), never off project structure. E1/E2/E3 no-op without a resolved run dir — the `worktree.always` policy gate is the one PreToolUse check that is deliberately run-independent, since its job is to require a worktree even before any pipeline run exists. `post-tool-use.js`'s closing-keyword check (warn tier) is the analogous exception on the PostToolUse side — it fires on any `git commit` regardless of run-dir state, since the gap it catches (a fix commit made outside the structured `/specify` → `/build` → `/wrap-up` pipeline, with no closing keyword) is exactly a commit that would never resolve a run dir in the first place. The deferred-subproject capture check (also warn tier) mirrors this on `Write`: it fires on any write to `docs/superpowers/specs/*-design.md` regardless of run-dir state, since a brainstorming session that hasn't reached `/specify` yet has no pipeline run dir to gate on either.
- **Ambiguity resolves to allow** — E1 denies only provable mismatches. A recorded worktree whose path no longer exists also resolves to allow (fail-open) — tear-down without close-run ends enforcement, not the session. Ownership counts toward provability: `record-worktree` stamps the recording session's id (`CLAUDE_CODE_SESSION_ID`), and a wrong-checkout commit from a *different* session is allowed with a warn (`wd-foreign-session` event) instead of denied; missing identity on either side falls back to deny.
- Run-dir state files written by hooks: `events.jsonl` (append-only typed events) and `run-state.json` (status: active | interrupted | clean, worktree assignment, owning session id). Skills write run-state only through `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree <path>` / `close-run`.
- Hook processes are spawned with the harness's own environment, so a `PIPELINE_RUN_DIR` exported inside a Bash tool call does not reach them; hooks instead resolve runs from the Bash call's cwd, and a commit issued from inside a worktree that contains no `.claude-tweaks/` resolves no run dir and is allowed (fail-open).
- **Two resolutions, not one** (`context.js`'s `resolveRun`, since 6.47.0): enforcement reads the newest non-terminal run *regardless of owner* — E1's foreign-session warning exists precisely to tell a bystander the checkout belongs to someone else's worktree. Anything that **writes** (event breadcrumbs, `interrupted`/`lastEvent` stamps) uses the ownership-scoped `ctx.ownedRun` instead: a run owned by another session is never written to, and an unowned run is written to but tagged `attribution: "fallback"`. Ownership is stamped only by `record-worktree`, so runs that never provisioned a worktree stay unowned by design `[IL-96]`.

Referenced by (worktree assignment, enforcement, and `events.jsonl` consumption): `_shared/git-discipline.md`, `_shared/subagent-output-contract.md`, `_shared/pipeline-run-dir.md`, `_shared/auto-mode-contract.md`, `build/worktree-setup.md`, `flow/worktree-merge.md`, `dispatch/SKILL.md` (auto-merge gate clears the run's worktree assignment via `close-run` before merging into the main checkout), `wrap-up/cleanup-procedures.md`, `wrap-up/SKILL.md`, `wrap-up/review-console.md`.

## Commands

```bash
npm test                            # Full suite — tests/ plus every bin/lib/*/tests/ directory
npm run test:perf                   # Timing budgets (perf/) — deliberately excluded from npm test, see docs/plugin-structure.md
claude --plugin-dir ./              # Local development — load plugin from current directory
```

Per-suite test invocations, the `bin/*.js` CLIs (the four health sweeps plus `record-graph` and `wrap-up-state`), and the evals harness commands are in `docs/plugin-structure.md`.

### Subagent Contract (v4.2+)

The contract is **dispatch correctness** discipline, not a token-saving measure: the clean room is what makes N agents independent evidence rather than N echoes, the status line stops a failed dispatch from aggregating as a clean result, and the templates keep aggregation mechanical rather than paraphrased. Costing less to run is a side effect, never the rationale.

Skills that dispatch parallel Task agents must reference `skills/_shared/subagent-output-contract.md` and follow its full contract: minimal **input** (scope + paths + literal output template — no conversation history), a **status line** (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`) as the agent's first reply line, an **output template** (Template A/B/C) inlined verbatim in the dispatch prompt, and **model tier selection** (`Fast | Standard | Capable`) appropriate to the work. Agents only see what's in their prompt — references to sibling files don't reach them. Used by `/browse`, `/dispatch` (one Task agent per claimed file-overlap group — its own minimal GROUP/OUTCOME/MANIFEST template, since none of Templates A/B/C fit a full-pipeline-execution agent, but the four-value status line and input discipline still apply), `/help`, `/init`, `/review`, `/specify`, `/test` (qa-prompts), `/tidy`, and `/visual-review`. When adding a new dispatch site, follow the full pattern, not just the output template.

**Third-party agents are exempt**, on a structural condition: the agent's definition lives outside this repo's `agents/` directory, so it ships with someone else's plugin and is invoked as a delegation. Anything under our own `agents/` is never exempt. The exemption covers the agent only — the caller still normalizes the foreign output at the boundary, checks availability at the *agent* level (plugin presence does not imply agent presence), and distinguishes unavailable / failed / empty / unparseable rather than reporting a clean result. `impeccable-finish-reviewer` is the one such dispatch today (`design-wrapper/modes/review.md` Step 3.7). Full carve-out: the Exemption section of that `_shared` file.

### Auto-Mode Contract + Bookend Architecture (v4.6+)

claude-tweaks pipelines have at most two stops in `auto` mode: a **Pipeline Config Manifesto** at the start (one structured numbered-options block collecting all policy levers in a single message) and a **Wrap-Up Review Console** at the end (one batch table consolidating everything auto-decided or staged). Everything in between is policy-driven automation logged to the auto-decision log.

**Single source of truth:** `skills/_shared/auto-mode-contract.md` — defines mode states, decision precedence (CLI arg > pipeline config > project policy > skill default), reversibility/confidence/severity floors, the HARD-GATE exemption list, and what `auto` never silences (ledger resolve Phase 2, work-record creation — new backlog or parked records, governance gates) — except the narrow, explicit `unattended-tier` opt-in (see `_shared/unattended-tier.md`), which lets floor-clearing ledger residue, queue writes, and ops-ack resolve without a click.

**Audit trail:** `skills/_shared/auto-decision-log.md` — every auto-resolution writes a one-line entry to `.claude-tweaks/pipelines/{run-id}/decisions.md` with status (`AUTO` / `STAGED` / `KEPT-PROMPT` / `SCANNED`), rationale, and reversibility. The Review Console reads this log.

**Strict rule:** skills MUST NOT invent new mid-flow stops in `auto` mode. If a decision is decision-worthy, stage it (log it, don't act) and surface at the Review Console. Mid-flow stops are reserved for HARD-GATEs (test failures, spec compliance, structural coupling, plan validation) and the explicit "not silenced" list in the contract.

**Per-pipeline run directory** (collision-safe across parallel agents): `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/` contains `config.yml` (Manifesto answers), `decisions.md` (audit log), and `staged/` (proposals awaiting Review Console). Skills locate the active run via `PIPELINE_RUN_DIR` env var or by selecting the most recent matching run. **Project policy** lives in `.claude-tweaks/policy.yml` — the only config home since 6.48.0 — read as defaults by the Manifesto, overridable per-run.

## Work records

work-backend: github-issues

## Don'ts

Rules only — each is a rule plus one clause of why. Where a rule carries an `[IL-nn]` tag, the full post-mortem behind it (which build it bit, how it was caught, what it cost) is in `docs/incident-log.md`.

**Adding one:** write the incident-log entry first, then compress to the rule — writing the rule first pads it, and this file is paid for per dispatched agent, not per session. Allocate the next free `IL-nn`; never renumber, gaps are fine. **Removing one:** `/claude-tweaks:harness-health`'s rule-expiry check proposes it, and only on positive evidence the hazard can no longer occur — a rule nobody has violated lately is usually one that is working. The incident-log entry stays even when its rule goes.

- Don't add "What's Next?" / "Pick an action" navigation menus at the end of skills — use `## Next Actions` blocks with pre-filled commands
- Don't add per-item decision prompts for lists — use batch tables with "apply all / override"
- Don't create skills without the standard structure (frontmatter, interaction directive, anti-patterns table) — and don't add a relationship table back; its edges belong in `docs/skill-graph.md`
- Don't add one-directional cross-references — always update both sides
- Don't silently skip or drop findings — every surfaced item must be explicitly resolved (fix now, defer, accept with reason)
- Don't put detailed reference content inline in a SKILL.md when it would make the file unwieldy — use a sub-file and reference it with "read `{filename}` in this skill's directory". Treat **40 KB as a soft ceiling** for one SKILL.md: past it, within-file consistency failures (a contract restated twice, only one copy updated) start appearing, because the file is too long to hold coherently. Extract rather than reorganize in place — the pending extraction record (#90) is the path back under it. **The ceiling applies to the sub-file too.** A sub-file is a lazy-load unit, not an overflow bucket: `Read` has no section granularity, so the moment two or more stubs cite *sections* of one sub-file, every stub pays the whole file. That shape — not size alone — is the defect; `init/bootstrap-steps.md` reached 86 KB behind 18 section-naming stubs while this rule was followed to the letter (#83, `[IL-70]`). Split by the unit the stubs actually name. When extracting, leave the original heading in place as a stub — external references name sections and step numbers, and a surviving heading keeps them resolving in one hop; then confirm nothing was dropped by checking that every substantive original line still appears somewhere in the new file set, since no test reads skill prose
- Don't forget to update README.md and `/help` when adding or changing skills
- Don't use emojis in skill files — use `**(Recommended)**` bold text for emphasis instead
- Don't write to `~/.claude-tweaks/` from skill content — that path is runtime state owned by the harness layer
- Don't dispatch parallel Task agents without inlining a literal output template (Template A/B/C) from `skills/_shared/subagent-output-contract.md` — references won't reach the agent
- Don't dispatch agents that run `git` or `node --test` without anchoring the working directory in the prompt — CWD doesn't propagate reliably, so work lands in the wrong checkout. Require `cd "$WORKTREE"` plus a `pwd` + `git rev-parse --show-toplevel` check before commit
- Don't invent new mid-flow stops in `auto` mode — stage decision-worthy things to the auto-decision log and surface them at the Wrap-Up Review Console; stops are reserved for HARD-GATEs and `_shared/auto-mode-contract.md`'s "not silenced" list
- Don't auto-resolve a decision without writing to the auto-decision log — silent automation without an audit trail is forbidden
- Don't spread parsed external JSON after derived/trusted fields — `{ ...parsed, derived }`, never the reverse; parsed data silently overrides whatever follows it `[IL-01]`
- Don't leave a cross-file promise (a deferred action, a staged artifact, a documented lifecycle step) without the same change-set adding the consumer that acts on it — task-scoped review sees one file at a time and cannot catch the gap `[IL-02]`
- Don't write a plan step that deletes content justified by "this now lives in Step N" unless Step N's own drafted text actually includes it — read it directly; a reviewer will match the diff to the plan's own wrong instruction and approve `[IL-03]`
- Don't consider a producer/consumer task pair complete just because each task's own review passed — verify the producer's output shape carries every field the consumer reads, since only whole-branch review catches a cross-boundary mismatch `[IL-04]`
- Don't run merges or branch deletes in the main checkout without verifying `git branch --show-current` in the same compound command — concurrent sessions switch its branch underfoot. Prefer `git push . <sha>:main`; when `main` is checked out that's refused, so use a branch-guarded `git merge --ff-only` there `[IL-05]`
- Don't blanket-ignore a directory in `.gitignore` when this plugin needs a committable child of it — `!` negation can't reliably re-include a subdirectory of an ignored parent. List transient subdirectories explicitly `[IL-06]`
- Don't dispatch `subagent_type: "fork"` for a narrow, bounded task — a fork inherits the entire parent conversation, including any in-progress plan, and acts well beyond your instruction. Use a fresh non-fork agent `[IL-07]`
- Don't trust a fork's own narrative of what it did — verify `tool_uses`/duration and real git/`gh` state; reports err in both directions, claiming too little or too much `[IL-07]`
- Don't assume a performance-motivated control-flow reorder preserves correctness because the early-return sits in the same place — verify which *value* now reaches any downstream security-relevant check `[IL-08]`
- Don't assume a shared, kind-agnostic function stays generic because the suite is green — a caller can narrow it with zero failing tests, since the caller that would expose the narrowing doesn't exist yet `[IL-09]`
- Don't assume a phase's file list is complete because every task's diff is self-consistent — grep the wider repo for prose assuming the OLD state, including untouched files; task-scoped review can't catch an orphan by construction `[IL-10]`
- Don't trust a third-party tool's `.git/info/exclude` local-state exclusion inside a linked worktree — that path is worktree-specific, and a tool resolving it from raw cwd leaks state into every other worktree. Use this project's committed `.gitignore` `[IL-11]`
- Don't let a phase's version bump depend on remembering it — write an explicit bump step into every feature-addition phase plan, or a concurrent session's bump silently absorbs yours with no changelog entry or marketplace mirror `[IL-12]`
- Don't call `mcp__claude-in-chrome__*` tools directly in plugin skills — `agent-browser` is the only backend that works in both interactive sessions and hosted Routines. Exception: `/browse backend=chrome`, human-invoked only
- Don't call the `Artifact` tool from plugin skills — claude.ai-hosted availability isn't guaranteed across environments, and publishing pushes project content to a third-party link. `/claude-tweaks:visualize` writes standalone HTML instead
- Don't pass `isolation: "worktree"` to the Agent tool when dispatching from inside a worktree already set up for the task — it creates a second, unrelated worktree and orphans the commit. Anchor to the existing path via the prompt
- Don't assume migrating a free-text bulk convention onto an `AskUserQuestion` UI preserves that capability's visibility — the escape hatch lands in an undocumented `Other` field. Restate the hint in the rendered text `[IL-13]`
- Don't reuse an absolute path captured before `EnterWorktree` switched cwd — it still resolves (to the main checkout), so nothing errors; the wrong-checkout hook denies the write instead. Re-derive under the new root
- Don't defer a filesystem write to "wherever this invocation ends" by enumerating termination paths — enumeration misses paths, and the ordering bugs are invisible to any test suite because it's prose. State an unconditional rule `[IL-14]`
- Don't audit for "does anything fail to handle X" by grepping the keyword X — that only finds files already mentioning X, and can't find one whose defect is total silence. Grep the structural pattern instead `[IL-15]`
- Don't put an unescaped backtick inside a single-quoted alternation in a plan-verification `grep` — the shell reads it as command substitution and can break the command outright. Run every planned grep against a sample of the after-state first `[IL-16]`
- Don't consider a stale cross-skill description fixed after correcting its first occurrence — the same fact recurs elsewhere, often reworded, so a keyword grep narrows the search but doesn't replace reading the whole file `[IL-17]`
- Don't hand-list a skill's reciprocal Relationship entries as a separate design-doc checklist when its own drafted table already names them — the two lists restate one fact and drift. Derive the checklist from the table `[IL-18]`
- Don't start `superpowers:subagent-driven-development` with uncommitted work in the tree — a later task's `git add` on an overlapping file sweeps both bodies of work into one commit. Commit or stash first `[IL-19]`
- Don't wait until a long-running branch is finished to check how far `main` has diverged — check `git log --oneline <branch>..main` periodically so conflict resolution isn't back-loaded onto the riskiest moment `[IL-20]`
- Don't read `git diff <base>..HEAD --stat` as your own changes once `<base>` has diverged — it mixes in the other branch's commits. Diff against `git merge-base HEAD <base>` `[IL-20]`
- Don't rely solely on a migration plan's literal-path grep to confirm a terminology retirement — it can't catch generic-vocabulary occurrences of the same concept, nor case variants of it. Sweep case-insensitively, and bake a bare-word sweep into every dispatch from task one `[IL-21]`
- Don't assume a shell-redirection trick in a skill's bash snippet is portable because it works in your interactive shell — zsh and bash disagree on repeated same-fd redirection. Verify under `bash -c` before shipping `[IL-22]`
- Don't take a request to strip a recently-added compatibility path at face value — check git log for why it was added (often a deliberate fix) and verify against the dependency's *current* instruction file, not its release notes `[IL-23]`
- Don't assert in a design doc how existing, unchanged code or prose behaves without grepping the literal text — a paraphrase can be wrong in ways every task-scoped review trusts rather than re-derives `[IL-24]`
- Don't add a force-select phase to a rotation-based selector without an exclusion at every scope its signal can outlive — a phase ignoring cursor state repeats its pick on every slot of a `--budget > 1` call, and, if the condition holds until a human acts, on every run forever `[IL-25]`
- Don't treat a session vanishing from `claude --resume` after entering a worktree as a claude-tweaks bug — it's an upstream limitation (`EnterWorktree` pivots session storage). See `_shared/git-discipline.md`
- Don't assume `cd`-ing to a sibling repo inside a Bash command changes which project's `worktree.always` policy applies — the gate resolves from the session's tracked cwd, not the `cd` target. Workaround: `EnterWorktree` for *this* repo first `[IL-26]`
- Don't trust a markdown insertion by reading the diff — read the rendered result around it. Next to a fenced block, a stray sentence lands *inside* the fence and breaks the snippet when run; next to prose, a new paragraph can split an existing sentence and orphan its tail onto yours `[IL-27]`
- Don't write a "prove the removed pattern is gone" sweep without excluding the plan document itself — a plan documenting X's removal necessarily quotes X verbatim `[IL-28]`
- Don't let each task in a set of near-identical repeated tasks rediscover a bug an earlier sibling's review already found — patch the remaining briefs before dispatching `[IL-29]`
- Don't build a test-double whose `returns`/`throws` fields are eagerly-invoked IIFEs — they fire before the code under test runs, so the test proves nothing. Make them lazily-called functions `[IL-30]`
- Don't infer whether an optional per-consumer state slice exists from truthiness of an always-present default object — every consumer's default read is truthy, so all of them get it. Gate on an explicit construction-time flag `[IL-31]`
- Don't accept a plan's "duplicate across N≥2 near-identical consumers, no shared module yet" framing as final — extract the shared logic, so bugs in it get fixed once rather than N times `[IL-32]`
- Don't assume `flow/materialize.md`'s ordering (commit the record, then branch the worktree) works under `worktree.always` — the gate denies main-checkout writes with no pipeline-bookkeeping exemption. Create the worktree first, scaffold inside it `[IL-33]`
- Don't chain `git merge --ff-only <branch> && git push` into one Bash call from the main checkout — the hook denies the whole invocation, so the ungated merge never runs either. Issue two separate calls `[IL-33]`
- Don't write a repo-wide grep exclusion for a *file* as a bare content substring — it drops any line whose *content* mentions that path, swallowing real hits. Anchor to the path position (`grep -v "^path:"`) `[IL-34]`
- Don't approve a data-shape or destructuring fix by re-reading the code — a wrong property name reads as plausible but is silently wrong. Execute it against the real dependency and inspect the output `[IL-35]`
- For a design-mode build (brainstorm → design doc → plans → SDD, skipping `/specify`), keep the design doc and plan under `docs/superpowers/` at wrap-up — unlike the legacy spec flow, nothing consumes them. Bulk pruning is a separate deliberate action (ADR-0007) `[IL-36]`
- Don't assume two paths sharing a directory or a near-identical name belong to the same category — verify each against live cross-references before a bulk delete or rename `[IL-37]`
- Don't write a plan-embedded classifier or pattern-list without checking every entry against the target file's literal text — a pattern can match exactly what that file forbids `[IL-38]`
- Don't write a `grep -rli PATTERN . | grep -v "^./path"` exclusion — `grep -rli … .` returns paths without a leading `./`, so the exclusion silently matches nothing, every time. Anchor to the bare relative path `[IL-39]`
- Don't restate a list's cardinality as a literal in prose ("8-lever", "17 core labels") — it desyncs when the list changes, and no one keyword grep catches every reworded restatement. Prefer describing the count by reference ("see the table below"); if a literal is unavoidable, treat any cardinality-changing edit as owing a broad sweep for numeric restatements `[IL-40]`
- Don't trust a recommendation inferring "still needs action" from "a related file changed" — the change may already be the resolution. Read the matching commit's diff before acting `[IL-41]`
- Don't assume `git add <files> && git commit` commits only those files — with no pathspec, `git commit` takes the *entire* staged index. Verify `git diff --cached --name-only` immediately before each commit `[IL-42]`
- Don't dispatch parallel implementer subagents assuming file-disjointness makes it safe — their `git add`+`commit` sequences race on one shared index. Sequence dispatches until the prior commit lands `[IL-43]`
- Don't resolve a conflict against a *structural* refactor by picking a side — content still in the old location must be re-homed. When upstream refactored, take its structure wholesale, verify byte-identity, then re-apply your additions; when *your branch* refactored and upstream edited the old file in place, the mirror applies — keep your structure, re-home upstream's edits into the new files `[IL-44]`
- Don't take `ExitWorktree`'s commit-count refusal at face value when the branch already merged — it counts against the fork point, not `main`'s tip. Verify `git rev-parse HEAD` matches on both before `discard_changes: true` `[IL-45]`
- Don't let a gitignored SDD/scratch tracking file sit unresolved through worktree cleanup — removal deletes it permanently with no git history to recover from. Surface its content before cleanup `[IL-46]`
- Don't compute a git `--since` boundary via `.toISOString().slice(0, 10)` on a possibly-zero timestamp — it yields `"1970-01-01"`, returning zero commits in positive-UTC-offset zones; `@<seconds>` is also wrong (parsed as relative). Use a full ISO 8601 datetime `[IL-47]`
- Don't redo an SDD task from scratch when an implementer's connection dies mid-task — this falls outside the four documented statuses. Verify the edit via `git diff`, then dispatch a recovery agent to verify-and-commit `[IL-48]`
- Don't wrap an entire literal message in backticks when it contains a term also meant to be backtick-quoted — the nesting doesn't escape and splits into disconnected code spans. Use a blockquote for the message `[IL-49]`
- Don't add a verification/gating/resolver helper beside an existing sibling without testing that it fails in the *same direction* on malformed input — "looks like its sibling" isn't "fails like its sibling" `[IL-50]`
- Don't give parallel implementer agents git access when the fan-out is wide — dispatch them edit-only and run every git operation centrally afterward, removing the index race rather than narrowing it `[IL-51]`
- Don't treat a batch of agents each fixing one cross-cutting concern as done when each diff looks right — they can't see each other's edits, so each may leave cross-references claiming the others didn't fix it. Grep centrally `[IL-52]`
- Don't scope a parallel audit's per-skill findings to the audited skill when a finding names a sibling as having the same issue — split it into an entry under each named skill, or that sibling's fix agent never sees it `[IL-53]`
- Don't write a tool-deny guard on an SDK optional field by checking only explicit `true`/`false` — read the doc comment for the omitted default; the Agent SDK's `run_in_background` defaults to `true` `[IL-54]`
- Don't write a renumbering/rename verification grep expecting "no output" — afterwards the new numbers are legitimate content, so presence can't signal staleness either way. Verify topic-consistency instead `[IL-55]`
- Don't assume a design doc's explicit file-touch list survives into the plan it feeds — task-scoped review can't catch an item the plan never scheduled. Cross-check the two lists at plan-authoring time `[IL-56]`
- Don't scope a feature meant to prevent an observed failure down to documenting that failure as a caveat — check at design time that it closes the loop rather than narrating around it `[IL-57]`
- Don't run raw `git worktree remove` on a **locked** worktree — it fails on the lock, and superpowers' cleanup docs show only the raw form. Unlocked ones remove cleanly; a locked one is `SessionStart`'s reaper to handle, never yours `[IL-58]`
- Don't stop to ask before completing the marketplace-mirror half of a release — the Releasing section above **already authorizes both repo pushes as one action**, so pausing turns one documented step into two turns and risks the mirror never happening `[IL-59]`
- Don't assume a new subsection in a dispatcher-inlined `_shared/*.md` fragment reaches consumers because it's documented there — each consumer's own "what the dispatcher inlines" sentence must name it, or it silently no-ops `[IL-60]`
- Don't derive a *display* project name from the statusline's `workspace.*` paths by basename — `EnterWorktree` pivots them to the worktree. Detect a linked worktree and resolve via `git rev-parse --git-common-dir`'s parent `[IL-61]`
- Don't compute a test's expected value the way the implementation does from the same live environment — it can't distinguish "correct" from "matches current behavior" and passes through the bug. Derive the expectation independently `[IL-62]`
- Don't design a module assuming MCP tools are callable from a spawned subprocess — they're only invocable from the calling agent's own turn. Signal what needs writing and let the skill's prose drive the call `[IL-63]`
- Don't assume one consumer's call topology generalizes to a similar-looking sibling when designing shared infrastructure — verify each consumer's actual invocation shape before drafting the plan `[IL-64]`
- Don't assume task-scoped review catches every producer/consumer mismatch — it can't catch a same-function self-inconsistency, or prose whose literal retry instructions undo their own precondition via a code side-effect `[IL-65]`
- Don't write a plan-verification grep as a single-line literal match against markdown prose — hard-wrapped text splits phrases across lines, so it returns zero while the phrase is present. Use a whitespace-flexible pattern `[IL-66]`
- Don't assume a tool's `list` action paginates — verify a cursor/limit parameter exists before building a filter on it. When a lookup can't enumerate its domain, add a locally-recorded enumeration as a first-class source `[IL-67]`
- Don't add a resolution source to a multi-source lookup without auditing every bypass flag's own "skip these sources" list — a flag naming sources by identity silently stops skipping the new one `[IL-68]`
- Don't point an in-place transform script at the same file the transform replaces — re-running it (you will) reads its own output as source and can corrupt what it already wrote. Read from an immutable copy `[IL-70]`
- Don't leave "what happens to the artifact this step creates" unresolved when a procedure produces real, billed, hard-to-delete infrastructure — decide at design time whether it's the deliverable or a throwaway needing cleanup `[IL-69]`
- Don't implement an issue body's own suggested fix or acceptance-criteria wording without measuring it against the live files first — it reads as authoritative but was written against a snapshot and never executed; check the issue's *premise* too, not just its criteria, since the fix it asks for may already have shipped. The four health-sweep skills file such issues routinely `[IL-71]`
- Don't inline a large block into a size-capped file and plan to extract later — when a fix's deliverable is "inline N KB into a prompt," check the host file's budget first and extract to a sub-file the caller inlines *from* `[IL-72]`
- Don't run a health CLI (`bin/{code,harness,journey,docs}-health.js`) with real arguments to test a change — the invocation looks local but pushes durable state to the shared `health-state` branch and stamps a rotation cursor that suppresses that target for 90 days. Exercise the module directly or through its unit suite instead `[IL-73]`
- Don't read "grep found nothing" as a fact about the code before confirming it's a fact about the file — one stray NUL byte makes grep treat the whole file as binary and return silently, and `Edit` then fails to match text `Read` just displayed. Dump code points to check `[IL-74]`
- Don't widen what a value can range over without grepping for the invariant its old range encoded — "only ever X" comments and single-value-derived cache keys are records of that range, and both go silently wrong rather than failing a test `[IL-75]`
- Don't treat the bytes moved out of a file as an extraction's saving — measure what each resolved mode loads afterward, since the sub-file's header plus the stub left behind can exceed the branch that mode skips `[IL-76]`
- Don't correct a restated count to match its canonical source without also checking the data printed beside it — where the artifact copies that data (a rendered table, a diagram), the stale part is the copy, and a provably "right" number contradicting what the reader sees is the worse failure `[IL-77]`
- Don't add a compatibility path without recording the condition under which it gets removed — with no stated end date nothing ever collects it, and a half-maintained alias produces silently wrong behavior rather than an error `[IL-85]`
- Don't treat a passing verification as evidence without measuring what it examined — a check that would pass on any input is not a weak check, and it is most seductive when it agrees with the conclusion you wanted `[IL-78]`
- Don't grep a placeholder as a fully-delimited token — `{result}` cannot match the populated `{result: ...}`, so "zero occurrences" describes the grep, not the file. Search the bare name, and open the file before recording any absence as a finding `[IL-79]`
- Don't write a test that reads live production content you intend to change — the assertion "this real file currently contains X" is a scheduled failure timed to the migration, so the test is gone exactly when the change is riskiest. Freeze the input as a fixture `[IL-80]`
- Don't cite a figure from a plan's own measurement command without checking its boundary behavior — a design doc generated by the same command corroborates nothing `[IL-81]`
- Don't edit a reference in a dispatcher-inlined file without confirming which region actually gets inlined — a test suite's own split point tells you `[IL-82]`
- Don't place a special-case exemption after an early return that can claim the same value — the exemption only runs on whichever branch you didn't put it after `[IL-83]`
- Don't add a `bin/lib/{name}/tests/` directory without adding its glob to `package.json`'s test script — an enumerated list of globs doesn't pick up a new one on its own `[IL-84]`
- Don't let a renumber that happens *inside* a conflict resolution skip the cross-reference sweep — the diff under review is scoped to the hunks by construction, so references to the old number sitting elsewhere in the same file cannot appear in it `[IL-86]`
- Don't treat a conflict-free merge as a merge whose intent landed, when your side moved content — upstream's deletions apply cleanly to locations that no longer hold it. Diff the merge base against upstream, collect every deleted line, and grep each against your whole tree `[IL-87]`
- Don't publish a plan's prewritten completion claim without re-verifying each item against the tree — the claim was authored before the work, and having the conclusion already on the page in the plan's own voice is what makes its own verification feel redundant `[IL-88]`
- Don't read an idempotent updater's success as evidence the artifact changed — `claude plugin update` compares a version string against the *local* catalog and exits 0 having inspected no files, so a stale cache, a stale catalog and a healthy install log identically. Resolve the running build from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, never from install metadata or `gitCommitSha` `[IL-89]`
- Don't let "all N sources' suites still pass" close an extraction — parity proves the move, not the behavior, and N implementations agreeing is exactly when a shared bug reads as the spec `[IL-90]`
- Don't write `"$ref:path"` in a zsh command — `:s` is a parameter-expansion modifier, so the string is mangled and the command returns empty instead of erroring; brace it as `"${ref}:path"`, and drop `2>/dev/null` while exploring so failures stay loud `[IL-91]`
- Don't read a fail-open branch's comment as the full list of causes reaching it — it stays true while going incomplete, so a transient cause on a permanent-sounding branch suspends the policy silently `[IL-92]`
- Don't widen an enforcement mechanism without sweeping the prose describing its old reach — those claims were true when written, so nothing contradicts them, and keyword search can't find a procedure whose defect is silence `[IL-93]`
- Don't attach a step that hangs off an automated event to prose alone — bind it to that event, or it runs at whatever rate memory supplies; the changelog step went unwritten for 103 of 145 releases while a hook fired on the exact trigger and mentioned only the other half of the obligation `[IL-94]`
- Don't move where a value is *read from* without moving where it's *written* in the same change — a reader-keyed audit cannot find the writer, whose defect is that it names the new location nowhere at all. `[IL-04]` for output shape; this is the same hazard for output location `[IL-97]`
- Don't edit data to satisfy a failing check before confirming the check against a source that doesn't share its assumptions — a check is a hypothesis too, and "the suite is green now" is guaranteed either way `[IL-95]`
- Don't let a fallback that *guesses* which record to use also *write* to it — check whether the write is one of that path's own future inputs, since a self-feeding wrong guess latches instead of merely being wrong once, and its cause stops being visible in the data it produced `[IL-96]`
- Don't promote a behavior observed on every available run to a guarantee — read what the emitting code gates it on. Measuring the observation against live files confirms it (that's `[IL-71]`'s check, and it passes), so only the guard shows that four-for-four was the project's state, not the environment's `[IL-100]`
- Don't trust a `--first-parent` walk as release history — a branch that merges `main` into itself and is then pushed as `main` moves everything since the fork point to the second parent, so versions *leave* the set as later merges land. Read `docs/shipped-versions.tsv`, and catch branches up by rebasing `[IL-95]`
- Don't read the version pre-check's three sources as complete — an already-executed bump on unpushed local `main` is on no branch, in no plan, and absent from `git log origin/main`. One feature collided three times from exactly there `[IL-98]`
- Don't trust a merged counter that both branches raised from the same base — identical text merges silently while the value is now short by the other side's contribution, and only the prose around it conflicts. Recompute it `[IL-99]`
- Don't reuse a set as the gate for a second decision without restating its membership criterion against the new question — "is this a real class" and "may this class authorize an agent" shared 3 of 4 answers, and the 4th was the largest bucket in the repo `[IL-101]`
- Don't add an instruction to a procedure without confirming the nearest thing that *executes* — a command block, a serializer, a payload builder — carries the new item; "the step above says to do it" is not a mechanism, and proximity is what disguises the gap from diff review. Two of three instances landed while fixing the first `[IL-102]`
- Don't adopt a neighbouring convention before stating its common case and checking yours matches — `risk:*`/`ceremony:*` default *present* and omit rarely, so copying their idiom for a presence-only marker stamped it on every record, destroying the signal while matching every sibling row `[IL-103]`
