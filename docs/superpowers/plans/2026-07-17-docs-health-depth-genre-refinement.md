# docs-health: depth-mismatch + genre-drift refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sharpen `docs-health`'s genre-drift judgment (exempt non-Diátaxis-native genres, require
actual misleading risk) and add a new, mechanically-anchored depth-mismatch dimension, per
`docs/superpowers/specs/2026-07-17-docs-health-depth-genre-refinement-design.md`.

**Architecture:** One new pure-function helper (`bin/lib/docs-health/depth.js`), one new CLI
subcommand exposing it (`docs-health.js word-count`), one new `category` enum value
(`validate-finding.js`), and criteria/procedure prose updates across `_shared/criteria-docs-diataxis.md`
and `skills/docs-health/SKILL.md`. A repo-wide sweep fixes five sibling-skill relationship-table
rows and two reference docs that name docs-health's dimensions verbatim. No changes to target
selection, dedup, fingerprinting, or scoring — the pipeline shape is untouched.

**Tech Stack:** Node.js (`node --test`), no new dependencies.

## Global Constraints

- No universal word-count thresholds or tier labels (e.g. "300 words = overview") — the mechanical
  helper returns a raw count; only the LLM judge interprets it against a given doc's own context.
- No hardcoded per-project directory-to-genre tables — native-genre detection is a content-shape
  check; directory naming is a hint only, never a verdict.
- No changes to `fingerprint.js`, `cache.js`, or `issue-payload.js`'s `CLASSIFICATION_SCORING` —
  both existing category values already exercise every downstream code path a third value needs.
- `depth-mismatch` findings never flag length by itself — only a mismatch between implied and found
  depth, exactly mirroring how `genre-drift` never flags a mismatch that wouldn't actually mislead.

---

## File Structure

| File | Responsibility |
|---|---|
| `bin/lib/docs-health/depth.js` (new) | Pure function: doc content → word count, or the doc's own `depth-hint:` frontmatter value if present |
| `bin/lib/docs-health/tests/depth.test.js` (new) | Unit tests for the above |
| `bin/lib/docs-health/validate-finding.js` | Add `"depth-mismatch"` to `CATEGORY_VALUES` |
| `bin/lib/docs-health/tests/validate-finding.test.js` | Add one acceptance test for the new category |
| `bin/docs-health.js` | New `cmdWordCount` + `word-count` CLI subcommand wiring |
| `bin/lib/docs-health/tests/cli-word-count.test.js` (new) | End-to-end CLI tests for the subcommand |
| `skills/_shared/criteria-docs-diataxis.md` | Judgment prose: Dimension 1 rewrite, new Dimension 3, renumbered Dimension 4, updated enums/bullets |
| `skills/docs-health/SKILL.md` | Frontmatter, header, When-to-Use, Step 3 procedure, Anti-Patterns table |
| `skills/code-health/SKILL.md`, `skills/harness-health/SKILL.md`, `skills/journey-health/SKILL.md`, `skills/routine/SKILL.md`, `skills/tidy/SKILL.md` | One-line relationship-table phrase updates |
| `README.md`, `skills/help/reference-card.md` | One-line description updates |

---

### Task 1: `depth.js` — mechanical word-count helper

**Files:**
- Create: `bin/lib/docs-health/depth.js`
- Test: `bin/lib/docs-health/tests/depth.test.js`

**Interfaces:**
- Produces: `computeWordCount(content: string): number | string` — a plain integer word count, or
  (when the doc's frontmatter declares `depth-hint:`) that value's literal string. Consumed by
  Task 3's `cmdWordCount`.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/docs-health/tests/depth.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { computeWordCount } = require('../depth');

test('computeWordCount counts plain words with no frontmatter', () => {
  const result = computeWordCount('one two three four five');
  assert.strictEqual(result, 5);
});

test('computeWordCount strips frontmatter before counting', () => {
  const content = ['---', 'title: Foo', '---', 'one two three'].join('\n');
  const result = computeWordCount(content);
  assert.strictEqual(result, 3);
});

test('computeWordCount returns the depth-hint value as-is, uncounted', () => {
  const content = ['---', 'depth-hint: deep-dive', '---', 'one two three'].join('\n');
  const result = computeWordCount(content);
  assert.strictEqual(result, 'deep-dive');
});

test('computeWordCount strips fenced code blocks before counting', () => {
  const fence = String.fromCharCode(96).repeat(3);
  const content = ['one two', fence, 'three four five', fence, 'six seven'].join('\n');
  const result = computeWordCount(content);
  assert.strictEqual(result, 4);
});

test('computeWordCount returns 0 for an empty doc', () => {
  const result = computeWordCount('');
  assert.strictEqual(result, 0);
});

test('computeWordCount falls back to counting everything when frontmatter has no closing marker', () => {
  const content = ['---', 'title: Foo', 'one two three'].join('\n');
  const result = computeWordCount(content);
  assert.strictEqual(result, 6);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/docs-health/tests/depth.test.js`
Expected: FAIL — `Cannot find module '../depth'`

- [ ] **Step 3: Write the implementation**

Create `bin/lib/docs-health/depth.js`:

```javascript
'use strict';

// Computes a mechanical depth signal for a doc: an explicit `depth-hint:`
// frontmatter value (ground truth, returned as-is, no computation) or a
// plain word count with frontmatter and fenced code blocks stripped
// first, so a metadata block or one long example doesn't inflate a thin
// page's count. No LLM involved — the JUDGE step in docs-health/SKILL.md
// interprets the returned value against what the doc's location/heading
// imply. Returns a number (word count) or a string (the depth-hint's
// literal value) — callers must handle both.
function computeWordCount(content) {
  const lines = content.split('\n');
  let body = content;
  if (lines[0] === '---') {
    const closeIdx = lines.indexOf('---', 1);
    if (closeIdx !== -1) {
      const frontmatter = lines.slice(1, closeIdx);
      const hintLine = frontmatter.find((l) => /^depth-hint:\s*.+$/.test(l));
      if (hintLine) {
        return hintLine.replace(/^depth-hint:\s*/, '').trim();
      }
      body = lines.slice(closeIdx + 1).join('\n');
    }
  }
  const stripped = body.replace(/```[\s\S]*?```/g, '');
  const words = stripped.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

module.exports = { computeWordCount };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/docs-health/tests/depth.test.js`
Expected: PASS — `# tests 6`, `# pass 6`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add bin/lib/docs-health/depth.js bin/lib/docs-health/tests/depth.test.js
git commit -m "Add docs-health depth.js word-count helper"
```

---

### Task 2: Add `depth-mismatch` to the Finding Shape's category enum

**Files:**
- Modify: `bin/lib/docs-health/validate-finding.js:10`
- Modify: `bin/lib/docs-health/tests/validate-finding.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CATEGORY_VALUES` now includes `'depth-mismatch'` — no code elsewhere reads this Set
  directly except `validateFinding` itself, so no other file needs a matching change.

- [ ] **Step 1: Write the failing test**

Append to `bin/lib/docs-health/tests/validate-finding.test.js`, immediately after the existing
`'validateFinding accepts category: genre-drift'` test:

```javascript
test('validateFinding accepts category: depth-mismatch', () => {
  const result = validateFinding(validFinding({
    category: 'depth-mismatch',
    section: 'Overview',
    description: 'Overview-implied doc is actually dense reference-depth content',
  }));
  assert.strictEqual(result.ok, true);
});
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `node --test bin/lib/docs-health/tests/validate-finding.test.js`
Expected: FAIL on `validateFinding accepts category: depth-mismatch` — `category: must be one of genre-drift|staleness (got "depth-mismatch")`

- [ ] **Step 3: Update the enum**

In `bin/lib/docs-health/validate-finding.js`, change line 10:

```javascript
const CATEGORY_VALUES = new Set(['genre-drift', 'staleness']);
```

to:

```javascript
const CATEGORY_VALUES = new Set(['genre-drift', 'staleness', 'depth-mismatch']);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/docs-health/tests/validate-finding.test.js`
Expected: PASS — all tests including the new one.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/docs-health/validate-finding.js bin/lib/docs-health/tests/validate-finding.test.js
git commit -m "Accept depth-mismatch as a docs-health finding category"
```

---

### Task 3: Wire `depth.js` into the `docs-health.js` CLI as `word-count`

**Files:**
- Modify: `bin/docs-health.js`
- Test: `bin/lib/docs-health/tests/cli-word-count.test.js` (new)

**Interfaces:**
- Consumes: `computeWordCount` from Task 1 (`./lib/docs-health/depth`).
- Produces: `docs-health.js word-count <path>` CLI subcommand, printing `{"result": <number|string>}`
  to stdout. Consumed by Task 5's SKILL.md Step 3 instructions (a documented Bash invocation, not a
  code import).

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/docs-health/tests/cli-word-count.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'docs-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-word-count-')); }

test('word-count returns a word count for a plain doc', () => {
  const root = tmp();
  const docPath = path.join(root, 'doc.md');
  fs.writeFileSync(docPath, 'one two three four five');
  const output = JSON.parse(execFileSync('node', [CLI, 'word-count', docPath], { encoding: 'utf8' }));
  assert.strictEqual(output.result, 5);
});

test('word-count returns the depth-hint frontmatter value as-is', () => {
  const root = tmp();
  const docPath = path.join(root, 'doc.md');
  fs.writeFileSync(docPath, ['---', 'depth-hint: deep-dive', '---', 'one two three'].join('\n'));
  const output = JSON.parse(execFileSync('node', [CLI, 'word-count', docPath], { encoding: 'utf8' }));
  assert.strictEqual(output.result, 'deep-dive');
});

test('word-count exits non-zero when the path arg is missing', () => {
  const result = spawnSync('node', [CLI, 'word-count'], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('word-count exits non-zero when the file does not exist', () => {
  const result = spawnSync('node', [CLI, 'word-count', '/nonexistent/doc.md'], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/docs-health/tests/cli-word-count.test.js`
Expected: FAIL — the CLI exits with `usage: docs-health.js <command> [options]` and status 2, so
`JSON.parse` throws on the first two tests.

- [ ] **Step 3: Wire the subcommand**

In `bin/docs-health.js`, add the import (after the existing `fingerprint` import on line 4):

```javascript
const { fingerprint } = require('./lib/docs-health/fingerprint');
const { computeWordCount } = require('./lib/docs-health/depth');
```

Add `cmdWordCount`, immediately before the existing `function main(argv) {`:

```javascript
function cmdWordCount(args) {
  const targetPath = args._[1];
  if (!targetPath) {
    process.stderr.write('usage: docs-health.js word-count <path>\n');
    process.exit(2);
  }
  let content;
  try {
    content = fs.readFileSync(targetPath, 'utf8');
  } catch {
    process.stderr.write(`word-count: could not read file: ${targetPath}\n`);
    process.exit(1);
  }
  const result = computeWordCount(content);
  process.stdout.write(JSON.stringify({ result }, null, 2) + '\n');
}

function main(argv) {
```

Wire the dispatch — change:

```javascript
  if (cmd === 'mark') return cmdMark(args);
```

to:

```javascript
  if (cmd === 'mark') return cmdMark(args);
  if (cmd === 'word-count') return cmdWordCount(args);
```

Update the usage string — change:

```javascript
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <declined>, ' +
    'retry-queue drain, retry-queue update <results.json>\n',
```

to:

```javascript
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <declined>, ' +
    'word-count <path>, ' +
    'retry-queue drain, retry-queue update <results.json>\n',
```

Update the exports — change:

```javascript
module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, main };
```

to:

```javascript
module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, cmdWordCount, main };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/docs-health/tests/cli-word-count.test.js`
Expected: PASS — `# tests 4`, `# pass 4`, `# fail 0`

Also run the full docs-health suite to confirm nothing else broke:

Run: `node --test bin/lib/docs-health/tests/*.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add bin/docs-health.js bin/lib/docs-health/tests/cli-word-count.test.js
git commit -m "Add docs-health.js word-count CLI subcommand"
```

---

### Task 4: Update `_shared/criteria-docs-diataxis.md`

**Files:**
- Modify: `skills/_shared/criteria-docs-diataxis.md`

**Interfaces:**
- Produces: the canonical judgment prose Task 5's SKILL.md Step 3 references by name
  ("Dimension 1", "Dimension 3"). No code interface — verified by grep + read-through, no
  automated test exists for this file's prose.

- [ ] **Step 1: Rewrite Dimension 1 and insert the new Dimension 3**

Replace the file's `## Dimension 1` section through the end of the (soon-renumbered) misleading-risk
section. Find this exact block (originally lines 5-37, everything from `## Dimension 1` through the
end of the `## Dimension 3 — Misleading-risk tagging (dual persona)` section, i.e. up to but not
including `## Emitting a finding`):

`````markdown
## Dimension 1 — Genre-drift (implied type vs. found type)

Every doc has an **implied type** — inferred from its location (a file under a directory or section named "reference", "guide", "how-to", "tutorial", "explanation", "concepts", "background") or its own heading/title language ("Reference:", "How to...", "Getting Started", "Understanding..."). Compare the implied type against the **found type** — what the content actually does:

| Diátaxis type | What it actually does |
|---|---|
| Tutorial | Walks a beginner through a concrete learning exercise, start to finish |
| How-to guide | Gives goal-directed steps to accomplish a specific task, assumes some competence |
| Reference | States facts — API shapes, config keys, field tables — with no narrative or step sequence |
| Explanation | Discusses why, context, background, tradeoffs — no steps, no fact tables |

A doc whose implied type and found type diverge is genre-drift. The canonical failure shape from the original audit: a "reference"-section doc that is actually 1000+ lines of procedural how-to instructions before a single reference-shaped paragraph. Also flag: unmarked forward-looking/roadmap content in a doc that reads as describing shipped, current functionality — a reader (human or agent) cannot tell the difference between "this exists" and "this is planned" without an explicit marker.

## Dimension 2 — Staleness (stated facts vs. live reality)

Docs assert facts that can go stale independently of prose quality: item counts ("N skills," "M endpoints"), "as of {date}" markers, version numbers, feature-availability claims, links to files/paths that may have moved or been deleted. Check each stated fact against the live repository state:

- A stated count — grep/count the actual thing and compare.
- A referenced file/path — confirm it still exists at that location.
- A version or "as of" marker — compare against the current state; flag if stale by more than a trivial margin.
- A "coming soon" / "not yet implemented" marker on something that has since shipped (or vice versa).

The canonical failure shape from the original audit: a section index page stating a stale item count for 4+ months, self-acknowledging the gap in its own text the whole time.

## Dimension 3 — Misleading-risk tagging (dual persona)

For every finding, judge who it misleads and how badly, as a fact independent of category:

- **`human`** — a human reader skims the title, catches inconsistencies from surrounding context, or notices a caveat buried in prose. Misleading risk is real but partially self-correcting.
- **`agent`** — a coding agent consuming this doc via retrieval (a chunked search hit, not a full read-through) has no "skim the title, notice the caveat" safety net. A stale fact or wrong genre-shaped chunk is taken at face value. This is the higher-stakes case — weight it accordingly when judging `classification`/`confidence`.
- **`both`** — misleads either reader equally.

In the original audit, 2 of 5 findings flagged agent-risk as primary — treat this as a real, common outcome, not an edge case.
`````

Replace it with:

`````markdown
## Dimension 1 — Genre-drift (implied type vs. found type)

**First, check for a non-Diátaxis-native genre.** Some docs have a genuinely different native genre that was never meant to fit tutorial/how-to/reference/explanation at all: an ADR/decision-record (Status/Context/Decision/Consequences shaped), a structured spec or journey (Persona/Goal/Steps/Acceptance-Criteria shaped), or a dated retrospective/log. This is a content-shape check — a doc's directory name (`decisions/`, `adr/`, `journeys/`, `retrospectives/`) is a hint that raises attention, never a verdict on its own. If the doc matches one of these native shapes, do not force a Diátaxis classification onto it: spot-check that it still reads as its own native genre, and flag only if it has drifted *out* of that genre into something else (e.g., an ADR that's actually a how-to walkthrough with no Status/Context/Decision structure at all).

Otherwise, every doc has an **implied type** — inferred from its location (a file under a directory or section named "reference", "guide", "how-to", "tutorial", "explanation", "concepts", "background") or its own heading/title language ("Reference:", "How to...", "Getting Started", "Understanding..."). Compare the implied type against the **found type** — what the content actually does:

| Diátaxis type | What it actually does |
|---|---|
| Tutorial | Walks a beginner through a concrete learning exercise, start to finish |
| How-to guide | Gives goal-directed steps to accomplish a specific task, assumes some competence |
| Reference | States facts — API shapes, config keys, field tables — with no narrative or step sequence |
| Explanation | Discusses why, context, background, tradeoffs — no steps, no fact tables |

Flag a mismatch only when the implied type and found type diverge **and** the divergence would actually mislead a reader or leave the doc's purpose unserved — not any abstract type mismatch. A reference doc with a short embedded quick-start is not automatically a finding. The canonical failure shape from the original audit: a "reference"-section doc that is actually 1000+ lines of procedural how-to instructions before a single reference-shaped paragraph. Also flag: unmarked forward-looking/roadmap content in a doc that reads as describing shipped, current functionality — a reader (human or agent) cannot tell the difference between "this exists" and "this is planned" without an explicit marker.

## Dimension 2 — Staleness (stated facts vs. live reality)

Docs assert facts that can go stale independently of prose quality: item counts ("N skills," "M endpoints"), "as of {date}" markers, version numbers, feature-availability claims, links to files/paths that may have moved or been deleted. Check each stated fact against the live repository state:

- A stated count — grep/count the actual thing and compare.
- A referenced file/path — confirm it still exists at that location.
- A version or "as of" marker — compare against the current state; flag if stale by more than a trivial margin.
- A "coming soon" / "not yet implemented" marker on something that has since shipped (or vice versa).

The canonical failure shape from the original audit: a section index page stating a stale item count for 4+ months, self-acknowledging the gap in its own text the whole time.

## Dimension 3 — Depth-mismatch (implied depth vs. found depth)

A doc's location and heading imply not just a genre but a **depth** — how much reading investment a reader should expect before opening it (an "Overview" or "Getting Started" promises a quick read; a "Reference" or "Deep-dive" promises a longer one). Check the doc's actual word count (via `bin/lib/docs-health/depth.js#computeWordCount`, frontmatter and fenced code blocks stripped) against what its location, heading, and native genre (as determined by Dimension 1) lead a reader to expect walking in.

There are no universal word-count thresholds — a "reference" doc might reasonably run 5,000 words of dense tables in one project and be absurd at 500 words in another. Judge whether *this* doc's computed word count is surprising given what *this* doc's own context implies, using the same "would this actually mislead" bar as Dimension 1. If the doc's frontmatter declares an explicit `depth-hint:` value, `computeWordCount` returns that string directly instead of a count — treat it as ground truth and skip the word-count judgment entirely.

The canonical failure shape: an "Overview"/"Getting Started"-implied doc that is actually dense multi-thousand-word reference material, with no signal to a skimming reader that they're not in Kansas anymore. Do NOT flag a doc that is long *and* correctly signals it — a Reference or Deep-dive doc being long is expected, not a finding. This stays a structural/expectation check, not a backdoor into "this doc is too long" prose-quality judgment — see Constraints below.

## Dimension 4 — Misleading-risk tagging (dual persona)

For every finding, judge who it misleads and how badly, as a fact independent of category:

- **`human`** — a human reader skims the title, catches inconsistencies from surrounding context, or notices a caveat buried in prose. Misleading risk is real but partially self-correcting.
- **`agent`** — a coding agent consuming this doc via retrieval (a chunked search hit, not a full read-through) has no "skim the title, notice the caveat" safety net. A stale fact or wrong genre-shaped chunk is taken at face value. This is the higher-stakes case — weight it accordingly when judging `classification`/`confidence`.
- **`both`** — misleads either reader equally.

In the original audit, 2 of 5 findings flagged agent-risk as primary — treat this as a real, common outcome, not an edge case.
`````

- [ ] **Step 2: Update "Emitting a finding"'s category enum**

Find:

```
Each finding carries: `target` (the doc's id, e.g. `decisions/0007-foo`), `assetType` (always `"doc"`), `section` (the heading within the doc, or `"Freshness"` for a whole-doc staleness finding with no single section), `category` (`"genre-drift"` | `"staleness"` — Dimension 1 or Dimension 2, pick whichever the finding is actually about), `misleads` (`"human"` | `"agent"` | `"both"` — Dimension 3), `classification` (`"additive"` | `"restructural"` — same vocabulary as harness-health: a one-line fact correction or an added disclaimer is `additive`; reorganizing a doc that mixes genres, or splitting a doc, is `restructural`), `confidence`, `reversibility`, `oldString`/`newString` (the patch itself — `oldString` may be empty for a pure addition).
```

Replace with:

```
Each finding carries: `target` (the doc's id, e.g. `decisions/0007-foo`), `assetType` (always `"doc"`), `section` (the heading within the doc, or `"Freshness"` for a whole-doc staleness finding with no single section), `category` (`"genre-drift"` — Dimension 1, `"staleness"` — Dimension 2, `"depth-mismatch"` — Dimension 3; pick whichever the finding is actually about), `misleads` (`"human"` | `"agent"` | `"both"` — Dimension 4), `classification` (`"additive"` | `"restructural"` — same vocabulary as harness-health: a one-line fact correction or an added disclaimer is `additive`; reorganizing a doc that mixes genres, or splitting a doc, is `restructural`), `confidence`, `reversibility`, `oldString`/`newString` (the patch itself — `oldString` may be empty for a pure addition).
```

- [ ] **Step 3: Update "What is worth flagging" and "Constraints"**

Find:

```
## What is worth flagging

- A doc whose implied type (by location/heading) doesn't match its found type (by content shape).
- Unmarked forward-looking/roadmap content presented as shipped.
- A stated fact (count, date, path, version, availability) that no longer matches live repository state.
- A doc that has explicitly and visibly acknowledged its own staleness in its own text without being fixed (the "self-acknowledging gap" pattern).

## Constraints (what NOT to flag)

- **Content quality is not this check's job.** Judging whether prose is well-written, whether an explanation is clear, or whether a tutorial's pacing is good is not genre-drift or staleness — don't flag it here. This mirrors `_shared/work-record.md`'s spec-shaped-body check: structural-plus-minimal, not editorial.
- **Don't flag mechanical/unambiguous issues.** Broken links, malformed frontmatter, and missing structural metadata belong in the consuming project's own build/CI pipeline — the same "CI stays reactive" boundary `code-health` already draws for code. Only flag genre-drift and factual staleness, which require holistic judgment.
```

Replace with:

```
## What is worth flagging

- A doc whose implied type (by location/heading) doesn't match its found type (by content shape), where the mismatch would actually mislead a reader.
- A doc with a non-Diátaxis-native genre (ADR, structured spec/journey, retrospective/log) that has drifted out of its own native genre into something else.
- Unmarked forward-looking/roadmap content presented as shipped.
- A doc whose actual word count would surprise a reader given what its location, heading, and native genre imply (e.g., an "Overview" that's actually deep reference-depth content).
- A stated fact (count, date, path, version, availability) that no longer matches live repository state.
- A doc that has explicitly and visibly acknowledged its own staleness in its own text without being fixed (the "self-acknowledging gap" pattern).

## Constraints (what NOT to flag)

- **Content quality is not this check's job.** Judging whether prose is well-written, whether an explanation is clear, or whether a tutorial's pacing is good is not genre-drift, depth-mismatch, or staleness — don't flag it here. This mirrors `_shared/work-record.md`'s spec-shaped-body check: structural-plus-minimal, not editorial.
- **Length alone is never a finding.** A doc that's long — or short — but correctly signals its depth (a Reference or Deep-dive doc being long, an Overview being short) is not a depth-mismatch finding regardless of its absolute word count. Only the *mismatch* between implied and found depth is judged.
- **Don't flag mechanical/unambiguous issues.** Broken links, malformed frontmatter, and missing structural metadata belong in the consuming project's own build/CI pipeline — the same "CI stays reactive" boundary `code-health` already draws for code. Only flag genre-drift, depth-mismatch, and factual staleness, which require holistic judgment (the word count itself is computed mechanically; only the judgment of whether it's surprising given context is holistic).
```

- [ ] **Step 4: Verify**

Run: `grep -n "^## Dimension" skills/_shared/criteria-docs-diataxis.md`
Expected: four lines — `Dimension 1 — Genre-drift...`, `Dimension 2 — Staleness...`,
`Dimension 3 — Depth-mismatch...`, `Dimension 4 — Misleading-risk tagging...`, in that order.

Run: `grep -c "depth-mismatch" skills/_shared/criteria-docs-diataxis.md`
Expected: at least 6 (Dimension 3 heading + body, category enum, two bullets, one constraint).

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/criteria-docs-diataxis.md
git commit -m "Refine docs-health genre-drift judgment, add depth-mismatch dimension"
```

---

### Task 5: Update `skills/docs-health/SKILL.md`

**Files:**
- Modify: `skills/docs-health/SKILL.md`

**Interfaces:**
- Consumes: `docs-health.js word-count <path>` (Task 3), Dimension 1/3 prose (Task 4).
- Produces: nothing new — verified by `bin/lib/docs-health/tests/skill-md.test.js` (existing).

- [ ] **Step 1: Update frontmatter description**

Find:

```
description: Use when you want a proactive, report-only sweep of docs/** that surfaces Diátaxis genre-drift (implied doc type vs. actual content shape) and factual staleness, deduplicated and filed as GitHub issues. An LLM judges the docs; deterministic helpers handle scope rotation, fingerprinting, dedup, and issue filing. Never edits docs. Keywords - docs-health, documentation drift, Diátaxis, genre drift, staleness, proactive, github issues, scheduled, routine.
```

Replace with:

```
description: Use when you want a proactive, report-only sweep of docs/** that surfaces Diátaxis genre-drift (implied doc type vs. actual content shape), depth-mismatch (implied reading investment vs. actual word count), and factual staleness, deduplicated and filed as GitHub issues. An LLM judges the docs; deterministic helpers handle scope rotation, fingerprinting, dedup, issue filing, and word-count computation. Never edits docs. Keywords - docs-health, documentation drift, Diátaxis, genre drift, depth mismatch, staleness, proactive, github issues, scheduled, routine.
```

- [ ] **Step 2: Update the header paragraph**

Find:

```
A recurring health check for `docs/**`: picks one doc to audit, judges it against the shared `_shared/criteria-docs-diataxis.md` procedure (implied-type-vs-found-type genre-drift, factual staleness, dual-persona misleading-risk), and files a `by:docs-health`-labelled, born-`ready` GitHub issue. Never edits docs — only files findings, mirroring `/code-health` and `/harness-health`.
```

Replace with:

```
A recurring health check for `docs/**`: picks one doc to audit, judges it against the shared `_shared/criteria-docs-diataxis.md` procedure (implied-type-vs-found-type genre-drift, implied-vs-found depth-mismatch, factual staleness, dual-persona misleading-risk), and files a `by:docs-health`-labelled, born-`ready` GitHub issue. Never edits docs — only files findings, mirroring `/code-health` and `/harness-health`.
```

- [ ] **Step 3: Update the "When to Use" bullet**

Find:

```
- You want `docs/**` (guides, references, ADRs, journeys, retrospectives) to stay accurate and correctly Diátaxis-shaped between manual edits, without driving each check yourself.
```

Replace with:

```
- You want `docs/**` (guides, references, ADRs, journeys, retrospectives) to stay accurate, appropriately scoped, and correctly shaped — Diátaxis genre where it applies, native genre otherwise (an ADR stays ADR-shaped, not forced into a tutorial/how-to/reference/explanation mold) — between manual edits, without driving each check yourself.
```

- [ ] **Step 4: Rewrite Step 3 (JUDGE the target)**

Find this exact block (the full existing Step 3, from its header through the `Write the array to
/tmp/docs-health-findings.json.` line):

`````markdown
**Step 3 — JUDGE the target.**

Apply the full procedure in `_shared/criteria-docs-diataxis.md` (genre-drift, staleness, dual-persona misleading-risk) to the target's content:

1. Determine the doc's **implied type** from its location/heading language, and its **found type** from what the content actually does (tutorial / how-to / reference / explanation — see the criteria fragment's Dimension 1 table). A mismatch is a `category: "genre-drift"` finding.
2. Check every stated fact (counts, dates, paths, versions, availability claims) against live repository state (grep, `find`, `git log`). A mismatch is a `category: "staleness"` finding.
3. For every finding, judge `misleads`: `"human"` (a skim-and-notice-caveat reader partially self-corrects), `"agent"` (retrieval-style consumption has no such safety net — weight this higher), or `"both"`.
4. Judge `classification`: `"additive"` (a one-line fact correction, an added disclaimer) or `"restructural"` (reorganizing a doc that mixes genres, splitting a doc).

Emit each finding in this shape:

```json
{
  "target": "<doc id relative to docs/, no .md>",
  "assetType": "doc",
  "section": "<heading within the doc, or 'Freshness' for a whole-doc staleness finding>",
  "category": "genre-drift | staleness",
  "misleads": "human | agent | both",
  "classification": "additive | restructural",
  "confidence": "high | med | low",
  "reversibility": "high | med | low",
  "description": "<acceptance criteria text>",
  "reason": "<evidence — why this was flagged>",
  "oldString": "<current text, or empty string for a pure addition>",
  "newString": "<proposed text>"
}
```

Write the array to `/tmp/docs-health-findings.json`.
`````

Replace with:

`````markdown
**Step 3 — JUDGE the target.**

Apply the full procedure in `_shared/criteria-docs-diataxis.md` (genre-drift, depth-mismatch, staleness, dual-persona misleading-risk) to the target's content:

1. First, determine whether the doc has a self-evident non-Diátaxis-native genre (ADR/decision-record, structured spec/journey, dated retrospective/log — see the criteria fragment's Dimension 1). If so, skip type classification: spot-check it still reads as its own native genre, and flag only if it has drifted out of that genre into something else.
2. Otherwise, determine the doc's **implied type** from its location/heading language, and its **found type** from what the content actually does (tutorial / how-to / reference / explanation — see the criteria fragment's Dimension 1 table). Flag a mismatch only when it would actually mislead a reader or leave the doc's purpose unserved — a `category: "genre-drift"` finding.
3. Compute the doc's word count:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" word-count "${TARGET_PATH}"
   ```

   `TARGET_PATH` is `target.path` from Step 1. The result is either an integer word count, or (if the doc's frontmatter declares `depth-hint:`) that value's literal string, returned as-is — ground truth, skip the judgment below entirely in that case. Otherwise, judge whether the computed word count is surprising given what the doc's location, heading, and native genre (from step 1) lead a reader to expect walking in — same "would this actually mislead" bar as step 2, never length by itself. A surprising mismatch is a `category: "depth-mismatch"` finding.
4. Check every stated fact (counts, dates, paths, versions, availability claims) against live repository state (grep, `find`, `git log`). A mismatch is a `category: "staleness"` finding.
5. For every finding, judge `misleads`: `"human"` (a skim-and-notice-caveat reader partially self-corrects), `"agent"` (retrieval-style consumption has no such safety net — weight this higher), or `"both"`.
6. Judge `classification`: `"additive"` (a one-line fact correction, an added disclaimer) or `"restructural"` (reorganizing a doc that mixes genres, splitting a doc).

Emit each finding in this shape:

```json
{
  "target": "<doc id relative to docs/, no .md>",
  "assetType": "doc",
  "section": "<heading within the doc, or 'Freshness' for a whole-doc staleness finding>",
  "category": "genre-drift | depth-mismatch | staleness",
  "misleads": "human | agent | both",
  "classification": "additive | restructural",
  "confidence": "high | med | low",
  "reversibility": "high | med | low",
  "description": "<acceptance criteria text>",
  "reason": "<evidence — why this was flagged>",
  "oldString": "<current text, or empty string for a pure addition>",
  "newString": "<proposed text>"
}
```

Write the array to `/tmp/docs-health-findings.json`.
`````

- [ ] **Step 5: Update the Anti-Patterns table**

Find:

```
| Flagging prose quality or style as a finding | Content quality is explicitly out of scope — only genre-drift (implied type vs. found type) and factual staleness are judged. See `_shared/criteria-docs-diataxis.md`'s Constraints section. |
```

Replace with:

```
| Flagging prose quality or style as a finding | Content quality is explicitly out of scope — only genre-drift, depth-mismatch, and factual staleness are judged, all structural/expectation checks, never editorial ones. See `_shared/criteria-docs-diataxis.md`'s Constraints section. |
| Flagging a doc's length by itself, without a mismatched expectation | Depth-mismatch only fires when a doc's actual word count would surprise a reader given what its location/heading/native genre imply — a correctly-signaled long or short doc is never a finding regardless of absolute length. See `_shared/criteria-docs-diataxis.md`'s Dimension 3. |
```

- [ ] **Step 6: Verify**

Run: `node --test bin/lib/docs-health/tests/skill-md.test.js`
Expected: PASS — all existing structural/token checks still hold.

Run: `grep -c "depth-mismatch" skills/docs-health/SKILL.md`
Expected: at least 6.

- [ ] **Step 7: Commit**

```bash
git add skills/docs-health/SKILL.md
git commit -m "Wire depth-mismatch judgment into docs-health/SKILL.md's Step 3"
```

---

### Task 6: Update sibling relationship-table rows and reference docs

**Files:**
- Modify: `skills/code-health/SKILL.md:418`
- Modify: `skills/harness-health/SKILL.md:258`
- Modify: `skills/journey-health/SKILL.md:294`
- Modify: `skills/routine/SKILL.md:236`
- Modify: `skills/tidy/SKILL.md:416`
- Modify: `README.md:292`
- Modify: `skills/help/reference-card.md:50`

**Interfaces:** None — prose-only, no code interface.

- [ ] **Step 1: `skills/code-health/SKILL.md`**

Find:

```
| `/claude-tweaks:docs-health` | Sibling health skill — same SELECT → JUDGE → VERIFY → FINGERPRINT/DEDUP → FILE pipeline and shared `_shared/health-state.md` persistence, but scoped to `docs/**` for Diátaxis genre-drift + staleness instead of code quality. Both file born-`ready` findings on the unified work-record contract. |
```

Replace with:

```
| `/claude-tweaks:docs-health` | Sibling health skill — same SELECT → JUDGE → VERIFY → FINGERPRINT/DEDUP → FILE pipeline and shared `_shared/health-state.md` persistence, but scoped to `docs/**` for Diátaxis genre-drift + depth-mismatch + staleness instead of code quality. Both file born-`ready` findings on the unified work-record contract. |
```

- [ ] **Step 2: `skills/harness-health/SKILL.md`**

Find:

```
| `/claude-tweaks:docs-health` | Sibling health skill for `docs/**` (Diátaxis genre-drift + staleness) — shares this skill's SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline shape and `_shared/health-state.md`'s durable persistence, but scoped to a disjoint file set: docs-health's rotation pool only ever walks `docs/`, never `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md. |
```

Replace with:

```
| `/claude-tweaks:docs-health` | Sibling health skill for `docs/**` (Diátaxis genre-drift + depth-mismatch + staleness) — shares this skill's SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline shape and `_shared/health-state.md`'s durable persistence, but scoped to a disjoint file set: docs-health's rotation pool only ever walks `docs/`, never `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md. |
```

- [ ] **Step 3: `skills/journey-health/SKILL.md`**

Find:

```
| `/claude-tweaks:docs-health` | Sibling health skill — same SELECT → JUDGE → FILE pipeline and `_shared/health-state.md` persistence, but scoped to `docs/**` Diátaxis genre-drift + staleness instead of `docs/journeys/*.md` accuracy and agent-e2e coverage. Both file born-`ready` findings on the unified work-record contract. |
```

Replace with:

```
| `/claude-tweaks:docs-health` | Sibling health skill — same SELECT → JUDGE → FILE pipeline and `_shared/health-state.md` persistence, but scoped to `docs/**` Diátaxis genre-drift + depth-mismatch + staleness instead of `docs/journeys/*.md` accuracy and agent-e2e coverage. Both file born-`ready` findings on the unified work-record contract. |
```

- [ ] **Step 4: `skills/routine/SKILL.md`**

Find:

```
| `/claude-tweaks:docs-health` | Sixth consumer — `skills/docs-health/routine-template.yml` audits `docs/**` for Diátaxis genre-drift and staleness (report-only, like code-health's and harness-health's templates), filing `by:docs-health` findings. |
```

Replace with:

```
| `/claude-tweaks:docs-health` | Sixth consumer — `skills/docs-health/routine-template.yml` audits `docs/**` for Diátaxis genre-drift, depth-mismatch, and staleness (report-only, like code-health's and harness-health's templates), filing `by:docs-health` findings. |
```

- [ ] **Step 5: `skills/tidy/SKILL.md`**

Find:

```
| `/claude-tweaks:docs-health` | `/docs-health` files `docs/**` genre-drift/staleness findings as `by:docs-health`-labelled records; `/tidy` Step 4.8 audits them alongside code-health, harness-health, and journey-health records — stale/superseded ones closed after batch approval, still-valid ones suggested for `/claude-tweaks:triage`. |
```

Replace with:

```
| `/claude-tweaks:docs-health` | `/docs-health` files `docs/**` genre-drift/depth-mismatch/staleness findings as `by:docs-health`-labelled records; `/tidy` Step 4.8 audits them alongside code-health, harness-health, and journey-health records — stale/superseded ones closed after batch approval, still-valid ones suggested for `/claude-tweaks:triage`. |
```

- [ ] **Step 6: `README.md`**

Find:

```
**`/claude-tweaks:docs-health`** — Recurring health check for `docs/**`: picks one doc to audit, judges it against the shared `_shared/criteria-docs-diataxis.md` procedure — Diátaxis genre-drift (implied doc type vs. actual content shape), factual staleness, and dual-persona misleading-risk tagging (human engineer vs. coding agent) — and always files a `docs-health`-labelled GitHub issue. Never edits docs content — report-only, matching `/code-health` and `/harness-health`. Scoped strictly to `docs/**`, excluding `docs/superpowers/**` (ephemeral build artifacts) and never overlapping `harness-health`'s `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md territory. Runs on a scheduled Routine for continuous coverage.
```

Replace with:

```
**`/claude-tweaks:docs-health`** — Recurring health check for `docs/**`: picks one doc to audit, judges it against the shared `_shared/criteria-docs-diataxis.md` procedure — Diátaxis genre-drift (implied doc type vs. actual content shape), depth-mismatch (implied reading investment vs. actual word count), factual staleness, and dual-persona misleading-risk tagging (human engineer vs. coding agent) — and always files a `docs-health`-labelled GitHub issue. Never edits docs content — report-only, matching `/code-health` and `/harness-health`. Scoped strictly to `docs/**`, excluding `docs/superpowers/**` (ephemeral build artifacts) and never overlapping `harness-health`'s `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md territory. Runs on a scheduled Routine for continuous coverage.
```

- [ ] **Step 7: `skills/help/reference-card.md`**

Find:

```
| `/claude-tweaks:docs-health` | Recurring health check auditing `docs/**` for Diátaxis genre-drift and factual staleness, with dual-persona misleading-risk tagging. Scheduled Routine. Never edits anything — always files a GitHub issue. | `--target <id>`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```

Replace with:

```
| `/claude-tweaks:docs-health` | Recurring health check auditing `docs/**` for Diátaxis genre-drift, depth-mismatch, and factual staleness, with dual-persona misleading-risk tagging. Scheduled Routine. Never edits anything — always files a GitHub issue. | `--target <id>`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```

- [ ] **Step 8: Commit**

```bash
git add skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md \
  skills/routine/SKILL.md skills/tidy/SKILL.md README.md skills/help/reference-card.md
git commit -m "Add depth-mismatch to docs-health's cross-file dimension mentions"
```

---

### Task 7: Final verification sweep

**Files:** None modified — read-only verification across the whole repo.

**Interfaces:** None.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (baseline was 1134/1135 with one pre-existing flaky
`statusline.test.js` timing test unrelated to this work — confirm the same test, if it fails again,
still passes in isolation via `node --test tests/statusline.test.js`; any other failure must be
investigated before proceeding).

- [ ] **Step 2: Sweep for stale dimension enumerations**

Run: `grep -rn "genre-drift + staleness\|genre-drift and staleness\|genre-drift and factual staleness\|genre-drift/staleness" --include="*.md" . | grep -v docs/superpowers`
Expected: no output — every occurrence found in Task 6 now includes `depth-mismatch`.

- [ ] **Step 3: Confirm the category enum is consistent everywhere it's declared**

Run: `grep -rn "depth-mismatch" bin/lib/docs-health/validate-finding.js skills/_shared/criteria-docs-diataxis.md skills/docs-health/SKILL.md`
Expected: at least one hit in each of the three files.

- [ ] **Step 4: Commit (only if Step 1 required a fix)**

If Step 1 uncovered and required fixing a real regression, commit that fix here with a message
describing what broke and why. If nothing needed fixing, skip this step — there is nothing to
commit.
