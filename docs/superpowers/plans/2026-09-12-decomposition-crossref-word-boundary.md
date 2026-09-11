# crossReferenceKeyFiles Word-Boundary + Re-Parse/Re-Grep Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `crossReferenceKeyFiles` in `plugin/bin/lib/issues/decomposition-crossref.js` so sibling-title matching uses a word-boundary regex instead of a plain substring test, and so per-`other` section extraction and per-identifier `grep` calls each happen at most once per batch instead of once per unit×other pair.

**Architecture:** No new files, no interface changes — `crossReferenceKeyFiles(units, grep)` keeps its exact signature and return shape. Three isolated edits inside the same function body: (1) swap `line.toLowerCase().includes(titleLower)` for a case-insensitive `\b{escaped title}\b` regex test, reusing `escapeRegExp`; (2) hoist the `other`-keyed `extractSection` computation out of the outer `unit` loop into a `Map` built once before both loops run; (3) wrap the injected `grep` in a memoizing closure keyed by identifier, built once per `crossReferenceKeyFiles` call and shared across every `unit`/`other` pair in that call.

**Tech Stack:** Node.js (CommonJS), `node --test` + `node:assert/strict`.

**Spec:** GitHub issue #2067 (materialized at `.claude-tweaks/pipelines/2026-09-11T233824-record-2067/work/2067-spec.md` in this worktree).

## Global Constraints

- Reuse `escapeRegExp` from `plugin/bin/lib/shared-primitives.js` — do not write a second regex-escaping helper.
- All six existing tests in `tests/bin-lib/issues/decomposition-crossref.test.js` must keep passing, unchanged.
- `crossReferenceKeyFiles`'s public signature and return shape (`[{ title, addedFiles: [{ path, note }] }]`) do not change.
- Touch only `plugin/bin/lib/issues/decomposition-crossref.js` and its test file — no other files in the plan (per CLAUDE.md's surgical-changes rule).

---

### Task 1: Word-boundary sibling-title match

**Files:**
- Modify: `plugin/bin/lib/issues/decomposition-crossref.js:1-21` (require `escapeRegExp`; the substring test itself is inside `crossReferenceKeyFiles`, currently at line 72 — `if (!line.toLowerCase().includes(titleLower)) continue;`)
- Test: `tests/bin-lib/issues/decomposition-crossref.test.js`

**Interfaces:**
- Consumes: `escapeRegExp(s)` from `plugin/bin/lib/shared-primitives.js` — exported at line 63, signature `(s: string) => string`, escapes regex metacharacters.
- Produces: no new exports — `crossReferenceKeyFiles`'s existing signature/behavior, just a stricter match.

- [ ] **Step 1: Write the failing test**

Append to `tests/bin-lib/issues/decomposition-crossref.test.js` (after the existing six tests, before the final newline):

```javascript
test('a short generic sibling title does not wrongly match as a substring of an unrelated word', () => {
  const bodyA = '## Gotchas\n\n- The word prefix here mentions `helper()` but not the sibling by name.\n\n### Key Files\n\n- `a.js`\n';
  const bodyB = '## Deliverables\n\nBuild it.\n\n### Key Files\n\n- `unrelated.js`\n';
  const units = [
    { title: 'Origin task', body: bodyA },
    { title: 'Fix', body: bodyB },
  ];
  const grepCalls = [];
  const grep = (ident) => { grepCalls.push(ident); return ['should-not-appear.js']; };

  const result = crossReferenceKeyFiles(units, grep);

  assert.deepStrictEqual(grepCalls, [], 'title "Fix" must not match as a substring inside "prefix"');
  assert.deepStrictEqual(result, [], 'no cross-reference should be produced from a substring-only match');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/issues/decomposition-crossref.test.js`
Expected: FAIL — the new test's assertions fail because the current substring test (`'prefix'.includes('fix')` is `true`) wrongly matches "Fix" inside "prefix", so `grep` is called and `result` is non-empty.

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/lib/issues/decomposition-crossref.js`, add the import near the top (after the existing `extractKeyFilesSection` require):

```javascript
const { extractKeyFilesSection } = require('./grouping');
const { escapeRegExp } = require('../shared-primitives');
```

Inside `crossReferenceKeyFiles`, replace the title-matching block. Current code (inside the `for (const other of list)` loop, inside `for (const unit of list)`):

```javascript
      const title = String(unit.title || '');
      if (!title) continue;
      const text = `${extractSection(other.body, 'Gotchas')}\n${extractSection(other.body, 'Prerequisites')}`;
      const titleLower = title.toLowerCase();

      for (const line of text.split('\n')) {
        if (!line.toLowerCase().includes(titleLower)) continue;
```

Replace with:

```javascript
      const title = String(unit.title || '');
      if (!title) continue;
      const text = `${extractSection(other.body, 'Gotchas')}\n${extractSection(other.body, 'Prerequisites')}`;
      const titleRe = new RegExp(`\\b${escapeRegExp(title)}\\b`, 'i');

      for (const line of text.split('\n')) {
        if (!titleRe.test(line)) continue;
```

(Task 2 below hoists the `extractSection` call itself out of this loop — leave `text` computed here for this task's own minimal diff, since Task 2's restructuring subsumes this exact line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/issues/decomposition-crossref.test.js`
Expected: PASS — all 7 tests (6 existing + 1 new) green.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/issues/decomposition-crossref.js tests/bin-lib/issues/decomposition-crossref.test.js
git commit -m "Fix crossReferenceKeyFiles sibling-title match to use word boundaries

refs #2067"
```

---

### Task 2: Hoist per-`other` section extraction out of the outer loop

**Files:**
- Modify: `plugin/bin/lib/issues/decomposition-crossref.js` (the `crossReferenceKeyFiles` function body)
- Test: `tests/bin-lib/issues/decomposition-crossref.test.js`

**Interfaces:**
- Consumes: `extractSection(body, headingText)` (already defined in this file, unchanged signature: `(body: string, headingText: string) => string`).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to the test file:

```javascript
test('extractSection is computed at most once per distinct sibling unit, not once per unit x other pair', () => {
  const bodyOf = (n) => `## Gotchas\n\n- Mentions Sibling ${n} and \`helper${n}()\`.\n\n### Key Files\n\n- \`origin${n}.js\`\n`;
  const units = [
    { title: 'Sibling 1', body: bodyOf(1) },
    { title: 'Sibling 2', body: bodyOf(2) },
    { title: 'Sibling 3', body: bodyOf(3) },
  ];
  const grep = () => [];

  // Count how many times each unit's `.body` is read (a getter-backed
  // property) rather than measuring timing — a direct, deterministic proxy
  // for whether `extractSection` runs once per `other` (hoisted) or once
  // per unit x other pair (the current O(N^2) behavior).
  let bodyReadCount = 0;
  const countingUnits = units.map((u) => {
    let reads = 0;
    return {
      title: u.title,
      get body() {
        reads += 1;
        bodyReadCount += 1;
        return u.body;
      },
    };
  });

  crossReferenceKeyFiles(countingUnits, grep);

  // `.body` is read from two call sites: the hoisted section-extraction pass
  // (2 reads per unit acting as `other` — Gotchas + Prerequisites — regardless
  // of how many units reference it) and the per-unit `extractKeyFilesSection`
  // call at the end of each outer iteration (1 read per unit acting as `unit`).
  // For 3 units: hoisted-once gives 3 x 2 = 6, plus 3 x 1 = 3 for the
  // existing-Key-Files read, for an expected total of 9 — never the
  // un-hoisted 3 units x 2 valid others x 2 reads = 12 (plus the same 3 for
  // existing-Key-Files = 15) the current code produces by recomputing
  // `extractSection(other.body, ...)` inside the inner loop on every outer
  // iteration.
  assert.strictEqual(bodyReadCount, 9, `expected 9 body reads (hoisted once per unit, 2+1), got ${bodyReadCount}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/issues/decomposition-crossref.test.js`
Expected: FAIL with `expected 9 body reads (hoisted once per unit, 2+1), got 15` (3 units × 2 valid others each × 2 reads = 12, plus 3 reads for the per-unit `extractKeyFilesSection` call = 15 total, since the current code recomputes `extractSection(other.body, ...)` inside the inner loop on every outer iteration instead of once per `other`).

- [ ] **Step 3: Write minimal implementation**

Restructure `crossReferenceKeyFiles` to compute each `other`'s section text once, before the outer loop, into a `Map` keyed by the `other` object reference:

```javascript
function crossReferenceKeyFiles(units, grep) {
  const list = Array.isArray(units) ? units : [];
  const results = [];

  const sectionTextByOther = new Map();
  for (const other of list) {
    if (!other) continue;
    sectionTextByOther.set(
      other,
      `${extractSection(other.body, 'Gotchas')}\n${extractSection(other.body, 'Prerequisites')}`,
    );
  }

  for (const unit of list) {
    const additions = new Map(); // path -> note

    for (const other of list) {
      if (other === unit || !other || !unit) continue;
      const title = String(unit.title || '');
      if (!title) continue;
      const text = sectionTextByOther.get(other) || '';
      const titleRe = new RegExp(`\\b${escapeRegExp(title)}\\b`, 'i');

      for (const line of text.split('\n')) {
        if (!titleRe.test(line)) continue;
        const idents = [...line.matchAll(BACKTICK_RE)]
          .map((m) => m[1])
          .filter((token) => IDENTIFIER_LIKE_RE.test(token));

        for (const ident of idents) {
          let files = [];
          try {
            files = grep(ident) || [];
          } catch {
            files = [];
          }
          for (const file of files) {
            if (TEST_PATH_RE.test(file) || TEST_FILE_RE.test(file)) continue;
            if (!additions.has(file)) {
              additions.set(file, `cross-referenced from "${other.title}"'s Gotchas (names \`${ident}\`)`);
            }
          }
        }
      }
    }

    const existing = new Set(extractKeyFilesSection(unit.body));
    const toAdd = [...additions].filter(([path]) => !existing.has(path));
    if (toAdd.length) {
      results.push({
        title: unit.title,
        addedFiles: toAdd.map(([path, note]) => ({ path, note })),
      });
    }
  }

  return results;
}
```

(The `grep` memoization itself is Task 3 — this task only hoists section extraction. `grep` calls stay as-is here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/issues/decomposition-crossref.test.js`
Expected: PASS — all 8 tests (6 original + Task 1's + this task's) green.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/issues/decomposition-crossref.js tests/bin-lib/issues/decomposition-crossref.test.js
git commit -m "Hoist per-sibling section extraction out of crossReferenceKeyFiles's outer loop

refs #2067"
```

---

### Task 3: Memoize `grep(ident)` across the whole batch

**Files:**
- Modify: `plugin/bin/lib/issues/decomposition-crossref.js` (the `crossReferenceKeyFiles` function body)
- Test: `tests/bin-lib/issues/decomposition-crossref.test.js`

**Interfaces:**
- Consumes: the injected `grep(ident): string[]` parameter (unchanged signature).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to the test file:

```javascript
test('grep is called at most once per distinct identifier across the whole batch, even when multiple units reference the same identifier', () => {
  const bodyOf = (n) => `## Gotchas\n\n- Mentions Origin and \`shared()\` (unit ${n}).\n\n### Key Files\n\n- \`u${n}.js\`\n`;
  const units = [
    { title: 'Origin', body: '## Deliverables\n\nBuild it.\n\n### Key Files\n\n- `origin.js`\n' },
    { title: 'Unit A', body: bodyOf('A') },
    { title: 'Unit B', body: bodyOf('B') },
  ];
  const grepCalls = [];
  const grep = (ident) => {
    grepCalls.push(ident);
    return ident === 'shared()' ? ['shared-module.js'] : [];
  };

  crossReferenceKeyFiles(units, grep);

  const sharedCalls = grepCalls.filter((i) => i === 'shared()');
  assert.strictEqual(sharedCalls.length, 1, `expected grep('shared()') exactly once, called ${sharedCalls.length} times`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/issues/decomposition-crossref.test.js`
Expected: FAIL — `shared()` is referenced in both Unit A's and Unit B's Gotchas, and each is scanned once per outer `unit` (`Origin`, `Unit A`, `Unit B`) whose Gotchas mention "Origin" — `grep('shared()')` is currently called once per matching (unit, other) pair, so `sharedCalls.length` is 2, not 1.

- [ ] **Step 3: Write minimal implementation**

Add a memoizing wrapper around `grep`, built once per `crossReferenceKeyFiles` call, and use it in place of the raw `grep` inside the loop:

```javascript
function crossReferenceKeyFiles(units, grep) {
  const list = Array.isArray(units) ? units : [];
  const results = [];

  const sectionTextByOther = new Map();
  for (const other of list) {
    if (!other) continue;
    sectionTextByOther.set(
      other,
      `${extractSection(other.body, 'Gotchas')}\n${extractSection(other.body, 'Prerequisites')}`,
    );
  }

  const grepCache = new Map();
  const memoizedGrep = (ident) => {
    if (grepCache.has(ident)) return grepCache.get(ident);
    let files = [];
    try {
      files = grep(ident) || [];
    } catch {
      files = [];
    }
    grepCache.set(ident, files);
    return files;
  };

  for (const unit of list) {
    const additions = new Map(); // path -> note

    for (const other of list) {
      if (other === unit || !other || !unit) continue;
      const title = String(unit.title || '');
      if (!title) continue;
      const text = sectionTextByOther.get(other) || '';
      const titleRe = new RegExp(`\\b${escapeRegExp(title)}\\b`, 'i');

      for (const line of text.split('\n')) {
        if (!titleRe.test(line)) continue;
        const idents = [...line.matchAll(BACKTICK_RE)]
          .map((m) => m[1])
          .filter((token) => IDENTIFIER_LIKE_RE.test(token));

        for (const ident of idents) {
          const files = memoizedGrep(ident);
          for (const file of files) {
            if (TEST_PATH_RE.test(file) || TEST_FILE_RE.test(file)) continue;
            if (!additions.has(file)) {
              additions.set(file, `cross-referenced from "${other.title}"'s Gotchas (names \`${ident}\`)`);
            }
          }
        }
      }
    }

    const existing = new Set(extractKeyFilesSection(unit.body));
    const toAdd = [...additions].filter(([path]) => !existing.has(path));
    if (toAdd.length) {
      results.push({
        title: unit.title,
        addedFiles: toAdd.map(([path, note]) => ({ path, note })),
      });
    }
  }

  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/issues/decomposition-crossref.test.js`
Expected: PASS — all 9 tests (6 original + 3 new) green.

- [ ] **Step 5: Run the full existing suite to confirm no regression (AC4)**

Run: `node --test tests/bin-lib/issues/decomposition-crossref.test.js`
Expected: PASS — 9/9, including the original 6 tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/issues/decomposition-crossref.js tests/bin-lib/issues/decomposition-crossref.test.js
git commit -m "Memoize grep(ident) across crossReferenceKeyFiles batch calls

refs #2067"
```
