---
name: claude-tweaks:test
description: Use when you need to run verification checks (types, lint, tests) or validate QA stories — the mechanical "does it work?" gate.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Test — Verification Gate

Mechanical pass/fail gate — types, lint, tests, QA story validation. Answers "does it work?" without analytical judgment. Part of the workflow lifecycle:

```
/claude-tweaks:capture → ... → /claude-tweaks:build → [ /claude-tweaks:stories ] → [ /claude-tweaks:test ] → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                                     ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- After making changes and before committing — quick sanity check
- During development to verify a specific module or feature
- When `/claude-tweaks:review` is overkill — you just want to know if things pass
- After resolving merge conflicts
- Before starting `/claude-tweaks:review` to catch obvious failures early
- When CI fails and you need to reproduce locally
- When QA stories exist and you want to validate them against a running app
- After `/claude-tweaks:stories` generates or updates YAML stories
- The user says "run tests", "does it pass?", "check types", "lint this", or "run QA"

## Input

`$ARGUMENTS` controls scope and mode:

| Argument | Behavior |
|----------|----------|
| *(none)* | Standard suite — run all checks documented in CLAUDE.md (types + lint + tests) |
| `types` | Type checking only |
| `lint` | Linting only |
| `unit` | Unit tests only |
| `integration` | Integration tests only |
| `e2e` | End-to-end tests only |
| `{file or directory path}` | Run tests scoped to that path |
| `{test name pattern}` | Run tests matching the pattern |
| `affected` | Run tests affected by uncommitted changes (uses git diff) |
| `qa` | QA story validation only — run YAML stories against a running app |
| `qa tag={tag}` | QA stories filtered by tag (e.g., `qa tag=smoke`) |
| `qa story={name}` | QA — single story by name (substring match) |
| `qa retry={path}` | QA — re-run only failed stories from a previous run |
| `qa affected` | QA — run only stories whose `source_files` overlap with uncommitted changes |
| `all` | Full suite (types + lint + tests) AND QA story validation |

Multiple arguments can be combined: `/claude-tweaks:test types lint` runs both type checking and linting.

## Pipeline Context Awareness

When running inside a `/claude-tweaks:flow` pipeline, `/test` reads context from previous steps:

| Variable | Source | Effect |
|----------|--------|--------|
| `VERIFICATION_PASSED` | Set by `/claude-tweaks:build` Common Step 5 | Skip types/lint/tests — they already passed in build. QA still runs if stories exist. |
| `STORIES_DIR` | Set by `/claude-tweaks:stories` or auto-detected | Directory containing QA story YAML files |
| `DEV_URL` | Set by `/claude-tweaks:stories` or auto-detected | Dev server URL for QA execution |

**Pipeline behavior:**

- `VERIFICATION_PASSED=true` + no stories → skip verification, report "passed in build, no QA stories", set `TEST_PASSED=true`
- `VERIFICATION_PASSED=true` + stories exist → skip verification, auto-run QA, set `TEST_PASSED=true` on pass
- No `VERIFICATION_PASSED` → run full suite (and QA if stories exist when mode is `all`)

## Step 1: Resolve Scope and Execute

### Standard suite (no arguments)

Run the shared verification procedure from `verification.md` in this skill's directory. This resolves commands from CLAUDE.md and runs type checking, linting, and tests.

### Targeted scope (with arguments)

When `$ARGUMENTS` specifies a targeted scope, resolve commands from CLAUDE.md (see `verification.md` Step 1), then run only the requested checks:

- **By check type** (`types`, `lint`, `unit`, etc.) — run only the specified checks
- **By path** — scope test commands to the given file or directory
- **By pattern** — pass the pattern to the test runner's filter flag (e.g., `jest --testNamePattern`, `pytest -k`)
- **`affected`** — use `git diff --name-only` to identify changed files, then scope tests to those files and their dependents

> **Parallel execution:** When running multiple check types (e.g., `/test types lint`), run them as parallel Bash calls — they are independent.

### QA mode (`qa`)

Run QA story validation only — types, lint, and tests are skipped.

1. **Discover stories:** Glob `stories/*.yaml` (or `STORIES_DIR` from pipeline context, or `dir=` argument).
2. **No stories found** — report and stop:
   ```
   No user stories found in `{STORIES_DIR}/*.yaml`. Generate stories with `/claude-tweaks:stories` or create YAML files manually. Use `dir=<path>` to specify a custom directory.
   ```
3. **Stories found:**
   a. Auto-detect the dev server URL using the shared procedure from `dev-url-detection.md` in the `/claude-tweaks:stories` skill's directory (or use `DEV_URL` from pipeline context).
   b. If no dev server is reachable and none can be started — stop and report: "QA validation failed — no dev server available."
   c. Run the QA procedures from `qa-review.md` in the `/claude-tweaks:review` skill's directory.
   d. Pass through any QA-specific arguments: `tag=`, `story=`, `retry=`, `affected`, etc.

#### Affected filtering (`qa affected`)

When the `affected` argument is present, filter stories to only those whose `source_files` overlap with uncommitted changes:

1. Run `git diff --name-only` (unstaged) and `git diff --name-only --cached` (staged) to collect all changed file paths.
2. Read each discovered story YAML file and collect the `source_files` array from every story. Stories without a `source_files` field or with an empty array are excluded from affected runs.
3. Filter to stories where at least one entry in `source_files` appears in the changed files list.
4. If no stories match, report: "No QA stories affected by current changes." and stop.
5. Run only the matched stories through the QA procedures.

**Composable with other filters:** `affected` can be combined with other QA arguments. For example, `/claude-tweaks:test qa affected tag=smoke` runs only affected stories that also have the `smoke` tag. Apply `affected` filtering first, then apply any additional filters (`tag=`, `story=`, etc.) on the resulting subset.

### All mode (`all`)

Run the full standard suite (types + lint + tests) AND QA story validation. Equivalent to running `/test` followed by `/test qa`.

1. Run the shared verification procedure from `verification.md` (types, lint, tests).
2. If verification passes and stories exist, run QA mode (see above).
3. If verification fails, stop — do not run QA on broken code.

## Step 2: Report

Present results using the format from `verification.md` Step 3 for standard checks. For QA and pipeline results, extend the format:

### Standard mode result

```
All checks passed. Set TEST_PASSED=true.
```

### Next Actions

1. `/claude-tweaks:review {spec}` — code review quality gate **(Recommended)**
2. `/claude-tweaks:review {spec} full` — code + visual review (if UI files changed and browser available)

### QA mode result

```
## QA Validation Results

**Stories:** {total} total | {pass} pass | {pass_with_caveats} pass (caveats) | {fail} fail | {skip} skipped
**Findings:** {N findings} | **Observations:** {M caveats}

{Findings table from qa-review.md — only if findings exist}
{Observations table from qa-review.md — only if caveats exist}
{Full QA report from qa-review.md}

Set TEST_PASSED=true (if all passed or passed with observations).
```

### Actions Performed

{Only show when QA auto-recovered selectors or applied fixes. Omit when purely observational.}

| Action | Detail | Ref |
|--------|--------|-----|
| Ledger fix | Auto-recovered selector (test/qa) — `{story file}` | — |

### Next Actions

1. `/claude-tweaks:review {spec}` — code review quality gate **(Recommended)**
2. `/claude-tweaks:review {spec} full` — code + visual review (if browser available)

PASS_WITH_CAVEATS counts as passed for the `TEST_PASSED` gate — caveats are informational, not blocking. When timing data is available in the QA results (per-story elapsed time and total wall-clock time), include the Timing section from the QA report.

When selectors are auto-recovered during QA execution, the report includes a "Recovered Selectors" summary showing the original and recovered selector for each affected step. The story YAML files have already been updated by the orchestrator (qa-review.md Phase 4.5) — no manual YAML editing is needed. Auto-recovered selectors are classified as `stale-selector` with status `auto-fixed` in the findings table.

After presenting QA results, write QA findings and observations to the open items ledger (see `qa-review.md` Phase 5.5 in the `/claude-tweaks:review` skill's directory). Findings from failures get status `open` and block the pipeline. Observations from PASS_WITH_CAVEATS stories get status `observation` with severity `Info` — they are informational and do not block the pipeline.

### All mode result

```
## Verification Results

{standard verification table}

## QA Validation Results

**Stories:** {total} total | {pass} pass | {pass_with_caveats} pass (caveats) | {fail} fail | {skip} skipped
**Findings:** {N findings} | **Observations:** {M caveats}

{Findings table from qa-review.md — only if findings exist}
{Observations table from qa-review.md — only if caveats exist}
{Full QA report from qa-review.md}

Set TEST_PASSED=true (if all passed or passed with observations).
```

### Next Actions

1. `/claude-tweaks:review {spec}` — code review quality gate **(Recommended)**
2. `/claude-tweaks:review {spec} full` — code + visual review (if browser available)

### Pipeline result (VERIFICATION_PASSED + no stories)

```
Verification: passed in build. QA: no stories found.
Set TEST_PASSED=true.
```

### Pipeline result (VERIFICATION_PASSED + stories)

```
Verification: passed in build.

## QA Validation Results

**Stories:** {total} total | {pass} pass | {pass_with_caveats} pass (caveats) | {fail} fail | {skip} skipped
**Findings:** {N findings} | **Observations:** {M caveats}

{Findings and Observations tables if applicable}
{QA report}

Set TEST_PASSED=true (if all passed or passed with observations).
```

On overall pass (including PASSED WITH OBSERVATIONS), set `TEST_PASSED=true` in pipeline context.

## Step 3: Fix Mode (Optional)

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

**QA failures** are not auto-fixable — they indicate broken user-facing behavior that requires investigation. For QA failures:

```
{N} QA story failure(s) found. QA failures require investigation — they cannot be auto-fixed.
1. Show failure details — I'll investigate the root cause
2. Re-run failed stories — `/claude-tweaks:test qa retry={RUN_DIR}`
3. Skip — I'll investigate manually
```

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Running the full suite when only types were requested | Respect the scope — the user asked for a targeted check |
| Auto-fixing failures without asking | Simple failures can mask deeper issues — always ask first |
| Skipping CLAUDE.md command lookup | Projects have specific test commands — don't guess |
| Running tests before type checking | Type errors often cause test failures — fail fast with the cheapest check |
| Ignoring lint warnings | Warnings accumulate into a noisy codebase — surface them |
| Running QA on broken code | Verification must pass before QA is meaningful — types/lint/tests gate QA in `all` mode |
| Auto-fixing QA failures | QA failures indicate broken user-facing behavior — they need investigation, not automated patches |
| Skipping QA when stories exist in pipeline | Stories exist to be validated — if `VERIFICATION_PASSED` is set and stories exist, QA must run |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | /build runs verification as Common Step 5, sets `VERIFICATION_PASSED=true`. In pipeline, /test skips types/lint/tests when this is set. |
| `/claude-tweaks:review` | /review gates on `TEST_PASSED=true` from /test. /review never runs verification itself — that's /test's job. |
| `/claude-tweaks:stories` | /stories generates the YAML stories that /test qa validates. Also provides `dev-url-detection.md` for URL resolution. |
| `/claude-tweaks:flow` | /flow chains build → [stories →] test → review → wrap-up. /test is the mechanical gate between build/stories and review. |
| `/claude-tweaks:help` | /help can recommend /test when code changes exist but no review is warranted |
