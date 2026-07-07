# Closing-Keyword Safety Net Implementation Plan (Phase 5 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a commit-time, warn-tier check to `bin/lib/hooks/post-tool-use.js` that fires when a `git commit` references a bare `#N` issue number without a recognized GitHub closing keyword (`Fixes`/`Closes`/`Resolves`) immediately before it — the exact gap that let a real fix commit (`Addresses #306, #305, ...`) leave 17 already-fixed issues showing "open." This is Phase 5 of the 5-phase design in `docs/superpowers/specs/2026-07-07-code-health-rename-risk-triage-design.md`, the final phase, building on Phases 1-4 (all merged to `main`). Unlike Phases 1-4, this check is harness-wide, not code-health-specific.

**Architecture:** A new function inside the existing `bin/lib/hooks/post-tool-use.js` module (this repo's hooks convention is one module per event, not one module per check — E2's commit-breadcrumb logic already lives here). Reuses `gitTargets()` from `git-command.js` (the same call E2 already makes) to detect a commit and its target directory, then reads the actual committed message back via `git log -1 --format=%B` — the same "ask git, don't reparse the shell" approach `shortHead()` already uses for the commit hash, avoiding the need to parse a message out of the raw Bash command text (this repo's own commit convention uses a HEREDOC, which is brittle to parse from shell text). Deliberately not gated on `ctx.runDir`, unlike E2's breadcrumb logic — the motivating case is exactly a commit made outside any pipeline run.

**Tech Stack:** Node 18+ (`node --test`), zero new dependencies.

## Global Constraints

- Run `npm test` after every task; it must be 100% green (the one known pre-existing flaky test, `tests/statusline.test.js`'s "render under 500ms," may intermittently fail under system load — re-run in isolation if it's the only failure).
- This check is non-blocking (warn tier) — the commit has already happened by the time `PostToolUse` fires; the hook can only suggest, never prevent or undo.
- The check applies to any `#N` reference regardless of which tool filed the underlying issue (`code-health`, `harness-health`, or a human) — it is not scoped to this design's own label conventions.
- E2's existing breadcrumb behavior (gated on `ctx.runDir`, logs to `events.jsonl`) must be preserved exactly as-is — this task adds a second, independent check to the same `run()` function, it does not restructure or weaken the first one.

---

### Task 1: Add the closing-keyword check to `post-tool-use.js`

**Files:**
- Modify: `bin/lib/hooks/post-tool-use.js`
- Create: `tests/hooks-post-tool-use-closing-keyword.test.js`

**Interfaces:**
- Consumes: `gitTargets` (unchanged, from `./git-command`).
- Produces: `run(ctx)` now performs two independent checks — E2's existing runDir-gated breadcrumb logging (unchanged), and a new ungated closing-keyword check. When the closing-keyword check finds a bare, unclosed issue reference in the just-made commit's message, `run()` returns `{ json: { systemMessage: '<warning text>' } }` (same shape `subagent-stop.js` already uses for its own warn-tier finding) instead of `{}`. No new exports — `run` is still the module's only export.

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks-post-tool-use-closing-keyword.test.js`:

```js
// tests/hooks-post-tool-use-closing-keyword.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const post = require('../bin/lib/hooks/post-tool-use');

function gitRepoWithMessage(message) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ck-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', message, '-q'], {
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  return fs.realpathSync(dir);
}

function runPostToolUse(repo, runDir = null) {
  return post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "..."' }, cwd: repo },
    runDir,
    runState: null,
    cwd: repo,
  });
}

test('warns when a commit references an issue without a recognized closing keyword', () => {
  const repo = gitRepoWithMessage('Addresses #306, #305, #304 — bounded-concurrency fixes');
  const out = runPostToolUse(repo);
  assert.ok(out.json && typeof out.json.systemMessage === 'string', 'expected a systemMessage warning');
  assert.match(out.json.systemMessage, /closing keyword/i);
});

test('does not warn when the commit uses "Fixes"', () => {
  const repo = gitRepoWithMessage('Fixes #42');
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('does not warn when the commit uses "Closes" or "Resolves" case-insensitively', () => {
  const repo1 = gitRepoWithMessage('closes #5');
  assert.deepStrictEqual(runPostToolUse(repo1), {});
  const repo2 = gitRepoWithMessage('RESOLVES #5');
  assert.deepStrictEqual(runPostToolUse(repo2), {});
});

test('does not warn when the commit has no issue reference at all', () => {
  const repo = gitRepoWithMessage('Just a normal commit with no issue mention');
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('fires with no runDir set, unlike E2\'s breadcrumb logic', () => {
  const repo = gitRepoWithMessage('Addresses #7');
  const out = runPostToolUse(repo, null);
  assert.match(out.json.systemMessage, /closing keyword/i);
});

test('fires even when a runDir IS set (both checks run independently)', () => {
  const repo = gitRepoWithMessage('Addresses #7');
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ck-run-'));
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "..."' }, cwd: repo },
    runDir, runState: { status: 'active' }, cwd: repo,
  });
  assert.match(out.json.systemMessage, /closing keyword/i);
  // E2's breadcrumb still logs independently, unaffected by the new check:
  const events = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.strictEqual(events[0].type, 'commit');
});

test('does not warn when the Bash command is not a git commit', () => {
  const repo = gitRepoWithMessage('Addresses #7'); // real repo state irrelevant — command isn't a commit
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: repo },
    runDir: null, runState: null, cwd: repo,
  });
  assert.deepStrictEqual(out, {});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test tests/hooks-post-tool-use-closing-keyword.test.js
```

Expected: FAIL — the closing-keyword check doesn't exist yet, so every commit (including "Addresses #306...") produces `{}`.

- [ ] **Step 3: Implement the check in `post-tool-use.js`**

Replace the file in full:

```js
// bin/lib/hooks/post-tool-use.js — E2: commit breadcrumbs (log tier) + closing-keyword check (warn tier).
'use strict';
const { execFileSync } = require('child_process');
const { gitTargets } = require('./git-command');
const ctxLib = require('./context');

// Hash reflects HEAD at hook time — PostToolUse has no success signal, so a failed commit logs the previous HEAD.
function shortHead(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
  } catch { return null; }
}

// Reads back the just-made commit's full message (subject + body) — avoids parsing
// the message out of the raw Bash command text, which this repo's own HEREDOC-based
// commit convention (`git commit -m "$(cat <<'EOF' ... EOF)"`) makes brittle. Same
// "ask git, don't reparse the shell" approach shortHead() already uses.
function commitMessage(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%B'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    });
  } catch { return null; }
}

// A recognized GitHub closing keyword immediately preceding a bare "#123" auto-closes
// that issue when the commit reaches the repository's default branch. Case-insensitive;
// covers every form GitHub recognizes (fix/fixes/fixed, close/closes/closed,
// resolve/resolves/resolved).
const CLOSING_KEYWORD_RE = /\b(?:fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+#\d+/i;
const BARE_ISSUE_REF_RE = /#\d+/g;

// Deliberately NOT gated on ctx.runDir, unlike the breadcrumb logic below — the
// motivating case is exactly a commit made outside any pipeline run (ad hoc fix
// work that references an issue number without going through /specify -> /build
// -> /wrap-up, where the closing-keyword carrier-commit mechanism already exists).
// Harness-wide, not code-health-specific: fires for any bare issue reference,
// including harness-health-labelled or human-filed issues.
function checkClosingKeyword(command, cwd) {
  const commitTargets = gitTargets(command, cwd).filter((t) => t.action === 'commit');
  for (const target of commitTargets) {
    const message = commitMessage(target.dir);
    if (!message) continue;
    const refs = message.match(BARE_ISSUE_REF_RE);
    if (!refs) continue;
    const hasUnclosedRef = refs.some((ref) => {
      const idx = message.indexOf(ref);
      const before = message.slice(Math.max(0, idx - 20), idx + ref.length);
      return !CLOSING_KEYWORD_RE.test(before);
    });
    if (hasUnclosedRef) {
      return {
        json: {
          systemMessage:
            'claude-tweaks: this commit references an issue number without a recognized GitHub ' +
            'closing keyword (Fixes/Closes/Resolves) immediately before it — it will not auto-close ' +
            'that issue when merged. If this commit fully resolves the issue, consider rewording ' +
            '(e.g. "Fixes #123").',
        },
      };
    }
  }
  return null;
}

function run(ctx) {
  const command = ctx.input.tool_name === 'Bash' ? (ctx.input.tool_input && ctx.input.tool_input.command) : null;
  const hasCommand = typeof command === 'string' && !!command;

  // E2: commit breadcrumbs (log tier) — gated on a resolved pipeline run, unchanged.
  if (ctx.runDir && hasCommand) {
    for (const target of gitTargets(command, ctx.cwd)) {
      ctxLib.appendEvent(ctx.runDir, 'commit', {
        action: target.action,
        dir: target.dir,
        hash: target.action === 'commit' ? shortHead(target.dir) : undefined,
      });
    }
  }

  // Closing-keyword check (warn tier) — deliberately NOT gated on ctx.runDir.
  if (hasCommand) {
    const warning = checkClosingKeyword(command, ctx.cwd);
    if (warning) return warning;
  }

  return {};
}

module.exports = { run };
```

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
node --test tests/hooks-post-tool-use-closing-keyword.test.js
```

Expected: PASS, all 7 tests.

- [ ] **Step 5: Run the existing `post-tool-use.js` tests to confirm E2's behavior is unchanged**

```bash
node --test tests/hooks-log-modules.test.js
```

Expected: PASS, all 5 tests (the 2 pre-existing `post-tool-use` tests plus the 3 `subagent-stop` tests in the same file) — confirms this task did not alter E2's breadcrumb behavior or its `events.jsonl` output shape.

- [ ] **Step 6: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only). `package.json`'s test script globs `tests/*.test.js` at the root via the bare `tests/` argument to `node --test`, so the new file is picked up automatically — no script change needed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add commit-time closing-keyword safety net to post-tool-use.js (warn tier, harness-wide)"
```

---

### Task 2: Document the check in CLAUDE.md's Hooks convention section

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the Hooks section's tiered-posture description and its module list reflect the new check, so the convention documentation stays accurate for future contributors reading CLAUDE.md rather than the source.

- [ ] **Step 1: Update the "Project-agnostic by construction" bullet's run-independence claim**

This bullet currently states that `worktree.always` is "the ONE PreToolUse check that is deliberately run-independent" — that claim is scoped to PreToolUse and stays true (Task 1's new check is a PostToolUse check, not PreToolUse), but the bullet's first clause ("E1/E2/E3 no-op without a resolved run dir") is about `post-tool-use.js` too, and would now be incomplete without noting the one exception living there:

```
old_string:
- **Project-agnostic by construction:** modules key off plugin-owned state (`$PIPELINE_RUN_DIR`, `.claude-tweaks/pipelines/`, `.claude-tweaks/policy.yml`), never off project structure. E1/E2/E3 no-op without a resolved run dir — the `worktree.always` policy gate is the one PreToolUse check that is deliberately run-independent, since its job is to require a worktree even before any pipeline run exists.
```
```
new_string:
- **Project-agnostic by construction:** modules key off plugin-owned state (`$PIPELINE_RUN_DIR`, `.claude-tweaks/pipelines/`, `.claude-tweaks/policy.yml`), never off project structure. E1/E2/E3 no-op without a resolved run dir — the `worktree.always` policy gate is the one PreToolUse check that is deliberately run-independent, since its job is to require a worktree even before any pipeline run exists. `post-tool-use.js`'s closing-keyword check (warn tier) is the analogous exception on the PostToolUse side — it fires on any `git commit` regardless of run-dir state, since the gap it catches (a fix commit made outside the structured `/specify` → `/build` → `/wrap-up` pipeline, with no closing keyword) is exactly a commit that would never resolve a run dir in the first place.
```

- [ ] **Step 2: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only) — this task touches only a `.md` file.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Document the closing-keyword check in CLAUDE.md's Hooks conventions"
```

---

## What this plan does not cover

This is the final phase of the 5-phase code-health design. There is no further phase.
