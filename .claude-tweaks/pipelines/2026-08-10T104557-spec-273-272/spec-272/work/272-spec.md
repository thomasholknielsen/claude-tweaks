---
record: 272
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
blocked-by: [271]
surface: backend
---
# 272: test-hygiene vertical: coverage-gap and useless-test candidate generator plus missing-tests criterion

Surface: backend
Parent: #265

Blocked by #271: assumes the focus grammar and candidate-input plumbing landed as specified

## Overview

The test-hygiene vertical — one focus covering both of the reel-shaped test jobs: **write missing tests** (coverage-gap areas: source files/exports with no corresponding test coverage) and **delete useless tests** (assertion-free or tautological tests). One candidate generator emits both candidate kinds; the existing `test-quality` criterion judges the useless-test half, and a new `missing-tests` criteria fragment (this leaf) judges the gap half. Findings file as records like any sweep — the missing-test findings are *creation* work (type:task records proposing tests), the useless-test findings are deletion work.

Decision rationale on parent #265.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Writing any tests itself — the sweep files records; dispatch builds them.
- Coverage instrumentation (no nyc/c8 dependency) — v1 gap detection is structural (file/export correspondence), not line-coverage-based; the fragment says so.
- Touching the framework or other verticals.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #271 | code-health focus mode + dead-code generator | this decomposition — the framework this vertical plugs into |

## Current State

- Framework (post-E): `skills/code-health/SKILL.md` focus grammar + candidate-input plumbing; `bin/lib/code-health/candidates-dead-code.js` as the structural model for a generator + its fixture suite.
- Criteria catalog: `bin/lib/code-health/criteria.js` (`criteriaForArea`, area-gated `appliesTo` arrays); fragments under `skills/_shared/criteria-*.md`; `test-quality` criterion exists.
- This repo&#39;s own test layout as the convention example: `tests/` plus `bin/lib/{name}/tests/` — correspondence conventions differ per repo, so the generator&#39;s pairing heuristics must be configurable-by-convention-detection, not hardcoded to one layout.

## Deliverables

- [x] `bin/lib/code-health/candidates-test-hygiene.js`: emits `{kind: &#39;coverage-gap&#39;}` candidates (source files with no test file referencing them by import or name-convention pairing; exported symbols never referenced from any test file) and `{kind: &#39;useless-test&#39;}` candidates (test **files** with zero assertion calls — **detection granularity is per-file in v1**, block-level is AST territory; assertions comparing a literal to itself; tests whose body is empty or only setup). **The assertion vocabulary is an exported module constant — the exact callee list (`assert`-prefixed calls, `expect(`, `t.assert`, plus the jest/vitest matcher-chain shape `expect(...).to*`/`.rejects`) is the contract, extended by editing that one constant, never scattered.** The IL-30 exception is granularity-derived: a token from the vocabulary anywhere in file scope counts, regardless of call position, so lazily-called assertion functions in test-doubles never read as assertion-free. Pairing heuristics are a **fixed priority order in v1** (import-reference, then filename-convention, then directory-convention pairing) — the &#34;configurable&#34; framing is dropped; `opts` carries only exclusion globs, and the header states which repo layouts the three heuristics cover (IL-110). Header follows `candidates-dead-code.js`&#39;s coverage-statement pattern.
- [x] `skills/_shared/criteria-missing-tests.md`: new fragment — calibration for judging which coverage gaps are *worth filing* (public API and load-bearing logic yes; generated code, config echoes, thin re-exports no), explicitly structural-not-line-coverage.
- [x] `bin/lib/code-health/criteria.js`: catalog entry `missing-tests` with the new fragment path, area-gated to test-bearing area types consistent with how existing area-gated criteria declare `appliesTo` (read the catalog&#39;s live gating conventions first).
- [x] `skills/code-health/SKILL.md` (or the focus sub-file E landed): `focus=test-hygiene` value wired — generator, pinned criteria (`missing-tests` + `test-quality`).
- [x] `bin/lib/code-health/tests/candidates-test-hygiene.test.js`: frozen fixture trees (IL-80).

## Acceptance Criteria

1. Fixture with a source module having no test file, one with a properly paired test, an assertion-free test file, and a tautological test (`assert.equal(1, 1)` shape) yields exactly the gap + the two useless-test candidates — exact-set assertion, not count (IL-105).
1b. Symbol-level gap fixture: a source module whose file IS paired but which exports one symbol no test file references yields a symbol-scoped `coverage-gap` candidate — the file-level and symbol-level detectors are asserted separately. Barrel re-export chains are **not** followed (v1): a symbol referenced only through a barrel may over-nominate as a gap — accepted, because the generator nominates and the criterion filters; stated in the header.
2. A test-double whose `returns` fields are lazily-called functions is NOT flagged as assertion-free merely for having no top-level assert (IL-30&#39;s pattern appears in healthy suites) — fixture included.
3. The generalist rotation picks up `missing-tests` via `criteriaForArea` for test-bearing area types — asserted through the existing catalog test conventions, not hand-listed (the catalog is the single source of truth; no hand-copied criterion lists in prose, per SKILL.md&#39;s own rule).
4. Both candidate kinds carry `evidence` strings naming the exact pairing/assertion basis; the judge&#39;s material is the evidence string **plus the candidate files&#39; content read under the framework&#39;s existing read-budget discipline** — evidence orients, content decides (nuanced calibration like the IL-30 shape is judged from content, never from the string alone). Deletion findings must state what the test would have caught, if anything — that counterfactual is judge-side reasoning guided by the fragment, not a generator field.
5. New fragment stays within the `_shared` fragment size conventions and is loaded by the focus run&#39;s judge prompt (verified in the SKILL.md wiring, not assumed — IL-60&#39;s dispatcher-inlining lesson).

## Technical Approach

Pairing heuristics in priority order: explicit import of the source module from a test file; filename-convention pairing (`foo.test.js` ↔ `foo.js`, `tests/foo.test.js` ↔ sibling or parent `foo.js`); directory-convention (`bin/lib/x/tests/*` ↔ sibling or parent `foo.js`). Assertion detection: known assertion callees (`assert*`, `expect(`, `t.assert`) via word-bounded grep over test files. False-negative direction: prefer missing a gap over flagging a covered module.

### Data / API Surface

- `candidatesTestHygiene(rootDir, opts) → [{file, symbol?, kind: &#39;coverage-gap&#39; | &#39;useless-test&#39;, evidence}]` — pure, no git writes.
- Catalog: `missing-tests` criterion id; fragment file path per catalog conventions.

### Key Files

- `bin/lib/code-health/candidates-test-hygiene.js` — new
- `bin/lib/code-health/tests/candidates-test-hygiene.test.js` — new
- `skills/_shared/criteria-missing-tests.md` — new fragment
- `bin/lib/code-health/criteria.js` — catalog entry
- `skills/code-health/SKILL.md` / focus sub-file — `test-hygiene` wiring

### Package Dependencies

- None new.

## Gotchas

- IL-73: never exercise via `bin/code-health.js` with real args — module + unit suite only.
- The catalog forbids hand-maintained copies of the criteria list in prose — when documenting the new criterion, describe membership by reference to `criteria.js` (the cardinality rule; IL-40).
- A &#34;useless test&#34; verdict is a judgment call the *criterion* makes — the generator only nominates. Deleting a test that guards a rare regression is the harm case; the fragment&#39;s calibration text must say deletion findings cite what the test would have caught if anything.
- Fixture trees for pairing heuristics must include a false-friend (test file whose name pairs but imports nothing) so discrimination is real (verify by reverting the pairing logic once during development).
- Re-verify the focus grammar&#39;s landed shape from E before building (IL-109).
