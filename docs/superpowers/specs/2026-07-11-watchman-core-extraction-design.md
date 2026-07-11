# watchman-core Extraction — Design

## Context

`bin/lib/code-health/`, `bin/lib/harness-health/`, and `bin/lib/journey-health/` each independently implement `cache.js`, `dedup.js`, `fingerprint.js`, `scope.js`, `score.js`, `validate-finding.js`, and `issue-payload.js`. This was an accepted convention at two engines; with journey-health as a third, it's a rule-of-three case for extraction — but only where the duplication is real, not just same-named.

Direct diffing of the three engines' current files (not assumption from naming) established which modules are genuinely duplicated vs. legitimately domain-specific:

| Module | Verdict | Evidence |
|---|---|---|
| `cache.js` — path/read/write primitives | **Identical 3-way** | `cachePath`/`readCache`/`writeCache`/`cursorsPath`/`readCursors`/`writeCursors`/`runsDir`/`readRuns` are byte-identical modulo the hardcoded skill-name string, across code-health, harness-health, journey-health. |
| `cache.js` — `recordAudit` / cursor shape | **Domain-specific, keep local** | Cursor fields differ per skill: harness-health tracks `lastAuditedSha`; journey-health tracks per-tier `lastLightAuditMs`/`lastDeepAuditMs` (merged, not overwritten); code-health has no `recordAudit` equivalent at all. |
| `cache.js` — `recordRun` / `computeChurn` | **Identical between harness-health & journey-health; code-health differs** | harness-health's and journey-health's versions are byte-identical (simple: persist fingerprints, done). code-health's `recordRun` also sweeps `areasSwept`/`hashes` into cursors as a side effect, and its `computeChurn` returns an extra `stayed` field — real behavior, not copy-paste noise. |
| `fingerprint.js` | **Identical logic, different field names, between harness-health & journey-health; code-health differs** | Both twins do `destructure → basis array → JSON.stringify → sha1(8 hex)`, differing only in which fields they destructure and their id prefix. code-health has a genuinely different v1/v2 dual-form (lens-based vs. LLM-judge criterion+anchor) that the other two never needed. |
| `dedup.js` | **Identical between harness-health & journey-health; code-health differs** | `decide()`'s function body is byte-for-byte identical between the twins (diff shows only comment wording). code-health's `decide()` is substantially different (~55 diff-lines against harness-health's ~36-line file). |
| `scope.js`, `score.js`, `validate-finding.js`, `issue-payload.js` | **Genuinely domain-specific everywhere** | These define what each skill scans, its Finding Shape, and its issue-text formatting — all legitimately different (40–90%+ diff-lines relative to file size). Not in scope for extraction. |

## Goal

Extract only the verified-identical logic into `bin/lib/_shared/watchman-core/`, with **zero changes to any call site outside `bin/lib/{code-health,harness-health,journey-health}/`** — every consuming skill's own `cache.js`/`fingerprint.js`/`dedup.js` keeps its current public API (same exported names, same signatures), so CLI files, SKILL.md references, and other tests are unaffected. This is an internal-only refactor; existing per-skill test suites, unmodified, are the regression bar.

## Components

### `bin/lib/_shared/watchman-core/cache.js`

```js
'use strict';
const fs = require('fs');
const path = require('path');

// Generic gitignored cache/cursor/runs persistence shared by the health
// watchmen (code-health, harness-health, journey-health). Each skill's own
// cache.js binds `skillName` once via createCache() and layers its own
// recordAudit()/cursor-shape logic on top — the shape of a cursor entry is
// domain-specific per skill; this module only owns where/how the JSON lives
// on disk.
function createCache(skillName) {
  function cachePath(root) { return path.join(root, '.claude-tweaks', skillName, 'cache.json'); }
  function readCache(root) {
    try { return JSON.parse(fs.readFileSync(cachePath(root), 'utf8')); }
    catch { return {}; }
  }
  function writeCache(root, cache) {
    const p = cachePath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
    return p;
  }
  function cursorsPath(root) { return path.join(root, '.claude-tweaks', skillName, 'cursors.json'); }
  function readCursors(root) {
    try { return JSON.parse(fs.readFileSync(cursorsPath(root), 'utf8')); }
    catch { return {}; }
  }
  function writeCursors(root, cursors) {
    const p = cursorsPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cursors, null, 2) + '\n', 'utf8');
    return p;
  }
  function runsDir(root) { return path.join(root, '.claude-tweaks', skillName, 'runs'); }
  function readRuns(root) {
    let entries;
    try { entries = fs.readdirSync(runsDir(root)); }
    catch { return []; }
    return entries
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(runsDir(root), f), 'utf8')); }
        catch { return null; }
      })
      .filter((r) => r && Array.isArray(r.fingerprints) && r.runId)
      .sort((a, b) => ((a.runAt || '') < (b.runAt || '') ? -1 : 1));
  }
  return { cachePath, readCache, writeCache, cursorsPath, readCursors, writeCursors, runsDir, readRuns };
}

module.exports = { createCache };
```

### `bin/lib/_shared/watchman-core/runs.js`

```js
'use strict';
const fs = require('fs');
const path = require('path');

// Simple run-record persistence + churn calc, shared by harness-health and
// journey-health (byte-identical between the two today). code-health keeps
// its own recordRun/computeChurn locally — its recordRun also sweeps
// area cursors as a side effect, and its computeChurn returns an extra
// `stayed` field, neither of which the other two skills have.
function recordRun(runsDir, runId, fingerprints) {
  fs.mkdirSync(runsDir, { recursive: true });
  const record = { runId, runAt: new Date().toISOString(), fingerprints: [...fingerprints] };
  fs.writeFileSync(path.join(runsDir, `${runId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return record;
}

// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);
  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const ratio = Math.round(((appeared.length + disappeared.length) / total) * 1000) / 1000;
  return { appeared, disappeared, ratio };
}

module.exports = { recordRun, computeChurn };
```

Note: `recordRun` here takes `runsDir` directly (not `root`) so it composes with `createCache(skillName).runsDir(root)` without re-deriving the path.

### `bin/lib/_shared/watchman-core/fingerprint.js`

```js
'use strict';
const crypto = require('crypto');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeText(s) {
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Stable id from a prefix + ordered basis array. Each skill's own
// fingerprint.js maps its named finding fields onto a basis array in a
// fixed order and supplies its own id prefix.
function fingerprintFromBasis(prefix, basis) {
  const hash = crypto.createHash('sha1').update(JSON.stringify(basis)).digest('hex').slice(0, 8);
  return `${prefix}-${hash}`;
}

module.exports = { normalizeText, fingerprintFromBasis };
```

### `bin/lib/_shared/watchman-core/dedup.js`

Verbatim current `decide()` body (unchanged logic, generalized comments):

```js
'use strict';

// Decide what to do with a freshly-fingerprinted finding given the current
// issue index and local cache. Pure — no I/O, no network.
//
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built by the calling skill from `gh issue list --label <skill>` output —
//   the engine never calls network.
//
// Decision logic:
//   open issue match           -> skip      (already filed, don't re-file)
//   wontfix-labelled issue     -> suppress  (standing decision — never re-propose)
//   closed non-wontfix match   -> skip      (assume resolved)
//   'declined' in local cache  -> suppress  (user rejected this exact finding)
//   'staged' in local cache    -> skip      (already filed, unresolved)
//   otherwise                  -> file
function decide(finding, issueIndex, cache) {
  const fp = finding.id;
  const match = issueIndex && fp && issueIndex[fp];
  if (match) {
    if ((match.labels || []).includes('wontfix')) return { action: 'suppress', issue: match.number };
    return { action: 'skip', issue: match.number };
  }
  const cached = cache && fp && cache[fp];
  if (cached && cached.status === 'declined') return { action: 'suppress' };
  if (cached && cached.status === 'staged') return { action: 'skip' };
  return { action: 'file' };
}

module.exports = { decide };
```

### Per-skill files after refactor

**`code-health/cache.js`** — thin: `createCache('code-health')`, plus its own local `recordRun`/`computeChurn` (unchanged, since these carry real extra behavior).

**`harness-health/cache.js`** — thin: `createCache('harness-health')`, plus its own local `recordAudit`/`readGapScanCursor`/`recordGapScan` (cursor shape stays domain-specific), plus `recordRun`/`computeChurn` from `watchman-core/runs.js` bound to its own `runsDir(root)`.

**`journey-health/cache.js`** — same shape: `createCache('journey-health')`, its own `recordAudit`(tier-merging)/`readCoverageScanCursor`/`recordCoverageScan`, plus `recordRun`/`computeChurn` from `watchman-core/runs.js`.

**`harness-health/fingerprint.js`**:
```js
'use strict';
const { normalizeText, fingerprintFromBasis } = require('../_shared/watchman-core/fingerprint');

function normalizeDescription(description) { return normalizeText(description); }

function fingerprint({ assetType, target, section, description }) {
  return fingerprintFromBasis('harnesshealth', [assetType, target, section, normalizeDescription(description)]);
}

module.exports = { fingerprint, normalizeDescription };
```

**`journey-health/fingerprint.js`**:
```js
'use strict';
const { normalizeText, fingerprintFromBasis } = require('../_shared/watchman-core/fingerprint');

function normalizeDescription(description) { return normalizeText(description); }

function fingerprint({ journey, category, section, description }) {
  return fingerprintFromBasis('journeyhealth', [journey, category, section, normalizeDescription(description)]);
}

module.exports = { fingerprint, normalizeDescription };
```

**`harness-health/dedup.js`** and **`journey-health/dedup.js`** — one-line re-export:
```js
'use strict';
module.exports = require('../_shared/watchman-core/dedup');
```

`code-health/fingerprint.js` and `code-health/dedup.js` are **not touched** — they stay exactly as they are.

## Testing

- Existing test suites (`cache.test.js`, `dedup.test.js`, `fingerprint.test.js` under each skill's `tests/`) must pass **unmodified** — they exercise the public API surface, which does not change. This is the primary regression check.
- New tests: `bin/lib/_shared/watchman-core/tests/{cache,runs,fingerprint,dedup}.test.js`, covering the factory and pure functions directly.
- `package.json`'s `test` script gains one glob: `bin/lib/_shared/watchman-core/tests/*.test.js`.

## Out of scope

- `scope.js`, `score.js`, `validate-finding.js`, `issue-payload.js` for all three skills — confirmed domain-specific, not touched.
- `code-health/fingerprint.js`, `code-health/dedup.js`, `code-health/cache.js`'s `recordRun`/`computeChurn` — real behavior differences, not touched.
- No public API changes anywhere; no CLI, SKILL.md, or cross-reference updates needed.

## Risk

Low. Internal-only restructuring behind unchanged public APIs, with existing test suites as the safety net. The only new code is the `watchman-core` module itself and its own tests.
