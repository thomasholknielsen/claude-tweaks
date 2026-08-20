# Manifesto Lever Conformance Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conformance test that pins the Manifesto's policy-lever enumeration in `plugin/skills/flow/manifesto.md` against the same set restated by hand in four other prose files, so a future lever addition/removal that misses one of those files fails `npm test` instead of being caught only by manual review.

**Architecture:** A single new Node test-runner file (`tests/manifesto-lever-conformance.test.js`) reads `plugin/skills/flow/manifesto.md` live at test-run time, parses its "**Canonical lever numbering**" line into an ordered `[{n, name}]` list and its `config.yml` example block (inside the "On approval (option 1)" section's fenced ` ```yaml ` snippet) into an ordered list of config keys (stopping before the trailing `spec:`/`created:` bookkeeping keys), asserts the two lists are the same length, builds a `{leverName -> kebabConfigKey}` map by positional zip, then asserts every mapped key appears as a literal substring in each of four target files' live text.

**Tech Stack:** `node:test`, `node:assert`, `node:fs`, `node:path` — no new dependencies, matches every existing `tests/*-conformance.test.js` file.

**Spec:** `work/668-spec.md` (materialized from GitHub issue #668) in the worktree root.

## Global Constraints

- No content in any of the five prose files (`plugin/skills/flow/manifesto.md`, `plugin/skills/_shared/auto-mode-contract.md`, `plugin/skills/flow/SKILL.md`, `plugin/skills/help/reference-card.md`, `plugin/skills/help/context-flow.md`) may be edited by this change — coverage-only, test-file-only.
- The test must read the five files live at test-run time — never freeze any of them as a fixture (`skill-prose-conformance-tests`'s [IL-80] rule; this is one of the sanctioned exceptions, same shape as `tests/wrap-up-registry-pin.test.js` and `tests/hooks-gate-coverage.test.js`).
- Build the `{leverName -> kebabConfigKey}` map by **positional zip of the two parsed lists**, never by mechanically kebab-casing the lever name — verified live: lever 5's name is "Leftover routing" but its config key is `leftover-default`, not `leftover-routing`.
- **Deviation from the issue body's literal acceptance criteria, stated here explicitly:** the issue text says "asserts both ordered lists have length 12" and "all five files already carry the full 12-lever set today." Verified against the live repo during planning (`plugin/skills/flow/manifesto.md`'s numbering line and `config.yml` example both currently enumerate **13** levers — lever 13, `merge-authorization`, was added after #668 was filed against #595's review). Hardcoding an assertion of `13` (or `12`) would defeat the test's own stated purpose — "fails loud if either count drifts" describes the two lists staying in sync with **each other**, not with a number frozen at authoring time — and would also make the test fail today against a passing target-file state, directly contradicting the issue's own Acceptance Criterion 1 ("passes as written against the current repo state"). This plan derives the count from the numbering line itself (`leverPairs.length`) and asserts the `config.yml` list has the **same** length, rather than asserting either list equals a literal `12`. This still satisfies the self-check requirement: if a future lever is added to the numbering line but not the `config.yml` example (or vice versa), the two derived counts diverge and the assertion fails loud, naming both counts.

---

### Task 1: Add `tests/manifesto-lever-conformance.test.js`

**Files:**
- Create: `tests/manifesto-lever-conformance.test.js`

**Interfaces:**
- Consumes: nothing from other tasks (single-task plan).
- Produces: nothing consumed elsewhere — this is the terminal deliverable, auto-discovered by `npm test`'s `find tests tools/upstream-drift/tests -name '*.test.js'` glob (per CLAUDE.md's Commands table); no registration needed.

- [ ] **Step 1: Write the test file**

```javascript
// tests/manifesto-lever-conformance.test.js
//
// Binds plugin/skills/flow/manifesto.md's "Canonical lever numbering" line
// (the declared list of Pipeline Config Manifesto policy levers) to the four
// other prose files that restate the same set by hand:
// plugin/skills/_shared/auto-mode-contract.md, plugin/skills/flow/SKILL.md,
// plugin/skills/help/reference-card.md, plugin/skills/help/context-flow.md.
// Nothing kept these five restatements in sync automatically — adding lever
// 12 (design-critique) missed all four non-canonical files until a
// whole-branch review caught it by reading, and lever 11's addition (#559)
// needed a dedicated "lever checklist" commit for the same reason.
//
// This suite reads live production prose, which [IL-80] warns against — a
// test asserting "this real file currently contains X" is a scheduled
// failure timed to the next migration. It is acceptable HERE, and only
// here, because the enumeration IS the declared contract whose update is
// the intended action when a lever is added or removed (same house pattern
// as tests/wrap-up-registry-pin.test.js and tests/hooks-gate-coverage.test.js).
// Do not generalize this pattern to prose that merely happens to mention a
// lever in passing.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const MANIFESTO_PATH = path.join(REPO_ROOT, 'plugin', 'skills', 'flow', 'manifesto.md');
const TARGET_FILES = [
  path.join(REPO_ROOT, 'plugin', 'skills', '_shared', 'auto-mode-contract.md'),
  path.join(REPO_ROOT, 'plugin', 'skills', 'flow', 'SKILL.md'),
  path.join(REPO_ROOT, 'plugin', 'skills', 'help', 'reference-card.md'),
  path.join(REPO_ROOT, 'plugin', 'skills', 'help', 'context-flow.md'),
];

// Parses the "**Canonical lever numbering**" line into its ordered list of
// `N=Name` pairs (e.g. "1=Mode", "2=Scope-creep", ...) and returns just the
// names, in order. Anchored on the literal bolded token per
// skill-prose-conformance-tests's "anchor on a literal token the skill
// already uses" convention.
function parseLeverNames(manifestoText) {
  const lineMatch = /\*\*Canonical lever numbering\*\*[^:]*:\s*([^\n]+)/.exec(manifestoText);
  assert.ok(lineMatch, 'manifesto.md: "**Canonical lever numbering**" line not found — anchor text may have changed');
  // The line ends "...13=Merge authorization. The table below shows only ..."
  // — split off the trailing sentence before splitting the pairs on ", ".
  const pairsPart = lineMatch[1].split(/\.\s+The table/)[0];
  const pairs = pairsPart.split(',').map((s) => s.trim());
  return pairs.map((pair) => {
    const m = /^\d+=(.+)$/.exec(pair);
    assert.ok(m, `manifesto.md: malformed lever pair "${pair}" in the canonical numbering line`);
    return m[1].trim();
  });
}

// Locates the config.yml example block inside the "On approval (option 1)"
// section and returns its ordered list of lever config keys, stopping
// before the trailing per-run bookkeeping keys `spec:`/`created:` (which are
// not policy levers).
function parseConfigKeys(manifestoText) {
  const approvalIdx = manifestoText.indexOf('On approval (option 1)');
  assert.ok(approvalIdx !== -1, 'manifesto.md: "On approval (option 1)" section not found');
  const fenceStart = manifestoText.indexOf('```yaml', approvalIdx);
  assert.ok(fenceStart !== -1, 'manifesto.md: no ```yaml fence found after "On approval (option 1)"');
  const fenceEnd = manifestoText.indexOf('```', fenceStart + 7);
  assert.ok(fenceEnd !== -1, 'manifesto.md: unterminated ```yaml fence after "On approval (option 1)"');
  const block = manifestoText.slice(fenceStart + 7, fenceEnd);
  const keys = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^([a-z0-9-]+):/.exec(line);
    if (!m) continue;
    if (m[1] === 'spec' || m[1] === 'created') break; // trailing bookkeeping keys, not levers
    keys.push(m[1]);
  }
  return keys;
}

test('manifesto-lever-conformance', async (t) => {
  const manifestoText = fs.readFileSync(MANIFESTO_PATH, 'utf8');
  const leverNames = parseLeverNames(manifestoText);
  const configKeys = parseConfigKeys(manifestoText);

  await t.test('numbering line and config.yml example agree on lever count', () => {
    // Self-check that both anchors are still being read correctly: the two
    // independently-parsed lists must describe the same set of levers, so
    // their lengths must match. This is intentionally NOT pinned to a
    // hardcoded literal — a future lever added to one anchor but not the
    // other must fail here, by count mismatch, however many levers exist
    // at the time.
    assert.strictEqual(
      leverNames.length,
      configKeys.length,
      `lever count mismatch: numbering line has ${leverNames.length} pairs (${JSON.stringify(leverNames)}), ` +
        `config.yml example has ${configKeys.length} keys (${JSON.stringify(configKeys)})`,
    );
    assert.ok(leverNames.length > 0, 'parsed zero levers — anchor text may have changed');
  });

  // Positional zip — NOT a mechanical kebab-case transform of the lever
  // name. Lever 5's name is "Leftover routing" but its config key is
  // `leftover-default`, not `leftover-routing`; a naive transform would
  // silently check for the wrong string.
  const leverToKey = {};
  leverNames.forEach((name, i) => {
    leverToKey[name] = configKeys[i];
  });

  for (const targetFile of TARGET_FILES) {
    const relPath = path.relative(REPO_ROOT, targetFile);
    await t.test(`every lever's config key appears in ${relPath}`, () => {
      const content = fs.readFileSync(targetFile, 'utf8');
      for (const [name, key] of Object.entries(leverToKey)) {
        assert.ok(
          content.includes(key),
          `${relPath}: missing key "${key}" (lever "${name}")`,
        );
      }
    });
  }
});
```

- [ ] **Step 2: Run the new test in isolation to verify it passes**

Run: `node --test tests/manifesto-lever-conformance.test.js`
Expected: PASS — all subtests green (numbering/config.yml length agreement, and one passing subtest per target file). At authoring time the live repo has 13 levers in both the numbering line and the `config.yml` example, and all four target files already contain all 13 keys (verified directly during planning), so this is a coverage addition against already-conformant prose, not a fix for existing drift.

- [ ] **Step 3: Negative-control verification — prove the test can go red**

This is a verification action, not a permanent test artifact — do not leave any of these edits in place.

1. Open `plugin/skills/help/context-flow.md` and temporarily delete the line/cell containing the literal substring `design-critique` (pick a lever key that appears in this file — confirm with `grep -n "design-critique" plugin/skills/help/context-flow.md` first, and record the exact line so it can be restored verbatim).
2. Run: `node --test tests/manifesto-lever-conformance.test.js`
3. Expected: FAIL — the failure message names `plugin/skills/help/context-flow.md` and `design-critique` (per the assertion message format: `` `${relPath}: missing key "${key}" (lever "${name}")` ``).
4. Revert the temporary edit: `git checkout -- plugin/skills/help/context-flow.md` (confirm via `git diff plugin/skills/help/context-flow.md` that it is empty afterward).
5. Re-run: `node --test tests/manifesto-lever-conformance.test.js` — expect PASS again, confirming the revert was clean.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, including the new file (auto-discovered — no registration step needed anywhere per CLAUDE.md's Commands table).

- [ ] **Step 5: Commit**

```bash
git add tests/manifesto-lever-conformance.test.js
git commit -m "Add manifesto lever enumeration conformance test (#668)

Pins plugin/skills/flow/manifesto.md's Canonical lever numbering line
against the four prose files that restate the same lever set by hand
(_shared/auto-mode-contract.md, flow/SKILL.md, help/reference-card.md,
help/context-flow.md). Derives the lever count from the numbering line
itself rather than a hardcoded literal, since the live repo already
carries 13 levers (lever 13, merge-authorization, landed after #668 was
filed) — asserting a frozen 12 would fail against current, conformant
prose.

refs #668"
```

---

## Self-Review

**Spec coverage:** All five Deliverables bullets from `work/668-spec.md` are covered by Task 1 Step 1 (the test file itself: numbering-line parse, config.yml-block parse, length assertion, positional-zip map, per-file substring assertions, header comment citing IL-80 and the two sibling tests). Acceptance Criteria 1 (passes as written) → Step 2. Acceptance Criterion 2 (verified able to go red, then reverted) → Step 3. Acceptance Criterion 3 (full `npm test` passes, auto-discovered) → Step 4. Acceptance Criterion 4 (no prose file content edited) → Step 3's edit is explicitly temporary/reverted, and no other step touches the five prose files — recorded as a Global Constraint.

**Placeholder scan:** No TBD/TODO; the test file in Step 1 is complete, runnable code, not a description of code.

**Type consistency:** Single task, single file — no cross-task interface to drift.

**Known deviation from the issue's literal text (flagged above under Global Constraints):** implements a dynamic length-agreement check instead of a hardcoded `length === 12` assertion, because the live repo has moved to 13 levers since #668 was filed. This is the smallest change that satisfies both the issue's actual purpose (catch future drift) and its Acceptance Criterion 1 (passes against current, already-conformant prose) — a literal `12` would satisfy neither.
