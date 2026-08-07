# Supervised Trust Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute and display a per-class trust table derived from closed records, and ship the `autonomy` policy lever at its `supervised` setting — where trust is visible and acts on nothing.

**Architecture:** Two pure modules under `bin/lib/issues/`. `provenance.js` maps a record to one of three origin states (machine producer / side-effect / human) using labels and the `Origin:` body line that already exist. `trust.js` tallies outcomes per `(provenance × risk band)` cell from a record set. Both are derived on demand — no durable state, no migration, no backfill step. `/claude-tweaks:help` and `/claude-tweaks:backlog overview` render the table read-only.

**Tech Stack:** Node 18+ (no external deps), `node --test`, `gh` CLI, markdown skill files.

**Source spec:** `docs/superpowers/specs/2026-08-07-earned-autonomy-tier-design.md` — Phase 1 part 1.1 (as revised) and Phase 2. Phase 1's acceptance half shipped in v6.50.0.

## Global Constraints

- No emojis in skill files — use `**(Recommended)**` bold text for emphasis instead.
- Skill references inside actionable instruction text use the fully-qualified `/claude-tweaks:{skill}` form.
- New `bin/lib/` modules are CommonJS, matching every sibling in `bin/lib/issues/`.
- `bin/lib/issues/tests/*.test.js` is already in `package.json`'s test script — no glob change needed.
- Committed skill prose requires modules as `${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/...`. The worktree path is for local verification only and must never be committed.
- Every skill relationship is stated once in `docs/skill-graph.md` — never restated in a SKILL.md.
- **This phase changes no behavior.** `autonomy` ships with `supervised` as its only meaningful setting; `trusted` and `unattended` are declared in the enum but no consumer reads them yet. Nothing auto-grants, auto-fixes, or auto-merges as a result of this plan.
- Version bump: `git fetch origin main` first, then check `git log --oneline -5 origin/main -- .claude-plugin/plugin.json`, **every sibling worktree branch**, **local `main`** (it has collided three times — see `docs/incident-log.md`), and unexecuted plans under `docs/superpowers/plans/`.

---

### Task 1: Provenance resolver

**Files:**
- Create: `bin/lib/issues/provenance.js`
- Test: `bin/lib/issues/tests/provenance.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `resolveProvenance({labels: string[], body: string}) -> {kind: 'producer'|'side-effect'|'human', source: string}`
  - `PRODUCERS: string[]` — re-exported from `record.js`'s `ORIGINS`, never re-declared.

- [ ] **Step 1: Write the failing test**

Create `bin/lib/issues/tests/provenance.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { resolveProvenance, PRODUCERS } = require('../provenance.js');
const { ORIGINS } = require('../record.js');

test('PRODUCERS is record.js ORIGINS, not a second copy', () => {
  assert.deepEqual(PRODUCERS, ORIGINS);
});

test('a by:* label resolves to its producer', () => {
  assert.deepEqual(
    resolveProvenance({ labels: ['by:code-health', 'ready'], body: '' }),
    { kind: 'producer', source: 'code-health' }
  );
});

test('an unknown by:* label is not treated as a producer', () => {
  // Guards against a stray label inventing a trust class.
  assert.deepEqual(
    resolveProvenance({ labels: ['by:something-else'], body: '' }),
    { kind: 'human', source: 'human' }
  );
});

test('an Origin body line resolves to a side-effect class', () => {
  assert.deepEqual(
    resolveProvenance({ labels: [], body: 'Origin: ledger resolve gate\n\nSome text.' }),
    { kind: 'side-effect', source: 'ledger resolve gate' }
  );
});

test('the trailing "from ..." clause is stripped so the class is not per-record', () => {
  const a = resolveProvenance({ labels: [], body: 'Origin: wrap-up leftover from #42' });
  const b = resolveProvenance({ labels: [], body: 'Origin: wrap-up leftover from #91' });
  assert.equal(a.source, 'wrap-up leftover');
  assert.deepEqual(a, b);
});

test('"from session recall" collapses to the same class as "from #N"', () => {
  const byNumber = resolveProvenance({ labels: [], body: 'Origin: demo changes-requested from #17' });
  const byRecall = resolveProvenance({ labels: [], body: 'Origin: demo changes-requested from session recall' });
  assert.equal(byNumber.source, 'demo changes-requested');
  assert.deepEqual(byNumber, byRecall);
});

test('a parenthetical qualifier is a distinct class, not noise', () => {
  const plain = resolveProvenance({ labels: [], body: 'Origin: ledger resolve gate' });
  const ack = resolveProvenance({ labels: [], body: 'Origin: ledger resolve gate (acknowledged)' });
  assert.notEqual(plain.source, ack.source);
  assert.equal(ack.source, 'ledger resolve gate (acknowledged)');
});

test('a label beats an Origin line when both are present', () => {
  assert.deepEqual(
    resolveProvenance({ labels: ['by:capture'], body: 'Origin: wrap-up leftover from #42' }),
    { kind: 'producer', source: 'capture' }
  );
});

test('neither signal means human-filed', () => {
  assert.deepEqual(
    resolveProvenance({ labels: ['bug'], body: 'Just a description.' }),
    { kind: 'human', source: 'human' }
  );
  assert.deepEqual(resolveProvenance({}), { kind: 'human', source: 'human' });
});

test('Origin is only recognized at the start of a line', () => {
  // Prose mentioning the convention must not be read as a provenance claim.
  assert.deepEqual(
    resolveProvenance({ labels: [], body: 'We write Origin: wrap-up leftover in the body.' }),
    { kind: 'human', source: 'human' }
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test bin/lib/issues/tests/provenance.test.js`
Expected: FAIL — `Cannot find module '../provenance.js'`

- [ ] **Step 3: Write the implementation**

Create `bin/lib/issues/provenance.js`:

```js
'use strict';

// The Origin axis has three states (see skills/_shared/work-record.md):
//   producer    — one of record.js's ORIGINS, carried as a by:* label
//   side-effect — a record created by another skill's flow, carried as an
//                 `Origin: {context}` body line with deliberately no label
//   human       — neither signal; absence IS the signal
// This module reads that axis. It never writes one, and never extends ORIGINS.
const { ORIGINS } = require('./record.js');

const BY_LABEL = /^by:(.+)$/;
// Anchored to line start so prose describing the convention is not mistaken
// for a provenance claim.
const ORIGIN_LINE = /^Origin:[ \t]*(.+?)[ \t]*$/m;
// A trailing source reference makes the context per-record unique, which would
// explode the class count and give every cell a sample size of one.
const TRAILING_SOURCE = /\s+from\s+(#\d+|session recall)$/i;

function resolveProvenance({ labels, body } = {}) {
  const names = Array.isArray(labels) ? labels : [];
  for (const name of names) {
    const match = BY_LABEL.exec(name);
    if (match && ORIGINS.includes(match[1])) {
      return { kind: 'producer', source: match[1] };
    }
  }

  const line = ORIGIN_LINE.exec(typeof body === 'string' ? body : '');
  if (line) {
    const source = line[1].replace(TRAILING_SOURCE, '').trim().toLowerCase();
    if (source) return { kind: 'side-effect', source };
  }

  return { kind: 'human', source: 'human' };
}

module.exports = { resolveProvenance, PRODUCERS: ORIGINS };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test bin/lib/issues/tests/provenance.test.js`
Expected: PASS, 10 tests, 0 failures

- [ ] **Step 5: Verify against real records, not just fixtures**

Run this against the live repo and paste the output into your report:

```bash
gh issue list --state all --limit 60 --json number,labels,body \
  --jq '[.[] | {number, labels: [.labels[].name], body}]' > /tmp/prov-sample.json

node -e "
  const { resolveProvenance } = require('$PWD/bin/lib/issues/provenance.js');
  const rows = require('/tmp/prov-sample.json');
  const counts = {};
  for (const r of rows) {
    const p = resolveProvenance(r);
    const k = p.kind + ':' + p.source;
    counts[k] = (counts[k] || 0) + 1;
  }
  console.log(counts);
"
```

Expected: a small number of distinct classes — `human:human` dominating, `producer:capture` present. If you see many one-off `side-effect:*` classes, the normalizer is under-stripping; report it rather than widening the regex blindly.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/provenance.js bin/lib/issues/tests/provenance.test.js
git commit -m "Add the provenance resolver for the three-state Origin axis"
```

---

### Task 2: Trust table

**Files:**
- Create: `bin/lib/issues/trust.js`
- Test: `bin/lib/issues/tests/trust.test.js`

**Interfaces:**
- Consumes: `resolveProvenance` (Task 1); `dispositionState` from `bin/lib/issues/acceptance.js` (shipped in v6.50.0).
- Produces:
  - `riskBand(labels: string[]) -> 'low' | 'elevated'`
  - `trustRows(records: Array<{number, labels, body, state, stateReason}>) -> Array<{key, provenance, band, total, approved, changesRequested, undispositioned, notPlanned, followUps, verdict}>`

**Outcome signals** — all derivable from one `gh issue list` call, no git and no extra API:

| Signal | Meaning |
|---|---|
| `demo:approved` | positive — a human confirmed it solved the problem |
| `demo:changes-requested` | negative — a human found a gap |
| a follow-up record whose `Origin:` line names `#N` | negative for `#N` — the work generated corrective work |
| `stateReason: NOT_PLANNED` | negative-ish — closed as wontfix/duplicate |
| no `demo:*` label | unknown — not evidence either way, counted separately and never as success |

`verdict` is `'insufficient-evidence'` until a cell has both a minimum sample count and at least one dispositioned record. **A cell with no dispositioned records is never `trusted`, regardless of size** — this is the whole point: absence of a verdict is not a pass.

- [ ] **Step 1: Write the failing test**

Create `bin/lib/issues/tests/trust.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { riskBand, trustRows, MIN_SAMPLES } = require('../trust.js');

test('riskBand splits low from everything else', () => {
  assert.equal(riskBand(['risk:low']), 'low');
  assert.equal(riskBand(['risk:medium']), 'elevated');
  assert.equal(riskBand(['risk:high']), 'elevated');
});

test('an unscored record is elevated, never low', () => {
  // Absence of a score is not evidence of safety.
  assert.equal(riskBand([]), 'elevated');
  assert.equal(riskBand(undefined), 'elevated');
});

test('rows key on provenance and band together', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 2, labels: ['by:capture', 'risk:high', 'demo:approved'], body: '', state: 'CLOSED' },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.key).sort(), ['capture|elevated', 'capture|low']);
});

test('approved and changes-requested are tallied separately', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 2, labels: ['by:capture', 'risk:low', 'demo:changes-requested'], body: '', state: 'CLOSED' },
  ]);
  assert.equal(rows[0].approved, 1);
  assert.equal(rows[0].changesRequested, 1);
});

test('an undispositioned record counts as unknown, never as success', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED' },
  ]);
  assert.equal(rows[0].undispositioned, 1);
  assert.equal(rows[0].approved, 0);
  assert.equal(rows[0].verdict, 'insufficient-evidence');
});

test('a cell with many records but no verdicts is still insufficient evidence', () => {
  const many = Array.from({ length: MIN_SAMPLES + 10 }, (_, i) => ({
    number: i + 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED',
  }));
  const rows = trustRows(many);
  assert.equal(rows[0].total, MIN_SAMPLES + 10);
  assert.equal(rows[0].verdict, 'insufficient-evidence');
});

test('a follow-up record counts against the record it names', () => {
  const rows = trustRows([
    { number: 7, labels: ['by:capture', 'risk:low', 'demo:approved'], body: '', state: 'CLOSED' },
    { number: 8, labels: [], body: 'Origin: demo changes-requested from #7', state: 'OPEN' },
  ]);
  const capture = rows.find((r) => r.key === 'capture|low');
  assert.equal(capture.followUps, 1);
});

test('NOT_PLANNED is tallied as its own negative-ish signal', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED', stateReason: 'NOT_PLANNED' },
  ]);
  assert.equal(rows[0].notPlanned, 1);
});

test('open records are excluded — trust is about outcomes', () => {
  const rows = trustRows([
    { number: 1, labels: ['by:capture', 'risk:low'], body: '', state: 'OPEN' },
  ]);
  assert.equal(rows.length, 0);
});

test('rows are returned in a stable order', () => {
  const input = [
    { number: 1, labels: ['by:docs-health', 'risk:low'], body: '', state: 'CLOSED' },
    { number: 2, labels: ['by:capture', 'risk:low'], body: '', state: 'CLOSED' },
  ];
  assert.deepEqual(trustRows(input).map((r) => r.key), trustRows(input.reverse()).map((r) => r.key));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: FAIL — `Cannot find module '../trust.js'`

- [ ] **Step 3: Write the implementation**

Create `bin/lib/issues/trust.js`. Implement to satisfy the tests above. Required behaviors, stated so you do not have to infer them:

- `MIN_SAMPLES` is exported and set to `8`. Rationale to put in a comment: at roughly ten closed records per class per month, eight is about a month of evidence — small enough to ever graduate, large enough that one lucky record cannot carry a cell. It is a starting value, deliberately conservative, and Phase 3 is where it earns or loses its keep.
- Only records with `state === 'CLOSED'` form cells. Open records are still scanned for follow-up `Origin:` references, because an open follow-up is evidence about the closed record it names.
- A follow-up is any record whose `Origin:` body line ends in `from #N`; it increments `followUps` on the cell owning `#N`. Parse `#N` before `resolveProvenance` strips it.
- `verdict` is `'insufficient-evidence'` unless `total >= MIN_SAMPLES` AND `(approved + changesRequested) >= 1`. When both hold, it is `'clean'` if `changesRequested === 0 && followUps === 0 && notPlanned === 0`, else `'mixed'`. **No verdict value in this phase authorizes anything** — `trusted` is deliberately not one of the values, because nothing consumes it yet.
- Rows sort by `key` so output is stable regardless of input order.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: PASS, 10 tests, 0 failures

- [ ] **Step 5: Run against the live repo**

Fetch closed and open records, feed them to `trustRows`, and paste the rendered table into your report. Expect most cells to read `insufficient-evidence` — this repo has essentially no acceptance verdicts yet, which is the finding the whole design rests on. **A table showing lots of confident verdicts would mean the code is wrong**, not that the repo is healthy.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/trust.js bin/lib/issues/tests/trust.test.js
git commit -m "Tally per-class trust from closed records, with absence of a verdict never reading as success"
```

---

### Task 3: The `autonomy` lever and its display surfaces

**Files:**
- Modify: `bin/lib/policy-schema.js` (add to `POLICY_KEYS`)
- Modify: `skills/_shared/policy-schema.md` (document the lever)
- Modify: `skills/help/SKILL.md` (render the table)
- Modify: `skills/backlog/overview-mode.md` (render the table) — **confirm this filename first**; `/backlog`'s modes are in separate sub-files and the exact name must be read, not assumed.
- Test: `tests/policy-schema.test.js` (extend)

**Interfaces:**
- Consumes: `trustRows` (Task 2).
- Produces: policy key `autonomy`, enum `['supervised', 'trusted', 'unattended']`, default `'supervised'`.

- [ ] **Step 1: Read before changing**

Read `skills/_shared/policy-schema.md`'s section structure, `bin/lib/policy-schema.js`'s `POLICY_KEYS`, `tests/policy-schema.test.js`, and the `/claude-tweaks:help` and `/claude-tweaks:backlog overview` render points. State what each does now. Confirm the real filename for `/backlog`'s overview mode.

- [ ] **Step 2: Add the policy key**

Add to `POLICY_KEYS` in `bin/lib/policy-schema.js`:

```js
  { key: 'autonomy', type: 'enum', values: ['supervised', 'trusted', 'unattended'], default: 'supervised' },
```

- [ ] **Step 3: Document the lever**

Add a row to the appropriate table in `skills/_shared/policy-schema.md`. It must state plainly that the lever sets a **ceiling**, not a level: evidence moves the level within it, policy caps it. It must also state that `trusted` and `unattended` have **no consumers yet** — they are declared so the ceiling exists before anything can exceed it, and Phase 3 is what makes them act.

- [ ] **Step 4: Extend the policy test**

Add a case to `tests/policy-schema.test.js` asserting `autonomy` is recognized, that its default is `supervised`, and that an invalid value is reported as an invalid value rather than an unrecognized key.

- [ ] **Step 5: Render the table, read-only**

In both `/claude-tweaks:help` and `/claude-tweaks:backlog overview`, add a section that renders the trust table. Requirements:

- Read-only. It reports; it never grants, changes a label, or recommends an autonomous action.
- It must show the `undispositioned` count per cell, not hide it. That number is the point: it is the measure of how blind the system currently is.
- When every cell reads `insufficient-evidence`, say so in one line rather than rendering an all-empty table.
- Omit the section entirely under `work-backend: local-files` — the acceptance labels this reads are a `github-issues` concept.

- [ ] **Step 6: Verify and commit**

Run `node --test tests/policy-schema.test.js` and `npm test 2>&1 | tail -20`.

```bash
git add bin/lib/policy-schema.js skills/_shared/policy-schema.md skills/help/SKILL.md skills/backlog/*.md tests/policy-schema.test.js
git diff --cached --name-only
git commit -m "Add the autonomy ceiling lever at supervised, and surface the trust table read-only"
```

---

### Task 4: Cross-references and release

**Files:**
- Modify: `docs/skill-graph.md`
- Modify: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `docs/shipped-versions.tsv`

- [ ] **Step 1: Skill-graph edges**

Record the edges this plan creates: `/claude-tweaks:help` and `/claude-tweaks:backlog` each gain a dependency on `bin/lib/issues/trust.js`. Follow the file's producer-owns-the-edge convention; amend an existing row rather than duplicating a pair.

- [ ] **Step 2: Re-check the version — four sources, not three**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
git show main:.claude-plugin/plugin.json | grep '"version"'
git worktree list
grep -rn "6\.5[0-9]\." docs/superpowers/plans/ | grep -v "2026-08-07-supervised-trust-table"
```

Check `origin/main`, **local `main`**, every sibling worktree branch, and unexecuted plans. Local `main` is the one CLAUDE.md's written pre-check omits, and it is where all three of this feature's prior collisions came from. Re-run `git fetch origin main` immediately before pushing.

- [ ] **Step 3: Bump, changelog, shipped-versions**

Minor bump. `CHANGELOG.md` entry directly under `# Changelog` as `## v{version} — {summary}` (strict `X.Y.Z`, em-dash title — `bin/lib/changelog.js`'s parser and `tests/changelog-coverage.test.js` both depend on the exact shape). Append `{version}\t{YYYY-MM-DD}\trelease` to `docs/shipped-versions.tsv`. All three in one commit.

- [ ] **Step 4: Full suite, then commit**

```bash
npm test 2>&1 | tail -20
git add docs/skill-graph.md .claude-plugin/plugin.json CHANGELOG.md docs/shipped-versions.tsv
git diff --cached --name-only
git commit -m "Release {version} — a visible trust table that acts on nothing"
```

---

## Out of scope for this plan

- Anything that reads `autonomy: trusted` or `unattended` — Phase 3.
- Born-`ready` or born-authorized records, and amendments to `_shared/work-record.md`'s permission matrix — Phase 3.
- The in-run initiative budget and the finalization drain — Phase 4.
- Extending `record.js`'s `ORIGINS`. The three-state Origin axis is a documented decision; this plan reads it and does not change it.
- Git-derived survival signals (revert detection, path-overlap follow-ups). The four cheap signals in Task 2 come from one `gh` call. Git-walk survival is a later slice and is deliberately not started here — if it turns out to be needed, it is a Phase 3 input, not a Phase 2 gap.
