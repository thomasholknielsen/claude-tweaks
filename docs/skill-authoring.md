# Skill authoring conventions

Loaded when authoring or editing skill files (`skills/**/*.md`). Dispatched implementer/reviewer/QA agents do not need this — it is not part of their per-dispatch context.

## SKILL.md structure

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

**Size:** treat 40 KB as a soft ceiling for a single SKILL.md — see the extraction rule in CLAUDE.md's `## Don'ts`.

## Inline `_shared` contract vs a new component skill

When a new capability needs a canonical, citable procedure, choose between two shapes:

- **Inline `skills/_shared/*.md` contract** — every consumer already holds full context at the
  moment it needs the procedure (an agent mid-fix, mid-reflect). The procedure needs no
  independent invocation, no `Skill`-tool dispatch, and no lifecycle position of its own. Each
  consumer cites it by filename inline in a step it already runs.
- **New component skill** — the capability needs its own `Skill`-tool invocation, has callers
  that do *not* already hold the necessary context (so a fresh dispatch must gather it), or needs
  its own Component-Skill Contract / Next Actions / interaction pattern independent of any single
  caller.

Example: `skills/_shared/causal-depth.md` (a why-chain contract fired inline by an agent already
holding a debugging trace or a reflect pass's near-miss description) chose the inline form over a
new component skill, because both its consumers already hold the context the chain needs — a
fresh dispatch would have to re-derive it from scratch.

## Interaction patterns

- **Decisions** — call the `AskUserQuestion` tool with human-readable options (2-4 typical) so the user gets a native rendered choice instead of typing a digit back. Mark the recommended option's label with `(Recommended)`.
- **Multi-item decisions** — batch table with pre-filled recommendations, rendered as markdown (AskUserQuestion cannot display dense multi-row data). **When a row is a genuine recommendation-vs-alternative decision** — a closed set of meaningfully different values where one was chosen over the others (e.g. a backend choice, a git strategy) — show the alternative(s) alongside the recommendation, not the recommendation alone: either a dedicated `Options` column listing every value with the recommended one bolded (`flow/manifesto.md`'s Policy levers table is the canonical example), or an inline `**{recommended}** (Recommended) — alt: {alternative}` cell when a separate column doesn't fit the table's shape. This does **not** apply to a row whose "recommendation" is a proposed action on an independent finding (a tidy action, a backlog label change) — those have no fixed alternative-value set to hide; leave those as a single recommended-action column. Then capture the terminal apply-all/override decision with one `AskUserQuestion` call (2-4 options: at minimum "Apply all recommended" and "Override specific items"). When "Override specific items" is chosen, the user's #-by-# corrections are ordinary free-text chat in the next message — not the tool's `Other` field, which is a single answer to the batch question, not a per-item list. For 10+ items, lead with a severity/count summary before the full table so the user sees the scope before the details.
- **Chunked multiSelect batch** — for a list of N candidate items each needing an independent file/skip decision (not a single apply-all-or-override choice over a table), render each item as one option (`label` = short title, `description` = one-line summary) inside a `multiSelect: true` `AskUserQuestion` call, and chunk the list into calls of at most 4 items — `AskUserQuestion`'s own per-question option cap. Every option renders unchecked by default; checking it is the explicit per-item approval act (no pre-selection exists on the tool's current schema). See `skills/_shared/upstream-feedback-batch.md` for the full contract (rendering, chunking, question text, decline/edit handling).
- **One decision per message** — never make more than one `AskUserQuestion` call in a single response. If a skill produces multiple decision tables, present them sequentially (one call per message, wait for resolution before showing the next).
- **Skill handoffs (Next Actions)** — End each skill with a `## Next Actions` block (standalone, top-level; a Next Actions block nested inside a larger rendered report template — Pipeline Summary, failure cards, review summary — may stay `### Next Actions` as that report's own subsection heading), rendered as one `AskUserQuestion` call: 2-4 options, each option's description carrying the full command with all parameters pre-filled, each label a short one-line summary, one option's label suffixed `(Recommended)` based on context. `Other` (always available on `AskUserQuestion`) covers "none of these, I'll type something else." Options are dynamically generated from available context (journeys, UI changes, worktree mode, QA stories, browser availability). Never a navigation menu, never generic commands without parameters. If situational filtering would leave fewer than 2 options, do not call `AskUserQuestion` — state or execute the single remaining action directly (a lone option isn't a decision).
- **Actions Performed table** — When a skill performs autonomous actions beyond what the user explicitly requested, include a `### Actions Performed` table before Next Actions. Columns: `| Action | Detail | Ref |`. Action types: `Implemented`, `Bug fix`, `Simplified`, `Operational`, `Journey`, `Ledger fix`, `History` (a git operation that rewrote or moved history — rebase, reset, cherry-pick, revert, non-fast-forward merge, amend, push; never folded into `Operational`, which means cleanup). Ref column shows short commit hash. Resolved ledger items show source phase in parentheses. Generated from git log, git diff, and ledger entries. Omit when no autonomous actions were performed.
- **Hard gates** — BLOCKED/STOP conditions that prevent proceeding with degraded state
- **Adaptive section batching** — when a skill presents multi-section material that requires sequential approval (e.g., design walkthroughs, multi-part summaries), if the user accepts 2 consecutive sections without modification, batch all remaining sections into a single approval gate. This is the behavior, not a setting (the `section-confirmation` policy key was retired in #331 — removal trail: `skills/_shared/policy-deprecations.md`). The same adaptive convention also governs `/superpowers:brainstorming`'s **User Review Gate** (the blocking wait before `/superpowers:writing-plans`): skip it when the preceding Spec Self-Review loop found no unresolved issues (ambiguity resolved by judgment call, scope/decomposition shift, or a contradiction resolved by interpretation) — state the committed path and proceed directly to writing-plans. A substantive self-review change still stops, surfacing only that delta. This overrides brainstorming's own wait instruction on the claude-tweaks side; no superpowers file is edited.
- **Front-door confirm + opt-in Customize** — when a flow gathers multiple sequential inputs (schedule, environment, etc.) before one consequential action, front-load a defaults-based preview+confirm as the fast path and gate the sequential input-gathering behind an explicit `Customize` choice reached only from that confirm, rather than always running the gathering up front. Collapses N round-trips to 1 for the common case.
- **Component-skill contract** — Skills that are routinely invoked by other skills (e.g., `/simplify`, `/reflect`, `/deepen`, `/journeys`, `/visual-review`, `/design-wrapper`, `/capture`, `/challenge`, `/stories`) MUST detect whether they were invoked by a parent skill or directly by a user. When invoked by a parent, omit the `## Next Actions` block — the parent owns the handoff and Next Actions belong to the parent's flow. When invoked directly, render Next Actions as usual. Document this contract explicitly with a labeled `## Component-Skill Contract` paragraph placed **immediately before `## Anti-Patterns`** (after any post-workflow documentation sections such as Output contract or Reference sub-files). The paragraph must name the parent skills and use a **programmatic detection signal** — preferred is `$PIPELINE_RUN_DIR` (set by `/flow` and all pipeline orchestrators), with an explicit `--source <parent-skill>` flag as fallback for direct invocation where ambiguity exists. Vague signals like "pipeline context arguments" or "whether the caller consumes the return value" are insufficient — the model cannot reliably detect those at invocation time.

  **Canonical CSC template** (copy-paste, customize the parent list):

  ```markdown
  ## Component-Skill Contract

  When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:{this-skill}` is running inside a pipeline (invoked by `/claude-tweaks:{parent-1}`, `/claude-tweaks:{parent-2}`, or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

  Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal).
  ```

- **Next Actions placement** — Render as `## Next Actions` (top-level section, NOT `###`) placed **at the end of the workflow steps and before Component-Skill Contract / Anti-Patterns**. Conceptually: Next Actions is the user-facing handoff after the last workflow Step; CSC and Anti-Patterns are meta-documentation for skill authors and should come last. The retired Relationship table was meta-documentation of the same kind — which is why it could leave the shipped payload entirely rather than merely move down the file. A skill with no Component-Skill Contract still places Next Actions before Anti-Patterns.

## Frontmatter conventions

- **`name`** — required. The **bare** skill name (`wrap-up`), never `claude-tweaks:wrap-up` — the harness prepends the plugin namespace itself, so a prefixed value renders as `/claude-tweaks:claude-tweaks:wrap-up` in the command list. This does not change prose cross-references, which still use the fully-qualified `/claude-tweaks:{skill}` form; the two were conflated in `e9d5cb4a` and separated again in 6.50.1.
- **`description`** — required. Trigger sentence ("Use when …", or an equivalent "Use to …" / "Use for …" phrasing) followed by optional keywords. Keep it at or under 260 characters — mechanically enforced by `bin/lib/skill-audit/context-cost.js`'s `overDescriptionCeiling` check (`context-cost.test.js`) — and preserve every Keywords token unless demonstrably redundant with one already kept: it's the skill-selection surface, and a lost keyword can stop a skill from firing (#394).
- **`allowed-tools`** — **omit by default**. Skills inherit the global tool set when this field is absent. Declare `allowed-tools:` only to **restrict** — e.g., a read-only auditing skill that should never modify files would declare `allowed-tools: Read, Grep, Glob, Bash`. Declaring a narrow set (like `allowed-tools: Bash`) when the skill actually uses Read/Edit/Glob/Task is a bug — it either lies about the contract or silently breaks the skill if the harness enforces it. When in doubt, omit the field.
- **`argument-hint`** — required whenever a skill's `## Input` section documents any accepted argument grammar; omit only for a skill that genuinely takes no arguments at all — none currently do (every skill in this plugin declares a non-empty `argument-hint`), but the convention still applies if one is ever added. Shows as greyed-out placeholder text in the terminal when the user types `/claude-tweaks:{skill}` — purely cosmetic, has no effect on how `$ARGUMENTS`/`$1`/`$2` are parsed at runtime. Always quote the value (`"..."`, or `'...'` when the hint itself contains a literal `"`) — an unquoted value starting with `[` is invalid YAML (parsed as a flow sequence, not a string). Derive the hint directly from the skill's own `## Input` section — same bracket/pipe convention as `.claude/commands/*.md`: `[optional]`, `<required>`, `a|b` for alternatives. Keep it in sync when `## Input` changes.

## Plugin-root references (`CLAUDE_PLUGIN_ROOT`)

Skill prose that shells out to a plugin file writes `node "${CLAUDE_PLUGIN_ROOT}/bin/{cli}.js" …` — or `require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/…')` inside a `node -e` program. Both spellings are **model-resolved placeholders, not a shell contract**: the harness does not set `CLAUDE_PLUGIN_ROOT` in the Bash tool environment (verified empirically 2026-08-07 through 2026-08-11, locally and in cloud sandboxes — #170), so a verbatim run fails with `Cannot find module '/bin/…'` (shell spelling) or `Cannot find module 'undefined/bin/…'` (`process.env` spelling). The executing agent MUST substitute the absolute plugin root before running the command, derived from the invoked skill's own context — the `Base directory for this skill:` line the Skill tool prints, minus the trailing `skills/{name}` segment.

Rules that follow:

- Keep writing the `${CLAUDE_PLUGIN_ROOT}` spelling in skill prose. It is the greppable, install-location-independent convention. Do not hardcode an absolute path (plugin cache locations differ per machine and per account config dir), and do not add a shell lookup ladder to resolve it at runtime — a glob over cache directories is fragile across those same layouts, and worktree-isolated sessions refuse compound commands, so the ladder is unrunnable exactly where builds happen.
- `hooks/hooks.json` is the exception, not the model for skill prose: hook processes are spawned by the harness with `CLAUDE_PLUGIN_ROOT` populated in their environment, so hook command strings rely on the real variable.
- The substituted root points at the **installed** build, which can lag a claude-tweaks dev checkout — when the running build matters, resolve it from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (CLAUDE.md `[IL-89]`, `[IL-119]`).
- A `Cannot find module '/bin/…'` / `'undefined/bin/…'` failure means the placeholder reached the shell unsubstituted — re-issue with the resolved absolute path; do not diagnose the CLI itself.

## Interaction style directive

All skills use this identical directive after the frontmatter:

```
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.
```

## Parallel execution directives

Skills use three standardized blockquote forms to signal when operations should run concurrently:

| Form | Trigger | Use for |
|------|---------|---------|
| **Form A — parallel tool calls** | `> **Parallel execution:** Use parallel tool calls aggressively — all {tools} operations in {scope} are independent and should run concurrently.` | Independent read-only operations (Glob, Grep, Read, Bash). Front-loads I/O before analysis. |
| **Form B — parallel Task agents** | `> **Parallel execution:** Dispatch {scope} as parallel Task agents — each runs independently and returns {output format}. Assemble results after all agents complete.` | Heavier analytical work where each unit can run in a separate agent thread. |
| **Form C — conditional** | `> **Parallel execution (conditional):** When {condition}, dispatch {scope} as parallel Task agents. Otherwise, run sequentially in the main thread.` | Context-dependent dispatch — e.g., only for large diffs or multiple independent journeys. |

Use the exact blockquote prefix (`> **Parallel execution:**` or `> **Parallel execution (conditional):**`) so directives are visually consistent and greppable across skills.

Forms B and C always pair with the **Subagent Contract** (`skills/_shared/subagent-output-contract.md`) — minimal input, one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` as the agent's first line, then Templates A/B/C for output. Each dispatch picks a model tier (`Fast | Standard | Capable`); default to the cheapest that fits the work. Third-party agents are exempt from the agent-side protocol (see CLAUDE.md's Subagent Contract section); the dispatcher's side still applies in full.
