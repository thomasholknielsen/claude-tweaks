# Worktree-Isolation-Pin Post-Teardown Backstop Implementation Plan

> **Correction (#1865):** This plan names the new handler `checkPostTeardownPin` throughout (lines 7, 29, 128, 172, 208-209, 224, 250, 269); it shipped as `checkPostTeardownReanchor` (`plugin/bin/lib/hooks/post-tool-use.js:578`). Left as originally written per this repo's historical-plan-artifact convention (`docs/superpowers/plans/` is a permanent historical record, per `docs/incident-log.md`) — substitute the shipped name mentally when reading the body below.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a worktree teardown (`ExitWorktree` action:remove, or the sanctioned own-cwd `git worktree remove` Bash call), warn the agent — via a new PostToolUse `additionalContext` nudge — to verify its git context before trusting it, since Claude Code's harness-native worktree-isolation pin can persist past a successful removal and this plugin has no lever to clear it directly. Also harden `skills/feedback/SKILL.md` Step 3's self-reference check so it degrades to a `plugin.json`-derived fallback instead of throwing when git context is broken.

**Architecture:** This repo's hooks can only observe/react to tool calls (PreToolUse: allow/deny/warn; PostToolUse: log or inject `additionalContext`) — they cannot mutate harness-internal pin state. The fix mirrors the existing EnterWorktree staleness backstop pattern in `plugin/bin/lib/hooks/post-tool-use.js` (warn tier, `additionalContext`, gated log-tier event): a new `checkPostTeardownPin` handler fires after a teardown call, reusing `pre-tool-use.js`'s exported `teardownTargets`/`GATE_COVERAGE.teardownTools` for target-shape detection rather than re-deriving it. `hooks/hooks.json` currently has no `PostToolUse` matcher for `ExitWorktree` and no `Bash(git worktree *)` `if`-predicate in the `PostToolUse.Bash` group — both are added so the new handler isn't dead code at the registration seam (the exact `#70` pattern `tests/hooks-gate-coverage.test.js` already guards for `EnterWorktree`).

**Tech Stack:** Node.js (`node --test`), no external deps.

**Spec:** `.claude-tweaks/pipelines/2026-09-04T095553-record-703/work/703-spec.md`

## Global Constraints

- No plugin code sets or clears Claude Code's native "worktree isolation pin" — confirmed by grep, no hits anywhere in this repo outside issue #703's own text. Any fix here is instructional (context injection to the agent), never structural.
- `npm test` (full suite) and `tests/hooks-gate-coverage.test.js` / `tests/teardown-gate.test.js` must still pass, with no regression to the existing own-cwd deny behavior for raw Bash `git worktree remove`.
- Windows dev box: per this repo's `MEMORY.md`, run individual test files directly (`node --test path/to/file.test.js`) rather than the full `npm test` glob when isolating a single suite's result.

---

### Task 1: Post-teardown pin backstop handler + unit tests

**Files:**
- Modify: `plugin/bin/lib/hooks/post-tool-use.js`
- Create: `tests/hooks-post-tool-use-teardown-pin.test.js`

**Interfaces:**
- Consumes: `teardownTargets(ctx)` and `GATE_COVERAGE` from `plugin/bin/lib/hooks/pre-tool-use.js` (both already exported — confirmed via `module.exports` in that file). `ctxLib.appendEvent(runDir, type, data, attribution)` from `./context` (already imported in `post-tool-use.js` as `ctxLib`).
- Produces: `checkPostTeardownPin(ctx)` — returns `null` (no-op) or `{ json: { systemMessage: string } }` (warn tier), called from `run(ctx)`. `logPostTeardownPinEvent(ctx, data)` — log-tier helper, gated on `ctx.ownedRun.dir`, appends an event of type `'post-teardown-pin'`.

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks-post-tool-use-teardown-pin.test.js`:

```js
// tests/hooks-post-tool-use-teardown-pin.test.js
//
// #703: after a worktree teardown (ExitWorktree action:remove, or the
// sanctioned own-cwd `git worktree remove` Bash call), Claude Code's own
// harness-native "worktree isolation pin" can remain anchored to the removed
// path for the rest of the session, permanently blocking further
// git-dependent commands. This plugin owns no lever to clear that pin
// directly (confirmed by grep — no hits for "isolation pin" anywhere in this
// repo outside the issue's own text), so the fix mirrors the EnterWorktree
// staleness backstop (#307): a PostToolUse warn-tier nudge telling the agent
// to verify its git context, not a structural fix.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const post = require('../plugin/bin/lib/hooks/post-tool-use');
const { gitRepo, harnessWorktreeOf } = require('./helpers/git-fixtures');

function readEvents(runDir) {
  const raw = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('warns after a successful ExitWorktree action:remove, even though the worktree directory is already gone', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  // Simulate the removal having already happened by the time PostToolUse
  // fires — the directory no longer exists at `wt`, exactly like a real
  // successful ExitWorktree(remove) leaves it. ctx.cwd still reports the
  // now-gone path, matching this file's EnterWorktree-handler convention of
  // ctx.cwd reflecting the tool call's own cwd rather than any post-call state.
  fs.rmSync(wt, { recursive: true, force: true });
  const input = { tool_name: 'ExitWorktree', tool_input: { action: 'remove' }, cwd: wt };
  const out = post.run({ input, cwd: wt });
  assert.ok(out.json && typeof out.json.systemMessage === 'string', 'expected a systemMessage warning');
  assert.match(out.json.systemMessage, /worktree isolation pin|git-context pin/i);
  assert.match(out.json.systemMessage, /703/);
});

test('does not warn for an ExitWorktree call that is not a removal (action:create)', () => {
  const main = gitRepo();
  const input = { tool_name: 'ExitWorktree', tool_input: { action: 'create' }, cwd: main };
  const out = post.run({ input, cwd: main });
  assert.deepStrictEqual(out, {});
});

test('warns after a sanctioned own-cwd `git worktree remove` Bash call', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  fs.rmSync(wt, { recursive: true, force: true });
  const input = { tool_name: 'Bash', tool_input: { command: `git worktree remove ${wt}` }, cwd: main };
  const out = post.run({ input, cwd: main });
  assert.ok(out.json && typeof out.json.systemMessage === 'string', 'expected a systemMessage warning');
  assert.match(out.json.systemMessage, /worktree isolation pin|git-context pin/i);
});

test('does not fire for an unrelated Bash command', () => {
  const main = gitRepo();
  const input = { tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: main };
  const out = post.run({ input, cwd: main });
  assert.deepStrictEqual(out, {});
});

test('does not fire for a tool other than ExitWorktree/Bash', () => {
  const main = gitRepo();
  const out = post.run({ input: { tool_name: 'EnterWorktree', cwd: main }, cwd: main });
  assert.deepStrictEqual(out, {});
});

test('logs a post-teardown-pin event when a run dir is owned', () => {
  const main = gitRepo();
  const wt = harnessWorktreeOf(main);
  fs.rmSync(wt, { recursive: true, force: true });
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-teardown-pin-run-'));
  const input = { tool_name: 'ExitWorktree', tool_input: { action: 'remove' }, cwd: wt };
  post.run({ input, cwd: wt, ownedRun: { dir: runDir } });
  const events = readEvents(runDir).filter((e) => e.type === 'post-teardown-pin');
  assert.strictEqual(events.length, 1);
});

test('never throws on an unusable cwd', () => {
  const input = { tool_name: 'ExitWorktree', tool_input: { action: 'remove' }, cwd: '/this/path/does/not/exist/at/all' };
  const out = post.run({ input, cwd: '/this/path/does/not/exist/at/all' });
  assert.deepStrictEqual(out, {});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks-post-tool-use-teardown-pin.test.js`
Expected: FAIL — `checkPostTeardownPin` does not exist yet, so `post.run` never returns a `systemMessage` for any of the new fixtures (first three tests fail on the `assert.ok`/`assert.match` calls; the "does not fire" tests may spuriously pass already, but re-run once implementation lands to confirm they still pass for the right reason).

- [ ] **Step 3: Implement the handler**

In `plugin/bin/lib/hooks/post-tool-use.js`, add a new import near the top (after the existing `worktree-reap` import, so the require order still reads newest-dependency-last):

```js
// Reused for the post-teardown pin backstop below (#703) — teardownTargets'
// Bash-sourced branch parses the command STRING with no filesystem access,
// so it still resolves correctly even after the worktree directory is
// already gone by the time this PostToolUse handler runs.
const { teardownTargets, GATE_COVERAGE: PRE_GATE_COVERAGE } = require('./pre-tool-use');
```

Then, immediately after the `checkWorktreeStaleness`/`logWorktreeStalenessEvent` block (after the closing `}` of `checkWorktreeStaleness`, before the `// Log-tier breadcrumb, gated on ctx.ownedRun.dir exactly like\n// logWorktreeStalenessEvent above — the AskUserQuestion analogue.` comment), add:

```js
// Post-teardown pin backstop (#703, warn tier). This repo's hooks cannot
// clear Claude Code's own harness-native "worktree isolation pin" — grep
// confirms no plugin code sets or reads it — so, mirroring the
// EnterWorktree staleness backstop above, the only lever here is
// instructional: after a teardown tool call completes, warn the agent to
// verify its git context before trusting it.
//
// ExitWorktree detection deliberately does NOT reuse teardownTargets'
// 'exitworktree' branch: that branch calls toplevel(ctx.cwd) to resolve the
// removed path via `git rev-parse --show-toplevel`, which requires the
// directory to still exist — true at PreToolUse time (before removal),
// false once this PostToolUse handler runs (after a successful remove).
// Detecting the call SHAPE needs no filesystem access, so it's checked
// directly against the same GATE_COVERAGE.teardownTools constant
// teardownTargets itself branches on (kept load-bearing there, not
// duplicated as a literal).
//
// The Bash-sourced case is different: teardownTargets' bash branch parses
// the command STRING, not the filesystem, so it resolves correctly even
// after the directory is already gone — reused as-is here rather than
// re-deriving the git-worktree-remove shape a second time.
function logPostTeardownPinEvent(ctx, data) {
  const ownedRun = ctx.ownedRun || {};
  if (!ownedRun.dir) return;
  ctxLib.appendEvent(ownedRun.dir, 'post-teardown-pin', data, ownedRun.attribution);
}

function checkPostTeardownPin(ctx) {
  try {
    const toolName = ctx.input && ctx.input.tool_name;
    const toolInput = ctx.input && ctx.input.tool_input;
    const isExitWorktreeRemove = PRE_GATE_COVERAGE.teardownTools.includes(toolName) &&
      !!toolInput && toolInput.action === 'remove';
    const bashTargets = toolName === 'Bash' ? teardownTargets(ctx) : [];
    if (!isExitWorktreeRemove && bashTargets.length === 0) return null;

    logPostTeardownPinEvent(ctx, {
      source: isExitWorktreeRemove ? 'exitworktree' : 'bash',
      bashTargetCount: bashTargets.length,
    });

    return {
      json: {
        systemMessage:
          'claude-tweaks: a worktree teardown just completed. Claude Code\'s own git-context pin ' +
          'is harness-native — this plugin cannot observe or clear it (record #703) — and can remain ' +
          'anchored to the removed worktree for the rest of this session, silently blocking every ' +
          'further git-dependent command. Verify now: run `pwd` and `git rev-parse --show-toplevel`; ' +
          'if either errors or still resolves inside the removed worktree, re-anchor to $RUN_ROOT ' +
          '(or the main checkout) before issuing any further git-dependent command.',
      },
    };
  } catch {
    return null; // never break a session over a nudge
  }
}
```

Then wire it into `run(ctx)`, immediately after the existing `worktreeStalenessNudge` block and before `return {};`:

```js
  // Post-teardown pin backstop (warn tier) — deliberately NOT gated on
  // ctx.runDir (matches this file's other nudges); its own log-tier
  // breadcrumb (inside checkPostTeardownPin) IS gated on ctx.ownedRun.dir.
  const postTeardownPinNudge = checkPostTeardownPin(ctx);
  if (postTeardownPinNudge) return postTeardownPinNudge;

  return {};
}
```

(Replace the existing bare `return {};\n}` at the end of `run()` with the block above — the new nudge check goes before the final `return {};`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-post-tool-use-teardown-pin.test.js`
Expected: PASS — all 7 tests green.

Run: `node --test tests/hooks-post-tool-use-worktree-staleness.test.js`
Expected: PASS — confirms the new handler didn't regress the existing EnterWorktree staleness backstop (in particular the "does not fire for a tool other than EnterWorktree" test, which passes `tool_name: 'ExitWorktree'` and must still return `{}` from `checkWorktreeStaleness`, though it may now also flow through `checkPostTeardownPin` — verify that test's fixture uses `tool_input` without `action: 'remove'` so `checkPostTeardownPin` also no-ops for it; if it does supply `action: 'remove'`, confirm the combined `out` still deep-equals `{}` only if that specific fixture's `tool_input.action` isn't `'remove'` — re-read the fixture before assuming).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/hooks/post-tool-use.js tests/hooks-post-tool-use-teardown-pin.test.js
git commit -m "Add post-teardown pin backstop warning worktree isolation may persist (refs #703)"
```

---

### Task 2: Register the new PostToolUse matchers in hooks.json + coverage test

**Files:**
- Modify: `plugin/hooks/hooks.json`
- Modify: `tests/hooks-gate-coverage.test.js`

**Interfaces:**
- Consumes: nothing new — reads the same `hooks.hooks.PostToolUse` array the existing `EnterWorktree` matcher-group test already reads.
- Produces: nothing new — this task only adds JSON matcher entries and one new test.

- [ ] **Step 1: Write the failing test**

In `tests/hooks-gate-coverage.test.js`, add (after the existing `'PostToolUse carries an EnterWorktree matcher group...'` test, before `'an unlisted Bash write shape is genuinely not detected'`):

```js
// #703: checkPostTeardownPin hard-gates on tool_name === 'ExitWorktree' (for
// the action:remove shape) and on a Bash(git worktree remove ...) command —
// a PostToolUse group without matching matchers/predicates makes it dead at
// the registration seam, the same #70 dead-branch shape the EnterWorktree
// test above guards against.
test('PostToolUse carries an ExitWorktree matcher group for the post-teardown pin backstop', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  const group = hooks.hooks.PostToolUse.find((e) => e.matcher === 'ExitWorktree');
  assert.ok(group, 'PostToolUse has no ExitWorktree matcher group — the post-teardown pin backstop (#703) never runs for ExitWorktree');
  assert.ok(group.hooks.some((h) => typeof h.command === 'string' && h.command.includes('post-tool-use')),
    'the ExitWorktree PostToolUse group must invoke hooks.js post-tool-use');
});

test('PostToolUse\'s Bash group carries a `git worktree *` if-predicate for the post-teardown pin backstop (#703)', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  const bashPost = hooks.hooks.PostToolUse.find((e) => e.matcher === 'Bash');
  assert.ok(bashPost, 'PostToolUse must carry a Bash matcher group');
  const ifs = bashPost.hooks.map((h) => h.if).filter(Boolean);
  assert.ok(ifs.includes('Bash(git worktree *)'),
    'PostToolUse\'s Bash group is missing an "if": "Bash(git worktree *)" predicate — checkPostTeardownPin would never spawn for a raw `git worktree remove` Bash call');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks-gate-coverage.test.js`
Expected: FAIL — both new tests fail (`hooks.json` has no `ExitWorktree` group in `PostToolUse` and no `git worktree *` predicate in `PostToolUse.Bash`).

- [ ] **Step 3: Update hooks.json**

In `plugin/hooks/hooks.json`, add `"if": "Bash(git worktree *)"` as a new entry inside the existing `PostToolUse` → `matcher: "Bash"` group's `hooks` array (after the last existing entry, `Bash(env -*)`):

```json
          { "type": "command", "if": "Bash(env -*)", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" post-tool-use" },
          { "type": "command", "if": "Bash(git worktree *)", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" post-tool-use" }
```

(Note the comma moves to the newly-second-to-last line.)

Add a new matcher group for `ExitWorktree` in `PostToolUse`, immediately after the existing `EnterWorktree` group (before the closing `]` of `PostToolUse`):

```json
      {
        "matcher": "EnterWorktree",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" post-tool-use" }
        ]
      },
      {
        "matcher": "ExitWorktree",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" post-tool-use" }
        ]
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-gate-coverage.test.js`
Expected: PASS — all tests in the file, including the two new ones.

Run: `node -e "JSON.parse(require('fs').readFileSync('plugin/hooks/hooks.json', 'utf8')); console.log('valid json')"`
Expected: `valid json` — confirms the manual edit didn't break JSON syntax.

- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/hooks.json tests/hooks-gate-coverage.test.js
git commit -m "Register PostToolUse matchers for the teardown pin backstop (refs #703)"
```

---

### Task 3: Feedback skill self-reference check — plugin.json fallback

**Files:**
- Modify: `plugin/skills/feedback/SKILL.md`

**Interfaces:**
- Consumes: `plugin/.claude-plugin/plugin.json`'s `repository` field (confirmed present: `"repository": "https://github.com/thomasholknielsen/claude-tweaks"`).
- Produces: nothing new (this is a skill-instruction/prose change, not code — `/claude-tweaks:feedback` is an LLM-followed procedure, not a Node module).

- [ ] **Step 1: Read current Step 3 text**

Current text (`plugin/skills/feedback/SKILL.md`, Step 3):

```markdown
### Step 3: Self-reference check

​```bash
git remote get-url origin
​```

If the remote resolves to the claude-tweaks repository itself, **stop**. Report
that the learning belongs in this project's own records and re-run the
classifier from rule 4 per `_shared/learning-routing.md`. Do not file.
```

- [ ] **Step 2: Replace with a fallback-aware version**

Replace that block with:

```markdown
### Step 3: Self-reference check

​```bash
git remote get-url origin
​```

If the remote resolves to the claude-tweaks repository itself, **stop**. Report
that the learning belongs in this project's own records and re-run the
classifier from rule 4 per `_shared/learning-routing.md`. Do not file.

**Degraded git context fallback:** if `git remote get-url origin` errors or
resolves to no `origin` remote (broken git context — e.g. record #703's
worktree-isolation-pin failure mode), do not throw. Fall back to comparing
the target repo (`thomasholknielsen/claude-tweaks`, from `_shared/
learning-routing.md`'s filing target) against this plugin's own known slug:
read `repository` from `{plugin-root}/.claude-plugin/plugin.json` (already
resolved as `{plugin-root}` elsewhere in this skill's Step 4 dedup search)
and derive the `owner/repo` slug from that URL. If the derived slug matches
the filing target, treat this exactly like a `git remote` self-reference
match above — stop, report, do not file. If `plugin.json` itself is
unreadable or has no `repository` field, skip this check with a logged
assumption ("self-reference check skipped — no git context and no
plugin.json repository field to fall back on") rather than blocking the
whole skill on an unrelated git failure.
```

- [ ] **Step 3: Verify the edit**

Run: `grep -n "Degraded git context fallback" plugin/skills/feedback/SKILL.md`
Expected: one match, inside Step 3.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/feedback/SKILL.md
git commit -m "Harden feedback skill's self-reference check with a plugin.json fallback (refs #703)"
```

---

### Task 4: Task 0 empirical findings + final verification

**Files:**
- Modify: none (documentation-only, recorded in the final commit body per the spec's AC2)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

- [ ] **Step 1: Record Task 0's findings**

Record the following findings (already established via direct reading of `plugin/bin/lib/hooks/pre-tool-use.js` during planning) in the final wrap-up commit body:

- **Case (a)** (`ExitWorktree` invoked correctly by the agent) and **case (b)** (a raw Bash `git worktree remove` denied by the gate's own-cwd guard, then retried via `ExitWorktree`): whether the harness-native pin persists after either is **not reproducible from this repo's own hook-visible events** — the pin is native Claude Code CLI state, outside anything this plugin's hooks read or write (confirmed by grep: no "isolation pin" hits anywhere in this repo). Stated as inconclusive per the spec's AC2, not silently dropped.
- **Case (c)** (a same-session `git worktree remove` targeting a pinned-but-not-`ctx.cwd` path via an earlier `cd`/subshell): **structurally unreachable for this hook architecture to detect**, not merely "already covered." Each hook invocation (`pre-tool-use.js`'s `checkTeardownGate` included) is stateless and sees only the CURRENT call's `ctx.cwd` — there is no cross-call session memory of an earlier `cd` in a prior Bash call for any hook to consult. Adding one would require a new persistent "last observed cwd" ledger this record found no existing structural lever for (per the spec's own Gotchas: "unless Task 0 turns up a structural lever this record doesn't yet know about" — it does not). Per the spec's AC3, this satisfies the AC via documented finding — no code change required for case (c).

- [ ] **Step 2: Final verification**

Run: `node --test tests/hooks-post-tool-use-teardown-pin.test.js tests/hooks-post-tool-use-worktree-staleness.test.js tests/hooks-gate-coverage.test.js tests/teardown-gate.test.js`
Expected: PASS — all four suites green, confirming no regression to the existing own-cwd deny behavior (`tests/teardown-gate.test.js`) alongside the new coverage.

- [ ] **Step 3: Full suite**

Run: `node --test tests/`
Expected: PASS — full suite green (per this repo's `MEMORY.md`, compare any failure count against the known Windows baseline before concluding a regression; re-run only the affected file(s) in isolation if a count varies run-to-run under sibling-session load).
