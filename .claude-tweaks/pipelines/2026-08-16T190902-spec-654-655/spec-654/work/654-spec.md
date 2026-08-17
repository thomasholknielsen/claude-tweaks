---
record: 654
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-16-backlog-refine-funnel-design:backlog-refine-refineworklist-mechanical-helper-ceiling-gate
surface: backend
---
# 654: backlog refine: refineWorklist mechanical helper + ceiling-gated trust fetch

Surface: backend
Parent: #574

## Current State

`/claude-tweaks:backlog refine` (skills/backlog/refine-mode.md Steps 1-3) runs roughly ten sequential fetch/compute stages before any judgment: the unfiltered priority/Related fetch, the unsynced merge, the server-filtered grant fetch plus the three-way worklist split (shipped by #576), two independent `selectBudgetSlice` invocations, per-record grant-check body fetches (Step 3's `assess-agent-autonomy` invocations — out of this record's scope, listed as friction context only), and — regardless of ceiling — the `_shared/trust-table.md` fetch (`--state all`, with 27 per-parent `sub_issues` calls measured live on 2026-08-16) plus a full `git log` dump. The split/slice logic lives in embedded `node -e` one-liners (the worklist split in Step 1's script; the two slices in Steps 2-3's scripts) with no test coverage. Step 2's slice today keys on `splitScoredUnscored(all).unscored` — records missing `risk`/`size` — while the sweep it feeds stamps `priority:*`, which is #460's re-run-shows-zero-progress defect. At `supervised` (the schema default), the trust output is purely advisory ("recorded and displayed, never acted on") yet costs the most expensive fetches in the skill.

## Deliverables

- New pure function `refineWorklist({ allRows, readyRows, priorityBudget, grantBudget })` in `bin/lib/issues/backlog.js` (sibling of `funnelBuckets`; this exact signature is canonical — use it everywhere). Inputs: `allRows` = the merged faceted set the priority/Related fetch + unsynced merge already produce; `readyRows` = the grant fetch's rows **after** the existing `BACKLOG_ORIGIN` filter (origin filtering stays outside the helper, exactly where Step 1 applies it today). Returns:
  - `fresh` / `blocked` / `inProgress` — the three-way grant worklist split over `readyRows`, semantically equivalent to refine-mode.md Step 1's current script (the `node -e` block whose lines define `worklist`/`fresh`/`blocked`/`inProgress`), `bot:blocked` precedence included. Equivalence is pinned by the AC test cases below, not asserted as byte-identity.
  - `missingPriority` — records in `allRows` with `facets.priority === null`.
  - `missingRiskSize` — records in `allRows` failing `facets.risk && facets.size` (the predicate `splitScoredUnscored` uses today). The two populations are independent — a record can be in one, both, or neither.
  - `prioritySlice` — `selectBudgetSlice(missingPriority, priorityBudget)`. **This re-keys Step 2's budget onto the population its sweep actually works through — the #460 fix (Related: #460).** Today's keying on missing-risk/size is the defect, not the spec.
  - `grantSlice` — `selectBudgetSlice(fresh, grantBudget)`, unchanged semantics.
  - `counts` — exactly `{ fresh, blocked, inProgress, missingPriority, missingRiskSize }` (array lengths). Narration mapping: #576's in-flight exclusion line reads `counts.inProgress`; Step 2's remaining line reads `prioritySlice.remaining`; Step 3's reads `grantSlice.remaining`.
- Tests in `tests/bin-lib/issues/backlog.test.js` (or a sibling file per directory convention): split mutual exclusivity and `bot:blocked` precedence, granted-record exclusion, both populations' independence, slice keying (a record with priority set but no risk/size never enters `prioritySlice`), and the `counts` keys.
- A conformance test pinning grant-mode.md line 71's inline filter to the canonical not-already-claimed expression (`.filter((i) => !i.facets.bot.inProgress)`), so its cited semantic match to `refineWorklist`'s exclusion cannot silently drift — the citation alone is not enforcement.
- Rewrite refine-mode.md Steps 1-3 onto the helper: the two `gh issue list` fetches stay exactly as they are (the two-fetch starvation-avoidance rationale is preserved verbatim); every embedded split/slice script collapses into one `node -e` compute calling `refineWorklist`; downstream steps read its output file.
- Ceiling-first ordering + cheap trust path: the `resolve-policy` read that currently resolves `autonomy` + `trust-revert-window-days` inside the Trust section moves to the top of Step 1, immediately after Preflight and before any fetch (still one call; resolving `trust-revert-window-days` on the skip path is accepted overhead — stated in the skill text). The `_shared/trust-table.md` fetch, its per-parent branches, and the git-log read run only when the ceiling is `trusted`+ or the new `--trust` flag was passed. At `supervised` without `--trust`, the ceiling footer reads: "Autonomy ceiling: `supervised` — trust not fetched this run (recorded, never acted on; pass `--trust` to render it)."
- Document `--trust` in `skills/backlog/SKILL.md`'s Input section as a boolean presence flag (refine mode only), alongside `--origin`/`--budget`.

## Acceptance Criteria

- `node --test` covers `refineWorklist` including: a record carrying both `bot:blocked` and `bot:in-progress` lands in `blocked` only; a granted record reaches no lane; a record with `priority:*` set but no `risk`/`size` appears in `missingRiskSize` and not in `missingPriority` (and vice versa); `prioritySlice` draws from `missingPriority` only; `counts` exposes exactly the five keys above.
- Re-running the Step 2 sweep after applying a full priority batch selects a genuinely new slice (or reports the priority axis complete) — #460's repro no longer reproduces.
- refine-mode.md Steps 1-3 contain at most one `node -e` compute block after the two fetches, and it calls `refineWorklist`; no split/slice logic remains inline.
- At `supervised` with no `--trust`, the procedure text mandates zero trust-table fetches, zero `sub_issues` calls, and no git-log read; the build verifies by grep that no step outside the trust section invokes `sub_issues` or reads git log. At `trusted`+ or with `--trust`, the trust path runs exactly as today.
- The supervised footer wording above appears verbatim; `--trust` is documented in `skills/backlog/SKILL.md`.
- The grant-mode.md conformance pin exists and fails when line 71's filter expression changes.
- The report's narration lines read their numbers from the helper's output per the mapping above.
- `npm test` passes.

## Technical Approach

Model `refineWorklist` on `funnelBuckets`' shape (pure function over faceted rows, exported from `bin/lib/issues/backlog.js`). Compute the populations directly from `facets` — do not reuse `splitScoredUnscored` internals for `missingPriority` (its predicate is the risk/size one); `splitScoredUnscored` itself stays exported and untouched for its other consumers. The skill-text change is a rewrite of the Step 1-3 script blocks plus the trust-signal section's gating sentence and the resolve-policy read's position; Steps 3.5-5 are untouched. The sibling record #655 renders lanes over this helper's output and owns all vocabulary changes to the report text.

### Key Files

- bin/lib/issues/backlog.js
- tests/bin-lib/issues/backlog.test.js
- skills/backlog/refine-mode.md
- skills/backlog/SKILL.md
- skills/backlog/grant-mode.md

## Gotchas

- File overlap with open #616 (funnelBuckets `isParentIssue` bug) — both touch `bin/lib/issues/backlog.js`. #616 is a small edit inside `funnelBuckets`; this record only adds a new sibling export, so a textual conflict is unlikely, but merge-order awareness applies if both build concurrently.
- The two-fetch design (unfiltered + `--label ready` server-filtered) is deliberate starvation avoidance — do not consolidate the fetches; only the post-fetch compute consolidates.
- The trust-table computation itself (`bin/lib/issues/trust.js`) is out of scope — only *when it is fetched* changes. Step 3's per-record grant-check body fetches are likewise unchanged.
- The report/lane rendering redesign is #655's scope — this record keeps Step 4's current table rendering working against the helper's output (#655 is blocked by this record, native link wired).
- The `prioritySlice` re-keying is a deliberate behavior change (the #460 fix), not an equivalence bug — the AC's #460-repro criterion is the discriminating test.

## Decision Rationale

The helper-not-prose choice follows the shipped overview-funnel precedent (`funnelBuckets`): the worklist logic gained real branching with #576 and a live bug class (vocabulary drift, silent shadow behavior, #460's mis-keyed slice) that tests pin and embedded prose cannot. The supervised trust-skip is chosen because the trust fetch is the single most expensive stage and its output is unactionable at the default ceiling; `--trust` keeps one-flag access. Alternatives (caching the trust fetch, batching the 27 parent calls into one GraphQL round-trip) were rejected as still paying for data the default path cannot act on.

<!-- work-fingerprint: 2026-08-16-backlog-refine-funnel-design:backlog-refine-refineworklist-mechanical-helper-ceiling-gate -->
