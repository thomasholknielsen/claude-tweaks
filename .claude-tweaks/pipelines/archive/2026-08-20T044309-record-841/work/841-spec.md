---
record: 841
origin: capture
risk: low
size: medium
ceremony: standard
grants: [build]
---
# 841: resolve-profile session-failure blacklist: 5 parked follow-ups (locking, source honesty, recovery path, doc + journey refresh)

Origin: build follow-up from record #763 (session-failure blacklist) — final whole-branch review found these, explicitly ruled non-blocking and parked rather than entering a second fix wave

Defer-reason: genuinely-larger

## Current State

Record #763 shipped a session-scoped model-failure blacklist (`bin/lib/model-profiles/session-failures.js`, `resolve()`'s 7th stage, `bin/resolve-profile.js`'s `record-failure` subcommand). The build's final whole-branch review found five smaller, non-blocking gaps that were deliberately parked rather than folded into that build's one-shot fix wave (per the SDD process's own "no second fix wave" rule):

1. `bin/lib/model-profiles/session-failures.js`'s `recordFailure` still has an unlocked lost-update race: two concurrent `record-failure` calls for two *different* models in the same session can race, with the loser's write silently dropped (the torn-read variant of this was already fixed with an atomic rename; this is the separate, still-open lost-update variant). Worst case degrades to pre-#763 behavior for the lost model — never data corruption.
2. `bin/lib/model-profiles/profiles.js`'s `resolve()` stage 7 stamps `source: 'degraded:session-failure'` even on the floored/no-change case (all viable tiers already failed, so the result is unchanged from the table default) — contradicting the file's own documented "last stage that CHANGED the result" invariant, and making a genuine step-down indistinguishable from a give-up case via `source` alone.
3. `bin/lib/model-profiles/session-failures.js` has no invalidation/recovery path, unlike the sibling module it mirrors (`bin/lib/issues/record-snapshot.js`, which has both a TTL and `invalidateSnapshot()`). Credit exhaustion is normally a usage window, not permanent — a session degraded at 10:00 stays silently degraded at 16:00 with no documented way to clear it early.
4. `docs/plugin-structure.md`'s `bin/lib/model-profiles/` entry doesn't list `session-failures.js` (added by #763) and its `resolve()` description doesn't mention the session-failure stage.
5. `docs/journeys/resolve-dispatch-model-profile.md` is now stale and gives a false-positive red flag: it lists both `bin/resolve-profile.js` and `bin/lib/model-profiles/profiles.js` as tracked files (both changed by #763, `/journey-health`'s staleness trigger), documents only five resolution stages (missing the sixth/seventh), and names "`source` anything other than `default`" as a red flag with `degraded:cap` as the expected success state — a maintainer walking this journey in a session that recorded a failure now sees `degraded:session-failure` and is told that's a defect.

## Deliverables

- [ ] Decide and implement a locking strategy for `recordFailure`'s lost-update race (item 1) — e.g. a lockfile, or accept the current best-effort posture and document it explicitly as a known limitation rather than leaving it implicit.
- [ ] Fix stage 7 in `profiles.js` to only claim `source: 'degraded:session-failure'` when the model actually changed (item 2) — guard on `tier !== profileOfModel(model)` before overwriting `source`.
- [ ] Add a documented recovery path for the session-failure blacklist (item 3) — at minimum, name the file path and an `rm` command in `bin/resolve-profile.js`'s header comment; consider whether a TTL or explicit clear subcommand is warranted.
- [ ] Update `docs/plugin-structure.md`'s `bin/lib/model-profiles/` entry (item 4).
- [ ] Refresh `docs/journeys/resolve-dispatch-model-profile.md` (item 5) — add the session-failure stage, update the red-flag/success-state language so a `degraded:session-failure` resolution reads as correct behavior, not a defect.

## Acceptance Criteria

1. `npm test` passes.
2. Items 1-3 (code) are covered by `bin-lib` unit tests where the fix is testable (item 1's chosen strategy, item 2's guard).
3. Items 4-5 (docs) are verified by re-reading the updated files against the current `bin/lib/model-profiles/` module contents.

## Technical Approach

Each item is independently small and separable — no shared design decision links them except item 1 possibly informing whether item 3's recovery path also needs to account for lock cleanup.

## Gotchas

- These were explicitly ruled non-blocking by #763's own final review; none are load-bearing on the shipped feature's correctness. Cost of leaving them unaddressed longer: minor doc drift and a rare, self-limiting degrade — not a regression risk.
- Item 1's fix requires a genuine design decision (which locking primitive, or whether to accept the risk) — flagged in the Deliverables rather than prescribed.

_Filed by `capture` via specShapedBody._
