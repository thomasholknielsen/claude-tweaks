# Stage-Item CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `bin/stage-item.js`, the one allowlisted CLI that writes a proposal file into a pipeline run's `staged/` directory — closing the remaining half of #637 (the `decisions.md` half already shipped as `bin/log-decision.js` under #686) — then migrate the two concrete hand-rolled `staged/`-writing call sites to use it.

**Architecture:** Mirror `bin/log-decision.js` / `bin/lib/log-decision/append.js` exactly: a thin CLI (`bin/stage-item.js`) over a pure, dependency-injected module (`bin/lib/stage-item/write.js`) that resolves and anchors `--run <dir>` under the main checkout (never a worktree-local shadow — `[IL-127]`), then writes the caller-supplied file's content to `<dir>/staged/<id><ext>`, where `<ext>` is taken from `--file`'s own extension. Reuses `bin/lib/hooks/worktree-detect.js`'s `mainCheckoutRoot`/`safeReal`, the same anchoring primitives `log-decision/append.js` already imports.

**Tech Stack:** Node.js (CommonJS, no external deps — `node --test` is the project's whole test runner), `fs`/`path` only.

**Spec:** `work/637-spec.md` (materialized from GitHub issue #637 in this worktree).

## Global Constraints

- No external dependencies — Node built-ins only (`docs/plugin-structure.md`'s Stack table: `node --test tests/`, no external deps).
- Every new `bin/*.js` CLI follows the injectable-deps pattern already used by `bin/log-decision.js`/`bin/materialize.js` — all I/O through a `deps` object with a `realDeps` default, so tests never touch the real filesystem outside a tmpdir.
- An explicit `--run <dir>` must resolve to a real directory anchored under the main checkout (never a linked-worktree shadow) — refuse with a clear message, exit code, never throw, never silently write to the wrong place (`docs/hooks.md`'s anchoring bullet, `[IL-127]`).
- `record-decision` (the CLI half of this issue's original two-verb ask) already shipped as `bin/log-decision.js` under #686 — this plan does **not** re-implement it or rename it to a `bin/hooks.js record-decision` subcommand; it builds `stage-item` as `bin/log-decision.js`'s sibling, same standalone-CLI shape, per the precedent `bin/log-decision.js`'s own header comment states ("the staged/ writer is #637's remaining scope").
- Every new CLI invocation must be expressible as **one flat Bash command** (no heredoc, no loop) — the worktree-session Bash-tool text-shape guard refuses compound commands outright (`docs/skill-authoring.md`'s "Harness-level worktree Bash guard" section); this is a design constraint on the CLI's calling convention, not something to test in `node --test`.

---

### Task 1: `bin/lib/stage-item/write.js` — pure write module

**Files:**
- Create: `plugin/bin/lib/stage-item/write.js`
- Test: `tests/bin-lib/stage-item/write.test.js`

**Interfaces:**
- Consumes: `mainCheckoutRoot(cwd)`, `safeReal(p)` from `plugin/bin/lib/hooks/worktree-detect.js` (existing, unchanged).
- Produces (consumed by Task 2's CLI):
  - `resolveTarget({ runDir, cwd, mainRoot }) -> { ok: true, dir: <anchored real runDir> } | { ok: false, reason: 'missing' | 'not-anchored' }`
  - `sanitizeId(id) -> string | null` — returns the id unchanged if it is safe to use as a filename stem (`/^[A-Za-z0-9][A-Za-z0-9._-]*$/`, no `/`, no `..`), else `null`.
  - `writeStagedItem({ runDir, id, sourcePath, content }) -> { file }` — `content` is the already-read file content (string or Buffer); writes it to `<runDir>/staged/<id><ext>`, creating `staged/` if absent. `<ext>` is `path.extname(sourcePath)` (empty string if the source has none). Overwrites an existing file at that path (staged proposals are documents, not an append log — unlike `decisions.md`, there is no append-vs-overwrite distinction to preserve).

- [ ] **Step 1: Write the failing tests**

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveTarget, sanitizeId, writeStagedItem } = require('../../../plugin/bin/lib/stage-item/write');

test('sanitizeId: accepts kind-n shapes and safe stems, rejects path traversal and separators', () => {
  assert.equal(sanitizeId('review-2'), 'review-2');
  assert.equal(sanitizeId('leftover-my-slug'), 'leftover-my-slug');
  assert.equal(sanitizeId('polish-suggestion-3'), 'polish-suggestion-3');
  assert.equal(sanitizeId('../../etc/passwd'), null);
  assert.equal(sanitizeId('a/b'), null);
  assert.equal(sanitizeId(''), null);
  assert.equal(sanitizeId(null), null);
  assert.equal(sanitizeId('.hidden'), null);
});

test('resolveTarget: run dir under mainRoot ok; linked-worktree shadow not-anchored; missing dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'si-'));
  const main = path.join(root, 'main');
  const wt = path.join(main, '.claude', 'worktrees', 'wt');
  const good = path.join(main, '.claude-tweaks', 'pipelines', 'run-a');
  const shadow = path.join(wt, '.claude-tweaks', 'pipelines', 'run-a');
  fs.mkdirSync(good, { recursive: true });
  fs.mkdirSync(shadow, { recursive: true });
  fs.mkdirSync(path.join(main, '.git'));
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: ../../../.git/worktrees/wt\n');
  assert.equal(resolveTarget({ runDir: good, mainRoot: main }).ok, true);
  const bad = resolveTarget({ runDir: shadow, mainRoot: main });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'not-anchored');
  assert.deepEqual(resolveTarget({ runDir: path.join(main, 'nope'), mainRoot: main }), { ok: false, reason: 'missing' });
});

test('writeStagedItem: creates staged/ and writes <id><ext> from the source extension', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-run-'));
  const r = writeStagedItem({ runDir, id: 'review-2', sourcePath: '/tmp/whatever.patch', content: 'diff --git a b\n' });
  assert.equal(r.file, path.join(runDir, 'staged', 'review-2.patch'));
  assert.equal(fs.readFileSync(r.file, 'utf8'), 'diff --git a b\n');
});

test('writeStagedItem: no extension on source writes id with no extension; overwrite replaces content', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-run2-'));
  writeStagedItem({ runDir, id: 'leftover-my-slug', sourcePath: '/tmp/body', content: 'first\n' });
  const r = writeStagedItem({ runDir, id: 'leftover-my-slug', sourcePath: '/tmp/body', content: 'second\n' });
  assert.equal(r.file, path.join(runDir, 'staged', 'leftover-my-slug'));
  assert.equal(fs.readFileSync(r.file, 'utf8'), 'second\n');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/stage-item/write.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/lib/stage-item/write'`

- [ ] **Step 3: Write the implementation**

```javascript
// bin/lib/stage-item/write.js — the staged/ half of #637's "no CLI writes
// decisions.md or staged/ items" gap (the decisions.md half shipped as
// bin/log-decision.js / bin/lib/log-decision/append.js under #686). Every
// site that used to compose a proposal file by hand via a scratch `node -e`
// calls bin/stage-item.js, which is a thin wrapper over this module.
//
// The run dir must resolve under the main checkout ($RUN_ROOT — see
// _shared/pipeline-run-dir.md's Anchoring section): a worktree-local shadow
// copy is refused, never silently written ([IL-127]) — same structural
// .git-walk anchoring bin/lib/log-decision/append.js already implements.
'use strict';

const fs = require('fs');
const path = require('path');
const { mainCheckoutRoot, safeReal } = require('../hooks/worktree-detect');

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// A staged item's id becomes a filename stem — reject anything that isn't a
// plain, single-segment token (no `/`, no leading `.`, no empty string).
function sanitizeId(id) {
  if (typeof id !== 'string' || !id) return null;
  if (!SAFE_ID.test(id)) return null;
  return id;
}

// Walk up from `startDir` for the nearest ancestor containing a `.git` entry.
function findGitRoot(startDir) {
  let dir = startDir;
  for (;;) {
    let st;
    try { st = fs.statSync(path.join(dir, '.git')); } catch { st = null; }
    if (st) return { dir, isFile: st.isFile() };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// { runDir, cwd?, mainRoot? } -> { ok, dir } | { ok:false, reason:'missing'|'not-anchored' }
function resolveTarget({ runDir, cwd = process.cwd(), mainRoot }) {
  const real = safeReal(runDir);
  let isDir = false;
  try { isDir = !!real && fs.statSync(real).isDirectory(); } catch { isDir = false; }
  if (!isDir) return { ok: false, reason: 'missing' };

  const found = findGitRoot(real);
  if (!found || found.isFile) return { ok: false, reason: 'not-anchored' };
  const gitRoot = found.dir;

  if (mainRoot === undefined) {
    const computed = mainCheckoutRoot(cwd);
    if (!computed) return { ok: false, reason: 'not-anchored' };
    const rootReal = safeReal(computed) || computed;
    if (rootReal !== gitRoot) return { ok: false, reason: 'not-anchored' };
    return { ok: true, dir: real };
  }
  if (mainRoot) {
    const rootReal = safeReal(mainRoot) || mainRoot;
    if (rootReal !== gitRoot) return { ok: false, reason: 'not-anchored' };
  }
  return { ok: true, dir: real };
}

// { runDir, id, sourcePath, content } -> { file }. Overwrites; staged
// proposals are documents, not an append log.
function writeStagedItem({ runDir, id, sourcePath, content }) {
  const stagedDir = path.join(runDir, 'staged');
  fs.mkdirSync(stagedDir, { recursive: true });
  const ext = path.extname(sourcePath || '');
  const file = path.join(stagedDir, `${id}${ext}`);
  fs.writeFileSync(file, content);
  return { file };
}

module.exports = { resolveTarget, sanitizeId, writeStagedItem };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/stage-item/write.test.js`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/stage-item/write.js tests/bin-lib/stage-item/write.test.js
git commit -m "Add stage-item write module — resolveTarget/sanitizeId/writeStagedItem

refs #637"
```

---

### Task 2: `bin/stage-item.js` — CLI wrapper

**Files:**
- Create: `plugin/bin/stage-item.js`
- Test: `tests/bin-lib/stage-item/cli.test.js`

**Interfaces:**
- Consumes: `resolveTarget`, `sanitizeId`, `writeStagedItem` from Task 1's `plugin/bin/lib/stage-item/write.js`.
- Produces: `module.exports = { run, parseArgs }` — `run(argv, deps)` returns a numeric exit code (0 success, 2 malformed invocation, 3 run dir missing/not-anchored/read/write failure), matching `bin/log-decision.js`'s exit-code convention exactly so both CLIs behave the same way under skill-prose citation.

Usage: `node bin/stage-item.js --run <run-dir> --id <kind>-<n> --file <path> [--help]` — one flat command, no compound shape, so it clears the worktree-session Bash-tool text-shape guard the same way `bin/log-decision.js` already does.

- [ ] **Step 1: Write the failing tests**

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../../plugin/bin/stage-item');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sicli-'));
  const main = path.join(root, 'main');
  const runDir = path.join(main, '.claude-tweaks', 'pipelines', '2026-08-20T090000-spec-12');
  const shadow = path.join(main, '.claude', 'worktrees', 'flow-spec-12', '.claude-tweaks', 'pipelines', '2026-08-20T090000-spec-12');
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(shadow, { recursive: true });
  fs.mkdirSync(path.join(main, '.git'));
  fs.writeFileSync(path.join(path.dirname(path.dirname(shadow.split(path.sep + '.claude-tweaks')[0])), '.git'), 'gitdir: ../../../.git/worktrees/flow-spec-12\n');
  const sourceFile = path.join(root, 'proposal.patch');
  fs.writeFileSync(sourceFile, 'diff --git a b\n+x\n');
  return { root, main, runDir, sourceFile };
}

function fakeDeps(cwd) {
  const out = []; const err = [];
  return {
    deps: {
      cwd: () => cwd,
      readFile: (p) => fs.readFileSync(p),
      stdout: (s) => out.push(s),
      stderr: (s) => err.push(s),
    },
    out, err,
  };
}

test('cli: success path writes staged/<id><ext> and prints the file path', () => {
  const { main, runDir, sourceFile } = fixture();
  const { deps, out } = fakeDeps(main);
  const code = run(['--run', runDir, '--id', 'review-2', '--file', sourceFile], deps);
  assert.equal(code, 0);
  const written = path.join(runDir, 'staged', 'review-2.patch');
  assert.equal(fs.readFileSync(written, 'utf8'), 'diff --git a b\n+x\n');
  assert.ok(out.join('').includes(written));
});

test('cli: missing --run, --id, or --file is a malformed invocation (exit 2)', () => {
  const { main, runDir, sourceFile } = fixture();
  const { deps: d1 } = fakeDeps(main);
  assert.equal(run(['--id', 'review-2', '--file', sourceFile], d1), 2);
  const { deps: d2 } = fakeDeps(main);
  assert.equal(run(['--run', runDir, '--file', sourceFile], d2), 2);
  const { deps: d3 } = fakeDeps(main);
  assert.equal(run(['--run', runDir, '--id', 'review-2'], d3), 2);
});

test('cli: unsafe --id (path traversal) is rejected (exit 2), nothing written', () => {
  const { main, runDir, sourceFile } = fixture();
  const { deps } = fakeDeps(main);
  const code = run(['--run', runDir, '--id', '../../etc/passwd', '--file', sourceFile], deps);
  assert.equal(code, 2);
  assert.equal(fs.existsSync(path.join(runDir, '..', '..', '..', 'etc', 'passwd')), false);
});

test('cli: a source file that does not exist is a malformed invocation (exit 2)', () => {
  const { main, runDir } = fixture();
  const { deps } = fakeDeps(main);
  const code = run(['--run', runDir, '--id', 'review-2', '--file', '/no/such/file.patch'], {
    ...deps,
    readFile: () => { throw new Error('ENOENT'); },
  });
  assert.equal(code, 2);
});

test('cli: --run resolving to a worktree-local shadow is refused (exit 3), nothing written', () => {
  const { shadow, sourceFile } = fixture();
  const { deps } = fakeDeps(path.dirname(shadow));
  const code = run(['--run', shadow, '--id', 'review-2', '--file', sourceFile], deps);
  assert.equal(code, 3);
  assert.equal(fs.existsSync(path.join(shadow, 'staged')), false);
});

test('cli: --help prints usage and exits 0 without touching the filesystem', () => {
  const { main } = fixture();
  const { deps, out } = fakeDeps(main);
  const code = run(['--help'], deps);
  assert.equal(code, 0);
  assert.match(out.join(''), /usage: stage-item\.js/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/stage-item/cli.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/stage-item'`

- [ ] **Step 3: Write the implementation**

```javascript
#!/usr/bin/env node
// bin/stage-item.js — write one staged proposal file into a run's staged/
// directory.
//   node bin/stage-item.js --run <run-dir> --id <kind>-<n> --file <path> [--help]
// Exit 0 on success (writes staged/<id><ext>, echoes the file path to
// stdout); 2 on a malformed invocation (missing/unsafe args, unreadable
// --file); 3 when the run dir is missing or not anchored under the main
// checkout (a worktree-local shadow — _shared/pipeline-run-dir.md's
// Anchoring section, [IL-127]).
// The staged/ half of #637 ("no CLI writes decisions.md or staged/ items");
// bin/log-decision.js is the decisions.md half, shipped under #686.
'use strict';

const path = require('path');
const fs = require('fs');
const { resolveTarget, sanitizeId, writeStagedItem } = require('./lib/stage-item/write');

const USAGE = 'usage: stage-item.js --run <run-dir> --id <kind>-<n> --file <path> [--help]\n';

function parseArgs(argv) {
  const o = { run: null, id: null, file: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; return v === undefined ? null : v; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--run') o.run = next();
    else if (a === '--id') o.id = next();
    else if (a === '--file') o.file = next();
    else return { error: `unknown argument: ${a}` };
  }
  return o;
}

const realDeps = {
  cwd: () => process.cwd(),
  readFile: (p) => fs.readFileSync(p),
  mainRoot: undefined,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  if (o.error) { deps.stderr(o.error + '\n' + USAGE); return 2; }
  if (o.help) { deps.stdout(USAGE); return 0; }
  if (!o.run) { deps.stderr('stage-item.js: --run <run-dir> is required\n' + USAGE); return 2; }
  if (!o.file) { deps.stderr('stage-item.js: --file <path> is required\n' + USAGE); return 2; }
  const id = sanitizeId(o.id);
  if (!id) { deps.stderr(`stage-item.js: --id must be a plain filename stem (letters, digits, ., _, - — no path separators): ${JSON.stringify(o.id)}\n` + USAGE); return 2; }

  let content;
  try { content = deps.readFile(o.file); } catch (err) {
    deps.stderr(`stage-item.js: could not read --file ${o.file} (${err && err.message})\n`);
    return 2;
  }

  let target;
  try { target = resolveTarget({ runDir: o.run, cwd: deps.cwd(), mainRoot: deps.mainRoot }); } catch (err) {
    deps.stderr(`stage-item.js: ${err && err.message}\n`);
    return 3;
  }
  if (!target.ok) {
    if (target.reason === 'missing') deps.stderr(`stage-item.js: run dir does not exist: ${o.run}\n`);
    else deps.stderr(`stage-item.js: run dir is not anchored under the main checkout (a worktree-local shadow): ${o.run} — resolve $RUN_ROOT per _shared/pipeline-run-dir.md's Anchoring section and pass the main-checkout path\n`);
    return 3;
  }

  let result;
  try { result = writeStagedItem({ runDir: target.dir, id, sourcePath: o.file, content }); } catch (err) {
    deps.stderr(`stage-item.js: could not write staged item (${err && err.message})\n`);
    return 3;
  }
  deps.stdout(result.file + '\n');
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
```

Note: `path` is imported but only used indirectly via the injected modules in this file's own logic — if `eslint`/lint flags an unused import, drop the top-level `const path = require('path');` line (it is not referenced directly in this file; `writeStagedItem`/`resolveTarget` do their own `path` work). Verify with the project's lint command before committing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/stage-item/cli.test.js`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/stage-item.js tests/bin-lib/stage-item/cli.test.js
git commit -m "Add bin/stage-item.js CLI — the staged/ writer half of #637

refs #637"
```

---

### Task 3: Cite `bin/stage-item.js` in `_shared/auto-decision-log.md`

**Files:**
- Modify: `plugin/skills/_shared/auto-decision-log.md`

**Interfaces:** None (documentation only).

- [ ] **Step 1: Locate the STAGED status row and the Append protocol section**

Read `plugin/skills/_shared/auto-decision-log.md`'s "## Status semantics" table (the `STAGED` row: *"Skill detected a decision-worthy item but did not act. Patch / proposal is written to the run's `staged/` directory."*) and the "## Append protocol" section (which already cites `bin/log-decision.js` for `decisions.md` entries, ending "For the very first entry of a pipeline run...").

- [ ] **Step 2: Add the citation**

Immediately after the "## Append protocol" section's existing `bin/log-decision.js` paragraph (the one starting "**One command per entry.**"), add a new paragraph:

```markdown
**Staged proposal files** (the `staged/` directory a `STAGED` entry points at) are written the
same way — through a CLI, never a hand-rolled `fs.writeFileSync`:
`bin/stage-item.js --run <run-dir> --id <kind>-<n> --file <path>` copies the caller-composed
proposal at `<path>` into `<run-dir>/staged/<id><ext>` (extension taken from `<path>`), anchoring
`--run` under the main checkout the same way `bin/log-decision.js` does. `<kind>-<n>` is the same
item-id shape `_shared/console-on-pr.md`'s "Item ID scheme" assigns at render time; a caller
staging a new proposal composes its own descriptive id (e.g. `leftover-{slug}`,
`polish-suggestion-{n}`) — the console re-keys rows to `{kind}-{n}` only when it renders them, not
when they are written.
```

- [ ] **Step 3: Verify the edit renders correctly**

Run: `grep -n "bin/stage-item.js" plugin/skills/_shared/auto-decision-log.md`
Expected: one match, inside the new paragraph.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/_shared/auto-decision-log.md
git commit -m "auto-decision-log.md: cite bin/stage-item.js for staged/ proposal writes

refs #637"
```

---

### Task 4: Migrate `wrap-up/leftover-routing.md`'s hand-rolled staging write

**Files:**
- Modify: `plugin/skills/wrap-up/leftover-routing.md`

**Interfaces:** None (documentation only — this task changes prescribed *procedure text*, not code, so `git grep` verification replaces a test step).

- [ ] **Step 1: Confirm the current hand-rolled block**

Run: `grep -n 'RUN_DIR}/staged/leftover' plugin/skills/wrap-up/leftover-routing.md`
Expected: one match, inside step 3's `node -e ... require('fs').writeFileSync(...)` bash block (composes the staged file's header + body from `/tmp/wrap-up-leftover-payload.json`, then writes it to `"${RUN_DIR}/staged/leftover-${SLUG}.md"`).

- [ ] **Step 2: Replace the write step**

In `plugin/skills/wrap-up/leftover-routing.md`'s numbered "**Stage it**" step (step 3), replace the existing two-command block (the `node -e` that composes the header+body string, piped straight into `writeFileSync` against the literal `staged/` path) with a two-step version that composes to a temp file, then calls `bin/stage-item.js`:

```bash
node -e "const p=require('/tmp/wrap-up-leftover-payload.json');
  require('fs').writeFileSync(process.argv[1],
    'Title: ' + p.title + '\nType: ' + p.type + '\nLabels: ' + ((p.labels.concat(process.argv[3]==='true'?['needs:definition']:[]).join(', ')) || 'none') + '\nDefer-reason: ' + process.argv[2] + '\n\n' + p.body)" \
  "/tmp/wrap-up-leftover-${SLUG}.md" "$DEFER_REASON" "$NEEDS_DEFINITION"
node "${CLAUDE_PLUGIN_ROOT}/bin/stage-item.js" --run "$RUN_DIR" --id "leftover-${SLUG}" --file "/tmp/wrap-up-leftover-${SLUG}.md"
```

Keep the surrounding prose ("render the payload to `{run-dir}/staged/leftover-{slug}.md` (`{slug}` — kebab-case derived from the section title), never created directly:") as-is except update the trailing sentence to note the write now goes through `bin/stage-item.js` rather than a direct `writeFileSync` against the run dir — this is the same anchoring guarantee `bin/log-decision.js` already gives `decisions.md` writes, now extended to this staged file. Every other reference to `staged/leftover-{slug}.md` elsewhere in this file (the step 4 log line, step 5's Review Console reference) is a filename the CLI still produces identically — no other line in this file needs to change.

- [ ] **Step 3: Verify**

Run: `grep -n 'stage-item.js' plugin/skills/wrap-up/leftover-routing.md`
Expected: one match, in the new command block.

Run: `grep -n "writeFileSync(process.argv\[1\]," plugin/skills/wrap-up/leftover-routing.md`
Expected: the block still composes the file's *content* via `node -e` (unavoidable — the CLI only copies an already-composed file, it does not template one) but no longer writes directly to a `${RUN_DIR}/staged/...` path — confirm the writeFileSync target argument is now the `/tmp/...` path, not `"${RUN_DIR}/staged/...`.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/wrap-up/leftover-routing.md
git commit -m "wrap-up leftover-routing: stage via bin/stage-item.js, not a direct writeFileSync

refs #637"
```

---

### Task 5: Migrate `flow/polish-execution.md`'s staged-suggestion write, cite the CLI in `flow/multispec-review-console.md`

**Files:**
- Modify: `plugin/skills/flow/polish-execution.md`
- Modify: `plugin/skills/flow/multispec-review-console.md`

**Interfaces:** None (documentation only).

- [ ] **Step 1: Confirm the current instruction**

Run: `grep -n 'write one file per entry' plugin/skills/flow/polish-execution.md`
Expected: one match — *"When `/design-wrapper polish` returns a non-empty `staged_suggestions`, write one file per entry to `{run-dir}/staged/polish-suggestion-{n}.md` and append one `STAGED` entry per entry to `decisions.md` under the same `## /flow` heading."*

- [ ] **Step 2: Rewrite the instruction to name the CLI**

Replace that sentence with:

```markdown
When `/design-wrapper polish` returns a non-empty `staged_suggestions`, compose the body for each
entry, write it to a temp file, and stage it via
`node "${CLAUDE_PLUGIN_ROOT}/bin/stage-item.js" --run "$PIPELINE_RUN_DIR" --id "polish-suggestion-{n}" --file <temp-file>`
(writes `{run-dir}/staged/polish-suggestion-{n}.md` — same filename as before, now anchored the
same way `bin/log-decision.js` anchors `decisions.md`), then append one `STAGED` entry per entry to
`decisions.md` under the same `## /flow` heading.
```

Leave the rest of the section (the `kind`-branching table for `manual-only` vs. `unclassified`, and the `decisions.md` line templates referencing `staged/polish-suggestion-{n}.md`) unchanged — the produced filename and its downstream references are identical; only the write mechanism changes.

- [ ] **Step 3: Verify**

Run: `grep -n 'stage-item.js' plugin/skills/flow/polish-execution.md`
Expected: one match.

- [ ] **Step 4: Cite the CLI in `flow/multispec-review-console.md`**

`multispec-review-console.md` reads and aggregates `staged/` content across specs but does not itself write new staged proposal files (verified: `git grep -n "writeFileSync\|node -e" plugin/skills/flow/multispec-review-console.md` returns no matches) — so there is no hand-rolled write to migrate there. Add one clarifying sentence to its Step 2 (the "read `decisions.md` + `staged/` contents" step) so a reader knows how those files got there in the first place. Immediately after the existing sentence ending "...holds run-level items such as freeform-issue translations and any parent-level leftover proposals).", add:

```markdown
Every staged file this console reads was itself written by `bin/stage-item.js` (`_shared/auto-decision-log.md`'s "Staged proposal files" section) — this console is a reader, never a writer, of `staged/`.
```

- [ ] **Step 5: Verify**

Run: `grep -n 'stage-item.js' plugin/skills/flow/multispec-review-console.md`
Expected: one match.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/flow/polish-execution.md plugin/skills/flow/multispec-review-console.md
git commit -m "flow polish-execution + multispec-review-console: cite bin/stage-item.js

refs #637"
```

---

### Task 6: Final verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: PASS — 0 failures, including the two new `tests/bin-lib/stage-item/*.test.js` files and every existing suite unaffected by the doc-only edits in Tasks 3-5.

- [ ] **Step 2: Sanity-check the CLI end-to-end against a scratch run dir (not committed — cleanup after)**

```bash
mkdir -p /tmp/stage-item-smoke/.git
```

```bash
mkdir -p /tmp/stage-item-smoke/.claude-tweaks/pipelines/smoke-run
```

```bash
echo "hello" > /tmp/stage-item-source.md
```

```bash
node plugin/bin/stage-item.js --run /tmp/stage-item-smoke/.claude-tweaks/pipelines/smoke-run --id smoke-1 --file /tmp/stage-item-source.md
```

Expected: prints `/tmp/stage-item-smoke/.claude-tweaks/pipelines/smoke-run/staged/smoke-1.md` and that file exists with content `hello\n`.

```bash
rm -rf /tmp/stage-item-smoke /tmp/stage-item-source.md
```

- [ ] **Step 3: No further commit needed** — Task 6 is verification-only; if Step 1 or Step 2 surfaces a defect, fix it as part of whichever earlier task owns the broken file and re-run this task from Step 1.
