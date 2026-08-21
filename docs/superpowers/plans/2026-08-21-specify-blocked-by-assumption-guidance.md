# Specify Blocked-By Assumption Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/specify`'s decomposition-time `Blocked by #N: {assumption}` text from asserting a sibling's not-yet-decided prose/documentation shape, and make the Step 5 red-team catch it when it does.

**Architecture:** Prose-only fix to two `/specify` skill files. `record-creation.md`'s Linking pass gets authoring guidance (mechanical-vs-prose distinction, one example each) at the point it composes the `Blocked by #N: {assumption}` line. `red-team.md`'s Skeptical-Reviewer dispatch prompt gets a persona-scoped addendum instructing the agent to apply that same distinction when a `Blocked by #N: {assumption}` line is present in the record it's reviewing, surfacing a match through the existing unstated-assumption finding path (no new write-back mechanism).

**Tech Stack:** Markdown skill prose; `node --test` for the conformance pin.

**Spec:** `.claude-tweaks/pipelines/2026-08-21T143434-spec-316/work/316-spec.md` (materialized from GitHub issue #316)

## Global Constraints

- Prose-only — no runtime code path exists to change (the assumption text is LLM-authored at decomposition time and LLM-read at red-team time).
- The new guidance narrows to `Blocked by #N: {assumption}` lines specifically — must not read as "avoid all Blocked-by assumptions" (most are fine today).
- `red-team.md`'s Template A prompt block is inlined verbatim into every persona's dispatch (Implementer/Maintainer/Skeptical Reviewer share one template) — the new instruction must be worded so it only fires for the Skeptical Reviewer persona, not the other two.

---

### Task 1: Author the mechanical-vs-prose guidance in record-creation.md's Linking pass

**Files:**
- Modify: `plugin/skills/specify/record-creation.md:286` (the `Blocked by #N: {assumption}` bullet in the `work-backend: github-issues`, `work-links: body-text` Linking pass)
- Test: `tests/specify-record-creation-linking.test.js` (extended in Task 3, not this task — this task only changes the prose)

**Interfaces:**
- Consumes: nothing (prose-only edit)
- Produces: the exact guidance text Task 3's conformance test pins by substring match. This task must land the final wording before Task 3 writes its assertions, since Task 3 quotes this task's own sentences.

- [ ] **Step 1: Read the current bullet for exact insertion point**

The Linking pass's `work-backend: github-issues`, `work-links: body-text` section (starting at line 283) has three bullets. Line 286 is the one that introduces the extended `Blocked by #N: {assumption}` form:

```
- Sub-issue ↔ sub-issue / sub-issue ↔ pre-existing record — add one `Blocked by #N` line to the dependent sub-issue's body per dependency (line-anchored, matching `record.js`'s `DEP_RE`: the literal text `Blocked by #` followed by the number, at the start of a line), then a single `gh issue edit $SUB_ISSUE_NUM --body-file` with the recomposed body. When the dependency is between two sub-issues of this same decomposition (not a pre-existing companion record) and this decomposition produced 4 or more sub-issues (the Cross-Spec Promises threshold — see item 3 below), write the extended form instead — `Blocked by #N: {one-line assumption}` — stating what the dependent sub-issue actually needs from #N (`record.js`'s `parseDependencyAssumptions` reads the trailing text; bare lines and pre-existing-record links are unaffected).
```

- [ ] **Step 2: Insert a new bullet immediately after line 286, before the "Readers parse this back out" bullet**

Insert this new bullet (exact text — Task 3 pins substrings of it):

```markdown
- **Authoring the assumption text — mechanical, not prose-shape.** The assumption text should assert a structural fact about #N's own deliverable — a function, symbol, API, file, or exported artifact existing — never a specific prose string, documentation wording, or a claim about what #N's own eventual `## Non-Goals` will or won't scope out. A sibling's `## Non-Goals` narrows *how something is described*, not *whether it structurally exists*, so a mechanical assertion survives that narrowing and a prose-shape one doesn't. Safe example: `Blocked by #211: exposes getStatus() on the queue module`. Fragile example (avoid): `Blocked by #211: documents the retry-window default as "5 minutes" in its README section` — #211's own scoping decision can legitimately drop that exact wording from its docs while still shipping the capability, stranding this check.
```

The file after this edit reads (lines 285-288):

```markdown
- Parent ↔ sub-issue — append one task-list line per sub-issue to the parent's body, `- [ ] #{subIssueNum}`, then a single `gh issue edit $PARENT_NUM --body-file` with the recomposed body (design summary + Decision Rationale below + the task list).
- Sub-issue ↔ sub-issue / sub-issue ↔ pre-existing record — add one `Blocked by #N` line to the dependent sub-issue's body per dependency (line-anchored, matching `record.js`'s `DEP_RE`: the literal text `Blocked by #` followed by the number, at the start of a line), then a single `gh issue edit $SUB_ISSUE_NUM --body-file` with the recomposed body. When the dependency is between two sub-issues of this same decomposition (not a pre-existing companion record) and this decomposition produced 4 or more sub-issues (the Cross-Spec Promises threshold — see item 3 below), write the extended form instead — `Blocked by #N: {one-line assumption}` — stating what the dependent sub-issue actually needs from #N (`record.js`'s `parseDependencyAssumptions` reads the trailing text; bare lines and pre-existing-record links are unaffected).
- **Authoring the assumption text — mechanical, not prose-shape.** The assumption text should assert a structural fact about #N's own deliverable — a function, symbol, API, file, or exported artifact existing — never a specific prose string, documentation wording, or a claim about what #N's own eventual `## Non-Goals` will or won't scope out. A sibling's `## Non-Goals` narrows *how something is described*, not *whether it structurally exists*, so a mechanical assertion survives that narrowing and a prose-shape one doesn't. Safe example: `Blocked by #211: exposes getStatus() on the queue module`. Fragile example (avoid): `Blocked by #211: documents the retry-window default as "5 minutes" in its README section` — #211's own scoping decision can legitimately drop that exact wording from its docs while still shipping the capability, stranding this check.
- Readers parse this back out with `record.js`'s `parseDependencies(body)` — it returns every `Blocked by #N` target as a deduped, ordered array; a mid-line mention doesn't count, only a line-starting one does.
```

- [ ] **Step 3: Verify with a targeted grep (no test suite yet — Task 3 writes the pinning test)**

Run: `grep -n "mechanical, not prose-shape" plugin/skills/specify/record-creation.md`
Expected: one match, at the new bullet.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/specify/record-creation.md
git commit -m "Add mechanical-vs-prose authoring guidance to specify's Blocked-by assumption text (#316)"
```

---

### Task 2: Extend red-team.md's Skeptical Reviewer dispatch prompt

**Files:**
- Modify: `plugin/skills/specify/red-team.md:23-25` (the Template A prompt block, between the `Lens question:` line and the `Constraint:` line)

**Interfaces:**
- Consumes: nothing (prose-only edit)
- Produces: the persona-scoped addendum text that later, at real `/specify` decomposition time, causes a Skeptical-Reviewer-persona agent to check `Blocked by #N: {assumption}` lines for prose-shape assumptions and surface a finding via the existing write-back procedure (§ Write-back procedure, unchanged — no new finding-delivery mechanism is added).

- [ ] **Step 1: Read the current Template A block for exact insertion point**

Lines 22-25 currently read:

```
> Task scope: Read the sub-issue record below as {Implementer | Maintainer | Skeptical Reviewer}, then answer the lens question. Fetch it first — `work-backend: github-issues`: run `gh issue view {subIssueNum} --json body -q .body`; `work-backend: local-files`: Read `{recordPath}` directly. Exactly one applies per dispatch — never pass both a record number and a file path to the same agent.
> Lens question: {persona's lens question — verbatim from the table below}
> Constraint: Surface only ambiguities, gaps, and unstated assumptions. Not stylistic feedback. Not approval/rejection. Focus on the 3-5 most load-bearing items, not exhaustive enumeration. Read-only — do not modify the record.
>
> Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.
```

- [ ] **Step 2: Insert a new addendum line between the `Lens question:` line and the `Constraint:` line**

Insert (exact text):

```
> Skeptical Reviewer addendum: if your persona above is Skeptical Reviewer and the record body contains a `Blocked by #N: {assumption}` line, additionally judge that trailing assumption text against this narrower check — does it assert a structural fact (a function, symbol, API, file, or exported artifact existing on #N) or a prose/documentation-shape claim (a specific string, wording, or a prediction about what #N's own `## Non-Goals` will or won't scope out)? A prose-shape assumption is fragile — #N's own later scoping decision can legitimately drop that exact wording while still shipping the capability — and must be surfaced as an unstated-assumption finding at that line's location, through the same findings table below. A structural assumption is not a finding under this check. Skip this addendum entirely when your persona above is Implementer or Maintainer, or when the record carries no `Blocked by #N: {assumption}` line.
```

The block after this edit reads (lines 22-27):

```
> Task scope: Read the sub-issue record below as {Implementer | Maintainer | Skeptical Reviewer}, then answer the lens question. Fetch it first — `work-backend: github-issues`: run `gh issue view {subIssueNum} --json body -q .body`; `work-backend: local-files`: Read `{recordPath}` directly. Exactly one applies per dispatch — never pass both a record number and a file path to the same agent.
> Lens question: {persona's lens question — verbatim from the table below}
> Skeptical Reviewer addendum: if your persona above is Skeptical Reviewer and the record body contains a `Blocked by #N: {assumption}` line, additionally judge that trailing assumption text against this narrower check — does it assert a structural fact (a function, symbol, API, file, or exported artifact existing on #N) or a prose/documentation-shape claim (a specific string, wording, or a prediction about what #N's own `## Non-Goals` will or won't scope out)? A prose-shape assumption is fragile — #N's own later scoping decision can legitimately drop that exact wording while still shipping the capability — and must be surfaced as an unstated-assumption finding at that line's location, through the same findings table below. A structural assumption is not a finding under this check. Skip this addendum entirely when your persona above is Implementer or Maintainer, or when the record carries no `Blocked by #N: {assumption}` line.
> Constraint: Surface only ambiguities, gaps, and unstated assumptions. Not stylistic feedback. Not approval/rejection. Focus on the 3-5 most load-bearing items, not exhaustive enumeration. Read-only — do not modify the record.
>
> Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.
```

- [ ] **Step 3: Verify with a targeted grep**

Run: `grep -n "Skeptical Reviewer addendum" plugin/skills/specify/red-team.md`
Expected: one match, at the new line.

- [ ] **Step 4: Hand-trace both constructed scenarios against the new prompt text (this is the AC2/AC3 verification — there is no runtime harness for an LLM-judged dispatch prompt, so this trace is the plan's verification step for those two ACs)**

Scenario A — mechanical assumption (AC3, must NOT be flagged): a sub-issue's body carries `Blocked by #211: exposes getStatus() on the queue module`. Applying the new addendum's check: this asserts a structural fact (a symbol, `getStatus()`, existing on #211's deliverable) — not a prose/documentation-shape claim. Per the addendum's own text ("A structural assumption is not a finding under this check"), a Skeptical-Reviewer agent following this prompt does not surface a finding for this line.

Scenario B — prose-shape assumption (AC2, must BE flagged): a sub-issue's body carries `Blocked by #211: documents the retry-window default as "5 minutes" in its README section`. Applying the new addendum's check: this asserts a specific documentation wording ("5 minutes" in a README section) — a prose/documentation-shape claim, not a structural fact. Per the addendum's own text, a Skeptical-Reviewer agent following this prompt surfaces this as an unstated-assumption finding at that line's location, via the existing findings-table output format (§ Template A's `OUTPUT FORMAT`) and the existing write-back procedure (§ Write-back procedure, `<!-- ambiguity: -->` marker or `## Open Questions` row per that section's location-precision rule).

Record this trace in the commit message body (Step 5) so it travels with the change as the AC2/AC3 evidence — this repo has no other mechanism to pin an LLM-judged prompt's discrimination behavior.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/specify/red-team.md
git commit -m "$(cat <<'EOF'
Extend red-team's Skeptical Reviewer to flag prose-shape Blocked-by assumptions (#316)

Hand-traced against two constructed scenarios (see plan Task 2 Step 4):
- Mechanical assumption (`exposes getStatus() on the queue module`) — not flagged.
- Prose-shape assumption (`documents the retry-window default as "5 minutes"
  in its README section`) — flagged as an unstated-assumption finding.
EOF
)"
```

---

### Task 3: Add the conformance test pinning record-creation.md's new guidance

**Files:**
- Modify: `tests/specify-record-creation-linking.test.js` (append a new `test(...)` block — this file already reads `plugin/skills/specify/record-creation.md` once at module scope, so no new file is needed)

**Interfaces:**
- Consumes: `text` (the module-scope `fs.readFileSync` result already defined at the top of the file, line 17) — same variable every existing test in this file reads.
- Produces: nothing consumed elsewhere; this is a leaf conformance test.

- [ ] **Step 1: Write the failing test**

Append to `tests/specify-record-creation-linking.test.js` (after the existing last test, currently ending at line 43):

```javascript
test('the Blocked-by assumption bullet distinguishes mechanical from prose-shape assumptions', () => {
  assert.match(text, /mechanical, not prose-shape/, 'record-creation.md must carry the mechanical-vs-prose authoring rule');
  assert.match(text, /never a specific prose string, documentation wording/, 'the rule must rule out prose/documentation-shape assumptions specifically');
  assert.match(text, /exposes getStatus\(\) on the queue module/, 'the rule must include a mechanical (safe) example');
  assert.match(text, /documents the retry-window default as "5 minutes"/, 'the rule must include a prose-shape (fragile) example');
});
```

- [ ] **Step 2: Run test to verify it fails (Task 1 not yet landed when run standalone; run after Task 1 to confirm PASS instead — see note)**

Since Tasks 1-3 in this plan run in dependency order (subagent-driven-development dispatches Task 1 before Task 3), this test is written and run for the first time *after* Task 1's edit already landed. Confirm the TDD discipline by checking it out of order once, locally, before finalizing:

```bash
git stash push -- plugin/skills/specify/record-creation.md   # temporarily remove Task 1's edit
node --test tests/specify-record-creation-linking.test.js
```

Expected: the new test FAILS (the other four existing tests still pass) — confirms the test actually exercises the new prose rather than trivially passing.

```bash
git stash pop   # restore Task 1's edit
```

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test tests/specify-record-creation-linking.test.js`
Expected: all 5 tests PASS (4 pre-existing + the 1 new one).

- [ ] **Step 4: Commit**

```bash
git add tests/specify-record-creation-linking.test.js
git commit -m "Pin the mechanical-vs-prose Blocked-by assumption guidance in a conformance test (#316)"
```

---

## Self-Review

**Spec coverage:**
- Deliverable 1 (record-creation.md guidance + two examples) → Task 1.
- Deliverable 2 (red-team.md Skeptical Reviewer extension) → Task 2.
- Deliverable 3 (conformance test) → Task 3.
- AC1 (guidance documents the distinction + one example each) → Task 1 Step 2's exact text (two examples: safe/fragile).
- AC2 (prose-shape assumption scenario produces a red-team finding) → Task 2 Step 4 Scenario B (hand-traced; no runtime harness exists for an LLM-judged dispatch prompt).
- AC3 (mechanical assumption scenario produces no finding) → Task 2 Step 4 Scenario A.
- AC4 (conformance test exists and passes) → Task 3.

**Placeholder scan:** no TBD/TODO; every step shows the literal inserted text and the exact resulting file section, not a description of what to insert.

**Type consistency:** N/A — no code types; the two example strings used in Task 1's prose (`getStatus()` / retry-window "5 minutes") are the same two strings Task 3's test asserts on, kept identical across tasks by copying verbatim rather than re-describing.
