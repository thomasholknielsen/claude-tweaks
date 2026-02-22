---
name: claude-tweaks:review
description: Use when a build is complete and you need to verify code quality, correctness, and simplicity before wrapping up. The quality gate between implementation and lifecycle cleanup.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." End skills with a recommended next step, not a navigation menu.


# Review

Post-build quality gate. Verifies, reviews, and refines the code before handing off to wrap-up. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → [ /claude-tweaks:review ] → /claude-tweaks:wrap-up
                                                                                                                      ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- A `/claude-tweaks:build` session just finished and needs quality verification
- You want to verify code before creating a PR
- Code was written outside the workflow and needs a structured review
- `/claude-tweaks:help` recommends reviewing a spec that appears complete

## Overview

`/claude-tweaks:build` produces code. `/claude-tweaks:review` asks: is this code good enough to ship? `/claude-tweaks:wrap-up` then handles reflection, cleanup, and knowledge capture.

This skill is the single quality gate — everything from automated checks to human-judgment code review to code simplification lives here.

## Input

`$ARGUMENTS` = spec number, file paths, or nothing (auto-detect).

### Resolve the input:

1. **Spec number** (e.g., "42") — find all files changed for that spec via git history
2. **File paths** — review those specific files
3. **No arguments** — use `git diff` against the base branch or recent commits to identify changed files

## Step 1: Spec Compliance Check (spec-based only)

If a spec number was provided, read the spec file and verify the implementation meets it:

1. **Deliverables** — for each deliverable checkbox in the spec, search the codebase for the implementation. Mark each as `done`, `partial`, or `missing`.
2. **Acceptance Criteria** — for each criterion, determine whether it's verifiable from the code and tests. Mark as `met`, `partially met`, or `not met`.
3. **Non-Goals** — verify the implementation didn't accidentally include work scoped out by the spec's Non-Goals section.

### Gate:

| Result | Action |
|--------|--------|
| All deliverables done + all criteria met | Proceed to Step 2 |
| Minor gaps (1-2 partial items) | Flag gaps, proceed — they may be addressed in Implementation Hindsight |
| Significant gaps (missing deliverables or criteria) | **BLOCKED** — the spec isn't fully built yet. List what's missing so the user can resume `/claude-tweaks:build` |

If blocked, skip the rest of the review. Present the gap analysis so the user knows exactly what to finish.

> **Why this is Step 1:** A thorough code review on incomplete work wastes effort. Catch spec gaps before investing in quality analysis.

## Step 2: Identify What Changed

Analyze `git diff` (or `git diff` against the base branch) to understand the scope:

- Which files changed and in which packages/apps
- Lines added/removed
- Whether schema, API surface, or infrastructure changed
- Whether new dependencies were introduced

This classification guides which review lenses to apply — a pure UI change doesn't need a database review.

## Step 3: Automated Verification (Gate)

Run the project's standard verification commands. Check CLAUDE.md for the specific commands.

### Checks:

- Type checking
- Linting
- Tests (unit + integration)

### Additional checks:

- New environment variables → documented in env examples?
- New routes → test coverage?
- Schema changes → migration created?
- New dependencies → justified and version-pinned?

**Gate:** If any check fails → **stop here**. Present failures. Fix before continuing.

## Step 4: Code Review

Review changed files through these lenses. Skip lenses that don't apply to the type of change (e.g., skip "Performance" for a docs-only change).

### 4a: Convention Compliance

- Does the code follow naming conventions documented in CLAUDE.md?
- Are project patterns followed (error handling, validation, logging)?
- Are shared utilities used instead of reinventing (check existing packages)?
- Are imports from the right packages (not duplicating types inline)?

### 4b: Security

- Input validation at system boundaries?
- No raw SQL or command injection risks?
- Authentication/authorization checks present where needed?
- No secrets or sensitive data in code?
- OWASP top 10 considerations?

### 4c: Error Handling

- Appropriate error types used (project's error class, not raw Error)?
- Edge cases handled (null, empty, malformed input)?
- Errors logged with sufficient context for debugging?
- User-facing errors safe (no internal details leaked)?

### 4d: Performance

- No N+1 query patterns?
- Appropriate use of caching where applicable?
- No unnecessary re-renders (React)?
- Database queries have proper indexes?
- Pagination used for unbounded lists?

### 4e: Architecture

- Right level of abstraction (not over/under-engineered)?
- Proper separation of concerns?
- Dependencies flow in the right direction?
- No circular dependencies introduced?
- Changes consistent with existing architecture?

### 4f: Test Quality

- Tests verify behavior, not implementation details?
- Edge cases and error paths tested?
- Test data is realistic and follows schemas?
- No test pollution (shared mutable state)?
- Mocks are minimal and at the right level?

### 4g: Route Code Review Findings

**Every finding from lenses 4a-4f must be explicitly resolved.** Present all findings as a single batch table with recommended actions pre-filled:

```
### Code Review Findings

| # | Finding | Severity | Category | Affected | Recommended |
|---|---------|----------|----------|----------|-------------|
| 1 | {description} | Critical | Security | {files} | Fix now |
| 2 | {description} | High | Error | {files} | Fix now |
| 3 | {description} | Medium | Convention | {files} | Defer |
| 4 | {description} | Low | Perf | {files} | Don't fix — {reason} |

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

**Recommendation rules:**
- **Critical** (security vulnerabilities, data loss risks) — always "Fix now". Non-negotiable.
- **High** (broken behavior, missing validation) — default "Fix now".
- **Medium/Low** — recommend based on effort vs. impact.

If any findings are "Fix now", make the changes, re-run verification (Step 3), and verify fixes didn't introduce new findings.

> **Principle:** Nothing is implicitly "not done." Every finding either gets fixed, gets explicitly deferred with context, or gets explicitly accepted with a stated reason. The summary in Step 8 records the resolution for each finding.

---

## Step 5: Implementation Hindsight (Decision Point)

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
| 1 | {description} | Change now — low cost, clear benefit |
| 2 | {description} | Accept as-is — {rationale} |
| 3 | {description} | Capture as new idea |

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

If any findings are **"Change now"**, make the changes, re-run verification (Step 3), and resume.

If no hindsight findings, state "No changes needed — approach is sound" and proceed.

---

## Step 6: Simplify Changed Code

Run the **code-simplifier** subagent on files modified during this work:

```
Task tool with subagent_type="code-simplifier"
```

**Scope:** Only files changed in the current work (use `git diff --name-only`). Do NOT simplify unrelated code.

**What it catches:**
- Unnecessary complexity from iterative development
- Verbose patterns from trial-and-error debugging
- Leftover defensive code from abandoned approaches
- Inconsistent naming or structure across changed files
- Dead paths, redundant conditionals, over-abstraction

If the code-simplifier makes changes, re-run verification (Step 3) before proceeding.

---

## Step 7: Browser Review (Optional)

If the changes affect UI or user-facing behavior, offer a visual review.

**When to skip silently:** Backend-only, config-only, or test-only changes — no UI to inspect.

**When browser tools are unavailable:** If the changes touch UI but no browser integration is configured (no Chrome Extension or Playwright MCP), don't silently skip. Instead, note it:

```
Browser review skipped — no browser integration configured.
To set up browser tools, run /claude-tweaks:setup and choose browser integration.
```

This keeps the skip visible without blocking the review.

### Check for affected journeys

Detect when this build's changes may affect existing user journeys — even journeys from previous specs.

#### How to check

1. Get the list of changed files: `git diff --name-only` (or against the base branch)
2. Read all journey files in `docs/journeys/*.md`
3. For each journey, check its `files:` frontmatter for overlap with the changed files list
4. Also scan journey step URLs and content for references to changed routes or pages

A journey is **affected** if any file in its `files:` frontmatter was modified in this build, OR if its steps reference routes/pages that correspond to changed files.

#### Route the results

**Do not stop to ask.** Note the browser review recommendation in the summary (Step 8) instead:

- **Affected journeys found** → summary notes: "Browser review recommended — {N} journey(s) reference changed files:" followed by a table:
  ```
  | Journey | Overlapping Files | Command |
  |---------|------------------|---------|
  | {name} | {file1}, {file2} | `/claude-tweaks:browser-review journey:{name}` |
  ```
- **No journeys but UI changed** → summary notes: "Browser review recommended: `/claude-tweaks:browser-review {url}`."
- **No UI impact** → skip silently.

This keeps the review flowing. The user runs browser review after seeing the summary if they want visual verification. Browser review findings feed back into the same decision flow when run.

## Step 8: Present Review Summary

Present a structured summary covering spec compliance, verification results, code review findings, browser review (if run), implementation hindsight, tradeoffs, simplification, and a verdict (PASS or BLOCKED). For the complete template, read `review-summary-template.md` in this skill's directory.

## Important Notes

- Spec compliance is the first gate — incomplete specs go back to `/claude-tweaks:build`, not through code review
- Verification is a hard gate — broken code blocks the entire review
- Implementation Hindsight is an action gate — "change now" items must be fixed before passing
- Code simplification runs on changed files only — never expand scope to unrelated code
- Skip review lenses that don't apply to the type of change
- This skill reviews the *current work* — it is not a codebase-wide audit

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Reviewing incomplete specs | Wastes effort — spec compliance check (Step 1) catches this, but don't skip it |
| Skipping verification to "save time" | Broken code invalidates the entire review — verification is a hard gate |
| Reviewing unrelated code | Scope creep — only review files changed in the current work |
| Accepting all Implementation Hindsight findings as-is | The action gate exists for a reason — "change now" items must be fixed |
| Running review without a prior build | Review assumes code exists and was recently written — it is not a codebase-wide audit |
| Listing code review findings without routing them | Every finding must be explicitly resolved: fix now, defer with context, or don't fix with stated reason. No implicit drops. |
| Putting findings only in the summary table | The summary records resolutions, not unresolved observations. Route first (Step 4g), then summarize (Step 8). |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | Produces the code that /claude-tweaks:review evaluates |
| `/claude-tweaks:browser-review` | Visual complement — /claude-tweaks:review offers to chain into it for UI changes |
| `/claude-tweaks:wrap-up` | Runs after /claude-tweaks:review passes — focuses on reflection, cleanup, and knowledge capture |
| `/claude-tweaks:capture` | /claude-tweaks:review may create INBOX items for new ideas discovered during review |
| `specs/DEFERRED.md` | /claude-tweaks:review routes implementation-related deferrals here (with origin, files, trigger) |
