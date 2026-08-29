# escalate-residue.js Label-Posture Header Comment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the deliberate minimal-label filing posture (#1216, option (a)) in `escalate-residue.js`'s header comment so a future reviewer or health sweep doesn't re-flag the "missing" work-record labels.

**Architecture:** Comment-only edit. A short posture paragraph is appended to the existing header comment block at the top of `plugin/bin/lib/reconcile/escalate-residue.js` (after the current gh-absent/transport note that ends at line 14, before `'use strict';`). No executable line changes anywhere; the module's exports, imports, and filing flow are untouched. The separate file-feedback import-rationale comment (lines 17–23) stays distinct — it answers "why shared code," this paragraph answers "why the label set is minimal."

**Tech Stack:** Node 18+ module, `node --test` for verification.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T153753-spec-1216/work/1216-spec.md` (materialized from GitHub issue #1216)

## Global Constraints

- `escalateResidue()`'s filing call keeps exactly `--label bug` — no `by:reconcile`, no `type:*`, no `risk:*`/`size:*`, no `ready` (spec Gotcha: "the whole point of the decision is that the label set stays exactly `bug`").
- `git diff` for the change touches only comment lines in `plugin/bin/lib/reconcile/escalate-residue.js` — no executable line changes, no other files.
- `plugin/skills/_shared/work-record.md`'s Origin row keeps exactly its current 6 members (this plan never touches that file; the verification step proves it).
- `tests/bin-lib/reconcile/escalate-residue.test.js` passes unmodified.

---

### Task 1: Append the posture paragraph to the header comment

**Files:**
- Modify: `plugin/bin/lib/reconcile/escalate-residue.js:14` (append after the header comment's last line, before `'use strict';`)
- Test: `tests/bin-lib/reconcile/escalate-residue.test.js` (existing — must pass unchanged; no test file edits)

**Interfaces:**
- Consumes: nothing from other tasks (single-task plan).
- Produces: nothing consumed downstream — prose only.

- [ ] **Step 1: Append the posture paragraph**

Insert immediately after the current line 14 (`// human reading \`reconcile\`'s JSON is the backstop.`), before `'use strict';`:

```js
//
// Label posture (#1216, decided 2026-08-29): filing with `--label bug` only
// is a deliberate choice, not a gap — never add `by:*`/`type:*`/`risk:*`/
// `size:*`/`ready` here. Risk/size are content judgments, and this module
// runs in the no-LLM contexts named above, which cannot score them; a
// mechanical always-low default fails independently (`ready` requires a
// spec-shaped body, which reconcile's terse auto-report is not). Enrichment
// belongs to the downstream path that demonstrably picks these issues up: a
// plain open issue IS a backlog-stage record, the scheduled `/specify next`
// routine shapes it headlessly, and `/backlog` grants route it to an
// autonomous build. No `by:reconcile` origin value, no scoring heuristic —
// closed #1216 is the recorded decision.
```

- [ ] **Step 2: Verify the diff is comment-only, one file**

Run: `git diff --stat` then `git diff -U0 -- plugin/bin/lib/reconcile/escalate-residue.js`
Expected: exactly one file changed; every added line begins with `//`; zero removed lines.

- [ ] **Step 3: Verify the paragraph satisfies the acceptance criteria's content assertions**

Run (case-insensitive, content-anchored greps against the file):
- `grep -ci "deliberate" plugin/bin/lib/reconcile/escalate-residue.js` — Expected: ≥ 1
- `grep -c "specify next" plugin/bin/lib/reconcile/escalate-residue.js` — Expected: ≥ 1 (names the trigger)
- `grep -c "backlog" plugin/bin/lib/reconcile/escalate-residue.js` — Expected: ≥ 1 (names the grant step)
- `grep -c "#1216" plugin/bin/lib/reconcile/escalate-residue.js` — Expected: ≥ 1 (references the decision record)

- [ ] **Step 4: Run the existing test suite unmodified**

Run: `node --test tests/bin-lib/reconcile/escalate-residue.test.js`
Expected: PASS, zero failures, zero skips, with `git diff --name-only` still showing no change under `tests/`.

- [ ] **Step 5: Verify the Origin enum was not touched**

Run: `git diff --name-only -- plugin/skills/_shared/work-record.md`
Expected: empty output (file untouched; its Origin row therefore still lists exactly its current 6 members).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/reconcile/escalate-residue.js
git commit -m "Document the deliberate minimal-label filing posture in escalate-residue.js's header — refs #1216"
```
