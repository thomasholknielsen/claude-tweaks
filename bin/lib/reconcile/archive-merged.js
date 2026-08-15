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
function archiveRunDir(root, runDir) {
  const runId = path.basename(runDir);
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  try {
    fs.mkdirSync(archiveDir, { recursive: true });
  } catch {
    return { ok: false, reason: 'mkdir-failed' };
  }

  const workSrc = path.join(runDir, 'work');
  if (fs.existsSync(workSrc)) {
    const mv = runGit(['mv', workSrc, path.join(archiveDir, 'work')], root);
    if (mv.failure) return { ok: false, reason: 'git-mv-failed' };
    // The git mv above only stages the rename — this check runs headlessly
    // (SessionStart, dispatch's queue pull) with no interactive session
    // guaranteed to commit anything afterward, so an uncommitted rename
    // would otherwise sit in the shared main checkout's index indefinitely.
    const commit = runGit(['commit', '-m', `[reconcile] archive run ${runId}`], root);
    if (commit.failure) return { ok: false, reason: 'commit-failed' };
  }

  for (const name of ['config.yml', 'decisions.md', 'events.jsonl', 'manifest.yml', 'console.json', 'run-state.json', 'staged']) {
    const src = path.join(runDir, name);
    if (!fs.existsSync(src)) continue;
    try {
      fs.renameSync(src, path.join(archiveDir, name));
    } catch {
      return { ok: false, reason: 'move-failed' };
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

  return { ok: true };
}

function archiveMerged({ cwd, dryRun = false } = {}) {
  const archived = [];
  const skipped = [];
  const start = cwd || process.cwd();
  const root = mainCheckoutRoot(start);
  if (!root) return { archived, skipped };

  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  const worktrees = wtList.failure ? [] : parseWorktreeList(wtList.stdout);

  for (const { dir, state } of iterRunDirsWithState(root)) {
    // iterRunDirsWithState already excludes status: 'clean' — every dir
    // reached here is genuinely non-terminal.
    if (isOrphanedMint(dir)) {
      if (dryRun) { archived.push(dir); continue; }
      const result = archiveOrphanedMint(root, dir);
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
    if (!result.ok) { skipped.push({ runDir: dir, reason: result.reason }); continue; }
    archived.push(dir);
  }
  return { archived, skipped };
}

module.exports = {
  archiveMerged, decideArchive, readConsoleState, archiveRunDir,
  isOrphanedMint, archiveOrphanedMint, ORPHAN_MINT_TTL_MS,
};
