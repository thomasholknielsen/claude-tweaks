# Recon Phase 1: Spine (Mechanical Lenses) — Implementation Plan

> **Canonical interface:** cross-phase API signatures (cache, fingerprint, dedup, paths, labels) live in `2026-06-14-recon-interface-contract.md`. Where this plan's inline names differ, the contract wins — notably use the cache dir `.claude-tweaks/recon/cache.json` (not `.claude-tweaks/recon-cache.json`).

> **For agentic workers:** REQUIRED SUB-SKILL: before executing this plan, load and follow `superpowers:subagent-driven-development`. Each numbered Task below is one independent unit — write the failing test first, run it and confirm it fails for the stated reason, write the minimal implementation, run it and confirm it passes, then commit with the exact message given. Do not batch tasks; do not skip the red step. All code is real — there are no placeholders to fill in.

**Goal:** Build the deterministic spine of `/recon` — a recurring, report-only repo-improvement finder. Phase 1 delivers mechanical lenses only (no LLM), a stable fingerprint, GitHub-issue-state dedup, GitHub issue *payload* projection (emit-only — the engine never touches the network), a gitignored dedup cache, an on-demand `run` command with `--dry-run`, and the `skills/recon/SKILL.md`. Judgment lenses, the Routine, and the `/flow` pull-issues affordance are explicitly out of scope (Phases 2-3).

**Architecture:** Two layers, Phase 1 ships only the deterministic one. `bin/recon.js` is a thin CLI that parses args and dispatches to `bin/lib/recon/*` helpers. Each helper is a pure (or filesystem-only) module: `areas.js` detects/selects sweep areas, `lenses/*` produce raw findings, `fingerprint.js` mints a stable id per finding, `cache.js` reads/writes the gitignored dedup cache, `dedup.js` decides skip/reopen/file/remember by matching a finding's fingerprint against open GitHub issues plus the cache, and `issue-payload.js` projects a finding into a `gh`-ready `{title, body, labels}`. The SKILL.md is the orchestrator's human-facing contract: it tells Claude to call `recon.js run --dry-run`, then `run`, then hand the emitted payloads to the `gh` CLI itself. `recon.js` never calls `gh` or the network — it only emits payloads and decisions to stdout. GitHub issue state (the list of open `recon`-labelled issues) is supplied *into* the engine as data (read by the skill via `gh` and passed through, or, in Phase 1, read from an optional `--issues <file>` JSON fixture and the cache); the engine treats it as an input, never fetches it.

**Tech Stack:** Node 18+ built-ins only (`fs`, `path`, `crypto`). Zero external dependencies. Tests via the built-in `node --test` runner. No TypeScript, no transpile step. CommonJS (`require`/`module.exports`) to match existing `bin/lib/` style (`color.js`, `deps.js`, `coordination.js`).

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `bin/recon.js` | CLI entry. Parses argv; Phase 1 dispatches the `run` command. Defaults `--root` to `process.cwd()`. Invoked as `node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" run [--area <path>] [--dry-run] [--root <dir>] [--issues <file>]`. |
| `bin/lib/recon/finding.js` | Single source of truth for the Finding shape — a `makeFinding(partial)` factory + `FINDING_FIELDS` list. Every lens emits via this so the shape can never drift. |
| `bin/lib/recon/fingerprint.js` | `fingerprint({lens, areaId, signature, file})` → `"recon-<8hex>"`. Strips trailing `:line(:col)`, whitespace, and volatile identifiers before hashing (the corrected stability bug). Exports `normalizeSignature`. |
| `bin/lib/recon/areas.js` | `detectAreas(root)` → `[{id, globs, flags}]` (workspace signal-file detection, single-app fallback). `selectAreas(areas, opts)` → areas (Phase 1: pass-through / `--area` filter). |
| `bin/lib/recon/lenses/index.js` | `buildLenses(config)` → `[lens]`. Lens = `{id, kind:'mechanical', run(area, root) → [finding]}`. |
| `bin/lib/recon/lenses/oversized-file.js` | Mechanical lens: files over a line threshold. |
| `bin/lib/recon/lenses/dead-export.js` | Mechanical lens: exported names with no matching import under the scan root (heuristic). |
| `bin/lib/recon/lenses/todo-comments.js` | Mechanical lens: TODO / FIXME / HACK comments. |
| `bin/lib/recon/lenses/dependency-freshness.js` | Mechanical lens: loose version ranges (`*`, `latest`, `x`) in `package.json` dependency sections. |
| `bin/lib/recon/lenses/project-command.js` | Mechanical lens: runs a project-configured lint/typecheck command and parses its output into findings. |
| `bin/lib/recon/cache.js` | `readCache(root)`, `writeCache(root, cache)`. File at `<root>/.claude-tweaks/recon-cache.json` (gitignored). Shape `{ "<fingerprint>": {status, issue} }`. |
| `bin/lib/recon/dedup.js` | `decide(finding, openIssues, cache)` → `{action, issue?}`. Severity threshold splits file vs remember. |
| `bin/lib/recon/issue-payload.js` | `toIssuePayload(finding)` → `{title, body, labels}`. Embeds the fingerprint marker and `/specify`-shaped sections. |
| `skills/recon/SKILL.md` | The skill. Standard preamble, interaction directive, When to Use, run procedure, Anti-Patterns, Component-Skill Contract (keyed on `$PIPELINE_RUN_DIR`), Relationship table, Next Actions. |
| `bin/lib/recon/tests/*.test.js` | Co-located unit tests for every module (one file per module). |
| `package.json` (root, new) | Adds a `test` script that globs `tests/` + `bin/lib/recon/tests/` so `node --test` discovers the new suite. |

**Modify (back-references + doc-sync):** `skills/specify/SKILL.md`, `skills/capture/SKILL.md`, `skills/tidy/SKILL.md`, `skills/flow/SKILL.md` (add a `/recon` Relationship row each); `.gitignore` (cache carve-out); `.claude-plugin/plugin.json` (4.17.0 → 4.18.0); `CLAUDE.md` (test-command note + skill catalog).

---

## Task 1 — Finding shape factory

The Finding shape is referenced by every lens, dedup, and issue-payload. Define it once so it cannot drift.

Finding shape: `{ id, title, lens, category, severity:'low'|'medium'|'high'|'critical', confidence:'high'|'med'|'low', area, files:[...], evidence, suggestion, acceptance, signature }`. `id` is set later by the fingerprint step; `signature` is the stable basis a lens supplies and is consumed by fingerprinting (not emitted to issues).

**Files:**
- Create: `bin/lib/recon/finding.js`
- Test: `bin/lib/recon/tests/finding.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/finding.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { makeFinding, FINDING_FIELDS } = require('../finding');

test('makeFinding fills defaults and preserves provided fields', () => {
  const f = makeFinding({
    lens: 'todo-comments',
    area: '.',
    signature: 'TODO wire it up',
    title: 'TODO in a.js',
    files: ['a.js:12'],
    evidence: 'a.js:12 (TODO: wire it up)',
    suggestion: 'Resolve the TODO.',
    acceptance: 'TODO removed or tracked.',
  });
  assert.strictEqual(f.lens, 'todo-comments');
  assert.strictEqual(f.category, 'convention');     // default
  assert.strictEqual(f.severity, 'low');            // default
  assert.strictEqual(f.confidence, 'high');         // default
  assert.deepStrictEqual(f.files, ['a.js:12']);
  assert.strictEqual(f.id, null);                   // fingerprint assigns later
});

test('makeFinding rejects an invalid severity', () => {
  assert.throws(() => makeFinding({ lens: 'x', area: '.', signature: 's', title: 't', severity: 'urgent' }),
    /severity/);
});

test('FINDING_FIELDS lists every field exactly once', () => {
  assert.ok(FINDING_FIELDS.includes('acceptance'));
  assert.strictEqual(new Set(FINDING_FIELDS).size, FINDING_FIELDS.length);
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/finding.test.js`
      Expected: `Error: Cannot find module '../finding'` (module does not exist yet).

- [ ] Write the minimal implementation `bin/lib/recon/finding.js`:

```js
const FINDING_FIELDS = [
  'id', 'title', 'lens', 'category', 'severity', 'confidence',
  'area', 'files', 'evidence', 'suggestion', 'acceptance', 'signature',
];

const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const CONFIDENCES = new Set(['high', 'med', 'low']);

// Single source of truth for the Finding shape. Lenses call this so the shape
// never drifts. `id` is null until the fingerprint step assigns it.
function makeFinding(partial) {
  const f = {
    id: null,
    title: partial.title || '',
    lens: partial.lens || '',
    category: partial.category || 'convention',
    severity: partial.severity || 'low',
    confidence: partial.confidence || 'high',
    area: partial.area || '.',
    files: Array.isArray(partial.files) ? partial.files : [],
    evidence: partial.evidence || '',
    suggestion: partial.suggestion || '',
    acceptance: partial.acceptance || '',
    signature: partial.signature || '',
  };
  if (!SEVERITIES.has(f.severity)) throw new Error(`invalid severity: ${f.severity}`);
  if (!CONFIDENCES.has(f.confidence)) throw new Error(`invalid confidence: ${f.confidence}`);
  return f;
}

module.exports = { makeFinding, FINDING_FIELDS };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/finding.test.js`
      Expected: `# pass 3  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/finding.js bin/lib/recon/tests/finding.test.js && git commit -m "Add recon Finding shape factory"`

---

## Task 2 — Fingerprint (corrected stability bug)

This is the top engineering risk. The old engine minted a new id when a finding moved lines, because it hashed the `file` field raw. PORT.md delta #1 fixes this: strip the trailing `:line(:col)` from `file` *and* normalize the signature before hashing. This task ships the corrected version and a regression test that would have caught the original bug.

**Files:**
- Create: `bin/lib/recon/fingerprint.js`
- Test: `bin/lib/recon/tests/fingerprint.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/fingerprint.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { fingerprint, normalizeSignature } = require('../fingerprint');

test('fingerprint returns a recon-<8hex> id', () => {
  const id = fingerprint({ lens: 'todo-comments', areaId: '.', signature: 'TODO x', file: 'a.js:12' });
  assert.match(id, /^recon-[0-9a-f]{8}$/);
});

// REGRESSION (PORT.md delta #1): a cosmetic line move must NOT mint a new id.
test('fingerprint is stable when the finding moves lines or columns', () => {
  const a = fingerprint({ lens: 'todo-comments', areaId: '.', signature: 'TODO wire it up', file: 'src/a.js:12' });
  const b = fingerprint({ lens: 'todo-comments', areaId: '.', signature: 'TODO wire it up', file: 'src/a.js:480:6' });
  assert.strictEqual(a, b, 'line/col in file must be stripped before hashing');
});

// REGRESSION: signature whitespace/case/line refs are normalized.
test('fingerprint is stable across whitespace, case, and embedded line refs in signature', () => {
  const a = fingerprint({ lens: 'oversized-file', areaId: 'apps/web', signature: 'src/Foo.ts:12  has 900 lines' });
  const b = fingerprint({ lens: 'oversized-file', areaId: 'apps/web', signature: 'SRC/FOO.TS:401 HAS   900 LINES' });
  assert.strictEqual(a, b);
});

test('fingerprint differs when lens or area differs', () => {
  const base = { areaId: '.', signature: 'TODO x', file: 'a.js:1' };
  assert.notStrictEqual(
    fingerprint({ ...base, lens: 'todo-comments' }),
    fingerprint({ ...base, lens: 'dead-export' }),
  );
  assert.notStrictEqual(
    fingerprint({ lens: 'todo-comments', areaId: 'a', signature: 'TODO x' }),
    fingerprint({ lens: 'todo-comments', areaId: 'b', signature: 'TODO x' }),
  );
});

test('normalizeSignature strips line refs, collapses whitespace, lowercases', () => {
  assert.strictEqual(normalizeSignature('Foo.ts:12:3  Bar   BAZ'), 'foo.ts bar baz');
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/fingerprint.test.js`
      Expected: `Error: Cannot find module '../fingerprint'`.

- [ ] Write the minimal implementation `bin/lib/recon/fingerprint.js`:

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

// Stable id from lens + area + normalized signature (+ optional file).
// CORRECTED (PORT.md delta #1): the file's trailing :line(:col) is stripped
// BEFORE hashing, so a finding that moves lines keeps its id. JSON.stringify of
// the field array is an unambiguous, collision-free basis (no field can bleed
// into its neighbour).
function fingerprint({ lens, areaId, signature, file }) {
  const normFile = String(file || '').replace(/:\d+(:\d+)?$/, '');
  const basis = JSON.stringify([lens, areaId, normFile, normalizeSignature(signature)]);
  const hash = crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
  return `recon-${hash}`;
}

module.exports = { fingerprint, normalizeSignature };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/fingerprint.test.js`
      Expected: `# pass 5  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/fingerprint.js bin/lib/recon/tests/fingerprint.test.js && git commit -m "Add recon fingerprint with corrected line-move stability"`

---

## Task 3 — Areas (detect + select)

`detectAreas(root)` returns `[{id, globs, flags}]`. It reads workspace signal files (pnpm-workspace.yaml, package.json `workspaces`, turbo.json, nx.json) and falls back to a single `.` area. `selectAreas(areas, opts)` is Phase 1's pass-through / `--area` filter (Phase 3 adds scoring). Note the contract shape change from the salvaged `areas.js`: the returned object is `{id, globs, flags}`, not `{id, path}`. `globs` is the list of relative directory paths the area covers; `flags` is a reserved object (empty in Phase 1, populated by scoring in Phase 3).

**Files:**
- Create: `bin/lib/recon/areas.js`
- Test: `bin/lib/recon/tests/areas.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/areas.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectAreas, selectAreas } = require('../areas');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-areas-'));
}

test('detectAreas falls back to a single "." area when no workspace markers', () => {
  const root = tmpRepo();
  const areas = detectAreas(root);
  assert.deepStrictEqual(areas, [{ id: '.', globs: ['.'], flags: {} }]);
});

test('detectAreas reads package.json workspaces and only counts dirs with a manifest', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }));
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'web', 'package.json'), '{}');
  fs.mkdirSync(path.join(root, 'apps', 'empty'), { recursive: true }); // no manifest -> excluded
  const areas = detectAreas(root);
  assert.deepStrictEqual(areas, [{ id: 'apps/web', globs: ['apps/web'], flags: {} }]);
});

test('selectAreas passes through when no --area filter', () => {
  const areas = [{ id: 'a', globs: ['a'], flags: {} }, { id: 'b', globs: ['b'], flags: {} }];
  assert.deepStrictEqual(selectAreas(areas, {}), areas);
});

test('selectAreas filters to the requested area', () => {
  const areas = [{ id: 'a', globs: ['a'], flags: {} }, { id: 'b', globs: ['b'], flags: {} }];
  assert.deepStrictEqual(selectAreas(areas, { area: 'b' }), [{ id: 'b', globs: ['b'], flags: {} }]);
});

test('selectAreas with --area not in detected set synthesizes an explicit area', () => {
  const areas = [{ id: 'a', globs: ['a'], flags: {} }];
  assert.deepStrictEqual(selectAreas(areas, { area: 'packages/x' }),
    [{ id: 'packages/x', globs: ['packages/x'], flags: {} }]);
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/areas.test.js`
      Expected: `Error: Cannot find module '../areas'`.

- [ ] Write the minimal implementation `bin/lib/recon/areas.js`:

```js
const fs = require('fs');
const path = require('path');

const WORKSPACE_MARKERS = ['package.json', 'project.json', 'turbo.json'];

// Expand a "prefix/*" (single star, one level) glob against the real FS under
// root. Returns relative dir paths that contain a workspace manifest.
function expandGlob(root, pattern) {
  const results = [];
  const starIdx = pattern.indexOf('*');
  if (starIdx === -1) {
    try { fs.statSync(path.join(root, pattern)); results.push(pattern); } catch { /* skip */ }
    return results;
  }
  const prefix = pattern.slice(0, starIdx);
  const suffix = pattern.slice(starIdx + 1);
  let entries;
  try { entries = fs.readdirSync(path.join(root, prefix), { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = prefix + entry.name + suffix;
    const abs = path.join(root, candidate);
    if (WORKSPACE_MARKERS.some((m) => { try { fs.statSync(path.join(abs, m)); return true; } catch { return false; } })) {
      results.push(candidate);
    }
  }
  return results;
}

function parsePackageJsonWorkspaces(root) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { return null; }
  const ws = parsed.workspaces;
  if (!Array.isArray(ws) || !ws.length) return null;
  const paths = [];
  for (const g of ws) paths.push(...expandGlob(root, g));
  return paths.length ? paths : null;
}

function parsePnpmWorkspace(root) {
  let raw;
  try { raw = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'); } catch { return null; }
  const globs = [];
  let inPackages = false;
  for (const line of raw.split('\n')) {
    if (/^packages:/.test(line)) { inPackages = true; continue; }
    if (inPackages && /^\s+-\s+/.test(line)) globs.push(line.replace(/^\s+-\s+["']?/, '').replace(/["']?\s*$/, ''));
    else if (inPackages && /^\S/.test(line)) inPackages = false;
  }
  const paths = [];
  for (const g of globs) paths.push(...expandGlob(root, g));
  return paths.length ? paths : null;
}

// Returns Area[] = [{ id, globs, flags }]. id === globs[0] (relative from root).
// Tries signal files in priority order; falls back to a single "." area.
function detectAreas(root) {
  const rel = parsePnpmWorkspace(root) || parsePackageJsonWorkspaces(root);
  if (!rel) return [{ id: '.', globs: ['.'], flags: {} }];
  return rel.map((p) => ({ id: p, globs: [p], flags: {} }));
}

// Phase 1: pass-through, or filter/synthesize the explicitly requested --area.
// Phase 3 replaces this with weighted scoring + round-robin selection.
function selectAreas(areas, opts) {
  if (!opts || !opts.area) return areas;
  const found = areas.find((a) => a.id === opts.area);
  return found ? [found] : [{ id: opts.area, globs: [opts.area], flags: {} }];
}

module.exports = { detectAreas, selectAreas };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/areas.test.js`
      Expected: `# pass 5  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/areas.js bin/lib/recon/tests/areas.test.js && git commit -m "Add recon area detection and Phase 1 selection"`

---

## Task 4 — todo-comments lens (+ lens contract + self-pollution guard)

This task establishes the lens contract (`{id, kind:'mechanical', run(area, root) → [finding]}`) and ships the simplest lens. PORT.md delta #2 (self-pollution guard) is implemented here: the walk must skip the engine's own `.claude-tweaks/` output directory, or a `.`-area run would scan its own cache (which contains finding text) and re-report it forever. The regression test asserts a TODO inside `.claude-tweaks/` is never reported.

Lens contract note: the shared cross-plan signature is `run(area, root) → [finding]`. Internally each lens walks `path.join(root, glob)` for each glob in `area.globs`, always skipping `SKIP_DIRS` plus `.claude-tweaks`.

**Files:**
- Create: `bin/lib/recon/lenses/todo-comments.js`
- Test: `bin/lib/recon/tests/todo-comments.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/todo-comments.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lens = require('../lenses/todo-comments');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-todo-')); }
const AREA = { id: '.', globs: ['.'], flags: {} };

test('lens exposes the mechanical contract', () => {
  assert.strictEqual(lens.id, 'todo-comments');
  assert.strictEqual(lens.kind, 'mechanical');
  assert.strictEqual(typeof lens.run, 'function');
});

test('reports TODO/FIXME/HACK with file:line in files and a stable signature', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n// TODO: wire it up\n');
  const findings = lens.run(AREA, root);
  assert.strictEqual(findings.length, 1);
  const f = findings[0];
  assert.strictEqual(f.lens, 'todo-comments');
  assert.deepStrictEqual(f.files, ['a.js:2']);
  assert.strictEqual(f.signature, 'TODO wire it up');
  assert.strictEqual(f.severity, 'low');
});

// REGRESSION (PORT.md delta #2): a run must never scan its own output.
test('self-pollution guard: TODO inside .claude-tweaks is ignored', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'recon-cache.json'),
    '{ "x": "TODO: this is engine output, not source" }');
  fs.writeFileSync(path.join(root, 'real.js'), '// FIXME: real one\n');
  const findings = lens.run(AREA, root);
  assert.strictEqual(findings.length, 1);
  assert.deepStrictEqual(findings[0].files, ['real.js:1']);
});

test('skips node_modules and .git', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'node_modules', 'p'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'p', 'i.js'), '// TODO: vendored\n');
  assert.strictEqual(lens.run(AREA, root).length, 0);
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/todo-comments.test.js`
      Expected: `Error: Cannot find module '../lenses/todo-comments'`.

- [ ] Write the minimal implementation `bin/lib/recon/lenses/todo-comments.js`:

```js
const fs = require('fs');
const path = require('path');
const { makeFinding } = require('../finding');

const PATTERN = /\b(TODO|FIXME|HACK)\b[:\s]+(.+)/;
// SKIP_DIRS includes .claude-tweaks so a run never scans its own output
// (PORT.md delta #2 — the self-pollution guard).
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', '.claude-tweaks']);

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function run(area, root) {
  const findings = [];
  for (const glob of area.globs) {
    const base = path.join(root, glob);
    try { fs.statSync(base); } catch { continue; }
    for (const file of walk(base)) {
      let content;
      try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
      const rel = path.relative(root, file);
      content.split('\n').forEach((line, i) => {
        const m = line.match(PATTERN);
        if (!m) return;
        const tag = m[1];
        const text = m[2].trim();
        findings.push(makeFinding({
          lens: 'todo-comments',
          category: 'convention',
          severity: 'low',
          confidence: 'high',
          area: area.id,
          files: [`${rel}:${i + 1}`],
          signature: `${tag} ${text}`,
          title: `${tag} comment in ${path.basename(rel)}`,
          evidence: `${rel}:${i + 1} (${tag}: ${text})`,
          suggestion: `Resolve the ${tag} or convert it into a tracked task.`,
          acceptance: `The ${tag} is removed or linked to a tracked item.`,
        }));
      });
    }
  }
  return findings;
}

module.exports = { id: 'todo-comments', kind: 'mechanical', run };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/todo-comments.test.js`
      Expected: `# pass 4  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/lenses/todo-comments.js bin/lib/recon/tests/todo-comments.test.js && git commit -m "Add recon todo-comments lens with self-pollution guard"`

---

## Task 5 — oversized-file lens

Reports files over a configurable line threshold, with severity scaled by how far over they are.

**Files:**
- Create: `bin/lib/recon/lenses/oversized-file.js`
- Test: `bin/lib/recon/tests/oversized-file.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/oversized-file.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lens = require('../lenses/oversized-file');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-big-')); }
const AREA = { id: '.', globs: ['.'], flags: {} };

test('mechanical contract', () => {
  assert.strictEqual(lens.id, 'oversized-file');
  assert.strictEqual(lens.kind, 'mechanical');
});

test('flags a file over the threshold and ignores one under it', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'big.js'), 'x\n'.repeat(700));   // 700 lines > 300
  fs.writeFileSync(path.join(root, 'small.js'), 'x\n'.repeat(10));
  const findings = lens.run(AREA, root, { threshold: 300 });
  assert.strictEqual(findings.length, 1);
  assert.deepStrictEqual(findings[0].files, ['big.js']);
  assert.strictEqual(findings[0].severity, 'high'); // 701 > 300*2
  assert.match(findings[0].signature, /big\.js/);
});

test('respects .claude-tweaks self-pollution guard', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'recon-cache.json'), 'x\n'.repeat(900));
  assert.strictEqual(lens.run(AREA, root, { threshold: 300 }).length, 0);
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/oversized-file.test.js`
      Expected: `Error: Cannot find module '../lenses/oversized-file'`.

- [ ] Write the minimal implementation `bin/lib/recon/lenses/oversized-file.js`:

```js
const fs = require('fs');
const path = require('path');
const { makeFinding } = require('../finding');

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', '.claude-tweaks']);
const DEFAULT_THRESHOLD = 300;

function severity(lineCount, threshold) {
  if (lineCount > threshold * 3.33) return 'critical';
  if (lineCount > threshold * 2) return 'high';
  return 'medium';
}

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function run(area, root, config) {
  const threshold = (config && config.threshold) || DEFAULT_THRESHOLD;
  const findings = [];
  for (const glob of area.globs) {
    const base = path.join(root, glob);
    try { fs.statSync(base); } catch { continue; }
    for (const file of walk(base)) {
      let content;
      try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
      const lineCount = content.split('\n').length;
      if (lineCount <= threshold) continue;
      const rel = path.relative(root, file);
      findings.push(makeFinding({
        lens: 'oversized-file',
        category: 'architecture',
        severity: severity(lineCount, threshold),
        confidence: 'high',
        area: area.id,
        files: [rel],
        signature: `oversized ${rel}`,
        title: `Oversized file: ${path.basename(rel)} (${lineCount} lines)`,
        evidence: `${rel} has ${lineCount} lines, exceeding the ${threshold}-line threshold.`,
        suggestion: `Break ${path.basename(rel)} into smaller modules or extract cohesive subsets.`,
        acceptance: `${path.basename(rel)} is split so no module exceeds ${threshold} lines, or the threshold is documented as intentional.`,
      }));
    }
  }
  return findings;
}

module.exports = { id: 'oversized-file', kind: 'mechanical', run };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/oversized-file.test.js`
      Expected: `# pass 3  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/lenses/oversized-file.js bin/lib/recon/tests/oversized-file.test.js && git commit -m "Add recon oversized-file lens"`

---

## Task 6 — dead-export lens

Heuristic: collect exported names across the area; report any not imported anywhere under the scan root. Two-pass (gather all imports under root, then emit exports under the area not in that set). Confidence is `low` because dynamic imports, re-exports, and external consumers are not checked — the finding text says so.

**Files:**
- Create: `bin/lib/recon/lenses/dead-export.js`
- Test: `bin/lib/recon/tests/dead-export.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/dead-export.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lens = require('../lenses/dead-export');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-dead-')); }
const AREA = { id: '.', globs: ['.'], flags: {} };

test('mechanical contract', () => {
  assert.strictEqual(lens.id, 'dead-export');
  assert.strictEqual(lens.kind, 'mechanical');
});

test('flags an export that is never imported, ignores one that is', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'export const used = 1;\nexport const orphan = 2;\n');
  fs.writeFileSync(path.join(root, 'b.js'), "import { used } from './a';\n");
  const findings = lens.run(AREA, root);
  assert.strictEqual(findings.length, 1);
  assert.match(findings[0].title, /orphan/);
  assert.strictEqual(findings[0].confidence, 'low');
});

test('self-pollution guard skips .claude-tweaks', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'x.js'), 'export const orphan = 1;\n');
  assert.strictEqual(lens.run(AREA, root).length, 0);
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/dead-export.test.js`
      Expected: `Error: Cannot find module '../lenses/dead-export'`.

- [ ] Write the minimal implementation `bin/lib/recon/lenses/dead-export.js`:

```js
const fs = require('fs');
const path = require('path');
const { makeFinding } = require('../finding');

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', '.claude-tweaks']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const DECL_EXPORT = /^export\s+(?:const|let|var|function|class)\s+(\w+)/;
const NAMED_EXPORT = /export\s*\{([^}]+)\}/g;
const IMPORT_NAMES = /import\s*\{([^}]+)\}/g;

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile() && CODE_EXT.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

function collectExports(content) {
  const exports = [];
  content.split('\n').forEach((line, i) => {
    const m = line.match(DECL_EXPORT);
    if (m) { exports.push({ name: m[1], line: i + 1 }); return; }
    let nm;
    const re = new RegExp(NAMED_EXPORT.source, 'g');
    while ((nm = re.exec(line)) !== null) {
      nm[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
        .forEach((name) => exports.push({ name, line: i + 1 }));
    }
  });
  return exports;
}

function run(area, root) {
  // Pass 1: all source files under root (corpus for import scanning).
  const corpus = [];
  for (const file of walk(root)) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    corpus.push({ rel: path.relative(root, file), content });
  }
  const imported = new Set();
  for (const { content } of corpus) {
    let m;
    const re = new RegExp(IMPORT_NAMES.source, 'g');
    while ((m = re.exec(content)) !== null) {
      m[1].split(',').forEach((s) => {
        const name = s.trim().split(/\s+as\s+/)[0].trim();
        if (name) imported.add(name);
      });
    }
  }
  // Pass 2: only files under the area's globs emit findings.
  const bases = area.globs.map((g) => path.resolve(root, g));
  const findings = [];
  for (const { rel, content } of corpus) {
    const abs = path.resolve(root, rel);
    if (!bases.some((b) => abs === b || abs.startsWith(b + path.sep))) continue;
    for (const { name, line } of collectExports(content)) {
      if (imported.has(name)) continue;
      findings.push(makeFinding({
        lens: 'dead-export',
        category: 'architecture',
        severity: 'low',
        confidence: 'low',
        area: area.id,
        files: [`${rel}:${line}`],
        signature: `dead-export ${name}`,
        title: `Possibly dead export: ${name} in ${path.basename(rel)}`,
        evidence: `${rel}:${line}: "${name}" is exported but no import of that name was found under the scan root. Heuristic: dynamic imports, re-exports via *, and external consumers are not checked.`,
        suggestion: `Verify whether "${name}" is consumed outside this root. If genuinely unused, remove it to reduce the public surface.`,
        acceptance: `"${name}" is removed, unexported, or confirmed used by a consumer outside the scan root.`,
      }));
    }
  }
  return findings;
}

module.exports = { id: 'dead-export', kind: 'mechanical', run };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/dead-export.test.js`
      Expected: `# pass 3  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/lenses/dead-export.js bin/lib/recon/tests/dead-export.test.js && git commit -m "Add recon dead-export lens"`

---

## Task 7 — dependency-freshness lens

Reports loose version ranges (`*`, `latest`, bare `x`) in `package.json` dependency sections. Renamed from the salvaged `stale-dependency`; Phase 1 keeps the loose-range check (deterministic, no network) and drops the lockfile heuristic to keep the lens pure.

**Files:**
- Create: `bin/lib/recon/lenses/dependency-freshness.js`
- Test: `bin/lib/recon/tests/dependency-freshness.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/dependency-freshness.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lens = require('../lenses/dependency-freshness');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-dep-')); }
const AREA = { id: '.', globs: ['.'], flags: {} };

test('mechanical contract', () => {
  assert.strictEqual(lens.id, 'dependency-freshness');
  assert.strictEqual(lens.kind, 'mechanical');
});

test('flags wildcard and latest ranges, ignores pinned ranges', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    dependencies: { wild: '*', loose: 'latest', good: '^1.2.3' },
  }));
  const findings = lens.run(AREA, root);
  const names = findings.map((f) => f.signature).sort();
  assert.deepStrictEqual(names, ['dep-range loose latest', 'dep-range wild wildcard']);
  assert.strictEqual(findings.find((f) => f.signature.includes('wild')).severity, 'high');
});

test('no package.json yields no findings', () => {
  assert.strictEqual(lens.run(AREA, tmp()).length, 0);
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/dependency-freshness.test.js`
      Expected: `Error: Cannot find module '../lenses/dependency-freshness'`.

- [ ] Write the minimal implementation `bin/lib/recon/lenses/dependency-freshness.js`:

```js
const fs = require('fs');
const path = require('path');
const { makeFinding } = require('../finding');

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', '.claude-tweaks']);
const DEP_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function classify(range) {
  if (range === '*' || range === 'latest') return { kind: 'wildcard', severity: 'high' };
  if (/^x$/i.test(range.trim())) return { kind: 'x-range', severity: 'medium' };
  return null;
}

function* walkPkg(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkPkg(full);
    } else if (entry.isFile() && entry.name === 'package.json') {
      yield full;
    }
  }
}

function run(area, root) {
  const findings = [];
  for (const glob of area.globs) {
    const base = path.join(root, glob);
    try { fs.statSync(base); } catch { continue; }
    for (const pkgFile of walkPkg(base)) {
      let pkg;
      try { pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')); } catch { continue; }
      const pkgRel = path.relative(root, pkgFile);
      for (const section of DEP_SECTIONS) {
        const deps = pkg[section];
        if (!deps || typeof deps !== 'object') continue;
        for (const [name, range] of Object.entries(deps)) {
          const c = classify(String(range));
          if (!c) continue;
          findings.push(makeFinding({
            lens: 'dependency-freshness',
            category: c.severity === 'high' ? 'security' : 'convention',
            severity: c.severity,
            confidence: 'high',
            area: area.id,
            files: [pkgRel],
            signature: `dep-range ${name} ${c.kind}`,
            title: `Loose version range for "${name}" in ${pkgRel}`,
            evidence: `${pkgRel}: "${name}": "${range}" is a ${c.kind} range and installs whatever is current at install time.`,
            suggestion: `Pin "${name}" to a specific semver range (e.g. "^X.Y.Z") or an exact version.`,
            acceptance: `"${name}" specifies a semver range or exact pin and the lockfile is committed.`,
          }));
        }
      }
    }
  }
  return findings;
}

module.exports = { id: 'dependency-freshness', kind: 'mechanical', run };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/dependency-freshness.test.js`
      Expected: `# pass 3  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/lenses/dependency-freshness.js bin/lib/recon/tests/dependency-freshness.test.js && git commit -m "Add recon dependency-freshness lens"`

---

## Task 8 — project-command lens

Runs a project-configured lint/typecheck command (only when `config.command` is set), captures stdout even on non-zero exit, and maps a `config.parse(stdout)` result into findings. Defaults to no-op when unconfigured so a vanilla `run` never shells out.

**Files:**
- Create: `bin/lib/recon/lenses/project-command.js`
- Test: `bin/lib/recon/tests/project-command.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/project-command.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const lens = require('../lenses/project-command');

const AREA = { id: '.', globs: ['.'], flags: {} };

test('mechanical contract', () => {
  assert.strictEqual(lens.id, 'project-command');
  assert.strictEqual(lens.kind, 'mechanical');
});

test('no-op when no command is configured', () => {
  assert.deepStrictEqual(lens.run(AREA, process.cwd(), {}), []);
});

test('runs the command and maps parsed output to findings', () => {
  const findings = lens.run(AREA, process.cwd(), {
    command: 'printf "a.js:3 unused var\\n"',
    lensId: 'project-lint',
    parse: (out) => out.trim().split('\n').map((line) => ({
      files: [line.split(' ')[0]],
      signature: `lint ${line}`,
      title: 'Lint violation',
      evidence: line,
    })),
  });
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].lens, 'project-lint');
  assert.deepStrictEqual(findings[0].files, ['a.js:3']);
});

test('captures stdout from a non-zero exit and still parses it', () => {
  const findings = lens.run(AREA, process.cwd(), {
    command: 'printf "x.ts:1 boom\\n"; exit 1',
    parse: (out) => out.trim() ? [{ signature: 'lint x', title: 'v', evidence: out.trim() }] : [],
  });
  assert.strictEqual(findings.length, 1);
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/project-command.test.js`
      Expected: `Error: Cannot find module '../lenses/project-command'`.

- [ ] Write the minimal implementation `bin/lib/recon/lenses/project-command.js`:

```js
const { execSync } = require('child_process');
const { makeFinding } = require('../finding');

const DEFAULT_TIMEOUT_MS = 30000;

function run(area, root, config) {
  if (!config || !config.command) return [];
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
  const lensId = config.lensId || 'project-command';
  const category = config.category || 'convention';
  const severity = config.severity || 'medium';
  const parse = config.parse;

  let stdout = '';
  try {
    stdout = execSync(config.command, { cwd: root, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT' || (err.killed && err.signal)) {
      return [makeFinding({
        lens: lensId,
        category,
        severity: 'low',
        confidence: 'high',
        area: area.id,
        files: [],
        signature: `${lensId} timeout`,
        title: `Project command timed out after ${timeoutMs}ms`,
        evidence: `Command "${config.command}" was killed after ${timeoutMs}ms.`,
        suggestion: 'Increase config.timeoutMs or investigate why the command is slow.',
        acceptance: 'The command completes within the configured timeout.',
      })];
    }
    stdout = String(err.stdout || '');
  }

  if (!parse || !stdout.trim()) return [];
  return parse(stdout, { area, root }).map((p) => makeFinding({
    lens: lensId,
    category,
    severity,
    confidence: 'med',
    area: area.id,
    files: p.files || [],
    signature: p.signature || `${lensId} unknown`,
    title: p.title || `${lensId} violation`,
    evidence: p.evidence || stdout.trim(),
    suggestion: p.suggestion || 'Fix the violation reported by the configured command.',
    acceptance: p.acceptance || 'The configured command exits without reporting this violation.',
  }));
}

module.exports = { id: 'project-command', kind: 'mechanical', run };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/project-command.test.js`
      Expected: `# pass 4  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/lenses/project-command.js bin/lib/recon/tests/project-command.test.js && git commit -m "Add recon project-command lens"`

---

## Task 9 — Lens registry (`buildLenses`)

`buildLenses(config)` returns the active lens set. With no `config.enabledLenses` it returns all five mechanical lenses; with a list it returns only those ids in order. project-command is excluded from the default set (it needs explicit configuration) but included when named.

**Files:**
- Create: `bin/lib/recon/lenses/index.js`
- Test: `bin/lib/recon/tests/lenses-index.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/lenses-index.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildLenses, ALL_LENSES } = require('../lenses/index');

test('every lens satisfies the {id, kind:mechanical, run} contract', () => {
  for (const lens of ALL_LENSES) {
    assert.strictEqual(typeof lens.id, 'string');
    assert.strictEqual(lens.kind, 'mechanical');
    assert.strictEqual(typeof lens.run, 'function');
  }
});

test('default set excludes project-command (needs config)', () => {
  const ids = buildLenses({}).map((l) => l.id);
  assert.deepStrictEqual(ids, ['todo-comments', 'oversized-file', 'dead-export', 'dependency-freshness']);
});

test('enabledLenses selects by id, in order, including project-command', () => {
  const ids = buildLenses({ enabledLenses: ['project-command', 'todo-comments'] }).map((l) => l.id);
  assert.deepStrictEqual(ids, ['project-command', 'todo-comments']);
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/lenses-index.test.js`
      Expected: `Error: Cannot find module '../lenses/index'`.

- [ ] Write the minimal implementation `bin/lib/recon/lenses/index.js`:

```js
const todoComments = require('./todo-comments');
const oversizedFile = require('./oversized-file');
const deadExport = require('./dead-export');
const dependencyFreshness = require('./dependency-freshness');
const projectCommand = require('./project-command');

// Registry order is the default run order. project-command is registered but
// not in the default set (DEFAULT_IDS) because it requires explicit config.
const ALL_LENSES = [todoComments, oversizedFile, deadExport, dependencyFreshness, projectCommand];
const DEFAULT_IDS = ['todo-comments', 'oversized-file', 'dead-export', 'dependency-freshness'];

// Returns the active lens set. With config.enabledLenses (string[]), returns
// only those ids in the given order; otherwise the default mechanical set.
function buildLenses(config) {
  const enabled = config && Array.isArray(config.enabledLenses) && config.enabledLenses.length
    ? config.enabledLenses
    : DEFAULT_IDS;
  return enabled.map((id) => ALL_LENSES.find((l) => l.id === id)).filter(Boolean);
}

module.exports = { ALL_LENSES, DEFAULT_IDS, buildLenses };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/lenses-index.test.js`
      Expected: `# pass 3  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/lenses/index.js bin/lib/recon/tests/lenses-index.test.js && git commit -m "Add recon lens registry"`

---

## Task 10 — Cache (read/write the gitignored dedup cache)

`readCache(root)` returns the parsed cache or `{}` when absent. `writeCache(root, cache)` creates `<root>/.claude-tweaks/` and writes `recon-cache.json`. Shape `{ "<fingerprint>": {status:'open'|'wontfix'|'closed'|'remembered', issue:<number|null>} }`.

**Files:**
- Create: `bin/lib/recon/cache.js`
- Test: `bin/lib/recon/tests/cache.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/cache.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readCache, writeCache, cachePath } = require('../cache');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-cache-')); }

test('readCache returns {} when no cache file exists', () => {
  assert.deepStrictEqual(readCache(tmp()), {});
});

test('cachePath points at .claude-tweaks/recon-cache.json', () => {
  const root = tmp();
  assert.strictEqual(cachePath(root), path.join(root, '.claude-tweaks', 'recon-cache.json'));
});

test('writeCache then readCache round-trips and creates the dir', () => {
  const root = tmp();
  const cache = { 'recon-abc12345': { status: 'open', issue: 42 }, 'recon-deadbeef': { status: 'remembered', issue: null } };
  writeCache(root, cache);
  assert.ok(fs.existsSync(path.join(root, '.claude-tweaks', 'recon-cache.json')));
  assert.deepStrictEqual(readCache(root), cache);
});

test('readCache returns {} on corrupt JSON rather than throwing', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'recon-cache.json'), '{ not json');
  assert.deepStrictEqual(readCache(root), {});
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/cache.test.js`
      Expected: `Error: Cannot find module '../cache'`.

- [ ] Write the minimal implementation `bin/lib/recon/cache.js`:

```js
const fs = require('fs');
const path = require('path');

// Gitignored, rebuildable-from-issues dedup cache. Shape:
//   { "<fingerprint>": { status: 'open'|'wontfix'|'closed'|'remembered', issue: <number|null> } }
function cachePath(root) {
  return path.join(root, '.claude-tweaks', 'recon-cache.json');
}

function readCache(root) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(root), 'utf8'));
  } catch {
    return {}; // missing or corrupt -> empty (the cache is an optimization, not state)
  }
}

function writeCache(root, cache) {
  const p = cachePath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  return p;
}

module.exports = { cachePath, readCache, writeCache };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/cache.test.js`
      Expected: `# pass 4  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/cache.js bin/lib/recon/tests/cache.test.js && git commit -m "Add recon gitignored dedup cache"`

---

## Task 11 — Dedup decision (every transition)

`decide(finding, openIssues, cache)` → `{action:'skip'|'reopen'|'file'|'remember', issue?}`. `openIssues` is the list of `recon`-labelled GitHub issues, each `{number, state:'open'|'closed', labels:[...], fingerprint}` (fingerprint extracted by the skill from the issue body marker). Logic:

- fingerprint matches an **open** issue → `skip` (no flood), carry its `issue` number.
- fingerprint matches a **closed** issue → `reopen` (regressed), carry its `issue` number.
- fingerprint carries a **`wontfix`** label (open or closed) → `skip` (respect the standing decision).
- no issue match, cache says `wontfix` → `skip`.
- new (no issue, no wontfix cache), severity **≥ threshold** (default `high`) → `file`.
- new, severity **< threshold** → `remember`.

Test the full transition table (every branch). This is the dedup decision table the design §9 + §15 requires.

**Files:**
- Create: `bin/lib/recon/dedup.js`
- Test: `bin/lib/recon/tests/dedup.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/dedup.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { decide, SEVERITY_RANK } = require('../dedup');

const F = (over, sev = 'high') => ({ id: over, severity: sev });

test('SEVERITY_RANK orders critical highest', () => {
  assert.ok(SEVERITY_RANK.critical < SEVERITY_RANK.high);
  assert.ok(SEVERITY_RANK.high < SEVERITY_RANK.low);
});

test('open issue with same fingerprint -> skip', () => {
  const issues = [{ number: 7, state: 'open', labels: ['recon'], fingerprint: 'recon-aaa' }];
  assert.deepStrictEqual(decide(F('recon-aaa'), issues, {}), { action: 'skip', issue: 7 });
});

test('closed issue with same fingerprint -> reopen (regressed)', () => {
  const issues = [{ number: 8, state: 'closed', labels: ['recon'], fingerprint: 'recon-bbb' }];
  assert.deepStrictEqual(decide(F('recon-bbb'), issues, {}), { action: 'reopen', issue: 8 });
});

test('wontfix-labelled issue -> skip (standing decision)', () => {
  const issues = [{ number: 9, state: 'open', labels: ['recon', 'wontfix'], fingerprint: 'recon-ccc' }];
  assert.deepStrictEqual(decide(F('recon-ccc'), issues, {}), { action: 'skip', issue: 9 });
});

test('wontfix in cache, no issue -> skip', () => {
  assert.deepStrictEqual(decide(F('recon-ddd'), [], { 'recon-ddd': { status: 'wontfix', issue: null } }),
    { action: 'skip' });
});

test('new finding at/above threshold -> file', () => {
  assert.deepStrictEqual(decide(F('recon-eee', 'high'), [], {}), { action: 'file' });
  assert.deepStrictEqual(decide(F('recon-eee', 'critical'), [], {}), { action: 'file' });
});

test('new finding below threshold -> remember', () => {
  assert.deepStrictEqual(decide(F('recon-fff', 'medium'), [], {}), { action: 'remember' });
  assert.deepStrictEqual(decide(F('recon-fff', 'low'), [], {}), { action: 'remember' });
});

test('threshold is overridable', () => {
  assert.deepStrictEqual(decide(F('recon-ggg', 'medium'), [], {}, { threshold: 'medium' }), { action: 'file' });
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/dedup.test.js`
      Expected: `Error: Cannot find module '../dedup'`.

- [ ] Write the minimal implementation `bin/lib/recon/dedup.js`:

```js
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

// Decide what to do with a freshly-fingerprinted finding given the current set
// of recon-labelled GitHub issues and the local cache. Pure; no I/O, no network.
//   open issue       -> skip   (no flood)
//   closed issue     -> reopen (regressed)
//   wontfix label    -> skip   (standing decision)
//   wontfix in cache -> skip
//   new >= threshold -> file
//   new <  threshold -> remember
function decide(finding, openIssues, cache, opts) {
  const threshold = (opts && opts.threshold) || 'high';
  const match = (openIssues || []).find((i) => i.fingerprint === finding.id);
  if (match) {
    if ((match.labels || []).includes('wontfix')) return { action: 'skip', issue: match.number };
    if (match.state === 'closed') return { action: 'reopen', issue: match.number };
    return { action: 'skip', issue: match.number };
  }
  const cached = cache && cache[finding.id];
  if (cached && cached.status === 'wontfix') return { action: 'skip' };
  const rank = SEVERITY_RANK[finding.severity];
  const thresholdRank = SEVERITY_RANK[threshold];
  if (rank !== undefined && thresholdRank !== undefined && rank <= thresholdRank) return { action: 'file' };
  return { action: 'remember' };
}

module.exports = { decide, SEVERITY_RANK };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/dedup.test.js`
      Expected: `# pass 8  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/dedup.js bin/lib/recon/tests/dedup.test.js && git commit -m "Add recon dedup decision table"`

---

## Task 12 — Issue payload projection (emit-only)

`toIssuePayload(finding)` → `{title, body, labels}`. Body embeds the hidden marker `<!-- recon-fingerprint: <id> -->` (so the skill can re-extract the fingerprint when reading open issues for dedup) and `/specify`-shaped sections: Current State ← files + evidence, Deliverables ← suggestion, Acceptance Criteria ← acceptance. labels = `['recon', 'recon:' + severity]`. No network — this is a pure projection.

**Files:**
- Create: `bin/lib/recon/issue-payload.js`
- Test: `bin/lib/recon/tests/issue-payload.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/issue-payload.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { toIssuePayload } = require('../issue-payload');

const FINDING = {
  id: 'recon-abc12345',
  title: 'Oversized file: big.js (700 lines)',
  lens: 'oversized-file',
  category: 'architecture',
  severity: 'high',
  confidence: 'high',
  area: 'apps/web',
  files: ['apps/web/big.js'],
  evidence: 'apps/web/big.js has 700 lines, exceeding the 300-line threshold.',
  suggestion: 'Break big.js into smaller modules.',
  acceptance: 'No module exceeds 300 lines, or the threshold is documented.',
};

test('labels are recon + recon:<severity>', () => {
  assert.deepStrictEqual(toIssuePayload(FINDING).labels, ['recon', 'recon:high']);
});

test('title is the finding title', () => {
  assert.strictEqual(toIssuePayload(FINDING).title, 'Oversized file: big.js (700 lines)');
});

test('body embeds the fingerprint marker so it can be re-extracted for dedup', () => {
  const { body } = toIssuePayload(FINDING);
  assert.ok(body.includes('<!-- recon-fingerprint: recon-abc12345 -->'));
});

test('body carries /specify-shaped sections sourced from the finding', () => {
  const { body } = toIssuePayload(FINDING);
  assert.ok(body.includes('## Current State'));
  assert.ok(body.includes('apps/web/big.js'));                 // files
  assert.ok(body.includes('has 700 lines'));                   // evidence
  assert.ok(body.includes('## Deliverables'));
  assert.ok(body.includes('Break big.js into smaller modules.')); // suggestion
  assert.ok(body.includes('## Acceptance Criteria'));
  assert.ok(body.includes('No module exceeds 300 lines'));     // acceptance
});

// The marker is the dedup contract: the skill reads issue bodies and matches this.
test('the fingerprint can be re-extracted from the body with a stable regex', () => {
  const { body } = toIssuePayload(FINDING);
  const m = body.match(/<!--\s*recon-fingerprint:\s*(recon-[0-9a-f]{8})\s*-->/);
  assert.strictEqual(m[1], 'recon-abc12345');
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/issue-payload.test.js`
      Expected: `Error: Cannot find module '../issue-payload'`.

- [ ] Write the minimal implementation `bin/lib/recon/issue-payload.js`:

```js
// Project a finding into a GitHub issue payload. Emit-only: this never calls
// the network. The skill hands the payload to the gh CLI itself.
// The body is /specify-shaped so promotion is near-zero translation, and
// carries a hidden fingerprint marker the dedup step re-extracts.
function toIssuePayload(finding) {
  const marker = `<!-- recon-fingerprint: ${finding.id} -->`;
  const filesLine = (finding.files || []).length ? (finding.files || []).join(', ') : '(no specific file)';
  const body = [
    marker,
    '',
    `**Lens:** ${finding.lens} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence} | **Area:** ${finding.area}`,
    '',
    '## Current State',
    '',
    `Files: ${filesLine}`,
    '',
    finding.evidence,
    '',
    '## Deliverables',
    '',
    finding.suggestion,
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
    labels: ['recon', `recon:${finding.severity}`],
  };
}

module.exports = { toIssuePayload };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/issue-payload.test.js`
      Expected: `# pass 5  # fail 0`.

- [ ] Commit: `git add bin/lib/recon/issue-payload.js bin/lib/recon/tests/issue-payload.test.js && git commit -m "Add recon GitHub issue payload projection"`

---

## Task 13 — `bin/recon.js` CLI + `run` command (orchestration + idempotency)

The CLI wires the helpers: parse args → `detectAreas` → `selectAreas` → for each area run `buildLenses` → assign `fingerprint` ids → `decide` against open issues (from `--issues <file>` JSON, optional) + cache → emit a plan to stdout. On `file`/`remember`/`reopen`, update the cache. On `--dry-run`, emit the plan and emitted payloads but write nothing (no cache write). Idempotency (design §15): a second `run` against unchanged state, with the first run's filed findings recorded in the cache (or present as open issues), files zero new issues.

`run` output is a JSON object on stdout: `{ runId, areas:[...], plan:[{fingerprint, action, severity, title, payload?}], summary:{file, remember, reopen, skip} }`. The skill reads this, then itself calls `gh issue create/reopen` for the `file`/`reopen` entries.

`openIssues` JSON shape (from `--issues`): `[{number, state, labels, fingerprint}]`. When omitted, dedup runs against the cache only.

**Files:**
- Create: `bin/recon.js`
- Test: `bin/lib/recon/tests/cli-run.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/cli-run.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js'); // bin/recon.js

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-cli-')); }
function runCli(args, root) {
  const out = execFileSync('node', [CLI, 'run', '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(out);
}

test('run on a repo with a high-severity finding plans to file an issue', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'big.js'), 'x\n'.repeat(700)); // oversized -> high
  const res = runCli(['--area', '.'], root);
  const filed = res.plan.filter((p) => p.action === 'file');
  assert.ok(filed.length >= 1);
  assert.ok(filed[0].fingerprint.startsWith('recon-'));
  assert.ok(filed[0].payload.labels.includes('recon'));
  // cache was written (not a dry run)
  assert.ok(fs.existsSync(path.join(root, '.claude-tweaks', 'recon-cache.json')));
});

test('--dry-run writes no cache and files nothing to disk', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'big.js'), 'x\n'.repeat(700));
  const res = runCli(['--area', '.', '--dry-run'], root);
  assert.ok(res.plan.some((p) => p.action === 'file'));
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'recon-cache.json')), false);
});

// IDEMPOTENCY (design §15): second run files zero new issues.
test('a second run against unchanged state files nothing new', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'big.js'), 'x\n'.repeat(700));
  const first = runCli(['--area', '.'], root);
  const filedFirst = first.summary.file;
  assert.ok(filedFirst >= 1);
  // Simulate the issue now being open: feed the filed fingerprints back as open issues.
  const fps = first.plan.filter((p) => p.action === 'file').map((p) => p.fingerprint);
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify(fps.map((fp, n) => ({ number: n + 1, state: 'open', labels: ['recon'], fingerprint: fp }))));
  const second = runCli(['--area', '.', '--issues', issuesFile], root);
  assert.strictEqual(second.summary.file, 0);
  assert.ok(second.summary.skip >= filedFirst);
});

// SELF-POLLUTION (PORT.md delta #2) end-to-end: a "." run ignores its own cache dir.
test('a default "." run does not re-report findings from its own .claude-tweaks output', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), '// TODO: real source todo\n');
  runCli(['--area', '.'], root); // writes .claude-tweaks/recon-cache.json
  const second = runCli(['--area', '.'], root);
  // No finding should reference a file under .claude-tweaks
  const polluted = second.plan.filter((p) => p.payload && p.payload.body.includes('.claude-tweaks'));
  assert.strictEqual(polluted.length, 0);
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/cli-run.test.js`
      Expected: `Error: Cannot find module ... recon.js` (or a non-zero `execFileSync` because the CLI does not exist).

- [ ] Write the minimal implementation `bin/recon.js`:

```js
#!/usr/bin/env node
const fs = require('fs');
const { detectAreas, selectAreas } = require('./lib/recon/areas');
const { buildLenses } = require('./lib/recon/lenses/index');
const { fingerprint } = require('./lib/recon/fingerprint');
const { readCache, writeCache } = require('./lib/recon/cache');
const { decide } = require('./lib/recon/dedup');
const { toIssuePayload } = require('./lib/recon/issue-payload');

function parseArgs(argv) {
  const args = { _: [], root: process.cwd(), dryRun: false, runId: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--area') args.area = argv[++i];
    else if (a === '--issues') args.issues = argv[++i];
    else if (a === '--run-id') args.runId = argv[++i];
    else args._.push(a);
  }
  return args;
}

function loadOpenIssues(file) {
  if (!file) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

function cmdRun(args) {
  const cfg = {}; // Phase 1: default lens set; project-command stays opt-in
  const areas = selectAreas(detectAreas(args.root), { area: args.area });
  const lenses = buildLenses(cfg);
  const openIssues = loadOpenIssues(args.issues);
  const cache = readCache(args.root);

  const plan = [];
  const summary = { file: 0, remember: 0, reopen: 0, skip: 0 };

  for (const area of areas) {
    for (const lens of lenses) {
      for (const finding of lens.run(area, args.root, cfg[lens.id])) {
        finding.id = fingerprint({
          lens: finding.lens,
          areaId: finding.area,
          signature: finding.signature,
          file: finding.files[0],
        });
        const decision = decide(finding, openIssues, cache);
        summary[decision.action] = (summary[decision.action] || 0) + 1;
        const entry = { fingerprint: finding.id, action: decision.action, severity: finding.severity, title: finding.title };
        if (decision.issue !== undefined) entry.issue = decision.issue;
        if (decision.action === 'file' || decision.action === 'reopen') {
          entry.payload = toIssuePayload(finding);
          cache[finding.id] = { status: 'open', issue: decision.issue || null };
        } else if (decision.action === 'remember') {
          if (!cache[finding.id]) cache[finding.id] = { status: 'remembered', issue: null };
        }
        plan.push(entry);
      }
    }
  }

  if (!args.dryRun) writeCache(args.root, cache);

  process.stdout.write(JSON.stringify({
    runId: args.runId,
    dryRun: args.dryRun,
    areas: areas.map((a) => a.id),
    plan,
    summary,
  }, null, 2) + '\n');
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'run') return cmdRun(args);
  process.stderr.write('usage: recon.js run [--area <path>] [--dry-run] [--root <dir>] [--issues <file>]\n');
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdRun, main };
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/cli-run.test.js`
      Expected: `# pass 4  # fail 0`.

- [ ] Run the full recon suite to confirm no cross-module breakage: `node --test bin/lib/recon/tests/*.test.js`
      Expected: all recon tests pass (`# fail 0`).

- [ ] Commit: `git add bin/recon.js bin/lib/recon/tests/cli-run.test.js && git commit -m "Add recon CLI run command with dedup, dry-run, and idempotency"`

---

## Task 14 — Test discovery (root package.json) + .gitignore carve-out

`node --test bin/lib/recon/tests/*.test.js` works but the repo convention is `node --test tests/`, which will not discover `bin/lib/recon/tests/`. Add a root `package.json` with a `test` script that globs both locations, and ensure the cache is gitignored.

**Files:**
- Create: `package.json` (root)
- Modify: `.gitignore`

Steps:

- [ ] Verify the existing repo tests still pass before touching discovery: `node --test tests/ bin/lib/recon/tests/*.test.js`
      Expected: all pass.

- [ ] Create root `package.json`:

```json
{
  "name": "claude-tweaks",
  "private": true,
  "version": "4.18.0",
  "description": "claude-tweaks plugin — test harness only; the plugin itself ships no runtime npm deps.",
  "scripts": {
    "test": "node --test tests/*.test.js bin/lib/recon/tests/*.test.js"
  }
}
```

- [ ] Modify `.gitignore` — add the cache carve-out under the existing `.claude-tweaks/` lines. Current `.gitignore` ignores only `.claude-tweaks/research/`, so the cache needs an explicit rule. Add:

```
.claude-tweaks/recon-cache.json
```

- [ ] Run the package script to confirm unified discovery: `npm test`
      Expected: every test under `tests/` and `bin/lib/recon/tests/` runs and passes (`# fail 0`).

- [ ] Commit: `git add package.json .gitignore && git commit -m "Add unified test discovery and gitignore recon cache"`

---

## Task 15 — `skills/recon/SKILL.md`

The skill is the orchestrator and the human-facing contract. It tells Claude: run `recon.js run --dry-run` first (smoke), then `run`, read the emitted JSON plan, and for each `file`/`reopen` entry call the `gh` CLI itself (`gh issue create` / `gh issue reopen`). `recon.js` never touches the network. Must follow the house structure exactly (frontmatter, interaction directive, H1 + one-liner, lifecycle diagram, When to Use, Input, workflow Steps, Anti-Patterns, Component-Skill Contract keyed on `$PIPELINE_RUN_DIR`, Relationship table, Next Actions). Placement: Next Actions before Component-Skill Contract before Anti-Patterns before Relationship table — per CLAUDE.md.

**Files:**
- Create: `skills/recon/SKILL.md`
- Test: `bin/lib/recon/tests/skill-md.test.js`

Steps:

- [ ] Write the failing test `bin/lib/recon/tests/skill-md.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL = path.resolve(__dirname, '..', '..', '..', '..', 'skills', 'recon', 'SKILL.md');
const read = () => fs.readFileSync(SKILL, 'utf8');

test('frontmatter declares the canonical name', () => {
  assert.match(read(), /name:\s*claude-tweaks:recon/);
});

test('carries the standard interaction-style directive', () => {
  assert.ok(read().includes('> **Interaction style:**'));
});

test('invokes the CLI via ${CLAUDE_PLUGIN_ROOT}/bin/recon.js (not $SKILL_DIR)', () => {
  const body = read();
  assert.ok(body.includes('${CLAUDE_PLUGIN_ROOT}/bin/recon.js'));
  assert.ok(!body.includes('$SKILL_DIR'), 'must not use the non-existent $SKILL_DIR variable (PORT.md delta #9)');
});

test('documents the dry-run-first then run procedure and hands payloads to gh', () => {
  const body = read();
  assert.ok(body.includes('--dry-run'));
  assert.ok(/gh issue create/.test(body));
});

test('has the required house sections in order', () => {
  const body = read();
  const idx = (s) => body.indexOf(s);
  assert.ok(idx('## When to Use') > 0);
  assert.ok(idx('## Anti-Patterns') > 0);
  assert.ok(idx('## Component-Skill Contract') > 0);
  assert.ok(idx('## Relationship to Other Skills') > 0);
  assert.ok(idx('## Next Actions') > 0);
  // Next Actions before Component-Skill Contract before Anti-Patterns before Relationship
  assert.ok(idx('## Next Actions') < idx('## Component-Skill Contract'));
  assert.ok(idx('## Component-Skill Contract') < idx('## Anti-Patterns'));
  assert.ok(idx('## Anti-Patterns') < idx('## Relationship to Other Skills'));
});

test('Component-Skill Contract is keyed on $PIPELINE_RUN_DIR', () => {
  assert.ok(read().includes('$PIPELINE_RUN_DIR'));
});

test('Relationship table references specify, capture, tidy, flow', () => {
  const body = read();
  for (const s of ['/claude-tweaks:specify', '/claude-tweaks:capture', '/claude-tweaks:tidy', '/claude-tweaks:flow']) {
    assert.ok(body.includes(s), `missing relationship to ${s}`);
  }
});
```

- [ ] Run it and confirm it fails: `node --test bin/lib/recon/tests/skill-md.test.js`
      Expected: `ENOENT ... skills/recon/SKILL.md` (file does not exist).

- [ ] Write `skills/recon/SKILL.md` (real content, no placeholders):

```markdown
---
name: claude-tweaks:recon
description: Use when you want a proactive, report-only sweep of a repository that surfaces improvement opportunities and files them as deduplicated GitHub issues. Mechanical lenses only in Phase 1 — oversized files, dead exports, TODO/FIXME, loose dependency ranges, project lint/typecheck. Never edits code. Keywords - recon, sweep, repo audit, technical debt, proactive, github issues.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Recon — Proactive, Report-Only Repo-Improvement Finder

A recurring watchman doing rounds: applies mechanical improvement lenses to a repo, fingerprints each finding, dedups against open GitHub issues, and files the work worth doing as deduplicated GitHub issues. It never edits code.

```
                      [ /claude-tweaks:recon ] ← utility (no fixed lifecycle position)
                                   │  surfaces the work worth making
                                   ▼
   findings → file GitHub issue (label: recon) → /claude-tweaks:specify → /claude-tweaks:build / /claude-tweaks:flow
            └ fuzzy / not-yet → /claude-tweaks:capture (INBOX)
```

The plugin reacts to changes you make; `/recon` surfaces the changes worth making.

## When to Use

- You want a periodic, hands-off pass that keeps technical debt visible without driving each scan.
- You want machine-found improvements filed as GitHub issues that drop into `/specify` with near-zero translation.
- You want to dedup against work already tracked — never re-flood the tracker.

Not for: auto-fixing (report-only), CI gating (CI stays reactive), or replacing INBOX/specs (recon owns no backlog — it routes findings into the stores that already exist).

## Input

- `$ARGUMENTS` may contain:
  - `--area <path>` — scope the run to one area (default: all detected areas).
  - `--dry-run` — emit the plan but write nothing (cache untouched, no issues filed). Use for the smoke check.
  - `--root <dir>` — scan a project elsewhere (default: current directory).

## Workflow

1. **Smoke (dry-run).** Confirm the engine runs and see what it would do, writing nothing:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" run --dry-run
   ```

   Read the JSON plan. If it errors, stop and report — do not proceed to a real run.

2. **Gather open issues for dedup.** Read the fingerprints of existing `recon`-labelled issues so the engine can skip/reopen correctly:

   ```bash
   gh issue list --label recon --state all --json number,state,labels,body --limit 500 > /tmp/recon-issues.json
   ```

   Transform each issue into `{number, state, labels, fingerprint}` by extracting the `<!-- recon-fingerprint: recon-XXXXXXXX -->` marker from its body, and write the array to a file (e.g. `/tmp/recon-open.json`). If `gh` is unavailable, skip this step — the run dedups against the local cache only.

3. **Run.** Produce the plan and update the dedup cache:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" run --issues /tmp/recon-open.json
   ```

4. **File / reopen issues yourself.** For each plan entry, act per its `action` — `recon.js` only emits payloads; it never calls the network:
   - `file` → `gh issue create --title "<payload.title>" --body "<payload.body>" --label recon --label "recon:<severity>"`
   - `reopen` → `gh issue reopen <entry.issue>` and add a "regressed" comment.
   - `skip` / `remember` → do nothing (already tracked, or below threshold and remembered in the cache).

5. **Summarize.** Report the counts (`filed`, `reopened`, `skipped`, `remembered`) and list the new issue URLs. In interactive mode, present findings as a batch table and let the user route each to *file issue / INBOX (`/capture`) / `/specify` / dismiss*.

> Routines run inside the subscription; verify any automation-credit specifics against the live account before relying on scheduled runs (the Routine trigger is Phase 3, not this skill).

## Next Actions

1. `/claude-tweaks:specify <issue-url-or-title>` — promote a filed recon issue into an agent-sized spec. **(Recommended when high-severity issues were filed.)**
2. `/claude-tweaks:capture <finding>` — park a fuzzy or below-threshold finding in INBOX for later triage.
3. `node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" run --area <path>` — re-run scoped to a single area to dig deeper.
4. `/claude-tweaks:tidy` — fold the new issues into a backlog-hygiene pass alongside INBOX and deferred items.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:recon` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Editing code to "just fix" a finding during a recon run | Recon is report-only. Fixing belongs to `/build` / `/flow` after a finding is promoted to a spec. |
| Filing every finding regardless of severity | Floods the tracker. Below-threshold findings are remembered in the cache, not filed. |
| Re-filing a finding that already has an open issue | Duplicates the tracker. Always dedup against open `recon` issues (Step 2) before filing. |
| Calling the network from `recon.js` | The engine is emit-only and unit-testable. The skill hands payloads to `gh`; the engine never does. |
| Treating the cache as durable state | The cache is a rebuildable optimization. GitHub issue state is the source of truth for cross-run memory. |
| Using `$SKILL_DIR` to invoke the CLI | `$SKILL_DIR` is not set by Claude Code. Always use `${CLAUDE_PLUGIN_ROOT}/bin/recon.js`. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:specify` | Recon findings are pre-specs — a filed `recon` issue body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so `/specify` consumes it with near-zero translation. |
| `/claude-tweaks:capture` | Fuzzy or below-threshold findings route to INBOX via `/capture` instead of inflating the tracker. |
| `/claude-tweaks:tidy` | `/tidy` audits the backlog (INBOX, deferred, specs); recon-filed issues are another input it can fold into a hygiene pass. |
| `/claude-tweaks:flow` | Phase 3 adds a `/flow` affordance to pull a batch of open `recon`-labelled issues, route each through `/specify`, and execute the pipeline. Until then, promote issues to specs manually. |
```

- [ ] Run it and confirm it passes: `node --test bin/lib/recon/tests/skill-md.test.js`
      Expected: `# pass 8  # fail 0`.

- [ ] Commit: `git add skills/recon/SKILL.md bin/lib/recon/tests/skill-md.test.js && git commit -m "Add /recon skill"`

---

## Task 16 — Bidirectional back-references (specify, capture, tidy, flow)

CLAUDE.md requires every Relationship reference to be bidirectional. `/recon`'s table references the four skills; each must gain a `/recon` row.

**Files:**
- Modify: `skills/specify/SKILL.md`, `skills/capture/SKILL.md`, `skills/tidy/SKILL.md`, `skills/flow/SKILL.md`

Steps:

- [ ] In `skills/specify/SKILL.md`, add to the Relationship table (after the `/claude-tweaks:research` row):

```markdown
| `/claude-tweaks:recon` | `/recon` files improvement findings as `recon`-labelled GitHub issues whose body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria); `/specify` promotes such an issue into an agent-sized spec with near-zero translation. |
```

- [ ] In `skills/capture/SKILL.md`, add to the Relationship table (after the `/claude-tweaks:research` row):

```markdown
| `/claude-tweaks:recon` | `/recon` routes fuzzy or below-threshold findings to INBOX via `/capture` instead of filing a GitHub issue, so they get human triage before promotion. |
```

- [ ] In `skills/tidy/SKILL.md`, add to the Relationship table (after the `/claude-tweaks:ledger` row):

```markdown
| `/claude-tweaks:recon` | `/recon` files improvement findings as `recon`-labelled GitHub issues; `/tidy` can fold those issues into a backlog-hygiene pass alongside INBOX, deferred items, and specs. |
```

- [ ] In `skills/flow/SKILL.md`, add to the Relationship table (after the `/claude-tweaks:journeys` row):

```markdown
| `/claude-tweaks:recon` | Phase 3 adds a `/flow` affordance to pull a batch of open `recon`-labelled issues, route each through `/specify`, and execute the pipeline (reusing multi-spec batching + the Review Console). Not yet wired in Phase 1 — `/recon`-filed issues are promoted to specs manually for now. |
```

- [ ] Verify all four references resolve both ways: `grep -rl "claude-tweaks:recon" skills/specify/SKILL.md skills/capture/SKILL.md skills/tidy/SKILL.md skills/flow/SKILL.md`
      Expected: all four paths listed.

- [ ] Commit: `git add skills/specify/SKILL.md skills/capture/SKILL.md skills/tidy/SKILL.md skills/flow/SKILL.md && git commit -m "Add bidirectional /recon relationship back-references"`

---

## Task 17 — Version bump + CLAUDE.md doc-sync

Bump the plugin version, update the test-command note and skill catalog in CLAUDE.md. The marketplace mirror is a separate-repo task (see final step).

**Files:**
- Modify: `.claude-plugin/plugin.json`, `CLAUDE.md`

Steps:

- [ ] In `.claude-plugin/plugin.json`, change `"version": "4.17.0"` to `"version": "4.18.0"`.

- [ ] In `CLAUDE.md`, update the header line `containing markdown skill files ... (v4.17.0)` to `(v4.18.0)`.

- [ ] In `CLAUDE.md`, the "Stack" / structure section: under **Utility** skill directories, add `recon` to the list and update the count (`### Skill directories (22 total)` → `(23 total)`). Add a `recon` row to the "Skills with sub-files" table only if it had sub-files — Phase 1 has none, so instead add `recon` to the plain skill catalog line under Utility.

- [ ] In `CLAUDE.md`, update the test-command note. The `## Commands` block currently shows `node --test tests/`. Add a line documenting the new location:

```bash
npm test                            # Runs node --test over tests/ AND bin/lib/recon/tests/
node --test bin/lib/recon/tests/*.test.js   # Recon unit suite only
```

- [ ] Run the full suite to confirm nothing regressed: `npm test`
      Expected: `# fail 0`.

- [ ] Commit: `git add .claude-plugin/plugin.json CLAUDE.md && git commit -m "Bump 4.18.0 — add /recon Phase 1 spine (mechanical lenses)"`

- [ ] **Marketplace mirror (separate repo — final task, do not skip).** In `thomasholknielsen/claude-tweaks-marketplace`, edit `.claude-plugin/marketplace.json`: set `plugins[].version` to `4.18.0` (mirrors this plugin), bump `metadata.version` per the marketplace's own scheme, and align `plugins[].description` with `plugin.json`. Commit + push `main`. (This is a checklist reminder; it touches a repo outside this plan's working tree. If the marketplace repo is not checked out in this session, note it as a follow-up rather than failing the plan.)

---

## Self-Review

**Spec coverage (Phase 1 scope, design §13 "Phase 1 — Spine"):**

| Phase 1 requirement | Covered by | 
|---------------------|-----------|
| Mechanical lenses only (no LLM) | Tasks 4-9 — todo, oversized, dead-export, dependency-freshness, project-command + registry. No judgment lenses. |
| Fingerprint + dedup | Task 2 (fingerprint, corrected), Task 11 (dedup decision table, every transition per §9/§15). |
| GitHub issue payload projection (emit-only) | Task 12 — `toIssuePayload`, marker + `/specify`-shaped body, `['recon','recon:'+severity]` labels; design §8. Engine never calls network (Task 13 + SKILL Anti-Pattern). |
| Gitignored dedup cache | Task 10 (`cache.js`, shape `{fingerprint:{status,issue}}`), Task 14 (`.gitignore` carve-out). |
| On-demand `run` + `--dry-run` | Task 13 — CLI `run [--area] [--dry-run] [--root]`, defaults `--root` to cwd. |
| SKILL.md | Task 15 — full house structure, `${CLAUDE_PLUGIN_ROOT}` invocation, gh handoff. |
| Bidirectional back-references | Task 16 — specify, capture, tidy, flow each get a `/recon` row. |
| Test discovery | Task 14 — root `package.json` globs both test dirs; CLAUDE.md note (Task 17). |
| Version + marketplace | Task 17 — 4.17.0 → 4.18.0 + marketplace mirror reminder. |
| Salvaged-bug regressions | Task 2 (fingerprint line-move stability, PORT.md #1), Task 4 + Task 13 (self-pollution guard, PORT.md #2), Task 15 (`$SKILL_DIR`→`${CLAUDE_PLUGIN_ROOT}`, PORT.md #9). |

**Out of scope (correctly deferred):** judgment lenses (Phase 2), Routine trigger (Phase 3), `/flow` pull-issues affordance (Phase 3 — only a forward-looking Relationship row added now), area scoring/round-robin (`selectAreas` is pass-through; Phase 3), regression-reopen comments beyond the basic `reopen` action, churn metric. The `reopen` *action* is implemented (dedup returns it) since it is a single transition in the decision table, but the SKILL only adds a "regressed" comment manually — no automated churn tracking.

**Placeholder scan:** every code step contains complete, runnable code. No `...`, `TODO`, or "fill in" markers in any implementation block. Every test asserts concrete values. Every command is exact and copy-pasteable.

**Type/signature consistency with the cross-plan contract:**
- `bin/recon.js` — `run [--area] [--dry-run] [--root]` (+ `--issues` added as the Phase 1 mechanism to feed GitHub issue state without a network call; documented in Task 13 and the SKILL). ✓
- `detectAreas(root) -> [{id, globs, flags}]`, `selectAreas(areas, opts) -> areas` ✓ (Task 3; note the shape is `{id, globs, flags}` per the contract, not the salvaged `{id, path}`).
- `fingerprint({lens, areaId, signature}) -> "recon-<8hex>"` ✓ (Task 2; accepts optional `file` per the corrected bug — strips trailing `:line(:col)` before hashing).
- `buildLenses(config) -> [lens]`; lens = `{id, kind:'mechanical', run(area, root) -> [finding]}` ✓ (Tasks 4-9; `run` also accepts an optional third `config` arg for oversized threshold / project-command — additive, does not break the two-arg contract).
- five lens files at the contracted paths ✓ (Tasks 4-8) — note `dependency-freshness.js` (contract name), not the salvaged `stale-dependency.js`.
- `readCache(root)`, `writeCache(root, cache)`; file at `<root>/.claude-tweaks/recon-cache.json`; shape `{fingerprint:{status,issue}}` ✓ (Task 10).
- `decide(finding, openIssues, cache) -> {action:'skip'|'reopen'|'file'|'remember', issue?}` ✓ (Task 11; optional 4th `opts` arg for threshold — additive).
- `toIssuePayload(finding) -> {title, body, labels}` with fingerprint marker + `/specify` sections + `['recon','recon:'+severity]` ✓ (Task 12).
- Finding shape defined once in `finding.js` and reused by every lens ✓ (Task 1).
- Tests at `bin/lib/recon/tests/*.test.js`, run via `node --test bin/lib/recon/tests/*.test.js` and `npm test` ✓ (Task 14).

**Cross-plan concern:** the contract listed `fingerprint({lens, areaId, signature})` without a `file` parameter, but the corrected bug (PORT.md #1) *requires* `file` to be passed and normalized — Task 2 accepts `file` as an optional fourth field and the CLI (Task 13) passes `finding.files[0]`. Phase 2/3 callers must pass `file` for stability across line moves; passing only `{lens, areaId, signature}` still works (file defaults to empty) but loses the line-move stability guarantee for file-anchored lenses. Phases 2-3 should treat `file` as part of the fingerprint input.
