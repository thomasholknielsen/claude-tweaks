# Code-Health Schema Unification + Risk Matrix Implementation Plan (Phase 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `likelihood` and `effort` as new judged fields on the v2 Finding schema, normalize every qualitative axis onto a shared low/medium/high vocabulary (dropping `severity: critical` and fixing `confidence`'s `med`→`medium` spelling), and add a deterministic `computeRisk(severity, likelihood)` helper. This is Phase 2 of the 5-phase design in `docs/superpowers/specs/2026-07-07-code-health-rename-risk-triage-design.md`, building on Phase 1's rename (already merged to `main`).

**Architecture:** Pure additive schema work plus one new pure-function module. `bin/lib/code-health/validate-finding.js` gains two new required v2-only fields and their enum sets; the existing shared `SEVERITY_VALUES`/`CONFIDENCE_VALUES` constants are updated in place (v1's dead `validateFinding` path shares them harmlessly — verified no v1 test exercises the values being removed). A new `bin/lib/code-health/risk.js` computes the risk tier via a fixed lookup table — no LLM involved, mirroring the existing engine-computes/LLM-judges split already used by `dedup.js#decide()`.

**Tech Stack:** Node 18+ (`node --test`), zero new dependencies.

## Global Constraints

- Run `npm test` at the end of every task; it must be 100% green (the one known pre-existing flaky test, `tests/statusline.test.js`'s "render under 500ms," may intermittently fail under system load — re-run in isolation if it's the only failure, per Phase 1's established precedent).
- **Do NOT touch anything Phase 3 owns:** `bin/lib/code-health/dedup.js` (severity-rank filing threshold), `bin/code-health.js`'s `cmdStatus`/`--fail-on critical` logic, `bin/lib/code-health/issue-payload.js` (label/body projection), or `skills/code-health/SKILL.md`'s Step 9 (labels) / `--min-severity` flag. This phase only adds the new schema fields and the pure risk-computation function — nothing consumes them yet. That wiring is Phase 3.
- `bin/lib/code-health/finding.js` (the v1-only `makeFinding` helper, used by the retired `lenses/*.js` mechanical checks) is out of scope — it has its own independent `SEVERITIES`/`CONFIDENCES` constants, unrelated to `validate-finding.js`'s, and is not touched by this plan.
- The v1 `validateFinding` function (dead code — the live CLI path only calls `validateFindingV2`) is not extended with `likelihood`/`effort`. It shares `SEVERITY_VALUES`/`CONFIDENCE_VALUES` with v2 for the values being *removed* (`critical`, `med`), which is safe (verified: no v1 test exercises those two values), but v1's schema otherwise stays exactly as-is.
- Every qualitative value introduced or changed in this phase uses exactly `low`/`medium`/`high` — no abbreviations, no `critical` tier.

---

### Task 1: Normalize confidence spelling from `med` to `medium`

**Files:**
- Modify: `bin/lib/code-health/validate-finding.js`, `bin/lib/code-health/criteria.js`, `bin/code-health.js`
- Modify (tests): `bin/lib/code-health/tests/criteria.test.js`, `bin/lib/code-health/tests/cli-validate-findings.test.js`, `bin/lib/code-health/tests/validate-finding.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CONFIDENCE_VALUES` (in `validate-finding.js`) and every `confidenceFloor` value in `criteria.js`'s `CRITERIA` catalog now read `medium` instead of `med`. `CONFIDENCE_ORDER` (in `bin/code-health.js`) likewise. Task 4 depends on this being done first so the SKILL.md documentation it edits matches the code's actual accepted values.

- [ ] **Step 1: Update `CONFIDENCE_VALUES` in `validate-finding.js`**

```
old_string:
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);
```
```
new_string:
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
```

- [ ] **Step 2: Update all 13 `confidenceFloor: 'med'` entries and the header comment in `criteria.js`**

Read the file, then replace every occurrence — all 13 are the identical literal `confidenceFloor: 'med',` (12 of them) or `confidenceFloor: 'med'` without a trailing comma (1 of them, the last domain-criterion entry on its own compact line). Use `replace_all: true` for the comma-terminated form since all 12 are byte-identical; handle the 3 compact one-line domain entries (`i18n`, `api-stability`, `concurrency`) individually since each has different surrounding text on the same line.

```
old_string (replace_all: true — the 10 universal-criteria entries: architecture-depth, simplification, review-quality, bad-practice, doc-freshness, dead-code, test-quality, observability, dependency-health, naming-clarity):
    confidenceFloor: 'med',
```
```
new_string:
    confidenceFloor: 'medium',
```

```
old_string:
  { id: 'i18n', appliesTo: ['frontend', 'backend'], confidenceFloor: 'med', fragment: 'criteria-i18n.md' },
```
```
new_string:
  { id: 'i18n', appliesTo: ['frontend', 'backend'], confidenceFloor: 'medium', fragment: 'criteria-i18n.md' },
```

```
old_string:
  { id: 'api-stability', appliesTo: ['library', 'backend'], confidenceFloor: 'med', fragment: 'criteria-api-stability.md' },
```
```
new_string:
  { id: 'api-stability', appliesTo: ['library', 'backend'], confidenceFloor: 'medium', fragment: 'criteria-api-stability.md' },
```

```
old_string:
  { id: 'concurrency', appliesTo: ['backend', 'cli', 'data'], confidenceFloor: 'med', fragment: 'criteria-concurrency.md' },
```
```
new_string:
  { id: 'concurrency', appliesTo: ['backend', 'cli', 'data'], confidenceFloor: 'medium', fragment: 'criteria-concurrency.md' },
```

```
old_string:
//   confidenceFloor:'high' | 'med' | 'low'  — minimum confidence to FILE a finding for this criterion
```
```
new_string:
//   confidenceFloor:'high' | 'medium' | 'low'  — minimum confidence to FILE a finding for this criterion
```

After this step, run `grep -c "'med'" bin/lib/code-health/criteria.js` — expect `0`.

- [ ] **Step 3: Update `CONFIDENCE_ORDER` in `bin/code-health.js`**

```
old_string:
const CONFIDENCE_ORDER = ['low', 'med', 'high'];
```
```
new_string:
const CONFIDENCE_ORDER = ['low', 'medium', 'high'];
```

- [ ] **Step 4: Fix `criteria.test.js`'s two `confidenceFloor` value assertions**

```
old_string:
    assert.ok(
      c.confidenceFloor === 'high' || c.confidenceFloor === 'med' || c.confidenceFloor === 'low',
      `criterion ${c.id} has invalid confidenceFloor: ${c.confidenceFloor}`,
    );
```
```
new_string:
    assert.ok(
      c.confidenceFloor === 'high' || c.confidenceFloor === 'medium' || c.confidenceFloor === 'low',
      `criterion ${c.id} has invalid confidenceFloor: ${c.confidenceFloor}`,
    );
```

```
old_string:
    assert.ok(['low', 'med', 'high'].includes(c.confidenceFloor),
      `${id}.confidenceFloor must be 'low'|'med'|'high', got ${c.confidenceFloor}`);
```
```
new_string:
    assert.ok(['low', 'medium', 'high'].includes(c.confidenceFloor),
      `${id}.confidenceFloor must be 'low'|'medium'|'high', got ${c.confidenceFloor}`);
```

- [ ] **Step 5: Fix `cli-validate-findings.test.js`'s `applyConfidenceFloor` tests**

```
old_string:
test('applyConfidenceFloor drops a med-confidence finding for a high-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'med' }, 'high');
  assert.strictEqual(result.pass, false);
  assert.ok(result.reason.includes('below floor'));
});

test('applyConfidenceFloor drops a low-confidence finding for a med-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'low' }, 'med');
  assert.strictEqual(result.pass, false);
});
```
```
new_string:
test('applyConfidenceFloor drops a medium-confidence finding for a high-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'medium' }, 'high');
  assert.strictEqual(result.pass, false);
  assert.ok(result.reason.includes('below floor'));
});

test('applyConfidenceFloor drops a low-confidence finding for a medium-floor criterion', () => {
  const result = applyConfidenceFloor({ confidence: 'low' }, 'medium');
  assert.strictEqual(result.pass, false);
});
```

- [ ] **Step 6: Fix `validate-finding.test.js`'s two "bad confidence enum" tests**

These tests currently use `confidence: 'medium'` as the *invalid* value (today, `'med'` is the only valid mid-tier spelling). After Step 1, `'medium'` becomes valid and `'med'` becomes invalid — flip both tests to use `'med'` as the new invalid value being tested:

```
old_string:
test('validateFinding: bad confidence enum fails', () => {
  const result = validateFinding(validFinding({ confidence: 'medium' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('confidence')));
});
```
```
new_string:
test('validateFinding: bad confidence enum fails', () => {
  const result = validateFinding(validFinding({ confidence: 'med' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('confidence')));
});
```

```
old_string:
test('validateFindingV2: bad confidence enum fails', () => {
  const result = validateFindingV2(validV2Finding({ confidence: 'medium' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('confidence')));
});
```
```
new_string:
test('validateFindingV2: bad confidence enum fails', () => {
  const result = validateFindingV2(validV2Finding({ confidence: 'med' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('confidence')));
});
```

Also fix the two "accumulates all errors" tests, which currently pass `confidence: 'medium'` as one of several deliberately-broken fields (it needs to stay broken — use `'med'` instead so it still fails the enum check post-fix):

```
old_string:
test('validateFinding: accumulates all errors in one pass', () => {
  const result = validateFinding({ severity: 'urgent', confidence: 'medium' });
```
```
new_string:
test('validateFinding: accumulates all errors in one pass', () => {
  const result = validateFinding({ severity: 'urgent', confidence: 'med' });
```

```
old_string:
test('validateFindingV2: accumulates all errors in one pass', () => {
  const result = validateFindingV2({ severity: 'urgent', confidence: 'medium' });
```
```
new_string:
test('validateFindingV2: accumulates all errors in one pass', () => {
  const result = validateFindingV2({ severity: 'urgent', confidence: 'med' });
```

- [ ] **Step 7: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only — re-run in isolation to confirm if so).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Normalize confidence spelling from med to medium across code-health"
```

---

### Task 2: Drop `severity: critical`, add `likelihood` and `effort` to the v2 Finding schema

**Files:**
- Modify: `bin/lib/code-health/validate-finding.js`
- Modify (tests): `bin/lib/code-health/tests/validate-finding.test.js`, `bin/lib/code-health/tests/cli-validate-findings.test.js`

**Interfaces:**
- Consumes: Task 1's `medium`-spelled `CONFIDENCE_VALUES`.
- Produces: `validateFindingV2` now requires `likelihood` and `effort` (both `low|medium|high`) alongside the existing fields, and rejects `severity: 'critical'`. New exports: `LIKELIHOOD_VALUES`, `EFFORT_VALUES` (both `Set(['low','medium','high'])`) from `validate-finding.js`. Task 3's `risk.js` consumes these same three string values (`low`/`medium`/`high`) as its input domain, though it does not import this module directly. Task 4's SKILL.md update depends on this shape being final.

- [ ] **Step 1: Write the failing tests for `likelihood`/`effort` and the `critical`-rejection**

Add to `bin/lib/code-health/tests/validate-finding.test.js`, after the existing `relatedAnchors` test block (end of file):

```js
// ── likelihood / effort (schema unification) ────────────────────────────────

test('validateFindingV2: bad severity enum "critical" fails (dropped from the schema)', () => {
  const result = validateFindingV2(validV2Finding({ severity: 'critical' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('severity')), result.errors.join('; '));
});

test('validateFindingV2: likelihood is required', () => {
  const f = validV2Finding();
  delete f.likelihood;
  const result = validateFindingV2(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('likelihood')), result.errors.join('; '));
});

test('validateFindingV2: bad likelihood enum fails', () => {
  const result = validateFindingV2(validV2Finding({ likelihood: 'certain' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('likelihood')), result.errors.join('; '));
});

test('validateFindingV2: effort is required', () => {
  const f = validV2Finding();
  delete f.effort;
  const result = validateFindingV2(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('effort')), result.errors.join('; '));
});

test('validateFindingV2: bad effort enum fails', () => {
  const result = validateFindingV2(validV2Finding({ effort: 'huge' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('effort')), result.errors.join('; '));
});

test('validateFindingV2: valid result carries likelihood and effort', () => {
  const result = validateFindingV2(validV2Finding({ likelihood: 'high', effort: 'low' }));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.likelihood, 'high');
  assert.strictEqual(result.value.effort, 'low');
});
```

Update the `validV2Finding` helper near the top of the "v2 Finding shape" section to include the two new required fields by default (every existing test using this helper must keep passing without modification):

```
old_string:
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
```
```
new_string:
function validV2Finding(overrides = {}) {
  return {
    criterion: 'simplification',
    areaId: 'src/api',
    anchor: 'src/api/user.js#getUser',
    severity: 'medium',
    confidence: 'high',
    likelihood: 'medium',
    effort: 'medium',
    title: 'getUser is a passthrough to the repository',
    evidence: 'src/api/user.js#getUser delegates directly to UserRepository.find with no added logic.',
    suggestedApproach: 'Inline the call at the call site, or add caching/auth in this method.',
    acceptance: 'getUser adds caching, authorization, or enrichment; or is removed and callers use the repository directly.',
    ...overrides,
  };
}
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
node --test bin/lib/code-health/tests/validate-finding.test.js
```

Expected: FAIL — `likelihood`/`effort` are not yet required or validated, and `severity: 'critical'` is still accepted.

- [ ] **Step 3: Implement the schema changes in `validate-finding.js`**

```
old_string:
const SEVERITY_VALUES = new Set(['low', 'medium', 'high', 'critical']);
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
```
```
new_string:
const SEVERITY_VALUES = new Set(['low', 'medium', 'high']);
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
const LIKELIHOOD_VALUES = new Set(['low', 'medium', 'high']);
const EFFORT_VALUES = new Set(['low', 'medium', 'high']);
```

```
old_string:
const V2_REQUIRED_STRINGS = [
  'criterion', 'areaId', 'anchor', 'title', 'evidence', 'suggestedApproach', 'acceptance',
];
```
```
new_string:
const V2_REQUIRED_STRINGS = [
  'criterion', 'areaId', 'anchor', 'title', 'evidence', 'suggestedApproach', 'acceptance',
  'likelihood', 'effort',
];
```

```
old_string:
  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  } else if (typeof obj.confidence !== 'string') {
    errors.push(`confidence: required non-empty string (got ${JSON.stringify(obj.confidence)})`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}
```
```
new_string:
  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  } else if (typeof obj.confidence !== 'string') {
    errors.push(`confidence: required non-empty string (got ${JSON.stringify(obj.confidence)})`);
  }

  if (typeof obj.likelihood === 'string' && !LIKELIHOOD_VALUES.has(obj.likelihood)) {
    errors.push(`likelihood: must be one of ${[...LIKELIHOOD_VALUES].join('|')} (got "${obj.likelihood}")`);
  }

  if (typeof obj.effort === 'string' && !EFFORT_VALUES.has(obj.effort)) {
    errors.push(`effort: must be one of ${[...EFFORT_VALUES].join('|')} (got "${obj.effort}")`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}
```

Note: `likelihood` and `effort` are already covered by the generic `V2_REQUIRED_STRINGS` non-empty-string check earlier in the function (added in Step 3's first edit above) — the two new blocks here only add the *enum* check, exactly mirroring how `severity`'s enum check is layered on top of the required-string check.

```
old_string:
module.exports = { validateFinding, validateFindingV2, SEVERITY_VALUES, CONFIDENCE_VALUES, CATEGORY_VALUES, REQUIRED_STRINGS };
```
```
new_string:
module.exports = {
  validateFinding, validateFindingV2, SEVERITY_VALUES, CONFIDENCE_VALUES, CATEGORY_VALUES,
  REQUIRED_STRINGS, LIKELIHOOD_VALUES, EFFORT_VALUES,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test bin/lib/code-health/tests/validate-finding.test.js
```

Expected: PASS, all tests including the 6 new ones.

- [ ] **Step 5: Fix `cli-validate-findings.test.js`'s `validFinding` helper and its `critical`-severity usages**

Update the helper to include the two new required fields by default:

```
old_string:
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
```
```
new_string:
function validFinding(overrides = {}) {
  return {
    criterion: 'simplification',
    areaId: 'src/api',
    anchor: 'src/api/user.js#getUser',
    severity: 'medium',
    confidence: 'high',
    likelihood: 'medium',
    effort: 'medium',
    title: 'getUser is a passthrough',
    evidence: 'getUser delegates directly to UserRepository.find with no added logic.',
    suggestedApproach: 'Inline the call or add caching.',
    acceptance: 'getUser adds caching or is removed.',
    ...overrides,
  };
}
```

Delete the now-redundant test (it becomes a duplicate of the adjacent `severity: 'high'` test once `critical` no longer exists as a value):

```
old_string:
test('validate-findings: critical severity files under the default threshold', () => {
  const root = tmp();
  const f = validFinding({ severity: 'critical' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));

  const result = runValidateFindings(root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-crit']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'critical severity must file under the default threshold');
});

```
```
new_string:
(delete entirely — no replacement)
```

Fix the two remaining `severity: 'critical'` usages, which only needed *some* valid finding to exercise `--min-severity` flag validation (unrelated to critical severity specifically):

```
old_string:
test('validate-findings: exits 2 when --min-severity is an unrecognized value', () => {
  const root = tmp();
  const f = validFinding({ severity: 'critical' });
```
```
new_string:
test('validate-findings: exits 2 when --min-severity is an unrecognized value', () => {
  const root = tmp();
  const f = validFinding({ severity: 'high' });
```

```
old_string:
test('validate-findings: a recognized --min-severity value still works normally', () => {
  const root = tmp();
  const f = validFinding({ severity: 'critical' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));
  const result = runValidateFindings(
    root, findingsFile, ['--slice', 'src/api', '--run-id', 'r-good-sev', '--min-severity', 'low'],
  );
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'critical finding must still file with a valid --min-severity value');
});
```
```
new_string:
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

- [ ] **Step 6: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Drop severity:critical, add likelihood and effort to the v2 Finding schema"
```

---

### Task 3: Deterministic risk matrix

**Files:**
- Create: `bin/lib/code-health/risk.js`
- Create: `bin/lib/code-health/tests/risk.test.js`

**Interfaces:**
- Consumes: nothing (pure function, no imports beyond none needed).
- Produces: `computeRisk(severity, likelihood)` → `'low' | 'medium' | 'high'`. Exported for Phase 3 to wire into `dedup.js`'s filing decision and `bin/code-health.js`'s `--fail-on` gate — not consumed by anything in this phase.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/code-health/tests/risk.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { computeRisk } = require('../risk');

const CASES = [
  // [severity, likelihood, expectedRisk]
  ['low', 'low', 'low'],
  ['low', 'medium', 'low'],
  ['low', 'high', 'medium'],
  ['medium', 'low', 'low'],
  ['medium', 'medium', 'medium'],
  ['medium', 'high', 'high'],
  ['high', 'low', 'medium'],
  ['high', 'medium', 'high'],
  ['high', 'high', 'high'],
];

for (const [severity, likelihood, expected] of CASES) {
  test(`computeRisk(${severity}, ${likelihood}) === ${expected}`, () => {
    assert.strictEqual(computeRisk(severity, likelihood), expected);
  });
}

test('computeRisk is pure — same inputs always produce the same output', () => {
  const a = computeRisk('medium', 'high');
  const b = computeRisk('medium', 'high');
  assert.strictEqual(a, b);
  assert.strictEqual(a, 'high');
});

test('computeRisk throws on an unrecognized severity value', () => {
  assert.throws(() => computeRisk('critical', 'medium'), /severity/i);
});

test('computeRisk throws on an unrecognized likelihood value', () => {
  assert.throws(() => computeRisk('medium', 'certain'), /likelihood/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test bin/lib/code-health/tests/risk.test.js
```

Expected: FAIL — `../risk` does not exist yet.

- [ ] **Step 3: Implement `risk.js`**

Create `bin/lib/code-health/risk.js`:

```js
'use strict';

// Risk is computed, not judged — the LLM judge emits severity (impact) and
// likelihood (exposure/blast-radius/exploitability, folded into one holistic
// call) as two separate, simpler qualitative fields; this pure function
// combines them into a single risk tier via a fixed lookup, mirroring the
// existing engine-computes/LLM-judges split already used by dedup.js#decide().
//
// Score low=1, medium=2, high=3; bucket the product: 1-2 -> low, 3-4 -> medium,
// 6-9 -> high. Symmetric and diagonal — see the design doc's risk matrix table.
const SCORE = { low: 1, medium: 2, high: 3 };

function bucket(score) {
  if (score <= 2) return 'low';
  if (score <= 4) return 'medium';
  return 'high';
}

function computeRisk(severity, likelihood) {
  if (!(severity in SCORE)) {
    throw new Error(`computeRisk: severity must be one of low|medium|high (got "${severity}")`);
  }
  if (!(likelihood in SCORE)) {
    throw new Error(`computeRisk: likelihood must be one of low|medium|high (got "${likelihood}")`);
  }
  return bucket(SCORE[severity] * SCORE[likelihood]);
}

module.exports = { computeRisk };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test bin/lib/code-health/tests/risk.test.js
```

Expected: PASS, all 12 tests (9 matrix cases + purity + 2 error cases).

- [ ] **Step 5: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only). Note: `package.json`'s test script already globs `bin/lib/code-health/tests/*.test.js`, so this new file is picked up automatically — no script change needed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add computeRisk: deterministic severity x likelihood risk matrix"
```

---

### Task 4: Update `skill/code-health/SKILL.md`'s Step 6 (emit shape) and Step 7 (verify gate)

**Files:**
- Modify: `skills/code-health/SKILL.md`

**Interfaces:**
- Consumes: Task 2's final v2 Finding shape (the judge must be instructed to produce exactly what `validateFindingV2` now requires).
- Produces: updated skill documentation. No code interface — this is the only task in this phase that changes prose/instructions the LLM judge reads at run time, not test-covered code.

- [ ] **Step 1: Update Step 6's emit-shape JSON example and add calibration guidance**

Read the file, then replace:

```
old_string:
**Step 6 — EMIT FINDINGS as a JSON array.**

For each finding, emit exactly this shape:

```json
{
  "criterion": "<catalog id, e.g. 'simplification'>",
  "areaId": "<directory path relative to root, e.g. 'src/api'>",
  "anchor": "<relfile#NearestNamedSymbol — see anchor rules below>",
  "relatedAnchors": "<optional array of relfile#NearestNamedSymbol strings — sibling occurrences of the same root cause; omit if there's only one occurrence>",
  "severity": "<low|medium|high|critical>",
  "confidence": "<high|med|low>",
  "title": "<short summary>",
  "evidence": "<what was observed — cites anchor; no line numbers>",
  "suggestedApproach": "<described fix in prose — NO code>",
  "acceptance": "<acceptance criteria>"
}
```

**Bundling rule (recurring root causes):** when the same criterion and the same suggested fix recur at multiple call sites within the slice being judged, file **one** finding, not one per call site. Pick the clearest/most representative occurrence as the primary `anchor`; list every other occurrence in `relatedAnchors`; make `evidence` enumerate all occurrences; make `acceptance` require all of them fixed, not just the primary. Only bundle occurrences that share both the criterion AND the fix — do not bundle unrelated findings under one anchor just because they're nearby in the same file or directory.
```
```
new_string:
**Step 6 — EMIT FINDINGS as a JSON array.**

For each finding, emit exactly this shape:

```json
{
  "criterion": "<catalog id, e.g. 'simplification'>",
  "areaId": "<directory path relative to root, e.g. 'src/api'>",
  "anchor": "<relfile#NearestNamedSymbol — see anchor rules below>",
  "relatedAnchors": "<optional array of relfile#NearestNamedSymbol strings — sibling occurrences of the same root cause; omit if there's only one occurrence>",
  "severity": "<low|medium|high>",
  "confidence": "<high|medium|low>",
  "likelihood": "<low|medium|high>",
  "effort": "<low|medium|high>",
  "title": "<short summary>",
  "evidence": "<what was observed — cites anchor; no line numbers>",
  "suggestedApproach": "<described fix in prose — NO code>",
  "acceptance": "<acceptance criteria>"
}
```

**Severity, likelihood, and effort are three separate, simpler judgments — do not conflate them:**

- **`severity`** — impact *if* the pattern manifests. Unchanged meaning from before.
- **`likelihood`** — how probable this is to actually matter in practice. One holistic judgment folding together whichever of these three factors actually apply to the finding at hand:
  - **Exposure** — is this on a hot/frequently-executed path and user-facing, or a rarely-touched internal script / dead corner?
  - **Blast radius** — does this affect one call site, or a shared/foundational module many things depend on?
  - **Exploitability** — for security-relevant criteria specifically: can external input actually reach and trigger this, or is it a theoretical concern with no real attack surface? Non-security criteria simply have no exploitability consideration to weigh.
- **`effort`** — the cost/complexity of the finding's own `suggestedApproach`. A one-line parameter addition is `low`; a bundled fix across several sibling occurrences is `medium`; a structural change (new abstraction, cross-file rework) is `high`.

**Bundling rule (recurring root causes):** when the same criterion and the same suggested fix recur at multiple call sites within the slice being judged, file **one** finding, not one per call site. Pick the clearest/most representative occurrence as the primary `anchor`; list every other occurrence in `relatedAnchors`; make `evidence` enumerate all occurrences; make `acceptance` require all of them fixed, not just the primary. Only bundle occurrences that share both the criterion AND the fix — do not bundle unrelated findings under one anchor just because they're nearby in the same file or directory.
```

- [ ] **Step 2: Add two verify-gate questions to Step 7**

```
old_string:
Before fingerprinting and dedup, re-examine each finding the judge emitted and ask three questions:

1. **Is it real?** Does the code actually exhibit the problem, or did the judge misread the structure? If the code is correctly guarded (a timeout IS configured, a check IS present), drop the finding.
2. **Is it actionable?** Is the `suggestedApproach` concrete and executable? A finding like "consider improving error handling" with no specific location or change is not actionable — drop it or refine it until it is.
3. **Does it reproduce?** Given the code read in Step 3, would a developer following the `suggestedApproach` be able to find and fix the issue without additional investigation? If not, the anchor or evidence is too vague — either tighten it or drop the finding.

Drop any finding that fails any of the three questions. Log the drop reason. A smaller set of high-quality findings is always preferable to a larger set with noise. This is the adversarial-verify discipline that the v1 design established — apply it every time.
```
```
new_string:
Before fingerprinting and dedup, re-examine each finding the judge emitted and ask five questions:

1. **Is it real?** Does the code actually exhibit the problem, or did the judge misread the structure? If the code is correctly guarded (a timeout IS configured, a check IS present), drop the finding.
2. **Is it actionable?** Is the `suggestedApproach` concrete and executable? A finding like "consider improving error handling" with no specific location or change is not actionable — drop it or refine it until it is.
3. **Does it reproduce?** Given the code read in Step 3, would a developer following the `suggestedApproach` be able to find and fix the issue without additional investigation? If not, the anchor or evidence is too vague — either tighten it or drop the finding.
4. **Is `likelihood` justified by the evidence?** The finding's `evidence` should support the claimed exposure/blast-radius/exploitability — not just assert a likelihood tier without grounding it in what was actually observed in the code.
5. **Is `effort` consistent with `suggestedApproach`?** A `suggestedApproach` that reads as a one-line change should not carry `effort: high`, and vice versa.

Drop any finding that fails any of the five questions. Log the drop reason. A smaller set of high-quality findings is always preferable to a larger set with noise. This is the adversarial-verify discipline that the v1 design established — apply it every time.
```

- [ ] **Step 3: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass. `bin/lib/code-health/tests/skill-md.test.js` asserts specific required substrings and section presence in this file (per its own token list) but does not assert the literal old JSON shape or the old three-question verify-gate text, so this edit should not break it — confirm by running this specific test file in isolation first if you want an early signal:

```bash
node --test bin/lib/code-health/tests/skill-md.test.js
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Document likelihood/effort fields and the expanded verify gate in code-health's SKILL.md"
```

---

## What this plan does not cover

Per the design doc's phasing, the following remain separate, later plans:
- Wiring `computeRisk` into `dedup.js`'s filing decision (the `--min-severity` → `--min-risk` threshold change) and `bin/code-health.js`'s `--fail-on critical` → `--fail-on risk-high` CI gate rename.
- Label restructuring (`code-health:risk-{tier}`, `code-health:effort-{tier}`) and updating `issue-payload.js`'s body text to surface the new fields.
- The four downstream efficiency levers (effort→model tier, risk-ordered batching, quick-wins selector, spec-sizing signal).
- The closing-keyword safety-net hook.
