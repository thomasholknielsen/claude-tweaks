# Session-start unfinished-runs banner consumer for #803 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the SessionStart hook's unfinished-pipeline-runs banner a designated consumer (Path 1, the lighter-touch option named in the spec's Technical Approach): instruct the model to relay the run list once, in its first reply, one line per stale run with its ready-made `close-run` command — no triage, just visibility.

**Architecture:** `plugin/bin/lib/hooks/session-start.js`'s `run(ctx)` already composes the unfinished-runs banner text (lines 76-80) and pushes it into `parts`, joined into `hookSpecificOutput.additionalContext` — the text the model reads at session start. The fix is additive: append one more sentence to that same banner string, directly instructing the model to relay the list in its first reply, following the exact pattern the neighboring `worktree-always` banner (lines 265-271) already uses for a model-facing directive embedded in `additionalContext`. This is prompt-shaping text, not new control flow — no new function, no new state.

**Tech Stack:** Node (`plugin/bin/lib/hooks/session-start.js`), `node --test` (`tests/hooks-session-start.test.js`).

**Spec:** `work/803-spec.md` (materialized from GitHub issue #803)

## Global Constraints

- Path 1 only (per spec's Technical Approach: "pick one rather than building both") — no `/tidy` scan-procedures.md changes in this build.
- Preserve every existing banner assertion in `tests/hooks-session-start.test.js` (lines/regex around `spec-1`..`spec-4`, the PR-suffix test, the close-run-hint substitution test) — the new sentence is appended after the existing `close-run` hint, never inserted before or between existing text.

---

### Task 1: Add the relay instruction to the unfinished-runs banner

**Files:**
- Modify: `plugin/bin/lib/hooks/session-start.js` (banner composition, ~line 76-80)
- Modify: `tests/hooks-session-start.test.js` (pin the new instruction text)

**Interfaces:**
- Consumes: nothing from an earlier task (only task in this plan).
- Produces: nothing consumed by a later task.

- [x] **Step 1: Confirm current banner text (RED)**

```bash
grep -n "Relay this list" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-803/plugin/bin/lib/hooks/session-start.js"
```

Expected: no match (instruction not yet added).

- [x] **Step 2: Append the relay instruction**

In `session-start.js`, change the `parts.push(...)` call around line 76-80 to append one more sentence after the existing `close-run` hint, in the same template string:

```js
parts.push(
  'claude-tweaks: unfinished pipeline run(s) detected under .claude-tweaks/pipelines/:\n' +
    lines.join('\n') +
    `\nReview {run}/decisions.md and staged/ to resume, or close a finished run with: node "${pluginRoot}/bin/hooks.js" close-run --run <dir>` +
    '\nRelay this list once, in your first reply to the user, one line per run naming its close-run command — do not proceed silently without mentioning it.',
);
```

Add a short comment above the `parts.push` call naming this as the banner's designated consumer instruction (documents the choice "at the point the banner is emitted," satisfying the spec's Acceptance Criteria).

- [x] **Step 3: Pin the instruction in the test suite (GREEN)**

Add one assertion to the existing `'stale runs are reported in additionalContext...'` test (or a new small test) in `tests/hooks-session-start.test.js`:

```js
assert.match(ctx, /Relay this list once, in your first reply/);
```

Run:

```bash
node --test tests/hooks-session-start.test.js
```

Expected: all tests pass, including the new assertion.

- [x] **Step 4: Full targeted suite**

```bash
node --test tests/hooks-session-start.test.js
```

Expected: green, no regressions in the existing PR-suffix / close-run-hint / no-stale-runs tests.
