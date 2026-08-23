---
record: 696
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
blocked-by: [621, 624]
surface: backend
---
# 696: Remove clearsFloor's regex fallback (CATEGORY_PATTERNS / UNRELATED_TESTS_RE) once every deferral-gate consumer stamps a structured Defer-reason

Surface: backend

## Current State

`bin/lib/issues/autonomy.js`'s `clearsFloor(reason)` resolves a structured `Defer-reason:` value (exact member of `DEFER_REASONS`) from the `STRUCTURED_FLOOR` mapping table first, and falls back to `CATEGORY_PATTERNS` + `UNRELATED_TESTS_RE` regexes for free-prose reasons (#620). The regex fallback existed only because not every producer stamped a structured value yet.

The recorded removal condition — stated verbatim in both `autonomy.js`'s header comment (line 172) and `skills/_shared/deferral-gate.md`'s "Removal condition" section (line 80) — is: "Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time." This record is that follow-up.

Re-verified against live `main` (not just the original condition text) before shaping:
- Both blocking records are closed: #621 ("deferral gate consumers: review Step 3, reflect, residue sweep, leftover routing cite the gate and stamp Defer-reason on staged proposals") and #624 ("exhaust producers file spec-shaped born-ready...").
- Every consumer named in `deferral-gate.md` (`skills/review/step3-routing.md`, `skills/reflect/full-mode.md`, `skills/reflect/hindsight-mode.md`, `skills/wrap-up/residue-sweep.md`, `skills/wrap-up/leftover-routing.md`, `skills/_shared/ledger-format.md`) does contain a `Defer-reason:` line.
- `tests/deferral-gate-conformance.test.js` (added at 70cb3f5a) has shipped clean across every release since v6.90.0 (current is v6.94.0 — four releases, not just one).
- `grep -rn "clearsFloor" bin/ skills/ tests/` shows no live call site outside `autonomy.js` itself and its own test file — nothing else depends on the regex fallback's behavior.
- Baseline `node --test tests/bin-lib/issues/autonomy.test.js tests/deferral-gate-conformance.test.js` is green (101/101) before this change.

The condition is fully satisfied; this is a straightforward discharge of a pre-recorded removal condition, not a new design decision.

## Deliverables

- [ ] Delete `CATEGORY_PATTERNS` (`bin/lib/issues/autonomy.js` lines 187-202), `UNRELATED_TESTS_RE` (line 211), and the regex branch of `clearsFloor` (lines 219-224) — `clearsFloor` returns the `STRUCTURED_FLOOR` verdict for a `DEFER_REASONS` member and `false` for anything else (including free-prose reasons that used to match the regexes).
- [ ] Remove the header comment's regex-fallback narrative (lines 160-172, "Two paths: a structured Defer-reason:... moved verbatim from the retired unattended-tier.js... Removal condition...") and replace with a comment describing the single structured-only path — do not leave a dangling reference to a removed removal condition.
- [ ] Remove the regex-path test cases from `tests/bin-lib/issues/autonomy.test.js`: the free-prose category tests (lines 238-335, e.g. "returns true for an external-state blocker", "for a product/design-decision blocker", "for a not-yet-built-dependency blocker", "for a scope-expansion blocker", the unrelated-tests-threshold tests, the case-insensitive free-prose test, the third-party/approval free-prose tests) and the explicit regex-path tests at lines 453-464 ("a free-prose reason still resolves via the regex path", "a free-prose reason that merely contains a vocabulary word takes the regex path, not the structured one"). Keep the structured-verdict tests (lines 437-450, 466-467) and the type/empty/whitespace guard tests (lines 302-315) — the guard clause (`typeof !== 'string'` / empty-string check) is unaffected by this change.
- [ ] Remove the "## Removal condition" section from `skills/_shared/deferral-gate.md` (lines 78-80) and the matching removal-condition sentence from `autonomy.js`'s header comment (folded into the comment deliverable above).
- [ ] Drop the `REMOVAL_CONDITION` assertion from `tests/deferral-gate-conformance.test.js` (the constant at line 20 and the two `assert.ok` calls at lines 89-90 that pin it into both `deferral-gate.md` and `autonomy.js`).
- [ ] Update `deferral-gate.md`'s "### Floor mapping" table (lines 52-63) to drop the `CATEGORY_PATTERNS` group column and its intro sentence ("a free-prose reason still falls back to its regex categories... Structured values map onto those regex groups as follows") — describe the structured verdicts only (`Defer-reason:` → clears the floor yes/no).

## Acceptance Criteria

1. `grep -c "CATEGORY_PATTERNS\|UNRELATED_TESTS_RE" bin/lib/issues/autonomy.js skills/_shared/deferral-gate.md tests/deferral-gate-conformance.test.js` prints `0` for each file.
2. `node -e "const {clearsFloor}=require('./bin/lib/issues/autonomy.js'); console.log(clearsFloor('requires a product decision from the owner'), clearsFloor('needs-human-decision'))"` prints `false true` (the first call — free prose that used to match the regex fallback — now returns `false`; the second — the structured vocabulary member — is unchanged).
3. `node --test tests/bin-lib/issues/autonomy.test.js tests/deferral-gate-conformance.test.js` passes; `npm test` passes in full.

## Technical Approach

Pure deletion, no new logic. Delete the two constants and the regex branch of `clearsFloor` in `bin/lib/issues/autonomy.js`, leaving the `typeof`/empty-string guard and the `DEFER_REASONS.includes(...)` structured-path line as the entire function body. Update the header comment in place rather than leaving stale prose about "two paths." Mirror the deletion in the three doc/test locations named in Deliverables. No production call site changes — `clearsFloor`'s exported signature and behavior for every `DEFER_REASONS` member is unchanged; only its behavior for non-member strings changes, from regex-matched `true`/`false` to unconditional `false`.

## Gotchas

- The issue's original body still carries "Blocked by #621" / "Blocked by #624" as plain body text, not a native GitHub blocked-by relationship (`gh api repos/.../issues/696/dependencies/blocked_by` returns `[]`) — those are now stale since both are closed; this record's Current State supersedes that text with the re-verified status.
- `clearsFloor` currently has no live call site outside its own module and test file (`grep -rn "clearsFloor" bin/ skills/ tests/` — only `autonomy.js` and `autonomy.test.js` match, plus prose citations in `ledger-format.md`, `deferral-gate.md`, `autonomy-ceiling.md`). This does not change the deliverables, but means there is no downstream production code path to re-test beyond the two files named in Acceptance Criteria 3.
- Test-file line numbers cited in Deliverables are from the pre-change file (`tests/bin-lib/issues/autonomy.test.js` as of this shaping) — re-locate by test name/content if the file has since shifted, rather than trusting line numbers literally.

## Original request

Remove clearsFloor's regex fallback (CATEGORY_PATTERNS / UNRELATED_TESTS_RE) once every deferral-gate consumer stamps a structured Defer-reason

Defer-reason: blocked-dependency

Origin: build #620 (recorded removal condition for autonomy.js's transitional regex fallback)

## Current State

`bin/lib/issues/autonomy.js`'s `clearsFloor(reason)` resolves a structured `Defer-reason:` value (exact member of `DEFER_REASONS`) from a mapping table first, and falls back to `CATEGORY_PATTERNS` + `UNRELATED_TESTS_RE` regexes for free-prose reasons (#620). The regex fallback exists only because not every producer stamps a structured value yet: `skills/_shared/deferral-gate.md`'s consumers (`review/step3-routing.md`, `reflect/full-mode.md`, `reflect/hindsight-mode.md`, `wrap-up/residue-sweep.md`, `wrap-up/leftover-routing.md`, `_shared/ledger-format.md`) start stamping `Defer-reason:` with #621 and compose via `specShapedBody` with #624. The header comment in `autonomy.js` and the "Removal condition" section of `deferral-gate.md` both state, verbatim: "Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time." This is that record.

## Deliverables

- [ ] Delete `CATEGORY_PATTERNS`, `UNRELATED_TESTS_RE`, and the regex branch of `clearsFloor` in `bin/lib/issues/autonomy.js`; `clearsFloor` returns the structured verdict for a `DEFER_REASONS` member and `false` for anything else.
- [ ] Remove the regex-path cases from `tests/bin-lib/issues/autonomy.test.js` (the free-prose `clearsFloor` tests moved from the retired unattended-tier suite) and the "free-prose reason still resolves via regex" case; keep the structured-verdict cases.
- [ ] Remove the "Removal condition" section from `skills/_shared/deferral-gate.md` and the matching sentence from `autonomy.js`'s header comment; drop the `REMOVAL_CONDITION` assertion from `tests/deferral-gate-conformance.test.js`.
- [ ] Update `deferral-gate.md`'s Floor mapping table to describe the structured verdicts only (no regex-group column).

## Acceptance Criteria

1. `grep -c "CATEGORY_PATTERNS\|UNRELATED_TESTS_RE" bin/lib/issues/autonomy.js skills/_shared/deferral-gate.md tests/deferral-gate-conformance.test.js` prints `0` for each file.
2. `node -e "const {clearsFloor}=require('./bin/lib/issues/autonomy.js'); console.log(clearsFloor('requires a product decision from the owner'), clearsFloor('needs-human-decision'))"` prints `false true`.
3. `node --test tests/bin-lib/issues/autonomy.test.js tests/deferral-gate-conformance.test.js` passes; `npm test` passes in full.

Blocked by #621
Blocked by #624

