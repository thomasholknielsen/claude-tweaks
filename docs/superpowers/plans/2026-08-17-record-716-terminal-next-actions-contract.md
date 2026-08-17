# Terminal Next Actions Not-Silenced Contract Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** State explicitly in `skills/_shared/auto-mode-contract.md` that the closing terminal `## Next Actions` block is a navigation affordance outside `consoleAutoResolve`'s zero-click scope — added to the "What `auto` does NOT silence" list, with its recommended line defined as the actual next command.

**Architecture:** One new row appended to the existing "What `auto` does NOT silence" table, plus one new conformance test file pinning the row's key phrases so the contract can't silently regress. No behavioral code changes — this is contract prose consumed by every auto-mode pipeline.

**Tech Stack:** Markdown (`skills/_shared/*.md` contract), `node --test` conformance suite.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T072326-spec-716/work/716-spec.md` (materialized from record #716)

## Global Constraints

- Work happens in the worktree at `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-716` (branch `worktree-flow-spec-716`). Every file path below is relative to that root. Before committing, verify `git rev-parse --show-toplevel` prints that path.
- Commit messages use `{Verb} {what} — {detail}` style and reference the record as `refs #716` — never `closes #716`/`fixes #716` (the closing keyword lives in the PR body only).
- Spec deviation already adjudicated (do not re-open): record #716's AC2 says the final turn "ends with an AskUserQuestion", but #646 (shipped v6.89.0) converted terminal Next Actions to plain markdown — `AskUserQuestion` is now reserved for machine-consumed decisions. The row below implements the record's substance under the current convention. This is a known "Update the spec" deviation, staged for the Review Console by the pipeline — the implementer must not write an AskUserQuestion requirement into the contract.
- Surgical change: touch only the two files listed in Task 1. No edits to `_shared/autonomy-ceiling.md`, `docs/skill-graph.md`, or any SKILL.md.
- This session's Bash rejects compound commands (`&&`, heredocs, loops) — one plain command per call; use the Write/Edit tools for file content.

---

### Task 1: Not-silenced row + conformance test

**Files:**
- Modify: `skills/_shared/auto-mode-contract.md` (the "What `auto` does NOT silence" table, after the "Final pipeline failure cards" row)
- Test: `tests/auto-mode-terminal-next-actions.test.js` (create)

**Interfaces:**
- Consumes: the existing headings `## What `auto` does NOT silence` and `## Forbidden under auto` in `skills/_shared/auto-mode-contract.md` (section delimiters — both already exist; verified at plan time).
- Produces: a table row whose literal phrases `Terminal `## Next Actions``, `navigation affordance, not an approval gate`, `outside `consoleAutoResolve`'s zero-click scope`, `actual next command`, `never an `AskUserQuestion``, and `including `unattended`` are pinned by the test.

- [ ] **Step 1: Write the failing test**

Create `tests/auto-mode-terminal-next-actions.test.js` with exactly:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CONTRACT = fs.readFileSync(
  path.join(__dirname, '..', 'skills', '_shared', 'auto-mode-contract.md'),
  'utf8',
);

function notSilencedSection() {
  const start = CONTRACT.indexOf('## What `auto` does NOT silence');
  const end = CONTRACT.indexOf('## Forbidden under auto');
  assert.notStrictEqual(start, -1, 'not-silenced heading present');
  assert.ok(end > start, 'section delimited by the Forbidden heading');
  return CONTRACT.slice(start, end);
}

test('terminal Next Actions block is on the not-silenced list', () => {
  const section = notSilencedSection();
  assert.match(section, /Terminal `## Next Actions`/);
  assert.match(section, /navigation affordance, not an approval gate/);
  assert.match(section, /outside `consoleAutoResolve`'s zero-click scope/);
});

test('row defines the recommended line and the rendering convention', () => {
  const section = notSilencedSection();
  assert.match(section, /actual next command/);
  assert.match(section, /never an `AskUserQuestion`/);
  assert.match(section, /including `unattended`/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/auto-mode-terminal-next-actions.test.js`
Expected: FAIL — first test's `Terminal `## Next Actions`` match fails (the string appears nowhere in the file today; verified at plan time via `grep -c "Next Actions" skills/_shared/auto-mode-contract.md` → 0 matches, exit 1).

- [ ] **Step 3: Add the contract row**

In `skills/_shared/auto-mode-contract.md`, in the `## What `auto` does NOT silence` table, insert this single row immediately after the row starting `| Final pipeline failure cards |` (keep it one line, as all rows in this table are):

```markdown
| Terminal `## Next Actions` block (every run's closing turn — `/flow`'s Pipeline Summary close-out and failure cards included) | A navigation affordance, not an approval gate — it sits outside `consoleAutoResolve`'s zero-click scope (`_shared/autonomy-ceiling.md`), which covers only the Review Console's approval decisions. The final turn always renders it, in every mode including `unattended`: plain markdown per docs/skill-authoring.md's Skill handoffs convention (paste-ready fully-qualified commands, one per line, recommended first and bold — never an `AskUserQuestion`, which the Interaction style directive reserves for documented machine-consumed decisions), and the recommended line is the actual next command (e.g. the paste-ready merge command when the run ends green). Ending a run in bare prose with no `## Next Actions` block is a rendering omission, not an authorized silencing. |
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/auto-mode-terminal-next-actions.test.js`
Expected: PASS — 2 tests, 0 failures.

- [ ] **Step 5: Run the record's own acceptance grep**

Run: `grep -n "Next Actions" skills/_shared/auto-mode-contract.md`
Expected: exactly one matching line, inside the "What `auto` does NOT silence" table (AC1 of record #716).

- [ ] **Step 6: Run the neighboring conformance suites**

Run: `node --test tests/flow-run-dir-anchoring.test.js tests/auto-mode-terminal-next-actions.test.js`
Expected: PASS — `flow-run-dir-anchoring` reads the same contract file and must stay green after the edit.

- [ ] **Step 7: Commit**

```bash
git add skills/_shared/auto-mode-contract.md tests/auto-mode-terminal-next-actions.test.js
git commit -m "Add terminal Next Actions to auto-mode not-silenced list — navigation affordance outside consoleAutoResolve, recommended line is the actual next command — refs #716"
```

(One plain command per Bash call in this session — run the `git add` and `git commit` as two separate calls.)
