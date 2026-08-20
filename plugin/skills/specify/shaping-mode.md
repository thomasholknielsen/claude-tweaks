# Specify — Shaping Mode (one or more records)

Loaded by `/claude-tweaks:specify` when Resolve-the-input lands on case 1 (a work record reference,
or a comma-joined batch of them — `SKILL.md`'s `## Input`, "Comma-list batch form"), case 5 (a
backlog reference with no matching design doc), or the `next` form's headless entry (`next-mode.md`'s
Shape step, which fetches the claimed record itself and hands it to this procedure directly — the
same in-process invocation `--chained` uses, never a recursive `Skill()` call). Each record already exists and IS the target —
there is nothing to decompose, and none of decomposition mode's Steps 1-9 (`decomposition-mode.md`
in this skill's directory) ever run here.

**Batch = the same procedure, once per record.** A comma-list invocation has already resolved every
element (case 1's batch branch) before this file loads. Sniff every record's surface first (Step
2.5a needs only the fetched content) and resolve the one batched design-intent question (Metadata
block below), then run every section below independently for each record, in the order given: its
own five sections + `## Original request`, its own metadata block, its own
scoring/ceremony/framing/type stamps, its own compose-then-write-once call. Two things differ from a
single-record run and are stated where they apply below: interactive decisions raised per record
collapse into one batch table + one `AskUserQuestion` (Metadata block), and the Actions Performed
table renders one row per record. A failure shaping record *k* does not roll back records 1..k-1 —
each write already landed via the API (or on disk); report the failure on that record's own row and
keep shaping the rest.

This procedure is fully self-contained: once it completes, return to `SKILL.md`'s `## Next Actions`
block — except under `--chained`, or under the `next` form's headless posture (`next-mode.md`'s
Shape step), both of which return to the caller instead with no `## Next Actions` render (a comma
list never runs under `--chained` — `SKILL.md`'s `## Input` drops the flag with a notice first, and
`next` never shapes a comma list either — its own Flag rejection rejects it — so a batch always
reaches `## Next Actions`). Kept out of `SKILL.md` because shaping is now the primary path (`#N` record
references are the primary input) and it has no use for decomposition mode's much larger body.

**Parallel-safety.** Under `work-backend: github-issues`, shaping a record writes no local files — it edits the GitHub issue directly via `gh`, so no worktree is required and multiple records may be shaped concurrently with zero collision risk. `work-backend: local-files` does write a tracked file (`writeRecord`) and is not safe to parallelize without isolation.

---

### Edit the body into spec shape

Rewrite the record's body into six sections, in this literal shape (`spec-template.md`'s own placement — `### Key Files` nested under `## Technical Approach`):

```
## Current State

{...}

## Deliverables

{...}

## Acceptance Criteria

{...}

## Technical Approach

{...}

### Key Files

- `{path}` — {what changes or new file purpose}
- `{path}` — {what changes}

## Gotchas

{...}
```

`## Current State`, `## Deliverables`, `## Acceptance Criteria`, `## Technical Approach`, and `## Gotchas` are the core of the record body template `spec-template.md` documents — Current State, Deliverables, and Acceptance Criteria are the structural minimum (`_shared/work-record.md`'s spec-shaped-body check re-verifies exactly these three are present and non-empty before the authorization gate will grant anything); Technical Approach and Gotchas can stay brief for a small record. `### Key Files` is populated from whichever files the shaped Technical Approach names — every file path the composed Technical Approach section references belongs here, one bullet per path, in `spec-template.md`'s `- \`{path}\` — {what changes}` format; this is what `/flow`, `/dispatch`, and `/help` read for cross-spec file-overlap detection (`bin/lib/issues/grouping.js`'s `extractKeyFilesSection`) — omitting it silently disables that detection for this record (see Cross-spec conflict detection in `flow/multi-spec.md`). The template's fuller section list (Overview, Non-Goals, Prerequisites, and so on) is decomposition-mode scaffolding for multi-record output — a single shaped record doesn't need it.

Absorb the record's existing content into whichever section it belongs in — a human-filed or captured record's raw text usually becomes Current State plus Deliverables context, with Acceptance Criteria freshly written since raw captures rarely state them explicitly. A record already filed in this shape — every `by:code-health`/`by:harness-health`/`by:journey-health`/`by:docs-health` record is spec-shaped and agent-sized by construction, per `_shared/work-record.md`'s born-ready rule — needs near-zero translation: verify the sections are present and non-empty and move on rather than rewriting content that's already correct.

One authoring constraint on the composed prose itself: never write the literal placeholder tokens `TBD`, `TODO`, or `<!-- ambiguity:` anywhere in a composed body — not even as a *mention* (e.g. "…not as a TODO in the files"). `_shared/work-record.md`'s spec-shaped-body check, re-run by `/claude-tweaks:backlog refine`'s Step 3.5 and the grant gate, greps for these tokens with no context sensitivity, so a prose mention flags the record as carrying an unresolved placeholder and downgrades it back out of `ready`. Paraphrase instead ("a deferred-work comment", "an unresolved marker").

When a human-filed defect report names a specific affected file, function, or exact error string, do a cheap sanity check before shaping: grep the named artifact against the codebase. A miss doesn't necessarily mean the report is wrong (the code may be newer, or the artifact may genuinely live elsewhere) — but it's a fact-check worth doing at shaping time rather than discovering it mid-build, after a worktree and (under `pr-first`) a draft PR already exist (`#174`).

### Preserve the original request

Before editing, keep the record's fetched title and body exactly as they were. Append them to the composed body as their own section, using this exact heading — this is a rule, not a suggestion, and the section name is literal:

```
## Original request

{original title}

{original body, verbatim}
```

The shaped sections above are `/specify`'s editorial interpretation; `## Original request` is the record's ground truth if that interpretation ever needs to be checked or redone.

### Metadata block

Run Step 2.5a's frontend-detection sniff (`design-pre-steps.md`) against the record's own content — not a design doc — to decide `Surface:`. When frontend, also run Step 2.5c's design-intent question to decide `Design-intent:` — under `--chained`, or under the `next` form's headless posture, that step never asks and resolves to `Design-intent: none` (its own `--chained` branch; `next` pre-resolves this itself in `next-mode.md`'s Flag rejection step, before this file ever loads, the same "already resolved, just write it" shape a batch's pre-resolved value gets below). On a comma-list batch, run the sniff per record but ask the design-intent question **once** for all frontend records together: render one batch table (record, sniffed surface, recommended intent pre-filled) followed by a single `AskUserQuestion` for apply-all/override, per the Interaction style directive — never one call per record; backend/infra records in the same batch appear in the table with `Design-intent: —` and are not asked. On a batch, both the sniff and that single question already ran once, upfront, per this file's opening paragraph — reaching this section for a given record in the per-record loop below only writes that record's already-resolved values into its own composed body; nothing here fires a second time. Insert a metadata block at the very top of the composed body, above `## Current State` and above `## Original request`:

```
Surface: web
Design-intent: {value}
```

Backend/infra records omit the `Design-intent:` line entirely — it only applies when Step 2.5a detected a frontend surface:

```
Surface: backend
```

These are plain body-metadata lines, not YAML frontmatter — capitalized keys, no code fence, no `---` markers. This is the wire format `/flow`/`/build` (spec 20's materialization step) lift into the build-time header. Values, for reference:

| `Surface:` | Meaning |
|---|---|
| `web` | Web page / responsive web UI |
| `mobile` | Native app surface — SwiftUI, UIKit, Compose, React Native, Flutter (not a web page merely viewed on a phone) |
| `desktop` | Desktop app UI (takes the design pipeline's web track) |
| `backend` | Server/API/data-layer work, no rendered UI |
| `infra` | Infrastructure/tooling/config work, no rendered UI |
| `terminal` | CLI/TUI surface — help text, output formatting, prompts, exit codes |

| `Design-intent:` | Meaning |
|---|---|
| `bold` | Eye-catching, confident |
| `quiet` | Restrained, refined |
| `minimal` | Strip to essence |
| `delightful` | Personality, micro-interactions |
| `onboarding` | First-run flows, empty states |
| `none` | No specific creative direction |

`spec-template.md` stays canonical for the full metadata-block field set these two tables slice — including `Design-seed:`/`Visual-reference:`/`Parent:`, which shaping mode never writes. The `Design-intent:` one-liners above restate `design-pre-steps.md`'s Step 2.5c `AskUserQuestion` descriptions; keep both tables in sync by hand if either enum ever changes.

### Stamp scoring and stage labels

Using the facets already read in Resolve-the-input case 1/5 (`parseRecordFacets` for GitHub, the record's own `facets` for local), update independently per family — never touch a family that's already stamped:

- **`risk:*` absent** — judge low/medium/high from the now-shaped Deliverables and Acceptance Criteria (blast radius, reversibility), per `_shared/work-record.md`'s Scoring axis, then stamp it.
- **`size:*` absent** — judge low/medium/high the same way (estimated size), then stamp it.
- **`ceremony:*` absent** — invoke `/claude-tweaks:assess-agent-autonomy` in `ceremony-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check #{n}")`) against the now-shaped body — the same input a fresh fetch would use, but already in memory here. Stamp the verdict as an explicit label, `ceremony:fast-lane` or `ceremony:standard` — never omit it, unlike `risk:*`/`size:*`'s omit-when-unscored convention (this axis has no unscored state; every record gets a verdict the first time it's shaped). Bootstrap both label values per `_shared/label-bootstrap.md` before the first write, same as any new label pair.
- **Framing** — invoke `/claude-tweaks:challenge` in `framing-check` mode (`Skill(skill: "claude-tweaks:challenge", args: "framing-check #{n}")`) against the now-shaped body **and** the `## Original request` block preserved above.

  On `FRAMING: open`, stamp nothing and add nothing — absence is the clean state.

  On `FRAMING: solution-baked`, before stamping anything, run one bounded evidence search — a single pass, not iterative — against exactly two sources, for each technology/mechanism name the RATIONALE names as unjustified (search each independently when more than one is named):
  1. Grep the codebase for an existing benchmark/profile/measurement/decision-doc referencing the search term(s), and `CLAUDE.md` for a documented prior decision on the same tradeoff.
  2. `gh issue list --state closed --search "{search term(s)}"` (or `queryRecords('specs', { closed: true })` filtered to title/body match, under `local-files`) for a related closed record.

  **What counts as evidence:** a hit must reference the *same* named technology/mechanism *and* state a measurement, benchmark result, or an explicit prior decision — a bare name match with no such content does not count.

  If evidence meeting that bar is found for every named technology/mechanism, fold it into the composed body's `## Current State` (below, before the compose-then-write-once write call) and re-invoke `framing-check` once against the updated body — the second verdict is the sole authority on whether the justification is now sufficient. If the second verdict reads `open`, stamp nothing (same as the first-pass `open` case above). If evidence is not found for every named item, or the second verdict still reads `solution-baked`, stamp the `solution:unjustified` label and fold the RATIONALE's (or, after a re-invocation, the second verdict's) named assumptions into the body's `## Gotchas` section as bullets, each carrying its validation status.

  If the record already carries `solution:unjustified` (or the legacy `framing:baked`) from an earlier shaping pass (a parked-then-re-promoted record whose framing has since been resolved) and this pass's outcome is a clean `open`, **remove** it — the same promotion-time cleanup shaping mode already applies to `parked`, below. Never stamp `solution:unjustified` on an `open` outcome, and there is no `solution:justified` counterpart to fall back to. Bootstrap `solution:unjustified` per `_shared/label-bootstrap.md` before the first write. Both the Gotchas bullets and the label add/remove ride the single compose-then-write-once pass below — never a second edit.
- **Type absent** — judge `bug | feature | task` from the now-shaped content (defect vs. new capability vs. maintenance/refactor/docs/chore), per `_shared/work-record.md`'s Type axis, then stamp it: `work-backend: github-issues` — `work-types: native` applies the native Issue Type (`--type {t}` on the edit call below); `work-types: labels` adds the matching label instead (`--add-label "type:{t}"`, pair lives in `record.js`'s `TYPE_LABELS` — bootstrap it first per `_shared/label-bootstrap.md`, as decomposition mode does). `work-backend: local-files` — set `facets.type` in the `writeRecord` call below.
- **`parked` present** — remove it; a record entering shaping mode is being promoted out of hold.
- **`ready`** — add it (idempotent when already present, e.g. a born-ready record).

**Per-record invocation.** Every run — a single record or a comma-list batch alike — the `ceremony-check #{n}` and `framing-check #{n}` invocations above run once per record; on a batch this means once per record inside the per-record loop, never reused or rendered from memory for a later record. **Self-check before writing:** confirm exactly one `ceremony-check #{n}` and one `framing-check #{n}` Skill invocation exist for this record (two `framing-check #{n}` invocations where the solution-baked evidence path above re-invoked once) before the compose-then-write-once pass below — a divergent ceremony or framing verdict across records, whether within one batch or across sequential single-record runs in the same session, is only valid when each record had its own invocation. **Under the `next` form's headless posture only:** one additional `framing-check #{n}` invocation, made by `next-mode.md`'s own `## Framing Guard` step before this file ever loads, does **not** count toward this self-check. It served a different purpose — routing the claimed record (shape it, or stamp `needs:definition` and stop), computed against the record's raw pre-shaping body — whereas this file's own invocation decides the `solution:unjustified` stamp against the now-shaped body plus `## Original request`. The two verdicts are independent inputs to independent decisions and may legitimately disagree; only this file's own invocation is the one this self-check counts, and only its verdict drives the stamp.

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
  --add-label "size:{tier}" \
  --add-label "ceremony:{tier}" \
  --type {t} \
  --remove-label parked
```

Omit `--add-label "risk:{tier}"` / `--add-label "size:{tier}"` / `--add-label "ceremony:{tier}"` for whichever family was already stamped; omit `--type {t}` (or the `--add-label "type:{t}"` swap) when Type was already present; omit `--remove-label parked` when the record never carried it. `--add-label "solution:unjustified"` follows a different rule from the three above: it is never about a family already being stamped, and it does not appear in the call by default — add it only when the Framing verdict (above, after the bounded evidence search where applicable) is `solution-baked`; on `open` add nothing. The label is presence-only and absence IS the clean state — most records are `open` (or clear evidence was found), so absence is the common case, not the exception; there is no `solution:justified` counterpart to fall back to. The reverse case needs its own flag: when the outcome is `open` **and** the record already carries `solution:unjustified` (or the legacy `framing:baked`) from an earlier pass, add `--remove-label "solution:unjustified"` (and `--remove-label "framing:baked"` too, when present, to fully retire the legacy label off this record) to the same call — the identical cleanup-on-promotion idiom as `--remove-label parked`, omitted when the record never carried either label.

One further flag is keyed to the **entry path**, not to any verdict: when this pass was entered via the `next` form's headless posture (`next-mode.md`'s Shape step — this file's opening paragraph names it as an entry path), add `--add-label "shaped:headless"` to this same call, alongside `--add-label ready`. Unlike `--add-label "solution:unjustified"`, this one is **unconditional** whenever the entry was via `next` mode — every successful `next`-mode shape carries the provenance marker, no exceptions — and it never appears at all under the interactive or `--chained` entry paths, which have a human or a caller in the loop. Carrying it in this call is what makes the pair atomic: `ready` and `shaped:headless` land in one write, so no reader ever observes a `next`-shaped record as `ready` (and therefore permanently outside `next`'s own eligibility query) without its marker, and a failed write leaves the record unshaped and still eligible rather than stranded half-stamped. Bootstrap `shaped:headless` per `_shared/label-bootstrap.md` before the first write, same as any other new label.

**`work-backend: local-files`:** one `writeRecord` call does the same job, setting `facets.stage: 'ready'` (which supersedes any prior `'parked'` value — the two are mutually exclusive states) and filling `facets.risk`/`facets.size`/`facets.ceremony`/`facets.type` when they were `null` (`facets.ceremony` always gets a value the first time a record is shaped — no null/unscored state for this axis, unlike `risk`/`size`) and `facets.solutionUnjustified` (unlike `facets.ceremony`, this one is written `true` ONLY on a final `solution-baked` outcome — `false` whenever the outcome is `open`, matching `sharedFacetDefaults()`'s own default). When the outcome is `open` and the record's existing `facets` already carry `solutionUnjustified: true` from an earlier pass, clear it — set `facets.solutionUnjustified` to `false` in the same `writeRecord` call rather than leaving a stale `true` on a record that has since re-shaped clean:

```bash
node -e "const {writeRecord}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
  writeRecord(process.argv[1], { title: process.argv[2], body: process.argv[3], facets: JSON.parse(process.argv[4]) });
" "$RECORD_PATH" "$TITLE" "$SHAPED_BODY" "$FACETS_JSON"
```

then commit — a local record is a tracked file, unlike a GitHub issue edit. On a comma-list batch, commit **once per record**, immediately after that record's `writeRecord` — never leave some records written and uncommitted while the next one is being shaped:

```bash
git add "$RECORD_PATH"
git commit -m "Shape record {id} into spec shape — ready"
```

Nothing to commit on the `github-issues` driver — the edit above already landed via the API.

### Read-back verification

Immediately after each record's write lands — the `gh issue edit`/`writeRecord` call above, for that record specifically, before moving to the next record in the batch — re-fetch the record fresh (never trust the write call's own response) and assert it landed correctly:

- **`work-backend: github-issues`:** `gh issue view {n} --json labels,body`.
- **`work-backend: local-files`:** `readRecord(path)` (`bin/lib/issues/local-store.js`), re-reading from disk.

Assert, against the re-fetched result:
- `ready` is present, plus every scoring label this record's stamp step (above) added or already carried (`risk:*`, `size:*`, `ceremony:*`, Type). When this pass was entered via the `next` form's headless posture, `shaped:headless` is present too — the atomicity guarantee above is only as good as this check catching a partial write of the two-flag call.
- The five spec-shaped sections (`## Current State`, `## Deliverables`, `## Acceptance Criteria`, `## Technical Approach`, `## Gotchas`) plus `## Original request` are all present in the re-fetched body.
- No unresolved placeholder marker (`TBD`, `TODO`, `<!-- ambiguity:`) survived into the written body (these exact literals — assertion targets, not composed-body mentions — see the placeholder-token rule above).
- `parked` is absent from the re-fetched labels — the stamp step above always removes it on promotion.
- When this record's framing verdict (stamp step above) was `open`, `solution:unjustified` (and the pre-rename spelling `framing:baked`) are absent. When the verdict was `solution-baked`, `solution:unjustified` is present instead, and the Gotchas section carries the folded assumption bullets the stamp step wrote.

A read-back failure does **not** roll back the write or stop the batch — it follows the same per-record failure-isolation posture as a write failure (above): note the specific assertion(s) that failed, keep shaping the rest of the batch, and surface every record's read-back failure together in Actions Performed below rather than stopping on the first one (`flow/materialize.md`'s Materialization hard gate uses the same all-at-once reporting convention for its own record-level failures).

### Actions Performed

One row per record — a single-record run renders one row, a comma-list batch renders one row per shaped record (a record whose write failed, or whose read-back verification (above) failed, renders its row with the failure in the Detail cell instead of the stamps):

| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Shaped record {ref} into spec shape — stamped `risk:{tier}`/`size:{tier}`/`ceremony:{tier}` and Type where each was absent, added `ready`, removed `parked` if present | `{hash}` (local-files) / `—` (github-issues — edit already landed via API, no commit) |

For a comma-list batch, render one row per shaped element, in list order, and prefix each Detail with its outcome: `shaped` (this run edited the record — the row above), `already shaped, no-op` (every section present and non-empty and every label family already stamped — nothing written, nothing to undo), or `failed` (either the write call itself failed, or the read-back verification (above) failed — the Detail cell's own text names which one). There is no `skipped` outcome here — the batch branch's stop-all failure semantics (`SKILL.md`'s `## Input`, Comma-list batch form) mean an unresolvable element never reaches shaping mode at all; every row this table renders is an element that was actually shaped. The Ref column follows the same per-driver rule on every row.

Shaping mode ends here — return to `SKILL.md` and render its `## Next Actions` block: the "Shaping mode — one record shaped in place" row of its Situation table for a single record, the "Shaping mode — multiple records shaped in place" row for a comma-list batch (its recommended command lists every successfully shaped record, in the order given). Under `--chained` (see `SKILL.md`'s Input and Component-Skill Contract), or under the `next` form's headless posture (`next-mode.md`), skip Next Actions entirely and return control to the calling skill — the shaped, `ready` record is the whole deliverable; `next-mode.md` has nobody present to read a rendered Next Actions block anyway.

`/specify` adds `ready`, `risk:*`/`size:*` (when unstamped), and Type (when absent), removes `parked` on promotion, and never touches `auto:*` or `bot:*` — those stay `/backlog refine`'s (human-granted authorization) and `/dispatch`'s (bot-state mirror) territory.
