---
name: claude-tweaks:review
description: Use when a build is complete and you need analytical judgment on code quality, correctness, and simplicity before wrapping up. Gates on /claude-tweaks:test passing. The quality gate between implementation and lifecycle cleanup.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a recommended next step, not a navigation menu.


# Review — Analytical Judgment Gate

Post-build quality gate. `/claude-tweaks:test` answers "does it work?" — `/claude-tweaks:review` answers "is it good?" Reviews, refines, and approves the code before handing off to wrap-up. Part of the workflow lifecycle:

```
/claude-tweaks:capture → ... → /claude-tweaks:build → [ /claude-tweaks:stories ] → /claude-tweaks:test → [ /claude-tweaks:review ] → /claude-tweaks:wrap-up
                                                                                                          ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- A `/claude-tweaks:build` session just finished and needs quality verification
- You want to verify code before creating a PR
- Code was written outside the workflow and needs a structured review
- `/claude-tweaks:help` recommends reviewing a spec that appears complete
- You need a visual browser review of the running application
- You want to discover and document user journeys in a brownfield project

## Overview

`/claude-tweaks:test` verifies that code works mechanically — types pass, lint is clean, tests are green, QA stories execute successfully. `/claude-tweaks:review` assumes all that has passed and asks a different question: is this code *good enough to ship?*

This skill is the analytical quality gate — everything from spec compliance to human-judgment code review to visual browser inspection to code simplification lives here. Mechanical verification lives in `/claude-tweaks:test`.

## Review Modes

| Mode | Syntax | What runs |
|------|--------|-----------|
| **code** (default) | `/claude-tweaks:review 42` | Steps 1-7: spec compliance, test gate, change analysis, code review, hindsight, simplification, summary |
| **full** | `/claude-tweaks:review 42 full` | Code review (Steps 1-5) + visual browser review (Step 6) + summary (Step 7) |
| **visual** | `/claude-tweaks:review visual {url}` | Browser review only — page mode |
| **journey** | `/claude-tweaks:review journey:{name}` | Browser review only — walk a documented journey |
| **discover** | `/claude-tweaks:review discover` | Browser review only — scan and document all user journeys |

Code mode is the default. Append `full` to include a visual pass after code review. Use `visual`, `journey:`, or `discover` for browser-only reviews without code analysis.

When invoked by `/claude-tweaks:flow`, review runs in **full** mode by default (code + visual). Flow handles browser detection and falls back to code mode when no browser backend is available.

For complete visual review procedures, read `browser-review.md` in this skill's directory. When QA data is available from a recent `/claude-tweaks:test qa` or `/claude-tweaks:test all` run, the visual review consumes page inventories, caveats, and screenshots to enrich its analysis and idea generation — see the QA Data Loading section in `browser-review.md`.

## Input

`$ARGUMENTS` = spec number, file paths, mode, or visual review target.

### Resolve the input:

1. **Spec number** (e.g., "42") — find all files changed for that spec via git history. Mode: code.
2. **Spec number + `full`** (e.g., "42 full") — code review + visual browser review
3. **File paths** — review those specific files. Mode: code.
4. **`visual` + URL or description** (e.g., "visual http://localhost:3000") — browser review only (page mode)
5. **`journey:{name}`** (e.g., "journey:checkout") — browser review only (journey mode)
6. **`discover`** — browser review only (discover mode)
7. **`qa`** — **Redirect:** QA validation has moved to `/claude-tweaks:test qa`. Run `/claude-tweaks:test qa` for story validation, or `/claude-tweaks:test all` for full verification + QA.
8. **No arguments** — use `git diff` against the base branch or recent commits to identify changed files. Mode: code.

In visual, journey, and discover modes, skip Steps 1-5 and 7 — run only the procedures from `browser-review.md` in this skill's directory.

## Step 1: Spec Compliance Check (spec-based only)

If a spec number was provided, read the spec file and verify the implementation meets it:

1. **Deliverables** — for each deliverable checkbox in the spec, search the codebase for the implementation. Mark each as `done`, `partial`, or `missing`.
2. **Acceptance Criteria** — for each criterion, determine whether it's verifiable from the code and tests. Mark as `met`, `partially met`, or `not met`.
3. **Non-Goals** — verify the implementation didn't accidentally include work scoped out by the spec's Non-Goals section.

### Gate:

| Result | Action |
|--------|--------|
| All deliverables done + all criteria met | Proceed to Step 1.5 |
| Minor gaps (1-2 partial items) | Flag gaps, proceed — they may be addressed in Implementation Hindsight |
| Significant gaps (missing deliverables or criteria) | **BLOCKED** — the spec isn't fully built yet. List what's missing so the user can resume `/claude-tweaks:build` |

If blocked, skip the rest of the review. Present the gap analysis so the user knows exactly what to finish.

> **Why this is Step 1:** A thorough code review on incomplete work wastes effort. Catch spec gaps before investing in quality analysis.

## Step 1.5: Test Gate

Verify that `/claude-tweaks:test` has passed before proceeding to analytical review. Reviewing code quality on code that doesn't work is wasted effort.

### In `/claude-tweaks:flow` pipeline:

Check for `TEST_PASSED=true` in pipeline context. If present, proceed to Step 2.

### Standalone (outside `/flow`):

Check for a recent `/claude-tweaks:test` pass. A pass is "recent" if no code changes have been committed since the test run.

- **Recent pass found** → proceed to Step 2.
- **No recent pass** → auto-trigger `/claude-tweaks:test`. If QA stories exist (`stories/*.yaml`), trigger `/claude-tweaks:test all` (full suite + QA). Otherwise trigger `/claude-tweaks:test` (standard suite only).

### QA Ledger Check

After confirming `TEST_PASSED`, read the open items ledger (`docs/plans/*-ledger.md`) and filter for entries with phase `test/qa`:

- If any QA ledger entries have status `open` (failures that were not resolved), include them in the test gate report alongside the `TEST_PASSED` status. These represent QA failures that `/test` surfaced and that still need resolution.
- If all QA entries have status `observation` or `fixed`, note: "QA observations present — see findings table in Step 3g."

### Gate:

| Result | Action |
|--------|--------|
| `TEST_PASSED=true` (pipeline) | Proceed to Step 2 |
| Recent `/test` pass (standalone) | Proceed to Step 2 |
| `/test` triggered and passes | Proceed to Step 2 |
| `/test` triggered and fails | **STOP** — present test failures. Fix before continuing. Run `/claude-tweaks:test` to re-verify. |

> **Why this gates review:** Mechanical correctness is a prerequisite for analytical quality judgment. Code review on broken code wastes effort.

## Step 2: Identify What Changed

Analyze `git diff` (or `git diff` against the base branch) to understand the scope:

- Which files changed and in which packages/apps
- Lines added/removed
- Whether schema, API surface, or infrastructure changed
- Whether new dependencies were introduced

This classification guides which review lenses to apply — a pure UI change doesn't need a database review.

## Step 3: Code Review

Review changed files through these lenses. Skip lenses that don't apply to the type of change (e.g., skip "Performance" for a docs-only change).

> **Parallel execution:** Before running any lens, gather all context upfront — read all changed files and their surrounding context (imports, tests, schemas) as parallel Read/Grep calls. Each lens needs the same files, so front-loading reads avoids redundant I/O.

> **Parallel execution (conditional):** When the diff spans 10+ files, dispatch each applicable lens (3a-3f) as a parallel Task agent. Each agent receives the full file context and returns findings in the `| # | Finding | Severity | Category | Affected | Recommended |` format. When the diff is smaller, run lenses sequentially in the main thread — the overhead of agent dispatch isn't worth it.

### 3a: Convention Compliance

- Does the code follow naming conventions documented in CLAUDE.md?
- Are project patterns followed (error handling, validation, logging)?
- Are shared utilities used instead of reinventing (check existing packages)?
- Are imports from the right packages (not duplicating types inline)?

### 3b: Security

- Input validation at system boundaries?
- No raw SQL or command injection risks?
- Authentication/authorization checks present where needed?
- No secrets or sensitive data in code?
- OWASP top 10 considerations?

### 3c: Error Handling

- Appropriate error types used (project's error class, not raw Error)?
- Edge cases handled (null, empty, malformed input)?
- Errors logged with sufficient context for debugging?
- User-facing errors safe (no internal details leaked)?

### 3d: Performance

- No N+1 query patterns?
- Appropriate use of caching where applicable?
- No unnecessary re-renders (React)?
- Database queries have proper indexes?
- Pagination used for unbounded lists?

### 3e: Architecture

- Right level of abstraction (not over/under-engineered)?
- Proper separation of concerns?
- Dependencies flow in the right direction?
- No circular dependencies introduced?
- Changes consistent with existing architecture?

### 3f: Test Quality

- Tests verify behavior, not implementation details?
- Edge cases and error paths tested?
- Test data is realistic and follows schemas?
- No test pollution (shared mutable state)?
- Mocks are minimal and at the right level?

### 3h: UX Analysis (when QA data available)

Run the UX analysis procedure from `ux-analysis.md` in this skill's directory. Only runs when QA screenshots and/or caveats exist from a recent `/claude-tweaks:test qa` or `/claude-tweaks:test all` run. When no QA data is available, skip this lens silently.

### 3g: Route Code Review Findings

**Every finding from lenses 3a-3h must be explicitly resolved.** When lenses were dispatched as parallel Task agents, merge their results into a single table here: combine all findings, preserve their category labels, and de-duplicate — if two lenses flag the same issue, keep the entry with the higher severity. UX findings from lens 3h are merged into the batch table alongside code review findings with category "UX".

Unresolved QA ledger entries (status `open`, phase `test/qa`) are included in the code review findings table alongside code review findings. Use the category and severity from the ledger entry. This ensures QA failures flow through the same resolution process as code review findings — they must be explicitly fixed, deferred, or accepted before the review can pass.

Present all findings as a single batch table with recommended actions pre-filled:

```
### Code Review Findings

| # | Finding | Severity | Category | Affected | Recommended |
|---|---------|----------|----------|----------|-------------|
| 1 | {description} | Critical | Security | {files} | Fix now |
| 2 | {description} | High | Error | {files} | Fix now |
| 3 | {description} | Medium | Convention | {files} | Fix now |
| 4 | {description} | Low | Perf | {files} | Fix now |

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

**Recommendation rules:**
- **Critical** (security vulnerabilities, data loss risks) — always "Fix now". Non-negotiable.
- **High** (broken behavior, missing validation) — default "Fix now".
- **Medium** — default "Fix now". Even if effort is moderate, close the gap now.
- **Low** — default "Fix now". Most low-severity findings are trivial to fix.
- **"Don't fix"** — only for false positives or intentional patterns. If the finding is a genuine improvement, it must be fixed or routed — never silently dismissed.

**When "Fix now" isn't possible**, route to the right destination:
- **Defer** (DEFERRED.md) — the fix is understood but it's bigger and not relevant to the current work. Include origin spec, affected files, and trigger for when to revisit.
- **Capture to INBOX** — the finding is complex or uncertain and needs brainstorming/exploration before it can be acted on. This enters the full capture → challenge → `/brainstorm` pipeline.

**Deferral gate:** An item may only be deferred if it meets ALL of these:
- Pre-existing (not introduced by this build), OR requires design discussion that can't be resolved in the current session
- Has a clear trigger documented for when to revisit

Items introduced by this build that are fixable now must be fixed now — even if the fix is imperfect, closing the gap is better than deferring.

If any findings are "Fix now", make the changes, re-run `/claude-tweaks:test`, and verify fixes didn't introduce new findings.

> **Parallel execution (conditional):** When there are 3+ "Fix now" findings across different files with no shared file dependencies, dispatch fixes as parallel agents using the `/dispatching-parallel-agents` pattern — one agent per independent fix domain. Each agent gets: specific file scope, finding details, constraint to not modify other files. Returns summary of changes. After all agents complete, check for conflicts between agent changes, then re-run `/claude-tweaks:test`. When fixes overlap files or there are fewer than 3 findings, fix sequentially in the main thread.

**Write all findings to the open items ledger** (`docs/plans/*-ledger.md` for this work). Status: `open` for "Fix now" items, `deferred` for items routed to DEFERRED.md, `accepted` for "Don't fix" items (with reason). After fixing, update status to `fixed`.

> **Routing bias:** Fix it now — always the recommended default, regardless of severity. Defer when the fix is understood but bigger and not relevant now. Capture to INBOX when the finding needs exploration before it can be acted on. The goal is to close gaps early, not accumulate a backlog.

**Wait for resolution.** Present the code review findings table and wait for the user's response before proceeding to Step 4. Even if there are no "Fix now" items, present the table (or note "No findings") in one message, then present hindsight findings in the next message. Never combine Steps 3g and 4 into a single response.

---

## Step 4: Implementation Hindsight (Decision Point)

This is NOT a thought exercise — it's an **action gate**. After the code review, explicitly ask:

> **"Given everything we've found, should we change something before shipping this?"**

Evaluate:
1. **Approach correctness** — Did we solve the right problem, or optimize for the wrong thing?
2. **Structural debt** — Did we introduce patterns we'll regret? Premature abstractions, wrong boundaries?
3. **Missing consolidation** — Opportunities to merge, deduplicate, or simplify that are obvious now?
4. **Convention drift** — Did we accidentally diverge from established project patterns?

Present all findings as a batch:

```
### Implementation Hindsight

| # | Finding | Recommended |
|---|---------|-------------|
| 1 | {description} | Change now |
| 2 | {description} | Change now |
| 3 | {description} | Defer — bigger scope, not relevant now |
| 4 | {description} | Capture to INBOX — needs exploration |

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

**Recommendation rules:**
- **Change now** — the strong default. If the improvement is clear, make the change. Most hindsight findings are small enough to fix in a few minutes.
- **Defer** (DEFERRED.md) — the improvement is understood but it's bigger and not relevant to the current work. Include origin, files, trigger.
- **Capture to INBOX** — the finding is complex or uncertain and needs brainstorming/exploration before it can be acted on.
- **Accept as-is** — only when the current approach is genuinely better, or the finding is a false positive. Not a valid option for genuine improvements.

If any findings are **"Change now"**, make the changes, re-run `/claude-tweaks:test`, and resume.

**Write all hindsight findings to the open items ledger.** Status: `open` for "Change now" items; update to `fixed` after making changes.

If no hindsight findings, state "No changes needed — approach is sound" and proceed.

---

## Step 5: Simplify Changed Code

Run the **code-simplifier:code-simplifier** subagent on files modified during this work:

```
Task tool with subagent_type="code-simplifier:code-simplifier"
```

**Scope:** Only files changed in the current work (use `git diff --name-only`). Do NOT simplify unrelated code.

**What it catches:**
- Unnecessary complexity from iterative development
- Verbose patterns from trial-and-error debugging
- Leftover defensive code from abandoned approaches
- Inconsistent naming or structure across changed files
- Dead paths, redundant conditionals, over-abstraction

If the code-simplifier makes changes, re-run `/claude-tweaks:test` before proceeding.

---

## Step 6: Visual Review

**When this step runs:**
- **Code mode:** Check for affected journeys and recommend — do not stop to ask (note in summary)
- **Full mode:** Run the complete visual review from `browser-review.md` in this skill's directory
- **Visual/journey/discover mode:** This is the *only* step — skip Steps 1-5 and 7

### Code mode: Check for affected journeys

Detect when this build's changes may affect existing user journeys — even journeys from previous specs.

1. Get the list of changed files: `git diff --name-only` (or against the base branch)
2. Read all journey files in `docs/journeys/*.md`
3. For each journey, check its `files:` frontmatter for overlap with the changed files list
4. Also scan journey step URLs and content for references to changed routes or pages

A journey is **affected** if any file in its `files:` frontmatter was modified in this build, OR if its steps reference routes/pages that correspond to changed files.

**Do not stop to ask.** Note the visual review recommendation in the summary (Step 7) instead:

- **Affected journeys found** → summary notes: "Visual review recommended — {N} journey(s) reference changed files:" followed by a table:
  ```
  | Journey | Overlapping Files | Command |
  |---------|------------------|---------|
  | {name} | {file1}, {file2} | `/claude-tweaks:review journey:{name}` |
  ```
- **No journeys but UI changed** → summary notes: "Visual review recommended: `/claude-tweaks:review visual {url}`."
- **No UI impact** → skip silently.

**When browser tools are unavailable:** If the changes touch UI but no browser backend is configured, don't silently skip. Instead, note it:

```
Visual review skipped — no browser backend configured.
To set up browser tools, run /claude-tweaks:setup and choose browser integration.
```

### Full mode: Run visual review

Run the complete visual review procedures from `browser-review.md` in this skill's directory. Findings feed into the summary (Step 7).

### Visual/journey/discover mode: Standalone

When invoked with `visual`, `journey:`, or `discover`, run only the procedures from `browser-review.md`. The visual review's own report and routing steps handle the output — skip the review summary (Step 7).

## Step 7: Present Review Summary

Present a structured summary covering spec compliance, test results (from `/test`), code review findings, browser review (if run), implementation hindsight, tradeoffs, simplification, and a verdict (PASS or BLOCKED). For the complete template, read `review-summary-template.md` in this skill's directory.

## Important Notes

- Spec compliance is the first gate — incomplete specs go back to `/claude-tweaks:build`, not through code review
- Test passing is a hard gate — broken code blocks the entire review. Run `/claude-tweaks:test` to verify.
- Implementation Hindsight is an action gate — "change now" items must be fixed before passing
- Code simplification runs on changed files only — never expand scope to unrelated code
- Skip review lenses that don't apply to the type of change
- This skill reviews the *current work* — it is not a codebase-wide audit

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Reviewing incomplete specs | Wastes effort — spec compliance check (Step 1) catches this, but don't skip it |
| Skipping the test gate to "save time" | Broken code invalidates the entire review — `/test` must pass first |
| Reviewing unrelated code | Scope creep — only review files changed in the current work |
| Accepting all Implementation Hindsight findings as-is | The action gate exists for a reason — "change now" items must be fixed |
| Running review without a prior build | Review assumes code exists and was recently written — it is not a codebase-wide audit |
| Listing code review findings without routing them | Every finding must be explicitly resolved: fix now, defer with context, or don't fix with stated reason. No implicit drops. |
| Putting findings only in the summary table | The summary records resolutions, not unresolved observations. Route first (Step 3g), then summarize (Step 7). |
| Skipping First Impressions in visual review | The whole point is raw reaction before structured analysis — don't make it analytical |
| Starting the dev server without asking | Dev URL auto-detection offers to start — it doesn't force it |
| Generic visual ideas ("improve the UX") | Ideas must be concrete and implementable in the current tech stack |
| Running visual review without a running app | The browser can't inspect what isn't served — verify the URL responds first |
| Running verification or QA directly in review | Mechanical checks belong in `/claude-tweaks:test` — review gates on test passing, it doesn't duplicate the work |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | Produces the code and journey files that /claude-tweaks:review evaluates |
| `/claude-tweaks:test` | /test is the mechanical "does it work?" gate. /review gates on `TEST_PASSED=true` — it never runs verification or QA itself. Standalone /review auto-triggers /test if no recent pass. |
| `/claude-tweaks:wrap-up` | Runs after /claude-tweaks:review passes — focuses on reflection, cleanup, and knowledge capture |
| `/claude-tweaks:capture` | /claude-tweaks:review may create INBOX items for new ideas discovered during review |
| `/claude-tweaks:codebase-onboarding` | Phase 7 delegates to `/review discover` for brownfield journey bootstrapping |
| `/claude-tweaks:stories` | Generates the YAML stories that /test validates. /review consumes /test results (including QA) via `TEST_PASSED`. |
| `/claude-tweaks:browse` | Used by visual, journey, and discover modes for browser interaction |
| `/claude-tweaks:setup` | Step 6 configures the browser backends that visual review depends on |
| `specs/DEFERRED.md` | /claude-tweaks:review routes implementation-related deferrals here (with origin, files, trigger) |
| `/claude-tweaks:flow` | Invokes /review in **full** mode by default (code + visual). Flow handles browser detection and falls back to code mode when no browser backend is available. |
| `/dispatching-parallel-agents` | Used BY /claude-tweaks:review (conditional) to dispatch 3+ independent fix-now findings as parallel agents |
