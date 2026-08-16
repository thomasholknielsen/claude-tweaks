---
record: 517
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: tidy-report-auto-routing:reconcile-issue-closed-claim-release-branch-archival-and-arc
surface: backend
---
# 517: Reconcile: issue-closed claim release, branch archival, and archive-tag aging

<!-- work-fingerprint: tidy-report-auto-routing:reconcile-issue-closed-claim-release-branch-archival-and-arc -->
Surface: backend

## Overview

Extend the background convergence layer (`bin/lib/reconcile/`) with three mechanical cleanups that `/tidy` currently stages as human decisions: releasing claims held on already-closed issues, deleting or archiving abandoned plugin-owned branches, and aging out the archive tags that the archival path creates. Placement in reconcile rather than tidy is deliberate and was confirmed at design time: the auto-mode contract governs *skill-side* decisions and forbids autonomous API writes there at every tier, while background convergence already writes claim releases and label removals autonomously by design (see `release-merged.js`'s existing merged-PR path) — extending it requires no contract amendment. The branch/tag operations stay in-tier because the archive tag converts an irreversible force-delete into a recoverable, findable operation. Tidy stays scan-and-report; the routing-row changes that consume these checks are a separate sub-issue ("Tidy routing flips, moderate default, and the missing-routing-rule principle").

**Complexity:** Medium
**Estimated tasks:** 8

## Non-Goals

- No tidy skill-prose changes — routing rows and the report template are the two sibling sub-issues of this decomposition.
- No `local-merge` counterpart: reconcile is `pr-first`-only by design; `local-merge` projects keep today's staging behavior.
- No policy levers for the 14-day branch-age or 90-day tag-aging thresholds — hardcoded until someone needs otherwise.
- No changes to `bin/lib/hooks/worktree-reap.js` — its exports are consumed as-is (see Technical Approach), never modified.
- No remote branch deletion — all branch/tag mutations in this module are strictly local to the checkout reconcile runs in (see Gotchas).

## Prerequisites

None.

## Current State

- `bin/lib/reconcile/release-merged.js` — `decideRelease(classifiedState, prState)` pure decision table; releases only on `prState.state === 'MERGED'`; skips `no-pr` / `pr-open` / `pr-closed-unmerged` / `gh-absent` / `network-failure`. Its caller pushes `{ issueNumber, runId, prNumber: prState.number }` (line ~158) — note the unconditional `prState.number` dereference. `classifyClaimBlob` (`bin/lib/issues/claims.js`) supplies `live`/`stale`/`absent`/`tombstone`/`unreadable`; each claim blob (`claims/issue-{n}.json`) names its own issue number. `ghApi` helper: `execFileSync('gh', ...)`, 5s timeout, stderr ignored.
- `bin/lib/reconcile/index.js` — `ALL_CHECKS = ['mirror','reap','release','archive','console']` is the **requested-subset default only — it is never iterated to determine dispatch order** (its own header comment says so). The real dispatch order is the separate documented sequence `mirror, console, release, archive, reap`, with `reap` deliberately last; the ordering-rationale comment above the dispatch is the authority. The `'archive'` check name is **already taken** — it maps to `archive-merged.js` (pipeline run-dir archival), unrelated to branch archival. A `local-merge` guard skips `mirror`/`release`/`archive`/`console`. Result shape today: `{ mirror, worktrees, claims, runs, console, skipped }`.
- `bin/lib/hooks/worktree-reap.js` — exports `parseWorktreeList` (worktree enumeration incl. branch attachment) and `resolveIntegrationBranch`; both already imported by reconcile modules.
- `bin/lib/reconcile/pr-state.js` — `resolvePrState` branch→PR join used by release and reap.
- Tests: `tests/bin-lib/reconcile/` — `node --test` suites, one per module, picked up automatically by `npm test`'s recursive glob.

## Deliverables

- [ ] `decideRelease` gains issue-closed evidence: a `live`/`stale` claim whose issue state is `CLOSED` releases even when the PR join yields `no-pr` or `pr-closed-unmerged`; reason string `issue-closed: reconciled from #{n}`, where `{n}` is the claim blob's own issue number (already in scope at the call site — the signature does not carry it). `MERGED`-evidence behavior unchanged.
- [ ] The caller's `released.push({ issueNumber, runId, prNumber: prState.number })` updated to tolerate the new path's null/non-merged `prState` (e.g. `prNumber: prState ? prState.number : null`) — without this, every issue-closed release throws `TypeError` on the unconditional dereference.
- [ ] Issue-state lookup wired into `release-merged.js`'s pass, mirroring the existing `ghApi` pattern (5s timeout); an unknown/errored issue state skips (fail closed), never releases.
- [ ] New `bin/lib/reconcile/archive-branches.js` exposing a pure `decideArchive(input)` over `{branch, tipAgeDays, cherryEquivalent, prState}` → `{action: 'delete' | 'tag-and-delete' | 'skip', reason}`: cherry-equivalent AND `prState` not `OPEN` → `delete`; genuinely unmerged AND `tipAgeDays > 14` AND (`no-pr` or `pr-closed-unmerged`) → `tag-and-delete` (lightweight local tag `archive/{branch}` at the tip, then branch delete); everything else — including any branch whose PR is `OPEN`, cherry-equivalent or not — → `skip`. Both delete paths execute as local `git branch -D` (the decision function's evidence is the safety; `-d`'s own verdict is explicitly not trusted — see Gotchas).
- [ ] Scope guard applied before the decision function is ever called: only `build/*`, `worktree-*`, and `demo/*` branches, and only those with no attached worktree per `parseWorktreeList` (`bin/lib/hooks/worktree-reap.js`) — reused, not reimplemented.
- [ ] Tag aging in the same module: delete `archive/*` tags whose tagged commit's **committer date** (`%cI`) exceeds 90 days. The same committer-date field is the basis for `tipAgeDays`.
- [ ] `index.js` wiring: check name `'archive-branches'` (the obvious `'archive'` is taken — see Current State) added to `ALL_CHECKS` and to the `local-merge` skip guard; inserted in the documented dispatch sequence after `archive`, before `reap` (which stays last); a new `result.branches` slot carries its outcomes; the ordering-rationale comment updated to place it.
- [ ] Test suites for both decision functions and the scope guard; during development, revert the implementation once and confirm the new tests fail (discrimination check), then restore.

## Acceptance Criteria

1. `decideRelease('live', {state:'OPEN', ...}, 'CLOSED')`-shaped input (claim live, PR open) still skips with reason `pr-open` — an open PR means work may be landing; issue-closed evidence applies only to the `no-pr` and `pr-closed-unmerged` join results.
2. `decideRelease('live', null, 'CLOSED')` → `{action:'release', reason:'issue-closed: reconciled from #{n}'}`; same for `pr-closed-unmerged`. The full release pass over such a claim completes without throwing (caller-dereference test).
3. `decideRelease('live', null, 'OPEN')` and `decideRelease('live', null, undefined)` (fetch failed) → skip. No new path throws.
4. `decideArchive`: cherry-equivalent branch with `prState` `null` or closed → `delete` (no tag); cherry-equivalent branch with an `OPEN` PR → `skip`; unmerged 15-day-old branch with `pr-closed-unmerged` → `tag-and-delete`; unmerged 13-day-old branch → `skip`; branch outside the three namespaces or with an attached worktree → never reaches the decision function (scope-guard test).
5. Tag aging: an `archive/x` tag whose commit's committer date is 91 days old is deleted; 89 days old is kept.
6. `require('bin/lib/reconcile/index.js')` dispatches `'archive-branches'` between `archive` and `reap`, and its results land in `result.branches`; the `'archive'` (run-dir) check's behavior is untouched by this change (existing suite still green).
7. `npm test` passes; the new suites live under `tests/bin-lib/reconcile/`.

## Technical Approach

Pure decision functions with I/O at the edges, matching `decideRelease`'s existing pattern so the whole decision table stays unit-testable without real `gh`/git calls. `git cherry {integration-branch} {branch}` is the merged-in-substance evidence — it catches squash merges that ancestry checks and `git branch -d` both miss; `{integration-branch}` resolves via the existing `resolveIntegrationBranch` export (`bin/lib/hooks/worktree-reap.js`), never hardcoded. Tags are local lightweight tags only, never pushed. The 90-day aging threshold matches git's default reflog window: the tag's marginal recovery value drops to zero as the reflog copy of the same commits expires.

### Data / API Surface

- `decideRelease(classifiedState, prState, issueState)` — existing export, signature extended with `issueState` (`'OPEN' | 'CLOSED' | undefined`); update all existing callers and tests. The reason string's `#{n}` comes from the claim blob at the call site, not the signature.
- `decideArchive({branch, tipAgeDays, cherryEquivalent, prState})` → `{action, reason}` — new export from `archive-branches.js`. The scope guard (namespace + worktree attachment) runs before this function and is separately exported for testing.
- `index.js` result shape gains `branches` (mirroring `claims`/`worktrees`: what was deleted, tagged, aged, skipped and why).

### Key Files

- `bin/lib/reconcile/release-merged.js` — decision-table extension, caller `released.push` fix, issue-state fetch
- `bin/lib/reconcile/archive-branches.js` — new module (decision fn, scope guard, tag aging, execution)
- `bin/lib/reconcile/index.js` — `'archive-branches'` wiring + dispatch-order comment
- `tests/bin-lib/reconcile/release-merged.test.js`, `tests/bin-lib/reconcile/archive-branches.test.js`

### Package Dependencies

None — Node built-ins, `gh` CLI, git.

## Gotchas

- reconcile is `pr-first`-only by design — do not add `local-merge` paths; the `index.js` guard must cover the new check.
- `ALL_CHECKS`'s array order is NOT the dispatch order — the separate documented sequence in `index.js`'s header is; read it before inserting, and keep `reap` last.
- All branch and tag mutations are local to whichever checkout reconcile runs in — never `git push origin --delete`, never a pushed tag. Different checkouts converge independently and eventually; per-checkout staleness is expected and acceptable (origin-side branch cleanup already belongs to PR merges and tidy's remote-ref pruning).
- A closed-as-not-planned issue with a live claim still releases: a closed record cannot legitimately be in progress, whatever the close reason (explicit design decision — do not add a `stateReason` branch).
- `git branch -d` refusing does NOT mean unmerged — a branch merged into a different base refuses identically. Cherry equivalence, not `-d`'s verdict, is the evidence; that is the whole reason this module uses `-D` behind its own decision function.
- The `build/*` / `worktree-*` / `demo/*` namespace allowlist has no canonical source elsewhere in the repo — it is maintained manually here; a future plugin-owned prefix must be added by hand or its branches silently never age out.
- `npm test` failure counts that vary run-to-run on identical code track machine load — re-run the affected file in isolation before concluding regression.
