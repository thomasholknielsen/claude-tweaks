---
record: 104
origin: human
risk: low
size: low
ceremony: standard
grants: []
surface: backend
---
# 104: Test suite flaps under parallel-agent load — hooks/perf tests fail nondeterministically

Surface: backend

## Current State

`npm test` fails nondeterministically when other agents are running concurrently. Four runs of the SAME code in one session:

| Run | Failures | Duration |
|---|---|---|
| 1 (unmodified `main`) | 3 | 535s |
| 2 | 0 | 191s |
| 3 | 10 | - |
| 4 (identical code to run 3) | 1 | 524s |

Runs 3 and 4 tested byte-identical code and differ by 9 failures. Failure count tracks wall-clock duration, i.e. machine load, not code.

Run the affected files in isolation and they pass 40/40:

    node --test tests/hooks-pre-tool-use.test.js tests/hooks-worktree-detect.test.js

**Affected tests:** all of `tests/hooks-pre-tool-use.test.js` (worktree-required denies, exit:0 invariant, compound-Bash write check, worktree.always nudge), `tests/hooks-worktree-detect.test.js:39` and `:~50` (repoInfo linked-worktree and submodule cases), and `tests/statusline.test.js`'s "end-to-end: render under 1000ms (best of 7, absorbs load contention)".

The hooks tests spawn temp git repos and shell out; under load they time out or observe a half-built repo. Observed symptoms: hook stdout `undefined` ("Cannot read properties of undefined (reading 'hookSpecificOutput')") after 7.4s, and `repoInfo` returning `{isLinkedWorktree:false, repoRoot:null}` after 12.1s for a worktree it should resolve.

A green suite is the merge gate. Right now a clean branch can show up to 10 failures purely because sibling agents are busy, and an agent that trusts the number will either chase a phantom regression or, worse, dismiss a real one as "just the flake". This already cost one agent a full diagnostic detour.

## Deliverables

- [ ] Make the temp-git hooks tests robust under load — raise/remove per-test timeouts, or serialize the temp-repo suites via a lock (pick whichever mechanism actually eliminates the observed `undefined`/half-built-repo symptoms; both are acceptable, the failure symptoms above are the check).
- [ ] Either make `tests/statusline.test.js`'s "end-to-end: render under 1000ms" assertion load-aware, or move it out of the default `npm test` into an opt-in perf run (this project already has a separate `npm run test:perf` path for timing budgets — see `docs/plugin-structure.md`; prefer relocating there over inventing a new mechanism if the assertion can't be made load-aware).
- [ ] Add a short note to CLAUDE.md so future agents know a loaded `npm test` run (failures that vary run-to-run on byte-identical code, tracking wall-clock duration rather than code changes) is not a regression signal, and that the correct response is to re-run the affected files in isolation before concluding anything.

## Acceptance Criteria

1. `npm test` passes repeatably while 2+ sibling agents are active — run it at least twice concurrent with other load and confirm the same pass/fail set both times.
2. No test in the default `npm test` suite asserts a wall-clock threshold, or any that does is explicitly quarantined (moved to `npm run test:perf` or made load-aware with a documented absorption mechanism).
3. `tests/hooks-pre-tool-use.test.js` and `tests/hooks-worktree-detect.test.js` pass under artificial load (e.g. run alongside a CPU-bound background process) with the same pass/fail set as isolated `node --test tests/hooks-pre-tool-use.test.js tests/hooks-worktree-detect.test.js`.
4. CLAUDE.md carries a note about load-induced test flakiness and the re-run-in-isolation procedure, discoverable by an agent debugging an unexpected `npm test` failure.

## Technical Approach

Two independent failure classes, per the Current State evidence:

1. **Hooks tests (`tests/hooks-pre-tool-use.test.js`, `tests/hooks-worktree-detect.test.js`)** spawn temporary git repos and shell out to git commands per test. Under load, these either exceed an implicit/explicit per-test timeout or read a git repo mid-initialization (the `repoInfo` `{isLinkedWorktree:false, repoRoot:null}` symptom). Fix by identifying where these tests set up temp repos and either (a) raising or removing timeouts so slow-but-correct execution isn't misread as failure, or (b) serializing the temp-repo-creating tests behind a lock so concurrent sibling `npm test` runs don't contend for the same filesystem/process resources. Choose based on which mechanism the actual root cause calls for — a timeout fix doesn't help if the real problem is a race in repo setup, and vice versa.
2. **`tests/statusline.test.js`'s wall-clock assertion** ("render under 1000ms (best of 7, absorbs load contention)") already tries to absorb load via best-of-7, but the observed failures show that isn't enough under real contention. Either raise its threshold/sampling to genuinely absorb load, or move it to `npm run test:perf` (already excluded from `npm test` per `docs/plugin-structure.md`) since a wall-clock budget assertion is inherently not appropriate for a default correctness suite that runs concurrently with other agents.

### Key Files

- `tests/hooks-pre-tool-use.test.js` — worktree-required denies, exit:0 invariant, compound-Bash write check, worktree.always nudge tests; find and adjust the temp-repo setup/timeout handling
- `tests/hooks-worktree-detect.test.js` — `repoInfo` linked-worktree (line ~39) and submodule (line ~50) cases
- `tests/statusline.test.js` — "end-to-end: render under 1000ms" assertion
- `CLAUDE.md` — add the load-flakiness note (this project's own CLAUDE.md, at the root)

## Gotchas

- Failure count tracks wall-clock duration, not code correctness — confirmed by two runs of byte-identical code (Runs 3 and 4) producing 10 vs. 1 failures. Any fix must be validated by re-running under real concurrent load, not just by reading the code and reasoning it should work.
- The affected hook tests pass 40/40 in isolation (`node --test tests/hooks-pre-tool-use.test.js tests/hooks-worktree-detect.test.js`) — use this as the pre-fix baseline and re-run it after any change to confirm nothing regressed in the non-loaded case.
- Don't just raise timeouts blindly without confirming that's actually the bottleneck — the `repoInfo` returning null after 12.1s suggests some cases may be a race/half-built-repo read rather than a pure timeout, which a longer timeout alone wouldn't fix.

## Original request

Test suite flaps under parallel-agent load — hooks/perf tests fail nondeterministically

Labels: type:bug, priority:low, risk:low, effort:low

## Current State

`npm test` fails nondeterministically when other agents are running concurrently.
Four runs of the SAME code in one session:

| Run | Failures | Duration |
|---|---|---|
| 1 (unmodified `main`) | 3 | 535s |
| 2 | 0 | 191s |
| 3 | 10 | - |
| 4 (identical code to run 3) | 1 | 524s |

Runs 3 and 4 tested byte-identical code and differ by 9 failures. Failure count
tracks wall-clock duration, i.e. machine load, not code.

Run the affected files in isolation and they pass 40/40:

    node --test tests/hooks-pre-tool-use.test.js tests/hooks-worktree-detect.test.js

## Affected tests

All of `tests/hooks-pre-tool-use.test.js` (worktree-required denies, exit:0
invariant, compound-Bash write check, worktree.always nudge),
`tests/hooks-worktree-detect.test.js:39` and `:~50` (repoInfo linked-worktree and
submodule cases), and `tests/statusline.test.js`'s
"end-to-end: render under 1000ms (best of 7, absorbs load contention)".

The hooks tests spawn temp git repos and shell out. under load they time out or
observe a half-built repo. Observed symptoms: hook stdout `undefined`
("Cannot read properties of undefined (reading 'hookSpecificOutput')") after
7.4s, and `repoInfo` returning `{isLinkedWorktree:false, repoRoot:null}` after
12.1s for a worktree it should resolve.

## Why it matters

A green suite is the merge gate. Right now a clean branch can show up to 10
failures purely because sibling agents are busy, and an agent that trusts the
number will either chase a phantom regression or, worse, dismiss a real one as
"just the flake". This already cost one agent a full diagnostic detour.

## Deliverables

- Make the temp-git hooks tests robust under load (raise/remove per-test
  timeouts, or serialise the temp-repo suites via a lock).
- Either make the statusline perf assertion load-aware or move it out of the
  default `npm test` into an opt-in perf run.
- Add a short note to CLAUDE.md so future agents know a loaded run is not a
  regression signal, and to re-run affected files in isolation before concluding.

## Acceptance Criteria

- `npm test` passes repeatably while 2+ sibling agents are active.
- No test in the default suite asserts a wall-clock threshold, or any that does
  is explicitly quarantined.
