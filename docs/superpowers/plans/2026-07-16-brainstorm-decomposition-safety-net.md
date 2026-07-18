# Brainstorming Decomposition Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give claude-tweaks two small, decoupled safety nets around `/superpowers:brainstorming` — without editing any superpowers file — so (A) sub-projects it identifies but defers never get silently lost to `/clear`, and (B) its redundant spec-review round-trip is skipped when nothing substantive changed since design approval.

**Architecture:** Component A is a code change: a new warn-tier `PostToolUse` hook check in `bin/lib/hooks/post-tool-use.js`, fired by a new `Write` matcher in `hooks/hooks.json`, that nudges the assistant to run `/claude-tweaks:capture` whenever a design doc lands under `docs/superpowers/specs/`. Component B is a documentation-only change: one added sentence to CLAUDE.md's existing "Adaptive section batching" bullet, extending that setting to also skip brainstorming's Step 8 wait under a defined condition.

**Tech Stack:** Node.js (`node --test`), no new dependencies.

## Global Constraints

- Never edit any file under the installed superpowers plugin directory (`~/.claude/plugins/cache/claude-plugins-official/superpowers/...`) — it is a fixed external dependency; every change in this plan lives in this repo.
- Every hook module change must exit 0 on any error (never throw); `post-tool-use` is already covered by the garbage-stdin invariant loop in `tests/hooks-dispatcher.test.js` — no new registration needed there, just don't break it.
- New checks match the existing `checkClosingKeyword` precedent: unconditional path/pattern matching, no content parsing, no filesystem reads inside the check function itself.
- All work happens inside the worktree at `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/brainstorm-decomposition-safety-net` (branch `worktree-brainstorm-decomposition-safety-net`) — every step below assumes that cwd; use `git -C` or an explicit `cd` rather than relying on ambient state.

---

### Task 1: Deferred-subproject capture hook

**Files:**
- Modify: `bin/lib/hooks/post-tool-use.js` (currently 99 lines)
- Modify: `hooks/hooks.json`
- Modify: `CLAUDE.md:163` (Hooks section, tiered-posture bullet)
- Test: `tests/hooks-post-tool-use-design-doc.test.js` (new file)

**Interfaces:**
- Consumes: nothing from other tasks (this is the first task). Uses the existing `post.run(ctx)` entry point and `ctx` shape (`{ input: { tool_name, tool_input }, runDir, runState, cwd }`) already established by `checkClosingKeyword`'s tests.
- Produces: `checkDesignDocWrite(ctx)` and `DESIGN_DOC_PATH_RE` inside `post-tool-use.js`; a `systemMessage` string that must contain both "deferred sub-project" and "/claude-tweaks:capture" (Task 2 does not depend on this, but any future test extending this check should keep matching on those substrings).

- [ ] **Step 1: Write the failing test**

Create `tests/hooks-post-tool-use-design-doc.test.js`:

```js
// tests/hooks-post-tool-use-design-doc.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const post = require('../bin/lib/hooks/post-tool-use');

function runWrite(filePath) {
  return post.run({
    input: { tool_name: 'Write', tool_input: { file_path: filePath, content: '# Design\n' } },
    runDir: null,
    runState: null,
    cwd: '/tmp',
  });
}

test('warns when a design doc is written under docs/superpowers/specs/ (absolute path)', () => {
  const out = runWrite('/repo/docs/superpowers/specs/2026-07-16-example-design.md');
  assert.ok(out.json && typeof out.json.systemMessage === 'string', 'expected a systemMessage nudge');
  assert.match(out.json.systemMessage, /deferred sub-project/i);
});

test('warns on a relative design-doc path too', () => {
  const out = runWrite('docs/superpowers/specs/2026-07-16-example-design.md');
  assert.match(out.json.systemMessage, /claude-tweaks:capture/);
});

test('does not warn for a non-design-doc write under the same directory', () => {
  const out = runWrite('/repo/docs/superpowers/specs/notes.md');
  assert.deepStrictEqual(out, {});
});

test('does not warn for a design-doc-looking filename outside docs/superpowers/specs/', () => {
  const out = runWrite('/repo/other/2026-07-16-example-design.md');
  assert.deepStrictEqual(out, {});
});

test('does not warn for a Write to an unrelated file', () => {
  const out = runWrite('/repo/src/index.js');
  assert.deepStrictEqual(out, {});
});

test('does not warn when the tool is not Write (e.g. Edit to the same path)', () => {
  const out = post.run({
    input: { tool_name: 'Edit', tool_input: { file_path: '/repo/docs/superpowers/specs/2026-07-16-example-design.md' } },
    runDir: null,
    runState: null,
    cwd: '/tmp',
  });
  assert.deepStrictEqual(out, {});
});

test('fires even when a runDir and runState are set (independent of pipeline-run state)', () => {
  const out = post.run({
    input: { tool_name: 'Write', tool_input: { file_path: '/repo/docs/superpowers/specs/2026-07-16-example-design.md' } },
    runDir: '/tmp/some-run-dir',
    runState: { status: 'active' },
    cwd: '/tmp',
  });
  assert.match(out.json.systemMessage, /docs\/superpowers\/specs/);
});
```

- [ ] **Step 2: Run it to verify the expected tests fail**

Run: `node --test tests/hooks-post-tool-use-design-doc.test.js`

Expected: 7 tests run, **3 FAIL** ("warns when a design doc is written...", "warns on a relative design-doc path too", "fires even when a runDir and runState are set...") because `checkDesignDocWrite` doesn't exist yet and `run()` unconditionally returns `{}` for a `Write` tool call today. The other 4 tests PASS trivially (they assert `{}`, which is already what happens). This split is expected — it is not a bug in the test file.

- [ ] **Step 3: Implement the minimal code**

In `bin/lib/hooks/post-tool-use.js`, insert this block immediately after `checkClosingKeyword`'s closing `}` (i.e., right after line 72, before the blank line that precedes `function run(ctx) {`):

```js

// Deferred-subproject capture nudge (warn tier). superpowers:brainstorming
// identifies oversized requests and defers all but the first sub-project to
// "later" with no durable tracking — they live only in conversation memory
// and are lost on /clear. This fires whenever a brainstorming design doc is
// written, unconditionally: it does not try to parse whether decomposition
// actually happened (unreliable prose classification), same "cheap false
// positive, no smart detection" precedent checkClosingKeyword sets above.
// Matching on the Write call itself (not "new file only") also means this
// re-fires if Step 7's self-review later revises the same design doc.
const DESIGN_DOC_PATH_RE = /(^|\/)docs\/superpowers\/specs\/[^/]+-design\.md$/;

function checkDesignDocWrite(ctx) {
  if (ctx.input.tool_name !== 'Write') return null;
  const filePath = ctx.input.tool_input && ctx.input.tool_input.file_path;
  if (typeof filePath !== 'string' || !DESIGN_DOC_PATH_RE.test(filePath)) return null;
  return {
    json: {
      systemMessage:
        'claude-tweaks: a design doc was just written under docs/superpowers/specs/. If ' +
        'brainstorming identified other independent sub-projects and deferred them to focus ' +
        'on this one, capture each deferred sub-project now via /claude-tweaks:capture — they ' +
        "aren't tracked anywhere else, and will be lost once this conversation clears.",
    },
  };
}
```

Then modify `run(ctx)` (originally lines 74-96) to also call it — add the new block right before the final `return {};`:

```js
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

  // Deferred-subproject capture nudge (warn tier) — deliberately NOT gated on ctx.runDir.
  const designDocNudge = checkDesignDocWrite(ctx);
  if (designDocNudge) return designDocNudge;

  return {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-post-tool-use-design-doc.test.js tests/hooks-post-tool-use-closing-keyword.test.js`

Expected: all 7 new tests PASS, all pre-existing closing-keyword tests still PASS (no regression from the shared `run()` edit).

- [ ] **Step 5: Wire the new PostToolUse/Write matcher**

In `hooks/hooks.json`, the `"PostToolUse"` array currently has 3 entries (all `"matcher": "Bash"` with an `"if"` condition). Add a 4th entry, after the existing 3, inside the same array:

```json
      {
        "matcher": "Write",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" post-tool-use" }
        ]
      }
```

(No `"if"` condition needed — unlike the `Bash` entries, which gate on the shell command text, `"matcher": "Write"` already scopes to the right tool.)

- [ ] **Step 6: Document the new check in CLAUDE.md's Hooks section**

In `CLAUDE.md`, find the "Project-agnostic by construction" bullet (line 163) — it currently ends with:

```
...since the gap it catches (a fix commit made outside the structured `/specify` → `/build` → `/wrap-up` pipeline, with no closing keyword) is exactly a commit that would never resolve a run dir in the first place.
```

Append one sentence to the end of that same bullet:

```
The deferred-subproject capture check (also warn tier) mirrors this on `Write`: it fires on any write to `docs/superpowers/specs/*-design.md` regardless of run-dir state, since a brainstorming session that hasn't reached `/specify` yet has no pipeline run dir to gate on either.
```

Do not add an entry to the "Hooks" section's "Referenced by" list (the line listing `_shared/git-discipline.md`, `_shared/pipeline-run-dir.md`, etc.) — this check has no run-dir interaction and nothing in those shared files needs to reference it.

- [ ] **Step 7: Run the full suite**

Run: `npm test`

Expected: all tests pass, including `tests/hooks-dispatcher.test.js`'s garbage-stdin invariant loop (which already iterates `post-tool-use` — no change needed there) and the two `hooks-post-tool-use-*` files from Steps 1-4.

- [ ] **Step 8: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/brainstorm-decomposition-safety-net"
git add bin/lib/hooks/post-tool-use.js hooks/hooks.json CLAUDE.md tests/hooks-post-tool-use-design-doc.test.js
git commit -m "$(cat <<'EOF'
Add deferred-subproject capture hook for brainstorming design docs

superpowers:brainstorming defers sub-projects it identifies as too
large for a single spec, with no durable tracking — they live only in
conversation memory and are lost on /clear. This adds a warn-tier
PostToolUse/Write hook that nudges capturing each deferred sub-project
via /claude-tweaks:capture whenever a design doc lands under
docs/superpowers/specs/. No superpowers file is edited.

Refs #brainstorm-decomposition-safety-net-design
EOF
)"
```

---

### Task 2: Adaptive Step 8 skip

**Files:**
- Modify: `CLAUDE.md:87` (Interaction patterns, "Adaptive section batching" bullet)

**Interfaces:**
- Consumes: nothing from Task 1 — fully independent.
- Produces: nothing consumed by a later task — this is the last task in the plan.

- [ ] **Step 1: Edit the CLAUDE.md bullet**

In `CLAUDE.md`, the "Adaptive section batching" bullet (line 87) currently ends with:

```
...The default `Brainstorm / section-confirmation: adaptive` setting makes this the standard behavior; override with `per-section` (always ask) or `batch` (always present once).
```

Append one sentence to the end of that same bullet (do not create a new bullet — this must stay under the same `adaptive` setting per the design doc):

```
The same `adaptive` setting also governs `/superpowers:brainstorming` Step 8 (the spec-review gate before `/superpowers:writing-plans`): skip its blocking wait when Step 5's approval was clean and Step 7's self-review made no substantive change (ambiguity resolved by judgment call, scope/decomposition shift, or a contradiction resolved by interpretation) — state the committed path and proceed directly to writing-plans. A substantive self-review change still stops, surfacing only that delta. This overrides brainstorming's own wait instruction on the claude-tweaks side; no superpowers file is edited.
```

- [ ] **Step 2: Verify the edit**

Run: `grep -n "Step 8" CLAUDE.md`

Expected: one match, inside the "Adaptive section batching" bullet, confirming the sentence landed in the right bullet and isn't duplicated elsewhere.

This task has no automated test — it's a prose instruction interpreted by the model at brainstorming-execution time, not executable code (same reasoning the `routine-setup-friction-design.md` plan used for its own prompt-flow changes: "No test suite covers... prompt flows directly — they're LLM-interpreted markdown, not executable code"). Verification is the manual read-back in Step 2, plus tracing behavior in a future live brainstorm.

- [ ] **Step 3: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/brainstorm-decomposition-safety-net"
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Extend adaptive section batching to skip brainstorming's Step 8 gate

Step 8 (review the written spec before writing-plans) re-confirms
content already approved section-by-section in Step 5, making it a
redundant round-trip whenever Step 7's self-review made no substantive
change. Reuses the existing Brainstorm / section-confirmation: adaptive
setting instead of adding a new one.

Refs #brainstorm-decomposition-safety-net-design
EOF
)"
```
