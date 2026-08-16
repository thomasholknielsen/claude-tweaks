# Deferral Gate — fix-now criteria, bad reasons, and the `Defer-reason:` vocabulary

The single home of the rule every exhaust channel applies before anything becomes a work-record proposal: *fix it now unless one of a closed set of reasons says why not.* Consumers cite this file instead of carrying their own defer wording (`_shared/ledger-format.md` does today; the rest migrate with #621):

- `skills/review/step3-routing.md` (Step 3 routing — Defer / Capture branches)
- `skills/reflect/full-mode.md` and `skills/reflect/hindsight-mode.md` (Defer / Capture recommendation rules)
- `skills/wrap-up/residue-sweep.md` (`remedy: record` findings)
- `skills/wrap-up/leftover-routing.md` (unfinished spec sections)
- `skills/visual-review/browser-review.md` (Findings & Ideas Defer routing)
- `skills/_shared/ledger-format.md` (the ledger resolve gate's Phase 1 / 2 / 3)

The code twins are `clearsFloor` (`bin/lib/issues/autonomy.js`) and `recordPayload`'s `deferReason` option (`bin/lib/issues/record.js`); `DEFER_REASONS` in `record.js` is the vocabulary's only code home, and `tests/deferral-gate-conformance.test.js` pins this file and that export equal.

## Fix-now criteria

For each open item or finding, attempt to fix it now. **The default is fix; defer is the exception.** An item qualifies for fix-now if **all** of these hold:

- Change is localized — typically ≤5 files, no spans across unrelated systems
- Fix does not require functionality not yet built in this pipeline
- Fix does not require user product/design decisions
- Fix does not require external state (third-party data, prod traffic, approvals)
- Fix does not materially expand pipeline scope (does not trigger long rebuilds, does not break >10 unrelated tests)

If the item qualifies, fix it, commit it, and record it as fixed. Do this BEFORE presenting anything to the user.

## Bad reasons to skip a fix

Never use these to leave an item open, defer it, or file it:

- *"Out of scope of this plan / spec"* — if the file is in this build's diff, it is in scope
- *"Following plan verbatim"* — when plan code conflicts with `.claude/rules/` or CLAUDE.md don'ts, fix the violation; the plan was written before review-time context
- *"A future plan (P2/P3/...) might want X"* — speculative; only defer for *known* downstream needs
- *"Bundle of small items"* — items get classified individually, never as a group
- *"Premature without consumer signal"* — clear bugs and convention violations get fixed now
- *"Plan-prescribed routing"* — if the plan said "X moves to P6," that's plan documentation, not a ledger event; remove the item entirely instead of deferring
- *"Minor / outside that scope / not load-bearing"* — severity is never a defer reason; review's severity floors decide what blocks, not what gets fixed

## `Defer-reason:` vocabulary

An item that fails fix-now carries exactly one of these values. The list is closed — the same six values, in the same order, are `DEFER_REASONS` in `bin/lib/issues/record.js`:

```
tangential — a new capability or idea the finding suggests, not a fix to the current work (Capture, never Defer)
needs-human-decision — the fix requires a product/design call only a human can make
pre-existing-outside-diff — a defect in a file this build's diff does not touch
genuinely-larger — the fix expands scope past the fix-now criteria (long rebuild, >10 unrelated tests, spans unrelated systems)
blocked-external — the fix waits on external state (third-party data, prod traffic, approvals)
blocked-dependency — the fix waits on functionality not yet built
```

### Floor mapping

`clearsFloor` (`bin/lib/issues/autonomy.js`) reads a structured value first and returns the verdict below; a free-prose reason still falls back to its regex categories. Structured values map onto those regex groups as follows:

| `Defer-reason:` | `CATEGORY_PATTERNS` group | Clears the floor |
|---|---|---|
| `blocked-external` | external state / third-party / prod traffic / approvals | yes |
| `needs-human-decision` | product-or-design decision | yes |
| `blocked-dependency` | not-yet-built | yes |
| `genuinely-larger` | scope expansion / long rebuild + `UNRELATED_TESTS_RE` (>10 unrelated tests) | yes |
| `tangential` | — (no group) | no |
| `pre-existing-outside-diff` | — (no group) | no |

## The hard gate

No record proposal — staged in a run directory or created directly — without a valid `Defer-reason:`. An item that fails fix-now and has no valid reason stays `open` for the human drill; it is never filed. There is no advisory mode. This is contract text: enforcement lands with #621 (producers stamp the reason) and #622 (the Review Console refuses reason-less proposals).

## Re-verification

After any fix-now change made after `/claude-tweaks:review` passed, re-run `/claude-tweaks:test`. Stated once here; consumers cite it rather than restating it.

## Where the reason lives

- **Staged proposals** (`{run-dir}/staged/*.md`): a `Defer-reason: {value}` line inside the header block — the lines before the first blank line, alongside `Title:` / `Type:` / `Labels:`. Readers locate it **by key, never by position**.
- **Directly-created records**: the first line of the body, followed by a blank line (`recordPayload`'s `deferReason` inserts it there when the body does not already carry one).

## Removal condition

`autonomy.js`'s regex fallback (`CATEGORY_PATTERNS` / `UNRELATED_TESTS_RE`) is transitional. Its recorded removal condition, stated here in the same words as the code comment: Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time.
