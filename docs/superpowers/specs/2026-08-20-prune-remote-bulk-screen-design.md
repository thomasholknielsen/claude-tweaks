# Bulk screen, precise confirm: de-linearizing the reconcile family's per-branch PR lookups

**Origin:** issue #932 (`needs:definition` — routed through brainstorming for the batching-vs-safety tradeoff).
**Date:** 2026-08-20

## Problem

One background reconcile pass spends ~10.3s and ~34 subprocesses on 11 remote branches because
`bin/lib/reconcile/prune-remote.js` issues one `git cherry` **and** one `gh pr list --head {branch}`
per in-scope branch. Subprocess count and — more expensively — network round-trips grow linearly
with branch count; the per-branch `gh pr list` (~9s of the 10.3s) dominates. The reconcile family
already treats API-call count as a first-class budget (`budget.js` wall-clock ceiling, `gh api
rate_limit` preflight), so a 50-branch repo paying 50 sequential API calls per pass is a real
constraint violation, not just slow.

**Hard constraint (from #932):** `prune-remote` deletes remote branches. Any batching must preserve
the delete verdict *identically*, not approximately.

## Decision: screen-then-confirm

Invert the evidence order. One bulk GraphQL query *screens* the whole in-scope branch set; today's
exact per-branch evidence is re-run only for the rare branches the screen nominates for deletion.
The delete decision therefore rests on precisely the evidence it rests on today — the
"identically, not approximately" constraint is satisfied **structurally** rather than by proving
the bulk query semantically equivalent:

- A branch the screen mis-reads toward *skip* → prune delayed until a later pass (fail closed, safe).
- A branch the screen mis-reads toward *candidate* → one wasted confirm call, then skipped (safe).
- A delete can only happen after the same per-branch `gh pr list --head` + `git cherry` evidence
  that gates it today.

Typical pass: 1 GraphQL round trip + k cherries + k confirms, where k (delete candidates) is
usually 0–2. Wall clock ~2–3s; network calls O(1 + k) instead of O(N).

### Alternatives rejected

- **Repo-wide `gh pr list --state all` index** (#932 direction 1): `--state all` enumerates every
  PR the repo ever had, newest-first; any finite `--limit` silently truncates, so an old merged PR
  beyond the limit flips its branch's verdict to `no-merged-pr` forever. Fail-closed but not
  verdict-identical, and it degrades as the repo ages. Rejected.
- **Bulk cherry-equivalence** (#932 direction 2): `git cherry` is local and ~5% of wall clock, and
  there is no true single-call bulk form — each branch needs its own symmetric diff against the
  integration branch. Not worth its complexity. Rejected (screen-first already eliminates cherry
  calls for non-candidates as a side effect).
- **Verdict caching in `cache.js`** (#932 direction 3a): only *skip* verdicts could be cached
  safely (PR state flips without tip movement under squash-merge), and the existing 7-minute
  `skipIfFresh` gate already suppresses the session-storm repeat-pass case. Deferred as YAGNI.
- **Per-pass branch cap** (#932 direction 3b): the 18s `budget.js` ceiling already bounds a
  runaway pass; a cap silently starves the tail. Rejected.
- **Pooling the existing per-branch calls through `gh-pool.js`** (not in #932): verdict-identical
  and ~30 lines, but only a constant-factor fix — O(N) API calls survive. Superseded by this
  design; noted here so the option isn't re-litigated.

## Phase 1: Bulk screen module + prune-remote adoption

### 1. `resolvePrStatesBulk` (in `bin/lib/reconcile/pr-state.js`)

New export beside the existing resolvers, sharing `pickGoverningPr` so the multi-PR tie-break
(merged wins; else most recently updated) stays in exactly one place.

- Input: `(repoRoot, branches)` — the already-in-scope branch names only.
- One `gh api graphql` query per chunk of ≤50 branches, using per-branch
  `ref(qualifiedName: "refs/heads/{branch}")` aliases with
  `associatedPullRequests(first: …) { number state mergedAt updatedAt }`. Querying only the
  in-scope set avoids repo-wide pagination and the truncation flaw of the rejected REST index.
- Built per the `gh-api-module-pattern` seam: injectable runner, `-f` for the query string, `-F`
  for resolved owner/name variables, argv separators, per-call fail-safe.
- Output: `Map(branch → governing-PR-or-null)`, or a check-level failure classification
  (`'gh-absent'` | `'network-failure'`) using the shared `classifyGhApiError`-derived helper.

### 2. `pruneRemote` restructure (`bin/lib/reconcile/prune-remote.js`)

Fetch/prune, worktree list, `for-each-ref`, `inScope` guards, `HEAD`/integration exclusions: all
unchanged. Then:

1. **Screen once:** `resolvePrStatesBulk(root, inScopeBranches)`.
2. Per branch, on the screen verdict:
   - OPEN → `skip pr-open`; no PR or closed-unmerged → `skip no-merged-pr`. **No `git cherry`,
     no per-branch `gh` call for these.** Reason vocabulary unchanged; only its provenance moves.
   - MERGED → *candidate*: run `isCherryEquivalent` (unchanged; `cherry-failed` skip path
     unchanged), then **confirm** with today's exact per-branch `resolvePrState`.
3. `decideRemotePrune` — the pure decision table — is **unchanged and fed only confirm
   evidence**. The screen result never reaches it. Screen/confirm disagreement needs no special
   case: confirm governs by construction.
4. Batched `push --delete`, per-branch fallback, `refExists` reclassification: all unchanged.

### 3. Failure posture

- Screen fails (network/unparseable) → skip the **whole check**, `failure: 'pr-screen-failed'` —
  same fail-closed shape as `fetch-failed`. `gh` absent keeps its own `'gh-absent'` reason.
- Confirm fails for one candidate → that branch skips via the decision table's existing
  `network-failure` path; the rest of the pass proceeds.

### 4. Empirical probe (plan task, not a design dependency)

Probe `associatedPullRequests` vs `gh pr list --head` semantics against the real repo (fork PRs,
retargeted branches) during implementation and record the finding in the module header. The
design does not depend on equivalence — a divergence only delays prunes — but a known divergence
must be documented rather than discovered.

### 5. Testing

- `decideRemotePrune` tests: unchanged (the function is unchanged).
- `resolvePrStatesBulk` via fake runner: chunking at 50, tie-break parity with `resolvePrState`
  on the same PR fixtures, failure classification, empty-branch-set short-circuit (no call).
- `pruneRemote`: inject screen/confirm disagreement both ways and assert confirm governs
  (screen-MERGED + confirm-not-merged → skip, no delete); check-level skip on screen failure;
  ordering assertion that non-candidate branches trigger zero cherry/confirm subprocess calls.

### Key files

- `plugin/bin/lib/reconcile/pr-state.js` — new `resolvePrStatesBulk` beside existing resolvers
- `plugin/bin/lib/reconcile/prune-remote.js` — pass restructure
- `tests/bin-lib/reconcile/pr-state.test.js` + `tests/bin-lib/reconcile/prune-remote.test.js` —
  the existing suites for these modules; `tests/reconcile.test.js` covers the orchestrator seam

## Phase 2: `archive-branches` adopts the same screen

`bin/lib/reconcile/archive-branches.js` runs the identical per-branch `resolvePrState` loop over
**local** branches (line ~133) — the same O(N) network shape. Adopt `resolvePrStatesBulk` as its
screen with the same structural-safety framing: `archive-branches` is local-only (tag + local
branch delete, no pushed mutation), and its `decideArchive` table likewise keeps governing on
per-branch confirm evidence for any destructive verdict (`tag-and-delete`), while screen-skips
(`pr-open`, etc.) are fail-closed. Cherry ordering benefit applies here too (cherry only for
screened candidates).

Independent, follow-up-sized: Phase 1 ships the module and one adopter; Phase 2 is a second
adopter with its own tests. No shared uncommitted state between the phases.

## Non-goals

Bulk cherry-equivalence; verdict caching; per-pass caps (all rejected above). #931's Windows
console-window storm is already fixed separately. No behavior change to any decision table's
verdicts — this design changes evidence *acquisition order and batching* only.
