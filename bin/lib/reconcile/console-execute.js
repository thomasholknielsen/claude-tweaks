// bin/lib/reconcile/console-execute.js — convergence check 5: detect
// answered-but-unexecuted console comments (`_shared/console-on-pr.md`'s
// "Resolve console" box ticked). Detection only, in Node — several item
// kinds are judgment-bearing (memory drafting, upstream-filing scrubs), and
// only an agent session can execute them; this module finds the work, an
// agent session does it (`_shared/console-execution.md`). Deliberately
// gh-CLI-only, same constraint every other reconcile check states: a Node
// subprocess cannot reach an agent session's MCP tools, so a gh-absent
// environment reports that reason rather than attempting an MCP fallback.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { mainCheckoutRoot } = require('../hooks/worktree-detect');
const { iterRunDirsWithState } = require('../hooks/context');

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

function fetchPrComments(repoRoot, prNumber) {
  let stdout;
  try {
    stdout = execFileSync(
      'gh',
      ['pr', 'view', String(prNumber), '--json', 'comments'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: FETCH_TIMEOUT_MS },
    );
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

// Pure: consoleJson + fetched comments + now -> a detection verdict. No I/O,
// so the race/claim/idempotence logic is unit-testable without gh.
//   { action: 'ready', prNumber, commentIds, items } | { action: 'skip', reason }
function decideConsoleExecute(consoleJson, comments, now) {
  if (consoleJson === null) return { action: 'skip', reason: 'no-console' };
  if (consoleJson === undefined) return { action: 'skip', reason: 'unparseable-console-json' };
  if (consoleJson.resolved === true) return { action: 'skip', reason: 'already-resolved' };
  if (!isClaimReclaimable(consoleJson.executingAt, now)) return { action: 'skip', reason: 'claimed' };

  const commentIds = Array.isArray(consoleJson.commentIds) ? consoleJson.commentIds : [];
  if (!commentIds.length) return { action: 'skip', reason: 'no-comment-ids' };
  if (!consoleJson.prNumber) return { action: 'skip', reason: 'no-pr-number' };

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

  return { action: 'ready', prNumber: consoleJson.prNumber, commentIds, items: resolvedItems };
}

// opts: { cwd? } -> { ready: [{ runDir, prNumber, commentIds, items }], skipped: [{ runDir, reason }] }
function consoleExecuteDetect(opts = {}) {
  const ready = [];
  const skipped = [];
  const start = opts.cwd || process.cwd();
  const root = mainCheckoutRoot(start);
  if (!root) return { ready, skipped };
  const now = opts.now || Date.now();

  for (const { dir } of iterRunDirsWithState(root)) {
    const consoleJson = readConsoleJson(dir);
    if (consoleJson === null) { skipped.push({ runDir: dir, reason: 'no-console' }); continue; }
    if (consoleJson === undefined) { skipped.push({ runDir: dir, reason: 'unparseable-console-json' }); continue; }
    if (consoleJson.resolved === true) { skipped.push({ runDir: dir, reason: 'already-resolved' }); continue; }
    if (!isClaimReclaimable(consoleJson.executingAt, now)) { skipped.push({ runDir: dir, reason: 'claimed' }); continue; }

    const commentIds = Array.isArray(consoleJson.commentIds) ? consoleJson.commentIds : [];
    if (!commentIds.length) { skipped.push({ runDir: dir, reason: 'no-comment-ids' }); continue; }
    if (!consoleJson.prNumber) { skipped.push({ runDir: dir, reason: 'no-pr-number' }); continue; }

    const fetch = fetchPrComments(root, consoleJson.prNumber);
    if (!fetch.ok) { skipped.push({ runDir: dir, reason: fetch.reason }); continue; }

    const decision = decideConsoleExecute(consoleJson, fetch.comments, now);
    if (decision.action === 'skip') { skipped.push({ runDir: dir, reason: decision.reason }); continue; }
    ready.push({ runDir: dir, prNumber: decision.prNumber, commentIds: decision.commentIds, items: decision.items });
  }
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
