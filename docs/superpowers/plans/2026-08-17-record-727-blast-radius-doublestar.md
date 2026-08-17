# blast-radius `**` Glob Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `globToRegExp` in `bin/lib/issues/blast-radius.js` match `**` across path segments (`skills/**` matches `skills/backlog/overview-mode.md`) while single `*` stays segment-bound and every other behavior stays byte-identical.

**Architecture:** Replace the single-pass escape-then-substitute with a left-to-right tokenizer inside the existing memoized `globToRegExp`. Three documented `**` forms: `**/` (segment-bounded) → `(?:.*/)?`, trailing `/**` → `(?:/.*)?`, a glob that is exactly `**` → `.*`. Everything else — single `*` → `[^/]*`, all regex metacharacters including `?` escaped — is unchanged.

**Tech Stack:** Node (no deps), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T074020-spec-726-727/spec-727/work/727-spec.md`

## Global Constraints

- **Controller ruling (record-internal conflict):** the spec's Technical Approach sketch says `?` → `[^/]`, but its own Deliverable 1 says "Keep every other existing behavior byte-identical" and `tests/bin-lib/issues/blast-radius.test.js:76-93` pin `?` as a LITERAL (escaped) with a documented rationale in the module comment. The deliverable wins: **`?` stays escaped.** Do not change its handling; the pinned tests must keep passing untouched.
- A `**` embedded mid-segment (`a**b`, `a**/b`) is not a documented form — it must fall through to the single-`*` rule per star, preserving pre-fix behavior for degenerate shapes (boundary-guard the `**/` token on `i === 0 || glob[i-1] === '/'`).
- The per-glob memoization cache (`globRegExpCache`) and the module's exports are unchanged.
- TDD: new tests written and observed RED against the current implementation before the fix (this run's discrimination proof), GREEN after.
- Commit messages end `refs #727`; never `closes`/`fixes`.

---

### Task 1: Tokenize `globToRegExp` for `**` (TDD)

**Files:**
- Modify: `bin/lib/issues/blast-radius.js:41-50` (the `globToRegExp` function and its preceding comment block)
- Test: `tests/bin-lib/issues/blast-radius.test.js` (append one `#727` block)

**Interfaces:**
- Consumes: existing exports `classifyDiffFiles(files, sensitivePaths)`.
- Produces: unchanged signatures; only matching semantics for `**` widen.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/issues/blast-radius.test.js`:

```js
// --- #727: '**' must cross path segments; '*' must not ---

test('a "skills/**" sensitive path matches nested files several segments deep', () => {
  const files = [
    { path: 'skills/backlog/overview-mode.md', additions: 1, deletions: 0 },
    { path: 'bin/lib/issues/record.js', additions: 1, deletions: 0 },
  ];
  const result = classifyDiffFiles(files, ['skills/**', 'bin/**']);
  assert.strictEqual(result[0].isSensitive, true, 'skills/** must cross the backlog/ segment');
  assert.strictEqual(result[1].isSensitive, true, 'bin/** must cross lib/issues/');
});

test('a trailing "/**" also matches the bare parent path itself', () => {
  const result = classifyDiffFiles([{ path: 'skills', additions: 1, deletions: 0 }], ['skills/**']);
  assert.strictEqual(result[0].isSensitive, true);
});

test('"bin/lib/hooks/**" matches arbitrarily deep descendants', () => {
  const result = classifyDiffFiles([{ path: 'bin/lib/hooks/deep/x.js', additions: 1, deletions: 0 }], ['bin/lib/hooks/**']);
  assert.strictEqual(result[0].isSensitive, true);
});

test('"src/**/*.test.js" matches nested tests at any depth, including zero intermediate segments', () => {
  const nested = classifyDiffFiles([{ path: 'src/a/b/widget.test.js', additions: 1, deletions: 0 }], ['src/**/*.test.js']);
  const flat = classifyDiffFiles([{ path: 'src/widget.test.js', additions: 1, deletions: 0 }], ['src/**/*.test.js']);
  assert.strictEqual(nested[0].isSensitive, true);
  assert.strictEqual(flat[0].isSensitive, true);
});

test('the merge-sensitive-paths shape "src/auth/**" trips on a nested file while "src/auth/*" still does not', () => {
  const doubled = classifyDiffFiles([{ path: 'src/auth/session/token.ts', additions: 1, deletions: 0 }], ['src/auth/**']);
  const single = classifyDiffFiles([{ path: 'src/auth/session/token.ts', additions: 1, deletions: 0 }], ['src/auth/*']);
  assert.strictEqual(doubled[0].isSensitive, true, 'src/auth/** must cross the session/ segment');
  assert.strictEqual(single[0].isSensitive, false, 'single * must stay segment-bound');
});

test('single "*" still does not cross a path segment', () => {
  const result = classifyDiffFiles([{ path: 'skills/backlog/overview-mode.md', additions: 1, deletions: 0 }], ['skills/*']);
  assert.strictEqual(result[0].isSensitive, false);
});
```

- [ ] **Step 2: Run them to verify they fail (RED)**

Run: `node --test tests/bin-lib/issues/blast-radius.test.js`
Expected: the first, third, fourth (nested half), and fifth (doubled half) new assertions FAIL against the current `[^/]*`-only implementation; every pre-existing test still passes. Record the failing output.

- [ ] **Step 3: Replace `globToRegExp` with the tokenizer**

Replace the function (lines 42-50) with:

```js
function globToRegExp(glob) {
  let re = globRegExpCache.get(glob);
  if (!re) {
    // Tokenised left-to-right so '**' can span path segments while '*' stays
    // segment-bound (#727): '**/' matches zero or more whole segments, a
    // trailing '/**' matches the bare parent or anything under it, and a glob
    // that is exactly '**' matches everything. A '**' embedded mid-segment
    // ('a**b', 'a**/b') is not a documented form and falls through to the
    // single-'*' rule per star, preserving the pre-#727 behavior for that
    // degenerate shape.
    let source = '';
    let i = 0;
    while (i < glob.length) {
      if (glob.startsWith('/**', i) && i + 3 === glob.length) { source += '(?:/.*)?'; i += 3; continue; }
      if (glob.startsWith('**/', i) && (i === 0 || glob[i - 1] === '/')) { source += '(?:.*/)?'; i += 3; continue; }
      if (glob === '**') { source = '.*'; break; }
      const ch = glob[i];
      source += ch === '*' ? '[^/]*' : ch.replace(/[.+^${}()|[\]\\?]/, '\\$&');
      i += 1;
    }
    re = new RegExp(`^${source}$`);
    globRegExpCache.set(glob, re);
  }
  return re;
}
```

Also update the comment block above the function (lines 28-40): keep the memoization paragraph and the `?`-escaping rationale verbatim; replace the first paragraph's "Minimal glob support: '*' matches within a path segment (not '/')" sentence so it documents both wildcard tiers — `*` segment-bound, `**` crossing segments per the three forms above.

- [ ] **Step 4: Run the module suite (GREEN)**

Run: `node --test tests/bin-lib/issues/blast-radius.test.js`
Expected: PASS — all pre-existing tests (including the literal-`?` pair and the memoization compile-count test) plus all new `#727` tests.

- [ ] **Step 5: AC 1 spot-check**

Run:
```bash
node -e "const {classifyDiffFiles}=require('./bin/lib/issues/blast-radius.js');console.log(JSON.stringify(classifyDiffFiles([{path:'skills/backlog/overview-mode.md'},{path:'bin/lib/issues/record.js'}],['skills/**','bin/**']).map(f=>({path:f.path,isSensitive:f.isSensitive}))))"
```
Expected: both entries `"isSensitive":true`.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/blast-radius.js tests/bin-lib/issues/blast-radius.test.js
git commit -m "Make blast-radius globToRegExp span path segments on ** — refs #727"
```

---

### Task 2: Consumer sweep + full verification (controller-runnable)

**Files:**
- Test: read-only sweep + full suite (no edits expected)

- [ ] **Step 1: Consumer reliance sweep**

Verify no consumer relied on the old narrow behavior:
```bash
grep -rn "merge-sensitive-paths" tests/ .claude-tweaks/policy.yml 2>/dev/null
grep -n '\*\*' docs/REGISTRY.md
```
Expected: no test fixture encodes a `**` pattern that depended on single-segment matching; `docs/REGISTRY.md`'s `**` patterns (`skills/**/SKILL.md`, `bin/**/*.js`, `skills/**/*.md`, `bin/lib/hooks/**`, `bin/lib/release/**`) are exactly the shapes the fix makes work — leave them as written (spec Deliverable 4).

- [ ] **Step 2: Wrap-up Docs-row scope resolution check (spec Deliverable 3)**

Run:
```bash
node -e "const {classifyDiffFiles}=require('./bin/lib/issues/blast-radius.js');const diff=[{path:'skills/backlog/overview-mode.md'},{path:'bin/lib/issues/record.js'},{path:'docs/getting-started.md'}];const pats=['skills/**/*.md','bin/**/*.js'];console.log('plugin-structure hits:',classifyDiffFiles(diff,pats).filter(f=>f.isSensitive).map(f=>f.path))"
```
Expected: both the nested `skills/` file and the `bin/lib/issues/` file listed — `docs/plugin-structure.md` now scores nonzero on a nested change.

- [ ] **Step 3: Full suite**

Run: `npm test > /tmp/727-suite.log 2>&1; grep -E '^# (tests|pass|fail|cancelled)' /tmp/727-suite.log`
Expected: `# fail 0`, `# cancelled 0`.

- [ ] **Step 4: Commit (only if Steps 1–3 forced a change)**

Skip when nothing changed.
