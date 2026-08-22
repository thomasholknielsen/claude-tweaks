# QA Artifact Path Relocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every QA/browser artifact path convention from project-root `screenshots/`+`traces/` to `.claude-tweaks/artifacts/` (prefix-only), fix `/init`'s suggested gitignore block accordingly, and pin the writer/reader path pair with a conformance test.

**Architecture:** A mechanical prefix sweep over markdown skill prose — no code, no renaming of internal sub-structure. Writers and readers move in the same branch; a new live-corpus conformance test (mirroring `tests/step3-routing-prose-exempt-conformance.test.js`'s pattern) pins the one contract-shaped relationship (writer RUN_DIR prefix == reader glob prefix).

**Tech Stack:** Markdown skill files under `plugin/`, `node --test` conformance suite under `tests/`.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T154526-spec-1077-1078/spec-1077/work/1077-spec.md`

## Global Constraints

- Work happens in the shared run worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/qa-artifact-retention-884` — anchor every command there (`cd` or `git -C`); verify with `pwd` + `git rev-parse --show-toplevel` before committing.
- The new prefix is exactly `.claude-tweaks/artifacts/` (25 chars). Preserve each file's existing trailing-slash form verbatim — `traces` stays `traces`-suffixed where it had no slash, `traces/` keeps its slash. Never normalize.
- Prefix-only: `screenshots/qa/…`, `screenshots/browse/…`, `traces/…` keep their internal shape under the new prefix.
- Do NOT touch `plugin/skills/visual-review/journey-mode.md` line 117's retention sentence ("There is no automatic retention policy; users manage cleanup…") — that sentence belongs to #1078. Only path prefixes change in that file.
- Commit messages reference `refs #1077` — never "closes"/"fixes" (the PR body carries the closing keywords).
- Run only file-scoped verification greps per task; the full `npm test` runs once, centrally, in Task 6.
- One plain command per Bash call (no `&&`, no heredocs — the worktree session's command gate refuses compound shapes).

---

### Task 1: Writer paths — /test skill + qa-agent

**Files:**
- Modify: `plugin/skills/test/qa-procedures.md:45-46,73-79`
- Modify: `plugin/skills/test/qa-reporting.md:176-177`
- Modify: `plugin/agents/qa-agent.md:23,329`

**Interfaces:**
- Produces: `SCREENSHOTS_BASE` default `.claude-tweaks/artifacts/screenshots/qa` and `TRACES_BASE` default `.claude-tweaks/artifacts/traces` — Task 4's reader globs and Task 6's conformance test assert this exact prefix.

- [ ] **Step 1: Edit `plugin/skills/test/qa-procedures.md`** — five replacements:
  - Line 45: `| SCREENSHOTS_BASE | \`screenshots/qa\` |` → `| SCREENSHOTS_BASE | \`.claude-tweaks/artifacts/screenshots/qa\` |`
  - Line 46: `| TRACES_BASE | \`traces\` |` → `| TRACES_BASE | \`.claude-tweaks/artifacts/traces\` |`
  - Line 73: `RUN_DIR="screenshots/qa/{YYYYMMDD}_{HHMMSS}_{6-char-random-hex}"` → `RUN_DIR=".claude-tweaks/artifacts/screenshots/qa/{YYYYMMDD}_{HHMMSS}_{6-char-random-hex}"`
  - Line 75 (node snippet): `console.log('screenshots/qa/'+…` → `console.log('.claude-tweaks/artifacts/screenshots/qa/'+…` (only the string literal changes)
  - Line 79 (example): `\`screenshots/qa/20260210_143022_a1b2c3/myapp-customer/checkout-flow-completes/\`` → `\`.claude-tweaks/artifacts/screenshots/qa/20260210_143022_a1b2c3/myapp-customer/checkout-flow-completes/\``
- [ ] **Step 2: Edit `plugin/skills/test/qa-reporting.md`** — lines 176 and 177: `traces/{id}/{ts}.zip` → `.claude-tweaks/artifacts/traces/{id}/{ts}.zip` (two table cells). Line 258 uses the `{TRACES_BASE}` variable — no edit.
- [ ] **Step 3: Edit `plugin/agents/qa-agent.md`** — line 23: `(default \`traces/\`)` → `(default \`.claude-tweaks/artifacts/traces/\`)`; line 329 (REPORT_JSON example): `"trace":"traces/<story-id>/<timestamp>.zip"` → `"trace":".claude-tweaks/artifacts/traces/<story-id>/<timestamp>.zip"`
- [ ] **Step 4: Verify** — Run: `grep -n "screenshots/qa\|traces/" plugin/skills/test/qa-procedures.md plugin/skills/test/qa-reporting.md plugin/agents/qa-agent.md` (from the worktree root). Expected: every hit carries the `.claude-tweaks/artifacts/` prefix except qa-reporting.md:258's `{TRACES_BASE}` template line.
- [ ] **Step 5: Commit** — `git add plugin/skills/test/qa-procedures.md plugin/skills/test/qa-reporting.md plugin/agents/qa-agent.md` then `git commit -m "Relocate /test qa + qa-agent artifact paths to .claude-tweaks/artifacts/ — refs #1077"`

### Task 2: Writer paths — /browse + /stories

**Files:**
- Modify: `plugin/skills/browse/SKILL.md:78,81,88`
- Modify: `plugin/skills/browse/agent-browser-reference.md:131,134,140`
- Modify: `plugin/skills/stories/SKILL.md:351`
- Modify: `plugin/skills/stories/refine.md:25,43,49`

**Interfaces:**
- Consumes: nothing from Task 1 (independent files).
- Produces: `/browse` conventions `.claude-tweaks/artifacts/screenshots/browse/<session>/…` and `.claude-tweaks/artifacts/traces/<session>/<timestamp>.zip`.

- [ ] **Step 1: Edit `plugin/skills/browse/SKILL.md`** — line 78: `screenshots/browse/<session>/<NN>_<description>.png` → `.claude-tweaks/artifacts/screenshots/browse/<session>/<NN>_<description>.png`; line 81 example: `\`screenshots/browse/checkout-flow/02_payment-error.png\`` → `\`.claude-tweaks/artifacts/screenshots/browse/checkout-flow/02_payment-error.png\``; line 88: `traces/<session>/<timestamp>.zip` → `.claude-tweaks/artifacts/traces/<session>/<timestamp>.zip`
- [ ] **Step 2: Edit `plugin/skills/browse/agent-browser-reference.md`** — line 131: `trace stop traces/<session>/<timestamp>.zip` → `trace stop .claude-tweaks/artifacts/traces/<session>/<timestamp>.zip`; line 134: `Path convention: \`traces/<session>/<timestamp>.zip\`.` → `Path convention: \`.claude-tweaks/artifacts/traces/<session>/<timestamp>.zip\`.`; line 140: rewrite the gitignore-note sentence so it names the new home — replace `` `traces/` is tooling residue, not project content — it belongs in `.gitignore`, `` with `` `.claude-tweaks/artifacts/` is tooling residue, not project content — it belongs in `.gitignore` (init's suggested block covers it), `` (keep the rest of the sentence unchanged).
- [ ] **Step 3: Edit `plugin/skills/stories/SKILL.md`** — line 351: replace `- \`traces/\` and \`screenshots/\` are tooling residue, not project content — ensure both are gitignored (add the entries if missing), and never commit trace zips` with `- \`.claude-tweaks/artifacts/\` (the screenshots/traces home) is tooling residue, not project content — ensure it is gitignored (init's suggested block covers it; add the entry if missing), and never commit trace zips`
- [ ] **Step 4: Edit `plugin/skills/stories/refine.md`** — lines 25, 43, 49: each `traces/<story-id>/<timestamp>.zip` → `.claude-tweaks/artifacts/traces/<story-id>/<timestamp>.zip` (three occurrences).
- [ ] **Step 5: Verify** — Run: `grep -n "screenshots/\|traces/" plugin/skills/browse/SKILL.md plugin/skills/browse/agent-browser-reference.md plugin/skills/stories/SKILL.md plugin/skills/stories/refine.md`. Expected: every hit carries the `.claude-tweaks/artifacts/` prefix.
- [ ] **Step 6: Commit** — `git add plugin/skills/browse plugin/skills/stories` then `git commit -m "Relocate /browse + /stories artifact paths to .claude-tweaks/artifacts/ — refs #1077"`

### Task 3: Writer/reader paths — /visual-review (five files)

**Files:**
- Modify: `plugin/skills/visual-review/SKILL.md:169`
- Modify: `plugin/skills/visual-review/browser-review.md:24,60,193-194`
- Modify: `plugin/skills/visual-review/page-mode.md:16,27,49-51,88,185-189`
- Modify: `plugin/skills/visual-review/journey-mode.md:27-35,108` (path prefixes ONLY — line 117's retention sentence is #1078's, leave byte-identical)
- Modify: `plugin/skills/visual-review/discover-mode.md:83,99-101`

**Interfaces:**
- Produces: `browser-review.md:60`'s reader glob `.claude-tweaks/artifacts/screenshots/qa/*/report.json` — must equal Task 1's writer prefix; Task 6's conformance test asserts it.

- [ ] **Step 1: Edit `plugin/skills/visual-review/SKILL.md`** — line 169: `(\`screenshots/browse/<session>/*.png\`)` → `(\`.claude-tweaks/artifacts/screenshots/browse/<session>/*.png\`)`
- [ ] **Step 2: Edit `plugin/skills/visual-review/browser-review.md`** — line 24: `screenshots/browse/<session>/<NN>_<description>.png` → prefixed form; line 60: `Glob for \`screenshots/qa/*/report.json\`` → `Glob for \`.claude-tweaks/artifacts/screenshots/qa/*/report.json\``; line 193: `{paths under screenshots/browse/<session>/}` → `{paths under .claude-tweaks/artifacts/screenshots/browse/<session>/}`; line 194: `{path under traces/<session>/ — omit if no failure}` → `{path under .claude-tweaks/artifacts/traces/<session>/ — omit if no failure}`
- [ ] **Step 3: Edit `plugin/skills/visual-review/page-mode.md`** — every occurrence of `screenshots/browse/` on lines 16, 27, 49, 50, 51, 185, 187, 189 gains the `.claude-tweaks/artifacts/` prefix; line 88: `trace stop traces/<session>/<timestamp>.zip` → `trace stop .claude-tweaks/artifacts/traces/<session>/<timestamp>.zip`. The line 33 dispatcher-mapping prose contains one more `screenshots/browse/pricing-review/02_above-fold.png` example — prefix it too (sweep the whole file, not just the listed lines).
- [ ] **Step 4: Edit `plugin/skills/visual-review/journey-mode.md`** — lines 27, 31, 35: `screenshots/browse/checkout-journey-review/0N_*.png` examples gain the prefix; line 108: `trace stop traces/<session>/<timestamp>.zip` → prefixed. Line 117: change ONLY the trailing gitignore clause `and \`traces/\` belongs in \`.gitignore\`` → `and \`.claude-tweaks/artifacts/\` belongs in \`.gitignore\``, leaving the "There is no automatic retention policy; users manage cleanup" clause byte-identical (it is #1078's to rewrite).
- [ ] **Step 5: Edit `plugin/skills/visual-review/discover-mode.md`** — lines 83, 99, 100, 101: every `screenshots/browse/discover-*/…png` example gains the prefix.
- [ ] **Step 6: Verify** — Run: `grep -rn "screenshots/\|traces/" plugin/skills/visual-review/`. Expected: every hit prefixed with `.claude-tweaks/artifacts/` except journey-mode.md:117's untouched "no automatic retention policy" clause (which after Step 4 contains no bare path — confirm the line's gitignore clause was prefixed).
- [ ] **Step 7: Commit** — `git add plugin/skills/visual-review` then `git commit -m "Relocate /visual-review artifact paths to .claude-tweaks/artifacts/ — refs #1077"`

### Task 4: Reader glob + /help table cells

**Files:**
- Modify: `plugin/skills/journey-health/SKILL.md:97`
- Modify: `plugin/skills/help/context-flow.md:74,75,82`

**Interfaces:**
- Consumes: Task 1's writer prefix (the glob must match it exactly).

- [ ] **Step 1: Edit `plugin/skills/journey-health/SKILL.md`** — line 97: `Glob \`screenshots/qa/*/report.json\`` → `Glob \`.claude-tweaks/artifacts/screenshots/qa/*/report.json\`` (one occurrence; the rest of the line unchanged — note open record #923 also edits this file elsewhere, touch nothing but this glob).
- [ ] **Step 2: Edit `plugin/skills/help/context-flow.md`** — line 74: `\`screenshots/qa/report.json\`, \`screenshots/qa/report.md\`` → `\`.claude-tweaks/artifacts/screenshots/qa/report.json\`, \`.claude-tweaks/artifacts/screenshots/qa/report.md\``; line 75: `\`screenshots/browse/\`` → `\`.claude-tweaks/artifacts/screenshots/browse/\``; line 82: `\`screenshots/\`` → `\`.claude-tweaks/artifacts/screenshots/\``
- [ ] **Step 3: Verify** — Run: `grep -n "screenshots/" plugin/skills/journey-health/SKILL.md plugin/skills/help/context-flow.md`. Expected: every hit prefixed.
- [ ] **Step 4: Verify ceiling headroom** — Run: `wc -c plugin/skills/journey-health/SKILL.md`. Expected: below 40960 bytes (spec measured ~38.7KB + 25 bytes of growth).
- [ ] **Step 5: Commit** — `git add plugin/skills/journey-health/SKILL.md plugin/skills/help/context-flow.md` then `git commit -m "Relocate reader glob + help table artifact paths — refs #1077"`

### Task 5: init gitignore block

**Files:**
- Modify: `plugin/skills/init/bootstrap/step-04-gitignore-suggestions.md`

**Interfaces:**
- Produces: the suggested-block line `.claude-tweaks/artifacts/` and a migration-table row — referenced by #1078's legacy-root finding prose.

- [ ] **Step 1: Replace the base-block line** — in the fenced ```gitignore block, the line `screenshots/` becomes `.claude-tweaks/artifacts/`. Keep every other line (especially the 17-line per-level `pipelines/` pattern) byte-identical.
- [ ] **Step 2: Extend the explanation paragraph** — after the sentence ending "…the transcript-judge evaluation-watermark cache, per consumer (…)", add one sentence: `` `.claude-tweaks/artifacts/` (QA screenshots and traces — see the `/test` qa and `/browse` path conventions) is a single blanket line deliberately: nothing under it is ever committed, unlike `pipelines/*/work/`, so the per-level un-ignore treatment documented above is unnecessary there. ``
- [ ] **Step 3: Add a migration-table row** — in the `| Current state | Action |` table, insert a new row before the final "Already has the split entries…" row: `| Bare root-level \`screenshots/\` line (the pre-relocation artifact suggestion), with or without a \`traces/\` line | **Migrate.** Add \`.claude-tweaks/artifacts/\`; keep the legacy \`screenshots/\` line and add a legacy \`traces/\` line so pre-relocation artifact trees stay ignored while they still exist on disk. Both legacy lines become removable once the artifacts residue probe (#1078) has surfaced and cleaned the legacy trees. Backup \`.gitignore\` before write. |`
- [ ] **Step 4: Verify** — Run: `grep -n "screenshots/\|traces/\|artifacts/" plugin/skills/init/bootstrap/step-04-gitignore-suggestions.md`. Expected: the base block carries `.claude-tweaks/artifacts/` and no bare `screenshots/` line; `screenshots/`/`traces/` appear only inside the migration row and explanation as deliberate legacy mentions.
- [ ] **Step 5: Commit** — `git add plugin/skills/init/bootstrap/step-04-gitignore-suggestions.md` then `git commit -m "init gitignore: .claude-tweaks/artifacts/ replaces bare screenshots/, migration row for legacy trees — refs #1077"`

### Task 6: Conformance test + repo-wide sweep verification

**Files:**
- Create: `tests/qa-artifact-path-conformance.test.js`
- Test: the same file (self-testing suite)

**Interfaces:**
- Consumes: Task 1's `SCREENSHOTS_BASE` line, Task 3's browser-review glob, Task 4's journey-health glob.

- [ ] **Step 1: Write the conformance test** at `tests/qa-artifact-path-conformance.test.js`:

```js
'use strict';
// tests/qa-artifact-path-conformance.test.js — pins the QA-artifact writer/reader
// path pair (#1077): the /test qa writer's SCREENSHOTS_BASE and the two reader
// globs (journey-health, visual-review browser-review) must share the exact
// .claude-tweaks/artifacts/screenshots/qa prefix. A drift on either side silently
// splits reader from writer — the bug this suite exists to make loud.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const PREFIX = '.claude-tweaks/artifacts/screenshots/qa';

test('qa-procedures SCREENSHOTS_BASE carries the artifacts prefix', () => {
  const md = read('plugin/skills/test/qa-procedures.md');
  assert.ok(md.includes('| SCREENSHOTS_BASE | `' + PREFIX + '` |'),
    'SCREENSHOTS_BASE default must be ' + PREFIX);
  assert.ok(md.includes('RUN_DIR="' + PREFIX + '/'),
    'RUN_DIR construction must build under ' + PREFIX);
});

test('journey-health reader glob matches the writer prefix', () => {
  const md = read('plugin/skills/journey-health/SKILL.md');
  assert.ok(md.includes('`' + PREFIX + '/*/report.json`'),
    'journey-health must glob report.json under ' + PREFIX);
  const withoutPrefixed = md.split(PREFIX).join('');
  assert.ok(!withoutPrefixed.includes('screenshots/qa'),
    'no bare screenshots/qa remains once the prefixed form is removed');
});

test('visual-review browser-review reader glob matches the writer prefix', () => {
  const md = read('plugin/skills/visual-review/browser-review.md');
  assert.ok(md.includes('`' + PREFIX + '/*/report.json`'),
    'browser-review must glob report.json under ' + PREFIX);
});

test('traces base shares the artifacts home', () => {
  const md = read('plugin/skills/test/qa-procedures.md');
  assert.ok(md.includes('| TRACES_BASE | `.claude-tweaks/artifacts/traces` |'),
    'TRACES_BASE default must live under .claude-tweaks/artifacts/');
});
```

- [ ] **Step 2: Run the new suite** — Run: `node --test tests/qa-artifact-path-conformance.test.js`. Expected: PASS (Tasks 1-4 already moved the prose). Then verify discrimination: `git stash push -u -m "conformance-discrimination-check-1077" -- plugin/skills/test/qa-procedures.md` is FORBIDDEN in this shared-stash repo — instead verify by reading: confirm each `assert.ok` literal appears in exactly the file it reads (grep the asserted strings), which proves the test can go red if a prefix reverts.
- [ ] **Step 3: Repo-wide sweep + whitespace control** — Run: `grep -rn "screenshots/qa\|screenshots/browse" plugin/ | grep -v ".claude-tweaks/artifacts/"` — Expected: zero lines. Run: `grep -rn "traces/" plugin/ | grep -v ".claude-tweaks/artifacts/" | grep -v "{TRACES_BASE}"` — Expected: only the init migration-table row's deliberate legacy mentions. Run the whitespace-spanning control: `grep -rzc "screenshots/qa" plugin/skills/test/qa-procedures.md` and compare against the line-based count — a mismatch means a wrapped literal was missed.
- [ ] **Step 4: Full suite** — Run: `npm test` redirected to a file, then read the tail. Expected: 0 fail (the byte-ceiling suite and every other conformance suite included).
- [ ] **Step 5: Commit** — `git add tests/qa-artifact-path-conformance.test.js` then `git commit -m "Pin QA-artifact writer/reader path pair with conformance test — refs #1077"`
