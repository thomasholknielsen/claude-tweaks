# Record #721 — UTC Run-Dir Timestamps + Mint Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the run-dir ISO-timestamp to UTC in one canonical place (cited by the three mint sites), remove a self-minted run dir immediately on a Step 2.8 contest, and make hook fallback attribution skip unadopted mints.

**Architecture:** One new stated rule in `_shared/pipeline-run-dir.md` + three cite edits (prose); one contest-path prose edit in `flow/claim-targets.md`; one guarded-fallback change in `bin/lib/hooks/context.js` with unit tests; one new conformance test file.

**Tech Stack:** Markdown skill files; Node (`bin/lib/hooks/context.js`); `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T044553-spec-720-721-722-723-724/spec-721/work/721-spec.md`

## Global Constraints

- AC 1: `grep -rn 'date +%Y-%m-%dT%H%M%S' skills/ | grep -v -- '-u' | wc -l` → `0` (currently vacuously true — the conformance test makes it a durable pin).
- The resolver skip is keyed on the absence of **both** `decisions.md` and `run-state.json` — never on `config.yml` alone (standalone run dirs never carry `config.yml` by design; keying on it would strip their attribution). This is the spec's own Gotcha overriding AC 3's looser "without config.yml" phrasing.
- The immediate-removal rule fires only when this invocation minted the dir itself (`PIPELINE_RUN_DIR` unset on entry) — a dispatch-minted dir belongs to the caller and is left in place.
- The `isOrphanedMint` reconciler sweep (`bin/lib/reconcile/archive-merged.js`) stays untouched — it remains the backstop for mints abandoned by crashes; tests in `tests/reconcile.test.js` pin it and must stay green.
- Existing path-template pins in `tests/flow-run-dir-anchoring.test.js` (`{ISO-timestamp}-{spec-slug}` literals) must keep matching — add citations around those literals, never rewrite them.
- Work from the run worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-720-721-722-723-724`.
- Commit messages reference the record as `refs #721` — never `closes`/`fixes`.

---

### Task 1: State the UTC ISO-timestamp rule once; cite it from the three mint sites; conformance test

**Files:**
- Modify: `skills/_shared/pipeline-run-dir.md` (SPEC_SLUG conventions block, ~line 83)
- Modify: `skills/flow/claim-targets.md:73-79` (mint step)
- Modify: `skills/flow/manifesto.md:224` (Path conventions bullet)
- Modify: `skills/dispatch/SKILL.md:~158` (Step 4 mint sentence)
- Create: `tests/run-dir-timestamp-utc.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the canonical rule sentence "**ISO-timestamp rule** … UTC … `date -u +%Y-%m-%dT%H%M%S`" in `_shared/pipeline-run-dir.md`, which Task 2's edit may cite but does not depend on.

- [ ] **Step 1: Write the failing conformance test**

Create `tests/run-dir-timestamp-utc.test.js`:

```js
'use strict';

// Record #721: run-dir ISO-timestamps are UTC, stated once in
// _shared/pipeline-run-dir.md and cited by every mint site. Two concurrent
// sessions minting in different timezones flipped newest-first ordering and
// let an empty local-time mint steal hook fallback attribution.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');

function mdFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...mdFilesUnder(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

test('every run-dir timestamp snippet under skills/ uses date -u (#721)', () => {
  const offenders = [];
  for (const full of mdFilesUnder(path.join(REPO_ROOT, 'skills'))) {
    const text = fs.readFileSync(full, 'utf8');
    for (const line of text.split('\n')) {
      if (line.includes('%Y-%m-%dT%H%M%S') && line.includes('date ') && !line.includes('date -u ')) {
        offenders.push(`${path.relative(REPO_ROOT, full)}: ${line.trim()}`);
      }
    }
  }
  assert.deepStrictEqual(offenders, []);
});

test('pipeline-run-dir.md states the UTC ISO-timestamp rule once (#721)', () => {
  const content = read('skills/_shared/pipeline-run-dir.md');
  assert.match(content, /ISO-timestamp rule/);
  assert.match(content, /UTC/);
  assert.match(content, /date -u \+%Y-%m-%dT%H%M%S/);
});

test('the three mint sites cite the UTC rule instead of restating a bare format (#721)', () => {
  for (const p of ['skills/flow/claim-targets.md', 'skills/flow/manifesto.md', 'skills/dispatch/SKILL.md']) {
    const content = read(p);
    assert.match(content, /ISO-timestamp rule/, `${p} must cite the ISO-timestamp rule`);
    assert.match(content, /UTC|date -u/, `${p} must carry the UTC signal at its mint/path site`);
  }
});
```

- [ ] **Step 2: Run it to verify the citation tests fail**

Run: `node --test tests/run-dir-timestamp-utc.test.js`
Expected: test 1 PASSES (both existing snippets already carry `-u`); tests 2 and 3 FAIL (no "ISO-timestamp rule" phrase exists anywhere yet).

- [ ] **Step 3: State the rule in `skills/_shared/pipeline-run-dir.md`**

In the `**SPEC_SLUG conventions**` block (~line 83), insert a sibling bolded entry immediately before it:

```markdown
**ISO-timestamp rule** (load-bearing — mixed timezones flip newest-first ordering): every run-directory `{ISO-timestamp}` is `YYYY-MM-DDTHHMMSS` in **UTC** — always `date -u +%Y-%m-%dT%H%M%S`, never a local-time `date`. Two concurrent sessions minting in different zones otherwise produce stamps that sort in the wrong order, and the hook fallback resolver attributes events to whichever sorts newest. Mint sites (`flow/claim-targets.md` Step 2.8, `flow/manifesto.md` Path conventions, `dispatch/SKILL.md` Step 4) cite this rule rather than restating the format.

```

- [ ] **Step 4: Cite from `skills/flow/claim-targets.md` (mint step)**

In the "Resolve this run's identity" section, the `$PIPELINE_RUN_DIR` unset bullet currently reads `create $RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/` … `{spec-slug}` follows `manifesto.md`'s Path conventions…`. Append one sentence to that bullet, after the `{spec-slug}` sentence:

```markdown
  `{ISO-timestamp}` is UTC, per `_shared/pipeline-run-dir.md`'s ISO-timestamp rule (`date -u`).
```

- [ ] **Step 5: Cite from `skills/flow/manifesto.md` Path conventions**

Replace the bullet at line 224:

```markdown
- `ISO-timestamp` is `YYYY-MM-DDTHHMMSS` (no colons; portable across filesystems)
```

with:

```markdown
- `ISO-timestamp` is `YYYY-MM-DDTHHMMSS` in UTC (no colons; portable across filesystems) — per `_shared/pipeline-run-dir.md`'s ISO-timestamp rule (`date -u`), which mint sites cite rather than restate
```

- [ ] **Step 6: Cite from `skills/dispatch/SKILL.md` Step 4**

Locate the Step 4 mint sentence containing `` `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-record-{representative}/` — mkdir only`` and append, immediately after that sentence's closing period, the sentence:

```markdown
`{ISO-timestamp}` is UTC, per `_shared/pipeline-run-dir.md`'s ISO-timestamp rule (`date -u`).
```

- [ ] **Step 7: Run the tests to verify all pass**

Run: `node --test tests/run-dir-timestamp-utc.test.js tests/flow-run-dir-anchoring.test.js`
Expected: PASS on both files (the anchoring pins' `{ISO-timestamp}-{spec-slug}` literals are untouched).

- [ ] **Step 8: Commit**

```bash
git add skills/_shared/pipeline-run-dir.md skills/flow/claim-targets.md skills/flow/manifesto.md skills/dispatch/SKILL.md tests/run-dir-timestamp-utc.test.js
git commit -m "State the UTC ISO-timestamp rule once in pipeline-run-dir.md, cited by all three mint sites — refs #721"
```

---

### Task 2: Contest path removes a self-minted, never-adopted run dir immediately

**Files:**
- Modify: `skills/flow/claim-targets.md` (single-target contest bullet, ~lines 148-151)
- Modify: `tests/run-dir-timestamp-utc.test.js` (append one test)

**Interfaces:**
- Consumes: Task 1's edited `claim-targets.md` (line numbers may have shifted by Task 1's one-sentence insert — locate by content, not line number).
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing conformance test**

Append to `tests/run-dir-timestamp-utc.test.js`:

```js
test('claim-targets contest path removes a self-minted empty dir immediately (#721)', () => {
  const content = read('skills/flow/claim-targets.md');
  assert.match(content, /remove (the|it|that) (self-)?mint(ed)?[^.]*immediately|removed? immediately/i);
  assert.match(content, /PIPELINE_RUN_DIR[^.]*unset on entry/);
  assert.doesNotMatch(content, /isOrphanedMint` sweep reclaims after 24h if it was freshly minted here/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/run-dir-timestamp-utc.test.js`
Expected: the new test FAILS (the 24h-sweep parenthetical is still present; no immediate-removal sentence exists).

- [ ] **Step 3: Edit the contest bullet in `skills/flow/claim-targets.md`**

Replace the single-target contest bullet's opening (currently):

```markdown
- **Single-target run** — release nothing (nothing else was claimed), then stop the pipeline
  before Step 3 (no worktree, no run directory left behind beyond the mint from Step above, which
  the reconciler's `isOrphanedMint` sweep reclaims after 24h if it was freshly minted here):
```

with:

```markdown
- **Single-target run** — release nothing (nothing else was claimed). When this invocation minted
  the run dir itself (`PIPELINE_RUN_DIR` was unset on entry) and it still holds no `config.yml`
  (never adopted), remove the minted directory immediately — an empty mint left in place sorts
  newest and steals the hook fallback resolver's attribution until the reconciler's
  `isOrphanedMint` sweep catches it (~24h); a dispatch-minted dir (`PIPELINE_RUN_DIR` set on
  entry) belongs to the caller and is left in place. The same removal rule applies to the
  multi-target abort and the transient-failure stop below. Then stop the pipeline before Step 3
  (no worktree, nothing else left behind):
```

The contest card fenced block after it stays unchanged.

- [ ] **Step 4: Run the tests to verify all pass**

Run: `node --test tests/run-dir-timestamp-utc.test.js tests/flow-claim-preflight.test.js`
Expected: PASS on both files.

- [ ] **Step 5: Commit**

```bash
git add skills/flow/claim-targets.md tests/run-dir-timestamp-utc.test.js
git commit -m "Remove a self-minted never-adopted run dir immediately on claim contest — refs #721"
```

---

### Task 3: Fallback attribution never selects an unadopted mint

**Files:**
- Modify: `bin/lib/hooks/context.js` (add `isUnadoptedMint` helper; guard both fallback selections in `resolveRun`)
- Test: `tests/hooks-run-attribution.test.js` (append three tests)

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (independent code change).
- Produces: `isUnadoptedMint(dir, state)` — internal helper, not exported; `resolveRun`'s signature and return shape unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hooks-run-attribution.test.js` (the file's `mkRun(cwd, id, state)` helper skips writing `run-state.json` when `state` is falsy — pass `null` for a bare mint):

```js
// ─── unadopted mints (#721) ────────────────────────────────────────────────

test('fallback never selects an unadopted mint (no run-state.json, no decisions.md)', () => {
  const cwd = project();
  const real = mkRun(cwd, '2026-07-01T090000-real', { status: 'active' });
  mkRun(cwd, '2026-07-02T090000-mint', null); // bare mkdir — sorts newest

  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir: real, attribution: 'fallback' });
  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, null), { dir: real, attribution: 'fallback' });
});

test('a standalone run dir (decisions.md, no run-state.json) still wins fallback', () => {
  const cwd = project();
  const dir = mkRun(cwd, '2026-07-01T090000-tidy-standalone', null);
  fs.writeFileSync(path.join(dir, 'decisions.md'), '');

  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir, attribution: 'fallback' });
});

test('only unadopted mints exist — resolves null rather than guessing into one', () => {
  const cwd = project();
  mkRun(cwd, '2026-07-02T090000-mint', null);

  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir: null, attribution: null });
  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, null), { dir: null, attribution: null });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/hooks-run-attribution.test.js`
Expected: FAIL — test 1 resolves the bare `-mint` dir (it sorts newest), test 3 resolves the mint instead of null. Test 2 already passes (documents the standalone protection).

- [ ] **Step 3: Implement the guard in `bin/lib/hooks/context.js`**

Below `readRunState` (~line 20), add:

```js
// An unadopted mint — a directory mkdir'd by dispatch Step 4 or flow Step 2.8
// that no invocation ever initialized — carries neither run-state.json nor
// decisions.md. Fallback attribution must never guess into one: a mint that
// sorts newest absorbs foreign sessions' events until swept (#721). Keyed on
// BOTH files being absent, never on config.yml — standalone run dirs
// legitimately carry decisions.md but no config.yml.
function isUnadoptedMint(dir, state) {
  if (state) return false;
  return !fs.existsSync(path.join(dir, 'decisions.md'));
}
```

In `resolveRun`, change the identity-unknown loop:

```js
    for (const { dir } of iterRunDirsWithState(cwd)) return { dir, attribution: 'fallback' };
```

to:

```js
    for (const { dir, state } of iterRunDirsWithState(cwd)) {
      if (isUnadoptedMint(dir, state)) continue;
      return { dir, attribution: 'fallback' };
    }
```

and the unowned-candidate line:

```js
    if (!owner && !unowned) unowned = dir;
```

to:

```js
    if (!owner && !unowned && !isUnadoptedMint(dir, state)) unowned = dir;
```

Do NOT filter `iterRunDirsWithState` itself — `record-worktree`, `close-run`, session-start reporting, and the reconciler must keep seeing mints.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hooks-run-attribution.test.js tests/hooks-context.test.js tests/hooks-context-anchoring.test.js`
Expected: PASS on all three files (the guard only narrows the two fallback selections; owned/session resolution and the env path are untouched).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/context.js tests/hooks-run-attribution.test.js
git commit -m "Skip unadopted mints in resolveRun fallback attribution — refs #721"
```
