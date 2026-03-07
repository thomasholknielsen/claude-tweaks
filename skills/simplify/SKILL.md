---
name: claude-tweaks:simplify
description: Use when you want to simplify recently changed code — catches unnecessary complexity from iterative development, verbose debugging patterns, and cross-file inconsistencies. Works standalone or as a step within /claude-tweaks:build and /claude-tweaks:review.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Simplify — Code Simplification

Run the code-simplifier subagent on recently changed files. Catches complexity that accumulates during iterative development — verbose patterns from trial-and-error debugging, premature abstractions, inconsistencies across files modified by different tasks. Part of the workflow lifecycle:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
       │                                            │
[ /claude-tweaks:simplify ]                 [ /claude-tweaks:simplify ]
 (after implementation)                      (after review fixes)
```

## When to Use

- After finishing a batch of implementation work — clean up before review
- After fixing review findings — simplify the fixes
- After a debugging session — remove trial-and-error artifacts
- After a refactor — verify the result is actually simpler
- During `/claude-tweaks:build` Common Step 3 — invoked automatically
- During `/claude-tweaks:review` Step 5 — invoked automatically

## Input

`$ARGUMENTS` controls scope.

### Standalone (invoked directly):

1. **File paths** — specific files or directories to simplify
2. **No arguments** — use `git diff --name-only` against the base branch or recent commits

```
/claude-tweaks:simplify                       → simplify all recently changed files
/claude-tweaks:simplify src/api/ src/db/      → simplify files in those directories
/claude-tweaks:simplify src/utils/validate.ts → simplify a specific file
```

### Pipeline context (invoked by parent skill):

The parent skill passes:
- **File scope** — files changed during the build or review fixes (`git diff --name-only`)

The simplifier always operates on the provided scope. It never expands to unrelated code.

## Step 1: Resolve Scope

1. **From arguments** — use the provided file paths or directories
2. **From git diff** — `git diff --name-only` (or against the base branch) to identify changed files
3. **From parent** — accept the file list passed by the parent skill

Filter to source files only — skip generated files, lock files, and non-code artifacts.

If no files are in scope, state: "No changed files to simplify." and stop.

## Step 2: Run Code Simplifier

Invoke the `code-simplifier:code-simplifier` subagent on the scoped files:

```
Task tool with subagent_type="code-simplifier:code-simplifier"
```

**What it catches:**
- Unnecessary complexity from iterative development
- Verbose patterns from trial-and-error debugging
- Leftover defensive code from abandoned approaches
- Inconsistent naming or structure across changed files
- Dead paths, redundant conditionals, over-abstraction
- Cross-task patterns (when multiple tasks modified related files):
  - Inconsistent naming or patterns between files modified by different tasks
  - Opportunities to consolidate similar code written by different subagents
  - Unnecessary complexity that accumulated across iterative implementation

**Constraints:**
- Preserves all functionality — no behavioral changes
- Scope is strictly the provided files — never simplify unrelated code

## Step 3: Verify

If the simplifier made changes, run the shared verification procedure from `verification.md` in the `/claude-tweaks:test` skill's directory. This runs type checking, linting, and tests.

If verification fails, fix the issue — the simplification may have introduced a regression.

## Step 4: Report

### Changes made

```
### Code Simplification

| # | File | Change | Lines |
|---|------|--------|-------|
| 1 | {file} | {description of simplification} | {-N/+M} |
| 2 | {file} | {description} | {-N/+M} |

Verification: {pass/fail}
```

### No changes

```
No simplifications needed — code is already clean.
```

### Standalone Next Actions

When invoked directly (not by a parent skill), end with:

```
### Next Actions

1. `/claude-tweaks:review {spec}` — code review quality gate **(Recommended)**
2. `/claude-tweaks:test` — verify changes
```

When invoked by a parent, omit Next Actions — the parent handles flow control.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Simplifying unrelated code | Scope creep — only simplify files changed in the current work |
| Making behavioral changes | Simplification preserves behavior — if behavior needs changing, that's a different skill |
| Skipping verification after changes | Simplifications can introduce regressions — always verify |
| Running on generated files | Generated code should be regenerated, not hand-simplified |
| Over-simplifying at the cost of readability | Simpler isn't always better — dense one-liners can be harder to read than explicit code |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | Invokes /simplify after implementation (Common Step 3). Passes files changed during build. |
| `/claude-tweaks:review` | Invokes /simplify after review fixes (Step 5). Passes files changed during review. |
| `/claude-tweaks:test` | /simplify uses the shared verification procedure from /test's `verification.md`. |
| `code-simplifier:code-simplifier` | The subagent that does the actual simplification work. /simplify is the skill wrapper that handles scope, verification, and reporting. |
