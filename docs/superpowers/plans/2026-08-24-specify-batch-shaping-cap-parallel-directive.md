# Specify Batch-Shaping Cap and Parallel-Execution Directive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document a batch-size stance for `/claude-tweaks:specify`'s comma-list batch shaping form, and add a `> **Parallel execution:**` directive to `shaping-mode.md` naming which per-record work is independent versus sequential.

**Architecture:** Two prose-only edits to existing `plugin/skills/specify/*.md` files — no code changes, no new tests (the plan wires assertions into the three already-pinned test files' existing content-scan pattern... actually those three files already pass without new tests; this plan only needs to keep them green, not extend them).

**Tech Stack:** Markdown skill files; `node --test` for the pinned conformance suites.

**Spec:** `.claude-tweaks/pipelines/2026-08-24T044855-record-759/work/759-spec.md` (materialized from GitHub issue #759)

## Global Constraints

- Only `plugin/` ships to users — edit `plugin/skills/specify/SKILL.md` and `plugin/skills/specify/shaping-mode.md`, never a top-level `skills/` path.
- `tests/argument-hint-input.test.js`, `tests/reference-card-argument-hint.test.js`, and `tests/specify-batch-input.test.js` must stay green — none of them constrain the new prose's exact wording (they check argument-hint/`## Input` sync and pre-existing per-record-loop/parallel-safety phrases), so this is a compatibility check, not a content target.
- Match the established `> **Parallel execution:**` blockquote convention used elsewhere in the repo (`flow/materialize.md`'s Resolution section, `build/SKILL.md`'s Common Step 5.5, `flow/multi-spec.md`'s Frontmatter pre-flight) — same blockquote marker, same "Use parallel tool calls" opening, cite a sibling file's precedent rather than re-deriving the rationale.

---

### Task 1: Document the batch-size stance in `SKILL.md`

**Files:**
- Modify: `plugin/skills/specify/SKILL.md` (the "Comma-list batch form" paragraph inside `## Input`, currently starting `**Comma-list batch form (\`#N[,#M...]\` — shaping-mode-only).**`)
- Test: `tests/specify-batch-input.test.js` (existing, no changes needed — verifies this paragraph still states `shaping-mode-only`)

**Interfaces:**
- Consumes: nothing (prose-only edit)
- Produces: nothing consumed by other tasks — this task and Task 2 are independent edits to different files

- [ ] **Step 1: Read the current paragraph and neighboring Range form for precedent**

The Range form paragraph (immediately below the batch paragraph in the same file) already states an explicit numeric cap with rationale: `"A range expanding to more than 25 elements (B - A + 1 > 25) is a hard input error naming the element count... guarding against a typo like #1-#705 attempting to shape hundreds of records."` The comma-list batch form has no equivalent — it has no cap at all today.

Run: `grep -n "Comma-list batch form" plugin/skills/specify/SKILL.md`
Expected: one match, the paragraph starting `**Comma-list batch form (\`#N[,#M...]\` — shaping-mode-only).**`

- [ ] **Step 2: Append the batch-size stance sentence to the end of the paragraph**

Decision: no hard cap — unlike the Range form (which caps at 25 as a typo guard against an unbounded numeric expansion), a comma-list batch is hand-typed element by element, so there's no equivalent fat-finger risk; cost scales linearly with batch size (2 sequential inline sub-skill invocations + 1 body rewrite per record), so state that stance rather than an arbitrary limit.

Append this sentence to the very end of the "Comma-list batch form" paragraph (after the existing final sentence, which ends `...`/`claude-tweaks:capture`'s born-ready chain shapes exactly one record per invocation, and that contract does not change here.`), same paragraph, no blank line inserted:

```
No batch-size cap — unlike the range form's typo-guard limit below, a comma-list is hand-typed element by element with no equivalent fat-finger risk, and cost scales linearly with batch size (two sequential inline sub-skill invocations plus one body rewrite per record, per `shaping-mode.md`'s per-record loop): a very large batch simply takes proportionally longer, so split it across multiple invocations only for turnaround, never because of a correctness limit.
```

- [ ] **Step 3: Verify the paragraph still parses correctly**

Run: `node --test tests/specify-batch-input.test.js`
Expected: PASS — `shaping-mode-only` still appears in the paragraph body (untouched by this edit), and no other assertion in this file inspects this paragraph's exact wording.

- [ ] **Step 4: Run the full pinned-test set for this deliverable**

Run: `node --test tests/argument-hint-input.test.js tests/reference-card-argument-hint.test.js tests/specify-batch-input.test.js`
Expected: PASS (0 failures) — this edit only appended a sentence inside an existing paragraph; it did not touch `argument-hint:` frontmatter or any bracketed token these two other suites scan for.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/specify/SKILL.md
git commit -m "Document batch-size stance for specify's comma-list shaping form — refs #759"
```

---

### Task 2: Add the Parallel-execution directive to `shaping-mode.md`

**Files:**
- Modify: `plugin/skills/specify/shaping-mode.md` (insert after the existing "Parallel-safety." paragraph, before the `---` horizontal rule that follows it)
- Test: `tests/specify-batch-input.test.js` (existing — pins the pre-existing `**Parallel-safety.**` callout; must remain present verbatim)

**Interfaces:**
- Consumes: nothing (prose-only edit, independent of Task 1)
- Produces: nothing consumed by other tasks

- [ ] **Step 1: Read the current file structure around the insertion point**

Run: `grep -n "Parallel-safety\|^---$" plugin/skills/specify/shaping-mode.md`
Expected: `**Parallel-safety.**` appears once, immediately followed (after a blank line) by the `---` horizontal rule that separates the file's intro from its numbered procedure (`### Edit the body into spec shape`).

**Do not confuse this new directive with the existing `**Parallel-safety.**` callout** — that one is about write-concurrency safety across records (multiple records may be shaped concurrently under `work-backend: github-issues`); the new directive is about which *reads* inside a single record's shaping pass can run as parallel tool calls. Both stay, as separate paragraphs.

- [ ] **Step 2: Identify which reads are independent per this file's own opening paragraph**

The file's opening paragraph (`**Batch = the same procedure, once per record.**`) already names the two upfront batched-once operations: "Sniff every record's surface first (Step 2.5a needs only the fetched content)" and "resolve the one batched design-intent question." Per `materialize.md`'s own Resolution section (`> **Parallel execution:** ... resolving N record references (the gh issue view / local-store reads below) are independent per-record fetches and should run concurrently`), the underlying per-record fetch this file's surface sniff depends on is the same parallelizable operation.

Independent (parallelizable): the per-record resolution fetch (`gh issue view` / local-store read) each record needs before its surface sniff — the same fetch `materialize.md`'s Resolution already parallelizes, reused here rather than re-fetched — and the surface sniff itself (Step 2.5a), since it only reads already-fetched content and writes nothing.

Sequential (not parallelizable): the per-record write calls (compose-then-write-once, `ceremony-check #{n}`, `framing-check #{n}` — each mutates that record's live issue/label state and must not race a sibling record's write), and the single batched design-intent question (`AskUserQuestion` is one call by construction, already batched across records per the Metadata block section).

- [ ] **Step 3: Insert the directive**

Insert this blockquote as a new paragraph immediately after the existing `**Parallel-safety.**` paragraph and before the `---` rule, matching the established convention's phrasing (`flow/materialize.md`'s Resolution section, `build/SKILL.md`'s Common Step 5.5):

```
> **Parallel execution:** On a comma-list batch, the per-record resolution fetch (`gh issue view` / local-store read) and Step 2.5a's surface sniff are independent per-record reads — the same fetches `flow/materialize.md`'s Resolution already parallelizes — and should run concurrently across every record in the batch. The per-record write calls (compose-then-write-once, `ceremony-check #{n}`, `framing-check #{n}`) and the single batched design-intent question stay sequential — each write mutates that record's live issue/label state and must not race a sibling record's write.
```

- [ ] **Step 4: Verify the file still parses correctly and the existing pin still holds**

Run: `node --test tests/specify-batch-input.test.js`
Expected: PASS — the `**Parallel-safety.**` assertion (`shaping-mode.md has no Parallel-safety callout`) still finds its unmodified paragraph; the new directive is a separate addition, not a replacement.

- [ ] **Step 5: Run the full pinned-test set for this deliverable**

Run: `node --test tests/argument-hint-input.test.js tests/reference-card-argument-hint.test.js tests/specify-batch-input.test.js`
Expected: PASS (0 failures).

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/specify/shaping-mode.md
git commit -m "Add Parallel-execution directive to specify's shaping-mode batch loop — refs #759"
```

---

## Final verification

- [ ] Run the full pinned test set once more after both tasks: `node --test tests/argument-hint-input.test.js tests/reference-card-argument-hint.test.js tests/specify-batch-input.test.js`
- [ ] Re-read both edited paragraphs together (`SKILL.md`'s batch paragraph, `shaping-mode.md`'s new directive) to confirm they cross-reference consistently (the `SKILL.md` sentence names `shaping-mode.md`'s per-record loop; the `shaping-mode.md` directive names `materialize.md`'s Resolution as the shared fetch it reuses) — no contradictory claims about cost or concurrency.
