---
record: 902
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: wrapup-objective-audit-fixes:one-archival-implementation-archive-run-verb-shared-by-secti
surface: terminal
---
# 902: One archival implementation: archive-run verb shared by Section B and reconcile

Surface: terminal

## Overview

Run-dir archival exists twice — `bin/lib/reconcile/archive-merged.js`'s `archiveRunDir` (code) and `cleanup-procedures-execution.md` Section B's hand-run `git mv` + `mv` recipe with its own prose file list — and the filed defects are drift between and within the copies: #662 (the code's fixed filename list at `archive-merged.js:114` strands `engine-state.json`/`frontier-tally.log`, leaving half-archived runs that resurface at every SessionStart) and #799 (Section B's prose list omits `engine-state.json`, so following it verbatim leaves the source dir non-empty and `rmdir` fails). This record makes `archiveRunDir` the single implementation — enumeration-based, never a fixed list — exposes it as a `hooks.js archive-run` verb, and rewrites Section B to invoke the verb instead of carrying a command recipe that can drift.

**Complexity:** Medium
**Estimated tasks:** 5-7

## Non-Goals

- #593's remaining scope (the `iterRunDirsWithState` archive-twin defense, the multispec step-9 trace, the bulk sweep of ~129 stray dirs) stays in #593 — this record touches shared code #593 also references, so whichever builds second re-merges main first. The already-shipped git-mv half is untouched.
- No change to `close-run` semantics or the teardown gate.
- No change to archival *policy* (archive-not-delete, `work/` via `git mv`) — implementation unification only.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #662 | reconcile archive-merged strands run-dir files outside its fixed filename list | ready, auto:build+auto:merge — SUBSUMED by this record (`Fixes #662`); a `Blocked by` link is added to #662 at decomposition time so dispatch cannot double-build it |
| #799 | cleanup-procedures.md Section B: file-by-file move list omits engine-state.json | open — resolved properly by this record (`Fixes #799`) |

## Current State

- `plugin/bin/lib/reconcile/archive-merged.js` — `archiveRunDir` already does `git mv` for tracked `work/` then plain moves; line 114 iterates the fixed list `['config.yml', 'decisions.md', 'events.jsonl', 'manifest.yml', 'console.json', 'run-state.json', 'staged']`; line 135 `fs.rmdirSync(runDir)` with a swallow-catch at 134-138. Header comment states it reuses Section B's mechanics.
- `plugin/bin/hooks.js` — one dispatcher, one module per event/verb under `plugin/bin/lib/hooks/`; `close-run` is the sibling verb pattern to follow. Read `docs/hooks.md` before touching (repo rule).
- `plugin/skills/wrap-up/cleanup-procedures-execution.md` — Section B steps 4-5: `git mv` for `work/`, then "Move them into the archive path with a plain `mv`" over the enumerated gitignored names (the list #799 reports as incomplete).
- `tests/reconcile.test.js` — existing real-git-fixture `archiveRunDir` tests (from ~line 254); #662's body maps the fixture pattern (build a run dir under a temp git root, call `archiveRunDir`, assert filesystem state).
- `_shared/pipeline-run-dir.md` — anchoring rules; the verb must resolve the run dir the same way `close-run` does.

## Deliverables

- [ ] `archiveRunDir`'s fixed list replaced with `fs.readdirSync(runDir).filter((name) => name !== 'work')` — name-based `work` exclusion (state-based misbehaves when no `work/` exists), per-entry move loop otherwise unchanged, preserving the moves-first/close-last recovery property: every content move (the `git mv` of `work/`, then each per-entry move) completes before the source dir is removed, and every step is guarded by `fs.existsSync`, so an interrupted archival re-runs to completion instead of stranding state — stated here so the invariant survives #662's closure, not only by reference to it.
- [ ] Tracked-entry guard: before plain-moving an entry, the loop checks it against `git ls-files` — a git-tracked entry other than `work/` is **not** silently `renameSync`'d (that corrupts the index with no error, the exact resurrect-bug class #593 documents); it errors loudly naming the entry, since the standing invariant "everything but `work/` is gitignored" would have been violated by whoever wrote it. One `git ls-files` call for the run dir, not one per entry.
- [ ] `hooks.js archive-run --run <dir>` verb wrapping `archiveRunDir` (module under `plugin/bin/lib/hooks/`, registered in the dispatcher): resolves and validates the run dir per `_shared/pipeline-run-dir.md`'s anchoring, and refuses any non-terminal status with a named error — "terminal" is defined by `bin/lib/hooks/run-integrity.js`'s existing vocabulary (`NON_TERMINAL = {active, interrupted}`; `clean` is the archivable state), cited as the source of truth, never re-enumerated. A missing or unparseable `run-state.json` also refuses, with an error naming reconcile's orphaned-mint path (`archiveOrphanedMint`) as the owner of state-less dirs — those are out of this verb's scope. Note that `archiveRunDir` itself force-writes `status: clean` today regardless of incoming state; the status gate is the verb's own new check, in front of the call. Output is informational human text ("moved: {name}" lines), never machine-parsed — stated in the module header. Idempotent on a partially-archived run (existing `fs.existsSync` guards).
- [ ] First build action: `gh issue view 662 --json labels,state` — confirm the `Blocked by #902` link from decomposition time still stands (dispatch's selection skips records with open blockers, which is what prevents a double-build); re-add it if a label/state change cleared it, before touching any code.
- [ ] Section B steps 4-5 rewritten: run the verb (one command), keep the multi-spec defer check and the "verify console ran" precondition, delete the hand-run `git mv`/`mv` recipe and the file list.
- [ ] Regression tests (in `tests/reconcile.test.js`, following its fixture pattern): run dir with `engine-state.json` + arbitrary `extra.txt` archives completely, active dir gone; no-`work/` run dir archives; partially-archived run dir completes idempotently; `work/` still routes through the `git mv` block (no regression); the verb refuses `active`, refuses `interrupted`, refuses missing `run-state.json` (each with its named error), archives `clean`; a git-tracked non-`work` entry trips the tracked-entry guard.
- [ ] Closing commit carries `Fixes #662` and `Fixes #799` (verify each body's repro is actually covered before writing the lines).

## Acceptance Criteria

1. A fixture run dir containing the fixed-list files plus `engine-state.json` and `extra.txt` archives fully via `archiveRunDir`: every entry under the archive path, `fs.existsSync(runDir)` false, `work/` tracked at the new path.
2. `hooks.js archive-run --run <live-run>` refuses `active` and `interrupted` (per `run-integrity.js`'s `NON_TERMINAL`) with a message naming `close-run` as the prerequisite, and refuses a missing `run-state.json` naming the orphaned-mint path; on a `clean` run it archives and exits 0.
3. Per-file negative greps, one per current list: `grep -n "'config.yml', 'decisions.md', 'events.jsonl'" plugin/bin/lib/reconcile/archive-merged.js` returns nothing, and `grep -n "config.yml.*decisions.md.*events.jsonl" plugin/skills/wrap-up/cleanup-procedures-execution.md` returns nothing (the two files' lists are not symmetric today — 7 items vs 4 — so each gets its own pattern); additionally the new tests fail when the `readdirSync` enumeration is reverted to any fixed array (the behavioral check the greps only proxy).
4. Section B contains no archival command recipe: `awk '/^## B\./,/^## C\./' plugin/skills/wrap-up/cleanup-procedures-execution.md | grep -En '^\s*(git mv|mv|find) '` returns nothing — the section cites the verb.
5. `npm test` green; the new tests fail when the readdir change is reverted (verify by reverting once — verify-test-discrimination discipline).

## Technical Approach

Small, mostly mechanical: the enumeration swap is #662's own Technical Approach applied verbatim; the verb is a thin wrapper following `close-run`'s module/registration shape (read `docs/hooks.md` first — the never-break-a-session invariant applies to every hook-dispatcher change). Section B's rewrite keeps its rationale prose (why archive-not-delete, why `git mv` for `work/`) and cites the verb for mechanics — prose owns the why, code owns the how. Note in the verb's module header that `flow/multispec-review-console.md`'s parent-dir archival (traced by #593's deliverable 2) is a future caller.

### Key Files

- `plugin/bin/lib/reconcile/archive-merged.js` — enumeration swap in `archiveRunDir`
- `plugin/bin/hooks.js` + `plugin/bin/lib/hooks/archive-run.js` — new verb (name the module per the existing per-verb convention in that directory)
- `plugin/skills/wrap-up/cleanup-procedures-execution.md` — Section B rewrite
- `tests/reconcile.test.js` — extended fixture suite

## Gotchas

- `fs.readdirSync` order is filesystem-dependent — the per-entry loop is already order-independent; keep it that way (note from #662).
- `rename` failures still fall through to the existing catch-and-return-`move-failed` path — the enumeration change needs no new error path (#662).
- The verb runs `git mv` — from a worktree session the main-checkout write may be gate-denied; the verb itself runs via `child_process` (the same reason `reconcile` works where inline git is refused — see the worktree-always memory), but do not chain it with other commands in one Bash call.
- #593 is ready+authorized and touches `archive-merged.js` — check `gh issue view 593 --json labels` for `bot:in-progress` before starting. Concrete rule: if a session holds it, post a comment on #593 naming this record and the shared function, then proceed (this record's surface is small and lands fast); whichever branch merges second re-derives its `archive-merged.js` edits against the other's landed diff, and this record's final whole-branch review re-merges origin/main unconditionally.
- `docs/hooks.md` is a required read before touching `hooks.js` (repo rule); the tiered-posture and run-dir-ownership contracts there constrain the verb's error behavior.
- Do not delete `.claude-tweaks/design/score-history.jsonl`-style persistent files if encountered in a run dir — the enumeration moves, never deletes; nothing in this record deletes any file.


<!-- work-fingerprint: wrapup-objective-audit-fixes:one-archival-implementation-archive-run-verb-shared-by-secti -->
