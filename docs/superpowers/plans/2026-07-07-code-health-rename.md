# Code-Health Rename Implementation Plan (Phase 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `/claude-tweaks:recon` to `/claude-tweaks:code-health` — engine, skill, tests, and every cross-reference in the plugin — with zero behavior change. This is Phase 1 of the 5-phase design in `docs/superpowers/specs/2026-07-07-code-health-rename-risk-triage-design.md`; later phases (schema unification, risk matrix, filing threshold, downstream efficiency, closing-keyword hook) are separate plans that build on this one.

**Architecture:** Pure mechanical rename via `git mv` + targeted string edits — no logic changes. `bin/recon.js` → `bin/code-health.js`, `bin/lib/recon/*` → `bin/lib/code-health/*`, `skills/recon/` → `skills/code-health/`. Fingerprint id prefix `recon-` → `codehealth-` (no internal hyphen, mirroring the `skillhealth-`→`harnesshealth-` precedent already shipped for the sibling `harness-health` rename). Everywhere else (labels, paths, log prefixes, skill name) uses the hyphenated `code-health`.

**Tech Stack:** Node 18+ (`node --test`), zero new dependencies, `git mv` for history-preserving moves.

## Global Constraints

- Every `git mv` preserves file history — never delete-and-recreate.
- Run `npm test` at the end of every task; it must be 100% green before moving to the next task.
- Historical docs (`docs/superpowers/specs/2026-06-14-recon-*`, `2026-06-15-recon-v2-*`, `2026-07-06-recon-signal-quality-*`) are never edited — they are records of past decisions, not live cross-references.
- No back-compat shim: this is a bare rename with no migration for already-deployed projects (locked decision #2 in the design doc) — do not add one.
- The internal function identifier `pullReconIssues` (in `bin/lib/recon/pull-issues.js`) is **not** renamed. It's an internal implementation detail shared with `bin/lib/issues/`, not called out in the design doc's cross-reference list, and renaming it would pull an unrelated shared module into this phase's scope. Only its file location (via the directory move) and its default `label` value (`'recon'` → `'code-health'`) change.
- Any occurrence of "recon" that is part of an unrelated English word (**reconnaissance**, **reconcile**, **reconciliation**) is never touched. This distinction matters — `skills/init/SKILL.md` alone has 6 such false-positive matches for a naive `recon` grep.

---

### Task 1: Rename the engine and lib modules (`bin/recon.js` → `bin/code-health.js`, `bin/lib/recon/` → `bin/lib/code-health/`)

**Files:**
- Move: `bin/recon.js` → `bin/code-health.js`
- Move: `bin/lib/recon/` → `bin/lib/code-health/` (all 10 lib files + `lenses/` + `tests/`)
- Modify: `bin/code-health.js`, `bin/lib/code-health/cache.js`, `bin/lib/code-health/fingerprint.js`, `bin/lib/code-health/issue-payload.js`, `bin/lib/code-health/pull-issues.js`, `bin/lib/code-health/scope.js`, `bin/lib/code-health/criteria.js`
- Modify (tests, path/prefix/label literals only): `bin/lib/code-health/tests/{fingerprint,issue-payload,area-type,cli-pull-issues,cli-validate-findings,cli-nextslice,churn-v2,status-v2}.test.js`, `bin/lib/issues/tests/ingest.test.js`

**Interfaces:**
- Produces: every module now lives under `bin/lib/code-health/*`, importable via `require('./lib/code-health/<name>')` from `bin/code-health.js`. All exports (`fingerprint`, `readCache`/`writeCache`/`readRuns`/`computeChurn`/`recordRun`/`readCursors`, `decide`/`SEVERITY_RANK`, `validateFindingV2`, `toIssuePayloadV2`, `getCriterion`, `classifyArea`, `listSlices`/`contentHash`/`selectSlice`, `pullReconIssues`) are unchanged in name and shape — only file locations and string literals change. Later phases (schema unification, risk matrix) build on this renamed-but-behaviorally-identical baseline.

- [ ] **Step 1: Move the directories with git mv**

```bash
git mv bin/recon.js bin/code-health.js
git mv bin/lib/recon bin/lib/code-health
```

- [ ] **Step 2: Replace `bin/code-health.js` in full**

Read the moved file, then replace its full contents with:

```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { fingerprint } = require('./lib/code-health/fingerprint');
const { readCache, writeCache, readRuns, computeChurn, recordRun, readCursors } = require('./lib/code-health/cache');
const { decide, SEVERITY_RANK } = require('./lib/code-health/dedup');
const { validateFindingV2 } = require('./lib/code-health/validate-finding');
const { toIssuePayloadV2 } = require('./lib/code-health/issue-payload');
const { getCriterion } = require('./lib/code-health/criteria');
const { classifyArea } = require('./lib/code-health/area-type');
const { listSlices, contentHash, selectSlice } = require('./lib/code-health/scope');

// Confidence ordering for floor comparison. Higher index = higher confidence.
const CONFIDENCE_ORDER = ['low', 'med', 'high'];

// Returns { pass: true } or { pass: false, reason: string }.
function applyConfidenceFloor(finding, criterionFloor) {
  if (!criterionFloor) return { pass: true };
  const findingIdx = CONFIDENCE_ORDER.indexOf(finding.confidence);
  const floorIdx = CONFIDENCE_ORDER.indexOf(criterionFloor);
  if (findingIdx >= floorIdx) return { pass: true };
  return {
    pass: false,
    reason: `confidence '${finding.confidence}' below floor '${criterionFloor}' for criterion '${finding.criterion}'`,
  };
}

function parseArgs(argv) {
  const args = { _: [], root: process.cwd(), dryRun: false, runId: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--area') args.area = argv[++i];
    else if (a === '--issues') args.issues = argv[++i];
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--slice') args.slice = argv[++i];
    else if (a === '--fail-on') args['fail-on'] = argv[++i];
    else if (a === '--fail-on-high-churn') args['fail-on-high-churn'] = argv[++i];
    else if (a === '--label') args.label = argv[++i];
    else if (a === '--min-severity') args['min-severity'] = argv[++i];
    else if (a === '--budget' || a === '--max-slices') args.budget = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

// --issues <file> is an array of { number, state, labels, fingerprint } objects
// (the shape gh issue list + fingerprint extraction produces).
// decide() expects a map { "<fingerprint>": { number, state, labels } }.
function loadIssueIndex(file) {
  if (!file) return {};
  let arr;
  try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  if (!Array.isArray(arr)) return {};
  const index = {};
  for (const issue of arr) {
    if (issue.fingerprint) {
      index[issue.fingerprint] = { number: issue.number, state: issue.state, labels: issue.labels || [] };
    }
  }
  return index;
}

function cmdStatus(args) {
  const cache = readCache(args.root);
  const findings = Object.values(cache);
  const counts = {
    open: findings.filter((f) => f.status === 'open').length,
    regressed: findings.filter((f) => f.status === 'regressed').length,
    closed: findings.filter((f) => f.status === 'closed').length,
    wontfix: findings.filter((f) => f.status === 'wontfix').length,
    remembered: findings.filter((f) => f.status === 'remembered').length,
    critical: findings.filter((f) => f.status === 'open' && f.severity === 'critical').length,
  };
  const line = `open:${counts.open} regressed:${counts.regressed} closed:${counts.closed} ` +
    `wontfix:${counts.wontfix} remembered:${counts.remembered}\n`;
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
    if (threshold != null && prior != null && c.ratio >= threshold) exceeded = true;
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

function cmdPullIssues(args) {
  const { pullReconIssues, SEVERITY_RANK } = require('./lib/code-health/pull-issues');
  if (!args.issues) {
    process.stderr.write('usage: code-health.js pull-issues --label <label> --issues <file> [--min-severity <sev>]\n');
    process.exit(2);
  }
  if (args['min-severity'] && !(args['min-severity'] in SEVERITY_RANK)) {
    process.stderr.write(
      `pull-issues: --min-severity "${args['min-severity']}" is not a recognized severity ` +
      `(must be one of ${Object.keys(SEVERITY_RANK).join('|')}) — an unrecognized value silently disables ` +
      'the severity filter instead of restricting output.\n',
    );
    process.exit(2);
  }
  let issuesJson;
  try {
    issuesJson = JSON.parse(fs.readFileSync(args.issues, 'utf8'));
  } catch {
    process.stderr.write(`pull-issues: could not read or parse issues file: ${args.issues}\n`);
    process.exit(1);
  }
  if (!Array.isArray(issuesJson)) {
    process.stderr.write('pull-issues: issues file must contain a JSON array\n');
    process.exit(1);
  }
  const briefs = pullReconIssues({
    label: args.label || 'code-health',
    minSeverity: args['min-severity'],
    issuesJson,
  });
  process.stdout.write(JSON.stringify(briefs, null, 2) + '\n');
}

function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1]; // positional after the subcommand name
  if (!findingsPath) {
    process.stderr.write(
      'usage: code-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] ' +
      '[--run-id <id>] [--slice <id>] [--min-severity <level>] [--dry-run]\n',
    );
    process.exit(2);
  }

  if (!args.dryRun && !args.slice) {
    process.stderr.write(
      'validate-findings: --slice is required for a real (non-dry-run) run — without it, ' +
      'the round-robin cursor for this slice never persists and rotation state silently drifts. ' +
      'Pass --dry-run to preview without it.\n',
    );
    process.exit(2);
  }

  if (args['min-severity'] && !(args['min-severity'] in SEVERITY_RANK)) {
    process.stderr.write(
      `validate-findings: --min-severity "${args['min-severity']}" is not a recognized severity ` +
      '(must be one of low|medium|high|critical) — an unrecognized value silently remembers every ' +
      'finding instead of filing it, including critical ones.\n',
    );
    process.exit(2);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`validate-findings: could not read or parse findings file: ${findingsPath}\n`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    process.stderr.write('validate-findings: findings file must contain a JSON array\n');
    process.exit(1);
  }

  // 1. Validate every finding; drop malformed ones with a logged reason.
  const survivors = [];
  for (const f of raw) {
    const v = validateFindingV2(f);
    if (!v.ok) {
      process.stderr.write(
        `[code-health] validate-findings: dropped finding "${(f && f.title) || '?'}" ` +
        `(criterion ${(f && f.criterion) || '?'}, area ${(f && f.areaId) || '?'}): ` +
        `${v.errors.join('; ')}\n`,
      );
      continue;
    }
    // 1a. Confidence-floor gate: drop findings below the criterion's floor.
    const crit = getCriterion(v.value.criterion);
    const floorResult = applyConfidenceFloor(v.value, crit && crit.confidenceFloor);
    if (!floorResult.pass) {
      process.stderr.write(`[code-health] validate-findings: dropped "${v.value.title}" — ${floorResult.reason}\n`);
      continue;
    }
    // 2. Fingerprint via v2 form.
    const id = fingerprint({ criterion: v.value.criterion, areaId: v.value.areaId, anchor: v.value.anchor });
    survivors.push({ ...v.value, id });
  }

  // 3. Dedup against the issue index and local cache.
  const cache = readCache(root);
  const issueIndex = loadIssueIndex(args.issues);
  const payloads = [];
  const seen = new Set();
  for (const finding of survivors) {
    if (seen.has(finding.id)) continue; // intra-run dedup
    seen.add(finding.id);

    const decision = decide(finding, issueIndex, cache, { threshold: args['min-severity'] || 'high' });
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file' || decision.action === 'reopen') {
      cache[finding.id] = decision.action === 'reopen'
        ? { status: 'regressed', issue: decision.issue || null, severity: finding.severity }
        : { status: 'open', issue: null, severity: finding.severity };
      payloads.push(toIssuePayloadV2(finding));
    } else if (decision.action === 'remember') {
      if (!cache[finding.id]) cache[finding.id] = { status: 'remembered', issue: null };
    }
  }

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

  // 5. Emit gh-ready payloads on stdout.
  process.stdout.write(JSON.stringify(payloads, null, 2) + '\n');
  process.stderr.write(
    `[code-health] validate-findings ${args.runId || '?'}: ` +
    `${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`,
  );
}

function cmdNextSlice(args) {
  const root = args.root || process.cwd();
  const budget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1;
  const { readCursors } = require('./lib/code-health/cache');
  let cursors = readCursors(root);
  const now = Date.now();

  if (budget === 1) {
    const slice = selectSlice(root, cursors, { now });
    process.stdout.write(JSON.stringify(slice, null, 2) + '\n');
    return;
  }

  // Budget > 1: iterate, marking each chosen slice as seen in-memory only.
  const chosen = [];
  for (let i = 0; i < budget; i++) {
    const slice = selectSlice(root, cursors, { now });
    if (!slice) break;
    chosen.push(slice);
    // Simulate post-judge state so the next iteration picks a different slice.
    cursors = {
      ...cursors,
      [slice.id]: { lastSweptMs: now, lastHash: contentHash(slice.path) },
    };
  }
  process.stdout.write(JSON.stringify(chosen, null, 2) + '\n');
}

function cmdClassify(args) {
  const root = args.root || process.cwd();
  const areaPath = args.area || '.';
  const absDir = path.resolve(root, areaPath);
  const { types } = classifyArea(absDir, root);
  process.stdout.write(JSON.stringify({ areaId: areaPath, types }, null, 2) + '\n');
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'status') return cmdStatus(args);
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'pull-issues') return cmdPullIssues(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'classify') return cmdClassify(args);
  if (cmd === 'next-slice') return cmdNextSlice(args);
  process.stderr.write(
    'usage: code-health.js <command> [options]\n' +
    'commands: validate-findings [--slice <id>], classify, next-slice, status, churn-report, pull-issues\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdValidateFindings, main, applyConfidenceFloor };
```

- [ ] **Step 3: Fix `bin/lib/code-health/cache.js`'s path literals**

```
old_string:
// Gitignored, rebuildable-from-issues dedup cache.
// Canonical path: <root>/.claude-tweaks/recon/cache.json (contract §cache.js)
// Shape: { "<fingerprint>": { status: 'open'|'wontfix'|'closed'|'remembered'|'regressed', issue: <number|null> } }

function cachePath(root) {
  return path.join(root, '.claude-tweaks', 'recon', 'cache.json');
}
```
```
new_string:
// Gitignored, rebuildable-from-issues dedup cache.
// Canonical path: <root>/.claude-tweaks/code-health/cache.json (contract §cache.js)
// Shape: { "<fingerprint>": { status: 'open'|'wontfix'|'closed'|'remembered'|'regressed', issue: <number|null> } }

function cachePath(root) {
  return path.join(root, '.claude-tweaks', 'code-health', 'cache.json');
}
```

```
old_string:
function runsDir(rootDir) {
  return path.join(rootDir, '.claude-tweaks', 'recon', 'runs');
}

function cursorsPath(rootDir) {
  return path.join(rootDir, '.claude-tweaks', 'recon', 'cursors.json');
}
```
```
new_string:
function runsDir(rootDir) {
  return path.join(rootDir, '.claude-tweaks', 'code-health', 'runs');
}

function cursorsPath(rootDir) {
  return path.join(rootDir, '.claude-tweaks', 'code-health', 'cursors.json');
}
```

- [ ] **Step 4: Fix `bin/lib/code-health/fingerprint.js`'s id prefix**

```
old_string:
  if (criterion !== undefined) {
    // v2: LLM-judge finding. Hash criterion + areaId + normalizeAnchor(anchor).
    const basis = JSON.stringify([criterion, areaId, normalizeAnchor(anchor || '')]);
    return 'recon-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
  }
  // v1: mechanical-lens finding. Keep the existing logic exactly.
  const normFile = String(file || '').replace(/:\d+(:\d+)?$/, '');
  const basis = JSON.stringify([lens, areaId, normFile, normalizeSignature(signature)]);
  return 'recon-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
```
```
new_string:
  if (criterion !== undefined) {
    // v2: LLM-judge finding. Hash criterion + areaId + normalizeAnchor(anchor).
    const basis = JSON.stringify([criterion, areaId, normalizeAnchor(anchor || '')]);
    return 'codehealth-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
  }
  // v1: mechanical-lens finding. Keep the existing logic exactly.
  const normFile = String(file || '').replace(/:\d+(:\d+)?$/, '');
  const basis = JSON.stringify([lens, areaId, normFile, normalizeSignature(signature)]);
  return 'codehealth-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
```

- [ ] **Step 5: Fix `bin/lib/code-health/issue-payload.js`'s marker/labels/footer (both V1 and V2)**

```
old_string:
function toIssuePayload(finding) {
  const marker = `<!-- recon-fingerprint: ${finding.id} -->`;
```
```
new_string:
function toIssuePayload(finding) {
  const marker = `<!-- code-health-fingerprint: ${finding.id} -->`;
```

```
old_string:
    '_Filed by `/recon`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.title,
    body,
    labels: ['recon', `recon:${finding.severity}`],
  };
}
```
```
new_string:
    '_Filed by `/code-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.title,
    body,
    labels: ['code-health', `code-health:${finding.severity}`],
  };
}
```

```
old_string:
function toIssuePayloadV2(finding) {
  const marker = `<!-- recon-fingerprint: ${finding.id} -->`;
```
```
new_string:
function toIssuePayloadV2(finding) {
  const marker = `<!-- code-health-fingerprint: ${finding.id} -->`;
```

```
old_string:
    '_Filed by `/recon`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.title,
    body,
    labels: ['recon', `recon:${finding.severity}`, `recon:${finding.criterion}`],
  };
}
```
```
new_string:
    '_Filed by `/code-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.title,
    body,
    labels: ['code-health', `code-health:${finding.severity}`, `code-health:${finding.criterion}`],
  };
}
```

- [ ] **Step 6: Fix `bin/lib/code-health/pull-issues.js`'s default label and comments**

```
old_string:
// bin/lib/recon/pull-issues.js
// Thin wrapper over bin/lib/issues/ingest.js — recon's briefs are the generic
// ingestion with the `recon` label default. Kept for the recon.js CLI and
// existing consumers; SEVERITY_RANK re-exported for compatibility.
'use strict';

const { issuesToBriefs, SEVERITY_RANK } = require('../issues/ingest');

// opts: { label = 'recon', minSeverity?, issuesJson }. Returns brief[]:
// [{ number, title, body, fingerprint, severity, shape }].
function pullReconIssues({ label = 'recon', minSeverity, issuesJson = [] } = {}) {
  return issuesToBriefs({ issuesJson, label, minSeverity });
}
```
```
new_string:
// bin/lib/code-health/pull-issues.js
// Thin wrapper over bin/lib/issues/ingest.js — code-health's briefs are the generic
// ingestion with the `code-health` label default. Kept for the code-health.js CLI and
// existing consumers; SEVERITY_RANK re-exported for compatibility.
'use strict';

const { issuesToBriefs, SEVERITY_RANK } = require('../issues/ingest');

// opts: { label = 'code-health', minSeverity?, issuesJson }. Returns brief[]:
// [{ number, title, body, fingerprint, severity, shape }].
function pullReconIssues({ label = 'code-health', minSeverity, issuesJson = [] } = {}) {
  return issuesToBriefs({ issuesJson, label, minSeverity });
}
```

(The `pullReconIssues` function name itself is deliberately not renamed — see Global Constraints.)

- [ ] **Step 7: Fix `bin/lib/code-health/scope.js`'s log prefix**

```
old_string:
    `[recon] scope: skipping unsupported workspace pattern "${pattern}" ` +
```
```
new_string:
    `[code-health] scope: skipping unsupported workspace pattern "${pattern}" ` +
```

- [ ] **Step 8: Fix `bin/lib/code-health/criteria.js`'s header comment (cosmetic)**

```
old_string:
// Universal criteria catalog for recon v2.
```
```
new_string:
// Universal criteria catalog for code-health v2.
```

- [ ] **Step 9: Fix the CLI-path and id-format assertions in the moved test files**

Edit `bin/lib/code-health/tests/fingerprint.test.js` — 4 occurrences of real generated-id format assertions (not opaque fixtures), across 3 distinct variable names. Lines 7 and 63 are byte-identical (`assert.match(id, ...)`), so use `replace_all: true` for that pair rather than a single-occurrence edit:

```
old_string (replace_all: true — matches lines 7 and 63):
  assert.match(id, /^recon-[0-9a-f]{8}$/);
```
```
new_string:
  assert.match(id, /^codehealth-[0-9a-f]{8}$/);
```

```
old_string (line 103):
  assert.match(v1, /^recon-[0-9a-f]{8}$/);
```
```
new_string:
  assert.match(v1, /^codehealth-[0-9a-f]{8}$/);
```

```
old_string (line 104):
  assert.match(v2, /^recon-[0-9a-f]{8}$/);
```
```
new_string:
  assert.match(v2, /^codehealth-[0-9a-f]{8}$/);
```

Edit `bin/lib/code-health/tests/issue-payload.test.js` — 3 occurrences of the marker-prefix assertion (the opaque `recon-abc12345`/`recon-ab12cd34` fixture ID values after the colon stay as-is; only the literal `recon-fingerprint` marker word changes, since that's boilerplate text the real code now emits differently):

```
old_string:
  assert.ok(body.includes('<!-- recon-fingerprint: recon-abc12345 -->'));
```
```
new_string:
  assert.ok(body.includes('<!-- code-health-fingerprint: recon-abc12345 -->'));
```

```
old_string:
  assert.ok(body.includes('<!-- recon-fingerprint: recon-ab12cd34 -->'), 'marker missing');
```
```
new_string:
  assert.ok(body.includes('<!-- code-health-fingerprint: recon-ab12cd34 -->'), 'marker missing');
```

```
old_string:
  assert.ok(p.body.includes('<!-- recon-fingerprint: recon-abc12345 -->'));
```
```
new_string:
  assert.ok(p.body.includes('<!-- code-health-fingerprint: recon-abc12345 -->'));
```

Also fix this file's label assertions (V1 stays `code-health`/`code-health:high` permanently — V2's label shape changes again in a later phase, so its assertion here just tracks the rename, not the future risk/effort reshaping):

```
old_string:
test('labels are recon + recon:<severity>', () => {
  assert.deepStrictEqual(toIssuePayload(FINDING).labels, ['recon', 'recon:high']);
```
```
new_string:
test('labels are code-health + code-health:<severity>', () => {
  assert.deepStrictEqual(toIssuePayload(FINDING).labels, ['code-health', 'code-health:high']);
```

Find the V2 label assertion (`test('v2 labels are recon + recon:<severity> + recon:<criterion>'...)` and its `assert.deepStrictEqual(toIssuePayloadV2(V2_FINDING).labels, [...])` body) and the final `assert.deepStrictEqual(p.labels, ['recon', 'recon:high']);` near the end of the file — read the file first to get their exact surrounding context, then apply the same `recon` → `code-health` substitution to each (label list becomes `['code-health', 'code-health:high', 'code-health:<criterion>']` and `['code-health', 'code-health:high']` respectively). Do not change the `id:` fixture fields (`'recon-abc12345'`, `'recon-ab12cd34'`) — those are opaque test data, not required to match the real prefix format.

Edit the CLI binary path constant — identical one-line fix, repeated verbatim in 6 files:

```
old_string:
const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js');
```
```
new_string:
const CLI = path.resolve(__dirname, '..', '..', '..', 'code-health.js');
```

Apply this exact edit to: `bin/lib/code-health/tests/area-type.test.js`, `bin/lib/code-health/tests/cli-pull-issues.test.js`, `bin/lib/code-health/tests/cli-validate-findings.test.js`, `bin/lib/code-health/tests/cli-nextslice.test.js`, `bin/lib/code-health/tests/churn-v2.test.js`, `bin/lib/code-health/tests/status-v2.test.js`.

Edit `bin/lib/code-health/tests/cli-validate-findings.test.js`'s direct require (separate from its CLI-path constant, already fixed above):

```
old_string:
const { applyConfidenceFloor } = require('../../../recon');
```
```
new_string:
const { applyConfidenceFloor } = require('../../../code-health');
```

- [ ] **Step 10: Fix `bin/lib/issues/tests/ingest.test.js`'s require path and default-label assertion**

This file lives outside `bin/lib/code-health/` (it tests the shared generic ingestion module) but imports `pullReconIssues` directly from the moved file, and asserts its default label:

```
old_string:
test('pullReconIssues still defaults to the recon label (wrapper behavior)', () => {
  const { pullReconIssues } = require('../../recon/pull-issues');
  const briefs = pullReconIssues({ issuesJson: [
```
```
new_string:
test('pullReconIssues still defaults to the code-health label (wrapper behavior)', () => {
  const { pullReconIssues } = require('../../code-health/pull-issues');
  const briefs = pullReconIssues({ issuesJson: [
```

Read the rest of this test's body (it continues past the line shown above) to find the assertion checking the default label value, and update the expected label string from `'recon'` to `'code-health'` there too.

- [ ] **Step 11: Run the full suite and confirm it's green under the new names**

```bash
npm test
```

Expected: every test that previously passed still passes, under the new file locations and names. If any failure references a path still containing `bin/lib/recon` or `bin/recon.js`, grep for it and fix — Step 9/10 covers every functionally-required test change identified during planning, but a missed occurrence will fail loudly (ENOENT or an assertion mismatch), not silently.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Rename recon's engine and lib modules to code-health"
```

---

### Task 2: Rename the skill directory (`skills/recon/` → `skills/code-health/`)

**Files:**
- Move: `skills/recon/` → `skills/code-health/` (`SKILL.md` + `routine-template.yml`)
- Modify: `skills/code-health/SKILL.md`, `skills/code-health/routine-template.yml`
- Modify: `bin/lib/code-health/tests/skill-md.test.js`

**Interfaces:**
- Consumes: Task 1's renamed `bin/code-health.js` CLI (referenced by path in `SKILL.md`'s workflow steps).
- Produces: the skill is now invokable as `/claude-tweaks:code-health`. `skill-md.test.js` continues to validate `skills/code-health/SKILL.md`'s structure and required content tokens.

- [ ] **Step 1: Move the directory with git mv**

```bash
git mv skills/recon skills/code-health
```

- [ ] **Step 2: Rename identifiers inside `skills/code-health/SKILL.md`**

Read the file, then apply these edits:

```
old_string:
name: claude-tweaks:recon
description: Use when you want a proactive, report-only sweep of a repository that surfaces improvement opportunities and files them as deduplicated GitHub issues. An LLM judges the code; deterministic helpers handle scope rotation, content-hash skip, fingerprinting, dedup, and issue filing. Never edits code. Keywords - recon, sweep, repo audit, technical debt, proactive, github issues, scheduled, routine.
```
```
new_string:
name: claude-tweaks:code-health
description: Use when you want a proactive, report-only sweep of a repository that surfaces improvement opportunities and files them as deduplicated GitHub issues. An LLM judges the code; deterministic helpers handle scope rotation, content-hash skip, fingerprinting, dedup, and issue filing. Never edits code. Keywords - code-health, sweep, repo audit, technical debt, proactive, github issues, scheduled, routine.
```

```
old_string:
# Recon — LLM-as-Code-Judge, Proactive Repo Improvement

A recurring watchman doing rounds: reads one directory slice, judges it against the universal criteria catalog, fingerprints each finding, dedups against open GitHub issues, and files the work worth doing. The LLM is the spine. Deterministic helpers handle fingerprint, dedup, and issue-payload projection. It never edits code.

```
              [ /claude-tweaks:recon ] <- utility (no fixed lifecycle position)
                           |  judges the slice; surfaces findings
                           v
findings -> validate-findings -> file GitHub issue (label: recon) -> /claude-tweaks:specify -> /claude-tweaks:build / /claude-tweaks:flow
         +- fuzzy / not-yet -> /claude-tweaks:capture (INBOX)
```
```
```
new_string:
# Code-Health — LLM-as-Code-Judge, Proactive Repo Improvement

A recurring watchman doing rounds: reads one directory slice, judges it against the universal criteria catalog, fingerprints each finding, dedups against open GitHub issues, and files the work worth doing. The LLM is the spine. Deterministic helpers handle fingerprint, dedup, and issue-payload projection. It never edits code.

```
              [ /claude-tweaks:code-health ] <- utility (no fixed lifecycle position)
                           |  judges the slice; surfaces findings
                           v
findings -> validate-findings -> file GitHub issue (label: code-health) -> /claude-tweaks:specify -> /claude-tweaks:build / /claude-tweaks:flow
         +- fuzzy / not-yet -> /claude-tweaks:capture (INBOX)
```
```

Read the remainder of the file and replace every other occurrence of the pattern `/recon` (as a slash-command reference), `` `recon` `` (as a bare label reference), `` `recon:{severity}` ``/`` `recon:{criterion}` `` (label patterns), `recon-fingerprint` (marker text), and `recon.js` (binary path in Step 1/2's `bash` blocks) with the `code-health` equivalent, following the same substitution used above. This includes (non-exhaustive — read the file to find every instance): the `gh issue list --label recon` command in Step 2, the `node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js"` invocations in Steps 1, 4, 8, the `gh issue create --label recon --label "recon:<severity>" --label "recon:<criterion>"` command in Step 9, the `<!-- recon-fingerprint: recon-XXXXXXXX -->` marker description in the Anchor rules section, the "Filed by `/recon`" footer reference, the Routine Configuration section's `skills/recon/routine-template.yml` path and `/claude-tweaks:recon` mentions, and the Relationship to Other Skills table's `/claude-tweaks:recon` row header (keep the row's *content* describing its relationships to `/specify`/`/capture`/`/tidy`/`/flow`/`/review`/`/deepen`/`/routine`/`/simplify` unchanged — only the skill name itself and any `recon`-labelled-issue mentions within those rows change).

Do **not** change `--min-severity` anywhere in this file yet — that flag is renamed to `--min-risk` in a later phase (schema unification), not this one.

- [ ] **Step 3: Rename identifiers inside `skills/code-health/routine-template.yml`**

```
old_string:
routine_name: recon-daily
prompt: "/claude-tweaks:recon"
```
```
new_string:
routine_name: code-health-daily
prompt: "/claude-tweaks:code-health"
```

```
old_string:
notes: >
  Recon's own next-slice rotation makes a skipped or repeated firing harmless — no
  --area flag is passed, so next-slice always picks the highest-priority slice
  automatically. See skills/recon/SKILL.md's "Routine Configuration" section for
  the --budget / token-cap tuning guidance this template doesn't need to restate.
```
```
new_string:
notes: >
  Code-health's own next-slice rotation makes a skipped or repeated firing harmless — no
  --area flag is passed, so next-slice always picks the highest-priority slice
  automatically. See skills/code-health/SKILL.md's "Routine Configuration" section for
  the --budget / token-cap tuning guidance this template doesn't need to restate.
```

- [ ] **Step 4: Fix `bin/lib/code-health/tests/skill-md.test.js`**

Read the file (it was moved as part of Task 1's directory move but still references the old skill name and path), then apply:

```
old_string:
const SKILL = path.resolve(__dirname, '..', '..', '..', '..', 'skills', 'recon', 'SKILL.md');
```
```
new_string:
const SKILL = path.resolve(__dirname, '..', '..', '..', '..', 'skills', 'code-health', 'SKILL.md');
```

```
old_string:
test('frontmatter declares the canonical name', () => {
  assert.match(read(), /name:\s*claude-tweaks:recon/);
});
```
```
new_string:
test('frontmatter declares the canonical name', () => {
  assert.match(read(), /name:\s*claude-tweaks:code-health/);
});
```

```
old_string:
test('invokes the CLI via ${CLAUDE_PLUGIN_ROOT}/bin/recon.js (not $SKILL_DIR)', () => {
  const body = read();
  assert.ok(body.includes('${CLAUDE_PLUGIN_ROOT}/bin/recon.js'));
```
```
new_string:
test('invokes the CLI via ${CLAUDE_PLUGIN_ROOT}/bin/code-health.js (not $SKILL_DIR)', () => {
  const body = read();
  assert.ok(body.includes('${CLAUDE_PLUGIN_ROOT}/bin/code-health.js'));
```

```
old_string:
const skillMdPath = path.join(__dirname, '..', '..', '..', '..', 'skills', 'recon', 'SKILL.md');
```
```
new_string:
const skillMdPath = path.join(__dirname, '..', '..', '..', '..', 'skills', 'code-health', 'SKILL.md');
```

```
old_string:
['validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', 'criteriaForArea', 'anchor',
 'recon-fingerprint', 'NearestNamedSymbol', '--min-severity',
 'Multi-slice runs', 'Mandatory readback check', 'relatedAnchors', 'Bundling rule',
].forEach((token) => {
```
```
new_string:
['validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', 'criteriaForArea', 'anchor',
 'code-health-fingerprint', 'NearestNamedSymbol', '--min-severity',
 'Multi-slice runs', 'Mandatory readback check', 'relatedAnchors', 'Bundling rule',
].forEach((token) => {
```

(`--min-severity` stays in this required-tokens list for this phase — it becomes `--min-risk` in the filing-threshold phase, which will update this same list.)

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: 100% green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Rename skills/recon to skills/code-health"
```

---

### Task 3: Cross-reference sweep across the rest of the plugin

**Files:**
- Move: `skills/flow/from-recon.md` → `skills/flow/from-code-health.md`
- Modify: `skills/flow/from-code-health.md`, `skills/flow/SKILL.md`, `skills/flow/worktree-merge.md`, `skills/flow/multispec-review-console.md`, `skills/specify/SKILL.md`, `skills/specify/spec-template.md`, `skills/_shared/issue-claims.md`, `skills/_shared/github-pr-scan.md`, `skills/tidy/SKILL.md`, `skills/tidy/scan-procedures.md`, `skills/wrap-up/SKILL.md`, `skills/routine/SKILL.md`, `skills/help/reference-card.md`, `README.md`, `package.json`

**Interfaces:**
- Consumes: Task 1/2's renamed `bin/code-health.js` and `skills/code-health/` paths.
- Produces: every cross-reference to the old `recon` name, `--from-recon` flag, and `recon`/`recon:*` labels across the plugin now reads `code-health`/`--from-code-health`/`code-health:*`. No behavior change — this task only touches documentation and one CLI flag alias name (`--from-recon` → `--from-code-health`), not the underlying issue-pulling logic itself (that logic already lives in the generic `bin/lib/issues/ingest.js`, untouched by this rename).

**Disambiguation rule (apply to every edit in this task):** only rename a `recon` occurrence that refers to *this tool* — the slash command, its GitHub label, its `--from-recon`/`--min-severity` flags, or a sentence describing what it files/does. Never touch an occurrence that is part of an unrelated English word: **reconnaissance**, **reconcile**, **reconciliation**. When in doubt, read the full sentence before editing.

- [ ] **Step 1: Move `from-recon.md` and rename its own content**

```bash
git mv skills/flow/from-recon.md skills/flow/from-code-health.md
```

Read `skills/flow/from-code-health.md` in full, then rename every tool-meaning occurrence of `recon` → `code-health` and `--from-recon` → `--from-code-health` throughout the file, including (grep-verified locations as of planning time — re-grep after editing to confirm none remain):
- Line 1 title: `# Flow — Issue-sourced batches (`--from-recon` / `--from-label` / `--from-issues`)` → `--from-code-health`
- Line 4: `` `--from-recon` (alias for `--from-label recon`) pulls the issues `/claude-tweaks:recon` filed; `` → `--from-code-health` alias for `--from-label code-health`, `/claude-tweaks:code-health`
- Line 15: the usage synopsis `/claude-tweaks:flow --from-recon ...`
- Lines 21–24: `--min-severity` floors on the `recon:<sev>` label text (keep `--min-severity` as the flag name — that rename is a later phase — but the *label* it floors on, `recon:<sev>`, becomes `code-health:<sev>`)
- Line 31: the `# --from-recon (alias)` comment
- Line 65: ``label` is `recon` (the `bin/recon.js pull-issues` CLI remains equivalent`` — note `bin/recon.js` here also needs `bin/code-health.js`
- Lines 73–81: the "Labels (recon-filed issues)" subsection header and its three bullet points (`recon`, `recon:<severity>`, `recon:<criterion>`)
- Line 115: the "All pulled recon issues are claimed by other..." error message text
- Lines 135–136: the `recon-issue:`/`recon-fingerprint:` frontmatter field names — **do not rename these two**; they are cross-file frontmatter contract keys shared with `/specify` and `/wrap-up`, consumed by their exact string names in multiple skills. Leave `recon-issue:`/`recon-fingerprint:` untouched everywhere in this task (they are out of scope for the rename — the design doc does not call for renaming this frontmatter contract, only the tool/label/flag names)
- Line 141: `--from-recon` mention
- Line 151: "the reconciliation puts" — this is the unrelated-word case (git merge reconciliation), leave untouched
- Line 216: the Anti-Patterns row mentioning `/flow --from-recon` and `/recon`

- [ ] **Step 2: Fix `skills/flow/SKILL.md`**

Read the file at the lines identified during planning (45–51, 72, 301, 307, 362, 365), then apply the `recon` → `code-health` and `--from-recon` → `--from-code-health` substitution to every tool-meaning occurrence: the `--from-recon` flag row and its description, the `--min-severity` row's `recon:<sev>` label mention (keep the flag name `--min-severity` itself unchanged this phase), the issue-batch mode selection line, the `from-recon.md` file reference (now `from-code-health.md`), and the Relationship to Other Skills table's `/claude-tweaks:recon` row (rename the row header and its `recon`-labelled mentions; keep the row's relationship description otherwise intact). Update the `See from-recon.md` cross-references to `See from-code-health.md` in all 4 places they appear (lines 46–49) plus line 307's routine-configuration reference.

- [ ] **Step 3: Fix `skills/flow/worktree-merge.md` and `skills/flow/multispec-review-console.md`**

In `worktree-merge.md` line 39 (`For from-recon runs (any spec on the branch has recon-issue:`): rename `from-recon` → `from-code-health`; leave `recon-issue:` frontmatter key unchanged (see Step 1's note).

In `multispec-review-console.md` lines 74 and 81 (`#### Issue closures (from-recon runs...`, `Omit this section entirely for runs without recon-issue: specs`): rename `from-recon` → `from-code-health`; leave `recon-issue:` unchanged.

- [ ] **Step 4: Fix `skills/specify/SKILL.md` and `skills/specify/spec-template.md`**

In `specify/SKILL.md` lines 58, 258, 440: rename tool-meaning mentions (`recon-filed issues`, `` `/claude-tweaks:recon` ``, `` `recon`-labelled ``, `` `/flow --from-recon` ``) to `code-health` equivalents. Leave the `recon-issue:`/`recon-fingerprint:` frontmatter field *names* unchanged (per Step 1's note) — only the prose describing them changes where it says "recon" meaning the tool.

In `spec-template.md`: this file's `recon-issue:`/`recon-fingerprint:` frontmatter field names (lines 13–14, 209, 214–215, 220–221) are the cross-file contract keys — **leave them unchanged**. The only rename in this file is prose that refers to the tool by name where it's not the field name itself (check line 221's description text for any such mention when reading the file).

- [ ] **Step 5: Fix `skills/_shared/issue-claims.md` and `skills/_shared/github-pr-scan.md`**

In `issue-claims.md` lines 184, 188: rename `from-recon.md` → `from-code-health.md` and `` `/recon` `` (tool name) → `` `/code-health` ``.

In `github-pr-scan.md` lines 49, 53, 67: rename `recon-labelled issues` → `code-health-labelled issues`, the `gh issue list --label recon` command → `--label code-health`, and the `/flow --from-recon` suggestion → `/flow --from-code-health`.

- [ ] **Step 6: Fix `skills/tidy/SKILL.md` and `skills/tidy/scan-procedures.md`**

In `tidy/SKILL.md` lines 75, 273, 280: rename the `gh issue list --label recon` command, the `` `/claude-tweaks:recon` `` row and its `` `recon`-labelled `` mentions, and the `recon issues` mention in the github-pr-scan reference line. Leave the adjacent `harness-health` mentions untouched (different tool, already correctly named).

In `scan-procedures.md` (Step 4.8a, "Recon severity-policy reconciliation" — note "reconciliation" here IS the unrelated word, leave that word alone, but the section title's "Recon" as the tool name still renames): rename lines 155, 162, 164, 166, 169, 170, 174, 175, 179 — the `recon` label mentions, `recon:low`/`recon:medium`/`recon:remembered` label literals, and the `` `/claude-tweaks:recon`'s `--min-severity` `` mention (keep `--min-severity` itself unchanged this phase). The section header itself (`### Step 4.8a: Recon severity-policy reconciliation (one-time)`) becomes `### Step 4.8a: Code-health severity-policy reconciliation (one-time)`.

**Important scope note for this step:** per this plan's Global Constraints, this Task 3 does not migrate already-filed `recon`-labelled issues in any project (that's the design's explicitly deferred non-goal). Renaming this section's *prose and commands* to say `code-health` is still correct — a fresh `/tidy` run against a project that adopts `code-health` from day one will never find `recon:low`/`recon:medium` issues to reconcile, and that's fine; this step is purely keeping the documentation's tool name consistent, not adding new migration behavior.

- [ ] **Step 7: Fix `skills/wrap-up/SKILL.md`**

Lines 315, 330, 401 reference `recon-issue:` frontmatter — leave the field name unchanged (Step 1's note); check each line when reading the file for any *prose* mention of the tool by name ("recon" meaning `/claude-tweaks:recon`) versus the frontmatter key, and rename only the former.

- [ ] **Step 8: Fix `skills/routine/SKILL.md`**

Lines 3, 22, 52, 172, 173: rename `recon` (tool name, "e.g. recon's", "routine_name: recon-daily" example) → `code-health`. Line 52's example `repo `claude-tweaks` + `routine_name: recon-daily` → `claude-tweaks-recon-daily`` becomes `routine_name: code-health-daily` → `claude-tweaks-code-health-daily`. Line 172's relationship row (`` `/claude-tweaks:recon` | Recon is this skill's first consumer — `skills/recon/routine-template.yml`... ``) renames the skill name, the file path (now `skills/code-health/routine-template.yml`), and the prose. Line 173's `Unlike recon's report-only template` → `Unlike code-health's report-only template`.

- [ ] **Step 9: Fix `skills/help/reference-card.md`**

Lines 35, 36, 42, 43: rename the `` `/claude-tweaks:recon` `` row (name, description, flags), the `--from-recon` flag mention in the `/claude-tweaks:flow` row, and the "e.g. recon's" mention in the `/claude-tweaks:routine` row.

- [ ] **Step 10: Fix `README.md`**

Lines 185, 195, 197: rename `recon-filed issues` → `code-health-filed issues`, the full `` **`/claude-tweaks:recon`** `` section heading and its body prose (tool name, `recon`-labelled mentions, `--from-recon`/`--from-label` examples, `Any issues — not just recon's —` phrase), and the "e.g. recon's" mention in the `/claude-tweaks:routine` section. Line 173's "reconnaissance" (visual-review description) is the unrelated word — leave untouched.

- [ ] **Step 11: Fix `package.json`'s test script**

```
old_string:
    "test": "node --test tests/ bin/lib/recon/tests/*.test.js bin/lib/issues/tests/*.test.js bin/lib/harness-health/tests/*.test.js"
```
```
new_string:
    "test": "node --test tests/ bin/lib/code-health/tests/*.test.js bin/lib/issues/tests/*.test.js bin/lib/harness-health/tests/*.test.js"
```

- [ ] **Step 12: Fix `CLAUDE.md`**

Grep-verified locations as of planning time (line 53's "reconnaissance" is the unrelated word — leave it untouched):

```
old_string:
| Dependencies | Superpowers plugin (`/superpowers:brainstorming`, `/superpowers:writing-plans`, `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, `/superpowers:using-git-worktrees`, `/superpowers:finishing-a-development-branch`, `/superpowers:dispatching-parallel-agents`, `/superpowers:systematic-debugging`), code-simplifier (built-in subagent), agent-browser (optional), git CLI (optional — required only for the statusline git segment), gh CLI (optional — required for /recon issue filing and the GitHub PR/issue scans in /tidy and /help) |
```
```
new_string:
| Dependencies | Superpowers plugin (`/superpowers:brainstorming`, `/superpowers:writing-plans`, `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, `/superpowers:using-git-worktrees`, `/superpowers:finishing-a-development-branch`, `/superpowers:dispatching-parallel-agents`, `/superpowers:systematic-debugging`), code-simplifier (built-in subagent), agent-browser (optional), git CLI (optional — required only for the statusline git segment), gh CLI (optional — required for /code-health issue filing and the GitHub PR/issue scans in /tidy and /help) |
```

```
old_string:
**Utility:** help, tidy, flow, browse, ledger, version, research, recon, routine, harness-health
```
```
new_string:
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health
```

```
old_string:
| tidy | scan-procedures.md | Per-step scan rules for Steps 1-5.5 (INBOX, deferred, specs, design-docs+briefs, plans, git worktrees, doc registry, sizing, cross-spec patterns, issue claims (Step 4.7), GitHub PRs + recon issues (Step 4.8 via _shared/github-pr-scan.md)) — inlined into each parallel agent's prompt at dispatch time |
```
```
new_string:
| tidy | scan-procedures.md | Per-step scan rules for Steps 1-5.5 (INBOX, deferred, specs, design-docs+briefs, plans, git worktrees, doc registry, sizing, cross-spec patterns, issue claims (Step 4.7), GitHub PRs + code-health issues (Step 4.8 via _shared/github-pr-scan.md)) — inlined into each parallel agent's prompt at dispatch time |
```

```
old_string:
| flow | manifesto.md, multi-spec.md, multispec-review-console.md, steps-and-gates.md, survey.md, validation.md, worktree-merge.md, failure-cards.md, from-recon.md | Pipeline Config Manifesto; multi-spec batching; consolidated multi-spec Review Console; Allowed Steps + Step Arguments + Gate Behavior + polish-phase decision tree (single canonical home); Creative Opportunities + Depth Opportunities survey ownership (end-of-run analysis-only surveys; Depth surfaces `/deepen` candidates without auto-refactoring); pre-flight validation; worktree-merge handoff; on-failure card templates (generic + polish-broke-verification) loaded only when a gate fails; issue-sourced batches (`--from-recon`/`--from-label`/`--from-issues`) → claim → /specify briefs → multi-spec batch procedure, freeform-issue translation (Step 2.5 claims each issue per _shared/issue-claims.md before spec derivation); close-via-merge mapping (issues close on the user's merge, never `gh issue close`); --from-milestone + --require-eligible selectors; dispatch routine template (agent:go/agent:eligible lifecycle) |
```
```
new_string:
| flow | manifesto.md, multi-spec.md, multispec-review-console.md, steps-and-gates.md, survey.md, validation.md, worktree-merge.md, failure-cards.md, from-code-health.md | Pipeline Config Manifesto; multi-spec batching; consolidated multi-spec Review Console; Allowed Steps + Step Arguments + Gate Behavior + polish-phase decision tree (single canonical home); Creative Opportunities + Depth Opportunities survey ownership (end-of-run analysis-only surveys; Depth surfaces `/deepen` candidates without auto-refactoring); pre-flight validation; worktree-merge handoff; on-failure card templates (generic + polish-broke-verification) loaded only when a gate fails; issue-sourced batches (`--from-code-health`/`--from-label`/`--from-issues`) → claim → /specify briefs → multi-spec batch procedure, freeform-issue translation (Step 2.5 claims each issue per _shared/issue-claims.md before spec derivation); close-via-merge mapping (issues close on the user's merge, never `gh issue close`); --from-milestone + --require-eligible selectors; dispatch routine template (agent:go/agent:eligible lifecycle) |
```

```
old_string:
npm test                            # Runs node --test over tests/ AND bin/lib/recon/tests/ AND bin/lib/issues/tests/ AND bin/lib/harness-health/tests/
node --test bin/lib/recon/tests/*.test.js   # Recon unit suite only
node bin/recon.js <cmd>             # Recon CLI: validate-findings, classify, next-slice, status, churn-report, pull-issues
```
```
new_string:
npm test                            # Runs node --test over tests/ AND bin/lib/code-health/tests/ AND bin/lib/issues/tests/ AND bin/lib/harness-health/tests/
node --test bin/lib/code-health/tests/*.test.js   # Code-health unit suite only
node bin/code-health.js <cmd>             # Code-health CLI: validate-findings, classify, next-slice, status, churn-report, pull-issues
```

- [ ] **Step 13: Verify no tool-meaning "recon" references remain**

```bash
grep -rn "recon" --include="*.md" --include="*.js" --include="*.json" --include="*.yml" \
  skills/ bin/ README.md package.json CLAUDE.md \
  | grep -v "reconnaissance\|reconcil" \
  | grep -v "docs/superpowers/specs/2026-06-14-recon\|docs/superpowers/specs/2026-06-15-recon\|docs/superpowers/specs/2026-07-06-recon"
```

Expected output: only lines containing `recon-issue:`/`recon-fingerprint:` (the deliberately-unrenamed frontmatter contract keys, per Step 1's note); the opaque test fixture strings from Task 1 Step 9 (`recon-abc12345`, `recon-ab12cd34`, etc. — deliberately left as arbitrary test data); and `skills/init/SKILL.md` lines using bare "recon" as shorthand for `/init`'s own unrelated "reconnaissance" phase name (e.g. "bootstrap + recon + CLAUDE.md", "Phase 2 (recon)") — these don't match the `reconnaissance|reconcil` filter above because they're abbreviated, but they don't refer to this tool either; leave them untouched. Anything else in this output is a missed rename — fix it before proceeding.

- [ ] **Step 14: Run the full suite**

```bash
npm test
```

Expected: 100% green.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "Update cross-references across the plugin for the code-health rename"
```

---

### Task 4: Version bump and final verification

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: Tasks 1–3's completed rename.
- Produces: a bumped plugin version reflecting this feature-shaped change, ready for the marketplace release step (out of scope for this plan — see CLAUDE.md's "Releasing (two repos)" section for that separate, manual step).

- [ ] **Step 1: Check for a concurrent version bump**

```bash
git log --oneline -5 .claude-plugin/plugin.json
```

If a bump landed after this plan's work began (e.g. from another concurrent session), renumber this task's bump to the next free version instead of the one below.

- [ ] **Step 2: Bump the version**

Read `.claude-plugin/plugin.json` (current version at planning time: `5.12.0`), then edit:

```
old_string:
  "version": "5.12.0",
```
```
new_string:
  "version": "5.13.0",
```

Also update the plugin description if it mentions the old name:

```
old_string:
  "description": "A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up. Includes an LLM-as-judge recurring recon sweep, browser automation, and QA pipeline.",
```
```
new_string:
  "description": "A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up. Includes an LLM-as-judge recurring code-health sweep, browser automation, and QA pipeline.",
```

- [ ] **Step 3: Final full-suite verification**

```bash
npm test
```

Expected: 100% green.

- [ ] **Step 4: Final cleanliness check**

```bash
git status -s
```

Expected: empty (everything committed in Tasks 1–3, plus this task's changes staged next).

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "Bump version to 5.13.0 — rename recon to code-health"
```

---

## What this plan does not cover

Per the design doc's phasing, the following are separate plans, written and executed after this one lands:
- Schema unification (`severity`/`likelihood`/`effort`/`confidence` on low/medium/high) and the deterministic risk matrix.
- The `--min-severity` → `--min-risk` filing-threshold rename and `--fail-on critical` → `--fail-on risk-high` CI-gate rename (this plan deliberately leaves `--min-severity` and `--fail-on critical` untouched everywhere, including in tests and docs, so this plan's diff is a pure rename with zero behavior change).
- Label restructuring (`code-health:risk-{tier}`, `code-health:effort-{tier}`) and the criteria-description label-hygiene fix.
- The four downstream efficiency levers (effort→model tier, risk-ordered batching, quick-wins selector, spec-sizing signal).
- The closing-keyword safety-net hook.
