---
name: specify
description: Use when shaping a work record into spec shape — one `#N`, a `#N,#M` list, or `#A-#B` range, one at a time — or decomposing a design doc into agent-sized ready sub-issue records. Keywords - specify, shape, decompose, spec, design doc, sub-issue, ready, batch.
argument-hint: "<next|#N[,#M...]|#A-#B|record-id[,id...]|design-doc-path|topic|backlog-title> [phase-N] [--surface <web|mobile|desktop|backend|infra|terminal>] [--granularity <fine|standard|coarse>] [--chained]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.


# Specify — Shape work records and decompose designs into ready sub-issue records

Shape one or more work records — a `#N` reference, or a comma-separated list of them, one at a time — into spec shape, or decompose a brainstorming design document into a parent record plus ready sub-issue records. Part of the workflow lifecycle:

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

`/claude-tweaks:specify` is the canonical entry point — its polymorphic input accepts a work record reference (or a comma-separated list, or an inclusive range, of them), a design doc path, a topic, or a backlog reference. A record reference is shaped in place (**shaping mode**, below); a design doc — read directly, matched from a topic, or produced by invoking `/superpowers:brainstorming` internally for a bare topic with no existing doc — decomposes into a parent record plus ready sub-issue records (**decomposition mode**, Steps 1-9). The contract holds at two enforcement points: this skill's phase-aware decomposition and `/flow`'s Step 2.7 design-doc rejection. See the "Background" section near the end of this file for the historical context on why `/superpowers:writing-plans` is bypassed.

## Input

`$ARGUMENTS` = `<next-or-record-ref[,record-ref...]-or-range-or-design-doc-or-topic> [phase-N] [--surface <value>] [--granularity <value>] [--chained]`

The first argument is a work record reference (`#N`, an issue URL, or a bare local record id), a comma-separated list of record references (the batch paragraph below), an inclusive range of record references (the range paragraph below), a path to a design doc, a topic name, or a backlog reference. The optional second argument `phase-N` (where N is a phase number from the design doc's `## Phase N` sections) scopes decomposition to one phase only — useful when running phases incrementally or in parallel. `phase-N` only applies when the input resolves to a design doc (decomposition mode); a work record reference resolves to shaping mode and ignores it.

**`next` (headless-safe form).** The unit a scheduled Routine fires — mutually exclusive with every other first-argument shape. Selects, claims, and shapes exactly one eligible unshaped backlog record per firing; zero eligible records is a cheap no-op. `work-backend: github-issues` only (see `next-mode.md`'s Preflight). `phase-N`, `--surface`, `--granularity`, and `--chained` are each rejected with a one-line notice when combined with `next` — this form takes no modifiers. See `next-mode.md` in this skill's directory for the full procedure.

**Comma-list batch form (`#N[,#M...]` — shaping-mode-only).** Several record references may be given as one comma-joined token — `#701,#702` under `work-backend: github-issues`, or `record-id[,id...]` (e.g. `701,702`) under `work-backend: local-files` — mirroring `/claude-tweaks:flow`'s `#42,#45,#48` convention (a space after a comma is tolerated and trimmed). When **every** element parses as a record reference per Resolve-the-input case 1, the argument is a batch. Three non-batch shapes: **no** element parses as a record reference — the argument is not a list at all but ordinary free text, resolved through cases 3-5 exactly as for any other input, so a topic containing a comma ("auth, login flow") is neither a batch nor an error; **some but not all** elements parse as record references (`#695,docs/x-design.md`, `#695,meal planning`) — a mixed list is a hard input error, rejected with a one-line message naming the offending element (`"'{element}' is not a record reference — a comma list shapes records only; give a design doc or topic on its own"`), since decomposition and topic resolution stay single-input; an **empty** element (a trailing comma, `#41,`, or two commas in a row) is named as exactly that, "empty element after `#41`", so the human sees the stray comma rather than an unnamed offender. Each element resolves independently (parallel fetches, as `flow/materialize.md`'s Resolution does); an element that fails to resolve (missing, wrong repo, `gh issue view` error / no matching `specs/{n}-*.md`) stops the whole invocation before any record is shaped — every unresolvable element is reported in one message and nothing is shaped, the same all-at-once hard stop as `flow/materialize.md`'s Record-not-found rule (chosen over silently skipping and continuing, so the plugin's comma-list batch forms fail the same way everywhere). Only when every element resolves does the whole set enter shaping mode together — `shaping-mode.md`'s per-record loop, a loop never a fan-out (no Task dispatch, one record at a time). `phase-N` and `--granularity` are ignored on a comma list exactly as they already are for a single record reference; `--surface` applies to every record in the batch (the "every record this run produces" semantics below); `--chained` on a comma list is rejected — the flag is ignored with a one-line notice, the same posture as the flag's other unsupported input shapes (its own bullet below), and the batch still shapes and renders `## Next Actions`; `/claude-tweaks:capture`'s born-ready chain shapes exactly one record per invocation, and that contract does not change here.

**Range form (`#A-#B`/`#A–#B` — shaping-mode-only).** An inclusive range of record references — `#701-#705` or `#701–#705` (hyphen or en-dash) — expands to the equivalent comma-joined list (`#701,#702,#703,#704,#705`) before any of the comma-list batch form's own resolution logic above runs; from that point on it is indistinguishable from a comma list typed directly, including the mixed-list/empty-element error handling, the all-or-nothing resolve, and the `phase-N`/`--granularity`/`--chained` ignore-or-reject rules. `A` and `B` are bare integers under `work-backend: github-issues` (`#701-#705`) or bare record ids under `work-backend: local-files` (`701-705`); `A` must be less than or equal to `B`, or the input is a hard error (`"'{input}' is not a valid range — {A} must be ≤ {B}"`) before expansion is attempted. Under `work-backend: github-issues`, the `#` sigil is required on **both** bounds — `#123-456` (sigil on the first bound only) does not parse as a range; under `work-backend: local-files`, bounds are already bare integers with no sigil on either side, so this constraint has nothing further to tighten there. A range expanding to more than 25 elements (`B - A + 1 > 25`) is a hard input error naming the element count, before expansion is attempted (`"'{input}' expands to {count} records — ranges are capped at 25; use a comma-list for a larger set"`) — the same hard-input-error posture as the `A ≤ B` check above, guarding against a typo like `#1-#705` attempting to shape hundreds of records. A range that expands to a single element (`A == B`) resolves as an ordinary single record reference, not through the Batch branch. **Any input that is range-shaped but fails to parse as a valid range** — missing sigil on either bound, more than one hyphen/en-dash, a non-numeric bound, or `A > B` — is a hard input error naming the specific problem (`"'{input}' looks like a range but is not valid — {reason}"`), raised at case 1's own resolution point, before cases 2-5's path/topic/backlog fallback ever runs. This is deliberate, not the general "unrecognized shape" fallback: a bare word like `meal planning` correctly falls through to topic resolution (case 3/4), but a token containing `#` and a hyphen/en-dash is unambiguously an attempted record reference, so letting it silently fall through to `/superpowers:brainstorming` (case 4) on a garbage "topic" string would be worse than an explicit rejection.

Three optional flags may appear anywhere after the first argument (the first two in either mode; `--chained` in shaping mode only):

- `--surface <web|mobile|desktop|backend|infra|terminal>` — bypasses Step 2.5a's frontend-detection sniff entirely and uses the given value directly as `Surface:` for every record this run produces (every record shaped in shaping mode — the one record for a single ref, each element of a batch — or the parent and every sub-issue in decomposition mode). Step 2.5c's design-intent question still runs when the given value is a frontend surface (`web`/`mobile`/`desktop`); it's skipped, as usual, for `backend`/`infra`. Use this to correct a sniff that would misfire — e.g. a backend batch job whose description happens to mention "dashboard." `terminal` behaves like `backend`/`infra` for the design pre-steps (2.5b/2.5c skipped — no scaffold, no design-intent question) while still writing `Surface: terminal` so the design wrapper resolves the terminal track downstream.
- `--granularity <fine|standard|coarse>` — tunes Step 2's Sizing Guidelines for this run only; default `standard` (today's targets, unchanged). `fine` produces smaller, more numerous sub-issues; `coarse` produces fewer, larger sub-issues. Decomposition mode only — shaping mode has nothing to decompose, so this flag is ignored there.
- `--chained` — component-mode invocation for this skill's one skill caller: `/claude-tweaks:capture`'s born-ready chain (see the Component-Skill Contract below). Shaping mode on a record reference only — on any other input shape (a comma-list batch, design doc, topic, decomposition), ignore the flag and surface a one-line notice rather than erroring. Headless: `## Next Actions` is not rendered, and the one decision shaping mode would otherwise raise interactively — Step 2.5c's design-intent question, when Step 2.5a's sniff detects a frontend surface — resolves to `Design-intent: none` without prompting, logged per `_shared/auto-decision-log.md` when a run directory resolves per `_shared/pipeline-run-dir.md`, otherwise noted in the returned output only.

Input is polymorphic — see the canonical definition in the Granularity Contract section above. The resolution steps below handle each input shape.

**Phase target examples:**

```
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md           → decompose ALL phases (or whole doc if no phases)
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md phase-2   → decompose phase 2 only
/claude-tweaks:specify food graph                                → resolve to design doc, decompose all
/claude-tweaks:specify food graph phase-3                        → resolve to design doc, decompose phase 3 only
/claude-tweaks:specify #142                                      → shape record #142 in place
/claude-tweaks:specify next                                      → headless: shape exactly one eligible backlog record, or no-op if none eligible
/claude-tweaks:specify #142 --surface backend                    → shape record #142, forcing Surface: backend regardless of the sniff
/claude-tweaks:specify #142,#143,#150                            → shape records #142, #143, #150 in place, one after another (comma-list batch, shaping mode only)
/claude-tweaks:specify #142-#144                                  → shape records #142, #143, #144 in place (range form, expands to the comma-list)
/claude-tweaks:specify docs/superpowers/specs/food-graph-design.md --granularity fine   → decompose all phases with finer (smaller, more numerous) sub-issues
```

**Phase detection:** scan the design doc for `^## Phase \d+` headings. If 0 found and no `phase-N` was given, treat the whole doc as one phase. If 1+ found and no `phase-N` was given, decompose all phases sequentially. If `phase-N` was given but the section doesn't exist, stop and present the available phases as numbered options.

### Resolve the input:

0. **Literal `next`** — the headless-safe form (see `## Input` above). Read `next-mode.md` in this skill's directory and follow it in full. This case ignores `phase-N`/`--surface`/`--granularity`/`--chained` if present — see that file's own flag-rejection step. `next-mode.md` is fully self-contained; when it completes, this skill's turn is over (its own Preflight/no-op/failure paths each end the invocation; there is no `## Next Actions` render for a headless firing — see `next-mode.md`'s own posture, mirroring `dispatch/SKILL.md`'s "nobody is present to answer" rule).
1. **Work record reference** — a URL matching `https://github.com/{owner}/{repo}/issues/{n}`, or a shorthand like `#123` / `issue 123` / `gh-123`, or a bare local record id (e.g. `42`). Checked *before* case 2's path/topic disambiguation, since an issue URL contains `/` and would otherwise misparse as a design-doc path. Fetch it directly: `gh issue view {n} --json number,title,body,url,labels` (GitHub driver) or glob `specs/{n}-*.md` for the matching file, then `readRecord(path)` (`bin/lib/issues/local-store.js`; local-files driver).

   **`needs:definition` redirect (single-record path only).** Immediately after this fetch, check the fetched labels (or, local-files, `facets.needsDefinition`) for `needs:definition`. If present: do **not** enter shaping mode — no body edit, no `ready` label. Capture the origin record's number as `$ORIGIN_RECORD_NUM` (an execution-context variable carried forward the same way `$PARENT_NUM`/`$SUB_ISSUE_NUM` already flow between decomposition mode's own steps), invoke `/superpowers:brainstorming` (Skill tool) with the record's title + body as input, wait for the resulting design doc, then enter **decomposition mode** on that design doc with `$ORIGIN_RECORD_NUM` carried forward — see `decomposition-mode.md`'s Step 9 for what happens to the origin record once decomposition completes. `$ORIGIN_RECORD_NUM` is never set on any other entry path (cases 2-5). On a **batch branch** (below), a `needs:definition` element instead fails the whole invocation the same way an unresolvable element does — "'{element}' carries `needs:definition` — run `/claude-tweaks:specify #{element}` on its own to route it through brainstorming first, then re-run the batch without it" — a comma-list batch shapes only, so it can neither redirect one element into brainstorming nor silently skip it.

   Absent `needs:definition`: enter **shaping mode** (below) — the record IS the target, not a source to translate; there is no source-extraction step. Scoring is read from the fetched labels via `parseRecordFacets` (`bin/lib/issues/record.js`) or the record's `facets` (local) only to decide which of `risk:*`/`size:*` shaping mode still needs to stamp — never to gate whether shaping runs. **Batch branch:** first, expand a range-form first argument (`#A-#B`/`#A–#B` — see `## Input`'s Range form paragraph) to its equivalent comma-joined list; then, when the (possibly range-expanded) first argument contains a comma (the `#N[,#M...]` form in `## Input`), split on `,`, resolve every element through this same case independently (parallel fetches) — including the `needs:definition` check above, per element — and — if any element fails to resolve or carries `needs:definition`, report every unresolvable/redirect-needed element in one message and stop, shaping nothing; only when every element resolves clean, enter shaping mode with the full set — `shaping-mode.md` loops its procedure once per record. An element that is not a record reference fails the whole invocation with the one-line error `## Input` states; nothing is shaped. **Range-shaped rejection point:** a first argument that is range-shaped (contains `#` and a hyphen/en-dash) but fails the Range form paragraph's own validity checks is rejected right here, with that paragraph's `"'{input}' looks like a range but is not valid — {reason}"` error — it never falls through to case 2's path check or cases 3-5's topic/backlog resolution, since an unambiguous attempted record reference must never be silently reinterpreted as free text.
2. **Design doc path** (e.g., `docs/superpowers/specs/2026-02-21-meal-planning-design.md`) — read it directly. Disambiguation rule: a string containing `/` or ending in `.md`, that didn't match case 1 above, is treated as a path. Enter **decomposition mode** (Step 1 onward).

**Execution order for cases 3-5:** these three cases all apply to input that is neither a record reference (case 1) nor a path (case 2) — free text. They are listed below grouped by resolution outcome, not by execution order. Try case 5's record search first: does an open record's title match these keywords? Only when that search finds nothing, fall through to case 3's design-doc search; only when that also finds nothing, fall through to case 4's brainstorming invocation. A reader implementing cases 3-5 in list order instead (design doc before backlog record) resolves free text differently than intended.

3. **Topic name** (e.g., `meal planning`) — reached only after case 5's record search below found no matching open record. Search `docs/superpowers/specs/*-design.md` for a matching design doc. If found, read it directly and enter **decomposition mode**.
4. **Topic name with no matching design doc** — invoke superpowers `/superpowers:brainstorming` via the Skill tool with the topic as input (this is the polymorphic-input branch defined above). The brainstorming session produces a design doc at `docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md` (or wherever superpowers writes it). Wait for `/superpowers:brainstorming` to complete, then continue with the produced design doc as the input, entering **decomposition mode**. **Do not** prompt the user to "run brainstorm first" — that defeats the contract.
5. **Backlog reference** (e.g., `"Voice shopping list"`) — try this search first for any free-text input (before falling through to case 3), per the execution-order note above. A record query, not a file lookup: search open records by title keywords — `gh issue list --search "{keywords}" --state open --json number,title,labels --limit 10` (GitHub driver — the same narrow field set `skills/capture/SKILL.md`'s Option 4 candidate search uses, plus `labels` for the `needs:definition` check below, dropping `body` since only the title match matters for the search itself) or `queryRecords('specs', {})` (`bin/lib/issues/local-store.js`; local-files driver), filtered to titles matching the keywords. Then check whether a design doc already exists for the matched topic (same lookup as case 3): if one does, read it and enter **decomposition mode**. If not: apply the identical `needs:definition` redirect case 1 defines (check the matched record's fetched labels/`facets.needsDefinition`; if present, skip shaping mode, capture `$ORIGIN_RECORD_NUM`, invoke `/superpowers:brainstorming`, and enter decomposition mode with `$ORIGIN_RECORD_NUM` carried forward — see case 1 for the full procedure, not restated here); absent the label, enter **shaping mode** directly on the matched record as before. A backlog reference never invokes brainstorming on its own for any other reason — that only happens via case 4 (bare topic, no existing record) or this redirect.

**Ambiguous input handling:** A topic name that *could* also be interpreted as a path (e.g., a topic with a `/` in it like "auth/login flow") is ambiguous. Stop and call `AskUserQuestion` with:

- `question`: `"'{input}' could be a topic name or a path. Which did you mean?"`, `header`: `"Input type"`, `multiSelect`: `false`
- Option 1 — `label`: `"Topic name"`, `description`: `"invoke /superpowers:brainstorming to produce a design doc"`
- Option 2 — `label`: `"Design doc path"`, `description`: `"read the file directly"`

This explicit disambiguation prevents the silent wrong-path failure flagged by past polymorphic-input edge cases.

## Shaping mode (one or more records)

Entered from Resolve-the-input case 1 (a work record reference, or a comma-joined batch of them) or case 5 (backlog reference with no matching design doc). Each record already exists and IS the target — there is nothing to decompose; a batch runs the same procedure once per record.

Read `shaping-mode.md` in this skill's directory for the full procedure: editing the body into spec shape, preserving the original request, the `Surface:`/`Design-intent:` metadata block, stamping scoring and stage labels, and the compose-then-write-once write call per driver. That procedure is fully self-contained — when it completes, continue at `## Next Actions` below (for a batch, continue with the next element instead and render Next Actions only after the last), except under `--chained`, which returns to the caller instead. Decomposition mode's Steps 1-9 never run on this path.

## Decomposition mode (design doc into parent + sub-issues)

Entered from Resolve-the-input case 2 (design doc path), case 3 (topic matching an existing design doc), case 4 (bare topic, after `/superpowers:brainstorming` produces the doc), or case 5 where the matched record's topic already has a design doc.

Read `decomposition-mode.md` in this skill's directory for the full procedure — Steps 1 through 9, including Step 2.5 (design pre-steps) and Step 2.5d (diagram suggestion). Step numbering there is unchanged from before the split, so cross-references naming a step by number still resolve. It delegates onward to `record-creation.md` (Steps 3-4), `red-team.md` (Step 5), and `design-pre-steps.md` (Step 2.5) exactly as before. When Step 9 completes, continue at `## Next Actions` below. Shaping mode's own procedure never runs on this path.

## Routine Configuration

`/specify` ships a routine template (`skills/specify/routine-template.yml`) whose prompt is `/claude-tweaks:specify next` — the headless selection form (#967). Instantiate it for the current project with:

```
/claude-tweaks:routine create specify
```

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
