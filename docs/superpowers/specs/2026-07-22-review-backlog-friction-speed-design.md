# review-backlog — Friction & Speed — Design

## Problem

A live run of `/claude-tweaks:review-backlog` (bare mode, this repo's own backlog,
`.claude-tweaks/pipelines/2026-07-22T115126-review-backlog-standalone/`) surfaced two concrete
issues in the current Step 3/4 design:

1. **Round-trip friction.** Bare mode requires at minimum three sequential `AskUserQuestion`
   stops — priority batch confirm, Related batch confirm, then Next Actions — even when every
   answer is "apply the recommendation as shown." The observed run applied 4 priority mutations
   cleanly on the first confirm, then rendered a *second* full batch table and confirm for a
   single Related suggestion (`#16` → add `**Related:** #23`), and the session ended before that
   second confirm resolved — leaving the run sitting at `status: "interrupted"` needing a manual
   `close-run`. Two stops for what was, in substance, one decision ("apply everything you
   suggested") is avoidable ceremony.
2. **Sequential per-record fetch latency.** Step 3's bounded synthesis pass fetches the body of
   each budget-selected unscored record with its own `gh issue view {n} --json body` call — one
   HTTP round-trip per record, up to `--budget` (default 40) calls on a large unscored backlog.
   This is the dominant latency cost in a bare-mode run and scales linearly with `--budget`.

This design addresses both. It deliberately does **not** address two other candidate
improvements raised during scoping — see Non-goals.

## Goals

- Collapse the common "apply everything recommended" case from two `AskUserQuestion` stops
  (priority, then Related) to one, without losing the ability to override or skip either type.
- Eliminate the N sequential `gh issue view --json body` calls in Step 3's bare-mode synthesis.
- Preserve every existing contractual guarantee unchanged: `priority:*`/`**Related:**` stay
  human-confirmed-only (never silently auto-applied), the `--budget` bound on how many bodies are
  actually *read* by the LLM is untouched, and `local-files`/`unsynced` parity is preserved.

## Non-goals

- **Interrupted-run auto-resume.** The observed run's `status: "interrupted"` state (stuck
  mid-Related-confirm, requiring manual `close-run`) is a real, separate gap — worth its own
  design, not folded into this one. This design does make the interruption *less likely* to occur
  mid-flow (fewer stops = fewer places to get interrupted), but doesn't add resume/recovery
  behavior.
- **Synthesis/clustering quality.** No change to how Step 3 clusters themes, writes rationale, or
  detects `**Related:**` candidates — only to how its output is fetched and confirmed.
- **Terminal table rendering/width.** The wide, wrapped tables seen in the transcript are a
  markdown-table-in-terminal rendering constraint, not something this skill's prose controls.

## Solution

### A. Combined front-door confirm (Step 4 redesign)

Step 3's output is unchanged — it still produces a priority-suggestion set and a
`**Related:**`-suggestion set exactly as today. What changes is how they're confirmed:

- Render both batch tables together under one heading:
  `### Review Backlog — {N} priority + {M} related suggestions`. If a run produces only one type
  (the common case — Related suggestions are typically 0 or 1 per run), render only that table;
  never force an empty second table.
- Replace the two sequential `AskUserQuestion` calls with one:
  - `question`: `"Apply all suggested updates, or customize?"`, `header`: `"Confirm suggestions"`
  - Option 1 — `"Apply all suggested (Recommended)"` — applies every priority label swap and
    every `**Related:**` body edit shown, in one shot.
  - Option 2 — `"Customize"` — falls back to this repo's existing free-text override convention
    ("I'll specify #-by-# corrections in my next message"), extended to cover both suggestion
    types in the same reply (e.g. "apply priority on all except #16, skip the related
    suggestion"). No new mechanism — this is the same override pattern already documented for
    batch tables generally (CLAUDE.md's Multi-item decisions convention).
  - Option 3 — `"Skip all suggestions"` — applies neither type.
- Step 5 (Apply) is unchanged — it already applies both mutation kinds; it now fires from one
  confirm instead of two.
- This reverses SKILL.md's current explicit anti-pattern line ("never combined into the priority
  call, per this repo's one-decision-per-`AskUserQuestion` convention"). The reversal is
  deliberate, not an oversight: the underlying convention is about not cramming *unrelated*
  decisions into one call; applying priority and Related suggestions together is, in substance,
  one decision — "apply the backlog housekeeping this run suggested" — matching CLAUDE.md's
  documented "Front-door confirm + opt-in Customize" pattern (collapse N sequential inputs before
  one consequential action into one confirm, gated behind an explicit Customize escape hatch).
  SKILL.md's Step 4 prose and Anti-Patterns table must be updated together so neither
  contradicts the other.

Net effect: bare mode drops from 3 required stops (priority, related, next-actions) to 2
(confirm, next-actions) in the common case.

### B. Batched body fetch (Steps 1 & 3)

Fold `body` into the field list of the `gh issue list` call Step 1 already runs once per run —
but only when the mode is bare (mode is already known from `$ARGUMENTS` parsing before Step 1
runs, so this is a simple conditional on an existing command, not new control flow):

```bash
# bare mode only
gh issue list --state open --json number,title,body,labels,createdAt,updatedAt --limit 500
# named modes (critical/risk-value/cleanup) keep the current lean 5-field fetch — they never read bodies
```

Step 3 then reads `.body` directly off the already-fetched, already-merged record objects in
`/tmp/review-backlog-all.json` for the budget-selected subset — Step 3's own
`gh issue view {n} --json body` loop is removed entirely. This also brings the `github-issues`
driver to parity with `local-files`, which already carries full bodies from Step 1's
`queryRecords` (Step 3's text already notes this for that driver).

**The `--budget` discipline is unchanged.** Widening the fetch only avoids the *API* round-trip
for bodies that were going to be fetched anyway (all open records already get a `gh issue list`
row for facet-parsing); it does not change what the LLM actually *reads*. `selectBudgetSlice`
still bounds which records' bodies Step 3 hands to the synthesis pass — the existing
Anti-Patterns rule ("Reading every unscored record's body in one unbounded pass, ignoring
`--budget`") still holds exactly as written.

No change to `bin/lib/issues/review-backlog.js` — its pure helpers
(`splitScoredUnscored`/`selectBudgetSlice`/`filterCritical`/`rankRiskValue`/`filterCleanup`/
`mergeUnsyncedRecords`/`deriveCreatedAtFromGit`) operate on records that already carry whatever
fields were fetched; none of them special-case `body`. This is a `gh`-invocation and
SKILL.md-procedure change only.

## Decision log

- **Merge vs. keep-separate-but-tighten:** merge chosen (explicit user call). It reverses a
  committed design decision in SKILL.md, so that reversal — and why it doesn't violate the
  underlying one-decision-per-call principle — is documented inline in Section A above and must
  land in the SKILL.md edit itself, not just this doc.
- **Batched fetch via widened `gh issue list` vs. GraphQL-aliased batch query vs. parallel REST
  calls:** widening the existing Step 1 call was chosen over both alternatives. GraphQL aliasing
  (one `gh api graphql` call with N aliased `issue(number: X)` sub-queries) would also collapse to
  ~2 total calls but requires constructing an alias query and a separate repo-owner/name lookup —
  more moving parts for the same asymptotic result. Parallel REST calls (e.g. `xargs -P`) cut
  wall-clock but not call *count*, and risk secondary rate-limiting at `--budget`-scale. Widening
  the field list on a call that already runs unconditionally is the simplest change with no new
  failure modes, and it matches `local-files`' existing body-inclusion behavior.

## Affected files

- `skills/review-backlog/SKILL.md` — Step 1 (mode-conditional `body` field), Step 3 (remove
  per-record `gh issue view` loop, read `.body` from the merged record), Step 4 (single
  `AskUserQuestion` + Customize, combined table rendering), Anti-Patterns table (reconcile the
  reversed "never combined" rule).

## Testing/validation

No automated suite covers skill markdown procedure text (it's LLM-executed prose, not code) —
validation is a live dry run of `/claude-tweaks:review-backlog` bare mode against this repo's
actual backlog, confirming: (a) one confirm stop instead of two when both suggestion types exist,
(b) Step 3 makes zero `gh issue view` calls in bare mode — only the widened `gh issue list` call,
(c) named modes (`critical`/`risk-value`/`cleanup`) still issue the lean 5-field fetch. `npm test`
is unaffected (no JS logic touched) but should still be run as a regression safety net.

## Out of scope (candidates for a future design)

- Auto-detecting and offering to resume review-backlog's own interrupted pipeline runs — the
  concrete gap this session found (`2026-07-22T115126-review-backlog-standalone` sitting at
  `status: interrupted` mid-Related-confirm).
- Synthesis/clustering quality improvements to Step 3's LLM read.
- Terminal table rendering/width tuning.
