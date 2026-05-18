# Flow — Failure Cards

Loaded by `/claude-tweaks:flow` Step 4 **only when a gate fails**. These templates are never rendered on the success path; the Pipeline Summary template in SKILL.md handles successful completion.

Two templates live here. Pick by failure shape:

| Failure | Template |
|---|---|
| Re-verify gate failed after polish modified code | "Polish broke verification" below |
| Any other gate (build / stories / test / review / wrap-up) | "Generic gate failure" below |

## Generic gate failure

```markdown
## Flow: Pipeline Stopped

### Completed
- {step}: {outcome}

### Failed at: {step}
{failure details from the step's output}

### Open Items (at time of failure)
{current ledger contents — so the user sees what's been tracked}

### Manual Steps Required (collected so far)
| # | What | Where |
|---|------|-------|
| 1 | {description} | {source} |
(or: No manual steps collected yet.)

> These were detected before the pipeline stopped. Address them alongside the fix.

### Actions Performed

{Include rows from completed phases before the failure. Omit when pipeline failed at the first step.}

| Action | Detail | Ref |
|--------|--------|-----|
| {rows from completed phases} | ... | ... |

### Next Actions

1. `/claude-tweaks:flow {spec} {failed-step}` — resume from {failed step} **(Recommended)**
2. `/claude-tweaks:{step} {spec}` — run {failed step} manually for more control
{If test failed:}
3. `/claude-tweaks:test` — re-verify after fixes
{If re-verify failed (polish broke verification):}
3. `git diff` — inspect the polish modifications that broke verification
4. `git revert HEAD` — revert the polish commit if it's not salvageable, then retry with `/claude-tweaks:flow {spec} no-polish` to skip polish entirely on the next run
```

## Polish broke verification

Use this specific shape (instead of the generic template above) when the re-verify gate fails after polish modified code. The polish-modifications section is the critical differentiator — the user needs `git diff` context for the polish commit to triage.

```markdown
## Flow: Pipeline Stopped — Polish broke verification

### Completed
- build: passed
- stories: {outcome}
- test: passed
- review: PASS
- polish: invoked {N} commands ({list}), modified {M} files

### Failed at: re-verify (post-polish)
{verification failures from /test skip-qa output — types/lint/test errors}

### Polish modifications
{git diff --stat output for the polish commit(s)}

### Open Items (at time of failure)
{current ledger contents}

### Next Actions

1. Inspect the polish modifications: `git diff {polish-commit-range}` **(Recommended)**
2. Revert the polish commit and resume without polish: `git revert {polish-commit}` then `/claude-tweaks:flow {spec} no-polish wrap-up`
3. Fix the verification failure manually, then resume: `/claude-tweaks:flow {spec} polish`

> The re-verify cycle cap is 1 per flow run. Resuming with `/flow {spec} polish` starts a fresh cycle.
```
