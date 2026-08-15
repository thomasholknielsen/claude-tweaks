# Early-Warning Tier for the 40KB SKILL.md Ceiling Check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-failing warning tier to `bin/lib/skill-audit/context-cost.js`/`context-cost.test.js` that flags any `SKILL.md`/sub-file at or above 90% of `CEILING_BYTES` (but still under it), without changing the existing hard-fail behavior at or over the ceiling.

**Architecture:** Add a `WARN_RATIO` constant and a `nearCeiling(entries)` filter function to `context-cost.js`, alongside the existing `CEILING_BYTES`/`overCeiling`/`headroom` exports. Add a new `node:test` test to `context-cost.test.js` that runs `nearCeiling` over both `measureSkills(REPO)` and `measureSubFiles(REPO)` and `console.warn`s each hit — no `assert`, so a near-ceiling file never fails the suite. This reuses the existing exports the hard-fail tests already import; no new dependency, no separate script.

**Tech Stack:** Node.js `node:test` (built-in test runner), `node:fs`/`node:path`.

**Spec:** `.claude-tweaks/pipelines/2026-08-15T101623-spec-336/work/336-spec.md`

## Global Constraints

- Ceiling stays `CEILING_BYTES = 40 * 1024` — this plan does not change the hard-fail threshold or behavior.
- The new warning must never fail `npm test` — informational only (`console.warn`/`console.log`, no `assert`).
- The warning range is half-open `[0.9 * CEILING_BYTES, CEILING_BYTES)` — a file already `>= CEILING_BYTES` is covered by the existing hard-fail tests only, never also warned.

---

### Task 1: Add `WARN_RATIO`/`nearCeiling` to `context-cost.js`

**Files:**
- Modify: `bin/lib/skill-audit/context-cost.js`
- Test: `bin/lib/skill-audit/tests/context-cost.test.js`

**Interfaces:**
- Consumes: nothing new — reuses `CEILING_BYTES` already defined in this file.
- Produces: `WARN_RATIO` (number, `0.9`) and `nearCeiling(entries)` — `entries: Array<{bytes: number, ...}> -> Array<{bytes: number, ...}>`, filtering to items where `bytes >= CEILING_BYTES * WARN_RATIO && bytes < CEILING_BYTES`. Both are added to this file's `module.exports`. Task 2 imports both.

- [ ] **Step 1: Write the failing test**

Add this test to `bin/lib/skill-audit/tests/context-cost.test.js`, directly after the existing `'overCeiling and headroom agree on the boundary'` test (so the two boundary tests sit together):

```javascript
test('nearCeiling flags only the half-open [90%, 100%) band', () => {
  const belowBand = { name: 'a', bytes: Math.floor(CEILING_BYTES * 0.9) - 1 };
  const atBandStart = { name: 'b', bytes: Math.ceil(CEILING_BYTES * 0.9) };
  const justUnderCeiling = { name: 'c', bytes: CEILING_BYTES - 1 };
  const atCeiling = { name: 'd', bytes: CEILING_BYTES };
  const overCeilingEntry = { name: 'e', bytes: CEILING_BYTES + 1 };

  assert.deepStrictEqual(nearCeiling([belowBand]), []);
  assert.deepStrictEqual(nearCeiling([atBandStart]), [atBandStart]);
  assert.deepStrictEqual(nearCeiling([justUnderCeiling]), [justUnderCeiling]);
  assert.deepStrictEqual(nearCeiling([atCeiling]), []);
  assert.deepStrictEqual(nearCeiling([overCeilingEntry]), []);
});
```

Add `nearCeiling` and `WARN_RATIO` to the existing destructured `require('../context-cost.js')` import at the top of the file — both will be `undefined` until Step 3, which is exactly what makes this test fail first. Adding `WARN_RATIO` now too (even though this test doesn't reference it) means Task 2 doesn't need to touch the import line again.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/skill-audit/tests/context-cost.test.js`
Expected: FAIL on `'nearCeiling flags only the half-open [90%, 100%) band'` — `nearCeiling` is not a function (it is `undefined` from the destructure).

- [ ] **Step 3: Write minimal implementation**

In `bin/lib/skill-audit/context-cost.js`, add directly after the existing `headroom` function:

```javascript
// Early-warning tier (#336): the ceiling above is a binary pass/fail exactly at
// the limit, with no signal as a file approaches it. WARN_RATIO marks the
// half-open band [90%, 100%) of CEILING_BYTES — a file already at or over the
// ceiling is the hard-fail tests' job, never also flagged here.
const WARN_RATIO = 0.9;

function nearCeiling(entries) {
  const threshold = CEILING_BYTES * WARN_RATIO;
  return entries.filter((e) => e.bytes >= threshold && e.bytes < CEILING_BYTES);
}
```

Add `WARN_RATIO` and `nearCeiling` to this file's `module.exports` object (alongside the existing `CEILING_BYTES`, `overCeiling`, `headroom`, etc.).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/skill-audit/tests/context-cost.test.js`
Expected: PASS on `'nearCeiling flags only the half-open [90%, 100%) band'`, and every pre-existing test in the file still passes.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/skill-audit/context-cost.js bin/lib/skill-audit/tests/context-cost.test.js
git commit -m "Add nearCeiling/WARN_RATIO to context-cost for the 90% early-warning band"
```

---

### Task 2: Surface the corpus-wide warning in `context-cost.test.js`

**Files:**
- Modify: `bin/lib/skill-audit/tests/context-cost.test.js`

**Interfaces:**
- Consumes: `nearCeiling`, `WARN_RATIO`, `CEILING_BYTES` (Task 1's exports), `measureSkills(REPO)`, `measureSubFiles(REPO)` (both already imported in this file).
- Produces: nothing new for other files — this is the corpus-wide check itself, the deliverable's second acceptance criterion.

- [ ] **Step 1: Write the failing test**

Add this test to `bin/lib/skill-audit/tests/context-cost.test.js`, directly after the existing `'reports the payload total and the tightest headroom'` test:

```javascript
// ── Early-warning tier (#336). Non-failing: flags files approaching the
// ceiling before they cross it, so an extraction can be planned ahead of an
// unrelated edit forcing one under time pressure.

test('warns (without failing) on any file in the 90-100% ceiling band', () => {
  const skillHits = nearCeiling(measureSkills(REPO));
  const subFileHits = nearCeiling(measureSubFiles(REPO));

  // Real assertions against the live corpus, not a vacuous placeholder: every
  // hit nearCeiling returns must actually sit in the half-open warning band.
  // This catches a future regression in nearCeiling's boundary logic even
  // though the boundary itself is already unit-tested in Task 1 against
  // synthetic entries — this test is what proves the composition with the
  // real measureSkills/measureSubFiles output also holds.
  const threshold = CEILING_BYTES * WARN_RATIO;
  for (const hit of [...skillHits, ...subFileHits]) {
    assert.ok(hit.bytes < CEILING_BYTES, `${hit.name || hit.file} should be under the ceiling`);
    assert.ok(hit.bytes >= threshold, `${hit.name || hit.file} should be at or above the warning threshold`);
  }

  const skillWarnings = skillHits.map((s) => `${s.name} ${kb(s.bytes)} KB`);
  const subFileWarnings = subFileHits.map((s) => `${s.skill}/${s.file} ${kb(s.bytes)} KB`);
  const warnings = [...skillWarnings, ...subFileWarnings];

  if (warnings.length > 0) {
    console.warn(`    WARNING: ${warnings.length} file(s) at ${Math.round(WARN_RATIO * 100)}%+ `
      + `of the ${kb(CEILING_BYTES)} KB ceiling:`);
    for (const w of warnings) console.warn(`      ${w}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

This step is a no-op check rather than a red/green cycle: `nearCeiling`/`WARN_RATIO` already exist and pass their own unit test from Task 1, so this test cannot fail on missing exports. Run it once to confirm it registers and passes cleanly:

Run: `node --test bin/lib/skill-audit/tests/context-cost.test.js`
Expected: PASS on `'warns (without failing) on any file in the 90-100% ceiling band'`.

- [ ] **Step 3: Confirm the warning actually fires when a file is in-band**

Temporarily lower `WARN_RATIO`'s effective threshold to force a hit and confirm the `console.warn` output actually appears (this is a manual verification step, not a code change — do not commit anything from it):

Run: `node -e "
const {measureSkills, CEILING_BYTES} = require('./bin/lib/skill-audit/context-cost.js');
const skills = measureSkills('.');
const tightest = skills.sort((a,b) => (CEILING_BYTES - a.bytes) - (CEILING_BYTES - b.bytes))[0];
console.log(tightest.name, tightest.bytes, (tightest.bytes / CEILING_BYTES * 100).toFixed(1) + '%');
"`

Expected: prints the real tightest-headroom file and its percent-of-ceiling from the current corpus. If it is already at or above 90%, re-run `node --test bin/lib/skill-audit/tests/context-cost.test.js` and confirm the `WARNING:` line prints that file's name in the test output (test still shows `ok`, not `not ok`). If no file is currently in the 90-100% band, this step confirms there is nothing to warn about today — the boundary unit test from Task 1 already proves the filter logic fires correctly when a file is in range, so this is a sanity check, not required evidence.

- [ ] **Step 4: Run the full test file to verify nothing broke**

Run: `node --test bin/lib/skill-audit/tests/context-cost.test.js`
Expected: PASS — every test in the file, including the pre-existing hard-fail tests (`'no SKILL.md exceeds the 40 KB per-invocation ceiling'`, `'no lazy-loaded sub-file exceeds the ceiling either'`) and the new tests from Task 1 and this task.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/skill-audit/tests/context-cost.test.js
git commit -m "Warn (non-failing) on SKILL.md/sub-files in the 90-100% ceiling band"
```
