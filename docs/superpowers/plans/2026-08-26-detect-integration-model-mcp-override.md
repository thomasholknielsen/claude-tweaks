# detectIntegrationModel MCP-reachability override — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin this repo's `integration-model` explicitly, and give `detectIntegrationModel` an optional caller-supplied `{ mcpReachable }` override (surfaced through `bin/resolve-policy.js --mcp-reachable`) so a calling skill that already confirmed MCP reachability can short-circuit forge detection to `pr-first` without `detectIntegrationModel` ever attempting an MCP call itself.

**Architecture:** `detectIntegrationModel(repoRoot, opts)` gains a second, optional `opts` parameter. When `opts.mcpReachable === true` and a git remote exists, it returns `pr-first` immediately, skipping the `gh repo view` probe entirely — still requires a remote first (an MCP reachability signal is meaningless with nothing to integrate through). `resolveIntegrationModel(repoRoot, opts)` forwards `opts` straight through to `detectIntegrationModel` unchanged. `bin/resolve-policy.js` gains a `--mcp-reachable` boolean CLI flag that sets `opts.mcpReachable = true` before its existing `detectIntegrationModel(root)` call. The hook call site (`pre-tool-use.js`'s `resolveRunPinnedIntegrationModel`) is deliberately left uncalled with any override — no agent turn is active when a lifecycle hook fires, so there is nothing to source an MCP result from (docs/incident-log.md IL-63) — and gets a one-line comment saying so, not a behavior change.

**Tech Stack:** Plain Node.js (no framework), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-26T160753-record-1421/work/1421-spec.md` (materialized from GitHub issue #1421)

## Global Constraints

- No static schema default may be added for `integration-model` — it stays a deliberately *computed* value (existing test `integration-model carries no static schema default` pins this; do not touch it).
- `detectIntegrationModel` must never throw and must never attempt an MCP call itself (IL-63) — the override is supplied by the caller, always.
- `resolveIntegrationModel(repoRoot)` called with **no** second argument (the existing call shape used by `bin/lib/merge-verification.js` and `bin/lib/reconcile/index.js`) must behave identically to today — `opts` defaults to `{}` so `mcpReachable` is `undefined`, which is falsy, so the override branch never fires.
- `pre-tool-use.js`'s `resolveRunPinnedIntegrationModel` must not change behavior — no override, no new flag, no MCP call. Only a documentation comment is added there.
- `npm test` must stay green throughout — including the existing `tests/integration-model.test.js` suite (edits only ever *add* tests to it, never remove/relax existing ones per AC3).

---

### Task 1: Pin `integration-model: pr-first` in this repo's own policy.yml

**Files:**
- Modify: `.claude-tweaks/policy.yml`
- Test: `tests/integration-model.test.js` (new test, appended)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (a config value, not code).

- [ ] **Step 1: Write the failing test**

Append to `tests/integration-model.test.js`, in the "--- CLI (bin/resolve-policy.js) ---" section, right after the existing `test('CLI: this repo (real gh session) resolves a valid enum value with no policy.yml key set (AC1 shape)', ...)` block:

```js
test('CLI: this repo pins integration-model: pr-first in policy.yml — resolves without shelling out to git/gh (AC1)', () => {
  const policyPath = path.join(REPO_ROOT, '.claude-tweaks', 'policy.yml');
  const policyRaw = fs.readFileSync(policyPath, 'utf8');
  assert.match(policyRaw, /^integration-model:\s*pr-first\s*$/m, '.claude-tweaks/policy.yml must pin integration-model: pr-first');
  const out = runResolvePolicy(['--values', 'integration-model'], { cwd: REPO_ROOT });
  assert.strictEqual(out.trim(), 'pr-first');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/integration-model.test.js`
Expected: FAIL — the new test's `assert.match` throws because `.claude-tweaks/policy.yml` has no `integration-model:` line yet.

- [ ] **Step 3: Pin the value**

Open `.claude-tweaks/policy.yml` (repo root) and add a new line `integration-model: pr-first` — anywhere in the file, one key per line, same style as the existing keys (`worktree-always: true`, `execution-strategy: subagent-only`, etc.). Resulting file:

```yaml
worktree-always: true
execution-strategy: subagent-only
auto-mode: default-on
work-links: native
autonomy: unattended
grant-origination-enabled: true
fleet-daily-grant-cap: 3
integration-model: pr-first
```

**Stale-title fix (same commit):** the existing test `test('CLI: this repo (real gh session) resolves a valid enum value with no policy.yml key set (AC1 shape)', ...)` (a few lines above where the new test was inserted) asserts membership in `['pr-first', 'local-merge']`, which still passes once the key is pinned (`pr-first` is a member) — but its title's claim "with no policy.yml key set" becomes false. Rename it in the same edit to avoid a misleading passing test:

```js
test('CLI: this repo resolves a valid enum value regardless of policy.yml state (AC1 shape)', () => {
  const out = runResolvePolicy(['--values', 'integration-model'], { cwd: REPO_ROOT });
  assert.ok(['pr-first', 'local-merge'].includes(out.trim()));
});
```

(Body unchanged — only the title/comment changes; this is a rename for accuracy, not a relaxation of the assertion.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/integration-model.test.js`
Expected: PASS — all tests in the file, including the new one.

- [ ] **Step 5: Commit**

```bash
git add .claude-tweaks/policy.yml tests/integration-model.test.js
git commit -m "Pin integration-model: pr-first in this repo's policy.yml (refs #1421)"
```

---

### Task 2: Add the `{ mcpReachable }` override to `detectIntegrationModel`/`resolveIntegrationModel`

**Files:**
- Modify: `plugin/bin/lib/policy-schema.js:526-556`
- Test: `tests/integration-model.test.js` (new tests, appended)

**Interfaces:**
- Consumes: nothing new.
- Produces: `detectIntegrationModel(repoRoot, opts = {})` — `opts.mcpReachable: boolean` (optional). `resolveIntegrationModel(repoRoot, opts = {})` — forwards `opts` unchanged to `detectIntegrationModel`. Both remain callable with zero or one argument exactly as before (existing callers `bin/resolve-policy.js`, `bin/lib/merge-verification.js`, `bin/lib/reconcile/index.js`, `bin/lib/hooks/pre-tool-use.js` are unaffected — none of them pass a second argument).

- [ ] **Step 1: Write the failing tests**

**First, add a shared helper** near the top of `tests/integration-model.test.js`, right after the existing `gitRepo` helper function:

```js
// Fakes "gh absent, git present" without an empty PATH — on some machines
// (this repo's dev environment included) git and gh live in the SAME
// directory (e.g. both under /opt/homebrew/bin via Homebrew), so blanking
// PATH entirely would also break the git remote-get-url probe that must
// keep succeeding. Instead, resolve git's real absolute path once (via the
// *current* PATH, before any override), symlink only that into a fresh
// empty directory, and use that directory as the override PATH — git
// resolves, gh does not.
function ghAbsentPath() {
  const gitPath = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-nogh-bin-'));
  fs.symlinkSync(gitPath, path.join(binDir, 'git'));
  return binDir;
}
```

Append to `tests/integration-model.test.js`, in the "--- detectIntegrationModel (unit) ---" section, right after the existing `test('detectIntegrationModel: this repo (real GitHub remote) resolves a valid enum value', ...)` block:

```js
test('detectIntegrationModel: mcpReachable:true resolves pr-first for a real GitHub remote even when gh is faked absent (AC2)', () => {
  const dir = gitRepo({ remote: 'https://github.com/thomasholknielsen/claude-tweaks.git' });
  const originalPath = process.env.PATH;
  process.env.PATH = ghAbsentPath();
  try {
    assert.strictEqual(detectIntegrationModel(dir, { mcpReachable: true }), 'pr-first');
  } finally {
    process.env.PATH = originalPath;
  }
});

test('detectIntegrationModel: mcpReachable:true with no git remote still resolves local-merge — a remote is required regardless of MCP reachability', () => {
  const dir = gitRepo();
  assert.strictEqual(detectIntegrationModel(dir, { mcpReachable: true }), 'local-merge');
});

test('detectIntegrationModel: no override (undefined opts) is unchanged — gh absent still resolves local-merge (AC3)', () => {
  const dir = gitRepo({ remote: 'https://example.invalid/nowhere/nothing.git' });
  assert.strictEqual(detectIntegrationModel(dir), 'local-merge');
});

test('detectIntegrationModel: mcpReachable:false is unchanged from no-override — gh absent still resolves local-merge (AC3)', () => {
  const dir = gitRepo({ remote: 'https://example.invalid/nowhere/nothing.git' });
  assert.strictEqual(detectIntegrationModel(dir, { mcpReachable: false }), 'local-merge');
});

test('resolveIntegrationModel: forwards opts through to detectIntegrationModel', () => {
  const { resolveIntegrationModel } = require('../plugin/bin/lib/policy-schema');
  const dir = gitRepo({ remote: 'https://github.com/thomasholknielsen/claude-tweaks.git' });
  const originalPath = process.env.PATH;
  process.env.PATH = ghAbsentPath();
  try {
    assert.strictEqual(resolveIntegrationModel(dir, { mcpReachable: true }), 'pr-first');
  } finally {
    process.env.PATH = originalPath;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/integration-model.test.js`
Expected: FAIL — `detectIntegrationModel(dir, { mcpReachable: true })` still runs the `gh` probe (no override support yet), so with `PATH` pointed at the `gh`-free directory the `gh` `execFileSync` call throws `ENOENT` and the function returns `local-merge` instead of the expected `pr-first`. The no-remote test (`mcpReachable:true with no git remote`) already passes today (remote check runs first) — that's fine, it's a guard test for behavior Step 3 must not break.

- [ ] **Step 3: Implement the override**

In `plugin/bin/lib/policy-schema.js`, replace lines 519-556 (the `detectIntegrationModel` and `resolveIntegrationModel` functions plus their leading comments) with:

```js
// Computed default for `integration-model` when absent from every config
// source (run-config, policy.yml) — bin/resolve-policy.js's code twin of
// skills/_shared/forge-detection.md's three-check ladder. Impure (shells out),
// unlike resolvePolicyKeys above; kept separate so that function stays pure.
// Never throws — fails open to 'local-merge' on any error, including no git
// remote at all (checked first, so a local-files project with no remote never
// shells out to gh). Each check runs under a 5s timeout.
//
// `opts.mcpReachable` (optional, default undefined/falsy) is a caller-supplied
// override — never resolved inside this function, per docs/incident-log.md
// IL-63: a spawned-subprocess-style module cannot invoke MCP tools itself, so
// this function can only accept the answer, never derive it. When true AND a
// git remote exists, short-circuits straight to 'pr-first', skipping the `gh`
// probe entirely — a remote is still required, since an MCP reachability
// signal is meaningless with nothing to integrate through. The one caller
// positioned to supply this (bin/resolve-policy.js's CLI, invoked inside an
// agent turn) is documented in that file; pre-tool-use.js's hook call site
// runs with no agent turn active and can never supply it (see
// resolveRunPinnedIntegrationModel's own comment).
function detectIntegrationModel(repoRoot, opts = {}) {
  const { mcpReachable } = opts;
  const execOpts = { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, encoding: 'utf8', windowsHide: true };
  try {
    execFileSync('git', ['remote', 'get-url', 'origin'], execOpts);
  } catch {
    return 'local-merge';
  }
  if (mcpReachable === true) return 'pr-first';
  try {
    execFileSync('gh', ['repo', 'view', '--json', 'owner,name'], execOpts);
  } catch {
    return 'local-merge';
  }
  return 'pr-first';
}

// Full integration-model resolution for a caller that just wants the answer
// — explicit policy.yml value (ordinary validation, wins outright) else the
// computed forge-detection default, in one call. The shared entry point for
// both bin/resolve-policy.js's CLI and bin/lib/reconcile/index.js (#407),
// which needs the identical resolution in-process rather than shelling out
// to the CLI. Never returns null: falls through to detection whenever the
// key isn't cleanly set (absent, or set-but-invalid — a typo'd value still
// gets a usable default here, unlike the raw resolvePolicyKeys/CLI path,
// which surfaces `invalid: true` for a caller that wants to report it).
// `opts` (optional) forwards unchanged to detectIntegrationModel — see that
// function's own comment for the mcpReachable override contract.
function resolveIntegrationModel(repoRoot, opts = {}) {
  const policyRaw = readFileSafe(path.join(repoRoot, '.claude-tweaks', 'policy.yml'));
  const resolved = resolvePolicyKeys(['integration-model'], { policyRaw, runConfigRaw: null });
  const entry = resolved['integration-model'];
  if (entry && entry.source !== 'default') return entry.value;
  return detectIntegrationModel(repoRoot, opts);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/integration-model.test.js`
Expected: PASS — all tests, including the 5 new ones from Step 1.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/policy-schema.js tests/integration-model.test.js
git commit -m "Add optional mcpReachable override to detectIntegrationModel (refs #1421)"
```

---

### Task 3: Wire `--mcp-reachable` into `bin/resolve-policy.js`'s CLI

**Files:**
- Modify: `plugin/bin/resolve-policy.js:54-139`
- Test: `tests/integration-model.test.js` (new tests, appended)

**Interfaces:**
- Consumes: `detectIntegrationModel(repoRoot, opts)` from Task 2.
- Produces: `resolve-policy.js --values integration-model --mcp-reachable` CLI flag (boolean, no value; forwards `{ mcpReachable: true }` into `detectIntegrationModel`).

- [ ] **Step 1: Write the failing tests**

**First, fix `runResolvePolicy`** at the top of the file so it (a) accepts an optional `env` override and (b) invokes node via its absolute path (`process.execPath`) rather than the bare string `'node'` — a restricted `PATH` override (as `ghAbsentPath()` produces) would otherwise make the child-process spawn itself fail to resolve `node`:

```js
function runResolvePolicy(args, { cwd, env } = {}) {
  return execFileSync(process.execPath, [RESOLVE_POLICY, ...args], { cwd, env, encoding: 'utf8' });
}
```

(`env: undefined` passed to `execFileSync` means "inherit `process.env`" — identical to today's behavior for every existing call site that doesn't pass `env`, so this is backward compatible. `process.execPath` vs. the string `'node'` makes no difference for any existing call either — both resolve to the same running Node binary.)

Append to `tests/integration-model.test.js`, in the "--- CLI (bin/resolve-policy.js) ---" section, right after the test added in Task 1 (`CLI: this repo pins integration-model: pr-first...`):

```js
test('CLI: --mcp-reachable resolves pr-first when gh is faked absent and a real remote exists (AC4)', () => {
  const dir = gitRepo({ remote: 'https://github.com/thomasholknielsen/claude-tweaks.git' });
  const env = { ...process.env, PATH: ghAbsentPath() };
  const out = runResolvePolicy(['--values', 'integration-model', '--mcp-reachable'], { cwd: dir, env });
  assert.strictEqual(out.trim(), 'pr-first');
});

test('CLI: omitting --mcp-reachable preserves todays local-merge fail-open behavior when gh is absent (AC4)', () => {
  const dir = gitRepo({ remote: 'https://github.com/thomasholknielsen/claude-tweaks.git' });
  const env = { ...process.env, PATH: ghAbsentPath() };
  const out = runResolvePolicy(['--values', 'integration-model'], { cwd: dir, env });
  assert.strictEqual(out.trim(), 'local-merge');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/integration-model.test.js`
Expected: FAIL — `resolve-policy.js` has no `--mcp-reachable` flag yet, so the arg-parsing loop's final `else` branch treats `--mcp-reachable` as an unrecognized bare key argument (pushed into `keys`, later surfacing as an `{"error": "unknown-key"}` entry for that key in the JSON output — harmless in `--values` mode, since only the requested `integration-model` line is asserted). The meaningful failure is that `--mcp-reachable` never reaches `detectIntegrationModel`, so with `PATH` pointed at the `gh`-free directory the first test's result stays `local-merge` instead of the expected `pr-first`.

- [ ] **Step 3: Implement the flag**

In `plugin/bin/resolve-policy.js`:

1. In `main()`'s argument-parsing loop (currently lines 60-85), add a new branch for `--mcp-reachable` alongside the existing `--run`/`--values`/`--all` branches:

```js
  let runDir = null;
  let valuesMode = false;
  let allMode = false;
  let mcpReachable = false;
  const keys = [];
  while (args.length) {
    const arg = args.shift();
    if (arg === '--run') {
      // ... unchanged ...
    } else if (arg === '--values') {
      valuesMode = true;
    } else if (arg === '--all') {
      allMode = true;
    } else if (arg === '--mcp-reachable') {
      mcpReachable = true;
    } else {
      // ... unchanged ...
    }
  }
```

2. Update the `integration-model` computed-default branch (currently lines 134-139) to pass the flag through:

```js
  if (keys.includes('integration-model')) {
    const entry = result['integration-model'];
    if (entry && entry.source === 'default' && !entry.invalid) {
      result['integration-model'] = { value: detectIntegrationModel(root, { mcpReachable }), source: 'default' };
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/integration-model.test.js`
Expected: PASS — all tests, including the 2 new ones from Step 1.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/resolve-policy.js tests/integration-model.test.js
git commit -m "Wire --mcp-reachable flag into resolve-policy.js CLI (refs #1421)"
```

---

### Task 4: Document the IL-63 boundary in the shared fragment and the hook call site

**Files:**
- Modify: `plugin/skills/_shared/integration-model.md`
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js:773-806` (comment only — see Global Constraints, no behavior change)
- Test: none (documentation-only; existing conformance tests in `tests/integration-model.test.js` already cover this fragment's citation contract and are unaffected)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (prose only).

- [ ] **Step 1: Add the IL-63 cross-reference to the shared fragment**

In `plugin/skills/_shared/integration-model.md`, find the "Detection is **gh-only**" paragraph (line 25) and append one sentence to its end:

```
Detection is **gh-only** — a Node subprocess cannot see an agent session's MCP tools, so an MCP-only sandbox (no `gh` CLI, only the MCP GitHub connection) detects `local-merge` even though it could, in principle, integrate through GitHub via MCP. This is exactly why `/claude-tweaks:init`'s offer (Step 20) recommends setting the value explicitly for GitHub-backed projects: an explicit policy value resolves identically in every environment, while detection can differ between a local `gh` session and an MCP-only sandbox for the same repo. `bin/resolve-policy.js`'s `--mcp-reachable` flag narrows this gap for the one call site that runs inside an agent turn (a calling skill that already confirmed MCP reachability can pass the flag through) — `detectIntegrationModel` itself never attempts an MCP call, per docs/incident-log.md IL-63; `pre-tool-use.js`'s hook call site has no agent turn to source a reachability signal from, so this narrowing does not reach it.
```

- [ ] **Step 2: Add the cross-reference comment at the hook call site**

In `plugin/bin/lib/hooks/pre-tool-use.js`, in `resolveRunPinnedIntegrationModel`'s leading comment block (lines 773-793), add one sentence after the existing comment's last line before the function definition (line 794):

```js
// Same overlay pathway bin/resolve-policy.js's own CLI uses — policy-schema's
// resolvePolicyConfig (policy.yml + {runDir}/config.yml) — with fresh forge
// detection kept ONLY as the fallback for a run that genuinely has not pinned
// anything yet, exactly mirroring that CLI's own integration-model branch.
// `readFile` is the small adapter that function's contract expects (returns
// null on any read failure). `git` is a no-spawn stub rather than a real
// adapter: resolvePolicyConfig calls it exactly once, with
// ['rev-parse', '--show-toplevel'], purely to learn the repo root it already
// received as `mainRoot` here (wtDetect.mainCheckoutRoot's fs-only result) —
// shelling out to re-derive a value the caller already has would undercut
// the spawn budget I5 exists to protect.
//
// This call site never passes detectIntegrationModel's mcpReachable override
// (see that function's own comment in policy-schema.js) — a lifecycle hook
// runs with no agent turn active, so there is no MCP call this gate could
// ever source a reachability signal from. This is a permanent, structural
// gap, not an oversight (docs/incident-log.md IL-63).
function resolveRunPinnedIntegrationModel(mainRoot, runDir) {
```

- [ ] **Step 3: Verify no test regressions**

Run: `node --test tests/integration-model.test.js`
Expected: PASS — documentation-only edits, no assertions affected. This also re-confirms the existing `every file naming integration-model cites the shared fragment or is allowlisted` conformance test still passes (the fragment file itself is allowlisted, and no new file references `integration-model` in a way that requires a citation).

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/_shared/integration-model.md plugin/bin/lib/hooks/pre-tool-use.js
git commit -m "Cross-reference IL-63 in integration-model.md and the hook call site (refs #1421)"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every suite green, including `tests/integration-model.test.js`'s full set (original 12 tests + 8 new ones from Tasks 1-3).

- [ ] **Step 2: Confirm no stray changes**

Run: `git status`
Expected: clean working tree (everything committed in Tasks 1-4).

- [ ] **Step 3: Commit (only if Step 1 required a fix)**

If Step 1 failed and required a fix, commit that fix separately with a message describing what broke and why. If Step 1 passed cleanly, there is nothing to commit here — this step is a no-op.
