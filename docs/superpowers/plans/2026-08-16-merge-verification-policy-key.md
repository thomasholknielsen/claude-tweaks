# merge-verification Policy Key — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `merge-verification` policy key (`merge-when-green | wait | off`) whose default is derived in code by a four-branch ladder, plus its `_shared/policy-schema.md` coverage block and its Manifesto lever row — schema + derivation + docs + tests only, no consumer behavior changes.

**Architecture:** The schema entry in `bin/lib/policy-schema.js` carries no static `default` (mirrors `integration-model`). The derivation ladder lives in a new flat sibling module `bin/lib/merge-verification.js` — it cannot live in `policy-schema.js` because branch (3)/(4) reuses `bin/lib/hooks/worktree-reap.js`'s `resolveIntegrationBranch` (the shared code resolver for `_shared/integration-branch.md`'s rank 3 + rank-5 GitHub-default half), and `worktree-reap.js → bin/lib/policy.js → policy-schema.js` would make that a require cycle. `bin/resolve-policy.js` wires the derived default exactly the way it wires `integration-model`'s.

**Tech Stack:** Node 18+ built-ins only (`fs`, `path`, `child_process`), `node --test`. No YAML library — a line-based `on:` trigger detector, since the plugin ships zero runtime npm deps.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T101528-spec-559-560/spec-559/work/559-spec.md`

## Global Constraints

- Node built-ins only — no new npm dependencies (repo convention).
- `merge-verification` enum is exactly `['merge-when-green', 'wait', 'off']`; `wait` is explicit-config-only and deliberately unreachable via derivation — do not "fix" the ladder to produce it.
- Ladder is exactly four branches, first match wins, short-circuit: (1) `integration-model` resolves `local-merge` → `off`; (2) no PR-triggered CI → `off`; (3) integration branch == repo default branch → `merge-when-green`; (4) otherwise → `off`. Any lookup/read/parse failure resolves toward `off`.
- PR-CI detection reads only `{root}/.github/workflows/*.yml|*.yaml`; a trigger of `pull_request` or `pull_request_target` in bare-string, flow-array, block-list, or mapping-key shape counts.
- Branch resolution must reuse the canonical resolver and cite `skills/_shared/integration-branch.md`; any prose naming `integration-model` must cite `skills/_shared/integration-model.md` (`tests/integration-model.test.js`, `tests/integration-branch-conformance.test.js` — both scan `skills/**/*.md`).
- The ladder is stated in prose exactly once: the `skills/_shared/policy-schema.md` coverage block. Everywhere else cites it.
- `tests/policy-schema.test.js` pins `POLICY_KEYS.length === 48` → becomes 49 (comment the bump like the prior ones). `tests/policy-schema-metadata.test.js` requires `summary` (≤140 chars, must not contain the key name, must not appear verbatim in `policy-schema.md`), `category` ∈ `POLICY_CATEGORIES`, `tier` ∈ core/advanced, and caps `core` at 12 — core is currently AT 12, so this key ships `advanced` (a comment records why).
- Commit messages: `{Verb} {what} — {detail}`, imperative, no conventional-commit prefix; reference the record as `refs #559` (never `closes`/`fixes`).
- Every task's implementer works from the shared worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-559-560` (branch `worktree-flow+spec-559-560`); verify with `pwd` + `git rev-parse --show-toplevel` before any commit. One plain Bash command per call in this session (no `&&` chains, no heredocs into tracked files — use the Write/Edit tools for file content).

---

### Task 1: Register the schema key + bump the count pin

**Files:**
- Modify: `bin/lib/policy-schema.js:29` (insert directly after the `integration-model` row)
- Modify: `tests/policy-schema.test.js:45-53` (the `POLICY_KEYS.length` pin)
- Test: `tests/merge-verification.test.js` (create — this task adds the schema-shape tests; later tasks append)

**Interfaces:**
- Produces: `POLICY_KEYS` row `{ key: 'merge-verification', type: 'enum', values: ['merge-when-green','wait','off'], summary, category: 'merge-safety', tier: 'advanced' }` with **no** `default` property. `resolvePolicyKeys(['merge-verification'], …)` therefore returns `{ value: null, source: 'default' }` when unset (that is what Task 3's `resolveMergeVerification` and Task 4's CLI wiring key on).

- [ ] **Step 1: Write the failing schema-shape tests**

Create `tests/merge-verification.test.js`:

```js
// tests/merge-verification.test.js — schema shape, PR-CI detection, the
// four-branch derivation ladder, and CLI wiring for the merge-verification
// policy key (#559). Inline/temp fixtures only — never reads this repo's live
// .claude-tweaks/policy.yml (IL-80). Fixture repos are built under os.tmpdir()
// so `git rev-parse --show-toplevel` never resolves THIS repo.
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { POLICY_KEYS, resolvePolicyKeys } = require('../bin/lib/policy-schema');

const CLI = path.join(__dirname, '..', 'bin', 'resolve-policy.js');
const REPO_ROOT = path.join(__dirname, '..');
const VALUES = ['merge-when-green', 'wait', 'off'];

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// --- Schema shape ---

test('merge-verification is registered as an enum with the three values and no static default', () => {
  const entry = POLICY_KEYS.find((e) => e.key === 'merge-verification');
  assert.ok(entry, 'merge-verification must be registered in POLICY_KEYS');
  assert.equal(entry.type, 'enum');
  assert.deepEqual(entry.values, VALUES);
  assert.equal(entry.default, undefined, 'a static default would bypass the derivation ladder entirely');
  assert.equal(entry.category, 'merge-safety');
});

test('resolvePolicyKeys stays pure for merge-verification — unset resolves to null/default, explicit value verbatim', () => {
  const unset = resolvePolicyKeys(['merge-verification'], { policyRaw: null, runConfigRaw: null });
  assert.deepEqual(unset['merge-verification'], { value: null, source: 'default' });
  const set = resolvePolicyKeys(['merge-verification'], { policyRaw: 'merge-verification: wait\n', runConfigRaw: null });
  assert.deepEqual(set['merge-verification'], { value: 'wait', source: 'policy' });
  const bad = resolvePolicyKeys(['merge-verification'], { policyRaw: 'merge-verification: sideways\n', runConfigRaw: null });
  assert.deepEqual(bad['merge-verification'], { value: null, source: 'default', invalid: true });
});
```

- [ ] **Step 2: Run the new file to verify it fails**

Run: `node --test tests/merge-verification.test.js`
Expected: FAIL — `merge-verification must be registered in POLICY_KEYS`.

- [ ] **Step 3: Add the schema row**

In `bin/lib/policy-schema.js`, immediately after the `integration-model` row (line 29), insert:

```js
  // merge-verification (#559): how much CI verification a merge into the
  // integration branch requires. Like integration-model, deliberately no
  // static `default` — an absent value is derived by
  // bin/lib/merge-verification.js's four-branch ladder (stated once in
  // skills/_shared/policy-schema.md's coverage block), wired through
  // bin/resolve-policy.js. `wait` is explicit-config-only: the ladder never
  // derives it. Tier is `advanced` only because the core tier sits at its
  // enforced cap of 12 (tests/policy-schema-metadata.test.js); by the decision
  // rule it is core-shaped (a merge default).
  { key: 'merge-verification', type: 'enum', values: ['merge-when-green', 'wait', 'off'], summary: "Sets how much CI verification a merge into the integration branch waits for — merge once green, wait for checks, or none.", category: 'merge-safety', tier: 'advanced' },
```

- [ ] **Step 4: Bump the count pin**

In `tests/policy-schema.test.js`, the block ending at line 53: add one comment line above the assertions and change both `48` → `49`:

```js
  // 48 -> 49, #559 (merge-verification): CI-verification lever for merges
  // into the integration branch, default derived by bin/lib/merge-verification.js.
  assert.strictEqual(POLICY_KEYS.length, 49);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 49);
```

- [ ] **Step 5: Run the affected suites**

Run: `node --test tests/merge-verification.test.js tests/policy-schema.test.js tests/policy-schema-metadata.test.js`
Expected: all PASS (metadata suite proves summary ≤140 chars, no key name inside it, core count still 12).

- [ ] **Step 6: Commit**

```bash
git add bin/lib/policy-schema.js tests/policy-schema.test.js tests/merge-verification.test.js
git commit -m "Register merge-verification policy key — enum, no static default, advanced tier — refs #559"
```

---

### Task 2: PR-triggered CI detection

**Files:**
- Create: `bin/lib/merge-verification.js`
- Test: `tests/merge-verification.test.js` (append)

**Interfaces:**
- Produces:
  - `workflowHasPullRequestTrigger(text: string): boolean` — pure; true iff the workflow's top-level `on:` names `pull_request` or `pull_request_target` in any of the four shapes.
  - `readWorkflowFiles(repoRoot: string): Array<{name: string, text: string}>` — reads `{root}/.github/workflows/*.yml|*.yaml`; returns `[]` when the directory is absent; throws on other fs errors (the caller degrades).
  - `hasPullRequestCi(repoRoot: string, { readWorkflows = readWorkflowFiles } = {}): boolean` — never throws; any read/parse failure → `false`.

- [ ] **Step 1: Append the failing detection tests**

Append to `tests/merge-verification.test.js`:

```js
// --- PR-CI detection ---

const mv = require('../bin/lib/merge-verification');

test('workflowHasPullRequestTrigger: every legal on: shape that names pull_request(_target)', () => {
  const yes = [
    'name: a\non: pull_request\njobs: {}\n',
    'name: a\non: pull_request_target\n',
    "name: a\n'on': pull_request\n",
    'name: a\n"on": [push, pull_request]\n',
    'name: a\non: [push, pull_request]\n',
    'name: a\non: [ push , "pull_request" ]\n',
    'name: a\non:\n  push:\n    branches: [main]\n  pull_request:\n\njobs: {}\n',
    'name: a\non:\n  pull_request:\n    types: [opened]\n',
    'name: a\non:\n  - push\n  - pull_request\n',
    'name: a\non: { pull_request: { branches: [main] } }\n',
    'name: a\n\n# comment\non:\n  # leading comment inside the block\n  pull_request_target:\n',
  ];
  for (const text of yes) assert.equal(mv.workflowHasPullRequestTrigger(text), true, JSON.stringify(text));
});

test('workflowHasPullRequestTrigger: push-only, nested-only, and no on: block do not count', () => {
  const no = [
    'name: a\non: push\n',
    'name: a\non: [push, workflow_dispatch]\n',
    'name: a\non:\n  push:\n    branches: [main]\n  schedule:\n    - cron: "0 0 * * *"\n',
    // pull_request appearing only as a NESTED key (deeper than the trigger level) is not a trigger
    'name: a\non:\n  push:\n    pull_request: nonsense\n',
    // a job step mentioning pull_request is not a trigger
    'name: a\non: push\njobs:\n  x:\n    steps:\n      - run: echo pull_request\n',
    'name: a\njobs: {}\n',
    '',
  ];
  for (const text of no) assert.equal(mv.workflowHasPullRequestTrigger(text), false, JSON.stringify(text));
});

test('hasPullRequestCi: injected reader — any workflow with a PR trigger counts; none, empty dir, or a throwing reader do not', () => {
  const two = () => [{ name: 'a.yml', text: 'on: push\n' }, { name: 'b.yaml', text: 'on: [push, pull_request]\n' }];
  assert.equal(mv.hasPullRequestCi('/nonexistent', { readWorkflows: two }), true);
  assert.equal(mv.hasPullRequestCi('/nonexistent', { readWorkflows: () => [{ name: 'a.yml', text: 'on: push\n' }] }), false);
  assert.equal(mv.hasPullRequestCi('/nonexistent', { readWorkflows: () => [] }), false);
  assert.equal(mv.hasPullRequestCi('/nonexistent', { readWorkflows: () => { throw new Error('EACCES'); } }), false, 'read failure resolves toward off');
});

test('readWorkflowFiles: reads .yml and .yaml under .github/workflows, [] when the dir is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-mv-wf-'));
  tempDirs.push(dir);
  assert.deepEqual(mv.readWorkflowFiles(dir), []);
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'a.yml'), 'on: push\n');
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'b.yaml'), 'on: pull_request\n');
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'README.md'), 'not a workflow\n');
  const files = mv.readWorkflowFiles(dir).map((f) => f.name).sort();
  assert.deepEqual(files, ['a.yml', 'b.yaml']);
  assert.equal(mv.hasPullRequestCi(dir), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/merge-verification.test.js`
Expected: FAIL — `Cannot find module '../bin/lib/merge-verification'`.

- [ ] **Step 3: Create the module with the detector**

Create `bin/lib/merge-verification.js`:

```js
// bin/lib/merge-verification.js — derived default for the `merge-verification`
// policy key (#559): how much CI verification a merge into the integration
// branch requires. The four-branch ladder is stated in prose exactly once, in
// skills/_shared/policy-schema.md's merge-verification coverage block; this
// file is its code twin, the same way bin/lib/policy-schema.js's
// detectIntegrationModel twins skills/_shared/forge-detection.md.
//
// A flat sibling of policy-schema.js rather than part of it: branch (3)/(4)
// reuses bin/lib/hooks/worktree-reap.js's resolveIntegrationBranch — the shared
// code resolver for skills/_shared/integration-branch.md's rank 3 (policy.yml)
// + rank-5 GitHub-default half — and worktree-reap.js -> bin/lib/policy.js ->
// policy-schema.js would make that a require cycle. Never hand-roll branch
// detection here; cite the fragment.
//
// Every branch fails toward 'off' (the permissive default), never toward the
// stricter value. Zero runtime npm deps: no YAML library — the on: trigger
// detector below is line-based and deliberately shallow.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolvePolicyKeys, resolveIntegrationModel } = require('./policy-schema');
const { resolveIntegrationBranch } = require('./hooks/worktree-reap');

const PR_TRIGGERS = new Set(['pull_request', 'pull_request_target']);

function stripQuotes(s) {
  return s.trim().replace(/^['"]|['"]$/g, '');
}

function stripComment(s) {
  const idx = s.indexOf(' #');
  return (idx === -1 ? s : s.slice(0, idx)).trim();
}

// True iff the workflow's top-level `on:` (col 0; `on`, 'on', or "on") names
// pull_request or pull_request_target — as a bare scalar, inside a flow array
// [a, b], as a flow-mapping key { pull_request: … }, as a block-list item
// (`  - pull_request`), or as a block-mapping key at the trigger indent
// (`  pull_request:`). Keys nested deeper than the trigger level (e.g. a
// `branches:` under push:) never count. Trigger PRESENCE is the proxy for "CI
// verification is requested" — enforcement (branch protection) is out of scope.
function workflowHasPullRequestTrigger(text) {
  if (typeof text !== 'string' || !text) return false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:on|'on'|"on")\s*:(.*)$/.exec(lines[i]);
    if (!m) continue;
    const rest = stripComment(m[1]);
    if (rest) {
      if (rest.startsWith('[')) {
        return rest.replace(/^\[|\]$/g, '').split(',').map(stripQuotes).some((k) => PR_TRIGGERS.has(k));
      }
      if (rest.startsWith('{')) {
        return [...rest.matchAll(/(['"]?)([A-Za-z_]+)\1\s*:/g)].some((x) => PR_TRIGGERS.has(x[2]));
      }
      return PR_TRIGGERS.has(stripQuotes(rest));
    }
    // Block form: the trigger level is the indent of the first non-blank,
    // non-comment line after `on:`; only lines at exactly that indent count.
    let triggerIndent = null;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const indent = /^(\s*)/.exec(line)[1].length;
      if (indent === 0) break; // next top-level key — end of the on: block
      if (triggerIndent === null) triggerIndent = indent;
      if (indent !== triggerIndent) continue;
      const item = /^\s*-\s*(['"]?[A-Za-z_]+['"]?)\s*(?:#.*)?$/.exec(line);
      if (item && PR_TRIGGERS.has(stripQuotes(item[1]))) return true;
      const key = /^\s*(['"]?[A-Za-z_]+['"]?)\s*:/.exec(line);
      if (key && PR_TRIGGERS.has(stripQuotes(key[1]))) return true;
    }
    return false;
  }
  return false;
}

// Reads every *.yml / *.yaml directly under {root}/.github/workflows. An
// absent directory is the ordinary "no CI" case and returns []; any other fs
// error throws so hasPullRequestCi can degrade uniformly.
function readWorkflowFiles(repoRoot) {
  const dir = path.join(repoRoot, '.github', 'workflows');
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  return names
    .filter((n) => /\.ya?ml$/i.test(n))
    .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

// Detection is GitHub Actions-only by intent (spec Non-Goals): a repo on
// another CI system reads as "no PR CI" and opts in with an explicit value.
// Never throws — a read/parse failure resolves toward `off` in the ladder.
function hasPullRequestCi(repoRoot, { readWorkflows = readWorkflowFiles } = {}) {
  try {
    return readWorkflows(repoRoot).some((f) => workflowHasPullRequestTrigger(f && f.text));
  } catch {
    return false;
  }
}

module.exports = { workflowHasPullRequestTrigger, readWorkflowFiles, hasPullRequestCi };
```

(Task 3 extends `module.exports` — keep the object literal so it can add names.)

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/merge-verification.test.js`
Expected: PASS (schema tests from Task 1 + the four detection tests).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/merge-verification.js tests/merge-verification.test.js
git commit -m "Add merge-verification PR-CI detection — line-based on: trigger reader over .github/workflows — refs #559"
```

---

### Task 3: The derivation ladder + full resolution

**Files:**
- Modify: `bin/lib/merge-verification.js` (append; extend `module.exports`)
- Test: `tests/merge-verification.test.js` (append)

**Interfaces:**
- Consumes: `hasPullRequestCi(root, { readWorkflows })` (Task 2); `resolveIntegrationModel(root)` from `./policy-schema`; `resolveIntegrationBranch(root)` from `./hooks/worktree-reap`.
- Produces:
  - `readDefaultBranch(repoRoot): string | null` — `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` (5s timeout), else `git rev-parse --abbrev-ref origin/HEAD` stripped of `origin/`, else `null`.
  - `deriveMergeVerification(repoRoot, deps = {}): 'merge-when-green' | 'off'` — `deps` = `{ integrationModel, readWorkflows, integrationBranch, defaultBranch }`, each an optional function of `repoRoot` overriding the default lookup. Never throws.
  - `resolveMergeVerification(repoRoot, deps = {}): 'merge-when-green' | 'wait' | 'off'` — explicit valid `policy.yml` value wins outright, else `deriveMergeVerification`. Never returns null.

- [ ] **Step 1: Append the failing ladder tests**

Append to `tests/merge-verification.test.js`:

```js
// --- Derivation ladder ---

const throwingReader = () => { throw new Error('workflow reader must not be consulted'); };
const prCi = () => [{ name: 'ci.yml', text: 'on: [push, pull_request]\n' }];
const pushOnly = () => [{ name: 'ci.yml', text: 'on: push\n' }];

test('branch (1): integration-model local-merge -> off, short-circuiting before any workflow read', () => {
  const value = mv.deriveMergeVerification('/nonexistent', {
    integrationModel: () => 'local-merge',
    readWorkflows: throwingReader,
    integrationBranch: throwingReader,
    defaultBranch: throwingReader,
  });
  assert.equal(value, 'off');
});

test('branch (2): pr-first but no PR-triggered CI -> off, before any branch lookup', () => {
  const value = mv.deriveMergeVerification('/nonexistent', {
    integrationModel: () => 'pr-first',
    readWorkflows: pushOnly,
    integrationBranch: throwingReader,
    defaultBranch: throwingReader,
  });
  assert.equal(value, 'off');
});

test('branch (3): pr-first + PR CI + integration branch == default branch -> merge-when-green', () => {
  const value = mv.deriveMergeVerification('/nonexistent', {
    integrationModel: () => 'pr-first',
    readWorkflows: prCi,
    integrationBranch: () => 'main',
    defaultBranch: () => 'main',
  });
  assert.equal(value, 'merge-when-green');
});

test('branch (4): pr-first + PR CI + non-default integration branch -> off', () => {
  const value = mv.deriveMergeVerification('/nonexistent', {
    integrationModel: () => 'pr-first',
    readWorkflows: prCi,
    integrationBranch: () => 'dev',
    defaultBranch: () => 'main',
  });
  assert.equal(value, 'off');
});

test('failed lookups resolve toward off: unresolvable branches, throwing branch lookup, throwing integration-model', () => {
  const base = { integrationModel: () => 'pr-first', readWorkflows: prCi };
  assert.equal(mv.deriveMergeVerification('/x', { ...base, integrationBranch: () => null, defaultBranch: () => 'main' }), 'off');
  assert.equal(mv.deriveMergeVerification('/x', { ...base, integrationBranch: () => 'main', defaultBranch: () => null }), 'off');
  assert.equal(mv.deriveMergeVerification('/x', { ...base, integrationBranch: throwingReader, defaultBranch: () => 'main' }), 'off');
  assert.equal(mv.deriveMergeVerification('/x', { integrationModel: throwingReader, readWorkflows: prCi, integrationBranch: () => 'main', defaultBranch: () => 'main' }), 'off');
});

test('the ladder never derives wait', () => {
  const combos = [
    { integrationModel: () => 'local-merge' },
    { integrationModel: () => 'pr-first', readWorkflows: pushOnly },
    { integrationModel: () => 'pr-first', readWorkflows: prCi, integrationBranch: () => 'main', defaultBranch: () => 'main' },
    { integrationModel: () => 'pr-first', readWorkflows: prCi, integrationBranch: () => 'dev', defaultBranch: () => 'main' },
  ];
  for (const deps of combos) assert.notEqual(mv.deriveMergeVerification('/x', deps), 'wait');
});

test('resolveMergeVerification: explicit valid policy value wins outright — no derivation lookups run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-mv-explicit-'));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.claude-tweaks'));
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'merge-verification: wait\n');
  const value = mv.resolveMergeVerification(dir, {
    integrationModel: throwingReader, readWorkflows: throwingReader, integrationBranch: throwingReader, defaultBranch: throwingReader,
  });
  assert.equal(value, 'wait');
});

test('resolveMergeVerification: absent or invalid policy value falls through to the ladder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-mv-derive-'));
  tempDirs.push(dir);
  const deps = { integrationModel: () => 'pr-first', readWorkflows: prCi, integrationBranch: () => 'main', defaultBranch: () => 'main' };
  assert.equal(mv.resolveMergeVerification(dir, deps), 'merge-when-green', 'absent -> derived');
  fs.mkdirSync(path.join(dir, '.claude-tweaks'));
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'merge-verification: sideways\n');
  assert.equal(mv.resolveMergeVerification(dir, deps), 'merge-when-green', 'invalid -> derived, not null');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/merge-verification.test.js`
Expected: FAIL — `mv.deriveMergeVerification is not a function`.

- [ ] **Step 3: Append the ladder to the module**

In `bin/lib/merge-verification.js`, insert before the `module.exports` line:

```js
// The repository's default branch — skills/_shared/integration-branch.md's
// rank-5 GitHub-default half, in code: gh's defaultBranchRef, else the local
// origin/HEAD symref (what a clone records), else null. Never throws.
function readDefaultBranch(repoRoot) {
  const opts = { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, encoding: 'utf8' };
  try {
    const name = execFileSync('gh', ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'], opts).trim();
    if (name) return name;
  } catch {}
  try {
    const ref = execFileSync('git', ['rev-parse', '--abbrev-ref', 'origin/HEAD'], opts).trim();
    const name = ref.replace(/^origin\//, '');
    if (name) return name;
  } catch {}
  return null;
}

// The four-branch ladder — first match wins, no fall-through. `deps` lets tests
// inject each lookup; production callers pass nothing.
//   (1) integration-model resolves local-merge          -> off
//   (2) no PR-triggered CI under .github/workflows       -> off
//   (3) integration branch is the repo's default branch -> merge-when-green
//   (4) any other (non-default) integration branch       -> off
// Prose statement of record: skills/_shared/policy-schema.md's coverage block.
// integration-model per skills/_shared/integration-model.md; the branch pair
// per skills/_shared/integration-branch.md via the shared resolvers, never a
// hand-rolled detection. Any lookup failure resolves toward off.
function deriveMergeVerification(repoRoot, deps = {}) {
  const integrationModel = deps.integrationModel || resolveIntegrationModel;
  const readWorkflows = deps.readWorkflows || readWorkflowFiles;
  const integrationBranch = deps.integrationBranch || resolveIntegrationBranch;
  const defaultBranch = deps.defaultBranch || readDefaultBranch;

  let model;
  try { model = integrationModel(repoRoot); } catch { return 'off'; }
  if (model === 'local-merge') return 'off';                       // (1)

  if (!hasPullRequestCi(repoRoot, { readWorkflows })) return 'off'; // (2)

  let target;
  let fallback;
  try {
    target = integrationBranch(repoRoot);
    fallback = defaultBranch(repoRoot);
  } catch {
    return 'off';
  }
  if (!target || !fallback) return 'off';
  return target === fallback ? 'merge-when-green' : 'off';         // (3) / (4)
}

// Explicit policy.yml value (ordinary enum validation) wins outright, else the
// derived default — the same shape as policy-schema.js's resolveIntegrationModel.
// Never returns null: an absent OR invalid value both fall through to the ladder.
function resolveMergeVerification(repoRoot, deps = {}) {
  let policyRaw = null;
  try {
    policyRaw = fs.readFileSync(path.join(repoRoot, '.claude-tweaks', 'policy.yml'), 'utf8');
  } catch {}
  const resolved = resolvePolicyKeys(['merge-verification'], { policyRaw, runConfigRaw: null });
  const entry = resolved['merge-verification'];
  if (entry && entry.source !== 'default' && !entry.invalid) return entry.value;
  return deriveMergeVerification(repoRoot, deps);
}
```

Then change the export line to:

```js
module.exports = {
  workflowHasPullRequestTrigger, readWorkflowFiles, hasPullRequestCi,
  readDefaultBranch, deriveMergeVerification, resolveMergeVerification,
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/merge-verification.test.js`
Expected: PASS.

- [ ] **Step 5: Discrimination check (spec AC5) — flip branch (3), watch the test fail, flip back**

Temporarily change `return target === fallback ? 'merge-when-green' : 'off';` to `return target === fallback ? 'off' : 'merge-when-green';`, run `node --test tests/merge-verification.test.js` — Expected: FAIL on the branch (3) and branch (4) tests. Restore the line exactly. Run again — Expected: PASS. Do the same once for branch (1) (change `'local-merge'` to `'pr-first'` in the comparison) — Expected: branch (1) test FAILS with "workflow reader must not be consulted"; restore; PASS. Do not commit either flip.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/merge-verification.js tests/merge-verification.test.js
git commit -m "Add merge-verification derivation ladder — four branches, injectable lookups, fails toward off — refs #559"
```

---

### Task 4: CLI wiring in `bin/resolve-policy.js` + fixture-pinned CLI tests

**Files:**
- Modify: `bin/resolve-policy.js:26` (require line) and `bin/resolve-policy.js:127-136` (insert after the `integration-model` computed-default block)
- Test: `tests/merge-verification.test.js` (append)

**Interfaces:**
- Consumes: `deriveMergeVerification(root)` (Task 3).
- Produces: `node bin/resolve-policy.js --values merge-verification` prints the bare value (`merge-when-green` / `wait` / `off`), one per line, same contract as every other key — this is exactly the contract #560 consumes.

- [ ] **Step 1: Append the failing CLI tests**

Append to `tests/merge-verification.test.js`:

```js
// --- CLI (bin/resolve-policy.js) ---

// A fixture repo with one commit, an origin/HEAD symref (what a clone records,
// set locally so no network is needed), and optional policy + workflow files.
// integration-model is set EXPLICITLY in policy.yml so branch (1) never shells
// out to gh from a fixture.
function fixtureRepo({ policy = 'integration-model: pr-first\n', workflow = null, workflowName = 'ci.yml', defaultBranch = 'main' } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-mv-cli-')));
  tempDirs.push(dir);
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
  git('init', '-q', '-b', defaultBranch);
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  git('update-ref', `refs/remotes/origin/${defaultBranch}`, 'HEAD');
  git('symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${defaultBranch}`);
  fs.mkdirSync(path.join(dir, '.claude-tweaks'));
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), policy);
  if (workflow !== null) {
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.github', 'workflows', workflowName), workflow);
  }
  return dir;
}

function cli(args, cwd) {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('CLI AC1 fixture: pull_request-triggered workflow + integration branch == default -> merge-when-green', () => {
  const dir = fixtureRepo({ workflow: 'name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\njobs: {}\n' });
  assert.equal(cli(['--values', 'merge-verification'], dir).trim(), 'merge-when-green');
});

test('CLI AC2: explicit merge-verification: off wins over the derivation', () => {
  const dir = fixtureRepo({ policy: 'integration-model: pr-first\nmerge-verification: off\n', workflow: 'on: pull_request\n' });
  assert.equal(cli(['--values', 'merge-verification'], dir).trim(), 'off');
});

test('CLI AC3: integration-model local-merge -> off even with a PR workflow present', () => {
  const dir = fixtureRepo({ policy: 'integration-model: local-merge\n', workflow: 'on: pull_request\n' });
  assert.equal(cli(['--values', 'merge-verification'], dir).trim(), 'off');
});

test('CLI AC4: workflows without a pull_request trigger -> off; array form on: [push, pull_request] -> merge-when-green', () => {
  const none = fixtureRepo({ workflow: 'name: ci\non:\n  push:\n    branches: [main]\n  workflow_dispatch:\njobs: {}\n' });
  assert.equal(cli(['--values', 'merge-verification'], none).trim(), 'off');
  const arr = fixtureRepo({ workflow: 'name: ci\non: [push, pull_request]\njobs: {}\n', workflowName: 'ci.yaml' });
  assert.equal(cli(['--values', 'merge-verification'], arr).trim(), 'merge-when-green');
});

test('CLI branch (4): explicit non-default integration-branch -> off', () => {
  const dir = fixtureRepo({ policy: 'integration-model: pr-first\nintegration-branch: dev\n', workflow: 'on: pull_request\n' });
  assert.equal(cli(['--values', 'merge-verification'], dir).trim(), 'off');
});

test('CLI: no repo, no workflows -> off (fail toward the default, never toward stricter)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-mv-bare-'));
  tempDirs.push(dir);
  assert.equal(cli(['--values', 'merge-verification'], dir).trim(), 'off');
});

test('CLI JSON mode: derived value carries source "default"; explicit carries "policy"; invalid keeps invalid: true, not overwritten', () => {
  const derived = JSON.parse(cli(['merge-verification'], fixtureRepo({ workflow: 'on: pull_request\n' })));
  assert.deepEqual(derived['merge-verification'], { value: 'merge-when-green', source: 'default' });
  const explicit = JSON.parse(cli(['merge-verification'], fixtureRepo({ policy: 'integration-model: pr-first\nmerge-verification: wait\n' })));
  assert.deepEqual(explicit['merge-verification'], { value: 'wait', source: 'policy' });
  const invalid = JSON.parse(cli(['merge-verification'], fixtureRepo({ policy: 'integration-model: pr-first\nmerge-verification: sideways\n' })));
  assert.deepEqual(invalid['merge-verification'], { value: null, source: 'default', invalid: true });
});

test('CLI live smoke on this repo resolves a valid enum value (drift-sensitive by nature — the fixtures above are the durable check)', () => {
  const out = cli(['--values', 'merge-verification'], REPO_ROOT).trim();
  assert.ok(VALUES.includes(out), `got ${JSON.stringify(out)}`);
});
```

- [ ] **Step 2: Run to verify the CLI tests fail**

Run: `node --test tests/merge-verification.test.js`
Expected: FAIL — AC1 fixture prints `` (empty line: unset no-default key) instead of `merge-when-green`.

- [ ] **Step 3: Wire the CLI**

In `bin/resolve-policy.js`, change line 26 to also import the ladder — replace:

```js
const { resolvePolicyKeys, detectIntegrationModel, POLICY_KEYS } = require('./lib/policy-schema');
```

with:

```js
const { resolvePolicyKeys, detectIntegrationModel, POLICY_KEYS } = require('./lib/policy-schema');
const { deriveMergeVerification } = require('./lib/merge-verification');
```

Then, immediately after the `integration-model` computed-default block (the `if (keys.includes('integration-model')) { … }` ending around line 136), insert:

```js
  // merge-verification (#559) has no static schema default either — an absent
  // value (never an invalid one; `invalid: true` stays visible) is derived by
  // bin/lib/merge-verification.js's four-branch ladder, whose prose statement
  // of record is skills/_shared/policy-schema.md's coverage block.
  if (keys.includes('merge-verification')) {
    const entry = result['merge-verification'];
    if (entry && entry.source === 'default' && !entry.invalid) {
      result['merge-verification'] = { value: deriveMergeVerification(root), source: 'default' };
    }
  }
```

The header comment describes shape, not keys — leave it.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/merge-verification.test.js tests/resolve-policy-cli.test.js tests/integration-model.test.js`
Expected: PASS. Then run the live smoke by hand from the worktree root: `node bin/resolve-policy.js --values merge-verification` — Expected: `merge-when-green` (this repo: pr-first, `.github/workflows/test.yml` has `pull_request:`, integration branch is the GitHub default `main`). Record the observed value in the commit body.

- [ ] **Step 5: Commit**

```bash
git add bin/resolve-policy.js tests/merge-verification.test.js
git commit -m "Wire merge-verification derived default into resolve-policy — --values prints the ladder result — refs #559"
```

---

### Task 5: Coverage block + Manifesto lever row

**Files:**
- Modify: `skills/_shared/policy-schema.md:116-121` (Integration model section — add the key row and a `### merge-verification` coverage subsection)
- Modify: `skills/flow/manifesto.md` (lever numbering line ~90, levers table ~92-101, suppression table ~48-57, override-semantics table ~104-121, `config.yml` example ~175-188, Recommendation defaults table ~150-160)
- Test: `tests/policy-schema-metadata.test.js`, `tests/integration-model.test.js`, `tests/integration-branch-conformance.test.js`, `tests/flow-run-dir-anchoring.test.js` (existing — must stay green)

**Interfaces:**
- Consumes: the ladder as implemented in Task 3 (this is its ONE prose statement).
- Produces: lever `11` = Merge verification in the canonical Manifesto numbering; `config.yml` key `merge-verification`.

- [ ] **Step 1: Add the key row and coverage subsection to `skills/_shared/policy-schema.md`**

In the `## Integration model` section, after the `integration-model` row, add this row to the same table:

```markdown
| `merge-verification` | `policy.yml` (per-run override via the Manifesto's `config.yml`, lever 11) | `/claude-tweaks:flow` Manifesto (lever row); merge-site consumers land in #560 | unset — derived at resolve time by `bin/lib/merge-verification.js` (wired through `bin/resolve-policy.js`), never a schema literal; see the coverage block below | `merge-when-green`/`wait`/`off` — how much CI verification a merge into the integration branch requires. Explicit value validates and wins outright; derivation runs only when the key is absent or invalid. `wait` is explicit-config-only (the ladder never derives it) — it is the runtime fallback merge sites degrade to when `--auto` arming is unavailable, not a default. Read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values merge-verification` |
```

Then, directly below that table (still inside `## Integration model`, before `## Project facts`), add:

```markdown
### `merge-verification` derivation — canonical

<!-- merge-verification-derivation:start -->
The single prose statement of the derived default (code twin: `bin/lib/merge-verification.js`'s `deriveMergeVerification`; every other file cites this block rather than restating it). Four branches, first match wins, no fall-through:

1. `integration-model` (`_shared/integration-model.md`) resolves `local-merge` → `off`. Short-circuits before any workflow read.
2. No PR-triggered CI → `off`. Detection reads only `{root}/.github/workflows/*.yml|*.yaml` and looks for a top-level `on:` naming `pull_request` or `pull_request_target` in any legal shape — bare string, flow array, block list, or mapping key. Trigger *presence* is a deliberate proxy for "CI verification is requested"; enforcement (branch protection) is out of scope. GitHub Actions-only by intent — a repo on another CI system derives `off` and opts in with the one-line explicit value.
3. Integration branch is the repository default branch → `merge-when-green`.
4. Any other (non-default) integration branch → `off`.

Branches 3–4 obtain both branches through the canonical resolution in `_shared/integration-branch.md` (its rank 3 `integration-branch:` policy key, else the rank-5 GitHub-default half) via the shared code resolver, never a hand-rolled detection. Every failed lookup — no `gh`, API error, no upstream, unreadable workflow file — resolves toward `off`, the permissive default, never toward the stricter value.
<!-- merge-verification-derivation:end -->
```

- [ ] **Step 2: Add the lever to `skills/flow/manifesto.md`**

Six edits, all in place:

(a) In the paragraph starting `**Canonical lever numbering**`, change `9=Ceremony profile, 10=Model stance.` to `9=Ceremony profile, 10=Model stance, 11=Merge verification.`

(b) In the `#### Policy levers` table, after the `| 10 | Model stance | … |` row, add:

```markdown
| 11 | Merge verification | **{derived}** | **merge-when-green** / wait / off | How much CI verification the run's merge into the integration branch waits for — derived per `_shared/policy-schema.md`'s `merge-verification` coverage block (`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values merge-verification`); explicit `policy.yml` value wins. Merge sites act on it from #560 onward |
```

(c) In the `**Suppressed (not applicable to this run):**` example line, leave as-is, but in the `**Valid overrides for this run:**` fragment change `1, 2, 5, 6, 7, 9, 10.` to `1, 2, 5, 6, 7, 9, 10, 11.`

(d) In the `## Determine lever suppressions` table, add a row after `**Leftover routing** (5)`:

```markdown
| **Merge verification** (11) | `/wrap-up` not in the step list (the merge step never runs, so nothing reads it this run) |
```

(e) In the `#### Override semantics` table, after the two `Model stance` rows, add:

```markdown
| Merge verification | `merge-when-green` | Merge sites arm `--auto` and let the forge merge once checks are green (the derived recommendation on a default-branch pr-first repo with PR CI) |
| Merge verification | `wait` | Merge sites block on the checks before merging — explicit-config-only, never derived |
| Merge verification | `off` | Merge sites merge without consulting CI (the derived value for local-merge, no-PR-CI, or non-default-integration-branch repos) |
```

(f) In the `config.yml` example under `**On approval (option 1)**`, add `merge-verification: merge-when-green` directly after `model-stance: default`. In the `## Recommendation defaults` table, add after the `Model stance` row:

```markdown
| Merge verification | derived (`resolve-policy.js --values merge-verification`) | The ladder in `_shared/policy-schema.md`'s coverage block already encodes the safe answer per repo shape; no hardcoded literal |
```

- [ ] **Step 3: Conformance greps (spec AC + repo-wide pins)**

Run each and check the expectation:

- `grep -c "integration-model" skills/flow/manifesto.md` — if > 0, the file must also contain `_shared/integration-model.md`; the row text in (b) deliberately does not name `integration-model`, so expected `0` (if you named it, add the citation).
- `grep -n "merge-verification-derivation:start" skills/_shared/policy-schema.md` — expected exactly one hit.
- `grep -rn "merge-when-green" skills/ | grep -v "_shared/policy-schema.md" | grep -v "flow/manifesto.md"` — expected no output (no other file restates the ladder).
- `wc -c skills/flow/manifesto.md skills/_shared/policy-schema.md` — expected each < 40000.

- [ ] **Step 4: Run the prose-pinning suites**

Run: `node --test tests/policy-schema-metadata.test.js tests/integration-model.test.js tests/integration-branch-conformance.test.js tests/flow-run-dir-anchoring.test.js tests/skill-catalog-completeness.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/policy-schema.md skills/flow/manifesto.md
git commit -m "Document merge-verification — canonical derivation coverage block and Manifesto lever 11 — refs #559"
```

---

### Task 6: Full-suite verification

**Files:**
- none modified (unless the suite surfaces a regression, which is fixed and committed in place)

- [ ] **Step 1: Run the full suite to a file**

Run: `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/0664cff9-6d0f-4993-accc-7541265958b5/scratchpad/npm-test-559.txt 2>&1`
Then: `grep -E "^# (tests|pass|fail)" /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/0664cff9-6d0f-4993-accc-7541265958b5/scratchpad/npm-test-559.txt`
Expected: `# fail 0` (baseline before this spec was 3714 pass / 0 fail; expect ~3740 pass now).

- [ ] **Step 2: If any failure names a file this spec touched, fix and commit; if it does not, re-run that file alone (`node --test <file>`) before concluding anything**

Expected: green.

---

## Self-review

- **Spec coverage:** key (Task 1) ✔; ladder four branches + short-circuit (Task 3) ✔; branch resolution via canonical resolver + citation (Task 3 uses `resolveIntegrationBranch`, cites fragment; Task 5 prose cites) ✔; PR-CI detection all shapes + root param + fail-toward-off (Task 2) ✔; coverage block (Task 5) ✔; lever row with bolded merge-when-green (Task 5) ✔; tests per branch + explicit precedence + injectable readers + throwing-reader short-circuit (Task 3) ✔; AC1–AC4 CLI fixtures + live smoke (Task 4) ✔; AC5 discrimination flip (Task 3 Step 5) ✔; #533's metadata fields on the key (Task 1) ✔; count pin bump ✔.
- **Placeholder scan:** none.
- **Type consistency:** `deriveMergeVerification(root, deps)` / `resolveMergeVerification(root, deps)` / `hasPullRequestCi(root, {readWorkflows})` / `readWorkflowFiles(root)` / `readDefaultBranch(root)` / `workflowHasPullRequestTrigger(text)` used identically in Tasks 2–4. `resolveIntegrationBranch` is imported from `./hooks/worktree-reap` (exported there, verified). `resolveIntegrationModel` and `resolvePolicyKeys` are exported from `./policy-schema` (verified).
- **Cycle check:** `merge-verification.js → policy-schema.js` and `→ hooks/worktree-reap.js → policy.js → policy-schema.js`; nothing requires `merge-verification.js` except `bin/resolve-policy.js` and its test — no cycle.
