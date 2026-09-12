# Fast-lane bundle cache persistence + reporting wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist fast-lane bundle membership (`grouping.js`'s `bundleFastLaneSingletons`) through the dispatch queue-order cache so a cache-hit drain still reports it via `dispatch-fastlane-bundles.json`, and wire that file into an actual Reporting-section consumer so a bundled group's report is distinguishable from an ordinary multi-spec group.

**Architecture:** `queue-order.js`'s `composeOrderBlob` gains an optional `bundles` field, carried through unconditionally by `writeOrder`/`readOrder` (no other change to those functions — they already pass the blob through opaquely). `queue-pull-script.md`'s cache-hit branch writes `persisted.bundles || []` to `$DISPATCH_FASTLANE_BUNDLES` instead of the unconditional `echo '[]'`; the cache-miss write-back passes the already-computed `bundles` array (read back from the file just written at that point) into `composeOrderBlob`. `dispatch/reporting.md` gains a paragraph documenting the per-group block's fast-lane-bundle header rule, keyed on set-equality against `dispatch-fastlane-bundles.json`; `dispatch/SKILL.md`'s Step 4 selection log line gains the same conditional phrase.

**Tech Stack:** Plain Node.js (`node:test`, no external deps), matching the rest of `plugin/bin/lib/dispatch/`.

**Spec:** GitHub issue #2066 — materialized at `.claude-tweaks/pipelines/2026-09-11T101913-record-2066/work/2066-spec.md` in this worktree.

## Global Constraints

- `composeOrderBlob`'s existing positional/named fields (`computedAt, runId, freshnessSignal, groups, excluded`) keep their exact shape — `bundles` is additive only, so every existing call site and test (`tests/bin-lib/dispatch/queue-order.test.js`) keeps passing unchanged.
- A pre-upgrade persisted blob with no `bundles` field must read as `[]`, never throw or `undefined` at the point a caller consumes it.
- The queue-order cache write-back stays a single CAS write (no second file) — `bundles` rides the existing `writeOrder` call.
- `dispatch/SKILL.md` stays under its size ceiling — the wording goes in `reporting.md`, `SKILL.md`'s own line only gains the conditional phrase inline.

---

### Task 1: `queue-order.js` — carry `bundles` through the blob

**Files:**
- Modify: `plugin/bin/lib/dispatch/queue-order.js`
- Test: `tests/bin-lib/dispatch/queue-order.test.js`

**Interfaces:**
- `composeOrderBlob({computedAt, runId, freshnessSignal, groups, excluded, bundles})` returns the same object, now including `bundles` (passed through as given, no default applied here — the empty-list fallback is a read-side concern per the Global Constraint above).

- [ ] Step 1: Write the failing test — add three tests to `tests/bin-lib/dispatch/queue-order.test.js`: (a) `composeOrderBlob` carries an optional `bundles` field through unchanged; (b) a `bundles` field round-trips through `writeOrder`/`readOrder` unchanged; (c) a pre-upgrade blob with no `bundles` field reads back with `bundles` `undefined` (documents the fallback boundary the caller applies). Run `node --test tests/bin-lib/dispatch/queue-order.test.js` and confirm (a)/(b) fail.
- [ ] Step 2: Implement — add `bundles` to `composeOrderBlob`'s destructured params and returned object. Run the test file again and confirm all green.
- [ ] Step 3: Commit both files together.

---

### Task 2: `queue-pull-script.md` — persist on write-back, restore on cache hit

**Files:**
- Modify: `plugin/skills/dispatch/queue-pull-script.md`

- [ ] Step 1: Cache-hit path restores bundles instead of defaulting to `[]` — in the `CACHE_HIT=$(node -e "...")` block, add a positional arg for `$DISPATCH_FASTLANE_BUNDLES` and, in the signals-match branch that already writes `persisted.groups`/`persisted.excluded`/oversized, add a `fs.writeFileSync` of `persisted.bundles || []` to that new arg. Update the "Cache-hit default" comment above the unconditional `echo '[]' > "$DISPATCH_FASTLANE_BUNDLES"` to note it is overridden by `persisted.bundles` on an actual hit.
- [ ] Step 2: Cache-miss write-back persists the bundle list already computed — in the write-back `node -e "..."` block (the one calling `writeOrder`/`composeOrderBlob`), add a positional arg reading `$DISPATCH_FASTLANE_BUNDLES` back (already written earlier in the cache-miss path) and pass it into `composeOrderBlob` as `bundles`.
- [ ] Step 3: Manual verification — extract each modified `node -e "..."` block's JS body into a scratch file and run `node --check` against it to confirm no syntax error, then discard the scratch file.
- [ ] Step 4: Commit.

---

### Task 3: Wire `dispatch-fastlane-bundles.json` into Reporting + selection log

**Files:**
- Modify: `plugin/skills/dispatch/reporting.md`
- Modify: `plugin/skills/dispatch/SKILL.md`
- Test: `tests/bin-lib/dispatch/reporting-fastlane-bundle-citation.test.js` (new)

- [ ] Step 1: Write the failing test — a new conformance test asserting `reporting.md` references `dispatch-fastlane-bundles.json` and keys the header on set-equality wording, that `SKILL.md`'s Step 4 selection log line carries the phrase "fast-lane bundle", and that `grep -rln dispatch-fastlane-bundles plugin/skills`-equivalent coverage includes both `queue-pull-script.md` and `reporting.md`. Run it and confirm the first two assertions fail.
- [ ] Step 2: Implement `reporting.md` — add a paragraph documenting: when a dispatched group's member-number set equals an entry in this run's `dispatch-fastlane-bundles.json` (set-equality, not subset — a bundle partially excluded by a later filter no longer equals its persisted entry and renders as an ordinary group), that group's report block header names it a fast-lane bundle (`fast-lane bundle: #a, #b, #c — assembled by bundleFastLaneSingletons, cap {n}`) instead of the ordinary multi-spec group line.
- [ ] Step 3: Implement `SKILL.md` — extend the existing Step 4 selection log line template (`AUTO {time} — Step 4: minted {$GROUP_RUN_DIR} for group [{issue list}].`) with one added conditional clause naming the bundle when this group's member set matches an entry in `dispatch-fastlane-bundles.json`, pointing at `reporting.md` for the full wording rather than restating the set-equality rule. Run the conformance test again and confirm all green; then confirm the grep-equivalent covers both files.
- [ ] Step 4: Commit.

---

### Task 4: Full suite

- [ ] Step 1: Run `npm test`. Expected: all suites pass, no regressions.
