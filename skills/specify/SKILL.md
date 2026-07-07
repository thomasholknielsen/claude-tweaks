---
name: claude-tweaks:specify
description: Use when converting a brainstorming design document into agent-sized work units (specs). Takes a design doc and decomposes it into self-contained specifications.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Specify — Decompose a design doc into agent-sized work units

Convert a brainstorming design document into self-contained, agent-sized work units in `specs/`. Part of the workflow lifecycle:

```
/claude-tweaks:init → /claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → [ /claude-tweaks:specify ] → /claude-tweaks:build → /claude-tweaks:stories → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
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
| Strategic | Design doc (one file, multi-phase OK as `## Phase N` sections) | `/superpowers:brainstorming` (superpowers, unchanged) — produces a single design doc by convention | `/claude-tweaks:specify` |
| Executional | Spec (one file per agent-sized work unit) | `/claude-tweaks:specify` | `/claude-tweaks:flow`, `/claude-tweaks:build` |

`/claude-tweaks:specify` is the canonical entry point — its polymorphic input accepts a design doc path, a topic, or an INBOX reference. For a bare topic it invokes `/superpowers:brainstorming` internally, then decomposes the resulting design doc. The contract holds at two enforcement points: this skill's phase-aware decomposition and `/flow`'s Step 2.7 design-doc rejection. See the "Background" section near the end of this file for the historical context on why `/superpowers:writing-plans` is bypassed.

## Input

`$ARGUMENTS` = `<design-doc-or-topic> [phase-N]`

The first argument is a path to a design doc, a topic name, or an INBOX item reference. The optional second argument `phase-N` (where N is a phase number from the design doc's `## Phase N` sections) scopes decomposition to one phase only — useful when running phases incrementally or in parallel.

Input is polymorphic — see the canonical definition in the Granularity Contract section above. The resolution steps below handle each input shape.

**Phase target examples:**

```
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md           → decompose ALL phases (or whole doc if no phases)
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md phase-2   → decompose phase 2 only
/claude-tweaks:specify food graph                                → resolve to design doc, decompose all
/claude-tweaks:specify food graph phase-3                        → resolve to design doc, decompose phase 3 only
```

**Phase detection:** scan the design doc for `^## Phase \d+` headings. If 0 found and no `phase-N` was given, treat the whole doc as one phase. If 1+ found and no `phase-N` was given, decompose all phases sequentially. If `phase-N` was given but the section doesn't exist, stop and present the available phases as numbered options.

### Resolve the input:

1. **GitHub issue reference** — a URL matching `https://github.com/{owner}/{repo}/issues/{n}`, or a shorthand like `#123` / `issue 123` / `gh-123`. Checked *before* case 2's path/topic disambiguation, since an issue URL contains `/` and would otherwise misparse as a design-doc path. Fetch it directly: `gh issue view {n} --json number,title,body,url,labels`. Treat the issue's title + body as the design doc content — code-health-filed issues are already `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so this needs near-zero translation; a human-filed issue without that shape still works, just with more editorializing in Step 2. Extract the fingerprint marker from the body if present (`<!-- code-health-fingerprint: ([^\s>]+) -->` — same regex as `bin/lib/issues/ingest.js`'s `FP_RE`). Also extract effort from the issue's labels if a `code-health:effort-<tier>` label is present (`low|medium|high`; absent for non-code-health issues). Carry `{issueNumber, fingerprint, effort}` forward to Step 3, which stamps `recon-issue:` (and `recon-fingerprint:`/`code-health-effort:`, when present) frontmatter on the generated spec — this is what lets `/wrap-up`'s close-via-merge, issue-claim-release, and `/build`'s effort-based model-tier selection all engage. (This is a distinct path from `/flow --from-code-health`, which pulls issues itself and passes `/specify` the already-extracted title + body text directly, then stamps this same frontmatter in `from-code-health.md` Step 3 — it never reaches this case.)
2. **Design doc path** (e.g., `docs/superpowers/specs/2026-02-21-meal-planning-design.md`) — read it directly. Disambiguation rule: a string containing `/` or ending in `.md`, that didn't match case 1 above, is treated as a path.
3. **Topic name** (e.g., `meal planning`) — search `docs/superpowers/specs/*-design.md` for a matching design doc. If found, read it directly.
4. **Topic name with no matching design doc** — invoke superpowers `/superpowers:brainstorming` via the Skill tool with the topic as input (this is the polymorphic-input branch defined above). The brainstorming session produces a design doc at `docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md` (or wherever superpowers writes it). Wait for `/superpowers:brainstorming` to complete, then continue with the produced design doc as the input. **Do not** prompt the user to "run brainstorm first" — that defeats the contract.
5. **INBOX reference** (e.g., `"Voice shopping list"`) — find the entry in `specs/INBOX.md`, then check if a design doc exists for it. If found, read it. If not found, treat as a topic name (case 4 — invoke `/superpowers:brainstorming`).

**Ambiguous input handling:** A topic name that *could* also be interpreted as a path (e.g., a topic with a `/` in it like "auth/login flow") is ambiguous. Stop and call `AskUserQuestion` with:

- `question`: `"'{input}' could be a topic name or a path. Which did you mean?"`, `header`: `"Input type"`, `multiSelect`: `false`
- Option 1 — `label`: `"Topic name"`, `description`: `"invoke /superpowers:brainstorming to produce a design doc"`
- Option 2 — `label`: `"Design doc path"`, `description`: `"read the file directly"`

This explicit disambiguation prevents the silent wrong-path failure flagged by past polymorphic-input edge cases.

## Step 1: Understand the Landscape

> **Parallel execution:** Use parallel tool calls aggressively — all reads and searches below are independent and should run concurrently. Front-load all I/O before analysis.

1. **The design doc** — understand what was decided, the scope, and the technical approach
2. **The brainstorming brief** (if one exists in `docs/plans/*-brief.md` for this topic) — contains assumptions surfaced by `/claude-tweaks:challenge`, blind spots, and constraints. These should be absorbed into spec Gotchas sections.
3. **`specs/INDEX.md`** — current tier structure, dependency graph, existing specs
4. **All existing spec files** (`specs/*.md`) — scan for overlap with the design doc's scope
5. **Recent git log** — check if any part of the design has already been implemented
6. **The codebase** — identify existing files, schemas, APIs, and patterns that the new work will build on. This context is critical for writing specs that `/superpowers:writing-plans` can act on.

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

**For each item with overlap:**

### Auto mode (policy lookup)

When a pipeline run directory exists, read `overlap` from `config.yml` (default `companion`). Apply per policy:

| Policy | Action | Log entry |
|---|---|---|
| `companion` (default) | Auto-create a companion spec with `blocked-by: {N}`. Reversible — companion is its own file. | `AUTO {time} — Step 1: overlap "{section}" ↔ Spec {N} resolved as companion spec. New spec created at specs/{new-N}.md.` |
| `skip` | Auto-skip — don't create a new spec for this section. Note in summary. | `AUTO {time} — Step 1: overlap "{section}" ↔ Spec {N} resolved as skip — already covered.` |
| `extend` | Stage as `staged/specify-overlap-{N}.md` containing the proposed additions to spec {N}. NEVER auto-modify an existing spec — that's not reversible enough. | `STAGED {time} — Step 1: overlap "{section}" ↔ Spec {N} requires extending an existing spec. Stage path: staged/specify-overlap-{N}.md.` |
| `replace` | Stage as `staged/specify-overlap-{N}.md`. Replacement is destructive; the user must approve at the Review Console. | `STAGED {time} — Step 1: overlap "{section}" ↔ Spec {N} proposed as replacement. Stage path: staged/specify-overlap-{N}.md.` |

### Interactive mode (batch per-overlap decisions)

Collect ALL overlaps first, then present as one batch table. Per CLAUDE.md, never present per-item prompts when 2+ items can batch — that scales badly when a design doc overlaps with multiple existing specs.

```
Overlap analysis — {M} overlap(s) found:

| # | Section | Existing spec | Coverage | Recommended | Override? |
|---|---------|--------------|----------|-------------|-----------|
| 1 | "{section A}" | Spec {N}: "{title}" | Already exists | Skip | (1) skip / (2) extend / (3) companion / (4) replace |
| 2 | "{section B}" | Spec {N}: "{title}" | Partial overlap | Companion (Recommended) | (1) skip / (2) extend / (3) companion / (4) replace |
| ...|
```

The table renders as markdown, as above. Immediately below it, call `AskUserQuestion` with:

- `question`: `"How do you want to handle these overlaps?"`, `header`: `"Overlaps"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Apply all recommended"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change and to what"`

The recommendation column pre-fills based on coverage type: `Already exists` → Skip; `Partial overlap` → Companion. The user can pick "Apply all recommended" to accept all in one decision, or "Override specific items" and follow up with which #s to change in ordinary free-text conversation. Policy-driven equivalent in auto mode (above).

For **Gap** items, proceed directly to Step 2 (decompose into work units).

## Step 2: Decompose into Work Units

Break the design doc into self-contained work units. Each work unit must be:

### Sizing Guidelines

| Criteria | Target |
|----------|--------|
| Tasks per work unit | 3–8 (what `/superpowers:subagent-driven-development` or `/superpowers:executing-plans` will execute) |
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

Present any detected implicit dependencies as part of the Step 9 summary. These are flagged alongside the explicit `blocked-by` relationships from the tier/prerequisite analysis.

> **Algorithm shared with /claude-tweaks:help:** Both /specify and /help use the same implicit dependency check — compare Key Files from the target spec against Key Files from all non-completed specs. /specify runs this at creation time; /help re-runs it at dashboard time to catch new conflicts from specs that started building after /specify ran.

> **Why this matters:** Explicit `blocked-by` captures logical dependencies (spec B needs spec A's API). File-based overlap captures physical dependencies (both specs modify the same file). Missing the physical dependency leads to merge conflicts and duplicated work during concurrent builds.

## Step 2.5: Design Pre-Steps (frontend specs only)

Before writing spec files, run frontend detection and two design pre-steps when the design doc covers a frontend surface — these capture design context (`shape`) and creative direction (`design-intent:`) so the resulting specs carry both forward to `/build` and `/flow`'s polish phase. For the frontend-detection sniff rules, the shape pre-step auto/interactive behavior, and the design-intent question + answer-mapping table, read `design-pre-steps.md` in this skill's directory.

For non-frontend design docs (no frontend signals detected), skip this step entirely — set `surface: backend` (or `infra`) on each generated spec; do not write `design-intent:`.

## Step 2.5d: Diagram Suggestion (all specs, companion plugin)

Soft-hook for the [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) companion plugin. **Unlike Step 2.5, this runs for every surface** — architecture, ER, sequence, and state diagrams help backend and infra specs equally.

Read the flag from CLAUDE.md (Step 1 of `_shared/diagram-integration-check.md`). When the flag is `disabled` or missing, skip this step silently.

When `enabled`, scan the design doc text + decomposed spec titles for structural signals. Use this detection table:

| Signal in design doc | Diagram type (suggest) |
|----------------------|------------------------|
| Phrases like "state machine", "states:", "transitions from … to …", named status enums (3+ values) | `state` |
| Schema definitions, `entity`, `references`, `foreign key`, ORM relations between 2+ tables | `er` |
| 3+ services / actors / queues exchanging messages or HTTP calls | `sequence` |
| 3+ named branches in a decision (`If A then B; if C then D; otherwise E`) | `flowchart` |
| 3+ system components / boxes in a layout (microservices, layers, gateways) | `architecture` |
| Parent-child taxonomy with 2+ levels (categories → subcategories → items) | `tree` |

Emit at most **two** recommendations per design doc — the two strongest matches. Skip emission entirely if no signal matches (trivial specs and refactors should not trigger the hook).

For each emitted recommendation, format per Step 3 of `_shared/diagram-integration-check.md`:

```
**Diagram suggestion:** This design doc describes a state machine for orders
(pending → paid → shipped → delivered → refunded). Consider a state diagram —
the `diagram-design` plugin will generate one if you ask Claude to draw it.
Suggested output path: `docs/diagrams/{spec-slug}-state.html`.
```

Place these recommendations in the Step 9 summary under a `### Diagram suggestions` block. They are advisory — they do not block decomposition, do not write spec frontmatter, and do not invoke any tool. The user decides whether to act in the next conversation turn (the `diagram-design` plugin's skill auto-triggers from its description when asked).

**Auto mode:** the diagram suggestion is always advisory — `auto` mode emits the recommendation without prompting, logs `STAGED {time} — Step 2.5d: diagram-suggestion ({type}) for {spec/slug}. Reversibility: high.` to the decision log, and continues. No mid-flow stop.

## Step 3: Write the Spec Files

For each work unit, assign the next available spec number (check `specs/INDEX.md`) and create `specs/NN-title.md`.

### Spec Template

Each spec follows a structured template with sections designed to give `/superpowers:writing-plans` everything it needs to produce a TDD execution plan. For the complete template and a table explaining what `/superpowers:writing-plans` does with each section, read `spec-template.md` in this skill's directory.

### Rules

- **Absorb decisions from the design doc** — the spec must be self-contained. The design doc will be deleted, so all rationale, decisions, and technical context must live here.
- **Be specific about files** — "update the API" is too vague. Name the exact file and what to add.
- **Include testable acceptance criteria** — not "works correctly" but specific assertions an agent can verify.
- **Don't over-specify implementation** — the spec says *what* and *where*, the plan (created by `/superpowers:writing-plans` during `/claude-tweaks:build`) says *how*.
- **Include gotchas from project memory** — search CLAUDE.md and memory files for relevant patterns, common mistakes, and lessons learned.
- **Absorb the brainstorming brief** — if a `*-brief.md` exists for this topic, carry its assumptions, blind spots, and constraints into the relevant specs' Gotchas sections. These are hard-won insights from `/claude-tweaks:challenge` that should survive.
- **Include known manual steps — but only ones that survive the triage.** The Manual Steps section is reserved for items that have no CLI, require human judgment, or require out-of-band signoff. Infrastructure setup, env var provisioning, and API key creation with CLIs (`terraform`, `gh secret set`, `vercel env add`, `stripe`, `ldcli`, etc.) do NOT belong here — `/build` Step 2.5 auto-classifies and executes them. See `spec-template.md` Manual Steps section for the triage criteria and the `reason-not-auto` qualifier.
- **Write design frontmatter (Phase 2+)** — every generated spec must include `surface:` (from Step 2.5a detection) and, when frontend, `design-intent:` (from Step 2.5c question). For backend/infra specs, write `surface: backend` (or `infra`) and either omit `design-intent:` or set it to `none`. The canonical field reference lives in `spec-template.md`'s "Frontmatter reference (canonical spec)" section.
- **Write issue-tracking frontmatter when the input resolved from a GitHub issue reference** (Resolve-the-input case 1) — write `recon-issue: <number>` on the generated spec, plus `recon-fingerprint: <fp>` when a fingerprint marker was found in the issue body, plus `code-health-effort: <tier>` when the issue carried a `code-health:effort-<tier>` label. This is what lets `/wrap-up`'s close-via-merge and issue-claim-release steps, and `/build`'s effort-based model-tier selection, engage for specs built directly from a single issue, not just via `/flow --from-code-health`'s batch path.
- **Flag high-effort code-health issues for possible decomposition** — when `code-health-effort: high` would be stamped, add a note to the generated spec's Overview section (e.g. "Originating finding was judged high-effort — consider whether this should decompose into multiple specs rather than one oversized unit.") rather than silently producing a single spec that may be too large for `/superpowers:writing-plans` to size well. This is a surfaced consideration, not an automatic split — the human or a later `/specify` pass decides.

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

## Step 5: Multi-Persona Red-Team

Before deleting the design doc, dispatch three persona-instantiated agents (Implementer / Maintainer / Skeptical Reviewer) in one parallel batch to surface ambiguities, gaps, and unstated assumptions. Findings are written **into the spec body** — inline `<!-- ambiguity: ... -->` HTML comments next to flagged sentences, or rows in an appended `## Open Questions` table. No mid-flow prompt — Step 6 Self-Review picks them up.

Read `red-team.md` in this skill's directory for the dispatch prompt (Template A block must remain inlined verbatim in the dispatch prompt at runtime per the Subagent Contract), the three persona lens questions, and the write-back procedure.

---

## Step 6: Spec Self-Review

Before deleting the design doc, look at every spec you wrote with fresh eyes — including the red-team findings just written in Step 5. Fix issues inline — no subagent, no separate review pass. This is also the last chance to catch content the design doc captured but no spec implements.

> **Parallel execution (conditional):** When N ≥ 3 specs are produced, run scope and ambiguity checks across all specs concurrently using parallel Read + Grep calls.

1. **Placeholder scan** — search for the failure patterns in `spec-template.md`'s "No Placeholders" section. Any `TBD`, vague acceptance criteria, undefined types, "standard error handling", or "similar to spec N" — fix them now.
2. **Internal consistency** — across the specs in this decomposition, do referenced types, model names, and endpoint signatures match? A function called `clearLayers()` in spec 42 but `clearFullLayers()` in spec 43 is a bug.
3. **Scope check** — is each spec genuinely a single work unit (3-8 tasks)? If one is doing two things, split it now. If two are doing the same thing, merge them.
4. **Ambiguity check** — could any acceptance criterion be interpreted two different ways? Pick one and make it explicit.
5. **Design-doc coverage** — re-read the design doc with each spec open. If you find a spec requirement the doc captured but no spec implements, add it to the right spec now — the doc is about to be deleted in Step 7.

When all four checks come back clean, proceed to Step 7. No need to re-review after fixing.

---

## Step 7: Delete Consumed Artifacts (only when fully decomposed)

The design doc and brainstorming brief have served their purpose **once every phase has been decomposed into specs and Step 6 Self-Review has confirmed coverage**. Behavior depends on the phase target:

| Decomposition mode | Delete design doc? |
|---|---|
| No `phase-N` argument; doc has 0 phase sections (single-phase) | Yes — fully consumed |
| No `phase-N` argument; doc has N phase sections; all decomposed in this run | Yes — fully consumed |
| `phase-N` argument; only that phase decomposed | **No** — design doc retained for remaining phases. Add a `## Phase N: Specified` marker after the phase heading instead, listing the spec numbers it produced. |
| `phase-N` argument; this was the last un-specified phase | Yes — fully consumed (run delete after marker bookkeeping confirms all phases marked) |

```bash
# Full decomposition (all phases or single-phase):
git rm docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md
git rm docs/plans/YYYY-MM-DD-{topic}-brief.md  # if it exists

# Partial decomposition (phase-N only): commit the marker, keep the doc
git add docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md
git commit -m "docs(specs): mark phase-{N} specified in design doc"
```

When fully consumed, do NOT keep these around. They create dangling references and stale artifacts. The specs are the durable record.

## Step 8: Clean Up INBOX

If the work originated from an INBOX item:

- Remove the entry from `specs/INBOX.md`
- It has been promoted — the specs are the durable artifact now

---

## Step 9: Summary and Commit

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
- Design doc: `docs/superpowers/specs/{filename}` (absorbed into specs)
- Brainstorming brief: `docs/plans/{filename}` (absorbed into spec Gotchas) — if it existed
- INBOX entry: {title} (promoted)

### Diagram suggestions (optional — render only when Step 2.5d emitted any)
- {one or two `**Diagram suggestion:** …` blocks per the format in `_shared/diagram-integration-check.md`}
```

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Created spec `specs/{N}-{title}.md` | `{hash}` |
| Operational | Updated `specs/INDEX.md` | `{hash}` |
| Operational | Deleted design doc + brief | `{hash}` |

**Commit the specs — this is mandatory and is the skill's terminal action, not an optional follow-up.** A spec is the *input* to work, like a ticket: it must exist in committed history on the base branch before any pipeline runs. `/flow` cuts a worktree from base, and a worktree does not contain uncommitted files — an uncommitted spec produces an empty worktree and a build with nothing to build (`/flow` Step 2.4 hard-gates on exactly this). Commit every durable artifact this run produced in one commit: the spec files, `specs/INDEX.md` updates, any audit doc, and the design-doc deletion/marker from Step 7.

```bash
git add specs/ docs/   # specs, INDEX, audit doc, design-doc removal/marker
git commit -m "{message describing the specs created}"
git log --oneline -1   # verify it landed (see _shared/git-discipline.md)
```

By the time Next Actions renders, this commit has already happened.

## Next Actions

Self-routing — render based on what was produced. The specs are **already committed** (Step 9) — never offer "commit then flow" or "have me commit these specs" as an option; that decision is closed before Next Actions renders. Options are purely about *which* specs to pipeline and in *what order*.

This "Situation → options" table is the assistant's own lookup logic to pick which situation applies — it stays internal and is never itself shown to the user or converted into an `AskUserQuestion` option.

| Situation | Options |
|---|---|
| Single spec produced | 1. `/claude-tweaks:flow {N}` — automated pipeline for spec {N}: "{title}" **(Recommended)**<br>2. `/claude-tweaks:build {N}` — build only (no test/review/wrap-up)<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Multiple specs produced from a single phase / single-phase doc | 1. `/claude-tweaks:flow {N1},{N2},...,{Nk}` — sequential pipeline, all specs **(Recommended)**<br>2. `/claude-tweaks:flow {N1}` — pipeline just the highest-priority spec<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Phase-N decomposition with remaining phases in design doc | 1. `/claude-tweaks:flow {N1},{N2},...` — pipeline this phase's specs **(Recommended)**<br>2. `/claude-tweaks:specify {doc} phase-{N+1}` — decompose next phase<br>3. `/claude-tweaks:help` — pipeline dashboard |
| All phases decomposed in one run (large multi-phase decomposition) | 1. `/claude-tweaks:flow {first-phase-spec-ids}` — pipeline phase 1 specs first **(Recommended)**<br>2. `/claude-tweaks:flow {all-spec-ids}` — pipeline everything sequentially (long-running)<br>3. `/claude-tweaks:help` — see the full dependency graph before deciding |

Once the matching situation is resolved, replace the rendering of its numbered list with a call to `AskUserQuestion`: `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and one option per entry in that row — `label`: a short one-line summary (e.g. "Pipeline this spec", "Build only", "Pipeline dashboard"), `description`: the full command text from that entry, the entry marked `(Recommended)` in the table gets `(Recommended)` suffixed on its label.

Always recommend `/flow` over `/build` — `/flow` is the canonical path through the pipeline, and the new shape gate (Step 2.6 in `/flow`) accepts well-structured specs of any size.

## Component-Skill Contract

`/specify` is always user-facing — it does not detect `$PIPELINE_RUN_DIR` because it dispatches `/superpowers:brainstorming` polymorphically rather than being invoked by a pipeline parent. Always renders Next Actions.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Specifying without a codebase scan | Specs need Current State context — without it, `/superpowers:writing-plans` operates on blind assumptions. Step 1's Landscape reads include git log + existing files. The design-doc half of this anti-pattern is no longer possible: polymorphic input invokes `/superpowers:brainstorming` automatically when the input is a bare topic with no existing design doc. |
| Specs that touch every layer | A single spec spanning data + API + UI + infra is too large for agent-sized execution |
| Vague acceptance criteria | "Works correctly" can't be verified — `/superpowers:writing-plans` needs specific, testable assertions |
| Keeping the design doc after specifying | Creates dangling references — the spec is the durable record, the design doc is consumed. Partial (`phase-N`) decomposition is the only exception (see Step 7's table). |
| Silently deciding how to handle overlapping specs | Overlap handling (extend vs. companion vs. replace) is a user decision — present numbered options, don't assume |
| Mis-targeting design pre-steps | Asking design-intent on backend specs is irrelevant; skipping the shape pre-step on frontend specs without offering loses UX value. Step 2.5a's frontend detection gates both — respect it. |
| Writing specs without `surface:` frontmatter | Wrapper Layer 2 detection falls through to file-extension sniff, which is less reliable. Always write `surface:` per the canonical reference in `spec-template.md`. |
| Treating "topic with slash" as a path | Ambiguous input must be disambiguated explicitly — present the numbered choice, do not assume one interpretation |
| Producing a "phase plan" file alongside or instead of specs | Phase plans are dead artifacts. The granularity contract has 2 tiers: design doc (one file, phases as sections) → specs (one file each). Anything else is a contract violation. |
| Bypassing `/specify` on the way to `/flow` | `/flow` is the canonical pipeline path and rejects design docs at Step 2.7 (granularity contract enforcement). Always route through `/specify` first; recommend `/flow` over `/build` when presenting Next Actions. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/superpowers:brainstorming` | Bidirectional: when a design doc already exists, it runs BEFORE /specify and produces the input that /specify consumes and deletes. When the user passes a bare topic (polymorphic input), /specify invokes brainstorming internally to produce the design doc, then decomposes it. |
| `/superpowers:writing-plans` | Consumes specs AFTER /claude-tweaks:specify — the spec must provide enough context for `/superpowers:writing-plans` to produce a TDD execution plan |
| `/superpowers:subagent-driven-development` | Executes specs AFTER /claude-tweaks:specify — uses the plan from `/superpowers:writing-plans` (via `/claude-tweaks:build` subagent execution strategy) |
| `/superpowers:executing-plans` | Executes specs AFTER /claude-tweaks:specify — uses the plan from `/superpowers:writing-plans` (via `/claude-tweaks:build` batched execution strategy) |
| `/claude-tweaks:build` | Runs AFTER /claude-tweaks:specify — takes a single spec and implements it |
| `/claude-tweaks:capture` | Feeds INBOX items that may trigger brainstorming → /claude-tweaks:specify |
| `/claude-tweaks:tidy` | Reviews specs created by /claude-tweaks:specify for staleness. /claude-tweaks:tidy tags INBOX items as `**Promoted:**` — /claude-tweaks:specify Step 8 removes them from INBOX after creating the spec |
| `/claude-tweaks:help` | Shows which specs from /claude-tweaks:specify are ready for /claude-tweaks:build — also uses Key Files for implicit dependency detection |
| `/claude-tweaks:design` | /specify invokes `/claude-tweaks:design shape <topic>` (Step 2.5b) on frontend design docs to enrich the design doc with UX/UI planning. /specify writes `surface:` and `design-intent:` frontmatter (Step 2.5c + Step 3) on every generated spec; the design wrapper reads `surface:` for Layer 2 detection and reads `design-intent:` for `polish` mode's intent-driven dispatch (active in v4.5.0). |
| `_shared/diagram-integration-check.md` | Step 2.5d reads this for the flag check and signal→type mapping. Soft-hook only — emits a recommendation, never invokes the companion plugin. |
| `cathrynlavery/diagram-design` (companion) | Step 2.5d emits "consider a diagram here" recommendations for ALL specs (not gated to frontend) when the design doc describes state machines, schemas, multi-actor flows, decision branches, hierarchies, or architectures. Gated by `diagram-integration: enabled` in CLAUDE.md (written by `/init` Phase 0.95). |
| `/claude-tweaks:research` | Prior-art lookup before authoring a spec — `/research` reports can be cited directly in spec "Background" / "Prior art" sections. |
| `/claude-tweaks:code-health` | `/code-health` files improvement findings as `code-health`-labelled GitHub issues whose body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria); `/specify` promotes such an issue into an agent-sized spec with near-zero translation, stamping `recon-issue:`/`recon-fingerprint:` frontmatter (Resolve-the-input case 1) so `/wrap-up` can close the issue on merge. |
| `/claude-tweaks:challenge` | Runs BEFORE /specify on INBOX items — produces a debiased brief whose assumptions, blind spots, and constraints /specify absorbs into spec Gotchas sections during Step 1 |
| `/claude-tweaks:flow` | Invoked BY /flow when a design doc is passed to /flow Step 2.7 — flow rejects design docs and routes through /specify to enforce the granularity contract before pipeline entry |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
| `_shared/multi-agent-coordination.md` | Canonical primitive for Multi-persona red-team (Mode 3) — three fixed personas, one round, run as part of the self-review step. |
| `_shared/subagent-output-contract.md` | Red-team persona agents emit Template A (findings); follow the status-line and model-tier conventions. |

## Background

`/superpowers:writing-plans` produces multi-phase plan files (`*-P1.md`, `*-P2.md`, …) that exceed `/flow`'s envelope. The legacy path `/superpowers:brainstorming → writing-plans → /flow` had three artifact tiers with the middle tier agent-too-big. The current path is `/superpowers:brainstorming → /specify → /flow` — two artifact tiers where `/specify` produces specs sized for `/flow`'s shape gate. `/superpowers:brainstorming` is unchanged; the granularity contract relies on the user (or a skill caller) routing through `/specify` rather than `writing-plans`.
