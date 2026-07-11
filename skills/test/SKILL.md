---
name: claude-tweaks:test
description: Use when you need to run verification checks (types, lint, tests) or validate QA stories — the mechanical "does it work?" gate.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Test — Verification Gate

Mechanical pass/fail gate — types, lint, tests, QA story validation. Answers "does it work?" without analytical judgment. Part of the workflow lifecycle:

```
/claude-tweaks:init → /claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:stories → [ /claude-tweaks:test ] → /claude-tweaks:review → /claude-tweaks:wrap-up
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
| `qa journey={name}` | QA — run only stories with `journey: {name}` (kebab-case, case-insensitive match against the story's `journey:` field; e.g., `qa journey=profile-settings`) |
| `all` | Full suite (types + lint + tests) AND QA story validation |
| `skip-qa` | Run types/lint/tests only. Skip QA story validation **even when stories exist**. (Step 1.5 Design CLI gate still runs — see that step for details.) |

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
- `VERIFICATION_PASSED=true` + `skip-qa` argument → skip verification AND skip QA, set `TEST_PASSED=true` (used by `/flow`'s polish-phase re-verify gate)
- No `VERIFICATION_PASSED` + `skip-qa` → run types/lint/tests but skip QA story validation
- No `VERIFICATION_PASSED` (default) → run full suite (and QA if stories exist when mode is `all`)

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
   a. Auto-detect the dev server URL using the shared procedure from `dev-url-detection.md` in `skills/_shared/` (or use `DEV_URL` from pipeline context).
   b. If no dev server is reachable and none can be started — stop and report: "QA validation failed — no dev server available."
   c. Run the QA procedures from `qa-procedures.md` in this skill's directory (which references `qa-prompts.md` for Phase 3 dispatch and `qa-reporting.md` for Phases 4-5.5).
   d. Pass through any QA-specific arguments: `tag=`, `story=`, `retry=`, `affected`, `journey=`, etc.
   e. **Journey filter:** When `journey={name}` is present, pass it to the QA procedures. This filters stories to only those with `journey: {name}` in their YAML — enabling journey-scoped test execution.

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

### Skip-QA mode (`skip-qa`)

Run types/lint/tests only — skip QA story validation entirely, even when stories exist. Used by `/flow`'s polish-phase re-verify gate to avoid re-running browser QA after stylistic-only changes.

1. Run the shared verification procedure from `verification.md` (types, lint, tests).
2. **Do not** run QA, regardless of whether stories exist or `STORIES_DIR` is set.
3. The Design CLI gate (Step 1.5) still runs — `skip-qa` skips QA stories, not the deterministic CLI check.

**Composability:** `skip-qa` can be combined with targeted scope arguments (e.g., `/test types skip-qa` runs only type checking; `skip-qa` is redundant in that case but harmless).

When invoked with `skip-qa` and verification passes, set `TEST_PASSED=true` and report:

```
Verification: passed (types + lint + tests). QA: skipped (skip-qa).
Set TEST_PASSED=true.
```

## Step 1.5: Design CLI Gate (Impeccable)

After types/lint/tests pass (or if they were skipped via `VERIFICATION_PASSED`), invoke the design wrapper to run the deterministic Impeccable CLI check on changed frontend files. This catches design anti-patterns (default-AI gradients, hard-coded pixel values, etc.) without LLM cost.

**Skip this step entirely when:**
- The mode is `qa` (QA-only run; design gate has no opinion on QA stories)
- The user-supplied scope was a single check type (`types`, `lint`, `unit`, `integration`, `e2e`) — these targeted runs do not include the design gate

**Invocation:**

Invoke `/claude-tweaks:design test <changed-files>`. Resolve `<changed-files>` from `git diff --name-only` (the wrapper handles its own filtering and detection).

**Result handling:**

| Wrapper return | Test gate behavior |
|----------------|-------------------|
| `{result: "pass", findings: [...]}` (zero findings, or advisory only) | Proceed. Surface advisory findings in the test output as informational. |
| `{result: "fail", findings: [...]}` (any `severity: warning`) | **Fail the test gate.** Surface the findings table in the test report. Do NOT auto-fix — design findings require human judgment. |
| `{skipped: ...}` | Note the skip in test output and proceed. |
| `{deferred: ...}` (should not happen for `test` mode) | Treat as skip and proceed. |

See `_shared/design-wrapper-handling.md` for the canonical return-shape contract and the "why skips don't fail" rationale.

**Reporting:** Include a "Design CLI" row in the verification results table:

```markdown
| Design CLI | {pass/fail/skipped} | {Xs} | {N findings: Y warning, Z advisory} or {skip reason} |
```

If `severity: warning` findings are present, append a Design Findings section before the standard test-failure section:

```markdown
### Design Findings (Impeccable CLI)

| File | Line | Antipattern | Severity | Description |
|------|------|-------------|----------|-------------|
| {file} | {line} | {antipattern} | warning | {description} |
```

## Step 2: Report

Present results using the format from `verification.md` Step 3 for standard checks. For QA and pipeline results, render the appropriate template from `report-templates.md` in this skill's directory.

| Mode | Template in `report-templates.md` |
|------|----------------------------------|
| Standard suite (no args) | `## Standard mode result` |
| QA-only (`qa`) | `## QA mode result` (includes Actions Performed sub-table) |
| Full suite + QA (`all`) | `## All mode result` |
| Pipeline (`VERIFICATION_PASSED=true`, no stories) | `## Pipeline result (VERIFICATION_PASSED + no stories)` |
| Pipeline (`VERIFICATION_PASSED=true`, stories exist) | `## Pipeline result (VERIFICATION_PASSED + stories)` |

Read `report-templates.md` for the full templates, the `PASS_WITH_CAVEATS` propagation rule, the Actions Performed format, and the canonical `TEST_PASSED` semantics.

## Step 3: Fix Mode (Optional)

If tests fail and the failures look straightforward (type errors, lint violations, simple test failures):

### Auto mode

When a pipeline run directory exists, apply the `/test` row from the silences table in `_shared/auto-mode-contract.md`. Read `auto-fix-threshold` from `config.yml` (resolve the run dir via `_shared/pipeline-run-dir.md`; default `lint+type`) and route per the `/test` row in `_shared/auto-mode-contract.md`. QA failures never auto-fix — they always stage.

**Auto-fix flow:** make the changes, re-run the failed checks. On re-verification pass, log `AUTO {time} — Step 3: auto-fixed {N} {type} failures. Reversibility: high; commit: {hash}.` and proceed. On re-verification fail or new issues, downgrade to STAGED and surface at Review Console.

**Stage flow:** write the proposed fix to `staged/test-fix-{n}.patch` and log `STAGED {time} — Step 3: {N} {type} failures staged for review. Stage path: staged/test-fix-{n}.patch.`. The test gate fails until the user resolves at the Review Console.

### Interactive mode

> **Prompt ordering:** Per CLAUDE.md's "never present more than one batch decision table per message" rule — if both lint/type and QA failures are present, present the lint/type prompt first, resolve, then present the QA prompt. Never combine them into a single message.

Call `AskUserQuestion` with:

- `question`: `"{N} failure(s) found. How do you want to handle them?"`, `header`: `"Fix failures"`, `multiSelect`: `false`
- Option 1 — `label`: `"Fix automatically"`, `description`: `"I'll address these failures now"`. Suffixed `(Recommended)` when failures are mechanical (lint/type/simple test failures) — not unconditionally.
- Option 2 — `label`: `"Show details only"`, `description`: `"I'll investigate but not change code"`
- Option 3 — `label`: `"Skip"`, `description`: `"I'll fix these manually"`

If the user chooses to fix:
- **Mechanical failures (lint/type):** make the changes directly, re-run the failed checks, report results.
- **Behavioral test failures:** do not edit-and-pray. Invoke `/superpowers:systematic-debugging` — reproduce the failure on command, identify the confirmed cause, then fix it. A failing test is a reproduction you already have; use it. Re-run the failed checks to verify the fix and that nothing else regressed. If the root cause can't be pinned down, surface what you found rather than guessing at a patch.
- Report the results.

**Auto-fix for lint/type-only failures (interactive default):** When failures are exclusively lint errors or type errors (no test failures), auto-fix and re-verify without asking. State: "Auto-fixing {N} lint/type errors" and re-run the failed checks. If re-verification passes, proceed. If re-verification fails or new issues appear, stop and present the 3-option choice above. For test failures or mixed failure types (lint + test), always present the choice — and resolve test failures via reproduce-first debugging, not blind patching.

**QA failures** are not auto-fixable — they indicate broken user-facing behavior that requires investigation. For QA failures, call `AskUserQuestion` with:

- `question`: `"{N} QA story failure(s) found. QA failures require investigation — they cannot be auto-fixed. What do you want to do?"`, `header`: `"QA failures"`, `multiSelect`: `false`
- Option 1 — `label`: `"Show failure details (Recommended)"`, `description`: `"I'll investigate the root cause via reproduce-first debugging (/superpowers:systematic-debugging)"`
- Option 2 — `label`: `"Re-run failed stories"`, `description`: `"/claude-tweaks:test qa retry={RUN_DIR}"`
- Option 3 — `label`: `"Skip"`, `description`: `"I'll investigate manually"`

When investigating a QA failure (option 1), use `/superpowers:systematic-debugging` — a QA story failure is already a reproduction; confirm it reproduces, find the cause, then fix. Do not patch the symptom (e.g., loosening a selector) without confirming the underlying behavior is correct.

## Next Actions

Pick the row matching the mode just completed:

| Mode + outcome | Next |
|---|---|
| Standard / All / QA passed (or PASS_WITH_CAVEATS) | Genuine choice — see below |
| Verification failed (types/lint/tests) | Fix the failures, then re-run `/claude-tweaks:test` |
| QA failed | Investigate failures (Fix Mode option 1), then `/claude-tweaks:test qa retry={RUN_DIR}` |

**On any pass outcome** (the first row), the "plain code review" and "code + visual review" rows are not two separate situations — they're two alternative commands for the same outcome. Call `AskUserQuestion` with exactly 2 options:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Code review"`, `description`: `"/claude-tweaks:review {spec} — code review quality gate"`
- Option 2 — `label`: `"Code + visual review"`, `description`: `"/claude-tweaks:review {spec} full — code + visual review"`

Whichever matches the current run's actual signal gets `(Recommended)` on its label — UI files changed AND browser available → Option 2; otherwise → Option 1.

**The other two rows are not a user choice** — "Verification failed" and "QA failed" are single deterministic next steps. Leave them as plain prose instructions; do not force them into a one-option `AskUserQuestion` call.

## Component-Skill Contract

`/claude-tweaks:test` is invoked by `/claude-tweaks:flow` between build and review, and by `/claude-tweaks:review` Step 1.5 as the test gate. Parent invocation is signaled by the `PIPELINE_RUN_DIR` env var or by the caller setting `TEST_PASSED` in the calling context. When `PIPELINE_RUN_DIR` is set, omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user, render Next Actions as documented. The skip-qa flag and qa-mode args are user-facing; parents pass `skip-qa` during the `/flow` polish re-verify gate and never invoke qa mode themselves (qa runs at its own pipeline stage).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Running the full suite when only types were requested | Respect the scope — the user asked for a targeted check |
| Auto-fixing test failures without asking | Test failures can mask deeper issues — lint/type auto-fix with re-verification is safe, but test failures need investigation |
| Skipping CLAUDE.md command lookup | Projects have specific test commands — don't guess |
| Running tests before type checking | Type errors often cause test failures — fail fast with the cheapest check |
| Ignoring lint warnings | Warnings accumulate into a noisy codebase — surface them |
| Running QA on broken code | Verification must pass before QA is meaningful — types/lint/tests gate QA in `all` mode |
| Auto-fixing QA failures | QA failures indicate broken user-facing behavior — they need investigation, not automated patches |
| Patching a behavioral test/QA failure without reproducing the cause | A failing test is a reproduction you already have — confirm it reproduces, find the root cause via `/superpowers:systematic-debugging`, then fix. Loosening assertions or selectors to make red go green hides the bug. |
| Skipping QA when stories exist in pipeline | Stories exist to be validated — if `VERIFICATION_PASSED` is set and stories exist, QA must run |
| Treating Design CLI skip as a test failure | The wrapper skips for legitimate reasons (backend project, Impeccable not installed, kill-switch disabled). None are test failures — only `result: fail` from the wrapper is a gate failure. |
| Auto-fixing Design CLI findings | Design findings require human judgment — surface them, do not auto-modify code. The Phase 1 wrapper's `test` mode is read-only by design (the Phase 2 `polish` mode is the code-modifying counterpart, invoked separately by `/flow`). |
| Using `skip-qa` outside the re-verify context | The flag exists for `/flow`'s re-verify gate after polish modifications — it skips browser QA after stylistic changes. Standalone use is allowed but rarely useful; prefer the default suite which includes QA when stories exist. |
| Skipping the Design CLI gate when `skip-qa` is set | See Step 1.5 — the Design CLI gate is orthogonal to QA and must still run. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | /build runs verification as Common Step 5, sets `VERIFICATION_PASSED=true`. In pipeline, /test skips types/lint/tests when this is set. |
| `/claude-tweaks:review` | /review gates on `TEST_PASSED=true` from /test. /review never runs verification itself — that's /test's job. |
| `/claude-tweaks:stories` | /stories generates the YAML stories that /test qa validates. Stories with a `journey:` field can be filtered with `/test qa journey={name}`. Both skills consume `dev-url-detection.md` from `skills/_shared/` for URL resolution. |
| `/claude-tweaks:flow` | /flow chains build → [stories →] test → review → polish → re-verify → wrap-up. /test is the mechanical gate between build/stories and review. The polish-phase re-verify gate invokes `/test skip-qa` to verify polish modifications without re-running browser QA. |
| `/claude-tweaks:help` | /help can recommend /test when code changes exist but no review is warranted |
| `/claude-tweaks:ledger` | Manages the open items ledger. /test appends QA findings and observations with phase `test/qa`. |
| `/claude-tweaks:design` | /test invokes `/claude-tweaks:design test <files>` as Step 1.5 after the standard suite. Findings with `severity: warning` fail the gate; `advisory` findings and skips do not. The wrapper handles its own detection and availability checks. |
| `/claude-tweaks:browse` | /browse may invoke /test indirectly when story validation requires browser-driven QA — both share `dev-url-detection.md` from `skills/_shared/`. |
| `/claude-tweaks:journeys` | /journeys feeds journey files into /stories which /test qa consumes; `journey={name}` filter lets /test run only the QA stories tied to a single journey. |
| `/claude-tweaks:journey-health` | The deep tier drives `/test journey={name}` when auditing a journey that has story coverage — this is the "agent e2e testing" journey-health exists to protect. |
| `/claude-tweaks:reflect` | /reflect may surface implementation findings that reference /test verification gaps; /test does not invoke /reflect, but reflection insights can call for new test coverage. |
| `/claude-tweaks:simplify` | /simplify runs before /test in /build's Common Step 3; /test verifies that simplification did not break behavior. |
| `/claude-tweaks:deepen` | /deepen uses the shared verification procedure from /test's `verification.md` to confirm a depth refactor preserved behavior. |
| `/claude-tweaks:visual-review` | /visual-review consumes QA data produced by /test qa (when stories exist); both contribute to the /review verdict surface. |
| `/superpowers:systematic-debugging` | Invoked BY /test Step 3 Fix Mode when a behavioral test or QA failure needs root-causing — reproduce-first before fixing, never patch a symptom to make red go green |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. Step 3 Fix Mode follows the contract's auto-fix-threshold + reversibility-floor pattern. |
