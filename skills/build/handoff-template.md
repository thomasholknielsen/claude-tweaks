# Common Step 7: Handoff Template

Loaded by `/claude-tweaks:build` Common Step 7 at end-of-build to render the user-facing handoff.

Render the markdown below, substituting placeholders. Generate field values from: `git log --oneline` since build start, `git diff --stat` against pre-build state, ledger entries with status `fixed`, journey files from Step 6, operational fixes from Step 5.5.

```markdown
## Build Complete: {spec number and title OR design doc topic}

### Mode
{Spec mode (spec {number}) | Design mode ({design doc filename})}

### Verification
- Type check: {pass/fail}
- Lint: {pass/fail}
- Tests: {pass/fail}

### What was built
- {summary of implemented features}

### Code simplification
- {summary of simplifications made, or "No changes needed"}

### User Journeys
- {created/updated journey name} — {summary of what changed}
(or: No user-facing journeys affected.)

### Documentation
- Updated: {doc} ({what changed})
- Flagged for wrap-up: {doc} ({reason})
(or: No documentation changes needed.)

### Blocked items (if any)
- {item} — blocked by {reason}

### Manual Steps Required
| # | What | Where |
|---|------|-------|
| 1 | {description} | {spec section / detected in `{file}`} |
(or: No manual steps — nothing to do outside the codebase.)
```

> Populated from ledger entries with phase `ops`. **In `/flow` pipeline context:** Skip this section — flow's pipeline summary handles it.

### Actions Performed table

| Action | Detail | Ref |
|--------|--------|-----|
| Implemented | {feature} — `{file}` | `{hash}` |
| Bug fix | {what was fixed} — `{file}` | `{hash}` |
| Simplified | {what} — `{file}` | `{hash}` |
| Operational | {schema push, env update} | `{hash}` |
| Journey | {created/updated} {name} — `{file}` | `{hash}` |
| Doc update | {doc} — {what changed} | `{hash}` |
| Ledger fix | {item} ({phase}) — `{file}` | `{hash}` |
