# Phase 9: Summary Templates

## Initial Mode Summary

```markdown
## Init Summary

### Bootstrap (Phase 0)

| Item | Status |
|------|--------|
| Superpowers plugin | {installed/already installed} |
| Code simplifier | {available} |
| `specs/` | {created/exists} |
| `docs/plans/` | {created/exists} |
| `docs/journeys/` | {created/exists} |
| `specs/INBOX.md` | {created/exists} |
| `specs/DEFERRED.md` | {created/exists} |
| `specs/INDEX.md` | {created/exists} |
| Git repo | {yes/no — warning if no} |
| Worktree directory | {configured/skipped} |
| Browser: playwright-cli | {installed/not installed/skipped} |
| Browser: Chrome MCP | {available/not available/skipped} |

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

```markdown
## Configuration Update

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

### No changes needed
- {list items that were audited and found healthy}

Ready to apply these changes?
```

Execute only after user confirmation.
