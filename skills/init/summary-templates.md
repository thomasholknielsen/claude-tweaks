# Phase 9: Summary Templates

## Initial Mode Summary

```markdown
## Init Summary

### Verified & Consistent

What /init checked and found true about this repo and environment — the affirmative findings behind the config below. Only list checks that actually ran; mark `med`/`low` confidence detections so the user knows what to review.

| Check | Result |
|-------|--------|
| Superpowers plugin | present |
| Code simplifier | available |
| agent-browser | installed (v{X.Y.Z}) / not installed — install hint surfaced |
| Git repo | yes |
| Node (statusline) | v{X} present |
| Statusline | wired to claude-tweaks wrapper |
| Stack detected | {list} (confidence: high) |
| Architecture | {pattern} (confidence: high) |
| Maturity / doc tier | {value} / {N} (confirmed Phase 3) |
| Conventions detected | {N} grounded in observed code |

### Bootstrap (Phase 0)

| Item | Status |
|------|--------|
| Superpowers plugin | {installed/already installed} |
| Code simplifier | {available} |
| `specs/` | {created/exists} |
| `docs/plans/` | {created/exists} |
| `docs/journeys/` | {created/exists} |
| `specs/backlog/` | {created/exists} |
| `specs/INDEX.md` | {created/exists} |
| Git repo | {yes/no — warning if no} |
| Worktree directory | {configured/skipped} |
| Browser: agent-browser | {installed (vX.Y.Z) / not installed — install hint surfaced} |

### Project Classification (Phase 3)
| Dimension | Confirmed |
|-----------|-----------|
| Maturity | {greenfield/pre-launch/early-production/established} |
| Doc tier | {1/2/3} |

### Doc Registry (Phase 8.5)
| Item | Status |
|------|--------|
| `docs/REGISTRY.md` | {created/updated/skipped} |
| Registry entries | {N} docs tracked |
| Skeleton files created | {list or "none"} |

### CLAUDE.md
- {line count} lines
- Covers: {sections list}

### Skills ({count})
| Skill | Priority | Depth | Files |
|-------|----------|-------|-------|
| {name} | P1 | Full | SKILL.md |
| ... | ... | ... | ... |

### Rules ({count})
| Rule | Scoped to |
|------|-----------|
| {name} | {paths} |

### INBOX Items Captured ({count})

Items with Phase 2 context baked in, ready for the normal pipeline:

| Category | Count | Examples |
|----------|-------|---------|
| Improvement work | {N} | {e.g., "Set up CI", "Add test coverage for utils"} |
| Deferred skills | {N} | {e.g., "Create data-access skill (P2)", "Create testing skill [aspirational]"} |
| Doc work | {N} | {e.g., "Refresh README (stale commands)", "Create getting-started.md"} |
| Journey enrichment | {N} | {e.g., "Browser-test checkout flow", "Browser-test onboarding"} |

### Refinement roadmap
After 1 week of use, revisit:
1. {skill most likely to need adjustment and why}
2. {convention most likely to be incomplete}
3. {area where team input would improve the config}

Ready to write these files?
```

## Update Mode Summary

Lead with what was audited and found healthy, then the proposed changes. The **Verified & Consistent** section is not optional — it is the answer to "what did you check and decide not to touch?" Only include rows for checks that actually ran this pass; omit dimensions skipped by an early-exit (the early-exit path has its own shorter verified block in `update-mode.md`).

```markdown
## Configuration Update

### Verified & Consistent (audited — no change needed)

Everything below was checked against the current codebase and found accurate. Surfaced so you can see what was confirmed, not just what changed.

**Environment & dependencies**
| Check | Result |
|-------|--------|
| Superpowers plugin | present |
| Code simplifier | available |
| agent-browser | installed (v{X.Y.Z}) |
| Git repo | yes |
| Node (statusline) | v{X} present |
| Statusline | wired to claude-tweaks wrapper |
| Workflow dirs (`specs/`, `docs/`) | present |

**Contract markers (claude-tweaks v{X.Y}+)**
| Marker | Status |
|--------|--------|
| Pipeline section | present |
| Auto-mode flag | present |
| Bookend paragraph | present |
| Auto-mode policy block | present |
| Run-dir reference | present |

**Config accuracy (verified against codebase)**
| Area | Finding |
|------|---------|
| Stack table | matches detected stack ({list}) |
| Commands | all {N} resolve to real scripts |
| Conventions | {N} confirmed still in force |
| Skills | {N} of {M} accurate — paths + patterns still exist |
| Rules | {N} path scopes still valid |
| Doc registry | {N} entries map to live code areas |
| Journeys | {N} match current routes |

### CLAUDE.md
- {N} patches ({list: "updated Stack table", "added Don't", etc.})

### Skills Updated ({count})
| Skill | Changes |
|-------|---------|
| {name} | {1-line summary of edits} |

### Skills Created ({count})
| Skill | Priority | Rationale |
|-------|----------|-----------|
| {name} | P1 | {gap it fills} |

### Skills to Consider Removing ({count})
| Skill | Reason |
|-------|--------|
| {name} | {e.g., "project no longer uses Redis"} |

### Rules
- {N} updated, {N} created, {N} to remove

Ready to apply these changes?
```

Execute only after user confirmation.
