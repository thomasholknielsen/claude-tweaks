# Policy Schema & Auto-Mode-Policy Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give claude-tweaks' 22 project-config levers a canonical schema doc, make `.claude-tweaks/policy.yml` their canonical home (CLAUDE.md as legacy-fallback only), stop `/init` writing default-valued lever lines into every generated CLAUDE.md, and offer existing projects a one-time migration.

**Architecture:** Two new files follow this repo's "prose twin" pattern (`work-record.md` ↔ `bin/lib/issues/record.js`): `skills/_shared/policy-schema.md` (canonical reference table) and `bin/lib/policy-schema.js` (the same 22 keys as data, plus a deterministic `auditPolicy(repoRoot)` function — no LLM judgment). `/init`'s CLAUDE.md generator template stops emitting the 8-lever "Auto-mode policy" block; `/init` Update Mode gains a migration offer for existing projects; `/harness-health` gains a small standalone step that files a low-severity issue only for genuinely malformed policy.yml content. Two skill files with a confirmed standalone CLAUDE.md-only read bug (`build/plan-audit.md`, `tidy/SKILL.md`) get a one-line precedence fix.

**Tech Stack:** Node.js (`node --test`), Markdown skill files, no new dependencies.

## Global Constraints

- No YAML dependency — `policy.yml` parsing stays flat `key: value` line matching, per `bin/lib/policy.js`'s existing convention (the plugin ships zero runtime npm deps).
- `bin/lib/policy.js` and `tests/policy.test.js` are untouched — `worktree.always` mechanics don't change.
- CLAUDE.md is never edited autonomously — the Update Mode migration in Task 5 is a staged, user-approved offer, never a silent write.
- Every skill-prose edit in this plan must remain consistent with the repo's documented conventions in the root `CLAUDE.md` (batch-table + `AskUserQuestion` for multi-item decisions, no emojis, no new mid-flow `auto`-mode stops).

---

### Task 1: Write the canonical policy schema doc

**Files:**
- Create: `skills/_shared/policy-schema.md`

**Interfaces:**
- Produces: the canonical list of 22 lever names or later tasks (and future readers) cite by name. Task 2's `bin/lib/policy-schema.js` data array must use exactly these 22 key strings.

- [ ] **Step 1: Write the schema doc**

Create `skills/_shared/policy-schema.md` with this exact content:

```markdown
# Policy Schema — Canonical Config Lever Index

Every project-config lever claude-tweaks skills read, in one place — the way `_shared/work-record.md`'s Config Keys table indexes the work-record system's keys. `bin/lib/policy-schema.js` owns the same 22 keys as data (name, type/enum, default) plus `auditPolicy(repoRoot)`, a deterministic validator. If this table and that file disagree, one of them has a bug — fix, don't fork.

`.claude-tweaks/policy.yml` is the canonical home for all 22 levers below. CLAUDE.md is a legacy fallback only, honored for projects that already wrote a value there before this schema existed — `/claude-tweaks:init` no longer generates new CLAUDE.md lever lines (see the "Auto-mode policy" block retirement in `claude-md-template.md`), and Update Mode offers a one-time migration for existing projects (`skills/init/update-mode.md`'s "Auto-Mode-Policy Migration" section). The one exception is `worktree.always`, which has never had a CLAUDE.md path at all — it's mechanically enforced by `bin/lib/hooks/pre-tool-use.js`, which only ever reads `policy.yml`.

## Worktree & execution

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `worktree.always` | `policy.yml` only — no CLAUDE.md path exists | `/claude-tweaks:init`, `/claude-tweaks:build`, `_shared/git-discipline.md`; mechanically enforced by `bin/lib/hooks/pre-tool-use.js` | `false` (unenforced) | Whether every `Edit`/`Write`/`NotebookEdit`/`git commit`/`git push` (and Bash `cp`/`mv`/`tee`) must occur inside a linked git worktree |
| `execution.always` | `policy.yml` | `/claude-tweaks:build`, `_shared/git-discipline.md` | unset (both `subagent`/`batched` selectable) | Locks `/claude-tweaks:build`'s execution-strategy axis to `subagent` only, when set |

## Project facts

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `project.maturity` | `policy.yml` (the machine flag; CLAUDE.md's Philosophy section holds a separate narrative description, not this flag) | `/claude-tweaks:init` Phase 3, `/claude-tweaks:build`, `/claude-tweaks:specify` | `greenfield` (absent or invalid value) | `greenfield`/`pre-launch`/`early-production`/`established` — scales `/build`'s test-discipline instruction and `/specify`'s decomposition strategy |

## Dispatch & merge

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `dispatch-retry-ceiling` | `policy.yml` (CLAUDE.md also honored — one grep checks both) | `/claude-tweaks:dispatch` | `3` | Consecutive autonomous build failures before `bot:blocked` + `auto:*` removal |
| `dispatch-pick-max-concurrent` | `policy.yml` | `/claude-tweaks:dispatch` | `3` | Max concurrent groups a bare `/dispatch` multi-pick runs |
| `automerge-max-lines` | `policy.yml` (CLAUDE.md also honored) | `/claude-tweaks:dispatch`, `/claude-tweaks:assess-agent-autonomy` | `40` | Auto-merge blast-radius guideline (lines) — a weighted input to `merge-check`, not a hard cutoff |
| `automerge-max-files` | `policy.yml` (CLAUDE.md also honored) | `/claude-tweaks:dispatch`, `/claude-tweaks:assess-agent-autonomy` | `2` | Auto-merge blast-radius guideline (files) — same weighted treatment |
| `merge-sensitive-paths` | `policy.yml` | `/claude-tweaks:assess-agent-autonomy`, `/claude-tweaks:review` | `[]` (empty) | Comma-separated path globs forcing a hard needs-human floor in `merge-check`, and feeding `/review`'s diff-heuristic risk proxy |
| `work-links` | `policy.yml` (CLAUDE.md also honored) | Work-record system (`/claude-tweaks:dispatch`, `/claude-tweaks:wrap-up`, etc.) | `body-text` | Native sub-issue/blocked-by APIs vs. `Blocked by #N` body-text lines |

## Review

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `review-effort-floor` | `policy.yml` | `/claude-tweaks:review` | unset (no floor) | Project-level floor that raises (never lowers) the resolved review-effort tier |
| `review-diff-heuristic-thresholds` | `policy.yml` | `/claude-tweaks:review` | `{high: {files: 10, lines: 300}, medium: {files: 3, lines: 50}}` | File/line thresholds for the diff-size review-effort heuristic. **Presence-only validated** — its value is a nested object, but `policy.yml` only supports flat `key: value` lines and no flat-line encoding for this shape has ever been specified; `auditPolicy()` checks the key name only, not the value |
| `review-severity-floor` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — no standalone direct-read site exists) | `/claude-tweaks:review` | `low` | `none`/`low`/`medium` auto-apply cutoff |

## Harness-health budgets

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `harness-health.scoped-rule-budget` | `policy.yml` | `/claude-tweaks:harness-health` | `30` | Line-count budget for path-scoped `.claude/rules/*.md` files |
| `harness-health.always-loaded-budget` | `policy.yml` | `/claude-tweaks:harness-health` | `150` | Line-count budget for CLAUDE.md and unscoped rule files |

## Auto-mode levers

These 8 were, until this spec, generated into every new CLAUDE.md's `## Auto-mode policy` block regardless of whether a project ever customized them — contradicting the very "omit means default" principle documented one section above that block. `/claude-tweaks:init` no longer generates that block; `policy.yml` is the canonical home going forward, with CLAUDE.md honored only for values already written there before this change.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `unattended-tier` | `policy.yml` (CLAUDE.md also honored — canonical home is `_shared/unattended-tier.md`) | `/claude-tweaks:flow`, `/claude-tweaks:wrap-up`, `/claude-tweaks:ledger` | `off` | Opt-in narrowing of the ledger resolve-gate, queue-write auto-filing, and ops-ack |
| `scope-creep` | `policy.yml` (CLAUDE.md legacy fallback; standalone direct-read fixed in `build/plan-audit.md`) | `/claude-tweaks:build` | `add-to-plan` | `add-to-plan`/`stop-and-ask`/`drop` |
| `overlap` | `policy.yml` (via `/flow` Manifesto only — no standalone direct-read site exists) | `/flow` Manifesto → `/claude-tweaks:specify` | `companion` | `companion`/`extend`/`skip`/`replace` |
| `design-intent` | `policy.yml` (via `/flow` Manifesto/`config.yml`; a standalone invocation with no pipeline run dir asks the user inline instead of reading CLAUDE.md) | `/claude-tweaks:specify` | `none` | `none`/`bold`/`quiet`/`minimal`/`delightful`/`onboarding` |
| `leftover-default` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — Step 4 is inherently pipeline-scoped, no standalone site exists) | `/claude-tweaks:wrap-up` | `defer` | `defer`/`backlog`/`drop` |
| `auto-fix-threshold` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — no standalone direct-read site exists) | `/claude-tweaks:test` | `lint+type` | `lint-only`/`lint+type`/`lint+type+test` |
| `tidy-aggressiveness` | `policy.yml` (CLAUDE.md legacy fallback; standalone direct-read fixed in `tidy/SKILL.md`) | `/claude-tweaks:tidy` | `conservative` | `conservative`/`moderate`/`aggressive` |
| `auto-mode` | `policy.yml` or CLAUDE.md — commented-out optional template line, unaffected by this spec | `/claude-tweaks:flow`, `/claude-tweaks:tidy`, `/claude-tweaks:build` standalone | unset (`/flow` still defaults to `auto`) | `default-on`/`default-off` — whether standalone `/build` and unattended `/tidy` firings default to auto mode |
```

- [ ] **Step 2: Verify all 22 keys are present**

```bash
grep -oE '`[a-z][a-zA-Z0-9_.-]*`' skills/_shared/policy-schema.md | sort -u | wc -l
```

Expected: at least 22 (the count includes a few duplicate-format backtick spans like `add-to-plan` inside value lists, so treat this as a floor, not an exact match — cross-check by eye that all 22 key names from the Global Constraints list above appear as the first backticked term in some table row).

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/policy-schema.md
git commit -m "Add canonical policy schema doc indexing all 22 project-config levers"
```

---

### Task 2: Implement the audit function with tests

**Files:**
- Create: `bin/lib/policy-schema.js`
- Test: `tests/policy-schema.test.js`

**Interfaces:**
- Consumes: nothing from other tasks (reads `policy.yml`/CLAUDE.md directly).
- Produces: `auditPolicy(repoRoot)` returning `{ unrecognizedKeys: string[], invalidValues: {key, value, expected}[], legacyClaudeMdLevers: {key, value, matchesDefault}[] }`, and `POLICY_KEYS` (the 22-entry schema array), both required by Tasks 5 and 6.

- [ ] **Step 1: Write the failing tests**

Create `tests/policy-schema.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { POLICY_KEYS, auditPolicy } = require('../bin/lib/policy-schema');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-policy-schema-'));
}
function writePolicy(repo, content) {
  const dir = path.join(repo, '.claude-tweaks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'policy.yml'), content);
}
function writeClaudeMd(repo, content) {
  fs.writeFileSync(path.join(repo, 'CLAUDE.md'), content);
}

test('POLICY_KEYS has exactly 22 entries with unique keys', () => {
  assert.strictEqual(POLICY_KEYS.length, 22);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 22);
});

test('missing policy.yml and missing CLAUDE.md -> all-empty result', () => {
  const result = auditPolicy(tmpRepo());
  assert.deepStrictEqual(result, { unrecognizedKeys: [], invalidValues: [], legacyClaudeMdLevers: [] });
});

test('recognized key with a valid value -> no invalidValues entry', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'dispatch-retry-ceiling: 5\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.invalidValues, []);
});

test('recognized enum key with an invalid value -> flagged', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'tidy-aggressiveness: extreme\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.invalidValues.length, 1);
  assert.strictEqual(result.invalidValues[0].key, 'tidy-aggressiveness');
  assert.strictEqual(result.invalidValues[0].value, 'extreme');
});

test('recognized integer key with a non-integer value -> flagged', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'automerge-max-lines: forty\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.invalidValues.length, 1);
  assert.strictEqual(result.invalidValues[0].key, 'automerge-max-lines');
});

test('recognized boolean key with a non-boolean value -> flagged', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: yes\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.invalidValues.length, 1);
  assert.strictEqual(result.invalidValues[0].key, 'worktree.always');
});

test('review-diff-heuristic-thresholds is presence-only validated, never flagged', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'review-diff-heuristic-thresholds: anything at all, not even valid YAML\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.invalidValues, []);
});

test('unrecognized key -> flagged, does not also appear in invalidValues', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'made-up-lever: 42\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.unrecognizedKeys, ['made-up-lever']);
  assert.deepStrictEqual(result.invalidValues, []);
});

test('malformed policy.yml (unparseable) is treated as absent, not thrown', () => {
  const repo = tmpRepo();
  const dir = path.join(repo, '.claude-tweaks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'policy.yml'), Buffer.from([0xff, 0xfe, 0x00, 0x01]));
  assert.doesNotThrow(() => auditPolicy(repo));
});

const LEGACY_LEVERS = [
  ['unattended-tier', 'off', 'on'],
  ['scope-creep', 'add-to-plan', 'stop-and-ask'],
  ['overlap', 'companion', 'extend'],
  ['design-intent', 'none', 'bold'],
  ['leftover-default', 'defer', 'backlog'],
  ['auto-fix-threshold', 'lint+type', 'lint-only'],
  ['review-severity-floor', 'low', 'medium'],
  ['tidy-aggressiveness', 'conservative', 'aggressive'],
];

for (const [key, defaultValue, overrideValue] of LEGACY_LEVERS) {
  test(`legacy CLAUDE.md lever "${key}" at its default -> matchesDefault true`, () => {
    const repo = tmpRepo();
    writeClaudeMd(repo, `## Auto-mode policy\n${key}: ${defaultValue}\n`);
    const result = auditPolicy(repo);
    const entry = result.legacyClaudeMdLevers.find((e) => e.key === key);
    assert.ok(entry, `expected a legacyClaudeMdLevers entry for ${key}`);
    assert.strictEqual(entry.value, defaultValue);
    assert.strictEqual(entry.matchesDefault, true);
  });

  test(`legacy CLAUDE.md lever "${key}" overridden -> matchesDefault false`, () => {
    const repo = tmpRepo();
    writeClaudeMd(repo, `## Auto-mode policy\n${key}: ${overrideValue}\n`);
    const result = auditPolicy(repo);
    const entry = result.legacyClaudeMdLevers.find((e) => e.key === key);
    assert.ok(entry, `expected a legacyClaudeMdLevers entry for ${key}`);
    assert.strictEqual(entry.value, overrideValue);
    assert.strictEqual(entry.matchesDefault, false);
  });
}

test('a lever absent from CLAUDE.md produces no legacyClaudeMdLevers entry for it', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, '## Auto-mode policy\nscope-creep: add-to-plan\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.legacyClaudeMdLevers.some((e) => e.key === 'tidy-aggressiveness'), false);
});

test('mixed policy.yml + CLAUDE.md content is read independently, both audited together', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'dispatch-retry-ceiling: 5\nmade-up-lever: 1\n');
  writeClaudeMd(repo, '## Auto-mode policy\nscope-creep: drop\ntidy-aggressiveness: conservative\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.unrecognizedKeys, ['made-up-lever']);
  assert.strictEqual(result.legacyClaudeMdLevers.length, 2);
  const scopeCreep = result.legacyClaudeMdLevers.find((e) => e.key === 'scope-creep');
  assert.strictEqual(scopeCreep.matchesDefault, false);
  const tidyAgg = result.legacyClaudeMdLevers.find((e) => e.key === 'tidy-aggressiveness');
  assert.strictEqual(tidyAgg.matchesDefault, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test tests/policy-schema.test.js
```

Expected: FAIL — `Cannot find module '../bin/lib/policy-schema'`.

- [ ] **Step 3: Implement `bin/lib/policy-schema.js`**

```javascript
// bin/lib/policy-schema.js — canonical data + deterministic validator for every
// project-config lever documented in skills/_shared/policy-schema.md. If the two
// disagree, one of them has a bug — fix, don't fork.
'use strict';
const fs = require('fs');
const path = require('path');

const POLICY_KEYS = [
  { key: 'worktree.always', type: 'boolean', default: false },
  { key: 'execution.always', type: 'enum', values: ['subagent', 'batched'] },
  { key: 'project.maturity', type: 'enum', values: ['greenfield', 'pre-launch', 'early-production', 'established'], default: 'greenfield' },
  { key: 'dispatch-retry-ceiling', type: 'integer', default: 3 },
  { key: 'dispatch-pick-max-concurrent', type: 'integer', default: 3 },
  { key: 'automerge-max-lines', type: 'integer', default: 40 },
  { key: 'automerge-max-files', type: 'integer', default: 2 },
  { key: 'merge-sensitive-paths', type: 'list', default: [] },
  { key: 'work-links', type: 'enum', values: ['native', 'body-text'], default: 'body-text' },
  { key: 'review-effort-floor', type: 'enum', values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] },
  { key: 'review-diff-heuristic-thresholds', type: 'opaque' },
  { key: 'harness-health.scoped-rule-budget', type: 'integer', default: 30 },
  { key: 'harness-health.always-loaded-budget', type: 'integer', default: 150 },
  { key: 'unattended-tier', type: 'enum', values: ['off', 'on'], default: 'off' },
  { key: 'scope-creep', type: 'enum', values: ['add-to-plan', 'stop-and-ask', 'drop'], default: 'add-to-plan' },
  { key: 'overlap', type: 'enum', values: ['companion', 'extend', 'skip', 'replace'], default: 'companion' },
  { key: 'design-intent', type: 'enum', values: ['none', 'bold', 'quiet', 'minimal', 'delightful', 'onboarding'], default: 'none' },
  { key: 'leftover-default', type: 'enum', values: ['defer', 'backlog', 'drop'], default: 'defer' },
  { key: 'auto-fix-threshold', type: 'enum', values: ['lint-only', 'lint+type', 'lint+type+test'], default: 'lint+type' },
  { key: 'review-severity-floor', type: 'enum', values: ['none', 'low', 'medium'], default: 'low' },
  { key: 'tidy-aggressiveness', type: 'enum', values: ['conservative', 'moderate', 'aggressive'], default: 'conservative' },
  { key: 'auto-mode', type: 'enum', values: ['default-on', 'default-off'] },
];

// The 8 levers previously generated into CLAUDE.md's "## Auto-mode policy" block.
const LEGACY_CLAUDE_MD_LEVER_KEYS = [
  'unattended-tier',
  'scope-creep',
  'overlap',
  'design-intent',
  'leftover-default',
  'auto-fix-threshold',
  'review-severity-floor',
  'tidy-aggressiveness',
];

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

// Flat `key: value` line matcher, tolerant of a trailing `# comment` and of
// living inside a fenced code block — matches bin/lib/policy.js's convention.
function parseFlatLines(raw) {
  const result = {};
  if (!raw) return result;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z0-9_.-]+):\s*([^#]*)/);
    if (!match) continue;
    const value = match[2].trim();
    if (value) result[match[1]] = value;
  }
  return result;
}

function isValidValue(schemaEntry, value) {
  switch (schemaEntry.type) {
    case 'boolean':
      return value === 'true' || value === 'false';
    case 'integer':
      return /^-?\d+$/.test(value);
    case 'enum':
      return schemaEntry.values.includes(value);
    case 'list':
    case 'opaque':
      return true;
    default:
      return true;
  }
}

function auditPolicy(repoRoot) {
  const policyRaw = readFileSafe(path.join(repoRoot, '.claude-tweaks', 'policy.yml'));
  const claudeMdRaw = readFileSafe(path.join(repoRoot, 'CLAUDE.md'));
  const policyEntries = parseFlatLines(policyRaw);
  const claudeMdEntries = parseFlatLines(claudeMdRaw);
  const schemaByKey = new Map(POLICY_KEYS.map((entry) => [entry.key, entry]));

  const unrecognizedKeys = Object.keys(policyEntries).filter((key) => !schemaByKey.has(key));

  const invalidValues = [];
  for (const [key, value] of Object.entries(policyEntries)) {
    const schemaEntry = schemaByKey.get(key);
    if (schemaEntry && !isValidValue(schemaEntry, value)) {
      invalidValues.push({ key, value, expected: schemaEntry });
    }
  }

  const legacyClaudeMdLevers = LEGACY_CLAUDE_MD_LEVER_KEYS
    .filter((key) => claudeMdEntries[key] !== undefined)
    .map((key) => ({
      key,
      value: claudeMdEntries[key],
      matchesDefault: claudeMdEntries[key] === String(schemaByKey.get(key).default),
    }));

  return { unrecognizedKeys, invalidValues, legacyClaudeMdLevers };
}

module.exports = { POLICY_KEYS, auditPolicy };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test tests/policy-schema.test.js
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npm test 2>&1 | tail -15
```

Expected: same pass count as baseline plus the new file's tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/policy-schema.js tests/policy-schema.test.js
git commit -m "Add auditPolicy() — deterministic validator for the 22-lever policy schema"
```

---

### Task 3: Stop generating the Auto-mode policy block into new CLAUDE.md files

**Files:**
- Modify: `skills/init/claude-md-template.md:117-135`

**Interfaces:**
- Consumes: nothing (pure deletion).
- Produces: the generated `## Project Defaults` block no longer contains lever lines Task 5's migration logic needs to detect only in *existing* CLAUDE.md files, not new ones.

- [ ] **Step 1: Read the current block to confirm exact text before editing**

```bash
sed -n '117,135p' skills/init/claude-md-template.md
```

Confirm it matches:

```
## Auto-mode
# /flow defaults to auto on its own — no flag needed. Uncomment to set a
# project-wide default: default-on also makes standalone /build run in auto;
# default-off lowers /flow to interactive (per-skill prompts).
# auto-mode: default-on            # default-on | default-off

## Auto-mode policy (pre-fills Pipeline Config Manifesto — v4.6+)
# Each lever has a sensible default. Override only what the project actually
# wants different. The Manifesto reads these as recommendations; the user can
# still override per-run.
scope-creep: add-to-plan           # add-to-plan | stop-and-ask | drop
overlap: companion                 # companion | extend | skip | replace
design-intent: none                # none | bold | quiet | minimal | delightful | onboarding
leftover-default: defer            # defer | backlog | drop
auto-fix-threshold: lint+type      # lint-only | lint+type | lint+type+test
review-severity-floor: low         # none | low | medium  (auto-apply cutoff)
tidy-aggressiveness: conservative  # conservative | moderate | aggressive
unattended-tier: off               # off | on
```

- [ ] **Step 2: Delete the "Auto-mode policy" sub-block only**

Remove everything from the `## Auto-mode policy` header line through the `unattended-tier: off` line (inclusive), keeping the `## Auto-mode` block above it (the commented-out `# auto-mode: default-on` line) untouched. After the edit, the block should read:

```
## Auto-mode
# /flow defaults to auto on its own — no flag needed. Uncomment to set a
# project-wide default: default-on also makes standalone /build run in auto;
# default-off lowers /flow to interactive (per-skill prompts).
# auto-mode: default-on            # default-on | default-off
```

with the fenced code block's closing content (`## Don'ts` section marker further down) unaffected.

- [ ] **Step 3: Verify the deletion**

```bash
grep -n "Auto-mode policy\|scope-creep:\|overlap:\|design-intent:\|leftover-default:\|auto-fix-threshold:\|review-severity-floor:\|tidy-aggressiveness:\|unattended-tier:" skills/init/claude-md-template.md
```

Expected: no output (all 8 lever lines and the section header are gone). Then:

```bash
grep -n "auto-mode: default-on" skills/init/claude-md-template.md
```

Expected: one match, still commented out with `#`.

- [ ] **Step 4: Commit**

```bash
git add skills/init/claude-md-template.md
git commit -m "Stop generating default-valued Auto-mode policy block into new CLAUDE.md files"
```

---

### Task 4: Fix the two standalone CLAUDE.md-only read sites

**Files:**
- Modify: `skills/build/plan-audit.md:30`
- Modify: `skills/tidy/SKILL.md:173`

**Interfaces:**
- Consumes: `skills/_shared/policy-schema.md` (Task 1) as the doc justifying the precedence change.
- Produces: nothing consumed by later tasks — this is a leaf fix.

- [ ] **Step 1: Read the current text of both sites**

```bash
sed -n '30p' skills/build/plan-audit.md
sed -n '173p' skills/tidy/SKILL.md
```

Confirm they read:

```
skills/build/plan-audit.md:30:
Resolve `scope-creep` via the standard precedence in `_shared/auto-mode-contract.md`: `config.yml` in the active run dir when one resolves with a Manifesto-computed policy (spawned by `/flow`, or record-mode's own standalone run dir per `_shared/pipeline-run-dir.md`'s materialization exception), else the project's `scope-creep:` setting under CLAUDE.md's `## Auto-mode policy`, else the skill default `add-to-plan`. Log the decision to whatever run dir resolves, per `_shared/pipeline-run-dir.md`'s resolution order — an explicit `auto` CLI arg always applies this branch, never the Interactive-mode prompt below, regardless of whether a Manifesto-computed `config.yml` exists. Apply:
```

```
skills/tidy/SKILL.md:173:
**Standalone auto:** When `/tidy` runs standalone in `auto` mode (no parent pipeline run dir), follow the Standalone auto fallback in `_shared/pipeline-run-dir.md` — create `.claude-tweaks/pipelines/{ISO-timestamp}-tidy-standalone/` with `decisions.md` and `staged/`. The audit log stays on. Apply `tidy-aggressiveness` from CLAUDE.md as the routing key. Present staged items in a Pending Review section at the end of the report (this is the bookend-end for the standalone run; no separate Review Console).
```

- [ ] **Step 2: Fix `build/plan-audit.md:30`**

Replace:
```
else the project's `scope-creep:` setting under CLAUDE.md's `## Auto-mode policy`, else the skill default `add-to-plan`
```
with:
```
else the project's `scope-creep:` setting in `.claude-tweaks/policy.yml` (see `_shared/policy-schema.md`), else the same setting under CLAUDE.md's `## Auto-mode policy` (legacy fallback for projects that set it there before the policy-schema consolidation), else the skill default `add-to-plan`
```

- [ ] **Step 3: Fix `tidy/SKILL.md:173`**

Replace:
```
Apply `tidy-aggressiveness` from CLAUDE.md as the routing key.
```
with:
```
Apply `tidy-aggressiveness` from `.claude-tweaks/policy.yml` (see `_shared/policy-schema.md`) as the routing key, falling back to CLAUDE.md's `## Auto-mode policy` block only if `policy.yml` has no such line (legacy fallback for projects that set it there before the policy-schema consolidation).
```

- [ ] **Step 4: Verify both edits**

```bash
grep -n "scope-creep" skills/build/plan-audit.md
grep -n "tidy-aggressiveness" skills/tidy/SKILL.md
```

Expected: both show `policy.yml` mentioned ahead of the CLAUDE.md fallback language in the matched lines.

- [ ] **Step 5: Commit**

```bash
git add skills/build/plan-audit.md skills/tidy/SKILL.md
git commit -m "Fix standalone scope-creep/tidy-aggressiveness reads to check policy.yml before CLAUDE.md"
```

---

### Task 5: Add the `/init` Update Mode migration offer

**Files:**
- Modify: `skills/init/update-mode.md:53` (retire the now-inverted Contract Drift marker row)
- Modify: `skills/init/update-mode.md` (insert new "Auto-Mode-Policy Migration" subsection after "### Maturity Drift", i.e. after line 108 in the pre-edit file)

**Interfaces:**
- Consumes: `auditPolicy()` from `bin/lib/policy-schema.js` (Task 2) via its `legacyClaudeMdLevers` field.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Read the current marker table row to confirm exact text**

```bash
sed -n '48,54p' skills/init/update-mode.md
```

Confirm row 53 reads:
```
| `## Auto-mode policy` block (lever count matches `claude-md-template.md`'s block — see there, not restated here) | `^## Auto-mode policy` in CLAUDE.md | v4.6+ | `claude-md-template.md` Auto-mode policy block |
```

- [ ] **Step 2: Remove the now-inverted marker row**

Delete that entire table row. The block's absence is no longer drift to detect and patch back in — `claude-md-template.md` (Task 3) no longer generates it, and its *presence* is now handled by the new migration subsection (Step 3 below), not this marker table (which only ever offers to *add* a missing marker, never remove an obsolete one).

- [ ] **Step 3: Insert the new "Auto-Mode-Policy Migration" subsection**

Insert immediately after the "### Maturity Drift" section (after its closing table and before `## Phase 1u.6: Update Mode Early-Exit Gate`):

```markdown
### Auto-Mode-Policy Migration

Existing projects initialized before the policy-schema consolidation may have
CLAUDE.md's retired `## Auto-mode policy` block still present (8 lever lines —
see `_shared/policy-schema.md`'s "Auto-mode levers" section for the full list).
`claude-tweaks:init` no longer generates this block for new projects; this
check offers existing projects a one-time cleanup.

Run:

```bash
node -e "const {auditPolicy}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/policy-schema.js'); console.log(JSON.stringify(auditPolicy(process.cwd())))"
```

If `legacyClaudeMdLevers` is empty, record "Auto-mode policy: already migrated or never present" in the inventory and skip the rest of this section — no prompt.

Otherwise, for each entry, the recommendation is:
- `matchesDefault: true` → **delete** the line from CLAUDE.md. Pure cleanup — dual-read already falls through to the same default either way, so this is a zero-behavior-change removal.
- `matchesDefault: false` → **move to `policy.yml`**: append `{key}: {value}` to `.claude-tweaks/policy.yml` (creating the file/directory if absent), then delete the line from CLAUDE.md. Preserves the project's override.

Present via the standard batch-table convention (`AskUserQuestion`, per the root CLAUDE.md's Multi-item Decisions rule):

- `question`: `"{N} legacy Auto-mode policy line(s) found in CLAUDE.md. Clean these up? Levers at their default get deleted; overrides move to .claude-tweaks/policy.yml."`, `header`: `"Policy cleanup"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Delete {D} default-valued line(s), move {M} override(s) to policy.yml."` (`D`/`M` are the counts of `matchesDefault: true`/`false` entries)
- Option 2 — `label`: `"Override specific items"`, `description`: `"Choose per-line what happens to each of the {N} entries."`
- Option 3 — `label`: `"Skip entirely"`, `description`: `"Leave CLAUDE.md as-is — I'll clean it up myself later."`

On "Override specific items," follow up with the per-line choices as ordinary free-text in the next message (per the root CLAUDE.md's batch-table convention — the tool's `Other` field is a single answer to the batch question, not a per-item list).

On any outcome except "Skip entirely," apply the selected deletions/moves, then log to `decisions.md` (or the inventory summary, if this project has no active pipeline run dir):
```
AUTO {time} — Update Mode: migrated {N} legacy Auto-mode policy line(s) off CLAUDE.md ({D} deleted at-default, {M} moved to policy.yml).
```

This check runs once per Update Mode invocation and counts toward the Total drift count in Phase 1u.6 the same way Work-Record Backend Drift does — a non-empty `legacyClaudeMdLevers` result is one additional Contract Drift entry.
```

- [ ] **Step 4: Verify the edits**

```bash
grep -n "Auto-Mode-Policy Migration" skills/init/update-mode.md
grep -c "Auto-mode policy.*block (lever count matches" skills/init/update-mode.md
```

Expected: the first command finds the new heading; the second returns `0` (the old marker row is gone).

- [ ] **Step 5: Commit**

```bash
git add skills/init/update-mode.md
git commit -m "Add Update Mode migration offer for legacy CLAUDE.md Auto-mode policy lines"
```

---

### Task 6: Add the `/harness-health` standalone policy audit

**Files:**
- Modify: `skills/harness-health/SKILL.md` (insert new paragraph after the existing "Skill-library shape pass" paragraph, i.e. after line 69 in the pre-edit file)

**Interfaces:**
- Consumes: `auditPolicy()` from `bin/lib/policy-schema.js` (Task 2), via its `unrecognizedKeys`/`invalidValues` fields.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Read the current "Skill-library shape pass" paragraph to confirm insertion point**

```bash
sed -n '69,71p' skills/harness-health/SKILL.md
```

Confirm it reads:
```
**Skill-library shape pass (separate from the target/gap-scan due-ness above).** Read `library-shape-analysis.md` in this skill's directory for a periodic pass comparing skills *against each other* (too-shallow / overlapping / bloated) on its own 90-day cursor — check its own due-ness (per that file's "Due-ness and SELECT" section) independently of whatever `next-target` returned above, and run it in addition to the standard target/gap-scan work this firing when due.

**Step 2 — READ the target.**
```

- [ ] **Step 2: Insert the new policy-schema check paragraph**

Insert between those two lines:

```markdown
**Policy schema check (separate from the target/gap-scan work above, runs every firing).** Call:

```bash
node -e "const {auditPolicy}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/policy-schema.js'); console.log(JSON.stringify(auditPolicy(process.cwd())))"
```

This is a deterministic validation check, not the 8-dimension judged analysis `_shared/harness-health-analysis.md` performs — a malformed key or value is a mechanical fact, not a semantic judgment, so it doesn't produce a `patch`/`new-skill` finding through that shared file. If both `unrecognizedKeys` and `invalidValues` are empty, do nothing further for this check this firing. Otherwise, file one work-record issue (origin `by:harness-health`, `risk:low` + `effort:low` — this is always a same-shape mechanical fix) titled `"policy.yml has {N} unrecognized key(s) / invalid value(s)"`, with a body listing each `unrecognizedKeys` entry (possible typo or a stale key removed from the schema — see `_shared/policy-schema.md`) and each `invalidValues` entry (`key`, the actual `value`, and the expected type/enum from `expected`). Dedup against open `by:harness-health` issues the same way Step 5/6 do for the main target (reuse the same `gh issue list` fetch this firing already performs — no separate fetch). Never file for `legacyClaudeMdLevers` alone — that's `/claude-tweaks:init` Update Mode's interactive migration to offer (see `skills/init/update-mode.md`'s "Auto-Mode-Policy Migration"), not something to push through an unattended Routine's issue queue.

**Step 2 — READ the target.**
```

- [ ] **Step 3: Verify the edit**

```bash
grep -n "Policy schema check" skills/harness-health/SKILL.md
```

Expected: one match.

- [ ] **Step 4: Run the full suite to confirm no regressions**

```bash
npm test 2>&1 | tail -15
```

Expected: same pass count as Task 2's Step 5, 0 failures (this task only edits markdown).

- [ ] **Step 5: Commit**

```bash
git add skills/harness-health/SKILL.md
git commit -m "Add harness-health standalone policy-schema validation check"
```
