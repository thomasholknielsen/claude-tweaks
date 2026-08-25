# Veto-Window Maturation for Machine-Granted auto:merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a standing human veto window between a headless `/claude-tweaks:backlog grant` firing and a record becoming auto-mergeable, by having that firing apply a new `auto:merge-pending` label instead of `auto:merge` directly, and having `/claude-tweaks:dispatch`'s existing Auto-merge gate mature `auto:merge-pending` into `auto:merge` once it's older than `grant-veto-window-hours` (default 24) and hasn't been vetoed (a human removing the pending label).

**Architecture:** A new additive-on-`auto:build`, mutually-exclusive-with-`auto:merge` label (`auto:merge-pending`) is the waypoint state. `plugin/skills/backlog/grant-mode.md`'s Step 4 Apply writes it instead of `auto:merge` when the gate chain would have granted merge trust. A new pure module (`grant-maturation.js`) decides maturity from label state + the grant audit comment's timestamp; `plugin/skills/dispatch/settle-and-merge.md`'s Auto-merge gate Authorization layer calls it per group member at the same checkpoint dispatch already runs, promoting in place — no new scheduled job.

**Tech Stack:** Node.js (`node --test`), `gh` CLI (issue labels/comments), existing `bin/lib/policy-schema.js` resolver, existing `bin/lib/issues/*` pure-module conventions.

**Spec:** `.claude-tweaks/pipelines/2026-08-23T151140-record-309/work/309-spec.md` (materialized from GitHub issue #309) — this plan implements its Deliverables/Acceptance Criteria in full; the spec travels with this plan, executors read both.

## Global Constraints

- The label taxonomy is closed (#239 — see `plugin/skills/_shared/work-record.md`'s "The taxonomy is closed" note): `auto:merge-pending` is added to the existing **Grants** family (not a new family), and every write site is documented in the permission matrix before it ships.
- Machinery may only ever *remove* grants except two narrow, explicit carve-outs (`plugin/skills/_shared/work-record.md`'s Grant semantics): `/backlog grant`'s existing origination carve-out (now writing `auto:merge-pending` instead of `auto:merge`), and this record's **new** maturation carve-out (`/dispatch` promoting `auto:merge-pending` → `auto:merge`). Both must be named explicitly in the permission matrix's `/dispatch` row — never a silent widening of "machinery only removes."
- **AC5's forced decision (documented here, not deferred to build time):** the veto-window feature **replaces today's immediate-grant behavior outright** for the headless machine-grant path — it is not a separate opt-in. Rationale: `grant-veto-window-hours` ships with a concrete default (24h), and a machine-originated merge grant with zero human awareness window is exactly the case this feature exists to close; gating it behind a second policy flag would leave the unsafe default behavior in place for every project that doesn't know to opt in. The existing `grant-origination-enabled` opt-in still gates whether headless origination happens at all — this feature only changes *what* that origination writes.
- `grant-gate.js`'s pure decision logic (`evaluateGrantGate`) is **unchanged** — it still only decides "would this class of record earn merge trust," never which label represents that trust. Applying `auto:merge-pending` vs `auto:merge` is a caller/label-application concern, consistent with the module's own header comment ("Callers apply labels/comments; this module only decides").
- No new scheduled job or daemon. Maturation binds to `/claude-tweaks:dispatch`'s existing Auto-merge gate Authorization layer (`plugin/skills/dispatch/settle-and-merge.md`) — the same "existing merge-consult checkpoint" rule `docs/donts.md`'s `[IL-94]` requires.
- Every new/changed `plugin/bin/lib/**` module is covered by a `tests/bin-lib/**` suite using `node:test` + `node:assert`, matching this repo's existing convention (see `tests/bin-lib/issues/merge-lane-breaker.test.js`-style pure-module tests).

---

### Task 1: Policy schema — `grant-veto-window-hours`

**Files:**
- Modify: `plugin/bin/lib/policy-schema.js:68` (insert new row directly after the `unsettled-age-hours` row)
- Modify: `tests/policy-schema.test.js:31` and the block starting at `tests/policy-schema.test.js:61` (the `POLICY_KEYS.length`/changelog-comment pin)

**Interfaces:**
- Produces: policy key `grant-veto-window-hours` (`type: 'integer'`, `default: 24`, `category: 'merge-safety'`, `tier: 'advanced'`), resolvable via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values grant-veto-window-hours` — read by Task 6's dispatch wiring.

- [ ] **Step 1: Write the failing test**

In `tests/policy-schema.test.js`, the count pin currently reads (around line 89-90):

```js
  assert.strictEqual(POLICY_KEYS.length, 59);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 59);
```

Change both `59`s to `60`, and append a new changelog comment line immediately above that assertion (after the existing "54 -> 59, #194 ..." comment block), following the file's own established format:

```js
  // 59 -> 60, #309 (veto-window maturation): grant-veto-window-hours — how
  // long a machine-granted auto:merge-pending grant must sit unvetoed before
  // /claude-tweaks:dispatch's Auto-merge gate matures it to auto:merge.
  assert.strictEqual(POLICY_KEYS.length, 60);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 60);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/policy-schema.test.js`
Expected: FAIL — `POLICY_KEYS.length` is still 59, assertion expects 60.

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/lib/policy-schema.js`, immediately after the `unsettled-age-hours` row (line 68: `{ key: 'unsettled-age-hours', ... }`), insert:

```js
  { key: 'grant-veto-window-hours', type: 'integer', default: 24, summary: "Sets how long a machine-granted auto:merge-pending grant must sit unvetoed before dispatch matures it to auto:merge.", category: 'merge-safety', tier: 'advanced' },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/policy-schema.test.js tests/policy-schema-metadata.test.js`
Expected: PASS (the metadata test covers the new row's `summary`/`category`/`tier` contract automatically — `category: 'merge-safety'` and `tier: 'advanced'` already exist on prior rows, so no new category/tier registration is needed).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/policy-schema.js tests/policy-schema.test.js
git commit -m "feat: add grant-veto-window-hours policy key (#309)"
```

---

### Task 2: `auto:merge-pending` label — taxonomy, bootstrap, permission matrix

**Files:**
- Modify: `plugin/skills/_shared/label-bootstrap.md:42` (version bump), `:97-98` (LABELS_JSON)
- Modify: `plugin/skills/_shared/work-record.md:87` (Label taxonomy table), `:142` and `:144` (permission matrix rows), `:159-190` (Grant semantics section)

**Interfaces:**
- Produces: label name `auto:merge-pending` (string literal `'auto:merge-pending'`), used directly by Task 4 (grant-mode.md Apply) and Task 6 (settle-and-merge.md maturation) — no new JS constant is added for it (kept out of `record.js`'s `LABELS`/`parseRecordFacets` entirely; see this task's own note below on why).

This task is prose/taxonomy-only — no JS to test-drive. Verification is a repo-wide grep pass (Step 3) plus the existing `node --test` suites that already pin label-taxonomy prose elsewhere (Step 4).

- [ ] **Step 1: Edit `label-bootstrap.md`**

Bump the version marker (line 42): change `**current value: `4`**` to `**current value: `5`**`.

Add a new entry to the `LABELS_JSON` array, immediately after the existing `auto:merge` row (line 98):

```js
  ["auto:merge",         "Grant: a clean autonomous run may merge unreviewed (stacks on auto:build; alone inert)"],
  ["auto:merge-pending", "Grant: machine-granted merge trust awaiting its veto window (matures to auto:merge)"],
```

- [ ] **Step 2: Edit `work-record.md` — Label taxonomy table**

Change line 87 from:

```
| Grants (2) | `auto:build`, `auto:merge` | Authorization |
```

to:

```
| Grants (3) | `auto:build`, `auto:merge`, `auto:merge-pending` | Authorization |
```

- [ ] **Step 3: Edit `work-record.md` — permission matrix rows**

Change the `/backlog grant` row (line 142) Adds column from:

```
`auto:build` (+`auto:merge` when `permittedGrants` also authorizes it), only on a record whose full gate chain clears (`bin/lib/issues/grant-gate.js`, `backlog/grant-mode.md`)
```

to:

```
`auto:build` (+`auto:merge-pending` when `permittedGrants` also authorizes it — see Grant semantics' veto-window bullet), only on a record whose full gate chain clears (`bin/lib/issues/grant-gate.js`, `backlog/grant-mode.md`)
```

Change the `/dispatch` row (line 144) from:

```
| **`/dispatch`** (queue consumer) | `bot:in-progress` (claim mirror), `bot:blocked` (at retry ceiling), `demo:pending` (group auto-merge gate, `dispatch/settle-and-merge.md` — reuses `/wrap-up`'s own `verification-brief.md` procedure, including its parent-gate routing, so on a parent-linked sub-issue the label lands on the parent instead) | `auto:merge` (failure downgrade), `auto:*` (at ceiling), `bot:in-progress` (release) | adding `auto:*` or `ready`, `demo:approved`, `demo:changes-requested` |
```

to:

```
| **`/dispatch`** (queue consumer) | `bot:in-progress` (claim mirror), `bot:blocked` (at retry ceiling), `demo:pending` (group auto-merge gate, `dispatch/settle-and-merge.md` — reuses `/wrap-up`'s own `verification-brief.md` procedure, including its parent-gate routing, so on a parent-linked sub-issue the label lands on the parent instead), `auto:merge` (**maturation only** — promotes an already-`auto:merge-pending` grant past `grant-veto-window-hours` unvetoed; never originates a fresh grant, see Grant semantics' maturation carve-out) | `auto:merge` (failure downgrade), `auto:merge-pending` (maturation's own label swap — removed in the same step `auto:merge` is added), `auto:*` (at ceiling), `bot:in-progress` (release) | originating a fresh `auto:*` grant (maturing `auto:merge-pending` → `auto:merge` is promotion, not origination), adding `ready`, `demo:approved`, `demo:changes-requested` |
```

- [ ] **Step 4: Edit `work-record.md` — Grant semantics section**

**Renumbering-completeness note:** the section's own opening sentence (line 161) is a cardinal-word count this change affects — `grep -n "two stackable human-granted labels" plugin/skills/_shared/work-record.md` finds it. Change:

```
Authorization is two stackable human-granted labels. Their **absence is the default
not-authorized state** — no label means no autonomous action, ever.
```

to:

```
Authorization is two stackable human-granted labels (`auto:build`, `auto:merge`), plus one
machine-only waypoint label (`auto:merge-pending` — never granted directly by an interactive
human, only ever written by the machine-origination path below, and always superseded by
`auto:merge` once matured or removed by a veto). Their **absence is the default
not-authorized state** — no label means no autonomous action, ever.
```

Then replace the section currently spanning (approximately) lines 164-190 — from the `- \`auto:build\` — agents may claim...` bullet through the closing `...every candidate is skipped with the failing key logged.` bullet — with:

```markdown
- `auto:build` — agents may claim and build this record autonomously.
- `auto:merge` — a completely clean autonomous run may merge without waiting for a live
  review. **Additive on `auto:build`:** the gate always grants `auto:build` when granting
  `auto:merge`. Dispatch queries `auto:build` only; `auto:merge` **alone is inert** — no
  queue selects on it.
- `auto:merge-pending` — a waypoint state on the machine-origination path only (an interactive
  human grant at `/backlog refine` always writes `auto:merge` directly — see that row above).
  Additive on `auto:build`, mutually exclusive with `auto:merge` (a record carries at most one
  of the two at a time). Inert for queue selection exactly like `auto:merge` — dispatch still
  queries `auto:build` only. Matures into `auto:merge` at `/claude-tweaks:dispatch`'s existing
  Auto-merge gate / merge-consult checkpoint once older than the `grant-veto-window-hours`
  policy key (default 24) and not vetoed — see the maturation bullet below.
- **Machinery may only remove grants, never originate them** (save for the two carve-outs
  below, both shut by default or narrowly scoped). Failure handling is
  classification-driven (via `/claude-tweaks:assess-agent-autonomy`'s `failure-check` mode):
  a `correctness`- or `ambiguous`-classified failure revokes `auto:merge` before retry; a
  `transient`-classified one preserves it. At the retry ceiling (`dispatch-retry-ceiling`),
  regardless of classification, machinery removes all `auto:*` labels and adds `bot:blocked` —
  the record needs a human re-grant to run again.
- `auto:*` labels are only ever originated by an interactive human session, with **one
  machine-origination path**: `/claude-tweaks:backlog`'s headless `grant` mode
  (`backlog/grant-mode.md`). It requires the full key set together — the `autonomy` ceiling
  resolving `unattended` AND the `grant-origination-enabled` policy opt-in
  (`_shared/autonomy-ceiling.md`, `_shared/policy-schema.md`), the candidate record's class
  reading a `clean` trust verdict, a `by:*` agent-filed origin, a content-aware
  `/claude-tweaks:assess-agent-autonomy` `grant-check` clearing, and no floor trip
  (`merge-sensitive-paths`, the oversight floor — `risk` and/or `size` at or above policy's
  configured `riskFloor`/`sizeFloor`, with an unscored axis failing closed — the fleet daily
  grant cap). **A human-filed record
  (no `by:*` label) is never eligible, regardless of every other key** — this path narrows the
  existing invariant exactly once, deliberately, rather than widening any actor's row generally.
  Both opt-in keys are human-set project policy (`policy.yml`), never written by any skill; with
  either absent — `policy.yml`'s shipped default — this path grants nothing and every candidate
  is skipped with the failing key logged. **This path writes `auto:merge-pending` in place of
  `auto:merge` directly** (#309) when its gate chain would have granted merge trust — the
  veto-window feature replaces the old immediate-grant behavior outright rather than sitting
  behind a further opt-in, since `grant-veto-window-hours` ships with a concrete default (24h)
  and a machine-originated merge grant with zero human awareness window is exactly the case a
  standing veto window exists to close.
- A **second, narrower machine carve-out — maturation, not origination**: `/claude-tweaks:dispatch`'s
  existing Auto-merge gate Authorization layer (`dispatch/settle-and-merge.md`) promotes an
  already-`auto:merge-pending` record to `auto:merge` once that pending grant is older than
  `grant-veto-window-hours` (default 24) and has not been vetoed. A veto is a human removing
  `auto:merge-pending` before maturation — permanent, since nothing re-adds it: `/backlog grant`'s
  own candidate fetch excludes any record already carrying `auto:build` (which `auto:merge-pending`
  is always additive on), so a vetoed record is never re-evaluated by the origination gate chain
  again without a fresh, unrelated human re-grant. This carve-out never originates a fresh grant —
  it only promotes a grant a human's own policy configuration (the origination opt-in above)
  already authorized to eventually mature — and it never runs on a standalone scheduled job, only
  inside the merge-consult checkpoint dispatch already runs per group.
```

- [ ] **Step 5: Verify via grep (no automated test covers taxonomy prose directly)**

```bash
grep -n "auto:merge-pending" plugin/skills/_shared/label-bootstrap.md plugin/skills/_shared/work-record.md
grep -n "two stackable human-granted labels" plugin/skills/_shared/work-record.md
```

Expected: the first command finds at least 6 matches (LABELS_JSON row, taxonomy table row, `/backlog grant` row, `/dispatch` row, the opening-sentence parenthetical, and the Grant semantics bullets). The second command's match must show the updated three-part sentence (two human-granted + one machine waypoint), not the original bare "two stackable" wording — this is the Renumbering-completeness check's required third grep form (the cardinal-word count), alongside the table's own "Grants (3)" row (the number form, Step 2) and the permission-matrix/Grant-semantics prose restating membership (the bucket-list form, Steps 3-4).

- [ ] **Step 6: Run the repo's prose/label conformance suites**

Run: `node --test tests/`
Expected: PASS. (No suite pins the literal Grants-family count today — confirmed by this task's own research — but this catches any other suite that happens to enumerate `work-record.md`'s tables.)

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/_shared/label-bootstrap.md plugin/skills/_shared/work-record.md
git commit -m "feat: add auto:merge-pending grant label + taxonomy docs (#309)"
```

**Note on why no `record.js`/`facet-shape.js` change:** `parseRecordFacets`'s `facets.grants` shape is read via `assert.deepStrictEqual` against fully-enumerated fixture objects in `tests/bin-lib/issues/record.test.js`, `local-store.test.js`, `materialize-format.test.js`, and `backlog.test.js` (confirmed by grep during planning). Adding a `mergePending` key there would require touching every one of those fixtures for a facet nothing in this record's Deliverables actually needs to read through `parseRecordFacets` — Task 4 and Task 6 read `auto:merge-pending` directly off the live `gh issue view --json labels` label-name array instead, which is simpler and strictly narrower (CLAUDE.md's "Surgical changes"). If a future consumer needs this as a first-class facet, that is a fresh, separately-scoped change.

---

### Task 3: `grant-maturation.js` — pure maturation decision module

**Files:**
- Create: `plugin/bin/lib/issues/grant-maturation.js`
- Test: `tests/bin-lib/issues/grant-maturation.test.js`

**Interfaces:**
- Produces: `evaluateMaturation({ hasPendingLabel, hasMergeLabel, pendingSince, vetoWindowHours, now }) -> { mature: boolean, state: 'already-mature'|'not-pending'|'unknown-age'|'within-veto-window'|'matured', reason: string, ageHours?: number, windowHours?: number }` and `extractPendingGrantedAt(commentBodies: string[]) -> Date | null` — both consumed by Task 6's dispatch wiring.
- Consumes: nothing from earlier tasks (pure, standalone module; mirrors `merge-lane-breaker.js`'s style).

- [ ] **Step 1: Write the failing test**

Create `tests/bin-lib/issues/grant-maturation.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { evaluateMaturation, extractPendingGrantedAt } = require('../../../plugin/bin/lib/issues/grant-maturation.js');

const NOW = new Date('2026-08-23T12:00:00Z');

test('evaluateMaturation: already-mature when auto:merge is present, regardless of pending', () => {
  const result = evaluateMaturation({ hasPendingLabel: true, hasMergeLabel: true, pendingSince: null, vetoWindowHours: 24, now: NOW });
  assert.strictEqual(result.mature, true);
  assert.strictEqual(result.state, 'already-mature');
});

test('evaluateMaturation: not-pending when neither label is present', () => {
  const result = evaluateMaturation({ hasPendingLabel: false, hasMergeLabel: false, pendingSince: null, vetoWindowHours: 24, now: NOW });
  assert.strictEqual(result.mature, false);
  assert.strictEqual(result.state, 'not-pending');
});

test('evaluateMaturation: unknown-age when pending but no discoverable grant timestamp', () => {
  const result = evaluateMaturation({ hasPendingLabel: true, hasMergeLabel: false, pendingSince: null, vetoWindowHours: 24, now: NOW });
  assert.strictEqual(result.mature, false);
  assert.strictEqual(result.state, 'unknown-age');
});

test('evaluateMaturation: within-veto-window when pending age is under the window', () => {
  const pendingSince = new Date('2026-08-23T10:00:00Z'); // 2h before NOW
  const result = evaluateMaturation({ hasPendingLabel: true, hasMergeLabel: false, pendingSince, vetoWindowHours: 24, now: NOW });
  assert.strictEqual(result.mature, false);
  assert.strictEqual(result.state, 'within-veto-window');
  assert.strictEqual(result.ageHours, 2);
});

test('evaluateMaturation: matured when pending age is past the window', () => {
  const pendingSince = new Date('2026-08-22T11:00:00Z'); // 25h before NOW
  const result = evaluateMaturation({ hasPendingLabel: true, hasMergeLabel: false, pendingSince, vetoWindowHours: 24, now: NOW });
  assert.strictEqual(result.mature, true);
  assert.strictEqual(result.state, 'matured');
  assert.strictEqual(result.ageHours, 25);
});

test('evaluateMaturation: matures exactly at the window boundary (>=, not >)', () => {
  const pendingSince = new Date('2026-08-22T12:00:00Z'); // exactly 24h before NOW
  const result = evaluateMaturation({ hasPendingLabel: true, hasMergeLabel: false, pendingSince, vetoWindowHours: 24, now: NOW });
  assert.strictEqual(result.mature, true);
  assert.strictEqual(result.state, 'matured');
});

test('evaluateMaturation: defaults vetoWindowHours to 24 when absent or invalid', () => {
  const pendingSince = new Date('2026-08-22T11:00:00Z'); // 25h before NOW
  const withUndefined = evaluateMaturation({ hasPendingLabel: true, hasMergeLabel: false, pendingSince, now: NOW });
  assert.strictEqual(withUndefined.mature, true);
  const withNaN = evaluateMaturation({ hasPendingLabel: true, hasMergeLabel: false, pendingSince, vetoWindowHours: NaN, now: NOW });
  assert.strictEqual(withNaN.mature, true);
});

test('extractPendingGrantedAt: null for non-array, empty array, or no marker', () => {
  assert.strictEqual(extractPendingGrantedAt(undefined), null);
  assert.strictEqual(extractPendingGrantedAt([]), null);
  assert.strictEqual(extractPendingGrantedAt(['no marker here']), null);
});

test('extractPendingGrantedAt: extracts the date from a pending marker', () => {
  const body = 'Machine-granted by /claude-tweaks:backlog grant (headless).\n\n<!-- grant-mode-audit: date=2026-08-22T11:00:00Z auto-merge=pending -->';
  const result = extractPendingGrantedAt([body]);
  assert.ok(result instanceof Date);
  assert.strictEqual(result.toISOString(), '2026-08-22T11:00:00.000Z');
});

test('extractPendingGrantedAt: ignores true/false markers, only reads pending', () => {
  const bodies = [
    '<!-- grant-mode-audit: date=2026-08-20T00:00:00Z auto-merge=true -->',
    '<!-- grant-mode-audit: date=2026-08-21T00:00:00Z auto-merge=false -->',
  ];
  assert.strictEqual(extractPendingGrantedAt(bodies), null);
});

test('extractPendingGrantedAt: returns the latest when multiple pending markers exist', () => {
  const bodies = [
    '<!-- grant-mode-audit: date=2026-08-20T00:00:00Z auto-merge=pending -->',
    '<!-- grant-mode-audit: date=2026-08-22T00:00:00Z auto-merge=pending -->',
  ];
  const result = extractPendingGrantedAt(bodies);
  assert.strictEqual(result.toISOString(), '2026-08-22T00:00:00.000Z');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/issues/grant-maturation.test.js`
Expected: FAIL with "Cannot find module '../../../plugin/bin/lib/issues/grant-maturation.js'".

- [ ] **Step 3: Write minimal implementation**

Create `plugin/bin/lib/issues/grant-maturation.js`:

```js
'use strict';

// Pure: decides whether a record's `auto:merge-pending` grant (#309) has
// matured into `auto:merge`, is still inside its veto window, or was never
// pending in the first place (including a permanent veto — a human removing
// `auto:merge-pending` before maturation, with nothing re-adding it — see
// `_shared/work-record.md`'s Grant semantics maturation carve-out).
//
// Called by dispatch's existing Auto-merge gate Authorization layer
// (`skills/dispatch/settle-and-merge.md`) at its normal merge-consult
// checkpoint — never a separate scheduled job, per `docs/donts.md`'s
// [IL-94].

const PENDING_GRANT_MARKER_RE = /<!--\s*grant-mode-audit:\s*date=(\S+)\s+auto-merge=pending\s*-->/g;

// commentBodies: string[] — an issue's fetched comment bodies (any order).
// Returns the Date of the LATEST `auto-merge=pending` grant-mode-audit
// marker found, or null when none is present. Markers with `auto-merge=true`
// or `auto-merge=false` are ignored — only a pending grant has a maturation
// clock to read.
function extractPendingGrantedAt(commentBodies) {
  const bodies = Array.isArray(commentBodies) ? commentBodies : [];
  let latest = null;
  for (const body of bodies) {
    if (typeof body !== 'string') continue;
    PENDING_GRANT_MARKER_RE.lastIndex = 0;
    let m;
    while ((m = PENDING_GRANT_MARKER_RE.exec(body)) !== null) {
      const parsed = new Date(m[1]);
      if (Number.isNaN(parsed.getTime())) continue;
      if (!latest || parsed.getTime() > latest.getTime()) latest = parsed;
    }
  }
  return latest;
}

// hasPendingLabel/hasMergeLabel: booleans from a fresh `gh issue view
// --json labels` read. pendingSince: Date | null — normally
// extractPendingGrantedAt's return value. vetoWindowHours: the resolved
// grant-veto-window-hours policy value (falls back to the schema default,
// 24, when absent/invalid — belt-and-braces alongside the resolver's own
// default). now: Date | epoch-ms (injected clock for tests).
//
// Returns { mature, state, reason, ageHours?, windowHours? }. `state` is one
// of:
//   'already-mature'    — auto:merge is already present; nothing to do.
//   'not-pending'        — no auto:merge-pending label (never granted, or a
//                          human vetoed it — both read identically here).
//   'unknown-age'        — pending label present but no discoverable grant
//                          timestamp; treated as not yet matured (fail safe).
//   'within-veto-window'  — pending, timestamped, but still younger than the
//                          veto window.
//   'matured'            — pending, timestamped, and past the veto window —
//                          the caller should promote it now.
function evaluateMaturation({ hasPendingLabel, hasMergeLabel, pendingSince, vetoWindowHours, now } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : (typeof now === 'number' ? now : Date.now());

  if (hasMergeLabel === true) {
    return { mature: true, state: 'already-mature', reason: 'auto:merge already present' };
  }
  if (hasPendingLabel !== true) {
    return { mature: false, state: 'not-pending', reason: 'no auto:merge-pending label present (never granted, or vetoed by a human removing it)' };
  }
  if (!(pendingSince instanceof Date) || Number.isNaN(pendingSince.getTime())) {
    return { mature: false, state: 'unknown-age', reason: 'pending grant timestamp could not be determined from the audit trail — treated as not yet matured' };
  }

  const windowHours = (typeof vetoWindowHours === 'number' && Number.isFinite(vetoWindowHours) && vetoWindowHours >= 0)
    ? vetoWindowHours
    : 24;
  const ageHours = (nowMs - pendingSince.getTime()) / (60 * 60 * 1000);

  if (ageHours < windowHours) {
    return { mature: false, state: 'within-veto-window', reason: `pending grant is ${ageHours.toFixed(1)}h old, veto window is ${windowHours}h`, ageHours, windowHours };
  }
  return { mature: true, state: 'matured', reason: `pending grant is ${ageHours.toFixed(1)}h old, past the ${windowHours}h veto window`, ageHours, windowHours };
}

module.exports = { evaluateMaturation, extractPendingGrantedAt, PENDING_GRANT_MARKER_RE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/issues/grant-maturation.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/issues/grant-maturation.js tests/bin-lib/issues/grant-maturation.test.js
git commit -m "feat: add pure grant-maturation decision module (#309)"
```

---

### Task 4: `grant-mode.md` Step 4 — apply `auto:merge-pending`, update audit marker

**Files:**
- Modify: `plugin/skills/backlog/grant-mode.md:1-12` (mode summary), `:319-347` (Step 4 Apply), `:358-380` (Audit format), `:1-2` header
- Modify: `plugin/bin/lib/issues/grant-gate.js:143-149` (comment-only note)

**Interfaces:**
- Consumes: nothing new (still reads `result.autoMerge` from `evaluateGrantGate`, unchanged).
- Produces: the label `auto:merge-pending` on qualifying records instead of `auto:merge`; the audit comment marker `auto-merge=pending` instead of `auto-merge=true`. Task 5's `fleet-counters.js` regex and Task 6's maturation wiring both depend on this exact marker shape.

- [ ] **Step 1: Edit the mode summary (lines 1-12)**

In the second paragraph (starts "Preflight (Detection Ladder..."), no change needed there. In the first paragraph, after the sentence ending "...regardless of every other key — see `_shared/work-record.md`'s new `/backlog grant` permission matrix row.", append a new sentence:

```
As of #309, a gate-chain pass that would have granted merge trust applies `auto:merge-pending`
instead of `auto:merge` directly — see `_shared/work-record.md`'s Grant semantics for the full
pending-then-mature flow and why this replaces the old immediate-grant behavior outright.
```

- [ ] **Step 2: Edit Step 4 Apply (lines 319-347)**

Replace the block from `## Step 4: Apply` through the closing of the bash snippet (the `fi` before `The writeWatched call above...`) with:

```markdown
## Step 4: Apply

**Grant rows** (Phase C `grant: true`): bootstrap `auto:build` (+`auto:merge-pending` when
`result.autoMerge`) per `_shared/label-bootstrap.md`, same `LABELS_JSON` pair `refine-mode.md`
Step 5 uses. `auto:merge-pending` is a waypoint, not the final merge grant — it matures to
`auto:merge` at `/claude-tweaks:dispatch`'s existing Auto-merge gate Authorization layer, gated
by `grant-veto-window-hours` and vetoable by a human removing the label before then (see
`_shared/work-record.md`'s Grant semantics). `bot:blocked` candidates take the **re-authorize**
path — strip `bot:blocked`, grant **`auto:build` only, never `auto:merge`/`auto:merge-pending`**,
regardless of what `result.autoMerge` says (mirrors `refine-mode.md` Step 3's `re-authorize
(bot:blocked)` row: "a prior failure means the human's renewed judgment is the point" — this
mode has no human in the loop for this decision, so the conservative floor is to never restore
merge trust on a re-authorization headlessly, full stop):

```bash
if gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -qx bot:blocked; then
  gh issue edit "$ISSUE" --remove-label bot:blocked --add-label auto:build
else
  gh issue edit "$ISSUE" --add-label auto:build
  if [ "$AUTO_MERGE" = "true" ]; then
    gh issue edit "$ISSUE" --add-label auto:merge-pending
  fi
fi
```

Unlike before #309, this step no longer seeds `merge-lane/watched.json` — a pending grant hasn't
merged anything yet, so there is nothing for the circuit breaker to watch. That seed now happens
in `dispatch/settle-and-merge.md`'s Auto-merge gate, at the moment `auto:merge-pending` actually
matures into `auto:merge` (see that file).
```

- [ ] **Step 3: Edit the audit marker format (lines 358-380)**

Change the trailing marker line from:

```
<!-- grant-mode-audit: date={YYYY-MM-DDTHH:MM:SSZ} auto-merge={true|false} -->
```

to:

```
<!-- grant-mode-audit: date={YYYY-MM-DDTHH:MM:SSZ} auto-merge={true|false|pending} -->
```

And in the same section's "Grants applied" line, change `Grants applied: auto:build{ + auto:merge}` to `Grants applied: auto:build{ + auto:merge-pending}`.

Also update the worked `decisions.md` example line in the same section from:

```
AUTO {time} — Backlog grant: granted auto:build{ + auto:merge} to #{n} (class {classKey}, verdict clean). Rationale: {grant-check RATIONALE}.
```

to:

```
AUTO {time} — Backlog grant: granted auto:build{ + auto:merge-pending} to #{n} (class {classKey}, verdict clean). Rationale: {grant-check RATIONALE}.
```

- [ ] **Step 4: Add a documentation-only note to `grant-gate.js`**

In `plugin/bin/lib/issues/grant-gate.js`, immediately above the `let autoMerge = permitted.grants.bornAuthorized.granted === true;` line (around line 149), add:

```js
  // NOTE (#309): this boolean means "this class of record earns merge
  // trust" — it does NOT decide which label represents that trust. The
  // caller (backlog/grant-mode.md's Step 4) applies `auto:merge-pending`
  // when this is true, never `auto:merge` directly; maturation to
  // `auto:merge` happens later, at dispatch's Auto-merge gate. This module
  // stays a pure "does the class qualify" decision either way.
```

- [ ] **Step 5: Verify via grep**

```bash
grep -n "auto:merge-pending\|auto-merge=pending" plugin/skills/backlog/grant-mode.md
grep -n "auto:merge\b" plugin/skills/backlog/grant-mode.md
```

Expected: the first command shows the Step 4 Apply block, the Audit format marker, and the "Grants applied" line all using `auto:merge-pending`/`auto-merge=pending`; the second command's remaining `auto:merge` (bare) hits are only in prose describing the eventual matured state, never in a `gh issue edit --add-label` line.

- [ ] **Step 6: Run the full suite**

Run: `node --test tests/`
Expected: PASS (Task 5 below updates the one suite this step's marker-format change actually touches mechanically; this run is the checkpoint that nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/backlog/grant-mode.md plugin/bin/lib/issues/grant-gate.js
git commit -m "feat: grant-mode applies auto:merge-pending instead of auto:merge (#309)"
```

---

### Task 5: `fleet-counters.js` — accept the `pending` marker value

**Files:**
- Modify: `plugin/bin/lib/issues/fleet-counters.js:12`
- Modify: `tests/bin-lib/issues/fleet-counters.test.js:17-23`

**Interfaces:**
- Consumes: the audit marker shape Task 4 now writes (`auto-merge=pending`).
- Produces: `GRANT_AUDIT_RE` (unchanged export name/shape, widened value alternation) — read by `isMachineGrant` (unchanged) and `routine/fleet.md`'s "Grants issued" counter (unchanged consumer, now correctly matches pending-state comments too).

- [ ] **Step 1: Write the failing test**

In `tests/bin-lib/issues/fleet-counters.test.js`, extend the existing `GRANT_AUDIT_RE` test:

```js
test('GRANT_AUDIT_RE matches the landed grant-mode audit marker shape', () => {
  assert.ok(GRANT_AUDIT_RE.test(
    '<!-- grant-mode-audit: date=2026-08-14T09:00:12Z auto-merge=false -->'));
  assert.ok(GRANT_AUDIT_RE.test(
    '<!--  grant-mode-audit:  date=2026-08-14T09:00:12Z  auto-merge=true  -->'));
  assert.ok(GRANT_AUDIT_RE.test(
    '<!-- grant-mode-audit: date=2026-08-22T11:00:00Z auto-merge=pending -->'));
  assert.ok(!GRANT_AUDIT_RE.test('Machine-granted by /claude-tweaks:backlog grant (headless).'));
});
```

(This replaces the existing test of the same name — add the new `pending` assertion line to it rather than duplicating the whole test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/issues/fleet-counters.test.js`
Expected: FAIL — the `pending` marker does not match today's `(?:true|false)` alternation.

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/lib/issues/fleet-counters.js`, change line 12 from:

```js
const GRANT_AUDIT_RE = /<!--\s*grant-mode-audit:\s*date=\S+\s+auto-merge=(?:true|false)\s*-->/;
```

to:

```js
const GRANT_AUDIT_RE = /<!--\s*grant-mode-audit:\s*date=\S+\s+auto-merge=(?:true|false|pending)\s*-->/;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/issues/fleet-counters.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/issues/fleet-counters.js tests/bin-lib/issues/fleet-counters.test.js
git commit -m "fix: fleet-counters accepts the pending grant-audit marker value (#309)"
```

---

### Task 6: `settle-and-merge.md` — wire maturation into the Auto-merge gate

**Files:**
- Modify: `plugin/skills/dispatch/settle-and-merge.md:197-210` (Auto-merge gate intro + Authorization layer)

**Interfaces:**
- Consumes: `grant-maturation.js`'s `evaluateMaturation`/`extractPendingGrantedAt` (Task 3), the `grant-veto-window-hours` policy key (Task 1), `merge-lane-breaker.js`'s `writeWatched` (existing, relocated call site).
- Produces: the promoted `auto:merge` label + a `decisions.md` AUTO entry per promotion/non-maturation, and the `merge-lane/watched.json` seed write (moved here from Task 4's grant-mode.md).

This task is prose/procedure-only (no JS to test-drive) — verification is a grep pass plus a manual trace against Task 3's module signature.

- [ ] **Step 1: Edit the section intro (line 199)**

Change:

```
Because a bundle shares one branch/worktree, the merge decision is necessarily group-wide even though blast radius is attributed per record below: **every member of the group must carry `auto:merge`** for the gate to apply at all — a group with even one `auto:build`-only member falls back to the normal pending-review path for the whole group; mixed grants inside one bundle are never split at merge time.
```

to:

```
Because a bundle shares one branch/worktree, the merge decision is necessarily group-wide even though blast radius is attributed per record below: **every member of the group must carry `auto:merge`, either already or via a matured `auto:merge-pending`** (see Authorization below) for the gate to apply at all — a group with even one `auto:build`-only member falls back to the normal pending-review path for the whole group; mixed grants inside one bundle are never split at merge time, and a group with even one still-pending, not-yet-matured member falls back the same way (the group's *slowest* member's veto window governs the whole group, same as its slowest member's review verdict already does below).
```

- [ ] **Step 2: Replace the Authorization layer (line 203)**

Change:

```
1. **Authorization** — `auto:merge` was present on every member of the group when Step 4 claimed it (true by construction).
```

to:

```
1. **Authorization** — read each group member's live labels and comments fresh (`gh issue view {n} --json labels,comments`). A member already carrying `auto:merge` satisfies this layer directly, unchanged. A member instead carrying `auto:merge-pending` (never both at once — see `_shared/work-record.md`'s Grant semantics) attempts maturation right now — this checkpoint is the "existing merge-consult step" `grant-veto-window-hours` binds to, per `docs/donts.md`'s `[IL-94]`; there is no separate scheduled job:

   ```bash
   GRANT_VETO_WINDOW_HOURS=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values grant-veto-window-hours)
   node -e "
     const { evaluateMaturation, extractPendingGrantedAt } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/grant-maturation.js');
     // labels: this member's fetched label name array (issue.labels[].name).
     // comments: this member's fetched comment body array (issue.comments[].body).
     const pendingSince = extractPendingGrantedAt(comments);
     const result = evaluateMaturation({
       hasPendingLabel: labels.includes('auto:merge-pending'),
       hasMergeLabel: labels.includes('auto:merge'),
       pendingSince,
       vetoWindowHours: Number('$GRANT_VETO_WINDOW_HOURS'),
       now: new Date(),
     });
     console.log(JSON.stringify(result));
   "
   ```

   - **`result.state === 'already-mature'`** — `auto:merge` was already present; this member satisfies Authorization exactly as before #309.
   - **`result.state === 'matured'`** — promote now:

     ```bash
     gh issue edit {n} --remove-label auto:merge-pending --add-label auto:merge
     node -e "
       const { writeWatched } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/merge-lane-breaker.js');
       writeWatched(process.cwd(), (current) => ({ ...current, ['{n}']: { grantedAt: new Date().toISOString() } }));
     "
     ```

     This is the seed write `grant-mode.md`'s own Step 4 used to perform at grant time before #309 — it now happens here, at the moment merge trust actually activates, since a still-pending grant has nothing yet for the circuit breaker to watch. Log:
     `AUTO {time} — Auto-merge gate: matured #{n}'s auto:merge-pending to auto:merge ({result.ageHours}h old, past the {result.windowHours}h veto window). Reversibility: high (label re-removable; no merge has happened yet). [lever: grant-veto-window-hours={result.windowHours} (source)]`.
     This member now satisfies Authorization exactly as an already-`auto:merge` member does.
   - **`result.state` is `within-veto-window`, `not-pending`, or `unknown-age`** — this member does not satisfy Authorization this firing. Per this section's own group-wide rule above, the **whole group** falls back to the normal pending-review path — do not promote any other member of the group either, even one whose own window has independently elapsed (mixed grants are never split at merge time, same rule an `auto:build`-only member already gets). Log:
     `AUTO {time} — Auto-merge gate: #{n}'s auto:merge-pending has not matured ({result.reason}) — group falls back to pending-review. Reversibility: n/a (no label change). [lever: grant-veto-window-hours={result.windowHours || GRANT_VETO_WINDOW_HOURS} (source)]`.
     A `not-pending` result with no `auto:merge` either is exactly a human veto — permanent, since nothing re-adds `auto:merge-pending` (`/backlog grant`'s own candidate fetch already excludes any record carrying an existing `auto:build` grant, so a previously-granted-then-vetoed record is never re-evaluated by that gate chain again without a fresh human grant).
```

- [ ] **Step 3: Verify via grep**

```bash
grep -n "grant-maturation\|auto:merge-pending\|grant-veto-window-hours" plugin/skills/dispatch/settle-and-merge.md
```

Expected: matches inside the rewritten Authorization layer (module require, label checks, the two log-line templates, and the policy resolver call).

- [ ] **Step 4: Manually trace the module contract against Task 3**

Confirm `evaluateMaturation`'s parameter names (`hasPendingLabel`, `hasMergeLabel`, `pendingSince`, `vetoWindowHours`, `now`) and return shape (`mature`, `state`, `reason`, `ageHours`, `windowHours`) used in this edit match `plugin/bin/lib/issues/grant-maturation.js` exactly — read both files side by side. This is the check `docs/donts.md`'s naming-convention rule (a plan/prose reference to a function's field name must match the actual implementation) exists to catch before it ships as a live inline-`node -e` snippet nobody runs until dispatch actually reaches this gate.

- [ ] **Step 5: Run the full suite**

Run: `node --test tests/`
Expected: PASS (this task edits prose only; the run confirms nothing else regressed).

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/dispatch/settle-and-merge.md
git commit -m "feat: wire grant-veto-window maturation into dispatch's Auto-merge gate (#309)"
```

---

### Task 7: Follow-up capture + final full-suite verification

**Files:** none modified (verification + one backlog filing only)

- [ ] **Step 1: File the out-of-scope fleet-counter follow-up**

`plugin/skills/routine/fleet.md`'s "Grants issued" counter row (~line 207) counts in-window `auto:build`/`auto:merge` label-add events and identifies machine grants by the audit-comment marker's mere presence — it doesn't yet distinguish "pending" from "matured" in its own narrative text. This is cosmetic (the underlying `isMachineGrant`/`GRANT_AUDIT_RE` check Task 5 updated already counts pending-marker comments correctly) and outside this record's Acceptance Criteria, so per `/claude-tweaks:build`'s Common Step 4 ("Follow-up ideas"), file it rather than silently expanding scope:

```
Skill(skill: "claude-tweaks:capture", args: "fleet.md's 'Grants issued' counter row doesn't distinguish pending vs matured machine grants in its own narrative text (routine/fleet.md ~line 207) — cosmetic follow-up surfaced while implementing #309's veto-window maturation; the underlying isMachineGrant/GRANT_AUDIT_RE check already counts pending-marker comments correctly, this is display wording only")
```

- [ ] **Step 2: Run the full test suite**

Run: `node --test tests/`
Expected: PASS — every suite green, including `tests/policy-schema.test.js`, `tests/policy-schema-metadata.test.js`, `tests/bin-lib/issues/grant-maturation.test.js`, `tests/bin-lib/issues/fleet-counters.test.js`, `tests/bin-lib/issues/grant-gate.test.js` (unchanged behavior — confirms Task 4's comment-only edit didn't alter `evaluateGrantGate`'s logic).

- [ ] **Step 3: Grep-sweep for any stray immediate-grant assumption**

```bash
grep -rn "auto:merge\b" plugin/skills/backlog/grant-mode.md plugin/skills/dispatch/settle-and-merge.md plugin/skills/_shared/work-record.md | grep -v "auto:merge-pending\|auto:merge\`.*eventual\|matures\|matured\|maturation"
```

Read every remaining hit and confirm each is either (a) describing the final matured state (expected, unchanged meaning) or (b) an unrelated mention (e.g. the failure-downgrade rule, dispatch's queue-selection note that `auto:merge` alone is inert). None should describe grant-mode.md's Step 4 writing `auto:merge` directly anymore.

- [ ] **Step 4: No commit needed for this task** (Step 1 is a `capture` filing, not a repo edit; Step 2/3 are verification only).

---

## Acceptance Criteria Cross-Check (self-review)

- **AC1** (headless grant applies pending instead of auto:merge) — Task 4.
- **AC2** (pending record younger than the window is never matured) — Task 6's `within-veto-window` branch (backed by Task 3's `evaluateMaturation`).
- **AC3** (older, unvetoed record matures at dispatch's existing checkpoint, no new polling) — Task 6.
- **AC4** (human veto is permanent, no silent re-entry) — Task 6's `not-pending` branch + Task 2's Grant semantics bullet explaining why `/backlog grant`'s existing candidate filter already makes this true.
- **AC5** (explicit opt-in/default-on/replace decision, documented) — Global Constraints section above + Task 2 Step 4's Grant semantics bullet (states the decision: replaces immediate-grant outright).
