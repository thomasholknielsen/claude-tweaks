# Design: Shared record-staleness threshold + bucket predicates for `/help` and `/tidy`

## Problem

`/claude-tweaks:help` (`status-scan.md` Stage 1) and `/claude-tweaks:tidy` (`scan-procedures.md` Step 1) both classify the same faceted work-record queue (fetched via `_shared/record-queue-fetch.md`), but each reimplements its own classification logic independently:

1. **Staleness threshold duplication.** `_shared/record-queue-fetch.md`'s "Staleness clock" section already centralizes *which timestamp* each driver uses (`updatedAt` vs. last-commit date) — but not the threshold *values*. `/tidy`'s `scan-procedures.md` restates a 3-band prose table (`< 2 weeks` fresh / `2-4 weeks` review / `> 4 weeks` stale); `/help`'s `status-scan.md` independently hardcodes `FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000` in an inline Node script. Same value, two representations, no shared source.
2. **Bucket-predicate duplication.** Both skills independently write the same one-line boolean checks against the faceted record shape — `facets.stage === 'backlog'`, `facets.stage === 'parked'`, `facets.bot.blocked === true` — as either prose (`/tidy`) or inline JS (`/help`). This is narrower than the full six-way state model either skill uses: `/help`'s grants-based "authorized" split and "building" bucket, and `/tidy`'s "missing scoring" and "legacy taxonomy" checks, are each consumer-specific and not duplicated between the two skills.

This repo's own CLAUDE.md already documents the house position on this shape of problem: don't accept "duplicate this across N≥2 near-identical consumers" as final — extract the shared logic into real code, the same way `parseRecordFacets` and `groupByFileOverlap` already are, rather than re-syncing prose by convention.

## Scope

**In scope:**
- A new pure JS module exporting the genuinely-duplicated bucket predicates and a staleness classifier.
- A new project-configurable staleness threshold (`record-staleness-weeks`), replacing the hardcoded 4-week value in both consumers.
- Updates to `_shared/record-queue-fetch.md`, `help/status-scan.md`, and `tidy/scan-procedures.md` to consume the shared module and the new config key.
- Unit tests for the new module.

**Out of scope:**
- `/tidy` Shape 4 (missing scoring) and Shape 7 (legacy taxonomy) — untouched, consumer-specific.
- `/help`'s grants-based "authorized" split and "building" bucket — untouched, consumer-specific.
- Any change to `/claude-tweaks:init`'s bootstrap steps (the new config key is optional-with-default; no project needs to opt in explicitly).
- A CLI-arg or per-run (`config.yml` Manifesto) override tier for the staleness threshold — it's resolved once from project policy, with no per-invocation override.
- Any change to `/triage`, `/review-backlog`, or the separate `backlog-fetch-limit` pagination key introduced by the same-day `2026-07-26-backlog-skill-merge-design.md`. That design also extends `_shared/record-queue-fetch.md`, in a different subsection (fetch pagination, not staleness) — no functional overlap, but whichever build lands second should re-read the file's current state before editing rather than assume it's unchanged since either design was written.

## Module: `bin/lib/issues/record-buckets.js`

New file alongside `record.js`, `grouping.js`, `claims.js`, `local-store.js` — one concern per file, matching the directory's existing convention. Pure functions only: no `fs` access, no `require('gh')`.

```js
isBacklog(record)        // record.facets.stage === 'backlog'
isParked(record)         // record.facets.stage === 'parked'
isBotBlocked(record)     // record.facets.bot?.blocked === true
isBotInProgress(record)  // record.facets.bot?.inProgress === true

classifyStaleness(ageMs, thresholdMs)
  // returns 'fresh' | 'review' | 'stale'
  // fresh:  ageMs < thresholdMs / 2
  // review: thresholdMs / 2 <= ageMs <= thresholdMs
  // stale:  ageMs > thresholdMs
```

`record` is the already-faceted shape both skills already produce (`{ ...rawFields, facets }`, per `_shared/record-queue-fetch.md`'s fetch step). The bot-state predicates use optional chaining because `local-files` records carry no `facets.bot` at all ("the local driver carries no bot state") — they must return `false`, not throw.

`classifyStaleness` takes an already-computed age in ms and a threshold in ms; it does not read timestamps or compute "now" itself, since per-driver timestamp sourcing already lives in `record-queue-fetch.md`'s Staleness clock section and shouldn't move. This keeps the function trivial to unit test with no clock mocking.

## Config: `record-staleness-weeks`

- **Default:** `4` (weeks) — matches current hardcoded behavior; a project that never sets this sees no change.
- **Location:** CLAUDE.md's `## Work records` section, or `.claude-tweaks/policy.yml` — the same dual location already used for `tidy-aggressiveness`.
- **Precedence:** project policy → skill default. No CLI-arg or per-run override tier (see Scope above) — staleness reflects a durable property of a project's backlog turnover rate, not a per-invocation choice.
- **Resolution:** a new "Threshold resolution" subsection under `_shared/record-queue-fetch.md`'s existing "Staleness clock" section, written as dispatcher-inlined prose (the same pattern already used for `work-backend` resolution, not new executable code). It converts weeks to ms and hands the result to `classifyStaleness`. The review-band midpoint scales with the threshold (e.g. `record-staleness-weeks: 8` yields review at 4-8 weeks, stale beyond 8), preserving today's fixed 2:4 ratio.

## Integration changes

- **`_shared/record-queue-fetch.md`** — add the "Threshold resolution" subsection (above); note `record-buckets.js` in "See also".
- **`skills/help/status-scan.md` (Stage 1)** — the inline Node script's manual filters (`r.facets.bot.blocked`, `r.facets.stage === 'backlog'`, etc.) and the hardcoded `FOUR_WEEKS_MS` are replaced with calls into `require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record-buckets.js')`. The grants-based "authorized" split and "building" bucket are untouched.
- **`skills/tidy/scan-procedures.md` (Step 1)** — Shape 1 (backlog-stale), Shape 2 (parked), and Shape 5 (bot:blocked) switch to the same `require()` calls instead of restating the predicates and the 3-band table inline. Shapes 4 and 7 are untouched.

## Testing

New `bin/lib/issues/tests/record-buckets.test.js` — already picked up by root `npm test` (which globs `bin/lib/issues/tests/*.test.js`, per CLAUDE.md's Commands table). Covers:
- Each predicate: true case, false case, and (for the two bot-state predicates) the `local-files` case where `facets.bot` is `undefined` entirely — must return `false`, not throw.
- `classifyStaleness`: exactly at the threshold boundary, just under, just over, the derived review-band midpoint, and age `0` (fresh).

No fs/policy-reading tests are needed — threshold resolution is dispatcher-inlined prose consumed by an LLM agent at scan time, not unit-testable code, the same as `work-backend` resolution today.

## Rollout / risk notes

- Fully backward compatible: default threshold unchanged (4 weeks), so no project's dashboard or tidy report output changes unless it explicitly sets `record-staleness-weeks`.
- Both `status-scan.md` and `scan-procedures.md` changes are markdown-prose edits (swapping inline logic for a `require()` call) — no behavior change to the dispatch/parallel-agent contract either file already documents.
- Coordinate with `2026-07-26-backlog-skill-merge-design.md` if both land close together — both touch `_shared/record-queue-fetch.md`, in non-overlapping subsections.
