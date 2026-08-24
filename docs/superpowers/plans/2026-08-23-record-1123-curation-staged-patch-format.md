# Record #1123: Inline staged-patch.md's diff format into curation-engine.md dispatch prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `wrap-up/curation-engine.md` section 4's dispatch-prompt contract lists what every curation-row judge dispatch inlines (worklist entry, judge file text, payload JSON template, `stagePath` self-verification) but never mentions `_shared/staged-patch.md`'s own artifact format — so a dispatched judge has no explicit instruction to produce a literal `diff --git` block, and can (observed in record #701) return free-text before/after description instead, forcing the console's slower re-derivation fallback even for a trivial single-clause fix. Add the artifact-format instruction, mirroring the existing `stagePath` self-verification paragraph's own "(both branches)" citation pattern.

**Architecture:** Prose-only edit, one new paragraph plus one list addition, in `plugin/skills/wrap-up/curation-engine.md` section 4. No code changes.

**Tech Stack:** Markdown skill prose + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T081916-spec-1068-1103-1122-1130-1140-1170-1183-1059-1060-1123-1129-1131-1137-1145-1146-1147-1148-1171-1172-1174-1181-1184-1034-1051-1138-1139-1167-1175-1176-1177/spec-1123/work/1123-spec.md`

## Global Constraints

- Worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177`, branch `worktree-flow+spec-1068-1177`; every shell step `cd`s there.
- Commit message imperative, body ends `refs #1123` (never closes/fixes).
- **Field scope decision (recorded before writing code):** `_shared/staged-patch.md`'s full preamble is `Target:`/`Invariant:`/`Finding:`/`Staged-at:`/`Ledger:` (5 fields — confirmed via `tests/staged-patch-contract.test.js`'s `'contract file exists with its three named sections'` test, which asserts all 5 field names appear in the contract file). `review/step3-routing.md`'s own citation of the contract (line 54) includes `Ledger:` because a review finding is appended to a ledger row before staging. Curation-engine.md's findings do **not** route through that ledger mechanism (grepped section 4 for `Ledger:` — zero hits; curation findings pipe through `record` into `engine-state.json`, not a `docs/plans/{feature}-ledger.md` row). This record's own text (Current State, Deliverables) explicitly names only 4 fields — `Target:`/`Invariant:`/`Finding:`/`Staged-at:` — consistent with that scope. The new paragraph therefore names exactly those 4 fields, not 5, and does not claim curation findings carry a `Ledger:` value they don't have.

### Confirmed occurrence sites (verified at plan time)

- `plugin/skills/wrap-up/curation-engine.md` line 127 — the fan-out branch's dispatch-prompt-inline sentence, which explicitly enumerates what's inlined ("the row's worklist entry, the judge file's full text, the literal payload JSON template, and the `stagePath` self-verification instruction below").
- `plugin/skills/wrap-up/curation-engine.md` line 129 — the singleton branch. Does NOT itself enumerate what's inlined into the dispatch prompt (unlike line 127) — it's covered by the later "(both branches)" paragraphs instead, the same way the existing `stagePath` self-verification paragraph (**"Judge self-verification of `stagePath` (both branches)."**) covers the singleton without line 129 needing its own explicit mention. No edit needed at line 129 itself.
- The insertion point for the new paragraph: immediately before the existing **"Judge self-verification of `stagePath` (both branches)."** paragraph, mirroring its exact heading/citation style (`**{Name} (both branches).** Every dispatch prompt — the fan-out and the singleton alike — inlines this instruction verbatim: ...`).

### Task 1: Add the staged-patch artifact-format instruction

**Files:**
- Modify: `plugin/skills/wrap-up/curation-engine.md` (section 4, ~line 127 and the paragraph immediately before the `stagePath` self-verification paragraph)
- Modify: `tests/staged-patch-contract.test.js` (add curation-engine.md to `STAGING_SITES`, or a dedicated pin — see Step 3)

**Interfaces:** none — self-contained prose + test edit.

- [ ] **Step 1: Add the new paragraph**

In `plugin/skills/wrap-up/curation-engine.md`, immediately before the paragraph beginning `**Judge self-verification of \`stagePath\` (both branches).**`, insert this new paragraph (as its own paragraph, blank line before and after):

```markdown
**Staged-patch artifact format (both branches).** Every dispatch prompt — the fan-out and the singleton alike — inlines `_shared/staged-patch.md`'s Artifact format section verbatim: for any finding staged as a concrete file edit, the payload's staged file must open with the `Target:` / `Invariant:` / `Finding:` / `Staged-at:` preamble followed by a literal `diff --git` block — not a free-text before/after description. A description-only staged file is not the artifact format: the console's fast `git apply --check` path needs the diff bytes, and a judge that returns prose instead forces `staged-patch.md`'s slower re-derivation fallback even for a trivial single-clause insertion (#1123, observed in record #701's wrap-up: two of three Docs findings came back description-only with no `diff --git` section).
```

- [ ] **Step 2: Extend the fan-out branch's inline-elements list**

In the same file, in the paragraph beginning `> **Parallel execution (conditional):**` (line 127), change:

```
the dispatch prompt inlines the row's worklist entry, the judge file's full text, the literal payload JSON template, and the `stagePath` self-verification instruction below (with `{ABS_STAGE_DIR}` substituted); the agent returns the payload as its Template output.
```

to:

```
the dispatch prompt inlines the row's worklist entry, the judge file's full text, the literal payload JSON template, the `stagePath` self-verification instruction below, and the staged-patch artifact format below (with `{ABS_STAGE_DIR}` substituted); the agent returns the payload as its Template output.
```

Change nothing else in that paragraph or line 129 (the singleton branch — already covered by the new "(both branches)" paragraph per the Global Constraints note above).

- [ ] **Step 3: Write a conformance test pinning the new paragraph**

Add to `tests/staged-patch-contract.test.js`, after the existing `STAGING_SITES` loop's tests (find the closing of that `for` loop and insert after it):

```js
test('wrap-up/curation-engine.md dispatch prompts inline the staged-patch artifact format', () => {
  const text = read('wrap-up', 'curation-engine.md');
  assert.match(text, /Staged-patch artifact format \(both branches\)/, 'names the paragraph');
  assert.match(text, /_shared\/staged-patch\.md.{0,40}Artifact format/, 'cites the contract file by its Artifact format section');
  for (const field of ['Target:', 'Invariant:', 'Finding:', 'Staged-at:']) {
    assert.ok(text.includes(field), `curation-engine.md names the ${field} preamble field`);
  }
  assert.match(text, /diff --git/, 'requires a literal diff --git block');
  assert.match(text, /staged-patch artifact format below/, 'the fan-out branch\'s inline-elements list references it');
});
```

- [ ] **Step 4: Run the target test files**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/staged-patch-contract.test.js tests/curation-judge-stagepath.test.js 2>&1 | tail -20`
Expected: all pass, including the new test from Step 3.

- [ ] **Step 5: Full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && npm test > /tmp/1123-full.txt 2>&1; tail -8 /tmp/1123-full.txt; grep "^not ok" /tmp/1123-full.txt`
Expected: 0 failures (the `resolvePrStateAsync` event-loop test and the already-tracked `recordDecline` concurrency test, GitHub issue #1192, are known unrelated flakes this session — re-run any failing file in isolation via `node --test <file>` before treating it as real).

- [ ] **Step 6: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && git add plugin/skills/wrap-up/curation-engine.md tests/staged-patch-contract.test.js && git commit -m "Inline staged-patch.md's artifact format into curation-engine.md dispatch prompts

Section 4's dispatch-prompt contract named the worklist entry, judge file
text, payload template, and stagePath self-verification as what every
curation-row dispatch inlines — but never staged-patch.md's own Target:/
Invariant:/Finding:/Staged-at: preamble + diff --git format. Observed in
record #701: two of three Docs findings came back as free-text before/
after blocks instead, forcing the console's slower re-derivation fallback
even for trivial single-clause fixes. A new paragraph, mirroring the
existing stagePath self-verification paragraph's (both branches) pattern,
closes the gap; a conformance test pins it.

refs #1123"
```

## Verification against Acceptance Criteria

- **AC1** (curation-engine.md section 4 documents the staged-patch preamble+diff format as part of what every dispatch prompt inlines): Steps 1-2.
- **AC2** (a future dispatch produces a file that passes `git apply --check` on the fast path): a documentation-contract fix cannot itself prove a *future* dispatch's actual output — the Gotchas section of the spec itself acknowledges this ("verify the fix actually closes the gap by checking a future wrap-up's staged findings... rather than assuming the documentation change alone suffices"). This plan closes the documented gap (AC1) and pins it with a conformance test (Step 3); confirming AC2 empirically requires observing an actual future curation-row dispatch that stages a finding, which is outside this record's own build — noted here rather than silently assumed satisfied.

## Scope keywords:

curation-engine.md, staged-patch.md, diff --git, stagePath, dispatch prompt
