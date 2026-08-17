---
record: 683
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 683: scratch-worktree teardown: mandatory post-creation catch-up makes ExitWorktree's guard report upstream commits as data loss; pr-first merge leaves the remote branch behind

Surface: backend

## Current State

- `skills/_shared/worktree-setup.md` "Post-creation catch-up" runs, unconditionally, `git fetch origin {integration-branch}` + `git merge origin/{integration-branch}` inside every new worktree — including scratch worktrees whose branch was cut from a stale local integration branch. Every upstream commit therefore lands on the scratch branch as if it were the session's own work.
- `ExitWorktree`'s data-loss guard counts commits on the worktree branch not on its base and refuses removal ("Worktree has 64 commits … will discard this work permanently"). Measured: 64 reported, 1 genuinely the session's (already merged), 0 unmerged; 2 `ExitWorktree` calls for one removal; the ancestry proof used to justify `discard_changes: true` was improvised.
- `skills/_shared/scratch-worktree.md` §6 "Tearing down" says only: use `ExitWorktree`, never raw `git worktree remove` (`[IL-58]`), and describes the reaper's domain. It offers no sanctioned "is it safe to discard" check.
- `skills/_shared/pr-first-merge.md` has no remote-branch cleanup in any merge shape (`grep -n "delete-branch\|push origin --delete" skills/_shared/pr-first-merge.md` → nothing); `gh pr merge --delete-branch` errors against a live worktree (project memory). `git ls-remote --heads origin 'worktree-*'` → 11 stale heads today.
- `bin/lib/reconcile`'s mirror-ff already fast-forwards the main checkout's integration branch (`--ff-only`, best-effort) at SessionStart and other trigger points — but nothing guarantees it ran immediately before a scratch worktree is cut.

## Deliverables

- [ ] `scratch-worktree.md` §6: the sanctioned pre-teardown check — `git fetch origin {integration-branch} && git merge-base --is-ancestor HEAD origin/{integration-branch}`; on exit 0 call `ExitWorktree` with `discard_changes: true` and state why in one line; on non-zero **stop and surface** (`git log origin/{integration-branch}..HEAD --oneline`) — never override the guard without the proof.
- [ ] `scratch-worktree.md` §2 (creating) and `worktree-setup.md`: before `EnterWorktree`, fast-forward the local integration branch to origin's tip via `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" reconcile` (its mirror-ff is the sanctioned, worktree-safe way — never `git checkout`/`git pull` in the shared checkout), so a scratch branch starts at origin's tip and the catch-up merge is a no-op. The catch-up itself stays unconditional (its rationale stands); the point is that it normally adds zero commits.
- [ ] `pr-first-merge.md`: after outcome `merged` **and after worktree teardown**, delete the remote branch — `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/{branch}"` (preferred: no `git push` from the main checkout, works after the worktree is gone) — guarded: never the integration branch; tolerate "reference does not exist". Document why `gh pr merge --delete-branch` is not used. One canonical statement; `scratch-worktree.md` §5/§6 and `wrap-up/cleanup-procedures.md` item 4 cite it (state-once rule, `docs/skill-graph.md`).
- [ ] Conformance tests pinning the three prose additions; unit tests with the fake runner if any code (reconcile / wrap-up cleanup) gains the remote delete.

## Acceptance Criteria

1. `scratch-worktree.md` §6 contains the `is-ancestor` check naming both refs (exit 0 → discard with the one-line reason; else stop + `git log` listing).
2. The creation procedure names the pre-`EnterWorktree` mirror-ff step and forbids `checkout`/`pull` in the shared checkout.
3. `pr-first-merge.md` contains exactly one remote-branch-delete statement, ordered after teardown, with the `--delete-branch` rejection rationale; the other two files cite it rather than restate it.
4. Manual verification on this repo: create a scratch worktree per the new procedure, make one commit, PR + merge, tear down — `ExitWorktree` needs no `discard_changes` override for upstream commits, and `git ls-remote --heads origin <branch>` is empty afterward.
5. Conformance tests fail if any of the three prose blocks is removed; `npm test` passes.

## Technical Approach

- Reuse reconcile's mirror-ff rather than a new git recipe; the only new commands are `merge-base --is-ancestor` and the ref DELETE.
- Ordering in `pr-first-merge.md`: Step 4 reconcile → worktree teardown (wrap-up cleanup item 4) → remote branch delete. Step 4 forbids `git push` in the main checkout and the pre-tool-use gate denies it under worktree-always — hence `gh api` DELETE, not `git push origin --delete`.

### Key Files
- `skills/_shared/scratch-worktree.md` §2, §5, §6
- `skills/_shared/worktree-setup.md`
- `skills/_shared/pr-first-merge.md`
- `skills/wrap-up/cleanup-procedures.md` (item 4 cross-reference)
- `tests/` conformance

## Gotchas

- Read `bin/lib/hooks/worktree-reap.js` and `bin/lib/reconcile` first: verify neither's merged-detection depends on the remote branch still existing before deleting it.
- Don't touch the 11 existing stale heads in this record — that's a one-off `/claude-tweaks:tidy` sweep; run or file it separately.
- `ExitWorktree`'s guard semantics are the harness's, not ours — this record fixes what feeds it (branch start point) and the sanctioned override, not the guard.
- The `gh`-absent transport (`_shared/github-write-transport.md`) needs the equivalent MCP call for the ref delete; state it or state that the delete is skipped there.

## Original request

scratch-worktree teardown: mandatory post-creation catch-up makes ExitWorktree's guard report upstream commits as data loss; pr-first merge leaves the remote branch behind

**Summary:** `_shared/worktree-setup.md`'s unconditional catch-up (fetch + ff) puts every upstream commit on a fresh scratch branch, so `ExitWorktree` refuses removal ("Worktree has 64 commits … will discard this work permanently") for a branch whose only real commit was already merged; `scratch-worktree.md` §6 offers no sanctioned answer, so the session improvised the ancestry proof before overriding with `discard_changes: true`. Separately, `pr-first-merge.md`'s merge shapes carry no branch cleanup — 11 stale `worktree-*` heads sit on origin, +1 from this run.

**Kind:** Gap

**Affected component:** `skills/_shared/scratch-worktree.md` §6; `skills/_shared/worktree-setup.md` (post-creation catch-up); `skills/_shared/pr-first-merge.md`

**Objective:** Recovery quality

**Measurement:** 1 teardown-guard false positive (64 commits reported at risk, 1 genuinely the session's, 0 unmerged); 2 `ExitWorktree` calls for 1 removal; 11 stale `worktree-*` heads on origin after this run.

**Use case:** A scratch worktree used for one CHANGELOG-only PR should tear down with no data-loss override and leave no remote branch behind.

**Proposed fix:** (1) `scratch-worktree.md` §6 states the sanctioned check: `git merge-base --is-ancestor HEAD origin/{integration-branch}` — remove with `discard_changes: true` only on exit 0, otherwise stop and surface. (2) Since the catch-up is unconditional and `baseRef` unverifiable, ff the local integration branch *before* `EnterWorktree` so a scratch branch starts at origin's tip and the guard never counts upstream history as pending work. (3) Add an explicit post-merge `git push origin --delete {branch}` to `pr-first-merge.md`, run after worktree teardown (not `gh pr merge --delete-branch`, which errors against a live worktree).

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-1bc8130b -->

