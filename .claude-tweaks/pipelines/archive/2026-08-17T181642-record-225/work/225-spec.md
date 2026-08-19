---
record: 225
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 225: Residue worktree rows can't distinguish a live session from an abandoned lock

Surface: backend

## Current State

`bin/lib/residue/scope.js` parses each worktree's `lockReason` — which carries the owning pid, e.g. `claude session foo (pid 16478 ...)` — and `bin/lib/residue/probes/worktrees.js` discards it before the finding is emitted.

Consequence: every wrap-up on a repo with parallel sessions (the norm here, per CLAUDE.md) surfaces one `NEEDS DISPOSITION` row per sibling worktree, and the row carries nothing that would let a reader tell a live session from an abandoned lock. The invariant answer is "Accept — another session's live worktree". Measured on this repo today: 2 rows, 100% of the sweep's output, both reflexive.

No lever removes the prompt. `unattended-tier`'s floor doesn't match this case, and `--scope blast-radius` would drop the rows only by also dropping a red suite — which is why `residue-sweep.md` mandates `--scope repo`.

A gate that asks the same wrong question every run is how a reader learns to skim the table it protects — the exact failure the Outstanding table exists to prevent.

## Deliverables

- `bin/lib/residue/probes/worktrees.js` carries `lockReason` (or its parsed pid) through into the finding's evidence instead of discarding it.
- The probe (or a caller) `ps`-checks the extracted pid so a finding backed by a live session renders differently in the sweep's output from one backed by a stale/abandoned lock.

## Acceptance Criteria

- [ ] A residue sweep run against a repo with a sibling worktree whose lock pid is currently running shows the pid (or equivalent evidence) in the `NEEDS DISPOSITION` row.
- [ ] The same sweep visibly distinguishes a row backed by a live pid from a row backed by a pid that is no longer running.
- [ ] Existing residue-sweep tests continue to pass; a new test covers both the live-pid and stale-pid cases.

## Technical Approach

Thread the `lockReason` string already parsed by `bin/lib/residue/scope.js` through into `bin/lib/residue/probes/worktrees.js`'s finding evidence instead of dropping it. Extract the pid from `lockReason` and run a `ps`-based liveness check against it, then differentiate the finding's evidence/verdict for a live pid versus a pid that no longer exists.

## Gotchas

- `dedup.decide` was named in the original design as the mitigation for backlog inflation from repeated findings like this one, but it's never wired — ledgers are per-run, so there is no cross-run suppression and the same rows recur indefinitely across runs. This record does not fix that; it only makes the row itself informative when it does appear. Worth a separate record if cross-run suppression is wanted.
- The pid-liveness check needs to fail toward "can't confirm liveness" rather than crashing the sweep if `lockReason`'s format is ever unexpected or the pid no longer parses cleanly.

## Original request

Residue worktree rows can't distinguish a live session from an abandoned lock

`bin/lib/residue/scope.js` parses each worktree's `lockReason` — which carries the owning pid, e.g. `claude session foo (pid 16478 ...)` — and `bin/lib/residue/probes/worktrees.js` discards it.

Consequence: every wrap-up on a repo with parallel sessions (the norm here, per CLAUDE.md) surfaces one `NEEDS DISPOSITION` row per sibling worktree, and the row carries nothing that would let a reader tell a live session from an abandoned lock. The invariant answer is 'Accept — another session's live worktree'. Measured on this repo today: 2 rows, 100% of the sweep's output, both reflexive.

No lever removes the prompt. `unattended-tier`'s floor doesn't match, and `--scope blast-radius` would drop them only by also dropping a red suite — which is why `residue-sweep.md` mandates `--scope repo`.

**Why this matters more than its size:** a gate that asks the same wrong question every run is how a reader learns to skim the table it protects. That is the exact failure the Outstanding table was built to prevent.

**Fix direction:** include `lockReason` in the finding's evidence, and/or `ps`-check the pid so a live session renders differently from a stale lock. Related: `dedup.decide` was named in the design as the mitigation for backlog inflation and is never wired — ledgers are per-run, so there is no cross-run suppression, and the same rows recur indefinitely.

Found by the whole-branch review of 6.69.0. Deferred deliberately — it is design residue, not a regression.
