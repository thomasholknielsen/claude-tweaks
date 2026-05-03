---
name: claude-tweaks:specify
description: Use when converting a brainstorming design document into agent-sized work units (specs). Takes a design doc and decomposes it into self-contained specifications.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Specify

Convert a brainstorming design document into self-contained, agent-sized work units in `specs/`. Part of the workflow lifecycle:

```
/claude-tweaks:capture → /claude-tweaks:challenge → /brainstorm → [ /claude-tweaks:specify ] → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                      ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- A brainstorming session produced a design doc that needs decomposing into specs
- An INBOX item has been brainstormed and is ready for specification
- `/claude-tweaks:help` flags unspecified design docs
- You need to break a large feature into agent-sized work units
- **`/claude-tweaks:flow` rejected a design doc** — `/flow` only accepts specs; route through `/specify` first (this is the granularity contract enforcement path)
- You want to decompose a single phase from a multi-phase design doc — use the optional `phase-N` argument

## The Granularity Contract

The plugin enforces a 2-tier artifact taxonomy:

| Tier | Artifact | Producer | Consumer |
|---|---|---|---|
| Strategic | Design doc (one file, multi-phase OK as `## Phase N` sections) | `/brainstorm` (superpowers, unchanged) — produces a single design doc by convention | `/claude-tweaks:specify` |
| Executional | Spec (one file per agent-sized work unit) | `/claude-tweaks:specify` | `/claude-tweaks:flow`, `/claude-tweaks:build` |

**Routing reality:** `/claude-tweaks:specify` IS the canonical entry point — its polymorphic input means the user can pass a bare topic and `/specify` invokes `/brainstorm` internally to produce the design doc, then decomposes it. Direct `/brainstorm` invocations are exploratory; the user routes the resulting design doc back to `/specify` manually instead of running `writing-plans`.

**Why writing-plans is bypassed:** superpowers' `writing-plans` produces multi-phase plan files (`*-P1.md`, `*-P2.md`, …) that exceed `/flow`'s envelope. The path that broke `/flow` was `/brainstorm → writing-plans → /flow` — three artifact tiers with the middle tier being agent-too-big. The new path is `/brainstorm → /specify → /flow` — two artifact tiers where `/specify` produces specs sized for `/flow`'s shape gate.

**Enforcement:** the contract holds at two enforcement points — `/specify`'s phase-aware decomposition (this skill) and `/flow`'s Step 2.7 design-doc rejection. `/brainstorm` is unchanged; the contract relies on the user (or a skill caller) routing to `/specify` rather than `writing-plans`.

## Input

`$ARGUMENTS` = `<design-doc-or-topic> [phase-N]`

The first argument is a path to a design doc, a topic name, or an INBOX item reference. The optional second argument `phase-N` (where N is a phase number from the design doc's `## Phase N` sections) scopes decomposition to one phase only — useful when running phases incrementally or in parallel.

**Phase 2:** input is polymorphic — when given a bare topic with no existing design doc, `/specify` invokes superpowers `/brainstorm` directly to produce one, then continues into shape + intent + decompose without a separate user step.

**Phase target examples:**

```
/claude-tweaks:specify docs/plans/food-graph-design.md           → decompose ALL phases (or whole doc if no phases)
/claude-tweaks:specify docs/plans/food-graph-design.md phase-2   → decompose phase 2 only
/claude-tweaks:specify food graph                                → resolve to design doc, decompose all
/claude-tweaks:specify food graph phase-3                        → resolve to design doc, decompose phase 3 only
```

**Phase detection:** scan the design doc for `^## Phase \d+` headings. If 0 found and no `phase-N` was given, treat the whole doc as one phase. If 1+ found and no `phase-N` was given, decompose all phases sequentially. If `phase-N` was given but the section doesn't exist, stop and present the available phases as numbered options.

### Resolve the input:

1. **Design doc path** (e.g., `docs/plans/2026-02-21-meal-planning-design.md`) — read it directly. Disambiguation rule: a string containing `/` or ending in `.md` is treated as a path.
2. **Topic name** (e.g., `meal planning`) — search `docs/plans/*-design.md` for a matching design doc. If found, read it directly.
3. **Topic name with no matching design doc** (Phase 2 — new behavior) — invoke superpowers `/brainstorm` via the Skill tool with the topic as input. The brainstorming session produces a design doc at `docs/plans/YYYY-MM-DD-{topic}-design.md` (or wherever superpowers writes it). Wait for `/brainstorm` to complete, then continue with the produced design doc as the input. **Do not** prompt the user to "run brainstorm first" — that defeats the polymorphic input contract.
4. **INBOX reference** (e.g., `"Voice shopping list"`) — find the entry in `specs/INBOX.md`, then check if a design doc exists for it. If found, read it. If not found, treat as a topic name (Step 3 — invoke `/brainstorm`).

**Ambiguous input handling:** A topic name that *could* also be interpreted as a path (e.g., a topic with a `/` in it like "auth/login flow") is ambiguous. Stop and ask:

```
"{input}" could be a topic name or a path. Which did you mean?
1. Topic name — invoke /brainstorm to produce a design doc
2. Design doc path — read the file directly
```

This explicit disambiguation prevents the silent wrong-path failure that the Phase 2 design doc flagged as the polymorphic-input edge case.

## Step 1: Understand the Landscape

> **Parallel execution:** Use parallel tool calls aggressively — all reads and searches below are independent and should run concurrently. Front-load all I/O before analysis.

1. **The design doc** — understand what was decided, the scope, and the technical approach
2. **The brainstorming brief** (if one exists in `docs/plans/*-brief.md` for this topic) — contains assumptions surfaced by `/claude-tweaks:challenge`, blind spots, and constraints. These should be absorbed into spec Gotchas sections.
3. **`specs/INDEX.md`** — current tier structure, dependency graph, existing specs
4. **All existing spec files** (`specs/*.md`) — scan for overlap with the design doc's scope
5. **Recent git log** — check if any part of the design has already been implemented
6. **The codebase** — identify existing files, schemas, APIs, and patterns that the new work will build on. This context is critical for writing specs that `/write-plan` can act on.

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
| Tasks per work unit | 3–8 (what `/subagent-driven-development` or `/executing-plans` will execute) |
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

> **Algorithm shared with /claude-tweaks:help:** Both /specify and /help use the same implicit dependency check — compare Key Files from the target spec against Key Files from all non-completed specs. /specify runs this at creation time; /help re-runs it at dashboard time to catch new conflicts from specs that started building after /specify ran.

> **Why this matters:** Explicit `blocked-by` captures logical dependencies (spec B needs spec A's API). File-based overlap captures physical dependencies (both specs modify the same file). Missing the physical dependency leads to merge conflicts and duplicated work during concurrent builds.

## Step 2.5: Design Pre-Steps (Phase 2 — frontend specs only)

Before writing spec files, run two pre-steps when the design doc covers a frontend surface. These pre-steps capture design context (`shape`) and creative direction (`design-intent:`) so the resulting specs carry both forward to `/build` and `/flow`'s polish phase.

### Step 2.5a: Frontend detection

Sniff the design doc contents for frontend signals using the same rules as `/claude-tweaks:design`'s Layer 3:
- File-extension references (e.g., `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`)
- Path references containing `/components/`, `/pages/`, `/app/`, `/routes/`, `/views/`, `/ui/`
- Explicit "UI", "frontend", "component", "page", "screen" terminology

For the canonical sniff rules, read `frontend-detection.md` in the `/claude-tweaks:design` skill's directory.

If no frontend signals are detected, skip Steps 2.5b and 2.5c entirely. Set `surface: backend` (or `infra` when the design clearly targets infra) on each generated spec; do not write `design-intent:` for non-frontend specs (or write `design-intent: none`).

### Step 2.5b: Shape pre-step (frontend only)

Offer the shape pre-step:

```
Frontend design detected. Run /impeccable:impeccable shape to plan UX/UI before decomposition? (Recommended: yes)

1. Yes — run /impeccable:impeccable shape and append output to design doc **(Recommended)**
2. Skip — proceed directly to decomposition
```

On option 1: invoke `/claude-tweaks:design shape <topic>` via the Skill tool. The wrapper runs `/impeccable:impeccable shape <topic>` and returns `{result: "ok", output: "..."}`. Append the returned output verbatim to the design doc under a `## Shape (Impeccable)` section. This enriches the design doc with UX/UI planning that the decomposed specs and downstream `/build` can reference.

On `{skipped}` (Impeccable not installed, design integration disabled): note the skip and proceed to Step 2.5c.

### Step 2.5c: Design-intent question (frontend only)

Ask the user the design-intent question. This sets the `design-intent:` frontmatter field that Phase 3's `polish` mode will read for intent-driven dispatch (Phase 2 writes the field but does not yet act on it).

```
Design vibe for this spec? (sets design-intent frontmatter)

1. Bold — eye-catching, confident
2. Quiet — restrained, refined
3. Minimal — strip to essence
4. Delightful — personality, micro-interactions
5. Onboarding — first-run flows, empty states
6. None — no specific creative direction
```

The user can answer with multiple numbers (e.g., `1,4` for bold + delightful). Map the answers:

| User answer | `design-intent:` value |
|-------------|------------------------|
| `1` | `bold` |
| `2` | `quiet` |
| `3` | `minimal` |
| `4` | `delightful` |
| `5` | `onboarding` |
| `6` (or no answer) | `none` |
| `1,4` (multiple) | `bold, delightful` (comma-separated) |

Record the chosen value(s); Step 3 writes them into each generated spec's frontmatter.

**For multi-spec decompositions:** ask the question once per design doc and apply the same intent across all generated specs. If the user wants different intents per spec, they can edit individual spec files after Step 3.

For the canonical enumeration of `design-intent:` values, read the "Frontmatter reference (canonical spec)" section of `spec-template.md` in this skill's directory.

## Step 3: Write the Spec Files

For each work unit, assign the next available spec number (check `specs/INDEX.md`) and create `specs/NN-title.md`.

### Spec Template

Each spec follows a structured template with sections designed to give `/write-plan` everything it needs to produce a TDD execution plan. For the complete template and a table explaining what `/write-plan` does with each section, read `spec-template.md` in this skill's directory.

### Rules

- **Absorb decisions from the design doc** — the spec must be self-contained. The design doc will be deleted, so all rationale, decisions, and technical context must live here.
- **Be specific about files** — "update the API" is too vague. Name the exact file and what to add.
- **Include testable acceptance criteria** — not "works correctly" but specific assertions an agent can verify.
- **Don't over-specify implementation** — the spec says *what* and *where*, the plan (created by `/write-plan` during `/claude-tweaks:build`) says *how*.
- **Include gotchas from project memory** — search CLAUDE.md and memory files for relevant patterns, common mistakes, and lessons learned.
- **Absorb the brainstorming brief** — if a `*-brief.md` exists for this topic, carry its assumptions, blind spots, and constraints into the relevant specs' Gotchas sections. These are hard-won insights from `/claude-tweaks:challenge` that should survive.
- **Include known manual steps** — environment variables to provision, infrastructure changes to apply, third-party services to configure. If the design doc mentions infrastructure setup, API key provisioning, or deployment requirements, absorb them into the Manual Steps section.
- **Write design frontmatter (Phase 2+)** — every generated spec must include `surface:` (from Step 2.5a detection) and, when frontend, `design-intent:` (from Step 2.5c question). For backend/infra specs, write `surface: backend` (or `infra`) and either omit `design-intent:` or set it to `none`. The canonical field reference lives in `spec-template.md`'s "Frontmatter reference (canonical spec)" section.

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

### Design Context Preservation

Before deleting the design doc and brief, absorb key context into the specs so it survives:

1. **Decision Rationale** — from the design doc, extract the "why" behind major decisions (approach choices, technology selections, rejected alternatives). Add as a `## Decision Rationale` section in the first spec of the decomposition.
2. **Assumptions & Constraints** — from the brief (produced by `/claude-tweaks:challenge`), extract validated assumptions, surfaced blind spots, and hard constraints. Add as an `## Assumptions` section in each spec where the assumptions are relevant.

This ensures specs are self-contained — a developer reading spec 73 understands *why* the approach was chosen without needing the deleted design doc.

## Step 5: Delete Consumed Artifacts (only when fully decomposed)

The design doc and brainstorming brief have served their purpose **once every phase has been decomposed into specs**. Behavior depends on the phase target:

| Decomposition mode | Delete design doc? |
|---|---|
| No `phase-N` argument; doc has 0 phase sections (single-phase) | Yes — fully consumed |
| No `phase-N` argument; doc has N phase sections; all decomposed in this run | Yes — fully consumed |
| `phase-N` argument; only that phase decomposed | **No** — design doc retained for remaining phases. Add a `## Phase N: Specified` marker after the phase heading instead, listing the spec numbers it produced. |
| `phase-N` argument; this was the last un-specified phase | Yes — fully consumed (run delete after marker bookkeeping confirms all phases marked) |

**Pre-delete verification:** Before deleting (when applicable), scan the design doc for any content not yet absorbed into specs — architectural rationale, rejected alternatives, edge case notes, integration constraints. If anything was missed, add it to the relevant spec's Decision Rationale, Assumptions, or Gotchas section. `/build` only reads the spec and INDEX.md — it will not have access to the design doc.

```bash
# Full decomposition (all phases or single-phase):
git rm docs/plans/YYYY-MM-DD-{topic}-design.md
git rm docs/plans/YYYY-MM-DD-{topic}-brief.md  # if it exists

# Partial decomposition (phase-N only): commit the marker, keep the doc
git add docs/plans/YYYY-MM-DD-{topic}-design.md
git commit -m "docs(specs): mark phase-{N} specified in design doc"
```

When fully consumed, do NOT keep these around. They create dangling references and stale artifacts. The specs are the durable record.

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

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Created spec `specs/{N}-{title}.md` | `{hash}` |
| Operational | Updated `specs/INDEX.md` | `{hash}` |
| Operational | Deleted design doc + brief | `{hash}` |

### Next Actions

Self-routing — render based on what was produced:

| Situation | Next Actions block |
|---|---|
| Single spec produced | 1. `/claude-tweaks:flow {N}` — automated pipeline for spec {N}: "{title}" **(Recommended)**<br>2. `/claude-tweaks:build {N}` — build only (no test/review/wrap-up)<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Multiple specs produced from a single phase / single-phase doc | 1. `/claude-tweaks:flow {N1},{N2},...,{Nk}` — sequential pipeline, all specs **(Recommended)**<br>2. `/claude-tweaks:flow {N1}` — pipeline just the highest-priority spec<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Phase-N decomposition with remaining phases in design doc | 1. `/claude-tweaks:flow {N1},{N2},...` — pipeline this phase's specs **(Recommended)**<br>2. `/claude-tweaks:specify {doc} phase-{N+1}` — decompose next phase<br>3. `/claude-tweaks:help` — pipeline dashboard |
| All phases decomposed in one run (large multi-phase decomposition) | 1. `/claude-tweaks:flow {first-phase-spec-ids}` — pipeline phase 1 specs first **(Recommended)**<br>2. `/claude-tweaks:flow {all-spec-ids}` — pipeline everything sequentially (long-running)<br>3. `/claude-tweaks:help` — see the full dependency graph before deciding |

Always recommend `/flow` over `/build` — `/flow` is the canonical path through the pipeline, and the new shape gate (Step 2.6 in `/flow`) accepts well-structured specs of any size.

Commit with a message describing the specs created.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Specifying without a design doc | Specs need brainstorming output — without it, assumptions go unchallenged. Phase 2's polymorphic input fixes this by invoking `/brainstorm` automatically on topic input. |
| Specs that touch every layer | A single spec spanning data + API + UI + infra is too large for agent-sized execution |
| Vague acceptance criteria | "Works correctly" can't be verified — `/write-plan` needs specific, testable assertions |
| Keeping the design doc after specifying | Creates dangling references — the spec is the durable record, the design doc is consumed |
| Skipping the codebase scan | Specs without Current State context force `/write-plan` into blind exploration |
| Silently deciding how to handle overlapping specs | Overlap handling (extend vs. companion vs. replace) is a user decision — present numbered options, don't assume |
| Asking the design-intent question on backend specs | Annoying and irrelevant — Step 2.5c only fires when frontend signals are detected in Step 2.5a |
| Skipping the shape pre-step on frontend specs without offering | Shape is a value-add for UX/UI planning — surface it as a recommended option, let the user opt out explicitly |
| Writing specs without `surface:` frontmatter (Phase 2+) | Wrapper Layer 2 detection falls through to file-extension sniff, which is less reliable. Always write `surface:` per the canonical reference in `spec-template.md`. |
| Treating "topic with slash" as a path | Ambiguous input must be disambiguated explicitly — present the numbered choice, do not assume one interpretation |
| Deleting the design doc after a partial (`phase-N`) decomposition | Other phases still need it. Delete only after every phase has been marked specified. See Step 5's table. |
| Producing a "phase plan" file alongside or instead of specs | Phase plans are dead artifacts. The granularity contract has 2 tiers: design doc (one file, phases as sections) → specs (one file each). Anything else is a contract violation. |
| Routing the user to `/build` over `/flow` | `/flow` is the canonical pipeline path. The shape gate now accepts well-structured specs of any size. Recommend `/flow` first, `/build` only as the "build without pipeline" escape hatch. |
| Skipping `/specify` between `/brainstorm` and `/flow` | Removed in v4.5.2 — `/flow` rejects design docs at Step 2.7. The granularity contract is now enforced. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/brainstorm` | Runs BEFORE /claude-tweaks:specify — produces the design doc that /claude-tweaks:specify consumes and deletes |
| `/write-plan` | Consumes specs AFTER /claude-tweaks:specify — the spec must provide enough context for `/write-plan` to produce a TDD execution plan |
| `/subagent-driven-development` | Executes specs AFTER /claude-tweaks:specify — uses the plan from `/write-plan` (via `/claude-tweaks:build` subagent execution strategy) |
| `/executing-plans` | Executes specs AFTER /claude-tweaks:specify — uses the plan from `/write-plan` (via `/claude-tweaks:build` batched execution strategy) |
| `/claude-tweaks:build` | Runs AFTER /claude-tweaks:specify — takes a single spec and implements it |
| `/claude-tweaks:capture` | Feeds INBOX items that may trigger brainstorming → /claude-tweaks:specify |
| `/claude-tweaks:tidy` | Reviews specs created by /claude-tweaks:specify for staleness. /claude-tweaks:tidy tags INBOX items as `**Promoted:**` — /claude-tweaks:specify Step 6 removes them from INBOX after creating the spec |
| `/claude-tweaks:help` | Shows which specs from /claude-tweaks:specify are ready for /claude-tweaks:build — also uses Key Files for implicit dependency detection |
| `/claude-tweaks:design` | /specify invokes `/claude-tweaks:design shape <topic>` (Step 2.5b) on frontend design docs to enrich the design doc with UX/UI planning. /specify writes `surface:` and `design-intent:` frontmatter (Step 2.5c + Step 3) on every generated spec; the design wrapper reads `surface:` for Layer 2 detection and reads `design-intent:` for `polish` mode's intent-driven dispatch (active in v4.5.0). |
| superpowers `/brainstorm` | Invoked BY /specify (Phase 2 — polymorphic input) when given a topic name with no existing design doc. Produces the design doc that /specify then decomposes. |
