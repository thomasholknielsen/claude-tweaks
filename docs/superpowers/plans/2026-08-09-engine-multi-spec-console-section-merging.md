# Engine: Multi-Spec Console Section Merging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `renderConsoleSectionsMulti` engine-render function and a repeatable `--spec-state <id>=<path>` CLI flag to `wrap-up-engine.js render --section console`, so a multi-spec `/flow` run can merge N specs' `engine-state.json` files into one consolidated Review Console instead of hand-writing a subset.

**Architecture:** `renderConsoleSectionsMulti` mirrors the existing `renderConsoleSections`'s `SECTION_SPECS` loop but swaps the nesting — outer loop over section title, inner loop over the given `specStates` in caller order — and adds a `Spec` column immediately after `#`. The CLI gains a `--spec-state` flag (repeatable, `id=path`); when one or more are given, `--section` must be `console` and `--run-dir` must be absent, and each path's `engine-state.json` is loaded by the CLI (never inside the pure renderer) and dispatched to the new function instead of `renderConsoleSections`.

**Tech Stack:** Node.js (`node --test`), no new dependencies. Existing files: `bin/lib/wrap-up/engine-render.js` (pure renderer), `bin/wrap-up-engine.js` (CLI).

## Global Constraints

- `renderConsoleSectionsMulti` must stay a pure function of its `specStates` argument — no `fs`, no `git`, no clock (this module's own header comment). Every `fs.readFileSync` for a `--spec-state` path belongs in `wrap-up-engine.js`'s `render` verb handler.
- `renderConsoleSections`, `SECTION_SPECS`, and `dispositionFor` must not change behavior — single-spec `render --run-dir <dir> --section console` output stays byte-for-byte identical (AC 11).
- `assertCleanVocabulary` must run once over the final *merged* markdown string in `renderConsoleSectionsMulti`, not per-spec-then-concatenated.
- Duplicate `--spec-state` ids are accepted without deduplication — documented caller behavior, not validated here (AC 14).
- No cross-state schema-version check — every `--spec-state` file in one call is assumed to come from the same plugin version's `record` verb, by construction. Do not add defensive version-mismatch handling.

---

### Task 1: `renderConsoleSectionsMulti` in `engine-render.js`

**Files:**
- Modify: `bin/lib/wrap-up/engine-render.js`
- Test: `bin/lib/wrap-up/tests/engine-render.test.js`

**Interfaces:**
- Consumes: existing `SECTION_SPECS` (module-level array), existing `dispositionFor(finding)` helper, existing `assertCleanVocabulary(markdown, source)` helper — all already defined in this file, unchanged.
- Produces: `renderConsoleSectionsMulti(specStates, { startAt = 1 } = {})` → `{ markdown, nextNumber }`. `specStates` is `[{ specId: string, state: object }, ...]` in caller-supplied order. Exported from `bin/lib/wrap-up/engine-render.js` alongside the existing exports. Task 2 imports this export by name.

- [ ] **Step 1: Write the failing tests**

Append to `bin/lib/wrap-up/tests/engine-render.test.js`, after the existing `renderConsoleSections` tests (end of file, following the same `makeConsoleResults()` fixture pattern already used above):

```js
// ---- renderConsoleSectionsMulti -------------------------------------------

const { renderConsoleSectionsMulti } = require('../engine-render');

function makeConsoleResultsB() {
  return {
    skills: {
      rowId: 'skills', target: 'Skills', result: 'findings', detail: '1 change',
      findings: [
        { kind: 'additive', summary: 'Add anti-pattern row (spec B)', targetPath: '.claude/skills/other/SKILL.md', action: 'applied', stagePath: null, commit: 'ccc3333' },
      ],
    },
    docs: { rowId: 'docs', target: 'Docs', result: 'na', detail: 'no changes' },
    journeys: { rowId: 'journeys', target: 'Journeys', result: 'clean', detail: 'Read 1', findings: [] },
    'claude-md': { rowId: 'claude-md', target: 'CLAUDE.md & rules', result: 'na', detail: 'no changes' },
    'decision-records': { rowId: 'decision-records', target: 'Decision records', result: 'na', detail: 'no ADR candidates found' },
    references: { rowId: 'references', target: 'Broken references', result: 'na', detail: 'no broken references' },
    memory: { rowId: 'memory', target: 'Memory', result: 'na', detail: 'no insights routed to memory' },
    upstream: { rowId: 'upstream', target: 'Upstream feedback', result: 'na', detail: 'no learnings routed upstream' },
  };
}

test('renderConsoleSectionsMulti merges N specs into one table per section, Spec column right after #, rows in specStates order', () => {
  const stateA = { version: 1, worklist: makeWorklist(), results: makeConsoleResults() };
  const stateB = { version: 1, worklist: makeWorklist(), results: makeConsoleResultsB() };
  const { markdown, nextNumber } = renderConsoleSectionsMulti(
    [{ specId: '157', state: stateA }, { specId: '159', state: stateB }],
    { startAt: 1 },
  );

  // One "Skill updates" heading total (merged, not one per spec).
  const skillHeadings = markdown.match(/#### Skill updates/g) || [];
  assert.strictEqual(skillHeadings.length, 1);

  // Header row: # | Spec | Target | Change | Disposition
  assert.match(markdown, /^\| # \| Spec \| Target \| Change \| Disposition \|$/m);

  // Spec 157's skills row (2 findings) precedes spec 159's skills row (1 finding) within the section.
  const skillsSection = markdown.split('#### Skill updates')[1].split('####')[0];
  const specColumnValues = [...skillsSection.matchAll(/^\| \d+ \| (\d+) \|/gm)].map((m) => m[1]);
  assert.deepStrictEqual(specColumnValues, ['157', '157', '159']);

  // Continuous numbering across specs and sections: 157 contributes 2 (skills) + 3+1 (config) + 2 (refs) = 8 rows; 159 contributes 1 (skills) = 1 row. Total 9 rows, startAt 1 -> nextNumber 10.
  assert.strictEqual(nextNumber, 10);
});

test('renderConsoleSectionsMulti: a spec contributing zero findings to a section contributes zero rows to it', () => {
  const stateA = { version: 1, worklist: makeWorklist(), results: makeConsoleResults() };
  const stateB = { version: 1, worklist: makeWorklist(), results: makeConsoleResultsB() };
  const { markdown } = renderConsoleSectionsMulti(
    [{ specId: '157', state: stateA }, { specId: '159', state: stateB }],
    { startAt: 1 },
  );
  // stateB has zero Configuration-updates findings -> only 157's 4 rows appear there.
  const configSection = markdown.split('#### Configuration updates')[1].split('#### Reference repairs')[0];
  const specColumnValues = [...configSection.matchAll(/^\| \d+ \| (\d+) \|/gm)].map((m) => m[1]);
  assert.deepStrictEqual(specColumnValues, ['157', '157', '157', '157']);
});

test('renderConsoleSectionsMulti omits a section entirely when every given spec has zero findings for it', () => {
  const resultsA = makeConsoleResults();
  resultsA.skills = { rowId: 'skills', target: 'Skills', result: 'na', detail: 'no changes' };
  const stateA = { version: 1, worklist: makeWorklist(), results: resultsA };

  const resultsB = makeConsoleResultsB();
  resultsB.skills = { rowId: 'skills', target: 'Skills', result: 'na', detail: 'no changes' };
  const stateB = { version: 1, worklist: makeWorklist(), results: resultsB };

  const { markdown } = renderConsoleSectionsMulti(
    [{ specId: '157', state: stateA }, { specId: '159', state: stateB }],
    { startAt: 1 },
  );
  assert.doesNotMatch(markdown, /#### Skill updates/);
});

test('renderConsoleSectionsMulti runs assertCleanVocabulary over the full merged output', () => {
  const stateA = { version: 1, worklist: makeWorklist(), results: makeConsoleResults() };
  const resultsB = makeConsoleResultsB();
  resultsB.skills.findings[0].summary = 'D0 domain-overlap smuggled in (spec B)';
  const stateB = { version: 1, worklist: makeWorklist(), results: resultsB };
  assert.throws(
    () => renderConsoleSectionsMulti([{ specId: '157', state: stateA }, { specId: '159', state: stateB }], { startAt: 1 }),
    /forbidden vocabulary/,
  );
});

test('renderConsoleSectionsMulti defaults startAt to 1 when omitted', () => {
  const stateA = { version: 1, worklist: makeWorklist(), results: makeConsoleResults() };
  const { markdown } = renderConsoleSectionsMulti([{ specId: '157', state: stateA }], {});
  assert.match(markdown, /^\| 1 \|/m);
});

test('renderConsoleSectionsMulti does NOT deduplicate two entries sharing the same specId', () => {
  const stateA = { version: 1, worklist: makeWorklist(), results: makeConsoleResults() };
  const { markdown } = renderConsoleSectionsMulti(
    [{ specId: '157', state: stateA }, { specId: '157', state: stateA }],
    { startAt: 1 },
  );
  const skillsSection = markdown.split('#### Skill updates')[1].split('####')[0];
  const specColumnValues = [...skillsSection.matchAll(/^\| \d+ \| (\d+) \|/gm)].map((m) => m[1]);
  // stateA's skills row has 2 findings; passed twice under the same id -> 4 rows, all tagged 157.
  assert.deepStrictEqual(specColumnValues, ['157', '157', '157', '157']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/wrap-up/tests/engine-render.test.js`
Expected: FAIL — `renderConsoleSectionsMulti is not a function` (or `undefined`) for each new test.

- [ ] **Step 3: Implement `renderConsoleSectionsMulti`**

In `bin/lib/wrap-up/engine-render.js`, add after the existing `renderConsoleSections` function (before the `strictCheck` section):

```js
function renderConsoleSectionsMulti(specStates, { startAt = 1 } = {}) {
  let n = startAt;
  const blocks = [];

  for (const spec of SECTION_SPECS) {
    const tableLines = ['| # | Spec | Target | Change | Disposition |', '|---|---|---|---|---|'];
    let any = false;
    for (const { specId, state } of specStates) {
      const results = (state && state.results) || {};
      for (const rowId of spec.rowIds) {
        const entry = results[rowId];
        if (entry && entry.result === 'findings') {
          for (const finding of entry.findings || []) {
            tableLines.push(`| ${n} | ${specId} | ${finding.targetPath} | ${finding.summary} | ${dispositionFor(finding)} |`);
            n += 1;
            any = true;
          }
        }
      }
    }
    if (!any) continue;
    blocks.push(`#### ${spec.title}\n\n${tableLines.join('\n')}`);
  }

  const markdown = blocks.join('\n\n');
  assertCleanVocabulary(markdown, 'renderConsoleSectionsMulti');
  return { markdown, nextNumber: n };
}
```

Update the module's final export line:

```js
module.exports = { renderTrace, renderConsoleSections, renderConsoleSectionsMulti, strictCheck, FORBIDDEN_VOCABULARY };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/wrap-up/tests/engine-render.test.js`
Expected: PASS — all tests, including the pre-existing `renderConsoleSections` tests (unchanged).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/wrap-up/engine-render.js bin/lib/wrap-up/tests/engine-render.test.js
git commit -m "Add renderConsoleSectionsMulti for multi-spec console merging"
```

---

### Task 2: `--spec-state` CLI flag parsing + happy-path dispatch

**Files:**
- Modify: `bin/wrap-up-engine.js`
- Test: `bin/lib/wrap-up/tests/engine-cli.test.js`

**Interfaces:**
- Consumes: `renderConsoleSectionsMulti` from Task 1 (`./lib/wrap-up/engine-render`).
- Produces: `parseArgs(argv).specStates` — array of raw `id=path` strings (renamed from empty default `[]`, appended to by `--spec-state` occurrences, in encounter order). The `render` verb's dispatch branch that Task 3 extends with error paths.

- [ ] **Step 1: Write the failing test**

Append to `bin/lib/wrap-up/tests/engine-cli.test.js`, in the `render` section (after `render --strict exits 2...` test, before `render without --run-dir exits 2`):

```js
test('render --section console with two --spec-state flags prints one merged table and exits 0', () => {
  const runDirA = planFreshRunDir();
  const runDirB = planFreshRunDir();

  // Record a skills finding into runDirA so the merged output has content.
  const payload = JSON.stringify({
    version: 1, rowId: 'skills', result: 'findings',
    findings: [{ kind: 'additive', summary: 'Add row', targetPath: '.claude/skills/s1.md', action: 'applied', stagePath: null, commit: 'abc1234' }],
    gapDetection: 'run', detail: '1 change',
  });
  const rec = run(['record', '--run-dir', runDirA, '--dry-run'], { input: payload });
  assert.strictEqual(rec.status, 0, rec.stderr);

  const stateAPath = path.join(runDirA, 'engine-state.json');
  const stateBPath = path.join(runDirB, 'engine-state.json');

  const r = run(['render', '--section', 'console', '--spec-state', `157=${stateAPath}`, '--spec-state', `159=${stateBPath}`, '--start-at', '1']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\| # \| Spec \| Target \| Change \| Disposition \|$/m);
  assert.match(r.stdout, /^\| 1 \| 157 \|/m);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/wrap-up/tests/engine-cli.test.js`
Expected: FAIL — with today's code, `--run-dir` is required (`usageExit()` fires because no `--run-dir` was given), so the test sees exit code 2 instead of 0.

- [ ] **Step 3: Implement flag parsing + dispatch branch**

In `bin/wrap-up-engine.js`:

1. In `parseArgs`'s `out` initializer, add `specStates: []`.
2. In the parsing loop, add (alongside the other `if (a === '--foo' && hasValue)` branches):

```js
if (a === '--spec-state' && hasValue) { out.specStates.push(argv[i + 1]); i += 1; continue; }
```

3. Update the `require` line to also import `renderConsoleSectionsMulti`:

```js
const { renderTrace, renderConsoleSections, renderConsoleSectionsMulti, strictCheck } = require('./lib/wrap-up/engine-render');
```

4. Replace the entire `runRender` function body with this literal version — the section-validity check moves to the top (unchanged in substance, just now guards both dispatch paths), the new multi-state branch is inserted after it, and the existing single-state body is unchanged below that, minus its own now-redundant leading `if (!args.runDir) usageExit();`/section-check lines which move up:

```js
function runRender(args) {
  const section = args.section || 'trace';
  if (section !== 'trace' && section !== 'console') {
    process.stderr.write(`wrap-up-engine.js render: --section must be 'trace' or 'console'\n`);
    process.exit(2);
  }

  if (args.specStates.length > 0) {
    const specStates = [];
    for (const raw of args.specStates) {
      const eq = raw.indexOf('=');
      const specId = raw.slice(0, eq);
      const p = raw.slice(eq + 1);
      const state = JSON.parse(fs.readFileSync(p, 'utf8'));
      specStates.push({ specId, state });
    }
    const { markdown } = renderConsoleSectionsMulti(specStates, { startAt: args.startAt !== null ? Number(args.startAt) : 1 });
    process.stdout.write(`${markdown}\n`);
    return;
  }

  if (!args.runDir) usageExit();

  let state;
  try {
    state = JSON.parse(fs.readFileSync(path.join(args.runDir, 'engine-state.json'), 'utf8'));
  } catch (e) {
    process.stderr.write(`wrap-up-engine.js render: could not read engine-state.json from ${args.runDir}: ${e.message}\n`);
    process.exit(2);
  }

  const output = section === 'trace'
    ? renderTrace(state)
    : renderConsoleSections(state, { startAt: args.startAt !== null ? Number(args.startAt) : 1 }).markdown;

  // Print first, so the hole is visible even when --strict is about to make
  // it fatal.
  process.stdout.write(`${output}\n`);

  if (args.strict) {
    const check = strictCheck(state);
    if (!check.ok) process.exit(2);
  }
}
```

This makes this task's happy-path test pass but the multi-state branch has no error handling yet (a bad `--spec-state` path throws an uncaught exception, and `--spec-state`+`--run-dir`/`trace` aren't rejected) — Task 3 replaces just the `if (args.specStates.length > 0) { ... }` block with the hardened version.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/wrap-up/tests/engine-cli.test.js`
Expected: PASS for the new test. Also re-run the full file to confirm no regressions: `node --test bin/lib/wrap-up/tests/engine-cli.test.js` (all tests pass).

- [ ] **Step 5: Commit**

```bash
git add bin/wrap-up-engine.js bin/lib/wrap-up/tests/engine-cli.test.js
git commit -m "Wire --spec-state CLI flag for multi-spec console render"
```

---

### Task 3: Malformed-invocation error paths (AC 8, 9, 12, 13)

**Files:**
- Modify: `bin/wrap-up-engine.js`
- Test: `bin/lib/wrap-up/tests/engine-cli.test.js`

**Interfaces:**
- Consumes: `usageExit()` (existing), `args.specStates` (Task 2), `args.runDir`, `args.section` (existing).
- Produces: no new exports — behavioral error paths only.

- [ ] **Step 1: Write the failing tests**

Append to `bin/lib/wrap-up/tests/engine-cli.test.js`, right after the Task 2 test:

```js
test('render --section console with --spec-state AND --run-dir exits 2 with usage on stderr', () => {
  const runDir = planFreshRunDir();
  const r = run(['render', '--run-dir', runDir, '--section', 'console', '--spec-state', `157=${path.join(runDir, 'engine-state.json')}`]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /usage: wrap-up-engine\.js/);
});

test('render --section trace with --spec-state exits 2 with usage on stderr', () => {
  const runDir = planFreshRunDir();
  const r = run(['render', '--section', 'trace', '--spec-state', `157=${path.join(runDir, 'engine-state.json')}`]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /usage: wrap-up-engine\.js/);
});

test('render --spec-state with a nonexistent path exits 2 naming the failing path, not a stack trace', () => {
  const r = run(['render', '--section', 'console', '--spec-state', '157=/nonexistent/path.json']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /157=\/nonexistent\/path\.json|\/nonexistent\/path\.json/);
  assert.doesNotMatch(r.stderr, /at Object\.<anonymous>/); // not a raw Node stack trace
});

test('render --spec-state with invalid JSON content exits 2 naming the failing path', () => {
  const badPath = path.join(makeRunDir(), 'bad.json');
  fs.writeFileSync(badPath, '{not-json');
  const r = run(['render', '--section', 'console', '--spec-state', `157=${badPath}`]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, new RegExp(badPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('render --spec-state value with no "=" exits 2 with usage on stderr', () => {
  const r = run(['render', '--section', 'console', '--spec-state', '157']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /usage: wrap-up-engine\.js/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/wrap-up/tests/engine-cli.test.js`
Expected: FAIL — the AC8/AC9 tests fail because Task 2's branch runs before any run-dir/section cross-check; the AC12 tests fail with an uncaught `JSON.parse`/`readFileSync` exception (non-2 exit, raw stack trace on stderr) instead of a clean exit 2; the AC13 test fails because `raw.indexOf('=')` returns `-1` and `raw.slice(0, -1)`/`raw.slice(0)` silently produce a bogus specId/path instead of erroring.

- [ ] **Step 3: Implement the four error paths**

Replace the minimal branch from Task 2 with:

```js
  if (args.specStates.length > 0) {
    if (section !== 'console') usageExit(); // AC9: --spec-state only valid with --section console
    if (args.runDir) usageExit(); // AC8: --spec-state and --run-dir are mutually exclusive

    const specStates = [];
    for (const raw of args.specStates) {
      const eq = raw.indexOf('=');
      if (eq === -1) usageExit(); // AC13: value must be id=path

      const specId = raw.slice(0, eq);
      const p = raw.slice(eq + 1);
      let state;
      try {
        state = JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (e) {
        // AC12: name the failing path, exit 2, never an uncaught exception.
        process.stderr.write(`wrap-up-engine.js render: could not read engine-state.json from ${p}: ${e.message}\n`);
        process.exit(2);
      }
      specStates.push({ specId, state });
    }

    const { markdown } = renderConsoleSectionsMulti(specStates, { startAt: args.startAt !== null ? Number(args.startAt) : 1 });
    process.stdout.write(`${markdown}\n`);
    return;
  }
```

Also update the `USAGE` constant to document the new invocation shape:

```js
const USAGE = [
  'usage: wrap-up-engine.js plan --run-dir <dir> --base <sha> [--ceremony <profile>] [--skill-budget n] [--doc-budget n] [--signals <json>] [--dry-run]',
  '       wrap-up-engine.js record --run-dir <dir> [--dry-run]   (payload JSON on stdin)',
  '       wrap-up-engine.js render --run-dir <dir> [--strict] [--section trace|console] [--start-at n]',
  '       wrap-up-engine.js render --section console --spec-state <id>=<path> [--spec-state <id>=<path> ...] [--start-at n] [--strict]   (no --run-dir)',
  '',
].join('\n');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/wrap-up/tests/engine-cli.test.js`
Expected: PASS — all tests including Task 2's happy-path test and the pre-existing single-state tests.

- [ ] **Step 5: Commit**

```bash
git add bin/wrap-up-engine.js bin/lib/wrap-up/tests/engine-cli.test.js
git commit -m "Add malformed-invocation error paths for --spec-state"
```

---

### Task 4: `--strict` merged completeness check (AC 10)

**Files:**
- Modify: `bin/wrap-up-engine.js`
- Test: `bin/lib/wrap-up/tests/engine-cli.test.js`

**Interfaces:**
- Consumes: `strictCheck(state)` (existing, from `./lib/wrap-up/engine-render`, already imported).
- Produces: no new exports — extends the multi-state dispatch branch.

- [ ] **Step 1: Write the failing tests**

Append to `bin/lib/wrap-up/tests/engine-cli.test.js`, after the Task 3 tests:

```js
test('render --section console --spec-state --strict prints the merged table then exits 2 while any given state is incomplete', () => {
  const runDirA = planFreshRunDir(); // partially recorded below -> still incomplete
  const runDirB = planFreshRunDir();

  // Record exactly one 'findings' row in runDirA, leaving its other rows
  // unrecorded (incomplete) -> merged table has real content to print.
  const worklistA = JSON.parse(fs.readFileSync(path.join(runDirA, 'engine-state.json'), 'utf8')).worklist;
  const firstRowA = worklistA.rows[0];
  const findingsPayload = JSON.stringify({
    version: 1, rowId: firstRowA.id, result: 'findings',
    findings: [{ kind: 'additive', summary: 'Strict test row', targetPath: 'x.md', action: 'applied', stagePath: null, commit: 'ddd4444' }],
    gapDetection: 'run', detail: '1 change',
  });
  const rec = run(['record', '--run-dir', runDirA, '--dry-run'], { input: findingsPayload });
  assert.strictEqual(rec.status, 0, rec.stderr);

  // Fully record runDirB so only runDirA is incomplete.
  const worklistB = JSON.parse(fs.readFileSync(path.join(runDirB, 'engine-state.json'), 'utf8')).worklist;
  for (const row of worklistB.rows) {
    const payload = JSON.stringify({
      version: 1, rowId: row.id, result: 'clean', read: [], findings: [], gapDetection: 'not-run', detail: 'nothing to change',
    });
    const rr = run(['record', '--run-dir', runDirB, '--dry-run'], { input: payload });
    assert.strictEqual(rr.status, 0, rr.stderr);
  }

  const r = run(['render', '--section', 'console', '--strict',
    '--spec-state', `157=${path.join(runDirA, 'engine-state.json')}`,
    '--spec-state', `159=${path.join(runDirB, 'engine-state.json')}`]);
  assert.strictEqual(r.status, 2);
  // Printed before the fatal exit, mirroring the single-state --strict behavior.
  assert.match(r.stdout, /Strict test row/);
});

test('render --section console --spec-state --strict exits 0 once every given state is complete', () => {
  const runDirA = planFreshRunDir();
  const runDirB = planFreshRunDir();
  for (const runDir of [runDirA, runDirB]) {
    const worklist = JSON.parse(fs.readFileSync(path.join(runDir, 'engine-state.json'), 'utf8')).worklist;
    for (const row of worklist.rows) {
      const payload = JSON.stringify({
        version: 1, rowId: row.id, result: 'clean', read: [], findings: [], gapDetection: 'not-run', detail: 'nothing to change',
      });
      const rr = run(['record', '--run-dir', runDir, '--dry-run'], { input: payload });
      assert.strictEqual(rr.status, 0, rr.stderr);
    }
  }
  const r = run(['render', '--section', 'console', '--strict',
    '--spec-state', `157=${path.join(runDirA, 'engine-state.json')}`,
    '--spec-state', `159=${path.join(runDirB, 'engine-state.json')}`]);
  assert.strictEqual(r.status, 0, r.stderr);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/wrap-up/tests/engine-cli.test.js`
Expected: FAIL — `--strict` is currently ignored entirely in the multi-state branch (no such check exists yet), so the first test's exit code is 0 instead of 2.

- [ ] **Step 3: Implement the merged `--strict` check**

Extend the multi-state branch in `runRender` (after printing `markdown`, before `return`):

```js
    const { markdown } = renderConsoleSectionsMulti(specStates, { startAt: args.startAt !== null ? Number(args.startAt) : 1 });
    process.stdout.write(`${markdown}\n`);

    if (args.strict) {
      const anyMissing = specStates.some(({ state }) => !strictCheck(state).ok);
      if (anyMissing) process.exit(2);
    }
    return;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/wrap-up/tests/engine-cli.test.js`
Expected: PASS — all tests.

- [ ] **Step 5: Commit**

```bash
git add bin/wrap-up-engine.js bin/lib/wrap-up/tests/engine-cli.test.js
git commit -m "Merge --strict completeness check across --spec-state entries"
```

---

### Task 5: Full-suite regression check (AC 11) and byte-for-byte single-state parity

**Files:**
- Test: `bin/lib/wrap-up/tests/` (no new file — verification only)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task is a verification gate, not a code change.

- [ ] **Step 1: Add one explicit byte-for-byte parity test**

Append to `bin/lib/wrap-up/tests/engine-render.test.js`:

```js
test('renderConsoleSections output is unchanged when a single spec is passed through renderConsoleSectionsMulti-adjacent code paths (parity guard)', () => {
  const state = { version: 1, worklist: makeWorklist(), results: makeConsoleResults() };
  const single = renderConsoleSections(state, { startAt: 1 });
  // renderConsoleSections itself must be byte-for-byte unchanged from before this plan — re-assert its own pinned expectations still hold.
  assert.match(single.markdown, /^#### Skill updates/);
  assert.strictEqual(single.nextNumber, 13);
});
```

(This re-states an existing assertion already covered above — its purpose is a named regression marker specifically for AC 11's "single-spec render output is byte-for-byte identical" claim, not new coverage.)

- [ ] **Step 2: Run the full wrap-up test directory**

Run: `node --test bin/lib/wrap-up/tests/`
Expected: PASS — every file in the directory, including `engine-render.test.js`, `engine-cli.test.js`, and all unrelated files (`engine-plan.test.js`, `engine-record.test.js`, `facts.test.js`, `cli.test.js`, `reflog.test.js`, `registry.test.js`, `render.test.js`, `state.test.js`).

- [ ] **Step 3: Run the full project suite**

Run: `npm test`
Expected: PASS — 0 failures (this repo's full suite, run from the worktree root).

- [ ] **Step 4: Commit** (only if Step 1 added the parity test — otherwise this task has nothing to commit)

```bash
git add bin/lib/wrap-up/tests/engine-render.test.js
git commit -m "Add explicit single-spec render parity regression marker"
```
