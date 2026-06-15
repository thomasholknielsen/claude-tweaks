# Recon Phase 2: Judgment Lenses — Implementation Plan

> **Canonical interface:** cross-phase API signatures live in `2026-06-14-recon-interface-contract.md`; it wins over inline names here. Specifically: use `readCache`/`writeCache` (not `loadCache`/`saveCache`), call `decide(finding, issueIndex, cache)`, and pass `file` into `fingerprint(...)`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the judgment layer to `/recon`: LLM subagents dispatched against the top-K prioritized areas, each reading a Phase 0 shared-criteria fragment and returning findings as JSON. `bin/recon.js` stays pure — no network, no model call. It **emits** work orders (`plan-judgment`) and **ingests** results files (`ingest-judgment`), reusing Phase 1's `fingerprint.js`, `dedup.js`, and `issue-payload.js`. `skills/recon/SKILL.md` owns the actual subagent dispatch via the subagent-output contract.

**Architecture:** Two new deterministic helpers under `bin/lib/recon/` — `judgment.js` (`buildWorkOrders`, embeds the matching `criteria-*.md` text + the Finding JSON shape + the contract status line into each prompt; caps the list to `maxSubagents`) and `validate-finding.js` (`validateFinding`, hand-rolled zero-dep enum/required-field check). `bin/recon.js` gains two subcommands wiring them to the Phase 1 spine. The SKILL.md gains a "Judgment Lens Dispatch" section: `plan-judgment` → dispatch one subagent per work order at its `modelTier` with its verbatim `prompt` → assemble responses into `results.json` → `ingest-judgment` → hand survivor issue payloads to `gh`. The MAX_SUBAGENTS cap is enforced in code (truncation) and restated in the SKILL.

**Tech Stack:** Node built-ins only (`fs`, `path`, `crypto` via Phase 1; zero external deps). LLM subagents dispatched via `skills/_shared/subagent-output-contract.md` (Template A). Tests: `node --test bin/lib/recon/tests/*.test.js`. `git` for commits.

**Baseline:** branch `recon-phase-2-judgment` on top of Phase 1. Design doc: `docs/superpowers/specs/2026-06-14-recon-proactive-repo-finder-design.md` (§4 agentic layer, §7 lens model + shared criteria, §13 Phase 2).

**Phase 0 dependencies (assume present):** `skills/_shared/criteria-architecture-depth.md`, `skills/_shared/criteria-simplification.md`, `skills/_shared/criteria-review-quality.md`.

**Phase 1 dependencies (assume present):** `bin/recon.js` (`run`); `bin/lib/recon/fingerprint.js` exporting `fingerprint({lens, areaId, signature}) -> string`; `bin/lib/recon/dedup.js` exporting `decide(...)`; `bin/lib/recon/cache.js`; `bin/lib/recon/issue-payload.js`; the Finding shape `{id, title, lens, category, severity, confidence, area, files, evidence, suggestion, acceptance}`; `skills/recon/SKILL.md`; tests under `bin/lib/recon/tests/`.

---

## File Structure

| File | Disposition | Responsibility |
|------|-------------|----------------|
| `bin/lib/recon/judgment.js` | **New** | `buildWorkOrders({areas, lenses, maxSubagents})` — embeds criteria text + Finding shape + contract status line per prompt; caps to `maxSubagents`. Exports `JUDGMENT_LENS_MAP`, `OUTPUT_FORMAT`, `buildWorkOrders`. |
| `bin/lib/recon/validate-finding.js` | **New** | `validateFinding(obj) -> {ok, errors}` — required-field + enum checks against the Finding shape. |
| `bin/recon.js` | **Modify** | Add `plan-judgment` and `ingest-judgment` subcommands; wire to `judgment.js`, `validate-finding.js`, Phase 1 `fingerprint.js`, `dedup.js`, `issue-payload.js`, `cache.js`. |
| `skills/recon/SKILL.md` | **Modify** | Add `## Judgment Lens Dispatch` section + two Anti-Pattern rows (cap, raw-output). |
| `bin/lib/recon/tests/judgment.test.js` | **New** | Work-order build, cap enforcement, prompt embeds criteria text + status line + Finding shape, lens→criteria mapping. |
| `bin/lib/recon/tests/validate-finding.test.js` | **New** | Each enum violation, missing required field, valid finding passes, files-array checks. |
| `.claude-plugin/plugin.json` | **Modify** | Version bump (patch) for the Phase 2 feature increment. |

**Config:** judgment lenses default to all three (`architecture-depth,simplification,review-quality`); `MAX_SUBAGENTS` default `6` (K=2 areas × 3 lenses). The CLI flags `--lenses` and `--max-subagents` override; absent flags use these defaults.

**Run files** live under the gitignored `.claude-tweaks/recon/runs/` — `<runId>-work-orders.json` and the caller-assembled `<runId>-results.json`. Not committed (design §6: no committed registry).

---

## Task 1: `validate-finding.js` — subagent output validator

This is the leaf dependency (`judgment.js` and `ingest-judgment` both consume it). Build it first. It validates a subagent-produced finding against the Phase 1 Finding shape. Malformed → dropped with a logged reason.

**Files:**
- New: `bin/lib/recon/validate-finding.js`
- Test: `bin/lib/recon/tests/validate-finding.test.js`

- [ ] **Step 1.1: Write the failing test**

Create `bin/lib/recon/tests/validate-finding.test.js`:

```javascript
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { validateFinding } = require('../validate-finding');

// A complete, valid finding matching the Phase 1 Finding shape.
function validFinding(overrides = {}) {
  return {
    title: 'UserService.findById is a passthrough',
    lens: 'architecture-depth',
    category: 'Architecture',
    severity: 'medium',
    confidence: 'high',
    area: 'src/services',
    files: ['src/services/user-service.ts:42'],
    evidence: 'findById calls UserRepository.findById with no added logic.',
    suggestion: 'Inline the call or add the missing authorization check.',
    acceptance: 'The service method adds caching, auth, or enrichment, or is removed.',
    signature: 'passthrough UserService.findById',
    ...overrides,
  };
}

test('validateFinding: a complete finding passes', () => {
  const result = validateFinding(validFinding());
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
});

test('validateFinding: missing required field fails with a named error', () => {
  const f = validFinding();
  delete f.evidence;
  const result = validateFinding(f);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('evidence')), result.errors.join('; '));
});

test('validateFinding: empty-string required field fails', () => {
  const result = validateFinding(validFinding({ title: '   ' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('title')));
});

test('validateFinding: bad severity enum fails', () => {
  const result = validateFinding(validFinding({ severity: 'urgent' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('severity')), result.errors.join('; '));
});

test('validateFinding: bad confidence enum fails', () => {
  const result = validateFinding(validFinding({ confidence: 'medium' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('confidence')));
});

test('validateFinding: bad category enum fails', () => {
  const result = validateFinding(validFinding({ category: 'Vibes' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('category')));
});

test('validateFinding: files must be a non-empty array', () => {
  const empty = validateFinding(validFinding({ files: [] }));
  assert.strictEqual(empty.ok, false);
  assert.ok(empty.errors.some((e) => e.startsWith('files')));

  const notArray = validateFinding(validFinding({ files: 'a.ts:1' }));
  assert.strictEqual(notArray.ok, false);
  assert.ok(notArray.errors.some((e) => e.startsWith('files')));
});

test('validateFinding: accumulates all errors in one pass', () => {
  const result = validateFinding({ severity: 'urgent', confidence: 'medium' });
  assert.strictEqual(result.ok, false);
  // Many required-string errors + two enum errors; should be well over 5.
  assert.ok(result.errors.length >= 5, `got ${result.errors.length}`);
});

test('validateFinding: coerces numeric line numbers in files to strings', () => {
  const result = validateFinding(validFinding({ files: ['a.ts', 7] }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value.files, ['a.ts', '7']);
});
```

- [ ] **Step 1.2: Run — expect failure**

```bash
node --test bin/lib/recon/tests/validate-finding.test.js
```
Expected: fails to load — `Cannot find module '../validate-finding'`.

- [ ] **Step 1.3: Minimal implementation**

Create `bin/lib/recon/validate-finding.js`. Enums are aligned to the Phase 1 Finding shape: `severity` is the `/review` 4-value scale plus `critical`; `confidence` uses `high|med|low`; `category` is the `/review` enum. Required strings match the Finding-shape fields (`signature` is the subagent-supplied stable key the fingerprint normalizes; `id` is assigned by `ingest-judgment` after validation, so it is NOT required here).

```javascript
'use strict';

// Validates a subagent-produced finding against the Phase 1 Finding shape.
// Returns { ok:true, value } (files coerced to strings) or { ok:false, errors:string[] }.
// Zero deps; accumulates all errors in one pass so the caller logs one line per drop.

const SEVERITY_VALUES = new Set(['low', 'medium', 'high', 'critical']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);
const CATEGORY_VALUES = new Set([
  'Architecture', 'Security', 'Convention', 'Performance',
  'Error handling', 'Test quality', 'Coverage', 'UX', 'Docs',
]);

// Required string fields. `id` is assigned by ingest-judgment AFTER validation
// (fingerprint of lens+area+signature), so the subagent never supplies it.
const REQUIRED_STRINGS = [
  'title', 'lens', 'category', 'severity', 'confidence',
  'area', 'signature', 'evidence', 'suggestion', 'acceptance',
];

function validateFinding(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, errors: ['finding: must be an object'] };
  }

  for (const field of REQUIRED_STRINGS) {
    const v = obj[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`${field}: required non-empty string (got ${JSON.stringify(v)})`);
    }
  }

  if (!Array.isArray(obj.files)) {
    errors.push(`files: must be a non-empty array (got ${typeof obj.files})`);
  } else if (obj.files.length === 0) {
    errors.push('files: must contain at least one entry');
  }

  // Enum checks only when the field cleared the string check (avoids double-reporting).
  if (typeof obj.severity === 'string' && !SEVERITY_VALUES.has(obj.severity)) {
    errors.push(`severity: must be one of ${[...SEVERITY_VALUES].join('|')} (got "${obj.severity}")`);
  }
  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  }
  if (typeof obj.category === 'string' && !CATEGORY_VALUES.has(obj.category)) {
    errors.push(`category: must be one of ${[...CATEGORY_VALUES].join('|')} (got "${obj.category}")`);
  }

  if (errors.length > 0) return { ok: false, errors };

  // Coerce files entries to strings: LLMs sometimes emit "path:LINE" with the
  // line as a number. Accept and normalize rather than reject on type alone.
  const value = { ...obj, files: obj.files.map(String) };
  return { ok: true, value };
}

module.exports = { validateFinding, SEVERITY_VALUES, CONFIDENCE_VALUES, CATEGORY_VALUES, REQUIRED_STRINGS };
```

- [ ] **Step 1.4: Run — expect pass**

```bash
node --test bin/lib/recon/tests/validate-finding.test.js
```
Expected: all tests pass, 0 fail.

- [ ] **Step 1.5: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add bin/lib/recon/validate-finding.js bin/lib/recon/tests/validate-finding.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add recon validate-finding — enum + required-field check for subagent output"
```

---

## Task 2: `judgment.js` — work-order builder

`buildWorkOrders` reads the matching `criteria-*.md` at build time and embeds its text into each prompt, along with the Finding JSON shape and the subagent-output-contract status line. It caps the returned list to `maxSubagents`. The lens→criteria map and `OUTPUT_FORMAT` block are exported for the tests.

**Files:**
- New: `bin/lib/recon/judgment.js`
- Test: `bin/lib/recon/tests/judgment.test.js`

- [ ] **Step 2.1: Write the failing test**

The test fixtures the three criteria files into a temp dir (so the test is hermetic and does not depend on Phase 0 content), then points `buildWorkOrders` at that dir via the `criteriaDir` option.

Create `bin/lib/recon/tests/judgment.test.js`:

```javascript
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildWorkOrders, JUDGMENT_LENS_MAP, OUTPUT_FORMAT } = require('../judgment');

// Build a temp criteria dir with sentinel text per lens so we can assert the
// prompt embeds the right fragment.
function makeCriteriaDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-criteria-'));
  fs.writeFileSync(path.join(dir, 'criteria-architecture-depth.md'), 'ARCH_CRITERIA_SENTINEL deep module rubric', 'utf8');
  fs.writeFileSync(path.join(dir, 'criteria-simplification.md'), 'SIMP_CRITERIA_SENTINEL dead code rubric', 'utf8');
  fs.writeFileSync(path.join(dir, 'criteria-review-quality.md'), 'REVIEW_CRITERIA_SENTINEL correctness rubric', 'utf8');
  return dir;
}

test('JUDGMENT_LENS_MAP maps the three lenses to their criteria filenames', () => {
  assert.strictEqual(JUDGMENT_LENS_MAP['architecture-depth'], 'criteria-architecture-depth.md');
  assert.strictEqual(JUDGMENT_LENS_MAP['simplification'], 'criteria-simplification.md');
  assert.strictEqual(JUDGMENT_LENS_MAP['review-quality'], 'criteria-review-quality.md');
});

test('buildWorkOrders: one order per (area, lens) pair', () => {
  const dir = makeCriteriaDir();
  const orders = buildWorkOrders({
    areas: ['src/a', 'src/b'],
    lenses: ['architecture-depth', 'simplification', 'review-quality'],
    maxSubagents: 6,
    criteriaDir: dir,
  });
  assert.strictEqual(orders.length, 6);
  for (const o of orders) {
    assert.ok(o.lensId, 'has lensId');
    assert.ok(o.area, 'has area');
    assert.ok(o.modelTier === 'haiku' || o.modelTier === 'sonnet', `tier was ${o.modelTier}`);
    assert.strictEqual(typeof o.prompt, 'string');
  }
});

test('buildWorkOrders: caps at maxSubagents (truncates the list)', () => {
  const dir = makeCriteriaDir();
  const orders = buildWorkOrders({
    areas: ['src/a', 'src/b', 'src/c'],
    lenses: ['architecture-depth', 'simplification', 'review-quality'],
    maxSubagents: 4,
    criteriaDir: dir,
  });
  assert.strictEqual(orders.length, 4);
});

test('buildWorkOrders: prompt embeds the matching criteria text verbatim', () => {
  const dir = makeCriteriaDir();
  const orders = buildWorkOrders({
    areas: ['src/a'],
    lenses: ['architecture-depth', 'simplification', 'review-quality'],
    maxSubagents: 6,
    criteriaDir: dir,
  });
  const byLens = Object.fromEntries(orders.map((o) => [o.lensId, o]));
  assert.ok(byLens['architecture-depth'].prompt.includes('ARCH_CRITERIA_SENTINEL'));
  assert.ok(byLens['simplification'].prompt.includes('SIMP_CRITERIA_SENTINEL'));
  assert.ok(byLens['review-quality'].prompt.includes('REVIEW_CRITERIA_SENTINEL'));
  // A lens must NOT leak another lens's criteria.
  assert.ok(!byLens['simplification'].prompt.includes('ARCH_CRITERIA_SENTINEL'));
});

test('buildWorkOrders: prompt embeds the contract status line and the Finding JSON shape', () => {
  const dir = makeCriteriaDir();
  const [order] = buildWorkOrders({
    areas: ['src/a'],
    lenses: ['architecture-depth'],
    maxSubagents: 6,
    criteriaDir: dir,
  });
  // Subagent-output-contract status line.
  assert.ok(order.prompt.includes('DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED'));
  // The required output JSON shape (a sample of Finding fields).
  assert.ok(order.prompt.includes('"severity"'));
  assert.ok(order.prompt.includes('"confidence"'));
  assert.ok(order.prompt.includes('"signature"'));
  assert.ok(order.prompt.includes('"acceptance"'));
  // The area is interpolated.
  assert.ok(order.prompt.includes('src/a'));
});

test('buildWorkOrders: unknown lens id is skipped, not crashed', () => {
  const dir = makeCriteriaDir();
  const orders = buildWorkOrders({
    areas: ['src/a'],
    lenses: ['architecture-depth', 'made-up-lens'],
    maxSubagents: 6,
    criteriaDir: dir,
  });
  assert.strictEqual(orders.length, 1);
  assert.strictEqual(orders[0].lensId, 'architecture-depth');
});

test('OUTPUT_FORMAT names the lens enum values', () => {
  assert.ok(OUTPUT_FORMAT.includes('critical'));
  assert.ok(OUTPUT_FORMAT.includes('Architecture'));
});
```

- [ ] **Step 2.2: Run — expect failure**

```bash
node --test bin/lib/recon/tests/judgment.test.js
```
Expected: fails — `Cannot find module '../judgment'`.

- [ ] **Step 2.3: Minimal implementation**

Create `bin/lib/recon/judgment.js`. The default `criteriaDir` resolves to the real `skills/_shared/` (Phase 0 fragments); the tests override it. `modelTier` is per-lens: `architecture-depth` and `review-quality` are multi-file judgment (Sonnet); `simplification` is more mechanical/local (Haiku) — matching the contract's tier table.

```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Lens id -> Phase 0 shared-criteria filename under skills/_shared/.
const JUDGMENT_LENS_MAP = {
  'architecture-depth': 'criteria-architecture-depth.md',
  'simplification': 'criteria-simplification.md',
  'review-quality': 'criteria-review-quality.md',
};

// Per-lens metadata: model tier and a one-line framing for the prompt header.
// Tiers follow skills/_shared/subagent-output-contract.md:
//   Standard (Sonnet) for cross-cutting multi-file judgment;
//   Fast (Haiku) for the more local, mechanical simplification pass.
const LENS_META = {
  'architecture-depth': {
    modelTier: 'sonnet',
    role: 'an architect reviewing this area for shallow, passthrough, or over-abstracted modules (the deep-module lens)',
  },
  'simplification': {
    modelTier: 'haiku',
    role: 'an engineer reviewing this area for unnecessary complexity, dead code, and convoluted logic that has a clearer equivalent',
  },
  'review-quality': {
    modelTier: 'sonnet',
    role: 'a senior reviewer auditing this area for correctness, convention, security, error-handling, and test-quality problems',
  },
};

// Default location of the Phase 0 criteria fragments. bin/lib/recon -> repo via ../../..
const DEFAULT_CRITERIA_DIR = path.resolve(__dirname, '..', '..', '..', 'skills', '_shared');

// Output-format block, embedded verbatim in every prompt so the subagent emits
// exactly the Phase 1 Finding shape (minus `id`, which ingest-judgment assigns).
const OUTPUT_FORMAT = `## Required output format

First line of your reply MUST be exactly one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.

After that line, reply with a single fenced JSON block and nothing after it:

\`\`\`json
[
  {
    "title": "<one-line finding title>",
    "lens": "<this lens id>",
    "category": "<one of: Architecture | Security | Convention | Performance | Error handling | Test quality | Coverage | UX | Docs>",
    "severity": "<low | medium | high | critical>",
    "confidence": "<high | med | low>",
    "area": "<the area path you were given, verbatim>",
    "files": ["<relative/path/to/file.ts:lineNumber>"],
    "signature": "<a short, stable, unique phrase identifying THIS specific issue (no line numbers, no volatile identifiers)>",
    "evidence": "<concrete evidence: what you saw, where, why it is a problem>",
    "suggestion": "<specific, actionable change>",
    "acceptance": "<how to verify the problem is gone>"
  }
]
\`\`\`

Rules:
- If you find nothing worth reporting, emit an empty array: \`\`\`json
[]
\`\`\`
- Report only findings you are confident are real problems, not style preferences.
- At most 5 findings.
- Keep "signature" stable across cosmetic edits: describe the issue, not its current location.
- Use hyphens, not em-dashes, in all text fields.`;

function readCriteria(criteriaDir, filename) {
  try {
    return fs.readFileSync(path.join(criteriaDir, filename), 'utf8').trim();
  } catch (err) {
    // Missing criteria is a configuration error, not a per-finding drop.
    throw new Error(`judgment: criteria fragment not found: ${path.join(criteriaDir, filename)} (${err.code || err.message})`);
  }
}

function buildPrompt(lensId, area, criteriaText) {
  const meta = LENS_META[lensId];
  return `You are ${meta.role}.

Area under review: "${area}"
Read the source files in that area before answering. Do not modify any files — this is read-only analysis.

## What to flag (criteria for the "${lensId}" lens)

${criteriaText}

${OUTPUT_FORMAT}`;
}

// buildWorkOrders({ areas, lenses, maxSubagents, criteriaDir? })
//   -> [{ lensId, area, modelTier, prompt }], capped to maxSubagents.
// Iterates areas-outer, lenses-inner so a partial cap still covers the
// highest-priority area completely before spending budget on the next.
function buildWorkOrders({ areas, lenses, maxSubagents, criteriaDir = DEFAULT_CRITERIA_DIR }) {
  const cap = Number.isFinite(maxSubagents) ? maxSubagents : Infinity;
  const orders = [];

  // Cache each lens's criteria text so we read each fragment at most once.
  const criteriaCache = new Map();

  outer:
  for (const area of areas) {
    for (const lensId of lenses) {
      const filename = JUDGMENT_LENS_MAP[lensId];
      if (!filename) continue; // unknown lens — skip, don't crash
      if (!criteriaCache.has(lensId)) {
        criteriaCache.set(lensId, readCriteria(criteriaDir, filename));
      }
      orders.push({
        lensId,
        area,
        modelTier: LENS_META[lensId].modelTier,
        prompt: buildPrompt(lensId, area, criteriaCache.get(lensId)),
      });
      if (orders.length >= cap) break outer;
    }
  }

  return orders;
}

module.exports = { buildWorkOrders, JUDGMENT_LENS_MAP, LENS_META, OUTPUT_FORMAT };
```

- [ ] **Step 2.4: Run — expect pass**

```bash
node --test bin/lib/recon/tests/judgment.test.js
```
Expected: all tests pass, 0 fail.

- [ ] **Step 2.5: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add bin/lib/recon/judgment.js bin/lib/recon/tests/judgment.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add recon judgment work-order builder — embeds criteria + Finding shape + status line, caps fan-out"
```

---

## Task 3: `bin/recon.js` — `plan-judgment` subcommand

Emits work orders. Writes `.claude-tweaks/recon/runs/<runId>-work-orders.json` AND prints the JSON to stdout. Defaults: `--lenses` → all three, `--max-subagents` → `6`.

**Files:**
- Modify: `bin/recon.js`

> **Working Directory Discipline:** the CLI resolves run-file paths against `--root` (default `process.cwd()`). The SKILL.md always passes `--root .` from the repo root or worktree root. No `cd` inside the CLI.

- [ ] **Step 3.1: Write the failing test (CLI integration)**

Add to `bin/lib/recon/tests/judgment.test.js` (same file — CLI exercises `judgment.js`):

```javascript
const { execFileSync } = require('node:child_process');

const RECON_CLI = path.resolve(__dirname, '..', '..', '..', 'bin', 'recon.js');

test('CLI plan-judgment: writes work-orders file and prints JSON', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-run-'));
  const out = execFileSync('node', [
    RECON_CLI, 'plan-judgment',
    '--root', root,
    '--run-id', 'TESTRUN',
    '--areas', 'src/a,src/b',
    '--lenses', 'architecture-depth,simplification,review-quality',
    '--max-subagents', '4',
  ], { encoding: 'utf8' });

  const printed = JSON.parse(out);
  assert.strictEqual(printed.length, 4, 'stdout JSON respects the cap');

  const filePath = path.join(root, '.claude-tweaks', 'recon', 'runs', 'TESTRUN-work-orders.json');
  assert.ok(fs.existsSync(filePath), 'work-orders file written under gitignored .claude-tweaks');
  const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.deepStrictEqual(onDisk, printed, 'file matches stdout');
});

test('CLI plan-judgment: --areas is required', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-run-'));
  assert.throws(() => {
    execFileSync('node', [RECON_CLI, 'plan-judgment', '--root', root, '--run-id', 'X'],
      { encoding: 'utf8', stdio: 'pipe' });
  }, /areas is required|status 2|Command failed/);
});
```

- [ ] **Step 3.2: Run — expect failure**

```bash
node --test bin/lib/recon/tests/judgment.test.js
```
Expected: the two new CLI tests fail — `plan-judgment` is an unknown command (non-zero exit / no output).

- [ ] **Step 3.3: Minimal implementation**

In `bin/recon.js`, add the requires near the existing Phase 1 imports, then add `cmdPlanJudgment` and route it. (Phase 1's existing arg parser is assumed to produce an `args` object with named flags and a positional `args._` array; if its parser differs, adapt the field reads — the logic is unchanged.)

```javascript
const path = require('node:path');
const fs = require('node:fs');
const { buildWorkOrders, JUDGMENT_LENS_MAP } = require('./lib/recon/judgment');

const DEFAULT_JUDGMENT_LENSES = Object.keys(JUDGMENT_LENS_MAP); // arch, simplification, review-quality
const DEFAULT_MAX_SUBAGENTS = 6;

function reconRunsDir(root) {
  return path.join(root, '.claude-tweaks', 'recon', 'runs');
}

function cmdPlanJudgment(args) {
  const root = args.root || process.cwd();
  const areas = (args.areas || '').split(',').map((a) => a.trim()).filter(Boolean);
  if (areas.length === 0) {
    process.stderr.write('plan-judgment: --areas is required (comma-separated list)\n');
    process.exit(2);
  }
  const lenses = (args.lenses
    ? args.lenses.split(',').map((l) => l.trim()).filter(Boolean)
    : DEFAULT_JUDGMENT_LENSES);
  const maxSubagents = args['max-subagents']
    ? Number(args['max-subagents'])
    : DEFAULT_MAX_SUBAGENTS;

  const orders = buildWorkOrders({ areas, lenses, maxSubagents });
  const json = JSON.stringify(orders, null, 2) + '\n';

  const runId = args['run-id'];
  if (runId) {
    const outDir = reconRunsDir(root);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${runId}-work-orders.json`), json, 'utf8');
  }
  process.stdout.write(json);
}
```

Wire it into the existing command dispatch (alongside the Phase 1 `run` case):

```javascript
  else if (cmd === 'plan-judgment') cmdPlanJudgment(args);
```

- [ ] **Step 3.4: Run — expect pass**

```bash
node --test bin/lib/recon/tests/judgment.test.js
```
Expected: all tests pass, including the two CLI tests.

- [ ] **Step 3.5: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add bin/recon.js bin/lib/recon/tests/judgment.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add recon plan-judgment — emit + write capped work orders under .claude-tweaks/recon/runs"
```

---

## Task 4: `bin/recon.js` — `ingest-judgment` subcommand

Reads a caller-assembled `results.json` (array of `{lensId, area, findings:[...]}`), validates each finding via `validate-finding.js`, fingerprints survivors via Phase 1 `fingerprint.js`, deduplicates via Phase 1 `dedup.js`, and emits issue payloads for survivors via Phase 1 `issue-payload.js`. No registry write — Phase 1 owns dedup state in the cache.

**Files:**
- Modify: `bin/recon.js`
- Test: `bin/lib/recon/tests/judgment.test.js` (CLI ingest path)

> **Phase 1 contract reused, exactly:**
> - `fingerprint({lens, areaId, signature}) -> string` — note the field name is `areaId` (not `area`); pass `areaId: finding.area`.
> - `decide(...)` from `dedup.js` — Phase 1's dedup decision. This plan calls it as `decide({ fingerprint, cache, openIssues })` returning `{ action: 'file' | 'skip' | 'suppress' | 'reopen', issue? }`. If Phase 1's signature differs, adapt the call site to Phase 1's actual export — the ingest flow (validate → fingerprint → dedup → payload-for-survivors) is unchanged.
> - `issue-payload.js` — Phase 1's projection from a Finding to a `gh`-ready payload.

- [ ] **Step 4.1: Write the failing test (CLI integration)**

The test stubs only what Phase 1 owns is NOT re-tested here; we assert the observable contract: malformed findings are dropped (logged to stderr), valid findings produce payloads on stdout, and a results file that is not a JSON array exits non-zero. Add to `bin/lib/recon/tests/judgment.test.js`:

```javascript
test('CLI ingest-judgment: drops malformed findings, emits payloads for valid survivors', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-ingest-'));
  const results = [
    {
      lensId: 'architecture-depth',
      area: 'src/a',
      findings: [
        { // valid
          title: 'Passthrough service', lens: 'architecture-depth', category: 'Architecture',
          severity: 'medium', confidence: 'high', area: 'src/a',
          files: ['src/a/svc.ts:10'], signature: 'passthrough svc',
          evidence: 'delegates with no logic', suggestion: 'inline it',
          acceptance: 'method adds value or is removed',
        },
        { // malformed — bad severity, missing acceptance
          title: 'X', lens: 'architecture-depth', category: 'Architecture',
          severity: 'urgent', confidence: 'high', area: 'src/a',
          files: ['src/a/x.ts:1'], signature: 'x', evidence: 'e', suggestion: 's',
        },
      ],
    },
  ];
  const resultsPath = path.join(root, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results), 'utf8');

  const proc = require('node:child_process').spawnSync('node', [
    RECON_CLI, 'ingest-judgment', resultsPath, '--root', root, '--run-id', 'TESTRUN',
  ], { encoding: 'utf8' });

  assert.strictEqual(proc.status, 0, proc.stderr);
  // Malformed finding logged as dropped.
  assert.ok(/drop/i.test(proc.stderr), `expected a drop log, got: ${proc.stderr}`);
  // Valid survivor surfaced (title appears in stdout payload output).
  assert.ok(proc.stdout.includes('Passthrough service'), proc.stdout);
});

test('CLI ingest-judgment: non-array results file exits non-zero', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-ingest-'));
  const resultsPath = path.join(root, 'bad.json');
  fs.writeFileSync(resultsPath, JSON.stringify({ not: 'an array' }), 'utf8');
  const proc = require('node:child_process').spawnSync('node', [
    RECON_CLI, 'ingest-judgment', resultsPath, '--root', root,
  ], { encoding: 'utf8' });
  assert.notStrictEqual(proc.status, 0);
});
```

- [ ] **Step 4.2: Run — expect failure**

```bash
node --test bin/lib/recon/tests/judgment.test.js
```
Expected: the two ingest tests fail — `ingest-judgment` is unknown.

- [ ] **Step 4.3: Minimal implementation**

Add to `bin/recon.js` (requires at top with the others, then the command + route):

```javascript
const { validateFinding } = require('./lib/recon/validate-finding');
const { fingerprint } = require('./lib/recon/fingerprint');     // Phase 1
const { decide } = require('./lib/recon/dedup');                // Phase 1
const { loadCache, saveCache } = require('./lib/recon/cache');  // Phase 1
const { toIssuePayload } = require('./lib/recon/issue-payload');// Phase 1
```

```javascript
function cmdIngestJudgment(args) {
  const root = args.root || process.cwd();
  const resultsPath = args._[1]; // positional after the subcommand
  if (!resultsPath) {
    process.stderr.write('usage: recon ingest-judgment <results.json> [--run-id <id>]\n');
    process.exit(2);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`ingest-judgment: results file not found or not valid JSON: ${resultsPath}\n`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    process.stderr.write('ingest-judgment: results file must contain a JSON array of {lensId, area, findings}\n');
    process.exit(1);
  }

  // 1. Validate every finding; drop malformed with a logged reason.
  const survivors = [];
  for (const result of raw) {
    if (!result || typeof result.lensId !== 'string' || typeof result.area !== 'string') {
      process.stderr.write('[recon] ingest-judgment: skipping malformed result entry (missing lensId/area)\n');
      continue;
    }
    const findings = Array.isArray(result.findings) ? result.findings : [];
    for (const f of findings) {
      const v = validateFinding(f);
      if (!v.ok) {
        process.stderr.write(
          `[recon] ingest-judgment: dropped finding "${f && f.signature || '?'}" ` +
          `(lens ${result.lensId}, area ${result.area}): ${v.errors.join('; ')}\n`);
        continue;
      }
      // 2. Fingerprint via Phase 1. Field name is areaId.
      const id = fingerprint({ lens: v.value.lens, areaId: v.value.area, signature: v.value.signature });
      survivors.push({ ...v.value, id });
    }
  }

  // 3. Dedup via Phase 1 against the cache; emit payloads only for survivors.
  const cache = loadCache(root);
  const payloads = [];
  for (const finding of survivors) {
    const decision = decide({ fingerprint: finding.id, cache });
    if (decision.action === 'skip' || decision.action === 'suppress') continue;
    payloads.push(toIssuePayload(finding));
  }
  saveCache(root, cache);

  // 4. Emit gh-ready payloads on stdout; the SKILL.md hands these to gh.
  process.stdout.write(JSON.stringify(payloads, null, 2) + '\n');
  process.stderr.write(
    `[recon] ingest-judgment ${args['run-id'] || '?'}: ` +
    `${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`);
}
```

Wire the route:

```javascript
  else if (cmd === 'ingest-judgment') cmdIngestJudgment(args);
```

> **Cross-plan note:** the exact `decide(...)` / `loadCache` / `saveCache` / `toIssuePayload` signatures are owned by Phase 1. The test asserts only the observable contract (drops + payload-on-stdout + non-array failure), so it stays green regardless of Phase 1's internal field names — but the implementer MUST confirm these four signatures against Phase 1's actual exports before running, and adjust the call sites if they differ. The four-step flow (validate → fingerprint → dedup → payload) does not change.

- [ ] **Step 4.4: Run — expect pass**

```bash
node --test bin/lib/recon/tests/judgment.test.js
```
Expected: all tests pass.

- [ ] **Step 4.5: Run the whole recon suite (no regressions in Phase 1 tests)**

```bash
node --test bin/lib/recon/tests/*.test.js
```
Expected: all Phase 1 + Phase 2 tests pass, 0 fail.

- [ ] **Step 4.6: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add bin/recon.js bin/lib/recon/tests/judgment.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add recon ingest-judgment — validate, fingerprint, dedup, emit issue payloads for survivors"
```

---

## Task 5: `skills/recon/SKILL.md` — Judgment Lens Dispatch section

The SKILL.md owns the actual subagent dispatch. This section is markdown, not unit-testable code, so the verification is: write the section, grep that it references the contract + cap + criteria + both subcommands, commit.

**Files:**
- Modify: `skills/recon/SKILL.md`

- [ ] **Step 5.1: Write the section**

Insert this section after the mechanical-lens step (Phase 1) and before the issue-filing/triage step. Show it verbatim:

````markdown
## Judgment Lens Dispatch

Runs after the mechanical lenses, only when judgment lenses are enabled in config (default: `architecture-depth,simplification,review-quality`) and the scoring step selected at least one area. Each judgment lens is an LLM subagent reading the area's source against a shared Phase 0 criteria fragment — `recon.js` itself never calls a model; it emits work orders and ingests results.

> **Parallel execution:** Dispatch the work orders as parallel Task agents — each runs independently against one (area, lens) pair and returns findings in Template A's JSON-block form. Assemble all responses into one results file after every agent completes.
> **Contract:** Each agent follows the Subagent Contract (`skills/_shared/subagent-output-contract.md`) — minimal input (the work order's `prompt` field, nothing else), one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` as its first reply line, then the fenced JSON block the prompt specifies. Use the work order's `modelTier` (`haiku` or `sonnet`). The prompt already embeds the criteria, the Finding JSON shape, and the status-line requirement — pass it verbatim, add nothing.

### Step J1 — Emit work orders

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" plan-judgment \
  --root . \
  --run-id "${RUN_ID}" \
  --areas "${SELECTED_AREAS}" \
  --lenses "${ENABLED_JUDGMENT_LENSES:-architecture-depth,simplification,review-quality}" \
  --max-subagents "${MAX_SUBAGENTS:-6}"
```

This writes `.claude-tweaks/recon/runs/${RUN_ID}-work-orders.json` (gitignored) and prints the same JSON. Each order is `{ lensId, area, modelTier, prompt }`. The list is already truncated to `MAX_SUBAGENTS` — the dispatch loop below iterates at most that many times.

### Step J2 — Dispatch one subagent per work order (capped)

For each work order in the array (no more than `MAX_SUBAGENTS`):
- Dispatch one Task agent at the order's `modelTier`.
- The agent prompt is the order's `prompt` field, used **verbatim** — it already contains the criteria fragment, the required Finding JSON shape, and the status-line instruction.
- Capture the agent's reply. Parse the fenced ```json block into a `findings` array (empty array if the agent reported none).
- Collect one entry per order: `{ "lensId": <order.lensId>, "area": <order.area>, "findings": [ ... ] }`.

Assemble all entries into `.claude-tweaks/recon/runs/${RUN_ID}-results.json` as a JSON array. **Never pass an individual agent's raw text to `ingest-judgment`** — ingest reads the assembled results file so the dedup pass sees the whole run at once.

**Budget rule:** `MAX_SUBAGENTS` defaults to `6` (K=2 areas × 3 lenses). `plan-judgment` enforces the cap by truncating the work-order list; the dispatch loop must not exceed `orders.length`. Never dispatch a lens/area pair that is not in the work-order list.

### Step J3 — Ingest results

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" ingest-judgment \
  ".claude-tweaks/recon/runs/${RUN_ID}-results.json" \
  --root . \
  --run-id "${RUN_ID}"
```

This validates each finding (dropping malformed ones with a logged reason on stderr), fingerprints survivors, deduplicates against the cache and open `recon`-labelled issues, and prints `gh`-ready issue payloads on stdout for the survivors. Hand those payloads to `gh issue create` exactly as in the mechanical-lens triage step (Phase 1) — judgment findings flow through the same filing path.
````

- [ ] **Step 5.2: Add the two Anti-Pattern rows**

Add to the existing `## Anti-Patterns` table in `skills/recon/SKILL.md`:

```markdown
| Dispatching more subagents than `MAX_SUBAGENTS` in one run | Cost is bounded by K and the cap. `plan-judgment` truncates the work-order list; iterate at most `orders.length` and never invent extra lens/area pairs. |
| Passing a single agent's raw reply to `ingest-judgment` | Ingest reads the assembled `results.json` so dedup sees the whole run atomically. Collect every reply into the results file first, then ingest once. |
```

- [ ] **Step 5.3: Verify with grep**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks"
grep -q "subagent-output-contract.md" skills/recon/SKILL.md && echo "OK contract"
grep -q "MAX_SUBAGENTS" skills/recon/SKILL.md && echo "OK cap"
grep -q "plan-judgment" skills/recon/SKILL.md && echo "OK plan-judgment"
grep -q "ingest-judgment" skills/recon/SKILL.md && echo "OK ingest-judgment"
grep -q "criteria" skills/recon/SKILL.md && echo "OK criteria"
grep -q "DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED" skills/recon/SKILL.md && echo "OK status line"
```
Expected: all six `OK` lines print.

- [ ] **Step 5.4: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add skills/recon/SKILL.md
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Add Judgment Lens Dispatch to /recon — emit, dispatch capped subagents, ingest"
```

---

## Task 6: Version bump

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 6.1: Bump the version**

Bump the patch (or the running Phase-series minor, per the team's Phase 0/1 choice) in `.claude-plugin/plugin.json`. If Phase 1 left it at `4.18.0`, Phase 2 is `4.18.1` (feature increment within the recon minor); confirm against the actual value Phase 1 committed before editing.

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" add .claude-plugin/plugin.json
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks" commit -m "Bump version — recon Phase 2 judgment lenses"
```

> The marketplace-repo mirror (`marketplace.json`) is a release step (CLAUDE.md "Releasing (two repos)"), done when the recon series ships — not per-phase.

---

## Self-Review

**Phase 2 spec coverage (design §4, §7, §13):**
- §4 agentic layer — judgment lenses are LLM subagents dispatched only against the top-K selected areas, reading shared criteria; `recon.js` stays deterministic and pure (emit/ingest only, no model call). ✓ (Tasks 2, 3, 4, 5)
- §7 shared criteria — each prompt embeds the matching `criteria-*.md` text at build time; the lens→criteria map is `architecture-depth`→`criteria-architecture-depth.md`, `simplification`→`criteria-simplification.md`, `review-quality`→`criteria-review-quality.md`. ✓ (Task 2, `JUDGMENT_LENS_MAP`)
- §13 Phase 2 — judgment lenses as area-scoped subagents with model-tier control (`haiku`/`sonnet` per lens) and a cap (`MAX_SUBAGENTS` default 6, K=2×3). ✓ (Tasks 2, 3, 5)
- §15 testing — lens contracts validated with mocked/stub agent output (`validate-finding.test.js`); CLI ingest drops malformed and emits payloads (Task 4). ✓

**Cross-plan contract (exact names/paths Phase 3 + the contract depend on):**
- `bin/lib/recon/judgment.js` → `buildWorkOrders({areas, lenses, maxSubagents}) -> [{lensId, area, modelTier, prompt}]`. ✓ (`criteriaDir` is an extra optional arg for test hermeticity; the three required args match the contract exactly.)
- `bin/lib/recon/validate-finding.js` → `validateFinding(obj) -> {ok, errors}`. ✓ (also returns `value` on success for the coerced files — additive, not contract-breaking.)
- `recon.js` gains `plan-judgment --areas <a,b> --lenses <...> [--max-subagents N] [--run-id <id>]` (writes `<runId>-work-orders.json` AND prints) and `ingest-judgment <results.json> [--run-id <id>]` (validate → fingerprint → dedup → payloads). ✓ (Tasks 3, 4)
- Run files under `.claude-tweaks/recon/runs/` — gitignored, not committed. ✓ (design §6)
- SKILL.md "Judgment Lens Dispatch" + two Anti-Patterns (cap, raw-output). ✓ (Task 5)

**Signature consistency with Phase 0/1:**
- Phase 1 `fingerprint({lens, areaId, signature})` — called with `areaId: finding.area` (NOT `area`). Flagged explicitly in Task 4. ✓
- Phase 1 `dedup.decide(...)`, `cache.loadCache/saveCache`, `issue-payload.toIssuePayload` — Task 4 calls them and carries an explicit cross-plan note that the implementer MUST confirm the exact signatures against Phase 1's exports and adapt the call sites if they differ; the four-step flow is invariant and the tests assert only observable behavior. ✓
- Finding shape `{id, title, lens, category, severity, confidence, area, files, evidence, suggestion, acceptance}` — `validate-finding.js` requires all fields EXCEPT `id` (assigned by `ingest-judgment` after fingerprinting). Documented in Task 1. ✓
- Phase 0 criteria filenames match the three `skills/_shared/criteria-*.md` fragments exactly. ✓

**Placeholder scan:** no `TODO`, no `<...>` outside the deliberately-templated subagent OUTPUT_FORMAT JSON (those angle brackets are the literal instruction text the subagent reads), no `foo`/`bar`, no "implement this later." All code is runnable; all commands are exact; all paths are absolute in git/test commands or `--root .`-relative in SKILL.md invocations. ✓

**Open cross-plan concern:** the only soft edges are Phase 1's `decide` / cache / `toIssuePayload` signatures, which this plan cannot pin without Phase 1's source. Task 4 isolates that risk to a single call site, documents it, and keeps tests signature-agnostic. If Phase 1's dedup returns a different action vocabulary than `file/skip/suppress/reopen`, only the `if (decision.action === ...)` guard changes.
