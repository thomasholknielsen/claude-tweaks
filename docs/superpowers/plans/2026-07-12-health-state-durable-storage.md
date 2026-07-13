# Durable Cross-Firing Health-State Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `code-health`, `harness-health`, and `journey-health` durable cross-firing storage (a dedicated `health-state` git branch) so rotation cursors, the sub-threshold "remembered" cache, and a new filing retry/dead-letter queue survive ephemeral CCR container recycling — closing GitHub issues #7 and #8.

**Architecture:** A new pure-ish module, `bin/lib/health-core/durable-state.js` (impure `execFileSync`-based git/`gh` calls behind an injectable runner, mirroring `bin/lib/code-health/scope.js`'s existing pattern — not the emit-only pattern used by `bin/lib/issues/claims.js`, since this is mechanical plumbing, not an audit-visible protocol), replaces each skill's local `cursors.json`/run-history persistence with reads/writes against a dedicated `health-state` branch, using GitHub's fast-forward-only ref update as a free compare-and-swap. A new retry-queue (also durable) closes #8. The pre-existing `bin/lib/watchman-core/` module is renamed to `bin/lib/health-core/` throughout, and "recurring watchman" prose becomes "recurring health check" (the "health-state" term is reserved for the storage branch only — see the spec's naming-rename table for why the metaphor doesn't substitute directly).

**Tech Stack:** Node.js (`node --test`), `gh` CLI (Git Data API: blobs/trees/commits/refs), git plumbing (`fetch`, `show`, `rev-parse`).

## Global Constraints

- Every existing JSON shape (cursor entries, run records, cache entries) keeps its exact current field names — only storage location changes. No schema migration beyond relocation.
- `cache.json`'s open/closed/wontfix/regressed dedup entries are **not** touched by this plan — they stay local, gitignored, rebuilt from `gh issue list` every run, exactly as today.
- `docs/superpowers/plans/*.md` and `docs/superpowers/specs/*.md` are **never** edited by this plan (historical decision records).
- Every new/modified test must pass via `node --test` (aggregated by `npm test`) before a task's commit.
- Follow this repo's existing code style: `'use strict'`, plain `require`, no TypeScript, JSDoc-style comments above non-obvious functions, `node:test`/`node:assert` for tests.
- `health-state` branch layout (from the spec): `{skill}/cursors.json`, `{skill}/retry-queue.json`, `{skill}/runs.json` for all three skills; `code-health/remembered.json` additionally, code-health only.
- CAS write retry is bounded at 3 attempts; on exhaustion, warn to stderr and skip the branch write for that firing — never throw and never block emitting payloads/reporting results.
- Escalate a retry-queue entry to a dedicated `{skill}:filing-failed` issue on its 3rd consecutive failure.
- Run-history is capped to the last 90 records per skill (`runs.json` is a single pruned array, not one-file-per-run).

---

## Task 1: Rename `watchman-core` → `health-core` throughout live code and docs

**Files:**
- Modify (rename): `bin/lib/watchman-core/` → `bin/lib/health-core/` (git mv, all files inside)
- Modify: `bin/lib/code-health/cache.js:4`
- Modify: `bin/lib/harness-health/cache.js:2-3`, `bin/lib/harness-health/fingerprint.js:2`, `bin/lib/harness-health/dedup.js:2`
- Modify: `bin/lib/journey-health/cache.js:2-3`, `bin/lib/journey-health/fingerprint.js:2`, `bin/lib/journey-health/dedup.js:2`
- Modify: `bin/lib/health-core/tests/cache.test.js:9`, `bin/lib/health-core/tests/runs.test.js:9`
- Modify: `bin/lib/health-core/cache.js` header comment
- Modify: `CLAUDE.md:28`
- Modify: `README.md:214`, `README.md:216`
- Modify: `skills/help/reference-card.md:46`, `skills/help/reference-card.md:47`
- Modify: `skills/code-health/SKILL.md:9`, `skills/harness-health/SKILL.md:9`, `skills/journey-health/SKILL.md:9`

**Interfaces:**
- Consumes: nothing (pure rename, no new interfaces)
- Produces: `bin/lib/health-core/{cache,fingerprint,dedup,runs}.js` — same exports as today's `watchman-core` equivalents, importable via `require('../health-core/cache')` etc. from each skill's own `bin/lib/{skill}/*.js`.

- [ ] **Step 1: Rename the directory and confirm the working tree reflects it**

```bash
git -C "$(pwd)" mv bin/lib/watchman-core bin/lib/health-core
git status --short
```

Expected: `bin/lib/health-core/` now contains `cache.js`, `dedup.js`, `fingerprint.js`, `runs.js`, `tests/cache.test.js`, `tests/runs.test.js` — `git status` shows renames (`R`), not delete+add.

- [ ] **Step 2: Update every `require('../watchman-core/...')` to `require('../health-core/...')`**

In `bin/lib/code-health/cache.js`, line 4:

```js
const { createCache } = require('../health-core/cache');
```

In `bin/lib/harness-health/cache.js`, lines 2-3:

```js
const { createCache } = require('../health-core/cache');
const { recordRun, computeChurn } = require('../health-core/runs');
```

In `bin/lib/harness-health/fingerprint.js`, line 2:

```js
const { normalizeText, fingerprintFromBasis } = require('../health-core/fingerprint');
```

In `bin/lib/harness-health/dedup.js`, line 2:

```js
module.exports = require('../health-core/dedup');
```

In `bin/lib/journey-health/cache.js`, lines 2-3:

```js
const { createCache } = require('../health-core/cache');
const { recordRun, computeChurn } = require('../health-core/runs');
```

In `bin/lib/journey-health/fingerprint.js`, line 2:

```js
const { normalizeText, fingerprintFromBasis } = require('../health-core/fingerprint');
```

In `bin/lib/journey-health/dedup.js`, line 2:

```js
module.exports = require('../health-core/dedup');
```

- [ ] **Step 3: Rename the test tmpdir prefixes**

In `bin/lib/health-core/tests/cache.test.js`, line 9, change:

```js
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'watchman-core-cache-')); }
```

to:

```js
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'health-core-cache-')); }
```

In `bin/lib/health-core/tests/runs.test.js`, line 9, change:

```js
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'watchman-core-runs-')); }
```

to:

```js
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'health-core-runs-')); }
```

- [ ] **Step 4: Fix the "health watchmen" phrase in `bin/lib/health-core/cache.js`'s header comment**

Change:

```js
// Generic gitignored cache/cursor/runs persistence shared by the health
// watchmen (code-health, harness-health, journey-health). Each skill's own
```

to:

```js
// Generic gitignored cache/cursor/runs persistence shared by the three
// health skills (code-health, harness-health, journey-health). Each skill's own
```

- [ ] **Step 5: Update `CLAUDE.md`'s structure listing**

Line 28, change:

```
bin/lib/                          → Shared Node helpers (color, deps, coordination, issue claims + ingestion, policy). Multi-file modules live directly at bin/lib/{name}/ (e.g. bin/lib/issues/, bin/lib/hooks/, bin/lib/watchman-core/) — flat sibling directories, NOT a nested _shared/ wrapper. That convention is specific to skills/_shared/; don't assume it applies here.
```

to:

```
bin/lib/                          → Shared Node helpers (color, deps, coordination, issue claims + ingestion, policy). Multi-file modules live directly at bin/lib/{name}/ (e.g. bin/lib/issues/, bin/lib/hooks/, bin/lib/health-core/) — flat sibling directories, NOT a nested _shared/ wrapper. That convention is specific to skills/_shared/; don't assume it applies here.
```

- [ ] **Step 6: Update `README.md`'s two "Recurring watchman" descriptions**

Line 214, change the leading phrase `Recurring watchman for` to `Recurring health check for` (rest of the sentence unchanged):

```
**`/claude-tweaks:harness-health`** — Recurring health check for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or checks for a new-skill gap), judges it via the shared `_shared/harness-health-analysis.md` procedure — also used by `/init` Phase 6 and `/wrap-up` Step 7 (skill-only for those two currently) — and always files a `harness-health`-labelled GitHub issue. Never edits anything directly (skills, rules, memory, or CLAUDE.md) — report-only, matching `/code-health`. Runs on a scheduled Routine for continuous coverage, rotating through skills, rules, and CLAUDE.md via a churn/staleness cursor shared with `/init` and `/wrap-up`. Memory (`~/.claude/projects/{slug}/memory/`) is audited only via an explicit `--kind memory --memory-dir <path>` invocation — never through the Routine's automatic rotation.
```

Line 216, change the leading phrase `Recurring watchman for` to `Recurring health check for` (rest unchanged):

```
**`/claude-tweaks:journey-health`** — Recurring health check for `docs/journeys/*.md`: picks one journey to audit (or the decoupled coverage scan, when due), checks it against the codebase (file-existence, self-review criteria shared with `/claude-tweaks:journeys`, journey-story coverage shared with `/claude-tweaks:review`'s `3g-cov` lens), and always files a `journey-health`-labelled GitHub issue. A separate, interactive-only deep tier (`--deep`) actually runs the journey's QA stories via `/claude-tweaks:test` (or walks it live via `/claude-tweaks:visual-review` when no stories exist yet) and judges whether a failure means the journey/story text is stale or the app genuinely regressed. Never edits journeys, stories, or code — report-only, matching `/code-health` and `/harness-health`.
```

- [ ] **Step 7: Update `skills/help/reference-card.md`'s two "Recurring watchman" entries**

Line 46, change `Recurring watchman auditing` to `Recurring health check auditing`:

```
| `/claude-tweaks:harness-health` | Recurring health check auditing `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md for drift, template-conformance, and best-practice gaps, sharing its judgment procedure with `/init`/`/wrap-up`. Scheduled Routine. Never edits anything — always files a GitHub issue. | `--target <name>`, `--kind <skill\|rule\|claude-md\|design-artifact\|memory>`, `--memory-dir <path>`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```

Line 47, change `Recurring watchman auditing` to `Recurring health check auditing`:

```
| `/claude-tweaks:journey-health` | Recurring health check auditing `docs/journeys/*.md` for drift and journey-story coverage gaps (light tier); an interactive-only deep tier actually runs a journey's QA stories or walks it live. Scheduled Routine (light tier only). Never edits anything — always files a GitHub issue. | `--target <name>`, `--deep`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```

- [ ] **Step 8: Update the three skills' own line-9 self-descriptions**

`skills/code-health/SKILL.md:9`, change:

```
A recurring watchman doing rounds: reads one directory slice, judges it against the universal criteria catalog, fingerprints each finding, dedups against open GitHub issues, and files the work worth doing. The LLM is the spine. Deterministic helpers handle fingerprint, dedup, and issue-payload projection. It never edits code.
```

to:

```
A recurring health check doing rounds: reads one directory slice, judges it against the universal criteria catalog, fingerprints each finding, dedups against open GitHub issues, and files the work worth doing. The LLM is the spine. Deterministic helpers handle fingerprint, dedup, and issue-payload projection. It never edits code.
```

`skills/harness-health/SKILL.md:9`, change:

```
A recurring watchman for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or the next new-skill gap to check for), judges it via the shared `_shared/harness-health-analysis.md` procedure, and files a `harness-health`-labelled GitHub issue. Never edits code — only harness documentation.
```

to:

```
A recurring health check for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or the next new-skill gap to check for), judges it via the shared `_shared/harness-health-analysis.md` procedure, and files a `harness-health`-labelled GitHub issue. Never edits code — only harness documentation.
```

`skills/journey-health/SKILL.md:9`, change:

```
A recurring watchman for `docs/journeys/*.md`: picks one journey to audit against the codebase, judges it, and always files a `journey-health`-labelled GitHub issue. Never edits journey files, stories, or code — every fix routes through `/claude-tweaks:journeys` or `/claude-tweaks:stories`, invoked by a human or `/triage dispatch` → `/flow`.
```

to:

```
A recurring health check for `docs/journeys/*.md`: picks one journey to audit against the codebase, judges it, and always files a `journey-health`-labelled GitHub issue. Never edits journey files, stories, or code — every fix routes through `/claude-tweaks:journeys` or `/claude-tweaks:stories`, invoked by a human or `/triage dispatch` → `/flow`.
```

- [ ] **Step 9: Run the full test suite and grep for stray "watchman" references**

```bash
npm test
grep -rn "watchman" --include="*.md" --include="*.js" . 2>/dev/null | grep -v node_modules | grep -v "docs/superpowers/plans/" | grep -v "docs/superpowers/specs/"
```

Expected: `npm test` passes with the same test count as before the rename (only paths changed, no test logic changed). The grep prints **no output** — every live-code/live-doc occurrence is gone; only historical `docs/superpowers/plans/*` and `docs/superpowers/specs/*` files (excluded by the grep) still mention it.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Rename watchman-core to health-core; watchman prose to health check

Prepares for the new health-state durable-storage branch (closes gaps
for #7, #8) — health-state is reserved for that storage mechanism, not
the recurring-behavior metaphor, so the metaphor's own wording changes
to health check instead of being overloaded.

Claude-Session: https://claude.ai/code/session_01CErp2mNj92Dnyp3f8MgKJb"
```

---

## Task 2: `bin/lib/health-core/durable-state.js` — the durable branch module

**Files:**
- Create: `bin/lib/health-core/durable-state.js`
- Create: `bin/lib/health-core/tests/durable-state.test.js`
- Create: `bin/lib/health-core/retry-cli.js`
- Create: `bin/lib/health-core/tests/retry-cli.test.js`

**Interfaces:**
- Consumes: nothing new (uses Node's `child_process.execFileSync` by default)
- Produces (for Tasks 4, 6, 8 to consume):
  - `HEALTH_STATE_BRANCH` (string constant, `'health-state'`)
  - `MAX_RUN_HISTORY` (number constant, `90`)
  - `ESCALATE_AFTER_ATTEMPTS` (number constant, `3`)
  - `statePath(skillName, file) -> string`
  - `pruneRuns(runs, maxCount = MAX_RUN_HISTORY) -> array`
  - `enqueueRetry(queue, entry, { now } = {}) -> array` — `entry: { fingerprint, payload, lastError? }`
  - `dequeueRetry(queue, fingerprint) -> array`
  - `shouldEscalate(entry) -> boolean`
  - `createDurableState(skillName, { run, includeRemembered = false } = {}) -> { readState(root), writeState(root, mutatorFn) }`
    - `includeRemembered` must be `true` for code-health (the only skill with a sub-threshold "remembered" tier) and omitted (defaults `false`) for harness-health/journey-health — this is a property of the skill established once at `createDurableState` call time, not inferred per-write from data shape, specifically so a skill that never opts in can never accidentally get a `remembered.json` file written to its branch directory.
    - `readState(root) -> { cursors: object, retryQueue: array, runs: array }` — plus a `remembered: object` key, present only when `includeRemembered` is `true`.
    - `writeState(root, mutatorFn) -> { ok: boolean, error?: string }` — `mutatorFn` receives the current state object (same shape as `readState`'s return) and must return the next state object in the same shape.
  - `bin/lib/health-core/retry-cli.js`'s `makeRetryQueueCommands({ readDurableState, writeDurableState }) -> { drain(args), update(args) }` — the shared CLI command implementations for `retry-queue drain`/`retry-queue update`, used identically by `bin/code-health.js`, `bin/harness-health.js`, and `bin/journey-health.js` (Tasks 4, 6, 8) instead of each CLI restating the same logic.

- [ ] **Step 1: Write the failing tests for the pure helpers**

Create `bin/lib/health-core/tests/durable-state.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  HEALTH_STATE_BRANCH,
  MAX_RUN_HISTORY,
  ESCALATE_AFTER_ATTEMPTS,
  statePath,
  pruneRuns,
  enqueueRetry,
  dequeueRetry,
  shouldEscalate,
  createDurableState,
} = require('../durable-state');

test('constants', () => {
  assert.strictEqual(HEALTH_STATE_BRANCH, 'health-state');
  assert.strictEqual(MAX_RUN_HISTORY, 90);
  assert.strictEqual(ESCALATE_AFTER_ATTEMPTS, 3);
});

test('statePath namespaces a file under the skill name', () => {
  assert.strictEqual(statePath('code-health', 'cursors.json'), 'code-health/cursors.json');
});

test('pruneRuns keeps only the newest maxCount records, oldest first order preserved', () => {
  const runs = [
    { runId: 'a', runAt: '2026-01-01T00:00:00.000Z' },
    { runId: 'b', runAt: '2026-01-02T00:00:00.000Z' },
    { runId: 'c', runAt: '2026-01-03T00:00:00.000Z' },
  ];
  const pruned = pruneRuns(runs, 2);
  assert.deepStrictEqual(pruned.map((r) => r.runId), ['b', 'c']);
});

test('pruneRuns is a no-op when runs.length <= maxCount', () => {
  const runs = [{ runId: 'a', runAt: '2026-01-01T00:00:00.000Z' }];
  assert.deepStrictEqual(pruneRuns(runs, 90), runs);
});

test('pruneRuns sorts by runAt before slicing, regardless of input order', () => {
  const runs = [
    { runId: 'c', runAt: '2026-01-03T00:00:00.000Z' },
    { runId: 'a', runAt: '2026-01-01T00:00:00.000Z' },
    { runId: 'b', runAt: '2026-01-02T00:00:00.000Z' },
  ];
  assert.deepStrictEqual(pruneRuns(runs, 2).map((r) => r.runId), ['b', 'c']);
});

test('enqueueRetry adds a brand-new fingerprint with attempts:1', () => {
  const next = enqueueRetry([], { fingerprint: 'ch-abc123', payload: { title: 't' } }, { now: 1720000000000 });
  assert.strictEqual(next.length, 1);
  assert.strictEqual(next[0].fingerprint, 'ch-abc123');
  assert.strictEqual(next[0].attempts, 1);
  assert.strictEqual(next[0].firstFailedAt, new Date(1720000000000).toISOString());
});

test('enqueueRetry increments attempts for an existing fingerprint instead of duplicating', () => {
  const queue = [{ fingerprint: 'ch-abc123', payload: { title: 't' }, firstFailedAt: 'x', attempts: 1, lastError: null }];
  const next = enqueueRetry(queue, { fingerprint: 'ch-abc123', payload: { title: 't' }, lastError: 'timeout' }, { now: 1720000000000 });
  assert.strictEqual(next.length, 1);
  assert.strictEqual(next[0].attempts, 2);
  assert.strictEqual(next[0].lastError, 'timeout');
  assert.strictEqual(next[0].firstFailedAt, 'x', 'firstFailedAt must not change on repeat failures');
});

test('dequeueRetry removes only the matching fingerprint', () => {
  const queue = [
    { fingerprint: 'a', attempts: 1 },
    { fingerprint: 'b', attempts: 1 },
  ];
  assert.deepStrictEqual(dequeueRetry(queue, 'a'), [{ fingerprint: 'b', attempts: 1 }]);
});

test('shouldEscalate is true at exactly ESCALATE_AFTER_ATTEMPTS and beyond, false below it', () => {
  assert.strictEqual(shouldEscalate({ attempts: 2 }), false);
  assert.strictEqual(shouldEscalate({ attempts: 3 }), true);
  assert.strictEqual(shouldEscalate({ attempts: 4 }), true);
});

test('shouldEscalate is false for a missing entry', () => {
  assert.strictEqual(shouldEscalate(null), false);
  assert.strictEqual(shouldEscalate(undefined), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/health-core/tests/durable-state.test.js`
Expected: FAIL — `Cannot find module '../durable-state'`.

- [ ] **Step 3: Implement the pure helpers**

Create `bin/lib/health-core/durable-state.js` (pure-helpers section first; the impure `createDurableState` section is added in Step 5):

```js
'use strict';
const { execFileSync } = require('child_process');

// Durable cross-firing state for the health skills, backed by a dedicated
// git branch (never merged into main) instead of local gitignored disk —
// local disk doesn't survive a scheduled cloud-routine (CCR) container
// recycling between firings. Contract: skills/_shared/health-state.md.
//
// Impure (execFileSync git/gh calls), matching bin/lib/code-health/scope.js's
// existing precedent — not bin/lib/issues/claims.js's emit-only pattern,
// since reading/writing this branch is mechanical plumbing nobody inspects
// mid-flight, unlike issue claim/release which is a decision-laden,
// audit-visible action meant to be legible in the skill's own bash trail.
// The command runner is injectable so tests substitute a fake one instead
// of touching real network (git fetch/gh api can't run for real in a
// sandboxed unit test the way scope.js's local git log calls can).

const HEALTH_STATE_BRANCH = 'health-state';
const MAX_RUN_HISTORY = 90;
const ESCALATE_AFTER_ATTEMPTS = 3;
const MAX_CAS_ATTEMPTS = 3;
const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // git's well-known empty-tree sha

function statePath(skillName, file) {
  return `${skillName}/${file}`;
}

// Keep the newest maxCount records by runAt, dropping the oldest.
function pruneRuns(runs, maxCount = MAX_RUN_HISTORY) {
  const sorted = [...runs].sort((a, b) => (a.runAt < b.runAt ? -1 : a.runAt > b.runAt ? 1 : 0));
  return sorted.slice(Math.max(0, sorted.length - maxCount));
}

// Upsert by fingerprint: a repeat failure increments attempts and updates
// lastError without disturbing firstFailedAt; a brand-new fingerprint starts
// at attempts:1.
function enqueueRetry(queue, entry, { now = Date.now() } = {}) {
  const idx = queue.findIndex((e) => e.fingerprint === entry.fingerprint);
  if (idx === -1) {
    return [
      ...queue,
      {
        fingerprint: entry.fingerprint,
        payload: entry.payload,
        firstFailedAt: new Date(now).toISOString(),
        attempts: 1,
        lastError: entry.lastError || null,
      },
    ];
  }
  const next = [...queue];
  next[idx] = { ...next[idx], attempts: next[idx].attempts + 1, lastError: entry.lastError || next[idx].lastError };
  return next;
}

function dequeueRetry(queue, fingerprint) {
  return queue.filter((e) => e.fingerprint !== fingerprint);
}

function shouldEscalate(entry) {
  return !!entry && entry.attempts >= ESCALATE_AFTER_ATTEMPTS;
}

module.exports = {
  HEALTH_STATE_BRANCH,
  MAX_RUN_HISTORY,
  ESCALATE_AFTER_ATTEMPTS,
  statePath,
  pruneRuns,
  enqueueRetry,
  dequeueRetry,
  shouldEscalate,
};
```

- [ ] **Step 4: Run the tests to verify the pure helpers pass**

Run: `node --test bin/lib/health-core/tests/durable-state.test.js`
Expected: the 9 tests written in Step 1 PASS (the `createDurableState` import stays `undefined` for now — no test references it yet).

- [ ] **Step 5: Write the failing tests for `createDurableState`**

Append to `bin/lib/health-core/tests/durable-state.test.js`:

```js
// --- createDurableState: fake runner records every (cmd, args, opts) call and
// returns canned responses keyed by a simple pattern match on args. `returns`/
// `throws` may be a plain value OR a function of (cmd, args) called lazily on
// each match — use a function whenever a rule needs to react to prior calls
// (a counter, a flag flipped by an earlier matched rule) so the state change
// happens when the fake is actually invoked by the code under test, not once
// eagerly while the script array literal is being built. ---

function fakeRunner(script) {
  const calls = [];
  function run(cmd, args, opts) {
    calls.push({ cmd, args, opts });
    for (const rule of script) {
      if (rule.match(cmd, args)) {
        const throwsVal = typeof rule.throws === 'function' ? rule.throws(cmd, args) : rule.throws;
        if (throwsVal) throw new Error(throwsVal);
        return typeof rule.returns === 'function' ? rule.returns(cmd, args) : rule.returns;
      }
    }
    throw new Error(`fakeRunner: no rule matched ${cmd} ${JSON.stringify(args)}`);
  }
  return { run, calls };
}

function matchArgs(args, needle) {
  return args.join(' ').includes(needle);
}

test('readState returns empty defaults when the branch does not exist yet (includeRemembered:true skill)', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), throws: "couldn't find remote ref health-state" },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const state = ds.readState('/repo');
  assert.deepStrictEqual(state, { cursors: {}, remembered: {}, retryQueue: [], runs: [] });
});

test('readState parses each file via git show, defaulting missing files to {}/[]', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'cursors.json'), returns: JSON.stringify({ '.': { lastSweptMs: 1 } }) },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'remembered.json'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'retry-queue.json'), returns: '[]' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'runs.json'), returns: '[]' },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const state = ds.readState('/repo');
  assert.deepStrictEqual(state.cursors, { '.': { lastSweptMs: 1 } });
  assert.deepStrictEqual(state.remembered, {});
  assert.deepStrictEqual(state.retryQueue, []);
  assert.deepStrictEqual(state.runs, []);
});

test('readState omits the remembered key entirely for a skill that does not opt in (includeRemembered defaults to false)', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
  ]);
  const ds = createDurableState('harness-health', { run });
  const state = ds.readState('/repo');
  assert.deepStrictEqual(state, { cursors: {}, retryQueue: [], runs: [] });
  assert.ok(!('remembered' in state), 'a skill that never opts in must never see a remembered key at all');
});

test('writeState succeeds on the first attempt: fetch, read, build blobs/tree/commit, non-force ref update', () => {
  const written = {};
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'tree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'), returns: 'commit-sha-2\n' },
    {
      match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'),
      returns: () => { written.updated = true; return ''; },
    },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => ({ ...current, cursors: { '.': { lastSweptMs: 2 } } }));
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(written.updated, true);
});

test('writeState retries on a rejected (non-fast-forward) ref update, then succeeds', () => {
  let refAttempts = 0;
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'tree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'), returns: 'commit-sha-2\n' },
    {
      match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'),
      returns: () => {
        refAttempts += 1;
        if (refAttempts === 1) throw new Error('422 Reference update failed (non-fast-forward)');
        return '';
      },
    },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => ({ ...current, cursors: { '.': { lastSweptMs: 2 } } }));
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(refAttempts, 2, 'must retry the whole read-modify-write cycle after a rejection');
});

test('writeState gives up gracefully (no throw) after MAX_CAS_ATTEMPTS exhausted', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'tree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'), returns: 'commit-sha-2\n' },
    {
      match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'),
      throws: '422 Reference update failed (non-fast-forward)',
    },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error, 'must report why it gave up');
});

test('writeState bootstraps the branch when it does not exist yet, then completes the write on the bootstrapped branch', () => {
  let branchCreated = false;
  const { run, calls } = fakeRunner([
    {
      match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'),
      returns: () => {
        if (!branchCreated) throw new Error("couldn't find remote ref health-state");
        return '';
      },
    },
    {
      match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse'),
      returns: (cmd, args) => {
        if (!branchCreated) throw new Error('unknown revision');
        return matchArgs(args, '^{tree}') ? 'tree-sha-1\n' : 'commit-sha-1\n';
      },
    },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    {
      match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'),
      returns: () => { branchCreated = true; return 'commit-sha\n'; },
    },
    {
      match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'repos/{owner}/{repo}/git/refs') && !matchArgs(args, 'heads'),
      returns: '',
    },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'), returns: '' },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  assert.ok(branchCreated, 'ensureBranch must have created the bootstrap commit before the main write proceeded');
  const refCreateCall = calls.find(
    (c) => c.cmd === 'gh' && c.args.includes('repos/{owner}/{repo}/git/refs'),
  );
  assert.ok(refCreateCall, 'must have called the plain git/refs create endpoint during bootstrap, distinct from the git/refs/heads/health-state PATCH');
});

test('writeState never includes a remembered.json blob for a skill that does not opt in', () => {
  const { run, calls } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'tree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'), returns: 'commit-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'), returns: '' },
  ]);
  const ds = createDurableState('harness-health', { run });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  const treeCall = calls.find((c) => c.cmd === 'gh' && c.args.includes('repos/{owner}/{repo}/git/trees'));
  const paths = JSON.parse(treeCall.opts.input).tree.map((e) => e.path).sort();
  assert.deepStrictEqual(paths, ['harness-health/cursors.json', 'harness-health/retry-queue.json', 'harness-health/runs.json']);
});

test('writeState includes a remembered.json blob only for a skill that opts in', () => {
  const { run, calls } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'tree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'), returns: 'commit-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'), returns: '' },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  const treeCall = calls.find((c) => c.cmd === 'gh' && c.args.includes('repos/{owner}/{repo}/git/trees'));
  const paths = JSON.parse(treeCall.opts.input).tree.map((e) => e.path).sort();
  assert.deepStrictEqual(paths, [
    'code-health/cursors.json',
    'code-health/remembered.json',
    'code-health/retry-queue.json',
    'code-health/runs.json',
  ]);
});
```

- [ ] **Step 6: Run the tests to verify the new ones fail**

Run: `node --test bin/lib/health-core/tests/durable-state.test.js`
Expected: FAIL — `createDurableState is not a function` (not yet exported).

- [ ] **Step 7: Implement `createDurableState`**

Append to `bin/lib/health-core/durable-state.js`, before the final `module.exports`:

```js
function defaultRun(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

function createDurableState(skillName, { run = defaultRun, includeRemembered = false } = {}) {
  function showFile(root, relPath, fallback) {
    try {
      const out = run('git', ['-C', root, 'show', `origin/${HEALTH_STATE_BRANCH}:${relPath}`]);
      return JSON.parse(out);
    } catch {
      return fallback;
    }
  }

  function currentCommitSha(root) {
    try {
      return run('git', ['-C', root, 'rev-parse', `origin/${HEALTH_STATE_BRANCH}`]).trim();
    } catch {
      return null;
    }
  }

  function currentTreeSha(root) {
    try {
      return run('git', ['-C', root, 'rev-parse', `origin/${HEALTH_STATE_BRANCH}^{tree}`]).trim();
    } catch {
      return null;
    }
  }

  // Reads never throw: a missing branch/file degrades to the empty default,
  // matching cache.js's existing "corrupt/missing JSON -> {}" convention.
  // `remembered` is only ever present when this skill opted in via
  // includeRemembered — a skill that didn't must never see the key at all,
  // so harness-health/journey-health can't accidentally pick up a spurious
  // remembered.json (see buildFiles below, which gates on the same flag).
  function readState(root) {
    try {
      run('git', ['-C', root, 'fetch', 'origin', HEALTH_STATE_BRANCH]);
    } catch {
      return includeRemembered
        ? { cursors: {}, remembered: {}, retryQueue: [], runs: [] }
        : { cursors: {}, retryQueue: [], runs: [] };
    }
    const state = {
      cursors: showFile(root, statePath(skillName, 'cursors.json'), {}),
      retryQueue: showFile(root, statePath(skillName, 'retry-queue.json'), []),
      runs: showFile(root, statePath(skillName, 'runs.json'), []),
    };
    if (includeRemembered) state.remembered = showFile(root, statePath(skillName, 'remembered.json'), {});
    return state;
  }

  function createBlob(root, content) {
    return run('gh', ['api', 'repos/{owner}/{repo}/git/blobs', '--input', '-', '-q', '.sha'], {
      cwd: root,
      input: JSON.stringify({ content, encoding: 'utf-8' }),
    }).trim();
  }

  function createTree(root, baseTreeSha, entries) {
    return run('gh', ['api', 'repos/{owner}/{repo}/git/trees', '--input', '-', '-q', '.sha'], {
      cwd: root,
      input: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
    }).trim();
  }

  function createCommit(root, treeSha, parentSha, message) {
    return run('gh', ['api', 'repos/{owner}/{repo}/git/commits', '--input', '-', '-q', '.sha'], {
      cwd: root,
      input: JSON.stringify({ message, tree: treeSha, parents: parentSha ? [parentSha] : [] }),
    }).trim();
  }

  // Non-force PATCH — GitHub enforces fast-forward-only, which IS the
  // compare-and-swap: rejected (throws) if the branch moved since parentSha
  // was read.
  function updateRef(root, commitSha) {
    run('gh', ['api', '-X', 'PATCH', `repos/{owner}/{repo}/git/refs/heads/${HEALTH_STATE_BRANCH}`, '--input', '-'], {
      cwd: root,
      input: JSON.stringify({ sha: commitSha, force: false }),
    });
  }

  function createRef(root, commitSha) {
    try {
      run('gh', ['api', 'repos/{owner}/{repo}/git/refs', '--input', '-'], {
        cwd: root,
        input: JSON.stringify({ ref: `refs/heads/${HEALTH_STATE_BRANCH}`, sha: commitSha }),
      });
    } catch (err) {
      if (!/422/.test(String(err.message))) throw err; // 422 = a concurrent firing already created it
    }
  }

  function ensureBranch(root) {
    try {
      run('git', ['-C', root, 'fetch', 'origin', HEALTH_STATE_BRANCH]);
      if (currentCommitSha(root)) return; // already exists
    } catch {
      // fetch failing at all (not just "ref not found") also means: try to bootstrap
    }
    const commitSha = createCommit(root, EMPTY_TREE_SHA, null, 'health-state: bootstrap');
    createRef(root, commitSha);
  }

  function buildFiles(next) {
    const files = [
      { path: statePath(skillName, 'cursors.json'), content: JSON.stringify(next.cursors, null, 2) },
      { path: statePath(skillName, 'retry-queue.json'), content: JSON.stringify(next.retryQueue, null, 2) },
      { path: statePath(skillName, 'runs.json'), content: JSON.stringify(pruneRuns(next.runs), null, 2) },
    ];
    // Gated on the skill-level includeRemembered flag, NOT on truthiness of
    // next.remembered — an empty {} is truthy, so inferring from data shape
    // would write a spurious remembered.json for every skill (harness-health,
    // journey-health included) the first time any mutator merely spreads
    // ...current without deleting the key. includeRemembered is decided once,
    // at createDurableState call time, precisely to rule that out.
    if (includeRemembered) {
      files.push({ path: statePath(skillName, 'remembered.json'), content: JSON.stringify(next.remembered || {}, null, 2) });
    }
    return files;
  }

  function writeState(root, mutatorFn) {
    ensureBranch(root);
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt++) {
      try {
        run('git', ['-C', root, 'fetch', 'origin', HEALTH_STATE_BRANCH]);
        const parentSha = currentCommitSha(root);
        const baseTreeSha = currentTreeSha(root);
        const current = readState(root);
        const next = mutatorFn(current);
        const files = buildFiles(next);
        const entries = files.map((f) => ({
          path: f.path,
          mode: '100644',
          type: 'blob',
          sha: createBlob(root, f.content),
        }));
        const treeSha = createTree(root, baseTreeSha, entries);
        const commitSha = createCommit(root, treeSha, parentSha, `health-state: ${skillName} update`);
        updateRef(root, commitSha);
        return { ok: true };
      } catch (err) {
        lastError = err;
      }
    }
    return { ok: false, error: lastError && lastError.message };
  }

  return { readState, writeState };
}
```

Update the `module.exports` at the end of the file to add `createDurableState`:

```js
module.exports = {
  HEALTH_STATE_BRANCH,
  MAX_RUN_HISTORY,
  ESCALATE_AFTER_ATTEMPTS,
  statePath,
  pruneRuns,
  enqueueRetry,
  dequeueRetry,
  shouldEscalate,
  createDurableState,
};
```

- [ ] **Step 8: Run the full test file to verify everything passes**

Run: `node --test bin/lib/health-core/tests/durable-state.test.js`
Expected: all tests PASS (the pure-helper tests from Step 1 plus the `createDurableState` tests from Step 5).

- [ ] **Step 9: Run the whole suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass, including the new `durable-state.test.js` file.

- [ ] **Step 10: Write the failing tests for the shared retry-queue CLI helper**

`bin/code-health.js`, `bin/harness-health.js`, and `bin/journey-health.js` each need identical `retry-queue drain`/`retry-queue update` command logic — drain reads the queue and prints its payloads; update folds this firing's filing results back into the queue (enqueue/dequeue/escalate) and persists in one `writeState` call. Rather than each of the three CLIs (Tasks 4, 6, 8) restating this, it lives once here, in the same shared module as the state it operates on.

Create `bin/lib/health-core/tests/retry-cli.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeRetryQueueCommands } = require('../retry-cli');

function fakeDurableState(initial) {
  let state = { retryQueue: [], ...initial };
  return {
    readDurableState: () => state,
    writeDurableState: (root, mutatorFn) => {
      state = mutatorFn(state);
      return { ok: true };
    },
  };
}

function captureStdout(fn) {
  const original = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return out;
}

test('drain prints the payload of every queued entry', () => {
  const ds = fakeDurableState({
    retryQueue: [
      { fingerprint: 'a', payload: { title: 'A' }, firstFailedAt: 'x', attempts: 1, lastError: null },
      { fingerprint: 'b', payload: { title: 'B' }, firstFailedAt: 'x', attempts: 1, lastError: null },
    ],
  });
  const { drain } = makeRetryQueueCommands(ds);
  const out = captureStdout(() => drain({ root: '/repo' }));
  assert.deepStrictEqual(JSON.parse(out), [{ title: 'A' }, { title: 'B' }]);
});

test('drain prints [] when the queue is empty', () => {
  const ds = fakeDurableState({ retryQueue: [] });
  const { drain } = makeRetryQueueCommands(ds);
  const out = captureStdout(() => drain({ root: '/repo' }));
  assert.deepStrictEqual(JSON.parse(out), []);
});

test('update dequeues successes and enqueues failures, printing entries that just crossed the escalation threshold', () => {
  const ds = fakeDurableState({
    retryQueue: [
      { fingerprint: 'stuck', payload: { title: 'Stuck' }, firstFailedAt: 'x', attempts: 2, lastError: 'timeout' },
    ],
  });
  const { update } = makeRetryQueueCommands(ds);
  const resultsPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'retry-cli-')), 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify([
    { fingerprint: 'stuck', payload: { title: 'Stuck' }, ok: false, error: 'still failing' },
    { fingerprint: 'fresh', payload: { title: 'Fresh' }, ok: true },
  ]));
  const out = captureStdout(() => update({ root: '/repo', _: ['update', resultsPath] }));
  const escalated = JSON.parse(out);
  assert.strictEqual(escalated.length, 1);
  assert.strictEqual(escalated[0].fingerprint, 'stuck');
  assert.strictEqual(escalated[0].attempts, 3);
});

test('update prints [] when nothing crosses the escalation threshold', () => {
  const ds = fakeDurableState({ retryQueue: [] });
  const { update } = makeRetryQueueCommands(ds);
  const resultsPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'retry-cli-')), 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify([{ fingerprint: 'new', payload: { title: 'New' }, ok: false, error: 'timeout' }]));
  const out = captureStdout(() => update({ root: '/repo', _: ['update', resultsPath] }));
  assert.deepStrictEqual(JSON.parse(out), []);
});
```

- [ ] **Step 11: Run the tests to verify they fail**

Run: `node --test bin/lib/health-core/tests/retry-cli.test.js`
Expected: FAIL — `Cannot find module '../retry-cli'`.

- [ ] **Step 12: Implement `bin/lib/health-core/retry-cli.js`**

```js
'use strict';
const fs = require('fs');
const { enqueueRetry, dequeueRetry, shouldEscalate } = require('./durable-state');

// Shared retry-queue CLI command bodies for code-health, harness-health, and
// journey-health — each CLI calls makeRetryQueueCommands bound to its own
// readDurableState/writeDurableState (from its own cache.js) and wires the
// two returned functions to its `retry-queue drain`/`retry-queue update`
// subcommands. One implementation instead of three near-identical copies.
function makeRetryQueueCommands({ readDurableState, writeDurableState }) {
  function drain(args) {
    const root = args.root || process.cwd();
    const { retryQueue } = readDurableState(root);
    process.stdout.write(JSON.stringify(retryQueue.map((e) => e.payload), null, 2) + '\n');
  }

  // results: [{ fingerprint, payload, ok: true }] or
  // [{ fingerprint, payload, ok: false, error }] — one entry per payload this
  // firing just attempted to file (retry-queue drain results and/or brand-new
  // findings that failed this firing's own filing step). Prints the entries
  // that just crossed the 3-strikes escalation threshold, for the calling
  // skill to file a {skill}:filing-failed issue for each.
  function update(args) {
    const root = args.root || process.cwd();
    const resultsPath = args._[1];
    if (!resultsPath) {
      process.stderr.write('usage: <cli>.js retry-queue update <results.json> [--root <dir>]\n');
      process.exit(2);
    }
    let results;
    try {
      results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    } catch (err) {
      process.stderr.write(`retry-queue update: could not read or parse ${resultsPath}: ${err.message}\n`);
      process.exit(1);
    }
    const escalated = [];
    const result = writeDurableState(root, (current) => {
      let queue = current.retryQueue;
      for (const r of results) {
        if (r.ok) {
          queue = dequeueRetry(queue, r.fingerprint);
        } else {
          queue = enqueueRetry(queue, { fingerprint: r.fingerprint, payload: r.payload, lastError: r.error });
          const entry = queue.find((e) => e.fingerprint === r.fingerprint);
          if (shouldEscalate(entry)) escalated.push(entry);
        }
      }
      return { ...current, retryQueue: queue };
    });
    if (!result.ok) {
      process.stderr.write(`retry-queue update: health-state persistence failed after retries: ${result.error}\n`);
    }
    process.stdout.write(JSON.stringify(escalated, null, 2) + '\n');
  }

  return { drain, update };
}

module.exports = { makeRetryQueueCommands };
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `node --test bin/lib/health-core/tests/retry-cli.test.js`
Expected: PASS (all 4 tests from Step 10).

- [ ] **Step 14: Run the whole suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass, including the new `retry-cli.test.js` file.

- [ ] **Step 15: Commit**

```bash
git add bin/lib/health-core/durable-state.js bin/lib/health-core/tests/durable-state.test.js bin/lib/health-core/retry-cli.js bin/lib/health-core/tests/retry-cli.test.js
git commit -m "Add bin/lib/health-core/durable-state.js and retry-cli.js: durable health-state branch storage

Pure helpers (pruneRuns, enqueueRetry, dequeueRetry, shouldEscalate) plus
createDurableState, an impure module (execFileSync git/gh calls behind an
injectable runner, matching scope.js's existing precedent) that reads and
writes cursors/retry-queue/run-history (and, for skills that opt in via
includeRemembered, the sub-threshold remembered cache) against a dedicated
health-state branch instead of local disk. GitHub's fast-forward-only ref
update provides compare-and-swap for free.

retry-cli.js's makeRetryQueueCommands gives code-health, harness-health, and
journey-health one shared retry-queue drain/update implementation instead of
each CLI restating the same logic.

Claude-Session: https://claude.ai/code/session_01CErp2mNj92Dnyp3f8MgKJb"
```

---

## Task 3: `skills/_shared/health-state.md` — the shared contract fragment

**Files:**
- Create: `skills/_shared/health-state.md`
- Modify: `CLAUDE.md` (add one line to the `skills/_shared/*.md` cross-reference list in the Structure section, alongside the existing `issue-claims` entry)

**Interfaces:**
- Consumes: `bin/lib/health-core/durable-state.js`'s exports (Task 2) — this fragment documents them for a human reader, it does not itself execute code.
- Produces: nothing new in code — a documentation contract referenced by `skills/code-health/SKILL.md`, `skills/harness-health/SKILL.md`, `skills/journey-health/SKILL.md` (Tasks 5, 7, 9).

- [ ] **Step 1: Write the fragment**

Create `skills/_shared/health-state.md`:

```markdown
# Health-State — Durable Cross-Firing Storage Contract

`code-health`, `harness-health`, and `journey-health` each need rotation cursors, a
filing retry queue, and (code-health only) a sub-threshold "remembered" cache to survive
between scheduled Routine firings. A scheduled cloud-routine (CCR) firing starts from a
fresh, stateless container every time, so local gitignored disk (`.claude-tweaks/{skill}/*.json`)
does not survive between firings — only `cache.json` (the open/closed/wontfix/regressed dedup
cache, rebuilt fresh from `gh issue list` every run) stays there, since GitHub issue state is
already its own source of truth.

Everything else durable lives on a dedicated branch, **`health-state`**, created once and never
merged into `main` or any other branch — a scratch area for machine bookkeeping only:

```
code-health/cursors.json
code-health/remembered.json      # sub-threshold findings — code-health only
code-health/retry-queue.json
code-health/runs.json            # capped to the last 90 records

harness-health/cursors.json
harness-health/retry-queue.json
harness-health/runs.json

journey-health/cursors.json
journey-health/retry-queue.json
journey-health/runs.json
```

## Mechanism

`bin/lib/health-core/durable-state.js`'s `createDurableState(skillName, { includeRemembered } = {})`
returns `{ readState(root), writeState(root, mutatorFn) }`:

- **`readState`** — `git fetch origin health-state`, then `git show origin/health-state:<path>`
  per file. Degrades to `{}`/`[]` defaults if the branch or a file doesn't exist yet — never
  throws.
- **`writeState`** — builds a new commit (blob → tree → commit via the Git Data API,
  `gh api repos/{owner}/{repo}/git/blobs|trees|commits`) on top of the branch's current tip,
  then updates the ref with `force: false`. GitHub's fast-forward-only ref update is the
  compare-and-swap: if another firing moved the branch first, the update is rejected and
  `writeState` retries the whole read-modify-write cycle (bounded at 3 attempts). On
  exhaustion, it returns `{ ok: false, error }` rather than throwing — a lost bookkeeping write
  just means the next firing might redo some rotation/retry work, which is safe (GitHub-issue
  fingerprint dedup means a redundant re-file attempt resolves to `skip`, never a duplicate
  issue).
- `includeRemembered` (default `false`) gates whether `remembered.json` is ever read or written
  at all for this skill — a property decided once, at `createDurableState` call time, not
  inferred per-write from whether the in-memory state object happens to carry a `remembered`
  key. Only `code-health` passes `{ includeRemembered: true }`; `harness-health` and
  `journey-health` never opt in, so they can never accidentally pick up a stray
  `remembered.json`.
- Each skill's own `bin/lib/{skill}/cache.js` calls these instead of the old local
  `readCursors`/`writeCursors` — same call shape, new storage underneath.
- **`bin/lib/health-core/retry-cli.js`**'s `makeRetryQueueCommands({ readDurableState, writeDurableState })`
  gives the retry-queue drain/update commands (below) one shared implementation, bound to each
  skill's own `readDurableState`/`writeDurableState` — `code-health`, `harness-health`, and
  `journey-health`'s CLIs each call this instead of restating the same logic three times.

This is impure (real `git`/`gh` calls via an injectable runner), unlike `bin/lib/issues/claims.js`'s
deliberately emit-only design — issue claim/release is a decision-laden, audit-visible action
meant to be legible in the skill's own bash trail; reading/writing this branch is mechanical
plumbing nobody inspects mid-flight, closer to `bin/lib/code-health/scope.js`'s existing
impure-but-isolated git calls.

## Retry / dead-letter queue

Each skill's `retry-queue.json` is an array of
`{ fingerprint, payload, firstFailedAt, attempts, lastError }` — one entry per finding that was
fingerprinted but whose `gh issue create` call failed. Filing itself stays skill-executed
(`gh issue create`, run by the skill's own bash steps, same as always) — only the durable
bookkeeping of *which* findings still need retrying lives in `durable-state.js`.

**Drain-before-rotate.** Every firing's filing step first attempts to re-file everything
already in the skill's retry queue, *before* normal slice/target rotation begins:

1. Read the current queue (`readState(root).retryQueue`).
2. Attempt `gh issue create` for each queued payload, same as any freshly-discovered finding.
3. On success, remove the entry (`dequeueRetry`).
4. On a fresh failure (queue drain, or a brand-new finding that fails to file), add/update the
   entry (`enqueueRetry`) — increments `attempts` for a repeat fingerprint, starts a new one at
   `attempts: 1`.
5. Persist the updated queue in the same `writeState` call that also persists this firing's
   cursor/run-history update — one commit per firing, not one write per queue mutation.
6. For any entry where `shouldEscalate(entry)` is now true (3rd consecutive failure), file (or
   update) a dedicated issue labeled `{skill}:filing-failed` naming the stuck fingerprint and
   its failure history, bootstrapped via `_shared/label-bootstrap.md`'s standard snippet. This
   surfaces the problem through the normal GitHub issue list a human already watches, rather
   than growing the queue silently forever.

## What this contract does not cover

`cache.json`'s open/closed/wontfix/regressed dedup entries — those stay local, gitignored,
rebuilt fresh from `gh issue list` every run, unaffected by this contract.
```

- [ ] **Step 2: Add the cross-reference to `CLAUDE.md`**

Find the sentence in `CLAUDE.md`'s Structure section that lists `skills/_shared/*.md` fragments (the line ending `...issue-claims contract (refs/claims/* atomic lock)...` followed by `label-bootstrap ...)`). Add a new fragment reference immediately after the `issue-claims contract` mention, before the closing paren of that list:

Change (excerpt):

```
issue-claims contract (refs/claims/* atomic lock), github-pr-scan (GitHub PR/issue state for /tidy Step 4.8 + /help Stage 4.5), label-bootstrap (canonical check-then-create snippet for GitHub label bootstrapping, referenced by triage/code-health/harness-health/tidy/wrap-up/flow))
```

to:

```
issue-claims contract (refs/claims/* atomic lock), health-state (durable cross-firing storage for code-health/harness-health/journey-health via a dedicated health-state branch — cursors, retry queue, and code-health's sub-threshold remembered cache), github-pr-scan (GitHub PR/issue state for /tidy Step 4.8 + /help Stage 4.5), label-bootstrap (canonical check-then-create snippet for GitHub label bootstrapping, referenced by triage/code-health/harness-health/tidy/wrap-up/flow))
```

- [ ] **Step 3: Verify the file renders sensibly and there is no stray markdown error**

```bash
node -e "require('fs').readFileSync('skills/_shared/health-state.md', 'utf8')" && echo OK
```

Expected: `OK` (file is readable UTF-8 text; this is a mechanical sanity check, not a markdown linter — there is none in this repo).

- [ ] **Step 4: Run the full test suite (docs changes shouldn't affect it, but confirm)**

Run: `npm test`
Expected: all tests pass (unchanged from before this task — no code touched).

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/health-state.md CLAUDE.md
git commit -m "Add skills/_shared/health-state.md contract fragment

Documents the health-state branch layout, the durable-state.js read/write
mechanism, and the retry/dead-letter queue's drain-before-rotate + 3-strikes
escalation behavior, referenced by code-health/harness-health/journey-health
SKILL.md instead of restating the protocol three times.

Claude-Session: https://claude.ai/code/session_01CErp2mNj92Dnyp3f8MgKJb"
```

---

## Task 4: code-health — durable cursors, remembered cache, and retry queue

**Files:**
- Modify: `bin/lib/code-health/cache.js`
- Modify: `bin/code-health.js`
- Modify: `bin/lib/code-health/tests/cache.test.js` (or create if it doesn't isolate `recordRun` today — check first)
- Test: `bin/lib/code-health/tests/durable-integration.test.js` (new)

**Interfaces:**
- Consumes: `bin/lib/health-core/durable-state.js`'s `createDurableState` (Task 2, called with `{ includeRemembered: true }` — code-health is the only skill with a sub-threshold remembered tier) and `bin/lib/health-core/retry-cli.js`'s `makeRetryQueueCommands` (Task 2)
- Produces: `bin/lib/code-health/cache.js` exports `readDurableState(root)` and `writeDurableState(root, mutatorFn)` (thin bindings over `createDurableState('code-health', { includeRemembered: true })`), used by `bin/code-health.js`. `bin/code-health.js` gains two new subcommands, `retry-queue drain` and `retry-queue update`, wired directly to `makeRetryQueueCommands({ readDurableState, writeDurableState })`'s returned `drain`/`update` functions — no code-health-specific reimplementation.

- [ ] **Step 1: Check whether `recordRun`'s cursor-writing logic already has isolated tests**

```bash
grep -n "recordRun" bin/lib/code-health/tests/cache.test.js
```

If this prints nothing, `recordRun` is only exercised indirectly today (via `bin/code-health.js`'s own CLI tests) — the new tests in Step 3 below will cover it directly for the first time. If it prints matches, read those tests before proceeding so Step 4's rewrite doesn't silently drop coverage they already provide.

- [ ] **Step 2: Write the failing test for the new durable bindings**

Add to `bin/lib/code-health/tests/cache.test.js` (create the file with this content if Step 1 found it doesn't exist yet; otherwise append):

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { readDurableState, writeDurableState } = require('../cache');

test('readDurableState/writeDurableState are bound to the code-health skill name', () => {
  const calls = [];
  const fakeRun = (cmd, args) => {
    calls.push(args.join(' '));
    if (args.includes('fetch')) return '';
    throw new Error('fatal: path does not exist'); // every file read defaults to empty
  };
  // cache.js's exports are already bound instances — this test only proves the
  // shape is right and that calling readDurableState doesn't throw with a
  // fresh/empty branch. Full read/write behavior is covered by
  // bin/lib/health-core/tests/durable-state.test.js already.
  assert.strictEqual(typeof readDurableState, 'function');
  assert.strictEqual(typeof writeDurableState, 'function');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test bin/lib/code-health/tests/cache.test.js`
Expected: FAIL — `readDurableState is not a function` (not yet exported from `../cache`).

- [ ] **Step 4: Rewrite `bin/lib/code-health/cache.js`**

Read the current file first (it's the one shown in this plan's context — `recordRun`, `computeChurn`, and the `module.exports` block). Replace its contents with:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { createCache } = require('../health-core/cache');
const { createDurableState } = require('../health-core/durable-state');

// Local, gitignored: cache.json only (open/closed/wontfix/regressed dedup —
// rebuildable from `gh issue list`, so it's fine to stay local/ephemeral).
// Canonical path: <root>/.claude-tweaks/code-health/cache.json (contract §cache.js)
// Shape: { "<fingerprint>": { status: 'open'|'wontfix'|'closed'|'regressed', issue: <number|null> } }
//
// Cursors, the sub-threshold "remembered" cache, the retry queue, and run
// history are durable instead — they live on the health-state branch (see
// _shared/health-state.md), not local disk, since local disk doesn't survive
// a scheduled cloud-routine firing's container recycling between runs.

const core = createCache('code-health');
const durable = createDurableState('code-health', { includeRemembered: true });

// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
// PORT.md delta #5: union denominator, NOT max(prior, current).
// A complete turnover gives ratio 1.0; no changes gives ratio 0.0.
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);

  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const stayed = currentFps.filter((fp) => prior.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const raw = (appeared.length + disappeared.length) / total;
  const ratio = Math.round(raw * 1000) / 1000;

  return { appeared, disappeared, stayed, ratio };
}

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  computeChurn,
  readDurableState: durable.readState,
  writeDurableState: durable.writeState,
};
```

Note what's **removed** relative to today's file: `recordRun`, `runsDir`, `readRuns`, `cursorsPath`, `readCursors`, `writeCursors` — all local-disk cursor/run persistence. `bin/code-health.js` (Step 6 below) takes over that orchestration directly against `readDurableState`/`writeDurableState`, since it now needs to bundle cursor + retry-queue + run-history + remembered updates into a single `writeState` call per firing instead of writing each independently.

- [ ] **Step 5: Run the cache.js tests to verify they pass**

Run: `node --test bin/lib/code-health/tests/cache.test.js`
Expected: PASS.

- [ ] **Step 6: Update `bin/code-health.js`'s imports and `cmdNextSlice`**

Read the current file's top-of-file requires (line 6: `const { readCache, writeCache, readRuns, computeChurn, recordRun, readCursors } = require('./lib/code-health/cache');`) and `cmdNextSlice` (which does `let cursors = readCursors(root);`).

Change line 6 to:

```js
const { readCache, writeCache, computeChurn, readDurableState, writeDurableState } = require('./lib/code-health/cache');
```

In `cmdNextSlice`, change:

```js
function cmdNextSlice(args) {
  const root = args.root || process.cwd();
  const budget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1;
  const { readCursors } = require('./lib/code-health/cache');
  let cursors = readCursors(root);
  const now = Date.now();
```

to:

```js
function cmdNextSlice(args) {
  const root = args.root || process.cwd();
  const budget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1;
  let cursors = readDurableState(root).cursors;
  const now = Date.now();
```

(The rest of `cmdNextSlice`'s body — slice selection loop, `selectSlice` calls — is unchanged; it already only reads `cursors`, never writes it.)

- [ ] **Step 7: Update `cmdValidateFindings`'s persistence step**

Find the block (documented in this plan's context) that currently reads:

```js
  // 4. Persist cache (unless dry-run).
  if (!args.dryRun) {
    writeCache(root, cache);
    // Persist the run-log (for churn) and the swept slice's cursor (for rotation/change-skip).
    // Best-effort: cursors and run-logs are a rebuildable optimization (GitHub issue state is
    // the source of truth), so a persistence failure must never block emitting the payloads.
    try {
      const sliceId = args.slice;
      const areasSwept = sliceId ? [sliceId] : [];
      const hashes = sliceId ? { [sliceId]: contentHash(path.resolve(root, sliceId)) } : {};
      recordRun(root, args.runId, { fingerprints: [...seen], areasSwept, hashes });
    } catch (err) {
      process.stderr.write(
        `[code-health] validate-findings: run/cursor persistence failed (non-fatal, payloads still emitted): ${err.message}\n`,
      );
    }
  }
```

Replace it with:

```js
  // 4. Persist local cache (open/closed/wontfix/regressed — unaffected by the
  // health-state migration) and, unless dry-run, the durable cursor/run/
  // remembered update in a single batched health-state write.
  writeCache(root, cache);
  if (!args.dryRun) {
    try {
      const sliceId = args.slice;
      const areasSwept = sliceId ? [sliceId] : [];
      const hashes = sliceId ? { [sliceId]: contentHash(path.resolve(root, sliceId)) } : {};
      const runRecord = { runId: args.runId, runAt: new Date().toISOString(), fingerprints: [...seen] };
      const result = writeDurableState(root, (current) => {
        const cursors = { ...current.cursors };
        const now = Date.now();
        for (const areaId of areasSwept) {
          const existing = cursors[areaId] || {};
          cursors[areaId] = {
            ...existing,
            lastSweptMs: now,
            ...(hashes[areaId] != null ? { lastHash: hashes[areaId] } : {}),
          };
        }
        return {
          ...current,
          cursors,
          remembered: { ...current.remembered, ...rememberedDelta },
          runs: [...current.runs, runRecord],
        };
      });
      if (!result.ok) {
        process.stderr.write(
          `[code-health] validate-findings: health-state persistence failed after retries (non-fatal, payloads still emitted): ${result.error}\n`,
        );
      }
    } catch (err) {
      process.stderr.write(
        `[code-health] validate-findings: health-state persistence threw (non-fatal, payloads still emitted): ${err.message}\n`,
      );
    }
  }
```

This references a new `rememberedDelta` object that must be populated by the dedup loop above it. Find the existing dedup loop's `remember` branch:

```js
    } else if (decision.action === 'remember') {
      if (!cache[finding.id]) cache[finding.id] = { status: 'remembered', issue: null, severity: finding.severity, risk: finding.risk };
    }
```

Replace it with (note: `remember` entries no longer go into the local `cache` object at all — they move to the durable `remembered` store):

```js
    } else if (decision.action === 'remember') {
      if (!durableState.remembered[finding.id] && !rememberedDelta[finding.id]) {
        rememberedDelta[finding.id] = { status: 'remembered', issue: null, severity: finding.severity, risk: finding.risk };
      }
    }
```

And immediately before the dedup loop begins (where `const cache = readCache(root);` and `const issueIndex = loadIssueIndex(args.issues);` are declared), add:

```js
  const cache = readCache(root);
  const issueIndex = loadIssueIndex(args.issues);
  const durableState = readDurableState(root);
  const rememberedDelta = {};
```

(replacing the existing two-line declaration with this four-line one).

Also update `decide()`'s call site — it currently passes the local `cache` for the wontfix-fallback check, which is unaffected since `remembered` entries never lived in the wontfix-check path; no change needed there.

- [ ] **Step 8: Wire the `retry-queue drain` and `retry-queue update` subcommands to the shared helper**

Add this near the other `require`s at the top of `bin/code-health.js`:

```js
const { makeRetryQueueCommands } = require('./lib/health-core/retry-cli');

const retryQueueCommands = makeRetryQueueCommands({ readDurableState, writeDurableState });
```

Wire both into the command dispatch at the bottom of the file. Find:

```js
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'pull-issues') return cmdPullIssues(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'classify') return cmdClassify(args);
  if (cmd === 'next-slice') return cmdNextSlice(args);
```

Add two lines and update the usage string:

```js
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'pull-issues') return cmdPullIssues(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'classify') return cmdClassify(args);
  if (cmd === 'next-slice') return cmdNextSlice(args);
  if (cmd === 'retry-queue' && args._[0] === 'drain') return retryQueueCommands.drain(args);
  if (cmd === 'retry-queue' && args._[0] === 'update') return retryQueueCommands.update(args);
```

and:

```js
  process.stderr.write(
    'usage: code-health.js <command> [options]\n' +
    'commands: validate-findings [--slice <id>], classify, next-slice, status, churn-report, pull-issues, ' +
    'retry-queue drain, retry-queue update <results.json>\n',
  );
```

`parseArgs` already collects positional args after the subcommand name into `args._`, so `args._[0]` here is `"drain"`/`"update"` (the word right after `retry-queue` on the command line) — the same pattern `validate-findings <findings.json>` already uses via `args._[1]`. `makeRetryQueueCommands`'s `drain`/`update` (Task 2) are already fully tested against a fake `readDurableState`/`writeDurableState` pair in `bin/lib/health-core/tests/retry-cli.test.js` — this step is pure wiring, no new logic to test here beyond confirming the CLI dispatches correctly (covered by Step 10's integration test below).

- [ ] **Step 9: Update `cmdStatus` to report the durable remembered count**

Find:

```js
function cmdStatus(args) {
  const cache = readCache(args.root);
  const findings = Object.values(cache);
  const counts = {
    open: findings.filter((f) => f.status === 'open').length,
    regressed: findings.filter((f) => f.status === 'regressed').length,
    closed: findings.filter((f) => f.status === 'closed').length,
    wontfix: findings.filter((f) => f.status === 'wontfix').length,
    remembered: findings.filter((f) => f.status === 'remembered').length,
    riskHigh: findings.filter((f) => f.status === 'open' && f.risk === 'high').length,
  };
```

Replace with:

```js
function cmdStatus(args) {
  const cache = readCache(args.root);
  const findings = Object.values(cache);
  const remembered = Object.keys(readDurableState(args.root).remembered).length;
  const counts = {
    open: findings.filter((f) => f.status === 'open').length,
    regressed: findings.filter((f) => f.status === 'regressed').length,
    closed: findings.filter((f) => f.status === 'closed').length,
    wontfix: findings.filter((f) => f.status === 'wontfix').length,
    remembered,
    riskHigh: findings.filter((f) => f.status === 'open' && f.risk === 'high').length,
  };
```

(local `cache.json` entries no longer have a `'remembered'` status at all after Step 7's change — this count now comes entirely from the durable store.)

- [ ] **Step 10: Write an integration test with a fake runner covering the new orchestration**

Create `bin/lib/code-health/tests/durable-integration.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI = path.join(__dirname, '..', '..', '..', 'code-health.js');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-health-durable-'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'const x = 1;\n');
  return dir;
}

test('retry-queue drain prints [] against a repo with no health-state branch (real git, no gh network call needed since it degrades before ever calling gh)', () => {
  const root = tmpRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/nonexistent.git'], { cwd: root });
  const out = execFileSync('node', [CLI, 'retry-queue', 'drain', '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out), []);
});
```

This exercises the real CLI end-to-end for the one scenario that's safe to run without real GitHub credentials: a `git fetch` against a nonexistent remote fails immediately (no network round trip succeeds far enough to need `gh` auth), so `readState` degrades to its empty defaults exactly as `durable-state.test.js`'s unit tests already proved with a fake runner — this test instead proves the real `git` CLI's failure mode actually triggers that same fallback path in production wiring, which the unit tests (fake runner) can't verify on their own.

- [ ] **Step 11: Run the new test to verify it fails, then passes**

Run: `node --test bin/lib/code-health/tests/durable-integration.test.js`
Expected first: this test can only be written after Steps 4-9 are in place (it exercises the real CLI), so if you're following TDD strictly, confirm it FAILS before Step 4-9 are applied (`retry-queue` subcommand doesn't exist yet), then run again after Steps 4-9:
Expected: PASS.

- [ ] **Step 12: Run the full suite**

Run: `npm test`
Expected: all tests pass, including `bin/lib/code-health/tests/cache.test.js`, `durable-integration.test.js`, and every pre-existing code-health test (confirm none of them relied on the removed `recordRun`/`readCursors`/`writeCursors`/`runsDir`/`readRuns` exports from `cache.js` — if any do, update them to use `readDurableState`/`writeDurableState` the same way `bin/code-health.js` now does).

- [ ] **Step 13: Commit**

```bash
git add bin/lib/code-health/cache.js bin/code-health.js bin/lib/code-health/tests/
git commit -m "code-health: durable cursors, remembered cache, and retry queue

Cursor/run persistence and the sub-threshold remembered cache move from
local gitignored disk to the health-state branch (bin/lib/health-core/durable-state.js),
surviving CCR container recycling. New retry-queue drain/update subcommands
give a filing failure a durable second chance instead of silently vanishing.
cache.json's open/closed/wontfix/regressed dedup entries are unaffected.

Claude-Session: https://claude.ai/code/session_01CErp2mNj92Dnyp3f8MgKJb"
```

---

## Task 5: code-health SKILL.md wiring

**Files:**
- Modify: `skills/code-health/SKILL.md`

**Interfaces:**
- Consumes: `bin/code-health.js`'s `retry-queue drain`/`retry-queue update` subcommands (Task 4), `skills/_shared/health-state.md` (Task 3)
- Produces: nothing new (documentation only)

- [ ] **Step 1: Add drain-before-rotate to Step 9 (FILE / REOPEN ISSUES)**

In `skills/code-health/SKILL.md`, immediately before the existing `**Step 9 — FILE / REOPEN ISSUES.**` heading's first bootstrap-labels bash block, insert:

```markdown
Before filing this firing's own new findings, drain the durable retry queue from prior firings' filing failures (see `_shared/health-state.md`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" retry-queue drain --root . > /tmp/code-health-retry-payloads.json
```

For each payload in `/tmp/code-health-retry-payloads.json`, attempt `gh issue create` exactly as below. Track the outcome of every attempt (this firing's retry-queue payloads AND any brand-new payload from Step 9's own filing loop that fails) as `[{ fingerprint, payload, ok: true }]` or `[{ fingerprint, payload, ok: false, error: "<gh's error output>" }]`, write to `/tmp/code-health-retry-results.json`, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" retry-queue update /tmp/code-health-retry-results.json --root . > /tmp/code-health-escalated.json
```

This records successes (removed from the queue) and failures (added/incremented) in one durable write. If `/tmp/code-health-escalated.json` is non-empty, file (or update) a `code-health:filing-failed` issue for each entry, naming the stuck fingerprint and its failure history — bootstrap that label the same way as the others below.
```

- [ ] **Step 2: Reference `_shared/health-state.md` instead of describing local cursor mechanics inline**

Find Step 9.5 (documented in this plan's context, "**Step 9.5 — Confirm cursor + run-log persistence.**" through its final paragraph about `--dry-run` mode). Replace the entire Step 9.5 section with:

```markdown
**Step 9.5 — Confirm health-state persistence.**

Cursor, run-log, and remembered-cache persistence now happens against the durable `health-state`
branch, not local disk — see `_shared/health-state.md` for the mechanism. `validate-findings`
handles this internally (via `bin/lib/health-core/durable-state.js`) whenever it's run without
`--dry-run` and `--slice` is set; a persistence failure after retries is reported to stderr but
never blocks payload emission (a lost bookkeeping write just means the next firing might redo
some rotation work, which is safe).

In `--dry-run` mode, neither the local cache nor the durable health-state write happens — the
run is truly a no-op for all persistence.
```

- [ ] **Step 3: Correct the "a skipped run is harmless" claim in Routine Configuration**

Find, in the `## Routine Configuration` section:

```
A skipped run (e.g., `next-slice` returns `null` because all slices are fresh) is harmless — rotation resumes from the same position on the next window.
```

Replace with:

```
A skipped run (e.g., `next-slice` returns `null` because all slices are fresh) is harmless — rotation resumes from the same position on the next window. This is now actually true across a scheduled cloud-routine's container recycling too: rotation cursors, the sub-threshold remembered cache, and the filing retry queue all live on the durable `health-state` branch (`_shared/health-state.md`), not local disk that a fresh container wouldn't have.
```

- [ ] **Step 4: Grep to confirm no other stale cursor-locality claims remain in this file**

```bash
grep -n "\.claude-tweaks/code-health/cursors\.json\|\.claude-tweaks/code-health/runs" skills/code-health/SKILL.md
```

Expected: no matches (or, if any remain — e.g. a passing mention elsewhere — read that line and update it to point at `_shared/health-state.md` instead of the local path, following the same pattern as Steps 1-3 above).

- [ ] **Step 5: Run the full test suite (docs-only change, confirm no regression)**

Run: `npm test`
Expected: all tests pass, unchanged.

- [ ] **Step 6: Commit**

```bash
git add skills/code-health/SKILL.md
git commit -m "code-health: wire retry-queue drain-before-rotate, reference health-state contract

Step 9 now drains the durable retry queue before filing new findings, and
Step 9.5 points at _shared/health-state.md instead of describing local
cursor mechanics that no longer apply. Corrects Routine Configuration's
'a skipped run is harmless' claim, which is now actually true under CCR.

Claude-Session: https://claude.ai/code/session_01CErp2mNj92Dnyp3f8MgKJb"
```

---

## Task 6: harness-health — durable cursors and retry queue

**Files:**
- Modify: `bin/lib/harness-health/cache.js`
- Modify: `bin/harness-health.js`
- Test: `bin/lib/harness-health/tests/durable-integration.test.js` (new)

**Interfaces:**
- Consumes: `bin/lib/health-core/durable-state.js`'s `createDurableState` and `bin/lib/health-core/retry-cli.js`'s `makeRetryQueueCommands` (Task 2)
- Produces: `bin/lib/harness-health/cache.js` exports `readDurableState(root)`/`writeDurableState(root, mutatorFn)` (bound via `createDurableState('harness-health')` — no `includeRemembered`, since harness-health has no `remembered` tier, confirmed in the spec by grepping for `min-risk`/`remember` in its `SKILL.md`, no matches). `bin/harness-health.js` gains `retry-queue drain`/`retry-queue update` subcommands wired directly to `makeRetryQueueCommands({ readDurableState, writeDurableState })`, same shared implementation code-health uses (Task 4) — no harness-health-specific reimplementation.

- [ ] **Step 1: Write the failing test**

Create (or append to, if it exists) `bin/lib/harness-health/tests/cache.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { readDurableState, writeDurableState } = require('../cache');

test('readDurableState/writeDurableState are exported and bound to harness-health', () => {
  assert.strictEqual(typeof readDurableState, 'function');
  assert.strictEqual(typeof writeDurableState, 'function');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test bin/lib/harness-health/tests/cache.test.js`
Expected: FAIL — `readDurableState is not a function`.

- [ ] **Step 3: Rewrite `bin/lib/harness-health/cache.js`**

Replace the current file's contents with:

```js
'use strict';
const { createCache } = require('../health-core/cache');
const { createDurableState } = require('../health-core/durable-state');

// Local, gitignored: cache.json only (rebuildable-from-issues dedup state).
// Canonical path: <root>/.claude-tweaks/harness-health/cache.json
//
// Cursors (per-target audit + gap-scan), the retry queue, and run history
// are durable instead — they live on the health-state branch (see
// _shared/health-state.md), not local disk, since local disk doesn't
// survive a scheduled cloud-routine firing's container recycling.

const core = createCache('harness-health');
const durable = createDurableState('harness-health');

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  readDurableState: durable.readState,
  writeDurableState: durable.writeState,
};
```

Note what's removed: `cursorsPath`, `readCursors`, `writeCursors`, `recordAudit`, `readGapScanCursor`, `recordGapScan`, `runsDir`, `recordRun`, `readRuns`, `computeChurn` — all local-disk cursor/run persistence and its bound helpers. `bin/harness-health.js` (Step 4) takes over `recordAudit`/`recordGapScan`/run-recording as pure logic operating on the in-memory state object `readDurableState` returns, batched into one `writeDurableState` call per firing.

- [ ] **Step 4: Update `bin/harness-health.js`**

Read the current file's imports (line 6-7) and `cmdNextTarget` (uses `readGapScanCursor`, `readCursors`), and `cmdValidateFindings`'s persistence block (documented in this plan's context: lines ~194-198, calling `recordAudit`, `recordGapScan`, `recordRun`).

Change the import block (lines 6-7):

```js
  readCache, writeCache, readCursors, recordAudit,
  readGapScanCursor, recordGapScan, recordRun, readRuns, computeChurn,
```

to:

```js
  readCache, writeCache, readDurableState, writeDurableState,
```

In `cmdNextTarget`, change every `readGapScanCursor(root)` call to `(readDurableState(root).cursors.__gapScan || { lastScannedSha: null, lastScannedMs: null })`, and every `readCursors(root)` call to `readDurableState(root).cursors`. (Read the current function body first — there are two `readCursors`-shaped reads noted in this plan's context: one via `readGapScanCursor` at line 63/71 for a `memCursors` variable, one directly at line 110 — apply the same substitution to both, since both are read-only lookups against the same durable cursors object.)

Find the existing persistence block (documented in this plan's context):

```js
      if (args.target && args.kind) recordAudit(root, `${args.kind}:${args.target}`, {});
      if (args.gapScan) recordGapScan(root, {});
      recordRun(root, args.runId, [...seen]);
```

Replace with:

```js
      const runRecord = { runId: args.runId, runAt: new Date().toISOString(), fingerprints: [...seen] };
      const result = writeDurableState(root, (current) => {
        const cursors = { ...current.cursors };
        const now = Date.now();
        if (args.target && args.kind) {
          cursors[`${args.kind}:${args.target}`] = { lastAuditedSha: null, lastAuditedMs: now };
        }
        if (args.gapScan) {
          cursors.__gapScan = { lastScannedSha: null, lastScannedMs: now };
        }
        return { ...current, cursors, runs: [...current.runs, runRecord] };
      });
      if (!result.ok) {
        process.stderr.write(`[harness-health] validate-findings: health-state persistence failed after retries: ${result.error}\n`);
      }
```

(Note: today's `recordAudit(root, key, { sha, whenMs })` accepted an optional `sha` that every call site in `cmdValidateFindings` already passes as the default `{}` — i.e. `sha: null` in practice at every current call site. This rewrite preserves that observed behavior exactly; it does not add sha-tracking that wasn't already being exercised.)

- [ ] **Step 5: Wire the `retry-queue drain`/`retry-queue update` subcommands to the shared helper**

Add this near the other `require`s at the top of `bin/harness-health.js`:

```js
const { makeRetryQueueCommands } = require('./lib/health-core/retry-cli');

const retryQueueCommands = makeRetryQueueCommands({ readDurableState, writeDurableState });
```

Wire both into the dispatch, following whatever the file's existing `if (cmd === ...)` chain looks like (read it first) — add:

```js
  if (cmd === 'retry-queue' && args._[0] === 'drain') return retryQueueCommands.drain(args);
  if (cmd === 'retry-queue' && args._[0] === 'update') return retryQueueCommands.update(args);
```

immediately before the final `process.stderr.write('usage: ...')` fallback, and add `retry-queue drain`/`retry-queue update <results.json>` to that usage string's command list. `makeRetryQueueCommands`'s `drain`/`update` are already fully tested in `bin/lib/health-core/tests/retry-cli.test.js` (Task 2) — this step is pure wiring.

- [ ] **Step 6: Run the cache.js test to verify it passes**

Run: `node --test bin/lib/harness-health/tests/cache.test.js`
Expected: PASS.

- [ ] **Step 7: Write the integration test**

Create `bin/lib/harness-health/tests/durable-integration.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI = path.join(__dirname, '..', '..', '..', 'harness-health.js');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-durable-'));
  return dir;
}

test('retry-queue drain prints [] against a repo with no health-state branch', () => {
  const root = tmpRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/nonexistent.git'], { cwd: root });
  const out = execFileSync('node', [CLI, 'retry-queue', 'drain', '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out), []);
});
```

- [ ] **Step 8: Run it to verify it passes**

Run: `node --test bin/lib/harness-health/tests/durable-integration.test.js`
Expected: PASS.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: all tests pass, including every pre-existing harness-health test (confirm none of them relied on the removed `recordAudit`/`readGapScanCursor`/`recordGapScan`/`recordRun`/`readRuns`/`computeChurn` exports from `cache.js` — if any do, update them to use `readDurableState`/`writeDurableState` the same way `bin/harness-health.js` now does).

- [ ] **Step 10: Commit**

```bash
git add bin/lib/harness-health/cache.js bin/harness-health.js bin/lib/harness-health/tests/
git commit -m "harness-health: durable cursors and retry queue

Same health-state-branch migration as code-health (Task 4) — cursor and
run persistence move off local disk, plus new retry-queue drain/update
subcommands. harness-health has no sub-threshold remembered tier (every
finding files unconditionally), so remembered.json is code-health-only.

Claude-Session: https://claude.ai/code/session_01CErp2mNj92Dnyp3f8MgKJb"
```

---

## Task 7: harness-health SKILL.md wiring

**Files:**
- Modify: `skills/harness-health/SKILL.md`

**Interfaces:**
- Consumes: `bin/harness-health.js`'s `retry-queue drain`/`retry-queue update` (Task 6), `skills/_shared/health-state.md` (Task 3)

- [ ] **Step 1: Add drain-before-rotate to Step 7 (FILE)**

In `skills/harness-health/SKILL.md`, immediately before the existing `**Step 7 — FILE.**` heading's label-bootstrap bash block, insert:

```markdown
Before filing this firing's own new findings, drain the durable retry queue from prior firings' filing failures (see `_shared/health-state.md`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" retry-queue drain --root . > /tmp/harness-health-retry-payloads.json
```

For each payload in `/tmp/harness-health-retry-payloads.json`, attempt `gh issue create` exactly as below. Track every attempt's outcome (retry-queue payloads AND any brand-new payload from this step's own filing loop that fails) as `[{ fingerprint, payload, ok: true }]` or `[{ fingerprint, payload, ok: false, error: "<gh's error output>" }]`, write to `/tmp/harness-health-retry-results.json`, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" retry-queue update /tmp/harness-health-retry-results.json --root . > /tmp/harness-health-escalated.json
```

If `/tmp/harness-health-escalated.json` is non-empty, file (or update) a `harness-health:filing-failed` issue for each entry, naming the stuck fingerprint and its failure history — bootstrap that label the same way as the others below.
```

- [ ] **Step 2: Update Routine Configuration's healthiness claim**

Find, in the `## Routine Configuration` section:

```
Report-only, matching `/code-health` — every finding files as a `harness-health`-labelled GitHub issue, with no `Edit` call anywhere in its documented workflow.
```

Replace with:

```
Report-only, matching `/code-health` — every finding files as a `harness-health`-labelled GitHub issue, with no `Edit` call anywhere in its documented workflow. Rotation cursors and the filing retry queue live on the durable `health-state` branch (`_shared/health-state.md`), surviving container recycling across scheduled firings — a skipped or failed firing does not lose progress.
```

- [ ] **Step 3: Grep to confirm no stale local-cursor claims remain**

```bash
grep -n "\.claude-tweaks/harness-health/cursors\.json\|\.claude-tweaks/harness-health/runs" skills/harness-health/SKILL.md
```

Expected: no matches.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass, unchanged.

- [ ] **Step 5: Commit**

```bash
git add skills/harness-health/SKILL.md
git commit -m "harness-health: wire retry-queue drain-before-rotate, reference health-state contract

Claude-Session: https://claude.ai/code/session_01CErp2mNj92Dnyp3f8MgKJb"
```

---

## Task 8: journey-health — durable cursors and retry queue

**Files:**
- Modify: `bin/lib/journey-health/cache.js`
- Modify: `bin/journey-health.js`
- Test: `bin/lib/journey-health/tests/durable-integration.test.js` (new)

**Interfaces:**
- Consumes: `bin/lib/health-core/durable-state.js`'s `createDurableState` and `bin/lib/health-core/retry-cli.js`'s `makeRetryQueueCommands` (Task 2)
- Produces: `bin/lib/journey-health/cache.js` exports `readDurableState(root)`/`writeDurableState(root, mutatorFn)` (bound via `createDurableState('journey-health')` — no `includeRemembered`, journey-health has no remembered tier either). `bin/journey-health.js` gains `retry-queue drain`/`retry-queue update` subcommands wired directly to `makeRetryQueueCommands({ readDurableState, writeDurableState })`, same shared implementation as Tasks 4/6 — no journey-health-specific reimplementation.

- [ ] **Step 1: Write the failing test**

Create (or append to) `bin/lib/journey-health/tests/cache.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { readDurableState, writeDurableState } = require('../cache');

test('readDurableState/writeDurableState are exported and bound to journey-health', () => {
  assert.strictEqual(typeof readDurableState, 'function');
  assert.strictEqual(typeof writeDurableState, 'function');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test bin/lib/journey-health/tests/cache.test.js`
Expected: FAIL — `readDurableState is not a function`.

- [ ] **Step 3: Rewrite `bin/lib/journey-health/cache.js`**

Replace the current file's contents with:

```js
'use strict';
const { createCache } = require('../health-core/cache');
const { createDurableState } = require('../health-core/durable-state');

// Local, gitignored: cache.json only (rebuildable-from-issues dedup state).
// Canonical path: <root>/.claude-tweaks/journey-health/cache.json
//
// Cursors (per-journey light/deep audit + coverage-scan), the retry queue,
// and run history are durable instead — they live on the health-state
// branch (see _shared/health-state.md), not local disk, since local disk
// doesn't survive a scheduled cloud-routine firing's container recycling.

const core = createCache('journey-health');
const durable = createDurableState('journey-health');

module.exports = {
  cachePath: core.cachePath,
  readCache: core.readCache,
  writeCache: core.writeCache,
  readDurableState: durable.readState,
  writeDurableState: durable.writeState,
};
```

Note what's removed: `cursorsPath`, `readCursors`, `writeCursors`, `recordAudit`, `readCoverageScanCursor`, `recordCoverageScan`, `runsDir`, `recordRun`, `readRuns`, `computeChurn`.

- [ ] **Step 4: Update `bin/journey-health.js`**

Change the import block (lines 6-7):

```js
  readCache, writeCache, readCursors, recordAudit,
  readCoverageScanCursor, recordCoverageScan, recordRun, readRuns, computeChurn,
```

to:

```js
  readCache, writeCache, readDurableState, writeDurableState,
```

In `cmdNextTarget`, change every `readCoverageScanCursor(root)` call to `(readDurableState(root).cursors.__coverageScan || { lastScannedMs: null })`, and every `readCursors(root)` call to `readDurableState(root).cursors` (lines 64/75 per this plan's earlier grep — read the function body first to confirm both call sites before editing).

Find the existing persistence block (documented in this plan's context):

```js
      if (args.target) recordAudit(root, args.target, args.tier === 'deep' ? 'deep' : 'light', {});
      if (args.coverageScan) recordCoverageScan(root, {});
      recordRun(root, args.runId, [...seen]);
```

Replace with:

```js
      const runRecord = { runId: args.runId, runAt: new Date().toISOString(), fingerprints: [...seen] };
      const result = writeDurableState(root, (current) => {
        const cursors = { ...current.cursors };
        const now = Date.now();
        if (args.target) {
          const existing = cursors[args.target] || {};
          const patch = args.tier === 'deep'
            ? { lastDeepAuditMs: now, lastDeepHash: null }
            : { lastLightAuditMs: now, lastLightHash: null };
          cursors[args.target] = { ...existing, ...patch };
        }
        if (args.coverageScan) {
          cursors.__coverageScan = { lastScannedMs: now };
        }
        return { ...current, cursors, runs: [...current.runs, runRecord] };
      });
      if (!result.ok) {
        process.stderr.write(`[journey-health] validate-findings: health-state persistence failed after retries: ${result.error}\n`);
      }
```

(Preserving today's observed behavior: every current call site passes `hash: null` implicitly via the default `{}` third argument to `recordAudit`, same reasoning as harness-health's Task 6 Step 4 note.)

- [ ] **Step 5: Wire the `retry-queue drain`/`retry-queue update` subcommands to the shared helper**

Add this near the other `require`s at the top of `bin/journey-health.js`:

```js
const { makeRetryQueueCommands } = require('./lib/health-core/retry-cli');

const retryQueueCommands = makeRetryQueueCommands({ readDurableState, writeDurableState });
```

Wire both into the dispatch chain the same way as Tasks 4/6:

```js
  if (cmd === 'retry-queue' && args._[0] === 'drain') return retryQueueCommands.drain(args);
  if (cmd === 'retry-queue' && args._[0] === 'update') return retryQueueCommands.update(args);
```

and add both to the usage string's command list. `makeRetryQueueCommands`'s `drain`/`update` are already fully tested in `bin/lib/health-core/tests/retry-cli.test.js` (Task 2) — this step is pure wiring.

- [ ] **Step 6: Run the cache.js test to verify it passes**

Run: `node --test bin/lib/journey-health/tests/cache.test.js`
Expected: PASS.

- [ ] **Step 7: Write the integration test**

Create `bin/lib/journey-health/tests/durable-integration.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI = path.join(__dirname, '..', '..', '..', 'journey-health.js');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-durable-'));
}

test('retry-queue drain prints [] against a repo with no health-state branch', () => {
  const root = tmpRepo();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://example.invalid/nonexistent.git'], { cwd: root });
  const out = execFileSync('node', [CLI, 'retry-queue', 'drain', '--root', root], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out), []);
});
```

- [ ] **Step 8: Run it to verify it passes**

Run: `node --test bin/lib/journey-health/tests/durable-integration.test.js`
Expected: PASS.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: all tests pass, including every pre-existing journey-health test (confirm none relied on the removed exports — update any that do, same as Tasks 4/6).

- [ ] **Step 10: Commit**

```bash
git add bin/lib/journey-health/cache.js bin/journey-health.js bin/lib/journey-health/tests/
git commit -m "journey-health: durable cursors and retry queue

Same health-state-branch migration as code-health/harness-health (Tasks
4, 6) — light/deep audit cursors, coverage-scan cursor, and run persistence
move off local disk, plus new retry-queue drain/update subcommands.

Claude-Session: https://claude.ai/code/session_01CErp2mNj92Dnyp3f8MgKJb"
```

---

## Task 9: journey-health SKILL.md wiring

**Files:**
- Modify: `skills/journey-health/SKILL.md`

**Interfaces:**
- Consumes: `bin/journey-health.js`'s `retry-queue drain`/`retry-queue update` (Task 8), `skills/_shared/health-state.md` (Task 3)

- [ ] **Step 1: Add drain-before-rotate to Step 6 (FILE)**

In `skills/journey-health/SKILL.md`, immediately before the existing `**Step 6 — FILE.**` heading's label-existence bash block, insert:

```markdown
Before filing this firing's own new findings, drain the durable retry queue from prior firings' filing failures (see `_shared/health-state.md`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" retry-queue drain --root . > /tmp/journey-health-retry-payloads.json
```

For each payload in `/tmp/journey-health-retry-payloads.json`, attempt `gh issue create` exactly as below. Track every attempt's outcome (retry-queue payloads AND any brand-new payload from this step's own filing loop that fails) as `[{ fingerprint, payload, ok: true }]` or `[{ fingerprint, payload, ok: false, error: "<gh's error output>" }]`, write to `/tmp/journey-health-retry-results.json`, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" retry-queue update /tmp/journey-health-retry-results.json --root . > /tmp/journey-health-escalated.json
```

If `/tmp/journey-health-escalated.json` is non-empty, file (or update) a `journey-health:filing-failed` issue for each entry, naming the stuck fingerprint and its failure history — bootstrap that label the same way as the category/severity labels above.
```

- [ ] **Step 2: Update Routine Configuration's healthiness claim**

Find, in the `## Routine Configuration` section (read the file first to locate the exact sentence describing "a skipped run" or similar — it follows the same template as code-health's and harness-health's equivalent sentence). Append to that sentence:

```
Rotation cursors (light/deep audit + coverage-scan) and the filing retry queue live on the durable `health-state` branch (`_shared/health-state.md`), surviving container recycling across scheduled firings.
```

- [ ] **Step 3: Grep to confirm no stale local-cursor claims remain**

```bash
grep -n "\.claude-tweaks/journey-health/cursors\.json\|\.claude-tweaks/journey-health/runs" skills/journey-health/SKILL.md
```

Expected: no matches.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass, unchanged.

- [ ] **Step 5: Commit**

```bash
git add skills/journey-health/SKILL.md
git commit -m "journey-health: wire retry-queue drain-before-rotate, reference health-state contract

Closes out the health-state durable-storage migration (GitHub issues #7, #8)
across all three health skills.

Claude-Session: https://claude.ai/code/session_01CErp2mNj92Dnyp3f8MgKJb"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** Task 1 covers the naming rename; Task 2 covers the `durable-state.js` module plus the shared `retry-cli.js` helper; Task 3 covers the shared contract fragment; Tasks 4-5, 6-7, 8-9 cover code-health/harness-health/journey-health integration + SKILL.md wiring respectively. The spec's "Files touched" list is fully covered.
- **A real risk to watch during execution, not fully eliminable by this plan alone:** Tasks 4, 6, 8 each note "confirm none of them relied on the removed exports" for pre-existing tests — this plan could not enumerate every pre-existing test file's exact assertions against `cache.js`'s old exports without reading each one in full at planning time. Whoever executes the "run the full suite" steps in Tasks 4/6/8 must actually read any resulting failure rather than assume the described rewrite is sufficient, and update the failing test to call `readDurableState`/`writeDurableState` instead of the removed local-disk functions.
- **Type/signature consistency:** `readDurableState(root)` and `writeDurableState(root, mutatorFn)` are named identically across all three skills' `cache.js` files (Tasks 4, 6, 8), and `retry-queue drain`/`retry-queue update <results.json>` are named identically across all three CLIs — each backed by the exact same `bin/lib/health-core/retry-cli.js` implementation (Task 2), not three independent copies.
- **No placeholders:** every step above shows complete, exact code — no "similar to Task N" shorthand.
- **Pre-flight revisions (resolved before Task 1 was dispatched):** an earlier draft of this plan had two defects a pre-flight scan caught and the human partner asked to fix rather than defer to task review: (1) Task 2's `createDurableState` tests originally used a `returns: (() => {...})()` pattern that invoked the closure eagerly, once, while the test's fakeRunner script array was being constructed — for the "retries on a rejected ref update" test this meant the throw fired during array construction, before `writeState` was ever called, rather than lazily on each matched call as the test's own narrative described. Fixed by making `fakeRunner` call `returns`/`throws` lazily, as functions of `(cmd, args)`, whenever a rule provides a function instead of a plain value. (2) The original `buildFiles` inferred whether to write `remembered.json` from truthiness of the in-memory state object's `remembered` field — since `readState` returned `remembered: {}` (a truthy empty object) unconditionally for every skill, harness-health and journey-health would each have gotten a spurious, permanently-empty `remembered.json` written to their branch directory, contradicting the design spec's explicit "remembered.json is code-health-only" file layout. Fixed by adding an explicit `includeRemembered` flag to `createDurableState`, decided once per skill at call time (`true` for code-health only), gating both `readState`'s and `buildFiles`'s handling of the key. (3) Tasks 6 and 8 originally repeated Task 4's `retry-queue` CLI code (`cmdRetryQueueDrain`/`cmdRetryQueueUpdate`) nearly verbatim — the human partner asked for a shared helper instead of accepting the duplication; Task 2 now also creates `bin/lib/health-core/retry-cli.js` (`makeRetryQueueCommands`), and Tasks 4/6/8 each just bind it to their own `readDurableState`/`writeDurableState` and wire two dispatch lines, with zero logic duplicated across the three CLIs.
