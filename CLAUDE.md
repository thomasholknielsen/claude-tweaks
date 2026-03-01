# CLAUDE.md — claude-tweaks plugin

## What this is

A Claude Code plugin (v3.13.0) containing markdown skill files that guide Claude through a structured development lifecycle, with browser automation and QA pipeline support. This is not a code application — it's a system of prompts organized as skills.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Claude Code plugin system |
| Content | Markdown (SKILL.md files with YAML frontmatter) |
| Dependencies | Superpowers plugin (`/brainstorm`, `/write-plan`, `/subagent-driven-development`, `/executing-plans`, `/using-git-worktrees`, `/finishing-a-development-branch`, `/dispatching-parallel-agents`), code-simplifier (built-in subagent), playwright-cli (optional) |
| Distribution | Plugin marketplace via `thomasholknielsen/claude-tweaks-marketplace` |

## Structure

```
.claude-plugin/plugin.json        → Plugin manifest (name, version, description)
skills/{name}/SKILL.md            → Skill definition (frontmatter + body)
skills/{name}/*.md                → Sub-files lazy-loaded by the skill
agents/{name}.md                  → Agent definitions (frontmatter + body)
hooks/hooks.json                  → Hook definitions (SessionStart checks)
README.md                         → User-facing documentation
LICENSE                           → MIT
```

### Skill directories (15 total)

**Lifecycle:** setup, codebase-onboarding, capture, challenge, specify, build, test, stories, review, wrap-up
**Utility:** help, tidy, flow, browse, ledger

### Skills with sub-files

| Skill | Sub-files | Purpose |
|-------|-----------|---------|
| codebase-onboarding | detection-tables.md, profile-templates.md, claude-md-template.md, skill-template.md, summary-templates.md | Lazy-loaded reference content for each phase |
| browse | playwright-reference.md, chrome-reference.md | Full command references for each browser backend |
| test | verification.md | Shared verification procedure (referenced by /build, /review, and /test) |
| stories | dev-url-detection.md, source-analysis.md | Dev server auto-detection; source code extraction patterns for behavioral contracts |
| review | review-summary-template.md, browser-review.md, qa-review.md, ux-analysis.md | Structured summary template; visual review procedures; QA review procedures; UX analysis procedure |
| specify | spec-template.md | Spec file template with field rationale |
| help | reference-card.md, context-flow.md | Quick reference card; artifact flow documentation |

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
```

## Don'ts

- Don't add "What's Next?" / "Pick an action" navigation menus at the end of skills — use `### Next Actions` blocks with numbered options and pre-filled commands
- Don't add per-item decision prompts for lists — use batch tables with "apply all / override"
- Don't create skills without the standard structure (frontmatter, interaction directive, anti-patterns table, relationship table)
- Don't add one-directional cross-references — always update both sides
- Don't silently skip or drop findings — every surfaced item must be explicitly resolved (fix now, defer, accept with reason)
- Don't put detailed reference content inline in a SKILL.md when it would make the file unwieldy — use a sub-file and reference it with "read `{filename}` in this skill's directory"
- Don't forget to update README.md and `/help` when adding or changing skills
- Don't use emojis in skill files — use `**(Recommended)**` bold text for emphasis instead
