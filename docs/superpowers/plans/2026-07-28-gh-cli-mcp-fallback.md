# GitHub Write Transport Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `tidy`'s GitHub-triage digest, `dispatch`'s claim lock, and the four health skills' durable cursor writes work in a Claude Code cloud Routine sandbox (no `gh` CLI, GitHub MCP tools only) without changing behavior at all when `gh` is present (local/interactive sessions).

**Architecture:** Every GitHub-write call site branches on a single capability probe (`gh` on PATH?). Where `gh` is present, existing behavior is untouched byte-for-byte. Where it's absent: plain CRUD (list/create/edit/comment/close) gets a direct MCP-tool sibling; the two compare-and-set mechanisms (dispatch's claim lock, health-state's cursor CAS) are reimplemented against `create_or_update_file`'s sha-gated write semantics, which is the same atomicity guarantee (create-fails-if-exists, update-fails-if-sha-stale) one level down from git's ref-level CAS. MCP tool calls can only happen in the LLM's own turn, never inside a spawned Node subprocess — so `durable-state.js` (which currently shells out to `gh` directly) gets restructured to stop short of the actual write and hand a description of the pending write back to its caller, rather than trying to call MCP tools from inside Node.

**Tech Stack:** Node.js (`node --test`), Bash (skill procedures), GitHub CLI (`gh`), GitHub MCP tools (`create_or_update_file`, `issue_write`, `list_issues`, `add_issue_comment`, and related — exact parameter schemas confirmed against the live tool definitions during Task 8, not assumed here).

## Global Constraints

- Every gh-CLI-path behavior must remain byte-for-byte unchanged — this is a behavior-preserving addition, not a rewrite. Every existing test in `bin/lib/issues/tests/claims.test.js` and `bin/lib/health-core/tests/durable-state.test.js` must keep passing unmodified.
- No new runtime npm dependencies (matches `local-store.js`'s documented zero-dependency convention).
- `npm test` must stay fully green after every task.
- Detection is capability-based (`gh --version` succeeds), never environment-variable-based (no `CLAUDE_CODE_REMOTE` sniffing) — a future environment where `gh` happens to be installed must transparently keep using it.
- Follow this repo's own git-discipline conventions: work happens in the already-created worktree at `.claude/worktrees/gh-cli-mcp-fallback` (branch `worktree-gh-cli-mcp-fallback`); commit after each task.

---

### Task 1: `claims.js` — backend-neutral claim/release payloads

**Files:**
- Modify: `bin/lib/issues/claims.js`
- Modify: `bin/lib/issues/tests/claims.test.js`

**Interfaces:**
- Produces: `claimPayload(...)` now returns `{ ref, sha, owner, repo, claimPath, fileContent, commentBody }` (was `{ ref, refArgs, commentBody }`). `releasePayload(...)` now returns `{ ref, owner, repo, claimPath, tombstoneContent, commentBody }` (was `{ ref, refDeleteArgs, commentBody }`). New exports: `CLAIMS_BRANCH` (string, `'claims-registry'`), `claimFilePath(issueNumber)` (string, `claims/issue-${issueNumber}.json`). `parseClaimMarker`, `isStale`, `claimStatus`, `claimRef`, `DEFAULT_TTL_HOURS` are unchanged.
- Consumes: nothing from other tasks — this task is self-contained.

**Rationale for the shape change:** `refArgs`/`refDeleteArgs` baked in `gh api`'s own argv shape, which only the gh-CLI path can use. `ref` alone (already returned) is sufficient for a consumer to build the gh-CLI call inline (`repos/{owner}/{repo}/git/refs -f ref=${ref} -f sha=${sha}` — a two-line bash construction, not worth a dedicated return field). The new `claimPath`/`fileContent`/`tombstoneContent` fields are what the MCP path needs: a file path under a dedicated `claims-registry` branch (kept separate from `health-state` so the two independent CAS domains — issue claims, health cursors — never share a retry/collision window), and the JSON content to write.

- [ ] **Step 1: Write the failing tests for the new payload shape**

Replace the two shape-asserting tests in `bin/lib/issues/tests/claims.test.js` (currently `'claimPayload builds gh api args for atomic ref creation'` at line 18 and `'releasePayload builds DELETE args and a release marker'` at line 47) with:

```javascript
test('claimPayload builds ref, gh-path fields, and MCP-path fields', () => {
  const p = claimPayload({ issueNumber: 123, sha: 'abc123', runId: 'run-1', sessionId: 'sess-1', now: T0 });
  assert.strictEqual(p.ref, 'refs/claims/issue-123');
  assert.strictEqual(p.sha, 'abc123');
  assert.strictEqual(p.owner, '{owner}');
  assert.strictEqual(p.repo, '{repo}');
  assert.strictEqual(p.claimPath, 'claims/issue-123.json');
  assert.deepStrictEqual(JSON.parse(p.fileContent), {
    runId: 'run-1', sessionId: 'sess-1', claimedAt: new Date(T0).toISOString(), ttlHours: DEFAULT_TTL_HOURS, host: '',
  });
});

test('claimFilePath formats the claims-registry-branch file path', () => {
  assert.strictEqual(claimFilePath(123), 'claims/issue-123.json');
});

test('CLAIMS_BRANCH is a dedicated branch, distinct from the health-state branch', () => {
  assert.strictEqual(CLAIMS_BRANCH, 'claims-registry');
});

test('releasePayload builds ref, gh-path fields, and MCP-path tombstone fields', () => {
  const p = releasePayload({ issueNumber: 123, runId: 'run-1', reason: 'merged: spec 12', now: T0 });
  assert.strictEqual(p.ref, 'refs/claims/issue-123');
  assert.strictEqual(p.owner, '{owner}');
  assert.strictEqual(p.repo, '{repo}');
  assert.strictEqual(p.claimPath, 'claims/issue-123.json');
  const tombstone = JSON.parse(p.tombstoneContent);
  assert.strictEqual(tombstone.released, true);
  assert.strictEqual(tombstone.runId, 'run-1');
  assert.strictEqual(tombstone.reason, 'merged: spec 12');
  const m = parseClaimMarker(p.commentBody);
  assert.strictEqual(m.kind, 'release');
  assert.strictEqual(m.reason, 'merged: spec 12');
  assert.strictEqual(m.releasedAt, new Date(T0).toISOString());
});
```

Add `CLAIMS_BRANCH, claimFilePath` to the destructured `require('../claims')` at the top of the file (alongside the existing `DEFAULT_TTL_HOURS, claimRef, claimPayload, releasePayload, parseClaimMarker`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bin/lib/issues && node --test tests/claims.test.js`
Expected: FAIL — `claimFilePath is not defined` / `CLAIMS_BRANCH is not defined` / `p.claimPath` is `undefined`.

- [ ] **Step 3: Implement the new payload shape**

In `bin/lib/issues/claims.js`, add after `DEFAULT_TTL_HOURS`:

```javascript
const CLAIMS_BRANCH = 'claims-registry';
```

Add after `claimRef`:

```javascript
function claimFilePath(issueNumber) {
  return `claims/issue-${issueNumber}.json`;
}
```

Replace `claimPayload` (the whole function) with:

```javascript
// opts: { issueNumber, sha, runId, sessionId, ttlHours?, host?, owner?, repo?, note?, now }
// owner/repo default to gh's {owner}/{repo} placeholders (auto-filled from the current repo).
// Returns { ref, sha, owner, repo, claimPath, fileContent, commentBody }.
// gh-CLI path: `gh api "repos/${owner}/${repo}/git/refs" -f "ref=${ref}" -f "sha=${sha}"`
//   (201 = claimed, 422 = contested).
// MCP path: create_or_update_file(owner, repo, claimPath, fileContent, branch: CLAIMS_BRANCH)
//   with no `sha` argument (create-only) — a file-already-exists rejection = contested,
//   the same 201/422 shape one level down. CLAIMS_BRANCH auto-creates on first write.
function claimPayload({ issueNumber, sha, runId, sessionId, ttlHours = DEFAULT_TTL_HOURS, host = '', owner = '{owner}', repo = '{repo}', note, now }) {
  const claimedAt = new Date(now).toISOString();
  const ref = claimRef(issueNumber);
  const marker = { runId, sessionId, claimedAt, ttlHours, host };
  const humanLines = [`Claimed by claude-tweaks run ${runId} at ${claimedAt} (TTL ${ttlHours}h).`];
  if (note) humanLines.push(note);
  return {
    ref,
    sha,
    owner,
    repo,
    claimPath: claimFilePath(issueNumber),
    fileContent: JSON.stringify(marker, null, 2),
    commentBody: `<!-- agent-claim: ${JSON.stringify(marker)} -->\n${humanLines.join('\n')}`,
  };
}
```

Replace `releasePayload` (the whole function) with:

```javascript
// opts: { issueNumber, runId, reason, link?, owner?, repo?, now }
// Returns { ref, owner, repo, claimPath, tombstoneContent, commentBody }.
// gh-CLI path: `gh api -X DELETE "repos/${owner}/${repo}/git/${ref}"`.
// MCP path: create_or_update_file(owner, repo, claimPath, tombstoneContent, branch:
//   CLAIMS_BRANCH, sha: <current file's sha, fetched first>) — overwrites with a tombstone
//   rather than deleting, since a delete-file MCP tool isn't confirmed to exist. A sha
//   mismatch here means someone else already broke/re-claimed — treat as a release race,
//   not this run's problem (mirrors the gh-path's own "release fails -> log, TTL is the
//   backstop" posture).
function releasePayload({ issueNumber, runId, reason, link, owner = '{owner}', repo = '{repo}', now }) {
  const releasedAt = new Date(now).toISOString();
  const ref = claimRef(issueNumber);
  const marker = link ? { runId, reason, releasedAt, link } : { runId, reason, releasedAt };
  const human = `Released by run ${runId}: ${reason}.` + (link ? ` See ${link}.` : '');
  return {
    ref,
    owner,
    repo,
    claimPath: claimFilePath(issueNumber),
    tombstoneContent: JSON.stringify({ released: true, ...marker }, null, 2),
    commentBody: `<!-- agent-claim-release: ${JSON.stringify(marker)} -->\n${human}`,
  };
}
```

Update the final `module.exports` line to:

```javascript
module.exports = {
  DEFAULT_TTL_HOURS, CLAIMS_BRANCH, claimRef, claimFilePath, claimPayload, releasePayload,
  parseClaimMarker, isStale, claimStatus,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bin/lib/issues && node --test tests/claims.test.js`
Expected: PASS, all tests (the two new ones plus every pre-existing test — `parseClaimMarker`, `claimStatus`, `isStale`, etc. — untouched by this change and must still pass unmodified).

- [ ] **Step 5: Run the full suite to confirm no other module broke**

Run: `npm test 2>&1 | tail -30`
Expected: PASS. (No other module currently imports `refArgs`/`refDeleteArgs` from `claims.js` in code — only skill markdown prose does, which Task 5/6 update separately — so this should be clean.)

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/claims.js bin/lib/issues/tests/claims.test.js
git commit -m "Rework claims.js payloads to carry MCP-path fields alongside gh-path ones"
```

---

### Task 2: `durable-state.js` — signal a pending write instead of failing when `gh` is unavailable

**Files:**
- Modify: `bin/lib/health-core/durable-state.js`
- Modify: `bin/lib/health-core/tests/durable-state.test.js`
- Modify: `bin/lib/health-core/retry-cli.js`
- Modify: `bin/code-health.js`
- Modify: `bin/harness-health.js`
- Modify: `bin/journey-health.js`
- Modify: `bin/docs-health.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `writeState(root, mutatorFn)` gains a new possible return shape: `{ ok: false, needsMcpWrite: true, branch: 'health-state', files: [{ path, content }] }` (only when `gh` is unavailable — unchanged otherwise). `createDurableState(skillName, opts)` gains an optional injectable `hasGh` (function, `() => boolean`, default probes `gh --version` via the existing `run`). Every call site that already checks `result.ok` gets a preceding `result.needsMcpWrite` check.

**Rationale:** MCP tools can only be invoked from the LLM's own turn, never from a spawned Node subprocess — so `writeState` cannot itself perform the MCP write. When `gh` is present, `writeState` behaves exactly as today (unchanged code path). When absent, it stops immediately after computing what *would* be written (reusing the existing `buildFiles` — no new computation logic, no CAS retry loop attempted internally, since the retry loop for the MCP path is driven externally by Task 3's shared fragment) and returns that description instead of calling `gh`. Read logic (`readState`, `readFilesAtFetchedTip`, `currentCommitSha`, `currentRefShas`) is completely untouched — it was always `gh`-free.

- [ ] **Step 1: Write the failing tests for gh-absent behavior**

Add to `bin/lib/health-core/tests/durable-state.test.js`, near the existing `writeState` tests:

```javascript
test('writeState signals needsMcpWrite instead of calling gh when gh is unavailable, without ever calling gh', () => {
  const { run, calls } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'commit-sha-1\ntree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true, hasGh: () => false });
  const result = ds.writeState('/repo', (current) => ({ ...current, cursors: { '.': { lastSweptMs: 2 } } }));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.needsMcpWrite, true);
  assert.strictEqual(result.branch, HEALTH_STATE_BRANCH);
  const paths = result.files.map((f) => f.path).sort();
  assert.deepStrictEqual(paths, ['code-health/cursors.json', 'code-health/remembered.json', 'code-health/retry-queue.json', 'code-health/runs.json']);
  const cursorsFile = result.files.find((f) => f.path === 'code-health/cursors.json');
  assert.deepStrictEqual(JSON.parse(cursorsFile.content), { '.': { lastSweptMs: 2 } });
  assert.ok(!calls.some((c) => c.cmd === 'gh'), 'must never shell out to gh when gh is unavailable');
});

test('writeState still calls gh normally (unchanged) when hasGh returns true (the default)', () => {
  const { run, calls } = fakeRunner([
    ...baseWriteStateRules(),
    refUpdateRule({ returns: '' }),
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true, hasGh: () => true });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  assert.ok(calls.some((c) => c.cmd === 'gh'), 'sanity check: the gh path was actually exercised');
});

test('writeState signals needsMcpWrite (not a throw) on a genuine first-ever run when gh is unavailable — the branch does not exist on the remote yet, so the fetch itself fails', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), throws: "couldn't find remote ref health-state" },
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true, hasGh: () => false });
  let result;
  assert.doesNotThrow(() => {
    result = ds.writeState('/repo', (current) => ({ ...current, cursors: { '.': { lastSweptMs: 1 } } }));
  }, 'a first-ever-run fetch failure must not throw out of writeState, same as the gh path\'s own contract');
  assert.strictEqual(result.needsMcpWrite, true);
  const cursorsFile = result.files.find((f) => f.path === 'code-health/cursors.json');
  assert.deepStrictEqual(JSON.parse(cursorsFile.content), { '.': { lastSweptMs: 1 } }, 'mutator must still run against the degraded-empty defaults, same as readState would produce');
});

test('default hasGh probes `gh --version` via the injected run function', () => {
  const seenProbe = [];
  const { run } = fakeRunner([
    {
      match: (cmd, args) => cmd === 'gh' && matchArgs(args, '--version'),
      returns: () => { seenProbe.push(true); throw new Error('gh: command not found'); },
    },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'commit-sha-1\ntree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
  ]);
  const ds = createDurableState('code-health', { run, sleep: () => {}, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.strictEqual(result.needsMcpWrite, true);
  assert.strictEqual(seenProbe.length > 0, true, 'default hasGh must have actually probed gh via run()');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bin/lib/health-core && node --test tests/durable-state.test.js`
Expected: FAIL — `result.needsMcpWrite` is `undefined` (writeState today always attempts the gh path regardless of `hasGh`, since that option doesn't exist yet).

- [ ] **Step 3: Implement the gh-detection + early-exit in `writeState`**

In `bin/lib/health-core/durable-state.js`, add near the top (after the existing `DEFAULT_RUN_TIMEOUT_MS`/`defaultRun` block):

```javascript
// Capability probe, not environment-classification — a future environment where gh
// happens to be installed (even a cloud sandbox with a custom setup script) must
// transparently keep using it. Injectable so tests never actually shell out.
function defaultHasGh(run) {
  return () => {
    try {
      run('gh', ['--version']);
      return true;
    } catch {
      return false;
    }
  };
}
```

Change `createDurableState`'s signature line from:

```javascript
function createDurableState(skillName, {
  run = defaultRun, sleep = defaultSleep, includeRemembered = false, includeDeclined = false,
} = {}) {
```

to:

```javascript
function createDurableState(skillName, {
  run = defaultRun, sleep = defaultSleep, includeRemembered = false, includeDeclined = false,
  hasGh = defaultHasGh(run),
} = {}) {
```

Add a new sibling function right after `buildFiles` (which it reuses) and right before `writeState` — a peer of `buildFiles`/`ensureBranch`/`writeState` within `createDurableState`'s closure, defined once per `createDurableState` call rather than re-created on every `writeState` invocation:

```javascript
  function needsMcpWrite(root, mutatorFn) {
    // No gh calls at all — not even ensureBranch's bootstrap, since
    // create_or_update_file auto-creates the target branch on first write (verified
    // live in Task 8; see _shared/health-state.md's MCP write path section). Read
    // is unaffected — git fetch/show are gh-free already.
    //
    // The fetch must not throw uncaught on a first-ever run (branch doesn't exist on
    // the remote yet) — writeState's "never throws" contract holds on this path too
    // (see the durable-state.test.js tests for the gh path's own equivalent case).
    // A failed fetch here just means readFilesAtFetchedTip's own per-file showFile
    // calls degrade to their fallback defaults below, same as readState's behavior.
    try {
      run('git', ['-C', root, 'fetch', 'origin', HEALTH_STATE_BRANCH]);
    } catch {
      // Swallowed deliberately — see comment above.
    }
    const current = readFilesAtFetchedTip(root);
    const next = mutatorFn(current);
    return { ok: false, needsMcpWrite: true, branch: HEALTH_STATE_BRANCH, files: buildFiles(next) };
  }
```

Then change `writeState`'s own body from:

```javascript
  function writeState(root, mutatorFn) {
    ensureBranch(root);
```

to:

```javascript
  function writeState(root, mutatorFn) {
    if (!hasGh()) return needsMcpWrite(root, mutatorFn);
    ensureBranch(root);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bin/lib/health-core && node --test tests/durable-state.test.js`
Expected: PASS — all new tests, and every pre-existing test (which all pass `run`/`sleep` but never `hasGh`, so they fall through to `defaultHasGh(run)` — every existing test's `run` fake already has `gh --version`-shaped calls unmatched by any of their rules; verify this doesn't break the pre-existing tests in the next sub-step).

- [ ] **Step 4b: Fix the pre-existing tests' fakeRunner scripts if `defaultHasGh`'s probe call breaks them**

Every pre-existing `writeState` test constructs its `fakeRunner` script without a `gh --version` rule, and `fakeRunner`'s no-match branch throws `` `fakeRunner: no rule matched ${cmd} ${JSON.stringify(args)}` ``. Since `defaultHasGh`'s probe calls `run('gh', ['--version'])` and none of the existing scripts have a matching rule, every pre-existing `writeState` test will now fail at the `hasGh()` probe before ever reaching its intended rules. Fix this by adding one line to `baseWriteStateRules()` (used by the majority of tests) and to the handful of tests that build their own inline rule arrays instead of using it:

In `baseWriteStateRules()`, add as the first array entry:

```javascript
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, '--version'), returns: '' },
```

For the tests that don't use `baseWriteStateRules()` (grep the test file for `fakeRunner([` where the first argument isn't `...baseWriteStateRules()`) — specifically `'writeState bootstraps the branch...'`, `'ensureBranch never throws...'`, `'writeState fetches at most once per CAS-loop attempt...'` — add the same `gh --version` rule as the first entry in each of their inline arrays.

- [ ] **Step 5: Run tests again to verify the full file passes**

Run: `cd bin/lib/health-core && node --test tests/durable-state.test.js`
Expected: PASS, every test in the file (old and new).

- [ ] **Step 6: Wire the `needsMcpWrite` signal through `retry-cli.js`'s `update` command**

In `bin/lib/health-core/retry-cli.js`, change the block starting at `if (!result.ok) {` (currently the block that writes to stderr and exits 1) to check `needsMcpWrite` first:

```javascript
    if (result.needsMcpWrite) {
      process.stdout.write(JSON.stringify({ needsMcpWrite: true, branch: result.branch, files: result.files }) + '\n');
      return;
    }
    if (!result.ok) {
```

(Leave the existing `!result.ok` block's body exactly as-is — only the new `needsMcpWrite` branch is added above it, as a sibling, not a replacement.)

- [ ] **Step 7: Wire the same signal through each of the 4 health-skill CLIs' `validate-findings` command**

In each of `bin/code-health.js` (around line 271-278), `bin/harness-health.js` (around line 236), `bin/journey-health.js` (around line 211), `bin/docs-health.js` (around line 213) — locate the `const result = writeDurableState(root, (current) => buildValidateFindingsUpdate(...` block and its following `if (!result.ok) { ... }`. Add a `needsMcpWrite` branch before it, matching the exact same pattern as Step 6:

```javascript
      if (result.needsMcpWrite) {
        process.stdout.write(JSON.stringify({ needsMcpWrite: true, branch: result.branch, files: result.files }) + '\n');
      } else if (!result.ok) {
```

(Change the existing `if (!result.ok) {` to `} else if (!result.ok) {` in each file, keeping everything inside that block unchanged — this is an `if`/`else if` chain, not two independent `if`s, since only one signal should ever be acted on per call.)

- [ ] **Step 8: Run the full test suite**

Run: `npm test 2>&1 | tail -40`
Expected: PASS, all 1660+ tests (the exact count may have grown by the new tests added in this task).

- [ ] **Step 9: Commit**

```bash
git add bin/lib/health-core/durable-state.js bin/lib/health-core/tests/durable-state.test.js bin/lib/health-core/retry-cli.js bin/code-health.js bin/harness-health.js bin/journey-health.js bin/docs-health.js
git commit -m "durable-state.js: signal a pending write instead of shelling out to gh when it's unavailable"
```

---

### Task 3: `_shared/health-state.md` — the MCP write-loop procedure, referenced by all four health skills

**Files:**
- Modify: `skills/_shared/health-state.md`
- Modify: `skills/code-health/SKILL.md`
- Modify: `skills/harness-health/SKILL.md`
- Modify: `skills/journey-health/SKILL.md`
- Modify: `skills/docs-health/SKILL.md`

**Interfaces:**
- Consumes: Task 2's `{ needsMcpWrite: true, branch, files }` JSON shape printed to stdout by `validate-findings`/`retry-queue update`.
- Produces: a documented procedure every consuming skill references identically.

- [ ] **Step 1: Add the MCP write-loop procedure to `_shared/health-state.md`**

Insert a new section immediately after the existing "## Mechanism" section's last paragraph (after the "This is impure..." paragraph, before "## Retry / dead-letter queue"):

```markdown
## MCP write path (no `gh` CLI available)

When `writeState`'s internal `hasGh()` probe finds no `gh` on PATH (a Claude Code cloud Routine
sandbox — see the companion `_shared/github-write-transport.md`), it does not attempt any
network call itself — MCP tools can only be invoked from the calling agent's own turn, never
from the spawned Node subprocess `writeState` runs in. Instead it returns
`{ ok: false, needsMcpWrite: true, branch: 'health-state', files: [{ path, content }] }`, and
each CLI command that calls it (`validate-findings`, `retry-queue update`) prints that shape
as JSON to stdout instead of its normal output.

The calling skill drives the retry loop itself, up to `MAX_CAS_ATTEMPTS` attempts
(`node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/health-core/durable-state.js').MAX_CAS_ATTEMPTS)"`):

1. Run the CLI command that produced the `needsMcpWrite` output (this attempt's fresh read
   already happened inside it).
2. Parse the JSON. If it doesn't have `needsMcpWrite: true`, the write either already
   succeeded via the gh path or failed for an unrelated reason — stop, nothing more to do
   here.
3. For each entry in `files`, resolve its current blob sha (empty/error means the file
   doesn't exist yet — omit `sha` on the write below):

   ```bash
   git -C "$ROOT" rev-parse "origin/health-state:${FILE_PATH}" 2>/dev/null
   ```

4. Call `create_or_update_file` for each file (owner/repo from the current GitHub remote,
   `branch` = the `branch` field from the JSON, `path`/`content` from that file's entry,
   `sha` = the value resolved in step 3 if the file already existed, omitted otherwise).
   `create_or_update_file` auto-creates the target branch on first write if it doesn't exist
   yet — no separate bootstrap step is needed on this path (unlike the gh path's
   `ensureBranch`).
5. If every file's write succeeds, done — report success, same as a normal `{ ok: true }`.
6. If any file's write is rejected for a sha-mismatch/already-exists reason, sleep
   `casBackoffMs(attempt)` (`node -e "console.log(require(...).casBackoffMs(${ATTEMPT}))"`,
   then actually wait that many milliseconds) and go back to step 1 — state may have changed,
   so the CLI command must be re-run from scratch, not retried with stale data.
7. If any file's write fails for a reason that is clearly not a conflict (a hard tool error —
   malformed request, an outage), stop immediately and report the failure. Do not spend
   retry attempts on a broken transport.
8. If `MAX_CAS_ATTEMPTS` is exhausted without success, report the same non-fatal outcome the
   gh path's own exhaustion already produces (see each CLI's existing "non-fatal" stderr
   message) — a lost write here just means the next firing might redo some rotation work,
   safe per the same reasoning documented in "Mechanism" above.

The exact `create_or_update_file` parameter names should be confirmed against the live tool
schema at the point this procedure is actually exercised — see `_shared/github-write-transport.md`
for the shared detection check and CRUD mapping this procedure builds on.
```

- [ ] **Step 2: Add a pointer at each of the 4 health skills' `validate-findings`/`retry-queue` call sites**

In each of `skills/code-health/SKILL.md`, `skills/harness-health/SKILL.md`, `skills/journey-health/SKILL.md`, `skills/docs-health/SKILL.md`: grep the file for the step that runs `validate-findings` (e.g. `grep -n "validate-findings" skills/code-health/SKILL.md`) and, immediately after the bash block that invokes it, add:

```markdown
If the command's output is `{"needsMcpWrite": true, ...}` instead of the normal output, follow
`_shared/health-state.md`'s "MCP write path" procedure before continuing — do not treat this as
an ordinary failure.
```

Do the same for each skill's `retry-queue update` call site (`grep -n "retry-queue update" skills/{skill}/SKILL.md`), with the same pointer sentence.

- [ ] **Step 3: Verify every pointer resolves to real content**

```bash
grep -rn "needsMcpWrite" skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md skills/docs-health/SKILL.md skills/_shared/health-state.md
```

Expected: at least 2 matches per health skill's `SKILL.md` (validate-findings + retry-queue) plus the full procedure in `health-state.md`. If any skill has fewer than 2, its call site wasn't found by the grep in Step 2 — locate it manually and add the pointer.

- [ ] **Step 4: Run the full test suite (sanity check — this task touches no code)**

Run: `npm test 2>&1 | tail -10`
Expected: PASS, unchanged from Task 2's result (markdown-only changes).

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/health-state.md skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md skills/docs-health/SKILL.md
git commit -m "Document the MCP write-loop procedure for health-state, wired to all 4 health skills"
```

---

### Task 4: `_shared/github-write-transport.md` — the shared detection check and CRUD mapping table

**Files:**
- Create: `skills/_shared/github-write-transport.md`

**Interfaces:**
- Produces: the canonical detection check and gh→MCP mapping table Tasks 5, 6, and 7 all reference.

- [ ] **Step 1: Write the new shared fragment**

```markdown
# GitHub Write Transport — gh CLI locally, GitHub MCP tools in cloud Routines

Single source of truth for choosing between `gh` CLI and GitHub MCP tools for a plain
CRUD GitHub write (list-by-label, create, edit/label, comment, close). The two hard
compare-and-set cases (dispatch's claim lock, health-state's cursor writes) don't use this
mapping directly — see `_shared/issue-claims.md` and `_shared/health-state.md` respectively,
both built on the same conditional-write pattern documented at the bottom of this file.

## Detection

`gh` present (`command -v gh` exits 0) → use it exactly as documented at each call site,
unchanged. `gh` absent → use the MCP tool from the mapping below. This is a capability
probe, not an environment classification — it holds regardless of *why* `gh` is missing.

## CRUD mapping

| Operation | gh CLI | GitHub MCP tool |
|---|---|---|
| List open issues by label | `gh issue list --label {label} --state open --json ...` | `list_issues` (filtered by label, state) — never `search_issues` for a find-by-marker/dedup lookup (see below) |
| Create an issue | `gh issue create --title ... --body ...` | `issue_write` (create mode) |
| Edit labels / body | `gh issue edit {n} --add-label/--remove-label/--body-file` | `issue_write` (update mode) |
| Comment | `gh issue comment {n} --body-file` | `add_issue_comment` |
| Close | `gh issue close {n} --reason ...` | `issue_write` (update mode, state change) |

**Never use `search_issues` (or `gh issue list --search`) for a find-by-marker/dedup lookup.**
Both ride an eventually-consistent search index — this caused three real duplicate-digest
production incidents when `tidy`'s Rolling digest briefly used `gh issue list --search`
(#1016, #1079, #1089). Always use the plain list-then-filter approach (`list_issues`/
`gh issue list`, no `--search`, then `findByMarker` in-process), on both transports.

## The conditional-write pattern (for the two CAS consumers)

Both dispatch's claim lock and health-state's cursor writes need "write this, but only if
nothing else wrote first." `gh`'s ref-level compare-and-set (atomic create, fast-forward-only
update) has no MCP equivalent — but `create_or_update_file` carries the identical guarantee
one level down, at the file-blob level: omit its `sha` parameter and the write fails if the
file already exists; supply a stale `sha` and it fails on mismatch. Both consumers use this
same primitive against a dedicated branch, gated on the same detection check above — see
`_shared/issue-claims.md` (claim lock) and `_shared/health-state.md` (cursor CAS) for each
consumer's specific procedure.
```

- [ ] **Step 2: Verify the file has no placeholder markers**

```bash
grep -iE "TBD|TODO|<!-- ambiguity:|FIXME" skills/_shared/github-write-transport.md
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/github-write-transport.md
git commit -m "Add the shared GitHub write-transport fragment (gh CLI / MCP detection + CRUD mapping)"
```

---

### Task 5: `_shared/issue-claims.md` — the MCP path for claim, release, and list

**Files:**
- Modify: `skills/_shared/issue-claims.md`

**Interfaces:**
- Consumes: Task 1's `claimPayload`/`releasePayload` new fields (`claimPath`, `fileContent`, `tombstoneContent`, `CLAIMS_BRANCH`); Task 4's detection check.

- [ ] **Step 1: Replace "The lock" section's bash block with a dual-path version**

Replace the existing fenced bash block under `## The lock` (lines 18-31 of the current file) with:

```markdown
**gh CLI path** (`gh` on PATH — see `_shared/github-write-transport.md` for the detection
check):

```bash
# Resolve a sha once per run (any valid remote sha works; ref existence is the lock):
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
SHA=$(gh api "repos/{owner}/{repo}/commits/${DEFAULT_BRANCH}" -q .sha)

# Claim (201 = claimed, HTTP 422 = already claimed by someone):
gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${ISSUE}" -f "sha=${SHA}"

# Release:
gh api -X DELETE "repos/{owner}/{repo}/git/refs/claims/issue-${ISSUE}"

# List all claims:
gh api "repos/{owner}/{repo}/git/matching-refs/claims/" -q '.[].ref'
```

**MCP path** (`gh` unavailable): claim/release payloads are generated by the same
`claimPayload`/`releasePayload` calls as always (see "The mirror" below) — the `claimPath`,
`fileContent`, and `tombstoneContent` fields they now also return are what this path uses.

```bash
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimPayload({issueNumber:Number(process.argv[1]),sha:process.argv[2],
  runId:process.argv[3],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()})))" "$ISSUE" "$SHA" "$RUN_ID" > /tmp/claim-payload-${ISSUE}.json
```

- **Claim:** call `create_or_update_file` with `path` = the payload's `claimPath`, `content` =
  `fileContent`, `branch` = `CLAIMS_BRANCH` (`claims-registry`, `node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js').CLAIMS_BRANCH)"`),
  omitting `sha` (create-only). A file-already-exists rejection = already claimed, the same
  201/422 shape one level down. The branch auto-creates on first write.
- **Release:** first resolve the claim file's current sha, then call `create_or_update_file`
  again with `content` = the payload's `tombstoneContent` and that `sha` — a sha mismatch
  means someone else already broke/re-claimed it; treat as a release race (log, TTL is the
  backstop, per the Failure posture table below).
- **List all claims:** list the contents of the `claims/` directory on the `CLAIMS_BRANCH`
  branch via the equivalent read-tree MCP tool, rather than `git/matching-refs`.
```

- [ ] **Step 2: Update "The mirror" section to note it's unaffected**

After the existing marker-shapes code block (currently ending at line 63 of the file, right before "Identity:"), add one sentence:

```markdown
This comment-marker mechanism is identical regardless of which path claimed/released the
issue — the marker content comes from the same `claimPayload`/`releasePayload` call either
way, so `claimStatus`'s reconciliation logic (below) never needs to know which path wrote it.
```

- [ ] **Step 3: Update the Failure posture table's `gh missing/unauthenticated` row**

Find the row (currently: `| gh missing/unauthenticated | Consumer's existing hard gate (auto never silences a missing dependency) |`) and replace it with:

```markdown
| `gh` missing | Use the MCP path (see "The lock" above) — no longer a hard gate |
| `gh` present but unauthenticated | Consumer's existing hard gate (auto never silences a missing dependency) |
```

- [ ] **Step 4: Verify the new content references real exports**

```bash
node -e "const c = require('./bin/lib/issues/claims.js'); console.log(typeof c.CLAIMS_BRANCH, typeof c.claimFilePath, 'claimPath' in c.claimPayload({issueNumber:1,sha:'x',runId:'r',sessionId:'s',now:Date.now()}))"
```

Expected: `string function true`.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/issue-claims.md
git commit -m "issue-claims.md: document the MCP claim/release/list path alongside gh CLI"
```

---

### Task 6: `skills/dispatch/SKILL.md` — dual-path Preflight and claim

**Files:**
- Modify: `skills/dispatch/SKILL.md`

**Interfaces:**
- Consumes: Task 4's detection check, Task 5's dual-path claim protocol.

- [ ] **Step 1: Update the Preflight paragraph that treats Detection Ladder failure as a hard gate**

Find the paragraph (currently ending: "Unlike `/tidy`/`/help`'s use of this ladder, which fails open into a skipped scan, `/claude-tweaks:dispatch` treats any ladder failure as a hard gate — this skill's entire purpose is writing GitHub state (claims, labels, merges), so there is no meaningful degraded mode to fall back into. Report the specific failing check and stop (headless self-report above still applies for the `next` form).") and replace the whole paragraph with:

```markdown
Before any `gh` command, run checks 1 and 3 of the Detection Ladder from
`_shared/github-pr-scan.md` (GitHub remote exists; `gh`, if present, is authenticated and the
repo is reachable) — these two failures still have no degraded mode (an unreachable/unauthenticated
repo means nothing here can work, on either transport) and remain a hard gate. Check 2 (`gh`
CLI installed) is no longer a hard gate on its own: per `_shared/github-write-transport.md`,
`gh` absent means every write in this skill (claim, label, comment, merge) uses the MCP path
instead — proceed normally rather than stopping. Report the specific failing check and stop
only for checks 1 or 3 (headless self-report above still applies for the `next` form).
```

- [ ] **Step 2: Replace Step 4's claim bash block with a dual-path version**

Replace the fenced bash block under `### Step 4: Claim the selected group (whole group, or none)` (currently the `DEFAULT_BRANCH`/`SHA`/`gh api .../git/refs` loop) and its immediately following "**On success (201):**" block with:

```markdown
Per `_shared/issue-claims.md`'s group-claim rule: claim **all members of the group before
starting any**. Resolve the detection check once per run, not per issue (per
`_shared/github-write-transport.md`).

**gh CLI path** (`gh` on PATH): resolve the sha once per run, then for each member of the
selected group attempt the atomic ref creation exactly as `_shared/issue-claims.md`'s "The
lock" section describes:

```bash
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
SHA=$(gh api "repos/{owner}/{repo}/commits/${DEFAULT_BRANCH}" -q .sha)
for ISSUE in "${GROUP_MEMBERS[@]}"; do
  gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${ISSUE}" -f "sha=${SHA}"
  # ... branch on the result below, per member
done
```

**MCP path** (`gh` unavailable): for each member of the selected group, generate the claim
payload and attempt the conditional-create write exactly as `_shared/issue-claims.md`'s "The
lock" section describes:

```bash
for ISSUE in "${GROUP_MEMBERS[@]}"; do
  node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
    console.log(JSON.stringify(c.claimPayload({issueNumber:Number(process.argv[1]),
    sha:process.argv[2],runId:process.argv[3],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
    host:require('os').hostname(),now:Date.now()})))" "$ISSUE" "$SHA" "$RUN_ID" > "/tmp/claim-payload-${ISSUE}.json"
  # Call create_or_update_file with path=claimPath, content=fileContent, branch=CLAIMS_BRANCH
  # from the payload above, omitting sha (create-only). A file-exists rejection means
  # already-claimed — branch on the result below, per member, same as the gh path.
done
```

**On success (claimed, either path):** bootstrap-then-add `bot:in-progress` (still a plain
label edit — `gh issue edit` or `issue_write` per the CRUD mapping in
`_shared/github-write-transport.md`), then post the claim comment (`claimPayload`'s
`commentBody`, unchanged regardless of which path claimed it):

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['bot:in-progress', 'Bot state: an agent currently holds the claim on this record']]
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(c.claimPayload({issueNumber:Number(process.argv[1]),sha:process.argv[2],
  runId:process.argv[3],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()}).commentBody)" "$ISSUE" "$SHA" "$RUN_ID" > /tmp/claim-${ISSUE}.md
# gh issue edit "$ISSUE" --add-label bot:in-progress ; gh issue comment "$ISSUE" --body-file /tmp/claim-${ISSUE}.md
# — or the MCP-tool equivalents from _shared/github-write-transport.md's CRUD mapping.
```
```

- [ ] **Step 3: Update the `--claim-only` manual-release commands to mention both paths**

Find the sentence "mirrors `_shared/issue-claims.md`'s 'The lock' → Release" (in the `--claim-only` stop point section) and the two `gh` commands right after it. Add one sentence before the bash block:

```markdown
(gh path shown below; use the MCP-path release from `_shared/issue-claims.md`'s "The lock"
section when `gh` is unavailable):
```

- [ ] **Step 4: Verify no other Preflight/Step-4 text still asserts an unconditional hard gate on check 2**

```bash
grep -n "no meaningful degraded mode\|hard gate" skills/dispatch/SKILL.md
```

Expected: no remaining reference claims check 2 (`gh` installed) alone is a hard gate — only checks 1/3 (remote/auth) should still read that way, per Step 1's edit.

- [ ] **Step 5: Run the full test suite (sanity check — this task touches no code)**

Run: `npm test 2>&1 | tail -10`
Expected: PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add skills/dispatch/SKILL.md
git commit -m "dispatch/SKILL.md: gh-absence is no longer a hard Preflight gate, dual-path claim"
```

---

### Task 7: `tidy`'s digest — dual-path CRUD

**Files:**
- Modify: `skills/tidy/github-routine-procedures.md`
- Modify: `skills/tidy/scan-procedures.md`

**Interfaces:**
- Consumes: Task 4's CRUD mapping table.

- [ ] **Step 1: Update the Rolling digest's identity/lookup bash block**

In `skills/tidy/github-routine-procedures.md`'s "## Rolling digest" section, after the existing `gh issue list --state open ...` / `findByMarker` bash block (the one ending `require('fs').writeFileSync('/tmp/tidy-digest-lookup.json', ...)`), add:

```markdown
(gh path shown above; the MCP-path equivalent per `_shared/github-write-transport.md`'s CRUD
mapping is `list_issues` for the fetch — never `search_issues`, for the same eventually-consistent-index
reason this section already avoids `gh issue list --search` — feeding the same `findByMarker`
call unchanged.)
```

- [ ] **Step 2: Update the create/close/edit-in-place bullet**

Find the bullet starting "Otherwise (`canonical` is set...)" (the one describing `gh issue close`/`gh issue edit --body-file`) and the one above it ("`null` (first-ever firing...)": `gh issue create ...`). After both bullets (before the "`work-backend: local-files`..." bullet), add:

```markdown
- MCP path (gh unavailable): `issue_write` (create mode) in place of `gh issue create`;
  `issue_write` (update mode, state change) in place of `gh issue close`; `issue_write`
  (update mode) in place of `gh issue edit --body-file` — same create-once/close-duplicates/
  edit-canonical logic either way, per `_shared/github-write-transport.md`'s CRUD mapping.
```

- [ ] **Step 3: Update Step 4.7's claims-audit listing to reference the dual-path list**

In `skills/tidy/scan-procedures.md`'s `## Step 4.7: Audit Issue Claims` section, after the existing bash block (`gh api "repos/{owner}/{repo}/git/matching-refs/claims/" ...`), add:

```markdown
(gh path shown above; use `_shared/issue-claims.md`'s MCP-path "List all claims" when `gh` is
unavailable — a directory listing of `claims/` on the `claims-registry` branch instead of
`git/matching-refs`.)
```

- [ ] **Step 4: Update the "Skip silently when `gh` is unavailable" line**

Find the sentence "Skip silently when `gh` is unavailable or the repo has no GitHub remote (pre-check, before any listing attempt)." (start of Step 4.7) and change it to:

```markdown
Skip silently when the repo has no GitHub remote (pre-check, before any listing attempt) —
`gh` being unavailable alone no longer skips this step, per `_shared/github-write-transport.md`;
use the MCP path instead.
```

- [ ] **Step 5: Run the full test suite (sanity check — this task touches no code)**

Run: `npm test 2>&1 | tail -10`
Expected: PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add skills/tidy/github-routine-procedures.md skills/tidy/scan-procedures.md
git commit -m "tidy: dual-path digest CRUD and claims-audit listing (gh CLI / MCP)"
```

---

### Task 8: Live verification and final regression

**Files:**
- None modified — this task is verification only, plus fixing anything Steps 1-2 find wrong.

**Interfaces:**
- Consumes: everything from Tasks 1-7.

- [ ] **Step 1: Verify `create_or_update_file`'s conditional-write semantics live**

In a real cloud Routine session (or any session with GitHub MCP tools connected against a scratch/test repository — never the plugin's own production repo for this test), confirm directly:

1. Calling `create_or_update_file` with no `sha` against a path that does NOT yet exist succeeds.
2. Calling it again immediately after, with the same path, no `sha`, different content, is REJECTED (not silently overwritten) — this is the create-only/compare-and-set guarantee both the claim lock and the cursor CAS depend on.
3. Calling it with the correct current `sha` succeeds and updates the content.
4. Calling it with a stale `sha` (one that doesn't match current) is REJECTED.
5. Calling it against a branch that does not exist yet succeeds and creates the branch — confirming the "no separate bootstrap needed" claim in `_shared/health-state.md`'s MCP write path section and `_shared/issue-claims.md`'s claim section.

If any of 1-5 doesn't hold as expected, stop and report back before considering this plan complete — the whole MCP-path design in Tasks 3 and 5 depends on this holding exactly as described.

- [ ] **Step 2: Verify `list_issues` does not exhibit the eventually-consistent-search problem for a fresh create**

Create a test issue via `issue_write`, immediately call `list_issues` filtered appropriately, and confirm the just-created issue appears without delay. (This confirms `list_issues` is safe to use for `findByMarker`-style lookups, unlike `search_issues`.)

- [ ] **Step 3: Run the full test suite one final time**

Run: `npm test 2>&1 | tail -40`
Expected: PASS, full suite, no regressions from Task 1 through Task 7's combined changes.

- [ ] **Step 4: Commit any fixes found in Steps 1-2**

If Step 1 or 2 revealed any incorrect assumption in the shared fragments, fix the relevant file(s) from Tasks 3-7 and commit:

```bash
git add -A
git commit -m "Fix MCP write-path assumptions found during live verification"
```

(Skip this step entirely if Steps 1-2 found nothing to fix.)
