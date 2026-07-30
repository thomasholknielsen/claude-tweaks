# Durable-State Git-Native Write Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `durable-state.js`'s gh-api-primary + MCP-fallback write path with plain git plumbing (fixing GitHub #63), and fix code-health's `.` slice recursion bug (GitHub #66), which #63 currently masks.

**Architecture:** `writeState()` builds its commit entirely from local git plumbing (`hash-object`/`ls-tree`/`mktree`/`commit-tree`) and publishes with a single `git push`, which both creates and fast-forward-updates the `health-state` ref — no `gh` CLI, no MCP dependency, no separate bootstrap step. The entire MCP-fallback layer (`mcp-pending.js`, `retry-durable-write.js`, `needsMcpWrite` handling in 4 CLIs) is deleted as dead code. Separately, `code-health/scope.js`'s `.` slice is redefined from "whole repo root, recursive" to "direct root-level files only" to stop it from overlapping every other slice.

**Tech Stack:** Node.js (`node --test`), `execFileSync`-based git plumbing, no new dependencies.

## Global Constraints

- `npm test` (the full suite, all of `tests/`, `bin/lib/*/tests/`) must pass after every task — baseline is 1704 passing tests in this worktree.
- No real git/gh network calls in unit tests — `durable-state.test.js` and `retry-cli.test.js` use the existing injectable `run(cmd, args, opts)` fake-runner pattern (match on `(cmd, args)` substrings, canned `returns`/`throws`). `scope.test.js` uses real temp dirs + real `git`/`find` (its existing, different convention) — don't mix the two styles.
- Do not write or edit any file under `docs/decisions/` (ADRs) in this plan — flagged as candidates for `/wrap-up`'s own gate per `skills/_shared/decision-records.md`.
- Every git command in `durable-state.js` continues to pass `-C <root>` first, matching the existing style.
- Commit after each task.

---

## Task 1: Rewrite `durable-state.js` to git-native writes, with a fully rewritten test file

**Files:**
- Modify: `bin/lib/health-core/durable-state.js` (full rewrite of the write-path internals; read path untouched)
- Modify: `bin/lib/health-core/tests/durable-state.test.js` (full rewrite of the write-path tests; read-path tests untouched)

**Interfaces:**
- Consumes: nothing new — `execFileSync`, same as before.
- Produces: `createDurableState(skillName, { run, sleep, includeRemembered, includeDeclined } = {})` returns `{ readState(root), writeState(root, mutatorFn) }` — **identical public signature to today**, minus the `hasGh` option (no longer accepted; nothing outside this file's own tests ever passed it). `writeState` now only ever returns `{ ok: true }` or `{ ok: false, error }` — the `needsMcpWrite` shape is gone. This is what Task 2's callers depend on.

- [ ] **Step 1: Replace `bin/lib/health-core/durable-state.js` in full**

Replace the entire file content with:

```js
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
// cloud Routine sandbox (no gh CLI, no MCP dependency either). See
// docs/superpowers/specs/2026-07-30-durable-state-git-native-write-design.md
// for why: these are plain Git Data API primitives with no GitHub-specific
// semantics, unlike an actual GitHub write (issue create/comment/etc).

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
```

- [ ] **Step 2: Replace `bin/lib/health-core/tests/durable-state.test.js` in full**

Replace the entire file content with:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
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
} = require('../durable-state');

test('constants', () => {
  assert.strictEqual(HEALTH_STATE_BRANCH, 'health-state');
  assert.strictEqual(MAX_RUN_HISTORY, 90);
  assert.strictEqual(ESCALATE_AFTER_ATTEMPTS, 3);
});

test('statePath namespaces a file under the skill name', () => {
  assert.strictEqual(statePath('code-health', 'cursors.json'), 'code-health/cursors.json');
});

test('pruneRuns keeps only the newest maxCount records, oldest first order preserved', () => {
  const runs = [
    { runId: 'a', runAt: '2026-01-01T00:00:00.000Z' },
    { runId: 'b', runAt: '2026-01-02T00:00:00.000Z' },
    { runId: 'c', runAt: '2026-01-03T00:00:00.000Z' },
  ];
  const pruned = pruneRuns(runs, 2);
  assert.deepStrictEqual(pruned.map((r) => r.runId), ['b', 'c']);
});

test('pruneRuns is a no-op when runs.length <= maxCount', () => {
  const runs = [{ runId: 'a', runAt: '2026-01-01T00:00:00.000Z' }];
  assert.deepStrictEqual(pruneRuns(runs, 90), runs);
});

test('pruneRuns sorts by runAt before slicing, regardless of input order', () => {
  const runs = [
    { runId: 'c', runAt: '2026-01-03T00:00:00.000Z' },
    { runId: 'a', runAt: '2026-01-01T00:00:00.000Z' },
    { runId: 'b', runAt: '2026-01-02T00:00:00.000Z' },
  ];
  assert.deepStrictEqual(pruneRuns(runs, 2).map((r) => r.runId), ['b', 'c']);
});

test('enqueueRetry adds a brand-new fingerprint with attempts:1', () => {
  const next = enqueueRetry([], { fingerprint: 'ch-abc123', payload: { title: 't' } }, { now: 1720000000000 });
  assert.strictEqual(next.length, 1);
  assert.strictEqual(next[0].fingerprint, 'ch-abc123');
  assert.strictEqual(next[0].attempts, 1);
  assert.strictEqual(next[0].firstFailedAt, new Date(1720000000000).toISOString());
});

test('enqueueRetry increments attempts for an existing fingerprint instead of duplicating', () => {
  const queue = [{ fingerprint: 'ch-abc123', payload: { title: 't' }, firstFailedAt: 'x', attempts: 1, lastError: null }];
  const next = enqueueRetry(queue, { fingerprint: 'ch-abc123', payload: { title: 't' }, lastError: 'timeout' }, { now: 1720000000000 });
  assert.strictEqual(next.length, 1);
  assert.strictEqual(next[0].attempts, 2);
  assert.strictEqual(next[0].lastError, 'timeout');
  assert.strictEqual(next[0].firstFailedAt, 'x', 'firstFailedAt must not change on repeat failures');
});

test('dequeueRetry removes only the matching fingerprint', () => {
  const queue = [
    { fingerprint: 'a', attempts: 1 },
    { fingerprint: 'b', attempts: 1 },
  ];
  assert.deepStrictEqual(dequeueRetry(queue, 'a'), [{ fingerprint: 'b', attempts: 1 }]);
});

test('shouldEscalate is true at exactly ESCALATE_AFTER_ATTEMPTS and beyond, false below it', () => {
  assert.strictEqual(shouldEscalate({ attempts: 2 }), false);
  assert.strictEqual(shouldEscalate({ attempts: 3 }), true);
  assert.strictEqual(shouldEscalate({ attempts: 4 }), true);
});

test('shouldEscalate is false for a missing entry', () => {
  assert.strictEqual(shouldEscalate(null), false);
  assert.strictEqual(shouldEscalate(undefined), false);
});

test('casBackoffMs windows never overlap across attempts, guaranteeing a later attempt always waits longer', () => {
  for (let attempt = 1; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    for (let i = 0; i < 20; i++) {
      const a = casBackoffMs(attempt);
      const b = casBackoffMs(attempt + 1);
      assert.ok(a > 0 && b > 0, 'both must be positive durations');
      assert.ok(b > a, `attempt ${attempt + 1}'s backoff (${b}) must exceed attempt ${attempt}'s (${a})`);
    }
  }
});

// --- createDurableState: fake runner records every (cmd, args, opts) call and
// returns canned responses keyed by a simple pattern match on args. `returns`/
// `throws` may be a plain value OR a function of (cmd, args) called lazily on
// each match — use a function whenever a rule needs to react to prior calls
// (a counter, a flag flipped by an earlier matched rule) so the state change
// happens when the fake is actually invoked by the code under test, not once
// eagerly while the script array literal is being built. ---

function fakeRunner(script) {
  const calls = [];
  function run(cmd, args, opts) {
    calls.push({ cmd, args, opts });
    for (const rule of script) {
      if (rule.match(cmd, args)) {
        const throwsVal = typeof rule.throws === 'function' ? rule.throws(cmd, args) : rule.throws;
        if (throwsVal) throw new Error(throwsVal);
        return typeof rule.returns === 'function' ? rule.returns(cmd, args) : rule.returns;
      }
    }
    throw new Error(`fakeRunner: no rule matched ${cmd} ${JSON.stringify(args)}`);
  }
  return { run, calls };
}

function matchArgs(args, needle) {
  return args.join(' ').includes(needle);
}

// The common writeState success-path rule set (the combined commit+tree
// rev-parse, the single-ref rev-parse used by the ambiguity check, fetch,
// show, and the git-native blob/tree/commit sequence) that every writeState
// test below needs identically -- only the final push rule (matched
// separately via pushRule()) actually varies per test (a plain success, a
// retry-then-succeed, or an always-fail). Extracted so a change to the real
// git call sequence only needs updating in one place instead of many
// near-identical copies.
//
// The static (non-toggling) single-ref rev-parse rule below always returns
// 'commit-sha-1' — this is what the ambiguity check in writeState's catch
// block compares a failed push's commitSha against. Since every test using
// this shared rule set builds commits with sha 'commit-sha-2' (see the
// commit-tree rule), 'commit-sha-2' !== 'commit-sha-1' always, so the
// ambiguity check correctly falls through to a genuine retry rather than
// ever accidentally reporting a false success. Tests that specifically want
// to exercise the "push secretly landed" ambiguous case override this rule
// with their own toggling version instead of spreading this helper.
function baseWriteStateRules() {
  return [
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'commit-sha-1\ntree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'ls-tree'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'hash-object'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'mktree'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'commit-tree'), returns: 'commit-sha-2\n' },
  ];
}

// The one rule each writeState test genuinely varies on: the final
// `git push origin <sha>:refs/heads/health-state` call. `behavior` is a
// { returns } or { throws } object, matching fakeRunner's own rule shape, so
// callers can pass a plain value or a lazy function exactly as they would
// inline.
function pushRule(behavior) {
  return {
    match: (cmd, args) => cmd === 'git' && matchArgs(args, 'push') && matchArgs(args, 'refs/heads/health-state'),
    ...behavior,
  };
}

// Extracts the bare filenames a mktree call was fed, in the order captured —
// used to assert which files a write's skill-subtree rebuild included.
// `calls` must be filtered to the mktree calls first; index 0 is always the
// skill subtree (built before the root tree — see buildRootTree's ordering).
function mktreeEntryNames(mktreeCall) {
  return mktreeCall.opts.input.split('\n').filter(Boolean).map((line) => line.split('\t')[1]);
}

test('readState returns empty defaults when the branch does not exist yet (includeRemembered:true skill)', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), throws: "couldn't find remote ref health-state" },
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const state = ds.readState('/repo');
  assert.deepStrictEqual(state, { cursors: {}, remembered: {}, retryQueue: [], runs: [] });
});

function withCapturedStderr(fn) {
  let out = '';
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { out += chunk; return true; };
  try {
    fn();
  } finally {
    process.stderr.write = original;
  }
  return out;
}

test('readState stays silent on a genuinely first-ever run (branch simply does not exist yet)', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), throws: "couldn't find remote ref health-state" },
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const stderrOut = withCapturedStderr(() => ds.readState('/repo'));
  assert.strictEqual(stderrOut, '', 'a genuine first run must not be logged as if it were a failure');
});

test('readState writes a stderr trace on a genuine fetch failure, distinguishing it from a first-ever run', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), throws: 'fatal: unable to access https://github.com/x/y.git/: Could not resolve host: github.com' },
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  let state;
  const stderrOut = withCapturedStderr(() => { state = ds.readState('/repo'); });
  assert.deepStrictEqual(state, { cursors: {}, remembered: {}, retryQueue: [], runs: [] }, 'still degrades to empty defaults, never throws');
  assert.ok(stderrOut.includes('fetch failed'), `expected a fetch-failure trace in stderr: ${stderrOut}`);
});

test('readState parses each file via git show, defaulting missing files to {}/[]', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'cursors.json'), returns: JSON.stringify({ '.': { lastSweptMs: 1 } }) },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'remembered.json'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'retry-queue.json'), returns: '[]' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'runs.json'), returns: '[]' },
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const state = ds.readState('/repo');
  assert.deepStrictEqual(state.cursors, { '.': { lastSweptMs: 1 } });
  assert.deepStrictEqual(state.remembered, {});
  assert.deepStrictEqual(state.retryQueue, []);
  assert.deepStrictEqual(state.runs, []);
});

test('readState omits the remembered key entirely for a skill that does not opt in (includeRemembered defaults to false)', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
  ]);
  const ds = createDurableState('harness-health', { run, sleep: () => {} });
  const state = ds.readState('/repo');
  assert.deepStrictEqual(state, { cursors: {}, retryQueue: [], runs: [] });
  assert.ok(!('remembered' in state), 'a skill that never opts in must never see a remembered key at all');
});

test('writeState succeeds on the first attempt: fetch, read, build blobs/tree/commit, push', () => {
  const written = {};
  const { run } = fakeRunner([
    ...baseWriteStateRules(),
    pushRule({ returns: () => { written.updated = true; return ''; } }),
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => ({ ...current, cursors: { '.': { lastSweptMs: 2 } } }));
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(written.updated, true);
});

test('writeState retries on a rejected (non-fast-forward) push, then succeeds', () => {
  let pushAttempts = 0;
  const { run } = fakeRunner([
    ...baseWriteStateRules(),
    pushRule({
      returns: () => {
        pushAttempts += 1;
        if (pushAttempts === 1) throw new Error('! [rejected] health-state -> health-state (non-fast-forward)');
        return '';
      },
    }),
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => ({ ...current, cursors: { '.': { lastSweptMs: 2 } } }));
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(pushAttempts, 2, 'must retry the whole read-modify-write cycle after a rejection');
});

test('writeState gives up gracefully (no throw) after MAX_CAS_ATTEMPTS exhausted', () => {
  const { run } = fakeRunner([
    ...baseWriteStateRules(),
    pushRule({ throws: '! [rejected] health-state -> health-state (non-fast-forward)' }),
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error, 'must report why it gave up');
});

test('writeState waits an increasing, jittered interval between CAS retry attempts', () => {
  const { run } = fakeRunner([
    ...baseWriteStateRules(),
    pushRule({ throws: '! [rejected] health-state -> health-state (non-fast-forward)' }),
  ]);
  const sleepCalls = [];
  const ds = createDurableState('code-health', { run, sleep: (ms) => sleepCalls.push(ms), includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.strictEqual(result.ok, false, 'sanity check: this scenario exhausts every attempt, same as the test above');
  assert.strictEqual(sleepCalls.length, MAX_CAS_ATTEMPTS - 1, 'sleeps between attempts, never after the final exhausted one');
  for (const ms of sleepCalls) assert.ok(ms > 0, `every wait must be a positive duration, got ${ms}`);
  for (let i = 1; i < sleepCalls.length; i++) {
    assert.ok(sleepCalls[i] > sleepCalls[i - 1], `wait must increase across attempts: ${sleepCalls}`);
  }
});

test('writeState bootstraps a branch that does not exist yet: the first commit has no parent, and a single push both creates and populates the branch', () => {
  const commitTreeCalls = [];
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), throws: "couldn't find remote ref health-state" },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), throws: 'unknown revision or path not in the working tree' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'hash-object'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'mktree'), returns: 'tree-sha-1\n' },
    {
      match: (cmd, args) => cmd === 'git' && matchArgs(args, 'commit-tree'),
      returns: (cmd, args) => { commitTreeCalls.push(args); return 'commit-sha-1\n'; },
    },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'push'), returns: '' },
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(commitTreeCalls.length, 1, 'a brand-new branch is created in exactly one attempt, one commit');
  assert.ok(!commitTreeCalls[0].includes('-p'), 'the very first commit on a brand-new branch must have no parent (-p omitted)');
});

test('writeState never throws, even when every attempt fails on a from-scratch (never-existing) branch', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), throws: "couldn't find remote ref health-state" },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), throws: 'unknown revision or path not in the working tree' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), throws: 'unknown revision or path not in the working tree' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'hash-object'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'mktree'), returns: 'tree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'commit-tree'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'push'), throws: 'fatal: could not read Username for https://github.com: terminal prompts disabled' },
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  let result;
  assert.doesNotThrow(() => {
    result = ds.writeState('/repo', (current) => current);
  }, 'writeState must never throw, even when every attempt fails on a brand-new branch');
  assert.strictEqual(result.ok, false);
  assert.ok(result.error, 'must report why it gave up after exhausting CAS retries');
});

test('writeState fetches exactly once per CAS-loop attempt on a clean success: the ambiguity-check re-fetch only fires after a push failure', () => {
  let fetchCount = 0;
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'commit-sha-1\ntree-sha-1\n' },
    {
      match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'),
      returns: () => {
        fetchCount += 1;
        if (fetchCount > 1) throw new Error('a second fetch happened on a clean, single-attempt success — the ambiguity-check re-fetch must only run after a push failure');
        return '';
      },
    },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show') && matchArgs(args, 'cursors.json'), returns: JSON.stringify({ '.': { lastSweptMs: 5 } }) },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show') && matchArgs(args, 'retry-queue.json'), returns: '[]' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show') && matchArgs(args, 'runs.json'), returns: '[]' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show') && matchArgs(args, 'remembered.json'), returns: '{}' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'ls-tree'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'hash-object'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'mktree'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'commit-tree'), returns: 'commit-sha-2\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'push'), returns: '' },
  ]);
  let seenCurrent = null;
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => {
    seenCurrent = current;
    return { ...current, cursors: { ...current.cursors, updated: true } };
  });
  assert.deepStrictEqual(result, { ok: true });
  assert.deepStrictEqual(seenCurrent.cursors, { '.': { lastSweptMs: 5 } }, 'mutator must see state read from the already-fetched branch tip, not a degraded-empty fallback');
  assert.strictEqual(fetchCount, 1, 'exactly one fetch on a clean, single-attempt success — there is no separate ensureBranch pre-check to add a second one anymore');
});

test('writeState resolves the parent commit sha and base tree sha from a SINGLE combined rev-parse call, not two separate subprocess spawns', () => {
  let revParseCallCount = 0;
  const { run } = fakeRunner([
    {
      match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'),
      returns: () => { revParseCallCount += 1; return 'commit-sha-1\ntree-sha-1\n'; },
    },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'ls-tree'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'hash-object'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'mktree'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'commit-tree'), returns: 'commit-sha-2\n' },
    pushRule({ returns: '' }),
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(revParseCallCount, 1, 'the CAS loop must resolve both the parent commit sha AND the base tree sha from one rev-parse call, not two');
});

test('writeState treats a rejected-looking push as success (and does not retry the mutator a second time) when the ref actually already points at the commit we just tried to set — an ambiguous push failure where the update landed server-side but the local process never saw confirmation', () => {
  let mutatorCalls = 0;
  let pushAttempted = false;
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'commit-sha-1\ntree-sha-1\n' },
    {
      // The ambiguity-check's re-fetch plus its rev-parse must report the NEW
      // commit (commit-sha-2, the one writeCommit built) once the push has
      // been attempted — simulating the real world where the push really did
      // land even though the local git process saw an error.
      match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'),
      returns: () => (pushAttempted ? 'commit-sha-2\n' : 'commit-sha-1\n'),
    },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'ls-tree'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'hash-object'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'mktree'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'commit-tree'), returns: 'commit-sha-2\n' },
    pushRule({
      returns: () => {
        pushAttempted = true;
        throw new Error('network drop after origin applied the push');
      },
    }),
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => {
    mutatorCalls += 1;
    return { ...current, retryQueue: [] };
  });
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(mutatorCalls, 1, 'mutator must not be re-invoked once the push is confirmed to have actually landed — a second invocation would double-apply a non-idempotent mutator like enqueueRetry\'s attempts++');
});

test('writeState still retries normally on a GENUINE rejection (ref moved to a DIFFERENT commit, not ours) — the ambiguity check must not swallow a real conflict', () => {
  // baseWriteStateRules()'s single-ref rev-parse rule is static (always
  // 'commit-sha-1'), so the ambiguity check's currentCommitSha(root) ===
  // commitSha comparison ('commit-sha-2' !== 'commit-sha-1') correctly falls
  // through to a real retry, proving the fix doesn't change behavior for a
  // genuine conflict.
  let pushAttempts = 0;
  const { run } = fakeRunner([
    ...baseWriteStateRules(),
    pushRule({
      returns: () => {
        pushAttempts += 1;
        if (pushAttempts === 1) throw new Error('! [rejected] health-state -> health-state (non-fast-forward)');
        return '';
      },
    }),
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => ({ ...current, cursors: { '.': { lastSweptMs: 2 } } }));
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(pushAttempts, 2, 'a genuine rejection must still retry the whole read-modify-write cycle');
});

test('writeState includes a remembered.json blob only for a skill that opts in', () => {
  const { run, calls } = fakeRunner([
    ...baseWriteStateRules(),
    pushRule({ returns: '' }),
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  const skillTreeCall = calls.filter((c) => c.cmd === 'git' && c.args.includes('mktree'))[0];
  assert.deepStrictEqual(mktreeEntryNames(skillTreeCall).sort(), ['cursors.json', 'remembered.json', 'retry-queue.json', 'runs.json']);
});

test('writeState never includes a remembered.json blob for a skill that does not opt in', () => {
  const { run, calls } = fakeRunner([
    ...baseWriteStateRules(),
    pushRule({ returns: '' }),
  ]);
  const ds = createDurableState('harness-health', { run, sleep: () => {} });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  const skillTreeCall = calls.filter((c) => c.cmd === 'git' && c.args.includes('mktree'))[0];
  assert.deepStrictEqual(mktreeEntryNames(skillTreeCall).sort(), ['cursors.json', 'retry-queue.json', 'runs.json']);
});

test('writeState preserves an existing file in the skill subtree that this write does not touch (the git-native analog of the old base_tree partial-update guarantee)', () => {
  const { run, calls } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'commit-sha-1\ntree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    // Root tree already has an entry for this skill; its subtree already has
    // a remembered.json this write does NOT own (includeRemembered:false
    // below) — it must survive untouched in the rebuilt subtree.
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'ls-tree') && matchArgs(args, 'tree-sha-1'), returns: '040000 tree existing-skill-tree-sha\tharness-health\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'ls-tree') && matchArgs(args, 'existing-skill-tree-sha'), returns: '100644 blob stale-remembered-sha\tremembered.json\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'hash-object'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'mktree'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'commit-tree'), returns: 'commit-sha-2\n' },
    pushRule({ returns: '' }),
  ]);
  const ds = createDurableState('harness-health', { run, sleep: () => {} }); // includeRemembered NOT set — this write never owns remembered.json
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  const skillTreeCall = calls.filter((c) => c.cmd === 'git' && c.args.includes('mktree'))[0];
  const entries = skillTreeCall.opts.input.split('\n').filter(Boolean).map((line) => {
    const [meta, name] = line.split('\t');
    const [mode, type, sha] = meta.split(' ');
    return { name, mode, type, sha };
  });
  const remembered = entries.find((e) => e.name === 'remembered.json');
  assert.ok(remembered, 'the pre-existing remembered.json must survive in the rebuilt subtree');
  assert.strictEqual(remembered.sha, 'stale-remembered-sha', 'its sha must be untouched — this write never read or wrote its content');
  assert.deepStrictEqual(entries.map((e) => e.name).sort(), ['cursors.json', 'remembered.json', 'retry-queue.json', 'runs.json']);
});

// --- includeDeclined: durable persistence for the 'declined' dismissal mark
// (mirrors includeRemembered's opt-in-flag pattern above) ---

test('readState omits the declined key entirely for a skill that does not opt in (includeDeclined defaults to false)', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
  ]);
  const ds = createDurableState('harness-health', { run, sleep: () => {} });
  const state = ds.readState('/repo');
  assert.ok(!('declined' in state), 'a skill that never opts in must never see a declined key at all');
});

test('readState parses declined.json via git show for a skill that opts in, defaulting to {} when missing', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'declined.json'), returns: JSON.stringify({ 'hh-abc123': { lastSeenMs: 1 } }) },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
  ]);
  const ds = createDurableState('harness-health', { run, sleep: () => {}, includeDeclined: true });
  const state = ds.readState('/repo');
  assert.deepStrictEqual(state.declined, { 'hh-abc123': { lastSeenMs: 1 } });
});

test('readState degrades declined to {} (not thrown/missing) when the branch does not exist yet, for a skill that opts in', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), throws: "couldn't find remote ref health-state" },
  ]);
  const ds = createDurableState('harness-health', { run, sleep: () => {}, includeDeclined: true });
  const state = ds.readState('/repo');
  assert.deepStrictEqual(state, { cursors: {}, declined: {}, retryQueue: [], runs: [] });
});

test('writeState includes a declined.json blob only for a skill that opts in', () => {
  const { run, calls } = fakeRunner([
    ...baseWriteStateRules(),
    pushRule({ returns: '' }),
  ]);
  const ds = createDurableState('harness-health', { run, sleep: () => {}, includeDeclined: true });
  const result = ds.writeState('/repo', (current) => ({ ...current, declined: { ...(current.declined || {}), 'hh-abc123': { lastSeenMs: 1 } } }));
  assert.deepStrictEqual(result, { ok: true });
  const skillTreeCall = calls.filter((c) => c.cmd === 'git' && c.args.includes('mktree'))[0];
  assert.deepStrictEqual(mktreeEntryNames(skillTreeCall).sort(), ['cursors.json', 'declined.json', 'retry-queue.json', 'runs.json']);
});

test('writeState never includes a declined.json blob for a skill that does not opt in', () => {
  const { run, calls } = fakeRunner([
    ...baseWriteStateRules(),
    pushRule({ returns: '' }),
  ]);
  const ds = createDurableState('journey-health', { run, sleep: () => {} });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  const skillTreeCall = calls.filter((c) => c.cmd === 'git' && c.args.includes('mktree'))[0];
  assert.deepStrictEqual(mktreeEntryNames(skillTreeCall).sort(), ['cursors.json', 'retry-queue.json', 'runs.json']);
});
```

- [ ] **Step 3: Run the durable-state.js unit suite alone**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path" && node --test bin/lib/health-core/tests/durable-state.test.js`
Expected: all tests pass, 0 failures. If a test fails, check whether it's a mocked-call-not-matched error (`fakeRunner: no rule matched ...`) — this means the real code called a git command in an order/shape the test's rule list didn't anticipate; compare against the exact call sequence in `writeState`/`buildRootTree` above.

- [ ] **Step 4: Run the full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path" && npm test`
Expected: PASS, same total count as baseline (other files that import `durable-state.js` — `cache.js` files, the 4 CLIs, `retry-cli.js`, `mcp-pending.js`, `retry-durable-write.js` — still reference the OLD shape in places until Task 2; they must still work because `writeState`'s public contract (`{ok:true}` / `{ok:false,error}`) is a strict subset of what they already handle — the `needsMcpWrite` branches in those files simply become permanently-false dead code until Task 2 removes them. If anything NEW fails here (not already failing before this task), investigate before proceeding — do not carry a regression into Task 2.

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path"
git add bin/lib/health-core/durable-state.js bin/lib/health-core/tests/durable-state.test.js
git commit -m "$(cat <<'EOF'
Rewrite durable-state.js writeState() to plain git plumbing (#63)

Replaces the gh-api blob/tree/commit/ref calls with git hash-object/
ls-tree/mktree/commit-tree/push, proven to work in cloud Routine
sandboxes without gh CLI or MCP dependency. A single non-force push
now both creates and fast-forward-updates the branch, so the separate
ensureBranch bootstrap step is gone -- the first write's own commit
(parent=null) is the bootstrap. hasGh/needsMcpWrite removed from this
module's own API; downstream MCP-fallback callers still compile (they
just never see needsMcpWrite=true anymore) until the next task deletes
them.
EOF
)"
```

---

## Task 2: Delete the MCP-fallback layer and its call sites in the 4 health CLIs

**Files:**
- Delete: `bin/lib/health-core/mcp-pending.js`
- Delete: `bin/lib/health-core/tests/mcp-pending-signal.test.js`
- Delete: `bin/lib/health-core/retry-durable-write.js`
- Modify: `bin/lib/health-core/retry-cli.js`
- Modify: `bin/lib/health-core/tests/retry-cli.test.js`
- Modify: `bin/code-health.js`
- Modify: `bin/harness-health.js`
- Modify: `bin/journey-health.js`
- Modify: `bin/docs-health.js`

**Interfaces:**
- Consumes: Task 1's `writeState` (never returns `needsMcpWrite` anymore).
- Produces: none new — this task only removes dead code and its tests.

- [ ] **Step 1: Delete the two MCP-fallback modules and their dedicated test files**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path"
git rm bin/lib/health-core/mcp-pending.js bin/lib/health-core/tests/mcp-pending-signal.test.js bin/lib/health-core/retry-durable-write.js
```

- [ ] **Step 2: Clean up `bin/lib/health-core/retry-cli.js`**

Remove the now-dead `needsMcpWrite` import and branch. Change:

```js
const { enqueueRetry, dequeueRetry, shouldEscalate, ESCALATE_AFTER_ATTEMPTS } = require('./durable-state');
const { emitPendingWrite } = require('./mcp-pending');
```

to:

```js
const { enqueueRetry, dequeueRetry, shouldEscalate, ESCALATE_AFTER_ATTEMPTS } = require('./durable-state');
```

And remove this whole block from `update()`:

```js
    if (result.needsMcpWrite) {
      emitPendingWrite(result);
      // Same reasoning as the !result.ok branch below: `escalated` was computed
      // against a mutator attempt that has not persisted anywhere yet, so
      // reporting it as a real durable 3rd-strike crossing would be a lie.
      // Print the empty result rather than nothing at all — stdout is this
      // command's normal channel and the caller redirects it into a file it
      // then parses as JSON, so an empty stdout is a parse error, not a
      // no-escalations signal. (Carrying `escalated` through a pending write
      // correctly is a known, separate gap, not closed here.)
      process.stdout.write('[]\n');
      return;
    }
    if (!result.ok) {
```

replacing it with just:

```js
    if (!result.ok) {
```

(the `if (!result.ok) { ... }` block that follows is otherwise unchanged — only the `needsMcpWrite` branch above it is deleted).

- [ ] **Step 3: Clean up `bin/lib/health-core/tests/retry-cli.test.js`**

Remove the import: change

```js
const { makeRetryQueueCommands } = require('../retry-cli');
const { PENDING_WRITE_PREFIX } = require('../mcp-pending');
```

to:

```js
const { makeRetryQueueCommands } = require('../retry-cli');
```

Remove the now-unused `fakeDurableStateNeedingMcpWrite` helper (the whole function, including its preceding comment):

```js
// Simulates writeDurableState finding no `gh` on PATH and handing the write
// back for the calling skill to finish through GitHub MCP tools — the mutator
// still runs (so `escalated` is computed), but nothing is persisted.
function fakeDurableStateNeedingMcpWrite(initial) {
  let state = { retryQueue: [], ...initial };
  return {
    readDurableState: () => state,
    writeDurableState: (root, mutatorFn) => {
      mutatorFn(state); // runs, result discarded — same shape as an exhausted write
      return {
        ok: false,
        needsMcpWrite: true,
        branch: 'health-state',
        files: [{ path: 'code-health/retry-queue.json', content: '[]' }],
      };
    },
  };
}
```

Remove the test that exercises it (including its preceding regression comment):

```js
// REGRESSION: the pending-MCP-write signal used to be printed to stdout and
// then returned early, so the calling skill's redirected stdout file held the
// signal JSON instead of the escalated array it parses — and every other
// command in the family had the same bug on the same stream. stdout now
// always carries this command's normal output; the signal moved to a prefixed
// stderr line.
test('update prints [] to stdout and signals the pending write on stderr when gh is unavailable', () => {
  const ds = fakeDurableStateNeedingMcpWrite({
    retryQueue: [
      { fingerprint: 'stuck', payload: { title: 'Stuck' }, firstFailedAt: 'x', attempts: 2, lastError: 'timeout' },
    ],
  });
  const { update } = makeRetryQueueCommands(ds);
  const resultsPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'retry-cli-')), 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify([
    { fingerprint: 'stuck', payload: { title: 'Stuck' }, ok: false, error: 'still failing' },
  ]));

  let stderrOut = '';
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrOut += chunk; return true; };
  let out;
  try {
    out = captureStdout(() => update({ root: '/repo', _: ['update', resultsPath] }));
  } finally {
    process.stderr.write = originalStderrWrite;
  }

  assert.deepStrictEqual(
    JSON.parse(out), [],
    'stdout must stay a parseable escalated array — [] here, since the escalation was never persisted',
  );
  assert.ok(
    !out.includes('needsMcpWrite') && !out.includes(PENDING_WRITE_PREFIX),
    `the pending-write signal must never reach stdout; got: ${out}`,
  );
  const line = stderrOut.split('\n').find((l) => l.startsWith(`${PENDING_WRITE_PREFIX}: `));
  assert.ok(line, `expected a ${PENDING_WRITE_PREFIX} line on stderr; got: ${stderrOut}`);
  const signal = JSON.parse(line.slice(PENDING_WRITE_PREFIX.length + 2));
  assert.strictEqual(signal.branch, 'health-state');
  assert.ok(Array.isArray(signal.files) && signal.files.length > 0);
});
```

Every other test in this file (`drain prints...`, `update dequeues...`, `update reports each escalated fingerprint...`, `update prints [] AND sets a failing exit code...`, `update skips a malformed...`, `update reports an escalated fingerprint only on the firing...`, `update prints [] when nothing crosses...`) is unrelated to the MCP path and stays exactly as-is.

- [ ] **Step 4: Clean up `bin/code-health.js`**

Remove the two now-dead imports (lines 20-21):

```js
const { emitPendingWrite, emitRetryInput } = require('./lib/health-core/mcp-pending');
const { makeCmdRetryDurableWrite } = require('./lib/health-core/retry-durable-write');
```

Remove the `cmdRetryDurableWrite` construction:

```js
const cmdRetryDurableWrite = makeCmdRetryDurableWrite({
  writeDurableState, buildValidateFindingsUpdate, toolName: TOOL_NAME,
});
```

In `cmdValidateFindings`, change:

```js
      const result = writeDurableState(root, (current) => buildValidateFindingsUpdate(current, mutatorInput));
      if (result.needsMcpWrite) {
        emitPendingWrite(result);
        emitRetryInput(mutatorInput);
      } else if (!result.ok) {
```

to:

```js
      const result = writeDurableState(root, (current) => buildValidateFindingsUpdate(current, mutatorInput));
      if (!result.ok) {
```

(the body of that `if` block — the `process.stderr.write('[code-health] validate-findings: health-state persistence failed after retries...')` line — is unchanged, just re-indented under the simplified condition if your editor auto-reindents; functionally identical either way).

Remove the dispatch line in `main()`:

```js
  if (cmd === 'retry-durable-write') return cmdRetryDurableWrite(args);
```

Update the usage/help text (drop the trailing `, retry-durable-write <retry-input.json>`):

```js
  process.stderr.write(
    'usage: code-health.js <command> [options]\n' +
    'commands: validate-findings [--slice <id>], classify, next-slice, status, churn-report, pull-issues, ' +
    'retry-queue drain, retry-queue update <results.json>, retry-durable-write <retry-input.json>\n',
  );
```

becomes:

```js
  process.stderr.write(
    'usage: code-health.js <command> [options]\n' +
    'commands: validate-findings [--slice <id>], classify, next-slice, status, churn-report, pull-issues, ' +
    'retry-queue drain, retry-queue update <results.json>\n',
  );
```

- [ ] **Step 5: Apply the identical cleanup to `bin/harness-health.js`, `bin/journey-health.js`, `bin/docs-health.js`**

Each of these 3 files has the exact same shape as `code-health.js` above, at these locations (grep to confirm the current line numbers haven't shifted before editing, since Step 4 may have already changed relative context — these are independent files, unaffected by code-health.js's edits):

- `harness-health.js`: import block ~line 13-14, `cmdRetryDurableWrite` construction ~line 27, `needsMcpWrite` branch ~line 252-254, dispatch line ~line 272, help text ~line 288.
- `journey-health.js`: import block ~line 13-14, construction ~line 26, branch ~line 223-225, dispatch line ~line 261, help text ~line 279.
- `docs-health.js`: import block ~line 12-13, construction ~line 26, branch ~line 223-225, dispatch line ~line 317, help text ~line 331.

For each file, apply the same 4 edits as `code-health.js` Step 4:
1. Delete the `emitPendingWrite`/`emitRetryInput` and `makeCmdRetryDurableWrite` import lines.
2. Delete the `cmdRetryDurableWrite = makeCmdRetryDurableWrite({...})` construction.
3. In the command that calls `writeDurableState` for its main persistence step, replace `if (result.needsMcpWrite) { emitPendingWrite(result); emitRetryInput(mutatorInput); } else if (!result.ok) {` with `if (!result.ok) {`.
4. Delete the `if (cmd === 'retry-durable-write') return cmdRetryDurableWrite(args);` dispatch line, and drop `, retry-durable-write <retry-input.json>` from that file's own usage/help text string.

Verify each file with:
```bash
grep -n "needsMcpWrite\|mcp-pending\|retry-durable-write\|emitPendingWrite\|emitRetryInput" bin/harness-health.js bin/journey-health.js bin/docs-health.js bin/code-health.js
```
Expected: no output at all (zero matches in any of the 4 files) — confirms every occurrence was found and removed, not just the first one grep happened to show.

- [ ] **Step 6: Run the full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path" && npm test`
Expected: PASS. If any of the 4 CLIs' own existing tests reference `retry-durable-write` as a subcommand or assert on the old help text string, they will now fail — find and fix them by removing the corresponding assertion (searching each CLI's test file for `'retry-durable-write'` first).

- [ ] **Step 7: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path"
git add -A -- bin/lib/health-core/ bin/code-health.js bin/harness-health.js bin/journey-health.js bin/docs-health.js
git status --short
git commit -m "$(cat <<'EOF'
Delete the unexercised MCP-fallback layer for health-state writes (#63)

durable-state.js's writeState() is now git-native-only (previous
task), so mcp-pending.js, retry-durable-write.js, and every
needsMcpWrite branch/retry-durable-write subcommand across the 4
health CLIs and retry-cli.js are dead code -- confirmed unused across
12 live cloud-Routine firings before this fix. Deleted along with
their dedicated tests.
EOF
)"
```

---

## Task 3: Fix code-health's `.` slice recursion bug (#66)

**Files:**
- Modify: `bin/lib/code-health/scope.js`
- Modify: `bin/lib/code-health/tests/scope.test.js`
- Modify: `bin/code-health.js` (thread the new `{ recursive }` option through its 2 hash call sites)

**Interfaces:**
- Consumes: nothing from Tasks 1-2 — fully independent.
- Produces: `sliceRecursive(id)` (new export from `scope.js`) — `true` for every slice except `.`. `sourceFiles`, `readSourceFileData`, `readSourceFileDataCached`, `contentHash` all gain an optional 3rd (or 2nd, for `readSourceFileData`) `opts` / `{ recursive }` parameter, defaulting to `recursive: true` — fully backward compatible with every existing call site that doesn't pass it. `gitChurn` gains a 4th optional `opts` parameter, same default.

- [ ] **Step 1: Add the `recursive` option to `scope.js`'s file-scanning functions**

In `bin/lib/code-health/scope.js`, change:

```js
function sourceFiles(absDir) {
  try {
    const excludeArgs = [];
    for (const dir of SKIP_DIRS) {
      // `*/dir/*` (not `${absDir}/dir/*`) so a skip-directory is excluded
      // wherever it appears in the subtree, not only as a direct child of
      // absDir — find's -path matches against the whole path string, so `*`
      // spans '/' and matches nested occurrences too (e.g. pkg/nested/dir/*).
      excludeArgs.push('-not', '-path', `*/${dir}/*`);
    }
    const raw = execFileSync(
      'find',
      [absDir, '-type', 'f', ...excludeArgs],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
    );
    return raw
      .split('\n')
      .filter(Boolean)
      .filter((f) => SOURCE_EXTS.has(path.extname(f)))
      .sort();
  } catch {
    return [];
  }
}
```

to:

```js
// recursive:false scans only direct file children of absDir (maxdepth 1) —
// used for the '.' slice, which must NOT overlap every subdirectory/
// workspace slice that already covers everything beneath root. See
// docs/superpowers/specs/2026-07-30-durable-state-git-native-write-design.md.
function sourceFiles(absDir, { recursive = true } = {}) {
  try {
    const excludeArgs = [];
    for (const dir of SKIP_DIRS) {
      // `*/dir/*` (not `${absDir}/dir/*`) so a skip-directory is excluded
      // wherever it appears in the subtree, not only as a direct child of
      // absDir — find's -path matches against the whole path string, so `*`
      // spans '/' and matches nested occurrences too (e.g. pkg/nested/dir/*).
      excludeArgs.push('-not', '-path', `*/${dir}/*`);
    }
    const depthArgs = recursive ? [] : ['-maxdepth', '1'];
    const raw = execFileSync(
      'find',
      [absDir, ...depthArgs, '-type', 'f', ...excludeArgs],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
    );
    return raw
      .split('\n')
      .filter(Boolean)
      .filter((f) => SOURCE_EXTS.has(path.extname(f)))
      .sort();
  } catch {
    return [];
  }
}
```

Change:

```js
function readSourceFileData(absDir) {
  const files = sourceFiles(absDir);
  return files.map((file) => {
    try {
      return { file, buffer: fs.readFileSync(file) };
    } catch {
      return { file, buffer: null };
    }
  });
}
```

to:

```js
function readSourceFileData(absDir, opts) {
  const files = sourceFiles(absDir, opts);
  return files.map((file) => {
    try {
      return { file, buffer: fs.readFileSync(file) };
    } catch {
      return { file, buffer: null };
    }
  });
}
```

Change:

```js
function readSourceFileDataCached(absDir, cache) {
  if (!cache) return readSourceFileData(absDir);
  if (cache.has(absDir)) return cache.get(absDir);
  const data = readSourceFileData(absDir);
  cache.set(absDir, data);
  return data;
}
```

to:

```js
function readSourceFileDataCached(absDir, cache, opts) {
  if (!cache) return readSourceFileData(absDir, opts);
  if (cache.has(absDir)) return cache.get(absDir);
  const data = readSourceFileData(absDir, opts);
  cache.set(absDir, data);
  return data;
}
```

Change:

```js
function contentHash(absDir, cache) {
  return hashFromFileData(absDir, readSourceFileDataCached(absDir, cache));
}
```

to:

```js
function contentHash(absDir, cache, opts) {
  return hashFromFileData(absDir, readSourceFileDataCached(absDir, cache, opts));
}
```

- [ ] **Step 2: Add the `recursive` option to `gitChurn`, and the `sliceRecursive` helper**

Change:

```js
function gitChurn(root, relDir, now) {
  try {
    // Full ISO 8601 datetime (with time-of-day and Z/UTC suffix), not a bare
    // YYYY-MM-DD date string — a bare date string is parsed by git as local
    // midnight and then converted to UTC, silently skewing (or, near the
    // epoch, underflowing to pre-epoch and matching zero commits) the
    // boundary in positive-UTC-offset timezones. Identical bug and fix as
    // harness-health/scope.js's domainChurn, journey-health/scope.js, and
    // docs-health/scope.js.
    const since = new Date(now - 30 * 86400000).toISOString();
    const out = execFileSync(
      'git',
      ['-C', root, 'log', '--oneline', `--since=${since}`, '--', relDir === '.' ? '.' : relDir],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}
```

to:

```js
function gitChurn(root, relDir, now, { recursive = true } = {}) {
  try {
    // Full ISO 8601 datetime (with time-of-day and Z/UTC suffix), not a bare
    // YYYY-MM-DD date string — a bare date string is parsed by git as local
    // midnight and then converted to UTC, silently skewing (or, near the
    // epoch, underflowing to pre-epoch and matching zero commits) the
    // boundary in positive-UTC-offset timezones. Identical bug and fix as
    // harness-health/scope.js's domainChurn, journey-health/scope.js, and
    // docs-health/scope.js.
    const since = new Date(now - 30 * 86400000).toISOString();
    let pathArgs;
    if (recursive) {
      pathArgs = [relDir === '.' ? '.' : relDir];
    } else {
      // Non-recursive '.': `git log -- .` always means the whole tree
      // regardless of depth, so instead pass each direct root-level source
      // file as its own pathspec, scoping churn to exactly what the
      // non-recursive content-hash also covers.
      const files = sourceFiles(root, { recursive: false }).map((f) => path.relative(root, f));
      if (files.length === 0) return 0;
      pathArgs = files;
    }
    const out = execFileSync(
      'git',
      ['-C', root, 'log', '--oneline', `--since=${since}`, '--', ...pathArgs],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}
```

Add this new function right after `gitChurn`, and export it:

```js
// Single source of truth for "is this slice's file/churn scan recursive?" —
// used by selectSlice's computeScore below AND by bin/code-health.js's own
// contentHash call sites (cmdNextSlice's budget>1 in-memory cursor-patch
// hash, cmdValidateFindings' durable-persist hash), so all three agree on
// exactly the same predicate instead of each re-deriving `id !== '.'` (and
// risking drift between them).
function sliceRecursive(id) {
  return id !== '.';
}
```

- [ ] **Step 3: Wire `sliceRecursive` into `selectSlice`'s `computeScore`**

Change:

```js
    computeScore: (slice, cursor) => {
      const fileData = readSourceFileDataCached(slice.path, fileDataCache);
      const currentHash = hashFromFileData(slice.path, fileData);
      if (cursor.lastHash && cursor.lastHash === currentHash) return null;
      const sig = signals ? signals[slice.id] || { churn: 0, loc: 0 } : null;
      const churn = sig ? sig.churn : gitChurn(root, slice.id, now);
      const loc = sig ? sig.loc : locFromFileData(fileData);
      return hotspotScore(churn, loc);
    },
```

to:

```js
    computeScore: (slice, cursor) => {
      const recursive = sliceRecursive(slice.id);
      const fileData = readSourceFileDataCached(slice.path, fileDataCache, { recursive });
      const currentHash = hashFromFileData(slice.path, fileData);
      if (cursor.lastHash && cursor.lastHash === currentHash) return null;
      const sig = signals ? signals[slice.id] || { churn: 0, loc: 0 } : null;
      const churn = sig ? sig.churn : gitChurn(root, slice.id, now, { recursive });
      const loc = sig ? sig.loc : locFromFileData(fileData);
      return hotspotScore(churn, loc);
    },
```

- [ ] **Step 4: Export `sliceRecursive`**

Change the module.exports line:

```js
module.exports = { listSlices, contentHash, selectSlice, listWorkspaceSlices, gitChurn };
```

to:

```js
module.exports = { listSlices, contentHash, selectSlice, listWorkspaceSlices, gitChurn, sliceRecursive };
```

- [ ] **Step 5: Thread `sliceRecursive` through `bin/code-health.js`'s 2 hash call sites**

This closes a real gap: without this step, the SAME `.` slice's persisted `lastHash` (written durably by `cmdValidateFindings`, and simulated in-memory by `cmdNextSlice`'s budget-loop) would be computed with the OLD recursive scan while `selectSlice`'s own comparison (Step 3 above) now uses the non-recursive scan — the two would never match, so `.` would look "always changed" forever, defeating the content-hash skip for that slice specifically.

Update the import line:

```js
const { listSlices, contentHash, selectSlice } = require('./lib/code-health/scope');
```

to:

```js
const { listSlices, contentHash, selectSlice, sliceRecursive } = require('./lib/code-health/scope');
```

In `cmdValidateFindings`, change:

```js
      const hashes = sliceId ? { [sliceId]: contentHash(path.resolve(root, sliceId)) } : {};
```

to:

```js
      const hashes = sliceId ? { [sliceId]: contentHash(path.resolve(root, sliceId), null, { recursive: sliceRecursive(sliceId) }) } : {};
```

In `cmdNextSlice`, change:

```js
  const chosen = selectBudget(budget, cursors, (c) => selectSlice(root, c, { now, fileDataCache }), {
    getCursorKey: (slice) => slice.id,
    buildCursorPatch: (_, slice) => ({ lastSweptMs: now, lastHash: contentHash(slice.path, fileDataCache) }),
  });
```

to:

```js
  const chosen = selectBudget(budget, cursors, (c) => selectSlice(root, c, { now, fileDataCache }), {
    getCursorKey: (slice) => slice.id,
    buildCursorPatch: (_, slice) => ({ lastSweptMs: now, lastHash: contentHash(slice.path, fileDataCache, { recursive: sliceRecursive(slice.id) }) }),
  });
```

- [ ] **Step 6: Add new tests to `bin/lib/code-health/tests/scope.test.js`**

Add these tests in the `─── contentHash ───` section, right after the existing `contentHash returns a stable hash for a dir with no source files` test:

```js
test('contentHash with { recursive: false } is unaffected by a change inside a subdirectory', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'const x = 1;\n');
  const before = contentHash(root, null, { recursive: false });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'const x = 2;\n');
  const after = contentHash(root, null, { recursive: false });
  assert.strictEqual(before, after, 'a change inside a subdirectory must not affect the non-recursive "." hash');
});

test('contentHash with { recursive: false } DOES change when a direct root-level file changes', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'root.js'), 'const x = 1;\n');
  const before = contentHash(root, null, { recursive: false });
  fs.writeFileSync(path.join(root, 'root.js'), 'const x = 2;\n');
  const after = contentHash(root, null, { recursive: false });
  assert.notStrictEqual(before, after, 'a change to a direct root-level file must affect the non-recursive "." hash');
});

test('contentHash: a flat repo with no subdirectories hashes identically whether recursive or not', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  fs.writeFileSync(path.join(root, 'b.js'), 'const y = 2;\n');
  assert.strictEqual(contentHash(root), contentHash(root, null, { recursive: false }));
});
```

Add these tests in the `─── gitChurn ───` section, right after the existing two `gitChurn` tests:

```js
test('gitChurn with { recursive: false } does not count a commit that only touches a nested file', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'const x = 1;\n');
  initGitRepo(root);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'nested file only']);
  const churn = gitChurn(root, '.', Date.now(), { recursive: false });
  assert.strictEqual(churn, 0, 'a commit touching only a nested file must not count toward the non-recursive "." churn');
});

test('gitChurn with { recursive: false } counts a commit that touches a direct root-level file', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'root.js'), 'const x = 1;\n');
  initGitRepo(root);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'root-level file']);
  const churn = gitChurn(root, '.', Date.now(), { recursive: false });
  assert.ok(churn >= 1, `expected the root-level commit to be counted, got churn=${churn}`);
});
```

Add this import update at the top of the test file — it already imports `gitChurn`, so no import change is needed there; but add `sliceRecursive` to the destructured require since the next test uses it:

Change:

```js
const { listSlices, contentHash, selectSlice, listWorkspaceSlices, gitChurn } = require('../scope');
```

to:

```js
const { listSlices, contentHash, selectSlice, listWorkspaceSlices, gitChurn, sliceRecursive } = require('../scope');
```

Add this test anywhere in the file (e.g. right after the `sliceRecursive` import, before the `─── listSlices ───` section header):

```js
// ─── sliceRecursive ────────────────────────────────────────────────────────

test('sliceRecursive is false only for the "." slice id', () => {
  assert.strictEqual(sliceRecursive('.'), false);
  assert.strictEqual(sliceRecursive('src'), true);
  assert.strictEqual(sliceRecursive('packages/a'), true);
});
```

- [ ] **Step 7: Run the scope.js unit suite alone**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path" && node --test bin/lib/code-health/tests/scope.test.js`
Expected: all tests pass, 0 failures, including all pre-existing tests (this task only adds an optional 3rd/4th parameter with a default that preserves every existing call site's behavior).

- [ ] **Step 8: Run the full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path" && npm test`
Expected: PASS, same total count as baseline plus the 6 new tests added in Step 6 (1704 + 6 = 1710), plus whatever Tasks 1-2 already added/removed.

- [ ] **Step 9: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path"
git add bin/lib/code-health/scope.js bin/lib/code-health/tests/scope.test.js bin/code-health.js
git commit -m "$(cat <<'EOF'
Fix code-health's '.' slice to scan root-level files only, not the
whole repo recursively (#66)

listSlices always included '.' as a candidate representing the entire
repo root, scanned recursively -- silently double-covering every
subdirectory/workspace slice too, not just on a cold cursor. Sorted
first alphabetically, it was always force-picked as the very first
slice on any never-before-swept repo, making next-slice return the
whole repository (~4,200 files in the reported case) as "one slice."
Redefined to mean direct root-level files only (maxdepth 1) --
disjoint from every other slice, still covers genuinely loose
root-level source files, unaffected for flat repos with no
subdirectories. Threaded the same { recursive: id !== '.' } predicate
through code-health.js's own two hash call sites so a slice's
persisted lastHash and its live comparison always agree.
EOF
)"
```

---

## Task 4: Documentation sweep — remove every MCP-fallback reference for health-state

**Files:**
- Modify: `skills/_shared/health-state.md`
- Modify: `skills/_shared/github-write-transport.md`
- Modify: `skills/code-health/SKILL.md`
- Modify: `skills/harness-health/SKILL.md`
- Modify: `skills/journey-health/SKILL.md`
- Modify: `skills/docs-health/SKILL.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Tasks 1-2's finished code (this task documents the shipped mechanism, so it must come after).
- Produces: nothing consumed by later tasks — purely documentation.

- [ ] **Step 1: Rewrite `skills/_shared/health-state.md`'s "Mechanism" section**

Read the current file first: `cat skills/_shared/health-state.md`. Replace the "Mechanism" section's `writeState` bullet — currently:

```
- **`writeState`** — builds a new commit (blob → tree → commit via the Git Data API,
  `gh api repos/{owner}/{repo}/git/blobs|trees|commits`) on top of the branch's current tip,
  then updates the ref with `force: false`. GitHub's fast-forward-only ref update is the
  compare-and-swap: if another firing moved the branch first, the update is rejected and
  `writeState` retries the whole read-modify-write cycle (bounded at 3 attempts). On
  exhaustion, it returns `{ ok: false, error }` rather than throwing — for cursor/run-history
  bookkeeping, a lost write just means the next firing might redo some rotation work, which is
  safe (GitHub-issue fingerprint dedup during `validate-findings` means a redundant scan
  resolves to `skip`, never a duplicate issue). The retry queue is the one exception:
  `retry-cli.js`'s `drain()` returns the queued payloads as-is, with no existence/fingerprint
  check against GitHub before the calling skill re-attempts `gh issue create` — so if a
  payload's `gh issue create` succeeds but the same firing's end-of-run `writeState` (which
  bundles that dequeue with the cursor/run-history update) then exhausts its retries, the
  un-dequeued entry survives in `retry-queue.json` and the next firing's drain re-files it,
  creating a real duplicate issue rather than a safely-redone no-op.
```

Replace with:

```
- **`writeState`** — builds a new commit entirely from plain git plumbing (`git hash-object`
  for each changed file's blob, `git ls-tree`/`git mktree` to splice those blobs into the
  skill's own subtree and then the branch's root tree, `git commit-tree` on top of the
  branch's current tip), then publishes with a single `git push origin <sha>:refs/heads/
  health-state`. A non-force push is the compare-and-swap: it creates the ref if absent,
  fast-forward-updates it if present, and is rejected if another firing moved the branch
  first — `writeState` retries the whole read-modify-write cycle on rejection (bounded at 3
  attempts). No `gh` CLI, no GitHub MCP tools, no separate bootstrap step — the very first
  write's own commit (no parent) creates the branch. On exhaustion, it returns
  `{ ok: false, error }` rather than throwing — for cursor/run-history bookkeeping, a lost
  write just means the next firing might redo some rotation work, which is safe (GitHub-issue
  fingerprint dedup during `validate-findings` means a redundant scan resolves to `skip`,
  never a duplicate issue). The retry queue is the one exception: `retry-cli.js`'s `drain()`
  returns the queued payloads as-is, with no existence/fingerprint check against GitHub before
  the calling skill re-attempts `gh issue create` — so if a payload's `gh issue create`
  succeeds but the same firing's end-of-run `writeState` (which bundles that dequeue with the
  cursor/run-history update) then exhausts its retries, the un-dequeued entry survives in
  `retry-queue.json` and the next firing's drain re-files it, creating a real duplicate issue
  rather than a safely-redone no-op.
```

- [ ] **Step 2: Delete the entire "MCP write path" section from `skills/_shared/health-state.md`**

Delete everything from the `## MCP write path (no \`gh\` CLI available)` heading through the paragraph ending `...see \`_shared/github-write-transport.md\` for the shared detection check and CRUD mapping this procedure builds on.` (this is the section immediately before `## Retry / dead-letter queue` — delete up to but not including that next heading).

- [ ] **Step 3: Update `skills/_shared/github-write-transport.md`**

Read the current file: `cat skills/_shared/github-write-transport.md`. In its opening paragraph, change:

```
Single source of truth for choosing between `gh` CLI and GitHub MCP tools for a plain
CRUD GitHub write (list-by-label, create, edit/label, comment, close). The two hard
compare-and-set cases (dispatch's claim lock, health-state's cursor writes) don't use this
mapping directly — see `_shared/issue-claims.md` and `_shared/health-state.md` respectively,
both built on the same conditional-write pattern documented at the bottom of this file.
```

to:

```
Single source of truth for choosing between `gh` CLI and GitHub MCP tools for a plain
CRUD GitHub write (list-by-label, create, edit/label, comment, close). Dispatch's claim lock
(the one remaining hard compare-and-set case using this mapping) doesn't use it directly —
see `_shared/issue-claims.md`, built on the conditional-write pattern documented at the
bottom of this file. Health-state's cursor writes (`_shared/health-state.md`) no longer use
this file at all — they're plain Git Data API primitives (blob/tree/commit/ref) with no
GitHub-specific semantics, so they use `git` directly (fetch/hash-object/mktree/commit-tree/
push) rather than choosing between `gh` and MCP.
```

- [ ] **Step 4: Remove the `HEALTH_STATE_MCP_PENDING_WRITE` snippet from all 4 SKILL.md files**

Each of `skills/code-health/SKILL.md`, `skills/harness-health/SKILL.md`, `skills/journey-health/SKILL.md`, `skills/docs-health/SKILL.md` has this same 2-line snippet at 2 separate locations each (confirm with `grep -n "HEALTH_STATE_MCP_PENDING_WRITE" skills/{code-health,harness-health,journey-health,docs-health}/SKILL.md` before editing — do not stop after finding the first occurrence in each file):

```
If the command writes a `HEALTH_STATE_MCP_PENDING_WRITE: {...}` line to **stderr**, the durable
health-state write is still pending — follow `_shared/health-state.md`'s "MCP write path"
```

This snippet continues onto further lines describing the retry procedure — read the full paragraph at each occurrence (it varies slightly per skill/call-site) and delete the whole paragraph, since the "MCP write path" section it points to no longer exists (deleted in Step 2). Do this for **both** occurrences in **each** of the 4 files (8 deletions total).

Verify with:
```bash
grep -rn "HEALTH_STATE_MCP_PENDING_WRITE\|MCP write path" skills/
```
Expected: no output at all.

- [ ] **Step 5: Trim `CLAUDE.md`'s Structure table**

In the `skills/_shared/*.md` row of the Structure table, change:

```
github-write-transport (canonical gh-CLI-vs-GitHub-MCP capability detection check + CRUD tool mapping, underlying both issue-claims' claim lock and health-state's cursor writer)
```

to:

```
github-write-transport (canonical gh-CLI-vs-GitHub-MCP capability detection check + CRUD tool mapping, underlying issue-claims' claim lock)
```

(this is a substring inside one long paragraph-style table cell — use a targeted find-and-replace on that exact phrase, not a line-based edit).

- [ ] **Step 6: Run the full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path" && npm test`
Expected: PASS — this task touches only markdown, so the count should be identical to Task 3's final count. (Some repos in this codebase's test suite lint SKILL.md structure — e.g. `bin/lib/health-core/tests/skill-md-house-checks.js` — so a genuine PASS here, not just "no crash," confirms the doc edits didn't break any structural convention that file checks.)

- [ ] **Step 7: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path"
git add skills/_shared/health-state.md skills/_shared/github-write-transport.md skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md skills/docs-health/SKILL.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Remove MCP-fallback documentation for health-state writes (#63)

health-state.md's write path now describes plain git plumbing instead
of the GitHub Data API, and its ~110-line MCP write path retry
procedure is gone along with the code it documented (previous two
tasks). github-write-transport.md and the 4 health skills' SKILL.md
files no longer reference a mechanism that no longer exists.
EOF
)"
```

---

## Task 5: Version bump, changelog, and final verification

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1-4, complete.
- Produces: nothing — terminal task.

- [ ] **Step 1: Check for a concurrent version bump before bumping**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path"
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
grep '"version"' .claude-plugin/plugin.json
```

If `origin/main`'s `plugin.json` has moved to a version higher than `6.22.1` since this worktree branched, use the next free patch version above whatever it now shows instead of `6.22.2` below.

- [ ] **Step 2: Bump the version**

In `.claude-plugin/plugin.json`, change:

```json
  "version": "6.22.1",
```

to:

```json
  "version": "6.22.2",
```

(patch bump — this is a bug fix, per this repo's Versioning convention: "Bump minor version for feature additions, patch for fixes.")

- [ ] **Step 3: Add a CHANGELOG.md entry**

Add a new entry at the top of `CHANGELOG.md`, right after the `# Changelog` heading and before the existing `## v6.22.1` entry:

```markdown
## v6.22.2 — durable-state writes are git-native; code-health's `.` slice no longer sweeps the whole repo

`bin/lib/health-core/durable-state.js`'s `writeState()` shelled out to `gh api` for every
`health-state` branch write; v6.21.0's documented GitHub-MCP fallback for cloud Routine
sandboxes (no `gh` CLI there) was never actually exercised across 12 live firings — one skill
instead improvised an undocumented `git push` workaround that worked cleanly, proving plain git
push credentials are available in that exact sandbox. `writeState` now builds every commit from
plain git plumbing (`hash-object`/`ls-tree`/`mktree`/`commit-tree`) and publishes with a single
`git push`, which both creates and fast-forward-updates the branch — no `gh` CLI, no MCP
dependency, no separate bootstrap step, working identically local or in a cloud sandbox. The
entire now-unexercised MCP-fallback layer (`mcp-pending.js`, `retry-durable-write.js`, and every
`needsMcpWrite` branch across the 4 health CLIs) is deleted.

Separately, `code-health`'s `next-slice` rotation always included `.` as a candidate
representing the *entire* repo root scanned recursively — overlapping every subdirectory and
workspace slice, and, since it always sorted first, always force-picked as the very first slice
on any never-before-swept repo (returning ~4,200 files as "one slice" in the reported case). `.`
now scans direct root-level files only.
```

- [ ] **Step 4: Run the full suite one final time**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path" && npm test 2>&1 | tail -20`
Expected: `# fail 0`, matching or exceeding the baseline count (1704 + 6 new scope.test.js tests, minus whatever count the deleted `mcp-pending-signal.test.js` and MCP-related `retry-cli.test.js`/`durable-state.test.js` tests removed — the exact final number doesn't matter; `# fail 0` does).

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-durable-state-write-path"
git add .claude-plugin/plugin.json CHANGELOG.md
git commit -m "Bump to 6.22.2 for the durable-state git-native write path fix (#63, #66)"
```

- [ ] **Step 6: Report final status**

Run `git log --oneline worktree-fix-durable-state-write-path -8` and `git status --short` to confirm a clean working tree with 5-6 commits on the branch, ready for `/superpowers:finishing-a-development-branch`.
