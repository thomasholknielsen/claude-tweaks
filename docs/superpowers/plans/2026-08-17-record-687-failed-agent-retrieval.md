# Failed-agent output retrieval rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Failed-agent retrieval" rule to `_shared/subagent-output-contract.md` so a dispatcher checks the task-notification status before blocking on a full `TaskOutput`, and cite it from the two fan-out dispatch sites that currently say "collect results" with no failure branch.

**Architecture:** Pure prose addition — no code, no tests beyond the existing skill-conventions/context-cost suites. One new subsection in the shared contract file, plus a one-line pointer in each of two dispatch-prose files.

**Tech Stack:** Markdown (skill prose).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T210742-spec-686-687-688-689-690-691-692-693/spec-687/work/687-spec.md`

## Global Constraints

- Keep the new rule under ~15 lines (spec's Technical Approach).
- Quote the task-notification's status vocabulary from an actually-observed notification, not from memory (spec's Gotchas) — this session has observed the literal values `completed` and `failed` in real `<task-notification>` blocks this conversation (e.g. the code-simplifier and fork notifications for specs 686/687 both carried `<status>completed</status>`; the harness's own tool documentation for the Agent tool states a dead agent's turn ends with a terminal API error, surfaced to the dispatcher as the agent's report — the concrete `<status>failed</status>` shape mirrors `completed`'s).
- No new stop, no new `AskUserQuestion` (spec's Gotchas).
- `subagent-output-contract.md` is currently 26,460 bytes against the 40,960-byte SKILL.md-class ceiling family — ~14.5 KB headroom, so a ~15-line addition (~700-900 bytes) is not close to the ceiling.

---

### Task 1: Add the Failed-agent retrieval rule

**Files:**
- Modify: `skills/_shared/subagent-output-contract.md`

**Interfaces:**
- Consumes: nothing new — this is a standalone prose subsection.
- Produces: a citable heading (`### Failed-agent retrieval`) that Task 2's two pointer files reference by name.

- [ ] **Step 1: Read the file's structure**

Read `skills/_shared/subagent-output-contract.md` in full. Find the status-line section (defines `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`) and the aggregation section — the new subsection goes immediately after whichever of the two sits later in the file, so it reads as a natural continuation of "how a dispatcher consumes a subagent's output."

- [ ] **Step 2: Insert the new subsection**

Insert this subsection (verbatim, adjust the heading level to match its new neighbors — likely `###`):

```markdown
### Failed-agent retrieval

A dispatched agent that dies mid-flight (session-limit interruption, tool crash) is a
different case from one that finished — do not treat both the same way when collecting
results.

**Check the task-notification's `<status>` first.** `completed` → read the result as
documented above. `failed` → the full envelope is not worth blocking on: retrieve only the
tail — either a non-blocking `TaskOutput` call read for its trailing `<error>` block, or
`tail -n 50` on the notification's own `<output-file>` path — never a blocking full-envelope
`TaskOutput {block:true}`. The trailing error is the only actionable content; the rest is
raw transcript internals (measured at ~6% of one run's total tool-result characters for zero
net information when read in full).
```

- [ ] **Step 3: Verify placement and size**

Run: `grep -n "Failed-agent" skills/_shared/subagent-output-contract.md`
Expected: one match, the new `### Failed-agent retrieval` heading.

Run: `wc -c skills/_shared/subagent-output-contract.md`
Expected: comfortably under 40,960 (started at 26,460; the addition is ~700-900 bytes).

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/subagent-output-contract.md
git commit -m "Add Failed-agent retrieval rule to the subagent output contract — refs #687"
```

---

### Task 2: Cite the rule from the two fan-out dispatch sites

**Files:**
- Modify: `skills/review/step3-lens-dispatch.md`
- Modify: `skills/dispatch/two-call-gate.md`

**Interfaces:**
- Consumes: the `### Failed-agent retrieval` heading Task 1 added to `_shared/subagent-output-contract.md`.
- Produces: nothing new for later tasks — this is the last task.

- [ ] **Step 1: Find the "collect results" prose in each file**

```bash
grep -n "collect" skills/review/step3-lens-dispatch.md skills/dispatch/two-call-gate.md
```

Read the matched lines in context (a few lines before/after each) to find the natural spot for a one-sentence pointer — right after wherever the file describes gathering the dispatched agents' outputs.

- [ ] **Step 2: Add a one-sentence pointer to each file**

In `skills/review/step3-lens-dispatch.md`, immediately after the sentence describing result collection, add:

```markdown
A dispatched lens agent that fails mid-flight is a different case from one that completes —
see `_shared/subagent-output-contract.md`'s "Failed-agent retrieval" section for how to read
its result cheaply, without blocking on the full envelope.
```

In `skills/dispatch/two-call-gate.md`, immediately after the sentence describing result
collection for the two-call gate, add:

```markdown
A dispatched agent that fails mid-flight is a different case from one that completes — see
`_shared/subagent-output-contract.md`'s "Failed-agent retrieval" section for how to read its
result cheaply, without blocking on the full envelope.
```

Adjust each sentence's exact wording only as needed to fit the surrounding paragraph's voice — the pointer, not a restatement of the rule, is what must land in both files (per the spec's Deliverable 3: "one sentence + pointer each, no restatement").

- [ ] **Step 3: Verify both pointers landed**

```bash
grep -n "Failed-agent retrieval" skills/review/step3-lens-dispatch.md skills/dispatch/two-call-gate.md
```

Expected: one match in each file.

- [ ] **Step 4: Run the full suite**

```bash
npm test
```

Expected: all tests pass, including the skill-conventions / context-cost suites (per the spec's Acceptance Criteria).

- [ ] **Step 5: Commit**

```bash
git add skills/review/step3-lens-dispatch.md skills/dispatch/two-call-gate.md
git commit -m "Cite the Failed-agent retrieval rule from review and dispatch fan-out prose — refs #687"
```
