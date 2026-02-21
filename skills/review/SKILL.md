---
name: claude-tweaks:review
description: Use after building to review code quality, verify correctness, and simplify before wrapping up. The quality gate between implementation and lifecycle cleanup.
---

# Review

Post-build quality gate. Verifies, reviews, and refines the code before handing off to wrap-up. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
```

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

## Step 5: Implementation Hindsight (Decision Point)

This is NOT a thought exercise — it's an **action gate**. After the code review, explicitly ask:

> **"Given everything we've found, should we change something before shipping this?"**

Evaluate:
1. **Approach correctness** — Did we solve the right problem, or optimize for the wrong thing?
2. **Structural debt** — Did we introduce patterns we'll regret? Premature abstractions, wrong boundaries?
3. **Missing consolidation** — Opportunities to merge, deduplicate, or simplify that are obvious now?
4. **Convention drift** — Did we accidentally diverge from established project patterns?

For each finding, classify:

| Verdict | Action |
|---------|--------|
| **Change now** | Cost of fixing is low, benefit is clear — do it before proceeding |
| **Capture for later** | Real issue but not worth the churn — create an INBOX item via `/claude-tweaks:capture` |
| **Accept as-is** | Tradeoff is acceptable or the "better" approach isn't clearly better — **record the rationale** so `/claude-tweaks:wrap-up` can assess whether it's worth documenting |

If any findings are **"Change now"**, make the changes, re-run verification (Step 3), and resume.

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

## Step 7: Present Review Summary

```markdown
## Review: {spec number or description}

### Spec Compliance (spec-based only)
| Deliverable | Status |
|-------------|--------|
| {deliverable} | {done/partial/missing} |

| Acceptance Criterion | Status |
|---------------------|--------|
| {criterion} | {met/partially met/not met} |
(or: No spec — file/commit-based review.)

### Verification
- Type check: {pass/fail}
- Lint: {pass/fail}
- Tests: {pass/fail}

### Code Review Findings
| Category | Finding | Severity | Action |
|----------|---------|----------|--------|
| {convention/security/error/perf/arch/test} | {finding} | {low/medium/high} | {fixed/claude-tweaks:captured/accepted} |
(or: No findings — code is clean.)

### Implementation Hindsight
- {finding} → {change now / capture for later / accept as-is}
(or: No changes needed — approach is sound.)

### Tradeoffs Accepted
| Tradeoff | Rationale |
|----------|-----------|
| {what was accepted} | {why — the reasoning that made this acceptable} |
(or: No tradeoffs — all findings were addressed or trivial.)

> `/claude-tweaks:wrap-up` uses this section to decide whether accepted tradeoffs should be documented in CLAUDE.md, skills, or memory files. A tradeoff worth accepting once may be worth documenting as a project convention.

### Code Simplification
- {summary of simplifier changes, or "No simplifications needed"}

### Verdict
**{PASS — ready for /claude-tweaks:wrap-up}** or **{BLOCKED — issues need fixing}**
```

## Important Notes

- Spec compliance is the first gate — incomplete specs go back to `/claude-tweaks:build`, not through code review
- Verification is a hard gate — broken code blocks the entire review
- Implementation Hindsight is an action gate — "change now" items must be fixed before passing
- Code simplification runs on changed files only — never expand scope to unrelated code
- Skip review lenses that don't apply to the type of change
- This skill reviews the *current work* — for periodic codebase-wide drift detection, use `code-review-max`

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | Produces the code that /claude-tweaks:review evaluates |
| `/claude-tweaks:wrap-up` | Runs after /claude-tweaks:review passes — focuses on reflection, cleanup, and knowledge capture |
| `code-review-max` | Periodic drift detection across the whole codebase — /claude-tweaks:review is scoped to current work |
| `pr-review-checklist` | PR preparation standards — /claude-tweaks:review happens before the PR is created |
| `/claude-tweaks:capture` | /claude-tweaks:review may create INBOX items for "capture for later" findings |
