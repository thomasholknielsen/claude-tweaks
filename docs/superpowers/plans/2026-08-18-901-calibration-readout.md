# Calibration Read-Out (#901) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the read-only calibration report that consumes `.claude-tweaks/wrap-up-outcomes.tsv`, archived `decisions.md` logs, and archived `events.jsonl` files, surfacing lever-facing signals via a `/claude-tweaks:tidy` report row.

**Architecture:** `plugin/bin/lib/calibration/` holds three defensive readers (TSV, decisions-line classifier, fail-open JSONL) plus one aggregator; `plugin/bin/calibration-report.js` is a thin CLI rendering markdown (or `--json`). One window governs all sections: the last N archive run-ids; TSV rows join by their `runId` column (verified 2026-08-18 against `plugin/bin/lib/wrap-up/engine-record.js:115`: `` `${date}\t${runId}\t${rowId}\t${gate}\t${count}\t${outcome}\n` ``, written by `appendTelemetry`). The registry-row universe is `ROW_IDS` from `plugin/bin/lib/wrap-up/registry.js:77` (verified: `Object.freeze(REGISTRY.map(r => r.id))`, exported line 83). Because an interactive console's terminal decision is not logged today (verified 2026-08-18: no such line exists in `review-console-interactive.md` or `multispec-review-console.md` — only per-item `AUTO ... auto-resolved {item}` lines exist, and only on the fully-`unattended` auto-resolve path), this plan also adds that one log line to both console files; the report's legend buckets earlier runs as `unlogged (pre-#901)`.

**Tech Stack:** Node built-ins only; `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-18T144500-spec-906-901-902-905/spec-901/work/901-spec.md`

## Global Constraints

- Read-only everywhere: the CLI writes nothing, ever. Exit 0 on success including empty-input cases; exit 2 on malformed invocation.
- Signals use "consider" phrasing only; every signal line is followed by a paste-ready command on its own line, no inline comments.
- Narrowing signal renders only when the row appears in ≥10 runs in the window; ceiling signal only over ≥10 console stops; suppressions named in the legend.
- Archive walking uses `fs`, never git-aware enumeration (run dirs are gitignored).
- Unrecognized `decisions.md` lines classify as `other`, never fatal (archives span plugin versions; #671 documents shipped-vs-schema drift).
- Reversibility field values in `_shared/auto-decision-log.md` entries are `high`/`med`/`low`, or `n/a` for a non-mutating decision (verified: line 39's existing `Reversibility: n/a (dispatch-time model selection...)` precedent) — the new terminal-decision log line uses `n/a`.
- Commits reference `refs #901`. One plain Bash command per invocation (worktree session constraint).

---

### Task 1: Calibration readers + aggregator (TDD)

**Files:**
- Create: `plugin/bin/lib/calibration/tsv-reader.js`, `plugin/bin/lib/calibration/decisions-classifier.js`, `plugin/bin/lib/calibration/events-reader.js`, `plugin/bin/lib/calibration/aggregate.js`
- Test: `tests/bin-lib/calibration/readers.test.js`, `tests/bin-lib/calibration/aggregate.test.js`

**Interfaces:**
- Consumes: `appendTelemetry` (`plugin/bin/lib/wrap-up/engine-record.js`) — used in a coupling test only.
- Produces:
  - `readTsv(path) -> {rows:[{date,runId,rowId,gate,count,outcome}], malformed:number} | null` (missing file → `null`)
  - `TERMINAL_DECISION_VALUES = ['approve-all','approve-all-merge','leave-pr-open','override','stop']` (exported constant — the closed vocabulary Task 3's new console log line writes and this classifier parses; cites `wrap-up/review-console-interactive.md`'s Step 3's four options plus `flow/multispec-review-console.md`'s mirrored set in a code comment)
  - `classifyDecisionLine(line) -> {kind:'AUTO'|'STAGED'|'KEPT-PROMPT'|'REFUSED'|'SCANNED'|'other', terminalDecision?: one of TERMINAL_DECISION_VALUES, autoResolved?:boolean, reversibility?:'high'|'med'|'low'|'n/a'}`
  - `readEventsKinds(path) -> {counts:{[type]:number}} | null` (fail-open — malformed lines skipped, never throws)
  - `aggregate({tsv, runs:[{runId, decisionLines:[string], events}], rowIds, windowN}) -> {window:{runIds:[string]}, perRow:{[rowId]:{appearances:number, findings:number}|'no runs in window'}, consoleDist:{[decision]:number, unlogged:number}, reversibilityDist:{high:number,med:number,low:number,'n/a':number}, frictionCounts:{[kind]:number}, refusedCount:number, suppressions:{narrowing:string[], ceiling:boolean}}`

- [ ] **Step 1: Write the failing tests**

`tests/bin-lib/calibration/readers.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readTsv } = require('../../../plugin/bin/lib/calibration/tsv-reader.js');
const { classifyDecisionLine, TERMINAL_DECISION_VALUES } = require('../../../plugin/bin/lib/calibration/decisions-classifier.js');
const { readEventsKinds } = require('../../../plugin/bin/lib/calibration/events-reader.js');
const { appendTelemetry } = require('../../../plugin/bin/lib/wrap-up/engine-record.js');

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'calib-')), name);
}

test('readTsv parses rows, counts malformed lines, and returns null for a missing file', () => {
  const p = tmpFile('outcomes.tsv');
  fs.writeFileSync(p, '2026-08-01\trun-a\trow1\tclosed\t0\tna\n2026-08-01\trun-a\trow2\tclosed\t2\tfindings\nnot-enough-columns\n');
  const result = readTsv(p);
  assert.strictEqual(result.rows.length, 2);
  assert.deepStrictEqual(result.rows[0], { date: '2026-08-01', runId: 'run-a', rowId: 'row1', gate: 'closed', count: '0', outcome: 'na' });
  assert.strictEqual(result.malformed, 1);
  assert.strictEqual(readTsv(tmpFile('missing.tsv')), null);
});

test('readTsv output is coupled to the real writer (fails loudly on column drift)', () => {
  const p = tmpFile('coupling.tsv');
  appendTelemetry(p, { now: new Date('2026-08-01T00:00:00Z'), runId: 'run-x', rowId: 'skills', gate: 'closed', findings: [], result: 'na' });
  const result = readTsv(p);
  assert.strictEqual(result.rows.length, 1);
  assert.strictEqual(result.rows[0].runId, 'run-x');
  assert.strictEqual(result.rows[0].rowId, 'skills');
});

test('classifyDecisionLine recognizes every entry kind and the terminal-decision line', () => {
  assert.strictEqual(classifyDecisionLine('- AUTO 14:32:14 — Step 1.5: scope-creep. Reversibility: high (commit abc1234).').kind, 'AUTO');
  assert.strictEqual(classifyDecisionLine('- STAGED 14:41:15 — Step 3 Routing: 2 findings staged.').kind, 'STAGED');
  assert.strictEqual(classifyDecisionLine('- KEPT-PROMPT 14:41:22 — Step 3 Routing: 1 finding.').kind, 'KEPT-PROMPT');
  assert.strictEqual(classifyDecisionLine('- REFUSED 09:00:00 — Queue write blocked, no Defer-reason.').kind, 'REFUSED');
  assert.strictEqual(classifyDecisionLine('- SCANNED 09:00:00 — Step 4.5 scan complete, 0 findings.').kind, 'SCANNED');
  assert.strictEqual(classifyDecisionLine('this is not a decision line at all').kind, 'other');

  const terminal = classifyDecisionLine('- AUTO 12:00:00 — Review Console: terminal decision approve-all. Reversibility: n/a.');
  assert.strictEqual(terminal.kind, 'AUTO');
  assert.strictEqual(terminal.terminalDecision, 'approve-all');
  assert.strictEqual(terminal.reversibility, 'n/a');

  for (const value of TERMINAL_DECISION_VALUES) {
    const line = `- AUTO 12:00:00 — Review Console: terminal decision ${value}. Reversibility: n/a.`;
    assert.strictEqual(classifyDecisionLine(line).terminalDecision, value, `must parse ${value}`);
  }
});

test('classifyDecisionLine tolerates unrecognized shapes without throwing', () => {
  assert.doesNotThrow(() => classifyDecisionLine(''));
  assert.doesNotThrow(() => classifyDecisionLine('- FUTURE-STATUS 00:00:00 — a shape from a later plugin version'));
  assert.strictEqual(classifyDecisionLine('- FUTURE-STATUS 00:00:00 — a shape from a later plugin version').kind, 'other');
});

test('readEventsKinds counts typed events and fails open on malformed lines', () => {
  const p = tmpFile('events.jsonl');
  fs.writeFileSync(p, '{"type":"gate-denial"}\n{"type":"wd-deny"}\nnot json\n{"type":"gate-denial"}\n');
  const result = readEventsKinds(p);
  assert.deepStrictEqual(result.counts, { 'gate-denial': 2, 'wd-deny': 1 });
  assert.strictEqual(readEventsKinds(tmpFile('missing.jsonl')), null);
});
```

`tests/bin-lib/calibration/aggregate.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { aggregate } = require('../../../plugin/bin/lib/calibration/aggregate.js');

function makeRuns(n, { withFindingsOnRow = null } = {}) {
  const runs = [];
  for (let i = 0; i < n; i++) {
    const runId = `2026-08-${String(i + 1).padStart(2, '0')}T000000-run`;
    const decisionLines = [
      '- AUTO 12:00:00 — Review Console: terminal decision approve-all. Reversibility: n/a.',
    ];
    runs.push({ runId, decisionLines, events: { counts: {} } });
  }
  return runs;
}

test('aggregate: a row absent from every run in the window is "no runs in window"', () => {
  const result = aggregate({ tsv: { rows: [] }, runs: makeRuns(3), rowIds: ['skills', 'docs'], windowN: 20 });
  assert.strictEqual(result.perRow.skills, 'no runs in window');
});

test('aggregate: narrowing signal suppressed under 10 appearances, present at >=10', () => {
  const rows = [];
  for (let i = 1; i <= 5; i++) rows.push({ date: '2026-08-01', runId: `run-${i}`, rowId: 'skills', gate: 'closed', count: '0', outcome: 'na' });
  const under = aggregate({ tsv: { rows }, runs: makeRuns(5), rowIds: ['skills'], windowN: 20 });
  assert.ok(under.suppressions.narrowing.includes('skills'));

  const rowsFull = [];
  for (let i = 1; i <= 10; i++) rowsFull.push({ date: '2026-08-01', runId: `run-${i}`, rowId: 'skills', gate: 'closed', count: '0', outcome: 'na' });
  const over = aggregate({ tsv: { rows: rowsFull }, runs: makeRuns(10), rowIds: ['skills'], windowN: 20 });
  assert.ok(!over.suppressions.narrowing.includes('skills'));
  assert.strictEqual(over.perRow.skills.appearances, 10);
  assert.strictEqual(over.perRow.skills.findings, 0);
});

test('aggregate: console distribution counts terminal decisions and buckets unlogged runs', () => {
  const runs = makeRuns(3);
  runs.push({ runId: '2026-08-04T000000-run', decisionLines: ['- AUTO 09:00:00 — Step 1.5: scope-creep.'], events: { counts: {} } });
  const result = aggregate({ tsv: { rows: [] }, runs, rowIds: [], windowN: 20 });
  assert.strictEqual(result.consoleDist['approve-all'], 3);
  assert.strictEqual(result.consoleDist.unlogged, 1);
});

test('aggregate: ceiling signal suppressed under 10 console stops', () => {
  const result = aggregate({ tsv: { rows: [] }, runs: makeRuns(9), rowIds: [], windowN: 20 });
  assert.strictEqual(result.suppressions.ceiling, true);
});

test('aggregate: window selects the last N runIds by name sort', () => {
  const runs = makeRuns(25);
  const result = aggregate({ tsv: { rows: [] }, runs, rowIds: [], windowN: 20 });
  assert.strictEqual(result.window.runIds.length, 20);
  assert.strictEqual(result.window.runIds[19], runs[24].runId);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/bin-lib/calibration/`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement the four modules**

`plugin/bin/lib/calibration/tsv-reader.js`:

```js
'use strict';
const fs = require('node:fs');

function readTsv(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = [];
  let malformed = 0;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length !== 6) { malformed++; continue; }
    const [date, runId, rowId, gate, count, outcome] = cols;
    rows.push({ date, runId, rowId, gate, count, outcome });
  }
  return { rows, malformed };
}

module.exports = { readTsv };
```

`plugin/bin/lib/calibration/decisions-classifier.js`:

```js
'use strict';

// Closed vocabulary the terminal-decision log line writes (Task 3 adds the
// writer in wrap-up/review-console-interactive.md and flow/multispec-review-console.md;
// this array is the single source both prose and this parser cite).
const TERMINAL_DECISION_VALUES = ['approve-all', 'approve-all-merge', 'leave-pr-open', 'override', 'stop'];

const KIND_RE = /^-\s+(AUTO|STAGED|KEPT-PROMPT|REFUSED|SCANNED)\b/;
const TERMINAL_RE = new RegExp(
  `Review Console: terminal decision (${TERMINAL_DECISION_VALUES.join('|')})\\.`,
);
const REVERSIBILITY_RE = /Reversibility:\s*(high|med|low|n\/a)/;

function classifyDecisionLine(line) {
  const kindMatch = KIND_RE.exec(line);
  if (!kindMatch) return { kind: 'other' };
  const result = { kind: kindMatch[1] };
  const terminalMatch = TERMINAL_RE.exec(line);
  if (terminalMatch) result.terminalDecision = terminalMatch[1];
  const reversibilityMatch = REVERSIBILITY_RE.exec(line);
  if (reversibilityMatch) result.reversibility = reversibilityMatch[1];
  if (/auto-resolved/.test(line)) result.autoResolved = true;
  return result;
}

module.exports = { classifyDecisionLine, TERMINAL_DECISION_VALUES };
```

`plugin/bin/lib/calibration/events-reader.js`:

```js
'use strict';
const fs = require('node:fs');

function readEventsKinds(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8');
  const counts = {};
  for (const line of text.split('\n')) {
    if (!line) continue;
    let parsed;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (!parsed || typeof parsed.type !== 'string') continue;
    counts[parsed.type] = (counts[parsed.type] || 0) + 1;
  }
  return { counts };
}

module.exports = { readEventsKinds };
```

`plugin/bin/lib/calibration/aggregate.js`:

```js
'use strict';
const { classifyDecisionLine } = require('./decisions-classifier.js');

const NARROWING_MIN_APPEARANCES = 10;
const CEILING_MIN_STOPS = 10;

function aggregate({ tsv, runs, rowIds, windowN }) {
  const sortedRuns = [...runs].sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0));
  const windowRuns = sortedRuns.slice(-windowN);
  const windowRunIds = new Set(windowRuns.map((r) => r.runId));

  const perRow = {};
  for (const rowId of rowIds) {
    const rowsInWindow = (tsv.rows || []).filter((r) => r.rowId === rowId && windowRunIds.has(r.runId));
    if (rowsInWindow.length === 0) { perRow[rowId] = 'no runs in window'; continue; }
    const findings = rowsInWindow.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
    perRow[rowId] = { appearances: rowsInWindow.length, findings };
  }

  const consoleDist = { unlogged: 0 };
  const reversibilityDist = { high: 0, med: 0, low: 0, 'n/a': 0 };
  const frictionCounts = {};
  let refusedCount = 0;
  let consoleStops = 0;

  for (const run of windowRuns) {
    let sawTerminal = false;
    for (const line of run.decisionLines || []) {
      const c = classifyDecisionLine(line);
      if (c.terminalDecision) {
        consoleDist[c.terminalDecision] = (consoleDist[c.terminalDecision] || 0) + 1;
        sawTerminal = true;
        consoleStops++;
      }
      if (c.reversibility) reversibilityDist[c.reversibility] = (reversibilityDist[c.reversibility] || 0) + 1;
      if (c.kind === 'REFUSED') refusedCount++;
    }
    if (!sawTerminal) consoleDist.unlogged++;
    for (const [kind, n] of Object.entries((run.events && run.events.counts) || {})) {
      frictionCounts[kind] = (frictionCounts[kind] || 0) + n;
    }
  }

  const narrowingSignal = rowIds.filter((id) => {
    const r = perRow[id];
    return r !== 'no runs in window' && r.appearances >= NARROWING_MIN_APPEARANCES && r.findings === 0;
  });
  const narrowingSuppressed = rowIds.filter((id) => {
    const r = perRow[id];
    return r !== 'no runs in window' && r.appearances < NARROWING_MIN_APPEARANCES;
  });
  const ceiling = consoleStops < CEILING_MIN_STOPS;

  return {
    window: { runIds: windowRuns.map((r) => r.runId) },
    perRow,
    consoleDist,
    reversibilityDist,
    frictionCounts,
    refusedCount,
    narrowingSignal,
    suppressions: { narrowing: narrowingSuppressed, ceiling },
  };
}

module.exports = { aggregate, NARROWING_MIN_APPEARANCES, CEILING_MIN_STOPS };
```

`suppressions.narrowing` is the appearances-below-threshold set (asserted by the aggregate test above: present for the 5-run case, absent for the 10-run case). `narrowingSignal` is the separate above-threshold-AND-zero-findings set — the one Task 2's CLI renders as the actual "consider narrowing" line.

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/bin-lib/calibration/`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/calibration/ tests/bin-lib/calibration/
git commit -m "Add calibration readers and aggregator (refs #901)"
```

### Task 2: CLI + report render (TDD)

**Files:**
- Create: `plugin/bin/calibration-report.js`
- Test: `tests/bin-lib/calibration/cli.test.js`

**Interfaces:**
- Consumes: Task 1's `readTsv`, `readEventsKinds`, `classifyDecisionLine`, `aggregate`; `resolve-policy.js --values autonomy` via `child_process.execFileSync`, wrapped so tests can inject a fake runner.
- Produces: `node bin/calibration-report.js [--runs N] [--json] [--root <path>]` — exit 0 on success (including empty-input), exit 2 on unknown flag.

- [ ] **Step 1: Failing CLI tests**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'calibration-report.js');

function makeFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calib-cli-'));
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude-tweaks', 'wrap-up-outcomes.tsv'),
    '2026-08-01\trun-1\tskills\tclosed\t0\tna\n2026-08-02\trun-2\tskills\tclosed\t0\tna\n',
  );
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive');
  for (const runId of ['run-1', 'run-2']) {
    const dir = path.join(archiveDir, runId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'decisions.md'), '- AUTO 12:00:00 — Review Console: terminal decision approve-all. Reversibility: n/a.\n');
    fs.writeFileSync(path.join(dir, 'events.jsonl'), '{"type":"gate-denial"}\n');
  }
  return root;
}

function run(args, root) {
  return execFileSync('node', [CLI, ...args, '--root', root], { encoding: 'utf8' });
}

test('CLI renders all five sections for a fixture tree', () => {
  const root = makeFixtureRoot();
  const out = run([], root);
  assert.match(out, /Per-registry-row finding rate|finding rate/i);
  assert.match(out, /approve-all/);
  assert.match(out, /Reversibility/i);
  assert.match(out, /gate-denial/);
  assert.match(out, /[Rr]efused/);
});

test('CLI --json round-trips the same numbers as the text report', () => {
  const root = makeFixtureRoot();
  const jsonOut = JSON.parse(run(['--json'], root));
  assert.strictEqual(jsonOut.consoleDist['approve-all'], 2);
});

test('missing TSV exits 0 with an explicit "no telemetry yet" line', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calib-empty-'));
  const out = run([], root);
  assert.match(out, /no telemetry yet/);
});

test('no archive dir is stated explicitly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calib-noarchive-'));
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'wrap-up-outcomes.tsv'), '');
  const out = run([], root);
  assert.match(out, /no archived runs/i);
});

test('unknown flag exits 2', () => {
  const root = makeFixtureRoot();
  assert.throws(() => execFileSync('node', [CLI, '--bogus', '--root', root], { encoding: 'utf8' }), /Command failed/);
});

test('narrowing signal renders with a paste-ready command on its own line at >=10 appearances', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calib-narrow-'));
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  const lines = [];
  for (let i = 1; i <= 10; i++) lines.push(`2026-08-${String(i).padStart(2, '0')}\trun-${i}\tskills\tclosed\t0\tna`);
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'wrap-up-outcomes.tsv'), lines.join('\n') + '\n');
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'pipelines', 'archive'), { recursive: true });
  const out = run(['--runs', '20'], root);
  assert.match(out, /consider narrowing/i);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test tests/bin-lib/calibration/cli.test.js`
Expected: FAIL — `plugin/bin/calibration-report.js` does not exist.

- [ ] **Step 3: Implement the CLI**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readTsv } = require('./lib/calibration/tsv-reader.js');
const { readEventsKinds } = require('./lib/calibration/events-reader.js');
const { aggregate } = require('./lib/calibration/aggregate.js');
const { ROW_IDS } = require('./lib/wrap-up/registry.js');

function parseArgs(argv) {
  const out = { runs: 20, json: false, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') out.runs = Number(argv[++i]);
    else if (a === '--json') out.json = true;
    else if (a === '--root') out.root = argv[++i];
    else { process.stderr.write(`unknown flag: ${a}\n`); process.exit(2); }
  }
  return out;
}

function loadRuns(root) {
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive');
  if (!fs.existsSync(archiveDir)) return null;
  const runIds = fs.readdirSync(archiveDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  return runIds.map((runId) => {
    const dir = path.join(archiveDir, runId);
    const decisionsPath = path.join(dir, 'decisions.md');
    const decisionLines = fs.existsSync(decisionsPath) ? fs.readFileSync(decisionsPath, 'utf8').split('\n').filter(Boolean) : [];
    const events = readEventsKinds(path.join(dir, 'events.jsonl')) || { counts: {} };
    return { runId, decisionLines, events };
  });
}

function resolveAutonomyCeiling() {
  try {
    return execFileSync('node', [path.join(__dirname, 'resolve-policy.js'), '--values', 'autonomy'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function renderText(result, ceiling) {
  const lines = [];
  lines.push('## Calibration read-out');
  lines.push('');
  lines.push(`Window: last ${result.window.runIds.length} archived run(s).`);
  lines.push('');
  lines.push('### Per-registry-row finding rate');
  for (const [rowId, v] of Object.entries(result.perRow)) {
    lines.push(v === 'no runs in window' ? `- ${rowId}: no runs in window` : `- ${rowId}: ${v.findings} findings across ${v.appearances} runs`);
  }
  lines.push('');
  lines.push('### Console terminal-decision distribution');
  for (const [k, v] of Object.entries(result.consoleDist)) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push('### Reversibility distribution');
  for (const [k, v] of Object.entries(result.reversibilityDist)) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push('### Friction events');
  if (Object.keys(result.frictionCounts).length === 0) lines.push('- none');
  for (const [k, v] of Object.entries(result.frictionCounts)) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push(`### Refused proposals: ${result.refusedCount}`);
  lines.push('');
  if (result.narrowingSignal && result.narrowingSignal.length) {
    for (const rowId of result.narrowingSignal) {
      lines.push(`Consider narrowing the gate for row "${rowId}" (0 findings, ${result.perRow[rowId].appearances} runs).`);
      lines.push(`node "${path.join(__dirname, 'calibration-report.js')}" --runs 50`);
    }
  }
  if (!result.suppressions.ceiling && result.consoleDist['approve-all'] > 0 &&
      (result.consoleDist['approve-all'] / Math.max(1, Object.entries(result.consoleDist).filter(([k]) => k !== 'unlogged').reduce((s, [, v]) => s + v, 0))) === 1 &&
      ceiling === 'supervised') {
    lines.push('Consider raising autonomy from supervised to trusted (ceiling read at report time — stops earlier in the window may predate the current setting).');
    lines.push('# edit .claude-tweaks/policy.yml: autonomy: trusted');
  }
  if (result.suppressions.narrowing.length) {
    lines.push(`(Suppressed narrowing signals — under 10 appearances: ${result.suppressions.narrowing.join(', ')})`);
  }
  if (result.suppressions.ceiling) {
    lines.push('(Ceiling signal suppressed — fewer than 10 console stops in this window.)');
  }
  return lines.join('\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tsvPath = path.join(args.root, '.claude-tweaks', 'wrap-up-outcomes.tsv');
  const tsv = readTsv(tsvPath);
  if (!tsv) {
    process.stdout.write(`no telemetry yet (${tsvPath} absent)\n`);
    process.exit(0);
  }
  const runs = loadRuns(args.root);
  if (!runs) {
    process.stdout.write('no archived runs found\n');
    process.exit(0);
  }
  const result = aggregate({ tsv, runs, rowIds: ROW_IDS, windowN: args.runs });
  const ceiling = resolveAutonomyCeiling();
  if (args.json) process.stdout.write(JSON.stringify(result) + '\n');
  else process.stdout.write(renderText(result, ceiling));
  process.exit(0);
}

main();
```

- [ ] **Step 4: Verify pass**

Run: `node --test tests/bin-lib/calibration/cli.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/calibration-report.js tests/bin-lib/calibration/cli.test.js
git commit -m "Add calibration-report CLI (refs #901)"
```

### Task 3: Prose wiring + drift guards

**Files:**
- Modify: `plugin/skills/wrap-up/review-console-interactive.md` (one sentence after the terminal `AskUserQuestion`: log `AUTO {time} — Review Console: terminal decision {approve-all|approve-all-merge|leave-pr-open|override|stop}. Reversibility: n/a.` to `decisions.md`)
- Modify: `plugin/skills/flow/multispec-review-console.md` (same one-line log at its consolidated terminal decision, citing the per-spec console's line format)
- Modify: `plugin/bin/lib/wrap-up/engine-record.js` (one comment beside `appendTelemetry` naming `plugin/bin/lib/calibration/tsv-reader.js` as the coupled reader)
- Modify: `plugin/skills/tidy/scan-procedures.md` (new report-only calibration row invoking the CLI, rendering its output verbatim; no action drill)
- Modify: `docs/skill-graph.md` (replace the "no consumer today" note in the `## wrap-up` section with the consumer's name and the tidy surface)
- Modify: `plugin/skills/_shared/auto-decision-log.md` (add `plugin/bin/lib/calibration/` to the consumer list)
- Test: extend `tests/bin-lib/calibration/cli.test.js` with a prose pin asserting the terminal-decision log-line format string appears verbatim (modulo the `{time}`/`{decision}` placeholders) in both console files, and matches `TERMINAL_DECISION_VALUES` from `decisions-classifier.js`

- [ ] **Step 1: Failing prose-format pin**

Append to `tests/bin-lib/calibration/cli.test.js`:

```js
const path2 = require('node:path');
const fs2 = require('node:fs');
const { TERMINAL_DECISION_VALUES } = require('../../../plugin/bin/lib/calibration/decisions-classifier.js');

test('both console files carry the terminal-decision log-line format, one per TERMINAL_DECISION_VALUES member', () => {
  const interactiveText = fs2.readFileSync(path2.join(__dirname, '..', '..', '..', 'plugin', 'skills', 'wrap-up', 'review-console-interactive.md'), 'utf8');
  const multispecText = fs2.readFileSync(path2.join(__dirname, '..', '..', '..', 'plugin', 'skills', 'flow', 'multispec-review-console.md'), 'utf8');
  assert.ok(interactiveText.includes('Review Console: terminal decision'), 'single-spec console must log the terminal decision');
  assert.ok(multispecText.includes('Review Console: terminal decision') || multispecText.includes('per the single-spec console'), 'multispec console must log or cite the terminal decision');
  for (const value of TERMINAL_DECISION_VALUES) {
    assert.ok(
      interactiveText.includes(value) || interactiveText.includes('approve-all|approve-all-merge|leave-pr-open|override|stop'),
      `interactive console prose must reference terminal-decision value "${value}"`,
    );
  }
});

test('skill-graph.md no longer states "no consumer today" for wrap-up telemetry', () => {
  const text = fs2.readFileSync(path2.join(__dirname, '..', '..', '..', 'docs', 'skill-graph.md'), 'utf8');
  assert.ok(!text.includes('no consumer today'), 'stale "no consumer today" note must be replaced');
});

test('auto-decision-log.md lists bin/lib/calibration/ as a consumer', () => {
  const text = fs2.readFileSync(path2.join(__dirname, '..', '..', '..', 'plugin', 'skills', '_shared', 'auto-decision-log.md'), 'utf8');
  assert.ok(text.includes('bin/lib/calibration'), 'auto-decision-log.md must list the calibration reader as a consumer');
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test tests/bin-lib/calibration/cli.test.js`
Expected: the three new tests FAIL.

- [ ] **Step 3: Make the six edits**

1. `review-console-interactive.md` — immediately after the terminal `AskUserQuestion` resolves (the point where Approve all / Override / Stop is chosen), add: "Log `AUTO {time} — Review Console: terminal decision {approve-all|approve-all-merge|leave-pr-open|override|stop}. Reversibility: n/a.` to `decisions.md`, naming whichever of the four options (three under `local-merge`) was chosen."
2. `multispec-review-console.md` — at its own consolidated terminal-decision point, add the equivalent line, citing the per-spec format: "Log the same `AUTO {time} — Review Console: terminal decision {…}. Reversibility: n/a.` line (per `wrap-up/review-console-interactive.md`'s format) to the parent run's `decisions.md`."
3. `plugin/bin/lib/wrap-up/engine-record.js` — one-line comment directly above `appendTelemetry`'s definition: `// Coupled reader: plugin/bin/lib/calibration/tsv-reader.js parses this exact column shape.`
4. `plugin/skills/tidy/scan-procedures.md` — add a new report-only row (placement: after Step 4.9, before Step 5, following the existing `[doctor]` step's shape as the nearest precedent for a report-only, non-mutating scan): "### Step 4.95: Calibration Read-Out. Invoke `node "${CLAUDE_PLUGIN_ROOT}/bin/calibration-report.js"` and render its output verbatim under **Yours ({N})** — report-only, no action drill, matching `[doctor]`'s surface-or-suppress posture. → Collect as `[calibration] {rendered report text}`." Add `[calibration]` to the Collection routing table's `[doctor]` row group (same "Yours (N), surface-or-suppress, never applied" semantics).
5. `docs/skill-graph.md` — in the `## wrap-up` section, find the line naming `.claude-tweaks/wrap-up-outcomes.tsv` as "a future data source ... no consumer today" and replace with: "consumed by `plugin/bin/calibration-report.js`, surfaced via `/claude-tweaks:tidy`'s calibration read-out row (#901)."
6. `plugin/skills/_shared/auto-decision-log.md` — add `plugin/bin/lib/calibration/` to whatever consumer/citation list already names other readers of this file's entry-kind schema.

- [ ] **Step 4: Verify pass**

Run: `node --test tests/bin-lib/calibration/`
Expected: PASS — every test in the directory.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/wrap-up/review-console-interactive.md plugin/skills/flow/multispec-review-console.md plugin/bin/lib/wrap-up/engine-record.js plugin/skills/tidy/scan-procedures.md docs/skill-graph.md plugin/skills/_shared/auto-decision-log.md tests/bin-lib/calibration/cli.test.js
git commit -m "Wire calibration consumer: console decision log line, tidy row, drift guards (refs #901)"
```

### Task 4: Full-suite verification

**Files:**
- Test: whole repo (no edits)

**Interfaces:**
- Consumes: Tasks 1-3 committed.
- Produces: green baseline for spec #902 (next in this run).

- [ ] **Step 1: Run the full suite**

Run: `npm test` (redirect to a log file and grep the `# pass` / `# fail` summary lines)
Expected: 0 failures. Also run `grep -n "no consumer today" docs/skill-graph.md` (AC4) — expect zero output.

- [ ] **Step 2: No commit** — nothing changed; a failure here means a byte-pinned suite elsewhere pins the old skill-graph.md text or console prose: fix that suite's expectation to the new wiring (never revert this spec's changes), then re-run.
