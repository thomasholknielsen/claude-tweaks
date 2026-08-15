# Friction Reflect Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Friction" lens to `/claude-tweaks:reflect` (full and light modes) that judges
session hook-denial and AskUserQuestion events for avoidability and routes qualifying findings
into the existing D5 upstream-feedback pipeline, fed by a new `ask-user-question` hooks event.

**Architecture:** One new log-tier `PostToolUse` handler in `bin/lib/hooks/post-tool-use.js`
appends an `ask-user-question` event to the owned run's `events.jsonl` on every AskUserQuestion
call (mirroring the existing `checkWorktreeStaleness`/`logWorktreeStalenessEvent` pattern). One
new reflect lens (added identically to `full-mode.md` and `light-mode.md`) reads that event type
plus the existing pre-tool-use.js denial events, judges avoidability, and hands findings to the
existing Step 3 `_shared/learning-routing.md` classifier — no new routing or filing mechanism.

**Tech Stack:** Node.js (`node --test`), markdown skill files (no build step).

**Spec:** GitHub issue #452 — "Add a Friction reflect lens fed by hook-denial and
AskUserQuestion events." Materialized at
`.claude-tweaks/pipelines/2026-08-15T010832-spec-452/work/452-spec.md`.

## Global Constraints

- Every new event-logging code path must be wrapped so a failure never breaks the session (`try`/
  `catch`, fail-open) — per CLAUDE.md's Hooks section, "Never break a session."
- The `ask-user-question` event schema is `{ questions: [{ header, options, answer }, ...] }`
  (one event per tool call, not per question) — confirmed against
  `@anthropic-ai/claude-agent-sdk`'s `sdk-tools.d.ts` type declarations, documented in
  `evals/NOTES.md`'s "AskUserQuestion input/output shapes" section. Do not use the flat
  `{header, options, answer}` shape from an earlier draft of this record — that shape was wrong
  and was corrected during this record's own red-team review.
- No numeric AskUserQuestion threshold anywhere — avoidability and volume are judged
  qualitatively by the lens itself (spec's Non-Goals).

---

### Task 1: Confirm the AskUserQuestion payload shape before writing any code

**Files:**
- None modified — investigation only, output feeds Tasks 2-3.

**Interfaces:**
- Consumes: nothing.
- Produces: a confirmed (or explicitly caveated) payload shape that Tasks 2 and 3 build against.

The spec's Current State already cites the authoritative source — do not skip re-verifying it.

- [ ] **Step 1: Re-read the confirmed SDK shape**

Read `evals/NOTES.md`'s "AskUserQuestion input/output shapes (confirmed Task 4, Step 1)" section
in full. Confirm it still states:

```
AskUserQuestionInput:  { questions: [{ question, header, options: [{label, description, preview?}, ...2-4], multiSelect }, ...1-4] }
AskUserQuestionOutput: { questions: [...same...], answers: { [questionText]: answerString }, response?, annotations?, afkTimeoutMs? }
```

If this section is missing or contradicts the shape above, STOP and escalate — do not guess; the
rest of this plan depends on this shape being accurate.

- [ ] **Step 2: Search for any live/example payload beyond the type declarations**

```bash
grep -rn "AskUserQuestion" node_modules/@anthropic-ai/claude-agent-sdk/ 2>/dev/null
find node_modules/@anthropic-ai/claude-agent-sdk -iname "*example*" -o -iname "*fixture*" 2>/dev/null
```

If `grep`/`find` on `node_modules` is denied by this session's Bash permissions (observed
elsewhere in this repo — see `evals/NOTES.md`'s own workaround note), fall back to the same
`node -e` `fs.readdirSync`/`fs.readFileSync` walk `evals/NOTES.md` used. Look specifically for
any JSON-Schema or example payload file beyond `sdk-tools.d.ts`'s type declarations — do not
attempt to trigger a live `AskUserQuestion` call to observe a real hook payload: it blocks on
human input and this task must stay non-interactive.

- [ ] **Step 3: Record the outcome**

If Step 2 finds no additional corroborating source (the expected outcome — `sdk-tools.d.ts` is
typically the only artifact), proceed to Task 2 using the type-declaration shape as-is; no file
changes needed for this step. If Step 2 finds a discrepancy, stop and re-derive the schema in
Task 2 accordingly before writing the handler.

---

### Task 2: `logAskUserQuestion` handler in `post-tool-use.js`

**Files:**
- Modify: `bin/lib/hooks/post-tool-use.js`
- Test: `tests/hooks-post-tool-use-ask-user-question.test.js` (Task 3)

**Interfaces:**
- Consumes: `ctx.input.tool_name`, `ctx.input.tool_input.questions` (array of
  `{question, header, options, multiSelect}`), `ctx.input.tool_response.answers` (object keyed by
  literal question text), `ctx.ownedRun.dir`, `ctx.ownedRun.attribution` — same `ctx` shape every
  other handler in this file already consumes.
- Produces: `logAskUserQuestion(ctx)` returns `{}` always (never a `systemMessage` — this is a
  log-tier event, never a warn or block). Appends one `ask-user-question`-typed line to
  `{ownedRun.dir}/events.jsonl` via the existing `ctxLib.appendEvent(runDir, type, data,
  attribution)` (`bin/lib/hooks/context.js`) when `ownedRun.dir` is set; writes nothing otherwise.

- [ ] **Step 1: Write the failing tests first**

This task's tests are written in Task 3 below (they share this task's implementation target — see
Task 3's own Steps 1-2 for the actual failing-test-first cycle: Task 3 writes the tests against
the not-yet-existing `logAskUserQuestion` export path and confirms they fail before this task's
Step 2 makes them pass). Complete Task 3 Steps 1-2 now, then return here.

- [ ] **Step 2: Implement `logAskUserQuestion` and wire the `run(ctx)` branch**

In `bin/lib/hooks/post-tool-use.js`, add the following function immediately before
`function run(ctx) {` (i.e., directly after the existing `checkWorktreeStaleness` function ends,
around line 414):

```javascript
// Log-tier breadcrumb, gated on ctx.ownedRun.dir exactly like
// logWorktreeStalenessEvent above — the AskUserQuestion analogue. One event
// per tool call (not per question): AskUserQuestionInput allows 1-4
// questions per call, and AskUserQuestionOutput.answers is a single map
// keyed by each question's own literal text (comma-separated already for a
// multiSelect question) — see evals/NOTES.md's "AskUserQuestion input/output
// shapes" section, sourced from @anthropic-ai/claude-agent-sdk's
// sdk-tools.d.ts. Never throws — a malformed tool_input/tool_response
// degrades to an empty/null-filled questions array rather than breaking the
// session, per CLAUDE.md's Hooks section ("Never break a session").
function logAskUserQuestion(ctx) {
  const ownedRun = ctx.ownedRun || {};
  if (!ownedRun.dir) return {};
  try {
    const posed = (ctx.input.tool_input && Array.isArray(ctx.input.tool_input.questions))
      ? ctx.input.tool_input.questions
      : [];
    const rawAnswers = ctx.input.tool_response && ctx.input.tool_response.answers;
    const answers = (rawAnswers && typeof rawAnswers === 'object') ? rawAnswers : {};
    const questions = posed.map((q) => ({
      header: (q && typeof q.header === 'string') ? q.header : null,
      options: (q && Array.isArray(q.options))
        ? q.options.map((o) => (o && typeof o.label === 'string') ? o.label : null)
        : [],
      answer: (q && typeof q.question === 'string' && Object.prototype.hasOwnProperty.call(answers, q.question))
        ? answers[q.question]
        : null,
    }));
    ctxLib.appendEvent(ownedRun.dir, 'ask-user-question', { questions }, ownedRun.attribution);
  } catch {
    /* best-effort — never break the session over a log-tier event */
  }
  return {};
}
```

Then, in `function run(ctx) {`, change:

```javascript
function run(ctx) {
  if (ctx.input.tool_name === 'Skill') return skillInvocation.run(ctx);
```

to:

```javascript
function run(ctx) {
  if (ctx.input.tool_name === 'Skill') return skillInvocation.run(ctx);
  if (ctx.input.tool_name === 'AskUserQuestion') return logAskUserQuestion(ctx);
```

- [ ] **Step 3: Run the new tests to verify they pass**

Run: `node --test tests/hooks-post-tool-use-ask-user-question.test.js`
Expected: PASS, all cases from Task 3.

- [ ] **Step 4: Run the full hooks test suite to check for regressions**

Run: `node --test tests/hooks-*.test.js`
Expected: PASS — no existing hook test broken by the new branch or function.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/post-tool-use.js tests/hooks-post-tool-use-ask-user-question.test.js
git commit -m "Log ask-user-question events to events.jsonl for the Friction reflect lens"
```

---

### Task 3: `tests/hooks-post-tool-use-ask-user-question.test.js`

**Files:**
- Create: `tests/hooks-post-tool-use-ask-user-question.test.js`

**Interfaces:**
- Consumes: `post.run(ctx)` from `bin/lib/hooks/post-tool-use.js` (same import every sibling test
  file in `tests/hooks-post-tool-use-*.test.js` already uses).
- Produces: nothing consumed by later tasks — this is the test file Task 2 Step 3 runs.

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/hooks-post-tool-use-ask-user-question.test.js
//
// #452's ask-user-question event: one PostToolUse log-tier event per
// AskUserQuestion call, holding every question posed in that call (1-4 per
// AskUserQuestionInput) with its header, option labels, and resolved
// answer. Schema confirmed against @anthropic-ai/claude-agent-sdk's
// sdk-tools.d.ts (see evals/NOTES.md) — answers is a map keyed by each
// question's own literal text, not by header.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const post = require('../bin/lib/hooks/post-tool-use');

function readEvents(runDir) {
  const raw = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function makeRunDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-auq-run-'));
}

function askCtx({ toolInput, toolResponse, ownedRun } = {}) {
  const input = { tool_name: 'AskUserQuestion' };
  if (toolInput !== undefined) input.tool_input = toolInput;
  if (toolResponse !== undefined) input.tool_response = toolResponse;
  return { input, cwd: '/does/not/matter', ownedRun };
}

test('logs one ask-user-question event with header, option labels, and the matched answer', () => {
  const runDir = makeRunDir();
  const toolInput = {
    questions: [
      {
        question: 'Which library should we use?',
        header: 'Library choice',
        options: [
          { label: 'date-fns', description: 'Lightweight, tree-shakeable' },
          { label: 'moment', description: 'Legacy, larger bundle' },
        ],
        multiSelect: false,
      },
    ],
  };
  const toolResponse = {
    questions: toolInput.questions,
    answers: { 'Which library should we use?': 'date-fns' },
  };
  const out = post.run(askCtx({ toolInput, toolResponse, ownedRun: { dir: runDir } }));
  assert.deepStrictEqual(out, {});
  const events = readEvents(runDir).filter((e) => e.type === 'ask-user-question');
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].questions, [
    { header: 'Library choice', options: ['date-fns', 'moment'], answer: 'date-fns' },
  ]);
});

test('handles multiple questions in one call, including a multiSelect comma-separated answer', () => {
  const runDir = makeRunDir();
  const toolInput = {
    questions: [
      {
        question: 'Pick a color',
        header: 'Color',
        options: [{ label: 'red' }, { label: 'blue' }],
        multiSelect: false,
      },
      {
        question: 'Pick features',
        header: 'Features',
        options: [{ label: 'dark-mode' }, { label: 'offline' }, { label: 'sync' }],
        multiSelect: true,
      },
    ],
  };
  const toolResponse = {
    questions: toolInput.questions,
    answers: { 'Pick a color': 'blue', 'Pick features': 'dark-mode, offline' },
  };
  const out = post.run(askCtx({ toolInput, toolResponse, ownedRun: { dir: runDir } }));
  assert.deepStrictEqual(out, {});
  const events = readEvents(runDir).filter((e) => e.type === 'ask-user-question');
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].questions, [
    { header: 'Color', options: ['red', 'blue'], answer: 'blue' },
    { header: 'Features', options: ['dark-mode', 'offline', 'sync'], answer: 'dark-mode, offline' },
  ]);
});

test('records answer: null when a posed question has no matching key in answers', () => {
  const runDir = makeRunDir();
  const toolInput = { questions: [{ question: 'Unanswered?', header: 'H', options: [{ label: 'a' }] }] };
  const toolResponse = { questions: toolInput.questions, answers: {} };
  post.run(askCtx({ toolInput, toolResponse, ownedRun: { dir: runDir } }));
  const events = readEvents(runDir).filter((e) => e.type === 'ask-user-question');
  assert.strictEqual(events[0].questions[0].answer, null);
});

test('does not fire for a tool other than AskUserQuestion', () => {
  const runDir = makeRunDir();
  const out = post.run({ input: { tool_name: 'ExitWorktree' }, cwd: '/x', ownedRun: { dir: runDir } });
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(runDir, 'events.jsonl')), 'no event file should be created');
});

test('no-ops (writes nothing, never throws) when ctx.ownedRun.dir is unset', () => {
  const toolInput = { questions: [{ question: 'Q?', header: 'H', options: [{ label: 'a' }] }] };
  const toolResponse = { questions: toolInput.questions, answers: { 'Q?': 'a' } };
  const out = post.run(askCtx({ toolInput, toolResponse }));
  assert.deepStrictEqual(out, {});
  const out2 = post.run(askCtx({ toolInput, toolResponse, ownedRun: {} }));
  assert.deepStrictEqual(out2, {});
});

test('never throws on malformed tool_input/tool_response', () => {
  const runDir = makeRunDir();
  // No tool_input at all.
  assert.doesNotThrow(() => post.run(askCtx({ ownedRun: { dir: runDir } })));
  // tool_input.questions missing.
  assert.doesNotThrow(() => post.run(askCtx({ toolInput: {}, ownedRun: { dir: runDir } })));
  // tool_input.questions not an array.
  assert.doesNotThrow(() => post.run(askCtx({ toolInput: { questions: 'nope' }, ownedRun: { dir: runDir } })));
  // A posed question missing header/options entirely.
  assert.doesNotThrow(() => post.run(askCtx({
    toolInput: { questions: [{ question: 'Q?' }] },
    toolResponse: { answers: { 'Q?': 'a' } },
    ownedRun: { dir: runDir },
  })));
  // tool_response missing entirely.
  assert.doesNotThrow(() => post.run(askCtx({
    toolInput: { questions: [{ question: 'Q?', header: 'H', options: [{ label: 'a' }] }] },
    ownedRun: { dir: runDir },
  })));
  // tool_response.answers not an object.
  assert.doesNotThrow(() => post.run(askCtx({
    toolInput: { questions: [{ question: 'Q?', header: 'H', options: [{ label: 'a' }] }] },
    toolResponse: { answers: 'not-an-object' },
    ownedRun: { dir: runDir },
  })));
  // An option missing its label.
  assert.doesNotThrow(() => post.run(askCtx({
    toolInput: { questions: [{ question: 'Q?', header: 'H', options: [{ description: 'no label' }] }] },
    toolResponse: { answers: { 'Q?': 'a' } },
    ownedRun: { dir: runDir },
  })));
  const events = readEvents(runDir).filter((e) => e.type === 'ask-user-question');
  assert.ok(events.length >= 6, 'every malformed call above should still log something, never throw');
});
```

- [ ] **Step 2: Run tests to verify they fail (function does not exist yet)**

Run: `node --test tests/hooks-post-tool-use-ask-user-question.test.js`
Expected: FAIL — every test fails because `post.run` does not yet branch on
`tool_name === 'AskUserQuestion'` (falls through `run(ctx)`'s Bash-only logic and returns `{}`
with no `events.jsonl` ever created, so the assertions reading `events.jsonl` throw an ENOENT).

Return to Task 2 Step 2 to implement, then continue at Task 2 Step 3.

---

### Task 4: Friction lens in `full-mode.md`

**Files:**
- Modify: `skills/reflect/full-mode.md`

**Interfaces:**
- Consumes: nothing (markdown instructions, not executable code).
- Produces: the canonical Friction lens definition — Task 5 (light-mode.md) references this
  task's wording rather than restating it independently, exactly as light mode already does for
  Near-misses/Fresh-start.

- [ ] **Step 1: Add the Friction lens row and its own subsection**

In `skills/reflect/full-mode.md`, change the lens table's heading and add a fifth row:

```markdown
## Step 2: Run Lenses — Full Mode (5 lenses + tradeoff review)

Runs all five reflection lenses plus a tradeoff review.

| Lens | Question | Surfaces |
|------|----------|----------|
| **1. Surprises** | "What surprised us?" — Unexpected constraints, library behavior, shape changes | Don'ts, skill updates |
| **2. Approach** | "What would we do differently?" — Better patterns discovered midway, over/under-engineering. Same evaluations as hindsight mode (Approach, Structure, Consolidation, Convention, Skills) — see `hindsight-mode.md`. | Skill updates, conventions, spec adjustments |
| **3. Near-misses** | "What broke or almost broke?" — Unexpected test failures, type errors, cross-platform ripples | Don'ts, testing patterns, gotchas |
| **4. Fresh start** | "If we started fresh?" — Would we choose the same approach? What would v2 look like? | Architectural alternatives; route via _shared/learning-routing.md |
| **5. Friction** | "Did the pipeline itself get in the way?" — Was every hook denial and AskUserQuestion stop this run actually necessary? | Upstream feedback (D5) via `_shared/learning-routing.md` |
```

Then add a new subsection, placed after the existing "Near-misses Chain Walk" subsection (after
the paragraph ending "...not a separate item.") and before "### Seed from Review Learnings":

```markdown
### Friction Lens

Unlike the other four lenses, Friction evaluates the pipeline's own behavior toward the operator
during this run, not the code that got built.

**Input:** the run's `events.jsonl` (no run dir / no file → this lens reports nothing), filtered
to: `wd-deny`, `gate-denial`, `wd-push-mismatch`, `wd-ambiguous`, `wd-foreign-teardown`,
`contract-violation` (all logged by `bin/lib/hooks/pre-tool-use.js`), and `ask-user-question`
(logged by `bin/lib/hooks/post-tool-use.js`).

**Membership rule:** an event qualifies only when it describes friction experienced by the run's
own operator — a denied action, a forced stop. `wd-foreign-session` is excluded on this basis: it
is logged when a *different* session than this run's owner attempts a wrong-checkout action, so
it describes that other session's friction, not this run's.

**Per-event avoidability.** For each qualifying event, judge whether it was necessary or whether
it indicates a claude-tweaks defect (a gate that shouldn't have fired) or gap (a decision the
plugin should have had a default for):

- *Avoidable* — a `gate-denial` firing on an action the gate's own stated policy condition
  doesn't actually match (a false positive); an `ask-user-question` whose header and options were
  fully answerable from CLAUDE.md content already in context.
- *Not avoidable* — a `wd-deny` firing exactly as `worktree.always` documents it should (a
  provable wrong-checkout commit); an `ask-user-question` posing a genuine judgment call with no
  stated project preference either way.

**Aggregate volume.** Independent of any single event's verdict, judge whether this run's total
stop count looks disproportionate to its own scope — weighed against the record's own `Estimated
tasks`/Deliverables count as a rough proportionality anchor (a 2-task record with 8 stops reads
differently than an 8-task record with 8 stops), never against a hardcoded number.

A finding from either judgment is an ordinary reflect insight from here on — route it through
Step 3's `_shared/learning-routing.md` classifier exactly like every other lens's finding. A
false-positive denial resolves to defect (rule 1); a recurring missing default resolves to gap
(rule 7). No new routing table.
```

- [ ] **Step 2: Verify the edit landed correctly**

```bash
grep -n "5. Friction\|### Friction Lens\|5 lenses + tradeoff review" skills/reflect/full-mode.md
```

Expected: three matches — the table row, the subsection heading, and the updated Step 2 heading.

- [ ] **Step 3: Commit**

```bash
git add skills/reflect/full-mode.md
git commit -m "Add the Friction lens to reflect full mode"
```

---

### Task 5: Friction lens in `light-mode.md`

**Files:**
- Modify: `skills/reflect/light-mode.md`

**Interfaces:**
- Consumes: Task 4's Friction Lens subsection (referenced by name, per this file's existing
  convention of reusing `full-mode.md`'s lens definitions rather than restating them).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add Friction to the lens list and update the framing prose**

In `skills/reflect/light-mode.md`, change the opening paragraph from:

```markdown
Light mode is a narrowed subset of full mode — see `full-mode.md` for the Near-misses/Fresh-start lens definitions this mode reuses verbatim; Surprises, Approach, and Tradeoff Review are dropped. **Why those two survive:** they are the lenses that can still catch a defect. Near-misses surfaces what almost went wrong, and Fresh-start asks what a second attempt would do differently — both read the finished work and can produce a Safety regression finding, which is what trips the ceremony escape hatch (`wrap-up/SKILL.md`'s Phase 1). Surprises, Approach, and the Tradeoff Review are narrative: valuable on a substantial change, pure fixed cost on the small ones `fast-lane` is for.
```

to:

```markdown
Light mode is a narrowed subset of full mode — see `full-mode.md` for the Near-misses/Fresh-start/Friction lens definitions this mode reuses verbatim; Surprises, Approach, and Tradeoff Review are dropped. **Why those three survive:** they are the lenses that can still catch a defect. Near-misses surfaces what almost went wrong, and Fresh-start asks what a second attempt would do differently — both read the finished work and can produce a Safety regression finding, which is what trips the ceremony escape hatch (`wrap-up/SKILL.md`'s Phase 1). Friction is orthogonal to code narrative depth — it judges the pipeline's own behavior toward the operator, not the size of the change — so a `fast-lane` record's session can still surface an avoidable gate denial or stop worth flagging. Surprises, Approach, and the Tradeoff Review are narrative: valuable on a substantial change, pure fixed cost on the small ones `fast-lane` is for.
```

Then change the Step 2 heading and table:

```markdown
## Step 2: Run Lenses — Light Mode (3 lenses, no tradeoff review)

| Lens | Question | Surfaces |
|------|----------|----------|
| **1. Near-misses** | "What broke or almost broke?" — Unexpected test failures, type errors, cross-platform ripples | Don'ts, testing patterns, gotchas |
| **2. Fresh start** | "If we started fresh?" — Would we choose the same approach? What would v2 look like? | Architectural alternatives; route via _shared/learning-routing.md |
| **3. Friction** | "Did the pipeline itself get in the way?" — Was every hook denial and AskUserQuestion stop this run actually necessary? | Upstream feedback (D5) via `_shared/learning-routing.md` |
```

And update the paragraph immediately below the table from "Surprises and Approach are skipped..."
— no change needed to that paragraph's substance (it already describes what's skipped, not what's
kept); leave it as-is.

- [ ] **Step 2: Verify the edit landed correctly**

```bash
grep -n "3. Friction\|3 lenses, no tradeoff review\|Near-misses/Fresh-start/Friction" skills/reflect/light-mode.md
```

Expected: three matches.

- [ ] **Step 3: Commit**

```bash
git add skills/reflect/light-mode.md
git commit -m "Add the Friction lens to reflect light mode"
```

---

### Task 6: Modes table in `reflect/SKILL.md`

**Files:**
- Modify: `skills/reflect/SKILL.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the Modes table**

In `skills/reflect/SKILL.md`, change:

```markdown
| **full** | All four lenses (Surprises, Approach, Near-misses, Fresh start) + Tradeoff review | `/claude-tweaks:wrap-up` Phase 1 | Post-review knowledge capture |
| **light** | Near-misses, Fresh start (no tradeoff review) | `/claude-tweaks:wrap-up` Phase 1, when `ceremony-profile: fast-lane`; or direct invocation with the `light` keyword | Cheap post-review capture for a fast-lane record, or a quick standalone pass after a small fix |
```

to:

```markdown
| **full** | All five lenses (Surprises, Approach, Near-misses, Fresh start, Friction) + Tradeoff review | `/claude-tweaks:wrap-up` Phase 1 | Post-review knowledge capture |
| **light** | Near-misses, Fresh start, Friction (no tradeoff review) | `/claude-tweaks:wrap-up` Phase 1, when `ceremony-profile: fast-lane`; or direct invocation with the `light` keyword | Cheap post-review capture for a fast-lane record, or a quick standalone pass after a small fix |
```

The **hindsight** row is unchanged — Friction does not run in hindsight mode (mid-pipeline,
during `/review`, before the run is complete).

- [ ] **Step 2: Verify the edit landed correctly**

```bash
grep -n "All five lenses\|Near-misses, Fresh start, Friction" skills/reflect/SKILL.md
```

Expected: two matches.

- [ ] **Step 3: Commit**

```bash
git add skills/reflect/SKILL.md
git commit -m "Update reflect's Modes table for the Friction lens"
```

---

### Task 7: New edge in `docs/skill-graph.md`

**Files:**
- Modify: `docs/skill-graph.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks — this is the plan's final task.

- [ ] **Step 1: Add the new edge row under `## reflect`**

In `docs/skill-graph.md`, in the `## reflect` section's table, add a row (any position — the
table has no stated ordering requirement):

```markdown
| `bin/lib/hooks/pre-tool-use.js` and `bin/lib/hooks/post-tool-use.js` | The Friction lens (`full-mode.md`/`light-mode.md`) reads denial events logged by the former and the `ask-user-question` event logged by the latter as its input source. |
```

- [ ] **Step 2: Verify the edit landed correctly**

```bash
grep -n "Friction lens.*full-mode.md.*light-mode.md" docs/skill-graph.md
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add docs/skill-graph.md
git commit -m "Add reflect's Friction-lens skill-graph edge to pre/post-tool-use.js"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** all 7 Deliverables from #452 map onto Tasks 1-7 one-to-one.
- **Type consistency:** `logAskUserQuestion`'s `questions` array shape
  (`{header, options, answer}`) is identical across Task 2's implementation, Task 3's tests, and
  Task 4's documented lens input description — verified by re-reading all three before finalizing
  this plan.
- **No placeholders:** every task's code and markdown snippets are complete and copy-pasteable;
  no `TBD`/"similar to Task N" placeholders.
