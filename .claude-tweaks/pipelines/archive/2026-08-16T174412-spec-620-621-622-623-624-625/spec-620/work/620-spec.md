---
record: 620
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-16-exhaust-deferral-gate-design:deferral-gate-contract-shared-deferral-gate-md-ledger-format
surface: backend
---
# 620: deferral gate contract: _shared/deferral-gate.md, ledger-format citation, structured clearsFloor and recordPayload deferReason

Surface: backend

## Overview

Create `skills/_shared/deferral-gate.md` — the single home of the fix-now criteria, the bad-reasons-to-skip-a-fix list, and a closed `Defer-reason:` vocabulary — and make the two code twins read it: `clearsFloor` (`bin/lib/issues/autonomy.js`) reads the structured reason first, and `recordPayload` (`bin/lib/issues/record.js`) accepts and validates an optional `deferReason`. `_shared/ledger-format.md` becomes a citation of the new file instead of the owner of the criteria (expand-contract: the text moves, the ledger's Phase 1/2/3 keep working unchanged). This is the load-bearing half of Phase 1 of parent #619: every exhaust channel will cite this one contract (#621), and every record proposal will carry one of its reasons or be refused (#622).

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Making review Step 3, reflect, the residue sweep, or leftover routing cite the new file — #621 (blocked by this one).
- The Review Console's refuse row, the `decisions.md`/summary-template audit-line rendering, or eval scenarios — #622. This sub-issue changes **no** log-line format anywhere.
- Any change to what body a producer composes (`specShapedBody`, born-ready) — Phase 2 (#623–#625).
- Changing which reasons auto-route at `trusted`+: `clearsFloor`'s four floor categories keep exactly today's semantics (mapping table below).

## Prerequisites

None — this is the root of the decomposition (parent #619).

## Current State

- `skills/_shared/ledger-format.md` "### Phase 1 — Exhaust fixes (agent, silent)": five fix-now criteria (localized ≤5 files, no spans across unrelated systems; no functionality not yet built in this pipeline; no product/design decision; no external state; no material scope expansion — long rebuilds, >10 unrelated tests) and six **bad reasons to skip a fix** ("Out of scope of this plan / spec", "Following plan verbatim", "A future plan (P2/P3/...) might want X", "Bundle of small items", "Premature without consumer signal", "Plan-prescribed routing"). Phase 2's `Unresolved Open Items` table has a `Why not fixed now` column ("must be one of the legitimate-defer reasons"); Phase 2's ledger-narrowing block calls `clearsFloor(blockerReason)`; Phase 3's `Defer`/`Keep`/`Acknowledge` branches stage `{run-dir}/staged/ledger-record-{slug}.md` with a `Title:`/`Type:`/`Labels:` header. Ledger-specific vocabulary in the moved text ("ledger item", `blockerReason`) is generalized minimally on the move ("item/finding") — the criteria wording itself is kept.
- `bin/lib/issues/autonomy.js`: `CATEGORY_PATTERNS` — regexes in four groups (external state / third-party / prod traffic / approvals; product-or-design decision; not-yet-built; scope expansion / long rebuild) + `UNRELATED_TESTS_RE` (>10 unrelated tests); `clearsFloor(blockerReason)` returns `true` when a free-prose reason matches. Exports `CEILINGS`, `resolveCeiling`, `permittedGrants`, `clearsFloor`, `bookkeepingPermissions`. It requires nothing from `record.js`; `record.js` requires only `./facet-shape` — so `record.js` → `autonomy.js` imports are safe in one direction (autonomy imports record), never the other. Tests: `tests/bin-lib/issues/autonomy.test.js`.
- `bin/lib/issues/record.js`: constants `ORIGINS`, `TYPES`, `TIERS`, `PRIORITIES`, `CEREMONY_TIERS`; `recordPayload({ title, body, type, origin, risk, size, ceremony, framing, ready, parked, priority, fingerprint, effort })` — validates each facet with `oneOf(...)`, rejects `effort` with a bespoke error, emits labels in a deterministic order, appends the fingerprint marker to `body`. Tests: `tests/bin-lib/issues/record.test.js`.
- `skills/review/step3-routing.md` (Deferral gate — two bullets, the second reading exactly `Has a clear trigger documented for when to revisit`), `skills/reflect/full-mode.md` / `hindsight-mode.md` ("Defer — bigger, not relevant now"), `skills/wrap-up/residue-sweep.md` (`remedy: record` hint), `skills/wrap-up/leftover-routing.md` — each carries its own weaker defer wording today; #621 migrates them; they are listed here only so the new file's "Consumers" section can name them.
- `skills/wrap-up/summary-template.md` "Routed to backlog" renders from ledger Phase 2's `AUTO … (blocker: {category}) …` lines — untouched by this sub-issue (#622 changes both the line and the renderer together).
- Conformance-test exemplars: `tests/merge-verification-gate-conformance.test.js` and `tests/integration-model.test.js` (regex-plus-allowlist scans over `skills/**/*.md`).

## Deliverables

- [ ] `skills/_shared/deferral-gate.md` (new) with these sections, in this order: purpose + consumer list (`review/step3-routing.md`, `reflect/full-mode.md`, `reflect/hindsight-mode.md`, `wrap-up/residue-sweep.md`, `wrap-up/leftover-routing.md`, `_shared/ledger-format.md`); **Fix-now criteria** (the five, moved from ledger Phase 1); **Bad reasons to skip a fix** (the six existing, plus a seventh: *"minor / outside that scope / not load-bearing" — severity is never a defer reason; review's severity floors decide what blocks, not what gets fixed*); **`Defer-reason:` vocabulary** — exactly `tangential`, `needs-human-decision`, `pre-existing-outside-diff`, `genuinely-larger`, `blocked-external`, `blocked-dependency`, each with a one-line definition, rendered as one fenced list so a test can parse it, plus the **floor mapping table**: `blocked-external` ↔ CATEGORY_PATTERNS' external-state/third-party/prod-traffic/approvals group; `needs-human-decision` ↔ product-or-design-decision group; `blocked-dependency` ↔ not-yet-built group; `genuinely-larger` ↔ scope-expansion/long-rebuild group + `UNRELATED_TESTS_RE`; `tangential` and `pre-existing-outside-diff` ↔ no group (do not clear the floor); **The hard gate** (no record proposal — staged or directly created — without a valid `Defer-reason:`; an item that fails fix-now with no valid reason stays `open` for the human drill, never filed; no advisory mode; **stated plainly as contract text whose enforcement lands with #621 — producers stamp — and #622 — the console refuses**); **Re-verification** (after any fix-now change made after `/review` passed, re-run `/claude-tweaks:test` — stated once here, cited by consumers); **Where the reason lives** — staged proposals: a `Defer-reason: {value}` line inside the header block (the lines before the first blank line, alongside `Title:`/`Type:`/`Labels:`), located **by key, never by position**; directly-created records: the first line of the body, followed by a blank line; **Removal condition** for `autonomy.js`'s regex fallback (below), stated here in the same words as the code comment.
- [ ] `skills/_shared/ledger-format.md`: Phase 1's criteria and bad-reasons list replaced by a citation of `_shared/deferral-gate.md` (one sentence naming the file, no restated criteria — heading names unchanged); Phase 2's `Why not fixed now` column reads "one of `_shared/deferral-gate.md`'s `Defer-reason:` values"; Phase 3's `Defer`/`Keep`/`Acknowledge` staging shape gains the `Defer-reason:` header line. No log-line changes.
- [ ] `bin/lib/issues/record.js`: export `DEFER_REASONS = Object.freeze(['tangential','needs-human-decision','pre-existing-outside-diff','genuinely-larger','blocked-external','blocked-dependency'])` next to `ORIGINS`/`TYPES` (constants home); `recordPayload` accepts optional `deferReason`, validated with `oneOf('deferReason', deferReason, DEFER_REASONS)` (unknown → throws naming the field, same style as the `effort` rejection); when supplied and the body has **no** line matching `^Defer-reason: `, insert `Defer-reason: {value}` as the first line of the body followed by a blank line; when the body already carries such a line (a `specShapedBody`-composed body, #623), validate that its value equals `deferReason` (mismatch → throw) and insert nothing. Omitted → body byte-identical to today. `deferReason` never becomes a label; label emission order unchanged.
- [ ] `bin/lib/issues/autonomy.js`: `const { DEFER_REASONS } = require('./record')`; `clearsFloor(reason)` — when `reason` is exactly one of `DEFER_REASONS`, return the structured verdict per the mapping table (`true` for `needs-human-decision`, `genuinely-larger`, `blocked-external`, `blocked-dependency`; `false` for `tangential`, `pre-existing-outside-diff`); otherwise fall back to today's regex path unchanged (exact-match first, so a free-prose reason containing a vocabulary word still takes the regex path). Header comment records the removal condition verbatim: *"Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time."* At build time, file that follow-up via `/claude-tweaks:capture` with a spec-shaped body and `Defer-reason: blocked-dependency` (it waits on #621/#624) — the recorded removal condition CLAUDE.md's Don'ts require, not just a comment.
- [ ] Tests: `tests/bin-lib/issues/autonomy.test.js` — all six structured values return the documented verdicts; a free-prose reason still resolves via regex; an unknown string returns `false`. `tests/bin-lib/issues/record.test.js` — unknown `deferReason` throws naming the field; a valid one renders as the first body line for (a) a body starting with `## Current State` and (b) a body with pre-heading prose; a body already carrying a matching `Defer-reason:` line is left unchanged; a mismatching one throws; omitted leaves the body byte-identical.
- [ ] `tests/deferral-gate-conformance.test.js` (new, exemplar shape): parses the fenced vocabulary list out of `skills/_shared/deferral-gate.md` and asserts **set equality** with `require('../bin/lib/issues/record.js').DEFER_REASONS`; asserts the file contains each of the five fix-now criteria's anchor phrases (`≤5 files`, `not yet built`, `product/design decision`, `external state`, `>10 unrelated tests`), each of the seven bad reasons' anchor phrases (`Out of scope of this plan`, `Following plan verbatim`, `might want X`, `Bundle of small items`, `Premature without consumer signal`, `Plan-prescribed routing`, `severity is never a defer reason`), and the removal-condition sentence; asserts `autonomy.js`'s source contains the same removal-condition sentence; asserts `skills/_shared/ledger-format.md` cites `_shared/deferral-gate.md` and no longer contains `Bundle of small items`. (#621 extends this file with per-consumer assertions.)
- [ ] `docs/plugin-structure.md` `_shared` listing gains the new file (one row); `docs/skill-graph.md` unchanged (a `_shared` contract, not a skill).

## Acceptance Criteria

1. `node --test tests/bin-lib/issues/autonomy.test.js tests/bin-lib/issues/record.test.js tests/deferral-gate-conformance.test.js` passes; the conformance test fails when run against the pre-change `ledger-format.md` (verify by temporarily reverting that file — the test must discriminate).
2. `grep -c "Bundle of small items" skills/_shared/ledger-format.md` prints `0` and `grep -c "Bundle of small items" skills/_shared/deferral-gate.md` prints `1`.
3. `node -e "const {clearsFloor}=require('./bin/lib/issues/autonomy.js'); console.log(['tangential','needs-human-decision','pre-existing-outside-diff','genuinely-larger','blocked-external','blocked-dependency'].map(clearsFloor))"` prints `[ false, true, false, true, true, true ]`; `clearsFloor('requires a product decision from the owner')` still prints `true`.
4. `recordPayload({title:'t', body:'Intro paragraph.\n\n## Current State\nx', type:'task', deferReason:'tangential'}).body` starts with `Defer-reason: tangential\n\nIntro paragraph.`; `deferReason:'minor'` throws an error whose message names `deferReason`; `recordPayload({title:'t', body:'Defer-reason: tangential\n\n## Current State\nx', type:'task', deferReason:'tangential'}).body` contains exactly one `Defer-reason:` line.
5. `npm test` passes in full (conformance suites pin prose repo-wide).

## Technical Approach

Move, don't rewrite: cut the Phase 1 text out of `ledger-format.md` into the new file, generalizing only the ledger-specific nouns, then add the vocabulary, mapping, hard-gate, placement, and removal-condition sections around it. The vocabulary lives in code once (`DEFER_REASONS` in `record.js`, the existing constants home) and in prose once (`deferral-gate.md`); the conformance test pins the two lists equal by parsing both. `clearsFloor`'s structured branch is an exact-match `DEFER_REASONS.includes(reason)` check ahead of the regex loop.

### Data / API Surface

- `record.js` exports: `DEFER_REASONS` (frozen array of the six values); `recordPayload` option `deferReason?: DEFER_REASONS[number]`; body line format exactly `Defer-reason: {value}`, first line of the body, blank line after.
- `autonomy.js`: `clearsFloor(reason: string): boolean` (signature unchanged; structured path first).
- Staged-proposal header (prose contract): `Title:` / `Type:` / `Labels:` / `Defer-reason:` lines in the header block, keyed lookup.

### Key Files

- `skills/_shared/deferral-gate.md` — new contract file
- `skills/_shared/ledger-format.md` — Phase 1 citation, Phase 2 column text, Phase 3 header line
- `bin/lib/issues/record.js` — `DEFER_REASONS`, `deferReason` option on `recordPayload`
- `bin/lib/issues/autonomy.js` — structured `clearsFloor` branch, removal-condition comment
- `tests/bin-lib/issues/autonomy.test.js`, `tests/bin-lib/issues/record.test.js` — unit tests
- `tests/deferral-gate-conformance.test.js` — new conformance suite
- `docs/plugin-structure.md` — `_shared` file table row

### Package Dependencies

None.

## Gotchas

- `ledger-format.md` is 21.7 KB and cited by `/build`, `/test`, `/review`, `/wrap-up`, `/flow`, `/tidy` as a knowledge dependency — keep every heading name (`### Phase 1 — Exhaust fixes (agent, silent)` etc.) intact; only the criteria text moves out. Existing tests may grep those headings.
- Do not touch `CATEGORY_PATTERNS` semantics — `tests/bin-lib/issues/autonomy.test.js` pins the current regex behavior (e.g. the `>10 unrelated tests` numeric threshold); add cases, don't rewrite.
- `DEFER_REASONS` lives in `record.js`, and `autonomy.js` imports it — never the reverse (`record.js` must stay import-free of `autonomy.js`, or the two form a cycle).
- Anchor phrases in the conformance test are exact substrings; pin `severity is never a defer reason` for the seventh bad reason rather than the italic sentence with its em-dash.
- CLAUDE.md conventions: version bump is not this record's job (release happens centrally); commit message imperative, no conventional-commit prefix; state each relationship once (the new file's consumer list is descriptive prose, not a skill-graph edge).


<!-- work-fingerprint: 2026-08-16-exhaust-deferral-gate-design:deferral-gate-contract-shared-deferral-gate-md-ledger-format -->
