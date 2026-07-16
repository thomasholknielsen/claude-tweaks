# Flow — Failure Cards

Loaded by `/claude-tweaks:flow` Step 4 **only when a gate fails**. These templates are never rendered on the success path; the Pipeline Summary template in SKILL.md handles successful completion.

Two templates live here. Pick by failure shape:

| Failure | Template |
|---|---|
| Re-verify gate failed after polish modified code | "Polish broke verification" below |
| Any other gate (build / stories / test / review / wrap-up) | "Generic gate failure" below |

**Claims held by a record-mode run:** when the stopped run holds issue claims
(`refs/claims/issue-{issue}`, claimed by `/claude-tweaks:dispatch` before hand-off, per
`_shared/issue-claims.md`), the card must OFFER release — never auto-release. Resuming is the
recommended next action, and a resumed run needs its claims intact; an unreleased claim ages
out via TTL anyway.

When the stop occurs, post a *blocked* checkpoint comment to each claimed issue so a stalled
issue carries a resumable breadcrumb (plain text, no marker — `claimStatus` ignores it):

```bash
gh issue comment "$ISSUE" --body "Blocked at {gate}: {one-line reason}. Run {runId}; claim active until {expiry} unless released."
```

Compute `{expiry}` from this run's claim comment (`claimedAt` + `ttlHours`).

Posting is automatic (a reversible network write) and each post logs to `decisions.md`.
Release remains offered-only — see below. When claims are held, append this as an
additional `AskUserQuestion` option to whichever template's Next Actions call applies
— not as a separate freestanding numbered item:

- `label`: `"Release claims"`, `description`: `"Release held claims if you will not resume (reason failed: {gate}): gh api -X DELETE \"repos/{owner}/{repo}/git/refs/claims/issue-{issue}\", after the ownership check (_shared/issue-claims.md, 'Release triggers') + release comment per _shared/issue-claims.md, then best-effort gh issue edit \"$ISSUE\" --remove-label bot:in-progress (every release removes the cosmetic claim mirror, regardless of outcome) — otherwise they expire after the TTL (72h default). Grants (auto:build/auto:merge) are untouched by a failed-gate release — see issue-claims.md's Release triggers table; grant removal is scoped to a merged:/pr-opened: outcome only, so the record stays eligible for a future dispatch retry."`

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
```

### Next Actions

Close the template's fence above, then call `AskUserQuestion` with the applicable options as unfenced prose:

- `question`: `"How do you want to proceed?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Resume (Recommended)"`, `description`: `"/claude-tweaks:flow {spec} {failed-step} — resume from {failed step}"`
- Option 2 — `label`: `"Run manually"`, `description`: `"/claude-tweaks:{step} {spec} — run {failed step} manually for more control"`
- Option 3 (if test failed) — `label`: `"Re-verify"`, `description`: `"/claude-tweaks:test — re-verify after fixes"`
- Option 4 (if issue claims are held) — the claims-release option described above

A re-verify failure after polish (the "polish broke verification" shape) never reaches this template — per the routing table above, it always routes to the "Polish broke verification" template below, which owns the dedicated `git diff` / `git revert` conversion for that shape. That branch is dropped here rather than duplicated. With it dropped, the realistic maximum for this call is base 2 + "if test failed" (1) + claims-release (1) = 4 options, exactly at `AskUserQuestion`'s 4-option cap — never assemble a 5th.

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
```

### Next Actions

Close the template's fence above, then call `AskUserQuestion` with the options in the same order, option 1 labeled `(Recommended)`, as unfenced prose:

- `question`: `"How do you want to proceed?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Inspect diff (Recommended)"`, `description`: `"git diff {polish-commit-range} — inspect the polish modifications that broke verification"`
- Option 2 — `label`: `"Revert + resume"`, `description`: `"git revert {polish-commit} then /claude-tweaks:flow {spec} no-polish wrap-up — revert the polish commit and resume without polish"`
- Option 3 — `label`: `"Fix manually"`, `description`: `"Fix the verification failure manually, then resume: /claude-tweaks:flow {spec} polish"`

> The re-verify cycle cap is 1 per flow run. Resuming with `/claude-tweaks:flow {spec} polish` starts a fresh cycle.
