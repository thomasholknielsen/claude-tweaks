# Always-Worktree Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repo-scoped, opt-in policy (`worktree.always: true`) that mechanically denies `Edit`/`Write`/`NotebookEdit`/`git commit` outside a linked git worktree from the very first prompt of a session, and adopt it for this repo.

**Architecture:** A new `bin/lib/policy.js` reads the flat-dotted-key policy file; a new `bin/lib/hooks/worktree-detect.js` mechanically detects whether a path is already inside a linked worktree (mirroring `using-git-worktrees` Step 0's `GIT_DIR != GIT_COMMON` + submodule guard); `bin/lib/hooks/pre-tool-use.js` gains a run-independent precondition check that uses both, wired into `hooks/hooks.json` via new `Edit`/`Write`/`NotebookEdit` matchers; `bin/lib/hooks/session-start.js` gains a matching advisory nudge. This repo's own `.claude-tweaks/policy.yml` turns the flag on as the first adopter.

**Tech Stack:** Node.js (`node --test`), no new runtime dependencies (plain regex-based policy parsing, no YAML library — matches the existing zero-runtime-deps constraint).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-06-always-worktree-enforcement-design.md` — read it if any task below seems to contradict it; the spec wins.
- **Execute this entire plan inside a single isolated git worktree**, created via `/superpowers:using-git-worktrees` **before Task 1**. Do not run any task directly against the main checkout. Reason: `policy.js` reads the raw file from disk, not git-commit status — the moment Task 6 writes `.claude-tweaks/policy.yml` with `worktree.always: true` into this repo, any *subsequent* `Edit`/`Write`/`git commit` against the main checkout would be immediately denied by the very gate this plan builds, including the commit that adds the file itself. Working inside a worktree the whole time avoids this self-lockout, since every edit already targets an isolated path. Merge back at the end via this repo's existing checkout-free convention (`git push . <sha>:main`) per `/superpowers:finishing-a-development-branch`.
- No runtime npm dependencies may be added — `package.json` documents "the plugin itself ships no runtime npm deps."
- Never `git add -A`/`git add .` — stage exact files. Commit messages: imperative voice, no Conventional Commit prefixes.
- Every new/modified hook path must still satisfy the garbage-stdin invariant in `tests/hooks-dispatcher.test.js` (exit 0, no stdout on garbage input).

---

### Task 1: Policy reader (`bin/lib/policy.js`)

**Files:**
- Create: `bin/lib/policy.js`
- Test: `tests/policy.test.js`

**Interfaces:**
- Produces: `isWorktreeAlwaysOn(repoRoot: string): boolean` — `true` only when `<repoRoot>/.claude-tweaks/policy.yml` exists and contains a line matching `worktree.always: true` (whitespace-tolerant around the value). Missing file, missing key, or `false` → `false`.

- [ ] **Step 1: Write the failing test**

Create `tests/policy.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isWorktreeAlwaysOn } = require('../bin/lib/policy');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-policy-'));
}
function writePolicy(repo, content) {
  const dir = path.join(repo, '.claude-tweaks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'policy.yml'), content);
}

test('missing policy file -> false', () => {
  assert.strictEqual(isWorktreeAlwaysOn(tmpRepo()), false);
});

test('worktree.always: true -> true', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('worktree.always: false -> false', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: false\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), false);
});

test('unrelated keys and near-miss lines -> false', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'issues.autonomous-eligibility: any\nworktree.something-else: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), false);
});

test('tolerates extra whitespace around the value', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always:    true  \n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});

test('the key can appear alongside other policy lines in either order', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'issues.autonomous-eligibility: label agent:eligible\nworktree.always: true\n');
  assert.strictEqual(isWorktreeAlwaysOn(repo), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/policy.test.js`
Expected: FAIL — `Cannot find module '../bin/lib/policy'`

- [ ] **Step 3: Write minimal implementation**

Create `bin/lib/policy.js`:

```js
// bin/lib/policy.js — reads flat dotted-key project policy from
// .claude-tweaks/policy.yml. No YAML dependency: the plugin ships zero
// runtime npm deps, and the only supported shape is a top-level
// `key.path: value` line, matching the convention already documented for
// other policies (e.g. issues.autonomous-eligibility).
'use strict';
const fs = require('fs');
const path = require('path');

function readPolicyFile(repoRoot) {
  try {
    return fs.readFileSync(path.join(repoRoot, '.claude-tweaks', 'policy.yml'), 'utf8');
  } catch {
    return null;
  }
}

function isWorktreeAlwaysOn(repoRoot) {
  const raw = readPolicyFile(repoRoot);
  if (!raw) return false;
  return raw.split('\n').some((line) => /^worktree\.always:\s*true$/.test(line.trim()));
}

module.exports = { isWorktreeAlwaysOn };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/policy.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/policy.js tests/policy.test.js
git commit -m "Add policy.js to read the worktree.always flag from .claude-tweaks/policy.yml"
```

---

### Task 2: Worktree isolation detector (`bin/lib/hooks/worktree-detect.js`)

**Files:**
- Create: `bin/lib/hooks/worktree-detect.js`
- Test: `tests/hooks-worktree-detect.test.js`

**Interfaces:**
- Produces:
  - `nearestExistingDir(p: string): string|null` — resolves `p` to an absolute path; if it names an existing file, returns its parent directory; if it doesn't exist yet, walks up parents until one exists; returns that directory (or a filesystem-root-level directory in the pathological case where nothing else exists).
  - `repoRootFor(p: string): string|null` — `git rev-parse --show-toplevel` from `nearestExistingDir(p)`, realpath-resolved. `null` if not inside a git repo.
  - `isLinkedWorktree(p: string): boolean` — `true` only if `nearestExistingDir(p)` is inside a git repo, is NOT a submodule (`git rev-parse --show-superproject-working-tree` is empty), AND its `--git-dir` and `--git-common-dir` resolve to different real paths.

- [ ] **Step 1: Write the failing test**

Create `tests/hooks-worktree-detect.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { nearestExistingDir, repoRootFor, isLinkedWorktree } = require('../bin/lib/hooks/worktree-detect');

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init', '-q']);
  return fs.realpathSync(dir);
}

function linkedWorktreeOf(main) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-parent-'));
  const wt = path.join(parent, 'wt');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt, '-b', `wt-branch-${path.basename(parent)}`]);
  return fs.realpathSync(wt);
}

test('nearestExistingDir: existing directory returns itself', () => {
  const dir = gitRepo();
  assert.strictEqual(nearestExistingDir(dir), dir);
});

test('nearestExistingDir: existing file returns its parent directory', () => {
  const dir = gitRepo();
  const file = path.join(dir, 'a.txt');
  fs.writeFileSync(file, 'x');
  assert.strictEqual(nearestExistingDir(file), dir);
});

test('nearestExistingDir: not-yet-existing nested path walks up to the nearest existing ancestor', () => {
  const dir = gitRepo();
  const target = path.join(dir, 'new', 'nested', 'file.txt');
  assert.strictEqual(nearestExistingDir(target), dir);
});

test('nearestExistingDir: falls back to a filesystem root when no other ancestor exists', () => {
  const result = nearestExistingDir('/this/path/should/not/exist/anywhere/xyz');
  assert.strictEqual(result, path.parse(result).root);
});

test('repoRootFor: resolves the git toplevel for a path inside the repo', () => {
  const dir = gitRepo();
  assert.strictEqual(repoRootFor(path.join(dir, 'a.txt')), dir);
});

test('repoRootFor: non-git directory returns null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-nongit-'));
  assert.strictEqual(repoRootFor(dir), null);
});

test('isLinkedWorktree: main checkout is not isolated', () => {
  const dir = gitRepo();
  assert.strictEqual(isLinkedWorktree(dir), false);
});

test('isLinkedWorktree: a linked worktree is isolated', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  assert.strictEqual(isLinkedWorktree(wt), true);
});

test('isLinkedWorktree: non-git directory is not isolated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wtd-nongit2-'));
  assert.strictEqual(isLinkedWorktree(dir), false);
});

test('isLinkedWorktree: a submodule is treated as not isolated', () => {
  const outer = gitRepo();
  const inner = gitRepo();
  execFileSync('git', ['-C', outer, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner, 'sub']);
  const subPath = path.join(outer, 'sub');
  assert.strictEqual(isLinkedWorktree(subPath), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-worktree-detect.test.js`
Expected: FAIL — `Cannot find module '../bin/lib/hooks/worktree-detect'`

- [ ] **Step 3: Write minimal implementation**

Create `bin/lib/hooks/worktree-detect.js`:

```js
// bin/lib/hooks/worktree-detect.js — mechanical check for "is this path
// already inside an isolated git worktree?" Ports the same
// GIT_DIR != GIT_COMMON + submodule-guard heuristic
// superpowers:using-git-worktrees Step 0 uses, so the hook and the skill
// never disagree about what counts as isolated.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function git(args, cwd) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
  } catch {
    return null;
  }
}

function safeReal(p) {
  try { return fs.realpathSync(p); } catch { return p; }
}

function nearestExistingDir(p) {
  let dir = path.resolve(p);
  try {
    if (fs.statSync(dir).isFile()) dir = path.dirname(dir);
  } catch {
    /* dir may not exist yet; fall through to the walk-up loop */
  }
  while (dir && !fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return dir;
}

function repoRootFor(p) {
  const dir = nearestExistingDir(p);
  if (!dir) return null;
  const top = git(['rev-parse', '--show-toplevel'], dir);
  return top ? safeReal(top) : null;
}

function isLinkedWorktree(p) {
  const dir = nearestExistingDir(p);
  if (!dir) return false;
  const gitDir = git(['rev-parse', '--git-dir'], dir);
  const gitCommon = git(['rev-parse', '--git-common-dir'], dir);
  if (!gitDir || !gitCommon) return false; // not a git repo at all
  const superproject = git(['rev-parse', '--show-superproject-working-tree'], dir);
  if (superproject) return false; // submodule -> not an isolated worktree
  return safeReal(path.resolve(dir, gitDir)) !== safeReal(path.resolve(dir, gitCommon));
}

module.exports = { nearestExistingDir, repoRootFor, isLinkedWorktree };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hooks-worktree-detect.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/worktree-detect.js tests/hooks-worktree-detect.test.js
git commit -m "Add worktree-detect.js to mechanically test path isolation"
```

---

### Task 3: Wire the worktree-required gate into `pre-tool-use.js`

**Files:**
- Modify: `bin/lib/hooks/pre-tool-use.js`
- Modify: `tests/hooks-pre-tool-use.test.js`

**Interfaces:**
- Consumes: `isWorktreeAlwaysOn(repoRoot)` from Task 1; `repoRootFor(p)` / `isLinkedWorktree(p)` from Task 2.
- Produces: `run(ctx)` (unchanged exported shape) now also denies on the new gate before falling through to the existing E1 logic.

- [ ] **Step 1: Write the failing tests**

Add `const { execFileSync } = require('child_process');` is already imported in this file — no change needed there. Add these test cases to the end of `tests/hooks-pre-tool-use.test.js` (after the existing tests, before the final closing of the file):

```js
function gitRepoWithCommit() {
  const dir = gitRepo();
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init', '-q']);
  return dir;
}

function linkedWorktreeOf(main) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-e1-wtparent-'));
  const wt = path.join(parent, 'wt');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt, '-b', `wt-branch-${path.basename(parent)}`]);
  return fs.realpathSync(wt);
}

function withPolicy(repo, content) {
  fs.mkdirSync(path.join(repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude-tweaks', 'policy.yml'), content);
}

test('worktree-required: policy off allows Edit/Write/NotebookEdit/commit in the main checkout', () => {
  const repo = gitRepoWithCommit();
  assert.deepStrictEqual(pre.run({ input: { tool_name: 'Edit', tool_input: { file_path: path.join(repo, 'a.txt') } }, runDir: null, runState: null, cwd: repo }), {});
  assert.deepStrictEqual(pre.run({ input: { tool_name: 'Write', tool_input: { file_path: path.join(repo, 'b.txt') } }, runDir: null, runState: null, cwd: repo }), {});
  assert.deepStrictEqual(pre.run({ input: { tool_name: 'NotebookEdit', tool_input: { notebook_path: path.join(repo, 'n.ipynb') } }, runDir: null, runState: null, cwd: repo }), {});
  assert.deepStrictEqual(pre.run({ input: bashInput('git commit -m "x"', repo), runDir: null, runState: null, cwd: repo }), {});
});

test('worktree-required: policy on denies Edit in the main checkout with a corrective reason', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  const out = pre.run({ input: { tool_name: 'Edit', tool_input: { file_path: path.join(repo, 'a.txt') } }, runDir: null, runState: null, cwd: repo });
  const spec = out.json.hookSpecificOutput;
  assert.strictEqual(spec.permissionDecision, 'deny');
  assert.match(spec.permissionDecisionReason, /worktree\.always/);
  assert.match(spec.permissionDecisionReason, /using-git-worktrees/);
});

test('worktree-required: policy on allows Edit inside a linked worktree', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  execFileSync('git', ['-C', repo, 'add', '.claude-tweaks/policy.yml']);
  execFileSync('git', ['-C', repo, 'commit', '-m', 'policy', '-q']);
  const wt = linkedWorktreeOf(repo);
  const out = pre.run({ input: { tool_name: 'Edit', tool_input: { file_path: path.join(wt, 'a.txt') } }, runDir: null, runState: null, cwd: wt });
  assert.deepStrictEqual(out, {});
});

test('worktree-required: policy on denies Write to a not-yet-existing file, and NotebookEdit, in the main checkout', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  const writeOut = pre.run({ input: { tool_name: 'Write', tool_input: { file_path: path.join(repo, 'new', 'brand-new.txt') } }, runDir: null, runState: null, cwd: repo });
  assert.strictEqual(writeOut.json.hookSpecificOutput.permissionDecision, 'deny');
  const nbOut = pre.run({ input: { tool_name: 'NotebookEdit', tool_input: { notebook_path: path.join(repo, 'n.ipynb') } }, runDir: null, runState: null, cwd: repo });
  assert.strictEqual(nbOut.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('worktree-required: policy on denies a git commit in the main checkout even with NO pipeline run dir at all', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree.always: true\n');
  const out = pre.run({ input: bashInput('git commit -m "x"', repo), runDir: null, runState: null, cwd: repo });
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
});

test('worktree-required: policy is read from the EDIT TARGET\'s own repo, not the session cwd', () => {
  const policyRepo = gitRepoWithCommit();
  withPolicy(policyRepo, 'worktree.always: true\n');
  const otherRepo = gitRepoWithCommit(); // no policy
  const out = pre.run({ input: { tool_name: 'Edit', tool_input: { file_path: path.join(otherRepo, 'a.txt') } }, runDir: null, runState: null, cwd: policyRepo });
  assert.deepStrictEqual(out, {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-pre-tool-use.test.js`
Expected: FAIL — the 5 new `worktree-required:` tests fail (e.g. `Cannot read properties of undefined (reading 'hookSpecificOutput')` on `out.json`, since the current `run()` returns `{}` for non-Bash tool names and ignores policy entirely). All pre-existing tests in this file still PASS.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `bin/lib/hooks/pre-tool-use.js` with:

```js
// bin/lib/hooks/pre-tool-use.js — E1: working-directory discipline (block tier)
// + the worktree-required policy gate (run-independent; see below).
// Denies ONLY on a provable mismatch. Ambiguity -> allow: a false-positive
// freeze in an unattended run is worse than a missed catch (E2 still records).
// "Provable" includes ownership: a deny requires the commit to come from the
// session that recorded the worktree (or identity to be unavailable on either
// side, which preserves the pre-stamp behavior). A commit from a DIFFERENT
// session — e.g. unrelated fix work in the main checkout while a pipeline runs
// elsewhere — is not provably this run's work: allow, warn, log.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitTargets } = require('./git-command');
const ctxLib = require('./context');
const policy = require('../policy');
const wtDetect = require('./worktree-detect');

function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}';
}

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

// worktree-required policy gate: unlike E1 below, this needs no pipeline run
// state at all — it fires on the first Edit/Write/NotebookEdit/commit of a
// session, before any skill has ever run, whenever the target repo has opted
// into `worktree.always: true` in its .claude-tweaks/policy.yml.
function checkWorktreeRequired(ctx) {
  const toolName = ctx.input && ctx.input.tool_name;
  const toolInput = ctx.input && ctx.input.tool_input;
  let targetPath = null;

  if (toolName === 'Edit' || toolName === 'Write') {
    if (toolInput && typeof toolInput.file_path === 'string') targetPath = toolInput.file_path;
  } else if (toolName === 'NotebookEdit') {
    if (toolInput && typeof toolInput.notebook_path === 'string') targetPath = toolInput.notebook_path;
  } else if (toolName === 'Bash') {
    const command = toolInput && typeof toolInput.command === 'string' ? toolInput.command : null;
    if (command) {
      const commit = gitTargets(command, ctx.cwd).find((t) => t.action === 'commit');
      if (commit) targetPath = commit.dir;
    }
  }
  if (!targetPath) return {};

  const repoRoot = wtDetect.repoRootFor(targetPath);
  if (!repoRoot) return {}; // not a git repo at all -> allow
  if (!policy.isWorktreeAlwaysOn(repoRoot)) return {};
  if (wtDetect.isLinkedWorktree(targetPath)) return {};

  return {
    exit: 0,
    json: {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `claude-tweaks: this project requires an isolated worktree for all file changes ` +
          `(policy: worktree.always in .claude-tweaks/policy.yml). You're currently working in ` +
          `the main checkout (${repoRoot}). Set one up first: invoke /superpowers:using-git-worktrees, ` +
          `then retry this edit inside the new worktree.`,
      },
    },
  };
}

function run(ctx) {
  const gate = checkWorktreeRequired(ctx);
  if (gate.json) return gate;

  if (!ctx.runDir || !ctx.runState || !ctx.runState.worktree) return {};
  if (ctx.runState.status === 'clean') return {};
  if (ctx.input.tool_name !== 'Bash') return {};
  const command = ctx.input.tool_input && ctx.input.tool_input.command;
  if (typeof command !== 'string' || !command) return {};
  const assigned = safeReal(ctx.runState.worktree);
  if (!assigned) return {};

  const otherWorktrees = new Map();
  for (const dir of ctxLib.listRunDirs(ctx.cwd)) {
    const state = ctxLib.readRunState(dir);
    if (!state || !state.worktree) continue;
    const real = safeReal(state.worktree);
    if (!real || real === assigned) continue;
    if (!otherWorktrees.has(real)) otherWorktrees.set(real, dir);
  }

  for (const target of gitTargets(command, ctx.cwd)) {
    const top = toplevel(target.dir);
    if (!top) continue;
    const actual = safeReal(top);
    if (!actual) continue;
    if (actual === assigned) continue;
    if (otherWorktrees.has(actual)) {
      if (target.action !== 'push') {
        ctxLib.appendEvent(ctx.runDir, 'wd-ambiguous', { matched: actual });
      }
      continue;
    }
    if (target.action === 'push') {
      ctxLib.appendEvent(ctx.runDir, 'wd-push-mismatch', { expected: assigned, actual, command: command.slice(0, 200) });
      continue;
    }
    const owner = typeof ctx.runState.sessionId === 'string' ? ctx.runState.sessionId : '';
    const caller = typeof ctx.input.session_id === 'string' ? ctx.input.session_id : '';
    if (owner && caller && owner !== caller) {
      ctxLib.appendEvent(ctx.runDir, 'wd-foreign-session', { expected: assigned, actual, owner, caller, command: command.slice(0, 200) });
      return {
        exit: 0,
        json: {
          systemMessage:
            `claude-tweaks: pipeline run ${path.basename(ctx.runDir)} is active in worktree ${assigned}; ` +
            `allowing this commit because it comes from a different session. ` +
            `If this IS that pipeline's work, run it inside the worktree (git -C "${assigned}").`,
        },
      };
    }
    ctxLib.appendEvent(ctx.runDir, 'wd-deny', { expected: assigned, actual, session: caller || undefined, command: command.slice(0, 200) });
    const others = [...otherWorktrees.keys()];
    const othersNote = others.length ? ` Other active runs' worktrees: ${others.join(', ')}.` : '';
    return {
      exit: 0,
      json: {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `claude-tweaks working-directory discipline: this run's assigned worktree is ${assigned} but the commit targets ${actual}.` +
            othersNote +
            ` Re-run inside the worktree (cd "${assigned}") or use git -C "${assigned}". ` +
            `If this checkout is intentionally correct (e.g. finishing the branch), clear the assignment first: node "${pluginRoot()}/bin/hooks.js" close-run`,
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
Expected: PASS (all pre-existing tests + the 5 new `worktree-required:` tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/pre-tool-use.js tests/hooks-pre-tool-use.test.js
git commit -m "Add worktree-required policy gate to pre-tool-use.js"
```

---

### Task 4: Wire `hooks.json` matchers for Edit/Write/NotebookEdit

**Files:**
- Modify: `hooks/hooks.json`
- Modify: `tests/hooks-dispatcher.test.js`

**Interfaces:**
- Consumes: `bin/lib/hooks/pre-tool-use.js`'s `run(ctx)` from Task 3, invoked unchanged via `bin/hooks.js pre-tool-use`.
- Produces: nothing new for other tasks — this is the last task that changes runtime behavior.

- [ ] **Step 1: Write the failing tests**

Add to `tests/hooks-dispatcher.test.js` (after the existing tests):

```js
test('hooks.json registers PreToolUse matchers for Edit, Write, and NotebookEdit', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'));
  const matchers = config.hooks.PreToolUse.map((entry) => entry.matcher);
  assert.ok(matchers.includes('Edit'), 'expected an Edit matcher');
  assert.ok(matchers.includes('Write'), 'expected a Write matcher');
  assert.ok(matchers.includes('NotebookEdit'), 'expected a NotebookEdit matcher');
});

test('e2e: pre-tool-use CLI denies an Edit when worktree.always policy is set in the main checkout', () => {
  const project = gitRepo();
  fs.mkdirSync(path.join(project, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(project, '.claude-tweaks', 'policy.yml'), 'worktree.always: true\n');
  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(project, 'a.txt') } }),
    cwd: project,
  });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /"permissionDecision":"deny"/);
});

test('e2e: pre-tool-use CLI allows an Edit when worktree.always policy is not set', () => {
  const project = gitRepo();
  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(project, 'a.txt') } }),
    cwd: project,
  });
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.stdout, '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: The `hooks.json registers PreToolUse matchers...` test FAILS (no `Edit`/`Write`/`NotebookEdit` matchers exist yet). The two `e2e: pre-tool-use CLI...` tests already PASS — Task 3 already implemented the underlying logic; this task only adds the declarative harness wiring, so those two act as regression confirmation rather than new red tests.

- [ ] **Step 3: Write minimal implementation**

In `hooks/hooks.json`, in the `"PreToolUse"` array, add three new entries after the existing three `"Bash"` matcher blocks (immediately before the array's closing `]`):

```json
      {
        "matcher": "Edit",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-tool-use" }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-tool-use" }
        ]
      },
      {
        "matcher": "NotebookEdit",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-tool-use" }
        ]
      }
```

So the full `"PreToolUse"` array reads:

```json
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "if": "Bash(git commit *)", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-tool-use" }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "if": "Bash(git push *)", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-tool-use" }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "if": "Bash(git -C *)", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-tool-use" }
        ]
      },
      {
        "matcher": "Edit",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-tool-use" }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-tool-use" }
        ]
      },
      {
        "matcher": "NotebookEdit",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-tool-use" }
        ]
      }
    ],
```

Leave every other section of `hooks/hooks.json` untouched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: PASS (all pre-existing tests + the 3 new tests)

Then run the full suite to confirm no regressions anywhere:

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add hooks/hooks.json tests/hooks-dispatcher.test.js
git commit -m "Register PreToolUse matchers for Edit, Write, and NotebookEdit"
```

---

### Task 5: Advisory nudge in `session-start.js`

**Files:**
- Modify: `bin/lib/hooks/session-start.js`
- Modify: `tests/hooks-session-start.test.js`

**Interfaces:**
- Consumes: `isWorktreeAlwaysOn(repoRoot)` from Task 1; `repoRootFor(p)` / `isLinkedWorktree(p)` from Task 2.
- Produces: `run(ctx)` (unchanged exported shape) now also appends an advisory line to `additionalContext` when the policy is on and the session isn't yet isolated.

- [ ] **Step 1: Write the failing tests**

Add `const { execFileSync } = require('child_process');` to the top of `tests/hooks-session-start.test.js` (alongside the existing `fs`/`os`/`path` requires), then add these tests at the end of the file:

```js
function gitProject() {
  const dir = tmpProject();
  execFileSync('git', ['-C', dir, 'init', '-q']);
  return dir;
}
function withPolicy(repo, content) {
  fs.mkdirSync(path.join(repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude-tweaks', 'policy.yml'), content);
}

test('worktree.always nudge appears when policy is on and session is not yet isolated', () => {
  const project = gitProject();
  withPolicy(project, 'worktree.always: true\n');
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree\.always/);
  assert.match(out.json.hookSpecificOutput.additionalContext, /using-git-worktrees/);
});

test('worktree.always nudge is absent when policy is off', () => {
  const project = gitProject();
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /worktree\.always/);
  else assert.deepStrictEqual(out, {});
});

test('worktree.always nudge is absent when the session is already inside a linked worktree', () => {
  const project = gitProject();
  execFileSync('git', ['-C', project, 'commit', '--allow-empty', '-m', 'init', '-q']);
  withPolicy(project, 'worktree.always: true\n');
  execFileSync('git', ['-C', project, 'add', '.claude-tweaks/policy.yml']);
  execFileSync('git', ['-C', project, 'commit', '-m', 'policy', '-q']);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-wt-'));
  const wt = path.join(parent, 'wt');
  execFileSync('git', ['-C', project, 'worktree', 'add', '-q', wt, '-b', 'wt-branch']);
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: fs.realpathSync(wt) });
  if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /worktree\.always/);
  else assert.deepStrictEqual(out, {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-session-start.test.js`
Expected: FAIL — the `worktree.always nudge appears...` test fails (`out.json` is `undefined` since the current implementation never checks policy). The other two happen to already pass (nothing to detect), but keep them — they lock in the "absent" behavior against regressions once Step 3 lands.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `bin/lib/hooks/session-start.js` with:

```js
// bin/lib/hooks/session-start.js — A1: deps check + stale pipeline-run
// detection + advisory nudge toward worktree setup when the project's
// policy requires it.
'use strict';
const path = require('path');
const deps = require('../deps');
const ctxLib = require('./context');
const policy = require('../policy');
const wtDetect = require('./worktree-detect');

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
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}';
      parts.push(
        'claude-tweaks: unfinished pipeline run(s) detected under .claude-tweaks/pipelines/:\n' +
          lines.join('\n') +
          `\nReview {run}/decisions.md and staged/ to resume, or close a finished run with: node "${pluginRoot}/bin/hooks.js" close-run --run <dir>`,
      );
    }
  } catch { /* best-effort */ }
  try {
    const repoRoot = wtDetect.repoRootFor(ctx.cwd);
    if (repoRoot && policy.isWorktreeAlwaysOn(repoRoot) && !wtDetect.isLinkedWorktree(ctx.cwd)) {
      parts.push(
        'claude-tweaks: this project requires an isolated worktree for all work ' +
          '(policy: worktree.always in .claude-tweaks/policy.yml). Before making any edits, ' +
          'invoke /superpowers:using-git-worktrees to set one up.',
      );
    }
  } catch { /* best-effort */ }
  if (!parts.length) return {};
  return { json: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n\n') } } };
}

module.exports = { run };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-session-start.test.js`
Expected: PASS (all pre-existing tests + the 3 new tests)

Then: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/session-start.js tests/hooks-session-start.test.js
git commit -m "Add worktree.always advisory nudge to session-start.js"
```

---

### Task 6: Adopt `worktree.always` for this repo

**Files:**
- Create: `.claude-tweaks/policy.yml`

**Interfaces:**
- Consumes: the full mechanism from Tasks 1-5.
- Produces: nothing new for other tasks — this is the repo's own opt-in.

- [ ] **Step 1: Create the policy file**

Create `.claude-tweaks/policy.yml`:

```yaml
worktree.always: true
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS (this repo's own `.claude-tweaks/policy.yml` has no effect on the test suite, since every test uses isolated `mkdtemp` fixtures rather than this real path)

- [ ] **Step 3: Confirm the real committed policy file is readable by the real code**

**Correction (superseding an earlier version of this step):** an end-to-end "does the gate deny against the real main checkout" diagnostic is structurally impossible to run before this branch merges — the main checkout has no `.claude-tweaks/policy.yml` on disk until the merge lands (the file only exists inside this worktree pre-merge), so pointing any diagnostic at the main checkout's path will always come back empty/allow, no matter how correct the mechanism is. Do not attempt that diagnostic and do not report a deny result for it — the mechanism's correctness against exactly this scenario (policy file present in a plain, non-worktree repo → Edit/Write/NotebookEdit/commit denied) is already fully proven by the passing test suites from Tasks 1-5 (`tests/policy.test.js`, `tests/hooks-worktree-detect.test.js`, `tests/hooks-pre-tool-use.test.js`, `tests/hooks-session-start.test.js`). Full live proof against the real main checkout naturally happens the first time anyone works in this repo after merge — that's the point of the feature, not something provable in advance.

What IS achievable and worth checking pre-merge: confirm the actual file just created in Step 1 (not a synthetic test fixture) is well-formed and parses correctly through the real reader. From this worktree's root, run:

```bash
node -e "console.log(require('./bin/lib/policy').isWorktreeAlwaysOn(process.cwd()))"
```

Expected output: `true`. This proves the exact bytes committed in Step 1 satisfy `bin/lib/policy.js`'s regex — the one thing genuinely specific to this task that the fixture-based unit tests can't cover, since they write their own synthetic policy files rather than reading this real one.

- [ ] **Step 4: Commit**

```bash
git add .claude-tweaks/policy.yml
git commit -m "Adopt worktree.always policy for this repo"
```

---

### Task 7: Documentation updates

**Files:**
- Modify: `CLAUDE.md`
- Modify: `skills/_shared/git-discipline.md`
- Modify: `skills/build/SKILL.md`
- Modify: `skills/flow/manifesto.md`

**Interfaces:** None — documentation only, no code.

- [ ] **Step 1: Update `CLAUDE.md`'s Hooks section**

Find this line (in the `### Hooks` section):

```
- **Tiered posture per `_shared/auto-mode-contract.md`:** block (E1 wrong-checkout commit only), warn (non-blocking systemMessage), inform (SessionStart additionalContext), log (append to the run dir's `events.jsonl`).
- **Project-agnostic by construction:** modules key off plugin-owned state (`$PIPELINE_RUN_DIR`, `.claude-tweaks/pipelines/`), never off project structure. E1/E2/E3 no-op without a resolved run dir.
```

Replace with:

```
- **Tiered posture per `_shared/auto-mode-contract.md`:** block (E1 wrong-checkout commit; the `worktree.always` policy gate on Edit/Write/NotebookEdit/commit), warn (non-blocking systemMessage), inform (SessionStart additionalContext), log (append to the run dir's `events.jsonl`).
- **Project-agnostic by construction:** modules key off plugin-owned state (`$PIPELINE_RUN_DIR`, `.claude-tweaks/pipelines/`, `.claude-tweaks/policy.yml`), never off project structure. E1/E2/E3 no-op without a resolved run dir — the `worktree.always` policy gate is the one PreToolUse check that is deliberately run-independent, since its job is to require a worktree even before any pipeline run exists.
```

Then find this line (in the `## Structure` section):

```
bin/lib/                          → Shared Node helpers (color, deps, coordination, issue claims + ingestion)
```

Replace with:

```
bin/lib/                          → Shared Node helpers (color, deps, coordination, issue claims + ingestion, policy)
```

- [ ] **Step 2: Update `skills/_shared/git-discipline.md`**

Find this paragraph (near the top of the file):

```
During worktree-mode pipeline runs, the wrong-checkout commit rule is mechanically enforced by the plugin's PreToolUse hook (E1) — a denied commit names the assigned worktree; clear the assignment with `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run` when legitimately finishing the branch. Enforcement is scoped to the session that recorded the worktree: a commit from a different session (e.g. unrelated fix work in the main checkout while the pipeline runs elsewhere) is allowed with a warning, not denied. Run `close-run` only from the session that owns the run or at the merge/finish handoff — closing another session's live run ends its enforcement and event logging mid-flight.
```

Add this new paragraph immediately after it:

```

Independent of any pipeline run, a project can opt into `worktree.always: true` in `.claude-tweaks/policy.yml` — when set, the same PreToolUse hook denies any `Edit`, `Write`, `NotebookEdit`, or `git commit` whose target isn't already inside a linked git worktree, even before `/build` or `/flow` has ever run. Unlike E1, this check needs no recorded run state; it fires from the first prompt of a session. Set up the worktree first via `/superpowers:using-git-worktrees`, then retry the edit inside it.
```

- [ ] **Step 3: Update `skills/build/SKILL.md`**

Find this line:

```
| **Git** | `worktree` (isolated branch) / `current-branch` (direct commits) | `worktree` |
```

Leave the table row itself unchanged, but add this line immediately after the table (before the `Read \`build-options.md\`...` paragraph):

```

When `.claude-tweaks/policy.yml` sets `worktree.always: true`, the Git axis has only one value: `current-branch` is not offered and is rejected if passed explicitly — the mechanical PreToolUse gate would deny any edit outside a worktree regardless (see `_shared/git-discipline.md`).
```

Then find this line:

```
**current-branch**: Commit directly on the current branch. No isolation.
```

Replace with:

```
**current-branch**: Commit directly on the current branch. No isolation. Unavailable when `.claude-tweaks/policy.yml` sets `worktree.always: true` — the mechanical PreToolUse gate denies edits outside a worktree regardless of what this lever says.
```

- [ ] **Step 4: Update `skills/flow/manifesto.md`**

Find this line (end of the "Compute recommendations" section):

```
For each lever, record both the recommended value AND its source so the user can see why each value was suggested.
```

Add this new paragraph immediately after it:

```

**Git lever override.** When `.claude-tweaks/policy.yml` sets `worktree.always: true`, the Git lever is forced to `worktree` regardless of CLI args or defaults above — `current-branch` is never offered or accepted. This is enforced mechanically by a `PreToolUse` gate (see `_shared/git-discipline.md`), so a stale/overridden config value would simply get every edit denied; the Manifesto short-circuits to `worktree` here to avoid presenting a choice that can't actually be honored.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md skills/_shared/git-discipline.md skills/build/SKILL.md skills/flow/manifesto.md
git commit -m "Document the worktree.always policy gate across hook and pipeline docs"
```

---

## Self-Review Notes

- **Spec coverage:** every component in the design spec's Components table maps to a task — `bin/lib/policy.js` (Task 1), `bin/lib/hooks/worktree-detect.js` (Task 2), `pre-tool-use.js` extension (Task 3), `hooks.json` (Task 4), `session-start.js` extension (Task 5), this repo's `policy.yml` (Task 6), doc updates (Task 7). All edge cases from the spec (not-a-repo, submodule, new-file Write, cross-repo target, untouched push/read-only-Bash) have explicit test coverage in Tasks 2-3.
- **Bootstrapping hazard:** flagged explicitly as a Global Constraint — the plan must run inside a worktree from the start, since Task 6 activates a gate that would otherwise deny the very edits needed to finish the plan.
- **Type/signature consistency:** `isWorktreeAlwaysOn(repoRoot)`, `repoRootFor(p)`, and `isLinkedWorktree(p)` are defined once in Tasks 1-2 and consumed with the same names/signatures in Tasks 3 and 5 — no renaming drift.
