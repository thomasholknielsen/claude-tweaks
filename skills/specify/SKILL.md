---
name: claude-tweaks:specify
description: Use when converting a brainstorming design document into agent-sized work units (specs). Takes a design doc and decomposes it into self-contained specifications.
---

# Specify

Convert a brainstorming design document into self-contained, agent-sized work units in `specs/`. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
```

## Input

`$ARGUMENTS` = path to a design doc, a topic name, or an INBOX item reference.

### Resolve the input:

1. **Design doc path** (e.g., `docs/plans/2026-02-21-meal-planning-design.md`) — read it directly
2. **Topic name** (e.g., `meal planning`) — search `docs/plans/*-design.md` for a matching design doc
3. **INBOX reference** (e.g., `"Voice shopping list"`) — find the entry in `specs/INBOX.md`, then check if a design doc exists for it

If no design doc exists for the topic, tell the user to run `brainstorming` first. Do NOT proceed without a design document — the brainstorming step is where divergent exploration and user decisions happen.

## Step 1: Understand the Landscape

Read and analyze in parallel:

1. **The design doc** — understand what was decided, the scope, and the technical approach
2. **The brainstorming brief** (if one exists in `docs/plans/*-brief.md` for this topic) — contains assumptions surfaced by `/claude-tweaks:challenge`, blind spots, and constraints. These should be absorbed into spec Gotchas sections.
3. **`specs/INDEX.md`** — current tier structure, dependency graph, existing specs
4. **All existing spec files** (`specs/*.md`) — scan for overlap with the design doc's scope
5. **Recent git log** — check if any part of the design has already been implemented
6. **The codebase** — identify existing files, schemas, APIs, and patterns that the new work will build on. This context is critical for writing specs that `writing-plans` can act on.

### Overlap Analysis

For each major section/feature in the design doc, classify:

| Coverage | Meaning | Action |
|----------|---------|--------|
| **Already exists** | A spec covers this fully | Skip — don't create a duplicate |
| **Partial overlap** | An existing spec covers part of this | Extend that spec OR create a companion spec with a dependency link |
| **Gap** | No existing spec addresses this | Create a new work unit |

## Step 2: Decompose into Work Units

Break the design doc into self-contained work units. Each work unit must be:

### Sizing Guidelines

| Criteria | Target |
|----------|--------|
| Tasks per work unit | 3–8 (what subagent-driven-development will execute) |
| Files touched per task | 1–3 |
| Dependency depth | Max 2 levels (A blocks B blocks C, but not deeper) |
| Cross-package scope | A work unit should touch at most 2-3 packages/modules |

### Decomposition Heuristics

Split along these natural boundaries (in priority order):

1. **Data layer** — database schema, migrations, data access methods
2. **API / business logic** — endpoints, services, validation
3. **UI / presentation** — components, pages, forms
4. **Infrastructure** — deployment, CI/CD, configuration
5. **Cross-cutting** — feature flags, permissions, monitoring

A design doc about "meal planning improvements" might become:
- Spec 73: Meal planning data layer (schema + data access + migration)
- Spec 74: Meal planning API (endpoints + services)
- Spec 75: Meal planning UI (components + pages)

Each is independently buildable with clear dependencies (73 → 74 → 75).

### What Makes a Good Work Unit

- **Self-contained**: An agent can `/claude-tweaks:build` it without needing context from other uncommitted work
- **Testable**: Has clear acceptance criteria that can be verified
- **Atomic**: Either fully done or not done — no meaningful "50% complete" state
- **Ordered**: Dependencies are explicit and minimal

### What Makes a Bad Work Unit

- Requires another in-progress spec to be half-done first
- Touches every layer (data + API + UI + infra) in a single spec
- Has vague acceptance criteria ("improve performance")
- Would decompose into 15+ tasks

## Step 3: Write the Spec Files

For each work unit, assign the next available spec number (check `specs/INDEX.md`) and create `specs/NN-title.md`.

### Spec Template

The spec must be detailed enough for `writing-plans` to produce a TDD execution plan without additional context. Writing-plans assumes zero codebase familiarity — the spec provides the anchoring.

```markdown
---
tier: {1-5}
status: not-started
progress: 0
blocked-by: [{spec numbers or empty}]
---

# {Number}: {Title}

## Overview

{1-2 paragraphs describing what this work unit delivers and why. Absorb key decisions and rationale from the design doc — the design doc will be deleted after this step.}

**Complexity:** {Low | Medium | High}
**Estimated tasks:** {3-8}

## Non-Goals

{Explicit boundaries. What this spec does NOT cover. Prevents writing-plans from scope-creeping beyond the work unit boundary.}

- {Thing that might seem in scope but isn't}
- {Related work that belongs in a different spec}

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| {N} | {title} | {status} |

## Current State

{What already exists in the codebase that this work builds on. Not a code dump — pointers that give writing-plans its starting points.}

- Data: `{path}` — {what tables/models exist}
- API: `{path}` — {what endpoints exist}
- UI: `{path}` — {what components exist}
- Tests: `{path}` — {what test patterns to follow}

## Deliverables

- [ ] {Concrete deliverable 1}
- [ ] {Concrete deliverable 2}
- [ ] ...

## Acceptance Criteria

1. {Specific, testable criterion that writing-plans can convert to a TDD step}
2. {Specific, testable criterion}
3. ...

## Technical Approach

{Key architectural decisions absorbed from the design doc, specific to this work unit.}

### Data / API Surface

{If this spec involves data model or API changes, define the contract surface. Table/model names, field types, endpoint signatures, validation schemas. Not full implementation — just enough for writing-plans to generate exact code.}

### Key Files

- `{path}` — {what changes or new file purpose}
- `{path}` — {what changes}

### Package Dependencies

- `{package}` — {what's needed from it}

## Gotchas

{Things learned during brainstorming, from past experience, or from project memory that writing-plans won't know. These prevent common subagent mistakes.}

- {e.g., "Use upsert, not delete+insert for this operation"}
- {e.g., "The status enum values are exactly: draft, published, archived"}
- {e.g., "This mutation needs a transaction — it modifies two tables atomically"}
- {e.g., "Import shared types from the contracts package, don't redeclare inline"}
```

### Why Each Section Matters for writing-plans

| Section | What writing-plans does with it |
|---------|-------------------------------|
| **Overview** | Sets the goal and context for the plan header |
| **Non-Goals** | Prevents scope creep in task decomposition |
| **Current State** | Gives starting points — avoids blind codebase exploration |
| **Deliverables** | Maps to plan tasks (roughly 1 deliverable = 1-2 tasks) |
| **Acceptance Criteria** | Becomes the "verify" step in each TDD cycle |
| **Data / API Surface** | Enables exact code generation — names, types, endpoints |
| **Key Files** | Exact paths for the plan's "Files" section |
| **Gotchas** | Injected as constraints into subagent prompts |

### Rules

- **Absorb decisions from the design doc** — the spec must be self-contained. The design doc will be deleted, so all rationale, decisions, and technical context must live here.
- **Be specific about files** — "update the API" is too vague. Name the exact file and what to add.
- **Include testable acceptance criteria** — not "works correctly" but specific assertions an agent can verify.
- **Don't over-specify implementation** — the spec says *what* and *where*, the plan (created by `writing-plans` during `/claude-tweaks:build`) says *how*.
- **Include gotchas from project memory** — search CLAUDE.md and memory files for relevant patterns, common mistakes, and lessons learned.
- **Absorb the brainstorming brief** — if a `*-brief.md` exists for this topic, carry its assumptions, blind spots, and constraints into the relevant specs' Gotchas sections. These are hard-won insights from `/claude-tweaks:challenge` that should survive.

## Step 4: Update INDEX.md

Add the new specs to `specs/INDEX.md`:

1. **Determine tier placement** — which tier does each work unit belong in?
2. **Add dependency info** — which specs must complete before this one can start?
3. **Add to the tier table** with status "Not started"

Tier labels are project-specific. Common patterns:

| Tier | Typical Meaning |
|------|----------------|
| Tier 1 | Must-have / blocks launch or critical path |
| Tier 2 | High-value, ship soon after launch |
| Tier 3 | Differentiators and premium features |
| Tier 4 | Platform expansion (mobile, extensions) |
| Tier 5 | Scale-triggered optimization |

Adapt tiers to your project's roadmap structure.

## Step 5: Delete Consumed Artifacts

The design doc and brainstorming brief have served their purpose. All decisions, rationale, assumptions, and constraints have been absorbed into the spec files.

```bash
git rm docs/plans/YYYY-MM-DD-{topic}-design.md
git rm docs/plans/YYYY-MM-DD-{topic}-brief.md  # if it exists
```

Do NOT keep these around. They create dangling references and stale artifacts. The specs are the durable record.

## Step 6: Clean Up INBOX

If the work originated from an INBOX item:

- Remove the entry from `specs/INBOX.md`
- It has been promoted — the specs are the durable artifact now

## Step 7: Summary and Commit

Present a summary:

```markdown
## Specification: {design doc topic}

### Work Units Created
| Spec | Title | Tier | Depends On | Est. Tasks |
|------|-------|------|------------|------------|
| {N} | {title} | {tier} | {deps} | {count} |

### Existing Specs Modified
- `specs/{file}` — {what was added/changed}

### INDEX.md Updates
- {changes made}

### Artifacts Removed
- Design doc: `docs/plans/{filename}` (absorbed into specs)
- Brainstorming brief: `docs/plans/{filename}` (absorbed into spec Gotchas) — if it existed
- INBOX entry: {title} (promoted)
```

Commit with a message describing the specs created.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `brainstorming` (Superpowers) | Runs BEFORE /claude-tweaks:specify — produces the design doc that /claude-tweaks:specify consumes and deletes |
| `writing-plans` (Superpowers) | Consumes specs AFTER /claude-tweaks:specify — the spec must provide enough context for writing-plans to produce a TDD execution plan |
| `/claude-tweaks:build` | Runs AFTER /claude-tweaks:specify — takes a single spec and implements it |
| `/claude-tweaks:capture` | Feeds INBOX items that may trigger brainstorming → /claude-tweaks:specify |
| `/claude-tweaks:tidy` | Reviews specs created by /claude-tweaks:specify for staleness |
| `/claude-tweaks:next` | Shows which specs from /claude-tweaks:specify are ready for /claude-tweaks:build |
