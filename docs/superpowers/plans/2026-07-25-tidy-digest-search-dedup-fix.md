# Fix `--search`-based dedup causing duplicate GitHub issues — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/claude-tweaks:tidy --scope=github`'s rolling digest and `/claude-tweaks:dispatch`'s headless self-report from filing duplicate GitHub issues on every unattended firing, by replacing their `gh issue list --search`-based existence checks with the proven plain-list + marker-match pattern already used by `specify/record-creation.md`, and adding a self-healing duplicate-close step as a hedge against any future failure of that check.

**Architecture:** One new pure Node module, `bin/lib/issues/dedup-lookup.js`, exports `findByMarker(issues, markerPattern)` — given the JSON array from a plain (non-`--search`) `gh issue list` call and a marker string/RegExp, it returns the canonical (newest) matching issue plus any duplicates, or `null` if nothing matches. Two prose skill files (`skills/tidy/github-routine-procedures.md`, `skills/dispatch/SKILL.md`) are rewritten to call this helper instead of `--search`, and to close any duplicates it finds instead of silently picking one.

**Tech Stack:** Node.js (`node:test`, `node:assert`, no external dependencies — matches every other module in `bin/lib/issues/`), `gh` CLI, markdown skill files.

## Global Constraints

- No network calls inside `bin/lib/issues/dedup-lookup.js` — pure function only, same discipline as every other `bin/lib` module (`bin/lib/health-core/dedup.js`'s header: "the engine never calls network"). The LLM performs all `gh` mutations via Bash; the helper only decides.
- Every `gh issue list` call this plan adds or touches must pass an explicit `--limit 500` (matching `specify/record-creation.md`'s existing `--limit 500` precedent and rationale) and must never pass `--search` for an existence/dedup check.
- Test style: `'use strict'`, `require('node:test')` / `require('node:assert')`, flat `test('description', () => {...})` calls — no `describe` blocks (matches `bin/lib/issues/tests/record.test.js`).
- `npm test` must stay green (1593 tests passing at this plan's baseline) after every task.

---

### Task 1: `bin/lib/issues/dedup-lookup.js` — the shared marker-match helper

**Files:**
- Create: `bin/lib/issues/dedup-lookup.js`
- Test: `bin/lib/issues/tests/dedup-lookup.test.js`

**Interfaces:**
- Produces: `findByMarker(issues, markerPattern)` where `issues` is an array of `{ number, title, body, createdAt, ...anything else }` (extra fields are ignored) and `markerPattern` is either a plain string (matched via `body.includes(...)`) or a `RegExp` (matched via `.test(body)`). Returns `{ canonical, duplicates }` where `canonical` is the single newest matching issue object (by `createdAt`, ties broken by highest `number`) and `duplicates` is every other matching issue, oldest-first. Returns `null` when no issue matches. Never throws on a missing/malformed `body` or `createdAt` field on any individual issue — that issue is just treated as non-matching (for `body`) or as having a `createdAt` of epoch 0 (for `createdAt`).
- Consumes: nothing from earlier tasks (this is the first task).

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/issues/tests/dedup-lookup.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { findByMarker } = require('../dedup-lookup');

test('findByMarker returns null when issues array is empty', () => {
  assert.strictEqual(findByMarker([], '<!-- marker -->'), null);
});

test('findByMarker returns null when no issue body contains the marker', () => {
  const issues = [
    { number: 1, title: 'a', body: 'nothing here', createdAt: '2026-07-20T00:00:00Z' },
  ];
  assert.strictEqual(findByMarker(issues, '<!-- marker -->'), null);
});

test('findByMarker returns the single match as canonical with no duplicates', () => {
  const issues = [
    { number: 1, title: 'a', body: 'intro <!-- marker --> outro', createdAt: '2026-07-20T00:00:00Z' },
  ];
  const result = findByMarker(issues, '<!-- marker -->');
  assert.strictEqual(result.canonical.number, 1);
  assert.deepStrictEqual(result.duplicates, []);
});

test('findByMarker picks the newest match as canonical regardless of input order, duplicates oldest-first', () => {
  const issues = [
    { number: 1089, title: 'c', body: '<!-- marker -->', createdAt: '2026-07-22T14:00:00Z' },
    { number: 1016, title: 'a', body: '<!-- marker -->', createdAt: '2026-07-20T09:00:00Z' },
    { number: 1079, title: 'b', body: '<!-- marker -->', createdAt: '2026-07-22T09:00:00Z' },
  ];
  const result = findByMarker(issues, '<!-- marker -->');
  assert.strictEqual(result.canonical.number, 1089);
  assert.deepStrictEqual(result.duplicates.map((d) => d.number), [1016, 1079]);
});

test('findByMarker breaks createdAt ties by highest issue number', () => {
  const issues = [
    { number: 10, title: 'a', body: '<!-- marker -->', createdAt: '2026-07-22T09:00:00Z' },
    { number: 12, title: 'b', body: '<!-- marker -->', createdAt: '2026-07-22T09:00:00Z' },
  ];
  const result = findByMarker(issues, '<!-- marker -->');
  assert.strictEqual(result.canonical.number, 12);
  assert.deepStrictEqual(result.duplicates.map((d) => d.number), [10]);
});

test('findByMarker skips issues with a missing or non-string body without throwing', () => {
  const issues = [
    { number: 1, title: 'a', body: undefined, createdAt: '2026-07-20T00:00:00Z' },
    { number: 2, title: 'b', createdAt: '2026-07-21T00:00:00Z' },
    { number: 3, title: 'c', body: '<!-- marker -->', createdAt: '2026-07-22T00:00:00Z' },
  ];
  const result = findByMarker(issues, '<!-- marker -->');
  assert.strictEqual(result.canonical.number, 3);
  assert.deepStrictEqual(result.duplicates, []);
});

test('findByMarker accepts a RegExp pattern', () => {
  const issues = [
    { number: 5, title: 'a', body: '<!-- dispatch-preflight-marker: lint-check -->', createdAt: '2026-07-20T00:00:00Z' },
    { number: 6, title: 'b', body: '<!-- dispatch-preflight-marker: type-check -->', createdAt: '2026-07-21T00:00:00Z' },
  ];
  const result = findByMarker(issues, /dispatch-preflight-marker: lint-check/);
  assert.strictEqual(result.canonical.number, 5);
  assert.deepStrictEqual(result.duplicates, []);
});

test('findByMarker treats a malformed createdAt as epoch 0, still resolves canonical deterministically', () => {
  const issues = [
    { number: 1, title: 'a', body: '<!-- marker -->', createdAt: 'not-a-date' },
    { number: 2, title: 'b', body: '<!-- marker -->', createdAt: '2026-07-20T00:00:00Z' },
  ];
  const result = findByMarker(issues, '<!-- marker -->');
  assert.strictEqual(result.canonical.number, 2);
  assert.deepStrictEqual(result.duplicates.map((d) => d.number), [1]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/dedup-lookup.test.js`
Expected: FAIL — `Cannot find module '../dedup-lookup'`

- [ ] **Step 3: Write the implementation**

Create `bin/lib/issues/dedup-lookup.js`:

```js
// bin/lib/issues/dedup-lookup.js
// Pure: find an issue by a body marker across a plain (non-`--search`) `gh issue
// list` result, and surface any duplicates for self-healing cleanup. Exists
// because `gh issue list --search` hits GitHub's eventually-consistent Search
// API — the wrong tool for an existence/dedup check. specify/record-creation.md
// already documents and avoids this exact anti-pattern via its own
// extractFingerprint-based idempotency map; this module generalizes that same
// idiom (plain list + explicit --limit + in-process marker match) for callers
// that don't need the full work-record fingerprint scheme, just "does an issue
// with this marker already exist, and if more than one does, which is
// canonical." No network — the caller fetches `gh issue list ... --limit 500`
// output into a file first; this module only reads the parsed array.
'use strict';

function bodyMatches(body, markerPattern) {
  if (typeof body !== 'string' || !body) return false;
  if (markerPattern instanceof RegExp) return markerPattern.test(body);
  return body.includes(markerPattern);
}

// issues: [{ number, body, createdAt, ...anything else — ignored }]
// markerPattern: string (exact substring match against body) or RegExp
// -> { canonical, duplicates } | null
// canonical is the newest match (by createdAt; ties broken by highest number).
// duplicates is every other match, oldest-first — ready to hand a caller that
// wants to close everything except canonical.
function findByMarker(issues, markerPattern) {
  const matches = (Array.isArray(issues) ? issues : [])
    .filter((issue) => issue && bodyMatches(issue.body, markerPattern));

  if (matches.length === 0) return null;

  const sorted = [...matches].sort((a, b) => {
    const aTime = Date.parse(a && a.createdAt) || 0;
    const bTime = Date.parse(b && b.createdAt) || 0;
    if (aTime !== bTime) return bTime - aTime; // newest first
    return (b.number || 0) - (a.number || 0); // tie-break: highest number first
  });

  const [canonical, ...rest] = sorted;
  return { canonical, duplicates: rest.reverse() }; // oldest-first
}

module.exports = { findByMarker };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/dedup-lookup.test.js`
Expected: PASS — 8 tests, 0 failures

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `npm test`
Expected: PASS — 1601 tests (1593 baseline + 8 new), 0 failures

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/dedup-lookup.js bin/lib/issues/tests/dedup-lookup.test.js
git commit -m "Add findByMarker: plain-list + marker-match dedup helper

Replaces the gh issue list --search anti-pattern for existence checks.
--search hits GitHub's eventually-consistent Search API; this generalizes
the plain-list + in-process marker match specify/record-creation.md
already uses for its own idempotency, for callers that just need
find-or-create-or-detect-duplicates rather than the full work-record
fingerprint scheme."
```

---

### Task 2: Fix `tidy`'s Rolling digest lookup + add self-healing duplicate close

**Files:**
- Modify: `skills/tidy/github-routine-procedures.md` (the "Rolling digest" section, `**Identity:**` bullet list)

**Interfaces:**
- Consumes: `findByMarker(issues, markerPattern)` from Task 1, invoked as `require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/dedup-lookup.js')`.
- Produces: nothing further tasks depend on (this task and Task 3 are independent siblings).

This is a prose/markdown change — there's no unit test for skill instructions, so "testing" here means: (a) grep-verify the anti-pattern is gone and the replacement is present, (b) `npm test` stays green since this file isn't exercised by any test, confirming the change didn't accidentally touch code.

- [ ] **Step 1: Locate and replace the Identity bullet**

Open `skills/tidy/github-routine-procedures.md`. Find this exact block (currently lines 36-38):

````markdown
**Identity:**
- `work-backend: github-issues` (or any project with a reachable GitHub remote, regardless of which record-storage backend is active — this is about where the digest lives, not the record-storage choice): find the digest issue via `gh issue list --search "Tidy GitHub-Triage Digest in:title" --state open --json number,title,body`, then confirm the match by checking its body contains the exact marker `<!-- tidy-digest-marker -->` (title alone is not sufficient — do not match on title only). If found, `gh issue edit {n} --body-file <file>`. If not found (first-ever firing, or the issue was manually closed), `gh issue create --title "Tidy GitHub-Triage Digest" --body-file <file>` once.
- `work-backend: local-files` with no reachable GitHub remote: rewrite `.claude-tweaks/tidy-digest.md` in place and commit it.
````

Replace it with:

````markdown
**Identity:**
- `work-backend: github-issues` (or any project with a reachable GitHub remote, regardless of which record-storage backend is active — this is about where the digest lives, not the record-storage choice): find the digest issue via a plain, strongly-consistent list — never `gh issue list --search`, which rides GitHub's eventually-consistent search index (this produced three separate duplicate digest issues in production before this fix — #1016, #1079, #1089) and, without an explicit `--limit`, can also silently paginate past the target issue on a busy repo. `specify/record-creation.md`'s Idempotency section documents and avoids this identical anti-pattern; this step now follows the same idiom:

  ```bash
  gh issue list --state open --json number,title,body,createdAt --limit 500 > /tmp/tidy-digest-issues.json

  node -e "
    const { findByMarker } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/dedup-lookup.js');
    const issues = require('/tmp/tidy-digest-issues.json');
    const result = findByMarker(issues, '<!-- tidy-digest-marker -->');
    require('fs').writeFileSync('/tmp/tidy-digest-lookup.json', JSON.stringify(result));
  "
  ```

  Read `/tmp/tidy-digest-lookup.json`:
  - `null` (first-ever firing, or the issue was manually closed): `gh issue create --title "Tidy GitHub-Triage Digest" --body-file <file>` once.
  - `canonical` set: `gh issue edit {canonical.number} --body-file <file>`.
  - `duplicates` non-empty (however that happened — this is the hedge, not the expected path): before continuing, close every entry — `gh issue close {n} --reason "not planned"` with a comment `"Duplicate of #{canonical.number} — same <!-- tidy-digest-marker --> match, closing to restore the rolling-digest invariant of one issue per repo."` — then log one line per closed duplicate to this firing's `decisions.md`: `AUTO {time} — Step 6 (rolling digest): closed duplicate issue #{n} (marker match with canonical #{canonical.number}). Reversibility: low (GitHub state; issue can be manually re-opened).` This keeps the "one issue, always" invariant true even if a future firing's lookup ever fails in some way this fix didn't anticipate — the accumulation this bug originally caused stays bounded to one extra firing cycle instead of growing forever.
- `work-backend: local-files` with no reachable GitHub remote: rewrite `.claude-tweaks/tidy-digest.md` in place and commit it.
````

- [ ] **Step 2: Verify the anti-pattern is gone from this file**

Run: `grep -n "issue list --search" skills/tidy/github-routine-procedures.md`
Expected: only the Pipeline Funnel section's line still matches (the `closed:>{90-days-ago}` sampling query — out of scope per the design doc's sweep table, not an existence/dedup check). The Rolling digest section's occurrence must be gone.

- [ ] **Step 3: Verify the replacement text is present**

Run: `grep -n "findByMarker\|dedup-lookup" skills/tidy/github-routine-procedures.md`
Expected: both strings found, inside the Rolling digest section.

- [ ] **Step 4: Run the full suite to confirm no regression**

Run: `npm test`
Expected: PASS — same count as after Task 1 (this is a markdown-only change; no test references this file)

- [ ] **Step 5: Commit**

```bash
git add skills/tidy/github-routine-procedures.md
git commit -m "tidy: fix rolling digest to use plain-list marker match, not --search

gh issue list --search rides GitHub's eventually-consistent search index and
has no explicit pagination limit, either of which can produce a false
'not found' and file a duplicate digest issue. Replaced with the same
plain-list + in-process marker-match idiom specify/record-creation.md
already uses, via the new findByMarker helper. Also adds a self-healing
duplicate-close step: if the lookup ever surfaces more than one match,
close all but the newest instead of silently picking one, so any future
failure of this check stays bounded to one extra firing instead of
accumulating indefinitely.

Fixes the bug behind #1016/#1079/#1089."
```

---

### Task 3: Fix `dispatch`'s headless self-report dedup + add self-healing duplicate close

**Files:**
- Modify: `skills/dispatch/SKILL.md` (the "Headless self-report" subsection)

**Interfaces:**
- Consumes: `findByMarker(issues, markerPattern)` from Task 1, same invocation shape as Task 2.
- Produces: nothing further tasks depend on (independent sibling of Task 2).

Same testing approach as Task 2: grep-verify plus `npm test` regression check — this is prose, no direct unit test coverage exists or is expected.

- [ ] **Step 1: Locate and replace the self-report block**

Open `skills/dispatch/SKILL.md`. Find this exact block:

````markdown
**Headless self-report (`next` form only).** The `next` form fires unattended — the unit a scheduled Routine fires with nobody present to read a stop message (see the Input table above). A Preflight failure here needs a durable trace instead of a message nobody sees. Before stopping on any Preflight failure (the `work-backend` checks above, or the Detection Ladder below), search for an existing open report first, to avoid re-filing on every firing:

```bash
gh issue list --label by:dispatch --state open --search "{failing-check-name} in:title" --json number -q '.[].number'
```

If one already exists, reference it in the stop output and file nothing new. Otherwise, read the
project's `work-types` config key (per `_shared/work-record.md`'s Config keys table) and branch —
same pattern `/capture`'s Backend Selection already uses, Type is always `bug` here (a Preflight
failure is definitionally a defect):

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['by:dispatch', 'Origin: self-filed by /claude-tweaks:dispatch on a headless Preflight failure']]
# — bootstrap the matching type:bug pair too under work-types: labels, same as /capture does.

# work-types: native
gh issue create \
  --title "Dispatch Preflight failure: {failing-check-name}" \
  --body "{the exact diagnostic message this check would otherwise report to a human}" \
  --type bug \
  --label by:dispatch

# work-types: labels
gh issue create \
  --title "Dispatch Preflight failure: {failing-check-name}" \
  --body "{the exact diagnostic message this check would otherwise report to a human}" \
  --label by:dispatch \
  --label type:bug
```
````

Replace it with:

````markdown
**Headless self-report (`next` form only).** The `next` form fires unattended — the unit a scheduled Routine fires with nobody present to read a stop message (see the Input table above). A Preflight failure here needs a durable trace instead of a message nobody sees. Before stopping on any Preflight failure (the `work-backend` checks above, or the Detection Ladder below), search for an existing open report first, to avoid re-filing on every firing — never via `gh issue list --search`, which rides GitHub's eventually-consistent search index (the same anti-pattern that caused `/tidy`'s rolling digest to file duplicate issues on repeat firings — see `tidy/github-routine-procedures.md`'s Rolling digest section); use the same plain-list + marker-match idiom instead:

```bash
gh issue list --label by:dispatch --state open --json number,title,body,createdAt --limit 500 > /tmp/dispatch-selfreport-issues.json

node -e "
  const { findByMarker } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/dedup-lookup.js');
  const issues = require('/tmp/dispatch-selfreport-issues.json');
  const marker = '<!-- dispatch-preflight-marker: ' + process.argv[1] + ' -->';
  const result = findByMarker(issues, marker);
  require('fs').writeFileSync('/tmp/dispatch-selfreport-lookup.json', JSON.stringify(result));
" "{failing-check-name}"
```

Read `/tmp/dispatch-selfreport-lookup.json`:
- `canonical` set: reference `#{canonical.number}` in the stop output and file nothing new.
- `duplicates` non-empty (the hedge, not the expected path): close every entry before continuing — `gh issue close {n} --reason "not planned"` with a comment `"Duplicate of #{canonical.number} — same dispatch-preflight-marker match, closing to keep one open self-report per failing check."` — then log one line per closed duplicate to this firing's own audit trail the same way the digest's self-heal step does (`AUTO {time} — dispatch headless self-report: closed duplicate issue #{n} (marker match with canonical #{canonical.number}). Reversibility: low (GitHub state; issue can be manually re-opened).`).
- `null`: read the project's `work-types` config key (per `_shared/work-record.md`'s Config keys table) and branch —
same pattern `/capture`'s Backend Selection already uses, Type is always `bug` here (a Preflight
failure is definitionally a defect). The body now carries the marker so future firings can find it reliably:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['by:dispatch', 'Origin: self-filed by /claude-tweaks:dispatch on a headless Preflight failure']]
# — bootstrap the matching type:bug pair too under work-types: labels, same as /capture does.

# work-types: native
gh issue create \
  --title "Dispatch Preflight failure: {failing-check-name}" \
  --body "{the exact diagnostic message this check would otherwise report to a human}

<!-- dispatch-preflight-marker: {failing-check-name} -->" \
  --type bug \
  --label by:dispatch

# work-types: labels
gh issue create \
  --title "Dispatch Preflight failure: {failing-check-name}" \
  --body "{the exact diagnostic message this check would otherwise report to a human}

<!-- dispatch-preflight-marker: {failing-check-name} -->" \
  --label by:dispatch \
  --label type:bug
```
````

- [ ] **Step 2: Verify the anti-pattern is gone from this file**

Run: `grep -n "issue list --search\|--search \"{failing-check-name}" skills/dispatch/SKILL.md`
Expected: no matches.

- [ ] **Step 3: Verify the replacement text and new marker are present**

Run: `grep -n "findByMarker\|dedup-lookup\|dispatch-preflight-marker" skills/dispatch/SKILL.md`
Expected: all three strings found — `findByMarker`/`dedup-lookup` in the lookup snippet, `dispatch-preflight-marker` in both the lookup snippet and both `gh issue create` bodies.

- [ ] **Step 4: Run the full suite to confirm no regression**

Run: `npm test`
Expected: PASS — same count as after Task 2

- [ ] **Step 5: Commit**

```bash
git add skills/dispatch/SKILL.md
git commit -m "dispatch: fix headless self-report dedup to use plain-list marker match

Same --search anti-pattern and same unattended-duplication risk as the
tidy rolling digest bug (#1016/#1079/#1089), just not yet observed in
production. Adds a dispatch-preflight-marker body marker (previously
relied on title-text search alone) and replaces gh issue list --search
with the findByMarker plain-list idiom, plus the same self-healing
duplicate-close hedge."
```

---

## Self-Review Notes

**Spec coverage:** New shared module + tests (Task 1) ✓. Tidy Rolling digest rewrite + self-heal (Task 2) ✓. Dispatch self-report rewrite + new marker + self-heal (Task 3) ✓. Sweep table's "not touching" list (capture/specify's interactive searches, tidy's Pipeline Funnel sample) — deliberately has no task, matching the design doc's explicit scope decision; Step 2 of Task 2 asserts the Funnel's `--search` line is the *only* one left in that file, so an accidental over-fix would fail that check.

**Placeholder scan:** No TBD/TODO; every step has literal code or exact grep commands and expected output.

**Type consistency:** `findByMarker(issues, markerPattern)` signature and `{ canonical, duplicates }` return shape are identical across Task 1's implementation/tests and Tasks 2-3's consumption. `CLAUDE_PLUGIN_ROOT`-relative require path matches the existing convention in `specify/record-creation.md`.
