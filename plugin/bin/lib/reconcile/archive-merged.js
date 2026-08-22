// bin/lib/reconcile/archive-merged.js — convergence check 4: archive run
// dirs whose PR has merged. Reuses `wrap-up/cleanup-procedures.md` Section
// B's mechanics (mark terminal, `git mv` the tracked `work/` subdirectory,
// plain `mv` the gitignored rest) rather than inventing a second archival
// path — cite it, don't restate its rationale. A merged PR whose console is
// rendered but unresolved is NOT archived: it still needs a human answer.
'use strict';
const fs = require('fs');
const path = require('path');
const { runGit } = require('../hooks/git-exec');
const { mainCheckoutRoot } = require('../hooks/worktree-detect');
const { parseWorktreeList } = require('../hooks/worktree-reap');
const { iterRunDirsWithState, writeRunState } = require('../hooks/context');
const { resolvePrState } = require('./pr-state');
const { recordResidueFailure, recordResidueSuccess } = require('./cache');
const { escalateResidue } = require('./escalate-residue');
const { repoSlugOf } = require('./release-merged');

// Orphan case introduced by the dispatch/flow run-identity unification:
// dispatch mints an empty, anchored run directory (mkdir only, no
// config.yml) before claiming, then hands it to flow's first Task call as
// PIPELINE_RUN_DIR. If that call dies before flow ever adopts the directory
// (writes config.yml), the mint is orphaned — no worktree, no branch, no PR
// to resolve a state from, so the merged-PR criterion below can never catch
// it. 24h mirrors worktree-reap.js's ORPHAN_GRACE_MS: longer than any
// plausible pause before a retry picks the group back up, short enough that
// a genuinely abandoned mint is swept the next day.
const ORPHAN_MINT_TTL_MS = 24 * 60 * 60 * 1000;

// A minted run dir that never got adopted: no config.yml (flow's Manifesto
// is what writes it) and older than the grace window. Pure — no I/O beyond
// the two stats already needed to answer the question.
function isOrphanedMint(dir, now = Date.now()) {
  if (fs.existsSync(path.join(dir, 'config.yml'))) return false;
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(dir).mtimeMs;
  } catch {
    return false;
  }
  return (now - mtimeMs) > ORPHAN_MINT_TTL_MS;
}

// An orphaned mint has nothing to git-mv (no work/, since flow never got far
// enough to materialize into it) and nothing to finalize as terminal (no
// run-state.json, since record-worktree never ran on it) — a plain
// directory move to the archive path is the whole operation.
function archiveOrphanedMint(root, dir) {
  const runId = path.basename(dir);
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  try {
    fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
    fs.renameSync(dir, archiveDir);
  } catch {
    return { ok: false, reason: 'move-failed' };
  }
  return { ok: true };
}

// A run's PR state + its console state -> what to do. Pure — no I/O.
//   { action: 'archive' } | { action: 'skip', reason }
function decideArchive(prState, consoleState) {
  if (prState === 'gh-absent') return { action: 'skip', reason: 'gh-absent' };
  if (prState === 'network-failure') return { action: 'skip', reason: 'network-failure' };
  if (!prState) return { action: 'skip', reason: 'no-pr' };
  if (prState.state !== 'MERGED') {
    return { action: 'skip', reason: prState.state === 'OPEN' ? 'pr-open' : 'pr-closed-unmerged' };
  }
  if (consoleState === 'unresolved') return { action: 'skip', reason: 'console-unresolved' };
  return { action: 'archive' };
}

// 'unresolved' | 'resolved' | 'none' (no console.json rendered — archival
// under the "or no console rendered" clause is not blocked on it).
function readConsoleState(runDir) {
  let raw;
  try { raw = fs.readFileSync(path.join(runDir, 'console.json'), 'utf8'); } catch { return 'none'; }
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.resolved === true ? 'resolved' : 'unresolved';
  } catch {
    return 'unresolved'; // unparseable console state fails closed — never silently archived
  }
}

// Moves-first, close-last ordering (the reverse of cleanup-procedures.md
// Section B's own step numbering, which assumes a single successful pass
// with no partial-failure recovery need). Marking the run terminal BEFORE
// the moves succeed would make a failed move permanently invisible: this
// module's caller (iterRunDirsWithState) skips any run already `status:
// 'clean'`, so a failure between "mark terminal" and "actually move the
// files" would never be retried. Doing the moves first means a genuine
// failure leaves the run non-terminal and picked up again next pass; the
// fs.existsSync guards below make a retry over an already-partially-moved
// run dir a safe no-op on whatever already succeeded.
// Multi-spec parent run dirs (`multi-spec.md`'s Run directory layout) nest
// one `spec-{N}/` subdirectory per record, each carrying its own git-tracked
// `work/{N}-spec.md` plus its own gitignored config.yml/decisions.md/staged/
// (`multi-spec.md`: "Each spec-{N}/ carries its own config.yml"). A
// single-spec run dir has none of these. Returns [] (not an error) when
// runDir is unreadable — the top-level work/ move below still runs.
function listSpecDirs(runDir) {
  try {
    return fs.readdirSync(runDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('spec-'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

// #652: `git mv` physically moves the files and stages the rename before the
// commit runs, so a commit failure (gpgsign requirement, a failing
// pre-commit/commit-msg hook, a lock file, a worktree-always-style policy
// gate) would otherwise strand a staged, uncommitted rename in the shared main
// checkout indefinitely — archiveRunDir's `fs.existsSync` retry guards can
// never fire again once the old path is gone, so no later pass would clean it
// up. Undoing the rename in the index AND on disk leaves the tree exactly as
// this pass found it and restores what those guards look for. Best-effort and
// never throws: a revert failure must still degrade to the caller's reported
// skip, not an unhandled exception (this runs from SessionStart with no
// supervising human). Returns true only when every pair ended back at its
// original path in both index and disk; false means the tree is left partially
// moved, which the caller reports as a distinct reason.
function revertWorkMoves(root, workMoves) {
  let fullyReverted = true;
  for (const [src, dest] of workMoves) {
    const reset = runGit(['reset', '--', src, dest], root);
    if (reset.failure) {
      // The index still matches what `git mv` staged (src removed, dest
      // added) — leave the file where `git mv` physically put it too, so
      // disk and index stay mutually consistent (still in the "moved"
      // state, same as the pre-revert bug). Moving it back here would
      // desync disk from an index entry that was never actually unstaged —
      // a worse state than doing nothing, since `git status` would then
      // show a staged addition with no file behind it. The same lock/hook
      // cause that can fail the commit can plausibly also fail this reset.
      fullyReverted = false;
      continue;
    }
    try {
      fs.renameSync(dest, src);
    } catch {
      /* best-effort — the tree may stay partially dirty */
      fullyReverted = false;
    }
  }
  return fullyReverted;
}

function archiveRunDir(root, runDir) {
  const runId = path.basename(runDir);
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  try {
    fs.mkdirSync(archiveDir, { recursive: true });
  } catch {
    return { ok: false, reason: 'mkdir-failed' };
  }

  // Collects the actual set of entries this call moves, in move order — so
  // a caller reporting what happened (e.g. hooks.js archive-run's "moved:"
  // lines) reads it from here rather than re-deriving or hardcoding its own
  // guess at the run dir's shape, which is the exact fixed-list drift this
  // function's own enumeration swap (above) exists to eliminate.
  const movedEntries = [];

  const specDirs = listSpecDirs(runDir);

  // Every git-tracked work/ subtree — the top-level one (single-spec
  // layout) and one per spec-{N}/ subdirectory (multi-spec parent layout,
  // #593) — moves via `git mv` in one batch, then one commit covers all of
  // them. `work/` is deliberately git-tracked (materialize.md, "committed
  // as audit trail, never gitignored") while the archive path itself is
  // gitignored, so a plain mv + git add would register as a deletion; a
  // multi-spec parent whose spec-{N}/work/ subtrees were previously left
  // out of this move is exactly the bug this fixes — they used to survive
  // untouched at the pre-archive path and resurrect on the next checkout,
  // same mechanism as the top-level case the rest of this function already
  // handled.
  const workMoves = [];
  const topWork = path.join(runDir, 'work');
  if (fs.existsSync(topWork)) workMoves.push([topWork, path.join(archiveDir, 'work')]);
  for (const specName of specDirs) {
    const specWork = path.join(runDir, specName, 'work');
    if (!fs.existsSync(specWork)) continue;
    const specArchiveDir = path.join(archiveDir, specName);
    try {
      fs.mkdirSync(specArchiveDir, { recursive: true });
    } catch {
      return { ok: false, reason: 'mkdir-failed' };
    }
    workMoves.push([specWork, path.join(specArchiveDir, 'work')]);
  }
  if (workMoves.length) {
    // Pairs that succeeded before a later pair's `git mv` fails mid-loop —
    // tracked separately from `workMoves` so a failure on e.g. the 2nd of 3
    // pairs only attempts to revert the 1st (already-moved), never the 2nd
    // (assumed not mutated — `git mv` renames on disk before it writes the
    // index, so a failure partway through its own operation could in
    // principle leave the file physically moved with the index untouched;
    // treated as "not moved" rather than attempting a revert against an
    // unknown partial state) or 3rd (never even attempted). Same
    // partial-revert reasoning as the commit-failure branch below, applied
    // one loop iteration earlier.
    const succeededMoves = [];
    for (const [src, dest] of workMoves) {
      const mv = runGit(['mv', src, dest], root);
      if (mv.failure) {
        const fullyReverted = revertWorkMoves(root, succeededMoves);
        return { ok: false, reason: fullyReverted ? 'git-mv-failed' : 'git-mv-failed-partial-revert' };
      }
      succeededMoves.push([src, dest]);
      movedEntries.push(path.relative(runDir, src));
    }
    // The git mv above only stages the rename — this check runs headlessly
    // (SessionStart, dispatch's queue pull) with no interactive session
    // guaranteed to commit anything afterward, so an uncommitted rename
    // would otherwise sit in the shared main checkout's index indefinitely.
    const commit = runGit(['commit', '-m', `[reconcile] archive run ${runId}`], root);
    if (commit.failure) {
      // A partial revert (some pairs' `git reset` or disk move failed) is a
      // distinct outcome from a clean one: the retry guard below keys on
      // `fs.existsSync(workSrc)`, which only sees a pair again once it's
      // genuinely back at its original path. `commit-failed-partial-revert`
      // makes that distinction visible to callers/logs rather than
      // collapsing both into the same reason string.
      const fullyReverted = revertWorkMoves(root, workMoves);
      return { ok: false, reason: fullyReverted ? 'commit-failed' : 'commit-failed-partial-revert' };
    }
  }

  // Tracked-entry guard: a git-tracked file in the run dir outside work/
  // would otherwise be silently fs.renameSync'd (moved, not `git mv`'d) —
  // the tracked blob would still point at the OLD path, corrupting history.
  // #593 documents this class. work/ itself is already git-mv'd above.
  if (fs.existsSync(runDir)) {
    const lsFiles = runGit(['ls-files', runDir], root);
    if (lsFiles.failure) return { ok: false, reason: 'ls-files-failed' };
    const trackedOutsideWork = (lsFiles.stdout || '')
      .split('\n')
      .filter(Boolean)
      .map((p) => path.relative(runDir, path.join(root, p)))
      .filter((rel) => rel && !rel.startsWith('work' + path.sep) && rel !== 'work');
    if (trackedOutsideWork.length > 0) {
      return { ok: false, reason: 'tracked-entry' };
    }

    // TOCTOU: runDir could be deleted between the fs.existsSync(runDir) guard
    // above and this read (review finding #902) — readdirSync would
    // otherwise throw uncaught, propagating past every caller's own
    // {ok, reason} contract (hooks.js's archive-run verb has no catch of
    // its own around this call).
    let entries;
    try {
      entries = fs.readdirSync(runDir);
    } catch {
      return { ok: false, reason: 'readdir-failed' };
    }
    // spec-{N}/ dirs are excluded here — their archive twins may already
    // exist (created by the workMoves batch above), so a whole-dir rename
    // would fail ENOTEMPTY; their contents move entry-by-entry in the
    // dedicated spec loop below instead.
    for (const name of entries.filter((n) => n !== 'work' && !specDirs.includes(n))) {
      const src = path.join(runDir, name);
      if (!fs.existsSync(src)) continue;
      try {
        fs.renameSync(src, path.join(archiveDir, name));
      } catch {
        return { ok: false, reason: 'move-failed' };
      }
      movedEntries.push(name);
    }
  }

  // Each spec-{N}/ subdirectory's own gitignored content moves the same
  // way, into its archive twin created above — then the now-empty
  // spec-{N}/ itself is removed, mirroring the top-level cleanup below.
  for (const specName of specDirs) {
    const specDir = path.join(runDir, specName);
    const specArchiveDir = path.join(archiveDir, specName);
    // Enumerated, never a fixed list — the same #662/#902 drift class the
    // top-level loop above eliminated: a fixed list here would strand any
    // spec-level file outside it (e.g. engine-state.json), leaving specDir
    // non-empty so the rmdir below silently fails and the half-archived
    // spec dir resurfaces forever. work/ is already git-mv'd above.
    if (!fs.existsSync(specDir)) continue;
    let specEntries;
    try {
      specEntries = fs.readdirSync(specDir);
    } catch {
      return { ok: false, reason: 'readdir-failed' };
    }
    const specRemaining = specEntries.filter((n) => n !== 'work');
    if (specRemaining.length) {
      // Created once per spec dir rather than once per entry — recursive
      // mkdirSync is idempotent either way, so this only drops redundant
      // syscalls, and only runs at all when there's something to move here
      // (it may already exist from the workMoves batch above).
      try {
        fs.mkdirSync(specArchiveDir, { recursive: true });
      } catch {
        return { ok: false, reason: 'move-failed' };
      }
    }
    for (const name of specRemaining) {
      const src = path.join(specDir, name);
      if (!fs.existsSync(src)) continue;
      try {
        fs.renameSync(src, path.join(specArchiveDir, name));
      } catch {
        return { ok: false, reason: 'move-failed' };
      }
      movedEntries.push(path.join(specName, name));
    }
    try {
      fs.rmdirSync(specDir);
    } catch {
      /* best-effort — non-empty for an unexpected reason, or already gone */
    }
  }

  // run-state.json moved above, so finalize the terminal state at its new
  // (archived) location, not the original runDir — writeRunState reads and
  // preserves whatever state already moved there.
  const result = writeRunState(archiveDir, { status: 'clean', worktree: null });
  if (!result) return { ok: false, reason: 'close-failed' };

  // runDir is empty now (everything moved out) — remove it so a future
  // iterRunDirsWithState pass doesn't re-yield a directory with no
  // run-state.json to read (readRunState returns null there, which is NOT
  // status: 'clean' and would otherwise resurface this run forever).
  try {
    fs.rmdirSync(runDir);
  } catch {
    /* best-effort — non-empty for an unexpected reason, or already gone */
  }

  return { ok: true, movedEntries };
}

// #644 Deliverable 2 — every archive attempt's outcome, whichever of the two
// archival paths (mint vs. full run dir) produced it, flows through this one
// choke point so the consecutive-failure counter and escalation live in
// exactly one place rather than duplicated per call site. `dir` is the run
// directory — the same granularity `iterRunDirsWithState` iterates and the
// same unit a retry re-examines whole, matching the issue's own observed
// symptom ("15 run dirs stuck at move-failed"). Only `move-failed` tracks:
// the other reasons (`mkdir-failed`, `git-mv-failed`, `commit-failed`,
// `ls-files-failed`, `readdir-failed`, `tracked-entry`, `close-failed`) are
// distinct failure classes the issue never named, and folding them into the
// same counter would blur reasons that need different diagnosis.
// `escalate` is injectable (defaults to the real `escalateResidue`, which
// shells to `gh`) so a test can assert escalation actually fired — and how
// many times — without touching real `gh` or the network.
function trackArchiveResult(root, repoSlug, dir, result, { escalate = escalateResidue } = {}) {
  if (result.ok) {
    recordResidueSuccess(root, 'move-failed', dir);
    return;
  }
  if (result.reason !== 'move-failed') return;
  const streak = recordResidueFailure(root, 'move-failed', dir);
  if (!streak.shouldEscalate) return;
  try {
    escalate({
      repo: repoSlug, reason: 'move-failed', targetPath: dir,
      count: streak.count, firstFailedAt: streak.firstFailedAt,
    });
  } catch { /* best-effort — never let escalation turn an archive skip into a thrown error */ }
}

function archiveMerged({ cwd, dryRun = false } = {}) {
  const archived = [];
  const skipped = [];
  const start = cwd || process.cwd();
  const root = mainCheckoutRoot(start);
  if (!root) return { archived, skipped };
  const repoSlug = repoSlugOf(root);

  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  const worktrees = wtList.failure ? [] : parseWorktreeList(wtList.stdout);

  for (const { dir, state } of iterRunDirsWithState(root)) {
    // iterRunDirsWithState already excludes status: 'clean' — every dir
    // reached here is genuinely non-terminal.
    if (isOrphanedMint(dir)) {
      if (dryRun) { archived.push(dir); continue; }
      const result = archiveOrphanedMint(root, dir);
      trackArchiveResult(root, repoSlug, dir, result);
      if (!result.ok) { skipped.push({ runDir: dir, reason: result.reason }); continue; }
      archived.push(dir);
      continue;
    }
    if (!state || !state.worktree) { skipped.push({ runDir: dir, reason: 'no-worktree' }); continue; }
    const wtEntry = worktrees.find((w) => path.resolve(w.path) === path.resolve(state.worktree));
    const branch = wtEntry ? wtEntry.branch : null;
    if (!branch) { skipped.push({ runDir: dir, reason: 'no-branch' }); continue; }

    const prState = resolvePrState(root, branch);
    const consoleState = readConsoleState(dir);
    const decision = decideArchive(prState, consoleState);
    if (decision.action === 'skip') { skipped.push({ runDir: dir, reason: decision.reason }); continue; }
    if (dryRun) { archived.push(dir); continue; }

    const result = archiveRunDir(root, dir);
    trackArchiveResult(root, repoSlug, dir, result);
    if (!result.ok) { skipped.push({ runDir: dir, reason: result.reason }); continue; }
    archived.push(dir);
  }
  return { archived, skipped };
}

module.exports = {
  archiveMerged, decideArchive, readConsoleState, archiveRunDir, listSpecDirs,
  isOrphanedMint, archiveOrphanedMint, ORPHAN_MINT_TTL_MS, trackArchiveResult,
};
