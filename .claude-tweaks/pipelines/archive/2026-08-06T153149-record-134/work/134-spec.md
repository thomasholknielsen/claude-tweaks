---
record: 134
origin: human
risk: medium
effort: medium
ceremony: standard
grants: []
surface: backend
---
# 134: git-exec's 3s timeout makes the worktree.always gate fail open under load (surfacing as tests/hooks-* flakes)

Surface: backend

## Current State

`bin/lib/hooks/git-exec.js`'s `execGit` — the single git-spawn wrapper behind `worktree-detect.js`, `pre-tool-use.js` and `post-tool-use.js` — runs every git query with a fixed `timeout: 3000` and a bare `catch { return null }`.

A measurement pass (see this record's comment thread for the full method and data) established three things:

1. **The budget has no headroom.** The production `rev-parse` call's maximum observed duration scales monotonically with machine load: 411 ms idle → 752 ms (one competing suite) → 1856 ms (three) → **2492 ms (24 workers + two suites), or 83% of the budget**. This repo's normal working mode is several parallel worktree sessions.
2. **It is latency, not resource exhaustion.** Across 1000+ instrumented spawns at every load level (peak load average 10.63 on 12 cores): zero `EAGAIN`, zero `ENOMEM`, zero spawn refusals. The OS never declined to fork.
3. **The timeout fires in practice.** The simplest test in `hooks-worktree-detect.test.js` (`mkdtemp` + `git init` + `git commit` + one `repoInfo` call) was observed taking **5904 ms** and returning `repoRoot: null`. Measured fixture spawns peak at 2884 ms; 2.9 s of fixture plus a fully-consumed 3.0 s timeout is 5.9 s.

**The consequence is not confined to tests.** `execGit` returning `null` makes `repoInfo()` return `repoRoot: null`, and `pre-tool-use.js:102` reads that as `if (!repoRoot) continue; // not a git repo at all -> allow`. That comment names one cause; a `git rev-parse` timeout is a second, load-dependent cause reaching the same fail-open branch. Under load the `worktree.always` gate therefore **silently stops denying**.

This is directly evidenced, not inferred: of the failures reproduced during the measurement pass, four were exactly the tests asserting the gate *denies* — `denies Edit in the main checkout`, `denies Write to a not-yet-existing file`, `denies a bare "git push"`, and `deny paths always carry exit: 0`. They failed because the gate allowed. The test flakiness in this record's original framing is the *observable symptom* of an enforcement gap, not the defect itself.

Reproduction is probabilistic, not a clean threshold: three identical full suites launched together produced 5 failures, 0, and 0 — the failing run was the one overlapping peak contention.

## Deliverables

1. **`bin/lib/hooks/git-exec.js`** — make the failure kind visible to callers instead of collapsing timeout, spawn refusal, git error and partial output into one indistinguishable `null`, and resolve the budget question (raise, make adaptive, or justify keeping 3000 ms) against the measured 83%-of-budget figure.
2. **`bin/lib/hooks/pre-tool-use.js`** — stop conflating "this is not a git repo" (permanent, knowable) with "I could not determine whether it is" (transient, load-dependent) at the `if (!repoRoot) continue` fail-open branch. Whatever the chosen behavior, the two causes must be distinguishable and the choice deliberate.
3. **`bin/lib/hooks/worktree-detect.js`** — `repoInfo()` has a *second*, independent route to `repoRoot: null`: `safeReal(top)` returning null when `fs.realpathSync` throws. Fixing only `execGit` leaves this one indistinguishable at the call site.
4. **`tests/helpers/git-fixtures.js`** — `gitRepo()` and `linkedWorktreeOf()` call `execFileSync` with no `timeout` at all (measured at 2884 ms max under load, unbounded by construction). Bound them so fixture failure is fast and legible rather than an indefinite hang.
5. **A recorded decision on suite placement** — whether the hooks e2e suites stay in `npm test` or move to `perf/` as v6.38.1 did for the statusline budget. This is a genuine choice, not a foregone one; record the reasoning either way.

## Acceptance Criteria

1. A `git-exec` timeout is distinguishable from "not a git repo" at every call site, proven by a test that forces each condition and asserts the two are handled differently.
2. `pre-tool-use.js`'s worktree gate behaves deliberately when git cannot be queried, with the behavior stated in a comment that names *both* causes reaching that branch. A test covers the indeterminate case specifically.
3. `tests/helpers/git-fixtures.js` spawns cannot block unboundedly — a test asserts a bound exists.
4. The hooks suites pass **5 consecutive full `npm test` runs with at least 2 competing full suites running**, using the reproduction recipe in this record's comment thread. (The pre-fix baseline for that recipe is 1 failing run in 3.)
5. Every existing hook invariant still holds: no path exits non-zero, the garbage-stdin invariant test in `tests/hooks-dispatcher.test.js` passes, and a deny is still signalled solely via `hookSpecificOutput.permissionDecision`.
6. `npm test` passes in full.

## Technical Approach

The measurement harnesses used to produce the evidence above are described in the comment thread: a standalone timed replica of the 4-flag `rev-parse` call, and — decisively — an instrumented run that monkey-patches `child_process.execFileSync` *before* requiring the real `worktree-detect.js` and the real `git-fixtures.js`, so the reference destructured inside `git-exec.js` picks up the instrumented version and records per-spawn duration and error code. Reproduce with concurrent full `npm test` runs plus concurrent worker processes; watch for peak overlap rather than sustained load.

Note that raising the timeout is not free and should not be done reflexively. The 3000 ms bound exists because `PreToolUse` hooks block the user's tool call — a larger budget trades interactive latency for enforcement reliability. The measured data supports a *specific* increase, or an adaptive bound, rather than an arbitrary one.

## Gotchas

- **Fail-open is a deliberate project invariant**, not an oversight — CLAUDE.md's hooks section states "Never break a session" and "Ambiguity resolves to allow". This record must not convert an indeterminate result into a hard deny without that being an explicit, recorded decision. The defect is the *conflation* of two causes, not the fail-open policy itself.
- **`execGit` is shared by three modules** (`worktree-detect.js`, `pre-tool-use.js`, `post-tool-use.js`). Changing its return contract touches all three; a caller updated in isolation will read the new shape wrongly.
- **`git-exec.js`'s own header comment already anticipated this incident** — *"a future fix to the shared contract (e.g. widening the 3000ms timeout after a real timeout incident, or capturing stderr for debugging a hook failure)"*. Read it before changing the file; the design intent is recorded there.
- **The reproduction is probabilistic.** A single green run proves nothing — acceptance criterion 4 requires consecutive runs under competing load for that reason.
- **This record's original body stated a hypothesis that measurement partly refuted.** It listed resource exhaustion as a co-equal candidate (eliminated) and proposed relocating the suites as the primary direction (a symptom-level fix). Treat the `## Original request` section below as provenance, not as instructions — per `[IL-71]`, which is about exactly this failure mode.

## Original request

tests/hooks-* family flakes under concurrent worktree test runs, producing false regression signals

**Summary:** The `tests/hooks-*` family fails nondeterministically under concurrent sibling-worktree `npm test` runs, producing false regression signals. v6.38.1 fixed exactly this failure mode for one test; it is a family-wide property, not that test's problem.

**Type:** Bug

**Affected component:** `tests/hooks-dispatcher.test.js`, `tests/hooks-pre-tool-use.test.js`, `tests/hooks-worktree-detect.test.js`, `tests/hooks-post-tool-use-closing-keyword.test.js`, `tests/hooks-session-start.test.js`, `tests/install-statusline-wrapper.test.js`

**Origin:** Deferred from #130's wrap-up reflection.

**Observed:** Across three full `npm test` runs of one unchanged tree during #130:

| Run | Result |
|---|---|
| 1 | 1966/1972 — 6 failures |
| 2 | 1972/1972 — clean |
| 3 | 1954/1972 — 18 failures |

Every failure in both bad runs was in the suites listed above; none was in a path the branch touched. Re-running those six suites standalone: 90/90 pass. `ps -eo pid,etime,command` during run 3 confirmed two other worktree sessions (`issue-129-routine-version-visibility`, `fix-132-routine-branch`) running their own `npm test` concurrently.

Failure shapes are consistent with git subprocesses returning empty under contention rather than with any assertion logic — e.g. `repoInfo` returning `repoRoot: null` where a real toplevel was expected, and a `pre-tool-use` CLI e2e producing empty stdout where a `permissionDecision` JSON was expected. Individual test durations in the bad runs reached 6.6 s, 8.0 s and 14.2 s.

**Why this is worth fixing rather than tolerating:** the failure is silent-looking and points at the wrong thing. It renders as a specific, plausible regression in code the current branch did not touch, and distinguishing it from a real one costs a standalone re-run of every implicated suite. During #130 this consumed three full-suite runs (~10 min each) and came close to being reported as a genuine regression. In a repo where parallel worktree sessions are routine, a suite that fails this way is worse than a slow suite.

**Prior art in this repo:** v6.38.1 diagnosed exactly this for `tests/statusline.test.js`'s render-time assertion and moved it to `perf/`. That changelog entry contains the measurement methodology (a bare `node -e ""` control spawn cost 34 ms idle and 566 ms under a competing suite — a 16x swing). The fix was scoped to that one test; nothing generalized it to the git-subprocess-spawning suites, which have the same dependency on subprocess latency.

**Suggested direction (not prescriptive — measure first):**

- Establish whether the failures are timeout-driven or resource-exhaustion-driven. The 30 s `execFileSync` timeouts added in `bba5e3c1` cover engine code, not test helpers; check what timeout, if any, the hook-test helpers spawn git under.
- Consider whether these e2e-shaped suites belong under `npm test` at all, or alongside the statusline budget in `perf/` — noting the tradeoff v6.38.1's entry already articulates, that moving a test out of the correctness suite keeps the bound but stops it gating.
- If they stay, they need to be robust to a loaded machine rather than tuned to an idle one; a threshold retune was already tried and rejected on evidence for the statusline case.


