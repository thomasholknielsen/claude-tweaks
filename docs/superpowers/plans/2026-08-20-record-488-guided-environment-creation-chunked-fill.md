# Chunked Instructions Fill (record #488) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `guided-environment-creation.md`'s Create procedure step 6 from freezing the browser
tab's renderer when it fills a multi-KB Instructions prompt via one unbounded synthetic `type`
call.

**Architecture:** This is a browser-automation *procedure* fix — a single markdown edit to step 6
of `plugin/skills/routine/guided-environment-creation.md`, replacing the single-shot `type` call
with an explicit bounded-chunk fill loop (chunk size + inter-chunk wait), documented inline. No
application code, no new files, no runtime component — the "implementation" is the procedure text
itself, since the browser-tool call sequence described there is what an agent literally executes
when it runs the Create procedure.

**Tech Stack:** Markdown skill file (plugin/skills/routine/), consumed by `/claude-tweaks:routine
create` and `/claude-tweaks:init` Step 15 via `mcp__claude-in-chrome__*` `type`/`wait` tool calls
(`backend=chrome` per the file's own header).

**Spec:** `.claude-tweaks/pipelines/2026-08-20T044151-record-488/work/488-spec.md`

## Global Constraints

- Preserve existing behavior for small prompts — no regression to the common short-instructions
  path (spec Deliverables, bullet 3).
- No other caller of `guided-environment-creation.md` (`/claude-tweaks:routine create`,
  `/claude-tweaks:init` Step 15) needs its own update beyond step 6 itself (spec Acceptance
  Criteria, last bullet) — verified by reading the full file: only Create step 6 fills the
  Instructions field; Ensure-setup-script, Audit, and Re-point never touch it.
- This is a browser-automation procedure fix with no code path to unit test (spec Gotchas) — the
  "test" for this plan is (a) the full `node --test tests/` suite (no regression to markdown
  prose-conformance tests), and (b) a manual read-through diff check that the new step 6 text is
  self-consistent and matches the file's existing prose conventions (numbered-step / bullet
  structure, confirmed-live phrasing where applicable).
- **Live browser verification is out of scope for this task's environment.** This session has no
  `mcp__claude-in-chrome__*` tools available (backend=chrome requires a human-invoked session with
  the extension paired — see the file's own header: "Human-invoked only"). Acceptance Criterion 2
  ("exercised... against a multi-KB prompt... without a renderer freeze") cannot be literally
  executed here. Task 1 documents the browser-tool call shape precisely enough to be exercised by
  a human or an interactive session later; Task 2 files this gap to the ledger as an open item
  rather than silently marking the criterion satisfied.

---

### Task 1: Rewrite step 6's Instructions-fill bullet to chunk with waits

**Files:**
- Modify: `plugin/skills/routine/guided-environment-creation.md:114-117` (Create procedure, step
  6's field-fill list — the "Type `instructions` into the "Instructions" textarea." bullet)

**Interfaces:**
- Consumes: nothing from other tasks (single-task plan).
- Produces: nothing consumed by other tasks — this task is the whole plan's deliverable.

- [ ] **Step 1: Read the current step 6 text and confirm the exact bullet to replace**

Run:
```bash
grep -n "Type .instructions. into the" plugin/skills/routine/guided-environment-creation.md
```
Expected: one match, on the line reading:
```
   - Type `instructions` into the "Instructions" textarea.
```
This confirms the exact anchor text before editing — a plan drafted against a slightly stale read
of the file must re-verify this line still matches before editing.

- [ ] **Step 2: Replace the bullet with the chunked-fill procedure**

Replace:
```
   - Type `instructions` into the "Instructions" textarea.
```
With:
```
   - Fill the "Instructions" textarea in bounded chunks rather than one unbounded `type` call.
     **Do not issue a single `type` call for the full `instructions` string.** Confirmed failure
     mode: a single-shot `type` of a multi-KB prompt (the common case — 6 of 7 shipped routine
     templates embed a multi-KB cloud self-heal preamble ahead of their `Then:
     /claude-tweaks:<skill>` kickoff line) froze the tab's renderer — `screenshot`/`read_page`
     timed out (`Script injection timed out`, then `Page still loading (executeScript waited
     45000ms for document_idle)`) for over a minute before partial recovery. Click the textarea to
     focus it, then split `instructions` into successive chunks of at most 500 characters (break
     each chunk at the nearest preceding whitespace boundary when one exists within the last 50
     characters of the cut point, so a word is not split mid-token; otherwise cut at exactly 500),
     and issue one `type` call per chunk into the already-focused field, inserting an explicit
     400ms `wait` between chunks so the renderer can catch up before the next injection. A prompt
     at or under 500 characters fits in a single chunk, so the existing single-`type`-call
     behavior for small prompts is unchanged.
```

Use the Edit tool for this — exact old_string/new_string match against Step 1's confirmed anchor
text (indentation preserved: the bullet is nested two levels under numbered step 6, matching its
sibling `Type \`routine_name\`...` bullet directly above it).

- [ ] **Step 3: Read the file back and confirm the surrounding structure is intact**

Run:
```bash
sed -n '114,135p' plugin/skills/routine/guided-environment-creation.md
```
Expected: the `routine_name` bullet unchanged directly above the new chunked-fill bullet, and the
`Click the "Schedule" trigger tile...` bullet unchanged directly below it — confirms the edit
didn't disturb neighboring list items or the numbered step 6 itself.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS, no new failures. This is a markdown-only prose edit with no prior test referencing
this file (`grep -rl "guided-environment-creation" tests/` returns nothing at plan-authoring time),
so this step is a regression backstop, not a red→green cycle.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/routine/guided-environment-creation.md
git commit -m "Chunk guided-environment-creation.md step 6's Instructions fill to avoid renderer freeze — refs #488"
```

### Task 2: Flag the unexercised live-verification acceptance criterion to the ledger

**Files:**
- None (ledger operation only — no code/doc file touched by this task).

**Interfaces:**
- Consumes: Task 1's commit (this task runs after Task 1 lands, so the ledger note can point at
  the concrete new step 6 text rather than a still-hypothetical edit).
- Produces: an open ledger item for `/claude-tweaks:wrap-up`'s Phase 3 gate (or a later `/flow`
  run's resolve gate) to surface for human resolution.

- [ ] **Step 1: Append an open ledger item**

Use `/claude-tweaks:ledger`'s add operation (phase `build/verification`, status `open`) with a note
along these lines: "Acceptance Criterion 2 (exercise the chunked fill against a multi-KB prompt
without a renderer freeze) could not be run in this build's non-interactive environment — no
`mcp__claude-in-chrome__*` tools available (backend=chrome is human-invoked only). Needs a human or
an interactive session running `/claude-tweaks:routine create` (or `/claude-tweaks:init` Step 15)
against a template with a multi-KB prompt (e.g. `code-health`'s routine-template.yml) to confirm no
freeze, then resolve this item."

This is not a code change — no commit for this task.

---

## Self-Review

**1. Spec coverage:**
- Deliverable 1 (replace/supplement the single-shot `type` call with a robust fill strategy) —
  Task 1, Step 2 (chunked `type` calls with waits).
- Deliverable 2 (document the chosen approach in step 6, including size threshold) — Task 1, Step 2
  (500-character threshold and 400ms wait stated inline in the new bullet).
- Deliverable 3 (preserve existing behavior for small prompts) — Task 1, Step 2's last sentence.
- Acceptance Criterion 1 (no unbounded single `type` call) — Task 1, Step 2.
- Acceptance Criterion 2 (exercised against a multi-KB prompt without freeze) — cannot be executed
  in this environment; explicitly carried as an open ledger item by Task 2 rather than silently
  dropped.
- Acceptance Criterion 3 (small prompts still fill correctly) — logically covered by the ≤500-char
  single-chunk path in Task 1; live confirmation shares Task 2's same environment constraint.
- Acceptance Criterion 4 (no other caller needs its own update) — confirmed during plan authoring
  by reading the full file: Ensure-setup-script/Audit/Re-point never fill the Instructions field.
  No task needed beyond Task 1.

**2. Placeholder scan:** No TBD/TODO markers; the replacement text is the literal content to write,
not a description of what to write.

**3. Type consistency:** N/A — no functions/types across tasks (markdown-only plan, single file).
