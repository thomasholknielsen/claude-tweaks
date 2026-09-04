// bin/lib/reconcile/console-execute.js — convergence check 5: detect
// answered-but-unexecuted console comments (`_shared/console-on-pr.md`'s
// "Resolve console" box ticked). Detection only, in Node — several item
// kinds are judgment-bearing (memory drafting, upstream-filing scrubs), and
// only an agent session can execute them; this module finds the work, an
// agent session does it (`_shared/console-execution.md`). Deliberately
// gh-CLI-only, same constraint every other reconcile check states: a Node
// subprocess cannot reach an agent session's MCP tools, so a gh-absent
// environment reports that reason rather than attempting an MCP fallback.
// #1294: also passes console.json's persisted `mergeCheckVerdict` straight
// through on a `ready` result — the executing agent session's own
// `consoleAutoResolve` wiring (`_shared/console-execution.md`) reads it from
// there rather than re-deriving it, since a foreign session has no other way
// to learn a `needs-human` verdict computed by an earlier session's
// `assess-agent-autonomy merge-check` call.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { mainCheckoutRoot } = require('../hooks/worktree-detect');
const { iterRunDirsWithState } = require('../hooks/context');
const { runWithConcurrency } = require('./gh-pool');

const execFileAsync = promisify(execFile);

const FETCH_TIMEOUT_MS = 5000;
// _shared/console-execution.md's Pre-execution claim section — a claim older
// than this with no executedAt is reclaimable by a fresh executor.
const RECLAIM_STALE_MS = 30 * 60 * 1000;

// null = no console.json at all; undefined = present but unparseable (fails
// closed, distinct from absent, mirroring archive-merged.js's readConsoleState).
function readConsoleJson(runDir) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(runDir, 'console.json'), 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// A claim is reclaimable when absent, corrupt (fails open — never lets a bad
// timestamp permanently lock a console), or older than the reclaim window.
function isClaimReclaimable(executingAt, now) {
  if (!executingAt) return true;
  const claimedAt = Date.parse(executingAt);
  if (Number.isNaN(claimedAt)) return true;
  return (now - claimedAt) > RECLAIM_STALE_MS;
}

// `<!-- console-item: resolve -->` immediately followed by its checkbox row
// (`_shared/console-on-pr.md`'s Row shape) -> ticked boolean.
function isResolveTicked(body) {
  if (typeof body !== 'string') return false;
  const m = /<!--\s*console-item:\s*resolve\s*-->\s*\n-\s*\[([ xX])\]/.exec(body);
  return !!m && m[1].toLowerCase() === 'x';
}

// Every `<!-- console-item: {id} -->` row (excluding `resolve`, read
// separately above) -> { id: ticked }.
function parseItemTicks(body) {
  const ticks = {};
  if (typeof body !== 'string') return ticks;
  const re = /<!--\s*console-item:\s*([^\s>]+)\s*-->\s*\n-\s*\[([ xX])\]/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    const id = match[1];
    if (id === 'resolve') continue;
    ticks[id] = match[2].toLowerCase() === 'x';
  }
  return ticks;
}

// Async (promisified execFile, non-blocking) so this module's per-run-dir
// fetches can genuinely run concurrently through gh-pool's
// runWithConcurrency below, unlike the old execFileSync, which blocks the
// event loop regardless of how the calling code is structured (#820, D5).
async function fetchPrComments(repoRoot, prNumber) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      'gh',
      ['pr', 'view', String(prNumber), '--json', 'comments'],
      { cwd: repoRoot, encoding: 'utf8', timeout: FETCH_TIMEOUT_MS, windowsHide: true },
    ));
  } catch (e) {
    if (e && e.code === 'ENOENT') return { ok: false, reason: 'gh-absent' };
    return { ok: false, reason: 'network-failure' };
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { ok: false, reason: 'network-failure' };
  }
  const comments = Array.isArray(parsed && parsed.comments) ? parsed.comments : [];
  return { ok: true, comments };
}

// Pure: consoleJson + now -> the pre-fetch skip reason, or null when
// eligible. Shared by decideConsoleExecute below (the full post-fetch
// decision) and consoleExecuteDetect's synchronous scan further down — the
// two-phase split (#820, D5) needs the scan to reject everything it can
// BEFORE issuing a `gh pr view` fetch, using exactly the same checks
// decideConsoleExecute re-applies once comments are in hand. One ladder
// instead of two copies that could drift.
function preFetchSkipReason(consoleJson, now) {
  if (consoleJson === null) return 'no-console';
  if (consoleJson === undefined) return 'unparseable-console-json';
  // #1130 review: a non-empty executedAt is execution's own completion stamp
  // — consoles written before the write order also set `resolved: true`
  // (console-execution.md) carry executedAt alone. Without this,
  // an executed-but-unarchived console whose executingAt claim aged past
  // RECLAIM_STALE_MS re-detected as `ready` on every pass (the PR checkbox
  // stays ticked), re-applying Q#/M#/U# items that have no drift guard —
  // and archive-merged.js's readConsoleState (which does accept executedAt)
  // would classify the same file 'resolved' in the same reconcile pass.
  // Same acceptance rule as readConsoleState: keep the two readers agreeing.
  if (consoleJson.resolved === true
    || (typeof consoleJson.executedAt === 'string' && consoleJson.executedAt.trim().length > 0)) {
    return 'already-resolved';
  }
  if (!isClaimReclaimable(consoleJson.executingAt, now)) return 'claimed';
  const commentIds = Array.isArray(consoleJson.commentIds) ? consoleJson.commentIds : [];
  if (!commentIds.length) return 'no-comment-ids';
  if (!consoleJson.prNumber) return 'no-pr-number';
  return null;
}

// Pure: consoleJson + fetched comments + now -> a detection verdict. No I/O,
// so the race/claim/idempotence logic is unit-testable without gh.
//   { action: 'ready', prNumber, commentIds, items } | { action: 'skip', reason }
function decideConsoleExecute(consoleJson, comments, now) {
  const skipReason = preFetchSkipReason(consoleJson, now);
  if (skipReason) return { action: 'skip', reason: skipReason };

  const commentIds = consoleJson.commentIds;

  const byId = new Map();
  for (const c of comments || []) {
    if (c && typeof c.id === 'string') byId.set(c.id, c);
  }

  const primary = byId.get(commentIds[0]);
  if (!primary) return { action: 'skip', reason: 'comment-not-found' };
  if (!isResolveTicked(primary.body)) return { action: 'skip', reason: 'not-resolved-yet' };

  // Overflow comments (console-on-pr.md's Post-or-update procedure step 4)
  // each carry their own item ticks; the primary carries the Resolve box.
  const ticksByComment = new Map();
  for (const id of commentIds) {
    const c = byId.get(id);
    ticksByComment.set(id, c ? parseItemTicks(c.body) : {});
  }

  const items = Array.isArray(consoleJson.items) ? consoleJson.items : [];
  const resolvedItems = items.map((item) => {
    const commentId = item.commentId && commentIds.includes(item.commentId) ? item.commentId : commentIds[0];
    const ticks = ticksByComment.get(commentId) || {};
    return { id: item.id, kind: item.kind, summary: item.summary, stagedHash: item.stagedHash, approved: ticks[item.id] === true };
  });

  // #1294: pass the persisted merge-check verdict through untouched — it comes from
  // console.json (written by `_shared/console-on-pr.md`'s post procedure), never from the
  // comment body, since a tick can't carry it. `null` when the record's group never had a
  // merge-check verdict computed at render time (no `auto:merge`/`auto:merge-pending` in
  // play that session) — absence means "unknown", not "cleared for auto-merge".
  const mergeCheckVerdict = consoleJson.mergeCheckVerdict === 'needs-human' ? 'needs-human' : null;

  return {
    action: 'ready', prNumber: consoleJson.prNumber, commentIds, items: resolvedItems, mergeCheckVerdict,
  };
}

// opts: { cwd? } -> { ready: [{ runDir, prNumber, commentIds, items, mergeCheckVerdict }], skipped: [{ runDir, reason }] }
// Runs in two phases (#820, D5): a synchronous scan collecting every run dir
// that needs a `gh pr view` fetch (fast fs reads + pure pre-checks), then
// one gh-pool `runWithConcurrency` batch resolving all of those fetches at
// once, then a final synchronous pass deciding each — since each fetch
// result feeds its own `decideConsoleExecute` call, decide happens after,
// not inside, the parallel batch.
async function consoleExecuteDetect(opts = {}) {
  const ready = [];
  const skipped = [];
  const start = opts.cwd || process.cwd();
  const root = mainCheckoutRoot(start);
  if (!root) return { ready, skipped };
  const now = opts.now || Date.now();

  const candidates = [];
  for (const { dir } of iterRunDirsWithState(root)) {
    const consoleJson = readConsoleJson(dir);
    const skipReason = preFetchSkipReason(consoleJson, now);
    if (skipReason) { skipped.push({ runDir: dir, reason: skipReason }); continue; }
    candidates.push({ dir, consoleJson });
  }

  const fetches = await runWithConcurrency(candidates, (c) => fetchPrComments(root, c.consoleJson.prNumber));

  candidates.forEach((c, i) => {
    const fetch = fetches[i] instanceof Error ? { ok: false, reason: 'network-failure' } : fetches[i];
    if (!fetch.ok) { skipped.push({ runDir: c.dir, reason: fetch.reason }); return; }
    const decision = decideConsoleExecute(c.consoleJson, fetch.comments, now);
    if (decision.action === 'skip') { skipped.push({ runDir: c.dir, reason: decision.reason }); return; }
    ready.push({
      runDir: c.dir, prNumber: decision.prNumber, commentIds: decision.commentIds, items: decision.items, mergeCheckVerdict: decision.mergeCheckVerdict,
    });
  });

  return { ready, skipped };
}

module.exports = {
  consoleExecuteDetect,
  decideConsoleExecute,
  isResolveTicked,
  parseItemTicks,
  isClaimReclaimable,
  readConsoleJson,
  RECLAIM_STALE_MS,
};
