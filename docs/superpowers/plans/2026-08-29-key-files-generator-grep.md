# Key Files Generated-File Grep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document a generated-file grep in `/specify`'s Key Files guidance so a spec never again lists a generated file without its generator (#326's failure), and pin the procedure with a live-probe conformance suite.

**Architecture:** Two prose edits stated once at the contract's single home (`spec-template.md`'s `### Key Files`, mirroring the existing rename-grep paragraph) plus a one-clause citation extension in `shaping-mode.md`; one new `node --test` suite following the `skill-prose-conformance-tests` conventions (live-corpus pin + extract-and-run snippet + frozen pre-change go-red control).

**Tech Stack:** Markdown skill prose; Node built-in `node:test`; `bash`/`grep` for the live probe.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T161815-spec-1321/work/1321-spec.md`

## Global Constraints

- `plugin/skills/specify/spec-template.md` must stay ≤ 28,672 bytes after editing (`tests/bin-lib/skill-audit/context-cost.test.js:114`, `SPECIFY_SUBFILE_CEILING_BYTES`). Current size 24,930 bytes; the insertion below is ~1.6 KB, landing ≈ 26.5 KB.
- No literal placeholder tokens (`TBD`/`TODO`-class) anywhere in the composed prose — the spec-shaped-body grep is context-insensitive.
- Assert on `grep -l` file paths, never match counts.
- Test literals are copied from this plan's own replacement text, never retyped from memory (skill-prose-conformance-tests Project Conventions).
- **Pre-verified facts (verbatim-command run-once check, executed 2026-08-29 against this worktree):** `grep -rln "track-issue-fixes.yml" plugin/bin plugin/hooks scripts tools` → exactly `plugin/bin/lib/issue-branch-tracking.js`; `grep -rln "feedback-objectives.md" …` → zero hits (exit 1); `git ls-files | grep -c "/track-issue-fixes.yml$"` → 1; `git ls-files | grep -c "/cache.js$"` → 6; `plugin/skills/specify/record-creation-subissues.md` contains zero `rename-grep` citations, so Deliverable 5's negative case holds — no diff to that file is expected or wanted; `bin/lib/issues/grouping.js`'s `extractKeyFilesSection` takes the *first* backticked span per bullet ("drops the trailing annotation", grouping.js:184-187), so the new annotation cannot corrupt file-overlap detection.

---

### Task 1: Generated-file grep paragraph + citation clause + conformance suite

**Files:**
- Create: `tests/spec-template-generator-grep.test.js`
- Modify: `plugin/skills/specify/spec-template.md` (insert after the rename-grep paragraph — the paragraph beginning `When this work **renames** a contract surface` — and before `### Package Dependencies`)
- Modify: `plugin/skills/specify/shaping-mode.md` (the line-68 Key Files sentence)

**Interfaces:**
- Consumes: nothing from other tasks (single-task plan).
- Produces: the pinned snippet literal `grep -rln "{basename}" plugin/bin plugin/hooks scripts tools 2>/dev/null` and the annotation literal `edit the generator, not this file` — both asserted by the suite exactly as written in Steps 3-4 below.

- [ ] **Step 1: Write the failing test**

Create `tests/spec-template-generator-grep.test.js` with exactly:

````js
'use strict';
// Conformance suite for spec-template.md's generated-file grep (record #1321).
// Live-corpus read is deliberate: the paragraph IS the declared contract being
// pinned, and catching future drift in it is the point (skill-prose-conformance-tests
// Decision Framework, live-corpus convention row). Go-red proofs per [IL-105] run
// every pattern against the frozen pre-change excerpt below.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const specTemplate = fs.readFileSync(path.join(ROOT, 'plugin/skills/specify/spec-template.md'), 'utf8');
const shapingMode = fs.readFileSync(path.join(ROOT, 'plugin/skills/specify/shaping-mode.md'), 'utf8');

// The exact snippet the paragraph pins (copied from the edit's replacement text).
const SNIPPET = 'grep -rln "{basename}" plugin/bin plugin/hooks scripts tools 2>/dev/null';
// Structural anchor: the bash fence whose first line is the {basename} grep —
// never a prose sentence (skill-prose-conformance-tests: anchor on structure).
const EXTRACT_RE = /```bash\n(grep -rln "\{basename\}"[^\n]*)\n```/;

// Frozen pre-change excerpt — the Key Files guidance tail before #1321's paragraph
// landed. It carries the section anchor and the rename-grep opening and lacks only
// the new content, so doesNotMatch proves each pattern can go red [IL-105]. A string
// literal, not a read of history, so it survives every later edit to the live file.
const PRE_CHANGE_KEY_FILES_TAIL = `### Key Files

- \`{path}\` — {what changes or new file purpose}
- \`{path}\` — {what changes}

When this work **renames** a contract surface — a report section heading, a check name, an exported symbol, or any other name other files reference by literal text — grep the repo for the surface's exact old literal text.

### Package Dependencies
`;

function assertPinned(haystack, pattern, msg) {
  assert.match(haystack, pattern, msg);
  assert.doesNotMatch(PRE_CHANGE_KEY_FILES_TAIL, pattern, 'pattern must NOT match the pre-change excerpt (proves it can go red)');
}

test('spec-template.md pins the generated-file grep paragraph', () => {
  assertPinned(specTemplate, /generated-file grep/, 'paragraph anchor missing');
  assertPinned(specTemplate, /edit the generator, not this file/, 'generated-entry annotation rule missing');
  assertPinned(specTemplate, /both reads and writes/, 'read-and-write producer classification missing');
  assertPinned(specTemplate, /git ls-files \| grep -c "\/\{basename\}\$"/, 'concrete path-fallback trigger missing');
});

test('the byte-pinned snippet is present and extractable by structural anchor', () => {
  const m = EXTRACT_RE.exec(specTemplate);
  assert.ok(m, 'extraction pattern is out of sync — bash fence opening with the {basename} grep not found');
  assert.strictEqual(m[1], SNIPPET, 'snippet drifted from the pinned literal');
  assert.strictEqual(EXTRACT_RE.exec(PRE_CHANGE_KEY_FILES_TAIL), null, 'extractor must find nothing in the pre-change excerpt (proves it discriminates)');
});

test('shaping-mode.md cites the generated-file grep alongside the rename-grep', () => {
  assert.match(shapingMode, /generator module the generated-file grep/, 'shaping-mode citation clause missing');
  assert.doesNotMatch(PRE_CHANGE_KEY_FILES_TAIL, /generator module the generated-file grep/, 'citation pattern must not match the pre-change excerpt');
  assert.match(shapingMode, /rename-grep/, 'rename-grep citation must survive the clause insertion');
});

test('live probe: the snippet finds the real generator from its generated file', () => {
  const cmd = SNIPPET.replace('{basename}', 'track-issue-fixes.yml');
  const r = spawnSync('bash', ['-c', cmd], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, 'probe grep failed: ' + r.stderr);
  const hits = r.stdout.trim().split('\n');
  assert.ok(hits.includes('plugin/bin/lib/issue-branch-tracking.js'), 'generator not surfaced; got: ' + r.stdout);
});

test('negative control: a producer-less basename yields zero executable-code hits', () => {
  // feedback-objectives.md verified zero-hit at plan time; a future spurious hit
  // here means the control needs re-picking, not that the product regressed.
  const cmd = SNIPPET.replace('{basename}', 'feedback-objectives.md');
  const r = spawnSync('bash', ['-c', cmd], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  // grep -l exits 1 on zero matches — that IS the expected outcome here.
  assert.ok(r.status === 0 || r.status === 1, 'probe errored: ' + r.stderr);
  assert.strictEqual(r.stdout.trim(), '', 'expected zero hits, got: ' + r.stdout);
});
````

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node --test tests/spec-template-generator-grep.test.js`
Expected: FAIL — the three pin tests fail (paragraph absent); the two probe tests already pass (they exercise the repo, not the prose). That partial red is correct: the pins are what the edits must turn green.

- [ ] **Step 3: Insert the generated-file grep paragraph into spec-template.md**

In `plugin/skills/specify/spec-template.md`, find the rename-grep paragraph (begins `When this work **renames** a contract surface`, ends `` `[IL-132]`). ``) and insert immediately after it (blank line before and after, before `### Package Dependencies`):

````markdown
Run the **generated-file grep** for every entry above, rename or not — the rename-grep's mirror: it finds an entry's *producer*, where the rename-grep finds a surface's *consumers*. Incident: #326 (filed as #1321) — the spec listed only `.github/workflows/track-issue-fixes.yml`, never its source of truth, `plugin/bin/lib/issue-branch-tracking.js`'s `generateWorkflowYaml()` (whose header comment names that path), so the build edited the generated file. Grep the four conventional executable-code locations — the closed set for this check — for the entry's basename:

```bash
grep -rln "{basename}" plugin/bin plugin/hooks scripts tools 2>/dev/null
```

When the basename matches more than one tracked file (`git ls-files | grep -c "/{basename}$"` prints more than 1 — e.g. `cache.js`, 6 today) or the bare-basename grep returns too many hits to read, re-grep with the entry's repo-relative path instead — the pinned snippet above is the basename form only. Skip the same historical mentions the rename-grep skips (one shared skip list — the rename-grep's, above — adding generator-specific entries only if build-time hits show the need). Read each remaining hit and classify: a module that generates or writes the entry's content is its **source of truth** — a hit that both reads and writes still counts as a producer — so list that module here as the primary edit target and annotate the generated entry's own bullet `— generated by \`{module}\`: edit the generator, not this file` (`extractKeyFilesSection` reads only the bullet's first backticked span, so the annotation never pollutes file-overlap detection). A hit that merely *reads* the entry is a consumer — the rename-grep's territory — skip it. Accepted misses, by design: a generator that assembles the target path by string concatenation, and a generator outside the four directories above.
````

- [ ] **Step 4: Extend shaping-mode.md's citation sentence**

In `plugin/skills/specify/shaping-mode.md` line 68, replace:

```
plus — when the work renames a contract surface — every consumer file the rename-grep in `spec-template.md`'s `### Key Files` guidance turns up. One bullet per path,
```

with:

```
plus — when the work renames a contract surface — every consumer file the rename-grep in `spec-template.md`'s `### Key Files` guidance turns up, plus — always — every generator module the generated-file grep in that same guidance turns up, with the generated entry annotated per that guidance. One bullet per path,
```

- [ ] **Step 5: Run the suite to verify it passes**

Run: `node --test tests/spec-template-generator-grep.test.js`
Expected: PASS — all 5 tests.

- [ ] **Step 6: Size-ceiling and adjacent-suite verification**

Run: `wc -c plugin/skills/specify/spec-template.md plugin/skills/specify/shaping-mode.md`
Expected: spec-template.md ≤ 28672 (≈ 26.5 KB), shaping-mode.md ≈ 8.6 KB.
Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js tests/terminal-track.test.js tests/specify-decomposition-collapse.test.js tests/review-risk-marker-verification.test.js tests/bin-lib/issues/grouping.test.js tests/shaping-mode-needs-removal.test.js`
Expected: PASS — these are the suites that read the two edited files.

- [ ] **Step 7: Commit**

```bash
git add tests/spec-template-generator-grep.test.js plugin/skills/specify/spec-template.md plugin/skills/specify/shaping-mode.md
git commit -m "specify: document the generated-file grep in Key Files guidance (refs #1321)"
```
