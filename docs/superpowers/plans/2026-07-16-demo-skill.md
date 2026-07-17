# demo — Acceptance Sign-Off Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a seventh work-record axis (Acceptance: `demo:pending` / `demo:approved` / `demo:changes-requested`), produced by `/claude-tweaks:wrap-up` and resolved by a new standalone `/claude-tweaks:demo` skill, giving a durable, cross-thread worklist for human sign-off that is distinct from tests passing and spec completion.

**Architecture:** Extend the two taxonomy code twins (`bin/lib/issues/record.js` for the `github-issues` driver, `bin/lib/issues/local-store.js` for the `local-files` driver) with the new axis. Extend `_shared/work-record.md`'s documentation (axis table, label taxonomy, permission matrix, consumers table) and sweep every other doc citing "the six axes." Add a `/wrap-up` step (Step 10) that applies `demo:pending` and posts a Verification Brief (issue comment, or a body section under `local-files`). Add a new `skills/demo/SKILL.md` that discovers `demo:pending` records (open or closed — covers already-merged autonomous work), walks the human through each brief, captures a verdict, and files a linked follow-up record on "changes requested." Wire a lightweight count into `/help`'s dashboard via a new `github-pr-scan.md` scope. Full design rationale: `docs/superpowers/specs/2026-07-16-demo-skill-design.md`.

**Tech Stack:** Node.js (`node --test`, zero runtime deps), `gh` CLI, markdown skill files.

## Global Constraints

- Label strings are exactly `demo:pending`, `demo:approved`, `demo:changes-requested` — no variants, anywhere.
- Every label description passed to `ensureLabelPayload` must be ≤100 characters (GitHub's hard cap).
- `npm test` must stay green after every task (run it as each task's final verification step).
- Follow `parseRecordFacets`/`local-store.js`'s existing style exactly: explicit defaults set first, only ever flipped by a matching label/frontmatter line, never inferred from truthiness.
- This is a markdown-heavy plugin — tasks touching only `.md` files are verified by grep/text-match against the literal after-state (spelled out in each such task), not by a test runner. Tasks touching `bin/lib/issues/*.js` follow full TDD (`node --test`).
- Task 9 (version bump) must `git fetch origin main` and check for a concurrent bump before editing `.claude-plugin/plugin.json`, per CLAUDE.md's Releasing section.

---

## Task 1: `bin/lib/issues/record.js` — Acceptance axis (github-issues driver)

**Files:**
- Modify: `bin/lib/issues/record.js`
- Test: `bin/lib/issues/tests/record.test.js`

**Interfaces:**
- Produces: `LABELS.DEMO_PENDING = 'demo:pending'`, `LABELS.DEMO_APPROVED = 'demo:approved'`, `LABELS.DEMO_CHANGES_REQUESTED = 'demo:changes-requested'`. `parseRecordFacets(labels)` now returns a facets object with an added `acceptance: 'pending' | 'approved' | 'changes-requested' | null` key (all existing keys unchanged).
- Consumed by: Task 5 (`/wrap-up`'s Verification Brief procedure), Task 6 (`/demo`), Task 7 (`/help`'s new dashboard scope) — all via `require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js')`.

- [ ] **Step 1: Write the failing tests**

Open `bin/lib/issues/tests/record.test.js`. First, update the two existing full-object `deepStrictEqual` assertions to include the new key (they will fail once Step 3 adds `acceptance` to the facets shape, because the actual object will carry a key the expected literal doesn't):

Replace:
```js
test('parseRecordFacets: by:capture + parked', () => {
  assert.deepStrictEqual(parseRecordFacets(['by:capture', 'parked']), {
    origin: 'capture', risk: null, effort: null, priority: null, stage: 'parked',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
  });
});
```
with:
```js
test('parseRecordFacets: by:capture + parked', () => {
  assert.deepStrictEqual(parseRecordFacets(['by:capture', 'parked']), {
    origin: 'capture', risk: null, effort: null, priority: null, stage: 'parked',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    acceptance: null,
  });
});
```

Replace:
```js
test('parseRecordFacets: empty label list', () => {
  assert.deepStrictEqual(parseRecordFacets([]), {
    origin: null, risk: null, effort: null, priority: null, stage: 'backlog',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
  });
});
```
with:
```js
test('parseRecordFacets: empty label list', () => {
  assert.deepStrictEqual(parseRecordFacets([]), {
    origin: null, risk: null, effort: null, priority: null, stage: 'backlog',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    acceptance: null,
  });
});
```

Then add new tests immediately after the `'parseRecordFacets: malformed parked+ready still resolves to ready regardless of array order'` test and before the `// AC 5 — dependencies` comment:

```js
// AC — acceptance axis (demo skill)

test('parseRecordFacets: demo:pending sets acceptance to pending', () => {
  assert.strictEqual(parseRecordFacets(['demo:pending']).acceptance, 'pending');
});

test('parseRecordFacets: demo:approved sets acceptance to approved', () => {
  assert.strictEqual(parseRecordFacets(['demo:approved']).acceptance, 'approved');
});

test('parseRecordFacets: demo:changes-requested sets acceptance to changes-requested', () => {
  assert.strictEqual(parseRecordFacets(['demo:changes-requested']).acceptance, 'changes-requested');
});

test('parseRecordFacets: acceptance defaults to null when no demo:* label is present', () => {
  assert.strictEqual(parseRecordFacets([]).acceptance, null);
  assert.strictEqual(parseRecordFacets(['ready', 'auto:build']).acceptance, null);
});

test('parseRecordFacets: LABELS exposes the three demo:* acceptance label strings', () => {
  const { LABELS } = require('../record');
  assert.strictEqual(LABELS.DEMO_PENDING, 'demo:pending');
  assert.strictEqual(LABELS.DEMO_APPROVED, 'demo:approved');
  assert.strictEqual(LABELS.DEMO_CHANGES_REQUESTED, 'demo:changes-requested');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: FAIL — the two updated `deepStrictEqual` tests fail (actual object missing `acceptance` key), the three `demo:*` tests fail (`acceptance` is `undefined`, not the expected string), and the `LABELS` test fails (`DEMO_PENDING` etc. are `undefined`).

- [ ] **Step 3: Implement the Acceptance axis**

In `bin/lib/issues/record.js`, replace:
```js
const LABELS = {
  READY: 'ready',
  PARKED: 'parked',
  AUTO_BUILD: 'auto:build',
  AUTO_MERGE: 'auto:merge',
  BOT_IN_PROGRESS: 'bot:in-progress',
  BOT_BLOCKED: 'bot:blocked',
  WONTFIX: 'wontfix',
};
```
with:
```js
const LABELS = {
  READY: 'ready',
  PARKED: 'parked',
  AUTO_BUILD: 'auto:build',
  AUTO_MERGE: 'auto:merge',
  BOT_IN_PROGRESS: 'bot:in-progress',
  BOT_BLOCKED: 'bot:blocked',
  WONTFIX: 'wontfix',
  DEMO_PENDING: 'demo:pending',
  DEMO_APPROVED: 'demo:approved',
  DEMO_CHANGES_REQUESTED: 'demo:changes-requested',
};
```

Replace:
```js
// labels (string[] | {name}[]) -> the full record-facet shape. Explicit false/null
// defaults are set first and only ever flipped/assigned as matching labels are found
// in a single pass over the normalized names — never inferred from truthiness. Stage
// precedence is ready > parked > backlog regardless of array order or malformed
// combinations (e.g. both 'ready' and 'parked' present resolves to 'ready').
function parseRecordFacets(labels) {
  const names = normalizeLabelNames(labels);

  const facets = {
    origin: null,
    risk: null,
    effort: null,
    priority: null,
    stage: 'backlog',
    grants: { build: false, merge: false },
    bot: { inProgress: false, blocked: false },
  };
```
with:
```js
// labels (string[] | {name}[]) -> the full record-facet shape. Explicit false/null
// defaults are set first and only ever flipped/assigned as matching labels are found
// in a single pass over the normalized names — never inferred from truthiness. Stage
// precedence is ready > parked > backlog regardless of array order or malformed
// combinations (e.g. both 'ready' and 'parked' present resolves to 'ready').
// Acceptance has no such precedence — the three demo:* labels are mutually exclusive
// by construction, so a plain last-match-in-array-wins assignment (same style as
// origin/risk/effort/priority below) is enough.
function parseRecordFacets(labels) {
  const names = normalizeLabelNames(labels);

  const facets = {
    origin: null,
    risk: null,
    effort: null,
    priority: null,
    stage: 'backlog',
    grants: { build: false, merge: false },
    bot: { inProgress: false, blocked: false },
    acceptance: null,
  };
```

Replace:
```js
    if (name === LABELS.BOT_BLOCKED) {
      facets.bot.blocked = true;
      continue;
    }

    const by = BY_RE.exec(name);
```
with:
```js
    if (name === LABELS.BOT_BLOCKED) {
      facets.bot.blocked = true;
      continue;
    }
    if (name === LABELS.DEMO_PENDING) {
      facets.acceptance = 'pending';
      continue;
    }
    if (name === LABELS.DEMO_APPROVED) {
      facets.acceptance = 'approved';
      continue;
    }
    if (name === LABELS.DEMO_CHANGES_REQUESTED) {
      facets.acceptance = 'changes-requested';
      continue;
    }

    const by = BY_RE.exec(name);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: PASS — all tests green, including the 5 new/updated ones.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — no other test file references the old facets shape in a way this breaks (confirm by reading the output; `bin/lib/issues/tests/labels.test.js` and `blast-radius.test.js` don't call `parseRecordFacets` per Task research, but the full run is the actual proof).

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/record.js bin/lib/issues/tests/record.test.js
git commit -m "Add Acceptance axis (demo:pending/approved/changes-requested) to record.js"
```

---

## Task 2: `bin/lib/issues/local-store.js` — Acceptance facet (local-files driver)

**Files:**
- Modify: `bin/lib/issues/local-store.js`
- Test: `bin/lib/issues/tests/local-store.test.js`

**Interfaces:**
- Produces: `defaultFacets()`, `readRecord()`, and `queryRecords()` results now carry `facets.acceptance: string | null`; `writeRecord()` accepts and serializes it. Frontmatter key: `acceptance: {value}`.
- Consumed by: Task 5/6 when `work-backend: local-files` (driver-conditional path), Task 6's `/demo` discovery.

- [ ] **Step 1: Write the failing tests**

Open `bin/lib/issues/tests/local-store.test.js`. Update the three existing facets object literals that will otherwise mismatch once Step 3 adds the `acceptance` key to `defaultFacets()`:

Replace (round-trip test):
```js
  const facets = {
    type: 'feature', origin: 'capture', risk: 'medium', effort: 'low', priority: null,
    stage: 'parked', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    parent: 12, blockedBy: [12, 7], unsynced: true,
  };
```
with:
```js
  const facets = {
    type: 'feature', origin: 'capture', risk: 'medium', effort: 'low', priority: null,
    stage: 'parked', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    parent: 12, blockedBy: [12, 7], unsynced: true, acceptance: null,
  };
```

Replace (omits-defaults test):
```js
    facets: {
      type: 'task', origin: null, risk: null, effort: null, priority: null,
      stage: 'backlog', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
      parent: null, blockedBy: [], unsynced: false,
    },
```
with:
```js
    facets: {
      type: 'task', origin: null, risk: null, effort: null, priority: null,
      stage: 'backlog', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
      parent: null, blockedBy: [], unsynced: false, acceptance: null,
    },
```

Replace (`baseFacets` helper):
```js
function baseFacets(overrides) {
  return Object.assign({
    type: 'task', origin: null, risk: null, effort: null, priority: null,
    stage: 'backlog', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    parent: null, blockedBy: [], unsynced: false,
  }, overrides);
}
```
with:
```js
function baseFacets(overrides) {
  return Object.assign({
    type: 'task', origin: null, risk: null, effort: null, priority: null,
    stage: 'backlog', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    parent: null, blockedBy: [], unsynced: false, acceptance: null,
  }, overrides);
}
```

Add one assertion to the malformed-file test (append after the existing `unsynced` assertion):
```js
test('readRecord on a file with no frontmatter: type null, stage backlog, body is the whole content', (t) => {
  const dir = tmp(t);
  const filePath = path.join(dir, '5-broken.md');
  fs.writeFileSync(filePath, 'Just plain text, no frontmatter here.\n');

  const record = readRecord(filePath);
  assert.strictEqual(record.facets.type, null);
  assert.strictEqual(record.facets.stage, 'backlog');
  assert.strictEqual(record.body, 'Just plain text, no frontmatter here.');
  assert.strictEqual(record.title, null);
  assert.strictEqual(record.id, 5);
  assert.strictEqual(record.slug, 'broken');
  assert.deepStrictEqual(record.facets.grants, { build: false, merge: false });
  assert.deepStrictEqual(record.facets.bot, { inProgress: false, blocked: false });
  assert.deepStrictEqual(record.facets.blockedBy, []);
  assert.strictEqual(record.facets.unsynced, false);
  assert.strictEqual(record.facets.acceptance, null);
});
```
(this replaces the same test block, adding only the final `acceptance` assertion line)

Add three new tests after the `'queryRecords matches object-valued facets (grants) with deep equality, not partial match'` test and before the `'queryRecords returns an empty array for a missing dir'` test:

```js
test('writeRecord then readRecord round-trips the acceptance facet', (t) => {
  const dir = tmp(t);
  const filePath = path.join(dir, '9-demo.md');
  writeRecord(filePath, { title: 'Demo', body: 'b', facets: baseFacets({ acceptance: 'pending' }) });
  const record = readRecord(filePath);
  assert.strictEqual(record.facets.acceptance, 'pending');
});

test('writeRecord omits the acceptance line when null', (t) => {
  const dir = tmp(t);
  const filePath = path.join(dir, '10-none.md');
  writeRecord(filePath, { title: 'None', body: 'b', facets: baseFacets({ acceptance: null }) });
  const raw = fs.readFileSync(filePath, 'utf8');
  assert.ok(!/^acceptance:/m.test(raw), 'must not write acceptance when null');
});

test('queryRecords filters by acceptance facet', (t) => {
  const dir = tmp(t);
  writeRecord(path.join(dir, '1-a.md'), { title: 'A', body: 'a', facets: baseFacets({ acceptance: 'pending' }) });
  writeRecord(path.join(dir, '2-b.md'), { title: 'B', body: 'b', facets: baseFacets({ acceptance: 'approved' }) });
  const pending = queryRecords(dir, { acceptance: 'pending' });
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].slug, 'a');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/issues/tests/local-store.test.js`
Expected: FAIL — the round-trip/omit-defaults/malformed-file tests fail (actual facets object missing `acceptance`), the new round-trip/omit/query tests fail (`facets.acceptance` is `undefined`, not `'pending'`/`null`, and the query returns 0 records).

- [ ] **Step 3: Implement the acceptance frontmatter field**

In `bin/lib/issues/local-store.js`, replace:
```js
// bin/lib/issues/local-store.js
// The local-files work-record driver: read/write specs/{n}-{slug}.md records with
// frontmatter facets. Frontmatter is parsed with the same no-dependency line-regex
// style bin/lib/policy.js uses — the plugin ships zero runtime npm deps, so there
// is no YAML library here. `facets` is a superset of record.js's parseRecordFacets
// shape (same keys — origin, risk, effort, priority, stage, grants{build,merge},
// bot{inProgress,blocked} — plus type, parent, blockedBy, unsynced); the github
// driver's callers get type/parent/blockedBy from the issue JSON itself, not from
// labels. No network calls.
```
with:
```js
// bin/lib/issues/local-store.js
// The local-files work-record driver: read/write specs/{n}-{slug}.md records with
// frontmatter facets. Frontmatter is parsed with the same no-dependency line-regex
// style bin/lib/policy.js uses — the plugin ships zero runtime npm deps, so there
// is no YAML library here. `facets` is a superset of record.js's parseRecordFacets
// shape (same keys — origin, risk, effort, priority, stage, grants{build,merge},
// bot{inProgress,blocked}, acceptance — plus type, parent, blockedBy, unsynced); the
// github driver's callers get type/parent/blockedBy from the issue JSON itself, not
// from labels. No network calls.
```

Replace:
```js
// Explicit defaults first, only ever flipped/assigned by a matching frontmatter
// line elsewhere — never inferred from truthiness (parseRecordFacets style).
// `bot` is always this value: the local driver carries no bot state.
function defaultFacets() {
  return {
    type: null,
    origin: null,
    risk: null,
    effort: null,
    priority: null,
    stage: 'backlog',
    grants: { build: false, merge: false },
    bot: { inProgress: false, blocked: false },
    parent: null,
    blockedBy: [],
    unsynced: false,
  };
}
```
with:
```js
// Explicit defaults first, only ever flipped/assigned by a matching frontmatter
// line elsewhere — never inferred from truthiness (parseRecordFacets style).
// `bot` is always this value: the local driver carries no bot state.
function defaultFacets() {
  return {
    type: null,
    origin: null,
    risk: null,
    effort: null,
    priority: null,
    stage: 'backlog',
    grants: { build: false, merge: false },
    bot: { inProgress: false, blocked: false },
    parent: null,
    blockedBy: [],
    unsynced: false,
    acceptance: null,
  };
}
```

Replace:
```js
    if ((m = /^unsynced:\s*(true|false)$/.exec(line))) { facets.unsynced = m[1] === 'true'; continue; }
  }

  return facets;
}
```
with:
```js
    if ((m = /^unsynced:\s*(true|false)$/.exec(line))) { facets.unsynced = m[1] === 'true'; continue; }
    if ((m = /^acceptance:\s*(.+)$/.exec(line))) { facets.acceptance = m[1].trim(); continue; }
  }

  return facets;
}
```

Replace:
```js
  if (facets.unsynced) lines.push('unsynced: true');

  return lines;
}
```
with:
```js
  if (facets.unsynced) lines.push('unsynced: true');
  if (facets.acceptance) lines.push(`acceptance: ${facets.acceptance}`);

  return lines;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/issues/tests/local-store.test.js`
Expected: PASS — all tests green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/local-store.js bin/lib/issues/tests/local-store.test.js
git commit -m "Add acceptance frontmatter facet to local-store.js for isomorphism with record.js"
```

---

## Task 3: `_shared/work-record.md` taxonomy update + "six axes" sweep

**Files:**
- Modify: `skills/_shared/work-record.md`
- Modify: `CLAUDE.md` (one fragment)
- Modify: `skills/init/bootstrap-steps.md` (two fragments)
- Modify: `skills/specify/spec-template.md` (one fragment)

**Interfaces:**
- Consumes: `LABELS.DEMO_PENDING`/`DEMO_APPROVED`/`DEMO_CHANGES_REQUESTED` names from Task 1 (cited as prose, not imported — this is documentation).
- Produces: the seven-axis contract every later task (4-8) cites.

This task is prose-only — verified by grep/text-match, not `node --test`.

- [ ] **Step 1: Update the axis table heading and rows**

In `skills/_shared/work-record.md`, replace:
```
## The six axes

| Axis | Values | Expressed as |
|---|---|---|
| **Type** | `bug` \| `feature` \| `task` | Native GitHub Issue Type when `work-types: native`; `type:*` label when `work-types: labels` |
| **Origin** | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:capture` — or no label | Label. Absence = human-filed directly, or a side-effect record (see below) |
| **Scoring** | `risk:low\|medium\|high` × `effort:low\|medium\|high` | Labels — at most one of each family |
| **Stage** | backlog (no label) \| `parked` \| `ready` | Labels — backlog is the absence of stage labels |
| **Authorization** | `auto:build`, `auto:merge` | Labels — human-granted only, absence is the default not-authorized state |
| **Bot state** | `bot:in-progress`, `bot:blocked` | Labels — machinery-owned visibility layer |
```
with:
```
## The seven axes

| Axis | Values | Expressed as |
|---|---|---|
| **Type** | `bug` \| `feature` \| `task` | Native GitHub Issue Type when `work-types: native`; `type:*` label when `work-types: labels` |
| **Origin** | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:capture` — or no label | Label. Absence = human-filed directly, or a side-effect record (see below) |
| **Scoring** | `risk:low\|medium\|high` × `effort:low\|medium\|high` | Labels — at most one of each family |
| **Stage** | backlog (no label) \| `parked` \| `ready` | Labels — backlog is the absence of stage labels |
| **Authorization** | `auto:build`, `auto:merge` | Labels — human-granted only, absence is the default not-authorized state |
| **Bot state** | `bot:in-progress`, `bot:blocked` | Labels — machinery-owned visibility layer |
| **Acceptance** | `demo:pending` \| `demo:approved` \| `demo:changes-requested` — or no label | Labels — `demo:pending` set by `/claude-tweaks:wrap-up`, resolved to `demo:approved`/`demo:changes-requested` by `/claude-tweaks:demo`; independent of Stage and of the issue's own open/closed state |
```

- [ ] **Step 2: Add an "Acceptance semantics" section**

Immediately after the `## Grant semantics` section's final paragraph (the one ending "...there is no machinery path that originates a grant.") and before `## Labels are projection, not truth`, insert:

```markdown
## Acceptance semantics

The Acceptance axis records whether a human has actually verified a built record does what
was asked — distinct from tests passing (`/claude-tweaks:test`) and code-quality review passing
(`/claude-tweaks:review`), both of which gate *before* this axis is ever set.

- `/claude-tweaks:wrap-up` applies `demo:pending` once build+test+review are done, and posts a
  Verification Brief (an issue comment, or — under `work-links: body-text` on the `local-files`
  driver, which has no comment mechanism — a `## Verification Brief` body section) with what
  changed, why, and how to verify it. This happens **regardless of merge timing** — an
  `auto:merge`'d record still gets `demo:pending` on its now-closed issue, enabling retrospective
  sign-off.
- `/claude-tweaks:demo` is the sole consumer: it discovers every `demo:pending` record (open or
  closed), walks the human through each brief, and resolves the label to `demo:approved` or
  `demo:changes-requested`. On the latter, it files a linked follow-up backlog record.
- The three values are mutually exclusive by construction — `/claude-tweaks:demo` always removes
  `demo:pending` in the same operation it adds the resolution label.
- `auto:merge` governs merge timing only; it has no bearing on whether `demo:pending` eventually
  gets resolved.
```

- [ ] **Step 3: Update the label taxonomy intro count and table**

Replace:
```
## Label taxonomy

17 core labels + 3 optional `priority:*` labels. The canonical `LABELS_JSON` (names +
≤100-char descriptions) lives in `_shared/label-bootstrap.md`; consumers bootstrap only the
labels they are about to apply.

| Family | Labels | Axis |
|---|---|---|
| Origin (4) | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:capture` | Origin |
| Risk (3) | `risk:low`, `risk:medium`, `risk:high` | Scoring |
| Effort (3) | `effort:low`, `effort:medium`, `effort:high` | Scoring |
| Stage (2) | `parked`, `ready` | Stage |
| Grants (2) | `auto:build`, `auto:merge` | Authorization |
| Bot state (2) | `bot:in-progress`, `bot:blocked` | Bot state |
| Closure (1) | `wontfix` | re-filing suppression |
| Priority (3, optional) | `priority:high`, `priority:medium`, `priority:low` | dispatch ordering |
```
with:
```
## Label taxonomy

20 core labels + 3 optional `priority:*` labels. The canonical `LABELS_JSON` (names +
≤100-char descriptions) lives in `_shared/label-bootstrap.md`; consumers bootstrap only the
labels they are about to apply.

| Family | Labels | Axis |
|---|---|---|
| Origin (4) | `by:code-health`, `by:harness-health`, `by:journey-health`, `by:capture` | Origin |
| Risk (3) | `risk:low`, `risk:medium`, `risk:high` | Scoring |
| Effort (3) | `effort:low`, `effort:medium`, `effort:high` | Scoring |
| Stage (2) | `parked`, `ready` | Stage |
| Grants (2) | `auto:build`, `auto:merge` | Authorization |
| Bot state (2) | `bot:in-progress`, `bot:blocked` | Bot state |
| Acceptance (3) | `demo:pending`, `demo:approved`, `demo:changes-requested` | Acceptance |
| Closure (1) | `wontfix` | re-filing suppression |
| Priority (3, optional) | `priority:high`, `priority:medium`, `priority:low` | dispatch ordering |
```

- [ ] **Step 4: Split the permission matrix's Executors row and add `/wrap-up` and `/demo` rows**

Replace:
```
| **`/tidy`** (hygiene) | `parked` (Defer action, with trigger) | `parked` (trigger-met wake), `bot:in-progress` (orphaned-claim sweep) | `auto:*` |
| **Executors** (`/flow`, `/build`, `/wrap-up`) | nothing | `bot:in-progress` (claim release at wrap-up) | `auto:*`, `ready` |
```
with:
```
| **`/tidy`** (hygiene) | `parked` (Defer action, with trigger) | `parked` (trigger-met wake), `bot:in-progress` (orphaned-claim sweep) | `auto:*` |
| **Executors** (`/flow`, `/build`) | nothing | nothing | `auto:*`, `ready` |
| **`/wrap-up`** | `demo:pending` | `bot:in-progress` (claim release) | `auto:*`, `ready`, `demo:approved`, `demo:changes-requested` |
| **`/demo`** | `demo:approved`, `demo:changes-requested` | `demo:pending` (on resolution) | `auto:*`, `ready`, `bot:*`, adding `demo:pending` itself |
```

- [ ] **Step 5: Update the Consumers table**

Replace:
```
| `/wrap-up` | Closes the loop — carrier commit (close-via-merge), claim release, leftover records |
| `/tidy` | Hygiene — stale backlog records, parked-trigger wakes, unsynced local records, `bot:blocked` surfacing |
| `/help` | Dashboard — live counts by stage / grants / bot state |
```
with:
```
| `/wrap-up` | Closes the loop — carrier commit (close-via-merge), claim release, leftover records; applies `demo:pending` + posts the Verification Brief |
| `/demo` | Resolves the Acceptance axis — `demo:pending` → `demo:approved`/`demo:changes-requested`; files a linked follow-up backlog record on changes-requested |
| `/tidy` | Hygiene — stale backlog records, parked-trigger wakes, unsynced local records, `bot:blocked` surfacing |
| `/help` | Dashboard — live counts by stage / grants / bot state / acceptance |
```

- [ ] **Step 6: Sweep the three external "six axes" citations**

In `CLAUDE.md`, within the long `skills/_shared/*.md` structure line, replace:
```
work-record contract (canonical unified-work-record taxonomy — the six axes, label families, permission matrix, and config keys every filing/shaping/gating/dispatching/sweeping skill cites rather than restates)
```
with:
```
work-record contract (canonical unified-work-record taxonomy — the seven axes, label families, permission matrix, and config keys every filing/shaping/gating/dispatching/sweeping skill cites rather than restates)
```

In `skills/init/bootstrap-steps.md`, replace:
```
`_shared/work-record.md` is the canonical
home of the full record taxonomy (the six axes, the label families, and the
config-key table) — every consumer skill cites it rather than restating it, and this
step is where its config keys first get written.
```
with:
```
`_shared/work-record.md` is the canonical
home of the full record taxonomy (the seven axes, the label families, and the
config-key table) — every consumer skill cites it rather than restating it, and this
step is where its config keys first get written.
```

Also in `skills/init/bootstrap-steps.md`, replace:
```
On option 1, run the check-then-create loop from `_shared/label-bootstrap.md` with
its canonical `LABELS_JSON`. See `_shared/work-record.md` for the taxonomy each
label expresses (the six axes: type, origin, scoring, stage, authorization, bot
state).
```
with:
```
On option 1, run the check-then-create loop from `_shared/label-bootstrap.md` with
its canonical `LABELS_JSON`. See `_shared/work-record.md` for the taxonomy each
label expresses (the seven axes: type, origin, scoring, stage, authorization, bot
state, acceptance).
```

In `skills/specify/spec-template.md`, replace:
```
Type, stage/scoring labels, and parent/dependency links are **record facets** — tracked on the record itself, outside the body, never as body text. The canonical taxonomy (the six axes, the label names, who may set what) is `_shared/work-record.md`; this section only maps those facets to their representation on each driver.
```
with:
```
Type, stage/scoring labels, and parent/dependency links are **record facets** — tracked on the record itself, outside the body, never as body text. The canonical taxonomy (the seven axes, the label names, who may set what) is `_shared/work-record.md`; this section only maps those facets to their representation on each driver.
```

- [ ] **Step 7: Verify**

Run:
```bash
grep -rn "the six axes" --include="*.md" . | grep -v "^\./specs/\|^\./docs/superpowers/specs/\|^\./docs/superpowers/plans/"
```
Expected: no output (every active-doc occurrence updated; the two historical `specs/13-*.md`/`specs/23-*.md` files and this plan/design doc's own quoted before/after blocks are intentionally excluded and untouched).

Run:
```bash
grep -c "demo:pending\|demo:approved\|demo:changes-requested" skills/_shared/work-record.md
```
Expected: a positive count (confirms the new labels actually landed in the file).

- [ ] **Step 8: Commit**

```bash
git add skills/_shared/work-record.md CLAUDE.md skills/init/bootstrap-steps.md skills/specify/spec-template.md
git commit -m "Document the Acceptance axis in the work-record taxonomy; sweep six-axes citations to seven"
```

---

## Task 4: `_shared/label-bootstrap.md` — LABELS_JSON

**Files:**
- Modify: `skills/_shared/label-bootstrap.md`

Prose-only — verified by grep + a live `ensureLabelPayload` sanity check (Node one-liner, no test file needed since this JSON literal isn't imported by any module — it's copy-pasted by each consumer skill per the file's own documented convention).

- [ ] **Step 1: Add the three labels to the canonical LABELS_JSON**

Replace:
```
  ["wontfix",           "Closed as not-planned; health skills will not re-file findings with this fingerprint"],
  ["priority:high",     "Priority: dispatch picks this band first"],
  ["priority:medium",   "Priority: dispatch picks after priority:high"],
  ["priority:low",      "Priority: dispatch picks last among prioritized records"]
]
```
with:
```
  ["wontfix",           "Closed as not-planned; health skills will not re-file findings with this fingerprint"],
  ["demo:pending",           "Acceptance: built and verified — awaiting human sign-off via /claude-tweaks:demo"],
  ["demo:approved",          "Acceptance: a human verified this record does what was asked"],
  ["demo:changes-requested", "Acceptance: a human found a gap during sign-off — see the linked follow-up record"],
  ["priority:high",     "Priority: dispatch picks this band first"],
  ["priority:medium",   "Priority: dispatch picks after priority:high"],
  ["priority:low",      "Priority: dispatch picks last among prioritized records"]
]
```

Also update the intro line's count. Replace:
```
The complete label set from `_shared/work-record.md` (17 core + 3 optional `priority:*`),
```
with:
```
The complete label set from `_shared/work-record.md` (20 core + 3 optional `priority:*`),
```

- [ ] **Step 2: Verify the descriptions parse as valid JS and stay under the 100-char cap**

Run:
```bash
node -e "
  const fs = require('fs');
  const content = fs.readFileSync('skills/_shared/label-bootstrap.md', 'utf8');
  const match = content.match(/\`\`\`js\n(\[[\s\S]*?\])\n\`\`\`/);
  const labels = eval(match[1]);
  console.log('count:', labels.length);
  for (const [name, desc] of labels) {
    if (desc.length > 100) throw new Error('too long: ' + name + ' (' + desc.length + ' chars)');
  }
  console.log('all descriptions <= 100 chars');
"
```
Expected: `count: 20` and `all descriptions <= 100 chars`.

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/label-bootstrap.md
git commit -m "Add demo:pending/approved/changes-requested to the canonical LABELS_JSON"
```

---

## Task 5: `/claude-tweaks:wrap-up` — apply `demo:pending` + post the Verification Brief

**Files:**
- Create: `skills/wrap-up/verification-brief.md`
- Modify: `skills/wrap-up/SKILL.md`

**Interfaces:**
- Consumes: `LABELS.DEMO_PENDING` (Task 1), `_shared/label-bootstrap.md`'s `demo:*` entries (Task 4), `_shared/dev-url-detection.md` (existing).
- Produces: the `demo:pending` label + Verification Brief comment (or body section under `local-files`) that Task 6's `/demo` consumes.

Prose-only — verified by grep/text-match.

- [ ] **Step 1: Create `skills/wrap-up/verification-brief.md`**

```markdown
# Wrap-Up — Verification Brief Procedure

Canonical procedure for Step 10's acceptance-labeling action: applying `demo:pending` and
posting the Verification Brief. Record mode only (a materialized header exists for this run,
per Step 1) — conversation-based work and the legacy spec-file alias have no work record to
label, so this procedure does not run for them.

## Step 1: Bootstrap the Acceptance labels

Run the check-then-create loop from `_shared/label-bootstrap.md` with:

```js
LABELS_JSON = [
  ["demo:pending", "Acceptance: built and verified — awaiting human sign-off via /claude-tweaks:demo"]
]
```

Only `demo:pending` is bootstrapped here — `/wrap-up` never applies the other two acceptance
labels (see `_shared/work-record.md`'s permission matrix).

## Step 2: Determine testability

Read the changed-file list for this run (`git diff --name-only {base}...HEAD`, or the
materialized header's file list). If every changed path matches a non-UI pattern —
documentation (`docs/**`, `*.md` outside `stories/`/`docs/journeys/`), configuration, harness
skill files (`skills/**/*.md`, `.claude/**`), or backend-only code with no route/component/page
touched — this record has **no interactive verification surface**. Otherwise it is testable.

## Step 3: Source the "how to verify" content, in priority order

1. **QA stories** — Glob `stories/*.yaml` for entries whose `source_files` overlaps this run's
   changed files. If found, note the matching story names and their `journey:` field.
2. **Journey doc** — if no matching story, check `docs/journeys/*.md` for a journey whose
   `files:` front matter overlaps the changed files.
3. **Synthesized walkthrough** — if neither exists, run the dev URL detection procedure from
   `dev-url-detection.md` in `skills/_shared/` to resolve `APP_URL`, then write 2-4 concrete
   manual steps derived from the record's `## Acceptance Criteria` section (e.g. "Open
   {APP_URL}/settings, toggle X, confirm Y persists after reload").
4. **Non-testable fallback** (Step 2 found no interactive surface) — skip 1-3 entirely; the
   brief says so explicitly (see template below).

## Step 4: Compose and post the brief

Render this exact template:

```markdown
## Verification Brief

**What changed:** {one-paragraph summary from the record body + diff}

**Why:** {the record's `## Acceptance Criteria` section, verbatim or lightly condensed}

**How to verify:**
{one of:}
- Story: `{story name}` (`stories/{file}.yaml`{, journey: {journey}}) — run `/claude-tweaks:test qa story={name}`
- Journey: `docs/journeys/{file}.md` — walk it live or via `/claude-tweaks:visual-review journey:{name}`
- {numbered manual steps against {APP_URL}}
- _No interactive verification surface — this change has no user-observable behavior. Review the diff and the rationale above._

_Posted by `/claude-tweaks:wrap-up`. Resolve with `/claude-tweaks:demo`._
```

**`work-backend: github-issues`** — write the rendered template to
`/tmp/verification-brief-{issue}.md`, then:

```bash
gh issue comment {issue} --body-file /tmp/verification-brief-{issue}.md
gh issue edit {issue} --add-label demo:pending
```

Post the comment before adding the label — a reader reacting to the label's appearance should
never see `demo:pending` without a brief already attached.

**`work-backend: local-files`** — there is no comment mechanism. Append the same template as a
new `## Verification Brief` section to the record body (after any existing content), and write
the record with `facets.acceptance = 'pending'`:

```js
const { readRecord, writeRecord } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
const record = readRecord(filePath);
record.facets.acceptance = 'pending';
record.body = record.body + '\n\n' + briefTemplate;
writeRecord(filePath, record);
```
```

- [ ] **Step 2: Add the acceptance-labeling action to Step 10**

In `skills/wrap-up/SKILL.md`, replace:
```
After the cleanup, also apply:

- **Documentation, CLAUDE.md, rules** — apply the registry / doc / rule edits collected in Step 6 and approved at the Console or batch
- **Decision records (ADRs)** — write the approved `docs/decisions/NNNN-{slug}.md` files (Step 6.3) using the template in `_shared/decision-records.md`, and add them to `docs/REGISTRY.md` if a registry exists
- **Skill updates** — apply patches and create new skills (Step 7 staged or approved items)
```
with:
```
After the cleanup, also apply:

- **Documentation, CLAUDE.md, rules** — apply the registry / doc / rule edits collected in Step 6 and approved at the Console or batch
- **Decision records (ADRs)** — write the approved `docs/decisions/NNNN-{slug}.md` files (Step 6.3) using the template in `_shared/decision-records.md`, and add them to `docs/REGISTRY.md` if a registry exists
- **Skill updates** — apply patches and create new skills (Step 7 staged or approved items)
- **Acceptance labeling** (record mode only — a materialized header exists for this run) — apply `demo:pending` and post the Verification Brief; see `verification-brief.md` in this skill's directory for the bootstrap, sourcing, and posting procedure
```

- [ ] **Step 3: Add an acceptance-labeling check to "Verify execution"**

Replace:
```
- Closing-keyword carrier commit landed (worktree strategy + a materialized header was present for this spec) — `git log {default-branch} --grep="Fixes #{issue}"` shows the carrier commit for each resolved issue once merged (or `git log {feature-branch} --grep=...` if the branch is still open under "keep as-is" or a pending PR)

If any approved action did not land, do NOT emit the closure line. Surface the gap (`BLOCKED — cleanup step {N} did not complete: {reason}`) and stop.
```
with:
```
- Closing-keyword carrier commit landed (worktree strategy + a materialized header was present for this spec) — `git log {default-branch} --grep="Fixes #{issue}"` shows the carrier commit for each resolved issue once merged (or `git log {feature-branch} --grep=...` if the branch is still open under "keep as-is" or a pending PR)
- Acceptance labeling landed (record mode only) — `work-backend: github-issues`: `gh issue view {issue} --json labels -q '.labels[].name'` includes `demo:pending` and the issue's last comment contains `## Verification Brief`; `work-backend: local-files`: the record's body contains `## Verification Brief` and its frontmatter has `acceptance: pending`

If any approved action did not land, do NOT emit the closure line. Surface the gap (`BLOCKED — cleanup step {N} did not complete: {reason}`) and stop.
```

- [ ] **Step 4: Add an anti-pattern row**

Replace:
```
| Writing an ADR for every decision | ADRs are valuable because they are rare — Step 6.3's 3-factor gate (hard-to-reverse AND surprising AND a real trade-off) keeps them so. Most wrap-ups produce zero ADRs, and that is correct |
```
with:
```
| Writing an ADR for every decision | ADRs are valuable because they are rare — Step 6.3's 3-factor gate (hard-to-reverse AND surprising AND a real trade-off) keeps them so. Most wrap-ups produce zero ADRs, and that is correct |
| Treating `demo:pending` as optional for "trivial" record-mode work | The Acceptance axis applies uniformly — `/claude-tweaks:demo`'s batch view is where triviality gets a fast path, not wrap-up's labeling step |
```

- [ ] **Step 5: Add the `/demo` row to the Relationship table**

Replace:
```
| `/claude-tweaks:capture` | /claude-tweaks:wrap-up may file a new backlog record directly (no stage label) for genuinely new ideas discovered during implementation — the same `recordPayload` composition `/capture` itself uses, without going through this skill |
```
with:
```
| `/claude-tweaks:capture` | /claude-tweaks:wrap-up may file a new backlog record directly (no stage label) for genuinely new ideas discovered during implementation — the same `recordPayload` composition `/capture` itself uses, without going through this skill |
| `/claude-tweaks:demo` | /claude-tweaks:wrap-up applies `demo:pending` and posts the Verification Brief (Step 10, `verification-brief.md`) — record mode only. /claude-tweaks:demo later resolves the label to `demo:approved`/`demo:changes-requested` and, on the latter, files a linked follow-up record. |
```

- [ ] **Step 6: Verify**

Run:
```bash
grep -c "demo:pending" skills/wrap-up/SKILL.md skills/wrap-up/verification-brief.md
```
Expected: both files return a positive count.

- [ ] **Step 7: Commit**

```bash
git add skills/wrap-up/SKILL.md skills/wrap-up/verification-brief.md
git commit -m "Wrap-up applies demo:pending and posts a Verification Brief at Step 10"
```

---

## Task 6: `skills/demo/SKILL.md` — new skill (+ reciprocal `/capture` entries)

**Files:**
- Create: `skills/demo/SKILL.md`
- Modify: `skills/capture/SKILL.md`

**Interfaces:**
- Consumes: `parseRecordFacets`/`LABELS` (Task 1), the Verification Brief format (Task 5), `_shared/label-bootstrap.md`'s `demo:approved`/`demo:changes-requested` entries (Task 4).
- Produces: `demo:approved` / `demo:changes-requested` labels; linked follow-up backlog records (`Origin: demo changes-requested from #N`, no `by:*` label — same shape `/capture` itself produces).

Prose-only — verified by grep/text-match.

- [ ] **Step 1: Create `skills/demo/SKILL.md`**

```markdown
---
name: claude-tweaks:demo
description: Use when you want to sweep every built-but-unsigned-off work record and give each one a human verdict — approve, or request changes. The durable acceptance gate distinct from tests passing (/test) and code-quality review (/review). Keywords - acceptance, sign-off, demo, verification brief, human verdict, demo:pending.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Demo — Human Acceptance Sign-Off

Aggregates every record `/claude-tweaks:wrap-up` has finished building (`demo:pending`) — whether merged already or still open, whether built autonomously or by hand — and gives each one a real human verdict. Sits after wrap-up, with no fixed position in any single pipeline run:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                              │
                                                                              v
                                                              [ /claude-tweaks:demo ]   <- utility (no fixed lifecycle position — run anytime, across every in-flight thread)
                                                                              │
                                                       ┌──────────────────────┴──────────────────────┐
                                                       v                                              v
                                              demo:approved                          demo:changes-requested → follow-up record (backlog)
```

## When to Use

- You're running several parallel threads (`/dispatch`-driven or your own `/flow`/`/build` sessions) and want one place that shows everything built and waiting on your judgment.
- An autonomously `auto:merge`'d record already closed — you want to look at it after the fact and mark it approved, or flag a gap.
- You keep having to ask "how do I test this" days after a build finished — this skill surfaces the brief `/wrap-up` already wrote at build time, so you never re-derive it.
- Some of what you're reviewing has no interactive surface at all (docs, config, a backend refactor) — this skill still gives it a lightweight human look, just not a click-through.

Not for: merging or opening PRs (`/superpowers:finishing-a-development-branch`'s job), re-running mechanical checks (`/test`'s job), or code-quality judgment (`/review`'s job). `/demo` only ever resolves the Acceptance axis.

## Input

`$ARGUMENTS` — *(none)* sweeps every `demo:pending` record; `#N` scopes to a single record.

## Step 1: Discover pending records

**`work-backend: github-issues`:**

```bash
gh issue list --state all --label demo:pending --json number,title,labels,url --limit 200 > /tmp/demo-pending.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/demo-pending.json');
  const rows = issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }));
  console.log(JSON.stringify(rows));
"
```

`--state all` is deliberate — `demo:pending` persists independent of open/closed state, which is
what makes retrospective sign-off on already-merged `auto:merge` work possible. When `#N` is
given, scope to that single record instead of the full list.

For each matching record, fetch its Verification Brief: the last issue comment containing
`## Verification Brief` (`gh issue view {n} --json comments -q '.comments[-1].body'` if only one
build/demo cycle occurred; otherwise search all comments for the last one containing that
heading).

**`work-backend: local-files`:** `queryRecords(dir, { acceptance: 'pending' })`
(`bin/lib/issues/local-store.js`) — the Verification Brief is the record's own
`## Verification Brief` body section, not a separate fetch.

If no records match, report "Nothing awaiting sign-off." and stop — do not render an empty
batch table or call `AskUserQuestion`.

## Step 2: Present the batch

Lead with a scope line: `**{N} records awaiting sign-off** ({M} low-risk, {K} need a closer look)`.

Render a batch table:

| # | Title | Type | Risk/Effort | What changed | Suggested verdict |
|---|-------|------|--------------|---------------|--------------------|
| {ref} | {title} | {type} | {risk}/{effort} | {one-liner from the brief's "What changed"} | {Approve \| Needs a look} |

**Suggested verdict** is pre-filled **Approve** only when the record is both `risk:low` and
`effort:low` AND its changed-file list doesn't touch any `merge-sensitive-paths` glob
(`_shared/work-record.md`'s config key). Every other record gets **Needs a look**, no pre-fill —
this skill exists for real judgment, not rubber-stamping.

Call `AskUserQuestion` with `question`: `"How do you want to work through these?"`,
`header`: `"Sign-off"`, `multiSelect`: `false`:

- Option 1 (when any row is pre-filled Approve) — `label`: `"Approve the low-risk batch, walk through the rest (Recommended)"`, `description`: `"Bulk-approve every row suggested Approve; walk through the remaining rows one at a time"`
- Option 2 — `label`: `"Walk through every item individually"`, `description`: `"No bulk approval — review every record's full brief"`
- Option 3 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

## Step 3: Per-item walkthrough

For every record not bulk-approved in Step 2, render its full Verification Brief (What changed /
Why / How to verify, or the non-testable note verbatim), then call `AskUserQuestion` with
`question`: `"Verdict for {ref}: {title}?"`, `header`: `"Verdict"`, `multiSelect`: `false`:

- Option 1 — `label`: `"Approve"`, `description`: `"This does what was asked"`
- Option 2 — `label`: `"Request changes"`, `description`: `"There's a gap — I'll describe it"`
- Option 3 — `label`: `"Skip for now"`, `description`: `"Leave demo:pending — I'll come back to this"`

## Step 4: Apply verdicts

Bootstrap `demo:approved` and `demo:changes-requested` via the check-then-create loop from
`_shared/label-bootstrap.md` before the first swap this run.

- **Approve** (bulk or individual) — `gh issue edit {n} --remove-label demo:pending --add-label demo:approved` (`local-files`: set `facets.acceptance = 'approved'` via `writeRecord`).
- **Request changes** — prompt for a short reason inline, then:
  1. `gh issue edit {n} --remove-label demo:pending --add-label demo:changes-requested`
  2. File a linked follow-up record: backlog stage (no `ready` — a one-line reason isn't
     spec-shaped), Type `bug` by default (override to `feature`/`task` when the reason clearly
     describes new scope, not a defect), no `by:*` label — instead a body line
     `Origin: demo changes-requested from #{n}` per `_shared/work-record.md`'s side-effect-record
     convention — plus the reason and a link back to the original. Use the same `recordPayload`
     composition `/capture` uses (`bin/lib/issues/record.js`), just without invoking `/capture`
     itself.
  3. Comment on the original record noting the new follow-up's issue number, so the link is
     bidirectional.
- **Skip for now** — no label change.

## Next Actions

Render via `AskUserQuestion`, `question`: `"What's next?"`, `header`: `"Next step"`,
`multiSelect`: `false`:

- Option 1 (when any `demo:changes-requested` follow-up was filed) — `label`: `"Triage the new follow-up (Recommended)"`, `description`: `"/claude-tweaks:triage — the new gap record needs shaping/authorization like any other backlog item"`
- Option 2 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — full pipeline status"`
- Option 3 (when records remain `demo:pending` after Skip) — `label`: `"Run demo again later"`, `description`: `"{N} records still awaiting sign-off — /claude-tweaks:demo picks them back up next run"`

## Component-Skill Contract

`/claude-tweaks:demo` is a **standalone-only** skill — it is never invoked by a parent skill
in the workflow. There is no `PIPELINE_RUN_DIR` signal to check; the `## Next Actions` block
always renders.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Bulk-approving everything regardless of risk tier | This skill exists for real human judgment — only the `risk:low`+`effort:low` tier with no `merge-sensitive-paths` touch gets a pre-filled Approve suggestion, and it's still a choice, not a default |
| Re-deriving "how do I test this" from the diff | The Verification Brief already has it — `/wrap-up` wrote it at build time with full context; read the brief, don't reconstruct it |
| Merging or opening a PR from within this skill | Merge/PR decisions belong to `/superpowers:finishing-a-development-branch` — `/demo` only ever resolves the Acceptance axis |
| Silently dropping a `demo:pending` record with no verdict | Every record gets Approve / Request changes / Skip — Skip is explicit and leaves `demo:pending` for next run, it never disappears from the worklist unrecorded |
| Treating a record with no interactive surface as not needing sign-off | Non-testable work still gets a lightweight human look — the brief just reframes the ask as "review the diff/rationale" instead of "click through this" |
| Scanning only open issues | `demo:pending` persists on closed issues too (auto-merged autonomous work) — always query `--state all` |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:wrap-up` | Sole producer of `demo:pending` + the Verification Brief (Step 10, `verification-brief.md`) — `/demo` is the sole consumer/resolver |
| `/claude-tweaks:help` | `/help`'s dashboard surfaces a `demo:pending` count as a lightweight signal; `/demo` is where the actual walkthrough happens |
| `/claude-tweaks:capture` | On "request changes," `/demo` files a follow-up backlog record using the same `recordPayload` composition `/capture` itself uses, without invoking `/capture` |
```

- [ ] **Step 2: Add reciprocal `/demo` entries to `skills/capture/SKILL.md`**

Replace:
```
This skill is a **component skill** — directly invoked by `/claude-tweaks:build` (Common Step 4, design-mode follow-up capture). `/claude-tweaks:visual-review`, `/claude-tweaks:reflect`, and `/claude-tweaks:wrap-up` file a new backlog record directly without going through this skill, so they are NOT capture parents — they only recommend `/capture` in Next Actions for the user's next session.
```
with:
```
This skill is a **component skill** — directly invoked by `/claude-tweaks:build` (Common Step 4, design-mode follow-up capture). `/claude-tweaks:visual-review`, `/claude-tweaks:reflect`, `/claude-tweaks:wrap-up`, and `/claude-tweaks:demo` file a new backlog record directly without going through this skill, so they are NOT capture parents — they only recommend `/capture` in Next Actions for the user's next session.
```

Replace:
```
| `/claude-tweaks:wrap-up` | May file new backlog records for genuinely new ideas; leftover work becomes a `parked` record instead |
```
with:
```
| `/claude-tweaks:wrap-up` | May file new backlog records for genuinely new ideas; leftover work becomes a `parked` record instead |
| `/claude-tweaks:demo` | May file a linked follow-up backlog record when a human requests changes during acceptance review — references the original via an `Origin: demo changes-requested from #N` body line instead of a `by:*` label |
```

- [ ] **Step 3: Verify**

Run:
```bash
test -f skills/demo/SKILL.md && echo "exists"
grep -c "^## " skills/demo/SKILL.md
grep -c "demo:pending\|demo:approved\|demo:changes-requested" skills/demo/SKILL.md
grep -c "claude-tweaks:demo" skills/capture/SKILL.md
```
Expected: `exists`; a positive section count; a positive label-mention count; `skills/capture/SKILL.md` mentions `/demo` at least twice (prose + table row).

- [ ] **Step 4: Commit**

```bash
git add skills/demo/SKILL.md skills/capture/SKILL.md
git commit -m "Add /claude-tweaks:demo — human acceptance sign-off skill"
```

---

## Task 7: `/help` dashboard — Acceptance Queue (Stage 4.7)

**Files:**
- Modify: `skills/_shared/github-pr-scan.md`
- Modify: `skills/help/status-scan.md`
- Modify: `skills/help/SKILL.md`
- Modify: `skills/help/reference-card.md`
- Modify: `CLAUDE.md` (one fragment)

**Interfaces:**
- Consumes: `demo:pending` label (Task 4/5).
- Produces: a `demo:pending` count surfaced on `/help`'s dashboard.

Prose-only — verified by grep/text-match plus a syntax-check of the new `gh`/`node` snippet.

- [ ] **Step 1: Add the `acceptance-queue` scope to `github-pr-scan.md`**

Replace the file's opening line:
```
Single source of truth for scanning GitHub pull-request and issue state. Consumed by `/claude-tweaks:help` (Stage 4.5, **`current-pr`** scope; Stage 4.6, **`triage-queue`** scope) and `/claude-tweaks:tidy` (Step 4.8, **`repo-wide`** scope). Subagents cannot read this file — the dispatcher inlines the relevant scope section, plus the Detection Ladder and Output Contract, into the scan agent's prompt (the same pattern as `tidy/scan-procedures.md`).
```
with:
```
Single source of truth for scanning GitHub pull-request and issue state. Consumed by `/claude-tweaks:help` (Stage 4.5, **`current-pr`** scope; Stage 4.6, **`triage-queue`** scope; Stage 4.7, **`acceptance-queue`** scope) and `/claude-tweaks:tidy` (Step 4.8, **`repo-wide`** scope). Subagents cannot read this file — the dispatcher inlines the relevant scope section, plus the Detection Ladder and Output Contract, into the scan agent's prompt (the same pattern as `tidy/scan-procedures.md`).
```

Immediately after the `## Scope: \`triage-queue\` (consumed by /help Stage 4.6)` section's final paragraph (the one ending "...\`[backlog]\`/\`[parked]\`/\`[unsynced]\`/\`[scoring]\`/\`[blocked]\`/\`[legacy]\` row prefixes.") and before `## Output Contract`, insert:

```markdown
## Scope: `acceptance-queue` (consumed by /help Stage 4.7)

One cheap count for the dashboard's Acceptance Queue section — deliberately `--state all`,
unlike every other count in this file, since `demo:pending` persists independent of open/closed
state (an `auto:merge`'d record's issue can already be closed while still awaiting sign-off).

```bash
gh issue list --label demo:pending --state all --json number --limit 200 -q 'length'
```

Render as one line: `Awaiting sign-off: **{N}** records built and ready for your review` —
omit entirely when the count is 0.
```

- [ ] **Step 2: Add Stage 4.7 to `status-scan.md`**

Replace:
```
There is no Stage 1.5, Stage 3, or Stage 4 — they merged into Stage 1 above (their data sources — `specs/backlog/*.md`, the old spec index, and `specs/*.md` frontmatter — are retired). The rest of the numbering (Stage 2, 4.5, 4.6, 5, 6, 7) is unchanged, so existing cross-references — including this file's own later stages and `SKILL.md`'s Priority Order — keep pointing at the right stage.
```
with:
```
There is no Stage 1.5, Stage 3, or Stage 4 — they merged into Stage 1 above (their data sources — `specs/backlog/*.md`, the old spec index, and `specs/*.md` frontmatter — are retired). The rest of the numbering (Stage 2, 4.5, 4.6, 4.7, 5, 6, 7) is unchanged, so existing cross-references — including this file's own later stages and `SKILL.md`'s Priority Order — keep pointing at the right stage.
```

Replace:
```
## Stage 5: Specs Awaiting Review
```
with:
```
## Stage 4.7: Acceptance Queue (GitHub)

Cheap count only — the walkthrough stays `/claude-tweaks:demo`'s job, not `/help`'s. Skip
silently (same fail-open detection ladder as Stage 4.5/4.6) when `gh` is unavailable,
unauthenticated, or the repo has no GitHub remote.

Scan per `_shared/github-pr-scan.md`, **`acceptance-queue`** scope. The dispatcher inlines that
file's Detection Ladder, `acceptance-queue` scope section, and one-line render format into this
agent's prompt — subagents cannot read sibling files.

## Stage 5: Specs Awaiting Review
```

In the `## Present Dashboard` template, replace:
```
### Triage Queue

*(Omit this section entirely when the GitHub scan was skipped, or when all three counts are 0.)*

- Pending authorization: **{N} records awaiting your decision** — run `/claude-tweaks:triage` (omit this line when N is 0)
- Blocked: **{N} records hit their retry ceiling** — run `/claude-tweaks:triage` to review (omit this line when N is 0)
- Auto-merged this week: **{N} auto-merges** on the default branch in the last 7 days (omit this line when N is 0)
```
with:
```
### Triage Queue

*(Omit this section entirely when the GitHub scan was skipped, or when all three counts are 0.)*

- Pending authorization: **{N} records awaiting your decision** — run `/claude-tweaks:triage` (omit this line when N is 0)
- Blocked: **{N} records hit their retry ceiling** — run `/claude-tweaks:triage` to review (omit this line when N is 0)
- Auto-merged this week: **{N} auto-merges** on the default branch in the last 7 days (omit this line when N is 0)

### Acceptance Queue

*(Omit this section entirely when the GitHub scan was skipped, or the count is 0.)*

- Awaiting sign-off: **{N} records built and ready for your review** — run `/claude-tweaks:demo`
```

- [ ] **Step 3: Update `help/SKILL.md`'s Relationship row for `github-pr-scan.md`**

Replace:
```
| `_shared/github-pr-scan.md` | Stage 4.5 scans the current branch's PR per this shared procedure (`current-pr` scope); Stage 4.6 scans the triage queue (`triage-queue` scope) — detection ladder, exact gh/GraphQL commands, output contract, severity mapping |
```
with:
```
| `_shared/github-pr-scan.md` | Stage 4.5 scans the current branch's PR per this shared procedure (`current-pr` scope); Stage 4.6 scans the triage queue (`triage-queue` scope); Stage 4.7 scans the acceptance queue (`acceptance-queue` scope) — detection ladder, exact gh/GraphQL commands, output contract, severity mapping |
```

Add a new row right after the existing `/claude-tweaks:triage` row:
```
| `/claude-tweaks:triage` | Surfaces pending-authorization count, `bot:blocked` count, and rolling auto-merge count on the dashboard (Stage 4.6, `triage-queue` scope) — the reciprocal of `triage/SKILL.md`'s own `/claude-tweaks:help` row. |
```
becomes:
```
| `/claude-tweaks:triage` | Surfaces pending-authorization count, `bot:blocked` count, and rolling auto-merge count on the dashboard (Stage 4.6, `triage-queue` scope) — the reciprocal of `triage/SKILL.md`'s own `/claude-tweaks:help` row. |
| `/claude-tweaks:demo` | Surfaces the `demo:pending` count on the dashboard (Stage 4.7, `acceptance-queue` scope) — the reciprocal of `demo/SKILL.md`'s own `/claude-tweaks:help` row. |
```

- [ ] **Step 4: Update `CLAUDE.md`'s github-pr-scan fragment**

Replace:
```
github-pr-scan (GitHub PR/issue state for /tidy Step 4.8 + /help Stage 4.5)
```
with:
```
github-pr-scan (GitHub PR/issue state for /tidy Step 4.8 + /help Stage 4.5/4.6/4.7)
```

- [ ] **Step 5: Add `/demo` to `help/reference-card.md`'s Utility table**

Replace:
```
| `/claude-tweaks:journey-health` | Recurring health check auditing `docs/journeys/*.md` for drift and journey-story coverage gaps (light tier); an interactive-only deep tier actually runs a journey's QA stories or walks it live. Scheduled Routine (light tier only). Never edits anything — always files a GitHub issue. | `--target <name>`, `--deep`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```
with:
```
| `/claude-tweaks:journey-health` | Recurring health check auditing `docs/journeys/*.md` for drift and journey-story coverage gaps (light tier); an interactive-only deep tier actually runs a journey's QA stories or walks it live. Scheduled Routine (light tier only). Never edits anything — always files a GitHub issue. | `--target <name>`, `--deep`, `--dry-run`, `--budget <n>`, `--root <dir>` |
| `/claude-tweaks:demo` | Aggregates every `demo:pending` record (open or closed), briefs you on each, and captures a human verdict — approve or request changes | *(none)*, `#N` |
```

Add a row to the Artifact Lifecycle Creates/Deletes table. Replace:
```
| `/claude-tweaks:wrap-up` | Learnings (CLAUDE.md) | Spec, plans, ledger |
```
with:
```
| `/claude-tweaks:wrap-up` | Learnings (CLAUDE.md), Verification Brief | Spec, plans, ledger |
| `/claude-tweaks:demo` | Follow-up record (on changes-requested) | — |
```

- [ ] **Step 6: Verify**

Run:
```bash
grep -c "acceptance-queue" skills/_shared/github-pr-scan.md skills/help/status-scan.md
grep -c "Stage 4.7" skills/help/status-scan.md skills/help/SKILL.md
node -e "
  // syntax-check the new gh/node snippet's shape (no live gh call — just confirm the -q filter is valid jq-ish syntax by pattern, and the bash is well-formed)
  const cmd = \"gh issue list --label demo:pending --state all --json number --limit 200 -q 'length'\";
  if (!cmd.includes('--state all')) throw new Error('missing --state all');
  console.log('acceptance-queue command shape OK');
"
```
Expected: positive counts in both greps; `acceptance-queue command shape OK`.

- [ ] **Step 7: Commit**

```bash
git add skills/_shared/github-pr-scan.md skills/help/status-scan.md skills/help/SKILL.md skills/help/reference-card.md CLAUDE.md
git commit -m "Surface demo:pending count on /help's dashboard (Stage 4.7, acceptance-queue scope)"
```

---

## Task 8: `README.md` + `CLAUDE.md` — skill directory, changelog, cross-references

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

Prose-only — verified by grep/text-match.

- [ ] **Step 1: Add `/demo` to CLAUDE.md's skill-directory list**

Replace:
```
### Skill directories (30 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design, visualize, assess-agent-autonomy
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, triage, dispatch
```
with:
```
### Skill directories (31 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design, visualize, assess-agent-autonomy
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, triage, dispatch, demo
```

- [ ] **Step 2: Add `verification-brief.md` to wrap-up's row in the "Skills with sub-files" table**

Replace:
```
| wrap-up | leftover-routing.md, review-console.md, cleanup-procedures.md, skill-curation.md | Leftover routing rules for unfinished work; Review Console consolidation template; Step 5 cleanup procedures (design wrapper caches, pipeline run dir archival, worktree teardown, issue-claim release (item 8) with ownership check); Step 7 skill curation (seed gather, independent domain-scoped scan + gap detection, 6-dimension analysis, ≥2-of-3 new-skill gate, stage/present) — generates candidates from the work itself, not only ledger-tagged seeds |
```
with:
```
| wrap-up | leftover-routing.md, review-console.md, cleanup-procedures.md, skill-curation.md, verification-brief.md | Leftover routing rules for unfinished work; Review Console consolidation template; Step 5 cleanup procedures (design wrapper caches, pipeline run dir archival, worktree teardown, issue-claim release (item 8) with ownership check); Step 7 skill curation (seed gather, independent domain-scoped scan + gap detection, 6-dimension analysis, ≥2-of-3 new-skill gate, stage/present) — generates candidates from the work itself, not only ledger-tagged seeds; Step 10 Verification Brief procedure (bootstrap demo:pending, testability check, priority-ordered sourcing, post/append) |
```

- [ ] **Step 3: Update README.md's six-axis line under "## Work Records"**

Replace:
```
See `skills/_shared/work-record.md` for the full six-axis contract (Type, Origin, Scoring, Stage, Authorization, Bot state), the complete label taxonomy, and the permission matrix governing which skill may add or remove which label.
```
with:
```
See `skills/_shared/work-record.md` for the full seven-axis contract (Type, Origin, Scoring, Stage, Authorization, Bot state, Acceptance), the complete label taxonomy, and the permission matrix governing which skill may add or remove which label.
```

- [ ] **Step 4: Add `/demo` to README's "How it works" diagram**

This diagram is one fenced code block; the legend (`> **Left column:** ...`) is separate
markdown immediately below the closing fence and is NOT part of this edit — leave it untouched.

Inside the fence, replace:
```
  wrap-up ──────────────►  Done               ◄───  finishing-a-dev-branch ⚙
     │  calls: reflect
     │         (full)
                           (deletes plans, ledger, design caches; legacy spec file
                            deleted too — a record-mode build's materialized file
                            stays on the branch as committed audit trail instead)
```
with:
```
  wrap-up ──────────────►  Done               ◄───  finishing-a-dev-branch ⚙
     │  calls: reflect
     │         (full)
                           (deletes plans, ledger, design caches; legacy spec file
                            deleted too — a record-mode build's materialized file
                            stays on the branch as committed audit trail instead;
                            applies demo:pending + posts a Verification Brief on
                            the record — record mode only)
     │
  ┈┈ /claude-tweaks:demo resolves demo:pending → approved/changes-requested (utility skill, no fixed position — run anytime, aggregates every in-flight thread) ┈┈
```

- [ ] **Step 5: Add a `/demo` paragraph to README's Utility skills section**

Replace:
```
**`/claude-tweaks:tidy`** — Batch backlog hygiene. Scans the live work-record queue (backlog, parked, unsynced, unscored `ready`, `bot:blocked`, legacy-taxonomy records), scans review/wrap-up history for recurring patterns across specs, audits the documentation registry, and recommends project-level fixes. Also audits GitHub state — stale open PRs, code-health/harness-health/journey-health-filed issues, addressed-but-unresolved review threads — with GitHub mutations (close, resolve) executing only after batch approval. Pass `--scope=<name>[,<name>...]` to narrow a run to specific scan steps (e.g. `--scope=github` for GitHub PR/issue triage only) instead of the full sweep.

**`/claude-tweaks:browse`** — Browser automation via agent-browser. Defines session naming, screenshot/trace paths, and operation vocabulary used by /stories, /visual-review, and /review.
```
with:
```
**`/claude-tweaks:tidy`** — Batch backlog hygiene. Scans the live work-record queue (backlog, parked, unsynced, unscored `ready`, `bot:blocked`, legacy-taxonomy records), scans review/wrap-up history for recurring patterns across specs, audits the documentation registry, and recommends project-level fixes. Also audits GitHub state — stale open PRs, code-health/harness-health/journey-health-filed issues, addressed-but-unresolved review threads — with GitHub mutations (close, resolve) executing only after batch approval. Pass `--scope=<name>[,<name>...]` to narrow a run to specific scan steps (e.g. `--scope=github` for GitHub PR/issue triage only) instead of the full sweep.

**`/claude-tweaks:demo`** — The durable, cross-thread acceptance gate: aggregates every record `/claude-tweaks:wrap-up` has labeled `demo:pending` (open or closed — covers already-merged `auto:merge` work too), replays the Verification Brief `/wrap-up` wrote at build time so you never re-derive "how do I test this," and captures a real human verdict distinct from tests passing (`/test`) or code-quality review (`/review`). Approve resolves to `demo:approved`; requesting changes resolves to `demo:changes-requested` and files a linked follow-up backlog record. Bare `/demo` sweeps everything pending; `/demo #N` scopes to one record.

**`/claude-tweaks:browse`** — Browser automation via agent-browser. Defines session naming, screenshot/trace paths, and operation vocabulary used by /stories, /visual-review, and /review.
```

- [ ] **Step 6: Add a changelog entry**

Read the current version from `.claude-plugin/plugin.json` first (`grep version .claude-plugin/plugin.json`) to compute the next minor version (do not hardcode — Task 9 may find a concurrent bump; use whatever version Task 9 actually lands on for this heading, updating it then if needed). Insert a new section immediately after `## What this does` and before the existing `### What's new in v6.0.0` entry:

```markdown
### What's new in v{NEXT} — Human acceptance sign-off (`/claude-tweaks:demo`)

A new seventh work-record axis (`demo:pending` / `demo:approved` / `demo:changes-requested`)
closes the gap between tests passing, spec completion, and an actual human verifying a built
feature does what was asked. `/claude-tweaks:wrap-up` applies `demo:pending` and writes a
Verification Brief (what changed, why, how to verify) while it still has full build context;
the new `/claude-tweaks:demo` skill aggregates every pending record — across parallel threads,
regardless of merge timing — and captures your verdict.
```

- [ ] **Step 7: Verify**

Run:
```bash
grep -n "31 total" CLAUDE.md
grep -n "verification-brief.md" CLAUDE.md
grep -n "seven-axis contract" README.md
grep -n "claude-tweaks:demo" README.md
grep -c "the six axes\|six-axis" README.md CLAUDE.md
```
Expected: matches on the first four; the last returns `0` for both files (no stragglers).

- [ ] **Step 8: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Document /claude-tweaks:demo in README and CLAUDE.md"
```

---

## Task 9: Version bump

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Check for a concurrent bump**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
cat .claude-plugin/plugin.json | grep version
```

If `origin/main` shows a version bump not yet in this branch's history, use the next free minor
version after that one instead of assuming `6.1.1`'s successor.

- [ ] **Step 2: Bump the version**

Replace (assuming no concurrent bump — adjust the target version per Step 1's finding):
```json
  "version": "6.1.1",
```
with:
```json
  "version": "6.2.0",
```

- [ ] **Step 3: Reconcile Task 8's changelog heading**

If Step 1 found a different next-free version than `6.2.0`, go back and update the
`### What's new in v{NEXT}` heading in `README.md` (Task 8, Step 6) to match the actual bumped
version.

- [ ] **Step 4: Run the full suite one final time**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "Bump version to 6.2.0 for /claude-tweaks:demo"
```

---

## Final Verification (after all tasks)

- [ ] Run `npm test` — full suite green.
- [ ] Run `grep -rn "the six axes" --include="*.md" . | grep -v "^./specs/\|^./docs/superpowers/"` — no output.
- [ ] Run `grep -rln "demo:pending" skills/ bin/` — hits in `record.js`, `record.test.js`, `local-store.js` (via the acceptance facet doc comment only, not a literal string — confirm this one is a false-negative-safe check), `label-bootstrap.md`, `work-record.md`, `wrap-up/SKILL.md`, `wrap-up/verification-brief.md`, `demo/SKILL.md`, `github-pr-scan.md`, `status-scan.md`.
- [ ] Manually read `skills/demo/SKILL.md` end-to-end once — confirm it follows the standard structure (frontmatter, interaction directive, H1, diagram, When to Use, Input, numbered steps, Next Actions, Component-Skill Contract, Anti-Patterns, Relationship table) per CLAUDE.md's conventions.
- [ ] Confirm `git status` is clean and every task's commit landed on this worktree's branch.
