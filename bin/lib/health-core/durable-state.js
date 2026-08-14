'use strict';
const { execFileSync } = require('child_process');

// Durable cross-firing state for the health skills, backed by a dedicated
// git branch (never merged into main) instead of local gitignored disk —
// local disk doesn't survive a scheduled cloud-routine (CCR) container
// recycling between firings. Contract: skills/_shared/health-state.md.
//
// Impure (execFileSync git calls), matching bin/lib/code-health/scope.js's
// existing precedent — not bin/lib/issues/claims.js's emit-only pattern,
// since reading/writing this branch is mechanical plumbing nobody inspects
// mid-flight, unlike issue claim/release which is a decision-laden,
// audit-visible action meant to be legible in the skill's own bash trail.
// The command runner is injectable so tests substitute a fake one instead
// of touching real network (git fetch/push can't run for real in a
// sandboxed unit test the way scope.js's local git log calls can).
//
// Writes are plain git plumbing (hash-object/mktree/commit-tree/push), not
// the GitHub Data API — proven to work identically local or in a Claude Code
// cloud Routine sandbox (no gh CLI, no MCP dependency either). Was
// docs/superpowers/specs/2026-07-30-durable-state-git-native-write-design.md
// — deleted (70849915) — for why: these are plain Git Data API primitives
// with no GitHub-specific semantics, unlike an actual GitHub write (issue
// create/comment/etc).

const HEALTH_STATE_BRANCH = 'health-state';
const MAX_RUN_HISTORY = 90;
const ESCALATE_AFTER_ATTEMPTS = 3;
const MAX_CAS_ATTEMPTS = 3;
const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // git's well-known empty-tree sha

// Randomized, increasing backoff between CAS retry attempts — up to 4
// engines (code-health, harness-health, docs-health, journey-health) write to
// this SAME branch ref (only the file paths underneath it are namespaced),
// so a collision on retry is exactly as likely as the first one without some
// jitter to de-synchronize concurrent writers. attempt is 1-based; each
// attempt's window (attempt*CAS_BACKOFF_BASE_MS to (attempt+1)*BASE) never
// overlaps the next, so later attempts always wait at least as long.
const CAS_BACKOFF_BASE_MS = 100;
const CAS_BACKOFF_JITTER_MS = 100;

function casBackoffMs(attempt) {
  return attempt * CAS_BACKOFF_BASE_MS + Math.random() * CAS_BACKOFF_JITTER_MS;
}

// Synchronous sleep, consistent with this module's execFileSync-based style
// (no async/await anywhere else in it). Injectable so tests substitute a fake
// that records calls instead of actually blocking.
function defaultSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function statePath(skillName, file) {
  return `${skillName}/${file}`;
}

// Keep the newest maxCount records by runAt, dropping the oldest.
function pruneRuns(runs, maxCount = MAX_RUN_HISTORY) {
  const sorted = [...runs].sort((a, b) => (a.runAt < b.runAt ? -1 : a.runAt > b.runAt ? 1 : 0));
  return sorted.slice(Math.max(0, sorted.length - maxCount));
}

// Upsert by fingerprint: a repeat failure increments attempts and updates
// lastError without disturbing firstFailedAt; a brand-new fingerprint starts
// at attempts:1.
function enqueueRetry(queue, entry, { now = Date.now() } = {}) {
  const idx = queue.findIndex((e) => e.fingerprint === entry.fingerprint);
  if (idx === -1) {
    return [
      ...queue,
      {
        fingerprint: entry.fingerprint,
        payload: entry.payload,
        firstFailedAt: new Date(now).toISOString(),
        attempts: 1,
        lastError: entry.lastError || null,
      },
    ];
  }
  const next = [...queue];
  next[idx] = { ...next[idx], attempts: next[idx].attempts + 1, lastError: entry.lastError || next[idx].lastError };
  return next;
}

function dequeueRetry(queue, fingerprint) {
  return queue.filter((e) => e.fingerprint !== fingerprint);
}

function shouldEscalate(entry) {
  return !!entry && entry.attempts >= ESCALATE_AFTER_ATTEMPTS;
}

// 30s — a hung git call fails fast instead of blocking the CLI invocation
// (and, transitively, the calling skill's Bash tool call) indefinitely.
// Callers can still override via opts, spread after this default.
const DEFAULT_RUN_TIMEOUT_MS = 30000;

function defaultRun(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', timeout: DEFAULT_RUN_TIMEOUT_MS, ...opts });
}

function createDurableState(skillName, {
  run = defaultRun, sleep = defaultSleep, includeRemembered = false, includeDeclined = false,
} = {}) {
  function showFile(root, relPath, fallback) {
    try {
      const out = run('git', ['-C', root, 'show', `origin/${HEALTH_STATE_BRANCH}:${relPath}`]);
      return JSON.parse(out);
    } catch {
      return fallback;
    }
  }

  function currentCommitSha(root) {
    try {
      return run('git', ['-C', root, 'rev-parse', `origin/${HEALTH_STATE_BRANCH}`]).trim();
    } catch {
      return null;
    }
  }

  // Combined commit+tree sha lookup for writeState's hot path — one process
  // spawn instead of two separate `git rev-parse` calls against the exact
  // same already-fetched ref, on every CAS attempt.
  function currentRefShas(root) {
    try {
      const out = run('git', ['-C', root, 'rev-parse', `origin/${HEALTH_STATE_BRANCH}`, `origin/${HEALTH_STATE_BRANCH}^{tree}`]);
      const lines = out.trim().split('\n');
      return { commitSha: lines[0] ? lines[0].trim() : null, treeSha: lines[1] ? lines[1].trim() : null };
    } catch {
      return { commitSha: null, treeSha: null };
    }
  }

  // Read the per-skill files at whatever branch tip the caller already
  // fetched, WITHOUT triggering another network fetch. Shared by the public
  // readState below (which fetches first, for standalone callers) and by
  // writeState's own CAS loop (which already fetched once per attempt). The
  // loop must never call the fetch-then-read path a second time: a redundant
  // fetch transiently failing would make that path silently degrade to empty
  // defaults and hand the mutator bogus near-empty state, durably
  // overwriting the branch's real cursors/retry-queue/run-history even
  // though the push's fast-forward check has no way to catch a bad-but-valid
  // write like that.
  function readFilesAtFetchedTip(root) {
    const state = {
      cursors: showFile(root, statePath(skillName, 'cursors.json'), {}),
      retryQueue: showFile(root, statePath(skillName, 'retry-queue.json'), []),
      runs: showFile(root, statePath(skillName, 'runs.json'), []),
    };
    if (includeRemembered) state.remembered = showFile(root, statePath(skillName, 'remembered.json'), {});
    if (includeDeclined) state.declined = showFile(root, statePath(skillName, 'declined.json'), {});
    return state;
  }

  // Reads never throw: a missing branch/file degrades to the empty default,
  // matching cache.js's existing "corrupt/missing JSON -> {}" convention.
  // `remembered`/`declined` are only ever present when this skill opted in
  // via includeRemembered/includeDeclined — a skill that didn't must never
  // see the key at all, so a skill that never opted in can't accidentally
  // pick up a spurious file (see buildFiles below, which gates on the same
  // flags).
  function readState(root) {
    try {
      run('git', ['-C', root, 'fetch', 'origin', HEALTH_STATE_BRANCH]);
    } catch (err) {
      // Distinguish a genuine first run (the branch simply doesn't exist yet)
      // from a real fetch failure (network/auth/timeout) — both degrade to
      // the same empty defaults, but only the latter is worth a trace. Every
      // caller of readState (cmdNextSlice/cmdNextTarget/cmdStatus/
      // cmdChurnReport across all 4 engines) consumes the return value
      // directly with no failure signal of its own, so this is the only
      // place a maintainer could see the difference.
      if (!/couldn't find remote ref/i.test(String(err.message))) {
        process.stderr.write(`health-state: fetch failed, treating as empty state: ${err.message}\n`);
      }
      const empty = { cursors: {}, retryQueue: [], runs: [] };
      if (includeRemembered) empty.remembered = {};
      if (includeDeclined) empty.declined = {};
      return empty;
    }
    return readFilesAtFetchedTip(root);
  }

  // ─── git-native tree/commit primitives ───────────────────────────────────
  // Replace the old GitHub Data API calls (gh api .../git/blobs|trees|
  // commits|refs) one-for-one with plain git plumbing that writes to the
  // LOCAL object database and publishes with a single `git push` at the end
  // — no `gh` CLI, no MCP dependency, works identically local or in a cloud
  // Routine sandbox (see this file's header comment).

  // Parses `git ls-tree <treeSha>` output (one entry per line: "<mode> SP
  // <type> SP <sha> TAB <name>") into a Map keyed by name, so callers can
  // splice in new entries without disturbing ones they don't touch. Returns
  // an empty Map for a falsy/EMPTY_TREE_SHA treeSha or any sha git can't
  // resolve (a not-yet-existing subtree on this skill's very first write).
  function readTreeEntries(root, treeSha) {
    const entries = new Map();
    if (!treeSha || treeSha === EMPTY_TREE_SHA) return entries;
    let out;
    try {
      out = run('git', ['-C', root, 'ls-tree', treeSha]);
    } catch {
      return entries;
    }
    for (const line of out.split('\n')) {
      if (!line) continue;
      const tabIdx = line.indexOf('\t');
      const [mode, type, sha] = line.slice(0, tabIdx).split(' ');
      const name = line.slice(tabIdx + 1);
      entries.set(name, { mode, type, sha });
    }
    return entries;
  }

  // Writes `content` as a git blob object and returns its sha. Never touches
  // the network — `hash-object -w` writes to the LOCAL object database only;
  // publishing happens later, in one shot, via pushRef.
  function writeBlob(root, content) {
    return run('git', ['-C', root, 'hash-object', '-w', '--stdin'], { input: content }).trim();
  }

  // entries: Map<name, {mode, type, sha}> (see readTreeEntries). Serializes
  // to `git mktree`'s expected stdin format and returns the new tree sha.
  // Sort order: plain lexicographic-by-name is sufficient here because this
  // branch's actual layout never mixes blob and tree entries at the same
  // tree level (root = one tree entry per skill directory; each skill's own
  // subtree = only blob entries, no nesting) — git's tree-sort
  // trailing-slash-for-directories nuance never applies to this data shape.
  function writeTree(root, entries) {
    const names = [...entries.keys()].sort();
    const input = names
      .map((name) => {
        const { mode, type, sha } = entries.get(name);
        return `${mode} ${type} ${sha}\t${name}`;
      })
      .join('\n') + (names.length ? '\n' : '');
    return run('git', ['-C', root, 'mktree'], { input }).trim();
  }

  // parentSha: null for the very first commit on this branch (omits -p).
  function writeCommit(root, treeSha, parentSha, message) {
    const args = ['-C', root, 'commit-tree', treeSha];
    if (parentSha) args.push('-p', parentSha);
    args.push('-m', message);
    return run('git', args).trim();
  }

  // The compare-and-swap: a plain (non-force) push creates the ref if it
  // doesn't exist yet, fast-forward-updates it if it does, and is rejected
  // (throws) if commitSha is not a fast-forward of whatever the remote
  // actually has right now — no separate create-vs-update distinction
  // needed, unlike the GitHub Data API's POST-vs-PATCH split this replaces.
  function pushRef(root, commitSha) {
    run('git', ['-C', root, 'push', 'origin', `${commitSha}:refs/heads/${HEALTH_STATE_BRANCH}`]);
  }

  function buildFiles(next) {
    const files = [
      { path: statePath(skillName, 'cursors.json'), content: JSON.stringify(next.cursors, null, 2) },
      { path: statePath(skillName, 'retry-queue.json'), content: JSON.stringify(next.retryQueue, null, 2) },
      { path: statePath(skillName, 'runs.json'), content: JSON.stringify(pruneRuns(next.runs), null, 2) },
    ];
    // Gated on the skill-level includeRemembered flag, NOT on truthiness of
    // next.remembered — an empty {} is truthy, so inferring from data shape
    // would write a spurious remembered.json for every skill (harness-health,
    // journey-health included) the first time any mutator merely spreads
    // ...current without deleting the key. includeRemembered is decided once,
    // at createDurableState call time, precisely to rule that out.
    if (includeRemembered) {
      files.push({ path: statePath(skillName, 'remembered.json'), content: JSON.stringify(next.remembered || {}, null, 2) });
    }
    // Same truthy-{}-is-not-enough reasoning as includeRemembered above:
    // gated on the skill-level flag, decided once at createDurableState call
    // time, not on runtime shape of next.declined.
    if (includeDeclined) {
      files.push({ path: statePath(skillName, 'declined.json'), content: JSON.stringify(next.declined || {}, null, 2) });
    }
    return files;
  }

  // Merges buildFiles' output into the skill's existing subtree (preserving
  // any file this write doesn't touch — e.g. a stale remembered.json left
  // over from a prior includeRemembered period), then splices the result
  // into the branch's root tree (adding this skill's entry if it's the
  // skill's first-ever write, replacing it otherwise). Returns the new root
  // tree sha.
  function buildRootTree(root, baseTreeSha, files) {
    const rootEntries = readTreeEntries(root, baseTreeSha);
    const existingSkillEntry = rootEntries.get(skillName);
    const skillEntries = readTreeEntries(root, existingSkillEntry ? existingSkillEntry.sha : null);
    for (const file of files) {
      // file.path is "{skillName}/{name}" (see statePath) — strip the
      // skill-name prefix to get the bare filename this subtree uses as its
      // own entry key.
      const name = file.path.slice(skillName.length + 1);
      skillEntries.set(name, { mode: '100644', type: 'blob', sha: writeBlob(root, file.content) });
    }
    const newSkillTreeSha = writeTree(root, skillEntries);
    rootEntries.set(skillName, { mode: '040000', type: 'tree', sha: newSkillTreeSha });
    return writeTree(root, rootEntries);
  }

  function writeState(root, mutatorFn) {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt++) {
      let commitSha = null;
      try {
        try {
          run('git', ['-C', root, 'fetch', 'origin', HEALTH_STATE_BRANCH]);
        } catch {
          // Branch doesn't exist yet (this skill's first-ever write) or a
          // transient fetch failure — either way, fall through and attempt
          // the write below. A genuinely first-ever branch legitimately has
          // nothing to fetch; a transient failure self-corrects on retry (a
          // push against stale/absent tracking data is rejected as
          // non-fast-forward if the branch actually has unrelated remote
          // history, and the next attempt re-fetches from scratch).
        }
        const { commitSha: parentSha, treeSha: baseTreeSha } = currentRefShas(root);
        const current = readFilesAtFetchedTip(root);
        const next = mutatorFn(current);
        const files = buildFiles(next);
        const rootTreeSha = buildRootTree(root, baseTreeSha, files);
        commitSha = writeCommit(root, rootTreeSha, parentSha, `health-state: ${skillName} update`);
        pushRef(root, commitSha);
        return { ok: true };
      } catch (err) {
        lastError = err;
        // The commit we attempted to point the ref at was successfully built
        // (writeCommit succeeded) and pushRef then failed — but "failed" here
        // is ambiguous: it could be a genuine rejection (branch moved to a
        // DIFFERENT commit, fast-forward check failed — safe to retry) or the
        // push actually landed server-side and only the local process saw an
        // error (a network drop after the remote processed it). Blindly
        // retrying in the ambiguous case would re-run mutatorFn a SECOND time
        // against its own already-applied result — silently double-counting
        // a non-idempotent mutator like enqueueRetry's attempts++ for a
        // single real failure. Re-fetching and re-checking the ref here tells
        // the two apart: if it now points at the commit we just tried to set,
        // our push DID land and this attempt must be treated as a success,
        // not retried.
        if (commitSha) {
          try { run('git', ['-C', root, 'fetch', 'origin', HEALTH_STATE_BRANCH]); } catch { /* see tolerant-fetch comment above */ }
          if (currentCommitSha(root) === commitSha) return { ok: true };
        }
        if (attempt < MAX_CAS_ATTEMPTS) sleep(casBackoffMs(attempt));
      }
    }
    return { ok: false, error: lastError && lastError.message };
  }

  return { readState, writeState };
}

module.exports = {
  HEALTH_STATE_BRANCH,
  MAX_RUN_HISTORY,
  ESCALATE_AFTER_ATTEMPTS,
  MAX_CAS_ATTEMPTS,
  statePath,
  pruneRuns,
  enqueueRetry,
  dequeueRetry,
  shouldEscalate,
  casBackoffMs,
  createDurableState,
  defaultSleep,
};
