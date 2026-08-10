---
record: 273
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
blocked-by: [271]
surface: backend
---
# 273: abstraction-police vertical: cross-file duplicate-abstraction candidate generator

Surface: backend
Parent: #265

Blocked by #271: assumes the focus grammar and candidate-input plumbing landed as specified

## Overview

The abstraction-police vertical — the reel&#39;s &#34;same abstraction rebuilt in multiple places, unify it&#34; job. A candidate generator clusters **cross-file near-duplicate abstractions** (similar exported function signatures/names, near-identical helper bodies) and feeds the clusters to the judge under the existing `architecture-depth` criterion, whose fragment gains cross-file calibration text (when unification is right, when apparent duplication is actually healthy decoupling). This is inherently cross-file work the slice rotation structurally cannot judge — a slice sees one directory; a duplicated abstraction lives in two.

Decision rationale on parent #265.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- Performing any unification — findings file as records.
- Semantic/AST-equivalence analysis — v1 clustering is lexical/structural (normalized names, signature shapes, body similarity by token overlap); stated coverage, not implied totality (IL-110).
- New criterion — `architecture-depth` exists; this leaf only adds calibration text to its fragment.
- Non-exported/internal duplicate helpers — out of scope in v1: exported symbols are where cross-module unification has a stable seam; internal dupes are a later widening.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #271 | code-health focus mode + dead-code generator | this decomposition — framework |

## Current State

- Framework (post-E): focus grammar + candidate plumbing; `candidates-dead-code.js` as the generator model.
- `skills/_shared/criteria-architecture-depth.md` — existing fragment (shallow-module calibration); `architecture-depth` catalog entry in `bin/lib/code-health/criteria.js`.
- Real prior art for the finding shape: this repo&#39;s own history of unify-the-duplicates records (e.g. the shared field-validation helper extraction #230) — the finding a consumer wants names every occurrence and proposes the single home.

## Deliverables

- [x] `bin/lib/code-health/candidates-abstraction-police.js`: clusters exported functions/helpers across files — **combination rule, decided: a pair clusters when signature shape matches (arity + destructured-param keys) AND body token-overlap clears the threshold; normalized-name similarity is a secondary signal recorded in the evidence, never sufficient or necessary alone.** Starting threshold: body token-overlap Jaccard **≥ 0.6** (module constant with header rationale; calibrated at build against the boundary fixtures, but the spec-stated value is the anchor AC2 tests against). Emits `{files: [...], symbols: [...], kind: &#39;duplicate-abstraction&#39; (fixed literal — the matching basis lives in evidence, never in kind), evidence}` clusters of size ≥ 2, `evidence` a string with one line per member (`file — symbol — basis`). JS/TS, exported symbols only, coverage stated. Exclusion set: import the same exclusion source `next-slice` uses (one shared constant, both modules — never a copied list), plus test-fixture and vendored paths.
- [x] `skills/_shared/criteria-architecture-depth.md`: cross-file calibration addition — unify when the copies drift-fix independently (cite the N-times-fixed-bug shape); do NOT unify when the similarity is coincidental shape sharing across genuinely different domains, when unification would couple modules across a deliberate boundary, or when one copy is about to be deleted anyway.
- [x] Focus wiring: `focus=abstraction-police` — generator + pinned `architecture-depth` criterion.
- [x] `bin/lib/code-health/tests/candidates-abstraction-police.test.js`: frozen fixtures.
- [x] Finding shape guidance in the focus wiring: one finding per cluster with `relatedAnchors` covering every occurrence — never one finding per copy (the SKILL.md anti-pattern about splitting one root cause into N near-duplicates already forbids that; cite it).

## Acceptance Criteria

1. Fixture with two near-identical `validateFinding`-shaped helpers in different modules plus one coincidentally-similar-name function with a different signature yields exactly one cluster of the two — exact-set, not count.
2. Threshold behavior asserted at the boundary: a fixture pair just under the 0.6 body-overlap threshold produces no cluster; just over produces one (both directions, against the spec-stated constant).
2b. Transitive-closure fixture: a coincidental function pairwise near-threshold with one real cluster member does not get chained into the cluster by union-find — asserted with a fixture built exactly for that edge.
2c. A candidate function body exceeding the bounded-read window is skipped with a logged note and never silently half-compared — its exclusion appears in the run summary&#39;s skipped counts (same reporting convention as the framework&#39;s scanned/skipped counts).
3. A cluster&#39;s `evidence` names each member&#39;s file, symbol, and the similarity basis — sufficient for the judge to reason without re-deriving.
4. Fragment addition preserves every existing line of `criteria-architecture-depth.md` (additive-only — asserted by diff inspection at review, stated here so the implementer doesn&#39;t reorganize in place, IL-70&#39;s transform discipline).
5. The cluster generator ignores test fixtures and generated/vendored paths (same exclusion set the slicer&#39;s config-dot-directory handling implies — read `next-slice`&#39;s exclusion conventions and reuse them; #133 documents the slicer emitting config dot-directories as a known wart, don&#39;t inherit it).

## Technical Approach

Two-pass: collect all exported symbols with their normalized names, signature shapes, and token-bag bodies (bounded read per file — reuse the bounded-read grep patterns SKILL.md documents); then cluster via pairwise similarity with union-find, thresholds as module constants with header rationale. Deterministic and pure given the tree — no randomness, no network.

### Data / API Surface

- `candidatesAbstractionPolice(rootDir, opts) → [{files, symbols, kind: &#39;duplicate-abstraction&#39;, evidence}]`.

### Key Files

- `bin/lib/code-health/candidates-abstraction-police.js` — new
- `bin/lib/code-health/tests/candidates-abstraction-police.test.js` — new
- `skills/_shared/criteria-architecture-depth.md` — cross-file calibration addition
- `skills/code-health/SKILL.md` / focus sub-file — `abstraction-police` wiring

### Package Dependencies

- None new.

## Gotchas

- N implementations agreeing is exactly when a shared bug reads as the spec (IL-90) — the calibration text must tell the judge that a unification finding should flag behavioral *differences* between the copies as part of the finding, since one of them is often the bug.
- IL-73 applies (no real-args CLI runs).
- Similarity thresholds are the discrimination surface — verify the boundary tests actually fail when the threshold constant is nudged (revert-verify once during development).
- Cross-file reads across a big repo must respect the focus mode&#39;s read budget from E — the generator emits clusters cheaply; the *judge* pays to read members. Cap judged clusters per firing at **10** (module constant; when the cap truncates, the run summary and run record state how many clusters were dropped — no silent caps).
- One finding per cluster (`relatedAnchors` covering every occurrence) is **judge-side** behavior — the SKILL.md focus wiring instructs it and cites the existing anti-pattern row; the generator&#39;s own contract ends at emitting clusters.
- Re-verify E&#39;s landed grammar before building (IL-109).
