# Trust Ladder: Merged-Unreverted Operational Outcomes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `bin/lib/issues/trust.js` a second, independent way for a closed work record's outcome to become "known" — merged and unreverted for at least `trust-revert-window-days` (default 14) — alongside the existing `/demo`-descent disposition evidence, so classes with no acceptance-verdict discipline yet can still clear the trust ladder's `MIN_VERDICTS` floor from supervised-loop history that already exists.

**Architecture:** Extend the existing pure evidence engine, don't replace it. `trustRows` gains three new trailing parameters — an injected `gitLog`, an injected clock (`now`), and a `policy` object — all optional and backward-compatible with every existing single-argument call site. A record's outcome resolution tries `demo:*` disposition first (unchanged); only when that finds nothing does it try the new operational path: closed state + `closedAt` age past the window, a closing commit discoverable via a GitHub-timeline reference (route 1, caller-supplied) or a `(refs|closes|fixes) #N` commit-message scan over the injected git log (route 2), and no revert of any of that record's closing commits (trailer-based, with a subject-based fallback for squash/rebase-rewritten SHAs). A new `operationalGood` counter sits inside the existing cell alongside `approved`/`changesRequested`/`undispositioned`, folding into the same `dispositioned` sum and the same `MIN_VERDICTS` floor the demo-descent path already uses — no parallel store, no new verdict states. Malformed-value coercion for the new `trust-revert-window-days` policy key is centralized in `bin/lib/policy-schema.js` (a new `resolveValue(key, rawValue)` export built on the module's existing `isValidValue`), so `trust.js` calls it once and never re-validates. Because the row shape (`operationalGood`) changes, the production renderer `skills/_shared/trust-table.md` — the single Fetch/Render procedure every real consumer (`/claude-tweaks:help`, `/claude-tweaks:backlog overview`, `/claude-tweaks:backlog refine`) either inlines or cites — is updated in the same change-set to shell the integration-branch git log and pass it through, so the feature is live in production the day this ships, not merely present in a module nothing calls with real data.

**Tech Stack:** Plain Node (`node --test`), no new dependencies. Touches `bin/lib/issues/trust.js`, `bin/lib/issues/tests/trust.test.js`, `bin/lib/policy-schema.js`, `tests/policy-schema.test.js`, `skills/_shared/policy-schema.md`, `skills/_shared/autonomy-ceiling.md`, `skills/_shared/trust-table.md`, `skills/backlog/refine-mode.md`, `skills/capture/SKILL.md`.

## Global Constraints

- **Fail closed, never fail open.** A record where neither closing-commit-discovery route finds anything stays `unknown` (folds into `undispositioned`) — never defaults to known-good. A record still `OPEN` (including one reopened after a close) contributes nothing.
- **All-or-nothing revert rule.** Any one reverted closing commit disqualifies the *whole* record, even when other closing commits for the same record were not reverted (conservative direction, multi-commit records are not partial credit).
- **The window anchors on the record's tracker `closedAt`** — never a git commit date, never a PR `merged_at` (this repo has no PR for a direct-push close, and its squash/rebase conventions rewrite commit dates). A record's `closedAt` on GitHub is always its *latest* close; a currently-reopened record has `state !== 'CLOSED'` and is excluded before operational resolution ever runs.
- **No new scheduled job, no cached verdict file.** Everything is computed lazily at read time from an injected `(gitLog, now, policy)` — retroactivity is a property of that laziness, not a migration step.
- **This leaf only detects reverts to decide known-good vs. not-countable — never negative evidence.** A reverted operational close must never move a class from `clean` toward `mixed` by itself; it simply stops counting as known-good. (The companion "failure classifications and reverts" leaf owns negative evidence — out of scope here.)
- **Never invent a parallel evidence store.** Extend the existing `cell` object trustRows already builds; the new `operationalGood` counter must fold into the existing `dispositioned`/`MIN_VERDICTS`/`coverage` computation, not a second one.
- **Frozen fixtures only (IL-80).** Every test in this plan constructs its own records, git log entries, and clock value — never reads live repo history, never calls `Date.now()` inside an assertion.
- **No `2>/dev/null` while exploring (IL-91), no health CLI invoked with real arguments during development (IL-73).**
- **File-overlap ordering with #219 on `bin/lib/policy-schema.js` / `skills/_shared/policy-schema.md`:** re-read both files immediately before editing them (Task 1) — if #219 landed first, re-merge your addition into its current state rather than overwriting (IL-109).
- **A row-shape change to `trust.js` moves together with `skills/_shared/trust-table.md`'s Render section in the same change-set (IL-60)** — the two must never land in different commits.

---

## File Structure

| File | Responsibility |
|---|---|
| `bin/lib/policy-schema.js` | Adds the `trust-revert-window-days` schema entry and the new `resolveValue(key, rawValue)` coercion export. |
| `tests/policy-schema.test.js` | Tests for the new schema entry and `resolveValue`. |
| `skills/_shared/policy-schema.md` | New Config Lever Index row for `trust-revert-window-days`. |
| `bin/lib/issues/trust.js` | The evidence engine: closing-commit discovery, revert detection, operational outcome resolution, and `trustRows`'s extended signature/aggregation. |
| `bin/lib/issues/tests/trust.test.js` | Fixture-driven unit and integration tests for everything added to `trust.js`. |
| `skills/_shared/autonomy-ceiling.md` | Contract doc — swept for stale "demo verdicts are the only evidence" prose. |
| `skills/_shared/trust-table.md` | Production Fetch/Render procedure — wired to shell the integration-branch git log and pass it (plus the resolved policy) into `trustRows`; Render section gains the `Operational` column. |
| `skills/backlog/refine-mode.md` | Its own second `trustRows` call (Trust signal) reuses the git log `trust-table.md`'s Fetch section already wrote, instead of computing a weaker, inconsistent verdict next to the one just rendered. |
| `skills/capture/SKILL.md` | Its own independent, smaller `trustRows` call gets its own git-log shell-out so the born-`ready` grant check benefits from operational evidence too. |

---

## Task Breakdown

### Task 1: `trust-revert-window-days` policy key + centralized coercion helper

**Files:**
- Modify: `bin/lib/policy-schema.js`
- Modify: `tests/policy-schema.test.js`
- Modify: `skills/_shared/policy-schema.md`

**Interfaces:**
- Produces: `resolveValue(key: string, rawValue: string | number | undefined | null) -> any` — exported from `bin/lib/policy-schema.js`. For a recognized key: `rawValue` absent/empty resolves to the schema entry's `default`; a value that fails `isValidValue` resolves to `default`; a valid `'integer'` value is returned `parseInt`'d; a valid `'boolean'` value is returned as an actual boolean; anything else is returned unchanged. An unrecognized `key` returns `rawValue` unchanged (nothing to coerce against).
- Produces: a new `POLICY_KEYS` entry `{ key: 'trust-revert-window-days', type: 'integer', min: 1, default: 14 }`.
- Consumes: nothing new — builds on the existing `POLICY_KEYS` array and `isValidValue` function already in the file.

- [ ] **Step 1: Re-read the live files before editing (file-overlap check with #219)**

```bash
grep -n "trust-revert-window-days\|POLICY_KEYS = \[" bin/lib/policy-schema.js
```

Expected: no `trust-revert-window-days` line yet, and `POLICY_KEYS = [` still present near the top. If `#219`'s model-profile keys already landed, they add entries elsewhere in the array — do not overwrite them; add your entry alongside.

- [ ] **Step 2: Write the failing schema test**

Add to `tests/policy-schema.test.js`, after the existing `test('doc-convention.adr is an enum with no default ...')` block:

```javascript
test('trust-revert-window-days is a recognized integer key with a floor of 1, defaulting to 14', () => {
  const key = POLICY_KEYS.find((k) => k.key === 'trust-revert-window-days');
  assert.ok(key, 'trust-revert-window-days missing from POLICY_KEYS');
  assert.strictEqual(key.type, 'integer');
  assert.strictEqual(key.min, 1);
  assert.strictEqual(key.default, 14);

  const repo = tmpRepo();
  writePolicy(repo, 'trust-revert-window-days: 21\n');
  assert.deepStrictEqual(auditPolicy(repo).invalidValues, []);

  const bad = tmpRepo();
  writePolicy(bad, 'trust-revert-window-days: 0\n');
  const result = auditPolicy(bad);
  assert.strictEqual(result.invalidValues.length, 1, '0 is below the floor of 1 and must be flagged');
  assert.strictEqual(result.invalidValues[0].key, 'trust-revert-window-days');

  const negative = tmpRepo();
  writePolicy(negative, 'trust-revert-window-days: -5\n');
  assert.strictEqual(auditPolicy(negative).invalidValues.length, 1, 'a negative value must be flagged too');
});
```

Also bump the existing entries-count assertion — `trust-revert-window-days` is a 35th key:

```javascript
test('POLICY_KEYS entries are unique', () => {
  assert.strictEqual(POLICY_KEYS.length, 35);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 35);
});
```

Change the top-of-file import to also pull in `resolveValue` (it does not exist yet — this is what makes the next block fail):

```javascript
const { POLICY_KEYS, auditPolicy, resolveValue } = require('../bin/lib/policy-schema');
```

Add the `resolveValue` tests at the end of the file:

```javascript
test('resolveValue falls back to the schema default when the raw value is absent', () => {
  assert.strictEqual(resolveValue('trust-revert-window-days', undefined), 14);
  assert.strictEqual(resolveValue('trust-revert-window-days', null), 14);
  assert.strictEqual(resolveValue('trust-revert-window-days', ''), 14);
});

test('resolveValue coerces a valid raw value to a number', () => {
  assert.strictEqual(resolveValue('trust-revert-window-days', '21'), 21);
  assert.strictEqual(resolveValue('trust-revert-window-days', 21), 21);
});

test('resolveValue falls back to the default on a malformed integer — zero, negative, non-integer', () => {
  assert.strictEqual(resolveValue('trust-revert-window-days', '0'), 14);
  assert.strictEqual(resolveValue('trust-revert-window-days', 0), 14);
  assert.strictEqual(resolveValue('trust-revert-window-days', '-5'), 14);
  assert.strictEqual(resolveValue('trust-revert-window-days', 'abc'), 14);
});

test('resolveValue passes an unrecognized key through unchanged', () => {
  assert.strictEqual(resolveValue('made-up-lever', 'anything'), 'anything');
});

test('resolveValue never throws on a malformed value of any type', () => {
  assert.doesNotThrow(() => resolveValue('trust-revert-window-days', {}));
  assert.doesNotThrow(() => resolveValue('trust-revert-window-days', ['x']));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/policy-schema.test.js`
Expected: FAIL — `POLICY_KEYS.length` is `34` not `35`, `resolveValue` is `undefined` (destructured from a module that doesn't export it yet).

- [ ] **Step 3: Implement — add the policy key**

In `bin/lib/policy-schema.js`, add a new entry to `POLICY_KEYS` immediately after the `autonomy` entry:

```javascript
  { key: 'autonomy', type: 'enum', values: ['supervised', 'trusted', 'unattended'], default: 'supervised' },
  { key: 'trust-revert-window-days', type: 'integer', min: 1, default: 14 },
  { key: 'doc-convention.adr', type: 'enum', values: ['plugin', 'project'] },
```

- [ ] **Step 4: Implement — extend `isValidValue`'s integer case with an optional `min`/`max`**

Replace:

```javascript
    case 'integer':
      return /^-?\d+$/.test(value);
```

with:

```javascript
    case 'integer':
      return /^-?\d+$/.test(value)
        && (schemaEntry.min === undefined || Number(value) >= schemaEntry.min)
        && (schemaEntry.max === undefined || Number(value) <= schemaEntry.max);
```

This is backward-compatible: every existing `'integer'` entry has no `min`/`max`, so both new clauses short-circuit to `true` for them and nothing about their validation changes.

- [ ] **Step 5: Implement — add `resolveValue`**

Add this function immediately after `isValidValue` (before `auditPolicy`):

```javascript
// key, rawValue (string | number | undefined | null) -> the coerced, valid
// value for that key: `rawValue` itself when it type-checks (parsed to a
// number for 'integer', to a boolean for 'boolean'), the schema's own
// `default` when `rawValue` is absent/empty or fails validation, or
// `rawValue` unchanged when `key` names no known lever (nothing to coerce
// against). The one place malformed-value coercion is decided for a
// programmatic (non-audit) reader — a caller with a raw policy.yml string
// (or nothing at all) calls this once and trusts what comes back without
// re-validating it itself.
function resolveValue(key, rawValue) {
  const entry = POLICY_KEYS.find((e) => e.key === key);
  if (!entry) return rawValue;
  if (rawValue === undefined || rawValue === null || rawValue === '') return entry.default;
  const strValue = String(rawValue);
  if (!isValidValue(entry, strValue)) return entry.default;
  if (entry.type === 'integer') return parseInt(strValue, 10);
  if (entry.type === 'boolean') return strValue === 'true';
  return rawValue;
}
```

- [ ] **Step 6: Implement — export it**

Replace:

```javascript
module.exports = { POLICY_KEYS, auditPolicy };
```

with:

```javascript
module.exports = { POLICY_KEYS, auditPolicy, resolveValue };
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/policy-schema.test.js`
Expected: PASS, all tests green.

- [ ] **Step 8: Document the lever**

In `skills/_shared/policy-schema.md`, insert a new row into the "Project facts" table immediately after the `autonomy` row (the last row of that table, just before the `## Dispatch & merge` heading):

```markdown
| `trust-revert-window-days` | `policy.yml` | `bin/lib/issues/trust.js` (evidence engine), consumed by `_shared/trust-table.md`'s Fetch section | `14` | Minimum age in days since a closed record's tracker `closed_at` before its unreverted closing commit(s) count as known-good **operational** evidence in the trust table, alongside `demo:*` disposition evidence — see `_shared/autonomy-ceiling.md`. A malformed value (`0`, negative, non-integer) falls back to the default rather than throwing |
```

- [ ] **Step 9: Commit**

```bash
git add bin/lib/policy-schema.js tests/policy-schema.test.js skills/_shared/policy-schema.md
git commit -m "Add trust-revert-window-days policy key + centralized value coercion, refs #267"
```

---

### Task 2: Closing-commit discovery (`discoverClosingCommits`)

**Files:**
- Modify: `bin/lib/issues/trust.js`
- Modify: `bin/lib/issues/tests/trust.test.js`

**Interfaces:**
- Produces: `discoverClosingCommits(record: { number, closingCommitShas? }, gitLog: Array<{ sha: string, message: string }> | undefined) -> string[]` — every commit SHA that closes `record`, `[]` when neither route finds one. `record.closingCommitShas` (caller-supplied, from a GitHub timeline `closed` event) wins outright when non-empty; otherwise every `gitLog` entry whose `message` contains a word-bounded `(refs|closes|fixes) #{record.number}` is collected, in `gitLog`'s given order.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Add to `bin/lib/issues/tests/trust.test.js`, changing the top import to also pull in the new export:

```javascript
const {
  riskBand, trustRows, MIN_SAMPLES, MIN_VERDICTS, discoverClosingCommits,
} = require('../trust.js');
```

Append these tests at the end of the file:

```javascript
test('discoverClosingCommits finds a commit via a word-bounded refs/closes/fixes scan', () => {
  const gitLog = [
    { sha: 'aaaa1111111111111111111111111111111111', message: 'Fix the thing\n\nrefs #42' },
    { sha: 'bbbb2222222222222222222222222222222222', message: 'unrelated commit' },
  ];
  assert.deepEqual(discoverClosingCommits({ number: 42 }, gitLog), ['aaaa1111111111111111111111111111111111']);
});

test('discoverClosingCommits recognizes closes and fixes, not just refs', () => {
  assert.deepEqual(discoverClosingCommits({ number: 7 }, [{ sha: 'sha-a', message: 'closes #7' }]), ['sha-a']);
  assert.deepEqual(discoverClosingCommits({ number: 7 }, [{ sha: 'sha-b', message: 'Fixes #7' }]), ['sha-b']);
});

test('discoverClosingCommits is word-bounded — #427 never matches record #42', () => {
  assert.deepEqual(discoverClosingCommits({ number: 42 }, [{ sha: 'sha-x', message: 'refs #427' }]), []);
});

test('discoverClosingCommits returns every commit that references the record, not just the first', () => {
  const gitLog = [
    { sha: 'sha-1', message: 'refs #9' },
    { sha: 'sha-2', message: 'unrelated' },
    { sha: 'sha-3', message: 'closes #9' },
  ];
  assert.deepEqual(discoverClosingCommits({ number: 9 }, gitLog), ['sha-1', 'sha-3']);
});

test('discoverClosingCommits returns [] when nothing references the record', () => {
  assert.deepEqual(discoverClosingCommits({ number: 1 }, [{ sha: 'sha-1', message: 'refs #999' }]), []);
});

test('discoverClosingCommits returns [] for an empty or missing git log', () => {
  assert.deepEqual(discoverClosingCommits({ number: 1 }, []), []);
  assert.deepEqual(discoverClosingCommits({ number: 1 }, undefined), []);
});

test('discoverClosingCommits prefers a caller-supplied timeline SHA over the git-log scan (route 1 over route 2)', () => {
  const gitLog = [{ sha: 'from-log', message: 'refs #5' }];
  const record = { number: 5, closingCommitShas: ['from-timeline'] };
  assert.deepEqual(discoverClosingCommits(record, gitLog), ['from-timeline']);
});

test('discoverClosingCommits ignores a closingCommitShas array of falsy/empty entries and falls through to route 2', () => {
  const gitLog = [{ sha: 'from-log', message: 'refs #5' }];
  const record = { number: 5, closingCommitShas: [null, ''] };
  assert.deepEqual(discoverClosingCommits(record, gitLog), ['from-log']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: FAIL — `discoverClosingCommits` is not exported yet.

- [ ] **Step 3: Implement**

In `bin/lib/issues/trust.js`, insert this block after `correctiveFollowUpTarget` (the last function before `function trustRows(records) {`) and before the `function trustRows` declaration:

```javascript
// --- Operational outcome evidence (merged-and-unreverted) -----------------
//
// A closed record's outcome becomes known a second way, alongside demo-descent:
// merged and unreverted for at least `trust-revert-window-days` (default 14).
// Evaluated lazily at read time from record state + an injected git log — no
// scheduled job, no cached verdict file. This path only ever ADDS known-good
// evidence; a reverted or undiscoverable close is never negative evidence,
// only not-countable (the companion "failure classifications and reverts"
// leaf owns negative evidence). A record where discovery finds nothing stays
// unknown — never defaults to known-good. That is the coverage boundary this
// module states about itself: a manual revert naming neither a `This
// reverts commit <sha>` trailer nor the record number is an out-of-scope
// false negative.
//
// Route 1 (a GitHub timeline `closed` event's commit reference) needs a
// per-issue GitHub API call this module cannot make itself — it is pure, no
// network. A caller that resolves it attaches the SHA(s) to the record as
// `closingCommitShas` before calling trustRows; discovery below prefers that
// signal outright when present. Route 2 (a commit-message scan for
// `(refs|closes|fixes) #N`, word-bounded) is load-bearing for this repo: its
// own convention writes `refs #N`, which creates no native GitHub close-link,
// so route 1 finds nothing here and route 2 is what actually resolves a
// closing commit.
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_REVERT_WINDOW_DAYS = 14;
const CLOSING_REF_RE = /\b(?:refs|closes|fixes)\s+#(\d+)\b/gi;

// (record, gitLog) -> string[] of closing commit SHAs, [] when neither route
// finds anything. `gitLog` is `[{ sha, message }]` — the integration
// branch's full history, `sha` a full commit SHA and `message` the FULL
// commit message (subject + body), e.g. as `git log --format='%H%x1f%B%x1e'`
// yields once split on the two separator bytes. Route 1 wins outright when
// present; it does not merge with route 2's results.
function discoverClosingCommits(record, gitLog) {
  const fromTimeline = Array.isArray(record && record.closingCommitShas)
    ? record.closingCommitShas.filter((sha) => typeof sha === 'string' && sha)
    : [];
  if (fromTimeline.length > 0) return fromTimeline;

  const log = Array.isArray(gitLog) ? gitLog : [];
  const recordNumber = record && record.number;
  const shas = [];
  for (const entry of log) {
    if (!entry || typeof entry.sha !== 'string' || typeof entry.message !== 'string') continue;
    for (const match of entry.message.matchAll(CLOSING_REF_RE)) {
      if (Number(match[1]) === recordNumber) {
        shas.push(entry.sha);
        break;
      }
    }
  }
  return shas;
}
```

- [ ] **Step 4: Export it**

Replace the module's export line:

```javascript
module.exports = { riskBand, trustRows, MIN_SAMPLES, MIN_VERDICTS };
```

with:

```javascript
module.exports = {
  riskBand, trustRows, MIN_SAMPLES, MIN_VERDICTS, DEFAULT_REVERT_WINDOW_DAYS,
  discoverClosingCommits,
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: PASS, all tests green (existing tests untouched and still passing — nothing about `trustRows` changed yet).

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/trust.js bin/lib/issues/tests/trust.test.js
git commit -m "Add closing-commit discovery (timeline + refs/closes/fixes scan) to trust.js, refs #267"
```

---

### Task 3: Revert detection (`isClosingCommitReverted`)

**Files:**
- Modify: `bin/lib/issues/trust.js`
- Modify: `bin/lib/issues/tests/trust.test.js`

**Interfaces:**
- Produces: `isClosingCommitReverted(closingShas: string[], recordNumber: number, gitLog: Array<{sha, message}>) -> boolean` — `true` if ANY of `closingShas` is named by a `This reverts commit <sha>` trailer anywhere in `gitLog`, OR if any `gitLog` entry's subject starts with `Revert` and its message also references `recordNumber` via the same `(refs|closes|fixes) #N` pattern `discoverClosingCommits` uses (the squash/rebase fallback, IL-45). All-or-nothing: one match among several `closingShas` returns `true` for the whole set.
- Consumes: `CLOSING_REF_RE` (Task 2).

- [ ] **Step 1: Write the failing tests**

Update the top import in `bin/lib/issues/tests/trust.test.js`:

```javascript
const {
  riskBand, trustRows, MIN_SAMPLES, MIN_VERDICTS, discoverClosingCommits, isClosingCommitReverted,
} = require('../trust.js');
```

Append:

```javascript
test('isClosingCommitReverted detects a trailer naming the closing commit', () => {
  const sha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const gitLog = [
    { sha, message: 'refs #1' },
    { sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', message: `Revert "Fix the thing"\n\nThis reverts commit ${sha}.` },
  ];
  assert.equal(isClosingCommitReverted([sha], 1, gitLog), true);
});

test('isClosingCommitReverted falls back to a Revert-subject commit referencing the same record number', () => {
  // Squash/rebase rewrote the SHA, so the trailer no longer names anything in
  // this log — the subject-based fallback is what catches this (IL-45).
  const gitLog = [{ sha: 'revert-sha', message: 'Revert "Fix the thing"\n\nrefs #1' }];
  assert.equal(isClosingCommitReverted(['some-other-sha-not-in-any-trailer'], 1, gitLog), true);
});

test('isClosingCommitReverted is false when nothing reverts the closing commit', () => {
  assert.equal(isClosingCommitReverted(['sha-1'], 1, [{ sha: 'sha-1', message: 'refs #1' }]), false);
});

test('isClosingCommitReverted is all-or-nothing: one reverted commit among several disqualifies all', () => {
  const shaA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const shaB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const gitLog = [
    { sha: shaA, message: 'refs #2' },
    { sha: shaB, message: 'refs #2' },
    { sha: 'cccccccccccccccccccccccccccccccccccccccc', message: `This reverts commit ${shaA}.` },
  ];
  assert.equal(isClosingCommitReverted([shaA, shaB], 2, gitLog), true);
});

test('isClosingCommitReverted returns false for an empty closing-commit list', () => {
  assert.equal(isClosingCommitReverted([], 1, [{ sha: 'x', message: 'This reverts commit x.' }]), false);
});

test('a Revert-subject commit for a DIFFERENT record does not revert this one', () => {
  const gitLog = [{ sha: 'revert-sha', message: 'Revert "Something else"\n\nrefs #999' }];
  assert.equal(isClosingCommitReverted(['sha-1'], 1, gitLog), false);
});

test('isClosingCommitReverted returns false for an empty or missing git log', () => {
  assert.equal(isClosingCommitReverted(['sha-1'], 1, []), false);
  assert.equal(isClosingCommitReverted(['sha-1'], 1, undefined), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: FAIL — `isClosingCommitReverted` is not exported yet.

- [ ] **Step 3: Implement**

In `bin/lib/issues/trust.js`, insert immediately after `discoverClosingCommits` (still before `trustRows`):

```javascript
const REVERT_TRAILER_RE = /This reverts commit ([0-9a-f]{7,40})/gi;
const REVERT_SUBJECT_RE = /^Revert\b/i;

// (closingShas, recordNumber, gitLog) -> boolean. All-or-nothing: any one
// reverted closing commit disqualifies the whole record (multi-commit
// records are conservative-direction, never partial credit). Two detectors,
// checked per log entry:
//   (a) a `This reverts commit <sha>` trailer naming one of closingShas —
//       matched by SHA prefix in either direction, since `git revert` writes
//       the full SHA but a caller-supplied timeline SHA might be shortened.
//   (b) a revert-shaped commit (subject starting `Revert`) whose message
//       also references the same record number — the fallback for
//       squash/rebase-rewritten SHAs, where the trailer's named SHA no
//       longer matches anything in the (rewritten) log (IL-45).
// A manual revert with neither signal is the module's own stated coverage
// boundary (see the header comment above discoverClosingCommits).
function isClosingCommitReverted(closingShas, recordNumber, gitLog) {
  const shas = Array.isArray(closingShas) ? closingShas.filter(Boolean) : [];
  if (shas.length === 0) return false;
  const log = Array.isArray(gitLog) ? gitLog : [];

  for (const entry of log) {
    if (!entry || typeof entry.message !== 'string') continue;

    for (const match of entry.message.matchAll(REVERT_TRAILER_RE)) {
      const named = match[1].toLowerCase();
      const hit = shas.some((sha) => {
        const lower = String(sha).toLowerCase();
        return lower.startsWith(named) || named.startsWith(lower);
      });
      if (hit) return true;
    }

    const subject = entry.message.split('\n', 1)[0] || '';
    if (REVERT_SUBJECT_RE.test(subject)) {
      for (const match of entry.message.matchAll(CLOSING_REF_RE)) {
        if (Number(match[1]) === recordNumber) return true;
      }
    }
  }
  return false;
}
```

- [ ] **Step 4: Export it**

```javascript
module.exports = {
  riskBand, trustRows, MIN_SAMPLES, MIN_VERDICTS, DEFAULT_REVERT_WINDOW_DAYS,
  discoverClosingCommits, isClosingCommitReverted,
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/trust.js bin/lib/issues/tests/trust.test.js
git commit -m "Add revert detection (trailer + squash/rebase subject fallback) to trust.js, refs #267"
```

---

### Task 4: Operational outcome resolution + injectable clock (`resolveOperationalOutcome`)

**Files:**
- Modify: `bin/lib/issues/trust.js`
- Modify: `bin/lib/issues/tests/trust.test.js`

**Interfaces:**
- Produces: `resolveOperationalOutcome(record: { state, closedAt, number, closingCommitShas? }, gitLog, now: number, windowDays: number) -> { known: false } | { known: true, grade: 'good', source: 'operational' }`. `now` is epoch milliseconds (the injected clock). Returns `{ known: false }` when: `record.state !== 'CLOSED'`; `closedAt` is missing/unparseable; `(now - closedAt) / MS_PER_DAY < windowDays`; no closing commit is discoverable; or the closing commit(s) were reverted.
- Consumes: `discoverClosingCommits` (Task 2), `isClosingCommitReverted` (Task 3), `MS_PER_DAY`/`DEFAULT_REVERT_WINDOW_DAYS` (Task 2).

- [ ] **Step 1: Write the failing tests**

Update the top import:

```javascript
const {
  riskBand, trustRows, MIN_SAMPLES, MIN_VERDICTS, discoverClosingCommits, isClosingCommitReverted,
  resolveOperationalOutcome, DEFAULT_REVERT_WINDOW_DAYS,
} = require('../trust.js');
```

Append (near the top of the new-test section, since later tasks reuse these helpers):

```javascript
const MS_PER_DAY_FIXTURE = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-09T00:00:00Z');

function closedDaysAgo(days) {
  return new Date(NOW - days * MS_PER_DAY_FIXTURE).toISOString();
}

test('DEFAULT_REVERT_WINDOW_DAYS is 14', () => {
  assert.equal(DEFAULT_REVERT_WINDOW_DAYS, 14);
});

test('resolveOperationalOutcome is unknown for a currently-open record', () => {
  const record = { number: 1, state: 'OPEN', closedAt: closedDaysAgo(30) };
  assert.deepEqual(resolveOperationalOutcome(record, [], NOW, 14), { known: false });
});

test('resolveOperationalOutcome is unknown with no closedAt at all', () => {
  const record = { number: 1, state: 'CLOSED' };
  assert.deepEqual(resolveOperationalOutcome(record, [], NOW, 14), { known: false });
});

test('resolveOperationalOutcome counts a merge past the window with a discoverable, unreverted closing commit', () => {
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(15) };
  const gitLog = [{ sha: 'sha-1', message: 'refs #1' }];
  assert.deepEqual(
    resolveOperationalOutcome(record, gitLog, NOW, 14),
    { known: true, grade: 'good', source: 'operational' },
  );
});

test('the window boundary is inclusive at exactly the configured number of days', () => {
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(14) };
  const gitLog = [{ sha: 'sha-1', message: 'refs #1' }];
  assert.equal(resolveOperationalOutcome(record, gitLog, NOW, 14).known, true);
});

test('one day short of the window boundary does not count', () => {
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(13) };
  const gitLog = [{ sha: 'sha-1', message: 'refs #1' }];
  assert.equal(resolveOperationalOutcome(record, gitLog, NOW, 14).known, false);
});

test('resolveOperationalOutcome is unknown with no discoverable closing commit', () => {
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(30) };
  assert.deepEqual(resolveOperationalOutcome(record, [], NOW, 14), { known: false });
});

test('resolveOperationalOutcome is not-countable (unknown) when the closing commit was reverted', () => {
  const sha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(30) };
  const gitLog = [
    { sha, message: 'refs #1' },
    { sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', message: `This reverts commit ${sha}.` },
  ];
  assert.deepEqual(resolveOperationalOutcome(record, gitLog, NOW, 14), { known: false });
});

test('resolveOperationalOutcome respects a widened window passed in explicitly', () => {
  const record = { number: 1, state: 'CLOSED', closedAt: closedDaysAgo(15) };
  const gitLog = [{ sha: 'sha-1', message: 'refs #1' }];
  assert.equal(resolveOperationalOutcome(record, gitLog, NOW, 21).known, false, '15 days is short of a 21-day window');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: FAIL — `resolveOperationalOutcome` is not exported yet.

- [ ] **Step 3: Implement**

In `bin/lib/issues/trust.js`, insert immediately after `isClosingCommitReverted` (still before `trustRows`):

```javascript
// (record, gitLog, now, windowDays) -> { known: false } | { known: true, grade: 'good', source: 'operational' }.
// `now` is epoch milliseconds (the injected clock). The window anchors on
// the record's tracker `closedAt` — never a git commit date or a PR
// `merged_at` (this repo's squash/rebase conventions rewrite commit dates,
// and a direct-push close has no PR at all). `closedAt` on a currently-CLOSED
// record is GitHub's own latest-close timestamp — a record reopened and
// re-closed is evaluated against that latest close with no extra bookkeeping
// here; a record that is currently OPEN never needs to reach this function
// meaningfully, since trustRows only builds cells from records whose `state`
// is `'CLOSED'` in the first place.
function resolveOperationalOutcome(record, gitLog, now, windowDays) {
  if (!record || record.state !== 'CLOSED') return { known: false };
  const closedAtMs = typeof record.closedAt === 'string' ? Date.parse(record.closedAt) : NaN;
  if (!Number.isFinite(closedAtMs)) return { known: false };

  const ageDays = (now - closedAtMs) / MS_PER_DAY;
  if (ageDays < windowDays) return { known: false };

  const closingShas = discoverClosingCommits(record, gitLog);
  if (closingShas.length === 0) return { known: false };

  if (isClosingCommitReverted(closingShas, record.number, gitLog)) return { known: false };

  return { known: true, grade: 'good', source: 'operational' };
}
```

- [ ] **Step 4: Export it**

```javascript
module.exports = {
  riskBand, trustRows, MIN_SAMPLES, MIN_VERDICTS, DEFAULT_REVERT_WINDOW_DAYS,
  discoverClosingCommits, isClosingCommitReverted, resolveOperationalOutcome,
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/trust.js bin/lib/issues/tests/trust.test.js
git commit -m "Add resolveOperationalOutcome with injectable clock and revert window to trust.js, refs #267"
```

---

### Task 5: Wire operational evidence into `trustRows`

**Files:**
- Modify: `bin/lib/issues/trust.js`
- Modify: `bin/lib/issues/tests/trust.test.js`

**Interfaces:**
- Produces: `trustRows(records, gitLog?, now?, policy?) -> Row[]` — `gitLog`, `now`, and `policy` are all optional and backward-compatible; a single-argument call (`trustRows(records)`) behaves byte-for-byte as before, since an absent `gitLog` makes `discoverClosingCommits` always return `[]`. Each row gains an `operationalGood: number` field (folded into `dispositioned` alongside `approved`/`changesRequested`).
- Produces (internal, not exported): `resolveRevertWindowDays(policy) -> number`, calling `resolveValue` from `bin/lib/policy-schema.js` (Task 1) — trust.js never re-validates what comes back.
- Consumes: `resolveOperationalOutcome` (Task 4), `resolveValue` (Task 1, `bin/lib/policy-schema.js`).

- [ ] **Step 1: Write the failing tests**

Append to `bin/lib/issues/tests/trust.test.js` (reuses `NOW`/`closedDaysAgo` from Task 4's block, already in this file):

```javascript
function sha40(n) {
  return n.toString(16).padStart(40, '0');
}

function operationalFixture(number, daysAgo) {
  return {
    number,
    labels: ['by:capture', 'risk:low'],
    body: '',
    state: 'CLOSED',
    closedAt: closedDaysAgo(daysAgo),
  };
}

function commitFor(number) {
  return { sha: sha40(number), message: `refs #${number}` };
}

test('AC1: operational evidence clears MIN_SAMPLES and grades a class that was insufficient-evidence', () => {
  const records = Array.from({ length: MIN_SAMPLES }, (_, i) => operationalFixture(i + 1, 15));
  const gitLog = records.map((r) => commitFor(r.number));

  const short = trustRows(records.slice(0, MIN_SAMPLES - 1), gitLog, NOW, {});
  assert.equal(short[0].verdict, 'insufficient-evidence');

  const full = trustRows(records, gitLog, NOW, {});
  assert.equal(full[0].total, MIN_SAMPLES);
  assert.equal(full[0].operationalGood, MIN_SAMPLES);
  assert.equal(full[0].dispositioned, MIN_SAMPLES);
  assert.equal(full[0].verdict, 'clean');
});

test('AC2: the revert window is inclusive at the boundary, both directions', () => {
  const atBoundaryRecords = Array.from({ length: MIN_SAMPLES }, (_, i) => operationalFixture(i + 1, 14));
  const atBoundaryLog = atBoundaryRecords.map((r) => commitFor(r.number));
  const atBoundary = trustRows(atBoundaryRecords, atBoundaryLog, NOW, {});
  assert.equal(atBoundary[0].operationalGood, MIN_SAMPLES);

  const oneShortRecords = Array.from({ length: MIN_SAMPLES }, (_, i) => operationalFixture(i + 1, 13));
  const oneShortLog = oneShortRecords.map((r) => commitFor(r.number));
  const belowBoundary = trustRows(oneShortRecords, oneShortLog, NOW, {});
  assert.equal(belowBoundary[0].operationalGood, 0);
  assert.equal(belowBoundary[0].undispositioned, MIN_SAMPLES);
});

test('AC3: a reverted closing commit does not count as known-good', () => {
  const record = operationalFixture(1, 30);
  const gitLog = [commitFor(1), { sha: sha40(999), message: `This reverts commit ${sha40(1)}.` }];
  const rows = trustRows([record], gitLog, NOW, {});
  assert.equal(rows[0].operationalGood, 0);
  assert.equal(rows[0].undispositioned, 1);
});

test('AC4: no discoverable closing commit contributes nothing, asserted explicitly', () => {
  const record = operationalFixture(1, 30);
  const rows = trustRows([record], [], NOW, {});
  assert.equal(rows[0].operationalGood, 0);
  assert.equal(rows[0].undispositioned, 1);
});

test('AC5: a configured window widens what counts; the default applies when absent; malformed falls back', () => {
  const record = operationalFixture(1, 15);
  const gitLog = [commitFor(1)];

  const wider = trustRows([record], gitLog, NOW, { 'trust-revert-window-days': 21 });
  assert.equal(wider[0].operationalGood, 0, '15-day-old merge must not count under a 21-day window');

  const defaulted = trustRows([record], gitLog, NOW, {});
  assert.equal(defaulted[0].operationalGood, 1, 'the default (14 days) still applies when the key is absent');

  const malformed = trustRows([record], gitLog, NOW, { 'trust-revert-window-days': 0 });
  assert.equal(malformed[0].operationalGood, 1, 'a malformed value (0) falls back to the default rather than throwing');
});

test('AC7: a reopened-then-reclosed record counts against its latest close; still-open contributes nothing', () => {
  const reclosed = operationalFixture(1, 20);
  const gitLog = [commitFor(1)];
  const closedRows = trustRows([reclosed], gitLog, NOW, {});
  assert.equal(closedRows[0].operationalGood, 1);

  const stillOpen = { ...reclosed, state: 'OPEN' };
  const openRows = trustRows([stillOpen], gitLog, NOW, {});
  assert.equal(openRows.length, 0, 'an open record forms no cell at all — trust is about outcomes');
});

test('AC8: two closing commits, one reverted, disqualifies the whole record (all-or-nothing)', () => {
  const record = { ...operationalFixture(1, 30), closingCommitShas: [sha40(1), sha40(2)] };
  const gitLog = [{ sha: sha40(999), message: `This reverts commit ${sha40(2)}.` }];
  const rows = trustRows([record], gitLog, NOW, {});
  assert.equal(rows[0].operationalGood, 0);
});

test('gotcha: one operational known-good among 39 unknowns must not grade a class clean', () => {
  const good = operationalFixture(1, 30);
  const rest = Array.from({ length: 39 }, (_, i) => operationalFixture(i + 2, 1)); // too young to count
  const records = [good, ...rest];
  const gitLog = [commitFor(1), ...rest.map((r) => commitFor(r.number))];
  const rows = trustRows(records, gitLog, NOW, {});
  assert.equal(rows[0].total, 40);
  assert.equal(rows[0].operationalGood, 1);
  assert.equal(rows[0].dispositioned, 1);
  assert.equal(rows[0].verdict, 'insufficient-evidence', 'MIN_VERDICTS=5 must still gate a single operational sample');
});

test('backward compatibility: trustRows(records) with no gitLog/now/policy behaves exactly as before', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED', closedAt: '2020-01-01T00:00:00Z' },
  ]);
  assert.equal(rows[0].undispositioned, 1);
  assert.equal(rows[0].operationalGood, 0);
  assert.equal(rows[0].verdict, 'insufficient-evidence');
});

test('demo-descent still wins over operational evidence when both are present', () => {
  // A demo:approved record never falls through to the operational path —
  // dispositionState resolves it first, exactly as before this leaf.
  const record = { ...operationalFixture(1, 30), labels: ['by:capture', 'risk:low', 'demo:approved'] };
  const gitLog = [commitFor(1)];
  const rows = trustRows([record], gitLog, NOW, {});
  assert.equal(rows[0].approved, 1);
  assert.equal(rows[0].operationalGood, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: FAIL — `trustRows` does not yet accept `gitLog`/`now`/`policy`, and rows carry no `operationalGood` field (`undefined` on every assertion above).

- [ ] **Step 3: Implement — require `resolveValue`**

At the top of `bin/lib/issues/trust.js`, add to the existing requires:

```javascript
const { resolveProvenance } = require('./provenance.js');
const { dispositionState } = require('./acceptance.js');
const { resolveValue } = require('../policy-schema.js');
```

- [ ] **Step 4: Implement — `resolveRevertWindowDays`**

Insert immediately after `resolveOperationalOutcome` (still before `trustRows`):

```javascript
// raw policy['trust-revert-window-days'] -> a validated integer >= 1.
// Malformed-value coercion is owned centrally by bin/lib/policy-schema.js —
// this is the one place trust.js asks it, and the caller of this function
// (trustRows, below) trusts what comes back without re-checking it.
function resolveRevertWindowDays(policy) {
  const raw = policy && policy['trust-revert-window-days'];
  return resolveValue('trust-revert-window-days', raw);
}
```

- [ ] **Step 5: Implement — extend `trustRows`'s signature and per-record aggregation**

Replace:

```javascript
function trustRows(records) {
  const all = Array.isArray(records) ? records : [];
```

with:

```javascript
function trustRows(records, gitLog, now, policy) {
  const all = Array.isArray(records) ? records : [];
  const clock = Number.isFinite(now) ? now : Date.now();
  const windowDays = resolveRevertWindowDays(policy);
```

Replace the cell-shape object literal:

```javascript
      cell = {
        key,
        kind,
        provenance: `${kind}:${source}`,
        band,
        total: 0,
        approved: 0,
        changesRequested: 0,
        undispositioned: 0,
        notPlanned: 0,
        followUps: 0,
      };
```

with:

```javascript
      cell = {
        key,
        kind,
        provenance: `${kind}:${source}`,
        band,
        total: 0,
        approved: 0,
        changesRequested: 0,
        operationalGood: 0,
        undispositioned: 0,
        notPlanned: 0,
        followUps: 0,
      };
```

Replace the disposition branch:

```javascript
    const disposition = dispositionState(record.labels);
    if (disposition === 'approved') cell.approved += 1;
    else if (disposition === 'changes-requested') cell.changesRequested += 1;
    else cell.undispositioned += 1;
```

with:

```javascript
    const disposition = dispositionState(record.labels);
    if (disposition === 'approved') {
      cell.approved += 1;
    } else if (disposition === 'changes-requested') {
      cell.changesRequested += 1;
    } else {
      // No demo:* disposition — try the operational path before giving up.
      const operational = resolveOperationalOutcome(record, gitLog, clock, windowDays);
      if (operational.known) cell.operationalGood += 1;
      else cell.undispositioned += 1;
    }
```

Replace the `dispositioned` computation inside the rows-mapping step:

```javascript
    const dispositioned = cell.approved + cell.changesRequested;
```

with:

```javascript
    const dispositioned = cell.approved + cell.changesRequested + cell.operationalGood;
```

(The `verdict`/`clean` computation directly below is unchanged — `clean` still means `cell.changesRequested === 0 && cell.followUps === 0`, so operational evidence never itself flips a class toward `mixed`, matching the Global Constraints' "not-countable, never negative evidence" rule.)

- [ ] **Step 6: Export the last new name**

```javascript
module.exports = {
  riskBand, trustRows, MIN_SAMPLES, MIN_VERDICTS, DEFAULT_REVERT_WINDOW_DAYS,
  discoverClosingCommits, isClosingCommitReverted, resolveOperationalOutcome,
};
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: PASS, all tests green — every pre-existing test in this file (written before this leaf) must still pass unchanged, since they all call `trustRows` with a single argument.

- [ ] **Step 8: Verify test discrimination by reverting (AC6, one-time development check, not a committed test)**

```bash
git stash
```

Confirm this reverts every change from Tasks 2-5 (`git diff bin/lib/issues/trust.js` shows nothing). Re-run the suite:

```bash
node --test bin/lib/issues/tests/trust.test.js
```

Expected: every test added in Tasks 2-5 FAILS (they reference exports and behavior that no longer exist), while the pre-existing tests continue to pass. This confirms the new assertions actually discriminate the new logic rather than passing vacuously. Then restore the work:

```bash
git stash pop
```

Re-run once more to confirm everything is back to green:

```bash
node --test bin/lib/issues/tests/trust.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add bin/lib/issues/trust.js bin/lib/issues/tests/trust.test.js
git commit -m "Wire operational outcome evidence into trustRows (gitLog/now/policy, operationalGood), refs #267"
```

---

### Task 6: `skills/_shared/autonomy-ceiling.md` — sweep for "demo verdicts are the only evidence" prose (IL-93)

**Files:**
- Modify: `skills/_shared/autonomy-ceiling.md`

**Interfaces:**
- Consumes: nothing code-level — a documentation-only task.

- [ ] **Step 1: Confirm the two stale passages are still present at these locations**

```bash
grep -n "supplies the evidence those" skills/_shared/autonomy-ceiling.md
grep -n "real acceptance verdicts" skills/_shared/autonomy-ceiling.md
```

Expected: one hit each (around line 21 and line 70 respectively, as of this plan's authoring — re-verify against the live file since earlier tasks in this plan do not touch this file).

- [ ] **Step 2: Widen the "Two modules implement it" paragraph**

Replace:

```markdown
Two modules implement it. `bin/lib/issues/autonomy.js` resolves the ceiling and maps
`(ceiling, trust row)` to a permission set; `bin/lib/issues/trust.js` supplies the evidence those
rows carry. Neither applies a label — they answer whether a caller may, and the caller acts.
```

with:

```markdown
Two modules implement it. `bin/lib/issues/autonomy.js` resolves the ceiling and maps
`(ceiling, trust row)` to a permission set; `bin/lib/issues/trust.js` supplies the evidence those
rows carry, from **two** sources — a closed record's `demo:*` disposition (demo-descent), and, when
no `demo:*` verdict exists, whether it was merged and stayed unreverted for at least
`trust-revert-window-days` (default 14, `_shared/policy-schema.md`) — **operational** evidence,
evaluated lazily against the record's tracker `closed_at` and an injected integration-branch git
log. Neither source is exclusive: a class's `dispositioned` count and the `MIN_VERDICTS` floor it
must clear can be made up of either kind of evidence, or both. Neither module applies a label —
they answer whether a caller may, and the caller acts.
```

- [ ] **Step 3: Widen the Floor rule's verdict bullet**

Replace:

```markdown
- The class's verdict is `clean`. That in turn requires `total >= MIN_SAMPLES`, **and**
  `dispositioned >= MIN_VERDICTS` — a floor counted on real acceptance verdicts, not on how many
  records the class has closed — **and** no `changes-requested` and no corrective follow-ups. A
  `mixed` verdict earns nothing; neither does `insufficient-evidence`.
```

with:

```markdown
- The class's verdict is `clean`. That in turn requires `total >= MIN_SAMPLES`, **and**
  `dispositioned >= MIN_VERDICTS` — a floor counted on real outcome evidence (a `demo:*`
  disposition, or a merged-and-unreverted operational close), not on how many records the class has
  closed — **and** no `changes-requested` and no corrective follow-ups. A `mixed` verdict earns
  nothing; neither does `insufficient-evidence`.
```

- [ ] **Step 4: Verify no other stale claim survives**

```bash
grep -in "demo.descent\|only.*evidence\|evidence.*only\|acceptance verdict" skills/_shared/autonomy-ceiling.md
```

Expected: only the two now-updated passages, or nothing at all — no remaining claim that demo verdicts are the sole evidence source.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/autonomy-ceiling.md
git commit -m "Document the operational evidence source in autonomy-ceiling.md's evidence-source prose, refs #267"
```

---

### Task 7: Wire the git log into the production trust-table renderer

**Files:**
- Modify: `skills/_shared/trust-table.md`
- Modify: `skills/backlog/refine-mode.md`
- Modify: `skills/capture/SKILL.md`

**Interfaces:**
- Consumes: `trustRows(records, gitLog, now, policy)` (Task 5).
- Produces: `/tmp/trust-table-git-log.txt` — a raw `git log` dump (`sha` + `message`, separator-delimited) written by `trust-table.md`'s Fetch section, reused by `refine-mode.md`'s own second `trustRows` call so the two never disagree about the same underlying evidence.

This is the task that makes the feature live: without it, `trustRows` in every real caller keeps receiving no `gitLog`, so operational evidence is always `{known: false}` in production regardless of Tasks 1-6 — those tasks alone only make the module *capable* of the new evidence, not actually fed it. (Row-shape changes and Render-section changes move together per IL-60 — this task's Render edit is not optional.)

- [ ] **Step 1: Re-read the live file first**

```bash
grep -n "^## Fetch\|^## Render\|trustRows" skills/_shared/trust-table.md
```

Confirm the Fetch section's final fenced block still ends by calling `trustRows(records)` with one argument, and the Render table still has no `Operational` column, before editing (this file is not touched by any earlier task in this plan).

- [ ] **Step 2: Add `closedAt` to the fetched fields**

In `skills/_shared/trust-table.md`'s Fetch section, replace:

```bash
gh issue list --state all --json number,labels,body,state,stateReason \
  --limit "$LIMIT" > /tmp/trust-table-records.json
```

with:

```bash
gh issue list --state all --json number,labels,body,state,stateReason,closedAt \
  --limit "$LIMIT" > /tmp/trust-table-records.json
```

- [ ] **Step 3: Shell the integration-branch git log**

Immediately above that `gh issue list` block, insert a new fenced block (and the explanatory paragraph above it) resolving the integration branch and dumping its history:

```markdown
Resolve the integration branch per `_shared/integration-branch.md`'s resolution ladder, substituting
its value for `{integration-branch}` below. Dump the full history once, in a form the operational
evidence path can scan for `(refs|closes|fixes) #N` references and revert trailers — `%x1f`/`%x1e`
are unit/record separator bytes, never appearing in real commit text, so a multi-line commit
message can never be mistaken for a SHA or split across records:

\```bash
git log "{integration-branch}" --format='%H%x1f%B%x1e' > /tmp/trust-table-git-log.txt
\```
```

(Use literal triple-backtick fences in the actual file — the `\`\`\`` above is escaped only so this plan's own fence does not close early.)

- [ ] **Step 4: Pass the git log and the resolved window into `trustRows`**

Replace the final node block of the Fetch section:

```javascript
node -e "
  const { trustRows } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/trust.js');
  const issues = require('/tmp/trust-table-records.json');
  const familyLeaves = new Set(require('/tmp/trust-table-family-leaves.json'));
  if (issues.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + issues.length + ' records (the configured backlog-fetch-limit) — history beyond this cap was dropped, so every cell below may be under-counted. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before reading any verdict.');
  }
  const records = issues.map((i) => ({ ...i, labels: i.labels.map((l) => l.name), hasParent: familyLeaves.has(i.number) }));
  console.log(JSON.stringify(trustRows(records)));
"
```

with:

```javascript
node -e "
  const fs = require('fs');
  const { trustRows } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/trust.js');
  const issues = require('/tmp/trust-table-records.json');
  const familyLeaves = new Set(require('/tmp/trust-table-family-leaves.json'));
  if (issues.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + issues.length + ' records (the configured backlog-fetch-limit) — history beyond this cap was dropped, so every cell below may be under-counted. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before reading any verdict.');
  }
  const records = issues.map((i) => ({ ...i, labels: i.labels.map((l) => l.name), hasParent: familyLeaves.has(i.number) }));
  const rawLog = fs.readFileSync('/tmp/trust-table-git-log.txt', 'utf8');
  const gitLog = rawLog.split('\x1e').filter(Boolean).map((entry) => {
    const sep = entry.indexOf('\x1f');
    return { sha: entry.slice(0, sep), message: entry.slice(sep + 1) };
  });
  const policy = { 'trust-revert-window-days': '{resolved-window}' };
  console.log(JSON.stringify(trustRows(records, gitLog, Date.now(), policy)));
"
```

Immediately below this block, add a resolution note matching the file's existing `{resolved-limit}`/`{resolved-ceiling}` convention:

```markdown
Read `trust-revert-window-days` from `.claude-tweaks/policy.yml` and substitute its literal value
for `{resolved-window}` above — an empty substitution is fine, `trustRows` and the policy-schema
resolver it calls both treat an absent/empty value as "use the default (14)".
```

- [ ] **Step 5: Update the Render table**

Replace:

```markdown
| Provenance | Risk | Total | Approved | Changes Requested | Undispositioned | Coverage | Not Planned | Follow-ups | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| {provenance} | {band} | {total} | {approved} | {changesRequested} | {undispositioned} | {coverage} | {notPlanned} | {followUps} | {verdict} |
```

with:

```markdown
| Provenance | Risk | Total | Approved | Changes Requested | Operational | Undispositioned | Coverage | Not Planned | Follow-ups | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| {provenance} | {band} | {total} | {approved} | {changesRequested} | {operationalGood} | {undispositioned} | {coverage} | {notPlanned} | {followUps} | {verdict} |
```

Immediately below the "**Undispositioned is never omitted...**" paragraph, add:

```markdown
**Operational is a second, independent evidence source** — a closed record with no `demo:*`
disposition still counts as known-good when it was merged and stayed unreverted for at least
`trust-revert-window-days` (default 14 days, `bin/lib/issues/trust.js`). It folds into `Coverage`
the same way `Approved`/`Changes Requested` do (all three sum into `dispositioned`), so
`Total = Approved + Changes Requested + Operational + Undispositioned` always holds. A record with
a `demo:*` verdict is never double-counted here — demo-descent evidence is tried first, and the
operational path only runs when it found nothing.
```

- [ ] **Step 6: Reuse the same git log in `refine-mode.md`'s advisory Trust signal**

In `skills/backlog/refine-mode.md`, the Trust signal section's own node block currently reads:

```javascript
node -e "
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const { trustRows, riskBand } = require(root + '/bin/lib/issues/trust.js');
  const { resolveProvenance } = require(root + '/bin/lib/issues/provenance.js');
  const { resolveCeiling, permittedGrants } = require(root + '/bin/lib/issues/autonomy.js');
  const issues = require('/tmp/trust-table-records.json').map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
  const rows = new Map(trustRows(issues).map((r) => [r.key, r]));
```

Replace those first six lines with:

```javascript
node -e "
  const fs = require('fs');
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const { trustRows, riskBand } = require(root + '/bin/lib/issues/trust.js');
  const { resolveProvenance } = require(root + '/bin/lib/issues/provenance.js');
  const { resolveCeiling, permittedGrants } = require(root + '/bin/lib/issues/autonomy.js');
  const issues = require('/tmp/trust-table-records.json').map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
  const rawLog = fs.readFileSync('/tmp/trust-table-git-log.txt', 'utf8');
  const gitLog = rawLog.split('\x1e').filter(Boolean).map((entry) => {
    const sep = entry.indexOf('\x1f');
    return { sha: entry.slice(0, sep), message: entry.slice(sep + 1) };
  });
  const policy = { 'trust-revert-window-days': '{resolved-window}' };
  const rows = new Map(trustRows(issues, gitLog, Date.now(), policy).map((r) => [r.key, r]));
```

(the rest of that block is unchanged — it already keys off `rows` by class). Add the same `{resolved-window}` resolution note used in Task 7 Step 4, placed beside this section's existing `{resolved-ceiling}` note (they read the same `.claude-tweaks/policy.yml`, so state both substitutions together):

```markdown
Read `trust-revert-window-days` from `.claude-tweaks/policy.yml` and substitute its literal value
for `{resolved-window}` below the same way — an empty substitution is fine, the default (14)
applies. This block reuses `/tmp/trust-table-git-log.txt`, already written by the Fetch section
above — it must never shell its own separate `git log` call, or its verdicts could silently
disagree with the trust table this same run just rendered from the identical underlying evidence.
```

- [ ] **Step 7: Give `capture/SKILL.md`'s standalone check its own git log**

`skills/capture/SKILL.md`'s born-`ready` check does not run `trust-table.md`'s Fetch section at all — it has its own small, independent fetch. Replace:

```bash
gh issue list --state all --json number,labels,body,state,stateReason --limit 1000 > /tmp/capture-trust-records.json
```

with:

```bash
gh issue list --state all --json number,labels,body,state,stateReason,closedAt --limit 1000 > /tmp/capture-trust-records.json
```

Immediately below it, add a second fenced block (before the existing `node -e` block) resolving the same integration branch and dumping its log to this skill's own temp path:

```markdown
Resolve the integration branch per `_shared/integration-branch.md`'s resolution ladder, substituting
its value for `{integration-branch}` below:

\```bash
git log "{integration-branch}" --format='%H%x1f%B%x1e' > /tmp/capture-trust-git-log.txt
\```
```

(Again, use real triple-backtick fences in the file — escaped here only to avoid closing this plan's own fence.)

Then replace the existing node block:

```javascript
node -e "
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const { trustRows } = require(root + '/bin/lib/issues/trust.js');
  const { resolveCeiling, permittedGrants } = require(root + '/bin/lib/issues/autonomy.js');
  const issues = require('/tmp/capture-trust-records.json').map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
  // This skill's own class. A fresh capture carries by:capture and no risk
  // score, and riskBand() bands an unscored record 'elevated' — so that is the
  // cell the record about to be filed will land in, and the only one that may
  // authorize it. Never read producer:capture|low here: it is a different class
  // with different evidence.
  const row = trustRows(issues).find((r) => r.key === 'producer:capture|elevated');
  const ceiling = resolveCeiling({ policy: '{resolved-ceiling}' });
  const { bornReady, reason } = permittedGrants({ ceiling, row });
  console.log(JSON.stringify({ bornReady, reason, verdict: row ? row.verdict : 'no-cell' }));
"
```

with:

```javascript
node -e "
  const fs = require('fs');
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const { trustRows } = require(root + '/bin/lib/issues/trust.js');
  const { resolveCeiling, permittedGrants } = require(root + '/bin/lib/issues/autonomy.js');
  const issues = require('/tmp/capture-trust-records.json').map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
  const rawLog = fs.readFileSync('/tmp/capture-trust-git-log.txt', 'utf8');
  const gitLog = rawLog.split('\x1e').filter(Boolean).map((entry) => {
    const sep = entry.indexOf('\x1f');
    return { sha: entry.slice(0, sep), message: entry.slice(sep + 1) };
  });
  const policy = { 'trust-revert-window-days': '{resolved-window}' };
  // This skill's own class. A fresh capture carries by:capture and no risk
  // score, and riskBand() bands an unscored record 'elevated' — so that is the
  // cell the record about to be filed will land in, and the only one that may
  // authorize it. Never read producer:capture|low here: it is a different class
  // with different evidence.
  const row = trustRows(issues, gitLog, Date.now(), policy).find((r) => r.key === 'producer:capture|elevated');
  const ceiling = resolveCeiling({ policy: '{resolved-ceiling}' });
  const { bornReady, reason } = permittedGrants({ ceiling, row });
  console.log(JSON.stringify({ bornReady, reason, verdict: row ? row.verdict : 'no-cell' }));
"
```

Add the `{resolved-window}` substitution note beside the existing `{resolved-ceiling}` one in that section's prose:

```markdown
Read `trust-revert-window-days` from `.claude-tweaks/policy.yml` the same way, substituting for
`{resolved-window}` below — empty means the default (14) applies. If the `gh` call, the `git log`
call, or the node block fails for any reason, file without `ready`: this path fails toward the
default, never toward the grant (unchanged from before this leaf).
```

- [ ] **Step 8: Verify no other production caller was missed**

```bash
grep -rn "trustRows(" skills/ | grep -v "trustRows(records, gitLog\|trustRows(issues, gitLog\|trustRows(records)\|Row\[\]\|trustRows'"
```

Expected: the two remaining hits are `skills/backlog/overview-mode.md` and `skills/help/status-scan.md` — both cite `_shared/trust-table.md`'s Fetch/Render sections verbatim rather than calling `trustRows` in their own inline snippet, so Task 7's edit to `trust-table.md` already covers them; no further edit is needed there.

- [ ] **Step 9: Commit**

```bash
git add skills/_shared/trust-table.md skills/backlog/refine-mode.md skills/capture/SKILL.md
git commit -m "Wire the integration-branch git log into production trustRows callers, refs #267"
```

---

### Task 8: Full verification pass

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: PASS, zero failures. Confirms `tests/policy-schema.test.js` and `bin/lib/issues/tests/trust.test.js` are picked up by the existing glob in `package.json`'s `test` script (both already are — no glob change needed) and that nothing else in the suite regressed.

- [ ] **Step 2: Re-check every acceptance criterion against the spec text**

Read `.claude-tweaks/pipelines/2026-08-09T122833-spec-271-267/spec-267/work/267-spec.md`'s Acceptance Criteria section (AC1-AC8) side by side with the tests added in Tasks 4-5 and confirm each is asserted, not merely plausible:

- AC1 — Task 5, `'AC1: operational evidence clears MIN_SAMPLES ...'`
- AC2 — Task 5, `'AC2: the revert window is inclusive at the boundary, both directions'`
- AC3 — Task 5, `'AC3: a reverted closing commit does not count as known-good'`
- AC4 — Task 5, `'AC4: no discoverable closing commit contributes nothing, asserted explicitly'`
- AC5 — Task 5, `'AC5: a configured window widens what counts; the default applies when absent; malformed falls back'`
- AC6 — Task 5, Step 8 (manual revert-and-rerun, not a committed test — by design, per the spec's own phrasing "run once during development")
- AC7 — Task 5, `'AC7: a reopened-then-reclosed record counts against its latest close; still-open contributes nothing'`
- AC8 — Task 5, `'AC8: two closing commits, one reverted, disqualifies the whole record (all-or-nothing)'`

- [ ] **Step 3: Confirm every existing caller still works unmodified where this plan did not touch it**

```bash
grep -rn "trustRows(" skills/backlog/overview-mode.md skills/help/status-scan.md
```

Expected: no direct `trustRows(` call in either file — both cite `_shared/trust-table.md`'s Fetch/Render sections, already updated in Task 7.

- [ ] **Step 4: Confirm the Global Constraints held**

- Fail-closed: re-read Task 5's `'AC4'` and `'resolveOperationalOutcome is unknown with no discoverable closing commit'` tests — both assert `{known: false}` / `undispositioned`, never a fabricated known-good.
- All-or-nothing: re-read Task 3's `'isClosingCommitReverted is all-or-nothing'` and Task 5's `'AC8'` tests.
- No parallel store: confirm `bin/lib/issues/trust.js` still exports a single `trustRows`, with `operationalGood` living inside the same `cell` object as `approved`/`changesRequested` — no second data structure was introduced.
- IL-60 (row-shape change moves with Render): confirm `skills/_shared/trust-table.md`'s Render table (Task 7, Step 5) and `bin/lib/issues/trust.js`'s cell shape (Task 5, Step 5) are in the same plan and were committed in the same work session.

- [ ] **Step 5: Final commit check**

```bash
git log --oneline -8
git status
```

Expected: eight commits (one per task, Task 8 makes no code changes so contributes none), clean working tree.
