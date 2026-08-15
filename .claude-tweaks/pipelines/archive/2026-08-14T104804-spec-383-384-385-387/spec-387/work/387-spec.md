---
record: 387
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: design-craft-integration:emil-skills-governance-drift-manifest-entry-and-init-install
blocked-by: [383]
surface: backend
---
# 387: Emil skills governance: drift-manifest entry and init install offer

Surface: backend

## Overview

Governance for the new optional upstream: pin `emilkowalski/skills` in the upstream-drift manifest, extend the deterministic checks to cover the new entry class, add the `/claude-tweaks:init` install offer, and post the one-line Related note on #357. Emil's repo has no version discipline (no tags, no releases), so this introduces the manifest's first content-hash-pinned entry class: `versioning: none` (that literal key/value, used consistently everywhere this record says "no-semver"), pinned by git commit SHA plus per-file sha256 hashes of the consumed `SKILL.md` files.

Parent: #382 (the design-craft-integration decomposition this sub-issue belongs to).

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No wiring of any Emil skill into any dispatch site (the sibling sub-issues own consumption).
- No hard dependency: `/claude-tweaks:init`'s offer is declinable and its absence degrades per the contract (#383).
- No changes to the two existing Impeccable manifest entries (plugin and CLI — they stay separate entries, and this entry is a third, also separate).
- #357 gets a comment only — no body edit, no labels, no scope change.
- No network access from `npm test` — the test-time check is fixture-based and fully offline (see Technical Approach); live upstream comparison belongs to the drift auditor's own run, not the test suite.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #383 | Design craft contract: decisions vs principles assembly for UI-writing dispatches | open — the consumed-file list below is re-verified against #383's merged relevance map before hashes are computed |

## Current State

- `tools/upstream-drift/manifest.yml` — version-pinned entries (each declaring `kind` + `installed-probe`) for the Impeccable plugin and Impeccable CLI as two separate entries (conflating them is the documented root cause of a past defect — see the spec-141 note in that manifest's history), plus superpowers; `tools/upstream-drift/checks.js`'s functions resolve an installed root via `resolveRoots()`, which returns `[]` for probe types it doesn't recognize. **This entry class is different by design: nothing is installed by this repo, so the new entry deliberately declares no `installed-probe` — the checks extension below adds an explicit `versioning: none` code path rather than riding the existing probe machinery.** This is a code-path addition, not a pure data addition.
- `skills/init/bootstrap/` — numbered step files; `step-11-impeccable-design-integration.md` is the Impeccable install step (being edited by #379 concurrently — genesis recommendation), `step-12` diagram suggestions, `step-13` shadcn bootstrap; CLAUDE.md references an init Step 14 (cloud Setup-script regeneration). Expected baseline: steps run 11–14; re-confirm the live files at build time before choosing the new step's number, and expect #379 to have touched step-11 in the interim.
- `skills/_shared/design-craft.md` (#383) — names the consumed skill set this entry pins. Snapshot at spec time: `emil-design-eng`, `animate`, `animation-vocabulary`, `apple-design` — **re-verify against the merged #383 relevance map before computing hashes**; the merged map wins on any difference.
- #357 — open record "specify/build/design-wrapper: no UI-stack decision point before frontend implementation".

## Deliverables

- [ ] `tools/upstream-drift/manifest.yml`: a new `emilkowalski/skills` entry, separate from both Impeccable entries (own top-level key, own `pin` block — no shared YAML anchors or objects), pinning: the upstream repo, the pinned commit (rule: HEAD of the upstream default branch at implementation time), `versioning: none`, and one sha256 per consumed file. Scope statement inside the entry (as a YAML comment): only each consumed skill's `SKILL.md` is pinned; a future dispatch site consuming any other file from a skill directory must extend this entry.
- [ ] Fixture snapshots: commit the consumed `SKILL.md` files as fixtures under `tools/upstream-drift/` (mirroring the existing fixture layout there), fetched at the pinned SHA. MIT license permits this; the fixtures are what make the test-time check discriminating and offline.
- [ ] Checks extension: a `versioning: none` code path in the deterministic checks that (a) validates entry shape (entry exists, commit-SHA format, one hash per consumed file, no `installed-probe` expected), and (b) recomputes each fixture file's sha256 and compares it to the manifest's pinned hash — a corrupted pin or a tampered fixture fails loudly. `node --test` coverage follows the existing tests' pattern. The drift auditor's own (non-test) run may additionally fetch upstream HEAD to triage newly-appearing skills as new-capability candidates and to detect the pinned-SHA-unreachable case (upstream history rewrite) — that failure mode reports as drift, never as a test failure.
- [ ] New `/claude-tweaks:init` bootstrap step (number chosen after re-confirming the live step files against the 11–14 baseline, appended without renumbering existing steps): frontend detected → offer `npx skills@latest add emilkowalski/skills` with a short what/why that states the install is optional and its absence degrades gracefully per #383's contract, cleanly declinable, recording the choice the same way the sibling integration steps do; referenced from init's step index/SKILL.md wherever the sibling steps are.
- [ ] Post on #357: `gh issue comment 357 --body "Related: Emil Kowalski's pick-ui-library skill (emilkowalski/skills — pinned in tools/upstream-drift/manifest.yml by #387, part of the #382 design-craft family) is the natural engine for this record's eventual stack-decision step — deliberately not wired anywhere yet; see skills/_shared/design-craft.md's named-not-wired list."`

## Acceptance Criteria

1. `node --test tools/upstream-drift/tests/` passes with the new entry present; deliberately corrupting one pinned hash locally makes the fixture-hash comparison fail (verify by reverting — then restore). The check compares against committed fixtures, so this discriminates offline.
2. The manifest contains three design-related upstream entries (Impeccable plugin, Impeccable CLI, emilkowalski/skills), each with its own `pin` block; the shape test asserts no two entries share a `pin` object or YAML anchor.
3. The new init step file exists, is referenced from init's step sequence, and `git diff` shows no renumbering of existing step files.
4. The #357 comment exists (visible via `gh issue view 357 --comments`).
5. The pinned SHA is the upstream default branch's HEAD at implementation time; each pinned hash equals the sha256 of the corresponding committed fixture, and each fixture is byte-identical to the upstream file at that SHA (computed from a fresh fetch, not from any local install).
6. The consumed-file list in the manifest matches the merged #383 relevance map's wired set exactly.

## Technical Approach

The entry is data plus a small, explicit check extension for the `versioning: none` class — read `checks.js`'s dispatch structure first and add the new class alongside the existing probe-based paths, not inside them. The init step mirrors `step-11`'s offer/decline/record structure with the install command swapped.

### Data / API Surface

Manifest entry shape (align field names with the manifest's existing schema at build time; the class marker is fixed):

```yaml
emilkowalski-skills:
  repo: emilkowalski/skills
  pin: { commit: <sha>, versioning: none }
  # SKILL.md only per skill; consuming any other upstream file requires extending this entry
  consumed:
    - path: skills/emil-design-eng/SKILL.md
      sha256: <hash>
    # one row per file in the merged #383 relevance map's wired set
```

### Key Files

- `tools/upstream-drift/manifest.yml` — new entry
- `tools/upstream-drift/checks.js` (+ sibling modules as the existing structure dictates) — the `versioning: none` code path
- `tools/upstream-drift/tests/` — shape + fixture-hash coverage
- `tools/upstream-drift/` fixture dir — committed SKILL.md snapshots at the pinned SHA
- `skills/init/bootstrap/step-{N}-emil-skills.md` — new step (N re-confirmed at build time against the 11–14 baseline)
- `skills/init/SKILL.md` (or the step index file) — reference to the new step

## Gotchas

- Spec-141 lesson: conflating two upstream version lines in one entry caused a real defect — three separate entries, no shared pins.
- #377/#378 also append `tools/upstream-drift/manifest.yml` assertions and #379 edits `step-11` — expect adjacent-line merge conflicts; rebase late and keep this entry textually separate (own top-level key, own block).
- Verify AC 1's discrimination by actually corrupting-then-restoring a hash (verify-test-discrimination-by-reverting) — a check that cannot fail is not a check.
- Compute hashes and fixtures from a freshly fetched upstream copy at the pinned SHA; do not trust a local install that may already be stale (verify-third-party-source).
- The init step must not imply the install is required — absence degrades gracefully per #383's contract; the offer text says so.
- Upstream history rewrite can make the pinned SHA unreachable — that surfaces in the drift auditor's fetch path as reported drift (re-pin decision for a human), never as an `npm test` failure; tests stay fixture-only.


<!-- work-fingerprint: design-craft-integration:emil-skills-governance-drift-manifest-entry-and-init-install -->
