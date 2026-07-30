# Durable-State Git-Native Write Path (+ code-health `.` slice fix)

## Problem

`bin/lib/health-core/durable-state.js`'s `writeState()` — the cursor/retry-queue/run-history
persistence shared by `code-health`, `harness-health`, `journey-health`, and `docs-health` on the
dedicated `health-state` branch — builds every write via `gh api repos/{owner}/{repo}/git/blobs|
trees|commits|refs`. `gh` is not installed in a Claude Code cloud Routine (CCR) sandbox. v6.21.0
added a `hasGh()` capability probe with a documented GitHub-MCP-based fallback
(`create_or_update_file`/`create_branch`, driven by the calling skill's own prose since MCP tools
can't be invoked from `writeState`'s spawned subprocess) — see
`docs/superpowers/specs/2026-07-28-gh-cli-mcp-fallback-design.md` and ADR 0008.

Across 3 live-fired rounds against a real project (12 firings: code-health/harness-health/
docs-health × 3, plus journey-health's regular schedule), that MCP fallback was used **zero**
times. 3 of 4 skills simply hit the `gh` ENOENT, reported the gap in their own transcript, and
stopped. One run (harness-health, round 1 only) improvised an **undocumented** workaround instead:
cloned a temp worktree and ran plain `git push` directly — which worked cleanly. That is direct,
empirical proof that plain git push credentials are available in the CCR sandbox, independent of
both `gh` CLI and any MCP server. It was not repeated by that skill's own later rounds, and no
other skill adopted it.

**Net effect (GitHub #63):** a health engine running as a cloud Routine can correctly *read* the
last-known cursor state but can never *advance* it during its own firing — `health-core/
rotation.js`'s `selectByStaleThenChurn` keeps re-selecting the same highest-priority candidate on
every subsequent cloud firing, since its own audit attempts never register.

**A second, masked bug (GitHub #66):** because cursors never persisted from a cloud firing, three
live rounds also exposed that `code-health`'s `next-slice` resolves to the literal repo root `.`
as a "slice" on a cold/never-advanced cursor — and `.` is defined recursively, so it sweeps the
*entire* repository (~4,200 files in the audited case) in one pass, rather than a scoped,
judgeable unit. This is a distinct bug from #63 (it's about `listSlices`'s candidate definition,
not persistence), but #63 was masking it: a cursor that actually advances turns "every firing hits
this" into "only a repo's very first-ever firing hits this," so shipping the #63 fix without also
fixing #66 would trade a chronic bug for a fresh one that reappears the moment a new project's
health-state cursor goes cold.

## Why plain git instead of gh-api-primary + MCP-fallback

The 2026-07-28 design's own framing was "gh CLI locally, GitHub MCP tools in cloud" — but that
framing has a blind spot for this specific call site: `writeState`'s blob/tree/commit/ref
operations are **plain Git Data API primitives with no GitHub-specific semantics** (unlike, say,
`gh issue create`, which has no git-native equivalent at all). The read half of this exact module
already does `git fetch`/`git show` directly, gh-free, in every environment. The live evidence
above shows the write half can do the same: `git hash-object`/`mktree`/`commit-tree`/`push`
construct and publish the identical commit, with no `gh` or MCP dependency, working unmodified in
both the interactive/local case and the cloud-sandbox case that motivated the original fallback
design.

This also sidesteps a documented constraint the original design had to work around: MCP tools can
only be invoked from the calling agent's own turn, never from `writeState`'s spawned Node
subprocess — which is exactly why the MCP path could not be self-contained and instead had to
surface a `needsMcpWrite` signal for the calling skill's own prose to act on. A git-native primary
path has no such split; the whole write completes inside `writeState` itself, in one call, on
every transport.

**Scope note:** this is a narrower reversal than the full 2026-07-28 design. Dispatch's claim lock
(#61) and `/tidy`'s digest (#60) still need the gh-CLI-vs-MCP fallback for genuine GitHub-API-only
operations (`gh issue create`/`edit`/`comment`/`close` have no git-plumbing equivalent) — this
design touches only `durable-state.js`'s cursor/retry-queue/run-history writer. Dispatch's claim
lock is a structurally identical "conditional write to a dedicated branch" problem and could
plausibly take the same git-native fix later, but that's out of scope here (#61 is a separate,
already-filed issue) — flagged as a follow-up, not actioned in this build.

## Architecture

**Tree construction: explicit `ls-tree`/`mktree` rebuild, not a temp-index.** Two ways exist to
build a new commit's tree from git plumbing: (a) read the existing tree via `git ls-tree`, splice
in new blob shas for the paths being written, rebuild via `git mktree`; or (b) point
`GIT_INDEX_FILE` at a temp file, `git read-tree` the base, `git update-index --add --cacheinfo`
per file, `git write-tree`. (a) wins because every step is a discrete, injectable `run(cmd, args,
opts)` call — matching `durable-state.test.js`'s existing `fakeRunner` pattern byte-for-byte,
where a fake runner matches on `(cmd, args)` and returns canned output, with zero real
filesystem/env side effects. (b) would need a real temp file and env var per call, which doesn't
fit that pattern. The branch's layout is flat (`{skillName}/{file}.json`, no nested
subdirectories), so (a) is exactly two `mktree` calls — the skill's own subtree, then the root
tree — not a general recursive tree walker.

**`ensureBranch` is deleted, not just changed.** The old design needed a separate bootstrap step
only because GitHub's Data API genuinely splits ref creation (`POST .../git/refs`, new refs only)
from ref update (`PATCH .../git/refs/heads/{branch}`, existing refs only) — `writeState` had to
guarantee the branch existed before its PATCH-based CAS loop could run at all. Plain `git push
origin <sha>:refs/heads/health-state` has no such split: it creates the ref if absent,
fast-forward-updates it if present, and rejects a non-fast-forward push either way — exactly the
CAS guarantee needed, uniformly, for both bootstrap and steady-state. The very first write's
commit (parent `null`, containing that firing's real content) *is* the bootstrap; no placeholder
empty-tree commit is needed first.

**CAS / retry loop keeps its existing shape:** fetch → resolve parent commit + base tree (`null`/
`EMPTY_TREE_SHA` if the branch doesn't exist yet) → merge new blobs into the skill's existing
subtree, preserving any file this write doesn't touch (e.g. a stale `remembered.json` surviving an
`includeRemembered` toggle) → rebuild both tree levels → commit → `git push` → on failure, re-fetch
and check whether the commit landed anyway (same ambiguous-failure disambiguation `writeState`
already has) → else sleep(`casBackoffMs(attempt)`) and retry the whole cycle, bounded at
`MAX_CAS_ATTEMPTS`, returning `{ ok: false, error }` on exhaustion — never throws, unchanged
contract.

**The entire MCP-fallback layer is deleted**, not kept as a secondary path: `hasGh`,
`needsMcpWrite`, `mcp-pending.js`, `retry-durable-write.js`, and the ~110-line "MCP write path"
procedure in `health-state.md`. `git push` becomes the *only* write mechanism, identical on every
transport. A hard failure (no push credentials at all) fails every CAS attempt identically and
exhausts to `{ ok: false }`, same as any other exhaustion case today — safe, since a lost cursor
write just costs the next firing a redundant re-scan (GitHub-issue fingerprint dedup prevents a
duplicate filing).

## Components

| Component | Change |
|---|---|
| `bin/lib/health-core/durable-state.js` | Delete `defaultHasGh`/`hasGh` param, `needsMcpWrite`, `ensureBranch`, and the gh-api `createBlob`/`createTree`/`createCommit`/`updateRef`/`createRef`. Add `readTreeEntries(root, treeSha)` (parses `git ls-tree`), `writeBlob(root, content)` (`git hash-object -w --stdin`), `writeTree(root, entries)` (`git mktree`, sorted input), `writeCommit(root, treeSha, parentSha, message)` (`git commit-tree`), `pushRef(root, commitSha)` (`git push origin <sha>:refs/heads/health-state`). `writeState`'s loop rewritten around these. `readState` and its helpers (`showFile`, `currentCommitSha`, `currentRefShas`, `readFilesAtFetchedTip`) are untouched — already git-native. |
| `bin/lib/health-core/mcp-pending.js` | Deleted. |
| `bin/lib/health-core/retry-durable-write.js` | Deleted. |
| `bin/lib/health-core/retry-cli.js` | `update()` loses its `result.needsMcpWrite` branch. |
| `bin/code-health.js`, `bin/harness-health.js`, `bin/journey-health.js`, `bin/docs-health.js` | Each loses its `needsMcpWrite` handling around `validate-findings`, the `emitPendingWrite`/`emitRetryInput` imports, and the `retry-durable-write` subcommand + help text. |
| `bin/lib/code-health/scope.js` | `listSlices`'s `.` candidate redefined to direct file children of root only (maxdepth-1), not the whole repo recursively — see the separate section below. |
| `skills/_shared/health-state.md` | Delete the "MCP write path" section; rewrite "Mechanism" to describe the git-native write (fetch → ls-tree → hash-object → mktree ×2 → commit-tree → push). |
| `skills/_shared/github-write-transport.md` | Note that health-state's cursor CAS no longer uses this file's gh-CLI-vs-MCP mapping — dispatch's claim lock still does, untouched. |
| `skills/code-health/SKILL.md`, `skills/harness-health/SKILL.md`, `skills/journey-health/SKILL.md`, `skills/docs-health/SKILL.md` | Delete the `HEALTH_STATE_MCP_PENDING_WRITE` stderr-check snippet (2 occurrences each). |
| `CLAUDE.md` | Structure table: trim "...underlying both issue-claims' claim lock and health-state's cursor writer" down to just issue-claims' claim lock. |
| `bin/lib/health-core/tests/durable-state.test.js` | Rewritten `fakeRunner` rules for the new git-plumbing sequence; same test shapes (first-attempt success, retry-then-succeed, exhaustion, ambiguous-failure-as-success, bootstrap, remembered/declined opt-in gating) verified against the new commands. `hasGh`/`needsMcpWrite` tests deleted. New test: an existing untouched file in a skill's subtree survives a write that doesn't touch it. |
| `bin/lib/health-core/tests/mcp-pending-signal.test.js` | Deleted. |
| `bin/lib/health-core/tests/retry-cli.test.js` | MCP-path coverage removed. |
| `bin/lib/code-health/tests/scope.test.js` | New tests for `.`'s non-recursive scope (see below). |
| ADR 0005, ADR 0008 | Not edited in this build — flagged as ADR-candidates for `/wrap-up`'s Step 6.2 to mark superseded (`_shared/decision-records.md`: ADR status changes happen at wrap-up, not during brainstorming/build). |

## Data flow

Steady-state write:

```
git fetch origin health-state
git rev-parse origin/health-state origin/health-state^{tree}   # parent + base tree
                                                                  # (null / EMPTY_TREE_SHA if branch absent)
git ls-tree <baseTreeSha>                                       # root entries (skip if bootstrap)
git ls-tree <skillSubtreeSha>                                    # this skill's existing files (skip if absent)
git hash-object -w --stdin   × N files                           # new blobs
git mktree                                                       # rebuilt skill subtree
git mktree                                                       # rebuilt root tree (skill's entry replaced)
git commit-tree <rootTree> [-p <parent>] -m "health-state: {skill} update"
git push origin <commitSha>:refs/heads/health-state              # the CAS
```

On push failure: `git fetch` + `git rev-parse origin/health-state`, compare to the attempted
commit sha (ambiguous-failure disambiguation, unchanged from today) — if it matches, treat as
success without re-invoking the mutator (avoids double-applying a non-idempotent mutator like
`enqueueRetry`'s `attempts++`); if not, sleep `casBackoffMs(attempt)` and retry the whole cycle
from the top, up to `MAX_CAS_ATTEMPTS`.

## Error handling

No new failure classification beyond what `writeState` already has. Any error during an attempt
(auth, network, non-fast-forward rejection, anything else) consumes one of `MAX_CAS_ATTEMPTS`
retries, identically. A hard failure (e.g., no push credentials at all) fails every attempt the
same way and exhausts cleanly to `{ ok: false, error }` — never throws. This matches
`writeState`'s existing contract and its documented reasoning: a lost cursor write is safe,
because GitHub-issue fingerprint dedup during `validate-findings` turns a redundant re-scan into a
no-op, never a duplicate issue.

## Testing

- `durable-state.test.js`: full rewrite of the `fakeRunner` script rules for the new command
  sequence. Every existing scenario (first-attempt success, retry-then-succeed on rejection,
  CAS exhaustion, jittered/increasing backoff, bootstrap on an empty branch, ambiguous-failure
  treated as success, ambiguous-failure NOT swallowing a genuine conflict, remembered/declined
  opt-in gating) gets an equivalent test against the git-plumbing sequence. All `hasGh`/
  `needsMcpWrite` tests deleted.
- New test: a file already present in a skill's subtree that this write doesn't touch (e.g. an
  old `remembered.json` after `includeRemembered` was turned off) survives unchanged — the direct
  analog of GitHub's `base_tree` partial-update guarantee, now implemented via the `ls-tree`
  merge instead of the Data API.
- `mcp-pending-signal.test.js` deleted. MCP-path assertions in `retry-cli.test.js` deleted.
- Full-suite regression: `npm test` green throughout — behavior-preserving for every caller's
  observable contract (`{ ok: true }` / `{ ok: false, error }`), only the write mechanism changes.

## code-health `.` slice fix (#66)

**Root cause:** `listSlices` unconditionally includes `{ id: '.', path: root }` as a candidate
representing the *entire* repository root, scanned recursively (`sourceFiles`/`contentHash`/
`gitChurn` all treat `absDir` as a directory to recurse into fully). Every subdirectory and
workspace-expanded package already gets its own separate slice, so `.` silently double-covers all
of them too — not just on a cold cursor. Because the candidate list is sorted alphabetically and
`.` always sorts first, `selectByStaleThenChurn`'s Phase 1 (force-pick anything unaudited past the
staleness threshold) always picks `.` first on a cold cursor, where "unaudited" means every
candidate — so a never-before-swept repo's very first `next-slice` call always returns the whole
repository as "one slice," which the skill's own transcript correctly judged as "not viable to
judge in one pass" for a ~4,200-file repo.

**Fix:** redefine `.` to mean "files directly in the repo root, not inside any subdirectory"
(maxdepth-1), not "the whole repo root, recursively." This eliminates the overlap with
subdirectory/workspace slices entirely (each slice now covers a disjoint part of the tree) while
still auditing genuinely loose root-level source files that no other slice would ever pick up. A
fully flat repo with no subdirectories is unaffected — every one of its files is already a direct
root child, so maxdepth-1 and full recursion produce the same file set.

**Implementation:** `sourceFiles(absDir, { recursive = true } = {})` gains a `recursive` option;
when `false`, its `find` invocation uses `-maxdepth 1` instead of unbounded depth. `contentHash`
and `readSourceFileData`/`readSourceFileDataCached` thread the same option through. `gitChurn`
gains the equivalent for its `.` case: instead of `git log -- .` (whole-repo history), pass the
actual list of direct root-level source file paths as separate pathspecs, so churn reflects only
those files' history. `selectSlice`'s call sites pass `{ recursive: slice.id !== '.' }` (or
equivalent) when computing hash/churn for a candidate.

**Testing:** new `scope.test.js` cases — `.`'s content-hash is unaffected by a change inside a
subdirectory (proving the overlap is gone); `.`'s content-hash DOES change when a direct
root-level file changes (proving coverage is preserved); a flat repo with no subdirectories
produces the same `.` hash under both recursive and non-recursive scanning (proving the small-repo
case is unaffected).

## Out of scope

- #61 (dispatch's claim lock, same gh-CLI-only root cause) and #60 (`/tidy`'s digest) — both are
  genuine GitHub-API-only operations (`gh issue create`/`edit`/`comment`/`close`) with no
  git-plumbing equivalent, so they keep the gh-CLI-vs-MCP fallback design from ADR 0008 unchanged.
  Whether dispatch's claim lock (a structurally identical "conditional write to a dedicated
  branch" problem) could later take the same git-native treatment is a plausible follow-up, not
  actioned here.
- #62 (pipeline run-dir bookkeeping cross-contamination) — unrelated root cause.
- #67/#68/#69/#71/#72 — separate issues from the same live-testing session, tracked and built
  separately per the user's own triage ordering.
- Writing or amending ADRs — flagged as candidates for `/wrap-up`'s Step 6.2 gate, not done here.
