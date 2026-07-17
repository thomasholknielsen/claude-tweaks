# Docs-Health Expansion, Wrap-Up Integration, and Genre Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend docs-health's judgment with findability, placement-fit, and freshness-dependency signals; wire the docs-health judge inline into `/claude-tweaks:wrap-up`; and ship a unified 6-genre doc-template library consumed by `/claude-tweaks:init` and `/claude-tweaks:wrap-up`.

**Architecture:** Two new pure-function mechanical helpers (`findability.js`, `freshness.js`) feed new/strengthened dimensions in the shared criteria fragment; `/claude-tweaks:wrap-up` gains a new sub-file that applies that fragment inline to touched docs (reusing the existing `_shared/harness-health-analysis.md` reuse pattern) and detects missing documentation from the diff; a new shared template file consolidates two already-existing templates (ADR, Journey) with four newly-authored ones (Tutorial, How-To, Reference, Explanation).

**Tech Stack:** Node.js (`node --test`), no new dependencies — matches the existing `bin/lib/docs-health/*` module style exactly (`fs`, `path`, `child_process.execFileSync`, no external packages).

## Global Constraints

- Reuse the existing `files:` frontmatter field (already used by `journeys/journey-template.md` for `/review`'s regression detection) for freshness-dependencies — never introduce a competing `tracks:` field.
- Findability's inbound-reference search is scoped to `docs/**`, `README.md`, and `CLAUDE.md` only — never a whole-repo grep.
- Freshness-dependencies are whole-doc frontmatter, not per-section/per-diagram inline comments.
- No new `category` value beyond `"findability"` — placement-fit stays `"genre-drift"`, freshness-deps stays `"staleness"`.
- ADR and Journey templates are **migrated** into the new shared file, not duplicated — their original files keep only their non-template content (gate/location-convention for ADR; key-principles/file-location for Journey) plus a pointer to the shared file.
- `/claude-tweaks:wrap-up`'s new docs-health check routes `additive` findings into the existing Step 6 `[doc]` batch table (applied inline in Step 10) and `restructural` findings as filed `by:docs-health` GitHub issues — never the reverse, never auto-applied without the existing approval gate.
- `/claude-tweaks:init` never writes doc content itself, for missing docs or missing landing pages — both stay backlog-only, matching its existing "fast-start" behavior.
- No portal/site-generator, no linting/formatting enforcement — explicitly out of scope for this plan.

---

### Task 1: Findability mechanical helper

**Files:**
- Create: `bin/lib/docs-health/findability.js`
- Test: `bin/lib/docs-health/tests/findability.test.js`

**Interfaces:**
- Produces: `computeInboundReferences(docId, root) -> { count: number, referencedBy: string[] }` — `docId` is a doc's id relative to `docs/`, no `.md` extension (matches the `target.id` shape from `bin/lib/docs-health/scope.js#listDocs`). `referencedBy` entries are paths relative to `root`.

- [ ] **Step 1: Write the failing tests**

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeInboundReferences } = require('../findability');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-findability-'));
}

test('counts zero references for an orphan doc', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs', 'guides'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'guides', 'orphan.md'), '# Orphan\n\nNo one links here.\n');
  const result = computeInboundReferences('guides/orphan', root);
  assert.strictEqual(result.count, 0);
  assert.deepStrictEqual(result.referencedBy, []);
});

test('counts a reference from another doc', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs', 'guides'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'guides', 'target.md'), '# Target\n');
  fs.writeFileSync(path.join(root, 'docs', 'guides', 'index.md'), '# Guides\n\nSee [target](target.md).\n');
  const result = computeInboundReferences('guides/target', root);
  assert.strictEqual(result.count, 1);
  assert.deepStrictEqual(result.referencedBy, [path.join('docs', 'guides', 'index.md')]);
});

test('counts a reference from README.md', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'setup.md'), '# Setup\n');
  fs.writeFileSync(path.join(root, 'README.md'), 'See [setup](docs/setup.md) for details.\n');
  const result = computeInboundReferences('setup', root);
  assert.strictEqual(result.count, 1);
  assert.deepStrictEqual(result.referencedBy, ['README.md']);
});

test('counts a reference from CLAUDE.md', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'conventions.md'), '# Conventions\n');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'See docs/conventions.md for details.\n');
  const result = computeInboundReferences('conventions', root);
  assert.strictEqual(result.count, 1);
  assert.deepStrictEqual(result.referencedBy, ['CLAUDE.md']);
});

test('excludes the doc itself from its own reference count', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'self.md'), '# Self\n\nself.md is this file.\n');
  const result = computeInboundReferences('self', root);
  assert.strictEqual(result.count, 0);
});

test('counts references from multiple files', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'target.md'), '# Target\n');
  fs.writeFileSync(path.join(root, 'docs', 'a.md'), 'Link to [target](target.md).\n');
  fs.writeFileSync(path.join(root, 'docs', 'b.md'), 'Also see [target](target.md).\n');
  const result = computeInboundReferences('target', root);
  assert.strictEqual(result.count, 2);
});

test('returns zero when docs/ does not exist yet', () => {
  const root = makeTmpRoot();
  fs.writeFileSync(path.join(root, 'README.md'), 'Nothing here yet.\n');
  const result = computeInboundReferences('missing-doc', root);
  assert.strictEqual(result.count, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/docs-health/tests/findability.test.js`
Expected: FAIL with `Cannot find module '../findability'`

- [ ] **Step 3: Write the implementation**

```javascript
'use strict';
const fs = require('fs');
const path = require('path');

// Recursively collects .md files under `dir` into `results`. No dotfile
// skip needed here (unlike scope.js's listDocs) — findability only ever
// walks docs/, which has no dotfile subdirectories in practice, and a
// stray one would just be harmlessly searched too.
function walkMarkdownFiles(dir, results) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

// Counts how many files under docs/**, README.md, or CLAUDE.md — the
// actual places a human or agent would navigate from — mention this
// doc's filename. A mechanical, repo-scoped signal; the JUDGE step in
// docs-health/SKILL.md decides whether a near-zero count means a genuine
// orphan or an intentionally standalone doc.
function computeInboundReferences(docId, root) {
  const docPath = path.join(root, 'docs', `${docId}.md`);
  const basename = path.basename(docPath);

  const candidates = [];
  const docsDir = path.join(root, 'docs');
  if (fs.existsSync(docsDir)) walkMarkdownFiles(docsDir, candidates);
  const readme = path.join(root, 'README.md');
  if (fs.existsSync(readme)) candidates.push(readme);
  const claudeMd = path.join(root, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) candidates.push(claudeMd);

  const referencedBy = [];
  for (const file of candidates) {
    if (path.resolve(file) === path.resolve(docPath)) continue;
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (content.includes(basename)) {
      referencedBy.push(path.relative(root, file));
    }
  }
  return { count: referencedBy.length, referencedBy };
}

module.exports = { computeInboundReferences };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/docs-health/tests/findability.test.js`
Expected: PASS (7 tests, 0 failures)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/docs-health/findability.js bin/lib/docs-health/tests/findability.test.js
git commit -m "Add docs-health findability mechanical helper"
```

---

### Task 2: Freshness-dependencies mechanical helper

**Files:**
- Create: `bin/lib/docs-health/freshness.js`
- Test: `bin/lib/docs-health/tests/freshness.test.js`

**Interfaces:**
- Produces: `parseFilesField(content) -> string[]` — repo-relative paths declared in a doc's `files:` frontmatter list, `[]` if absent.
- Produces: `checkTrackedFreshness(content, root, sinceTimestamp) -> { stale: [{path, lastChangedMs}], missing: string[] }` — `sinceTimestamp` is epoch ms or `null` (never audited; nothing is flagged stale against a null baseline).
- Consumes: nothing from Task 1 (independent helper).

- [ ] **Step 1: Write the failing tests**

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseFilesField, checkTrackedFreshness } = require('../freshness');

function makeTmpGitRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-freshness-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  return root;
}

function commitFile(root, relPath, contents) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  execFileSync('git', ['add', relPath], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', `commit ${relPath}`], { cwd: root });
}

function commitTimestampMs(root, relPath) {
  const out = execFileSync('git', ['-C', root, 'log', '-1', '--format=%ct', '--', relPath], { encoding: 'utf8' }).trim();
  return parseInt(out, 10) * 1000;
}

test('parseFilesField returns declared paths', () => {
  const content = '---\nfiles:\n  - src/a.ts\n  - src/b.ts\n---\n\n# Doc\n';
  assert.deepStrictEqual(parseFilesField(content), ['src/a.ts', 'src/b.ts']);
});

test('parseFilesField returns [] when no files: key present', () => {
  const content = '---\ndepth-hint: reference\n---\n\n# Doc\n';
  assert.deepStrictEqual(parseFilesField(content), []);
});

test('parseFilesField returns [] when no frontmatter at all', () => {
  assert.deepStrictEqual(parseFilesField('# Doc\n\nNo frontmatter here.\n'), []);
});

test('flags a tracked file that changed after sinceTimestamp', () => {
  const root = makeTmpGitRoot();
  commitFile(root, 'src/tracked.ts', 'export const x = 1;\n');
  const changedAt = commitTimestampMs(root, 'src/tracked.ts');
  const content = '---\nfiles:\n  - src/tracked.ts\n---\n\n# Doc\n';
  const result = checkTrackedFreshness(content, root, changedAt - 1000);
  assert.strictEqual(result.stale.length, 1);
  assert.strictEqual(result.stale[0].path, 'src/tracked.ts');
  assert.deepStrictEqual(result.missing, []);
});

test('does not flag a tracked file that changed before sinceTimestamp', () => {
  const root = makeTmpGitRoot();
  commitFile(root, 'src/tracked.ts', 'export const x = 1;\n');
  const changedAt = commitTimestampMs(root, 'src/tracked.ts');
  const content = '---\nfiles:\n  - src/tracked.ts\n---\n\n# Doc\n';
  const result = checkTrackedFreshness(content, root, changedAt + 1000);
  assert.deepStrictEqual(result.stale, []);
});

test('flags a missing tracked path', () => {
  const root = makeTmpGitRoot();
  const content = '---\nfiles:\n  - src/does-not-exist.ts\n---\n\n# Doc\n';
  const result = checkTrackedFreshness(content, root, Date.now());
  assert.deepStrictEqual(result.missing, ['src/does-not-exist.ts']);
  assert.deepStrictEqual(result.stale, []);
});

test('does not flag anything when sinceTimestamp is null (never audited)', () => {
  const root = makeTmpGitRoot();
  commitFile(root, 'src/tracked.ts', 'export const x = 1;\n');
  const content = '---\nfiles:\n  - src/tracked.ts\n---\n\n# Doc\n';
  const result = checkTrackedFreshness(content, root, null);
  assert.deepStrictEqual(result.stale, []);
});

test('returns empty result when doc has no files: field', () => {
  const root = makeTmpGitRoot();
  const content = '# Doc\n\nNo frontmatter.\n';
  const result = checkTrackedFreshness(content, root, Date.now());
  assert.deepStrictEqual(result, { stale: [], missing: [] });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/docs-health/tests/freshness.test.js`
Expected: FAIL with `Cannot find module '../freshness'`

- [ ] **Step 3: Write the implementation**

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Parses a doc's `files:` frontmatter list (repo-relative dependency
// paths) — reuses journey docs' existing `files:` field/shape (see
// journeys/journey-template.md's regression-detection use) rather than
// introducing a competing field name for a near-identical concept.
// Returns [] when absent or the doc has no frontmatter at all.
function parseFilesField(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return [];
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return [];
  const frontmatter = lines.slice(1, closeIdx);
  const filesIdx = frontmatter.findIndex((l) => /^files:\s*$/.test(l));
  if (filesIdx === -1) return [];
  const files = [];
  for (let i = filesIdx + 1; i < frontmatter.length; i++) {
    const m = frontmatter[i].match(/^\s*-\s+(.+?)\s*$/);
    if (!m) break;
    files.push(m[1]);
  }
  return files;
}

// For each files: dependency: does it exist (missing = its own staleness
// signal), and has it changed more recently than sinceTimestamp (the
// doc's last-audit cursor, epoch ms, or null if never audited — nothing
// is flagged stale against a null baseline)? Mechanical signal only — the
// JUDGE step in docs-health/SKILL.md decides whether a flagged change is
// substantive enough to matter.
function checkTrackedFreshness(content, root, sinceTimestamp) {
  const files = parseFilesField(content);
  const missing = [];
  const stale = [];
  for (const relPath of files) {
    const absPath = path.join(root, relPath);
    if (!fs.existsSync(absPath)) {
      missing.push(relPath);
      continue;
    }
    let lastChangedMs = null;
    try {
      const out = execFileSync(
        'git', ['-C', root, 'log', '-1', '--format=%ct', '--', relPath],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      if (out) lastChangedMs = parseInt(out, 10) * 1000;
    } catch {
      lastChangedMs = null;
    }
    if (lastChangedMs !== null && sinceTimestamp !== null && lastChangedMs > sinceTimestamp) {
      stale.push({ path: relPath, lastChangedMs });
    }
  }
  return { stale, missing };
}

module.exports = { parseFilesField, checkTrackedFreshness };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/docs-health/tests/freshness.test.js`
Expected: PASS (8 tests, 0 failures)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/docs-health/freshness.js bin/lib/docs-health/tests/freshness.test.js
git commit -m "Add docs-health freshness-dependencies mechanical helper"
```

---

### Task 3: Wire find-refs and check-freshness into the CLI

**Files:**
- Modify: `bin/docs-health.js`
- Test: `bin/lib/docs-health/tests/cli-find-refs.test.js`
- Test: `bin/lib/docs-health/tests/cli-check-freshness.test.js`

**Interfaces:**
- Consumes: `computeInboundReferences(docId, root)` (Task 1), `checkTrackedFreshness(content, root, sinceTimestamp)` (Task 2), `readDurableState(root)` (existing, from `./lib/docs-health/cache`).
- Produces: `cmdFindRefs(args)`, `cmdCheckFreshness(args)`, both exported from `bin/docs-health.js` alongside the existing `cmdWordCount`.

- [ ] **Step 1: Write the failing tests**

`bin/lib/docs-health/tests/cli-find-refs.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'docs-health.js');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-cli-find-refs-'));
}

test('find-refs reports zero for an orphan doc', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const target = path.join(root, 'docs', 'orphan.md');
  fs.writeFileSync(target, '# Orphan\n');
  const out = execFileSync('node', [CLI, 'find-refs', target, '--root', root], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.result.count, 0);
});

test('find-refs reports a reference from README.md', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const target = path.join(root, 'docs', 'setup.md');
  fs.writeFileSync(target, '# Setup\n');
  fs.writeFileSync(path.join(root, 'README.md'), 'See docs/setup.md.\n');
  const out = execFileSync('node', [CLI, 'find-refs', target, '--root', root], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.result.count, 1);
});

test('find-refs exits 2 with no path argument', () => {
  const result = spawnSync('node', [CLI, 'find-refs']);
  assert.strictEqual(result.status, 2);
});

test('find-refs exits 1 for a missing file', () => {
  const root = makeTmpRoot();
  const result = spawnSync('node', [CLI, 'find-refs', path.join(root, 'docs', 'nope.md'), '--root', root]);
  assert.strictEqual(result.status, 1);
});
```

`bin/lib/docs-health/tests/cli-check-freshness.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'docs-health.js');

function makeTmpGitRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-cli-check-freshness-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  return root;
}

test('check-freshness reports a missing tracked path', () => {
  const root = makeTmpGitRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const target = path.join(root, 'docs', 'tracked.md');
  fs.writeFileSync(target, '---\nfiles:\n  - src/nope.ts\n---\n\n# Doc\n');
  const out = execFileSync('node', [CLI, 'check-freshness', target, '--root', root], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.deepStrictEqual(parsed.result.missing, ['src/nope.ts']);
});

test('check-freshness reports no staleness with no prior audit cursor', () => {
  const root = makeTmpGitRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const x = 1;\n');
  execFileSync('git', ['add', 'src/a.ts'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'add a.ts'], { cwd: root });
  const target = path.join(root, 'docs', 'tracked.md');
  fs.writeFileSync(target, '---\nfiles:\n  - src/a.ts\n---\n\n# Doc\n');
  const out = execFileSync('node', [CLI, 'check-freshness', target, '--root', root], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.deepStrictEqual(parsed.result.stale, []);
});

test('check-freshness exits 2 with no path argument', () => {
  const result = spawnSync('node', [CLI, 'check-freshness']);
  assert.strictEqual(result.status, 2);
});

test('check-freshness exits 1 for a missing file', () => {
  const root = makeTmpGitRoot();
  const result = spawnSync('node', [CLI, 'check-freshness', path.join(root, 'docs', 'nope.md'), '--root', root]);
  assert.strictEqual(result.status, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/docs-health/tests/cli-find-refs.test.js bin/lib/docs-health/tests/cli-check-freshness.test.js`
Expected: FAIL — `find-refs`/`check-freshness` are unrecognized commands (exit 2 from the `main()` fallback usage branch), so the tests asserting `result.count`/`result.missing` fail on `JSON.parse` of the usage-string stderr output rather than valid JSON stdout.

- [ ] **Step 3: Modify `bin/docs-health.js`**

Add these two imports after the existing `const { selectTarget, listDocs } = require('./lib/docs-health/scope');` line (line 12):

```javascript
const path = require('path');
const { computeInboundReferences } = require('./lib/docs-health/findability');
const { checkTrackedFreshness } = require('./lib/docs-health/freshness');
```

Add this helper function immediately after `cmdWordCount` (after line 224, before `function main(argv) {`):

```javascript
// Derives a doc's id (relative to docs/, no .md extension) from a raw
// path argument — mirrors scope.js's own id-deriving logic in walk().
function deriveDocId(targetPath, root) {
  const docsRoot = path.join(root, 'docs');
  const rel = path.relative(docsRoot, path.resolve(targetPath));
  return rel.split(path.sep).join('/').replace(/\.md$/, '');
}

function cmdFindRefs(args) {
  const targetPath = args._[1];
  if (!targetPath) {
    process.stderr.write('usage: docs-health.js find-refs <path> [--root <dir>]\n');
    process.exit(2);
  }
  const root = args.root || process.cwd();
  if (!fs.existsSync(targetPath)) {
    process.stderr.write(`find-refs: could not read file: ${targetPath}\n`);
    process.exit(1);
  }
  const docId = deriveDocId(targetPath, root);
  const result = computeInboundReferences(docId, root);
  process.stdout.write(JSON.stringify({ result }, null, 2) + '\n');
}

function cmdCheckFreshness(args) {
  const targetPath = args._[1];
  if (!targetPath) {
    process.stderr.write('usage: docs-health.js check-freshness <path> [--root <dir>]\n');
    process.exit(2);
  }
  const root = args.root || process.cwd();
  let content;
  try {
    content = fs.readFileSync(targetPath, 'utf8');
  } catch {
    process.stderr.write(`check-freshness: could not read file: ${targetPath}\n`);
    process.exit(1);
  }
  const docId = deriveDocId(targetPath, root);
  const cursors = readDurableState(root).cursors;
  const cursor = cursors[`doc:${docId}`];
  const sinceTimestamp = cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null;
  const result = checkTrackedFreshness(content, root, sinceTimestamp);
  process.stdout.write(JSON.stringify({ result }, null, 2) + '\n');
}
```

In `main(argv)`, add two dispatch lines immediately after `if (cmd === 'word-count') return cmdWordCount(args);`:

```javascript
  if (cmd === 'find-refs') return cmdFindRefs(args);
  if (cmd === 'check-freshness') return cmdCheckFreshness(args);
```

Update the usage string inside `main`'s fallback branch — replace:

```javascript
    'word-count <path>, ' +
```

with:

```javascript
    'word-count <path>, find-refs <path> [--root <dir>], check-freshness <path> [--root <dir>], ' +
```

Update the final `module.exports` line — replace:

```javascript
module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, cmdWordCount, main };
```

with:

```javascript
module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, cmdWordCount, cmdFindRefs, cmdCheckFreshness, main };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/docs-health/tests/cli-find-refs.test.js bin/lib/docs-health/tests/cli-check-freshness.test.js`
Expected: PASS (8 tests total, 0 failures)

Also run the full existing docs-health suite to confirm nothing else broke:

Run: `node --test bin/lib/docs-health/tests/*.test.js`
Expected: PASS, all tests (existing + new)

- [ ] **Step 5: Commit**

```bash
git add bin/docs-health.js bin/lib/docs-health/tests/cli-find-refs.test.js bin/lib/docs-health/tests/cli-check-freshness.test.js
git commit -m "Wire find-refs and check-freshness into docs-health CLI"
```

---

### Task 4: Add findability to the category enum

**Files:**
- Modify: `bin/lib/docs-health/validate-finding.js:10`
- Modify: `bin/lib/docs-health/tests/validate-finding.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CATEGORY_VALUES` now includes `"findability"`.

- [ ] **Step 1: Write the failing test**

The file already defines a `validFinding(overrides = {})` helper (returning a complete, valid finding object with `category: 'staleness'` by default) and ends with a test named `'validateFinding accepts category: depth-mismatch'`. Append a new test immediately after that one, in the same style:

```javascript
test('validateFinding accepts category: findability', () => {
  const result = validateFinding(validFinding({
    category: 'findability',
    section: 'Freshness',
    description: 'Doc has zero inbound references from docs/**, README.md, or CLAUDE.md',
  }));
  assert.strictEqual(result.ok, true);
});
```

Do not redefine `validFinding` — reuse the existing one already in the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/docs-health/tests/validate-finding.test.js`
Expected: FAIL — `category: findability` rejected with `category: must be one of genre-drift|staleness|depth-mismatch (got "findability")`

- [ ] **Step 3: Modify `bin/lib/docs-health/validate-finding.js:10`**

Replace:

```javascript
const CATEGORY_VALUES = new Set(['genre-drift', 'staleness', 'depth-mismatch']);
```

with:

```javascript
const CATEGORY_VALUES = new Set(['genre-drift', 'staleness', 'depth-mismatch', 'findability']);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/docs-health/tests/validate-finding.test.js`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/docs-health/validate-finding.js bin/lib/docs-health/tests/validate-finding.test.js
git commit -m "Add findability to docs-health category enum"
```

---

### Task 5: Prioritize declared files: paths in hotspot selection

**Files:**
- Modify: `bin/lib/docs-health/scope.js`
- Modify: `bin/lib/docs-health/tests/scope.test.js` (already exists — defines `tmp()`, `initGitRepo(root)`, `commit(root, msg)` helpers, and already imports `STALE_DAYS` from `../score`; reuse all of these, don't redefine them)

**Interfaces:**
- Consumes: `parseFilesField(content)` from `bin/lib/docs-health/freshness.js` (Task 2).
- Produces: `selectTarget`'s Phase 2 churn scoring now prefers a doc's declared `files:` paths over its incidentally backtick-quoted paths when both would apply.

- [ ] **Step 1: Write the failing test**

Append this test to `bin/lib/docs-health/tests/scope.test.js`, after the existing `'selectTarget picks the highest-churn non-stale doc via injected signals'` test (end of the `── selectTarget ──` section). Note this test deliberately does NOT use the `signals` injection hook the existing hotspot tests use — it needs to exercise the real `domainChurn`/git path, since that's exactly the code being changed. It sets an explicit recent `lastAuditedMs` cursor (same pattern the existing "picks the highest-churn" test already uses) so Phase 1's stale-force branch doesn't short-circuit it before Phase 2's churn scoring ever runs:

```javascript
test('selectTarget scores churn on declared files: paths, ignoring incidental backtick paths, when files: is present', () => {
  const root = tmp();
  initGitRepo(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'declared.ts'), 'export const a = 1;\n');
  commit(root, 'add declared.ts');

  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  // A doc that declares files: (the real dependency) but also happens to
  // backtick-mention an unrelated path with no real churn — files:
  // should be what actually drives the churn score.
  fs.writeFileSync(
    path.join(root, 'docs', 'tracked.md'),
    '---\nfiles:\n  - src/declared.ts\n---\n\n# Tracked\n\nSee `src/unrelated.ts` for background.\n',
  );
  commit(root, 'add tracked.md');

  const now = Date.now();
  const recentAudit = now - (STALE_DAYS - 1) * 86400000;
  const cursors = { 'doc:tracked': { lastAuditedMs: recentAudit } };
  const result = selectTarget(root, cursors, { now });
  assert.strictEqual(result.why, 'hotspot');
  assert.strictEqual(result.id, 'tracked');
  assert.ok(result.churnCount >= 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/docs-health/tests/scope.test.js`
Expected: FAIL — before the Step 3 change, `selectTarget` only scores churn via `extractDomainPaths` (backtick-sniffing), which in this fixture finds `src/unrelated.ts` (no commits ever touch it, since it was never created) rather than the real dependency `src/declared.ts`, so `domainChurn` returns 0 for that path set and the doc never scores as a hotspot — the assertion `result.why === 'hotspot'` fails because `result` is `null`.

- [ ] **Step 3: Modify `bin/lib/docs-health/scope.js`**

Add this import after the existing `const { STALE_DAYS } = require('./score');` line (line 5):

```javascript
const { parseFilesField } = require('./freshness');
```

In `selectTarget`'s Phase 2 loop (inside the `else` branch that reads content and computes `domainPaths`), replace:

```javascript
      let content;
      try { content = fs.readFileSync(candidate.path, 'utf8'); } catch { content = ''; }
      const relDocPath = path.relative(root, candidate.path).split(path.sep).join('/');
      const domainPaths = extractDomainPaths(content);
      churn = domainChurn(root, [relDocPath, ...domainPaths], sinceMs);
```

with:

```javascript
      let content;
      try { content = fs.readFileSync(candidate.path, 'utf8'); } catch { content = ''; }
      const relDocPath = path.relative(root, candidate.path).split(path.sep).join('/');
      const declaredPaths = parseFilesField(content);
      const domainPaths = declaredPaths.length > 0 ? declaredPaths : extractDomainPaths(content);
      churn = domainChurn(root, [relDocPath, ...domainPaths], sinceMs);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/docs-health/tests/scope.test.js`
Expected: PASS (all tests, including the new one)

Also run the full docs-health suite:

Run: `node --test bin/lib/docs-health/tests/*.test.js`
Expected: PASS, all tests

- [ ] **Step 5: Commit**

```bash
git add bin/lib/docs-health/scope.js bin/lib/docs-health/tests/scope.test.js
git commit -m "Prioritize declared files: paths in docs-health hotspot selection"
```

---

### Task 6: Extend the shared criteria fragment — Findability, placement-fit, freshness-deps prose

**Files:**
- Modify: `skills/_shared/criteria-docs-diataxis.md`

**Interfaces:**
- Consumes: nothing (pure prose; the mechanical helpers it references were built in Tasks 1-2).

- [ ] **Step 1: Make the edits**

Replace the H1 (line 1):

```
# Criteria: Docs Diátaxis Genre-Drift + Depth-Mismatch + Staleness
```

with:

```
# Criteria: Docs Diátaxis Genre-Drift + Depth-Mismatch + Staleness + Findability
```

Replace the intro paragraph (line 3):

```
Shared, criteria-only fragment — the "what is worth flagging in `docs/**`" knowledge for `/claude-tweaks:docs-health`. No workflow, no subagent dispatch, no Next Actions. Encodes the Diátaxis framework (tutorial / how-to / reference / explanation) as a genre-drift check, plus a factual-staleness check, plus dual-persona misleading-risk tagging — three dimensions a manual one-off Diátaxis audit found real drift with in a downstream project (two "reference" docs that were secretly how-to walkthroughs, unmarked roadmap content in a reference doc, a section index stating a stale item count for 4+ months) — plus a depth-mismatch check, added in a later refinement informed by independently-converged prior art in a sibling project's docs-portal build.
```

with:

```
Shared, criteria-only fragment — the "what is worth flagging in `docs/**`" knowledge for `/claude-tweaks:docs-health`. No workflow, no subagent dispatch, no Next Actions. Encodes the Diátaxis framework (tutorial / how-to / reference / explanation) as a genre-drift check, plus a factual-staleness check, plus dual-persona misleading-risk tagging — three dimensions a manual one-off Diátaxis audit found real drift with in a downstream project (two "reference" docs that were secretly how-to walkthroughs, unmarked roadmap content in a reference doc, a section index stating a stale item count for 4+ months) — plus a depth-mismatch check, added in a later refinement informed by independently-converged prior art in a sibling project's docs-portal build. A further refinement, informed by the same sibling project, strengthened genre-drift with a placement-fit sub-check, strengthened staleness with author-declared freshness-dependencies, and added a findability dimension (informed by that project's own build-time nav-coverage gate).
```

Insert a new paragraph immediately after the existing Dimension 1 paragraph that ends `"...cannot tell the difference between "this exists" and "this is planned" without an explicit marker."` (end of line 18) and before `## Dimension 2 — Staleness` (line 20):

```

**Placement-fit — a second, independent comparison.** The implied-type derivation above combines location and heading language into one signal, so a correctly-labeled doc (heading matches content) can still be filed under the wrong directory without ever being flagged — e.g. a genuinely how-to-shaped doc, correctly titled "How to X," sitting under `docs/reference/`. Derive a second implied type from directory alone (ignoring heading language entirely, using the same location-based mapping above) and compare it against found type independently of the heading comparison. A divergence here is still `category: "genre-drift"`, but is typically `classification: "restructural"` since the fix is moving the file to the directory matching its actual genre, not editing a sentence.
```

Insert a new paragraph immediately after the existing Dimension 2 paragraph that ends `"...self-acknowledging the gap in its own text the whole time."` (end of line 29) and before `## Dimension 3 — Depth-mismatch` (line 31):

```

**Freshness-dependencies — an author-declared alternative to inferred grep targets.** A doc may declare a `files:` frontmatter list (the same field and shape journey docs already use for `/review`'s regression detection — see `journeys/journey-template.md`) naming repo-relative paths it depends on. Check each declared path via `bin/lib/docs-health/freshness.js#checkTrackedFreshness`: does it still exist (a missing path is its own staleness finding), and has it changed more recently than this doc's last-audit cursor? A tracked path that changed since the last audit is strong staleness evidence — judge whether the change is substantive enough to actually invalidate what the doc claims (a trivial reformat doesn't; a rewritten function signature does), the same "would this actually mislead" bar this fragment uses throughout.
```

Insert a new dimension section immediately after the existing Dimension 4 (Misleading-risk tagging) section ends (after line 47, which reads `"In the original audit, 2 of 5 findings flagged agent-risk as primary — treat this as a real, common outcome, not an edge case."`) and before `## Emitting a finding` (line 49):

```

## Dimension 5 — Findability (reachability)

A doc that's factually accurate, correctly genred, and appropriately deep is still unhealthy if nobody — human or agent — can ever find it. Check the doc's inbound-reference count via `bin/lib/docs-health/findability.js#computeInboundReferences`: how many files under `docs/**`, `README.md`, or `CLAUDE.md` — the actual places a reader would navigate from — reference this doc's filename. This is a mechanical, repo-scoped signal, not a whole-web search — it can't detect an external inbound link, and it isn't meant to.

A near-zero count is a candidate orphan, not an automatic finding. Judge whether it's genuinely unreachable in a way that would block a real reader or agent from finding it when they need it, or whether it's intentionally standalone — an explicit draft/archived/template marker, or a doc that's meant to be reached only via direct link from outside this check's scope. The canonical failure shape: a doc that was clearly written to be read (full prose, a real heading, real content) but has zero paths leading to it from anywhere in the project's own docs, README, or CLAUDE.md — indistinguishable, from a reader's perspective, from a doc that was never written at all.

Emit as `category: "findability"`.
```

Replace the category clause inside `## Emitting a finding` (the sentence fragment reading):

```
`category` (`"genre-drift"` — Dimension 1, `"staleness"` — Dimension 2, `"depth-mismatch"` — Dimension 3; pick whichever the finding is actually about),
```

with:

```
`category` (`"genre-drift"` — Dimension 1, including placement-fit; `"staleness"` — Dimension 2, including freshness-dependencies; `"depth-mismatch"` — Dimension 3; `"findability"` — Dimension 5; pick whichever the finding is actually about),
```

In `## What is worth flagging`, append three new bullets immediately after the existing bullet ending `"...that no longer matches live repository state."` and before the final bullet (`"A doc that has explicitly and visibly acknowledged..."`):

```
- A doc filed under a directory that doesn't match its actual content genre, independent of what its own heading claims.
- A doc whose declared `files:` dependency no longer exists, or has changed substantively since the doc's last audit.
- A doc with a near-zero inbound-reference count that would genuinely block discovery — not an intentionally standalone doc.
```

In `## Constraints (what NOT to flag)`, append a new bullet after the existing `"Length alone is never a finding."` bullet:

```
- **Findability is repo-scoped, not a link-checker.** The inbound-reference count only searches `docs/**`, `README.md`, and `CLAUDE.md` — it cannot detect external links, and a doc reachable only via a link outside that scope will read as an orphan. This is a deliberate simplicity tradeoff, not a bug to fix by expanding the search scope.
```

- [ ] **Step 2: Verify the edits**

Run: `grep -c "^## Dimension" skills/_shared/criteria-docs-diataxis.md`
Expected: `5`

Run: `grep -ci "placement-fit" skills/_shared/criteria-docs-diataxis.md`
Expected: at least `2`

Run: `grep -ci "freshness-dependenc" skills/_shared/criteria-docs-diataxis.md`
Expected: at least `2`

Run: `grep -c '"findability"' skills/_shared/criteria-docs-diataxis.md`
Expected: at least `2` (the Dimension 5 "Emit as `category: "findability"`" line, and the Emitting-a-finding category clause — the H1, intro, and Constraints mentions of findability are unquoted prose, not this literal quoted-string pattern)

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/criteria-docs-diataxis.md
git commit -m "Add findability dimension and strengthen genre-drift/staleness in docs-health criteria"
```

---

### Task 7: Wire the new checks into docs-health/SKILL.md

**Files:**
- Modify: `skills/docs-health/SKILL.md`

**Interfaces:**
- Consumes: the `find-refs` and `check-freshness` CLI subcommands (Task 3), the criteria fragment's Dimension 5 and strengthened Dimensions 1/2 (Task 6).

- [ ] **Step 1: Make the edits**

Replace the frontmatter `description:` (line 3):

```
description: Use when you want a proactive, report-only sweep of docs/** that surfaces Diátaxis genre-drift (implied doc type vs. actual content shape), depth-mismatch (implied reading investment vs. actual word count), and factual staleness, deduplicated and filed as GitHub issues. An LLM judges the docs; deterministic helpers handle scope rotation, fingerprinting, dedup, issue filing, and word-count computation. Never edits docs. Keywords - docs-health, documentation drift, Diátaxis, genre drift, depth mismatch, staleness, proactive, github issues, scheduled, routine.
```

with:

```
description: Use when you want a proactive, report-only sweep of docs/** that surfaces Diátaxis genre-drift (implied doc type vs. actual content shape, and directory placement vs. content genre), depth-mismatch (implied reading investment vs. actual word count), findability (can a reader or agent actually discover this doc), and factual staleness (including author-declared freshness dependencies), deduplicated and filed as GitHub issues. An LLM judges the docs; deterministic helpers handle scope rotation, fingerprinting, dedup, issue filing, word-count computation, inbound-reference counting, and tracked-dependency freshness checks. Never edits docs. Keywords - docs-health, documentation drift, Diátaxis, genre drift, depth mismatch, findability, orphan docs, staleness, proactive, github issues, scheduled, routine.
```

Replace the H1 (line 7):

```
# Docs Health — Diátaxis Genre-Drift + Depth-Mismatch + Staleness Sweep for docs/**
```

with:

```
# Docs Health — Diátaxis Genre-Drift + Depth-Mismatch + Findability + Staleness Sweep for docs/**
```

Replace the header paragraph (line 9):

```
A recurring health check for `docs/**`: picks one doc to audit, judges it against the shared `_shared/criteria-docs-diataxis.md` procedure (implied-type-vs-found-type genre-drift, implied-vs-found depth-mismatch, factual staleness, dual-persona misleading-risk), and files a `by:docs-health`-labelled, born-`ready` GitHub issue. Never edits docs — only files findings, mirroring `/code-health` and `/harness-health`.
```

with:

```
A recurring health check for `docs/**`: picks one doc to audit, judges it against the shared `_shared/criteria-docs-diataxis.md` procedure (implied-type-vs-found-type and placement-vs-content genre-drift, implied-vs-found depth-mismatch, inbound-reference findability, factual staleness including declared freshness-dependencies, dual-persona misleading-risk), and files a `by:docs-health`-labelled, born-`ready` GitHub issue. Never edits docs — only files findings, mirroring `/code-health` and `/harness-health`.
```

In `## When to Use`, replace the second bullet (line 21):

```
- You want a scheduled Routine that periodically rotates through `docs/**` and flags genre-drift, depth-mismatch, or staleness as it's found.
```

with:

```
- You want a scheduled Routine that periodically rotates through `docs/**` and flags genre-drift, depth-mismatch, findability, or staleness as it's found.
```

Replace the entirety of **Step 3 — JUDGE the target** (lines 55-71, from `**Step 3 — JUDGE the target.**` through the line ending `` `"restructural"` (reorganizing a doc that mixes genres, splitting a doc). ``) with:

```
**Step 3 — JUDGE the target.**

Apply the full procedure in `_shared/criteria-docs-diataxis.md` (genre-drift, depth-mismatch, findability, staleness, dual-persona misleading-risk) to the target's content:

1. First, determine whether the doc has a self-evident non-Diátaxis-native genre (ADR/decision-record, structured spec/journey, dated retrospective/log — see the criteria fragment's Dimension 1). If so, skip type classification: spot-check it still reads as its own native genre, and flag only if it has drifted out of that genre into something else.
2. Otherwise, determine the doc's **implied type** from its location/heading language, and its **found type** from what the content actually does (tutorial / how-to / reference / explanation — see the criteria fragment's Dimension 1 table). Flag a mismatch only when it would actually mislead a reader or leave the doc's purpose unserved — a `category: "genre-drift"` finding.
3. Separately, determine an implied type from the doc's **directory alone** (ignoring heading language) and compare it against found type independently of step 2. A divergence here is also `category: "genre-drift"` (placement-fit — see the criteria fragment's Dimension 1), typically `classification: "restructural"`.
4. Compute the doc's word count:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" word-count "${TARGET_PATH}"
   ```

   `TARGET_PATH` is `target.path` from Step 1. The result is either an integer word count, or (if the doc's frontmatter declares `depth-hint:`) that value's literal string, returned as-is — ground truth, skip the judgment below entirely in that case. Otherwise, judge whether the computed word count is surprising given what the doc's location, heading, and native genre (from step 1) lead a reader to expect walking in — same "would this actually mislead" bar as step 2, never length by itself. A surprising mismatch is a `category: "depth-mismatch"` finding.
5. Compute the doc's inbound-reference count:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" find-refs "${TARGET_PATH}"
   ```

   Judge whether a near-zero count means a genuine orphan (blocks discovery) or an intentionally standalone doc (see the criteria fragment's Dimension 5). A genuine orphan is a `category: "findability"` finding.
6. Check every stated fact (counts, dates, paths, versions, availability claims) against live repository state (grep, `find`, `git log`). Additionally, check any declared freshness-dependencies:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" check-freshness "${TARGET_PATH}"
   ```

   For each path in the result's `missing` array, that's a broken dependency — a staleness finding on its own. For each entry in `stale`, judge whether the tracked file's change is substantive enough to actually invalidate what the doc claims (see the criteria fragment's Dimension 2). A mismatch (stated fact, broken dependency, or substantive tracked-file drift) is a `category: "staleness"` finding.
7. For every finding, judge `misleads`: `"human"` (a skim-and-notice-caveat reader partially self-corrects), `"agent"` (retrieval-style consumption has no such safety net — weight this higher), or `"both"`.
8. Judge `classification`: `"additive"` (a one-line fact correction, an added disclaimer) or `"restructural"` (reorganizing a doc that mixes genres, splitting a doc).
```

Replace the `"category"` line inside the finding-shape JSON block:

```json
  "category": "genre-drift | depth-mismatch | staleness",
```

with:

```json
  "category": "genre-drift | depth-mismatch | findability | staleness",
```

In `## Anti-Patterns`, append a new row immediately after the row for `"Flagging a doc's length by itself, without a mismatched expectation"`:

```
| Flagging a doc's low inbound-reference count without judging whether it's intentionally standalone | Findability only fires on a genuine, blocking orphan — a doc explicitly marked draft/archived/template, or one meant to be reached only via an out-of-scope external link, is not a finding regardless of its reference count. See `_shared/criteria-docs-diataxis.md`'s Dimension 5. |
```

In `## Relationship to Other Skills`, update three rows:

Replace:

```
| `/claude-tweaks:harness-health` | Sibling health skill — mirrors the same SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline and shares `_shared/health-state.md`'s durable persistence, but scoped to `docs/**` (excluding harness-health's own `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md territory) for Diátaxis genre-drift + depth-mismatch + staleness instead of skill/rule/CLAUDE.md accuracy and template-conformance. |
```

with:

```
| `/claude-tweaks:harness-health` | Sibling health skill — mirrors the same SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline and shares `_shared/health-state.md`'s durable persistence, but scoped to `docs/**` (excluding harness-health's own `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md territory) for Diátaxis genre-drift + depth-mismatch + findability + staleness instead of skill/rule/CLAUDE.md accuracy and template-conformance. |
```

Replace:

```
| `/claude-tweaks:journey-health` | Sibling health skill for `docs/journeys/*.md` accuracy and agent-e2e coverage — same SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline and `_shared/health-state.md` persistence, scoped to journeys instead of `docs/**` Diátaxis genre-drift + depth-mismatch + staleness. Both file born-`ready` findings on the unified work-record contract. |
```

with:

```
| `/claude-tweaks:journey-health` | Sibling health skill for `docs/journeys/*.md` accuracy and agent-e2e coverage — same SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline and `_shared/health-state.md` persistence, scoped to journeys instead of `docs/**` Diátaxis genre-drift + depth-mismatch + findability + staleness. Both file born-`ready` findings on the unified work-record contract. |
```

Replace:

```
| `_shared/criteria-docs-diataxis.md` | The canonical judge this skill reads — the genre-drift/depth-mismatch/staleness dimensions, dual-persona misleading-risk tagging, and Finding Shape live there, not here. |
```

with:

```
| `_shared/criteria-docs-diataxis.md` | The canonical judge this skill reads — the genre-drift/depth-mismatch/findability/staleness dimensions, dual-persona misleading-risk tagging, and Finding Shape live there, not here. |
```

Also update the frontmatter/header prose is done above; finally, in `## When to Use`, no further changes needed beyond the bullet already replaced.

- [ ] **Step 2: Verify the edits**

Run: `grep -c "findability" skills/docs-health/SKILL.md`
Expected: at least `8`

Run: `grep -c "genre-drift | depth-mismatch | staleness" skills/docs-health/SKILL.md`
Expected: `0` (the old 3-item enum string must not survive anywhere in the file)

- [ ] **Step 3: Commit**

```bash
git add skills/docs-health/SKILL.md
git commit -m "Wire findability and placement-fit/freshness-deps checks into docs-health SKILL.md"
```

---

### Task 8: /visualize surfaces a suggested files: line

**Files:**
- Modify: `skills/visualize/SKILL.md`

**Interfaces:**
- Consumes: the `files:` field convention established in Task 6.

- [ ] **Step 1: Make the edit**

In `### Step 5: Write wrapper outputs`, append a new paragraph after the existing paragraph (which ends `"...it's a snippet, not a standalone artifact."`):

```

Alongside the embed snippet, also surface a suggested `files:` frontmatter line naming the diagram's depicted source dependencies (the files under discussion when the diagram's topic was resolved in Step 1) — e.g.:

```yaml
files:
  - packages/food-graph/src/resolvers/ingredient-resolver.ts
```

This skill doesn't own the doc that embeds the diagram, so it doesn't write this itself — the calling skill applies it to that doc's frontmatter when it pastes in the embed snippet, giving `/claude-tweaks:docs-health`'s freshness-dependency check (`_shared/criteria-docs-diataxis.md` Dimension 2) something to track. Skip this output when the diagram has no clear source-file dependency (e.g. a purely conceptual diagram with no 1:1 code mapping).
```

- [ ] **Step 2: Verify the edit**

Run: `grep -c "files:" skills/visualize/SKILL.md`
Expected: at least `1`

Run: `grep -c "freshness-dependency" skills/visualize/SKILL.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add skills/visualize/SKILL.md
git commit -m "Have /visualize surface a suggested files: line for diagram sync tracking"
```

---

### Task 9: Create the unified genre-template library

**Files:**
- Create: `skills/_shared/diataxis-genre-templates.md`

**Interfaces:**
- Produces: the canonical source for all 6 genre skeletons, consumed by Tasks 10-14.

- [ ] **Step 1: Write the file**

```markdown
# Diátaxis Genre Templates

Canonical skeletons for the six doc genres `/claude-tweaks:docs-health` recognizes (the four core Diátaxis genres, plus the two native-exempt genres it already judges — see `_shared/criteria-docs-diataxis.md` Dimension 1). Consumed by `/claude-tweaks:init` Phase 8.5 (missing-doc backlog items point here) and `/claude-tweaks:wrap-up`'s missing-doc detection (`skills/wrap-up/docs-health-integration.md`, which scaffolds directly from here and fills in real content).

This is the single source of truth for the ADR and Journey templates — `_shared/decision-records.md` and `journeys/journey-template.md` each keep their own non-template content (the ADR gate and location convention; the journey key-principles and file-location convention) and point here for the literal skeleton, rather than duplicating it.

## Tutorial

Learning-oriented — a concrete guided exercise, start to finish. No unexplained jumps: a reader with zero context follows every step and confirms progress at each one. No branching decision points ("if you're on Windows...") — that belongs in a How-To. Minimize explanation — link out to an Explanation doc for "why," don't inline it.

```markdown
# Your First {Thing}

A hands-on walkthrough that gets you from nothing to a working {result}. By the end, you'll have {concrete artifact/outcome} — not just understood how it works, but built it yourself.

## What you'll need

- {Prerequisite 1 — a tool, an account, a prior step}
- {Prerequisite 2}

## Step 1: {First action}

{One or two sentences of context, then the imperative instruction.}

\`\`\`{language}
{exact command or code}
\`\`\`

You should now see {concrete, verifiable result}.

## Step 2: {Next action}

...

## What you built

{One paragraph recapping what now exists and works.}

## Next steps

- {Pointer to a How-To guide for a related task}
- {Pointer to a Reference doc for the thing just built}
```

## How-To

Task-oriented, goal-directed steps assuming competence — the reader already knows the fundamentals a Tutorial would teach. Every step exists because it's needed to reach the stated goal, nothing extra. Branches are fine here (unlike Tutorial) — real tasks have real conditions. No narrative "why" — link to Explanation for that.

```markdown
# How to {accomplish a specific task}

{One sentence stating exactly what this guide accomplishes and for whom.}

## Before you start

- {Assumption 1 — what the reader is expected to already know/have}
- {Assumption 2}

## Steps

1. {Imperative step}
   \`\`\`{language}
   {command}
   \`\`\`
2. {Next step}
3. {Next step, with a branch:}
   - If {condition A}: {action}
   - If {condition B}: {action}

## Verify it worked

{How to confirm the task succeeded — a command to run, an output to check.}

## Related

- {Link to Reference doc for the underlying system}
- {Link to another related How-To}
```

## Reference

Information-oriented — states facts, never narrates. Structured for lookup (tables, consistent field ordering), not start-to-finish reading. Stays neutral on "why" — a Reference that argues for a design choice has drifted into Explanation's genre. Exhaustive within its stated scope, or honestly narrower — never partially covering what its title claims.

```markdown
# {Subject} Reference

{One sentence stating what this reference covers — its exact scope, nothing more.}

## {Category/Table 1}

| Field | Type | Description |
|-------|------|-------------|
| {name} | {type} | {description} |

## {Category/Table 2}

- **{Item}** — {fact, no explanation of why it exists this way}

## See also

- {Link to related Reference doc}
- {Link to an Explanation doc for context/rationale}
```

## Explanation

Understanding-oriented — discursive prose, no steps, no tables. Answers "why," not "how": the reader isn't trying to accomplish a task right now, they're building a mental model. Honest about tradeoffs — a one-sided "why we're right" is marketing copy, not an Explanation.

```markdown
# Understanding {Concept}

{One paragraph framing the question this doc answers — not "what is X" but "why does X work this way, what tradeoff does it represent."}

## The problem

{What forces / constraints made this decision or design necessary.}

## The approach

{What was chosen and why, in prose — not a table, not numbered steps.}

## Tradeoffs

{What this makes easy, what it makes hard, what alternatives were passed over and why.}

## See also

- {Link to a Reference doc for the concrete facts/API this explains}
- {Link to a How-To guide for the practical task this concept underlies}
```

## ADR (Architecture Decision Record)

Migrated from `_shared/decision-records.md`, which retains the 3-factor gate (hard-to-reverse AND surprising AND a real trade-off), the `docs/decisions/NNNN-{kebab-slug}.md` location convention, and the who-reads-who-writes contract. This is the literal skeleton only.

```markdown
# {NNNN}. {Decision title — a short noun phrase}

- **Status:** accepted
- **Date:** {YYYY-MM-DD}
- **Context:** {spec #, brief, or work that produced this decision}

## Context

{The forces at play — what made this decision necessary, what constraints applied. State the problem, not the solution.}

## Decision

{What we chose, in one or two sentences.}

## Alternatives considered

- **{Alternative A}** — {why we rejected it}
- **{Alternative B}** — {why we rejected it}

## Consequences

{What this makes easy, what it makes hard, and what would force us to revisit it.}
```

`Status` is `accepted` for a decision being recorded after the fact. If a later ADR overturns this one, change its status to `superseded by NNNN` rather than deleting it.

## Journey

Migrated from `journeys/journey-template.md`, which retains the key principles ("should feel" is the most important field; `files:` enables `/review`'s regression detection; one journey per goal; personas are specific people) and the `docs/journeys/{journey-name}.md` location convention. This is the literal skeleton only.

```markdown
---
files:
  - {path/to/key-source-file.ts}
  - {path/to/another-file.ts}
---

# {Journey Name}

**Persona:** {Who is this user? Be specific — not "user" but "first-time visitor with no account" or "developer setting up local environment"}
**Goal:** {What are they trying to accomplish?}
**Entry point:** {Where do they start? URL or trigger}
**Success state:** {What does "done" look like? What should they feel at the end?}

## Steps

### 1. {Step name} — {Page or action}
- **URL:** {path}
- **Action:** {What the user does}
- **Should feel:** {The emotional/experiential quality — "fast and effortless", "guided but not forced", "like an accomplishment"}
- **Should understand:** {What the user should know after this step}
- **Red flags:** {What would make this step fail experientially — not just functionally}

### 2. {Next step}
...

## Origin
- Created during build of {spec number or design doc}
- Steps {N-M} built in this session
- Related specs: {list}
```
```

- [ ] **Step 2: Verify the file**

Run: `grep -c "^## " skills/_shared/diataxis-genre-templates.md`
Expected: `6`

Run: `grep -c '```markdown' skills/_shared/diataxis-genre-templates.md`
Expected: `6`

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/diataxis-genre-templates.md
git commit -m "Add unified Diataxis genre-template library"
```

---

### Task 10: Migrate the ADR template out of decision-records.md

**Files:**
- Modify: `skills/_shared/decision-records.md:31-56`

**Interfaces:**
- Consumes: `skills/_shared/diataxis-genre-templates.md`'s ADR section (Task 9).

- [ ] **Step 1: Make the edit**

Replace lines 31-56 (the entire `## Template` section, from `## Template` through the closing ` ``` ` of the template code block) with:

```markdown
## Template

The literal ADR template lives in `skills/_shared/diataxis-genre-templates.md`'s ADR section — read that file for the current skeleton. This file owns the gate, location convention, and who-reads-who-writes contract above; the template body is shared with `/claude-tweaks:init`'s missing-doc scaffolding and `/claude-tweaks:wrap-up`'s missing-doc detection, so it lives in one place rather than three.
```

Leave everything else in the file (lines 1-30 and lines 58-71 of the original) unchanged — this includes the paragraph beginning `` `Status` is `accepted`... `` immediately after the template, which stays as-is.

- [ ] **Step 2: Verify the edit**

Run: `grep -c "^# {NNNN}" skills/_shared/decision-records.md`
Expected: `0` (the literal template body must be gone)

Run: `grep -c "diataxis-genre-templates.md" skills/_shared/decision-records.md`
Expected: `1`

Run: `grep -c "3-factor gate" skills/_shared/decision-records.md`
Expected: at least `1` (confirms the gate content survived)

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/decision-records.md
git commit -m "Migrate ADR template body into the shared genre-template library"
```

---

### Task 11: Migrate the Journey template out of journey-template.md

**Files:**
- Modify: `skills/journeys/journey-template.md:9-41`

**Interfaces:**
- Consumes: `skills/_shared/diataxis-genre-templates.md`'s Journey section (Task 9).

- [ ] **Step 1: Make the edit**

Replace lines 9-41 (the entire `## Template` section, from `## Template` through the closing ` ``` ` of the template code block) with:

```markdown
## Template

The literal journey template lives in `skills/_shared/diataxis-genre-templates.md`'s Journey section — read that file for the current skeleton (including the `files:` frontmatter field referenced in Key Principles below). This file owns the file-location convention and key principles; the template body is shared with `/claude-tweaks:init`'s missing-doc scaffolding and `/claude-tweaks:wrap-up`'s missing-doc detection, so it lives in one place rather than three.
```

Leave `## File location` (lines 5-7) and `## Key Principles` (lines 43-49 of the original) unchanged.

- [ ] **Step 2: Verify the edit**

Run: `grep -c "^# {Journey Name}" skills/journeys/journey-template.md`
Expected: `0` (the literal template body must be gone)

Run: `grep -c "diataxis-genre-templates.md" skills/journeys/journey-template.md`
Expected: `1`

Run: `grep -c "Key Principles" skills/journeys/journey-template.md`
Expected: `1` (confirms the heading survived)

- [ ] **Step 3: Commit**

```bash
git add skills/journeys/journey-template.md
git commit -m "Migrate Journey template body into the shared genre-template library"
```

---

### Task 12: Write /wrap-up's docs-health integration sub-file

**Files:**
- Create: `skills/wrap-up/docs-health-integration.md`

**Interfaces:**
- Consumes: `_shared/criteria-docs-diataxis.md` (Task 6), the docs-health CLI subcommands (Task 3), `skills/_shared/diataxis-genre-templates.md` (Task 9), `bin/lib/issues/record.js#extractFingerprint` (existing), `bin/docs-health.js validate-findings` (existing).
- Produces: the D1/D2 procedure referenced by `wrap-up/SKILL.md` Step 6.1 (Task 13).

- [ ] **Step 1: Write the file**

```markdown
# Docs-Health Integration for /wrap-up Step 6.1

Loaded by `/claude-tweaks:wrap-up` Step 6.1 to judge the health of docs this work actually touched, and to detect documentation this work should have produced but didn't. Two independent checks — D1 judges existing docs, D2 judges the diff for missing coverage.

## D1: Inline JUDGE application

**Scope:** every doc under `docs/**` that this work edited or newly created (`git diff --name-only` against the run's base, filtered to `docs/**/*.md`). Registry-matched-but-unedited docs are Step 6.1's existing "should this have been updated" concern — not this check's job; don't re-scope this to include them.

For each doc in scope:

1. Read the doc in full.
2. Apply the full JUDGE procedure from `_shared/criteria-docs-diataxis.md` (genre-drift including placement-fit, depth-mismatch, findability, staleness including freshness-dependencies, dual-persona misleading-risk) — the identical procedure `/claude-tweaks:docs-health` Step 3 applies, reused inline here rather than invoking `/claude-tweaks:docs-health` as a nested skill call (same reuse pattern Step 7 already applies to `_shared/harness-health-analysis.md`).
3. Run the same verify gate `/claude-tweaks:docs-health` Step 3.5 applies: is each finding real, actionable, and correctly `misleads`-tagged? Drop any that fail.

Route surviving findings by `classification`:

- **`additive`** → collect as `[doc] {file} — {description}` rows, folded into Step 6's existing configuration-update batch table (Step 9's Configuration Updates section) — applied inline in Step 10 exactly like any other approved doc edit.
- **`restructural`** → file as a `by:docs-health` GitHub issue via the existing dedup/filing CLI machinery, scoped to exactly this run's touched-doc IDs instead of a `next-target` rotation pick:

  ```bash
  gh issue list --label by:docs-health --state all --json number,state,labels,body --limit 500 > /tmp/wrapup-docs-health-issues-raw.json
  ```

  Parse via `extractFingerprint` (`bin/lib/issues/record.js`) into `{ number, state, labels, fingerprint }` objects, same as `/claude-tweaks:docs-health` Step 4, and write to `/tmp/wrapup-docs-health-issues.json`. Write this check's `restructural` findings to `/tmp/wrapup-docs-health-findings.json` in the same finding shape `_shared/criteria-docs-diataxis.md`'s "Emitting a finding" section defines, then:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" validate-findings /tmp/wrapup-docs-health-findings.json \
    --root "${ROOT:-$PWD}" --issues /tmp/wrapup-docs-health-issues.json --dry-run \
    > /tmp/wrapup-docs-health-payloads.json
  ```

  `--dry-run` here — wrap-up's own approval gate (Step 8.6 Review Console / Step 9 batch decision) is the point of approval, not `validate-findings`'s own dedup-and-file path. After the user approves at that gate, re-run the identical command without `--dry-run` so the cursor/cache state actually persists, then file each surviving payload with `gh issue create` exactly as `/claude-tweaks:docs-health` Step 6 does (same label set: `by:docs-health`, the scoring labels from that skill's classification table's `restructural` row, `ready`, `docs-health:restructural`).

## D2: Missing-documentation gap-detection

**Scope:** this work's full diff, not any existing doc — this check's input is code, so it never runs against the docs-health criteria fragment (which only ever takes a doc as input).

Ask: did this work introduce a new subsystem, skill, or architectural pattern with **zero existing doc coverage anywhere** in the project — not merely a small change that doesn't match a registry Auto-detect pattern, but something a future reader would have no doc to go to at all? This is a deliberately high bar. Examples that clear it: a new skill directory, a new top-level architectural pattern, a new user-facing capability with no existing doc even adjacent to it. Examples that don't: a new function in an already-documented module, a bug fix, a config tweak.

On a hit:

1. Infer the matching genre from what the new subsystem actually is (see `_shared/criteria-docs-diataxis.md` Dimension 1's "what it actually does" table) — a new skill's user-facing guide is typically How-To-shaped; a new architectural pattern is typically Explanation-shaped; a new API surface is typically Reference-shaped.
2. Propose a `[doc] {new-file-path} — Create: {one-line rationale}` row, folded into the same Step 6 batch table as D1's additive findings.
3. On approval, Step 10 scaffolds the new file from the matching section of `skills/_shared/diataxis-genre-templates.md`, then fills in real content from this work's own session context — unlike `/claude-tweaks:init` Phase 8.5's missing-doc detection (which only backlogs a pointer to the template, since it's scanning an unfamiliar codebase with no session context to fill anything in from), wrap-up has full context on what was just built and writes real content immediately.

Never propose more than one new doc per genuinely new subsystem — if the new subsystem spans multiple genres worth of content (e.g. both a How-To and a Reference), propose each as its own row rather than one doc trying to be two genres.
```

- [ ] **Step 2: Verify the file**

Run: `grep -c "^## D1" skills/wrap-up/docs-health-integration.md`
Expected: `1`

Run: `grep -c "^## D2" skills/wrap-up/docs-health-integration.md`
Expected: `1`

Run: `grep -c "harness-health-analysis.md" skills/wrap-up/docs-health-integration.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add skills/wrap-up/docs-health-integration.md
git commit -m "Add wrap-up docs-health integration sub-file (D1 inline judge, D2 missing-doc detection)"
```

---

### Task 13: Point wrap-up Step 6.1 at the new sub-file

**Files:**
- Modify: `skills/wrap-up/SKILL.md`

**Interfaces:**
- Consumes: `skills/wrap-up/docs-health-integration.md` (Task 12).

- [ ] **Step 1: Make the edit**

In `### 6.1: Documentation`, insert a new numbered item 4 immediately after the existing item 3 (`"Registry maintenance"`, which ends with its three sub-bullets) and before the `→ Collect each needed update as:` line, renumbering nothing else (items 1-3 keep their numbers; this becomes item 4, a sibling, not a replacement):

```markdown
4. **Docs-health check on touched docs, and missing-doc detection** — read `docs-health-integration.md` in this skill's directory for the full procedure: D1 judges every doc this work edited or created against the shared docs-health criteria (genre-drift, depth-mismatch, findability, staleness), routing `additive` findings into this step's own `[doc]` collection and filing `restructural` findings as GitHub issues; D2 detects when this work introduced a new subsystem with zero doc coverage anywhere and proposes scaffolding a new doc from the genre-template library. Both fold their output into this step's `[doc]` collection and the Step 9 batch table alongside items 1-3 above.
```

Also update the Relationship-to-Other-Skills table: add a new row (in the same alphabetical/logical position as other `_shared/*` references, e.g. immediately after the existing `_shared/decision-records.md` row):

```markdown
| `_shared/criteria-docs-diataxis.md`, `docs-health-integration.md` | Step 6.1 item 4 applies this shared judgment inline to docs touched by the current work (same reuse pattern as `_shared/harness-health-analysis.md` in Step 7), and detects missing documentation from the diff. |
```

- [ ] **Step 2: Verify the edit**

Run: `grep -c "docs-health-integration.md" skills/wrap-up/SKILL.md`
Expected: at least `2`

- [ ] **Step 3: Commit**

```bash
git add skills/wrap-up/SKILL.md
git commit -m "Point wrap-up Step 6.1 at the new docs-health integration sub-file"
```

---

### Task 14: Add per-folder landing pages and template references to docs-structure.md

**Files:**
- Modify: `skills/init/docs-structure.md`

**Interfaces:**
- Consumes: `skills/_shared/diataxis-genre-templates.md` (Task 9).

- [ ] **Step 1: Make the edits**

Insert a new subsection immediately after `## Standard Folder Taxonomy`'s Tier 3 example tree ends (after the line reading `` `  diagrams/                ← already exists (generated by /claude-tweaks:visualize)` `` and its closing code fence) and before `**Folder rule:**`:

```markdown

**Landing-page convention (Tier 2+):** any subfolder with 3+ files gets its own `index.md` listing its contents with one-line descriptions and links — e.g. `docs/guides/index.md` linking to `deployment.md`, `monitoring.md`, `migration-guide.md`. Pure markdown, no rendering technology implied. Phase 8.5's assessment (item 4 below) flags a folder missing this once it crosses the 3-file threshold; like everything else in this procedure, `/init` never writes the landing page itself — it's captured as a backlog item, same as a missing doc.
```

In the Registry Creation Procedure's item 4 ("**Quick-assess existing docs**"), add a new row to the existing check table immediately after the `"Oversized README"` row:

```markdown
   | **Missing landing page** | Folder has 3+ files, no `index.md` | "docs/guides/ has 5 files, no docs/guides/index.md" |
```

In item 5 ("**Identify missing docs**"), append a new paragraph and table immediately after the existing bullet list:

```markdown

   Each identified missing doc maps to a genre in `skills/_shared/diataxis-genre-templates.md` via the table below — reference the matching section in the backlog item body (step 8) so whoever builds it later starts from a skeleton, not a blank page:

   | Doc pattern | Genre |
   |---|---|
   | `getting-started.md` | Tutorial |
   | `api.md` / `api/*.md` | Reference |
   | `guides/*.md` (deployment, monitoring, migration) | How-To |
   | `architecture.md` | Explanation |
   | `decisions/*.md` | ADR |
   | `journeys/*.md` | Journey |
```

In item 8's backlog work-record example for `### Create docs/getting-started.md`, add one more line to that example immediately after its existing `"Tier 2 project — setup instructions should be split from README."` line:

```markdown
   Genre template: `skills/_shared/diataxis-genre-templates.md`'s Tutorial section.
```

- [ ] **Step 2: Verify the edits**

Run: `grep -c "Landing-page convention" skills/init/docs-structure.md`
Expected: `1`

Run: `grep -c "Missing landing page" skills/init/docs-structure.md`
Expected: `1`

Run: `grep -c "diataxis-genre-templates.md" skills/init/docs-structure.md`
Expected: at least `2`

- [ ] **Step 3: Commit**

```bash
git add skills/init/docs-structure.md
git commit -m "Add per-folder landing-page convention and genre-template references to docs-structure.md"
```

---

### Task 15: Sibling-file sweep for findability

**Files:**
- Modify: any file matching the grep below (expected: `skills/code-health/SKILL.md`, `skills/harness-health/SKILL.md`, `skills/journey-health/SKILL.md`, `skills/routine/SKILL.md`, `skills/tidy/SKILL.md`, `README.md`, `skills/help/reference-card.md` — the same 7 files the prior depth-mismatch pass updated, since they describe docs-health's dimension list; re-derive the actual list from the grep rather than trusting this expectation blindly)

**Interfaces:**
- Consumes: nothing new — mirrors the previous depth-mismatch sibling-sweep pattern from this same series of changes.

- [ ] **Step 1: Find every stale mention**

Run: `grep -rli "genre-drift.*depth-mismatch.*staleness\|depth-mismatch.*genre-drift.*staleness\|genre-drift[^.]\{0,60\}staleness" --include="*.md" . | grep -v "^./skills/_shared/criteria-docs-diataxis.md$\|^./skills/docs-health/SKILL.md$\|^./skills/wrap-up/docs-health-integration.md$\|^./skills/init/docs-structure.md$\|^./docs/superpowers/"`

This lists every remaining file that mentions docs-health's dimension list without `findability` (the four files already updated in Tasks 6-7, 12, 14 are excluded from this grep, along with the ephemeral `docs/superpowers/` build history). For each match, read the exact line and add `findability` to the enumeration, matching the surrounding phrasing style (e.g. `"genre-drift + depth-mismatch + staleness"` → `"genre-drift + depth-mismatch + findability + staleness"`, or `"genre-drift, depth-mismatch, or staleness"` → `"genre-drift, depth-mismatch, findability, or staleness"` — preserve whatever conjunction/separator style that file already uses).

- [ ] **Step 2: Verify no stale enumeration remains**

Re-run the same grep from Step 1.
Expected: empty output (zero matches)

Also run a second, differently-anchored sweep to catch phrasing the first pattern might miss (matching this project's own documented lesson that a single keyword-anchored grep can miss a differently-phrased instance — see `_shared/criteria-docs-diataxis.md`'s own `Dimension 5` intro for one such earlier miss-and-catch during this same series):

Run: `grep -rli "docs-health" --include="*.md" . | grep -v "^./skills/_shared/criteria-docs-diataxis.md$\|^./skills/docs-health/SKILL.md$\|^./skills/wrap-up/docs-health-integration.md$\|^./skills/init/docs-structure.md$\|^./docs/superpowers/" | xargs grep -Li "findability" 2>/dev/null`

Read every file this second sweep surfaces and judge by hand whether it makes a claim about docs-health's dimension count/list that's now stale (not every file mentioning "docs-health" needs a findability mention — only ones enumerating its dimensions). Fix any genuine stale claims found.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Sweep sibling files for stale docs-health dimension enumerations"
```

---

## Final Verification

After all 15 tasks are complete, run the full test suite from the repository root:

```bash
npm test
```

Expected: all tests pass, including the new `findability.test.js`, `freshness.test.js`, `cli-find-refs.test.js`, `cli-check-freshness.test.js`, and the extended `validate-finding.test.js` and `scope.test.js`.
