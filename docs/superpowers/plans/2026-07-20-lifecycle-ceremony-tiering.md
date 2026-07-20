# Lifecycle Ceremony Tiering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `ceremony-check` judgment (fast-lane vs. standard) from `/flow`'s materialize time into `/specify`'s record-creation step, so the heaviest remaining fixed-cost step for a trivial record — Step 5's three-persona red-team — can also scale with tier, and give `/review` its own tier-aware step selection so its fixed-cost wrapper steps (spec-compliance re-check, cross-spec-promise check, hindsight) trim the same way Wrap-up's already do.

**Architecture:** `ceremony-check` (an existing `assess-agent-autonomy` mode) is now called from `/specify`'s Step 3 (both Shaping mode's single-record path and decomposition mode's per-leaf loop), immediately alongside `risk:*`/`effort:*` label stamping. Its verdict becomes an always-explicit `ceremony:fast-lane`/`ceremony:standard` label (no longer an omit-on-default header field) — a real, persistent signal visible everywhere `risk:*`/`effort:*` already are. `/flow`'s materialize.md reads that label directly and only falls back to invoking `ceremony-check` itself for a record that never went through the new `/specify` step. `/review` gains ceremony-aware skip logic on its fixed-cost wrapper steps, mirroring Wrap-up's existing pattern. `/review-backlog` surfaces the tier as an advisory column.

**Tech Stack:** Small pure-function extensions to `bin/lib/issues/{tier,record,local-store}.js`, tested via `node --test`; markdown skill-file edits (prose procedures) for everything else.

## Global Constraints

- Full design doc, approved and committed: `docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md` — read it before starting; every task below implements a specific section of it. It amends (but does not edit) `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md`.
- `ceremony-check` runs unconditionally for every leaf/single-shaped-record at `/specify`'s Step 3 — no pre-filtering to "borderline" records. Never runs on parent records (decomposition mode) — parents carry no `risk:*`/`effort:*` scoring either, and ceremony follows the same rule.
- `ceremony:*` is **always explicit** once a record is scored — `ceremony:fast-lane` or `ceremony:standard`, never omitted. This is a deliberate deviation from `risk:*`/`effort:*`'s omit-when-*unscored* convention (see the design doc's "Promoting `ceremony:` to an explicit, always-present label" section for why omission doesn't survive the move upstream).
- `/flow` materialize.md's `ceremony-check` invocation is a **fallback only**, for a record with no `ceremony:*` label at all. It computes the value for that run's own materialized header only — it never writes a label back to the record. `/specify` remains the sole owner of the `ceremony:*` label.
- Ambiguity always resolves to the conservative outcome (`standard`) — this applies to `ceremony-check` itself, to the fallback computation, and to every step-skip check added in this plan (a step that can't determine `ceremony-profile` runs at full depth).
- Test, `merge-check`, auto-merge eligibility, and `/claude-tweaks:test` itself are untouched by this plan — do not modify them in service of this work.
- Review's Step 3 (the actual code-quality read of the diff) and Step 5 (Simplify) are never tiered — Step 3 is the safety-relevant judgment this whole design protects; Step 5 already scopes to `git diff --name-only` only and has no "look beyond the diff" behavior to cap.
- Working Directory Discipline applies to every step below: confirm `pwd` and `git rev-parse --show-toplevel` resolve to your worktree before any commit.
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefixes). This work has no associated GitHub record yet — do not invent a `refs #N` placeholder in commit messages.
- Task order matters: Task 1 (pure-function code) must land before any of Tasks 2-9 (which reference its exports). Within Task 1, `local-store.js`'s facet whitelist changes must land before Tasks 3/4's local-files prose can be correct.

---

### Task 1: Add `ceremony` support to `bin/lib/issues/{tier,record,local-store}.js`

**Files:**
- Modify: `bin/lib/issues/tier.js`, `bin/lib/issues/tests/tier.test.js`
- Modify: `bin/lib/issues/record.js`, `bin/lib/issues/tests/record.test.js`
- Modify: `bin/lib/issues/local-store.js`, `bin/lib/issues/tests/local-store.test.js`

**Interfaces:**
- Produces: `tier.js`'s `extractCeremony(labels) -> { ceremonyTier: 'fast-lane'|'standard'|undefined }` (consumed by Task 2's `ceremony-check` mode); `record.js`'s `recordPayload({..., ceremony?})` emitting a `ceremony:{tier}` label (consumed by Task 4's leaf/parent creation); `record.js`'s `parseRecordFacets` gaining `facets.ceremony` (consumed by Task 6's materialize.md and Task 9's review-backlog); `local-store.js`'s `defaultFacets`/`parseFrontmatterLines`/`serializeFrontmatter` gaining `ceremony` (consumed by Task 3/4's local-files write paths).
- Consumes: nothing new — all three files already exist with the patterns below.

- [ ] **Step 1: Write the failing test for `extractCeremony`**

Append to `bin/lib/issues/tests/tier.test.js`:

```js
test('extractCeremony reads canonical colon-form ceremony:* string labels', () => {
  assert.deepStrictEqual(extractCeremony(['ceremony:fast-lane']), { ceremonyTier: 'fast-lane' });
  assert.deepStrictEqual(extractCeremony(['ceremony:standard']), { ceremonyTier: 'standard' });
});

test('extractCeremony reads canonical colon-form labels from {name} objects', () => {
  assert.deepStrictEqual(extractCeremony([{ name: 'ceremony:fast-lane' }]), { ceremonyTier: 'fast-lane' });
});

test('extractCeremony returns undefined when the label is absent', () => {
  assert.deepStrictEqual(extractCeremony([]), { ceremonyTier: undefined });
  assert.deepStrictEqual(extractCeremony(undefined), { ceremonyTier: undefined });
});

test('extractCeremony ignores non-matching labels', () => {
  assert.deepStrictEqual(extractCeremony(['risk:low', 'ceremony:bogus']), { ceremonyTier: undefined });
});
```

Add `extractCeremony` to the existing `require('../tier')` destructure at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test bin/lib/issues/tests/tier.test.js
```

Expected: FAIL — `extractCeremony is not a function` (or `undefined`).

- [ ] **Step 3: Implement `extractCeremony` in `tier.js`**

Find:

```js
const COLON_RISK_RE = /^risk:(low|medium|high)$/;
const COLON_EFFORT_RE = /^effort:(low|medium|high)$/;

function extractRiskEffort(labels) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  const risk = names.map((n) => COLON_RISK_RE.exec(n)).find(Boolean);
  const effort = names.map((n) => COLON_EFFORT_RE.exec(n)).find(Boolean);
  return {
    riskTier: risk ? risk[1] : undefined,
    effortTier: effort ? effort[1] : undefined,
  };
}

module.exports = { extractRiskEffort };
```

Replace with:

```js
const COLON_RISK_RE = /^risk:(low|medium|high)$/;
const COLON_EFFORT_RE = /^effort:(low|medium|high)$/;
const COLON_CEREMONY_RE = /^ceremony:(fast-lane|standard)$/;

function extractRiskEffort(labels) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  const risk = names.map((n) => COLON_RISK_RE.exec(n)).find(Boolean);
  const effort = names.map((n) => COLON_EFFORT_RE.exec(n)).find(Boolean);
  return {
    riskTier: risk ? risk[1] : undefined,
    effortTier: effort ? effort[1] : undefined,
  };
}

// Mirrors extractRiskEffort's shape for the always-explicit ceremony:* label —
// see docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md.
function extractCeremony(labels) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  const ceremony = names.map((n) => COLON_CEREMONY_RE.exec(n)).find(Boolean);
  return { ceremonyTier: ceremony ? ceremony[1] : undefined };
}

module.exports = { extractRiskEffort, extractCeremony };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test bin/lib/issues/tests/tier.test.js
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/tier.js bin/lib/issues/tests/tier.test.js
git commit -m "Add extractCeremony to tier.js — reads the always-explicit ceremony:* label

Mirrors extractRiskEffort's shape. Consumed by assess-agent-autonomy's
ceremony-check mode (Task 2) once it moves to /specify's Step 3."
```

- [ ] **Step 6: Write the failing tests for `recordPayload`'s `ceremony` param**

Append to `bin/lib/issues/tests/record.test.js` (near the existing `recordPayload` tests):

```js
test('recordPayload emits ceremony:{tier} when ceremony is supplied', () => {
  const result = recordPayload({ title: 't', body: 'b', type: 'task', risk: 'low', effort: 'low', ceremony: 'fast-lane', ready: true });
  assert.ok(result.labels.includes('ceremony:fast-lane'));
});

test('recordPayload emits no ceremony:* label when ceremony is omitted', () => {
  const result = recordPayload({ title: 't', body: 'b', type: 'task', risk: 'low', effort: 'low' });
  assert.ok(!result.labels.some((l) => l.startsWith('ceremony:')));
});

test('recordPayload throws on unknown ceremony value', () => {
  assert.throws(() => recordPayload({ title: 't', body: 'b', type: 'task', ceremony: 'medium' }), /ceremony/);
});

test('recordPayload emits labels in order: by:*, risk:*, effort:*, ceremony:*, ready, parked, priority:*', () => {
  const result = recordPayload({
    title: 't', body: 'b', type: 'task', origin: 'capture',
    risk: 'low', effort: 'low', ceremony: 'standard', ready: true, priority: 'high',
  });
  assert.deepStrictEqual(result.labels, ['by:capture', 'risk:low', 'effort:low', 'ceremony:standard', 'ready', 'priority:high']);
});
```

- [ ] **Step 7: Run the tests to verify they fail**

```bash
node --test bin/lib/issues/tests/record.test.js
```

Expected: FAIL — `ceremony` is silently ignored (no `ceremony:*` label emitted; the order test fails on array mismatch).

- [ ] **Step 8: Implement `ceremony` in `recordPayload`**

Find (near the top of `record.js`, alongside the other enum lists):

```js
const ORIGINS = ['code-health', 'harness-health', 'journey-health', 'docs-health', 'capture'];
const TYPES = ['bug', 'feature', 'task'];
const TIERS = ['low', 'medium', 'high'];
const PRIORITIES = ['high', 'medium', 'low'];
```

Replace with:

```js
const ORIGINS = ['code-health', 'harness-health', 'journey-health', 'docs-health', 'capture'];
const TYPES = ['bug', 'feature', 'task'];
const TIERS = ['low', 'medium', 'high'];
const PRIORITIES = ['high', 'medium', 'low'];
const CEREMONY_TIERS = ['fast-lane', 'standard'];
```

Find:

```js
function recordPayload({ title, body, type, origin, risk, effort, ready, parked, priority, fingerprint } = {}) {
  if (typeof title !== 'string' || !title) {
    throw new Error(`title must be a non-empty string (got ${typeof title})`);
  }
  if (typeof body !== 'string') {
    throw new Error(`body must be a string (got ${typeof body})`);
  }
  oneOf('type', type, TYPES);

  if (ready && parked) {
    throw new Error('a record cannot be both ready and parked');
  }

  // Deterministic emission order: by:*, risk:*, effort:*, ready, parked, priority:*.
  const labels = [];

  if (origin !== undefined) {
    oneOf('origin', origin, ORIGINS);
    labels.push(`by:${origin}`);
  }
  if (risk !== undefined) {
    oneOf('risk', risk, TIERS);
    labels.push(`risk:${risk}`);
  }
  if (effort !== undefined) {
    oneOf('effort', effort, TIERS);
    labels.push(`effort:${effort}`);
  }
  if (ready) labels.push(LABELS.READY);
  if (parked) labels.push(LABELS.PARKED);
  if (priority !== undefined) {
    oneOf('priority', priority, PRIORITIES);
    labels.push(`priority:${priority}`);
  }
```

Replace with:

```js
function recordPayload({ title, body, type, origin, risk, effort, ceremony, ready, parked, priority, fingerprint } = {}) {
  if (typeof title !== 'string' || !title) {
    throw new Error(`title must be a non-empty string (got ${typeof title})`);
  }
  if (typeof body !== 'string') {
    throw new Error(`body must be a string (got ${typeof body})`);
  }
  oneOf('type', type, TYPES);

  if (ready && parked) {
    throw new Error('a record cannot be both ready and parked');
  }

  // Deterministic emission order: by:*, risk:*, effort:*, ceremony:*, ready, parked, priority:*.
  const labels = [];

  if (origin !== undefined) {
    oneOf('origin', origin, ORIGINS);
    labels.push(`by:${origin}`);
  }
  if (risk !== undefined) {
    oneOf('risk', risk, TIERS);
    labels.push(`risk:${risk}`);
  }
  if (effort !== undefined) {
    oneOf('effort', effort, TIERS);
    labels.push(`effort:${effort}`);
  }
  if (ceremony !== undefined) {
    oneOf('ceremony', ceremony, CEREMONY_TIERS);
    labels.push(`ceremony:${ceremony}`);
  }
  if (ready) labels.push(LABELS.READY);
  if (parked) labels.push(LABELS.PARKED);
  if (priority !== undefined) {
    oneOf('priority', priority, PRIORITIES);
    labels.push(`priority:${priority}`);
  }
```

- [ ] **Step 9: Run the tests to verify they pass**

```bash
node --test bin/lib/issues/tests/record.test.js
```

Expected: PASS for the four new tests. Some pre-existing `parseRecordFacets`-related tests may now fail — that's Steps 10-13 below, not a regression to chase down yet.

- [ ] **Step 10: Write the failing test for `parseRecordFacets`'s new `ceremony` facet**

Append to `bin/lib/issues/tests/record.test.js`:

```js
test('parseRecordFacets: ceremony:fast-lane sets facets.ceremony', () => {
  assert.strictEqual(parseRecordFacets(['ceremony:fast-lane']).ceremony, 'fast-lane');
});

test('parseRecordFacets: ceremony:standard sets facets.ceremony', () => {
  assert.strictEqual(parseRecordFacets(['ceremony:standard']).ceremony, 'standard');
});

test('parseRecordFacets: ceremony defaults to null when the label is absent', () => {
  assert.strictEqual(parseRecordFacets([]).ceremony, null);
});
```

- [ ] **Step 11: Run the tests to verify they fail**

```bash
node --test bin/lib/issues/tests/record.test.js
```

Expected: FAIL — `facets.ceremony` is `undefined`, not `'fast-lane'`/`'standard'`/`null`.

- [ ] **Step 12: Implement `ceremony` in `parseRecordFacets`**

Find:

```js
const BY_RE = /^by:(.+)$/;
const RISK_LABEL_RE = /^risk:(.+)$/;
const EFFORT_LABEL_RE = /^effort:(.+)$/;
const PRIORITY_LABEL_RE = /^priority:(.+)$/;
```

Replace with:

```js
const BY_RE = /^by:(.+)$/;
const RISK_LABEL_RE = /^risk:(.+)$/;
const EFFORT_LABEL_RE = /^effort:(.+)$/;
const PRIORITY_LABEL_RE = /^priority:(.+)$/;
const CEREMONY_LABEL_RE = /^ceremony:(.+)$/;
```

Find:

```js
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

Replace with:

```js
  const facets = {
    origin: null,
    risk: null,
    effort: null,
    ceremony: null,
    priority: null,
    stage: 'backlog',
    grants: { build: false, merge: false },
    bot: { inProgress: false, blocked: false },
    acceptance: null,
  };
```

Find:

```js
    const effort = EFFORT_LABEL_RE.exec(name);
    if (effort && TIERS.includes(effort[1])) {
      facets.effort = effort[1];
      continue;
    }
    const priority = PRIORITY_LABEL_RE.exec(name);
```

Replace with:

```js
    const effort = EFFORT_LABEL_RE.exec(name);
    if (effort && TIERS.includes(effort[1])) {
      facets.effort = effort[1];
      continue;
    }
    const ceremony = CEREMONY_LABEL_RE.exec(name);
    if (ceremony && CEREMONY_TIERS.includes(ceremony[1])) {
      facets.ceremony = ceremony[1];
      continue;
    }
    const priority = PRIORITY_LABEL_RE.exec(name);
```

- [ ] **Step 13: Fix the two now-broken full-literal `deepStrictEqual` tests**

Find:

```js
test('parseRecordFacets: by:capture + parked', () => {
  assert.deepStrictEqual(parseRecordFacets(['by:capture', 'parked']), {
    origin: 'capture', risk: null, effort: null, priority: null, stage: 'parked',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    acceptance: null,
  });
});
```

Replace with:

```js
test('parseRecordFacets: by:capture + parked', () => {
  assert.deepStrictEqual(parseRecordFacets(['by:capture', 'parked']), {
    origin: 'capture', risk: null, effort: null, ceremony: null, priority: null, stage: 'parked',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    acceptance: null,
  });
});
```

Find:

```js
test('parseRecordFacets: empty label list', () => {
  assert.deepStrictEqual(parseRecordFacets([]), {
    origin: null, risk: null, effort: null, priority: null, stage: 'backlog',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    acceptance: null,
  });
});
```

Replace with:

```js
test('parseRecordFacets: empty label list', () => {
  assert.deepStrictEqual(parseRecordFacets([]), {
    origin: null, risk: null, effort: null, ceremony: null, priority: null, stage: 'backlog',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    acceptance: null,
  });
});
```

- [ ] **Step 14: Run the full `record.test.js` suite to verify everything passes**

```bash
node --test bin/lib/issues/tests/record.test.js
```

Expected: PASS, all tests green (the Step 6 tests, the Step 10 tests, and the two fixed tests from Step 13).

- [ ] **Step 15: Commit**

```bash
git add bin/lib/issues/record.js bin/lib/issues/tests/record.test.js
git commit -m "Add ceremony support to record.js — recordPayload param + parseRecordFacets facet

recordPayload emits ceremony:{tier} in deterministic order (after
effort:*, before ready). parseRecordFacets gains facets.ceremony,
defaulting to null. Fixed two pre-existing full-literal deepStrictEqual
tests that assumed the old facets shape.
Consumed by /specify's leaf/parent creation (Task 4) and by
materialize.md/review-backlog (Tasks 6, 9)."
```

- [ ] **Step 16: Write the failing tests for `local-store.js`'s `ceremony` facet**

Find in `bin/lib/issues/tests/local-store.test.js`:

```js
function baseFacets(overrides) {
  return Object.assign({
    type: 'task', origin: null, risk: null, effort: null, priority: null,
    stage: 'backlog', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    parent: null, blockedBy: [], unsynced: false, acceptance: null, closed: false, closedAt: null,
  }, overrides);
}
```

Replace with:

```js
function baseFacets(overrides) {
  return Object.assign({
    type: 'task', origin: null, risk: null, effort: null, ceremony: null, priority: null,
    stage: 'backlog', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    parent: null, blockedBy: [], unsynced: false, acceptance: null, closed: false, closedAt: null,
  }, overrides);
}
```

Find:

```js
test('writeRecord then readRecord round-trips facets, id, slug, title, and body', (t) => {
  const dir = tmp(t);
  const filePath = path.join(dir, '14-bar.md');
  const facets = {
    type: 'feature', origin: 'capture', risk: 'medium', effort: 'low', priority: null,
    stage: 'parked', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    parent: 12, blockedBy: [12, 7], unsynced: true, acceptance: null, closed: false, closedAt: null,
  };

  writeRecord(filePath, { title: 'Bar', body: 'Current State…', facets });
  const record = readRecord(filePath);

  assert.deepStrictEqual(record.facets, facets);
```

Replace with:

```js
test('writeRecord then readRecord round-trips facets, id, slug, title, and body', (t) => {
  const dir = tmp(t);
  const filePath = path.join(dir, '14-bar.md');
  const facets = {
    type: 'feature', origin: 'capture', risk: 'medium', effort: 'low', ceremony: 'fast-lane', priority: null,
    stage: 'parked', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
    parent: 12, blockedBy: [12, 7], unsynced: true, acceptance: null, closed: false, closedAt: null,
  };

  writeRecord(filePath, { title: 'Bar', body: 'Current State…', facets });
  const record = readRecord(filePath);

  assert.deepStrictEqual(record.facets, facets);
```

Find:

```js
test('writeRecord omits default/absent frontmatter keys from the written file', (t) => {
  const dir = tmp(t);
  const filePath = path.join(dir, '1-min.md');
  writeRecord(filePath, {
    title: 'Min', body: 'b',
    facets: {
      type: 'task', origin: null, risk: null, effort: null, priority: null,
      stage: 'backlog', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
      parent: null, blockedBy: [], unsynced: false, acceptance: null, closed: false, closedAt: null,
    },
```

Replace with:

```js
test('writeRecord omits default/absent frontmatter keys from the written file', (t) => {
  const dir = tmp(t);
  const filePath = path.join(dir, '1-min.md');
  writeRecord(filePath, {
    title: 'Min', body: 'b',
    facets: {
      type: 'task', origin: null, risk: null, effort: null, ceremony: null, priority: null,
      stage: 'backlog', grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
      parent: null, blockedBy: [], unsynced: false, acceptance: null, closed: false, closedAt: null,
    },
```

Then append a dedicated round-trip test for the `ceremony` facet, near the other round-trip tests:

```js
test('writeRecord writes ceremony:{tier}, readRecord reads it back, and a null ceremony writes no line', (t) => {
  const dir = tmp(t);
  const withCeremony = path.join(dir, '1-a.md');
  writeRecord(withCeremony, { title: 'A', body: 'b', facets: baseFacets({ ceremony: 'standard' }) });
  const rawWith = fs.readFileSync(withCeremony, 'utf8');
  assert.ok(/^ceremony: standard$/m.test(rawWith));
  assert.strictEqual(readRecord(withCeremony).facets.ceremony, 'standard');

  const withoutCeremony = path.join(dir, '2-b.md');
  writeRecord(withoutCeremony, { title: 'B', body: 'b', facets: baseFacets() });
  const rawWithout = fs.readFileSync(withoutCeremony, 'utf8');
  assert.ok(!/^ceremony:/m.test(rawWithout));
  assert.strictEqual(readRecord(withoutCeremony).facets.ceremony, null);
});
```

- [ ] **Step 17: Run the tests to verify they fail**

```bash
node --test bin/lib/issues/tests/local-store.test.js
```

Expected: FAIL — `facets.ceremony` is `undefined` after round-tripping; the new dedicated test fails on the `ceremony: standard` assertion.

- [ ] **Step 18: Implement `ceremony` in `local-store.js`**

Find:

```js
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
    closed: false,
    closedAt: null,
  };
}
```

Replace with:

```js
function defaultFacets() {
  return {
    type: null,
    origin: null,
    risk: null,
    effort: null,
    ceremony: null,
    priority: null,
    stage: 'backlog',
    grants: { build: false, merge: false },
    bot: { inProgress: false, blocked: false },
    parent: null,
    blockedBy: [],
    unsynced: false,
    acceptance: null,
    closed: false,
    closedAt: null,
  };
}
```

Find:

```js
    if ((m = /^effort:\s*(.+)$/.exec(line))) { facets.effort = m[1].trim(); continue; }
    if ((m = /^priority:\s*(.+)$/.exec(line))) { facets.priority = m[1].trim(); continue; }
```

Replace with:

```js
    if ((m = /^effort:\s*(.+)$/.exec(line))) { facets.effort = m[1].trim(); continue; }
    if ((m = /^ceremony:\s*(.+)$/.exec(line))) { facets.ceremony = m[1].trim(); continue; }
    if ((m = /^priority:\s*(.+)$/.exec(line))) { facets.priority = m[1].trim(); continue; }
```

Find:

```js
  if (facets.effort) lines.push(`effort: ${facets.effort}`);
  if (facets.priority) lines.push(`priority: ${facets.priority}`);
```

Replace with:

```js
  if (facets.effort) lines.push(`effort: ${facets.effort}`);
  if (facets.ceremony) lines.push(`ceremony: ${facets.ceremony}`);
  if (facets.priority) lines.push(`priority: ${facets.priority}`);
```

- [ ] **Step 19: Run the tests to verify they pass**

```bash
node --test bin/lib/issues/tests/local-store.test.js
```

Expected: PASS, all tests green.

- [ ] **Step 20: Run the full repo test suite to confirm no other test assumed the old facets shape**

```bash
npm test 2>&1 | tail -20
```

Expected: same pass count as this plan's baseline (see the worktree-setup baseline run), modulo the one pre-existing documented-flaky `statusline.test.js` timing test — no new failures. If any other file's `deepStrictEqual` against a full facets literal now fails, fix it the same way Step 13 did (add `ceremony: null` to the literal) before proceeding.

- [ ] **Step 21: Commit**

```bash
git add bin/lib/issues/local-store.js bin/lib/issues/tests/local-store.test.js
git commit -m "Add ceremony facet to local-store.js — defaultFacets, parse, serialize

local-store.js maintains its own explicit facet whitelist (not a
generic pass-through), so ceremony needed its own additions here
distinct from record.js's parseRecordFacets. Consumed by /specify's
local-files write path (Tasks 3, 4)."
```

---

### Task 2: Relocate `ceremony-check`'s caller in `assess-agent-autonomy/SKILL.md`

**Files:**
- Modify: `skills/assess-agent-autonomy/SKILL.md`

**Interfaces:**
- Consumes: `bin/lib/issues/tier.js`'s `extractCeremony` (Task 1).
- Produces: an updated `ceremony-check` mode whose primary caller is `/specify`'s Step 3 (Task 3, Task 4), with `/flow` materialize.md (Task 6) as fallback-only.

- [ ] **Step 1: Update the call-site diagram**

Find:

```markdown
/claude-tweaks:triage Step 2          [ grant-check ]    -> RECOMMEND_BUILD / RECOMMEND_MERGE
/claude-tweaks:dispatch Auto-merge    [ merge-check ]    -> VERDICT: auto-merge | needs-human
/claude-tweaks:dispatch Settle        [ failure-check ]  -> CLASSIFICATION + NOTIFY_NOW
/claude-tweaks:flow materialize.md    [ ceremony-check ] -> CEREMONY: fast-lane | standard
```
```

Replace with:

```markdown
/claude-tweaks:triage Step 2          [ grant-check ]    -> RECOMMEND_BUILD / RECOMMEND_MERGE
/claude-tweaks:dispatch Auto-merge    [ merge-check ]    -> VERDICT: auto-merge | needs-human
/claude-tweaks:dispatch Settle        [ failure-check ]  -> CLASSIFICATION + NOTIFY_NOW
/claude-tweaks:specify Step 3         [ ceremony-check ] -> CEREMONY: fast-lane | standard
```
```

- [ ] **Step 2: Update "When to Use"**

Find:

```markdown
- `/claude-tweaks:flow`'s materialization step needs a ceremony-depth verdict for a record, so build
  and wrap-up know how much retrospective/documentation ceremony it deserves.
```

Replace with:

```markdown
- `/claude-tweaks:specify`'s Step 3 (Create the Records) needs a ceremony-depth verdict for a
  record, so `/specify` itself, `/claude-tweaks:review`, and `/claude-tweaks:wrap-up` all know how
  much fixed-cost ceremony it deserves. `/claude-tweaks:flow`'s materialize.md calls this mode only
  as a fallback, for a record that reaches `/flow` with no `ceremony:*` label at all.
```

- [ ] **Step 3: Update the `ceremony-check` mode's "Called from" line**

Find:

```markdown
## Mode: ceremony-check

**Called from:** `/claude-tweaks:flow`'s materialization step (`skills/flow/materialize.md`), once
per record, immediately alongside the existing `risk:`/`effort:` header-field population — every
record, every materialize, no pre-filtering to "borderline" records.
```

Replace with:

```markdown
## Mode: ceremony-check

**Called from:** `/claude-tweaks:specify`'s Step 3 (Create the Records) — both Shaping mode's
single-record path and decomposition mode's per-leaf loop (never the parent, which carries no
`risk:*`/`effort:*` scoring either) — immediately alongside the existing `risk:*`/`effort:*` label
stamping. Every leaf/single record, every `/specify` run, no pre-filtering to "borderline" records.

`/claude-tweaks:flow`'s materialize.md (`skills/flow/materialize.md`) calls this mode only as a
**fallback**, for a record that reaches `/flow` carrying no `ceremony:*` label at all — a legacy
hand-authored spec file, or a record created before this mode moved upstream. See
`docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md` for the full rationale.
```

- [ ] **Step 4: Update Step 1 (Gather)**

Find:

```markdown
### Step 1: Gather

Reuses the same record body/labels already fetched during materialize's Resolution step — no
separate fetch needed:

```bash
node -e "const {extractRiskEffort}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/tier.js');
  const d=require('/tmp/materialize-record-${N}.json');
  console.log(JSON.stringify(extractRiskEffort(d.labels)))"
```
```

Replace with:

```markdown
### Step 1: Gather

**Primary call, from `/specify`'s Step 3:** the record body (Current State/Deliverables/
Acceptance Criteria) and its `risk:*`/`effort:*` labels are already composed in memory for that
step's own create/edit call — no fetch at all, more direct than a re-fetch. Read them straight from
whatever local variable Step 3 already holds; there's nothing to shell out for.

**Fallback call, from `/flow`'s materialize.md:** only when a record reaches `/flow` carrying no
`ceremony:*` label. Reuses the same body/labels already fetched during materialize's Resolution
step:

```bash
node -e "const {extractRiskEffort}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/tier.js');
  const d=require('/tmp/materialize-record-${N}.json');
  console.log(JSON.stringify(extractRiskEffort(d.labels)))"
```
```

- [ ] **Step 5: Update Step 3 (Render)'s closing note**

Find:

```markdown
If nothing in the record's content clearly supports `fast-lane`, output `standard` — the same
conservative-on-ambiguity principle as this skill's other three modes (see Error Handling).
```

Replace with:

```markdown
If nothing in the record's content clearly supports `fast-lane`, output `standard` — the same
conservative-on-ambiguity principle as this skill's other three modes (see Error Handling).

**Persisting the verdict:** `/specify`'s Step 3 (the primary caller) stamps this verdict as an
explicit `ceremony:fast-lane`/`ceremony:standard` label — never omitted, unlike `risk:*`/
`effort:*`'s omit-when-unscored convention (this axis has no unscored state; every record gets a
verdict the first time it's shaped). `/flow`'s materialize.md fallback call uses the verdict only
for that run's own materialized header — it never writes a label back to the record.
```

- [ ] **Step 6: Update the Relationship table**

Find:

```markdown
| `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` | Design rationale and calibration examples for `ceremony-check` specifically, and for how `/claude-tweaks:flow`/`/claude-tweaks:build`/`/claude-tweaks:wrap-up` consume its verdict via the `ceremony-profile` lever. |
| `/claude-tweaks:flow` | Calls `ceremony-check` inline (not a fresh Task dispatch) once per record during materialization (`skills/flow/materialize.md`) — the verdict becomes that record's `ceremony:` header field, later folded into the `ceremony-profile` Manifesto lever. |
```

Replace with:

```markdown
| `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` | Original design rationale and calibration examples for `ceremony-check` and for how `/claude-tweaks:build`/`/claude-tweaks:wrap-up` consume the `ceremony-profile` lever — amended (not superseded) by the design doc below. |
| `docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md` | Relocates this mode's primary call site to `/claude-tweaks:specify` and promotes `ceremony:` to an always-explicit label; the rationale for why `/claude-tweaks:review` and `/claude-tweaks:specify`'s own Step 5 needed this moved upstream of materialize. |
| `/claude-tweaks:specify` | The primary caller — Step 3 (Create the Records) invokes `ceremony-check` inline once per record (Shaping mode's single record; decomposition mode's per leaf, never the parent) immediately alongside `risk:*`/`effort:*` stamping, and persists the verdict as an explicit `ceremony:*` label. Step 5 (Multi-Persona Red-Team) also reads the freshly-stamped label to decide persona count. |
| `/claude-tweaks:flow` | Calls `ceremony-check` inline (not a fresh Task dispatch) only as a **fallback**, for a record reaching materialization (`skills/flow/materialize.md`) with no `ceremony:*` label — the verdict populates that run's own materialized header field without writing a label back. |
```

- [ ] **Step 7: Self-review against the design doc**

Prose deliverable, no test cycle. Re-read
`docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md`'s "Relocating
`ceremony-check` into `/specify`" and "Amendment to the fast-lane-pipeline-profile design"
sections and confirm:

- The "Called from" line names `/specify`'s Step 3 as primary, `/flow` materialize as fallback —
  not the reverse.
- No mention anywhere in this file still claims the header field is omit-when-standard.
- No `TBD`/`TODO`/placeholder text anywhere in the edited sections.

Fix any drift found inline.

- [ ] **Step 8: Commit**

```bash
git add skills/assess-agent-autonomy/SKILL.md
git commit -m "Relocate ceremony-check's primary caller from flow to specify

Called from /specify's Step 3 now (both shaping and decomposition
paths); /flow materialize.md keeps only a fallback call, for records
that never went through the new step. Verdict persistence moves to
an explicit label — /specify's own edit lands in Tasks 3/4."
```

---

### Task 3: Wire `ceremony-check` + label stamp into `/specify`'s Shaping mode

**Files:**
- Modify: `skills/specify/SKILL.md`

**Interfaces:**
- Consumes: `/claude-tweaks:assess-agent-autonomy`'s `ceremony-check` mode (Task 2); `bin/lib/issues/local-store.js`'s `ceremony` facet (Task 1, for the local-files path).
- Produces: an always-explicit `ceremony:*` label on every record Shaping mode touches.

- [ ] **Step 1: Add the `ceremony-check` bullet to "Stamp scoring and stage labels"**

Find:

```markdown
- **`risk:*` absent** — judge low/medium/high from the now-shaped Deliverables and Acceptance Criteria (blast radius, reversibility), per `_shared/work-record.md`'s Scoring axis, then stamp it.
- **`effort:*` absent** — judge low/medium/high the same way (estimated size), then stamp it.
- **Type absent** — judge `bug | feature | task` from the now-shaped content (defect vs. new capability vs. maintenance/refactor/docs/chore), per `_shared/work-record.md`'s Type axis, then stamp it: `work-backend: github-issues` — `work-types: native` applies the native Issue Type (`--type {t}` on the edit call below); `work-types: labels` adds the matching label instead (`--add-label "type:{t}"`, pair lives in `record.js`'s `TYPE_LABELS` — bootstrap it first per `_shared/label-bootstrap.md`, as decomposition mode does). `work-backend: local-files` — set `facets.type` in the `writeRecord` call below.
```

Replace with:

```markdown
- **`risk:*` absent** — judge low/medium/high from the now-shaped Deliverables and Acceptance Criteria (blast radius, reversibility), per `_shared/work-record.md`'s Scoring axis, then stamp it.
- **`effort:*` absent** — judge low/medium/high the same way (estimated size), then stamp it.
- **`ceremony:*` absent** — invoke `/claude-tweaks:assess-agent-autonomy` in `ceremony-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check #{n}")`) against the now-shaped body — the same input a fresh fetch would use, but already in memory here. Stamp the verdict as an explicit label, `ceremony:fast-lane` or `ceremony:standard` — never omit it, unlike `risk:*`/`effort:*`'s omit-when-unscored convention (this axis has no unscored state; every record gets a verdict the first time it's shaped). Bootstrap both label values per `_shared/label-bootstrap.md` before the first write, same as any new label pair.
- **Type absent** — judge `bug | feature | task` from the now-shaped content (defect vs. new capability vs. maintenance/refactor/docs/chore), per `_shared/work-record.md`'s Type axis, then stamp it: `work-backend: github-issues` — `work-types: native` applies the native Issue Type (`--type {t}` on the edit call below); `work-types: labels` adds the matching label instead (`--add-label "type:{t}"`, pair lives in `record.js`'s `TYPE_LABELS` — bootstrap it first per `_shared/label-bootstrap.md`, as decomposition mode does). `work-backend: local-files` — set `facets.type` in the `writeRecord` call below.
```

- [ ] **Step 2: Update the `work-backend: github-issues` write call**

Find:

```markdown
```bash
gh issue edit {n} \
  --body-file /tmp/specify-shaped-body.md \
  --add-label ready \
  --add-label "risk:{tier}" \
  --add-label "effort:{tier}" \
  --type {t} \
  --remove-label parked
```

Omit `--add-label "risk:{tier}"` / `--add-label "effort:{tier}"` for whichever family was already stamped; omit `--type {t}` (or the `--add-label "type:{t}"` swap) when Type was already present; omit `--remove-label parked` when the record never carried it.
```

Replace with:

```markdown
```bash
gh issue edit {n} \
  --body-file /tmp/specify-shaped-body.md \
  --add-label ready \
  --add-label "risk:{tier}" \
  --add-label "effort:{tier}" \
  --add-label "ceremony:{tier}" \
  --type {t} \
  --remove-label parked
```

Omit `--add-label "risk:{tier}"` / `--add-label "effort:{tier}"` / `--add-label "ceremony:{tier}"` for whichever family was already stamped; omit `--type {t}` (or the `--add-label "type:{t}"` swap) when Type was already present; omit `--remove-label parked` when the record never carried it.
```

- [ ] **Step 3: Update the `work-backend: local-files` write call's prose**

Find:

```markdown
**`work-backend: local-files`:** one `writeRecord` call does the same job, setting `facets.stage: 'ready'` (which supersedes any prior `'parked'` value — the two are mutually exclusive states) and filling `facets.risk`/`facets.effort`/`facets.type` when they were `null`:
```

Replace with:

```markdown
**`work-backend: local-files`:** one `writeRecord` call does the same job, setting `facets.stage: 'ready'` (which supersedes any prior `'parked'` value — the two are mutually exclusive states) and filling `facets.risk`/`facets.effort`/`facets.ceremony`/`facets.type` when they were `null` (`facets.ceremony` always gets a value the first time a record is shaped — no null/unscored state for this axis, unlike `risk`/`effort`):
```

- [ ] **Step 4: Self-review against the design doc**

Prose deliverable, no test cycle. Confirm:

- The `ceremony:*` label is stamped in the same conditional style as `risk:*`/`effort:*` ("absent —
  judge, then stamp") but explicitly never has an "already stamped, skip" branch that would leave a
  record permanently un-judged.
- Both the github-issues and local-files write paths were updated.
- No `TBD`/`TODO`/placeholder text anywhere in the edited sections.

Fix any drift found inline.

- [ ] **Step 5: Commit**

```bash
git add skills/specify/SKILL.md
git commit -m "Wire ceremony-check into /specify's Shaping mode

Stamps ceremony:fast-lane/ceremony:standard alongside risk:*/effort:*
on every record Shaping mode touches, on both work-backend paths."
```

---

### Task 4: Wire `ceremony-check` + label stamp into `/specify`'s Step 3 decomposition mode

**Files:**
- Modify: `skills/specify/SKILL.md`

**Interfaces:**
- Consumes: `bin/lib/issues/record.js`'s `recordPayload({..., ceremony})` (Task 1); `/claude-tweaks:assess-agent-autonomy`'s `ceremony-check` mode (Task 2).
- Produces: an always-explicit `ceremony:*` label on every leaf record (never the parent).

- [ ] **Step 1: Add the "Ceremony" paragraph after "Scoring"**

Find:

```markdown
**Scoring** — judge each leaf's `risk` and `effort` (low/medium/high each) from its own Deliverables and Acceptance Criteria — blast radius and reversibility for `risk`, estimated size and file spread for `effort` — per `_shared/work-record.md`'s Scoring axis. This is the same judgment Shaping mode's stamping step applies to a single record, run here once per leaf; the tiers become `$LEAF_RISK`/`$LEAF_EFFORT` below.
```

Replace with:

```markdown
**Scoring** — judge each leaf's `risk` and `effort` (low/medium/high each) from its own Deliverables and Acceptance Criteria — blast radius and reversibility for `risk`, estimated size and file spread for `effort` — per `_shared/work-record.md`'s Scoring axis. This is the same judgment Shaping mode's stamping step applies to a single record, run here once per leaf; the tiers become `$LEAF_RISK`/`$LEAF_EFFORT` below.

**Ceremony** — invoke `/claude-tweaks:assess-agent-autonomy` in `ceremony-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check")`) against this leaf's own composed body — never the parent, which carries no `ceremony:*` label either, mirroring the no-risk/effort-on-parents rule above. The verdict (always explicit — no unscored state for this axis) becomes `$LEAF_CEREMONY` below.
```

- [ ] **Step 2: Update the `recordPayload` call to pass `ceremony`**

Find:

```markdown
```bash
node -e "const {recordPayload}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
  const p=recordPayload({
    title: process.argv[1], body: process.argv[2], type: process.argv[3],
    risk: process.argv[4], effort: process.argv[5], ready: true,
    fingerprint: process.argv[6]
  });
  require('fs').writeFileSync('/tmp/specify-leaf-payload.json', JSON.stringify(p))" \
  "$LEAF_TITLE" "$LEAF_BODY" "$LEAF_TYPE" "$LEAF_RISK" "$LEAF_EFFORT" "${DESIGN_DOC_SLUG}:${UNIT_SLUG}"
```
```

Replace with:

```markdown
```bash
node -e "const {recordPayload}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
  const p=recordPayload({
    title: process.argv[1], body: process.argv[2], type: process.argv[3],
    risk: process.argv[4], effort: process.argv[5], ceremony: process.argv[6], ready: true,
    fingerprint: process.argv[7]
  });
  require('fs').writeFileSync('/tmp/specify-leaf-payload.json', JSON.stringify(p))" \
  "$LEAF_TITLE" "$LEAF_BODY" "$LEAF_TYPE" "$LEAF_RISK" "$LEAF_EFFORT" "$LEAF_CEREMONY" "${DESIGN_DOC_SLUG}:${UNIT_SLUG}"
```
```

- [ ] **Step 3: Update the bootstrap note and the github-issues create calls**

Find:

```markdown
Bootstrap the labels this run is about to apply before the first create (per `_shared/label-bootstrap.md`): `ready` plus every `risk:{tier}`/`effort:{tier}` pair in use — and, under `work-types: labels`, the `type:{t}` pairs from `record.js`'s `TYPE_LABELS`, as with the parent.

**`work-backend: github-issues`** — same Type expression branch as the parent. The three `--label` flags are exactly the payload's `.labels`: `recordPayload` emitted `risk:{tier}`, `effort:{tier}`, `ready` and nothing else, because no `origin` was passed — a decomposition is human-shaped work, not a health-skill filing, so leaves carry no `by:*` label:

```bash
# work-types: native
LEAF_URL=$(gh issue create --title "$LEAF_TITLE" --body-file /tmp/specify-leaf-body.md \
  --type "$LEAF_TYPE" \
  --label "risk:$LEAF_RISK" --label "effort:$LEAF_EFFORT" --label ready)

# work-types: labels
LEAF_URL=$(gh issue create --title "$LEAF_TITLE" --body-file /tmp/specify-leaf-body.md \
  --label "risk:$LEAF_RISK" --label "effort:$LEAF_EFFORT" --label ready \
  --label "type:$LEAF_TYPE")

LEAF_NUM=$(basename "$LEAF_URL")
```
```

Replace with:

```markdown
Bootstrap the labels this run is about to apply before the first create (per `_shared/label-bootstrap.md`): `ready` plus every `risk:{tier}`/`effort:{tier}`/`ceremony:{tier}` pair in use — and, under `work-types: labels`, the `type:{t}` pairs from `record.js`'s `TYPE_LABELS`, as with the parent.

**`work-backend: github-issues`** — same Type expression branch as the parent. The four `--label` flags are exactly the payload's `.labels`: `recordPayload` emitted `risk:{tier}`, `effort:{tier}`, `ceremony:{tier}`, `ready` and nothing else, because no `origin` was passed — a decomposition is human-shaped work, not a health-skill filing, so leaves carry no `by:*` label:

```bash
# work-types: native
LEAF_URL=$(gh issue create --title "$LEAF_TITLE" --body-file /tmp/specify-leaf-body.md \
  --type "$LEAF_TYPE" \
  --label "risk:$LEAF_RISK" --label "effort:$LEAF_EFFORT" --label "ceremony:$LEAF_CEREMONY" --label ready)

# work-types: labels
LEAF_URL=$(gh issue create --title "$LEAF_TITLE" --body-file /tmp/specify-leaf-body.md \
  --label "risk:$LEAF_RISK" --label "effort:$LEAF_EFFORT" --label "ceremony:$LEAF_CEREMONY" --label ready \
  --label "type:$LEAF_TYPE")

LEAF_NUM=$(basename "$LEAF_URL")
```
```

- [ ] **Step 4: Update the local-files create call**

Find:

```markdown
```bash
LEAF_ID=$(node -e "const {writeRecord, allocateId}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
  const id = allocateId('specs');
  const body = require('fs').readFileSync('/tmp/specify-leaf-body.md', 'utf8');
  writeRecord(\`specs/\${id}-\${process.argv[1]}.md\`, {
    title: process.argv[2],
    body,
    facets: { type: process.argv[3], risk: process.argv[4], effort: process.argv[5], stage: 'ready' }
  });
  console.log(id)" "$UNIT_SLUG" "$LEAF_TITLE" "$LEAF_TYPE" "$LEAF_RISK" "$LEAF_EFFORT")
```
```

Replace with:

```markdown
```bash
LEAF_ID=$(node -e "const {writeRecord, allocateId}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
  const id = allocateId('specs');
  const body = require('fs').readFileSync('/tmp/specify-leaf-body.md', 'utf8');
  writeRecord(\`specs/\${id}-\${process.argv[1]}.md\`, {
    title: process.argv[2],
    body,
    facets: { type: process.argv[3], risk: process.argv[4], effort: process.argv[5], ceremony: process.argv[6], stage: 'ready' }
  });
  console.log(id)" "$UNIT_SLUG" "$LEAF_TITLE" "$LEAF_TYPE" "$LEAF_RISK" "$LEAF_EFFORT" "$LEAF_CEREMONY")
```
```

- [ ] **Step 5: Self-review against the design doc**

Prose deliverable, no test cycle. Confirm:

- The parent-creation code above this section is untouched — parents never get a `ceremony:*`
  label, matching the design doc's "never runs on parent records" constraint.
- `$LEAF_CEREMONY` is threaded consistently through the payload call, the bootstrap note, both
  github-issues create variants, and the local-files call.
- No `TBD`/`TODO`/placeholder text anywhere in the edited sections.

Fix any drift found inline.

- [ ] **Step 6: Commit**

```bash
git add skills/specify/SKILL.md
git commit -m "Wire ceremony-check into /specify's Step 3 decomposition-mode leaf loop

Stamps ceremony:fast-lane/ceremony:standard on every leaf (never the
parent), threaded through recordPayload's new ceremony param on both
work-backend paths."
```

---

### Task 5: Persona-count-by-tier in `/specify`'s Step 5 Red-Team

**Files:**
- Modify: `skills/specify/SKILL.md`
- Modify: `skills/specify/red-team.md`

**Interfaces:**
- Consumes: the `ceremony:*` label stamped on each leaf by Task 4.
- Produces: one-persona dispatch (Skeptical Reviewer only) for `ceremony:fast-lane` leaves; unchanged three-persona dispatch for `ceremony:standard`.

- [ ] **Step 1: Update Step 5's intro paragraph in `SKILL.md`**

Find:

```markdown
## Step 5: Multi-Persona Red-Team

Before deleting the design doc, dispatch three persona-instantiated agents (Implementer / Maintainer / Skeptical Reviewer) in one parallel batch per leaf record — not the parent, which is never built directly — to surface ambiguities, gaps, and unstated assumptions. Each agent's input is a record reference, never inlined content: `work-backend: github-issues` — the leaf's number plus a `gh issue view` read instruction; `work-backend: local-files` — the leaf's record file path. Never both in the same dispatch. Findings are written **back into the record body** — inline `<!-- ambiguity: ... -->` HTML comments next to flagged sentences, or rows in an appended `## Open Questions` table — via compose-then-write-once, the same discipline every write in this skill uses. No mid-flow prompt — Step 6 Self-Review picks them up.

Read `red-team.md` in this skill's directory for the dispatch prompt (Template A block must remain inlined verbatim in the dispatch prompt at runtime per the Subagent Contract), the three persona lens questions, and the write-back procedure.
```

Replace with:

```markdown
## Step 5: Multi-Persona Red-Team

Before deleting the design doc, dispatch persona-instantiated agents in one parallel batch per leaf record — not the parent, which is never built directly — to surface ambiguities, gaps, and unstated assumptions. **Persona count depends on the leaf's own `ceremony:*` label** (stamped in Step 3): `ceremony:fast-lane` dispatches **one** persona (Skeptical Reviewer only); `ceremony:standard` dispatches all **three** (Implementer / Maintainer / Skeptical Reviewer), unchanged from before. See `red-team.md` for which persona(s) to dispatch for each tier.

Each agent's input is a record reference, never inlined content: `work-backend: github-issues` — the leaf's number plus a `gh issue view` read instruction; `work-backend: local-files` — the leaf's record file path. Never both in the same dispatch. Findings are written **back into the record body** — inline `<!-- ambiguity: ... -->` HTML comments next to flagged sentences, or rows in an appended `## Open Questions` table — via compose-then-write-once, the same discipline every write in this skill uses. No mid-flow prompt — Step 6 Self-Review picks them up.

Read `red-team.md` in this skill's directory for the dispatch prompt (Template A block must remain inlined verbatim in the dispatch prompt at runtime per the Subagent Contract), the persona lens questions, and the write-back procedure.
```

- [ ] **Step 2: Update the "Parallel dispatch" section in `red-team.md`**

Find:

```markdown
## Parallel dispatch

> **Parallel execution:** Dispatch the three personas as parallel Task agents — each runs independently and returns Template-A findings narrowed to ambiguities, gaps, and unstated assumptions. Assemble results after all agents complete.
```

Replace with:

```markdown
## Parallel dispatch

**Persona selection by tier** (`ceremony:*` label, stamped on the leaf in Step 3 — see
`docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md`): `ceremony:fast-lane` →
dispatch **Skeptical Reviewer only**; `ceremony:standard` (or a leaf with no `ceremony:*` label at
all — treat as `standard`, the conservative default) → dispatch all **three** personas below,
unchanged from before.

> **Parallel execution:** Dispatch the selected persona(s) as parallel Task agents (a single agent
> for `fast-lane`, three for `standard`) — each runs independently and returns Template-A findings
> narrowed to ambiguities, gaps, and unstated assumptions. Assemble results after all agents
> complete.
```

- [ ] **Step 3: Update the write-back procedure's closing note**

Find:

```markdown
Red-team runs on every generated leaf record regardless of `Surface:` — the lens questions are artefact-agnostic. The user (or Step 6 Self-Review) decides what to do with each finding. There is no mid-flow stop here.
```

Replace with:

```markdown
Red-team runs on every generated leaf record regardless of `Surface:` — the lens questions are artefact-agnostic. The user (or Step 6 Self-Review) decides what to do with each finding. There is no mid-flow stop here. Persona count varies by tier (see above); the write-back procedure itself is identical regardless of how many personas ran.
```

- [ ] **Step 4: Self-review against the design doc**

Prose deliverable, no test cycle. Confirm:

- `fast-lane` dispatches exactly Skeptical Reviewer, matching the design doc's stated rationale
  ("the one most likely to catch a wrong-fix risk") — not Implementer or Maintainer alone.
- A leaf with a missing `ceremony:*` label (shouldn't happen after Task 4, but as a defensive
  read) falls back to `standard`'s three-persona dispatch, matching this codebase's
  conservative-on-ambiguity convention.
- No `TBD`/`TODO`/placeholder text anywhere in the edited sections.

Fix any drift found inline.

- [ ] **Step 5: Commit**

```bash
git add skills/specify/SKILL.md skills/specify/red-team.md
git commit -m "Scale Step 5's red-team persona count by ceremony tier

fast-lane leaves get one persona (Skeptical Reviewer); standard leaves
keep all three, unchanged. Cuts the heaviest remaining fixed-cost step
for a trivial leaf to roughly a third."
```

---

### Task 6: Update `/flow`'s `materialize.md` to read the label, fallback only

**Files:**
- Modify: `skills/flow/materialize.md`

**Interfaces:**
- Consumes: `facets.ceremony` from `parseRecordFacets`/`readRecord` (Task 1), already fetched during Resolution; falls back to `/claude-tweaks:assess-agent-autonomy`'s `ceremony-check` mode (Task 2).

- [ ] **Step 1: Update the pinned header format's `ceremony` line**

Find:

```markdown
ceremony: fast-lane                # omitted when standard — see ceremony-check mode below
```

Replace with:

```markdown
ceremony: {fast-lane|standard}      # always present — see ceremony-check mode below
```

- [ ] **Step 2: Update the "Populating the header" intro sentence**

Find:

```markdown
Every field except `surface`/`design-intent` (next section), `ceremony` (below), and `blocked-by` under `work-links: native` (one extra read — see its bullet below) comes straight off data already fetched during Resolution — nothing extra to read:
```

Replace with:

```markdown
Every field except `surface`/`design-intent` (next section) and `blocked-by` under `work-links: native` (one extra read — see its bullet below) comes straight off data already fetched during Resolution — nothing extra to read. `ceremony` is usually also free (`facets.ceremony`, from the label `/claude-tweaks:specify` already stamped) — see its own bullet below for the fallback case:
```

- [ ] **Step 3: Update the `ceremony` bullet**

Find:

```markdown
- `ceremony` — invoke `/claude-tweaks:assess-agent-autonomy` in `ceremony-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check #{n}")`), once per record, using the same body/labels already fetched during Resolution. Its `CEREMONY` output becomes this field verbatim; omit the line when the verdict is `standard` (mirrors `risk`/`effort`'s omit-when-unscored convention). See `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` for the full mode contract.
```

Replace with:

```markdown
- `ceremony` — `facets.ceremony` (the `ceremony:fast-lane`/`ceremony:standard` label `/claude-tweaks:specify` already stamped on every record it shapes). Always emit this line explicitly — never omit it, unlike every other optional field here. **Fallback only:** when `facets.ceremony` is `null` (the record reached `/flow` without ever going through `/specify`'s Step 3 — a legacy hand-authored spec file, or a record created before this behavior shipped), invoke `/claude-tweaks:assess-agent-autonomy` in `ceremony-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check #{n}")`) using the same body/labels already fetched during Resolution, and use its `CEREMONY` output for this run's header only — do not write a label back to the record; `/specify` remains the sole owner of `ceremony:*`. See `docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md` for the full rationale, and `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` for the mode's original contract.
```

- [ ] **Step 4: Update the "exceptions" closing line**

Find:

```markdown
`surface` / `design-intent` / `ceremony` are the exceptions — `surface`/`design-intent` via the lift rule below, `ceremony` via the invocation above. `blocked-by` is a partial exception: free under `work-links: body-text`/`local-files`, one extra read under `work-links: native` — see its bullet above.
```

Replace with:

```markdown
`surface` / `design-intent` are the exceptions — via the lift rule below. `ceremony` is a partial exception, the same shape as `blocked-by`: free from Resolution's already-fetched facets in the common case, one extra invocation only in the fallback case above. `blocked-by` is a partial exception too: free under `work-links: body-text`/`local-files`, one extra read under `work-links: native` — see its bullet above.
```

- [ ] **Step 5: Verify no other file assumed the old omit-when-standard convention**

```bash
grep -rn "ceremony.*omitted when standard\|omit.*ceremony" skills/ --include="*.md"
```

Expected: no output. If this returns a hit outside `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` (which is intentionally left as historical record, per the design doc's Amendment section), fix that file too before committing.

- [ ] **Step 6: Self-review against the design doc**

Prose deliverable, no test cycle. Confirm:

- The pinned header example line now shows `{fast-lane|standard}` — matching `risk`/`effort`'s own
  `{low|medium|high}` placeholder style — not a single hardcoded example value.
- The fallback path explicitly states it does not write a label back.
- No `TBD`/`TODO`/placeholder text anywhere in the edited sections.

Fix any drift found inline.

- [ ] **Step 7: Commit**

```bash
git add skills/flow/materialize.md
git commit -m "Read ceremony:* label in materialize.md; fall back to ceremony-check only when absent

The label is now always explicit and usually already free from
Resolution's parsed facets — materialize only invokes ceremony-check
itself for a record that never went through /specify's new Step 3."
```

---

### Task 7: Update `/flow`'s `manifesto.md` preview-table wording

**Files:**
- Modify: `skills/flow/manifesto.md`

**Interfaces:**
- Consumes: nothing new — the bundle-fold-AND logic and the `ceremony-profile` lever are unchanged.

- [ ] **Step 1: Update the per-spec preview derivation table's Ceremony row**

Find:

```markdown
| Ceremony | Materialized header `ceremony:` (`materialize.md`) — omitted means `standard` | `fast-lane` if header present; else `standard` |
```

Replace with:

```markdown
| Ceremony | Materialized header `ceremony:` (`materialize.md`) — always present | Read directly (`fast-lane` or `standard`) |
```

- [ ] **Step 2: Self-review against the design doc**

Prose deliverable, no test cycle. Confirm this is the only wording drift in `manifesto.md` — the
bundle-fold-AND paragraph itself ("Ceremony profile computation") already describes folding
`ceremony:` values with AND and doesn't reference the old omit-on-default convention anywhere, so
it needs no edit. Verify by re-reading that paragraph directly rather than assuming.

- [ ] **Step 3: Commit**

```bash
git add skills/flow/manifesto.md
git commit -m "Update manifesto.md's Ceremony preview-table wording for the now-explicit label

Mechanical bundle-fold-AND logic is unchanged — only the derivation
cell's description of how the value is read."
```

---

### Task 8: Ceremony-aware step selection in `/review`

**Files:**
- Modify: `skills/review/SKILL.md`, `skills/review/review-summary-template.md`

**Interfaces:**
- Consumes: `config.yml`'s `ceremony-profile` lever (unchanged plumbing from the original fast-lane design), read the same way `/wrap-up`'s Step 3 already does.
- Produces: Steps 1, 1.6, and 4 skip under `ceremony-profile: fast-lane`; Steps 2, 3, 5 unaffected.

- [ ] **Step 1: Add a new "Ceremony-Aware Step Selection" subsection**

Find:

```markdown
This skill is the analytical quality gate — spec compliance, human-judgment code review, and quality summary. Visual browser inspection is handled by `/claude-tweaks:visual-review`. Mechanical verification lives in `/claude-tweaks:test`.

## Review Modes
```

Replace with:

```markdown
This skill is the analytical quality gate — spec compliance, human-judgment code review, and quality summary. Visual browser inspection is handled by `/claude-tweaks:visual-review`. Mechanical verification lives in `/claude-tweaks:test`.

## Ceremony-Aware Step Selection

When a pipeline run directory exists, read `config.yml`'s `ceremony-profile`. Under `fast-lane`,
Steps 1 (Spec Compliance Check), 1.6 (Cross-Spec Promise Check), and 4 (Implementation Hindsight)
are skipped — each is exact per-record overhead independent of diff size, the same shape of
fixed-cost wrapper `ceremony-profile: fast-lane` already trims in `/claude-tweaks:build` and
`/claude-tweaks:wrap-up`. Steps 2, 3 (the actual code-quality read of the diff), and 5 run
unchanged regardless of tier — Step 3 is the safety-relevant judgment this whole scheme protects,
and Step 5 already scopes to `git diff --name-only` only, with no "look beyond the diff" behavior
to cap. Standalone review (no pipeline run directory) always runs every step, matching
`/claude-tweaks:reflect`/`/claude-tweaks:wrap-up`'s own standalone-defaults-to-full rule. A Review
finding at any severity still triggers the existing ceremony escape hatch
(`/claude-tweaks:wrap-up`'s Step 3.5 downgrades `ceremony-profile` to `standard` for the rest of
the run) — unchanged. See
`docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md` for the full rationale.

## Review Modes
```

- [ ] **Step 2: Add the skip check to Step 1**

Find:

```markdown
## Step 1: Spec Compliance Check (spec-based only)

If a spec number was provided, read the spec file and verify the implementation meets it:
```

Replace with:

```markdown
## Step 1: Spec Compliance Check (spec-based only)

Skip this step entirely under `ceremony-profile: fast-lane` (see "Ceremony-Aware Step Selection"
above) — proceed directly to Step 1.5.

If a spec number was provided, read the spec file and verify the implementation meets it:
```

- [ ] **Step 3: Fold the skip condition into Step 1.6's existing skip bullet**

Find:

```markdown
## Step 1.6: Cross-Spec Promise Check (parent-linked records only)

Skip silently when this record has no resolvable parent, or its parent has no `## Cross-Spec
Promises` section (`_shared/work-record.md`) — most records. This step never blocks the review;
it only updates the parent record and, when relevant, notes something in the Step 7 summary.
```

Replace with:

```markdown
## Step 1.6: Cross-Spec Promise Check (parent-linked records only)

Skip entirely under `ceremony-profile: fast-lane` (see "Ceremony-Aware Step Selection" above).
Otherwise, skip silently when this record has no resolvable parent, or its parent has no
`## Cross-Spec Promises` section (`_shared/work-record.md`) — most records. This step never blocks
the review; it only updates the parent record and, when relevant, notes something in the Step 7
summary.
```

- [ ] **Step 4: Add the skip check to Step 4**

Find:

```markdown
## Step 4: Implementation Hindsight (Decision Point)

Run `/claude-tweaks:reflect` in **hindsight** mode. Pass:
```

Replace with:

```markdown
## Step 4: Implementation Hindsight (Decision Point)

Skip this step entirely under `ceremony-profile: fast-lane` (see "Ceremony-Aware Step Selection"
above) — proceed directly to Step 5.

Run `/claude-tweaks:reflect` in **hindsight** mode. Pass:
```

- [ ] **Step 5: Note the skip in `review-summary-template.md`**

Find:

```markdown
### Spec Compliance (spec-based only)
| Deliverable | Status |
|-------------|--------|
| {deliverable} | {done/partial/missing} |

| Acceptance Criterion | Status |
|---------------------|--------|
| {criterion} | {met/partially met/not met} |
(or: No spec — file/commit-based review.)
```

Replace with:

```markdown
### Spec Compliance (spec-based only)
| Deliverable | Status |
|-------------|--------|
| {deliverable} | {done/partial/missing} |

| Acceptance Criterion | Status |
|---------------------|--------|
| {criterion} | {met/partially met/not met} |
(or: No spec — file/commit-based review.)
(or, when skipped: "Skipped — ceremony-profile: fast-lane.")
```

Find:

```markdown
### Implementation Hindsight
- {finding} → {change now / capture / accept as-is — not an improvement because {reason}}
(or: No changes needed — approach is sound.)
```

Replace with:

```markdown
### Implementation Hindsight
- {finding} → {change now / capture / accept as-is — not an improvement because {reason}}
(or: No changes needed — approach is sound.)
(or, when skipped: "Skipped — ceremony-profile: fast-lane.")
```

- [ ] **Step 6: Update the Relationship table's `/claude-tweaks:flow` row**

Find:

```markdown
| `/claude-tweaks:flow` | Invokes /review in **full** mode by default (code + visual). Flow handles browser detection and falls back to code mode when no browser backend is available. |
```

Replace with:

```markdown
| `/claude-tweaks:flow` | Invokes /review in **full** mode by default (code + visual). Flow handles browser detection and falls back to code mode when no browser backend is available. Within either mode, Steps 1/1.6/4 additionally skip when the run's `ceremony-profile` is `fast-lane` — see "Ceremony-Aware Step Selection". |
```

- [ ] **Step 7: Add a Relationship table row for the design doc**

Find:

```markdown
| `/claude-tweaks:visualize` | Lens 3i-diagram emits "Visual documentation gap" informational findings when the diff added structural complexity (state machine, data model, multi-actor flow, architecture) but no matching diagram file exists. Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 11). |
```

Replace with:

```markdown
| `/claude-tweaks:visualize` | Lens 3i-diagram emits "Visual documentation gap" informational findings when the diff added structural complexity (state machine, data model, multi-actor flow, architecture) but no matching diagram file exists. Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 11). |
| `docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md` | Design rationale for which steps are fixed-cost wrapper (Steps 1, 1.6, 4 — skipped under `fast-lane`) vs. safety-relevant judgment (Step 3, never skipped). |
```

- [ ] **Step 8: Self-review against the design doc**

Prose deliverable, no test cycle. Confirm:

- Steps 2, 3, 5, 6, 6.5, 7 have no skip check added — only 1, 1.6, 4 do.
- The new subsection's wording matches `/claude-tweaks:wrap-up`'s existing "When a pipeline run
  directory exists, read `config.yml`'s `ceremony-profile`" phrasing style, for consistency across
  the codebase.
- `review-summary-template.md`'s two new `(or, when skipped: ...)` fallback lines render only when
  Steps 1/4 were actually skipped — never alongside the real content lines above them.
- No `TBD`/`TODO`/placeholder text anywhere in the edited sections.

Fix any drift found inline.

- [ ] **Step 9: Commit**

```bash
git add skills/review/SKILL.md skills/review/review-summary-template.md
git commit -m "Add ceremony-aware step skipping to /review

Steps 1 (spec-compliance), 1.6 (cross-spec-promise), and 4 (hindsight)
skip under ceremony-profile: fast-lane — fixed-cost wrapper steps,
mirroring the pattern already established in /build and /wrap-up.
Step 3 (the actual diff read) is deliberately never touched. Summary
template notes the skip rather than rendering an empty section."
```

---

### Task 9: `Suggested tier` column in `/review-backlog`

**Files:**
- Modify: `skills/review-backlog/SKILL.md`

**Interfaces:**
- Consumes: `facets.ceremony` from `parseRecordFacets` (Task 1), already present in Step 1's fetched data for scored records.

- [ ] **Step 1: Note the mechanical display for scored records, in Step 2's routing prose**

Find:

```markdown
**`risk-value`** — render `.riskValue.ranked` as the primary ranked table, then `.riskValue.unscored` as a trailing "not yet scored" group. Skip to Next Actions.
```

Replace with:

```markdown
**`risk-value`** — render `.riskValue.ranked` as the primary ranked table, then `.riskValue.unscored` as a trailing "not yet scored" group. Add a `Tier` column reading `facets.ceremony` directly (`fast-lane`/`standard`) for every scored row — free, mechanical, already present from Step 1's fetch; no LLM judgment involved. Skip to Next Actions.
```

- [ ] **Step 2: Add the non-binding advisory guess to Step 3's bare-mode synthesis output**

Find:

```markdown
Fetch bodies only for `selected` (github: `gh issue view {n} --json body`, one per record; local-files: bodies are already present from Step 1's `queryRecords`). Read every selected body in one pass and produce:

- A narrative summary + thematic clusters (group by shared theme/origin/root cause, not just by label — the same read a human gets from reading a handful of related issues side by side).
- A per-record `priority:*` suggestion with a one-line rationale.
- Detected `**Related:**` cross-references — pairs of selected records whose bodies reference each other's context in prose without a formal link (`**Related:**` is `/capture`'s own body-template line; nothing else reads or maintains it — `_shared/work-record.md`). Never suggest `Blocked by #N` here — that's the formally-parsed hard-dependency mechanism, out of scope for this skill (`_shared/work-record.md`'s permission matrix, Task 2).
```

Replace with:

```markdown
Fetch bodies only for `selected` (github: `gh issue view {n} --json body`, one per record; local-files: bodies are already present from Step 1's `queryRecords`). Read every selected body in one pass and produce:

- A narrative summary + thematic clusters (group by shared theme/origin/root cause, not just by label — the same read a human gets from reading a handful of related issues side by side).
- A per-record `priority:*` suggestion with a one-line rationale.
- A per-record, **non-binding** tier guess (`quick`/`full`) — purely to help a human eyeball a batch before deciding what to send to `/specify` next. This is never written as a label; only `/specify`'s own `ceremony-check` (a separate, authoritative computation with deeper context — the record's fully shaped Deliverables/Acceptance Criteria, not this pass's rougher read) writes `ceremony:*`. See `docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md`.
- Detected `**Related:**` cross-references — pairs of selected records whose bodies reference each other's context in prose without a formal link (`**Related:**` is `/capture`'s own body-template line; nothing else reads or maintains it — `_shared/work-record.md`). Never suggest `Blocked by #N` here — that's the formally-parsed hard-dependency mechanism, out of scope for this skill (`_shared/work-record.md`'s permission matrix, Task 2).
```

- [ ] **Step 3: Add the `Suggested tier` column to Step 4's batch table and rendering rule**

Find:

```markdown
Render the priority suggestions as a batch table, mirroring `/claude-tweaks:triage`'s own Step 3 pattern:

```markdown
### Review Backlog — {N} priority suggestions

| # | Record | Current | Suggested | Rationale |
|---|---|---|---|---|
| 1 | #123: {title} | (none) | priority:high | {one-line rationale} |
```
```

Replace with:

```markdown
Render the priority suggestions as a batch table, mirroring `/claude-tweaks:triage`'s own Step 3 pattern, with an added `Suggested tier` column:

```markdown
### Review Backlog — {N} priority suggestions

| # | Record | Current | Suggested | Suggested tier | Rationale |
|---|---|---|---|---|---|
| 1 | #123: {title} | (none) | priority:high | quick? (guess) | {one-line rationale} |
```

Render the two sources distinguishably — a real `ceremony:*` label (already-scored records, per
Step 1's mechanical display) plainly (`fast-lane`/`standard`); this step's own LLM guess suffixed
(`quick? (guess)`/`full? (guess)`) — so a human scanning the batch never mistakes an unscored
guess for `/specify`'s authoritative verdict. The `Suggested tier` column is informational only —
it rides along with the priority batch-confirm below, never gated behind its own
`AskUserQuestion`, and is never itself written anywhere.
```

- [ ] **Step 4: Self-review against the design doc**

Prose deliverable, no test cycle. Confirm:

- The mechanical (scored-record) and advisory (unscored-record) tier displays are visually
  distinguished in the rendered table, per the design doc's explicit requirement.
- Nothing in this task writes a `ceremony:*` label — only `/specify` does that.
- No `TBD`/`TODO`/placeholder text anywhere in the edited sections.

Fix any drift found inline.

- [ ] **Step 5: Commit**

```bash
git add skills/review-backlog/SKILL.md
git commit -m "Add Suggested tier column to /review-backlog

Free/mechanical for already-scored records (facets.ceremony); a
non-binding LLM guess for unscored ones, visually distinguished from
the real verdict. Advisory only — /specify's ceremony-check remains
the sole authoritative computation."
```

---

## Final Verification

- [ ] **Run the full test suite one more time**

```bash
npm test 2>&1 | tail -20
```

Expected: same pass count as Task 1's own baseline (this plan's Global Constraints), modulo the
one pre-existing documented-flaky `statusline.test.js` timing test.

- [ ] **Grep for any remaining reference to the old omit-when-standard convention**

```bash
grep -rn "ceremony.*omitted when standard\|omit.*ceremony:" skills/ --include="*.md" | grep -v "2026-07-15-fast-lane-pipeline-profile-design"
```

Expected: no output.

- [ ] **Confirm every task's design-doc cross-reference resolves**

```bash
test -f docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md && echo OK
```
