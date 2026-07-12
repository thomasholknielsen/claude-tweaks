# journey-health Tier Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three improvements to `/claude-tweaks:journey-health`: (A) a journey with a deleted declared file gets force-selected on the very next light-tier firing instead of potentially sitting unaudited indefinitely; (B) the deep tier can be satisfied by recent, sufficiently-complete `/claude-tweaks:test` evidence instead of always driving a redundant live verification; (C) findings carry a `severity` field distinct from `confidence`, feeding into GitHub issue labels.

**Architecture:** (A) is a small, self-contained addition to `bin/lib/journey-health/scope.js`'s `selectTarget` (a new Phase 0), plus a within-batch dedup fix to `bin/journey-health.js`'s `--budget` loop that Phase 0's stateless check requires. (B) is a new pure module `bin/lib/journey-health/qa-evidence.js` plus a new `qa-evidence` CLI subcommand — the Glob/Read/cross-reference work stays in `SKILL.md` prose (only an LLM invocation can do that), but the verdict logic (satisfied / regression / inconclusive) is a testable pure function. (C) is a schema addition to `validate-finding.js` and `issue-payload.js`, mirrored into every finding-emission instruction and the label-ensure guard in `SKILL.md`.

**Tech Stack:** Node.js (CommonJS), `node --test`.

## Global Constraints

- **This is a behavior-adding plan, not a pure refactor.** Unlike a refactor-preserving-behavior task, some existing tests in this plan legitimately need their fixtures or assertions updated because the code's real behavior is intentionally changing (e.g., `scope.test.js`'s `writeJourney` helper never created the files it declared in frontmatter — harmless before Phase 0 existed, but Phase 0 would now spuriously fire on every one of those pre-existing fixtures). Every such edit is called out explicitly in this plan's tasks with the reason. Do not treat "an existing test file changed" as itself a defect — check whether the specific edit matches what's specified here.
- **No unrelated public API changes.** Every existing exported function's name and signature not explicitly modified by a task below stays untouched. `selectTarget`'s existing return shape (`{kind, id, path, filesFrontmatter, why, ...}`) gains a new `why: "deleted-file"` value and a new `missingFiles` field on that case only — `why: "stale"`/`"hotspot"`/`"manual"` results are unchanged.
- **Severity is metadata, not identity.** `severity` is never part of the fingerprint basis (`fingerprint()`'s basis array stays `[journey, category, section, normalizeDescription(description)]`, unchanged) — filing the same underlying finding at a different severity must never mint a new fingerprint or duplicate issue.
- **Deep-tier cursor recording is always preserved.** Every code path through Section B (satisfied, regression, or inconclusive-fallthrough) must still result in `validate-findings --tier deep --target $DEEP_TARGET_ID` running exactly once per Step 3.5 firing, so `recordAudit(root, target.id, 'deep', {})` fires and the deep cursor advances regardless of which path was taken.
- Run `node --test bin/lib/journey-health/tests/*.test.js` after every task; the full-suite baseline before this plan starts is **65 tests, 65 passing**.

---

### Task 1: Deletion force-select (scope.js Phase 0 + `--budget` loop fix)

**Files:**
- Modify: `bin/lib/journey-health/scope.js`
- Modify: `bin/journey-health.js`
- Modify: `bin/lib/journey-health/tests/scope.test.js`
- Modify: `bin/lib/journey-health/tests/cli-next-target.test.js`

**Interfaces:**
- Produces: `selectTarget(root, cursors, opts)` — `opts` gains an optional `alreadyPicked` (a `Set` of journey ids to skip in Phase 0; `null`/omitted means no exclusions). Return value gains `why: "deleted-file"` as a possible value, with a `missingFiles: string[]` field on that result only.
- Consumed by: Task 4 (`SKILL.md`'s Step 1 `why`-field documentation).

- [ ] **Step 1: Confirm the baseline**

Run: `node --test bin/lib/journey-health/tests/scope.test.js bin/lib/journey-health/tests/cli-next-target.test.js`
Expected: PASS, 11 tests in `scope.test.js`, 4 tests in `cli-next-target.test.js`.

- [ ] **Step 2: Add Phase 0 to `selectTarget` in `bin/lib/journey-health/scope.js`**

Replace the `selectTarget` function (everything from `function selectTarget(root, cursors, opts = {}) {` to its closing `}`) with:

```js
function selectTarget(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const tier = opts.tier === 'deep' ? 'deep' : 'light';
  const signals = opts.signals || null; // test injection hook — churn override by id
  // Within-batch dedup for --budget > 1 callers, Phase 0 only. Phases 1/2
  // already self-exclude a just-picked journey via the cursor bump the
  // --budget loop applies after every pick (daysSince/churn-since-bump both
  // read as ~0) — Phase 0 ignores cursors entirely (it's a raw existence
  // check), so it needs its own exclusion signal or it would return the same
  // deleted-file journey on every remaining slot in the batch.
  const alreadyPicked = opts.alreadyPicked || null;
  const staleDays = tier === 'deep' ? STALE_DAYS_DEEP : STALE_DAYS_LIGHT;
  const auditField = tier === 'deep' ? 'lastDeepAuditMs' : 'lastLightAuditMs';

  const candidates = listJourneys(root);
  if (candidates.length === 0) return null;

  // Phase 0 (light tier only): force-pick any journey with a declared file
  // that no longer exists. This is a stronger, more certain signal than
  // staleness or churn, and requires no LLM judgment to detect — a plain
  // existence check. Deep tier does not get this phase: its own
  // post-selection "skip condition" (SKILL.md Step 3.5) already handles a
  // broken journey without permanently parking the deep-tier rotation on it.
  if (tier === 'light') {
    for (const candidate of candidates) {
      if (alreadyPicked && alreadyPicked.has(candidate.id)) continue;
      const missing = candidate.filesFrontmatter.filter(
        (relPath) => !fs.existsSync(path.join(root, relPath)),
      );
      if (missing.length > 0) {
        return { ...candidate, why: 'deleted-file', missingFiles: missing };
      }
    }
  }

  // Phase 1: force-pick any journey unaudited on this tier past staleDays.
  for (const candidate of candidates) {
    const cursor = cursors[candidate.id];
    const lastAuditedMs = cursor && cursor[auditField] != null ? cursor[auditField] : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > staleDays) {
      return { ...candidate, why: 'stale', daysSinceLastAudit: Number.isFinite(daysSince) ? Math.round(daysSince) : null };
    }
  }

  // Phase 2: among non-stale candidates, score by churn on filesFrontmatter
  // since last audit on this tier.
  const scored = [];
  for (const candidate of candidates) {
    const cursor = cursors[candidate.id] || {};
    const sinceMs = cursor[auditField] || 0;
    const churn = signals ? (signals[candidate.id] || 0) : domainChurn(root, candidate.filesFrontmatter, sinceMs);
    if (churn > 0) scored.push({ candidate, churn });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.churn !== a.churn ? b.churn - a.churn : (a.candidate.id < b.candidate.id ? -1 : 1)));
  return { ...scored[0].candidate, why: 'hotspot', churnCount: scored[0].churn };
}
```

(Only Phase 0 and the new `alreadyPicked` line are new; Phases 1 and 2 are byte-for-byte unchanged from the current file — do not add `alreadyPicked` filtering to them, they don't need it.)

- [ ] **Step 3: Fix the `--budget` loop in `bin/journey-health.js`'s `cmdNextTarget`**

Replace:
```js
  // budget > 1: iterate, simulating post-audit cursor state in-memory so each
  // pick is a different journey (mirrors harness-health's next-target --budget).
  const targets = [];
  for (let i = 0; i < budget; i++) {
    const target = selectTarget(root, cursors, { now, tier });
    if (!target) break;
    targets.push(target);
    const auditField = tier === 'deep' ? 'lastDeepAuditMs' : 'lastLightAuditMs';
    cursors = { ...cursors, [target.id]: { ...(cursors[target.id] || {}), [auditField]: now } };
  }
```
with:
```js
  // budget > 1: iterate, simulating post-audit cursor state in-memory so each
  // pick is a different journey (mirrors harness-health's next-target --budget).
  // alreadyPicked additionally guards Phase 0 (deleted-file force-select),
  // which ignores cursors and would otherwise repeat the same pick every slot.
  const targets = [];
  const alreadyPicked = new Set();
  for (let i = 0; i < budget; i++) {
    const target = selectTarget(root, cursors, { now, tier, alreadyPicked });
    if (!target) break;
    targets.push(target);
    alreadyPicked.add(target.id);
    const auditField = tier === 'deep' ? 'lastDeepAuditMs' : 'lastLightAuditMs';
    cursors = { ...cursors, [target.id]: { ...(cursors[target.id] || {}), [auditField]: now } };
  }
```

- [ ] **Step 4: Fix `scope.test.js`'s `writeJourney` helper to create the files it declares**

This is a necessary fixture fix, not scope creep: the helper currently writes a journey's `files:` frontmatter listing paths but never creates those paths on disk. That was harmless before Phase 0 existed (nothing checked existence); after Step 2 lands, every existing test using this helper for a light-tier `selectTarget` call would now spuriously hit Phase 0 instead of exercising the staleness/churn logic it was written to test.

Replace:
```js
function writeJourney(root, name, filesFrontmatter) {
  const dir = path.join(root, 'docs', 'journeys');
  fs.mkdirSync(dir, { recursive: true });
  const frontmatter = filesFrontmatter.length
    ? `---\nfiles:\n${filesFrontmatter.map((f) => `  - ${f}`).join('\n')}\n---\n`
    : '';
  fs.writeFileSync(path.join(dir, `${name}.md`), `${frontmatter}\n# ${name}\n`, 'utf8');
}
```
with:
```js
function writeJourney(root, name, filesFrontmatter) {
  const dir = path.join(root, 'docs', 'journeys');
  fs.mkdirSync(dir, { recursive: true });
  const frontmatter = filesFrontmatter.length
    ? `---\nfiles:\n${filesFrontmatter.map((f) => `  - ${f}`).join('\n')}\n---\n`
    : '';
  fs.writeFileSync(path.join(dir, `${name}.md`), `${frontmatter}\n# ${name}\n`, 'utf8');
  for (const relPath of filesFrontmatter) {
    const filePath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '', 'utf8');
  }
}
```

No other line in this file changes as a result — every existing test's assertions (`why: 'stale'`, `why: 'hotspot'`, `null`) stay correct once the files genuinely exist, which is what those tests always intended to exercise.

- [ ] **Step 5: Add three new tests to `scope.test.js`**

Append:

```js
test('selectTarget force-picks a journey with a missing declared file on the light tier, ahead of staleness', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  fs.rmSync(path.join(root, 'src/checkout/Cart.tsx'));
  const now = Date.now();
  // Not stale (audited "now"), no churn signal — would otherwise return null.
  const cursors = { 'checkout-flow': { lastLightAuditMs: now } };
  const result = selectTarget(root, cursors, { now, tier: 'light', signals: {} });
  assert.strictEqual(result.id, 'checkout-flow');
  assert.strictEqual(result.why, 'deleted-file');
  assert.deepStrictEqual(result.missingFiles, ['src/checkout/Cart.tsx']);
});

test('selectTarget does not force-pick a missing-file journey on the deep tier', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  fs.rmSync(path.join(root, 'src/checkout/Cart.tsx'));
  const now = Date.now();
  const cursors = { 'checkout-flow': { lastDeepAuditMs: now } };
  const result = selectTarget(root, cursors, { now, tier: 'deep', signals: {} });
  assert.strictEqual(result, null);
});

test('selectTarget respects alreadyPicked so Phase 0 does not repeat the same deleted-file journey within a batch', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  fs.rmSync(path.join(root, 'src/checkout/Cart.tsx'));
  writeJourney(root, 'signup-flow', ['src/signup/Form.tsx']);
  const now = Date.now();
  const cursors = { 'checkout-flow': { lastLightAuditMs: now }, 'signup-flow': { lastLightAuditMs: now } };
  const alreadyPicked = new Set(['checkout-flow']);
  const result = selectTarget(root, cursors, { now, tier: 'light', signals: {}, alreadyPicked });
  assert.strictEqual(result, null);
});
```

- [ ] **Step 6: Run `scope.test.js` and confirm 14 tests pass**

Run: `node --test bin/lib/journey-health/tests/scope.test.js`
Expected: PASS (14 tests: 11 existing + 3 new)

- [ ] **Step 7: Fix `cli-next-target.test.js`'s `writeJourney` helper to create the file it declares**

Same necessary fixture fix as Step 4, in the CLI-level test file. Replace:
```js
function writeJourney(root, name) {
  const dir = path.join(root, 'docs', 'journeys');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), `---\nfiles:\n  - src/${name}.tsx\n---\n\n# ${name}\n`, 'utf8');
}
```
with:
```js
function writeJourney(root, name) {
  const dir = path.join(root, 'docs', 'journeys');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), `---\nfiles:\n  - src/${name}.tsx\n---\n\n# ${name}\n`, 'utf8');
  const filePath = path.join(root, 'src', `${name}.tsx`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '', 'utf8');
}
```

- [ ] **Step 8: Add one new test to `cli-next-target.test.js`**

Append:

```js
test('next-target --budget 2 does not repeat the same deleted-file journey across multiple targets', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow');
  writeJourney(root, 'signup-flow');
  fs.rmSync(path.join(root, 'src', 'checkout-flow.tsx'));
  const raw = execFileSync('node', [CLI, 'next-target', '--budget', '2', '--root', root], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.targets.length, 2);
  const ids = result.targets.map((t) => t.id).sort();
  assert.deepStrictEqual(ids, ['checkout-flow', 'signup-flow']);
  assert.strictEqual(result.targets.find((t) => t.id === 'checkout-flow').why, 'deleted-file');
});
```

- [ ] **Step 9: Run `cli-next-target.test.js` and confirm 5 tests pass**

Run: `node --test bin/lib/journey-health/tests/cli-next-target.test.js`
Expected: PASS (5 tests: 4 existing + 1 new)

- [ ] **Step 10: Run the full journey-health suite**

Run: `node --test bin/lib/journey-health/tests/*.test.js`
Expected: PASS (69 tests: 65 baseline + 3 new in scope.test.js + 1 new in cli-next-target.test.js)

- [ ] **Step 11: Commit**

```bash
git add bin/lib/journey-health/scope.js bin/journey-health.js bin/lib/journey-health/tests/scope.test.js bin/lib/journey-health/tests/cli-next-target.test.js
git commit -m "Add deletion force-select (Phase 0) to journey-health's selectTarget"
```

---

### Task 2: Severity field

**Files:**
- Modify: `bin/lib/journey-health/validate-finding.js`
- Modify: `bin/lib/journey-health/issue-payload.js`
- Modify: `bin/lib/journey-health/tests/validate-finding.test.js`
- Modify: `bin/lib/journey-health/tests/issue-payload.test.js`
- Modify: `bin/lib/journey-health/tests/cli-validate-findings.test.js`

**Interfaces:**
- Produces: `validateFinding(obj)` now requires `obj.severity` to be one of `'high'|'med'|'low'`; module exports gain `SEVERITY_VALUES`. `toIssuePayload(finding)`'s returned object gains a `severity` field and `labels` gains a third entry `journey-health:${finding.severity}`.
- Consumed by: Task 3 (`qa-evidence.js`'s constructed finding includes `severity`), Task 4 (`SKILL.md`'s finding-emission instructions and Step 6's label-ensure guard).

- [ ] **Step 1: Confirm the baseline**

Run: `node --test bin/lib/journey-health/tests/validate-finding.test.js bin/lib/journey-health/tests/issue-payload.test.js bin/lib/journey-health/tests/cli-validate-findings.test.js`
Expected: PASS, 7 tests in `validate-finding.test.js`, 5 tests in `issue-payload.test.js`, 6 tests in `cli-validate-findings.test.js`.

- [ ] **Step 2: Add `severity` to `bin/lib/journey-health/validate-finding.js`**

Replace:
```js
const CATEGORY_VALUES = new Set(['drift', 'coverage', 'regression-suspected']);
const SECTION_VALUES = new Set(['files-frontmatter', 'self-review', 'coverage', 'live-check']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);

const REQUIRED_STRINGS = ['journey', 'category', 'section', 'description', 'reason', 'confidence', 'recommendation'];
```
with:
```js
const CATEGORY_VALUES = new Set(['drift', 'coverage', 'regression-suspected']);
const SECTION_VALUES = new Set(['files-frontmatter', 'self-review', 'coverage', 'live-check']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);
const SEVERITY_VALUES = new Set(['high', 'med', 'low']);

const REQUIRED_STRINGS = ['journey', 'category', 'section', 'description', 'reason', 'confidence', 'severity', 'recommendation'];
```

Replace:
```js
  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  }

  if (errors.length > 0) return { ok: false, errors };
```
with:
```js
  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  }
  if (typeof obj.severity === 'string' && !SEVERITY_VALUES.has(obj.severity)) {
    errors.push(`severity: must be one of ${[...SEVERITY_VALUES].join('|')} (got "${obj.severity}")`);
  }

  if (errors.length > 0) return { ok: false, errors };
```

Replace the final line:
```js
module.exports = { validateFinding, CATEGORY_VALUES, SECTION_VALUES, CONFIDENCE_VALUES };
```
with:
```js
module.exports = { validateFinding, CATEGORY_VALUES, SECTION_VALUES, CONFIDENCE_VALUES, SEVERITY_VALUES };
```

- [ ] **Step 3: Fix `validate-finding.test.js`'s `validFinding()` factory**

Replace:
```js
function validFinding(overrides = {}) {
  return {
    journey: 'checkout-flow',
    category: 'drift',
    section: 'self-review',
    description: 'Persona is a placeholder',
    reason: 'Step 2 says "User clicks Buy" with no named persona',
    confidence: 'high',
    recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}
```
with:
```js
function validFinding(overrides = {}) {
  return {
    journey: 'checkout-flow',
    category: 'drift',
    section: 'self-review',
    description: 'Persona is a placeholder',
    reason: 'Step 2 says "User clicks Buy" with no named persona',
    confidence: 'high',
    severity: 'high',
    recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}
```

- [ ] **Step 4: Add one new test to `validate-finding.test.js`**

Append:

```js
test('validateFinding rejects an invalid severity', () => {
  const result = validateFinding(validFinding({ severity: 'bogus' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('severity:')));
});
```

- [ ] **Step 5: Run `validate-finding.test.js` and confirm 8 tests pass**

Run: `node --test bin/lib/journey-health/tests/validate-finding.test.js`
Expected: PASS (8 tests: 7 existing + 1 new)

- [ ] **Step 6: Add `severity` to `bin/lib/journey-health/issue-payload.js`**

Replace:
```js
  const body = [
    marker,
    '',
    `**Journey:** ${finding.journey} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Confidence:** ${finding.confidence}`,
    '',
```
with:
```js
  const body = [
    marker,
    '',
    `**Journey:** ${finding.journey} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence}`,
    '',
```

Replace:
```js
  return {
    id: finding.id,
    journey: finding.journey,
    category: finding.category,
    section: finding.section,
    confidence: finding.confidence,
    title,
    body,
    labels: ['journey-health', `journey-health:${finding.category}`],
  };
```
with:
```js
  return {
    id: finding.id,
    journey: finding.journey,
    category: finding.category,
    section: finding.section,
    severity: finding.severity,
    confidence: finding.confidence,
    title,
    body,
    labels: ['journey-health', `journey-health:${finding.category}`, `journey-health:${finding.severity}`],
  };
```

- [ ] **Step 7: Fix `issue-payload.test.js`'s `finding()` factory and the exact-labels test**

Replace:
```js
function finding(overrides = {}) {
  return {
    id: 'journeyhealth-abc12345',
    journey: 'checkout-flow',
    category: 'drift',
    section: 'files-frontmatter',
    description: 'files: entry no longer exists',
    reason: 'src/checkout/OldCart.tsx was deleted in a1b2c3d',
    confidence: 'high',
    recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}
```
with:
```js
function finding(overrides = {}) {
  return {
    id: 'journeyhealth-abc12345',
    journey: 'checkout-flow',
    category: 'drift',
    section: 'files-frontmatter',
    description: 'files: entry no longer exists',
    reason: 'src/checkout/OldCart.tsx was deleted in a1b2c3d',
    confidence: 'high',
    severity: 'high',
    recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}
```

Replace:
```js
test('toIssuePayload sets both the journey-health label and a category-specific label', () => {
  const payload = toIssuePayload(finding());
  assert.deepStrictEqual(payload.labels, ['journey-health', 'journey-health:drift']);
});
```
with:
```js
test('toIssuePayload sets the journey-health, category, and severity labels', () => {
  const payload = toIssuePayload(finding());
  assert.deepStrictEqual(payload.labels, ['journey-health', 'journey-health:drift', 'journey-health:high']);
});
```

- [ ] **Step 8: Run `issue-payload.test.js` and confirm 5 tests pass**

Run: `node --test bin/lib/journey-health/tests/issue-payload.test.js`
Expected: PASS (5 tests — same count, one test's body changed, none added or removed)

- [ ] **Step 9: Fix `cli-validate-findings.test.js`'s `finding()` factory**

Replace:
```js
function finding(overrides = {}) {
  return {
    journey: 'checkout-flow', category: 'drift', section: 'self-review',
    description: 'Persona is a placeholder', reason: 'Step 2 has no named persona',
    confidence: 'high', recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}
```
with:
```js
function finding(overrides = {}) {
  return {
    journey: 'checkout-flow', category: 'drift', section: 'self-review',
    description: 'Persona is a placeholder', reason: 'Step 2 has no named persona',
    confidence: 'high', severity: 'high', recommendation: 'Run /claude-tweaks:journeys checkout-flow',
    ...overrides,
  };
}
```

- [ ] **Step 10: Run `cli-validate-findings.test.js` and confirm 6 tests pass**

Run: `node --test bin/lib/journey-health/tests/cli-validate-findings.test.js`
Expected: PASS (6 tests — same count, fixture-only change)

- [ ] **Step 11: Run the full journey-health suite**

Run: `node --test bin/lib/journey-health/tests/*.test.js`
Expected: PASS (70 tests: 69 after Task 1 + 1 new from Step 4 of this task)

- [ ] **Step 12: Commit**

```bash
git add bin/lib/journey-health/validate-finding.js bin/lib/journey-health/issue-payload.js bin/lib/journey-health/tests/validate-finding.test.js bin/lib/journey-health/tests/issue-payload.test.js bin/lib/journey-health/tests/cli-validate-findings.test.js
git commit -m "Add severity field to journey-health's Finding Shape"
```

---

### Task 3: QA-evidence module + CLI subcommand

**Files:**
- Create: `bin/lib/journey-health/qa-evidence.js`
- Create: `bin/lib/journey-health/tests/qa-evidence.test.js`
- Create: `bin/lib/journey-health/tests/cli-qa-evidence.test.js`
- Modify: `bin/journey-health.js`

**Interfaces:**
- Consumes: `STALE_DAYS_DEEP` from `./score` (Task 2's `severity` field is embedded in the finding this module constructs, but no code dependency on Task 2's files).
- Produces: `evaluateQaEvidence(storyIds, report, opts)` → `{verdict: 'satisfied'} | {verdict: 'regression', finding: {...}} | {verdict: 'inconclusive', reason: string}`. CLI subcommand: `node journey-health.js qa-evidence <report.json> --story-ids <id1,id2,...> [--now <ms>]` → prints the same shape as JSON.
- Consumed by: Task 4 (`SKILL.md`'s new Step 3.5 sub-step).

This task creates brand-new code with no existing tests to preserve — normal TDD write-test-first flow.

- [ ] **Step 1: Write `bin/lib/journey-health/tests/qa-evidence.test.js`**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { evaluateQaEvidence } = require('../qa-evidence');

const NOW = Date.parse('2026-07-11T00:00:00.000Z');

function report(overrides = {}) {
  return {
    timestamp: '2026-07-01T00:00:00.000Z', // 10 days before NOW
    stories: [{ id: 'story-1', status: 'PASS' }],
    findings: [],
    ...overrides,
  };
}

test('inconclusive when the journey has no associated stories', () => {
  const result = evaluateQaEvidence([], report(), { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when there is no report', () => {
  const result = evaluateQaEvidence(['story-1'], null, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when the report is older than the staleness window', () => {
  const old = report({ timestamp: '2026-01-01T00:00:00.000Z' }); // well past 90 days before NOW
  const result = evaluateQaEvidence(['story-1'], old, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when a story is absent from the report', () => {
  const result = evaluateQaEvidence(['story-1', 'story-missing'], report(), { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when a story was skipped', () => {
  const r = report({ stories: [{ id: 'story-1', status: 'SKIPPED' }] });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('satisfied when all stories passed', () => {
  const r = report({ stories: [{ id: 'story-1', status: 'PASS' }, { id: 'story-2', status: 'PASS_WITH_CAVEATS' }] });
  const result = evaluateQaEvidence(['story-1', 'story-2'], r, { now: NOW });
  assert.deepStrictEqual(result, { verdict: 'satisfied' });
});

test('regression when a failed story has a code-bug finding, mapping severity High to high', () => {
  const r = report({
    stories: [{ id: 'story-1', status: 'FAIL' }],
    findings: [{ story_id: 'story-1', category: 'code-bug', severity: 'High', finding: 'Checkout button is missing' }],
  });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'regression');
  assert.strictEqual(result.finding.category, 'regression-suspected');
  assert.strictEqual(result.finding.severity, 'high');
  assert.strictEqual(result.finding.description, 'Checkout button is missing');
});

test('regression when a failed story has a ux-issue finding, mapping severity Medium to med', () => {
  const r = report({
    stories: [{ id: 'story-1', status: 'FAIL' }],
    findings: [{ story_id: 'story-1', category: 'ux-issue', severity: 'Medium', finding: 'Layout overlaps on mobile' }],
  });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'regression');
  assert.strictEqual(result.finding.severity, 'med');
});

test('inconclusive when a failed story is attributed to stale-selector', () => {
  const r = report({
    stories: [{ id: 'story-1', status: 'FAIL' }],
    findings: [{ story_id: 'story-1', category: 'stale-selector', severity: 'Low', finding: 'Locator not found' }],
  });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when a failed story is attributed to flaky-env', () => {
  const r = report({
    stories: [{ id: 'story-1', status: 'FAIL' }],
    findings: [{ story_id: 'story-1', category: 'flaky-env', severity: 'Low', finding: 'Network timeout' }],
  });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});

test('inconclusive when a failed story has no matching findings entry at all', () => {
  const r = report({ stories: [{ id: 'story-1', status: 'FAIL' }], findings: [] });
  const result = evaluateQaEvidence(['story-1'], r, { now: NOW });
  assert.strictEqual(result.verdict, 'inconclusive');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/journey-health/tests/qa-evidence.test.js`
Expected: FAIL — `Cannot find module '../qa-evidence'`

- [ ] **Step 3: Implement `bin/lib/journey-health/qa-evidence.js`**

```js
'use strict';
const { STALE_DAYS_DEEP } = require('./score');

const REGRESSION_CATEGORIES = new Set(['code-bug', 'ux-issue']);
const SEVERITY_MAP = { Low: 'low', Medium: 'med', High: 'high' };

// Decide whether a QA report.json's evidence for `storyIds` (all the stories
// belonging to one journey) satisfies the deep tier, surfaces a
// regression-suspected finding, or is inconclusive (caller falls through to
// live verification). Pure — no I/O; the caller (SKILL.md's Step 3.5) does
// the Glob/Read of the report file and the journey<->story cross-reference.
//
// Returns one of:
//   { verdict: 'satisfied' }
//   { verdict: 'regression', finding: {category, section, description, reason, confidence, severity, recommendation} }
//   { verdict: 'inconclusive', reason: string }
function evaluateQaEvidence(storyIds, report, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const staleDaysDeep = opts.staleDaysDeep != null ? opts.staleDaysDeep : STALE_DAYS_DEEP;

  if (!storyIds || storyIds.length === 0) {
    return { verdict: 'inconclusive', reason: 'journey has no associated stories' };
  }
  if (!report || !report.timestamp) {
    return { verdict: 'inconclusive', reason: 'no QA report available' };
  }
  const ageDays = (now - new Date(report.timestamp).getTime()) / 86400000;
  if (!(ageDays <= staleDaysDeep)) {
    return { verdict: 'inconclusive', reason: `QA report is ${Math.round(ageDays)} days old, past the ${staleDaysDeep}-day window` };
  }

  const storiesById = new Map((report.stories || []).map((s) => [s.id, s]));
  for (const id of storyIds) {
    const story = storiesById.get(id);
    if (!story || story.status === 'SKIPPED') {
      return { verdict: 'inconclusive', reason: `story "${id}" is absent from the report or was skipped` };
    }
  }

  const failed = storyIds.map((id) => storiesById.get(id)).filter((s) => s.status === 'FAIL');
  if (failed.length === 0) {
    return { verdict: 'satisfied' };
  }

  const findingsByStoryId = new Map((report.findings || []).map((f) => [f.story_id, f]));
  for (const story of failed) {
    const findingEntry = findingsByStoryId.get(story.id);
    if (findingEntry && REGRESSION_CATEGORIES.has(findingEntry.category)) {
      return {
        verdict: 'regression',
        finding: {
          category: 'regression-suspected',
          section: 'live-check',
          description: findingEntry.finding,
          reason: `QA run ${report.timestamp} recorded this failure for story "${story.id}": ${findingEntry.finding}`,
          confidence: 'high',
          severity: SEVERITY_MAP[findingEntry.severity] || 'med',
          recommendation: 'File as a product bug — QA evidence surfaced this, not journey-health\'s own live verification',
        },
      };
    }
  }

  return { verdict: 'inconclusive', reason: 'failing story(ies) attributed to QA tooling (stale-selector/flaky-env/story-bug), not journey drift' };
}

module.exports = { evaluateQaEvidence };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/journey-health/tests/qa-evidence.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Write `bin/lib/journey-health/tests/cli-qa-evidence.test.js`**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'journey-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-cli-qa-evidence-')); }

function writeReport(root, overrides = {}) {
  const report = {
    timestamp: '2026-07-01T00:00:00.000Z',
    stories: [{ id: 'story-1', status: 'PASS' }],
    findings: [],
    ...overrides,
  };
  const file = path.join(root, 'report.json');
  fs.writeFileSync(file, JSON.stringify(report));
  return file;
}

const FIXED_NOW = String(Date.parse('2026-07-11T00:00:00.000Z'));

test('qa-evidence prints satisfied when all named stories passed', () => {
  const root = tmp();
  const reportFile = writeReport(root);
  const raw = execFileSync('node', [CLI, 'qa-evidence', reportFile, '--story-ids', 'story-1', '--now', FIXED_NOW], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(raw), { verdict: 'satisfied' });
});

test('qa-evidence prints a regression finding for a code-bug failure', () => {
  const root = tmp();
  const reportFile = writeReport(root, {
    stories: [{ id: 'story-1', status: 'FAIL' }],
    findings: [{ story_id: 'story-1', category: 'code-bug', severity: 'High', finding: 'Checkout button is missing' }],
  });
  const raw = execFileSync('node', [CLI, 'qa-evidence', reportFile, '--story-ids', 'story-1', '--now', FIXED_NOW], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.verdict, 'regression');
  assert.strictEqual(result.finding.severity, 'high');
});

test('qa-evidence prints inconclusive when no story ids are given', () => {
  const root = tmp();
  const reportFile = writeReport(root);
  const raw = execFileSync('node', [CLI, 'qa-evidence', reportFile, '--now', FIXED_NOW], { encoding: 'utf8' });
  assert.strictEqual(JSON.parse(raw).verdict, 'inconclusive');
});

test('qa-evidence exits non-zero for a missing report file argument', () => {
  const result = spawnSync('node', [CLI, 'qa-evidence', '--story-ids', 'story-1'], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});
```

- [ ] **Step 6: Run the CLI tests to verify they fail**

Run: `node --test bin/lib/journey-health/tests/cli-qa-evidence.test.js`
Expected: FAIL — no `qa-evidence` command recognized

- [ ] **Step 7: Wire the `qa-evidence` subcommand into `bin/journey-health.js`**

Add the import (alongside the other `require`s at the top of the file, after the `selectTarget`/`listJourneys` line):

```js
const { evaluateQaEvidence } = require('./lib/journey-health/qa-evidence');
```

Add two new flags to `parseArgs`'s `for` loop, alongside the existing `else if` chain (after the `--budget` branch):

```js
    else if (a === '--story-ids') args.storyIds = argv[++i];
    else if (a === '--now') args.now = Number(argv[++i]);
```

Add a new command function (place it after `cmdMark`, before `main`):

```js
function cmdQaEvidence(args) {
  const reportPath = args._[1];
  if (!reportPath) {
    process.stderr.write('usage: journey-health.js qa-evidence <report.json> --story-ids <id1,id2,...> [--now <ms>]\n');
    process.exit(2);
  }
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    process.stderr.write(`qa-evidence: could not read or parse report file: ${reportPath}\n`);
    process.exit(1);
  }
  const storyIds = args.storyIds ? args.storyIds.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const now = args.now != null ? args.now : Date.now();
  const result = evaluateQaEvidence(storyIds, report, { now });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
```

Replace `main`'s body:
```js
function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'next-target') return cmdNextTarget(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'mark') return cmdMark(args);
  process.stderr.write(
    'usage: journey-health.js <command> [options]\n' +
    'commands: next-target [--target <id>] [--tier light|deep] [--budget <n>], ' +
    'validate-findings <file> [--target <id>] [--tier light|deep] [--coverage-scan], ' +
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <declined>\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, main };
```
with:
```js
function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'next-target') return cmdNextTarget(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'mark') return cmdMark(args);
  if (cmd === 'qa-evidence') return cmdQaEvidence(args);
  process.stderr.write(
    'usage: journey-health.js <command> [options]\n' +
    'commands: next-target [--target <id>] [--tier light|deep] [--budget <n>], ' +
    'validate-findings <file> [--target <id>] [--tier light|deep] [--coverage-scan], ' +
    'qa-evidence <report.json> --story-ids <id1,id2,...> [--now <ms>], ' +
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <declined>\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, cmdQaEvidence, main };
```

- [ ] **Step 8: Run the CLI tests to verify they pass**

Run: `node --test bin/lib/journey-health/tests/cli-qa-evidence.test.js`
Expected: PASS (4 tests)

- [ ] **Step 9: Run the full journey-health suite**

Run: `node --test bin/lib/journey-health/tests/*.test.js`
Expected: PASS (85 tests: 70 after Task 2 + 11 qa-evidence.test.js + 4 cli-qa-evidence.test.js)

- [ ] **Step 10: Commit**

```bash
git add bin/lib/journey-health/qa-evidence.js bin/lib/journey-health/tests/qa-evidence.test.js bin/lib/journey-health/tests/cli-qa-evidence.test.js bin/journey-health.js
git commit -m "Add qa-evidence module and CLI subcommand for journey-health's deep tier"
```

---

### Task 4: Wire everything into `skills/journey-health/SKILL.md`

**Files:**
- Modify: `skills/journey-health/SKILL.md`

**Interfaces:**
- Consumes: Task 1's `why: "deleted-file"`/`missingFiles`, Task 2's `severity` field, Task 3's `qa-evidence` CLI subcommand.
- No code — this task is pure documentation/procedure, so its own "tests" are a set of grep-based textual verifications (listed per step) rather than `node --test`. Still run the full `node --test bin/lib/journey-health/tests/*.test.js` suite at the end to confirm this task didn't accidentally touch any code file.

- [ ] **Step 1: Add the `deleted-file` case to Step 1's `why`-field documentation**

Find:
```
Read the `why` field on whichever target came back:
- If `target` is `null` and `coverageScanDue` is `false`: nothing is due this firing. Report this to the user and stop.
- `why: "stale"` — this journey has not been audited in over 30 days regardless of churn.
- `why: "hotspot"` — this journey's `files:` frontmatter paths have the highest git churn since its last light-tier audit among journeys with any churn at all.
- `why: "manual"` — `--target` was passed, bypassing selection.
```
Replace with:
```
Read the `why` field on whichever target came back:
- If `target` is `null` and `coverageScanDue` is `false`: nothing is due this firing. Report this to the user and stop.
- `why: "deleted-file"` — this journey has a `files:` entry that no longer exists on disk (`target.missingFiles` lists which). Takes priority over staleness and churn — light tier only, always checked before Phase 1/2.
- `why: "stale"` — this journey has not been audited in over 30 days regardless of churn.
- `why: "hotspot"` — this journey's `files:` frontmatter paths have the highest git churn since its last light-tier audit among journeys with any churn at all.
- `why: "manual"` — `--target` was passed, bypassing selection.
```

Verify: `grep -c 'why: "deleted-file"' skills/journey-health/SKILL.md` → `1`.

- [ ] **Step 2: Add severity to Step 2's two finding-emission sentences**

Find:
```
1. **File-existence check.** For each path in `target.filesFrontmatter`, check whether it still exists in the repo (`Read` or a quick `test -f`). For each missing path, emit a finding: `{ journey: target.id, category: "drift", section: "files-frontmatter", description: "files: entry '{path}' no longer exists", reason: "<how you confirmed it's missing>", confidence: "high", recommendation: "Run /claude-tweaks:journeys {target.id} to prune the dead entry" }`.
2. **Self-review criteria.** Apply the four checks (and the structural-validity check) in `_shared/journey-self-review.md` against the journey file's actual content. For each violated check, emit a finding: `{ journey: target.id, category: "drift", section: "self-review", description: "<which check failed and why>", reason: "<the specific text/evidence>", confidence: "high"|"med", recommendation: "Run /claude-tweaks:journeys {target.id} to fix {check name}" }`. A structural-validity failure (missing frontmatter, missing `## Steps`, no steps) always gets `confidence: "high"`.
```
Replace with:
```
1. **File-existence check.** For each path in `target.filesFrontmatter`, check whether it still exists in the repo (`Read` or a quick `test -f`). For each missing path, emit a finding: `{ journey: target.id, category: "drift", section: "files-frontmatter", description: "files: entry '{path}' no longer exists", reason: "<how you confirmed it's missing>", confidence: "high", severity: "high", recommendation: "Run /claude-tweaks:journeys {target.id} to prune the dead entry" }`. A missing declared file is never low-severity — it means the journey's documented domain mapping is flat-out wrong.
2. **Self-review criteria.** Apply the four checks (and the structural-validity check) in `_shared/journey-self-review.md` against the journey file's actual content. For each violated check, emit a finding: `{ journey: target.id, category: "drift", section: "self-review", description: "<which check failed and why>", reason: "<the specific text/evidence>", confidence: "high"|"med", severity: "high"|"med"|"low", recommendation: "Run /claude-tweaks:journeys {target.id} to fix {check name}" }`. A structural-validity failure (missing frontmatter, missing `## Steps`, no steps) always gets `confidence: "high"`, `severity: "high"`. A real-but-non-structural check failure (persona, origin coverage, outcome clarity) gets `severity: "med"`. Purely cosmetic wording drift gets `severity: "low"`.
```

- [ ] **Step 3: Add severity to Step 3's two finding-emission sentences**

Find:
```
Run the computation in `_shared/journey-coverage-check.md` across all journeys and all stories (not just the Step 1 target — this is a whole-library scan). For each uncovered-journey-step result, emit a finding: `{ journey: "<journey name>", category: "coverage", section: "coverage", description: "{M} uncovered steps ({step numbers})", reason: "no story in the stories directory has journey: {journey name} covering these steps", confidence: "high", recommendation: "Run /claude-tweaks:stories journey={journey name}" }`. For each orphaned-story-with-URL-match result, emit a finding with `journey` set to the *suggested* journey (not an existing journey's own drift, but still filed the same way): `{ journey: "<suggested journey>", category: "coverage", section: "coverage", description: "Story '{storyId}' matches journey '{journey}' but has no journey: field", reason: "story '{storyId}''s URL {url} matches a step in journey '{journey}', but the story has no journey: field linking them", confidence: "med", recommendation: "Add journey: {journey} to {storyFile}" }`. Skip orphaned stories with no match entirely (informational only, never a finding, per the shared fragment).
```
Replace with:
```
Run the computation in `_shared/journey-coverage-check.md` across all journeys and all stories (not just the Step 1 target — this is a whole-library scan). For each uncovered-journey-step result, emit a finding: `{ journey: "<journey name>", category: "coverage", section: "coverage", description: "{M} uncovered steps ({step numbers})", reason: "no story in the stories directory has journey: {journey name} covering these steps", confidence: "high", severity: "high"|"med"|"low", recommendation: "Run /claude-tweaks:stories journey={journey name}" }`. Severity scales with how much of the journey is uncovered: `"high"` when every documented step is uncovered (zero story coverage for this journey at all), `"low"` when exactly one step is uncovered, `"med"` for anything in between. For each orphaned-story-with-URL-match result, emit a finding with `journey` set to the *suggested* journey (not an existing journey's own drift, but still filed the same way): `{ journey: "<suggested journey>", category: "coverage", section: "coverage", description: "Story '{storyId}' matches journey '{journey}' but has no journey: field", reason: "story '{storyId}''s URL {url} matches a step in journey '{journey}', but the story has no journey: field linking them", confidence: "med", severity: "low", recommendation: "Add journey: {journey} to {storyFile}" }`. Skip orphaned stories with no match entirely (informational only, never a finding, per the shared fragment).
```

- [ ] **Step 4: Insert the QA-evidence sub-step at the start of Step 3.5's "Otherwise:" block, and add severity to its two drift/regression sentences**

Find:
```
Otherwise:

1. **Resolve a dev URL.** Follow `_shared/dev-url-detection.md` in auto mode — this starts an ephemeral server on a free port with no prompt when no server is already running and a dev command is known. Record whether this procedure started the server (`SERVER_STARTED`).
2. **Check for story coverage.** Read the stories directory for any story with `journey: {target.id}`.
   - Stories exist → drive `/claude-tweaks:test journey={target.id}` against the resolved dev URL.
   - No stories → fall back to `/claude-tweaks:visual-review journey:{target.id}` against the resolved dev URL.
3. **On failure, judge drift vs. regression** — don't assume either. Compare the failure evidence (a changed selector, a renamed route, a UI element that no longer exists) against the journey file's documented steps:
   - **Confirmed drift** (the app's structure changed and the journey/story text is what's stale): emit `{ journey: target.id, category: "drift", section: "live-check", description: "<what changed>", reason: "<the failure evidence>", confidence: "high"|"med", recommendation: "Run /claude-tweaks:journeys {target.id} — <what needs updating>" }`.
   - **Confirmed regression** (the app's actual behavior broke, journey/story text still accurately describes the intended flow): emit `{ journey: target.id, category: "regression-suspected", section: "live-check", description: "<what broke>", reason: "<the failure evidence>", confidence: "high"|"med", recommendation: "File as a product bug — journey/story text is accurate, the implementation regressed" }`.
   - If genuinely ambiguous, emit the drift-leaning finding with `confidence: "med"` and say so explicitly in `reason` — never silently pick one.
4. **Clean up.** If `SERVER_STARTED` is `true`, stop the ephemeral server now (`lsof -ti tcp:{port} | xargs kill`) — this is a standalone invocation with no `/wrap-up` to do it later, per `_shared/dev-url-detection.md`'s "Standalone" cleanup rule.
```
Replace with:
```
Otherwise:

0. **Check for recent QA evidence.** Glob `screenshots/qa/*/report.json`, take the most recent by timestamp prefix. If none exists, skip to sub-step 1. Read the stories directory and collect the `id` of every story with `journey: {target.id}`, reusing `_shared/journey-coverage-check.md`'s cross-reference (don't recompute it independently). If the journey has no stories at all, skip to sub-step 1 — there is no possible QA evidence to check.

   Otherwise, read that report.json and run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" qa-evidence <report.json path> --story-ids "<comma-separated story ids>"
   ```
   This prints `{ verdict: "satisfied"|"regression"|"inconclusive", finding?: {...}, reason?: "..." }`.
   - `verdict: "satisfied"` — the deep audit is satisfied by this evidence. Skip sub-steps 1-3 entirely (no dev URL, no live test/visual-review). The deep findings array stays empty. Continue to sub-step 4.
   - `verdict: "regression"` — take the printed `finding`, add `journey: target.id` to it, append it to the deep findings array. Skip sub-steps 1-3 entirely. Continue to sub-step 4.
   - `verdict: "inconclusive"` — fall through to sub-step 1 and drive live verification as normal. The `reason` is worth noting in the eventual summary, but does not block proceeding.

1. **Resolve a dev URL.** Follow `_shared/dev-url-detection.md` in auto mode — this starts an ephemeral server on a free port with no prompt when no server is already running and a dev command is known. Record whether this procedure started the server (`SERVER_STARTED`).
2. **Check for story coverage.** Read the stories directory for any story with `journey: {target.id}`.
   - Stories exist → drive `/claude-tweaks:test journey={target.id}` against the resolved dev URL.
   - No stories → fall back to `/claude-tweaks:visual-review journey:{target.id}` against the resolved dev URL.
3. **On failure, judge drift vs. regression** — don't assume either. Compare the failure evidence (a changed selector, a renamed route, a UI element that no longer exists) against the journey file's documented steps:
   - **Confirmed drift** (the app's structure changed and the journey/story text is what's stale): emit `{ journey: target.id, category: "drift", section: "live-check", description: "<what changed>", reason: "<the failure evidence>", confidence: "high"|"med", severity: "high"|"med", recommendation: "Run /claude-tweaks:journeys {target.id} — <what needs updating>" }`. `severity: "high"` when the journey can no longer complete at all; `"med"` for a partial or cosmetic break.
   - **Confirmed regression** (the app's actual behavior broke, journey/story text still accurately describes the intended flow): emit `{ journey: target.id, category: "regression-suspected", section: "live-check", description: "<what broke>", reason: "<the failure evidence>", confidence: "high"|"med", severity: "high"|"med", recommendation: "File as a product bug — journey/story text is accurate, the implementation regressed" }`. Same severity guidance as the drift case above.
   - If genuinely ambiguous, emit the drift-leaning finding with `confidence: "med"`, `severity: "med"`, and say so explicitly in `reason` — never silently pick one.
4. **Clean up.** If `SERVER_STARTED` is `true`, stop the ephemeral server now (`lsof -ti tcp:{port} | xargs kill`) — this is a standalone invocation with no `/wrap-up` to do it later, per `_shared/dev-url-detection.md`'s "Standalone" cleanup rule. (`SERVER_STARTED` is never `true` when sub-step 0 satisfied or resolved the deep tier via QA evidence, since sub-step 1 never ran on that path — this cleanup correctly no-ops.)
```

- [ ] **Step 5: Add a Severity column to Step 6's batch table**

Find:
```
| # | Journey | Category | Section | Confidence | Recommendation |
|---|---------|----------|---------|------------|----------------|
| 1 | {journey} | {category} | {section} | {confidence} | {recommendation} |
```
Replace with:
```
| # | Journey | Category | Section | Severity | Confidence | Recommendation |
|---|---------|----------|---------|----------|------------|----------------|
| 1 | {journey} | {category} | {section} | {severity} | {confidence} | {recommendation} |
```

- [ ] **Step 6: Add the severity label-ensure guard to Step 6**

Find:
```
Before filing, ensure each payload's category sub-label exists (it won't on first use in a fresh repo — `gh issue create` fails against a nonexistent label):

```bash
LABEL="journey-health:<category>"
gh label list --search "$LABEL" --json name -q '.[].name' | grep -qx "$LABEL" || \
  gh label create "$LABEL" --description "journey-health finding category: <category>"
```
```
Replace with:
```
Before filing, ensure each payload's category and severity sub-labels exist (they won't on first use in a fresh repo — `gh issue create` fails against a nonexistent label):

```bash
LABEL="journey-health:<category>"
gh label list --search "$LABEL" --json name -q '.[].name' | grep -qx "$LABEL" || \
  gh label create "$LABEL" --description "journey-health finding category: <category>"

LABEL="journey-health:<severity>"
gh label list --search "$LABEL" --json name -q '.[].name' | grep -qx "$LABEL" || \
  gh label create "$LABEL" --description "journey-health finding severity: <severity>"
```
```

- [ ] **Step 7: Verify every finding-emission example in the file now includes `severity`**

Run: `grep 'recommendation:' skills/journey-health/SKILL.md | grep -vc 'severity:'`
Expected: `0` — every line containing a `recommendation:` field (there are 5 such lines, one of which packs two distinct finding-shape examples for a total of 6 examples) must also contain `severity:` on the same line. Before this task's edits this command returns `5` (no `severity:` exists yet) — `0` confirms every example was updated, not just some. The QA-evidence-derived finding does not need its own inline example here since it's constructed entirely by `qa-evidence.js` (Task 3) and only referenced by name in Step 3.5's new sub-step 0.

- [ ] **Step 8: Run the full journey-health test suite to confirm this task touched no code**

Run: `node --test bin/lib/journey-health/tests/*.test.js`
Expected: PASS (85 tests — identical count to the end of Task 3; this task is documentation-only)

- [ ] **Step 9: Commit**

```bash
git add skills/journey-health/SKILL.md
git commit -m "Wire deletion force-select, QA-evidence deep-tier shortcut, and severity into journey-health/SKILL.md"
```
