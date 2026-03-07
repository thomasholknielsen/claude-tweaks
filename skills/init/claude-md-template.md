# Phase 4: CLAUDE.md Template and Guidelines

## Core Principle

CLAUDE.md describes **how to work in this codebase** — the patterns to follow, the commands to run, the conventions to respect, and the mistakes to avoid. It is an operator's manual for an existing system, not a wishlist of improvements.

Every section should answer: "If I'm about to make a change here, what do I need to know?" Things that don't exist yet (missing CI, missing tests, missing linting) are work items for the INBOX, not entries in CLAUDE.md. The moment something is set up, _then_ it earns a place here.

This principle applies equally during initial generation and updates. When updating CLAUDE.md, evaluate every proposed change against: "Does this describe how to work in the codebase _as it is right now_?"

## Initial Mode Template

Produce CLAUDE.md from scratch following this template:

```markdown
# {project name}

{One-line description of what the project does.}

## Stack

| Layer | Tech |
|-------|------|
| ... | ... |

## Structure

{Directory tree showing key directories and their purpose — max 15 lines}

## Commands

{Key package scripts — what developers actually run daily.
Verify every command exists in package.json / Makefile / scripts before listing.}

## Conventions

{Observed naming, patterns, and rules — max 10 bullets}

## Philosophy

{Adaptive principles that calibrate how Claude approaches changes in this project.
Generated from the maturity classification detected in Phase 2h. See "Generating Philosophy" below.}

## Testing

{Framework, run commands, file location, naming convention}

## Environment

{How to set up locally, where secrets live, required services}

## Git

{Commit convention, branch strategy, PR process}

## Superpowers Integration

When claude-tweaks skills invoke Superpowers skills, these overrides apply:

- `/brainstorm`: Stop after committing the design doc. Do NOT auto-invoke `/write-plan` — return control to the calling skill.
- `/write-plan`: Stop after saving the plan file. Do NOT present an execution choice or invoke an execution skill — return control to the calling skill.
- `/subagent-driven-development`: Stop after the final code review. Do NOT invoke `/finishing-a-development-branch` — return control to the calling skill.
- `/executing-plans`: Stop after the last batch completes. Do NOT invoke `/finishing-a-development-branch` — return control to the calling skill.

Worktree directory: `.claude/worktrees/`

## Don't

{Anti-patterns observed or inferred — things that would break the project's conventions.
This section is the highest-ROI output. See "Mining Don'ts" below.}
```

## Update Mode

Produce a **patch** — not a full rewrite. For each stale/drifted item the user approved:

```markdown
## CLAUDE.md Patches

### Patch 1: {description}
**Location:** Line {N}, section "{section}"
**Current:** `{current text}`
**Proposed:** `{new text}`
**Reason:** {why — e.g., "script renamed", "convention changed", "new stack added"}

### Patch 2: ...
```

Apply patches using Edit tool calls with precise `old_string` → `new_string` replacements. Never rewrite the entire file in Update Mode unless the user explicitly asks for it.

## Mining Don'ts

The Don'ts section prevents more mistakes than any amount of positive guidance. Don'ts are **guardrails for patterns that exist** — they describe what _not_ to do when working in this codebase. They are never aspirational.

**The filter:** A Don't must describe a pattern that exists in the codebase and should not be violated. If something doesn't exist yet (no CI, no tests, no linting, stale dependencies), that's an INBOX item for improvement work — not a Don't.

Source Don'ts from:

1. **Inconsistencies found in 2f** — if the codebase uses both patterns, codify which is correct
2. **Common mistakes for this stack** — e.g., "don't use `getServerSideProps` in App Router" for Next.js 13+
3. **Observed anti-patterns in 2f** — if there are 50 `eslint-disable` for the same rule, that's a "don't disable rule X" candidate
4. **Convention violations** — if 95% of files use named exports, "don't use default exports" is a Don't
5. **Security footguns** — any auth, input validation, or data handling patterns that must not be violated

**Not Don'ts** (these belong in INBOX instead):

| Finding | Why not a Don't | INBOX example |
|---------|----------------|---------------|
| No CI pipeline | Nothing to violate — it doesn't exist | "Set up CI — project uses {framework}, deploy to {target}" |
| No tests in `src/utils/` | Aspirational, not a guardrail | "Add test coverage for utils — {functions} are complex" |
| Dependencies 3 major versions behind | Work to do, not a constraint | "Upgrade {dep} — current: {v}, latest: {v}, breaking: {list}" |
| No linting configured | Can't enforce what isn't set up | "Set up linting — codebase uses {patterns}, {N} files" |
| Commented-out code blocks | Cleanup task, not a convention | "Clean up dead code in {files}" |

## Generating Philosophy

The Philosophy section adapts to the project's maturity classification (from Phase 2h). It contains two types of entries:

### Universal principles (include in all projects)

These apply regardless of project maturity:

- **Do it properly.** No display-only workarounds for data model issues, no "good enough" shortcuts that leave technical debt. If a value needs renaming, rename it everywhere including the database. If a type needs changing, change it at the source.
- **Assume zero cost.** Decide as if implementation is free. Never choose an inferior design because the better one "isn't worth the effort."
- **Assume zero time.** Decide as if implementation is instant. Never choose a shortcut because the proper approach "takes too long."
- **No implicit deferrals.** When something needs doing, either do it now or explicitly add it to specs/INBOX.md with scope and context. Never silently skip work or leave TODO comments without a corresponding INBOX entry.

### Maturity-dependent principles (adapt to classification)

Select the appropriate entries based on the detected maturity:

#### Greenfield / Pre-launch

```markdown
Greenfield, pre-launch. There are no users on the platform yet. Always prefer the correct solution over the safe-migration path: rename columns, change types, restructure schemas, break APIs, delete and rebuild. Use db:push not migrations. Don't add backward-compatibility shims, expand-contract phases, or feature-migration code — just make the change. Prefer latest stable versions, modern APIs, and clean implementations. When in doubt, choose the newest production-ready approach and build it right the first time.
```

#### Early Production

```markdown
Early production. The platform has users but the codebase is still young. Prefer correct solutions but use migrations (not db:push) for schema changes. Breaking API changes are acceptable with coordination — document them, version if needed. Backward-compatibility shims are acceptable for short periods (< 1 sprint) to ease transitions, then remove them. Prefer modern approaches for new code; refactor existing code toward modern patterns when touched.
```

#### Established

```markdown
Established codebase with active users. Schema changes require migrations with rollback plans. API changes follow expand-contract: add the new, migrate consumers, remove the old. Backward compatibility is required for published interfaces. Feature flags for risky changes. Prefer stability over novelty — adopt new patterns in new code, migrate existing code incrementally. Test coverage gates before refactoring shared code.
```

### Additional maturity-dependent entries

| Signal | Greenfield | Established |
|--------|-----------|-------------|
| Developer tooling | "Developer-first. Prefer powerful developer tools over simplified abstractions. Code-based config with type safety over UI-driven config without guardrails." | Omit (team may have different preferences) |
| Automation | "Automation over manual actions. Everything reproducible: Terraform first, CLI scripts second, documented manual steps only as last resort." | Same, but emphasize change management and approval processes |
| Dependencies | "Use latest stable versions. Upgrade aggressively." | "Pin versions. Upgrade deliberately with testing." |

**Important:** Only include entries that match the project. A greenfield project with no infrastructure doesn't need the automation entry. An established project with no published APIs doesn't need the expand-contract entry. Adapt, don't copy blindly.

## Principles

- **How to work here, not what's missing** — every entry should help someone working in the codebase right now. Improvements belong in INBOX.
- **Observed, not aspirational** — document what the codebase actually does, not what it should do
- **Under 150 lines** — if it doesn't fit, it belongs in a skill or rule
- **Commands must work** — verify scripts exist before listing them
- **Don'ts are guardrails, not wishes** — they describe existing patterns that should not be violated, never infrastructure that doesn't exist yet
- **Philosophy adapts to maturity** — the same principle stated differently for greenfield vs established projects prevents both reckless breaking changes and unnecessary conservatism
