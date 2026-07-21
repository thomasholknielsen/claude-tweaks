---
name: claude-tweaks:specify
description: Use when converting a brainstorming design document into agent-sized work units (specs). Takes a design doc and decomposes it into self-contained specifications.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Specify — Shape work records and decompose designs into ready leaf records

Shape a single work record into spec shape, or decompose a brainstorming design document into a parent record plus ready leaf records. Part of the workflow lifecycle:

```
/claude-tweaks:init → /claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → [ /claude-tweaks:specify ] → /claude-tweaks:build → /claude-tweaks:stories → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                                                        ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- A work record reference (`#N` / local record id) needs to be shaped into spec shape before it can reach `ready`
- A brainstorming session produced a design doc that needs decomposing into ready leaf records
- A backlog record's topic has already been through brainstorming — a design doc exists and is ready to decompose
- `/claude-tweaks:help` flags unspecified design docs
- You need to break a large feature into agent-sized leaf records
- **`/claude-tweaks:flow` rejected a design doc** — route through `/specify` first to produce ready leaf records (this is the granularity contract enforcement path)
- You want to decompose a single phase from a multi-phase design doc — use the optional `phase-N` argument

## The Granularity Contract

The plugin enforces a 2-tier artifact taxonomy:

| Tier | Artifact | Producer | Consumer |
|---|---|---|---|
| Strategic | Design doc (one file, multi-phase OK as `## Phase N` sections) | `/superpowers:brainstorming` (superpowers, unchanged) — produces a single design doc by convention | `/claude-tweaks:specify` |
| Executional | Ready leaf record (spec-shaped body, agent-sized; a decomposition's parent record is never `ready`) | `/claude-tweaks:specify` | `/claude-tweaks:flow`, `/claude-tweaks:build`, `/claude-tweaks:dispatch` |

`/claude-tweaks:specify` is the canonical entry point — its polymorphic input accepts a work record reference, a design doc path, a topic, or a backlog reference. A record reference is shaped in place (**shaping mode**, below); a design doc — read directly, matched from a topic, or produced by invoking `/superpowers:brainstorming` internally for a bare topic with no existing doc — decomposes into a parent record plus ready leaf records (**decomposition mode**, Steps 1-9). The contract holds at two enforcement points: this skill's phase-aware decomposition and `/flow`'s Step 2.7 design-doc rejection. See the "Background" section near the end of this file for the historical context on why `/superpowers:writing-plans` is bypassed.

## Input

`$ARGUMENTS` = `<record-ref-or-design-doc-or-topic> [phase-N]`

The first argument is a work record reference (`#N`, an issue URL, or a bare local record id), a path to a design doc, a topic name, or a backlog reference. The optional second argument `phase-N` (where N is a phase number from the design doc's `## Phase N` sections) scopes decomposition to one phase only — useful when running phases incrementally or in parallel. `phase-N` only applies when the input resolves to a design doc (decomposition mode); a work record reference resolves to shaping mode and ignores it.

Input is polymorphic — see the canonical definition in the Granularity Contract section above. The resolution steps below handle each input shape.

**Phase target examples:**

```
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md           → decompose ALL phases (or whole doc if no phases)
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md phase-2   → decompose phase 2 only
/claude-tweaks:specify food graph                                → resolve to design doc, decompose all
/claude-tweaks:specify food graph phase-3                        → resolve to design doc, decompose phase 3 only
/claude-tweaks:specify #142                                      → shape record #142 in place
```

**Phase detection:** scan the design doc for `^## Phase \d+` headings. If 0 found and no `phase-N` was given, treat the whole doc as one phase. If 1+ found and no `phase-N` was given, decompose all phases sequentially. If `phase-N` was given but the section doesn't exist, stop and present the available phases as numbered options.

### Resolve the input:

1. **Work record reference** — a URL matching `https://github.com/{owner}/{repo}/issues/{n}`, or a shorthand like `#123` / `issue 123` / `gh-123`, or a bare local record id (e.g. `42`). Checked *before* case 2's path/topic disambiguation, since an issue URL contains `/` and would otherwise misparse as a design-doc path. Fetch it directly: `gh issue view {n} --json number,title,body,url,labels` (GitHub driver) or glob `specs/{n}-*.md` for the matching file, then `readRecord(path)` (`bin/lib/issues/local-store.js`; local-files driver). Enter **shaping mode** (below) — the record IS the target, not a source to translate; there is no recon-* extraction. Scoring is read from the fetched labels via `parseRecordFacets` (`bin/lib/issues/record.js`) or the record's `facets` (local) only to decide which of `risk:*`/`effort:*` shaping mode still needs to stamp — never to gate whether shaping runs.
2. **Design doc path** (e.g., `docs/superpowers/specs/2026-02-21-meal-planning-design.md`) — read it directly. Disambiguation rule: a string containing `/` or ending in `.md`, that didn't match case 1 above, is treated as a path. Enter **decomposition mode** (Step 1 onward).
3. **Topic name** (e.g., `meal planning`) — search `docs/superpowers/specs/*-design.md` for a matching design doc. If found, read it directly and enter **decomposition mode**.
4. **Topic name with no matching design doc** — invoke superpowers `/superpowers:brainstorming` via the Skill tool with the topic as input (this is the polymorphic-input branch defined above). The brainstorming session produces a design doc at `docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md` (or wherever superpowers writes it). Wait for `/superpowers:brainstorming` to complete, then continue with the produced design doc as the input, entering **decomposition mode**. **Do not** prompt the user to "run brainstorm first" — that defeats the contract.
5. **Backlog reference** (e.g., `"Voice shopping list"`) — a record query, not a file lookup: search open records by title keywords — `gh issue list --search "{keywords}" --state open --json number,title,body,labels` (GitHub driver) or `queryRecords('specs', {})` (`bin/lib/issues/local-store.js`; local-files driver), filtered to titles matching the keywords. Then check whether a design doc already exists for the matched topic (same lookup as case 3): if one does, read it and enter **decomposition mode**; if not, enter **shaping mode** directly on the matched record. A backlog reference never invokes brainstorming on its own — that only happens via case 4, when the reference resolves to a bare topic with no existing record at all.

**Ambiguous input handling:** A topic name that *could* also be interpreted as a path (e.g., a topic with a `/` in it like "auth/login flow") is ambiguous. Stop and call `AskUserQuestion` with:

- `question`: `"'{input}' could be a topic name or a path. Which did you mean?"`, `header`: `"Input type"`, `multiSelect`: `false`
- Option 1 — `label`: `"Topic name"`, `description`: `"invoke /superpowers:brainstorming to produce a design doc"`
- Option 2 — `label`: `"Design doc path"`, `description`: `"read the file directly"`

This explicit disambiguation prevents the silent wrong-path failure flagged by past polymorphic-input edge cases.

## Shaping mode (single record)

Entered from Resolve-the-input case 1 (work record reference) or case 5 (backlog reference with no matching design doc). The record already exists and IS the target — there is nothing to decompose. This section is fully self-contained: once it completes, skip directly to `## Next Actions` near the end of this file. Steps 1 through 9 below belong to decomposition mode only and never run here.

### Edit the body into spec shape

Rewrite the record's body into five sections: `## Current State`, `## Deliverables`, `## Acceptance Criteria`, `## Technical Approach`, and `## Gotchas`. These are the core of the record body template `spec-template.md` documents — Current State, Deliverables, and Acceptance Criteria are the structural minimum (`_shared/work-record.md`'s spec-shaped-body check re-verifies exactly these three are present and non-empty before the authorization gate will grant anything); Technical Approach and Gotchas can stay brief for a small record. The template's fuller section list (Overview, Non-Goals, Prerequisites, and so on) is decomposition-mode scaffolding for multi-record output — a single shaped record doesn't need it.

Absorb the record's existing content into whichever section it belongs in — a human-filed or captured record's raw text usually becomes Current State plus Deliverables context, with Acceptance Criteria freshly written since raw captures rarely state them explicitly. A record already filed in this shape — every `by:code-health`/`by:harness-health`/`by:journey-health`/`by:docs-health` record is spec-shaped and agent-sized by construction, per `_shared/work-record.md`'s born-ready rule — needs near-zero translation: verify the sections are present and non-empty and move on rather than rewriting content that's already correct.

### Preserve the original request

Before editing, keep the record's fetched title and body exactly as they were. Append them to the composed body as their own section, using this exact heading — this is a rule, not a suggestion, and the section name is literal:

```
## Original request

{original title}

{original body, verbatim}
```

The shaped sections above are `/specify`'s editorial interpretation; `## Original request` is the record's ground truth if that interpretation ever needs to be checked or redone.

### Metadata block

Run Step 2.5a's frontend-detection sniff (`design-pre-steps.md`) against the record's own content — not a design doc — to decide `Surface:`. When frontend, also run Step 2.5c's design-intent question to decide `Design-intent:`. Insert a metadata block at the very top of the composed body, above `## Current State` and above `## Original request`:

```
Surface: web
Design-intent: {value}
```

Backend/infra records omit the `Design-intent:` line entirely — it only applies when Step 2.5a detected a frontend surface:

```
Surface: backend
```

These are plain body-metadata lines, not YAML frontmatter — capitalized keys, no code fence, no `---` markers. This is the wire format `/flow`/`/build` (spec 20's materialization step) lift into the build-time header; the canonical field and value reference lives in `spec-template.md`.

### Stamp scoring and stage labels

Using the facets already read in Resolve-the-input case 1/5 (`parseRecordFacets` for GitHub, the record's own `facets` for local), update independently per family — never touch a family that's already stamped:

- **`risk:*` absent** — judge low/medium/high from the now-shaped Deliverables and Acceptance Criteria (blast radius, reversibility), per `_shared/work-record.md`'s Scoring axis, then stamp it.
- **`effort:*` absent** — judge low/medium/high the same way (estimated size), then stamp it.
- **`ceremony:*` absent** — invoke `/claude-tweaks:assess-agent-autonomy` in `ceremony-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check #{n}")`) against the now-shaped body — the same input a fresh fetch would use, but already in memory here. Stamp the verdict as an explicit label, `ceremony:fast-lane` or `ceremony:standard` — never omit it, unlike `risk:*`/`effort:*`'s omit-when-unscored convention (this axis has no unscored state; every record gets a verdict the first time it's shaped). Bootstrap both label values per `_shared/label-bootstrap.md` before the first write, same as any new label pair.
- **Type absent** — judge `bug | feature | task` from the now-shaped content (defect vs. new capability vs. maintenance/refactor/docs/chore), per `_shared/work-record.md`'s Type axis, then stamp it: `work-backend: github-issues` — `work-types: native` applies the native Issue Type (`--type {t}` on the edit call below); `work-types: labels` adds the matching label instead (`--add-label "type:{t}"`, pair lives in `record.js`'s `TYPE_LABELS` — bootstrap it first per `_shared/label-bootstrap.md`, as decomposition mode does). `work-backend: local-files` — set `facets.type` in the `writeRecord` call below.
- **`parked` present** — remove it; a record entering shaping mode is being promoted out of hold.
- **`ready`** — add it (idempotent when already present, e.g. a born-ready record).

### Compose-then-write-once

Assemble the full new body locally before making any write call — never edit the body incrementally against a live record. Final assembly order (`Design-intent:` omitted for non-frontend records):

```
Surface: {value}
Design-intent: {value}

## Current State
...

## Deliverables
...

## Acceptance Criteria
...

## Technical Approach
...

## Gotchas
...

## Original request

{original title}

{original body, verbatim}
```

**`work-backend: github-issues`:** write the composed body to a temp file, then a single call carries both the body and every label change (`--type {t}` under `work-types: native`; swap to `--add-label "type:{t}"` under `work-types: labels`):

```bash
gh issue edit {n} \
  --body-file /tmp/specify-shaped-body.md \
  --add-label ready \
  --add-label "risk:{tier}" \
  --add-label "effort:{tier}" \
  --add-label "ceremony:{tier}" \
  --type {t} \
  --remove-label parked
```

Omit `--add-label "risk:{tier}"` / `--add-label "effort:{tier}"` / `--add-label "ceremony:{tier}"` for whichever family was already stamped; omit `--type {t}` (or the `--add-label "type:{t}"` swap) when Type was already present; omit `--remove-label parked` when the record never carried it.

**`work-backend: local-files`:** one `writeRecord` call does the same job, setting `facets.stage: 'ready'` (which supersedes any prior `'parked'` value — the two are mutually exclusive states) and filling `facets.risk`/`facets.effort`/`facets.ceremony`/`facets.type` when they were `null` (`facets.ceremony` always gets a value the first time a record is shaped — no null/unscored state for this axis, unlike `risk`/`effort`):

```bash
node -e "const {writeRecord}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
  writeRecord(process.argv[1], { title: process.argv[2], body: process.argv[3], facets: JSON.parse(process.argv[4]) });
" "$RECORD_PATH" "$TITLE" "$SHAPED_BODY" "$FACETS_JSON"
```

then commit — a local record is a tracked file, unlike a GitHub issue edit:

```bash
git add "$RECORD_PATH"
git commit -m "Shape record {id} into spec shape — ready"
```

Nothing to commit on the `github-issues` driver — the edit above already landed via the API.

Shaping mode ends here — proceed directly to `## Next Actions`.

`/specify` adds `ready`, `risk:*`/`effort:*` (when unstamped), and Type (when absent), removes `parked` on promotion, and never touches `auto:*` or `bot:*` — those stay `/triage`'s (human-granted authorization) and `/dispatch`'s (bot-state mirror) territory.

## Step 1: Understand the Landscape

> **Parallel execution:** Use parallel tool calls aggressively — all reads and searches below are independent and should run concurrently. Front-load all I/O before analysis.

1. **The design doc** — understand what was decided, the scope, and the technical approach
2. **The brainstorming brief** (if one exists in `docs/plans/*-brief.md` for this topic) — contains assumptions surfaced by `/claude-tweaks:challenge`, blind spots, and constraints. These should be absorbed into leaf Gotchas sections.
3. **Open records** — the record store itself is the current landscape; there is no separate index file to read. Query once, per driver, fetching the union of fields both this step and Step 3's Idempotency map need so Step 3 can reuse this same fetch instead of paying for a second round-trip: `work-backend: github-issues` — `gh issue list --state all --json number,title,labels,body,state --limit 200 > /tmp/specify-all-issues.json`, then filter in-memory to `state === 'OPEN'` and run `parseRecordFacets` (`bin/lib/issues/record.js`) over each issue's `labels` for this step's Landscape/Overlap Analysis use. Fetching `--state all` here (rather than `--state open`) is deliberate — Step 3's Idempotency map needs the closed records too, and reuses `/tmp/specify-all-issues.json` directly instead of re-fetching (see Step 3). `work-backend: local-files` — `queryRecords('specs', {})` (`bin/lib/issues/local-store.js`), which returns parsed `facets` directly.
4. **Every open record's body** (from the query above) — scan for overlap with the design doc's scope; feeds the File Reference Map below.
5. **Recent git log** — check if any part of the design has already been implemented
6. **The codebase** — identify existing files, schemas, APIs, and patterns that the new work will build on. This context is critical for writing leaf records that `/superpowers:writing-plans` can act on.

### File Reference Map

Extract the `### Key Files` subsection (under `## Technical Approach`, per `spec-template.md`'s record body template) from every open record's body to build a file→record map:

```
src/components/ShoppingList.tsx → #41, #45
src/api/items.ts → #41
src/pages/shopping.tsx → #45, #52
```

Records without a `Key Files` subsection contribute nothing to the map — a record still in `backlog` or `parked` isn't spec-shaped yet, so it has no such section; skip it silently rather than treating the absence as an error. `work-backend: local-files` — same extraction, over every file `queryRecords('specs', {})` returns; reference by record id instead of `#N`. "Non-completed" is automatic for local records: there's no separate closed-but-visible state the way GitHub issues have — a local record's file is gone once its work is done, so every file the query returns is by definition still open.

This map is used in Step 2 to detect implicit file-based dependencies when creating new leaves. If a new leaf will touch files that an open record also touches, that's an implicit dependency — even if neither one names the other yet.

### Overlap Analysis

For each major section/feature in the design doc, classify coverage against the open records found above:

| Coverage | Meaning |
|----------|---------|
| **Already exists** | An open record covers this fully |
| **Partial overlap** | An open record covers part of this |
| **Gap** | No open record addresses this |

**For each item with overlap:**

### Auto mode (policy lookup)

When a pipeline run directory exists, read `overlap` from `config.yml` (default `companion`). Apply per policy:

| Policy | Action | Log entry |
|---|---|---|
| `companion` (default) | Add a new leaf to the Step 2 work-unit set, noting its dependency on the overlapping record — the record itself is created with the rest of the batch in Step 3, and its `Blocked by #N` link is wired in Step 4's linking pass; no separate write here. Reversible — the leaf is its own record. | `AUTO {time} — Step 1: overlap "{section}" ↔ record {ref} resolved as companion leaf, Blocked by {ref}.` |
| `skip` | Auto-skip — don't create a leaf for this section. Note in summary. | `AUTO {time} — Step 1: overlap "{section}" ↔ record {ref} resolved as skip — already covered.` |
| `extend` | Stage as `staged/specify-overlap-{ref}.md` containing the proposed additions to the record's body. NEVER auto-modify an existing record's body — that's not reversible enough. | `STAGED {time} — Step 1: overlap "{section}" ↔ record {ref} requires extending an open record. Stage path: staged/specify-overlap-{ref}.md.` |
| `replace` | Stage as `staged/specify-overlap-{ref}.md`. Replacement is destructive; the user must approve at the Review Console. | `STAGED {time} — Step 1: overlap "{section}" ↔ record {ref} proposed as replacement. Stage path: staged/specify-overlap-{ref}.md.` |

`{ref}` is `#{N}` under `work-backend: github-issues`, the bare record id under `local-files`.

### Interactive mode (batch per-overlap decisions)

Collect ALL overlaps first, then present as one batch table. Per CLAUDE.md, never present per-item prompts when 2+ items can batch — that scales badly when a design doc overlaps with multiple open records.

```
Overlap analysis — {M} overlap(s) found:

| # | Section | Existing record | Coverage | Recommended | Override? |
|---|---------|-----------------|----------|-------------|-----------|
| 1 | "{section A}" | {ref}: "{title}" | Already exists | Skip | (1) skip / (2) extend / (3) companion / (4) replace |
| 2 | "{section B}" | {ref}: "{title}" | Partial overlap | Companion (Recommended) | (1) skip / (2) extend / (3) companion / (4) replace |
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

After decomposing into work units, before creating any records, build the input set — every new work unit plus every open record (from the file reference map in Step 1), each as `{id, keyFiles}` — and partition it with the shared grouping primitive:

```bash
node -e "
  const { groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const items = require('/tmp/specify-key-files.json'); // [{id, keyFiles}] — new work units + open records
  console.log(JSON.stringify(groupByFileOverlap(items).filter(g => g.length > 1)));
"
```

Each returned group of size > 1 is a set of records/work-units sharing at least one file, directly or transitively. Classify each new work unit's group membership:

| Overlap Type | Meaning | Action |
|-------------|---------|--------|
| Grouped with a **not-started** record (no `bot:in-progress`) | Potential conflict — both will modify the same files | Flag for a `Blocked by #N` link in Step 4, or reorder to avoid concurrent modification |
| Grouped with an **in-progress** record (`bot:in-progress`) | Active conflict — concurrent changes to the same files | Flag for a `Blocked by #N` link in Step 4 — wait for the in-progress record to finish |
| Grouped with another **new** work unit from this decomposition | Internal conflict within the batch | Flag the dependency between the two resulting leaves for Step 4's linking pass |

`work-backend: local-files` carries no bot-state signal (`_shared/work-record.md`: "the local driver carries no bot state") — every group membership with an existing local record collapses to the first row; there's no in-progress distinction available to make.

(Closed records are excluded from the input set entirely — no group they'd appear in needs action.)

Present any detected implicit dependencies as part of the Step 9 summary. These are flagged alongside the `Blocked by #N` relationships already noted from Overlap Analysis — both feed the same Step 4 linking pass, which is where the actual links get written, once every record's number exists.

> **Algorithm shared with /claude-tweaks:help:** both /specify and /help call the same `groupByFileOverlap` (`bin/lib/issues/grouping.js`) — /specify runs it at creation time; /help re-runs it at dashboard time to catch new conflicts from records that started building after /specify ran. Also reused by `/claude-tweaks:triage dispatch` to group claimed issues before parallel execution (see `triage/SKILL.md`).

> **Why this matters:** An explicit `Blocked by #N` link captures a logical dependency (leaf B needs leaf A's API). File-based overlap captures a physical dependency (both leaves modify the same file). Missing the physical dependency leads to merge conflicts and duplicated work during concurrent builds.

## Step 2.5: Design Pre-Steps (frontend specs only)

Before creating leaf records, run frontend detection and two design pre-steps when the design doc covers a frontend surface — these capture design context (`shape`) and creative direction (`design-intent:`) so the resulting specs carry both forward to `/build` and `/flow`'s polish phase. For the frontend-detection sniff rules, the shape pre-step auto/interactive behavior, and the design-intent question + answer-mapping table, read `design-pre-steps.md` in this skill's directory.

For non-frontend design docs (no frontend signals detected), skip this step entirely — set `surface: backend` (or `infra`) on each generated spec; do not write `design-intent:`.

## Step 2.5d: Diagram Suggestion (all surfaces)

**Unlike Step 2.5, this runs for every surface** — architecture, ER, sequence, and state diagrams help backend and infra specs equally.

Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 11). When the flag is `disabled` or missing, skip this step silently.

When `enabled`, scan the design doc text + decomposed record titles for structural signals. Use this detection table:

| Signal in design doc | Diagram type (suggest) |
|----------------------|------------------------|
| Phrases like "state machine", "states:", "transitions from … to …", named status enums (3+ values) | `state` |
| Schema definitions, `entity`, `references`, `foreign key`, ORM relations between 2+ tables | `er` |
| 3+ services / actors / queues exchanging messages or HTTP calls | `sequence` |
| 3+ named branches in a decision (`If A then B; if C then D; otherwise E`) | `flowchart` |
| 3+ system components / boxes in a layout (microservices, layers, gateways) | `architecture` |
| Parent-child taxonomy with 2+ levels (categories → subcategories → items) | `tree` |

Emit at most **two** recommendations per design doc — the two strongest matches. Skip emission entirely if no signal matches (trivial records and refactors should not trigger the hook).

For each emitted recommendation:

```
**Diagram suggestion:** This design doc describes a state machine for orders
(pending → paid → shipped → delivered → refunded). Consider a state diagram:
`/claude-tweaks:visualize state {spec-slug} --source specify`
```

Place these recommendations in the Step 9 summary under a `### Diagram suggestions` block. They are advisory — they do not block decomposition, do not write spec frontmatter, and do not invoke any tool. The user decides whether to act in the next conversation turn.

**Auto mode:** the diagram suggestion is always advisory — `auto` mode emits the recommendation without prompting, logs `STAGED {time} — Step 2.5d: diagram-suggestion ({type}) for {spec/slug}. Reversibility: high.` to the decision log, and continues. No mid-flow stop.

## Step 3: Create the records

Records are created **parent-first**: the parent's number has to exist before any leaf can link to it. Every body is composed fully in memory before any write call — compose-then-write-once, the same discipline Shaping mode uses.

### Idempotency (resume path)

Every record this step creates carries a deterministic fingerprint: `{design-doc-slug}:parent` for the parent, `{design-doc-slug}:{unit-slug}` for each leaf. The same design doc always produces the same fingerprint for the same record — that determinism is what makes the check below a real resume path instead of a one-shot guard. **A unit slug must never be the literal string `parent`** — that value is reserved for the parent record's own fingerprint; a leaf slugified to `parent` would collide with it in the map below.

Before creating anything, build a fingerprint→number map of every existing marker, once:

`work-backend: github-issues` — reuse Step 1's `/tmp/specify-all-issues.json` (already fetched `--state all --json number,title,labels,body,state`, the REST list, NOT the search index — the search index lags behind fresh writes, including this same run's own); no second `gh issue list` round-trip:

```bash
node -e "
  const { extractFingerprint } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/specify-all-issues.json');
  const map = {};
  for (const i of issues) { const fp = extractFingerprint(i.body); if (fp && !(fp in map)) map[fp] = i.number; }
  require('fs').writeFileSync('/tmp/specify-existing-fingerprints.json', JSON.stringify(map));
"
```

If `/tmp/specify-all-issues.json` is unavailable (a resumed decomposition run in a fresh session with no Step 1 state from this session — shaping mode never reaches this step, so this only matters for a resumed decomposition), fall back to fetching it fresh: `gh issue list --state all --json number,title,labels,body,state --limit 200 > /tmp/specify-all-issues.json`.

`work-backend: local-files` (the local marker search — same idea, read every record body and extract its marker):

```bash
node -e "
  const { queryRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
  const { extractFingerprint } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const map = {};
  for (const r of queryRecords('specs', {})) { const fp = extractFingerprint(r.body); if (fp && !(fp in map)) map[fp] = r.id; }
  require('fs').writeFileSync('/tmp/specify-existing-fingerprints.json', JSON.stringify(map));
"
```

Then, immediately before **each individual create** — parent included, and not just once against the batch list above — re-check that record's fingerprint against the map. A match means the record already exists (a prior partial run, or a concurrent one): skip the create and use the mapped number instead — the parent's number for the leaves to link to, a leaf's number for Step 4's linking pass. On every successful create, add the new record's fingerprint and number to the in-memory map before moving on — this catches a same-run collision (two units that happen to slugify to the same name) exactly the way it catches a prior-run resume, since the map stays live for the whole loop rather than being a snapshot trusted for its duration.

### Parent record

One parent per decomposition run (or per `phase-N`, when scoped — see Step 7's phase table). Type is always `feature` — the parent is a summary record, not agent-sized work: **parents never get `ready`**, and they carry no `risk:*`/`effort:*` scoring at all.

Parent body = design summary: the problem, the chosen approach, the key decisions, and why the alternatives lost. This is deliberately not the design doc pasted verbatim — it's the durable digest that has to survive Step 7 deleting the design doc. Prefix it with a one-line metadata block, `Surface: {value}` — reuse whatever Step 2.5a's whole-design-doc detection already produced (the canonical value list lives in `spec-template.md`). The parent never carries `Design-intent:` — parents are never built or polished directly, so creative intent has nothing to attach to.

```bash
node -e "const {recordPayload}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
  const p=recordPayload({title:process.argv[1], body:process.argv[2], type:'feature', fingerprint:process.argv[3]});
  require('fs').writeFileSync('/tmp/specify-parent-payload.json', JSON.stringify(p))" "$PARENT_TITLE" "$PARENT_BODY" "${DESIGN_DOC_SLUG}:parent"

node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/specify-parent-payload.json','utf8')).body)" > /tmp/specify-parent-body.md
```

`recordPayload` returns zero labels for the parent — no origin, no scoring, no `ready` — the only label that can ever apply is `type:feature`, and only under `work-types: labels`; bootstrap it first (per `_shared/label-bootstrap.md`, `LABELS_JSON = [["type:feature", "Type: new capability or enhancement"]]`, the pair from `record.js`'s `TYPE_LABELS`). The `{design-doc-slug}:parent` fingerprint rides in the body as the standard marker — every machine-filed record carries one (`_shared/work-record.md`), and it's what the Idempotency map above keys the parent's resume on.

**`work-backend: github-issues`** — the Type expression branch (`_shared/work-record.md`'s config-key table; read `work-types` once, never re-probe mid-flow):

```bash
# work-types: native
PARENT_URL=$(gh issue create --title "$PARENT_TITLE" --body-file /tmp/specify-parent-body.md --type feature)
# work-types: labels
PARENT_URL=$(gh issue create --title "$PARENT_TITLE" --body-file /tmp/specify-parent-body.md --label type:feature)

PARENT_NUM=$(basename "$PARENT_URL")
```

**`work-backend: local-files`:** use `createRecord`, not `allocateId`+`writeRecord` separately — two near-simultaneous decomposition runs (or a `/specify` decomposition racing a `/capture` filing) calling `allocateId`+`writeRecord` independently can both read the same directory listing, both compute the same next id, and both succeed under different slugs — two records silently sharing one numeric id, corrupting any later `facets.parent`/`facets.blockedBy` reference that assumes id uniqueness (exactly the kind of reference this decomposition is about to write). `createRecord` closes that race by allocating the id and writing the file as one atomic step (see `bin/lib/issues/local-store.js`'s header comments on `allocateId` and `createRecord`; the same fix `capture/SKILL.md`'s local-files branch already applies). The slug is `deriveSlug(title, existingSlugs)` from that same module — not a hand-derived slugification:

```bash
PARENT_ID=$(node -e "const fs=require('fs');
  const {createRecord, deriveSlug}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
  const dir='specs';
  const existingSlugs=fs.existsSync(dir)
    ? fs.readdirSync(dir).map((n)=>/^\d+-(.+)\.md$/.exec(n)).filter(Boolean).map((m)=>m[1])
    : [];
  const slug=deriveSlug(process.argv[1], existingSlugs);
  const body=fs.readFileSync('/tmp/specify-parent-body.md', 'utf8');
  const record=createRecord(dir, { slug, title: process.argv[1], body, facets: { type: 'feature' } });
  console.log(record.id)" "$PARENT_TITLE")
```

`$PARENT_NUM` / `$PARENT_ID` is now captured — every leaf below links back to it.

**If parent creation fails** (`gh` unreachable, transient API error): fall back to `local-store.js` for the parent — same `unsynced: true` fallback as the leaf-level one below — and run the rest of this decomposition on the local driver too, so leaves have a real parent to link to instead of a GitHub record that doesn't exist. `/tidy`'s Sync finding reconciles the whole family later.

**Resuming after a partial run:** nothing parent-specific — the Idempotency map above already covers it. A `{design-doc-slug}:parent` marker match means a prior run created this parent; reuse the mapped number and skip the create, exactly as with any leaf. Never fall back to a title search — `gh issue list --search` rides the search index this step deliberately avoids.

### Leaves

**Only leaves get `ready`** — and only leaves carry `risk:*`/`effort:*` scoring; the parent gets neither. One per work unit from Step 2, in any order — Step 4 does the linking once every number exists, so creation order doesn't matter.

**Tasks never become records.** A leaf's own internal breakdown — the Deliverables checklist, the Acceptance Criteria list — stays exactly that: a checklist inside the leaf's body. `/superpowers:writing-plans` turns it into an execution plan at build time; nothing at this granularity spawns a further issue per task.

**Body** — spec-shaped per `spec-template.md`'s record body template, prefixed with the metadata block (`Surface: {value}` and, when the unit is frontend-flavored, `Design-intent: {value}`) — the identical per-record procedure Shaping mode's Metadata block subsection already documents, just run once per leaf instead of once per shaped record. Under `work-backend: github-issues` + `work-links: body-text`, also prefix `Parent: #$PARENT_NUM` — already known at this point (Parent record, above, runs first) and the only combination where nothing else records a leaf's own parent (`spec-template.md`).

**Type** — matches the parent (`feature`) unless the unit is clearly a defect fix (a bug report, a regression, broken behavior) — override to `bug` in that case.

**Scoring** — judge each leaf's `risk` and `effort` (low/medium/high each) from its own Deliverables and Acceptance Criteria — blast radius and reversibility for `risk`, estimated size and file spread for `effort` — per `_shared/work-record.md`'s Scoring axis. This is the same judgment Shaping mode's stamping step applies to a single record, run here once per leaf; the tiers become `$LEAF_RISK`/`$LEAF_EFFORT` below.

**Ceremony** — invoke `/claude-tweaks:assess-agent-autonomy` in `ceremony-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check")`) against this leaf's own composed body — never the parent, which carries no `ceremony:*` label either, mirroring the no-risk/effort-on-parents rule above. The verdict (always explicit — no unscored state for this axis) becomes `$LEAF_CEREMONY` below.

**Slug derivation** — `$UNIT_SLUG` is `deriveSlug(title, existingSlugs)` (`bin/lib/issues/local-store.js`) — the same deterministic algorithm `/claude-tweaks:capture` and `/claude-tweaks:demo` use for their own record creation, not a hand-derived slugification. Seed `existingSlugs` with the literal string `'parent'` (a leaf slug must never collide with the parent's reserved fingerprint suffix — see above) plus, under `work-backend: local-files`, the current `specs/` directory listing (same scan `/claude-tweaks:capture`'s local-files branch uses — since each leaf's `createRecord` call below writes its file before the next leaf runs, this rescan also naturally dedupes against slugs already assigned earlier in this same decomposition loop):

```bash
UNIT_SLUG=$(node -e "const fs=require('fs');
  const {deriveSlug}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
  const dir='specs';
  const onDisk=fs.existsSync(dir)
    ? fs.readdirSync(dir).map((n)=>/^\d+-(.+)\.md$/.exec(n)).filter(Boolean).map((m)=>m[1])
    : [];
  console.log(deriveSlug(process.argv[1], ['parent', ...onDisk]))" "$LEAF_TITLE")
```

Reuse this same `$UNIT_SLUG` value below for both the fingerprint and, under `work-backend: local-files`, the record's own slug — do not re-derive it separately at write time.

**Fingerprint** — `{design-doc-slug}:{unit-slug}` (`$UNIT_SLUG` from Slug derivation, above), the leaf half of the deterministic scheme the Idempotency section above defines.

```bash
node -e "const {recordPayload}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
  const p=recordPayload({
    title: process.argv[1], body: process.argv[2], type: process.argv[3],
    risk: process.argv[4], effort: process.argv[5], ceremony: process.argv[6], ready: true,
    fingerprint: process.argv[7]
  });
  require('fs').writeFileSync('/tmp/specify-leaf-payload.json', JSON.stringify(p))" \
  "$LEAF_TITLE" "$LEAF_BODY" "$LEAF_TYPE" "$LEAF_RISK" "$LEAF_EFFORT" "$LEAF_CEREMONY" "${DESIGN_DOC_SLUG}:${UNIT_SLUG}"

node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/specify-leaf-payload.json','utf8')).body)" > /tmp/specify-leaf-body.md
```

`recordPayload` embeds the fingerprint as `<!-- work-fingerprint: {design-doc-slug}:{unit-slug} -->` in the returned body — `/tmp/specify-leaf-body.md` above already carries it, so both drivers below write the same fingerprinted text.

Bootstrap the labels this run is about to apply before the first create (per `_shared/label-bootstrap.md`): `ready` plus every `risk:{tier}`/`effort:{tier}`/`ceremony:{tier}` pair in use — and, under `work-types: labels`, the `type:{t}` pairs from `record.js`'s `TYPE_LABELS`, as with the parent.

**`work-backend: github-issues`** — same Type expression branch as the parent. The four `--label` flags are exactly the payload's `.labels`: `recordPayload` emitted `risk:{tier}`, `effort:{tier}`, `ceremony:{tier}`, `ready` and nothing else, because no `origin` was passed — a decomposition is human-shaped work, not a health-skill filing, so leaves carry no `by:*` label:

```bash
# work-types: native
LEAF_URL=$(gh issue create --title "$LEAF_TITLE" --body-file /tmp/specify-leaf-body.md \
  --type "$LEAF_TYPE" \
  --label "risk:$LEAF_RISK" --label "effort:$LEAF_EFFORT" --label "ceremony:$LEAF_CEREMONY" --label ready)

# work-types: labels
LEAF_URL=$(gh issue create --title "$LEAF_TITLE" --body-file /tmp/specify-leaf-body.md \
  --label "risk:$LEAF_RISK" --label "effort:$LEAF_EFFORT" --label "ceremony:$LEAF_CEREMONY" --label ready \
  --label "type:$LEAF_TYPE")

LEAF_NUM=$(basename "$LEAF_URL")
```

**`work-backend: local-files`** — use `createRecord`, not `allocateId`+`writeRecord` separately, for the same concurrent-creation-race reason as the parent above (`createRecord` allocates the id and writes the file as one atomic step; see `bin/lib/issues/local-store.js`'s header comments). One call carries the same state as facets: `stage: 'ready'` instead of the `ready` label, `origin` omitted for the same no-`by:*` reason. `/tmp/specify-leaf-body.md` already carries the fingerprint marker, so the local write preserves it:

```bash
LEAF_ID=$(node -e "const {createRecord}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
  const body = require('fs').readFileSync('/tmp/specify-leaf-body.md', 'utf8');
  const record = createRecord('specs', {
    slug: process.argv[1],
    title: process.argv[2],
    body,
    facets: { type: process.argv[3], risk: process.argv[4], effort: process.argv[5], ceremony: process.argv[6], stage: 'ready' }
  });
  console.log(record.id)" "$UNIT_SLUG" "$LEAF_TITLE" "$LEAF_TYPE" "$LEAF_RISK" "$LEAF_EFFORT" "$LEAF_CEREMONY")
```

Capture `$LEAF_NUM` / `$LEAF_ID` for every leaf (created or resumed via the Idempotency map) — Step 4's linking pass consumes them.

**Write-path resilience.** A `gh` create failure for one leaf (the parent already exists on GitHub) falls back to `local-store.js` for that leaf only — write it locally with `unsynced: true` (fingerprint preserved, so a later sync still dedups correctly) and continue with the rest of the batch. Don't abort the whole decomposition over one failed leaf. `/tidy`'s Sync finding reconciles the local leaf onto GitHub on a later pass. The same rule applies to Step 4's linking edits below — a failed link gets noted and the pass continues, it doesn't roll back everything already created.

**Body size ceiling.** A leaf body pushing past roughly 50KB (GitHub's hard cap is 65,536 characters) is a decomposition smell, not a formatting problem — split the unit further rather than shipping an oversized leaf.

### Rules

- **Absorb decisions from the design doc** — each leaf must be self-contained. The design doc will be deleted (Step 7), so all rationale, decisions, and technical context relevant to that leaf lives in its own body.
- **Be specific about files** — "update the API" is too vague. Name the exact file and what to add.
- **Include testable acceptance criteria** — not "works correctly" but specific assertions an agent can verify.
- **Include gotchas from project memory** — search CLAUDE.md and memory files for relevant patterns, common mistakes, and lessons learned.
- **Absorb the brainstorming brief** — if a `*-brief.md` exists for this topic, carry its assumptions, blind spots, and constraints into the relevant leaves' Gotchas sections. These are hard-won insights from `/claude-tweaks:challenge` that should survive. (Step 4 re-checks this systematically before the brief becomes unrecoverable.)
- **Include known manual steps — but only ones that survive the triage.** The Manual Steps section is reserved for items that have no CLI, require human judgment, or require out-of-band signoff. Infrastructure setup, env var provisioning, and API key creation with CLIs (`terraform`, `gh secret set`, `vercel env add`, `stripe`, `ldcli`, etc.) do NOT belong here — `/build` Step 2.5 auto-classifies and executes them. See `spec-template.md` Manual Steps section for the triage criteria and the `reason-not-auto` qualifier.

---

## Step 4: Link and order

Every parent and leaf number now exists. This pass wires the relationships between them and absorbs the last of the design doc's and brief's context, before Step 7 deletes both.

### Linking

Branches on driver, then — for `github-issues` — on `work-links`.

**`work-backend: github-issues`, `work-links: native`:**

- Parent ↔ leaf — a sub-issue link, once per leaf:

  ```bash
  gh api repos/{owner}/{repo}/issues/$PARENT_NUM/sub_issues -f sub_issue_id=$LEAF_NUM
  ```

- Leaf ↔ leaf, and leaf ↔ any pre-existing open record from Step 1's companion overlaps or Step 2's implicit-dependency notes — the blocked-by dependency endpoint (the same GitHub issue-dependencies feature `capabilities-probe.js`'s `probeSchema` checks for, via the `blockedBy` GraphQL field — the sibling `issueDependenciesSummary` field is count-only and insufficient, see that file's header comment). Call it once per dependency edge, dependent leaf pointing at blocking record.
- No body edits needed for native linking — the relationships live in GitHub's own graph, not in text.

**`work-backend: github-issues`, `work-links: body-text`** (fallback when native isn't available):

- Parent ↔ leaf — append one task-list line per leaf to the parent's body, `- [ ] #{leafNum}`, then a single `gh issue edit $PARENT_NUM --body-file` with the recomposed body (design summary + Decision Rationale below + the task list).
- Leaf ↔ leaf / leaf ↔ pre-existing record — add one `Blocked by #N` line to the dependent leaf's body per dependency (line-anchored, matching `record.js`'s `DEP_RE`: the literal text `Blocked by #` followed by the number, at the start of a line), then a single `gh issue edit $LEAF_NUM --body-file` with the recomposed body. When the dependency is between two leaves of this same decomposition (not a pre-existing companion record) and this decomposition met `promise-register-min-leaves` (`_shared/work-record.md`'s Config keys table), write the extended form instead — `Blocked by #N: {one-line assumption}` — stating what the dependent leaf actually needs from #N (`record.js`'s `parseDependencyAssumptions` reads the trailing text; bare lines and pre-existing-record links are unaffected).
- Readers parse this back out with `record.js`'s `parseDependencies(body)` — it returns every `Blocked by #N` target as a deduped, ordered array; a mid-line mention doesn't count, only a line-starting one does.

**`work-backend: local-files`** (no native/body-text choice — frontmatter is the only mechanism):

- Parent ↔ leaf — `facets.parent = $PARENT_ID` on each leaf.
- Leaf ↔ leaf / leaf ↔ pre-existing record — `facets.blockedBy = [N1, N2, ...]` on the dependent leaf.
- Both are `writeRecord` calls — compose-then-write-once, recompose the full facets/body and write once per leaf that needs a link. No task-list or `Blocked by #N` text needed; `parent`/`blocked-by` frontmatter is already queryable via `queryRecords`.

There's no ordering step separate from linking — the dependency graph these links encode **is** the order. The old tier tables are gone; nothing replaces them. `priority:*` labels are optional, dispatch-ordering-only, and human-applied only — per the permission matrix in `_shared/work-record.md`, no skill in this pipeline, including `/specify`, ever adds one *autonomously*. The sole exception is `/claude-tweaks:review-backlog`, which may write `priority:*` — always gated on an explicit human batch-confirm, never silently.

### Decision Rationale and Assumptions

Before Step 7 deletes the design doc and brief, absorb the last of their context into the records that survive:

1. **Decision Rationale** — from the design doc, extract the "why" behind major decisions (approach choices, technology selections, rejected alternatives). Add as a `## Decision Rationale` section in the **parent** body — recompose the parent's full body (design summary + this new section + the task list, under `body-text`) and write once.
2. **Assumptions** — from the brief (produced by `/claude-tweaks:challenge`), extract validated assumptions, surfaced blind spots, and hard constraints relevant to each leaf. Fold them into that leaf's **existing `## Gotchas` section** as additional bullets — there's no separate `## Assumptions` section anymore. Recompose the affected leaf's body and write once.
3. **Cross-Spec Promises** (only when this decomposition met `promise-register-min-leaves` — default `4`, `_shared/work-record.md`'s Config keys table) — add a `## Cross-Spec Promises` section to the **parent** body, recomposed alongside Decision Rationale and the task list. This seeding step is `work-links: body-text`-specific — only that mode's Linking pass (above) writes `Blocked by #N: {assumption}` lines to seed rows from; `work-links: native` leaves have zero such lines at decomposition time (native's Linking pass writes no body text at all — see Linking, above), so a native-mode decomposition's section still gets created here, just empty at first — `/claude-tweaks:review`'s Step 1.6 can populate it later regardless of `work-links` mode, since its writes are plain `gh issue edit`/`gh issue comment` calls with no native-vs-body-text restriction. The one genuine, permanent exclusion is `work-backend: local-files`: there's no GitHub issue to hold a section, a row, or a comment on at all, so a decomposition under that backend never gets a `## Cross-Spec Promises` section, regardless of leaf count. Seed one row per `Blocked by #{blocker}: {assumption}` line the Linking pass above just wrote between two leaves of this decomposition — `{blocker}` is the same number from that line (the record being depended on); `{owner}` is the dependent leaf whose body carries the line (pre-existing-record links don't get a row — the register tracks promises within this family, not every dependency):

   ```
   | # | Promise | Owner (#leaf) | Status |
   |---|---------|-----------------|--------|
   | F1 | leaf #{owner} assumes leaf #{blocker}: {assumption} | #{owner} | open |
   ```

   When no leaf-to-leaf assumption lines exist (the threshold is still met — this decomposition simply had no forward dependencies among its leaves), still create the section with just the header row — `/claude-tweaks:review`'s Step 1.6 (`skills/review/SKILL.md`) looks for this section by name on every parent-linked record it reviews, and an absent section means "nothing to track at all (below threshold)" while a present-but-empty one means "tracked, nothing found yet." Post one comment on the parent noting the seed: `gh issue comment $PARENT_NUM --body "Cross-Spec Promises seeded: {count} forward reference(s) at decomposition time."` (skip the comment, but still create the empty section, when count is 0).

Step 3's Rules already asked for brief-absorption while each leaf was being drafted; this is the systematic completeness pass — the last chance to catch a leaf that missed something, before the source becomes unrecoverable.

This is what keeps the records self-contained: reading the parent, or any leaf, later explains *why* the approach was chosen without needing the deleted design doc.

## Step 5: Multi-Persona Red-Team

Before deleting the design doc, dispatch persona-instantiated agents in one parallel batch per leaf record — not the parent, which is never built directly — to surface ambiguities, gaps, and unstated assumptions. **Persona count depends on the leaf's own `ceremony:*` label** (stamped in Step 3): `ceremony:fast-lane` dispatches **one** persona (Skeptical Reviewer only); `ceremony:standard` dispatches all **three** (Implementer / Maintainer / Skeptical Reviewer), unchanged from before. See `red-team.md` for which persona(s) to dispatch for each tier.

Each agent's input is a record reference, never inlined content: `work-backend: github-issues` — the leaf's number plus a `gh issue view` read instruction; `work-backend: local-files` — the leaf's record file path. Never both in the same dispatch. Findings are written **back into the record body** — inline `<!-- ambiguity: ... -->` HTML comments next to flagged sentences, or rows in an appended `## Open Questions` table — via compose-then-write-once, the same discipline every write in this skill uses. No mid-flow prompt — Step 6 Self-Review picks them up.

Read `red-team.md` in this skill's directory for the dispatch prompt (Template A block must remain inlined verbatim in the dispatch prompt at runtime per the Subagent Contract), the persona lens questions, and the write-back procedure.

---

## Step 6: Record Self-Review

Before deleting the design doc, look at every record you wrote with fresh eyes — including the red-team findings just written in Step 5. Fix issues inline — no subagent, no separate review pass. This is also the last chance to catch content the design doc captured but no leaf implements.

> **Parallel execution (conditional):** When N ≥ 3 leaf records are produced, run scope and ambiguity checks across all leaves concurrently — `gh issue view` per leaf under `work-backend: github-issues`, `Read` per record file under `work-backend: local-files` — plus `Grep` over the fetched bodies for placeholder patterns.

1. **Placeholder scan** — search for the failure patterns in `spec-template.md`'s "No Placeholders" section, over every record body (parent and leaves). Any `TBD`, vague acceptance criteria, undefined types, "standard error handling", or "similar to leaf N" — fix them now. Also confirm every `<!-- ambiguity: ... -->` marker Step 5's red-team wrote has been resolved and **deleted** — zero may remain: a `ready` leaf still carrying one fails `_shared/work-record.md`'s spec-shaped structural check, which treats `<!-- ambiguity:` as an unresolved placeholder marker exactly like `TBD`/`TODO`.
2. **Internal consistency** — across the leaves in this decomposition, do referenced types, model names, and endpoint signatures match? A function called `clearLayers()` in leaf 42 but `clearFullLayers()` in leaf 43 is a bug.
3. **Scope check** — is each leaf genuinely a single work unit (3-8 tasks)? If one is doing two things, split it now. If two are doing the same thing, merge them.
4. **Ambiguity check** — could any acceptance criterion be interpreted two different ways? Pick one and make it explicit.
5. **Design-doc coverage** — re-read the design doc with each leaf open. If you find a requirement the doc captured but no leaf implements, add it to the right leaf now — the doc is about to be deleted in Step 7.

When all five checks come back clean, proceed to Step 7. No need to re-review after fixing.

---

## Step 7: Delete Consumed Artifacts (only when fully decomposed)

The design doc and brainstorming brief have served their purpose **once every phase has been decomposed into leaf records and Step 6 Self-Review has confirmed coverage**. Behavior depends on the phase target:

| Decomposition mode | Delete design doc? |
|---|---|
| No `phase-N` argument; doc has 0 phase sections (single-phase) | Yes — fully consumed |
| No `phase-N` argument; doc has N phase sections; all decomposed in this run | Yes — fully consumed |
| `phase-N` argument; only that phase decomposed | **No** — design doc retained for remaining phases. Add a `## Phase N: Specified` marker after the phase heading instead, listing the record numbers it produced. |
| `phase-N` argument; this was the last un-specified phase | Yes — fully consumed (run delete after marker bookkeeping confirms all phases marked) |

```bash
# Full decomposition (all phases or single-phase):
git rm docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md
git rm docs/plans/YYYY-MM-DD-{topic}-brief.md  # if it exists

# Partial decomposition (phase-N only): commit the marker, keep the doc
git add docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md
git commit -m "Mark phase-{N} specified in design doc"
```

When fully consumed, do NOT keep these around. They create dangling references and stale artifacts. The leaf records are the durable artifact.

(Step 8 — the old backlog-entry deletion — is retired: a captured record is shaped in place, so there is nothing to delete.)

---

## Step 9: Summary and Commit

Present a summary:

```markdown
## Specification: {design doc topic}

### Work Units Created
| Record | Title | Type | Blocked by | Est. tasks |
|--------|-------|------|------------|------------|
| {ref} | {title} | {type} | {refs or —} | {count} |

### Existing Records Modified
- {ref} "{title}" — {what was added/changed}

### Artifacts Removed
- Design doc: `docs/superpowers/specs/{filename}` (absorbed into the parent + leaf records)
- Brainstorming brief: `docs/plans/{filename}` (absorbed into leaf Gotchas sections) — if it existed

### Diagram suggestions (optional — render only when Step 2.5d emitted any)
- {one or two `**Diagram suggestion:** …` blocks emitted by Step 2.5d}
```

`{ref}` is `#{N}` under `work-backend: github-issues`, the bare record id under `local-files` — same convention as Step 1's Overlap Analysis.

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Created parent record {parent-ref} + {N} leaf records | `{hash}` (local-files) / `—` (github-issues — creates already landed via API, no commit) |
| Operational | Deleted design doc + brief | `{hash}` |

**Commit whatever this run wrote to disk — the skill's terminal action, run whether or not anything ends up staged.** This covers only artifacts that are files: the design-doc deletion/marker from Step 7, and — under `work-backend: local-files` — the parent and leaf record files plus Step 4's linking edits, composed and written across Steps 3-4 but not yet committed. A clean `github-issues` run has nothing to commit for the records themselves — every parent/leaf create and edit already landed via the API in Steps 3-5, the same no-commit case Shaping mode documents — **except** any leaf (or the whole batch, if the parent itself fell back) that Step 3's write-path resilience wrote to `local-store.js` after a `gh` failure; that file needs this commit exactly like a `local-files` record does. A full (non-`phase-N`) decomposition may therefore have nothing staged beyond the design doc's `git rm`; a `phase-N` run already committed its own marker back in Step 7, so it may have nothing staged at all. None of this affects durability — a leaf is durable the moment its create/write call lands, not when this step commits it. What used to be true of spec files no longer applies: leaves don't need to exist in committed history before a pipeline can run them; `/claude-tweaks:flow #N` (or a local record id) materializes a leaf into a build-time file only when a pipeline actually runs it (spec 20's contract), independent of this commit.

```bash
git add specs/ docs/   # local-files driver: parent/leaf record files + link edits; docs/: design-doc removal/marker
git status --porcelain   # empty is a valid outcome (github-issues, or a phase-N run) — commit only if something is staged
git commit -m "{message describing the leaves created}"   # skip when nothing is staged
git log --oneline -1   # verify it landed when a commit was made (see _shared/git-discipline.md)
```

By the time Next Actions renders, any commit from this step has already happened.

## Next Actions

Self-routing — render based on what was produced. The leaf records are **already durable** — a `github-issues` run's leaves exist on the tracker the moment Step 3 creates them; a `local-files` run's leaf files exist on disk regardless of whether Step 9 found anything to commit — never offer "commit then flow" or "have me commit these leaves" as an option; that question is closed before Next Actions renders (see Step 9). Options are purely about *which* leaf records to pipeline and in *what order*.

This "Situation → options" table is the assistant's own lookup logic to pick which situation applies — it stays internal and is never itself shown to the user or converted into an `AskUserQuestion` option. The commands below show the `work-backend: github-issues` form (`#{N}`); under `work-backend: local-files`, drop the `#` and emit bare record ids instead (`/claude-tweaks:flow {N}`, `/claude-tweaks:flow {N1},{N2},...`).

| Situation | Options |
|---|---|
| Single leaf record produced | 1. `/claude-tweaks:flow #{N}` — automated pipeline for record #{N}: "{title}" **(Recommended)**<br>2. `/claude-tweaks:build #{N}` — build only (no test/review/wrap-up)<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Multiple leaf records produced from a single phase / single-phase doc | 1. `/claude-tweaks:flow #{N1},#{N2},...,#{Nk}` — sequential pipeline, all leaves **(Recommended)**<br>2. `/claude-tweaks:flow #{N1}` — pipeline just the highest-priority leaf<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Phase-N decomposition with remaining phases in design doc | 1. `/claude-tweaks:flow #{N1},#{N2},...` — pipeline this phase's leaves **(Recommended)**<br>2. `/claude-tweaks:specify {doc} phase-{N+1}` — decompose next phase<br>3. `/claude-tweaks:help` — pipeline dashboard |
| All phases decomposed in one run (large multi-phase decomposition) | 1. `/claude-tweaks:flow #{first-phase-leaf-Ns}` — pipeline phase 1 leaves first **(Recommended)**<br>2. `/claude-tweaks:flow #{all-leaf-Ns}` — pipeline everything sequentially (long-running)<br>3. `/claude-tweaks:help` — see the full dependency graph before deciding |

Once the matching situation is resolved, replace the rendering of its numbered list with a call to `AskUserQuestion`: `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and one option per entry in that row — `label`: a short one-line summary (e.g. "Pipeline this record", "Build only", "Pipeline dashboard"), `description`: the full command text from that entry, the entry marked `(Recommended)` in the table gets `(Recommended)` suffixed on its label.

Always recommend `/flow` over `/build` — `/flow` is the canonical path through the pipeline, and the shape gate at materialization time (spec 20's contract) accepts well-structured leaf records of any size.

## Component-Skill Contract

`/specify` is always user-facing — it does not detect `$PIPELINE_RUN_DIR` because it dispatches `/superpowers:brainstorming` polymorphically rather than being invoked by a pipeline parent. Always renders Next Actions.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Specifying without a codebase scan | Records need Current State context — without it, `/superpowers:writing-plans` operates on blind assumptions. Step 1's Landscape reads include git log + existing files. The design-doc half of this anti-pattern is no longer possible: polymorphic input invokes `/superpowers:brainstorming` automatically when the input is a bare topic with no existing design doc. |
| Leaf records that touch every layer | A single leaf spanning data + API + UI + infra is too large for agent-sized execution |
| Vague acceptance criteria | "Works correctly" can't be verified — `/superpowers:writing-plans` needs specific, testable assertions |
| Keeping the design doc after specifying | Creates dangling references — the leaf records are the durable artifact, the design doc is consumed. Partial (`phase-N`) decomposition is the only exception (see Step 7's table). |
| Silently deciding how to handle overlapping records | Overlap handling (extend vs. companion vs. replace) is a user decision — present numbered options, don't assume |
| Mis-targeting design pre-steps | Asking design-intent on backend records is irrelevant; skipping the shape pre-step on frontend records without offering loses UX value. Step 2.5a's frontend detection gates both — respect it. |
| Writing a record body without a `Surface:` metadata line | Wrapper Layer 2 detection falls through to file-extension sniff, which is less reliable. `Surface:` is a plain body-metadata line — never YAML frontmatter, never a label — written by Shaping mode's Metadata block (single record) or Step 3's per-leaf procedure (decomposition); the canonical value list lives in `spec-template.md`. |
| Treating "topic with slash" as a path | Ambiguous input must be disambiguated explicitly — present the numbered choice, do not assume one interpretation |
| Producing a "phase plan" file alongside or instead of leaf records | Phase plans are dead artifacts. The granularity contract has 2 tiers: design doc (one file, multi-phase OK as `## Phase N` sections) → ready leaf records (one record each). Anything else is a contract violation. |
| Bypassing `/specify` on the way to `/flow` | `/flow` accepts only leaf record references (`#N` / `#A,#B`) and hard-gates on record shape at materialization time — an unshaped record stops the run with a pointer back to `/specify` (spec 20's contract). Always route through `/specify` first to produce ready leaves; recommend `/flow` over `/build` when presenting Next Actions. |
| Granting or touching `auto:*`/`bot:*` from `/specify` | Authorization is human-granted only (`/triage`'s territory) and bot-state is machinery's visibility layer — `/specify` adds `ready`, `risk:*`/`effort:*`, and Type (when absent), removes `parked` on promotion, and never touches either family (permission matrix in `_shared/work-record.md`). |
| Marking a parent record `ready` | Parents are summary records, not agent-sized work — only leaves get `ready` (+ scoring). A `ready` parent would enter the authorization worklist as if it were buildable, but its body is a design summary, not a spec-shaped deliverable. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/superpowers:brainstorming` | Bidirectional: when a design doc already exists, it runs BEFORE /specify and produces the input that /specify consumes and deletes. When the user passes a bare topic (polymorphic input), /specify invokes brainstorming internally to produce the design doc, then decomposes it. |
| `/superpowers:writing-plans` | Consumes leaf records AFTER /claude-tweaks:specify — the leaf's body must provide enough context for `/superpowers:writing-plans` to produce a TDD execution plan |
| `/superpowers:subagent-driven-development` | Executes leaf records AFTER /claude-tweaks:specify — uses the plan from `/superpowers:writing-plans` (via `/claude-tweaks:build` subagent execution strategy) |
| `/superpowers:executing-plans` | Executes leaf records AFTER /claude-tweaks:specify — uses the plan from `/superpowers:writing-plans` (via `/claude-tweaks:build` batched execution strategy) |
| `/claude-tweaks:build` | Runs AFTER /claude-tweaks:specify — takes a leaf record reference and materializes it into a build-time file (spec 20's contract) before implementing it; reads the `Surface:`/`Design-intent:` body-metadata lines `/specify` wrote, lifted into the materialized header |
| `/claude-tweaks:capture` | Files raw backlog records (`by:capture`, Type only, no scoring or stage) that `/specify`'s Resolve-the-input shapes into `ready` — case 1 for a direct record reference, case 5 for a title/keyword backlog reference |
| `/claude-tweaks:review-backlog` | Upstream hand-off source — a backlog record review-backlog surfaced (priority suggested, possibly cross-referenced via `**Related:**`) still needs `/specify` to stamp `risk:*`/`effort:*` and reach `ready`. Review-backlog never shapes bodies or scores itself. |
| `/claude-tweaks:tidy` | Reviews backlog-stage records for staleness; its Promote action recommends `/claude-tweaks:specify #{n}` to shape a record into `ready` — Step 8's old backlog-entry deletion is retired, since a captured record has no separate file to delete (Shaping mode edits it in place) |
| `/claude-tweaks:triage` | Downstream gate — `/specify` is "the shaper" triage names: stamping `ready` + scoring is what admits a record into triage's worklist, and a record triage flags back for missing/empty spec-shaped fields returns here (`/claude-tweaks:specify #{n}`) for re-shaping. |
| `/claude-tweaks:help` | Shows which leaf records from /claude-tweaks:specify are `ready` for /claude-tweaks:build — also uses Key Files for implicit dependency detection |
| `/claude-tweaks:design-wrapper` | /specify invokes `/claude-tweaks:design-wrapper shape <topic>` (Step 2.5b) on frontend design docs to enrich the design doc with UX/UI planning. /specify writes `Surface:` and `Design-intent:` as body-metadata lines (Step 2.5c + Step 3's per-leaf procedure, or Shaping mode's Metadata block for a single record) — never frontmatter, never labels; the design wrapper reads them from the materialized header spec 20 lifts them into (Layer 2 detection for `Surface:`, `polish` mode's intent-driven dispatch for `Design-intent:`, active in v4.5.0). |
| `/claude-tweaks:visualize` | Step 2.5d suggests invoking this skill for every leaf record (not gated to frontend) when the design doc describes state machines, schemas, multi-actor flows, decision branches, hierarchies, or architectures. Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 11). |
| `/claude-tweaks:research` | Prior-art lookup before authoring a record — `/research` reports can be cited directly in a leaf's `Technical Approach` or `Gotchas` section. |
| `/claude-tweaks:code-health` | `/code-health` files improvement findings as `by:code-health`-labelled records, born-`ready` and spec-shaped by construction (Current State / Deliverables / Acceptance Criteria) — per `_shared/work-record.md`'s born-ready rule, these skip Shaping mode's translation work entirely. `/specify` shapes captured and human-filed records (no `by:*` label, still in `backlog`); Resolve-the-input case 1 fetches either kind the same way, stamping `ready` + scoring only on the ones that don't already have them. |
| `/claude-tweaks:harness-health` | Same pattern as `/code-health`/`/journey-health`/`/docs-health` — `/harness-health` files `by:harness-health` findings born-`ready` and spec-shaped by construction (Current State / Deliverables / Acceptance Criteria), so Resolve-the-input case 1 consumes them with near-zero translation, stamping nothing already present. |
| `/claude-tweaks:journey-health` | Same pattern as `/code-health`/`/harness-health`/`/docs-health` — `/journey-health` files `by:journey-health` findings born-`ready` and spec-shaped by construction (Current State / Deliverables / Acceptance Criteria), so Resolve-the-input case 1 consumes them with near-zero translation, stamping nothing already present. |
| `/claude-tweaks:docs-health` | Same pattern as `/code-health`/`/harness-health`/`/journey-health` — `/docs-health` files `by:docs-health` findings born-`ready` and spec-shaped by construction (Current State / Deliverables / Acceptance Criteria), so Resolve-the-input case 1 consumes them with near-zero translation, stamping nothing already present. |
| `/claude-tweaks:challenge` | Runs BEFORE /specify on backlog work records — produces a debiased brief whose assumptions, blind spots, and constraints /specify absorbs into leaf Gotchas sections (Step 1's Rules; Step 4's systematic completeness pass) |
| `/claude-tweaks:flow` | Accepts `#N` / `#A,#B` leaf record references — records arrive pre-shaped from `/specify`, so `/flow` never calls `/specify` internally (spec 20's contract: materialization hard-gates on record shape instead of a design-doc-rejection step). `/specify` remains the enforcement point that produces `ready` leaves in the first place. |
| `/claude-tweaks:assess-agent-autonomy` | Step 3 invokes `ceremony-check` mode inline (not a fresh Task dispatch) once per record — Shaping mode's single record, decomposition mode's per leaf (never the parent) — to decide `ceremony:fast-lane`/`ceremony:standard`, stamped as an explicit label. `/specify` is this mode's primary caller; `/flow`'s materialize.md only falls back to it for records that never went through this step. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
| `_shared/multi-agent-coordination.md` | Canonical primitive for Multi-persona red-team (Mode 3) — persona count varies by the leaf's `ceremony:*` tier (one for fast-lane, three for standard), one round, run as part of the self-review step. |
| `_shared/subagent-output-contract.md` | Red-team persona agents emit Template A (findings); follow the status-line and model-tier conventions. |
| `_shared/work-record.md` | Canonical taxonomy `/specify` shapes and files against — stage vocabulary (backlog / parked / ready), the seven-axis label contract, the permission matrix (`/specify`'s row: adds `ready`/scoring/Type, removes `parked`, never `auto:*`/`bot:*`), the born-ready rule, and the parent/leaf decomposition rules this skill implements |
| `bin/lib/issues/record.js` | Payload assembly + facet parsing for the GitHub driver — `/specify` calls `recordPayload` (parent + leaf creation), `parseRecordFacets` (reading existing scoring), and `extractFingerprint`/`parseDependencies` (idempotency + linking). Prose twin of `_shared/work-record.md`'s taxonomy. |
| `bin/lib/issues/local-store.js` | Storage layer for the local-files driver — `/specify` calls `readRecord`/`writeRecord`/`allocateId`/`queryRecords` throughout shaping and decomposition; no sub-issue API, so parent/dependency links are frontmatter (`facets.parent`, `facets.blockedBy`) instead |

## Background

`/superpowers:writing-plans` produces multi-phase plan files (`*-P1.md`, `*-P2.md`, …) that exceed `/flow`'s envelope. The legacy path `/superpowers:brainstorming → writing-plans → /flow` had three artifact tiers with the middle tier agent-too-big. The current path is `/superpowers:brainstorming → /specify → /flow` — two artifact tiers where `/specify` produces ready leaf records sized for `/flow`'s shape gate (enforced at materialization time — spec 20's contract). `/superpowers:brainstorming` is unchanged; the granularity contract relies on the user (or a skill caller) routing through `/specify` rather than `writing-plans`.
