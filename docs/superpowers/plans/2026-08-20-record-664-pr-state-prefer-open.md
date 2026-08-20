# Record #664 — pr-state destructive-caller tie-break (`preferOpen`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `prune-remote.js` — the reconcile family's one destructive consumer — see an OPEN PR on a branch even when an older MERGED PR exists for the same head, so `decideRemotePrune` skips it (`pr-open`) instead of proceeding toward a pushed deletion.

**Architecture:** Deliverables shape (a) from the spec: an opt-in `opts.preferOpen` on `resolvePrState`'s tie-break (`pickGoverningPr`), passed only by `prune-remote.js`. The three read-mostly consumers (`reap-merged.js`, `archive-merged.js`, `release-merged.js`) call `resolvePrState(root, branch)` with no options and keep byte-identical behavior. `preferOpen` is **presence-based**, not recency-based: *any* OPEN PR is a do-not-touch signal for a destructive caller (`decideRemotePrune` skips on OPEN regardless of age), so under `preferOpen` an OPEN PR governs whenever one exists, whichever side is newer. `decideRemotePrune` itself is unchanged — it already returns `pr-open` once handed an OPEN PR.

**Tech Stack:** Node built-ins only; `node --test` suites; pr-state tests intercept `gh` via a PATH wrapper (existing technique in `tests/bin-lib/reconcile/pr-state.test.js`); prune-remote tests use real temp git repos with bare origins plus injectable `resolvePr` fakes (existing technique in `tests/bin-lib/reconcile/prune-remote.test.js`).

**Spec:** `.claude-tweaks/pipelines/2026-08-20T155832-spec-664-1082-1083/spec-664/work/664-spec.md`

## Global Constraints

- No change to `resolvePrStateAsync`'s signature or behavior — no destructive async caller exists; note the deliberate asymmetry in a comment beside it.
- No change to `decideRemotePrune`, and no change to the three read-mostly consumers' call sites.
- Never introduce `gh pr list --search` anywhere (search index lags — existing module-header rule).
- No new subprocess spawn sites (so no new `windowsHide` obligations).
- #570 left no reproduction fixtures (checked — issue closed, no notes in comments); the MERGED+newer-OPEN fixture in Task 1 is authored fresh and stands as the reproduction.
- Run targeted suites inside tasks only; the full `npm test` runs centrally after the build (Common Step 5), not between task commits.

---

### Task 1: `preferOpen` tie-break in `pr-state.js`

**Files:**
- Modify: `plugin/bin/lib/reconcile/pr-state.js` (`pickGoverningPr` ~line 34, `resolvePrState` ~line 44, comment on `resolvePrStateAsync` ~line 71)
- Test: `tests/bin-lib/reconcile/pr-state.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `resolvePrState(repoRoot, branch, opts?)` where `opts.preferOpen === true` makes an OPEN PR govern whenever one exists in the branch's PR set; omitted/falsy `opts` is byte-identical to today. Task 2 relies on exactly this signature.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/reconcile/pr-state.test.js` (uses the file's existing `installGhWrapper` helper):

```js
test('preferOpen: an OPEN PR outranks a MERGED PR for destructive callers, whichever is newer', async () => {
  // #664 / #570 review scenario: branch reused after its first PR merged.
  const openNewer = [
    { number: 10, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { number: 11, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' },
  ];
  const openOlder = [
    { number: 12, state: 'OPEN', mergedAt: null, updatedAt: '2026-01-01T00:00:00Z' },
    { number: 13, state: 'MERGED', mergedAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' },
  ];
  for (const [prs, expectedOpen] of [[openNewer, 11], [openOlder, 12]]) {
    const wrapper = installGhWrapper(prs);
    try {
      assert.equal(resolvePrState('/tmp', 'some-branch', { preferOpen: true }).number, expectedOpen);
    } finally {
      wrapper.restore();
    }
  }
});

test('read-mostly consumers (no opts): MERGED still wins over a newer OPEN PR — explicit regression proof for reap/archive/release', async () => {
  const prs = [
    { number: 10, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { number: 11, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' },
  ];
  const wrapper = installGhWrapper(prs);
  try {
    assert.equal(resolvePrState('/tmp', 'some-branch').number, 10);
    assert.equal((await resolvePrStateAsync('/tmp', 'some-branch')).number, 10);
  } finally {
    wrapper.restore();
  }
});

test('preferOpen with no OPEN PR in the set: behavior unchanged (MERGED wins)', () => {
  const prs = [
    { number: 1, state: 'CLOSED', mergedAt: null, updatedAt: '2026-01-03T00:00:00Z' },
    { number: 2, state: 'MERGED', mergedAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
  ];
  const wrapper = installGhWrapper(prs);
  try {
    assert.equal(resolvePrState('/tmp', 'some-branch', { preferOpen: true }).number, 2);
  } finally {
    wrapper.restore();
  }
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/bin-lib/reconcile/pr-state.test.js`
Expected: the two `preferOpen` tests FAIL (the option is ignored today, so the MERGED number comes back); the no-opts regression test PASSES already (it pins current behavior).

- [ ] **Step 3: Implement `preferOpen` in `pickGoverningPr` + thread `opts` through `resolvePrState`**

In `plugin/bin/lib/reconcile/pr-state.js`:

```js
// Multi-PR tie-break: merge is terminal, so any merged PR in the set wins
// regardless of how many others exist for the same branch (a re-opened PR
// after a first was closed unmerged, for instance).
//
// opts.preferOpen (#664): a destructive caller (prune-remote — a pushed,
// unrecoverable deletion) opts in to the inverse priority: ANY open PR in
// the set governs, whichever side is newer — an open PR is a do-not-touch
// signal regardless of age, and decideRemotePrune skips on OPEN. The three
// read-mostly consumers pass no opts and keep the merged-wins tie-break.
function pickGoverningPr(prs, opts) {
  if (!Array.isArray(prs) || prs.length === 0) return null;
  if (opts && opts.preferOpen) {
    const open = prs.filter((pr) => pr.state === 'OPEN');
    if (open.length > 0) {
      return open.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    }
  }
  const merged = prs.find((pr) => pr.state === 'MERGED');
  if (merged) return merged;
  // Otherwise the most recently updated PR governs.
  return prs.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}
```

`resolvePrState`: change the signature to `function resolvePrState(repoRoot, branch, opts)` and the tail call to `return pickGoverningPr(prs, opts);`. Everything else in the function is untouched.

`resolvePrStateAsync`: no signature change; add one comment line above it: `// Deliberately no opts/preferOpen here — no destructive async caller exists (#664); add it only when one does.`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/pr-state.test.js`
Expected: PASS (all, including the three pre-existing tie-break tests unmodified).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/pr-state.js tests/bin-lib/reconcile/pr-state.test.js
git commit -m "Add opt-in preferOpen tie-break to resolvePrState for destructive consumers (refs #664)"
```

---

### Task 2: Wire `prune-remote.js` to the destructive tie-break

**Files:**
- Modify: `plugin/bin/lib/reconcile/prune-remote.js` (the `resolve(root, branch)` call, ~line 111)
- Test: `tests/bin-lib/reconcile/prune-remote.test.js`

**Interfaces:**
- Consumes: Task 1's `resolvePrState(repoRoot, branch, { preferOpen: true })` contract.
- Produces: nothing later tasks rely on (final task touching code).

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/reconcile/prune-remote.test.js` (uses the file's existing `makeRepoWithOrigin` + `git` helpers; model the fixture on the existing squash-merge single-branch test):

```js
test('pruneRemote passes preferOpen to its PR resolver (destructive tie-break wiring, #664)', () => {
  const dir = makeRepoWithOrigin();
  git(dir, 'checkout', '-b', 'build/reused');
  fs.writeFileSync(path.join(dir, 'r.txt'), 'r\n');
  git(dir, 'add', 'r.txt');
  git(dir, 'commit', '-m', 'change');
  git(dir, 'push', 'origin', 'build/reused');
  git(dir, 'checkout', 'main');
  git(dir, 'cherry-pick', 'build/reused'); // cherry-equivalent (squash-merge shape)
  git(dir, 'branch', '-D', 'build/reused');

  const seenOpts = [];
  const resolvePr = (root, branch, opts) => { seenOpts.push(opts); return null; };
  pruneRemote({ cwd: dir, integration: 'main', dryRun: true, resolvePr, skipFetch: true });
  assert.equal(seenOpts.length, 1);
  assert.deepEqual(seenOpts[0], { preferOpen: true });
});

test('#570 scenario: cherry-equivalent branch with MERGED + newer OPEN PR is skipped pr-open, ref survives on origin', () => {
  const dir = makeRepoWithOrigin();
  git(dir, 'checkout', '-b', 'build/reused');
  fs.writeFileSync(path.join(dir, 'r.txt'), 'r\n');
  git(dir, 'add', 'r.txt');
  git(dir, 'commit', '-m', 'change');
  git(dir, 'push', 'origin', 'build/reused');
  git(dir, 'checkout', 'main');
  git(dir, 'cherry-pick', 'build/reused');
  git(dir, 'branch', '-D', 'build/reused');

  // Contract-mimicking fake: with preferOpen the OPEN PR governs (Task 1's
  // real behavior); without it the MERGED one would — which is exactly the
  // pre-#664 bug this test locks out.
  const resolvePr = (root, branch, opts) => (opts && opts.preferOpen
    ? { number: 11, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' }
    : { number: 10, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr, skipFetch: true });
  assert.equal(r.failure, null);
  const entry = r.entries.find((e) => e.name === 'build/reused');
  assert.equal(entry.action, 'skip');
  assert.equal(entry.reason, 'pr-open');
  // The pushed ref must still exist — no delete may have landed.
  const lsRemote = git(dir, 'ls-remote', '--heads', 'origin', 'build/reused');
  assert.match(lsRemote, /refs\/heads\/build\/reused/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: the wiring test FAILS (`seenOpts[0]` is `undefined` today). The #570-scenario test also FAILS today — the fake's no-opts branch returns MERGED, so the branch is deleted (`entry.action === 'delete'`) and `ls-remote` comes back empty.

- [ ] **Step 3: Pass `preferOpen` at the one call site**

In `plugin/bin/lib/reconcile/prune-remote.js`, change:

```js
    const prState = resolve(root, branch);
```

to:

```js
    // Destructive-caller tie-break (#664): any OPEN PR on this head must
    // reach decideRemotePrune (-> skip pr-open), even when an older MERGED
    // PR exists — the #570 review's reused-branch deletion gap.
    const prState = resolve(root, branch, { preferOpen: true });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: PASS (all — every pre-existing test in the file unmodified).

- [ ] **Step 5: Run the sibling consumer suites (targeted regression check)**

Run: `node --test tests/bin-lib/reconcile/reap-merged.test.js tests/bin-lib/reconcile/archive-merged.test.js tests/bin-lib/reconcile/release-merged.test.js tests/bin-lib/reconcile/archive-branches.test.js`
Expected: PASS with zero modifications to those files.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/reconcile/prune-remote.js tests/bin-lib/reconcile/prune-remote.test.js
git commit -m "Wire prune-remote to the preferOpen destructive tie-break (refs #664)"
```
