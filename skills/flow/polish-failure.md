# Polish-Broke-Verification Failure Card

When the re-verify gate fails after polish modified code, the failure card uses this specific shape (instead of the generic "On Gate Failure" template in SKILL.md):

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

## When to render this card vs. the generic one

Use this specific shape when the gate that failed is **re-verify (post-polish)**. The polish modifications section is the critical differentiator — the user needs `git diff` context for the polish commit to triage. Generic gate-failure cards do not include this section.

All other gate failures (build, stories, test, review) use the generic "On Gate Failure" template in SKILL.md.
