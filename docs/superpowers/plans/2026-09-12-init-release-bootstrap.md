# Init Release Bootstrap, Detection, and the Two Policy Keys — Implementation Plan (#2253)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/claude-tweaks:init` gains a bootstrap step that detects existing release automation (`fresh` / `already-bootstrapped` / `conflict`), writes the release-please engine's config files on a fresh repo (workflow only under `pr-first`), seeds the two new non-core policy keys `release-hook` and `release-train`, and refuses on a conflicting tool.

**Architecture:** One code twin owns every testable decision — `plugin/bin/lib/init/release-bootstrap.js` (detection, the stack table, semver-aware manifest seeding, the three renderers, and `bootstrapRelease`) — fronted by a JSON-envelope CLI `plugin/bin/release-bootstrap.js` that the new prose step `plugin/skills/init/bootstrap/step-21-release.md` invokes. The prose step owns the human flow (gate on Step 20's `integration-model`, the branch ladder, the deferred policy-row write through `init/worktree-policy-finalization.md`, the init-summary lines). The schema keys land in `policy-schema.js` + `policy-schema.md` with metadata-test coverage. A conformance test pins the prose to the code (stack table, step registration, token, citation).

**Tech Stack:** Node 18+ (zero runtime deps), `node --test` with temp dirs and real `git init` fixtures for tags, markdown skill prose under `plugin/skills/`.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T204239-spec-2251-2252-2253-2254-2255-2256-2258/spec-2253/work/2253-spec.md` (materialized copy of #2253). Design doc (deleted at decomposition; read from history): `git show f92db978c:docs/superpowers/specs/2026-09-11-release-skill-design.md` — Phase 3 section and the Policy keys table.

## Global Constraints

- **Vocabulary mapping the spec leaves implicit:** the schema has no `core:` field; tier is `tier: 'core' | 'advanced'`. Spec AC 4's "`core: false`" means `tier: 'advanced'`. Both keys are `category: 'housekeeping'` (the `## Additional levers` section's category per `policy-schema.md`'s Metadata-fields mapping table).
- **Summary rules pinned by `tests/policy-schema-metadata.test.js`:** each `summary` ≤ 140 chars, non-empty, must NOT contain its own key text verbatim, and must NOT appear verbatim anywhere in `policy-schema.md` — so the markdown rows use different wording from the JS summaries.
- **Key-naming test:** `tests/policy-key-naming.test.js` requires a `| \`release-hook\` |` and `| \`release-train\` |` row in `policy-schema.md`.
- **Byte budgets (per-file ceiling 40,960; warn-only since #1990, stay under anyway):** `plugin/skills/init/SKILL.md` is 39,316 bytes → the Step 21 stub plus the token addition must add ≤ 900 bytes; `plugin/skills/_shared/policy-schema.md` is 39,494 bytes → the two rows must add ≤ 900 bytes. Measure with `wc -c` after each edit.
- **`tests/integration-model.test.js` consumer conformance:** any `plugin/skills/**/*.md` file whose text matches `/integration-model/` must contain the literal string `_shared/integration-model.md`. `step-21-release.md` and the SKILL.md stub both route on the value, so both carry the citation.
- **Init step conventions:** Optional Enhancement steps (9 onward) are append-only (`bootstrap-steps.md`); Step 21 appends after Step 20 with no renumbering. Every step file opens with the italic line `*Optional Enhancement step — see \`SKILL.md\`'s \`## Input\` for when this group is offered or filtered, and \`../bootstrap-steps.md\` for its ordering and renumbering conventions.*`. Each new step gets an Enhancement filter token (`release`) in three places: SKILL.md's `## Input` token list, `input-grammar.md`'s token table, and the step's own file.
- **Bootstrap shape (the only shape this unit writes or recognizes as its own):** `release-please-config.json` = `{ "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json", "packages": { ".": { "release-type": "<type>", "bump-minor-pre-major": false, "include-component-in-tag": false[, "extra-files": [...]] } } }`; `.release-please-manifest.json` = `{ ".": "<version>" }`. A `release-please-config.json` whose parsed JSON lacks `packages["."]["release-type"]` (string) is a **foreign** config → `conflict`.
- **Conflict markers (root-level names):** `.releaserc` / `.releaserc.*` and `release.config.*` → `semantic-release`; `.changeset/` directory → `changesets`; `.goreleaser.*` → `goreleaser`; foreign `release-please-config.json` → `release-please (foreign config)`. `v*` tags are never conflict evidence.
- **Stack table (canonical in `step-21-release.md`, code twin `RELEASE_STACK_TABLE`, pinned by the conformance test):** exactly one matching row → its `release-type`; zero or two-plus matching rows → `simple`. Rows in order: `node` (`package.json`), `python` (`pyproject.toml` or `setup.py`), `rust` (`Cargo.toml`), `go` (`go.mod`), `java` (`pom.xml`, `build.gradle`, `build.gradle.kts`), `ruby` (`Gemfile` or `*.gemspec`), `php` (`composer.json`), `dotnet` (`*.csproj` or `*.sln`). Under `simple`, `extra-files` names the first version-bearing JSON manifest found among `.claude-plugin/plugin.json`, `plugin/.claude-plugin/plugin.json`, then root `*.json` files carrying a top-level string `version` — as `{ "type": "json", "path": "<path>", "jsonpath": "$.version" }`; none found → no `extra-files` key.
- **Manifest seeding:** newest `v*` tag by semver precedence (`compareVersions` from `plugin/bin/lib/changelog.js`, applied after stripping the `v`; non-semver tags ignored), else the detected stack manifest's version, else `0.1.0`.
- **Workflow file:** `googleapis/release-please-action@v4`, `on.push.branches: [<integration branch>]`, `permissions: contents: write, pull-requests: write`, `config-file`/`manifest-file` naming the two files. Written under `pr-first` only.
- **Policy rows:** written as commented-out lines — `# release-hook: <command run after the local engine's tag lands — local-merge only>` and `# release-train: false` — appended to `.claude-tweaks/policy.yml` via `init/worktree-policy-finalization.md`'s isolated-worktree write, never a direct edit; the lib only *renders* them (`renderPolicyRows`) and the CLI reports them; the prose step performs the write.
- Commit message style: `{Verb} {what} — {detail}` with `refs #2253` (never `closes`/`fixes`). Every commit ends with the trailer `Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH`.
- Working directory: every command runs from the worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-release-skill`. Never `cd` to the main checkout. Verify with `pwd` and `git rev-parse --show-toplevel` before the first commit.
- Scope: touch only what a task names. A pre-existing bug noticed in passing is reported in the task's reply, not fixed. Commit tests only where the task asks for them, sized like the neighboring test files.

---

### Task 1: The code twin — detection, stack table, seeding, renderers

**Files:**
- Create: `plugin/bin/lib/init/release-bootstrap.js`
- Test: `tests/bin-lib/init/release-bootstrap.test.js`

**Interfaces:**
- Consumes: `compareVersions(a, b)` from `plugin/bin/lib/changelog.js` (strict `X.Y.Z` strings, returns -1/0/1, throws on non-semver).
- Produces (all exported):
  - `RELEASE_STACK_TABLE` — array of `{ releaseType, markers }` in the Global Constraints order; `markers` are root-level file/dir names, `*.ext` meaning "any root entry ending in `.ext`".
  - `CONFLICT_MARKERS` — array of `{ tool, test: (name, isDir) => boolean }`.
  - `isBootstrapShaped(parsed) → boolean`.
  - `detectReleaseProcess(root) → { verdict: 'fresh' | 'already-bootstrapped' | 'conflict', tool?: string, evidence?: string }`.
  - `resolveReleaseType(root) → { releaseType: string, extraFiles: Array<{type:'json', path:string, jsonpath:'$.version'}> }`.
  - `readStackManifestVersion(root, releaseType) → string | null` (`node`/`php`: the JSON `version`; `python`/`rust`: first `version = "X.Y.Z"` in the TOML; others `null`).
  - `seedManifestVersion({ tags, manifestVersion }) → string`.
  - `renderWorkflowYaml({ branch }) → string`, `renderConfig({ releaseType, extraFiles }) → string` (2-space JSON + trailing newline), `renderManifest(version) → string`, `renderPolicyRows() → string[]` (two lines).

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/init/release-bootstrap.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const rb = require('../../../plugin/bin/lib/init/release-bootstrap');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'release-bootstrap-')); }
function write(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
const SHAPED = JSON.stringify({ packages: { '.': { 'release-type': 'node' } } });

test('detectReleaseProcess: nothing at all -> fresh', () => {
  assert.deepEqual(rb.detectReleaseProcess(tmp()), { verdict: 'fresh' });
});

test('detectReleaseProcess: semantic-release, changesets, goreleaser markers -> conflict naming the tool and evidence', () => {
  const a = tmp(); write(a, '.releaserc.json', '{}');
  assert.deepEqual(rb.detectReleaseProcess(a), { verdict: 'conflict', tool: 'semantic-release', evidence: '.releaserc.json' });
  const b = tmp(); write(b, 'release.config.js', 'module.exports = {}');
  assert.equal(rb.detectReleaseProcess(b).tool, 'semantic-release');
  const c = tmp(); fs.mkdirSync(path.join(c, '.changeset'));
  assert.deepEqual(rb.detectReleaseProcess(c), { verdict: 'conflict', tool: 'changesets', evidence: '.changeset/' });
  const d = tmp(); write(d, '.goreleaser.yaml', 'builds: []');
  assert.equal(rb.detectReleaseProcess(d).tool, 'goreleaser');
});

test('detectReleaseProcess: a foreign release-please config -> conflict; the bootstrap shape -> already-bootstrapped', () => {
  const a = tmp(); write(a, 'release-please-config.json', JSON.stringify({ 'release-type': 'node' }));
  assert.deepEqual(rb.detectReleaseProcess(a), { verdict: 'conflict', tool: 'release-please (foreign config)', evidence: 'release-please-config.json' });
  const b = tmp(); write(b, 'release-please-config.json', SHAPED); write(b, '.release-please-manifest.json', '{".":"1.2.3"}');
  assert.deepEqual(rb.detectReleaseProcess(b), { verdict: 'already-bootstrapped' });
  const c = tmp(); write(c, 'release-please-config.json', 'not json');
  assert.equal(rb.detectReleaseProcess(c).verdict, 'conflict');
});

test('detectReleaseProcess: v* tags are never conflict evidence (root scan only, no tag input)', () => {
  const a = tmp(); write(a, 'package.json', '{"version":"1.0.0"}');
  assert.deepEqual(rb.detectReleaseProcess(a), { verdict: 'fresh' });
});

test('resolveReleaseType: exactly one stack row -> its type; zero or two rows -> simple', () => {
  const node = tmp(); write(node, 'package.json', '{"name":"x","version":"1.0.0"}');
  assert.deepEqual(rb.resolveReleaseType(node), { releaseType: 'node', extraFiles: [] });
  const rust = tmp(); write(rust, 'Cargo.toml', '[package]\nname = "x"\nversion = "0.3.0"\n');
  assert.equal(rb.resolveReleaseType(rust).releaseType, 'rust');
  const dotnet = tmp(); write(dotnet, 'App.csproj', '<Project />');
  assert.equal(rb.resolveReleaseType(dotnet).releaseType, 'dotnet');
  const two = tmp(); write(two, 'package.json', '{}'); write(two, 'go.mod', 'module x');
  assert.equal(rb.resolveReleaseType(two).releaseType, 'simple');
  assert.equal(rb.resolveReleaseType(tmp()).releaseType, 'simple');
});

test('resolveReleaseType: simple names the first version-bearing JSON manifest as an extra-file', () => {
  const a = tmp(); write(a, 'plugin/.claude-plugin/plugin.json', '{"name":"p","version":"6.1.0"}');
  assert.deepEqual(rb.resolveReleaseType(a), { releaseType: 'simple', extraFiles: [{ type: 'json', path: 'plugin/.claude-plugin/plugin.json', jsonpath: '$.version' }] });
  const b = tmp(); write(b, 'thing.json', '{"version":"2.0.0"}'); write(b, 'other.json', '{"noversion":true}');
  assert.deepEqual(rb.resolveReleaseType(b).extraFiles, [{ type: 'json', path: 'thing.json', jsonpath: '$.version' }]);
});

test('readStackManifestVersion: node/php read JSON version, python/rust read the TOML version line, others null', () => {
  const node = tmp(); write(node, 'package.json', '{"version":"1.4.2"}');
  assert.equal(rb.readStackManifestVersion(node, 'node'), '1.4.2');
  const py = tmp(); write(py, 'pyproject.toml', '[project]\nname = "x"\nversion = "0.9.1"\n');
  assert.equal(rb.readStackManifestVersion(py, 'python'), '0.9.1');
  const rust = tmp(); write(rust, 'Cargo.toml', '[package]\nversion = "0.3.0"\n');
  assert.equal(rb.readStackManifestVersion(rust, 'rust'), '0.3.0');
  assert.equal(rb.readStackManifestVersion(tmp(), 'go'), null);
  const bad = tmp(); write(bad, 'package.json', '{"version":"not-semver"}');
  assert.equal(rb.readStackManifestVersion(bad, 'node'), null);
});

test('seedManifestVersion: newest v* tag by semver precedence, never lexicographic (AC 8)', () => {
  assert.equal(rb.seedManifestVersion({ tags: ['v1.9.0', 'v1.10.0'], manifestVersion: '0.0.1' }), '1.10.0');
  assert.equal(rb.seedManifestVersion({ tags: ['v1.10.0', 'v1.9.0', 'v0.2.0'], manifestVersion: null }), '1.10.0');
  assert.equal(rb.seedManifestVersion({ tags: ['release-2024', 'v1.2'], manifestVersion: '3.0.0' }), '3.0.0'); // non-semver tags ignored
  assert.equal(rb.seedManifestVersion({ tags: [], manifestVersion: '2.5.0' }), '2.5.0');
  assert.equal(rb.seedManifestVersion({ tags: [], manifestVersion: null }), '0.1.0');
});

test('renderers: workflow, config, manifest, policy rows', () => {
  const wf = rb.renderWorkflowYaml({ branch: 'develop' });
  assert.match(wf, /uses: googleapis\/release-please-action@v4/);
  assert.match(wf, /branches:\n\s+- develop/);
  assert.match(wf, /contents: write/);
  assert.match(wf, /pull-requests: write/);
  assert.match(wf, /config-file: release-please-config\.json/);
  assert.match(wf, /manifest-file: \.release-please-manifest\.json/);
  const cfg = JSON.parse(rb.renderConfig({ releaseType: 'node', extraFiles: [] }));
  assert.equal(cfg.packages['.']['release-type'], 'node');
  assert.equal(cfg.packages['.']['bump-minor-pre-major'], false);
  assert.equal(cfg.packages['.']['include-component-in-tag'], false);
  assert.equal('extra-files' in cfg.packages['.'], false);
  assert.ok(rb.isBootstrapShaped(cfg));
  const simple = JSON.parse(rb.renderConfig({ releaseType: 'simple', extraFiles: [{ type: 'json', path: 'p.json', jsonpath: '$.version' }] }));
  assert.deepEqual(simple.packages['.']['extra-files'], [{ type: 'json', path: 'p.json', jsonpath: '$.version' }]);
  assert.deepEqual(JSON.parse(rb.renderManifest('1.10.0')), { '.': '1.10.0' });
  assert.ok(rb.renderConfig({ releaseType: 'node', extraFiles: [] }).endsWith('\n'));
  const rows = rb.renderPolicyRows();
  assert.equal(rows.length, 2);
  assert.match(rows[0], /^# release-hook: /);
  assert.equal(rows[1], '# release-train: false');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/init/release-bootstrap.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/lib/init/release-bootstrap'`.

- [ ] **Step 3: Write the module**

Create `plugin/bin/lib/init/release-bootstrap.js`:

```js
// bin/lib/init/release-bootstrap.js — the code twin of /claude-tweaks:init's
// Step 21 (bootstrap/step-21-release.md, #2253): release-process detection,
// the stack → release-type table, semver-aware manifest seeding, and the
// renderers for the three release-please files plus the two commented
// policy rows. bin/release-bootstrap.js is the CLI the prose step calls;
// this module is what the tests pin. Pure functions over a root path —
// the only I/O is reading the root directory and the files it names.
//
// Detection is deliberately a self-contained presence check, not
// _shared/existing-convention-detection.md's genre-grammar procedure: that
// file's ≥3-file floor and grammar parse answer "which naming convention do
// many files agree on", while this step asks "does exactly one of these
// markers exist". Only the plugin/project/conflict vocabulary is shared,
// and even that is narrowed to fresh / already-bootstrapped / conflict.
// `v*` tags are never conflict evidence — a repo that tags releases by
// hand is the common onboarding case, not a competing engine.
'use strict';

const fs = require('fs');
const path = require('path');
const { compareVersions } = require('../changelog');

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const V_TAG_RE = /^v(\d+\.\d+\.\d+)$/;

// Canonical prose copy: bootstrap/step-21-release.md's stack table (pinned
// by tests/init-release-bootstrap-conformance.test.js). Exactly one
// matching row selects its release-type; zero or two-plus fall through to
// `simple` — a multi-stack repo is out of #2253's scope by design.
const RELEASE_STACK_TABLE = [
  { releaseType: 'node', markers: ['package.json'] },
  { releaseType: 'python', markers: ['pyproject.toml', 'setup.py'] },
  { releaseType: 'rust', markers: ['Cargo.toml'] },
  { releaseType: 'go', markers: ['go.mod'] },
  { releaseType: 'java', markers: ['pom.xml', 'build.gradle', 'build.gradle.kts'] },
  { releaseType: 'ruby', markers: ['Gemfile', '*.gemspec'] },
  { releaseType: 'php', markers: ['composer.json'] },
  { releaseType: 'dotnet', markers: ['*.csproj', '*.sln'] },
];

const CONFLICT_MARKERS = [
  { tool: 'semantic-release', test: (name, isDir) => !isDir && /^\.releaserc(\..+)?$/.test(name) },
  { tool: 'semantic-release', test: (name, isDir) => !isDir && /^release\.config\..+$/.test(name) },
  { tool: 'changesets', test: (name, isDir) => isDir && name === '.changeset' },
  { tool: 'goreleaser', test: (name, isDir) => !isDir && /^\.goreleaser\..+$/.test(name) },
];

const CONFIG_FILE = 'release-please-config.json';
const MANIFEST_FILE = '.release-please-manifest.json';
const WORKFLOW_FILE = '.github/workflows/release-please.yml';
const CONFIG_SCHEMA = 'https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json';

function rootEntries(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true }).map((e) => ({ name: e.name, isDir: e.isDirectory() }));
  } catch {
    return [];
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined; // missing or unparseable — callers decide what that means
  }
}

function isBootstrapShaped(parsed) {
  return Boolean(parsed && typeof parsed === 'object' && parsed.packages && typeof parsed.packages === 'object'
    && parsed.packages['.'] && typeof parsed.packages['.'] === 'object'
    && typeof parsed.packages['.']['release-type'] === 'string');
}

function detectReleaseProcess(root) {
  const entries = rootEntries(root);
  for (const { name, isDir } of entries) {
    for (const marker of CONFLICT_MARKERS) {
      if (marker.test(name, isDir)) return { verdict: 'conflict', tool: marker.tool, evidence: isDir ? `${name}/` : name };
    }
  }
  if (entries.some((e) => !e.isDir && e.name === CONFIG_FILE)) {
    const parsed = readJson(path.join(root, CONFIG_FILE));
    if (!isBootstrapShaped(parsed)) return { verdict: 'conflict', tool: 'release-please (foreign config)', evidence: CONFIG_FILE };
    return { verdict: 'already-bootstrapped' };
  }
  return { verdict: 'fresh' };
}

function markerMatches(marker, entries) {
  if (marker.startsWith('*.')) {
    const suffix = marker.slice(1);
    return entries.some((e) => !e.isDir && e.name.endsWith(suffix));
  }
  return entries.some((e) => e.name === marker);
}

function versionOfJson(file) {
  const parsed = readJson(file);
  const v = parsed && typeof parsed === 'object' ? parsed.version : undefined;
  return typeof v === 'string' && SEMVER_RE.test(v) ? v : null;
}

function findSimpleExtraFile(root, entries) {
  const candidates = ['.claude-plugin/plugin.json', 'plugin/.claude-plugin/plugin.json',
    ...entries.filter((e) => !e.isDir && e.name.endsWith('.json')).map((e) => e.name).sort()];
  for (const rel of candidates) {
    if (versionOfJson(path.join(root, rel)) !== null) return [{ type: 'json', path: rel, jsonpath: '$.version' }];
  }
  return [];
}

function resolveReleaseType(root) {
  const entries = rootEntries(root);
  const matched = RELEASE_STACK_TABLE.filter((row) => row.markers.some((m) => markerMatches(m, entries)));
  if (matched.length === 1) return { releaseType: matched[0].releaseType, extraFiles: [] };
  return { releaseType: 'simple', extraFiles: findSimpleExtraFile(root, entries) };
}

function versionOfToml(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const m = /^\s*version\s*=\s*"(\d+\.\d+\.\d+)"/m.exec(text);
  return m ? m[1] : null;
}

function readStackManifestVersion(root, releaseType) {
  switch (releaseType) {
    case 'node': return versionOfJson(path.join(root, 'package.json'));
    case 'php': return versionOfJson(path.join(root, 'composer.json'));
    case 'python': return versionOfToml(path.join(root, 'pyproject.toml'));
    case 'rust': return versionOfToml(path.join(root, 'Cargo.toml'));
    default: return null;
  }
}

// Newest v* tag wins by semver precedence (compareVersions, never a string
// sort — `v1.9.0` must lose to `v1.10.0`); non-semver tags are ignored.
function seedManifestVersion({ tags, manifestVersion } = {}) {
  const versions = (Array.isArray(tags) ? tags : [])
    .map((t) => { const m = V_TAG_RE.exec(String(t).trim()); return m ? m[1] : null; })
    .filter(Boolean);
  if (versions.length > 0) return versions.reduce((best, v) => (compareVersions(v, best) > 0 ? v : best));
  if (typeof manifestVersion === 'string' && SEMVER_RE.test(manifestVersion)) return manifestVersion;
  return '0.1.0';
}

function renderWorkflowYaml({ branch } = {}) {
  const b = branch || 'main';
  return [
    'name: release-please',
    '',
    'on:',
    '  push:',
    '    branches:',
    `      - ${b}`,
    '',
    'permissions:',
    '  contents: write',
    '  pull-requests: write',
    '',
    'jobs:',
    '  release-please:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: googleapis/release-please-action@v4',
    '        with:',
    '          config-file: release-please-config.json',
    '          manifest-file: .release-please-manifest.json',
    '',
  ].join('\n');
}

function renderConfig({ releaseType, extraFiles } = {}) {
  const pkg = { 'release-type': releaseType, 'bump-minor-pre-major': false, 'include-component-in-tag': false };
  if (Array.isArray(extraFiles) && extraFiles.length > 0) pkg['extra-files'] = extraFiles;
  return `${JSON.stringify({ $schema: CONFIG_SCHEMA, packages: { '.': pkg } }, null, 2)}\n`;
}

function renderManifest(version) {
  return `${JSON.stringify({ '.': version }, null, 2)}\n`;
}

function renderPolicyRows() {
  return [
    '# release-hook: <command run after the local engine tags a release — local-merge only; under pr-first the release: published workflow is the hook>',
    '# release-train: false',
  ];
}

module.exports = {
  RELEASE_STACK_TABLE, CONFLICT_MARKERS, CONFIG_FILE, MANIFEST_FILE, WORKFLOW_FILE,
  isBootstrapShaped, detectReleaseProcess, resolveReleaseType, readStackManifestVersion, seedManifestVersion,
  renderWorkflowYaml, renderConfig, renderManifest, renderPolicyRows,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/init/release-bootstrap.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/init/release-bootstrap.js tests/bin-lib/init/release-bootstrap.test.js
git commit -m "Add the release-bootstrap code twin — detection verdicts, stack table, semver manifest seeding, and the release-please renderers, refs #2253

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 2: `bootstrapRelease` and the CLI `plugin/bin/release-bootstrap.js`

**Files:**
- Modify: `plugin/bin/lib/init/release-bootstrap.js` (append `bootstrapRelease` + export)
- Create: `plugin/bin/release-bootstrap.js`
- Test: `tests/bin-lib/init/release-bootstrap.test.js` (append), `tests/bin-lib/init/release-bootstrap-cli.test.js` (new)

**Interfaces:**
- Consumes: every Task 1 export.
- Produces: `bootstrapRelease({ root, integrationModel, branch, dryRun = false, listTags }) → { verdict, tool?, evidence?, reason?, releaseType?, version?, written: string[], policyRows: string[] }`:
  - `integrationModel` not `'pr-first'` or `'local-merge'` → `{ verdict: 'skipped', reason: 'integration-model unresolved', written: [], policyRows: [] }` — checked first, before any detection.
  - detection `conflict` → `{ verdict: 'conflict', tool, evidence, written: [], policyRows: [] }`; `already-bootstrapped` → `{ verdict: 'already-bootstrapped', written: [], policyRows: [] }` (writes nothing either way).
  - `fresh` → resolve type/extra-files, seed version from `listTags(root)` (default: `git -C root tag -l 'v*'` split on newlines; a git failure → `[]`) and `readStackManifestVersion`, write `release-please-config.json` + `.release-please-manifest.json`, plus `.github/workflows/release-please.yml` when `integrationModel === 'pr-first'` (mkdir -p), skipping every write under `dryRun`; return `{ verdict: 'fresh', releaseType, version, written: [relative paths in that order], policyRows: renderPolicyRows() }`.
- CLI `node plugin/bin/release-bootstrap.js --integration-model <pr-first|local-merge|unresolved> [--root <dir>] [--branch <name>] [--dry-run] [--help]` — prints the `bootstrapRelease` result as one JSON line; exit 0 on any verdict (including `conflict`/`skipped` — they are outcomes, not errors), 2 on usage (missing `--integration-model`, unknown flag), 1 on an unexpected throw (message on stderr).

- [ ] **Step 1: Append the failing tests**

Append to `tests/bin-lib/init/release-bootstrap.test.js`:

```js
const { execFileSync } = require('child_process');
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function gitRepo(root) {
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  write(root, 'README.md', 'x\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'init');
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('bootstrapRelease: fresh Node repo, pr-first -> three files, release-type node, manifest 0.1.0 (AC 1)', () => {
  const root = tmp(); write(root, 'package.json', '{"name":"x"}');
  const r = rb.bootstrapRelease({ root, integrationModel: 'pr-first', branch: 'main', listTags: () => [] });
  assert.equal(r.verdict, 'fresh');
  assert.equal(r.releaseType, 'node');
  assert.equal(r.version, '0.1.0');
  assert.deepEqual(r.written, ['release-please-config.json', '.release-please-manifest.json', '.github/workflows/release-please.yml']);
  assert.equal(JSON.parse(read(root, 'release-please-config.json')).packages['.']['release-type'], 'node');
  assert.deepEqual(JSON.parse(read(root, '.release-please-manifest.json')), { '.': '0.1.0' });
  assert.match(read(root, '.github/workflows/release-please.yml'), /release-please-action@v4/);
  assert.deepEqual(r.policyRows, rb.renderPolicyRows());
});

test('bootstrapRelease: same fixture, local-merge -> config + manifest only, no workflow (AC 2)', () => {
  const root = tmp(); write(root, 'package.json', '{"name":"x"}');
  const r = rb.bootstrapRelease({ root, integrationModel: 'local-merge', listTags: () => [] });
  assert.deepEqual(r.written, ['release-please-config.json', '.release-please-manifest.json']);
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/release-please.yml')), false);
  assert.equal(r.releaseType, 'node');
  assert.equal(r.version, '0.1.0');
});

test('bootstrapRelease: .changeset/ -> conflict, nothing written; manual v* tags alone stay fresh (AC 3)', () => {
  const a = tmp(); fs.mkdirSync(path.join(a, '.changeset')); write(a, 'package.json', '{}');
  const r = rb.bootstrapRelease({ root: a, integrationModel: 'pr-first', listTags: () => [] });
  assert.equal(r.verdict, 'conflict');
  assert.equal(r.tool, 'changesets');
  assert.deepEqual(r.written, []);
  assert.equal(fs.existsSync(path.join(a, 'release-please-config.json')), false);
  const b = tmp(); gitRepo(b); write(b, 'package.json', '{"name":"x","version":"1.0.0"}');
  git(b, 'tag', 'v1.0.0');
  const r2 = rb.bootstrapRelease({ root: b, integrationModel: 'pr-first' }); // default listTags reads the real repo
  assert.equal(r2.verdict, 'fresh');
  assert.equal(r2.version, '1.0.0');
});

test('bootstrapRelease: conflict cleared on a later run proceeds to write (AC 6)', () => {
  const root = tmp(); write(root, 'package.json', '{}'); write(root, '.releaserc', '{}');
  assert.equal(rb.bootstrapRelease({ root, integrationModel: 'pr-first', listTags: () => [] }).verdict, 'conflict');
  fs.unlinkSync(path.join(root, '.releaserc'));
  const r = rb.bootstrapRelease({ root, integrationModel: 'pr-first', listTags: () => [] });
  assert.equal(r.verdict, 'fresh');
  assert.equal(r.written.length, 3);
});

test('bootstrapRelease: re-running on an already-bootstrapped repo writes nothing and does not clobber (AC 7)', () => {
  const root = tmp(); write(root, 'package.json', '{}');
  rb.bootstrapRelease({ root, integrationModel: 'pr-first', listTags: () => ['v2.0.0'] });
  const before = read(root, '.release-please-manifest.json');
  const r = rb.bootstrapRelease({ root, integrationModel: 'pr-first', listTags: () => ['v9.9.9'] });
  assert.equal(r.verdict, 'already-bootstrapped');
  assert.deepEqual(r.written, []);
  assert.equal(read(root, '.release-please-manifest.json'), before);
});

test('bootstrapRelease: manifest seeded from the semver-newest tag on a real repo (AC 8)', () => {
  const root = tmp(); gitRepo(root); write(root, 'package.json', '{"name":"x","version":"0.0.1"}');
  git(root, 'tag', 'v1.9.0');
  git(root, 'tag', 'v1.10.0');
  const r = rb.bootstrapRelease({ root, integrationModel: 'local-merge' });
  assert.equal(r.version, '1.10.0');
  assert.deepEqual(JSON.parse(read(root, '.release-please-manifest.json')), { '.': '1.10.0' });
});

test('bootstrapRelease: unresolved integration-model -> skipped before any detection; dry-run writes nothing', () => {
  const a = tmp(); fs.mkdirSync(path.join(a, '.changeset'));
  assert.deepEqual(rb.bootstrapRelease({ root: a, integrationModel: null }), { verdict: 'skipped', reason: 'integration-model unresolved', written: [], policyRows: [] });
  const b = tmp(); write(b, 'package.json', '{}');
  const r = rb.bootstrapRelease({ root: b, integrationModel: 'pr-first', dryRun: true, listTags: () => [] });
  assert.equal(r.verdict, 'fresh');
  assert.deepEqual(r.written, ['release-please-config.json', '.release-please-manifest.json', '.github/workflows/release-please.yml']);
  assert.equal(fs.existsSync(path.join(b, 'release-please-config.json')), false);
});
```

Create `tests/bin-lib/init/release-bootstrap-cli.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'release-bootstrap.js');
function run(args) { return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }); }

test('CLI: fresh local-merge root prints the JSON envelope and exits 0', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-cli-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x"}');
  const r = run(['--root', root, '--integration-model', 'local-merge', '--branch', 'main']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.verdict, 'fresh');
  assert.equal(out.releaseType, 'node');
  assert.deepEqual(out.written, ['release-please-config.json', '.release-please-manifest.json']);
  assert.equal(out.policyRows.length, 2);
});

test('CLI: conflict is an outcome (exit 0, verdict in JSON), missing --integration-model is usage (exit 2)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-cli-'));
  fs.mkdirSync(path.join(root, '.changeset'));
  const r = run(['--root', root, '--integration-model', 'pr-first']);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).verdict, 'conflict');
  const u = run(['--root', root]);
  assert.equal(u.status, 2);
  assert.match(u.stderr, /--integration-model/);
  const unk = run(['--root', root, '--integration-model', 'pr-first', '--bogus']);
  assert.equal(unk.status, 2);
});

test('CLI: --dry-run reports the plan without writing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-cli-'));
  fs.writeFileSync(path.join(root, 'go.mod'), 'module x\n');
  const r = run(['--root', root, '--integration-model', 'pr-first', '--dry-run']);
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.releaseType, 'go');
  assert.equal(out.written.length, 3);
  assert.equal(fs.existsSync(path.join(root, 'release-please-config.json')), false);
});
```

- [ ] **Step 2: Run both files to verify the new tests fail**

Run: `node --test tests/bin-lib/init/release-bootstrap.test.js tests/bin-lib/init/release-bootstrap-cli.test.js`
Expected: FAIL — `rb.bootstrapRelease is not a function` for the appended tests; the CLI file fails with a spawn of a missing script (non-zero status / `Cannot find module`). Task 1's nine tests still pass.

- [ ] **Step 3: Implement**

Append to `plugin/bin/lib/init/release-bootstrap.js` before `module.exports` (and add `execFileSync` to the requires: `const { execFileSync } = require('child_process');`):

```js
function defaultListTags(root) {
  try {
    return execFileSync('git', ['-C', root, 'tag', '-l', 'v*'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return []; // not a git repo, or git absent — seeding falls through to the manifest/0.1.0
  }
}

// The step's whole decision, in one call: verdict first, then the writes.
// Never touches .claude-tweaks/policy.yml — the two rows are returned for
// the prose step to land through init/worktree-policy-finalization.md's
// isolated-worktree write (a direct edit would be denied under
// worktree-always, the same reason Step 6 defers its own row).
function bootstrapRelease({ root, integrationModel, branch, dryRun = false, listTags } = {}) {
  const empty = { written: [], policyRows: [] };
  if (integrationModel !== 'pr-first' && integrationModel !== 'local-merge') {
    return { verdict: 'skipped', reason: 'integration-model unresolved', ...empty };
  }
  const detected = detectReleaseProcess(root);
  if (detected.verdict !== 'fresh') return { ...detected, ...empty };
  const { releaseType, extraFiles } = resolveReleaseType(root);
  const tags = (listTags || defaultListTags)(root);
  const version = seedManifestVersion({ tags, manifestVersion: readStackManifestVersion(root, releaseType) });
  const files = [
    [CONFIG_FILE, renderConfig({ releaseType, extraFiles })],
    [MANIFEST_FILE, renderManifest(version)],
  ];
  if (integrationModel === 'pr-first') files.push([WORKFLOW_FILE, renderWorkflowYaml({ branch })]);
  const written = [];
  for (const [rel, content] of files) {
    if (!dryRun) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    written.push(rel);
  }
  return { verdict: 'fresh', releaseType, version, written, policyRows: renderPolicyRows() };
}
```

Add `bootstrapRelease` (and `defaultListTags`) to `module.exports`.

Create `plugin/bin/release-bootstrap.js`:

```js
#!/usr/bin/env node
// bin/release-bootstrap.js — CLI for /claude-tweaks:init Step 21
// (bootstrap/step-21-release.md, #2253). Thin argv shell over
// bin/lib/init/release-bootstrap.js's bootstrapRelease: one JSON line on
// stdout, exit 0 on every verdict (conflict and skipped are outcomes the
// step reports, not failures), 2 on usage, 1 on an unexpected throw.
//
//   node bin/release-bootstrap.js --integration-model <pr-first|local-merge|unresolved> [--root <dir>] [--branch <name>] [--dry-run]
'use strict';

const { bootstrapRelease } = require('./lib/init/release-bootstrap');

const USAGE = 'usage: release-bootstrap.js --integration-model <pr-first|local-merge|unresolved> [--root <dir>] [--branch <name>] [--dry-run]\n';

function parseArgs(argv) {
  const opts = { root: process.cwd(), branch: 'main', dryRun: false, integrationModel: undefined, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--root') opts.root = argv[++i];
    else if (a === '--branch') opts.branch = argv[++i];
    else if (a === '--integration-model') opts.integrationModel = argv[++i];
    else return { error: `unknown argument: ${a}` };
  }
  if (!opts.help && opts.integrationModel === undefined) return { error: 'missing required --integration-model' };
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) { process.stderr.write(`${opts.error}\n${USAGE}`); return 2; }
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  try {
    const result = bootstrapRelease({ root: opts.root, integrationModel: opts.integrationModel, branch: opts.branch, dryRun: opts.dryRun });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`release-bootstrap: ${e && e.message ? e.message : String(e)}\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, parseArgs };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/init/release-bootstrap.test.js tests/bin-lib/init/release-bootstrap-cli.test.js`
Expected: PASS — 16 tests in the lib file, 3 in the CLI file.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/init/release-bootstrap.js plugin/bin/release-bootstrap.js tests/bin-lib/init/release-bootstrap.test.js tests/bin-lib/init/release-bootstrap-cli.test.js
git commit -m "Add bootstrapRelease and the release-bootstrap CLI — verdict-first writes for the release-please files, JSON envelope for the init step, refs #2253

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 3: The two policy keys — schema entries, prose rows, metadata test

**Files:**
- Modify: `plugin/bin/lib/policy-schema.js` (append two rows to `POLICY_KEYS`, after the `port-services` row — find it with `grep -n "key: 'port-services'"`)
- Modify: `plugin/skills/_shared/policy-schema.md` (`## Additional levers` table — append two rows after the `port-services` row)
- Test: `tests/policy-schema-metadata.test.js` (append one test), `tests/policy-schema.test.js:106-115` (the registered-key count pin moves 66 → 68 — Step 3b)

**Interfaces:**
- Produces: `POLICY_KEYS` rows `release-hook` (`type: 'string'`, no `default`, `category: 'housekeeping'`, `tier: 'advanced'`) and `release-train` (`type: 'boolean'`, `default: false`, `category: 'housekeeping'`, `tier: 'advanced'`).

- [ ] **Step 1: Append the failing test**

Append to `tests/policy-schema-metadata.test.js`:

```js
// #2253 (unit 3 of #2250): release-hook / release-train are schema
// scaffolding — consumed by the local engine (unit 4) and /claude-tweaks:release
// (unit 6). Both non-core by design; AC 4's check is RELATIVE to the schema's
// existing core set, never a hardcoded absolute count.
test('release-hook and release-train are registered as non-core scaffolding keys with the spec shape', () => {
  const byKey = new Map(POLICY_KEYS.map((row) => [row.key, row]));
  const hook = byKey.get('release-hook');
  const train = byKey.get('release-train');
  assert.ok(hook, 'release-hook missing from POLICY_KEYS');
  assert.ok(train, 'release-train missing from POLICY_KEYS');
  assert.strictEqual(hook.type, 'string');
  assert.strictEqual(hook.default, undefined);
  assert.strictEqual(train.type, 'boolean');
  assert.strictEqual(train.default, false);
  for (const row of [hook, train]) {
    assert.strictEqual(row.tier, 'advanced', `${row.key} must be non-core`);
    assert.strictEqual(row.category, 'housekeeping');
    assert.ok(row.summary.trim().length > 0, `${row.key}: summary empty`);
  }
  const core = POLICY_KEYS.filter((row) => row.tier === 'core').map((row) => row.key);
  const coreWithoutRelease = core.filter((key) => key !== 'release-hook' && key !== 'release-train');
  assert.deepStrictEqual(core, coreWithoutRelease, 'this unit adds no core-tier key');
});
```

- [ ] **Step 2: Run the file to verify the new test fails**

Run: `node --test tests/policy-schema-metadata.test.js`
Expected: FAIL — `release-hook missing from POLICY_KEYS`. Every pre-existing test passes.

- [ ] **Step 3: Add the schema rows and the prose rows**

In `plugin/bin/lib/policy-schema.js`, directly after the `port-services` row inside `POLICY_KEYS`, add:

```js
  // release-hook / release-train (#2253, unit 3 of #2250): schema scaffolding
  // only — /claude-tweaks:init Step 21 seeds both as commented-out rows;
  // bin/release-local.js (unit 4) reads release-hook, /claude-tweaks:release
  // --train (unit 6) reads release-train. Neither is a Manifesto lever, so
  // _shared/auto-mode-contract.md's five-site checklist does not apply.
  // Non-core by design: promoting either would widen what the Manifesto
  // surfaces by default (tests/policy-schema-metadata.test.js pins it).
  { key: 'release-hook', type: 'string', summary: "Names the command the local release engine runs once its tag lands — publish, mirror, or deploy; ignored under pr-first.", category: 'housekeeping', tier: 'advanced' },
  { key: 'release-train', type: 'boolean', default: false, summary: "Lets the unattended release train cut minor and patch releases on its own; honored only when autonomy resolves unattended.", category: 'housekeeping', tier: 'advanced' },
```

In `plugin/skills/_shared/policy-schema.md`, directly after the `| \`port-services\` |` row of the `## Additional levers` table, add:

```markdown
| `release-hook` | `policy.yml` (seeded commented-out by `/claude-tweaks:init` Step 21) | `bin/release-local.js` (unit 4 of #2250) | unset | Shell command the local engine runs after `v{version}` is tagged — the project's publish/mirror/deploy hook. Not read under `pr-first`, where the `release: published` workflow is the hook. Not a Manifesto lever |
| `release-train` | `policy.yml` (seeded commented-out by `/claude-tweaks:init` Step 21) | `/claude-tweaks:release --train` (unit 6 of #2250) | `false` | `true` allows the unattended train to cut minor/patch releases without a click; honored only when `autonomy` resolves `unattended`, otherwise the run logs a refusal and behaves on-demand. Not a Manifesto lever |
```

- [ ] **Step 3b: Move the registered-key count pin (return-shape widening — `tests/policy-schema.test.js:114`)**

`tests/policy-schema.test.js` pins `POLICY_KEYS.length` and the distinct-key count at `66`, with a running comment trail above the assertion naming each key ever added. Two keys are added here, so both literals become `68`. Directly above the `assert.strictEqual(POLICY_KEYS.length, 66);` line, after the `// 65 -> 66, #1910 …` comment block, add:

```js
  // 66 -> 68, #2253 (release family, unit 3): release-hook — the local
  // engine's post-tag publish/mirror/deploy command, ignored under
  // pr-first; release-train — opt-in for the unattended release train,
  // honored only at autonomy: unattended. Both non-core scaffolding seeded
  // commented-out by /claude-tweaks:init Step 21; consumers land in units 4 and 6.
```

and change both `66` literals on the two assertion lines to `68`.

- [ ] **Step 4: Verify**

Run: `node --test tests/policy-schema-metadata.test.js tests/policy-key-naming.test.js tests/policy-schema.test.js tests/resolve-policy-cli.test.js`
Expected: PASS (`resolve-policy-cli.test.js:231` compares the CLI's full-dump key set against `POLICY_KEYS` dynamically, so it needs no edit). Then `wc -c plugin/skills/_shared/policy-schema.md` — Expected: under 40,960 (baseline 39,494 + the two rows).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/policy-schema.js plugin/skills/_shared/policy-schema.md tests/policy-schema-metadata.test.js tests/policy-schema.test.js
git commit -m "Register release-hook and release-train as non-core policy keys — schema rows, prose rows, metadata pin, refs #2253

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 4: The prose step, its registration, the token, the detection destination, the CLAUDE.md template section — with a conformance test

**Files:**
- Create: `plugin/skills/init/bootstrap/step-21-release.md`
- Modify: `plugin/skills/init/SKILL.md` (Step 21 stub after the Step 20 stub; `release` token in the `## Input` token list), `plugin/skills/init/input-grammar.md` (token row), `plugin/skills/init/bootstrap-steps.md` (index row), `plugin/skills/init/detection-tables.md` (line 102), `plugin/skills/init/claude-md-template.md` (`## Releasing` section in the Initial Mode Template)
- Test: `tests/init-release-bootstrap-conformance.test.js` (new)

**Interfaces:**
- Consumes: the CLI from Task 2 (`node "${CLAUDE_PLUGIN_ROOT}/bin/release-bootstrap.js" …`), `RELEASE_STACK_TABLE` from Task 1 (the conformance test pins the prose table to it), `renderPolicyRows` (the step quotes the two lines).
- Produces: prose only.

- [ ] **Step 1: Write the failing conformance test**

Create `tests/init-release-bootstrap-conformance.test.js`:

```js
'use strict';
// Pins #2253's /init Step 21 — a prose test per skill-prose-conformance-tests:
// each assertion pins a literal substring or ordering that would go red if
// the corresponding content were reverted, plus the prose stack table's
// agreement with its code twin.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { RELEASE_STACK_TABLE } = require('../plugin/bin/lib/init/release-bootstrap');

function read(relPath) { return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8'); }

const SKILL = read('plugin/skills/init/SKILL.md');
const STEP = read('plugin/skills/init/bootstrap/step-21-release.md');
const GRAMMAR = read('plugin/skills/init/input-grammar.md');
const INDEX = read('plugin/skills/init/bootstrap-steps.md');
const DETECT = read('plugin/skills/init/detection-tables.md');
const TEMPLATE = read('plugin/skills/init/claude-md-template.md');

test('init/SKILL.md has a Step 21 stub after Step 20 and before the finalization section, citing its sub-file and the integration-model fragment', () => {
  const step20 = SKILL.indexOf('### Step 20: Integration Model');
  const step21 = SKILL.indexOf('### Step 21: Release Bootstrap');
  const fin = SKILL.indexOf('### Finalizing the worktree-always Decision');
  assert.ok(step20 !== -1 && step21 !== -1 && fin !== -1, 'all three headings must exist');
  assert.ok(step20 < step21 && step21 < fin, 'Step 21 must sit between Step 20 and the finalization section');
  const body = SKILL.slice(step21, fin);
  assert.ok(body.includes('bootstrap/step-21-release.md'), 'the stub must cite its sub-file');
  assert.ok(body.includes('_shared/integration-model.md'), 'the stub routes on integration-model and must cite the fragment');
  assert.ok(body.split('\n').filter((l) => l.trim() && !l.startsWith('---')).length <= 4, 'the stub must stay <= 4 lines');
});

test('the release Enhancement filter token is registered in SKILL.md and input-grammar.md, and the index lists step 21', () => {
  assert.match(SKILL, /Enhancement filter tokens\*\* — one per Optional Enhancement step:[^\n]*`release`/);
  assert.match(GRAMMAR, /^\| `release` \| Step 21 — /m);
  assert.match(INDEX, /^\| 21 \| `step-21-release\.md` \|/m);
});

test('step-21-release.md carries the gate, the three verdicts, the CLI, the deferred policy write, and the citations', () => {
  assert.ok(STEP.startsWith('# Step 21 — '));
  assert.ok(STEP.includes('*Optional Enhancement step — see `SKILL.md`'), 'standard step preamble');
  for (const word of ['`fresh`', '`already-bootstrapped`', '`conflict`']) assert.ok(STEP.includes(word), `verdict ${word}`);
  assert.ok(STEP.includes('release: skipped — integration-model unresolved'));
  assert.ok(STEP.includes('release: conflict — {tool}'));
  assert.ok(STEP.includes('bin/release-bootstrap.js'));
  assert.ok(STEP.includes('_shared/integration-model.md'));
  assert.ok(STEP.includes('_shared/integration-branch.md'));
  assert.ok(STEP.includes('worktree-policy-finalization.md'));
  assert.ok(STEP.includes('# release-hook:') && STEP.includes('# release-train: false'));
  assert.ok(STEP.includes('`v*` tags are not conflict evidence') || STEP.includes('never conflict evidence'));
});

test('the prose stack table matches RELEASE_STACK_TABLE row for row, in order', () => {
  const start = STEP.indexOf('## Stack table');
  assert.notEqual(start, -1, 'step-21-release.md has no "## Stack table" section');
  const section = STEP.slice(start, STEP.indexOf('\n## ', start + 1) === -1 ? STEP.length : STEP.indexOf('\n## ', start + 1));
  const rows = [...section.matchAll(/^\| `([a-z]+)` \| ([^|]+) \|/gm)].map((m) => ({ releaseType: m[1], markers: m[2].split(',').map((s) => s.trim().replace(/`/g, '')) }));
  assert.deepEqual(rows.map((r) => r.releaseType), RELEASE_STACK_TABLE.map((r) => r.releaseType));
  for (let i = 0; i < rows.length; i += 1) assert.deepEqual(rows[i].markers, RELEASE_STACK_TABLE[i].markers, `markers for ${rows[i].releaseType}`);
  assert.ok(section.includes('`simple`'), 'the fall-through row is named');
});

test('detection-tables.md routes the release-process finding to Step 21, and the CLAUDE.md template gains a Releasing section', () => {
  assert.match(DETECT, /Release process \(semantic-release, changesets, manual tags\)[^\n]*step-21-release\.md/);
  const tmplStart = TEMPLATE.indexOf('## Initial Mode Template');
  const tmplEnd = TEMPLATE.indexOf('## Update Mode');
  const initial = TEMPLATE.slice(tmplStart, tmplEnd);
  assert.ok(initial.includes('\n## Releasing\n'), 'the initial template has a ## Releasing section');
  assert.ok(initial.includes('/claude-tweaks:release'), 'names the one-line invocation');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/init-release-bootstrap-conformance.test.js`
Expected: FAIL — `ENOENT` reading `plugin/skills/init/bootstrap/step-21-release.md` (the file does not exist yet).

- [ ] **Step 3: Write the step file**

Create `plugin/skills/init/bootstrap/step-21-release.md`:

```markdown
# Step 21 — Release Bootstrap (detailed procedure)

*Optional Enhancement step — see `SKILL.md`'s `## Input` for when this group is offered or filtered, and `../bootstrap-steps.md` for its ordering and renumbering conventions.*

Gives `detection-tables.md`'s release-process row (Step 2e) a destination (#2253). On a repo with no release automation, writes the release-please engine's files — the config every later phase of the release family reads, the manifest, and (pr-first only) the workflow — and seeds the two `release-*` policy keys. On a repo that already runs a competing tool, refuses and reports rather than layering a second engine on top (design stance 7: existing release automation is a conflict, not a wrap target).

**Gate — Step 20's output.** This step routes on `integration-model` (`_shared/integration-model.md`): `pr-first` → release-please workflow + config, `local-merge` → config only (the local engine reads the same files). Resolve the value the way every consumer does — `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values integration-model`. When Step 20 did not run or the value resolves empty/ambiguous, **skip this step entirely** and record `release: skipped — integration-model unresolved` in the init summary — never guess an engine.

**Branch.** Resolve the integration branch via `_shared/integration-branch.md`'s canonical ladder (the `integration-branch` policy value when set, else the remote's default branch — `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` — else `main`); it is the branch the workflow triggers on.

**Detect and write — one CLI call.** The whole decision is the code twin `bin/lib/init/release-bootstrap.js`, fronted by:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/release-bootstrap.js" --integration-model {pr-first|local-merge} --branch {branch}
```

It prints one JSON line — `{verdict, tool?, evidence?, releaseType?, version?, written[], policyRows[]}` — and exits 0 on every verdict (2 on usage, 1 on an unexpected error). Read `verdict`:

| Verdict | What the CLI did | Init summary line |
|---|---|---|
| `fresh` | Wrote `release-please-config.json` (`release-type` from the stack table below), `.release-please-manifest.json` (seeded from the newest `v*` tag by semver precedence, else the stack manifest's version, else `0.1.0`), and — `pr-first` only — `.github/workflows/release-please.yml` (`googleapis/release-please-action@v4`, `contents: write` + `pull-requests: write`) | `release: bootstrapped — {releaseType}, manifest {version}` |
| `already-bootstrapped` | Nothing — the config already carries this step's own shape; an idempotent no-op that never re-writes or clobbers | `release: already configured` |
| `conflict` | Nothing — a competing tool was found: `.releaserc*` / `release.config.*` (semantic-release), `.changeset/` (changesets), `.goreleaser.*` (goreleaser), or a foreign `release-please-config.json` | `release: conflict — {tool}` (name the `evidence` path). Removing the tool clears it on the next `/init` run |

`v*` tags are not conflict evidence — a project that already tags releases by hand is exactly the onboarding case; tags feed only the manifest seed. Detection is this step's own presence check, deliberately not `_shared/existing-convention-detection.md`'s genre-grammar procedure (its ≥3-file floor and grammar parse answer a different question); only the three-way verdict vocabulary is shared.

**Policy rows (`fresh` only) — deferred write.** The CLI returns `policyRows`, two commented-out lines:

```
# release-hook: <command run after the local engine tags a release — local-merge only; under pr-first the release: published workflow is the hook>
# release-train: false
```

Append them to `.claude-tweaks/policy.yml` through `worktree-policy-finalization.md`'s isolated-worktree write (`../worktree-policy-finalization.md`, § "How the write itself happens") — queue them exactly as Step 6 queues `worktree-always`, never a direct `Edit` against the main checkout; skip a line whose key is already present (commented or not). Both keys are non-core schema entries (`_shared/policy-schema.md`, Additional levers) and never Manifesto levers; what reads them ships in later units (`bin/release-local.js`, `/claude-tweaks:release --train`).

## Stack table

The canonical stack → `release-type` mapping (code twin: `RELEASE_STACK_TABLE` in `bin/lib/init/release-bootstrap.js`, pinned row-for-row by `tests/init-release-bootstrap-conformance.test.js`). Markers are root-level names; `*.ext` means any root file with that extension. **Exactly one** matching row selects its type; zero or two-plus rows fall through to `simple` — a multi-stack repo is out of scope by design, not resolved by precedence. Later units (the local engine, the preflight fact pack) cite this table rather than re-deriving their own.

| `release-type` | Root markers |
|---|---|
| `node` | `package.json` |
| `python` | `pyproject.toml`, `setup.py` |
| `rust` | `Cargo.toml` |
| `go` | `go.mod` |
| `java` | `pom.xml`, `build.gradle`, `build.gradle.kts` |
| `ruby` | `Gemfile`, `*.gemspec` |
| `php` | `composer.json` |
| `dotnet` | `*.csproj`, `*.sln` |

Under `simple`, `extra-files` names the first version-bearing JSON manifest found — `.claude-plugin/plugin.json`, `plugin/.claude-plugin/plugin.json`, then root `*.json` files with a top-level `version` — as `{type: json, path, jsonpath: $.version}` (this repo: `plugin/.claude-plugin/plugin.json`); none found → no `extra-files` key.

**Idempotent:** re-running `/init` on a repo this step already bootstrapped reports `already configured` and writes nothing; declining is not a state this step records — it is offered again next run.

**Failure handling:** a CLI exit of 1 (unexpected error) is surfaced with its stderr line and `/init` continues — never abort the rest of bootstrap on this step. Exit 2 is a prose bug (a malformed invocation above), not a project condition.
```

- [ ] **Step 4: Register the step, the token, the index row, the detection destination, the template section**

In `plugin/skills/init/SKILL.md`, directly after the Step 20 stub's paragraph (the line beginning `On a GitHub-reachable project, offers pinning \`integration-model: pr-first\`` and before the following `---`), insert:

```markdown

### Step 21: Release Bootstrap (Optional)

Detects existing release automation (`fresh` / `already-bootstrapped` / `conflict`) and, on a fresh repo, writes the release-please config, manifest, and — `pr-first` only, per Step 20's `integration-model` (`_shared/integration-model.md`) — the workflow, plus the two commented-out `release-*` policy rows; refuses on a conflicting tool. Read `bootstrap/step-21-release.md` for the full procedure.
```

In the same file's `## Input` section, the line beginning `**Enhancement filter tokens** — one per Optional Enhancement step:` lists tokens ending `` `emil-skills`, `integration-model`. `` — change that ending to `` `emil-skills`, `integration-model`, `release`. ``.

In `plugin/skills/init/input-grammar.md`, after the `| \`integration-model\` | Step 20 — …` row, add:

```markdown
| `release` | Step 21 — Release bootstrap (`bootstrap/step-21-release.md`). Hard-depends on Step 20 having resolved `integration-model` — with the value unresolved, the step skips itself and reports `release: skipped — integration-model unresolved`, same as in the unfiltered flow |
```

In `plugin/skills/init/bootstrap-steps.md`, after the `| 20 | \`step-20-integration-model.md\` | …` row, add:

```markdown
| 21 | `step-21-release.md` | Release-process detection (`fresh`/`already-bootstrapped`/`conflict`), the release-please config/manifest/workflow writes, and the two commented `release-*` policy rows (depends on Step 20's `integration-model`). |
```

In `plugin/skills/init/detection-tables.md`, change the line `- Release process (semantic-release, changesets, manual tags)` to:

```
- Release process (semantic-release, changesets, manual tags) — destination: `bootstrap/step-21-release.md`'s `release` verdict (`fresh` / `already-bootstrapped` / `conflict`), which also writes the engine files; the finding itself is recorded as the `release` entry of this step's findings
```

In `plugin/skills/init/claude-md-template.md`, inside the Initial Mode Template's fenced markdown, directly after the `## Git` block (the `{Commit convention, branch strategy, PR process}` placeholder line and its blank line) and before `## claude-tweaks Pipeline`, insert:

```markdown
## Releasing

{Engine in use — release-please via `.github/workflows/release-please.yml` under `pr-first`, or the local engine (`node "${CLAUDE_PLUGIN_ROOT}/bin/release-local.js"`) under `local-merge`; where the publish/deploy hook lives — the `release: published` workflow, or the `release-hook` policy command.}

Cut a release: `/claude-tweaks:release`

```

- [ ] **Step 5: Verify**

Run: `node --test tests/init-release-bootstrap-conformance.test.js tests/integration-model.test.js tests/init-port-isolation-conformance.test.js tests/skill-catalog-completeness.test.js tests/bin-lib/skill-audit/context-cost.test.js`
Expected: PASS.

Run: `wc -c plugin/skills/init/SKILL.md`
Expected: under 40,960 (baseline 39,316).

Run: `npm test 2>&1 | tail -15`
Expected: every file passes except the known pre-existing `tests/impeccable-cli-contract.test.js` environment failure (installed Impeccable 4.1.0 vs pinned 3.6.0 — run ledger row 21).

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/init/bootstrap/step-21-release.md plugin/skills/init/SKILL.md plugin/skills/init/input-grammar.md plugin/skills/init/bootstrap-steps.md plugin/skills/init/detection-tables.md plugin/skills/init/claude-md-template.md tests/init-release-bootstrap-conformance.test.js
git commit -m "Add init Step 21 release bootstrap — detection verdicts, engine-file writes, deferred policy rows, the release token, and a Releasing template section, refs #2253

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 5: Docs — plugin-structure inventory lines

**Files:**
- Modify: `docs/plugin-structure.md` (the `plugin/bin/lib/init/` inventory line; the command reference block near the `node plugin/bin/release.js …` lines)

**Interfaces:** none — prose only.

- [ ] **Step 1: Update the inventory line**

In `docs/plugin-structure.md`, on the line beginning `plugin/bin/lib/init/            → verify-scope-starter.js (#1924`, append before the line's end (keep it one line): `; release-bootstrap.js (#2253 — /claude-tweaks:init Step 21's code twin: release-process detection (fresh / already-bootstrapped / conflict), the stack → release-type table, semver-aware manifest seeding, and the release-please config/manifest/workflow renderers; consumed by plugin/bin/release-bootstrap.js)`.

- [ ] **Step 2: Add the CLI line**

In the command-reference block, directly after the `node plugin/bin/release.js status …` line, add:

```
node plugin/bin/release-bootstrap.js --integration-model <pr-first|local-merge|unresolved> [--root <dir>] [--branch <name>] [--dry-run]   # Init Step 21's release bootstrap (#2253) — one JSON line {verdict, releaseType, version, written[], policyRows[]}; writes release-please-config.json + .release-please-manifest.json (+ .github/workflows/release-please.yml under pr-first) on `fresh`, nothing on `already-bootstrapped`/`conflict`/`skipped`; exit 0 on every verdict, 2 usage, 1 unexpected error (`plugin/bin/lib/init/release-bootstrap.js`, tests in `tests/bin-lib/init/`)
```

- [ ] **Step 3: Verify**

Run: `grep -c 'release-bootstrap' docs/plugin-structure.md` — Expected: 2 or more.
Run: `node --test tests/skill-catalog-completeness.test.js tests/skill-graph-table-structure.test.js` — Expected: PASS (no doc-structure regression).

- [ ] **Step 4: Commit**

```bash
git add docs/plugin-structure.md
git commit -m "Document the release-bootstrap module and CLI in the plugin structure — refs #2253

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

## Verification (whole plan)

- `npm test 2>&1 | tail -15` — every file green except the known `tests/impeccable-cli-contract.test.js` environment failure (run ledger row 21).
- AC 1 / AC 2 / AC 3 / AC 6 / AC 7 / AC 8 → the named `bootstrapRelease` tests in `tests/bin-lib/init/release-bootstrap.test.js` pass (the "init run" in each AC is realized by the code twin the prose step calls; the prose step's own flow is pinned by `tests/init-release-bootstrap-conformance.test.js`).
- AC 4 → `tests/policy-schema-metadata.test.js`'s new test passes (relative core-count check).
- AC 5 → `renderPolicyRows` produces exactly the two commented lines and `step-21-release.md` routes them through the deferred isolated-worktree write (pinned by the conformance test's `worktree-policy-finalization.md` and `# release-train: false` assertions).
- `tests/integration-model.test.js` passes with the new step file and stub citing `_shared/integration-model.md`.
- Byte budgets: `wc -c plugin/skills/init/SKILL.md plugin/skills/_shared/policy-schema.md` both under 40,960.
