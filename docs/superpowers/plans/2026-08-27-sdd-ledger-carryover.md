# SDD Deferred-Minor Ledger Carryover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instruct `/claude-tweaks:build` Common Step 2's SDD invocation to copy surviving SDD deferred-minor/parked `progress.md` ledger lines into the run ledger before the SDD workspace is deleted, so a scoped re-review's out-of-scope observation is no longer structurally lost at the seam.

**Architecture:** One additional bolded clause folded into `build/SKILL.md` Common Step 2's existing "subagent (default):" invocation-instruction paragraph — the same place the file already folds in the Acceptance-Criteria-forwarding and profile-override clauses — directing `/superpowers:subagent-driven-development` to read `{workspace}/progress.md` immediately before its own Finish step deletes `.superpowers/sdd/{plan}/`, and append any `minor (deferred)`/`parked` lines to the run ledger with phase `build` and status `deferred`/`observation` respectively. A conformance test pins the new clause's presence and its go-red discrimination against the pre-change paragraph.

**Tech Stack:** Markdown skill prose (`plugin/skills/build/SKILL.md`); `node --test` conformance suite (`tests/`).

**Spec:** `work/1135-spec.md` (record #1135)

## Global Constraints

- `plugin/skills/build/SKILL.md` is at 39312 bytes against a 40960-byte (40 KB) per-file ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`, `plugin/bin/lib/skill-audit/context-cost.js`'s `CEILING_BYTES = 40 * 1024`) — headroom is 1648 bytes. The new clause must be measured with `wc -c` after the edit and stay under the ceiling; if it doesn't, extract to a sub-file instead of widening inline (Task 1, Step 4).
- Use the exact ledger-line markers named in the spec body: `minor (deferred)` and `parked` (verbatim substrings, not paraphrased).
- Ledger destination format is `docs/plans/{run}-ledger.md`'s `| # | Phase | Item | Status | Resolution |` columns (`plugin/skills/_shared/ledger-format.md`).

---

### Task 1: Add the SDD ledger-carryover clause to build/SKILL.md and pin it with a conformance test

**Files:**
- Modify: `plugin/skills/build/SKILL.md` (Common Step 2, the "subagent (default):" paragraph, ~line 202)
- Test: `tests/build-sdd-ledger-carryover.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (only task in this plan).
- Produces: a new bolded clause inside Common Step 2's existing invocation-instruction paragraph, positioned immediately after the existing "**Forward the spec's Acceptance Criteria to per-task review:** …relying solely on the final whole-branch review." sentence and before "**`profile=<fast|standard|capable|frontier>` token:**". Later readers/tests locate it by the literal string `Carry forward SDD deferred-minor findings:`.

- [ ] **Step 1: Write the failing conformance test**

Create `tests/build-sdd-ledger-carryover.test.js`:

```javascript
'use strict';
// tests/build-sdd-ledger-carryover.test.js — pins #1135: /build's Common Step 2 SDD
// invocation instruction must direct /superpowers:subagent-driven-development to copy
// surviving SDD deferred-minor/parked progress.md lines into the run ledger before its
// own Finish step deletes the SDD workspace — otherwise a scoped re-review's out-of-scope
// observation ledgered only in the SDD workspace is structurally lost at the seam
// (skill-prose-conformance-tests' "prove go-red" pattern, [IL-105]).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const buildSkill = fs.readFileSync(path.join(ROOT, 'plugin', 'skills', 'build', 'SKILL.md'), 'utf8');

// The pre-change paragraph fragment (#1135) — the invocation-instruction paragraph as it
// read before this fix, missing the SDD ledger-carryover clause entirely. Used as the
// negative control so a green result proves each pattern can actually go red.
const PRE_CHANGE_FRAGMENT = 'so a per-task review can catch a task brief that misstates a spec criterion instead of relying solely on the final whole-branch review. **`profile=<fast|standard|capable|frontier>` token:** when present in `$ARGUMENTS`, it always wins over the `size:`-derived profile';

function assertClaimPinned(pattern, missingMessage) {
  assert.match(buildSkill, pattern, missingMessage);
  assert.doesNotMatch(PRE_CHANGE_FRAGMENT, pattern, 'pattern must NOT match the pre-change fragment (proves it can go red)');
}

test('build/SKILL.md Common Step 2: instructs SDD to carry forward deferred-minor findings before workspace deletion', () => {
  assertClaimPinned(
    /Carry forward SDD deferred-minor findings:/,
    'must add the SDD ledger-carryover clause to the subagent invocation instruction',
  );
});

test('build/SKILL.md Common Step 2: names progress.md as the source and the deletion-ordering constraint', () => {
  assertClaimPinned(
    /progress\.md.*before its (?:own )?Finish step deletes/,
    'must name progress.md as the source and require the copy to happen before workspace deletion',
  );
});

test('build/SKILL.md Common Step 2: names both SDD markers verbatim', () => {
  assertClaimPinned(
    /`minor \(deferred\)`.*`parked`/,
    'must name both minor (deferred) and parked as the lines to carry forward',
  );
  assertClaimPinned(
    /`parked`.*`minor \(deferred\)`|`minor \(deferred\)`.*`parked`/,
    'must name both markers (order-independent check)',
  );
});

test('build/SKILL.md Common Step 2: destination is the run ledger with phase build and a status per marker', () => {
  assertClaimPinned(
    /docs\/plans\/\{run\}-ledger\.md/,
    'must name the run ledger file as the destination',
  );
  assertClaimPinned(
    /phase `build`/,
    'must specify phase build for carried-forward lines',
  );
  assertClaimPinned(
    /status `deferred`.*status `observation`|status `observation`.*status `deferred`/,
    'must specify both deferred and observation as the possible carried-forward statuses',
  );
});

test('build/SKILL.md: file stays under the 40 KB per-invocation ceiling', () => {
  const bytes = Buffer.byteLength(buildSkill, 'utf8');
  assert.ok(bytes <= 40 * 1024, `build/SKILL.md is ${bytes} bytes, over the 40 KB ceiling — extract a sub-file`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/build-sdd-ledger-carryover.test.js`
Expected: FAIL — every `assertClaimPinned` call's first assertion fails because none of the patterns exist yet in `build/SKILL.md` (the last ceiling test passes already, since the file is currently under budget).

- [ ] **Step 3: Insert the clause into build/SKILL.md**

In `plugin/skills/build/SKILL.md`, in the "subagent (default):" paragraph of Common Step 2, find this exact substring:

```
so a per-task review can catch a task brief that misstates a spec criterion instead of relying solely on the final whole-branch review. **`profile=<fast|standard|capable|frontier>` token:**
```

Replace it with (inserting the new clause between the two existing sentences):

```
so a per-task review can catch a task brief that misstates a spec criterion instead of relying solely on the final whole-branch review. **Carry forward SDD deferred-minor findings:** in the same invocation instruction, also direct `/superpowers:subagent-driven-development` that immediately before its own Finish step deletes the plan's SDD workspace (`.superpowers/sdd/{plan}/`), it must read that workspace's `progress.md` and, for each line matching `minor (deferred)` or `parked`, append a row to the run ledger (`docs/plans/{run}-ledger.md`, `_shared/ledger-format.md`'s columns) with phase `build`, status `deferred` (for `minor (deferred)` lines) or `observation` (for `parked` lines), and the source line verbatim as Resolution — before the workspace is deleted, so the finding survives the seam where `/wrap-up` reads only the run ledger. **`profile=<fast|standard|capable|frontier>` token:**
```

- [ ] **Step 4: Measure the file against the 40 KB ceiling**

Run: `wc -c plugin/skills/build/SKILL.md`
Expected: output is `<= 40960`. If it exceeds 40960, revert Step 3 and instead extract the new clause to a new sub-file `plugin/skills/build/sdd-ledger-carryover.md` (full procedure text there), replacing the inline clause with a one-sentence pointer: "**Carry forward SDD deferred-minor findings:** in the same invocation instruction, also direct `/superpowers:subagent-driven-development` per `sdd-ledger-carryover.md` in this skill's directory." — then re-run this step. (Expected not to trigger — headroom is 1648 bytes and the inserted clause is well under that.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/build-sdd-ledger-carryover.test.js`
Expected: PASS — all 6 assertions (5 `test()` blocks, one with two assertions) succeed.

- [ ] **Step 6: Run the skill-audit ceiling suite to confirm no regression**

Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/build/SKILL.md tests/build-sdd-ledger-carryover.test.js
git commit -m "Carry surviving SDD deferred-minor/parked ledger lines into the run ledger before workspace deletion -- refs #1135"
```
