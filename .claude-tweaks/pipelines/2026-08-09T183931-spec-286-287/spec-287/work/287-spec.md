---
record: 287
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: multispec-console-trace-alignment:multi-spec-console-engine-fed-sections-prose-parity
blocked-by: [286]
surface: infra
---
# 287: Multi-spec console: engine-fed sections + prose parity

Surface: infra

## Overview

`skills/flow/multispec-review-console.md` is the multi-spec analogue of `skills/wrap-up/review-console.md`, but it is a hand-maintained prose template rather than an engine-fed one, and it is missing content the single-spec console has: no Low-confidence findings, Contested findings, or Journey updates/Reference repairs sections at all, Documentation updates folded into Configuration updates instead of kept separate, and Cleanup actions ("Shared teardown") executed via prose with no visible row the user can review or override before it runs. This leaf rewrites the file to (a) call #286's new `render --section console --spec-state ...` engine mode for the 5 engine-rendered sections instead of hand-writing them, and (b) extend the file's own already-working prose-aggregation pattern (used today for Auto-applied/Pending review/Queue writes/Memory/Upstream) to also cover Low-confidence findings, Contested findings, and a newly-visible, approvable Cleanup actions section.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Does not change `skills/wrap-up/review-console.md` (single-spec) or any of its behavior.
- Does not change `bin/lib/wrap-up/engine-render.js` or `bin/wrap-up-engine.js` beyond what #286 already ships — this leaf is a consumer of #286's `--spec-state` flag, not a second implementer of it.
- Does not change `skills/flow/multi-spec.md`'s run-directory layout, `manifest.yml` schema, or the `MULTISPEC_REVIEW_DEFER`/`MULTISPEC_PARENT_DIR` environment-variable contract.
- Does not change the adr-convention row's own three-way prompt mechanics (`review-console.md`'s existing shape) — only how it's aggregated per-spec, which already works the same way Queue writes does.
- Does not change `/claude-tweaks:dispatch`'s own group-scoped Auto-merge gate — dispatch bundles already route through this same console per the file's existing scope note; no dispatch-side edit is needed.
- Does not invent a new detection heuristic for Low-confidence/Contested findings — copies `review-console.md`'s existing literal render conditions verbatim (see Deliverables).
- Does not add machinery to detect a "weakened" conditional-render clause programmatically — AC 7's diff-based check is heading-presence only, by design; the qualitative check is a manual read, stated explicitly in AC 7.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #286 | Engine: multi-spec console section merging | Must ship first — this leaf's rewritten invocation instructions cite #286's own Acceptance Criterion 7 for the exact `--spec-state` flag shape and output format. Before finalizing this leaf's wording, confirm the shipped CLI's `--help`/usage text still matches AC 7 below verbatim — if #286 shipped with a different flag name or shape than its own spec described, this leaf's invocation instructions must be corrected to match what actually shipped, not what was planned. |

## Current State

- `skills/flow/multispec-review-console.md` — "When to run the consolidated console" (steps 1-3) currently reads each spec's `staged/`/`decisions.md` by hand; "Present the consolidated console" hand-writes a template with Auto-applied, Pending review, Skill updates, Configuration updates (Docs folded in), Issue closures, Translated briefs, Queue writes, Memory updates, Upstream feedback, and a Not run/Failed footer.
- `skills/wrap-up/review-console.md` — the single-spec console this file should match in section coverage: Auto-applied, Pending review, Low-confidence findings (conditional), Contested findings (conditional), then the 5 engine-rendered sections (Skill/Documentation/Journey/Configuration updates + Reference repairs — inserted verbatim from `render --section console`), Cleanup actions (numbered, rendered before the approval question), Queue writes, Memory updates, Upstream feedback.
  - Low-confidence findings' exact render condition (copy verbatim, do not paraphrase): "Render this section only when `decisions.md` contains STAGED entries with the unconfirmed-finding rationale (single-source per-lens findings, or findings downgraded by cross-lens debate)."
  - Contested findings' exact render condition (copy verbatim): "Render this section only when `decisions.md` contains STAGED entries from cross-lens debate with mixed/partial verdicts."
- `skills/wrap-up/cleanup-procedures.md` — canonical cleanup action list; multi-spec's existing "Shared teardown" is already numbered 1→5 with an implicit dependency: step 3 (per-issue claim release) reads step 2's (branch-finish) outcome to determine the release reason and `$LINK` (merge commit sha or PR URL). Today this executes unconditionally with no visible row; this leaf makes the same 5 steps visible/overridable while preserving that existing dependency (see Deliverables).

## Deliverables

- [ ] Rewrite "When to run the consolidated console" steps 1-3: enumerate `spec-{N}/` subdirectories with an `engine-state.json` present (via `manifest.yml`, as today); invoke `node bin/wrap-up-engine.js render --section console --start-at n` with one repeated `--spec-state {id}={path}` flag per present spec, in spec execution order — the exact repeatable-flag shape #286's Acceptance Criterion 7 specifies; insert the command's stdout verbatim (no hand-expansion) exactly as `review-console.md` already instructs for its own engine path. `n` is the next number in this console's existing global row sequence, carried forward from whatever batch section numbering precedes the engine-fed block — cross-reference "Numbering rules" below as the source of `n`, mirroring how `review-console.md` derives its own single-state `--start-at`.
- [ ] Add two new conditional sections to the console template — Low-confidence findings and Contested findings — aggregating `decisions.md` STAGED entries across every spec that match `review-console.md`'s own render conditions verbatim (quoted in Current State above), `Spec`-tagged, rendered only when non-empty for at least one spec.
- [ ] Convert Cleanup actions from prose-only "Shared teardown" execution into a rendered, numbered section presented before the `AskUserQuestion` call: 2 run-level rows with no `Spec` column (dev-server teardown, branch-finish) + 3 rows per spec with a `Spec` column (claim release, grant removal, label cleanup). State the dependency explicitly in the rewritten section: branch-finish (run-level) is a hard prerequisite for every per-spec claim-release/grant-removal/label-cleanup row, since claim-release needs branch-finish's outcome ($LINK) to release correctly — this is the same dependency already implicit in today's "Shared teardown" steps 2→3, now made visible. Dev-server teardown has no such dependency and may be skipped independently of every other row.
- [ ] Split Documentation updates out of Configuration updates in the console template and its worked example, matching `review-console.md`'s section split.
- [ ] Update "Numbering rules" to state which sections come from the engine call (inserted verbatim) vs. which are prose-aggregated (Low-confidence findings, Contested findings, Cleanup actions, Auto-applied, Pending review, Issue closures, Translated briefs, Queue writes, Memory updates, Upstream feedback), so a reader of the file can tell the two mechanisms apart at a glance, and so the value `n` (above) has a stated source.
- [ ] Update "Hard requirements" to name the three newly-added sections explicitly in the "MUST present every entry" rule, and update "Anti-Patterns" if any existing row's wording assumes the old 2-section engine-rendered subset.
- [ ] Update "On override": when the user overrides (skips) the branch-finish row, auto-skip (render as "skipped — depends on branch-finish", not left pending or orphaned) every per-spec claim-release/grant-removal/label-cleanup row for this run, rather than executing them against a branch-finish outcome that never happened.

## Acceptance Criteria

1. `grep -E "^#### (Low-confidence findings|Contested findings|Documentation updates|Cleanup actions)" skills/flow/multispec-review-console.md` returns 4 matches — all four are distinct `####` headings.
2. `grep -c "^#### Configuration updates" skills/flow/multispec-review-console.md` still returns exactly 1 — Configuration updates still exists as its own section, separate from Documentation updates, not deleted outright.
3a. `grep -c "spec-state" skills/flow/multispec-review-console.md` returns at least 1.
3b. Reading the rewritten "When to run the consolidated console" steps directly (not a grep — a negative claim about instructional intent can't be fully grepped) confirms the hand-read-`staged/`/`decisions.md` instruction for the 5 engine-rendered sections is gone, replaced by the `--spec-state` invocation.
4. The Cleanup actions section's worked example shows exactly 2 rows with no `Spec` column value (or a stated run-level marker) and at least 3 rows per example spec with a populated `Spec` column — matching the 2-run-level + 3-per-spec-issue shape described in Deliverables — and states the branch-finish dependency in prose next to the example.
5. "Numbering rules" explicitly states, in prose, which sections are engine-rendered (inserted verbatim) vs. prose-aggregated — verifiable by reading the section for both "engine" and "prose-aggregated" (or an equivalent phrase) appearing together.
6. "Hard requirements" names Low-confidence findings, Contested findings, and Cleanup actions among the sections that MUST be presented — not just the pre-existing list.
7. No existing section (Auto-applied, Pending review, Queue writes, Memory updates, Upstream feedback, Issue closures, Translated briefs, Not run/Failed footer) is removed or has its aggregation condition weakened. Verify two ways: (a) diff the file and confirm every pre-existing `#### ` heading from the current version still appears; (b) read each pre-existing section's own non-empty/conditional-render sentence against the current file's wording and confirm it wasn't narrowed — heading presence alone (check (a)) cannot catch a weakened condition, which is why this is a manual read, not a second grep.
8. The Cleanup actions section states the branch-finish → per-spec claim-release/grant-removal/label-cleanup dependency explicitly, and the rewritten "On override" procedure auto-skips (rather than orphans or errors on) the three per-spec rows for every spec when branch-finish is overridden — verify by reading "On override" for this explicit auto-skip rule.

## Technical Approach

The rewritten console template has two distinct provenances, and the file must say so plainly per section: the block from `render --section console --spec-state ...` (Skill updates, Documentation updates, Journey updates, Configuration updates, Reference repairs) is inserted verbatim — never hand-expanded — exactly as `review-console.md` already instructs for its own single-state engine call. Every other section (Auto-applied, Pending review, Low-confidence findings, Contested findings, Cleanup actions, Queue writes, Memory updates, Upstream feedback, Issue closures, Translated briefs) stays prose-aggregated from each spec's `decisions.md`/`staged/`, following the exact aggregation pattern the file already uses successfully for Auto-applied/Pending review/Queue writes today — extended to the three sections currently missing it.

### Key Files

- `skills/flow/multispec-review-console.md` — the full rewrite: "When to run the consolidated console" (steps 1-3), "Present the consolidated console" template, "On approval"/"On override" procedures (Cleanup actions execution moves from unconditional to post-approval-of-visible-rows, with the branch-finish dependency honored under override), "Numbering rules", "Hard requirements", "Anti-Patterns".
- `skills/flow/multi-spec.md` — read-only reference for this leaf (run-directory layout, `manifest.yml` schema) — confirm no edit is actually needed here before closing this leaf; the design's own scope note says it shouldn't be, but verify against the final rewrite rather than assuming.

## Gotchas

- `review-console.md`'s own text is the canonical model for "insert render's output verbatim... do not hand-expand it" — copy that exact framing rather than paraphrasing it into something weaker.
- The Cleanup actions rewrite is a real behavior change, not just a report change: today's "Shared teardown" executes unconditionally after the single Approve-all/Override/Stop decision; after this leaf, its rows are visible and individually overridable *before* they execute, with branch-finish gating the three per-spec rows as stated in Deliverables/AC 8.
- Check `docs/skill-graph.md` and `docs/plugin-structure.md` for whether this rewrite changes any cross-skill edge or the sub-file table — likely no change (no new file is added, no skill relationship changes), but confirm rather than assume, per this repo's own `[IL-93]` (sweep the wider prose for claims about the old state, don't assume a bounded diff review already caught it).
- The adr-convention row's aggregation (per-spec, per-item, never batched) already works correctly in the current file for Queue writes — apply the identical pattern to it, don't invent a new one.
- Before writing the exact `--spec-state`/`--start-at` invocation text, re-read #286 once it's merged — that record's own Acceptance Criteria are the source of truth for the shipped flag shape, not this leaf's restatement of them.

<!-- work-fingerprint: multispec-console-trace-alignment:multi-spec-console-engine-fed-sections-prose-parity -->
