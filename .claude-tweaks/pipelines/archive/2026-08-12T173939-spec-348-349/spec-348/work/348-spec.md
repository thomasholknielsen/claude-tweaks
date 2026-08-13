---
record: 348
origin: human
risk: low
size: medium
ceremony: standard
grants: []
surface: backend
---
# 348: Autonomy capabilities: consoleAutoResolve and ledgerRouteRemainder behind the unattended ceiling

Surface: backend

## Overview

Add two `unattended`-only bookkeeping capabilities — `consoleAutoResolve` and `ledgerRouteRemainder` — to `bookkeepingPermissions(ceiling)` and document them in the autonomy-ceiling contract, plus the ceiling-conditional default for `review-severity-floor`. This sub-issue is deliberately inert: it adds the permission bits and their contract documentation only; no skill consumes them until the sibling sub-issues land (expand-contract — add the new, then migrate consumers).

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- No changes to `skills/_shared/auto-mode-contract.md` / `auto-mode-card.md` never-silenced rows — that is the contract-rewrite sub-issue's scope, and until it lands those rows still forbid the behaviors these bits permit. That ordering is intentional.
- No changes to `wrap-up/review-console.md`, `ledger/resolve-gate.md`, or `review/step3-routing.md` — consumer sub-issues.
- No changes to `permittedGrants`, trust evidence, or grant origination.

## Prerequisites

None — this is the family's first buildable sub-issue.

## Current State

- `bin/lib/issues/autonomy.js` — `bookkeepingPermissions(ceiling)` (line ~170) returns the existing capability set (`ledgerNarrowing`, `queueWriteAutoFile`, `opsAckAutoAcknowledge`); `CEILINGS`, `resolveCeiling`, `clearsFloor` in the same module. Read the function before editing — match its exact return shape and tier logic.
- `bin/lib/issues/tests/autonomy.test.js` — existing tests for the three capabilities; follow their assertion style.
- `skills/_shared/autonomy-ceiling.md` — "Bookkeeping capabilities" table (currently the three above), "What it authorizes" tier table, and the header's referenced-by list.
- `skills/_shared/policy-schema.md` — `review-severity-floor` lever row (default `low`, `none`/`low`/`medium` auto-apply cutoff, read via `/flow` Manifesto/`config.yml`).

## Deliverables

- [ ] `bookkeepingPermissions(ceiling)` returns `consoleAutoResolve: true` and `ledgerRouteRemainder: true` at `unattended` only; both `false` at `supervised`, `trusted`, and any unrecognized ceiling value (the existing fallback-to-`supervised` path, per `resolveCeiling`); the existing three capabilities' values unchanged at every tier.
- [ ] Unit tests in `bin/lib/issues/tests/autonomy.test.js` covering both new keys at all three named tiers plus the unrecognized-value fallback (extend the existing `bookkeepingPermissions falls back to supervised for undefined or an unrecognized tier` test at line ~312 rather than adding a parallel one), plus an assertion that the existing three keys' values are unchanged at each tier.
- [ ] `skills/_shared/autonomy-ceiling.md`: two new rows in the Bookkeeping capabilities table, matching the existing rows' one-sentence behavior-description style (not just a consumer-file pointer) — `consoleAutoResolve`: "the Review Console resolves every section (batch table, `M#`, `Q#`, `U#`) per its own defaults with zero `AskUserQuestion` calls, rendering as an informational report instead of a prompt"; `ledgerRouteRemainder`: "extends `ledgerNarrowing` — a ledger item whose blocker reason misses the four-category floor also auto-routes to `Route to a record -> Keep (backlog)` (never `Fix anyway`/`Accept`/`Drop`)". `unattended` row of "What it authorizes" updated to include them, replacing the now-inaccurate "a third bookkeeping capability" phrasing with a reference to the table rather than an ordinal count. Referenced-by list (header, ~line 9): append each new capability's consumer file to the *existing* per-file parenthetical rather than adding duplicate file entries — e.g. `wrap-up/review-console.md` becomes "(queue-write auto-file, console auto-resolve)", `ledger/resolve-gate.md` becomes "(Phase 2 narrowing, route remainder)". Also reword the header's own "for the three bookkeeping capabilities this file also documents" (~line 9) away from the literal count, same cardinality-rule reasoning as the intro sentence in Gotchas below — this second instance is in scope too.
- [ ] `skills/_shared/autonomy-ceiling.md` documents the review-floor ceiling-conditional default alongside the capabilities (one short paragraph: at `unattended` the `review-severity-floor` skill default is `medium`; explicit CLI/config/policy values win under the standard precedence chain — the ceiling moves the default, never overrides a stated choice). This paragraph is **documentation of an intended future behavior, not a code change** — no file in this sub-issue's Key Files reads the ceiling to compute this default; the actual read/default site is `skills/review/step3-routing.md` (`review-severity-floor` read at line ~49/~73, default `low`, per-severity table at ~77-85) — **not** `skills/review/SKILL.md`. Wiring the ceiling into that resolution is out of scope here (state this explicitly in the paragraph) — a later record wires it once this sub-issue's contract text exists to point at.
- [ ] `skills/_shared/policy-schema.md`: the `review-severity-floor` row's description notes the ceiling-conditional default with a pointer to `_shared/autonomy-ceiling.md` (stated once there — the schema row only points).

## Acceptance Criteria

1. `node --test bin/lib/issues/tests/autonomy.test.js` passes, including new assertions: `bookkeepingPermissions('unattended').consoleAutoResolve === true`, `bookkeepingPermissions('unattended').ledgerRouteRemainder === true`, both `=== false` for `'supervised'`, `'trusted'`, and an unrecognized value (e.g. `'bogus-tier'`), and the three existing keys' values unchanged at every tier (diff each tier's full returned object against today's pre-change snapshot, not just the two new keys).
2. `grep -in "consoleautoresolve" skills/_shared/autonomy-ceiling.md` and `grep -in "ledgerrouteremainder" skills/_shared/autonomy-ceiling.md` each match at least one Bookkeeping-capabilities table row, and that row's text is a behavior sentence (contains a verb describing what happens), not just the capability name.
3. `grep -in "unattended" skills/_shared/policy-schema.md` matches the `review-severity-floor` row's description (the ceiling-conditional default note), and the note points at `_shared/autonomy-ceiling.md` rather than restating the mechanism.
4. `npm test` passes with all suites green (redirect output to a file before inspecting — long runs truncate).
5. `git grep -rn "consoleAutoResolve\|ledgerRouteRemainder"` (whole repo, no path restriction) matches only `bin/lib/issues/autonomy.js`, its test file, and the two `_shared/*.md` docs touched here — zero matches anywhere under `skills/wrap-up/`, `skills/ledger/`, or `skills/review/` (proves this sub-issue stayed inert — no consumer migrated early).

## Technical Approach

Two new boolean keys in the object `bookkeepingPermissions` returns, gated on `ceiling === 'unattended'`, exactly parallel to `opsAckAutoAcknowledge`. Contract docs updated in the same commit so the capability is never live-but-undocumented.

### Data / API Surface

`bookkeepingPermissions(ceiling)` return shape gains: `consoleAutoResolve: boolean`, `ledgerRouteRemainder: boolean`. No signature change; no new exports.

### Key Files

- `bin/lib/issues/autonomy.js` — extend `bookkeepingPermissions`
- `bin/lib/issues/tests/autonomy.test.js` — tier assertions for the new keys
- `skills/_shared/autonomy-ceiling.md` — capability table rows, tier table, referenced-by list, review-floor default paragraph
- `skills/_shared/policy-schema.md` — `review-severity-floor` row note

## Gotchas

- `autonomy-ceiling.md`'s Bookkeeping capabilities intro currently opens with a literal count ("Three narrow, opt-in…"). Per CLAUDE.md's cardinality rule, reword to describe the set by reference (e.g. "The narrow, opt-in… behaviors in the table below") rather than bumping the number — literal counts are exactly what go stale.
- The modules "answer whether a caller may, and the caller acts" — do not add any behavior, logging, or side effects to `autonomy.js`; the bits are pure permissions.
- `auto-mode-contract.md` line ~188 still says memory writes are "**Not** exempt under any `autonomy` tier" after this sub-issue lands. That is correct mid-migration — do not "fix" it here; the contract-rewrite sub-issue owns it.
- An unrecognized ceiling value resolves toward `supervised` (see `resolveCeiling`) — the new keys must be `false` on that path too; the existing test `bookkeepingPermissions falls back to supervised for undefined or an unrecognized tier` (`bin/lib/issues/tests/autonomy.test.js:312`) is the pattern to extend.
- `skills/review/SKILL.md` never mentions `review-severity-floor` — the read/default/per-severity-table logic lives in `skills/review/step3-routing.md`. Point the ceiling-conditional-default paragraph at the right file; don't repeat the wrong one from an earlier draft of this record.
- Read `docs/skill-authoring.md` before editing the two `skills/_shared/*.md` files.


<!-- work-fingerprint: autonomy-console-headless-wrapup:autonomy-capabilities-consoleautoresolve-and-ledgerrouterema -->
