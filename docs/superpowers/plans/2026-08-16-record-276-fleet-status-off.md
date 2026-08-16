# Routine Fleet Status and Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `fleet status` (aggregated posture dashboard: routine table + trust table + weekly counters) and `fleet off` (pause-based shutdown with a mandatory no-pause-verb fallback) for `/claude-tweaks:routine`, plus the outward documentation (help, README, skill-graph).

**Architecture:** Counter derivation is a new pure module `bin/lib/issues/fleet-counters.js` with its own fixture-driven test suite (that is what makes AC1 an automated test). The skill surface is two new sections in `skills/routine/fleet.md` (status/off) that loop existing machinery — `status.md`'s per-routine STATUS, `_shared/trust-table.md`'s Fetch+Render (cited verbatim, the same path `/backlog overview` uses — the shared home already exists, so no extraction of backlog prose is needed), and the fleet composition table's deterministic `PREFIXED_NAME`s as the fleet marker. Mode wiring lands in `skills/routine/SKILL.md`; diagrams in `skills/help/` + `README.md` (two-copy sync = one task).

**Tech Stack:** Node 18+ built-in `node --test`; markdown skill prose; `gh` CLI + `RemoteTrigger` at runtime (never called by the module or its tests).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T062945-spec-276-528-529-530/spec-276/work/276-spec.md` (materialized record #276)

## Global Constraints

- **Verified state at plan time (re-verified 2026-08-16, IL-109):** `#275` (fleet on) is CLOSED and `skills/routine/fleet.md` exists with the `on` procedure and the fleet-marker rule (Step 4.2). `#213` (pause verb) is OPEN — **no pause verb exists**, so `fleet off`'s no-pause-verb fallback (spec AC6) is the primary live path; write the pause path as the conditional branch taken only if a pause verb exists at execution time.
- Weekly window = rolling 7×24h ending at render time, boundaries computed from **full ISO datetimes**, never date-only (IL-47).
- Counters derive from GitHub's REST list (`gh issue list` / `gh api repos/.../issues`), **never `--search`** (search-index lag).
- Every counter names its enumeration source and blind spots inline — never a total over a domain the lookup can't enumerate (IL-110, IL-67).
- Machine grants are identified by the `<!-- grant-mode-audit: date={ISO} auto-merge={true|false} -->` comment marker (`skills/backlog/grant-mode.md`); a grant with no such marker is human. Read the landed marker shape; do not re-derive.
- Trust table rendering: cite `_shared/trust-table.md`'s Fetch and Render sections — never fork a third rendering (IL-32).
- `fleet off` **never deletes** anything and never touches non-fleet routines. `RemoteTrigger` has no delete API.
- The five STATUS verdicts (In sync / Drifted / Orphaned / Stale / Malformed) are a closed set — `skills/init/update-mode.md` enumerates them; do not add a sixth.
- Skill references inside actionable instruction text use the fully-qualified `/claude-tweaks:{skill}` form (CLAUDE.md cross-reference rule).
- Commits: `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes, `refs #276` (never `closes/fixes`).
- Every relationship between skills is stated once, in `docs/skill-graph.md` — no reciprocal restatement inside SKILL.md files.

---

### Task 1: `bin/lib/issues/fleet-counters.js` — pure counter derivation module (TDD)

**Files:**
- Create: `bin/lib/issues/fleet-counters.js`
- Test: `tests/bin-lib/issues/fleet-counters.test.js`

**Interfaces:**
- Consumes: nothing from other tasks (pure module; no network, no fs).
- Produces (exact exports, consumed by Task 2's fleet.md prose):
  - `WEEK_MS` — `7 * 24 * 60 * 60 * 1000`
  - `weeklyWindow(nowMs)` → `{ startMs, endMs, startIso, endIso }` where `endMs === nowMs`, `startMs === nowMs - WEEK_MS`, ISO fields via `new Date(ms).toISOString()`
  - `GRANT_AUDIT_RE` — regex matching `<!-- grant-mode-audit: date=2026-08-14T09:00:12Z auto-merge=false -->` (mirror `skills/backlog/grant-mode.md`'s marker; tolerate flexible internal whitespace like `bin/lib/issues/retry.js`'s `NEGATIVE_EVIDENCE_RE` does)
  - `fleetPosture({ grantUnitProvisioned, autonomy, grantOriginationEnabled })` → `'unattended'` when `grantUnitProvisioned === true && autonomy === 'unattended' && grantOriginationEnabled === true`, else `'supervised'`
  - `deriveFleetCounters(input, nowMs)` → see Step 3 for the exact input/output shape

- [ ] **Step 1: Write the failing test**

Create `tests/bin-lib/issues/fleet-counters.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  WEEK_MS, weeklyWindow, GRANT_AUDIT_RE, fleetPosture, deriveFleetCounters,
} = require('../../../bin/lib/issues/fleet-counters.js');

const NOW = Date.parse('2026-08-16T12:00:00Z');
const days = (n) => n * 24 * 60 * 60 * 1000;

test('weeklyWindow is a rolling 7x24h window ending at now, full ISO boundaries', () => {
  const w = weeklyWindow(NOW);
  assert.strictEqual(w.endMs, NOW);
  assert.strictEqual(w.endMs - w.startMs, WEEK_MS);
  assert.strictEqual(w.startIso, '2026-08-09T12:00:00.000Z');
  assert.strictEqual(w.endIso, '2026-08-16T12:00:00.000Z');
});

test('GRANT_AUDIT_RE matches the landed grant-mode audit marker shape', () => {
  assert.ok(GRANT_AUDIT_RE.test(
    '<!-- grant-mode-audit: date=2026-08-14T09:00:12Z auto-merge=false -->'));
  assert.ok(GRANT_AUDIT_RE.test(
    '<!--  grant-mode-audit:  date=2026-08-14T09:00:12Z  auto-merge=true  -->'));
  assert.ok(!GRANT_AUDIT_RE.test('Machine-granted by /claude-tweaks:backlog grant (headless).'));
});

test('fleetPosture: unattended requires grant unit + both unattended keys', () => {
  assert.strictEqual(fleetPosture({ grantUnitProvisioned: true, autonomy: 'unattended', grantOriginationEnabled: true }), 'unattended');
  assert.strictEqual(fleetPosture({ grantUnitProvisioned: false, autonomy: 'unattended', grantOriginationEnabled: true }), 'supervised');
  assert.strictEqual(fleetPosture({ grantUnitProvisioned: true, autonomy: 'supervised', grantOriginationEnabled: true }), 'supervised');
  assert.strictEqual(fleetPosture({ grantUnitProvisioned: true, autonomy: 'unattended', grantOriginationEnabled: false }), 'supervised');
});

// AC1 fixture: two fleet routines, one machine grant, one human grant, one revocation.
test('deriveFleetCounters: AC1 fixture renders all three counter groups, split correct', () => {
  const input = {
    routines: [
      { name: 'acme-code-health-daily', lastFiringIso: '2026-08-15T05:00:00Z' },
      { name: 'acme-docs-health-daily', lastFiringIso: '2026-07-01T06:15:00Z' }, // outside window
    ],
    findings: [
      { number: 101, createdAtIso: '2026-08-14T05:05:00Z' },
      { number: 102, createdAtIso: '2026-08-01T05:05:00Z' }, // outside window
    ],
    grants: [
      // machine: identified by the audit-comment marker, not label history
      { number: 101, grantedAtIso: '2026-08-14T09:00:12Z',
        commentBodies: ['Machine-granted by /claude-tweaks:backlog grant (headless).\n<!-- grant-mode-audit: date=2026-08-14T09:00:12Z auto-merge=false -->'] },
      // human: no marker anywhere
      { number: 103, grantedAtIso: '2026-08-13T10:00:00Z', commentBodies: ['looks good, granting'] },
    ],
    merges: [
      { number: 99, closedAtIso: '2026-08-12T16:00:00Z', viaMergeCommit: true },
      { number: 98, closedAtIso: '2026-08-12T16:00:00Z', viaMergeCommit: false }, // closed by hand — not a merge
    ],
    negativeEvidence: [
      { trustClass: 'code-health/low', atIso: '2026-08-15T20:00:00Z', source: 'marker' },
      { trustClass: 'code-health/low', atIso: '2026-08-15T21:00:00Z', source: 'revert' }, // same class — one downgrade event
      { trustClass: 'docs-health/low', atIso: '2026-06-01T00:00:00Z', source: 'marker' }, // outside window
    ],
  };
  const c = deriveFleetCounters(input, NOW);
  assert.strictEqual(c.firings.fired, 1);
  assert.strictEqual(c.firings.total, 2);
  assert.strictEqual(c.findings, 1);
  assert.strictEqual(c.grants.machine, 1);
  assert.strictEqual(c.grants.human, 1);
  assert.strictEqual(c.merges, 1);
  assert.strictEqual(c.revocations, 1); // per class-downgrade event, not per marker
  assert.strictEqual(c.window.endIso, '2026-08-16T12:00:00.000Z');
});

test('deriveFleetCounters: window boundary is >= start (inclusive) and <= end', () => {
  const atStart = new Date(NOW - WEEK_MS).toISOString();
  const beforeStart = new Date(NOW - WEEK_MS - 1000).toISOString();
  const c = deriveFleetCounters({
    routines: [], findings: [
      { number: 1, createdAtIso: atStart },
      { number: 2, createdAtIso: beforeStart },
    ], grants: [], merges: [], negativeEvidence: [],
  }, NOW);
  assert.strictEqual(c.findings, 1);
});

test('deriveFleetCounters: empty input renders zeros, not errors (partially provisioned fleet)', () => {
  const c = deriveFleetCounters({ routines: [], findings: [], grants: [], merges: [], negativeEvidence: [] }, NOW);
  assert.deepStrictEqual(c.grants, { machine: 0, human: 0 });
  assert.strictEqual(c.firings.total, 0);
  assert.strictEqual(c.revocations, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/issues/fleet-counters.test.js`
Expected: FAIL — `Cannot find module '.../bin/lib/issues/fleet-counters.js'`

- [ ] **Step 3: Write the implementation**

Create `bin/lib/issues/fleet-counters.js`:

```js
'use strict';
// Fleet counter derivation — pure data-in/data-out (#276).
// Callers (skills/routine/fleet.md's `fleet status` procedure) fetch records,
// comments, and trust reads themselves and feed plain objects in; this module
// never touches the network or the filesystem, which is what lets
// tests/bin-lib/issues/fleet-counters.test.js pin AC1 as an automated test.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Mirrors skills/backlog/grant-mode.md's audit-comment marker (#269) — the
// machine-grant signal. A grant with no marker anywhere is human-granted.
const GRANT_AUDIT_RE = /<!--\s*grant-mode-audit:\s*date=\S+\s+auto-merge=(?:true|false)\s*-->/;

// Rolling 7x24h window ending at nowMs. Full ISO datetimes, never a
// date-only boundary (IL-47).
function weeklyWindow(nowMs) {
  const startMs = nowMs - WEEK_MS;
  return {
    startMs,
    endMs: nowMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(nowMs).toISOString(),
  };
}

// 'unattended' posture = grant unit provisioned AND both unattended keys set;
// anything else is 'supervised'. Same two-key rule as fleet.md Step 3 — no
// third key, no paraphrase.
function fleetPosture({ grantUnitProvisioned, autonomy, grantOriginationEnabled }) {
  return grantUnitProvisioned && autonomy === 'unattended' && grantOriginationEnabled === true
    ? 'unattended'
    : 'supervised';
}

function inWindow(iso, w) {
  if (!iso) return false;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms >= w.startMs && ms <= w.endMs;
}

// input:
//   routines:  [{ name, lastFiringIso|null }]           — from per-routine STATUS
//   findings:  [{ number, createdAtIso }]               — health-swept records created in-window
//   grants:    [{ number, grantedAtIso, commentBodies }] — records granted auto:* ; marker => machine
//   merges:    [{ number, closedAtIso, viaMergeCommit }] — closed records; merge-closed only counts
//   negativeEvidence: [{ trustClass, atIso, source }]    — markers + detected reverts, per trust class
// returns { window, firings: {fired, total}, findings, grants: {machine, human}, merges, revocations }
function deriveFleetCounters(input, nowMs) {
  const w = weeklyWindow(nowMs);
  const routines = input.routines || [];
  const fired = routines.filter((r) => inWindow(r.lastFiringIso, w)).length;
  const findings = (input.findings || []).filter((f) => inWindow(f.createdAtIso, w)).length;

  let machine = 0;
  let human = 0;
  for (const g of input.grants || []) {
    if (!inWindow(g.grantedAtIso, w)) continue;
    const isMachine = (g.commentBodies || []).some((b) => GRANT_AUDIT_RE.test(b || ''));
    if (isMachine) machine += 1; else human += 1;
  }

  const merges = (input.merges || [])
    .filter((m) => m.viaMergeCommit && inWindow(m.closedAtIso, w)).length;

  // Revocations count per class-downgrade event, not per marker: N pieces of
  // in-window negative evidence on one trust class are one revocation.
  const revokedClasses = new Set(
    (input.negativeEvidence || [])
      .filter((e) => inWindow(e.atIso, w))
      .map((e) => e.trustClass),
  );

  return {
    window: w,
    firings: { fired, total: routines.length },
    findings,
    grants: { machine, human },
    merges,
    revocations: revokedClasses.size,
  };
}

module.exports = { WEEK_MS, weeklyWindow, GRANT_AUDIT_RE, fleetPosture, deriveFleetCounters };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/issues/fleet-counters.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/fleet-counters.js tests/bin-lib/issues/fleet-counters.test.js
git commit -m "Add fleet-counters module — pure weekly-counter derivation for fleet status (refs #276)"
```

---

### Task 2: `skills/routine/fleet.md` — `## Fleet status` section

**Files:**
- Modify: `skills/routine/fleet.md` (title/intro line 1-3, then append a new `## Fleet status (aggregation)` section before `## Anti-Patterns`)

**Interfaces:**
- Consumes: Task 1's exports by exact name (`deriveFleetCounters`, `fleetPosture`, `weeklyWindow`, `GRANT_AUDIT_RE` via `bin/lib/issues/fleet-counters.js`).
- Produces: the `## Fleet status (aggregation)` section Task 4's SKILL.md dispatch row points at.

- [ ] **Step 1: Update the file's framing**

In `skills/routine/fleet.md` line 1-3: change the title to `# Routine — Fleet Mode (\`fleet on\` / \`fleet status\` / \`fleet off\`)` and rewrite the sentence "`fleet status` and `fleet off` are a companion sub-issue's job (Non-Goals) — this file covers `on` only, and `on`'s own re-run **is** the reconcile path (there is no separate `fleet reconcile` verb)." to: "`on`'s own re-run **is** the reconcile path (there is no separate `fleet reconcile` verb). `fleet status` and `fleet off` live in their own sections below (#276)."

- [ ] **Step 2: Append the `## Fleet status (aggregation)` section**

Append before `## Anti-Patterns` (adjust connective prose freely; the structure, tables, source/blind-spot lines, and quoted sentences below are load-bearing):

````markdown
## Fleet status (aggregation)

One screen answering "what did my codebase do to itself this week." Read-only — no
`RemoteTrigger` create/update calls, no record writes, no grants. Renders cleanly when the
fleet is partially provisioned (missing templates, withheld grant unit, zero records): absent
rows render as absent, never as errors.

**Fleet membership** is resolved from the composition table above: compute every row's
`PREFIXED_NAME` (once — same derivation Step 4.1 uses), then intersect with the instantiated
records enumerated by `record-freshness.md` Steps F1-F2 (`compareRoutineRecords`' `records[]`,
authority copy — never a bare directory listing). A record whose filename matches no
composition-table `PREFIXED_NAME` is **not** fleet-marked and is excluded from every table and
counter below; a hand-created routine sharing a skill is invisible here by construction.

### Step S1 — Routine table

For each fleet-marked record, run `status.md` Steps 2-3.5 (parallel `RemoteTrigger get` calls,
per that file's own parallel-execution note) and render:

| Routine | Schedule | Last firing | Health |
|---|---|---|---|
| {name} | {record.schedule} | {last-run field from `RemoteTrigger get`, or "unknown — get response carries no last-run field"} | {STATUS verdict: In sync / Drifted / Orphaned / Stale / Malformed} |

Health is exactly `status.md`'s five-verdict set — never a sixth value.

### Step S2 — Trust table

Render the per-class trust table by running `_shared/trust-table.md`'s **Fetch** and **Render**
sections verbatim — the same shared path `/claude-tweaks:backlog overview` (Step 1.5) and
`/claude-tweaks:help` (Stage 4.8) already use. The Fetch section goes in whole, including its
`backlog-fetch-limit` and `work-links` resolution sub-sections. Never fork a third rendering
(IL-32).

### Step S3 — Weekly counters

Posture first — compute via `fleetPosture` (`bin/lib/issues/fleet-counters.js`):
`grantUnitProvisioned` = the grant unit's `{REPO_SLUG}-backlog-grant-weekdays.yml` record is
fleet-marked present; `autonomy` / `grantOriginationEnabled` from
`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values autonomy grant-origination-enabled`.
A **supervised** posture renders no grant counters and states why: "supervised fleet — no grant
unit provisioned (or unattended keys unset); grant counters not applicable."

Fetch the counter inputs (REST list, never `--search` — search-index lag), then derive every
number with `deriveFleetCounters(input, Date.now())` — the window is a rolling 7×24h window
ending at render time, boundaries computed from full ISO datetimes (IL-47), and is printed in
the header line: `Week of {startIso} → {endIso}`.

| Counter | Value | Source (stated inline in the render) | Blind spot (stated inline) |
|---|---|---|---|
| Firings | {fired}/{total} routines fired | per-routine STATUS `RemoteTrigger get` last-run field | only the *last* firing is visible — a routine that fired 7× counts once; a get response with no last-run field counts as not fired |
| Findings filed | {n} | records created in-window carrying a `by:*` origin label (`gh issue list` REST, `createdAt` in-window) | pre-dates nothing: only tracker-visible records; a finder whose filing failed is invisible |
| Grants issued | {machine} machine / {human} human | in-window `auto:build`/`auto:merge` label events; machine identified by the `<!-- grant-mode-audit: ... -->` comment marker (#269), human by its absence | grants counted from audit comments cannot see pre-feature history; a human grant's timestamp comes from the label-add event, which GitHub's timeline may paginate |
| Merges | {n} | closed records whose closing event carries a merge commit, `closedAt` in-window | records closed by hand (wontfix/duplicate) are excluded; squash-merges closed without a closing keyword are invisible |
| Revocations | {n} | trust reads — negative-evidence outcomes (failure-classification markers, `bin/lib/issues/retry.js`'s shape, and detected reverts) whose evidence entered the window, counted per class-downgrade event, not per marker | evidence is read from issue comments and git history; a revert pushed without landing on the integration branch is invisible |

Counter honesty is structural: each cell's Source and Blind spot columns render in the output —
never a bare total over a domain the lookup can't enumerate (IL-110, IL-67).

**Posture taxonomy (defined here, since status reports it):** a **supervised** fleet has no
grant routine provisioned (or unattended keys unset); an **unattended** fleet has the grant
routine present and both unattended keys true — detected from the provisioned set plus policy.
````

- [ ] **Step 3: Verify the section renders coherently**

Run: `grep -c "Blind spot" skills/routine/fleet.md`
Expected: ≥ 1. Also `grep -n "supervised" skills/routine/fleet.md` shows the posture taxonomy paragraph.

- [ ] **Step 4: Commit**

```bash
git add skills/routine/fleet.md
git commit -m "Add fleet status section — routine table, shared trust render, honest weekly counters (refs #276)"
```

---

### Task 3: `skills/routine/fleet.md` — `## Fleet off` section

**Files:**
- Modify: `skills/routine/fleet.md` (append `## Fleet off (pause-based shutdown)` after the Fleet status section; extend `## Anti-Patterns`)

**Interfaces:**
- Consumes: the fleet-membership resolution rule from Task 2's section (cite it: "resolved exactly as Fleet status resolves membership").
- Produces: the `## Fleet off (pause-based shutdown)` section Task 4's SKILL.md dispatch row points at.

- [ ] **Step 1: Append the `## Fleet off` section**

````markdown
## Fleet off (pause-based shutdown)

Pause-based shutdown that preserves all durable state — rotation cursors, wontfix
suppressions, trust history, and every instantiated record survive. `fleet off` **never
deletes anything** (`RemoteTrigger` has no delete API to call in the first place) and **never
touches a routine that is not fleet-marked** — a hand-created routine sharing a skill is
untouched by construction.

1. **Enumerate** fleet-marked routines exactly as Fleet status resolves membership
   (composition-table `PREFIXED_NAME`s ∩ `record-freshness.md`'s `records[]`). Capture the
   before-list. A repo with no fleet-marked routines reports that plainly — "no fleet-marked
   routines in this project; nothing to pause" — and stops. Not an error.
2. **Probe for the pause verb (#213).** Re-check at execution time whether the routine skill
   has a pause mechanism (a pause/disable action documented in `create-and-update.md` or an
   enabled/disabled field writable via `RemoteTrigger update`). #213 was open with no landed
   verb when this section shipped, so the fallback below is the expected live path, not an
   edge case.
3. **Pause path (verb exists):** pause each fleet-marked routine via the landed mechanism —
   consume whatever shipped, per #276's prerequisite note. Report the paused set and what
   state survives (records, cursors, suppressions, trust history — all of it).
4. **Fallback path (no pause verb — the live path today, AC6):** perform **no destructive
   action**. For each fleet-marked routine, report the deletion-vs-keep tradeoff instead:

   | Routine | If you delete it (manually, at claude.ai/code/routines) | If you keep it running |
   |---|---|---|
   | {name} | live firings stop; the instantiated record, rotation cursors, wontfix suppressions, and trust history all survive on disk — but deletion has no undo and re-provisioning re-creates billed infrastructure | keeps firing on schedule; report-only routines file findings as usual; the grant unit (if any) is harmless-by-construction at a downgraded ceiling (Gate 0 denies every candidate) |

   Close with: deletion is a manual step at claude.ai/code/routines (IL-69: destroying billed
   infrastructure must have a decided human owner); this skill never performs it.
5. **Verify scope (AC3):** list routines before and after — the after-list must show every
   fleet-marked routine paused (pause path) or untouched (fallback path), and every non-fleet
   routine byte-identical in state. Include both lists in the report.
6. **Round-trip note (AC4):** a paused fleet is resumed by re-running `fleet on` — Step 4's
   reconcile detects the existing records and updates/resumes rather than duplicating. The
   marker + paused-state semantics both verbs consume are this file's own composition-table
   `PREFIXED_NAME` rule (Step 4.2) — one home, both consumers.
````

- [ ] **Step 2: Extend `## Anti-Patterns`**

Add rows:

```markdown
| Deleting (or offering to delete) routines from `fleet off` | Deletion has no API and no undo — `fleet off` is pause-based precisely so durable state survives; deletion is a human act at claude.ai/code/routines (IL-69) |
| Pausing a routine that is not fleet-marked | A hand-created routine sharing a skill is someone else's infrastructure — membership is the composition-table `PREFIXED_NAME` intersection, never a skill-name match |
| Rendering grant counters on a supervised fleet | No grant unit exists to count — state the posture and why grant counters are absent instead of rendering zeros that imply a grant unit ran |
```

- [ ] **Step 3: Verify**

Run: `grep -n "never deletes\|never delete" skills/routine/fleet.md`
Expected: at least one hit in the Fleet off section.

- [ ] **Step 4: Commit**

```bash
git add skills/routine/fleet.md
git commit -m "Add fleet off section — pause-based shutdown with no-pause-verb fallback (refs #276)"
```

---

### Task 4: `skills/routine/SKILL.md` mode wiring + text-pinning test

**Files:**
- Modify: `skills/routine/SKILL.md` (argument-hint, Input table, Workflow table, FLEET stub, Next Actions note)
- Create: `tests/routine-fleet-status-off.test.js`

**Interfaces:**
- Consumes: Task 2/3's section names (`## Fleet status (aggregation)`, `## Fleet off (pause-based shutdown)`).
- Produces: the pinning test later tasks and `npm test` rely on.

- [ ] **Step 1: Write the failing pinning test**

Create `tests/routine-fleet-status-off.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const fleet = fs.readFileSync(path.join(ROOT, 'skills', 'routine', 'fleet.md'), 'utf8');
const skill = fs.readFileSync(path.join(ROOT, 'skills', 'routine', 'SKILL.md'), 'utf8');

test('fleet.md carries the status and off sections', () => {
  assert.ok(fleet.includes('## Fleet status (aggregation)'));
  assert.ok(fleet.includes('## Fleet off (pause-based shutdown)'));
});

test('fleet off pins never-delete and non-fleet scope (AC3/AC6)', () => {
  assert.ok(/never\s+deletes anything/i.test(fleet));
  assert.ok(fleet.includes('no destructive'));
  assert.ok(fleet.includes('deletion-vs-keep'));
});

test('fleet status pins posture taxonomy and counter honesty (AC2)', () => {
  assert.ok(fleet.includes('Posture taxonomy'));
  assert.ok(/supervised/.test(fleet) && /unattended/.test(fleet));
  assert.ok(fleet.includes('Blind spot'));
  assert.ok(fleet.includes('grant-mode-audit'));
});

test('SKILL.md wires fleet status and fleet off modes', () => {
  assert.ok(/\|\s*`fleet status`\s*\|/.test(skill));
  assert.ok(/\|\s*`fleet off`\s*\|/.test(skill));
  assert.ok(!skill.includes('are a companion sub-issue, not implemented here'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routine-fleet-status-off.test.js`
Expected: FAIL on the SKILL.md wiring test (fleet.md tests pass if Tasks 2-3 landed first).

- [ ] **Step 3: Wire SKILL.md**

1. `argument-hint` (line 4): replace `<fleet on>` with `<fleet on|status|off>`.
2. Input table: in the `fleet on` row, delete the sentence "`fleet status`/`fleet off` are a companion sub-issue, not implemented here." Add two rows after it:

```markdown
| `fleet status` | One aggregated read-only screen for the fleet: fleet-marked routine table (schedule, last firing, health), the per-class trust table, and the weekly counters (firings, findings, grants split human/machine, merges, revocations) with each counter's source and blind spots named inline. See `fleet.md`'s Fleet status section. |
| `fleet off` | Pause-based shutdown of every fleet-marked routine — durable state (records, rotation cursors, wontfix suppressions, trust history) survives. Never deletes; never touches non-fleet routines. With no pause verb landed (#213), reports the deletion-vs-keep tradeoff per routine and performs no destructive action. See `fleet.md`'s Fleet off section. |
```

3. Workflow mode-resolution sentence (line 47): extend to `(create | update | status | fleet on | fleet status | fleet off)`.
4. Workflow table: change the `fleet on` row's Mode cell to `fleet on / status / off` and its Covers cell to end with "…summary). `fleet status` and `fleet off` are the two companion sections in the same file (aggregated dashboard; pause-based shutdown)."
5. `### FLEET on` stub (line 74-76): retitle `### FLEET on / status / off`, append: "`fleet status` (aggregation over `status.md`'s per-routine STATUS, the shared trust render, and `bin/lib/issues/fleet-counters.js`) and `fleet off` (pause-based shutdown; no-pause-verb fallback reports deletion-vs-keep and performs no destructive action) live in the same file."
6. Next Actions: extend the fleet exemption sentence: "For `fleet on`, `fleet.md`'s own Step 5 summary is the terminal output — and for `fleet status` / `fleet off`, the rendered dashboard / shutdown report is likewise terminal. Omit this block for all three."

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/routine-fleet-status-off.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add skills/routine/SKILL.md tests/routine-fleet-status-off.test.js
git commit -m "Wire fleet status/off modes into routine SKILL.md — pinned by text test (refs #276)"
```

---

### Task 5: Outward documentation — help, README, skill-graph (two-copy sync = one task)

**Files:**
- Modify: `skills/help/reference-card.md` (fleet rows in the Utility section's routine entry area)
- Modify: `skills/help/context-flow.md` (fleet status surface in the findings→record→grants→dispatch diagram area + Reads/Writes table row)
- Modify: `README.md` (skill/artifact diagram + any lifecycle mention — both copies in the same commit)
- Modify: `docs/skill-graph.md` (`## routine` section edges)

**Interfaces:**
- Consumes: mode names from Task 4 (`fleet status`, `fleet off`).
- Produces: nothing downstream — terminal docs task.

- [ ] **Step 1: reference-card.md**

Find the `/claude-tweaks:routine` row (Utility section) and extend its description to name `fleet on|status|off` among the modes. If the Common Workflows section has a fleet/automation workflow, add `fleet status` as its observability step; otherwise add one line under the most fitting existing workflow: `/claude-tweaks:routine fleet status — what did my codebase do to itself this week`.

- [ ] **Step 2: context-flow.md**

In the findings→record→grants→dispatch diagram, add the fleet-status observability surface as a node or annotation (e.g. a `fleet status` read arrow over the routine/finder stage), and add a Reads/Writes table row: `routine fleet status | Reads: .claude-tweaks/routines/*.yml, RemoteTrigger get, tracker labels/comments, trust reads | Writes: nothing | Deletes: nothing`.

- [ ] **Step 3: README.md — same commit as Step 2's file**

In the skill/artifact diagram (the fenced block near the top), add a `routine fleet status/off` line in the utility area mirroring how other utility skills appear there — keep the row format of the surrounding lines. Verify the README work-record spine (line ~88-90) needs no change (fleet is not a work-record stage) — state that check's outcome in the commit body.

- [ ] **Step 4: docs/skill-graph.md**

In the `## routine` section, add edges (stated once, here only):

```markdown
- `fleet status` → `skills/routine/status.md` Steps 2-3.5 — aggregation loops the per-routine STATUS procedure over fleet-marked records
- `fleet status` → `_shared/trust-table.md` Fetch + Render — same shared rendering `/backlog overview` and `/help` consume
- `fleet status` → `bin/lib/issues/fleet-counters.js` — weekly counter derivation (pure module; fixtures pin AC1)
- `fleet off` → #213 (pause verb, open at ship time) — pause path consumes whatever ships; until then the no-pause-verb fallback reports deletion-vs-keep and performs no destructive action
```

- [ ] **Step 5: Verify sync + full suite**

Run: `grep -c "fleet" README.md skills/help/reference-card.md skills/help/context-flow.md docs/skill-graph.md`
Expected: ≥ 1 in each of the four files (AC5's two-separate-assertions rule: check README and the help diagram file independently).

Run: `node --test tests/routine-fleet-status-off.test.js tests/bin-lib/issues/fleet-counters.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skills/help/reference-card.md skills/help/context-flow.md README.md docs/skill-graph.md
git commit -m "Document fleet status/off — help + README diagrams (two-copy sync), skill-graph edges (refs #276)"
```
