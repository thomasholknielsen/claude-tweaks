# plan-audit: Check A/C plan-awareness + Check D control-byte scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two `bin/plan-audit.js` false-positive/gap shapes bundled together because both touch `plugin/bin/lib/plan-audit/checks.js` and its tests: (1) Check A flags a `Create:`/`Test:` path whose parent directory is itself created by another bullet in the same plan, and Check C flags a Step 2 verification command that already passes because Step 1 merely *appends* tests to an existing file; (2) the audit never inspects the plan's own bytes, so a raw control byte (a NUL literal instead of the `\0` escape) commits as a git-classified binary blob unnoticed.

**Spec:** GitHub issues #1999 and #2000, materialized at `.claude-tweaks/pipelines/2026-09-11T131441-record-1999/spec-1999/work/1999-spec.md` and `.../spec-2000/work/2000-spec.md` in this worktree.

## Global Constraints

- `plugin/bin/lib/plan-audit/parser.js` stays pure (no `fs`/`process` access) — filesystem checks (existence, byte scanning of already-`readFileSync`'d text) stay in `checks.js`/`plan-audit.js`.
- Every existing test in `tests/bin-lib/plan-audit/{checks,parser,cli}.test.js` must keep passing unmodified (AC5 of #1999, AC3 of #2000) — new fields are additive, no existing return shape narrows or its literal values change.
- `checkC`'s existing positional arguments (`verificationChecks, repoRoot, deps, unparseableStep2s`) keep their position; new per-check fields (`step1Text`, `taskFileEntries`, `appendMarker`) are additive properties on each `verificationChecks[]` entry, not new positional args.

## Deviation from issue #1999's AC1 prose (recorded here, not silently reconciled)

AC1's parenthetical "(or the same bullet is the first creation)" would make Check A pass for a **single, unsupported** `Create:`/`Test:` bullet purely via self-reference. That contradicts the Deliverables' own required test ("Create under a missing directory not created by the plan still fails") and the pre-existing pinned test `"checkA fails for Create when even the parent directory is missing"` (single entry, `nowhere/new.js`), which AC5/#1999 requires to keep passing unchanged. This plan implements the version consistent with the bug's own description ("whose parent is only created by **another** Create: bullet in the same plan") and the two concrete required tests: a `Create:`/`Test:` bullet's missing parent is satisfied only by **another** entry in the plan (excluding the bullet's own contribution), never by itself alone. Noted for the PR description and Architecture Alignment step.

### Key Files

- `plugin/bin/lib/plan-audit/checks.js` — `checkA` plan-created-directory cross-reference; `checkC` append-shape detection and `appendShaped` output; new `checkD`.
- `plugin/bin/lib/plan-audit/parser.js` — capture Step 1 text and per-task file entries in `extractVerificationChecks`; append-marker detection.
- `plugin/bin/lib/plan-audit/args.js` — `--bytes` flag.
- `plugin/bin/plan-audit.js` — wire `checkD` into the envelope/exit rule/summary line; `--bytes` verb.
- `plugin/skills/build/plan-audit.md` — Check A/C bullets, the append marker, Check D result-interpretation, the `--bytes` skip-gate exception.
- `plugin/skills/build/SKILL.md` — Common Step 1.5 skip sentence gains the `--bytes` clause.
- `tests/bin-lib/plan-audit/checks.test.js`, `parser.test.js`, `cli.test.js` — new cases.
- `tests/plan-audit-skip-sentence-bytes-prose.test.js` — new prose-pin conformance test (mirrors `tests/design-wrapper-polish-anomaly-prose.test.js`'s pattern).

---

### Task 1: Check A — cross-reference plan-created directories

**Files:**
- Modify: `plugin/bin/lib/plan-audit/checks.js`
- Test: `tests/bin-lib/plan-audit/checks.test.js`

**Interfaces:**
- `checkA(entries, repoRoot)` — same signature, return shape gains an additive `missingDetail: [{path, nearestExistingAncestor}]` array alongside the existing `missing` (unchanged) and `ok`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/bin-lib/plan-audit/checks.test.js` after the existing Check A tests:

```javascript
test('checkA passes a Create bullet whose missing parent is created by ANOTHER Create bullet in the same plan (#1999)', () => {
  const repo = makeTmpRepo();
  try {
    const result = checkA([
      { type: 'Create', path: 'newdir/nested/subdir/FILE.md' },
      { type: 'Create', path: 'newdir/nested/subdir/OTHER.md' },
    ], repo);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.missing, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkA still fails a lone, unsupported Create bullet with a missing parent (#1999)', () => {
  const repo = makeTmpRepo();
  try {
    const result = checkA([{ type: 'Create', path: 'nowhere/new.js' }], repo);
    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.missing, ['nowhere/new.js']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkA passes a two-new-level Create bullet supported by another bullet at the same deepest directory (#1999)', () => {
  const repo = makeTmpRepo();
  try {
    const result = checkA([
      { type: 'Create', path: 'newdir/nested/subdir/FILE.md' },
      { type: 'Test', path: 'newdir/nested/subdir/FILE.test.md' },
    ], repo);
    assert.strictEqual(result.ok, true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkA: a Modify under a plan-created directory still fails — Modify needs the file today (#1999)', () => {
  const repo = makeTmpRepo();
  try {
    const result = checkA([
      { type: 'Create', path: 'newdir/nested/subdir/OTHER.md' },
      { type: 'Modify', path: 'newdir/nested/subdir/FILE.md' },
    ], repo);
    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.missing, ['newdir/nested/subdir/FILE.md']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkA missingDetail names the nearest existing ancestor for a still-missing parent (#1999)', () => {
  const repo = makeTmpRepo();
  try {
    const result = checkA([{ type: 'Create', path: 'nowhere/new.js' }], repo);
    assert.strictEqual(result.missingDetail.length, 1);
    assert.strictEqual(result.missingDetail[0].path, 'nowhere/new.js');
    assert.strictEqual(result.missingDetail[0].nearestExistingAncestor, '.');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
```

Run: `node --test tests/bin-lib/plan-audit/checks.test.js`
Expected: FAIL — `checkA` doesn't yet cross-reference other entries or emit `missingDetail`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/plan-audit/checks.test.js`
Expected: FAIL (new tests red; existing Check A tests still pass unchanged).

- [ ] **Step 3: Implement checkA cross-reference**

In `plugin/bin/lib/plan-audit/checks.js`, replace `checkA` with a version that, for each `Create:`/`Test:` entry whose parent doesn't exist on disk, builds the set of ancestor directories every **other** `Create:`/`Test:` entry's path implies (excluding the entry being checked) and passes if the missing parent is a member of that set; otherwise pushes to `missing` (unchanged shape) and `missingDetail` (new, `{path, nearestExistingAncestor}` — walk up from the missing parent to the nearest directory that exists on disk, relative to `repoRoot`, `'.'` when that's the repo root itself). `Modify:`/`Delete:` semantics untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/plan-audit/checks.test.js`
Expected: PASS — all Check A tests (existing + new) green.

---

### Task 2: Check C — append-to-existing exception

**Files:**
- Modify: `plugin/bin/lib/plan-audit/parser.js`
- Modify: `plugin/bin/lib/plan-audit/checks.js`
- Test: `tests/bin-lib/plan-audit/parser.test.js`
- Test: `tests/bin-lib/plan-audit/checks.test.js`

**Interfaces:**
- `parser.js`'s `extractVerificationChecks(text)` — each returned entry gains `step1Text` (string|null), `taskFileEntries` (`{type, path}[]`, that task's own `Files:` bullets), `appendMarker` (boolean — `Expected:` text matches `/^FAIL\s+after\s+Step\s*1\b/i`).
- `checks.js`'s `checkC` — same first three positional args; a passing pre-run for an append-shaped check is reported under a new `appendShaped: [{task, title, command, path}]` array instead of `findings`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/bin-lib/plan-audit/parser.test.js`:

```javascript
test('extractVerificationChecks captures step1Text, taskFileEntries, and appendMarker (#1999)', () => {
  const text = [
    '### Task 1: Append tests',
    '**Files:**',
    '- Modify: `tests/existing.test.js`',
    '',
    '- [ ] **Step 1: Append the new cases**',
    '',
    'Append three new `test(...)` blocks to `tests/existing.test.js`.',
    '',
    '- [ ] **Step 2: Run test to verify it fails**',
    '',
    'Run: `node --test tests/existing.test.js`',
    'Expected: FAIL — new cases not yet true',
  ].join('\n');
  const checks = extractVerificationChecks(text);
  assert.strictEqual(checks.length, 1);
  assert.match(checks[0].step1Text, /Append three new/);
  assert.deepStrictEqual(checks[0].taskFileEntries, [{ type: 'Modify', path: 'tests/existing.test.js' }]);
  assert.strictEqual(checks[0].appendMarker, false);
});

test('extractVerificationChecks detects the "FAIL after Step 1" marker (#1999)', () => {
  const text = [
    '### Task 1: Marked append',
    '- [ ] **Step 2: Run test to verify it fails**',
    '',
    'Run: `node --test tests/existing.test.js`',
    'Expected: FAIL after Step 1 appends the new cases',
  ].join('\n');
  const checks = extractVerificationChecks(text);
  assert.strictEqual(checks[0].appendMarker, true);
});
```

Add to `tests/bin-lib/plan-audit/checks.test.js`:

```javascript
test('checkC: append-shaped task with a passing pre-run is not a finding — reported under appendShaped (#1999)', () => {
  const repo = makeTmpRepo();
  fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'tests', 'existing.test.js'), '// existing, passes today\n');
  const deps = { run: () => ({ exitCode: 0, output: '# pass 3\n' }) };
  const check = {
    taskNumber: '1', title: 'Append tests', command: 'node --test tests/existing.test.js', expected: 'FAIL',
    step1Text: 'Append cases to `tests/existing.test.js`.',
    taskFileEntries: [{ type: 'Modify', path: 'tests/existing.test.js' }],
    appendMarker: false,
  };
  try {
    const result = checkC([check], repo, deps);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.findings, []);
    assert.strictEqual(result.appendShaped.length, 1);
    assert.strictEqual(result.appendShaped[0].task, '1');
    assert.strictEqual(result.appendShaped[0].path, 'tests/existing.test.js');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkC: same shape without a matching Modify/Test bullet is still a finding (#1999)', () => {
  const repo = makeTmpRepo();
  fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'tests', 'existing.test.js'), '// existing\n');
  const deps = { run: () => ({ exitCode: 0, output: '# pass 3\n' }) };
  const check = {
    taskNumber: '1', title: 'No Files bullet', command: 'node --test tests/existing.test.js', expected: 'FAIL',
    step1Text: 'Append cases to `tests/existing.test.js`.',
    taskFileEntries: [],
    appendMarker: false,
  };
  try {
    const result = checkC([check], repo, deps);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.findings.length, 1);
    assert.deepStrictEqual(result.appendShaped, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkC: the explicit "FAIL after Step 1" marker passes without the path heuristic (#1999)', () => {
  const repo = makeTmpRepo();
  const deps = { run: () => ({ exitCode: 0, output: '# pass\n' }) };
  const check = {
    taskNumber: '1', title: 'Marked', command: 'node --test whatever.test.js', expected: 'FAIL after Step 1',
    step1Text: null,
    taskFileEntries: [],
    appendMarker: true,
  };
  try {
    const result = checkC([check], repo, deps);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.appendShaped.length, 1);
    assert.strictEqual(result.appendShaped[0].path, null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('checkC: the existing AC6 non-discriminating fixture still fails (no append shape, no marker) (#1999)', () => {
  const deps = { run: () => ({ exitCode: 0, output: 'PASS\n' }) };
  const result = checkC(
    [{ taskNumber: '1', title: 'A', command: 'node -e "process.exit(0)"', expected: 'FAIL with "guard not present"' }],
    '/repo', deps,
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.findings.length, 1);
  assert.deepStrictEqual(result.appendShaped, []);
});
```

Run: `node --test tests/bin-lib/plan-audit/parser.test.js tests/bin-lib/plan-audit/checks.test.js`
Expected: FAIL — new fields/behavior don't exist yet.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/plan-audit/parser.test.js tests/bin-lib/plan-audit/checks.test.js`
Expected: FAIL (new cases red; existing cases green).

- [ ] **Step 3: Implement**

`parser.js`: add `extractStep1Text(taskBody)` (mirrors `extractStep2Verification`'s window-scoping, matched on `**Step 1:...**`), and extend `extractVerificationChecks` to attach `step1Text: extractStep1Text(task.body)`, `taskFileEntries: extractFileEntries(task.body)`, and `appendMarker: /^FAIL\s+after\s+Step\s*1\b/i.test(verification.expected.trim())` to each returned entry.

`checks.js`: add an `isAppendShaped(check, repoRoot)` helper — `appendMarker` short-circuits true; otherwise scan `step1Text` for backticked paths, keep only those present in `taskFileEntries` (`Modify`/`Test` only) AND existing on disk AND appearing as a substring of `command`; shaped iff at least one such path is found. In `checkC`, when `looksPassing` and the check is append-shaped, push to a new `appendShaped` array instead of `findings`. Return `appendShaped` alongside the existing `ok`/`findings`/`warnings`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/plan-audit/parser.test.js tests/bin-lib/plan-audit/checks.test.js`
Expected: PASS.

---

### Task 3: Wire appendShaped into the CLI summary + doc updates for #1999

**Files:**
- Modify: `plugin/bin/plan-audit.js`
- Modify: `plugin/skills/build/plan-audit.md`
- Test: `tests/bin-lib/plan-audit/cli.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/bin-lib/plan-audit/cli.test.js`:

```javascript
test('AC8 (#1999): an append-shaped task reports appendShaped and the summary line names the count, still exits 0', () => {
  const repo = makeTmpRepo();
  fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'tests', 'existing.test.js'), '// existing, passes today\n');
  try {
    const plan = writePlan(repo, [
      '### Task 1: Append tests',
      '**Files:**',
      '- Modify: `tests/existing.test.js`',
      '',
      '- [ ] **Step 1: Append the new cases**',
      '',
      'Append cases to `tests/existing.test.js`.',
      '',
      '- [ ] **Step 2: Run test to verify it fails**',
      '',
      'Run: `node -e "process.exit(0)"`',
      'Expected: FAIL — new cases not yet true',
    ].join('\n'));
    const { exitCode, stdout } = runCli(plan, repo);
    assert.strictEqual(exitCode, 0);
    const [jsonLine, summaryLine] = stdout.split('\n');
    const report = JSON.parse(jsonLine);
    assert.strictEqual(report.checkC.ok, true);
    assert.strictEqual(report.checkC.appendShaped.length, 1);
    assert.match(summaryLine, /append-shaped/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
```

Run: `node --test tests/bin-lib/plan-audit/cli.test.js`
Expected: FAIL.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/plan-audit/cli.test.js`
Expected: FAIL (this new case red).

- [ ] **Step 3: Implement**

`plan-audit.js`'s `summaryLine`: add a line for `report.checkC.appendShaped.length` (non-zero → `Check C: {n} append-shaped pre-run(s) accepted`). `plan-audit.md`: document the append-to-existing rule and the `Expected: FAIL after Step 1` marker under Check C's "What each check covers" bullet and result-interpretation section.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/plan-audit/cli.test.js`
Expected: PASS.

---

### Task 4: Check D — control-byte scan

**Files:**
- Modify: `plugin/bin/lib/plan-audit/checks.js`
- Test: `tests/bin-lib/plan-audit/checks.test.js`

**Interfaces:**
- `checkD(text)` → `{ ok, findings: [{line, column, codePoint, offset}], truncated? }`. Exported alongside the other checks.

- [ ] **Step 1: Write the failing test**

Add to `tests/bin-lib/plan-audit/checks.test.js`:

```javascript
// ── Check D — control-byte scan (#2000) ─────────────────────────────────

test('checkD flags a raw NUL mid-line with its line, column, and codePoint', () => {
  const { checkD } = require('../../../plugin/bin/lib/plan-audit/checks');
  const text = 'line one\nsecond\0line\n';
  const result = checkD(text);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.findings.length, 1);
  assert.strictEqual(result.findings[0].line, 2);
  assert.strictEqual(result.findings[0].column, 7);
  assert.strictEqual(result.findings[0].codePoint, 'U+0000');
});

test('checkD flags a form feed and an escape byte as findings', () => {
  const { checkD } = require('../../../plugin/bin/lib/plan-audit/checks');
  const text = 'a\x0Cb\x1Bc';
  const result = checkD(text);
  assert.strictEqual(result.ok, false);
  assert.deepStrictEqual(result.findings.map((f) => f.codePoint), ['U+000C', 'U+001B']);
});

test('checkD does not flag tab, LF, or CR', () => {
  const { checkD } = require('../../../plugin/bin/lib/plan-audit/checks');
  const result = checkD('a\tb\nc\rd');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.findings, []);
});

test('checkD does not flag multi-byte UTF-8 text or a literal backslash-zero escape', () => {
  const { checkD } = require('../../../plugin/bin/lib/plan-audit/checks');
  const result = checkD('café 中文 test("\\0")');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.findings, []);
});

test('checkD caps findings at 20 and sets truncated: true beyond that', () => {
  const { checkD } = require('../../../plugin/bin/lib/plan-audit/checks');
  const text = '\0'.repeat(25);
  const result = checkD(text);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.findings.length, 20);
  assert.strictEqual(result.truncated, true);
});
```

Run: `node --test tests/bin-lib/plan-audit/checks.test.js`
Expected: FAIL — `checkD` doesn't exist.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/plan-audit/checks.test.js`
Expected: FAIL (`checkD` undefined).

- [ ] **Step 3: Implement checkD**

Add `checkD(text)` to `checks.js`: iterate `for (const ch of text)` (code-point-safe), track 1-based `line`/`column` and a running `offset`, flag any code point in `U+0000`-`U+001F` or `U+007F` other than tab/LF/CR, cap pushed findings at 20 (track a separate total count to set `truncated: true` when it exceeds 20). Export alongside the others.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/plan-audit/checks.test.js`
Expected: PASS.

---

### Task 5: Wire Check D into the CLI, the `--bytes` verb, and skip-gate docs

**Files:**
- Modify: `plugin/bin/lib/plan-audit/args.js`
- Modify: `plugin/bin/plan-audit.js`
- Modify: `plugin/skills/build/plan-audit.md`
- Modify: `plugin/skills/build/SKILL.md`
- Test: `tests/bin-lib/plan-audit/cli.test.js`
- Test: `tests/plan-audit-skip-sentence-bytes-prose.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/bin-lib/plan-audit/cli.test.js`:

```javascript
// #2000 — Check D wired into the full envelope and the --bytes verb
test('#2000: a fixture plan with a raw NUL fails checkD and exits 1 under both the full audit and --bytes', () => {
  const repo = makeTmpRepo();
  try {
    const plan = path.join(repo, 'plan.md');
    fs.writeFileSync(plan, Buffer.from(`### Task 1: X\n**Files:**\n- Modify: \`plan.md\`\n\nsecond${'\0'}line\n`));
    const full = runCli(plan, repo);
    assert.notStrictEqual(full.exitCode, 0);
    const fullReport = JSON.parse(full.stdout.split('\n')[0]);
    assert.strictEqual(fullReport.checkD.ok, false);
    assert.strictEqual(fullReport.checkD.findings[0].line, 4);

    const bytesOut = execFileSync('node', [CLI, plan, '--bytes'], { encoding: 'utf8' }).toString();
    assert.fail('expected --bytes to exit non-zero');
  } catch (err) {
    // --bytes exits 1 on findings — execFileSync throws for non-zero exit.
    if (err.status !== undefined) {
      assert.strictEqual(err.status, 1);
      const bytesReport = JSON.parse((err.stdout || '').split('\n')[0]);
      assert.strictEqual(bytesReport.checkD.ok, false);
    } else {
      throw err;
    }
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('#2000: a clean plan reports checkD.ok === true under the full audit and --bytes', () => {
  const repo = makeTmpRepo();
  fs.mkdirSync(path.join(repo, 'plugin', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'plugin', 'bin', 'existing.js'), '// existing\n');
  try {
    const plan = writePlan(repo, ['### Task 1: Do a thing', '**Files:**', '- Modify: `plugin/bin/existing.js`'].join('\n'));
    const { stdout } = runCli(plan, repo);
    const report = JSON.parse(stdout.split('\n')[0]);
    assert.strictEqual(report.checkD.ok, true);
    const bytesOut = execFileSync('node', [CLI, plan, '--bytes'], { encoding: 'utf8' });
    assert.deepStrictEqual(JSON.parse(bytesOut.trim()), { checkD: { ok: true, findings: [] } });
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
```

Create `tests/plan-audit-skip-sentence-bytes-prose.test.js` (mirrors `tests/design-wrapper-polish-anomaly-prose.test.js`'s live-prose-pin pattern):

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_MD = path.join(__dirname, '..', 'plugin', 'skills', 'build', 'SKILL.md');

test('build/SKILL.md Common Step 1.5 skip sentence names --bytes as the one check the skip gate does not cover (#2000)', () => {
  const text = fs.readFileSync(SKILL_MD, 'utf8');
  const idx = text.indexOf('**Skip this step entirely when**');
  assert.ok(idx !== -1, 'skip sentence not found');
  const sentence = text.slice(idx, idx + 600);
  assert.match(sentence, /--bytes/);
});
```

Run: `node --test tests/bin-lib/plan-audit/cli.test.js tests/plan-audit-skip-sentence-bytes-prose.test.js`
Expected: FAIL.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/plan-audit/cli.test.js tests/plan-audit-skip-sentence-bytes-prose.test.js`
Expected: FAIL (new cases red).

- [ ] **Step 3: Implement**

`args.js`: add `--bytes` boolean flag, update `USAGE`. `plan-audit.js`: when `parsed.bytes`, run `checkD(text)` alone and print `{"checkD": {...}}\n`, exit 1 on findings (the existing file-read `catch` already covers exit 2); otherwise fold `checkD(text)` into the full envelope (computed right after the read, before `extractFileEntries`), into the `pass` exit-code rule, and add a `Control bytes: {n}` summary-line part when `!report.checkD.ok`. `plan-audit.md`: add a `checkD.ok === false` result-interpretation bullet (Check A-shaped unconditional stop, `line:column U+XXXX` per finding, never routed through `scope-creep`) and a sentence that Check D is the one check the skip gate doesn't cover, with the reason (a byte scan on text already in memory costs nothing). `build/SKILL.md`'s Common Step 1.5 skip sentence: add the `--bytes` clause — even when the rest of the step is skipped, run `node "${CLAUDE_PLUGIN_ROOT}/bin/plan-audit.js" {plan-file} --bytes` and treat `checkD.ok === false` as the same unconditional stop.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/plan-audit/cli.test.js tests/plan-audit-skip-sentence-bytes-prose.test.js`
Expected: PASS.

---

### Task 6: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full plan-audit suite plus the whole repo suite**

Run: `node --test tests/bin-lib/plan-audit/checks.test.js tests/bin-lib/plan-audit/parser.test.js tests/bin-lib/plan-audit/cli.test.js tests/plan-audit-skip-sentence-bytes-prose.test.js`
Expected: PASS (0 failures).

Then run: `npm test`
Expected: PASS (0 failures) — confirms no other suite (prose conformance, byte-pinned skill tests) regressed from the `plan-audit.md`/`SKILL.md` edits.

## Gotchas

- The append heuristic must anchor on the path appearing in BOTH `step1Text` and the `Run:` command — a Step 1 that merely says "append tests" with no backticked path never matches.
- `Expected: FAIL after Step 1` must still start with `FAIL` (unchanged `extractVerificationChecks` scope regex `/^FAIL\b/i`) — verified by construction since `/^FAIL\s+after\s+Step\s*1\b/i` is a stricter subset.
- Check A's cross-reference set must be built per-entry (excluding that entry's own contribution) — a global self-inclusive set would make every Create/Test bullet trivially pass, contradicting the required "lone bullet still fails" test (see Deviation note above).
- A test fixture that intends a NUL for Check D must use `Buffer.from` or the `\0` escape inside the JS test file itself, not a raw NUL char pasted into a `.test.js` source file (which would corrupt the source file itself, per CLAUDE.md's NUL-byte Don't).
- `--count-tasks` and `--bytes` are siblings, not variants of each other — `--bytes` never counts tasks and `--count-tasks` never scans bytes.
