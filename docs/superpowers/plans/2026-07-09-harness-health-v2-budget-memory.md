# Harness Health v2 — Budgets, Unscoped-Rule Detection, and Local-Only Memory Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three harness-health gaps surfaced by a real drift transcript: a hardcoded CLAUDE.md budget that ignores a project's own declared override, unscoped rule files with zero mechanical budget/structure check, and a memory system that decays identically to everything harness-health already audits but was architecturally excluded from its scope.

**Architecture:** Parts 1-2 (budgets, unscoped-rule detection, self-referential-count and narrative-density heuristics) are pure documentation changes — new Step 1 evidence-check prose in `_shared/harness-health-analysis.md`, read directly by the LLM judge against `.claude-tweaks/policy.yml`, following the same zero-code pattern the existing `execution.always` policy key already uses. Part 3 (memory health) needs real code: a new `listMemory`/`selectMemoryTarget` pair in `scope.js` that is structurally never merged into the existing `listTargets` rotation pool, so a scheduled Routine's bare firing can never select a memory target — reachable only via an explicit, human-typed `--kind memory --memory-dir <path>` invocation.

**Tech Stack:** Node 18+ (`bin/lib/harness-health/*`), `node --test`, no runtime npm dependencies (matches the existing engine).

## Global Constraints

- No new runtime npm dependencies — the plugin ships zero (per project convention).
- No new JS code for Part 1/2's policy keys — `harness-health.always-loaded-budget` and `harness-health.scoped-rule-budget` are read as prose by the LLM judge, exactly like `execution.always` today. Do not add a generalized `bin/lib/policy.js` reader — there is no code consumer for it in this plan.
- `listMemory`/`selectMemoryTarget` take an explicit `memoryDir` parameter — never derive `~/.claude/projects/{slug}/memory/` from `root` inside code. The invoking assistant supplies `--memory-dir` from what it already knows (its own system prompt's auto-memory section).
- `listTargets(root)` must never include a `kind: 'memory'` entry — this is a structural guarantee (a separate function, a separate CLI branch), not a documented convention. Every task touching `scope.js` or `bin/harness-health.js` must preserve this.
- Every new/modified test lives in `bin/lib/harness-health/tests/` or `tests/`, using `node:test`/`node:assert`, matching existing file conventions exactly (temp dirs via `fs.mkdtempSync(path.join(os.tmpdir(), '<prefix>-'))`, real git repos via `execFileSync('git', ...)` where needed).
- Design doc: `docs/superpowers/specs/2026-07-09-harness-health-v2-budget-memory-design.md` — read it before starting if anything below is ambiguous.

---

### Task 1: `listMemory` — parse a memory index into target candidates

**Files:**
- Modify: `bin/lib/harness-health/scope.js`
- Test: `bin/lib/harness-health/tests/scope.test.js`

**Interfaces:**
- Produces: `listMemory(memoryDir: string): Array<{ kind: 'memory', id: string, path: string }>` — sorted by `id`. Returns `[]` if `<memoryDir>/MEMORY.md` doesn't exist or is unreadable (not an error — matches `listSkills`'s "missing directory is a valid state" convention).

- [ ] **Step 1: Write the failing tests**

Add to `bin/lib/harness-health/tests/scope.test.js`, after the `listClaudeMd` tests (find the `// ─── listClaudeMd` section and add a new section after it, before `// ─── readDesignIntegrationFlag`):

```js
// ─── listMemory ─────────────────────────────────────────────────────────────

test('listMemory returns [] when MEMORY.md does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listMemory(root), []);
});

test('listMemory parses `- [Title](file.md) — hook` bullets into memory targets', () => {
  const root = tmp();
  fs.writeFileSync(
    path.join(root, 'MEMORY.md'),
    '# Memory Index\n\n' +
    '- [Design feedback style](design-feedback-style.md) — reviews design choices for real\n' +
    '- [Brainstorming interaction style](brainstorming-interaction-style.md) — wants breadth of options\n',
  );
  const targets = listMemory(root);
  assert.deepStrictEqual(targets.map((t) => t.id), ['brainstorming-interaction-style', 'design-feedback-style']);
  assert.strictEqual(targets[0].kind, 'memory');
  assert.strictEqual(targets[0].path, path.join(root, 'brainstorming-interaction-style.md'));
});

test('listMemory ignores non-bullet lines (headings, blank lines, prose)', () => {
  const root = tmp();
  fs.writeFileSync(
    root && path.join(root, 'MEMORY.md'),
    '# Memory Index\n\nSome intro prose that is not a bullet.\n\n- [Only entry](only-entry.md) — the one real bullet\n',
  );
  assert.deepStrictEqual(listMemory(root).map((t) => t.id), ['only-entry']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/harness-health/tests/scope.test.js`
Expected: FAIL — `listMemory is not a function` (not yet imported/defined).

- [ ] **Step 3: Add the import and implement `listMemory`**

In `bin/lib/harness-health/tests/scope.test.js`, add `listMemory` to the destructured import at the top:

```js
const {
  listSkills, extractDomainPaths, domainChurn, selectTarget,
  listRules, parseRulePaths, listClaudeMd, listTargets,
  readDesignIntegrationFlag, listDesignArtifacts,
  listMemory,
} = require('../scope');
```

In `bin/lib/harness-health/scope.js`, add `listMemory` right after `listClaudeMd` (before the `readDesignIntegrationFlag` section):

```js
// ─── listMemory ──────────────────────────────────────────────────────────────
// Returns [{ kind: 'memory', id, path }] for each `- [Title](file.md) — hook`
// bullet in <memoryDir>/MEMORY.md, sorted by id. [] if MEMORY.md is missing or
// unreadable — a project with no memory yet is a valid state, not an error.
// memoryDir is always an explicit, caller-supplied path (see selectMemoryTarget
// below) — never derived from a repo root.
function listMemory(memoryDir) {
  let content;
  try { content = fs.readFileSync(path.join(memoryDir, 'MEMORY.md'), 'utf8'); } catch { return []; }
  const results = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^-\s*\[.*?\]\(([^)]+)\)/);
    if (!m) continue;
    const href = m[1];
    const id = href.endsWith('.md') ? href.slice(0, -3) : href;
    results.push({ kind: 'memory', id, path: path.join(memoryDir, href) });
  }
  return results.sort((a, b) => (a.id < b.id ? -1 : 1));
}
```

Add `listMemory` to the `module.exports` at the bottom of `scope.js`:

```js
module.exports = {
  listSkills, parseRulePaths, listRules, listClaudeMd, listTargets,
  extractDomainPaths, domainChurn, selectTarget,
  readDesignIntegrationFlag, listDesignArtifacts,
  listMemory,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/harness-health/tests/scope.test.js`
Expected: PASS (all `listMemory` tests plus every pre-existing test in the file).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/harness-health/scope.js bin/lib/harness-health/tests/scope.test.js
git commit -m "harness-health: add listMemory to parse a memory index into target candidates"
```

---

### Task 2: `selectMemoryTarget` — stale-only selection, no hotspot phase

**Files:**
- Modify: `bin/lib/harness-health/scope.js`
- Test: `bin/lib/harness-health/tests/scope.test.js`

**Interfaces:**
- Consumes: `listMemory(memoryDir)` from Task 1; `STALE_DAYS` (already imported at the top of `scope.js` from `./score`).
- Produces: `selectMemoryTarget(memoryDir: string, cursors: object, opts?: { now?: number }): { kind: 'memory', id, path, why: 'stale', daysSinceLastAudit: number } | null`. Cursor lookup key is `` `memory:${id}` ``, matching the `${kind}:${id}` namespacing every other kind already uses.

- [ ] **Step 1: Write the failing tests**

Add to `bin/lib/harness-health/tests/scope.test.js`, right after the `listMemory` tests from Task 1:

```js
// ─── selectMemoryTarget ──────────────────────────────────────────────────────

test('selectMemoryTarget returns null when there are no memory entries', () => {
  const root = tmp();
  assert.strictEqual(selectMemoryTarget(root, {}), null);
});

test('selectMemoryTarget picks a never-audited entry as stale', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'MEMORY.md'), '- [Only entry](only-entry.md) — hook\n');
  const target = selectMemoryTarget(root, {});
  assert.strictEqual(target.kind, 'memory');
  assert.strictEqual(target.id, 'only-entry');
  assert.strictEqual(target.why, 'stale');
});

test('selectMemoryTarget returns null when every entry was audited recently (no hotspot fallback)', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'MEMORY.md'), '- [Only entry](only-entry.md) — hook\n');
  const now = Date.now();
  const cursors = { 'memory:only-entry': { lastAuditedMs: now - 1000 } };
  assert.strictEqual(selectMemoryTarget(root, cursors, { now }), null);
});

test('selectMemoryTarget force-picks past STALE_DAYS even with a recorded cursor', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'MEMORY.md'), '- [Only entry](only-entry.md) — hook\n');
  const now = Date.now();
  const cursors = { 'memory:only-entry': { lastAuditedMs: now - (STALE_DAYS + 1) * 86400000 } };
  const target = selectMemoryTarget(root, cursors, { now });
  assert.strictEqual(target.why, 'stale');
  assert.strictEqual(target.daysSinceLastAudit, STALE_DAYS + 1);
});

test('listTargets never includes a kind: memory entry, even when MEMORY.md exists alongside it', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n');
  fs.writeFileSync(path.join(root, 'MEMORY.md'), '- [Only entry](only-entry.md) — hook\n');
  const kinds = listTargets(root).map((t) => t.kind);
  assert.ok(!kinds.includes('memory'), 'listTargets must never surface a memory target — it is reachable only via an explicit --kind memory invocation');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/harness-health/tests/scope.test.js`
Expected: FAIL — `selectMemoryTarget is not a function` for the first four; the `listTargets` regression test PASSES already (a useful sanity check that it's testing the right thing — `listTargets` genuinely doesn't call `listMemory` yet).

- [ ] **Step 3: Add the import and implement `selectMemoryTarget`**

Add `selectMemoryTarget` and `STALE_DAYS` to the test file's import (STALE_DAYS is needed for the force-pick test):

```js
const {
  listSkills, extractDomainPaths, domainChurn, selectTarget,
  listRules, parseRulePaths, listClaudeMd, listTargets,
  readDesignIntegrationFlag, listDesignArtifacts,
  listMemory, selectMemoryTarget,
} = require('../scope');
const { STALE_DAYS } = require('../score');
```

In `bin/lib/harness-health/scope.js`, add `selectMemoryTarget` right after `listMemory`:

```js
// ─── selectMemoryTarget ──────────────────────────────────────────────────────
// Mirrors selectTarget's Phase 1 (force-pick anything unaudited past
// STALE_DAYS) only — no Phase 2 hotspot/churn scoring, since memory has no git
// churn signal. Returns null (not an error) when nothing is due, same as
// selectTarget. Cursor key is namespaced "memory:<id>", same convention every
// other kind uses.
function selectMemoryTarget(memoryDir, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const candidates = listMemory(memoryDir);
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.id}`;
    const cursor = cursors[key];
    const lastAuditedMs = cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > STALE_DAYS) {
      return { ...candidate, why: 'stale', daysSinceLastAudit: Number.isFinite(daysSince) ? Math.round(daysSince) : null };
    }
  }
  return null;
}
```

Add `selectMemoryTarget` to `module.exports`:

```js
module.exports = {
  listSkills, parseRulePaths, listRules, listClaudeMd, listTargets,
  extractDomainPaths, domainChurn, selectTarget,
  readDesignIntegrationFlag, listDesignArtifacts,
  listMemory, selectMemoryTarget,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/harness-health/tests/scope.test.js`
Expected: PASS — all tests, including the pre-existing suite.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/harness-health/scope.js bin/lib/harness-health/tests/scope.test.js
git commit -m "harness-health: add selectMemoryTarget (stale-only, no hotspot phase) and a listTargets regression guard"
```

---

### Task 3: Teach `validate-finding.js` and `issue-payload.js` about `assetType: memory`

**Files:**
- Modify: `bin/lib/harness-health/validate-finding.js`
- Modify: `bin/lib/harness-health/issue-payload.js`
- Test: `bin/lib/harness-health/tests/validate-finding.test.js`
- Test: `bin/lib/harness-health/tests/issue-payload.test.js`

**Interfaces:**
- Consumes: nothing new — both files already validate/format generically on `finding.assetType`.
- Produces: `ASSET_TYPE_VALUES` (from `validate-finding.js`) includes `'memory'`; `toIssuePayload` renders a `"Memory"` label for `assetType: 'memory'` findings.

- [ ] **Step 1: Write the failing tests**

Add to `bin/lib/harness-health/tests/validate-finding.test.js` (near the other `assetType`-focused tests — search the file for `ASSET_TYPE_VALUES` usage to find the right spot, or add near the end before `module.exports`... there is no exports in a test file, just add before the final test or at the end):

```js
test('validateFinding accepts assetType: memory', () => {
  const result = validateFinding(validPatch({ assetType: 'memory', target: 'design-feedback-style' }));
  assert.strictEqual(result.ok, true);
});
```

Add to `bin/lib/harness-health/tests/issue-payload.test.js`:

```js
test('toIssuePayload renders a Memory label for assetType: memory', () => {
  const payload = toIssuePayload({
    ...patchFinding({ assetType: 'memory', target: 'design-feedback-style' }),
    id: 'harnesshealth-abc12345',
  });
  assert.match(payload.title, /^Memory /);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/harness-health/tests/validate-finding.test.js bin/lib/harness-health/tests/issue-payload.test.js`
Expected: FAIL — the `validateFinding` test fails with `assetType: must be one of skill|rule|claude-md|design-artifact (got "memory")`; the `toIssuePayload` test fails because the title falls back to the raw string `memory` instead of `Memory` (assertion `/^Memory /` fails against `"memory drift: ..."`).

- [ ] **Step 3: Add `memory` to both files**

In `bin/lib/harness-health/validate-finding.js`, change:

```js
const ASSET_TYPE_VALUES = new Set(['skill', 'rule', 'claude-md', 'design-artifact']);
```

to:

```js
const ASSET_TYPE_VALUES = new Set(['skill', 'rule', 'claude-md', 'design-artifact', 'memory']);
```

In `bin/lib/harness-health/issue-payload.js`, change:

```js
const ASSET_TYPE_LABELS = { skill: 'Skill', rule: 'Rule', 'claude-md': 'CLAUDE.md', 'design-artifact': 'Design Context' };
```

to:

```js
const ASSET_TYPE_LABELS = { skill: 'Skill', rule: 'Rule', 'claude-md': 'CLAUDE.md', 'design-artifact': 'Design Context', memory: 'Memory' };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/harness-health/tests/validate-finding.test.js bin/lib/harness-health/tests/issue-payload.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/harness-health/validate-finding.js bin/lib/harness-health/issue-payload.js bin/lib/harness-health/tests/validate-finding.test.js bin/lib/harness-health/tests/issue-payload.test.js
git commit -m "harness-health: recognize assetType: memory in validation and issue-payload rendering"
```

---

### Task 4: Wire `--kind memory --memory-dir <path>` into the `next-target` CLI

**Files:**
- Modify: `bin/harness-health.js`
- Test: `bin/lib/harness-health/tests/cli-next-target.test.js`

**Interfaces:**
- Consumes: `listMemory`, `selectMemoryTarget` from Task 1/2.
- Produces: `next-target --kind memory --memory-dir <path> [--target <id>] [--budget <n>]` — same JSON output shape (`{ target, gapScanDue }` or `{ targets, gapScanDue }`) as every other kind. Exits with status 2 and a stderr message if `--kind memory` is passed without `--memory-dir`.

- [ ] **Step 1: Write the failing tests**

Add to `bin/lib/harness-health/tests/cli-next-target.test.js`, after the existing design-artifact tests at the end of the file:

```js
test('next-target --kind memory --memory-dir <dir> picks a never-audited memory entry as stale', () => {
  const root = tmp();
  const memoryDir = tmp();
  fs.writeFileSync(path.join(memoryDir, 'MEMORY.md'), '- [Only entry](only-entry.md) — hook\n');
  const result = runNextTarget(['--kind', 'memory', '--memory-dir', memoryDir], root);
  assert.strictEqual(result.target.kind, 'memory');
  assert.strictEqual(result.target.id, 'only-entry');
  assert.strictEqual(result.target.why, 'stale');
});

test('next-target --kind memory --target <id> --memory-dir <dir> bypasses selection with why: manual', () => {
  const root = tmp();
  const memoryDir = tmp();
  fs.writeFileSync(
    path.join(memoryDir, 'MEMORY.md'),
    '- [First entry](first-entry.md) — hook\n- [Second entry](second-entry.md) — hook\n',
  );
  const result = runNextTarget(['--kind', 'memory', '--target', 'second-entry', '--memory-dir', memoryDir], root);
  assert.strictEqual(result.target.id, 'second-entry');
  assert.strictEqual(result.target.why, 'manual');
});

test('next-target --kind memory without --memory-dir exits 2 with a clear usage error', () => {
  const root = tmp();
  assert.throws(
    () => execFileSync('node', [CLI, 'next-target', '--root', root, '--kind', 'memory'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    (err) => {
      assert.strictEqual(err.status, 2);
      assert.match(err.stderr.toString(), /--memory-dir/);
      return true;
    },
  );
});

test('next-target (bare, no --kind) never surfaces a memory target even when MEMORY.md exists at --root', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'MEMORY.md'), '- [Only entry](only-entry.md) — hook\n');
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const result = runNextTarget([], root);
  assert.notStrictEqual(result.target && result.target.kind, 'memory');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/harness-health/tests/cli-next-target.test.js`
Expected: FAIL — the first two tests fail because `--kind memory` currently falls through to the generic `listTargets`/`selectTarget` path and returns `{ target: null, ... }` (no `kind: 'memory'` candidates exist there); the third test fails because there is currently no `--memory-dir` validation, so it exits 0 instead of 2; the fourth test already passes (a sanity check that it's testing real behavior).

- [ ] **Step 3: Implement the CLI wiring**

In `bin/harness-health.js`, update the `require` line for scope.js:

```js
const { selectTarget, listTargets } = require('./lib/harness-health/scope');
```

to:

```js
const {
  selectTarget, listTargets, listMemory, selectMemoryTarget,
} = require('./lib/harness-health/scope');
```

In `parseArgs`, add a `--memory-dir` case right after the existing `--kind` case:

```js
    else if (a === '--kind') args.kind = argv[++i];
```

becomes:

```js
    else if (a === '--kind') args.kind = argv[++i];
    else if (a === '--memory-dir') args.memoryDir = argv[++i];
```

In `cmdNextTarget`, insert a new memory branch immediately after the `gapScanDue` computation and before the existing `if (args.target) {` block:

```js
function cmdNextTarget(args) {
  const root = args.root || process.cwd();
  const now = Date.now();
  const gapScan = readGapScanCursor(root);
  const gapScanDue = gapScan.lastScannedMs == null || (now - gapScan.lastScannedMs) / 86400000 > STALE_DAYS;

  if (args.kind === 'memory') {
    if (!args.memoryDir) {
      process.stderr.write('harness-health.js: next-target --kind memory requires --memory-dir <path>\n');
      process.exit(2);
    }
    let memCursors = readCursors(root);

    if (args.target) {
      const found = listMemory(args.memoryDir).find((t) => t.id === args.target) || null;
      const target = found ? { ...found, why: 'manual' } : null;
      process.stdout.write(JSON.stringify({ target, gapScanDue }, null, 2) + '\n');
      return;
    }

    const memBudget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1;

    if (memBudget === 1) {
      const target = selectMemoryTarget(args.memoryDir, memCursors, { now });
      process.stdout.write(JSON.stringify({ target, gapScanDue }, null, 2) + '\n');
      return;
    }

    const memTargets = [];
    for (let i = 0; i < memBudget; i++) {
      const target = selectMemoryTarget(args.memoryDir, memCursors, { now });
      if (!target) break;
      memTargets.push(target);
      const key = `${target.kind}:${target.id}`;
      memCursors = { ...memCursors, [key]: { ...(memCursors[key] || {}), lastAuditedMs: now } };
    }
    process.stdout.write(JSON.stringify({ targets: memTargets, gapScanDue }, null, 2) + '\n');
    return;
  }

  if (args.target) {
```

(The rest of `cmdNextTarget` — everything from the existing `if (args.target) {` line onward — is unchanged.)

Update the two usage strings to mention `memory` and `--memory-dir`. In `cmdValidateFindings`:

```js
      'usage: harness-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--target <id>] [--kind <skill|rule|claude-md|design-artifact>] [--gap-scan] [--run-id <id>] [--dry-run]\n',
```

becomes:

```js
      'usage: harness-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--target <id>] [--kind <skill|rule|claude-md|design-artifact|memory>] [--gap-scan] [--run-id <id>] [--dry-run]\n',
```

In `main`'s fallback usage:

```js
  process.stderr.write(
    'usage: harness-health.js <command> [options]\n' +
    'commands: next-target [--target <id>] [--kind <skill|rule|claude-md|design-artifact>] [--budget <n>], ' +
    'validate-findings <file> [--target <id>] [--kind <skill|rule|claude-md|design-artifact>] [--gap-scan], ' +
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <applied|declined>\n',
  );
```

becomes:

```js
  process.stderr.write(
    'usage: harness-health.js <command> [options]\n' +
    'commands: next-target [--target <id>] [--kind <skill|rule|claude-md|design-artifact|memory>] [--memory-dir <path>] [--budget <n>], ' +
    'validate-findings <file> [--target <id>] [--kind <skill|rule|claude-md|design-artifact|memory>] [--gap-scan], ' +
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <applied|declined>\n',
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/harness-health/tests/cli-next-target.test.js`
Expected: PASS — all tests, including the pre-existing suite.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: PASS (687+ tests; the one pre-existing `statusline too slow` timing test may flake under load — rerun `node --test tests/statusline.test.js` alone if it fails, and confirm it passes in isolation before treating the suite as green).

- [ ] **Step 6: Commit**

```bash
git add bin/harness-health.js bin/lib/harness-health/tests/cli-next-target.test.js
git commit -m "harness-health: wire --kind memory --memory-dir into the next-target CLI"
```

---

### Task 5: Document Part 2's tiered budget and structural checks (`_shared/harness-health-analysis.md`)

**Files:**
- Modify: `skills/_shared/harness-health-analysis.md`

**Interfaces:**
- Consumes: nothing (documentation-only; the LLM judge reads `.claude-tweaks/policy.yml` directly at audit time, no code call).
- Produces: three new Step 1 evidence checks (5, 6, 7) and a revised check 4, read by every consumer of this shared procedure (`/claude-tweaks:harness-health`, `/claude-tweaks:wrap-up` Step 7, `/claude-tweaks:init` Phase 3/6).

- [ ] **Step 1: Replace check 4 and insert checks 5-7**

In `skills/_shared/harness-health-analysis.md`, find this block (Step 1, check 4):

```markdown
4. **CLAUDE.md line-budget check** (CLAUDE.md only, new). `/init`'s own template caps CLAUDE.md at 150 lines:
   ```bash
   wc -l CLAUDE.md
   ```
   Over budget is mechanical, high-confidence evidence for a `template-conformance` finding — content belongs in a skill or rule instead, per `skills/init/claude-md-template.md`'s own "Under 150 lines" principle.
```

Replace it with:

```markdown
4. **Tiered line-budget check** (CLAUDE.md and rules, revised). Budget scales with how unconditionally a file loads, not with what kind of file it is:
   - **Always-loaded tier** — CLAUDE.md, and any `.claude/rules/*.md` file whose `paths:` frontmatter is absent or empty (`parseRulePaths` in `bin/lib/harness-health/scope.js` already returns `[]` for exactly this case — it loads every session identically to CLAUDE.md). Budget: the `harness-health.always-loaded-budget` line in `.claude-tweaks/policy.yml`, or 150 if the file or key is absent.
   - **Scoped tier** — any rule with a non-empty `paths:` list. Budget: the `harness-health.scoped-rule-budget` line in `.claude-tweaks/policy.yml`, or 30 if the file or key is absent.

   ```bash
   wc -l <target-path>
   cat .claude-tweaks/policy.yml 2>/dev/null | grep '^harness-health\.'
   ```

   Classify the target's tier, resolve its budget from the grep output (falling back to the stated default when the file or key is absent — exactly how `execution.always` is already read elsewhere in this plugin, no code involved), then compare. Over budget is mechanical, high-confidence evidence for a `template-conformance` finding — content belongs in a skill instead (always-loaded tier), or needs tightening/splitting (scoped tier), per `skills/init/claude-md-template.md`'s "Under 150 lines" principle and `skills/init/rules-template.md`'s budget guidance.
5. **Unscoped-rule structural check** (rules only, new). Parse the rule's frontmatter for a `paths:` key:
   ```bash
   sed -n '/^---$/,/^---$/p' "<rule-path>"
   ```
   A rule with no `paths:` key, or an empty list, is a mechanical, always-high-confidence `template-conformance` finding on its own — independent of line count — citing `skills/init/rules-template.md`'s "Only create rules for conventions that are path-specific; project-wide conventions belong in CLAUDE.md" contract. A 10-line unscoped rule still gets flagged; it is a structural violation regardless of size, just a cheap one to fix.
6. **Self-referential count/date check** (any kind, new). Grep the target for a hand-typed, self-tracking claim:
   ```bash
   grep -nE 'as of [0-9]{4}-[0-9]{2}-[0-9]{2}|currently [0-9]+ (items?|entries|rules)|pruned from [0-9]+' "<target-path>"
   ```
   A match is mechanical evidence for a `best-practice` finding — a hand-typed count or date claim drifts the moment reality changes, because nothing recomputes it. Recommend removing the claim, or replacing it with a pointer to a live check (`/claude-tweaks:harness-health --target <name>`) instead of a hardcoded number.
7. **Narrative-density heuristic** (any kind, new, approximate). For a file or section whose stated shape is a terse list (a rule file's body; a `## Don'ts`-style section), compute average words-per-bullet-line:
   ```bash
   grep -c '^- ' "<target-path>"
   wc -w "<target-path>"
   ```
   Divide word count by bullet count for a rough average. Above roughly 40 words/bullet is evidence — not a verdict — that specific bullets have drifted from a terse constraint into an incident narrative. Feed this as an anchor into dimension 8's existing best-practice judgment rather than treating it as a standalone finding; tune the threshold from real findings over time.
```

- [ ] **Step 2: Update the CLAUDE.md-specific bullet list to match the tiered check**

Find this line (in the "CLAUDE.md-specific checks unlocked by dimension 7/8" list):

```markdown
- **Line budget** — Step 1's `wc -l` check vs. 150 lines.
```

Replace it with:

```markdown
- **Line budget** — Step 1's tiered `wc -l` check vs. the `harness-health.always-loaded-budget` policy line (default 150).
```

- [ ] **Step 3: Verify the new checks are mechanically sound against this repo's own CLAUDE.md**

Run each new bash recipe against this repo's real `CLAUDE.md` to confirm the commands run cleanly and produce sane output (this repo has no `.claude/rules/`, so only the CLAUDE.md-applicable checks 4, 6, 7 can be exercised here — check 5 is rule-only and is verified in Task 6/7's context instead):

```bash
wc -l CLAUDE.md
cat .claude-tweaks/policy.yml 2>/dev/null | grep '^harness-health\.'
grep -nE 'as of [0-9]{4}-[0-9]{2}-[0-9]{2}|currently [0-9]+ (items?|entries|rules)|pruned from [0-9]+' CLAUDE.md
grep -c '^- ' CLAUDE.md
wc -w CLAUDE.md
```

Expected: all five commands run without error. The `grep '^harness-health\.'` line legitimately returns nothing (this repo's own `.claude-tweaks/policy.yml` has no such keys yet — that's fine, the check's own fallback-to-default behavior is what's being confirmed, not a specific match). Read the `wc -w`/`grep -c '^- '` output and sanity-check the resulting words-per-bullet average is a believable number (not, e.g., a divide-by-zero from `grep -c` returning 0 — if the Don'ts section's bullets are multi-line paragraphs rather than single `^- ` lines, note this in the commit message as a known heuristic limitation worth revisiting, not a blocker).

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/harness-health-analysis.md
git commit -m "harness-health-analysis: add tiered budget check, unscoped-rule structural check, self-referential count check, narrative-density heuristic"
```

---

### Task 6: Document Part 3's memory-specific checks (`_shared/harness-health-analysis.md`)

**Files:**
- Modify: `skills/_shared/harness-health-analysis.md`

**Interfaces:**
- Consumes: nothing (documentation-only).
- Produces: a new "Memory-Specific Checks" section; `assetType` enum in the Finding Shape prose gains `memory` (and, as a drive-by accuracy fix while touching this exact sentence, `design-artifact` — already a real value per `validate-finding.js` but missing from this prose enum); the scope-note table's harness-health row describes the `--kind memory` entry point.

- [ ] **Step 1: Update the scope-note table**

Find:

```markdown
| `/claude-tweaks:harness-health` | One target per firing (any of skill/rule/claude-md), selected by churn/staleness rotation (`next-target`) |
```

Replace with:

```markdown
| `/claude-tweaks:harness-health` | One target per firing (skill/rule/claude-md/design-artifact via churn/staleness rotation, `next-target`); memory only via an explicit `--kind memory --memory-dir <path>` invocation, never auto-selected |
```

- [ ] **Step 2: Update the Finding Shape's assetType enum prose**

Find:

```markdown
Required fields for every finding: `kind` (`patch` | `new-skill`), `target` (the artifact's id — a skill/rule filename stem, or `"CLAUDE"` for CLAUDE.md), `assetType` (`skill` | `rule` | `claude-md`), `category` (`drift` | `template-conformance` | `best-practice`), `classification` (`additive` | `restructural`), `confidence` (`high` | `med` | `low`), `reversibility` (`high` | `med` | `low`), `description`, `reason`.
```

Replace with:

```markdown
Required fields for every finding: `kind` (`patch` | `new-skill`), `target` (the artifact's id — a skill/rule filename stem, `"CLAUDE"` for CLAUDE.md, `"PRODUCT"`/`"DESIGN"` for a design artifact, or a memory entry's filename stem), `assetType` (`skill` | `rule` | `claude-md` | `design-artifact` | `memory`), `category` (`drift` | `template-conformance` | `best-practice`), `classification` (`additive` | `restructural`), `confidence` (`high` | `med` | `low`), `reversibility` (`high` | `med` | `low`), `description`, `reason`.
```

- [ ] **Step 3: Insert the new Memory-Specific Checks section**

Find the end of the CLAUDE.md-specific bullet list and the start of the next section:

```markdown
- **Project Defaults / claude-tweaks Pipeline sections in sync with the installed plugin version** — does the documented auto-mode-policy lever list match what the currently installed claude-tweaks plugin version actually supports? This one is checked against the plugin's own evolving contract (its bundled `_shared/auto-mode-contract.md`), not the target project's own source — a genuinely different kind of drift from every other check in this file.

**Bounded sub-file reads.**
```

Insert a new section between them:

```markdown
- **Project Defaults / claude-tweaks Pipeline sections in sync with the installed plugin version** — does the documented auto-mode-policy lever list match what the currently installed claude-tweaks plugin version actually supports? This one is checked against the plugin's own evolving contract (its bundled `_shared/auto-mode-contract.md`), not the target project's own source — a genuinely different kind of drift from every other check in this file.

## Memory-Specific Checks (`kind: memory` targets)

A `memory` target skips the 8-dimension check above entirely — its checks are narrower and more mechanical, closer in spirit to the `design-artifact` branch than to a full skill/rule/CLAUDE.md audit. `assetType` is `"memory"`; `target` is the memory file's id (its filename stem, from `MEMORY.md`'s link).

1. **Index line-length check.** Each `MEMORY.md` bullet line has a fixed 150-character budget — not project-configurable like the checks above, since this is a cross-project harness convention rather than a per-project stylistic choice:
   ```bash
   awk '{ if (length($0) > 150) print NR": "length($0)" chars" }' MEMORY.md
   ```
   A flagged line is mechanical evidence for a `template-conformance` finding — tighten the index entry to a true one-line hook.
2. **Fact-currency check.** Read the memory file's full body and extract concrete, checkable claims: referenced file/skill paths, specific IDs, status words (`pending`, `shipped`, `scheduled`, `in progress`), dated claims. Verify each against current reality:
   - A referenced path/command is exactly Step 1's stale-example check, applied to this file's body instead of a skill's.
   - A status word (`pending`, `shipped`) is checked against `git log --oneline --grep` for the described change, or against whether the file/skill it predicts now actually exists.
   Where a claim genuinely cannot be checked mechanically, skip it — the same opportunistic-assist caveat Step 1 already states for checks 1-2. A contradicted claim is high-confidence evidence for a `drift` finding.
3. **Duplication-with-checked-in-content check.** Grep the memory file's distinctive phrases (named files, function names, specific facts) against skill/rule content:
   ```bash
   grep -rl "<distinctive phrase from the memory file>" skills/ .claude/rules/ 2>/dev/null
   ```
   A hit is evidence for a `drift` finding recommending the memory entry shrink to a pointer/reference rather than a restated copy.
4. **Runbook-shape heuristic** (informational only — this phase detects and flags, it does not promote). Count fenced code blocks:
   ```bash
   grep -c '^```' "<memory-file-path>"
   ```
   Two or more fenced blocks, or several lines that look like shell commands, is evidence worth noting in the finding's `reason` field: "reads like an operational runbook, consider promoting to `docs/`" — no automated doc creation this phase.

**Apply-or-file posture for memory findings.** Additive+high-confidence+high-reversibility findings (trim an index line, correct a fact the fact-currency check contradicts) apply directly via `Edit` — but skip the `git commit` step every other additive auto-apply takes: a memory file is not part of this repo's git tree, so there is nothing to commit. Still run `mark applied` so the proposal doesn't get re-staged. Restructural findings (delete, merge two overlapping memories, "consider promoting") always surface to the human, the same posture CLAUDE.md findings get, per `skills/harness-health/SKILL.md` Step 7.

**Bounded sub-file reads.**
```

(Note: the last line of the insertion, `**Bounded sub-file reads.**`, is the start of the paragraph that already follows in the file — it is repeated here only to show the exact insertion point; do not duplicate it.)

- [ ] **Step 4: Verify against this session's own real memory directory (read-only, no edits)**

Sanity-check the four new checks are followable against a real memory index — this repo's own auto-memory system provides one:

```bash
ls ~/.claude/projects/*/memory/MEMORY.md 2>/dev/null | head -1
```

Pick the path that corresponds to this project (matching the slug pattern described in the design doc), then read-only dry-run checks 1 and 4 against it:

```bash
MEMFILE="<the MEMORY.md path found above>"
awk '{ if (length($0) > 150) print NR": "length($0)" chars" }' "$MEMFILE"
```

Confirm the command runs without error and produces a believable result (some flagged lines are expected and fine — this task only verifies the check is *mechanically executable*, not that this repo's memory is currently compliant). Do not edit any memory file as part of this verification step.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/harness-health-analysis.md
git commit -m "harness-health-analysis: add memory-specific checks section, extend assetType enum and scope-note table"
```

---

### Task 7: Document the tiered budget in `rules-template.md` and `claude-md-template.md`

**Files:**
- Modify: `skills/init/rules-template.md`
- Modify: `skills/init/claude-md-template.md`

**Interfaces:**
- Consumes: nothing.
- Produces: both templates state the policy-overridable budget explicitly, so a project generated or updated via `/init` documents the same numbers harness-health checks against.

- [ ] **Step 1: Update `claude-md-template.md`'s line-budget principle**

Find:

```markdown
- **Under 150 lines** — if it doesn't fit, it belongs in a skill or rule
```

Replace with:

```markdown
- **Under 150 lines (default; override via `harness-health.always-loaded-budget` in `.claude-tweaks/policy.yml`)** — if it doesn't fit, it belongs in a skill or rule
```

- [ ] **Step 2: Add a budget section to `rules-template.md`**

Find:

```markdown
## Common rule candidates
```

Insert a new section immediately before it:

```markdown
## Budget

A path-scoped rule (with a `paths:` list) only loads when a matching file is in play, so keep it under `harness-health.scoped-rule-budget` lines in `.claude-tweaks/policy.yml` (default 30). A rule with **no** `paths:` key loads in full every session, identically to CLAUDE.md — if a convention isn't actually path-specific, it belongs in CLAUDE.md, not an unscoped rule file. An unscoped rule is judged against `harness-health.always-loaded-budget` instead (default 150), the same budget CLAUDE.md itself uses.

## Common rule candidates
```

- [ ] **Step 3: Commit**

```bash
git add skills/init/rules-template.md skills/init/claude-md-template.md
git commit -m "init templates: document the tiered, policy-overridable line budget"
```

---

### Task 8: Document `--kind memory` in `skills/harness-health/SKILL.md`

**Files:**
- Modify: `skills/harness-health/SKILL.md`

**Interfaces:**
- Consumes: Task 4's `--kind memory --memory-dir <path>` CLI surface; Task 6's "Memory-Specific Checks" section.
- Produces: a fully accurate SKILL.md — Input, Step 1 (SELECT), Step 3 (JUDGE), Step 7 (APPLY or FILE), When to Use, and Anti-Patterns all describe the new capability.

- [ ] **Step 1: Add a "When to Use" bullet**

Find:

```markdown
- You want to check one specific target right now (`--target <name> [--kind <skill|rule|claude-md|design-artifact>]`).
```

Replace with:

```markdown
- You want to check one specific target right now (`--target <name> [--kind <skill|rule|claude-md|design-artifact>]`).
- You want to spot-check your own memory directory for format-budget violations, stale or contradicted facts, or duplication with checked-in docs (`--kind memory --memory-dir <path>`), interactively — never via a scheduled Routine.
```

- [ ] **Step 2: Update the "Not for" line**

Find:

```markdown
Not for: code-quality findings (`/claude-tweaks:code-health`'s job — including cases where a rule's `paths:` glob is still correct but the code doesn't comply with it). Not a replacement for `/claude-tweaks:wrap-up` Step 7 or `/claude-tweaks:init`'s Update Mode — both consume the same shared procedure this skill does (currently against skills only), on their own scope models (a finished spec's diff; a whole-codebase reconnaissance) rather than this skill's churn/staleness rotation. Not for auditing memory (`~/.claude/projects/*/memory/`) — out of scope; see the harness-health design doc for why.
```

Replace with:

```markdown
Not for: code-quality findings (`/claude-tweaks:code-health`'s job — including cases where a rule's `paths:` glob is still correct but the code doesn't comply with it). Not a replacement for `/claude-tweaks:wrap-up` Step 7 or `/claude-tweaks:init`'s Update Mode — both consume the same shared procedure this skill does (currently against skills only), on their own scope models (a finished spec's diff; a whole-codebase reconnaissance) rather than this skill's churn/staleness rotation. Memory (`~/.claude/projects/{slug}/memory/`) is not auto-audited — reachable only via an explicit `--kind memory --memory-dir <path>` invocation, never through the automatic rotation a scheduled Routine uses, since memory lives outside the repo with no git churn signal and is not expected to be reachable from a Routine's execution environment.
```

- [ ] **Step 3: Extend the Input section**

Find:

```markdown
- `--target <id>` — manual override: audit one specific target directly, bypassing `next-target` selection.
- `--kind <skill|rule|claude-md|design-artifact>` — disambiguate `--target` when an id collides across kinds, or (without `--target`) restrict auto-selection to one kind.
```

Replace with:

```markdown
- `--target <id>` — manual override: audit one specific target directly, bypassing `next-target` selection.
- `--kind <skill|rule|claude-md|design-artifact|memory>` — disambiguate `--target` when an id collides across kinds, or (without `--target`) restrict auto-selection to one kind. `memory` is never auto-selected without this flag — it is excluded from the default rotation pool entirely.
- `--memory-dir <path>` — required when `--kind memory` is used. The invoking assistant's own memory directory path, exactly as stated in its own system prompt's auto-memory section for this project. Never derive or guess this path.
```

- [ ] **Step 4: Update Step 1's SELECT command and `why` guidance**

Find:

```markdown
```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" next-target --root . ${TARGET:+--target "$TARGET"} ${KIND:+--kind "$KIND"} ${BUDGET:+--budget "$BUDGET"}
```
```

Replace with:

```markdown
```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" next-target --root . ${TARGET:+--target "$TARGET"} ${KIND:+--kind "$KIND"} ${BUDGET:+--budget "$BUDGET"} ${MEMORY_DIR:+--memory-dir "$MEMORY_DIR"}
```

To audit memory, the human must explicitly ask for it — set `KIND=memory` and `MEMORY_DIR=<your own memory directory path, from your system prompt>` before invoking. Never set these automatically or infer them from context.
```

Find:

```markdown
- `why: "manual"` — `--target` was passed, bypassing selection.
```

Replace with:

```markdown
- `why: "manual"` — `--target` was passed, bypassing selection.
- Memory targets (`kind: memory`) only ever produce `why: "stale"` or `why: "manual"` — never `"hotspot"`, since memory has no git churn signal.
```

- [ ] **Step 5: Add the memory branch to Step 3 (JUDGE)**

Find:

```markdown
This branch doesn't need `_shared/harness-health-analysis.md`'s 8-dimension check — the 8 dimensions (template conformance, best-practice fit, cross-skill overlap, etc.) are skill/rule/claude-md-specific and don't map onto a project-root design-context file. `_shared/harness-health-analysis.md` is shared by `/wrap-up` and `/init`, neither of which ever passes a `design-artifact` target, so this branch lives here rather than in the shared file.

For every other `target.kind`, apply the full procedure in `_shared/harness-health-analysis.md` (the 8-dimension check, evidence pre-checks, verify gate, concrete gap signals — using `target.kind` to select which dimensions and origin-template references apply) to the target. Emit findings as a JSON array in the Finding Shape that file defines, with `assetType` set to `target.kind` and `target` set to `target.id`. Write the array to `/tmp/harness-health-findings.json`.
```

Replace with:

```markdown
This branch doesn't need `_shared/harness-health-analysis.md`'s 8-dimension check — the 8 dimensions (template conformance, best-practice fit, cross-skill overlap, etc.) are skill/rule/claude-md-specific and don't map onto a project-root design-context file. `_shared/harness-health-analysis.md` is shared by `/wrap-up` and `/init`, neither of which ever passes a `design-artifact` target, so this branch lives here rather than in the shared file.

When `target.kind === 'memory'`, also skip the 8-dimension check — read the target file's full body and apply `_shared/harness-health-analysis.md`'s "Memory-Specific Checks" section instead, a narrower, more mechanical procedure suited to an index entry rather than a multi-section document. Emit findings the same way (Finding Shape, `assetType: "memory"`, `target: target.id`), appended to the same findings array.

For every other `target.kind` (skill, rule, claude-md), apply the full procedure in `_shared/harness-health-analysis.md` (the 8-dimension check, evidence pre-checks, verify gate, concrete gap signals — using `target.kind` to select which dimensions and origin-template references apply) to the target. Emit findings as a JSON array in the Finding Shape that file defines, with `assetType` set to `target.kind` and `target` set to `target.id`. Write the array to `/tmp/harness-health-findings.json`.
```

- [ ] **Step 6: Add the memory commit-skip carve-out to Step 7 (APPLY or FILE)**

Find:

```markdown
- Otherwise, if `payload.classification === "additive"`, `payload.confidence === "high"`, and `payload.reversibility === "high"` — apply it directly with `Edit` (using `payload.oldString`/`payload.newString` exactly), commit: `git commit -am "harness-health: apply additive patch to {target} ({section})"`, then mark it applied so it doesn't get re-proposed: `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "${payload.id}" applied --root .`.
```

Replace with:

```markdown
- Otherwise, if `payload.classification === "additive"`, `payload.confidence === "high"`, and `payload.reversibility === "high"` — apply it directly with `Edit` (using `payload.oldString`/`payload.newString` exactly). For every `assetType` except `memory`, commit: `git commit -am "harness-health: apply additive patch to {target} ({section})"`. For `payload.assetType === 'memory'`, skip the commit — a memory file lives outside this repo's git tree, so there is nothing to commit. Either way, mark it applied so it doesn't get re-proposed: `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "${payload.id}" applied --root .`.
```

- [ ] **Step 7: Add an Anti-Patterns row**

Find the last row of the Anti-Patterns table:

```markdown
| Editing code to "fix" what a skill, rule, or CLAUDE.md describes | This skill only ever touches harness documentation, never the code it describes. |
| Proposing a "new-rule" or "new-claude-md-section" finding | Gap detection (proposing a brand-new artifact) is skill-only this phase — rules and CLAUDE.md only ever get `patch` findings against their existing content. |
```

Replace with:

```markdown
| Editing code to "fix" what a skill, rule, or CLAUDE.md describes | This skill only ever touches harness documentation, never the code it describes. |
| Proposing a "new-rule" or "new-claude-md-section" finding | Gap detection (proposing a brand-new artifact) is skill-only this phase — rules and CLAUDE.md only ever get `patch` findings against their existing content. |
| Folding memory into `listTargets`'s default pool | A bare Routine firing has no way to know it shouldn't touch memory — the exclusion has to be structural (a separate lister, a separate CLI branch), not a documented convention alone. |
```

- [ ] **Step 8: Commit**

```bash
git add skills/harness-health/SKILL.md
git commit -m "harness-health SKILL.md: document --kind memory --memory-dir end to end"
```

---

### Task 9: Full verification pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS. If the `statusline too slow` timing test fails, rerun `node --test tests/statusline.test.js` alone to confirm it's the known flake (passes in isolation), not a real regression.

- [ ] **Step 2: Confirm `pwd`/branch sanity before any further git operations**

Run: `pwd && git rev-parse --show-toplevel && git branch --show-current`
Expected: all three point at this worktree (`.../.claude/worktrees/harness-health-v2-budget-memory`) and its branch (`worktree-harness-health-v2-budget-memory`) — confirms every commit in Tasks 1-8 landed in the right checkout.

- [ ] **Step 3: End-to-end dry run of the new CLI surface against a throwaway fixture**

```bash
FIXTURE_ROOT=$(mktemp -d)
FIXTURE_MEM=$(mktemp -d)
printf -- '- [Sample entry](sample-entry.md) — a test hook line\n' > "$FIXTURE_MEM/MEMORY.md"
printf -- 'Sample memory body with no special claims.\n' > "$FIXTURE_MEM/sample-entry.md"
node bin/harness-health.js next-target --root "$FIXTURE_ROOT" --kind memory --memory-dir "$FIXTURE_MEM"
```

Expected: prints a JSON object with `target.kind === "memory"`, `target.id === "sample-entry"`, `target.why === "stale"`. Then confirm the "never auto-selected" guarantee holds end-to-end:

```bash
node bin/harness-health.js next-target --root "$FIXTURE_ROOT"
```

Expected: `{ "target": null, "gapScanDue": true }` — no memory target leaks through a bare invocation even though `$FIXTURE_ROOT` has no skills/rules/CLAUDE.md at all to otherwise occupy the result.

- [ ] **Step 4: Review the full diff for the two doc-only tasks' rendering**

Read `skills/_shared/harness-health-analysis.md` and `skills/harness-health/SKILL.md` in full after all edits land, confirming: no duplicated headings, no dangling cross-references to a since-renamed section, and the Step 3 JUDGE section reads as three clean branches (`design-artifact`, `memory`, everything else) rather than an ambiguous fallthrough.

- [ ] **Step 5: Report status**

No commit for this task (verification only). Summarize: test count, any flakes encountered and resolved, confirmation the memory-exclusion guarantee held in the live CLI dry run.
