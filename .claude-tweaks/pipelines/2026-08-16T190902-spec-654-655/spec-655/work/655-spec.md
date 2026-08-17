---
record: 655
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-16-backlog-refine-funnel-design:backlog-refine-decision-lane-report-missing-priority-vocabul
blocked-by: [654]
surface: backend
---
# 655: backlog refine: decision-lane report + missing-priority vocabulary (absorbs #460)

Surface: backend
Parent: #574

## Current State

`/claude-tweaks:backlog refine`'s Step 4 renders one 10-column unified table (`#`, Record, Type, Origin, Current, Recommended, Trust, Suggested Tier, Framing, Rationale). Live 2026-08-16 evidence: the Trust / Suggested Tier / Framing columns are hard to act on in-table, and the "unscored" vocabulary conflates two populations — the run showed "40 of 120 unscored" against 27 records actually missing priority. Open record #460 documents the cause (Step 2's slice keyed on risk/size while the sweep stamps priority); the mechanical re-keying fix is #654's `prioritySlice` deliverable — this record owns the report-side rendering and vocabulary. The shipped overview funnel (#512) solved the same report-shape problem with per-stage lanes, paste blocks, a needs-you lane, consequence-line trust, and a two-channel `Next:` contract. No journey documents refine (deferred from #576's run explicitly to this redesign).

## Deliverables

- Rewrite refine-mode.md Steps 4-5's rendering into per-lane sections. **One lane per record, assigned in this precedence order (a record never renders as a full row twice):**
  1. **Re-authorize** ← `refineWorklist().blocked` (disjoint from `fresh` by construction).
  2. **Grant** ← `refineWorklist().grantSlice` — #576's in-flight exclusion line renders with this lane, verbatim: "`{n}` in flight — excluded from grant checks; a grant changes nothing mid-run." (count from `counts.inProgress`).
  3. **Flag-back** — populated during the run: a Step 3.5 shape failure or a needs-scoring downgrade *moves* the record here out of the Grant lane.
  4. **Priority** ← `refineWorklist().prioritySlice` (+ detected Related pairs), minus records already laned above.
  5. **Dependency repair** ← the existing dependency-mismatch detection's flags (`findUnresolvedDependencyProse`'s `{ flags }` output, unchanged). A flagged record already laned above renders the repair as an annotation line under its existing row instead of a second full row; only otherwise does it get its own lane row.
  6. **Needs you** (last) — a positively-defined residual, in this order: records carrying `needs:definition` in the fetch, then rows whose recommendation requires human judgment with no batchable command (`framing:baked` confirmations, judgment-required dependency repairs). **Exempt from the paste-block requirement** — its rows carry interactive launchers instead (per the repo's report-line convention), mirroring overview's needs-you lane.
- Per lane (except Needs you): a compact table (`#`, record, current → recommended, one evidence cell) followed by a paste-ready command batch for the accepted defaults — every actionable line a runnable command on its own line; lanes with zero members render nothing.
- Trust and Framing leave the table. Grant-lane rows render trust as an indented consequence line beneath the row, literal template: `  ↳ trust: {provenance} / {band} — {verdict}{, {coverage}% coverage}` — rendered **only** when the trust table was fetched this run (#654's gate: ceiling `trusted`+ or `--trust`); when not fetched, the line is omitted entirely and the row's evidence cell carries the grant-check RATIONALE excerpt as it always does (the evidence cell never depends on trust). `framing:baked` renders as a per-row annotation line — `  # framing:baked — {assumption summary}` — the same idiom overview's batch emitter uses for `needs:definition`. The non-binding Suggested Tier guess drops from tables entirely and survives only inside Priority-lane rationale text.
- Two-channel contract: the Step 4 human-confirm gate stays the single interactive stop, consuming the lanes. As part of the rewrite, anchor the gate's paragraph with an HTML comment (`<!-- refine-confirm-gate -->`) so its byte-stability is mechanically diffable. The closing `Next:` line names the top Needs-you item when that lane is non-empty, else the highest-value batch — recomputed fresh each run (overview's precedence rule, cited not restated).
- Vocabulary split across refine-facing text in `skills/backlog/`: the bare word "unscored" is retired in favor of **missing priority** and **missing risk/size**; every budget/remaining line names its key (e.g. "`{n}` of `{m}` missing priority — budget covers `{k}` this run", numbers from #654's `counts`/slice fields). Step 2's prose describes the slice as keyed on missing priority (matching #654's `prioritySlice`). This record's merge closes out #460: its body recommends "close #460 as absorbed" (verified: #460's repro and expected behavior are fully covered by #654's re-keying plus this record's vocabulary and remaining-count lines).
- New journey `docs/journeys/refine-the-backlog-through-decision-lanes.md`: run refine at `supervised` (cheap path), read the lanes, apply a batch, resolve a Needs-you row — `files:` frontmatter listing the refine files.
- Cross-reference sync: `docs/getting-started.md`'s refine paragraph ("single unified batch confirm"), `docs/skill-graph.md`'s `/backlog` row ("the unified table's Recommended column") and `_shared/trust-table.md` row ("refine's advisory Trust column (Step 3)") reworded to the lane/consequence-line shape; `/claude-tweaks:help`'s workflow diagram checked for refine-report mentions. No new skill-graph edges — a report redesign introduces no new skill-to-skill invocation.

## Acceptance Criteria

- Step 4's rendering spec contains the six named lanes with the precedence list above, per-lane table + paste-block templates, the zero-member omission rule, and the Needs-you paste-block exemption; no 10-column unified table remains.
- Trust renders only via the literal consequence-line template and only when fetched; the not-fetched case omits the line with the evidence cell unchanged; Framing only via the annotation-line template; "Suggested Tier" appears in no table template.
- The lane-precedence rule makes double-rendering impossible by construction, and the dependency-repair annotation-vs-row rule is stated.
- `grep -rni "unscored" skills/backlog/` — every surviving hit is enumerated in the build plan with its disposition; refine-facing hits are zero. (overview-mode.md's `risk-value` lens "not yet scored" group is overview's own vocabulary for the risk/size population and stays.)
- The gate paragraph carries the `<!-- refine-confirm-gate -->` anchor and its anchored block's diff against pre-rewrite text shows only lane-input renaming; its position, wording class, and never-silenced status are unchanged.
- This record's body carries the verified `#460 absorbed — recommend close` statement.
- The journey file exists with valid frontmatter and covers the four steps above; `npm test` passes (journey/coverage and conformance suites included).

## Technical Approach

Pure skill-prose + docs work over #654's helper output — build strictly after #654 merges (native blocked-by link wired; verify `refineWorklist`'s actual exported field names against the merged code before writing lane templates, rather than trusting this record's naming). Mirror overview-mode.md's per-stage paste-block templates and its `Next:` precedence text by citation. The vocabulary sweep greps "unscored" plus variants ("not yet scored", "unscored records") and enumerates each hit's disposition in the build plan before declaring clean.

### Key Files

- skills/backlog/refine-mode.md
- skills/backlog/SKILL.md
- docs/getting-started.md
- docs/skill-graph.md
- docs/journeys/refine-the-backlog-through-decision-lanes.md
- skills/help/SKILL.md

## Gotchas

- Blocked by #654 (native link) — lane populations read its `refineWorklist` output; building this first would re-derive the very inline scripts #654 deletes. Field names cited here (`grantSlice`, `blocked`, `prioritySlice`, `counts`) must be re-verified against #654's merged code at build time.
- overview-mode.md's `risk-value` lens legitimately renders "not yet scored" about risk/size — that stays; only refine-facing text retires "unscored".
- `docs/skill-graph.md` is the single home for skill relationships — reword existing rows, add no new edges.
- The gate paragraph (#461's hardening concern) is deliberately untouched beyond the anchor comment — #461 stays its own record.

## Decision Rationale

Lanes-by-decision-kind was chosen over a slimmer single table because the live run's evidence was that wide-table columns get skimmed past; grouping by the verb the human performs (grant / re-authorize / flag back / prioritize / repair / decide) mirrors the shipped overview funnel's per-stage paste blocks, which this repo has already validated in use. Absorbing #460's close-out here (rather than a separate fix) was chosen because the vocabulary split and the remaining-count lines are the same edits to the same text the lanes rewrite touches; the mechanical keying half lands with #654.

<!-- work-fingerprint: 2026-08-16-backlog-refine-funnel-design:backlog-refine-decision-lane-report-missing-priority-vocabul -->
