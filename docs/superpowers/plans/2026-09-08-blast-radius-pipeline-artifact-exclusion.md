# Blast-Radius Pipeline-Artifact Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exclude the pipeline's own generated bookkeeping paths (a materialized spec, a `writing-plans` implementation plan doc) from `bin/blast-radius.js`'s `implLines`/`implFiles` counting, so merge-check's blast-radius judgment reflects real code risk rather than pipeline ceremony.

**Architecture:** Add a third file classification — `isPipelineArtifact` — to `classifyDiffFiles`, parallel to the existing `isTest`/`isSensitive` flags, matched against two glob patterns via the module's existing `globToRegExp` matcher. `blastRadiusSummary` routes a pipeline-artifact file into new `pipelineArtifactLines`/`pipelineArtifactFiles` counters instead of `implLines`/`implFiles` (checked before the `isTest` branch, since precedence between the two never actually matters for real paths — a spec/plan `.md` file never also matches the test-path patterns).

**Tech Stack:** Plain Node.js (`plugin/bin/lib/issues/blast-radius.js`), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-09-08T041856-record-1906/work/1906-spec.md`

## Global Constraints

- Reuse the existing `globToRegExp` glob matcher (already used for `isSensitivePath`) — do not add a second glob-matching implementation.
- `blastRadiusSummary`'s return shape gains exactly two new keys (`pipelineArtifactLines`, `pipelineArtifactFiles`); every existing key (`implLines`, `testLines`, `implFiles`, `testFiles`, `sensitiveFilesTouched`) keeps its exact current meaning and computation for every non-pipeline-artifact file.
- Do not touch `plugin/bin/lib/dispatch/ceremony-derive.js` — its own `isDocsPath` heuristic serves a different purpose (ceremony-profile derivation) and is out of this record's scope.
- Commit tests only where the task asks for them or the repo already keeps tests for this kind of change, sized like the neighboring test files. Touch only what the task requires.

---

### Task 1: Add pipeline-artifact classification and counters to blast-radius.js

**Files:**
- Modify: `plugin/bin/lib/issues/blast-radius.js`
- Modify: `plugin/skills/assess-agent-autonomy/merge-check.md` (CLI-output field list only)
- Test: `tests/bin-lib/issues/blast-radius.test.js`

**Interfaces:**
- Consumes: existing `globToRegExp(glob)` (already exported), existing `classifyDiffFiles(files, sensitivePaths)` / `blastRadiusSummary(classifiedFiles)` signatures — unchanged.
- Produces: `classifyDiffFiles` output gains a per-file boolean `isPipelineArtifact`. `blastRadiusSummary` output gains `pipelineArtifactLines` (number) and `pipelineArtifactFiles` (number). No new exports beyond what's already exported (`classifyDiffFiles`, `blastRadiusSummary`, `isSensitivePath`, `globToRegExp`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/bin-lib/issues/blast-radius.test.js`, after the existing `#727` glob-crossing tests and before the final `globToRegExp is exported...` test:

```javascript
// --- #1906: pipeline-artifact paths (materialized spec + writing-plans doc)
// excluded from impl counting ---

test('classifyDiffFiles marks a materialized spec path (single-record shape) as isPipelineArtifact', () => {
  const files = [{ path: '.claude-tweaks/pipelines/2026-09-08T041856-record-1906/work/1906-spec.md', additions: 39, deletions: 0 }];
  const result = classifyDiffFiles(files, []);
  assert.strictEqual(result[0].isPipelineArtifact, true);
});

test('classifyDiffFiles marks a materialized spec path (multi-record shape) as isPipelineArtifact', () => {
  const files = [{ path: '.claude-tweaks/pipelines/2026-09-08T041856-spec-1-2/spec-1/work/1-spec.md', additions: 20, deletions: 0 }];
  const result = classifyDiffFiles(files, []);
  assert.strictEqual(result[0].isPipelineArtifact, true);
});

test('classifyDiffFiles marks a writing-plans doc path as isPipelineArtifact', () => {
  const files = [{ path: 'docs/superpowers/plans/2026-09-08-some-feature.md', additions: 111, deletions: 0 }];
  const result = classifyDiffFiles(files, []);
  assert.strictEqual(result[0].isPipelineArtifact, true);
});

test('classifyDiffFiles marks an ordinary docs file outside plans/ as not isPipelineArtifact', () => {
  const files = [{ path: 'docs/README.md', additions: 5, deletions: 0 }];
  const result = classifyDiffFiles(files, []);
  assert.strictEqual(result[0].isPipelineArtifact, false);
});

test('classifyDiffFiles marks an ordinary implementation file as not isPipelineArtifact', () => {
  const files = [{ path: 'bin/lib/issues/grouping.js', additions: 28, deletions: 5 }];
  const result = classifyDiffFiles(files, []);
  assert.strictEqual(result[0].isPipelineArtifact, false);
});

test('blastRadiusSummary routes pipeline-artifact files into pipelineArtifactLines/pipelineArtifactFiles, not impl (#1906 AC-1: spec + plan doc only, no real code)', () => {
  const classified = classifyDiffFiles(
    [
      { path: '.claude-tweaks/pipelines/2026-09-08T041856-record-1906/work/1906-spec.md', additions: 39, deletions: 0 },
      { path: 'docs/superpowers/plans/2026-09-08-blast-radius-pipeline-artifact-exclusion.md', additions: 111, deletions: 0 },
    ],
    [],
  );
  assert.deepStrictEqual(blastRadiusSummary(classified), {
    implLines: 0,
    testLines: 0,
    implFiles: 0,
    testFiles: 0,
    pipelineArtifactLines: 150,
    pipelineArtifactFiles: 2,
    sensitiveFilesTouched: [],
  });
});

test('blastRadiusSummary separates a mixed diff: one pipeline-artifact path plus one ordinary impl file', () => {
  const classified = classifyDiffFiles(
    [
      { path: '.claude-tweaks/pipelines/2026-09-08T041856-record-1906/work/1906-spec.md', additions: 39, deletions: 0 },
      { path: 'plugin/bin/lib/issues/blast-radius.js', additions: 20, deletions: 3 },
    ],
    [],
  );
  const summary = blastRadiusSummary(classified);
  assert.strictEqual(summary.implLines, 23);
  assert.strictEqual(summary.implFiles, 1);
  assert.strictEqual(summary.pipelineArtifactLines, 39);
  assert.strictEqual(summary.pipelineArtifactFiles, 1);
});
```

Also update the two existing full-object `deepStrictEqual` assertions to include the two new zero-valued fields, since `blastRadiusSummary`'s return shape is changing for every caller:

```javascript
test('blastRadiusSummary sums impl and test lines separately, #18-shaped fixture', () => {
  const classified = classifyDiffFiles(
    [
      { path: 'bin/lib/issues/grouping.js', additions: 28, deletions: 5 },
      { path: 'bin/lib/issues/tests/grouping.test.js', additions: 38, deletions: 1 },
    ],
    [],
  );
  assert.deepStrictEqual(blastRadiusSummary(classified), {
    implLines: 33,
    testLines: 39,
    implFiles: 1,
    testFiles: 1,
    pipelineArtifactLines: 0,
    pipelineArtifactFiles: 0,
    sensitiveFilesTouched: [],
  });
});
```

```javascript
test('blastRadiusSummary returns all-zero summary for an empty file list', () => {
  assert.deepStrictEqual(blastRadiusSummary([]), {
    implLines: 0,
    testLines: 0,
    implFiles: 0,
    testFiles: 0,
    pipelineArtifactLines: 0,
    pipelineArtifactFiles: 0,
    sensitiveFilesTouched: [],
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/blast-radius.test.js`
Expected: FAIL — `isPipelineArtifact` is `undefined` (fails the `strictEqual(..., true)` assertions), and the two `deepStrictEqual` assertions fail because the actual object is missing `pipelineArtifactLines`/`pipelineArtifactFiles`.

- [ ] **Step 3: Implement the pipeline-artifact classification**

In `plugin/bin/lib/issues/blast-radius.js`, add after the `TEST_PATH_RE`/`TEST_SUFFIX_RE`/`isTestPath` block (before the `globRegExpCache`/`globToRegExp` block — `isPipelineArtifactPath` below needs `globToRegExp`, so keep it after that block instead; insert it immediately after `globToRegExp`'s closing brace, before `isSensitivePath`):

```javascript
// #1906: pipeline-generated bookkeeping paths — a materialized spec
// (flow/materialize.md's single-record `{run-id}/work/{n}-spec.md` and
// multi-record `{run-id}/spec-{a}/work/{a}-spec.md` shapes) and a
// superpowers:writing-plans implementation plan doc
// (docs/superpowers/plans/*.md) — are conflated with real implementation
// risk if counted as impl lines/files. These globs are fixed claude-tweaks
// plugin conventions (not project-specific config), so they're hardcoded
// here rather than read from policy, the same way TEST_PATH_RE/TEST_SUFFIX_RE
// are hardcoded conventions rather than configurable.
const PIPELINE_ARTIFACT_GLOBS = ['.claude-tweaks/pipelines/**/work/*-spec.md', 'docs/superpowers/plans/*.md'];

function isPipelineArtifactPath(path) {
  return PIPELINE_ARTIFACT_GLOBS.some((glob) => globToRegExp(glob).test(path));
}
```

Update `classifyDiffFiles` to add the new flag:

```javascript
function classifyDiffFiles(files, sensitivePaths = []) {
  return (files || []).map((f) => ({
    path: f.path,
    isTest: isTestPath(f.path),
    isPipelineArtifact: isPipelineArtifactPath(f.path),
    isSensitive: isSensitivePath(f.path, sensitivePaths),
    additions: f.additions || 0,
    deletions: f.deletions || 0,
  }));
}
```

Update `blastRadiusSummary` to route pipeline-artifact files into their own counters, checked before the test branch:

```javascript
function blastRadiusSummary(classifiedFiles) {
  const summary = {
    implLines: 0,
    testLines: 0,
    implFiles: 0,
    testFiles: 0,
    pipelineArtifactLines: 0,
    pipelineArtifactFiles: 0,
    sensitiveFilesTouched: [],
  };
  for (const f of classifiedFiles || []) {
    const lines = f.additions + f.deletions;
    if (f.isPipelineArtifact) {
      summary.pipelineArtifactLines += lines;
      summary.pipelineArtifactFiles += 1;
    } else if (f.isTest) {
      summary.testLines += lines;
      summary.testFiles += 1;
    } else {
      summary.implLines += lines;
      summary.implFiles += 1;
    }
    if (f.isSensitive) summary.sensitiveFilesTouched.push(f.path);
  }
  return summary;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/blast-radius.test.js`
Expected: PASS — all tests in the file, including the new ones and the two updated `deepStrictEqual` assertions.

- [ ] **Step 5: Update merge-check.md's CLI-output field list**

In `plugin/skills/assess-agent-autonomy/merge-check.md`, find this line (in the section describing what `bin/blast-radius.js` prints):

```markdown
It prints one JSON object: `mergeBase` (the resolved base commit), `config`
(`mergeSensitivePaths` list plus the two `autoMergeMax*` numbers, resolved from this project's
policy by the CLI itself), and `summary` (`implLines`/`implFiles`/`testLines`/`testFiles`/
`sensitiveFilesTouched`) — everything Step 2 weighs.
```

Replace the `summary` parenthetical with the full current field list (six fields now instead of five), changing nothing else on the line or in the surrounding paragraph:

```markdown
It prints one JSON object: `mergeBase` (the resolved base commit), `config`
(`mergeSensitivePaths` list plus the two `autoMergeMax*` numbers, resolved from this project's
policy by the CLI itself), and `summary` (`implLines`/`implFiles`/`testLines`/`testFiles`/
`pipelineArtifactLines`/`pipelineArtifactFiles`/`sensitiveFilesTouched` — the last two excluding
a materialized spec or writing-plans doc from `implLines`/`implFiles`, #1906) — everything
Step 2 weighs.
```

Do not change any other line in `merge-check.md` — the Step 2 judgment prose already treats the summary's numbers as inputs, not ground truth, and needs no edit.

- [ ] **Step 6: Run the full blast-radius/merge-check test surface**

Run: `node --test tests/bin-lib/issues/blast-radius.test.js tests/bin-lib/blast-radius-cli.test.js tests/blast-radius-cli-e2e.test.js tests/blast-radius-snippet.test.js`
Expected: PASS — confirms no consumer outside `blast-radius.js` itself broke on the shape change (`blast-radius-cli.test.js` only asserts on `.summary.sensitiveFilesTouched`, never the full object, so it is unaffected).

- [ ] **Step 7: Run the full acceptance-criteria check (AC-1)**

Run (from the worktree root, against a scratch scenario — this reproduces AC-1's literal CLI invocation without needing a real second commit): `node -e "const {classifyDiffFiles,blastRadiusSummary}=require('./plugin/bin/lib/issues/blast-radius.js'); const files=[{path:'.claude-tweaks/pipelines/x/work/1-spec.md',additions:39,deletions:0},{path:'docs/superpowers/plans/2026-09-08-x.md',additions:111,deletions:0}]; console.log(JSON.stringify(blastRadiusSummary(classifyDiffFiles(files,[]))))"`
Expected: `{"implLines":0,"testLines":0,"implFiles":0,"testFiles":0,"pipelineArtifactLines":150,"pipelineArtifactFiles":2,"sensitiveFilesTouched":[]}` — `implLines`/`implFiles` both `0`, matching AC-1's literal requirement.

- [ ] **Step 8: Commit**

```bash
git add plugin/bin/lib/issues/blast-radius.js plugin/skills/assess-agent-autonomy/merge-check.md tests/bin-lib/issues/blast-radius.test.js
git commit -m "Exclude pipeline-artifact paths from blast-radius impl counting (refs #1906)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TbnPKu4Lo3AAF2iwr4K234"
```
