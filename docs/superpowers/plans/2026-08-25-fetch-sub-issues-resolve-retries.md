# fetch-sub-issues.js: fold retry resolution + canonicalization behind the CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--resolve-retries` flag to `bin/fetch-sub-issues.js` that internally resolves the `retry` array via the same per-parent paginated REST call the three prose call sites currently hand-roll, then migrate all three prose sites (`_shared/trust-table.md`, `_shared/github-pr-scan-acceptance.md` ×2) to call the CLI with the flag instead of re-deriving the retry ladder in a `node -e` snippet.

**Architecture:** `fetch-sub-issues.js` already returns `{byParent, retry}`. When `--resolve-retries` is passed and `retry` is non-empty, the CLI loops over the retry parents, calls `gh api --paginate repos/{owner}/{repo}/issues/{n}/sub_issues --jq '.[].number'` through the existing injectable `deps.runner` seam (the same seam `fetchNativeSubIssues` already uses for GraphQL), merges the resolved numbers into `byParent[n]`, and prints the identical `{byParent, retry: []}` envelope shape — no new wire format. A retry parent whose REST call fails makes the CLI exit 3, naming the parent on stderr, mirroring the existing exit-3 contract for a GraphQL failure. Each of the three prose call sites drops its own retry-ladder `node -e` block and instead passes `--resolve-retries` on the existing CLI invocation, then does only the thin canonicalization step it always needed (flatten+dedupe+sort for trust-table/acceptance-gap; keep per-parent for parent-gate) — reading `batch.byParent` directly, since it now arrives fully resolved.

**Tech Stack:** Node.js (`node --test`), `child_process.execFileSync` via the existing injectable-runner seam (`gh-api-module-pattern`), no new npm dependencies.

**Spec:** GitHub issue #1153 — materialized at `.claude-tweaks/pipelines/2026-08-25T064014-record-1153/work/1153-spec.md`.

## Global Constraints

- Preserve the existing `{byParent, retry}` wire format exactly — `--resolve-retries` only ever narrows `retry` toward `[]`, never introduces a new envelope shape.
- The three prose sites' `#### Fallback (probe unavailable — older GHE)` blocks (the verbatim per-parent `while read -r N` REST loop) are retained unchanged — `tests/fetch-sub-issues-prose-conformance.test.js` pins exactly one such block in `trust-table.md` and exactly two in `github-pr-scan-acceptance.md`, plus a citation of `bin/fetch-sub-issues.js` in both files.
- A retry-parent REST failure must fail the whole CLI invocation loudly (exit 3, parent named on stderr) before any stdout write — never a partial/undercounted envelope.
- Keep the CLI's own header-comment usage/exit-code documentation (`fetch-sub-issues.js` lines 1-31) in sync with the new flag and exit-3 case.

---

### Task 1: `--resolve-retries` flag + retry-resolution logic in `fetch-sub-issues.js`

**Files:**
- Modify: `plugin/bin/fetch-sub-issues.js`
- Test: `tests/fetch-sub-issues-cli.test.js`

**Interfaces:**
- Consumes: `deps.runner(args) -> string` (existing seam, already used for the GraphQL probe and batch fetch calls — `realDeps.runner` wraps `execFileSync('gh', args, { encoding: 'utf8', timeout: 30000 })`).
- Produces: `run(argv, deps)` unchanged signature; `parseArgs(argv)` gains `opts.resolveRetries: boolean`. No new exported symbols.

- [ ] **Step 1: Write the failing tests**

Add to `tests/fetch-sub-issues-cli.test.js` (after the existing `'101 numbers fan out...'` test, before EOF):

```javascript
test('--resolve-retries resolves a retry parent via REST and merges it into byParent', () => {
  const d = deps({
    runner(args) {
      d.calls.push(args);
      const q = args.find((a) => a.startsWith('query='));
      if (q && q.includes('__type')) return probeOk;
      if (q) {
        // batch GraphQL call: parent 5 comes back with hasNextPage true, so it lands in retry
        return JSON.stringify({ data: { repository: { i5: { number: 5, subIssues: { nodes: [{ number: 6 }], pageInfo: { hasNextPage: true } } } } } });
      }
      // REST retry call: gh api --paginate repos/{owner}/{repo}/issues/5/sub_issues --jq '.[].number'
      assert.deepStrictEqual(args, ['api', '--paginate', 'repos/o/r/issues/5/sub_issues', '--jq', '.[].number']);
      return '6\n9\n';
    },
  });
  assert.strictEqual(run(['5', '--repo', 'o/r', '--resolve-retries'], d), 0);
  assert.deepStrictEqual(JSON.parse(d.out.join('')), { byParent: { 5: [6, 9] }, retry: [] });
});

test('--resolve-retries: a failing REST retry call exits 3, names the parent, and prints nothing to stdout', () => {
  const d = deps({
    runner(args) {
      d.calls.push(args);
      const q = args.find((a) => a.startsWith('query='));
      if (q && q.includes('__type')) return probeOk;
      if (q) return JSON.stringify({ data: { repository: { i5: { number: 5, subIssues: { nodes: [], pageInfo: { hasNextPage: true } } } } } });
      throw new Error('gh api: sub_issues 404');
    },
  });
  assert.strictEqual(run(['5', '--repo', 'o/r', '--resolve-retries'], d), 3);
  assert.match(d.err.join(''), /sub-issue REST retry failed for parent #5/);
  assert.match(d.err.join(''), /sub_issues 404/);
  assert.deepStrictEqual(d.out, []);
});

test('--resolve-retries with an empty retry array is a no-op (unaffected output)', () => {
  const d = deps();
  assert.strictEqual(run(['5', '--repo', 'o/r', '--resolve-retries'], d), 0);
  assert.deepStrictEqual(JSON.parse(d.out.join('')), { byParent: { 5: [6] }, retry: [] });
});

test('--resolve-retries does not change exit-4 (probe unavailable) behavior', () => {
  const d = deps({ runner: () => probeNo });
  assert.strictEqual(run(['5', '--repo', 'o/r', '--resolve-retries'], d), 4);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/fetch-sub-issues-cli.test.js`
Expected: FAIL — the two new assertions on `--resolve-retries` behavior fail because the flag doesn't exist yet (`retry` stays `[5]` / no REST call is made / no exit-3 path exists for a retry failure).

- [ ] **Step 3: Implement `--resolve-retries` in `fetch-sub-issues.js`**

In `parseArgs` (around line 43-62), add the new boolean flag next to `--help`:

```javascript
function parseArgs(argv) {
  const opts = { numbers: [], repo: null, help: false, resolveRetries: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { opts.help = true; }
    else if (a === '--resolve-retries') { opts.resolveRetries = true; }
    else if (a === '--repo') {
```

Update `USAGE` (line 39):

```javascript
const USAGE = 'usage: fetch-sub-issues.js [<n> ...] [--repo owner/name] [--resolve-retries] [--help]\n';
```

In `run()`, after the existing per-chunk fetch loop (current lines 107-117, right after `retry.push(...res.retry);` inside the loop, i.e. after the whole `for` loop closes but before the final `deps.stdout` line ~118), add the resolution step:

```javascript
  if (opts.resolveRetries && retry.length > 0) {
    for (const n of retry) {
      let nums;
      try {
        const out = deps.runner(['api', '--paginate', `repos/${owner}/${repo}/issues/${n}/sub_issues`, '--jq', '.[].number']);
        nums = out.trim().split('\n').filter(Boolean).map(Number);
      } catch (err) {
        deps.stderr(`fetch-sub-issues.js: sub-issue REST retry failed for parent #${n}: ${err && err.message ? err.message : String(err)}\n`);
        return 3;
      }
      byParent[n] = (byParent[n] || []).concat(nums);
    }
    retry.length = 0;
  }
```

This sits between the existing `try { ... } catch (err) { ... return 3; }` block (lines 107-117) and the final `deps.stdout(...)` / `return 0` (lines 118-119) — so a retry-resolution failure returns 3 before any stdout write, matching the GraphQL-failure exit-3 contract's "nothing printed on failure" behavior.

Update the header comment's exit-code documentation (lines 12-31) to mention the new flag and that exit 3 also covers a failed `--resolve-retries` REST call:

```javascript
// Usage: fetch-sub-issues.js [<n> ...] [--repo owner/name] [--resolve-retries] [--help]
```

and, in the exit-3 sentence, append: "; also covers a `--resolve-retries` per-parent REST retry call failing (parent named on stderr)".

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/fetch-sub-issues-cli.test.js`
Expected: PASS — all tests including the 4 new ones and every pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/fetch-sub-issues.js tests/fetch-sub-issues-cli.test.js
git commit -m "fetch-sub-issues.js: add --resolve-retries flag (refs #1153)"
```

---

### Task 2: Migrate `_shared/trust-table.md`'s retry ladder to `--resolve-retries`

**Files:**
- Modify: `plugin/skills/_shared/trust-table.md` (the block currently spanning roughly lines 152-200 — the batched-fetch invocation and the retry-ladder `node -e` block that follows it)

**Interfaces:**
- Consumes: `bin/fetch-sub-issues.js`'s `--resolve-retries` flag (Task 1) — CLI invocation only, no code-level interface.
- Produces: n/a (prose file).

- [ ] **Step 1: Replace the batched-fetch invocation to pass `--resolve-retries`**

Find (the line reading, approximately):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/fetch-sub-issues.js" $(node -e "require('/tmp/trust-table-parent-issues.json').forEach(p => console.log(p.number))") > /tmp/trust-table-sub-issues-batch.json
```

Replace with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/fetch-sub-issues.js" --resolve-retries $(node -e "require('/tmp/trust-table-parent-issues.json').forEach(p => console.log(p.number))") > /tmp/trust-table-sub-issues-batch.json
```

- [ ] **Step 2: Replace the retry-ladder paragraph and `node -e` block with a thin canonicalization step**

Find the paragraph starting "The batch envelope's `retry` array names parents the probe could not resolve in one page..." through the end of the `node -e` code block that follows it (the block using `execFileSync`, `retryParents`, `retryResults`, writing `/tmp/trust-table-sub-issues.json`). Replace the whole span (paragraph + code block) with:

```markdown
`--resolve-retries` already resolved every parent the probe could not fit in one page — a
missing alias, or a `subIssues` connection whose `pageInfo.hasNextPage` was true
(`native-dependencies.js`'s `fetchNativeSubIssues` never lands a parent in `byParent` for either
case) — via its own per-parent paginated REST call, merged back into `byParent`; a retry parent
whose REST call failed would have already made the CLI itself exit 3 above, naming the parent, so
reaching this point means every parent's sub-issues are already in hand. The only work left is
canonicalization — flatten, dedupe, sort:

```bash
node -e "
  const fs = require('fs');
  const batch = require('/tmp/trust-table-sub-issues-batch.json');
  const all = Object.values(batch.byParent || {}).flat();
  const subIssueNumbers = Array.from(new Set(all)).sort((a, b) => a - b);
  fs.writeFileSync('/tmp/trust-table-sub-issues.json', JSON.stringify(subIssueNumbers));
  const subSnapPath = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record-snapshot.js').subIssuesPath(process.env.CLAUDE_CODE_SESSION_ID);
  if (subSnapPath) fs.writeFileSync(subSnapPath, JSON.stringify(subIssueNumbers));
"
```

`/tmp/trust-table-sub-issues.json` and the session snapshot are only ever written here, once the
envelope is already fully resolved — there is no partial-write hazard left to guard against, since
a failed retry never reaches this line at all.
```

Do not touch the `#### Fallback (probe unavailable — older GHE)` section that follows — it is unchanged.

- [ ] **Step 3: Verify the prose conformance test still passes for this file**

Run: `node --test tests/fetch-sub-issues-prose-conformance.test.js`
Expected: PASS — `trust-table.md` still cites `bin/fetch-sub-issues.js` and still has exactly one Fallback block retaining the `while read -r N` loop (untouched).

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/_shared/trust-table.md
git commit -m "trust-table.md: migrate retry ladder to fetch-sub-issues.js --resolve-retries (refs #1153)"
```

---

### Task 3: Migrate `github-pr-scan-acceptance.md`'s `acceptance-gap` scope to `--resolve-retries`

**Files:**
- Modify: `plugin/skills/_shared/github-pr-scan-acceptance.md` (the `acceptance-gap` scope's batched-fetch + retry-ladder block, roughly lines 163-218)

**Interfaces:**
- Consumes: `bin/fetch-sub-issues.js`'s `--resolve-retries` flag (Task 1).
- Produces: n/a (prose file).

- [ ] **Step 1: Replace the batched-fetch invocation**

Find:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/fetch-sub-issues.js" $(node -e "require('/tmp/tidy-parents-for-gap.json').forEach(p => console.log(p.number))") > /tmp/tidy-gap-sub-issues-batch.json
```

Replace with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/fetch-sub-issues.js" --resolve-retries $(node -e "require('/tmp/tidy-parents-for-gap.json').forEach(p => console.log(p.number))") > /tmp/tidy-gap-sub-issues-batch.json
```

- [ ] **Step 2: Replace the retry-ladder paragraph and `node -e` block**

Find the paragraph starting "The batch envelope's `retry` array names parents the probe could not resolve in one page..." (this scope's copy) through the end of its following `node -e` block (writing `/tmp/tidy-acceptance-gap-sub-issues.json`). Replace with:

```markdown
`--resolve-retries` already resolved every parent the probe could not fit in one page via its own
per-parent paginated REST call, merged back into `byParent` — a retry parent whose REST call
failed would have already made the CLI exit 3 above, naming the parent. The only work left is
canonicalization — flatten, dedupe, sort:

```bash
node -e "
  const fs = require('fs');
  const batch = require('/tmp/tidy-gap-sub-issues-batch.json');
  const all = Object.values(batch.byParent || {}).flat();
  const subIssueNumbers = Array.from(new Set(all)).sort((a, b) => a - b);
  fs.writeFileSync('/tmp/tidy-acceptance-gap-sub-issues.json', JSON.stringify(subIssueNumbers));
"
```
```

Leave the `#### Fallback (probe unavailable — older GHE)` section for this scope untouched.

- [ ] **Step 3: Commit is deferred to end of Task 4** (same file — one commit for both scopes' migration, to avoid a half-migrated file mid-history).

---

### Task 4: Migrate `github-pr-scan-acceptance.md`'s `parent-gate` scope to `--resolve-retries`

**Files:**
- Modify: `plugin/skills/_shared/github-pr-scan-acceptance.md` (the `parent-gate` scope's batched-fetch + retry-ladder block, roughly lines 454-513 — after Task 3's edits shift earlier line numbers, so locate this block by its surrounding text, not the line numbers stated here)

**Interfaces:**
- Consumes: `bin/fetch-sub-issues.js`'s `--resolve-retries` flag (Task 1).
- Produces: n/a (prose file).

- [ ] **Step 1: Replace the batched-fetch invocation**

Find:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/fetch-sub-issues.js" $(node -e "require('/tmp/tidy-parent-issues.json').forEach(p => console.log(p.number))") > /tmp/tidy-parentgate-sub-issues-batch.json
```

Replace with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/fetch-sub-issues.js" --resolve-retries $(node -e "require('/tmp/tidy-parent-issues.json').forEach(p => console.log(p.number))") > /tmp/tidy-parentgate-sub-issues-batch.json
```

- [ ] **Step 2: Replace the retry-ladder paragraph and `node -e` block**

This scope's version keeps the per-parent `byParent` shape (unlike the two flattening call sites above) because the composing step needs each parent's own sub-issue list, not just existence. Find the paragraph starting "The batch envelope's `retry` array names parents the probe could not resolve in one page..." (this scope's copy, which additionally explains "Unlike `acceptance-gap`'s flattened union, this scope keeps each parent's own sub-issue set intact...") through the end of its following `node -e` block (writing `/tmp/tidy-parent-gates.json`, the one that also reads `/tmp/tidy-parent-issues.json` and `/tmp/tidy-all-issue-states.json` to compose the final gate rows). Replace with:

```markdown
`--resolve-retries` already resolved every parent the probe could not fit in one page via its own
per-parent paginated REST call, merged back into `byParent` — a retry parent whose REST call
failed would have already made the CLI exit 3 above, naming the parent. Unlike `acceptance-gap`'s
flattened union, this scope keeps each parent's own sub-issue set intact — the composing step
below reads the envelope's `byParent` directly, per-parent, because `subIssues` needs each
parent's own numbers, not existence alone:

```bash
node -e "
  const fs = require('fs');
  const batch = require('/tmp/tidy-parentgate-sub-issues-batch.json');
  const byParent = batch.byParent || {};
  const parents = require('/tmp/tidy-parent-issues.json');
  const infoOf = new Map(require('/tmp/tidy-all-issue-states.json').map(i => [i.number, { state: i.state, labels: (i.labels || []).map(l => l.name) }]));
  const gates = parents.map((p) => ({
    number: p.number,
    title: p.title,
    parentLabels: p.labels.map(l => l.name),
    subIssues: (byParent[p.number] || []).map(n => {
      const info = infoOf.get(n);
      return { number: n, state: (info && info.state) || 'OPEN', labels: (info && info.labels) || [] };
    }),
  }));
  fs.writeFileSync('/tmp/tidy-parent-gates.json', JSON.stringify(gates));
"
```
```

Leave the `#### Fallback (probe unavailable — older GHE)` section for this scope untouched.

- [ ] **Step 3: Verify the prose conformance test passes for the whole file**

Run: `node --test tests/fetch-sub-issues-prose-conformance.test.js`
Expected: PASS — `github-pr-scan-acceptance.md` still cites `bin/fetch-sub-issues.js` and still has exactly two Fallback blocks retaining the `while read -r N` loop (acceptance-gap's + parent-gate's, both untouched).

- [ ] **Step 4: Commit (covers both Task 3 and Task 4's edits to this file)**

```bash
git add plugin/skills/_shared/github-pr-scan-acceptance.md
git commit -m "github-pr-scan-acceptance.md: migrate acceptance-gap + parent-gate retry ladders to fetch-sub-issues.js --resolve-retries (refs #1153)"
```

---

### Task 5: Full verification sweep

**Files:** none (verification-only task)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — including `tests/fetch-sub-issues-cli.test.js` (all new + existing tests), `tests/fetch-sub-issues-prose-conformance.test.js`, and every other suite (no unrelated regression). Pre-existing, unrelated flakes (`tests/changelog-coverage.test.js` on a stale branch, `tests/bin-lib/reconcile/pr-state.test.js`'s event-loop flake under load) are acceptable per this project's own documented tolerance — re-run only those in isolation if seen.

- [ ] **Step 2: Manually re-read all three migrated prose sites end to end**

Confirm no leftover reference to the old per-site tmp-file variable names that no longer exist, and that each site's surrounding prose (the sentence introducing the batched fetch, the Exit-code branching paragraph immediately above the invocation) still reads coherently against the new `--resolve-retries` flag — none of that surrounding prose needs to change, only the retry-ladder block itself, but confirm it by reading, not by assumption.
