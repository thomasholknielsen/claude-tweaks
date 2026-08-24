---
record: 963
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 963: 8 pre-existing node --test failures unrelated to routine pause/resume (#213)

Surface: backend

## Current State

While running full `npm test` verification during #213's build, 8 `node --test` failures appeared across `tests/console-execute.test.js`, `tests/hooks-dispatcher.test.js` (×3), `tests/reconcile.test.js` (×2), `tests/bin-lib/reconcile/prune-remote.test.js`, and `tests/impeccable-plugin-contract.test.js`. Deterministic across repeated isolated re-runs of the affected files — confirmed not machine-load flakiness (CLAUDE.md's run-to-run variance caveat doesn't apply here, since the same 8 named tests fail every time). None of the failing files intersect anything #213's own diff touched (`plugin/skills/routine/**`, `tests/routine-*.test.js`, four docs files). Related: #213.

## Deliverables

- [ ] Triage `tests/impeccable-plugin-contract.test.js`'s "the installed plugin matches the pinned version" failure — likely environment-specific (compares the sandbox's installed Impeccable plugin cache against `tools/upstream-drift/manifest.yml`'s pin); confirm whether it's a sandbox-state issue rather than a code defect.
- [ ] Triage the remaining 7 failures (`tests/console-execute.test.js`, `tests/hooks-dispatcher.test.js` ×3, `tests/reconcile.test.js` ×2, `tests/bin-lib/reconcile/prune-remote.test.js`) individually — `reconcile()`/`console-execute`/`hooks-dispatcher`/`prune-remote` cover record-worktree failure reporting, gate-denial-on-unwritable-run-dir, `gatherSignals` shape, CLI entrypoint flags, `archiveRunDir` error handling, the pr-first console-check wiring, and the remote-prune dispatch reachability check — confirm sandbox-state vs. genuine regression for each.
- [ ] For each confirmed genuine regression, either fix it or file it as its own scoped follow-up record; for each confirmed sandbox-state issue, document why (and, if fixable, make the test environment-independent).

## Acceptance Criteria

1. Each of the 8 failing tests is classified as either "sandbox-state, not a code defect" (with a stated reason) or "genuine regression" (with a fix or a linked follow-up record).
2. `tests/impeccable-plugin-contract.test.js`'s version-pin check is confirmed as environment-dependent or fixed to be environment-independent.
3. `npm test` run in isolation (`node --test path/to/file.test.js` per affected file) is documented for each of the 8, per CLAUDE.md's own re-run-in-isolation convention, distinguishing genuine failure from load-related flake.
4. Any genuine regressions found are either fixed with `npm test` passing, or filed as scoped follow-up records referenced from this one.

## Technical Approach

This record is explicitly a triage task, not a pre-diagnosed fix — the original report already ran the isolation check (repeated re-runs of the affected files, deterministic failure) that rules out load-based flakiness per CLAUDE.md's own tolerance rule. The work is per-test root-cause investigation across four distinct subsystems (`console-execute`, `hooks-dispatcher`, `reconcile`, `impeccable-plugin-contract`), so expect this to fan out into either fixes or several small follow-up records rather than a single patch.

### Key Files

- `tests/console-execute.test.js`, `tests/hooks-dispatcher.test.js`, `tests/reconcile.test.js`, `tests/bin-lib/reconcile/prune-remote.test.js`, `tests/impeccable-plugin-contract.test.js` — the 8 failing test cases to triage
- `tools/upstream-drift/manifest.yml` — the version pin `impeccable-plugin-contract.test.js` compares against

## Gotchas

- Don't conflate this with #213's own scope — none of these 8 failures intersect #213's diff; this is explicitly pre-existing, deferred breakage.
- Follow CLAUDE.md's own isolation-rerun convention exactly (`node --test path/to/file.test.js`) when re-confirming each failure, since a fleet of concurrent sibling sessions can otherwise make a genuine regression look like load-related flake or vice versa.

## Original request

8 pre-existing node --test failures unrelated to routine pause/resume (#213)

**Related:** #213

Context: Found while running full `npm test` verification during record #213's build — 8 `node --test` failures across `tests/console-execute.test.js`, `tests/hooks-dispatcher.test.js` (x3), `tests/reconcile.test.js` (x2), `tests/bin-lib/reconcile/prune-remote.test.js`, and `tests/impeccable-plugin-contract.test.js`. Deterministic across repeated isolated re-runs of the affected files (not machine-load flakiness — CLAUDE.md's own caveat about run-to-run variance doesn't apply here since the same 8 named tests fail every time); none of the failing files intersect anything #213's diff touched (`plugin/skills/routine/**`, `tests/routine-*.test.js`, four docs files).

Scope: Triage per failing test. `tests/impeccable-plugin-contract.test.js`'s "the installed plugin matches the pinned version" looks environment-specific (compares this sandbox's installed Impeccable plugin cache against `tools/upstream-drift/manifest.yml`'s pin) rather than a code defect; the other seven (`reconcile()`/`console-execute`/`hooks-dispatcher`/`prune-remote` — record-worktree failure reporting, gate-denial-on-unwritable-run-dir, gatherSignals shape, CLI entrypoint flags, archiveRunDir error handling, the pr-first console-check wiring, and the remote-prune dispatch reachability check) need root-cause triage to confirm sandbox-state vs. a real regression.

Defer-reason: pre-existing-outside-diff

