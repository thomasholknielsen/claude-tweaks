# feedback Step 4 dedup search — pre-scrub text no longer leaves the machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/feedback`'s Step 4 dedup search currently sends the free-text `summary` half of its
`{ component, summary }` fingerprint basis to GitHub's public `gh issue list --search` API before
Step 6's scrub gate has run. Restructure Step 4 so the `--search` keywords are derived from the
affected-component name only — inherently public vocabulary — never from the pre-scrub symptom
text, while leaving the Step 8 fingerprint computation's `{ component, summary }` basis
unchanged.

**Architecture:** `plugin/skills/feedback/SKILL.md` is a prose skill file followed live by the
agent executing `/feedback` — there is no executable module backing Step 4's search-keyword
derivation, so the fix is a prose edit, not a code change. Two spots need updating: Step 4's own
section (the `--search` derivation, and the sentence that currently says the fingerprint basis
uses "the same...inputs used for the search above" — no longer true post-fix), and Step 0's batch
loop cross-reference (which restates Step 4's dedup fingerprint basis and must stay accurate).

**Tech Stack:** Markdown skill prose; `node --test` for the new conformance test (this repo's
established pattern for pinning prose-only skill fixes — see
`tests/step3-routing-prose-exempt-conformance.test.js` for a recent precedent).

**Spec:** `.claude-tweaks/pipelines/2026-08-20T151937-record-539/work/539-spec.md` (materialized
from GitHub issue #539)

## Global Constraints

- No text that has not passed Step 6's scrub criteria may appear in the `--search` argument sent
  to `gh issue list` in Step 4 (spec AC).
- Step 4's dedup search must still function as a duplicate-detection mechanism — plausible matches
  still surface to the user (interactive) or flag the drafted item (batch mode) (spec AC).
- The Step 8 fingerprint marker (`fingerprintFromBasis('feedback', basis)` in
  `bin/lib/health-core/fingerprint.js`) must keep receiving the full, unmodified
  `{ component, summary }` basis — this fix touches only the Step 4 `--search` call (spec
  Deliverables + Gotchas).
- Scope stays narrow: the ordering/derivation fix only, not a broader Step 4 rewrite (spec
  Gotchas).

---

### Task 1: Narrow Step 4's `--search` derivation to the component name; update the stale cross-reference

**Files:**
- Modify: `plugin/skills/feedback/SKILL.md` (Step 4 section, ~lines 169-196; Step 0 batch-loop
  cross-reference, ~lines 89-91)
- Test: `tests/feedback-dedup-search-scrub-conformance.test.js` (new file)

**Interfaces:**
- Consumes: none — prose-only.
- Produces: prose rule text in `SKILL.md` that the agent executing `/feedback` follows live; no
  new exported function. "Tests" here are a conformance test pinning that the required text is
  present and correctly worded — the same pattern `tests/step3-routing-prose-exempt-conformance.test.js`
  already uses against a sibling prose file.

- [ ] **Step 1: Write the failing conformance test**

Create `tests/feedback-dedup-search-scrub-conformance.test.js`:

```javascript
'use strict';
// tests/feedback-dedup-search-scrub-conformance.test.js — pins that
// skills/feedback/SKILL.md (#539) derives Step 4's `gh issue list --search`
// keywords from the affected-component name only, never from pre-scrub
// free-text summary, while leaving Step 8's fingerprintBasis untouched.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MD_PATH = path.join(__dirname, '..', 'plugin', 'skills', 'feedback', 'SKILL.md');
const md = fs.readFileSync(MD_PATH, 'utf8');

test('Step 4 derives the --search keywords from the component name only', () => {
  assert.ok(/component[^.\n]*only/i.test(md), 'Step 4 must state the search keywords derive from the component name only');
});

test('Step 4 states the free-text summary never reaches the search call', () => {
  assert.ok(/never[^.\n]*(free-text|summary)[^.\n]*search|search[^.\n]*never[^.\n]*(free-text|summary)/i.test(md),
    'Step 4 must state the free-text symptom/summary is never sent to the public search API');
});

test('Step 8 fingerprintBasis still consumes the full { component, summary } basis, unmodified', () => {
  assert.ok(md.includes('fingerprintFromBasis'), 'must still cite fingerprintFromBasis');
  assert.ok(/full,? unscrubbed|unmodified.*basis|full.*basis/i.test(md),
    'must state the fingerprint basis stays full/unmodified');
});

test('Step 0 batch-loop cross-reference to the dedup fingerprint basis is still accurate', () => {
  assert.ok(md.includes("dedup fingerprint basis"), 'Step 0 must still cross-reference the dedup fingerprint basis');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/feedback-dedup-search-scrub-conformance.test.js`
Expected: FAIL — the component-name-only / never-sent-to-search assertions fail against today's
text (Step 4 currently derives search keywords from the full `{ component, summary }` basis); the
`fingerprintFromBasis` and Step 0 cross-reference assertions already pass (unaffected by the fix).

- [ ] **Step 3: Edit Step 4's search derivation**

In `plugin/skills/feedback/SKILL.md`, replace the Step 4 opening (currently):

```markdown
### Step 4: Dedup

Derive a fingerprint basis from the affected component plus the core symptom,
then search:

```bash
gh issue list --repo thomasholknielsen/claude-tweaks --search '<keywords>' --state all --limit 10 --json number,title,state,url
```

Show any plausible matches and ask whether to file anyway, comment on the
existing issue instead (then stop), or cancel.
```

with:

```markdown
### Step 4: Dedup

Derive the `--search` keywords from the affected component name **only** — never from the
free-text symptom/summary, since that text is draft-derived and has not yet passed Step 6's scrub
criteria (credentials, absolute paths outside the plugin, code excerpts, the reporting project's
name). A component name (a skill, contract, or CLI name from this project's own public docs) is
inherently public vocabulary and carries no privacy risk on its own — this is what keeps
draft-derived, potentially-private text from ever leaving the machine before the scrub gate runs:

```bash
gh issue list --repo thomasholknielsen/claude-tweaks --search '<component>' --state all --limit 10 --json number,title,state,url
```

Show any plausible matches and ask whether to file anyway, comment on the
existing issue instead (then stop), or cancel.
```

- [ ] **Step 4: Edit Step 4's fingerprintBasis paragraph so it no longer claims the same inputs feed the search**

Immediately below (currently):

```markdown
Derive `fingerprintBasis: { component, summary }` for the drafted item — the same
affected-component-plus-core-symptom inputs used for the search above — and carry it
into the drafts file built for Step 8. Computing the fingerprint marker embedded in
the body is not this step's job: `bin/file-feedback.js` derives it via
`fingerprintFromBasis('feedback', basis)` (`bin/lib/health-core/fingerprint.js`) when
it processes the draft, so a later run recognizes its own prior filing. Never call
`createFingerprint` directly here.
```

replace with:

```markdown
Derive `fingerprintBasis: { component, summary }` for the drafted item — the
affected-component-plus-core-symptom inputs, wider than what fed the narrowed search above — and
carry it into the drafts file built for Step 8, full and unscrubbed. This basis feeds a different
consumer than the search: `bin/file-feedback.js` derives the fingerprint marker via
`fingerprintFromBasis('feedback', basis)` (`bin/lib/health-core/fingerprint.js`) when it processes
the draft, so a later run recognizes its own prior filing — that stable dedup-on-refile detection
needs the full basis regardless of what the search above sends. Never call `createFingerprint`
directly here.
```

- [ ] **Step 5: Verify the Step 0 batch-loop cross-reference (~lines 89-91) stays accurate**

Read the current text: "Step 4's dedup fingerprint basis stays the affected component plus the
core symptom, exactly as today — the draft template's `**Objective:**`/`**Measurement:**`/`**Cost
this session:**` fields (Step 5) never join that basis." This describes the *fingerprintBasis*
composition (unchanged by this fix — still `{ component, summary }`), not the narrowed `--search`
keywords, so it remains accurate as written. No edit needed here; the conformance test's fourth
assertion pins that this sentence's anchor phrase ("dedup fingerprint basis") still appears.

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/feedback-dedup-search-scrub-conformance.test.js`
Expected: PASS

- [ ] **Step 7: Run the full existing feedback-adjacent suite to confirm no regression**

Run: `node --test tests/tidy-unfiled-backstop.test.js tests/bin-lib/skill-audit/anti-patterns.test.js tests/bin-lib/feedback/file-feedback.test.js tests/frontier-unattended-literal.test.js tests/transcript-judge-prose.test.js tests/feedback-dedup-search-scrub-conformance.test.js`
Expected: PASS — none of these pin Step 4's exact prior wording; `file-feedback.test.js` exercises
`fingerprintFromBasis`/`computeFingerprint` directly against a `fingerprintBasis` object, untouched
by this edit.

- [ ] **Step 8: Commit**

```bash
git add plugin/skills/feedback/SKILL.md tests/feedback-dedup-search-scrub-conformance.test.js
git commit -m "feedback: Step 4 dedup search derives keywords from component name only

refs #539"
```

---

### Task 2: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions elsewhere; Task 1 only edits prose in one skill file plus one new
conformance test.

- [ ] **Step 2: Commit (only if `npm test` surfaced and required any fix)**

If `npm test` is clean with no further changes, this step is a no-op — Task 1 already committed
its own work.
