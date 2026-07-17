# docs-health Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `docs-health` — a new recurring, LLM-judged, GitHub-issue-filing skill that sweeps `docs/**` for Diátaxis genre-drift (implied doc type vs. actual content shape) and factual staleness, mirroring `code-health`/`harness-health`'s SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline exactly.

**Architecture:** A file-based rotation engine (`bin/lib/docs-health/scope.js`, modeled on `harness-health`'s target-list shape, not `code-health`'s directory-slice shape) walks `docs/**` — excluding `docs/superpowers/**` (ephemeral build artifacts) and structurally never touching `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md (harness-health's exclusive territory, since docs-health's walker never leaves `docs/`). Findings fingerprint on `assetType + target + section` (harness-health's shape), file onto the unified work-record contract (`by:docs-health`, `risk:*`/`effort:*`, `ready`), and persist rotation cursors + retry queue on the durable `health-state` branch via the shared `bin/lib/health-core/*` primitives (zero new persistence code).

**Tech Stack:** Node.js (`node --test`), `gh` CLI, existing `bin/lib/issues/record.js` (record-payload assembly) and `bin/lib/health-core/*` (durable-state, dedup, retry-cli, runs).

## Global Constraints

- Node 18+, CommonJS (`'use strict'`, `require`/`module.exports`) — matches every existing `bin/lib/**` module. No new npm dependencies.
- Report-only: docs-health must never call `Edit`/`Write` against `docs/**` content anywhere in its documented workflow or its engine code — it only ever calls `gh issue create`/`gh issue reopen`/`gh issue comment`.
- Follow the unified work-record contract (`skills/_shared/work-record.md`) exactly: origin `by:docs-health`, `risk:*`/`effort:*` scoring derived from a `classification -> scoring` fold table (`additive` → `risk:low`/`effort:low`, `restructural` → `risk:medium`/`effort:high`), `ready` stage, Type `task`, `<!-- work-fingerprint: ... -->` marker.
- Every new `bin/lib/docs-health/*.js` module gets a sibling `bin/lib/docs-health/tests/*.test.js` file, following the exact `node:test` + `node:assert` style already used by `bin/lib/harness-health/tests/*.test.js` (no test framework dependency).
- No emojis anywhere (CLAUDE.md convention).
- Version bump: this is a feature addition — `.claude-plugin/plugin.json`'s `version` must be bumped from `6.1.1` to `6.2.0` (minor bump) as part of this build, per CLAUDE.md's Releasing convention. Task 9's final step does this explicitly — do not defer it or assume a later pass will remember.

---

## Task 1: Shared taxonomy plumbing — register `docs-health` as a valid record origin

**Files:**
- Modify: `bin/lib/issues/record.js:8` (the `ORIGINS` array)
- Modify: `skills/_shared/work-record.md` (Origin axis table row + "four members" prose + Consumers table)
- Modify: `skills/_shared/label-bootstrap.md` (canonical `LABELS_JSON`)
- Test: `bin/lib/issues/tests/record.test.js` (existing file — add coverage for the new origin)

**Interfaces:**
- Consumes: nothing new.
- Produces: `recordPayload({ origin: 'docs-health', ... })` no longer throws; every later task that calls `recordPayload`/`toIssuePayload` with `origin: 'docs-health'` depends on this.

- [ ] **Step 1: Write the failing test**

Find `bin/lib/issues/tests/record.test.js` and add this test (append near any existing `recordPayload` origin tests — match the file's existing style):

```javascript
test('recordPayload accepts origin: docs-health', () => {
  const payload = recordPayload({ title: 'x', body: 'y', type: 'task', origin: 'docs-health' });
  assert.ok(payload.labels.includes('by:docs-health'));
});
```

(Add the necessary `test`/`assert`/`recordPayload` requires at the top of the file if they are not already imported under those exact names — check the file's existing header first; do not duplicate an import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: FAIL — `recordPayload: origin must be one of code-health|harness-health|journey-health|capture (got "docs-health")`

- [ ] **Step 3: Add `docs-health` to the ORIGINS enum**

In `bin/lib/issues/record.js`, change line 8 from:

```javascript
const ORIGINS = ['code-health', 'harness-health', 'journey-health', 'capture'];
```

to:

```javascript
const ORIGINS = ['code-health', 'harness-health', 'journey-health', 'docs-health', 'capture'];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: PASS

- [ ] **Step 5: Update `_shared/work-record.md`'s Origin axis documentation**

In `skills/_shared/work-record.md`, find this line (in the "## The six axes" table):

```
| **Origin** | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:capture` — or no label | Label. Absence = human-filed directly, or a side-effect record (see below) |
```

Replace with:

```
| **Origin** | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:docs-health`, `by:capture` — or no label | Label. Absence = human-filed directly, or a side-effect record (see below) |
```

Find this prose (in the "Origin axis, the two no-label cases" paragraph):

```
The `by:*` family has exactly
four members — one per filing skill: `by:code-health`, `by:harness-health`,
`by:journey-health`, `by:capture`.
```

Replace with:

```
The `by:*` family has exactly
five members — one per filing skill: `by:code-health`, `by:harness-health`,
`by:journey-health`, `by:docs-health`, `by:capture`.
```

Find this line (in the "## Label taxonomy" table's Origin row):

```
| Origin (4) | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:capture` | Origin |
```

Replace with:

```
| Origin (5) | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:docs-health`, `by:capture` | Origin |
```

Update the header line "17 core labels + 3 optional `priority:*` labels" to "18 core labels + 3 optional `priority:*` labels" (one new `by:docs-health` label added to the taxonomy).

Find this line (in the "## Consumers" table, right after the `/journey-health`/`/capture` row — insert a new row directly beneath the existing health-skills row):

```
| `/code-health`, `/harness-health`, `/journey-health` | File born-`ready` records with origin + scoring + fingerprint |
```

Replace with:

```
| `/code-health`, `/harness-health`, `/journey-health`, `/docs-health` | File born-`ready` records with origin + scoring + fingerprint |
```

- [ ] **Step 6: Update `_shared/label-bootstrap.md`'s canonical `LABELS_JSON`**

In `skills/_shared/label-bootstrap.md`, find the `LABELS_JSON` code block's Origin section:

```javascript
[
  ["by:code-health",    "Origin: filed by the code-health skill"],
  ["by:harness-health", "Origin: filed by the harness-health skill"],
  ["by:journey-health", "Origin: filed by the journey-health skill"],
  ["by:capture",        "Origin: filed via /capture"],
```

Replace with:

```javascript
[
  ["by:code-health",    "Origin: filed by the code-health skill"],
  ["by:harness-health", "Origin: filed by the harness-health skill"],
  ["by:journey-health", "Origin: filed by the journey-health skill"],
  ["by:docs-health",    "Origin: filed by the docs-health skill"],
  ["by:capture",        "Origin: filed via /capture"],
```

Update the line "The complete label set from `_shared/work-record.md` (17 core + 3 optional `priority:*` labels)" to "(18 core + 3 optional `priority:*` labels)".

- [ ] **Step 7: Commit**

```bash
git add bin/lib/issues/record.js bin/lib/issues/tests/record.test.js skills/_shared/work-record.md skills/_shared/label-bootstrap.md
git commit -m "Register docs-health as a valid work-record origin

refs #36"
```

---

## Task 2: Diátaxis genre-drift + staleness criteria fragment

**Files:**
- Create: `skills/_shared/criteria-docs-diataxis.md`

**Interfaces:**
- Consumes: nothing (pure prose reference, no code).
- Produces: the calibration text `skills/docs-health/SKILL.md` (Task 8) loads and embeds in its judge step; the vocabulary (`category`, `misleads`, `classification`) that `bin/lib/docs-health/validate-finding.js` (Task 5) encodes as enums.

This file has no automated test — matching the existing convention: `skills/_shared/criteria-simplification.md` and every other `criteria-*.md` fragment is pure prose consumed by an LLM judge step, never itself unit tested. `bin/lib/docs-health/validate-finding.js`'s tests (Task 5) are what mechanically enforce the vocabulary this fragment defines.

- [ ] **Step 1: Write the criteria fragment**

Create `skills/_shared/criteria-docs-diataxis.md` with this exact content:

```markdown
# Criteria: Docs Diátaxis Genre-Drift + Staleness

Shared, criteria-only fragment — the "what is worth flagging in `docs/**`" knowledge for `/claude-tweaks:docs-health`. No workflow, no subagent dispatch, no Next Actions. Encodes the Diátaxis framework (tutorial / how-to / reference / explanation) as a genre-drift check, plus a factual-staleness check, plus dual-persona misleading-risk tagging — the three dimensions a manual one-off Diátaxis audit found real drift with in a downstream project (two "reference" docs that were secretly how-to walkthroughs, unmarked roadmap content in a reference doc, a section index stating a stale item count for 4+ months).

## Dimension 1 — Genre-drift (implied type vs. found type)

Every doc has an **implied type** — inferred from its location (a file under a directory or section named "reference", "guide", "how-to", "tutorial", "explanation", "concepts", "background") or its own heading/title language ("Reference:", "How to...", "Getting Started", "Understanding..."). Compare the implied type against the **found type** — what the content actually does:

| Diátaxis type | What it actually does |
|---|---|
| Tutorial | Walks a beginner through a concrete learning exercise, start to finish |
| How-to guide | Gives goal-directed steps to accomplish a specific task, assumes some competence |
| Reference | States facts — API shapes, config keys, field tables — with no narrative or step sequence |
| Explanation | Discusses why, context, background, tradeoffs — no steps, no fact tables |

A doc whose implied type and found type diverge is genre-drift. The canonical failure shape from the original audit: a "reference"-section doc that is actually 1000+ lines of procedural how-to instructions before a single reference-shaped paragraph. Also flag: unmarked forward-looking/roadmap content in a doc that reads as describing shipped, current functionality — a reader (human or agent) cannot tell the difference between "this exists" and "this is planned" without an explicit marker.

## Dimension 2 — Staleness (stated facts vs. live reality)

Docs assert facts that can go stale independently of prose quality: item counts ("N skills," "M endpoints"), "as of {date}" markers, version numbers, feature-availability claims, links to files/paths that may have moved or been deleted. Check each stated fact against the live repository state:

- A stated count — grep/count the actual thing and compare.
- A referenced file/path — confirm it still exists at that location.
- A version or "as of" marker — compare against the current state; flag if stale by more than a trivial margin.
- A "coming soon" / "not yet implemented" marker on something that has since shipped (or vice versa).

The canonical failure shape from the original audit: a section index page stating a stale item count for 4+ months, self-acknowledging the gap in its own text the whole time.

## Dimension 3 — Misleading-risk tagging (dual persona)

For every finding, judge who it misleads and how badly, as a fact independent of category:

- **`human`** — a human reader skims the title, catches inconsistencies from surrounding context, or notices a caveat buried in prose. Misleading risk is real but partially self-correcting.
- **`agent`** — a coding agent consuming this doc via retrieval (a chunked search hit, not a full read-through) has no "skim the title, notice the caveat" safety net. A stale fact or wrong genre-shaped chunk is taken at face value. This is the higher-stakes case — weight it accordingly when judging `classification`/`confidence`.
- **`both`** — misleads either reader equally.

In the original audit, 2 of 5 findings flagged agent-risk as primary — treat this as a real, common outcome, not an edge case.

## Emitting a finding

Each finding carries: `target` (the doc's id, e.g. `decisions/0007-foo`), `assetType` (always `"doc"`), `section` (the heading within the doc, or `"Freshness"` for a whole-doc staleness finding with no single section), `category` (`"genre-drift"` | `"staleness"` — Dimension 1 or Dimension 2, pick whichever the finding is actually about), `misleads` (`"human"` | `"agent"` | `"both"` — Dimension 3), `classification` (`"additive"` | `"restructural"` — same vocabulary as harness-health: a one-line fact correction or an added disclaimer is `additive`; reorganizing a doc that mixes genres, or splitting a doc, is `restructural`), `confidence`, `reversibility`, `oldString`/`newString` (the patch itself — `oldString` may be empty for a pure addition).

## What is worth flagging

- A doc whose implied type (by location/heading) doesn't match its found type (by content shape).
- Unmarked forward-looking/roadmap content presented as shipped.
- A stated fact (count, date, path, version, availability) that no longer matches live repository state.
- A doc that has explicitly and visibly acknowledged its own staleness in its own text without being fixed (the "self-acknowledging gap" pattern).

## Constraints (what NOT to flag)

- **Content quality is not this check's job.** Judging whether prose is well-written, whether an explanation is clear, or whether a tutorial's pacing is good is not genre-drift or staleness — don't flag it here. This mirrors `_shared/work-record.md`'s spec-shaped-body check: structural-plus-minimal, not editorial.
- **Don't flag mechanical/unambiguous issues.** Broken links, malformed frontmatter, and missing structural metadata belong in the consuming project's own build/CI pipeline — the same "CI stays reactive" boundary `code-health` already draws for code. Only flag genre-drift and factual staleness, which require holistic judgment.
- **`docs/superpowers/**` is out of scope entirely** — it is never in the rotation pool `bin/lib/docs-health/scope.js` builds, so this fragment never sees it. If it somehow appears in a batch, do not judge it: it is ephemeral `/specify` + `/superpowers:writing-plans` build history, not Diátaxis-portal content.
- **`.claude/skills/**`, `.claude/rules/**`, and `CLAUDE.md` are `harness-health`'s territory**, not this fragment's — docs-health's rotation pool structurally never includes them (it only ever walks `docs/`), so this should never come up, but if a project mirrors skill docs into `docs/**` as a portal section, judge that copy's genre-shape and staleness like any other doc — never its harness-accuracy or template-conformance, which stays `harness-health`'s job.
```

- [ ] **Step 2: Verify the file was created correctly**

Run: `test -f skills/_shared/criteria-docs-diataxis.md && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/criteria-docs-diataxis.md
git commit -m "Add Diátaxis genre-drift + staleness criteria fragment for docs-health

refs #36"
```

---

## Task 3: Health-core wrapper modules (`score.js`, `fingerprint.js`, `cache.js`, `dedup.js`)

**Files:**
- Create: `bin/lib/docs-health/score.js`
- Create: `bin/lib/docs-health/fingerprint.js`
- Create: `bin/lib/docs-health/cache.js`
- Create: `bin/lib/docs-health/dedup.js`
- Test: `bin/lib/docs-health/tests/fingerprint.test.js`
- Test: `bin/lib/docs-health/tests/cache.test.js`
- Test: `bin/lib/docs-health/tests/dedup.test.js`
- Test: `bin/lib/docs-health/tests/build-validate-findings-update.test.js`
- Modify: `package.json` (`scripts.test`)

**Interfaces:**
- Consumes: `bin/lib/health-core/fingerprint.js` (`normalizeText`, `fingerprintFromBasis`), `bin/lib/health-core/cache.js` (`createCache`), `bin/lib/health-core/durable-state.js` (`createDurableState`), `bin/lib/health-core/dedup.js` (`decide`) — all pre-existing, unmodified.
- Produces: `bin/lib/docs-health/score.js` exports `{ STALE_DAYS }` (value `60`) — consumed by Task 4's `scope.js`. `bin/lib/docs-health/fingerprint.js` exports `{ fingerprint({assetType, target, section, description}) -> string, normalizeDescription }` — `fingerprint` returns a string matching `/^docshealth-[0-9a-f]{8}$/` — consumed by Task 7's CLI. `bin/lib/docs-health/cache.js` exports `{ cachePath, readCache, writeCache, readDurableState, writeDurableState, buildValidateFindingsUpdate(current, {target, runRecord, now}) -> nextState }` — consumed by Task 7's CLI. `bin/lib/docs-health/dedup.js` exports `{ decide(finding, issueIndex, cache) -> {action, ...} }` — consumed by Task 7's CLI.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/docs-health/tests/fingerprint.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { fingerprint, normalizeDescription } = require('../fingerprint');

test('fingerprint returns a docshealth-<8hex> id', () => {
  const id = fingerprint({ assetType: 'doc', target: 'decisions/0007-foo', section: 'Freshness', description: 'stated count is stale' });
  assert.match(id, /^docshealth-[0-9a-f]{8}$/);
});

test('fingerprint is stable across whitespace and case differences in description', () => {
  const a = fingerprint({ assetType: 'doc', target: 'decisions/0007-foo', section: 'Freshness', description: 'Stale   Item Count' });
  const b = fingerprint({ assetType: 'doc', target: 'decisions/0007-foo', section: 'Freshness', description: 'stale item count' });
  assert.strictEqual(a, b);
});

test('fingerprint differs when assetType, target, section, or description differs', () => {
  const base = { assetType: 'doc', target: 'decisions/0007-foo', section: 'Freshness', description: 'stale count' };
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, assetType: 'other' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, target: 'guides/setup' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, section: 'Overview' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, description: 'different text' }));
});

test('normalizeDescription collapses whitespace and lowercases', () => {
  assert.strictEqual(normalizeDescription('  Foo   BAR  baz '), 'foo bar baz');
});
```

Create `bin/lib/docs-health/tests/cache.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cachePath, readCache, writeCache, readDurableState, writeDurableState } = require('../cache');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-cache-')); }

test('readCache returns {} when the cache file does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readCache(root), {});
});

test('writeCache then readCache round-trips', () => {
  const root = tmp();
  writeCache(root, { 'docshealth-abc123': { status: 'staged', lastSeenMs: 1000 } });
  assert.deepStrictEqual(readCache(root), { 'docshealth-abc123': { status: 'staged', lastSeenMs: 1000 } });
});

test('cachePath points under .claude-tweaks/docs-health/cache.json', () => {
  const root = tmp();
  assert.strictEqual(cachePath(root), path.join(root, '.claude-tweaks', 'docs-health', 'cache.json'));
});

test('readDurableState/writeDurableState are exported and bound to docs-health', () => {
  assert.strictEqual(typeof readDurableState, 'function');
  assert.strictEqual(typeof writeDurableState, 'function');
});
```

Create `bin/lib/docs-health/tests/dedup.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../dedup');

test('decide files a brand-new finding with no issue or cache match', () => {
  assert.deepStrictEqual(decide({ id: 'docshealth-abc' }, {}, {}), { action: 'file' });
});

test('decide skips when an open issue already matches the fingerprint', () => {
  const issueIndex = { 'docshealth-abc': { number: 42, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'docshealth-abc' }, issueIndex, {}), { action: 'skip', issue: 42 });
});

test('decide suppresses when the matching issue is labelled wontfix', () => {
  const issueIndex = { 'docshealth-abc': { number: 42, state: 'open', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'docshealth-abc' }, issueIndex, {}), { action: 'suppress', issue: 42 });
});

test('decide reopens when the matching issue is closed and not wontfix (regressed)', () => {
  const issueIndex = { 'docshealth-abc': { number: 42, state: 'closed', labels: [] } };
  const result = decide({ id: 'docshealth-abc' }, issueIndex, {});
  assert.strictEqual(result.action, 'reopen');
  assert.strictEqual(result.issue, 42);
});

test('decide suppresses a finding the local cache marked declined', () => {
  const cache = { 'docshealth-abc': { status: 'declined', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'docshealth-abc' }, {}, cache), { action: 'suppress' });
});

test('decide skips a finding the local cache marked staged', () => {
  const cache = { 'docshealth-abc': { status: 'staged', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'docshealth-abc' }, {}, cache), { action: 'skip' });
});
```

Create `bin/lib/docs-health/tests/build-validate-findings-update.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildValidateFindingsUpdate } = require('../cache');

function baseCurrent(overrides = {}) {
  return { cursors: {}, retryQueue: [], runs: [], ...overrides };
}

test('buildValidateFindingsUpdate: target creates a new namespaced cursor entry', () => {
  const current = baseCurrent();
  const now = 1000000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'decisions/0007-foo',
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors['doc:decisions/0007-foo'], { lastAuditedMs: now });
});

test('buildValidateFindingsUpdate: target on an existing cursor overwrites it, leaving other keys untouched', () => {
  const current = baseCurrent({
    cursors: {
      'doc:decisions/0007-foo': { lastAuditedMs: 500 },
      'doc:guides/setup': { lastAuditedMs: 999 },
    },
  });
  const now = 2000000;
  const next = buildValidateFindingsUpdate(current, {
    target: 'decisions/0007-foo',
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now,
  });
  assert.deepStrictEqual(next.cursors['doc:decisions/0007-foo'], { lastAuditedMs: now });
  assert.deepStrictEqual(next.cursors['doc:guides/setup'], { lastAuditedMs: 999 });
});

test('buildValidateFindingsUpdate: no target leaves cursors unchanged', () => {
  const current = baseCurrent({ cursors: { 'doc:a': { lastAuditedMs: 1 } } });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.cursors, current.cursors);
});

test('buildValidateFindingsUpdate: the new run record is appended to (not replacing) current.runs', () => {
  const priorRun = { runId: 'r0', runAt: 'earlier', fingerprints: ['docshealth-aaaa0001'] };
  const current = baseCurrent({ runs: [priorRun] });
  const newRun = { runId: 'r1', runAt: 'later', fingerprints: ['docshealth-bbbb0002'] };
  const next = buildValidateFindingsUpdate(current, { target: undefined, runRecord: newRun, now: 1 });
  assert.deepStrictEqual(next.runs, [priorRun, newRun]);
});

test('buildValidateFindingsUpdate: passes through unrelated current fields (e.g. retryQueue) untouched', () => {
  const current = baseCurrent({ retryQueue: [{ fingerprint: 'docshealth-xyz', attempts: 1 }] });
  const next = buildValidateFindingsUpdate(current, {
    target: undefined,
    runRecord: { runId: 'r1', runAt: 'now', fingerprints: [] },
    now: 1,
  });
  assert.deepStrictEqual(next.retryQueue, current.retryQueue);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/docs-health/tests/*.test.js`
Expected: FAIL — `Cannot find module '../fingerprint'` (and similarly for `../cache`, `../dedup`) since none of the four source modules exist yet.

- [ ] **Step 3: Write `score.js`**

Create `bin/lib/docs-health/score.js`:

```javascript
'use strict';
// Round-robin floor: docs unaudited past this many days are force-boosted
// regardless of churn. Between code-health's 30-day floor (code bugs move
// fast) and harness-health's 90-day floor (skill-doc drift moves slow) —
// docs/** content (guides, references, ADRs) tracks a live codebase (like
// code) but isn't itself instruction text an agent executes every turn
// (like a skill file), so it sits between the two.
const STALE_DAYS = 60;

module.exports = { STALE_DAYS };
```

- [ ] **Step 4: Write `fingerprint.js`**

Create `bin/lib/docs-health/fingerprint.js`:

```javascript
'use strict';
const { normalizeText, fingerprintFromBasis } = require('../health-core/fingerprint');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) { return normalizeText(description); }

// Stable id from assetType + target + section + normalized description —
// harness-health's fingerprint shape (assetType+target stand in for
// criterion, section stands in for areaId, description stands in for
// anchor), not code-health's relfile#Symbol shape — docs are prose, no
// named symbols to anchor on.
function fingerprint({ assetType, target, section, description }) {
  return fingerprintFromBasis('docshealth', [assetType, target, section, normalizeDescription(description)]);
}

module.exports = { fingerprint, normalizeDescription };
```

- [ ] **Step 5: Write `cache.js`**

Create `bin/lib/docs-health/cache.js`:

```javascript
'use strict';
const { createCache } = require('../health-core/cache');
const { createDurableState } = require('../health-core/durable-state');

// Local, gitignored: cache.json only (rebuildable-from-issues dedup state).
// Canonical path: <root>/.claude-tweaks/docs-health/cache.json
//
// Cursors and run history are durable instead — they live on the
// health-state branch (see _shared/health-state.md), not local disk, since
// local disk doesn't survive a scheduled cloud-routine firing's container
// recycling.

const core = createCache('docs-health');
const durable = createDurableState('docs-health');

// Pure: computes the next durable-state object for a validate-findings run.
// current: { cursors, retryQueue, runs } — the current durable health-state
// shape (as returned by readDurableState). docs-health has a single kind
// ('doc') and no gap-scan concept, so this is simpler than harness-health's
// equivalent — no `kind` param, no `__gapScan` cursor.
// opts: { target, runRecord, now? }
function buildValidateFindingsUpdate(current, { target, runRecord, now = Date.now() }) {
  const cursors = { ...current.cursors };
  if (target) {
    cursors[`doc:${target}`] = { lastAuditedMs: now };
  }
  return { ...current, cursors, runs: [...current.runs, runRecord] };
}

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  readDurableState: durable.readState,
  writeDurableState: durable.writeState,
  buildValidateFindingsUpdate,
};
```

- [ ] **Step 6: Write `dedup.js`**

Create `bin/lib/docs-health/dedup.js`:

```javascript
'use strict';
module.exports = require('../health-core/dedup');
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --test bin/lib/docs-health/tests/*.test.js`
Expected: PASS (all tests in all four files)

- [ ] **Step 8: Wire the new test directory into `npm test`**

In `package.json`, find the `scripts.test` value:

```
"node --test tests/ bin/lib/code-health/tests/*.test.js bin/lib/issues/tests/*.test.js bin/lib/harness-health/tests/*.test.js bin/lib/journey-health/tests/*.test.js bin/lib/health-core/tests/*.test.js"
```

Append `bin/lib/docs-health/tests/*.test.js` to the end:

```
"node --test tests/ bin/lib/code-health/tests/*.test.js bin/lib/issues/tests/*.test.js bin/lib/harness-health/tests/*.test.js bin/lib/journey-health/tests/*.test.js bin/lib/health-core/tests/*.test.js bin/lib/docs-health/tests/*.test.js"
```

Run: `npm test 2>&1 | tail -20`
Expected: the summary shows more passing tests than before this task, 0 new failures (some pre-existing flaky timing tests may still intermittently fail — see this build's own baseline note; that is not this task's concern).

- [ ] **Step 9: Commit**

```bash
git add bin/lib/docs-health/score.js bin/lib/docs-health/fingerprint.js bin/lib/docs-health/cache.js bin/lib/docs-health/dedup.js bin/lib/docs-health/tests/ package.json
git commit -m "Add docs-health health-core wrapper modules (score, fingerprint, cache, dedup)

refs #36"
```

---

## Task 4: Rotation engine (`scope.js`) — file-based target selection over `docs/**`

**Files:**
- Create: `bin/lib/docs-health/scope.js`
- Test: `bin/lib/docs-health/tests/scope.test.js`

**Interfaces:**
- Consumes: `STALE_DAYS` from `./score` (Task 3, already merged).
- Produces: `module.exports = { listDocs(root) -> [{kind:'doc', id, path}], extractDomainPaths(content) -> string[], domainChurn(root, relPaths, sinceMs) -> number, selectTarget(root, cursors, opts) -> {kind:'doc', id, path, why:'stale'|'hotspot', daysSinceLastAudit?, churnCount?} | null }` — consumed by Task 7's CLI (`selectTarget`, `listDocs`).

- [ ] **Step 1: Write the failing test**

Create `bin/lib/docs-health/tests/scope.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { listDocs, extractDomainPaths, domainChurn, selectTarget } = require('../scope');
const { listTargets } = require('../../harness-health/scope');
const { STALE_DAYS } = require('../score');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-scope-')); }

function initGitRepo(root) {
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@test.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
}

function commit(root, msg) {
  execFileSync('git', ['-C', root, 'add', '-A']);
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', msg]);
}

// ── listDocs ────────────────────────────────────────────────────────────

test('listDocs returns [] when docs/ does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listDocs(root), []);
});

test('listDocs recursively lists .md files under docs/, sorted by id, tagged kind: doc', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'guides'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'decisions', '0007-foo.md'), '# foo');
  fs.writeFileSync(path.join(root, 'docs', 'guides', 'setup.md'), '# setup');
  const docs = listDocs(root);
  assert.deepStrictEqual(docs.map((d) => d.id), ['decisions/0007-foo', 'guides/setup']);
  assert.strictEqual(docs[0].kind, 'doc');
  assert.strictEqual(docs[0].path, path.join(root, 'docs', 'decisions', '0007-foo.md'));
});

test('listDocs ignores non-.md files', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'notes.txt'), 'ignore me');
  fs.writeFileSync(path.join(root, 'docs', 'readme.md'), '# readme');
  assert.deepStrictEqual(listDocs(root).map((d) => d.id), ['readme']);
});

test('listDocs excludes docs/superpowers/** entirely', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs', 'superpowers', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'superpowers', 'specs', '2026-01-01-foo-design.md'), '# design doc');
  fs.writeFileSync(path.join(root, 'docs', 'decisions', '0001-bar.md'), '# bar');
  assert.deepStrictEqual(listDocs(root).map((d) => d.id), ['decisions/0001-bar']);
});

test('listDocs never overlaps with harness-health\'s own target list', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'guides'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth skill');
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'api-errors.md'), '# api errors rule');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# project');
  fs.writeFileSync(path.join(root, 'docs', 'guides', 'setup.md'), '# setup');

  const docsHealthPaths = new Set(listDocs(root).map((d) => d.path));
  const harnessHealthPaths = new Set(listTargets(root).map((t) => t.path));
  const overlap = [...docsHealthPaths].filter((p) => harnessHealthPaths.has(p));
  assert.deepStrictEqual(overlap, [], 'docs-health and harness-health target lists must never overlap');
});

// ── extractDomainPaths / domainChurn ────────────────────────────────────

test('extractDomainPaths finds backtick-quoted file paths', () => {
  const content = 'See `src/api/user.js` for the pattern, also `bin/docs-health.js`.';
  assert.deepStrictEqual(extractDomainPaths(content).sort(), ['bin/docs-health.js', 'src/api/user.js']);
});

test('extractDomainPaths ignores backtick-quoted strings with no slash', () => {
  const content = 'Run `npm test` and see `SKILL.md`.';
  assert.deepStrictEqual(extractDomainPaths(content), []);
});

test('domainChurn returns 0 when git is unavailable or paths do not exist', () => {
  const root = tmp();
  assert.strictEqual(domainChurn(root, ['src/nope.js'], 0), 0);
});

// ── selectTarget ─────────────────────────────────────────────────────────

test('selectTarget returns null when there are no docs at all', () => {
  const root = tmp();
  assert.strictEqual(selectTarget(root, {}), null);
});

test('selectTarget force-picks a never-audited doc as stale', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'readme.md'), '# readme');
  const result = selectTarget(root, {}, { now: 1000000 });
  assert.strictEqual(result.id, 'readme');
  assert.strictEqual(result.why, 'stale');
});

test('selectTarget does not force-pick a doc audited within STALE_DAYS', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'readme.md'), '# readme');
  const now = Date.now();
  const cursors = { 'doc:readme': { lastAuditedMs: now - (STALE_DAYS - 1) * 86400000 } };
  const result = selectTarget(root, cursors, { now, signals: {} });
  assert.strictEqual(result, null, 'no churn signal and not stale yet -> nothing due');
});

test('selectTarget picks the highest-churn non-stale doc via injected signals', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'low.md'), '# low churn');
  fs.writeFileSync(path.join(root, 'docs', 'high.md'), '# high churn');
  const now = Date.now();
  const recentAudit = now - (STALE_DAYS - 1) * 86400000;
  const cursors = {
    'doc:low.md'.replace('.md', ''): { lastAuditedMs: recentAudit },
    'doc:high.md'.replace('.md', ''): { lastAuditedMs: recentAudit },
  };
  const result = selectTarget(root, cursors, {
    now,
    signals: { 'doc:low': 1, 'doc:high': 5 },
  });
  assert.strictEqual(result.id, 'high');
  assert.strictEqual(result.why, 'hotspot');
  assert.strictEqual(result.churnCount, 5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/docs-health/tests/scope.test.js`
Expected: FAIL — `Cannot find module '../scope'`

- [ ] **Step 3: Write `scope.js`**

Create `bin/lib/docs-health/scope.js`:

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { STALE_DAYS } = require('./score');

// Directory names excluded when they sit directly under docs/ — ephemeral
// /specify + /superpowers:writing-plans build artifacts (specs, plans), not
// Diátaxis-portal content. Not a recursive-anywhere exclusion: only
// docs/superpowers itself is skipped, not any nested "superpowers" dir
// deeper in the tree (there shouldn't be one, but this keeps the rule
// narrow and explicit rather than accidentally over-broad).
const EXCLUDE_TOP_LEVEL_DIRS = new Set(['superpowers']);

// ─── listDocs ────────────────────────────────────────────────────────────
// Recursively walks docs/**, returning [{ kind: 'doc', id, path }] for
// every .md file, sorted by id. id is the path relative to docs/,
// forward-slashed, without the .md extension — e.g.
// docs/decisions/0007-foo.md -> "decisions/0007-foo". Skips
// docs/superpowers/** and any dotfile directory. [] if docs/ doesn't exist
// — a project with no docs/ tree yet is a valid state, not an error.
//
// Structurally never returns anything under .claude/skills/**,
// .claude/rules/**, or a project-root CLAUDE.md — this walker only ever
// descends into docs/, so harness-health's exclusive territory is excluded
// by construction, not by an explicit skip rule.
function walk(dir, docsRoot, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === docsRoot && EXCLUDE_TOP_LEVEL_DIRS.has(entry.name)) continue;
      walk(full, docsRoot, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const rel = path.relative(docsRoot, full).split(path.sep).join('/').replace(/\.md$/, '');
      out.push({ kind: 'doc', id: rel, path: full });
    }
  }
}

function listDocs(root) {
  const docsRoot = path.join(root, 'docs');
  const out = [];
  walk(docsRoot, docsRoot, out);
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ─── extractDomainPaths ────────────────────────────────────────────────────
// Mechanical proxy for "what this doc references": backtick-quoted strings
// that look like a file path (no whitespace, a dot-extension, AND a
// slash). Deliberately NOT prose understanding — that's the LLM judge's
// job, not the engine's.
function extractDomainPaths(content) {
  const matches = content.match(/`([^`\s]+\.[a-zA-Z0-9]+)`/g) || [];
  const paths = matches.map((m) => m.slice(1, -1)).filter((p) => p.includes('/'));
  return [...new Set(paths)];
}

// ─── domainChurn ─────────────────────────────────────────────────────────────
// Count commits touching any of `relPaths` since `sinceMs` (epoch ms).
// Returns 0 (not an error) when git is unavailable, paths don't exist, or
// there is no churn.
function domainChurn(root, relPaths, sinceMs) {
  if (!relPaths || relPaths.length === 0) return 0;
  try {
    const since = new Date(sinceMs || 0).toISOString().slice(0, 10);
    const out = execFileSync(
      'git',
      ['-C', root, 'log', '--oneline', `--since=${since}`, '--', ...relPaths],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

// ─── selectTarget ────────────────────────────────────────────────────────────
// opts: { now?: number, signals?: { [id]: number } }
// Returns { kind: 'doc', id, path, why: 'stale' | 'hotspot' } or null.
// Cursor key is namespaced "doc:<id>" throughout, matching harness-health's
// "${kind}:${id}" convention (docs-health has a single kind, so the prefix
// is a fixed literal rather than a variable).
function selectTarget(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const signals = opts.signals || null; // test injection hook — churn override by "doc:<id>" key

  const candidates = listDocs(root);
  if (candidates.length === 0) return null;

  // Phase 1: force-pick any doc unaudited past STALE_DAYS.
  for (const candidate of candidates) {
    const key = `doc:${candidate.id}`;
    const cursor = cursors[key];
    const lastAuditedMs = cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > STALE_DAYS) {
      return { ...candidate, why: 'stale', daysSinceLastAudit: Number.isFinite(daysSince) ? Math.round(daysSince) : null };
    }
  }

  // Phase 2: among non-stale candidates, score by churn since last audit —
  // the doc's own referenced paths (extractDomainPaths) UNION the doc
  // file's own path, so editing the doc itself also counts (a doc that
  // changed a lot recently is itself a drift risk, independent of what it
  // references).
  const scored = [];
  for (const candidate of candidates) {
    const key = `doc:${candidate.id}`;
    const cursor = cursors[key] || {};
    const sinceMs = cursor.lastAuditedMs || 0;
    let churn;
    if (signals) {
      churn = signals[key] || 0;
    } else {
      let content;
      try { content = fs.readFileSync(candidate.path, 'utf8'); } catch { content = ''; }
      const relDocPath = path.relative(root, candidate.path).split(path.sep).join('/');
      const domainPaths = extractDomainPaths(content);
      churn = domainChurn(root, [relDocPath, ...domainPaths], sinceMs);
    }
    if (churn > 0) scored.push({ candidate, churn });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.churn !== a.churn ? b.churn - a.churn : (a.candidate.id < b.candidate.id ? -1 : 1)));
  return { ...scored[0].candidate, why: 'hotspot', churnCount: scored[0].churn };
}

module.exports = { listDocs, extractDomainPaths, domainChurn, selectTarget };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/docs-health/tests/scope.test.js`
Expected: PASS (all tests, including the zero-overlap-with-harness-health regression test)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/docs-health/scope.js bin/lib/docs-health/tests/scope.test.js
git commit -m "Add docs-health rotation engine (file-based target selection over docs/**)

refs #36"
```

---

## Task 5: Finding validation (`validate-finding.js`)

**Files:**
- Create: `bin/lib/docs-health/validate-finding.js`
- Test: `bin/lib/docs-health/tests/validate-finding.test.js`

**Interfaces:**
- Consumes: nothing (pure validation logic, no imports beyond built-ins).
- Produces: `module.exports = { validateFinding(obj) -> {ok:true, errors:[], value} | {ok:false, errors}, ASSET_TYPE_VALUES, CATEGORY_VALUES, MISLEADS_VALUES, CLASSIFICATION_VALUES, CONFIDENCE_VALUES, REVERSIBILITY_VALUES }`. Defines the Finding Shape every later task's code and every docs-health SKILL.md judge step must match: `{ target, assetType: "doc", section, category: "genre-drift"|"staleness", misleads: "human"|"agent"|"both", description, reason, classification: "additive"|"restructural", confidence: "high"|"med"|"low", reversibility: "high"|"med"|"low", oldString, newString }`. Consumed by Task 7's CLI.

- [ ] **Step 1: Write the failing test**

Create `bin/lib/docs-health/tests/validate-finding.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { validateFinding } = require('../validate-finding');

function validFinding(overrides = {}) {
  return {
    target: 'decisions/0007-foo',
    assetType: 'doc',
    section: 'Freshness',
    category: 'staleness',
    misleads: 'agent',
    classification: 'additive',
    confidence: 'high',
    reversibility: 'high',
    description: 'Stated skill count is stale',
    oldString: 'This project ships 12 skills.',
    newString: 'This project ships 14 skills.',
    reason: 'A live count of skills/*/SKILL.md returns 14, not 12.',
    ...overrides,
  };
}

test('validateFinding accepts a well-formed finding', () => {
  const result = validateFinding(validFinding());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.target, 'decisions/0007-foo');
});

test('validateFinding rejects a non-object', () => {
  const result = validateFinding(null);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('validateFinding rejects a missing required string field', () => {
  const bad = validFinding();
  delete bad.reason;
  const result = validateFinding(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('reason:')));
});

test('validateFinding rejects an unknown assetType', () => {
  const result = validateFinding(validFinding({ assetType: 'skill' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('assetType:')));
});

test('validateFinding rejects an unknown category', () => {
  const result = validateFinding(validFinding({ category: 'vibes' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('category:')));
});

test('validateFinding rejects an unknown misleads value', () => {
  const result = validateFinding(validFinding({ misleads: 'robot' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('misleads:')));
});

test('validateFinding accepts misleads: human, agent, or both', () => {
  assert.strictEqual(validateFinding(validFinding({ misleads: 'human' })).ok, true);
  assert.strictEqual(validateFinding(validFinding({ misleads: 'agent' })).ok, true);
  assert.strictEqual(validateFinding(validFinding({ misleads: 'both' })).ok, true);
});

test('validateFinding rejects an unknown classification/confidence/reversibility', () => {
  assert.strictEqual(validateFinding(validFinding({ classification: 'huge' })).ok, false);
  assert.strictEqual(validateFinding(validFinding({ confidence: 'super' })).ok, false);
  assert.strictEqual(validateFinding(validFinding({ reversibility: 'meh' })).ok, false);
});

test('validateFinding rejects a finding missing section, oldString, or newString', () => {
  const noSection = validFinding(); delete noSection.section;
  assert.strictEqual(validateFinding(noSection).ok, false);

  const noOld = validFinding(); delete noOld.oldString;
  assert.strictEqual(validateFinding(noOld).ok, false);

  const noNew = validFinding({ newString: '' });
  assert.strictEqual(validateFinding(noNew).ok, false);
});

test('validateFinding accepts an empty oldString for a pure addition', () => {
  const result = validateFinding(validFinding({ oldString: '' }));
  assert.strictEqual(result.ok, true);
});

test('validateFinding accepts category: genre-drift', () => {
  const result = validateFinding(validFinding({
    category: 'genre-drift',
    section: 'Overview',
    description: 'Reference doc is actually a how-to walkthrough',
  }));
  assert.strictEqual(result.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/docs-health/tests/validate-finding.test.js`
Expected: FAIL — `Cannot find module '../validate-finding'`

- [ ] **Step 3: Write `validate-finding.js`**

Create `bin/lib/docs-health/validate-finding.js`:

```javascript
'use strict';

// Validates a docs-health finding against the Finding Shape in
// _shared/criteria-docs-diataxis.md. Returns { ok:true, value } or
// { ok:false, errors:string[] }. Single finding shape — unlike
// harness-health, docs-health has no kind discriminator (no
// "new-skill"-equivalent second shape).

const ASSET_TYPE_VALUES = new Set(['doc']);
const CATEGORY_VALUES = new Set(['genre-drift', 'staleness']);
const MISLEADS_VALUES = new Set(['human', 'agent', 'both']);
const CLASSIFICATION_VALUES = new Set(['additive', 'restructural']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);
const REVERSIBILITY_VALUES = new Set(['high', 'med', 'low']);

const REQUIRED_STRINGS = [
  'target', 'assetType', 'section', 'category', 'misleads',
  'description', 'reason', 'classification', 'confidence', 'reversibility',
];

function validateFinding(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, errors: ['finding: must be an object'] };
  }

  for (const field of REQUIRED_STRINGS) {
    const v = obj[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`${field}: required non-empty string (got ${JSON.stringify(v)})`);
    }
  }

  if (typeof obj.assetType === 'string' && !ASSET_TYPE_VALUES.has(obj.assetType)) {
    errors.push(`assetType: must be one of ${[...ASSET_TYPE_VALUES].join('|')} (got "${obj.assetType}")`);
  }
  if (typeof obj.category === 'string' && !CATEGORY_VALUES.has(obj.category)) {
    errors.push(`category: must be one of ${[...CATEGORY_VALUES].join('|')} (got "${obj.category}")`);
  }
  if (typeof obj.misleads === 'string' && !MISLEADS_VALUES.has(obj.misleads)) {
    errors.push(`misleads: must be one of ${[...MISLEADS_VALUES].join('|')} (got "${obj.misleads}")`);
  }
  if (typeof obj.classification === 'string' && !CLASSIFICATION_VALUES.has(obj.classification)) {
    errors.push(`classification: must be one of ${[...CLASSIFICATION_VALUES].join('|')} (got "${obj.classification}")`);
  }
  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  }
  if (typeof obj.reversibility === 'string' && !REVERSIBILITY_VALUES.has(obj.reversibility)) {
    errors.push(`reversibility: must be one of ${[...REVERSIBILITY_VALUES].join('|')} (got "${obj.reversibility}")`);
  }

  if (typeof obj.oldString !== 'string') {
    errors.push('oldString: required string (empty string allowed for pure additions)');
  }
  if (typeof obj.newString !== 'string' || obj.newString.trim() === '') {
    errors.push('newString: required non-empty string');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}

module.exports = {
  validateFinding, ASSET_TYPE_VALUES, CATEGORY_VALUES, MISLEADS_VALUES,
  CLASSIFICATION_VALUES, CONFIDENCE_VALUES, REVERSIBILITY_VALUES,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/docs-health/tests/validate-finding.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bin/lib/docs-health/validate-finding.js bin/lib/docs-health/tests/validate-finding.test.js
git commit -m "Add docs-health finding validation

refs #36"
```

---

## Task 6: Issue payload assembly (`issue-payload.js`)

**Files:**
- Create: `bin/lib/docs-health/issue-payload.js`
- Test: `bin/lib/docs-health/tests/issue-payload.test.js`

**Interfaces:**
- Consumes: `recordPayload`, `specShapedBody` from `../issues/record` (Task 1 already registered `docs-health` in `ORIGINS`). `specShapedBody({header, currentState, deliverables, acceptanceCriteria, filedBy})` returns a spec-shaped markdown body string. `recordPayload({title, body, type, origin, risk, effort, ready, fingerprint})` returns `{title, body, labels, type}` and appends the `<!-- work-fingerprint: ... -->` marker to `body`.
- Produces: `module.exports = { toIssuePayload(finding) -> {id, target, assetType, category, misleads, section, classification, confidence, reversibility, oldString, newString, title, body, labels, type} }`. Consumed by Task 7's CLI. `finding.id` must already be set by the caller (the CLI's `fingerprint()` call) — this module never computes it itself, mirroring `bin/lib/harness-health/issue-payload.js`.

- [ ] **Step 1: Write the failing test**

Create `bin/lib/docs-health/tests/issue-payload.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { toIssuePayload } = require('../issue-payload');
const { extractFingerprint } = require('../../issues/record');

function finding(overrides = {}) {
  return {
    id: 'docshealth-abc12345',
    target: 'decisions/0007-foo',
    assetType: 'doc',
    section: 'Freshness',
    category: 'staleness',
    misleads: 'agent',
    classification: 'restructural',
    confidence: 'high',
    reversibility: 'med',
    description: 'Stated skill count is stale',
    oldString: 'This project ships 12 skills.',
    newString: 'This project ships 14 skills.',
    reason: 'A live count of skills/*/SKILL.md returns 14, not 12.',
    ...overrides,
  };
}

test('toIssuePayload for a restructural finding maps classification to risk:medium/effort:high, ready, and appends the diagnostic label last', () => {
  const payload = toIssuePayload(finding());
  assert.deepStrictEqual(payload.labels, ['by:docs-health', 'risk:medium', 'effort:high', 'ready', 'docs-health:restructural']);
  assert.ok(payload.title.includes('decisions/0007-foo'));
  assert.ok(payload.body.includes('12 skills'));
  assert.ok(payload.body.includes('14 skills'));
});

test('toIssuePayload for an additive finding maps classification to risk:low/effort:low', () => {
  const payload = toIssuePayload(finding({ classification: 'additive' }));
  assert.deepStrictEqual(payload.labels, ['by:docs-health', 'risk:low', 'effort:low', 'ready', 'docs-health:additive']);
});

test('toIssuePayload carries type: task', () => {
  assert.strictEqual(toIssuePayload(finding()).type, 'task');
});

test('toIssuePayload body embeds the work-fingerprint marker, re-extractable with extractFingerprint', () => {
  const payload = toIssuePayload(finding());
  assert.ok(payload.body.includes('<!-- work-fingerprint: docshealth-abc12345 -->'));
  assert.strictEqual(extractFingerprint(payload.body), 'docshealth-abc12345');
});

test('toIssuePayload body starts directly with the header line', () => {
  const payload = toIssuePayload(finding());
  assert.ok(payload.body.startsWith('**Doc:**'), `expected body to start with the header line, got: ${payload.body.slice(0, 40)}`);
});

test('toIssuePayload body always includes Current State, Deliverables, and Acceptance Criteria sections', () => {
  const payload = toIssuePayload(finding());
  assert.ok(payload.body.includes('## Current State'));
  assert.ok(payload.body.includes('## Deliverables'));
  assert.ok(payload.body.includes('## Acceptance Criteria'));
});

test('toIssuePayload carries structured decision fields matching the input finding', () => {
  const f = finding();
  const payload = toIssuePayload(f);
  assert.strictEqual(payload.id, f.id);
  assert.strictEqual(payload.target, f.target);
  assert.strictEqual(payload.assetType, f.assetType);
  assert.strictEqual(payload.category, f.category);
  assert.strictEqual(payload.misleads, f.misleads);
  assert.strictEqual(payload.section, f.section);
  assert.strictEqual(payload.classification, f.classification);
  assert.strictEqual(payload.confidence, f.confidence);
  assert.strictEqual(payload.reversibility, f.reversibility);
  assert.strictEqual(payload.oldString, f.oldString);
  assert.strictEqual(payload.newString, f.newString);
});

test('toIssuePayload title reflects category and misleads', () => {
  const payload = toIssuePayload(finding({ category: 'genre-drift', misleads: 'both' }));
  assert.ok(payload.title.startsWith('Doc genre-drift:'), payload.title);
  assert.ok(payload.body.includes('human engineer'), 'misleads:both must render both personas in the body');
  assert.ok(payload.body.includes('coding agent'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/docs-health/tests/issue-payload.test.js`
Expected: FAIL — `Cannot find module '../issue-payload'`

- [ ] **Step 3: Write `issue-payload.js`**

Create `bin/lib/docs-health/issue-payload.js`:

```javascript
'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls
// the network. The skill hands the payload to the gh CLI itself.
// Label/marker/type assembly delegates to recordPayload
// (bin/lib/issues/record.js) — the shared work-record taxonomy
// (skills/_shared/work-record.md): origin by:docs-health, colon-form
// risk:*/effort:* scoring, born-ready, Type task, work-fingerprint marker.
const { recordPayload, specShapedBody } = require('../issues/record');

const CATEGORY_LABELS = { 'genre-drift': 'genre-drift', staleness: 'staleness' };

// classification -> scoring axis fold, same shape as harness-health's:
// additive is a safe, mechanical patch (low risk, low effort);
// restructural needs human review and more effort.
const CLASSIFICATION_SCORING = {
  additive: { risk: 'low', effort: 'low' },
  restructural: { risk: 'medium', effort: 'high' },
};

const MISLEADS_LABELS = {
  human: 'human engineer',
  agent: 'coding agent',
  both: 'human engineer + coding agent',
};

function toIssuePayload(finding) {
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;
  const misleadsLabel = MISLEADS_LABELS[finding.misleads] || finding.misleads;

  const kindLine = `**Doc:** ${finding.target} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Misleads:** ${misleadsLabel} | **Classification:** ${finding.classification} | **Confidence:** ${finding.confidence}`;

  const deliverables = `**Current:**\n\`\`\`\n${finding.oldString || '(N/A — new content)'}\n\`\`\`\n\n**Proposed:**\n\`\`\`\n${finding.newString}\n\`\`\``;

  const body = specShapedBody({
    header: kindLine,
    currentState: finding.reason,
    deliverables,
    acceptanceCriteria: finding.description,
    filedBy: '/claude-tweaks:docs-health',
  });

  const title = `Doc ${categoryLabel}: ${finding.target} — ${finding.section}`;
  const diagnosticLabel = `docs-health:${finding.classification}`;
  const scoring = CLASSIFICATION_SCORING[finding.classification];

  const payload = recordPayload({
    title,
    body,
    type: 'task',
    origin: 'docs-health',
    risk: scoring.risk,
    effort: scoring.effort,
    ready: true,
    fingerprint: finding.id,
  });

  return {
    id: finding.id,
    target: finding.target,
    assetType: finding.assetType,
    category: finding.category,
    misleads: finding.misleads,
    section: finding.section,
    classification: finding.classification,
    confidence: finding.confidence,
    reversibility: finding.reversibility,
    oldString: finding.oldString,
    newString: finding.newString,
    title: payload.title,
    body: payload.body,
    labels: [...payload.labels, diagnosticLabel],
    type: payload.type,
  };
}

module.exports = { toIssuePayload };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/docs-health/tests/issue-payload.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bin/lib/docs-health/issue-payload.js bin/lib/docs-health/tests/issue-payload.test.js
git commit -m "Add docs-health issue payload assembly

refs #36"
```

---

## Task 7: CLI entry point (`bin/docs-health.js`)

**Files:**
- Create: `bin/docs-health.js`
- Test: `bin/lib/docs-health/tests/cli-next-target.test.js`
- Test: `bin/lib/docs-health/tests/cli-validate-findings.test.js`
- Test: `bin/lib/docs-health/tests/cli-mark.test.js`
- Test: `bin/lib/docs-health/tests/durable-integration.test.js`

**Interfaces:**
- Consumes: `fingerprint` from `./lib/docs-health/fingerprint` (Task 3); `readCache, writeCache, readDurableState, writeDurableState, buildValidateFindingsUpdate` from `./lib/docs-health/cache` (Task 3); `computeChurn` from `./lib/health-core/runs` (pre-existing); `makeRetryQueueCommands` from `./lib/health-core/retry-cli` (pre-existing); `decide` from `./lib/docs-health/dedup` (Task 3); `validateFinding` from `./lib/docs-health/validate-finding` (Task 5); `toIssuePayload` from `./lib/docs-health/issue-payload` (Task 6); `selectTarget, listDocs` from `./lib/docs-health/scope` (Task 4).
- Produces: an executable CLI with commands `next-target [--target <id>] [--budget <n>] [--root <dir>]`, `validate-findings <file> [--target <id>] [--run-id <id>] [--issues <file>] [--dry-run] [--root <dir>]`, `churn-report [--fail-on-high-churn <r>]`, `mark <fingerprint> declined`, `retry-queue drain`, `retry-queue update <results.json>`. Consumed by `skills/docs-health/SKILL.md` (Task 8) via `node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" <command>`.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/docs-health/tests/cli-next-target.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'docs-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-nt-')); }
function runNextTarget(args, root) {
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(raw);
}

test('next-target returns { target: null } for a project with no docs yet', () => {
  const root = tmp();
  const result = runNextTarget([], root);
  assert.strictEqual(result.target, null);
});

test('next-target picks a never-audited doc as stale', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'readme.md'), '# readme');
  const result = runNextTarget([], root);
  assert.ok(result.target !== null);
  assert.strictEqual(result.target.id, 'readme');
  assert.strictEqual(result.target.why, 'stale');
});

test('next-target --target <id> bypasses selection and returns why: "manual"', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'a.md'), '# a');
  fs.writeFileSync(path.join(root, 'docs', 'b.md'), '# b');
  const result = runNextTarget(['--target', 'b'], root);
  assert.strictEqual(result.target.id, 'b');
  assert.strictEqual(result.target.why, 'manual');
});

test('next-target --budget 2 returns an array of up to 2 unique targets', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'a.md'), '# a');
  fs.writeFileSync(path.join(root, 'docs', 'b.md'), '# b');
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root, '--budget', '2'], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.ok(Array.isArray(result.targets));
  assert.ok(result.targets.length >= 1 && result.targets.length <= 2);
  const ids = result.targets.map((t) => t.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'budget results must have unique ids');
});

test('next-target without --budget still returns a single target object (default budget=1, no shape regression)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'a.md'), '# a');
  const result = runNextTarget([], root);
  assert.ok(!Array.isArray(result.target));
  assert.strictEqual(result.target.id, 'a');
});
```

Create `bin/lib/docs-health/tests/cli-validate-findings.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'docs-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-vf-')); }

function runValidateFindings(root, findingsFile, extraArgs = []) {
  return spawnSync('node', [CLI, 'validate-findings', findingsFile, '--root', root, ...extraArgs], { encoding: 'utf8' });
}

function validFinding(overrides = {}) {
  return {
    target: 'decisions/0007-foo',
    assetType: 'doc',
    category: 'staleness',
    section: 'Freshness',
    misleads: 'agent',
    classification: 'restructural',
    confidence: 'high',
    reversibility: 'med',
    description: 'Stated skill count is stale',
    oldString: 'This project ships 12 skills.',
    newString: 'This project ships 14 skills.',
    reason: 'A live count of skills/*/SKILL.md returns 14, not 12.',
    ...overrides,
  };
}

test('validate-findings: valid finding emits one payload on stdout', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1);
  assert.ok(payloads[0].labels.includes('by:docs-health'));
  assert.ok(payloads[0].labels.includes('ready'));
  assert.ok(payloads[0].labels.includes('risk:medium'));
  assert.ok(payloads[0].labels.includes('effort:high'));
  assert.strictEqual(payloads[0].type, 'task');
  assert.ok(payloads[0].body.includes('<!-- work-fingerprint: docshealth-'));
});

test('validate-findings: malformed finding is dropped with a stderr reason, valid ones survive', () => {
  const root = tmp();
  const malformed = { target: 'x' };
  const good = validFinding({ target: 'guides/setup' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([malformed, good]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1);
  assert.ok(result.stderr.includes('dropped'));
});

test('validate-findings: --dry-run emits payloads but writes no local cache', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const result = runValidateFindings(root, findingsFile, ['--dry-run', '--target', 'decisions/0007-foo']);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(JSON.parse(result.stdout).length, 1);
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'docs-health', 'cache.json')), false);
});

test('validate-findings: a finding already open in the issue index is skipped (dedup)', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const first = runValidateFindings(root, findingsFile);
  const firstPayloads = JSON.parse(first.stdout);
  const fp = firstPayloads[0].body.match(/<!--\s*work-fingerprint:\s*(docshealth-[0-9a-f]{8})\s*-->/)[1];

  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 1, state: 'open', labels: ['by:docs-health'], fingerprint: fp }]));

  const second = runValidateFindings(root, findingsFile, ['--issues', issuesFile]);
  assert.strictEqual(JSON.parse(second.stdout).length, 0, 'open finding must be skipped');
});

test('validate-findings: a malformed --issues file degrades gracefully with a stderr warning, not a hard failure', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));
  const badIssuesFile = path.join(root, 'bad-issues.json');
  fs.writeFileSync(badIssuesFile, 'not valid json{{{');

  const result = runValidateFindings(root, findingsFile, ['--issues', badIssuesFile]);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'must still file the finding, just without issue-based dedup');
});

test('validate-findings: exits non-zero when the findings file is missing', () => {
  const root = tmp();
  const result = runValidateFindings(root, path.join(root, 'nonexistent.json'));
  assert.notStrictEqual(result.status, 0);
});

test('churn-report: prints "no run logs found" when no runs exist', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'churn-report', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
  assert.ok(result.stdout.includes('no run logs found'));
});

test('validate-findings: a finding matching a closed non-wontfix issue is reopened, not dropped', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const first = runValidateFindings(root, findingsFile);
  const firstPayloads = JSON.parse(first.stdout);
  const fp = firstPayloads[0].body.match(/<!--\s*work-fingerprint:\s*(docshealth-[0-9a-f]{8})\s*-->/)[1];

  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 9, state: 'closed', labels: ['by:docs-health'], fingerprint: fp }]));

  const second = runValidateFindings(root, findingsFile, ['--issues', issuesFile]);
  assert.strictEqual(second.status, 0, `stderr: ${second.stderr}`);
  const payloads = JSON.parse(second.stdout);
  assert.strictEqual(payloads.length, 1, 'a regressed finding must still emit a payload, not be silently dropped');

  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'docs-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache[fp].status, 'regressed');
  assert.strictEqual(cache[fp].issue, 9);
});

test('validate-findings: a real run still succeeds and emits its payload when durable persistence cannot complete', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const result = runValidateFindings(root, findingsFile, ['--run-id', 'test-run-1']);
  assert.strictEqual(result.status, 0, `expected non-fatal exit, got stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'payload must still emit despite the persistence failure');
  assert.strictEqual(
    fs.existsSync(path.join(root, '.claude-tweaks', 'docs-health', 'cursors.json')),
    false,
    'cursors are durable now — no local cursors.json is ever written',
  );
});
```

Create `bin/lib/docs-health/tests/cli-mark.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'docs-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-mark-')); }

test('mark writes a declined status to the cache', () => {
  const root = tmp();
  execFileSync('node', [CLI, 'mark', 'docshealth-xyz98765', 'declined', '--root', root], { encoding: 'utf8' });
  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'docs-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache['docshealth-xyz98765'].status, 'declined');
});

test('mark exits non-zero for an invalid status', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', 'docshealth-abc12345', 'bogus', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('mark exits non-zero when the fingerprint arg is missing', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('a finding marked declined is suppressed by a later validate-findings run on the same fingerprint', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  const finding = {
    target: 'decisions/0007-foo', assetType: 'doc', category: 'staleness', section: 'Freshness',
    misleads: 'agent', classification: 'restructural', confidence: 'high', reversibility: 'med',
    description: 'x', oldString: 'a', newString: 'b', reason: 'y',
  };
  fs.writeFileSync(findingsFile, JSON.stringify([finding]));
  const first = JSON.parse(execFileSync('node', [CLI, 'validate-findings', findingsFile, '--root', root], { encoding: 'utf8' }));
  assert.strictEqual(first.length, 1, 'first run must file the finding');
  const fp = first[0].id;
  execFileSync('node', [CLI, 'mark', fp, 'declined', '--root', root], { encoding: 'utf8' });
  const second = JSON.parse(execFileSync('node', [CLI, 'validate-findings', findingsFile, '--root', root], { encoding: 'utf8' }));
  assert.strictEqual(second.length, 0, 'declined finding must be suppressed on the next run');
});
```

Create `bin/lib/docs-health/tests/durable-integration.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI = path.join(__dirname, '..', '..', '..', 'docs-health.js');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-durable-'));
}

test('retry-queue drain prints [] against a repo with no health-state branch', () => {
  const root = tmpRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/nonexistent.git'], { cwd: root });
  const out = execFileSync('node', [CLI, 'retry-queue', 'drain', '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out), []);
});

test('retry-queue update <results.json> dispatches correctly against a repo with no health-state branch', () => {
  const root = tmpRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/nonexistent.git'], { cwd: root });

  const resultsFile = path.join(root, 'results.json');
  fs.writeFileSync(resultsFile, JSON.stringify([
    { fingerprint: 'docshealth-aaaa0001', payload: { title: 'Stale skill count' }, ok: false, error: 'filing failed: 500' },
  ]));

  const out = execFileSync('node', [CLI, 'retry-queue', 'update', resultsFile, '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out), [], 'a single failed attempt has not crossed the 3-attempt escalation threshold');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/docs-health/tests/cli-*.test.js bin/lib/docs-health/tests/durable-integration.test.js`
Expected: FAIL — `bin/docs-health.js` does not exist yet.

- [ ] **Step 3: Write `bin/docs-health.js`**

Create `bin/docs-health.js`:

```javascript
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { fingerprint } = require('./lib/docs-health/fingerprint');
const { readCache, writeCache, readDurableState, writeDurableState, buildValidateFindingsUpdate } = require('./lib/docs-health/cache');
const { computeChurn } = require('./lib/health-core/runs');
const { makeRetryQueueCommands } = require('./lib/health-core/retry-cli');
const { decide } = require('./lib/docs-health/dedup');
const { validateFinding } = require('./lib/docs-health/validate-finding');
const { toIssuePayload } = require('./lib/docs-health/issue-payload');
const { selectTarget, listDocs } = require('./lib/docs-health/scope');

const retryQueueCommands = makeRetryQueueCommands({ readDurableState, writeDurableState });

function parseArgs(argv) {
  const args = { _: [], root: process.cwd(), dryRun: false, runId: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--issues') args.issues = argv[++i];
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--fail-on-high-churn') args['fail-on-high-churn'] = argv[++i];
    else if (a === '--budget') args.budget = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

// --issues <file> is an array of { number, state, labels, fingerprint } objects.
function loadIssueIndex(file) {
  if (!file) return {};
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    process.stderr.write(`[docs-health] validate-findings: could not read or parse --issues file: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  if (!Array.isArray(arr)) {
    process.stderr.write(`[docs-health] validate-findings: --issues file must contain a JSON array: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  const index = {};
  for (const issue of arr) {
    if (issue.fingerprint) {
      index[issue.fingerprint] = { number: issue.number, state: issue.state, labels: issue.labels || [] };
    }
  }
  return index;
}

function cmdNextTarget(args) {
  const root = args.root || process.cwd();
  const now = Date.now();

  if (args.target) {
    const found = listDocs(root).find((t) => t.id === args.target) || null;
    const target = found ? { ...found, why: 'manual' } : null;
    process.stdout.write(JSON.stringify({ target }, null, 2) + '\n');
    return;
  }

  const budget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1;
  let cursors = readDurableState(root).cursors;

  if (budget === 1) {
    const target = selectTarget(root, cursors, { now });
    process.stdout.write(JSON.stringify({ target }, null, 2) + '\n');
    return;
  }

  const targets = [];
  for (let i = 0; i < budget; i++) {
    const target = selectTarget(root, cursors, { now });
    if (!target) break;
    targets.push(target);
    const key = `doc:${target.id}`;
    cursors = { ...cursors, [key]: { ...(cursors[key] || {}), lastAuditedMs: now } };
  }
  process.stdout.write(JSON.stringify({ targets }, null, 2) + '\n');
}

function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1];
  if (!findingsPath) {
    process.stderr.write(
      'usage: docs-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--target <id>] [--run-id <id>] [--dry-run]\n',
    );
    process.exit(2);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
  } catch {
    process.stderr.write(`validate-findings: could not read or parse findings file: ${findingsPath}\n`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    process.stderr.write('validate-findings: findings file must contain a JSON array\n');
    process.exit(1);
  }

  const survivors = [];
  for (const f of raw) {
    const v = validateFinding(f);
    if (!v.ok) {
      process.stderr.write(
        `[docs-health] validate-findings: dropped finding for target "${(f && f.target) || '?'}": ${v.errors.join('; ')}\n`,
      );
      continue;
    }
    const id = fingerprint({
      assetType: v.value.assetType,
      target: v.value.target,
      section: v.value.section,
      description: v.value.description,
    });
    survivors.push({ ...v.value, id });
  }

  const cache = readCache(root);
  const issueIndex = loadIssueIndex(args.issues);
  const payloads = [];
  const seen = new Set();
  for (const finding of survivors) {
    if (seen.has(finding.id)) continue;
    seen.add(finding.id);

    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file' || decision.action === 'reopen') {
      cache[finding.id] = decision.action === 'reopen'
        ? { status: 'regressed', issue: decision.issue || null, lastSeenMs: Date.now() }
        : { status: 'staged', lastSeenMs: Date.now() };
      payloads.push(toIssuePayload(finding));
    }
  }

  if (!args.dryRun) {
    writeCache(root, cache);
    const runRecord = { runId: args.runId, runAt: new Date().toISOString(), fingerprints: [...seen] };
    const result = writeDurableState(root, (current) => buildValidateFindingsUpdate(current, { target: args.target, runRecord }));
    if (!result.ok) {
      process.stderr.write(`[docs-health] validate-findings: health-state persistence failed after retries: ${result.error}\n`);
    }
  }

  process.stdout.write(JSON.stringify(payloads, null, 2) + '\n');
  process.stderr.write(
    `[docs-health] validate-findings: ${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`,
  );
}

function cmdChurnReport(args) {
  const root = args.root || process.cwd();
  const runs = readDurableState(root).runs;
  if (runs.length === 0) {
    process.stdout.write('no run logs found\n');
    return;
  }
  const threshold = args['fail-on-high-churn'] != null ? parseFloat(args['fail-on-high-churn']) : null;
  const rows = [['runId', 'runAt', 'findings', 'appeared', 'disappeared', 'ratio']];
  let exceeded = false;
  for (let i = 0; i < runs.length; i++) {
    const prior = i > 0 ? runs[i - 1] : null;
    const c = computeChurn(runs[i].fingerprints, prior);
    rows.push([
      runs[i].runId,
      (runs[i].runAt || '').slice(0, 19),
      String(runs[i].fingerprints.length),
      String(c.appeared.length),
      String(c.disappeared.length),
      String(c.ratio),
    ]);
    if (threshold != null && prior != null && c.ratio >= threshold) exceeded = true;
  }
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => String(r[col]).length)));
  for (const row of rows) {
    process.stdout.write(row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ') + '\n');
  }
  if (exceeded) {
    process.stdout.write(`\nhigh churn: one or more runs >= ${threshold}\n`);
    process.exit(1);
  }
}

const MARK_STATUSES = new Set(['declined']);

function cmdMark(args) {
  const root = args.root || process.cwd();
  const fp = args._[1];
  const status = args._[2];
  if (!fp || !MARK_STATUSES.has(status)) {
    process.stderr.write(`usage: docs-health.js mark <fingerprint> <${[...MARK_STATUSES].join('|')}> [--root <dir>]\n`);
    process.exit(2);
  }
  const cache = readCache(root);
  cache[fp] = { status, lastSeenMs: Date.now() };
  writeCache(root, cache);
  process.stdout.write(JSON.stringify(cache[fp], null, 2) + '\n');
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'next-target') return cmdNextTarget(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'mark') return cmdMark(args);
  if (cmd === 'retry-queue' && args._[1] === 'drain') return retryQueueCommands.drain(args);
  if (cmd === 'retry-queue' && args._[1] === 'update') return retryQueueCommands.update({ ...args, _: args._.slice(1) });
  process.stderr.write(
    'usage: docs-health.js <command> [options]\n' +
    'commands: next-target [--target <id>] [--budget <n>], ' +
    'validate-findings <file> [--target <id>] [--issues <file>] [--dry-run], ' +
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <declined>, ' +
    'retry-queue drain, retry-queue update <results.json>\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, main };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/docs-health/tests/cli-*.test.js bin/lib/docs-health/tests/durable-integration.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full docs-health suite**

Run: `node --test bin/lib/docs-health/tests/*.test.js`
Expected: PASS (every test across every file created in Tasks 3-7)

- [ ] **Step 6: Commit**

```bash
git add bin/docs-health.js bin/lib/docs-health/tests/cli-next-target.test.js bin/lib/docs-health/tests/cli-validate-findings.test.js bin/lib/docs-health/tests/cli-mark.test.js bin/lib/docs-health/tests/durable-integration.test.js
git commit -m "Add docs-health CLI entry point

refs #36"
```

---

## Task 8: `skills/docs-health/SKILL.md` + `routine-template.yml`

**Files:**
- Create: `skills/docs-health/SKILL.md`
- Create: `skills/docs-health/routine-template.yml`
- Test: `bin/lib/docs-health/tests/skill-md.test.js`

**Interfaces:**
- Consumes: nothing new in code — documents Task 7's CLI commands and Task 2's criteria fragment path.
- Produces: the user-facing `/claude-tweaks:docs-health` skill definition and its routine template, consumed by `/claude-tweaks:routine create docs-health` and by Task 9's cross-reference updates.

- [ ] **Step 1: Write the failing test**

Create `bin/lib/docs-health/tests/skill-md.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL = path.resolve(__dirname, '..', '..', '..', '..', 'skills', 'docs-health', 'SKILL.md');
const read = () => fs.readFileSync(SKILL, 'utf8');

test('exists', () => {
  assert.ok(fs.existsSync(SKILL), `SKILL.md not found at ${SKILL}`);
});

test('frontmatter declares the canonical name', () => {
  assert.match(read(), /name:\s*claude-tweaks:docs-health/);
});

test('carries the standard interaction-style directive', () => {
  assert.ok(read().includes('> **Interaction style:**'));
});

test('invokes the CLI via ${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js (not $SKILL_DIR)', () => {
  const body = read();
  assert.ok(body.includes('${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js'));
  assert.ok(!body.includes('$SKILL_DIR'), 'must not use the non-existent $SKILL_DIR variable');
});

test('documents the dry-run-first procedure and hands payloads to gh', () => {
  const body = read();
  assert.ok(body.includes('--dry-run'));
  assert.ok(/gh issue create/.test(body));
});

test('has the required house sections in order', () => {
  const body = read();
  const idx = (s) => body.indexOf(s);
  assert.ok(idx('## When to Use') > 0);
  assert.ok(idx('## Anti-Patterns') > 0);
  assert.ok(idx('## Component-Skill Contract') > 0);
  assert.ok(idx('## Relationship to Other Skills') > 0);
  assert.ok(idx('## Next Actions') > 0);
  assert.ok(idx('## Next Actions') < idx('## Component-Skill Contract'));
  assert.ok(idx('## Component-Skill Contract') < idx('## Anti-Patterns'));
  assert.ok(idx('## Anti-Patterns') < idx('## Relationship to Other Skills'));
});

test('Component-Skill Contract is keyed on $PIPELINE_RUN_DIR', () => {
  assert.ok(read().includes('$PIPELINE_RUN_DIR'));
});

test('Relationship table references harness-health, code-health, tidy, triage, routine', () => {
  const body = read();
  for (const s of [
    '/claude-tweaks:harness-health', '/claude-tweaks:code-health', '/claude-tweaks:tidy',
    '/claude-tweaks:triage', '/claude-tweaks:routine',
  ]) {
    assert.ok(body.includes(s), `missing relationship to ${s}`);
  }
});

test('no emojis (common emoji unicode sequences)', () => {
  const content = read();
  const emojiRe = /[\u{1F300}-\u{1FAFF}]/u;
  assert.ok(!emojiRe.test(content), 'SKILL.md must not contain emojis');
});

[
  'validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', '_shared/health-state.md',
  'work-record.md', 'work-fingerprint', 'by:docs-health', 'criteria-docs-diataxis.md',
  'docs-health:additive', 'docs-health:restructural', 'docs/superpowers',
].forEach((token) => {
  test(`contains required token '${token}'`, () => {
    const content = read();
    assert.ok(content.includes(token), `missing required token: ${token}`);
  });
});

test('states the classification -> scoring fold table literally', () => {
  const body = read();
  assert.ok(/\|\s*`?additive`?\s*\|\s*`risk:low`\s*\|\s*`effort:low`\s*\|/.test(body));
  assert.ok(/\|\s*`?restructural`?\s*\|\s*`risk:medium`\s*\|\s*`effort:high`\s*\|/.test(body));
});

test('states the born-ready rule explicitly', () => {
  assert.ok(read().includes('born-`ready`'), 'missing an explicit born-ready statement');
});

test('routine-template.yml exists and points at /claude-tweaks:docs-health', () => {
  const templatePath = path.join(path.dirname(SKILL), 'routine-template.yml');
  assert.ok(fs.existsSync(templatePath));
  const content = fs.readFileSync(templatePath, 'utf8');
  assert.ok(content.includes('/claude-tweaks:docs-health'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/docs-health/tests/skill-md.test.js`
Expected: FAIL — `SKILL.md not found`

- [ ] **Step 3: Write `skills/docs-health/SKILL.md`**

Create `skills/docs-health/SKILL.md`:

```markdown
---
name: claude-tweaks:docs-health
description: Use when you want a proactive, report-only sweep of docs/** that surfaces Diátaxis genre-drift (implied doc type vs. actual content shape) and factual staleness, deduplicated and filed as GitHub issues. An LLM judges the docs; deterministic helpers handle scope rotation, fingerprinting, dedup, and issue filing. Never edits docs. Keywords - docs-health, documentation drift, Diátaxis, genre drift, staleness, proactive, github issues, scheduled, routine.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Docs Health — Diátaxis Genre-Drift + Staleness Sweep for docs/**

A recurring health check for `docs/**`: picks one doc to audit, judges it against the shared `_shared/criteria-docs-diataxis.md` procedure (implied-type-vs-found-type genre-drift, factual staleness, dual-persona misleading-risk), and files a `by:docs-health`-labelled, born-`ready` GitHub issue. Never edits docs — only files findings, mirroring `/code-health` and `/harness-health`.

```
              [ /claude-tweaks:docs-health ] <- utility (no fixed lifecycle position)
                           |  picks a target via next-target; judges via the shared criteria fragment
                           v
finding -> validate-findings -> file GitHub issue (by:docs-health, ready)
```

## When to Use

- You want `docs/**` (guides, references, ADRs, journeys, retrospectives) to stay accurate and correctly Diátaxis-shaped between manual edits, without driving each check yourself.
- You want a scheduled Routine that periodically rotates through `docs/**` and flags genre-drift or staleness as it's found.
- You want to check one specific doc right now (`--target <id>`).

Not for: mechanical/unambiguous checks (broken links, malformed frontmatter, missing structural metadata) — those belong in the consuming project's own build/CI pipeline, the same "CI stays reactive" boundary `/code-health` already draws for code. Not for `.claude/skills/*.md`/`.claude/rules/*.md`/CLAUDE.md — that is `/claude-tweaks:harness-health`'s exclusive territory; docs-health's rotation pool only ever walks `docs/`, so it structurally never touches those files. Not for `docs/superpowers/**` — ephemeral `/claude-tweaks:specify` + `/superpowers:writing-plans` build history, not Diátaxis-portal content; excluded from the rotation pool entirely.

## Input

`$ARGUMENTS` may contain:

- `--target <id>` — manual override: audit one specific doc directly, bypassing `next-target` selection. `<id>` is the doc's path relative to `docs/`, without the `.md` extension (e.g. `decisions/0007-foo`).
- `--dry-run` — emit findings; never write cursor/cache state; never call `gh`.
- `--budget <n>` — audit up to `n` docs in one firing (default 1).
- `--root <dir>` — audit a project elsewhere (default: current working directory).

## Workflow

**Step 1 — SELECT: pick the next target(s).**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" next-target --root . ${TARGET:+--target "$TARGET"} ${BUDGET:+--budget "$BUDGET"}
```

Without `--budget` (or `--budget 1`), prints `{ target: { kind, id, path, why } | null }` — a single target. With `--budget <n>` where `n > 1`, prints `{ targets: [{ kind, id, path, why }, ...] }` instead — up to `n` targets, each a different id. When `targets` is present, run Steps 2-3 once per entry before moving on to Step 4.

Read the `why` field on whichever target(s) came back:
- If `target`/`targets` is empty: nothing is due this firing. Report this to the user and stop.
- `why: "stale"` — this doc has not been audited in over 60 days regardless of churn.
- `why: "hotspot"` — this doc (or its own backtick-quoted referenced paths) has the highest churn since its last audit among docs with any churn at all.
- `why: "manual"` — `--target` was passed, bypassing selection.

**Step 2 — READ the target.**

Read the file at `target.path` in full. If `docs/` doesn't exist yet, report "no docs/ tree to audit yet" and stop (a real state, not an error).

**Step 3 — JUDGE the target.**

Apply the full procedure in `_shared/criteria-docs-diataxis.md` (genre-drift, staleness, dual-persona misleading-risk) to the target's content:

1. Determine the doc's **implied type** from its location/heading language, and its **found type** from what the content actually does (tutorial / how-to / reference / explanation — see the criteria fragment's Dimension 1 table). A mismatch is a `category: "genre-drift"` finding.
2. Check every stated fact (counts, dates, paths, versions, availability claims) against live repository state (grep, `find`, `git log`). A mismatch is a `category: "staleness"` finding.
3. For every finding, judge `misleads`: `"human"` (a skim-and-notice-caveat reader partially self-corrects), `"agent"` (retrieval-style consumption has no such safety net — weight this higher), or `"both"`.
4. Judge `classification`: `"additive"` (a one-line fact correction, an added disclaimer) or `"restructural"` (reorganizing a doc that mixes genres, splitting a doc).

Emit each finding in this shape:

```json
{
  "target": "<doc id relative to docs/, no .md>",
  "assetType": "doc",
  "section": "<heading within the doc, or 'Freshness' for a whole-doc staleness finding>",
  "category": "genre-drift | staleness",
  "misleads": "human | agent | both",
  "classification": "additive | restructural",
  "confidence": "high | med | low",
  "reversibility": "high | med | low",
  "description": "<acceptance criteria text>",
  "reason": "<evidence — why this was flagged>",
  "oldString": "<current text, or empty string for a pure addition>",
  "newString": "<proposed text>"
}
```

Write the array to `/tmp/docs-health-findings.json`.

**Step 3.5 — VERIFY GATE: sanity-check surviving findings before dedup.**

Before fingerprinting and dedup, re-examine each finding and ask: is it real (does the doc actually say this, or was it misread)? Is it actionable (a concrete `oldString`/`newString`, not vague)? Would a human editor be able to apply the fix without further investigation? Is `misleads` justified by which reader would actually encounter this doc's failure mode? Drop any finding that fails. This is the same adversarial-verify discipline `/code-health` and `/harness-health` apply — do not skip it under time pressure.

**Step 4 — GATHER OPEN ISSUES for dedup.**

```bash
gh issue list --label by:docs-health --state all --json number,state,labels,body --limit 500 > /tmp/docs-health-issues-raw.json
```

Parse each issue body for its fingerprint marker via `extractFingerprint` (`bin/lib/issues/record.js`): the `<!-- work-fingerprint: docshealth-XXXXXXXX -->` marker. Build an array of `{ number, state, labels, fingerprint }` objects and write to `/tmp/docs-health-issues.json`. If `gh` is unavailable or the repo has no `by:docs-health` issues yet, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

A matched issue carrying the `wontfix` label is a standing suppression decision: Step 5's `validate-findings` reads it directly off this issue index and skips re-filing entirely (see `_shared/work-record.md`'s `wontfix` closure row).

**Step 5 — VALIDATE, FINGERPRINT, DEDUP.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" validate-findings /tmp/docs-health-findings.json \
  --root "${ROOT:-$PWD}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${TARGET_ID:+--target "$TARGET_ID"} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/docs-health-payloads.json
```

`TARGET_ID` is `target.id` from Step 1 (omit if only auto-selection ran and no single target is being tracked for cursor purposes — pass it whenever a single target drove this firing). The command validates each finding, fingerprints via `assetType + target + section + normalizedDescription`, dedups against open `by:docs-health` issues and the local cache, records the audit cursor for `doc:${TARGET_ID}` unless `--dry-run`, and emits gh-ready payloads on stdout.

**Step 6 — FILE.**

Every docs-health record files onto the unified work record (`skills/_shared/work-record.md`): origin `by:docs-health`; classification folds into the scoring axis:

| Classification | risk | effort |
|---|---|---|
| `additive` | `risk:low` | `effort:low` |
| `restructural` | `risk:medium` | `effort:high` |

Every filed finding is **born-`ready`** — docs-health findings are agent-sized and spec-shaped by construction (Current State / Deliverables / Acceptance Criteria), so they file with the `ready` label already applied and appear directly in the authorization gate's worklist, skipping maturation. `toIssuePayload` (`bin/lib/docs-health/issue-payload.js`) assembles the payload via `record.js`'s `recordPayload`, then appends the classification-derived diagnostic label (`docs-health:additive` / `docs-health:restructural`) after the canonical labels — the emitted label set is exactly `by:docs-health` + scoring + `ready` + the diagnostic label.

Before filing this firing's own new findings, drain the durable retry queue from prior firings' filing failures (see `_shared/health-state.md`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" retry-queue drain --root . > /tmp/docs-health-retry-payloads.json
```

For each payload in `/tmp/docs-health-retry-payloads.json`, attempt `gh issue create` exactly as below. Track every attempt's outcome (retry-queue payloads AND any brand-new payload from this step's own filing loop that fails) as `[{ fingerprint, payload, ok: true }]` or `[{ fingerprint, payload, ok: false, error: "<gh's error output>" }]`, write to `/tmp/docs-health-retry-results.json`, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" retry-queue update /tmp/docs-health-retry-results.json --root . > /tmp/docs-health-escalated.json
```

If `/tmp/docs-health-escalated.json` is non-empty, file (or update) a `docs-health:filing-failed` issue for each entry, naming the stuck fingerprint and its failure history — bootstrap that label the same way as the others below.

Before filing, bootstrap only the label families this run applies, with real descriptions — using the shared helper so a too-long description fails loudly here rather than as a 422 on `gh issue create`. Canonical pairs copied verbatim from `_shared/label-bootstrap.md`'s `LABELS_JSON`, plus docs-health's own diagnostic labels:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [["by:docs-health",  "Origin: filed by the docs-health skill"],
#  ["risk:low",         "Scoring: low blast radius — safe for autonomous build"],
#  ["risk:medium",      "Scoring: moderate blast radius — review before merge recommended"],
#  ["effort:low",       "Scoring: small, agent-sized change"],
#  ["effort:high",      "Scoring: large change — consider decomposition before building"],
#  ["ready",            "Stage: spec-shaped and agent-sized — in the authorization gate's worklist"],
#  ["docs-health:additive",     "Safe, mechanical patch — additive change with no removed content"],
#  ["docs-health:restructural", "Structural change requiring human review before applying"]]
```

Each payload in `/tmp/docs-health-payloads.json` carries structured fields directly (`target`, `assetType`, `category`, `misleads`, `section`, `classification`, `confidence`, `reversibility`, `oldString`, `newString`), alongside `title`, `body`, `labels`, and `type`.

**Type expression branch.** Read the project's `work-types` config key once before filing and branch — never re-probe mid-flow (`_shared/work-record.md`'s config-key table). `work-types: native` applies `payload.type` (always `task`) via GitHub's native Issue Type; `work-types: labels` adds the matching `type:task` label instead:

```bash
# work-types: native
gh issue create --title "<payload.title>" --body "<payload.body>" --type task \
  --label by:docs-health --label risk:low --label effort:low --label ready --label docs-health:additive

# work-types: labels
gh issue create --title "<payload.title>" --body "<payload.body>" \
  --label by:docs-health --label risk:low --label effort:low --label ready --label docs-health:additive --label type:task
```

Apply the same branch to every payload regardless of classification — a `restructural` payload's call carries `risk:medium`/`effort:high`/`docs-health:restructural` instead. `/docs-health` never edits anything directly; matching `/code-health`/`/harness-health`, it only ever judges and files.

For a payload whose fingerprint marker matches a `status: "regressed"` entry in `.claude-tweaks/docs-health/cache.json` after this run, the finding was previously closed and has reappeared — reopen the existing issue instead of filing a new one:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

In `--dry-run` mode, print what would be filed or reopened, and the `gh` commands that would run, but do not call `gh`.

**Step 7 — SUMMARIZE.**

Report: which target(s) were audited, how many findings were emitted, how many filed vs skipped by dedup. List any new issue URLs.

In interactive mode, route surviving findings through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Category | Misleads | Classification | Confidence |
   |---|-------|----------|----------|-----------------|------------|
   | 1 | {title} | {category} | {misleads} | {classification} | {confidence} |
   ```

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File all (Recommended)"`, `description`: `"File every finding above as a GitHub docs-health issue"`
   - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

3. If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub docs-health issue"`
   - Option 2 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

## Routine Configuration

`/docs-health` ships a routine template (`skills/docs-health/routine-template.yml`) designed for small, predictable sips: one target per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create docs-health
```

**Headless run flow:** SELECT(`next-target`) → JUDGE → validate-findings → file. A firing with nothing due (`target: null`) is a cheap no-op.

Report-only, matching `/code-health`/`/harness-health` — every finding files as a `by:docs-health`-labelled, born-`ready` GitHub issue, with no `Edit` call anywhere in its documented workflow. Rotation cursors and the filing retry queue live on the durable `health-state` branch (`_shared/health-state.md`), surviving container recycling across scheduled firings — a skipped or failed firing does not lose progress.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Schedule a Routine"`, `description`: `"/claude-tweaks:routine create docs-health — schedule this as a recurring Routine"`. Suffix the label `(Recommended)` after a first standalone run confirms the output looks right.
- Option 2 — `label`: `"Audit one doc"`, `description`: `"/claude-tweaks:docs-health --target <id> — audit one specific doc right now"`
- Option 3 — `label`: `"Backlog hygiene"`, `description`: `"/claude-tweaks:tidy — fold any filed docs-health issues into a backlog-hygiene pass"`

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:docs-health` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Applying any patch directly instead of filing an issue | `/docs-health` never edits anything — every finding files as a GitHub issue for human review. Matches `/code-health`/`/harness-health`'s report-only contract. |
| Flagging prose quality or style as a finding | Content quality is explicitly out of scope — only genre-drift (implied type vs. found type) and factual staleness are judged. See `_shared/criteria-docs-diataxis.md`'s Constraints section. |
| Flagging mechanical issues (broken links, malformed frontmatter) | Those belong in CI, not an LLM-judged health sweep — the same "CI stays reactive" boundary `/code-health` draws for code. |
| Including `docs/superpowers/**` in the rotation pool | Ephemeral `/specify` + `/superpowers:writing-plans` build artifacts, not Diátaxis-portal content — excluded from `bin/lib/docs-health/scope.js`'s `listDocs` by construction. |
| Auditing `.claude/skills/*.md`, `.claude/rules/*.md`, or CLAUDE.md | That is `/claude-tweaks:harness-health`'s exclusive territory — docs-health's rotation pool only ever walks `docs/`. |
| Re-proposing a patch already marked `declined` in the cache | The decline-memory cache exists specifically so a rejected proposal doesn't reappear every firing forever. |
| Skipping the verify gate under time pressure | Unattended firings compound false positives into staged noise if a misread isn't caught before staging. |
| Treating the local cache as durable state | The cache is a rebuildable optimization — GitHub issue state is the source of truth for cross-run memory, same as `/code-health`/`/harness-health`. |
| Editing `docs/**` content to "fix" what a finding describes | This skill only ever judges and files — never edits. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:harness-health` | Sibling health skill — mirrors the same SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline and shares `_shared/health-state.md`'s durable persistence, but scoped to `docs/**` (excluding harness-health's own `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md territory) for Diátaxis genre-drift + staleness instead of skill/rule/CLAUDE.md accuracy and template-conformance. |
| `/claude-tweaks:code-health` | Sibling health skill for code quality — the third leg of the recurring-sweep family, alongside harness-health. Shares the unified work-record filing contract. |
| `/claude-tweaks:specify` | docs-health findings are pre-specs — a filed `by:docs-health` issue body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so `/specify` consumes it with near-zero translation. |
| `/claude-tweaks:tidy` | `/tidy` Step 4.8 audits open `by:code-health`/`by:harness-health`/`by:journey-health` issues in its hygiene pass; docs-health follows the same pattern for `by:docs-health` issues. |
| `/claude-tweaks:triage` | The human gate over the `ready` queue — records docs-health files feed into triage's worklist the same way code-health/harness-health findings do. |
| `/claude-tweaks:routine` | `/routine create docs-health` instantiates docs-health's `routine-template.yml` into a live, scheduled cloud Routine. |
| `_shared/criteria-docs-diataxis.md` | The canonical judge this skill reads — the genre-drift/staleness dimensions, dual-persona misleading-risk tagging, and Finding Shape live there, not here. |
| `_shared/health-state.md` | Durable cross-firing storage contract — docs-health's cursors, retry queue, and run history live on the `health-state` branch, reusing the exact same `bin/lib/health-core/*` primitives harness-health and code-health already use. No new persistence mechanism. |
| `_shared/work-record.md` | Canonical taxonomy docs-health files against — origin `by:docs-health`, scoring, `ready` stage, born-ready rule. |
```

- [ ] **Step 4: Write `skills/docs-health/routine-template.yml`**

Create `skills/docs-health/routine-template.yml`:

```yaml
template_version: 2
routine_name: docs-health-daily
prompt: >
  Before anything else, fetch origin and confirm this checkout is at the tip of the
  target branch (resolve the target branch from `git remote show origin`'s HEAD branch
  line if not already obvious). If it's merely behind, fast-forward it via `git merge
  --ff-only` — never `git reset --hard`. If it has diverged rather than just fallen
  behind, stop and report that instead of proceeding on unverified state.

  If any project documentation (CLAUDE.md, rules, README) describes this skill's past
  or historical behavior in a way that doesn't match this skill's own current
  instructions, treat the project doc as stale historical context — never as a
  procedure to execute.

  Then: /claude-tweaks:docs-health
model: claude-sonnet-5
allowed_tools: [Bash, Read, Grep, Glob]
mcp_connections: []
default_schedule:
  cron_expression: "0 6 * * *"
  description: "off-peak anchor, UTC — confirm against your local timezone at creation time"
notes: >
  Report-only, matching code-health/harness-health — every finding files as a GitHub
  issue for human review; docs-health never edits docs content. Default budget is 1
  target per firing — see skills/docs-health/SKILL.md's Routine Configuration section
  for tuning guidance this template doesn't restate. Filed issues carry no tier label
  and won't progress toward autonomous building on their own — a human needs to
  periodically run bare `/claude-tweaks:triage` (or schedule a triage-adjacent routine)
  to tier them.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test bin/lib/docs-health/tests/skill-md.test.js`
Expected: PASS

- [ ] **Step 6: Run the full docs-health suite**

Run: `npm test 2>&1 | tail -15`
Expected: all docs-health tests pass, no new failures introduced anywhere else in the suite.

- [ ] **Step 7: Commit**

```bash
git add skills/docs-health/SKILL.md skills/docs-health/routine-template.yml bin/lib/docs-health/tests/skill-md.test.js
git commit -m "Add docs-health SKILL.md and routine template

refs #36"
```

---

## Task 9: Cross-reference updates + version bump

**Files:**
- Modify: `README.md`
- Modify: `skills/help/reference-card.md`
- Modify: `skills/harness-health/SKILL.md` (Relationship to Other Skills table — bidirectional reference)
- Modify: `CLAUDE.md` (skill-directory table `## Structure` Utility row; `## Commands` section)
- Modify: `.claude-plugin/plugin.json` (version bump)

**Interfaces:**
- Consumes: `skills/docs-health/SKILL.md` (Task 8, already merged) as the thing being cross-referenced.
- Produces: nothing new consumed by later code — this is the final documentation-consistency pass and version bump.

- [ ] **Step 1: Update `README.md`**

In `README.md`, immediately after the `**\`/claude-tweaks:journey-health\`**` paragraph (search for that exact heading text) and before the `**\`/claude-tweaks:design\`**` paragraph, insert a new paragraph:

```markdown
**`/claude-tweaks:docs-health`** — Recurring health check for `docs/**`: picks one doc to audit, judges it against the shared `_shared/criteria-docs-diataxis.md` procedure — Diátaxis genre-drift (implied doc type vs. actual content shape), factual staleness, and dual-persona misleading-risk tagging (human engineer vs. coding agent) — and always files a `docs-health`-labelled GitHub issue. Never edits docs content — report-only, matching `/code-health` and `/harness-health`. Scoped strictly to `docs/**`, excluding `docs/superpowers/**` (ephemeral build artifacts) and never overlapping `harness-health`'s `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md territory. Runs on a scheduled Routine for continuous coverage.
```

- [ ] **Step 2: Update `skills/help/reference-card.md`**

In `skills/help/reference-card.md`, immediately after the `/claude-tweaks:journey-health` row, insert a new row:

```
| `/claude-tweaks:docs-health` | Recurring health check auditing `docs/**` for Diátaxis genre-drift and factual staleness, with dual-persona misleading-risk tagging. Scheduled Routine. Never edits anything — always files a GitHub issue. | `--target <id>`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```

- [ ] **Step 3: Add a bidirectional cross-reference in `skills/harness-health/SKILL.md`**

In `skills/harness-health/SKILL.md`'s `## Relationship to Other Skills` table, add a new row (any position in the table is fine — append at the end, right before the final `/claude-tweaks:routine` row, or after it):

```
| `/claude-tweaks:docs-health` | Sibling health skill for `docs/**` (Diátaxis genre-drift + staleness) — shares this skill's SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline shape and `_shared/health-state.md`'s durable persistence, but scoped to a disjoint file set: docs-health's rotation pool only ever walks `docs/`, never `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md. |
```

- [ ] **Step 4: Update `CLAUDE.md`'s skill-directory table and Commands section**

In `CLAUDE.md`, find this line (in the `### Structure` skill-directory list):

```
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, triage, dispatch
```

Replace with:

```
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, docs-health, triage, dispatch
```

Find this block (in the `## Commands` section):

```
npm test                            # Runs node --test over tests/ AND bin/lib/code-health/tests/ AND bin/lib/issues/tests/ AND bin/lib/harness-health/tests/ AND bin/lib/journey-health/tests/
node --test bin/lib/code-health/tests/*.test.js   # Code-health unit suite only
node bin/code-health.js <cmd>             # Code-health CLI: validate-findings, classify, next-slice, status, churn-report, pull-issues
node --test bin/lib/harness-health/tests/*.test.js   # Harness-health unit suite only
node bin/harness-health.js <cmd>     # Harness-health CLI: next-target, validate-findings, mark, churn-report
node --test bin/lib/journey-health/tests/*.test.js   # Journey-health unit suite only
node bin/journey-health.js <cmd>     # Journey-health CLI: next-target, validate-findings, mark, churn-report, qa-evidence
```

Replace with:

```
npm test                            # Runs node --test over tests/ AND bin/lib/code-health/tests/ AND bin/lib/issues/tests/ AND bin/lib/harness-health/tests/ AND bin/lib/journey-health/tests/ AND bin/lib/docs-health/tests/
node --test bin/lib/code-health/tests/*.test.js   # Code-health unit suite only
node bin/code-health.js <cmd>             # Code-health CLI: validate-findings, classify, next-slice, status, churn-report, pull-issues
node --test bin/lib/harness-health/tests/*.test.js   # Harness-health unit suite only
node bin/harness-health.js <cmd>     # Harness-health CLI: next-target, validate-findings, mark, churn-report
node --test bin/lib/journey-health/tests/*.test.js   # Journey-health unit suite only
node bin/journey-health.js <cmd>     # Journey-health CLI: next-target, validate-findings, mark, churn-report, qa-evidence
node --test bin/lib/docs-health/tests/*.test.js   # Docs-health unit suite only
node bin/docs-health.js <cmd>        # Docs-health CLI: next-target, validate-findings, mark, churn-report
```

- [ ] **Step 5: Bump the plugin version**

In `.claude-plugin/plugin.json`, change `"version": "6.1.1"` to `"version": "6.2.0"` (minor bump — feature addition, per CLAUDE.md's Releasing convention).

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')).version)"`
Expected: `6.2.0`

- [ ] **Step 6: Run the full test suite one last time**

Run: `npm test 2>&1 | tail -15`
Expected: no new failures beyond this build's known pre-existing flaky timing test (`tests/statusline.test.js`'s "render under 750ms" — confirmed flaky under load at this build's baseline, passes in isolation).

- [ ] **Step 7: Commit**

```bash
git add README.md skills/help/reference-card.md skills/harness-health/SKILL.md CLAUDE.md .claude-plugin/plugin.json
git commit -m "Cross-reference docs-health across README/reference-card/harness-health/CLAUDE.md, bump to 6.2.0

refs #36"
```

---

## Self-Review

**Spec coverage** — every Deliverable and Acceptance Criterion from the materialized spec (`.claude-tweaks/pipelines/2026-07-16T215020-record-36/work/36-spec.md`) maps to a task:
- `SKILL.md`/`routine-template.yml`/engine module layout → Task 8, Tasks 3-7.
- Criteria fragment under `skills/_shared/` → Task 2.
- Scope boundary against harness-health, explicitly resolved and documented → Task 4 (structural exclusion + regression test), Task 2 (criteria fragment's Constraints section), Task 8 (SKILL.md's "Not for" line + Relationship table), Task 9 (harness-health's own reciprocal row).
- Report-only, never edits docs → Task 8's Anti-Patterns table; no `Edit`/`Write` call anywhere in Tasks 3-7's engine code (all pure computation + `gh` shelling documented in SKILL.md, never executed by the engine itself).
- `Anti-Patterns` + `Relationship to Other Skills` sections → Task 8 (verified by `skill-md.test.js`'s house-sections-in-order test).
- Additional scope discovered during planning (not in the original issue, but required for correctness): Task 1 (the `ORIGINS` enum gap — `recordPayload` would otherwise throw on `origin: 'docs-health'`), Task 3 Step 8 (the `package.json` test-script wiring gap — new tests would otherwise never run under `npm test`), Task 9 (the version bump, per CLAUDE.md's explicit "don't let a phase's version bump depend on remembering to add it" convention).

**Placeholder scan** — no `TBD`/`TODO`/vague acceptance criteria anywhere above; every step names exact file paths, complete code, and exact commands with expected output.

**Type consistency** — the Finding Shape (`target`, `assetType: "doc"`, `section`, `category`, `misleads`, `classification`, `confidence`, `reversibility`, `oldString`, `newString`) is identical across Task 5 (`validate-finding.js`), Task 6 (`issue-payload.js`), Task 7 (the CLI's `cmdValidateFindings`), and Task 8 (SKILL.md's JUDGE step) — verified by re-reading all four before finalizing this plan. The `doc:${id}` cursor-key convention is identical across Task 3 (`buildValidateFindingsUpdate`) and Task 4 (`selectTarget`). The `docshealth-XXXXXXXX` fingerprint prefix is identical across Task 3 (`fingerprint.js`), Task 6/7 (test fixtures), and Task 8 (SKILL.md's documented marker format).
