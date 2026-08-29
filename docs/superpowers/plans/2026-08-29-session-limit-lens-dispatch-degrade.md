# Session-limit lens-dispatch degrade path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Name the degrade path for `/claude-tweaks:review`'s Step 3 reproduction-pair dispatch when one of the two agents dies mid-flight to a session/usage limit, so a headless run knows what to do instead of improvising.

**Architecture:** Two prose edits — one paragraph in `plugin/skills/review/step3-lens-dispatch.md` (the reproduction-pair dispatch procedure) naming the retry-then-degrade sequence, and one sentence in `plugin/skills/_shared/subagent-output-contract.md`'s existing "Failed-agent retrieval" section classifying the session-limit signature as a terminal (non-retryable-now) failure distinct from a transient 5xx — plus a `node --test` conformance pin proving both additions landed and can go red.

**Tech Stack:** Markdown (skill prose), `node --test` (conformance pin).

**Spec:** `.claude-tweaks/pipelines/2026-08-29T182233-record-1449/work/1449-spec.md`

## Global Constraints

- No behavioral/code surface — this is a prose-only change to two skill files plus one test file.
- The new paragraph in `step3-lens-dispatch.md` must sit immediately after the existing sentence that cites `_shared/subagent-output-contract.md`'s "Failed-agent retrieval" section (line 58 as of this plan), inside the same blockquote block (`>`-prefixed), before the existing `- Findings present in both agents' outputs…` bullet list.
- The new sentence in `subagent-output-contract.md` goes inside the existing `## Failed-agent retrieval` section (do not create a new heading).
- AC1 requires `grep -n -i "session limit"` to be non-empty in both files — the new text must contain the literal phrase "session limit" (case-insensitive matches "session/usage limit" too, since it's a substring).
- AC2 requires the new literal to print 0 via `git show {base}:{file} | grep -c -F` and ≥1 at HEAD — the pin test proves this with `git show`, no tree mutation.

---

### Task 1: Degrade-path paragraph in `step3-lens-dispatch.md`

**Files:**
- Modify: `plugin/skills/review/step3-lens-dispatch.md:58` (insert new paragraph immediately after this line, before the blank line that precedes the bullet list)
- Test: `tests/session-limit-degrade-conformance.test.js` (Task 3)

**Interfaces:**
- Consumes: nothing (pure prose insertion)
- Produces: nothing consumed by other tasks — Task 3's test reads this file's live content directly

- [ ] **Step 1: Insert the paragraph**

Open `plugin/skills/review/step3-lens-dispatch.md`. Find this exact line (currently line 58):

```
> A dispatched lens agent that fails mid-flight is a different case from one that completes — see `_shared/subagent-output-contract.md`'s "Failed-agent retrieval" section for how to read its result cheaply, without blocking on the full envelope.
```

Immediately after it (same blockquote, next line, before the existing blank line that separates it from the `- Findings present in both agents' outputs…` bullet list), insert this new paragraph verbatim:

```
> **Reproduction-pair partner dies to a session/usage limit.** When one agent in a reproduction pair terminates early on an account session/usage limit (the `Agent terminated early due to an API error: You've hit your session limit` signature), retry that one agent once. If the retry also terminates the same way, treat the surviving partner as a Low-tier single read for that lens only — its findings enter `unconfirmed` unless elevated via the Direct-verification override below, never auto-promoted to `confirmed` on the strength of one agent alone. Log `STAGED {HH:MM:SS} — Reproduction: lens "{lens}" partner agent terminated on a session limit twice; single-read coverage. Reversibility: high.` to `decisions.md`, and carry a one-line coverage-caveat into the Step 7 summary and the PR verdict comment naming the affected lens.
```

- [ ] **Step 2: Verify the insertion landed in the right place**

Run: `grep -n -A2 "Failed-agent retrieval\" section for how to read" plugin/skills/review/step3-lens-dispatch.md`
Expected: the output shows the original citation line immediately followed by the new "Reproduction-pair partner dies to a session/usage limit" paragraph, both still inside `>` blockquote markers.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/review/step3-lens-dispatch.md
git commit -m "review: name the session-limit degrade path for reproduction-pair dispatch

refs #1449"
```

---

### Task 2: Terminal-failure-class sentence in `subagent-output-contract.md`

**Files:**
- Modify: `plugin/skills/_shared/subagent-output-contract.md` (the `## Failed-agent retrieval` section)
- Test: `tests/session-limit-degrade-conformance.test.js` (Task 3)

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by other tasks

- [ ] **Step 1: Insert the sentence**

Open `plugin/skills/_shared/subagent-output-contract.md`. Find the `## Failed-agent retrieval` section — its current body ends with this paragraph:

```
**Check the task-notification's `<status>` first.** `completed` → read the result as
documented above. `failed` → the full envelope is not worth blocking on: retrieve only the
tail — either a non-blocking `TaskOutput` call read for its trailing `<error>` block, or
`tail -n 50` on the notification's own `<output-file>` path — never a blocking full-envelope
`TaskOutput {block:true}`. The trailing error is the only actionable content; the rest is
raw transcript internals (measured at ~6% of one run's total tool-result characters for zero
net information when read in full).
```

Immediately after that paragraph (still inside the `## Failed-agent retrieval` section, before the next `## ` heading), add this new paragraph verbatim:

```
**The session-limit signature is a terminal, non-retryable-now failure class, distinct from a
transient 5xx.** An agent whose trailing `<error>` block reads `Agent terminated early due to an
API error: You've hit your session limit` will not succeed on an immediate retry the way a
transient 5xx/timeout might — the caller's account-level limit, not the agent's own work, caused
the termination. A dispatch site handling a reproduction-pair partner's death this way retries
once (to rule out a spurious one-off) and, on a second failure, degrades rather than retrying
again in a loop — see `review/step3-lens-dispatch.md`'s reproduction-pair section for the
degrade procedure this classification feeds.
```

- [ ] **Step 2: Verify the insertion landed in the right section**

Run: `grep -n -A2 "measured at ~6% of one run" plugin/skills/_shared/subagent-output-contract.md`
Expected: the output shows the end of the existing paragraph immediately followed by the new "The session-limit signature is a terminal" paragraph.

Run: `awk '/^## Failed-agent retrieval$/,/^## Exemption/' plugin/skills/_shared/subagent-output-contract.md | grep -c "session-limit signature is a terminal"`
Expected: `1` (the new paragraph is inside the Failed-agent retrieval section, before the next `## ` heading).

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/_shared/subagent-output-contract.md
git commit -m "subagent-output-contract: classify session-limit termination as terminal, not transient

refs #1449"
```

---

### Task 3: Prose-conformance pin with frozen control + go-red proof

**Files:**
- Create: `tests/session-limit-degrade-conformance.test.js`

**Interfaces:**
- Consumes: the live text of `plugin/skills/review/step3-lens-dispatch.md` and `plugin/skills/_shared/subagent-output-contract.md` (Tasks 1-2's output)
- Produces: nothing consumed by other tasks — this is the terminal task

- [ ] **Step 1: Write the failing test**

Create `tests/session-limit-degrade-conformance.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// #1449: review/step3-lens-dispatch.md's reproduction-pair dispatch never said what to
// do when one half of a pair dies to a session/usage limit mid-flight. This pins the
// two-file fix: a degrade-path paragraph in step3-lens-dispatch.md, and a terminal-vs-
// transient classification in subagent-output-contract.md's Failed-agent retrieval
// section.

const ROOT = path.join(__dirname, '..');
// Fixed ancestor SHA — the commit this branch forked from, before either file carried
// the session-limit text. Never a moving ref (HEAD would collapse red into green once
// this change lands) — skill-prose-conformance-tests' "Proving discrimination without
// editing the tree" section.
const BASE_SHA = 'aa813ba825b20e11df35413bbd7ebd3e43c5af9c';

const DISPATCH_PATH = 'plugin/skills/review/step3-lens-dispatch.md';
const CONTRACT_PATH = 'plugin/skills/_shared/subagent-output-contract.md';

const dispatchProse = fs.readFileSync(path.join(ROOT, DISPATCH_PATH), 'utf8');
const contractProse = fs.readFileSync(path.join(ROOT, CONTRACT_PATH), 'utf8');

test('base SHA is a real ancestor of HEAD (precondition for the git-show proof below)', () => {
  // Throws (non-zero exit) if BASE_SHA is not an ancestor — fails loud on a rebase or
  // history rewrite that would otherwise silently invalidate the go-red proof.
  execFileSync('git', ['merge-base', '--is-ancestor', BASE_SHA, 'HEAD'], { cwd: ROOT });
});

test('step3-lens-dispatch.md names the session-limit degrade path (#1449 AC1)', () => {
  assert.match(
    dispatchProse,
    /session[\s/-]?(?:\/usage)?[\s-]?limit/i,
    'step3-lens-dispatch.md must name the session/usage-limit termination case for a ' +
      'reproduction-pair partner — without it, a headless run has no documented degrade path.',
  );
  // The paragraph must live in the reproduction-pair dispatch section, adjacent to the
  // existing Failed-agent retrieval citation, not just anywhere in the file.
  assert.match(
    dispatchProse,
    /Failed-agent retrieval[^]*?session[\s/-]?(?:\/usage)?[\s-]?limit/i,
    'the session-limit paragraph must follow the existing Failed-agent retrieval citation ' +
      'in the reproduction-pair dispatch block, not live disconnected from it.',
  );
  assert.match(
    dispatchProse,
    /retry (?:that one agent |it )?once/i,
    'the degrade paragraph must state the retry-once step before falling back to a ' +
      'single-read degrade.',
  );
});

test('subagent-output-contract.md classifies the session-limit signature as terminal (#1449 AC1)', () => {
  assert.match(
    contractProse,
    /session[\s-]?limit/i,
    'subagent-output-contract.md must name the session-limit signature.',
  );
  const start = contractProse.indexOf('## Failed-agent retrieval');
  assert.notStrictEqual(start, -1, 'the contract must keep its Failed-agent retrieval section');
  const nextHeading = contractProse.indexOf('\n## ', start + 1);
  const section = contractProse.slice(start, nextHeading === -1 ? contractProse.length : nextHeading);
  assert.match(
    section,
    /session[\s-]?limit/i,
    'the session-limit classification must live inside the Failed-agent retrieval section ' +
      'itself, not somewhere else in the file that happens to mention it.',
  );
  assert.match(
    section,
    /terminal[^.]*transient|distinct from a\s*\ntransient|non-retryable-now/i,
    'the contract must distinguish the session-limit signature from a transient 5xx — ' +
      'that distinction is the whole point of naming it (AC per the record body).',
  );
});

test('go-red proof: the pinned literal is absent at the pre-change base SHA (#1449 AC2)', () => {
  for (const file of [DISPATCH_PATH, CONTRACT_PATH]) {
    const atBase = execFileSync(
      'bash',
      ['-c', `git show ${BASE_SHA}:${file} | grep -c -i -F "session limit" || true`],
      { cwd: ROOT, encoding: 'utf8' },
    ).trim();
    assert.strictEqual(
      atBase,
      '0',
      `${file} must NOT contain "session limit" (case-insensitive) at the pre-change base ` +
        `${BASE_SHA} — a non-zero count here means the literal pre-existed and this pin is vacuous.`,
    );

    const atHead = execFileSync(
      'bash',
      ['-c', `git show HEAD:${file} | grep -c -i -F "session limit" || true`],
      { cwd: ROOT, encoding: 'utf8' },
    ).trim();
    assert.ok(
      Number(atHead) >= 1,
      `${file} must contain "session limit" (case-insensitive) at HEAD — got ${atHead}.`,
    );
  }
});
```

- [ ] **Step 2: Run test to verify it fails before Tasks 1-2 land**

Run: `node --test tests/session-limit-degrade-conformance.test.js`
Expected: FAIL — the "names the session-limit degrade path" and "classifies the session-limit signature as terminal" tests fail with no match found (Tasks 1-2 haven't landed yet in a from-scratch execution order; if Tasks 1-2 already committed by the time this step runs, skip this expectation and proceed straight to Step 3's PASS check — see note below).

**Note on task ordering:** Tasks 1 and 2 land the prose first in this plan's own numbering. If executing strictly in order, this test file is written last and Step 2 above will already PASS (the literals already exist at HEAD) — that is fine; the go-red proof in the test itself (the `git show {BASE_SHA}` half) is what proves discriminating power, not this manual run. If an executor chooses to write this test before Tasks 1-2 for TDD ordering, Step 2's expectation of FAIL applies literally.

- [ ] **Step 3: Run test to verify it passes (after Tasks 1-2 have landed)**

Run: `node --test tests/session-limit-degrade-conformance.test.js`
Expected: PASS — all 5 tests green.

- [ ] **Step 4: Commit**

```bash
git add tests/session-limit-degrade-conformance.test.js
git commit -m "test: pin session-limit lens-dispatch degrade path (#1449)

refs #1449"
```
