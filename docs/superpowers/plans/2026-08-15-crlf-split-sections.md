# CRLF splitSections() Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `splitSections()` in `bin/lib/init/claude-md-conformance.js` tolerate CRLF line endings so `checkConformance()` never silently reports "everything conformant" on a CRLF template or project CLAUDE.md.

**Architecture:** One-line normalization fix inside `splitSections`: strip `\r\n` to `\n` before splitting the input into lines, so the existing per-line heading regex (`/^## (.+)$/`) sees the same input shape regardless of the source file's line-ending style. No other function changes.

**Tech Stack:** Node.js (`node --test`), CommonJS module `bin/lib/init/claude-md-conformance.js`.

**Spec:** `.claude-tweaks/pipelines/2026-08-15T153515-spec-346/work/346-spec.md`

## Global Constraints

- Fix must land inside `splitSections` itself, not in `checkConformance` or any caller — `splitSections` is directly exported and other/future callers need the same tolerance.
- Only CRLF (`\r\n`) is in scope. Do not strip bare `\r` (old Mac-style line endings) — that is a different, unreported input shape.
- No change to `extractTemplateBody`'s fence-matching logic — it already tolerates CRLF via `.trim()`.
- `npm test` must pass at the end.

---

### Task 1: Normalize CRLF in splitSections + regression test

**Files:**
- Modify: `bin/lib/init/claude-md-conformance.js:49-65` (the `splitSections` function)
- Test: `tests/bin-lib/init/claude-md-conformance.test.js`

**Interfaces:**
- Consumes: nothing new — `splitSections(markdown: string): Map<string, string>` (existing signature, unchanged).
- Produces: nothing new for other tasks — this is the only task in the plan.

- [ ] **Step 1: Write the failing test**

Append these two tests to the end of `tests/bin-lib/init/claude-md-conformance.test.js` (after the last existing test, around line 265) — `TPL` and `checkConformance` are already declared/imported earlier in the file (module scope), so both are in scope here:

```js
test('splitSections tolerates CRLF line endings', () => {
  const crlfFixture = FIXTURE.replace(/\n/g, '\r\n');
  const lfSections = splitSections(extractTemplateBody(FIXTURE));
  const crlfSections = splitSections(extractTemplateBody(crlfFixture));
  assert.deepStrictEqual([...crlfSections.keys()], [...lfSections.keys()]);
  for (const key of lfSections.keys()) {
    assert.strictEqual(crlfSections.get(key).trim(), lfSections.get(key).trim());
  }
});

test('checkConformance reports missing sections on a CRLF template, not an empty result', () => {
  const crlfTemplate = TPL.replace(/\n/g, '\r\n');
  const r = checkConformance({ templateSource: crlfTemplate, projectClaudeMd: '' });
  assert.deepStrictEqual(
    r.missing.map((m) => m.section).sort(),
    ['Working Approach', 'claude-tweaks Pipeline'].sort(),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/init/claude-md-conformance.test.js`
Expected: the two new tests FAIL (`splitSections tolerates CRLF line endings` fails because `crlfSections` is an empty Map; `checkConformance reports missing sections on a CRLF template` fails because `r.missing` is `[]` instead of the two expected sections). All pre-existing tests in the file still PASS.

- [ ] **Step 3: Write minimal implementation**

Edit `bin/lib/init/claude-md-conformance.js`. Change line 53 from:

```js
  for (const line of markdown.split('\n')) {
```

to:

```js
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/init/claude-md-conformance.test.js`
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS — no regressions elsewhere.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/init/claude-md-conformance.js tests/bin-lib/init/claude-md-conformance.test.js
git commit -m "Fix splitSections() to tolerate CRLF line endings (fixes #346)"
```
