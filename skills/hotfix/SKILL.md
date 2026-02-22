---
name: claude-tweaks:hotfix
description: Use for emergency fixes that need to bypass the full capture → challenge → specify → build pipeline. Fast path from issue identification to verified fix.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." End skills with a recommended next step, not a navigation menu.


# Hotfix — Emergency Fast Path

Streamlined workflow for critical fixes that can't wait for the full pipeline. Skips capture, challenge, specify, and brainstorming — goes straight from problem to fix to verification.

```
Normal:  /capture → /challenge → brainstorming → /specify → /build → /review → /wrap-up

Hotfix:  [ /claude-tweaks:hotfix ] ─→ fix ─→ test ─→ lightweight review ─→ done
           ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- Production is broken and needs an immediate fix
- A critical bug was discovered that blocks other work
- A security vulnerability needs patching now
- A deployment is failing and needs a quick correction
- The user says "hotfix", "urgent fix", "production is down", or "this needs to be fixed now"

### When NOT to Use

- The fix requires significant architectural changes (use the full pipeline)
- You're not sure what the root cause is (investigate first)
- The fix touches many files across multiple modules (too risky for fast path)
- There's no urgency — use `/claude-tweaks:build` instead

## Input

`$ARGUMENTS` = description of the issue, error message, or file path.

### Resolve the input:

1. **Error message or stack trace** — identify the failing code from the trace
2. **Issue description** (e.g., "login page returns 500") — search the codebase for relevant code
3. **File path** (e.g., `src/api/auth.ts`) — focus the fix on that file
4. **No arguments** — ask the user to describe the issue

## Step 1: Understand the Issue

Quickly scope the problem:

1. **Reproduce** — if an error message or behavior is described, verify it (check logs, run the failing test, hit the endpoint)
2. **Identify root cause** — trace from symptom to source. Read the relevant files.
3. **Assess blast radius** — how many files need to change? If more than 5, this might not be a hotfix.

### Blast Radius Gate

| Files affected | Verdict |
|---------------|---------|
| 1-3 files | Proceed as hotfix |
| 4-5 files | Proceed with caution — confirm with user |
| 6+ files | **STOP** — this is too big for a hotfix. Recommend `/claude-tweaks:build` instead. |

Present the assessment:

```
Issue: {one-line description}
Root cause: {what's wrong and where}
Fix scope: {N} file(s) — {list them}
Risk: {low/medium/high}

Proceed with hotfix?
1. Yes — fix it now
2. More context — I need to investigate further
3. Not a hotfix — use the full pipeline instead
```

## Step 2: Implement the Fix

Apply the minimal change needed to resolve the issue. Key principles:

- **Minimal diff** — change only what's necessary. No refactoring, no cleanup, no "while I'm here" improvements.
- **No new abstractions** — hotfixes are not the time to introduce new patterns.
- **Preserve behavior** — fix the bug without changing anything else.
- **Add a regression test** — write a test that would have caught this bug. This is not optional.

### Commit Strategy

Commit the fix on the current branch with a clear message:

```
Hotfix: {one-line description of what was fixed}

Root cause: {brief explanation}
```

## Step 3: Verify

Run the project's verification checks:

> **Parallel execution:** Run type checking, linting, and tests as parallel Bash calls — they are independent. All must pass.

- Type checking
- Linting
- Tests (full suite — not just the regression test)

Check CLAUDE.md for the project's specific commands.

**Gate:** All checks must pass. If any fail, fix before proceeding.

## Step 4: Lightweight Review

A hotfix still needs review, but a lighter version than `/claude-tweaks:review`:

### Security check
- Did the fix introduce any input validation gaps?
- Are there injection risks?
- Is auth/authz still intact?

### Regression check
- Does the regression test actually test the failure case?
- Could the fix break related functionality?
- Check tests for adjacent features.

### Present the review:

```markdown
## Hotfix Review

**Issue:** {description}
**Fix:** {what was changed}
**Files:** {list}

### Verification
- Type check: {pass/fail}
- Lint: {pass/fail}
- Tests: {pass/fail}
- Regression test: {pass/fail}

### Review
- Security: {no concerns / {concern}}
- Regression risk: {low / {risk}}

### Verdict
**{SHIP IT}** or **{NEEDS ATTENTION — {reason}}**
```

## Step 5: Wrap Up

Hotfixes skip the full wrap-up, but still need minimal closure:

1. **Document** — if the root cause reveals a systemic issue, capture it:
   - Add to INBOX if it needs a full spec (`/claude-tweaks:capture`)
   - Add to `specs/DEFERRED.md` if it's a known improvement
   - Add to CLAUDE.md Don'ts if it's a pattern to avoid

2. **Rollback plan** — note how to revert if the fix causes new issues:
   ```
   Rollback: git revert {commit hash}
   ```

**Recommended next:** Push the fix and monitor. If the root cause is systemic, run `/claude-tweaks:capture` to create an INBOX item for a proper fix.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Hotfixing without understanding root cause | You'll fix the symptom, not the disease — it'll come back |
| Expanding scope during a hotfix | Hotfixes are minimal — save improvements for the full pipeline |
| Skipping the regression test | Without a test, the same bug will return |
| Skipping verification | A broken fix is worse than the original bug |
| Using hotfix for non-urgent work | The fast path trades thoroughness for speed — only worth it for real emergencies |
| Large-scope changes as a hotfix | 6+ files means too much risk — use the full pipeline |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | The full-ceremony alternative — use when the fix is too big or complex for hotfix |
| `/claude-tweaks:test` | /hotfix runs verification internally — /test is the standalone equivalent |
| `/claude-tweaks:review` | /hotfix does a lightweight review — /review is the full quality gate |
| `/claude-tweaks:capture` | /hotfix may create INBOX items for systemic issues discovered during the fix |
| `/claude-tweaks:help` | /help can recommend /hotfix when urgent issues are identified |
| `specs/DEFERRED.md` | /hotfix routes systemic improvements here with origin context |
