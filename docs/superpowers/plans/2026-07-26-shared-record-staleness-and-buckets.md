# Shared Record Staleness + Bucket Predicates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated 4-week staleness threshold and record bucket predicates (`isBacklog`/`isParked`/`isBotBlocked`/`isBotInProgress`) — currently reimplemented independently in `/help`'s `status-scan.md` and `/tidy`'s `scan-procedures.md` — into a new pure, unit-tested JS module and a project-configurable policy key.

**Architecture:** One new pure module, `bin/lib/issues/record-buckets.js`, exports the bucket predicates and a `classifyStaleness(ageMs, thresholdMs)` classifier. A new `record-staleness-weeks` config key (default `4`) is resolved by dispatcher-inlined prose in `_shared/record-queue-fetch.md`, mirroring the exact env-var-export pattern that file already uses for `backlog-fetch-limit`. `/help` and `/tidy`'s classification scripts require the new module and read the resolved threshold instead of hardcoding their own copies.

**Tech Stack:** Node.js (`node:test` for unit tests, no external deps — this plugin ships zero runtime npm dependencies), Markdown (skill procedure files consumed by dispatched LLM agents).

## Global Constraints

- `record-buckets.js` is pure: no `fs` access, no network calls — data in, data out. Matches `bin/lib/issues/grouping.js`'s existing style.
- `facets.stage` and `facets.bot: { inProgress, blocked }` are **always present** on both `github-issues` and `local-files` drivers (`facet-shape.js`'s `sharedFacetDefaults()`, spread into both `record.js`'s `parseRecordFacets` and `local-store.js`'s `defaultFacets`). No optional chaining anywhere in this module — direct property access is always safe.
- New config key: `record-staleness-weeks`, default `4`, documented as a new row in `_shared/work-record.md`'s Config keys table (same table `backlog-fetch-limit` lives in) — not `.claude-tweaks/policy.yml` or a Pipeline Config Manifesto lever (that's `tidy-aggressiveness`'s different mechanism, with per-run overrides this key deliberately doesn't have).
- Threshold resolution mirrors `backlog-fetch-limit`'s existing pattern in `_shared/record-queue-fetch.md` exactly: read-with-shell-default, export as an env var, no per-run CLI-arg override tier.
- Out of scope (do not touch): `/tidy` Shape 4 (missing scoring), Shape 7 (legacy taxonomy); `/help`'s grants-based "authorized" split and "building" bucket; `/claude-tweaks:init` bootstrap steps; `/tidy` Step 5's separate `facets.bot.inProgress === false` check (line ~295 of `scan-procedures.md`) — this is a third, genuine duplicate of the same predicate this plan extracts, found during planning, but it falls outside the approved design's stated scope (Step 1 Shapes 1/2/5 only). Flag it to the user as a fast, low-risk follow-up rather than silently expanding scope here.
- Every markdown-embedded script edited in this plan must be proven behavior-preserving by actually running it (old vs. new) against a fixture, not just read for correctness — this repo's own CLAUDE.md explicitly warns against approving a data-shape/logic change by re-reading code instead of executing it.

---

### Task 1: `record-buckets.js` module + unit tests

**Files:**
- Create: `bin/lib/issues/record-buckets.js`
- Create: `bin/lib/issues/tests/record-buckets.test.js`

**Interfaces:**
- Produces: `isBacklog(record): boolean`, `isParked(record): boolean`, `isBotBlocked(record): boolean`, `isBotInProgress(record): boolean`, `classifyStaleness(ageMs: number, thresholdMs: number): 'fresh' | 'review' | 'stale'` — `record` is the `{ ...rawFields, facets }` shape both drivers already produce.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/issues/tests/record-buckets.test.js`:

```js
// bin/lib/issues/tests/record-buckets.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isBacklog, isParked, isBotBlocked, isBotInProgress, classifyStaleness } = require('../record-buckets');

function makeRecord(overrides = {}) {
  return {
    facets: {
      stage: 'backlog',
      bot: { inProgress: false, blocked: false },
      ...overrides,
    },
  };
}

// ── isBacklog ──────────────────────────────────────────────────────────────

test('isBacklog returns true for a backlog-stage record', () => {
  assert.strictEqual(isBacklog(makeRecord({ stage: 'backlog' })), true);
});

test('isBacklog returns false for a non-backlog-stage record', () => {
  assert.strictEqual(isBacklog(makeRecord({ stage: 'ready' })), false);
});

// ── isParked ───────────────────────────────────────────────────────────────

test('isParked returns true for a parked-stage record', () => {
  assert.strictEqual(isParked(makeRecord({ stage: 'parked' })), true);
});

test('isParked returns false for a non-parked-stage record', () => {
  assert.strictEqual(isParked(makeRecord({ stage: 'backlog' })), false);
});

// ── isBotBlocked ─────────────────────────────────────────────────────────────

test('isBotBlocked returns true when facets.bot.blocked is true', () => {
  const record = makeRecord();
  record.facets.bot.blocked = true;
  assert.strictEqual(isBotBlocked(record), true);
});

test('isBotBlocked returns false for the default (false) bot state', () => {
  assert.strictEqual(isBotBlocked(makeRecord()), false);
});

test('isBotBlocked returns false for a local-files-shaped record (facets.bot is always the default object, never absent)', () => {
  // local-store.js's defaultFacets() spreads facet-shape.js's sharedFacetDefaults(), which
  // always includes bot: { inProgress: false, blocked: false } — this is the actual shape a
  // brand-new local-files record produces, never an undefined/missing field.
  const localFilesRecord = { facets: { stage: 'backlog', bot: { inProgress: false, blocked: false } } };
  assert.strictEqual(isBotBlocked(localFilesRecord), false);
});

// ── isBotInProgress ──────────────────────────────────────────────────────────

test('isBotInProgress returns true when facets.bot.inProgress is true', () => {
  const record = makeRecord();
  record.facets.bot.inProgress = true;
  assert.strictEqual(isBotInProgress(record), true);
});

test('isBotInProgress returns false for the default (false) bot state', () => {
  assert.strictEqual(isBotInProgress(makeRecord()), false);
});

// ── classifyStaleness ────────────────────────────────────────────────────────

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;

test('age 0 classifies as fresh', () => {
  assert.strictEqual(classifyStaleness(0, FOUR_WEEKS_MS), 'fresh');
});

test('age just under the review-band midpoint (threshold/2) classifies as fresh', () => {
  assert.strictEqual(classifyStaleness(FOUR_WEEKS_MS / 2 - 1, FOUR_WEEKS_MS), 'fresh');
});

test('age exactly at the review-band midpoint (threshold/2) classifies as review', () => {
  assert.strictEqual(classifyStaleness(FOUR_WEEKS_MS / 2, FOUR_WEEKS_MS), 'review');
});

test('age exactly at the threshold classifies as review, not stale', () => {
  assert.strictEqual(classifyStaleness(FOUR_WEEKS_MS, FOUR_WEEKS_MS), 'review');
});

test('age just over the threshold classifies as stale', () => {
  assert.strictEqual(classifyStaleness(FOUR_WEEKS_MS + 1, FOUR_WEEKS_MS), 'stale');
});

test('classifyStaleness scales correctly with a non-default threshold (record-staleness-weeks: 8)', () => {
  const eightWeeksMs = 56 * 24 * 60 * 60 * 1000;
  const fiveWeeksMs = 5 * 7 * 24 * 60 * 60 * 1000;
  const threeWeeksMs = 3 * 7 * 24 * 60 * 60 * 1000;
  assert.strictEqual(classifyStaleness(fiveWeeksMs, eightWeeksMs), 'review');
  assert.strictEqual(classifyStaleness(threeWeeksMs, eightWeeksMs), 'fresh');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/record-buckets.test.js`
Expected: FAIL — `Cannot find module '../record-buckets'`

- [ ] **Step 3: Write the module**

Create `bin/lib/issues/record-buckets.js`:

```js
// bin/lib/issues/record-buckets.js
// Pure: the record-stage/bot-state predicates and staleness classifier
// duplicated independently in /help's status-scan.md and /tidy's
// scan-procedures.md before this module existed. facets.stage and
// facets.bot are always present on both drivers (facet-shape.js's
// sharedFacetDefaults(), spread into both record.js's parseRecordFacets
// and local-store.js's defaultFacets) — no optional chaining needed here.
'use strict';

function isBacklog(record) {
  return record.facets.stage === 'backlog';
}

function isParked(record) {
  return record.facets.stage === 'parked';
}

function isBotBlocked(record) {
  return record.facets.bot.blocked === true;
}

function isBotInProgress(record) {
  return record.facets.bot.inProgress === true;
}

// Bands: fresh below half the threshold, review from half up to and including
// the threshold, stale beyond it. Preserves the original fixed 2-week/4-week
// ratio (half of 4 weeks = 2 weeks) as the threshold scales with project policy.
function classifyStaleness(ageMs, thresholdMs) {
  const half = thresholdMs / 2;
  if (ageMs < half) return 'fresh';
  if (ageMs <= thresholdMs) return 'review';
  return 'stale';
}

module.exports = { isBacklog, isParked, isBotBlocked, isBotInProgress, classifyStaleness };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/record-buckets.test.js`
Expected: PASS — all tests green, 0 failures.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS — same total test count as baseline plus the new file's tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/record-buckets.js bin/lib/issues/tests/record-buckets.test.js
git commit -m "Add record-buckets.js: shared stage/bot-state predicates + staleness classifier"
```

---

### Task 2: Document `record-staleness-weeks` config key + resolution procedure

**Files:**
- Modify: `skills/_shared/work-record.md` (Config keys table)
- Modify: `skills/_shared/record-queue-fetch.md` (Staleness clock section + See also)

**Interfaces:**
- Consumes: nothing from Task 1 (pure documentation).
- Produces: the `record-staleness-weeks` key name, default `4`, and the `RECORD_STALENESS_WEEKS` env-var resolution contract that Tasks 3 and 4 both read from.

- [ ] **Step 1: Add the config key row to `work-record.md`**

In `skills/_shared/work-record.md`, in the Config keys table, add a new row immediately after the `backlog-fetch-limit` row:

```markdown
| `record-staleness-weeks` | `4` | Staleness threshold (in weeks) `_shared/record-queue-fetch.md`'s Threshold resolution section reads for `/help`'s backlog-stale sub-count and `/tidy`'s Shape 1/Shape 2 backlog/parked staleness classification — converted to ms and passed to `bin/lib/issues/record-buckets.js`'s `classifyStaleness` |
```

- [ ] **Step 2: Add the "Threshold resolution" subsection to `record-queue-fetch.md`**

In `skills/_shared/record-queue-fetch.md`, insert a new subsection immediately after the existing "## Staleness clock (either driver)" section's content (after the `{REPO_ROOT}` resolution paragraph, before "## See also"):

```markdown
### Threshold resolution

Before computing staleness, read `record-staleness-weeks` from the project's CLAUDE.md (per
`_shared/work-record.md`'s Config keys table) and export it as `RECORD_STALENESS_WEEKS`; if
the key is absent, leave the variable unset so each consumer's own `:-4` default applies —
the same read-with-shell-default pattern this file already uses for `backlog-fetch-limit`
above. Each consumer's own classification script converts this to milliseconds
(`weeks * 7 * 24 * 60 * 60 * 1000`) and passes the result as `thresholdMs` to
`classifyStaleness(ageMs, thresholdMs)` (`bin/lib/issues/record-buckets.js`) — the conversion
is per-consumer inline code, not part of the shared module itself.
```

- [ ] **Step 3: Add `record-buckets.js` to "See also"**

In the same file's "## See also" section, add:

```markdown
- `bin/lib/issues/record-buckets.js` — the shared bucket predicates (`isBacklog`, `isParked`,
  `isBotBlocked`, `isBotInProgress`) and `classifyStaleness`, consumed by every classification
  step this fetch feeds
```

- [ ] **Step 4: Verify by reading both edited sections back**

Read `skills/_shared/work-record.md`'s Config keys table and `skills/_shared/record-queue-fetch.md`'s Staleness clock/Threshold resolution/See also sections in full. Confirm: the new table row uses the exact key name `record-staleness-weeks` (not a variant spelling), the new subsection uses the exact env var name `RECORD_STALENESS_WEEKS` (this must match verbatim what Tasks 3 and 4 reference), and no existing content was accidentally altered.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/work-record.md skills/_shared/record-queue-fetch.md
git commit -m "Document record-staleness-weeks config key + threshold resolution procedure"
```

---

### Task 3: Wire `/help`'s Stage 1 into the shared module

**Files:**
- Modify: `skills/help/status-scan.md` (Stage 1's inline classification script)

**Interfaces:**
- Consumes: `isBacklog`, `isParked`, `isBotBlocked`, `isBotInProgress`, `classifyStaleness` from `bin/lib/issues/record-buckets.js` (Task 1); `RECORD_STALENESS_WEEKS` env var contract (Task 2).

- [ ] **Step 1: Build a fixture proving the OLD script's exact output**

Before editing anything, capture the current behavior as a regression oracle. Create `/tmp/help-fixture-records.json`:

```json
[
  { "updatedAt": "2020-01-01T00:00:00Z", "facets": { "stage": "backlog", "bot": { "inProgress": false, "blocked": false }, "grants": { "build": false, "merge": false } } },
  { "updatedAt": "2099-01-01T00:00:00Z", "facets": { "stage": "backlog", "bot": { "inProgress": false, "blocked": false }, "grants": { "build": false, "merge": false } } },
  { "facets": { "stage": "parked", "bot": { "inProgress": false, "blocked": false }, "grants": { "build": false, "merge": false } }, "milestone": { "dueOn": "2020-01-01T00:00:00Z" } },
  { "facets": { "stage": "ready", "bot": { "inProgress": false, "blocked": false }, "grants": { "build": false, "merge": false } } },
  { "facets": { "stage": "ready", "bot": { "inProgress": false, "blocked": false }, "grants": { "build": true, "merge": false } } },
  { "facets": { "stage": "ready", "bot": { "inProgress": true, "blocked": false }, "grants": { "build": true, "merge": false } } },
  { "facets": { "stage": "ready", "bot": { "inProgress": false, "blocked": true }, "grants": { "build": true, "merge": false } } }
]
```

(Row order: stale backlog, fresh backlog, wake-ready parked, plain ready, authorized, building, blocked.)

Run the CURRENT (pre-edit) inline script from `status-scan.md` against it — copy the exact `node -e "..."` block verbatim, pointing it at the fixture instead of `/tmp/help-records-faceted.json` — and save the output:

```bash
node -e "
  const records = require('/tmp/help-fixture-records.json');
  const now = Date.now();
  const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;
  const blocked = records.filter((r) => r.facets.bot.blocked);
  const building = records.filter((r) => !r.facets.bot.blocked && r.facets.bot.inProgress);
  const authorized = records.filter((r) => !r.facets.bot.blocked && !r.facets.bot.inProgress && r.facets.stage === 'ready' && (r.facets.grants.build || r.facets.grants.merge));
  const ready = records.filter((r) => !r.facets.bot.blocked && !r.facets.bot.inProgress && r.facets.stage === 'ready' && !r.facets.grants.build && !r.facets.grants.merge);
  const parked = records.filter((r) => !r.facets.bot.blocked && !r.facets.bot.inProgress && r.facets.stage === 'parked');
  const backlog = records.filter((r) => !r.facets.bot.blocked && !r.facets.bot.inProgress && r.facets.stage === 'backlog');
  const stale = backlog.filter((r) => r.updatedAt && now - Date.parse(r.updatedAt) > FOUR_WEEKS_MS);
  const wakeReady = parked.filter((r) => r.milestone && r.milestone.dueOn && Date.parse(r.milestone.dueOn) < now);
  console.log(JSON.stringify({
    backlog: backlog.length, backlogStale: stale.length,
    parked: parked.length, parkedWakeReady: wakeReady.length,
    ready: ready.length, authorized: authorized.length,
    building: building.length, blocked: blocked.length,
  }));
"
```

Expected output: `{"backlog":2,"backlogStale":1,"parked":1,"parkedWakeReady":1,"ready":1,"authorized":1,"building":1,"blocked":1}`

Save this exact line — it's the oracle Step 3 must match.

- [ ] **Step 2: Edit `status-scan.md`'s Stage 1 script**

In `skills/help/status-scan.md`, replace the existing Stage 1 script block (the one starting `node -e "` under "Both drivers land in the same faceted-record shape...") with:

```bash
WEEKS="${RECORD_STALENESS_WEEKS:-4}"
export STALENESS_WEEKS="$WEEKS"
node -e "
  const { isBacklog, isParked, isBotBlocked, isBotInProgress, classifyStaleness } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record-buckets.js');
  const records = require('/tmp/help-records-faceted.json');
  const now = Date.now();
  const thresholdMs = Number(process.env.STALENESS_WEEKS) * 7 * 24 * 60 * 60 * 1000;
  const blocked = records.filter((r) => isBotBlocked(r));
  const building = records.filter((r) => !isBotBlocked(r) && isBotInProgress(r));
  const authorized = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && r.facets.stage === 'ready' && (r.facets.grants.build || r.facets.grants.merge));
  const ready = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && r.facets.stage === 'ready' && !r.facets.grants.build && !r.facets.grants.merge);
  const parked = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && isParked(r));
  const backlog = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && isBacklog(r));
  const stale = backlog.filter((r) => r.updatedAt && classifyStaleness(now - Date.parse(r.updatedAt), thresholdMs) === 'stale');
  const wakeReady = parked.filter((r) => r.milestone && r.milestone.dueOn && Date.parse(r.milestone.dueOn) < now);
  console.log(JSON.stringify({
    backlog: backlog.length, backlogStale: stale.length,
    parked: parked.length, parkedWakeReady: wakeReady.length,
    ready: ready.length, authorized: authorized.length,
    building: building.length, blocked: blocked.length,
  }));
"
```

Leave the surrounding prose (the "Both drivers land in the same faceted-record shape..." lead-in, and the "`building` and `blocked` are always 0 under `local-files`..." trailing paragraph) as-is — only the script block itself changes.

- [ ] **Step 3: Run the NEW script against the same fixture and diff against the oracle**

```bash
WEEKS="4"
export STALENESS_WEEKS="$WEEKS"
node -e "
  const { isBacklog, isParked, isBotBlocked, isBotInProgress, classifyStaleness } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record-buckets.js');
  const records = require('/tmp/help-fixture-records.json');
  const now = Date.now();
  const thresholdMs = Number(process.env.STALENESS_WEEKS) * 7 * 24 * 60 * 60 * 1000;
  const blocked = records.filter((r) => isBotBlocked(r));
  const building = records.filter((r) => !isBotBlocked(r) && isBotInProgress(r));
  const authorized = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && r.facets.stage === 'ready' && (r.facets.grants.build || r.facets.grants.merge));
  const ready = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && r.facets.stage === 'ready' && !r.facets.grants.build && !r.facets.grants.merge);
  const parked = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && isParked(r));
  const backlog = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && isBacklog(r));
  const stale = backlog.filter((r) => r.updatedAt && classifyStaleness(now - Date.parse(r.updatedAt), thresholdMs) === 'stale');
  const wakeReady = parked.filter((r) => r.milestone && r.milestone.dueOn && Date.parse(r.milestone.dueOn) < now);
  console.log(JSON.stringify({
    backlog: backlog.length, backlogStale: stale.length,
    parked: parked.length, parkedWakeReady: wakeReady.length,
    ready: ready.length, authorized: authorized.length,
    building: building.length, blocked: blocked.length,
  }));
"
```

Expected: identical output to Step 1's oracle — `{"backlog":2,"backlogStale":1,"parked":1,"parkedWakeReady":1,"ready":1,"authorized":1,"building":1,"blocked":1}`. If it differs, the refactor changed behavior — stop and fix before proceeding.

- [ ] **Step 4: Prove a non-default threshold actually flips a classification (not just runs without erroring)**

Neither fixture record from Step 1 discriminates between threshold settings (one is ~6 years old — stale at any plausible threshold; the other is dated in the future — fresh at any threshold). Use a record whose age sits *between* two threshold settings instead, computed relative to "now" so the test doesn't go stale itself:

```bash
node -e "
  const { isBacklog, isBotBlocked, isBotInProgress, classifyStaleness } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record-buckets.js');
  const now = Date.now();
  const threeWeeksAgoIso = new Date(now - 21 * 24 * 60 * 60 * 1000).toISOString();
  const records = [{ updatedAt: threeWeeksAgoIso, facets: { stage: 'backlog', bot: { inProgress: false, blocked: false }, grants: { build: false, merge: false } } }];
  function countStale(weeks) {
    const thresholdMs = weeks * 7 * 24 * 60 * 60 * 1000;
    const backlog = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && isBacklog(r));
    const stale = backlog.filter((r) => r.updatedAt && classifyStaleness(now - Date.parse(r.updatedAt), thresholdMs) === 'stale');
    return stale.length;
  }
  console.log(JSON.stringify({ backlogStaleAt4Weeks: countStale(4), backlogStaleAt2Weeks: countStale(2) }));
"
```

Expected: `{"backlogStaleAt4Weeks":0,"backlogStaleAt2Weeks":1}` — a 3-week-old record is *not* stale under the default 4-week threshold but *is* stale under a 2-week threshold, proving `RECORD_STALENESS_WEEKS` genuinely changes classification outcomes, not just that the code path executes.

- [ ] **Step 5: Commit**

```bash
git add skills/help/status-scan.md
git commit -m "Wire /help Stage 1 into record-buckets.js and the record-staleness-weeks threshold"
```

---

### Task 4: Wire `/tidy`'s Step 1 Shapes 1/2/5 into the shared module

**Files:**
- Modify: `skills/tidy/scan-procedures.md` (Staleness clock section, Shape 1, Shape 2, Shape 5)

**Interfaces:**
- Consumes: `isBacklog`, `isParked`, `isBotBlocked`, `classifyStaleness` from `bin/lib/issues/record-buckets.js` (Task 1); `RECORD_STALENESS_WEEKS` env var contract (Task 2).

- [ ] **Step 1: Replace the Staleness clock's fixed 3-band table**

In `skills/tidy/scan-procedures.md`, replace:

```markdown
**Staleness clock**, either driver: per `_shared/record-queue-fetch.md`'s Staleness clock section (`{REPO_ROOT}` resolves the same way Step 4.5 below already documents). Same three-band scale used throughout this file:

| Age | Classification |
|-----|---------------|
| < 2 weeks | Fresh |
| 2-4 weeks | Review |
| > 4 weeks | Stale |
```

with:

```markdown
**Staleness clock**, either driver: per `_shared/record-queue-fetch.md`'s Staleness clock and
Threshold resolution sections (`{REPO_ROOT}` resolves the same way Step 4.5 below already
documents). Bands are computed by `classifyStaleness(ageMs, thresholdMs)`
(`bin/lib/issues/record-buckets.js`) against the resolved `record-staleness-weeks` threshold
(default 4 weeks): `fresh` below half the threshold, `review` from half the threshold up to
and including the threshold itself, `stale` beyond it. Same three-band scale used throughout
this file.
```

- [ ] **Step 2: Update Shape 1's predicate reference**

Replace:

```markdown
### Shape 1 — backlog record stale

`facets.stage === 'backlog'` — no stage label (`github-issues`) or no `stage:` frontmatter (`local-files`); the default state, per `_shared/work-record.md`'s lifecycle spine. Classify by the staleness clock above:
```

with:

```markdown
### Shape 1 — backlog record stale

`isBacklog(record)` (`bin/lib/issues/record-buckets.js`) — no stage label (`github-issues`) or no `stage:` frontmatter (`local-files`); the default state, per `_shared/work-record.md`'s lifecycle spine. Classify by the staleness clock above:
```

- [ ] **Step 3: Update Shape 2's predicate reference**

Replace the Shape 2 header line:

```markdown
### Shape 2 — parked trigger met

`facets.stage === 'parked'`. Judge the trigger live — the same evidence `_shared/github-pr-scan.md`'s `repo-wide` scope and the Evidence tier (`SKILL.md` Step 6) already read, so this shape and those procedures never disagree:
```

with:

```markdown
### Shape 2 — parked trigger met

`isParked(record)` (`bin/lib/issues/record-buckets.js`). Judge the trigger live — the same evidence `_shared/github-pr-scan.md`'s `repo-wide` scope and the Evidence tier (`SKILL.md` Step 6) already read, so this shape and those procedures never disagree:
```

- [ ] **Step 4: Update Shape 5's predicate reference**

Replace:

```markdown
### Shape 5 — `bot:blocked` needing re-triage

`facets.bot.blocked === true` (`work-backend: github-issues` only — the local driver carries no bot state). The record hit its retry ceiling (`_shared/issue-claims.md`, `dispatch/SKILL.md`'s Settle step) and needs a human's renewed judgment at `/claude-tweaks:backlog refine` before it can re-enter the autonomous queue.
```

with:

```markdown
### Shape 5 — `bot:blocked` needing re-triage

`isBotBlocked(record)` (`bin/lib/issues/record-buckets.js`; `work-backend: github-issues` only — the local driver's `facets.bot.blocked` is always `false`, per `facet-shape.js`'s shared defaults, so this predicate never fires there). The record hit its retry ceiling (`_shared/issue-claims.md`, `dispatch/SKILL.md`'s Settle step) and needs a human's renewed judgment at `/claude-tweaks:backlog refine` before it can re-enter the autonomous queue.
```

- [ ] **Step 5: Verify each predicate call directly against representative fixture records**

```bash
node -e "
  const { isBacklog, isParked, isBotBlocked, classifyStaleness } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record-buckets.js');
  const backlogRecord = { facets: { stage: 'backlog', bot: { inProgress: false, blocked: false } } };
  const parkedRecord = { facets: { stage: 'parked', bot: { inProgress: false, blocked: false } } };
  const blockedRecord = { facets: { stage: 'ready', bot: { inProgress: false, blocked: true } } };
  console.log(JSON.stringify({
    backlogIsBacklog: isBacklog(backlogRecord),
    parkedIsParked: isParked(parkedRecord),
    blockedIsBotBlocked: isBotBlocked(blockedRecord),
    fourWeeksExactlyAtThreshold: classifyStaleness(28 * 24 * 60 * 60 * 1000, 28 * 24 * 60 * 60 * 1000),
  }));
"
```

Expected: `{"backlogIsBacklog":true,"parkedIsParked":true,"blockedIsBotBlocked":true,"fourWeeksExactlyAtThreshold":"review"}` — matching Shape 1/2/5's old inline-boolean behavior and the original "2-4 weeks = Review" band (4 weeks exactly is still Review, not Stale, matching the original table's "> 4 weeks" strict-greater-than Stale cutoff).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — 0 failures (this task only edits markdown; confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add skills/tidy/scan-procedures.md
git commit -m "Wire /tidy Shapes 1/2/5 into record-buckets.js and the record-staleness-weeks threshold"
```

---

### Task 5: Final sweep and full-suite verification

**Files:**
- None created or modified (verification only) unless the sweep in Step 1 finds a leftover.

- [ ] **Step 1: Grep for leftover duplicated logic**

```bash
grep -rn "FOUR_WEEKS_MS" skills/
grep -rn "facets\.stage === 'backlog'" skills/help/ skills/tidy/
grep -rn "facets\.stage === 'parked'" skills/help/ skills/tidy/
grep -rn "facets\.bot\.blocked === true" skills/help/ skills/tidy/
```

Expected: no matches in `skills/help/status-scan.md` or `skills/tidy/scan-procedures.md` (the files this plan edited). Matches elsewhere are expected and out of scope — see Global Constraints — including one already confirmed present before this plan touches anything: `skills/tidy/SKILL.md:116` describes the unrelated Sync-to-GitHub action's `recordPayload` construction (`parked: facets.stage === 'parked'`), not the Step 1 classification logic this plan changes. Do not edit it. Likewise `/tidy` Step 5's `facets.bot.inProgress === false` (`scan-procedures.md` line ~295) is a real match this plan deliberately leaves alone (see Task 5 Step 3).

- [ ] **Step 2: Run the full test suite one more time**

Run: `npm test`
Expected: PASS — same count as Task 1 Step 5, 0 failures.

- [ ] **Step 3: Report the out-of-scope finding to the user**

No commit for this task. In the final report to the user, explicitly flag: `/tidy`'s Step 5 (Record Sizing Review, `scan-procedures.md` line ~295) has its own independent `facets.bot.inProgress === false` check — a third instance of the same predicate this plan just extracted — that the approved design scoped out. Offer it as a one-line, low-risk fast-follow the user can request separately.

---

## Self-Review Notes

- **Spec coverage:** every "In scope" bullet from the design doc has a task — module (Task 1), config key + resolution (Task 2), `/help` integration (Task 3), `/tidy` integration (Task 4), unit tests (Task 1). Every "Out of scope" bullet is respected (Shapes 4/7, `/help`'s authorized/building split, no init changes, no CLI-arg tier untouched).
- **Placeholder scan:** no TBD/TODO; every step has literal code/commands, not descriptions of what to do.
- **Type/name consistency:** `isBacklog`/`isParked`/`isBotBlocked`/`isBotInProgress`/`classifyStaleness` are spelled identically across Task 1's module, and Tasks 3/4's `require()` calls. `RECORD_STALENESS_WEEKS` (env var) and `record-staleness-weeks` (config key name) are used consistently and distinctly across Tasks 2, 3, and 4 — the former is the resolved/exported shell variable, the latter is the CLAUDE.md key name, never conflated.
- **New finding during plan-writing (already reflected above):** the design doc originally assumed `facets.bot` could be `undefined` under `local-files`, requiring optional chaining, and assumed the config key lived alongside `tidy-aggressiveness`. Both were verified wrong against the actual current code/docs (`facet-shape.js`'s `sharedFacetDefaults()`; `_shared/auto-mode-contract.md`'s Manifesto-lever mechanism) and corrected in the design doc before this plan was written — see that file's git history for the two fix-up commits.
