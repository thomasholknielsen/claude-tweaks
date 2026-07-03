# Hook Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the claude-tweaks hook surface — a single dispatcher (`bin/hooks.js`) behind six hooks.json registrations implementing pipeline-run continuity (SessionStart/SessionEnd/PreCompact) and tiered pipeline enforcement (PreToolUse/PostToolUse/SubagentStop).

**Architecture:** Every hooks.json entry runs `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" <event>`. The dispatcher parses the hook's stdin JSON once, resolves the pipeline run dir once, and routes to one module per event in `bin/lib/hooks/`. Modules return `{exit, json}`; the dispatcher prints/exits. Two auxiliary CLI subcommands (`record-worktree`, `close-run`) give skills a single writer for `run-state.json`. Spec: `docs/superpowers/specs/2026-07-03-hook-surface-design.md`.

**Tech Stack:** Node 18+ (CommonJS, zero runtime npm deps), `node --test` + `node:assert`, git CLI (only inside E1/E2, only on matched fires).

## Global Constraints

- Node 18+, CommonJS (`require`), **zero external npm dependencies** — same as all existing `bin/` code.
- **Cardinal invariant:** a hook must never break a session. Every dispatcher path exits 0 on any error; the ONLY deliberate non-zero exit is E1's deny. Malformed stdin, missing run dir, fs errors → silent exit 0.
- **Ambiguity resolves to allow.** E1 denies only on a provable checkout mismatch.
- Pipeline-gated modules (E1/E2/E3) do nothing when no run dir resolves.
- Hook stdin JSON is parsed defensively — no field is trusted to exist (schema may drift across Claude Code versions).
- Commit style: imperative, no conventional-commit prefixes (e.g. `Add hooks dispatcher skeleton — route events, exit 0 on garbage stdin`). Stage specific files only, never `git add -A`. Verify with `git log --oneline -3` after each commit.
- Run the full suite (`npm test`) before each commit; all pre-existing tests must stay green.
- No emojis in any file. Markdown skill/docs edits follow existing file conventions.

---

### Task 1: Empirical matcher-granularity check (spec risk #1 — gates E1/E2 registration shape)

**Files:**
- Create: `docs/superpowers/plans/2026-07-03-hook-surface-notes.md` (decision record)

**Interfaces:**
- Produces: `MATCHER_MODE` decision consumed by Task 9 — one of `content` (hooks.json matchers can target Bash command content), `tool-name` (matchers match tool names only; in-script filtering required), or `drop` (per-fire cost unacceptable; E1/E2 not registered).

- [ ] **Step 1: Fetch the live hooks reference and determine matcher semantics**

Use WebFetch on `https://code.claude.com/docs/en/hooks` with the question: "For PreToolUse and PostToolUse hooks, can the matcher field target the content of a Bash command (e.g. match only `git commit` invocations), or does it only match tool names? Quote the exact matcher syntax and any example matching a Bash subcommand." If that page 404s, try `https://code.claude.com/docs/en/hooks-guide`.

- [ ] **Step 2: Measure worst-case per-fire spawn cost**

```bash
cat > /tmp/hook-noop.js <<'EOF'
process.exit(0);
EOF
time node /tmp/hook-noop.js
```

Run 3 times; note the median `real` time. Expected: 30–80ms on this machine.

- [ ] **Step 3: Record the decision**

Write `docs/superpowers/plans/2026-07-03-hook-surface-notes.md`:

```markdown
# Hook Surface — Task 1 Decision Record

- Docs consulted: {URL(s)}, fetched {date}
- Matcher semantics found: {quote the doc's matcher description verbatim}
- Node spawn cost (median of 3): {N}ms
- MATCHER_MODE: {content | tool-name | drop}
  - content  → matchers can scope to `git commit`/`git push` command content; dispatcher spawns only on git fires.
  - tool-name → matcher is `Bash` (every Bash call spawns the dispatcher); acceptable only if spawn median < 100ms. In-script first-line filter applies.
  - drop     → spawn median >= 100ms AND only tool-name matching exists: do NOT register PreToolUse/PostToolUse in hooks.json (modules still ship, registration documented as opt-in).
```

Decision rule: if content matchers exist → `content`. Else if spawn < 100ms → `tool-name`. Else → `drop`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-07-03-hook-surface-notes.md
git commit -m "Record matcher-granularity decision for hook surface — gates E1/E2 registration shape"
```

---

### Task 2: Shared hook context module (`context.js`)

**Files:**
- Create: `bin/lib/hooks/context.js`
- Test: `tests/hooks-context.test.js`

**Interfaces:**
- Produces (consumed by Tasks 4–8):
  - `readStdin() -> string` (never throws)
  - `parseInput(raw: string) -> object` (always an object, `{}` on garbage)
  - `resolveRunDir(cwd: string, env: object) -> string|null` (env `PIPELINE_RUN_DIR` if it exists on disk, else newest non-terminal dir under `{cwd}/.claude-tweaks/pipelines/`, else null)
  - `listRunDirs(cwd: string) -> string[]` (all non-terminal run dirs, newest first)
  - `readRunState(runDir) -> object|null`
  - `writeRunState(runDir, patch: object) -> object|null` (merge + `updatedAt` ISO stamp; null on fs error)
  - `appendEvent(runDir, type: string, data: object) -> void` (best-effort append to `events.jsonl`, line format `{"ts":ISO,"type":...,...data}`)
- Terminal definition: `run-state.json` exists with `status === 'clean'`.

- [ ] **Step 1: Write the failing test**

```js
// tests/hooks-context.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ctx = require('../bin/lib/hooks/context');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-hooks-'));
  fs.mkdirSync(path.join(dir, '.claude-tweaks', 'pipelines'), { recursive: true });
  return dir;
}
function mkRun(project, name, state) {
  const run = path.join(project, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(run, { recursive: true });
  if (state) fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return run;
}

test('parseInput returns {} on garbage and non-objects', () => {
  assert.deepStrictEqual(ctx.parseInput('not json'), {});
  assert.deepStrictEqual(ctx.parseInput('42'), {});
  assert.deepStrictEqual(ctx.parseInput(''), {});
  assert.deepStrictEqual(ctx.parseInput('{"a":1}'), { a: 1 });
});

test('resolveRunDir prefers PIPELINE_RUN_DIR when it exists on disk', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-07-01T090000-spec-1');
  assert.strictEqual(ctx.resolveRunDir(project, { PIPELINE_RUN_DIR: run }), run);
  assert.strictEqual(ctx.resolveRunDir(project, { PIPELINE_RUN_DIR: '/nope' }), run);
});

test('resolveRunDir picks newest non-terminal, skips clean runs', () => {
  const project = tmpProject();
  const oldRun = mkRun(project, '2026-07-01T090000-spec-1');
  const cleanRun = mkRun(project, '2026-07-02T090000-spec-2', { status: 'clean' });
  assert.strictEqual(ctx.resolveRunDir(project, {}), oldRun);
  assert.ok(cleanRun); // silences unused warning; clean run must NOT be returned
});

test('resolveRunDir returns null with no pipelines dir', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bare-'));
  assert.strictEqual(ctx.resolveRunDir(bare, {}), null);
});

test('listRunDirs returns non-terminal newest first', () => {
  const project = tmpProject();
  const a = mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });
  const b = mkRun(project, '2026-07-02T090000-spec-2');
  mkRun(project, '2026-07-03T090000-spec-3', { status: 'clean' });
  assert.deepStrictEqual(ctx.listRunDirs(project), [b, a]);
});

test('writeRunState merges, stamps updatedAt; readRunState round-trips', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-07-01T090000-spec-1');
  ctx.writeRunState(run, { status: 'active', worktree: '/tmp/wt' });
  const next = ctx.writeRunState(run, { status: 'interrupted' });
  assert.strictEqual(next.status, 'interrupted');
  assert.strictEqual(next.worktree, '/tmp/wt');
  assert.ok(next.updatedAt);
  assert.strictEqual(ctx.readRunState(run).status, 'interrupted');
});

test('appendEvent writes one JSON line per call, never throws on bad dir', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-07-01T090000-spec-1');
  ctx.appendEvent(run, 'commit', { hash: 'abc123' });
  ctx.appendEvent(run, 'session-end', {});
  const lines = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
  const first = JSON.parse(lines[0]);
  assert.strictEqual(first.type, 'commit');
  assert.strictEqual(first.hash, 'abc123');
  assert.ok(first.ts);
  assert.doesNotThrow(() => ctx.appendEvent('/nonexistent/run', 'x', {}));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-context.test.js`
Expected: FAIL — `Cannot find module '../bin/lib/hooks/context'`

- [ ] **Step 3: Write the implementation**

```js
// bin/lib/hooks/context.js
'use strict';
const fs = require('fs');
const path = require('path');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function parseInput(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

function readRunState(runDir) {
  try { return JSON.parse(fs.readFileSync(path.join(runDir, 'run-state.json'), 'utf8')); } catch { return null; }
}

function isTerminal(runDir) {
  const s = readRunState(runDir);
  return !!s && s.status === 'clean';
}

function listRunDirs(cwd) {
  const base = path.join(cwd || process.cwd(), '.claude-tweaks', 'pipelines');
  let entries;
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(base, e.name))
    .sort()
    .reverse()
    .filter((d) => !isTerminal(d));
}

function resolveRunDir(cwd, env) {
  if (env && env.PIPELINE_RUN_DIR) {
    try { if (fs.statSync(env.PIPELINE_RUN_DIR).isDirectory()) return env.PIPELINE_RUN_DIR; } catch { /* fall through */ }
  }
  const dirs = listRunDirs(cwd);
  return dirs.length ? dirs[0] : null;
}

function writeRunState(runDir, patch) {
  try {
    const next = { ...(readRunState(runDir) || {}), ...patch, updatedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify(next, null, 2) + '\n');
    return next;
  } catch { return null; }
}

function appendEvent(runDir, type, data) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), type, ...(data || {}) });
    fs.appendFileSync(path.join(runDir, 'events.jsonl'), line + '\n');
  } catch { /* best-effort */ }
}

module.exports = { readStdin, parseInput, resolveRunDir, listRunDirs, readRunState, writeRunState, appendEvent, isTerminal };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-context.test.js`
Expected: PASS (7 tests). Then `npm test` — all green.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/context.js tests/hooks-context.test.js
git commit -m "Add hook context module — stdin parsing, run-dir resolution, run-state and events.jsonl IO"
```

---

### Task 3: Git command parser (`git-command.js`)

**Files:**
- Create: `bin/lib/hooks/git-command.js`
- Test: `tests/hooks-git-command.test.js`

**Interfaces:**
- Produces (consumed by Tasks 7–8): `gitTargets(command: string, cwd: string) -> Array<{action: 'commit'|'push', dir: string}>` — pure function, no fs/exec. Tracks `cd` across `&&`/`;`/`||`/`|` segments and honors `git -C <path>`. Unparseable segments yield no target (conservative → allow).

- [ ] **Step 1: Write the failing test**

```js
// tests/hooks-git-command.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { gitTargets } = require('../bin/lib/hooks/git-command');

test('plain commit resolves to cwd', () => {
  assert.deepStrictEqual(gitTargets('git commit -m "x"', '/repo'), [{ action: 'commit', dir: '/repo' }]);
});

test('git -C targets the given dir, resolved against cwd', () => {
  assert.deepStrictEqual(gitTargets('git -C /wt/spec-1 commit -m "x"', '/repo'), [{ action: 'commit', dir: '/wt/spec-1' }]);
  assert.deepStrictEqual(gitTargets('git -C ../other commit -m "x"', '/repo/sub'), [{ action: 'commit', dir: '/repo/other' }]);
});

test('cd chains update the effective cwd', () => {
  assert.deepStrictEqual(gitTargets('cd /wt/spec-1 && git add f.js && git commit -m "x"', '/repo'), [
    { action: 'commit', dir: '/wt/spec-1' },
  ]);
});

test('push is reported; other subcommands are not', () => {
  assert.deepStrictEqual(gitTargets('git push origin main', '/repo'), [{ action: 'push', dir: '/repo' }]);
  assert.deepStrictEqual(gitTargets('git status && git log --oneline -3', '/repo'), []);
});

test('multiple targets across separators', () => {
  assert.deepStrictEqual(gitTargets('git commit -m "a"; git push', '/repo'), [
    { action: 'commit', dir: '/repo' },
    { action: 'push', dir: '/repo' },
  ]);
});

test('value-taking global flags do not swallow the subcommand', () => {
  assert.deepStrictEqual(gitTargets('git -c user.name=x commit -m "y"', '/repo'), [{ action: 'commit', dir: '/repo' }]);
  assert.deepStrictEqual(gitTargets('git --git-dir /g --work-tree /w commit -m "y"', '/repo'), []); // explicit git-dir: cannot prove target — no claim
});

test('quoted paths are unquoted', () => {
  assert.deepStrictEqual(gitTargets('git -C "/wt/my spec" commit -m "x"', '/repo'), [{ action: 'commit', dir: '/wt/my spec' }]);
});

test('non-git and empty commands yield nothing, never throw', () => {
  assert.deepStrictEqual(gitTargets('npm test', '/repo'), []);
  assert.deepStrictEqual(gitTargets('', '/repo'), []);
  assert.deepStrictEqual(gitTargets(undefined, '/repo'), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-git-command.test.js`
Expected: FAIL — `Cannot find module '../bin/lib/hooks/git-command'`

- [ ] **Step 3: Write the implementation**

```js
// bin/lib/hooks/git-command.js
'use strict';
const path = require('path');

// Naive top-level split: separators inside quotes also split. Acceptable — a
// misparsed segment produces no git target, and no target means allow.
function splitSegments(command) {
  return String(command || '').split(/&&|\|\||;|\|/);
}

function stripQuotes(s) {
  return s.replace(/^['"]|['"]$/g, '');
}

// Tokenizer that keeps quoted spans (with spaces) as one token.
function tokenize(seg) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(seg)) !== null) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  return out;
}

// Global git flags that consume the NEXT token as a value.
const VALUE_FLAGS = new Set(['-C', '-c', '--exec-path', '--namespace']);
// Flags that make the target unprovable from the command text alone.
const UNPROVABLE_FLAGS = ['--git-dir', '--work-tree'];

function gitTargets(command, cwd) {
  const targets = [];
  let effCwd = cwd || '.';
  for (const seg of splitSegments(command)) {
    const t = tokenize(seg.trim());
    if (!t.length) continue;
    if (t[0] === 'cd' && t[1]) {
      effCwd = path.resolve(effCwd, stripQuotes(t[1]));
      continue;
    }
    if (t[0] !== 'git') continue;
    let i = 1;
    let dir = effCwd;
    let unprovable = false;
    while (i < t.length && t[i].startsWith('-')) {
      const flag = t[i];
      if (UNPROVABLE_FLAGS.some((u) => flag === u || flag.startsWith(u + '='))) { unprovable = true; i += flag.includes('=') ? 1 : 2; continue; }
      if (flag === '-C' && t[i + 1]) { dir = path.resolve(effCwd, stripQuotes(t[i + 1])); i += 2; continue; }
      if (VALUE_FLAGS.has(flag) && t[i + 1]) { i += 2; continue; }
      i += 1;
    }
    if (unprovable) continue;
    const sub = t[i];
    if (sub === 'commit' || sub === 'push') targets.push({ action: sub, dir });
  }
  return targets;
}

module.exports = { gitTargets, splitSegments, tokenize };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-git-command.test.js`
Expected: PASS (8 tests). Then `npm test` — all green.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/git-command.js tests/hooks-git-command.test.js
git commit -m "Add git command parser for hooks — cd/-C aware commit and push target extraction"
```

---

### Task 4: Dispatcher (`bin/hooks.js`) with never-break-session invariant + CLI subcommands

**Files:**
- Create: `bin/hooks.js`
- Test: `tests/hooks-dispatcher.test.js`

**Interfaces:**
- Consumes: `context.js` (Task 2).
- Produces:
  - CLI: `node bin/hooks.js <event>` where event ∈ `session-start | session-end | pre-compact | pre-tool-use | post-tool-use | subagent-stop`; hook JSON on stdin; module output JSON (if any) on stdout; exit code from module (default 0).
  - CLI: `node bin/hooks.js record-worktree <path>` → `writeRunState(runDir, { worktree: resolvedPath, status: 'active' })`.
  - CLI: `node bin/hooks.js close-run [--run <dir>]` → `writeRunState(dir, { status: 'clean' })`.
  - Module contract (Tasks 5–8 implement it): each module exports `run(ctx) -> {exit?: number, json?: object}|undefined` with `ctx = { input, runDir, runState, cwd }`.
  - `MODULES` registry maps event name → module; unknown event → exit 0.

- [ ] **Step 1: Write the failing test**

```js
// tests/hooks-dispatcher.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.join(__dirname, '..', 'bin', 'hooks.js');

function runHook(args, { input = '', cwd = undefined, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], {
      input, cwd, encoding: 'utf8', env: { ...process.env, ...env },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-disp-'));
  fs.mkdirSync(path.join(dir, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1'), { recursive: true });
  return dir;
}

test('invariant: every event exits 0 on garbage stdin, no stdout noise', () => {
  for (const ev of ['session-start', 'session-end', 'pre-compact', 'pre-tool-use', 'post-tool-use', 'subagent-stop']) {
    const r = runHook([ev], { input: '%%%not json%%%' });
    assert.strictEqual(r.code, 0, `${ev} must exit 0 on garbage stdin`);
    if (r.stdout.trim()) assert.doesNotThrow(() => JSON.parse(r.stdout), `${ev} stdout must be empty or valid JSON`);
  }
});

test('invariant: unknown event and missing event exit 0', () => {
  assert.strictEqual(runHook(['no-such-event'], { input: '{}' }).code, 0);
  assert.strictEqual(runHook([], { input: '{}' }).code, 0);
});

test('record-worktree writes run-state and close-run marks clean', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  assert.strictEqual(runHook(['record-worktree', '/tmp/wt-1'], { cwd: project }).code, 0);
  let state = JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
  assert.strictEqual(state.worktree, path.resolve('/tmp/wt-1'));
  assert.strictEqual(state.status, 'active');
  assert.strictEqual(runHook(['close-run'], { cwd: project }).code, 0);
  state = JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
  assert.strictEqual(state.status, 'clean');
});

test('record-worktree without a run dir exits 0 silently', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bare-'));
  assert.strictEqual(runHook(['record-worktree', '/tmp/wt'], { cwd: bare }).code, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: FAIL — `Cannot find module .../bin/hooks.js` (execFileSync error → non-zero code assertions fail)

- [ ] **Step 3: Write the implementation**

Module requires use lazy try/catch so the dispatcher survives even if a module file is missing (Tasks 5–8 land later — until then, events route to nothing and exit 0).

```js
#!/usr/bin/env node
// bin/hooks.js — single dispatcher for all claude-tweaks hook registrations.
// Cardinal invariant: never break a session. Exit 0 on ANY error; the only
// deliberate non-zero exit is the pre-tool-use deny.
'use strict';
const path = require('path');
const ctxLib = require('./lib/hooks/context');

const EVENTS = ['session-start', 'session-end', 'pre-compact', 'pre-tool-use', 'post-tool-use', 'subagent-stop'];

function loadModule(event) {
  try { return require('./lib/hooks/' + event); } catch { return null; }
}

function main(argv) {
  const cmd = argv[2];
  if (cmd === 'record-worktree') {
    const runDir = ctxLib.resolveRunDir(process.cwd(), process.env);
    if (runDir && argv[3]) ctxLib.writeRunState(runDir, { worktree: path.resolve(argv[3]), status: 'active' });
    return 0;
  }
  if (cmd === 'close-run') {
    const flagIdx = argv.indexOf('--run');
    const runDir = flagIdx !== -1 && argv[flagIdx + 1] ? argv[flagIdx + 1] : ctxLib.resolveRunDir(process.cwd(), process.env);
    if (runDir) ctxLib.writeRunState(runDir, { status: 'clean' });
    return 0;
  }
  if (!EVENTS.includes(cmd)) return 0;
  const mod = loadModule(cmd);
  if (!mod || typeof mod.run !== 'function') return 0;
  const input = ctxLib.parseInput(ctxLib.readStdin());
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const runDir = ctxLib.resolveRunDir(cwd, process.env);
  const runState = runDir ? ctxLib.readRunState(runDir) : null;
  const out = mod.run({ input, runDir, runState, cwd }) || {};
  if (out.json) process.stdout.write(JSON.stringify(out.json));
  return typeof out.exit === 'number' ? out.exit : 0;
}

if (require.main === module) {
  let code = 0;
  try { code = main(process.argv); } catch { code = 0; }
  process.exit(code);
}

module.exports = { main };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: PASS (4 tests). Then `npm test` — all green.

- [ ] **Step 5: Commit**

```bash
git add bin/hooks.js tests/hooks-dispatcher.test.js
git commit -m "Add hooks dispatcher — event routing, never-break-session invariant, record-worktree and close-run subcommands"
```

---

### Task 5: `session-start` module (A1) + deps.js message collection

**Files:**
- Modify: `bin/lib/deps.js` (add a `collect()` that returns messages instead of printing; `main()` keeps printing — CLI behavior unchanged)
- Create: `bin/lib/hooks/session-start.js`
- Test: `tests/hooks-session-start.test.js`

**Interfaces:**
- Consumes: `context.listRunDirs`, `context.readRunState`; `deps.collect()`.
- Produces: on fire, `{ json: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: string } } }` when there is anything to say (deps warnings and/or stale runs); otherwise `{}` (no output). deps.js additionally exports `collect() -> string[]`.

- [ ] **Step 1: Write the failing test**

```js
// tests/hooks-session-start.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sessionStart = require('../bin/lib/hooks/session-start');
const deps = require('../bin/lib/deps');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-'));
  fs.mkdirSync(path.join(dir, '.claude-tweaks', 'pipelines'), { recursive: true });
  return dir;
}
function mkRun(project, name, state) {
  const run = path.join(project, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(run, { recursive: true });
  if (state) fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return run;
}

test('deps.collect returns an array of strings and prints nothing', () => {
  const msgs = deps.collect();
  assert.ok(Array.isArray(msgs));
  for (const m of msgs) assert.strictEqual(typeof m, 'string');
});

test('stale runs are reported in additionalContext, capped at 3, newest first', () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });
  mkRun(project, '2026-07-02T090000-spec-2', { status: 'active' });
  mkRun(project, '2026-06-30T090000-spec-0', { status: 'clean' });
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  const ctx = out.json.hookSpecificOutput.additionalContext;
  assert.strictEqual(out.json.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(ctx, /unfinished pipeline run/i);
  assert.match(ctx, /spec-2/);
  assert.match(ctx, /spec-1/);
  assert.doesNotMatch(ctx, /spec-0/);
});

test('no stale runs and no deps warnings -> no json output', () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'clean' });
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) {
    // On machines missing agent-browser, deps warnings alone may produce output — accept both, but stale-run text must be absent.
    assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /unfinished pipeline run/i);
  } else {
    assert.deepStrictEqual(out, {});
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-session-start.test.js`
Expected: FAIL — `deps.collect is not a function` / `Cannot find module '../bin/lib/hooks/session-start'`

- [ ] **Step 3: Refactor deps.js (collect) and add session-start**

In `bin/lib/deps.js`, change `reportMissing` and `checkAgentBrowser` to build strings, add `collect()`, keep `main()` printing. Replace the bottom of the file (from `function checkAgentBrowser()` through `module.exports`) with:

```js
function agentBrowserMessage() {
  if (!has('agent-browser')) {
    return 'claude-tweaks: Browser features require agent-browser. Install: npm install -g agent-browser. Browser features are optional.';
  }
  return null;
}

function missingMessage(dep, pm, vm) {
  const platform = os.platform();
  if (dep === 'node' && vm) {
    return `claude-tweaks: Node not found, but ${vm} is on PATH. Install Node via your version manager.`;
  }
  if (pm) {
    const cmd = installCommand(pm, dep);
    const sudoNote = pm.needsSudo ? ' (requires sudo)' : '';
    return `claude-tweaks: ${dep} not found. Install via ${pm.name}: ${cmd}${sudoNote}`;
  }
  const fallback = {
    darwin: { node: 'https://nodejs.org/ or `xcode-select --install` then install brew', git: 'https://git-scm.com/ or `xcode-select --install`' },
    win32: { node: 'https://nodejs.org/ or install winget/scoop first', git: 'https://git-scm.com/' },
    linux: { node: 'use your distro package manager', git: 'use your distro package manager' },
  };
  const url = fallback[platform]?.[dep] || `install ${dep}`;
  return `claude-tweaks: ${dep} not found. Install: ${url}`;
}

function collect() {
  const pm = detectPackageManager();
  const vm = detectVersionManager();
  const msgs = [];
  if (!has('node')) msgs.push(missingMessage('node', pm, vm));
  if (!has('git')) msgs.push(missingMessage('git', pm, null));
  const ab = agentBrowserMessage();
  if (ab) msgs.push(ab);
  return msgs;
}

function main() {
  for (const m of collect()) process.stdout.write(m + '\n');
}

if (require.main === module) main();

module.exports = { has, detectPackageManager, detectVersionManager, installCommand, collect, main };
```

Note: `reportMissing` and `checkAgentBrowser` are replaced by `missingMessage`/`agentBrowserMessage` + `collect`. Check `tests/lib.test.js` for references to the removed exports and update those assertions to target `collect()`/`missingMessage()` equivalents (same behavioral coverage, message text unchanged).

Create `bin/lib/hooks/session-start.js`:

```js
// bin/lib/hooks/session-start.js — A1: deps check + stale pipeline-run detection.
'use strict';
const path = require('path');
const deps = require('../deps');
const ctxLib = require('./context');

const MAX_REPORTED = 3;

function run(ctx) {
  const parts = [];
  try { parts.push(...deps.collect()); } catch { /* best-effort */ }
  try {
    const stale = ctxLib.listRunDirs(ctx.cwd).slice(0, MAX_REPORTED);
    if (stale.length) {
      const lines = stale.map((d) => {
        const s = ctxLib.readRunState(d);
        return `- ${path.basename(d)} (status: ${(s && s.status) || 'unknown'})`;
      });
      parts.push(
        'claude-tweaks: unfinished pipeline run(s) detected under .claude-tweaks/pipelines/:\n' +
          lines.join('\n') +
          '\nReview {run}/decisions.md and staged/ to resume, or close a finished run with: node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run <dir>',
      );
    }
  } catch { /* best-effort */ }
  if (!parts.length) return {};
  return { json: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n\n') } } };
}

module.exports = { run };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-session-start.test.js tests/lib.test.js`
Expected: PASS. Then `npm test` — all green (fix any lib.test.js drift per the note above).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/deps.js bin/lib/hooks/session-start.js tests/hooks-session-start.test.js tests/lib.test.js
git commit -m "Add session-start hook module — absorb deps check and inject stale pipeline-run context"
```

---

### Task 6: `session-end` (A2) + `pre-compact` (A3) modules

**Files:**
- Create: `bin/lib/hooks/session-end.js`
- Create: `bin/lib/hooks/pre-compact.js`
- Test: `tests/hooks-lifecycle.test.js`

**Interfaces:**
- Consumes: `context.writeRunState`, `context.appendEvent`.
- Produces: session-end — marks the resolved run `interrupted` (only if current status is not `clean`), appends `{type:'session-end', reason, sessionId}`. pre-compact — appends `{type:'pre-compact', trigger}` and stamps `lastEvent:'pre-compact'`. Both return `{}` always.

- [ ] **Step 1: Write the failing test**

```js
// tests/hooks-lifecycle.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sessionEnd = require('../bin/lib/hooks/session-end');
const preCompact = require('../bin/lib/hooks/pre-compact');

function mkRun(state) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-lc-'));
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(run, { recursive: true });
  if (state) fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return { project, run };
}
const readState = (run) => JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'));
const readEvents = (run) => fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);

test('session-end marks active run interrupted and logs the event', () => {
  const { run } = mkRun({ status: 'active' });
  const out = sessionEnd.run({ input: { reason: 'exit', session_id: 's1' }, runDir: run, runState: readState(run), cwd: '/x' });
  assert.deepStrictEqual(out, {});
  assert.strictEqual(readState(run).status, 'interrupted');
  const ev = readEvents(run);
  assert.strictEqual(ev[0].type, 'session-end');
  assert.strictEqual(ev[0].reason, 'exit');
});

test('session-end leaves a clean run untouched', () => {
  const { run } = mkRun({ status: 'clean' });
  sessionEnd.run({ input: {}, runDir: run, runState: readState(run), cwd: '/x' });
  assert.strictEqual(readState(run).status, 'clean');
});

test('session-end with no run dir is a no-op', () => {
  assert.deepStrictEqual(sessionEnd.run({ input: {}, runDir: null, runState: null, cwd: '/x' }), {});
});

test('pre-compact appends breadcrumb and stamps lastEvent', () => {
  const { run } = mkRun({ status: 'active' });
  preCompact.run({ input: { trigger: 'auto' }, runDir: run, runState: readState(run), cwd: '/x' });
  assert.strictEqual(readEvents(run)[0].type, 'pre-compact');
  assert.strictEqual(readEvents(run)[0].trigger, 'auto');
  assert.strictEqual(readState(run).lastEvent, 'pre-compact');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-lifecycle.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

```js
// bin/lib/hooks/session-end.js — A2: mark the active run interrupted at session end.
'use strict';
const ctxLib = require('./context');

function run(ctx) {
  if (!ctx.runDir) return {};
  const status = ctx.runState && ctx.runState.status;
  if (status !== 'clean') {
    ctxLib.writeRunState(ctx.runDir, { status: 'interrupted', lastEvent: 'session-end' });
  }
  ctxLib.appendEvent(ctx.runDir, 'session-end', { reason: ctx.input.reason, sessionId: ctx.input.session_id });
  return {};
}

module.exports = { run };
```

```js
// bin/lib/hooks/pre-compact.js — A3: breadcrumb so compaction cannot lose the run.
'use strict';
const ctxLib = require('./context');

function run(ctx) {
  if (!ctx.runDir) return {};
  ctxLib.appendEvent(ctx.runDir, 'pre-compact', { trigger: ctx.input.trigger, sessionId: ctx.input.session_id });
  ctxLib.writeRunState(ctx.runDir, { lastEvent: 'pre-compact' });
  return {};
}

module.exports = { run };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-lifecycle.test.js`
Expected: PASS (4 tests). Then `npm test` — all green.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/session-end.js bin/lib/hooks/pre-compact.js tests/hooks-lifecycle.test.js
git commit -m "Add session-end and pre-compact hook modules — run-state marking and compaction breadcrumbs"
```

---

### Task 7: `pre-tool-use` module (E1 — the only blocking hook)

**Files:**
- Create: `bin/lib/hooks/pre-tool-use.js`
- Test: `tests/hooks-pre-tool-use.test.js`

**Interfaces:**
- Consumes: `gitTargets` (Task 3), `context.appendEvent` (Task 2), `git rev-parse --show-toplevel` via `execFileSync`.
- Produces: deny → `{ exit: 0, json: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: string } } }`; allow → `{}`. Deny fires ONLY when ALL hold: run dir resolved, `runState.worktree` set, tool is Bash, a `commit` target's `git rev-parse --show-toplevel` resolves, and its realpath ≠ the assigned worktree's realpath. `push` mismatches log (`{type:'wd-push-mismatch'}`) but never deny (legitimate at branch-finish time). Every deny also logs `{type:'wd-deny'}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/hooks-pre-tool-use.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pre = require('../bin/lib/hooks/pre-tool-use');

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e1-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  return fs.realpathSync(dir);
}
function mkRun(worktree) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e1run-'));
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(run, { recursive: true });
  const state = worktree ? { status: 'active', worktree } : { status: 'active' };
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return { run, state };
}
const bashInput = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });

test('commit in the assigned worktree is allowed', () => {
  const wt = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput('git commit -m "x"', wt), runDir: run, runState: state, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('commit in a different checkout is denied with corrective reason', () => {
  const wt = gitRepo();
  const other = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput('git commit -m "x"', other), runDir: run, runState: state, cwd: other });
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, new RegExp(wt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(spec.permissionDecisionReason, /git -C/);
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"wd-deny"/);
});

test('git -C into the assigned worktree from elsewhere is allowed', () => {
  const wt = gitRepo();
  const other = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput(`git -C ${wt} commit -m "x"`, other), runDir: run, runState: state, cwd: other });
  assert.deepStrictEqual(out, {});
});

test('push mismatch logs but never denies', () => {
  const wt = gitRepo();
  const other = gitRepo();
  const { run, state } = mkRun(wt);
  const out = pre.run({ input: bashInput('git push origin main', other), runDir: run, runState: state, cwd: other });
  assert.deepStrictEqual(out, {});
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"wd-push-mismatch"/);
});

test('ambiguity allows: no worktree assigned, non-repo dir, non-Bash tool, no run dir', () => {
  const wt = gitRepo();
  const { run, state } = mkRun(null);
  assert.deepStrictEqual(pre.run({ input: bashInput('git commit -m "x"', wt), runDir: run, runState: state, cwd: wt }), {});
  const assigned = mkRun(wt);
  const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-nonrepo-'));
  assert.deepStrictEqual(pre.run({ input: bashInput('git commit -m "x"', nonRepo), runDir: assigned.run, runState: assigned.state, cwd: nonRepo }), {});
  assert.deepStrictEqual(pre.run({ input: { tool_name: 'Edit', tool_input: {}, cwd: wt }, runDir: assigned.run, runState: assigned.state, cwd: wt }), {});
  assert.deepStrictEqual(pre.run({ input: bashInput('git commit -m "x"', wt), runDir: null, runState: null, cwd: wt }), {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-pre-tool-use.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// bin/lib/hooks/pre-tool-use.js — E1: working-directory discipline (block tier).
// Denies ONLY on a provable mismatch. Ambiguity -> allow: a false-positive
// freeze in an unattended run is worse than a missed catch (E2 still records).
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');
const { gitTargets } = require('./git-command');
const ctxLib = require('./context');

function toplevel(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
  } catch { return null; }
}

function safeReal(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

function run(ctx) {
  if (!ctx.runDir || !ctx.runState || !ctx.runState.worktree) return {};
  if (ctx.input.tool_name !== 'Bash') return {};
  const command = ctx.input.tool_input && ctx.input.tool_input.command;
  if (typeof command !== 'string' || !command) return {};
  const assigned = safeReal(ctx.runState.worktree);
  if (!assigned) return {};
  for (const target of gitTargets(command, ctx.cwd)) {
    const top = toplevel(target.dir);
    if (!top) continue; // cannot prove the target -> allow
    const actual = safeReal(top);
    if (!actual || actual === assigned) continue;
    if (target.action === 'push') {
      ctxLib.appendEvent(ctx.runDir, 'wd-push-mismatch', { expected: assigned, actual, command: command.slice(0, 200) });
      continue;
    }
    ctxLib.appendEvent(ctx.runDir, 'wd-deny', { expected: assigned, actual, command: command.slice(0, 200) });
    return {
      exit: 0,
      json: {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `claude-tweaks working-directory discipline: this run's assigned worktree is ${assigned} but the commit targets ${actual}. ` +
            `Re-run inside the worktree (cd "${assigned}") or use git -C "${assigned}". ` +
            'If this checkout is intentionally correct (e.g. finishing the branch), clear the assignment first: node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run',
        },
      },
    };
  }
  return {};
}

module.exports = { run };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-pre-tool-use.test.js`
Expected: PASS (5 tests). Then `npm test` — all green.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/pre-tool-use.js tests/hooks-pre-tool-use.test.js
git commit -m "Add pre-tool-use hook module — deny wrong-checkout commits during worktree runs, allow on ambiguity"
```

---

### Task 8: `post-tool-use` (E2) + `subagent-stop` (E3) modules

**Files:**
- Create: `bin/lib/hooks/post-tool-use.js`
- Create: `bin/lib/hooks/subagent-stop.js`
- Test: `tests/hooks-log-modules.test.js`

**Interfaces:**
- Consumes: `gitTargets`, `context.appendEvent`; `git rev-parse --short HEAD` for the just-landed hash.
- Produces: post-tool-use — appends `{type:'commit', action, dir, hash}` per commit/push target; returns `{}`. subagent-stop — reads the subagent transcript (field `agent_transcript_path` or `transcript_path`), finds the last assistant text, checks first line against `/^(DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED)\b/`; on violation appends `{type:'contract-violation'}` and returns `{ json: { systemMessage: string } }` (warn tier, non-blocking); unreadable transcript → `{}` (best-effort per spec, bug #27755).

- [ ] **Step 1: Write the failing test**

```js
// tests/hooks-log-modules.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const post = require('../bin/lib/hooks/post-tool-use');
const substop = require('../bin/lib/hooks/subagent-stop');

function gitRepoWithCommit() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e2-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'seed', '-q'], {
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  return fs.realpathSync(dir);
}
function mkRun() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e2run-'));
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(run, { recursive: true });
  return run;
}
const readEvents = (run) => fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);

test('post-tool-use logs commit breadcrumb with hash', () => {
  const repo = gitRepoWithCommit();
  const run = mkRun();
  post.run({ input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' }, cwd: repo }, runDir: run, runState: { status: 'active' }, cwd: repo });
  const ev = readEvents(run);
  assert.strictEqual(ev[0].type, 'commit');
  assert.strictEqual(ev[0].action, 'commit');
  assert.match(ev[0].hash, /^[0-9a-f]{4,}$/);
});

test('post-tool-use without run dir or without git targets is a no-op', () => {
  const repo = gitRepoWithCommit();
  assert.deepStrictEqual(post.run({ input: { tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: repo }, runDir: null, runState: null, cwd: repo }), {});
  const run = mkRun();
  post.run({ input: { tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: repo }, runDir: run, runState: null, cwd: repo });
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});

function transcript(lastText) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e3-')), 'agent.jsonl');
  const lines = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'task' }] } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: lastText }] } }),
  ];
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
}

test('subagent-stop flags a missing status line as contract violation (warn, non-blocking)', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('I did some things.') }, runDir: run, runState: null, cwd: '/x' });
  assert.match(out.json.systemMessage, /status line/i);
  assert.strictEqual(readEvents(run)[0].type, 'contract-violation');
});

test('subagent-stop accepts a compliant status line silently', () => {
  const run = mkRun();
  const out = substop.run({ input: { agent_transcript_path: transcript('DONE\nAll checks green.') }, runDir: run, runState: null, cwd: '/x' });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(run, 'events.jsonl')));
});

test('subagent-stop with unreadable transcript or no run dir is a silent no-op', () => {
  const run = mkRun();
  assert.deepStrictEqual(substop.run({ input: { agent_transcript_path: '/nope.jsonl' }, runDir: run, runState: null, cwd: '/x' }), {});
  assert.deepStrictEqual(substop.run({ input: {} , runDir: null, runState: null, cwd: '/x' }), {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-log-modules.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

```js
// bin/lib/hooks/post-tool-use.js — E2: commit breadcrumbs (log tier).
'use strict';
const { execFileSync } = require('child_process');
const { gitTargets } = require('./git-command');
const ctxLib = require('./context');

function shortHead(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
  } catch { return null; }
}

function run(ctx) {
  if (!ctx.runDir) return {};
  if (ctx.input.tool_name !== 'Bash') return {};
  const command = ctx.input.tool_input && ctx.input.tool_input.command;
  if (typeof command !== 'string' || !command) return {};
  for (const target of gitTargets(command, ctx.cwd)) {
    ctxLib.appendEvent(ctx.runDir, 'commit', {
      action: target.action,
      dir: target.dir,
      hash: target.action === 'commit' ? shortHead(target.dir) : undefined,
    });
  }
  return {};
}

module.exports = { run };
```

```js
// bin/lib/hooks/subagent-stop.js — E3: Subagent Contract status-line check (warn tier).
// Best-effort by design: SubagentStop fires unreliably for Task dispatches
// (claude-code#27755) and transcript field names may drift. Never blocks.
'use strict';
const fs = require('fs');
const ctxLib = require('./context');

const STATUS_RE = /^(DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED)\b/;

function lastAssistantText(transcriptPath) {
  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch { return null; }
  let last = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const msg = entry && entry.message;
    if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    const texts = msg.content.filter((c) => c && c.type === 'text' && typeof c.text === 'string');
    if (texts.length) last = texts[texts.length - 1].text;
  }
  return last;
}

function run(ctx) {
  if (!ctx.runDir) return {};
  const transcriptPath = ctx.input.agent_transcript_path || ctx.input.transcript_path;
  if (typeof transcriptPath !== 'string' || !transcriptPath) return {};
  const text = lastAssistantText(transcriptPath);
  if (typeof text !== 'string') return {}; // unreadable -> best-effort no-op
  if (STATUS_RE.test(text.trim())) return {};
  ctxLib.appendEvent(ctx.runDir, 'contract-violation', { firstLine: text.trim().split('\n')[0].slice(0, 120) });
  return { json: { systemMessage: 'claude-tweaks: a subagent reply is missing the Subagent Contract status line (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED). Logged to events.jsonl.' } };
}

module.exports = { run };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-log-modules.test.js`
Expected: PASS (5 tests). Then `npm test` — all green.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/post-tool-use.js bin/lib/hooks/subagent-stop.js tests/hooks-log-modules.test.js
git commit -m "Add post-tool-use and subagent-stop hook modules — commit breadcrumbs and contract status-line check"
```

---

### Task 9: hooks.json registration + live smoke test

**Files:**
- Modify: `hooks/hooks.json`
- Consumes: `MATCHER_MODE` from Task 1's decision record (`docs/superpowers/plans/2026-07-03-hook-surface-notes.md`).

- [ ] **Step 1: Write hooks.json for the decided MATCHER_MODE**

If `MATCHER_MODE = content`, use the Bash-content matcher syntax quoted in the Task 1 decision record for the PreToolUse/PostToolUse entries (the two `"matcher"` values below become the documented content pattern for `git commit`/`git push`, e.g. the doc's equivalent of `Bash(git commit:*)` — copy the syntax exactly from the decision record). If `MATCHER_MODE = tool-name`, use `"matcher": "Bash"` exactly as shown below (the modules already no-op fast on non-git commands). If `MATCHER_MODE = drop`, OMIT the PreToolUse and PostToolUse blocks entirely and note the omission in the decision record.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" session-start" }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" session-end" }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-compact" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-tool-use" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" post-tool-use" }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" subagent-stop" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Validate JSON and simulate every registration**

```bash
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('valid json')"
for ev in session-start session-end pre-compact pre-tool-use post-tool-use subagent-stop; do
  echo '{"cwd":"/tmp"}' | node bin/hooks.js "$ev"; echo "$ev -> exit $?"
done
```

Expected: `valid json`, then `-> exit 0` for all six.

- [ ] **Step 3: Live smoke test in a scratch session**

In a scratch git repo with a fabricated run dir:

```bash
SCRATCH=$(mktemp -d) && cd "$SCRATCH" && git init -q
mkdir -p .claude-tweaks/pipelines/2026-07-03T120000-spec-99
echo '{"status":"interrupted"}' > .claude-tweaks/pipelines/2026-07-03T120000-spec-99/run-state.json
claude --plugin-dir "/Users/thomasholknielsen/Code Workspaces/claude-tweaks"
```

Verify in the session: (a) startup shows the stale-run context from A1; (b) `/hooks` (or the session debug view) lists all six registrations; (c) a normal `git commit` in the scratch repo is NOT blocked (no worktree assigned → allow); (d) after `node <plugin>/bin/hooks.js record-worktree /somewhere/else`, a `git commit` IS denied with the corrective reason, and `close-run` lifts it. Record pass/fail per check in the Task 1 notes file.

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json docs/superpowers/plans/2026-07-03-hook-surface-notes.md
git commit -m "Register six hook events through the dispatcher — continuity trio plus tiered enforcement"
```

---

### Task 10: Documentation sweep

**Files:**
- Modify: `CLAUDE.md` (header version text, Structure table `bin/` rows, new "Hooks" convention block under Conventions, hooks/hooks.json description)
- Modify: `README.md` (hook surface mention in the features/structure section, following the file's existing tone)
- Modify: `skills/_shared/auto-mode-contract.md`, `skills/_shared/pipeline-run-dir.md`, `skills/_shared/git-discipline.md`, `skills/_shared/subagent-output-contract.md`
- Modify: `skills/build/worktree-setup.md`, `skills/flow/worktree-merge.md`, `skills/wrap-up/cleanup-procedures.md`, `skills/wrap-up/SKILL.md`, `skills/wrap-up/review-console.md`

- [ ] **Step 1: CLAUDE.md**

(a) Update the intro line `A Claude Code plugin (v4.20.0)` to `(v5.1.0)`. (b) In the Structure block, extend the `hooks/hooks.json` line to `Hook definitions (SessionStart/SessionEnd/PreCompact continuity + PreToolUse/PostToolUse/SubagentStop enforcement, all via bin/hooks.js)` and add a `bin/hooks.js → Hook dispatcher (one entry point for all hook events + record-worktree/close-run subcommands)` row. (c) Add under Conventions:

```markdown
### Hooks

All hook registrations route through `bin/hooks.js <event>` — one dispatcher, one module per event in `bin/lib/hooks/`. Rules:

- **Never break a session.** Every path exits 0 on error; the only deliberate non-zero outcome is the pre-tool-use deny. New modules must pass the garbage-stdin invariant test in `tests/hooks-dispatcher.test.js`.
- **Tiered posture per `_shared/auto-mode-contract.md`:** block (E1 wrong-checkout commit only), warn (non-blocking systemMessage), inform (SessionStart additionalContext), log (append to the run dir's `events.jsonl`).
- **Project-agnostic by construction:** modules key off plugin-owned state (`$PIPELINE_RUN_DIR`, `.claude-tweaks/pipelines/`), never off project structure. E1/E2/E3 no-op without a resolved run dir.
- **Ambiguity resolves to allow** — E1 denies only provable mismatches.
- Run-dir state files written by hooks: `events.jsonl` (append-only typed events) and `run-state.json` (status: active | interrupted | clean, worktree assignment). Skills write run-state only through `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree <path>` / `close-run`.
```

- [ ] **Step 2: Shared contract docs**

- `pipeline-run-dir.md`: in the "resolved directory contains" paragraph, add `run-state.json` (hook-maintained status/worktree; terminal = status `clean`) and `events.jsonl` (hook-appended typed events).
- `auto-mode-contract.md`: add one paragraph after the tier/floor definitions: "The hook surface (`bin/hooks.js`, see CLAUDE.md Conventions → Hooks) mechanizes these tiers for working-directory discipline and run continuity — block/warn/inform/log map 1:1 to the reversibility floors defined here."
- `git-discipline.md`: add to the intro note: "During worktree-mode pipeline runs, the wrong-checkout commit rule is mechanically enforced by the plugin's PreToolUse hook (E1) — a denied commit names the assigned worktree; clear the assignment with `node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" close-run` when legitimately finishing the branch."
- `subagent-output-contract.md` (Working Directory Discipline section): add: "During worktree-mode pipeline runs this rule is mechanically enforced — the plugin's PreToolUse hook denies commits whose resolved checkout differs from the run's recorded worktree assignment." In the status protocol section add: "SubagentStop hook (E3) logs replies missing the status line to the run dir's `events.jsonl` (best-effort — the event fires unreliably for Task dispatches, claude-code#27755)."

- [ ] **Step 3: Skill wiring (single writer for run-state)**

- `skills/build/worktree-setup.md`: after step 4 (base-ref verification), add step: `4.5. **Record the assignment** — \`node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree "$WORKTREE"\` so the working-directory hook (E1) can enforce commits land in this worktree.`
- `skills/flow/worktree-merge.md`: before the merge/finish handoff begins, add: run `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run` to clear the worktree assignment (merge and push happen in the main checkout legitimately).
- `skills/wrap-up/cleanup-procedures.md`: in the pipeline run dir archival procedure, add: before archiving, mark the run terminal with `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"`.
- Consumer side of `events.jsonl` (so it is not write-only): in `skills/wrap-up/SKILL.md`, where the Actions Performed table is described as "Generated from git log, git diff, and ledger entries", extend to "…and, when present, the run dir's `events.jsonl` (hook-recorded commit breadcrumbs and contract violations)". In `skills/wrap-up/review-console.md`, add `events.jsonl` to the inputs the Review Console consolidates (surface `wd-deny`, `wd-push-mismatch`, and `contract-violation` events).

- [ ] **Step 4: README.md**

Add a bullet to the feature overview (match existing bullet style): hook surface providing pipeline-run continuity across sessions/compaction and mechanical working-directory enforcement during worktree runs; note it is inert (fast no-op) outside pipeline runs.

- [ ] **Step 5: Verify cross-reference bidirectionality and commit**

Check: every file that E1/close-run touches mentions the dispatcher, and CLAUDE.md's Hooks block names the same files. Run `npm test` (docs changes must not break anything).

```bash
git add CLAUDE.md README.md skills/_shared/auto-mode-contract.md skills/_shared/pipeline-run-dir.md skills/_shared/git-discipline.md skills/_shared/subagent-output-contract.md skills/build/worktree-setup.md skills/flow/worktree-merge.md skills/wrap-up/cleanup-procedures.md skills/wrap-up/SKILL.md skills/wrap-up/review-console.md
git commit -m "Document the hook surface — CLAUDE.md conventions, shared-contract cross-refs, worktree record/clear wiring"
```

---

### Task 11: Release — version bump and final verification

**Files:**
- Modify: `.claude-plugin/plugin.json` (`"version": "5.0.0"` → `"5.1.0"`)

- [ ] **Step 1: Bump the version**

In `.claude-plugin/plugin.json`, change `"version": "5.0.0"` to `"version": "5.1.0"`.

- [ ] **Step 2: Full suite + registration re-check**

```bash
npm test
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('valid json')"
```

Expected: all tests pass; `valid json`.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "Bump plugin version to 5.1.0 — hook surface release"
git log --oneline -3
```

- [ ] **Step 4: Marketplace mirror (manual, second repo)**

Per CLAUDE.md release procedure: in `thomasholknielsen/claude-tweaks-marketplace`, set `plugins[].version` to `5.1.0`, keep `plugins[].description` aligned, bump `metadata.version` per its own scheme, commit + push. This repo's push is a separate explicit step — do not push without the user's go-ahead.
