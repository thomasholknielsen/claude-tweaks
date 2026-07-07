# Code-Health Filing Threshold + Label Restructuring Implementation Plan (Phase 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Phase 2's `computeRisk` into the actual filing decision (`--min-severity` → `--min-risk`), rename the CI gate (`--fail-on critical` → `--fail-on risk-high`), and restructure GitHub labels so `code-health:risk-{tier}` and `code-health:effort-{tier}` replace the old severity label — with a label-hygiene fix so criterion labels get real descriptions instead of blank auto-vivified ones. This is Phase 3 of the 5-phase design in `docs/superpowers/specs/2026-07-07-code-health-rename-risk-triage-design.md`, building on Phase 1 (rename) and Phase 2 (schema + risk matrix), both merged to `main`.

**Architecture:** `computeRisk(severity, likelihood)` (Phase 2, currently unused) gets called once per surviving finding in `cmdValidateFindings`, right after fingerprinting; the resulting `risk` tier flows into `decide()` (which now ranks by risk, not severity) and into the cache entry and issue labels. A related regression this phase must also close: the generic issue-ingestion module (`bin/lib/issues/ingest.js`) parses severity out of GitHub labels via a hardcoded `code-health:<severity>` pattern — once filed issues carry `code-health:risk-<tier>` instead, that pattern would silently stop matching on every newly-filed issue, breaking `/flow`'s pulled-issue severity filter. The fix is a backward-compatible regex widening, not a flag rename — `/flow`'s own `--min-severity` flag and everything downstream of it are explicitly untouched.

**Tech Stack:** Node 18+ (`node --test`), zero new dependencies.

## Global Constraints

- Run `npm test` at the end of every task; it must be 100% green (the one known pre-existing flaky test, `tests/statusline.test.js`'s "render under 500ms," may intermittently fail under system load — re-run in isolation if it's the only failure).
- The v1 `toIssuePayload`/`validateFinding` path and `bin/lib/code-health/finding.js` remain untouched throughout this phase (dead code, out of scope, consistent with Phases 1-2).
- `bin/lib/issues/ingest.js`'s `issuesToBriefs` brief shape keeps the field name `severity` even when the value came from a `code-health:risk-<tier>` label — this phase does not rename that field or `/flow`'s `--min-severity` flag. Renaming that whole downstream consumer chain (ingest.js's brief shape, `/flow`'s flag name, `pull-issues`'s own `--min-severity` CLI flag, and every doc file describing them) is a materially separate, larger piece of work than fixing the regression this phase's label change causes — it is deliberately out of scope here. This phase only restores the existing behavior (the flag still filters correctly), it does not rename it.
- `code-health:{criterion}` labels are unchanged in shape — only their descriptions change (blank → real, sourced from a new `description` field on each `CRITERIA` catalog entry).

---

### Task 1: Wire `computeRisk` into the filing decision and the CI gate

**Files:**
- Modify: `bin/code-health.js`, `bin/lib/code-health/dedup.js`
- Modify (tests): `bin/lib/code-health/tests/dedup.test.js`, `bin/lib/code-health/tests/cli-validate-findings.test.js`, `bin/lib/code-health/tests/status-v2.test.js`

**Interfaces:**
- Consumes: `computeRisk` from `bin/lib/code-health/risk.js` (Phase 2, previously unused).
- Produces: `decide(finding, issueIndex, cache, opts)` now reads `finding.risk` (not `finding.severity`) and ranks via a new exported `RISK_RANK = { high: 0, medium: 1, low: 2 }` (replacing `SEVERITY_RANK`). `cmdValidateFindings` computes `risk` for every surviving finding before dedup and stores it in the cache entry alongside `severity`. The `--min-severity` CLI flag is renamed `--min-risk` (default `high`, unchanged philosophy). `cmdStatus` gains a `riskHigh` count and `--fail-on risk-high` (replacing `--fail-on critical`). Task 2 (label restructuring) and Task 5 (SKILL.md docs) both depend on this task's renamed flag and computed field being in place.

- [ ] **Step 1: Write the failing tests for the risk-ranked `decide()`**

Replace `bin/lib/code-health/tests/dedup.test.js` in full (the `critical` test case is removed — risk has no `critical` tier; the helper and every assertion switch from `severity` to `risk`):

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { decide, RISK_RANK } = require('../dedup');

// issueIndex shape (contract): { "<fingerprint>": { number, state, labels } }
const F = (id, risk = 'high') => ({ id, risk });

test('RISK_RANK orders high as most urgent', () => {
  assert.ok(RISK_RANK.high < RISK_RANK.medium);
  assert.ok(RISK_RANK.medium < RISK_RANK.low);
});

test('open issue with same fingerprint -> skip', () => {
  const index = { 'recon-aaa': { number: 7, state: 'open', labels: ['recon'] } };
  assert.deepStrictEqual(decide(F('recon-aaa'), index, {}), { action: 'skip', issue: 7 });
});

test('closed non-wontfix issue with same fingerprint -> reopen (regressed)', () => {
  const index = { 'recon-bbb': { number: 8, state: 'closed', labels: ['recon'] } };
  const result = decide(F('recon-bbb'), index, {});
  assert.strictEqual(result.action, 'reopen');
  assert.strictEqual(result.issue, 8);
  assert.ok(typeof result.note === 'string' && result.note.length > 0, 'note should be a non-empty string');
});

test('wontfix-labelled issue -> suppress (standing decision)', () => {
  const index = { 'recon-ccc': { number: 9, state: 'open', labels: ['recon', 'wontfix'] } };
  assert.deepStrictEqual(decide(F('recon-ccc'), index, {}), { action: 'suppress', issue: 9 });
});

test('wontfix in cache, no issue -> suppress', () => {
  assert.deepStrictEqual(decide(F('recon-ddd'), {}, { 'recon-ddd': { status: 'wontfix', issue: null } }),
    { action: 'suppress' });
});

test('new finding at/above threshold -> file', () => {
  assert.deepStrictEqual(decide(F('recon-eee', 'high'), {}, {}), { action: 'file' });
});

test('new finding below threshold -> remember', () => {
  assert.deepStrictEqual(decide(F('recon-fff', 'medium'), {}, {}), { action: 'remember' });
  assert.deepStrictEqual(decide(F('recon-fff', 'low'), {}, {}), { action: 'remember' });
});

test('threshold is overridable', () => {
  assert.deepStrictEqual(decide(F('recon-ggg', 'medium'), {}, {}, { threshold: 'medium' }), { action: 'file' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test bin/lib/code-health/tests/dedup.test.js
```

Expected: FAIL — `RISK_RANK` is not exported yet, `decide()` still reads `finding.severity`.

- [ ] **Step 3: Implement the risk-ranked `decide()` in `dedup.js`**

Replace `bin/lib/code-health/dedup.js` in full:

```js
// Risk rank: lower number = more urgent (highest priority to file).
const RISK_RANK = { high: 0, medium: 1, low: 2 };

// Decide what to do with a freshly-fingerprinted finding given the current issue
// index and local cache. Pure — no I/O, no network.
//
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built from gh issue list output (the skill builds it; engine never calls network).
//   state ∈ 'open' | 'closed'
//
// Decision logic (contract §dedup.js):
//   open issue match         -> skip      (no flood)
//   wontfix-labelled issue   -> suppress  (standing decision)
//   closed non-wontfix match -> reopen    (regressed)
//   wontfix in cache         -> suppress
//   new >= threshold         -> file
//   new <  threshold         -> remember
//
// Filing gates on the computed `risk` tier (severity x likelihood — see
// bin/lib/code-health/risk.js#computeRisk), not raw severity.
function decide(finding, issueIndex, cache, opts) {
  const threshold = (opts && opts.threshold) || 'high';
  // Support both finding.id (fingerprint hash from Phase 1) and finding.fingerprint (direct string).
  const fp = finding.fingerprint || finding.id;
  const match = issueIndex && fp && issueIndex[fp];
  if (match) {
    if ((match.labels || []).includes('wontfix')) return { action: 'suppress', issue: match.number };
    if (match.state === 'closed') {
      return {
        action: 'reopen',
        issue: match.number,
        note: 'regressed — this finding was previously closed and has reappeared',
      };
    }
    return { action: 'skip', issue: match.number };
  }
  const cached = cache && fp && cache[fp];
  if (cached && cached.status === 'wontfix') return { action: 'suppress' };
  const rank = RISK_RANK[finding.risk];
  const thresholdRank = RISK_RANK[threshold];
  if (rank !== undefined && thresholdRank !== undefined && rank <= thresholdRank) return { action: 'file' };
  return { action: 'remember' };
}

module.exports = { decide, RISK_RANK };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test bin/lib/code-health/tests/dedup.test.js
```

Expected: PASS, all 8 tests.

- [ ] **Step 5: Wire risk computation and the renamed flag into `bin/code-health.js`**

Add the import:

```
old_string:
const { fingerprint } = require('./lib/code-health/fingerprint');
const { readCache, writeCache, readRuns, computeChurn, recordRun, readCursors } = require('./lib/code-health/cache');
const { decide, SEVERITY_RANK } = require('./lib/code-health/dedup');
```
```
new_string:
const { fingerprint } = require('./lib/code-health/fingerprint');
const { readCache, writeCache, readRuns, computeChurn, recordRun, readCursors } = require('./lib/code-health/cache');
const { decide, RISK_RANK } = require('./lib/code-health/dedup');
const { computeRisk } = require('./lib/code-health/risk');
```

Update `parseArgs` to accept `--min-risk` instead of `--min-severity`:

```
old_string:
    else if (a === '--min-severity') args['min-severity'] = argv[++i];
```
```
new_string:
    else if (a === '--min-risk') args['min-risk'] = argv[++i];
```

Update the usage message and the unrecognized-value guard in `cmdValidateFindings`:

```
old_string:
  if (!findingsPath) {
    process.stderr.write(
      'usage: code-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] ' +
      '[--run-id <id>] [--slice <id>] [--min-severity <level>] [--dry-run]\n',
    );
    process.exit(2);
  }
```
```
new_string:
  if (!findingsPath) {
    process.stderr.write(
      'usage: code-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] ' +
      '[--run-id <id>] [--slice <id>] [--min-risk <level>] [--dry-run]\n',
    );
    process.exit(2);
  }
```

```
old_string:
  if (args['min-severity'] && !(args['min-severity'] in SEVERITY_RANK)) {
    process.stderr.write(
      `validate-findings: --min-severity "${args['min-severity']}" is not a recognized severity ` +
      '(must be one of low|medium|high|critical) — an unrecognized value silently remembers every ' +
      'finding instead of filing it, including critical ones.\n',
    );
    process.exit(2);
  }
```
```
new_string:
  if (args['min-risk'] && !(args['min-risk'] in RISK_RANK)) {
    process.stderr.write(
      `validate-findings: --min-risk "${args['min-risk']}" is not a recognized risk tier ` +
      '(must be one of low|medium|high) — an unrecognized value silently remembers every ' +
      'finding instead of filing it, including high-risk ones.\n',
    );
    process.exit(2);
  }
```

Compute risk right after fingerprinting, and store it on the survivor:

```
old_string:
    // 2. Fingerprint via v2 form.
    const id = fingerprint({ criterion: v.value.criterion, areaId: v.value.areaId, anchor: v.value.anchor });
    survivors.push({ ...v.value, id });
```
```
new_string:
    // 2. Fingerprint via v2 form, then compute risk (severity x likelihood — deterministic, not judged).
    const id = fingerprint({ criterion: v.value.criterion, areaId: v.value.areaId, anchor: v.value.anchor });
    const risk = computeRisk(v.value.severity, v.value.likelihood);
    survivors.push({ ...v.value, id, risk });
```

Update the `decide()` call site and the cache-write shape to carry `risk` alongside `severity`:

```
old_string:
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
```
```
new_string:
    const decision = decide(finding, issueIndex, cache, { threshold: args['min-risk'] || 'high' });
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file' || decision.action === 'reopen') {
      cache[finding.id] = decision.action === 'reopen'
        ? { status: 'regressed', issue: decision.issue || null, severity: finding.severity, risk: finding.risk }
        : { status: 'open', issue: null, severity: finding.severity, risk: finding.risk };
      payloads.push(toIssuePayloadV2(finding));
    } else if (decision.action === 'remember') {
      if (!cache[finding.id]) cache[finding.id] = { status: 'remembered', issue: null, severity: finding.severity, risk: finding.risk };
    }
```

- [ ] **Step 6: Rename the CI gate in `cmdStatus`**

```
old_string:
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
```
```
new_string:
  const counts = {
    open: findings.filter((f) => f.status === 'open').length,
    regressed: findings.filter((f) => f.status === 'regressed').length,
    closed: findings.filter((f) => f.status === 'closed').length,
    wontfix: findings.filter((f) => f.status === 'wontfix').length,
    remembered: findings.filter((f) => f.status === 'remembered').length,
    riskHigh: findings.filter((f) => f.status === 'open' && f.risk === 'high').length,
  };
  const line = `open:${counts.open} regressed:${counts.regressed} closed:${counts.closed} ` +
    `wontfix:${counts.wontfix} remembered:${counts.remembered}\n`;
  const failOn = args['fail-on'];
  if (failOn === 'regressed' && counts.regressed > 0) {
    process.stdout.write(`FAIL: ${counts.regressed} regressed finding(s)\n` + line);
    process.exit(1);
  }
  if (failOn === 'risk-high' && counts.riskHigh > 0) {
    process.stdout.write(`FAIL: ${counts.riskHigh} open risk-high finding(s)\n` + line);
    process.exit(1);
  }
  process.stdout.write(line);
```

- [ ] **Step 7: Fix `cli-validate-findings.test.js`'s `--min-severity` tests**

Rename the flag in every call site and update the "unrecognized value" error-message check:

```
old_string:
test('validate-findings: --min-severity medium lowers the bar and files a medium finding', () => {
  const root = tmp();
  const f = validFinding({ severity: 'medium' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(
    root, findingsFile,
    ['--slice', 'src/api', '--run-id', 'r-min-med', '--min-severity', 'medium'],
  );
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'medium finding must file when --min-severity medium is passed');
});
```
```
new_string:
test('validate-findings: --min-risk medium lowers the bar and files a medium-risk finding', () => {
  const root = tmp();
  const f = validFinding({ severity: 'medium', likelihood: 'medium' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(
    root, findingsFile,
    ['--slice', 'src/api', '--run-id', 'r-min-med', '--min-risk', 'medium'],
  );
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'medium-risk finding must file when --min-risk medium is passed');
});
```

```
old_string:
test('validate-findings: exits 2 when --min-severity is an unrecognized value', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));
  const result = runValidateFindings(
    root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-bad-sev', '--min-severity', 'hgih'],
  );
  assert.strictEqual(result.status, 2, `expected exit 2, got ${result.status}. stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes('--min-severity'), `expected --min-severity mentioned in stderr: ${result.stderr}`);
});

test('validate-findings: a recognized --min-severity value still works normally', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));
  const result = runValidateFindings(
    root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-good-sev', '--min-severity', 'low'],
  );
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'high-severity finding must still file with a valid --min-severity value');
});
```
```
new_string:
test('validate-findings: exits 2 when --min-risk is an unrecognized value', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));
  const result = runValidateFindings(
    root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-bad-sev', '--min-risk', 'hgih'],
  );
  assert.strictEqual(result.status, 2, `expected exit 2, got ${result.status}. stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes('--min-risk'), `expected --min-risk mentioned in stderr: ${result.stderr}`);
});

test('validate-findings: a recognized --min-risk value still works normally', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));
  const result = runValidateFindings(
    root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-good-sev', '--min-risk', 'low'],
  );
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'high-risk finding must still file with a valid --min-risk value');
});
```

Read the remainder of this file for any other `--min-severity` occurrence not listed above (the brief's grep in a later verification step will also catch this) and apply the same `--min-severity`→`--min-risk` rename; the `validFinding()` helper already defaults `severity: 'medium'` — since `computeRisk('medium', 'medium')` computes to `risk: 'medium'`, and `computeRisk('high', 'medium')` computes to `'high'`, the existing severity-only test fixtures (which already set `likelihood: 'medium'` as their Phase-2-added default) continue to produce sensible risk tiers without needing every test's `severity` override rethought — only the tests that explicitly asserted on the OLD flag name need the mechanical rename above.

- [ ] **Step 8: Fix `status-v2.test.js`'s cache-writing helper and the CI-gate test**

```
old_string:
function writeV2Cache(root, entries) {
  // entries: [{ fp, status, severity }]
  const cache = {};
  for (const e of entries) cache[e.fp] = { status: e.status, severity: e.severity, issue: null };
  const p = path.join(root, '.claude-tweaks', 'code-health', 'cache.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}
```
```
new_string:
function writeV2Cache(root, entries) {
  // entries: [{ fp, status, severity, risk }]
  const cache = {};
  for (const e of entries) cache[e.fp] = { status: e.status, severity: e.severity, risk: e.risk, issue: null };
  const p = path.join(root, '.claude-tweaks', 'code-health', 'cache.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}
```

```
old_string:
test('status --fail-on critical exits 1 when open critical entries exist in v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'critical' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'critical', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.ok(result.stdout.includes('FAIL'));
});
```
```
new_string:
test('status --fail-on risk-high exits 1 when open risk-high entries exist in v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'high', risk: 'high' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'risk-high', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.ok(result.stdout.includes('FAIL'));
});
```

The other `writeV2Cache` call sites in this file (for `status prints...`, `remembered count`, `--fail-on regressed` tests) don't pass a `risk` field — that's fine, `risk: undefined` in a cache entry that isn't being tested for `riskHigh` has no effect on those assertions.

- [ ] **Step 9: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Wire computeRisk into the filing decision; rename --min-severity to --min-risk and --fail-on critical to --fail-on risk-high"
```

---

### Task 2: Restructure GitHub labels in `toIssuePayloadV2`

**Files:**
- Modify: `bin/lib/code-health/issue-payload.js`
- Modify (tests): `bin/lib/code-health/tests/issue-payload.test.js`

**Interfaces:**
- Consumes: `finding.risk` (Task 1) and `finding.effort`/`finding.likelihood` (Phase 2) — all present on any finding reaching this function via the real `cmdValidateFindings` pipeline.
- Produces: `toIssuePayloadV2` emits `code-health:risk-{tier}` and `code-health:effort-{tier}` labels (replacing the old `code-health:{severity}` label), keeps `code-health:{criterion}`, and shows severity/likelihood/effort/risk/confidence in the body header line for transparency. `toIssuePayload` (v1) is unchanged.

- [ ] **Step 1: Write the failing test**

```
old_string:
const V2_FINDING = {
  id: 'recon-ab12cd34',
  criterion: 'simplification',
  areaId: 'src/api',
  anchor: 'src/api/user.js#getUser',
  severity: 'medium',
  confidence: 'high',
  title: 'getUser is a passthrough to the repository',
  evidence: 'src/api/user.js#getUser delegates directly to UserRepository.find with no added logic.',
  suggestedApproach: 'Inline the call at the call site, or add caching/auth in this method.',
  acceptance: 'getUser adds caching, authorization, or enrichment; or is removed.',
};

test('v2 labels are code-health + code-health:<severity> + code-health:<criterion>', () => {
  assert.deepStrictEqual(
    toIssuePayloadV2(V2_FINDING).labels,
    ['code-health', 'code-health:medium', 'code-health:simplification'],
  );
});
```
```
new_string:
const V2_FINDING = {
  id: 'recon-ab12cd34',
  criterion: 'simplification',
  areaId: 'src/api',
  anchor: 'src/api/user.js#getUser',
  severity: 'medium',
  confidence: 'high',
  likelihood: 'high',
  effort: 'low',
  risk: 'high',
  title: 'getUser is a passthrough to the repository',
  evidence: 'src/api/user.js#getUser delegates directly to UserRepository.find with no added logic.',
  suggestedApproach: 'Inline the call at the call site, or add caching/auth in this method.',
  acceptance: 'getUser adds caching, authorization, or enrichment; or is removed.',
};

test('v2 labels are code-health + code-health:risk-<tier> + code-health:effort-<tier> + code-health:<criterion>', () => {
  assert.deepStrictEqual(
    toIssuePayloadV2(V2_FINDING).labels,
    ['code-health', 'code-health:risk-high', 'code-health:effort-low', 'code-health:simplification'],
  );
});

test('v2 body header line shows severity, likelihood, effort, risk, and confidence', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  assert.ok(body.includes('**Risk:** high'), 'risk missing from body header');
  assert.ok(body.includes('**Severity:** medium'), 'severity missing from body header');
  assert.ok(body.includes('**Likelihood:** high'), 'likelihood missing from body header');
  assert.ok(body.includes('**Effort:** low'), 'effort missing from body header');
  assert.ok(body.includes('**Confidence:** high'), 'confidence missing from body header');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test bin/lib/code-health/tests/issue-payload.test.js
```

Expected: FAIL — the label assertion and the new body-header assertions don't match the current output.

- [ ] **Step 3: Implement the label and body-header change in `toIssuePayloadV2`**

```
old_string:
function toIssuePayloadV2(finding) {
  const marker = `<!-- code-health-fingerprint: ${finding.id} -->`;
  const relatedLines = Array.isArray(finding.relatedAnchors) && finding.relatedAnchors.length > 0
    ? ['', `Also affects: ${finding.relatedAnchors.map((a) => `\`${a}\``).join(', ')}`]
    : [];
  const body = [
    marker,
    '',
    `**Criterion:** ${finding.criterion} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence} | **Area:** ${finding.areaId}`,
    '',
    '## Current State',
    '',
    `Anchor: \`${finding.anchor}\``,
    ...relatedLines,
    '',
    finding.evidence,
    '',
    '## Deliverables',
    '',
    finding.suggestedApproach,
    '',
    '## Acceptance Criteria',
    '',
    finding.acceptance,
    '',
    '_Filed by `/code-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.title,
    body,
    labels: ['code-health', `code-health:${finding.severity}`, `code-health:${finding.criterion}`],
  };
}
```
```
new_string:
function toIssuePayloadV2(finding) {
  const marker = `<!-- code-health-fingerprint: ${finding.id} -->`;
  const relatedLines = Array.isArray(finding.relatedAnchors) && finding.relatedAnchors.length > 0
    ? ['', `Also affects: ${finding.relatedAnchors.map((a) => `\`${a}\``).join(', ')}`]
    : [];
  const body = [
    marker,
    '',
    `**Criterion:** ${finding.criterion} | **Risk:** ${finding.risk} | **Severity:** ${finding.severity} | **Likelihood:** ${finding.likelihood} | **Effort:** ${finding.effort} | **Confidence:** ${finding.confidence} | **Area:** ${finding.areaId}`,
    '',
    '## Current State',
    '',
    `Anchor: \`${finding.anchor}\``,
    ...relatedLines,
    '',
    finding.evidence,
    '',
    '## Deliverables',
    '',
    finding.suggestedApproach,
    '',
    '## Acceptance Criteria',
    '',
    finding.acceptance,
    '',
    '_Filed by `/code-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.title,
    body,
    labels: ['code-health', `code-health:risk-${finding.risk}`, `code-health:effort-${finding.effort}`, `code-health:${finding.criterion}`],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test bin/lib/code-health/tests/issue-payload.test.js
```

Expected: PASS, all tests including the 2 new/updated ones. The v1 `toIssuePayload` tests (unchanged function) continue to pass unaffected.

- [ ] **Step 5: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Restructure code-health issue labels: risk/effort tiers replace the severity label"
```

---

### Task 3: Label hygiene — real descriptions for criterion labels

**Files:**
- Modify: `bin/lib/code-health/criteria.js`
- Modify (tests): `bin/lib/code-health/tests/criteria.test.js`
- Modify: `skills/code-health/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: every `CRITERIA` catalog entry gains a `description` field (a real, human-readable one-liner). `criteriaForArea`/`getCriterion` are otherwise unchanged. SKILL.md's Step 9 gains a pre-filing step that creates any missing `code-health:{criterion}` label with that description via `gh label create`, instead of relying on `gh issue create`'s blank auto-vivification.

- [ ] **Step 1: Write the failing test**

Add to `bin/lib/code-health/tests/criteria.test.js`:

```js
test('every criterion has a non-empty description', () => {
  for (const c of CRITERIA) {
    assert.ok(
      typeof c.description === 'string' && c.description.trim().length > 0,
      `criterion ${c.id} is missing a description`,
    );
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test bin/lib/code-health/tests/criteria.test.js
```

Expected: FAIL — no `CRITERIA` entry has a `description` field yet.

- [ ] **Step 3: Add a `description` field to every `CRITERIA` entry**

Read `bin/lib/code-health/criteria.js`, then add a `description:` field to each of the 22 entries (insert it as the first field in each object, before `appliesTo`, for readability). Use these exact descriptions, keyed by `id`:

| id | description |
|---|---|
| `architecture-depth` | Shallow modules whose interface is nearly as complex as their implementation — leverage, not line count |
| `simplification` | Unnecessary complexity from iterative development: verbose patterns, dead branches, over-abstraction |
| `review-quality` | What a calibrated senior engineer would flag in code review — architecture, security, convention, performance |
| `scalability` | Structural patterns that will constrain scale before performance bottlenecks become visible |
| `security-logic` | Logic-level security defects — not static-analysis findings or dependency CVEs |
| `bad-practice` | Anti-patterns and conventions that violate established best practices for the language or framework |
| `doc-freshness` | Documentation that no longer matches the code it describes |
| `dead-code` | Unreachable code, unused exports, or functions with zero callers |
| `test-quality` | Tests that don't verify real behavior, or missing coverage for critical paths |
| `resilience` | Missing timeouts, retries, circuit breakers, or graceful-degradation paths |
| `observability` | Missing logging, metrics, or tracing on critical paths |
| `config-secrets` | Hardcoded secrets, credentials, or configuration that should be externalized |
| `dependency-health` | Outdated, unmaintained, or vulnerable dependencies |
| `input-validation` | Missing or insufficient validation of external input at trust boundaries |
| `naming-clarity` | Names that mislead, or fail to convey intent, scope, or side effects |
| `a11y` | Accessibility violations in frontend/UI code |
| `i18n` | Internationalization gaps in user-facing applications |
| `api-stability` | Breaking-change risk in library or service API/contract surfaces |
| `migration-safety` | Database migration or rollback correctness in data-backed areas |
| `iac-security` | Infrastructure-as-code security issues (Terraform, Dockerfiles, Kubernetes manifests) |
| `privacy-pii` | Handling of personally identifiable information without adequate protection |
| `concurrency` | Race conditions, unsafe shared mutable state, or unbounded concurrency in async code |

For example, the first entry becomes:

```
old_string:
  {
    id: 'architecture-depth',
    appliesTo: 'universal',
    fragment: 'criteria-architecture-depth.md',
    confidenceFloor: 'medium',
  },
```
```
new_string:
  {
    id: 'architecture-depth',
    description: 'Shallow modules whose interface is nearly as complex as their implementation — leverage, not line count',
    appliesTo: 'universal',
    fragment: 'criteria-architecture-depth.md',
    confidenceFloor: 'medium',
  },
```

Apply the same pattern (add `description:` as the field immediately after `id:`) to all 22 entries using the table above, including the compact one-line domain entries, e.g.:

```
old_string:
  { id: 'a11y', appliesTo: ['frontend'], confidenceFloor: 'high', fragment: 'criteria-a11y.md' },
```
```
new_string:
  { id: 'a11y', description: 'Accessibility violations in frontend/UI code', appliesTo: ['frontend'], confidenceFloor: 'high', fragment: 'criteria-a11y.md' },
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test bin/lib/code-health/tests/criteria.test.js
```

Expected: PASS, all tests including the new one.

- [ ] **Step 5: Add the label pre-creation step to `skills/code-health/SKILL.md`**

Find Step 9 (`grep -n "Step 9 — FILE" skills/code-health/SKILL.md`) and insert a new paragraph immediately before the existing `gh issue create` code block:

```
old_string:
**Step 9 — FILE / REOPEN ISSUES.**

For each payload in `/tmp/code-health-payloads.json`, call `gh issue create`. The engine is emit-only; filing is always done by the skill:

```bash
gh issue create \
  --title "<payload.title>" \
  --body "<payload.body>" \
  --label code-health \
  --label "code-health:<severity>" \
  --label "code-health:<criterion>"
```
```
```
new_string:
**Step 9 — FILE / REOPEN ISSUES.**

Before filing, ensure the criterion label carries a real description rather than the blank one `gh issue create` would auto-vivify on first use. For each payload's criterion, check whether the label already exists and create it with a description if not:

```bash
LABEL="code-health:<criterion>"
DESCRIPTION="<the criterion's description field from bin/lib/code-health/criteria.js — read it via: node -e \"const {getCriterion}=require('\${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/criteria.js'); console.log(getCriterion('<criterion>').description)\">"
gh label list --search "$LABEL" --json name -q '.[].name' | grep -qx "$LABEL" || \
  gh label create "$LABEL" --description "$DESCRIPTION"
```

For each payload in `/tmp/code-health-payloads.json`, call `gh issue create`. The engine is emit-only; filing is always done by the skill:

```bash
gh issue create \
  --title "<payload.title>" \
  --body "<payload.body>" \
  --label code-health \
  --label "code-health:risk-<tier>" \
  --label "code-health:effort-<tier>" \
  --label "code-health:<criterion>"
```
```

- [ ] **Step 6: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add real descriptions to criterion labels and pre-create them before filing"
```

---

### Task 4: Fix the pull-issues label-consumption regression

**Files:**
- Modify: `bin/lib/issues/ingest.js`
- Modify (tests): `bin/lib/issues/tests/ingest.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SEV_LABEL_RE` now matches both the old `code-health:<severity>` label shape and the new `code-health:risk-<tier>` shape, extracting the same tier value either way into the existing `severity` field of the brief object `issuesToBriefs` produces. `/flow`'s `--min-severity` flag and `pull-issues`'s own `--min-severity` CLI flag continue to work unchanged against issues filed under either label scheme — this task restores existing behavior, it does not rename anything.

- [ ] **Step 1: Write the failing test**

Add to `bin/lib/issues/tests/ingest.test.js`, after the existing `minSeverity floors on code-health:<sev> labels` test:

```js
test('severity extraction also matches the new code-health:risk-<tier> label shape', () => {
  const briefs = issuesToBriefs({ issuesJson: [
    issue({ number: 1, labels: ['code-health:risk-high'] }),
    issue({ number: 2, labels: ['code-health:risk-low'] }),
  ] });
  assert.strictEqual(briefs[0].severity, 'high');
  assert.strictEqual(briefs[1].severity, 'low');
});

test('minSeverity floors correctly against risk-<tier> labelled issues', () => {
  const briefs = issuesToBriefs({ minSeverity: 'high', issuesJson: [
    issue({ number: 1, labels: ['code-health:risk-high'] }),
    issue({ number: 2, labels: ['code-health:risk-low'] }),
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test bin/lib/issues/tests/ingest.test.js
```

Expected: FAIL — `SEV_LABEL_RE` does not yet match the `risk-` prefixed form.

- [ ] **Step 3: Widen `SEV_LABEL_RE`**

```
old_string:
const SEV_LABEL_RE = /^code-health:(critical|high|medium|low|info)$/;
```
```
new_string:
const SEV_LABEL_RE = /^code-health:(?:risk-)?(critical|high|medium|low|info)$/;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test bin/lib/issues/tests/ingest.test.js
```

Expected: PASS, all tests including the 2 new ones. The existing `code-health:<severity>` (non-`risk-`) tests continue to pass unchanged — the regex is additive, not a replacement.

- [ ] **Step 5: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Widen ingest.js severity-label regex to also match the new code-health:risk-<tier> label shape"
```

---

### Task 5: Update SKILL.md's remaining `--min-severity`/`--fail-on critical` documentation

**Files:**
- Modify: `skills/code-health/SKILL.md`

**Interfaces:**
- Consumes: Task 1's renamed flags.
- Produces: every remaining doc reference to `--min-severity`/`--fail-on critical` in this file now reads `--min-risk`/`--fail-on risk-high`.

- [ ] **Step 1: Update the Input section**

```
old_string:
- `--min-severity <level>` — minimum severity that gets filed as a GitHub issue (default: `high`; one of `low|medium|high|critical`). Findings below this are held in the local cache as `remembered` — not dropped, not filed — until they escalate or a deliberately deeper sweep lowers the bar. Pass `--min-severity medium` (or `low`) for an intentional deep-dive that surfaces more than the default high/critical-only trickle.
```
```
new_string:
- `--min-risk <level>` — minimum computed risk tier (severity × likelihood) that gets filed as a GitHub issue (default: `high`; one of `low|medium|high`). Findings below this are held in the local cache as `remembered` — not dropped, not filed — until they escalate or a deliberately deeper sweep lowers the bar. Pass `--min-risk medium` (or `low`) for an intentional deep-dive that surfaces more than the default high-risk-only trickle.
```

- [ ] **Step 2: Update the `validate-findings` bash block**

```
old_string:
  ${MIN_SEVERITY:+--min-severity "$MIN_SEVERITY"} \
```
```
new_string:
  ${MIN_RISK:+--min-risk "$MIN_RISK"} \
```

- [ ] **Step 3: Rename the "Regression and Critical Gating" section**

```
old_string:
## Regression and Critical Gating

Use `status [--fail-on regressed|critical]` to integrate code-health state into CI or pre-push hooks.

```bash
# Exit 1 if any regressed entries exist in the cache (a closed issue re-opened)
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" status --fail-on regressed

# Exit 1 if any open critical-severity entries exist in the cache
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" status --fail-on critical
```

Exit-code behavior:
- `--fail-on regressed` — exits `1` when one or more cache entries have `status: "regressed"`; exits `0` otherwise.
- `--fail-on critical` — exits `1` when one or more open cache entries have `severity: "critical"`; exits `0` otherwise.
- Without `--fail-on`, `status` always exits `0` and prints a summary table.
```
```
new_string:
## Regression and Risk Gating

Use `status [--fail-on regressed|risk-high]` to integrate code-health state into CI or pre-push hooks.

```bash
# Exit 1 if any regressed entries exist in the cache (a closed issue re-opened)
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" status --fail-on regressed

# Exit 1 if any open risk-high entries exist in the cache
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" status --fail-on risk-high
```

Exit-code behavior:
- `--fail-on regressed` — exits `1` when one or more cache entries have `status: "regressed"`; exits `0` otherwise.
- `--fail-on risk-high` — exits `1` when one or more open cache entries have `risk: "high"`; exits `0` otherwise.
- Without `--fail-on`, `status` always exits `0` and prints a summary table.
```

- [ ] **Step 4: Verify no other `--min-severity` or `--fail-on critical` reference remains in this file**

```bash
grep -n "min-severity\|fail-on critical\|fail-on.*critical" skills/code-health/SKILL.md
```

Expected: no output. If anything remains, apply the same rename pattern used above before proceeding.

- [ ] **Step 5: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only). Run `bin/lib/code-health/tests/skill-md.test.js` in isolation too, since it asserts specific required substrings in this file.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Update code-health SKILL.md docs for --min-risk and --fail-on risk-high"
```

---

## What this plan does not cover

Per the design doc's phasing, the following remain separate, later plans:
- The four downstream efficiency levers (effort→model tier, risk-ordered batching, quick-wins selector, spec-sizing signal).
- The closing-keyword safety-net hook.
- A full rename of `/flow`'s own `--min-severity` flag, `pull-issues`'s CLI `--min-severity` flag, or `ingest.js`'s `severity` field name to `risk`/`--min-risk` — this phase only restores correct label-matching behavior for the existing flag name (Task 4), it does not rename the downstream consumer chain. That would be a materially separate piece of work spanning `skills/flow/from-code-health.md`, `steps-and-gates.md`, `SKILL.md`, `skills/help/reference-card.md`, and multiple test files in two locations (`bin/lib/code-health/tests/` and the legacy `tests/recon/`).
- Migration of already-filed issues in already-deployed projects carrying the old `code-health:{severity}` label to the new `code-health:risk-{tier}` label — consistent with Phase 1's "bare rename, no migration" decision, this is an accepted, known gap, not solved here.
