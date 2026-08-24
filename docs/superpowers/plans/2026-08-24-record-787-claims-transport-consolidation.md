# Claims-Registry Transport Consolidation (record #787) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the claims-registry blob-lock's three overlapping write-path implementations into one core, make that core perform claim/release via git compare-and-swap (`force-with-lease`) with the existing contents-API path retained as the gh-absent/MCP fallback, and migrate every real consumer and prose citation onto the surviving surface.

**Architecture:** `bin/lib/issues/claim-store.js` becomes the one place that writes `claims/issue-{n}.json` on `claims-registry`. It gains a git-CAS write/read path (new module `bin/lib/issues/claims-git-cas.js`) tried first, falling back to its existing contents-API path when `git push` fails for a non-contested reason (auth/remote absent) or when explicitly forced off. `bin/lib/issues/claim-engine.js` and `bin/claims.js` — confirmed to have zero real invocation sites (only a stale doc mention) — are deleted outright. `bin/lib/release-claim/release.js` keeps its public API but re-points its I/O at `claim-store.js`'s primitives instead of its own separate `gh api` calls. The two real CLIs, `bin/claim-targets.js` (claim) and `bin/release-claim.js` (release), are untouched at the CLI-argument/exit-code layer — the deliverable's "two thin wrappers over the one core" shape — since both already only reach the registry through their respective lib modules.

**Tech Stack:** Node.js (`child_process.execFileSync`), `node --test`, `gh` CLI, `git` CLI (plumbing: `fetch`, `rev-parse`, `show`, `read-tree`, `update-index`, `write-tree`, `commit-tree`, `push --force-with-lease`).

**Spec:** `.claude-tweaks/pipelines/2026-08-24T065021-record-787/work/787-spec.md` (GitHub issue #787, git-CAS amendment supersedes the original consolidation target).

## Global Constraints

- Same blob format, same branch (`claims-registry`), same one-file arbiter — `_shared/issue-claims.md`'s one-keyspace rule (unchanged).
- `bin/claim-targets.js`'s exit-code contract (0/2/3/4) must hold **verbatim** — `tests/flow-claim-preflight.test.js` pins this; do not touch that file's argument parsing or exit-code mapping.
- Every module under `bin/` that performs a `gh api --method PUT .../contents/claims/...` call must be reduced to exactly one (`claim-store.js`) by the end of this plan (AC1).
- Secondary-rate-limit responses (403 + "secondary rate limit" text, or a `Retry-After` header) must classify as a distinct outcome from "contested" on both transports (git push rejection and contents-API PUT rejection).
- Injectable-runner convention throughout (`gh-api-module-pattern` skill): every network/process call goes through a `deps`-supplied function; tests never touch real `gh`/`git`.
- `npm test` must stay green throughout — run the full suite (not just the touched files) at the final task.

---

### Task 1: Git compare-and-swap core (new module)

**Files:**
- Create: `plugin/bin/lib/issues/claims-git-cas.js`
- Test: `tests/bin-lib/issues/claims-git-cas.test.js`

**Interfaces:**
- Consumes: `claimFilePath(issueNumber)` and `CLAIMS_BRANCH` from `plugin/bin/lib/issues/claims.js` (already exist, unchanged).
- Produces (consumed by Task 3): `readClaimBlobGit({ issueNumber, remote, branch, runner }) -> { content: string|null, tipSha: string, absent: boolean, failure: null|'transport-failure' }`, `writeClaimBlobGit({ issueNumber, content, message, expectedTipSha, remote, branch, runner }) -> { ok: boolean, conflict?: true, secondaryRateLimit?: true, failure: null|'transport-failure' }`, `classifyGitError(err) -> { kind: 'missing-path'|'contested'|'secondary-rate-limit'|'transport-failure' }`.

- [ ] **Step 1: Write the failing tests for the pure classifier**

```javascript
// tests/bin-lib/issues/claims-git-cas.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyGitError, readClaimBlobGit, writeClaimBlobGit, CLAIMS_BRANCH,
} = require('../../../plugin/bin/lib/issues/claims-git-cas');

test('classifyGitError: missing path in a git show', () => {
  const err = new Error("fatal: path 'claims/issue-42.json' does not exist in '1234abcd'");
  assert.deepEqual(classifyGitError(err), { kind: 'missing-path' });
});

test('classifyGitError: force-with-lease rejection is contested', () => {
  const err = new Error('! [rejected]        HEAD -> claims-registry (stale info)');
  err.stderr = '! [rejected]        HEAD -> claims-registry (stale info)\nerror: failed to push some refs';
  assert.deepEqual(classifyGitError(err), { kind: 'contested' });
});

test('classifyGitError: fetch-first rejection is contested', () => {
  const err = new Error('fatal: push failed');
  err.stderr = '! [rejected]        claims-registry -> claims-registry (fetch first)';
  assert.deepEqual(classifyGitError(err), { kind: 'contested' });
});

test('classifyGitError: secondary rate limit is distinct from contested', () => {
  const err = new Error('remote: You have exceeded a secondary rate limit');
  err.stderr = 'remote: You have exceeded a secondary rate limit. Please wait a few minutes before you try again.';
  assert.deepEqual(classifyGitError(err), { kind: 'secondary-rate-limit' });
});

test('classifyGitError: Retry-After signature also reads as secondary rate limit', () => {
  const err = new Error('remote: Retry-After: 60');
  err.stderr = 'remote: Retry-After: 60\nremote: You have triggered an abuse detection mechanism.';
  assert.deepEqual(classifyGitError(err), { kind: 'secondary-rate-limit' });
});

test('classifyGitError: everything else is a plain transport failure', () => {
  const err = new Error('fatal: unable to access: Could not resolve host');
  assert.deepEqual(classifyGitError(err), { kind: 'transport-failure' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/issues/claims-git-cas.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/lib/issues/claims-git-cas'`

- [ ] **Step 3: Implement the pure classifier**

```javascript
// plugin/bin/lib/issues/claims-git-cas.js (part 1 — classifier + constants)
'use strict';

const { claimFilePath, CLAIMS_BRANCH } = require('./claims');

function errText(err) {
  const parts = [err && err.message, err && err.stderr, err && err.stdout].filter(Boolean).map(String);
  return parts.length ? parts.join(' ') : String(err);
}

// One classification for every git-CAS failure this module can hit — the
// git-side counterpart to claim-store.js's classifyGhApiError. `missing-path`
// is a normal 'absent' outcome (git show against a tree that doesn't have
// this file yet), never an error; `contested` is a lost force-with-lease
// race — someone else's commit landed on `claims-registry` between our
// fetch and this push; `secondary-rate-limit` must never be folded into
// `contested` (record-697's incident read exactly that way before
// diagnosis) — checked before the generic rejection match since GitHub's
// abuse-detection rejection is also a non-fast-forward-shaped push failure.
function classifyGitError(err) {
  const text = errText(err);
  if (/secondary rate limit|abuse detection mechanism|Retry-After/i.test(text)) {
    return { kind: 'secondary-rate-limit' };
  }
  if (/does not exist in|exists on disk, but not in/.test(text)) {
    return { kind: 'missing-path' };
  }
  if (/\[rejected\]|stale info|fetch first|non-fast-forward/i.test(text)) {
    return { kind: 'contested' };
  }
  return { kind: 'transport-failure' };
}

module.exports = { classifyGitError, CLAIMS_BRANCH, errText };
```

- [ ] **Step 4: Run the tests to verify the classifier passes**

Run: `node --test tests/bin-lib/issues/claims-git-cas.test.js`
Expected: the 6 classifier tests PASS; `readClaimBlobGit`/`writeClaimBlobGit` tests (added next step) still fail — module doesn't export them yet.

- [ ] **Step 5: Write the failing tests for read/write against a real local git remote**

Append to the same test file — these spin up a real `git init --bare` temp directory as the fake "origin" (established pattern: `tests/reconcile.test.js`, `tests/hooks-run-arg-anchoring.test.js`) so the plumbing sequence (`fetch`/`show`/`read-tree`/`update-index`/`write-tree`/`commit-tree`/`push --force-with-lease`) is proven against real git, not just a mocked call sequence:

```javascript
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function realRunner(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', cwd: opts.cwd, input: opts.input, env: opts.env });
}

function makeBareOriginAndClone() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claims-git-cas-'));
  const originDir = path.join(root, 'origin.git');
  const cloneDir = path.join(root, 'clone');
  execFileSync('git', ['init', '--bare', '-q', '-b', 'main', originDir]);
  execFileSync('git', ['clone', '-q', originDir, cloneDir]);
  execFileSync('git', ['-C', cloneDir, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', cloneDir, 'config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(cloneDir, 'README.md'), 'seed\n');
  execFileSync('git', ['-C', cloneDir, 'add', 'README.md']);
  execFileSync('git', ['-C', cloneDir, 'commit', '-q', '-m', 'seed']);
  execFileSync('git', ['-C', cloneDir, 'push', '-q', 'origin', 'main']);
  execFileSync('git', ['-C', cloneDir, 'push', '-q', 'origin', `main:${CLAIMS_BRANCH}`]);
  return { root, cloneDir };
}

test('readClaimBlobGit: absent path on a fresh registry branch', () => {
  const { cloneDir } = makeBareOriginAndClone();
  const runner = (args, opts) => realRunner(args, { ...opts, cwd: cloneDir });
  const result = readClaimBlobGit({ issueNumber: 42, remote: 'origin', runner });
  assert.equal(result.absent, true);
  assert.equal(result.content, null);
  assert.equal(typeof result.tipSha, 'string');
  assert.equal(result.tipSha.length, 40);
});

test('writeClaimBlobGit then readClaimBlobGit round-trips the blob', () => {
  const { cloneDir } = makeBareOriginAndClone();
  const runner = (args, opts) => realRunner(args, { ...opts, cwd: cloneDir });
  const read1 = readClaimBlobGit({ issueNumber: 42, remote: 'origin', runner });
  const write = writeClaimBlobGit({
    issueNumber: 42, content: '{"runId":"r1"}', message: 'Claim #42',
    expectedTipSha: read1.tipSha, remote: 'origin', runner,
  });
  assert.equal(write.ok, true);
  const read2 = readClaimBlobGit({ issueNumber: 42, remote: 'origin', runner });
  assert.equal(read2.absent, false);
  assert.equal(read2.content, '{"runId":"r1"}');
  assert.notEqual(read2.tipSha, read1.tipSha);
});

test('writeClaimBlobGit: a second write on a stale expectedTipSha is contested', () => {
  const { cloneDir } = makeBareOriginAndClone();
  const runner = (args, opts) => realRunner(args, { ...opts, cwd: cloneDir });
  const read1 = readClaimBlobGit({ issueNumber: 42, remote: 'origin', runner });
  writeClaimBlobGit({
    issueNumber: 42, content: '{"runId":"r1"}', message: 'Claim #42 by r1',
    expectedTipSha: read1.tipSha, remote: 'origin', runner,
  });
  // Second writer still holds the STALE tip from read1 — its lease no longer matches.
  const write2 = writeClaimBlobGit({
    issueNumber: 42, content: '{"runId":"r2"}', message: 'Claim #42 by r2',
    expectedTipSha: read1.tipSha, remote: 'origin', runner,
  });
  assert.equal(write2.ok, false);
  assert.equal(write2.conflict, true);
});

test('writeClaimBlobGit: unrelated existing files in the tree survive a write', () => {
  const { cloneDir } = makeBareOriginAndClone();
  const runner = (args, opts) => realRunner(args, { ...opts, cwd: cloneDir });
  const read1 = readClaimBlobGit({ issueNumber: 1, remote: 'origin', runner });
  writeClaimBlobGit({
    issueNumber: 1, content: '{"runId":"r1"}', message: 'Claim #1',
    expectedTipSha: read1.tipSha, remote: 'origin', runner,
  });
  const read2 = readClaimBlobGit({ issueNumber: 1, remote: 'origin', runner });
  writeClaimBlobGit({
    issueNumber: 2, content: '{"runId":"r2"}', message: 'Claim #2',
    expectedTipSha: read2.tipSha, remote: 'origin', runner,
  });
  const readme = realRunner(['show', `origin/${CLAIMS_BRANCH}:README.md`], { cwd: cloneDir });
  assert.equal(readme, 'seed\n');
  const issue1 = readClaimBlobGit({ issueNumber: 1, remote: 'origin', runner });
  assert.equal(issue1.content, '{"runId":"r1"}');
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/issues/claims-git-cas.test.js`
Expected: FAIL — `readClaimBlobGit`/`writeClaimBlobGit` are not exported yet.

- [ ] **Step 7: Implement read/write against the git-CAS core**

Append to `plugin/bin/lib/issues/claims-git-cas.js`:

```javascript
// plugin/bin/lib/issues/claims-git-cas.js (part 2 — I/O, appended after part 1)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GIT_TIMEOUT_MS = 10000;

function defaultRunner(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: GIT_TIMEOUT_MS, ...opts,
  });
}

// {issueNumber, remote, branch, runner} -> {content, tipSha, absent, failure}
// Fetches the branch fresh every call (cheap — one ref) so `tipSha` is
// always the live remote tip, never a locally-cached one that could be
// stale by the time writeClaimBlobGit uses it as the compare-and-swap lease.
function readClaimBlobGit({ issueNumber, remote = 'origin', branch = CLAIMS_BRANCH, runner = defaultRunner }) {
  let tipSha;
  try {
    runner(['fetch', '-q', remote, branch]);
    tipSha = runner(['rev-parse', 'FETCH_HEAD']).trim();
  } catch (err) {
    return { content: null, tipSha: null, absent: false, failure: 'transport-failure' };
  }
  const targetPath = claimFilePath(issueNumber);
  try {
    const content = runner(['show', `${tipSha}:${targetPath}`]);
    return { content, tipSha, absent: false, failure: null };
  } catch (err) {
    const { kind } = classifyGitError(err);
    if (kind === 'missing-path') return { content: null, tipSha, absent: true, failure: null };
    return { content: null, tipSha, absent: false, failure: 'transport-failure' };
  }
}

// {issueNumber, content, message, expectedTipSha, remote, branch, runner} ->
// {ok, conflict?, secondaryRateLimit?, failure}
// Builds the new commit via the index (read-tree + update-index + write-tree
// + commit-tree) rather than manual tree-walking — git's own machinery
// handles the nested `claims/` path and leaves every other entry in the
// tree untouched. A scratch GIT_INDEX_FILE keeps this off the real working
// tree's index. The push itself is the compare-and-swap: `--force-with-lease`
// against `expectedTipSha` fails closed the instant the remote tip has
// moved since this write's own read.
function writeClaimBlobGit({
  issueNumber, content, message, expectedTipSha, remote = 'origin', branch = CLAIMS_BRANCH, runner = defaultRunner,
}) {
  const targetPath = claimFilePath(issueNumber);
  const scratchIndex = path.join(os.tmpdir(), `claims-git-cas-index-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const env = { ...process.env, GIT_INDEX_FILE: scratchIndex };
  try {
    const blobSha = runner(['hash-object', '-w', '--stdin'], { input: content, env }).trim();
    runner(['read-tree', expectedTipSha], { env });
    runner(['update-index', '--add', '--cacheinfo', `100644,${blobSha},${targetPath}`], { env });
    const treeSha = runner(['write-tree'], { env }).trim();
    const commitSha = runner(['commit-tree', treeSha, '-p', expectedTipSha, '-m', message], { env }).trim();
    runner(['push', remote, `${commitSha}:refs/heads/${branch}`, `--force-with-lease=refs/heads/${branch}:${expectedTipSha}`]);
    return { ok: true, failure: null };
  } catch (err) {
    const { kind } = classifyGitError(err);
    if (kind === 'contested') return { ok: false, conflict: true, failure: null };
    if (kind === 'secondary-rate-limit') return { ok: false, secondaryRateLimit: true, failure: null };
    return { ok: false, failure: 'transport-failure' };
  } finally {
    fs.rm(scratchIndex, { force: true }, () => {});
  }
}

module.exports.readClaimBlobGit = readClaimBlobGit;
module.exports.writeClaimBlobGit = writeClaimBlobGit;
module.exports.defaultRunner = defaultRunner;
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/issues/claims-git-cas.test.js`
Expected: all tests PASS (10 total: 6 classifier + 4 read/write-against-real-git).

- [ ] **Step 9: Commit**

```bash
git add plugin/bin/lib/issues/claims-git-cas.js tests/bin-lib/issues/claims-git-cas.test.js
git commit -m "Add git compare-and-swap core for the claims-registry lock (#787)"
```

---

### Task 2: Extend contents-API classification with secondary-rate-limit

**Files:**
- Modify: `plugin/bin/lib/issues/claim-store.js:64-71` (`classifyGhApiError`)
- Test: `tests/bin-lib/issues/claim-store.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Task 3): `classifyGhApiError(err)` now also returns `{ failure: 'secondary-rate-limit', status: null }` for a 403 secondary-rate-limit response, distinguishable from the existing `{ failure: 'network-failure', status: null }` generic case.

- [ ] **Step 1: Write the failing test**

```javascript
// Append to tests/bin-lib/issues/claim-store.test.js
const { classifyGhApiError } = require('../../../plugin/bin/lib/issues/claim-store');

test('classifyGhApiError: secondary rate limit is distinct from network-failure', () => {
  const err = new Error('gh: You have exceeded a secondary rate limit (HTTP 403)');
  err.stderr = 'gh: You have exceeded a secondary rate limit. Please wait a few minutes before you try again. (HTTP 403)';
  assert.deepEqual(classifyGhApiError(err), { failure: 'secondary-rate-limit', status: 403 });
});

test('classifyGhApiError: Retry-After signature also reads as secondary rate limit', () => {
  const err = new Error('gh: API rate limit exceeded (HTTP 403)');
  err.stderr = 'gh: API rate limit exceeded (HTTP 403)\nRetry-After: 60';
  assert.deepEqual(classifyGhApiError(err), { failure: 'secondary-rate-limit', status: 403 });
});

test('classifyGhApiError: a plain 403 with no rate-limit text still falls to network-failure', () => {
  const err = new Error('gh: Resource not accessible by integration (HTTP 403)');
  assert.deepEqual(classifyGhApiError(err), { failure: 'network-failure', status: null });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/issues/claim-store.test.js`
Expected: FAIL — the new secondary-rate-limit case currently falls through to `{ failure: 'network-failure', status: null }`.

- [ ] **Step 3: Implement the classification**

In `plugin/bin/lib/issues/claim-store.js`, edit `classifyGhApiError` (around line 64):

```javascript
function classifyGhApiError(e) {
  if (e && e.code === 'ENOENT') return { failure: 'gh-absent', status: null };
  const text = [e && e.message, e && e.stderr, e && e.stdout].filter(Boolean).map(String).join(' ');
  if (/secondary rate limit|abuse detection mechanism|Retry-After/i.test(text)) return { failure: 'secondary-rate-limit', status: 403 };
  if (/HTTP 404|Not Found/.test(text)) return { failure: null, status: 404 };
  if (/HTTP 422|Unprocessable|Validation failed/.test(text)) return { failure: null, status: 422 };
  if (/HTTP 409|Conflict|does not match/i.test(text)) return { failure: null, status: 409 };
  return { failure: 'network-failure', status: null };
}
```

(The secondary-rate-limit check runs first — before the 404/422/409 checks — so a rate-limited response can never be misread as one of those shapes even if its body happens to mention a similar-looking status elsewhere.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/issues/claim-store.test.js`
Expected: all tests PASS, including the pre-existing suite (no regressions).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/issues/claim-store.js tests/bin-lib/issues/claim-store.test.js
git commit -m "Classify secondary-rate-limit as distinct from contested on the contents-API path (#787)"
```

---

### Task 3: Wire git-CAS as the primary transport inside claim-store.js

**Files:**
- Modify: `plugin/bin/lib/issues/claim-store.js` (`readClaimBlob`, `writeClaimBlob`)
- Modify: `plugin/bin/lib/claim-targets/claim-targets.js` (route `secondaryRateLimit` to the transient branch, not contested)
- Test: `tests/bin-lib/issues/claim-store.test.js`, `tests/bin-lib/claim-targets/claim-targets.test.js`

**Interfaces:**
- Consumes: `readClaimBlobGit`/`writeClaimBlobGit`/`classifyGitError` from Task 1; `classifyGhApiError` (extended) from Task 2.
- Produces: `readClaimBlob(deps, repoSlug, issueNumber)` and `writeClaimBlob(deps, repoSlug, issueNumber, opts)` now take a `deps` object `{ ghApi, gitRunner? }` instead of a bare `ghApi` function (backward-compatible: every existing call site passes `deps.ghApi` positionally today — see Migration note below). Return shape gains `secondaryRateLimit?: true` alongside the existing `conflict?: true`.

**Migration note (breaking the existing 2-arg call sites):** `claim-store.js`'s `readClaimBlob`/`writeClaimBlob` are currently called as `readClaimBlob(ghApi, repoSlug, issueNumber)` from `claim-targets.js` (lib) and `release-merged.js`. This task changes the first parameter to a `deps` object. Both call sites are updated in this same task (their own modules are otherwise Task 4/5's territory, but the signature change must land atomically with its callers or the suite breaks).

- [ ] **Step 1: Write the failing tests for git-first-then-fallback behavior**

```javascript
// Append to tests/bin-lib/issues/claim-store.test.js
const {
  readClaimBlob, writeClaimBlob,
} = require('../../../plugin/bin/lib/issues/claim-store');

function fakeGitRunnerAlwaysWorks(tipSha, existingContent) {
  return (args) => {
    if (args[0] === 'fetch') return '';
    if (args[0] === 'rev-parse' && args[1] === 'FETCH_HEAD') return `${tipSha}\n`;
    if (args[0] === 'show') {
      if (existingContent === null) { const e = new Error(`fatal: path does not exist in '${tipSha}'`); throw e; }
      return existingContent;
    }
    if (args[0] === 'hash-object') return 'deadbeef\n';
    if (args[0] === 'read-tree') return '';
    if (args[0] === 'update-index') return '';
    if (args[0] === 'write-tree') return 'newtree\n';
    if (args[0] === 'commit-tree') return 'newcommit\n';
    if (args[0] === 'push') return '';
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
}

function fakeGitRunnerAlwaysFails() {
  return () => { const e = new Error('fatal: unable to access: Could not resolve host'); throw e; };
}

test('readClaimBlob: git-CAS succeeds, contents-API never called', () => {
  const gitRunner = fakeGitRunnerAlwaysWorks('a'.repeat(40), null);
  const ghApi = () => { throw new Error('contents-API must not be called when git-CAS succeeds'); };
  const result = readClaimBlob({ ghApi, gitRunner }, 'acme/w', 42);
  assert.equal(result.absent, true);
});

test('readClaimBlob: git-CAS transport failure falls back to contents-API', () => {
  const gitRunner = fakeGitRunnerAlwaysFails();
  const ghApi = (args) => {
    assert.equal(isRead(args, 'claims/issue-42.json'), true);
    return { stdout: JSON.stringify({ content: null, sha: null }), failure: null, status: 404 };
  };
  const result = readClaimBlob({ ghApi, gitRunner }, 'acme/w', 42);
  assert.equal(result.absent, true);
});

test('writeClaimBlob: git-CAS succeeds, contents-API never called', () => {
  const gitRunner = fakeGitRunnerAlwaysWorks('a'.repeat(40), null);
  const ghApi = () => { throw new Error('contents-API must not be called when git-CAS succeeds'); };
  const result = writeClaimBlob({ ghApi, gitRunner }, 'acme/w', 42, { content: '{}', message: 'Claim #42' });
  assert.equal(result.ok, true);
});

test('writeClaimBlob: git-CAS contested is reported, not falling back to contents-API', () => {
  const gitRunner = () => { const e = new Error('! [rejected] (stale info)'); e.stderr = e.message; throw e; };
  const ghApi = () => { throw new Error('contents-API must not be called on a genuine contest'); };
  const result = writeClaimBlob({ ghApi, gitRunner }, 'acme/w', 42, { content: '{}', message: 'Claim #42' });
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
});

test('writeClaimBlob: git-CAS secondary-rate-limit falls back to contents-API', () => {
  const gitRunner = () => { const e = new Error('remote: secondary rate limit'); e.stderr = e.message; throw e; };
  const ghApi = (args) => {
    assert.equal(isWrite(args, 'claims/issue-42.json'), true);
    return { stdout: '', failure: null, status: null };
  };
  const result = writeClaimBlob({ ghApi, gitRunner }, 'acme/w', 42, { content: '{}', message: 'Claim #42' });
  assert.equal(result.ok, true);
});

test('writeClaimBlob: no gitRunner supplied goes straight to contents-API (fallback seam for gh-absent-but-git-also-unavailable environments)', () => {
  const ghApi = (args) => {
    assert.equal(isWrite(args, 'claims/issue-1.json'), true);
    return { stdout: '', failure: null, status: null };
  };
  const result = writeClaimBlob({ ghApi }, 'acme/w', 1, { content: '{}', message: 'Claim #1' });
  assert.equal(result.ok, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/issues/claim-store.test.js`
Expected: FAIL — `readClaimBlob`/`writeClaimBlob` still take a bare `ghApi` function, not a `deps` object.

- [ ] **Step 3: Implement git-first-then-fallback**

In `plugin/bin/lib/issues/claim-store.js`, add the import and replace `readClaimBlob`/`writeClaimBlob`:

```javascript
const { readClaimBlobGit, writeClaimBlobGit } = require('./claims-git-cas');
```

```javascript
// (deps: {ghApi, gitRunner?}, repoSlug, issueNumber) -> {content, sha, failure, absent}
// Tries git-CAS first (no `gitRunner` dep = skip straight to contents-API,
// the gh-absent/MCP-only-sandbox seam this consolidation's amendment
// requires — see _shared/issue-claims.md). A git-CAS transport-failure
// (auth, no remote access) falls back to contents-API silently — the
// documented degrade, not an error. `sha` doubles as the git-CAS tip sha
// when this read came from git (writeClaimBlob accepts either shape as its
// compare-and-swap lease).
function readClaimBlob(deps, repoSlug, issueNumber) {
  if (deps.gitRunner) {
    const gitResult = readClaimBlobGit({ issueNumber, runner: deps.gitRunner });
    if (gitResult.failure === null) {
      return { content: gitResult.content, sha: gitResult.tipSha, failure: null, absent: gitResult.absent };
    }
    // fall through to contents-API on a git-side transport failure
  }
  const r = deps.ghApi([`repos/${repoSlug}/contents/${claimPath(issueNumber)}?ref=${CLAIMS_BRANCH}`, '-q', '{content: (.content | @base64d), sha: .sha}']);
  if (r.status === 404) return { content: null, sha: null, failure: null, absent: true };
  if (r.failure) return { content: null, sha: null, failure: r.failure, absent: false };
  try {
    const parsed = JSON.parse(r.stdout);
    return { content: parsed.content, sha: parsed.sha, failure: null, absent: false };
  } catch {
    return { content: null, sha: null, failure: 'network-failure', absent: false };
  }
}

// (deps: {ghApi, gitRunner?}, repoSlug, issueNumber, {content, sha, message}) -> {ok, conflict?, secondaryRateLimit?, failure}
// `sha` here is the compare-and-swap lease — the git-CAS tip sha when the
// preceding read went through git, or the contents-API blob sha otherwise;
// either shape is threaded straight through to whichever transport this
// write actually uses. A git-CAS contest is reported as-is (never silently
// retried against contents-API — that would race the same write twice
// under two different concurrency mechanisms). A git-CAS secondary-rate-limit
// or transport-failure falls back to contents-API once.
function writeClaimBlob(deps, repoSlug, issueNumber, { content, sha, message }) {
  if (deps.gitRunner && sha) {
    const gitResult = writeClaimBlobGit({
      issueNumber, content, message, expectedTipSha: sha, runner: deps.gitRunner,
    });
    if (gitResult.ok || gitResult.conflict) return gitResult;
    // transport-failure or secondaryRateLimit -> fall back to contents-API below
  }
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  const args = [
    '--method', 'PUT', `repos/${repoSlug}/contents/${claimPath(issueNumber)}`,
    '-f', `message=${message}`,
    '-f', `content=${encoded}`,
    '-f', `branch=${CLAIMS_BRANCH}`,
  ];
  if (sha) args.push('-f', `sha=${sha}`);
  const r = deps.ghApi(args);
  if (r.failure === 'secondary-rate-limit') return { ok: false, secondaryRateLimit: true, failure: null };
  if (r.status === 422 || r.status === 409) return { ok: false, conflict: true, failure: null };
  return { ok: r.failure === null && r.status !== 404, failure: r.failure };
}
```

Note: a create-only write (`sha` absent, i.e. the target is `absent`) has no git-CAS lease to compare against — `writeClaimBlobGit` requires `expectedTipSha`, which for a create-only write would be the branch tip itself (the read already returned it as `tipSha` even for an absent path — `readClaimBlobGit` always returns a `tipSha`, since the branch itself exists once bootstrapped). Verify this by re-reading Task 1's `readClaimBlobGit`: it returns `tipSha` unconditionally, so `sha` is never falsy for a bootstrapped branch — the `deps.gitRunner && sha` guard above is satisfied on every call once the branch exists. (Branch bootstrap is out of scope for this task and this plan: `ensureClaimsBranch` — the only code that ever created `claims-registry` from scratch — lived in `claim-engine.js` with its sole caller in `bin/claims.js`, both retired outright in Task 4 as dead code. Neither surviving CLI, `bin/claim-targets.js` nor `bin/release-claim.js`, has ever called it; the branch is assumed pre-existing, which it already is in this live repo — deleting the unused bootstrap path removes no exercised capability.)

- [ ] **Step 4: Update the two existing call sites for the new `deps` shape**

In `plugin/bin/lib/claim-targets/claim-targets.js`, every `claimStore.readClaimBlob(deps.ghApi, repoSlug, issue)` becomes `claimStore.readClaimBlob(deps, repoSlug, issue)` (4 call sites: `holderFromFreshRead`, `releaseClaimedThisRun`, and the two in `run`'s main loop), and every `claimStore.writeClaimBlob(deps.ghApi, repoSlug, issue, {...})` becomes `claimStore.writeClaimBlob(deps, repoSlug, issue, {...})` (2 call sites). `deps` in this module already carries `ghApi`; it now also carries an optional `gitRunner`, passed straight through to `claim-store.js` unchanged (this module has no git-specific logic of its own — it just forwards the dep).

Wire a **real** `gitRunner` into `bin/claim-targets.js`'s `realDeps` (`plugin/bin/claim-targets.js`) so the claim path actually uses git-CAS in production, not only in tests — the whole point of the amendment. Add the import and the field:

```javascript
const { defaultRunner: gitDefaultRunner } = require('./lib/issues/claims-git-cas');
```

```javascript
const realDeps = {
  ghApi: claimStore.defaultGhApi,
  gh: defaultGh,
  gitRunner: gitDefaultRunner,
  now: Date.now,
  stdout: (s) => process.stdout.write(`${s}\n`),
  stderr: (s) => process.stderr.write(s),
  hostname: os.hostname(),
  sessionId: process.env.CLAUDE_CODE_SESSION_ID || '',
};
```

(`gitDefaultRunner` is Task 1's exported `defaultRunner` from `claims-git-cas.js` — the real `execFileSync('git', ...)` wrapper — reused here rather than re-implemented, so there is exactly one real-git-spawn function in the whole consolidated surface.)

Also in the same file, extend the write-failure branch (around the `if (write.failure) { ... }` block) to treat a secondary rate limit as transient, not contested:

```javascript
if (write.failure || write.secondaryRateLimit) {
  const reason = write.secondaryRateLimit ? 'secondary-rate-limit' : write.failure;
  if (opts.keepGoing) { skipped.push({ issue, reason: 'transient', error: reason }); continue; }
  return abort({ transient: [{ issue, error: reason }] }, 4);
}
```

(replacing the existing `if (write.failure) { ... }` block one level up — same shape, one added condition and one added ternary for the reported `error` string).

In `plugin/bin/lib/reconcile/release-merged.js`, every `claimStore.readClaimBlob(ghApi, repoSlug, issue)`-shaped call becomes `claimStore.readClaimBlob({ ghApi }, repoSlug, issue)` (no `gitRunner` — this module's own header comment already documents that its `ghApi` never sets `status`, so it stays on the contents-API-only path deliberately; do not add git-CAS here in this task, since `release-merged.js`'s writes go through `release-claim/release.js`, not `claim-store.js` — Task 5 handles that module).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/issues/claim-store.test.js tests/bin-lib/claim-targets/claim-targets.test.js tests/bin-lib/reconcile/release-merged.test.js`
Expected: all PASS. If `claim-targets.test.js` or `release-merged.test.js` fail on the call-site signature change, update their fake `ghApi`-only deps objects to `{ ghApi: fakeGhApi }` (no `gitRunner`) — those suites test the contents-API-fallback path and correctly never supply a `gitRunner`, matching this task's "no gitRunner = contents-API only" contract.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/issues/claim-store.js plugin/bin/lib/claim-targets/claim-targets.js plugin/bin/lib/reconcile/release-merged.js tests/bin-lib/issues/claim-store.test.js tests/bin-lib/claim-targets/claim-targets.test.js
git commit -m "Wire git-CAS as the primary claims-registry write transport, contents-API as fallback (#787)"
```

---

### Task 4: Retire claim-engine.js and bin/claims.js (dead code, zero real consumers)

**Files:**
- Delete: `plugin/bin/lib/issues/claim-engine.js`, `plugin/bin/claims.js`
- Delete: `tests/bin-lib/issues/claim-engine.test.js`
- Modify: `plugin/bin/lib/claim-targets/claim-targets.js` (its one real dependency on `claim-engine.js` — `tombstoneInFlightPr` — moves, see Step 1)
- Modify: `docs/plugin-structure.md` (drop the two retired entries)

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Task 6's conformance test): `claim-engine.js` no longer exists, so it can no longer be a second contents-API-PUT module.

**Verification before deleting (already done during planning, restated for the implementer to re-confirm against the live tree before touching anything):** `grep -rn "bin/claims\.js\|require.*claim-engine" plugin/skills/ docs/` finds exactly one hit — `_shared/issue-claims.md:16`'s stale "the command every gh-present consumer... runs" claim (migrated in Task 7) — and `docs/plugin-structure.md`'s own two documentation entries (migrated in this task's Step 4). `claim-targets.js` (lib)'s `tombstoneInFlightPr` import is the only *code* dependency on `claim-engine.js`, handled in Step 1 below.

- [ ] **Step 1: Move `tombstoneInFlightPr` out of the module being deleted**

`plugin/bin/lib/claim-targets/claim-targets.js:25` currently does `const { tombstoneInFlightPr } = require('../issues/claim-engine');`. This function (and its private helpers `isSameRepoPrUrl`/`escapeRegExp`, `plugin/bin/lib/issues/claim-engine.js:134-188`) has no other caller inside `claim-engine.js` itself, so move it verbatim into `plugin/bin/lib/issues/claim-store.js` (the module that survives) rather than leaving it stranded:

Add to `plugin/bin/lib/issues/claim-store.js` (near the bottom, before `module.exports`):

```javascript
// Escapes a literal string for embedding inside a `new RegExp(...)` pattern.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSameRepoPrUrl(link, owner, repo) {
  if (typeof link !== 'string') return false;
  if (typeof owner !== 'string' || !owner || typeof repo !== 'string' || !repo) return false;
  const re = new RegExp(`^https://github\\.com/${escapeRegExp(owner)}/${escapeRegExp(repo)}/pull/\\d+$`);
  return re.test(link);
}

// content: the raw tombstone blob text just read. gh: the generic throwing
// gh runner (NOT ghApi — this needs `gh pr view`, not a contents-API call).
// owner/repo: the SAME owner/repo as the issue being claimed. See
// claim-engine.js's original doc comment (moved here verbatim, #787) for
// the full #315 rationale: a `pr-opened:` tombstone whose linked PR is
// still open means a build already completed and is awaiting merge.
function tombstoneInFlightPr(content, gh, owner, repo) {
  try {
    const parsed = JSON.parse(content);
    const reason = parsed && parsed.reason;
    const link = parsed && parsed.link;
    if (typeof reason !== 'string' || !reason.startsWith('pr-opened:')) return null;
    if (!isSameRepoPrUrl(link, owner, repo)) return null;
    const state = gh(['pr', 'view', link, '--json', 'state', '--jq', '.state']).trim();
    return state === 'OPEN' ? { link } : null;
  } catch {
    return null;
  }
}
```

Add `tombstoneInFlightPr` to `claim-store.js`'s `module.exports`. Update `plugin/bin/lib/claim-targets/claim-targets.js:25` to `const { tombstoneInFlightPr } = require('../issues/claim-store');` and remove the now-unused `require('../issues/claim-engine')` line entirely (it has no other import from that module).

- [ ] **Step 2: Migrate the moved function's tests**

`tests/bin-lib/issues/claim-engine.test.js` has test cases for `tombstoneInFlightPr`/`isSameRepoPrUrl` (grep the file for `tombstoneInFlightPr` to find them). Move exactly those test cases into `tests/bin-lib/issues/claim-store.test.js`, updating their `require` to pull from `claim-store` instead of `claim-engine`. Every other test in `claim-engine.test.js` (covering `claimOne`/`releaseOne`/`claimGroup`/`readClaimBlob`/`writeClaimBlob`/`ensureClaimsBranch` — the dead code) is dropped, not migrated — that behavior is retired, not preserved.

- [ ] **Step 3: Run the tests to verify the migration is clean**

Run: `node --test tests/bin-lib/issues/claim-store.test.js tests/bin-lib/claim-targets/claim-targets.test.js`
Expected: all PASS, including the migrated `tombstoneInFlightPr` cases.

- [ ] **Step 4: Delete the dead modules and their orphaned test file, update the doc catalog**

```bash
git rm plugin/bin/lib/issues/claim-engine.js plugin/bin/claims.js tests/bin-lib/issues/claim-engine.test.js
```

In `docs/plugin-structure.md`:
- Line 18's `bin/` file-list sentence: remove `claims` from the parenthetical CLI list.
- Line 28's `bin/lib/issues/` entry: remove the `claim-engine.js (...)` clause and its trailing `, plugin/bin/claims.js` from the "Consumed by" sentence.
- Line 34's `bin/lib/claim-targets/` entry: change "the claim-time in-flight check to plugin/bin/lib/issues/claim-engine.js's `tombstoneInFlightPr`" to "plugin/bin/lib/issues/claim-store.js's `tombstoneInFlightPr`" (reflects Step 1's move).
- Line 129 (the `node plugin/bin/claims.js ...` command-reference row): delete the entire row. Replace it with a one-line deprecation note directly below the `bin/release-claim.js`/`bin/claim-targets.js` rows: `<!-- bin/claims.js and bin/lib/issues/claim-engine.js retired #787 — zero real consumers; the claims-registry protocol's one CLI surface is bin/claim-targets.js (claim) + bin/release-claim.js (release) -->`.

- [ ] **Step 5: Run the full targeted suite once more**

Run: `node --test tests/bin-lib/issues/*.test.js tests/bin-lib/claim-targets/*.test.js tests/bin-lib/reconcile/*.test.js`
Expected: all PASS. No test file references the deleted modules (a stale `require` would throw `Cannot find module` here).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/issues/claim-store.js plugin/bin/lib/claim-targets/claim-targets.js tests/bin-lib/issues/claim-store.test.js docs/plugin-structure.md
git commit -m "Retire claim-engine.js and bin/claims.js — zero real consumers beyond a stale doc mention (#787)"
```

---

### Task 5: Fold release-claim/release.js's I/O onto claim-store.js's primitives

**Files:**
- Modify: `plugin/bin/lib/release-claim/release.js`
- Test: `tests/bin-lib/release-claim/release.test.js`

**Interfaces:**
- Consumes: `readClaimBlob`/`writeClaimBlob` from `claim-store.js` (Task 3's `deps`-shaped signature).
- Produces: `releaseClaim(...)` gains one new optional parameter, `gitRunner` (default `undefined` — contents-API-only, preserving today's behavior for any caller that doesn't pass one). Its return shape is otherwise **unchanged**. `release-merged.js` needs no edit in this task (it never calls `releaseClaim` — it calls `writeTombstone` directly with its own `ghApi`-shaped wiring, untouched here, so it stays contents-API-only exactly as its own header comment already documents). `bin/release-claim.js` **is** edited in this task (Step 5 below) to thread a real `gitRunner` through, so the release path — the one the record's own incident evidence names (`spec-702's release` in the amendment) — actually gets git-CAS in production.

- [ ] **Step 1: Write the failing test proving the internal delegation**

```javascript
// Append to tests/bin-lib/release-claim/release.test.js
const claimStore = require('../../../plugin/bin/lib/issues/claim-store');

test('releaseClaim delegates its read/write through claim-store.js, not its own gh api calls', (t) => {
  const readSpy = t.mock.method(claimStore, 'readClaimBlob', () => ({ content: null, sha: null, failure: null, absent: true }));
  const writeSpy = t.mock.method(claimStore, 'writeClaimBlob');
  releaseClaim({
    owner: 'acme', repo: 'w', issueNumber: 7, runId: 'r1', reason: 'test',
    runner: () => { throw new Error('a raw gh runner call means the delegation did not happen'); },
  });
  assert.equal(readSpy.mock.calls.length, 1);
  // absent -> already-released, no write expected; readSpy call proves delegation either way.
  assert.equal(writeSpy.mock.calls.length, 0);
});

test('releaseClaim: a held claim by this run writes the tombstone through claim-store.writeClaimBlob', (t) => {
  t.mock.method(claimStore, 'readClaimBlob', () => ({
    content: JSON.stringify({ runId: 'r1', claimedAt: new Date(0).toISOString(), ttlHours: 72 }),
    sha: 'sha1', failure: null, absent: false,
  }));
  const writeSpy = t.mock.method(claimStore, 'writeClaimBlob', () => ({ ok: true, failure: null }));
  const runner = (args) => {
    if (args[0] === 'issue' && args[1] === 'comment') return '';
    throw new Error(`unexpected runner call in delegated path: ${args.join(' ')}`);
  };
  const result = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 7, runId: 'r1', reason: 'test', runner, now: Date.now() });
  assert.equal(result.outcome, 'released');
  assert.equal(writeSpy.mock.calls.length, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/release-claim/release.test.js`
Expected: FAIL — `release.js` still performs its own `runner(['api', ...])` calls directly, so `claimStore.readClaimBlob`/`writeClaimBlob` are never invoked.

- [ ] **Step 3: Fold `readClaimBlob`/`writeTombstone` onto claim-store.js**

In `plugin/bin/lib/release-claim/release.js`, add the import:

```javascript
const claimStore = require('../issues/claim-store');
```

Replace the module's own `readClaimBlob` function (lines 35-45) with a thin adapter over `claim-store.js`'s (kept as an exported name for `bin/release-claim.js` — Task's Interfaces note above — but now delegating). `gitRunner` is a new optional parameter, threaded straight through to `claim-store.js`'s `deps` — omitted (`undefined`) it behaves exactly as before (contents-API only):

```javascript
// -> { content, sha } | { content:null, sha:null, absent:true }; other failures throw.
// Delegates to claim-store.js's readClaimBlob (the surviving single contents-API
// reader, now with git-CAS tried first when gitRunner is supplied) instead of
// this module's own separate gh api call (#787 consolidation).
function readClaimBlob({ owner, repo, issueNumber, runner = defaultRunner, gitRunner }) {
  const ghApi = (args) => {
    try {
      const stdout = runner(['api', ...args]);
      return { stdout, failure: null, status: null };
    } catch (err) {
      if (isNotFoundError(err)) return { stdout: null, failure: null, status: 404 };
      return { stdout: null, failure: 'network-failure', status: null };
    }
  };
  const result = claimStore.readClaimBlob({ ghApi, gitRunner }, `${owner}/${repo}`, issueNumber);
  if (result.failure) { const e = new Error(`claim-store read failure: ${result.failure}`); throw e; }
  return result.absent ? { content: null, sha: null, absent: true } : { content: result.content, sha: result.sha };
}
```

Replace `writeTombstone` (lines 50-56) similarly — same new optional `gitRunner` parameter:

```javascript
// Conditional overwrite (sha = the blob's current sha from the read) — now
// delegating to claim-store.js's writeClaimBlob (#787 consolidation), which
// tries git-CAS first per the amendment when `gitRunner` is supplied.
// release-merged.js's own call site never passes one (see that module's own
// header comment) and stays contents-API-only, unchanged by this task;
// bin/release-claim.js (Step 5 below) does pass a real one.
function writeTombstone({ owner, repo, issueNumber, sha, tombstoneContent, message, runner = defaultRunner, gitRunner }) {
  const ghApi = (args) => {
    try {
      const stdout = runner(['api', ...args]);
      return { stdout, failure: null, status: null };
    } catch (err) {
      throw err; // writeTombstone's own callers already branch on thrown errors (isAlreadyReleasedError etc.) — preserve throw-on-failure
    }
  };
  const result = claimStore.writeClaimBlob({ ghApi, gitRunner }, `${owner}/${repo}`, issueNumber, {
    content: tombstoneContent, sha, message,
  });
  if (!result.ok) {
    const e = new Error(result.conflict ? 'HTTP 409/422 sha mismatch' : (result.failure || 'write failed'));
    throw e;
  }
  return '';
}
```

Finally, thread the same optional `gitRunner` through `releaseClaim` itself (around line 78) so `bin/release-claim.js` has something to pass in Step 5 — add `gitRunner` to its destructured options and forward it on both of its `readClaimBlob`/`writeTombstone` calls:

```javascript
function releaseClaim({ owner, repo, issueNumber, runId, reason, link, removeGrants = false, removeInProgress = false, runner = defaultRunner, gitRunner, now = Date.now() }) {
  const result = { outcome: 'failed', calls: [], commentPosted: false, labelsRemoved: [], labelsFailed: [], note: null };
  let blob;
  try { blob = readClaimBlob({ owner, repo, issueNumber, runner, gitRunner }); } catch (err) { result.error = errorText(err); return result; }
  result.calls.push('read');
  const classified = classifyClaimBlob(blob.content, now);
  if (classified.state === 'unreadable') { result.outcome = 'skipped-not-owner'; result.holder = 'unreadable'; return result; }
  const isHeld = classified.state === 'live' || classified.state === 'stale';
  if (isHeld) {
    const holder = JSON.parse(blob.content).runId;
    if (holder !== runId) { result.outcome = 'skipped-not-owner'; result.holder = holder; return result; }
  }
  const payload = releasePayload({ issueNumber, runId, reason, link: link || undefined, now });
  if (isHeld) {
    try {
      writeTombstone({ owner, repo, issueNumber, sha: blob.sha, tombstoneContent: payload.tombstoneContent, message: `Release claim on issue #${issueNumber}`, runner, gitRunner });
      result.calls.push('put');
      result.outcome = 'released';
    } catch (err) {
      if (!isAlreadyReleasedError(err)) { result.error = errorText(err); return result; }
      result.outcome = 'already-released';
      result.note = errorText(err);
    }
  } else {
    result.outcome = 'already-released';
  }
  try {
    postReleaseComment({ owner, repo, issueNumber, body: payload.commentBody, runner });
    result.calls.push('comment');
    result.commentPosted = true;
  } catch (err) {
    result.note = result.note ? `${result.note}; ${errorText(err)}` : errorText(err);
  }
  const labels = [...(removeGrants ? GRANT_LABELS : []), ...(removeInProgress ? [IN_PROGRESS_LABEL] : [])];
  for (const label of labels) {
    const r = removeLabel({ owner, repo, issueNumber, label, runner });
    result.calls.push(`label:${label}`);
    (r.ok ? result.labelsRemoved : result.labelsFailed).push(label);
  }
  return result;
}
```

(Unchanged from the current implementation except the added `gitRunner` parameter and its two forwarding sites — every other line is identical to the existing function, reproduced in full here since a partial diff against a moving function body is error-prone to hand-apply.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/release-claim/release.test.js tests/bin-lib/release-claim/cli.test.js`
Expected: all PASS, including the two new delegation tests and the full pre-existing suite (release-claim.js's CLI-level tests are unaffected — `releaseClaim`'s external contract is additive-only: a new optional parameter, no change to any existing call shape or return value).

- [ ] **Step 5: Thread a real `gitRunner` through `bin/release-claim.js`**

**Files:** Modify `plugin/bin/release-claim.js`.

This is the CLI that record-697/spec-702's incident evidence names — wiring git-CAS here is the actual point of the amendment for the release path (release-merged.js deliberately stays contents-API-only, per Step 3's note above). Add the import and the `realDeps` field, and thread it into the `releaseClaim(...)` call:

```javascript
const { defaultRunner: gitDefaultRunner } = require('./lib/issues/claims-git-cas');
```

```javascript
const realDeps = {
  runner: release.defaultRunner,
  gitRunner: gitDefaultRunner,
  ghAvailable: () => { try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } },
  remoteUrl: () => execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }),
  now: () => Date.now(),
  cwd: () => process.cwd(),
  mainRoot: undefined,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};
```

In `run(argv, deps = realDeps)`, the existing `release.releaseClaim({...})` call (around line 96) gains one field:

```javascript
const r = release.releaseClaim({
  owner: repoSpec.owner, repo: repoSpec.repo, issueNumber: issue, runId, reason, link: o.link || undefined,
  removeGrants: o.removeGrants, removeInProgress: o.removeInProgress, runner: deps.runner, gitRunner: deps.gitRunner, now: deps.now(),
});
```

Run: `node --test tests/bin-lib/release-claim/cli.test.js`
Expected: PASS unchanged — the CLI test suite's fake `deps` objects don't supply a `gitRunner`, so `releaseClaim` receives `undefined` for it, exercising the exact same contents-API-only path those tests already pin. (A test supplying `deps` without `gitRunner` at all — as every existing test in this file does — is indistinguishable from explicitly passing `gitRunner: undefined`, so no existing test needs editing.)

- [ ] **Step 6: Run the reconcile suite (release-merged.js shares writeTombstone)**

Run: `node --test tests/bin-lib/reconcile/release-merged.test.js`
Expected: PASS unchanged — `release-merged.js` imports `writeTombstone` by name from `release-claim/release.js` and never passes `gitRunner`; that call site's behavior is bit-for-bit the same as before this task.

- [ ] **Step 7: Commit**

```bash
git add plugin/bin/lib/release-claim/release.js plugin/bin/release-claim.js tests/bin-lib/release-claim/release.test.js
git commit -m "Fold release-claim/release.js's I/O onto claim-store.js's primitives, wire real git-CAS into bin/release-claim.js (#787)"
```

---

### Task 6: Conformance test — exactly one contents-API PUT module

**Files:**
- Create: `tests/claims-single-write-path.test.js`

**Interfaces:**
- Consumes: nothing new (this is a static-analysis test over the `bin/` tree).
- Produces: nothing consumed by later tasks — this is AC1's mechanical check, made permanent.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/claims-single-write-path.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// AC1: "exactly one write-path module (plus its CLI wrappers)" — the check
// #723's final review ran by hand, now mechanical. Matches the CALL SHAPE
// (a `--method PUT` against a `contents/${...}` path reaching a `claims`
// keyspace), not a literal string — claim-engine.js used to evade a
// literal-string grep by building its path as `` contents/${path} ``
// (#787's amendment, AC1 repair). A CLI wrapper (bin/claim-targets.js,
// bin/release-claim.js) is exempt — it never composes the PUT arguments
// itself, only calls into the one library module that does.
const BIN_ROOT = path.join(__dirname, '..', 'plugin', 'bin');
const CLI_WRAPPER_ALLOWLIST = new Set(['claim-targets.js', 'release-claim.js']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// A file "performs the PUT" when it contains both a `--method`, `'PUT'`
// pair and a template/string literal building a `contents/` path whose
// final segment reaches into a `claims` directory — matches
// `` `repos/${x}/contents/${claimPath(...)}` `` and
// `` `repos/${x}/contents/claims/issue-${n}.json` `` alike.
function performsClaimsPut(source) {
  const hasPutMethod = /--method['"]?\s*,\s*['"]PUT['"]/.test(source) || /'PUT'/.test(source);
  const hasContentsClaimsPath = /contents\/(\$\{[^}]*claim[^}]*\}|claims\/)/i.test(source);
  return hasPutMethod && hasContentsClaimsPath;
}

test('exactly one module under bin/ performs the contents-API PUT to claims/', () => {
  const files = walk(BIN_ROOT).filter((f) => !path.basename(path.dirname(f)).match(/^(tests|node_modules)$/));
  const writers = files.filter((f) => {
    const base = path.basename(f);
    if (CLI_WRAPPER_ALLOWLIST.has(base) && path.dirname(f) === BIN_ROOT) return false; // CLI wrapper, not a write-path module
    return performsClaimsPut(fs.readFileSync(f, 'utf8'));
  });
  assert.equal(writers.length, 1, `expected exactly one contents-API-PUT module under bin/, found: ${writers.map((f) => path.relative(BIN_ROOT, f)).join(', ')}`);
  assert.equal(path.basename(writers[0]), 'claim-store.js');
});
```

- [ ] **Step 2: Run the test to verify it currently passes (proving Tasks 1-5 already achieved AC1)**

Run: `node --test tests/claims-single-write-path.test.js`
Expected: PASS — by this point in the plan, `claim-engine.js` is deleted (Task 4) and `release-claim/release.js` delegates to `claim-store.js` instead of composing its own PUT (Task 5), so `claim-store.js` is already the sole match. If this fails, it means an earlier task's fold was incomplete — stop and re-check Tasks 3-5 before proceeding, per this plan's TDD discipline (a new test should go red first; here it validates prior work instead, which is the expected shape for a conformance check added after its target state already exists).

- [ ] **Step 3: Commit**

```bash
git add tests/claims-single-write-path.test.js
git commit -m "Add conformance test: exactly one contents-API-PUT module under bin/ (#787 AC1)"
```

---

### Task 7: Migrate prose citations

**Files:**
- Modify: `plugin/skills/_shared/issue-claims.md`
- Verify (no change expected): `plugin/skills/flow/claim-targets.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Verify `skills/flow/claim-targets.md` needs no change**

Run: `grep -n "claim-targets.js\|exit code\|exit 0\|exit 2\|exit 3\|exit 4" plugin/skills/flow/claim-targets.md`
Expected: the existing Step 2.8 exit-code branching text (lines ~116-190, confirmed during planning) already cites `bin/claim-targets.js` by name and never mentions `claim-engine.js`/`bin/claims.js` — AC2 requires this file's branching to hold verbatim, so this step is a read-only confirmation, not an edit. If the grep turns up an unexpected citation of a retired module, stop and escalate rather than editing this conformance-pinned file casually — `tests/flow-claim-preflight.test.js` pins it.

- [ ] **Step 2: Rewrite `_shared/issue-claims.md`'s "The lock" opening to name the surviving CLIs and the git-CAS-first behavior**

In `plugin/skills/_shared/issue-claims.md`, replace the stale paragraph at (originally) lines 15-18:

```markdown
**`bin/claims.js claim|release <n,n,...> --run-id <id>`** (`bin/lib/issues/claim-engine.js`) is
the gh-CLI-transport implementation of every read-classify-write step below, plus the group-claim-
all-or-abort semantics `flow/claim-targets.md`'s Step 2.8 needs — the command every `gh`-present
consumer of this section runs instead of hand-scripting the loop per pipeline run. The MCP
transport (`gh` absent) still runs the algorithm as written below, over the MCP tools.
```

with:

```markdown
**`bin/claim-targets.js --run-id <id> --targets <n,n,...>`** (claim side, `bin/lib/claim-targets/claim-targets.js`
+ `bin/lib/issues/claim-store.js`) and **`bin/release-claim.js <issue> --run <run-dir> --reason <reason>`**
(release side, `bin/lib/release-claim/release.js`) are the two CLI surfaces every real consumer of
this section runs instead of hand-scripting the loop per pipeline run — `flow/claim-targets.md`'s
Step 2.8 for claiming, `wrap-up/cleanup-procedures.md` Section E for releasing. Both are thin
wrappers over the one write-path module, `claim-store.js`: it tries a **git compare-and-swap**
first — fetch the `claims-registry` tip, commit the blob on it, push with
`--force-with-lease=refs/heads/claims-registry:<expected-tip>` (a rejected push is contested —
same handling as a live claim, not a retry) — falling back to the contents-API PUT below only when
git-CAS fails for a transport reason (no git push credential — an MCP-only sandbox, for instance)
or a secondary rate limit (classified as its own distinct outcome, never folded into "contested").
The MCP transport (`gh` absent) runs the contents-API algorithm as written below, over the MCP
tools — git-CAS requires a git push credential the MCP-only case doesn't have.
```

Scan the rest of the file for any other reference to `claim-engine.js`/`bin/claims.js` (`grep -n "claim-engine\|bin/claims\.js" plugin/skills/_shared/issue-claims.md`) and update each to the surviving module names using the same substitution (`claim-engine.js` → `claim-store.js` for the read/write mechanics it describes; `bin/claims.js` → the appropriate one of `bin/claim-targets.js`/`bin/release-claim.js` depending on whether the surrounding text is about claiming or releasing).

- [ ] **Step 3: Run the prose-conformance suite**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: PASS — this suite pins `flow/claim-targets.md`'s Step 2.8 text, untouched by Step 2 above (which only edited `issue-claims.md`).

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/_shared/issue-claims.md
git commit -m "Migrate issue-claims.md's canonical-command citation off the retired claim-engine.js/bin/claims.js (#787)"
```

---

### Task 8: Final verification and Blocked/Future Work note

**Files:**
- Modify: `.claude-tweaks/pipelines/2026-08-24T065021-record-787/work/787-spec.md` (append a "Blocked / Future Work" section per `build/SKILL.md` Common Step 4)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites PASS. This is AC3 in full (both transports' existing suites migrated to the surviving core — `claim-engine.test.js` deleted per Task 4, `claim-store.test.js`/`claim-targets.test.js`/`release.test.js`/`cli.test.js`/`release-merged.test.js` all still green, plus the two new suites from Tasks 1 and 6).

- [ ] **Step 2: Re-verify AC1 and AC2 mechanically**

Run: `grep -rln "contents/claims" plugin/bin/ | wc -l`
Expected: `1` (or, if the AC's literal grep still under-matches `claim-store.js`'s `` contents/${claimPath(...)} `` template-literal construction the same way it originally missed `claim-engine.js` — see the spec's own AC1 repair note — fall back to `tests/claims-single-write-path.test.js`'s call-shape match from Task 6 as the authoritative check; note the discrepancy in this step's own commit message if the literal grep and the conformance test disagree).

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: PASS (AC2).

- [ ] **Step 3: Record the deliberately-out-of-scope follow-on**

Append to `.claude-tweaks/pipelines/2026-08-24T065021-record-787/work/787-spec.md`:

```markdown

## Blocked / Future Work

- `bin/lib/reconcile/release-merged.js`'s automated release sweep still calls
  `release-claim/release.js`'s `writeTombstone` without a `gitRunner` — it stays
  contents-API-only, deliberately, since this record's git-CAS wiring targets the two
  human/pipeline-invoked CLIs (`bin/claim-targets.js`, `bin/release-claim.js` — the surfaces
  the amendment's incident evidence, spec-702's release and record-697's read, actually named)
  rather than the background reconcile sweep. `writeTombstone`'s `gitRunner` parameter (Task 5)
  is already there for this to pick up — wiring it in is a small, low-risk follow-on worth its
  own record rather than silently expanding this one's scope late.
```

- [ ] **Step 4: Commit**

```bash
git add ".claude-tweaks/pipelines/2026-08-24T065021-record-787/work/787-spec.md"
git commit -m "Note release-merged.js's reconcile sweep as deliberately git-CAS-less for #787 (Blocked/Future Work)"
```
