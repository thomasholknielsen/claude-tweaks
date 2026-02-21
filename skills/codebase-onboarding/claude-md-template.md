# Phase 4: CLAUDE.md Template and Guidelines

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

## Testing

{Framework, run commands, file location, naming convention}

## Environment

{How to set up locally, where secrets live, required services}

## Git

{Commit convention, branch strategy, PR process}

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

The Don'ts section prevents more mistakes than any amount of positive guidance. Source them from:

1. **Inconsistencies found in 1f** — if the codebase uses both patterns, codify which is correct
2. **Common mistakes for this stack** — e.g., "don't use `getServerSideProps` in App Router" for Next.js 13+
3. **Pain points found in 1f** — if there are 50 `eslint-disable` for the same rule, that's a "don't disable rule X" candidate
4. **Convention violations** — if 95% of files use named exports, "don't use default exports" is a don't
5. **Security footguns** — any auth, input validation, or data handling patterns that must not be violated

## Principles

- **Observed, not aspirational** — document what the codebase actually does
- **Under 150 lines** — if it doesn't fit, it belongs in a skill or rule
- **Commands must work** — verify scripts exist before listing them
- **Don'ts are cheap insurance** — if you see a pattern that would be easy to violate, add it
