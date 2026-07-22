# claude-tweaks Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node-native eval harness ("drills") under `evals/` that runs claude-tweaks skills against reproducible fixture scenarios, grading both cost (tokens/USD/tool-calls/wall-clock) and quality (deterministic assertions), so a skill-file change can be measured before/after.

**Architecture:** A self-contained `evals/` package (own `package.json`, ESM) with `runner.js` driving the Claude Agent SDK's `query()` against an isolated fixture git repo, an `actor.js` `canUseTool` callback that auto-answers `AskUserQuestion` by picking the `(Recommended)` option (with per-scenario overrides), a deterministic `assertions/` library, and `fixtures/` helpers that reuse claude-tweaks' own `bin/lib/issues/local-store.js` directly so fixture work-records never drift from the real format.

**Tech Stack:** Node.js >=18 (ESM, `"type": "module"`), `@anthropic-ai/claude-agent-sdk@0.3.217`, `js-yaml@^5.2.1`, Node's built-in `node --test` runner.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-22-claude-tweaks-eval-harness-design.md` — read it before starting; every task below implements a specific section of it.
- `evals/` is entirely separate from the plugin's own `package.json` (which ships zero runtime npm deps) — never add a dependency to the top-level `package.json` for this work.
- All code under `evals/` is ESM (`import`/`export`), NOT CommonJS — this repo's existing code (`bin/lib/`, `tests/`) is CommonJS, but `@anthropic-ai/claude-agent-sdk` is ESM-only (confirmed: its package.json has `"type": "module"`, main export is `sdk.mjs`), so `evals/package.json` sets `"type": "module"` and every `.js` file under `evals/` uses `import`/`export`.
- Any `.js` file under `evals/` that needs a CommonJS module from `bin/lib/` (e.g. `bin/lib/issues/local-store.js`) imports it via `import { name } from '../../bin/lib/issues/local-store.js'` — Node's ESM/CJS interop synthesizes named imports from `module.exports = { ... }` automatically; no changes to the CommonJS files themselves.
- Every scenario run that actually invokes `query()` against the real Claude API costs real tokens/dollars. Tasks 6-9 each include one such real run as their own verification step — this is called out explicitly in each task, not hidden in a "run the tests" step.
- Directory layout (all paths below relative to repo root):
  ```
  evals/
    package.json
    .gitignore
    NOTES.md
    README.md
    runner.js
    actor.js
    assertions/
      parse-findings-table.js
      file-exists.js
      test-passes.js
      decisions-log-has.js
      tool-called.js
      tool-count.js
      commit-count.js
      findings-include.js
      findings-exclude-false-positive.js
      index.js
    fixtures/
      git-fixtures.js
      minimal-node-repo/
        package.json
        src/auth.js
        src/utils.js
        src/clean-module.js
      planted-bugs.patch
      (further fixture files added per-scenario in Tasks 7-9)
    scenarios/
      review-catches-planted-bugs.yaml
      code-health-seeded-findings.yaml
      simplify-fixes-planted-complexity.yaml
      triage-permission-matrix-compliance.yaml
    results/            (gitignored, created at runtime)
    tests/
      fixtures.test.js
      assertions.test.js
      actor.test.js
      runner.test.js
  ```

---

### Task 1: Scaffold `evals/` package and confirm the real Agent SDK API shapes

**Files:**
- Create: `evals/package.json`
- Create: `evals/.gitignore`
- Create: `evals/NOTES.md`

**Interfaces:**
- Produces: the confirmed field names for the SDK's result message (`total_cost_usd`, `usage`, or whatever `evals/NOTES.md` records after the grep below) and the `SdkPluginConfig` shape for `options.plugins` — Task 5 (`runner.js`) reads `evals/NOTES.md` and uses exactly what it says, adjusting the code below if the real grep output differs from what's assumed here.

Already confirmed (do not re-derive — verified directly against the published package during planning):
- Package name/version: `@anthropic-ai/claude-agent-sdk@0.3.217` (npm `dist-tags.latest` = `0.3.217` at plan time).
- It is ESM-only: `npm view @anthropic-ai/claude-agent-sdk type` → `module`; main export is `sdk.mjs`.
- `CanUseTool = (toolName: string, input: Record<string, unknown>, options: {...}) => Promise<PermissionResult | null>`, where `PermissionResult` is `{behavior: 'allow', updatedInput?, updatedPermissions?, toolUseID?, decisionClassification?}` or `{behavior: 'deny', message, interrupt?, toolUseID?, decisionClassification?}` — this is the exact type declaration from the installed package's `sdk.d.ts`.
- `query({ prompt, options }): Query`, where `Query extends AsyncGenerator<SDKMessage, void>` and `Options` includes `canUseTool`, `cwd`, `permissionMode`, `plugins`.

Still to confirm (this task's real work): the exact field names on the final result message (`total_cost_usd`, `usage`, `session_id` are referenced in Claude Code's docs but weren't confirmed verbatim against this exact installed version), and the exact shape of `SdkPluginConfig` (an object with at least a `path` field, per the docs' plugin-loading description, but not confirmed verbatim).

- [ ] **Step 1: Write `evals/package.json`**

```json
{
  "name": "claude-tweaks-evals",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Reproducible eval/benchmark harness (\"drills\") for claude-tweaks skills — cost and quality measurement on fixture scenarios, not live production telemetry.",
  "scripts": {
    "test": "node --test tests/"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "0.3.217",
    "js-yaml": "^5.2.1"
  }
}
```

- [ ] **Step 2: Write `evals/.gitignore`**

```
node_modules/
results/
```

- [ ] **Step 3: Install and confirm the install succeeds**

Run: `cd evals && npm install`
Expected: exits 0, creates `evals/node_modules/` and `evals/package-lock.json`.

- [ ] **Step 4: Grep the installed package for the result-message and plugin-config shapes**

Run:
```bash
cd evals
grep -n "SDKResultMessage\|SDKMessage =\|SdkPluginConfig" node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts
```

Expected: at least one match for each of the three search terms. Copy the exact matched type declarations (and, if `SDKResultMessage`'s fields aren't fully shown on the matched line, open `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` and locate its full definition) into `evals/NOTES.md` in Step 5 below.

- [ ] **Step 5: Write `evals/NOTES.md` documenting the confirmed shapes**

Write the file with this structure, filling in the `<paste here>` sections with the real output from Step 4 (do not leave the placeholder markers in the committed file — replace them with the actual grepped type text):

```markdown
# Agent SDK shapes confirmed for this harness

Package: @anthropic-ai/claude-agent-sdk@0.3.217 (ESM, "type": "module", main sdk.mjs)

## CanUseTool (confirmed against sdk.d.ts during planning)

    type CanUseTool = (
      toolName: string,
      input: Record<string, unknown>,
      options: { signal: AbortSignal; suggestions?: PermissionUpdate[]; blockedPath?: string;
        decisionReason?: string; title?: string; displayName?: string; description?: string;
        toolUseID: string; agentID?: string; requestId: string;
        matchedAskRule?: { source: string; toolName: string; ruleContent?: string; }; }
    ) => Promise<PermissionResult | null>;

    type PermissionResult =
      | { behavior: 'allow'; updatedInput?: Record<string, unknown>; updatedPermissions?: PermissionUpdate[];
          toolUseID?: string; decisionClassification?: PermissionDecisionClassification; }
      | { behavior: 'deny'; message: string; interrupt?: boolean; toolUseID?: string;
          decisionClassification?: PermissionDecisionClassification; };

## query()

    function query({ prompt, options }: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options; }): Query;
    // Query extends AsyncGenerator<SDKMessage, void>

## Result message shape (confirmed this task, Step 4)

<paste the real SDKResultMessage / SDKMessage union grep output here>

## Plugin config shape (confirmed this task, Step 4)

<paste the real SdkPluginConfig grep output here>
```

- [ ] **Step 6: Commit**

```bash
git add evals/package.json evals/.gitignore evals/NOTES.md evals/package-lock.json
git commit -m "Scaffold evals/ package and confirm real Agent SDK API shapes"
```

---

### Task 2: Fixture helpers (`evals/fixtures/git-fixtures.js`)

**Files:**
- Create: `evals/fixtures/git-fixtures.js`
- Test: `evals/tests/fixtures.test.js`

**Interfaces:**
- Consumes: `bin/lib/issues/local-store.js`'s `createRecord(dir, {slug, title, body, facets})` and `defaultFacets()` (both exist today, confirmed by reading the file directly).
- Produces: `freshRepo(): string`, `seedFiles(dir, files, message?): void`, `applyPatch(dir, patchText, message?): void`, `seedLocalWorkRecord(dir, {slug, title, body?, facets?}): record`, `walkFiles(dir, baseDir?): {[relPath]: content}` — Task 5 (`runner.js`) and Tasks 6-9 (scenario fixtures) all call these.

- [ ] **Step 1: Write the failing test**

Create `evals/tests/fixtures.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { freshRepo, seedFiles, applyPatch, seedLocalWorkRecord, walkFiles } from '../fixtures/git-fixtures.js';

test('freshRepo: creates an isolated repo with a HEAD commit', () => {
  const dir = freshRepo();
  const log = execFileSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
  assert.match(log, /init/);
});

test('seedFiles: writes and commits files', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'src/index.js': "module.exports = {};\n" });
  assert.ok(fs.existsSync(path.join(dir, 'src/index.js')));
  const log = execFileSync('git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' });
  assert.match(log, /seed fixture files/);
});

test('applyPatch: applies a unified diff and commits it', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'src/a.js': 'line one\nline two\n' });
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'line one\nline TWO\n', 'utf8');
  const patch = execFileSync('git', ['-C', dir, 'diff'], { encoding: 'utf8' });
  execFileSync('git', ['-C', dir, 'checkout', '--', 'src/a.js']);
  applyPatch(dir, patch);
  const content = fs.readFileSync(path.join(dir, 'src/a.js'), 'utf8');
  assert.strictEqual(content, 'line one\nline TWO\n');
});

test('seedLocalWorkRecord: writes a record readable by local-store', () => {
  const dir = freshRepo();
  const record = seedLocalWorkRecord(dir, {
    slug: 'test-record',
    title: 'Test Record',
    facets: { stage: 'ready', risk: 'low' },
  });
  assert.strictEqual(record.title, 'Test Record');
  assert.strictEqual(record.facets.stage, 'ready');
  assert.ok(fs.existsSync(record.path));
});

test('walkFiles: recursively reads a directory into a flat {relPath: content} map', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'a.txt': 'top', 'nested/b.txt': 'deep' });
  const files = walkFiles(path.join(dir));
  assert.strictEqual(files['a.txt'], 'top');
  assert.strictEqual(files['nested/b.txt'], 'deep');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd evals && node --test tests/fixtures.test.js`
Expected: FAIL — `Cannot find module '../fixtures/git-fixtures.js'`

- [ ] **Step 3: Write the implementation**

Create `evals/fixtures/git-fixtures.js`:

```js
// Fixture setup helpers for eval scenarios. Extends the mkdtemp+git-init+seed-
// commit pattern already used by tests/helpers/git-fixtures.js at the repo
// root, scoped to evals/ so a scenario's fixture repo never touches the real
// working tree. seedLocalWorkRecord writes through the real local-files
// driver (bin/lib/issues/local-store.js) directly, so fixture records can
// never drift from the format claude-tweaks skills actually read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRecord, defaultFacets } from '../../bin/lib/issues/local-store.js';

export function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-eval-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'eval@claude-tweaks.local']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'claude-tweaks-eval']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init', '-q']);
  return fs.realpathSync(dir);
}

export function seedFiles(dir, files, message = 'seed fixture files') {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-m', message, '-q']);
}

export function applyPatch(dir, patchText, message = 'apply planted patch') {
  const patchPath = path.join(dir, '.eval-patch.diff');
  fs.writeFileSync(patchPath, patchText, 'utf8');
  execFileSync('git', ['-C', dir, 'apply', patchPath]);
  fs.unlinkSync(patchPath);
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-m', message, '-q']);
}

export function seedLocalWorkRecord(dir, { slug, title, body = '', facets = {} }) {
  const specsDir = path.join(dir, 'specs');
  const record = createRecord(specsDir, { slug, title, body, facets: { ...defaultFacets(), ...facets } });
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-m', `seed local work record: ${title}`, '-q']);
  return record;
}

// Manual recursive walk (not fs.readdirSync's `recursive` option, which needs
// Node 20.1+ — this repo targets Node 18+) -> flat {relPath: content} map.
export function walkFiles(dir, baseDir = dir) {
  const result = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, walkFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath);
      result[relPath] = fs.readFileSync(fullPath, 'utf8');
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd evals && node --test tests/fixtures.test.js`
Expected: PASS (5 tests, 0 failures)

- [ ] **Step 5: Commit**

```bash
git add evals/fixtures/git-fixtures.js evals/tests/fixtures.test.js
git commit -m "Add evals/ fixture helpers reusing local-store.js directly"
```

---

### Task 3: Deterministic assertion library

**Files:**
- Create: `evals/assertions/parse-findings-table.js`
- Create: `evals/assertions/file-exists.js`
- Create: `evals/assertions/test-passes.js`
- Create: `evals/assertions/decisions-log-has.js`
- Create: `evals/assertions/tool-called.js`
- Create: `evals/assertions/tool-count.js`
- Create: `evals/assertions/commit-count.js`
- Create: `evals/assertions/findings-include.js`
- Create: `evals/assertions/findings-exclude-false-positive.js`
- Create: `evals/assertions/index.js`
- Test: `evals/tests/assertions.test.js`

**Interfaces:**
- Produces: `runAssertion(context, assertion): {type, pass, message}`, where `context = {repoDir, resultText, toolCalls}` — Task 5 (`runner.js`) builds `context` once per scenario run and calls this for every entry in the scenario's `assertions` array.
- Consumes: nothing from earlier tasks except `evals/fixtures/git-fixtures.js`'s test helpers (for building test fixtures in this task's own tests).

The findings table format below is the real, confirmed shape from `skills/review/review-summary-template.md`:
```
### Code Review Findings (confirmed)
| Category | Finding | Severity | Action |
|----------|---------|----------|--------|
```
There is no separate file/line column — a file/line reference (when present) is embedded as text inside the `Finding` cell. `findings-include`/`findings-exclude-false-positive` match by severity plus substring(s) the `Finding` cell must contain, not by structured file/line fields.

- [ ] **Step 1: Write the failing tests**

Create `evals/tests/assertions.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { runAssertion } from '../assertions/index.js';
import { freshRepo, seedFiles } from '../fixtures/git-fixtures.js';

const SAMPLE_FINDINGS_TEXT = `
## Review: test

### Code Review Findings (confirmed)
| Category | Finding | Severity | Action |
|----------|---------|----------|--------|
| security | SQL injection via string concatenation in src/auth.js | high | captured |
| perf | Off-by-one slice in src/utils.js | medium | captured |

### Next Actions
`;

test('file-exists: passes when the file exists', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'src/a.js': 'x' });
  const result = runAssertion({ repoDir: dir }, { type: 'file-exists', path: 'src/a.js' });
  assert.strictEqual(result.pass, true);
});

test('file-exists: fails when the file is missing', () => {
  const dir = freshRepo();
  const result = runAssertion({ repoDir: dir }, { type: 'file-exists', path: 'src/missing.js' });
  assert.strictEqual(result.pass, false);
});

test('test-passes: passes when the command exits 0', () => {
  const dir = freshRepo();
  const result = runAssertion({ repoDir: dir }, { type: 'test-passes', command: 'true' });
  assert.strictEqual(result.pass, true);
});

test('test-passes: fails when the command exits non-zero', () => {
  const dir = freshRepo();
  const result = runAssertion({ repoDir: dir }, { type: 'test-passes', command: 'false' });
  assert.strictEqual(result.pass, false);
});

test('decisions-log-has: finds a substring in the most recent run\'s decisions.md', () => {
  const dir = freshRepo();
  seedFiles(dir, {
    '.claude-tweaks/pipelines/2026-01-01T000000-x-standalone/decisions.md':
      '# Auto-Decision Log\n\nAUTO 10:00:00 — Step 1: did the thing.\n',
  });
  const result = runAssertion({ repoDir: dir }, { type: 'decisions-log-has', contains: 'did the thing' });
  assert.strictEqual(result.pass, true);
});

test('decisions-log-has: fails when the substring is absent', () => {
  const dir = freshRepo();
  seedFiles(dir, {
    '.claude-tweaks/pipelines/2026-01-01T000000-x-standalone/decisions.md': '# Auto-Decision Log\n',
  });
  const result = runAssertion({ repoDir: dir }, { type: 'decisions-log-has', contains: 'nope' });
  assert.strictEqual(result.pass, false);
});

test('tool-called: passes when the tool was called at least N times', () => {
  const result = runAssertion({ toolCalls: ['Read', 'Edit', 'Edit'] }, { type: 'tool-called', name: 'Edit', atLeast: 2 });
  assert.strictEqual(result.pass, true);
});

test('tool-count: fails when over max', () => {
  const result = runAssertion({ toolCalls: new Array(50).fill('Read') }, { type: 'tool-count', max: 40 });
  assert.strictEqual(result.pass, false);
});

test('commit-count: counts commits since a ref', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'a.txt': '1' });
  seedFiles(dir, { 'b.txt': '2' });
  const result = runAssertion({ repoDir: dir }, { type: 'commit-count', max: 5 });
  assert.strictEqual(result.pass, true);
});

test('findings-include: finds a matching row by severity and substring', () => {
  const result = runAssertion(
    { resultText: SAMPLE_FINDINGS_TEXT },
    { type: 'findings-include', severity: 'high', contains: 'src/auth.js' },
  );
  assert.strictEqual(result.pass, true);
});

test('findings-include: fails when no row matches', () => {
  const result = runAssertion(
    { resultText: SAMPLE_FINDINGS_TEXT },
    { type: 'findings-include', severity: 'critical', contains: 'src/auth.js' },
  );
  assert.strictEqual(result.pass, false);
});

test('findings-exclude-false-positive: passes when the file is never mentioned', () => {
  const result = runAssertion(
    { resultText: SAMPLE_FINDINGS_TEXT },
    { type: 'findings-exclude-false-positive', files: ['src/clean-module.js'] },
  );
  assert.strictEqual(result.pass, true);
});

test('findings-exclude-false-positive: fails when the file IS mentioned', () => {
  const result = runAssertion(
    { resultText: SAMPLE_FINDINGS_TEXT },
    { type: 'findings-exclude-false-positive', files: ['src/auth.js'] },
  );
  assert.strictEqual(result.pass, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd evals && node --test tests/assertions.test.js`
Expected: FAIL — `Cannot find module '../assertions/index.js'`

- [ ] **Step 3: Write the implementations**

Create `evals/assertions/parse-findings-table.js`:

```js
// Shared by findings-include.js and findings-exclude-false-positive.js.
// Parses the real "### Code Review Findings (confirmed)" table shape from
// skills/review/review-summary-template.md:
//   | Category | Finding | Severity | Action |
// There is no file/line column — a file/line reference, when present, is
// embedded as text inside the Finding cell.
const TABLE_HEADING = '### Code Review Findings (confirmed)';

export function parseFindingsTable(resultText) {
  const headingIdx = (resultText || '').indexOf(TABLE_HEADING);
  if (headingIdx === -1) return [];
  const lines = resultText.slice(headingIdx + TABLE_HEADING.length).split('\n');
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\|-+\|/.test(trimmed)) { inTable = true; continue; }
    if (inTable) {
      if (!trimmed.startsWith('|')) break;
      const cells = trimmed.split('|').map((c) => c.trim()).filter((c) => c !== '');
      if (cells.length < 4) continue;
      const [category, finding, severity, action] = cells;
      rows.push({ category, finding, severity, action });
    }
  }
  return rows;
}
```

Create `evals/assertions/file-exists.js`:

```js
import fs from 'node:fs';
import path from 'node:path';

export function fileExists(repoDir, { path: relPath, shouldExist = true }) {
  const exists = fs.existsSync(path.join(repoDir, relPath));
  if (exists === shouldExist) return { pass: true, message: `${relPath} exists=${exists} as expected` };
  return { pass: false, message: `${relPath} exists=${exists}, expected ${shouldExist}` };
}
```

Create `evals/assertions/test-passes.js`:

```js
import { execFileSync } from 'node:child_process';

export function testPasses(repoDir, { command = 'npm test' } = {}) {
  const [cmd, ...args] = command.split(' ');
  try {
    execFileSync(cmd, args, { cwd: repoDir, encoding: 'utf8' });
    return { pass: true, message: `${command} passed` };
  } catch (err) {
    return { pass: false, message: `${command} failed: ${err.stdout || err.message}` };
  }
}
```

Create `evals/assertions/decisions-log-has.js`:

```js
import fs from 'node:fs';
import path from 'node:path';

function findLatestDecisionsLog(repoDir) {
  const pipelinesDir = path.join(repoDir, '.claude-tweaks', 'pipelines');
  if (!fs.existsSync(pipelinesDir)) return null;
  const dirs = fs.readdirSync(pipelinesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (dirs.length === 0) return null;
  const logPath = path.join(pipelinesDir, dirs[dirs.length - 1], 'decisions.md');
  return fs.existsSync(logPath) ? logPath : null;
}

export function decisionsLogHas(repoDir, { contains }) {
  const logPath = findLatestDecisionsLog(repoDir);
  if (!logPath) return { pass: false, message: 'no decisions.md found under .claude-tweaks/pipelines/' };
  const content = fs.readFileSync(logPath, 'utf8');
  const needles = Array.isArray(contains) ? contains : [contains];
  const missing = needles.filter((n) => !content.includes(n));
  if (missing.length === 0) return { pass: true, message: 'decisions.md contains all expected substrings' };
  return { pass: false, message: `decisions.md missing: ${JSON.stringify(missing)}` };
}
```

Create `evals/assertions/tool-called.js`:

```js
export function toolCalled(toolCalls, { name, atLeast = 1 }) {
  const count = (toolCalls || []).filter((t) => t === name).length;
  if (count >= atLeast) return { pass: true, message: `${name} called ${count} times` };
  return { pass: false, message: `${name} called ${count} times, expected at least ${atLeast}` };
}
```

Create `evals/assertions/tool-count.js`:

```js
export function toolCount(toolCalls, { max, min } = {}) {
  const n = (toolCalls || []).length;
  if (max !== undefined && n > max) return { pass: false, message: `tool count ${n} exceeds max ${max}` };
  if (min !== undefined && n < min) return { pass: false, message: `tool count ${n} below min ${min}` };
  return { pass: true, message: `tool count ${n} within bounds` };
}
```

Create `evals/assertions/commit-count.js`:

```js
import { execFileSync } from 'node:child_process';

export function commitCount(repoDir, { max, min, since } = {}) {
  const args = ['log', '--oneline'];
  if (since) args.push(`${since}..HEAD`);
  const out = execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' });
  const n = out.trim() === '' ? 0 : out.trim().split('\n').length;
  if (max !== undefined && n > max) return { pass: false, message: `commit count ${n} exceeds max ${max}` };
  if (min !== undefined && n < min) return { pass: false, message: `commit count ${n} below min ${min}` };
  return { pass: true, message: `commit count ${n} within bounds` };
}
```

Create `evals/assertions/findings-include.js`:

```js
import { parseFindingsTable } from './parse-findings-table.js';

export function findingsInclude(resultText, { severity, contains }) {
  const needles = (Array.isArray(contains) ? contains : [contains]).map((s) => s.toLowerCase());
  const rows = parseFindingsTable(resultText);
  const matched = rows.find((row) => {
    if (severity && row.severity.toLowerCase() !== severity.toLowerCase()) return false;
    const haystack = row.finding.toLowerCase();
    return needles.every((n) => haystack.includes(n));
  });
  if (matched) return { pass: true, message: `found matching row: ${JSON.stringify(matched)}` };
  return { pass: false, message: `no row with severity=${severity} containing [${needles.join(', ')}] in: ${JSON.stringify(rows)}` };
}
```

Create `evals/assertions/findings-exclude-false-positive.js`:

```js
import { parseFindingsTable } from './parse-findings-table.js';

export function findingsExcludeFalsePositive(resultText, { files }) {
  const rows = parseFindingsTable(resultText);
  const offenders = rows.filter((row) => files.some((f) => row.finding.toLowerCase().includes(f.toLowerCase())));
  if (offenders.length === 0) return { pass: true, message: 'no false-positive rows found' };
  return { pass: false, message: `false positives found: ${JSON.stringify(offenders)}` };
}
```

Create `evals/assertions/index.js`:

```js
import { fileExists } from './file-exists.js';
import { testPasses } from './test-passes.js';
import { decisionsLogHas } from './decisions-log-has.js';
import { toolCalled } from './tool-called.js';
import { toolCount } from './tool-count.js';
import { commitCount } from './commit-count.js';
import { findingsInclude } from './findings-include.js';
import { findingsExcludeFalsePositive } from './findings-exclude-false-positive.js';

// Registry mapping a scenario assertion's `type` field to its implementation.
// Each fn takes (context, params) -> {pass, message}. context is built once
// per scenario run by runner.js: {repoDir, resultText, toolCalls}.
const ASSERTIONS = {
  'file-exists': (ctx, params) => fileExists(ctx.repoDir, params),
  'test-passes': (ctx, params) => testPasses(ctx.repoDir, params),
  'decisions-log-has': (ctx, params) => decisionsLogHas(ctx.repoDir, params),
  'tool-called': (ctx, params) => toolCalled(ctx.toolCalls, params),
  'tool-count': (ctx, params) => toolCount(ctx.toolCalls, params),
  'commit-count': (ctx, params) => commitCount(ctx.repoDir, params),
  'findings-include': (ctx, params) => findingsInclude(ctx.resultText, params),
  'findings-exclude-false-positive': (ctx, params) => findingsExcludeFalsePositive(ctx.resultText, params),
};

export function runAssertion(context, assertion) {
  const { type, ...params } = assertion;
  const fn = ASSERTIONS[type];
  if (!fn) throw new Error(`unknown assertion type: ${type}`);
  return { type, ...fn(context, params) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd evals && node --test tests/assertions.test.js`
Expected: PASS (13 tests, 0 failures)

- [ ] **Step 5: Commit**

```bash
git add evals/assertions/ evals/tests/assertions.test.js
git commit -m "Add deterministic assertion library for eval scenarios"
```

---

### Task 4: Actor (`canUseTool` callback)

**Files:**
- Create: `evals/actor.js`
- Test: `evals/tests/actor.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `createActor({ answerOverrides }): CanUseTool` — a function matching the confirmed `CanUseTool` signature from Task 1's `evals/NOTES.md` (`(toolName, input, options) => Promise<PermissionResult | null>`). Task 5 (`runner.js`) calls `createActor(...)` once per scenario run and wires the result into `options.canUseTool`, wrapping it to also record tool names into a `toolCalls` array.

The `answers` map shape below (`{[questionText]: selectedLabel}`) matches the documented `AskUserQuestion` tool's own input schema (`answers: {propertyNames: string, additionalProperties: string}` — a map from question text to the selected option's label), which is the same tool schema this session's own `AskUserQuestion` tool calls use. This task's Step 1 also does a real due-diligence grep of the installed SDK for any `AskUserQuestion`-specific type before finalizing, in case the SDK's own permission-result plumbing expects something more specific.

- [ ] **Step 1: Grep the installed SDK for any AskUserQuestion-specific type**

Run: `cd evals && grep -rn "AskUserQuestion" node_modules/@anthropic-ai/claude-agent-sdk/`
Expected: either no matches (the SDK treats all tools generically through the same `CanUseTool`/`PermissionResult` shape — proceed with the design below as-is) or a match showing a more specific expected shape (adjust Step 3's implementation to match whatever is found, and note the finding in `evals/NOTES.md`).

- [ ] **Step 2: Write the failing test**

Create `evals/tests/actor.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { createActor } from '../actor.js';

const SAMPLE_INPUT = {
  questions: [
    {
      question: 'Which effort tier?',
      header: 'Effort',
      options: [
        { label: 'Low' },
        { label: 'Medium (Recommended)' },
        { label: 'High' },
      ],
      multiSelect: false,
    },
  ],
};

test('default policy: auto-selects the option labeled (Recommended)', async () => {
  const actor = createActor();
  const result = await actor('AskUserQuestion', SAMPLE_INPUT, {});
  assert.strictEqual(result.behavior, 'allow');
  assert.strictEqual(result.updatedInput.answers['Which effort tier?'], 'Medium (Recommended)');
});

test('answerOverrides: a matching override takes priority over the default', async () => {
  const actor = createActor({ answerOverrides: [{ match: 'effort tier', answer: 'High' }] });
  const result = await actor('AskUserQuestion', SAMPLE_INPUT, {});
  assert.strictEqual(result.updatedInput.answers['Which effort tier?'], 'High');
});

test('non-AskUserQuestion tools are allowed unmodified', async () => {
  const actor = createActor();
  const result = await actor('Read', { file_path: '/tmp/x' }, {});
  assert.deepStrictEqual(result, { behavior: 'allow', updatedInput: { file_path: '/tmp/x' } });
});

test('falls back to the first option when none is marked (Recommended)', async () => {
  const actor = createActor();
  const input = { questions: [{ question: 'Pick one', header: 'X', options: [{ label: 'A' }, { label: 'B' }] }] };
  const result = await actor('AskUserQuestion', input, {});
  assert.strictEqual(result.updatedInput.answers['Pick one'], 'A');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd evals && node --test tests/actor.test.js`
Expected: FAIL — `Cannot find module '../actor.js'`

- [ ] **Step 4: Write the implementation**

Create `evals/actor.js`:

```js
// canUseTool callback (Claude Agent SDK @anthropic-ai/claude-agent-sdk@0.3.217):
//   CanUseTool = (toolName, input, options) => Promise<PermissionResult | null>
//   PermissionResult = {behavior:'allow', updatedInput?, ...} | {behavior:'deny', message, ...}
// (confirmed against the installed package's sdk.d.ts — see evals/NOTES.md)
//
// Default policy for AskUserQuestion: auto-select whichever option in each
// question is labeled "(Recommended)" — claude-tweaks' own documented
// AskUserQuestion convention (CLAUDE.md's Interaction patterns section marks
// exactly one option this way on every call). answerOverrides lets a scenario
// target a specific question (matched by a case-insensitive substring of its
// `question` text) and supply a different answer, taking priority over the
// default. All other tools are allowed unmodified.

function pickRecommended(options) {
  const recommended = options.find((o) => /\(Recommended\)/i.test(o.label));
  return recommended ? recommended.label : options[0].label;
}

function findOverride(question, answerOverrides) {
  return (answerOverrides || []).find((o) => question.toLowerCase().includes(o.match.toLowerCase()));
}

export function createActor({ answerOverrides = [] } = {}) {
  return async function canUseTool(toolName, input, _options) {
    if (toolName !== 'AskUserQuestion') {
      return { behavior: 'allow', updatedInput: input };
    }
    const answers = {};
    for (const q of input.questions) {
      const override = findOverride(q.question, answerOverrides);
      answers[q.question] = override ? override.answer : pickRecommended(q.options);
    }
    return { behavior: 'allow', updatedInput: { questions: input.questions, answers } };
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd evals && node --test tests/actor.test.js`
Expected: PASS (4 tests, 0 failures)

- [ ] **Step 6: Commit**

```bash
git add evals/actor.js evals/tests/actor.test.js
git commit -m "Add canUseTool actor: auto-pick (Recommended), with answer overrides"
```

---

### Task 5: Runner orchestration (`evals/runner.js`)

**Files:**
- Create: `evals/runner.js`
- Test: `evals/tests/runner.test.js`

**Interfaces:**
- Consumes: `createActor` (Task 4), `runAssertion` (Task 3), `freshRepo`/`seedFiles`/`applyPatch`/`seedLocalWorkRecord`/`walkFiles` (Task 2), the confirmed `query()`/result-message shape from `evals/NOTES.md` (Task 1).
- Produces: the CLI entry point (`node runner.js run <scenario>` / `run --all`) and one JSON result file per run under `evals/results/`. Tasks 6-9 invoke this for real against their own scenario YAML files.

The scenario-loading and result-writing logic (the part that doesn't need a live API call) is tested here with a fake `queryFn` injected in place of the real SDK's `query`, following this repo's own lesson about test doubles: the fake's behavior must be a function invoked per call, not an eagerly-evaluated value, so it can't silently misrepresent what's under test. The real SDK wiring itself is proven for real in Task 6's own verification step, not here.

- [ ] **Step 1: Write the failing test**

Create `evals/tests/runner.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runScenarioWith } from '../runner.js';

// A fake queryFn matching the shape runner.js expects: given (prompt, options),
// returns an async generator yielding SDKMessage-shaped objects, ending with a
// result message. Built as a real async generator function (not a pre-built
// array), so each call produces fresh output rather than a shared, eagerly-
// evaluated fixture.
async function* fakeQuery(prompt, options) {
  await options.canUseTool('Read', { file_path: '/tmp/x' }, {});
  yield { type: 'assistant', message: { content: [{ type: 'text', text: 'No findings — code is clean.' }] } };
  yield { type: 'result', total_cost_usd: 0.01, usage: { input_tokens: 100, output_tokens: 50 } };
}

test('runScenarioWith: builds fixture, runs the fake query, evaluates assertions, writes a result file', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: tool-called',
    '    name: Read',
    '    atLeast: 1',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));

  const result = await runScenarioWith(scenarioPath, { queryFn: fakeQuery, resultsDir, fixturesDir: scenariosDir });

  assert.strictEqual(result.allPassed, true);
  assert.strictEqual(result.costUsd, 0.01);
  assert.strictEqual(result.toolCallCount, 1);
  const written = fs.readdirSync(resultsDir);
  assert.strictEqual(written.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd evals && node --test tests/runner.test.js`
Expected: FAIL — `Cannot find module '../runner.js'`

- [ ] **Step 3: Write the implementation**

Create `evals/runner.js`:

```js
// Scenario runner: loads a scenario YAML, builds its fixture, invokes the
// Claude Agent SDK's query() with the actor wired as canUseTool, evaluates
// the scenario's assertions against the result, and writes one JSON result
// file. queryFn is injectable (default: the real SDK's query) so this file's
// own orchestration logic is testable without a live API call — see
// evals/tests/runner.test.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import { createActor } from './actor.js';
import { runAssertion } from './assertions/index.js';
import { freshRepo, seedFiles, applyPatch, seedLocalWorkRecord, walkFiles } from './fixtures/git-fixtures.js';

const EVALS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(EVALS_ROOT, '..');
const SCENARIOS_DIR = path.join(EVALS_ROOT, 'scenarios');
const FIXTURES_DIR = path.join(EVALS_ROOT, 'fixtures');
const RESULTS_DIR = path.join(EVALS_ROOT, 'results');

function buildFixture(scenario, fixturesDir) {
  const dir = freshRepo();
  const baseName = scenario.fixture && scenario.fixture.base;
  if (baseName && baseName !== 'none') {
    const baseDir = path.join(fixturesDir, baseName);
    if (fs.existsSync(baseDir)) {
      const files = walkFiles(baseDir);
      if (Object.keys(files).length > 0) seedFiles(dir, files, 'seed base fixture');
    }
  }
  for (const step of (scenario.fixture && scenario.fixture.seed) || []) {
    if (step['apply-patch']) {
      const patchText = fs.readFileSync(path.join(fixturesDir, step['apply-patch']), 'utf8');
      applyPatch(dir, patchText);
    }
    if (step['local-record']) {
      seedLocalWorkRecord(dir, step['local-record']);
    }
  }
  return dir;
}

// scenarioPath -> result object, also written to <resultsDir>/<name>-<ts>.json.
// opts: { queryFn = realQuery, resultsDir = RESULTS_DIR, fixturesDir = FIXTURES_DIR }
export async function runScenarioWith(scenarioPath, opts = {}) {
  const { queryFn = realQuery, resultsDir = RESULTS_DIR, fixturesDir = FIXTURES_DIR } = opts;
  const scenario = yaml.load(fs.readFileSync(scenarioPath, 'utf8'));
  const repoDir = buildFixture(scenario, fixturesDir);
  const actor = createActor({ answerOverrides: scenario.answer_overrides });

  const toolCalls = [];
  let resultText = '';
  let costUsd = null;
  let tokens = null;
  const startedAt = Date.now();

  const stream = queryFn(scenario.skill_invocation.prompt, {
    cwd: repoDir,
    plugins: [{ path: PLUGIN_ROOT }],
    canUseTool: async (toolName, input, options) => {
      toolCalls.push(toolName);
      return actor(toolName, input, options);
    },
  });

  for await (const message of stream) {
    if (message.type === 'assistant' && message.message && message.message.content) {
      const textParts = message.message.content.filter((c) => c.type === 'text').map((c) => c.text);
      if (textParts.length > 0) resultText = textParts.join('\n');
    }
    if (message.type === 'result') {
      costUsd = message.total_cost_usd != null ? message.total_cost_usd : null;
      tokens = message.usage != null ? message.usage : null;
    }
  }

  const durationMs = Date.now() - startedAt;
  const context = { repoDir, resultText, toolCalls };
  const assertionResults = (scenario.assertions || []).map((a) => runAssertion(context, a));

  const result = {
    scenario: scenario.name,
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    costUsd,
    tokens,
    toolCallCount: toolCalls.length,
    assertions: assertionResults,
    allPassed: assertionResults.every((a) => a.pass),
  };

  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, `${scenario.name}-${startedAt}.json`), JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  const [, , cmd, arg] = process.argv;
  if (cmd !== 'run' || !arg) {
    console.error('usage: node runner.js run <scenario-name>|--all');
    process.exit(1);
  }
  const names = arg === '--all'
    ? fs.readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith('.yaml')).map((f) => f.replace(/\.yaml$/, ''))
    : [arg];

  let anyFailed = false;
  for (const name of names) {
    const scenarioPath = path.join(SCENARIOS_DIR, `${name}.yaml`);
    const result = await runScenarioWith(scenarioPath, {});
    console.log(`${name}: ${result.allPassed ? 'PASS' : 'FAIL'} (cost=$${result.costUsd}, tools=${result.toolCallCount}, ${result.durationMs}ms)`);
    if (!result.allPassed) anyFailed = true;
  }
  process.exit(anyFailed ? 1 : 0);
}

// Only run the CLI when this file is executed directly, not when imported by
// tests. Compares via pathToFileURL (not a hand-built `file://${path}` string)
// because this repo's own path contains a space ("Code Workspaces") — a
// manually-constructed URL string wouldn't percent-encode it the way
// import.meta.url does, so the two would silently never match.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd evals && node --test tests/runner.test.js`
Expected: PASS (1 test, 0 failures)

- [ ] **Step 5: Commit**

```bash
git add evals/runner.js evals/tests/runner.test.js
git commit -m "Add runner.js: scenario orchestration with injectable query for testing"
```

---

### Task 6: Scenario 1 — `review-catches-planted-bugs` (+ real end-to-end proof)

**Files:**
- Create: `evals/fixtures/minimal-node-repo/package.json`
- Create: `evals/fixtures/minimal-node-repo/src/auth.js`
- Create: `evals/fixtures/minimal-node-repo/src/utils.js`
- Create: `evals/fixtures/minimal-node-repo/src/clean-module.js`
- Create: `evals/fixtures/planted-bugs.patch`
- Create: `evals/scenarios/review-catches-planted-bugs.yaml`

**Interfaces:**
- Consumes: `runScenarioWith` (Task 5), the fixture/patch content below (already generated and verified with a real `git apply --check` during planning — do not regenerate it).

This task's own verification step is a **real invocation of the Claude Agent SDK against the real Claude API** — it costs real tokens/dollars. This is the harness's own proof that the whole pipeline (fixture → real `/claude-tweaks:review` run → assertions) works end-to-end, mirroring drill's own validation step (`uv run drill run triggering-test-driven-development -b claude`).

- [ ] **Step 1: Write the fixture base files**

Create `evals/fixtures/minimal-node-repo/package.json`:

```json
{
  "name": "eval-fixture-minimal-node-repo",
  "private": true,
  "version": "0.0.0"
}
```

Create `evals/fixtures/minimal-node-repo/src/auth.js` (the clean, pre-bug baseline):

```js
'use strict';

function buildUserLookupQuery(username) {
  const safeUsername = username.replace(/[^a-zA-Z0-9_]/g, '');
  return `SELECT * FROM users WHERE username = '${safeUsername}'`;
}

module.exports = { buildUserLookupQuery };
```

Create `evals/fixtures/minimal-node-repo/src/utils.js` (the clean, pre-bug baseline):

```js
'use strict';

function lastNItems(items, n) {
  return items.slice(items.length - n);
}

module.exports = { lastNItems };
```

Create `evals/fixtures/minimal-node-repo/src/clean-module.js`:

```js
'use strict';

function formatGreeting(name) {
  return `Hello, ${name}!`;
}

module.exports = { formatGreeting };
```

- [ ] **Step 2: Write the planted-bugs patch**

Create `evals/fixtures/planted-bugs.patch` with exactly this content (this diff was generated and verified with `git apply --check` against the exact baseline files above during planning — it applies cleanly):

```diff
diff --git a/src/auth.js b/src/auth.js
index 27c5c5c..fa870d1 100644
--- a/src/auth.js
+++ b/src/auth.js
@@ -1,8 +1,7 @@
 'use strict';
 
 function buildUserLookupQuery(username) {
-  const safeUsername = username.replace(/[^a-zA-Z0-9_]/g, '');
-  return `SELECT * FROM users WHERE username = '${safeUsername}'`;
+  return `SELECT * FROM users WHERE username = '${username}'`;
 }
 
 module.exports = { buildUserLookupQuery };
diff --git a/src/utils.js b/src/utils.js
index 3d8c0cd..8cf3ec4 100644
--- a/src/utils.js
+++ b/src/utils.js
@@ -1,7 +1,7 @@
 'use strict';
 
 function lastNItems(items, n) {
-  return items.slice(items.length - n);
+  return items.slice(items.length - n - 1);
 }
 
 module.exports = { lastNItems };
```

This plants two real defects: a SQL-injection-shaped bug in `auth.js` (removes the username sanitization, restoring raw string interpolation into the query) and an off-by-one bug in `utils.js` (`- n - 1` instead of `- n`, dropping one extra item). `clean-module.js` is untouched, so it's the false-positive control.

- [ ] **Step 3: Verify the patch applies cleanly**

Run (from the repo root; uses absolute paths throughout so directory-nesting math can't go wrong):
```bash
REPO_ROOT="$(pwd)"
CHECK_DIR=$(mktemp -d)
cp "$REPO_ROOT/evals/fixtures/minimal-node-repo/package.json" "$CHECK_DIR/"
mkdir -p "$CHECK_DIR/src"
cp "$REPO_ROOT/evals/fixtures/minimal-node-repo/src/"*.js "$CHECK_DIR/src/"
git -C "$CHECK_DIR" init -q
git -C "$CHECK_DIR" add -A
git -C "$CHECK_DIR" commit -q -m baseline
git -C "$CHECK_DIR" apply --check "$REPO_ROOT/evals/fixtures/planted-bugs.patch"
echo "exit code: $?"
```
Expected: `exit code: 0` with no other output (patch applies cleanly). `$CHECK_DIR` is a fresh `mktemp -d` temp directory each run — safe to leave or delete afterward, it's disposable.

- [ ] **Step 4: Write the scenario definition**

Create `evals/scenarios/review-catches-planted-bugs.yaml`:

```yaml
name: review-catches-planted-bugs
description: >
  Does /claude-tweaks:review find planted defects of known severity without
  false-positiving on clean code nearby?
fixture:
  base: minimal-node-repo
  seed:
    - apply-patch: planted-bugs.patch
skill_invocation:
  prompt: "/claude-tweaks:review"
answer_overrides:
  - match: "review-effort"
    answer: "medium"
assertions:
  - type: findings-include
    severity: high
    contains: "src/auth.js"
  - type: findings-include
    severity: medium
    contains: "src/utils.js"
  - type: findings-exclude-false-positive
    files: ["src/clean-module.js"]
  - type: tool-count
    max: 60
```

Note: the severities above (`high` for the SQL-injection-shaped bug, `medium` for the off-by-one) are this task's best expectation based on `_shared/criteria-review-quality.md`'s severity scale, not a guarantee of what the real model will output — Step 5's real run is exactly how this gets checked. If the real run assigns different severities, adjust the YAML to match reality rather than treating a severity mismatch as a harness bug.

- [ ] **Step 5: Run the scenario for real (costs real API usage)**

Run: `cd evals && node runner.js run review-catches-planted-bugs`
Expected: prints a `PASS` or `FAIL` line with cost/tool-count/duration. Read the written JSON file under `evals/results/` and inspect each assertion's `pass`/`message`. If an assertion fails because the real review output doesn't match this task's severity/wording assumptions (not because the harness itself is broken — e.g. the SDK call completed, produced a findings table, but with a different severity than guessed), adjust the scenario YAML's `severity`/`contains` values to match the real output and re-run, rather than treating it as a bug in `runner.js`/`assertions/`. If the run errors before producing a result at all (harness wiring issue), stop and debug `runner.js`/`actor.js` instead.

- [ ] **Step 6: Commit**

```bash
git add evals/fixtures/minimal-node-repo/ evals/fixtures/planted-bugs.patch evals/scenarios/review-catches-planted-bugs.yaml
git commit -m "Add review-catches-planted-bugs scenario, verified end-to-end"
```

---

### Task 7: Scenario 2 — `code-health-seeded-findings`

**Files:**
- Create: `evals/fixtures/code-health-repo/package.json`
- Create: `evals/fixtures/code-health-repo/src/oversized.js`
- Create: `evals/scenarios/code-health-seeded-findings.yaml`

**Interfaces:**
- Consumes: `runScenarioWith` (Task 5).

**Investigation first (this task's own real work, before writing the scenario):** `skills/code-health/SKILL.md` describes filing findings via `gh issue create` and dedup via a local cache at `.claude-tweaks/code-health/cache.json` (rebuilt fresh from `gh issue list` every run, per `_shared/health-state.md`). Since this scenario's fixture has no real GitHub remote, filing may not be exercisable the same way it is in real usage — confirm this before assuming the scenario can assert on filed issues.

- [ ] **Step 1: Read code-health's actual gh-availability degrade path**

Run: `grep -n "gh is unavailable\|ISSUES_FILE\|no reachable GitHub remote\|no gh\b" skills/code-health/SKILL.md`
Read the surrounding context for each match. Confirm: (a) whether code-health still computes fingerprints and runs its dedup logic when there's no reachable GitHub remote, even though it can't actually call `gh issue create`, and (b) what it reports in that case (does it still render a "would file N issues" section, or does it silently skip filing with no visible trace at all).

- [ ] **Step 2: Decide the scenario's assertion target based on Step 1's finding**

If code-health still writes to `.claude-tweaks/code-health/cache.json` (or renders a "would file" section in its own output) even without a reachable `gh` remote, assert against that (a `file-exists` check on the cache file, or a `findings-include`-style text check on the rendered report — write a small ad-hoc regex check inline in this task if the report format doesn't match the existing `findings-include` table shape, which is specific to `/review`, not `/code-health`). If code-health has no usable no-`gh` degrade path at all (it errors or silently produces nothing), defer this scenario to the second wave described in the design doc's Non-Goals (GitHub-sandbox scenarios) and note that explicitly in this task's commit message instead of forcing a broken scenario through.

- [ ] **Step 3: Write the fixture (assuming Step 2 found a usable degrade path)**

Create `evals/fixtures/code-health-repo/package.json`:

```json
{
  "name": "eval-fixture-code-health-repo",
  "private": true,
  "version": "0.0.0"
}
```

Create `evals/fixtures/code-health-repo/src/oversized.js` — a file seeded large enough to trip whatever size-based finding code-health's criteria catalog flags (confirm the actual threshold by reading `_shared/criteria-*.md` referenced from `skills/code-health/SKILL.md` before finalizing this file's size; write real, syntactically valid repeated content, not a placeholder comment, e.g. 30+ near-duplicate small exported functions).

- [ ] **Step 4: Write the scenario definition**

Create `evals/scenarios/code-health-seeded-findings.yaml` using whichever assertion target Step 2 identified. Example shape (adjust the assertion `type`/params to match Step 2's real finding):

```yaml
name: code-health-seeded-findings
description: >
  Does /claude-tweaks:code-health surface a seeded finding, and does a second
  run against the same repo state correctly dedup rather than re-report it?
fixture:
  base: code-health-repo
  seed: []
skill_invocation:
  prompt: "/claude-tweaks:code-health"
assertions:
  - type: tool-count
    max: 60
```

- [ ] **Step 5: Run the scenario twice for real (costs real API usage) and confirm dedup**

Run: `cd evals && node runner.js run code-health-seeded-findings` twice in a row against the **same** fixture instance is not possible with the current `buildFixture` (it creates a fresh temp repo every run) — note this as a known gap for this scenario specifically: confirming dedup across repeated runs needs the *same* fixture directory reused for a second invocation, not a fresh one. Handle this by adding a `--repo-dir <path>` override to `runner.js`'s CLI in this task if the investigation in Steps 1-2 confirms dedup is testable at all; otherwise scope this task down to first-run detection only (drop the dedup half of the scenario's description) and note the gap explicitly in the commit message.

- [ ] **Step 6: Commit**

```bash
git add evals/fixtures/code-health-repo/ evals/scenarios/code-health-seeded-findings.yaml
git commit -m "Add code-health-seeded-findings scenario (scope per gh-availability investigation)"
```

---

### Task 8: Scenario 3 — `simplify-fixes-planted-complexity`

**Files:**
- Create: `evals/fixtures/complexity-repo/package.json`
- Create: `evals/fixtures/complexity-repo/src/duplicated.js`
- Create: `evals/fixtures/complexity-repo/test/duplicated.test.js`
- Create: `evals/scenarios/simplify-fixes-planted-complexity.yaml`

**Interfaces:**
- Consumes: `runScenarioWith` (Task 5).

- [ ] **Step 1: Write the fixture with deliberate, real duplication**

Create `evals/fixtures/complexity-repo/package.json`:

```json
{
  "name": "eval-fixture-complexity-repo",
  "private": true,
  "version": "0.0.0",
  "scripts": { "test": "node --test test/" }
}
```

Create `evals/fixtures/complexity-repo/src/duplicated.js`:

```js
'use strict';

function formatUserName(first, last) {
  const trimmedFirst = first.trim();
  const trimmedLast = last.trim();
  return `${trimmedFirst} ${trimmedLast}`;
}

function formatAdminName(first, last) {
  const trimmedFirst = first.trim();
  const trimmedLast = last.trim();
  return `${trimmedFirst} ${trimmedLast}`;
}

module.exports = { formatUserName, formatAdminName };
```

Create `evals/fixtures/complexity-repo/test/duplicated.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { formatUserName, formatAdminName } = require('../src/duplicated.js');

test('formatUserName trims and joins', () => {
  assert.strictEqual(formatUserName(' Ada ', ' Lovelace '), 'Ada Lovelace');
});

test('formatAdminName trims and joins', () => {
  assert.strictEqual(formatAdminName(' Grace ', ' Hopper '), 'Grace Hopper');
});
```

- [ ] **Step 2: Confirm the fixture's own test suite passes before planting the fix expectation**

Run: `cd evals/fixtures/complexity-repo && node --test test/`
Expected: PASS (2 tests, 0 failures) — this fixture's baseline must be green before it's used as a "does the fix preserve behavior" scenario.

- [ ] **Step 3: Write the scenario definition**

Create `evals/scenarios/simplify-fixes-planted-complexity.yaml`:

```yaml
name: simplify-fixes-planted-complexity
description: >
  Does /claude-tweaks:simplify collapse the duplicated formatUserName/
  formatAdminName logic while keeping the existing tests passing?
fixture:
  base: complexity-repo
  seed: []
skill_invocation:
  prompt: "/claude-tweaks:simplify"
assertions:
  - type: test-passes
    command: "node --test test/"
  - type: tool-count
    max: 40
```

- [ ] **Step 4: Run the scenario for real (costs real API usage)**

Run: `cd evals && node runner.js run simplify-fixes-planted-complexity`
Expected: prints `PASS` or `FAIL`. Read the result JSON; if `test-passes` fails, inspect whether `/claude-tweaks:simplify` broke behavior (a real problem worth investigating) versus the harness failing to invoke it correctly (a `runner.js`/`actor.js` bug) before concluding anything about the skill itself.

- [ ] **Step 5: Commit**

```bash
git add evals/fixtures/complexity-repo/ evals/scenarios/simplify-fixes-planted-complexity.yaml
git commit -m "Add simplify-fixes-planted-complexity scenario, verified end-to-end"
```

---

### Task 9: Scenario 4 — `triage-permission-matrix-compliance`

**Files:**
- Create: `evals/fixtures/triage-backlog/` (seeded via `seedLocalWorkRecord`, not static files — built by this task's own small setup script)
- Create: `evals/scenarios/triage-permission-matrix-compliance.yaml`
- Create: `evals/assertions/local-record-facet.js`
- Modify: `evals/assertions/index.js` (register the new assertion type)
- Test: extend `evals/tests/assertions.test.js` with a `local-record-facet` test

**Interfaces:**
- Consumes: `runScenarioWith` (Task 5), `seedLocalWorkRecord` (Task 2), `readRecord` from `bin/lib/issues/local-store.js` (already exported, confirmed by reading the file directly).

**Important scoping note, confirmed from `skills/_shared/work-record.md`'s Permission matrix section**: under the `local-files` driver, `/triage`'s grants are recorded as frontmatter for isomorphism, but "no headless consumer acts on them — headless dispatch is `github-issues` only." This scenario grades `/triage`'s own grant/withhold *decision*, not any downstream dispatch behavior — assertions check the resulting record's frontmatter facets directly (via `readRecord`), which is fully exercisable under `local-files`.

- [ ] **Step 1: Add the `local-record-facet` assertion**

Create `evals/assertions/local-record-facet.js`:

```js
// Reads a local-files work-record's frontmatter facets directly (via
// bin/lib/issues/local-store.js's readRecord) and checks one facet's value.
// Used for asserting /claude-tweaks:triage's grant/withhold decisions, which
// under work-backend: local-files are recorded as frontmatter but not acted
// on by any headless consumer (see skills/_shared/work-record.md's
// Permission matrix "Driver-conditional note") — so the only thing to check
// is the record's own resulting facet state, not any downstream effect.
import path from 'node:path';
import { readRecord } from '../../bin/lib/issues/local-store.js';

export function localRecordFacet(repoDir, { recordPath, facet, equals }) {
  const record = readRecord(path.join(repoDir, recordPath));
  const actual = facet.split('.').reduce((v, k) => (v == null ? v : v[k]), record.facets);
  if (JSON.stringify(actual) === JSON.stringify(equals)) {
    return { pass: true, message: `${recordPath} facets.${facet} = ${JSON.stringify(actual)} as expected` };
  }
  return { pass: false, message: `${recordPath} facets.${facet} = ${JSON.stringify(actual)}, expected ${JSON.stringify(equals)}` };
}
```

- [ ] **Step 2: Register it in the assertion index**

Modify `evals/assertions/index.js` — add the import and registry entry:

```js
import { localRecordFacet } from './local-record-facet.js';
```

Add to the `ASSERTIONS` object:

```js
  'local-record-facet': (ctx, params) => localRecordFacet(ctx.repoDir, params),
```

- [ ] **Step 3: Write the failing test for the new assertion**

Add to `evals/tests/assertions.test.js`:

```js
test('local-record-facet: reads a facet from a seeded local-files record', () => {
  const dir = freshRepo();
  const record = seedLocalWorkRecord(dir, { slug: 'triage-me', title: 'Triage Me', facets: { stage: 'ready', risk: 'low' } });
  const relPath = record.path.replace(dir + path.sep, '');
  const result = runAssertion({ repoDir: dir }, { type: 'local-record-facet', recordPath: relPath, facet: 'stage', equals: 'ready' });
  assert.strictEqual(result.pass, true);
});
```

Add `seedLocalWorkRecord` and `freshRepo` to the existing import line from `../fixtures/git-fixtures.js` at the top of `evals/tests/assertions.test.js` (they aren't imported there yet from Task 3).

- [ ] **Step 4: Run to verify it fails, then passes**

Run: `cd evals && node --test tests/assertions.test.js`
First expected: FAIL (`localRecordFacet is not a function` / module not found).
After Steps 1-2 are in place: PASS (14 tests, 0 failures).

- [ ] **Step 5: Build the triage-backlog fixture via a small setup script and write the scenario**

Since this fixture is several seeded local-files records rather than static files, create it via a one-off Node script run once to produce the fixture's expected starting shape, then commit the resulting directory tree (a fixture is meant to be a fixed, inspectable starting state, not regenerated at scenario-run time — `buildFixture` in `runner.js` only knows how to copy static files and apply patches/records via `scenario.fixture.seed`, so express this fixture as `local-record` seed steps directly in the scenario YAML rather than pre-baked files):

Create `evals/scenarios/triage-permission-matrix-compliance.yaml`:

```yaml
name: triage-permission-matrix-compliance
description: >
  Does /claude-tweaks:triage correctly grant auto:build on a ready, scored
  record, and correctly withhold it (flagging back to unscored) on a record
  that was never shaped?
fixture:
  base: none
  seed:
    - local-record:
        slug: ready-and-scored
        title: "Add input validation to the signup form"
        facets: { stage: "ready", risk: "low", effort: "small" }
    - local-record:
        slug: never-shaped
        title: "Investigate flaky CI"
        facets: {}
skill_invocation:
  prompt: "/claude-tweaks:triage"
assertions:
  - type: local-record-facet
    recordPath: "specs/1-ready-and-scored.md"
    facet: "grants.build"
    equals: true
  - type: local-record-facet
    recordPath: "specs/2-never-shaped.md"
    facet: "grants.build"
    equals: false
  - type: tool-count
    max: 40
```

Note: `recordPath` filenames assume `createRecord`'s id-allocation assigns `1` and `2` in seed order against an empty `specs/` dir, per `bin/lib/issues/local-store.js`'s `allocateId` — confirm this by running Step 6 below and adjusting the paths if the real assigned ids differ.

- [ ] **Step 6: Run the scenario for real (costs real API usage)**

Run: `cd evals && node runner.js run triage-permission-matrix-compliance`
Expected: prints `PASS` or `FAIL`. If the assertions fail specifically because the actual record filenames/ids differ from Step 5's assumption (check `evals/results/`'s written JSON and, if needed, the fixture repo's own `specs/` directory before it's cleaned up), fix the YAML's `recordPath` values to match reality and re-run.

- [ ] **Step 7: Commit**

```bash
git add evals/assertions/local-record-facet.js evals/assertions/index.js evals/tests/assertions.test.js evals/scenarios/triage-permission-matrix-compliance.yaml
git commit -m "Add triage-permission-matrix-compliance scenario and local-record-facet assertion"
```

---

### Task 10: README and final wiring

**Files:**
- Create: `evals/README.md`

**Interfaces:**
- Consumes: nothing new — this task only documents Tasks 1-9's already-committed output.

- [ ] **Step 1: Write `evals/README.md`**

```markdown
# claude-tweaks eval harness ("drills")

Reproducible fixture scenarios that run real claude-tweaks skills against
isolated repos and grade both cost (tokens/USD/tool-calls/wall-clock) and
quality (deterministic assertions) — not live production telemetry. See
`docs/superpowers/specs/2026-07-22-claude-tweaks-eval-harness-design.md`
for the full design and rationale.

## Setup

    cd evals
    npm install

Requires an `ANTHROPIC_API_KEY` in the environment — every scenario run
invokes the real Claude Agent SDK and costs real tokens/dollars.

## Usage

    node runner.js run review-catches-planted-bugs
    node runner.js run --all

Each run writes one JSON result file to `results/` (gitignored): cost,
tokens, tool-call count, wall-clock duration, and a per-assertion pass/fail
list.

## Comparing before/after a skill change

    node runner.js run --all               # on main
    git checkout my-skill-change-branch
    node runner.js run --all               # on the branch
    # diff the two result sets under results/ by hand

No durable cross-run store exists yet — this is a deliberate v1 scope
decision (see the design doc's Result Handling section). Non-determinism:
a single run's numbers are noisy since this drives a real LLM agent, not
deterministic code — read a small delta as indicative, not conclusive.

## Running the harness's own tests

    cd evals
    node --test tests/

This is fast and free — it tests `runner.js`/`actor.js`/`assertions/`/
`fixtures/`'s own logic with an injected fake `queryFn`, never a real API
call. Only `node runner.js run <scenario>` costs real usage.

## Scenarios

| Scenario | What it measures |
|---|---|
| `review-catches-planted-bugs` | `/claude-tweaks:review`'s defect-finding recall/precision |
| `code-health-seeded-findings` | `/claude-tweaks:code-health`'s detection (scope per Task 7's gh-availability investigation) |
| `simplify-fixes-planted-complexity` | `/claude-tweaks:simplify` fixes duplication, tests stay green |
| `triage-permission-matrix-compliance` | `/claude-tweaks:triage`'s grant/withhold decisions |

## Adding a scenario

1. Add fixture files under `fixtures/` (or `local-record` seed steps directly
   in the scenario YAML for local-files-backend scenarios).
2. Write `scenarios/<name>.yaml`: `fixture`, `skill_invocation.prompt`,
   optional `answer_overrides`, and `assertions` (see `assertions/index.js`
   for the registered assertion types).
3. Run it for real once (`node runner.js run <name>`) to confirm it behaves
   as expected before committing.
```

- [ ] **Step 2: Commit**

```bash
git add evals/README.md
git commit -m "Add evals/README.md"
```

---

## Self-Review Notes

**Spec coverage:** Every section of the design doc maps to a task — architecture (Tasks 1, 4, 5), repo layout (all tasks), scenario format (Task 5's YAML loading + Tasks 6-9), assertion library (Task 3), cost/quality capture (Task 5), first-cut scenarios 1-4 (Tasks 6-9), README (Task 10). The design doc's deferred second-wave full-lifecycle scenario is explicitly out of scope for this plan, per the design doc itself.

**Placeholder scan:** No TBD/TODO markers remain. The two places where a genuine external-API detail wasn't fully confirmed during planning (the exact `SDKResultMessage` field names, and whether `AskUserQuestion` needs SDK-specific handling beyond the generic `CanUseTool` shape) are each resolved by a concrete, real verification step with an exact command and expected-output description (Task 1 Step 4, Task 4 Step 1) — not left as vague follow-up work.

**Type consistency:** `runAssertion(context, assertion)` (Task 3) is called identically in Task 5's `runner.js` and in every scenario task's own tests. `createActor({answerOverrides})` (Task 4) returns a function matching the exact `CanUseTool` signature consumed by Task 5's `runner.js`. `freshRepo`/`seedFiles`/`applyPatch`/`seedLocalWorkRecord`/`walkFiles` (Task 2) are named and called identically everywhere they're used (Tasks 3, 5, 9).
