---
name: claude-tweaks:test
description: Use when you need to run tests, type checking, or linting as a standalone step — outside of /claude-tweaks:build or /claude-tweaks:review.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." End skills with a recommended next step, not a navigation menu.


# Test

Run verification checks independently — type checking, linting, and tests. Useful for quick sanity checks without a full review cycle, targeted testing of specific modules, or reproducing CI failures locally.

```
/claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorm → /claude-tweaks:specify → /claude-tweaks:build → [ /claude-tweaks:test ] → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                                                                      ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- After making changes and before committing — quick sanity check
- During development to verify a specific module or feature
- When `/claude-tweaks:review` is overkill — you just want to know if things pass
- After resolving merge conflicts
- Before starting `/claude-tweaks:review` to catch obvious failures early
- When CI fails and you need to reproduce locally
- The user says "run tests", "does it pass?", "check types", or "lint this"

## Input

`$ARGUMENTS` controls scope and mode:

| Argument | Behavior |
|----------|----------|
| *(none)* | Full suite — run all checks documented in CLAUDE.md |
| `types` | Type checking only |
| `lint` | Linting only |
| `unit` | Unit tests only |
| `integration` | Integration tests only |
| `e2e` | End-to-end tests only |
| `{file or directory path}` | Run tests scoped to that path |
| `{test name pattern}` | Run tests matching the pattern |
| `affected` | Run tests affected by uncommitted changes (uses git diff) |

Multiple arguments can be combined: `/claude-tweaks:test types lint` runs both type checking and linting.

## Step 1: Resolve Test Commands

Read CLAUDE.md for the project's specific verification commands. Look for:

- Type check command (e.g., `pnpm typecheck`, `tsc --noEmit`, `mypy`)
- Lint command (e.g., `eslint .`, `ruff check`, `golangci-lint run`)
- Test command (e.g., `pytest`, `jest`, `go test ./...`)
- Any project-specific test scripts or configurations

If CLAUDE.md doesn't document verification commands, scan `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, or equivalent for the project's stack.

## Step 2: Determine Scope

Based on `$ARGUMENTS`:

### Full suite (no arguments)

Run all checks. Order matters — fail fast:

1. Type checking (fastest feedback)
2. Linting
3. Tests

> **Parallel execution:** Run type checking and linting as parallel Bash calls — they are independent. Run tests after both pass (tests are slower and type/lint failures often cause test failures too).

### Targeted scope

- **By check type** (`types`, `lint`, `unit`, etc.) — run only the specified checks
- **By path** — scope test commands to the given file or directory
- **By pattern** — pass the pattern to the test runner's filter flag (e.g., `jest --testNamePattern`, `pytest -k`)
- **`affected`** — use `git diff --name-only` to identify changed files, then scope tests to those files and their dependents

## Step 3: Run and Report

Execute the resolved commands and present results:

```markdown
## Test Results

| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| Type check | {pass/fail} | {Xs} | {error count if failed} |
| Lint | {pass/fail} | {Xs} | {warning/error count} |
| Tests | {pass/fail} | {Xs} | {passed}/{total}, {failed count} failures |

### Failures (if any)

#### {Check name}
{error output — truncated to relevant lines}

**Recommended next:** Fix the issues above, then re-run `/claude-tweaks:test`.
```

If all checks pass:

```
All checks passed. Recommended next: `/claude-tweaks:review {spec}` or commit your changes.
```

## Step 4: Fix Mode (Optional)

If tests fail and the failures look straightforward (type errors, lint violations, simple test failures), offer to fix them:

```
{N} failure(s) found.
1. Fix automatically — I'll address these failures now
2. Show details only — I'll investigate but not change code
3. Skip — I'll fix these manually
```

If the user chooses to fix:
- Make the changes
- Re-run the failed checks to verify
- Report the results

**Do NOT auto-fix without asking.** Even simple fixes can mask deeper issues.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Running the full suite when only types were requested | Respect the scope — the user asked for a targeted check |
| Auto-fixing failures without asking | Simple failures can mask deeper issues — always ask first |
| Skipping CLAUDE.md command lookup | Projects have specific test commands — don't guess |
| Running tests before type checking | Type errors often cause test failures — fail fast with the cheapest check |
| Ignoring lint warnings | Warnings accumulate into a noisy codebase — surface them |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | /build runs verification as Common Step 4 — /test is the standalone equivalent |
| `/claude-tweaks:review` | /review runs verification as Step 3 (gate) — /test is lighter weight, no code review |
| `/claude-tweaks:flow` | /flow chains build → review → wrap-up — /test can be used ad-hoc outside the pipeline |
| `/claude-tweaks:help` | /help can recommend /test when code changes exist but no review is warranted |
