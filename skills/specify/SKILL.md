---
name: claude-tweaks:specify
description: Use when converting a brainstorming design document into agent-sized work units (specs). Takes a design doc and decomposes it into self-contained specifications.
argument-hint: "<#N|record-id|design-doc-path|topic|backlog-title> [phase-N] [--surface <web|mobile|desktop|backend|infra>] [--granularity <fine|standard|coarse>]"
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

`$ARGUMENTS` = `<record-ref-or-design-doc-or-topic> [phase-N] [--surface <value>] [--granularity <value>]`

The first argument is a work record reference (`#N`, an issue URL, or a bare local record id), a path to a design doc, a topic name, or a backlog reference. The optional second argument `phase-N` (where N is a phase number from the design doc's `## Phase N` sections) scopes decomposition to one phase only — useful when running phases incrementally or in parallel. `phase-N` only applies when the input resolves to a design doc (decomposition mode); a work record reference resolves to shaping mode and ignores it.

Two optional flags may appear anywhere after the first argument, in either mode:

- `--surface <web|mobile|desktop|backend|infra>` — bypasses Step 2.5a's frontend-detection sniff entirely and uses the given value directly as `Surface:` for every record this run produces (the single record in shaping mode, or every parent/leaf in decomposition mode). Step 2.5c's design-intent question still runs when the given value is a frontend surface (`web`/`mobile`/`desktop`); it's skipped, as usual, for `backend`/`infra`. Use this to correct a sniff that would misfire — e.g. a backend batch job whose description happens to mention "dashboard."
- `--granularity <fine|standard|coarse>` — tunes Step 2's Sizing Guidelines for this run only; default `standard` (today's targets, unchanged). `fine` produces smaller, more numerous leaves; `coarse` produces fewer, larger leaves. Decomposition mode only — shaping mode has nothing to decompose, so this flag is ignored there.

Input is polymorphic — see the canonical definition in the Granularity Contract section above. The resolution steps below handle each input shape.

**Phase target examples:**

```
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md           → decompose ALL phases (or whole doc if no phases)
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md phase-2   → decompose phase 2 only
/claude-tweaks:specify food graph                                → resolve to design doc, decompose all
/claude-tweaks:specify food graph phase-3                        → resolve to design doc, decompose phase 3 only
/claude-tweaks:specify #142                                      → shape record #142 in place
/claude-tweaks:specify #142 --surface backend                    → shape record #142, forcing Surface: backend regardless of the sniff
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md --granularity fine   → decompose all phases with finer (smaller, more numerous) leaves
```

**Phase detection:** scan the design doc for `^## Phase \d+` headings. If 0 found and no `phase-N` was given, treat the whole doc as one phase. If 1+ found and no `phase-N` was given, decompose all phases sequentially. If `phase-N` was given but the section doesn't exist, stop and present the available phases as numbered options.

### Resolve the input:

1. **Work record reference** — a URL matching `https://github.com/{owner}/{repo}/issues/{n}`, or a shorthand like `#123` / `issue 123` / `gh-123`, or a bare local record id (e.g. `42`). Checked *before* case 2's path/topic disambiguation, since an issue URL contains `/` and would otherwise misparse as a design-doc path. Fetch it directly: `gh issue view {n} --json number,title,body,url,labels` (GitHub driver) or glob `specs/{n}-*.md` for the matching file, then `readRecord(path)` (`bin/lib/issues/local-store.js`; local-files driver). Enter **shaping mode** (below) — the record IS the target, not a source to translate; there is no source-extraction step. Scoring is read from the fetched labels via `parseRecordFacets` (`bin/lib/issues/record.js`) or the record's `facets` (local) only to decide which of `risk:*`/`effort:*` shaping mode still needs to stamp — never to gate whether shaping runs.
2. **Design doc path** (e.g., `docs/superpowers/specs/2026-02-21-meal-planning-design.md`) — read it directly. Disambiguation rule: a string containing `/` or ending in `.md`, that didn't match case 1 above, is treated as a path. Enter **decomposition mode** (Step 1 onward).

**Execution order for cases 3-5:** these three cases all apply to input that is neither a record reference (case 1) nor a path (case 2) — free text. They are listed below grouped by resolution outcome, not by execution order. Try case 5's record search first: does an open record's title match these keywords? Only when that search finds nothing, fall through to case 3's design-doc search; only when that also finds nothing, fall through to case 4's brainstorming invocation. A reader implementing cases 3-5 in list order instead (design doc before backlog record) resolves free text differently than intended.

3. **Topic name** (e.g., `meal planning`) — reached only after case 5's record search below found no matching open record. Search `docs/superpowers/specs/*-design.md` for a matching design doc. If found, read it directly and enter **decomposition mode**.
4. **Topic name with no matching design doc** — invoke superpowers `/superpowers:brainstorming` via the Skill tool with the topic as input (this is the polymorphic-input branch defined above). The brainstorming session produces a design doc at `docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md` (or wherever superpowers writes it). Wait for `/superpowers:brainstorming` to complete, then continue with the produced design doc as the input, entering **decomposition mode**. **Do not** prompt the user to "run brainstorm first" — that defeats the contract.
5. **Backlog reference** (e.g., `"Voice shopping list"`) — try this search first for any free-text input (before falling through to case 3), per the execution-order note above. A record query, not a file lookup: search open records by title keywords — `gh issue list --search "{keywords}" --state open --json number,title,body,labels` (GitHub driver) or `queryRecords('specs', {})` (`bin/lib/issues/local-store.js`; local-files driver), filtered to titles matching the keywords. Then check whether a design doc already exists for the matched topic (same lookup as case 3): if one does, read it and enter **decomposition mode**; if not, enter **shaping mode** directly on the matched record. A backlog reference never invokes brainstorming on its own — that only happens via case 4, when the reference resolves to a bare topic with no existing record at all.

**Ambiguous input handling:** A topic name that *could* also be interpreted as a path (e.g., a topic with a `/` in it like "auth/login flow") is ambiguous. Stop and call `AskUserQuestion` with:

- `question`: `"'{input}' could be a topic name or a path. Which did you mean?"`, `header`: `"Input type"`, `multiSelect`: `false`
- Option 1 — `label`: `"Topic name"`, `description`: `"invoke /superpowers:brainstorming to produce a design doc"`
- Option 2 — `label`: `"Design doc path"`, `description`: `"read the file directly"`

This explicit disambiguation prevents the silent wrong-path failure flagged by past polymorphic-input edge cases.

## Shaping mode (single record)

Entered from Resolve-the-input case 1 (work record reference) or case 5 (backlog reference with no matching design doc). The record already exists and IS the target — there is nothing to decompose.

Read `shaping-mode.md` in this skill's directory for the full procedure: editing the body into spec shape, preserving the original request, the `Surface:`/`Design-intent:` metadata block, stamping scoring and stage labels, and the compose-then-write-once write call per driver. That procedure is fully self-contained — when it completes, continue at `## Next Actions` below. Decomposition mode's Steps 1-9 never run on this path.

## Decomposition mode (design doc into parent + leaves)

Entered from Resolve-the-input case 2 (design doc path), case 3 (topic matching an existing design doc), case 4 (bare topic, after `/superpowers:brainstorming` produces the doc), or case 5 where the matched record's topic already has a design doc.

Read `decomposition-mode.md` in this skill's directory for the full procedure — Steps 1 through 9, including Step 2.5 (design pre-steps) and Step 2.5d (diagram suggestion). Step numbering there is unchanged from before the split, so cross-references naming a step by number still resolve. It delegates onward to `record-creation.md` (Steps 3-4), `red-team.md` (Step 5), and `design-pre-steps.md` (Step 2.5) exactly as before. When Step 9 completes, continue at `## Next Actions` below. Shaping mode's own procedure never runs on this path.

## Next Actions

Rendered for both modes — this is the one block that straddles them, which is why it stays in `SKILL.md` rather than moving into either mode file.

Self-routing — render based on what was produced. The records are **already durable** by the time this block renders: a `github-issues` run's shaped record and leaves exist on the tracker the moment the edit/create call lands; a `local-files` run's record files exist on disk regardless of whether decomposition mode's Step 9 found anything to commit. Never offer "commit then flow" or "have me commit these leaves" as an option; that question is closed before Next Actions renders (see shaping mode's write step, or decomposition mode's Step 9). Options are purely about *which* records to pipeline and in *what order*.

This "Situation → options" table is the assistant's own lookup logic to pick which situation applies — it stays internal and is never itself shown to the user or converted into an `AskUserQuestion` option. The commands below show the `work-backend: github-issues` form (`#{N}`); under `work-backend: local-files`, drop the `#` and emit bare record ids instead (`/claude-tweaks:flow {N}`, `/claude-tweaks:flow {N1},{N2},...`).

| Situation | Options |
|---|---|
| Shaping mode — one record shaped in place | 1. `/claude-tweaks:flow #{N}` — automated pipeline for record #{N}: "{title}" **(Recommended)**<br>2. `/claude-tweaks:build #{N}` — build only (no test/review/wrap-up)<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Decomposition mode — single leaf record produced | 1. `/claude-tweaks:flow #{N}` — automated pipeline for record #{N}: "{title}" **(Recommended)**<br>2. `/claude-tweaks:build #{N}` — build only (no test/review/wrap-up)<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Multiple leaf records produced from a single phase / single-phase doc | 1. `/claude-tweaks:flow #{N1},#{N2},...,#{Nk}` — sequential pipeline, all leaves **(Recommended)**<br>2. `/claude-tweaks:flow #{N1}` — pipeline just the highest-priority leaf<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Phase-N decomposition with remaining phases in design doc | 1. `/claude-tweaks:flow #{N1},#{N2},...` — pipeline this phase's leaves **(Recommended)**<br>2. `/claude-tweaks:specify {doc} phase-{N+1}` — decompose next phase<br>3. `/claude-tweaks:help` — pipeline dashboard |
| All phases decomposed in one run (large multi-phase decomposition) | 1. `/claude-tweaks:flow #{first-phase-leaf-Ns}` — pipeline phase 1 leaves first **(Recommended)**<br>2. `/claude-tweaks:flow #{all-leaf-Ns}` — pipeline everything sequentially (long-running)<br>3. `/claude-tweaks:help` — see the full dependency graph before deciding |

Once the matching situation is resolved, replace the rendering of its numbered list with a call to `AskUserQuestion`: `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and one option per entry in that row — `label`: a short one-line summary (e.g. "Pipeline this record", "Build only", "Pipeline dashboard"), `description`: the full command text from that entry, the entry marked `(Recommended)` in the table gets `(Recommended)` suffixed on its label.

Always recommend `/claude-tweaks:flow` over `/claude-tweaks:build` — `/claude-tweaks:flow` is the canonical path through the pipeline, and the shape gate at materialization time (spec 20's contract) accepts well-structured leaf records of any size.

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
| Granting or touching `auto:*`/`bot:*` from `/specify` | Authorization is human-granted only (`/backlog refine`'s territory) and bot-state is machinery's visibility layer — `/specify` adds `ready`, `risk:*`/`effort:*`, and Type (when absent), removes `parked` on promotion, and never touches either family (permission matrix in `_shared/work-record.md`). |
| Marking a parent record `ready` | Parents are summary records, not agent-sized work — only leaves get `ready` (+ scoring). A `ready` parent would enter the authorization worklist as if it were buildable, but its body is a design summary, not a spec-shaped deliverable. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/superpowers:brainstorming` | Bidirectional: when a design doc already exists, it runs BEFORE /specify and produces the input that /specify consumes and deletes. When the user passes a bare topic (polymorphic input), /specify invokes brainstorming internally to produce the design doc, then decomposes it. |
| `/claude-tweaks:init` | Phase 3 writes `project.maturity` to `.claude-tweaks/policy.yml`; Step 2 reads it to bias decomposition toward strangler-fig-shaped leaves on early-production/established projects when a design doc proposes replacing an existing subsystem. |
| `/superpowers:writing-plans` | Consumes leaf records AFTER /claude-tweaks:specify — the leaf's body must provide enough context for `/superpowers:writing-plans` to produce a TDD execution plan |
| `/superpowers:subagent-driven-development` | Executes leaf records AFTER /claude-tweaks:specify — uses the plan from `/superpowers:writing-plans` (via `/claude-tweaks:build` subagent execution strategy) |
| `/superpowers:executing-plans` | Executes leaf records AFTER /claude-tweaks:specify — uses the plan from `/superpowers:writing-plans` (via `/claude-tweaks:build` batched execution strategy) |
| `/claude-tweaks:build` | Runs AFTER /claude-tweaks:specify — takes a leaf record reference and materializes it into a build-time file (spec 20's contract) before implementing it; reads the `Surface:`/`Design-intent:` body-metadata lines `/specify` wrote, lifted into the materialized header |
| `/claude-tweaks:review` | Reads the `risk:*`/`effort:*` labels this skill stamps (Shaping mode's "Stamp scoring and stage labels" step; decomposition mode's Step 3) to auto-derive its own `review-effort` tier (Step 2.5) — a read of the same labels via the same low-level helpers `assess-agent-autonomy`'s other modes already consume, not a skill-to-skill call. |
| `/claude-tweaks:capture` | Files raw backlog records (`by:capture`, Type only, no scoring or stage) that `/specify`'s Resolve-the-input shapes into `ready` — case 1 for a direct record reference, case 5 for a title/keyword backlog reference |
| `/claude-tweaks:backlog` | Upstream hand-off source (`overview` mode surfaces priority-suggested records) and downstream gate (`/specify` is "the shaper" `refine` mode names: stamping `ready` + scoring is what admits a record into its grant worklist, and a record `refine` flags back for missing/empty spec-shaped fields returns here via `/claude-tweaks:specify #{n}` for re-shaping). |
| `/claude-tweaks:tidy` | Reviews backlog-stage records for staleness; its Promote action recommends `/claude-tweaks:specify #{n}` to shape a record into `ready` — Step 8's old backlog-entry deletion is retired, since a captured record has no separate file to delete (Shaping mode edits it in place) |
| `/claude-tweaks:help` | Shows which leaf records from /claude-tweaks:specify are `ready` for /claude-tweaks:build — also uses Key Files for implicit dependency detection |
| `/claude-tweaks:design-wrapper` | /specify invokes `/claude-tweaks:design-wrapper shape <topic>` (Step 2.5b) on frontend design docs to enrich the design doc with UX/UI planning. /specify writes `Surface:` and `Design-intent:` as body-metadata lines (Step 2.5c + Step 3's per-leaf procedure, or Shaping mode's Metadata block for a single record) — never frontmatter, never labels; the design wrapper reads them from the materialized header spec 20 lifts them into (Layer 2 detection for `Surface:`, `polish` mode's intent-driven dispatch for `Design-intent:`, active in v4.5.0). |
| `/claude-tweaks:visualize` | Step 2.5d suggests invoking this skill for every leaf record (not gated to frontend) when the design doc describes state machines, schemas, multi-actor flows, decision branches, hierarchies, or architectures. Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 12). |
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
| `_shared/work-record.md` | Canonical taxonomy `/specify` shapes and files against — stage vocabulary (backlog / parked / ready), the label contract, the permission matrix (`/specify`'s row: adds `ready`/scoring/Type, removes `parked`, never `auto:*`/`bot:*`), the born-ready rule, and the parent/leaf decomposition rules this skill implements |
| `bin/lib/issues/record.js` | Payload assembly + facet parsing for the GitHub driver — `/specify` calls `recordPayload` (parent + leaf creation), `parseRecordFacets` (reading existing scoring), and `extractFingerprint`/`parseDependencies` (idempotency + linking). Prose twin of `_shared/work-record.md`'s taxonomy. |
| `bin/lib/issues/local-store.js` | Storage layer for the local-files driver — `/specify` calls `readRecord`/`writeRecord`/`createRecord`/`deriveSlug`/`queryRecords` throughout shaping and decomposition (never `allocateId` directly — `createRecord` wraps it to close the concurrent-creation race, see Step 3's Idempotency section); no sub-issue API, so parent/dependency links are frontmatter (`facets.parent`, `facets.blockedBy`) instead |

## Background

`/superpowers:writing-plans` produces multi-phase plan files (`*-P1.md`, `*-P2.md`, …) that exceed `/flow`'s envelope. The legacy path `/superpowers:brainstorming → writing-plans → /flow` had three artifact tiers with the middle tier agent-too-big. The current path is `/superpowers:brainstorming → /specify → /flow` — two artifact tiers where `/specify` produces ready leaf records sized for `/flow`'s shape gate (enforced at materialization time — spec 20's contract). `/superpowers:brainstorming` is unchanged; the granularity contract relies on the user (or a skill caller) routing through `/specify` rather than `writing-plans`.
