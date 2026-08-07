# Autonomy Governor (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `autonomy` ceiling lever real — a class that has earned trust may skip `/specify` at `trusted`, and the trust table's verdicts become sound enough for a machine to read.

**Architecture:** Three layers, bottom-up. (1) `bin/lib/issues/trust.js`'s verdict gains a floor that counts *verdicts* rather than *records*, and stops treating a declined record as a quality failure — without this the first `/demo` approval anyone runs would grade a 40-record class `clean`. (2) A new pure module `bin/lib/issues/autonomy.js` resolves the ceiling and maps `(ceiling, row)` to a concrete permission set, with `unstructured` denied at every tier. (3) The prose contracts that govern who may write which label are amended to name the ceiling, and `/backlog refine`'s existing grant console renders the trust signal beside its existing recommendation.

**Tech Stack:** Node 18+ CommonJS, `node --test`, markdown skill files.

## Global Constraints

- **Node 18+, CommonJS, zero runtime dependencies.** `require`/`module.exports`; no ESM, no packages.
- **Every new module under `bin/lib/issues/` is pure** — no filesystem, no network, no `gh`, no `process.env` reads. Callers pass values in.
- **Tests live at `bin/lib/issues/tests/{name}.test.js`** and are already covered by `package.json`'s existing glob for that directory — do not add a new glob (`[IL-84]` applies only to a *new* `bin/lib/{name}/tests/` directory).
- **No emojis in skill files.** Use `**(Recommended)**` for emphasis.
- **A skill reference inside actionable instruction text uses the fully-qualified `/claude-tweaks:{skill}` form.**
- **Do not write closing keywords (`closes #N`, `fixes #N`, `resolves #N`) in commit messages.** Use `refs #N`. The closing-commit reconstruction in `/claude-tweaks:demo` greps for those keywords and a commit that merely *discusses* one shadows the real one.
- **Treat 40 KB as the soft ceiling for any single `SKILL.md` or `_shared/*.md`.** Check the file's size before adding a block to it.
- **`bin/lib/issues/trust.js` is consumed by `skills/_shared/trust-table.md`**, which is *inlined verbatim* into `/claude-tweaks:help` Stage 4.8's subagent prompt. A change to the module's row shape is a change to that file's Render section. Both must move together (`[IL-60]`).

---

## Context an implementer needs

Phase 2 (v6.51.0) shipped the trust table read-only. Its measured state on this repo today, from the live `gh issue list`:

| Cell | total | approved | changes-req | undispositioned | notPlanned | verdict |
|---|---|---|---|---|---|---|
| `human:human\|elevated` | 50 | 0 | 0 | 50 | 1 | insufficient-evidence |
| `human:human\|low` | 40 | 0 | 0 | 40 | 0 | insufficient-evidence |
| `producer:capture\|elevated` | 19 | 0 | 0 | 19 | 3 | insufficient-evidence |
| `producer:capture\|low` | 8 | 0 | 0 | 8 | 0 | insufficient-evidence |
| 6 further cells | 1–2 each | 0 | 0 | all | — | insufficient-evidence |

**Zero acceptance verdicts exist repo-wide.** Every cell is `insufficient-evidence`, so everything this plan builds is inert on the day it ships. That is the intended order — the ceiling must exist before anything can exceed it — but it means no task here can be validated against a live non-empty cell. Validate against constructed fixtures, and do not "confirm" a behavior by observing the live table.

Two defects in the shipped verdict rule, both measured, are why Task 1 exists:

1. **One verdict grades a whole class.** The rule is `total >= MIN_SAMPLES(8) && dispositioned >= 1`. Flipping a single record in `human:human|low` (40 records) to `demo:approved` yields `verdict: 'clean'` — 1 approval, 39 unknowns. Display-only that was tolerable, because the counts render beside the verdict. A governor reading `verdict` makes it a live grant.
2. **A declined record poisons a class permanently.** `clean` requires `notPlanned === 0`. `human:human|elevated` has one and `producer:capture|elevated` has three, so those two cells can never be `clean` no matter what happens next. A record closed `NOT_PLANNED` was *declined* — no work product exists to judge — so counting it as a quality failure is a category error, and with no time window in the table it is an unrecoverable one.

---

### Task 1: The gradability floor

**Files:**
- Modify: `bin/lib/issues/trust.js`
- Modify: `bin/lib/issues/tests/trust.test.js`
- Modify: `skills/_shared/trust-table.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MIN_VERDICTS` (new named export, `5`). Each row gains two fields — `dispositioned` (number, `approved + changesRequested`) and `coverage` (number, `dispositioned / total`, `0` when `total` is `0`). `verdict` keeps its three values (`clean` | `mixed` | `insufficient-evidence`). Task 2 reads `verdict`, `kind`, `dispositioned`, and `coverage`.

- [ ] **Step 1: Write the failing tests**

Append to `bin/lib/issues/tests/trust.test.js`. Add `MIN_VERDICTS` to the existing `require` on line 5 so it reads:

```js
const { riskBand, trustRows, MIN_SAMPLES, MIN_VERDICTS } = require('../trust.js');
```

Then append these tests:

```js
test('one verdict cannot grade a class of forty', () => {
  // The shipped rule was `dispositioned >= 1`. Measured against this repo, that
  // let a single approval grade a 40-record cell 'clean' — 1 known, 39 unknown.
  // Harmless while the table only rendered; a live grant once a governor reads it.
  const records = Array.from({ length: 40 }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED',
  }));
  records[0].labels = ['by:capture', 'risk:low', 'demo:approved'];
  const row = trustRows(records)[0];
  assert.equal(row.total, 40);
  assert.equal(row.dispositioned, 1);
  assert.equal(row.verdict, 'insufficient-evidence');
});

test('the verdict floor is MIN_VERDICTS, and it is a floor on verdicts not records', () => {
  const build = (approvals) => {
    const records = Array.from({ length: 40 }, (_, i) => ({
      number: i + 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED',
    }));
    for (let i = 0; i < approvals; i += 1) {
      records[i].labels = ['by:capture', 'risk:low', 'demo:approved'];
    }
    return trustRows(records)[0];
  };
  assert.equal(build(MIN_VERDICTS - 1).verdict, 'insufficient-evidence');
  assert.equal(build(MIN_VERDICTS).verdict, 'clean');
});

test('sample floor and verdict floor are both required', () => {
  // MIN_VERDICTS verdicts in a cell too small to be a class yet: still ungraded.
  const records = Array.from({ length: MIN_VERDICTS }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED',
  }));
  const row = trustRows(records)[0];
  assert.ok(row.total < MIN_SAMPLES, 'fixture must sit below the sample floor');
  assert.equal(row.dispositioned, MIN_VERDICTS);
  assert.equal(row.verdict, 'insufficient-evidence');
});

test('a declined record is not a quality failure and never blocks a verdict', () => {
  // NOT_PLANNED means the record was declined — no work product exists to judge.
  // Counting it as a negative made two of this repo's four real cells
  // permanently ungradable, since the table has no time window to age it out.
  const records = Array.from({ length: MIN_SAMPLES }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED',
  }));
  records.push({
    number: 99, labels: ['by:capture', 'risk:low'], body: '',
    state: 'CLOSED', stateReason: 'NOT_PLANNED',
  });
  const row = trustRows(records)[0];
  assert.equal(row.notPlanned, 1, 'still counted and still rendered');
  assert.equal(row.verdict, 'clean', 'but not a verdict input');
});

test('changes-requested and follow-ups remain verdict inputs', () => {
  // Control for the test above: removing notPlanned from the clean test must not
  // remove the two signals that ARE about work quality.
  const base = () => Array.from({ length: MIN_SAMPLES }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED',
  }));

  const rejected = base();
  rejected[0].labels = ['by:capture', 'risk:low', 'demo:changes-requested'];
  assert.equal(trustRows(rejected)[0].verdict, 'mixed');

  const followedUp = [...base(), { number: 100, labels: [], body: 'Origin: demo changes-requested from #1', state: 'OPEN' }];
  assert.equal(trustRows(followedUp)[0].verdict, 'mixed');
});

test('coverage is reported and is dispositioned over total', () => {
  const records = Array.from({ length: 10 }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED',
  }));
  for (let i = 0; i < 5; i += 1) records[i].labels = ['by:capture', 'risk:low', 'demo:approved'];
  const row = trustRows(records)[0];
  assert.equal(row.dispositioned, 5);
  assert.equal(row.coverage, 0.5);
});

test('an unstructured cell stays ungradable however many verdicts it collects', () => {
  // Task 2 denies this kind independently; this asserts the pin still holds
  // after the floor change, so the two defenses stay genuinely independent.
  const overlong = 'Origin: ' + 'x'.repeat(80);
  const records = Array.from({ length: MIN_SAMPLES + MIN_VERDICTS }, (_, i) => ({
    number: i + 1, labels: ['risk:low', 'demo:approved'], body: overlong, state: 'CLOSED',
  }));
  const row = trustRows(records)[0];
  assert.equal(row.provenance, 'unstructured:unstructured');
  assert.ok(row.dispositioned >= MIN_VERDICTS);
  assert.equal(row.verdict, 'insufficient-evidence');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/trust.test.js`

Expected: FAIL. `MIN_VERDICTS` is `undefined`, so the floor tests throw or compare against `NaN`; `row.dispositioned` and `row.coverage` are `undefined`; the declined-record test reports `mixed`.

- [ ] **Step 3: Implement**

In `bin/lib/issues/trust.js`, add the constant immediately after `MIN_SAMPLES`'s block:

```js
// MIN_SAMPLES floors the cell; this floors the evidence *inside* it. The shipped
// rule asked only for one disposition, which on this repo's own data let a single
// approval grade a 40-record class 'clean' — 1 known outcome, 39 unknown. That was
// survivable while the table only rendered, because the counts sit beside the
// verdict and a human reads both. A governor reads the verdict alone.
//
// Five is the smallest run that is not an anecdote, and at roughly ten closed
// records per class per month it is reachable in weeks rather than quarters — the
// binding constraint on this number is that an unreachable floor makes the whole
// table decorative, which is the failure mode that already killed demo:pending.
const MIN_VERDICTS = 5;
```

Replace the row-mapping block (currently lines 156–164) with:

```js
  const rows = Array.from(cells.values()).map((cell) => {
    const dispositioned = cell.approved + cell.changesRequested;
    const coverage = cell.total === 0 ? 0 : dispositioned / cell.total;
    let verdict = 'insufficient-evidence';
    if (
      cell.kind !== UNGRADABLE_KIND &&
      cell.total >= MIN_SAMPLES &&
      dispositioned >= MIN_VERDICTS
    ) {
      // notPlanned is deliberately absent. A record closed NOT_PLANNED was
      // declined — no work product was ever produced for this class to be judged
      // on — so reading it as a quality failure is a category error. It was also
      // an unrecoverable one: this table has no time window, so the single
      // NOT_PLANNED in this repo's `human:human|elevated` cell and the three in
      // `producer:capture|elevated` would have pinned both to 'mixed' forever,
      // whatever evidence arrived afterward. It stays counted and stays rendered
      // — it says something real about a class's filing precision — but it is not
      // a verdict input.
      const clean = cell.changesRequested === 0 && cell.followUps === 0;
      verdict = clean ? 'clean' : 'mixed';
    }
    return { ...cell, dispositioned, coverage, verdict };
  });
```

Update the export line to:

```js
module.exports = { riskBand, trustRows, MIN_SAMPLES, MIN_VERDICTS };
```

- [ ] **Step 4: Run the whole issues suite to verify it passes**

Run: `node --test bin/lib/issues/tests/`

Expected: PASS, all files. The pre-existing tests at lines 111–128 and 159–166 of `trust.test.js` use `MIN_SAMPLES` (8) and `MIN_SAMPLES + 4` (12) fully-approved records, both of which clear `MIN_VERDICTS`, so they must still pass unchanged. **If either now fails, stop — that means the floor was applied to the wrong population.**

- [ ] **Step 5: Update the shared render contract**

In `skills/_shared/trust-table.md`:

Add two columns to the Render table (after `Undispositioned`), so the header row and the template row become:

```markdown
| Provenance | Risk | Total | Approved | Changes Requested | Undispositioned | Coverage | Not Planned | Follow-ups | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| {provenance} | {band} | {total} | {approved} | {changesRequested} | {undispositioned} | {coverage} | {notPlanned} | {followUps} | {verdict} |
```

Render `{coverage}` as a percentage with no decimals (`row.coverage`, e.g. `0.125` renders `13%`).

Immediately after the existing **"Undispositioned is never omitted..."** paragraph, add:

```markdown
**Coverage is the fraction of a class's closed records that carry any verdict at all**
(`dispositioned / total`), and it is the figure that says whether a Verdict column can be
believed. A cell needs `trust.js`'s `MIN_VERDICTS` real dispositions before it grades at all, so
a graded cell is never resting on one lucky record — but a `clean` verdict at 12% coverage and
one at 90% are different claims, and only this column distinguishes them.

**Not Planned is counted and rendered, and is deliberately not a verdict input.** A record closed
`NOT_PLANNED` was declined before any work happened, so there is no work product for the class to
be judged on. It stays on the row because it says something real about a class's filing precision
— a class that files a lot of work nobody wants is worth seeing — but treating it as a quality
failure would be a category error, and with no time window in this table an unrecoverable one.
```

In the **All-insufficient collapse** paragraph, the sentence beginning *"A cell can read `insufficient-evidence` on sample count alone (`total` under `trust.js`'s `MIN_SAMPLES`, whatever its dispositions say)"* is now incomplete — there are two floors. Replace that sentence with:

```markdown
A cell can read `insufficient-evidence` on either floor alone — `total` under `trust.js`'s
`MIN_SAMPLES`, or `dispositioned` under its `MIN_VERDICTS` — whatever its dispositions say,
```

Then, at the end of the file, add:

```markdown
## Known limitation: no time window

Every count on this table is all-time. `changesRequested` and `followUps` are permanent, so a
class that earns one rejection is `mixed` from then on, with no path back however well it
performs afterward. That is the right failure direction for now — it is conservative, and on this
repo both counts are currently zero everywhere, so nothing is pinned yet. It stops being right as
soon as a class accumulates its first rejection and then improves.

The fix is a trailing evaluation window (grade on records closed in the last N days, keep the
all-time counts for display), which also subsumes the reason `notPlanned` had to leave the verdict
above. **Revisit when any cell first reads `mixed`** — that is the point at which the limitation
becomes observable rather than theoretical.
```

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/trust.js bin/lib/issues/tests/trust.test.js skills/_shared/trust-table.md
git commit -m "Floor the trust verdict on verdicts, not records, and stop declined work poisoning a class"
```

---

### Task 2: The ceiling and what it permits

**Files:**
- Create: `bin/lib/issues/autonomy.js`
- Create: `bin/lib/issues/tests/autonomy.test.js`

**Interfaces:**
- Consumes: Task 1's row shape — `verdict`, `kind`, `dispositioned`, `coverage`.
- Produces:
  - `CEILINGS` — `['supervised', 'trusted', 'unattended']`, ordered least to most permissive.
  - `resolveCeiling({ cliArg, runConfig, policy })` → one of `CEILINGS`. Precedence highest-first: `cliArg`, `runConfig`, `policy`, default `'supervised'`. Any unrecognized value at any level is ignored and resolution continues to the next source.
  - `permittedGrants({ ceiling, row })` → `{ bornReady: boolean, bornAuthorized: boolean, reason: string }`. `reason` is always a non-empty human-readable string naming why the answer is what it is; Task 4 renders it.

- [ ] **Step 1: Write the failing test**

Create `bin/lib/issues/tests/autonomy.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { CEILINGS, resolveCeiling, permittedGrants } = require('../autonomy.js');

const cleanRow = { verdict: 'clean', kind: 'producer', dispositioned: 9, coverage: 0.9 };

test('ceilings are ordered least to most permissive', () => {
  assert.deepEqual(CEILINGS, ['supervised', 'trusted', 'unattended']);
});

test('resolution follows CLI > run config > policy > default', () => {
  assert.equal(resolveCeiling({ cliArg: 'unattended', runConfig: 'trusted', policy: 'supervised' }), 'unattended');
  assert.equal(resolveCeiling({ runConfig: 'trusted', policy: 'supervised' }), 'trusted');
  assert.equal(resolveCeiling({ policy: 'trusted' }), 'trusted');
  assert.equal(resolveCeiling({}), 'supervised');
  assert.equal(resolveCeiling(undefined), 'supervised');
});

test('an unrecognized value is ignored, and resolution continues past it', () => {
  // Fail toward less autonomy, never toward more: a typo in policy.yml must not
  // silently resolve to a tier the operator did not name, in either direction.
  assert.equal(resolveCeiling({ cliArg: 'yolo', policy: 'trusted' }), 'trusted');
  assert.equal(resolveCeiling({ cliArg: 'TRUSTED' }), 'supervised', 'case-sensitive by design');
  assert.equal(resolveCeiling({ policy: '' }), 'supervised');
});

test('supervised permits nothing, whatever the evidence says', () => {
  const result = permittedGrants({ ceiling: 'supervised', row: cleanRow });
  assert.equal(result.bornReady, false);
  assert.equal(result.bornAuthorized, false);
  assert.ok(result.reason.length > 0);
});

test('trusted permits born-ready on a clean class, never born-authorized', () => {
  const result = permittedGrants({ ceiling: 'trusted', row: cleanRow });
  assert.equal(result.bornReady, true);
  assert.equal(result.bornAuthorized, false);
});

test('a mixed or ungraded class earns nothing at any ceiling', () => {
  for (const ceiling of CEILINGS) {
    for (const verdict of ['mixed', 'insufficient-evidence']) {
      const result = permittedGrants({ ceiling, row: { ...cleanRow, verdict } });
      assert.equal(result.bornReady, false, `${ceiling}/${verdict}`);
      assert.equal(result.bornAuthorized, false, `${ceiling}/${verdict}`);
    }
  }
});

test('the unstructured kind is denied at every ceiling, clean verdict or not', () => {
  // Defense in depth. trust.js pins this kind's verdict already; this module must
  // deny it on its own, so a future change to either one cannot open it alone.
  for (const ceiling of CEILINGS) {
    const result = permittedGrants({ ceiling, row: { ...cleanRow, kind: 'unstructured' } });
    assert.equal(result.bornReady, false, ceiling);
    assert.equal(result.bornAuthorized, false, ceiling);
    assert.match(result.reason, /unclassifi/i);
  }
});

test('a missing or malformed row is denied, not defaulted', () => {
  for (const row of [undefined, null, {}, { verdict: 'clean' }]) {
    const result = permittedGrants({ ceiling: 'unattended', row });
    assert.equal(result.bornReady, false);
    assert.equal(result.bornAuthorized, false);
  }
});

test('unattended permits born-authorized only on an explicit second opt-in', () => {
  // Machinery originating a grant contradicts _shared/work-record.md's standing
  // invariant ("auto:* labels are only ever added by an interactive human
  // session"). The tier is defined so the ceiling is complete, but the grant path
  // stays shut behind its own flag until that invariant is deliberately amended.
  const withoutOptIn = permittedGrants({ ceiling: 'unattended', row: cleanRow });
  assert.equal(withoutOptIn.bornReady, true);
  assert.equal(withoutOptIn.bornAuthorized, false);
  assert.match(withoutOptIn.reason, /opt-in/i);

  const withOptIn = permittedGrants({ ceiling: 'unattended', row: cleanRow, grantOriginationEnabled: true });
  assert.equal(withOptIn.bornAuthorized, true);
});

test('the second opt-in cannot raise a lower ceiling', () => {
  for (const ceiling of ['supervised', 'trusted']) {
    const result = permittedGrants({ ceiling, row: cleanRow, grantOriginationEnabled: true });
    assert.equal(result.bornAuthorized, false, ceiling);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test bin/lib/issues/tests/autonomy.test.js`

Expected: FAIL with `Cannot find module '../autonomy.js'`.

- [ ] **Step 3: Implement**

Create `bin/lib/issues/autonomy.js`:

```js
'use strict';

// Pure: the autonomy ceiling. Resolves which tier is in force and maps a trust
// row to the concrete permissions that tier allows for that class. Policy sets
// the ceiling; evidence sets the level — this module is where the two meet, and
// it grants nothing on its own. Callers apply the labels.
// See docs/superpowers/specs/2026-08-07-earned-autonomy-tier-design.md, Phase 3.

// Ordered least to most permissive. Index comparison is the tier test, so the
// order is load-bearing, not cosmetic.
const CEILINGS = ['supervised', 'trusted', 'unattended'];

// provenance.js's fourth kind. trust.js already pins its verdict to
// 'insufficient-evidence', so this check is redundant today — deliberately. The
// design's Phase 3 note calls out that "a consumer switching over three kinds
// silently drops it," and a redundant deny here means neither module can open
// this bucket on its own.
const UNGRADABLE_KIND = 'unstructured';

function isCeiling(value) {
  return typeof value === 'string' && CEILINGS.includes(value);
}

// Precedence per _shared/auto-mode-contract.md: CLI arg > run config > project
// policy > skill default. An unrecognized value at any level is skipped rather
// than honored or thrown on — a typo must never resolve to a tier nobody named,
// and falling through to the next source lands on 'supervised' in the worst case.
function resolveCeiling(sources) {
  const { cliArg, runConfig, policy } = sources || {};
  for (const candidate of [cliArg, runConfig, policy]) {
    if (isCeiling(candidate)) return candidate;
  }
  return 'supervised';
}

function atLeast(ceiling, minimum) {
  return CEILINGS.indexOf(ceiling) >= CEILINGS.indexOf(minimum);
}

const DENY = (reason) => ({ bornReady: false, bornAuthorized: false, reason });

// `row` is one of trustRows()'s rows. `grantOriginationEnabled` is the separate,
// explicit opt-in described below — never inferred from the ceiling.
function permittedGrants({ ceiling, row, grantOriginationEnabled } = {}) {
  const tier = isCeiling(ceiling) ? ceiling : 'supervised';

  if (!row || typeof row !== 'object' || typeof row.verdict !== 'string') {
    return DENY('no trust row for this class — nothing has been measured');
  }
  if (row.kind === UNGRADABLE_KIND) {
    return DENY('class is unclassifiable — provenance could not reduce these records to a class at all');
  }
  if (tier === 'supervised') {
    return DENY('autonomy ceiling is supervised — trust is recorded and displayed, never acted on');
  }
  if (row.verdict !== 'clean') {
    return DENY(`class verdict is ${row.verdict} — only a clean class earns anything`);
  }

  // At `trusted`, a class that has earned it may file spec-shaped work directly
  // as `ready`. That skips /claude-tweaks:specify, not the grant: `ready` asserts
  // shape, and _shared/work-record.md's human gate at /claude-tweaks:backlog
  // refine still stands between `ready` and any autonomous build.
  const bornReady = atLeast(tier, 'trusted');

  // `auto:build` is the actual authorization, and originating one from machinery
  // contradicts work-record.md's standing invariant that auto:* labels are only
  // ever added by an interactive human session — an invariant with a live eval
  // asserting it (evals/scenarios/backlog-refine-permission-matrix-compliance.yaml).
  // The tier is defined so the ceiling is complete; the grant path stays behind
  // its own opt-in until that invariant is deliberately amended, and reaching the
  // top tier is never by itself that amendment.
  if (!atLeast(tier, 'unattended')) {
    return { bornReady, bornAuthorized: false, reason: `class is clean and the ceiling is ${tier}` };
  }
  if (grantOriginationEnabled !== true) {
    return {
      bornReady,
      bornAuthorized: false,
      reason: 'ceiling is unattended, but machine-originated grants need their own explicit opt-in',
    };
  }
  return { bornReady, bornAuthorized: true, reason: 'class is clean, ceiling is unattended, grant origination opted in' };
}

module.exports = { CEILINGS, resolveCeiling, permittedGrants };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test bin/lib/issues/tests/autonomy.test.js`

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/autonomy.js bin/lib/issues/tests/autonomy.test.js
git commit -m "Add the autonomy ceiling resolver and its permission mapping"
```

---

### Task 3: The prose contracts

**Files:**
- Create: `skills/_shared/autonomy-ceiling.md`
- Modify: `skills/_shared/work-record.md`
- Modify: `skills/_shared/auto-mode-contract.md`
- Modify: `skills/_shared/policy-schema.md`
- Modify: `docs/diagrams/github-issues-lifecycle.html` (one explain-line — see Step 5)
- Modify: `docs/skill-graph.md` (the `/backlog` row under `## capture` — see Step 5)

**Interfaces:**
- Consumes: Task 2's `resolveCeiling` / `permittedGrants` contract, cited by name.
- Produces: `_shared/autonomy-ceiling.md` as the single source of truth every other file references rather than restates. Task 4 cites it.

Before editing, run `wc -c` on each file you are about to add to. `auto-mode-contract.md` is already 29 KB — keep its addition to the two lines specified below and do not expand it.

- [ ] **Step 1: Write `skills/_shared/autonomy-ceiling.md`**

Follow `_shared/unattended-tier.md`'s shape — it is the established precedent for a single-lever contract file. Sections, in order:

1. **Header paragraph** — single source of truth for the `autonomy` lever; names its consumers; states that `bin/lib/issues/autonomy.js` implements resolution and `bin/lib/issues/trust.js` supplies the evidence.
2. **What it authorizes** — a table with one row per tier, matching the design doc's table exactly:

   | Ceiling | Unlocks — only for classes that have earned it |
   |---|---|
   | `supervised` | Nothing. Trust is recorded and displayed, never acted on. The default. |
   | `trusted` | Born-`ready` for agent-filed residue whose class verdict is `clean` — skips `/claude-tweaks:specify`, never the human grant gate. |
   | `unattended` | Everything `trusted` allows, plus machine-originated `auto:build` — **gated behind its own opt-in**, see below. |

3. **Ceiling, not level** — quote the design's blockquote verbatim: evidence moves the level, policy caps it; a class that has earned trust still cannot exceed the configured ceiling, and lowering the ceiling revokes immediately without destroying history.
4. **Precedence** — the same four-step list `unattended-tier.md` uses, pointing at `resolveCeiling`. State that an unrecognized value is skipped rather than honored, and that the worst case is `supervised`.
5. **Floor rule** — a class earns nothing unless `permittedGrants` says so: `verdict === 'clean'`, which requires `total >= MIN_SAMPLES` **and** `dispositioned >= MIN_VERDICTS` **and** no `changes-requested` and no corrective follow-ups. `unstructured` is denied at every tier.
6. **Why born-authorized is gated separately** — state plainly that `trusted`'s born-`ready` and `unattended`'s born-authorized are different in kind, not degree. `ready` asserts shape and leaves the human gate standing; `auto:build` *is* the authorization, and originating one from machinery contradicts the standing invariant in `_shared/work-record.md`'s Grant semantics that `auto:*` labels are only ever added by an interactive human session — an invariant with a live eval asserting it (`evals/scenarios/backlog-refine-permission-matrix-compliance.yaml`). Reaching the top tier is not by itself an amendment of that invariant, so the grant path needs a second explicit opt-in.
7. **Logging** — one `decisions.md` entry per ceiling-authorized action, in the shape `unattended-tier.md` documents.

- [ ] **Step 2: Amend `skills/_shared/work-record.md`**

Three edits. Keep each minimal — this file is 20 KB.

(a) In the **Permission matrix**, the `/backlog refine` row's `Never` cell currently reads *"granting on a headless path, ..."*. Leave it exactly as-is — `trusted` does not change it — and add one row immediately after the **Health skills** row:

```markdown
| **Ceiling-authorized filing** (any agent path, `autonomy: trusted`+) | `ready` (born-ready) for a record whose provenance class has a `clean` trust verdict — see `_shared/autonomy-ceiling.md` | nothing | `auto:*` (a machine-originated grant needs `unattended` **plus** its own opt-in), `bot:*`, `parked` |
```

(b) In **Grant semantics**, the bullet reading *"`auto:*` labels are only ever added by an interactive human session; there is no machinery path that originates a grant"* is the invariant Phase 3 touches. Replace it with:

```markdown
- `auto:*` labels are only ever added by an interactive human session. The single
  exception is the `unattended` ceiling's machine-originated grant, which is shut by
  default and needs an explicit second opt-in beyond reaching that tier — see
  `_shared/autonomy-ceiling.md`. With that opt-in absent, which is its shipped state,
  there is no machinery path that originates a grant.
```

(c) In the **Born-ready rule**, append to the paragraph ending *"Captured and human-filed records start in backlog state and reach `ready` through `/specify`."* — that sentence is the claim this tier makes conditional, so the addition must sit directly after it:

```markdown
Under `autonomy: trusted` or higher, agent-filed records whose provenance class carries a
`clean` trust verdict file born-`ready` on the same reasoning — the class has demonstrated its
output is spec-shaped rather than being so by construction. See `_shared/autonomy-ceiling.md`.
```

- [ ] **Step 3: Amend `skills/_shared/auto-mode-contract.md`**

One edit only. In **Never-reversible (auto-FORBIDDEN, regardless of mode)**, the list has no entry for grants today — the prohibition lives in `work-record.md`. Add one, so the carve-out is visible where the never-reversible list is read:

```markdown
- Originating a work-record grant (`auto:build` / `auto:merge`) — except under the `autonomy` ceiling's `unattended` tier with its explicit grant-origination opt-in, for a class carrying a `clean` trust verdict (see `_shared/autonomy-ceiling.md`). Shut by default.
```

- [ ] **Step 4: Amend `skills/_shared/policy-schema.md`**

The `autonomy` row currently ends with *"`trusted` and `unattended` are declared now so the ceiling exists before anything can exceed it: **no consumer reads either value yet.** At `supervised` (the only value anything currently acts on), trust is computed and displayed and never acted on"*. That is now false. Replace from *"`trusted` and `unattended` are declared now"* to the end of the cell with:

```markdown
Resolved by `bin/lib/issues/autonomy.js`'s `resolveCeiling`, which maps `(ceiling, trust row)` to a concrete permission set; `_shared/autonomy-ceiling.md` is the contract. `trusted` unlocks born-`ready` filing for classes with a `clean` verdict; `unattended` additionally unlocks machine-originated grants, and that half is shut behind its own opt-in. At `supervised` — the default — trust is computed and displayed and never acted on
```

- [ ] **Step 5: Verify no stale claim survives**

`[IL-93]` — widening an enforcement mechanism without sweeping the prose describing its old reach. Run all three:

Every sweep excludes `docs/superpowers/plans/`. A plan documenting a claim's removal necessarily quotes that claim verbatim, so without the exclusion each of these matches this very file and reports a failure that is really its own text (`[IL-28]` — verified: all three do match this plan). Executed plans in that directory are archival records of what was true when they ran and are deliberately not swept.

```bash
grep -rn --exclude-dir=plans "no consumer reads either value" skills/ docs/ CLAUDE.md
grep -rniE --exclude-dir=plans "only ever added by an interactive human|no machinery path that originates" skills/ docs/ CLAUDE.md
grep -rniE --exclude-dir=plans "only after .{0,20}specify|reach .{0,30}ready.{0,20}through .{0,20}specify" skills/ docs/ README.md
```

The first must return nothing.

The second must return only the amended bullet in `work-record.md` and any deliberate quotation of it in `_shared/autonomy-ceiling.md` — **plus one hit that is not prose at all.** `docs/diagrams/github-issues-lifecycle.html:533` renders the invariant into a standalone visualization: *"auto:* labels are only ever added by an interactive human session — there is no machinery path that originates a grant."* Nothing in the repo references that file, so no test and no cross-reference check will ever catch it drifting; it is exactly the copied-data case where the copy is the stale part (`[IL-77]`). Amend that one `vz-ghi-explain-line` to match `work-record.md`'s new wording — the carve-out exists but is shut by default — and change nothing else in the file.

The third is the one a keyword sweep for "autonomy" would never have found: it catches prose asserting that `/claude-tweaks:specify` is the *only* road to `ready`, which `trusted` makes conditional. Two hits exist as of this plan — `skills/_shared/work-record.md:188` (fixed by Step 2c above) and `docs/skill-graph.md:74`, whose `/backlog` row reads *"Records `/capture` files reach `refine`'s grant worklist only after `/specify` shapes them to `ready`"*. Amend that row to note the born-`ready` path at `trusted`+.

**Open every hit from all three and read it** — the same claim is likely reworded somewhere these patterns do not reach, and correcting the first occurrence is not the fix (`[IL-17]`).

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/autonomy-ceiling.md skills/_shared/work-record.md skills/_shared/auto-mode-contract.md skills/_shared/policy-schema.md
git commit -m "Name the autonomy ceiling in the contracts that govern who may write a grant"
```

---

### Task 4: Surface trust in the existing grant console

**Files:**
- Modify: `skills/backlog/refine-mode.md`
- Modify: `skills/backlog/SKILL.md`
- Modify: `docs/skill-graph.md`

**Interfaces:**
- Consumes: Task 1's row shape, Task 2's `permittedGrants`, Task 3's `_shared/autonomy-ceiling.md`.
- Produces: no code. A rendered Trust column and a stated rule for how the ceiling modulates a recommendation.

`/claude-tweaks:backlog refine` **already has** a batched grant console — Step 3's `grant-check` pass, Step 4's unified table, one `AskUserQuestion` confirm. This task feeds trust into it. Do not build a second console.

- [ ] **Step 1: Add the trust fetch to Step 3**

In `skills/backlog/refine-mode.md`, at the end of **Step 3: Grant-check**, add:

Note the **four-backtick outer fence** below: the block being inserted itself contains a fenced bash block, and a three-backtick outer fence would terminate at the inner one, silently truncating what gets inserted (`[IL-27]`). Insert the inner content, not the outer fence.

````markdown
### Trust signal (advisory)

Resolve the `autonomy` ceiling and this run's trust table once, before rendering Step 4's table.
Fetch per `_shared/trust-table.md`'s Fetch section, then for each record resolve its provenance
class and look up that cell:

```bash
node -e "
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const { trustRows, riskBand } = require(root + '/bin/lib/issues/trust.js');
  const { resolveProvenance } = require(root + '/bin/lib/issues/provenance.js');
  const { resolveCeiling, permittedGrants } = require(root + '/bin/lib/issues/autonomy.js');
  const issues = require('/tmp/trust-table-records.json').map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
  const rows = new Map(trustRows(issues).map((r) => [r.key, r]));
  const ceiling = resolveCeiling({ policy: process.env.AUTONOMY_CEILING });
  const out = {};
  for (const issue of issues.filter((i) => i.state === 'OPEN')) {
    const { kind, source } = resolveProvenance({ labels: issue.labels, body: issue.body });
    const row = rows.get(kind + ':' + source + '|' + riskBand(issue.labels));
    const permitted = permittedGrants({ ceiling, row });
    out[issue.number] = {
      ceiling,
      verdict: row ? row.verdict : 'no-cell',
      coverage: row ? row.coverage : null,
      bornReady: permitted.bornReady,
      reason: permitted.reason,
    };
  }
  console.log(JSON.stringify(out));
" > /tmp/backlog-refine-trust.json
```

Read `autonomy` from `.claude-tweaks/policy.yml` and export it as `AUTONOMY_CEILING` before running
this; leave it unset when the key is absent, which resolves to `supervised`.

**This signal never changes what the gate recommends.** `/claude-tweaks:assess-agent-autonomy`'s
`grant-check` remains the sole source of the Recommended column — it reads *this record's* content,
where trust describes *this record's class*, and a class verdict is not evidence about a specific
record's shape. Trust rides along as context for the human making the batch decision. The one thing
the ceiling does change is described in Step 3.6.
````

- [ ] **Step 2: Add Step 3.6 — the born-ready effect**

Insert after Step 3.5, before Step 4:

```markdown
## Step 3.6: Ceiling-authorized born-ready (autonomy: trusted+)

The ceiling's only effect inside this skill is on **which records reach the worklist at all**, not
on what is recommended for them once here. At `trusted` or higher, an agent-filed record whose
provenance class carries a `clean` verdict files with `ready` already applied (see
`_shared/autonomy-ceiling.md`), so it appears in Step 1's fetch without having passed
`/claude-tweaks:specify`.

Those records are not exempt from anything here. Step 3.5's body-shape re-verification is exactly
the check that catches a born-`ready` record whose body is not actually spec-shaped, and it runs on
them unchanged — `_shared/work-record.md`'s "labels are projection, not truth" rule is what makes
the born-`ready` grant safe to give, because the gate re-derives shape rather than trusting the
label.

At `supervised` — the default, and the state of any repo that has not opted in — no record is ever
born-`ready` by this path and this step does nothing.
```

- [ ] **Step 3: Add the Trust column to Step 4's table**

Change the Step 4 table header and rows to include a `Trust` column between `Recommended` and `Suggested Tier`:

```markdown
| # | Record | Type | Origin | Current | Recommended | Trust | Suggested Tier | Rationale |
|---|---|---|---|---|---|---|---|---|
| 3 | #124: {title} | grant | by:capture | — | auto:build + auto:merge | producer:capture/low — clean, 62% coverage | — | {grant-check RATIONALE} |
| 4 | #118: {title} | grant | by:harness-health | bot:blocked | re-authorize (bot:blocked) | human/elevated — insufficient evidence | — | Prior failure — human judgment required |
```

Render the cell as `{provenance}/{band} — {verdict}` plus coverage when the verdict is `clean` or
`mixed`; render `no cell yet` when the record's class has no closed records. Populate it for
`grant`-type rows only; `priority` and `related` rows render `—`.

Immediately after the table, add:

```markdown
The `Trust` column is advisory and is never the reason a row is recommended — it describes how the
record's *class* has historically turned out, while the Recommended column comes from a content-aware
read of *this record*. A class with no evidence is the normal state, not a warning: on a repo that
has not been running `/claude-tweaks:demo`, every cell reads `insufficient evidence` and the column's
only job is to make that visible at the moment a human is granting anyway.
```

- [ ] **Step 4: Update SKILL.md and the skill graph**

In `skills/backlog/SKILL.md`, add one row to the Anti-Patterns table:

```markdown
| Treating the `Trust` column as the reason to grant, or withholding a grant because a class reads `insufficient evidence` | Trust describes a class's history; the grant is about this record's content and shape. Every class reads `insufficient evidence` until `/claude-tweaks:demo` has been run enough times, and that must not become a de facto freeze on granting |
```

Then add the new edges to `docs/skill-graph.md`: `/backlog refine` → `_shared/autonomy-ceiling.md` and `/backlog refine` → `_shared/trust-table.md`. Match the file's existing edge format exactly — read a neighbouring entry first.

- [ ] **Step 5: Verify the anti-pattern corpus count**

Adding a row to a skill's Anti-Patterns table moves the live corpus total asserted in
`bin/lib/skill-audit/tests/anti-patterns.test.js` (currently `358`). `[IL-99]` — do not compute the
new value by arithmetic and do not read it off the failure message. Run the parser:

```bash
node --test bin/lib/skill-audit/tests/anti-patterns.test.js
```

Take the actual total from the assertion failure, then **confirm it independently** by checking that
`git diff -- 'skills/*/SKILL.md' | grep -E '^-\|'` shows no evicted Anti-Pattern row. Update the
literal and add a dated comment block in the file's established style recording what was added.

- [ ] **Step 6: Run the full suite**

Run: `npm test 2>&1 | tail -30`

Redirect to a file first if the output is long (per this project's convention) rather than piping
directly. Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add skills/backlog/ docs/skill-graph.md bin/lib/skill-audit/tests/anti-patterns.test.js
git commit -m "Surface class trust in the existing grant console without letting it drive the grant"
```

---

## Release

Do this **after** the whole-branch review, not as a task inside it — per CLAUDE.md's Releasing
section, a plan that schedules its bump before the broad review has decided that any cross-task
defect ships as a patch.

- [ ] Re-run the version pre-check in full: `git fetch origin main`, then check `origin/main`'s
      manifest, every sibling worktree branch (`git worktree list`, then
      `git log --oneline main..<branch> -- .claude-plugin/plugin.json`), local `main`
      (`git show main:.claude-plugin/plugin.json`, `[IL-98]`), and unexecuted plans under
      `docs/superpowers/plans/` for version literals. `origin/main` was `6.51.1` when this plan was
      written and moved twice during Phase 2's execution — **re-check, do not reuse that number.**
- [ ] Bump `.claude-plugin/plugin.json`, add the `CHANGELOG.md` entry under `# Changelog`, and
      append the `docs/shipped-versions.tsv` line — **all three in one commit.**
- [ ] Update the design doc's Phase 3 section and Open Questions with what actually shipped, in the
      same *"Revised at Phase 3"* style Phase 2 used. Open question 1 is answered by Task 1
      (`MIN_VERDICTS = 5`, floored on verdicts not records); note that question 2's window is now a
      recorded limitation with a stated trigger rather than an open choice.
- [ ] Mirror to `thomasholknielsen/claude-tweaks-marketplace`: `plugins[].version` matches, bump
      `metadata.version`. Both pushes are one authorized action (`[IL-59]`) — do not stop to ask
      between them.

## Out of scope

- **The survival sweep.** The design lists it as conditional on the Phase 2 signals proving too
  thin. They cannot be shown too thin yet — no cell has any dispositioned evidence at all — so
  there is nothing to judge the question against. It stays a Phase 3-or-later option.
- **Phase 4 in its entirety** — the in-run initiative budget, the finalization drain, and
  verdict-only-where-it-matters routing in `/claude-tweaks:demo`.
- **Making the `unattended` grant path reachable.** Task 2 defines the tier and shuts the path
  behind an opt-in that nothing sets. Opening it means amending a security invariant with a live
  eval asserting it, which is a deliberate decision, not a step in this plan.
