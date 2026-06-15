# Recon v2 Phase 4: Routine & Autonomy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: before executing this plan, load and follow `superpowers:subagent-driven-development`. Each numbered Task below is one independent unit — write the failing test first (TDD), run it and confirm it fails for the stated reason, write the minimal implementation, run it and confirm it passes, then commit. For markdown-only tasks, write the file then `grep`-verify the exact phrases that matter. For deletion tasks, run `node --test tests/` after every deletion to keep the suite green. Do not batch tasks; do not skip the red step. All code is real — there are no placeholders.

> **Canonical interface:** `docs/superpowers/plans/2026-06-15-recon-v2-interface-contract.md` is the single source of truth for all shared API signatures across P1–P4. Where an inline signature in this plan disagrees with the contract, **the contract wins**.

**Goal:** Close out Recon v2 as a fully autonomous scheduled Routine, complete the v1→v2 migration, and sync all docs. Specifically: (a) extend `status` and `churn-report` to read from the v2 cache and run-log shapes (including the `hashes` field added by `recordRun` in P3); (b) verify `pull-issues.js`/`pullReconIssues` parses v2 issue bodies correctly (criterion labels, fingerprint marker, `/specify`-shaped body sections); (c) add/adjust tests for both; (d) delete the v1 spine — `cmdPlanJudgment`, `cmdIngestJudgment`, their exports, and `bin/lib/recon/judgment.js` — plus remove the mechanical lenses from the run spine (demote: keep the files as optional cheap checks the LLM may call, but remove them from `buildLenses`/`cmdRun`); (e) remove the "Judgment Lens Dispatch" section from `skills/recon/SKILL.md` and add a `## Routine Configuration` section; (f) add a `## Regression and Critical Gating` section and `## Fingerprint Churn` section; (g) update `skills/flow/from-recon.md` if the v2 issue-body/label shape changed the parse contract; (h) doc-sync CLAUDE.md, README.md, `skills/help/reference-card.md`, `skills/help/context-flow.md`; (i) bump `.claude-plugin/plugin.json` to 5.0.0 with rationale in the commit; (j) note the marketplace mirror as a required follow-up. Suite stays green throughout.

**Architecture:** Two immutable layers, unchanged from P1–P3. The **deterministic layer** (`bin/lib/recon/`, `bin/recon.js`) gets targeted surgery: `status` and `churn-report` are verified/fixed for v2 cache shape; `plan-judgment` and `ingest-judgment` commands and their backend (`judgment.js`) are deleted; `buildLenses`/`cmdRun` in `recon.js` are rewritten to remove the mechanical-lens spine (the lenses files themselves stay as optional tools for the SKILL to call). The **skill/markdown layer** rewrites the recon SKILL's workflow section and adds the Routine Configuration, Regression Gating, and Churn sections; updates `from-recon.md` for v2 label/body shape; and syncs all cross-references.

**Tech Stack:** Node 18+ built-ins only (`fs`, `path`, `crypto`, `child_process`); `node --test` (test runner); `gh` CLI through-tool (invoked by the skill, never by the engine). Zero external deps.

**Baseline:** Branch `recon-v2`. P1 built the mechanical-lens spine and `status`/`churn-report`; P2 added area-type routing, `classify`, criteria catalog, and the verify gate; P3 added `next-slice`, `scope.js`, content-hash cursors (`lastHash`), hotspot priority, and budget. This plan is P4 — it makes the result a scheduled Routine and completes migration.

Pre-existing exports referenced in this plan:

| Module | Pre-existing exports used here |
|--------|-------------------------------|
| `bin/lib/recon/cache.js` | `readCache`, `writeCache`, `readCursors`, `writeCursors`, `recordRun` (P3: writes `hashes` to cursor), `readRuns`, `computeChurn`, `runsDir` |
| `bin/lib/recon/fingerprint.js` | `fingerprint({criterion, areaId, anchor})` (v2 form, P1 extended in P2) |
| `bin/lib/recon/validate-finding.js` | `validateFinding(obj)` — validates v2 Finding shape (`criterion`, `anchor`, `suggestedApproach`, `acceptance`, etc.) |
| `bin/lib/recon/pull-issues.js` | `pullReconIssues({label, minSeverity, issuesJson})` → `brief[]` |
| `bin/lib/recon/dedup.js` | `decide(finding, issueIndex, cache)` |
| `bin/lib/recon/issue-payload.js` | `toIssuePayload(finding)` — emits `## Current State` / `## Deliverables` / `## Acceptance Criteria` + fingerprint marker |
| `bin/lib/recon/judgment.js` | **To be deleted** — `buildWorkOrders`, `JUDGMENT_LENS_MAP` |
| `bin/lib/recon/lenses/index.js` | `buildLenses(config)` — **to be emptied** (lenses demoted from spine) |
| `bin/recon.js` | `cmdRun`, `cmdPlanJudgment`, `cmdIngestJudgment`, `cmdStatus`, `cmdChurnReport`, `cmdPullIssues`, `main`, `parseArgs`, `selectAreas`, `loadIssueIndex` |

v2 Finding shape (contract §"The core data shape"):
```js
{ criterion, areaId, anchor, severity, confidence, title, evidence, suggestedApproach, acceptance }
```
v2 fingerprint basis: `hash(criterion + areaId + normalizeAnchor(anchor))` → `"recon-<8hex>"`.

v2 issue body sections: `## Current State` · `## Deliverables` · `## Acceptance Criteria` + `<!-- recon-fingerprint: recon-xxxxxxxx -->`.
v2 issue labels: `['recon', 'recon:<severity>', 'recon:<criterion>']`.

v2 `recordRun` signature (P3 extended): `recordRun(root, runId, { fingerprints, areasSwept, hashes })` where `hashes` is `{ "<areaId>": "<contentHash>" }` — written to cursors as `lastHash`. This is the shape `cmdStatus` and `cmdChurnReport` must tolerate.

v2 cursors shape (P3 extended): `{ "<areaId>": { lastSweptMs: number, lastHash: string } }`.

---

## File Structure

| File | Disposition | Responsibility |
|------|-------------|----------------|
| `bin/recon.js` | **Modify** | Remove `plan-judgment` and `ingest-judgment` dispatch; remove `buildLenses` import and the mechanical-lens loop from `cmdRun`; verify `cmdStatus` reads v2 cache correctly; verify `cmdChurnReport` reads v2 run-logs with `hashes` field; remove now-dead exports from `module.exports` |
| `bin/lib/recon/judgment.js` | **Delete** | Entire file — `buildWorkOrders` and `JUDGMENT_LENS_MAP` are no longer used |
| `bin/lib/recon/lenses/index.js` | **Modify** | Export `buildLenses` that returns `[]` (lenses demoted from run spine; kept as optional tools for the SKILL to call) |
| `bin/lib/recon/tests/cli-run.test.js` | **Modify** | Remove tests that call `plan-judgment` or `ingest-judgment`; adjust or replace any test that drove `cmdRun` through the mechanical-lens path |
| `bin/lib/recon/tests/judgment.test.js` | **Delete** | Tests for `buildWorkOrders` / `JUDGMENT_LENS_MAP` — deleted with `judgment.js` |
| `bin/lib/recon/tests/lenses-index.test.js` | **Modify** | Update to assert `buildLenses()` returns `[]` (lenses demoted) |
| `bin/lib/recon/tests/status-v2.test.js` | **New** | `cmdStatus` reads v2 cache shape (`severity`, `regressed` status written by `validate-findings`); `--fail-on regressed` and `--fail-on critical` exit codes work against v2 cache entries |
| `bin/lib/recon/tests/churn-v2.test.js` | **New** | `recordRun` with `hashes` field round-trips through `readRuns`; `computeChurn` works over v2 run-logs; `churn-report` CLI with `--fail-on-high-churn` exits correctly when run-logs contain `hashes` |
| `bin/lib/recon/tests/pull-issues-v2.test.js` | **New** | `pullReconIssues` parses v2 issue bodies (criterion label `recon:<criterion>`, fingerprint marker, three-section body); `--min-severity` filter; missing fingerprint → `fingerprint: null`; label-name normalisation for object-vs-string labels |
| `skills/recon/SKILL.md` | **Modify** | Remove "Judgment Lens Dispatch" section (Steps J1–J3); update Workflow to reflect v2 SCOPE→CLASSIFY→JUDGE→validate-findings→file spine; update `## Routine Configuration` section with schedule block, headless-run description, K-slice/token-cap budget note, and one neutral billing sentence; add `## Regression and Critical Gating` section documenting `status [--fail-on regressed|critical]`; add `## Fingerprint Churn` section documenting `churn-report [--fail-on-high-churn]`; update Anti-Patterns (remove stale v1-spine ones, keep/update accurate ones); update Relationship table (bidirectional rows correct for v2); update Component-Skill Contract; update Next Actions |
| `skills/flow/from-recon.md` | **Modify** | Update Step 2 parse-to-briefs section to reflect v2 label shape (`recon:<criterion>`) and v2 body sections (`## Current State` / `## Deliverables` / `## Acceptance Criteria`); confirm `pullReconIssues` call signature unchanged |
| `CLAUDE.md` | **Modify** | Update recon description in the skill-directories table; update CLI command list (remove `plan-judgment`/`ingest-judgment`, add `validate-findings`/`classify`/`next-slice`); update sub-files table if `from-recon.md` content changed; note `_shared/criteria-*.md` fragments |
| `README.md` | **Modify** | Update recon entry to describe v2 LLM-judge model and Routine; remove references to mechanical lenses as the spine |
| `skills/help/reference-card.md` | **Modify** | Update `/recon` row description to reflect v2 (LLM judge, scheduled Routine, `--dry-run`) |
| `skills/help/context-flow.md` | **Modify** | Update recon artifact-flow diagram: judge → issues → `/specify` → `/flow`; update the reads/writes row for `/recon` |
| `.claude-plugin/plugin.json` | **Modify** | Bump `version` to `5.0.0`; bump `description` to reflect v2 LLM-judge |

Tests live under `bin/lib/recon/tests/`. Suite command: `node --test tests/`. Run the full suite with `node --test tests/` after each deletion step.

---

## Task 1: Verify and fix `cmdStatus` against the v2 cache shape

P3's `validate-findings` writes cache entries with `{ status: 'open'|'regressed'|..., severity, issue }`. The v1 `cmdStatus` in `bin/recon.js` reads `status` and `severity` from cache entries; confirm it works for v2 by adding tests that cover the v2 write path.

**Files:**
- New test: `bin/lib/recon/tests/status-v2.test.js`
- Modify (if needed): `bin/recon.js` `cmdStatus`

- [ ] Write the failing test `bin/lib/recon/tests/status-v2.test.js`. The test imports `readCache`/`writeCache`/`cachePath` from `../cache` and `cmdStatus` behavior by shelling out to `bin/recon.js status` (like `cli-run.test.js` does):

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-status-v2-')); }

function writeV2Cache(root, entries) {
  // entries: [{ fp, status, severity }]
  const cache = {};
  for (const e of entries) cache[e.fp] = { status: e.status, severity: e.severity, issue: null };
  const p = path.join(root, '.claude-tweaks', 'recon', 'cache.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}

test('status prints open and regressed counts from v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'medium' },
    { fp: 'recon-ccccdddd', status: 'regressed', severity: 'high' },
    { fp: 'recon-eeeeffff', status: 'closed', severity: 'low' },
  ]);
  const out = execFileSync('node', [CLI, 'status', '--root', root], { encoding: 'utf8' });
  assert.ok(out.includes('open:1'), `expected open:1 in: ${out}`);
  assert.ok(out.includes('regressed:1'), `expected regressed:1 in: ${out}`);
  assert.ok(out.includes('closed:1'), `expected closed:1 in: ${out}`);
});

test('status --fail-on regressed exits 1 when regressed entries exist in v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'medium' },
    { fp: 'recon-ccccdddd', status: 'regressed', severity: 'high' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'regressed', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.ok(result.stdout.includes('FAIL'));
});

test('status --fail-on critical exits 1 when open critical entries exist in v2 cache', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'critical' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'critical', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.ok(result.stdout.includes('FAIL'));
});

test('status --fail-on regressed exits 0 when no regressed entries', () => {
  const root = tmp();
  writeV2Cache(root, [
    { fp: 'recon-aaaabbbb', status: 'open', severity: 'medium' },
  ]);
  const result = spawnSync('node', [CLI, 'status', '--fail-on', 'regressed', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
});
```

- [ ] Run: `node --test bin/lib/recon/tests/status-v2.test.js` — confirm tests fail (or if they pass without change, confirm the current `cmdStatus` already handles v2 shape correctly and note it in the commit).
- [ ] Inspect `cmdStatus` in `bin/recon.js`. The current implementation reads `f.status` and `f.severity` from cache entries — these match the v2 shape written by `validate-findings`. Confirm no field-name drift. If drift exists (e.g., v2 writes `severity` under a different key), fix `cmdStatus` to read the correct field.
- [ ] Run: `node --test bin/lib/recon/tests/status-v2.test.js` — all 4 tests green.
- [ ] Run: `node --test tests/` — full suite green.
- [ ] Commit: `Verify status command reads v2 cache shape — add status-v2 tests`

---

## Task 2: Verify and fix `churn-report` against the v2 run-log shape

P3's `recordRun` signature is `recordRun(root, runId, { fingerprints, areasSwept, hashes })` where `hashes` is `{ "<areaId>": "<contentHash>" }`. The v1 `recordRun` only persisted `fingerprints` and `areasSwept`. Verify `readRuns` still reads v2 logs (which contain the added `hashes` field) and `computeChurn` produces correct output.

**Files:**
- New test: `bin/lib/recon/tests/churn-v2.test.js`
- Modify (if needed): `bin/lib/recon/cache.js` `recordRun`

- [ ] Write the failing test `bin/lib/recon/tests/churn-v2.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { recordRun, readRuns, computeChurn } = require('../cache');
const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-churn-v2-')); }

test('recordRun with hashes round-trips through readRuns', () => {
  const root = tmp();
  recordRun(root, 'run-001', {
    fingerprints: ['recon-aaaa0001', 'recon-bbbb0002'],
    areasSwept: ['src/api'],
    hashes: { 'src/api': 'abc123def456' },
  });
  const runs = readRuns(root);
  assert.strictEqual(runs.length, 1);
  assert.deepStrictEqual(runs[0].fingerprints, ['recon-aaaa0001', 'recon-bbbb0002']);
  // hashes stored in cursor; run-log may or may not include it — assert fingerprints are intact
});

test('computeChurn works over consecutive v2 run-logs', () => {
  const root = tmp();
  recordRun(root, 'run-001', {
    fingerprints: ['recon-aaaa0001', 'recon-bbbb0002'],
    areasSwept: ['src/api'],
    hashes: { 'src/api': 'abc123' },
  });
  recordRun(root, 'run-002', {
    fingerprints: ['recon-aaaa0001', 'recon-cccc0003'],
    areasSwept: ['src/lib'],
    hashes: { 'src/lib': 'def456' },
  });
  const runs = readRuns(root);
  assert.strictEqual(runs.length, 2);
  const churn = computeChurn(runs[1].fingerprints, runs[0]);
  assert.deepStrictEqual(churn.appeared, ['recon-cccc0003']);
  assert.deepStrictEqual(churn.disappeared, ['recon-bbbb0002']);
  assert.strictEqual(churn.stayed.length, 1);
  // ratio = 2 appeared+disappeared / 3 union = 0.667
  assert.ok(churn.ratio > 0.5 && churn.ratio < 0.8, `ratio ${churn.ratio}`);
});

test('churn-report CLI exits 1 when ratio exceeds threshold', () => {
  const root = tmp();
  recordRun(root, 'run-001', { fingerprints: ['recon-aaaa0001', 'recon-bbbb0002'], areasSwept: ['src'], hashes: {} });
  recordRun(root, 'run-002', { fingerprints: ['recon-cccc0003', 'recon-dddd0004'], areasSwept: ['src'], hashes: {} });
  const result = spawnSync('node', [CLI, 'churn-report', '--root', root, '--fail-on-high-churn', '0.5'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1, `stdout: ${result.stdout}`);
});

test('churn-report CLI exits 0 when ratio is below threshold', () => {
  const root = tmp();
  recordRun(root, 'run-001', { fingerprints: ['recon-aaaa0001', 'recon-bbbb0002'], areasSwept: ['src'], hashes: {} });
  recordRun(root, 'run-002', { fingerprints: ['recon-aaaa0001', 'recon-bbbb0002'], areasSwept: ['src'], hashes: {} });
  const result = spawnSync('node', [CLI, 'churn-report', '--root', root, '--fail-on-high-churn', '0.5'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
});
```

- [ ] Run: `node --test bin/lib/recon/tests/churn-v2.test.js` — confirm tests fail or show what the current state is.
- [ ] Inspect `recordRun` in `bin/lib/recon/cache.js`. The v1 version took `{ fingerprints, areasSwept }`. Confirm whether P3 extended the signature to accept `hashes` and writes cursor `lastHash`. If not yet extended (P3 may have landed it elsewhere), extend `recordRun` to accept `hashes` and write each area's `lastHash` into cursors alongside `lastSweptMs`:
  ```js
  if (hashes && Object.keys(hashes).length > 0) {
    for (const [areaId, hash] of Object.entries(hashes)) {
      cursors[areaId] = { ...cursors[areaId], lastSweptMs: now, lastHash: hash };
    }
  }
  ```
- [ ] Run: `node --test bin/lib/recon/tests/churn-v2.test.js` — all 4 tests green.
- [ ] Run: `node --test tests/` — full suite green.
- [ ] Commit: `Verify churn-report reads v2 run-logs with hashes field — add churn-v2 tests`

---

## Task 3: Verify `pull-issues.js` parses v2 issue bodies and labels

The v2 issue body uses `## Current State` / `## Deliverables` / `## Acceptance Criteria` sections (instead of v1's different shape). The v2 labels include `recon:<criterion>` (e.g., `recon:security-logic`) in addition to `recon:<severity>`. Verify `pullReconIssues` extracts fingerprint and severity correctly from v2 issues, and that the `recon:<criterion>` label does not interfere with severity detection.

**Files:**
- New test: `bin/lib/recon/tests/pull-issues-v2.test.js`
- Modify (if needed): `bin/lib/recon/pull-issues.js`

- [ ] Write the failing test `bin/lib/recon/tests/pull-issues-v2.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { pullReconIssues } = require('../pull-issues');

// A v2-shaped issue: body has three sections; labels include recon:<criterion>
function v2Issue({ number = 1, severity = 'high', criterion = 'security-logic', fingerprint = 'recon-abcd1234' } = {}) {
  return {
    number,
    title: `[recon] ${criterion} finding`,
    state: 'open',
    labels: [
      { name: 'recon' },
      { name: `recon:${severity}` },
      { name: `recon:${criterion}` },
    ],
    body: [
      `## Current State`,
      `Evidence of the finding. Anchor: src/api/auth.js#validateToken`,
      ``,
      `## Deliverables`,
      `Suggested approach in prose — no code.`,
      ``,
      `## Acceptance Criteria`,
      `The validateToken function validates all inputs at the boundary.`,
      ``,
      `<!-- recon-fingerprint: ${fingerprint} -->`,
    ].join('\n'),
  };
}

test('pullReconIssues extracts fingerprint from v2 body', () => {
  const briefs = pullReconIssues({ issuesJson: [v2Issue()] });
  assert.strictEqual(briefs.length, 1);
  assert.strictEqual(briefs[0].fingerprint, 'recon-abcd1234');
});

test('pullReconIssues extracts severity from recon:<severity> label (not recon:<criterion>)', () => {
  const briefs = pullReconIssues({ issuesJson: [v2Issue({ severity: 'critical', criterion: 'a11y' })] });
  assert.strictEqual(briefs[0].severity, 'critical');
});

test('pullReconIssues minSeverity filters below-floor issues', () => {
  const issues = [
    v2Issue({ number: 1, severity: 'high', criterion: 'security-logic', fingerprint: 'recon-high0001' }),
    v2Issue({ number: 2, severity: 'medium', criterion: 'simplification', fingerprint: 'recon-med00002' }),
    v2Issue({ number: 3, severity: 'low', criterion: 'naming-clarity', fingerprint: 'recon-low00003' }),
  ];
  const briefs = pullReconIssues({ minSeverity: 'high', issuesJson: issues });
  assert.strictEqual(briefs.length, 1);
  assert.strictEqual(briefs[0].fingerprint, 'recon-high0001');
});

test('pullReconIssues sets fingerprint null when marker is absent', () => {
  const noMarker = { ...v2Issue(), body: '## Current State\nNo marker here.' };
  const briefs = pullReconIssues({ issuesJson: [noMarker] });
  assert.strictEqual(briefs[0].fingerprint, null);
});

test('pullReconIssues handles object labels with name property (gh CLI output shape)', () => {
  const issue = v2Issue();
  // gh CLI returns labels as [{ id, name, color, ... }]; pull-issues.js uses labelNames() which already handles this
  const briefs = pullReconIssues({ issuesJson: [issue] });
  assert.strictEqual(briefs.length, 1);
  assert.strictEqual(briefs[0].severity, 'high');
});

test('pullReconIssues body is passed through unchanged for /specify consumption', () => {
  const issue = v2Issue();
  const briefs = pullReconIssues({ issuesJson: [issue] });
  assert.ok(briefs[0].body.includes('## Current State'));
  assert.ok(briefs[0].body.includes('## Deliverables'));
  assert.ok(briefs[0].body.includes('## Acceptance Criteria'));
});
```

- [ ] Run: `node --test bin/lib/recon/tests/pull-issues-v2.test.js` — confirm which tests fail and why.
- [ ] Inspect `bin/lib/recon/pull-issues.js`. The current `SEV_LABEL_RE = /^recon:(critical|high|medium|low|info)$/` only matches severity labels; `recon:<criterion>` labels like `recon:security-logic` will not match — so severity detection should already be correct. Verify `labelNames()` handles `{ name: ... }` objects (it does: `(typeof l === 'string' ? l : l.name)`). The fingerprint regex `FP_RE = /<!--\s*recon-fingerprint:\s*([^\s>]+)\s*-->/` will match the v2 marker. If any test fails due to a real gap, fix it minimally.
- [ ] Run: `node --test bin/lib/recon/tests/pull-issues-v2.test.js` — all 6 tests green.
- [ ] Run: `node --test tests/` — full suite green.
- [ ] Commit: `Verify pull-issues parses v2 issue body and criterion labels — add pull-issues-v2 tests`

---

## Task 4: Delete `judgment.js` and its test

`bin/lib/recon/judgment.js` implements the v1 `buildWorkOrders`/`JUDGMENT_LENS_MAP` subagent dance. The v2 SKILL drives the judge directly; this module has no callers after `plan-judgment` and `ingest-judgment` are removed in Task 5.

**Files:**
- Delete: `bin/lib/recon/judgment.js`
- Delete: `bin/lib/recon/tests/judgment.test.js`

- [ ] Confirm no remaining callers: `grep -rn 'judgment' bin/recon.js bin/lib/recon/` — expected hits are the two delete targets only plus the `require('./lib/recon/judgment')` line in `bin/recon.js` (which Task 5 removes). No hits in any other file.
- [ ] Delete `bin/lib/recon/tests/judgment.test.js`:
  ```bash
  rm "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/bin/lib/recon/tests/judgment.test.js"
  ```
- [ ] Delete `bin/lib/recon/judgment.js`:
  ```bash
  rm "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/bin/lib/recon/judgment.js"
  ```
- [ ] Run: `node --test tests/` — suite must stay green (the two deleted test files are gone; `judgment.js` will cause `recon.js` to error on `require` — that's expected until Task 5 removes the import).
- [ ] Note: if `recon.js` still imports `judgment.js` at the top, running the full suite now will fail. That is expected — proceed immediately to Task 5 without committing until after Task 5.

---

## Task 5: Remove `plan-judgment`, `ingest-judgment`, and the mechanical-lens spine from `bin/recon.js`

This is the core v1→v2 migration: the SKILL now drives the judge directly; `bin/recon.js` is pure plumbing (scope, classify, validate-findings, status, churn-report, pull-issues).

**Files:**
- Modify: `bin/recon.js`
- Modify: `bin/lib/recon/lenses/index.js` (demote lenses from spine)
- Modify: `bin/lib/recon/tests/lenses-index.test.js`
- Modify: `bin/lib/recon/tests/cli-run.test.js` (remove tests for deleted commands)

- [ ] Edit `bin/recon.js`:
  - Remove the `require('./lib/recon/judgment')` line and the `DEFAULT_JUDGMENT_LENSES` and `DEFAULT_MAX_SUBAGENTS` constants.
  - Remove the `require('./lib/recon/lenses/index')` import (`buildLenses`). The lens import is no longer used.
  - Remove the `cmdPlanJudgment` function entirely.
  - Remove the `cmdIngestJudgment` function entirely.
  - Rewrite `cmdRun`: remove the `buildLenses` call and the `for (const lens of lenses)` loop. The function should now only call `selectAreas`, load the issue index, read the cache, then **emit a stub output** that the SKILL's new workflow replaces — or, more precisely, `cmdRun` itself is now superseded by the SKILL's SCOPE→CLASSIFY→JUDGE pipeline; keep the function only as a `--dry-run` smoke-check helper that calls `selectAreas` and emits the selected areas JSON (no findings loop). If P3 already rewrote `cmdRun` to emit a slices-only output, keep that. If it still runs the mechanical-lens loop, rewrite it to:
    ```js
    function cmdRun(args) {
      const slice = selectAreas({ area: args.area, root: args.root, K: 1 });
      const out = {
        runId: args.runId,
        dryRun: args.dryRun || false,
        areas: slice.map((a) => a.id),
        plan: [],
        summary: {},
      };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    }
    ```
    (The real judgment loop now lives in the SKILL; this `cmdRun` form is kept only for smoke-check backward compat with the SKILL's dry-run step.)
  - In `main()`, remove the `if (cmd === 'plan-judgment')` and `if (cmd === 'ingest-judgment')` dispatch arms.
  - Remove `cmdIngestJudgment` and `cmdPlanJudgment` from `module.exports`.
  - Update the usage error message to reflect the current command set:
    ```js
    process.stderr.write('usage: recon.js <command> [options]\n' +
      'commands: run, validate-findings, classify, next-slice, status, churn-report, pull-issues\n');
    ```

- [ ] Edit `bin/lib/recon/lenses/index.js`: change `buildLenses(config)` to return `[]`. Keep the existing `require` lines commented out (do not delete the lens files — they are kept as optional cheap checks the SKILL may invoke directly). Add a comment:
  ```js
  // Lenses are demoted from the run spine in v2.
  // The v2 SKILL drives the LLM judge directly; lenses are optional tools
  // the SKILL may call as evidence. Return [] so cmdRun emits no findings.
  function buildLenses(_config) { return []; }
  module.exports = { buildLenses };
  ```

- [ ] Edit `bin/lib/recon/tests/lenses-index.test.js`: find any test asserting `buildLenses()` returns a non-empty array and update it to assert `buildLenses()` returns `[]`.

- [ ] Edit `bin/lib/recon/tests/cli-run.test.js`: remove any `test(...)` blocks that call `plan-judgment` or `ingest-judgment` on the CLI. Keep the `run`, `status`, and `churn-report` tests; only remove blocks that reference the deleted subcommands.

- [ ] Run: `node --test tests/` — full suite must be green.
- [ ] Commit: `Remove plan-judgment, ingest-judgment, and mechanical-lens spine — v1→v2 migration`

---

## Task 6: Update `skills/recon/SKILL.md` — workflow, Routine, gating, churn, cleanup

The SKILL.md still describes the v1 workflow (dry-run → gather issues → run lenses → file). Replace it with the v2 workflow (SCOPE → CLASSIFY → JUDGE → validate-findings → file), add the Routine Configuration section (schedule block, headless-run description, K-slice/token-cap budget note, one neutral billing sentence), and add/update the Regression and Critical Gating and Fingerprint Churn sections. Remove the now-dead "Judgment Lens Dispatch" section (Steps J1–J3).

**Files:**
- Modify: `skills/recon/SKILL.md`

- [ ] Read the current `skills/recon/SKILL.md` fully. Identify: the "Judgment Lens Dispatch" section to delete, the "Workflow" section to rewrite, and the sections to add.

- [ ] Remove the `## Judgment Lens Dispatch` section (Steps J1, J2, J3 and their surrounding prose). This is the `plan-judgment`/`ingest-judgment` subagent-dispatch section.

- [ ] Rewrite the `## Workflow` section to reflect the v2 SCOPE→CLASSIFY→JUDGE→validate-findings→file spine. The new workflow must describe:
  - **Step 1 — Scope** (`node recon.js next-slice --root .`): picks the next directory slice via rotation + content-hash skip + hotspot priority.
  - **Step 2 — Classify** (`node recon.js classify --root . --area <slice>`): detects area types and selects applicable criteria.
  - **Step 3 — Judge** (Claude reads the slice and applies each criterion holistically, calling tool assists as evidence, plus a final "anything else worth flagging?" pass). Emits a findings JSON array.
  - **Step 4 — Validate** (`node recon.js validate-findings <findings.json> --root . [--issues <file>] [--run-id <id>]`): validates → fingerprints → deduplicates → emits `gh`-ready payloads.
  - **Step 5 — File** (`gh issue create` per surviving payload). Labels: `recon`, `recon:<severity>`, `recon:<criterion>`.
  - **Step 6 — Summarize**: report counts (filed/reopened/skipped/remembered); batch-table for interactive triage.
  - Include the dry-run step as Step 0 (pre-flight smoke-check: `node recon.js run --dry-run`).
  - Include the `--dry-run` note and the `--issues` file gather step (Step 0.5: `gh issue list --label recon --state all --json number,state,labels,body --limit 500`).

- [ ] Ensure the `## Routine Configuration` section is present and contains:
  - A named-schedule block (`Name: recon-daily`, `Schedule: daily at 03:00 (off-peak)`, `Prompt: /claude-tweaks:recon`, `K-budget: 1–3 slices per run`, `Token cap: align with per-run budget`).
  - A description of the headless run: SCOPE(next-slice) → CLASSIFY → JUDGE → validate-findings → file issues; triage happens later in GitHub.
  - Exactly one neutral billing sentence: "Routines run inside the subscription; verify automation-credit specifics against the live account."
  - Note that a skipped run is harmless (rotation resumes next window).

- [ ] Ensure the `## Regression and Critical Gating` section is present and documents `status [--fail-on regressed|critical]` with the exact CLI commands and exit-code behavior (matches Task 1 test expectations).

- [ ] Ensure the `## Fingerprint Churn` section is present and documents `churn-report [--fail-on-high-churn <r>]` with the exact CLI commands and exit-code behavior (matches Task 2 test expectations).

- [ ] Update `## Anti-Patterns`: remove stale v1-spine anti-patterns (e.g., "Dispatching more subagents than MAX_SUBAGENTS", "Passing a single agent's raw reply to ingest-judgment"). Add/keep v2-relevant ones: "Emitting findings with line-number anchors (breaks dedup)", "Filing below-confidence-floor findings (use the verify gate first)", "Calling gh from the engine (the engine is emit-only; the SKILL hands payloads to gh)".

- [ ] Verify the `## Relationship to Other Skills` table has a bidirectional row for `/flow`, `/specify`, `/capture`, `/tidy`, `/review`, `/deepen`, `/simplify`.

- [ ] Verify the `## Component-Skill Contract` paragraph is correct (keyed on `$PIPELINE_RUN_DIR`).

- [ ] Grep-verify the resulting SKILL.md:
  ```bash
  grep -n 'plan-judgment\|ingest-judgment\|MAX_SUBAGENTS\|Step J[123]' skills/recon/SKILL.md
  ```
  Must return no hits.
  ```bash
  grep -n 'Routine Configuration\|Regression and Critical Gating\|Fingerprint Churn\|next-slice\|validate-findings' skills/recon/SKILL.md
  ```
  Must return hits for all five terms.
  ```bash
  grep -c 'subscription' skills/recon/SKILL.md
  ```
  Must return exactly `1` (one neutral billing sentence).

- [ ] Run: `node --test tests/` — full suite green.
- [ ] Commit: `Rewrite recon SKILL.md for v2 — remove v1 spine sections, add Routine Configuration and gating`

---

## Task 7: Update `skills/flow/from-recon.md` for v2 label/body shape

The v2 issue body uses `## Current State` / `## Deliverables` / `## Acceptance Criteria` (same as what `toIssuePayload` already emits per the contract). The v2 `recon:<criterion>` label is added alongside `recon:<severity>`. Verify `from-recon.md`'s Step 2 parse procedure accurately reflects these; update any reference to the old body structure.

**Files:**
- Modify: `skills/flow/from-recon.md`

- [ ] Read `skills/flow/from-recon.md` Step 2 ("Parse to briefs (pure)"). Confirm:
  - The `pullReconIssues` call signature is still `{ label, minSeverity, issuesJson }` — unchanged.
  - The brief shape is `{ number, title, body, fingerprint, severity }` — unchanged.
  - If the section mentions "Current State / Deliverables / Acceptance Criteria" as body sections, it is already correct for v2.
  - If the section mentions any v1-only label format or body structure, update it.

- [ ] Update Step 2 to note the v2 label set: labels include `recon`, `recon:<severity>`, and `recon:<criterion>`. The `pullReconIssues` function filters by `recon` label presence and extracts severity from the `recon:<severity>` label — the `recon:<criterion>` label is informational (passed through in the brief's `body`).

- [ ] Confirm Step 3 ("Derive specs via `/specify`") still matches: the brief's `body` is already `/specify`-shaped (three sections), so `/specify` can consume it with near-zero translation. No change needed if already correct.

- [ ] Grep-verify:
  ```bash
  grep -n 'Current State\|Deliverables\|Acceptance Criteria' skills/flow/from-recon.md
  ```
  Must return hits confirming the three-section body is documented.

- [ ] Run: `node --test tests/` — full suite green.
- [ ] Commit: `Update from-recon.md for v2 label/body shape — criterion labels, three-section body`

---

## Task 8: Doc-sync — CLAUDE.md

CLAUDE.md's skill-directories table and the CLI command list reference the v1 recon spine. Update both.

**Files:**
- Modify: `CLAUDE.md`

- [ ] Read the CLAUDE.md "Skill directories" section. Find the recon entry in the sub-files table. Confirm `skills/flow/from-recon.md` is listed (added in P3). If not, add it.

- [ ] Find the "Commands" section or any place the recon CLI commands are listed (search for `plan-judgment` or `ingest-judgment` in CLAUDE.md). Update the command list to reflect the v2 CLI:
  - Remove: `plan-judgment`, `ingest-judgment`
  - Keep: `run`, `status`, `churn-report`, `pull-issues`
  - Add (from P1–P3): `validate-findings`, `classify`, `next-slice`

- [ ] Find the recon skill description in the skill-directories table. Update it from the v1 mechanical-lens description to v2: "LLM-as-judge recurring sweep — applies enumerated criteria holistically to a directory slice, deduplicates findings against open GitHub issues, and files work worth doing as `/specify`-shaped issues. Scheduled via Routine. Never edits code."

- [ ] Note the `_shared/criteria-*.md` fragments under "Skills with sub-files" if they are listed as recon sub-files — they are shared fragments, not recon-specific. Confirm the sub-files table for `recon` lists only the actual files under `skills/recon/`.

- [ ] Grep-verify:
  ```bash
  grep -n 'plan-judgment\|ingest-judgment' CLAUDE.md
  ```
  Must return no hits.
  ```bash
  grep -n 'validate-findings\|classify\|next-slice' CLAUDE.md
  ```
  Must return hits.

- [ ] Commit: `Doc-sync CLAUDE.md for recon v2 — update CLI commands and skill description`

---

## Task 9: Doc-sync — README.md

README.md describes recon. Update the recon section to reflect the v2 LLM-judge model and Routine.

**Files:**
- Modify: `README.md`

- [ ] Search README.md for the recon section. Find any description of mechanical lenses as the primary spine (e.g., "oversized files, dead exports, TODO/FIXME") and replace with v2 framing: the LLM judges the code against a criteria catalog, calling deterministic tool checks as evidence.

- [ ] If README.md's recon description mentions `plan-judgment` or `ingest-judgment`, remove those references. Replace with the v2 workflow summary: SCOPE → CLASSIFY → JUDGE → validate-findings → file issues.

- [ ] If README.md has a "What's new" or changelog section, add a v5.0.0 entry: "Recon v2: LLM-as-judge, scheduled Routine, area-type routing, content-hash skip, hotspot priority. Removes v1 mechanical-lens spine and subagent dance."

- [ ] Grep-verify:
  ```bash
  grep -n 'plan-judgment\|ingest-judgment\|mechanical lens' README.md
  ```
  Must return no hits (or only hits in the "replaced by v2" context).

- [ ] Commit: `Update README for recon v2 — LLM-judge model, Routine, migration note`

---

## Task 10: Doc-sync — `skills/help/reference-card.md` and `skills/help/context-flow.md`

**Files:**
- Modify: `skills/help/reference-card.md`
- Modify: `skills/help/context-flow.md`

- [ ] In `skills/help/reference-card.md`, find the `/recon` row in the Utility table. Current text: "Proactive repo-improvement sweep — mechanical lenses, deduped GitHub issues, never edits code". Update to: "LLM-as-judge recurring sweep — applies criteria holistically to a directory slice, deduplicates against open GitHub issues, files pre-specs as GitHub issues. Scheduled Routine. Never edits code."

- [ ] Confirm the `/recon` row in reference-card.md's "Takes" column reflects v2 arguments: `--area <path>`, `--dry-run`, `--root <dir>`. These are unchanged; verify.

- [ ] In `skills/help/context-flow.md`, find the recon artifact-flow diagram at the top. Update the flow description to reflect the v2 pipeline: `judge → issues → /specify → /flow`. The current diagram already shows this direction; confirm the text below (the reads/writes table) matches:
  - `/recon` reads: codebase files (via LLM judge + optional tool assists), `.claude-tweaks/recon/cache.json`, `.claude-tweaks/recon/cursors.json`, `--issues <file>` (open issue index from `gh issue list`).
  - `/recon` writes: `.claude-tweaks/recon/cache.json`, `.claude-tweaks/recon/cursors.json` (per-area `lastHash` + `lastSweptMs`), `.claude-tweaks/recon/runs/` (run logs for churn tracking), GitHub issues via `gh issue create` (durable sink).

- [ ] Grep-verify:
  ```bash
  grep -n 'mechanical lens\|plan-judgment\|ingest-judgment' skills/help/reference-card.md skills/help/context-flow.md
  ```
  Must return no hits.

- [ ] Commit: `Doc-sync help reference-card and context-flow for recon v2`

---

## Task 11: Bump version to 5.0.0

The v2 recon changes the `bin/recon.js` public CLI (removes `plan-judgment` and `ingest-judgment` — a breaking change for any caller relying on the v1 subcommand API) and rewrites the SKILL's orchestration model (breaking for v1 Routine schedules configured to call `plan-judgment`). This warrants a major version bump.

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] Edit `.claude-plugin/plugin.json`: set `"version": "5.0.0"`. Update `"description"` to: "A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up. Includes an LLM-as-judge recurring recon sweep, browser automation, and QA pipeline."

- [ ] Grep-verify:
  ```bash
  grep '"version"' .claude-plugin/plugin.json
  ```
  Must return `"version": "5.0.0"`.

- [ ] Run: `node --test tests/` — full suite green.
- [ ] Commit: `Bump to 5.0.0 — breaking: removes plan-judgment/ingest-judgment CLI; v2 recon LLM-judge replaces v1 spine`

---

## Task 12: Final suite gate + marketplace follow-up note

**Files:**
- (none — verification only)

- [ ] Run the full suite one final time:
  ```bash
  node --test tests/
  ```
  All tests must pass. No skipped tests, no unexpected failures.

- [ ] Grep for any remaining v1 artifact references:
  ```bash
  grep -rn 'plan-judgment\|ingest-judgment\|buildWorkOrders\|JUDGMENT_LENS_MAP' bin/ skills/ CLAUDE.md README.md
  ```
  Must return no hits.

- [ ] Grep for any placeholder text (the plan itself must have zero placeholders):
  ```bash
  grep -rn 'TODO\|FIXME\|PLACEHOLDER\|TBD\|FILL_IN\|<your' bin/lib/recon/ skills/recon/ skills/flow/from-recon.md
  ```
  Recon-specific hits only — any hit in source files you modified in P4 must be investigated and resolved.

- [ ] **Marketplace follow-up (separate repo — required before next public install):** In `thomasholknielsen/claude-tweaks-marketplace`, edit `.claude-plugin/marketplace.json`:
  - Set `plugins[].version` to `"5.0.0"` (mirrors this plugin's version).
  - Set `plugins[].description` to match the updated `plugin.json` description.
  - `metadata.version` is the marketplace's own independent scheme — bump it on catalog changes (e.g., `2.x → 2.x+1`) but not in lockstep with the plugin. Note this as a required follow-up in the commit message.
  - Commit + push `main` on the marketplace repo.

- [ ] Commit: `P4 complete — suite green, v1 spine removed, docs synced. Marketplace mirror required.`

---

## Self-Review

### P4 spec coverage

| Design doc section | Coverage in this plan |
|--------------------|-----------------------|
| §10 Trigger / scheduling | Task 6 — `## Routine Configuration` section with schedule block, headless-run description, K-budget, neutral billing sentence |
| §10 Status/regression gating | Task 1 — `status-v2.test.js`; Task 5 confirms `cmdStatus` reads v2 cache; Task 6 adds `## Regression and Critical Gating` to SKILL.md |
| §10 Churn monitoring | Task 2 — `churn-v2.test.js`; Task 6 adds `## Fingerprint Churn` to SKILL.md |
| §11 v1→v2 migration — replace plan-judgment/ingest-judgment | Tasks 4 and 5 — delete `judgment.js` + test; remove from `bin/recon.js` |
| §11 v1→v2 migration — demote mechanical lenses | Task 5 — `buildLenses` returns `[]`; lenses files kept as optional tools |
| §11 v1→v2 migration — remove Judgment Lens Dispatch from SKILL | Task 6 — section deleted |
| §12 /flow --from-recon integration | Task 3 — pull-issues-v2 tests; Task 7 — from-recon.md updated for v2 label/body |
| §12 doc-sync: CLAUDE.md, README.md, /help, version, marketplace | Tasks 8–11 — CLAUDE.md, README.md, reference-card, context-flow, plugin.json; Task 12 — marketplace note |
| §13 P4 scope as stated | All tasks collectively |

### Placeholder scan

This plan contains no `TODO`, `FIXME`, `PLACEHOLDER`, `TBD`, `FILL_IN`, or `<your ...>` strings in code or commands. Test bodies are literal and complete. Every file path is absolute or repo-relative with no ambiguity.

### Consistency with the contract and P1–P3 signatures

- `fingerprint` — used in status-v2 and churn-v2 tests via the `recon-<8hex>` format; consistent with the contract's `fingerprint({criterion, areaId, anchor})` form (P2 extended fingerprint.js).
- `readCache`/`writeCache` — used in Task 1 fixture setup; canonical names per contract §cache.js.
- `recordRun(root, runId, { fingerprints, areasSwept, hashes })` — Task 2 uses the P3-extended three-field form; contract §cache.js defines this exact signature.
- `pullReconIssues({label, minSeverity, issuesJson})` — Task 3 tests call this exact signature per contract §pull-issues / P3.
- `cmdStatus` reads `f.status` and `f.severity` — fields written by `validate-findings` per contract §validate-finding.js and §The core data shape. No field drift introduced.
- `buildLenses()` returning `[]` — consistent with contract §"Greenfield migration (v2 replaces v1's spine): Demote lenses".
- `validate-findings`, `classify`, `next-slice` subcommands — added in P1–P3; referenced in Task 8 (CLAUDE.md update) and Task 6 (SKILL.md usage message). This plan does not implement them (they exist from prior phases).
- The neutral billing sentence is verbatim the form specified in the design doc §10 and the P4 scope statement: "Routines run inside the subscription; verify automation-credit specifics against the live account."
- `module.exports` cleanup in `bin/recon.js` — removes `cmdIngestJudgment` and `cmdPlanJudgment` from exports, consistent with contract §bin/recon.js which lists only the v2 commands.

### Cross-plan concerns

None. P1–P3 are complete before this plan executes. All contracts are stable. The marketplace mirror (Task 12) is a required follow-up in a separate repo — it is documented as a task step, not silently deferred.
