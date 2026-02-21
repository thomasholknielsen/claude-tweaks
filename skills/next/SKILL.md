---
name: claude-tweaks:next
description: Use to see workflow status and get a recommendation for what to do next — scans INBOX, design docs, specs, and recent work
---
> **Interaction style:** Present choices as numbered options (1, 2, 3…) so the user can reply with just a number. Do the same when suggesting the next skill to run.


# Next

Scan the full workflow state and recommend the logical next action. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
    ↑                                                            |
    └──────────────── /claude-tweaks:next (what should I do?) ←────────────────┘
```

## Step 1: Scan Pipeline Stages

### Stage 1: INBOX (`specs/INBOX.md`)

- Count total items
- Flag stale items (> 4 weeks old)
- Identify items marked as related to existing specs
- Flag items with baked-in assumptions (solution-oriented phrasing) → candidates for `/claude-tweaks:challenge`

### Stage 2: Design Docs (`docs/plans/*-design.md`)

- Find design docs that haven't been specified yet (no `> Status: Specified` header)
- These are brainstorming outputs waiting for `/claude-tweaks:specify`

### Stage 3: Specs Ready to Build (`specs/INDEX.md` + `specs/*.md`)

- Find specs where all prerequisites are met (blocking specs are complete)
- Check YAML frontmatter for `status: not-started` with empty or satisfied `blocked-by`
- Check which tier they're in (lower tier = higher priority)
- Check if a plan already exists in `docs/plans/` (ready for immediate `/claude-tweaks:build`)

### Stage 4: Specs In Progress

- Check recent git commits for spec references
- Check frontmatter for `status: in-progress`
- These may need `/claude-tweaks:build` resumed or `/claude-tweaks:review` run

### Stage 5: Specs Awaiting Review

- Find specs that appear fully implemented but haven't been reviewed yet
- These need `/claude-tweaks:review` before `/claude-tweaks:wrap-up`

### Stage 6: Specs Awaiting Wrap-Up

- Find specs that have been reviewed (review commits/artifacts exist) but not wrapped up

### Stage 7: Maintenance Signals

- INBOX has 10+ items → suggest `/claude-tweaks:tidy`
- Plans older than 4 weeks with no matching spec progress → flag
- More than 3 design docs unspecified → suggest a `/claude-tweaks:specify` session

## Step 2: Present Dashboard

```markdown
## Workflow Status

### Pipeline
| Stage | Count | Action |
|-------|-------|--------|
| INBOX items | {N} ({M} stale) | `/claude-tweaks:capture` to add, `/claude-tweaks:tidy` if stale |
| INBOX items needing debiasing | {N} | `/claude-tweaks:challenge {topic}` |
| Design docs unspecified | {N} | `/claude-tweaks:specify {topic}` |
| Specs ready to build | {N} | `/claude-tweaks:build {number}` |
| Specs in progress | {N} | Resume `/claude-tweaks:build` or check status |
| Specs awaiting review | {N} | `/claude-tweaks:review {number}` |
| Specs awaiting wrap-up | {N} | `/claude-tweaks:wrap-up {number}` |

### Ready to Build (priority order)
| Spec | Title | Tier | Has Plan? |
|------|-------|------|-----------|
| {N} | {title} | {tier} | {yes/no} |

### Needs Attention
| Item | Issue | Suggested Action |
|------|-------|-----------------|
| {item} | {issue} | {action} |

### What's Next?

Pick an action (reply with the number):

1. {recommended action with command} — {brief rationale} ⭐ Recommended
2. {alternative action} — {why this is also viable}
3. {another option if applicable}
4. Nothing right now — pipeline is healthy
```

## Recommendation Logic

Priority order:

1. **Specs awaiting review** — review completed work before it goes stale
2. **Specs awaiting wrap-up** — wrap up reviewed work (captures learnings while fresh)
3. **Specs in progress** — finish what's started before starting new work
4. **Design docs unspecified** — specify before building (don't let designs go stale)
5. **Specs ready to build** — pick the highest-priority spec with met prerequisites
6. **INBOX review** — if inbox is stale, suggest `/claude-tweaks:tidy` before new brainstorming
7. **Challenge + Brainstorming** — if pipeline is empty, suggest promoting an INBOX item; if it has baked-in assumptions, run `/claude-tweaks:challenge` first, then `brainstorming`
8. **Nothing to do** — if everything is clean, say so

### Tie-Breaking

When multiple specs are ready to build at the same tier:
- Prefer specs that unblock other specs (check dependency graph)
- Prefer smaller specs (faster feedback loop)
- Prefer specs with existing plans (less setup needed)

### Detecting Items That Need `/claude-tweaks:challenge`

An INBOX item likely needs debiasing when it:
- Names a specific technology as the solution (e.g., "Add Redis caching" instead of "Improve response times")
- Frames the problem as a solution (e.g., "Build a microservice for X" vs "X is too slow")
- Contains strong assumptions about the approach without exploring alternatives

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | Feeds items that /claude-tweaks:next surfaces |
| `/claude-tweaks:challenge` | /claude-tweaks:next flags items with baked-in assumptions for debiasing |
| `/claude-tweaks:specify` | /claude-tweaks:next flags unspecified design docs |
| `/claude-tweaks:build` | /claude-tweaks:next recommends which spec to build |
| `/claude-tweaks:review` | /claude-tweaks:next flags specs awaiting review |
| `/claude-tweaks:wrap-up` | /claude-tweaks:next flags specs awaiting wrap-up |
| `/claude-tweaks:tidy` | /claude-tweaks:next suggests /claude-tweaks:tidy when maintenance is needed |
