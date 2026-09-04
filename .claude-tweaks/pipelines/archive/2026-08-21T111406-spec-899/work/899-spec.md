---
record: 899
origin: human
risk: low
size: low
ceremony: standard
grants: [build]
fingerprint: wrapup-objective-audit-fixes:wrap-up-review-console-dead-empty-console-fast-path-and-unde
surface: terminal
---
# 899: wrap-up Review Console: dead empty-console fast path and undefined no-default-row outcome after Approve all

Surface: terminal

## Overview

The Wrap-Up Review Console's empty-console fast path is dead code: its gate requires "`decisions.md` has zero entries," but the curation engine writes a `SCANNED` audit line to `decisions.md` for every registry row — closed rows included — at `plan` time (`bin/lib/wrap-up/engine-record.js`). After Phase 2 runs, `decisions.md` always holds ≥8 entries, so the condition is unsatisfiable and a fully-clean standalone wrap-up still renders a console of purely informational rows and stops for Approve all — a stop that always resolves the same way.

Second defect, same surface (#798, plus a structurally identical sibling found in audit): the terminal options promise "no further prompts," but (a) a restructural, high-blast-radius stage-only finding (e.g. a 100+-line CLAUDE.md extraction) is too large to execute on a blanket Approve all — the observed behavior was an unplanned re-prompt reversing the console's own stated contract — and (b) an `[adr-convention]` row is deliberately excluded from Approve all and, unanswered, blocks every `[adr]` row from the run, with no stated outcome for those blocked rows after Approve all is chosen.

**Complexity:** Medium
**Estimated tasks:** 4-6

## Non-Goals

- No change to the Auto-resolution short-circuit (`consoleAutoResolve`) or the auto-merge short-circuit.
- No change to which rows stage vs. apply (dispositions stay as the registry defines them).
- No change to the diff-display tiering rule (separate sub-issue in this decomposition).
- No change to the multi-spec console beyond what its parity tests force (if its prose restates the fast-path condition or the Approve-all promise, update the restatement to cite, not to diverge).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #552 | Split or slim both Review Console files | in progress (PR #880, live draft) — this record MUST NOT build until it merges; re-merge origin/main and re-locate the moved sections first |

## Current State

- `plugin/skills/wrap-up/review-console.md` — "Empty-console fast path" section: "If `decisions.md` has zero entries AND `staged/` is empty AND …". PR #880 is splitting this file (new `auto-merge-short-circuit.md`); the section may have moved by build time — locate by heading, not by the pre-split layout.
- `plugin/skills/wrap-up/SKILL.md` — Phase 4's "Wrap-Up Review Console" restates the same condition ("decisions.md has zero entries, staged/ is empty, …").
- `plugin/skills/wrap-up/review-console-interactive.md` — option descriptions: "resolve every Q#/M# to Apply and every U# to declined — their own stated defaults, no further prompts"; Hard requirements define the Approve-all/Override split; the `[adr-convention]` exception says "Approve all leaves it unanswered and blocks every `[adr]` row from the same run" with no post-Approve-all outcome defined.
- `bin/lib/wrap-up/engine-record.js` — writes one `SCANNED` line per row to `decisions.md`, closed rows at `plan` time, open rows at `record` time. This behavior is correct and unchanged.
- `_shared/auto-decision-log.md` — entry-kind vocabulary (`AUTO`, `STAGED`, `KEPT-PROMPT`, `REFUSED`, `SCANNED`).
- Tests: `tests/` holds prose-pin suites over `plugin/skills/**/*.md` (grep for existing pins on "Empty-console fast path" / "no further prompts" before editing — byte-pinned tests make green branches merge red).

## Deliverables

- [ ] Fast-path condition, in both files that state it, counts only decision-bearing entries (`AUTO` / `STAGED` / `KEPT-PROMPT` / `REFUSED`); `SCANNED` audit lines are named as excluded, alongside the existing carve-out for unconditional bookkeeping cleanup rows.
- [ ] A defined "drills individually" class, stated once in the Hard requirements section: (a) rows with no default (`[adr-convention]`); (b) stage-only findings the emitting judge classified **restructural** — the existing binary additive/restructural classification (`curation-engine.md`'s applied-precondition vocabulary) IS the qualifying condition; there is no graded threshold and no new taxonomy. Today only the CLAUDE.md & rules row emits restructural stage-only findings into the batch sections; the class is defined by disposition + classification, not by row name, so a future stage-only row inherits it. After the terminal Approve all, exactly these rows drill, as part of the same console stop, in this order: first the `[adr-convention]` row (one three-way `AskUserQuestion` — its single answer is global, resolving every blocked `[adr]` row in the run, since it records one convention choice in policy.yml), then the restructural rows via `_shared/batched-item-drill.md`'s multiSelect chunking (≤4 per chunk, pre-checked to Apply — unchecking skips that item; the checkbox is the individual confirmation #798's Definition line asks for). The console lists the qualifying rows — row number plus qualifying reason — immediately above the terminal options whenever the class is non-empty.
- [ ] Terminal option descriptions updated: "no further prompts" becomes accurate ("no further prompts except rows marked drills-individually, listed above the options when present").
- [ ] Prose-pin/conformance tests updated; one new pin asserts the fast-path condition text names the `SCANNED` exclusion (so the dead-code shape cannot silently return), and the pin's fixture exercises the **combined** condition — a `decisions.md` holding only `SCANNED` lines plus the bookkeeping-cleanup carve-out — proving the two exclusions compose to a reachable skip, not just each alone.
- [ ] Build-time spot check (one-off, recorded in the ledger): sample the engine's current `SCANNED` writes against `_shared/auto-decision-log.md`'s entry kinds and confirm no decision-bearing outcome is emitted under the `SCANNED` prefix — the fix inherits the engine's tagging, so verify it rather than asserting it. Note: an **open** row writes its `SCANNED` line *and* separate `AUTO`/`STAGED` lines per finding — the exclusion counts entry kinds, so a run with real findings still renders the console; only an all-clean run (SCANNED-only log) skips.
- [ ] Read #798's body at build time and confirm its repro case (restructural CLAUDE.md finding under Approve all) is covered by the drills-individually class; the closing commit carries `Fixes #798`.

## Acceptance Criteria

1. A run whose `decisions.md` holds only `SCANNED` lines, with empty `staged/`, no skill/config updates, and no applicable cleanup (the same unconditional-bookkeeping carve-out the fast path already states — this clause restates it, it adds no third condition), skips the console per the fast path's own text — verified by reading the updated condition against a constructed `decisions.md` fixture in the pin test.
2. `grep -rn "zero entries" plugin/skills/wrap-up/` returns no line stating the old bare condition without the `SCANNED` exclusion.
3. The `[adr-convention]` post-Approve-all outcome is specified: the drill fires, and the `[adr]` rows' disposition follows the answer. No prose path leaves them in an undefined state.
4. `review-console-interactive.md`'s option descriptions match the Hard requirements' actual behavior (no unconditional "no further prompts" claim survives).
5. `npm test` green, including every wrap-up prose-pin suite.

## Technical Approach

Prose-only change plus test updates — no engine code changes. The engine's `SCANNED` writes are correct; the fix is that the console's gate must distinguish audit lines from decision-bearing lines. The drills-individually class reuses the existing per-item drill machinery (`_shared/batched-item-drill.md` shape) — it defines *when* a drill fires after Approve all, not a new drill mechanism. Keep the class definition in one place (the Hard requirements section) and cite it from the option descriptions and the `[adr-convention]` render block.

### Key Files

- `plugin/skills/wrap-up/review-console.md` — fast-path condition; post-#880, possibly a split successor file (locate by the "Empty-console fast path" heading)
- `plugin/skills/wrap-up/SKILL.md` — Phase 4's restatement of the fast-path condition
- `plugin/skills/wrap-up/review-console-interactive.md` — option descriptions, Hard requirements, `[adr-convention]` handling
- `tests/` — the wrap-up prose-pin suite(s) that pin these sections (grep at build time; suite names may change with #880)

## Gotchas

- **Build strictly after PR #880 merges.** Pre-build check, run before touching anything: `gh pr view 880 --json state,mergedAt` — proceed only on `MERGED`. Then re-merge origin/main; the sections named above move in that PR. A conflict here is prose — the worst kind to merge — so starting from the post-split layout is mandatory, not advisory.
- `console-template.md`'s preamble paraphrases the Approve-all promise ("with no further prompts") — this decomposition's diff-tiering sub-issue **#906** also edits that file (trailing rule only). Build this record after #906; touch only the preamble sentence here.
- The fast path's existing carve-out (unconditional bookkeeping cleanup rows don't count) stays — this change adds a second exclusion, it does not rewrite the test.
- The multi-spec console (`flow/multispec-review-console.md`) has parity pins with the per-spec console in some suites; run the full suite, not just wrap-up-named test files, before committing (full-suite-before-merging-markdown-PRs).
- `Fixes #798` belongs in this record's closing commit; do not also write `Fixes` for #552 (that record is merely a sequencing prerequisite).


<!-- work-fingerprint: wrapup-objective-audit-fixes:wrap-up-review-console-dead-empty-console-fast-path-and-unde -->
