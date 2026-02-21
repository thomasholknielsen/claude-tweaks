# Phase 7: Summary Templates

## Initial Mode Summary

```markdown
## Generated Configuration

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

### Not generated (deferred)
- {skill}: {reason to defer}

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
