# Deferral Gate Contract (#620) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `skills/_shared/deferral-gate.md` as the single home of the fix-now criteria, the bad-reasons-to-skip-a-fix list, and the closed `Defer-reason:` vocabulary; make `_shared/ledger-format.md` cite it instead of owning the criteria; teach `recordPayload` an optional validated `deferReason` and `clearsFloor` a structured exact-match path ahead of its regex fallback; pin the prose ↔ code twin with a new conformance test.

**Architecture:** Move, don't rewrite — the Phase 1 text is cut out of `ledger-format.md` into the new file (ledger nouns generalized to "item/finding"), then the vocabulary, floor-mapping table, hard gate, re-verification rule, placement rule and removal condition are added around it. The vocabulary lives in code once (`DEFER_REASONS` in `bin/lib/issues/record.js`, the constants home) and in prose once (`deferral-gate.md`); `tests/deferral-gate-conformance.test.js` parses both and asserts set equality. `autonomy.js` imports `DEFER_REASONS` from `record.js` (never the reverse — `record.js` must stay import-free of `autonomy.js`) and checks exact membership before its regex loop. No log-line format changes anywhere.

**Tech Stack:** Node 18+ (`node:test`, `node:assert`), Markdown skill files.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T174412-spec-620-621-622-623-624-625/spec-620/work/620-spec.md`

## Global Constraints

- Keep every heading name in `skills/_shared/ledger-format.md` intact (`### Phase 1 — Exhaust fixes (agent, silent)`, `### Phase 2 — Present remainder (per-item user input required)`, `#### Ledger narrowing (runs first, before the table below)`, `### Unresolved Open Items`, `### Phase 3 — Apply user decisions`) — only the criteria text moves out. **No log-line changes** in this record (`AUTO … (blocker: {category}) …` lines stay byte-identical; #622 owns them).
- Do not touch `CATEGORY_PATTERNS` / `UNRELATED_TESTS_RE` semantics — `tests/bin-lib/issues/autonomy.test.js` pins the current regex behavior; add cases, never rewrite.
- `DEFER_REASONS` lives in `record.js`; `autonomy.js` imports it — never the reverse.
- The `Defer-reason:` vocabulary is exactly, in this order: `tangential`, `needs-human-decision`, `pre-existing-outside-diff`, `genuinely-larger`, `blocked-external`, `blocked-dependency`.
- The removal-condition sentence, verbatim, wherever it appears (prose file, code comment, conformance test): `Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time.`
- Conformance anchor phrases are exact substrings; the seventh bad reason is pinned by `severity is never a defer reason` (not the italic sentence with its em-dash).
- Commit messages: imperative, `{Verb} {what} — {detail}`, no conventional-commit prefix; reference the record as `refs #620` (never `closes`). No version bump (release happens centrally). Every commit ends with `Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk`.
- Work from the worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-620-621-622-623-624-625` — verify with `pwd` + `git rev-parse --show-toplevel` before every commit. Stage specific files only (never `git add -A`).
- Run `npm test` only in Task 6 (full suite runs once, centrally); individual tasks run only their own targeted `node --test` files.

---

### Task 1: Create `skills/_shared/deferral-gate.md`

**Files:**
- Create: `skills/_shared/deferral-gate.md`
- Reference (read-only): `skills/_shared/ledger-format.md:103-124` (the Phase 1 text being moved), `bin/lib/issues/autonomy.js:150-190` (`CATEGORY_PATTERNS`, `UNRELATED_TESTS_RE`)

**Interfaces:**
- Consumes: nothing.
- Produces: the contract file every later task cites — the fenced vocabulary list (parsed by Task 5's test), the anchor phrases (Task 5), the removal-condition sentence (Tasks 4 and 5).

- [ ] **Step 1: Write the file** — create `skills/_shared/deferral-gate.md` with exactly this content:

````markdown
# Deferral Gate — fix-now criteria, bad reasons, and the `Defer-reason:` vocabulary

The single home of the rule every exhaust channel applies before anything becomes a work-record proposal: *fix it now unless one of a closed set of reasons says why not.* Consumers cite this file instead of carrying their own defer wording:

- `skills/review/step3-routing.md` (Step 3 routing — Defer / Capture branches)
- `skills/reflect/full-mode.md` and `skills/reflect/hindsight-mode.md` (Defer / Capture recommendation rules)
- `skills/wrap-up/residue-sweep.md` (`remedy: record` findings)
- `skills/wrap-up/leftover-routing.md` (unfinished spec sections)
- `skills/_shared/ledger-format.md` (the ledger resolve gate's Phase 1 / 2 / 3)

The code twins are `clearsFloor` (`bin/lib/issues/autonomy.js`) and `recordPayload`'s `deferReason` option (`bin/lib/issues/record.js`); `DEFER_REASONS` in `record.js` is the vocabulary's only code home, and `tests/deferral-gate-conformance.test.js` pins this file and that export equal.

## Fix-now criteria

For each open item or finding, attempt to fix it now. **The default is fix; defer is the exception.** An item qualifies for fix-now if **all** of these hold:

- Change is localized — typically ≤5 files, no spans across unrelated systems
- Fix does not require functionality not yet built in this pipeline
- Fix does not require user product/design decisions
- Fix does not require external state (third-party data, prod traffic, approvals)
- Fix does not materially expand pipeline scope (does not trigger long rebuilds, does not break >10 unrelated tests)

If the item qualifies, fix it, commit it, and record it as fixed. Do this BEFORE presenting anything to the user.

## Bad reasons to skip a fix

Never use these to leave an item open, defer it, or file it:

- *"Out of scope of this plan / spec"* — if the file is in this build's diff, it is in scope
- *"Following plan verbatim"* — when plan code conflicts with `.claude/rules/` or CLAUDE.md don'ts, fix the violation; the plan was written before review-time context
- *"A future plan (P2/P3/...) might want X"* — speculative; only defer for *known* downstream needs
- *"Bundle of small items"* — items get classified individually, never as a group
- *"Premature without consumer signal"* — clear bugs and convention violations get fixed now
- *"Plan-prescribed routing"* — if the plan said "X moves to P6," that's plan documentation, not a ledger event; remove the item entirely instead of deferring
- *"Minor / outside that scope / not load-bearing"* — severity is never a defer reason; review's severity floors decide what blocks, not what gets fixed

## `Defer-reason:` vocabulary

An item that fails fix-now carries exactly one of these values. The list is closed — the same six values, in the same order, are `DEFER_REASONS` in `bin/lib/issues/record.js`:

```
tangential — a new capability or idea the finding suggests, not a fix to the current work (Capture, never Defer)
needs-human-decision — the fix requires a product/design call only a human can make
pre-existing-outside-diff — a defect in a file this build's diff does not touch
genuinely-larger — the fix expands scope past the fix-now criteria (long rebuild, >10 unrelated tests, spans unrelated systems)
blocked-external — the fix waits on external state (third-party data, prod traffic, approvals)
blocked-dependency — the fix waits on functionality not yet built
```

### Floor mapping

`clearsFloor` (`bin/lib/issues/autonomy.js`) reads a structured value first and returns the verdict below; a free-prose reason still falls back to its regex categories. Structured values map onto those regex groups as follows:

| `Defer-reason:` | `CATEGORY_PATTERNS` group | Clears the floor |
|---|---|---|
| `blocked-external` | external state / third-party / prod traffic / approvals | yes |
| `needs-human-decision` | product-or-design decision | yes |
| `blocked-dependency` | not-yet-built | yes |
| `genuinely-larger` | scope expansion / long rebuild + `UNRELATED_TESTS_RE` (>10 unrelated tests) | yes |
| `tangential` | — (no group) | no |
| `pre-existing-outside-diff` | — (no group) | no |

## The hard gate

No record proposal — staged in a run directory or created directly — without a valid `Defer-reason:`. An item that fails fix-now and has no valid reason stays `open` for the human drill; it is never filed. There is no advisory mode. This is contract text: enforcement lands with #621 (producers stamp the reason) and #622 (the Review Console refuses reason-less proposals).

## Re-verification

After any fix-now change made after `/claude-tweaks:review` passed, re-run `/claude-tweaks:test`. Stated once here; consumers cite it rather than restating it.

## Where the reason lives

- **Staged proposals** (`{run-dir}/staged/*.md`): a `Defer-reason: {value}` line inside the header block — the lines before the first blank line, alongside `Title:` / `Type:` / `Labels:`. Readers locate it **by key, never by position**.
- **Directly-created records**: the first line of the body, followed by a blank line (`recordPayload`'s `deferReason` inserts it there when the body does not already carry one).

## Removal condition

`autonomy.js`'s regex fallback (`CATEGORY_PATTERNS` / `UNRELATED_TESTS_RE`) is transitional. Its recorded removal condition, stated here in the same words as the code comment: Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time.
````

- [ ] **Step 2: Sanity-check the anchors**

Run:
```bash
grep -c "Bundle of small items" skills/_shared/deferral-gate.md
grep -c "severity is never a defer reason" skills/_shared/deferral-gate.md
grep -c "Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time." skills/_shared/deferral-gate.md
```
Expected: `1`, `1`, `1`.

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/deferral-gate.md
git commit -m "Add _shared/deferral-gate.md — fix-now criteria, bad reasons, closed Defer-reason vocabulary, floor mapping, hard gate, placement and removal condition, refs #620

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 2: `ledger-format.md` cites the gate instead of owning the criteria

**Files:**
- Modify: `skills/_shared/ledger-format.md:103-124` (Phase 1), `:190-195` (Unresolved Open Items table), `:236-247` (Phase 3 staging shape)

**Interfaces:**
- Consumes: Task 1's file (cited by path).
- Produces: `ledger-format.md` no longer contains `Bundle of small items`; contains the literal `_shared/deferral-gate.md` (Task 5 asserts both).

- [ ] **Step 1: Replace Phase 1's body** — in `skills/_shared/ledger-format.md`, replace this whole block (heading kept, everything from "For each item with status `open`" through the "Plan-prescribed routing" bullet):

```markdown
### Phase 1 — Exhaust fixes (agent, silent)

For each item with status `open`, attempt to fix it now. **The default is fix; defer is the exception.** An item qualifies for fix-now if **all** of these hold:

- Change is localized — typically ≤5 files, no spans across unrelated systems
- Fix does not require functionality not yet built in this pipeline
- Fix does not require user product/design decisions
- Fix does not require external state (third-party data, prod traffic, approvals)
- Fix does not materially expand pipeline scope (does not trigger long rebuilds, does not break >10 unrelated tests)

If the item qualifies, fix it, commit it, update status to `fixed` with the commit hash. Do this BEFORE presenting anything to the user.

**Bad reasons to skip a fix** (do NOT use these to keep an item open):

- *"Out of scope of this plan / spec"* — if the file is in this build's diff, it is in scope
- *"Following plan verbatim"* — when plan code conflicts with `.claude/rules/` or CLAUDE.md don'ts, fix the violation; the plan was written before review-time context
- *"A future plan (P2/P3/...) might want X"* — speculative; only defer for *known* downstream needs
- *"Bundle of small items"* — items get classified individually, never as a group
- *"Premature without consumer signal"* — clear bugs and convention violations get fixed now
- *"Plan-prescribed routing"* — if the plan said "X moves to P6," that's plan documentation, not a ledger event; remove the item entirely instead of deferring
```

with:

```markdown
### Phase 1 — Exhaust fixes (agent, silent)

For each item with status `open`, attempt to fix it now. **The default is fix; defer is the exception.** Whether an item qualifies for fix-now, and which reasons for skipping a fix are never legitimate, are defined once in `_shared/deferral-gate.md` (its Fix-now criteria and Bad reasons to skip a fix sections) — apply that gate here exactly as written there. If the item qualifies, fix it, commit it, update status to `fixed` with the commit hash. Do this BEFORE presenting anything to the user.
```

- [ ] **Step 2: Phase 2's `Why not fixed now` column** — replace the table row

```markdown
| {N} | {phase} | {description} | {specific blocker — must be one of the legitimate-defer reasons} |
```

with:

```markdown
| {N} | {phase} | {description} | {specific blocker — one of `_shared/deferral-gate.md`'s `Defer-reason:` values} |
```

- [ ] **Step 3: Phase 3's staging shape gains the `Defer-reason:` header line** — in the `Defer` bullet, replace

```markdown
- `Defer` → stage a record proposal at `{run-dir}/staged/ledger-record-{slug}.md` (`Title:`/`Type:`/`Labels:` header + body, same shape as `leftover-{slug}.md` — see `wrap-up/leftover-routing.md` step 3): `parked`, a `Trigger:` line from the user-stated trigger, an `Origin: ledger resolve gate` line, and affected files.
```

with:

```markdown
- `Defer` → stage a record proposal at `{run-dir}/staged/ledger-record-{slug}.md` (`Title:`/`Type:`/`Labels:`/`Defer-reason:` header + body, same shape as `leftover-{slug}.md` — see `wrap-up/leftover-routing.md` step 3; the `Defer-reason:` value is one of `_shared/deferral-gate.md`'s vocabulary, located by key per that file's "Where the reason lives"): `parked`, a `Trigger:` line from the user-stated trigger, an `Origin: ledger resolve gate` line, and affected files.
```

The `Keep` and `Acknowledge` bullets already say "same staging shape" / "same shape as `Keep` above" — they inherit the header line by reference; leave them unchanged.

- [ ] **Step 4: Verify the move**

Run:
```bash
grep -c "Bundle of small items" skills/_shared/ledger-format.md
grep -c "_shared/deferral-gate.md" skills/_shared/ledger-format.md
grep -n "^### Phase 1 — Exhaust fixes (agent, silent)$\|^### Phase 2 — Present remainder\|^### Phase 3 — Apply user decisions$\|^### Unresolved Open Items$" skills/_shared/ledger-format.md | wc -l
grep -c "(blocker: {category})" skills/_shared/ledger-format.md
```
Expected: `0`, `3`, `4`, `2` (the two AUTO log lines are untouched).

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/ledger-format.md
git commit -m "Cite _shared/deferral-gate.md from ledger-format.md — Phase 1 criteria and bad reasons move out, Phase 2 column names the Defer-reason vocabulary, Phase 3 staging header gains Defer-reason, refs #620

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 3: `record.js` — `DEFER_REASONS` and `recordPayload({ deferReason })`

**Files:**
- Modify: `bin/lib/issues/record.js:10-15` (constants), `:128-181` (`recordPayload`), `:405-410` (exports)
- Test: `tests/bin-lib/issues/record.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEFER_REASONS` — `Object.freeze(['tangential','needs-human-decision','pre-existing-outside-diff','genuinely-larger','blocked-external','blocked-dependency'])`, exported; `recordPayload({ ..., deferReason? })` where `deferReason` ∈ `DEFER_REASONS` (unknown → `throw new Error('deferReason must be one of …')`); body line format exactly `Defer-reason: {value}` as the first body line followed by a blank line; a body already carrying a matching `^Defer-reason: ` line is left unchanged, a mismatching one throws.

- [ ] **Step 1: Write the failing tests** — append to `tests/bin-lib/issues/record.test.js` (the file's top-level `require` destructures from `../../../bin/lib/issues/record`; add `DEFER_REASONS` to that destructuring list):

```js
// --- Defer-reason vocabulary (_shared/deferral-gate.md, #620) ---

test('DEFER_REASONS is the frozen six-value closed vocabulary, in contract order', () => {
  assert.deepStrictEqual([...DEFER_REASONS], [
    'tangential', 'needs-human-decision', 'pre-existing-outside-diff',
    'genuinely-larger', 'blocked-external', 'blocked-dependency',
  ]);
  assert.ok(Object.isFrozen(DEFER_REASONS));
});

test('recordPayload: an unknown deferReason throws naming the field', () => {
  assert.throws(
    () => recordPayload({ title: 't', body: 'b', type: 'task', deferReason: 'minor' }),
    /deferReason/,
  );
});

test('recordPayload: a valid deferReason renders as the first body line for a body starting at ## Current State', () => {
  const p = recordPayload({ title: 't', body: '## Current State\nx', type: 'task', deferReason: 'tangential' });
  assert.ok(p.body.startsWith('Defer-reason: tangential\n\n## Current State\nx'));
});

test('recordPayload: a valid deferReason renders as the first body line ahead of pre-heading prose', () => {
  const p = recordPayload({ title: 't', body: 'Intro paragraph.\n\n## Current State\nx', type: 'task', deferReason: 'tangential' });
  assert.ok(p.body.startsWith('Defer-reason: tangential\n\nIntro paragraph.'));
});

test('recordPayload: a body already carrying a matching Defer-reason: line is left unchanged (exactly one line)', () => {
  const body = 'Defer-reason: tangential\n\n## Current State\nx';
  const p = recordPayload({ title: 't', body, type: 'task', deferReason: 'tangential' });
  assert.strictEqual(p.body, body);
  assert.strictEqual((p.body.match(/^Defer-reason: /gm) || []).length, 1);
});

test('recordPayload: a body carrying a mismatching Defer-reason: line throws', () => {
  assert.throws(
    () => recordPayload({ title: 't', body: 'Defer-reason: genuinely-larger\n\n## Current State\nx', type: 'task', deferReason: 'tangential' }),
    /Defer-reason/,
  );
});

test('recordPayload: omitting deferReason leaves the body byte-identical and adds no label', () => {
  const body = 'Intro.\n\n## Current State\nx';
  const p = recordPayload({ title: 't', body, type: 'task' });
  assert.strictEqual(p.body, body);
  assert.deepStrictEqual(p.labels, []);
});

test('recordPayload: deferReason never becomes a label and leaves label order unchanged', () => {
  const p = recordPayload({ title: 't', body: 'b', type: 'task', origin: 'capture', risk: 'low', ready: true, deferReason: 'blocked-external' });
  assert.deepStrictEqual(p.labels, ['by:capture', 'risk:low', 'ready']);
});

test('recordPayload: deferReason and fingerprint compose — reason first line, fingerprint marker last', () => {
  const p = recordPayload({ title: 't', body: 'b', type: 'task', deferReason: 'tangential', fingerprint: 'fp-1' });
  assert.ok(p.body.startsWith('Defer-reason: tangential\n\nb'));
  assert.ok(p.body.endsWith('<!-- work-fingerprint: fp-1 -->'));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/bin-lib/issues/record.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail` ≥ 8 (`DEFER_REASONS` undefined; `deferReason` ignored).

- [ ] **Step 3: Implement** — in `bin/lib/issues/record.js`:

(a) after `const CEREMONY_TIERS = ['fast-lane', 'standard'];` add:

```js
// The closed Defer-reason: vocabulary — the code twin of
// skills/_shared/deferral-gate.md's "Defer-reason: vocabulary" section
// (tests/deferral-gate-conformance.test.js pins the two lists equal). Order is
// the contract's order. Frozen: consumers compare against it, never extend it.
const DEFER_REASONS = Object.freeze([
  'tangential',
  'needs-human-decision',
  'pre-existing-outside-diff',
  'genuinely-larger',
  'blocked-external',
  'blocked-dependency',
]);

// The one body line a directly-created record's Defer-reason: lives on (first
// line of the body, blank line after — deferral-gate.md's "Where the reason lives").
const DEFER_REASON_LINE_RE = /^Defer-reason: (\S+)$/m;
```

(b) change `recordPayload`'s signature to add `deferReason`:

```js
function recordPayload({ title, body, type, origin, risk, size, ceremony, framing, ready, parked, priority, fingerprint, effort, deferReason } = {}) {
```

and update the comment line above it (`// { title, body, type, origin?, … fingerprint? }`) to end `…, fingerprint?, deferReason? }`.

(c) immediately after the `if (ready && parked) { … }` block, add:

```js
  // deferReason is validation-plus-body-line, never a label: an unknown value
  // throws naming the field (same posture as the effort rejection above); a valid
  // one is inserted as the body's first line unless the body already carries a
  // matching Defer-reason: line (a specShapedBody-composed body, #623), in which
  // case nothing is inserted; a body carrying a *different* value is a caller
  // contradiction and throws.
  let reasonBody = body;
  if (deferReason !== undefined) {
    oneOf('deferReason', deferReason, DEFER_REASONS);
    const existing = DEFER_REASON_LINE_RE.exec(body);
    if (existing) {
      if (existing[1] !== deferReason) {
        throw new Error(`body already carries "Defer-reason: ${existing[1]}" but deferReason is "${deferReason}"`);
      }
    } else {
      reasonBody = `Defer-reason: ${deferReason}\n\n${body}`;
    }
  }
```

(d) change the fingerprint composition to read from `reasonBody`:

```js
  const finalBody = fingerprint
    ? `${reasonBody}\n\n<!-- work-fingerprint: ${fingerprint} -->`
    : reasonBody;
```

(e) add `DEFER_REASONS` to `module.exports` right after `CEREMONY_TIERS`-adjacent constants — the exports line becomes:

```js
module.exports = {
  ORIGINS, TYPES, TIERS, PRIORITIES, DEFER_REASONS, LABELS, TYPE_LABELS, recordPayload, specShapedBody,
  FP_RE_WORK, FP_RE_LEGACY, extractFingerprint, normalizeLabelNames, parseRecordFacets,
  parseDependencies, parseDependencyAssumptions, buildNativeDependencyQuery,
  hasOpenNativeBlocker, CLASSIFICATION_SCORING, fenceFor, fencedBlock, parseSubIssues,
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/bin-lib/issues/record.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`.

Also run the spec's AC 4 probe:
```bash
node -e "const {recordPayload}=require('./bin/lib/issues/record.js'); const a=recordPayload({title:'t', body:'Intro paragraph.\n\n## Current State\nx', type:'task', deferReason:'tangential'}).body; console.log(a.startsWith('Defer-reason: tangential\n\nIntro paragraph.')); try{recordPayload({title:'t',body:'b',type:'task',deferReason:'minor'})}catch(e){console.log(/deferReason/.test(e.message))}; console.log((recordPayload({title:'t', body:'Defer-reason: tangential\n\n## Current State\nx', type:'task', deferReason:'tangential'}).body.match(/^Defer-reason:/gm)||[]).length)"
```
Expected: `true`, `true`, `1`.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/record.js tests/bin-lib/issues/record.test.js
git commit -m "Add DEFER_REASONS and recordPayload's validated deferReason option — first-line body insertion, match-or-throw against a body-carried Defer-reason line, never a label, refs #620

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 4: `autonomy.js` — structured `clearsFloor` path + removal-condition comment

**Files:**
- Modify: `bin/lib/issues/autonomy.js:1-8` (imports), `:143-190` (`clearsFloor` and its header comment)
- Test: `tests/bin-lib/issues/autonomy.test.js`

**Interfaces:**
- Consumes: `DEFER_REASONS` from `./record` (Task 3).
- Produces: `clearsFloor(reason)` — signature unchanged; when `reason` is exactly one of `DEFER_REASONS` returns `true` for `needs-human-decision`, `genuinely-larger`, `blocked-external`, `blocked-dependency` and `false` for `tangential`, `pre-existing-outside-diff`; otherwise today's regex path, unchanged. The source contains the removal-condition sentence verbatim (Task 5 asserts it).

- [ ] **Step 1: Write the failing tests** — append to `tests/bin-lib/issues/autonomy.test.js`:

```js
// --- structured Defer-reason: path (_shared/deferral-gate.md floor mapping, #620) ---

test('clearsFloor: the four floor-clearing structured Defer-reason values return true', () => {
  for (const r of ['needs-human-decision', 'genuinely-larger', 'blocked-external', 'blocked-dependency']) {
    assert.strictEqual(clearsFloor(r), true, r);
  }
});

test('clearsFloor: tangential and pre-existing-outside-diff do not clear the floor', () => {
  assert.strictEqual(clearsFloor('tangential'), false);
  assert.strictEqual(clearsFloor('pre-existing-outside-diff'), false);
});

test('clearsFloor: the documented verdict vector for the whole vocabulary, in contract order', () => {
  const vocab = ['tangential', 'needs-human-decision', 'pre-existing-outside-diff', 'genuinely-larger', 'blocked-external', 'blocked-dependency'];
  assert.deepStrictEqual(vocab.map(clearsFloor), [false, true, false, true, true, true]);
});

test('clearsFloor: a free-prose reason still resolves via the regex path', () => {
  assert.strictEqual(clearsFloor('requires a product decision from the owner'), true);
  assert.strictEqual(clearsFloor('Not sure if this is even still relevant'), false);
});

test('clearsFloor: a free-prose reason that merely contains a vocabulary word takes the regex path, not the structured one', () => {
  // "tangential" is a structured false, but the surrounding prose names external state -> regex true.
  assert.strictEqual(clearsFloor('tangential to the diff and blocked on external state'), true);
  // exact-match only: whitespace or case variants are not structured values.
  assert.strictEqual(clearsFloor(' blocked-external '), false);
  assert.strictEqual(clearsFloor('Blocked-External'), false);
});

test('clearsFloor: an unknown string returns false', () => {
  assert.strictEqual(clearsFloor('minor'), false);
});

test('autonomy.js source carries the regex fallback removal condition verbatim', () => {
  const src = require('fs').readFileSync(require.resolve('../../../bin/lib/issues/autonomy.js'), 'utf8');
  assert.ok(src.includes('Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time.'));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/bin-lib/issues/autonomy.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail` ≥ 3 (structured values currently take the regex path: `needs-human-decision` → false, `blocked-dependency` → false, the removal sentence absent).

- [ ] **Step 3: Implement** — in `bin/lib/issues/autonomy.js`:

(a) after `'use strict';` and the opening comment block (before `const CEILINGS = …`), add:

```js
// record.js requires only ./facet-shape; this import is one-directional by
// contract (autonomy -> record, never record -> autonomy) so the two never cycle.
const { DEFER_REASONS } = require('./record');
```

(b) replace the comment block above `CATEGORY_PATTERNS` (the paragraph starting `// Floor-check predicate for the autonomy ceiling's ledger-narrowing bookkeeping`) with:

```js
// Floor-check predicate for the autonomy ceiling's ledger-narrowing bookkeeping
// capability. Decides whether an item's "why not fixed now" reason is one of the
// categories skills/_shared/deferral-gate.md's floor mapping marks as clearing
// the floor -- the only categories bookkeeping narrowing is allowed to auto-route
// without asking. Two paths: a structured Defer-reason: value (exact member of
// DEFER_REASONS) resolves from the mapping table below; anything else falls back
// to the regex categories that predate the vocabulary, moved verbatim from the
// retired unattended-tier.js -- same patterns, same logic, no behavior change.
// Was docs/superpowers/specs/2026-07-16-unattended-tier-design.md — deleted (652a97c4).
//
// Removal condition for the regex fallback (stated in the same words in
// skills/_shared/deferral-gate.md's "Removal condition" section):
// Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time.

// Structured verdicts, per deferral-gate.md's floor mapping: blocked-external <->
// the external-state group, needs-human-decision <-> the product/design group,
// blocked-dependency <-> not-yet-built, genuinely-larger <-> scope expansion +
// UNRELATED_TESTS_RE; tangential and pre-existing-outside-diff map to no group.
const STRUCTURED_FLOOR = Object.freeze({
  'tangential': false,
  'needs-human-decision': true,
  'pre-existing-outside-diff': false,
  'genuinely-larger': true,
  'blocked-external': true,
  'blocked-dependency': true,
});
```

(c) replace the body of `clearsFloor` with:

```js
function clearsFloor(blockerReason) {
  if (typeof blockerReason !== 'string' || blockerReason.trim() === '') return false;
  // Structured path first: an exact vocabulary member never reaches the regexes,
  // so a free-prose reason that merely contains a vocabulary word still takes
  // the regex path below.
  if (DEFER_REASONS.includes(blockerReason)) return STRUCTURED_FLOOR[blockerReason] === true;
  if (CATEGORY_PATTERNS.some((re) => re.test(blockerReason))) return true;
  const testsMatch = UNRELATED_TESTS_RE.exec(blockerReason);
  if (!testsMatch) return false;
  const moreThan = Boolean(testsMatch[1]);
  const count = Number(testsMatch[2]);
  return moreThan ? count >= 10 : count > 10;
}
```

Leave `CATEGORY_PATTERNS`, `UNRELATED_TESTS_RE`, and the `UNRELATED_TESTS_RE` explanatory comment exactly as they are.

- [ ] **Step 4: Run to verify they pass, and that no cycle exists**

Run: `node --test tests/bin-lib/issues/autonomy.test.js tests/bin-lib/issues/record.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`.

Run the spec's AC 3 probe:
```bash
node -e "const {clearsFloor}=require('./bin/lib/issues/autonomy.js'); console.log(['tangential','needs-human-decision','pre-existing-outside-diff','genuinely-larger','blocked-external','blocked-dependency'].map(clearsFloor)); console.log(clearsFloor('requires a product decision from the owner'))"
grep -c "require('./autonomy')" bin/lib/issues/record.js
```
Expected: `[ false, true, false, true, true, true ]`, `true`, `0`.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/autonomy.js tests/bin-lib/issues/autonomy.test.js
git commit -m "Give clearsFloor a structured Defer-reason path ahead of its regex fallback — verdicts per deferral-gate.md's floor mapping, removal condition recorded in the header comment, refs #620

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 5: `tests/deferral-gate-conformance.test.js` — pin prose ↔ code

**Files:**
- Create: `tests/deferral-gate-conformance.test.js`
- Reference (read-only): `tests/integration-model.test.js` (exemplar shape: `node:test` + `node:assert/strict`, `fs`/`path` reads relative to `__dirname`)

**Interfaces:**
- Consumes: `skills/_shared/deferral-gate.md` (Task 1), `skills/_shared/ledger-format.md` (Task 2), `DEFER_REASONS` (Task 3), `bin/lib/issues/autonomy.js` source (Task 4).
- Produces: the conformance suite #621–#625 extend with per-consumer assertions.

- [ ] **Step 1: Write the test file** — create `tests/deferral-gate-conformance.test.js`:

```js
// tests/deferral-gate-conformance.test.js
// Pins skills/_shared/deferral-gate.md (prose) to bin/lib/issues/record.js's
// DEFER_REASONS (code) and to the consumers that cite the gate instead of
// restating it. #620 lays down the contract half; #621-#625 extend this file
// with per-consumer assertions.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DEFER_REASONS } = require('../bin/lib/issues/record.js');

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const GATE = read('skills/_shared/deferral-gate.md');
const LEDGER = read('skills/_shared/ledger-format.md');
const AUTONOMY_SRC = read('bin/lib/issues/autonomy.js');

const REMOVAL_CONDITION = 'Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time.';

// The vocabulary is the first fenced block after the "## `Defer-reason:` vocabulary"
// heading; each line is "{value} — {one-line definition}".
function parseVocabulary(md) {
  const start = md.indexOf('## `Defer-reason:` vocabulary');
  assert.ok(start >= 0, 'deferral-gate.md must have a "## `Defer-reason:` vocabulary" heading');
  const fenceOpen = md.indexOf('\n```\n', start);
  assert.ok(fenceOpen >= 0, 'vocabulary heading must be followed by a fenced list');
  const fenceClose = md.indexOf('\n```', fenceOpen + 5);
  assert.ok(fenceClose > fenceOpen, 'vocabulary fence must close');
  return md
    .slice(fenceOpen + 5, fenceClose)
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => l.split(' — ')[0].trim());
}

// --- vocabulary: prose == code ---

test('deferral-gate.md fenced vocabulary equals DEFER_REASONS as a set (and in order)', () => {
  const prose = parseVocabulary(GATE);
  assert.deepEqual(new Set(prose), new Set(DEFER_REASONS));
  assert.deepEqual(prose, [...DEFER_REASONS]);
});

test('every vocabulary line carries a one-line definition', () => {
  const start = GATE.indexOf('## `Defer-reason:` vocabulary');
  const fenceOpen = GATE.indexOf('\n```\n', start);
  const fenceClose = GATE.indexOf('\n```', fenceOpen + 5);
  const lines = GATE.slice(fenceOpen + 5, fenceClose).split('\n').filter((l) => l.trim() !== '');
  for (const l of lines) assert.match(l, /^[a-z-]+ — \S/, l);
});

// --- fix-now criteria and bad reasons live in the gate file ---

const FIX_NOW_ANCHORS = ['≤5 files', 'not yet built', 'product/design decision', 'external state', '>10 unrelated tests'];
const BAD_REASON_ANCHORS = [
  'Out of scope of this plan', 'Following plan verbatim', 'might want X', 'Bundle of small items',
  'Premature without consumer signal', 'Plan-prescribed routing', 'severity is never a defer reason',
];

for (const anchor of FIX_NOW_ANCHORS) {
  test(`deferral-gate.md states the fix-now criterion "${anchor}"`, () => {
    assert.ok(GATE.includes(anchor));
  });
}

for (const anchor of BAD_REASON_ANCHORS) {
  test(`deferral-gate.md states the bad reason "${anchor}"`, () => {
    assert.ok(GATE.includes(anchor));
  });
}

test('deferral-gate.md names its consumers, the hard gate, re-verification, and where the reason lives', () => {
  for (const consumer of [
    'skills/review/step3-routing.md', 'skills/reflect/full-mode.md', 'skills/reflect/hindsight-mode.md',
    'skills/wrap-up/residue-sweep.md', 'skills/wrap-up/leftover-routing.md', 'skills/_shared/ledger-format.md',
  ]) assert.ok(GATE.includes(consumer), consumer);
  assert.ok(GATE.includes('## The hard gate'));
  assert.ok(GATE.includes('## Re-verification'));
  assert.ok(GATE.includes('## Where the reason lives'));
  assert.ok(GATE.includes('by key, never by position'));
});

// --- removal condition: prose == code comment ---

test('deferral-gate.md and autonomy.js carry the removal condition in the same words', () => {
  assert.ok(GATE.includes(REMOVAL_CONDITION), 'deferral-gate.md');
  assert.ok(AUTONOMY_SRC.includes(REMOVAL_CONDITION), 'autonomy.js');
});

// --- ledger-format.md cites the gate instead of owning the criteria ---

test('ledger-format.md cites _shared/deferral-gate.md and no longer restates the bad-reasons list', () => {
  assert.ok(LEDGER.includes('_shared/deferral-gate.md'));
  assert.ok(!LEDGER.includes('Bundle of small items'));
});

test('ledger-format.md keeps its Phase heading names intact (consumers grep them)', () => {
  for (const heading of [
    '### Phase 1 — Exhaust fixes (agent, silent)',
    '### Phase 2 — Present remainder (per-item user input required)',
    '### Phase 3 — Apply user decisions',
  ]) assert.ok(LEDGER.includes(heading), heading);
});
```

- [ ] **Step 2: Run it — must pass on the current tree**

Run: `node --test tests/deferral-gate-conformance.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 3: Prove it discriminates** — swap in the pre-Task-2 `ledger-format.md`, run, and restore, all in ONE command (a timeout between swap and restore would leave the old file in the tree):

```bash
git show HEAD~3:skills/_shared/ledger-format.md > skills/_shared/ledger-format.md; node --test tests/deferral-gate-conformance.test.js 2>&1 | grep -E "^# (pass|fail)"; git checkout -- skills/_shared/ledger-format.md; git status --short skills/_shared/ledger-format.md; grep -c "Bundle of small items" skills/_shared/ledger-format.md
```
(`HEAD~3` = the commit before Task 2's, given Tasks 2, 3, 4 each committed once after it; if the commit count differs, use `git log --oneline -6` to pick the commit whose parent is Task 1's.)
Expected: `# fail 1` (the ledger citation test), then a clean `git status` line (empty) and `0`.

- [ ] **Step 4: Commit**

```bash
git add tests/deferral-gate-conformance.test.js
git commit -m "Add tests/deferral-gate-conformance.test.js — pins deferral-gate.md's vocabulary to DEFER_REASONS, its anchor phrases, the shared removal condition, and ledger-format.md's citation, refs #620

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

### Task 6: `docs/plugin-structure.md` row, staged follow-up record, full suite

**Files:**
- Modify: `docs/plugin-structure.md:73` (the `| _shared | …` row)
- Create (run-dir, gitignored, NOT committed): `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-08-16T174412-spec-620-621-622-623-624-625/spec-620/staged/capture-clearsfloor-regex-removal.md`
- Append (run-dir, gitignored): `…/spec-620/decisions.md`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: the docs row; a staged queue-write proposal the consolidated Review Console files (this is the "follow-up record filed at build time" the removal condition names — under `_shared/auto-mode-contract.md`'s work-record-creation stance a pipeline phase stages, it never files directly).

- [ ] **Step 1: Add the `_shared` row entry** — in `docs/plugin-structure.md`, the row starting `| _shared | observation-plan.md, design-craft.md, feedback-objectives.md |`: change the file list to `observation-plan.md, design-craft.md, feedback-objectives.md, deferral-gate.md` and append this sentence to the end of the row's description cell (before the closing `|`): ` deferral-gate.md: the single home of the fix-now criteria, the bad-reasons-to-skip-a-fix list, and the closed \`Defer-reason:\` vocabulary (code twin: \`DEFER_REASONS\` in \`bin/lib/issues/record.js\`, pinned equal by \`tests/deferral-gate-conformance.test.js\`); cited by review Step 3, reflect, wrap-up's residue sweep and leftover routing, and \`_shared/ledger-format.md\`'s resolve gate instead of restated.`

Verify: `grep -c "deferral-gate.md" docs/plugin-structure.md` → `2` (file list + description).

- [ ] **Step 2: Stage the follow-up record proposal** — write the staged file (header block first, keyed lines, then a blank line, then a spec-shaped body). Use a heredoc via `cat >` (the run dir is gitignored and outside the worktree; the `worktree.always` gate exempts `.claude-tweaks/pipelines/` writes):

```bash
cat > "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-08-16T174412-spec-620-621-622-623-624-625/spec-620/staged/capture-clearsfloor-regex-removal.md" <<'EOF'
Title: Remove clearsFloor's regex fallback (CATEGORY_PATTERNS / UNRELATED_TESTS_RE) once every deferral-gate consumer stamps a structured Defer-reason
Type: task
Labels: type:task
Defer-reason: blocked-dependency

Defer-reason: blocked-dependency

Origin: build #620 (recorded removal condition for autonomy.js's transitional regex fallback)

## Current State

`bin/lib/issues/autonomy.js`'s `clearsFloor(reason)` resolves a structured `Defer-reason:` value (exact member of `DEFER_REASONS`) from a mapping table first, and falls back to `CATEGORY_PATTERNS` + `UNRELATED_TESTS_RE` regexes for free-prose reasons (#620). The regex fallback exists only because not every producer stamps a structured value yet: `skills/_shared/deferral-gate.md`'s consumers (`review/step3-routing.md`, `reflect/full-mode.md`, `reflect/hindsight-mode.md`, `wrap-up/residue-sweep.md`, `wrap-up/leftover-routing.md`, `_shared/ledger-format.md`) start stamping `Defer-reason:` with #621 and compose via `specShapedBody` with #624. The header comment in `autonomy.js` and the "Removal condition" section of `deferral-gate.md` both state, verbatim: "Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time." This is that record.

## Deliverables

- [ ] Delete `CATEGORY_PATTERNS`, `UNRELATED_TESTS_RE`, and the regex branch of `clearsFloor` in `bin/lib/issues/autonomy.js`; `clearsFloor` returns the structured verdict for a `DEFER_REASONS` member and `false` for anything else.
- [ ] Remove the regex-path cases from `tests/bin-lib/issues/autonomy.test.js` (the free-prose `clearsFloor` tests moved from the retired unattended-tier suite) and the "free-prose reason still resolves via regex" case; keep the structured-verdict cases.
- [ ] Remove the "Removal condition" section from `skills/_shared/deferral-gate.md` and the matching sentence from `autonomy.js`'s header comment; drop the `REMOVAL_CONDITION` assertion from `tests/deferral-gate-conformance.test.js`.
- [ ] Update `deferral-gate.md`'s Floor mapping table to describe the structured verdicts only (no regex-group column).

## Acceptance Criteria

1. `grep -c "CATEGORY_PATTERNS\|UNRELATED_TESTS_RE" bin/lib/issues/autonomy.js skills/_shared/deferral-gate.md tests/deferral-gate-conformance.test.js` prints `0` for each file.
2. `node -e "const {clearsFloor}=require('./bin/lib/issues/autonomy.js'); console.log(clearsFloor('requires a product decision from the owner'), clearsFloor('needs-human-decision'))"` prints `false true`.
3. `node --test tests/bin-lib/issues/autonomy.test.js tests/deferral-gate-conformance.test.js` passes; `npm test` passes in full.

Blocked by #621
Blocked by #624
EOF
```

Then log it:
```bash
printf -- '- STAGED %s — Build #620 Task 6: staged follow-up record proposal for clearsFloor regex-fallback removal (defer-reason: blocked-dependency — waits on #621/#624 + one green release). Stage path: staged/capture-clearsfloor-regex-removal.md; the consolidated Review Console files it (queueWriteAutoFile at unattended). Reversibility: high.\n' "$(date +%H:%M:%S)" >> "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-08-16T174412-spec-620-621-622-623-624-625/spec-620/decisions.md"
```

Verify: `head -5 ".../spec-620/staged/capture-clearsfloor-regex-removal.md"` shows the four header lines then a blank line; `grep -c "^Defer-reason: blocked-dependency$"` on it prints `2` (header + body first line — the header copy is what the console's reader (#622) keys on; the body copy is what `recordPayload`'s match-or-throw sees).

- [ ] **Step 3: Full verification**

Run: `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/27dbbd0d-1515-4997-b7f3-e216185bea95/scratchpad/620-npm-test.log 2>&1; grep -E "^# (tests|pass|fail)" /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/27dbbd0d-1515-4997-b7f3-e216185bea95/scratchpad/620-npm-test.log`
Expected: `# fail 0` (baseline was 3774 tests; the count grows by the new cases). If a failure appears, re-run only that file in isolation before concluding anything (machine-load flake vs. regression).

Also run the spec's AC 2:
```bash
grep -c "Bundle of small items" skills/_shared/ledger-format.md; grep -c "Bundle of small items" skills/_shared/deferral-gate.md
```
Expected: `0`, `1`.

- [ ] **Step 4: Commit**

```bash
git add docs/plugin-structure.md
git commit -m "List _shared/deferral-gate.md in docs/plugin-structure.md's _shared row, refs #620

Claude-Session: https://claude.ai/code/session_01UC1kK4nSsgppMW2zNSMzvk"
```

---

## Self-review

- **Spec coverage:** deliverable 1 (new file, all sections in order) → Task 1; deliverable 2 (ledger citation, column, header line) → Task 2; deliverable 3 (`DEFER_REASONS`, `deferReason`) → Task 3; deliverable 4 (structured `clearsFloor`, removal comment, follow-up record) → Task 4 + Task 6 Step 2; deliverable 5 (unit tests) → Tasks 3–4; deliverable 6 (conformance test) → Task 5; deliverable 7 (plugin-structure row) → Task 6. AC 1 (targeted suites + discrimination) → Task 5 Steps 2–3; AC 2 → Task 6 Step 3; AC 3 → Task 4 Step 4; AC 4 → Task 3 Step 4; AC 5 → Task 6 Step 3.
- **Placeholders:** none — every step carries literal content.
- **Type consistency:** `DEFER_REASONS` (Tasks 3, 4, 5), `deferReason` option name (Tasks 3, 6), `STRUCTURED_FLOOR` (Task 4 only), `REMOVAL_CONDITION` sentence identical in Tasks 1, 4, 5, 6.
- **Grep self-checks:** Task 1's file contains `Bundle of small items` once (bad-reasons bullet) and `severity is never a defer reason` once; Task 2's edited `ledger-format.md` contains `_shared/deferral-gate.md` three times (Phase 1, Phase 2 column, Phase 3 bullet) and `(blocker: {category})` twice (untouched log lines); Task 5's `parseVocabulary` splits on ` — ` (em-dash with spaces) which each vocabulary line uses exactly once before its definition — the definitions themselves contain no further ` — `.
