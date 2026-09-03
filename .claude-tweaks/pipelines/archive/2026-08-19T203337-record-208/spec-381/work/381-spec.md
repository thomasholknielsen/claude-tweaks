---
record: 381
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 381: Coalesce redundant git spawns in SessionStart's per-run integrity check

Surface: backend

## Current State

- `bin/lib/hooks/session-start.js`'s `run(ctx)` iterates up to `MAX_REPORTED = 3` stale pipeline-run entries (`ctxLib.iterRunDirsWithState`), and for each one calls `runIntegrity.checkRunIntegrity(dir)` inside a `.map()` (lines 37-56).
- `bin/lib/hooks/run-integrity.js`'s `checkRunIntegrity(runDir)` calls `deriveBranch(root, state.worktree)`, which spawns `git worktree list --porcelain` via `runGit` (line 70), then calls `resolveIntegrationBranch(root)` (imported from `worktree-reap.js`), which — whenever the project has no `integration-branch` value in `.claude-tweaks/policy.yml` (`policy.readIntegrationBranch` returns falsy) — spawns `git rev-parse --abbrev-ref origin/HEAD` (`worktree-reap.js` line 318). When a policy value IS set, `resolveIntegrationBranch` short-circuits before any `runGit` call — this record does not touch that path.
- Immediately after the stale-runs block, the same `run(ctx)` calls `reconcile({ cwd: ctx.cwd })` (`bin/lib/reconcile/index.js`). `reconcile()` unconditionally calls `resolveIntegrationBranch(root)` again at line 50 — a further, independent spawn of `git rev-parse --abbrev-ref origin/HEAD` for the identical `root`.
- Every one of these calls resolves the same repo root within one `SessionStart` invocation (`root = mainCheckoutRoot(ctx.cwd)` inside `reconcile()`; `repoRootOf(runDir)` inside `checkRunIntegrity`, which walks the fixed `{root}/.claude-tweaks/pipelines/{run-id}` layout back to the same root), and `SessionStart` is offline-safe (no fetches run in between), so the worktree list and origin's default-branch name cannot change between calls — every spawn after the first returns byte-identical output.
- On a repo with 3 stale run dirs (the `MAX_REPORTED` cap), this produces up to 7 redundant `git` subprocess spawns per `SessionStart`: 3x `git worktree list --porcelain` (one per `checkRunIntegrity` call's `deriveBranch`), 3x `git rev-parse --abbrev-ref origin/HEAD` (one per `checkRunIntegrity` call's `resolveIntegrationBranch`), plus 1 more from `reconcile()`'s own `resolveIntegrationBranch` call.
- `runGit` (`bin/lib/hooks/git-exec.js`) is the shared `execFileSync('git', ...)` wrapper both `run-integrity.js` and `worktree-reap.js` use; it has no injectable-runner seam — callers cannot swap in a fake without mocking `child_process.execFileSync` directly.
- `reconcile()` is also called by other skills with no cache argument today (`/dispatch`, `/tidy`, and others per CLAUDE.md's `gh` dependency table) — it is not `session-start.js`-only.

## Deliverables

- [ ] A per-invocation cache, created once per `session-start.js` `run(ctx)` call, that memoizes `git worktree list --porcelain`'s result and `resolveIntegrationBranch`'s resolved branch name, each keyed by repo root.
- [ ] `deriveBranch` (`run-integrity.js`) and `resolveIntegrationBranch` (`worktree-reap.js`) accept an optional cache parameter. When provided and already populated for the given root, they return the cached value instead of calling `runGit` again. When omitted, behavior is byte-identical to today (a fresh `runGit` spawn on every call) — every existing caller and test that doesn't pass a cache is unaffected.
- [ ] `checkRunIntegrity(runDir, opts)` accepts the same optional cache and threads it through to its own `deriveBranch` and `resolveIntegrationBranch` calls.
- [ ] `session-start.js`'s `run(ctx)` creates one cache object before the stale-runs `.map()`, passes it into every `checkRunIntegrity(dir, { cache })` call inside that `.map()`, and passes the same cache into the subsequent `reconcile({ cwd: ctx.cwd, cache })` call.
- [ ] `reconcile()` (`bin/lib/reconcile/index.js`) accepts an optional `opts.cache` and passes it through to its own `resolveIntegrationBranch(root, cache)` call at line 50.

## Acceptance Criteria

1. On a fixture repo with 3 stale run dirs sharing the same repo root (each with a `run-state.json` whose `status` is `active` or `interrupted`, matching `iterRunDirsWithState`'s selection), a single `session-start.js` `run(ctx)` invocation spawns `git worktree list --porcelain` at most once and `git rev-parse --abbrev-ref origin/HEAD` at most once for the whole invocation — never once per `checkRunIntegrity` call, never a separate spawn from `reconcile()`. Verified by a `node:test` that wraps `child_process.execFileSync` with `t.mock.method` (mocking the wrapper `runGit` actually calls, per `git-exec.js` — there is no injectable-runner seam to swap instead) and asserts the call count for each of those two exact argument arrays.
2. `checkRunIntegrity`, `deriveBranch`, and `resolveIntegrationBranch` called WITHOUT a cache argument — the shape every existing test in `tests/run-integrity.test.js` and `tests/reconcile.test.js` (which also covers `resolveIntegrationBranch` and `worktree-reap.js`) uses today — still spawn a fresh `git` call every time. Every pre-existing test in `tests/run-integrity.test.js`, `tests/reconcile.test.js`, and `tests/hooks-session-start.test.js` passes unmodified.
3. `reconcile()` called without `opts.cache` (every existing caller other than `session-start.js`) is unaffected: `resolveIntegrationBranch` is still called fresh inside `reconcile()`, identical to current behavior.
4. On a project whose `.claude-tweaks/policy.yml` sets `integration-branch`, `resolveIntegrationBranch(root, cache)` returns the policy value with or without a cache present, and never spawns `git rev-parse --abbrev-ref origin/HEAD` in either case — the cache changes spawn count only, never correctness or the policy-precedence order.
5. `npm test` passes in full, including the new spawn-count test from AC1.

## Technical Approach

Thread a small, explicit, opt-in cache through the four functions that read per-root git state, rather than introducing a global/module-level cache (which would leak state across unrelated `runGit` calls in the same process and across the many other callers of `reconcile()` and `resolveIntegrationBranch` that must keep spawning fresh — see AC3). Shape it as two `Map`s keyed by resolved repo root (`Map<root, worktreeListStdout>` and `Map<root, integrationBranchName | null>`), so a caller that (hypothetically) touches more than one root within a single invocation still gets correct per-root memoization rather than a single-root shortcut that silently returns the wrong root's value.

`session-start.js`'s `run(ctx)` is the only construction site: create `const cache = { worktreeList: new Map(), integrationBranch: new Map() };` once, before the stale-runs loop, and pass it to every `checkRunIntegrity(dir, { cache })` call and to the trailing `reconcile({ cwd: ctx.cwd, cache })` call. Every other caller of these four functions (direct unit tests, `/dispatch`, `/tidy`, any other `reconcile()` caller) omits the option entirely, so each of them still gets a fresh, uncached `Map` (or no memoization at all) scoped to that single call — no cross-call leakage, no behavior change for anyone who doesn't opt in.

### Key Files

- `bin/lib/hooks/run-integrity.js` — `deriveBranch(root, worktreePath, cache)` and `checkRunIntegrity(runDir, opts)` gain the optional cache parameter/option; `deriveBranch` checks `cache?.worktreeList.get(root)` before calling `runGit(['worktree', 'list', '--porcelain'], root)`, and stores the result when a cache is present.
- `bin/lib/hooks/worktree-reap.js` — `resolveIntegrationBranch(repoRoot, cache)` checks `cache?.integrationBranch.get(repoRoot)` before its `runGit(['rev-parse', '--abbrev-ref', 'origin/HEAD'], repoRoot)` call, after the existing `policy.readIntegrationBranch` short-circuit (that check must stay first — AC4).
- `bin/lib/hooks/session-start.js` — construct the cache and thread it into the `.map()`'s `checkRunIntegrity` calls and the `reconcile()` call. The existing load-bearing comment on this block ("This stale-runs block running BEFORE the reaper block is load-bearing ordering") is about *ordering*, not caching — do not change that ordering while adding the cache.
- `bin/lib/reconcile/index.js` — `reconcile(opts)` reads an optional `opts.cache` and passes it to its own `resolveIntegrationBranch(root, opts.cache)` call at line 50; every other `resolveIntegrationBranch`/`runGit` call inside `reconcile()`'s sub-checks (mirror-ff's fetch, reap's own live worktree-list read used to decide what to actually remove, pr-state, etc.) is out of scope — those are either not per-root-identical reads, or must stay live/fresh for correctness at the time they run (see Gotchas).
- `tests/hooks-session-start.test.js` (or a new file alongside it) — the spawn-count test from AC1.

## Gotchas

- `runGit` (`bin/lib/hooks/git-exec.js`) is a direct `execFileSync` wrapper with no injectable-runner seam (unlike the `gh api` modules under `bin/lib/`, which do have one per `gh-api-module-pattern`). A spawn-count test must mock `child_process.execFileSync` itself via `node:test`'s `mock.method`, not attempt to inject a fake `runGit`.
- Do not memoize the reaper's own internal `git worktree list --porcelain` read (`reapWorktrees`/`reapMerged`/`legacyReapWorktrees`, all inside `worktree-reap.js`/`reconcile/reap-merged.js`) using this cache — that read determines what to actually remove and must reflect live state at the moment reaping runs, which can be after `mirrorFastForward`'s own fetch. Only `checkRunIntegrity`'s pre-reap branch-derivation read and `resolveIntegrationBranch`'s origin/HEAD read are in scope, per the issue's own stated scope ("share the result across checkRunIntegrity calls and the reaper block" refers to `reconcile()`'s `resolveIntegrationBranch(root)` call at line 50, not to the reap sub-check's own worktree enumeration).
- `mergedEvidence`'s `merge-base --is-ancestor` / `cherry` calls inside `checkRunIntegrity` are per-branch, not per-root — they vary across the 3 stale-run entries (different `evidence.branch` each time) and are never candidates for this cache.
- `reconcile()` is called by several skills besides `session-start.js` (`/dispatch`, `/tidy`, and others per CLAUDE.md's `gh` CLI dependency note) with no cache argument today — the optional-cache default must reproduce today's per-call spawn behavior exactly, or a caller that (unlike `session-start.js`) runs across a fetch/mutation mid-invocation could silently read stale worktree-list/integration-branch data.
- `resolveIntegrationBranch`'s `policy.readIntegrationBranch(repoRoot)` short-circuit must still run before any cache lookup — a project with an `integration-branch` policy value never spawns `git rev-parse` at all today, and the cache must not change that (AC4).

## Original request

Coalesce redundant git spawns in SessionStart's per-run integrity check

**Related:** #380

Context: whole-branch review before the 6.80.0 release found session-start.js wires checkRunIntegrity(dir) into the per-stale-run .map() (bounded to MAX_REPORTED=3), so each call independently spawns 'git worktree list --porcelain' and 'git rev-parse --abbrev-ref origin/HEAD' against the same repo root, plus the reaper block right after spawns resolveIntegrationBranch again for that root — up to ~7 redundant git subprocess spawns per SessionStart on a repo with 3+ stale runs, all for values identical across every one of them.

Scope: memoize the per-repo-root git reads (worktree list, origin/HEAD) once per SessionStart invocation and share the result across checkRunIntegrity calls and the reaper block.

