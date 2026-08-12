# Parent-Issue Contract-Layer Rename Implementation Plan (spec 339)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the `family:parent` code-side vocabulary to parent-issue/sub-issue across `bin/lib/issues/` (facet key `isParentIssue`, frontmatter key `is-parent-issue:`, gate function `parentGateState`, parser `parseSubIssues`) with permanent read-side legacy fallbacks, plus the canonical `LABELS_JSON` pair in `skills/_shared/label-bootstrap.md`.

**Architecture:** Mechanical rename plus one new capability: `parseRecordFacets` gains label-derived `isParentIssue` (new label `parent-issue` OR legacy `family:parent` — plain boolean equality checks, NOT the effort-fallback regex machinery). Local-files driver renames `familyParent`→`isParentIssue` with a held-aside-flag precedence for the legacy `family-parent:` line. No behavior change to gate logic. No aliases — exports rename atomically; the skills sweep (#340) and release (#341) land in the same pipeline run.

**Tech Stack:** Node 18+ built-ins only, `node --test`.

## Global Constraints

- Both legacy read branches MUST carry a comment containing the literal substrings `[IL-85]` and `PERMANENT cross-project support` (exact texts pinned in Tasks 1 and 3).
- Do NOT touch `facets.parent`, `hasParent`, or frontmatter `parent:` — leaf-side vocabulary is already correct.
- `parentGateState` keeps the exact signature `{ leaves, parentLabels }` — only the function name changes.
- No behavior change to gate logic — assertions in existing tests change name-only.
- Emit side is new-key-only: nothing ever writes `family-parent:` or references `family:parent` outside the two tombstoned read branches.
- Commits use `refs #339`, never closing keywords (`closes`/`fixes`).
- Run all test commands from the worktree root; one plain command per Bash call (no `&&` chains — the worktree session refuses compound commands).

---

### Task 1: `isParentIssue` facet — shared default + label parsing + tests

**Files:**
- Modify: `bin/lib/issues/facet-shape.js` (header comment + `sharedFacetDefaults`)
- Modify: `bin/lib/issues/record.js` (LABELS constant, `parseRecordFacets`)
- Test: `bin/lib/issues/tests/record.test.js`

**Interfaces:**
- Produces: `sharedFacetDefaults()` now includes `isParentIssue: false`; `parseRecordFacets(labels).isParentIssue: boolean`; `LABELS.PARENT_ISSUE === 'parent-issue'`. Task 3 relies on `sharedFacetDefaults()` carrying `isParentIssue`; Task 4/5 rely on nothing here.

- [ ] **Step 1: Write the failing tests**

Append to `bin/lib/issues/tests/record.test.js` (it already imports `parseRecordFacets` at the top — verify, and reuse the existing import):

```js
test('parseRecordFacets sets isParentIssue from the parent-issue label', () => {
  assert.strictEqual(parseRecordFacets([{ name: 'parent-issue' }]).isParentIssue, true);
});

test('parseRecordFacets sets isParentIssue from the legacy family:parent label', () => {
  // Contract, not implementation echo: legacy labels on adopter repos must keep working ([IL-85]).
  assert.strictEqual(parseRecordFacets([{ name: 'family:parent' }]).isParentIssue, true);
});

test('parseRecordFacets defaults isParentIssue to false', () => {
  assert.strictEqual(parseRecordFacets([]).isParentIssue, false);
  assert.strictEqual(parseRecordFacets([{ name: 'ready' }]).isParentIssue, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: the three new tests FAIL (`isParentIssue` is `undefined`, not `true`/`false`).

- [ ] **Step 3: Implement**

In `bin/lib/issues/facet-shape.js`:

1. Header comment: replace the sentence listing local-only keys so it reads `parent/ blockedBy/type/unsynced/closed/closedAt are local-files-only` (drop `familyParent` from that list) and append after it: `isParentIssue is shared: the GitHub driver derives it from the parent-issue label (legacy family:parent), the local driver from the is-parent-issue: frontmatter line (legacy family-parent:).`
2. In `sharedFacetDefaults()`, add `isParentIssue: false,` after `acceptance: null,`.

In `bin/lib/issues/record.js`, inside `parseRecordFacets`'s label loop, after the `FRAMING_BAKED` branch and BEFORE the effort-fallback block, add:

```js
    if (name === LABELS.PARENT_ISSUE) {
      facets.isParentIssue = true;
      continue;
    }
    // Read-side family:parent fallback — PERMANENT cross-project support (other repos' records keep family:parent labels); removable only at a major version that drops pre-rename repo support. [IL-85]
    if (name === 'family:parent') {
      facets.isParentIssue = true;
      continue;
    }
```

And in the `LABELS` constant object, add after `DEMO_CHANGES_REQUESTED`:

```js
  PARENT_ISSUE: 'parent-issue',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: PASS (all tests, including the three new ones).

- [ ] **Step 5: Verify the legacy test discriminates**

Temporarily comment out the two-line `if (name === 'family:parent')` body in `parseRecordFacets` (keep the file parseable), run `node --test bin/lib/issues/tests/record.test.js`, confirm the legacy-label test FAILS, then restore the branch exactly and re-run to confirm PASS. Do not commit the reverted state.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/facet-shape.js bin/lib/issues/record.js bin/lib/issues/tests/record.test.js
git commit -m "Add label-derived isParentIssue facet with permanent family:parent fallback — refs #339"
```

---

### Task 2: `parseFamilyLeaves` → `parseSubIssues` rename in record.js

**Files:**
- Modify: `bin/lib/issues/record.js` (function, regex const, comments, exports)
- Test: `bin/lib/issues/tests/record.test.js` (rename existing test references)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: exported `parseSubIssues(body) -> number[]` (identical behavior); `parseFamilyLeaves` no longer exists. `FAMILY_LEAF_RE` const becomes `SUB_ISSUE_RE`.

- [ ] **Step 1: Rename in record.js**

In `bin/lib/issues/record.js`:
1. Rename const `FAMILY_LEAF_RE` → `SUB_ISSUE_RE` (declaration + its one use). Update its comment to: `// Parent task-list entries (work-links: body-text), written by /specify as` / `// '- [ ] #{subIssueNum}' and checked off over time — both box states count.`
2. Rename function `parseFamilyLeaves` → `parseSubIssues`; update its doc comment to: `// parent body -> deduped array of sub-issue numbers from its task list, in order` / `// of first appearance. Mid-line occurrences don't count, exactly as with DEP_RE.` / `// Under work-links: native the parent body carries no task list at all — that` / `// caller reads sub_issues from the API and never calls this.`
3. In `module.exports`, replace `parseFamilyLeaves` with `parseSubIssues`.

- [ ] **Step 2: Rename test references**

In `bin/lib/issues/tests/record.test.js`: change the import destructure `parseFamilyLeaves` → `parseSubIssues`, and in the three tests at ~lines 508-522 rename every call and every test title (`'parseFamilyLeaves reads a parent task list'` → `'parseSubIssues reads a parent task list'`, `'parseFamilyLeaves ignores mid-line mentions and dedupes'` → `'parseSubIssues ignores mid-line mentions and dedupes'`, `'parseFamilyLeaves returns empty for absent or non-string bodies'` → `'parseSubIssues returns empty for absent or non-string bodies'`). Assertions unchanged.

- [ ] **Step 3: Run tests**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: PASS.

- [ ] **Step 4: Check no stale references**

Run: `grep -rn "parseFamilyLeaves\|FAMILY_LEAF_RE" bin/`
Expected: zero matches.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/record.js bin/lib/issues/tests/record.test.js
git commit -m "Rename parseFamilyLeaves to parseSubIssues — refs #339"
```

---

### Task 3: local-store.js `is-parent-issue:` emit/parse with held-aside legacy precedence

**Files:**
- Modify: `bin/lib/issues/local-store.js`
- Test: `bin/lib/issues/tests/local-store.test.js`

**Interfaces:**
- Consumes: `sharedFacetDefaults()` including `isParentIssue: false` (Task 1).
- Produces: `readRecord`/`queryRecords` facets carry `isParentIssue` (never `familyParent`); `writeRecord` emits `is-parent-issue: true`; `queryRecords(dir, { isParentIssue: true })` is the parent filter.

- [ ] **Step 1: Update the existing familyParent tests to the new key, and add the two legacy tests**

In `bin/lib/issues/tests/local-store.test.js`:

1. Every fixture/assertion key `familyParent` → `isParentIssue`; every expected frontmatter string `family-parent` → `is-parent-issue`; the section comment at ~line 129 becomes `// --- isParentIssue (parent-issue marker) ---`; test titles renamed the same way (e.g. `'writeRecord then readRecord round-trips isParentIssue: true as an is-parent-issue: true frontmatter line'`, `'must not write is-parent-issue: false'`, `'createRecord with isParentIssue: true is findable via queryRecords, ...'`, `queryRecords(dir, { isParentIssue: true })`). Note: `defaultFacets` no longer declares `familyParent`, so the full-shape deep-equality fixtures at ~lines 27, 49, 140, 216, 334 must say `isParentIssue: false` (or `true` at 140) in the same position.
2. Append two new tests OF the legacy path (raw legacy literals are deliberate and carry no tombstone — they are the tests of the fallback):

```js
test('a legacy record with family-parent: true frontmatter reads back isParentIssue: true', (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '9-legacy-parent.md'),
    '---\ntype: feature\nfamily-parent: true\n---\n\n# Legacy parent\n\nBody.\n', 'utf8');
  const record = readRecord(path.join(dir, '9-legacy-parent.md'));
  assert.strictEqual(record.facets.isParentIssue, true);
});

test('an explicit is-parent-issue: false beats a stray legacy family-parent: true (held-aside precedence)', (t) => {
  const dir = tmpDir(t);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '10-both-lines.md'),
    '---\ntype: feature\nis-parent-issue: false\nfamily-parent: true\n---\n\n# Both lines\n\nBody.\n', 'utf8');
  const record = readRecord(path.join(dir, '10-both-lines.md'));
  assert.strictEqual(record.facets.isParentIssue, false,
    'new-beats-legacy: a naive OR would wrongly resolve true');
});
```

(Adapt `tmpDir(t)`/imports to the helpers this test file already uses — read its existing fixtures first and reuse the same tmp-dir helper and import list.)

- [ ] **Step 2: Run tests to verify the new/renamed ones fail**

Run: `node --test bin/lib/issues/tests/local-store.test.js`
Expected: FAIL — renamed fixtures expect `isParentIssue`, code still produces `familyParent`.

- [ ] **Step 3: Implement in local-store.js**

1. Header comment (~line 8): replace `familyParent` with `isParentIssue` in the facet-superset list; note it is now a shared key: change `plus type, parent, familyParent, blockedBy, unsynced, closed, closedAt` to `plus type, parent, blockedBy, unsynced, closed, closedAt (isParentIssue is shared via facet-shape.js)`.
2. `defaultFacets()` (~line 44): delete the `familyParent: false,` line (the shared default now supplies `isParentIssue: false`). Update the function's comment block: the local-only key list drops `familyParent`; rewrite the `familyParent is the local-files parity...` paragraph to `isParentIssue is the local-files parity for the GitHub 'parent-issue' label (specify/record-creation.md's Parent record section): true only on a decomposition parent, never on a sub-issue. It is what makes a local-files parent queryable at all — ...` (keep the rest of the paragraph's reasoning verbatim).
3. `parseFrontmatterLines` (~line 97): add `let sawNewParentLine = false;` and `let legacyParentFallback = null;` next to `let effortFallback = null;`. Replace the `family-parent:` branch (~line 125) with:

```js
    if ((m = /^is-parent-issue:\s*(true|false)$/.exec(line))) { facets.isParentIssue = m[1] === 'true'; sawNewParentLine = true; continue; }
    // Read-side family-parent: fallback — PERMANENT cross-project support (pre-rename local records keep family-parent: lines); removable only at a major version that drops pre-rename repo support. [IL-85]
    // Precedence is held-aside, not OR: an explicit is-parent-issue: line (either value) must win over any legacy line, so the legacy value applies after the pass and only when no new line was seen.
    if ((m = /^family-parent:\s*(true|false)$/.exec(line))) { legacyParentFallback = m[1] === 'true'; continue; }
```

   After the loop, next to the existing `if (facets.size === null) facets.size = effortFallback;` line, add:

```js
  if (!sawNewParentLine && legacyParentFallback !== null) facets.isParentIssue = legacyParentFallback;
```

4. `serializeFrontmatter` (~line 199): replace `if (facets.familyParent) lines.push('family-parent: true');` with `if (facets.isParentIssue) lines.push('is-parent-issue: true');`. Update the function's header comment: `no 'family-parent' when false` → `no 'is-parent-issue' when false`, and append to the emit-side note: `Same for the parent marker: emit is only ever 'is-parent-issue:' — a legacy 'family-parent:' line is migrated on the first rewrite, never preserved alongside.`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/issues/tests/local-store.test.js`
Expected: PASS.

- [ ] **Step 5: Verify the precedence test discriminates**

Temporarily replace the post-loop line with a naive OR (`if (legacyParentFallback === true) facets.isParentIssue = true;`), run the suite, confirm the both-lines test FAILS, restore the held-aside line exactly, re-run to confirm PASS.

- [ ] **Step 6: Check for stray callers of the old key**

Run: `grep -rn "familyParent" bin/`
Expected: zero matches. (`queryRecords` filters are caller-supplied keys — the skills sweep #340 updates prose callers; no code caller exists in bin/ after this task.)

- [ ] **Step 7: Commit**

```bash
git add bin/lib/issues/local-store.js bin/lib/issues/tests/local-store.test.js
git commit -m "Rename local-files parent marker to is-parent-issue with held-aside legacy precedence — refs #339"
```

---

### Task 4: `familyGateState` → `parentGateState` in acceptance.js

**Files:**
- Modify: `bin/lib/issues/acceptance.js`
- Test: `bin/lib/issues/tests/acceptance.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: exported `parentGateState({ leaves, parentLabels }) -> 'resolved' | 'gated' | 'due' | 'incomplete'` — behavior byte-for-byte identical; `familyGateState` no longer exists. Signature parameter names unchanged.

- [ ] **Step 1: Rename in acceptance.js**

1. Function `familyGateState` → `parentGateState` (declaration + `module.exports`).
2. Its doc comment: `// A decomposition family's acceptance state.` → `// A parent issue's acceptance state across its sub-issues.` (rest of the comment unchanged — the label-authority reasoning stays; replace the phrase `a leaf reopening` with `a sub-issue reopening`).
3. `needsBackstop`'s inline comment: `// A decomposed leaf's acceptance lives on its family's parent, not on itself.` → `// A decomposed sub-issue's acceptance lives on its parent issue, not on itself.`

- [ ] **Step 2: Rename test references**

In `bin/lib/issues/tests/acceptance.test.js`: import destructure `familyGateState` → `parentGateState`; every call site and every test title renamed (`'familyGateState is incomplete while any leaf is open'` → `'parentGateState is incomplete while any sub-issue is open'`, `'familyGateState is due when every leaf is closed and the parent is unlabelled'` → `'parentGateState is due when every sub-issue is closed and the parent is unlabelled'`, `'familyGateState is gated once the parent carries demo:pending'` → `'parentGateState is gated once the parent carries demo:pending'`, `'familyGateState is resolved once a verdict is recorded'` → `'parentGateState is resolved once a verdict is recorded'`, `'familyGateState reports gated even if a leaf reopens after gating'` → `'parentGateState reports gated even if a sub-issue reopens after gating'`, `'familyGateState never reports due for a family with no discoverable leaves'` → `'parentGateState never reports due for a parent with no discoverable sub-issues'`). Zero behavioral edits to assertions.

- [ ] **Step 3: Run tests**

Run: `node --test bin/lib/issues/tests/acceptance.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add bin/lib/issues/acceptance.js bin/lib/issues/tests/acceptance.test.js
git commit -m "Rename familyGateState to parentGateState — refs #339"
```

---

### Task 5: trust.js comment sweep + label-bootstrap.md LABELS_JSON pair

**Files:**
- Modify: `bin/lib/issues/trust.js` (comments only)
- Modify: `skills/_shared/label-bootstrap.md` (one LABELS_JSON pair)

**Interfaces:**
- Consumes/Produces: nothing — comment-level and data-literal edits only.

- [ ] **Step 1: trust.js comment sweep**

Read `bin/lib/issues/trust.js` in full ([IL-17] — paraphrased mentions). The known family-vocabulary comment at ~lines 299-300 reads:

```
  // A decomposed leaf is not independently graded work — its family's parent
  // carries the one verdict. Counting leaves here would let `total >= 8` be
```

Rewrite to:

```
  // A decomposed sub-issue is not independently graded work — its parent issue
  // carries the one verdict. Counting sub-issues here would let `total >= 8` be
```

Then sweep the whole file for any other family/leaf mention that names the record class (`grep -n -iE "famil|\bleaf\b|\bleaves\b" bin/lib/issues/trust.js` and read each hit in context) and rewrite the same way. Plain-English verb usage stays.

- [ ] **Step 2: label-bootstrap.md pair**

In `skills/_shared/label-bootstrap.md` (~line 106), replace:

```
  ["family:parent",     "Structure: decomposition parent — carries the family's acceptance gate"],
```

with (preserve the column alignment style of neighboring rows):

```
  ["parent-issue",      "Structure: parent issue — carries the acceptance gate for its sub-issues"],
```

Do NOT touch line ~73's "label families" prose — that is the label-namespace sense (a #340 non-goal), not the record class.

- [ ] **Step 3: Verify**

Run: `grep -n "family:parent" skills/_shared/label-bootstrap.md`
Expected: zero matches.
Run: `grep -n -iE "famil" bin/lib/issues/trust.js`
Expected: zero matches (no other sense of the word exists in this file).

- [ ] **Step 4: Commit**

```bash
git add bin/lib/issues/trust.js skills/_shared/label-bootstrap.md
git commit -m "Sweep family vocabulary from trust.js comments and the canonical LABELS_JSON pair — refs #339"
```

---

### Task 6: Acceptance-criteria verification (whole-spec gate)

**Files:**
- No modifications expected; fix-forward only if a check fails.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: AC1 — label-derived facet triple**

Run: `node -e "const {parseRecordFacets}=require('./bin/lib/issues/record.js'); console.log(parseRecordFacets([{name:'family:parent'}]).isParentIssue, parseRecordFacets([{name:'parent-issue'}]).isParentIssue, parseRecordFacets([]).isParentIssue)"`
Expected output: `true true false`

- [ ] **Step 2: AC2 — export shape**

Run: `node -e "const a=require('./bin/lib/issues/acceptance.js'); console.log(typeof a.parentGateState, typeof a.familyGateState)"`
Expected output: `function undefined`

- [ ] **Step 3: AC4 grep 1 — renamed identifiers gone from bin/**

Run: `grep -rn "familyParent\|familyGateState\|parseFamilyLeaves" bin/`
Expected: zero matches (exit 1).

- [ ] **Step 4: AC4 grep 2 — tombstone-scoped legacy literals**

Run: `grep -rn "family:parent\|family-parent" bin/ --exclude-dir=tests`
Expected: exactly the legacy-compat parse branches in `record.js` and `local-store.js` — each match on or within one line of a comment carrying `[IL-85]`. Any other match is residue: fix it, don't rationalize it. (Test fixtures under `bin/lib/issues/tests/` are excluded by `--exclude-dir=tests` and are expected to carry bare legacy literals.)

- [ ] **Step 5: AC3/AC5 — full suite**

Run: `npm test`
Expected: exit 0. (AC3's round-trip/legacy-read behavior is pinned by the Task 3 tests inside the suite.)

- [ ] **Step 6: Commit (only if fixes were needed)**

```bash
git add -A bin/lib/issues skills/_shared/label-bootstrap.md
git commit -m "Fix verification residue from parent-issue contract rename — refs #339"
```

---

## Self-Review Notes

- Spec coverage: D1→Task 1, D2→Task 1 (facet-shape), D3→Task 3, D4→Task 4, D5→Task 2, D6→Task 5, D7→Task 5, D8 (tests a–e)→Tasks 1+3; AC1-5→Task 6. Gotcha "facets.parent untouched" → Global Constraints.
- Type consistency: `isParentIssue` (facet), `is-parent-issue:` (frontmatter), `parent-issue` (label), `parentGateState`, `parseSubIssues` — used identically across tasks.
- The plan's own greps were checked against the planned replacement text: Task 6 Step 3's grep cannot match the new code (`isParentIssue`/`parentGateState`/`parseSubIssues` don't contain the searched tokens); Task 6 Step 4's expected matches are exactly the two `[IL-85]` branches plus their regex lines.
