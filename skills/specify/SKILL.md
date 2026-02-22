---
name: claude-tweaks:specify
description: Use when converting a brainstorming design document into agent-sized work units (specs). Takes a design doc and decomposes it into self-contained specifications.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." End skills with a recommended next step, not a navigation menu.


# Specify

Convert a brainstorming design document into self-contained, agent-sized work units in `specs/`. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → brainstorming → [ /claude-tweaks:specify ] → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                      ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- A brainstorming session produced a design doc that needs decomposing into specs
- An INBOX item has been brainstormed and is ready for specification
- `/claude-tweaks:help` flags unspecified design docs
- You need to break a large feature into agent-sized work units

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

### File Reference Map

Extract the `Key Files` section from every existing spec to build a file→spec map:

```
src/components/ShoppingList.tsx → Spec 41, Spec 45
src/api/items.ts → Spec 41
src/pages/shopping.tsx → Spec 45, Spec 52
```

This map is used in Step 2 to detect implicit file-based dependencies when creating new specs. If a new spec will touch files that an existing spec also touches, that's an implicit dependency — even if neither spec lists the other in `blocked-by`.

### Overlap Analysis

For each major section/feature in the design doc, classify coverage:

| Coverage | Meaning |
|----------|---------|
| **Already exists** | A spec covers this fully |
| **Partial overlap** | An existing spec covers part of this |
| **Gap** | No existing spec addresses this |

**For each item with overlap, present a decision:**

```
OVERLAP: "{design doc section}" ↔ Spec {N}: "{spec title}"
Coverage: {Already exists / Partial overlap}
1. Skip — Spec {N} already covers this, don't duplicate
2. Extend spec {N} — Add the new scope to the existing spec
3. Companion spec — Create a new spec with a dependency on spec {N}
4. Replace — The design doc supersedes spec {N}, rewrite it
```

This ensures overlap handling is an explicit user decision, not a silent assumption. For **Gap** items, proceed directly to Step 2 (decompose into work units).

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

### Implicit Dependency Detection

After decomposing into work units, before writing spec files, check each new work unit's planned Key Files against the file reference map from Step 1.

| Overlap Type | Meaning | Action |
|-------------|---------|--------|
| New spec's files overlap with a **completed** spec | No conflict — completed specs are done | No action |
| New spec's files overlap with a **not-started** spec | Potential conflict — both will modify the same files | Add to `blocked-by` or reorder to avoid concurrent modification |
| New spec's files overlap with an **in-progress** spec | Active conflict — concurrent changes to the same files | Add to `blocked-by` — wait for the in-progress spec to finish |
| Two **new** specs from this decomposition share files | Internal conflict within the batch | Add explicit dependency between them and order accordingly |

Present any detected implicit dependencies as part of the Step 7 summary. These are flagged alongside the explicit `blocked-by` relationships from the tier/prerequisite analysis.

> **Why this matters:** Explicit `blocked-by` captures logical dependencies (spec B needs spec A's API). File-based overlap captures physical dependencies (both specs modify the same file). Missing the physical dependency leads to merge conflicts and duplicated work during concurrent builds.

## Step 3: Write the Spec Files

For each work unit, assign the next available spec number (check `specs/INDEX.md`) and create `specs/NN-title.md`.

### Spec Template

Each spec follows a structured template with sections designed to give `writing-plans` everything it needs to produce a TDD execution plan. For the complete template and a table explaining what writing-plans does with each section, read `spec-template.md` in this skill's directory.

### Rules

- **Absorb decisions from the design doc** — the spec must be self-contained. The design doc will be deleted, so all rationale, decisions, and technical context must live here.
- **Be specific about files** — "update the API" is too vague. Name the exact file and what to add.
- **Include testable acceptance criteria** — not "works correctly" but specific assertions an agent can verify.
- **Don't over-specify implementation** — the spec says *what* and *where*, the plan (created by `writing-plans` during `/claude-tweaks:build`) says *how*.
- **Include gotchas from project memory** — search CLAUDE.md and memory files for relevant patterns, common mistakes, and lessons learned.
- **Absorb the brainstorming brief** — if a `*-brief.md` exists for this topic, carry its assumptions, blind spots, and constraints into the relevant specs' Gotchas sections. These are hard-won insights from `/claude-tweaks:challenge` that should survive.

---

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

---

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

**Recommended next:** `/claude-tweaks:build {first spec number}` — start building the highest-priority spec.

Commit with a message describing the specs created.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Specifying without a design doc | Specs need brainstorming output — without it, assumptions go unchallenged |
| Specs that touch every layer | A single spec spanning data + API + UI + infra is too large for agent-sized execution |
| Vague acceptance criteria | "Works correctly" can't be verified — writing-plans needs specific, testable assertions |
| Keeping the design doc after specifying | Creates dangling references — the spec is the durable record, the design doc is consumed |
| Skipping the codebase scan | Specs without Current State context force writing-plans into blind exploration |
| Silently deciding how to handle overlapping specs | Overlap handling (extend vs. companion vs. replace) is a user decision — present numbered options, don't assume |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `brainstorming` (Superpowers) | Runs BEFORE /claude-tweaks:specify — produces the design doc that /claude-tweaks:specify consumes and deletes |
| `writing-plans` (Superpowers) | Consumes specs AFTER /claude-tweaks:specify — the spec must provide enough context for writing-plans to produce a TDD execution plan |
| `/claude-tweaks:build` | Runs AFTER /claude-tweaks:specify — takes a single spec and implements it |
| `/claude-tweaks:capture` | Feeds INBOX items that may trigger brainstorming → /claude-tweaks:specify |
| `/claude-tweaks:tidy` | Reviews specs created by /claude-tweaks:specify for staleness |
| `/claude-tweaks:help` | Shows which specs from /claude-tweaks:specify are ready for /claude-tweaks:build — also uses Key Files for implicit dependency detection |
