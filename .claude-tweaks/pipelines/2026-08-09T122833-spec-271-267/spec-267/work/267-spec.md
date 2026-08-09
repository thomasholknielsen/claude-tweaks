---
record: 267
origin: human
ceremony: standard
grants: []
surface: backend
---
# 267: Trust ladder: merged-unreverted operational outcomes become known-good evidence in trust.js

Surface: backend
Parent: #265

Blocked by #219

## Overview

Give the trust ladder its missing rungs: today `bin/lib/issues/trust.js` samples closed records per class, but a record's *outcome* becomes known only through `/demo`-descent evidence — an undemoed record counts as "unknown outcome", and the deliberate known-outcome floor (see trust.js's own header comments) keeps such classes at `insufficient-evidence` indefinitely. This leaf adds a second way for a closed record's outcome to become known: **merged and unreverted after a policy-set window**. Evaluated lazily at read time — no new scheduled job — and retroactively, so consumers who have been running the supervised loop get credit from existing history the day this ships.

This is the ladder the shipped `unattended` autonomy ceiling gates on (see `skills/_shared/autonomy-ceiling.md`); without it the ceiling is unreachable in practice. Decision rationale for the program lives on parent #265.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Negative evidence and automatic class revocation (failure classifications, revert-driven downgrades) — the companion leaf "Trust ladder: failure classifications and reverts write negative evidence" owns that; this leaf only *detects* reverts to decide known-good vs not-countable.
- Any change to which permissions each trust verdict unlocks (`permittedGrants` in `bin/lib/issues/autonomy.js` is untouched).
- The machine-grant unit that consumes the widened ladder (separate leaf, blocked on this one).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| — | None within this decomposition (root leaf) | — |
| #219 | Model-profile policy keys (granted, undispatched) | shares `bin/lib/policy-schema.js` + `skills/_shared/policy-schema.md` — file-overlap ordering only, no logical dependency |

## Current State

- Evidence engine: `bin/lib/issues/trust.js` — samples closed records per provenance class; outcome grading rides `/demo`-descent Origin lines (`demo changes-requested`, etc., see `NON_CORRECTIVE_ORIGINS`); MIN_SAMPLES floors the cell and a known-outcome floor grades inside it. **Read this file's actual evidence-store shape first** — this spec describes intent, not the store schema; extend what is there (expand-contract if the shape must change), never a parallel store.
- Class derivation: `bin/lib/issues/provenance.js` — classes come from Origin-line classification; `unstructured` is pinned ungradable. Use the existing class key unchanged — no new class notion.
- Ceiling resolution: `bin/lib/issues/autonomy.js` (`resolveCeiling`, `permittedGrants`) — reads trust verdicts; untouched here but its contract (`skills/_shared/autonomy-ceiling.md`) documents the evidence sources and must be updated.
- Policy keys: `bin/lib/policy-schema.js` `POLICY_KEYS` + `skills/_shared/policy-schema.md` Config Lever Index — where `trust-revert-window-days` registers.
- Tests: `bin/lib/issues/tests/trust.test.js` — existing patterns for fixture-driven trust grading.

## Deliverables

- [ ] `trust.js`: a closed record whose close is at least `trust-revert-window-days` old (default 14) and whose closing commits show no revert counts as a known-good outcome, alongside the existing demo-descent grading; younger closes contribute nothing (still unknown, never partial credit). **The window anchors on the record's tracker `closed_at` timestamp** — never a git commit date or PR `merged_at` (no PR exists for direct-push closes, and this repo's squash/rebase conventions rewrite commit dates). A record reopened and later re-closed is evaluated against its **latest** close only — reopen history is not a permanent tombstone; a currently-open record contributes nothing.
- [ ] Closing-commit discovery, two routes in order: (1) the GitHub timeline `closed` event's commit reference when present; (2) a commit-message scan for `(refs|closes|fixes) #N` (word-bounded) over the integration branch's history — route 2 is load-bearing here because this repo's own convention writes `refs #N`, which creates no native close-link. A record where **both** routes find nothing stays unknown — never defaults to known-good (fail closed) — and the module header states this as the coverage boundary.
- [ ] Revert detection helper: given a record's closing commit SHAs and the integration branch's `git log`, detect (a) `This reverts commit <sha>` entries naming any closing commit, and (b) revert-shaped commits (subject starting `Revert`) whose message references the same record number — the fallback for squash/rebase-rewritten SHAs (IL-45). **Any one reverted closing commit disqualifies the whole record** (multi-commit records are all-or-nothing, conservative direction). A manual revert with neither the trailer nor a record reference is a stated out-of-scope false-negative in the module header.
- [ ] Lazy evaluation with an injectable clock parameter — outcomes are computed at read time from record state + git history; no scheduled job, no cached verdict file.
- [ ] Policy key `trust-revert-window-days` (integer days, default 14) registered in `bin/lib/policy-schema.js` and documented in `skills/_shared/policy-schema.md`'s Config Lever Index.
- [ ] `skills/_shared/autonomy-ceiling.md` updated to describe both evidence sources (demo-descent and operational) — sweep its existing prose for claims that demo verdicts are the only source (IL-93-style: widen the mechanism, sweep the prose describing its old reach).
- [ ] Unit suite additions in `bin/lib/issues/tests/trust.test.js` on frozen fixtures.

## Acceptance Criteria

1. A fixture record of class X, closed by commit `abc123`, merged 15 days before the injected clock, with no revert entry in the fixture log, contributes one known-good outcome to class X's cell — verified by the class verdict changing from `insufficient-evidence` to a graded verdict once enough such fixtures exist to clear MIN_SAMPLES.
2. The same fixture with merge age exactly at the window boundary (14 days, default) counts; at 13 days it does not — both directions asserted.
3. The same fixture plus a fixture log entry `This reverts commit abc123` does not count as known-good (this leaf's scope: not-countable; the negative-evidence consequence is the companion leaf's).
4. A closed fixture record with no discoverable closing commit contributes nothing, and the suite asserts this explicitly.
5. `trust-revert-window-days: 21` in a fixture policy makes a 15-day-old merge not count; the default applies when the key is absent; a malformed value (0, negative, non-integer) falls back to the default rather than throwing.
6. Test discrimination verified by reverting: with the new grading logic reverted, the new assertions fail (run once during development; the suite itself uses frozen fixtures only — no live repo history, no live `Date.now()`).
7. A fixture record closed, reopened, and re-closed 20 days before the injected clock counts as known-good against its latest close (with no revert); the same fixture still open after the reopen contributes nothing — the reopen is not a permanent tombstone, asserted in both directions.
8. A fixture record with two closing commits, one of them reverted, does not count as known-good (all-or-nothing rule asserted).

## Technical Approach

Extend the outcome-grading step where demo-descent evidence is read today: a record's outcome resolution first tries demo-descent (existing), then operational (new), else unknown. The operational check needs (a) the record's closed state, `closed_at`, and reopen history, (b) closing commit SHAs (two-route discovery above), (c) a revert scan. Data sources, named: `closed_at` and reopen detection come from the record fetch trust.js's caller already performs, widened to include `closedAt`/`stateReason` (and timeline events only where the list fields can't answer — isolate any timeline call behind a stubable function). The git log is **injected by the caller**: today trust.js "computes and returns rows for display only" with no git access, so the caller that renders trust (backlog overview / help, and later the grant unit) shells out once for `git log <integration-branch> --format=...` (full history of the integration branch, resolved per `_shared/integration-branch.md`) and passes it in. Keep the computation pure given `(records, gitLog, now, policy)` — purity is what makes the frozen-fixture suite honest (IL-62: derive expectations independently, never from the live environment). Malformed-policy coercion is owned **centrally by `policy-schema.js`** (the same place every other key validates); trust.js trusts the resolved value and never re-validates.

### Data / API Surface

- `trust.js` (internal): outcome resolution gains an `operational` outcome kind — `{known: true, grade: 'good', source: 'operational'}` shape aligned to whatever the existing demo-descent resolution returns (align at build time to the real shape; do not invent a parallel result type).
- New policy key: `trust-revert-window-days` — integer ≥ 1, default 14.

### Key Files

- `bin/lib/issues/trust.js` — outcome resolution extension + revert detection + injectable clock
- `bin/lib/issues/tests/trust.test.js` — new fixture-driven cases
- `bin/lib/policy-schema.js` — `POLICY_KEYS` entry
- `skills/_shared/policy-schema.md` — Config Lever Index row
- `skills/_shared/autonomy-ceiling.md` — evidence-source prose update

### Package Dependencies

- None new — plain Node, `node --test`.

## Gotchas

- **Read before you write:** trust.js's header comments encode deliberate floors (MIN_SAMPLES, known-outcome flooring, the `unstructured` pin) added after real failure modes — the operational source must flow *through* those floors, not around them. A 40-record class with 1 operational known-good and 39 unknown must not grade `clean`.
- Frozen fixtures only (IL-80): never read live repo history in tests — a test reading real closed records is a scheduled failure timed to backlog churn.
- `git log --grep "This reverts"` returns revert commits whose *message* names the SHA; a squash-merge rewrite means the named SHA must be matched against the record's closing commits, not against `main`'s tips (IL-45: verify by content relationships, not SHA reachability alone, where possible).
- File-overlap ordering with #219 on `policy-schema.js`/`policy-schema.md`: whichever builds second must re-merge, not overwrite — re-verify this record's premise against the live files immediately before building (IL-109).
- Retroactivity is a *property* of lazy evaluation, not a migration step — there is no backfill job to write; assert it with a fixture whose merge predates any plausible ship date.
- The `2>/dev/null`-free rule while exploring (IL-91) and no health CLIs with real args (IL-73) both apply during development here.


<!-- work-fingerprint: 2026-08-09-self-maintaining-fleet-design:trust-ladder-merged-unreverted-operational-outcomes-become-k -->
