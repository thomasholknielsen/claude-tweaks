# Harness-Health: Design Artifact Staleness Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `PRODUCT.md`/`DESIGN.md` as a new `design-artifact` target kind in `/harness-health`'s existing churn/staleness rotation, so a project's Impeccable-generated design context files get the same drift detection its skills/rules/CLAUDE.md already receive.

**Architecture:** Real Node code changes (unlike the two prior plans in this series, which were prose-only skill markdown) across `bin/lib/harness-health/scope.js` (candidate discovery + a companion fix to `selectTarget`'s domain-path branch), `bin/lib/harness-health/validate-finding.js` and `issue-payload.js` (one-line schema/label widenings — the new kind reuses the existing `kind: "patch"` shape, so no new required-field branch), and `skills/harness-health/SKILL.md` (a lightweight JUDGE branch, one new "always file" rule, and `--kind` enum documentation). TDD throughout: every code change gets a failing test first.

**Tech Stack:** Node.js (`node --test`, no external test framework — matches the rest of `bin/lib/harness-health/`). Skill markdown for the SKILL.md changes (documentation, not executable — no test coverage possible for that file's prose, same as every other skill).

## Global Constraints

- **Reuse `kind: "patch"` — do not add a new finding `kind`.** A design-artifact staleness finding is `{ kind: "patch", assetType: "design-artifact", section: "Freshness", oldString: <staleness evidence>, newString: <regenerate command> }`. This is a deliberate architecture decision (design doc's "Architecture Decision" section) — do not introduce `kind: "recommend-regenerate"` or any other new kind value.
- **Reuse `rule`'s `pathGlobs` field name and code path — do not introduce a parallel `domainPaths` field.** `selectTarget`'s Phase 2 domain-path branch currently gates on `candidate.kind === 'rule'`; Task 1 widens this to `(candidate.kind === 'rule' || candidate.kind === 'design-artifact')`. This is a **required companion fix**, not optional — without it, a `design-artifact` candidate's curated `pathGlobs` list is silently ignored in favor of `extractDomainPaths(content)` scraping `PRODUCT.md`/`DESIGN.md`'s own prose for backtick-quoted paths, which defeats the whole point of `DESIGN.md`'s curated frontend-signal glob list.
- **`design-artifact` findings always file, never auto-apply.** Task 3's Step 7 addition mirrors the existing `claude-md` carve-out exactly (same "always file regardless of classification/confidence/reversibility" wording pattern). Regenerating means re-running an interactive interview or a full codebase scan — never a safe mechanical text patch.
- **No new finding-kind schema fields.** `validate-finding.js`'s `kind: "patch"` branch (requiring `section`/`oldString`/`newString`) already covers everything a design-artifact finding needs — Task 2 only widens `ASSET_TYPE_VALUES`, nothing else in that file changes.
- **The lightweight JUDGE branch for `design-artifact` lives in `skills/harness-health/SKILL.md` itself, not `_shared/harness-health-analysis.md`.** That shared file is read by `/wrap-up` and `/init` too, and neither of them ever passes a `design-artifact` target — putting a design-artifact-specific procedure there would misleadingly imply those callers need to handle it.
- **No "file was never generated" detection.** If `design-integration: enabled` but `PRODUCT.md`/`DESIGN.md` don't exist at any canonical or fallback path, `listDesignArtifacts` omits that candidate — it never surfaces as a target, and no task in this plan adds a "missing" finding type. Out of scope per the design doc's Non-Goals.
- **No per-kind `STALE_DAYS` override.** Both `PRODUCT` and `DESIGN` candidates use the existing global `STALE_DAYS = 90` (`bin/lib/harness-health/score.js`) — no new constant, no per-kind threshold.
- **`daysSinceLastAudit`/`churnCount` are added to `selectTarget`'s return value for every kind, not design-artifact-specific.** This is a small, generically useful enrichment (Task 1) — skill/rule/claude-md findings continue to ignore the new fields; only the design-artifact JUDGE branch (Task 3) reads them.

---

### Task 1: `scope.js` — `listDesignArtifacts`, the Phase 2 companion fix, and `selectTarget`'s new return fields

**Files:**
- Modify: `bin/lib/harness-health/scope.js` (insert new functions after `listClaudeMd`; modify `listTargets`; modify `selectTarget`'s Phase 1 return, Phase 2 domain-path branch, and Phase 2 return; modify `module.exports`)
- Test: `bin/lib/harness-health/tests/scope.test.js`
- Test: `bin/lib/harness-health/tests/cli-next-target.test.js`

**Interfaces:**
- Consumes: nothing from other tasks — this task defines everything it needs.
- Produces: `listDesignArtifacts(root)` returning `[{ kind: 'design-artifact', id: 'PRODUCT'|'DESIGN', path, pathGlobs }]`; `readDesignIntegrationFlag(root)` returning the raw string value (or `'disabled'` as the default); `selectTarget`'s return value gains `daysSinceLastAudit` (number or `null`) on `why: 'stale'` picks and `churnCount` (number) on `why: 'hotspot'` picks. Task 2 and Task 3 consume these by name.

- [ ] **Step 1: Write failing tests for `readDesignIntegrationFlag` and `listDesignArtifacts`**

Add to `bin/lib/harness-health/tests/scope.test.js`. First, extend the top-of-file import to include the two new functions:

Find this exact existing text (currently lines 7-10):

```js
const {
  listSkills, extractDomainPaths, domainChurn, selectTarget,
  listRules, parseRulePaths, listClaudeMd, listTargets,
} = require('../scope');
```

Replace it with:

```js
const {
  listSkills, extractDomainPaths, domainChurn, selectTarget,
  listRules, parseRulePaths, listClaudeMd, listTargets,
  readDesignIntegrationFlag, listDesignArtifacts,
} = require('../scope');
```

Then add this new test block immediately after the existing `listClaudeMd` test block (after the line `assert.strictEqual(result[0].path, path.join(root, 'CLAUDE.md'));` and its closing `});`, before the `// ─── listTargets ───` comment):

```js
// ─── readDesignIntegrationFlag / listDesignArtifacts ──────────────────────

test('readDesignIntegrationFlag returns disabled when CLAUDE.md does not exist', () => {
  const root = tmp();
  assert.strictEqual(readDesignIntegrationFlag(root), 'disabled');
});

test('readDesignIntegrationFlag parses the design-integration value from CLAUDE.md', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n\n## Design integration\n\ndesign-integration: enabled\n');
  assert.strictEqual(readDesignIntegrationFlag(root), 'enabled');
});

test('readDesignIntegrationFlag returns disabled when the flag is absent from CLAUDE.md', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n\nNo design flag here.\n');
  assert.strictEqual(readDesignIntegrationFlag(root), 'disabled');
});

test('listDesignArtifacts returns [] when design-integration is not enabled', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: plugin-only\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# Product context');
  assert.deepStrictEqual(listDesignArtifacts(root), []);
});

test('listDesignArtifacts returns [] when CLAUDE.md is absent, even if PRODUCT.md/DESIGN.md exist', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# Product context');
  assert.deepStrictEqual(listDesignArtifacts(root), []);
});

test('listDesignArtifacts finds PRODUCT.md and DESIGN.md at the project root when enabled', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# Product context');
  fs.writeFileSync(path.join(root, 'DESIGN.md'), '# Design system');
  const artifacts = listDesignArtifacts(root);
  assert.deepStrictEqual(artifacts.map((a) => a.id).sort(), ['DESIGN', 'PRODUCT']);
  assert.ok(artifacts.every((a) => a.kind === 'design-artifact'));
});

test('listDesignArtifacts omits a file that is absent at every canonical and fallback path', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# Product context');
  const artifacts = listDesignArtifacts(root);
  assert.deepStrictEqual(artifacts.map((a) => a.id), ['PRODUCT']);
});

test('listDesignArtifacts falls back to docs/design/ then docs/ when root files are absent', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.mkdirSync(path.join(root, 'docs', 'design'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'design', 'PRODUCT.md'), '# fallback product');
  fs.writeFileSync(path.join(root, 'docs', 'DESIGN.md'), '# fallback design');
  const artifacts = listDesignArtifacts(root);
  const product = artifacts.find((a) => a.id === 'PRODUCT');
  const design = artifacts.find((a) => a.id === 'DESIGN');
  assert.strictEqual(product.path, path.join(root, 'docs', 'design', 'PRODUCT.md'));
  assert.strictEqual(design.path, path.join(root, 'docs', 'DESIGN.md'));
});

test('listDesignArtifacts gives PRODUCT empty pathGlobs and DESIGN the frontend-signal glob list', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# p');
  fs.writeFileSync(path.join(root, 'DESIGN.md'), '# d');
  const artifacts = listDesignArtifacts(root);
  const product = artifacts.find((a) => a.id === 'PRODUCT');
  const design = artifacts.find((a) => a.id === 'DESIGN');
  assert.deepStrictEqual(product.pathGlobs, []);
  assert.ok(design.pathGlobs.includes('components/'));
  assert.ok(design.pathGlobs.includes('*.tsx'));
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

```bash
node --test bin/lib/harness-health/tests/scope.test.js 2>&1 | tail -30
```

Expected: FAIL — `readDesignIntegrationFlag` and `listDesignArtifacts` are not defined (not yet exported from `../scope`).

- [ ] **Step 3: Implement `readDesignIntegrationFlag` and `listDesignArtifacts`, wire into `listTargets`**

In `bin/lib/harness-health/scope.js`, find this exact existing text:

```js
// ─── listClaudeMd ──────────────────────────────────────────────────────────────
// Returns a single-item list, [{ kind: 'claude-md', id: 'CLAUDE', path }], if
// <root>/CLAUDE.md exists — [] otherwise. Not a rotation candidate among
// siblings of its own kind (there's only ever one project CLAUDE.md), but
// competes in the same unified pool as skills/rules for churn/staleness
// selection.
function listClaudeMd(root) {
  const filePath = path.join(root, 'CLAUDE.md');
  if (!fs.existsSync(filePath)) return [];
  return [{ kind: 'claude-md', id: 'CLAUDE', path: filePath }];
}

// ─── listTargets ────────────────────────────────────────────────────────────
// Aggregates listSkills + listRules + listClaudeMd into one flat pool for the
// unified rotation/selection algorithm.
function listTargets(root) {
  return [...listSkills(root), ...listRules(root), ...listClaudeMd(root)];
}
```

Replace it with:

```js
// ─── listClaudeMd ──────────────────────────────────────────────────────────────
// Returns a single-item list, [{ kind: 'claude-md', id: 'CLAUDE', path }], if
// <root>/CLAUDE.md exists — [] otherwise. Not a rotation candidate among
// siblings of its own kind (there's only ever one project CLAUDE.md), but
// competes in the same unified pool as skills/rules for churn/staleness
// selection.
function listClaudeMd(root) {
  const filePath = path.join(root, 'CLAUDE.md');
  if (!fs.existsSync(filePath)) return [];
  return [{ kind: 'claude-md', id: 'CLAUDE', path: filePath }];
}

// ─── readDesignIntegrationFlag ─────────────────────────────────────────────
// Parses CLAUDE.md's `design-integration:` value. Returns 'disabled' when
// CLAUDE.md is missing/unreadable or the flag is absent — mirrors the design
// wrapper's own "missing flag = disabled" rule (skills/design/SKILL.md Layer 1).
function readDesignIntegrationFlag(root) {
  let content;
  try { content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'); } catch { return 'disabled'; }
  const m = content.match(/^design-integration:\s*(\S+)/m);
  return m ? m[1] : 'disabled';
}

// ─── DESIGN_DOMAIN_PATHS ────────────────────────────────────────────────────
// Frontend-signal git pathspecs, matching the file/directory signals /init's
// bootstrap uses for frontend detection. DESIGN.md documents the visual
// system, so churn here since its last regeneration is a meaningful
// staleness proxy.
const DESIGN_DOMAIN_PATHS = [
  '*.tsx', '*.jsx', '*.vue', '*.svelte', '*.css',
  'components/', 'pages/', 'app/', 'routes/', 'views/', 'ui/',
];

// ─── listDesignArtifacts ────────────────────────────────────────────────────
// Returns [{ kind: 'design-artifact', id: 'PRODUCT'|'DESIGN', path, pathGlobs }]
// for PRODUCT.md/DESIGN.md, gated on design-integration being exactly
// 'enabled' ('plugin-only' and 'disabled' both skip — matches the design
// wrapper's Layer 1). Resolves each file at the project root first, then
// docs/design/<filename>, then docs/<filename> as fallbacks (a deterministic
// equivalent of the LLM-oriented glob description in
// skills/design/modes/pre-build.md's own fallback discovery step). A file
// absent at every location is simply omitted — not an error, not a finding.
// pathGlobs reuses the same field name (and, in selectTarget, the same
// domain-path branch) as a rule's pathGlobs — see selectTarget below.
function listDesignArtifacts(root) {
  if (readDesignIntegrationFlag(root) !== 'enabled') return [];

  const candidates = [
    { id: 'PRODUCT', filename: 'PRODUCT.md', pathGlobs: [] },
    { id: 'DESIGN', filename: 'DESIGN.md', pathGlobs: DESIGN_DOMAIN_PATHS },
  ];

  const results = [];
  for (const c of candidates) {
    const searchPaths = [
      path.join(root, c.filename),
      path.join(root, 'docs', 'design', c.filename),
      path.join(root, 'docs', c.filename),
    ];
    const resolved = searchPaths.find((p) => fs.existsSync(p));
    if (resolved) {
      results.push({ kind: 'design-artifact', id: c.id, path: resolved, pathGlobs: c.pathGlobs });
    }
  }
  return results;
}

// ─── listTargets ────────────────────────────────────────────────────────────
// Aggregates listSkills + listRules + listClaudeMd + listDesignArtifacts into
// one flat pool for the unified rotation/selection algorithm.
function listTargets(root) {
  return [...listSkills(root), ...listRules(root), ...listClaudeMd(root), ...listDesignArtifacts(root)];
}
```

- [ ] **Step 4: Run the tests again and verify `listDesignArtifacts`/`readDesignIntegrationFlag` tests pass**

```bash
node --test bin/lib/harness-health/tests/scope.test.js 2>&1 | tail -15
```

Expected: all tests pass (the `selectTarget`/`listTargets`-aggregation tests you'll add in Steps 5-8 don't exist yet at this point — only confirm no failures among the tests that exist so far).

- [ ] **Step 5: Write failing tests for `listTargets` aggregation and `selectTarget`'s new return fields**

Add to `bin/lib/harness-health/tests/scope.test.js`, immediately after the existing `listTargets aggregates skills, rules, and CLAUDE.md...` test (before the `// ─── domainChurn ───` comment):

```js
test('listTargets includes design artifacts when design-integration is enabled', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# p');
  const targets = listTargets(root);
  assert.ok(targets.some((t) => t.kind === 'design-artifact' && t.id === 'PRODUCT'));
});
```

Then add these two tests at the very end of the file (after the last existing `selectTarget --kind filter...` test):

```js
test('selectTarget reports daysSinceLastAudit: null for a never-audited (no cursor) stale pick', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const result = selectTarget(root, {}, { now: Date.now() });
  assert.strictEqual(result.why, 'stale');
  assert.strictEqual(result.daysSinceLastAudit, null);
});

test('selectTarget reports a numeric daysSinceLastAudit for a stale pick with a prior cursor', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const staleMs = Date.now() - (90 + 10) * 86400000;
  const result = selectTarget(root, { 'skill:auth': { lastAuditedMs: staleMs } }, { now: Date.now() });
  assert.strictEqual(result.why, 'stale');
  assert.ok(result.daysSinceLastAudit >= 100, `expected >= 100, got ${result.daysSinceLastAudit}`);
});

test('selectTarget reports churnCount on a hotspot pick', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const recentMs = Date.now() - 1 * 86400000;
  const result = selectTarget(root, { 'skill:auth': { lastAuditedMs: recentMs } }, {
    now: Date.now(),
    signals: { 'skill:auth': 7 },
  });
  assert.strictEqual(result.why, 'hotspot');
  assert.strictEqual(result.churnCount, 7);
});

test('selectTarget Phase 2 uses a design-artifact candidate pathGlobs, not content-scraped paths', () => {
  const root = tmp();
  initGitRepo(root);
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.mkdirSync(path.join(root, 'components'), { recursive: true });
  fs.writeFileSync(path.join(root, 'components', 'Button.tsx'), 'export const Button = () => null;\n');
  fs.writeFileSync(path.join(root, 'DESIGN.md'), 'No backtick file references in this prose at all.');
  commit(root, 'first');
  const sinceMs = Date.now() - 86400000;
  fs.writeFileSync(path.join(root, 'components', 'Button.tsx'), 'export const Button = () => <button />;\n');
  commit(root, 'second');
  const recentMs = Date.now() - 1 * 86400000;
  const result = selectTarget(root, { 'design-artifact:DESIGN': { lastAuditedMs: sinceMs } }, {
    now: Date.now(),
    kind: 'design-artifact',
  });
  assert.ok(result !== null, 'must pick DESIGN via its curated pathGlobs, not via content-scraping (which would find zero backtick paths and score 0 churn)');
  assert.strictEqual(result.id, 'DESIGN');
  assert.strictEqual(result.why, 'hotspot');
});
```

Note the last test deliberately writes `DESIGN.md` content with **zero backtick-quoted file paths** — if the Phase 2 companion fix (Step 7 below) is missing, `extractDomainPaths` would find nothing, `domainChurn` would be called with `[]`, churn would be `0`, and `selectTarget` would return `null` instead of picking `DESIGN`. This test fails specifically without the companion fix, not just without `listDesignArtifacts`.

- [ ] **Step 6: Run the tests again and verify the new `selectTarget`/`listTargets` tests fail**

```bash
node --test bin/lib/harness-health/tests/scope.test.js 2>&1 | tail -40
```

Expected: FAIL — `daysSinceLastAudit`/`churnCount` are `undefined` on the returned object (not yet added), and the Phase-2-companion-fix test returns `null` instead of the `DESIGN` pick.

- [ ] **Step 7: Implement `selectTarget`'s new return fields and the Phase 2 companion fix**

In `bin/lib/harness-health/scope.js`, find this exact existing text:

```js
  // Phase 1: force-pick any target unaudited past STALE_DAYS.
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.id}`;
    const cursor = cursors[key];
    const lastAuditedMs = cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > STALE_DAYS) {
      return { ...candidate, why: 'stale' };
    }
  }
```

Replace it with:

```js
  // Phase 1: force-pick any target unaudited past STALE_DAYS.
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.id}`;
    const cursor = cursors[key];
    const lastAuditedMs = cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > STALE_DAYS) {
      return { ...candidate, why: 'stale', daysSinceLastAudit: Number.isFinite(daysSince) ? Math.round(daysSince) : null };
    }
  }
```

Then find this exact existing text:

```js
      let content;
      try { content = fs.readFileSync(candidate.path, 'utf8'); } catch { content = ''; }
      const domainPaths = candidate.kind === 'rule' && candidate.pathGlobs && candidate.pathGlobs.length > 0
        ? candidate.pathGlobs
        : extractDomainPaths(content);
      churn = domainChurn(root, domainPaths, sinceMs);
```

Replace it with:

```js
      let content;
      try { content = fs.readFileSync(candidate.path, 'utf8'); } catch { content = ''; }
      const domainPaths = (candidate.kind === 'rule' || candidate.kind === 'design-artifact') && candidate.pathGlobs && candidate.pathGlobs.length > 0
        ? candidate.pathGlobs
        : extractDomainPaths(content);
      churn = domainChurn(root, domainPaths, sinceMs);
```

Then find this exact existing text:

```js
  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.churn !== a.churn ? b.churn - a.churn : (a.candidate.id < b.candidate.id ? -1 : 1)));
  return { ...scored[0].candidate, why: 'hotspot' };
}

module.exports = {
  listSkills, parseRulePaths, listRules, listClaudeMd, listTargets,
  extractDomainPaths, domainChurn, selectTarget,
};
```

Replace it with:

```js
  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.churn !== a.churn ? b.churn - a.churn : (a.candidate.id < b.candidate.id ? -1 : 1)));
  return { ...scored[0].candidate, why: 'hotspot', churnCount: scored[0].churn };
}

module.exports = {
  listSkills, parseRulePaths, listRules, listClaudeMd, listTargets,
  extractDomainPaths, domainChurn, selectTarget,
  readDesignIntegrationFlag, listDesignArtifacts,
};
```

- [ ] **Step 8: Run the full scope.test.js suite and verify everything passes**

```bash
node --test bin/lib/harness-health/tests/scope.test.js 2>&1 | tail -15
```

Expected: `# fail 0`.

- [ ] **Step 9: Write a failing end-to-end CLI test, verify it fails, then verify it passes with no further code changes**

Add to `bin/lib/harness-health/tests/cli-next-target.test.js`, at the end of the file:

```js
test('next-target --kind design-artifact surfaces a stale PRODUCT.md when design-integration is enabled', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: enabled\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# Product context');
  const result = runNextTarget(['--kind', 'design-artifact'], root);
  assert.strictEqual(result.target.kind, 'design-artifact');
  assert.strictEqual(result.target.id, 'PRODUCT');
  assert.strictEqual(result.target.why, 'stale');
});

test('next-target does not surface design artifacts when design-integration is not enabled', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## Design integration\n\ndesign-integration: disabled\n');
  fs.writeFileSync(path.join(root, 'PRODUCT.md'), '# Product context');
  const result = runNextTarget(['--kind', 'design-artifact'], root);
  assert.strictEqual(result.target, null);
});
```

Run:

```bash
node --test bin/lib/harness-health/tests/cli-next-target.test.js 2>&1 | tail -20
```

Expected: `# fail 0` — this end-to-end test exercises `scope.js` purely through the existing, unmodified `next-target` CLI command, so it should pass immediately once Steps 3 and 7's code lands with no additional CLI changes. If it fails, the bug is in Step 3 or 7's implementation, not in `bin/harness-health.js` (which this task does not touch).

- [ ] **Step 10: Commit**

```bash
git add bin/lib/harness-health/scope.js bin/lib/harness-health/tests/scope.test.js bin/lib/harness-health/tests/cli-next-target.test.js
git commit -m "Add design-artifact target kind to harness-health's scope/selection engine"
```

---

### Task 2: `validate-finding.js` + `issue-payload.js` — schema and label widenings

**Files:**
- Modify: `bin/lib/harness-health/validate-finding.js:8`
- Modify: `bin/lib/harness-health/issue-payload.js:6`
- Test: `bin/lib/harness-health/tests/validate-finding.test.js`
- Test: `bin/lib/harness-health/tests/issue-payload.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 directly — this task's finding fixtures are self-contained test data, not live output from `scope.js`.
- Produces: `assetType: 'design-artifact'` accepted by `validateFinding`; `toIssuePayload` rendering a `"Design Context"` label. Task 3's SKILL.md prose references both by name.

- [ ] **Step 1: Write a failing test for `validateFinding` accepting `design-artifact`**

In `bin/lib/harness-health/tests/validate-finding.test.js`, add this test immediately after the existing `validateFinding accepts a well-formed patch finding` test:

```js
test('validateFinding accepts assetType: design-artifact', () => {
  const result = validateFinding(validPatch({ assetType: 'design-artifact', target: 'PRODUCT', section: 'Freshness' }));
  assert.strictEqual(result.ok, true);
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
node --test bin/lib/harness-health/tests/validate-finding.test.js 2>&1 | tail -20
```

Expected: FAIL — `assetType: must be one of skill|rule|claude-md (got "design-artifact")`.

- [ ] **Step 3: Widen `ASSET_TYPE_VALUES`**

In `bin/lib/harness-health/validate-finding.js`, find this exact existing text (currently line 8):

```js
const ASSET_TYPE_VALUES = new Set(['skill', 'rule', 'claude-md']);
```

Replace it with:

```js
const ASSET_TYPE_VALUES = new Set(['skill', 'rule', 'claude-md', 'design-artifact']);
```

- [ ] **Step 4: Run the full validate-finding.test.js suite and verify everything passes**

```bash
node --test bin/lib/harness-health/tests/validate-finding.test.js 2>&1 | tail -15
```

Expected: `# fail 0`.

- [ ] **Step 5: Write a failing test for `toIssuePayload`'s design-artifact label**

In `bin/lib/harness-health/tests/issue-payload.test.js`, add this test immediately after the existing `toIssuePayload title reflects asset type and category` test:

```js
test('toIssuePayload title uses the Design Context label for a design-artifact finding', () => {
  const payload = toIssuePayload(patchFinding({
    assetType: 'design-artifact', target: 'PRODUCT', section: 'Freshness',
    oldString: 'Unaudited for 120 days', newString: 'Run /impeccable:impeccable init',
  }));
  assert.ok(payload.title.startsWith('Design Context drift:'), payload.title);
  assert.ok(payload.body.includes('Unaudited for 120 days'));
  assert.ok(payload.body.includes('Run /impeccable:impeccable init'));
});
```

- [ ] **Step 6: Run the test and verify it fails**

```bash
node --test bin/lib/harness-health/tests/issue-payload.test.js 2>&1 | tail -20
```

Expected: FAIL — the title starts with `design-artifact drift:` (the raw, unlabeled asset type), not `Design Context drift:`.

- [ ] **Step 7: Widen `ASSET_TYPE_LABELS`**

In `bin/lib/harness-health/issue-payload.js`, find this exact existing text (currently line 6):

```js
const ASSET_TYPE_LABELS = { skill: 'Skill', rule: 'Rule', 'claude-md': 'CLAUDE.md' };
```

Replace it with:

```js
const ASSET_TYPE_LABELS = { skill: 'Skill', rule: 'Rule', 'claude-md': 'CLAUDE.md', 'design-artifact': 'Design Context' };
```

- [ ] **Step 8: Run the full issue-payload.test.js suite and verify everything passes**

```bash
node --test bin/lib/harness-health/tests/issue-payload.test.js 2>&1 | tail -15
```

Expected: `# fail 0`.

- [ ] **Step 9: Commit**

```bash
git add bin/lib/harness-health/validate-finding.js bin/lib/harness-health/issue-payload.js bin/lib/harness-health/tests/validate-finding.test.js bin/lib/harness-health/tests/issue-payload.test.js
git commit -m "Accept design-artifact asset type in harness-health's validation and issue rendering"
```

---

### Task 3: `skills/harness-health/SKILL.md` — JUDGE branch, Step 7 rule, `--kind` documentation, final verification

**Files:**
- Modify: `skills/harness-health/SKILL.md` (3 `--kind` enum mentions; Step 3; Step 7)

**Interfaces:**
- Consumes: `target.kind === 'design-artifact'`, `target.id`, `target.why`, `target.daysSinceLastAudit`, `target.churnCount`, `target.pathGlobs` from Task 1's `selectTarget`/`listDesignArtifacts`; `assetType: 'design-artifact'` and `kind: "patch"` from Task 2's widened schema.
- Produces: nothing consumed by later tasks (final task).

- [ ] **Step 1: Update the three `--kind <skill|rule|claude-md>` mentions**

In `skills/harness-health/SKILL.md`, make three separate exact-match replacements (each line is unique in the file, so each is a distinct find/replace):

Find: `- You want to check one specific target right now (\`--target <name> [--kind <skill|rule|claude-md>]\`).`
Replace: `- You want to check one specific target right now (\`--target <name> [--kind <skill|rule|claude-md|design-artifact>]\`).`

Find: `- \`--kind <skill|rule|claude-md>\` — disambiguate \`--target\` when an id collides across kinds, or (without \`--target\`) restrict auto-selection to one kind.`
Replace: `- \`--kind <skill|rule|claude-md|design-artifact>\` — disambiguate \`--target\` when an id collides across kinds, or (without \`--target\`) restrict auto-selection to one kind.`

Find: `- Option 2 — \`label\`: \`"Audit one target"\`, \`description\`: \`"/claude-tweaks:harness-health --target <name> --kind <skill|rule|claude-md> — audit one specific target right now"\``
Replace: `- Option 2 — \`label\`: \`"Audit one target"\`, \`description\`: \`"/claude-tweaks:harness-health --target <name> --kind <skill|rule|claude-md|design-artifact> — audit one specific target right now"\``

- [ ] **Step 2: Add the design-artifact JUDGE branch to Step 3**

In `skills/harness-health/SKILL.md`, find this exact existing text:

```markdown
**Step 3 — JUDGE the target.**

Apply the full procedure in `_shared/harness-health-analysis.md` (the 8-dimension check, evidence pre-checks, verify gate, concrete gap signals — using `target.kind` to select which dimensions and origin-template references apply) to the target. Emit findings as a JSON array in the Finding Shape that file defines, with `assetType` set to `target.kind` and `target` set to `target.id`. Write the array to `/tmp/harness-health-findings.json`.
```

Replace it with:

```markdown
**Step 3 — JUDGE the target.**

When `target.kind === 'design-artifact'`, skip the full procedure below — construct one finding directly, without a content read:

1. Map `target.id` to its regenerate command: `PRODUCT` → `/impeccable:impeccable init`, `DESIGN` → `/impeccable:impeccable document`.
2. Build `oldString` from `target.why`: `"Unaudited for {target.daysSinceLastAudit} days"` when `why: "stale"`, or `"{target.churnCount} commits touching {target.pathGlobs joined with ', '}, since last audit"` when `why: "hotspot"`.
3. Emit one finding: `{ kind: "patch", assetType: "design-artifact", target: target.id, category: "drift", section: "Freshness", oldString: <from step 2>, newString: "Run {regenerate command}", classification: "restructural", confidence: "high", reversibility: "high", reason: <one sentence restating the oldString evidence>, description: "Re-run {regenerate command} to refresh {target.id === 'PRODUCT' ? 'PRODUCT.md' : 'DESIGN.md'}, confirm the regenerated content still matches the project's actual state, and close this issue." }`. Write it (as a single-element array, or appended to an existing array if the gap scan also ran this firing) to `/tmp/harness-health-findings.json`.

This branch doesn't need `_shared/harness-health-analysis.md`'s 8-dimension check — the 8 dimensions (template conformance, best-practice fit, cross-skill overlap, etc.) are skill/rule/claude-md-specific and don't map onto a project-root design-context file. `_shared/harness-health-analysis.md` is shared by `/wrap-up` and `/init`, neither of which ever passes a `design-artifact` target, so this branch lives here rather than in the shared file.

For every other `target.kind`, apply the full procedure in `_shared/harness-health-analysis.md` (the 8-dimension check, evidence pre-checks, verify gate, concrete gap signals — using `target.kind` to select which dimensions and origin-template references apply) to the target. Emit findings as a JSON array in the Finding Shape that file defines, with `assetType` set to `target.kind` and `target` set to `target.id`. Write the array to `/tmp/harness-health-findings.json`.
```

- [ ] **Step 3: Add the design-artifact "always file" rule to Step 7**

In `skills/harness-health/SKILL.md`, find this exact existing text:

```markdown
For each payload:
- If `payload.assetType === 'claude-md'` — **always file it, regardless of classification/confidence/reversibility.** CLAUDE.md governs every future session's behavior; an unattended routine auto-editing it carries outsized blast radius compared to one skill's documentation. This overrides the additive/high/high rule below.
- Otherwise, if `payload.classification === "additive"`, `payload.confidence === "high"`, and `payload.reversibility === "high"` — apply it directly with `Edit` (using `payload.oldString`/`payload.newString` exactly), commit: `git commit -am "harness-health: apply additive patch to {target} ({section})"`, then mark it applied so it doesn't get re-proposed: `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "${payload.id}" applied --root .`.
- Otherwise (restructural patches, any new-skill candidate, lower confidence/reversibility, or any CLAUDE.md finding) — file it: `gh issue create --title "<payload.title>" --body "<payload.body>" --label harness-health --label "<payload.labels[1]>"`.
```

Replace it with:

```markdown
For each payload:
- If `payload.assetType === 'claude-md'` — **always file it, regardless of classification/confidence/reversibility.** CLAUDE.md governs every future session's behavior; an unattended routine auto-editing it carries outsized blast radius compared to one skill's documentation. This overrides the additive/high/high rule below.
- If `payload.assetType === 'design-artifact'` — **always file it, regardless of classification/confidence/reversibility.** Regenerating means re-running an interactive interview (`init`) or a full codebase scan (`document`), not a safe mechanical text patch — human review belongs before either lands.
- Otherwise, if `payload.classification === "additive"`, `payload.confidence === "high"`, and `payload.reversibility === "high"` — apply it directly with `Edit` (using `payload.oldString`/`payload.newString` exactly), commit: `git commit -am "harness-health: apply additive patch to {target} ({section})"`, then mark it applied so it doesn't get re-proposed: `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "${payload.id}" applied --root .`.
- Otherwise (restructural patches, any new-skill candidate, lower confidence/reversibility, or any CLAUDE.md finding) — file it: `gh issue create --title "<payload.title>" --body "<payload.body>" --label harness-health --label "<payload.labels[1]>"`.
```

- [ ] **Step 4: Verify the SKILL.md edits landed correctly**

```bash
grep -c "design-artifact" skills/harness-health/SKILL.md
```

Expected: `7` — the 3 `--kind` mentions, `target.kind === 'design-artifact'` (Step 3), `assetType: "design-artifact"` (Step 3's finding shape), the sentence beginning "`_shared/harness-health-analysis.md` is shared by..." (Step 3, mentions "design-artifact" once), and `payload.assetType === 'design-artifact'` (Step 7).

```bash
grep -n "^\*\*Step 3" skills/harness-health/SKILL.md
grep -n "^\*\*Step 7" skills/harness-health/SKILL.md
```

Expected: exactly one match each, unchanged positions relative to the surrounding Step 1/2/4/5/6/8 headings.

- [ ] **Step 5: Full-repo consistency check across all three tasks**

```bash
grep -rln "design-artifact" bin/ skills/
```

Expected: `bin/lib/harness-health/scope.js`, `bin/lib/harness-health/validate-finding.js`, `bin/lib/harness-health/issue-payload.js`, `bin/lib/harness-health/tests/scope.test.js`, `bin/lib/harness-health/tests/validate-finding.test.js`, `bin/lib/harness-health/tests/issue-payload.test.js`, `bin/lib/harness-health/tests/cli-next-target.test.js`, `skills/harness-health/SKILL.md` — eight files, no others. If `_shared/harness-health-analysis.md` appears in this list, something leaked into the shared file in violation of the Global Constraints — investigate before proceeding.

```bash
grep -n "domainPaths:" bin/lib/harness-health/scope.js
```

Expected: no output. `domainPaths` legitimately still appears in `scope.js` as the pre-existing `extractDomainPaths` function name and as Phase 2's pre-existing local variable name (both unchanged by this plan) — this check instead confirms no object-literal field was accidentally named `domainPaths:` (the field Task 1 deliberately named `pathGlobs` instead, to share `rule`'s existing branch — see Global Constraints). A match here means the companion fix's field-name reuse didn't land as specified.

- [ ] **Step 6: Run the full test suite**

```bash
npm test 2>&1 | tail -15
```

Expected: 0 or 1 failures. If exactly 1, it must be `end-to-end: render under 500ms` in `tests/statusline.test.js` (the pre-existing, documented flake — see `specs/DEFERRED.md`, unrelated to this change). The total test count will be higher than prior plans in this series (`631`) since Tasks 1-2 added new tests — do not treat a higher total as a failure; only investigate if a failure appears anywhere outside the one documented flake.

- [ ] **Step 7: Commit**

```bash
git add skills/harness-health/SKILL.md
git commit -m "Wire design-artifact target kind into harness-health's JUDGE and APPLY-OR-FILE steps"
```

---

## Self-Review Notes

- **Spec coverage:** Design doc's 7 "Changes" items map onto this plan's 3 tasks — items 1-2 (`listDesignArtifacts`, `selectTarget`'s new fields, plus the Phase 2 companion fix caught during plan drafting) → Task 1; items 3-4 (`validate-finding.js`, `issue-payload.js`) → Task 2; items 5-7 (Step 3 JUDGE branch, Step 7 rule, `--kind` documentation) → Task 3. The design doc's Testing section's 5 bullet points map 1:1 onto this plan's test additions across `scope.test.js`, `validate-finding.test.js`, `issue-payload.test.js`, and `cli-next-target.test.js`.
- **Placeholder scan:** No TBD/TODO; every step shows exact before/after code or an exact command with expected output. Template placeholders inside the Step 3 finding-shape description (`{target.daysSinceLastAudit}`, `{regenerate command}`, etc.) are prose the SKILL.md procedure itself uses to describe runtime value substitution — matching the file's own existing notation style elsewhere (e.g. the pre-existing `${target}`/`${section}` in the Step 7 commit-message template) — not incomplete-plan placeholders.
- **Type consistency:** The field name `pathGlobs` (not `domainPaths`) is used identically across Task 1's `listDesignArtifacts` return shape, Task 1's `selectTarget` Phase 2 branch, and Task 3's SKILL.md Step 3 prose (`target.pathGlobs`) — verified spelled identically in every occurrence across all three tasks' exact text above. `daysSinceLastAudit`/`churnCount` are likewise spelled identically between Task 1 (produces) and Task 3 (consumes).
- **TDD verified, not assumed:** Task 1 Step 9's end-to-end CLI test is deliberately written to pass with zero changes to `bin/harness-health.js` — it's a regression guard confirming `next-target`'s existing generic `listTargets()`/`selectTarget()` consumption correctly picks up the new kind, not a test that requires new CLI code. This was traced against the actual current `cmdNextTarget` implementation (`bin/harness-health.js`) before being included in this plan, not assumed.
