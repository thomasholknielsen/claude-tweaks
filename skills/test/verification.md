# Shared Verification Procedure

Canonical verification procedure used by `/claude-tweaks:build` (Common Step 4), `/claude-tweaks:review` (Step 3), and `/claude-tweaks:test` (Steps 1-3). This file is the single source of truth — all three skills reference it instead of duplicating the logic.

## Step 1: Resolve Commands

Read CLAUDE.md for the project's specific verification commands. Look for:

- Type check command (e.g., `pnpm typecheck`, `tsc --noEmit`, `mypy`)
- Lint command (e.g., `eslint .`, `ruff check`, `golangci-lint run`)
- Test command (e.g., `pytest`, `jest`, `go test ./...`)
- Any project-specific test scripts or configurations

If CLAUDE.md doesn't document verification commands, scan `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, or equivalent for the project's stack.

## Step 2: Execute

Run all checks. Order matters — fail fast:

> **Parallel execution:** Run type checking and linting as parallel Bash calls — they are independent. Run tests after both pass (tests are slower and type/lint failures often cause test failures too).

1. Type checking (fastest feedback)
2. Linting
3. Tests (unit + integration)

### Skip-if-recent (for /flow pipelines)

When running inside a `/claude-tweaks:flow` pipeline and the previous step already ran verification successfully (indicated by `VERIFICATION_PASSED=true` in the pipeline context), **skip this procedure entirely** and note: "Verification skipped — passed in previous pipeline step." This prevents redundant type check + lint + test runs when `/flow` chains build → review.

## Step 3: Report

Present results in a consistent format:

```markdown
## Verification Results

| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| Type check | {pass/fail} | {Xs} | {error count if failed} |
| Lint | {pass/fail} | {Xs} | {warning/error count} |
| Tests | {pass/fail} | {Xs} | {passed}/{total}, {failed count} failures |
```

### On failure

```markdown
### Failures

#### {Check name}
{error output — truncated to relevant lines}
```

### Gate behavior

The calling skill determines what happens on failure:

- **`/build`** — fix failures and re-run verification
- **`/review`** — **STOP** the review. Present failures. Fix before continuing.
- **`/test`** — report results. Optionally offer to fix (see `/test` Step 4).
