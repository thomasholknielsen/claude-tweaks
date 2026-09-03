---
record: 594
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: infra
---
# 594: bin/hooks.js: no teardown-run — pipeline teardown is 4-5 hand-assembled commands per run (close-run only flips state)

Surface: infra

## Current State

- `bin/hooks.js`'s `close-run` subcommand (line 188) only flips `run-state.json` to `status: 'clean'` and clears `worktree` — it never touches the filesystem, the git worktree, branches, or refs.
- `bin/lib/reconcile/archive-merged.js`'s `archiveRunDir` already implements git-aware archival: `git mv` the tracked `work/` subdirectory into `archive/{run-id}/work`, plain move for the rest, then commit — this is the mechanics #593 (open, in progress) asks to reuse, not reinvent.
- `bin/lib/hooks/worktree-reap.js` already implements lock/eligibility detection (`parseWorktreeList`, pid-liveness, `ORPHAN_GRACE_MS`) for deciding whether a worktree is safe to remove without breaking a live session.
- `skills/_shared/pr-first-merge.md` Step 5 documents the sanctioned remote-branch-deletion mechanism: `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/{branch}"`, never `git push origin --delete` (denied by `worktree.always` from the main checkout) and never `gh pr merge --delete-branch`.
- `skills/wrap-up/cleanup-procedures.md` Section C documents the manual sequence today: step 4 (worktree remove — `ExitWorktree` for the session's own worktree, raw `git worktree remove {path}` only for an unlocked worktree the session does not occupy), step 5 (`git branch -d`), step 6 (delegates to `pr-first-merge.md` Step 5 for the remote delete).
- `skills/flow/multispec-review-console.md`'s Shared teardown (step 6) independently re-derives the same worktree-removal sequence for the multi-spec case.
- No `tests/bin-lib/hooks/` directory exists anywhere in the repo. This repo's actual convention for hook-module tests is flat `tests/hooks-{module}.test.js` files (e.g. `tests/hooks-dispatcher.test.js`, `tests/hooks-context.test.js`, `tests/hooks-worktree-reap.test.js`) — the original request's `tests/bin-lib/hooks/` path does not match the codebase's real test layout; see Gotchas.

## Deliverables

- [ ] `bin/hooks.js`: new `teardown-run --run <dir> [--merged|--abandoned]` subcommand, dispatched the same way as `close-run`/`record-worktree` (`resolveRunArg` for `--run`, no compound shell, absolute paths only, `return 0` always)
- [ ] Step 1 (state): reuse `close-run`'s existing terminal-state logic — factor it into a shared function both subcommands call rather than duplicating it
- [ ] Step 2 (archive): call into `archive-merged.js`'s `archiveRunDir` git-mv-and-commit sequence (or a helper both it and `teardown-run` share) rather than a second, divergent archival path — pick up #593's fix once merged rather than forking around it
- [ ] Step 3 (worktree removal): reuse `worktree-reap.js`'s lock/eligibility predicate — skip and report (never force) when the worktree is locked by a live session pid; remove via plain `git worktree remove {path}` only when unlocked. This command is never invoked against the session's own live worktree — that path stays `ExitWorktree` per `[IL-58]`, unchanged.
- [ ] Step 4 (local branch delete): `git branch -D {branch}` only under `--merged`; `--abandoned` skips this step and reports why
- [ ] Step 5 (remote ref delete): `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/{branch}"` — the exact mechanism `pr-first-merge.md` Step 5 already specifies; tolerate "reference does not exist" as success; refuse (not skip) if the target branch matches the integration branch
- [ ] One summary line per step printed to stdout, each carrying a `skipped — {reason}` suffix when a step didn't run (locked worktree, `--abandoned`, no remote ref, foreign-owned run, etc.) — mirrors the existing subcommands' one-line-per-outcome convention
- [ ] `skills/wrap-up/cleanup-procedures.md` Section C: replace steps 4-6's prescribed command sequence with a single `teardown-run` invocation, keeping the Teardown ordering invariant prose and the "own worktree → `ExitWorktree`, never `teardown-run`" carve-out explicit
- [ ] `skills/flow/multispec-review-console.md`'s Shared teardown (step 6 and its cross-references to Section C step 4): same replacement
- [ ] Fixture tests at `tests/hooks-teardown-run.test.js` (matching this repo's existing flat `tests/hooks-{module}.test.js` naming) covering: a merged run where all 5 steps succeed; a locked worktree (step 3 skips and reports, doesn't throw); `--abandoned` (steps 4-5 skip); an already-deleted remote ref (step 5 reports success, not failure); an explicit `--run` pointing at a foreign-session-owned run (mirrors `close-run`'s existing `foreignOwner` refusal); and a branch-name-equals-integration-branch guard (step 4/5 refuse rather than delete)

## Acceptance Criteria

1. `node bin/hooks.js teardown-run --run <dir> --merged` on a fixture run dir with a git-tracked `work/` subtree, an unlocked worktree, and a merged branch performs all 5 steps and exits 0, leaving the run directory under `archive/{run-id}/` (both `work/` and the untracked half moved) and the branch gone both locally and on the fixture remote.
2. Running the same command against a run dir whose worktree is locked by a live (or fixture-live) pid skips step 3, prints a `skipped — worktree locked` line, and does not remove the worktree, delete the branch, or fail the whole call.
3. `--abandoned` skips branch deletion (step 4) and remote ref deletion (step 5) even when the branch happens to exist, printing `skipped — abandoned` for each.
4. A remote ref that no longer exists (already deleted) is reported as success, not an error — matching `pr-first-merge.md` Step 5's "tolerate reference-does-not-exist" rule.
5. The command refuses to delete the integration branch itself when the run's recorded branch matches it — asserted by a test, not merely documented — never issuing the delete call in that case.
6. `close-run --run <dir>` (unchanged, called standalone) still works exactly as today — `teardown-run`'s Step 1 does not remove, rename, or gate the existing subcommand.
7. `skills/wrap-up/cleanup-procedures.md` Section C steps 4-6 and `skills/flow/multispec-review-console.md`'s Shared teardown step 6 both invoke `teardown-run` instead of prescribing the git/gh commands inline; the "own worktree → `ExitWorktree`, never `teardown-run`" distinction is stated explicitly in both.
8. `npm test` passes, including the new `tests/hooks-teardown-run.test.js` fixture suite.

## Technical Approach

`teardown-run` is a composition, not new git logic: each of its 5 steps already has an existing, tested implementation elsewhere in the codebase (`close-run`'s state flip, `archive-merged.js`'s git-mv archival, `worktree-reap.js`'s lock/eligibility predicate, `pr-first-merge.md` Step 5's ref-delete mechanism). The work is (a) extracting whichever of these are currently private to their own module into a shape both the original caller and `teardown-run` can call, (b) sequencing them behind one subcommand with per-step try/skip/report semantics — never let one step's skip abort the rest, since a locked worktree doesn't block branch/ref cleanup that doesn't depend on it — and (c) the two doc-site updates that stop prescribing the manual sequence.

Follow `bin/hooks.js`'s existing dispatch pattern: `resolveRunArg` for `--run`, one `if (cmd === '...')` block, `process.stdout.write` per outcome line, and this file's cardinal invariant that no hook-dispatcher path ever sets a non-zero exit (the one documented exception, `resolve-run-dir`, is invoked directly from skill prose rather than as a hook event — `teardown-run` is dispatched the same way `close-run` is, so it follows `close-run`'s always-`return 0` shape, not `resolve-run-dir`'s).

### Key Files

- `bin/hooks.js` — new `teardown-run` subcommand, alongside `close-run` (~line 188)
- `bin/lib/reconcile/archive-merged.js` — source of the git-mv archival mechanics to reuse/extract
- `bin/lib/hooks/worktree-reap.js` — source of the lock/eligibility check to reuse/extract
- `skills/_shared/pr-first-merge.md` — Step 5, the remote-ref-delete mechanism to reuse verbatim
- `skills/wrap-up/cleanup-procedures.md` — Section C, steps 4-6
- `skills/flow/multispec-review-console.md` — Shared teardown, step 6
- `tests/hooks-teardown-run.test.js` — new fixture suite

## Gotchas

- Never call `teardown-run` against the worktree the current session is standing in — that removal path is `ExitWorktree` only, never a raw `git worktree remove` (`[IL-58]`: a live-locked worktree fails with exit 128, and `ExitWorktree` is the sole remedy). `teardown-run`'s Step 3 is for a worktree the session does NOT occupy — the exact "unlocked, session doesn't stand in it" case `cleanup-procedures.md` Section C step 4 already carves out for raw `git worktree remove`.
- Never `git push origin --delete {branch}` for the remote ref — denied by `worktree.always` from the main checkout; use the `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/{branch}` path `pr-first-merge.md` Step 5 already specifies.
- Guard against deleting the integration branch (e.g. `main`) itself before any branch-delete call — assert the branch name differs first; a match is a caller bug to refuse, not a runtime condition to silently no-op past.
- A locked worktree must be skipped and reported, never forced (`[IL-116]` — never break a live session) — mirror `worktree-reap.js`'s existing "every predicate fails closed" posture rather than introducing a second, looser eligibility check.
- The original request names `tests/bin-lib/hooks/` as the test location; no such directory exists anywhere in this repo — hook-module tests are flat `tests/hooks-{module}.test.js` files. Use the real convention (see Current State), not the path named in the original request.
- `close-run`'s existing `foreignOwner` refusal (never close/touch a run recorded by another live session without an explicit `--run`) should extend to `teardown-run` — tearing down another session's live run out from under it is the same hazard `close-run` already guards against.
- #593 (open) is fixing a live archival bug in the same code path `teardown-run`'s Step 2 reuses (`iterRunDirsWithState` not recognizing an already-archived run). Land or re-check #593 before or alongside this work so `teardown-run` doesn't reuse code with a known-open defect; do not treat #593 as merely "related" background.

## Original request

bin/hooks.js: no teardown-run — pipeline teardown is 4-5 hand-assembled commands per run (close-run only flips state)

**Related:** #593 (archival must be git-aware — that fix belongs inside this command), #537

Context: `bin/hooks.js close-run` only flips `run-state.json` to a terminal status. Everything else a finished `/flow` run needs — archive the run dir, remove the worktree, delete the local branch, delete the remote ref — is re-derived by hand every run. Both runs in the 2026-08-16 session did it identically: `close-run`, then a hand-written `node -e "fs.renameSync(src, dst)"` for the archive move, then `git worktree remove --force`, then `git branch -D`, then a remote delete that had to be rerouted to `gh api --method DELETE repos/…/git/refs/heads/{branch}` because `git push origin --delete` is denied by `worktree.always` from the main checkout. Four to five commands, one of them a shell workaround, per run.

Scope: add `bin/hooks.js teardown-run --run <dir> [--merged|--abandoned]` — one plain command (no compound, no redirect, absolute paths, so it passes both the harness worktree guard and the plugin gate from either checkout) that: (1) closes state (`close-run`'s current job), (2) archives git-aware per #593 (`git mv` tracked `work/`, plain move for the untracked half, commit), (3) removes the run's recorded worktree (skip + report if locked/in-use — never break a live session, [IL-116]), (4) deletes the local branch, (5) deletes the remote ref via the contents/refs API (never `git push --delete`), (6) prints one summary line per step with skipped-because-why. `close-run` stays as the state-only subset. Update `wrap-up/cleanup-procedures.md` and `multispec-review-console.md`'s teardown sections to invoke it instead of prescribing the steps. Fixture-tested under `tests/bin-lib/hooks/`.

