# Demo Validate Precondition Before Finish-Flow Merge Decision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/claude-tweaks:build`'s Next Actions from recommending `/superpowers:finishing-a-development-branch`'s merge decision ahead of a browser-based review/visual check, and make the requirement to run that check first (for UI-dependent work) an explicit, documented precondition rather than an implicit ordering nobody enforces.

**Architecture:** Root-cause analysis of the record's reproducing scenario ("reach the 'Implementation complete, what would you like to do?' merge decision" — the literal text of `finishing-a-development-branch`'s Step 4 prompt) traced to two independent gaps: (1) `plugin/skills/build/SKILL.md`'s `## Next Actions` section explicitly swaps the recommended slot from the review line to the finish-branch line whenever git strategy is `worktree` (the default) — regardless of whether the change is UI-dependent or whether review has run yet — which directly contradicts the skill's own documented lifecycle order (`/build → /stories → /test → /review → /wrap-up`); (2) CLAUDE.md's (and its shipped template's) "Superpowers overrides" line already stops `subagent-driven-development`/`executing-plans` from *auto*-invoking `finishing-a-development-branch`, but says nothing about a Validate/visual-review precondition for a *human-or-agent-initiated* invocation of that skill, which is the gap that lets an ad hoc (non-`/flow`) session skip straight from "done" to "merged" for UI work. Both are markdown/prose-only skills — no runtime code path exists to intercept a third-party skill's own internal prompt — so the fix is the two claude-tweaks-owned integration points, backed by prose-conformance tests per this repo's `skill-prose-conformance-tests` convention.

**Tech Stack:** Markdown skill files (`plugin/skills/**/*.md`), `node --test` conformance suites under `tests/`.

**Spec:** `.claude-tweaks/pipelines/archive/2026-08-24T104342-record-808/work/808-spec.md` (materialized from GitHub issue #808 — "demo: visual verification isn't required before the finish-gate merge decision").

**Scope keywords:** finishing-a-development-branch, Next Actions, Superpowers overrides, recommended slot, Validate

## Global Constraints

- Surface: backend (record #808's own `Surface:` line) — this plan changes only markdown skill prose and its pinning tests; no application UI, no browser dependency to satisfy for this build's own verification.
- `/superpowers:finishing-a-development-branch` lives outside this repo's `plugin/` payload (a third-party skill shipped by the `superpowers` plugin) and must never be edited directly — every change in this plan targets a claude-tweaks-owned file that governs how/when that skill gets invoked, never the skill itself.
- Detection rule reuses the existing `Surface:`/`surface:` signal (`/specify`'s Step 2.5a sniff, lifted into the materialized header per `skills/flow/materialize.md`, and `design-wrapper/frontend-detection.md`'s Layer 2/3) — this plan does not invent a new detection mechanism, per the spec's Technical Approach.
- Backend/infra records must not be forced through a browser check (spec Acceptance Criteria #3 / Gotchas) — both edits below key off the existing UI-changed / frontend-surface signal, never a blanket rule.
- Raw HTML rendering does not satisfy the check (spec Acceptance Criteria #2) — this plan routes toward the two channels that already do a real rendered check (`/claude-tweaks:review {N} full`'s visual-review delegation, and `/claude-tweaks:demo`'s Validate step), and introduces no new HTML-only shortcut.

---

### Task 1: Stop `/build`'s Next Actions from recommending finish-branch ahead of review

**Files:**
- Modify: `plugin/skills/build/SKILL.md:316-328`
- Test: `tests/build-next-actions-review-before-finish.test.js`

**Interfaces:**
- Consumes: nothing from an earlier task (first task in this plan).
- Produces: the corrected `## Next Actions` table + rendering paragraph in `build/SKILL.md`, verified by the new test's `assertClaimPinned` helper (pattern used again by Task 2's own test, but each test file is independent — no shared runtime import between them).

- [ ] **Step 1: Read the current section to confirm line numbers are still accurate**

```bash
sed -n '312,329p' plugin/skills/build/SKILL.md
```

Expected output (the section as it stands before this task's edit):

```
## Next Actions

Generate 2-4 lines based on context. The signal-to-option lookup table below stays as-is — it's the assistant's own logic for picking which lines apply to the current build's signals, never itself shown to the user:

| Signal | Option |
|--------|--------|
| UI changed + browser available | `/claude-tweaks:review {N} full` — code + visual review **(Recommended)** |
| No browser or no UI | `/claude-tweaks:review {N}` — code review **(Recommended)** |
| QA stories exist (`stories/*.yaml` or `stories/*.yml`) | `/claude-tweaks:test qa` — validate {X} QA stories before review |
| Worktree mode | `/superpowers:finishing-a-development-branch` — merge, PR, or discard the feature branch **(Recommended in worktree mode)** |

Once the signals are resolved, render as plain markdown (docs/skill-authoring.md's Skill handoffs convention), one line per applicable signal, bolding whichever line is recommended and suffixing it `(recommended)` — normally the review line, chosen per the browser-availability signal above (do not collapse the two branches into always-`full`: UI changed AND a browser is available → the full-review line; otherwise → the plain-review line); in worktree mode, the finish-branch line takes the recommended slot instead:

`/claude-tweaks:review {N} full` — code + visual review (when UI changed and a browser is available)
`/claude-tweaks:review {N}` — code review (when no UI change or no browser)
`/claude-tweaks:test qa` — validate {X} QA stories before review (when QA stories exist)
`/superpowers:finishing-a-development-branch` — merge, PR, or discard the feature branch (when in worktree mode)
```

If the sed output differs from the block above, stop and re-read the file in full before editing — line numbers may have drifted from a concurrent edit.

- [ ] **Step 2: Edit the table row and the rendering paragraph**

Replace lines 316-328 (the table through the four example lines) with:

```markdown
| Signal | Option |
|--------|--------|
| UI changed + browser available | `/claude-tweaks:review {N} full` — code + visual review **(Recommended)** |
| No browser or no UI | `/claude-tweaks:review {N}` — code review **(Recommended)** |
| QA stories exist (`stories/*.yaml` or `stories/*.yml`) | `/claude-tweaks:test qa` — validate {X} QA stories before review |
| Worktree mode | `/superpowers:finishing-a-development-branch` — merge, PR, or discard the feature branch (never the recommended slot — see below) |

Once the signals are resolved, render as plain markdown (docs/skill-authoring.md's Skill handoffs convention), one line per applicable signal, bolding whichever line is recommended and suffixing it `(recommended)`. **The recommended slot is always the review line** — chosen per the browser-availability signal above (do not collapse the two branches into always-`full`: UI changed AND a browser is available → the full-review line; otherwise → the plain-review line). **The finish-branch line is never the recommended slot, in worktree mode or otherwise** (#808): `/build`'s own lifecycle diagram runs review before finishing the branch (`/build → /stories → /test → /review → /wrap-up`), and recommending the finish-branch line over review let a UI-dependent build reach `finishing-a-development-branch`'s merge decision — "Implementation complete. What would you like to do?" — before any browser-based visual check had run. The UI-changed signal driving the top row is the same `Surface:`/frontend-detection signal `/specify`'s Step 2.5a and `design-wrapper/frontend-detection.md`'s Layer 2/3 already use, so a backend-only build (no UI changed) is unaffected — it still gets the plain-review line recommended, exactly as before:

`/claude-tweaks:review {N} full` — code + visual review (when UI changed and a browser is available)
`/claude-tweaks:review {N}` — code review (when no UI change or no browser)
`/claude-tweaks:test qa` — validate {X} QA stories before review (when QA stories exist)
`/superpowers:finishing-a-development-branch` — merge, PR, or discard the feature branch (when in worktree mode; never bolded/recommended here)
```

- [ ] **Step 3: Verify the edit landed correctly**

```bash
grep -n "never the recommended slot" plugin/skills/build/SKILL.md
grep -n "takes the recommended slot instead" plugin/skills/build/SKILL.md
```

Expected: the first command prints two matching lines (table row + paragraph); the second command prints nothing (the old override clause is gone).

- [ ] **Step 4: Write the conformance test**

Create `tests/build-next-actions-review-before-finish.test.js`:

```js
'use strict';
// tests/build-next-actions-review-before-finish.test.js — pins #808: /build's
// Next Actions section must never recommend /superpowers:finishing-a-development-branch's
// merge decision ahead of the review/visual-check line. Before this fix, worktree mode
// (the default git strategy) unconditionally swapped the recommended slot onto the
// finish-branch line regardless of whether the change was UI-dependent or whether review
// had run yet — this test freezes that pre-change paragraph as a fixture and proves the
// new pattern discriminates against it (skill-prose-conformance-tests' "prove go-red"
// pattern, [IL-105]).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const buildSkill = fs.readFileSync(path.join(ROOT, 'plugin', 'skills', 'build', 'SKILL.md'), 'utf8');

// The pre-change Next Actions rendering paragraph (#808) — the clause that swapped the
// recommended slot onto the finish-branch line whenever git strategy was worktree.
const PRE_CHANGE_PARAGRAPH = `Once the signals are resolved, render as plain markdown (docs/skill-authoring.md's Skill handoffs convention), one line per applicable signal, bolding whichever line is recommended and suffixing it \`(recommended)\` — normally the review line, chosen per the browser-availability signal above (do not collapse the two branches into always-\`full\`: UI changed AND a browser is available → the full-review line; otherwise → the plain-review line); in worktree mode, the finish-branch line takes the recommended slot instead:`;

// The pre-change table row for the Worktree-mode signal.
const PRE_CHANGE_ROW = '| Worktree mode | `/superpowers:finishing-a-development-branch` — merge, PR, or discard the feature branch **(Recommended in worktree mode)** |';

// One claim per call: the pattern must match the shipped prose AND fail against the
// pre-change text, so a green result proves the regex can actually go red [IL-105].
function assertClaimPinned(pattern, control, missingMessage) {
  assert.match(buildSkill, pattern, missingMessage);
  assert.doesNotMatch(control, pattern, 'pattern must NOT match the pre-change text (proves it can go red)');
}

test('build/SKILL.md Next Actions: recommended slot is always the review line', () => {
  assertClaimPinned(
    /The recommended slot is always the review line/,
    PRE_CHANGE_PARAGRAPH,
    'must state the recommended slot is unconditionally the review line',
  );
});

test('build/SKILL.md Next Actions: finish-branch line is never the recommended slot', () => {
  assertClaimPinned(
    /The finish-branch line is never the recommended slot, in worktree mode or otherwise/,
    PRE_CHANGE_PARAGRAPH,
    'must explicitly rule out the finish-branch line ever being the recommended slot',
  );
});

test('build/SKILL.md Next Actions: worktree-mode row no longer bolds finish-branch as recommended', () => {
  assertClaimPinned(
    /Worktree mode \| `\/superpowers:finishing-a-development-branch` — merge, PR, or discard the feature branch \(never the recommended slot/,
    PRE_CHANGE_ROW,
    'the Worktree-mode table row must not bold finish-branch as recommended',
  );
  assert.doesNotMatch(
    buildSkill,
    /finish-branch line\.? *`\*\*\(Recommended in worktree mode\)\*\*`|Worktree mode \| `\/superpowers:finishing-a-development-branch` — merge, PR, or discard the feature branch \*\*\(Recommended in worktree mode\)\*\*/,
    'the old bolded "(Recommended in worktree mode)" row must be gone',
  );
});

test('build/SKILL.md Next Actions: the old worktree-mode override clause is fully removed', () => {
  assert.doesNotMatch(
    buildSkill,
    /in worktree mode, the finish-branch line takes the recommended slot instead/,
    'the retired override clause must not survive anywhere in the file',
  );
});

test('build/SKILL.md Next Actions: cites the shared frontend-detection signal (#808)', () => {
  assert.match(
    buildSkill,
    /frontend-detection\.md.*Layer 2\/3/,
    'must cite the same surface-detection machinery the record\'s Technical Approach calls for reusing',
  );
});
```

- [ ] **Step 5: Run the new test, confirm it passes**

```bash
node --test tests/build-next-actions-review-before-finish.test.js
```

Expected: 5 passing tests, 0 failing.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/build/SKILL.md tests/build-next-actions-review-before-finish.test.js
git commit -m "$(cat <<'EOF'
Stop /build's Next Actions from recommending finish-branch over review

The Next Actions rendering rule unconditionally swapped the recommended
slot onto /superpowers:finishing-a-development-branch whenever git
strategy was worktree (the default), regardless of whether the change
was UI-dependent or whether review had run yet -- letting a build reach
finishing-a-development-branch's "Implementation complete, what would
you like to do?" merge decision before any browser-based visual check.
The recommended slot is now always the review line; finish-branch is
listed but never bolded as recommended.

refs #808
EOF
)"
```

---

### Task 2: Require a Validate/visual-review precondition before the finish-flow merge decision

**Files:**
- Modify: `plugin/skills/init/claude-md-template.md` (the shipped template `/claude-tweaks:init` writes into user projects' `CLAUDE.md`)
- Modify: `CLAUDE.md` (this repo's own root file — dogfoods the same convention it ships)
- Test: `tests/superpowers-overrides-validate-precondition.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 (independent file set — no shared code).
- Produces: an explicit, documented precondition on invoking `/superpowers:finishing-a-development-branch` for UI-dependent work, in both the shipped template and this repo's own CLAUDE.md, each verified by the new test.

- [ ] **Step 1: Read the current Superpowers overrides line in both files**

```bash
grep -n "Superpowers overrides" plugin/skills/init/claude-md-template.md CLAUDE.md
```

Expected:

```
plugin/skills/init/claude-md-template.md:91:**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`.
CLAUDE.md:145:**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`; when policy key `specify-auto-continue` resolves `true` (default `false`), invoke `/claude-tweaks:specify` on the approved doc immediately instead — see `specify/SKILL.md`'s Auto-continue section. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`.
```

The two files are not byte-identical today (CLAUDE.md already carries an extra `specify-auto-continue` clause the template doesn't have — a pre-existing, legitimate divergence, not something this task needs to reconcile). If either grep line differs from the text above, stop and re-read the file before editing — line numbers or wording may have drifted.

- [ ] **Step 2: Append the Validate precondition clause to `plugin/skills/init/claude-md-template.md`**

Replace the line at `plugin/skills/init/claude-md-template.md:91`:

```
**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`.
```

with:

```
**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`. Before offering or invoking `/superpowers:finishing-a-development-branch`'s merge decision for work whose acceptance depends on rendered UI behavior (`surface:` web/mobile/desktop, or acceptance criteria naming visual/interactive behavior — the same signal `/specify`'s frontend detection and `/claude-tweaks:build`'s Next Actions table already use), run a real browser-based visual check first — `/claude-tweaks:review {N} full` or `/claude-tweaks:demo`'s Validate step — or have the user explicitly decline it; raw HTML inspection does not satisfy this. Backend/infra work with no UI surface is not blocked by this (#808).
```

- [ ] **Step 3: Append the identical clause to this repo's own `CLAUDE.md`**

Replace the line at `CLAUDE.md:145`:

```
**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`; when policy key `specify-auto-continue` resolves `true` (default `false`), invoke `/claude-tweaks:specify` on the approved doc immediately instead — see `specify/SKILL.md`'s Auto-continue section. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`.
```

with:

```
**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`; when policy key `specify-auto-continue` resolves `true` (default `false`), invoke `/claude-tweaks:specify` on the approved doc immediately instead — see `specify/SKILL.md`'s Auto-continue section. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`. Before offering or invoking `/superpowers:finishing-a-development-branch`'s merge decision for work whose acceptance depends on rendered UI behavior (`surface:` web/mobile/desktop, or acceptance criteria naming visual/interactive behavior — the same signal `/specify`'s frontend detection and `/claude-tweaks:build`'s Next Actions table already use), run a real browser-based visual check first — `/claude-tweaks:review {N} full` or `/claude-tweaks:demo`'s Validate step — or have the user explicitly decline it; raw HTML inspection does not satisfy this. Backend/infra work with no UI surface is not blocked by this (#808).
```

- [ ] **Step 4: Verify both edits landed**

```bash
grep -c "Before offering or invoking" plugin/skills/init/claude-md-template.md CLAUDE.md
```

Expected: `plugin/skills/init/claude-md-template.md:1` and `CLAUDE.md:1`.

- [ ] **Step 5: Write the conformance test**

Create `tests/superpowers-overrides-validate-precondition.test.js`:

```js
'use strict';
// tests/superpowers-overrides-validate-precondition.test.js — pins #808: both
// CLAUDE.md and its shipped template (plugin/skills/init/claude-md-template.md)
// must state a Validate/visual-review precondition before offering or invoking
// /superpowers:finishing-a-development-branch's merge decision for UI-dependent
// work, and must explicitly exempt backend/infra work with no UI surface.
// The Superpowers overrides line is a live, incrementally-growing convention
// statement (not content a future migration will delete), so this follows the
// same declared-contract read-live pattern as tests/specify-auto-continue-conformance.test.js
// rather than freezing a fixture.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

function overridesLine(text) {
  return text.split('\n').find((l) => l.includes('Superpowers overrides'));
}

for (const file of ['CLAUDE.md', path.join('plugin', 'skills', 'init', 'claude-md-template.md')]) {
  test(`${file}: Superpowers overrides line requires a Validate precondition before finish-branch's merge decision`, () => {
    const line = overridesLine(read(...file.split(path.sep)));
    assert.ok(line, `${file} must still carry a Superpowers overrides line`);
    assert.match(line, /Before offering or invoking `\/superpowers:finishing-a-development-branch`'s merge decision/);
    assert.match(line, /run a real browser-based visual check first/);
    assert.match(line, /raw HTML inspection does not satisfy this/, 'must rule out the known false-positive mode named in the record\'s Gotchas');
    assert.match(line, /Backend\/infra work with no UI surface is not blocked by this/, 'must state the AC3 exemption explicitly');
    assert.match(line, /`\/claude-tweaks:review \{N\} full`|`\/claude-tweaks:demo`/, 'must name at least one real channel for the check');
  });

  test(`${file}: Validate-precondition clause reuses the existing surface-detection signal, not a new one`, () => {
    const line = overridesLine(read(...file.split(path.sep)));
    assert.match(line, /surface:` web\/mobile\/desktop/);
    assert.match(line, /the same signal `\/specify`'s frontend detection and `\/claude-tweaks:build`'s Next Actions table already use/);
  });
}

test('CLAUDE.md still carries its own specify-auto-continue clause alongside the new one (no accidental deletion)', () => {
  const line = overridesLine(read('CLAUDE.md'));
  assert.match(line, /specify-auto-continue/, 'the pre-existing clause this repo carries beyond the shipped template must survive the edit');
});
```

- [ ] **Step 6: Run the new test, confirm it passes**

```bash
node --test tests/superpowers-overrides-validate-precondition.test.js
```

Expected: 5 passing tests, 0 failing (two files × 2 tests each, plus the one specify-auto-continue survival test).

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/init/claude-md-template.md CLAUDE.md tests/superpowers-overrides-validate-precondition.test.js
git commit -m "$(cat <<'EOF'
Require a Validate precondition before finish-branch's merge decision

The Superpowers overrides line already stopped
subagent-driven-development/executing-plans from auto-invoking
finishing-a-development-branch, but said nothing about a
Validate/visual-review precondition for a human-or-agent-initiated
invocation of that skill for UI-dependent work -- the gap that let an
ad hoc session reach "Implementation complete, what would you like to
do?" before any browser-based check had run. Both the shipped
CLAUDE.md template and this repo's own CLAUDE.md now state the
precondition, reusing the existing Surface:/frontend-detection signal
so backend/infra work stays unblocked.

refs #808
EOF
)"
```

---

## Self-Review

**1. Spec coverage.**

- Deliverable 1 ("Position `/claude-tweaks:demo`'s Validate step ... as a precondition of the finish flow's merge decision ... not an optional afterthought") — Task 2's CLAUDE.md/template edit states the precondition explicitly and names `/claude-tweaks:demo`'s Validate step as one of the two channels; Task 1 removes the concrete mechanism (`/build`'s own Next Actions) that was actively recommending the *opposite* order.
- Deliverable 2 (a detection rule for UI-dependent acceptance) — both tasks reuse the existing `Surface:`/`surface:`/frontend-detection signal rather than inventing a new one; Task 1's table row and Task 2's clause both key off it, so a backend record is never routed through either change.
- Acceptance Criteria #1 (reach the merge decision only after a check has run or been declined) — addressed to the extent a markdown-only fix can: Task 1 removes the one concrete claude-tweaks mechanism that was recommending finish-branch ahead of review; Task 2 adds the explicit precondition instruction for the ad hoc path that has no claude-tweaks call site to intercept at all (`finishing-a-development-branch` is third-party). There is no runtime code path in this repo capable of mechanically blocking a third-party skill's own prompt from rendering — see Global Constraints.
- Acceptance Criteria #2 (raw HTML does not satisfy the check) — Task 2's clause states this explicitly and routes toward `/claude-tweaks:review {N} full` (delegates to `/claude-tweaks:visual-review`'s real `agent-browser` rendering) and `/claude-tweaks:demo`'s Validate step (same mechanism) — no new HTML-only path is introduced anywhere in this plan.
- Acceptance Criteria #3 (backend/infra records not blocked) — both tasks' clauses are conditioned on the UI-changed / frontend-surface signal; the Task 2 test asserts the "Backend/infra work with no UI surface is not blocked by this" sentence is present verbatim.
- Gotchas (raw-HTML false positive; don't force backend through a browser check) — both directly addressed by the assertions above.

**2. Placeholder scan.** No `TBD`/`TODO`/"implement later"/"add appropriate handling" language anywhere in either task. Every step shows the literal file content being written, not a description of it.

**3. Type consistency.** N/A — no functions, types, or method signatures are introduced; this plan is markdown-prose-only, and the two tasks touch disjoint file sets (Task 1: `build/SKILL.md` + its own test; Task 2: `claude-md-template.md` + `CLAUDE.md` + its own test) with no shared interface between them.

**4. Plan-authoring checks (per `build/plan-authoring-checks.md`):**
- Return-shape widening: N/A, no functions.
- Blocking-verification downgrades: N/A, no verification steps are weakened — this plan *strengthens* an existing recommendation ordering.
- Deictic-reference re-resolution: every "the line at CLAUDE.md:145" / "build/SKILL.md:316-328" reference is paired with a `grep`/`sed` verification step (Task 1 Step 1, Task 2 Step 1) that re-confirms the exact text before editing, per the codebase's plan-authoring-fact-check convention — this plan was authored by reading each file's current live content directly (not from memory), and the Step 1 verification commands in both tasks exist specifically to catch drift between plan-authoring time and execution time.
- Verbatim-command run-once verification: each test file's `node --test` invocation is shown once per task, run at Step 5/6 respectively.
- Degrade-clause convention citation: N/A, no degrade clauses introduced.
- Copied-config re-derivation: N/A, no config is copied.
- Renumbering completeness: N/A, single-plan document, no cross-file renumbering.

**5. Size-headroom check.** Neither `build/SKILL.md` (349 lines pre-edit) nor `CLAUDE.md`/`claude-md-template.md` is a `skills/_shared/*.md` file subject to the 40KB shared-file ceiling: `build/SKILL.md`'s own edit adds roughly one sentence and rewords three lines (net near-zero size delta); `CLAUDE.md`/the template each grow by one sentence appended to an existing line. No ceiling risk.

