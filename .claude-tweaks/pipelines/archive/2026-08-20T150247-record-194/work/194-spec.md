---
record: 194
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 194: Phase 2: wire prior-art detection to the remaining doc-creating paths

Surface: backend

## Current State

Phase 1 shipped in 6.64.0 (#187) and wired prior-art detection for ADR creation only. `skills/_shared/prior-art-detection.md` owns the general procedure — the evidence-split rule, the hard rules, and the recording contract. `_shared/diataxis-genre-templates.md` carries a per-genre declaration table, and `doc-convention.adr` already exists in `policy.yml`, but ADR is its only wired consumer today. The table's other rows are marked `Phase 2` and explicitly state that no consumer reads them yet — so nothing is silently broken today. This record is what makes those rows real.

## Deliverables

Wire the existing prior-art detection procedure to the remaining doc-creating paths:

1. **`wrap-up/docs-health-integration.md` D2** — the missing-doc scaffolding path, covering the four Diátaxis genres. Detection answers a weaker question here than for ADRs, because the plugin prescribes content rather than filenames for these genres: it infers a path like `docs/guides/deploying-to-staging.md`, and prior art says whether this repo files how-tos under `docs/guides/` or `docs/how-to/`, and whether siblings are named `deploy-staging.md` or `NN-deploy-staging.md`. This is the softest, most-cuttable scope item if Phase 2 needs to be trimmed.
2. **`journeys/SKILL.md` Step 2** — currently the only doc-creating path with no approval gate at all: it writes `docs/journeys/{name}.md` directly. Journeys are plugin-native so prior art is unlikely to fire, but the missing gate is independently worth closing.
3. **`init/docs-structure.md`** — a read-only audit reporting which genres in this repo have conventions the plugin would collide with, plus de-asserting the `0001-chose-postgres.md` example. `/init` stays an assessor, not a writer — it creates only `docs/REGISTRY.md`, an invariant stated in three places (`decision-records.md:3`, `:41`, `docs-structure.md:122`). Do not make it scaffold `docs/decisions/`; that was considered and rejected in Phase 1.
4. One `doc-convention.{genre}` key per genre actually wired, added in the same change as its consumer — a key nothing reads is the same dangling-promise defect as a table row with no consumer.

## Acceptance Criteria

- [ ] D2's missing-doc scaffolding path runs prior-art detection for each of the four Diátaxis genres before writing, inferring a plausible path per the repo's own directory/filename conventions rather than the plugin's default.
- [ ] `journeys/SKILL.md` Step 2 has an approval gate before writing `docs/journeys/{name}.md`, following the same evidence-split/hard-rules/recording contract as the ADR path.
- [ ] `init/docs-structure.md` reports genre-convention collisions read-only, without scaffolding `docs/decisions/` or any other directory — it remains an assessor, never a writer, and still creates only `docs/REGISTRY.md`.
- [ ] The `0001-chose-postgres.md` example in `init/docs-structure.md` is de-asserted.
- [ ] Every `doc-convention.{genre}` key added to `policy.yml`/the declaration table has a real, wired consumer landed in the same change — no dangling-promise keys.
- [ ] Each new genre's Review Console row reuses the existing `[adr-convention]` row shape rather than inventing a new one, and the numbering/Approve-all rules amended in Phase 1 apply unchanged.

## Technical Approach

- Reuse `skills/_shared/prior-art-detection.md`'s existing procedure, evidence-split rule, hard rules, and recording contract as-is — this phase is about wiring more consumers to it, not changing the contract.
- Carry forward the Phase 1 lessons: never infer section shape from a corpus (measured 31-56% self-consistency where filenames were 100%); under 3 files agreeing is not a convention; a resolved path that already exists stops the write outright (no overwrite, no next-free-name).
- Reuse `_shared/diataxis-genre-templates.md`'s per-genre declaration table structure for the four Diátaxis genres rather than inventing a parallel structure.

## Gotchas

- D2 (item 1 above) is the softest and most-cuttable scope item if this needs to be trimmed for size — flag it first if that becomes necessary.
- Out of scope: reconciling repos with two parallel ADR series (independently incrementing numbers in `docs/decisions/` and `docs/infrastructure/decisions/`). The plugin targets one directory and should not guess which series a decision belongs to — same rationale as Phase 1.

## Original request

Phase 2: wire prior-art detection to the remaining doc-creating paths

Phase 2 of `docs/superpowers/specs/2026-08-07-doc-prior-art-detection-design.md`. Phase 1 shipped in 6.64.0 (#187) — the contract exists and ADR is its only wired consumer.

## What is already true

`skills/_shared/prior-art-detection.md` owns the procedure, the evidence-split rule, the hard rules and the recording contract. `_shared/diataxis-genre-templates.md` carries a per-genre declaration table. `doc-convention.adr` exists in `policy.yml`.

The table's other rows are marked `Phase 2` and say explicitly that **no consumer reads them yet** — so nothing is silently broken today. This record is what makes those rows real.

## Scope

- **`wrap-up/docs-health-integration.md` D2** — the missing-doc scaffolding path, covering the four Diátaxis genres. Detection answers a weaker question here than for ADRs, because the plugin prescribes content rather than filenames for those genres: it infers a path like `docs/guides/deploying-to-staging.md`, and prior art says whether this repo files how-tos under `docs/guides/` or `docs/how-to/`, and whether siblings are named `deploy-staging.md` or `NN-deploy-staging.md`. **This is the part most worth cutting if Phase 2 gets trimmed** — it is real but softer than the ADR case.
- **`journeys/SKILL.md` Step 2** — currently the only doc-creating path with **no approval gate at all**: it writes `docs/journeys/{name}.md` directly. Journeys are plugin-native so prior art is unlikely, but the missing gate is independently worth a look.
- **`init/docs-structure.md`** — a read-only audit reporting which genres in this repo have conventions the plugin would collide with, plus de-asserting the `0001-chose-postgres.md` example. **`/init` stays an assessor, not a writer** — it creates only `docs/REGISTRY.md`, an invariant stated in three places (`decision-records.md:3`, `:41`, `docs-structure.md:122`). Do not make it scaffold `docs/decisions/`; that was considered and rejected in Phase 1.
- One `doc-convention.{genre}` key per genre actually wired, added **in the same change as its consumer** — a key nothing reads is the same dangling-promise defect as a table row with no consumer.

## Carry forward from Phase 1

- **Never infer section shape from a corpus.** Measured 31-56% self-consistency where filenames were 100%.
- **Under 3 files agreeing is not a convention.** A one-file sample is where inference misleads.
- **A resolved path that already exists stops the write.** No overwrite, no next-free-name.
- The Review Console's `[adr-convention]` row is its first per-item row inside a batch section; a second genre's row should reuse that shape rather than invent another, and the numbering/Approve-all rules amended in Phase 1 already describe it.

## Out of scope

Reconciling repos with two parallel ADR series (independently incrementing numbers in `docs/decisions/` and `docs/infrastructure/decisions/`). The plugin targets one directory and should not guess which series a decision belongs to. Same rationale as Phase 1.
</content>

