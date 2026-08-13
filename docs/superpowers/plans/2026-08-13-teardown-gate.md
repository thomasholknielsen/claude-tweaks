# Teardown Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deny teardown (`ExitWorktree`, `git worktree remove`) of a worktree still assigned to a non-terminal pipeline run; warn (never block) when `close-run` closes a run with no recorded wrap-up invocation.

**Architecture:** Extends the existing gate host `bin/lib/hooks/pre-tool-use.js` (one gate host, one coverage export). A new `findRunByWorktreePath` reverse lookup lands in `context.js` beside `resolveRun`. The teardown check runs first in `runInner` (it matches only teardown shapes, so ordering is inert for everything else). `close-run` in `bin/hooks.js` gains the warn + `close-without-wrapup` event append. Coverage is documented in a NEW sibling block in `skills/_shared/policy-schema.md` pinned by `tests/hooks-gate-coverage.test.js`.

**Tech Stack:** Node built-ins + in-repo helpers. Tests via `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-13T201329-spec-371-372-373/spec-373/work/373-spec.md` (includes the measured-boundary addendum — the close-run warn text must be informational, not accusatory, because human-typed wrap-ups legitimately leave no event)

## Global Constraints

- **Every path exits 0.** Deny = `hookSpecificOutput.permissionDecision: 'deny'` in stdout JSON only. New paths must pass the garbage-stdin invariant.
- **Ambiguity resolves to allow** (fail-open set): unresolvable target, no matching recorded assignment, recorded path gone from disk, missing/corrupt run-state, unconfidently-parsed `git worktree` command. Never widen #174's compound-command parsing surface — the new parser handles ONLY the narrow `git worktree remove [--force] <path>` shape and allows anything else.
- **Ownership matrix:** same-session → deny; unowned run → deny; missing identity on either side → deny; provably foreign-owned → allow + warn systemMessage + `wd-foreign-teardown` event appended to the TARGET run's own dir (the `wd-foreign-session` precedent — enforcement-target run, not ownedRun).
- **New event shapes (exact):** `{"path": ..., "ts": ..., "type": "wd-foreign-teardown"}` and `{"ts": ..., "type": "close-without-wrapup"}` (appendEvent spreads ts/type last).
- **`git worktree` subcommands other than `remove` are untouched** (`list`, `add`, `prune`, `lock`, …).
- **No gating of git push/merge; no SessionEnd hook; the close-run warn is never a deny** — the asymmetry is the design (dispatch's sanctioned close-before-merge, plus measured finding (e): human-typed wrap-ups leave no event).
- **Coverage stated once:** new sibling block in `policy-schema.md` between its own `<!-- teardown-gate-coverage:begin/end -->` markers; `GATE_COVERAGE` gains frozen `teardownTools` + `teardownGitCommands` fields that the code actually branches on.
- Commit messages: `refs #373` — never closing keywords. No new dependencies.

---

### Task 0: Empirical premise check — capture a real ExitWorktree PreToolUse payload

**Blocking for the gate's target-resolution logic and the AC1/AC2/AC5 fixture payload shape.**

**Files:**
- Create: `.claude-tweaks/pipelines/2026-08-13T201329-spec-371-372-373/spec-373/work/task0-findings.md` (tracked `work/` audit-trail exception, committed)

**Interfaces:**
- Produces: pinned answers — (a) does the ExitWorktree PreToolUse `tool_input` carry an explicit worktree path (field name + example), (b) what `cwd` does the hook payload carry at exit time (inside the worktree, or already outside?), (c) initiator note: whether a headless `claude -p` run can drive EnterWorktree/ExitWorktree at all. Plus 1-2 raw payload lines.

- [ ] **Step 1: Build the capture environment**

Create a scratch dir OUTSIDE the repo (e.g. `/tmp/exitworktree-capture-373`), init a real git repo in it (`git init`, one commit — EnterWorktree needs a repo). Write `hook-settings.json` there via the Write tool:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "ExitWorktree", "hooks": [ { "type": "command", "command": "sh -c 'cat >> /tmp/exitworktree-capture-373/capture.jsonl && printf \"\\n\" >> /tmp/exitworktree-capture-373/capture.jsonl'" } ] },
      { "matcher": "EnterWorktree", "hooks": [ { "type": "command", "command": "sh -c 'cat >> /tmp/exitworktree-capture-373/enter.jsonl && printf \"\\n\" >> /tmp/exitworktree-capture-373/enter.jsonl'" } ] }
    ]
  }
}
```

- [ ] **Step 2: Run the capture scenario headlessly**

From the scratch repo as cwd:

```bash
claude -p "Use the EnterWorktree tool to enter a worktree named capture-test. Then immediately use the ExitWorktree tool to exit it. Report each tool result verbatim. If either tool is unavailable, say exactly which and stop." --settings /tmp/exitworktree-capture-373/hook-settings.json --max-turns 10
```

If the tools are deferred in headless mode, adapt the prompt ("load ExitWorktree via ToolSearch first"). If ExitWorktree genuinely cannot be driven headlessly (tool absent), record that as the (c) answer, capture whatever EnterWorktree produced, and pin the payload shape as UNMEASURED-fall-back-to-cwd: the gate resolves the target as the payload cwd's containing worktree (`git rev-parse --show-toplevel`), which the spec pre-authorizes. Do NOT fabricate a payload shape.

- [ ] **Step 3: Pin the answers + commit**

Write `task0-findings.md` (the three answers + raw lines, or the explicit UNMEASURED record). Commit:

```bash
git add .claude-tweaks/pipelines/2026-08-13T201329-spec-371-372-373/spec-373/work/task0-findings.md
git commit -m "Capture ExitWorktree PreToolUse payload shape (Task 0 premise check) — refs #373"
```

---

### Task 1: context.js reverse lookup + tests

**Files:**
- Modify: `bin/lib/hooks/context.js` (one new export beside `resolveRun`)
- Test: `tests/teardown-gate.test.js` (new — this suite grows through Tasks 1-4)

**Interfaces:**
- Consumes: `iterRunDirsWithState(cwd)` (already anchored to the main checkout, non-terminal runs only, `archive/` excluded by the ISO-prefix name filter).
- Produces: `findRunByWorktreePath(cwd, targetPath)` → `{ runDir, state } | null` — first non-terminal run whose `run-state.json.worktree` matches the canonicalized target. Consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `tests/teardown-gate.test.js` with a fixture builder (real git repo + worktree + run dir recording it, same pattern as `tests/run-integrity.test.js` — route git spawns through `tests/helpers/git-fixtures.js`) and tests: exact-path match returns the run; realpath match (symlinked target) returns the run; unmatched path returns null; terminal (`clean`) run is not returned; corrupt run-state.json returns null for that run without throwing.

- [ ] **Step 2: Run to verify failure** — `node --test tests/teardown-gate.test.js` → module has no such export.

- [ ] **Step 3: Implement** — in `context.js`, after `resolveRunDir`:

```js
// Reverse lookup: which non-terminal run holds this worktree path as its
// recorded assignment? Canonicalizes both sides via realpath where the paths
// exist (recorded assignments are already absolute; the caller resolves a
// relative teardown target against the Bash call's cwd BEFORE calling this).
// First match wins (newest-first, same ordering as resolveRun's scan).
function findRunByWorktreePath(cwd, targetPath) {
  if (typeof targetPath !== 'string' || !targetPath) return null;
  let target = targetPath;
  try { target = fs.realpathSync(targetPath); } catch { /* keep as-resolved */ }
  for (const { dir, state } of iterRunDirsWithState(cwd)) {
    if (!state || typeof state.worktree !== 'string' || !state.worktree) continue;
    let recorded = state.worktree;
    try { recorded = fs.realpathSync(recorded); } catch { /* keep recorded form */ }
    if (recorded === target || state.worktree === targetPath) return { runDir: dir, state };
  }
  return null;
}
```

Add `findRunByWorktreePath` to `module.exports`.

- [ ] **Step 4: Run to verify pass**, then **Step 5: Commit** — `git add bin/lib/hooks/context.js tests/teardown-gate.test.js` / `git commit -m "Add path-to-run reverse lookup for teardown gating — refs #373"`

---

### Task 2: hooks.json matchers + registration test

**Files:**
- Modify: `hooks/hooks.json` (PreToolUse: new `ExitWorktree` matcher object; new `Bash(git worktree *)` row inside the existing Bash matcher's hooks array)
- Test: `tests/hooks-dispatcher.test.js` (registration test, same shape as the existing PostToolUse Skill matcher test)

- [ ] **Step 1: Failing test** — assert PreToolUse has an `ExitWorktree` matcher (literal, no `if`, one command hook routing to `pre-tool-use`) AND the Bash matcher's `if` list includes `Bash(git worktree *)`.
- [ ] **Step 2: RED run.** `node --test tests/hooks-dispatcher.test.js`
- [ ] **Step 3: Add both entries.** The Bash row: `{ "type": "command", "if": "Bash(git worktree *)", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" pre-tool-use" }` appended inside the existing PreToolUse Bash matcher's hooks array. The ExitWorktree matcher object mirrors the Edit matcher's shape.
- [ ] **Step 4: GREEN run** (whole file — the existing `every WRITE_SHAPES entry has a matching hooks.json if-matcher` test must still pass; the new `git` row is fine since `git` predicates already exist).
- [ ] **Step 5: Commit** — `git commit -m "Register ExitWorktree and git-worktree PreToolUse matchers — refs #373"` (stage both files).

---

### Task 3: Gate logic in pre-tool-use.js + deny/allow matrix tests

**Files:**
- Modify: `bin/lib/hooks/pre-tool-use.js`
- Test: `tests/teardown-gate.test.js` (append)
- Read first: Task 0's findings file — use the pinned payload shape (or the cwd-fallback design if UNMEASURED).

**Interfaces:**
- Consumes: `ctxLib.findRunByWorktreePath(cwd, target)`, `runGit`, `splitSegments`/`tokenize` from `./git-command` (already partially imported — extend the import), `ctxLib.appendEvent`.
- Produces: `checkTeardownGate(ctx)` returning `{}` | deny-json | warn-json, called FIRST in `runInner`; `GATE_COVERAGE` gains `teardownTools: ['ExitWorktree']` and `teardownGitCommands: ['worktree remove']` (frozen, branch-read).

- [ ] **Step 1: Failing tests** — append to `tests/teardown-gate.test.js`, spawning `node bin/hooks.js pre-tool-use` (dispatcher-level, real payloads):

  - AC1: ExitWorktree payload (Task-0 shape; cwd inside the fixture worktree if the fallback design applies) + active run recording that worktree → stdout has `"permissionDecision":"deny"`, exit 0, message contains the run dir path AND `cleanup-procedures.md`.
  - AC2: after `node bin/hooks.js close-run --run <dir>`, identical payload → allow (no permissionDecision).
  - AC3: `Bash` payload `git worktree remove <abs-path>` → deny; `git worktree remove ../rel/path` with cwd making it resolve to the same worktree → deny; `git worktree remove --force <abs-path>` → deny; `git worktree list` → allow; `git worktree prune` → allow.
  - AC4: unresolvable target → allow; target matching no assignment → allow; recorded path deleted from disk (rm -rf the worktree dir first, keep run-state) → allow.
  - AC5: foreign-owned run (record-worktree with `CLAUDE_CODE_SESSION_ID=owner`, payload `session_id: 'bystander'`) → NO permissionDecision, `"systemMessage"` present, and the run's `events.jsonl` last line parses to `type === 'wd-foreign-teardown'` with the path; unowned run + payload with no `session_id` → deny.
  - Garbage: `{"tool_name":"ExitWorktree"` truncated stdin → exit 0.

- [ ] **Step 2: RED run.**

- [ ] **Step 3: Implement.** In `pre-tool-use.js`:

  1. Extend `GATE_COVERAGE`:
  ```js
  const GATE_COVERAGE = Object.freeze({
    tools: Object.freeze(['Edit', 'Write', 'NotebookEdit']),
    gitActions: Object.freeze(['commit', 'push']),
    bashWriteShapes: WRITE_SHAPES,
    teardownTools: Object.freeze(['ExitWorktree']),
    teardownGitCommands: Object.freeze(['worktree remove']),
  });
  ```
  2. Narrow teardown-target resolver (new function, with a header comment noting it deliberately does not extend the compound-command surface #174 tracks):
  ```js
  // Resolves the worktree path a teardown call targets, or null when it cannot
  // be determined confidently (null -> allow; ambiguity never denies).
  // ExitWorktree: per Task 0's findings — explicit tool_input path when the
  // payload carries one, else the payload cwd's containing worktree toplevel.
  // Bash: ONLY the narrow `git worktree remove [--force] <path>` shape, parsed
  // per command segment via git-command.js's own splitSegments/tokenize; any
  // other flags, multiple positionals, or parse doubt -> null for that segment.
  function teardownTargets(ctx) {
    const toolName = ctx.input && ctx.input.tool_name;
    const toolInput = ctx.input && ctx.input.tool_input;
    if (GATE_COVERAGE.teardownTools.includes(toolName)) {
      const explicit = toolInput && typeof toolInput.path === 'string' && toolInput.path ? toolInput.path : null; // field per Task 0
      if (explicit) return [path.resolve(ctx.cwd || process.cwd(), explicit)];
      const top = toplevel(ctx.cwd || process.cwd());
      return top ? [top] : [];
    }
    if (toolName !== 'Bash' || !toolInput || typeof toolInput.command !== 'string') return [];
    const out = [];
    for (const seg of splitSegments(toolInput.command)) {
      const toks = tokenize(seg);
      // find `git ... worktree remove` allowing only -C <dir> before the subcommand
      let i = 0;
      if (toks[i] !== 'git') continue;
      i += 1;
      let effCwd = ctx.cwd || process.cwd();
      if (toks[i] === '-C' && typeof toks[i + 1] === 'string') { effCwd = path.resolve(effCwd, toks[i + 1]); i += 2; }
      if (toks[i] !== 'worktree' || toks[i + 1] !== 'remove') continue;
      const rest = toks.slice(i + 2).filter((t) => t !== '--force' && t !== '-f');
      if (rest.length !== 1 || rest[0].startsWith('-')) continue; // unconfident -> allow
      out.push(path.resolve(effCwd, rest[0]));
    }
    return out;
  }
  ```
  (Adjust the ExitWorktree `tool_input` field name to Task 0's pinned answer; keep the cwd fallback either way. `splitSegments`/`tokenize` come from the existing `./git-command` import — extend the destructuring.)
  3. The gate:
  ```js
  function checkTeardownGate(ctx) {
    for (const target of teardownTargets(ctx)) {
      let exists = false;
      try { fs.statSync(target); exists = true; } catch { /* gone */ }
      if (!exists) continue; // recorded-or-target path gone from disk -> allow (fail-open)
      const hit = ctxLib.findRunByWorktreePath(ctx.cwd, target);
      if (!hit || !hit.state) continue;
      const status = hit.state.status;
      if (status !== 'active' && status !== 'interrupted') continue;
      const owner = typeof hit.state.sessionId === 'string' && hit.state.sessionId ? hit.state.sessionId : null;
      const caller = ctx.input && typeof ctx.input.session_id === 'string' && ctx.input.session_id ? ctx.input.session_id : null;
      if (owner && caller && owner !== caller) {
        // Provably foreign-owned: allow + warn, event to the TARGET run's dir
        // (the wd-foreign-session precedent — enforcement-target, not ownedRun).
        ctxLib.appendEvent(hit.runDir, 'wd-foreign-teardown', { path: target });
        return {
          exit: 0,
          json: {
            systemMessage:
              `claude-tweaks: worktree ${target} is assigned to run ${path.basename(hit.runDir)}, recorded by a different session — ` +
              `allowing this teardown, but if that pipeline is still live its state will be orphaned. ` +
              `Prefer closing the run first: node "${pluginRoot()}/bin/hooks.js" close-run --run "${hit.runDir}"`,
          },
        };
      }
      // Same session, unowned run, or identity missing on either side -> deny.
      return {
        exit: 0,
        json: {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason:
              `claude-tweaks teardown gate: worktree ${target} is still assigned to non-terminal pipeline run ` +
              `${hit.runDir}. Tearing it down now skips the documented cleanup sequence (skills/wrap-up/cleanup-procedures.md ` +
              `Section C) and destroys the run's gitignored state. Finish via /claude-tweaks:wrap-up, or close the bookkeeping first: ` +
              `node "${pluginRoot()}/bin/hooks.js" close-run --run "${hit.runDir}", then retry.`,
          },
        },
      };
    }
    return {};
  }
  ```
  4. Call it FIRST in `runInner` (before `checkWorktreeRequired`): `const teardown = checkTeardownGate(ctx); if (teardown.json) return teardown;`
  5. Note on the disk-existence check: it implements the spec's "recorded assignment whose path no longer exists on disk → allow" via the target side (target and recorded path are the same path once matched — statting the target covers both).

- [ ] **Step 4: GREEN run** — `node --test tests/teardown-gate.test.js` and `node --test tests/hooks-dispatcher.test.js` (existing E1/worktree.always behavior untouched — also run `node --test tests/hooks-pre-tool-use.test.js` if it exists; check `ls tests/`).

- [ ] **Step 5: Commit** — `git commit -m "Add teardown gate: deny worktree removal on non-terminal runs — refs #373"`

---

### Task 4: close-run warn + event append + tests

**Files:**
- Modify: `bin/hooks.js` (close-run branch only)
- Test: `tests/teardown-gate.test.js` (append AC6 tests)

- [ ] **Step 1: Failing tests** — AC6: run with events.jsonl lacking a wrap-up `skill_invoked` → `close-run` still transitions status to `clean`, stdout contains a warning line, and the LAST line of events.jsonl parses to `type === 'close-without-wrapup'`; with `{"skill":"claude-tweaks:wrap-up","ts":"...","type":"skill_invoked"}` present → no warning line, no new event appended (line count unchanged). Also: missing events.jsonl entirely → warn fires and the file is created with the single event (append-to-existing-run is fine — the run DIR exists; only run-dir creation is forbidden).

- [ ] **Step 2: RED run.**

- [ ] **Step 3: Implement.** In `bin/hooks.js`'s close-run branch, immediately before the `ctxLib.writeRunState(runDir, { status: 'clean', worktree: null })` call:

```js
// Warn-tier check (#373): closing a run whose ledger never recorded a wrap-up
// invocation. Warn, never block — dispatch's close-before-merge is sanctioned,
// and a human-typed /claude-tweaks:wrap-up leaves no event at all (measured,
// #371 finding (e)), so absence is not proof the procedure was skipped.
let wrapupSeen = false;
try {
  const rawEvents = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8');
  for (const line of rawEvents.split('\n')) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      if (ev && ev.type === 'skill_invoked' && ev.skill === 'claude-tweaks:wrap-up') { wrapupSeen = true; break; }
    } catch { /* skip garbage line */ }
  }
} catch { /* no events.jsonl — treated the same as no wrap-up event */ }
if (!wrapupSeen) {
  ctxLib.appendEvent(runDir, 'close-without-wrapup', {});
  process.stdout.write(
    `claude-tweaks: closing run ${path.basename(runDir)} with no recorded wrap-up invocation — ` +
    'expected if wrap-up was run manually (typed slash commands leave no ledger event); ' +
    'otherwise consider /claude-tweaks:wrap-up before closing. Event recorded: close-without-wrapup.\n',
  );
}
```

Place it after the foreign-owner refusal branch (a refused close must not warn or append) and before `writeRunState`.

- [ ] **Step 4: GREEN run** — `node --test tests/teardown-gate.test.js` and `node --test tests/hooks-dispatcher.test.js` (the existing close-run tests must pass — NOTE: several existing dispatcher tests assert close-run's stdout is EMPTY for the owner path (`assert.strictEqual(own.stdout, '')`); those fixtures have no wrap-up event, so the new warn line will break them. Update those existing assertions to expect the warn line (match `/close-without-wrapup|no recorded wrap-up/`) — that is a legitimate, spec-mandated output change, not a regression. List every such adjusted assertion in your report.)

- [ ] **Step 5: Commit** — `git commit -m "Warn on wrap-up-less close-run with close-without-wrapup event — refs #373"`

---

### Task 5: Coverage documentation + pin extension

**Files:**
- Modify: `skills/_shared/policy-schema.md` (new sibling block)
- Modify: `tests/hooks-gate-coverage.test.js` (pin the new block)

- [ ] **Step 1: Failing test** — add to `tests/hooks-gate-coverage.test.js`: a `teardownCoverageBlock()` reader for `<!-- teardown-gate-coverage:begin -->` / `<!-- teardown-gate-coverage:end -->` markers; tests asserting its `- Tools:` tokens equal `GATE_COVERAGE.teardownTools`, its `- Git commands:` tokens equal `GATE_COVERAGE.teardownGitCommands`, and that `pre-tool-use.js` source branches on `GATE_COVERAGE.teardownTools` (load-bearing check, same pattern as the existing one).

- [ ] **Step 2: RED run.**

- [ ] **Step 3: Add the block** to `skills/_shared/policy-schema.md`, directly after the existing `worktree.always` coverage section:

```markdown
### Teardown gate coverage — canonical

**This block is the single statement of what the teardown gate intercepts** (`bin/lib/hooks/pre-tool-use.js`'s `GATE_COVERAGE.teardownTools`/`teardownGitCommands` are its machine counterpart; `tests/hooks-gate-coverage.test.js` pins the two). The gate denies teardown of a worktree recorded as a **non-terminal** (`active`/`interrupted`) pipeline run's assignment — `close-run` is the sanctioned exit, and clearing the assignment lifts the gate. It is run-*targeted* rather than run-independent: it fires only when a recorded assignment matches the teardown target, and every ambiguity (unresolvable target, no match, recorded path gone, corrupt run-state, unconfidently-parsed command) resolves to allow. Foreign-owned runs get a warn instead of a deny, with a `wd-foreign-teardown` event on the target run. The companion warn tier lives in `close-run` itself: closing a run with no recorded wrap-up invocation appends `close-without-wrapup` and prints a warning — never a block, because dispatch's close-before-merge is sanctioned and human-typed wrap-ups leave no ledger event (measured, spec #371 finding (e)).

<!-- teardown-gate-coverage:begin -->
- Tools: `ExitWorktree`
- Git commands: `worktree remove`
<!-- teardown-gate-coverage:end -->

`git worktree` subcommands other than `remove` (`list`, `add`, `prune`, `lock`, …) pass untouched. `git push`/merge are deliberately not gated (dispatch's auto-merge path), and SessionEnd is not hooked (it cannot deny) — that window belongs to the SessionStart run-integrity scan.
```

- [ ] **Step 4: GREEN run** — `node --test tests/hooks-gate-coverage.test.js` (all, old and new).

- [ ] **Step 5: Commit** — `git commit -m "Document teardown-gate coverage block and pin it — refs #373"`

---

### Task 6: Full-suite verification

- [ ] **Step 1:** `npm test` (redirect to file, inspect tail). Expected PASS.
- [ ] **Step 2:** Map ACs: AC1/AC2 → Task 3; AC3 → Task 3; AC4 → Task 3; AC5 → Task 3; AC6 → Task 4; AC7 → Task 5 + full suite.
- [ ] **Step 3:** Fix-forward only if this build caused failures (`Fix {what} — refs #373`).
