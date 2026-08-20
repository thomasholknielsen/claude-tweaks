# Record #1083 — archive-branches adopts the bulk PR screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `archive-branches.js`'s per-branch `gh pr list` loop — the same O(N) network shape #1082 removed from `prune-remote` — by adopting `resolvePrStatesBulk` as a screen, with every destructive verdict (`delete` and `tag-and-delete`) re-confirmed by today's exact per-branch `resolvePrState` before acting.

**Architecture:** Screen once over the in-scope local branch set; OPEN-screened branches skip before `git cherry` via the unchanged `decideArchive` with a documented `cherryEquivalent: true` sentinel (its OPEN-before-cherry order is already pinned by the existing `open PR -> skip, even when cherry-equivalent` test, which covers both cherry values); every other branch computes real cherry + `tipAgeDays` and gets a provisional `decideArchive` verdict on screen PR evidence; provisional `skip` records directly; provisional `delete`/`tag-and-delete` re-runs per-branch `resolvePrState` and re-decides on `(same cherry, confirmed prState)` — cherry is NOT recomputed (same pass, same local refs, deterministic). **No `preferOpen` anywhere in this module** — #664 deliberately scoped the destructive tie-break to `prune-remote` (see `pickGoverningPr`'s census comment: archive-branches' deletes are local-only and recoverable from origin), and #1083 changes evidence *acquisition* only, so both screen and confirm keep the default merged-wins tie-break, preserving today's verdicts exactly.

**Tech Stack:** Node built-ins; `node --test`; existing techniques (real temp git repos + injected `resolvePr` fakes; the bulk screen injected as `resolvePrBulk`, defaulted internally to `resolvePrStatesBulk` — the same parameter name `pruneRemote` landed with in #1082).

**Spec:** `.claude-tweaks/pipelines/2026-08-20T155832-spec-664-1082-1083/spec-1083/work/1083-spec.md`

## Global Constraints

- `decideArchive`, `inScope`, `shouldAgeTag`, `encodeArchiveTagSuffix`, the tag-aging sweep, and `isCherryEquivalent`: no change at all.
- Reason vocabulary unchanged (`pr-open`, `too-young`, `merged-pr-without-cherry-equivalence`, `cherry-equivalent`, `unmerged-aged: …`, `cherry-failed`, `tag-failed`, `delete-failed`). ~~Screen failure is check-level, matching #1082's landed shape~~ — **superseded by a review-confirmed ruling (commit `aab52be5`):** screen failure degrades to per-branch `gh-absent`/`network-failure` skips (`failure: null`) so the wholly gh-independent archive-tag aging sweep keeps running in a permanently gh-absent environment; `pruneRemote`'s check-level `pr-screen-failed` differs deliberately (no secondary sweep behind it).
- Confirm still runs under `dryRun` (reported reasons are confirmed reasons; only tag/delete suppressed).
- No new spawn sites (the screen's spawns live in `pr-state.js`); no `preferOpen`; no `--search`.
- Existing-test adaptation is sanctioned and exact: every pre-existing `archiveBranches(...)` call (8 sites, all `resolvePr: () => null`) gains `resolvePrBulk: nullScreen` where `nullScreen = (root, branches) => new Map(branches.map((b) => [b, null]))` — a null screen mirrors their `resolvePr` fakes so every branch takes the same evidence path as before (aged `tag-and-delete` and cherry `delete` candidates confirm against the same `() => null`); a MERGED-screen fake would corrupt the aged-branch paths (`merged-pr-without-cherry-equivalence` ≠ `tag-and-delete`). Tests must never spawn real `gh` (the fixtures' file-path origins would yield a bogus slug and a live GraphQL call — #1082's corrected-comment lesson).
- Targeted suites only in-task; full `npm test` central.

---

### Task 1: Screen-then-confirm in `archiveBranches` + tests

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-branches.js` (imports, `archiveBranches` signature + loop, ~lines 111-155)
- Test: `tests/bin-lib/reconcile/archive-branches.test.js`

**Interfaces:**
- Consumes: `resolvePrStatesBulk(repoRoot, branches, opts)` from `./pr-state` (#1082's landed contract: complete `Map<branch, pr|null>` | `'gh-absent'` | `'network-failure'`; no opts passed here — default tie-break); existing `resolvePrState`, `decideArchive`, `isCherryEquivalent`.
- Produces: `archiveBranches({ cwd, integration, dryRun, now, resolvePr, resolvePrBulk })` — one new optional injection, defaulted internally.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/reconcile/archive-branches.test.js` (reuse the file's existing fixture helpers — model on how the current `archiveBranches` tests build repos; `nullScreen` defined once near them):

```js
const MERGED_PR_1083 = { number: 30, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const OPEN_PR_1083 = { number: 31, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' };

test('screen: all-skip pass makes zero per-branch resolver calls, one bulk call, screen-sourced reasons', () => {
  // Fixture: one in-scope cherry-equivalent local branch (reuse the existing squash-merge fixture shape).
  // Screen says OPEN -> pr-open skip before cherry and before any confirm.
  // asserts: bulkCalls === 1; confirmCalls === 0; entry {action:'skip', reason:'pr-open'}; branch still exists locally.
});

test('screen-delete candidate confirms per-branch; confirm OPEN -> skip pr-open, branch survives', () => {
  // Fixture: cherry-equivalent branch. Screen: null (deleted-ref blind spot). Provisional: delete (cherry-equivalent).
  // Confirm fake returns OPEN_PR_1083 -> final decideArchive -> skip pr-open. Assert branch still exists (git branch --list).
  // This is the spec's AC2 deleted-ref blind-spot scenario.
});

test('screen-delete candidate: confirm MERGED-without-cherry never applies (cherry true governs); confirm null still deletes', () => {
  // Fixture: cherry-equivalent branch, screen null -> provisional delete; confirm returns null -> final delete (cherry-equivalent reason).
  // Assert branch deleted, no archive tag (delete path, not tag-and-delete).
});

test('aged tag-and-delete candidate: confirm MERGED downgrades to merged-pr-without-cherry-equivalence skip', () => {
  // Fixture: unmerged 15-day-old branch (existing aged fixture shape). Screen null -> provisional tag-and-delete.
  // Confirm returns MERGED_PR_1083 -> final decideArchive(cherry:false, MERGED) -> skip merged-pr-without-cherry-equivalence.
  // Assert branch survives and no tag was created. (AC2's substance for the tag-and-delete path.)
});

test('dry-run still confirms candidates and reports final reasons; nothing deleted', () => {
  // Aged fixture, screen null, confirm counts tracked: dryRun true -> confirmCalls >= 1, entry reason 'unmerged-aged: ...', branch + no tag.
});

test('screen failure is check-level: network -> pr-screen-failed, gh-absent -> gh-absent, zero per-branch work', () => {
  // resolvePrBulk: () => 'network-failure' -> deepEqual { entries: [], failure: 'pr-screen-failed' }; gh-absent likewise; confirmCalls === 0.
});

test('per-candidate confirm failure skips that branch (gh-absent/network-failure reason), pass completes', () => {
  // Cherry-equivalent fixture, screen null -> candidate; confirm returns 'network-failure' -> entry skip network-failure; failure null.
});
```

Write these as REAL tests (the comments above are the specification of each; flesh out with the file's actual fixture helpers — read the existing `archiveBranches` integration tests first and mirror their repo-building code exactly). Track `bulkCalls`/`confirmCalls` via counting fakes as `prune-remote.test.js`'s screen tests do.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js`
Expected: new tests FAIL (`archiveBranches` ignores `resolvePrBulk` today — bulk-call counts read 0, screen-sourced expectations miss). Pre-existing tests still pass (they don't inject the screen yet and current code never calls it).

- [ ] **Step 3: Restructure the loop**

In `plugin/bin/lib/reconcile/archive-branches.js`: import `resolvePrStatesBulk` alongside `resolvePrState`; add `resolvePrBulk` to the destructured params; `const resolveBulk = resolvePrBulk || resolvePrStatesBulk;`. Restructure the per-branch section:

```js
  // Collect in-scope branches (with their committerDate/tip) first — the
  // screen is one bulk call (#1083, adopting #1082's screen-then-confirm).
  // NO preferOpen here, on screen or confirm: #664 deliberately scoped the
  // destructive tie-break to prune-remote (see pickGoverningPr's census
  // comment) — archive's deletes are local-only and recoverable from origin,
  // and this restructure changes evidence acquisition only.
  const candidates = [];
  for (const line of refs.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
    const [branch, committerDate, tip] = line.split('\t');
    if (!inScope(branch, worktrees)) continue;
    candidates.push({ branch, committerDate, tip });
  }

  const screen = candidates.length > 0
    ? resolveBulk(root, candidates.map((c) => c.branch))
    : new Map();
  if (screen === 'gh-absent') return { entries, failure: 'gh-absent' };
  if (screen === 'network-failure') return { entries, failure: 'pr-screen-failed' };

  for (const { branch, committerDate, tip } of candidates) {
    const tipAgeDays = (nowMs - Date.parse(committerDate)) / (24 * 60 * 60 * 1000);
    const screenPr = screen.get(branch) || null;

    // OPEN-screened branches skip before cherry: decideArchive checks OPEN
    // before cherryEquivalent (order pinned by the existing 'open PR -> skip,
    // even when cherry-equivalent' test), so cherryEquivalent: true here is a
    // documented sentinel that never reaches the cherry-driven branches.
    if (screenPr && screenPr.state === 'OPEN') {
      const provisional = decideArchive({ branch, tipAgeDays, cherryEquivalent: true, prState: screenPr });
      entries.push({ name: branch, kind: 'branch', action: 'skip', reason: provisional.reason });
      continue;
    }

    const cherryEquivalent = isCherryEquivalent(root, integration, branch);
    if (cherryEquivalent === null) {
      entries.push({ name: branch, kind: 'branch', action: 'skip', reason: 'cherry-failed' });
      continue;
    }
    const provisional = decideArchive({ branch, tipAgeDays, cherryEquivalent, prState: screenPr });
    if (provisional.action === 'skip') {
      entries.push({ name: branch, kind: 'branch', action: 'skip', reason: provisional.reason });
      continue;
    }

    // Destructive candidate (delete or tag-and-delete): re-read PR state
    // per-branch — today's exact evidence — and re-decide. Cherry is reused,
    // not recomputed: same pass, same local refs, deterministically identical.
    // Runs under dryRun too, so dry-run reasons are confirmed reasons.
    const prState = resolve(root, branch);
    const decision = decideArchive({ branch, tipAgeDays, cherryEquivalent, prState });
    if (decision.action === 'skip' || dryRun) {
      entries.push({ name: branch, kind: 'branch', action: decision.action, reason: decision.reason });
      continue;
    }
    // ... existing tag-and-delete / delete execution, byte-identical from here
```

Keep the existing `tag-and-delete` tag-creation block, `branch -D`, and failure classifications exactly as they are — only the evidence acquisition above them changes. Update the module header with one sentence describing screen-then-confirm (cite #1083).

- [ ] **Step 4: Run tests; adapt the 8 pre-existing call sites**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js`
The 8 pre-existing `archiveBranches(...)` calls now hit the default screen → per Global Constraints, add `resolvePrBulk: nullScreen` to each (define `nullScreen` once). Re-run until all pass.

- [ ] **Step 5: Run the sibling suites**

Run: `node --test tests/bin-lib/reconcile/pr-state.test.js tests/bin-lib/reconcile/prune-remote.test.js tests/bin-lib/reconcile/archive-merged.test.js tests/reconcile.test.js`
Expected: PASS. If `tests/reconcile.test.js` drives `archiveBranches` against a fixture without the injection, apply the same `nullScreen` fake there and note it in the report.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/reconcile/archive-branches.js tests/bin-lib/reconcile/archive-branches.test.js
git commit -m "Adopt the bulk PR screen in archive-branches: screen-then-confirm both destructive verdicts (refs #1083)"
```
(Include `tests/reconcile.test.js` in the add if Step 5 touched it.)
