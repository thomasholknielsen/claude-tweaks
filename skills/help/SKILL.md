---
name: claude-tweaks:help
description: Use when you need a quick reference for available commands, want to see workflow status, or need a recommendation for what to do next.
---
> **Interaction style:** Present choices as numbered options (1, 2, 3…) so the user can reply with just a number. Do the same when suggesting the next skill to run.


# Help — Quick Reference + Workflow Dashboard

One-stop reference and status dashboard for the workflow system. Combines command help, pipeline scanning, and next-step recommendations.

```
/claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
    ↑                                                                                                                                            |
    └──────────────────────────────────── [ /claude-tweaks:help ] (dashboard + reference) ←──────────────────────────────────────────────────────┘
                                            ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- You need a quick reference for available commands and their syntax
- You want to see what's in the pipeline and what needs attention
- You're unsure what to do next in the workflow
- You want a recommendation based on current pipeline state
- After completing a batch of work, to check what's unblocked

## Input

`$ARGUMENTS` controls what to show:

| Argument | Behavior |
|----------|----------|
| *(none)* | Full dashboard: cheat sheet + status scan + recommendation |
| `status` | Pipeline status scan only (skip cheat sheet) |
| `commands` | Quick reference cheat sheet only (skip scan) |
| *spec number or topic* | Targeted status for that specific spec/topic |

---

## Section 1: Quick Reference Cheat Sheet

*(Skip if `$ARGUMENTS` = `status`)*

### Lifecycle Skills

These run in order — each skill feeds into the next.

| # | Command | Purpose | Accepts |
|---|---------|---------|---------|
| 1 | `/claude-tweaks:setup` | Bootstrap workflow directories and dependencies | — |
| 2 | `/claude-tweaks:codebase-onboarding` | Generate CLAUDE.md, skills, and rules for a project | path, URL, `update` |
| 3 | `/claude-tweaks:capture` | Brain-dump ideas into INBOX | idea text |
| 4 | `/claude-tweaks:challenge` | Debias a problem statement before brainstorming | INBOX item, topic |
| 5 | `/claude-tweaks:specify` | Decompose a design doc into agent-sized specs | design doc path, topic, INBOX ref |
| 6 | `/claude-tweaks:build` | Implement a spec or design doc end-to-end | spec number, design doc path, topic |
| 7 | `/claude-tweaks:review` | Quality gate — verification, code review, simplification | spec number, file paths |
| 8 | `/claude-tweaks:wrap-up` | Reflection, knowledge capture, artifact cleanup | spec number |

### Utility Skills

| Command | Purpose | Accepts |
|---------|---------|---------|
| `/claude-tweaks:help` | This dashboard — commands, status, recommendations | `status`, `commands`, spec/topic |
| `/claude-tweaks:tidy` | Periodic backlog hygiene | — |
| `/claude-tweaks:flow` | Automated pipeline: build → review → wrap-up | spec/path `[steps]` |

### Superpowers (External Plugin)

| Command | Purpose | Used by |
|---------|---------|---------|
| `brainstorming` | Explore solutions for a debiased problem | After `/claude-tweaks:challenge` |
| `writing-plans` | Create TDD execution plan from a spec | `/claude-tweaks:build` |
| `subagent-driven-development` | Execute a plan with implementer + reviewer subagents | `/claude-tweaks:build` |

### Artifact Lifecycle

```
INBOX item ──→ Brief ──→ Design Doc ──→ Spec ──→ Code
  /capture    /challenge  brainstorming  /specify  /build
                                           ↓
                                    (deletes brief
                                     + design doc)

Code ──→ Review Summary ──→ Learnings routed ──→ Clean slate
 /build      /review            /wrap-up
                                  ↓
                           (deletes spec
                            + plans)
```

---

## Section 2: Pipeline Status Scan

*(Skip if `$ARGUMENTS` = `commands`)*

Scan the full workflow state across all pipeline stages.

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

### Present Dashboard

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
```

---

## Section 3: Recommendation

*(Always included unless `$ARGUMENTS` = `commands`)*

### Priority Order

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

### Present Recommendation

```markdown
### What's Next?

Pick an action (reply with the number):

1. {recommended action with command} — {brief rationale} ⭐ **(Recommended)**
2. {alternative action} — {why this is also viable}
3. {another option if applicable}
4. Nothing right now — pipeline is healthy
```

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Running a full scan when user just needs command syntax | Wastes time — respect the `commands` argument |
| Recommending new work when specs await review | Finish in-progress work first — stale reviews lose context |
| Skipping the INBOX scan | Stale INBOX items create noise and slow down the pipeline |
| Not checking for baked-in assumptions | Solution-oriented INBOX items bypass the debiasing step |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | Feeds items that /claude-tweaks:help surfaces |
| `/claude-tweaks:challenge` | /claude-tweaks:help flags items with baked-in assumptions for debiasing |
| `/claude-tweaks:specify` | /claude-tweaks:help flags unspecified design docs |
| `/claude-tweaks:build` | /claude-tweaks:help recommends which spec to build |
| `/claude-tweaks:review` | /claude-tweaks:help flags specs awaiting review |
| `/claude-tweaks:wrap-up` | /claude-tweaks:help flags specs awaiting wrap-up |
| `/claude-tweaks:tidy` | /claude-tweaks:help suggests /claude-tweaks:tidy when maintenance is needed |
| `/claude-tweaks:flow` | /claude-tweaks:help lists /claude-tweaks:flow as an automation option for ready specs |
| `/claude-tweaks:next` | Redirects to /claude-tweaks:help (legacy alias) |
