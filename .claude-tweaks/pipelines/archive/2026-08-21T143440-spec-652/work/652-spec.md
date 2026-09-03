---
record: 652
origin: human
risk: medium
size: low
ceremony: fast-lane
grants: [build]
surface: infra
---
# 652: session-start reconciliation: leaves tracked-file deletions uncommitted after archiving pipeline runs

Surface: infra

## Current State

- `bin/lib/hooks/session-start.js` invokes `reconcile()` (`bin/lib/reconcile/index.js`) on every session start under the `pr-first` integration model.
- The `archive` check (`bin/lib/reconcile/archive-merged.js`'s `archiveMerged` → `archiveRunDir`) is the only reconcile step that touches a git-tracked path: when a completed run's `work/` subdirectory is git-tracked (per `.gitignore`'s `!.claude-tweaks/pipelines/*/work/**` exception), it runs `git mv work/ .claude-tweaks/pipelines/archive/{runId}/work/` in the main checkout, then immediately runs `git commit -m "[reconcile] archive run {runId}"` (added by commit `a98b9d29e`, "Fix 3 reconciler defects found by the pre-release whole-branch review").
- That commit call has no rollback on failure: `archiveRunDir` returns `{ ok: false, reason: 'commit-failed' }` and stops, but the `git mv` already ran and physically moved the files on disk (not merely staged them) before the commit attempt failed.
- On any subsequent reconcile pass (next session start, next `/dispatch` queue pull), the retry guard at the top of the `work/` block is `if (fs.existsSync(workSrc))` — but `workSrc` (the original `work/` path) no longer exists on disk once `git mv` has run once, commit or no commit. The retry therefore silently skips the entire git-mv+commit block on every subsequent pass, so a commit failure is never retried and the staged, uncommitted rename (which `git status` reports as the old path deleted, the new path added) persists in the main checkout indefinitely.
- This matches the reported symptom: `git status` in the main checkout shows tracked `work/*-spec.md` files as deleted-but-uncommitted after a "reconciled — N pipeline run(s) archived" banner, and an unrelated project's clean-tree gate downstream refused to run because of it.
- `git commit` can fail for reasons outside the reconciler's control — a `commit.gpgsign` requirement, a failing pre-commit/commit-msg hook, a lock file held by a concurrent process, or a `worktree-always`-style policy gate rejecting a commit issued from the main checkout outside an isolated worktree.

## Deliverables

- Change `archiveRunDir` (`bin/lib/reconcile/archive-merged.js`) so a `git commit` failure after a successful `git mv` never leaves the main checkout's tracked tree dirty indefinitely — either by reverting the staged rename (`git reset` the path, then move the files back to `workSrc` on disk, mirroring the existing `fs.renameSync` idiom already used elsewhere in this file) so the run stays non-terminal and is retried cleanly next pass, or by making the retry guard detect "mv done, not yet committed" (e.g. check the archive destination plus outstanding staged/uncommitted state, not just `fs.existsSync(workSrc)`) so a future pass retries just the commit.
- Whichever approach is chosen, guarantee a `commit-failed` result never becomes a permanent silent no-op: every subsequent reconcile pass must either successfully complete the archive (mv + commit) or leave the tree in the same clean state it started in.
- Add/adjust unit test coverage in the existing reconcile test suite that exercises the `commit-failed` path specifically (a fake `runGit` returning failure on the commit call only, with `mv` succeeding) and asserts the working tree is provably clean — or provably retried-and-cleaned on a second pass — rather than only asserting the function's return value.

## Acceptance Criteria

- [ ] A reconcile pass in which `git mv` succeeds but `git commit` fails leaves the main checkout's tracked working tree in the same clean state it was in before the pass (no staged-but-uncommitted rename survives the pass), verified by a test that asserts the working tree is clean after the failed pass — not just that the function returned `{ ok: false }`.
- [ ] A second reconcile pass, run after the first pass's commit-failure cause is resolved (e.g. the fake `runGit` now succeeds), successfully completes the archive — the run is no longer stuck permanently skipped by the `fs.existsSync(workSrc)` guard.
- [ ] Existing reconcile tests covering `archive-merged.js` continue to pass unchanged for the already-working success path (mv and commit both succeed).
- [ ] `npm test` passes in full.

## Technical Approach

- Prefer the revert-on-failure approach over the retry-guard approach: on `commit.failure`, run `git reset` (unstage the path) then move the files back from `archiveDir/work` to `workSrc` on disk, then return `{ ok: false, reason: 'commit-failed' }` exactly as today. This keeps the retry guard (`fs.existsSync(workSrc)`) correct as-is — the next pass sees `workSrc` still present and retries the whole mv+commit sequence cleanly, with no new state-detection logic needed.
- If a full on-disk revert of `git mv`'s rename proves unreliable (verify empirically with a throwaway repro before committing to this approach — a plain `git reset` plus `fs.renameSync` may not cleanly undo everything `git mv` touched in the index), fall back to the retry-guard approach instead: change the guard to also treat "workSrc gone AND archiveDir/work present AND no commit landed" as a retry case, and re-issue just the `git commit` call on the next pass.
- Read `archive-merged.js`'s existing "Moves-first, close-last ordering" comment before changing anything — it already reasons about partial-failure recovery for the *other* `fs.renameSync` loop further down in the same function; the same retry-safety property needs to hold for the git-mv+commit step, which today it does not.
- Check whether a commit-gating policy (of the kind `worktree-always` describes for edits) could itself be one of the failure causes for a commit issued from the main checkout by `session-start.js` — if so, note whether the reconciler's commit call already carries any exemption, and whether this defect's root cause is actually a policy-gate rejection rather than a git-level failure; that determines which of the two fix approaches above is correct.

## Gotchas

- The fix must not commit or discard any *other* dirty state that happens to be sitting in the main checkout at reconcile time — the revert/retry logic should operate narrowly on the single git-mv it just issued, never a blanket reset of the whole tree.
- `session-start.js` and `reconcile()` are documented as "never breaks a session — every error path degrades to a reported skip, never a thrown exception." Whatever fix lands here must preserve that invariant — a revert-on-failure path must itself be wrapped so a revert failure also degrades to a skip, not an unhandled throw.
- This is a `SessionStart` hook path with no supervising human able to intervene mid-run — any new code path added here needs to be provably safe to run unattended (idempotent, no destructive git operations beyond the narrow revert described above).
- Confirm via a throwaway repro (a scratch git repo, or a debug harness around `archiveRunDir` with a fake `runGit`) that a forced `commit.failure` really does reproduce the dirty-tree symptom before writing the fix — don't fix based on code-reading alone without confirming the failure mode empirically first.

## Original request

session-start reconciliation: leaves tracked-file deletions uncommitted after archiving pipeline runs

**Summary:** Session-start pipeline reconciliation (the "reconciled — N pipeline run(s) archived" banner) deletes files from old/interrupted pipeline runs without committing the deletion, leaving the main checkout's tracked working tree dirty for the rest of the session.

**Kind:** Defect

**Affected component:** Session-start reconciliation / archive-run hook (the step that produces the "reconciled — N pipeline run(s) archived" banner)

**Repro steps:**
1. Have one or more old pipeline run directories under `.claude-tweaks/pipelines/` with tracked `work/*-spec.md` files eligible for reconciliation/archival.
2. Start a new Claude Code session in the project — the session-start hook reports "reconciled — N pipeline run(s) archived."
3. Run `git status` in the main checkout.

**Expected vs. actual:**
Expected: either the reconciliation step commits the file removal itself, or it leaves the tracked tree untouched (e.g. only touches files outside git tracking, or truly archives via `git mv`+commit rather than a bare delete).
Actual: the tracked files show as deleted-but-uncommitted in `git status`. In a project running `worktree.always`, this dirty tracked state persists in the *main* checkout (not a worktree) since standalone/session-start hooks operate there directly. Later in the same session, an unrelated project script's clean-working-tree gate (a private project's own deploy script, not a claude-tweaks command) refused to run because of these unrelated tracked deletions, requiring investigation and a manual `git checkout --` to restore the files before the unrelated task could proceed.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-495a2b87 -->

