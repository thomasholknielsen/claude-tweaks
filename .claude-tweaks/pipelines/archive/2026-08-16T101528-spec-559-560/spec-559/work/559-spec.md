---
record: 559
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
fingerprint: merge-verification:merge-verification-policy-key-derivation-ladder-and-manifest
blocked-by: [533]
surface: backend
---
# 559: merge-verification: policy key, derivation ladder, and Manifesto lever

Surface: backend

## Overview

Add the `merge-verification` policy key — the lever governing how much CI verification a merge into the integration branch requires — with its default derived in code, plus its Manifesto lever row. This unit is schema + derivation + docs + tests only: no consumer behavior changes (that is the follow-up sub-issue #560 in this decomposition).

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No merge-site behavior changes (#560 makes dispatch/flow/resume act on the lever)
- No red-tip detection (#561; that check is unconditional, not policy-gated)
- No per-branch policy maps — the lever is a scalar by design (see parent #558's Decision Rationale)
- Never installs or edits branch protection/rulesets in any repo
- Detection is GitHub Actions-only by intent: PR-CI detection reads `.github/workflows/` and nothing else. A repo on another CI system derives `off` and opts in with the one-line explicit value.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #533 | Policy schema human-facing metadata (summary/category/tier) and resolve-policy --all | bot:in-progress |

**Blocker semantics:** hard — do not start until #533 closes (it is `bot:in-progress` on the same three files). When it lands, include its new per-key metadata fields on this key. If #533 closes *without* shipping its schema shape, proceed against the pre-#533 schema shape as it stands at build time.

## Current State

- Schema: `bin/lib/policy-schema.js` — key definitions with enums/defaults, including the existing `integration-branch` key; documented for humans in `skills/_shared/policy-schema.md` (which also carries the `worktree.always` coverage block pinned by `tests/hooks-gate-coverage.test.js` — do not disturb)
- Resolver: `bin/resolve-policy.js` — resolves keys with computed defaults; `integration-model`'s forge-detection ladder (`skills/_shared/forge-detection.md`, run in code via `detectIntegrationModel(root)`) is the precedent for a derived default
- Integration branch: `skills/_shared/integration-branch.md` is the canonical resolution ladder (policy.yml → git upstream → GitHub default → inference); `tests/integration-branch-conformance.test.js` fails on any new resolution site that does not cite it
- Manifesto: `skills/flow/manifesto.md` — Policy levers table, one row per lever, Options column with the recommended value bolded
- Policy home: `.claude-tweaks/policy.yml` (the only config home since 6.48.0)
- Tests: `tests/resolve-policy-cli.test.js`, `tests/bin-lib/` suites for schema modules

## Deliverables

- [ ] `merge-verification` key in `bin/lib/policy-schema.js`: enum `merge-when-green | wait | off`, default derived (no static default value). `wait` is deliberately unreachable via derivation — it is explicit-config-only (and the runtime fallback #560 degrades to when auto-merge arming fails); do not "fix" the ladder to produce it.
- [ ] Derivation ladder in the resolver, exactly four branches, first match wins (short-circuit, no fall-through): (1) `integration-model` (`skills/_shared/integration-model.md`) resolves `local-merge` → `off`; (2) no PR-triggered CI detected → `off`; (3) integration branch is the repo default branch → `merge-when-green`; (4) non-default integration branch → `off`
- [ ] Branches (3)/(4) obtain the integration branch and repo default branch via the existing canonical resolution (`skills/_shared/integration-branch.md`'s ladder / the `integration-branch` policy key already in `bin/lib/policy-schema.js`) — never a hand-rolled branch detection; cite the fragment so `tests/integration-branch-conformance.test.js` passes. A failed lookup (no `gh`, API error, no upstream) resolves toward `off`, same as detection failure.
- [ ] PR-CI detection: a workflow file under `{root}/.github/workflows/*.yml` whose `on:` includes `pull_request` or `pull_request_target` in any legal YAML shape — bare string (`on: pull_request`), array (`on: [push, pull_request]`), or mapping key (`on: { pull_request: {...} }`). Takes the same `root` parameter as `detectIntegrationModel`. Trigger *presence* is a deliberate proxy for "CI verification is requested," not "enforced" — enforcement (branch protection) is out of scope by design. Any read/parse failure resolves toward `off` (fail toward the default, never toward the stricter value).
- [ ] Coverage block for the key in `skills/_shared/policy-schema.md`
- [ ] Lever row in `skills/flow/manifesto.md`'s Policy levers table, Options column listing all three values with **merge-when-green** bolded as recommended
- [ ] Tests covering each of the four ladder branches plus explicit-value precedence; the workflow reader and branch lookup are injectable parameters (same root/injection pattern the `detectIntegrationModel` tests use) so branch (1)'s short-circuit is assertable with a reader that throws

## Acceptance Criteria

1. Fixture-pinned: a fixture repo with a `pull_request`-triggered workflow and integration branch = default branch resolves `merge-when-green`; as a live build-time smoke, `node bin/resolve-policy.js --values merge-verification` on this repo prints the same (this half is valid at build time, drift-sensitive later — the fixture is the durable check).
2. An explicit `merge-verification: off` in `.claude-tweaks/policy.yml` wins over the derivation (CLI prints `off`).
3. In a fixture with `integration-model: local-merge`, the resolver prints `off`, and a test injecting a throwing workflow-reader proves branch (1) short-circuits before any workflow read.
4. In a fixture with workflows but no `pull_request`/`pull_request_target` trigger in any shape, the resolver prints `off`; a fixture using the array form `on: [push, pull_request]` resolves as CI-detected.
5. `node --test` passes for the new suite; each ladder-branch test fails when its branch's condition is inverted (verify by temporarily flipping one branch during authoring).

## Technical Approach

Mirror `integration-model`'s computed-default implementation shape: schema entry marks the default as derived; the resolver computes it once per read. Never restate the ladder in prose anywhere except the `skills/_shared/policy-schema.md` coverage block (single-statement rule — CLAUDE.md cross-references convention).

### Data / API Surface

- Key: `merge-verification`, enum `['merge-when-green','wait','off']`, scope: repo policy + per-run Manifesto override, precedence per `_shared/auto-mode-contract.md` (CLI arg > pipeline config > project policy > skill default/derivation).
- Resolver output: the bare value on stdout via `--values merge-verification`, one per line, same contract as existing keys. #560 consumes exactly this contract — re-verify it there if this sub-issue's implementation changes it.

### Key Files

- `bin/lib/policy-schema.js` — key definition
- `bin/resolve-policy.js` (and/or its lib module, matching where `integration-model`'s ladder lives) — derivation ladder
- `skills/_shared/policy-schema.md` — coverage block
- `skills/_shared/integration-branch.md` — cited (not edited) as the branch-resolution source
- `skills/flow/manifesto.md` — lever row
- `tests/` — new ladder suite (place beside the existing resolve-policy tests)

### Package Dependencies

- none (Node built-ins only, per repo convention)

## Gotchas

- **#533 is `bot:in-progress` on the same three files** (`policy-schema.js`, `resolve-policy.js`, `_shared/policy-schema.md`) — hard blocker; see Prerequisites for the exact semantics.
- #537 (open, not started) also names `skills/_shared/policy-schema.md` in its Key Files — coordinate at merge time, no logical dependency.
- Any file naming `integration-model` must cite `skills/_shared/integration-model.md`, and any branch-resolution site must cite `skills/_shared/integration-branch.md` — `tests/integration-model.test.js` and `tests/integration-branch-conformance.test.js` enforce both repo-wide.
- `skills/flow/manifesto.md` rows follow the bolded-recommendation Options convention (`docs/skill-authoring.md`, Multi-item decisions) — copy an existing row's shape.
- Run the full `npm test` before merging — conformance tests pin prose far from the edited files, and markdown-only diffs are not exempt.

## Decision Rationale

See parent #558's Decision Rationale (scalar-not-map, detect-don't-install, rejected alternatives). Subsequent sub-issues in this decomposition reference it there.

<!-- work-fingerprint: merge-verification:merge-verification-policy-key-derivation-ladder-and-manifest -->

## Architecture Deviations (build — /claude-tweaks:build Common Step 4.5)

| # | What the spec said | What was built | Classification |
|---|---|---|---|
| 1 | Derivation ladder in `bin/resolve-policy.js` "and/or its lib module, matching where `integration-model`'s ladder lives" (`bin/lib/policy-schema.js`) | New flat sibling `bin/lib/merge-verification.js`; `resolve-policy.js` wires it like `integration-model` | Beneficial — the ladder reuses `bin/lib/hooks/worktree-reap.js`'s `resolveIntegrationBranch` (the shared `_shared/integration-branch.md` resolver, per this spec's own Deliverable 3), and `worktree-reap.js → bin/lib/policy.js → policy-schema.js` makes that a require cycle inside `policy-schema.js`. Recorded in the module header. |
| 2 | Deliverables named only `skills/flow/manifesto.md`'s lever row | Also `skills/_shared/auto-mode-contract.md`, `skills/flow/SKILL.md`, `skills/help/reference-card.md`, `skills/help/context-flow.md`, `skills/help/policy.md` | Beneficial — required by `_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist, which the spec did not cite (learning staged for `/claude-tweaks:specify`). |
| 3 | "include #533's new per-key metadata fields on this key" (tier unspecified) | `tier: 'advanced'` | Update the spec (note only) — the core tier is at its enforced cap of 12 (`tests/policy-schema-metadata.test.js`); by the decision rule the key is core-shaped. Recorded in the schema comment. |
