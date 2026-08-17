# Fan-Out Single-Message Emission Rule (#649) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** State, once, in `skills/_shared/subagent-output-contract.md`'s fan-out section, that a parallel dispatch means emitting every `Agent`/`Task` call as a `tool_use` block in one assistant message (never one call per message), plus the batching unit for large fan-outs; then have every other fan-out-describing dispatch site cite that sentence instead of leaving "parallel" to imply a mechanism it never states.

**Architecture:** One new paragraph in `subagent-output-contract.md`'s `## How to integrate at a dispatch site` section is the single source. `skills/specify/red-team.md`'s Parallel dispatch block and eight other named skills (`/browse`, `/dispatch`, `/help`, `/init`, `/review`, `/test`, `/tidy`, `/visual-review`) each add a one-line citation at their own primary fan-out-describing blockquote — no mechanism restated. `tests/subagent-contract-clauses.test.js` (already exists, pins two unrelated prior contract clauses for #124/#153) gets two new pinned assertions appended, not a new file.

**Tech Stack:** Markdown skill files, `node --test` conformance suite.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T041704-record-649/work/649-spec.md`

## Global Constraints

- **The new canonical sentence** (exact wording, written once, into `subagent-output-contract.md` only):

  ```
  Emit all N `Agent`/`Task` calls of a fan-out as `tool_use` blocks in a single assistant message; a call per message is a serialized dispatch even when the prose says parallel.
  ```

  The phrase `single assistant message` must appear **exactly once** in `skills/_shared/subagent-output-contract.md` (Acceptance Criterion 1) — do not reuse it elsewhere in that file.

- **The batching-unit follow-on** (same paragraph, immediately after the sentence above): for a fan-out too large for one practical batch, the unit is one message per record's persona/agent **set**, never one message per individual agent.

- **The canonical citation string** every site file uses verbatim (so the test can grep one pattern across all nine files): `` `_shared/subagent-output-contract.md`'s fan-out section `` — inserted into the existing `> **Parallel execution` blockquote (or, for `/dispatch`, into its sequential-execution note) at each site, never as a restated paraphrase of the mechanism itself.

- **Per-site citation location** (pick the one primary/canonical fan-out-describing blockquote per file — do not touch every parallel-execution blockquote in a skill that has several; citing once per file satisfies the record):

  | Skill | File | Line (pre-edit) |
  |---|---|---|
  | `/specify` (red-team) | `skills/specify/red-team.md` | 13-16 |
  | `/browse` | `skills/browse/SKILL.md` | 109 |
  | `/dispatch` | `skills/dispatch/SKILL.md` | 201 |
  | `/help` | `skills/help/status-scan.md` | 9 |
  | `/init` | `skills/init/SKILL.md` | 275 (301 references 275, no re-citation) |
  | `/review` | `skills/review/step3-lens-dispatch.md` | 50 |
  | `/test` | `skills/test/qa-prompts.md` | 7 |
  | `/tidy` | `skills/tidy/SKILL.md` | 63 |
  | `/visual-review` | `skills/visual-review/page-mode.md` | 31 |

  `/dispatch` is a special case: `sequential-execution.md`/`SKILL.md` line 177 states its group-to-group loop is deliberately **sequential, not parallel** (cwd-pinning, `#155`) — there is no multi-agent-in-one-message fan-out to describe there. Its citation lands instead at SKILL.md line 201, where the two per-group `Task()` calls are defined, clarifying that each individual call still follows the contract (including the fan-out section's batching convention, for the day a group's own dispatch legitimately batches multiple calls) even though the group loop itself is sequential by a different, structural constraint. This is a clarifying addition, not a contradiction of the existing sequential-execution note.

- **Commits:** one per task, message style `{Verb} {what} — {detail}`, reference the record as `refs #649` — NEVER `closes`/`fixes`.

---

### Task 1: Add the canonical sentence to the contract's fan-out section

**Files:**
- Modify: `skills/_shared/subagent-output-contract.md` (`## How to integrate at a dispatch site` section, immediately after the heading, before the existing "In a Form B blockquote:" line — currently line 221)
- Test: `tests/subagent-contract-clauses.test.js` (append a new test — do not replace existing tests)

**Interfaces:**
- Produces: the literal substring `single assistant message` in `skills/_shared/subagent-output-contract.md`, exactly once in the file.

- [ ] **Step 1: Write the failing test**

  Append to `tests/subagent-contract-clauses.test.js`, after the last existing `test(...)` call (keep every existing test untouched — this file already pins unrelated #124/#153 clauses):

  ```javascript
  test('the contract states the single-assistant-message fan-out rule exactly once (#649)', () => {
    const contract = FILES['skills/_shared/subagent-output-contract.md'];
    const matches = contract.match(/single assistant message/gi) || [];
    assert.strictEqual(
      matches.length,
      1,
      'skills/_shared/subagent-output-contract.md must state the fan-out single-assistant-' +
        'message rule exactly once — a call per message is a serialized dispatch even when the ' +
        'prose says "parallel" (the harness only runs tool_use blocks concurrently when they ' +
        'arrive in one assistant message).',
    );
    assert.match(
      contract,
      /one message per record'?s? [\w /]*persona[\w /]*set|one message per record'?s? [\w /]*set,? never one (message )?per (individual )?agent/i,
      'the fan-out section must also state the batching unit for large fan-outs: one message ' +
        "per record's persona/agent set, never one message per individual agent.",
    );
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test tests/subagent-contract-clauses.test.js`
  Expected: FAIL — the new test fails (`matches.length` is 0), all pre-existing tests in the file still PASS.

- [ ] **Step 3: Write the contract paragraph**

  Edit `skills/_shared/subagent-output-contract.md`. Locate:

  ```markdown
  ## How to integrate at a dispatch site

  In a Form B blockquote:
  ```

  Replace with:

  ```markdown
  ## How to integrate at a dispatch site

  **Emit all N `Agent`/`Task` calls of a fan-out as `tool_use` blocks in a single assistant
  message; a call per message is a serialized dispatch even when the prose says parallel.** The
  harness runs tool calls concurrently only when they arrive as multiple `tool_use` blocks in one
  message — calling a dispatch "parallel" in prose does not make it so on its own. For a fan-out
  too large for one practical batch, the unit is one message per record's persona/agent set,
  never one message per individual agent.

  In a Form B blockquote:
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `node --test tests/subagent-contract-clauses.test.js`
  Expected: PASS — every test in the file, old and new.

- [ ] **Step 5: Commit**

  ```bash
  git add skills/_shared/subagent-output-contract.md tests/subagent-contract-clauses.test.js
  git commit -m "Add fan-out single-message emission rule to Subagent Contract — refs #649"
  ```

---

### Task 2: Cite the rule in `skills/specify/red-team.md`

**Files:**
- Modify: `skills/specify/red-team.md` (Parallel dispatch block, lines 13-16)
- Test: `tests/subagent-contract-clauses.test.js`

**Interfaces:**
- Consumes: the contract sentence from Task 1 (already landed).
- Produces: a citation of `` `_shared/subagent-output-contract.md`'s fan-out section `` inside `red-team.md`, plus its own dispatch-unit statement (one message per sub-issue trio; a fast-lane sub-issue's single Skeptical Reviewer joins the next message).

- [ ] **Step 1: Write the failing test**

  Append to `tests/subagent-contract-clauses.test.js`:

  ```javascript
  const FAN_OUT_SITES = {
    'skills/specify/red-team.md': "the contract's batching unit (one message per sub-issue trio; a fast-lane sub-issue's single Skeptical Reviewer joins the next message)",
    'skills/browse/SKILL.md': null,
    'skills/dispatch/SKILL.md': null,
    'skills/help/status-scan.md': null,
    'skills/init/SKILL.md': null,
    'skills/review/step3-lens-dispatch.md': null,
    'skills/test/qa-prompts.md': null,
    'skills/tidy/SKILL.md': null,
    'skills/visual-review/page-mode.md': null,
  };

  for (const relPath of Object.keys(FAN_OUT_SITES)) {
    test(`${relPath}: cites the contract's fan-out section (#649)`, () => {
      const text = fs.readFileSync(path.join(ROOT, ...relPath.split('/')), 'utf8');
      assert.match(
        text,
        /subagent-output-contract\.md[^\n]{0,60}fan-out section|fan-out section[^\n]{0,60}subagent-output-contract\.md/i,
        `${relPath} must cite \`_shared/subagent-output-contract.md\`'s fan-out section at its ` +
          'primary parallel-dispatch blockquote, rather than leaving "parallel" undefined.',
      );
    });
  }
  ```

  (This single loop covers Tasks 2-4's file set in one test block — later tasks do not re-add the loop, only make it pass for their own file.)

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test tests/subagent-contract-clauses.test.js`
  Expected: FAIL on all nine new `cites the contract's fan-out section` tests (none of the files have the citation yet); prior tests still PASS.

- [ ] **Step 3: Edit `red-team.md`**

  Locate (current lines 13-16):

  ```markdown
  > **Parallel execution:** Dispatch the selected persona(s) as parallel Task agents (a single agent
  > for `fast-lane`, three for `standard`) — each runs independently and returns Template-A findings
  > narrowed to ambiguities, gaps, and unstated assumptions. Assemble results after all agents
  > complete.
  ```

  Replace with:

  ```markdown
  > **Parallel execution:** Dispatch the selected persona(s) as parallel Task agents (a single agent
  > for `fast-lane`, three for `standard`) — each runs independently and returns Template-A findings
  > narrowed to ambiguities, gaps, and unstated assumptions. Assemble results after all agents
  > complete. Per `_shared/subagent-output-contract.md`'s fan-out section: emit every persona's
  > `Task` call as one assistant message — one message per sub-issue's persona trio (`standard`),
  > or fold a `fast-lane` sub-issue's single Skeptical Reviewer into the next message rather than
  > giving it a message of its own.
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `node --test tests/subagent-contract-clauses.test.js`
  Expected: PASS for `skills/specify/red-team.md`'s two new tests (fan-out citation + batching-unit); the other eight fan-out-citation tests still FAIL (expected — later tasks).

- [ ] **Step 5: Commit**

  ```bash
  git add skills/specify/red-team.md tests/subagent-contract-clauses.test.js
  git commit -m "Cite fan-out single-message rule in red-team dispatch — refs #649"
  ```

---

### Task 3: Cite the rule in `/browse`, `/help`, `/test`, `/tidy`, `/visual-review`

**Files:**
- Modify: `skills/browse/SKILL.md` (line 109), `skills/help/status-scan.md` (line 9), `skills/test/qa-prompts.md` (line 7), `skills/tidy/SKILL.md` (line 63), `skills/visual-review/page-mode.md` (line 31)

**Interfaces:**
- Consumes: the contract sentence from Task 1.
- Produces: nothing new consumed downstream — each edit only adds a citation clause to an existing blockquote.

- [ ] **Step 1: Confirm the tests for these five files are still failing**

  Run: `node --test tests/subagent-contract-clauses.test.js`
  Expected: the five fan-out-citation tests for these files FAIL; `red-team.md`'s and the contract's tests PASS (from Tasks 1-2).

- [ ] **Step 2: Edit `skills/browse/SKILL.md`**

  Locate (current line 109):

  ```markdown
  > **Parallel execution:** Dispatch independent browser walks as parallel Task agents — each opens its own session, runs its ops, and returns a per-session result. Assemble results after all agents complete.
  ```

  Replace with:

  ```markdown
  > **Parallel execution:** Dispatch independent browser walks as parallel Task agents — each opens its own session, runs its ops, and returns a per-session result. Assemble results after all agents complete. Per `_shared/subagent-output-contract.md`'s fan-out section: emit every walk's `Task` call as `tool_use` blocks in one assistant message, not one call per message.
  ```

- [ ] **Step 3: Edit `skills/help/status-scan.md`**

  Locate (current line 9):

  ```markdown
  > **Parallel execution:** Dispatch Stages 1, 4.5, 4.6, 4.7, and 4.8 as parallel Task agents — each stage scans an independent data source and returns counts, flags, and recommendations. The orchestrator assembles the dashboard after all agents complete.
  ```

  Replace with:

  ```markdown
  > **Parallel execution:** Dispatch Stages 1, 4.5, 4.6, 4.7, and 4.8 as parallel Task agents — each stage scans an independent data source and returns counts, flags, and recommendations. The orchestrator assembles the dashboard after all agents complete. Per `_shared/subagent-output-contract.md`'s fan-out section: emit all five stage calls as `tool_use` blocks in one assistant message, not five separate messages.
  ```

- [ ] **Step 4: Edit `skills/test/qa-prompts.md`**

  Locate (current line 7):

  ```markdown
  > **Parallel execution:** Dispatch each tier's stories as parallel Task agents — each runs independently against its own `agent-browser` session and returns a `RESULT:` summary line (plus optional `TRACE:` line and `REPORT_JSON` comment). Assemble results after all agents in the tier complete. Follow the subagent contract in `skills/_shared/subagent-output-contract.md`: inline the prompt template below verbatim per agent (no references to sibling files), pick `[Use: Standard]` (qa-agent work is browser-driven step execution, not deep analysis — resolve via `node bin/resolve-profile.js standard`, contract § Model Selection), and treat the agent's first reply line as its status (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`).
  ```

  Replace with (appending one clause, no other change):

  ```markdown
  > **Parallel execution:** Dispatch each tier's stories as parallel Task agents — each runs independently against its own `agent-browser` session and returns a `RESULT:` summary line (plus optional `TRACE:` line and `REPORT_JSON` comment). Assemble results after all agents in the tier complete. Follow the subagent contract in `skills/_shared/subagent-output-contract.md`: inline the prompt template below verbatim per agent (no references to sibling files), pick `[Use: Standard]` (qa-agent work is browser-driven step execution, not deep analysis — resolve via `node bin/resolve-profile.js standard`, contract § Model Selection), and treat the agent's first reply line as its status (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`). Per that contract's fan-out section: emit every story's `Task` call in one assistant message per tier, not one message per story.
  ```

- [ ] **Step 5: Edit `skills/tidy/SKILL.md`**

  Locate the sentence ending `Assemble all findings into the Step 6 report.` inside the Parallel execution blockquote at (current) line 63. Append one sentence to the end of that same blockquote paragraph:

  ```markdown
  Per `_shared/subagent-output-contract.md`'s fan-out section: emit every selected step's `Task` call as `tool_use` blocks in one assistant message, not one message per step.
  ```

- [ ] **Step 6: Edit `skills/visual-review/page-mode.md`**

  Locate (current line 31):

  ```markdown
  > **Parallel execution (conditional):** When the review covers 3+ independent pages (different URLs with no shared state or navigation dependency), dispatch page reviews as parallel Task agents. Each agent owns its own session, runs its own batch, and returns findings in the `| Severity | Path:Line | Finding | Evidence |` format (see the output template below). The dispatcher maps these rows into the Step 6 Report & Route table using the column mapping documented immediately above. When pages share state (form submission on page A affects page B) or there are fewer than 3 pages, review sequentially.
  ```

  Replace with (appending one clause, no other change):

  ```markdown
  > **Parallel execution (conditional):** When the review covers 3+ independent pages (different URLs with no shared state or navigation dependency), dispatch page reviews as parallel Task agents. Each agent owns its own session, runs its own batch, and returns findings in the `| Severity | Path:Line | Finding | Evidence |` format (see the output template below). The dispatcher maps these rows into the Step 6 Report & Route table using the column mapping documented immediately above. When pages share state (form submission on page A affects page B) or there are fewer than 3 pages, review sequentially. Per `_shared/subagent-output-contract.md`'s fan-out section: emit every page's `Task` call as `tool_use` blocks in one assistant message, not one call per message.
  ```

- [ ] **Step 7: Run tests to verify they pass**

  Run: `node --test tests/subagent-contract-clauses.test.js`
  Expected: PASS for all five files' fan-out-citation tests; `/dispatch`, `/init`, `/review` tests still FAIL (Task 4).

- [ ] **Step 8: Commit**

  ```bash
  git add skills/browse/SKILL.md skills/help/status-scan.md skills/test/qa-prompts.md skills/tidy/SKILL.md skills/visual-review/page-mode.md
  git commit -m "Cite fan-out single-message rule in browse/help/test/tidy/visual-review — refs #649"
  ```

---

### Task 4: Cite the rule in `/dispatch`, `/init`, `/review`

**Files:**
- Modify: `skills/dispatch/SKILL.md` (line 201), `skills/init/SKILL.md` (line 275), `skills/review/step3-lens-dispatch.md` (line 50)

**Interfaces:**
- Consumes: the contract sentence from Task 1.
- Produces: nothing new consumed downstream.

- [ ] **Step 1: Confirm the tests for these three files are still failing**

  Run: `node --test tests/subagent-contract-clauses.test.js`
  Expected: the three remaining fan-out-citation tests FAIL; every other test PASSes (Tasks 1-3).

- [ ] **Step 2: Edit `skills/dispatch/SKILL.md`**

  Locate (current line 201, end of the sentence):

  ```markdown
  Each group's two `Task()` prompts are defined in `task-prompt.md` in this skill's directory — read it and inline each call's content verbatim into its own `Task()` tool call (per `_shared/subagent-output-contract.md`'s input discipline: minimal input, literal output template inlined, no conversation history). Do not paraphrase or summarize either template; the exact wording is load-bearing for the four-value status line and output format contracts downstream skills parse.
  ```

  Replace with (appending one clause to the existing citation):

  ```markdown
  Each group's two `Task()` prompts are defined in `task-prompt.md` in this skill's directory — read it and inline each call's content verbatim into its own `Task()` tool call (per `_shared/subagent-output-contract.md`'s input discipline: minimal input, literal output template inlined, no conversation history — and that same contract's fan-out section for the general single-message-emission rule, which this skill's group loop satisfies trivially since it dispatches one `Task()` at a time by the structural cwd-pinning constraint above, not a batch). Do not paraphrase or summarize either template; the exact wording is load-bearing for the four-value status line and output format contracts downstream skills parse.
  ```

- [ ] **Step 3: Edit `skills/init/SKILL.md`**

  Locate (current line 275):

  ```markdown
  > **Parallel execution (conditional):** When the candidate list has ≥ 8 skills, dispatch scoring as parallel Task agents per the Subagent Contract (`_shared/subagent-output-contract.md`). Otherwise, run the scoring inline in the main thread.
  ```

  Replace with:

  ```markdown
  > **Parallel execution (conditional):** When the candidate list has ≥ 8 skills, dispatch scoring as parallel Task agents per the Subagent Contract (`_shared/subagent-output-contract.md`'s fan-out section — emit every scoring call as `tool_use` blocks in one assistant message, not one per candidate). Otherwise, run the scoring inline in the main thread.
  ```

  Leave the second occurrence (current line 301, the drift-patch audit) unchanged — it already reads "the same threshold and pattern Phase 4 already uses," which is the "no restated mechanism" cross-reference the record asks for.

- [ ] **Step 4: Edit `skills/review/step3-lens-dispatch.md`**

  Locate (current line 50):

  ```markdown
  > **Parallel execution (conditional):** When the diff spans 10+ files, dispatch each applicable lens (3a-3f) as a **reproduction pair** — 2 identical agents per lens (up to 12 Task agents total: 6 reproduction lenses × 2). When the diff is smaller, run each lens as a 2-agent reproduction pair sequentially in the main thread. Lenses 3g-cov, 3h, and 3i are not dispatched as reproduction pairs — they run as single agents (3h) or main-thread procedures (3g-cov, 3i).
  ```

  Replace with (appending one sentence):

  ```markdown
  > **Parallel execution (conditional):** When the diff spans 10+ files, dispatch each applicable lens (3a-3f) as a **reproduction pair** — 2 identical agents per lens (up to 12 Task agents total: 6 reproduction lenses × 2). When the diff is smaller, run each lens as a 2-agent reproduction pair sequentially in the main thread. Lenses 3g-cov, 3h, and 3i are not dispatched as reproduction pairs — they run as single agents (3h) or main-thread procedures (3g-cov, 3i). Per `_shared/subagent-output-contract.md`'s fan-out section: emit all 12 (or fewer) `Task` calls as `tool_use` blocks in one assistant message, not one call per message.
  ```

- [ ] **Step 5: Run tests to verify they pass**

  Run: `node --test tests/subagent-contract-clauses.test.js`
  Expected: PASS — every test in the file.

- [ ] **Step 6: Run the full suite**

  Run: `npm test`
  Expected: PASS — no regressions introduced by this record's edits.

- [ ] **Step 7: Commit**

  ```bash
  git add skills/dispatch/SKILL.md skills/init/SKILL.md skills/review/step3-lens-dispatch.md
  git commit -m "Cite fan-out single-message rule in dispatch/init/review — refs #649"
  ```

## Self-Review Notes

- **Spec coverage:** Deliverable 1 → Task 1. Deliverable 2 (red-team.md) → Task 2. Deliverable 3 (8 other sites) → Tasks 3-4. Deliverable 4 (test file) → Tasks 1-4 append to the existing `tests/subagent-contract-clauses.test.js` rather than creating a colliding second file of that name.
- **Acceptance Criterion 1** (`grep -n "single assistant message" skills/_shared/subagent-output-contract.md` matches once) is Task 1's first new test, asserted with `match(/single assistant message/gi).length === 1`.
- **Acceptance Criterion 2** is explicitly non-mechanical (a live `/specify` transcript observation) — not pinned by this plan's tests; noted as such in the materialized spec.
- **`/dispatch` is the one deliberate deviation** from "same shape at every site" — it is structurally sequential, not a parallel fan-out, so its citation is worded to say so rather than imply a fan-out that does not exist there. Flagging this explicitly here so a reviewer doesn't read it as a missed site.
