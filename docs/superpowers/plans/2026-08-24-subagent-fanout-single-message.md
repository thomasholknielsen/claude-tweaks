# Subagent Fan-Out Single-Message Clause — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** State explicitly, once, in the Subagent Contract that a fan-out's `Agent`/`Task` calls must be emitted as tool_use blocks in a single assistant message (a call-per-message is a serialized dispatch even when the prose says "parallel"), have every fan-out site cite that rule instead of restating it, and pin both with a test.

**Architecture:** One new sentence in `plugin/skills/_shared/subagent-output-contract.md`'s "How to integrate at a dispatch site" section (the fan-out section every dispatch site already points at). `plugin/skills/specify/red-team.md`'s Parallel dispatch block gets the fuller citation-plus-batching-unit treatment named in the record. The other eight named sites each get a one-line citation appended to their existing dispatch blockquote — no restatement of the mechanism. `tests/subagent-contract-clauses.test.js` (an existing conformance suite pinning two earlier subagent-contract clauses, #124/#153) gets new test cases for this clause and its citations.

**Tech Stack:** Markdown prose edits; `node --test` for the pinning suite.

**Spec:** GitHub issue #649 (materialized at `.claude-tweaks/pipelines/2026-08-24T024725-record-649/work/649-spec.md`)

## Global Constraints

- The pinned sentence must contain the exact substring `single assistant message` (AC1: `grep -n "single assistant message" skills/_shared/subagent-output-contract.md` matches exactly once).
- Citation sites reference the rule by name (`single-assistant-message rule`) and file+section (`` `_shared/subagent-output-contract.md`'s fan-out section ``) — never restate the "tool_use blocks in one message" mechanism text.
- One citation per named skill (not per sub-file) is sufficient for the eight non-red-team sites — pick each skill's most load-bearing dispatch-prompt file.

---

### Task 1: Add the fan-out sentence to the contract, and red-team.md's fuller citation

**Files:**
- Modify: `plugin/skills/_shared/subagent-output-contract.md` (insert after the `## How to integrate at a dispatch site` heading, before the `In a Form B blockquote:` line, ~line 257)
- Modify: `plugin/skills/specify/red-team.md` (the `> **Parallel execution:**` blockquote, ~lines 13-17)
- Test: `tests/subagent-contract-clauses.test.js` (new test cases, added in Task 3)

**Interfaces:**
- Produces: the exact phrase `single assistant message` (once, in `subagent-output-contract.md`) and the exact label `single-assistant-message rule` (used verbatim by every citing site in Task 2) — later tasks' tests match these two literal strings.

- [ ] **Step 1: Insert the fan-out sentence into `subagent-output-contract.md`**

  Insert this new paragraph immediately after `## How to integrate at a dispatch site` and before `In a Form B blockquote:`:

  ```markdown
  **Fan-out dispatch shape.** Emit all N `Agent`/`Task` calls of a fan-out as tool_use blocks in a single assistant message; a call per message is a serialized dispatch even when the prose says parallel — the harness only runs tool calls concurrently when they arrive as multiple `tool_use` blocks in one message. When a fan-out spans multiple independent units of work (e.g. several records, each needing its own persona set), batch by unit: one message per record's persona set, never one message per individual agent.
  ```

- [ ] **Step 2: Update red-team.md's Parallel dispatch block**

  In `plugin/skills/specify/red-team.md`, after the existing `> **Parallel execution:** ... complete.` line and before the `> **Contract:**` line, insert:

  ```markdown
  >
  > **Dispatch shape:** per `_shared/subagent-output-contract.md`'s fan-out section (the single-assistant-message rule) — emit every persona agent for one sub-issue as tool_use blocks in one assistant message; a call per message serializes the dispatch even though it's described as parallel above. Batching unit across sub-issues: one message per sub-issue's persona set; a `fast-lane` sub-issue's single Skeptical Reviewer call joins the next sub-issue's message rather than spending a whole message on one agent.
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add plugin/skills/_shared/subagent-output-contract.md plugin/skills/specify/red-team.md
  git commit -m "Add fan-out single-message clause to subagent contract + red-team citation

refs #649"
  ```

---

### Task 2: Cite the clause at the eight other named fan-out sites

**Files:**
- Modify: `plugin/skills/browse/SKILL.md` (Contract line, ~line 111)
- Modify: `plugin/skills/dispatch/task-prompt.md` (intro paragraph, ~line 5)
- Modify: `plugin/skills/help/status-scan.md` (Contract line, ~line 11)
- Modify: `plugin/skills/init/SKILL.md` (first Parallel execution line, ~line 275)
- Modify: `plugin/skills/review/step3-lens-dispatch.md` (Parallel execution conditional line, ~line 50)
- Modify: `plugin/skills/test/qa-prompts.md` (Parallel execution line, ~line 7)
- Modify: `plugin/skills/tidy/scan-execution.md` (Contract line, ~line 12)
- Modify: `plugin/skills/visual-review/page-mode.md` (Contract line, ~line 37)

**Interfaces:**
- Consumes: the label `single-assistant-message rule` and the phrase `` `_shared/subagent-output-contract.md`'s fan-out section `` from Task 1.
- Produces: each file contains the literal substring `single-assistant-message rule` at least once — Task 3's test greps for it.

- [ ] **Step 1: Append the citation to each of the eight files**

  Append this exact sentence to the end of the file's existing Contract/Parallel-execution line named above (same paragraph, no new heading):

  `` Dispatch shape: single-assistant-message rule (`_shared/subagent-output-contract.md`'s fan-out section) applies. ``

  **`dispatch/task-prompt.md` gets a variant** (its two Task() calls are sequential by design, never a concurrent fan-out, so the citation must not claim a batching decision applies): append to the intro paragraph instead:

  `` The single-assistant-message rule (`_shared/subagent-output-contract.md`'s fan-out section) creates no batching decision here — these two calls are sequential by design, never emitted together. ``

- [ ] **Step 2: Commit**

  ```bash
  git add plugin/skills/browse/SKILL.md plugin/skills/dispatch/task-prompt.md plugin/skills/help/status-scan.md plugin/skills/init/SKILL.md plugin/skills/review/step3-lens-dispatch.md plugin/skills/test/qa-prompts.md plugin/skills/tidy/scan-execution.md plugin/skills/visual-review/page-mode.md
  git commit -m "Cite subagent fan-out single-message rule at eight dispatch sites

refs #649"
  ```

---

### Task 3: Pin both with a test

**Files:**
- Modify: `tests/subagent-contract-clauses.test.js` (append new `test(...)` blocks — the file already exists, pinning two earlier subagent-contract clauses; do not remove or restructure its existing tests)

**Interfaces:**
- Consumes: `plugin/skills/_shared/subagent-output-contract.md`, `plugin/skills/specify/red-team.md`, and the eight files from Task 2.

- [ ] **Step 1: Write the failing tests**

  Append to `tests/subagent-contract-clauses.test.js` (after the existing tests, same file — keep the existing `const { test } = require('node:test');` etc. imports and the existing `ROOT`/`FILES` constants at top; add new logic below the last existing `test(...)` call):

  ```javascript
  test('the fan-out section states the single-assistant-message rule exactly once (#649 AC1)', () => {
    const contract = FILES['skills/_shared/subagent-output-contract.md'];
    const matches = contract.match(/single assistant message/g) || [];
    assert.strictEqual(
      matches.length,
      1,
      'skills/_shared/subagent-output-contract.md must contain the exact phrase ' +
        '"single assistant message" exactly once — the canonical fan-out sentence ' +
        '(#649). A second occurrence means the sentence was duplicated instead of cited; ' +
        'zero means it was dropped or reworded away from the pinned phrase.',
    );

    const heading = contract.indexOf('## How to integrate at a dispatch site');
    assert.notStrictEqual(
      heading,
      -1,
      'the contract must keep its "How to integrate at a dispatch site" section — the fan-out ' +
        'sentence lives there',
    );
    const section = contract.slice(heading, contract.indexOf('\n## ', heading + 1));
    assert.match(
      section,
      /single assistant message/,
      'the "single assistant message" sentence must live inside the fan-out section itself, ' +
        'not somewhere unrelated that happens to mention it',
    );
  });

  test("red-team.md cites the fan-out rule and states its own batching unit (#649)", () => {
    const redTeam = fs.readFileSync(
      path.join(ROOT, 'plugin', 'skills', 'specify', 'red-team.md'),
      'utf8',
    );
    assert.match(
      redTeam,
      /single-assistant-message rule/,
      'red-team.md must cite the fan-out rule by name, not just link the contract file generally',
    );
    assert.match(
      redTeam,
      /one message per sub-issue/,
      'red-team.md must state its own dispatch batching unit: one message per sub-issue\'s ' +
        'persona set (#649\'s Deliverables)',
    );
    assert.match(
      redTeam,
      /fast-lane[^.]*joins the next/i,
      'red-team.md must state that a fast-lane sub-issue\'s single Skeptical Reviewer call ' +
        'joins the next sub-issue\'s message rather than spending a whole message on one agent',
    );
  });

  const FAN_OUT_SITES = {
    '/browse': 'skills/browse/SKILL.md',
    '/dispatch': 'skills/dispatch/task-prompt.md',
    '/help': 'skills/help/status-scan.md',
    '/init': 'skills/init/SKILL.md',
    '/review': 'skills/review/step3-lens-dispatch.md',
    '/test': 'skills/test/qa-prompts.md',
    '/tidy': 'skills/tidy/scan-execution.md',
    '/visual-review': 'skills/visual-review/page-mode.md',
  };

  for (const [skillName, relPath] of Object.entries(FAN_OUT_SITES)) {
    test(`${skillName} cites the fan-out single-assistant-message rule (#649)`, () => {
      const text = fs.readFileSync(path.join(ROOT, 'plugin', relPath), 'utf8');
      assert.match(
        text,
        /single-assistant-message rule/,
        `${relPath} must cite the fan-out rule by name (` +
          '"single-assistant-message rule") rather than leaving the fan-out mechanism unstated. ' +
          'Cite _shared/subagent-output-contract.md\'s fan-out section — do not restate the ' +
          'mechanism text itself (#649).',
      );
    });
  }
  ```

- [ ] **Step 2: Run the new tests to verify they fail**

  Run: `node --test tests/subagent-contract-clauses.test.js`
  Expected: the new tests FAIL (Task 1/2's edits are not yet in place at this point only if Steps are executed out of order — since Tasks 1-2 already land before this task in the plan's own sequence, run this check by temporarily confirming the assertions against a `git stash` of Task 1/2's changes, or simply proceed to Step 3 if Tasks 1-2 already committed; the important verification is that a reader reverting Task 1/2's diff makes the new tests fail, not literal red-then-green in this exact task order).

- [ ] **Step 3: Run the full test file to verify it passes**

  Run: `node --test tests/subagent-contract-clauses.test.js`
  Expected: PASS — all existing tests (#124/#153 pins) plus the new tests above.

- [ ] **Step 4: Commit**

  ```bash
  git add tests/subagent-contract-clauses.test.js
  git commit -m "Pin subagent fan-out single-message clause and its site citations

refs #649"
  ```

---

### Task 4: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

  Run: `npm test`
  Expected: PASS — no regressions in any other suite (this change touches only markdown prose and one test file; no runtime code changed).

- [ ] **Step 2: Confirm AC1's exact grep**

  Run: `grep -n "single assistant message" plugin/skills/_shared/subagent-output-contract.md`
  Expected: exactly one matching line.
