# Recon v2 Phase 2: Area Routing, Domain Criteria & Tool-Assists — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: before executing this plan, load and follow `superpowers:subagent-driven-development`. Each numbered Task below is one independent unit — write the failing test first, run it and confirm it fails for the stated reason, write the minimal implementation, run it and confirm it passes, then commit with the exact message given. Do not batch tasks; do not skip the red step. All code is real — there are no placeholders to fill in.

**Goal:** Extend the Recon v2 judge loop with area-type detection (`area-type.js`), a full domain-criteria catalog (`criteria.js`), a confidence-floor gate in `validate-findings`, shared criteria fragments for all new criteria, and updated SKILL.md steps for CLASSIFY, tool-assists, and the verify gate. By the end of P2 the judge selects the right lenses for the detected area type, noisy criteria are gated at high confidence, and tool invocations ground the judgment without dumping raw output into the tracker.

**Architecture:** P1 created the core judge loop: `criteria.js` (universal core + `criteriaForArea`/`getCriterion`), `validate-finding.js` (v2 Finding shape), `fingerprint.js` (v2 `criterion+areaId+anchor` form), and rewrote `skills/recon/SKILL.md` to drive the judge through SCOPE → JUDGE → validate-findings → gh. P2 adds the missing routing layer before JUDGE: a new `area-type.js` helper (`classifyArea`), the domain criteria rows in `criteria.js`, and the confidence-floor gate in the `validate-findings` CLI command. The SKILL.md gains a CLASSIFY step, a tools-as-assists section, and the verify gate. The verify gate is an LLM step — Claude re-checks each surviving finding before filing; it is documented in the SKILL and enforced by an anti-pattern, not a unit test.

**Tech Stack:** Node 18+ built-ins only (`fs`, `path`, `crypto`, `child_process`). Zero external dependencies. Tests via the built-in `node --test` runner. CommonJS (`require`/`module.exports`) to match `bin/lib/recon/` style.

---

> **Canonical interface:** All API signatures, Finding shape, and label/marker constants live in `docs/superpowers/plans/2026-06-15-recon-v2-interface-contract.md`. Where this plan's inline code disagrees, the contract wins.

---

## File Structure

| Path | Responsibility | Status |
|------|----------------|--------|
| `bin/lib/recon/area-type.js` | `classifyArea(absDir, root) -> { types: string[] }` — signal-file detection | **new** |
| `bin/lib/recon/tests/area-type.test.js` | Unit tests for every area type + multi-type + unknown | **new** |
| `bin/lib/recon/criteria.js` | Full catalog: universal core (P1) + domain criteria with `appliesTo`/`confidenceFloor`; `criteriaForArea`/`getCriterion` | **extend** (P1 created; P2 adds domain rows) |
| `bin/lib/recon/tests/criteria.test.js` | Tests for domain rows, `criteriaForArea` filtering, `confidenceFloor` presence, unknown types | **extend** |
| `bin/recon.js` | Add `classify` CLI command; extend `validate-findings` with confidence-floor gate | **extend** |
| `bin/lib/recon/tests/cli-validate-findings.test.js` | Tests for confidence-floor drop in `validate-findings` | **extend** |
| `skills/_shared/criteria-resilience.md` | Resilience / fault-tolerance fragment | **new** |
| `skills/_shared/criteria-observability.md` | Observability fragment | **new** |
| `skills/_shared/criteria-security-logic.md` | Security-logic (logic-level, not static) fragment | **new** |
| `skills/_shared/criteria-scalability.md` | Scalability fragment | **new** |
| `skills/_shared/criteria-a11y.md` | Accessibility fragment (frontend/UI domain) | **new** |
| `skills/_shared/criteria-i18n.md` | Internationalization fragment (user-facing domain) | **new** |
| `skills/_shared/criteria-api-stability.md` | API/contract stability fragment (library/backend domain) | **new** |
| `skills/_shared/criteria-migration-safety.md` | Data/migration safety fragment (data domain) | **new** |
| `skills/_shared/criteria-iac-security.md` | IaC security & hygiene fragment (infra domain) | **new** |
| `skills/_shared/criteria-privacy-pii.md` | Privacy/PII handling fragment (user-data domain) | **new** |
| `skills/_shared/criteria-concurrency.md` | Concurrency safety fragment (async/shared-state domain) | **new** |
| `skills/recon/SKILL.md` | Add CLASSIFY step; tools-as-assists section; verify gate before filing | **extend** |

---

## Task 1 — `area-type.js`: signal-file area classifier

`classifyArea(absDir, root)` inspects the directory at `absDir` and returns `{ types: string[] }`. Types are additive: a directory can be `['frontend', 'library']` simultaneously. Unknown → `[]`. Detection is best-effort — missing signal files are not errors. No network calls. The function reads `package.json` in the given dir only (not a full recursive walk) for dep/config signals, then checks for a small number of structural indicators.

Detection rules (from the contract §area-type.js):

| Signal | Type |
|--------|------|
| `react`, `vue`, `svelte`, `@angular/core`, `@angular/platform-browser` in `dependencies`/`devDependencies`; or `.jsx`/`.tsx`/`.vue` files present at top level; or a `components/` subdir | `frontend` |
| `express`, `fastify`, `@nestjs/core`, `koa`, `hapi`, `flask`, `django`, `gin`, `fiber`, `echo` in deps; no UI framework dep | `backend` |
| `exports` or `publishConfig` key in `package.json`; or both `main` and `types` keys | `library` |
| `*.tf` file, `Dockerfile`, `k8s/` or `helm/` subdir, `*.bicep` file | `infra` |
| `migrations/` subdir; `*.sql` file at top level; ORM schema files (`prisma/schema.prisma`, `drizzle.config.*`, `sequelize`, `typeorm` in deps) | `data` |
| `bin` field in `package.json`; shebang (`#!/usr/bin/env`) in a `.js`/`.ts` file at top level | `cli` |
| `>=80%` of files at top level are `.md` or `.mdx` | `docs` |

**Files:**
- Create: `bin/lib/recon/area-type.js`
- Create: `bin/lib/recon/tests/area-type.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/area-type.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyArea } = require('../area-type');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-at-')); }

test('unknown dir with no signals returns empty types', () => {
  const d = tmp();
  assert.deepStrictEqual(classifyArea(d, d), { types: [] });
});

test('detects frontend from react in package.json dependencies', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('frontend'), `types: ${types}`);
});

test('detects frontend from .tsx files at top level', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'App.tsx'), '');
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('frontend'), `types: ${types}`);
});

test('detects frontend from components/ subdir', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'components'));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('frontend'), `types: ${types}`);
});

test('detects backend from express in deps (no UI dep)', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ dependencies: { express: '^4.18.0' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('backend'), `types: ${types}`);
  assert.ok(!types.includes('frontend'), `should not be frontend: ${types}`);
});

test('detects library from exports key in package.json', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ exports: { '.': './index.js' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('library'), `types: ${types}`);
});

test('detects library from main+types keys', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ main: './index.js', types: './index.d.ts' }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('library'), `types: ${types}`);
});

test('detects infra from Dockerfile', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'Dockerfile'), 'FROM node:18\n');
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('infra'), `types: ${types}`);
});

test('detects infra from .tf file', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'main.tf'), 'resource "aws_s3_bucket" "b" {}\n');
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('infra'), `types: ${types}`);
});

test('detects infra from k8s/ subdir', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'k8s'));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('infra'), `types: ${types}`);
});

test('detects data from migrations/ subdir', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'migrations'));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('data'), `types: ${types}`);
});

test('detects data from prisma schema', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'prisma'));
  fs.writeFileSync(path.join(d, 'prisma', 'schema.prisma'), 'generator client {}\n');
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('data'), `types: ${types}`);
});

test('detects data from sequelize in deps', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ dependencies: { sequelize: '^6.0.0' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('data'), `types: ${types}`);
});

test('detects cli from bin field in package.json', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ bin: { mytool: './cli.js' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('cli'), `types: ${types}`);
});

test('detects cli from shebang in .js file', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'cli.js'), '#!/usr/bin/env node\nconsole.log("hi");\n');
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('cli'), `types: ${types}`);
});

test('detects docs when >=80% of top-level files are .md', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'README.md'), '');
  fs.writeFileSync(path.join(d, 'GUIDE.md'), '');
  fs.writeFileSync(path.join(d, 'CONTRIBUTING.md'), '');
  fs.writeFileSync(path.join(d, 'one.js'), '');
  // 3 md / 4 total = 75% — NOT docs
  const { types: below } = classifyArea(d, d);
  assert.ok(!below.includes('docs'), `should not be docs at 75%: ${below}`);
  fs.writeFileSync(path.join(d, 'EXTRA.md'), '');
  // 4 md / 5 total = 80% — IS docs
  const { types: at } = classifyArea(d, d);
  assert.ok(at.includes('docs'), `should be docs at 80%: ${at}`);
});

test('types are additive: frontend+library from react+exports', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ dependencies: { react: '^18.0.0' }, exports: { '.': './index.js' } }));
  const { types } = classifyArea(d, d);
  assert.ok(types.includes('frontend'), `types: ${types}`);
  assert.ok(types.includes('library'), `types: ${types}`);
});
```

- [ ] Run it and confirm it fails: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && node --test bin/lib/recon/tests/area-type.test.js`
      Expected: `Error: Cannot find module '../area-type'`

- [ ] Write the minimal implementation `bin/lib/recon/area-type.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');

const UI_FRAMEWORKS = new Set([
  'react', 'vue', 'svelte', '@angular/core', '@angular/platform-browser',
  'next', 'nuxt', '@sveltejs/kit', 'solid-js', 'preact',
]);
const SERVER_FRAMEWORKS = new Set([
  'express', 'fastify', '@nestjs/core', 'koa', 'hapi', '@hapi/hapi',
  'restify', 'polka', 'micro', 'flask', 'django', 'gin', 'fiber', 'echo',
]);
const ORM_DEPS = new Set([
  'sequelize', 'typeorm', 'prisma', '@prisma/client', 'drizzle-orm',
  'knex', 'mongoose', 'pg', 'mysql2', 'better-sqlite3',
]);

function readPackageJson(absDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(absDir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function allDeps(pkg) {
  if (!pkg) return new Set();
  const s = new Set();
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const k of Object.keys(pkg[section] || {})) s.add(k);
  }
  return s;
}

function dirEntries(absDir) {
  try {
    return fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// Returns true when `name` is a subdir of absDir.
function hasSubdir(absDir, name) {
  try {
    return fs.statSync(path.join(absDir, name)).isDirectory();
  } catch {
    return false;
  }
}

// Returns true when at least one file at the top level of absDir matches the predicate.
function hasTopLevelFile(entries, pred) {
  return entries.some((e) => e.isFile() && pred(e.name));
}

function classifyArea(absDir, _root) {
  const pkg = readPackageJson(absDir);
  const deps = allDeps(pkg);
  const entries = dirEntries(absDir);
  const types = [];

  // --- frontend ---
  const hasFrontendDep = [...UI_FRAMEWORKS].some((f) => deps.has(f));
  const hasFrontendExt = hasTopLevelFile(entries, (n) => /\.(jsx|tsx|vue)$/.test(n));
  const hasComponents = hasSubdir(absDir, 'components');
  if (hasFrontendDep || hasFrontendExt || hasComponents) types.push('frontend');

  // --- backend --- (server framework present, no UI framework in deps)
  const hasServerDep = [...SERVER_FRAMEWORKS].some((f) => deps.has(f));
  if (hasServerDep && !hasFrontendDep) types.push('backend');

  // --- library ---
  if (pkg && (pkg.exports != null || pkg.publishConfig != null ||
      (pkg.main != null && pkg.types != null))) {
    types.push('library');
  }

  // --- infra ---
  const hasTfFile = hasTopLevelFile(entries, (n) => n.endsWith('.tf'));
  const hasBicep = hasTopLevelFile(entries, (n) => n.endsWith('.bicep'));
  const hasDockerfile = hasTopLevelFile(entries, (n) => n === 'Dockerfile' || n.startsWith('Dockerfile.'));
  const hasK8s = hasSubdir(absDir, 'k8s') || hasSubdir(absDir, 'helm');
  if (hasTfFile || hasBicep || hasDockerfile || hasK8s) types.push('infra');

  // --- data ---
  const hasMigrations = hasSubdir(absDir, 'migrations');
  const hasSqlFile = hasTopLevelFile(entries, (n) => n.endsWith('.sql'));
  const hasPrismaSchema = (() => {
    try {
      return fs.statSync(path.join(absDir, 'prisma', 'schema.prisma')).isFile();
    } catch { return false; }
  })();
  const hasDrizzle = hasTopLevelFile(entries, (n) => /^drizzle\.config\./.test(n));
  const hasOrmDep = [...ORM_DEPS].some((d) => deps.has(d));
  if (hasMigrations || hasSqlFile || hasPrismaSchema || hasDrizzle || hasOrmDep) types.push('data');

  // --- cli ---
  const hasBinField = pkg && pkg.bin != null;
  const hasShebang = hasTopLevelFile(entries, (n) => {
    if (!/\.(js|ts|mjs|cjs)$/.test(n)) return false;
    try {
      const head = fs.readFileSync(path.join(absDir, n), 'utf8').slice(0, 30);
      return head.startsWith('#!/');
    } catch { return false; }
  });
  if (hasBinField || hasShebang) types.push('cli');

  // --- docs ---
  const fileEntries = entries.filter((e) => e.isFile());
  if (fileEntries.length > 0) {
    const mdCount = fileEntries.filter((e) => /\.mdx?$/.test(e.name)).length;
    if (mdCount / fileEntries.length >= 0.8) types.push('docs');
  }

  return { types };
}

module.exports = { classifyArea };
```

- [ ] Run it and confirm it passes: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && node --test bin/lib/recon/tests/area-type.test.js`
      Expected: `# pass 18  # fail 0`

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add bin/lib/recon/area-type.js bin/lib/recon/tests/area-type.test.js && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add recon area-type classifier (classifyArea, signal-file based)"`

---

## Task 2 — Extend `criteria.js`: add domain criteria with `appliesTo` and `confidenceFloor`

P1 created `bin/lib/recon/criteria.js` with the universal core and `criteriaForArea`/`getCriterion`. P2 adds the seven domain criteria rows. The test file from P1 already covers the universal core; extend it here to cover the domain rows and the filtering logic.

Each criterion in the catalog has:
```js
{
  id,             // enumerated lens id (string)
  appliesTo,      // 'universal' | string[]  (area type names it applies to)
  fragment,       // optional: path under skills/_shared/ (relative, no leading slash)
  confidenceFloor // 'low' | 'med' | 'high' — minimum confidence to file
                  // 'high' for noisy criteria (a11y, privacy-pii, performance in review-quality)
}
```

`criteriaForArea(types)` returns all universal criteria plus any domain criteria whose `appliesTo` array intersects `types`. If `types` is empty, returns universal-only.

Domain criteria to add (per contract + design §6):

| id | appliesTo | confidenceFloor | fragment |
|----|-----------|-----------------|---------|
| `a11y` | `['frontend']` | `'high'` | `criteria-a11y.md` |
| `i18n` | `['frontend', 'backend']` | `'med'` | `criteria-i18n.md` |
| `api-stability` | `['library', 'backend']` | `'med'` | `criteria-api-stability.md` |
| `migration-safety` | `['data']` | `'high'` | `criteria-migration-safety.md` |
| `iac-security` | `['infra']` | `'high'` | `criteria-iac-security.md` |
| `privacy-pii` | `['frontend', 'backend', 'data']` | `'high'` | `criteria-privacy-pii.md` |
| `concurrency` | `['backend', 'cli', 'data']` | `'med'` | `criteria-concurrency.md` |

The universal criteria added in P1 already have `confidenceFloor`; confirm they are set (most `'med'`, `resilience`/`observability`/`config-secrets`/`input-validation`/`naming-clarity` at `'med'`; `security-logic` at `'high'`; `bad-practice`/`doc-freshness`/`dead-code`/`test-quality`/`scalability`/`dependency-health`/`simplification`/`review-quality`/`architecture-depth` at `'med'`). The existing P1 tests will catch any regression.

**Files:**
- Extend: `bin/lib/recon/criteria.js`
- Extend: `bin/lib/recon/tests/criteria.test.js`

Steps:

- [ ] Extend `bin/lib/recon/tests/criteria.test.js` — append these tests to the existing file:

```js
// P2 — domain criteria and area filtering

test('domain criterion a11y is returned for frontend areas', () => {
  const results = criteriaForArea(['frontend']);
  assert.ok(results.some((c) => c.id === 'a11y'), 'a11y must appear for frontend');
});

test('domain criterion a11y is NOT returned for backend-only areas', () => {
  const results = criteriaForArea(['backend']);
  assert.ok(!results.some((c) => c.id === 'a11y'), 'a11y must not appear for backend');
});

test('domain criterion api-stability appears for library and backend', () => {
  const libResults = criteriaForArea(['library']);
  assert.ok(libResults.some((c) => c.id === 'api-stability'), 'api-stability must appear for library');
  const beResults = criteriaForArea(['backend']);
  assert.ok(beResults.some((c) => c.id === 'api-stability'), 'api-stability must appear for backend');
});

test('domain criterion migration-safety appears only for data areas', () => {
  assert.ok(criteriaForArea(['data']).some((c) => c.id === 'migration-safety'));
  assert.ok(!criteriaForArea(['frontend']).some((c) => c.id === 'migration-safety'));
});

test('domain criterion iac-security appears only for infra areas', () => {
  assert.ok(criteriaForArea(['infra']).some((c) => c.id === 'iac-security'));
  assert.ok(!criteriaForArea(['backend']).some((c) => c.id === 'iac-security'));
});

test('domain criterion privacy-pii appears for frontend, backend, and data', () => {
  for (const t of ['frontend', 'backend', 'data']) {
    assert.ok(criteriaForArea([t]).some((c) => c.id === 'privacy-pii'),
      `privacy-pii must appear for ${t}`);
  }
  assert.ok(!criteriaForArea(['infra']).some((c) => c.id === 'privacy-pii'));
});

test('domain criterion concurrency appears for backend, cli, and data', () => {
  for (const t of ['backend', 'cli', 'data']) {
    assert.ok(criteriaForArea([t]).some((c) => c.id === 'concurrency'),
      `concurrency must appear for ${t}`);
  }
  assert.ok(!criteriaForArea(['frontend']).some((c) => c.id === 'concurrency'));
});

test('criteriaForArea with empty types returns universal-only (no domain criteria)', () => {
  const universalIds = CRITERIA.filter((c) => c.appliesTo === 'universal').map((c) => c.id);
  const results = criteriaForArea([]);
  const resultIds = results.map((c) => c.id);
  assert.deepStrictEqual(resultIds.sort(), universalIds.sort());
});

test('multi-type area gets union of universal + all matching domain criteria', () => {
  // frontend+library => a11y + api-stability both appear
  const results = criteriaForArea(['frontend', 'library']);
  assert.ok(results.some((c) => c.id === 'a11y'));
  assert.ok(results.some((c) => c.id === 'api-stability'));
  // No duplicates
  const ids = results.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'no duplicate criteria in result');
});

test('each domain criterion has a confidenceFloor', () => {
  const domainIds = ['a11y', 'i18n', 'api-stability', 'migration-safety', 'iac-security', 'privacy-pii', 'concurrency'];
  for (const id of domainIds) {
    const c = getCriterion(id);
    assert.ok(c, `getCriterion('${id}') must return a criterion`);
    assert.ok(['low', 'med', 'high'].includes(c.confidenceFloor),
      `${id}.confidenceFloor must be 'low'|'med'|'high', got ${c.confidenceFloor}`);
  }
});

test('noisy criteria a11y, iac-security, migration-safety, privacy-pii have confidenceFloor high', () => {
  for (const id of ['a11y', 'iac-security', 'migration-safety', 'privacy-pii']) {
    const c = getCriterion(id);
    assert.strictEqual(c.confidenceFloor, 'high', `${id}.confidenceFloor must be 'high'`);
  }
});

test('security-logic universal criterion has confidenceFloor high', () => {
  const c = getCriterion('security-logic');
  assert.strictEqual(c.confidenceFloor, 'high');
});
```

- [ ] Run the tests and confirm the new ones fail: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && node --test bin/lib/recon/tests/criteria.test.js`
      Expected: the P1 tests pass, the new domain tests fail with `a11y must appear for frontend` or similar.

- [ ] Open `bin/lib/recon/criteria.js` and append the seven domain criteria to the `CRITERIA` array (after the universal core rows). Each entry exactly:

```js
// Domain: a11y → frontend
{ id: 'a11y', appliesTo: ['frontend'], confidenceFloor: 'high',
  fragment: 'skills/_shared/criteria-a11y.md' },
// Domain: i18n → frontend + backend (user-facing apps)
{ id: 'i18n', appliesTo: ['frontend', 'backend'], confidenceFloor: 'med',
  fragment: 'skills/_shared/criteria-i18n.md' },
// Domain: api-stability → library + backend
{ id: 'api-stability', appliesTo: ['library', 'backend'], confidenceFloor: 'med',
  fragment: 'skills/_shared/criteria-api-stability.md' },
// Domain: migration-safety → data
{ id: 'migration-safety', appliesTo: ['data'], confidenceFloor: 'high',
  fragment: 'skills/_shared/criteria-migration-safety.md' },
// Domain: iac-security → infra
{ id: 'iac-security', appliesTo: ['infra'], confidenceFloor: 'high',
  fragment: 'skills/_shared/criteria-iac-security.md' },
// Domain: privacy-pii → user-data areas (frontend, backend, data)
{ id: 'privacy-pii', appliesTo: ['frontend', 'backend', 'data'], confidenceFloor: 'high',
  fragment: 'skills/_shared/criteria-privacy-pii.md' },
// Domain: concurrency → async/shared-state (backend, cli, data)
{ id: 'concurrency', appliesTo: ['backend', 'cli', 'data'], confidenceFloor: 'med',
  fragment: 'skills/_shared/criteria-concurrency.md' },
```

Also verify that the universal `security-logic` criterion already has `confidenceFloor: 'high'` (set in P1). If it does not, update it now.

- [ ] Run the tests and confirm all pass: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && node --test bin/lib/recon/tests/criteria.test.js`
      Expected: all tests pass, including the new P2 domain tests.

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add bin/lib/recon/criteria.js bin/lib/recon/tests/criteria.test.js && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Extend criteria.js with domain criteria (a11y, i18n, api-stability, migration-safety, iac-security, privacy-pii, concurrency)"`

---

## Task 3 — Confidence-floor gate in `validate-findings` CLI command

The `validate-findings` CLI command (added in P1 to `bin/recon.js`) validates the judge's JSON output, fingerprints survivors, runs dedup, and emits `gh`-ready payloads. P2 adds a **confidence-floor gate**: before fingerprinting, drop any finding whose `confidence` is below the criterion's `confidenceFloor`. The drop is logged to stderr with a reason.

Confidence order for comparison: `high > med > low`. A finding passes the gate when its `confidence` is equal to or higher than `confidenceFloor`. A finding with `confidence: 'med'` passes when `confidenceFloor` is `'med'` or `'low'`; it is dropped when `confidenceFloor` is `'high'`.

**Files:**
- Extend: `bin/recon.js` — inside `cmdValidateFindings`, add the floor gate after `validateFinding` succeeds, before `fingerprint`
- Extend: `bin/lib/recon/tests/cli-validate-findings.test.js` — append floor-gate tests

Steps:

- [ ] Append the following tests to `bin/lib/recon/tests/cli-validate-findings.test.js` (if the file does not exist yet from P1, create it as a new file with the standard header and just these tests):

```js
'use strict';
// P2 additions: confidence-floor gate
const { test } = require('node:test');
const assert = require('node:assert');
const { applyConfidenceFloor } = require('../../recon'); // exported in P2

test('applyConfidenceFloor passes a high-confidence finding for a high-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'high' }, 'high');
  assert.strictEqual(result.pass, true);
});

test('applyConfidenceFloor drops a med-confidence finding for a high-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'med' }, 'high');
  assert.strictEqual(result.pass, false);
  assert.ok(result.reason.includes('below floor'));
});

test('applyConfidenceFloor drops a low-confidence finding for a med-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'low' }, 'med');
  assert.strictEqual(result.pass, false);
});

test('applyConfidenceFloor passes a low-confidence finding for a low-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'low' }, 'low');
  assert.strictEqual(result.pass, true);
});

test('applyConfidenceFloor passes when criterionFloor is undefined (no floor set)', () => {
  const result = applyConfidenceFloor({ confidence: 'low' }, undefined);
  assert.strictEqual(result.pass, true);
});
```

- [ ] Run it and confirm the new tests fail: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && node --test bin/lib/recon/tests/cli-validate-findings.test.js`
      Expected: `Cannot find module '../../recon'` or `applyConfidenceFloor is not a function`.

- [ ] In `bin/recon.js`, add the `applyConfidenceFloor` helper and wire it into `cmdValidateFindings`. Add the helper at module scope (near top with other helpers):

```js
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
```

In `cmdValidateFindings`, after `validateFinding(f)` returns `ok: true`, add the floor gate before fingerprinting:

```js
const crit = getCriterion(v.value.criterion);
const floorResult = applyConfidenceFloor(v.value, crit && crit.confidenceFloor);
if (!floorResult.pass) {
  process.stderr.write(`[recon] validate-findings: dropped "${v.value.title}" — ${floorResult.reason}\n`);
  continue;
}
```

Also add `const { getCriterion } = require('./lib/recon/criteria');` at the top of `bin/recon.js` (alongside the existing requires).

Export `applyConfidenceFloor` at the bottom of the file's `module.exports` so the test can import it:
```js
module.exports = { ..., applyConfidenceFloor };
```

- [ ] Run the tests and confirm all pass: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && node --test bin/lib/recon/tests/cli-validate-findings.test.js`
      Expected: `# pass 5  # fail 0`

- [ ] Run the full test suite to confirm no regressions: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && node --test bin/lib/recon/tests/`
      Expected: all tests pass.

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add bin/recon.js bin/lib/recon/tests/cli-validate-findings.test.js && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add confidence-floor gate to validate-findings CLI command"`

---

## Task 4 — `classify` CLI command in `bin/recon.js`

Add a `classify` subcommand that detects the area type for a given directory and prints the result as JSON to stdout. Zero-network. Used by the SKILL in the CLASSIFY step.

Interface (from contract §bin/recon.js):
```
classify --root <dir> [--area <dir>]
```
- `--root` defaults to `process.cwd()`.
- `--area` specifies the area path relative to root. When omitted, classify the root itself.
- Output: `{ areaId, types }` as JSON on stdout. Always exits 0 (classify is best-effort).

**Files:**
- Extend: `bin/recon.js` — add `cmdClassify` function, wire into `main`
- Extend: `bin/lib/recon/tests/area-type.test.js` — add a CLI smoke test using `child_process.execFileSync`

Steps:

- [ ] Append the following CLI smoke test to `bin/lib/recon/tests/area-type.test.js`:

```js
const { execFileSync } = require('child_process');

test('classify CLI command prints { areaId, types } JSON for a frontend dir', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'),
    JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  const out = execFileSync(
    process.execPath,
    [
      '/Users/thomasholknielsen/Code Workspaces/claude-tweaks/bin/recon.js',
      'classify',
      '--root', d,
      '--area', '.',
    ],
    { encoding: 'utf8' },
  );
  const result = JSON.parse(out);
  assert.strictEqual(result.areaId, '.');
  assert.ok(Array.isArray(result.types));
  assert.ok(result.types.includes('frontend'), `types: ${result.types}`);
});
```

- [ ] Run it and confirm it fails: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && node --test bin/lib/recon/tests/area-type.test.js`
      Expected: the existing tests still pass; the new CLI test fails because `classify` exits with a usage error.

- [ ] Add `cmdClassify` to `bin/recon.js` and wire it into `main`:

```js
function cmdClassify(args) {
  const root = args.root || process.cwd();
  const areaPath = args.area || '.';
  const absDir = require('path').resolve(root, areaPath);
  const { classifyArea } = require('./lib/recon/area-type');
  const { types } = classifyArea(absDir, root);
  process.stdout.write(JSON.stringify({ areaId: areaPath, types }, null, 2) + '\n');
}
```

In `main`, add before the usage error:
```js
if (cmd === 'classify') return cmdClassify(args);
```

- [ ] Run the tests and confirm all pass: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && node --test bin/lib/recon/tests/area-type.test.js`
      Expected: all tests pass including the CLI smoke test.

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add bin/recon.js bin/lib/recon/tests/area-type.test.js && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add classify CLI command to recon.js (prints area types as JSON)"`

---

## Task 5 — Criteria fragments: universal additions

Write the four universal criteria fragments that were added in P1 (resilience, observability, security-logic, scalability) but not yet given a dedicated `skills/_shared/criteria-*.md` file. These are the fragments referenced in `criteria.js` via the `fragment` field. Each is a criteria-only file — no workflow, no Next Actions, no routing.

**Files:**
- Create: `skills/_shared/criteria-resilience.md`
- Create: `skills/_shared/criteria-observability.md`
- Create: `skills/_shared/criteria-security-logic.md`
- Create: `skills/_shared/criteria-scalability.md`

Steps:

- [ ] Write `skills/_shared/criteria-resilience.md`:

```markdown
# Criteria: Resilience / Fault-Tolerance

Shared, criteria-only fragment — what to flag when judging resilience. No workflow, no Next Actions. Consumed by `/claude-tweaks:recon`'s resilience judgment lens. One source of truth so every sweep applies identical calibration.

## What to flag

- I/O calls (database queries, file reads, queue consumers) with no timeout configured and no fallback path.
- Network calls (HTTP clients, RPC stubs, external APIs) with no retry policy and no circuit-breaker or backoff.
- Unhandled rejection paths on async operations that, if they threw, would leave shared state corrupt or the process in an undefined state.
- Missing graceful-shutdown handling for long-running services: a process that drops in-flight work on SIGTERM without draining queues or releasing locks.
- Health-check or readiness-probe implementations that always return `200` regardless of real dependency health.

## What NOT to flag

- Retry logic absent from pure computation (no I/O) — retrying a deterministic function has no value.
- Missing timeout on an operation that is already wrapped by the caller's context-cancellation or deadline.
- "Could fail" in the abstract without a concrete path through the code where it does fail.
- Defensive code that duplicates an existing safety net in the framework (e.g., re-adding a timeout that the HTTP client framework already enforces).

## Severity calibration

- **critical** — a failure in this path leaves shared persistent state corrupt (partial write, double-spend, orphaned lock).
- **high** — a failure causes a silent data loss or silently drops messages that will not be replayed.
- **medium** — a failure causes a request timeout or a degraded user experience but the system recovers without data loss.
- **low** — a missing timeout that slows a non-critical background job.
```

- [ ] Write `skills/_shared/criteria-observability.md`:

```markdown
# Criteria: Observability

Shared, criteria-only fragment — what to flag when judging observability on critical paths. No workflow, no Next Actions. Consumed by `/claude-tweaks:recon`'s observability judgment lens.

## What to flag

- Critical code paths (auth, payment, data mutations, queue consumers) with no structured log on failure — a silent error that leaves no trace in any log.
- Log statements that include secrets, API keys, tokens, passwords, or PII (names, emails, IDs). These are security defects masquerading as observability.
- Expensive operations (DB queries, external API calls) that have no timing instrumentation and no way to attribute latency to them in production.
- Business events (order placed, user created, payment processed) emitted with no correlation ID or trace context, making distributed debugging impossible.
- Catch blocks that swallow the error: `catch (e) {}` or `catch (e) { return null; }` with no log.

## What NOT to flag

- Absence of logging on a path that is already traced by the framework or platform (e.g., HTTP middleware that already logs every request).
- Missing metrics on paths the team has explicitly instrumented elsewhere (confirm before flagging).
- "Insufficient logging" without a concrete failure scenario where the absence would prevent diagnosis.
- Log statements that are clearly debug-only and behind a log-level gate.

## Severity calibration

- **critical** — a secret or PII is logged (security defect).
- **high** — a critical business event is entirely untraceable when it fails.
- **medium** — a slow path has no timing; degraded performance would be invisible.
- **low** — a non-critical path lacks a debug log.
```

- [ ] Write `skills/_shared/criteria-security-logic.md`:

```markdown
# Criteria: Security Logic

Shared, criteria-only fragment — logic-level security defects, not static analysis findings or dependency vulnerabilities. No workflow, no Next Actions. Consumed by `/claude-tweaks:recon`'s security-logic judgment lens.

This fragment is for what a careful security reviewer would catch by reading the code, not what a linter reports.

## What to flag

- **Broken access control:** an action that should require authorization is reachable without it (missing auth check, IDOR via predictable IDs, a role check that is bypassed by a URL parameter).
- **Trust boundary violations:** data from an untrusted source (user input, URL params, headers, third-party webhooks) used in a sensitive operation (DB query, file path, system command, HTML output) without validation or escaping.
- **Authentication logic defects:** comparison of tokens or signatures that is not constant-time (timing oracle), password reset flows that accept any token regardless of expiry or binding, session IDs that are not rotated on privilege change.
- **Insecure direct use of cryptographic primitives:** rolling a custom hash function, using a deprecated algorithm (MD5, SHA-1 for integrity), predictable IVs, reused nonces.
- **Dangerous defaults in security-relevant configuration:** CORS set to `*` on a credentialed endpoint, `httpOnly`/`secure` flags absent from session cookies, `eval` or `Function()` on user-supplied strings.

## What NOT to flag

- Findings that are purely static-analysis output (missing sanitization on a path that never reaches the DOM, a library version with a CVE that does not apply to how the library is used).
- "Could be improved" without a concrete attack path.
- Speculative injection risks without a route through the code where attacker-controlled input reaches the sink.

## Severity calibration

- **critical** — broken auth or direct data exposure exploitable without authentication.
- **high** — exploitable after authentication, or a logic defect that enables privilege escalation.
- **medium** — a security misconfiguration that reduces defense-in-depth but is not directly exploitable.
- **low** — a minor hardening gap (missing `HttpOnly` on a non-session cookie).

Confidence floor for this criterion is `high` — do not file speculative security findings.
```

- [ ] Write `skills/_shared/criteria-scalability.md`:

```markdown
# Criteria: Scalability

Shared, criteria-only fragment — structural patterns that will constrain scale before performance bottlenecks become visible. No workflow, no Next Actions. Consumed by `/claude-tweaks:recon`'s scalability judgment lens.

## What to flag

- **Unbounded queries:** a database query with no LIMIT clause on a table that grows with user data, or a pagination scheme that fetches all rows and slices in memory.
- **Synchronous fan-out in a hot path:** a request handler that makes N sequential external calls where N is proportional to input size or data size (N+1 query pattern, sequential API calls in a loop).
- **Global in-process state used for coordination:** a module-level cache, counter, or lock that works correctly with one instance but breaks under horizontal scaling.
- **Polling where push/stream is available:** a tight polling loop on an external resource when the provider offers webhooks or streaming.
- **Missing index signals:** a query filter on a column with no index, called on a table expected to reach millions of rows (flag only when the missing index is evident from the schema and the query, not speculatively).

## What NOT to flag

- Speculative scale concerns without a growth model ("this could be slow at 10M rows" with no evidence the table will reach that size).
- Micro-optimizations (avoid `Array.concat` in a loop) that do not change the algorithmic complexity class.
- Performance issues already bounded by a fixed dataset that cannot grow.

## Severity calibration

- **high** — an unbounded query or N+1 on a path that is already serving significant load, or will as soon as the feature ships.
- **medium** — a structural pattern (global state, polling) that will require an architectural change to fix once load increases; better to address now.
- **low** — a missing index on a table currently small; flag when the schema suggests it will grow.
```

- [ ] Grep-verify all four files exist and reference the right criteria names:
  ```bash
  grep -l "Criteria:" /Users/thomasholknielsen/Code\ Workspaces/claude-tweaks/skills/_shared/criteria-resilience.md \
    /Users/thomasholknielsen/Code\ Workspaces/claude-tweaks/skills/_shared/criteria-observability.md \
    /Users/thomasholknielsen/Code\ Workspaces/claude-tweaks/skills/_shared/criteria-security-logic.md \
    /Users/thomasholknielsen/Code\ Workspaces/claude-tweaks/skills/_shared/criteria-scalability.md
  ```
  Expected: all four paths printed.

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add skills/_shared/criteria-resilience.md skills/_shared/criteria-observability.md skills/_shared/criteria-security-logic.md skills/_shared/criteria-scalability.md && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add universal criteria fragments: resilience, observability, security-logic, scalability"`

---

## Task 6 — Criteria fragments: domain additions

Write the seven domain criteria fragments referenced in Task 2's `criteria.js` additions.

**Files:**
- Create: `skills/_shared/criteria-a11y.md`
- Create: `skills/_shared/criteria-i18n.md`
- Create: `skills/_shared/criteria-api-stability.md`
- Create: `skills/_shared/criteria-migration-safety.md`
- Create: `skills/_shared/criteria-iac-security.md`
- Create: `skills/_shared/criteria-privacy-pii.md`
- Create: `skills/_shared/criteria-concurrency.md`

Steps:

- [ ] Write `skills/_shared/criteria-a11y.md`:

```markdown
# Criteria: Accessibility (a11y)

Shared, criteria-only fragment — what to flag when judging accessibility in frontend/UI code. No workflow, no Next Actions. Consumed by `/claude-tweaks:recon`'s a11y judgment lens (frontend areas only). Confidence floor: `high` — flag only clear, concrete violations, not speculative issues.

## What to flag

- Interactive elements (buttons, links, form controls) with no accessible label: missing `aria-label`, `aria-labelledby`, or visible text content that a screen reader can reach.
- Images with no `alt` attribute, or `alt=""` on an image that carries meaning (decorative-only images with `alt=""` are correct — but verify the image is truly decorative before accepting the empty string).
- Keyboard-inaccessible interactive elements: a `div` or `span` with an `onClick` handler and no `role`, no `tabIndex`, and no keyboard event handler (`onKeyDown`/`onKeyUp`/`onKeyPress`).
- Form inputs with no associated `<label>` element (either via `for`/`id` pairing or wrapping).
- Color contrast issues only when the contrast ratio is verifiably below WCAG AA (4.5:1 for normal text) — do not guess; if you cannot verify the colors from the code, do not flag.
- Missing `lang` attribute on the root `<html>` element in a static template.
- ARIA attributes used incorrectly (e.g., `role="button"` on an element that already has native button semantics, or `aria-hidden="true"` on a focusable element).

## What NOT to flag

- Subjective readability or UX issues that are not accessibility defects.
- Missing ARIA on purely decorative or non-interactive elements.
- Contrast ratio concerns without verifiable color values from the code.
- "Could be more accessible" without a concrete violation of WCAG 2.1 AA criteria.
- Issues in vendored or generated code.

## Severity calibration

- **high** — a primary interactive path (form submission, navigation, modal) is completely inaccessible by keyboard or screen reader.
- **medium** — a specific interactive element is inaccessible but the surrounding flow has alternatives.
- **low** — a minor labeling gap on a decorative or secondary element.
```

- [ ] Write `skills/_shared/criteria-i18n.md`:

```markdown
# Criteria: Internationalization (i18n)

Shared, criteria-only fragment — what to flag in user-facing applications for i18n correctness and future-proofing. No workflow, no Next Actions. Consumed by `/claude-tweaks:recon`'s i18n judgment lens (frontend + backend areas serving user-visible content).

## What to flag

- User-visible strings hard-coded in source code rather than referenced from a translation key (e.g., `<p>Welcome back!</p>` with no i18n call, when the project uses an i18n library like `react-intl`, `i18next`, `vue-i18n`, or a server-side translation function).
- Date, time, or number formatting that calls `toLocaleString()` without a locale argument, relying on the runtime default.
- Plural handling that does not use the i18n library's plural API — a pattern like `count === 1 ? 'item' : 'items'` instead of `t('item', { count })` where `t` supports plural forms.
- RTL (right-to-left) layout assumptions hard-coded via CSS `margin-left`/`margin-right` or `text-align: left` in components that will be RTL-flipped.
- Currency or units formatted without locale or explicit currency code.

## What NOT to flag

- Hard-coded strings in developer-facing output (logs, error messages not shown to users, console.error calls).
- Projects with no i18n library and no stated intention to support multiple languages — flag only when there is evidence of i18n intent (an i18n library is already installed, or locale-switching logic exists).
- Translation key strings themselves (the key `"auth.login.submit"` is not a user-visible hard-coded string).

## Severity calibration

- **high** — a primary user flow is entirely untranslated when the project ships in multiple languages.
- **medium** — a date or number format is locale-insensitive in a user-visible context.
- **low** — a minor string is untranslated or a plural rule is missing for an edge case.
```

- [ ] Write `skills/_shared/criteria-api-stability.md`:

```markdown
# Criteria: API / Contract Stability

Shared, criteria-only fragment — what to flag for API and contract stability in libraries and public-facing services. No workflow, no Next Actions. Consumed by `/claude-tweaks:recon`'s api-stability judgment lens (library + backend areas).

## What to flag

- **Breaking-change risk without versioning:** a public function, class, or REST endpoint signature that is being changed (parameter added without a default, parameter removed, return shape changed) with no version bump or deprecation path.
- **Undocumented public API:** exported functions or types with no JSDoc/TSDoc, no README entry, and no type signature — callers cannot know the contract without reading the implementation.
- **Implicit contract in test doubles:** tests that mock internal implementation details rather than the public interface, making the tests brittle to non-breaking refactors.
- **Response shape drift:** a REST or RPC endpoint whose response shape is not validated against a schema, making silent drift to consumers likely.
- **Missing deprecation markers:** a function or endpoint that has been superseded but still exists with no `@deprecated` tag and no migration path documented.

## What NOT to flag

- Internal APIs (unexported functions, private methods) — stability concerns apply only to surfaces that cross a module boundary consumed by outside callers.
- Breaking changes in a pre-1.0 library or an explicitly unstable API (tagged `@experimental`/`@alpha`/`@beta`).
- API documentation gaps in private methods or implementation helpers.

## Severity calibration

- **critical** — a breaking change to a widely-consumed public API with no version bump and no migration guide.
- **high** — a breaking change in a public API that is not yet widely distributed (can still be caught pre-release).
- **medium** — an undocumented public export or a missing deprecation marker.
- **low** — a minor contract ambiguity (optional parameter semantics not documented).
```

- [ ] Write `skills/_shared/criteria-migration-safety.md`:

```markdown
# Criteria: Data / Migration Safety

Shared, criteria-only fragment — what to flag in database-backed areas for migration correctness and rollback safety. No workflow, no Next Actions. Consumed by `/claude-tweaks:recon`'s migration-safety judgment lens (data areas). Confidence floor: `high` — data defects can be irreversible; only file concrete findings.

## What to flag

- **Non-idempotent migrations:** a migration that will fail or corrupt data when re-run (no `IF NOT EXISTS`, `IF EXISTS`, or equivalent guard on DDL statements).
- **Lock-heavy operations on large tables:** `ALTER TABLE` adding a `NOT NULL` column without a default on a table estimated to be large, or a `CREATE INDEX` without `CONCURRENTLY` on a live table — these lock the table and cause downtime.
- **No rollback path:** a destructive migration (DROP COLUMN, DROP TABLE, rename) with no corresponding down-migration and no data backup strategy documented.
- **Raw SQL with user-supplied values:** a query built by string concatenation or template literal with values from application input, not parameterized via the ORM or query builder.
- **Missing foreign-key constraints on newly added columns:** a column that references another table but has no FK constraint, allowing orphaned rows to accumulate silently.
- **Data backfill in the migration itself without batching:** a migration that updates all rows in a large table in a single transaction (risk of lock timeout and a multi-minute downtime on the migration apply).

## What NOT to flag

- Schema changes on tables that are empty or trivially small in production.
- Missing indexes that are already covered by Task 4 (scalability criterion).
- Stylistic SQL formatting issues.

## Severity calibration

- **critical** — a migration that can corrupt existing data or cause irreversible loss (e.g., `DROP COLUMN` without confirming the column is no longer read by live code).
- **high** — a migration that will cause downtime on a large table, or that is non-idempotent and will fail on a retry.
- **medium** — a missing rollback path or a missing FK constraint.
- **low** — a minor best-practice gap (inline comment missing, non-standard migration filename).
```

- [ ] Write `skills/_shared/criteria-iac-security.md`:

```markdown
# Criteria: IaC Security & Hygiene

Shared, criteria-only fragment — what to flag in infrastructure-as-code (Terraform, Bicep, Dockerfiles, Kubernetes manifests, Helm charts). No workflow, no Next Actions. Consumed by `/claude-tweaks:recon`'s iac-security judgment lens (infra areas). Confidence floor: `high`.

## What to flag

- **Over-permissive IAM / RBAC:** a role, policy, or binding that grants `*` on actions or resources when the principle of least privilege would allow a narrow, named set.
- **Public exposure without intent:** a storage bucket, database security group, or service with `public: true`, `0.0.0.0/0` ingress, or `AllowAll` that does not have a documented reason for being public.
- **Secrets in IaC source:** API keys, passwords, tokens, or private keys hard-coded in `.tf`, `values.yaml`, `docker-compose.yml`, or Kubernetes `Secret` manifests committed to the repo (the secret value, not a reference to a secret manager).
- **Container images pinned to `latest` or unpinned tags:** `image: my-service` or `image: my-service:latest` in a manifest — no digest, no pinned version, making builds non-deterministic and vulnerable to supply-chain attacks.
- **Privileged containers or root-user Dockerfiles:** `privileged: true`, `runAsUser: 0`, or a Dockerfile that does not add a non-root USER before the CMD/ENTRYPOINT.
- **Unencrypted data stores:** an RDS instance, S3 bucket, or EBS volume with encryption explicitly disabled or unset in a context where the cloud provider's default is off.

## What NOT to flag

- Resource naming or tagging conventions that are project-specific style choices with no security impact.
- Missing cost-optimization annotations (instance sizes, autoscaling limits).
- Findings that require knowledge of the specific deployment environment to evaluate (e.g., whether a private subnet is truly isolated) — flag only when the code itself reveals the gap.

## Severity calibration

- **critical** — a secret value committed to source control, or a storage resource publicly readable without intent.
- **high** — `*` IAM actions on a production environment, or a privileged container in a multi-tenant cluster.
- **medium** — unpinned image tags, unencrypted data at rest in a dev/staging environment.
- **low** — a minor hygiene gap (missing label, non-standard structure) with no direct security impact.
```

- [ ] Write `skills/_shared/criteria-privacy-pii.md`:

```markdown
# Criteria: Privacy / PII Handling

Shared, criteria-only fragment — what to flag in code that touches personally identifiable information. No workflow, no Next Actions. Consumed by `/claude-tweaks:recon`'s privacy-pii judgment lens (frontend, backend, and data areas touching user data). Confidence floor: `high` — privacy findings have regulatory and reputational consequences; do not file speculative findings.

## What to flag

- **PII logged:** fields that are structurally PII (email, phone, full name, IP address, SSN, date of birth, precise location, device identifiers) passed to a logger, analytics call, or error tracking SDK without redaction or masking.
- **PII in URLs:** user identifiers or PII embedded in URL paths or query parameters that will appear in access logs and browser history.
- **Retention without purpose:** PII stored in a database column, cache, or queue message with no TTL, no expiry, and no evident business need for indefinite retention.
- **Missing consent gate:** a feature that collects behavioral data, location, or health information with no consent check visible in the code path.
- **PII transmitted over HTTP (not HTTPS):** only flag when the code explicitly constructs an HTTP URL for a call that carries PII in the body.
- **Oversharing in API responses:** a response serializer that includes PII fields (e.g., password hash, full SSN) that the caller does not need, based on what the endpoint's stated purpose is.

## What NOT to flag

- Internal service-to-service calls where both ends are controlled and trusted (not user-facing).
- PII in test fixtures that use clearly fake data (e.g., `test@example.com`, `555-1234`).
- Speculative privacy concerns without a concrete code path where real PII flows.
- Compliance concerns (GDPR, CCPA) that require business-level judgment — flag only the concrete code pattern, not the regulatory question.

## Severity calibration

- **critical** — PII logged at a level that reaches a third-party log aggregator or is included in error reports sent externally.
- **high** — PII persisted without any retention limit or transmitted in a URL that will be logged server-side.
- **medium** — an API response including unneeded sensitive fields.
- **low** — a minor over-inclusion (e.g., user ID in a URL parameter when it is already in the auth context).
```

- [ ] Write `skills/_shared/criteria-concurrency.md`:

```markdown
# Criteria: Concurrency Safety

Shared, criteria-only fragment — what to flag for concurrency defects in async code and shared-state areas. No workflow, no Next Actions. Consumed by `/claude-tweaks:recon`'s concurrency judgment lens (backend, cli, and data areas with shared mutable state or async operations).

## What to flag

- **Race on shared mutable state:** multiple async operations or event handlers mutating the same object or variable without synchronization, where the order of mutation affects correctness (e.g., incrementing a counter with `+=` across concurrent requests, mutating a module-level cache without a lock).
- **Promise/async correctness defects:** `await` inside a `.forEach()` or `.map()` without wrapping in `Promise.all`, causing sequential execution when concurrent is required — or vice versa, unbounded `Promise.all` over a large array that overwhelms a downstream service.
- **Missing transaction isolation:** multiple database writes that must be atomic, issued outside a transaction, where a partial failure leaves the database in an inconsistent state.
- **Lock acquisition without release on error path:** a mutex, semaphore, or database advisory lock acquired in a try block but released only in the happy path — an exception bypasses the release, causing a deadlock for the next caller.
- **Double-check locking done wrong:** a pattern that checks a condition, then re-checks inside a lock, but the first check reads shared state without holding the lock, making the pattern racy in async runtimes.
- **Unbounded concurrency with a shared resource cap:** spawning a new database connection, thread, or worker per incoming request without a pool or concurrency limit.

## What NOT to flag

- Concurrency concerns in purely sequential, single-threaded code paths (Node.js synchronous event-loop code with no async boundaries).
- Race conditions in tests that are explicitly designed to be run sequentially.
- Theoretical races that cannot manifest given the language's memory model (e.g., in single-threaded event-loop languages, non-async mutations are already serialized).

## Severity calibration

- **critical** — a race on financial data, authentication state, or access-control decisions.
- **high** — a race that can cause data loss or silent corruption in a high-traffic path.
- **medium** — an async-correctness defect (missing `await`, unbounded Promise.all) that causes incorrect behavior under realistic load.
- **low** — a pattern that is technically racy but harmless at current scale (e.g., a counter that can drift by one under concurrent load with no downstream consequence).
```

- [ ] Grep-verify all seven files exist:
  ```bash
  grep -l "Criteria:" \
    "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/skills/_shared/criteria-a11y.md" \
    "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/skills/_shared/criteria-i18n.md" \
    "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/skills/_shared/criteria-api-stability.md" \
    "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/skills/_shared/criteria-migration-safety.md" \
    "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/skills/_shared/criteria-iac-security.md" \
    "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/skills/_shared/criteria-privacy-pii.md" \
    "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/skills/_shared/criteria-concurrency.md"
  ```
  Expected: all seven paths printed.

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add skills/_shared/criteria-a11y.md skills/_shared/criteria-i18n.md skills/_shared/criteria-api-stability.md skills/_shared/criteria-migration-safety.md skills/_shared/criteria-iac-security.md skills/_shared/criteria-privacy-pii.md skills/_shared/criteria-concurrency.md && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add domain criteria fragments: a11y, i18n, api-stability, migration-safety, iac-security, privacy-pii, concurrency"`

---

## Task 7 — Update `skills/recon/SKILL.md`: CLASSIFY step, tools-as-assists, and verify gate

The v2 SKILL.md (rewritten in P1) orchestrates the judge loop. P2 adds three sections to that loop:

1. **CLASSIFY step** (between SCOPE and JUDGE): call `classify`, read the area types, use `criteriaForArea` to select the applicable criteria, and embed the matching criterion fragments in the judge prompt.
2. **Tools-as-assists section** (within or just before JUDGE): the judge MAY call deterministic tools when present — project lint/typecheck, knip/depcheck, npm-audit/osv, madge — and use their output as evidence. Each tool is optional and silently skipped when not installed. Tool output is evidence the judge weighs; it is not filed as a finding itself.
3. **Verify gate** (between JUDGE finding emission and FILE): before filing, the judge re-reads each surviving finding and asks: "Is this real? Is it actionable? Does it reproduce given the code I read?" Findings that fail the verify gate are dropped before fingerprinting.

The verify gate is an LLM step. It cannot be unit-tested. Document it as a required step in the SKILL workflow and add an anti-pattern for skipping it.

**Files:**
- Extend: `skills/recon/SKILL.md`

Steps:

- [ ] Read the current `skills/recon/SKILL.md` to locate the SCOPE step and the step immediately after it (which in P1 is JUDGE). Identify the exact lines to insert the CLASSIFY step between them.

- [ ] Add the CLASSIFY step as a new numbered step between SCOPE and JUDGE. The step must include:

```markdown
**Step 2 — CLASSIFY: detect area type + select criteria.**

Call the `classify` command to determine the area's type:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" classify --root . --area "<slice-id>"
```

The command prints `{ areaId, types }`. Use the `types` array to select the applicable criteria via `criteriaForArea(types)` from `bin/lib/recon/criteria.js`. Types are additive — a `['frontend', 'library']` area gets universal criteria plus `a11y` and `api-stability`.

If `types` is `[]` (unknown area), apply universal criteria only.

Load each selected criterion's fragment file (the `fragment` field in the catalog) and embed it in the judge prompt for Step 3. Fragments live under `skills/_shared/` — read each one and include its content so the judge has the calibration text inline.
```

- [ ] Add the Tools-as-Assists section inside or immediately before the JUDGE step. The section must specify:

```markdown
**Tools as evidence (optional assists).**

Before or during judging, the judge MAY call the following deterministic tools to ground its findings. Each is optional — skip gracefully if the tool is not installed or the command errors. Tool output is evidence the judge weighs when forming a finding; raw tool output is never filed as a finding itself.

| Tool | Command | Evidence it provides |
|------|---------|----------------------|
| Project lint/typecheck | `npm run lint --if-present` or `npx tsc --noEmit` | Concrete type errors and lint violations in the slice |
| Dead code / unused deps | `npx knip --reporter json` or `npx depcheck` | Unused exports, unreferenced packages |
| Dependency vulnerabilities | `npm audit --json` or `npx osv-scanner --format json .` | Known CVEs in installed packages |
| Dependency cycles | `npx madge --circular --json <slice-path>` | Import cycles in the slice |
| Grep / git log | Standard Bash + git CLI | Code patterns, recent churn, authorship |

A finding confirmed by a tool output is higher-confidence than one based on code reading alone. Include the relevant tool output line as part of the finding's `evidence` field (not as a separate finding).

When a tool is absent or errors, log a single line to stderr and continue — do not abort the judge run.
```

- [ ] Add the Verify Gate as a new numbered step between JUDGE (finding emission) and DEDUP/FILE. The step must include:

```markdown
**Step 4 — VERIFY GATE: sanity-check surviving findings before dedup.**

Before fingerprinting and dedup, re-examine each finding the judge emitted and ask three questions:

1. **Is it real?** Does the code actually exhibit the problem, or did the judge misread the structure? If the code is correctly guarded (a timeout IS configured, a check IS present), drop the finding.
2. **Is it actionable?** Is the `suggestedApproach` concrete and executable? A finding like "consider improving error handling" with no specific location or change is not actionable — drop it or refine it until it is.
3. **Does it reproduce?** Given the code read in Step 3, would a developer following the `suggestedApproach` be able to find and fix the issue without additional investigation? If not, the anchor or evidence is too vague — either tighten it or drop the finding.

Drop any finding that fails any of the three questions. Log the drop reason. A smaller set of high-quality findings is always preferable to a larger set with noise. This is the adversarial-verify discipline that the v1 design established — apply it every time.

The verify gate is a judgment step, not a mechanical check. It cannot be automated. Do not skip it even under time pressure.
```

- [ ] Grep-verify the three sections are present in the updated SKILL.md:
  ```bash
  grep -n "CLASSIFY\|Tools as evidence\|VERIFY GATE" \
    "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/skills/recon/SKILL.md"
  ```
  Expected: at least one match per section keyword.

- [ ] Verify the Anti-Patterns table includes an anti-pattern for skipping the verify gate:
  ```bash
  grep -n "verify gate\|Verify gate\|VERIFY GATE" \
    "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/skills/recon/SKILL.md"
  ```
  If the anti-pattern is missing, add it now:
  ```markdown
  | Skipping the verify gate before filing | Files plausible-but-wrong findings. Every surviving finding must pass all three verify questions — real, actionable, reproducible — before reaching dedup. |
  ```

- [ ] Run the full test suite to confirm no regressions: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && node --test bin/lib/recon/tests/`
      Expected: all tests pass.

- [ ] Commit: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add skills/recon/SKILL.md && git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Update recon SKILL.md: CLASSIFY step, tools-as-assists, and verify gate (P2)"`

---

## Self-Review

Before marking P2 complete, verify each item:

**P2 spec coverage:**
- [ ] `area-type.js` exists and exports `classifyArea(absDir, root) -> { types: string[] }` (contract §area-type.js)
- [ ] All seven area types covered by tests: frontend (dep, ext, subdir), backend (dep + no UI), library (exports, main+types), infra (Dockerfile, .tf, k8s/), data (migrations/, prisma, ORM dep), cli (bin field, shebang), docs (>=80% .md)
- [ ] Types are additive — the multi-type test passes
- [ ] `criteria.js` has all seven domain criteria rows with correct `appliesTo` arrays and `confidenceFloor` values
- [ ] `criteriaForArea([])` returns universal-only; `criteriaForArea(['frontend'])` returns universal + a11y + i18n (but NOT api-stability, migration-safety, etc.)
- [ ] `getCriterion('security-logic').confidenceFloor === 'high'`
- [ ] `classify` CLI command prints `{ areaId, types }` JSON and exits 0
- [ ] `validate-findings` drops a med-confidence finding when the criterion has `confidenceFloor: 'high'`; the drop is logged to stderr
- [ ] `applyConfidenceFloor` is exported from `bin/recon.js` and all five floor-gate tests pass
- [ ] All eleven criteria fragment files exist in `skills/_shared/` (4 universal: resilience, observability, security-logic, scalability; 7 domain: a11y, i18n, api-stability, migration-safety, iac-security, privacy-pii, concurrency)
- [ ] `skills/recon/SKILL.md` contains CLASSIFY step, tools-as-assists table, and VERIFY GATE step
- [ ] Anti-pattern for skipping the verify gate is present in the SKILL's Anti-Patterns table

**Placeholder scan:**
- [ ] `grep -r "TODO\|FIXME\|PLACEHOLDER\|TBD\|NOT IMPLEMENTED" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/bin/lib/recon/area-type.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/bin/lib/recon/criteria.js"` — expected: no output

**Contract consistency:**
- [ ] `classifyArea` signature matches contract: `classifyArea(absDir, root) -> { types: string[] }`
- [ ] `classify` CLI interface matches contract: `classify --root <dir> [--area <dir>]` prints `{ areaId, types }`
- [ ] `criteriaForArea` and `getCriterion` signatures unchanged from P1 (P2 only adds rows to the catalog)
- [ ] `applyConfidenceFloor` gates on `criterion` id resolved via `getCriterion` — not hardcoded per-criterion logic
- [ ] Confidence ordering: `high > med > low` is implemented as an index array, not as a chain of string comparisons
- [ ] Domain criterion `privacy-pii` has `appliesTo: ['frontend', 'backend', 'data']` (not `'user-data'` — that was the informal description in the design; the actual area type names are the seven in the contract)
- [ ] Fragment paths in `criteria.js` use the form `'skills/_shared/criteria-<id>.md'` (relative, matching the contract's `fragment` field convention)
- [ ] The verify gate is documented as an LLM step in the SKILL, with no unit test claiming to cover it
- [ ] Full test suite passes: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" && node --test bin/lib/recon/tests/`
