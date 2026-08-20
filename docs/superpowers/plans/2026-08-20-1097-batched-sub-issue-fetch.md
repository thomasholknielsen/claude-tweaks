# Batched Native Sub-Issue Fetch + Session Snapshot (#1097) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-parent sequential `sub_issues` REST loop (trust table + two acceptance-scan sites) with one probe-gated, chunked, aliased GraphQL fetch behind a CLI, and session-snapshot the trust table's canonicalized result.

**Architecture:** Pure query builder in `record.js` (no network) → execution + throw-on-partial parse in `native-dependencies.js` behind the injectable-runner seam → `bin/fetch-sub-issues.js` CLI (probe gate, chunking at 50, retry-list output) as the single-command prose entry point → `record-snapshot.js` gains a third session-scoped path. Prose sweeps adopt the CLI with the existing REST loop retained verbatim as fallback.

**Tech Stack:** Node 18+ builtins only, `node --test`, `gh` CLI (injected as runner in tests).

**Spec:** `.claude-tweaks/pipelines/2026-08-20T183954-spec-1097/work/1097-spec.md`

## Global Constraints

- Zero runtime npm deps; injectable-runner seam per `gh-api-module-pattern` (`deps` object, `-f` for resolved String! values, never `-F`).
- Never coerce a failed/missing alias to "no sub-issues" — undercounting re-admits sub-issues into trust cells as ungraded evidence (spec's error ladder).
- Trust grading semantics unchanged: all-time set, `hasParent` filter, every truncation warning, label-filtered fetches only (`record-queue-fetch-conformance.test.js` pins `_shared/trust-table.md`: must keep citing `_shared/record-queue-fetch.md`, must not add a bare unlabeled `gh issue list --limit` fetch).
- Every skill-embedded `node -e` snippet must be syntactically valid JS (`tests/node-e-snippet-syntax.test.js` pins this repo-wide).
- Prose snippets stay single plain commands (worktree sessions refuse compound Bash).
- **Live-verified command** (run 2026-08-20 against this repo, read-only): `gh api graphql -f query='query($owner:String!,$repo:String!){ repository(owner:$owner,name:$repo){ i1095: issue(number:1095){ number subIssues(first:100){ nodes{ number } pageInfo{ hasNextPage } } } } }' -f owner=thomasholknielsen -f repo=claude-tweaks` → `{"data":{"repository":{"i1095":{"number":1095,"subIssues":{"nodes":[{"number":1097},{"number":1101}],"pageInfo":{"hasNextPage":false}}}}}}`.

---

### Task 1: `buildNativeSubIssuesQuery` (pure builder)

**Files:**
- Modify: `plugin/bin/lib/issues/record.js` (add function beside `buildNativeDependencyQuery` at ~line 413; add to `module.exports`)
- Test: `tests/bin-lib/issues/record.test.js` (beside the existing `buildNativeDependencyQuery` tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildNativeSubIssuesQuery(numbers: number[]) -> string | null` — null on empty/non-array input; otherwise one GraphQL query string with alias `i{n}: issue(number:{n}){ number subIssues(first:100){ nodes{ number } pageInfo{ hasNextPage } } }` per number, wrapped in `query($owner:String!,$repo:String!){ repository(owner:$owner,name:$repo){ ... } }` — byte-parallel to `buildNativeDependencyQuery`'s wrapper.

- [ ] **Step 1: Write the failing tests**

```js
// In tests/bin-lib/issues/record.test.js, next to the buildNativeDependencyQuery tests:
test('buildNativeSubIssuesQuery aliases each number and requests subIssues nodes + pageInfo', () => {
  const q = buildNativeSubIssuesQuery([42, 731]);
  assert.match(q, /i42: issue\(number:42\)\{ number subIssues\(first:100\)\{ nodes\{ number \} pageInfo\{ hasNextPage \} \} \}/);
  assert.match(q, /i731: issue\(number:731\)/);
  assert.match(q, /query\(\$owner:String!,\$repo:String!\)/);
});

test('buildNativeSubIssuesQuery returns null for empty or non-array input', () => {
  assert.strictEqual(buildNativeSubIssuesQuery([]), null);
  assert.strictEqual(buildNativeSubIssuesQuery(undefined), null);
  assert.strictEqual(buildNativeSubIssuesQuery('42'), null);
});
```

Also add `buildNativeSubIssuesQuery` to the test file's require destructure.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/record.test.js`
Expected: FAIL — `buildNativeSubIssuesQuery is not a function`.

- [ ] **Step 3: Implement**

```js
// candidate parent-issue numbers -> one batched, aliased GraphQL query requesting
// each parent's native subIssues connection (work-links: native). first:100 covers
// GitHub's documented per-parent sub-issue cap in one page; pageInfo.hasNextPage is
// requested so callers can detect a raised cap instead of silently truncating.
// Same alias/null conventions as buildNativeDependencyQuery above.
function buildNativeSubIssuesQuery(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return null;
  const fields = numbers
    .map((n) => `i${n}: issue(number:${n}){ number subIssues(first:100){ nodes{ number } pageInfo{ hasNextPage } } }`)
    .join('\n      ');
  return `query($owner:String!,$repo:String!){\n  repository(owner:$owner,name:$repo){\n      ${fields}\n  }\n}`;
}
```

Export it alongside `buildNativeDependencyQuery` in `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/record.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/issues/record.js tests/bin-lib/issues/record.test.js
git commit -m "Add buildNativeSubIssuesQuery beside buildNativeDependencyQuery (refs #1097)"
```

---

### Task 2: `fetchNativeSubIssues` (execution + partial-result classification)

**Files:**
- Modify: `plugin/bin/lib/issues/native-dependencies.js` (add function + export)
- Test: `tests/bin-lib/issues/native-dependencies.test.js` (create if absent; if a suite for this module already exists, extend it)

**Interfaces:**
- Consumes: Task 1's `buildNativeSubIssuesQuery`.
- Produces: `fetchNativeSubIssues({ numbers, owner, repo, runner }) -> { byParent: Map<number, number[]>, retry: number[] }`. Throws when `data.repository` is null/missing (whole-response failure — same rule as `fetchNativeDependencies`). A parent whose `i{n}` alias is missing from an otherwise-successful response, or whose `pageInfo.hasNextPage` is true, lands in `retry` — never in `byParent` as `[]`. Empty/None input → `{ byParent: new Map(), retry: [] }` with no runner call.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { fetchNativeSubIssues } = require('../../../plugin/bin/lib/issues/native-dependencies');

const resp = (repository) => JSON.stringify({ data: { repository } });

test('fetchNativeSubIssues maps each alias to its sub-issue numbers', () => {
  const runner = () => resp({
    i1095: { number: 1095, subIssues: { nodes: [{ number: 1097 }, { number: 1101 }], pageInfo: { hasNextPage: false } } },
    i7: { number: 7, subIssues: { nodes: [], pageInfo: { hasNextPage: false } } },
  });
  const out = fetchNativeSubIssues({ numbers: [1095, 7], owner: 'o', repo: 'r', runner });
  assert.deepStrictEqual(out.byParent.get(1095), [1097, 1101]);
  assert.deepStrictEqual(out.byParent.get(7), []);
  assert.deepStrictEqual(out.retry, []);
});

test('a missing alias routes that parent to retry, never to an empty byParent entry', () => {
  const runner = () => resp({ i1095: { number: 1095, subIssues: { nodes: [{ number: 1097 }], pageInfo: { hasNextPage: false } } } });
  const out = fetchNativeSubIssues({ numbers: [1095, 8], owner: 'o', repo: 'r', runner });
  assert.deepStrictEqual(out.byParent.get(1095), [1097]);
  assert.strictEqual(out.byParent.has(8), false);
  assert.deepStrictEqual(out.retry, [8]);
});

test('hasNextPage routes that parent to retry — a partial first page is never used', () => {
  const runner = () => resp({ i9: { number: 9, subIssues: { nodes: [{ number: 1 }], pageInfo: { hasNextPage: true } } } });
  const out = fetchNativeSubIssues({ numbers: [9], owner: 'o', repo: 'r', runner });
  assert.strictEqual(out.byParent.has(9), false);
  assert.deepStrictEqual(out.retry, [9]);
});

test('null repository throws rather than returning a partial map', () => {
  const runner = () => JSON.stringify({ data: { repository: null }, errors: [{ message: 'boom' }] });
  assert.throws(() => fetchNativeSubIssues({ numbers: [5], owner: 'o', repo: 'r', runner }), /boom|no sub-issue data/);
});

test('empty input returns empty result without calling the runner', () => {
  const out = fetchNativeSubIssues({ numbers: [], owner: 'o', repo: 'r', runner: () => { throw new Error('must not run'); } });
  assert.strictEqual(out.byParent.size, 0);
  assert.deepStrictEqual(out.retry, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/native-dependencies.test.js`
Expected: FAIL — `fetchNativeSubIssues is not a function`.

- [ ] **Step 3: Implement**

```js
// { numbers, owner, repo, runner } -> { byParent: Map<number, number[]>, retry: number[] }.
// ONE batched, aliased GraphQL call (buildNativeSubIssuesQuery) resolving every
// parent's native subIssues connection at once — work-links: native.
//
// Error posture differs from fetchNativeDependencies above by design (#1097's
// error ladder): a null/missing data.repository still THROWS (whole-response
// failure, same as above), but a single missing alias — or an alias whose
// pageInfo.hasNextPage is true (more sub-issues than one first:100 page) —
// routes that parent onto `retry` for the caller's per-parent REST fallback
// instead of failing the whole batch. Never lands in byParent as [] — an
// empty entry would read as "confirmed no sub-issues" and re-admit that
// parent's sub-issues into trust cells as ungraded evidence (#723's shape).
function fetchNativeSubIssues({ numbers, owner, repo, runner } = {}) {
  const result = { byParent: new Map(), retry: [] };
  const query = buildNativeSubIssuesQuery(numbers);
  if (!query) return result;
  const out = runner(['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `repo=${repo}`]);
  const parsed = JSON.parse(out);
  const repository = parsed && parsed.data && parsed.data.repository;
  if (!repository) {
    const errs = Array.isArray(parsed && parsed.errors) ? parsed.errors.map((e) => e && e.message).filter(Boolean) : [];
    throw new Error(`missing repository — no sub-issue data for ${numbers.map((n) => `#${n}`).join(', ')}${errs.length ? ` (GraphQL: ${errs.join('; ')})` : ''}`);
  }
  for (const n of numbers) {
    const node = repository[`i${n}`];
    const conn = node && node.subIssues;
    if (!conn || (conn.pageInfo && conn.pageInfo.hasNextPage)) {
      result.retry.push(n);
      continue;
    }
    result.byParent.set(n, (conn.nodes || []).map((s) => s && s.number).filter((v) => v !== undefined));
  }
  return result;
}
```

Require `buildNativeSubIssuesQuery` from `./record` (extend the existing destructure) and add `fetchNativeSubIssues` to `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/native-dependencies.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/issues/native-dependencies.js tests/bin-lib/issues/native-dependencies.test.js
git commit -m "Add fetchNativeSubIssues with per-parent retry classification (refs #1097)"
```

---

### Task 3: `bin/fetch-sub-issues.js` CLI (probe gate + chunking + JSON envelope)

**Files:**
- Create: `plugin/bin/fetch-sub-issues.js` (mirror `plugin/bin/resolve-blockers.js`'s shape exactly: parseArgs/parseRepo/realDeps/run/exit-codes)
- Test: `tests/fetch-sub-issues-cli.test.js`
- Modify: `docs/plugin-structure.md` (add one row to the standalone-CLI list, beside `resolve-blockers.js`)

**Interfaces:**
- Consumes: Task 2's `fetchNativeSubIssues`; `capabilities-probe.js`'s `probeSchema(runner)` (returns `{ subIssues, dependencies }`, fail-safe false).
- Produces: `fetch-sub-issues.js [<n> ...] [--repo owner/name] [--help]` printing one JSON line `{"byParent":{"1095":[1097,1101]},"retry":[]}` (byParent as a plain object keyed by stringified number — JSON has no Map). Zero positional numbers is valid and prints `{"byParent":{},"retry":[]}` (exit 0) — lets prose pipe an empty parent list through `xargs` safely. Exit codes: 0 success; 1 malformed args (non-positive-integer positional, unknown flag); 2 `gh` absent or owner/repo unresolvable; 3 GraphQL throw from `fetchNativeSubIssues`; 4 `probeSchema(runner).subIssues === false` (field unavailable — caller falls back to the REST loop). Chunks input at 50 numbers per `fetchNativeSubIssues` call, merging `byParent`/`retry` across chunks.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { run } = require('../plugin/bin/fetch-sub-issues');

const probeOk = JSON.stringify({ data: { __type: { fields: [{ name: 'subIssues' }, { name: 'blockedBy' }] } } });
const probeNo = JSON.stringify({ data: { __type: { fields: [{ name: 'blockedBy' }] } } });

function deps(overrides = {}) {
  const calls = [];
  const d = {
    ghAvailable: () => true,
    remoteUrl: () => 'git@github.com:o/r.git',
    runner: (args) => {
      calls.push(args);
      const q = args.find((a) => a.startsWith('query='));
      if (q && q.includes('__type')) return probeOk;
      return JSON.stringify({ data: { repository: { i5: { number: 5, subIssues: { nodes: [{ number: 6 }], pageInfo: { hasNextPage: false } } } } } });
    },
    out: [], err: [],
    stdout(s) { this.out.push(s); }, stderr(s) { this.err.push(s); },
    ...overrides,
  };
  d.calls = calls;
  return d;
}

test('happy path prints byParent object and exits 0', () => {
  const d = deps();
  assert.strictEqual(run(['5'], d), 0);
  assert.deepStrictEqual(JSON.parse(d.out.join('')), { byParent: { 5: [6] }, retry: [] });
});

test('zero positionals is valid: empty envelope, exit 0, no GraphQL fetch', () => {
  const d = deps();
  assert.strictEqual(run([], d), 0);
  assert.deepStrictEqual(JSON.parse(d.out.join('')), { byParent: {}, retry: [] });
  assert.ok(!d.calls.some((args) => args.some((a) => a.includes('subIssues(first:100)'))));
});

test('probe reporting subIssues unavailable exits 4 before any fetch', () => {
  const d = deps({ runner: () => probeNo });
  assert.strictEqual(run(['5'], d), 4);
});

test('a GraphQL throw exits 3', () => {
  const d = deps({
    runner: (args) => {
      const q = args.find((a) => a.startsWith('query='));
      if (q && q.includes('__type')) return probeOk;
      return JSON.stringify({ data: { repository: null } });
    },
  });
  assert.strictEqual(run(['5'], d), 3);
});

test('non-integer positional exits 1; gh absent exits 2', () => {
  assert.strictEqual(run(['abc'], deps()), 1);
  assert.strictEqual(run(['5'], deps({ ghAvailable: () => false })), 2);
});

test('101 numbers fan out as three chunked fetch calls (50/50/1)', () => {
  const nums = Array.from({ length: 101 }, (_, i) => i + 1);
  const d = deps({
    runner(args) {
      d.calls.push(args);
      const q = args.find((a) => a.startsWith('query='));
      if (q && q.includes('__type')) return probeOk;
      const aliased = [...q.matchAll(/i(\d+): issue/g)].map((m) => Number(m[1]));
      assert.ok(aliased.length <= 50, `chunk exceeded 50: ${aliased.length}`);
      const repository = Object.fromEntries(aliased.map((n) => [`i${n}`, { number: n, subIssues: { nodes: [], pageInfo: { hasNextPage: false } } }]));
      return JSON.stringify({ data: { repository } });
    },
  });
  d.calls.length = 0;
  assert.strictEqual(run(nums.map(String), d), 0);
  const fetches = d.calls.filter((args) => args.some((a) => typeof a === 'string' && a.includes('subIssues(first:100)')));
  assert.strictEqual(fetches.length, 3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/fetch-sub-issues-cli.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `plugin/bin/fetch-sub-issues.js`**

Mirror `resolve-blockers.js` verbatim in structure (header comment explaining the worktree single-command rationale and exit codes; `parseArgs` accepting zero-or-more positive-integer positionals; `parseRepo`; `realDeps` with `ghAvailable`/`remoteUrl`/`runner`/`stdout`/`stderr`; `run(argv, deps)`; `module.exports = { run, parseArgs, parseRepo }`; `process.exitCode` main guard). Core of `run` after the arg/gh/repo gates (identical to resolve-blockers'):

```js
  const { probeSchema } = require('./lib/issues/capabilities-probe');
  if (!probeSchema(deps.runner).subIssues) {
    deps.stderr('fetch-sub-issues.js: the subIssues GraphQL field is unavailable on this host — fall back to the per-parent REST loop\n');
    return 4;
  }
  const byParent = {};
  const retry = [];
  try {
    for (let i = 0; i < opts.numbers.length; i += 50) {
      const chunk = opts.numbers.slice(i, i + 50);
      const res = fetchNativeSubIssues({ numbers: chunk, owner, repo, runner: deps.runner });
      for (const [n, subs] of res.byParent) byParent[n] = subs;
      retry.push(...res.retry);
    }
  } catch (err) {
    deps.stderr(`fetch-sub-issues.js: ${err && err.message ? err.message : String(err)}\n`);
    return 3;
  }
  deps.stdout(`${JSON.stringify({ byParent, retry })}\n`);
  return 0;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/fetch-sub-issues-cli.test.js`
Expected: PASS.

- [ ] **Step 5: Add the CLI to `docs/plugin-structure.md`**

One row in the standalone-CLI list, beside `resolve-blockers.js`, e.g.: `fetch-sub-issues.js — batched native sub-issue enumeration (probe-gated aliased GraphQL, chunked at 50, {byParent, retry} envelope; exit 4 = field unavailable, fall back to the REST loop)`.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/fetch-sub-issues.js tests/fetch-sub-issues-cli.test.js docs/plugin-structure.md
git commit -m "Add fetch-sub-issues.js CLI — probe-gated chunked sub-issue batch fetch (refs #1097)"
```

---

### Task 4: `subIssuesPath` session snapshot slot

**Files:**
- Modify: `plugin/bin/lib/issues/record-snapshot.js` (add `subIssuesPath`, fold into `invalidateSnapshot`, export)
- Test: `tests/bin-lib/issues/record-snapshot.test.js` (extend existing suite)

**Interfaces:**
- Consumes: existing `resolveSessionId` helper.
- Produces: `subIssuesPath(sessionId) -> string | null` — `path.join(os.tmpdir(), 'ct-subissues-' + id + '.json')`, null on falsy id (same contract as `gitLogPath`). `invalidateSnapshot` now unlinks all three files.

- [ ] **Step 1: Write the failing tests** (extend the existing suite's patterns — match how it tests `gitLogPath`/`invalidateSnapshot` today, adding:)

```js
test('subIssuesPath mirrors gitLogPath: tmpdir path keyed by session id, null on falsy id', () => {
  assert.strictEqual(subIssuesPath(null), null);
  assert.ok(subIssuesPath('abc').endsWith(`ct-subissues-abc.json`));
});

test('invalidateSnapshot also removes the sub-issues snapshot', () => {
  // follow the existing invalidateSnapshot test's temp-file arrangement, adding a
  // ct-subissues-{id}.json file and asserting it is gone afterward
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/bin-lib/issues/record-snapshot.test.js` → FAIL.

- [ ] **Step 3: Implement** — copy `gitLogPath`'s three-line shape with the `ct-subissues-${id}.json` name; add `subIssuesPath(sessionId)` to `invalidateSnapshot`'s loop array and to `module.exports`.

- [ ] **Step 4: Run to verify pass** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/issues/record-snapshot.js tests/bin-lib/issues/record-snapshot.test.js
git commit -m "Add session-scoped sub-issues snapshot path + invalidation (refs #1097)"
```

---

### Task 5: `_shared/trust-table.md` native branch rewrite

**Files:**
- Modify: `plugin/skills/_shared/trust-table.md` (the `work-links: native` block, currently lines 109–132)

**Interfaces:**
- Consumes: Task 3's CLI (exit-code contract), Task 4's `subIssuesPath`.
- Produces: prose only. The `body-text` branch, the parent-issue fetches, truncation warnings, `record-queue-fetch.md` citation, and everything after `/tmp/trust-table-sub-issues.json` is written stay byte-identical.

- [ ] **Step 1: Replace the native-branch block.** Keep the two opening fetch lines (`LIMIT=...`, `export FETCH_LIMIT=...`, the `gh issue list --label parent-issue ...` fetch and its truncation-warning `node -e`) unchanged. Replace the `: > ...jsonl` + `while read` loop + assembling `node -e` with, in order:

1. A snapshot read-fresh-or-fetch paragraph + block mirroring the git-log one (lines 150–160 of the current file): resolve `SUBSNAP` via `subIssuesPath(process.env.CLAUDE_CODE_SESSION_ID)`, check `isFresh` against `record-snapshot-ttl-seconds`; when fresh, `cp "$SUBSNAP" /tmp/trust-table-sub-issues.json` and skip the fetch below.
2. The batched fetch (single command, xargs-fed so an empty parent list stays valid — the CLI's zero-positional contract):

```bash
node -e "require('/tmp/trust-table-parent-issues.json').forEach(p => console.log(p.number))" | xargs node "${CLAUDE_PLUGIN_ROOT}/bin/fetch-sub-issues.js" > /tmp/trust-table-sub-issues-batch.json
```

3. The exit-code branch prose: exit 4 → run the retained REST-loop fallback block below for **all** parents (the current loop, kept verbatim under a "Fallback (probe unavailable — older GHE)" heading); exit 3 → the run fails loud, no verdict rendered (name the failed parents from stderr); exit 0 → continue.
4. The retry ladder (single `node -e`, valid JS, no shell loop): read the batch envelope; for each `retry` parent run `gh api --paginate repos/{owner}/{repo}/issues/{n}/sub_issues` via `execFileSync` inside the snippet; a retry parent whose REST call also fails throws with the parent number named (fail loud — never coerce to empty). When any parents were retried, print one `WARNING:` line naming them (same posture as the truncation warnings). Then canonicalize — flatten all `byParent` values + retry results, numeric sort, dedup — and write both `/tmp/trust-table-sub-issues.json` and (when `SUBSNAP` is non-empty) the snapshot copy. The snapshot is written **only** on full success — the throw above prevents a partial write.
5. A closing paragraph stating the error ladder explicitly (alias → per-parent REST retry → loud failure; `hasNextPage` joins retry; partial sets never used) and that both paths produce the same canonicalized file (the downstream consumer is a `Set` — `trustRows` wraps it — so canonical order is the equality bar).

- [ ] **Step 2: Verify conformance invariants**

Run: `node --test tests/record-queue-fetch-conformance.test.js tests/node-e-snippet-syntax.test.js`
Expected: PASS (citation retained, no bare fetch added, new snippets parse).

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/_shared/trust-table.md
git commit -m "Trust table: batched probe-gated sub-issue fetch + session snapshot (refs #1097)"
```

---

### Task 6: `_shared/github-pr-scan-acceptance.md` — migrate both loop sites

**Files:**
- Modify: `plugin/skills/_shared/github-pr-scan-acceptance.md` (acceptance-gap native branch, currently lines 138–172; parent-gate native branch, currently lines 372–404)

**Interfaces:**
- Consumes: Task 3's CLI.
- Produces: prose only. Downstream artifacts keep their exact paths and shapes: `/tmp/tidy-acceptance-gap-sub-issues.json` (flat number array), `/tmp/tidy-parent-gates.json` (per-parent gate rows).

- [ ] **Step 1: Acceptance-gap site.** Keep the dual-label parent fetches + dedup/warning `node -e` unchanged. Replace the `while read` loop + flatten snippet with: the same `xargs node "${CLAUDE_PLUGIN_ROOT}/bin/fetch-sub-issues.js"` single command (fed from `/tmp/tidy-parents-for-gap.json`) writing `/tmp/tidy-gap-sub-issues-batch.json`; one `node -e` retry-ladder + flatten snippet (same shape as Task 5's, flattening `byParent` + retry results into `/tmp/tidy-acceptance-gap-sub-issues.json`); exit-4 fallback keeping today's REST loop verbatim. No session snapshot here — these scans are /tidy-scoped, and the spec's snapshot deliverable is the trust table's.

- [ ] **Step 2: Parent-gate site.** Same replacement, but the assembling `node -e` keeps per-parent grouping: from the envelope's `byParent` (+ per-parent retry results), emit the existing `{ number, subIssueNumbers }` rows into the existing composing snippet (adapt it to read the envelope instead of `/tmp/tidy-sub-issues.jsonl`), leaving the `gates` construction and `/tmp/tidy-parent-gates.json` write untouched. Exit-4 fallback keeps today's loop verbatim.

- [ ] **Step 3: Verify** — `node --test tests/node-e-snippet-syntax.test.js` → PASS; grep the file for `while read -r N` and confirm each remaining occurrence sits only inside a clearly-labeled fallback block.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/_shared/github-pr-scan-acceptance.md
git commit -m "Acceptance scans: batched sub-issue fetch with REST-loop fallback (refs #1097)"
```

---

### Task 7: Stage 4.8 check, full suite, ledger

**Files:**
- Read: `plugin/skills/help/status-scan.md` (Stage 4.8)
- Modify: `docs/plans/2026-08-20-record-1097-ledger.md` (resolution notes only, if any item lands)

- [ ] **Step 1: Confirm Stage 4.8 inlines dynamically.** `grep -n "sub_issues\|while read" plugin/skills/help/status-scan.md` — expected: no restated fetch loop (it inlines trust-table.md's Fetch section by instruction). If a restated copy exists, update it to match Task 5's text.

- [ ] **Step 2: Full suite** — `npm test` redirected to a file, then read the tail. Expected: 0 failures. Byte-pinned prose suites and `node-e-snippet-syntax` are the risk surface; fix any pin the rewrite legitimately moved.

- [ ] **Step 3: Commit** (only if Step 1 or ledger edits produced changes)

```bash
git add -A
git commit -m "Stage 4.8 check + suite pass for batched sub-issue fetch (refs #1097)"
```
