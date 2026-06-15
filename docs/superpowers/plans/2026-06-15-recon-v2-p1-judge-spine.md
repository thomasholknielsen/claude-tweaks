# Recon v2 Phase 1: Judge Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Canonical interface: `2026-06-15-recon-v2-interface-contract.md` wins over inline names.

**Goal:** Replace the mechanical-lens spine with an LLM-judge loop: a rewritten `skills/recon/SKILL.md` drives Claude to judge one directory slice against the universal criteria catalog, then pipes its JSON findings array through a new `validate-findings` CLI command that fingerprints, deduplicates, and emits `gh`-ready payloads — proving the end-to-end judge loop without touching rotation or area-type classification (P2/P3).

**Architecture:** The v1 plumbing files (`fingerprint.js`, `validate-finding.js`, `dedup.js`, `cache.js`, `issue-payload.js`, `bin/recon.js`) are extended in-place; no existing commands are removed. Two new files are added: `bin/lib/recon/criteria.js` (the universal criteria catalog) and `bin/lib/recon/tests/criteria.test.js`. A new CLI command `validate-findings` is wired into `bin/recon.js`. `skills/recon/SKILL.md` is fully rewritten to the v2 judge orchestration.

**Tech Stack:** Node 18+ built-ins only (`node:crypto`, `node:fs`, `node:path`, `node:test`, `node:assert`). Zero external dependencies. Test runner: `node --test tests/ bin/lib/recon/tests/*.test.js`.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `bin/lib/recon/fingerprint.js` | Extend | Add v2 `fingerprint({criterion,areaId,anchor})` form + `normalizeAnchor`; keep v1 form |
| `bin/lib/recon/validate-finding.js` | Extend | Add v2 Finding shape validation; keep v1 validation untouched |
| `bin/lib/recon/criteria.js` | New | Universal criteria catalog: `CRITERIA`, `criteriaForArea(areaTypes)`, `getCriterion(id)` |
| `bin/recon.js` | Extend | Add `validate-findings` subcommand; keep all existing commands |
| `skills/recon/SKILL.md` | Rewrite | v2 judge orchestration: SCOPE → JUDGE → validate-findings → gh issue create |
| `bin/lib/recon/tests/fingerprint.test.js` | Extend | Add v2 anchor-stability tests |
| `bin/lib/recon/tests/validate-finding.test.js` | Extend | Add v2 Finding shape tests |
| `bin/lib/recon/tests/criteria.test.js` | New | criteriaForArea, getCriterion, catalog coverage |
| `bin/lib/recon/tests/issue-payload.test.js` | Extend | Add v2 body + criterion label test |
| `bin/lib/recon/tests/cli-validate-findings.test.js` | New | `validate-findings` CLI end-to-end |
| `bin/lib/recon/tests/skill-md.test.js` | Extend | Grep-verify required v2 anchors in SKILL.md |

---

### Task 1: Extend `fingerprint.js` — v2 form and `normalizeAnchor`

**Files:**
- Modify: `bin/lib/recon/fingerprint.js`
- Test: `bin/lib/recon/tests/fingerprint.test.js`

The v2 fingerprint hashes `criterion + areaId + normalizeAnchor(anchor)`. The v1 form (`lens + areaId + signature + file`) stays. `normalizeAnchor` lowercases the path component, strips any trailing `:line` or `:line:col` from either side of `#`, and collapses whitespace — so `src/Foo.ts:12#handleRequest` and `src/foo.ts#handleRequest` produce the same anchor.

- [ ] **Step 1.1: Write failing tests for `normalizeAnchor` and the v2 fingerprint form**

Open `bin/lib/recon/tests/fingerprint.test.js` and append these tests after the existing ones:

```js
// ── v2 fingerprint ─────────────────────────────────────────────────────────

const { normalizeAnchor } = require('../fingerprint');

test('normalizeAnchor lowercases path, strips :line and :line:col on either side of #', () => {
  // symbol side must not be stripped — only :line(:col) artifacts
  assert.strictEqual(
    normalizeAnchor('src/Foo.ts:12#handleRequest'),
    'src/foo.ts#handleRequest',
  );
  assert.strictEqual(
    normalizeAnchor('src/Foo.ts#handleRequest:99:3'),
    'src/foo.ts#handleRequest',
  );
  assert.strictEqual(
    normalizeAnchor('  src/Bar.ts  #  doThing  '),
    'src/bar.ts#doThing',
  );
});

test('v2 fingerprint returns a recon-<8hex> id', () => {
  const { fingerprint } = require('../fingerprint');
  const id = fingerprint({ criterion: 'simplification', areaId: 'src/api', anchor: 'src/api/user.js#getUser' });
  assert.match(id, /^recon-[0-9a-f]{8}$/);
});

test('v2 fingerprint is stable when the finding moves lines (anchor stability)', () => {
  const { fingerprint } = require('../fingerprint');
  // Line number in anchor file ref is stripped by normalizeAnchor.
  const a = fingerprint({ criterion: 'dead-code', areaId: 'src', anchor: 'src/util.js:42#trimPath' });
  const b = fingerprint({ criterion: 'dead-code', areaId: 'src', anchor: 'src/util.js:99#trimPath' });
  assert.strictEqual(a, b, 'moved line must not change the fingerprint');
});

test('v2 fingerprint is stable when prose around the anchor is reworded', () => {
  const { fingerprint } = require('../fingerprint');
  // The anchor itself is the same; wording of the surrounding evidence is irrelevant.
  const a = fingerprint({ criterion: 'naming-clarity', areaId: 'lib', anchor: 'lib/parser.js#parse' });
  const b = fingerprint({ criterion: 'naming-clarity', areaId: 'lib', anchor: 'lib/parser.js#parse' });
  assert.strictEqual(a, b);
});

test('v2 fingerprint differs when criterion, areaId, or anchor differs', () => {
  const { fingerprint } = require('../fingerprint');
  const base = { criterion: 'resilience', areaId: 'src', anchor: 'src/http.js#fetch' };
  assert.notStrictEqual(
    fingerprint(base),
    fingerprint({ ...base, criterion: 'security-logic' }),
  );
  assert.notStrictEqual(
    fingerprint(base),
    fingerprint({ ...base, areaId: 'lib' }),
  );
  assert.notStrictEqual(
    fingerprint(base),
    fingerprint({ ...base, anchor: 'src/http.js#retry' }),
  );
});

test('v1 and v2 forms coexist — same module, both callable', () => {
  const { fingerprint } = require('../fingerprint');
  const v1 = fingerprint({ lens: 'todo-comments', areaId: '.', signature: 'TODO x', file: 'a.js:1' });
  const v2 = fingerprint({ criterion: 'bad-practice', areaId: '.', anchor: 'a.js#TODO x' });
  assert.match(v1, /^recon-[0-9a-f]{8}$/);
  assert.match(v2, /^recon-[0-9a-f]{8}$/);
  // They hash different inputs, so they should differ (unless astronomically unlucky).
  assert.notStrictEqual(v1, v2);
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
node --test bin/lib/recon/tests/fingerprint.test.js 2>&1 | tail -20
```

Expected: failures on `normalizeAnchor` (not yet exported) and the v2 `fingerprint` form tests.

- [ ] **Step 1.3: Implement `normalizeAnchor` and extend `fingerprint` in `bin/lib/recon/fingerprint.js`**

Replace the entire file content:

```js
const crypto = require('crypto');

// Remove :line and :line:col refs, collapse whitespace, lowercase. Keeps the
// fingerprint stable when a finding moves lines or is reformatted.
function normalizeSignature(sig) {
  return String(sig)
    .replace(/:\d+(:\d+)?/g, '')   // strip embedded :line(:col)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// v2: normalize a stable anchor ("relfile#NearestSymbol").
// Rules:
//   1. Trim surrounding whitespace.
//   2. Split on the first '#'. Normalize each side independently.
//   3. Path side: lowercase; strip any trailing :line(:col) artifact.
//   4. Symbol side: strip any trailing :line(:col) artifact; trim whitespace.
//      Do NOT lowercase the symbol — symbol names are case-sensitive identifiers.
//   5. Re-join with '#'. If there is no '#', treat the whole string as the path side.
function normalizeAnchor(anchor) {
  const s = String(anchor).trim();
  const hashIdx = s.indexOf('#');
  if (hashIdx === -1) {
    // No symbol — normalize the whole thing as a path.
    return s.replace(/:\d+(:\d+)?$/, '').replace(/\s+/g, '').toLowerCase();
  }
  const pathPart = s.slice(0, hashIdx).replace(/:\d+(:\d+)?$/, '').replace(/\s+/g, '').toLowerCase();
  const symbolPart = s.slice(hashIdx + 1).replace(/:\d+(:\d+)?$/, '').trim();
  return `${pathPart}#${symbolPart}`;
}

// v2 form: stable id from criterion + areaId + normalized anchor.
// v1 form: stable id from lens + areaId + normalized signature (+ optional file).
// Both are detected by checking which keys are present.
function fingerprint({ lens, areaId, signature, file, criterion, anchor }) {
  if (criterion !== undefined) {
    // v2: LLM-judge finding. Hash criterion + areaId + normalizeAnchor(anchor).
    const basis = JSON.stringify([criterion, areaId, normalizeAnchor(anchor || '')]);
    return 'recon-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
  }
  // v1: mechanical-lens finding. Keep the existing logic exactly.
  const normFile = String(file || '').replace(/:\d+(:\d+)?$/, '');
  const basis = JSON.stringify([lens, areaId, normFile, normalizeSignature(signature)]);
  return 'recon-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
}

module.exports = { fingerprint, normalizeSignature, normalizeAnchor };
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
node --test bin/lib/recon/tests/fingerprint.test.js 2>&1 | tail -20
```

Expected: all tests pass, including both the original v1 tests and the new v2 tests.

- [ ] **Step 1.5: Commit**

```bash
git add bin/lib/recon/fingerprint.js bin/lib/recon/tests/fingerprint.test.js
git commit -m "Extend fingerprint.js — add v2 criterion+areaId+anchor form and normalizeAnchor"
```

---

### Task 2: New `bin/lib/recon/criteria.js` — universal criteria catalog

**Files:**
- Create: `bin/lib/recon/criteria.js`
- Test: `bin/lib/recon/tests/criteria.test.js`

The catalog stores the 16 universal criteria for P1. Each entry has `{ id, appliesTo, fragment, confidenceFloor }`. `fragment` is a path relative to `skills/_shared/` when a criteria file exists; `null` otherwise. `confidenceFloor` is `'high'` for noisy criteria, `'med'` for the rest (meaning: only file if `confidence >= confidenceFloor`). `criteriaForArea(areaTypes)` returns all criteria whose `appliesTo` is `'universal'` or intersects with the given area types. `getCriterion(id)` returns the entry or `undefined`. The structure must allow P2 to push domain entries into `CRITERIA` without touching the query functions.

- [ ] **Step 2.1: Write failing tests**

Create `bin/lib/recon/tests/criteria.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { CRITERIA, criteriaForArea, getCriterion } = require('../criteria');

test('CRITERIA is a non-empty array of criterion objects', () => {
  assert.ok(Array.isArray(CRITERIA));
  assert.ok(CRITERIA.length >= 16, `expected at least 16 universal criteria, got ${CRITERIA.length}`);
});

test('every criterion has id, appliesTo, confidenceFloor', () => {
  for (const c of CRITERIA) {
    assert.ok(typeof c.id === 'string' && c.id.length > 0, `criterion missing id: ${JSON.stringify(c)}`);
    assert.ok(
      c.appliesTo === 'universal' || (Array.isArray(c.appliesTo) && c.appliesTo.length > 0),
      `criterion ${c.id} has invalid appliesTo: ${JSON.stringify(c.appliesTo)}`,
    );
    assert.ok(
      c.confidenceFloor === 'high' || c.confidenceFloor === 'med' || c.confidenceFloor === 'low',
      `criterion ${c.id} has invalid confidenceFloor: ${c.confidenceFloor}`,
    );
  }
});

test('CRITERIA ids are unique', () => {
  const ids = CRITERIA.map((c) => c.id);
  const unique = new Set(ids);
  assert.strictEqual(unique.size, ids.length, `duplicate criterion ids: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);
});

// The 16 P1 universal criteria must all be present.
const EXPECTED_UNIVERSAL = [
  'architecture-depth', 'simplification', 'review-quality',
  'scalability', 'security-logic', 'bad-practice',
  'doc-freshness', 'dead-code', 'test-quality',
  'resilience', 'observability', 'config-secrets',
  'dependency-health', 'input-validation', 'naming-clarity',
];
for (const id of EXPECTED_UNIVERSAL) {
  test(`universal criterion '${id}' is in the catalog`, () => {
    assert.ok(getCriterion(id) !== undefined, `criterion '${id}' missing from catalog`);
  });
}

test("getCriterion returns undefined for unknown ids", () => {
  assert.strictEqual(getCriterion('nonexistent-criterion-xyz'), undefined);
});

test('criteriaForArea([]) returns all universal criteria', () => {
  const results = criteriaForArea([]);
  const universalInCatalog = CRITERIA.filter((c) => c.appliesTo === 'universal');
  assert.strictEqual(results.length, universalInCatalog.length);
  for (const c of universalInCatalog) {
    assert.ok(results.find((r) => r.id === c.id), `missing ${c.id}`);
  }
});

test('criteriaForArea with a known area type includes universal + matching domain criteria', () => {
  // Plant a domain criterion to test filtering without relying on P2 domain entries.
  // We test the logic with the real catalog — if any domain entries exist they appear.
  const universalCount = CRITERIA.filter((c) => c.appliesTo === 'universal').length;
  // With no known area types, result length == universal count.
  const noType = criteriaForArea([]);
  assert.strictEqual(noType.length, universalCount);
  // With ['frontend'], result length >= universal count (domain entries may add more).
  const frontend = criteriaForArea(['frontend']);
  assert.ok(frontend.length >= universalCount);
});

test('criteriaForArea deduplicates when the same criterion matches multiple area types', () => {
  // If a criterion's appliesTo includes two types both present, it must appear only once.
  const results = criteriaForArea(['frontend', 'library']);
  const ids = results.map((c) => c.id);
  const unique = new Set(ids);
  assert.strictEqual(unique.size, ids.length, 'duplicate criterion in criteriaForArea result');
});

test('criteria with a fragment field point to a string path', () => {
  for (const c of CRITERIA) {
    if (c.fragment !== undefined && c.fragment !== null) {
      assert.ok(typeof c.fragment === 'string' && c.fragment.length > 0, `criterion ${c.id} has non-string fragment`);
    }
  }
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
node --test bin/lib/recon/tests/criteria.test.js 2>&1 | tail -25
```

Expected: `Cannot find module '../criteria'` or equivalent.

- [ ] **Step 2.3: Implement `bin/lib/recon/criteria.js`**

Create the file:

```js
'use strict';

// Universal criteria catalog for recon v2.
// P1 populates all 16 universal criteria. Domain criteria (a11y, i18n, etc.) are added in P2.
// Each entry: { id, appliesTo, fragment, confidenceFloor }
//   appliesTo:      'universal' | string[]  (area type strings, e.g. ['frontend','library'])
//   fragment:       path relative to skills/_shared/ for a criteria detail file, or null
//   confidenceFloor:'high' | 'med' | 'low'  — minimum confidence to FILE a finding for this criterion

const CRITERIA = [
  {
    id: 'architecture-depth',
    appliesTo: 'universal',
    fragment: 'criteria-architecture-depth.md',
    confidenceFloor: 'med',
  },
  {
    id: 'simplification',
    appliesTo: 'universal',
    fragment: 'criteria-simplification.md',
    confidenceFloor: 'med',
  },
  {
    id: 'review-quality',
    appliesTo: 'universal',
    fragment: 'criteria-review-quality.md',
    confidenceFloor: 'med',
  },
  {
    id: 'scalability',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'security-logic',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'bad-practice',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
  },
  {
    id: 'doc-freshness',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
  },
  {
    id: 'dead-code',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
  },
  {
    id: 'test-quality',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
  },
  {
    id: 'resilience',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'observability',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
  },
  {
    id: 'config-secrets',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'dependency-health',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
  },
  {
    id: 'input-validation',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'high',
  },
  {
    id: 'naming-clarity',
    appliesTo: 'universal',
    fragment: null,
    confidenceFloor: 'med',
  },
];

// Build a lookup map once on load for O(1) getCriterion.
const _byId = new Map(CRITERIA.map((c) => [c.id, c]));

// Returns the criterion with the given id, or undefined.
function getCriterion(id) {
  return _byId.get(id);
}

// Returns criteria applicable to the given area types.
// Always includes all universal criteria.
// Adds any domain criteria whose appliesTo array intersects with areaTypes.
// Result is deduplicated (a criterion can only appear once).
function criteriaForArea(areaTypes) {
  const typeSet = new Set(areaTypes || []);
  const seen = new Set();
  const result = [];
  for (const c of CRITERIA) {
    if (seen.has(c.id)) continue;
    if (c.appliesTo === 'universal') {
      seen.add(c.id);
      result.push(c);
    } else if (Array.isArray(c.appliesTo) && c.appliesTo.some((t) => typeSet.has(t))) {
      seen.add(c.id);
      result.push(c);
    }
  }
  return result;
}

module.exports = { CRITERIA, criteriaForArea, getCriterion };
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
node --test bin/lib/recon/tests/criteria.test.js 2>&1 | tail -25
```

Expected: all tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add bin/lib/recon/criteria.js bin/lib/recon/tests/criteria.test.js
git commit -m "Add criteria.js — universal catalog with criteriaForArea and getCriterion"
```

---

### Task 3: Extend `validate-finding.js` — v2 Finding shape

**Files:**
- Modify: `bin/lib/recon/validate-finding.js`
- Test: `bin/lib/recon/tests/validate-finding.test.js`

The v2 Finding shape has different required fields from v1: `criterion` (known catalog id), `areaId`, `anchor`, `severity`, `confidence`, `title`, `evidence`, `suggestedApproach`, `acceptance`. The v1 shape (`lens`, `area`, `signature`, `category`, `files`, `suggestion`) stays valid for backward compatibility. Add a `validateFindingV2(obj)` function that validates the v2 shape; keep `validateFinding` unchanged. Both are exported.

`validateFindingV2` checks:
- `criterion` is a non-empty string AND is a known id in the catalog (`getCriterion(obj.criterion) !== undefined`)
- `areaId`, `anchor`, `title`, `evidence`, `suggestedApproach`, `acceptance` are required non-empty strings
- `severity` ∈ `{'low','medium','high','critical'}`
- `confidence` ∈ `{'high','med','low'}`
- Accumulates all errors in one pass

- [ ] **Step 3.1: Write failing tests**

Append to `bin/lib/recon/tests/validate-finding.test.js`:

```js
// ── v2 Finding shape ───────────────────────────────────────────────────────

const { validateFindingV2 } = require('../validate-finding');

function validV2Finding(overrides = {}) {
  return {
    criterion: 'simplification',
    areaId: 'src/api',
    anchor: 'src/api/user.js#getUser',
    severity: 'medium',
    confidence: 'high',
    title: 'getUser is a passthrough to the repository',
    evidence: 'src/api/user.js#getUser delegates directly to UserRepository.find with no added logic.',
    suggestedApproach: 'Inline the call at the call site, or add caching/auth in this method.',
    acceptance: 'getUser adds caching, authorization, or enrichment; or is removed and callers use the repository directly.',
    ...overrides,
  };
}

test('validateFindingV2: a complete v2 finding passes', () => {
  const result = validateFindingV2(validV2Finding());
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

test('validateFindingV2: missing required field fails with a named error', () => {
  const f = validV2Finding();
  delete f.anchor;
  const result = validateFindingV2(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('anchor')), result.errors.join('; '));
});

test('validateFindingV2: suggestedApproach is required (not suggestion)', () => {
  const f = validV2Finding();
  delete f.suggestedApproach;
  const result = validateFindingV2(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('suggestedApproach')), result.errors.join('; '));
});

test('validateFindingV2: unknown criterion id fails', () => {
  const result = validateFindingV2(validV2Finding({ criterion: 'not-a-real-criterion' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('criterion') && e.includes('unknown')), result.errors.join('; '));
});

test('validateFindingV2: bad severity enum fails', () => {
  const result = validateFindingV2(validV2Finding({ severity: 'urgent' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('severity')));
});

test('validateFindingV2: bad confidence enum fails', () => {
  const result = validateFindingV2(validV2Finding({ confidence: 'medium' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('confidence')));
});

test('validateFindingV2: accumulates all errors in one pass', () => {
  const result = validateFindingV2({ severity: 'urgent', confidence: 'medium' });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length >= 5, `got ${result.errors.length}: ${result.errors.join('; ')}`);
});

test('validateFindingV2: valid result carries the original fields', () => {
  const f = validV2Finding();
  const result = validateFindingV2(f);
  assert.strictEqual(result.value.criterion, 'simplification');
  assert.strictEqual(result.value.anchor, 'src/api/user.js#getUser');
  assert.strictEqual(result.value.suggestedApproach, f.suggestedApproach);
  assert.strictEqual(result.value.acceptance, f.acceptance);
});

test('validateFinding (v1) still works after extending the module', () => {
  // Guard against accidentally breaking the v1 export.
  const { validateFinding: v1 } = require('../validate-finding');
  const f = {
    title: 'T', lens: 'todo-comments', category: 'Architecture',
    severity: 'low', confidence: 'high', area: 'src',
    files: ['src/a.js'], evidence: 'E', suggestion: 'S', acceptance: 'A',
    signature: 'sig',
  };
  const result = v1(f);
  assert.strictEqual(result.ok, true);
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
node --test bin/lib/recon/tests/validate-finding.test.js 2>&1 | tail -25
```

Expected: `validateFindingV2 is not a function` or similar.

- [ ] **Step 3.3: Implement `validateFindingV2` in `validate-finding.js`**

Add to `bin/lib/recon/validate-finding.js` (after the existing code, before `module.exports`):

```js
const { getCriterion } = require('./criteria');

// v2 Finding shape: criterion (catalog id), areaId, anchor, severity, confidence,
// title, evidence, suggestedApproach, acceptance.
// Returns { ok: boolean, errors: string[], value? }.
const V2_REQUIRED_STRINGS = [
  'criterion', 'areaId', 'anchor', 'title', 'evidence', 'suggestedApproach', 'acceptance',
];

function validateFindingV2(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, errors: ['finding: must be an object'] };
  }

  for (const field of V2_REQUIRED_STRINGS) {
    const v = obj[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`${field}: required non-empty string (got ${JSON.stringify(v)})`);
    }
  }

  // Criterion must be a known catalog id (only check when it passed the string check).
  if (typeof obj.criterion === 'string' && obj.criterion.trim() !== '') {
    if (getCriterion(obj.criterion) === undefined) {
      errors.push(`criterion: unknown criterion id "${obj.criterion}" — must be a registered catalog id`);
    }
  }

  if (typeof obj.severity === 'string' && !SEVERITY_VALUES.has(obj.severity)) {
    errors.push(`severity: must be one of ${[...SEVERITY_VALUES].join('|')} (got "${obj.severity}")`);
  } else if (typeof obj.severity !== 'string') {
    errors.push(`severity: required non-empty string (got ${JSON.stringify(obj.severity)})`);
  }

  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  } else if (typeof obj.confidence !== 'string') {
    errors.push(`confidence: required non-empty string (got ${JSON.stringify(obj.confidence)})`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}
```

Also update the `module.exports` line at the bottom:

```js
module.exports = { validateFinding, validateFindingV2, SEVERITY_VALUES, CONFIDENCE_VALUES, CATEGORY_VALUES, REQUIRED_STRINGS };
```

- [ ] **Step 3.4: Run all validate-finding tests to verify they pass**

```bash
node --test bin/lib/recon/tests/validate-finding.test.js 2>&1 | tail -25
```

Expected: all tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add bin/lib/recon/validate-finding.js bin/lib/recon/tests/validate-finding.test.js
git commit -m "Extend validate-finding.js — add validateFindingV2 for the v2 Finding shape"
```

---

### Task 4: Extend `issue-payload.js` — v2 body and criterion label

**Files:**
- Modify: `bin/lib/recon/issue-payload.js`
- Test: `bin/lib/recon/tests/issue-payload.test.js`

The v2 body uses `finding.anchor` (Current State), `finding.suggestedApproach` (Deliverables), `finding.acceptance` (Acceptance Criteria). The fingerprint marker uses `finding.id`. Labels: `['recon', 'recon:' + severity, 'recon:' + criterion]`. Add a `toIssuePayloadV2(finding)` function; keep `toIssuePayload` unchanged.

- [ ] **Step 4.1: Write failing tests**

Append to `bin/lib/recon/tests/issue-payload.test.js`:

```js
// ── v2 issue payload ───────────────────────────────────────────────────────

const { toIssuePayloadV2 } = require('../issue-payload');

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

test('v2 labels are recon + recon:<severity> + recon:<criterion>', () => {
  assert.deepStrictEqual(
    toIssuePayloadV2(V2_FINDING).labels,
    ['recon', 'recon:medium', 'recon:simplification'],
  );
});

test('v2 title is the finding title', () => {
  assert.strictEqual(toIssuePayloadV2(V2_FINDING).title, V2_FINDING.title);
});

test('v2 body embeds the fingerprint marker', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  assert.ok(body.includes('<!-- recon-fingerprint: recon-ab12cd34 -->'), 'marker missing');
});

test('v2 body has ## Current State containing anchor and evidence', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  assert.ok(body.includes('## Current State'), '## Current State missing');
  assert.ok(body.includes('src/api/user.js#getUser'), 'anchor missing');
  assert.ok(body.includes('delegates directly to UserRepository.find'), 'evidence missing');
});

test('v2 body has ## Deliverables containing suggestedApproach', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  assert.ok(body.includes('## Deliverables'), '## Deliverables missing');
  assert.ok(body.includes('Inline the call at the call site'), 'suggestedApproach missing');
});

test('v2 body has ## Acceptance Criteria containing acceptance', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  assert.ok(body.includes('## Acceptance Criteria'), '## Acceptance Criteria missing');
  assert.ok(body.includes('adds caching, authorization'), 'acceptance missing');
});

test('v2 fingerprint marker is re-extractable with the standard regex', () => {
  const { body } = toIssuePayloadV2(V2_FINDING);
  const m = body.match(/<!--\s*recon-fingerprint:\s*(recon-[0-9a-f]{8})\s*-->/);
  assert.ok(m, 'regex did not match');
  assert.strictEqual(m[1], 'recon-ab12cd34');
});

test('toIssuePayload (v1) still works after extending the module', () => {
  // Guard: existing v1 export must be unaffected.
  const { toIssuePayload: v1 } = require('../issue-payload');
  const FINDING = {
    id: 'recon-abc12345', title: 'T', lens: 'oversized-file', category: 'architecture',
    severity: 'high', confidence: 'high', area: 'apps/web',
    files: ['apps/web/big.js'], evidence: 'E', suggestion: 'S', acceptance: 'A',
  };
  const p = v1(FINDING);
  assert.ok(p.body.includes('<!-- recon-fingerprint: recon-abc12345 -->'));
  assert.deepStrictEqual(p.labels, ['recon', 'recon:high']);
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

```bash
node --test bin/lib/recon/tests/issue-payload.test.js 2>&1 | tail -25
```

Expected: `toIssuePayloadV2 is not a function`.

- [ ] **Step 4.3: Implement `toIssuePayloadV2` in `issue-payload.js`**

Append before the existing `module.exports` line:

```js
// v2: body uses anchor (Current State), suggestedApproach (Deliverables), acceptance (Acceptance Criteria).
// Labels include the criterion.
function toIssuePayloadV2(finding) {
  const marker = `<!-- recon-fingerprint: ${finding.id} -->`;
  const body = [
    marker,
    '',
    `**Criterion:** ${finding.criterion} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence} | **Area:** ${finding.areaId}`,
    '',
    '## Current State',
    '',
    `Anchor: \`${finding.anchor}\``,
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
    '_Filed by `/recon`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.title,
    body,
    labels: ['recon', `recon:${finding.severity}`, `recon:${finding.criterion}`],
  };
}
```

Update `module.exports`:

```js
module.exports = { toIssuePayload, toIssuePayloadV2 };
```

- [ ] **Step 4.4: Run tests to verify they pass**

```bash
node --test bin/lib/recon/tests/issue-payload.test.js 2>&1 | tail -25
```

Expected: all tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add bin/lib/recon/issue-payload.js bin/lib/recon/tests/issue-payload.test.js
git commit -m "Extend issue-payload.js — add toIssuePayloadV2 with anchor, suggestedApproach, criterion label"
```

---

### Task 5: Add `validate-findings` CLI command to `bin/recon.js`

**Files:**
- Modify: `bin/recon.js`
- Test: `bin/lib/recon/tests/cli-validate-findings.test.js`

`validate-findings <findings.json>` reads a JSON array of v2 Finding objects, validates each via `validateFindingV2` (drops malformed with a logged reason on stderr), fingerprints via the v2 `fingerprint({criterion,areaId,anchor})` form, deduplicates via the existing `decide(finding, issueIndex, cache)`, writes the updated cache (unless `--dry-run`), emits gh-ready payloads on stdout as a JSON array. Options: `--root <dir>`, `--issues <file>`, `--run-id <id>`, `--dry-run`.

- [ ] **Step 5.1: Write failing CLI tests**

Create `bin/lib/recon/tests/cli-validate-findings.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-vf-'));
}

function runValidateFindings(root, findingsFile, extraArgs = []) {
  const result = spawnSync(
    'node',
    [CLI, 'validate-findings', findingsFile, '--root', root, ...extraArgs],
    { encoding: 'utf8' },
  );
  return result;
}

function validFinding(overrides = {}) {
  return {
    criterion: 'simplification',
    areaId: 'src/api',
    anchor: 'src/api/user.js#getUser',
    severity: 'medium',
    confidence: 'high',
    title: 'getUser is a passthrough',
    evidence: 'getUser delegates directly to UserRepository.find with no added logic.',
    suggestedApproach: 'Inline the call or add caching.',
    acceptance: 'getUser adds caching or is removed.',
    ...overrides,
  };
}

test('validate-findings: valid finding emits one payload on stdout', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

  const payloads = JSON.parse(result.stdout);
  assert.ok(Array.isArray(payloads), 'stdout must be a JSON array');
  assert.strictEqual(payloads.length, 1, 'expected 1 payload');
  assert.ok(payloads[0].title === f.title, 'title mismatch');
  assert.ok(Array.isArray(payloads[0].labels), 'labels must be an array');
  assert.ok(payloads[0].labels.includes('recon'), 'missing recon label');
  assert.ok(payloads[0].labels.includes('recon:simplification'), 'missing criterion label');
  assert.ok(payloads[0].body.includes('<!-- recon-fingerprint: recon-'), 'fingerprint marker missing');
});

test('validate-findings: malformed finding is dropped with a stderr reason, valid ones survive', () => {
  const root = tmp();
  const malformed = { criterion: 'simplification', severity: 'medium' }; // missing required fields
  const good = validFinding({ criterion: 'dead-code', anchor: 'src/util.js#trimPath', title: 'trimPath is unused' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([malformed, good]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0);

  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'only the valid finding should survive');
  assert.ok(result.stderr.includes('dropped'), `expected "dropped" in stderr: ${result.stderr}`);
});

test('validate-findings: --dry-run emits payloads but does not write cache', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--dry-run']);
  assert.strictEqual(result.status, 0);

  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1);
  assert.strictEqual(
    fs.existsSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json')),
    false,
    'cache must not be written in dry-run',
  );
});

test('validate-findings: finding already open in issue index is skipped (dedup)', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  // First run to learn the fingerprint.
  const firstResult = runValidateFindings(root, findingsFile);
  const firstPayloads = JSON.parse(firstResult.stdout);
  assert.strictEqual(firstPayloads.length, 1);
  const fp = firstPayloads[0].body.match(/<!--\s*recon-fingerprint:\s*(recon-[0-9a-f]{8})\s*-->/)[1];

  // Build an issue index pretending the fingerprint is already open.
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 1, state: 'open', labels: ['recon'], fingerprint: fp }]));

  const secondResult = runValidateFindings(root, findingsFile, ['--issues', issuesFile]);
  assert.strictEqual(secondResult.status, 0);
  const secondPayloads = JSON.parse(secondResult.stdout);
  assert.strictEqual(secondPayloads.length, 0, 'open finding must be skipped (dedup)');
});

test('validate-findings: exits non-zero when findings file is missing', () => {
  const root = tmp();
  const result = runValidateFindings(root, path.join(root, 'nonexistent.json'));
  assert.notStrictEqual(result.status, 0, 'should exit non-zero for missing file');
});

test('validate-findings: writes cache after a non-dry-run', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0);
  assert.ok(
    fs.existsSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json')),
    'cache must be written after a non-dry-run',
  );
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

```bash
node --test bin/lib/recon/tests/cli-validate-findings.test.js 2>&1 | tail -25
```

Expected: exit code failures or `usage:` stderr because the `validate-findings` command does not exist yet.

- [ ] **Step 5.3: Implement `cmdValidateFindings` in `bin/recon.js`**

Add these require lines near the top of `bin/recon.js`, after the existing requires:

```js
const { validateFindingV2 } = require('./lib/recon/validate-finding');
const { toIssuePayloadV2 } = require('./lib/recon/issue-payload');
```

Then add the command implementation before the `main` function:

```js
function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1]; // positional after the subcommand name
  if (!findingsPath) {
    process.stderr.write(
      'usage: recon.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--run-id <id>] [--dry-run]\n',
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
        `[recon] validate-findings: dropped finding "${(f && f.title) || '?'}" ` +
        `(criterion ${(f && f.criterion) || '?'}, area ${(f && f.areaId) || '?'}): ` +
        `${v.errors.join('; ')}\n`,
      );
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

    const decision = decide(finding, issueIndex, cache);
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
  }

  // 5. Emit gh-ready payloads on stdout.
  process.stdout.write(JSON.stringify(payloads, null, 2) + '\n');
  process.stderr.write(
    `[recon] validate-findings ${args.runId || '?'}: ` +
    `${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`,
  );
}
```

Add `validate-findings` to the `main` dispatch in `bin/recon.js`, after `if (cmd === 'pull-issues') return cmdPullIssues(args);`:

```js
if (cmd === 'validate-findings') return cmdValidateFindings(args);
```

Update the usage line at the bottom of `main`:

```js
process.stderr.write(
  'usage: recon.js <command> [options]\n' +
  '  run [--area <path>] [--dry-run] [--root <dir>] [--issues <file>]\n' +
  '  validate-findings <findings.json> [--root <dir>] [--issues <file>] [--run-id <id>] [--dry-run]\n' +
  '  plan-judgment --areas <a,b> [--lenses <l,m>] [--max-subagents <n>] [--run-id <id>]\n' +
  '  ingest-judgment <results.json> [--root <dir>] [--run-id <id>]\n' +
  '  status [--fail-on regressed|critical]\n' +
  '  churn-report [--fail-on-high-churn <ratio>]\n' +
  '  pull-issues --label <label> --issues <file> [--min-severity <sev>]\n',
);
```

Also update `module.exports` at the bottom of `bin/recon.js` to include `cmdValidateFindings`:

```js
module.exports = { parseArgs, cmdRun, cmdIngestJudgment, cmdValidateFindings, main, selectAreas, collectSignals };
```

- [ ] **Step 5.4: Run all validate-findings CLI tests to verify they pass**

```bash
node --test bin/lib/recon/tests/cli-validate-findings.test.js 2>&1 | tail -25
```

Expected: all tests pass.

- [ ] **Step 5.5: Run the full test suite to confirm nothing is broken**

```bash
node --test tests/ bin/lib/recon/tests/*.test.js 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 5.6: Commit**

```bash
git add bin/recon.js bin/lib/recon/tests/cli-validate-findings.test.js
git commit -m "Add validate-findings CLI command — validate v2 findings, fingerprint, dedup, emit payloads"
```

---

### Task 6: Rewrite `skills/recon/SKILL.md` — v2 judge spine

**Files:**
- Rewrite: `skills/recon/SKILL.md`
- Test (grep-verify): `bin/lib/recon/tests/skill-md.test.js` (extend)

The SKILL.md is markdown, not unit-testable by behavior. The approach: write the full content, then grep-verify required structural anchors exist in `skill-md.test.js`.

Required anchors to grep-verify:
- `## When to Use`
- `## Input`
- `## Workflow`
- `## Anti-Patterns`
- `## Component-Skill Contract`
- `## Relationship to Other Skills`
- `## Next Actions`
- `validate-findings`
- `$PIPELINE_RUN_DIR`
- `## Routine Configuration`
- `--dry-run`
- `criteriaForArea`
- `anchor`
- No emojis (grep for common emoji unicode ranges)

- [ ] **Step 6.1: Read the existing skill-md test to know the pattern**

```bash
cat bin/lib/recon/tests/skill-md.test.js
```

The test reads `skills/recon/SKILL.md` and asserts structural anchors are present. You will add new asserts for the v2 anchors after rewriting.

- [ ] **Step 6.2: Write the new `skills/recon/SKILL.md`**

Replace the entire file with:

```markdown
---
name: claude-tweaks:recon
description: Use when you want a proactive, report-only sweep of one code area that surfaces improvement opportunities as deduplicated GitHub issues. An LLM judges the slice against the universal criteria catalog and files the work worth doing. Never edits code. Keywords - recon, sweep, repo audit, technical debt, proactive, github issues, llm judge.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.

# Recon — LLM-as-Code-Judge, Proactive Repo Improvement

A recurring watchman doing rounds: reads one directory slice, judges it against the universal criteria catalog, fingerprints each finding, dedups against open GitHub issues, and files the work worth doing. The LLM is the spine. Deterministic helpers handle fingerprint, dedup, and issue-payload projection. It never edits code.

```
              [ /claude-tweaks:recon ] <- utility (no fixed lifecycle position)
                           |  judges the slice; surfaces findings
                           v
findings -> validate-findings -> file GitHub issue (label: recon) -> /claude-tweaks:specify -> /claude-tweaks:build / /claude-tweaks:flow
         +- fuzzy / not-yet -> /claude-tweaks:capture (INBOX)
```

The plugin reacts to changes you make; `/recon` surfaces the changes worth making.

## When to Use

- You want a hands-off pass that keeps technical debt visible without driving each scan yourself.
- You want LLM-judged improvements filed as GitHub issues that drop into `/specify` with near-zero translation.
- You want findings deduplicated against work already tracked — never re-flood the tracker.
- You want to run on demand against a specific area (rotation is Phase 3).

Not for: auto-fixing (report-only), CI gating (CI stays reactive), or replacing INBOX/specs (recon owns no backlog — it routes findings into the stores that already exist).

## Input

`$ARGUMENTS` may contain:

- `--area <path>` — the directory slice to judge (relative to root; required for on-demand runs).
- `--dry-run` — fingerprint and dedup, print payloads, but write nothing to cache and file no issues.
- `--root <dir>` — scan a project elsewhere (default: current working directory).

Scope note: auto-rotation (picking the next slice automatically) is Phase 3. In Phase 1, always supply `--area`.

## Workflow

**Step 1 — SCOPE: resolve the area.**

The `--area` argument is the directory slice to judge. Verify it exists:

```bash
ls "${ROOT:-$PWD}/${AREA}"
```

If the path does not exist, stop and ask the user to correct it. If `--area` was not supplied, ask the user which directory to judge.

Set `AREA` and `ROOT` for the rest of the steps.

**Step 2 — GATHER OPEN ISSUES for dedup.**

Collect existing `recon`-labelled issues so the engine can skip/reopen correctly:

```bash
gh issue list --label recon --state all --json number,state,labels,body --limit 500 > /tmp/recon-issues-raw.json
```

Parse each issue body for the fingerprint marker `<!-- recon-fingerprint: recon-XXXXXXXX -->` and build an array of `{ number, state, labels, fingerprint }` objects. Write to `/tmp/recon-open.json`. If `gh` is unavailable or the repo has no recon issues, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

**Step 3 — READ THE SLICE.**

Read every source file in `${ROOT}/${AREA}`. Use Read and Glob:

```bash
# List all files in the area
find "${ROOT}/${AREA}" -type f | sort
```

Read each file in full. Hold the full content in context — this is the material the judge will apply criteria to.

**Step 4 — CLASSIFY: select applicable criteria.**

For Phase 1 the area type is not yet detected (that is Phase 2). Apply all universal criteria: `architecture-depth`, `simplification`, `review-quality`, `scalability`, `security-logic`, `bad-practice`, `doc-freshness`, `dead-code`, `test-quality`, `resilience`, `observability`, `config-secrets`, `dependency-health`, `input-validation`, `naming-clarity`.

You can verify the catalog at any time:

```bash
node -e "const {criteriaForArea}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/recon/criteria.js'); console.log(criteriaForArea([]).map(c=>c.id).join(', '))"
```

**Step 5 — JUDGE: apply each criterion holistically.**

For each universal criterion, read the code with that criterion as the lens. Apply the criterion holistically — this is a behavioral judgment, not a mechanical check. Call deterministic tools as evidence when they help (lint, grep, git log); skip them gracefully when not available. Evidence grounds the finding; do not file speculative findings.

For `architecture-depth`, `simplification`, and `review-quality`: read the criterion fragment embedded here before judging:

- `architecture-depth`: read `skills/_shared/criteria-architecture-depth.md` relative to `$CLAUDE_PLUGIN_ROOT`.
- `simplification`: read `skills/_shared/criteria-simplification.md` relative to `$CLAUDE_PLUGIN_ROOT`.
- `review-quality`: read `skills/_shared/criteria-review-quality.md` relative to `$CLAUDE_PLUGIN_ROOT`.

After applying all enumerated criteria, run a final "anything else worth flagging?" pass to catch what the checklist missed.

**Step 6 — EMIT FINDINGS as a JSON array.**

For each finding, emit exactly this shape:

```json
{
  "criterion": "<catalog id, e.g. 'simplification'>",
  "areaId": "<directory path relative to root, e.g. 'src/api'>",
  "anchor": "<relfile#NearestNamedSymbol — see anchor rules below>",
  "severity": "<low|medium|high|critical>",
  "confidence": "<high|med|low>",
  "title": "<short summary>",
  "evidence": "<what was observed — cites anchor; no line numbers>",
  "suggestedApproach": "<described fix in prose — NO code>",
  "acceptance": "<acceptance criteria>"
}
```

**Anchor rules (critical for dedup stability):**
- Format: `relative/file/path#NearestNamedSymbol`
- `NearestNamedSymbol` is the name of the nearest enclosing function, class, const, or section header.
- No line numbers. No surrounding prose. No absolute paths.
- Examples: `src/api/user.js#getUser`, `lib/parser.js#Parser`, `bin/recon.js#cmdRun`
- When a finding is module-level (no named symbol), use the file itself: `src/api/user.js#module`

Write the array to `/tmp/recon-findings.json`.

**Step 7 — VALIDATE, FINGERPRINT, DEDUP.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" validate-findings /tmp/recon-findings.json \
  --root "${ROOT:-$PWD}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/recon-payloads.json
```

Read `/tmp/recon-payloads.json`. The command:
- Validates each finding (drops malformed ones with a logged reason on stderr).
- Fingerprints via `criterion + areaId + normalizeAnchor(anchor)`.
- Deduplicates against open `recon` issues and the local cache.
- Writes the updated cache (unless `--dry-run`).
- Emits gh-ready payloads on stdout as a JSON array.

**Step 8 — FILE / REOPEN ISSUES.**

For each payload in `/tmp/recon-payloads.json`, call `gh issue create`. The engine is emit-only; filing is always done by the skill:

```bash
gh issue create \
  --title "<payload.title>" \
  --body "<payload.body>" \
  --label recon \
  --label "recon:<severity>" \
  --label "recon:<criterion>"
```

For `reopen` decisions (a finding matching a closed non-`wontfix` issue has reappeared), reopen the issue and comment:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

In `--dry-run` mode, print the payloads and the `gh` commands that would run, but do not call `gh`.

**Step 9 — SUMMARIZE.**

Report: how many findings were emitted, how many survived dedup, how many issues were filed / skipped / remembered. List any new issue URLs. In interactive mode, present findings as a batch table and let the user route each to: file issue / INBOX (`/capture`) / `/specify` directly / dismiss.

## Routine Configuration

`/recon` is designed to run unattended on a schedule via a Claude Code Routine (`/schedule`). Design for small predictable sips: one area per run so a scheduled run is cheap and a skipped run is harmless.

```
Name:      recon-daily
Schedule:  daily at 03:00 (off-peak)
Prompt:    /claude-tweaks:recon --area <area>
```

Auto-rotation (picking the next area automatically each run) is Phase 3. Until then, set a fixed `--area` in the Routine prompt or rotate manually.

> **Billing note:** Routines run inside the subscription (no separate API key); verify any automation-credit specifics against the live account.

## Next Actions

1. `/claude-tweaks:specify <issue-url-or-title>` — promote a filed recon issue into an agent-sized spec. **(Recommended when high-severity issues were filed.)**
2. `/claude-tweaks:capture <finding>` — park a fuzzy or below-threshold finding in INBOX for later triage.
3. `/claude-tweaks:recon --area <other-path>` — re-run on a different directory slice.
4. `/claude-tweaks:tidy` — fold the new issues into a backlog-hygiene pass alongside INBOX and deferred items.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:recon` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Editing code to "just fix" a finding during a recon run | Recon is report-only. Fixing belongs to `/build` / `/flow` after a finding is promoted to a spec via `/specify`. |
| Filing every finding regardless of severity or confidence | Floods the tracker. Below-threshold or low-confidence findings are remembered in the cache, not filed. |
| Re-filing a finding that already has an open issue | Duplicates the tracker. Always run `validate-findings` with `--issues` before filing. |
| Hashing the prose description instead of the anchor | The dedup contract requires a stable structural anchor (`relfile#NearestSymbol`), not a content hash. Prose changes every run. |
| Emitting a line number in the anchor | Line numbers move when code is edited, breaking dedup. The anchor format is `file#Symbol` — no `:12`, no `:12:3`. |
| Calling the network from `recon.js` or `criteria.js` | The engine is emit-only and unit-testable. The skill hands payloads to `gh`; the engine never does. |
| Treating the cache as durable state | The cache is a rebuildable optimization. GitHub issue state is the source of truth for cross-run memory. |
| Filing a finding with `confidence: 'low'` for a noisy criterion | Noisy criteria (`security-logic`, `config-secrets`, `input-validation`, `resilience`) require `confidence: 'high'` to file. The confidence floor is enforced by the skill judgment, not the engine — the engine validates the shape, not the policy. |
| Reporting rotation in P1 | Auto-rotation (picking the next area automatically) is Phase 3. P1 is on-demand with `--area` explicitly supplied. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:specify` | Recon findings are pre-specs — a filed `recon` issue body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so `/specify` consumes it with near-zero translation. |
| `/claude-tweaks:capture` | Fuzzy or below-threshold findings route to INBOX via `/capture` instead of inflating the tracker. |
| `/claude-tweaks:tidy` | `/tidy` audits the backlog (INBOX, deferred, specs); recon-filed issues are another input it folds into a hygiene pass. |
| `/claude-tweaks:flow` | `/flow --from-recon` pulls the `recon`-labelled issues this skill files and runs them as a multi-spec batch (derive specs via `/specify` -> build/test/review/polish/wrap-up). |
| `/claude-tweaks:review` | `/review` judges diffs reactively; `/recon` judges latent code proactively. Both reuse the same criteria fragments from `skills/_shared/`. |
| `/claude-tweaks:deepen` | `/deepen` applies the architecture-depth criterion reactively to code you are changing; `/recon` applies it proactively on a schedule. Both read `criteria-architecture-depth.md`. |
| `/claude-tweaks:simplify` | `/simplify` applies the simplification criterion reactively; `/recon` applies it proactively. Both read `criteria-simplification.md`. |
```

- [ ] **Step 6.3: Run grep-verify tests against the new SKILL.md**

Read `bin/lib/recon/tests/skill-md.test.js` and add assertions for the v2 anchors. Append to that file:

```js
// ── v2 recon SKILL.md anchors ──────────────────────────────────────────────

const skillMdPath = path.join(__dirname, '..', '..', '..', '..', 'skills', 'recon', 'SKILL.md');

test('v2 SKILL.md: exists', () => {
  assert.ok(fs.existsSync(skillMdPath), `SKILL.md not found at ${skillMdPath}`);
});

['## When to Use', '## Input', '## Workflow', '## Anti-Patterns',
 '## Component-Skill Contract', '## Relationship to Other Skills',
 '## Next Actions', '## Routine Configuration',
].forEach((anchor) => {
  test(`v2 SKILL.md: contains section '${anchor}'`, () => {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    assert.ok(content.includes(anchor), `missing section: ${anchor}`);
  });
});

['validate-findings', '$PIPELINE_RUN_DIR', '--dry-run', 'criteriaForArea', 'anchor',
 'recon-fingerprint', 'NearestNamedSymbol',
].forEach((token) => {
  test(`v2 SKILL.md: contains required token '${token}'`, () => {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    assert.ok(content.includes(token), `missing required token: ${token}`);
  });
});

test('v2 SKILL.md: no emojis (common emoji unicode sequences)', () => {
  const content = fs.readFileSync(skillMdPath, 'utf8');
  // Match common emoji ranges: U+1F300-U+1FAFF (Misc Symbols, Emoticons, etc.)
  // Using the surrogate pair regex that matches in JS UTF-16 strings.
  const emojiRe = /[\u{1F300}-\u{1FAFF}]/u;
  assert.ok(!emojiRe.test(content), 'SKILL.md must not contain emojis');
});
```

Then run:

```bash
node --test bin/lib/recon/tests/skill-md.test.js 2>&1 | tail -30
```

Expected: all v2 anchor assertions pass.

- [ ] **Step 6.4: Run the full test suite**

```bash
node --test tests/ bin/lib/recon/tests/*.test.js 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add skills/recon/SKILL.md bin/lib/recon/tests/skill-md.test.js
git commit -m "Rewrite skills/recon/SKILL.md — v2 judge spine: SCOPE → JUDGE → validate-findings → gh issue create"
```

---

## Self-Review

### 1. Spec coverage

Checking each P1 requirement from `2026-06-15-recon-v2-llm-judge-design.md` (§13 P1):

| Requirement | Covered by |
|-------------|-----------|
| SKILL drives Claude over one directory slice | Task 6 (SKILL.md Steps 1-9) |
| Universal criteria (16 total) | Task 2 (criteria.js) + Task 6 (Step 4/5) |
| Stable-signature output: `criterion + areaId + anchor` | Task 1 (fingerprint.js v2 form) |
| `normalizeAnchor` strips line refs, collapses whitespace | Task 1 |
| Validate v2 Finding shape; known criterion, enums, required fields including anchor/suggestedApproach/acceptance | Task 3 (validateFindingV2) |
| Dedup via `decide(finding, issueIndex, cache)` | Task 5 (validate-findings command) |
| Issue filing (output #1): `## Current State`, `## Deliverables`, `## Acceptance Criteria`, marker | Task 4 (toIssuePayloadV2) |
| Labels: `['recon', 'recon:'+severity, 'recon:'+criterion]` | Task 4 |
| `validate-findings` CLI: emit-only, zero-network | Task 5 |
| `--dry-run` support | Task 5 + Task 6 |
| Keep v1 plumbing (existing commands not removed) | Task 5 (only adds; does not remove) |
| Tests co-located under `bin/lib/recon/tests/` | Tasks 1-6 |
| Full house structure in SKILL.md | Task 6 |
| Component-Skill Contract on `$PIPELINE_RUN_DIR` | Task 6 |
| Bidirectional Relationship table (/specify, /capture, /tidy, /flow, /review, /deepen, /simplify) | Task 6 |
| `fragment` pointers to `_shared/criteria-*.md` for arch-depth/simplification/review-quality | Task 2 |
| Structure lets P2 add domain criteria without refactoring | Task 2 (CRITERIA array + criteriaForArea logic) |

No gaps found.

### 2. Placeholder scan

Searched for "TBD", "TODO", "implement later", "fill in details", "add appropriate", "similar to Task". None found.

All code blocks are complete. All `run:` commands include expected output or a description of expected behavior. No step describes what to do without showing how.

### 3. Type consistency

Tracing key names across tasks:

- `fingerprint({ criterion, areaId, anchor })` — defined in Task 1, called in Task 5. Consistent.
- `validateFindingV2(obj) -> { ok, errors, value? }` — defined in Task 3, called in Task 5. Consistent.
- `toIssuePayloadV2(finding) -> { title, body, labels }` — defined in Task 4, called in Task 5. Consistent.
- `criteriaForArea(areaTypes) -> Criterion[]` — defined in Task 2, referenced in Task 6 SKILL.md. Consistent.
- `getCriterion(id) -> Criterion | undefined` — defined in Task 2, used in Task 3 (validateFindingV2 imports it). Consistent.
- `CRITERIA` — defined in Task 2, tested in Task 2. Consistent.
- `finding.id` — assigned in Task 5 (cmdValidateFindings) by calling `fingerprint(...)` and storing as `.id`; used by `toIssuePayloadV2(finding)` in Task 4 which reads `finding.id` for the marker. Consistent.
- `finding.suggestedApproach` — validated in Task 3 (`validateFindingV2`), written into the payload body in Task 4 (`toIssuePayloadV2`). Consistent.
- `finding.areaId` — the v2 field name (not `area`). Used consistently in Tasks 1, 3, 4, 5, 6.
- `decide(finding, issueIndex, cache)` — v1 function; accepts `finding.fingerprint || finding.id` (line 24 of `dedup.js`). Task 5 sets `finding.id`; `decide` will find it via `finding.fingerprint || finding.id`. Consistent.
- `module.exports` in `validate-finding.js` — Task 3 updates it to include `validateFindingV2`; Task 3 also verifies `validateFinding` (v1) still works. Consistent.
- `module.exports` in `issue-payload.js` — Task 4 updates it to include `toIssuePayloadV2`. Consistent.
- `module.exports` in `bin/recon.js` — Task 5 adds `cmdValidateFindings`. Consistent.
