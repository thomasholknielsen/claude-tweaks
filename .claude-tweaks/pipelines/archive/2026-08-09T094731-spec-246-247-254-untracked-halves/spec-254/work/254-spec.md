---
record: 254
origin: capture
risk: medium
effort: medium
ceremony: standard
grants: []
surface: backend
---
# 254: Flaky under CI: writeRunState concurrency test races the lock's 500ms fail-open

Surface: backend

## Current State

`tests/hooks-context.test.js:141` ("writeRunState serializes concurrent writers — no lost updates under real cross-process concurrency (finding regression)") failed on CI for release v6.73.0 (`53e8924d`) while the identical code tree passed CI six minutes earlier (`917845b7`, PR #253 merge). The only intervening commits were a spec-file archival move and the release version-bump trio; neither touches hooks code.

The test asserts a strict no-lost-updates guarantee, but `bin/lib/hooks/context.js`'s `acquireRunStateLock` is deliberately fail-open: `LOCK_WAIT_MS = 500` (context.js:134) caps total lock wait, after which the writer proceeds unlocked (documented posture: never break a session over bookkeeping state). Diagnosis — inferred from the CI output, not yet reproduced: under 8 workers × 40 iterations on a slow shared 2-core CI runner, a writer can exhaust the 500ms budget, take a stale snapshot, and clobber another writer's field, matching what CI observed (`seed` lost; `expected: true, actual: undefined`). On fast local machines contention never approaches the budget, so the test reliably passes there. The test and the implementation disagree about the contract: implementation = best-effort serialization with a bounded wait; test = unconditional serialization.

## Deliverables

1. A reproduction (or instrumented disproof) of the diagnosis: demonstrate the fail-open path being taken under contention sized to the CI profile (constrained cores, scaled worker/iteration counts, or injected lock-hold latency), so the contract decision rests on observed behavior rather than inference from one CI sample.
2. An explicit contract decision, recorded in the change: either (a) the lock guarantees serialization for this workload — raise/remove/scale the wait cap and keep the strict test — or (b) it is best-effort — rewrite the test to tolerate the documented fail-open (assert no torn JSON plus seed survival under a workload sized inside the budget, or inject a test-only unbounded-wait mode).
3. The fail-open branch's comment in `context.js` updated if the contract changes — its cause list now demonstrably includes CI-runner contention (IL-92).

## Acceptance Criteria

- The chosen contract holds on the CI runner profile (2-core shared) — "passes locally" is not the bar; the demonstration is a CI run (or a locally core-constrained equivalent) of the final test.
- No sleep-based tuning that just makes the race rarer.
- The test's expectation is derived independently of the implementation's timing constants (IL-62) — no assertion that encodes `LOCK_WAIT_MS`.
- `npm test` passes; the hooks dispatcher's garbage-stdin invariant and the never-break-a-session posture are unchanged.
- If contract (a): the strict test remains and the rationale for the new wait behavior is stated at the lock site. If contract (b): the replacement test provably discriminates — revert-the-fix check (verify-test-discrimination-by-reverting): it must fail against a build that tears JSON or drops a field inside the sized workload, and must still catch the original defect class the test's "(finding regression)" suffix records.

## Technical Approach

Reproduce first: scale contention (worker count × iterations, or a test-only injected lock-hold delay) until the fail-open path is observably taken, confirming the mechanism before choosing the contract. Then read the test's introducing commit — the "(finding regression)" suffix means it was guarding a real prior defect; whichever contract is chosen must keep discriminating against that original defect class. The plugin's documented posture (fail-open, never block a session over bookkeeping) argues for (b), but that call is the build's to make against the evidence, not this record's.

### Key Files

- bin/lib/hooks/context.js
- tests/hooks-context.test.js

## Gotchas

- IL-62: don't derive the test's expectation from the implementation's own timing constants.
- IL-92: the fail-open branch's comment ("a missed lock just reopens the pre-existing race") now demonstrably includes CI as a cause reaching it — update it if the contract changes.
- First observed on the very first red of the brand-new CI gate (#232) — the gate is working as designed; this is signal, not noise.
- IL-112: the red asserts both that the code races and that the test harness is sound — reproduce under constraint rather than reasoning from the single CI sample before committing to either contract.

## Build Finding — Reproduction

Ran the existing 8×40 workload against a throwaway one-off script with `CLAUDE_TWEAKS_LOCK_WAIT_MS=1`, using the same `context.js` (Task 1's atomic-write + env-knob changes already applied). Two runs, same result each time:

```
=== REPRODUCTION RESULT (budget=1ms) ===
parseable: YES
seed: true
w0: 40 OK
w1: 40 OK
w2: 40 OK
w3: 40 OK
w4: 40 OK
w5: 40 OK
w6: 40 OK
w7: 39 LOST/WRONG
```

- Lost update confirmed: `w7` ended at 39 instead of 40 (one of its writer's 40 patches was clobbered by a stale-snapshot write from another unlocked writer). `seed` survived in both runs.
- The final `run-state.json` parsed as valid JSON both times — no torn file, confirming the atomic temp-file + rename from Task 1 holds even when writers race fully unlocked (budget=1ms means nearly every writer times out the lock almost immediately).
- Diagnosis confirmed: the fail-open path is real and demonstrably loses field updates under contention, exactly as the CI failure indicated. Proceeding with contract (b) as planned.

## Build Finding — Discrimination Check

Temporarily reran the strict test's workload (`tests/hooks-context.test.js`, "...serializes concurrent writers under an effectively-unbounded lock budget...") with `CLAUDE_TWEAKS_LOCK_WAIT_MS` set to `'0'` instead of `'60000'`. Result: **FAILED** as required — a `w{i}` field assertion failed (lost update), confirming the strict assertions still discriminate against the original no-serialization defect. Restored the test to `'60000'` before commit.

## Original request

Flaky under CI: writeRunState concurrency test races the lock's 500ms fail-open

## Problem

`tests/hooks-context.test.js` — "writeRunState serializes concurrent writers — no lost updates under real cross-process concurrency" — failed on CI for release v6.73.0 (`53e8924d`) while the identical code tree passed CI six minutes earlier (`917845b7`, PR #253 merge). The only intervening commits were a spec-file archival move and the release version-bump trio; neither touches hooks code.

## Diagnosis

The test asserts a **strict** no-lost-updates guarantee, but `bin/lib/hooks/context.js`'s `acquireRunStateLock` is deliberately **fail-open**: `LOCK_WAIT_MS = 500` caps total lock wait, after which the writer "proceeds unlocked" (documented posture: never break a session over bookkeeping state). Under 8 workers × 40 iterations on a slow shared CI runner, a writer can exhaust the 500ms budget, take a stale snapshot, and clobber another writer's field — exactly what CI observed (`seed` lost, `expected: true, actual: undefined`). On fast local machines contention never approaches the budget, so the test reliably passes there.

The test and the implementation disagree about the contract: implementation = best-effort serialization with a bounded wait; test = unconditional serialization.

## Acceptance criteria

- Decide the contract explicitly: either the lock guarantees serialization for this workload (then raise/remove the wait cap or scale it to contention, and keep the strict test), or it is best-effort (then the test must tolerate the documented fail-open, e.g. assert no *torn* JSON and seed survival under a workload sized inside the budget, or inject a test-only unbounded-wait mode).
- Whichever way: the CI runner profile (2-core shared) is the environment the guarantee must hold in — "passes locally" is not the bar.
- No sleep-based tuning that just makes the race rarer.

## Gotchas

- IL-62: don't derive the test's expectation from the implementation's own timing constants.
- IL-92: the fail-open branch's comment ("a missed lock just reopens the pre-existing race") now demonstrably includes CI as a cause reaching it — update it if the contract changes.
- First observed on the very first red of the brand-new CI gate (#232) — the gate is working as designed; this is signal, not noise.
