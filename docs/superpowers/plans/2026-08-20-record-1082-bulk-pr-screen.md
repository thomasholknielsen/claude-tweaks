# Record #1082 — Bulk GraphQL PR screen with per-branch confirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `prune-remote.js`'s O(branches) network calls to O(1 + delete-candidates): one GraphQL screen for the whole in-scope branch set, with today's exact per-branch evidence re-run only for branches the screen nominates for deletion.

**Architecture:** New `resolvePrStatesBulk` in `pr-state.js` (chunked `ref(qualifiedName:)` aliases + `associatedPullRequests`, all-or-nothing, sharing `pickGoverningPr` — including #664's `preferOpen`); `pruneRemote` restructured to screen → provisional decision (via the unchanged `decideRemotePrune` with a documented `cherryEquivalent: true` sentinel) → cherry + per-branch confirm for delete candidates only → final decision on confirm evidence. The delete verdict is structurally unchanged: screen evidence alone can only produce skips. `repoSlugOf` moves from `release-merged.js` to the shared `hooks/git-exec.js` funnel so `pr-state.js` doesn't add a third copy of the origin-URL parse.

**Tech Stack:** Node built-ins; `gh api graphql` at runtime via an injectable runner (per the `gh-api-module-pattern` seam); `node --test`; existing test techniques (PATH wrapper irrelevant here — the bulk resolver takes an injected runner; prune-remote keeps real temp git repos + injected resolvers).

**Spec:** `.claude-tweaks/pipelines/2026-08-20T155832-spec-664-1082-1083/spec-1082/work/1082-spec.md`

## Global Constraints

- `decideRemotePrune`'s source stays byte-identical except nothing — no change at all (AC4). The sentinel relies on its existing check order (OPEN before cherry), pinned by a new test, not by editing it.
- Per-branch entry `reason` vocabulary unchanged: `pr-open`, `no-merged-pr`, `not-cherry-equivalent`, `cherry-failed`, `merged-pr-cherry-equivalent`, `delete-failed`. Screen failure is check-level only (`pr-screen-failed` / `gh-absent`).
- Every new spawn passes `windowsHide: true` (#931 regression class).
- Never any search-index-backed lookup (`--search`, GraphQL `search`).
- No partial screens: chunks issue sequentially and short-circuit on first failure; any failure fails the whole call.
- Confirm calls use the sync `resolvePrState(root, branch, { preferOpen: true })` — #664's destructive tie-break, on both screen and confirm.
- **Task 0 probe: ALREADY RUN** (2026-08-20, this session, read-only against the live repo — recorded verbatim in Task 1's header-comment step): a 50-alias `ref(qualifiedName:)` + `associatedPullRequests(first:10)` query executes with **GraphQL cost 1** and resolves **live** (a PR opened hours earlier appears; no search-index lag); an existing branch with an open PR returns that PR; a branch whose ref was deleted after its PR merged returns `ref: null` (the known, harmless-under-confirm-gating blind spot); a never-pushed name returns `null`; `main` returns `prs: []` (head-association only). Untested shapes, recorded as such with rationale: fork-headed PRs (no fork PR exists in this repo; plugin-scoped namespaces are same-repo by construction — and a divergence could only under-screen, never wrongly delete), multi-PR reused head via GraphQL (the tie-break itself is pinned by #664's unit fixtures; confirm gates any screen misread), HTTP-200-with-`errors` degraded responses (cannot be triggered on demand; the classification rule below fails closed on any incomplete response by construction). **Halt condition: not triggered** — no probed shape shows the screen missing `--head`-visible PRs, and 50 aliases is far under any complexity limit.
- Run targeted suites inside tasks only; full `npm test` runs centrally after the build.

---

### Task 1: `resolvePrStatesBulk` + shared `repoSlugOf` + probe findings header

**Files:**
- Modify: `plugin/bin/lib/hooks/git-exec.js` (add `repoSlugOf`, exported)
- Modify: `plugin/bin/lib/reconcile/release-merged.js` (replace its private `repoSlugOf` with an import from `../hooks/git-exec`; delete the local copy)
- Modify: `plugin/bin/lib/reconcile/pr-state.js` (new `resolvePrStatesBulk` export + module-header probe findings)
- Test: `tests/bin-lib/reconcile/pr-state.test.js`
- Test: `tests/bin-lib/reconcile/release-merged.test.js` (should pass unmodified — the import swap is behavior-preserving; run it to prove)

**Interfaces:**
- Consumes: `pickGoverningPr(prs, opts)` (module-internal, #664's shape — `opts.preferOpen` presence-based), `classifyExecError` (module-internal), `runGit` from `../hooks/git-exec`.
- Produces: `resolvePrStatesBulk(repoRoot, branches, opts = {}) -> Map<string, {number,state,mergedAt,updatedAt}|null> | 'gh-absent' | 'network-failure'` where `opts.preferOpen` applies the destructive tie-break per branch, `opts.runner` injects the gh runner (`(args) => stdout string`, default `execFileSync('gh', args, { encoding:'utf8', stdio:['ignore','pipe','ignore'], timeout: BULK_TIMEOUT_MS, windowsHide: true })`), and the returned Map is **complete for every requested branch** (`null` = genuinely no governing PR/ref, never "chunk missing"). Also `repoSlugOf(repoRoot) -> 'owner/repo' | null` exported from `hooks/git-exec.js`. Task 2 relies on both exactly as stated.

- [ ] **Step 1: Move `repoSlugOf` to `git-exec.js`**

Add to `plugin/bin/lib/hooks/git-exec.js` (verbatim from `release-merged.js:104-109`, plus export):

```js
// origin remote URL -> 'owner/repo' slug, or null when unparseable/absent.
// Moved here from reconcile/release-merged.js (#1082) — pr-state.js is a
// second consumer, and a third copy of this parse is how drift starts.
function repoSlugOf(repoRoot) {
  const remote = runGit(['remote', 'get-url', 'origin'], repoRoot);
  if (remote.failure || !remote.stdout) return null;
  const m = /[:/]([^/]+\/[^/]+?)(\.git)?$/.exec(remote.stdout);
  return m ? m[1] : null;
}
```

Add `repoSlugOf` to the module's exports. In `release-merged.js`, delete the local function and add `repoSlugOf` to its existing `require('../hooks/git-exec')` destructuring.

- [ ] **Step 2: Run the release-merged suite to prove the swap is invisible**

Run: `node --test tests/bin-lib/reconcile/release-merged.test.js`
Expected: PASS, zero modifications to the test file.

- [ ] **Step 3: Write the failing tests for `resolvePrStatesBulk`**

Append to `tests/bin-lib/reconcile/pr-state.test.js`. Use a fake runner capturing argv and returning canned GraphQL JSON — never a real spawn. Helper + tests:

```js
// Build a canned GraphQL response for a chunk's branches: entries maps
// alias index -> { prs: [...] } (ref exists) or null (no ref).
function graphqlResponse(entries) {
  const repository = {};
  entries.forEach((e, i) => {
    repository['b' + i] = e === null ? null : {
      name: 'x', target: { oid: 'deadbeef' },
      associatedPullRequests: { nodes: e.prs },
    };
  });
  return JSON.stringify({ data: { repository } });
}

test('resolvePrStatesBulk: complete map, tie-break parity with resolvePrState (preferOpen both ways)', () => {
  const merged = { number: 10, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const open = { number: 11, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' };
  const calls = [];
  const runner = (args) => { calls.push(args); return graphqlResponse([{ prs: [merged, open] }, { prs: [merged] }, null]); };
  const r = resolvePrStatesBulk('/tmp', ['reused', 'merged-only', 'gone'], { preferOpen: true, runner, repoSlug: 'o/r' });
  assert.equal(calls.length, 1);
  assert.equal(r.get('reused').number, 11);        // preferOpen: OPEN governs
  assert.equal(r.get('merged-only').number, 10);   // MERGED wins with no OPEN
  assert.equal(r.get('gone'), null);               // deleted/never-pushed ref -> null, still present in map
  assert.equal(r.size, 3);
});

test('resolvePrStatesBulk: default tie-break (no preferOpen) matches resolvePrState — MERGED wins over newer OPEN', () => {
  const merged = { number: 10, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const open = { number: 11, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' };
  const runner = () => graphqlResponse([{ prs: [merged, open] }]);
  const r = resolvePrStatesBulk('/tmp', ['reused'], { runner, repoSlug: 'o/r' });
  assert.equal(r.get('reused').number, 10);
});

test('resolvePrStatesBulk: chunking at 50 with sequential short-circuit on chunk failure', () => {
  const branches = Array.from({ length: 120 }, (_, i) => 'br-' + i);
  let call = 0;
  const runner = (args) => {
    call += 1;
    if (call === 2) { const e = new Error('boom'); e.code = 'ETIMEDOUT'; throw e; }
    return graphqlResponse(Array.from({ length: 50 }, () => null));
  };
  const r = resolvePrStatesBulk('/tmp', branches, { runner, repoSlug: 'o/r' });
  assert.equal(r, 'network-failure');
  assert.equal(call, 2); // chunk 3 never issued — short-circuit
});

test('resolvePrStatesBulk: degraded responses classify network-failure; missing gh classifies gh-absent; empty set spawns nothing', () => {
  const errResp = JSON.stringify({ data: { repository: { b0: null } }, errors: [{ message: 'partial' }] });
  assert.equal(resolvePrStatesBulk('/tmp', ['a'], { runner: () => errResp, repoSlug: 'o/r' }), 'network-failure');
  assert.equal(resolvePrStatesBulk('/tmp', ['a'], { runner: () => 'not json', repoSlug: 'o/r' }), 'network-failure');
  const enoent = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };
  assert.equal(resolvePrStatesBulk('/tmp', ['a'], { runner: enoent, repoSlug: 'o/r' }), 'gh-absent');
  let spawned = 0;
  assert.equal(resolvePrStatesBulk('/tmp', [], { runner: () => { spawned += 1; return '{}'; }, repoSlug: 'o/r' }).size, 0);
  assert.equal(spawned, 0);
});

test('resolvePrStatesBulk: unresolvable repo slug classifies network-failure (fail closed, no spawn)', () => {
  let spawned = 0;
  const r = resolvePrStatesBulk('/tmp/definitely-not-a-repo-xyz', ['a'], { runner: () => { spawned += 1; return '{}'; } });
  assert.equal(r, 'network-failure');
  assert.equal(spawned, 0);
});
```

- [ ] **Step 4: Run tests to verify the new ones fail**

Run: `node --test tests/bin-lib/reconcile/pr-state.test.js`
Expected: every new `resolvePrStatesBulk` test FAILS (`resolvePrStatesBulk is not a function`); pre-existing tests pass.

- [ ] **Step 5: Implement `resolvePrStatesBulk` + header findings**

In `plugin/bin/lib/reconcile/pr-state.js`:

```js
const { runGit, repoSlugOf } = require('../hooks/git-exec');

const BULK_TIMEOUT_MS = 15000; // one chunked call covers many branches — roomier than FETCH_TIMEOUT_MS's per-branch 5s
const BULK_CHUNK = 50; // probe-validated 2026-08-20: a 50-alias chunk costs 1 GraphQL rate-limit point (see header)

// branches chunk -> one aliased GraphQL query string. Branch names are
// JSON-escaped into the alias arguments (they come from for-each-ref, but
// escape anyway); owner/name travel as typed variables, never placeholders.
function buildBulkQuery(branches) {
  const fields = branches
    .map((b, i) => `b${i}: ref(qualifiedName:${JSON.stringify('refs/heads/' + b)}){ associatedPullRequests(first:10){ nodes{ number state mergedAt updatedAt } } }`)
    .join('\n    ');
  return `query($owner:String!,$name:String!){\n  repository(owner:$owner,name:$name){\n    ${fields}\n  }\n}`;
}

function defaultBulkRunner(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: BULK_TIMEOUT_MS, windowsHide: true });
}

// The bulk screen (#1082): every requested branch's governing PR in
// ceil(N/50) GraphQL round trips instead of N REST calls. ALL-OR-NOTHING:
// chunks issue sequentially and short-circuit on the first failure; any
// transport failure, HTTP-200-with-errors, or unparseable/incomplete
// response fails the WHOLE call ('network-failure') — a partial map would
// make a missing chunk's branches indistinguishable from no-PR branches.
// A returned Map is complete for every requested branch; null means
// genuinely no governing PR/ref (including a ref deleted after merge —
// the probe-confirmed blind spot callers gate with per-branch confirms).
function resolvePrStatesBulk(repoRoot, branches, opts = {}) {
  const runner = opts.runner || defaultBulkRunner;
  const map = new Map();
  if (!Array.isArray(branches) || branches.length === 0) return map;
  const slug = opts.repoSlug || repoSlugOf(repoRoot);
  if (!slug) return 'network-failure'; // no resolvable origin — fail closed, spawn nothing
  const [owner, name] = slug.split('/');
  for (let at = 0; at < branches.length; at += BULK_CHUNK) {
    const chunk = branches.slice(at, at + BULK_CHUNK);
    let parsed;
    try {
      const stdout = runner(['api', 'graphql', '-F', `owner=${owner}`, '-F', `name=${name}`, '-f', 'query=' + buildBulkQuery(chunk)]);
      parsed = JSON.parse(stdout);
    } catch (e) {
      return classifyExecError(e);
    }
    const repo = parsed && parsed.data && parsed.data.repository;
    if (!repo || Array.isArray(parsed.errors) && parsed.errors.length > 0) return 'network-failure';
    for (let i = 0; i < chunk.length; i += 1) {
      const key = 'b' + i;
      if (!(key in repo)) return 'network-failure'; // incomplete alias set — never a silent null
      const node = repo[key];
      const prs = node && node.associatedPullRequests && node.associatedPullRequests.nodes;
      map.set(chunk[i], node === null ? null : pickGoverningPr(prs, opts));
    }
  }
  return map;
}
```

Note `classifyExecError` already maps ENOENT → `'gh-absent'`, everything else → `'network-failure'` — reuse, no new copy. Add `resolvePrStatesBulk` and `BULK_CHUNK` to `module.exports` (keep existing exports).

**Module-header probe findings** — append to the header comment block at the top of `pr-state.js`:

```js
// Bulk-screen probe findings (2026-08-20, live repo, read-only — #1082 Task 0):
// a 50-alias ref(qualifiedName)+associatedPullRequests query costs 1 GraphQL
// rate-limit point and resolves LIVE (a PR opened hours earlier appears — no
// search-index lag). ref() returns null for a branch deleted after its PR
// merged and for never-pushed names — so a null screen entry can hide real
// PR history; callers gate every destructive verdict on a per-branch confirm
// (resolvePrState) for exactly this reason. Untested: fork-headed PRs (none
// exist here; a divergence could only under-screen, never wrongly delete)
// and degraded 200-with-errors responses (classification fails closed on any
// incomplete response by construction).
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/pr-state.test.js`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add plugin/bin/lib/hooks/git-exec.js plugin/bin/lib/reconcile/release-merged.js plugin/bin/lib/reconcile/pr-state.js tests/bin-lib/reconcile/pr-state.test.js
git commit -m "Add resolvePrStatesBulk chunked GraphQL screen; share repoSlugOf via git-exec (refs #1082)"
```

---

### Task 2: `pruneRemote` screen-then-confirm restructure

**Files:**
- Modify: `plugin/bin/lib/reconcile/prune-remote.js` (the per-branch loop, ~lines 100-118)
- Test: `tests/bin-lib/reconcile/prune-remote.test.js`

**Interfaces:**
- Consumes: Task 1's `resolvePrStatesBulk(repoRoot, branches, { preferOpen: true, ... })` contract; existing `isCherryEquivalent`, `decideRemotePrune`, `resolvePrState(root, branch, { preferOpen: true })`.
- Produces: `pruneRemote({ cwd, integration, dryRun, resolvePr, resolvePrBulk, skipFetch, refExists })` — one new optional injection `resolvePrBulk`, defaulted to `resolvePrStatesBulk`. (#1083 reuses this exact parameter name.)

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/reconcile/prune-remote.test.js` (reuse `makeRepoWithOrigin`, `git`, `fs`, `path`; model fixtures on the existing squash-merge shape):

```js
// Shared fixture: one in-scope, cherry-equivalent remote branch (squash-merge shape).
function buildScreenFixture() {
  const dir = makeRepoWithOrigin();
  git(dir, 'checkout', '-b', 'build/screened');
  fs.writeFileSync(path.join(dir, 's.txt'), 's\n');
  git(dir, 'add', 's.txt');
  git(dir, 'commit', '-m', 'change');
  git(dir, 'push', 'origin', 'build/screened');
  git(dir, 'checkout', 'main');
  git(dir, 'cherry-pick', 'build/screened');
  git(dir, 'branch', '-D', 'build/screened');
  return dir;
}
const MERGED_PR = { number: 20, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const OPEN_PR = { number: 21, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' };

test('screen-then-confirm: zero candidates -> one bulk call, zero per-branch resolver calls, screen-sourced reasons', () => {
  const dir = buildScreenFixture();
  let bulkCalls = 0; let confirmCalls = 0;
  const resolvePrBulk = (root, branches, opts) => {
    bulkCalls += 1;
    assert.deepEqual(branches, ['build/screened']);
    assert.equal(opts && opts.preferOpen, true);
    return new Map([['build/screened', OPEN_PR]]);
  };
  const resolvePr = () => { confirmCalls += 1; return null; };
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr, resolvePrBulk, skipFetch: true });
  assert.equal(r.failure, null);
  assert.equal(bulkCalls, 1);
  assert.equal(confirmCalls, 0); // screen-skip is terminal — confirm never called
  const entry = r.entries.find((e) => e.name === 'build/screened');
  assert.equal(entry.action, 'skip');
  assert.equal(entry.reason, 'pr-open');
});

test('screen-then-confirm: screen-null branch skips no-merged-pr without cherry or confirm', () => {
  const dir = buildScreenFixture();
  let confirmCalls = 0;
  const resolvePrBulk = () => new Map([['build/screened', null]]);
  const resolvePr = () => { confirmCalls += 1; return MERGED_PR; };
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr, resolvePrBulk, skipFetch: true });
  assert.equal(confirmCalls, 0);
  const entry = r.entries.find((e) => e.name === 'build/screened');
  assert.equal(entry.reason, 'no-merged-pr');
});

test('screen-then-confirm: screen-MERGED candidate confirms per-branch; confirm disagreement -> skip, ref survives', () => {
  const dir = buildScreenFixture();
  const resolvePrBulk = () => new Map([['build/screened', MERGED_PR]]);
  const seenConfirmOpts = [];
  const resolvePr = (root, branch, opts) => { seenConfirmOpts.push(opts); return OPEN_PR; }; // confirm sees a newer OPEN PR
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr, resolvePrBulk, skipFetch: true });
  assert.deepEqual(seenConfirmOpts, [{ preferOpen: true }]);
  const entry = r.entries.find((e) => e.name === 'build/screened');
  assert.equal(entry.action, 'skip');
  assert.equal(entry.reason, 'pr-open');
  assert.match(git(dir, 'ls-remote', '--heads', 'origin', 'build/screened'), /refs\/heads\/build\/screened/);
});

test('screen-then-confirm: confirmed MERGED candidate still deletes; dry-run still confirms and reports final reason', () => {
  const dir = buildScreenFixture();
  let confirmCalls = 0;
  const resolvePrBulk = () => new Map([['build/screened', MERGED_PR]]);
  const resolvePr = () => { confirmCalls += 1; return MERGED_PR; };
  const dry = pruneRemote({ cwd: dir, integration: 'main', dryRun: true, resolvePr, resolvePrBulk, skipFetch: true });
  assert.equal(confirmCalls, 1); // dry-run still confirms
  assert.equal(dry.entries.find((e) => e.name === 'build/screened').reason, 'merged-pr-cherry-equivalent');
  assert.match(git(dir, 'ls-remote', '--heads', 'origin', 'build/screened'), /refs\/heads\/build\/screened/); // dry-run deleted nothing
  const real = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr, resolvePrBulk, skipFetch: true });
  assert.equal(real.entries.find((e) => e.name === 'build/screened').action, 'delete');
  assert.equal(git(dir, 'ls-remote', '--heads', 'origin', 'build/screened').trim(), '');
});

test('screen-then-confirm: per-candidate confirm failure skips that branch, pass completes', () => {
  const dir = buildScreenFixture();
  const resolvePrBulk = () => new Map([['build/screened', MERGED_PR]]);
  const resolvePr = () => 'network-failure';
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr, resolvePrBulk, skipFetch: true });
  assert.equal(r.failure, null);
  assert.equal(r.entries.find((e) => e.name === 'build/screened').reason, 'network-failure');
});

test('screen failure is check-level and fail-closed: network -> pr-screen-failed, gh-absent -> gh-absent', () => {
  const dir = buildScreenFixture();
  let confirmCalls = 0;
  const resolvePr = () => { confirmCalls += 1; return MERGED_PR; };
  const net = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr, resolvePrBulk: () => 'network-failure', skipFetch: true });
  assert.deepEqual(net, { entries: [], failure: 'pr-screen-failed' });
  const absent = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr, resolvePrBulk: () => 'gh-absent', skipFetch: true });
  assert.deepEqual(absent, { entries: [], failure: 'gh-absent' });
  assert.equal(confirmCalls, 0);
  assert.match(git(dir, 'ls-remote', '--heads', 'origin', 'build/screened'), /refs\/heads\/build\/screened/);
});

test('decideRemotePrune order pin: OPEN prState -> pr-open regardless of cherryEquivalent value (sentinel safety)', () => {
  assert.strictEqual(decideRemotePrune({ branch: 'x', cherryEquivalent: true, prState: { number: 1, state: 'OPEN' } }).reason, 'pr-open');
  assert.strictEqual(decideRemotePrune({ branch: 'x', cherryEquivalent: false, prState: { number: 1, state: 'OPEN' } }).reason, 'pr-open');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: the order-pin test PASSES already (it pins existing behavior); every screen-then-confirm test FAILS — `pruneRemote` ignores `resolvePrBulk` today, so bulk/confirm call-count and reason assertions miss (e.g. `confirmCalls` is 1 where 0 is expected, screen fixtures fall through to the per-branch path).

- [ ] **Step 3: Restructure the loop**

In `plugin/bin/lib/reconcile/prune-remote.js`: import `resolvePrStatesBulk` alongside `resolvePrState`; add `resolvePrBulk` to `pruneRemote`'s destructured params with `const resolveBulk = resolvePrBulk || resolvePrStatesBulk;`. Replace the per-branch loop body:

```js
  // Collect the in-scope branch set first — the screen is one bulk call.
  const inScopeBranches = [];
  for (const branch of refs.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
    if (branch === 'HEAD' || branch === integration) continue;
    if (!inScope(branch, worktrees)) continue;
    inScopeBranches.push(branch);
  }

  // Screen (#1082): one chunked GraphQL call for the whole set, destructive
  // tie-break applied (#664 — any OPEN PR governs). ALL-OR-NOTHING: a failed
  // screen skips the whole check, same fail-closed shape as fetch-failed.
  const screen = inScopeBranches.length > 0
    ? resolveBulk(root, inScopeBranches, { preferOpen: true })
    : new Map();
  if (screen === 'gh-absent') return { entries, failure: 'gh-absent' };
  if (screen === 'network-failure') return { entries, failure: 'pr-screen-failed' };

  const toDelete = [];
  for (const branch of inScopeBranches) {
    // Provisional verdict on screen evidence, through the UNCHANGED decision
    // table. cherryEquivalent: true is a documented sentinel — safe because
    // decideRemotePrune checks OPEN before cherry (order pinned by test) and
    // cherry only gates the delete direction, which never happens without
    // the per-branch confirm below. Screen evidence alone can only skip.
    const provisional = decideRemotePrune({ branch, cherryEquivalent: true, prState: screen.get(branch) || null });
    if (provisional.action === 'skip') {
      entries.push({ name: branch, kind: 'remote-branch', action: 'skip', reason: provisional.reason });
      continue;
    }
    // Candidate (screen said MERGED): today's exact per-branch evidence.
    const cherryEquivalent = isCherryEquivalent(root, integration, `origin/${branch}`);
    if (cherryEquivalent === null) {
      entries.push({ name: branch, kind: 'remote-branch', action: 'skip', reason: 'cherry-failed' });
      continue;
    }
    // Confirm runs under dryRun too — reported reasons are confirmed reasons.
    const prState = resolve(root, branch, { preferOpen: true });
    const decision = decideRemotePrune({ branch, cherryEquivalent, prState });
    if (decision.action === 'skip' || dryRun) {
      entries.push({ name: branch, kind: 'remote-branch', action: decision.action, reason: decision.reason });
      continue;
    }
    toDelete.push({ branch, reason: decision.reason });
  }
```

Everything after (`toDelete.length === 0` early return, batched push, fallback, `refExists`) stays untouched. Update the module header's evidence-order paragraph to describe screen-then-confirm (one sentence — keep the existing BOTH-signals delete bar prose).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`

**Pre-existing-test adaptation (required, do it in this same step):** the pre-existing `pruneRemote` tests inject `resolvePr` only. After Step 3, their screen falls to the default `resolvePrStatesBulk`, whose `repoSlugOf` returns null against the fixtures' file-path `origin` remotes — the whole check would skip as `'network-failure'` and those tests would break (and must never spawn real `gh` either). Update each pre-existing `pruneRemote(...)` call in the test file to also pass a permissive screen fake:

```js
const permissiveScreen = (root, branches) => new Map(branches.map((b) => [b, { number: 99, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }]));
// each existing call gains: resolvePrBulk: permissiveScreen
```

This routes every branch down the candidate path so their injected `resolvePr` fakes keep governing exactly as before. This is the one sanctioned modification to existing tests — the spec's AC allows modification "where they exercise the changed evidence path directly," which after this restructure is all of them.

Expected after that update: PASS (all).

- [ ] **Step 5: Run the sibling consumer suites**

Run: `node --test tests/bin-lib/reconcile/reap-merged.test.js tests/bin-lib/reconcile/archive-merged.test.js tests/bin-lib/reconcile/release-merged.test.js tests/bin-lib/reconcile/archive-branches.test.js tests/reconcile.test.js`
Expected: PASS with zero modifications (their modules never call `pruneRemote`; `tests/reconcile.test.js` covers the orchestrator seam — if it drives `pruneRemote` against a fixture repo without injecting `resolvePrBulk`, apply the same permissive-screen fake there and note it in the report).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/reconcile/prune-remote.js tests/bin-lib/reconcile/prune-remote.test.js
git commit -m "Restructure pruneRemote to screen-then-confirm via resolvePrStatesBulk (refs #1082)"
```
