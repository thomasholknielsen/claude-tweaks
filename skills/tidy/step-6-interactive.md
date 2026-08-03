# Tidy — Step 6 Interactive Mode

Step 6's interactive branch; `step-6-auto.md` is its twin. `SKILL.md` resolves `--dry-run` before
reading either — under it, "Apply all" logs would-be entries instead of executing Step 7.

Present all collected findings as a single report. Every item has a pre-filled recommendation from the scanning steps.

```markdown
## Tidy Report — {date}

### Actions

| # | Type | Item | Recommendation |
|---|------|------|---------------|
| 1 | Backlog | "{title}" (4+ weeks) | Delete — stale |
| 2 | Backlog | "{title}" (2 weeks) | Keep — still fresh |
| 3 | Backlog | "{title}" (clean, ready) | Promote — /claude-tweaks:specify #{n} |
| 4 | Backlog | "{title}" (overlaps #{m}) | Absorb → #{m} |
| 5 | Parked | "{title}" (valid, not timely) | Defer — trigger: {condition} |
| 6 | Parked | "{title}" (trigger met) | Promote — trigger fired |
| 7 | Scoring | "{title}" (ready, unscored) | Flag for scoring — /claude-tweaks:specify #{n} |
| 8 | Blocked | "{title}" (bot:blocked) | Re-triage — /claude-tweaks:backlog refine |
| 9 | Legacy | "{title}" (carries tier:approved) | Retired vocabulary — needs migration/re-triage |
| 10 | Sizing | "{title}" (ready, 12 tasks implied) | Split into two records |
| 11 | Design doc | "{filename}" (specified) | Delete |
| 12 | Plan | "{filename}" (orphaned) | Delete |
| 13 | Worktree | "{path}" (merged) | Remove |
| 14 | Branch | "build/{name}" (merged) | Delete |
| 15 | Backlog (unsynced) | "{title}" — local-only under `work-backend: github-issues` | Sync to GitHub |

### Cross-Spec Patterns (if any)

| # | Pattern | Seen In | Recommended |
|---|---------|---------|-------------|
| 16 | {description} | Specs {list} | Add rule to CLAUDE.md |
| 17 | {description} | Specs {list} | Promote to spec |

*Patterns are informational — they highlight systemic issues across multiple specs. Address them to prevent the same findings from recurring.*

### Summary
- Backlog: {X} records ({Y} stale, {Z} ready to promote)
- Parked: {X} records ({Y} trigger-met, {Z} still waiting)
- Ready, unscored: {N} — needs `/claude-tweaks:specify`
- `bot:blocked`: {N} — needs `/claude-tweaks:backlog refine`
- Legacy taxonomy: {N} records — needs migration
- Plans to clean: {D} design docs, {E} execution plans
- Git cleanup: {F} worktrees, {G} build branches
```

Immediately after presenting the report above, call `AskUserQuestion`:

- `question`: `"How do you want to handle these tidy actions?"`, `header`: `"Tidy actions"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply all recommendations shown above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

If "Override specific items" is chosen, the follow-up (#s and target values) is ordinary free-text conversation in the next message, per CLAUDE.md's Multi-item decisions convention — not the tool's built-in `Other` field.

Items recommended as "Keep", flagged for scoring/re-triage, or flagged as legacy taxonomy are included for visibility but require no mutation. Only items with an active recommendation (delete, defer, absorb, promote, sync, fix) are executed.

