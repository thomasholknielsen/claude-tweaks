---
record: 663
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
fingerprint: post-580-settlement:residue-stale-remote-refs
surface: backend
---
# 663: residue branch check reads unpruned remote-tracking refs — flags branches already deleted upstream

Surface: backend

## Current State

`bin/lib/residue/probes/branches.js`'s `probeBranches` runs `git branch -r --format=%(refname:short) --merged {remoteRef}` against the local checkout's remote-tracking refs without ever fetching or pruning first. Twice on 2026-08-16 (post-#580 settlement wrap-up, run `2026-08-16T172549`) this flagged `origin/worktree-*` branches as "merged, not deleted" when the corresponding upstream branch had already been deleted (auto-deleted on merge, or cleaned up by a sibling tidy pass). The finding was a stale local `refs/remotes/origin/*` entry, not a real residue case. Each stale finding consumed a fix-now attempt that then failed with `remote ref does not exist` (git) or a 422 from the GitHub API, before a manual `git fetch --prune` revealed the ref was already gone.

`probeBranches` is called from `bin/residue.js` with an injected `run` function (an `execFileSync`-backed git runner), and its existing test suite (`tests/bin-lib/residue/probes-git.test.js`) already exercises it against a `stubRunner` fixture — the same seam a prune-then-probe regression test can use.

## Deliverables

- [ ] Before `probeBranches`'s `git branch -r --merged` read, run `git fetch --prune origin` (or `git remote prune origin`) against the same injected `run` seam already used for the merged-branch query
- [ ] On prune failure (offline / network error), degrade gracefully to the current unpruned read rather than failing the probe — tag every finding produced from that unpruned read so a consumer (the fix-now dispatch path) knows a proposed deletion may 422
- [ ] Regression test using the existing `stubRunner` fixture pattern (`tests/bin-lib/residue/probes-git.test.js`): a stale local tracking ref for a branch that is merged and already deleted upstream, once pruned, produces no `branch` finding

## Acceptance Criteria

1. Fixture: branch merged + deleted upstream + stale local tracking ref → after prune, `probeBranches` returns no `branch` finding for that branch
2. Fixture: prune call fails (simulated network failure) → `probeBranches` still returns the finding it would have returned unpruned, and that finding is tagged as degraded (e.g. via its `evidence` field, which is already excluded from the finding's fingerprint basis per `bin/lib/residue/finding.js`, so tagging doesn't mint a duplicate finding id)
3. `npm test` green

## Technical Approach

Add the prune call inside `probeBranches` (or immediately before it in `bin/residue.js`, whichever keeps the injected-`run` test seam intact) using the same `run(['...'])` calling convention `resolveRemoteRef` and the existing `--merged` call already use. Wrap it so a `null`/thrown result from `run` degrades rather than aborts the probe, mirroring the existing `out === null` → `{ ran: false, reason: ... }` handling already in `probeBranches` for the merged-branch read itself. Use the `evidence` field on `makeFinding` (excluded from the finding's identity fingerprint) to carry the degrade tag rather than adding a new field to the finding shape, keeping this a scoped change to one probe file plus its test.

## Gotchas

- The degrade tag must not become part of the finding's fingerprint basis (`kind`/`scope`/`subject` only, per `finding.js`) — an unpruned-then-pruned re-run of the same branch must resolve to the same finding id, not mint a duplicate.
- `git remote prune origin` and `git fetch --prune origin` differ slightly (prune-only vs. fetch-and-prune); pick one and note the choice in the implementation — the deliverable lists both as acceptable, not both as required.
- Keep the fix scoped to `probeBranches`'s own remote-tracking read; `bin/residue.js`'s other probes (`worktrees`, `forge`, `suite`, `release`, `pipeline-runs`) are out of scope for this record.

## Original request

residue branch check reads unpruned remote-tracking refs — flags branches already deleted upstream

Origin: post-#580 settlement wrap-up (run 2026-08-16T172549), observed twice in one day

## Current State

`bin/residue.js`'s merged-branch probe (`git branch -r --merged origin/main`) reads the local checkout's remote-tracking refs without fetching with `--prune` first. Twice on 2026-08-16 it flagged `origin/worktree-*` branches as "merged, not deleted" whose upstream refs were already gone (auto-deleted or sibling-tidied) — the finding was a stale local `refs/remotes/origin/*` entry. Each fix-now attempt errored (`remote ref does not exist` / 422 from the API) before `git fetch --prune` revealed the truth.

## Deliverables

- [ ] Before the branch probe, run `git fetch --prune origin` (or `git remote prune origin` for offline-tolerance) — degrade to the current unpruned read on network failure, tagging findings `unpruned-read` so the consumer knows deletion may 422
- [ ] Regression test with an injected git runner: a stale tracking ref for an upstream-deleted branch produces no finding after prune

## Acceptance Criteria

1. Fixture: branch merged + deleted upstream + stale local tracking ref → no `branch` finding
2. Network-failure path still returns the unpruned finding with the degrade tag
3. `npm test` green


<!-- work-fingerprint: post-580-settlement:residue-stale-remote-refs -->

