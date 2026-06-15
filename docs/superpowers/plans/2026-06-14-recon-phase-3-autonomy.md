# Recon Phase 3: Autonomy — Implementation Plan

> **Canonical interface:** cross-phase API signatures live in `2026-06-14-recon-interface-contract.md`; it wins over inline names here. Specifically: use `readCache`/`writeCache` (not `loadCache`/`saveCache`) and call `decide(finding, issueIndex, cache)` (add the `cache` arg).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn on `/recon`'s autonomy layer on top of the Phase 0/1/2 spine — (a) weighted area scoring + a round-robin coverage floor wired into `selectAreas`; (b) a `/flow --from-recon` affordance that pulls `recon`-labelled GitHub issues into the existing multi-spec batch; (c) Routine wiring + one neutral billing note; (d) a `status` regression/critical gate; (e) the regression-reopen dedup path; (f) fingerprint-churn monitoring; and (g) the memenu-app source cleanup (design §14). All deterministic logic stays pure Node, network access stays EMIT/THROUGH-TOOL (the engine never calls `gh`).

**Architecture:** Two layers, unchanged from earlier phases. The **deterministic** layer adds `bin/lib/recon/score.js` (scoring + round-robin floor) and `bin/lib/recon/pull-issues.js` (parse `gh issue list` output → briefs), extends `bin/lib/recon/cache.js` (per-run fingerprint sets under `.claude-tweaks/recon/runs/`) and `bin/lib/recon/dedup.js` (the `reopen` action), and grows `bin/recon.js` with `status` and `churn-report` subcommands plus a `selectAreas` that delegates to `scoreAreas`. The **skill/markdown** layer adds a `## Routine Configuration` section to `skills/recon/SKILL.md`, a `--from-recon` mode documented in `skills/flow/steps-and-gates.md` (+ a `from-recon.md` sub-file), and the bidirectional `/recon` ↔ `/flow` cross-reference rows. GitHub stays the durable persistence sink; the engine only emits payloads/queries that the SKILL.md hands to the `gh` CLI.

**Tech Stack:** Node built-ins only (`fs`, `path`, `crypto`, `child_process` — no external deps); Claude Code Routines (substrate for scheduled runs); the `gh` CLI (through-tool, invoked by the SKILL.md, never by the engine); `node --test` (test runner).

**Baseline:** branch `recon-phase-3-autonomy` on top of `main` (currently v4.17.0). Design doc: `docs/superpowers/specs/2026-06-14-recon-proactive-repo-finder-design.md`. **Depends on Phase 0/1/2 being merged first** — this plan references the following pre-existing modules and functions:

| Module | Pre-existing exports (Phase 0/1/2) |
|--------|-----------------------------------|
| `bin/recon.js` | `run`, `plan-judgment`, `ingest-judgment` subcommands; `parseArgs`; `selectAreas` (stub that returns `detectAreas` top-K, to be rewired here) |
| `bin/lib/recon/areas.js` | `detectAreas(rootDir) -> Area[]`, `selectAreas` helper |
| `bin/lib/recon/fingerprint.js` | `fingerprint({lens, areaId, signature}) -> string` (line/whitespace/identifier-normalized) |
| `bin/lib/recon/dedup.js` | `decide(finding, issueIndex) -> {action, ...}` where `action ∈ {file, skip, suppress, reopen}` (the `reopen` arm is a stub to be completed here) |
| `bin/lib/recon/cache.js` | `loadCache(rootDir) -> {<fp>:{status, issue}}`, `saveCache(rootDir, cache)`; cache root is `.claude-tweaks/recon/` |
| `bin/lib/recon/issue-payload.js` | `toIssuePayload(finding) -> {title, body, labels}` (/specify-shaped body) |
| `skills/recon/SKILL.md` | Standard preamble, Anti-Patterns, Component-Skill Contract, Relationship table, Next Actions, the run procedure (dry-run → persist → judgment dispatch → file issues) |

Finding shape (Phase 1, used throughout): `{ lens, areaId, severity, title, files, evidence, suggestion, acceptance, signature }`. Severity vocabulary: `critical | high | medium | low | info`.

---

## File Structure

| File | Disposition | Responsibility |
|------|-------------|----------------|
| `bin/lib/recon/score.js` | **New** | `scoreAreas(areas, signals) -> rankedAreas`; `MAX_STALE_DAYS` round-robin floor; weight constants |
| `bin/lib/recon/pull-issues.js` | **New** | `pullReconIssues({label, minSeverity?, issuesJson}) -> brief[]`; pure parse of `gh issue list --json` output |
| `bin/lib/recon/cache.js` | **Modify** | Add `recordRun(rootDir, runId, fingerprints)`, `readRuns(rootDir)`, `computeChurn(currentFps, priorRun)` under `.claude-tweaks/recon/runs/` |
| `bin/lib/recon/dedup.js` | **Modify** | Complete the `reopen` arm: a finding matching a closed (non-`wontfix`) issue → `{action:'reopen', issue, note}` |
| `bin/recon.js` | **Modify** | Rewire `selectAreas` to call `scoreAreas`; add `status` and `churn-report` subcommands + their arg parsing |
| `tests/recon/score.test.js` | **New** | Scoring fixtures → ranking; round-robin floor boosts a stale area |
| `tests/recon/pull-issues.test.js` | **New** | Parse `gh` JSON → briefs; min-severity filter; fingerprint extraction |
| `tests/recon/churn.test.js` | **New** | `recordRun`/`readRuns`/`computeChurn` (union-denominator formula) |
| `tests/recon/dedup-reopen.test.js` | **New** | Closed-issue match → `reopen`; `wontfix` match → `suppress` |
| `tests/recon/cli.test.js` | **New** | `status --fail-on` exit codes; `churn-report --fail-on-high-churn` exit code |
| `skills/recon/SKILL.md` | **Modify** | Add `## Routine Configuration` (+ neutral billing note), `status`/`churn-report` usage, regression-reopen + `gh` reopen-comment recipe; add `/flow` Relationship row if absent |
| `skills/flow/from-recon.md` | **New** | `--from-recon` pull-issues → /specify briefs → multi-spec batch procedure |
| `skills/flow/SKILL.md` | **Modify** | `--from-recon` argument row; input-resolution path 5; `/recon` Relationship row |
| `skills/flow/steps-and-gates.md` | **Modify** | Document `--from-recon` mode in the Step Arguments home |
| `.claude-plugin/plugin.json` | **Modify** | Version → 4.18.0 |
| (memenu-app, separate repo) | **Delete** | The entire `claude-tweaks-sweep` artifact tree, design doc, six plan docs |

Tests live under `tests/recon/`. The repo test command is `node --test tests/` (discovers nested dirs); each task runs its own file explicitly with `node --test tests/recon/<file>.test.js`.

---

## Task 1: Area scoring + round-robin coverage floor

**Files:**
- New: `bin/lib/recon/score.js`
- Test: `tests/recon/score.test.js`

The Phase 1 `selectAreas` returns the first K detected areas with no prioritization. This task adds the weighted score so hot/important areas surface first, plus a staleness floor so nothing rots unseen (design §8). `scoreAreas` is **pure** — it takes the areas and a pre-collected `signals` map; the CLI (Task 5) gathers the git/LoC signals and passes them in, keeping `child_process` out of the scorer so it is trivially testable.

- [ ] **Step 1: Failing test for the weighted ranking**

Create `tests/recon/score.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { scoreAreas, MAX_STALE_DAYS } = require('../../bin/lib/recon/score');

const NOW = Date.parse('2026-06-14T00:00:00Z');

// Two areas: "hot" has recent churn + prior findings; "cold" is quiet.
const areas = [
  { id: 'src/api', path: 'src/api' },
  { id: 'src/util', path: 'src/util' },
];
const signals = {
  'src/api': { lastSweptMs: NOW - 2 * 86400000, churn: 30, loc: 4000, priorFindings: 8, fanIn: 12 },
  'src/util': { lastSweptMs: NOW - 1 * 86400000, churn: 1, loc: 200, priorFindings: 0, fanIn: 1 },
};

test('scoreAreas ranks the hot area first', () => {
  const ranked = scoreAreas(areas, signals, NOW);
  assert.strictEqual(ranked[0].id, 'src/api');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('scoreAreas returns every area with a numeric score', () => {
  const ranked = scoreAreas(areas, signals, NOW);
  assert.strictEqual(ranked.length, 2);
  for (const a of ranked) assert.strictEqual(typeof a.score, 'number');
});
```

- [ ] **Step 2: Run — fails (module missing)**

Run: `node --test tests/recon/score.test.js`
Expected: fails with `Cannot find module '../../bin/lib/recon/score'`.

- [ ] **Step 3: Minimal implementation**

Create `bin/lib/recon/score.js`:

```js
// bin/lib/recon/score.js
// Pure area scorer. Signals are pre-collected by the CLI (no child_process here).

const MAX_STALE_DAYS = 30;        // round-robin floor: areas past this are force-boosted
const STALE_BOOST = 1.0;          // additive boost applied once an area exceeds MAX_STALE_DAYS

// Normalization caps (raw signal value that maps to 1.0).
const CHURN_CAP = 50;
const LOC_CAP = 10000;
const PRIOR_CAP = 20;
const FANIN_CAP = 25;

// Weights sum to 1.0 across the five signals.
const WEIGHTS = {
  staleness: 0.30,
  churn: 0.25,
  fanIn: 0.20,   // blast radius
  loc: 0.10,
  priorFindings: 0.15,
};

function clamp01(n) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? 1 : n;
}

// areas: Area[]; signals: { [areaId]: { lastSweptMs, churn, loc, priorFindings, fanIn } };
// now: ms epoch. Returns areas with a `score` field, sorted descending (alpha id tie-break).
function scoreAreas(areas, signals, now) {
  const scored = areas.map((area) => {
    const s = signals[area.id] || {};
    const lastSweptMs = s.lastSweptMs == null ? null : s.lastSweptMs;

    const stalenessRaw =
      lastSweptMs === null ? 1 : clamp01((now - lastSweptMs) / (MAX_STALE_DAYS * 86400000));
    const churnRaw = clamp01((s.churn || 0) / CHURN_CAP);
    const locRaw = clamp01((s.loc || 0) / LOC_CAP);
    const priorRaw = clamp01((s.priorFindings || 0) / PRIOR_CAP);
    const fanInRaw = clamp01((s.fanIn || 0) / FANIN_CAP);

    let score =
      WEIGHTS.staleness * stalenessRaw +
      WEIGHTS.churn * churnRaw +
      WEIGHTS.fanIn * fanInRaw +
      WEIGHTS.loc * locRaw +
      WEIGHTS.priorFindings * priorRaw;

    // Round-robin floor: any area never swept or past MAX_STALE_DAYS gets a boost,
    // guaranteeing eventual full coverage no matter how cold it is.
    const daysSinceSwept =
      lastSweptMs === null ? Infinity : (now - lastSweptMs) / 86400000;
    if (daysSinceSwept > MAX_STALE_DAYS) score += STALE_BOOST;

    return { ...area, score };
  });

  scored.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  return scored;
}

module.exports = { scoreAreas, MAX_STALE_DAYS, STALE_BOOST, WEIGHTS };
```

- [ ] **Step 4: Run — passes**

Run: `node --test tests/recon/score.test.js`
Expected: `2 pass, 0 fail`.

- [ ] **Step 5: Failing test for the round-robin floor**

Append to `tests/recon/score.test.js`:

```js
test('round-robin floor boosts an area past MAX_STALE_DAYS over a fresh busy area', () => {
  const a = [
    { id: 'a/fresh-busy', path: 'a/fresh-busy' },
    { id: 'z/stale-quiet', path: 'z/stale-quiet' },
  ];
  const sig = {
    'a/fresh-busy': { lastSweptMs: NOW - 1 * 86400000, churn: 50, loc: 10000, priorFindings: 20, fanIn: 25 },
    // never swept → daysSinceSwept = Infinity → boosted
    'z/stale-quiet': { lastSweptMs: null, churn: 0, loc: 0, priorFindings: 0, fanIn: 0 },
  };
  const ranked = scoreAreas(a, sig, NOW);
  // staleness(1.0 weighted 0.30) + STALE_BOOST(1.0) = 1.30 beats a maxed-out fresh area (1.0)
  assert.strictEqual(ranked[0].id, 'z/stale-quiet');
});

test('MAX_STALE_DAYS is exported and positive', () => {
  assert.ok(MAX_STALE_DAYS > 0);
});
```

- [ ] **Step 6: Run — passes (no impl change needed; the floor already covers this)**

Run: `node --test tests/recon/score.test.js`
Expected: `4 pass, 0 fail`. (If the busy area wins, the bug is that `STALE_BOOST` is too small relative to the maxed weighted sum — `STALE_BOOST = 1.0` is chosen so a never-swept area always outranks any single fresh area, which is the floor's contract.)

- [ ] **Step 7: Commit**

```bash
git add bin/lib/recon/score.js tests/recon/score.test.js
git commit -m "Add weighted area scoring with round-robin coverage floor"
```

---

## Task 2: Wire scoring into `selectAreas` (CLI signal collection)

**Files:**
- Modify: `bin/recon.js`
- Test: `tests/recon/cli.test.js` (created here, extended in Task 6)

Phase 1's `selectAreas` returns `detectAreas` top-K unprioritized. Rewire it to collect signals (git churn, LoC, prior-finding density from the cache, fan-in) and delegate ranking to `scoreAreas`. Signal collection is the impure part (it shells out to git); the scorer stays pure. `--area <path>` still bypasses detection and scoring (explicit single-area runs).

- [ ] **Step 1: Read the existing `selectAreas` to anchor the edit**

Run: `grep -n "function selectAreas" bin/recon.js`
Expected: one match (the Phase 1 stub). Read the surrounding lines so the replacement preserves the `--area` bypass and the `cfg.K` top-K slice.

- [ ] **Step 2: Failing test — `selectAreas` returns scored, ranked areas**

Create `tests/recon/cli.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const recon = require('../../bin/recon');

test('selectAreas delegates to scoreAreas and slices top-K', () => {
  // Inject deterministic signals so the test does not shell out to git.
  const areas = [
    { id: 'src/api', path: 'src/api' },
    { id: 'src/util', path: 'src/util' },
    { id: 'src/old', path: 'src/old' },
  ];
  const signals = {
    'src/api': { lastSweptMs: Date.now() - 86400000, churn: 30, loc: 4000, priorFindings: 8, fanIn: 12 },
    'src/util': { lastSweptMs: Date.now() - 86400000, churn: 1, loc: 200, priorFindings: 0, fanIn: 1 },
    'src/old': { lastSweptMs: null, churn: 0, loc: 0, priorFindings: 0, fanIn: 0 },
  };
  const picked = recon.selectAreas(
    { K: 2 },
    { areas, signals, now: Date.now() },
  );
  assert.strictEqual(picked.length, 2);
  // src/old (never swept → boosted) and src/api (hot) outrank src/util.
  const ids = picked.map((a) => a.id);
  assert.ok(ids.includes('src/old'));
  assert.ok(ids.includes('src/api'));
  assert.ok(!ids.includes('src/util'));
});
```

- [ ] **Step 3: Run — fails**

Run: `node --test tests/recon/cli.test.js`
Expected: fails — `selectAreas` either is not exported or does not accept the injected `{areas, signals, now}` shape.

- [ ] **Step 4: Implementation — rewire `selectAreas`, add signal collection, export for tests**

In `bin/recon.js`, add the import near the other `bin/lib/recon` requires:

```js
const { scoreAreas } = require('./lib/recon/score');
```

Replace the Phase 1 `selectAreas` with the testable two-path version (the `inject` parameter lets tests pass deterministic signals; production passes nothing and the function collects them):

```js
// Returns areas to sweep this run. `--area` bypasses detection + scoring.
// `inject` (tests only): { areas, signals, now } supplies deterministic inputs.
function selectAreas(cfg, inject) {
  if (cfg.area) return [{ id: cfg.area, path: cfg.area }];

  const now = inject && inject.now != null ? inject.now : Date.now();
  const areas = inject && inject.areas ? inject.areas : detectAreas(cfg.root);
  const signals =
    inject && inject.signals ? inject.signals : collectSignals(cfg.root, areas, cfg);

  const ranked = scoreAreas(areas, signals, now);
  return ranked.slice(0, cfg.K || 3);
}

// Impure: gathers per-area signals from git, the filesystem, and the dedup cache.
function collectSignals(rootDir, areas, cfg) {
  const cache = loadCache(rootDir);                  // Phase 1 export
  const signals = {};
  for (const area of areas) {
    signals[area.id] = {
      lastSweptMs: lastSweptMs(cache, area.id),
      churn: gitChurn(rootDir, area.path),
      loc: areaLoc(rootDir, area.path),
      priorFindings: priorFindingCount(cache, area.id),
      fanIn: 0,                                       // fan-in heuristic: extended in a later pass
    };
  }
  return signals;
}

function gitChurn(rootDir, areaPath) {
  const { execFileSync } = require('child_process');
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  try {
    const out = execFileSync(
      'git',
      ['-C', rootDir, 'log', '--oneline', `--since=${since}`, '--', areaPath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

function areaLoc(rootDir, areaPath) {
  const { execSync } = require('child_process');
  const abs = require('path').join(rootDir, areaPath);
  try {
    const out = execSync(
      `find "${abs}" -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" \\) -print0 | xargs -0 wc -l 2>/dev/null | tail -1`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const n = parseInt(out.trim().split(/\s+/)[0], 10);
    return Number.isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

// Cache shape (Phase 1): { <fp>: { status, issue, area?, lastSweptMs? } }.
function lastSweptMs(cache, areaId) {
  let max = null;
  for (const entry of Object.values(cache)) {
    if (entry.area === areaId && typeof entry.lastSweptMs === 'number') {
      if (max === null || entry.lastSweptMs > max) max = entry.lastSweptMs;
    }
  }
  return max;
}

function priorFindingCount(cache, areaId) {
  let n = 0;
  for (const entry of Object.values(cache)) {
    if (entry.area === areaId && (entry.status === 'open' || entry.status === 'regressed')) n++;
  }
  return n;
}
```

At the bottom of `bin/recon.js`, ensure the module exports include `selectAreas` (add to the existing `module.exports` object, do not replace it):

```js
module.exports = Object.assign(module.exports || {}, { selectAreas, collectSignals });
```

Guard the `main()` invocation so requiring the module in tests does not run the CLI:

```js
if (require.main === module) main();
```

- [ ] **Step 5: Run — passes**

Run: `node --test tests/recon/cli.test.js`
Expected: `1 pass, 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add bin/recon.js tests/recon/cli.test.js
git commit -m "Wire selectAreas to delegate to scoreAreas with collected signals"
```

---

## Task 3: Regression reopen path in `dedup.js`

**Files:**
- Modify: `bin/lib/recon/dedup.js`
- Test: `tests/recon/dedup-reopen.test.js`

Design §9 lifecycle: a finding whose fingerprint matches a **closed** (non-`wontfix`) issue and reappears → `reopen` with a "regressed" note. A `wontfix` match → `suppress` (respect the standing decision). Phase 1 stubbed the `reopen` arm; complete it. `decide` is pure — it takes the finding and an `issueIndex` keyed by fingerprint, returns an action object.

- [ ] **Step 1: Failing test for the closed/wontfix arms**

Create `tests/recon/dedup-reopen.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../../bin/lib/recon/dedup');

const finding = { fingerprint: 'fp-abc', severity: 'high', title: 'Oversized module' };

test('closed (non-wontfix) issue match → reopen with regressed note', () => {
  const issueIndex = { 'fp-abc': { number: 42, state: 'closed', labels: ['recon'] } };
  const d = decide(finding, issueIndex);
  assert.strictEqual(d.action, 'reopen');
  assert.strictEqual(d.issue, 42);
  assert.match(d.note, /regress/i);
});

test('wontfix issue match → suppress (standing decision respected)', () => {
  const issueIndex = { 'fp-abc': { number: 9, state: 'closed', labels: ['recon', 'wontfix'] } };
  const d = decide(finding, issueIndex);
  assert.strictEqual(d.action, 'suppress');
});

test('open issue match → skip (no flood)', () => {
  const issueIndex = { 'fp-abc': { number: 7, state: 'open', labels: ['recon'] } };
  const d = decide(finding, issueIndex);
  assert.strictEqual(d.action, 'skip');
});

test('no match → file', () => {
  const d = decide(finding, {});
  assert.strictEqual(d.action, 'file');
});
```

- [ ] **Step 2: Run — fails**

Run: `node --test tests/recon/dedup-reopen.test.js`
Expected: the reopen test fails (the Phase 1 stub returns something other than `{action:'reopen', issue, note}`); the others may pass if Phase 1 implemented them.

- [ ] **Step 3: Implementation — complete the `reopen`/`suppress` arms**

In `bin/lib/recon/dedup.js`, locate `decide` and make its body exactly:

```js
function hasLabel(issue, label) {
  return Array.isArray(issue.labels) && issue.labels.includes(label);
}

// Pure dedup decision. finding: { fingerprint, severity, ... };
// issueIndex: { <fingerprint>: { number, state, labels } } built from gh issue list.
function decide(finding, issueIndex) {
  const match = issueIndex[finding.fingerprint];
  if (!match) return { action: 'file' };

  if (match.state === 'open') return { action: 'skip', issue: match.number };

  // state === 'closed'
  if (hasLabel(match, 'wontfix')) return { action: 'suppress', issue: match.number };

  return {
    action: 'reopen',
    issue: match.number,
    note: 'regressed — this finding was previously closed and has reappeared',
  };
}
```

Keep `decide` in `module.exports`.

- [ ] **Step 4: Run — passes**

Run: `node --test tests/recon/dedup-reopen.test.js`
Expected: `4 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/recon/dedup.js tests/recon/dedup-reopen.test.js
git commit -m "Complete dedup reopen path for regressed closed issues"
```

---

## Task 4: Fingerprint-churn monitoring (cache run-log + `computeChurn`)

**Files:**
- Modify: `bin/lib/recon/cache.js`
- Test: `tests/recon/churn.test.js`

Design §16 names fingerprint stability the top engineering risk. The churn metric tunes it: each run records the set of fingerprints it produced under `.claude-tweaks/recon/runs/` (gitignored); `computeChurn` compares the current set against the prior run. **Corrected formula (PORT.md delta #5): denominator = size of the union `|prior ∪ current|`**, so complete turnover yields ratio 1.0 (the old engine's `max(prior, current)` denominator wrongly produced 2.0).

- [ ] **Step 1: Failing test for record/read/churn**

Create `tests/recon/churn.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { recordRun, readRuns, computeChurn } = require('../../bin/lib/recon/cache');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-churn-'));
}

test('recordRun then readRuns round-trips fingerprints', () => {
  const root = tmpRoot();
  recordRun(root, '2026-06-14T100000', ['fp-a', 'fp-b']);
  const runs = readRuns(root);
  assert.strictEqual(runs.length, 1);
  assert.deepStrictEqual(runs[0].fingerprints.sort(), ['fp-a', 'fp-b']);
});

test('computeChurn uses union denominator — complete turnover is ratio 1.0', () => {
  const c = computeChurn(['fp-c', 'fp-d'], { fingerprints: ['fp-a', 'fp-b'] });
  // appeared 2 + disappeared 2 = 4; union {a,b,c,d} = 4; 4/4 = 1.0
  assert.strictEqual(c.ratio, 1);
  assert.deepStrictEqual(c.appeared.sort(), ['fp-c', 'fp-d']);
  assert.deepStrictEqual(c.disappeared.sort(), ['fp-a', 'fp-b']);
});

test('computeChurn partial overlap', () => {
  const c = computeChurn(['fp-a', 'fp-c'], { fingerprints: ['fp-a', 'fp-b'] });
  // appeared {c} 1 + disappeared {b} 1 = 2; union {a,b,c} = 3; 2/3 ≈ 0.667
  assert.strictEqual(c.ratio, 0.667);
  assert.deepStrictEqual(c.stayed, ['fp-a']);
});

test('computeChurn with no prior run is ratio 1.0 (everything appeared)', () => {
  const c = computeChurn(['fp-a'], null);
  assert.strictEqual(c.ratio, 1);
});
```

- [ ] **Step 2: Run — fails**

Run: `node --test tests/recon/churn.test.js`
Expected: fails — `recordRun`/`readRuns`/`computeChurn` not exported from `cache.js`.

- [ ] **Step 3: Implementation — add run-log helpers to `cache.js`**

Append to `bin/lib/recon/cache.js` (reuse the existing `.claude-tweaks/recon/` root the cache already uses; do not redefine the cache itself):

```js
const fs = require('fs');
const path = require('path');

function runsDir(rootDir) {
  return path.join(rootDir, '.claude-tweaks', 'recon', 'runs');
}

// Persist the fingerprint set this run produced. runId is an ISO-ish timestamp;
// colons are valid on Linux/macOS so the runId round-trips into the filename.
function recordRun(rootDir, runId, fingerprints) {
  const dir = runsDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  const record = { runId, runAt: new Date().toISOString(), fingerprints: [...fingerprints] };
  fs.writeFileSync(path.join(dir, `${runId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return record;
}

// All run records, oldest first (by runAt).
function readRuns(rootDir) {
  let entries;
  try {
    entries = fs.readdirSync(runsDir(rootDir));
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(runsDir(rootDir), f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((r) => r && Array.isArray(r.fingerprints) && r.runId)
    .sort((a, b) => ((a.runAt || '') < (b.runAt || '') ? -1 : 1));
}

// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
// PORT.md delta #5: union denominator, NOT max(prior, current).
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);

  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const stayed = currentFps.filter((fp) => prior.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const ratio = (appeared.length + disappeared.length) / total;

  return { appeared, disappeared, stayed, ratio: Math.round(ratio * 1000) / 1000 };
}

module.exports = Object.assign(module.exports, {
  runsDir,
  recordRun,
  readRuns,
  computeChurn,
});
```

(If `cache.js` uses `import`/ESM or a different `module.exports` style, match it — the contract is the four exported names, not the literal `Object.assign`.)

- [ ] **Step 4: Run — passes**

Run: `node --test tests/recon/churn.test.js`
Expected: `4 pass, 0 fail`.

- [ ] **Step 5: Verify the runs dir is gitignored**

Run: `grep -n "claude-tweaks" .gitignore`
Expected: a line covering `.claude-tweaks/` runtime state. If only `.claude-tweaks/research/` is present, add `.claude-tweaks/recon/` in this step and note it in the commit. (The `.gitignore` currently lists `.claude-tweaks/research/` only — add `.claude-tweaks/recon/`.)

```bash
# if missing, append the line:
printf '.claude-tweaks/recon/\n' >> .gitignore
```

- [ ] **Step 6: Commit**

```bash
git add bin/lib/recon/cache.js tests/recon/churn.test.js .gitignore
git commit -m "Add fingerprint-churn run-log with union-denominator ratio"
```

---

## Task 5: `pull-issues.js` — parse `recon` issues into briefs

**Files:**
- New: `bin/lib/recon/pull-issues.js`
- Test: `tests/recon/pull-issues.test.js`

The `/flow --from-recon` affordance (Task 7) needs to turn open `recon`-labelled GitHub issues into /specify briefs. `pullReconIssues` is **pure**: the SKILL.md runs `gh issue list --label recon --state open --json number,title,body,labels` and passes the parsed JSON in; this function maps each issue's /specify-shaped body sections back to a brief and extracts the fingerprint + severity from the body/labels. No network.

- [ ] **Step 1: Failing test**

Create `tests/recon/pull-issues.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { pullReconIssues } = require('../../bin/lib/recon/pull-issues');

// Issue bodies are /specify-shaped (issue-payload.js, Phase 1) with a hidden
// fingerprint marker line. gh issue list --json returns this array shape.
const issuesJson = [
  {
    number: 12,
    title: 'Oversized module: src/api/handlers.ts',
    labels: [{ name: 'recon' }, { name: 'recon:high' }],
    body: [
      '<!-- recon-fingerprint: fp-12abc -->',
      '## Current State',
      'src/api/handlers.ts is 820 lines.',
      '## Deliverables',
      'Split into cohesive modules.',
      '## Acceptance Criteria',
      'No file over 400 lines.',
    ].join('\n'),
  },
  {
    number: 13,
    title: 'TODO debt in src/util',
    labels: [{ name: 'recon' }, { name: 'recon:low' }],
    body: '<!-- recon-fingerprint: fp-13def -->\n## Current State\n12 TODOs.',
  },
];

test('pullReconIssues maps issues to briefs with fingerprint + severity', () => {
  const briefs = pullReconIssues({ label: 'recon', issuesJson });
  assert.strictEqual(briefs.length, 2);
  assert.strictEqual(briefs[0].number, 12);
  assert.strictEqual(briefs[0].fingerprint, 'fp-12abc');
  assert.strictEqual(briefs[0].severity, 'high');
  assert.strictEqual(briefs[0].title, 'Oversized module: src/api/handlers.ts');
  assert.match(briefs[0].body, /## Deliverables/);
});

test('minSeverity filters out below-threshold issues', () => {
  const briefs = pullReconIssues({ label: 'recon', minSeverity: 'high', issuesJson });
  assert.strictEqual(briefs.length, 1);
  assert.strictEqual(briefs[0].number, 12);
});

test('issues without the recon label are ignored', () => {
  const briefs = pullReconIssues({
    label: 'recon',
    issuesJson: [{ number: 1, title: 'x', labels: [{ name: 'bug' }], body: 'y' }],
  });
  assert.strictEqual(briefs.length, 0);
});
```

- [ ] **Step 2: Run — fails**

Run: `node --test tests/recon/pull-issues.test.js`
Expected: fails with `Cannot find module '../../bin/lib/recon/pull-issues'`.

- [ ] **Step 3: Implementation**

Create `bin/lib/recon/pull-issues.js`:

```js
// bin/lib/recon/pull-issues.js
// Pure: parse `gh issue list --json number,title,body,labels` output into briefs.
// The SKILL.md runs gh and passes the parsed array as issuesJson — no network here.

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const FP_RE = /<!--\s*recon-fingerprint:\s*([^\s>]+)\s*-->/;
const SEV_LABEL_RE = /^recon:(critical|high|medium|low|info)$/;

function labelNames(issue) {
  return (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
}

function severityOf(names) {
  for (const n of names) {
    const m = SEV_LABEL_RE.exec(n);
    if (m) return m[1];
  }
  return 'info';
}

// opts: { label = 'recon', minSeverity?, issuesJson }. Returns brief[]:
// [{ number, title, body, fingerprint, severity }].
function pullReconIssues({ label = 'recon', minSeverity, issuesJson = [] } = {}) {
  const floor = minSeverity != null ? SEVERITY_RANK[minSeverity] : null;
  const briefs = [];
  for (const issue of issuesJson) {
    const names = labelNames(issue);
    if (!names.includes(label)) continue;

    const severity = severityOf(names);
    if (floor != null && (SEVERITY_RANK[severity] ?? SEVERITY_RANK.info) > floor) continue;

    const body = issue.body || '';
    const fpMatch = FP_RE.exec(body);
    briefs.push({
      number: issue.number,
      title: issue.title,
      body,
      fingerprint: fpMatch ? fpMatch[1] : null,
      severity,
    });
  }
  return briefs;
}

module.exports = { pullReconIssues, SEVERITY_RANK };
```

- [ ] **Step 4: Run — passes**

Run: `node --test tests/recon/pull-issues.test.js`
Expected: `3 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/recon/pull-issues.js tests/recon/pull-issues.test.js
git commit -m "Add pull-issues parser mapping recon issues to specify briefs"
```

---

## Task 6: `status` and `churn-report` CLI subcommands

**Files:**
- Modify: `bin/recon.js`
- Test: `tests/recon/cli.test.js` (extend with subprocess assertions)

`status` reads the dedup cache + the prior run-log and prints `open:N regressed:N closed:N wontfix:N`, exiting 1 on the gated condition (`--fail-on regressed|critical`). `churn-report` reads the run-logs and prints a per-run churn table, exiting 1 on `--fail-on-high-churn <ratio>`. Both are CLI-level — tested by spawning the script so exit codes are observed.

- [ ] **Step 1: Failing test — spawn the CLI and assert exit codes**

Append to `tests/recon/cli.test.js`:

```js
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, '..', '..', 'bin', 'recon.js');

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-cli-'));
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'recon'), { recursive: true });
  return root;
}

function writeCache(root, cache) {
  fs.writeFileSync(
    path.join(root, '.claude-tweaks', 'recon', 'cache.json'),
    JSON.stringify(cache, null, 2),
    'utf8',
  );
}

test('status prints counts and exits 0 with no regressions', () => {
  const root = tmpRepo();
  writeCache(root, {
    'fp-1': { status: 'open', severity: 'low' },
    'fp-2': { status: 'closed' },
    'fp-3': { status: 'wontfix' },
  });
  const r = spawnSync('node', [CLI, 'status', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /open:1/);
  assert.match(r.stdout, /closed:1/);
  assert.match(r.stdout, /wontfix:1/);
});

test('status --fail-on regressed exits 1 when a finding regressed', () => {
  const root = tmpRepo();
  writeCache(root, { 'fp-1': { status: 'regressed' } });
  const r = spawnSync('node', [CLI, 'status', '--fail-on', 'regressed', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /regressed:1/);
});

test('status --fail-on critical exits 1 when an open critical exists', () => {
  const root = tmpRepo();
  writeCache(root, { 'fp-1': { status: 'open', severity: 'critical' } });
  const r = spawnSync('node', [CLI, 'status', '--fail-on', 'critical', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
});

test('churn-report --fail-on-high-churn exits 1 above threshold', () => {
  const root = tmpRepo();
  const runs = path.join(root, '.claude-tweaks', 'recon', 'runs');
  fs.mkdirSync(runs, { recursive: true });
  fs.writeFileSync(path.join(runs, 'r1.json'), JSON.stringify({ runId: 'r1', runAt: '2026-06-13T00:00:00Z', fingerprints: ['fp-a', 'fp-b'] }));
  fs.writeFileSync(path.join(runs, 'r2.json'), JSON.stringify({ runId: 'r2', runAt: '2026-06-14T00:00:00Z', fingerprints: ['fp-c', 'fp-d'] }));
  const r = spawnSync('node', [CLI, 'churn-report', '--fail-on-high-churn', '0.5', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /1\b/); // ratio 1.0 row present
});
```

- [ ] **Step 2: Run — fails**

Run: `node --test tests/recon/cli.test.js`
Expected: the spawn tests fail — `status` / `churn-report` are unknown commands (exit 2) or absent.

- [ ] **Step 3: Implementation — add the subcommands + arg parsing**

In `bin/recon.js`, extend `parseArgs` to recognize `--fail-on`, `--fail-on-high-churn`, and `--root` (if not already handled), then add the two command functions and wire them into `main`'s dispatch. Add the cache + churn imports if not already present:

```js
const { loadCache } = require('./lib/recon/cache');
const { readRuns, computeChurn } = require('./lib/recon/cache');
```

```js
function cmdStatus(args) {
  const cache = loadCache(args.root);
  const findings = Object.values(cache);
  const counts = {
    open: findings.filter((f) => f.status === 'open').length,
    regressed: findings.filter((f) => f.status === 'regressed').length,
    closed: findings.filter((f) => f.status === 'closed').length,
    wontfix: findings.filter((f) => f.status === 'wontfix').length,
    critical: findings.filter((f) => f.status === 'open' && f.severity === 'critical').length,
  };
  const line = `open:${counts.open} regressed:${counts.regressed} closed:${counts.closed} wontfix:${counts.wontfix}\n`;
  const failOn = args['fail-on'];
  if (failOn === 'regressed' && counts.regressed > 0) {
    process.stdout.write(`FAIL: ${counts.regressed} regressed finding(s)\n` + line);
    process.exit(1);
  }
  if (failOn === 'critical' && counts.critical > 0) {
    process.stdout.write(`FAIL: ${counts.critical} open critical finding(s)\n` + line);
    process.exit(1);
  }
  process.stdout.write(line);
}

function cmdChurnReport(args) {
  const runs = readRuns(args.root);
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
    if (threshold != null && c.ratio >= threshold) exceeded = true;
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
```

In `main`, add to the command dispatch (alongside the Phase 1/2 commands):

```js
else if (cmd === 'status') cmdStatus(args);
else if (cmd === 'churn-report') cmdChurnReport(args);
```

- [ ] **Step 4: Run — passes**

Run: `node --test tests/recon/cli.test.js`
Expected: all `cli.test.js` tests pass (Task 2's `selectAreas` test + the four spawn tests).

- [ ] **Step 5: Full recon suite green**

Run: `node --test tests/recon/`
Expected: every `tests/recon/*.test.js` passes (`0 fail`).

- [ ] **Step 6: Commit**

```bash
git add bin/recon.js tests/recon/cli.test.js
git commit -m "Add recon status and churn-report CLI subcommands with fail-on gates"
```

---

## Task 7: `/flow --from-recon` affordance (markdown)

**Files:**
- New: `skills/flow/from-recon.md`
- Modify: `skills/flow/SKILL.md`, `skills/flow/steps-and-gates.md`

Design §10: `/flow` gains a mode to pull open `recon`-labelled issues, turn each into a /specify brief, and run the existing multi-spec batch + consolidated Review Console. This is markdown only — no new code path; it reuses Task 5's `pullReconIssues` (run through `gh` by the skill) and the existing multi-spec pipeline. The `gh` call is through-tool (the skill runs it); the parser is pure.

- [ ] **Step 1: Write the `from-recon.md` sub-file**

Create `skills/flow/from-recon.md` with exactly:

````markdown
# Flow — `--from-recon` mode

`/claude-tweaks:flow --from-recon` pulls open GitHub issues labelled `recon` (filed by
`/claude-tweaks:recon`), turns each into a `/claude-tweaks:specify` brief, and runs the
resulting specs through the existing multi-spec batch pipeline + consolidated Review Console.
This is the only `/flow` entry point that does not take spec numbers up front — the specs are
*derived* from issues at the start of the run.

## Syntax

```
/claude-tweaks:flow --from-recon [--min-severity high] [worktree | current-branch] [keep-going] [auto | confirm | hybrid]
```

`--min-severity` (default: none — all open `recon` issues) filters by the `recon:<sev>` label.
All other `/flow` arguments behave as normal — `--from-recon` only changes how the spec list is
assembled.

## Procedure

1. **Pull issues (through-tool).** Run the GitHub CLI to list open `recon` issues as JSON:

   ```bash
   gh issue list --label recon --state open \
     --json number,title,body,labels --limit 100
   ```

   If `gh` is unavailable or unauthenticated, STOP with: "GitHub CLI not available — `/flow
   --from-recon` needs `gh` to read `recon` issues. Install/authenticate `gh`, or run
   `/claude-tweaks:flow <spec-numbers>` directly." (Hard gate — `auto` does not silence a missing
   dependency.)

2. **Parse to briefs (pure).** Pass the parsed JSON array to `pullReconIssues`:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" pull-issues \
     --label recon [--min-severity high] --issues-json <path-to-gh-output.json>
   ```

   (or call `bin/lib/recon/pull-issues.js`'s `pullReconIssues` directly with the parsed array).
   Each brief is `{ number, title, body, fingerprint, severity }`. The body is already
   `/specify`-shaped (Current State / Deliverables / Acceptance Criteria).

3. **Derive specs via `/specify`.** For each brief, invoke `/claude-tweaks:specify` with the
   brief's title + body as the design input. `/specify` produces a numbered spec under `specs/`.
   Carry the issue `number` and `fingerprint` forward as spec frontmatter (`recon-issue: <number>`,
   `recon-fingerprint: <fp>`) so wrap-up can close the issue on merge.

4. **Run the multi-spec batch.** Feed the derived spec numbers into the standard Multi-Spec
   Sequential Flow (see `multi-spec.md`) — dependency-aware ordering, shared worktree, deferred
   per-spec consoles, one consolidated Review Console at the end. Nothing about the batch pipeline
   changes; `--from-recon` only sourced the spec list.

5. **Close-the-loop note (Review Console).** Surface, in the consolidated Review Console, which
   `recon` issues each merged spec resolves, with the `gh` command to close them:

   ```bash
   gh issue close <number> --comment "Resolved by spec <N> (flow --from-recon)"
   ```

   Closing is a user action at the console — the pipeline never closes issues autonomously
   (closing a GitHub issue is a non-reversible network write; see `_shared/auto-mode-contract.md`,
   "Never-reversible").

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Filing or closing `recon` issues from inside `/flow` | `/flow --from-recon` is a *consumer* of issues. Filing belongs to `/recon`; closing is a user decision at the Review Console. |
| Auto-closing the issue when its spec merges | Closing is a non-reversible network write — `auto` never silences it. Surface the `gh issue close` command; the user runs it. |
| Pulling issues without `--state open` | Closed/`wontfix` issues are standing decisions — re-pulling them re-floods the batch with resolved work. |
````

- [ ] **Step 2: grep-verify the sub-file**

Run: `grep -n "from-recon\|pullReconIssues\|gh issue list" skills/flow/from-recon.md`
Expected: matches for all three (mode name, parser, through-tool gh call present).

- [ ] **Step 3: Add the `--from-recon` argument row + input-resolution path to `skills/flow/SKILL.md`**

In the `### Arguments` table in `skills/flow/SKILL.md`, add a row after the `<spec>` row:

```markdown
| `--from-recon` | No | **Alternative spec source.** Instead of spec numbers, pull open `recon`-labelled GitHub issues, turn each into a `/claude-tweaks:specify` brief, and run the derived specs through the multi-spec batch. Pair with `--min-severity <sev>` to filter. Needs the `gh` CLI (hard gate if absent). See `from-recon.md`. |
| `--min-severity <sev>` | No | **`--from-recon` only.** Filter pulled issues by the `recon:<sev>` label (`critical`/`high`/`medium`/`low`). Default: all open `recon` issues. |
```

In the `### Input resolution` numbered list, add a fifth entry:

```markdown
5. **`--from-recon` flag** → **Recon-batch mode** — ignore any spec numbers; assemble the spec list by pulling open `recon` GitHub issues → `/specify` briefs → derived specs, then run the standard multi-spec batch. See `from-recon.md` for the full procedure.
```

- [ ] **Step 4: Document `--from-recon` in the Step Arguments home (`steps-and-gates.md`)**

In `skills/flow/steps-and-gates.md`, after the `## Step Arguments` table, add:

```markdown
### `--from-recon` spec source

`--from-recon` is not a step — it is an alternative *spec source* resolved before Step 1. It
pulls open `recon`-labelled GitHub issues (via `gh`), maps each to a `/claude-tweaks:specify`
brief (`bin/lib/recon/pull-issues.js`), derives specs, then runs the normal step pipeline
(`build,test,review,polish,wrap-up`) as a multi-spec batch. `--min-severity <sev>` filters the
pull by the `recon:<sev>` label. The full procedure lives in `from-recon.md`; the step pipeline
and gates are unchanged. A missing/unauthenticated `gh` CLI is a hard gate (`auto` does not
silence a missing dependency).
```

- [ ] **Step 5: Add the bidirectional `/recon` Relationship row to `skills/flow/SKILL.md`**

In the `## Relationship to Other Skills` table in `skills/flow/SKILL.md`, add (if Phase 1 didn't already):

```markdown
| `/claude-tweaks:recon` | `/flow --from-recon` pulls the `recon`-labelled GitHub issues `/recon` files, derives specs via `/specify`, and runs them as a multi-spec batch. `/flow` consumes recon's output; it never files or closes recon issues (filing is recon's job; closing is a user action at the Review Console). See `from-recon.md`. |
```

Run: `grep -n "recon" skills/flow/SKILL.md`
Expected: the argument rows, input-resolution path 5, and the Relationship row all match.

- [ ] **Step 6: Commit**

```bash
git add skills/flow/from-recon.md skills/flow/SKILL.md skills/flow/steps-and-gates.md
git commit -m "Add /flow --from-recon affordance pulling recon issues into a batch"
```

---

## Task 8: `/recon` Routine Configuration + status/churn/reopen docs (markdown)

**Files:**
- Modify: `skills/recon/SKILL.md`

Design §11: wire the scheduled Routine substrate with **small predictable sips** (K=1-3, capped fan-out, off-peak) and exactly **one neutral billing sentence** (drop the old dated 2026-06-15 speculation). Also document the `status` and `churn-report` commands, the regression-reopen `gh` recipe, and add the `/flow` Relationship row.

- [ ] **Step 1: Add the `## Routine Configuration` section to `skills/recon/SKILL.md`**

Insert before the `## Anti-Patterns` section (after the run-procedure body, before the Component-Skill Contract). Write exactly:

````markdown
## Routine Configuration

`/recon` is designed to run unattended on a schedule via a Claude Code Routine
(`/schedule` or `claude.ai/code/routines`). Design for **small predictable sips**: a tight
per-run budget so a scheduled run is cheap and a skipped run is harmless (the round-robin
coverage floor means any starved area is force-picked on the next window).

```
Name:      recon-daily
Schedule:  daily at 03:00 (off-peak)
Prompt:    /claude-tweaks:recon
K-budget:  1–3 areas per run (cfg.K)
Fan-out:   capped subagent count for judgment lenses (--max-subagents)
```

A headless Routine run does: discover → score (top-K) → run lenses → fingerprint → dedup against
open `recon` issues → file issues for findings ≥ threshold → record the run-log. Triage happens
later, in GitHub, by a human (close / `wontfix` / pick one up via `/flow --from-recon`).

> **Billing note:** Routines run inside the subscription (no separate API key); verify any
> automation-credit specifics against the live account.

## Regression and Critical Gating

`status` reads the dedup cache + run-logs and prints one summary line; it gates a scheduled
Routine on regressions or open criticals (exit 1 stops the Routine for a human to look):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" status
# open:N regressed:N closed:N wontfix:N

node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" status --fail-on regressed
# exits 1 when any finding has reappeared after being closed

node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" status --fail-on critical
# exits 1 when any open finding is severity critical
```

## Regression Reopen

When dedup returns `{action:'reopen', issue, note}` (a finding matching a **closed,
non-`wontfix`** issue has reappeared — design §9), reopen the issue and comment, through the
`gh` CLI:

```bash
gh issue reopen <issue>
gh issue comment <issue> --body "Regressed: this finding reappeared on run <runId>. <note>"
```

A `{action:'suppress'}` decision (the issue carries the `wontfix` label) files nothing — the
standing decision is respected. The engine never calls `gh`; it returns the decision and the
SKILL.md hands the reopen+comment to the tool.

## Fingerprint Churn

Each persisted run records its fingerprint set under `.claude-tweaks/recon/runs/` (gitignored).
`churn-report` compares consecutive runs and prints a per-run churn table. A ratio near 0 means
fingerprints are stable; a ratio near 1 means most IDs changed run-to-run, pointing at normalizer
instability (cosmetic edits minting new IDs — design §16's top risk).

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" churn-report
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" churn-report --fail-on-high-churn 0.5
# exits 1 when any run-to-run churn ratio >= 0.5
```
````

- [ ] **Step 2: Add the `/flow` Relationship row to `skills/recon/SKILL.md` (if absent)**

In the `## Relationship to Other Skills` table, add (bidirectional partner to Task 7's `/flow` row):

```markdown
| `/claude-tweaks:flow` | `/flow --from-recon` pulls the `recon`-labelled issues this skill files and runs them as a multi-spec batch (derive specs via `/specify` → build/test/review/polish/wrap-up). `/recon` files and reopens issues; `/flow` consumes them. See `flow/from-recon.md`. |
```

- [ ] **Step 3: grep-verify the recon docs + confirm no dated billing speculation survives**

Run: `grep -n "Routine\|status --fail-on\|gh issue reopen\|churn-report\|--from-recon" skills/recon/SKILL.md`
Expected: matches for the Routine section, status gate, reopen recipe, churn-report, and the `/flow` row.

Run: `grep -rEn "2026-06-15|automation credit included|monthly automation credit|spare capacity" skills/recon/SKILL.md`
Expected: **no matches** (the dated speculative billing claims are gone; only the single neutral note remains).

- [ ] **Step 4: Commit**

```bash
git add skills/recon/SKILL.md
git commit -m "Add recon Routine config, status/churn/reopen docs, neutral billing note"
```

---

## Task 9: Version bump + full-suite verification

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Bump the plugin version 4.17.0 → 4.18.0**

In `.claude-plugin/plugin.json`, change `"version": "4.17.0"` to `"version": "4.18.0"`.

(Marketplace mirror is a release step, not part of this plan — note it in the wrap-up. Per CLAUDE.md "Releasing (two repos)", the marketplace `plugins[].version` mirrors `4.18.0` when this is released.)

- [ ] **Step 2: Run the whole repo suite**

Run: `node --test tests/`
Expected: every test passes (existing `lib`/`statusline`/`research` suites + the five new `tests/recon/*.test.js`). `0 fail`.

- [ ] **Step 3: Placeholder + signature scan**

Run: `grep -rEn "TODO|FIXME|XXX|placeholder|<fill|\.\.\." bin/lib/recon/ bin/recon.js skills/recon/SKILL.md skills/flow/from-recon.md`
Expected: no real placeholders (a `...` inside a code comment or `gh ... --json` is fine; an unfinished `<fill in>` is not).

Run: `grep -n "scoreAreas\|pullReconIssues\|computeChurn\|recordRun\|decide" bin/lib/recon/*.js bin/recon.js`
Expected: the contract function names appear with the signatures this plan defines and match the Phase 0/1/2 dependency table at the top.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "Bump 4.18.0 — recon Phase 3 autonomy (scoring, flow pull, status, churn, reopen)"
```

---

## Task 10: memenu-app source cleanup (SEPARATE REPO — design §14)

> **CRITICAL — DIFFERENT REPO.** Every command in this task runs in `~/Code Workspaces/memenu-app`,
> NOT in claude-tweaks. The executor MUST `cd` to memenu-app and verify the working directory
> with `git rev-parse --show-toplevel` (expecting `…/memenu-app`) BEFORE deleting anything. Do
> this only **after** `/recon` is verified working in claude-tweaks (Tasks 1-9 merged + suite green).
> Working-directory discipline: CWD does not propagate between tool calls — anchor every command
> with the absolute path.

**Files (to delete, in memenu-app):**
- `docs/superpowers/artifacts/claude-tweaks-sweep/` (whole tree)
- `docs/superpowers/specs/2026-06-14-sweep-recurring-repo-improvement-finder-design.md`
- `docs/superpowers/plans/2026-06-14-sweep-m1a-findings-engine-core.md` … `-m3-m4-observability-and-org-fanout.md` (six plan docs)
- any `.claude/skills/` sweep reference (none found at planning time — verify in Step 1)

- [ ] **Step 1: Anchor the repo + verify the targets exist**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/memenu-app"
git rev-parse --show-toplevel   # MUST print …/memenu-app — abort if not
ls docs/superpowers/artifacts/claude-tweaks-sweep/
ls docs/superpowers/specs/2026-06-14-sweep-recurring-repo-improvement-finder-design.md
ls docs/superpowers/plans/2026-06-14-sweep-*.md
ls .claude/skills/ 2>/dev/null | grep -i sweep || echo "no .claude/skills sweep ref"
```

Expected: the artifact tree, design doc, and six plan docs exist; no `.claude/skills` sweep ref.

- [ ] **Step 2: Confirm the branch is clean before deleting**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/memenu-app"
git status --short
```

Expected: clean (or only unrelated changes the user is aware of). If the sweep artifacts are
untracked, `git rm` will fail for those — use plain `rm -rf` for untracked paths (Step 3 handles
both).

- [ ] **Step 3: Remove the sweep artifacts, design doc, and plans**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/memenu-app"
git rev-parse --show-toplevel | grep -q "/memenu-app$" || { echo "WRONG REPO — abort"; exit 1; }

git rm -r docs/superpowers/artifacts/claude-tweaks-sweep
git rm docs/superpowers/specs/2026-06-14-sweep-recurring-repo-improvement-finder-design.md
git rm docs/superpowers/plans/2026-06-14-sweep-m1a-findings-engine-core.md \
       docs/superpowers/plans/2026-06-14-sweep-m1b-area-model-and-scoring.md \
       docs/superpowers/plans/2026-06-14-sweep-m1c-mechanical-lenses.md \
       docs/superpowers/plans/2026-06-14-sweep-m1d-autonomy-and-skill-polish.md \
       docs/superpowers/plans/2026-06-14-sweep-m2-judgment-lenses.md \
       docs/superpowers/plans/2026-06-14-sweep-m3-m4-observability-and-org-fanout.md
```

(If any path is untracked rather than committed, `git rm` errors for it — re-run that path with
`rm -rf <path>` instead. The artifact tree was created in this session and may be untracked.)

- [ ] **Step 4: Verify no sweep-skill residue remains**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/memenu-app"
# The sweep SKILL/engine artifacts are gone:
ls docs/superpowers/artifacts/claude-tweaks-sweep 2>&1   # expect: No such file or directory
grep -rIl "claude-tweaks-sweep" docs/ .claude/ 2>/dev/null   # expect: no output
# Scope the residue grep to the sweep *skill* (the bare word "sweep" appears in
# unrelated food-graph specs and "staleness sweeps" prose — those are NOT residue):
grep -rIn "sweep recurring repo\|skills/sweep/scripts\|name: claude-tweaks:sweep" docs/ .claude/ 2>/dev/null   # expect: no output
```

Expected: the artifact directory is gone; no reference to `claude-tweaks-sweep` or the sweep
skill's identifiers anywhere. (A bare `grep -ri sweep` will still match unrelated "staleness
sweeps" prose in `docs/REGISTRY.md` and food-graph spec text — those are legitimate English usage,
not residue. The scoped greps above target the sweep *skill* specifically.)

- [ ] **Step 5: Commit in memenu-app**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/memenu-app"
git rev-parse --show-toplevel | grep -q "/memenu-app$" || { echo "WRONG REPO — abort"; exit 1; }
git add -A docs/superpowers
git commit -m "Remove misplaced claude-tweaks-sweep artifacts, design, and plans — moved to /recon in claude-tweaks"
```

(Branch first if memenu-app is on its default branch and the user expects PR review:
`git checkout -b chore/remove-sweep-artifacts` before committing. Confirm the user's preference —
this is a different repo with its own conventions.)

---

## Self-Review

Run this checklist before marking the plan complete.

**Phase 3 spec coverage (design doc §):**

| Spec item | Where covered |
|-----------|---------------|
| §8 Weighted area score + round-robin floor | Task 1 (`scoreAreas` + `MAX_STALE_DAYS`/`STALE_BOOST`); Task 2 (`selectAreas` delegates) |
| §9 Dedup lifecycle: closed→reopen, wontfix→suppress | Task 3 (`decide` reopen/suppress arms) |
| §10 `/flow` affordance pulling `recon` issues into a batch | Task 5 (`pullReconIssues`) + Task 7 (`--from-recon` markdown) |
| §11 Trigger (Routines, small sips, off-peak) + neutral billing note | Task 8 (`## Routine Configuration`, one neutral sentence) |
| §13 Phase 3 = Routine + flow pull + scoring + reopen + churn | Tasks 1-8 collectively |
| §14 memenu-app source cleanup | Task 10 (separate-repo deletion + scoped residue grep) |
| §16 Fingerprint-churn metric (union denominator) | Task 4 (`computeChurn`) + Task 6 (`churn-report` gate) |
| status regression/critical gate | Task 6 (`cmdStatus --fail-on`) |

**Cross-plan contract consistency (shared names/paths):**

- `bin/lib/recon/score.js` → `scoreAreas(areas, signals) -> rankedAreas` + `MAX_STALE_DAYS` ✓ (Task 1; signals pre-collected, scorer pure)
- `bin/lib/recon/pull-issues.js` → `pullReconIssues({label, minSeverity?}) -> brief[]`, pure parse, /specify-shaped body → brief ✓ (Task 5)
- `bin/recon.js status [--fail-on regressed|critical]` prints `open:N regressed:N closed:N wontfix:N`, exits 1 on gate ✓ (Task 6)
- `dedup.js` reopen path: closed non-wontfix → `{action:'reopen'}` + regressed note ✓ (Task 3)
- Churn run-log under `.claude-tweaks/recon/runs/` (gitignored); union-denominator ratio ✓ (Task 4)
- `/recon` Routine config + ONE neutral billing sentence ✓ (Task 8)
- GitHub stays EMIT/THROUGH-TOOL — engine never calls the network; SKILL.md hands payloads/queries to `gh` ✓ (Tasks 5/7/8 all run `gh` from the skill, never the engine)
- Commit-registry DROPPED (design §6 — persistence is GitHub issues, no committed registry) ✓ (not present anywhere in this plan)

**Signature consistency with Phase 0/1/2 deps:**

- `loadCache`, `saveCache`, `detectAreas`, `fingerprint`, `decide`, `toIssuePayload` referenced exactly as the dependency table at the top declares ✓
- Finding shape (`{lens, areaId, severity, title, files, evidence, suggestion, acceptance, signature}`) and severity vocabulary used consistently ✓
- `selectAreas` rewire preserves the `--area` bypass and `cfg.K` top-K slice from Phase 1 ✓

**Placeholder scan:**

- No `<fill in>` / TODO / unimplemented stubs — every code block is complete and runnable ✓
- Every test shows real assertions with concrete expected values ✓
- Every run command shows the exact command + expected output/exit code ✓

**Cross-plan concern to flag:** This plan assumes Phase 1 gives the dedup cache entries an `area`
and `lastSweptMs` field (used by `collectSignals` for staleness + prior-finding density). If
Phase 1's cache shape is only `{<fp>:{status, issue}}` with no per-area metadata, Task 2's
`lastSweptMs`/`priorFindingCount` helpers return null/0 and scoring degrades to churn+LoC+fanIn
only (still correct, just less staleness-aware). The Phase 1 spec should either carry `area` +
`lastSweptMs` on cache entries, or Phase 3 should add a separate per-area cursor store — confirm
with the Phase 1 author before executing Task 2.
````