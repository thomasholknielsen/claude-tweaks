# Multi-Spec Sequential Flow

When multiple spec numbers are provided (e.g., `42,45,48`), flow runs each spec's pipeline **sequentially** in one terminal.

## Validation

Before starting, validate the spec list:

1. **Parse** — split on commas, resolve each to a spec file
2. **Prerequisites** — check that each spec's `blocked-by` is satisfied. Reject any spec with unmet prerequisites.

## Execution

Run each spec's full pipeline in order (spec 42 → spec 45 → spec 48). Each spec completes its pipeline (build → test → review → wrap-up) before the next begins. A gate failure in one spec stops the remaining specs — present what completed and what remains.

If `worktree` is specified, each spec gets its own worktree via `/superpowers:using-git-worktrees`. The worktree is finished via `/superpowers:finishing-a-development-branch` before the next spec begins.

## Multi-Spec Summary

After all specs complete (or one fails), present a consolidated summary:

```markdown
## Flow: Multi-Spec Pipeline Complete

| Spec | Build | Test | Review | Polish | Wrap-Up | Outcome |
|------|-------|------|--------|--------|---------|---------|
| {N} | passed | passed | PASS | applied + re-verified | done | Complete |
| {N} | passed | passed | PASS | skipped (no-polish) | done | Complete (no polish) |
| {N} | passed | passed | BLOCKED | — | — | Stopped at review |
| {N} | passed | passed | PASS | re-verify failed | — | Stopped at re-verify |
| {N} | — | — | — | — | — | Not started (previous spec failed) |

### Manual Steps Required (all specs)
| # | Spec | What | Where |
|---|------|------|-------|
| 1 | {N} | {description} | {source} |
(or: No manual steps required.)

### Per-Spec Details
(expand each spec's key outputs, failures, and review findings)
```
