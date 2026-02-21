---
name: next
description: Use to see workflow status and get a recommendation for what to do next — scans INBOX, design docs, specs, and recent work
---

# Next

Scan the full workflow state and recommend the logical next action. Part of the workflow lifecycle:

```
/capture → /challenge → brainstorming → /specify → /build → /review → /wrap-up
    ↑                                                            |
    └──────────────── /next (what should I do?) ←────────────────┘
```

## Step 1: Scan Pipeline Stages

### Stage 1: INBOX (`specs/INBOX.md`)

- Count total items
- Flag stale items (> 4 weeks old)
- Identify items marked as related to existing specs
- Flag items with baked-in assumptions (solution-oriented phrasing) → candidates for `/challenge`

### Stage 2: Design Docs (`docs/plans/*-design.md`)

- Find design docs that haven't been specified yet (no `> Status: Specified` header)
- These are brainstorming outputs waiting for `/specify`

### Stage 3: Specs Ready to Build (`specs/INDEX.md` + `specs/*.md`)

- Find specs where all prerequisites are met (blocking specs are complete)
- Check YAML frontmatter for `status: not-started` with empty or satisfied `blocked-by`
- Check which tier they're in (lower tier = higher priority)
- Check if a plan already exists in `docs/plans/` (ready for immediate `/build`)

### Stage 4: Specs In Progress

- Check recent git commits for spec references
- Check frontmatter for `status: in-progress`
- These may need `/build` resumed or `/review` run

### Stage 5: Specs Awaiting Review

- Find specs that appear fully implemented but haven't been reviewed yet
- These need `/review` before `/wrap-up`

### Stage 6: Specs Awaiting Wrap-Up

- Find specs that have been reviewed (review commits/artifacts exist) but not wrapped up

### Stage 7: Maintenance Signals

- INBOX has 10+ items → suggest `/tidy`
- Plans older than 4 weeks with no matching spec progress → flag
- More than 3 design docs unspecified → suggest a `/specify` session

## Step 2: Present Dashboard

```markdown
## Workflow Status

### Pipeline
| Stage | Count | Action |
|-------|-------|--------|
| INBOX items | {N} ({M} stale) | `/capture` to add, `/tidy` if stale |
| INBOX items needing debiasing | {N} | `/challenge {topic}` |
| Design docs unspecified | {N} | `/specify {topic}` |
| Specs ready to build | {N} | `/build {number}` |
| Specs in progress | {N} | Resume `/build` or check status |
| Specs awaiting review | {N} | `/review {number}` |
| Specs awaiting wrap-up | {N} | `/wrap-up {number}` |

### Ready to Build (priority order)
| Spec | Title | Tier | Has Plan? |
|------|-------|------|-----------|
| {N} | {title} | {tier} | {yes/no} |

### Needs Attention
| Item | Issue | Suggested Action |
|------|-------|-----------------|
| {item} | {issue} | {action} |

### Recommendation
**Next action:** {specific recommendation with command}
**Why:** {brief rationale}
```

## Recommendation Logic

Priority order:

1. **Specs awaiting review** — review completed work before it goes stale
2. **Specs awaiting wrap-up** — wrap up reviewed work (captures learnings while fresh)
3. **Specs in progress** — finish what's started before starting new work
4. **Design docs unspecified** — specify before building (don't let designs go stale)
5. **Specs ready to build** — pick the highest-priority spec with met prerequisites
6. **INBOX review** — if inbox is stale, suggest `/tidy` before new brainstorming
7. **Challenge + Brainstorming** — if pipeline is empty, suggest promoting an INBOX item; if it has baked-in assumptions, run `/challenge` first, then `brainstorming`
8. **Nothing to do** — if everything is clean, say so

### Tie-Breaking

When multiple specs are ready to build at the same tier:
- Prefer specs that unblock other specs (check dependency graph)
- Prefer smaller specs (faster feedback loop)
- Prefer specs with existing plans (less setup needed)

### Detecting Items That Need `/challenge`

An INBOX item likely needs debiasing when it:
- Names a specific technology as the solution (e.g., "Add Redis caching" instead of "Improve response times")
- Frames the problem as a solution (e.g., "Build a microservice for X" vs "X is too slow")
- Contains strong assumptions about the approach without exploring alternatives

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/capture` | Feeds items that /next surfaces |
| `/challenge` | /next flags items with baked-in assumptions for debiasing |
| `/specify` | /next flags unspecified design docs |
| `/build` | /next recommends which spec to build |
| `/review` | /next flags specs awaiting review |
| `/wrap-up` | /next flags specs awaiting wrap-up |
| `/tidy` | /next suggests /tidy when maintenance is needed |
