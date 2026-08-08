# Wrap-Up Phase Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `/claude-tweaks:wrap-up` into a four-phase architecture where the seven-plus curation steps become one code-backed engine (`bin/wrap-up-engine.js`) driving a declarative registry, and the report becomes the engine-rendered trace of the run.

**Architecture:** Phase 1 ESTABLISH (context + reflect + run-dir-everywhere) → Phase 2 ROUTE (engine `plan`/`record`/`render` over 8 registry rows; model supplies only judgment) → Phase 3 SETTLE (leftover routing, residue sweep, ledger gate) → Phase 4 CLOSE (one console in every mode, plan+execute cleanup, phase-trace report). Deterministic gates, scope selection, `SCANNED` audit lines, telemetry, and report rendering move into tested Node code; judgment procedures stay in slimmed prose judge files.

**Tech Stack:** Node 18+ built-ins only (no npm deps), `node --test`, markdown skill files.

**Spec:** `docs/superpowers/specs/2026-08-08-wrap-up-phase-architecture-design.md` (committed, user-approved).

## Global Constraints

- No new npm dependencies — `bin/` uses Node built-ins only (existing convention; `package.json` says "the plugin itself ships no runtime npm deps").
- `bin/lib/wrap-up/tests/*.test.js` is ALREADY in `package.json`'s test glob — do not add a new glob, do not create a new `bin/lib/` directory. All engine modules go in the existing `bin/lib/wrap-up/`.
- `bin/lib/skill-audit/tests/context-cost.test.js` enforces a 40 KB per-SKILL.md ceiling (`CEILING_BYTES`). The rewritten `skills/wrap-up/SKILL.md` MUST stay under it; run that test after the rewrite.
- No emojis anywhere in skill files. Skill references inside instruction text (Step bodies, Next Actions) use the fully-qualified `/claude-tweaks:{skill}` form.
- Internal vocabulary (D0–D5, "gap detection", "domain-overlap", step numbers, route codes) must never appear in engine-rendered user-facing output — `render` maps it out; a test asserts it.
- Parsed external JSON is never spread after derived fields (`{ ...parsed, derived }` never `{ derived, ...parsed }`) `[IL-01]`.
- Commit style: `{Verb} {what} — {detail}`, no conventional-commit prefixes. Commit after each task; verify `git diff --cached --name-only` before each commit `[IL-42]`.
- Work happens in the existing worktree `.claude/worktrees/wrap-up-phase-architecture` (branch `worktree-wrap-up-phase-architecture`). Every dispatched implementer prompt must anchor: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/wrap-up-phase-architecture" && pwd && git rev-parse --show-toplevel` before any edit or commit.
- Existing behavior contracts that must survive unchanged: ledger resolve Phase 2 per-item input; Q#/M#/U# per-item `AskUserQuestion` drills (never bulk-approved); `[adr-convention]` three-way per-item row; CLAUDE.md findings stage-only; `MULTISPEC_REVIEW_DEFER=1` defer protocol; the Auto-merge short-circuit; `--dry-run` semantics; Actions Performed table conventions (History never folded into Operational).

---

### Task 1: Registry data module

**Files:**
- Create: `bin/lib/wrap-up/registry.js`
- Test: `bin/lib/wrap-up/tests/registry.test.js`

**Interfaces:**
- Produces: `REGISTRY` (frozen array of row objects), `rowById(id)`, `ROW_IDS` (array of ids in order). Row shape:

```js
{
  id: 'skills',                    // machine id, kebab-case
  target: 'Skills',                // reader-facing name — EXACTLY what render prints
  judge: 'skill-curation.md',      // judge sub-file in skills/wrap-up/
  disposition: 'apply-or-stage',   // 'apply-or-stage' | 'stage' | 'stage-only'
  gate: { kind: 'facts', anyOf: ['skillsLibraryExists', 'multiFileDiff'] },
       // or { kind: 'signals', key: 'd4Count', nonZero: true }
       // or { kind: 'facts', anyOf: [...], orSignals: [...] }
  scope: { kind: 'domain-overlap', cap: 5, fastLaneCap: 2, budgetFlag: 'skill-budget' }
       // or { kind: 'frontmatter-overlap' } | { kind: 'fixed', paths: [...] }
       // or { kind: 'signals' } | { kind: 'renamed-deleted' }
}
```

- [ ] **Step 1: Write the failing test**

`bin/lib/wrap-up/tests/registry.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { REGISTRY, rowById, ROW_IDS } = require('../registry');

test('registry has the 8 rows in canonical order', () => {
  assert.deepStrictEqual(ROW_IDS, [
    'skills', 'docs', 'journeys', 'claude-md', 'decision-records',
    'memory', 'upstream', 'references',
  ]);
});

test('memory and upstream come after every other routing row', () => {
  const idx = (id) => ROW_IDS.indexOf(id);
  for (const id of ROW_IDS.filter((r) => r !== 'memory' && r !== 'upstream')) {
    assert.ok(idx(id) < idx('memory') && idx(id) < idx('upstream'), id);
  }
});

test('every row is complete and claude-md is stage-only', () => {
  for (const r of REGISTRY) {
    assert.ok(r.id && r.target && r.judge && r.disposition && r.gate && r.scope, r.id);
  }
  assert.strictEqual(rowById('claude-md').disposition, 'stage-only');
  assert.strictEqual(rowById('memory').disposition, 'stage');
  assert.strictEqual(rowById('upstream').disposition, 'stage');
});

test('registry is frozen', () => {
  assert.ok(Object.isFrozen(REGISTRY));
  assert.throws(() => { REGISTRY.push({}); }, TypeError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/wrap-up/tests/registry.test.js`
Expected: FAIL — `Cannot find module '../registry'`

- [ ] **Step 3: Write `bin/lib/wrap-up/registry.js`**

The 8 rows, with these exact values (targets are user-facing strings; judges are the post-Task-8/9 filenames):

| id | target | judge | disposition | gate | scope |
|----|--------|-------|-------------|------|-------|
| `skills` | `Skills` | `skill-curation.md` | `apply-or-stage` | facts anyOf `skillsLibraryExists`, `multiFileDiff` | domain-overlap, cap 5, fastLaneCap 2, budgetFlag `skill-budget` |
| `docs` | `Docs` | `docs-health-integration.md` | `apply-or-stage` | facts anyOf `docsTreeNonEmpty` | domain-overlap, cap 3, fastLaneCap 1, budgetFlag `doc-budget` |
| `journeys` | `Journeys` | `journey-curation.md` | `apply-or-stage` | facts anyOf `journeysExist` | frontmatter-overlap |
| `claude-md` | `CLAUDE.md & rules` | `claude-md-curation.md` | `stage-only` | facts anyOf `claudeMdCommandRenamed` orSignals `dontCandidate`, `contradictedConvention`, `incidentRecorded` | fixed: `CLAUDE.md`, `.claude/rules/` |
| `decision-records` | `Decision records` | `adr-curation.md` | `stage` | signals key `adrCandidateCount` nonZero | signals |
| `memory` | `Memory` | `memory-curation.md` | `stage` | signals key `d4Count` nonZero | signals |
| `upstream` | `Upstream feedback` | `upstream-feedback.md` | `stage` | signals key `d5Count` nonZero | signals |
| `references` | `Broken references` | `reference-sweep.md` | `apply-or-stage` | facts anyOf `renamedOrDeleted` | renamed-deleted |

Gate philosophy (record as a header comment): fact-gates are deterministic and computed by `facts.js`; where the true condition is a judgment (e.g. "cohesive multi-file pattern"), the fact-gate is the deterministic **superset** (`multiFileDiff`: 2+ changed files) and the judge applies the real criterion — a gate that opens slightly too often is safe (the judge returns clean), a gate that misses is the silent skip this engine exists to prevent. Signal-gates take model-supplied booleans/counts because no program can compute "a Don't candidate emerged from reflection".

Freeze with `Object.freeze(REGISTRY.map(Object.freeze))` semantics (freeze rows AND array; nested gate/scope objects too).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/wrap-up/tests/registry.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/wrap-up/registry.js bin/lib/wrap-up/tests/registry.test.js
git commit -m "Add wrap-up curation registry — 8 declarative rows with gates, scopes, dispositions"
```

---

### Task 2: Git/filesystem facts module

**Files:**
- Create: `bin/lib/wrap-up/facts.js`
- Test: `bin/lib/wrap-up/tests/facts.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `gatherFacts({ cwd, base })` → `{ isRepo, changedFiles: string[], renamedDeleted: [{status, oldPath, newPath}], skillsLibraryExists, multiFileDiff, docsTreeNonEmpty, journeysExist, journeyFiles: string[], claudeMdCommandRenamed, renamedOrDeleted }`. All booleans; `changedFiles` from `git diff --name-only {base}...HEAD`; `renamedDeleted` from `git diff --diff-filter=RD --name-status {base}...HEAD`; `claudeMdCommandRenamed` true when the diff touches `CLAUDE.md` AND removes a line inside its `## Commands` section (compare `git show {base}:CLAUDE.md` section lines vs worktree file — a removed command line, not any edit). Follow `bin/lib/wrap-up/state.js`'s existing pattern: `execFileSync('git', ...)` wrapped in try/catch returning degraded values, never throwing on a non-repo.

- [ ] **Step 1: Write the failing test**

Follow the existing fixture pattern in `bin/lib/wrap-up/tests/fixtures.js` (read it first; `state.test.js` shows usage). Build a temp git repo in `fs.mkdtempSync(path.join(os.tmpdir(), 'wrapup-facts-'))`: `git init -q`, commit a base (`CLAUDE.md` containing a `## Commands` section with the line `npm run oldcmd`, plus `docs/journeys/j1.md`, `.claude/skills/s1.md`, `docs/guide.md`), then a second commit that renames `docs/guide.md` → `docs/guide2.md`, deletes nothing else, edits `CLAUDE.md` to remove the `npm run oldcmd` line, and adds two source files. Test cases:

```js
test('gatherFacts reads diff-derived facts from a real repo', () => {
  const f = gatherFacts({ cwd: repoDir, base: baseSha });
  assert.strictEqual(f.isRepo, true);
  assert.strictEqual(f.skillsLibraryExists, true);
  assert.strictEqual(f.docsTreeNonEmpty, true);
  assert.strictEqual(f.journeysExist, true);
  assert.strictEqual(f.multiFileDiff, true);            // 2+ files changed
  assert.strictEqual(f.renamedOrDeleted, true);         // the rename
  assert.ok(f.renamedDeleted.some((r) => r.oldPath === 'docs/guide.md'));
  assert.strictEqual(f.claudeMdCommandRenamed, true);   // removed command line
});

test('gatherFacts degrades outside a repo', () => {
  const f = gatherFacts({ cwd: os.tmpdir(), base: 'HEAD' });
  assert.strictEqual(f.isRepo, false);
  assert.deepStrictEqual(f.changedFiles, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/wrap-up/tests/facts.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `facts.js`**

One exported function. Each fact from one measurement; `multiFileDiff = changedFiles.length >= 2`; existence checks via `fs.existsSync`/`fs.readdirSync` under `cwd` (journeys: glob `docs/journeys/*.md` via `readdirSync` + `.endsWith('.md')` — no glob dep). For `claudeMdCommandRenamed`: extract the `## Commands` fenced/список lines from both versions, fact is true when a non-blank line present in base is absent in the worktree version. `git show` failure (no CLAUDE.md at base) → false.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/wrap-up/tests/facts.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bin/lib/wrap-up/facts.js bin/lib/wrap-up/tests/facts.test.js
git commit -m "Add wrap-up facts module — deterministic gate inputs read from git and fs"
```

---

### Task 3: Engine `plan` — gates + scopes + worklist

**Files:**
- Create: `bin/lib/wrap-up/engine-plan.js`
- Test: `bin/lib/wrap-up/tests/engine-plan.test.js`

**Interfaces:**
- Consumes: `REGISTRY` (Task 1); facts object shape (Task 2) — but `plan` is PURE: it takes facts as an argument, it never shells out. Signals shape: `{ dontCandidate: bool, contradictedConvention: bool, incidentRecorded: bool, adrCandidateCount: int, d4Count: int, d5Count: int }` — all optional, default falsy/0.
- Produces: `buildWorklist({ facts, signals, ceremonyProfile, budgets })` → worklist object later tasks consume:

```js
{
  version: 1,
  ceremonyProfile: 'standard',
  rows: [{
    id, target, judge, disposition,
    gate: 'open' | 'closed',
    gateReason: '.claude/skills/ exists',        // plain language, always set
    scope: { kind, cap, capSource, candidates }, // candidates only where computable:
                                                 // frontmatter-overlap → journey files whose
                                                 // files: frontmatter ∩ changedFiles (plan reads
                                                 // frontmatter via injected loader, see below);
                                                 // renamed-deleted → the renamedDeleted list;
                                                 // domain-overlap → null (ranking is the judge's,
                                                 // cap+flag resolved here); fixed → the paths;
                                                 // signals → null
  }]
}
```

`budgets` = `{ 'skill-budget': n|null, 'doc-budget': n|null }` (from CLI flags). Cap resolution: budgetFlag value if set, else fastLaneCap when `ceremonyProfile === 'fast-lane'`, else cap; `capSource` ∈ `'flag' | 'fast-lane' | 'default'`. Frontmatter loading: `buildWorklist` accepts optional `journeyFrontmatter: { 'docs/journeys/j1.md': ['src/a.js'] }` map (the CLI in Task 6 builds it by reading `files:` frontmatter lists from journey files; pure function stays pure).

- [ ] **Step 1: Write the failing test** — cases:

```js
const FACTS = { isRepo: true, changedFiles: ['src/a.js', 'src/b.js'], renamedDeleted: [],
  skillsLibraryExists: false, multiFileDiff: true, docsTreeNonEmpty: false,
  journeysExist: true, journeyFiles: ['docs/journeys/j1.md', 'docs/journeys/j2.md'],
  claudeMdCommandRenamed: false, renamedOrDeleted: false };

test('fact gates open on any listed fact', () => {
  const wl = buildWorklist({ facts: FACTS, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  const row = (id) => wl.rows.find((r) => r.id === id);
  assert.strictEqual(row('skills').gate, 'open');       // multiFileDiff superset
  assert.strictEqual(row('docs').gate, 'closed');
  assert.strictEqual(row('references').gate, 'closed');
  assert.match(row('docs').gateReason, /docs/);
});

test('signal gates open on signals and close without', () => {
  const open = buildWorklist({ facts: FACTS, signals: { d4Count: 2 }, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(open.rows.find((r) => r.id === 'memory').gate, 'open');
  const closed = buildWorklist({ facts: FACTS, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(closed.rows.find((r) => r.id === 'memory').gate, 'closed');
});

test('claude-md gate opens on fact OR signal', () => {
  const byFact = buildWorklist({ facts: { ...FACTS, claudeMdCommandRenamed: true }, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(byFact.rows.find((r) => r.id === 'claude-md').gate, 'open');
  const bySignal = buildWorklist({ facts: FACTS, signals: { incidentRecorded: true }, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(bySignal.rows.find((r) => r.id === 'claude-md').gate, 'open');
});

test('cap resolution: flag beats fast-lane beats default', () => {
  const flag = buildWorklist({ facts: { ...FACTS, skillsLibraryExists: true }, signals: {}, ceremonyProfile: 'fast-lane', budgets: { 'skill-budget': 7 } });
  assert.deepStrictEqual(
    (({ cap, capSource }) => ({ cap, capSource }))(flag.rows.find((r) => r.id === 'skills').scope),
    { cap: 7, capSource: 'flag' });
  const fast = buildWorklist({ facts: { ...FACTS, skillsLibraryExists: true }, signals: {}, ceremonyProfile: 'fast-lane', budgets: {} });
  assert.strictEqual(fast.rows.find((r) => r.id === 'skills').scope.cap, 2);
});

test('frontmatter-overlap computes journey candidates', () => {
  const wl = buildWorklist({ facts: FACTS, signals: {}, ceremonyProfile: 'standard', budgets: {},
    journeyFrontmatter: { 'docs/journeys/j1.md': ['src/a.js'], 'docs/journeys/j2.md': ['other.js'] } });
  assert.deepStrictEqual(wl.rows.find((r) => r.id === 'journeys').scope.candidates, ['docs/journeys/j1.md']);
});

test('every registry row appears exactly once, in order', () => {
  const wl = buildWorklist({ facts: FACTS, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.deepStrictEqual(wl.rows.map((r) => r.id), require('../registry').ROW_IDS);
});
```

- [ ] **Step 2: Run to verify FAIL**, **Step 3: implement**, **Step 4: run to verify PASS** — `node --test bin/lib/wrap-up/tests/engine-plan.test.js`. Implementation is a single map over `REGISTRY` evaluating each gate kind; `gateReason` strings are plain language (`'no docs/ tree'`, `'2 insights classified D4'`, `'--skill-budget 7'` etc.).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/wrap-up/engine-plan.js bin/lib/wrap-up/tests/engine-plan.test.js
git commit -m "Add wrap-up engine plan — pure gate evaluation and scope resolution over the registry"
```

---

### Task 4: Engine `record` — validated findings, SCANNED lines, telemetry, state

**Files:**
- Create: `bin/lib/wrap-up/engine-record.js`
- Test: `bin/lib/wrap-up/tests/engine-record.test.js`

**Interfaces:**
- Consumes: worklist shape (Task 3), `REGISTRY` (Task 1).
- Produces:
  - `initState({ runDir, worklist, now })` — writes `{runDir}/engine-state.json` containing the worklist plus an empty `results` map; for every CLOSED row it immediately records `{ result: 'na', detail: gateReason }` and appends that row's telemetry line. Called by `plan` (via CLI).
  - `recordResult({ runDir, payload, now, dryRun, telemetryPath })` — validates `payload` (see shape below) against the state's OPEN rows; throws `Error` with a message naming the field on: unknown `rowId`, row already recorded, row was closed, missing/mistyped required field, `result: 'findings'` with empty `findings`. On success: merges as `{ rowId: payload.rowId, ...derived }` never spreading payload over derived `[IL-01]` — concretely, build `{ result, detail, findings, read, gapDetection }` by picking named fields from the payload, never `{ ...payload }`; appends the row's `SCANNED` line to `{runDir}/decisions.md`; appends one telemetry TSV line (skipped when `dryRun`); updates `engine-state.json`.

Payload shape (the model's judgment output, one call per open row):

```json
{ "version": 1, "rowId": "skills",
  "result": "clean" | "findings",
  "read": [{ "path": ".claude/skills/upstream-drift.md", "mode": "full" }],
  "findings": [{ "kind": "additive" | "restructural" | "new" | "repair",
                 "summary": "one plain-language line",
                 "targetPath": "skills/x/SKILL.md",
                 "action": "applied" | "staged",
                 "stagePath": "staged/wrap-up-skill-1.md",
                 "commit": null }],
  "gapDetection": "run" | "not-run",
  "detail": "Read 1: upstream-drift" }
```

SCANNED line — ONE format for all rows, generated from structured fields (this replaces the seven bespoke templates):

```
SCANNED {ISO-time} — {target}: gate {open|closed} ({gateReason}); read {N} ({paths or 'none'}); gap detection: {run|not run}. Result: {clean | n/a | {A} applied, {S} staged}. Reversibility: {high (separate commit)|N/A}.
```

Telemetry TSV line appended to `telemetryPath` (default `{repoRoot}/.claude-tweaks/wrap-up-outcomes.tsv`, param injectable for tests): `{YYYY-MM-DD}\t{runId}\t{rowId}\t{open|closed}\t{findingsCount}\t{applied|staged|clean|na}` where `runId` = basename of `runDir`.

- [ ] **Step 1: Write the failing test** — using `mkdtempSync` run dirs:

```js
test('initState pre-resolves closed rows and writes their telemetry', ...);
  // engine-state.json exists; results['docs'].result === 'na'; tsv has a line with '\tdocs\tclosed\t'
test('recordResult accepts a valid clean payload and appends one SCANNED line', ...);
  // decisions.md gains exactly one line, matching /^SCANNED .* — Skills: gate open/
test('recordResult rejects: unknown row, closed row, double record, empty findings', ...);
  // four assert.throws with /rowId|closed|already|findings/ messages
test('derived fields cannot be clobbered by the payload', () => {
  // payload smuggles rowId-adjacent junk: { ...valid, result: 'clean', extra: 'x', target: 'HACK' }
  // stored result object has target from REGISTRY ('Skills'), no 'extra' key
});
test('dryRun skips telemetry but still writes SCANNED + state', ...);
test('a row never recorded is visible: state.results lacks the key', ...);
```

- [ ] **Step 2: FAIL**, **Step 3: implement**, **Step 4: PASS** — `node --test bin/lib/wrap-up/tests/engine-record.test.js`

- [ ] **Step 5: Commit**

```bash
git add bin/lib/wrap-up/engine-record.js bin/lib/wrap-up/tests/engine-record.test.js
git commit -m "Add wrap-up engine record — validated judgments, uniform SCANNED lines, outcome telemetry"
```

---

### Task 5: Engine `render` — phase-trace tables + console sections + vocabulary guard

**Files:**
- Create: `bin/lib/wrap-up/engine-render.js`
- Test: `bin/lib/wrap-up/tests/engine-render.test.js`

**Interfaces:**
- Consumes: `engine-state.json` shape (Task 4), `REGISTRY`.
- Produces:
  - `renderTrace(state)` → markdown string: the Phase 2 table, all 8 rows always present, registry order:

```markdown
| Target | Result | Detail |
|--------|--------|--------|
| Skills | Clean | Read 1: upstream-drift |
| Docs | n/a | no docs/ tree |
| CLAUDE.md & rules | 3 staged | Fetch-first rule; IL carve-out; new Don't |
```

    Result column values: `n/a` (closed gate), `Clean`, `{n} applied`, `{n} staged`, `{a} applied, {s} staged`, and — for a row present in the worklist but absent from `results` — the literal `MISSING — judge never reported`.
  - `renderConsoleSections(state)` → markdown for the console's engine-fed sections (Skill updates / Documentation updates / Journey updates / Configuration updates / Reference repairs), one table per row-with-findings, rows numbered per `review-console.md`'s global-sequence rule via a `startAt` param returning `{ markdown, nextNumber }`.
  - `strictCheck(state)` → `{ ok: boolean, missing: [rowId] }` — the CLI's exit-2 hook.
  - `FORBIDDEN_VOCABULARY` export: `[/\bD[0-5]\b/, /domain-overlap/i, /gap detection/i, /\bStep 7\.\d+/, /\[route:/]` — render post-checks its own output against this list and throws if it ever emits one (defense in depth; sources are structured fields, so this should be unreachable).

- [ ] **Step 1: Write the failing test** — pin exact table output for a fixture state (all three result kinds + one missing row); `strictCheck` flags the missing row; forbidden-vocabulary self-check throws when a `detail` field smuggles `"D0 domain-overlap"` in; `renderConsoleSections` numbering continues across sections (`startAt: 5` → first row is `| 5 |`, `nextNumber` correct). Also the inversion discipline `[IL-105]`: for the pinned-table test, add one negated assertion — e.g. `assert.doesNotMatch(out, /\bSCANNED\b/)` (audit lines never leak into the trace).

- [ ] **Step 2: FAIL**, **Step 3: implement**, **Step 4: PASS** — `node --test bin/lib/wrap-up/tests/engine-render.test.js`

- [ ] **Step 5: Commit**

```bash
git add bin/lib/wrap-up/engine-render.js bin/lib/wrap-up/tests/engine-render.test.js
git commit -m "Add wrap-up engine render — phase-trace table, console sections, vocabulary guard"
```

---

### Task 6: CLI `bin/wrap-up-engine.js`

**Files:**
- Create: `bin/wrap-up-engine.js`
- Test: `bin/lib/wrap-up/tests/engine-cli.test.js`

**Interfaces:**
- Consumes: Tasks 1-5 modules.
- Produces: three verbs (mirror `bin/wrap-up-state.js`'s conventions — `#!/usr/bin/env node`, `'use strict'`, exit 0 on degraded success, exit 2 on malformed invocation ONLY, `execFileSync` never `exec`):
  - `plan --run-dir <dir> --base <sha> [--ceremony <profile>] [--skill-budget n] [--doc-budget n] [--signals <json>] [--dry-run]` — gathers facts (Task 2) from cwd, reads journey `files:` frontmatter for the overlap map, builds the worklist (Task 3), calls `initState` (Task 4), prints the worklist JSON to stdout (the model reads gate/scope/judge per row from here).
  - `record --run-dir <dir> [--dry-run]` — reads ONE payload JSON from stdin, calls `recordResult`, prints the row's SCANNED line to stdout. Validation failure → exit 1 with the reason on stderr (the model retries with a fixed payload; exit 1 not 2 — the invocation shape was fine).
  - `render --run-dir <dir> [--strict] [--section trace|console] [--start-at n]` — prints markdown; `--strict` exits 2 when `strictCheck` reports missing rows (after printing, so the hole is visible AND fatal).
- Journey frontmatter parsing: `files:` YAML list in the frontmatter block (lines between the first `---` pair matching `^\s*-\s+(.+)$` under a `files:` key) — no YAML dep; same hand-rolled approach other bin modules use.

- [ ] **Step 1: Write the failing test** — spawn the CLI with `execFileSync(process.execPath, [cliPath, ...])` against a fixture repo + run dir (reuse Task 2's fixture builder): `plan` writes `engine-state.json` and prints parseable JSON with 8 rows; `record` with a valid payload on stdin appends to `decisions.md` and exits 0; `record` with garbage stdin exits 1 (not 2, not 0) with a reason on stderr; `render --strict` exits 2 while open rows are unrecorded and 0 after all are recorded; `render --section trace` output contains the pinned header row `| Target | Result | Detail |`.

- [ ] **Step 2: FAIL**, **Step 3: implement**, **Step 4: PASS** — `node --test bin/lib/wrap-up/tests/engine-cli.test.js`

- [ ] **Step 5: Run the full new-module suite together**

Run: `node --test bin/lib/wrap-up/tests/*.test.js`
Expected: PASS — including the pre-existing state/reflog/render/cli suites, untouched.

- [ ] **Step 6: Commit**

```bash
git add bin/wrap-up-engine.js bin/lib/wrap-up/tests/engine-cli.test.js
git commit -m "Add wrap-up-engine CLI — plan/record/render verbs over the curation registry"
```

---

### Task 7: Gitignore entry for telemetry file

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Inspect current handling**

Run: `grep -n "claude-tweaks" .gitignore`
Expected: explicit transient-subdirectory lines (the `[IL-06]` convention — no blanket `.claude-tweaks/` ignore). Read what is there before editing.

- [ ] **Step 2: Add the explicit file entry**

Add `.claude-tweaks/wrap-up-outcomes.tsv` as its own line, adjacent to the existing `.claude-tweaks/` transient entries. Do NOT add a blanket directory ignore.

- [ ] **Step 3: Verify**

Run: `touch .claude-tweaks/wrap-up-outcomes.tsv && git check-ignore -v .claude-tweaks/wrap-up-outcomes.tsv && rm .claude-tweaks/wrap-up-outcomes.tsv`
Expected: the new line is the matching rule.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "Ignore wrap-up outcome telemetry file — local state, IL-06 explicit-entry convention"
```

---

### Task 8: `curation-engine.md` + the two new judges + delete `config-updates.md`

**Files:**
- Create: `skills/wrap-up/curation-engine.md`
- Create: `skills/wrap-up/claude-md-curation.md`
- Create: `skills/wrap-up/adr-curation.md`
- Delete: `skills/wrap-up/config-updates.md`

**Interfaces:**
- Consumes: CLI contract from Task 6 (verb names, flags, payload JSON shape — restate them verbatim in `curation-engine.md`; a judge or engine reader must never need to open the JS to know the contract).
- Produces: the file names Task 1's registry already points at (`claude-md-curation.md`, `adr-curation.md`).

- [ ] **Step 1: Write `curation-engine.md`** — sections, in order:
  1. **What the engine owns vs. what the model owns** — engine: gates, scope caps, ordering, SCANNED lines, telemetry, trace/console rendering; model: reading candidates, judging per the row's judge file, emitting one `record` payload per open row.
  2. **Invocation sequence** (verbatim commands): `plan` once at Phase 2 entry (with `--signals` built from Phase 1's reflection outputs: `dontCandidate`, `contradictedConvention`, `incidentRecorded`, `adrCandidateCount`, `d4Count`, `d5Count`); then per OPEN row in worklist order — read the judge file, judge the candidates, pipe one payload JSON into `record`; then `render --section trace --strict`. Memory and upstream rows are judged only after all earlier rows recorded (their input is the *unclaimed* learnings).
  3. **The payload contract** — the exact JSON shape from Task 4, with the `action: applied` precondition (only `apply-or-stage` rows, only additive+reversible:high+confidence:high findings, per the existing 7.6 rule now stated once here) and `stage-only` meaning every finding's `action` is `staged`.
  4. **Parallel dispatch** (Form C, verbatim blockquote): `> **Parallel execution (conditional):** When the worklist has 3+ open fact-gated rows, dispatch each row's judgment as a parallel Task agent per skills/_shared/subagent-output-contract.md — the dispatch prompt inlines the row's worklist entry, the judge file's full text, and the literal payload JSON template; the agent returns the payload as its Template output. Signal-gated rows (Memory, Upstream feedback) always run after the fan-out completes, in the main thread. Otherwise run sequentially in the main thread.`
  5. **Vocabulary rule** — internal identifiers never reach rendered output; full detail goes to `decisions.md`.
  6. **Prose fallback** (the design's degradation path, stated as an unconditional rule `[IL-14]`): when `node "${CLAUDE_PLUGIN_ROOT}/bin/wrap-up-engine.js" plan` fails for any reason, execute this same section manually — walk the registry table in SKILL.md top to bottom, evaluate each gate by its stated condition, apply the row's judge file to its scope, write the SCANNED line (format above) and the trace row by hand — and the report MUST state `(engine unavailable — prose fallback ran)` in the Phase 2 table caption. This file and the registry table are the ONLY prose copies of the mechanism.

- [ ] **Step 2: Write `claude-md-curation.md`** — merge, without dropping substance:
  - From `config-updates.md` 6.1 (read it in the pre-rewrite worktree state): the D1-only classify-before-collecting rule, the five convention checks, the size-budget note, the write-the-incident-account-before-the-rule discipline (verbatim — it is load-bearing prose), the `[claude.md]`/`[rule]` collection formats.
  - From `SKILL.md` Step 7.9: the four audit triggers (now the gate, restated as *what the signals mean*, not re-evaluated here), and the `_shared/harness-health-analysis.md` `assetType: claude-md` application with its stage-only exception.
  - Header states: gate and SCANNED line are engine-owned; this file is judgment only; every finding's `action` is `staged`.

- [ ] **Step 3: Write `adr-curation.md`** — from `config-updates.md` 6.2 verbatim substance: candidate gathering (three sources), the three-factor ADR gate, the `_shared/existing-convention-detection.md` path resolution, `[adr]` and `[adr-convention]` collection formats including the per-item three-way rule and the "blocks every `[adr]` row" consequence, "zero per wrap-up is normal".

- [ ] **Step 4: Delete `config-updates.md`**

```bash
git rm skills/wrap-up/config-updates.md
```

- [ ] **Step 5: Substance audit for this task's split**

For each substantive line of the deleted file, confirm it appears in one of the two new files (open them side by side; the file is 43 lines — do it line by line, it takes five minutes). Fix any drop now.

- [ ] **Step 6: Commit**

```bash
git add skills/wrap-up/curation-engine.md skills/wrap-up/claude-md-curation.md skills/wrap-up/adr-curation.md
git commit -m "Add curation-engine contract and split config-updates into claude-md and adr judges"
```

---

### Task 9: Slim the six existing judge files

**Files:**
- Modify: `skills/wrap-up/skill-curation.md`, `docs-health-integration.md`, `journey-curation.md`, `memory-curation.md`, `upstream-feedback.md`, `reference-sweep.md`

**Interfaces:**
- Consumes: engine contract (Task 8) — what moved out of the judges.
- Produces: judge files containing ONLY judgment procedure + row-specific staging semantics.

Per file, remove exactly (engine-owned now): the gate condition prose ("Gate the read" preconditions — SKILL.md's registry table owns them), the "Mandatory summary" SCANNED-template sections, and "Auto mode appends this line…" plumbing sentences. KEEP everything else, specifically:

- [ ] **Step 1: `skill-curation.md`** — keep 7.1 seed gathering, 7.2's ranking + 60 KB byte-budget + bounded-read + overflow rules (the cap NUMBER now arrives via the worklist's `scope.cap` — replace the hardcoded "top ~5 / top ~2 / `--skill-budget`" sentences with "the cap arrives in the worklist row (`scope.cap`)" and delete the flag-resolution prose), 7.3-7.5 (harness-health-analysis application, cursor recording via `validate-findings`, ≥2-of-3 new-skill gate), 7.6's additive/restructural classification and stage-path naming (`staged/wrap-up-skill-{N}.md`) and the interactive Skill Updates table + hard gate. Remove: the mandatory-summary block (lines with the `SCANNED {time} — Step 7 skill curation summary` template), the "Declare … only when" paragraph's summary-line clauses (keep its substance-condition clause).
- [ ] **Step 2: `docs-health-integration.md`** — keep D0's ranking/`classifyDiffFiles` mechanics and the registry-absent fallback (now reported via the payload's `detail`), Registry Maintenance, D1's JUDGE application + restructural filing pipeline (verbatim — the `gh`/`validate-findings` commands), D2, the Step 9 Gotcha (updated in Task 12 — leave a `<!-- updated in summary-template rewrite -->` marker for now). Remove: the Mandatory summary section. Replace hardcoded cap prose with the worklist-scope sentence, as above.
- [ ] **Step 3: `journey-curation.md`** — keep J1's checks and J2; remove the Mandatory summary section; scope arrives as `scope.candidates` (the engine computed the frontmatter overlap — delete the "compute the overlap" instruction, keep the note that it is always fresh).
- [ ] **Step 4: `memory-curation.md`** — keep the dedup-and-stage rule, the per-item M# gate paragraphs (verbatim — contract-mandated), the no-memory-directory re-classification table. DELETE Step 2 ("Standalone wrap-up has no console to stage for") — obsolete under run-dir-everywhere; standalone now stages and the console reads it. Remove the Mandatory summary section.
- [ ] **Step 5: `upstream-feedback.md`** — keep self-reference check, stage-never-file + scrub-at-staging-time, per-item U# semantics. DELETE Step 3 (standalone branch) — same reason. Remove the Mandatory summary section.
- [ ] **Step 6: `reference-sweep.md`** — keep Steps 2-4 in full (grep exclusions with their IL citations, ambiguity-always-stages, ceiling/`permittedInitiative` mechanics, the dry-run rule). Remove Step 1's target-set computation (engine's `renamed-deleted` scope provides it — keep the renamed-headings extension as judgment: the engine provides R/D paths; the judge still collects renamed anchors/headings itself) and Step 5's summary block.
- [ ] **Step 7: Verify no judge still contains a SCANNED template**

Run: `grep -rn "SCANNED {time}" skills/wrap-up/ | grep -v curation-engine.md`
Expected: no output. (The engine contract file is the one legitimate holder of the format.)

- [ ] **Step 8: Commit**

```bash
git add skills/wrap-up/
git commit -m "Slim wrap-up judge files to judgment-only — gates, SCANNED lines, and caps move to the engine"
```

---

### Task 10: Rewrite `skills/wrap-up/SKILL.md` — the four phases

**Files:**
- Modify: `skills/wrap-up/SKILL.md` (full rewrite)

**Interfaces:**
- Consumes: everything above. Produces: the registry table Task 11 pins; the phase names every other file cites.

Structure of the rewritten file (keep frontmatter `name`/`description`/`argument-hint` as-is; keep the interaction-style directive verbatim; keep the H1 + Lifecycle line + When to Use):

- [ ] **Step 1: Write Phase 1 — ESTABLISH** — merged Steps 1+2 (input resolution incl. `resume` and the three flags, verbatim from the old Step 1; work-type table; the old Step 2 summary instructions compressed to one paragraph); then **run-dir creation, unconditional**: resolve per `_shared/pipeline-run-dir.md` steps 1-2; when neither resolves, create `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-{slug}-standalone/` with `decisions.md` + `staged/` (the same shape as that file's step-4 snippet — wrap-up joins the standalone-run-dir creators; Task 13 updates the shared file's allowlist), and stamp `run-state.json` with `createdBy: wrap-up-standalone` — the CSC signal. Then reflect (old Step 3 verbatim, including light/full selection) and the ceremony escape hatch (old 3.5 verbatim).
- [ ] **Step 2: Write Phase 2 — ROUTE** — the registry table (exact same 8 rows/columns as Task 1's Step 3 table, with a `Gate` column in plain language and a `Judge` column naming the sub-files); the engine invocation stub: "Read `curation-engine.md` in this skill's directory and execute its invocation sequence — it owns the plan/record/render commands, the payload contract, the parallel-dispatch rule, and the prose fallback."; the ordering note (Memory/Upstream last, why); the stage-only note for CLAUDE.md & rules.
- [ ] **Step 3: Write Phase 3 — SETTLE** — old Step 4 (leftover routing, gated read, verbatim), old Step 8.5 (residue sweep + resolve gate + nothing-left-behind wrapper, verbatim including its gate conditions), old Step 8's unblocked-records lookup demoted to one paragraph feeding Next Actions (gated read of `unblocked-records.md` unchanged).
- [ ] **Step 4: Write Phase 4 — CLOSE** — cleanup planning (old Step 5, verbatim incl. the 8-item gate — note item 8 now ALWAYS holds since every run has a run dir; update that paragraph's last sentence accordingly); the console (old 8.6, now: "runs in every mode — read `review-console.md`"; keep the multi-spec defer + auto-merge gate-the-read conditions verbatim, DROP the "Skipped in interactive mode and standalone wrap-up" sentence); the report ("read `summary-template.md`; Step 9 always runs" — now phrased as "render the phase-trace via `render --section trace`"); execution+verification (old Step 10 verbatim, gated read of `execution-and-verification.md`).
- [ ] **Step 5: Important Notes, Next Actions, Component-Skill Contract, Anti-Patterns** — Notes: keep all five bullets. Next Actions: keep the table + `AskUserQuestion` shape verbatim, but the omit-condition becomes the CSC's new signal. CSC (replaces the `$PIPELINE_RUN_DIR` test): "When the run directory was **inherited** — `$PIPELINE_RUN_DIR` was already set at invocation, or `run-state.json` lacks `createdBy: wrap-up-standalone` — wrap-up is running inside `/claude-tweaks:flow`: omit `## Next Actions`; Step 8.6 honors `$MULTISPEC_REVIEW_DEFER`. When this run **created** its own run dir (`createdBy: wrap-up-standalone`), render Next Actions as usual." Anti-Patterns: keep rows that survive; REWRITE the seven per-step SCANNED/scan-scope rows into three engine-era rows: `| Skipping a registry row because its gate looks obviously closed | The engine evaluates gates — a hand-skipped row is the silent skip render --strict exists to catch |`, `| Composing the Phase 2 trace or SCANNED lines by hand when the engine is available | Seven hand-maintained formats drifting was this architecture's motivating failure — render owns the format |`, `| Treating engine failure as permission to skip curation | The prose fallback in curation-engine.md is unconditional — the report states which path ran |`. Keep: run-before-review, deleting-incomplete-specs, CLAUDE.md-size, skip-reflection, keeping-consumed-artifacts, silent-drop, open-ledger-items, demo:pending rows.
- [ ] **Step 6: Size check**

Run: `wc -c skills/wrap-up/SKILL.md && node --test bin/lib/skill-audit/tests/context-cost.test.js`
Expected: well under 40960 bytes; test PASS. (Everything moved to sub-files should land this near ~20 KB.)

- [ ] **Step 7: Commit**

```bash
git add skills/wrap-up/SKILL.md
git commit -m "Rewrite wrap-up SKILL.md as four phases — registry table, engine wiring, console in every mode"
```

---

### Task 11: Registry pinning test (prose ↔ code)

**Files:**
- Create: `tests/wrap-up-registry-pin.test.js`

**Interfaces:**
- Consumes: SKILL.md's Phase 2 registry table (Task 10), `REGISTRY` (Task 1).

- [ ] **Step 1: Write the test** (pattern: `tests/hooks-gate-coverage.test.js` — prose pinned to an exported constant):

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { REGISTRY } = require('../bin/lib/wrap-up/registry');

const skill = fs.readFileSync(path.join(__dirname, '..', 'skills', 'wrap-up', 'SKILL.md'), 'utf8');

function proseRows() {
  // Parse the registry markdown table: the block whose header row contains
  // '| Target |' and '| Judge |'. Return [{target, judge, disposition}] in order.
  ...
}

test('SKILL.md registry table matches registry.js — same rows, same order', () => {
  const prose = proseRows();
  assert.strictEqual(prose.length, REGISTRY.length);
  prose.forEach((p, i) => {
    assert.strictEqual(p.target, REGISTRY[i].target, `row ${i} target`);
    assert.ok(p.judge.includes(REGISTRY[i].judge), `row ${i} judge`);
  });
});

test('every judge file the registry names exists', () => {
  for (const r of REGISTRY) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'skills', 'wrap-up', r.judge)), r.judge);
  }
});
```

- [ ] **Step 2: Verify it discriminates** — temporarily swap two rows in SKILL.md's table, run, confirm FAIL; restore, confirm PASS (the revert-and-rerun discipline; do not skip this).

Run: `node --test tests/wrap-up-registry-pin.test.js`

- [ ] **Step 3: Commit**

```bash
git add tests/wrap-up-registry-pin.test.js
git commit -m "Pin SKILL.md registry table to registry.js — prose and code cannot drift silently"
```

---

### Task 12: Rewrite `summary-template.md`; update `review-console.md`

**Files:**
- Modify: `skills/wrap-up/summary-template.md` (rewrite)
- Modify: `skills/wrap-up/review-console.md` (surgical)

- [ ] **Step 1: Rewrite `summary-template.md`** as the phase-trace template:
  - Header block: `## Wrap-Up: {title}` + Origin line (record mode) + Verdict + State — keep the ENTIRE existing State section verbatim (helper invocation, base-resolution rules 1-3, retry-once, never-omit).
  - Phase 1 table: `| Item | Value |` — mode, record, ceremony profile, reflection outcome (`{n} insights → routed in Phase 2`).
  - Phase 2: "Insert `render --section trace` output verbatim — never compose this table by hand. Under prose fallback, follow the trace format in `curation-engine.md` and append `(engine unavailable — prose fallback ran)`."
  - Phase 3 table: `| Check | Result | Detail |` — Leftover routing / Residue sweep / Ledger gate / Unblocked records; nulls rendered (`n/a — conversation mode` etc.); each row's Disposition discipline carried over from the old Outstanding section (no row without a disposition; unrun probe renders `unknown` + reason).
  - Phase 4: console outcome line; Actions Performed table — keep the existing generation rules verbatim (helper History ops each get a History row; never fold History into Operational; omit when no autonomous actions); closure lines — keep BOTH existing closure blocks (record mode + conversation mode) verbatim including the measured plans/ledger clause and `[IL-36]` note.
  - KEEP the standalone multi-record batch paragraph, the conversation-mode variant paragraph (updated: it now drops record-keyed pieces from the SAME phase tables), and the D1-D5→named-destination mapping table (now cited as the vocabulary rule's origin; the engine implements it, prose fallback still needs it).
  - DELETE: the old Decisions/Outstanding/Routed/Evidence category sections; the entire Conditional-batch-decision block and the Q#/M#/U# tables (the console owns them in every mode now — state that in one sentence pointing at `review-console.md`).
- [ ] **Step 2: Update `review-console.md`** — surgical edits, everything else stays byte-identical:
  1. "When to run" section: replace the three bullets with: runs whenever a run directory exists (which is every run after Phase 1) EXCEPT under `MULTISPEC_REVIEW_DEFER=1` (defer protocol unchanged, below). Delete the `interactive mode — skip` bullet. Add: "In interactive mode the console replaces the old Step 9 batch decision — same tables, same one terminal `AskUserQuestion`."
  2. "Locate the pipeline run directory": resolution unchanged, but the empty-result branch ("skip the console entirely") now reads: unreachable after Phase 1 (every run creates a dir); if it still happens, treat as prose-fallback and present findings inline.
  3. Empty-console fast path: add "Cleanup rows that are unconditional bookkeeping (run-dir archival — `cleanup-procedures.md` item 8) do not count as cleanup actions for this test; archival executes regardless, undisplayed, as bookkeeping."
  4. Engine-fed sections: where the Skill updates / Documentation updates / Journey updates / Configuration updates / Reference repairs tables render, add one sentence: "Generate these five sections via `render --section console --start-at {n}` when the engine ran; the shapes below are the contract that output satisfies (and the prose-fallback template)."
  5. Leave untouched: Auto-merge short-circuit, dry-run mode, defer protocol, numbering rules, unattended-tier auto-file, Q#/M#/U# per-item drills, On approval/override/stop, hard requirements.
- [ ] **Step 3: Verify the two files agree** — grep both for `batch decision`; the only surviving references must describe the console itself or history. Run: `grep -n "batch decision" skills/wrap-up/summary-template.md skills/wrap-up/review-console.md`
- [ ] **Step 4: Commit**

```bash
git add skills/wrap-up/summary-template.md skills/wrap-up/review-console.md
git commit -m "Rewrite summary as phase-trace and run the Review Console in every mode"
```

---

### Task 13: Cross-reference sweep + shared-file and docs updates

**Files:**
- Modify: `skills/_shared/pipeline-run-dir.md`, `docs/skill-graph.md`, `docs/plugin-structure.md`, plus whatever the sweep finds (expected: `skills/flow/*.md`, `skills/reflect/*.md`, `skills/ledger/resolve-gate.md`, `skills/dispatch/*.md`, `skills/tidy/*.md`, `skills/demo/*.md`, `skills/wrap-up/cleanup-procedures.md`, `skills/wrap-up/execution-and-verification.md`, `skills/wrap-up/nothing-left-behind.md`, `skills/wrap-up/residue-sweep.md`, `skills/wrap-up/verification-brief.md`, `skills/wrap-up/leftover-routing.md`, `skills/wrap-up/unblocked-records.md`, `skills/_shared/auto-mode-contract.md`, `skills/_shared/auto-decision-log.md`, `skills/_shared/learning-routing.md`)

The step-number renumbering has repo-wide blast radius `[IL-86]`. Old→new mapping (state it once at the top of the sweep, use everywhere): Steps 1/2/3/3.5 → Phase 1; Steps 6/7/7.7/7.8/7.9/7.10/7.11/7.12 → Phase 2 row `{target}`; Steps 4/8/8.5 → Phase 3; Steps 5/8.6/9/10 → Phase 4 (8.6 → "the Review Console", 9 → "the phase-trace summary", 10 → "execution").

- [ ] **Step 1: Enumerate every reference**

Run (whitespace-flexible, case-insensitive, content-anchored `[IL-66]`; ugrep honors .gitignore — stay with git-tracked files here, that is what we want):

```bash
git grep -n -i -E "wrap-?up[^.]{0,40}Step ?[0-9]" -- '*.md' | grep -v "docs/superpowers/"
git grep -n -E "Step (3\.5|4|5|6|7|7\.[0-9]+|8|8\.5|8\.6|9|10)" -- 'skills/wrap-up/' | grep -v "docs/superpowers/"
git grep -n "config-updates.md" -- '*.md' ':!docs/superpowers/*'
```

(The `docs/superpowers/` exclusion covers the plan/design docs that legitimately quote old names `[IL-28]`.)

- [ ] **Step 2: Fix every hit** — apply the mapping. Within `skills/wrap-up/` sub-files, internal step citations become phase/row names. In external skills, `wrap-up Step 8.5` → `wrap-up Phase 3's ledger gate`, `Step 8.6` → `wrap-up's Review Console`, `Step 7` → `wrap-up's Skills curation row`, `Step 10` → `wrap-up's execution step`, etc. Judgment per hit; the mapping is the rule, the wording flexes.
- [ ] **Step 3: Update `skills/_shared/pipeline-run-dir.md`** — resolution-order step 4's allowlist paragraph: add `/claude-tweaks:wrap-up` with its own clause: wrap-up creates a standalone run dir in EVERY mode (not just auto) at Phase 1 — the bookend console reads it; note `createdBy: wrap-up-standalone` in `run-state.json` distinguishes created-vs-inherited for the CSC. Also update the sentence in the layout paragraph ("`config.yml` … absent for standalone runs") if it now needs a wrap-up caveat — verify against what Phase 1 actually writes (no `config.yml` for standalone wrap-up: confirm the sentence already covers it).
- [ ] **Step 4: Update `docs/skill-graph.md`** — the `## wrap-up` section's edges plus every inbound edge found by: `grep -n "wrap-up" docs/skill-graph.md`. Update step references per mapping; add one new edge under `## wrap-up`: `bin/wrap-up-engine.js` is not a skill (no edge), but the `/harness-health` edge gains: telemetry file `.claude-tweaks/wrap-up-outcomes.tsv` is a future registry-demotion data source (report-only note).
- [ ] **Step 5: Update `docs/plugin-structure.md`** — line ~20 (`bin/lib/wrap-up/` description): append the engine modules (registry/facts/engine-plan/engine-record/engine-render, consumed by `bin/wrap-up-engine.js`). Line ~54 (the wrap-up sub-file table row): rewrite for the new file set — this row is huge; rewrite it around phases and the registry rather than editing in place. Commands section: add `node bin/wrap-up-engine.js plan|record|render …` one-liner next to the wrap-up-state line.
- [ ] **Step 6: Control-grep the sweep** `[IL-105]` — re-run Step 1's greps; expected: zero hits outside `docs/superpowers/`. Then run one negative control confirming the grep works: `git grep -n "wrap-up Step 8.6" -- docs/superpowers/` MUST return hits (the design doc quotes it) — a silent grep is a broken grep, not a clean tree.
- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Sweep step-number references to phase names — shared contracts, skill graph, plugin structure"
```

---

### Task 14: Substance-survival audit, full suite, release

**Files:**
- Modify: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `docs/shipped-versions.tsv` (+ marketplace repo mirror at execution time)

- [ ] **Step 1: Substance-survival audit** (the extraction discipline — no test reads skill prose). For each of: old `SKILL.md`, `summary-template.md`, `config-updates.md`, and the six slimmed judges — diff old (at the branch fork point: `git show $(git merge-base HEAD main):skills/wrap-up/{file}`) against the new file set and confirm every substantive line (rule, condition, format, IL citation, command) survives somewhere in `skills/wrap-up/` or was deliberately deleted by a task above (the deliberate deletions: seven SCANNED templates → engine; standalone branches of memory/upstream → run-dir-everywhere; Step 9 batch decision + Q#/M#/U# duplicate tables → console; old CSC signal). Record the audit's findings as a checklist in the task output — every dropped line is either restored or named as deliberate with the owning task.
- [ ] **Step 2: Full suite**

Run: `npm test > /tmp/wrapup-arch-suite.log 2>&1; echo "exit=$?"; tail -20 /tmp/wrapup-arch-suite.log`
Expected: exit=0, `# fail 0`. (Redirect to file first — long-suite discipline.)

- [ ] **Step 3: Whole-branch review BEFORE the bump** (CLAUDE.md Releasing: the review gates the bump). Dispatch `superpowers:requesting-code-review` / the repo's review flow across the whole branch diff (`git diff $(git merge-base HEAD main)...HEAD`), with explicit attention to: producer/consumer field agreement between `curation-engine.md`'s documented payload JSON and `engine-record.js`'s validator `[IL-04]`; the CSC created-vs-inherited signal implemented consistently in SKILL.md, review-console.md, and pipeline-run-dir.md; the fast-path bookkeeping exemption not silently swallowing real cleanup rows.
- [ ] **Step 4: Version bump + changelog + shipped-versions, one commit** — follow CLAUDE.md Releasing steps 1-3 exactly at execution time (fetch origin/main; check `origin/main`, local `main`, sibling worktree branches, and unexecuted plans for the next free number — do NOT pre-compute it in this plan `[IL-12]`, `[IL-98]`); minor bump; `## v{version} — Wrap-up phase architecture: curation engine, registry, code-rendered report` heading shape exactly (`X.Y.Z`, em-dash); `{version}\t{date}\trelease` line in the tsv.
- [ ] **Step 5: Merge + push per the repo's integration discipline** (two separate calls for merge and push under `worktree.always`; verify `git branch --show-current` in the same compound command as any main-checkout merge `[IL-05]`), then mirror the marketplace repo per Releasing step 4 (read current values from ITS `origin/main`, never the stale working checkout `[IL-104]`) — both repos in one continuous action, no pause between `[IL-59]`.

---

## Self-Review (performed at authoring time)

**Spec coverage:** Phase 1 merge+run-dir (Task 10.1), registry+engine+telemetry (Tasks 1-7), judges+merged 6.1/7.9+ADR split (Tasks 8-9), report contract+vocabulary rule (Tasks 5, 12), console unification+fast-path fix (Task 12), CSC signal (Tasks 10, 13), pinning test / Risk 2 (Task 11), file-structure table (Tasks 8-10, 12-13), hooks-compat check (Task 13 Step 3 + design Risk 4 — the reaper/E1 behavior is existing-code-unchanged; run-state `createdBy` is additive), `/flow` console alignment explicitly out of scope (no task — matches spec). Telemetry gitignore `[IL-06]` (Task 7).

**Known judgment points left to implementers (not placeholders — judgment calls the executing agent makes against live files):** exact wording when applying Task 13's mapping per hit; which Anti-Pattern rows read as "surviving" in Task 10 Step 5 (the keep-list is stated); Task 14 Step 1's deliberate-deletion checklist is enumerated in the step.

**Type consistency:** payload field names (`rowId`, `result`, `read`, `findings[].action`, `gapDetection`, `detail`) identical across Tasks 4 (validator), 6 (CLI docs), 8 (curation-engine.md contract). Registry field names identical across Tasks 1, 3, 11. Fact keys identical across Tasks 2, 3 (`skillsLibraryExists`, `multiFileDiff`, `docsTreeNonEmpty`, `journeysExist`, `claudeMdCommandRenamed`, `renamedOrDeleted`). Signal keys identical across Tasks 3, 8 (`dontCandidate`, `contradictedConvention`, `incidentRecorded`, `adrCandidateCount`, `d4Count`, `d5Count`).
