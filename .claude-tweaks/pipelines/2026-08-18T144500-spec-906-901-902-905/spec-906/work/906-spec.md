---
record: 906
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: wrapup-objective-audit-fixes:review-console-tier-staged-diff-display-by-reversibility
surface: terminal
---
# 906: Review Console: tier staged-diff display by reversibility

Surface: terminal

## Overview

`console-template.md` closes with an unconditional rule: "Below each table, show the full patch / diff for each pending item so the user can see exactly what will change." On a busy run this renders a wall of diffs, most of them for cheaply-revertible staged proposals. Maintainer decision (2026-08-18): tier the display by reversibility. Full diff inline only where the revert is expensive (`reversibility: low`/`med`); a `reversibility: high` item gets a one-line summary plus a paste-ready view command on its own line. Approve-what-you-see is preserved exactly where it carries risk weight, and the console stays legible.

**Complexity:** Low
**Estimated tasks:** 3-4

## Non-Goals

- No change to which items render as rows, to sort order (reversibility-low-first stays), or to any approval semantics.
- No change to the engine's `render --section console` output (it emits tables, not the below-table patch display — the display rule is template prose).
- The Approve-all wording fix and drills-individually class are the fast-path record's scope, not this one's — this record touches only the trailing display rule (and sweeps restatements).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| — | none — `console-template.md` is not touched by PR #880's file list (verified 2026-08-18); build this record first in the batch | — |

## Current State

- `plugin/skills/wrap-up/console-template.md` — final line of the template block: "Below each table, show the full patch / diff for each pending item so the user can see exactly what will change."
- Item reversibility is already recorded per item: `decisions.md` entries carry `Reversibility: {high|med|low}` (`_shared/auto-decision-log.md`), and the console's sort-order rule already consumes it — the tier rule reads the same field, no new metadata.
- Restatement candidates to sweep: `plugin/skills/wrap-up/review-console-interactive.md`, `plugin/skills/_shared/console-on-pr.md`, `plugin/skills/flow/multispec-review-console.md` — plus a repo-wide grep for the phrasing (whitespace-spanning variants included).
- Tests: prose-pin suites may pin the current wording — grep before editing.

## Deliverables

- [ ] `console-template.md`'s trailing rule replaced with the tiered rule: `reversibility: low`/`med` → full patch/diff inline below the table, unchanged; `reversibility: high` → one line (`{#} {target} — {summary}`, `{summary}` being the finding's own `summary` field on an engine run, or the item's `STAGED`/`AUTO` line description under the prose fallback) plus a paste-ready view command on its own line (`cat "{absolute stagePath}"`). Reversibility per item resolves in order: the item's own recorded field (staged-file preamble), then its `decisions.md` entry — correlated by `stagePath` basename, which is unique per staged file and present in both the console row's Disposition cell and the `STAGED` line — then, with neither recorded, full display (fail toward showing more). An item with no `stagePath` at all (nothing staged to `cat`) also renders its content in full regardless of tier — the view-command tier only exists where there is a file to view.
- [ ] One worked example of each tier in the template block (fictional data, matching the file's existing example style).
- [ ] Repo-wide sweep for restatements of the old rule (`grep -rn "full patch" plugin/ docs/` plus a `grep -z` whitespace-spanning control pass); each restatement found cites the template's tier rule rather than copying it.
- [ ] Prose-pin tests updated; one pin asserts the tier rule names the fail-open default (missing reversibility → full diff), and a second asserts the rule's text mandates the `decisions.md` consultation step before that default — so a future rewrite can't quietly reduce the ladder to "always full for engine rows," which would make tiering inert exactly where the console is engine-rendered.

## Acceptance Criteria

1. The template states the tier rule once, with both worked examples; both sweeps return zero for the old unconditional phrasing: `grep -rc "show the full patch / diff for each pending item" plugin/` and the whitespace-spanning control `grep -rzlE 'show[[:space:]]+the[[:space:]]+full[[:space:]]+patch[[:space:]]*/[[:space:]]*diff[[:space:]]+for[[:space:]]+each[[:space:]]+pending[[:space:]]+item' plugin/` (the control pass is part of this AC, not just a deliverable step — a restatement wrapped mid-phrase must fail acceptance, not slip through; the tier rule's own low/med bullet legitimately reuses "show the full patch / diff" without the old rule's "for each pending item" tail, so the control must anchor on the full old phrase including that tail — an untailed control would false-positive against the new, correct rule text).
2. The view command in the template is on its own line with no trailing inline comment, and uses the absolute `stagePath` (the console already renders absolute stage paths deliberately, so a reader can run it from any cwd).
3. The fail-open default (no recorded reversibility → full diff) is stated in the rule.
4. `npm test` green, full suite (byte-pinned prose tests across suites).

## Technical Approach

Prose-only. The tier rule lives in `console-template.md` as the single statement; anything elsewhere cites it. The reversibility value per item comes from the item's own `decisions.md` entry / staged-file preamble, both of which already carry it — where a row was assembled without one (engine console sections carry disposition but not reversibility in their four columns), the renderer falls back to the item's `decisions.md` line, and failing that renders full.

### Key Files

- `plugin/skills/wrap-up/console-template.md` — the rule + examples
- `plugin/skills/wrap-up/review-console-interactive.md` / `plugin/skills/_shared/console-on-pr.md` / `plugin/skills/flow/multispec-review-console.md` — sweep targets (cite, don't copy, if they restate)
- `tests/` — affected prose-pin suites

## Gotchas

- Sweep greps must pair single-line and whitespace-spanning passes — a restatement that wraps mid-phrase escapes a single-line grep (whitespace-spanning-sweep-greps).
- `console-on-pr.md` renders as PR checkboxes — if it restates the display rule, its citation must be surface-appropriate (a PR comment has size limits that make the tier rule *more* valuable there, but that adaptation belongs in that file's own wording, minimal).
- The fast-path record in this decomposition edits other sections of `review-console-interactive.md` later — keep this record's touch on that file to citation-only, so the later merge is clean.
- Full suite before merging — prose pins live in suites whose filenames don't match the edited files (full-suite-before-merging-markdown-PRs).


<!-- work-fingerprint: wrapup-objective-audit-fixes:review-console-tier-staged-diff-display-by-reversibility -->
