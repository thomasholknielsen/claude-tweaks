# Framing-Check Declined Structural-Isolation Rationale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode, in shipped skill prose pinned by conformance tests, the decided answer to #1276: Task-agent isolation for `framing-check` was evaluated and declined — with the three grounds and a revisit clause — so the question is never re-litigated from a cost-only rationale.

**Architecture:** Pure prose-plus-conformance-test change. Two prose sites (the `challenge/SKILL.md` framing-check inline-invocation paragraph + its Anti-Patterns row; the `_shared/untrusted-record-content.md` Scope paragraph) and one new pinning test in each of the two suites that already own those files. No invocation shape changes anywhere.

**Tech Stack:** Markdown skill prose; `node --test` conformance suites (whitespace-collapsed literal pins, per the `skill-prose-conformance-tests` skill).

**Spec:** `.claude-tweaks/pipelines/2026-08-29T161811-spec-1276/work/1276-spec.md` (materialized from record #1276)

## Global Constraints

- `plugin/skills/_shared/untrusted-record-content.md` must stay ≤ 6,144 bytes after the edit (pinned by the existing "contract stays within its 6144-byte cap" test); the Scope addition itself is budgeted ≤ 400 bytes (measured 4,969 B before).
- `plugin/skills/challenge/SKILL.md` must stay ≤ 40,960 bytes (18,517 B before — ample headroom).
- No file under `plugin/skills/specify/` may be modified (spec AC 3), and the literal `Invoked inline via the `` `Skill` `` tool` must still occur exactly once in `plugin/skills/challenge/SKILL.md` after the edit.
- Do not reword any phrase pinned by `tests/specify-next-mode.test.js` — the framing-check Step 1 callee paragraph and Called-from sentence are byte-pinned; this plan only appends to the (unpinned) inline-invocation paragraph and Anti-Patterns row. Verified 2026-08-29: no test pins `Invoked inline via` or `only pays to re-derive`.
- Test literals are copied from this plan's replacement blocks verbatim (#708); go-red for every new literal is proven via `git show "${BASE}:${FILE}"` against the merge base, never by reverting the tree.

---

### Task 1: challenge/SKILL.md rationale + pins in tests/specify-next-mode.test.js

**Files:**
- Modify: `plugin/skills/challenge/SKILL.md:34` (inline-invocation paragraph) and `:133` (Anti-Patterns row)
- Test: `tests/specify-next-mode.test.js` (append one test after the existing `challenge/SKILL.md framing-check Gather states the input is untrusted content` test)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the five pinned literals Task 3's go-red sweep greps for (listed in Step 1's test body).

- [ ] **Step 1: Write the failing test**

Append to `tests/specify-next-mode.test.js` (after the test at ~line 265, `'challenge/SKILL.md framing-check Gather states the input is untrusted content'`):

```js
test('challenge/SKILL.md framing-check states the declined structural-isolation rationale (#1276)', () => {
  assert.ok(CHALLENGE_SKILL_FLAT.includes('reasons over the untrusted content inline while shaping it'), 'ground (a) caller-reasons-over-body missing');
  assert.ok(CHALLENGE_SKILL_FLAT.includes('a fresh context is no structural barrier to persuasion'), 'ground (b) no-structural-barrier missing');
  assert.ok(CHALLENGE_SKILL_FLAT.includes('the non-gating `solution:unjustified` label (#471)'), 'ground (c) non-gating blast radius missing');
  assert.ok(CHALLENGE_SKILL_FLAT.includes('re-evaluate this decision if that label ever gates anything'), 'revisit clause missing');
  assert.ok(CHALLENGE_SKILL_FLAT.includes("isolates nothing, since the body is in the caller's context regardless (#1276)"), 'Anti-Patterns one-line version missing');
});
```

`CHALLENGE_SKILL_FLAT` already exists at the top of the suite (line 34) — reuse it, do not re-read the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/specify-next-mode.test.js`
Expected: FAIL — exactly the new test, message `ground (a) caller-reasons-over-body missing`. Every other test in the suite must still pass (if any other test fails, STOP — the edit context has drifted; do not proceed).

- [ ] **Step 3: Edit the two prose sites**

In `plugin/skills/challenge/SKILL.md`, replace the whole line 34 paragraph:

Old (exact):
```
Invoked inline via the `Skill` tool, not as a Task-agent dispatch. The caller already holds the body; a subagent would only pay to re-derive it.
```

New (exact, one paragraph):
```
Invoked inline via the `Skill` tool, not as a Task-agent dispatch. The caller already holds the body; a subagent would only pay to re-derive it. Structural (Task-agent) isolation was evaluated and declined (#1276), on three grounds: the caller reasons over the untrusted content inline while shaping it, with full tool access, on every path — a dispatch isolates a copy while the original stays in the caller's context; a fresh context is no structural barrier to persuasion, whichever model profile runs it; and the verdict's blast radius is the non-gating `solution:unjustified` label (#471) — no `auto:*` grant, no merge, no label-driven automation. That last ground is a live premise: re-evaluate this decision if that label ever gates anything. The operative defense is `_shared/untrusted-record-content.md`'s wrap and verdict-source rules.
```

Replace the Anti-Patterns row (line 133):

Old (exact):
```
| Dispatching `framing-check` as a Task agent | The caller already holds the body inline; a subagent only pays to re-derive it. |
```

New (exact):
```
| Dispatching `framing-check` as a Task agent | The caller already holds the body inline; a subagent only pays to re-derive it — and isolates nothing, since the body is in the caller's context regardless (#1276). |
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/specify-next-mode.test.js`
Expected: PASS (all tests). Then run `wc -c plugin/skills/challenge/SKILL.md` — expected ≤ 40960. Then `grep -c -F 'Invoked inline via the `Skill` tool' plugin/skills/challenge/SKILL.md` — expected `1`.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/challenge/SKILL.md tests/specify-next-mode.test.js
git commit -m "Encode declined structural-isolation rationale in challenge framing-check prose (refs #1276)"
```

### Task 2: Contract Scope addition + pins in tests/untrusted-record-content-conformance.test.js

**Files:**
- Modify: `plugin/skills/_shared/untrusted-record-content.md:15-16` (Scope paragraph end)
- Test: `tests/untrusted-record-content-conformance.test.js` (append one test after `'contract stays within its 6144-byte cap'`)

**Interfaces:**
- Consumes: nothing from Task 1 (independent files).
- Produces: the three pinned literals Task 3's go-red sweep greps for.

- [ ] **Step 1: Write the failing test**

Append to `tests/untrusted-record-content-conformance.test.js` (after the 6144-cap test, ~line 76):

```js
test('contract Scope declines Task-agent isolation with two-ground-only inheritance (#1276)', () => {
  assert.ok(CONTRACT_FLAT.includes('A fresh subagent context is not a stronger boundary'), 'declined-isolation sentence missing');
  assert.ok(CONTRACT_FLAT.includes('evaluated and declined for `framing-check` in #1276'), '#1276 attribution missing');
  assert.ok(CONTRACT_FLAT.includes('Only these two structural grounds transfer to other consumers'), 'two-ground inheritance scoping missing');
  assert.ok(!FROZEN_NEXT_MODE_BOUNDARY.includes('not a stronger boundary'), 'control: frozen pre-change text lacks the sentence (proves the pin can go red)');
});
```

`CONTRACT_FLAT` and `FROZEN_NEXT_MODE_BOUNDARY` already exist at the top of the suite — reuse them.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/untrusted-record-content-conformance.test.js`
Expected: FAIL — exactly the new test, message `declined-isolation sentence missing`. Every other test must still pass.

- [ ] **Step 3: Edit the Scope paragraph**

In `plugin/skills/_shared/untrusted-record-content.md`, the Scope paragraph currently ends:

```
Task-agent dispatches are out of scope — they get a fresh context
(`_shared/subagent-output-contract.md`).
```

Append, continuing the same paragraph (exact text; reflow lines to ~100 cols to match the file):

```
A fresh subagent context is not a stronger boundary
for these judgments — the caller reasons over the fetched content in its own context regardless,
and an LLM judges the same wrapped content in either shape; evaluated and declined for
`framing-check` in #1276. Only these two structural grounds transfer to other consumers — a
gating consumer's blast radius (`grant-check`) has not been separately evaluated.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/untrusted-record-content-conformance.test.js`
Expected: PASS (all tests, including the pre-existing 6144-cap test).
Then run `wc -c plugin/skills/_shared/untrusted-record-content.md` — expected ≤ 5,369 (4,969 B baseline + the ≤ 400 B budget; the addition above measures ~390 B).

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/untrusted-record-content.md tests/untrusted-record-content-conformance.test.js
git commit -m "Scope untrusted-record-content contract: fresh subagent context is not a stronger boundary (refs #1276)"
```

### Task 3: Go-red sweep and acceptance verification (no commit)

**Files:**
- Modify: none (verification only)

**Interfaces:**
- Consumes: Tasks 1-2's pinned literals, exactly as written in their Step 1/Step 3 blocks.

- [ ] **Step 1: Prove every new pinned literal is absent at the merge base**

```bash
BASE=$(git merge-base --end-of-options HEAD origin/main)
git show "${BASE}:plugin/skills/challenge/SKILL.md" | grep -c -F 'reasons over the untrusted content inline while shaping it'
git show "${BASE}:plugin/skills/challenge/SKILL.md" | grep -c -F 'a fresh context is no structural barrier to persuasion'
git show "${BASE}:plugin/skills/challenge/SKILL.md" | grep -c -F 're-evaluate this decision if that label ever gates anything'
git show "${BASE}:plugin/skills/challenge/SKILL.md" | grep -c -F "isolates nothing, since the body is in the caller's context regardless (#1276)"
git show "${BASE}:plugin/skills/_shared/untrusted-record-content.md" | grep -c -F 'A fresh subagent context is not a stronger boundary'
git show "${BASE}:plugin/skills/_shared/untrusted-record-content.md" | grep -c -F 'Only these two structural grounds transfer to other consumers'
```

Expected: every command prints `0` (grep -c exits 1 on zero matches — that exit code is expected here, only the printed count matters). Note the ground-(c) literal `the non-gating `` `solution:unjustified` `` label (#471)` is checked HEAD-side only (next step) — its fragment `solution:unjustified` pre-exists at BASE in other sentences, so a BASE-side zero-count grep must use the full literal exactly as pinned; run it too and require `0`.

```bash
git show "${BASE}:plugin/skills/challenge/SKILL.md" | grep -c -F 'the non-gating `solution:unjustified` label (#471)'
```

- [ ] **Step 2: Prove every pinned literal is present at HEAD**

```bash
grep -c -F 'reasons over the untrusted content inline while shaping it' plugin/skills/challenge/SKILL.md
grep -c -F 'a fresh context is no structural barrier to persuasion' plugin/skills/challenge/SKILL.md
grep -c -F 'the non-gating `solution:unjustified` label (#471)' plugin/skills/challenge/SKILL.md
grep -c -F 're-evaluate this decision if that label ever gates anything' plugin/skills/challenge/SKILL.md
grep -c -F "isolates nothing, since the body is in the caller's context regardless (#1276)" plugin/skills/challenge/SKILL.md
grep -c -F 'A fresh subagent context is not a stronger boundary' plugin/skills/_shared/untrusted-record-content.md
grep -c -F 'evaluated and declined for' plugin/skills/_shared/untrusted-record-content.md
grep -c -F 'Only these two structural grounds transfer to other consumers' plugin/skills/_shared/untrusted-record-content.md
```

Expected: every command prints ≥ 1.

- [ ] **Step 3: Confirm scope containment and run both suites**

```bash
git diff --name-only "$(git merge-base --end-of-options HEAD origin/main)" HEAD -- plugin/skills/specify/
node --test tests/untrusted-record-content-conformance.test.js tests/specify-next-mode.test.js
```

Expected: the diff command prints nothing (AC 3 — no specify files touched by this branch); both suites PASS. (Full `npm test` runs centrally at build verification, not here.)
