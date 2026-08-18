---
record: 563
origin: human
risk: low
size: medium
ceremony: standard
grants: []
surface: backend
---
# 563: backlog overview: resolve native blocked-by links for the funnel header's granted/dispatchable split

**Related:** #512

Surface: backend

## Current State

`funnelBuckets` (`bin/lib/issues/backlog.js`) partitions the open queue into the funnel header's stages. Its `granted`/`dispatchable` split for `stage === 'ready'` + granted records depends on `inSetBlockers = blockersOf(r).filter((id) => openIds.has(id))`, and `blockersOf` (`bin/lib/issues/ranking.js`) resolves blockers by precedence: unsynced-namespace short-circuit → top-level `r.blockedBy` → `facets.blockedBy` → body-text `parseDependencies` fallback. Nothing populates `r.blockedBy` for the full open set fetched at Step 1 — that attachment only happens later, in `overview-mode.md` Step 3, and only for the already-filtered buildable subset (`dispatchable` ∪ `granted`) used by `rankNextToBuild`.

On a `work-links: native` repo, a record blocked purely via a native `blockedBy` link (no body-text mention, no `facets.blockedBy`) therefore falls through `blockersOf`'s precedence chain to an empty result at funnel-computation time, and `funnelBuckets` classifies it `dispatchable` instead of `granted`. `overview-mode.md`'s Step 3 documents this explicitly as a known, deliberately out-of-scope limitation of #514 ("Header-level native resolution is deliberately out of this record's scope (captured as a follow-up record)"). #515 and #516, which build on the funnel header, are both closed/merged, so the header's consumers have stabilized and this can now be addressed without churn.

## Deliverables

- Extend `overview-mode.md` Step 2 (or a shared pre-step run immediately before it) to fetch native `blockedBy` for the **ready+granted subset only** — i.e. every record where `f.stage === 'ready' && (f.grants.build || f.grants.merge)`, before `funnelBuckets` runs, or by making `funnelBuckets` itself accept a pre-resolved `blockedBy` attachment map for that subset — the same "which records need the fetch" precondition Step 3 already computes, just moved earlier and reused rather than duplicated.
- Reuse `buildNativeDependencyQuery` (`bin/lib/issues/record.js`) for the batched, aliased GraphQL fetch, with the same 50-alias-per-chunk batching Step 3 already uses, and the same `capabilities-probe.js` `probeSchema` field-availability check before attempting the fetch.
- On probe failure, whole-fetch failure, or a `work-links: body-text` / `local-files` repo, no-op — `blockersOf`'s existing precedence chain (facets/body-text fallback) stands unchanged, exactly as it does today. This is a graceful-degradation extension, not a new hard dependency.
- Attach the resolved blockers the same way Step 3 already does: `blockedBy: [ids]` from each alias's `blockedBy.nodes` open-state entries, with a missing/errored node left unattached (never coerced to `[]`) so `blockersOf`'s own fallback chain still applies per-record rather than silently treating a failed fetch as "no blockers."
- Update `overview-mode.md` Step 3's limitation clause once the header itself resolves native blockers — the "Header-level native resolution is deliberately out of this record's scope" sentence becomes stale and should be replaced with a note that the header and Step 3 now share the same resolved-blocker data for the subset both touch (or, if Step 2's fetch subsumes Step 3's, that Step 3 no longer needs to re-fetch it).

## Acceptance Criteria

- A `work-links: native` repo with a record that is `ready` + granted + blocked only via a native `blockedBy` link (no body-text mention, no `facets.blockedBy`) renders in the funnel header's `granted` count, not `dispatchable`.
- The fetch is bounded to the ready+granted subset — never issued against the full open queue.
- On probe/fetch failure, the header still renders (degrades to the existing body-text/facets resolution), with a failure-only narration line per `overview-mode.md`'s existing failure-only narration convention — no hard stop.
- `work-links: body-text` and `work-backend: local-files` repos are unaffected — no new fetch is attempted, and existing behavior is unchanged.
- Test coverage exercises: a native-only-blocked ready+granted record correctly landing in `granted`; a probe failure degrading to the existing fallback without breaking header rendering; the fetch never firing for non-ready or non-granted records.

## Technical Approach

- `bin/lib/issues/backlog.js`: `funnelBuckets` currently takes only `records`. Either (a) have `overview-mode.md`'s Step 2 pre-attach `r.blockedBy` for the ready+granted subset before calling `funnelBuckets` (no signature change — `blockersOf`'s existing top-level-`r.blockedBy` precedence tier already consumes this for free), or (b) add an optional second parameter carrying the pre-resolved map. (a) is simpler and reuses an existing precedence tier `blockersOf` already implements — prefer it unless the pre-attach step can't cleanly precede the `funnelBuckets` call in Step 2's script.
- `bin/lib/issues/record.js`: reuse `buildNativeDependencyQuery(numbers)` unchanged — it already accepts an array of candidate numbers and returns the batched aliased GraphQL query string; chunk the ready+granted subset at 50 per request as Step 3 does.
- `bin/lib/issues/capabilities-probe.js`: reuse `probeSchema` to check `blockedBy` field availability before attempting the fetch, same as Step 3.
- `skills/backlog/overview-mode.md`: Step 2's `node -e` block needs the native fetch inserted before the `funnelBuckets` call for `work-links: native` repos, gated the same way Step 3 gates it today; Step 3's limitation clause needs updating once Step 2 resolves natively (see Deliverables above) — reconcile duplicate fetching if Step 3's own per-candidate fetch becomes redundant for records already resolved in Step 2.

## Gotchas

- The fetch subset for Step 2 (ready+granted) is *not* the same as Step 3's buildable subset (`dispatchable` ∪ `granted`) — Step 2 runs *before* `funnelBuckets` has produced those buckets, so "granted" here must be computed the same way `funnelBuckets` itself computes it (`f.stage === 'ready' && (f.grants.build || f.grants.merge)`), independent of the `inSetBlockers` split that native resolution is meant to correct. Get this circularity right: the candidate set for the *fetch* cannot depend on the *bucket* the fetch is meant to help compute.
- If Step 2's fetch ends up covering the same ground as Step 3's existing fetch for the `dispatchable` ∪ `granted` intersection, decide explicitly whether to have Step 3 reuse Step 2's already-fetched data (avoiding a duplicate GraphQL round-trip) rather than leaving both as independent, silently-duplicating fetches — this is an implementation decision, not a follow-up.
- A missing/errored node inside an otherwise-successful batch must not be coerced to `[]` — same rule Step 3 already documents, since an empty array is indistinguishable from "confirmed no blockers" and would incorrectly move a record into `dispatchable`.

## Original request

backlog overview: resolve native blocked-by links for the funnel header's granted/dispatchable split

## Overview

`funnelBuckets` (Step 2 of `/claude-tweaks:backlog overview`, whole open set) resolves blockers from body-text/`facets` data only; native blocked-by attachment happens in Step 3 over the small buildable set. On a `work-links: native` repo a natively-blocked record therefore renders in the funnel header as `dispatchable` ("go now") — the same root-cause class #514 fixed for the ranker, surviving in the more prominent surface. Deliberately out of #514's scope (attaching native data for every open record is a much larger fetch); the limitation is stated in the skill text (`skills/backlog/overview-mode.md`, Step 3's funnel-header limitation clause).

## Suggested shape

Extend overview Step 2 (or a shared pre-step) with a bounded native blocked-by fetch for the ready+granted subset only — the only records whose granted/dispatchable split the header renders — reusing `buildNativeDependencyQuery` chunking.

Trigger: after #515/#516 land (the header's consumers have now stabilized).

**Origin:** #514's final whole-branch review (Important 5), staged at the run's consolidated Review Console and approved (run 2026-08-16T010024-spec-513-514-515-516).

**Files:** skills/backlog/overview-mode.md, bin/lib/issues/backlog.js
