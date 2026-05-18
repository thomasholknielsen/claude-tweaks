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

> **Parallel execution:** Dispatch to `code-simplifier:code-simplifier` subagent. **Contract:** the subagent follows `_shared/subagent-output-contract.md` — minimal input scope, status line first, output template inlined.

Invoke the `code-simplifier:code-simplifier` subagent on the scoped files. Follow the **Subagent Contract** (`_shared/subagent-output-contract.md`) — minimal input (file paths + the output template, no conversation history), tier **Standard (Sonnet)**, and the literal output template below inlined verbatim in the dispatch prompt (the subagent cannot read sibling files):

```
SCOPE (required):
- Files to simplify: {space-separated relative paths from Step 1}
- Constraints: preserve all behavior; never expand scope beyond the listed files.

OUTPUT FORMAT (required):
First reply line MUST be one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.

Then return ONLY a markdown table, no preamble:

| File | Change | Lines |
|---|---|---|
| {relative path} | {one-line description of the simplification} | -N/+M |

If no simplifications were made: return literal text "No simplifications needed."
Do not add narration, headers, or summaries before or after the table.
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

### Working Directory Discipline

Apply the Working Directory Discipline rule from `_shared/subagent-output-contract.md` before any verification command. On mismatch, return **BLOCKED** to the caller; never verify from the wrong directory.

### If verification fails

Verification failure is a **BLOCKED gate** — never silently retry or self-fix. Choose one branch:

**(a) BLOCKED — default, and the only option in interactive mode:**
Return control to the caller with the failing check. Do NOT attempt a fix in-place.

```
BLOCKED
Reason: verification failed after simplification.
Failing check: {typecheck | lint | tests}
Output: {one-line summary of the failure, or path to the failure log}
Next: caller decides whether to revert the simplification, fix the regression, or stage for review.
```

**(b) Stage and continue — only in `auto` mode AND when reversibility is high:**
Write a stage entry to `{run-dir}/staged/simplify-{n}.md` naming the failing check and the file(s) involved, then append to the auto-decision log under the `## /simplify` heading in `{run-dir}/decisions.md` (per `_shared/auto-decision-log.md`):

```
- STAGED {HH:MM:SS} — Step 3 verify: {check} failed after simplifying {files}. Stage path: staged/simplify-{n}.md.
```

Surface at the Wrap-Up Review Console. Continue only if the simplification can be safely reverted via `git revert` at the console; if not, fall back to BLOCKED.

Silent self-fixing is forbidden — see `_shared/auto-mode-contract.md`.

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

## Next Actions

When invoked directly (not by a parent skill), end with:

```
1. `/claude-tweaks:review {spec}` — code review quality gate **(Recommended)**
2. `/claude-tweaks:test` — verify changes
```

When invoked by a parent, omit Next Actions — the parent handles flow control.

## Component-Skill Contract

This skill is a **component skill** — invoked by `/claude-tweaks:build` (Common Step 3) and `/claude-tweaks:review` (Step 5). Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (the parent is running inside an active pipeline run). When invoked by a parent, omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (no `$PIPELINE_RUN_DIR`, regardless of whether file paths were typed in `$ARGUMENTS` or passed inline), render Next Actions as shown above.

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
| `/claude-tweaks:design` | /design may invoke /simplify after design-quality fixes land. |
| `/claude-tweaks:help` | /help references /simplify in the workflow diagram and reference card. |
| `code-simplifier:code-simplifier` | The subagent that does the actual simplification work. /simplify is the skill wrapper that handles scope, verification, and reporting. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
| `_shared/subagent-output-contract.md` | The Working-Directory Discipline rule referenced by Step 3 verify lives here (CWD anchoring before `git` / `node --test`). |
