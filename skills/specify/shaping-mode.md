# Specify — Shaping Mode (single record)

Loaded by `/claude-tweaks:specify` when Resolve-the-input lands on case 1 (a work record reference)
or case 5 (a backlog reference with no matching design doc). The record already exists and IS the
target — there is nothing to decompose, and none of decomposition mode's Steps 1-9
(`decomposition-mode.md` in this skill's directory) ever run here. A comma-separated list of record references (`SKILL.md`'s `## Input`, batch paragraph) enters this procedure once per element, sequentially — nothing below changes for a list; only the Actions Performed table and the Next Actions hand-off at the end know a list happened.

This procedure is fully self-contained: once it completes, return to `SKILL.md`'s `## Next Actions`
block — except under `--chained`, which returns to the caller instead. Kept out of `SKILL.md` because shaping is now the primary path (`#N` record references are
the primary input) and it has no use for decomposition mode's much larger body.

---

### Edit the body into spec shape

Rewrite the record's body into five sections: `## Current State`, `## Deliverables`, `## Acceptance Criteria`, `## Technical Approach`, and `## Gotchas`. These are the core of the record body template `spec-template.md` documents — Current State, Deliverables, and Acceptance Criteria are the structural minimum (`_shared/work-record.md`'s spec-shaped-body check re-verifies exactly these three are present and non-empty before the authorization gate will grant anything); Technical Approach and Gotchas can stay brief for a small record. The template's fuller section list (Overview, Non-Goals, Prerequisites, and so on) is decomposition-mode scaffolding for multi-record output — a single shaped record doesn't need it.

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

Run Step 2.5a's frontend-detection sniff (`design-pre-steps.md`) against the record's own content — not a design doc — to decide `Surface:`. When frontend, also run Step 2.5c's design-intent question to decide `Design-intent:` — under `--chained` that step never asks and resolves to `Design-intent: none` (its own `--chained` branch). Insert a metadata block at the very top of the composed body, above `## Current State` and above `## Original request`:

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
- **`size:*` absent** — judge low/medium/high the same way (estimated size), then stamp it.
- **`ceremony:*` absent** — invoke `/claude-tweaks:assess-agent-autonomy` in `ceremony-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check #{n}")`) against the now-shaped body — the same input a fresh fetch would use, but already in memory here. Stamp the verdict as an explicit label, `ceremony:fast-lane` or `ceremony:standard` — never omit it, unlike `risk:*`/`size:*`'s omit-when-unscored convention (this axis has no unscored state; every record gets a verdict the first time it's shaped). Bootstrap both label values per `_shared/label-bootstrap.md` before the first write, same as any new label pair.
- **Framing** — invoke `/claude-tweaks:challenge` in `framing-check` mode (`Skill(skill: "claude-tweaks:challenge", args: "framing-check")`) against the now-shaped body **and** the `## Original request` block preserved above. On `FRAMING: solution-baked`, stamp the `solution:unjustified` label and fold the RATIONALE's named assumptions into the body's `## Gotchas` section as bullets, each carrying its validation status. On `FRAMING: open`, stamp nothing and add nothing — absence is the clean state. If the record already carries `solution:unjustified` (or its pre-rename spelling `framing:baked`) from an earlier shaping pass (a parked-then-re-promoted record whose framing has since been resolved), **remove** it — the same promotion-time cleanup shaping mode already applies to `parked`, below. Never stamp `solution:unjustified` on an `open` verdict, and there is no `solution:justified` counterpart to fall back to. Bootstrap `solution:unjustified` per `_shared/label-bootstrap.md` before the first write. Both the Gotchas bullets and the label add/remove ride the single compose-then-write-once pass below — never a second edit.
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
  --add-label "size:{tier}" \
  --add-label "ceremony:{tier}" \
  --type {t} \
  --remove-label parked
```

Omit `--add-label "risk:{tier}"` / `--add-label "size:{tier}"` / `--add-label "ceremony:{tier}"` for whichever family was already stamped; omit `--type {t}` (or the `--add-label "type:{t}"` swap) when Type was already present; omit `--remove-label parked` when the record never carried it. `--add-label "solution:unjustified"` follows a different rule from the three above: it is never about a family already being stamped, and it does not appear in the call by default — add it only when the Framing verdict (above) was `solution-baked`; on `open` add nothing. The label is presence-only and absence IS the clean state — most records are `open`, so absence is the common case, not the exception; there is no `solution:justified` counterpart to fall back to. The reverse case needs its own flag: when the verdict is `open` **and** the record already carries `solution:unjustified` from an earlier pass, add `--remove-label "solution:unjustified"` (and `--remove-label "framing:baked"` when the pre-rename spelling is what the record carries) to the same call — the identical cleanup-on-promotion idiom as `--remove-label parked`, omitted when the record never carried the label.

**`work-backend: local-files`:** one `writeRecord` call does the same job, setting `facets.stage: 'ready'` (which supersedes any prior `'parked'` value — the two are mutually exclusive states) and filling `facets.risk`/`facets.size`/`facets.ceremony`/`facets.type` when they were `null` (`facets.ceremony` always gets a value the first time a record is shaped — no null/unscored state for this axis, unlike `risk`/`size`) and `facets.solutionUnjustified` (unlike `facets.ceremony`, this one is written ONLY on a `solution-baked` verdict — left absent, not null-then-filled, whenever the verdict was `open`). When the verdict is `open` and the record's existing `facets` already carry `solutionUnjustified: true` from an earlier pass, clear it — set `facets.solutionUnjustified` to `false` in the same `writeRecord` call rather than leaving a stale `true` on a record that has since re-shaped clean:

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

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Shaped record {ref} into spec shape — stamped `risk:{tier}`/`size:{tier}`/`ceremony:{tier}` and Type where each was absent, added `ready`, removed `parked` if present | `{hash}` (local-files) / `—` (github-issues — edit already landed via API, no commit) |

For a comma-separated batch, render one row per attempted element, in list order, and prefix each Detail with its outcome: `shaped` (this run edited the record — the row above), `already shaped, no-op` (every section present and non-empty and every label family already stamped — nothing written, nothing to undo), or `skipped: {reason}` (the fetch failed; `{reason}` is the one-line `gh` / `readRecord` error). The Ref column follows the same per-driver rule on every row.

Shaping mode ends here — return to `SKILL.md` and render its `## Next Actions` block: the "Shaping mode — one record shaped in place" row of its Situation table for a single ref, or the "Shaping mode — multiple records shaped in place" row for a batch, rendered once after the last element. Under `--chained` (see `SKILL.md`'s Input and Component-Skill Contract), skip Next Actions entirely and return control to the calling skill — the shaped, `ready` record is the whole deliverable.

`/specify` adds `ready`, `risk:*`/`size:*` (when unstamped), and Type (when absent), removes `parked` on promotion, and never touches `auto:*` or `bot:*` — those stay `/backlog refine`'s (human-granted authorization) and `/dispatch`'s (bot-state mirror) territory.
