# Phase 5: Skill Generation Template and Guidelines

## Initial Mode: SKILL.md Template

For each approved skill, produce a SKILL.md:

```markdown
---
name: {kebab-case-name}
description: {When to use this skill — action-oriented, starts with "Use when..."}
---

# {Skill Title}

## Overview
{What this skill covers and why it exists for this project.}

## Key Patterns

### {Pattern 1 Name}
{Description + code example extracted/adapted from the actual codebase.
Include file path where the canonical example lives.}

### {Pattern 2 Name}
{Description + code example.}

## Decision Framework
{When to choose between approaches — ASCII flowchart or table if applicable.}

## Project Conventions
{Project-specific rules for this domain — the stuff that's different from the
generic approach. This is the most valuable section.}

## Common Operations
{Step-by-step for the most frequent tasks in this domain.
Include actual commands that work in this project.}

## Anti-Patterns
| Pattern | Why It Fails in This Project |
|---------|------------------------------|
| ... | {Project-specific reason, not generic advice} |

## Reference
{Links to relevant project files, external docs, or related skills.}
```

## Update Mode

For each approved drifted skill, produce **targeted edits** — not a full rewrite:

```markdown
## Skill Patches: `{skill-name}`

### Edit 1: {description}
**Section:** {section name}
**Action:** Replace / Add / Remove
**Current:** `{current text or "N/A" for additions}`
**Proposed:** `{new text}`
**Reason:** {what changed in the codebase}
```

For approved gap skills (new patterns needing new skills), generate full SKILL.md as in Initial Mode.

## Quality Gates for Generated Skills

Before finalizing each skill, verify:

- [ ] Every code example is adapted from actual codebase patterns (not generic)
- [ ] File paths referenced actually exist
- [ ] Commands referenced actually work
- [ ] Conventions described match what the codebase actually does
- [ ] No generic advice that adds no project-specific value
- [ ] Anti-patterns cite project-specific reasons, not textbook warnings
- [ ] Description starts with "Use when..." and describes a clear trigger

## Skill Depth Guide

Not every skill needs the same depth. Match depth to complexity score:

| Complexity | Depth | Sections Required |
|------------|-------|-------------------|
| 3 (High) | Full — all sections, multiple code examples, decision trees | All |
| 2 (Medium) | Standard — key patterns, conventions, common operations | Overview, Key Patterns, Conventions, Common Operations |
| 1 (Low) | Minimal — conventions and anti-patterns only | Overview, Conventions, Anti-Patterns |
