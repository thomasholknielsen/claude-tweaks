# CLAUDE.md — claude-tweaks plugin

## What this is

A Claude Code plugin (v2.9.0) containing markdown skill files that guide Claude through a structured development lifecycle. This is not a code application — it's a system of prompts organized as skills.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Claude Code plugin system |
| Content | Markdown (SKILL.md files with YAML frontmatter) |
| Dependencies | Superpowers plugin (brainstorming, writing-plans, subagent-driven-development), code-simplifier (built-in subagent) |
| Distribution | Plugin marketplace via `thomasholknielsen/claude-tweaks-marketplace` |

## Structure

```
.claude-plugin/plugin.json        → Plugin manifest (name, version, description)
skills/{name}/SKILL.md            → Skill definition (frontmatter + body)
skills/{name}/*.md                → Sub-files lazy-loaded by the skill
README.md                         → User-facing documentation
LICENSE                           → MIT
```

### Skill directories (13 total)

**Lifecycle:** setup, codebase-onboarding, capture, challenge, specify, build, test, review, hotfix, wrap-up
**Utility:** help, tidy, flow

### Skills with sub-files

| Skill | Sub-files | Purpose |
|-------|-----------|---------|
| codebase-onboarding | detection-tables.md, profile-templates.md, claude-md-template.md, skill-template.md, summary-templates.md | Lazy-loaded reference content for each phase |
| review | review-summary-template.md, browser-review.md | Structured summary template; visual review procedures |
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
- **Multi-item decisions** — batch table with pre-filled recommendations + "apply all / override"
- **Skill handoffs** — `**Recommended next:** \`/command\` — reason.` (never a navigation menu)
- **Hard gates** — BLOCKED/STOP conditions that prevent proceeding with degraded state

### Interaction style directive

All skills use this identical directive after the frontmatter:

```
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." End skills with a recommended next step, not a navigation menu.
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

- Don't add "What's Next?" / "Pick an action" navigation menus at the end of skills — use `**Recommended next:**` statements
- Don't add per-item decision prompts for lists — use batch tables with "apply all / override"
- Don't create skills without the standard structure (frontmatter, interaction directive, anti-patterns table, relationship table)
- Don't add one-directional cross-references — always update both sides
- Don't silently skip or drop findings — every surfaced item must be explicitly resolved (fix now, defer, accept with reason)
- Don't put detailed reference content inline in a SKILL.md when it would make the file unwieldy — use a sub-file and reference it with "read `{filename}` in this skill's directory"
- Don't forget to update README.md and `/help` when adding or changing skills
- Don't use emojis in skill files (except the star in `**(Recommended)**` labels, which was replaced with bold text)
