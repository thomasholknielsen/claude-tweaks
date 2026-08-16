# link-records helper (#610) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/specify` Step 4's hand-assembled per-edge `gh api` linking calls with one CLI — `bin/link-records.js` over `bin/lib/issues/link.js` — that resolves every needed database ID in one GraphQL call and issues the `sub_issues` and `blocked_by` writes; document it in `record-creation.md`, plugin-structure, and give `red-team.md`'s synthesis singleton the decision context it lacks.

**Architecture:** A pure module (`link.js`) with an injectable `runner(args)` exactly like `bin/lib/issues/capabilities-probe.js` — one aliased GraphQL `databaseId` query, then per-edge REST POSTs each independently try/caught into `{ok, failed}`; a thin arg-parsing CLI (`link-records.js`) that resolves owner/repo from `git remote`, requires `gh` (exit 2 with a `work-links: body-text` fallback message when absent — there is no MCP equivalent for these two endpoints), and prints one JSON envelope. Tests use a fake runner (no real `gh`), the same style as `tests/bin-lib/issues/capabilities-probe.test.js`. Prose edits then point at the one command.

**Tech Stack:** Node 18+ built-ins only (`child_process.execFileSync`, `fs`); `node:test` + `node:assert/strict`; markdown skill files.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T163452-spec-608-610/spec-610/work/610-spec.md`

## Global Constraints

- Only these files may change (spec AC 7): `bin/link-records.js` (new), `bin/lib/issues/link.js` (new), `skills/specify/record-creation.md`, `skills/specify/red-team.md`, `docs/plugin-structure.md`, `tests/bin-lib/issues/link.test.js` (new). Also permitted, because #608 landed first on this same branch and its pin must follow the helper (spec Technical Approach): `tests/specify-record-creation-linking.test.js` — its assertions are updated to pin the helper invocation, never deleted.
- Node built-ins only — no new package dependencies (`bin/` convention).
- Modules live flat under `bin/lib/issues/` — no nested `_shared/` wrapper.
- `gh` is required for these two endpoints; **never** add an MCP mapping to `_shared/github-write-transport.md` (`git diff -- skills/_shared/github-write-transport.md` must be empty). The honest fallback is `work-links: body-text`.
- REST id fields are sent as integers (`-F`); GraphQL asks for `databaseId`, never node `id`.
- Never write the tokens `TBD` / `TODO` / `<!-- ambiguity:` into any file.
- Commit style `{Verb} {what} — {detail}`, `refs #610`, never `closes`/`fixes`.
- Working directory for every command: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-608-610` (branch `worktree-flow-spec-608-610`).

---

### Task 1: `bin/lib/issues/link.js` — id resolution + writes (TDD)

**Files:**
- Create: `bin/lib/issues/link.js`
- Test: `tests/bin-lib/issues/link.test.js`

**Interfaces:**
- Produces (Task 2 consumes exactly these):
  - `resolveDatabaseIds({ owner, repo, numbers, runner = defaultRunner }) → Map<number, number>` — one GraphQL call; throws `Error('missing databaseId for #N, #M')` when any requested number resolves to no `databaseId` (never a silent partial map).
  - `linkSubIssues({ owner, repo, parent, subs, ids, runner = defaultRunner }) → { ok: [{number, already}], failed: [{number, error}] }` — one `POST repos/{owner}/{repo}/issues/{parent}/sub_issues -F sub_issue_id=<ids.get(sub)>` per sub; each independently try/caught.
  - `linkBlockedBy({ owner, repo, edges, ids, runner = defaultRunner }) → { ok: [{dependent, blocker, already}], failed: [{dependent, blocker, error}] }` — one `POST repos/{owner}/{repo}/issues/{dependent}/dependencies/blocked_by -F issue_id=<ids.get(blocker)>` per edge.
  - `isAlreadyLinkedError(err) → boolean` — true when the runner threw with a 422 body whose message contains `already` (GitHub's "already exists"/"already a sub-issue"/"already blocked" family) — such an edge lands in `ok` with `already: true`.
  - `defaultRunner(args)` — `execFileSync('gh', args, { encoding: 'utf8' })`.
- Runner contract (mirrors `capabilities-probe.js`): `runner(args)` is called as if `gh ${args.join(' ')}` and returns stdout; a thrown error is a failed call.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/issues/link.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveDatabaseIds, linkSubIssues, linkBlockedBy, isAlreadyLinkedError,
} = require('../../../bin/lib/issues/link');

// Fake runners are lazy functions inspecting `args` only when called (CLAUDE.md's eager-IIFE ban).
const isGraphQL = (args) => args[0] === 'api' && args[1] === 'graphql';
const isPost = (args, path) => args[0] === 'api' && args[1] === '-X' && args[2] === 'POST' && args[3] === path;
const fieldOf = (args, name) => { const i = args.indexOf('-F'); const all = []; for (let k = 0; k < args.length; k++) if (args[k] === '-F') all.push(args[k + 1]); const hit = all.find((v) => v.startsWith(name + '=')); return hit ? hit.slice(name.length + 1) : undefined; };

function graphqlJSON(map) {
  const repository = {};
  for (const [n, id] of Object.entries(map)) repository[`i${n}`] = id == null ? null : { databaseId: id };
  return JSON.stringify({ data: { repository } });
}

test('resolveDatabaseIds: one GraphQL call with one alias per number, returns a Map', () => {
  const calls = [];
  const runner = (args) => { calls.push(args); if (isGraphQL(args)) return graphqlJSON({ 595: 5164237962, 597: 5164238330, 592: 5164219255 }); throw new Error('unexpected'); };
  const ids = resolveDatabaseIds({ owner: 'acme', repo: 'w', numbers: [595, 597, 592], runner });
  assert.equal(calls.length, 1, 'exactly one runner call');
  const q = calls[0].join(' ');
  assert.match(q, /i595: issue\(number:595\)\{ databaseId \}/);
  assert.match(q, /i597: issue\(number:597\)\{ databaseId \}/);
  assert.match(q, /i592: issue\(number:592\)\{ databaseId \}/);
  assert.match(q, /-F owner=acme -F repo=w/, 'owner/repo passed with -F');
  assert.equal(ids.get(595), 5164237962);
  assert.equal(ids.get(592), 5164219255);
});

test('resolveDatabaseIds: dedupes numbers and throws on any missing id (never a partial map)', () => {
  const runner = (args) => { if (isGraphQL(args)) return graphqlJSON({ 595: 1, 597: null }); throw new Error('unexpected'); };
  assert.throws(
    () => resolveDatabaseIds({ owner: 'a', repo: 'b', numbers: [595, 597, 595], runner }),
    /missing databaseId for #597/,
  );
});

test('linkSubIssues: one POST per sub with the databaseId (never the number); one failure leaves siblings in ok', () => {
  const ids = new Map([[595, 111], [597, 222]]);
  const runner = (args) => {
    if (isPost(args, 'repos/acme/w/issues/592/sub_issues')) {
      const v = fieldOf(args, 'sub_issue_id');
      if (v === '222') throw new Error('HTTP 500 boom');
      return '{}';
    }
    throw new Error('unexpected ' + args.join(' '));
  };
  const r = linkSubIssues({ owner: 'acme', repo: 'w', parent: 592, subs: [595, 597], ids, runner });
  assert.deepEqual(r.ok.map((o) => o.number), [595]);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].number, 597);
  assert.match(r.failed[0].error, /boom/);
});

test('linkSubIssues: never sends the issue number as sub_issue_id', () => {
  const ids = new Map([[595, 111]]);
  const seen = [];
  const runner = (args) => { seen.push(fieldOf(args, 'sub_issue_id')); return '{}'; };
  linkSubIssues({ owner: 'a', repo: 'b', parent: 592, subs: [595], ids, runner });
  assert.deepEqual(seen, ['111']);
});

test('linkBlockedBy: POST on the dependent with the blocker databaseId; 422 already-exists lands in ok with already:true', () => {
  const ids = new Map([[608, 10], [610, 20]]);
  const runner = (args) => {
    if (isPost(args, 'repos/acme/w/issues/610/dependencies/blocked_by')) {
      assert.equal(fieldOf(args, 'issue_id'), '10');
      const e = new Error('HTTP 422: Validation Failed'); e.stderr = '{"message":"Issue is already blocked by this issue"}'; throw e;
    }
    throw new Error('unexpected ' + args.join(' '));
  };
  const r = linkBlockedBy({ owner: 'acme', repo: 'w', edges: [{ dependent: 610, blocker: 608 }], ids, runner });
  assert.equal(r.failed.length, 0);
  assert.deepEqual(r.ok, [{ dependent: 610, blocker: 608, already: true }]);
});

test('isAlreadyLinkedError: only a 422 whose message mentions already', () => {
  const e1 = new Error('HTTP 422'); e1.stderr = '{"message":"already a sub-issue"}';
  const e2 = new Error('HTTP 422'); e2.stderr = '{"message":"Validation Failed"}';
  const e3 = new Error('HTTP 500'); e3.stderr = '{"message":"already"}';
  assert.equal(isAlreadyLinkedError(e1), true);
  assert.equal(isAlreadyLinkedError(e2), false);
  assert.equal(isAlreadyLinkedError(e3), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/bin-lib/issues/link.test.js`
Expected: FAIL — `Cannot find module '../../../bin/lib/issues/link'`.

- [ ] **Step 3: Write the module**

Create `bin/lib/issues/link.js`:

```js
// bin/lib/issues/link.js
// Native linking for /specify Step 4 (work-backend: github-issues, work-links:
// native): resolve every needed integer databaseId in ONE aliased GraphQL call,
// then issue the two REST writes GitHub exposes for issue relationships —
//   POST repos/{o}/{r}/issues/{parent}/sub_issues            -F sub_issue_id=<databaseId>
//   POST repos/{o}/{r}/issues/{dependent}/dependencies/blocked_by -F issue_id=<databaseId>
// Both endpoints take the target issue's integer database ID in the body, never
// its issue number (#608). The parent / dependent appear only as numbers in the
// path. Each write is independently try/caught into {ok, failed} so one failed
// edge never aborts the rest — the same "a failed link gets noted and the pass
// continues" rule record-creation.md Step 4 states. A 422 whose message says
// "already …" is a re-run, not a failure: it lands in ok with already:true.
// The runner is injectable (never the real `gh` in tests): runner(args) is
// invoked as if `gh ${args.join(' ')}` and returns stdout — the same contract
// as capabilities-probe.js. These two endpoints have no GitHub MCP equivalent,
// so this module requires `gh`; the CLI wrapper names the work-links: body-text
// fallback when it is absent.
'use strict';

const { execFileSync } = require('child_process');

function defaultRunner(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function errorText(err) {
  const parts = [err && err.message, err && err.stderr, err && err.stdout].filter(Boolean).map(String);
  return parts.join(' ');
}

// A 422 whose message says the relationship already exists — a re-run, not a failure.
function isAlreadyLinkedError(err) {
  const text = errorText(err);
  return /\b422\b/.test(text) && /already/i.test(text);
}

// { owner, repo, numbers, runner } -> Map<number, databaseId>. One GraphQL call,
// one `i{N}` alias per distinct number; throws when any number resolves to no
// databaseId (a partial map would let a caller POST sub_issue_id=undefined).
function resolveDatabaseIds({ owner, repo, numbers, runner = defaultRunner }) {
  const distinct = [...new Set(numbers.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (distinct.length === 0) return new Map();
  const fields = distinct.map((n) => `i${n}: issue(number:${n}){ databaseId }`).join(' ');
  const query = `query($owner:String!,$repo:String!){ repository(owner:$owner,name:$repo){ ${fields} } }`;
  const out = runner(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `repo=${repo}`]);
  const parsed = JSON.parse(out);
  const repository = parsed && parsed.data && parsed.data.repository;
  const ids = new Map();
  const missing = [];
  for (const n of distinct) {
    const node = repository ? repository[`i${n}`] : null;
    const id = node && Number.isInteger(node.databaseId) ? node.databaseId : null;
    if (id === null) missing.push(n);
    else ids.set(n, id);
  }
  if (missing.length) throw new Error(`missing databaseId for ${missing.map((n) => `#${n}`).join(', ')}`);
  return ids;
}

function post({ runner, path, field, value }) {
  return runner(['api', '-X', 'POST', path, '-F', `${field}=${value}`]);
}

// { owner, repo, parent, subs, ids, runner } -> { ok: [{number, already}], failed: [{number, error}] }
function linkSubIssues({ owner, repo, parent, subs, ids, runner = defaultRunner }) {
  const ok = [];
  const failed = [];
  for (const sub of subs) {
    const id = ids.get(Number(sub));
    if (id === undefined) { failed.push({ number: sub, error: 'no databaseId resolved' }); continue; }
    try {
      post({ runner, path: `repos/${owner}/${repo}/issues/${parent}/sub_issues`, field: 'sub_issue_id', value: id });
      ok.push({ number: sub, already: false });
    } catch (err) {
      if (isAlreadyLinkedError(err)) ok.push({ number: sub, already: true });
      else failed.push({ number: sub, error: errorText(err) });
    }
  }
  return { ok, failed };
}

// { owner, repo, edges: [{dependent, blocker}], ids, runner } -> same shape, keyed by edge
function linkBlockedBy({ owner, repo, edges, ids, runner = defaultRunner }) {
  const ok = [];
  const failed = [];
  for (const { dependent, blocker } of edges) {
    const id = ids.get(Number(blocker));
    if (id === undefined) { failed.push({ dependent, blocker, error: 'no databaseId resolved' }); continue; }
    try {
      post({ runner, path: `repos/${owner}/${repo}/issues/${dependent}/dependencies/blocked_by`, field: 'issue_id', value: id });
      ok.push({ dependent, blocker, already: false });
    } catch (err) {
      if (isAlreadyLinkedError(err)) ok.push({ dependent, blocker, already: true });
      else failed.push({ dependent, blocker, error: errorText(err) });
    }
  }
  return { ok, failed };
}

module.exports = { resolveDatabaseIds, linkSubIssues, linkBlockedBy, isAlreadyLinkedError, defaultRunner };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/link.test.js`
Expected: PASS — 6 tests, 0 failures.

- [ ] **Step 5: Discrimination check for the identifier assertion (one command)**

Temporarily make `linkSubIssues` send the number instead of the id and confirm the test fails, then restore, in ONE command:

```bash
cp bin/lib/issues/link.js /tmp/610-link.js && sed -i '' "s/field: 'sub_issue_id', value: id }/field: 'sub_issue_id', value: sub }/" bin/lib/issues/link.js && node --test tests/bin-lib/issues/link.test.js; cp /tmp/610-link.js bin/lib/issues/link.js
```

Expected: the middle run FAILS (`never sends the issue number` and the first `linkSubIssues` test); then `node --test tests/bin-lib/issues/link.test.js` → PASS again.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/link.js tests/bin-lib/issues/link.test.js
git commit -m "Add bin/lib/issues/link.js — one-call databaseId resolution and sub_issues/blocked_by writes with injectable runner — refs #610"
```

---

### Task 2: `bin/link-records.js` CLI

**Files:**
- Create: `bin/link-records.js`
- Test: `tests/bin-lib/issues/link.test.js` (append CLI tests)

**Interfaces:**
- Consumes: Task 1's four exports (exact names above).
- Produces: `node bin/link-records.js --parent <n> --subs <n,n,…> [--blocked-by "<dependent:blocker>,…"] [--repo owner/name] [--help]`. Prints one JSON envelope `{ repo, ids: {"<n>": id}, subIssues: {ok, failed}, blockedBy: {ok, failed} }`. Exit codes: `0` success or partial-with-`failed`; `1` databaseId resolution failed (message on stderr); `2` malformed invocation, or `gh` unavailable (stderr names the `work-links: body-text` fallback). Owner/repo from `--repo`, else `git remote get-url origin` parsed for `github.com[:/]owner/name(.git)`.
- Testable seam: the CLI's logic lives in an exported `run(argv, deps)` where `deps = { runner, ghAvailable, remoteUrl, stdout, stderr }` — `require.main === module` calls `run(process.argv.slice(2), realDeps)`; tests call `run` with fakes.

- [ ] **Step 1: Write the failing CLI tests (append to `tests/bin-lib/issues/link.test.js`)**

```js
const { run } = require('../../../bin/link-records');

function cliDeps({ runner, ghAvailable = true, remoteUrl = 'https://github.com/acme/w.git' } = {}) {
  const out = []; const err = [];
  return { deps: { runner, ghAvailable: () => ghAvailable, remoteUrl: () => remoteUrl, stdout: (s) => out.push(s), stderr: (s) => err.push(s) }, out, err };
}

test('link-records CLI: --help exits 0 and prints usage', () => {
  const { deps, out } = cliDeps({ runner: () => { throw new Error('must not call gh'); } });
  const code = run(['--help'], deps);
  assert.equal(code, 0);
  assert.match(out.join(''), /--parent <n> --subs <n,n,\.\.\.>/);
});

test('link-records CLI: gh absent exits 2 and names the body-text fallback', () => {
  const { deps, err } = cliDeps({ runner: () => { throw new Error('must not call gh'); }, ghAvailable: false });
  const code = run(['--parent', '592', '--subs', '595'], deps);
  assert.equal(code, 2);
  assert.match(err.join(''), /work-links: body-text/);
});

test('link-records CLI: happy path — 1 GraphQL + 1 sub_issues + 1 blocked_by, numeric ids in bodies, envelope printed', () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (isGraphQL(args)) return graphqlJSON({ 592: 1, 595: 2, 598: 3 });
    if (isPost(args, 'repos/acme/w/issues/592/sub_issues')) { assert.equal(fieldOf(args, 'sub_issue_id'), '2'); return '{}'; }
    if (isPost(args, 'repos/acme/w/issues/598/dependencies/blocked_by')) { assert.equal(fieldOf(args, 'issue_id'), '2'); return '{}'; }
    throw new Error('unexpected ' + args.join(' '));
  };
  const { deps, out } = cliDeps({ runner });
  const code = run(['--parent', '592', '--subs', '595', '--blocked-by', '598:595'], deps);
  assert.equal(code, 0);
  assert.equal(calls.filter(isGraphQL).length, 1);
  assert.equal(calls.filter((a) => a[1] === '-X').length, 2);
  const env = JSON.parse(out.join(''));
  assert.equal(env.repo, 'acme/w');
  assert.deepEqual(env.subIssues.ok.map((o) => o.number), [595]);
  assert.deepEqual(env.blockedBy.ok.map((o) => o.dependent), [598]);
});

test('link-records CLI: id resolution failure exits 1', () => {
  const runner = (args) => (isGraphQL(args) ? graphqlJSON({ 592: 1, 595: null }) : '{}');
  const { deps, err } = cliDeps({ runner });
  const code = run(['--parent', '592', '--subs', '595'], deps);
  assert.equal(code, 1);
  assert.match(err.join(''), /missing databaseId for #595/);
});

test('link-records CLI: partial write failure still exits 0 with failed populated', () => {
  const runner = (args) => {
    if (isGraphQL(args)) return graphqlJSON({ 592: 1, 595: 2, 597: 3 });
    if (isPost(args, 'repos/acme/w/issues/592/sub_issues') && fieldOf(args, 'sub_issue_id') === '3') throw new Error('HTTP 500');
    return '{}';
  };
  const { deps, out } = cliDeps({ runner });
  const code = run(['--parent', '592', '--subs', '595,597'], deps);
  assert.equal(code, 0);
  const env = JSON.parse(out.join(''));
  assert.equal(env.subIssues.failed.length, 1);
  assert.equal(env.subIssues.failed[0].number, 597);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/bin-lib/issues/link.test.js`
Expected: FAIL — `Cannot find module '../../../bin/link-records'`.

- [ ] **Step 3: Write the CLI**

Create `bin/link-records.js`:

```js
#!/usr/bin/env node
// bin/link-records.js — /specify Step 4 native linking in one command.
//   node bin/link-records.js --parent <n> --subs <n,n,...> [--blocked-by "<dependent:blocker>,..."] [--repo owner/name] [--help]
// One GraphQL databaseId batch (every number appearing in --parent/--subs/--blocked-by),
// then the sub_issues + blocked_by POSTs via bin/lib/issues/link.js. Prints one JSON
// envelope. Exit 0 on success or partial-with-`failed` (the caller reads `failed`);
// 1 when databaseId resolution fails; 2 on a malformed invocation or when `gh` is
// absent — these two endpoints have no GitHub MCP equivalent, so the fallback is
// `work-links: body-text` (record-creation.md Step 4's text-based linking).
'use strict';

const { execFileSync } = require('child_process');
const link = require('./lib/issues/link');

const USAGE = 'usage: link-records.js --parent <n> --subs <n,n,...> [--blocked-by "<dependent:blocker>,..."] [--repo owner/name] [--help]\n';

function parseArgs(argv) {
  const opts = { parent: null, subs: [], blockedBy: [], repo: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--parent') opts.parent = Number(next());
    else if (a === '--subs') opts.subs = String(next() || '').split(',').filter(Boolean).map(Number);
    else if (a === '--blocked-by') opts.blockedBy = String(next() || '').split(',').filter(Boolean).map((pair) => {
      const [dependent, blocker] = pair.split(':').map(Number);
      return { dependent, blocker };
    });
    else if (a === '--repo') opts.repo = next();
    else return { error: `unknown argument: ${a}` };
  }
  return opts;
}

function parseRepo(url) {
  const m = /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/.exec(String(url || '').trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

const realDeps = {
  runner: link.defaultRunner,
  ghAvailable: () => { try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } },
  remoteUrl: () => execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

// argv -> exit code. All I/O through deps so tests never touch gh or git.
function run(argv, deps = realDeps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(opts.error + '\n' + USAGE); return 2; }
  if (opts.help) { deps.stdout(USAGE); return 0; }
  const bad = !Number.isInteger(opts.parent) || opts.subs.length === 0 || opts.subs.some((n) => !Number.isInteger(n))
    || opts.blockedBy.some((e) => !Number.isInteger(e.dependent) || !Number.isInteger(e.blocker));
  if (bad) { deps.stderr(USAGE); return 2; }
  if (!deps.ghAvailable()) {
    deps.stderr('link-records.js: `gh` is required — the sub_issues and dependencies/blocked_by endpoints have no GitHub MCP equivalent. Fall back to work-links: body-text (record-creation.md Step 4).\n');
    return 2;
  }
  const repoSpec = opts.repo ? parseRepo(`github.com/${opts.repo}`) : parseRepo(deps.remoteUrl());
  if (!repoSpec) { deps.stderr('link-records.js: could not resolve owner/repo — pass --repo owner/name\n'); return 2; }
  const { owner, repo } = repoSpec;
  const numbers = [opts.parent, ...opts.subs, ...opts.blockedBy.flatMap((e) => [e.dependent, e.blocker])];
  let ids;
  try {
    ids = link.resolveDatabaseIds({ owner, repo, numbers, runner: deps.runner });
  } catch (err) {
    deps.stderr(`link-records.js: ${err.message}\n`);
    return 1;
  }
  const subIssues = link.linkSubIssues({ owner, repo, parent: opts.parent, subs: opts.subs, ids, runner: deps.runner });
  const blockedBy = link.linkBlockedBy({ owner, repo, edges: opts.blockedBy, ids, runner: deps.runner });
  const idsObj = {}; for (const [n, id] of ids) idsObj[String(n)] = id;
  deps.stdout(JSON.stringify({ repo: `${owner}/${repo}`, ids: idsObj, subIssues, blockedBy }, null, 2) + '\n');
  return 0;
}

module.exports = { run, parseArgs, parseRepo };

if (require.main === module) process.exit(run(process.argv.slice(2), realDeps));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/link.test.js`
Expected: PASS — 11 tests, 0 failures. Also `node bin/link-records.js --help` prints the usage line and exits 0 (real deps, no gh call on `--help`).

- [ ] **Step 5: Commit**

```bash
git add bin/link-records.js tests/bin-lib/issues/link.test.js
git commit -m "Add bin/link-records.js CLI — one-command native linking with gh-required posture and JSON envelope — refs #610"
```

---

### Task 3: `record-creation.md` Step 4 cites the one command; re-pin the prose test

**Files:**
- Modify: `skills/specify/record-creation.md:230-275` (the `work-links: native` block — from `**\`work-backend: github-issues\`, \`work-links: native\`:**` through the `- No body edits needed for native linking …` bullet)
- Modify: `tests/specify-record-creation-linking.test.js` (re-pin to the helper invocation)

**Interfaces:**
- Consumes: the CLI's argument shape and exit codes from Task 2.

- [ ] **Step 1: Re-pin the prose test first (red)**

Replace the ENTIRE contents of `tests/specify-record-creation-linking.test.js` with:

```js
'use strict';

// Pins skills/specify/record-creation.md Step 4's native-linking procedure to the
// one helper command (bin/link-records.js, #610), which owns the two facts #608
// first pinned: the sub_issues endpoint takes the sub-issue's database ID (never
// its number) and the blocked_by dependency endpoint must be named. The prose
// must cite the helper and must not carry a raw `sub_issue_id=` snippet any more —
// the module test (tests/bin-lib/issues/link.test.js) is where the identifier
// discrimination now lives.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'skills', 'specify', 'record-creation.md');
const text = fs.readFileSync(FILE, 'utf8');

test('native linking cites bin/link-records.js with its argument shape', () => {
  assert.match(text, /bin\/link-records\.js/, 'record-creation.md must cite the helper');
  assert.match(text, /--parent \$PARENT_NUM --subs/, 'the invocation must show --parent/--subs');
  assert.match(text, /--blocked-by/, 'the invocation must show --blocked-by for dependency edges');
});

test('no raw sub_issues or blocked_by write snippet remains in the native branch', () => {
  assert.doesNotMatch(text, /sub_issue_id=/, 'the raw sub_issues write moved into bin/lib/issues/link.js');
  assert.doesNotMatch(text, /-F issue_id=/, 'the raw blocked_by write moved into bin/lib/issues/link.js');
});

test('the gh-absent posture names the body-text fallback, not an MCP path', () => {
  assert.match(text, /requires `gh`/, 'must say the helper requires gh');
  assert.match(text, /work-links: body-text/, 'must name the body-text fallback');
  assert.doesNotMatch(text, /no MCP equivalent[^.]*create_or_update_file/, 'never claim an MCP path for these endpoints');
});

test('the caller is told to read `failed`', () => {
  assert.match(text, /`failed`/, 'the prose must tell the caller to read the envelope\'s failed list');
});
```

Run: `node --test tests/specify-record-creation-linking.test.js`
Expected: FAIL — the first, second, third, and fourth tests all fail against the current file (helper not cited; raw snippets present).

- [ ] **Step 2: Replace the native-linking block**

In `skills/specify/record-creation.md`, replace everything from the line `**\`work-backend: github-issues\`, \`work-links: native\`:**` (line ~230) through the line `- No body edits needed for native linking — the relationships live in GitHub's own graph, not in text.` (line ~275), inclusive, with EXACTLY:

````markdown
**`work-backend: github-issues`, `work-links: native`:**

- **One command links the whole batch.** Both native write endpoints take the target issue's
  integer database ID (`databaseId`) **in the request body**, never its issue number, and the
  dependency edge lives at `issues/{dependent}/dependencies/blocked_by` — `bin/link-records.js`
  (over `bin/lib/issues/link.js`) resolves every needed id in one GraphQL call and issues the
  writes, so no per-edge `gh api` assembly happens here. Pass the parent, every sub-issue, and
  every dependency edge as `dependent:blocker` (blockers may be pre-existing records from Step 1's
  companion overlaps or Step 2's implicit-dependency notes):

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/bin/link-records.js" --parent $PARENT_NUM --subs $SUB_ISSUE_NUMS \
    --blocked-by "$DEP_EDGES" > /tmp/specify-link-result.json
  # $SUB_ISSUE_NUMS = comma-joined sub-issue numbers; $DEP_EDGES = "598:595,600:530,..." (omit
  # --blocked-by when there are no edges). Owner/repo resolve from `origin`; pass --repo owner/name
  # to override.
  ```

  Read the envelope's `subIssues.failed` and `blockedBy.failed` — a non-empty list is the
  Write-path resilience case above (note the failed link, continue the pass; never abort the
  decomposition). Exit 1 means the id resolution itself failed (a number that resolves to no
  issue) — stop and check the numbers before retrying. A re-run is safe: an edge GitHub already
  holds lands in `ok` with `already: true`.

- **`gh` is required for this command** — the sub-issues and issue-dependencies endpoints have no
  GitHub MCP equivalent, so `_shared/github-write-transport.md`'s MCP path does not cover them.
  When `command -v gh` fails, `bin/link-records.js` exits 2 naming the fallback: link under
  `work-links: body-text` instead (the branch below, which needs only `issue_write`).

- No body edits needed for native linking — the relationships live in GitHub's own graph, not in text.
````

- [ ] **Step 3: Verify (green + negative)**

Run: `node --test tests/specify-record-creation-linking.test.js`
Expected: PASS — 4 tests.

Run: `grep -n 'sub_issue_id=\|-F issue_id=\|databaseId }' skills/specify/record-creation.md`
Expected: no output (the raw snippets and the inline GraphQL are gone from Step 4).

Run: `git diff -- skills/_shared/github-write-transport.md`
Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add skills/specify/record-creation.md tests/specify-record-creation-linking.test.js
git commit -m "Point record-creation Step 4 native linking at bin/link-records.js — gh-required posture, body-text fallback; re-pin the prose test — refs #610"
```

---

### Task 4: `red-team.md` synthesis input, `docs/plugin-structure.md` rows

**Files:**
- Modify: `skills/specify/red-team.md:56` (the "Synthesis path (record #220)" paragraph)
- Modify: `docs/plugin-structure.md` (the `bin/lib/` module list around line 18–23, and the CLI command reference around lines 81–97)

- [ ] **Step 1: red-team.md — add the decision-context sentence**

In `skills/specify/red-team.md`, in the paragraph beginning `**Synthesis path (record #220).**`, find the exact phrase:

```
the main thread hands it every persona's raw findings plus the current record body, and the agent returns the fully recomposed body
```

and replace it with:

```
the main thread hands it every persona's raw findings plus the current record body — and, when this decomposition followed a brainstorm in the same session, the brainstorm's decision summary (the design doc's rationale section, or the parent record's `## Decision Rationale` once Step 4 wrote it), since findings that turn on a design decision the record has not yet absorbed cannot be resolved from the record alone — and the agent returns the fully recomposed body
```

Run: `grep -c "decision summary" skills/specify/red-team.md`
Expected: `1`.

- [ ] **Step 2: plugin-structure.md — module row + CLI row**

(a) In the `bin/lib/` module list (the block of `bin/lib/…  →` lines near lines 18–23), add one line directly after the `bin/lib/reconcile/` line, in the same column alignment:

```
bin/lib/issues/link.js            → /specify Step 4 native linking: one aliased GraphQL databaseId batch (resolveDatabaseIds), then per-edge sub_issues + dependencies/blocked_by POSTs (linkSubIssues, linkBlockedBy) each independently try/caught into {ok, failed}; injectable runner like capabilities-probe.js. Consumed by bin/link-records.js
```

(b) In the CLI command reference (the `node bin/…` lines near lines 81–97), add one line directly after the `node bin/residue.js …` line:

```
node bin/link-records.js --parent <n> --subs <n,n,...> [--blocked-by "<dependent:blocker>,..."] [--repo owner/name]   # Link-records CLI — /specify Step 4 native linking in one command; prints a JSON envelope; exit 0 success or partial-with-`failed`, 1 databaseId resolution failed, 2 malformed invocation or `gh` absent (fallback: work-links: body-text)
```

Run: `grep -n "link-records.js\|issues/link.js" docs/plugin-structure.md`
Expected: two lines (module row + CLI row).

- [ ] **Step 3: Full suite and envelope**

Run: `npm test > /tmp/610-full.log 2>&1; echo "exit=$?"; grep -E "^# (tests|pass|fail)" /tmp/610-full.log`
Expected: `exit=0`, `# fail 0`; `# tests` = baseline 3764 − 5 (the old prose pins) + 4 (new prose pins) + 11 (link.test.js) = 3774.

Run: `git diff --stat main...HEAD -- . ':!.claude-tweaks' ':!docs/superpowers/plans' ':!docs/plans'`
Expected: `bin/link-records.js`, `bin/lib/issues/link.js`, `skills/specify/record-creation.md`, `skills/specify/red-team.md`, `docs/plugin-structure.md`, `tests/bin-lib/issues/link.test.js`, `tests/specify-record-creation-linking.test.js` — and nothing else (the #608 files are the same two prose/test files, already on this branch).

- [ ] **Step 4: Commit**

```bash
git add skills/specify/red-team.md docs/plugin-structure.md
git commit -m "Give red-team synthesis singleton the brainstorm decision context; register link-records CLI and link.js in plugin-structure — refs #610"
```
