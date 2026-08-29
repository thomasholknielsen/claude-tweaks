# specify: lever-checklist citation + third-party Task 0 guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/specify`'s spec template two Deliverables-authoring guidance additions per #606: (a) a lever-adding record's Deliverables cites `_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist by reference instead of restating or omitting it; (b) a Deliverable that encodes third-party CLI/API behavior gets a named blocking-empirical-Task-0 option (safe probe target + mandatory teardown + literal-capture rule).

**Architecture:** Prose-only additions to `plugin/skills/specify/spec-template.md` — no code paths, no schema changes. `plugin/skills/specify/SKILL.md` is not touched: it carries no restatement of the Deliverables-section guidance to cross-reference (confirmed by grep — the file's one `spec-template` mention is unrelated, about the `Surface:` metadata line), and it already sits at 39,220 bytes (95.7% of the 40 KB/40,960-byte ceiling, inside the ~10% headroom-check threshold) — leaving it alone avoids the split this record's own Gotchas flag as a risk. `spec-template.md` is 22,810 bytes, comfortably under the ceiling with room for both additions.

**Tech Stack:** Markdown skill-prose editing; `node --test` conformance suite (`skill-prose-conformance-tests` convention — byte-pinned regex assertions against the live file, proven red against frozen pre-change text).

**Spec:** `work/606-spec.md` (materialized from GitHub issue #606)

## Global Constraints

- Do not touch `plugin/skills/specify/SKILL.md` — no existing restatement to cross-reference, and it's near the byte ceiling.
- Do not restate or rewrite `_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist — cite it by reference only (record's own Gotchas).
- Do not touch the existing "Empirical Premise-Check Deliverables" section's pinned prose (`tests/review-risk-marker-verification.test.js` byte-pins several of its phrases) — add a new subsection alongside it, not a rewrite of the existing paragraphs.
- Re-measure `wc -c` on `spec-template.md` before committing (byte-ceiling convention).

---

### Task 1: Add the lever-checklist pointer to the Deliverables section

**Files:**
- Modify: `plugin/skills/specify/spec-template.md` (`## Deliverables` section, currently lines 52-57)

**Interfaces:**
- Consumes: nothing from an earlier task (first task).
- Produces: the pointer sentence Task 3's conformance test asserts on.

- [x] **Step 1: Write the test first (red)**

Add to `tests/review-risk-marker-verification.test.js` (same file already pinning this template's other named-pattern sections, so a new pattern-guidance addition lives beside its siblings) a new test asserting the Deliverables section cites the lever checklist by reference:

```javascript
test("spec-template.md's Deliverables section cites the lever-addition checklist by reference for lever-adding records", () => {
  assert.match(SPEC_TEMPLATE, /Adding a new policy lever/, 'names the checklist heading');
  assert.match(SPEC_TEMPLATE, /auto-mode-contract\.md/, 'cites the checklist\'s home file');
});
```

Run: `node --test tests/review-risk-marker-verification.test.js`
Expected: FAIL (new test, pattern not yet present in the live file — confirmed by running it against current HEAD before Step 2's edit).

- [x] **Step 2: Add the pointer sentence (green)**

Edit `plugin/skills/specify/spec-template.md`'s `## Deliverables` section (after the three placeholder bullets, before `## Acceptance Criteria`):

```markdown
## Deliverables

- [ ] {Concrete deliverable 1}
- [ ] {Concrete deliverable 2}
- [ ] ...

When a Deliverable adds a new Manifesto policy lever — a new `auto`-mode behavior surfaced through the Pipeline Config Manifesto and configurable via `.claude-tweaks/policy.yml` — cite `_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist by reference (name the file and heading) rather than restating its five touch points or naming only one of them. A lever's addition touches more files than its own logic; the checklist exists because a past lever-adding spec named only one file and three of the checklist's five items were missed until whole-branch review.
```

Run: `node --test tests/review-risk-marker-verification.test.js`
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add plugin/skills/specify/spec-template.md tests/review-risk-marker-verification.test.js
git commit -m "Cite the lever-addition checklist by reference from specify's Deliverables guidance (refs #606)"
```

---

### Task 2: Name the third-party CLI/API behavior Task 0 as a deliberate option

**Files:**
- Modify: `plugin/skills/specify/spec-template.md` (`## Empirical Premise-Check Deliverables` section, currently lines 158-180)

**Interfaces:**
- Consumes: nothing from Task 1 (independent section of the same file — sequential only to avoid a two-agent edit race on one file).
- Produces: the named-pattern subsection Task 3's conformance test asserts on.

- [x] **Step 1: Write the test first (red)**

Add to `tests/review-risk-marker-verification.test.js`:

```javascript
test("spec-template.md names the third-party CLI/API behavior Task 0 as a deliberate option, with its three constituent parts", () => {
  assert.match(SPEC_TEMPLATE, /[Tt]hird-party CLI\/API/, 'names the third-party CLI/API behavior case');
  assert.match(SPEC_TEMPLATE, /safe probe target/, 'names the safe-probe-target part');
  assert.match(SPEC_TEMPLATE, /mandatory teardown/, 'names the mandatory-teardown part');
  assert.match(SPEC_TEMPLATE, /literal-capture rule/, 'names the literal-capture-rule part');
});
```

Run: `node --test tests/review-risk-marker-verification.test.js`
Expected: FAIL (pattern not yet present).

- [x] **Step 2: Add the named subsection (green)**

Edit `plugin/skills/specify/spec-template.md`, inserting a new subsection immediately after the existing "Enumerating only the second list..." paragraph and before the "A Task 0 deliverable's captured behavior..." paragraph, inside `## Empirical Premise-Check Deliverables` — additive only, no existing sentence in that section is changed or removed:

```markdown
### Third-Party CLI/API Behavior Task 0

When the premise being checked is specifically how a **third-party CLI or API** behaves — not this project's own harness — name a blocking empirical Task 0 as a deliberate option rather than letting it get rediscovered per-record. Its three constituent parts, all required:

- **Safe probe target** — a throwaway/disposable target the probe can act against without touching real state (a scratch repo, an unprotected test branch, a sandboxed resource) — never the project's own production data or an artifact anyone else depends on.
- **Mandatory teardown** — the Task 0 deliverable itself includes tearing the probe target back down, unconditionally, whether the probe confirmed or reversed the assumed premise.
- **Literal-capture rule** — record the actually-observed behavior verbatim (the exact output, timing, or status — not a paraphrase) in the spec's `## Gotchas` or `## Technical Approach`, so a later reader can check the captured fact rather than re-trust the original assumption.

Example: #560's Task 0 probed `gh pr merge --auto`'s actual merge timing against a throwaway PR opened on a disposable base branch, tore that branch down unconditionally after capturing the result, and recorded the literal observed behavior — which reversed the plan's assumed premise (`gh pr merge --auto` does not wait for anything on an unprotected repo; it merges immediately) before any other deliverable's fixtures were written.
```

Run: `node --test tests/review-risk-marker-verification.test.js`
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add plugin/skills/specify/spec-template.md tests/review-risk-marker-verification.test.js
git commit -m "Name the third-party CLI/API behavior Task 0 as a deliberate specify option (refs #606)"
```

---

### Task 3: Byte-ceiling re-measurement and full-suite verification

**Files:**
- None modified — verification only.

**Interfaces:**
- Consumes: Tasks 1-2's edits.
- Produces: nothing consumed downstream (final task).

- [x] **Step 1: Re-measure the byte ceiling**

```bash
wc -c plugin/skills/specify/spec-template.md
```

Expected: comfortably under 40,960 bytes (started at 22,810; both additions together are roughly 1.8 KB, landing well under half the ceiling).

- [x] **Step 2: Run the full suite**

```bash
npm test
```

Expected: all suites green, including `tests/review-risk-marker-verification.test.js`'s new and pre-existing cases.
