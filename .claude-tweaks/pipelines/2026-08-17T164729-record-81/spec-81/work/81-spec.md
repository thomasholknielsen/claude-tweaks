---
record: 81
origin: human
risk: low
size: medium
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 81: Replace model-mediated issue-body reads with a node -e extractor in /specify and /help (360 KB measured)

Surface: backend

## Current State

Two sites hand the model a large raw payload and ask it to extract a small structured subset, with no extractor supplied — so the model must `Read` and reason over the whole thing itself.

**`/specify` decomposition mode, Step 1** (`skills/specify/decomposition-mode.md:30`, "File Reference Map"): says "Extract the `### Key Files` subsection … from every open record's body to build a file→record map," followed only by a static example output block — no extraction snippet at all.

Measured (at filing time): **360,695 bytes** across 73 issues (average body 4,219 B, max 17,275 B) — the size of the record bodies this step scans. (`skills/specify/SKILL.md` has since been split into per-mode files as part of an unrelated refactor; the fetch itself now rides the shared session-scoped snapshot in `skills/_shared/record-queue-fetch.md` rather than a standalone `--limit 500` call, but the model-mediated Key Files extraction this issue is about is unaffected by that change and is unchanged in substance.)

**`/help` Stage 1** (`skills/help/status-scan.md:143`, "Conflict detection (file overlap)"): identical model-mediated extraction — "Extract the `### Key Files` subsection … from every returned body … to build `/tmp/help-records-key-files.json`" — again with no snippet, sitting between two `node -e` blocks (lines 134-138 and 146-151) that *do* redirect properly. Measured (at filing time): 9,831 bytes.

**The extractor already exists and doesn't need to be written.** `bin/lib/issues/grouping.js` already exports `extractKeyFilesSection(body)` and `extractKeyFiles(issue)` (lines 85-158) — a regex-based Key Files parser with exactly the boundary/absence handling this issue's Gotchas originally asked for (tolerates a missing section, stops at the next heading of any level so a `## Gotchas` mention of a file in backticks doesn't get swept in). Both target sites already `require('.../grouping.js')` for `groupByFileOverlap` two steps later in the same procedure — the fix is to call the sibling export that's already in the same `require`d module, not to author a new extractor.

## Deliverables

- At `skills/specify/decomposition-mode.md`'s File Reference Map (line 30) and `skills/help/status-scan.md`'s Conflict detection sub-section (line 143), replace the prose "Extract the `### Key Files` subsection…" instruction with a literal `node -e` snippet that calls `extractKeyFilesSection`/`extractKeyFiles` from `bin/lib/issues/grouping.js` over each record's body already sitting in the in-memory/redirected JSON, emitting only `[{id, keyFiles}]` — never let the raw record bodies re-enter the model's context for this step.
- Match the output shape to what `groupByFileOverlap` (`bin/lib/issues/grouping.js:14-42`) actually reads off each item — `item.id` and `item.keyFiles` only. (Not `{number, title, keyFiles}` — `title` is unused by the consumer and `number`/`id` naming must match whichever id field the calling site already carries: `number` under `work-backend: github-issues`, the local record id otherwise.)

## Acceptance Criteria

- `skills/specify/decomposition-mode.md`'s File Reference Map and `skills/help/status-scan.md`'s Conflict detection sub-section each include a literal `node -e` extractor snippet calling `extractKeyFilesSection`/`extractKeyFiles`, not a prose instruction to "extract the subsection."
- Running the new snippet against this repo's current open+closed record set produces well under 10 KB of output (the reduction is inherent to emitting only `{id, keyFiles}` per record instead of full bodies — the byte target scales with today's live record count, not the 360 KB/9.8 KB figures measured at filing time).
- The extracted shape (`[{id, keyFiles}]`) is passed directly into `groupByFileOverlap` at both sites without reshaping.
- Verified by running the extractor for real against this repo's live record store (`gh issue list` under `work-backend: github-issues`, or `queryRecords('specs', {})` under `local-files`) and confirming the output byte count and shape.

## Technical Approach

### Key Files

- `skills/specify/decomposition-mode.md` — line 30 (File Reference Map's unimplemented extraction step); the record fetch it consumes is Step 1, described starting line 23
- `skills/help/status-scan.md` — line 143 (Conflict detection's unimplemented extraction step, between the two working `node -e` blocks at lines 134-138 and 146-151)
- `bin/lib/issues/grouping.js` — lines 77-158, the existing `extractKeyFilesSection`/`extractKeyFiles` exports to call, not reimplement; line 203 for the `module.exports` list
- `bin/lib/issues/ranking.js` — a third consumer of the same `### Key Files` extraction (status-scan.md line 158, "Ranking `ready` + `authorized` records for the render below") — check whether it already calls the existing helper or duplicates the same gap while implementing this fix

## Gotchas

- `bin/lib/issues/grouping.js`'s existing `extractKeyFilesSection` already handles the two hazards this issue originally flagged as open risks for a from-scratch extractor — absent `### Key Files` sections return `[]` rather than erroring, and the section boundary is the next heading of any level (`ANY_HEADING_RE`), not the first backticked span, so a `## Gotchas` bullet naming a file doesn't get swept into the map. Confirm this behavior with a quick read of `grouping.js:93-118` before writing the wiring snippet rather than re-deriving it.
- The line numbers cited above were current as of this shaping pass (2026-08-17); this skill's files have already moved once (a `SKILL.md` → per-mode-file split) since this issue was originally filed against `skills/specify/SKILL.md:215,216,222` and `skills/help/status-scan.md:87,102` — re-grep for the "Extract the `### Key Files` subsection" string before editing if this record sits in backlog for a while, rather than trusting the line numbers blindly.
- `bin/lib/issues/ranking.js` reruns the identical extraction for its own ranking input (status-scan.md line 158 references "the same extraction Conflict detection above performs") — if it turns out to hand-roll its own regex rather than calling `grouping.js`'s exports, that's a second, independent instance of the same underlying gap and should be fixed in the same pass rather than left for a follow-up record.

## Original request

Replace model-mediated issue-body reads with a node -e extractor in /specify and /help (360 KB measured)

Surface: skills

## Current State

Two sites hand the model a large raw payload and ask it to extract a small structured subset, with no extractor supplied — so the model must `Read` the entire file.

**`/specify` Step 1** (`skills/specify/SKILL.md:215,216,222`): the fetch is correctly redirected —
`gh issue list --state all --json number,title,labels,body,state --limit 500 > /tmp/specify-all-issues.json` —
but line 216 then says "**Every open record's body** (from the query above) — scan for overlap," and line 222 "Extract the `### Key Files` subsection … from every open record's body."

Measured: **360,695 bytes** across 73 issues (average body 4,219 B, max 17,275 B). At `--limit 500` on a mature repo this exceeds 2 MB.

**`/help` Stage 1** (`skills/help/status-scan.md:87,102`): identical model-mediated extraction of `### Key Files` from every in-flight record body. Measured **9,831 bytes**.

The redirect discipline is right; the missing piece is a server-side reducer. The repo already has the exemplar — `skills/_shared/record-queue-fetch.md:34-42` redirects to a file then runs a `node -e` reducer that emits only counts, turning 40,950 B of raw JSON into ~200 B.

## Deliverables

- Supply a `node -e` (or `jq`) extractor at both sites that emits only `[{number, title, keyFiles}]`, regexing the `### Key Files` block out of each body.
- Feed the model the extracted map; never let the raw JSON file enter context.

## Acceptance Criteria

- `/specify` Step 1 and `/help` Stage 1 each include a literal extractor snippet, not a prose instruction to "scan the bodies."
- Running the new snippet against this repo's 73 issues produces under ~10 KB.
- The extracted shape still satisfies what `bin/lib/issues/grouping.js` consumes downstream.
- Verified by running the extractor for real against a live `gh issue list` result.

## Technical Approach

### Key Files

- `skills/specify/SKILL.md` — lines 215 (fetch), 216 and 222 (the unbounded reads)
- `skills/help/status-scan.md` — lines 87 and 102 (same pattern)
- `skills/_shared/record-queue-fetch.md` — lines 34-42, the reduce-to-counts exemplar to copy
- `bin/lib/issues/grouping.js` — downstream consumer, defines the required shape

## Gotchas

- `### Key Files` blocks are not guaranteed present; the extractor must tolerate absence without dropping the record.
- Body text can contain fenced blocks that themselves contain `###` headings — anchor the regex to the section boundary, not the first `###`.
- Consider promoting the extractor to a real `bin/lib/` helper if both sites end up with the same 15-line snippet.

## Original request

Token/context optimization audit — 360 KB measured at a single site.
