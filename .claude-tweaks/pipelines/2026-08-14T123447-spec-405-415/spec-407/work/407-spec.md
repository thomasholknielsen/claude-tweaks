---
record: 407
origin: human
risk: medium
size: high
ceremony: standard
grants: []
blocked-by: [406]
surface: backend
---
# 407: Reconciler module: converge local state toward origin (ff, reap, release, archive)

Surface: backend

## Overview

Build the reconciler: one deterministic `bin/` module that converges local state toward origin under the pr-first integration model, exposed as a `hooks.js` verb and invokable directly by skills. It replaces sequenced cleanup choreography ("this call owes Items 4, 7, 8") with idempotent reconciliation: any session, any time, safely — a session dying mid-cleanup costs nothing because the next reconciliation finishes the job. Four convergence checks: fast-forward the mirror integration branch; reap worktrees whose branch's PR is merged; release claims and `bot:in-progress` labels whose PR is merged; archive run dirs whose PR is merged. (A fifth, console execution, is a separate sub-issue — it needs the console-on-PR protocol.)

**Complexity:** High
**Estimated tasks:** 8

## Non-Goals

- No trigger-point wiring (session-start, queue pull, routines, tidy) — that is the reconciler-wiring sub-issue.
- No console execution — separate sub-issue, blocked on the console-on-PR protocol.
- No changes to `local-merge` behavior: the existing `worktree-reap.js` local-ancestry check remains the reap signal for no-forge projects.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| integration-model | Integration-model resolution | ready |

## Current State

- `bin/lib/hooks/worktree-reap.js` — today's reaper: merged-into-local-integration-branch ancestry check, `QUIET_SKIP_REASONS`, `MAX_EXAMINED_PER_RUN` cap, live-session lock detection (pid parsing).
- `bin/lib/hooks/context.js` — `resolveRun`/`ownedRun` two-resolution model, `appendEvent`, `iterRunDirsWithState`.
- `bin/hooks.js` — single dispatcher; verbs `record-worktree`, `close-run`; every path exits 0.
- `skills/_shared/issue-claims.md` — claim blobs `claims/issue-{n}.json` on the `claims-registry` ref; release semantics and the file-blob MCP fallback.
- `bin/lib/hooks/run-integrity.js` — `checkRunIntegrity` shipped-unclosed detection; precedent for PR/branch evidence checks.
- `tests/hooks-dispatcher.test.js` — the garbage-stdin invariant every hook module must pass.
- Run dirs record their branch/worktree in `run-state.json` (written by `record-worktree`).

## Deliverables

- [ ] `bin/lib/reconcile/` module (flat sibling files, not a nested `_shared/`): `classify.js` (mirror state: `current | behind | ahead | diverged | dirty`), `mirror-ff.js`, `reap-merged.js`, `release-merged.js`, `archive-merged.js`, `index.js` orchestrating all checks with per-check results.
- [ ] Mirror ff: fetch `origin {integration-branch}`; ff only when strictly behind AND the working tree is clean; `ahead`/`diverged` returns a warning result (an anomaly under pr-first), never a merge.
- [ ] PR-state join: worktree ↔ branch ↔ PR resolved from `git worktree list` + run-state.json branch + `gh pr list --head {branch} --state all --json number,state,mergedAt,updatedAt` — merged ⇒ reap/release/archive; closed-without-merge ⇒ surface only (a failure tombstone whose worktree may be the resume surface), never auto-reap. Multi-PR tie-break: any merged PR in the set counts as merged (merge is terminal); otherwise the most recently updated PR's state governs. The join is many-runs-to-one-branch safe — each run dir evaluates independently. Integration-branch resolution reuses `reaper.resolveIntegrationBranch` (the `_shared/integration-branch.md` ladder); unresolved ⇒ skip everything, reap nothing.
- [ ] Claim release on merged-PR evidence: iterate the open claim blobs themselves — `claims/issue-{n}.json` names its issue number and `runId`, and `runId` → run-state.json → branch → PR state, so the claim blob IS the branch→issue join; no naming convention needed. Release per `_shared/issue-claims.md`'s semantics plus `bot:in-progress` removal, both best-effort with a logged warning. This check re-derives from claim/run state independently each pass, so it retries on the next reconcile even after the worktree is gone — no ordering dependency on the reap check.
- [ ] Archive semantics: archiving a merged run dir follows `wrap-up/cleanup-procedures.md` Section B (the existing archival procedure) — cite it, don't invent a second mechanism. A merged PR whose console (`console.json`) is rendered but unresolved is NOT archived — surface it; archival requires merged AND console-resolved (or no console rendered).
- [ ] `hooks.js reconcile` verb: a thin wrapper over the module's one exported entry point (`reconcile(opts)`, `opts = { dryRun?: boolean, checks?: string[] }`) — session-start calls the same function in-process, and a parity test asserts both surfaces behave identically. JSON result to stdout, exit 0 on every path. Skip reasons are distinguished, never collapsed: `local-merge-model`, `no-remote`, `gh-absent`, `network-failure`. The module is gh-CLI-only by design (Node code cannot reach an agent session's MCP tools), so a gh-absent environment skips with that reason rather than attempting an MCP path. `--dry-run` still performs reads (fetch, PR lists) but no writes — covered by a test. Fetches run under an exported 5s timeout constant.
- [ ] Tests: unit tests per check (ff happy/dirty/diverged/ahead, reap merged vs closed-vs-open PR, release idempotence on an already-released claim, archive idempotence), the garbage-stdin invariant, and an offline-degradation test.

## Acceptance Criteria

1. In a fixture repo where local integration branch is strictly behind origin and clean, `reconcile` fast-forwards it; with a dirty working tree it reports `dirty` and moves nothing; with local-only commits it reports `ahead` with a warning and moves nothing.
2. A fixture worktree whose branch has a merged PR is reaped; the same worktree with a closed-unmerged PR is left in place and reported; with an open PR it is left in place and appears in the result's `skipped` array with reason `pr-open` — no user-facing message, but never an unlogged skip (the no-silent-caps rule applies to the JSON result).
3. Running `reconcile` twice in a row produces zero writes on the second run (idempotence), verified in a test.
4. With no network (fetch fails), the verb exits 0 and reports each check as skipped-unverifiable.
5. `npm test` passes, including the dispatcher garbage-stdin invariant for the new verb.

## Technical Approach

Desired state lives on origin; the reconciler reads it and converges local state, per-check, each check independently skippable. Never break a session: every error path degrades to a reported skip. Reuse `worktree-reap.js`'s live-session lock detection verbatim — a live session's worktree is never reaped regardless of PR state. Ownership discipline from `context.js` applies to any run-dir writes (write only via `ownedRun`, tag fallback attribution).

### Data / API Surface

- `reconcile(opts) -> { mirror: {state, action}, worktrees: [{path, prState, action}], claims: [...], runs: [...], skipped: [...] }`
- Verb: `node bin/hooks.js reconcile [--dry-run]` — dry-run reports intended actions without writing.

### Key Files

- `bin/lib/reconcile/*.js` — new module.
- `bin/hooks.js` — verb registration.
- `bin/lib/hooks/worktree-reap.js` — export the live-session lock check as a named function (e.g. `isWorktreeLocked(path)`) and consume it; don't duplicate.
- `bin/lib/reconcile/tests/` or `tests/reconcile.test.js` — per-suite convention in `docs/plugin-structure.md`.

## Gotchas

- `git pull --ff-only` in the main checkout is NOT intercepted by the `worktree.always` gate (only commit/push targets are) — no close-run dance needed; and code running inside the hook process is not a Bash tool call at all.
- `git status`/`git branch -vv` carry no freshness information before a fetch — always fetch first, then read direction with `git rev-list --left-right --count`.
- The stash stack is shared across worktrees — never stash; the clean-tree check simply skips instead.
- Do not use `gh pr list --search` — the search index lags fresh writes; use `--head {branch}` (REST list).
- `zsh` mangles `"$ref:path"` — brace as `"${ref}:path"` in any git object lookups.
- Hook processes spawn with the harness's own environment — a `PIPELINE_RUN_DIR` exported in a Bash call does not reach them; resolve from cwd as `context.js` does.
- Fail-open is the posture, but log every skip with a reason — a silent cap or skip reads as full coverage (CLAUDE.md: no silent caps).
- Concurrency posture (stated in the module header): two racing reconciles converge — an ff race is safe (git refuses a non-ff), claim release rides the claim lock's own semantics, and every check re-verifies state immediately before writing. The idempotence test covers sequential re-runs; concurrent invocation is safe by these per-check properties, not by a global lock.

<!-- work-fingerprint: pr-first-integration-model:reconciler-module-converge-local-state-toward-origin-ff-reap -->
