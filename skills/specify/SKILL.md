---
name: specify
description: Use when shaping a work record into spec shape — one `#N`, or a `#N,#M` list taken one at a time — or decomposing a design doc into agent-sized ready sub-issue records. Keywords - specify, shape, decompose, spec, design doc, sub-issue, ready, batch.
argument-hint: "<#N[,#M...]|record-id[,id...]|design-doc-path|topic|backlog-title> [phase-N] [--surface <web|mobile|desktop|backend|infra|terminal>] [--granularity <fine|standard|coarse>] [--chained]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.


# Specify — Shape work records and decompose designs into ready sub-issue records

Shape a work record — or a comma-separated list of them, one at a time — into spec shape, or decompose a brainstorming design document into a parent record plus ready sub-issue records. Part of the workflow lifecycle:

Lifecycle: `/superpowers:brainstorming` → **`/claude-tweaks:specify`** → `/claude-tweaks:build`

## When to Use

- A work record reference (`#N` / local record id) — or a comma-separated list of them — needs to be shaped into spec shape before it can reach `ready`
- A brainstorming session produced a design doc that needs decomposing into ready sub-issue records
- A backlog record's topic has already been through brainstorming — a design doc exists and is ready to decompose
- `/claude-tweaks:help` flags unspecified design docs
- You need to break a large feature into agent-sized sub-issue records
- **`/claude-tweaks:flow` rejected a design doc** — route through `/specify` first to produce ready sub-issue records (this is the granularity contract enforcement path)
- You want to decompose a single phase from a multi-phase design doc — use the optional `phase-N` argument

## The Granularity Contract

The plugin enforces a 2-tier artifact taxonomy:

| Tier | Artifact | Producer | Consumer |
|---|---|---|---|
| Strategic | Design doc (one file, multi-phase OK as `## Phase N` sections) | `/superpowers:brainstorming` (superpowers, unchanged) — produces a single design doc by convention | `/claude-tweaks:specify` |
| Executional | Ready sub-issue record (spec-shaped body, agent-sized; a decomposition's parent issue is never `ready`) | `/claude-tweaks:specify` | `/claude-tweaks:flow`, `/claude-tweaks:build`, `/claude-tweaks:dispatch` |

`/claude-tweaks:specify` is the canonical entry point — its polymorphic input accepts a work record reference (or a comma-separated list of them), a design doc path, a topic, or a backlog reference. A record reference is shaped in place (**shaping mode**, below); a design doc — read directly, matched from a topic, or produced by invoking `/superpowers:brainstorming` internally for a bare topic with no existing doc — decomposes into a parent record plus ready sub-issue records (**decomposition mode**, Steps 1-9). The contract holds at two enforcement points: this skill's phase-aware decomposition and `/flow`'s Step 2.7 design-doc rejection. See the "Background" section near the end of this file for the historical context on why `/superpowers:writing-plans` is bypassed.

## Input

`$ARGUMENTS` = `<record-ref[,record-ref...]-or-design-doc-or-topic> [phase-N] [--surface <value>] [--granularity <value>] [--chained]`

The first argument is a work record reference (`#N`, an issue URL, or a bare local record id), a comma-separated list of record references (the batch paragraph below), a path to a design doc, a topic name, or a backlog reference. The optional second argument `phase-N` (where N is a phase number from the design doc's `## Phase N` sections) scopes decomposition to one phase only — useful when running phases incrementally or in parallel. `phase-N` only applies when the input resolves to a design doc (decomposition mode); a work record reference resolves to shaping mode and ignores it.

**Batch of record references (shaping mode only).** `#N[,#M...]` — or, under `work-backend: local-files`, `record-id[,id...]` — is a comma-separated list of record references with no spaces (`#695,#696`; `12,14` — a space
after a comma is tolerated and trimmed). When **every** element parses as a record reference per Resolve-the-input case 1, the argument is a batch: it runs shaping mode once per element, in list order, sequentially — each record gets the full single-record procedure (compose, `ceremony-check`, `framing-check`, the one design-intent question when a frontend sniff fires, one compose-then-write-once call) with no cross-record merging, no shared body, and no batched label call. A batch is a loop, never a fan-out: no Task dispatch, one record at a time. Batch applies to record references only — decomposition mode has no list form, so `phase-N` and `--granularity` are ignored for a list exactly as for a single ref; `--surface` applies to every element; `--chained` is accepted on a list (permitted-but-unused — `/claude-tweaks:capture`'s born-ready chain passes exactly one ref). Two non-batch shapes: when **some but not all** comma-separated elements parse as record references (`#695,docs/x-design.md`, `#695,meal planning`), that is a mixed list — a hard input error: stop before touching any record and name the offending element(s) — an empty element (a trailing comma, `#41,`, or two commas in a row) is named as exactly that, "empty element after `#41`", so the human sees the stray comma rather than an unnamed offender; when **no** element parses as a record reference, the argument is not a list at all but ordinary free text, resolved through cases 3-5 exactly as today, so a topic containing a comma ("auth, login flow") is neither a batch nor an error. Per-record failure isolation inside a batch: an element whose fetch fails (missing, wrong repo, `gh issue view` error / no matching `specs/{n}-*.md`) is reported and skipped; the remaining elements still shape, and the run summary (`shaping-mode.md`'s Actions Performed) carries one row per attempted element with its outcome — `shaped`, `already shaped, no-op`, or `skipped: {reason}`. The Interaction style directive's multi-item batch table does not apply to a batch here — the one per-record decision (design-intent) is asked per element as the sniff fires, not collected into one table.

Three optional flags may appear anywhere after the first argument (the first two in either mode; `--chained` in shaping mode only):

- `--surface <web|mobile|desktop|backend|infra|terminal>` — bypasses Step 2.5a's frontend-detection sniff entirely and uses the given value directly as `Surface:` for every record this run produces (every record shaped in shaping mode — the one record for a single ref, each element of a batch — or the parent and every sub-issue in decomposition mode). Step 2.5c's design-intent question still runs when the given value is a frontend surface (`web`/`mobile`/`desktop`); it's skipped, as usual, for `backend`/`infra`. Use this to correct a sniff that would misfire — e.g. a backend batch job whose description happens to mention "dashboard." `terminal` behaves like `backend`/`infra` for the design pre-steps (2.5b/2.5c skipped — no scaffold, no design-intent question) while still writing `Surface: terminal` so the design wrapper resolves the terminal track downstream.
- `--granularity <fine|standard|coarse>` — tunes Step 2's Sizing Guidelines for this run only; default `standard` (today's targets, unchanged). `fine` produces smaller, more numerous sub-issues; `coarse` produces fewer, larger sub-issues. Decomposition mode only — shaping mode has nothing to decompose, so this flag is ignored there.
- `--chained` — component-mode invocation for this skill's one skill caller: `/claude-tweaks:capture`'s born-ready chain (see the Component-Skill Contract below). Shaping mode on a record reference only — on any other input shape (design doc, topic, decomposition), ignore the flag and surface a one-line notice rather than erroring. Headless: `## Next Actions` is not rendered, and the one decision shaping mode would otherwise raise interactively — Step 2.5c's design-intent question, when Step 2.5a's sniff detects a frontend surface — resolves to `Design-intent: none` without prompting, logged per `_shared/auto-decision-log.md` when a run directory resolves per `_shared/pipeline-run-dir.md`, otherwise noted in the returned output only.

Input is polymorphic — see the canonical definition in the Granularity Contract section above. The resolution steps below handle each input shape.

**Phase target examples:**

```
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md           → decompose ALL phases (or whole doc if no phases)
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md phase-2   → decompose phase 2 only
/claude-tweaks:specify food graph                                → resolve to design doc, decompose all
/claude-tweaks:specify food graph phase-3                        → resolve to design doc, decompose phase 3 only
/claude-tweaks:specify #142                                      → shape record #142 in place
/claude-tweaks:specify #142 --surface backend                    → shape record #142, forcing Surface: backend regardless of the sniff
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md --granularity fine   → decompose all phases with finer (smaller, more numerous) sub-issues
```

**Phase detection:** scan the design doc for `^## Phase \d+` headings. If 0 found and no `phase-N` was given, treat the whole doc as one phase. If 1+ found and no `phase-N` was given, decompose all phases sequentially. If `phase-N` was given but the section doesn't exist, stop and present the available phases as numbered options.

### Resolve the input:

1. **Work record reference** — a URL matching `https://github.com/{owner}/{repo}/issues/{n}`, or a shorthand like `#123` / `issue 123` / `gh-123`, or a bare local record id (e.g. `42`). Checked *before* case 2's path/topic disambiguation, since an issue URL contains `/` and would otherwise misparse as a design-doc path. Fetch it directly: `gh issue view {n} --json number,title,body,url,labels` (GitHub driver) or glob `specs/{n}-*.md` for the matching file, then `readRecord(path)` (`bin/lib/issues/local-store.js`; local-files driver). Enter **shaping mode** (below) — the record IS the target, not a source to translate; there is no source-extraction step. Scoring is read from the fetched labels via `parseRecordFacets` (`bin/lib/issues/record.js`) or the record's `facets` (local) only to decide which of `risk:*`/`size:*` shaping mode still needs to stamp — never to gate whether shaping runs. A comma-separated list of record references runs this case once per element, in list order — the list grammar, the mixed-list hard error, and the per-element isolation rule live in `## Input`'s batch paragraph.
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

Read `shaping-mode.md` in this skill's directory for the full procedure: editing the body into spec shape, preserving the original request, the `Surface:`/`Design-intent:` metadata block, stamping scoring and stage labels, and the compose-then-write-once write call per driver. That procedure is fully self-contained — when it completes, continue at `## Next Actions` below (for a batch, continue with the next element instead and render Next Actions only after the last), except under `--chained`, which returns to the caller instead. Decomposition mode's Steps 1-9 never run on this path.

## Decomposition mode (design doc into parent + sub-issues)

Entered from Resolve-the-input case 2 (design doc path), case 3 (topic matching an existing design doc), case 4 (bare topic, after `/superpowers:brainstorming` produces the doc), or case 5 where the matched record's topic already has a design doc.

Read `decomposition-mode.md` in this skill's directory for the full procedure — Steps 1 through 9, including Step 2.5 (design pre-steps) and Step 2.5d (diagram suggestion). Step numbering there is unchanged from before the split, so cross-references naming a step by number still resolve. It delegates onward to `record-creation.md` (Steps 3-4), `red-team.md` (Step 5), and `design-pre-steps.md` (Step 2.5) exactly as before. When Step 9 completes, continue at `## Next Actions` below. Shaping mode's own procedure never runs on this path.

## Next Actions

Rendered for both modes — this is the one block that straddles them, which is why it stays in `SKILL.md` rather than moving into either mode file.

Self-routing — render based on what was produced. The records are **already durable** by the time this block renders: a `github-issues` run's shaped record and sub-issues exist on the tracker the moment the edit/create call lands; a `local-files` run's record files exist on disk regardless of whether decomposition mode's Step 9 found anything to commit. Never offer "commit then flow" or "have me commit these sub-issues" as an option; that question is closed before Next Actions renders (see shaping mode's write step, or decomposition mode's Step 9). Options are purely about *which* records to pipeline and in *what order*.

This "Situation → options" table is the assistant's own lookup logic to pick which situation applies — it stays internal and is never itself shown to the user or rendered as one of the markdown lines below. The commands below show the `work-backend: github-issues` form (`#{N}`); under `work-backend: local-files`, drop the `#` and emit bare record ids instead (`/claude-tweaks:flow {N}`, `/claude-tweaks:flow {N1},{N2},...`).

| Situation | Options |
|---|---|
| Shaping mode — one record shaped in place | 1. `/claude-tweaks:flow #{N}` — automated pipeline for record #{N}: "{title}" **(Recommended)**<br>2. `/claude-tweaks:build #{N}` — build only (no test/review/wrap-up)<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Shaping mode — multiple records shaped in place (a comma-separated list) | 1. `/claude-tweaks:flow #{N1},#{N2},...` — sequential pipeline for every record shaped this run **(Recommended)**<br>2. `/claude-tweaks:flow #{N1}` — pipeline just the first shaped record<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Decomposition mode — single sub-issue record produced | 1. `/claude-tweaks:flow #{N}` — automated pipeline for record #{N}: "{title}" **(Recommended)**<br>2. `/claude-tweaks:build #{N}` — build only (no test/review/wrap-up)<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Multiple sub-issue records produced from a single phase / single-phase doc | 1. `/claude-tweaks:flow #{N1},#{N2},...,#{Nk}` — sequential pipeline, all sub-issues **(Recommended)**<br>2. `/claude-tweaks:flow #{N1}` — pipeline just the highest-priority sub-issue<br>3. `/claude-tweaks:help` — pipeline dashboard |
| Phase-N decomposition with remaining phases in design doc | 1. `/claude-tweaks:flow #{N1},#{N2},...` — pipeline this phase's sub-issues **(Recommended)**<br>2. `/claude-tweaks:specify {doc} phase-{N+1}` — decompose next phase<br>3. `/claude-tweaks:help` — pipeline dashboard |
| All phases decomposed in one run (large multi-phase decomposition) | 1. `/claude-tweaks:flow #{first-phase-sub-issue-Ns}` — pipeline phase 1 sub-issues first **(Recommended)**<br>2. `/claude-tweaks:flow #{all-sub-issue-Ns}` — pipeline everything sequentially (long-running)<br>3. `/claude-tweaks:help` — see the full dependency graph before deciding |

Once the matching situation is resolved, render its numbered list as plain markdown (docs/skill-authoring.md's Skill handoffs convention) — one paste-ready command per line, the entry marked `(Recommended)` in the table renders first with its command bolded and suffixed `(recommended)`. The `work-backend: local-files` id-form note above still applies to every command line rendered this way. For the multiple-records row, `{N1},{N2},...` is the shaped elements only, in list order — an element the batch skipped never appears in the recommended command, and the block renders once, after the last element.

Always recommend `/claude-tweaks:flow` over `/claude-tweaks:build` — `/claude-tweaks:flow` is the canonical path through the pipeline, and the shape gate at materialization time (spec 20's contract) accepts well-structured sub-issue records of any size.

## Component-Skill Contract

`/specify` is user-facing in every invocation except one: `/claude-tweaks:capture`'s born-ready chain (`_shared/autonomy-ceiling.md`, trusted row capability (a)) invokes shaping mode as `Skill(skill: "claude-tweaks:specify", args: "#{n} --chained")`. The explicit `--chained` flag is the component-mode detection signal — `$PIPELINE_RUN_DIR` is still never consulted, because this skill dispatches `/superpowers:brainstorming` polymorphically rather than being invoked by a pipeline parent. Under `--chained`, `## Next Actions` is not rendered and no `AskUserQuestion` fires (see the flag's Input bullet for the design-intent headless default). Every other invocation renders Next Actions unchanged — a comma-separated batch renders it once, after its last element, from the "multiple records shaped in place" row. A batch under `--chained` is permitted but has no caller: the born-ready chain passes exactly one ref.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Specifying without a codebase scan | `/superpowers:writing-plans` then runs on blind assumptions — Step 1's Landscape reads cover git log + existing files. (Bare topics auto-invoke `/superpowers:brainstorming`.) |
| Sub-issue records that touch every layer | Data + API + UI + infra in one sub-issue exceeds agent-sized execution |
| Vague acceptance criteria | "Works correctly" isn't verifiable — `/superpowers:writing-plans` needs specific, testable assertions |
| Keeping the design doc after specifying | Dangling references — sub-issue records are the durable artifact. Exception: partial (`phase-N`) decomposition (Step 7). |
| Silently deciding how to handle overlapping records | Extend vs. companion vs. replace is a user decision — present numbered options |
| Mis-targeting design pre-steps | Design-intent is irrelevant on backend records; skipping the shape pre-step loses UX value on frontend ones. Step 2.5a gates both. |
| Writing a record body without a `Surface:` metadata line | Wrapper Layer 2 falls through to the less reliable file-extension sniff. `Surface:` is a body-metadata line — never YAML frontmatter, never a label — written by Shaping mode's Metadata block or Step 3's per-sub-issue procedure; values in `spec-template.md`. |
| Treating "topic with slash" as a path | Disambiguate explicitly — present the numbered choice, don't assume one interpretation |
| Producing a "phase plan" file alongside or instead of sub-issue records | Dead artifacts. The granularity contract is two tiers: design doc (multi-phase OK as `## Phase N` sections) → ready sub-issue records, one each. |
| Bypassing `/specify` on the way to `/flow` | `/flow` takes only sub-issue refs (`#N` / `#A,#B`) and hard-gates on shape at materialization — unshaped records stop the run. Recommend `/flow` over `/build` in Next Actions. |
| Granting or touching `auto:*`/`bot:*` from `/specify` | Authorization is human-granted only (`/backlog refine`'s territory); bot-state is machinery's. `/specify` adds `ready`, `risk:*`/`size:*`, Type when absent, removes `parked` on promotion, touches neither family (matrix in `_shared/work-record.md`). |
| Marking a parent issue `ready` | Only sub-issues get `ready` (+ scoring) — a `ready` parent issue is a design summary that enters the authorization worklist as if buildable. |
## Background

`/superpowers:writing-plans` produces multi-phase plan files (`*-P1.md`, `*-P2.md`, …) that exceed `/flow`'s envelope. The legacy path `/superpowers:brainstorming → writing-plans → /flow` had three artifact tiers with the middle tier agent-too-big. The current path is `/superpowers:brainstorming → /specify → /flow` — two artifact tiers where `/specify` produces ready sub-issue records sized for `/flow`'s shape gate (enforced at materialization time — spec 20's contract). `/superpowers:brainstorming` is unchanged; the granularity contract relies on the user (or a skill caller) routing through `/specify` rather than `writing-plans`.
