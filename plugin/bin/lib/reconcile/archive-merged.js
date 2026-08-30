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
const {
  iterRunDirsWithState, writeRunState, readRunState, RUN_ID_RE,
} = require('../hooks/context');
const { resolvePrState } = require('./pr-state');
const { recordResidueSuccess, trackResidue } = require('./cache');
const { escalateResidue } = require('./escalate-residue');
const { repoSlugOf } = require('./release-merged');
const { closeRunState } = require('../hooks/close-run-state');
const { checkRunIntegrity, fallbackBranch } = require('../hooks/run-integrity');

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

// An ad-hoc-standalone dir (`{ts}-adhoc-standalone`, minted by
// post-tool-use.js's `stampAdHocRunDir` — see `run-dir-resolve.js`'s
// `standalone` branch) never gets a config.yml either (only /flow's
// Manifesto writes one), so without this exemption it reads as an
// "abandoned pre-Manifesto mint" under the mtime rule below the moment a
// real dev session goes untouched for >24h before wrap-up finally runs —
// silently destroying the friction record #500's Friction lens depends on
// (#1117). Unlike a genuine orphaned mint (mkdir-only, no worktree, no
// branch, no PR — see this file's top comment), an ad-hoc dir's
// run-state.json always carries a real `worktree`, so its correct lifecycle
// answer is the eventual-supersession path below (isAdHocStandaloneSuperseded),
// not this blind mtime heuristic: exempt it here, permanently, rather than
// giving it a longer TTL that just moves the same race further out.
//
// #1604: the suffix match alone is not sufficient corroboration — a
// malformed or mkdir-only dir sharing the suffix would also fall through
// isOrphanedMint (exempt) and decideArchive (no-worktree/no-branch skip),
// leaking the same way a genuine ad-hoc mint used to before this fix.
// Require the invariant the comment above actually asserts: a real
// run-state.json with a non-empty `worktree` field. A dir that merely
// carries the suffix without that is NOT treated as ad-hoc here — it falls
// through to the ordinary isOrphanedMint mtime sweep instead, same as any
// other malformed mint.
function isAdHocStandaloneMint(dir) {
  if (!path.basename(dir).endsWith('-adhoc-standalone')) return false;
  const state = readRunState(dir);
  return !!(state && typeof state.worktree === 'string' && state.worktree);
}

// #1604: the "swept once genuinely superseded" half of #1117's own design
// that never shipped. A genuine ad-hoc mint (isAdHocStandaloneMint already
// corroborated) whose recorded worktree no longer resolves in a fresh
// `git worktree list` — the session has definitively ended — is pure
// clutter once ADHOC_SUPERSEDED_TTL_MS has passed since the dir was last
// touched. A still-live one (worktree still registered) is NEVER swept here,
// regardless of age — that is #1117's own invariant, unchanged. Longer than
// ORPHAN_MINT_TTL_MS by two orders of magnitude: a torn-down worktree is
// unambiguous "session over" evidence (unlike a bare mtime heuristic on a
// never-adopted mint), so this window exists only to give wrap-up's own
// reflect pass (or a human) a wide margin to consume the friction record
// before this backstop claims it, not to guard against a false positive.
const ADHOC_SUPERSEDED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isAdHocStandaloneSuperseded(dir, state, worktrees, now = Date.now()) {
  if (!isAdHocStandaloneMint(dir)) return false;
  if (!state || typeof state.worktree !== 'string' || !state.worktree) return false;
  const stillLive = worktrees.some((w) => path.resolve(w.path) === path.resolve(state.worktree));
  if (stillLive) return false;
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(dir).mtimeMs;
  } catch {
    return false;
  }
  return (now - mtimeMs) > ADHOC_SUPERSEDED_TTL_MS;
}

// A minted run dir that never got adopted: no config.yml (flow's Manifesto
// is what writes it), not an ad-hoc-standalone mint (see above — that check
// now reads run-state.json for corroboration, #1604), and older than the
// grace window. No I/O beyond what answering the question requires.
function isOrphanedMint(dir, now = Date.now()) {
  if (fs.existsSync(path.join(dir, 'config.yml'))) return false;
  if (isAdHocStandaloneMint(dir)) return false;
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
  } catch (err) {
    return { ok: false, reason: 'move-failed', lastError: err && err.message };
  }
  return { ok: true };
}

// Same 24h window as ORPHAN_MINT_TTL_MS, and for the same reason — longer than
// any plausible pause before a session resumes its own run, short enough that
// a genuinely abandoned one is swept the next day. Deliberately not a second,
// differently-tuned constant.
const STALE_INTERRUPTED_TTL_MS = ORPHAN_MINT_TTL_MS;

// Newest event this run can actually claim as its own, in ms — or null when
// there are none (or the log is unreadable).
//
// Deliberately NOT run-state's `updatedAt`, and deliberately excluding
// `attribution: 'fallback'` lines: a fallback event is one ANOTHER session's
// hook guessed into this run because the run had no provable owner
// (context.js's resolveRun). Those lines advance `updatedAt` without this run
// being alive at all, which is precisely how an abandoned run looks
// perpetually busy and never becomes closeable (#1673 Deliverable 4).
//
// Deliberately asymmetric with context.js's `scanWrapupEvents` (read by
// `checkRunIntegrity`), which does NOT filter fallback-attributed lines: a
// run whose events.jsonl holds ONLY fallback-attributed lines can therefore
// read as both "abandoned" here (no self-attributed activity) AND "shipped"
// there (>=1 skill_invoked still counts, fallback or not). That combination
// is coherent and intended, not a bug to reconcile: the work shipped, and
// nothing THIS run itself produced has touched it since — a future reader
// should not "fix" the two filters into agreement.
function lastOwnEventMs(runDir) {
  let raw;
  try { raw = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8'); } catch { return null; }
  let newest = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || ev.attribution === 'fallback') continue;
    const t = Date.parse(ev.ts);
    if (Number.isNaN(t)) continue;
    if (newest === null || t > newest) newest = t;
  }
  return newest;
}

// Whether runDir's events.jsonl exists and is readable at all — distinct
// from `lastOwnEventMs`'s own `null`, which conflates two different things:
// "the log is readable but has no qualifying (non-fallback, parseable-ts)
// event" and "the log couldn't be read in the first place." Only the caller
// below needs to tell those apart (#1673 F9 review finding): a genuinely
// unreadable/absent log is UNKNOWN evidence, not proof of staleness.
function hasReadableEventsLog(runDir) {
  try {
    fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8');
    return true;
  } catch {
    return false;
  }
}

// The ownership half of the criterion, inverted from close-run-state.js's
// `foreignOwner`: that check asks "does a DIFFERENT session own this?" to
// refuse a close; here the same comparison answers "is this session's own
// run?" — if it is, we are that session and the run is by definition alive, so
// never auto-close it. A run owned by nobody, or by some other session, is a
// candidate only if it ALSO shows no self-attributed activity inside the
// staleness window. Both halves must hold; neither alone is evidence.
//
// Honest scope of this ownership half: it only ever engages when BOTH
// `state.sessionId` and `sessionId` are non-null. `sessionId` is reliably
// present when this runs off the Bash-invoked `reconcile` subcommand (the
// calling shell's own `CLAUDE_CODE_SESSION_ID` — see the module default
// below), but is `null` in the path that actually matters most: the
// SessionStart-triggered background pass (`reconcile-background`, a detached
// child process spawned with no stdin), where no session id is ever threaded
// in. There, this half of the criterion never fires — it is not "the"
// protection, it is an ADDITIONAL guard that only engages when a session id
// happens to be known. The substantive protection for every caller, known
// session id or not, is the two checks below: the 24h staleness window
// (`STALE_INTERRUPTED_TTL_MS`) and, at the call site, the `shipped-unclosed`
// evidence gate from `checkRunIntegrity`.
function isAbandonedInterrupted(runDir, state, sessionId, now = Date.now()) {
  if (!state || state.status !== 'interrupted') return false;
  const owner = typeof state.sessionId === 'string' && state.sessionId ? state.sessionId : null;
  if (owner && sessionId && owner === sessionId) return false; // our own live run
  // An unreadable/absent events.jsonl is UNKNOWN evidence of activity, not
  // proof of staleness — fail toward not-abandoned rather than collapsing
  // "we can't tell" into "definitely idle" (review finding: `checkRunIntegrity`
  // happens to also require a readable log with >=1 skill_invoked before this
  // branch is ever reached, but that is a coincidence of two separate reads
  // at different moments, not a guarantee this function can rely on alone).
  if (!hasReadableEventsLog(runDir)) return false;
  const last = lastOwnEventMs(runDir);
  if (last !== null && (now - last) <= STALE_INTERRUPTED_TTL_MS) return false;
  return true;
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
  // #1130: this sweep's population is non-terminal runs only
  // (iterRunDirsWithState skips status:'clean'), so an absent console.json
  // here always means wrap-up never rendered a console for this run — never
  // the empty-console fast path, which closes the run terminal and archives
  // via the archive-run verb without ever reaching this sweep. Archiving on
  // mere PR-merge swept live runs with pending staged decisions (#657).
  if (consoleState === 'none') return { action: 'skip', reason: 'console-never-rendered' };
  return { action: 'archive' };
}

// 'unresolved' | 'resolved' | 'none' (no console.json rendered — #1130:
// blocks this sweep's archival; the empty-console fast path archives via the
// archive-run verb instead). 'resolved' fires on `resolved === true` OR a
// non-empty (post-trim) string `executedAt` — the documented write order
// (`_shared/console-execution.md`) now sets both in the final console.json
// write, but consoles written before that change carry `executedAt` alone,
// so either counts. console-execute.js's preFetchSkipReason applies the
// same acceptance rule — keep the two readers agreeing, or an executed
// console classifies 'resolved' here while re-detecting as `ready` there.
function readConsoleState(runDir) {
  let raw;
  try { raw = fs.readFileSync(path.join(runDir, 'console.json'), 'utf8'); } catch { return 'none'; }
  try {
    const parsed = JSON.parse(raw);
    const resolved = parsed && (parsed.resolved === true
      || (typeof parsed.executedAt === 'string' && parsed.executedAt.trim().length > 0));
    return resolved ? 'resolved' : 'unresolved';
  } catch {
    return 'unresolved'; // unparseable console state fails closed — never silently archived
  }
}

// #1130: gh's MERGED state is a remote fact; the local main checkout may not
// have fast-forwarded to include the merge commit yet. The run dir's tracked
// work/ subtree only reaches the main checkout via that merge, so archiving
// early moves only the gitignored half and strands work/ (the #657 symptom).
// true = merge commit is in local history; false = definitively not (safe to
// retry next pass); null = oid unavailable/malformed — treated by the caller
// as not-yet-verifiable, same skip-and-retry.
function localHasMerge(root, mergeCommit) {
  const oid = mergeCommit && typeof mergeCommit.oid === 'string' && /^[0-9a-f]{40}$/.test(mergeCommit.oid)
    ? mergeCommit.oid : null;
  if (!oid) return null;
  const r = runGit(['merge-base', '--is-ancestor', oid, 'HEAD'], root);
  return !r.failure;
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

// Review finding: the two plain fs.renameSync loops below (gitignored
// content — no git index involved, so revertWorkMoves' git-reset step
// doesn't apply) had no revert-on-failure, unlike the git-tracked workMoves
// loop above — the same partial-move hazard #1103 fixed for `git mv` was
// still reachable here. Best-effort and never throws, matching
// revertWorkMoves' contract; the failed entry itself is never included in
// movedPairs, same reasoning as revertWorkMoves' own failed-pair handling.
function revertPlainMoves(movedPairs) {
  let fullyReverted = true;
  for (const [src, dest] of movedPairs) {
    try {
      fs.renameSync(dest, src);
    } catch {
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
  // #1103 follow-up: mkdirSync above is the earliest point a second,
  // concurrent, UNLOCKED `reconcile` invocation (dispatch/tidy's own
  // pre-step, not `reconcile-background`, which holds a lock) could pick the
  // same run dir before this call finishes moving anything. The removed
  // existence-only check (see context.js's comment on the same #1103) used
  // to make that window near-zero; this interim, content-aware, TTL-bounded
  // claim restores that protection without reintroducing the
  // permanently-stranded-on-failure bug the existence-only check caused —
  // context.js's staleness check lets a crashed/failed attempt's claim
  // expire instead of blocking every future archival of this run forever.
  writeRunState(archiveDir, { status: 'archiving', worktree: null });

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
    const movedThisPass = [];
    for (const name of entries.filter((n) => n !== 'work' && !specDirs.includes(n))) {
      const src = path.join(runDir, name);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(archiveDir, name);
      try {
        fs.renameSync(src, dest);
      } catch (err) {
        const fullyReverted = revertPlainMoves(movedThisPass);
        return {
          ok: false,
          reason: fullyReverted ? 'move-failed' : 'move-failed-partial-revert',
          lastError: err && err.message,
        };
      }
      movedThisPass.push([src, dest]);
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
      } catch (err) {
        return { ok: false, reason: 'move-failed', lastError: err && err.message };
      }
    }
    const specMovedThisPass = [];
    for (const name of specRemaining) {
      const src = path.join(specDir, name);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(specArchiveDir, name);
      try {
        fs.renameSync(src, dest);
      } catch (err) {
        const fullyReverted = revertPlainMoves(specMovedThisPass);
        return {
          ok: false,
          reason: fullyReverted ? 'move-failed' : 'move-failed-partial-revert',
          lastError: err && err.message,
        };
      }
      specMovedThisPass.push([src, dest]);
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

  // Late-write guard (#990 — reproduced live during #893's own wrap-up even
  // with #902's dynamic enumeration already in place): the top-level
  // readdirSync above (and each spec dir's own readdirSync in the loop
  // above) is a one-time snapshot. A write landing in the run dir after that
  // snapshot but before the rmdirSync below — e.g. `wrap-up-engine.js
  // record`'s write to engine-state.json outrunning this call in some
  // multi-process ordering — is invisible to the entries this function has
  // already iterated, so it would otherwise sit unmoved and defeat the
  // rmdirSync (ENOTEMPTY, swallowed by the best-effort catch below),
  // orphaning it in the live run dir forever. Re-snapshot immediately before
  // the removal attempt and sweep any straggler that appeared in the gap —
  // gitignored content only, the same renameSync the top-level loop above
  // uses (the tracked-entry guard above already refused a git-tracked
  // stray, so nothing reaching this point is git-tracked).
  if (fs.existsSync(runDir)) {
    let stragglers;
    try {
      stragglers = fs.readdirSync(runDir);
    } catch {
      stragglers = [];
    }
    for (const name of stragglers) {
      const src = path.join(runDir, name);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(archiveDir, name);
      try {
        fs.renameSync(src, dest);
        movedEntries.push(name);
      } catch {
        /* best-effort — leave it on disk for the next archival pass to
           retry rather than fail this whole call over a residual
           straggler; the rmdirSync below naturally stays a no-op then. */
      }
    }
  }

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

// #1613: how long a run dir can sit in a "structurally stuck" skip reason
// (no-worktree/no-branch/no-pr) before this sweep starts tracking it toward
// escalation. Deliberately NOT ORPHAN_MINT_TTL_MS (24h — tuned for a
// pre-Manifesto mint that should resolve same-day or is abandoned) or
// ADHOC_SUPERSEDED_TTL_MS (30 days — tuned for "worktree gone, session
// definitely over"). This case sits between the two: the dir IS adopted
// (has config.yml) and no-worktree/no-branch/no-pr is the ordinary state
// for every run dir between mint and PR-merge — flagging it too eagerly
// would flood escalateResidue with false positives on perfectly healthy,
// still-in-review work (Deliverable 2's own warning). What actually gates
// this, though, isn't "how long can a build take" but the dir's own
// mtime — a run genuinely being worked (commits, decisions.md appends,
// work/ materializations) keeps touching its own directory, so a dir that
// has sat completely untouched for a full week is a much safer signal of
// abandonment than a build-duration estimate would be. A week also gives
// #1290's own archive-twin shape (still unbuilt as of this record — see
// this file's `isOrphanedMint`, which has no twin check yet) ample margin
// once that lands, without needing its own separate constant.
const STRUCTURALLY_STUCK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Skip reasons that might indicate a run dir stuck without external help,
// as opposed to a benign, transient in-flight state. 'console-unresolved'/
// 'console-never-rendered'/'local-behind-merge'/'merge-commit-unknown' are
// deliberately excluded — each already has its own clear resolution path
// (a human answering a console, a local fetch catching up) that doesn't
// need this generic staleness backstop.
const STRUCTURALLY_STUCK_REASONS = new Set(['no-worktree', 'no-branch', 'no-pr']);

// Pure except for the one mtime stat — no I/O beyond answering the question.
function isStructurallyStuck(dir, reason, now = Date.now()) {
  if (!STRUCTURALLY_STUCK_REASONS.has(reason)) return false;
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(dir).mtimeMs;
  } catch {
    return false;
  }
  return (now - mtimeMs) > STRUCTURALLY_STUCK_TTL_MS;
}

// #1613: visibility only — never changes what archiveMerged does with the
// directory (still just skip; the existing archive-twin "leave it in place"
// test keeps passing unmodified). Reuses the same consecutive-count +
// escalate-once machinery move-failed already uses (cache.js's trackResidue),
// under its own 'structurally-stuck' key so the two failure classes never
// blur together. A no-op below the staleness gate above — most skips, on
// most passes, are perfectly healthy in-flight runs and never reach here.
function trackStuckSkip(root, repoSlug, dir, reason, { escalate = escalateResidue } = {}) {
  if (!isStructurallyStuck(dir, reason)) return;
  trackResidue(root, repoSlug, 'structurally-stuck', dir, { failed: true, lastError: `stuck at ${reason}` }, { escalate });
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
    // #1613: a dir that just successfully archived can no longer be
    // structurally stuck — clear any prior tracking so a future, unrelated
    // reuse of this path (unlikely — paths are timestamp-uniqued, but cheap
    // to guard) starts a fresh count rather than resuming a stale one.
    recordResidueSuccess(root, 'structurally-stuck', dir);
    return;
  }
  // Archive-specific vocabulary — not part of the shared branching cache.js's
  // trackResidue dedups (#1233) — so it stays here, ahead of the shared
  // call, rather than moving inside it.
  if (result.reason !== 'move-failed') return;
  // Mirrors reap-merged.js's trackReapResidue: forward the underlying error
  // (now captured at each move-failed catch site above) into the shared
  // residue-tracking/escalation choke point.
  trackResidue(root, repoSlug, 'move-failed', dir, { failed: true, lastError: result.lastError }, { escalate });
}

// #1544: `iterRunDirsWithState` (context.js) excludes every `status:
// 'clean'` dir by design (line ~143 of that file) — most of its callers
// treat a clean run as "nothing left to do here," which is right for
// resolveRun/session-start but wrong for this sweep specifically. A run dir
// close-run already marked `{status: 'clean', worktree: null}` is normally
// archived within the same wrap-up pass (archive-run runs immediately
// after) — but a headless second call that completed close-run and then
// exited (or crashed) before archive-run leaves that dir sitting in
// `pipelines/` forever, invisible to the loop below. Scan the same
// top-level pipelines/ listing directly, filtered to `status: 'clean'` —
// gated below on a confirmed merged PR (never bare clean-status alone, per
// this issue's own gotcha: a clean status is not itself proof the PR
// merged).
function iterCleanRunDirs(root) {
  const base = path.join(root, '.claude-tweaks', 'pipelines');
  let entries;
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || !RUN_ID_RE.test(e.name)) continue;
    const dir = path.join(base, e.name);
    const state = readRunState(dir);
    if (state && state.status === 'clean') out.push({ dir, state });
  }
  return out;
}

function archiveMerged({ cwd, dryRun = false, sessionId = process.env.CLAUDE_CODE_SESSION_ID || null } = {}) {
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

    // #1673: an abandoned `interrupted` run whose work actually shipped. This
    // has to sit ahead of the no-worktree/no-branch skips below: those are
    // exactly where such a run dies today, because its worktree was torn down
    // long ago and there is no live entry to derive a branch from. #1672's
    // fallback evidence is what lets checkRunIntegrity answer at all here.
    // Evaluated last of the three gates because it is the only one that spawns
    // git.
    if (isAbandonedInterrupted(dir, state, sessionId)
      && checkRunIntegrity(dir).state === 'shipped-unclosed') {
      if (dryRun) { archived.push(dir); continue; }
      // Moves-first, close-last — the same invariant this file's own header
      // comment above archiveRunDir (line ~185, "Moves-first, close-last
      // ordering") states for the pre-existing archive path: marking a run
      // terminal BEFORE its move succeeds would make a failed move
      // permanently invisible, since iterRunDirsWithState skips any run
      // already status: 'clean'. Archive FIRST — a failure here leaves the
      // run non-terminal (still 'interrupted') and retryable next pass, which
      // is the whole point — and only close it once the move has actually
      // landed.
      const archiveResult = archiveRunDir(root, dir);
      trackArchiveResult(root, repoSlug, dir, archiveResult);
      if (!archiveResult.ok) {
        // Non-'move-failed' reasons (mkdir-failed, git-mv-failed,
        // commit-failed, ls-files-failed, tracked-entry, readdir-failed) are
        // retried next pass — the run stays non-terminal above — but
        // trackArchiveResult only feeds the residue-escalation counter on
        // 'move-failed' (pre-existing behavior shared with the merged-PR
        // archive path, unchanged here), so a failure of one of those other
        // kinds is visible in `skipped` but will not self-escalate.
        skipped.push({ runDir: dir, reason: archiveResult.reason });
        continue;
      }
      // Only now, against the ARCHIVED directory — everything (events.jsonl,
      // run-state.json, work/) has already moved there — close the run
      // terminal. closeRunState, not a hand-rolled status write — it owns the
      // close-without-wrapup event and the un-archived-work advisory, which
      // is what makes an automated close indistinguishable from a manual one
      // in the ledger.
      //
      // `explicit: true` is defensible ONLY because isAbandonedInterrupted
      // plus the shipped-unclosed evidence gate have ALREADY made the
      // ownership determination upstream, above — this call site owns that
      // decision instead of delegating it to closeRunState's own
      // foreign-owner refusal, rather than claiming ownership doesn't matter
      // here. Weakening either upstream gate would silently weaken this
      // bypass too.
      const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', path.basename(dir));
      const closeResult = closeRunState(archiveDir, { explicit: true, sessionId });
      if (!closeResult.writeOk) {
        // The move already succeeded — never roll it back over a close-write
        // failure; the run is physically archived either way. Just make the
        // failure visible instead of silently reporting a clean archive: its
        // status may not actually read 'clean'.
        skipped.push({ runDir: dir, reason: 'close-write-failed' });
        continue;
      }
      archived.push(dir);
      continue;
    }

    // #1604: a genuine ad-hoc-standalone dir whose worktree is definitively
    // gone (session over) is otherwise permanently stuck below — it never
    // gets a console.json (decideArchive's console-never-rendered skip) and
    // its worktree lookup fails the moment the ordinary reap sweep tears it
    // down (no-worktree/no-branch skip). Intercept it here, ahead of both,
    // once ADHOC_SUPERSEDED_TTL_MS has passed — #1117's own invariant (never
    // sweep a still-live ad-hoc session) is unchanged: isAdHocStandaloneSuperseded
    // returns false while the worktree still resolves, regardless of age.
    if (isAdHocStandaloneSuperseded(dir, state, worktrees)) {
      if (dryRun) { archived.push(dir); continue; }
      const result = archiveOrphanedMint(root, dir);
      trackArchiveResult(root, repoSlug, dir, result);
      if (!result.ok) { skipped.push({ runDir: dir, reason: result.reason }); continue; }
      archived.push(dir);
      continue;
    }

    if (!state || !state.worktree) {
      skipped.push({ runDir: dir, reason: 'no-worktree' });
      trackStuckSkip(root, repoSlug, dir, 'no-worktree');
      continue;
    }
    const wtEntry = worktrees.find((w) => path.resolve(w.path) === path.resolve(state.worktree));
    const branch = wtEntry ? wtEntry.branch : null;
    if (!branch) {
      skipped.push({ runDir: dir, reason: 'no-branch' });
      trackStuckSkip(root, repoSlug, dir, 'no-branch');
      continue;
    }

    const prState = resolvePrState(root, branch);
    const consoleState = readConsoleState(dir);
    const decision = decideArchive(prState, consoleState);
    if (decision.action === 'skip') {
      skipped.push({ runDir: dir, reason: decision.reason });
      trackStuckSkip(root, repoSlug, dir, decision.reason);
      continue;
    }

    const hasMerge = localHasMerge(root, prState.mergeCommit);
    if (hasMerge !== true) {
      skipped.push({ runDir: dir, reason: hasMerge === false ? 'local-behind-merge' : 'merge-commit-unknown' });
      continue;
    }
    if (dryRun) { archived.push(dir); continue; }

    const result = archiveRunDir(root, dir);
    trackArchiveResult(root, repoSlug, dir, result);
    if (!result.ok) { skipped.push({ runDir: dir, reason: result.reason }); continue; }
    archived.push(dir);
  }

  // #1544: the clean-status sweep — see iterCleanRunDirs' own comment.
  // `state.worktree` is already null by construction (close-run's write), so
  // the ordinary worktree-list branch lookup above can't answer here; reuse
  // run-integrity.js's own torn-down-worktree fallback (state.pr.branch, or
  // decisions.md's PR-early lifecycle lines) instead. Otherwise identical to
  // the main loop: decideArchive's merged-PR + resolved-console gate, then
  // the same local-fast-forward check before any move.
  for (const { dir, state } of iterCleanRunDirs(root)) {
    const branch = fallbackBranch(root, dir, state);
    if (!branch) { skipped.push({ runDir: dir, reason: 'no-branch' }); continue; }

    const prState = resolvePrState(root, branch);
    const consoleState = readConsoleState(dir);
    const decision = decideArchive(prState, consoleState);
    if (decision.action === 'skip') { skipped.push({ runDir: dir, reason: decision.reason }); continue; }

    const hasMerge = localHasMerge(root, prState.mergeCommit);
    if (hasMerge !== true) {
      skipped.push({ runDir: dir, reason: hasMerge === false ? 'local-behind-merge' : 'merge-commit-unknown' });
      continue;
    }
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
  isOrphanedMint, isAdHocStandaloneMint, archiveOrphanedMint, ORPHAN_MINT_TTL_MS, trackArchiveResult,
  localHasMerge, lastOwnEventMs, isAbandonedInterrupted, STALE_INTERRUPTED_TTL_MS,
  isAdHocStandaloneSuperseded, ADHOC_SUPERSEDED_TTL_MS,
  isStructurallyStuck, trackStuckSkip, STRUCTURALLY_STUCK_TTL_MS, STRUCTURALLY_STUCK_REASONS,
};
