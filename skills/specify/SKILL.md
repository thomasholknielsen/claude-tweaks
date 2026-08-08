---
name: specify
description: Use when converting a brainstorming design document into agent-sized work units (specs). Takes a design doc and decomposes it into self-contained specifications.
argument-hint: "<#N|record-id|design-doc-path|topic|backlog-title> [phase-N] [--surface <web|mobile|desktop|backend|infra>] [--granularity <fine|standard|coarse>]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.


# Specify — Shape work records and decompose designs into ready leaf records

Shape a single work record into spec shape, or decompose a brainstorming design document into a parent record plus ready leaf records. Part of the workflow lifecycle:

Lifecycle: `/superpowers:brainstorming` → **`/claude-tweaks:specify`** → `/claude-tweaks:build`

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

1. **Work record reference** — a URL matching `https://github.com/{owner}/{repo}/issues/{n}`, or a shorthand like `#123` / `issue 123` / `gh-123`, or a bare local record id (e.g. `42`). Checked *before* case 2's path/topic disambiguation, since an issue URL contains `/` and would otherwise misparse as a design-doc path. Fetch it directly: `gh issue view {n} --json number,title,body,url,labels` (GitHub driver) or glob `specs/{n}-*.md` for the matching file, then `readRecord(path)` (`bin/lib/issues/local-store.js`; local-files driver). Enter **shaping mode** (below) — the record IS the target, not a source to translate; there is no source-extraction step. Scoring is read from the fetched labels via `parseRecordFacets` (`bin/lib/issues/record.js`) or the record's `facets` (local) only to decide which of `risk:*`/`size:*` shaping mode still needs to stamp — never to gate whether shaping runs.
2. **Design doc path** (e.g., `docs/superpowers/specs/2026-02-21-meal-planning-design.md`) — read it directly. Disambiguation rule: a string containing `/` or ending in `.md`, that didn't match case 1 above, is treated as a path. Enter **decomposition mode** (Step 1 onward).

**Execution order for cases 3-5:** these three cases all apply to input that is neither a record reference (case 1) nor a path (case 2) — free text. They are listed below grouped by resolution outcome, not by execution order. Try case 5's record search first: does an open record's title match these keywords? Only when that search finds nothing, fall through to case 3's design-doc search; only when that also finds nothing, fall through to case 4's brainstorming invocation. A reader implementing cases 3-5 in list order instead (design doc before backlog record) resolves free text differently than intended.

3. **Topic name** (e.g., `meal planning`) — reached only after case 5's record search below found no matching open record. Search `docs/superpowers/specs/*-design.md` for a matching design doc. If found, read it directly and enter **decomposition mode**.
4. **Topic name with no matching design doc** — invoke superpowers `/superpowers:brainstorming` via the Skill tool with the topic as input (this is the polymorphic-input branch defined above). The brainstorming session produces a design doc at `docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md` (or wherever superpowers writes it). Wait for `/superpowers:brainstorming` to complete, then continue with the produced design doc as the input, entering **decomposition mode**. **Do not** prompt the user to "run brainstorm first" — that defeats the contract.
5. **Backlog reference** (e.g., `"Voice shopping list"`) — try this search first for any free-text input (before falling through to case 3), per the execution-order note above. A record query, not a file lookup: search open records by title keywords — `gh issue list --search "{keywords}" --state open --json number,title --limit 10` (GitHub driver — the same narrow `number,title` field set `skills/capture/SKILL.md`'s Option 4 candidate search already uses, dropping `body` since only the title match matters here) or `queryRecords('specs', {})` (`bin/lib/issues/local-store.js`; local-files driver), filtered to titles matching the keywords. Then check whether a design doc already exists for the matched topic (same lookup as case 3): if one does, read it and enter **decomposition mode**; if not, enter **shaping mode** directly on the matched record. A backlog reference never invokes brainstorming on its own — that only happens via case 4, when the reference resolves to a bare topic with no existing record at all.

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
| Specifying without a codebase scan | `/superpowers:writing-plans` then runs on blind assumptions — Step 1's Landscape reads cover git log + existing files. (Bare topics auto-invoke `/superpowers:brainstorming`.) |
| Leaf records that touch every layer | Data + API + UI + infra in one leaf exceeds agent-sized execution |
| Vague acceptance criteria | "Works correctly" isn't verifiable — `/superpowers:writing-plans` needs specific, testable assertions |
| Keeping the design doc after specifying | Dangling references — leaf records are the durable artifact. Exception: partial (`phase-N`) decomposition (Step 7). |
| Silently deciding how to handle overlapping records | Extend vs. companion vs. replace is a user decision — present numbered options |
| Mis-targeting design pre-steps | Design-intent is irrelevant on backend records; skipping the shape pre-step loses UX value on frontend ones. Step 2.5a gates both. |
| Writing a record body without a `Surface:` metadata line | Wrapper Layer 2 falls through to the less reliable file-extension sniff. `Surface:` is a body-metadata line — never YAML frontmatter, never a label — written by Shaping mode's Metadata block or Step 3's per-leaf procedure; values in `spec-template.md`. |
| Treating "topic with slash" as a path | Disambiguate explicitly — present the numbered choice, don't assume one interpretation |
| Producing a "phase plan" file alongside or instead of leaf records | Dead artifacts. The granularity contract is two tiers: design doc (multi-phase OK as `## Phase N` sections) → ready leaf records, one each. |
| Bypassing `/specify` on the way to `/flow` | `/flow` takes only leaf refs (`#N` / `#A,#B`) and hard-gates on shape at materialization — unshaped records stop the run. Recommend `/flow` over `/build` in Next Actions. |
| Granting or touching `auto:*`/`bot:*` from `/specify` | Authorization is human-granted only (`/backlog refine`'s territory); bot-state is machinery's. `/specify` adds `ready`, `risk:*`/`size:*`, Type when absent, removes `parked` on promotion, touches neither family (matrix in `_shared/work-record.md`). |
| Marking a parent record `ready` | Only leaves get `ready` (+ scoring) — a `ready` parent is a design summary that enters the authorization worklist as if buildable. |
## Background

`/superpowers:writing-plans` produces multi-phase plan files (`*-P1.md`, `*-P2.md`, …) that exceed `/flow`'s envelope. The legacy path `/superpowers:brainstorming → writing-plans → /flow` had three artifact tiers with the middle tier agent-too-big. The current path is `/superpowers:brainstorming → /specify → /flow` — two artifact tiers where `/specify` produces ready leaf records sized for `/flow`'s shape gate (enforced at materialization time — spec 20's contract). `/superpowers:brainstorming` is unchanged; the granularity contract relies on the user (or a skill caller) routing through `/specify` rather than `writing-plans`.
