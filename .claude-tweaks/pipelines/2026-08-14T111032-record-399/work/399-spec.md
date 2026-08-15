---
record: 399
origin: capture
risk: low
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 399: Reclassify ledger as a _shared format spec plus thin skill

Surface: backend

## Current State

`skills/ledger/` (247-line SKILL.md + `resolve-gate.md`) is consumed as a knowledge dependency, not an invoked skill: its own `## Invocation Model` (~line 227) states no parent skill ever invokes it through the Skill tool, and a repo-wide grep confirms zero `Skill(skill: "claude-tweaks:ledger")` call sites. Roughly 22 files carry "called by /ledger"-class wording that misdescribes the mechanism. The standalone half (`/ledger`, `/ledger resolve`) is real and exercised by 4 eval scenarios.

## Deliverables

- Move the ledger format contract (entry schema, statuses, resolve-gate rules) to `skills/_shared/ledger-format.md`, following expand-contract: create the new file, repoint every consumer, then shrink the skill.
- Keep a thin `/ledger` skill for the two standalone human commands, referencing the `_shared` contract.
- Sweep the ~22 citing files from "invoked/called by /ledger" wording to "per `_shared/ledger-format.md`".

## Acceptance Criteria

- The 4 ledger eval scenarios pass unchanged.
- A case-insensitive, content-anchored grep shows no remaining "called by /ledger"-class wording (output shown).
- `docs/skill-graph.md` edges updated; no consumer cites the old in-skill location for format rules.
- `npm test` passes — ledger phrasing may be pinned by pipeline tests (see Gotchas).

## Technical Approach

Contract relocation, not rewrite — move text verbatim where possible. Sequence per expand-contract: `_shared` file first, consumers second, skill-thinning last.

## Gotchas

- Ledger resolve Phase 2 is on `_shared/auto-mode-contract.md`'s never-silenced list — verify that contract's wording still resolves after the move; it is test-pinned (`tests/flow-run-dir-anchoring.test.js` references auto-mode-contract).
- `resolve-gate.md` is cited from `wrap-up` and `_shared/batched-item-drill.md` — those citations move to the new file's sections, not to the thinned skill.
- 22 is the audit's count, not a spec: derive the real sweep list by grep at build time (sweep-file-list-derivation lesson — grep every retired phrase variant, not the headline one).

## Original request

Reclassify ledger as a _shared format spec plus thin skill

**Related:** none

Context: Bloat audit: ledger's own Invocation Model section states no parent skill ever invokes it via the Skill tool — it is consumed as a knowledge dependency, and 22 files' "called by /ledger" wording is misleading.

Scope: move the format contract to _shared/ledger-format.md; keep a thin /ledger for the two standalone human commands (4 eval scenarios exercise them); sweep the wording across the 22 citing files.
