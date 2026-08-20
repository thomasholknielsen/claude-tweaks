# Declined-Learning Fingerprint Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/feedback` and `/wrap-up` a shared, project-local store recording fingerprints of findings/insights a human explicitly declined, so a later run annotates a re-surfaced match instead of presenting it as a fresh proposal.

**Architecture:** One new degrade-open cache module (`plugin/bin/lib/declined-learning/store.js`), mirroring `plugin/bin/lib/transcript-judge/watermark.js`'s injectable-fs pattern but as a single flat JSON file (not per-consumer) since entries already carry a `source` field. `plugin/bin/lib/transcript-judge/watermark.js`'s `formatOffsetClause` gains an optional `dismissedFingerprints` segment so the judge dispatch prompt can tell the judge which fingerprints to skip. `/feedback`'s decline path (`_shared/upstream-feedback-batch.md`) and `/wrap-up`'s reflect insight routing (`reflect/full-mode.md`) are the two skill-prose consumers wired to read/write the store.

**Tech Stack:** Node.js (`node --test`), CommonJS, no new dependencies.

**Spec:** GitHub issue #849 (materialized at `.claude-tweaks/pipelines/2026-08-20T063513-record-849/work/849-spec.md`)

## Global Constraints

- Store module follows `watermark.js`'s exact conventions: every fs call is an injectable default param; read degrades open (missing/corrupt → safe default, never throw); write propagates real failures to the caller.
- New `.claude-tweaks/declined-learning/` directory needs its own explicit `.gitignore` line — never a blanket `.claude-tweaks/` rule (`docs/incident-log.md` IL-06).
- `docs/skill-graph.md` gets the new edges; no consumer skill file restates the store's mechanics — they cite the module.
- Test files live at `tests/bin-lib/{module-dir}/{file}.test.js` (top-level `tests/`, not under `plugin/`), following `tests/bin-lib/transcript-judge/watermark.test.js`'s `makeStore()` fake-fs convention.

---

### Task 1: Declined-learning store module + tests + gitignore

**Files:**
- Create: `plugin/bin/lib/declined-learning/store.js`
- Create: `tests/bin-lib/declined-learning/store.test.js`
- Modify: `.gitignore` (add the new directory's line to the existing `.claude-tweaks/{skill}/` block)

**Interfaces:**
- Produces: `storePath()` → `string`; `readStore({ readFile }?)` → `object`; `writeStore(data, { mkdirSync, writeFile }?)` → `void`; `recordDecline(fingerprint, { reason, source, declinedAt }?, deps?)` → `{ declinedAt, reason, source }`; `lookupDecline(fingerprint, deps?)` → `{ declinedAt, reason, source } | null`; `listDeclinedFingerprints({ source }?, deps?)` → `string[]`; `clearDecline(fingerprint, deps?)` → `boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/declined-learning/store.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const store = require('../../../plugin/bin/lib/declined-learning/store');

// Fake deps are plain objects backed by an in-memory `data` keyed by the path a real fs call
// would use — same convention as tests/bin-lib/transcript-judge/watermark.test.js's makeStore().
function makeStore() {
  const data = {};
  const mkdirSync = () => {};
  const writeFile = (p, content) => { data[p] = content; };
  const readFile = (p) => {
    if (!(p in data)) { const e = new Error(`ENOENT: no such file, open '${p}'`); e.code = 'ENOENT'; throw e; }
    return data[p];
  };
  return { data, mkdirSync, writeFile, readFile };
}

const STORE_REL = path.join('.claude-tweaks', 'declined-learning', 'store.json');

// ---- storePath ---------------------------------------------------------

test('storePath: fixed location under .claude-tweaks/declined-learning/', () => {
  assert.equal(store.storePath(), STORE_REL);
});

// ---- readStore: degrade-open -------------------------------------------

test('readStore: no file -> {}, no throw', () => {
  const { readFile } = makeStore();
  assert.deepEqual(store.readStore({ readFile }), {});
});

test('readStore: corrupt/malformed JSON -> {}, no throw', () => {
  const { data, readFile } = makeStore();
  data[STORE_REL] = '{ this is not valid json ';
  assert.deepEqual(store.readStore({ readFile }), {});
});

test('readStore: valid JSON that is not an object (e.g. an array) -> {}', () => {
  const { data, readFile } = makeStore();
  data[STORE_REL] = '[1,2,3]';
  assert.deepEqual(store.readStore({ readFile }), {});
});

// ---- writeStore ----------------------------------------------------------

test('writeStore: creates the containing directory and writes JSON at the derived path', () => {
  const mkdirCalls = [];
  const writeCalls = [];
  const mkdirSync = (p, opts) => mkdirCalls.push({ p, opts });
  const writeFile = (p, content) => writeCalls.push({ p, content });
  const payload = { 'feedback-deadbeef': { declinedAt: '2026-08-20T00:00:00Z', reason: 'not applicable', source: 'feedback' } };

  store.writeStore(payload, { mkdirSync, writeFile });

  assert.equal(mkdirCalls.length, 1);
  assert.equal(mkdirCalls[0].p, path.dirname(STORE_REL));
  assert.deepEqual(mkdirCalls[0].opts, { recursive: true });
  assert.equal(writeCalls.length, 1);
  assert.equal(writeCalls[0].p, STORE_REL);
  assert.deepEqual(JSON.parse(writeCalls[0].content), payload);
});

test('writeStore: propagates a real write failure to the caller rather than swallowing it', () => {
  const mkdirSync = () => {};
  const writeFile = () => { throw new Error('ENOSPC: no space left on device'); };
  assert.throws(() => store.writeStore({}, { mkdirSync, writeFile }), /ENOSPC/);
});

// ---- recordDecline + lookupDecline (annotation lookup) --------------------

test('recordDecline: writes an entry, lookupDecline reads it back', () => {
  const deps = makeStore();
  const entry = store.recordDecline('feedback-deadbeef', { reason: 'stale rubric', source: 'feedback', declinedAt: '2026-08-20T00:00:00Z' }, deps);

  assert.deepEqual(entry, { declinedAt: '2026-08-20T00:00:00Z', reason: 'stale rubric', source: 'feedback' });
  assert.deepEqual(store.lookupDecline('feedback-deadbeef', deps), entry);
});

test('lookupDecline: no entry for an unknown fingerprint -> null', () => {
  const deps = makeStore();
  assert.equal(store.lookupDecline('reflect-abc12345', deps), null);
});

test('recordDecline: defaults reason to null and declinedAt to an ISO timestamp when omitted', () => {
  const deps = makeStore();
  const entry = store.recordDecline('reflect-abc12345', { source: 'wrap-up' }, deps);
  assert.equal(entry.reason, null);
  assert.equal(entry.source, 'wrap-up');
  assert.match(entry.declinedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('recordDecline: overwrites an existing entry for the same fingerprint', () => {
  const deps = makeStore();
  store.recordDecline('feedback-deadbeef', { reason: 'first', source: 'feedback', declinedAt: 'a' }, deps);
  const second = store.recordDecline('feedback-deadbeef', { reason: 'second', source: 'feedback', declinedAt: 'b' }, deps);

  assert.deepEqual(store.lookupDecline('feedback-deadbeef', deps), second);
});

test('recordDecline: two different fingerprints coexist in the store', () => {
  const deps = makeStore();
  store.recordDecline('feedback-aaa', { source: 'feedback' }, deps);
  store.recordDecline('reflect-bbb', { source: 'wrap-up' }, deps);

  assert.notEqual(store.lookupDecline('feedback-aaa', deps), null);
  assert.notEqual(store.lookupDecline('reflect-bbb', deps), null);
});

// ---- listDeclinedFingerprints ---------------------------------------------

test('listDeclinedFingerprints: no filter returns every fingerprint', () => {
  const deps = makeStore();
  store.recordDecline('feedback-aaa', { source: 'feedback' }, deps);
  store.recordDecline('reflect-bbb', { source: 'wrap-up' }, deps);

  const all = store.listDeclinedFingerprints({}, deps).sort();
  assert.deepEqual(all, ['feedback-aaa', 'reflect-bbb']);
});

test('listDeclinedFingerprints: filtered by source returns only matching fingerprints', () => {
  const deps = makeStore();
  store.recordDecline('feedback-aaa', { source: 'feedback' }, deps);
  store.recordDecline('feedback-ccc', { source: 'feedback' }, deps);
  store.recordDecline('reflect-bbb', { source: 'wrap-up' }, deps);

  const feedbackOnly = store.listDeclinedFingerprints({ source: 'feedback' }, deps).sort();
  assert.deepEqual(feedbackOnly, ['feedback-aaa', 'feedback-ccc']);
});

test('listDeclinedFingerprints: empty store -> []', () => {
  const deps = makeStore();
  assert.deepEqual(store.listDeclinedFingerprints({}, deps), []);
});

// ---- clearDecline -----------------------------------------------------

test('clearDecline: removes an existing entry and returns true', () => {
  const deps = makeStore();
  store.recordDecline('feedback-aaa', { source: 'feedback' }, deps);

  const removed = store.clearDecline('feedback-aaa', deps);

  assert.equal(removed, true);
  assert.equal(store.lookupDecline('feedback-aaa', deps), null);
});

test('clearDecline: unknown fingerprint -> false, no write', () => {
  const deps = makeStore();
  const writeCallsBefore = Object.keys(deps.data).length;
  const removed = store.clearDecline('feedback-never-existed', deps);

  assert.equal(removed, false);
  assert.equal(Object.keys(deps.data).length, writeCallsBefore);
});

test('clearDecline: leaves sibling entries untouched', () => {
  const deps = makeStore();
  store.recordDecline('feedback-aaa', { source: 'feedback' }, deps);
  store.recordDecline('reflect-bbb', { source: 'wrap-up' }, deps);

  store.clearDecline('feedback-aaa', deps);

  assert.equal(store.lookupDecline('feedback-aaa', deps), null);
  assert.notEqual(store.lookupDecline('reflect-bbb', deps), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/declined-learning/store.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/lib/declined-learning/store'`

- [ ] **Step 3: Implement the store module**

Create `plugin/bin/lib/declined-learning/store.js`:

```js
// plugin/bin/lib/declined-learning/store.js
// One shared, project-local declined-learning store — see docs/skill-graph.md's `feedback` and
// `reflect`/`wrap-up` sections for the citing skills; this header states the degrade-open
// contract once, per CLAUDE.md's cross-reference rule.
//
// Records fingerprints of findings/insights a human explicitly declined, so a later run can
// annotate a re-surfaced match ("previously declined {date}: {reason}") instead of presenting
// it as a fresh proposal. One flat, non-per-consumer file (unlike
// bin/lib/transcript-judge/watermark.js's per-consumer subdirectories) because every entry
// already carries a `source` field distinguishing origin — nothing needs path-level isolation.
//
// readStore degrades open: a missing or corrupt store file returns {}, never a throw — the same
// contract as watermark.js's readWatermark. writeStore (and therefore recordDecline/clearDecline,
// which read-modify-write through it) lets a real write failure propagate; the caller decides how
// to degrade. Every fs call is an injectable default param so tests never touch real disk.
'use strict';

const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join('.claude-tweaks', 'declined-learning', 'store.json');

// Pure — the store has exactly one on-disk location; no per-transcript/per-consumer derivation.
function storePath() {
  return STORE_PATH;
}

// Returns the parsed store object, or {} when none exists (ENOENT), the file is present but not
// valid JSON, or the parsed value isn't a plain object (corrupt/foreign content == empty store,
// degrade-open contract).
function readStore({ readFile = fs.readFileSync } = {}) {
  try {
    const raw = readFile(storePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Overwrites the whole store with `data`. Creates the containing directory if needed. Throws on
// a real failure (permissions, disk full, etc.) — this module doesn't silently eat the error.
function writeStore(data, { mkdirSync = fs.mkdirSync, writeFile = fs.writeFileSync } = {}) {
  const p = storePath();
  mkdirSync(path.dirname(p), { recursive: true });
  writeFile(p, JSON.stringify(data, null, 2));
}

// Records (or overwrites) a decline entry for `fingerprint`. Read-modify-write through
// readStore/writeStore, so it inherits both their degrade-open (read) and propagate (write)
// behavior. Returns the entry that was written.
function recordDecline(fingerprint, { reason = null, source, declinedAt = new Date().toISOString() } = {}, deps = {}) {
  const current = readStore(deps);
  const entry = { declinedAt, reason, source };
  current[fingerprint] = entry;
  writeStore(current, deps);
  return entry;
}

// The annotation-lookup function: returns the stored { declinedAt, reason, source } entry for
// `fingerprint`, or null when no decline is on record. Never throws — readStore already
// degrades open.
function lookupDecline(fingerprint, deps = {}) {
  const current = readStore(deps);
  return Object.prototype.hasOwnProperty.call(current, fingerprint) ? current[fingerprint] : null;
}

// All declined fingerprints, optionally filtered to one `source`. Consumed by feedback's
// watermark write to populate `dismissedFingerprints` (session-evaluation.md).
function listDeclinedFingerprints({ source } = {}, deps = {}) {
  const current = readStore(deps);
  const keys = Object.keys(current);
  return source ? keys.filter((k) => current[k] && current[k].source === source) : keys;
}

// Removes a decline entry — "approving it anyway clears the entry" (a human re-affirms a
// previously-declined finding/insight, so it should surface as fresh next time rather than
// staying annotated forever). No-op (no write) when the fingerprint has no entry, so an
// idempotent clear never touches disk twice. Returns whether an entry was actually removed.
function clearDecline(fingerprint, deps = {}) {
  const current = readStore(deps);
  if (!Object.prototype.hasOwnProperty.call(current, fingerprint)) return false;
  delete current[fingerprint];
  writeStore(current, deps);
  return true;
}

module.exports = {
  storePath,
  readStore,
  writeStore,
  recordDecline,
  lookupDecline,
  listDeclinedFingerprints,
  clearDecline,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/declined-learning/store.test.js`
Expected: PASS, all tests green

- [ ] **Step 5: Add the gitignore entry**

Modify `.gitignore` — insert a new line in the existing per-skill block (the comment above the
block already reads "Listed individually, never as a blanket `.claude-tweaks/` rule..."):

```diff
 .claude-tweaks/feedback/
+.claude-tweaks/declined-learning/
 .claude-tweaks/routine-environment-cache.yml
```

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/declined-learning/store.js tests/bin-lib/declined-learning/store.test.js .gitignore
git commit -m "Add declined-learning fingerprint store module (refs #849)"
```

---

### Task 2: Watermark offset clause carries dismissed fingerprints

**Files:**
- Modify: `plugin/bin/lib/transcript-judge/watermark.js` (`formatOffsetClause`, lines 83-93)
- Modify: `tests/bin-lib/transcript-judge/watermark.test.js` (the 3 existing `formatOffsetClause` tests, lines 160-178)
- Modify: `plugin/skills/_shared/transcript-judge.md` (the literal fenced clause text, lines 89-98)

**Interfaces:**
- Consumes: nothing new from Task 1 (this task only touches `watermark.js`).
- Produces: `formatOffsetClause({ bytesAtDispatch, line, filedRecords, dismissedFingerprints })` → `string` — the `dismissedFingerprints` param is new and optional (defaults to empty, renders `none`), used by Task 3.

- [ ] **Step 1: Update the existing formatOffsetClause tests for the new literal wording**

In `tests/bin-lib/transcript-judge/watermark.test.js`, replace the three `formatOffsetClause`
tests (the `// ---- formatOffsetClause ----` section, lines 160-178) with:

```js
// ---- formatOffsetClause ------------------------------------------------------

test('formatOffsetClause: exact literal wording, with filed records and dismissed fingerprints', () => {
  const s = watermark.formatOffsetClause({
    bytesAtDispatch: 6815744,
    line: 41203,
    filedRecords: ['#681', '#682'],
    dismissedFingerprints: ['feedback-deadbeef', 'feedback-c0ffee'],
  });
  assert.equal(
    s,
    'Evaluate from byte offset 6815744 (line 41203); these records already exist: #681, #682; '
    + 'omit findings they cover. These fingerprints were previously declined: feedback-deadbeef, '
    + 'feedback-c0ffee; omit findings matching them.',
  );
});

test('formatOffsetClause: empty filedRecords and dismissedFingerprints render "none"', () => {
  const s = watermark.formatOffsetClause({ bytesAtDispatch: 100, line: 3, filedRecords: [], dismissedFingerprints: [] });
  assert.equal(
    s,
    'Evaluate from byte offset 100 (line 3); these records already exist: none; omit findings they cover. '
    + 'These fingerprints were previously declined: none; omit findings matching them.',
  );
});

test('formatOffsetClause: missing filedRecords and dismissedFingerprints (both undefined) also render "none"', () => {
  const s = watermark.formatOffsetClause({ bytesAtDispatch: 50, line: 1 });
  assert.match(s, /records already exist: none;/);
  assert.match(s, /previously declined: none;/);
});

test('formatOffsetClause: dismissedFingerprints present, filedRecords empty — independent segments', () => {
  const s = watermark.formatOffsetClause({ bytesAtDispatch: 10, line: 1, filedRecords: [], dismissedFingerprints: ['reflect-abc12345'] });
  assert.match(s, /records already exist: none;/);
  assert.match(s, /previously declined: reflect-abc12345;/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/transcript-judge/watermark.test.js`
Expected: FAIL on the 4 `formatOffsetClause` tests — actual string lacks the new sentence.

- [ ] **Step 3: Extend formatOffsetClause**

In `plugin/bin/lib/transcript-judge/watermark.js`, replace the trailing comment block and the
`formatOffsetClause` function (lines 83-93 of the file as it stands before this task) with:

```js
// The literal contract-text embedded verbatim as a judge-dispatch prompt item in
// plugin/skills/_shared/transcript-judge.md when a watermark exists for the resolved transcript.
// Exact wording (quote precisely downstream):
//
//   Evaluate from byte offset {bytesAtDispatch} (line {line}); these records already exist:
//   {filedRecords joined by ", ", or "none"}; omit findings they cover. These fingerprints were
//   previously declined: {dismissedFingerprints joined by ", ", or "none"}; omit findings
//   matching them.
function formatOffsetClause({ bytesAtDispatch, line, filedRecords, dismissedFingerprints }) {
  const records = Array.isArray(filedRecords) && filedRecords.length > 0 ? filedRecords.join(', ') : 'none';
  const declined = Array.isArray(dismissedFingerprints) && dismissedFingerprints.length > 0 ? dismissedFingerprints.join(', ') : 'none';
  return `Evaluate from byte offset ${bytesAtDispatch} (line ${line}); these records already exist: ${records}; `
    + `omit findings they cover. These fingerprints were previously declined: ${declined}; omit findings matching them.`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/transcript-judge/watermark.test.js`
Expected: PASS, all tests green (including the unrelated `watermarkPath`/`readWatermark`/
`writeWatermark`/`byteOffsetToLine` tests, unaffected by this change)

- [ ] **Step 5: Update the shared doc's literal fenced block**

In `plugin/skills/_shared/transcript-judge.md`, replace the fenced block at lines 93-95:

```diff
    ```
-   Evaluate from byte offset {bytesAtDispatch} (line {line}); these records already exist: {filedRecords joined by ", " or "none" if empty}; omit findings they cover.
+   Evaluate from byte offset {bytesAtDispatch} (line {line}); these records already exist: {filedRecords joined by ", " or "none" if empty}; omit findings they cover. These fingerprints were previously declined: {dismissedFingerprints joined by ", " or "none" if empty}; omit findings matching them.
    ```
```

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/transcript-judge/watermark.js tests/bin-lib/transcript-judge/watermark.test.js plugin/skills/_shared/transcript-judge.md
git commit -m "Extend watermark offset clause with dismissed-fingerprint segment (refs #849)"
```

---

### Task 3: Wire /feedback's decline path to the store

**Files:**
- Modify: `plugin/skills/_shared/upstream-feedback-batch.md` (`## Declining an item`, lines 50-63)
- Modify: `plugin/skills/feedback/session-evaluation.md` (`## Watermark payload`, lines 41-57)
- Modify: `docs/skill-graph.md` (`## feedback` section, insert one new row)

**Interfaces:**
- Consumes: `plugin/bin/lib/declined-learning/store.js`'s `recordDecline(fingerprint, { reason, source, declinedAt })` and `listDeclinedFingerprints({ source })` (Task 1); `bin/lib/feedback/file-feedback.js`'s existing `computeFingerprint(draft)` (unchanged, already exported).

This task edits skill-prose files only — no new runnable test file. Verification is by grep
(the prose contains the exact new instruction) rather than `node --test`, since these are
markdown procedures an agent follows at runtime, not code under test. `node --test` still runs
in Step 3 below to prove Tasks 1-2's code is untouched by this task.

- [ ] **Step 1: Add the decline-recording instruction to `_shared/upstream-feedback-batch.md`**

Replace the `## Declining an item` section (lines 50-63) with:

```markdown
## Declining an item

An unchecked item is logged as declined, never silently dropped. **First, in every branch
below:** compute the item's fingerprint via `bin/lib/feedback/file-feedback.js`'s
`computeFingerprint(draft)` (the same fingerprint `/feedback`'s own filing step would have
embedded had this item been checked instead) and record the decline via
`bin/lib/declined-learning/store.js`'s `recordDecline(fingerprint, { reason, source: 'feedback' })`
— `reason` is the user's stated reason when the caller collected one (the wrap-up/multi-spec
console path below), or the literal string `'declined, no reason given'` otherwise. A decline
write failure degrades open exactly like a watermark write failure (`_shared/transcript-judge.md`'s
"On a write failure" line) — log it as a one-line note and continue; never abort the batch over it.

Then, per branch:

- **`/feedback --queue` (direct invocation):** post a comment on that item's local
  `upstream-candidate` issue — `"Declined via /claude-tweaks:feedback batch review, {date}"` —
  and leave the issue open. Visible context for a future run.
- **Wrap-up / multi-spec console path:** log the decline to the originating run's `decisions.md`
  with the user's stated reason, or `"declined, no reason given"` when none was offered — the
  same convention the console's `Q#`/`M#` sections already use.
- **Direct single-item invocation (no `--queue`, not from a console):** the single-chunk case
  still renders one confirm; not checking the item (or declining to submit) means nothing is
  filed — the learning stays local, reported as declined at `/feedback`'s Step 9. No comment is
  posted anywhere — there is no local `upstream-candidate` issue to comment on in this path.
```

- [ ] **Step 2: Update the watermark payload doc to read dismissedFingerprints from the store**

In `plugin/skills/feedback/session-evaluation.md`, replace lines 41-57 (`## Watermark payload`)
with:

```markdown
## Watermark payload

On a `DONE`/`DONE_WITH_CONCERNS` return (per `_shared/transcript-judge.md`'s watermark protocol,
consumer key `feedback`), the payload is:

```
{
  transcriptPath,
  bytesAtDispatch,
  evaluatedAt,
  filedRecords,            // the record numbers this run actually filed, from Step 8
  dismissedFingerprints,   // bin/lib/declined-learning/store.js's
                           // listDeclinedFingerprints({ source: 'feedback' }) — every fingerprint
                           // a human declined at Step 7 across every /feedback run to date, not
                           // just this one. Filtered to source: 'feedback' so a reflect-sourced
                           // decline never suppresses a feedback finding by accident.
}
```
```

- [ ] **Step 3: Run the full test suite to confirm Tasks 1-2's code is unaffected**

Run: `node --test tests/bin-lib/declined-learning/store.test.js tests/bin-lib/transcript-judge/watermark.test.js`
Expected: PASS, all tests green (this task made no code changes, prose only)

- [ ] **Step 4: Add the skill-graph edge**

In `docs/skill-graph.md`'s `## feedback` section, insert a new row after the
`_shared/transcript-judge.md` row (after line 217):

```diff
 | `_shared/transcript-judge.md` | Step "session-evaluation" dispatch mechanics (transcript resolution, judge dispatch, slicing, degradation, watermark protocol) cite this shared harness instead of restating it — consumer key `feedback`. |
+| `bin/lib/declined-learning/store.js` | Step 7's decline path (`_shared/upstream-feedback-batch.md`'s "Declining an item") records every declined finding's fingerprint here; `session-evaluation.md`'s watermark payload populates `dismissedFingerprints` from `listDeclinedFingerprints({ source: 'feedback' })` instead of a hardcoded empty array. |
 | `bin/resolve-profile.js` | The session-evaluation judge dispatches as one `[Use: Frontier]` singleton Task agent per invocation (dispatched per `session-evaluation.md`, the standalone-invocation cap — no `--run-dir`, since this skill is typically invoked with no pipeline run directory) — record #221. Step 6's scrub judgment now resolves `[Use: Capable]` instead. |
```

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/upstream-feedback-batch.md plugin/skills/feedback/session-evaluation.md docs/skill-graph.md
git commit -m "Wire /feedback's decline path to the declined-learning store (refs #849)"
```

---

### Task 4: Wire /wrap-up's reflect insight resolution to the store

**Files:**
- Modify: `plugin/skills/reflect/full-mode.md` (Step 3's table-generation preamble and the
  "Don't capture" bullet, around lines 94-146)
- Modify: `docs/skill-graph.md` (`## reflect` section, insert one new row)

**Interfaces:**
- Consumes: `plugin/bin/lib/declined-learning/store.js`'s `recordDecline`, `lookupDecline`, and
  `clearDecline` (Task 1); `plugin/bin/lib/health-core/fingerprint.js`'s `createFingerprint`
  (existing, unchanged) — this task's own convention: `createFingerprint('reflect',
  ['description']).fingerprint({ description: insight text })`.

This task edits skill-prose only, same verification approach as Task 3 (grep + a full-suite
`node --test` proving no code regressed).

- [ ] **Step 1: Annotate previously-declined insights before rendering the table**

In `plugin/skills/reflect/full-mode.md`, insert a new subsection immediately before the
`### Reflection Insights` table-generation instructions (before line 94's "Collect all insights
from the five lenses and the tradeoff review into a single table:"):

```markdown
### Prior-decline annotation

Before rendering the table, compute each insight's fingerprint —
`bin/lib/health-core/fingerprint.js`'s `createFingerprint('reflect', ['description']).fingerprint({ description })`,
where `description` is the insight's own one-line text — and look it up via
`bin/lib/declined-learning/store.js`'s `lookupDecline(fingerprint)`. A match means a human
already declined an equivalent insight before; render it with a prior-decline annotation
appended to its `Insight` cell, never silently suppressed:

```
{insight text} _(previously declined {declinedAt date}: {reason})_
```

The insight still gets a full row and a real recommendation — the annotation is a hint for the
human's decision, not a filter. If the human resolves an annotated insight to anything other
than "Don't capture" (i.e. approves it — Implement now, Defer, or Capture), clear the stale
decline via `bin/lib/declined-learning/store.js`'s `clearDecline(fingerprint)` immediately after
applying that resolution, so the same insight text doesn't stay annotated once a human has
re-affirmed it.
```

- [ ] **Step 2: Record a decline when an insight resolves to "Don't capture"**

In `plugin/skills/reflect/full-mode.md`, replace the "Don't capture" bullet (line 146):

```diff
-- **Don't capture** — only for insights that are genuinely not actionable (one-off observations, context-specific facts, things already documented elsewhere). Must state why.
+- **Don't capture** — only for insights that are genuinely not actionable (one-off observations, context-specific facts, things already documented elsewhere). Must state why. Record the decline via `bin/lib/declined-learning/store.js`'s `recordDecline(fingerprint, { reason, source: 'wrap-up' })` — `fingerprint` from the Prior-decline annotation step above, `reason` the stated why. A decline write failure degrades open — log a one-line note and continue; never block the batch resolution over it.
```

- [ ] **Step 3: Run the full test suite to confirm Tasks 1-2's code is unaffected**

Run: `node --test tests/bin-lib/declined-learning/store.test.js tests/bin-lib/transcript-judge/watermark.test.js`
Expected: PASS, all tests green (this task made no code changes, prose only)

- [ ] **Step 4: Add the skill-graph edge**

In `docs/skill-graph.md`'s `## reflect` section, insert a new row after the `_shared/transcript-judge.md` row:

```diff
 | `_shared/transcript-judge.md` | Step 2's standalone singleton dispatch reads the transcript via this shared harness — consumer key `reflect` — record #857. Component-invoked path is unaffected (no dispatch, no transcript read). |
+| `bin/lib/declined-learning/store.js` | `full-mode.md`'s Prior-decline annotation step looks up each insight's fingerprint (`bin/lib/health-core/fingerprint.js`'s `createFingerprint('reflect', ['description'])`) before rendering the Reflection Insights table, annotating a match instead of presenting a fresh proposal; resolving an insight "Don't capture" records the decline (`source: 'wrap-up'`), resolving it any other way clears a stale one. |
 | `bin/lib/hooks/pre-tool-use.js`, `bin/lib/hooks/post-tool-use.js`, and `bin/lib/hooks/subagent-stop.js` | The Friction lens (`full-mode.md`/`light-mode.md`) reads denial events (`wd-deny`, `gate-denial`) logged by the first, the `ask-user-question` event logged by the second, and the `contract-violation` event logged by the third as its input source. |
```

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/reflect/full-mode.md docs/skill-graph.md
git commit -m "Wire /wrap-up's reflect insight resolution to the declined-learning store (refs #849)"
```
