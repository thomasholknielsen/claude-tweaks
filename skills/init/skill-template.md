# Phase 6: Skill Generation Template and Guidelines

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

For each skill classified **drifted** or **gap** in Phase 3, apply the full procedure in `_shared/harness-health-analysis.md` — the same procedure `/claude-tweaks:wrap-up`'s Skills curation row and the standalone `/claude-tweaks:harness-health` routine use for judging drift and proposing patches. That file owns the dimension check, evidence pre-checks, the tightened patch format (exact `oldString`/`newString`, required for reliable auto-apply), the new-skill qualification gate, and the verify gate — do not duplicate them here.

For approved gap skills that qualify as new-skill candidates (per the shared fragment's qualification gate), generate the full SKILL.md as in Initial Mode, above — the shared fragment's `proposedBody` field uses that same template.

### Cursor Participation

Before classifying a skill in Phase 1u/Phase 3, check whether the skill was recently audited: a skill with `lastAuditedMs` within the last 90 days was recently verified by `/claude-tweaks:wrap-up` or the `/claude-tweaks:harness-health` routine — mark it "recently verified — skipped" rather than re-judging it from scratch in Phase 2.

Harness-health's cursors now live on the durable `health-state` git branch, not local disk — see `_shared/health-state.md` for the storage contract. This makes the read side a best-effort optimization rather than a guaranteed local file check: there is no local `cursors.json` to read directly, and no single-purpose CLI command reads one cursor entry in isolation. To check a specific `skill:<id>` entry, either read the branch directly with git plumbing (no `gh` needed for a read):

```bash
git fetch origin health-state && git show origin/health-state:harness-health/cursors.json
```

...and parse the `skill:<id>` key's `lastAuditedMs` out of the resulting JSON — or, if the `health-state` branch isn't readily fetchable in the current environment (e.g. no network, no remote configured), treat this check as skippable and fall through to judging the skill from scratch in Phase 2. Either way, the 90-day freshness semantics are unchanged — only where and how the cursor is read has moved.

After Phase 6 patches a drifted skill, record the audit so wrap-up and the routine see it too (this write path is unchanged — `bin/harness-health.js` handles the durable-state read-modify-write internally):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" validate-findings <findings.json> --root . --target <skill-id> --kind skill
```

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
