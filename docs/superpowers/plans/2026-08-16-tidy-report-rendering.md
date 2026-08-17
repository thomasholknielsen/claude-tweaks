# Tidy Report Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:tidy`'s rendered report scannable in a terminal — width-capped, fenced aligned columns, Yours grouped by the command the human runs with a paste-ready command per row, a conformance scan that gates the render, and a digest + `report.md` when the report is still too long.

**Architecture:** Prose-as-implementation. The report contract lives in `skills/tidy/step-6-auto.md` (template, Bucket mapping, Report rules, new Yours-grouping and Conformance-scan sections); `step-6-interactive.md` mirrors the template and cross-references the rules; `skills/tidy/SKILL.md`'s Next Actions derives options from Yours *groups* (byte-neutral edit — the file has 29 bytes of headroom under the 40 KB ceiling). A journey doc and a `node --test` suite pin the new text so a later edit that drops a rule fails CI.

**Tech Stack:** Markdown skill files, `node --test` (built-in), no runtime deps.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T205523-spec-685/work/685-spec.md` (record #685, `Surface: terminal`).

## Global Constraints

- `skills/tidy/SKILL.md` must stay ≤ 40960 bytes (`bin/lib/skill-audit/context-cost.js` `CEILING_BYTES = 40 * 1024`, enforced repo-wide). It is 40931 today. Task 4's two substitutions are pre-measured to land at 40890.
- Every sub-file (`step-6-auto.md`, `step-6-interactive.md`) also stays ≤ 40960 bytes (`tests/sweep-backstop.test.js` pins step-6-auto.md).
- Do NOT reword any routing-table row in `step-6-auto.md` — `tests/sweep-backstop.test.js` regex-pins the `Arm ready PR`, `Unarmed ready PR, ungranted`, and `Unsettled run` rows. This plan touches only the report template, Bucket mapping, Report rules, and adds new sections.
- Never write the literal placeholder tokens `TBD`/`TODO` into any skill file or the journey doc.
- Skill references inside actionable instruction text use the fully-qualified `/claude-tweaks:{skill}` form.
- Commit messages: `{Verb} {what} — {detail}`, imperative, ending with `refs #685` (never `closes`).
- Run each task's test file in isolation (`node --test tests/tidy-report-rules.test.js`); the full suite runs centrally after all tasks.
- Work from the worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-685` — verify with `pwd` + `git rev-parse --show-toplevel` before any edit or commit.
- Zsh: never `echo ===` (`=cmd` expansion); one plain command per Bash call in a worktree session where possible.

---

### Task 1: New report template + Yours grouping rule (`step-6-auto.md`) — with the test file

**Files:**
- Modify: `skills/tidy/step-6-auto.md` (the `#### The report template (standalone auto)` block; the Bucket mapping table's Clean row; a new `#### Yours grouping (by the command the human runs)` section after the Bucket mapping's closing sentence)
- Create: `tests/tidy-report-rules.test.js`

**Interfaces:**
- Produces: the section heading `#### Yours grouping (by the command the human runs)` (Tasks 2, 3, 4 cite it), the literal ```` ```text ```` fence convention, the fixed group order `specify`, `demo`, `git`, `capture`, `backlog refine`.

- [ ] **Step 1: Write the failing test file**

Create `tests/tidy-report-rules.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #685: tidy report rendering — width discipline, fenced column layout,
// command-grouped Yours, conformance scan, digest. Prose-as-implementation:
// pin the report contract's literal text so a later edit that drops a rule
// fails here, plus one mechanical check that the grouping rule's "batchable
// today" claim matches the live argument-hints it is keyed on.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const STEP6 = read('skills', 'tidy', 'step-6-auto.md');

function section(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  assert.ok(start >= 0, `missing heading: ${startHeading}`);
  const end = endHeading ? text.indexOf(endHeading, start + startHeading.length) : text.length;
  assert.ok(end > start, `missing heading after ${startHeading}: ${endHeading}`);
  return text.slice(start, end);
}

// --- Task 1: template + Yours grouping ---

test('step-6-auto.md: report template renders every section\'s rows inside ```text fences', () => {
  const tpl = section(STEP6, '#### The report template (standalone auto)', '#### Bucket mapping');
  const fences = tpl.match(/```text/g) || [];
  assert.ok(fences.length >= 4, `expected a text fence per section (Applied/Approve/Yours/Clean), found ${fences.length}`);
  assert.match(tpl, /\*\*Applied automatically\*\*\n```text/);
  assert.match(tpl, /\*\*Approve \(\{N\}\)\*\*\n```text/);
  assert.match(tpl, /\*\*Yours \(\{N\}\)\*\*\n```text/);
  assert.match(tpl, /\*\*Clean:\*\*\n```text/);
  assert.match(tpl, /Full decision log: \{run-dir\}\/decisions\.md/);
  assert.match(tpl, /_shared\/terminal-ux\.md/, 'template cites the terminal-ux craft file');
});

test('step-6-auto.md: Yours grouping section states the group key, the fixed order, and the batch-vs-paste-block rule', () => {
  const grp = section(STEP6, '#### Yours grouping (by the command the human runs)', '### Report rules');
  assert.match(grp, /`specify`, `demo`, `git`, `capture`, `backlog refine`, then every remaining key alphabetically/);
  assert.match(grp, /argument-hint/);
  assert.match(grp, /\/claude-tweaks:flow/);
  assert.match(grp, /\/claude-tweaks:dispatch/);
  assert.match(grp, /paste block/);
  assert.match(grp, /never by scan step/i);
  assert.match(grp, /\(likewise #41 #113 …\)/);
  assert.match(grp, /never acceptable/);
});

test('step-6-auto.md: Bucket mapping Clean row is per-scan count lines, not a comma list', () => {
  const bucket = section(STEP6, '#### Bucket mapping', '#### Yours grouping');
  assert.doesNotMatch(bucket, /comma list/);
  assert.match(bucket, /\{scan\}\s+\{count\} checked/);
});

// Mechanical: the grouping rule names flow + dispatch as today's batchable
// targets and specify + demo as single-ref. Check that against the live
// argument-hints the rule is keyed on, so the "today" clause cannot go stale
// silently.
test('grouping rule\'s batchable-today claim matches the live argument-hints', () => {
  const hint = (skill) => {
    const m = read('skills', skill, 'SKILL.md').match(/^argument-hint:\s*"([^"]*)"/m);
    assert.ok(m, `no argument-hint in skills/${skill}/SKILL.md`);
    return m[1];
  };
  const multi = /\[,\s*#/; // `<#n>[,#m,#o]` / `#N[,#M...]`
  assert.match(hint('flow'), multi);
  assert.match(hint('dispatch'), multi);
  assert.doesNotMatch(hint('specify'), multi);
  assert.doesNotMatch(hint('demo'), multi);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tidy-report-rules.test.js`
Expected: FAIL — the first three tests fail (no ```text fences in the template, no `#### Yours grouping` heading, Clean row still says "comma list"); the fourth (argument-hint) passes already.

- [ ] **Step 3: Replace the template block in `step-6-auto.md`**

Find this exact block (it starts right after the `#### The report template (standalone auto)` heading):

````markdown
Four verb-grouped sections, these exact literal headers, in this order — what tidy **did**, what it **will do on a click**, what **only the human can do**, and what came back clean:

```markdown
## Tidy Report — {date}

**Applied automatically**
- {what was done}: #{N} "{title}" — {one-line outcome} ({reversibility: commit {hash} | reconcile-converged})
- …

**Approve ({N})**
1. [{tag}] #{N} "{title}" — {staged action, one line}. Approve applies:
   `{the exact command or mutation}`
2. …

**Yours ({N})**
- #{N} "{title}" — {why it needs the human}
  `{paste-ready command}`
- …

**Clean:** {comma list of scans with nothing to report, each with its count — e.g. "parked (3 checked), worktrees (2), doc registry"}
```
````

Replace it with (note the OUTER fence is four backticks so the inner ```text fences render as literal text):

`````markdown
Four verb-grouped sections, these exact literal headers, in this order — what tidy **did**, what it **will do on a click**, what **only the human can do**, and what came back clean. Every section's rows render inside a fenced ```` ```text ```` block as whitespace-aligned columns — `_shared/terminal-ux.md`'s Output formatting ("align columns so the eye can scan one"; one record per line) applied to a chat-rendered report. The fence is what makes the alignment survive Claude Code's terminal renderer; the accepted cost is that `#N` and path text inside it stops being clickable:

````markdown
## Tidy Report — {date}

**Applied automatically**
```text
{verb}       #{N}  {title ≤50, …-truncated}                        {commit abc1234 | reconcile-converged}
{verb}       #{M}  {title}                                          {commit def5678 | reconcile-converged}
```

**Approve ({N})**
```text
1  [{tag}]  #{N}  {title ≤50}
   {staged action, one line}
   {the exact command or mutation}
2  …
```

**Yours ({N})**
```text
{command} ({k})
   #{N}  {title ≤50}                                                {why it needs the human}
   #{M}  {title ≤50}                                                {why it needs the human}
   {batch command covering every row above}
{command} ({k})
   #{N}  {title ≤50}                                                {why it needs the human}
   #{M}  {title ≤50}                                                {why it needs the human}
   {single command for #{N}}
   {single command for #{M}}
```

**Clean:**
```text
{scan}             {count} checked
{scan}             {count} checked
```

Full decision log: {run-dir}/decisions.md
````

Column shape, stated once: rows are indented three spaces under a group head or numbered item; the record column is `#{N}` padded to six characters; the title column is padded to 50 (truncated with a trailing `…` when longer); the trailing column starts at a fixed offset and fills to the 100-character line cap (Report rules below). Applied rows lead with a verb column padded to 12 (`deleted`, `released`, `archived`, `reaped`, …) — the verb *is* the outcome, so the only trailing column is the reversibility token. Approve items take three lines: number + tag + record + title, then the staged action, then the command or mutation. Yours groups follow the Yours grouping rule below — a group head `{command} ({k})`, its rows, then either one batch line or a paste block. Clean is one `{scan}  {count} checked` line per scan (`—` in the count column for a scan that reports no count).
`````

- [ ] **Step 4: Update the Bucket mapping Clean row and add the Yours grouping section**

In the Bucket mapping table, find the row:

```markdown
| Keep / nothing-to-report scans | **Clean:** (counted in the comma list, never itemized) |
```

Replace with:

```markdown
| Keep / nothing-to-report scans | **Clean:** (one `{scan}  {count} checked` line per scan in the Clean fence — counts only, never per-record rows) |
```

Then find the sentence that closes the Bucket mapping section:

```markdown
No finding may be presented information-only: anything actionable carries its paste-ready command in **Yours** or lands in **Approve**.
```

Insert immediately AFTER it (leave that sentence in place, add a blank line, then):

```markdown
#### Yours grouping (by the command the human runs)

**Yours ({N})** groups its rows by the command the human will run — never by scan step, Shape number, or finding tag. The group key is the leading command of the row's paste-ready command: the skill for a `/claude-tweaks:{skill}` invocation, plus its mode word when it has one (`backlog refine` is one key, `backlog grant` another), or the bare executable otherwise (`gh`, `git`, `node`); an env-var prefix (`PIPELINE_RUN_DIR="…" /claude-tweaks:flow …`) is stripped before keying. Group order is fixed — `specify`, `demo`, `git`, `capture`, `backlog refine`, then every remaining key alphabetically — so two renders of the same findings always read the same. Each group renders as a head line `{command} ({k})`, its record rows beneath, then the command line(s):

- **Batchable target** — the skill's `argument-hint` (its `SKILL.md` frontmatter) accepts multiple record refs: one batch line closes the group, `{command} #{N},#{M},…`, and covers every row above it. Today that is `/claude-tweaks:flow` (`<#n>[,#m,#o]`) and `/claude-tweaks:dispatch` (`#N[,#M...]`). Read the hint at render time rather than memorizing this list — when a skill gains a batch form, this rule needs no edit and the render simply gets shorter.
- **Single-ref target** (`/claude-tweaks:specify` — `<#N|…>`, `/claude-tweaks:demo` — `[#N]`, `gh …`, `git …`): a consecutive paste block closes the group — one command line per row, in row order — so one paste runs them all.
- **Ref-less command** (`/claude-tweaks:backlog refine` covers the whole queue; the line is identical for every row): rendered once, as the group's single closing command line.

`(likewise #41 #113 …)`, `(and N more)`, `et al.` and every other multi-record shorthand are never acceptable, in any section — one row per record, and one command line per row (or one batch / ref-less line per group). The conformance scan below rejects a render that carries any of them.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/tidy-report-rules.test.js`
Expected: PASS (4/4). Also run `node --test tests/sweep-backstop.test.js` — Expected: PASS (routing rows untouched, file under 40 KB).

- [ ] **Step 6: Commit**

```bash
git add skills/tidy/step-6-auto.md tests/tidy-report-rules.test.js
git commit -m "Render the tidy report as fenced aligned columns and group Yours by the human's command — template, Bucket mapping Clean row, Yours grouping rule, test pins — refs #685"
```

---

### Task 2: Width discipline, digest rule, and conformance scan (`step-6-auto.md`)

**Files:**
- Modify: `skills/tidy/step-6-auto.md` (the `### Report rules` bullet list; a new `#### Conformance scan (before the hard gate)` section between Report rules and `#### Hard gate (report before question)`; one sentence in the Hard gate paragraph)
- Modify: `tests/tidy-report-rules.test.js` (append tests)

**Interfaces:**
- Consumes: Task 1's `#### Yours grouping (by the command the human runs)` heading and ```text fence convention.
- Produces: the heading `#### Conformance scan (before the hard gate)`; the literals `100 characters`, `50 characters`, `40 lines`, `{run-dir}/report.md` (Tasks 3, 5 cite the digest).

- [ ] **Step 1: Append failing tests**

Append to `tests/tidy-report-rules.test.js`:

```js
// --- Task 2: Report rules width discipline, digest, conformance scan ---

test('step-6-auto.md: Report rules carry the width cap, title truncation, one-fact-per-line, and the shorthand ban', () => {
  const rules = section(STEP6, '### Report rules', '#### Conformance scan');
  assert.match(rules, /\*\*100 characters\*\*/);
  assert.match(rules, /\*\*50 characters\*\*/);
  assert.match(rules, /one fact/);
  assert.match(rules, /\(likewise …\)/);
  assert.match(rules, /never substitutes for it/);
  assert.match(rules, /bans drawn table borders, not alignment/);
});

test('step-6-auto.md: Report rules state the 40-line digest rule and the report.md path', () => {
  const rules = section(STEP6, '### Report rules', '#### Conformance scan');
  assert.match(rules, /\*\*40 lines\*\*/);
  assert.match(rules, /\{run-dir\}\/report\.md/);
  assert.match(rules, /Below 40 lines nothing extra is written/);
});

test('step-6-auto.md: a conformance scan sits between Report rules and the Hard gate, one row per rule with a remedy', () => {
  const rulesAt = STEP6.indexOf('### Report rules');
  const scanAt = STEP6.indexOf('#### Conformance scan (before the hard gate)');
  const gateAt = STEP6.indexOf('#### Hard gate (report before question)');
  assert.ok(rulesAt > 0 && scanAt > rulesAt && gateAt > scanAt, 'order must be Report rules → Conformance scan → Hard gate');
  const scan = STEP6.slice(scanAt, gateAt);
  assert.match(scan, /\| Rule \| Check \| Remedy on failure \|/);
  for (const rule of ['Width', 'Titles', 'One record per row', 'No shorthand', 'Command alone', 'Every Yours row covered', 'Batch only where allowed', 'Fenced, no box art', 'Group order', 'Clean shape', 'Footer once', 'Digest']) {
    assert.match(scan, new RegExp(`^\\| ${rule} \\|`, 'm'), `conformance scan lacks a "${rule}" row`);
  }
  assert.match(scan, /never shipped as-is/);
});

test('step-6-auto.md: the Hard gate accepts the digest in place of the whole report when the digest rule fired', () => {
  const gate = section(STEP6, '#### Hard gate (report before question)');
  assert.match(gate, /when the digest rule fired, the digest/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tidy-report-rules.test.js`
Expected: FAIL — the four new tests fail (`#### Conformance scan` heading absent, no `**100 characters**`, hard gate unchanged); Task 1's tests still pass.

- [ ] **Step 3: Replace the Report rules bullet list**

Find this exact bullet list under `### Report rules` (the paragraph "Binding rules for every rendering of this template, on both surfaces (`step-6-interactive.md` cross-references this heading rather than restating):" stays):

```markdown
- No box-drawing tables anywhere in the report — sections are markdown lists and plain tables only.
- Every actionable line carries a paste-ready command (fully-qualified `/claude-tweaks:{skill}` form for skill invocations) or lands in **Approve ({N})**.
- Commands render on their own line: a row's paste-ready command (and an Approve row's applied mutation) sits alone on its own line, with the annotation — tag, record ref, rationale — on the adjacent line above. A command never shares a line with prose, and no annotation trails a command on its line.
- Records render as `#{N} "{title}"` — titles come from the scan agents' Template-A findings, which already carry them (the dispatch prompts require item titles in the Finding column); never from a fresh per-row `gh issue view`.
- `{run-dir}/decisions.md` is referenced by path exactly once, in the report footer, and never replayed into chat.
- Empty-state: **Applied automatically**, **Approve ({N})**, and **Yours ({N})** are each omitted entirely when empty; **Clean:** always renders — as the comma list, or as **Clean:** nothing — every scan surfaced findings.
```

Replace with:

```markdown
- No box-drawing art anywhere in the report — no `┌ ─ ┐ │ ├ ┤ └ ┘` characters. This bans drawn table borders, not alignment: whitespace-aligned columns inside the ```text fences are required, and are what "no box-drawing tables" always meant.
- Width: no rendered line exceeds **100 characters**. Titles are truncated to **50 characters** with a trailing `…`; every row states one fact — the record, its title, one short trailing column — and never wraps onto a second line.
- Every actionable line carries a paste-ready command (fully-qualified `/claude-tweaks:{skill}` form for skill invocations) or lands in **Approve ({N})**. In **Yours ({N})** that command is the group's batch line or its paste block (Yours grouping above) — one command line per row, or one batch / ref-less line per group; multi-record shorthand (`(likewise …)`, `(and N more)`) never substitutes for it.
- Commands render on their own line: a command line holds only the command — no annotation, no rationale, no leading `—`/`→`, nothing trailing. The annotation (tag, record ref, why) lives on the row line(s) above it.
- Records render as `#{N}` in the record column followed by the title column — titles come from the scan agents' Template-A findings, which already carry them (the dispatch prompts require item titles in the Finding column); never from a fresh per-row `gh issue view`.
- `{run-dir}/decisions.md` is referenced by path exactly once, in the report footer, and never replayed into chat.
- Empty-state: **Applied automatically**, **Approve ({N})**, and **Yours ({N})** are each omitted entirely when empty; **Clean:** always renders — as its fence, or as the single line **Clean:** nothing — every scan surfaced findings.
- Digest: when the rendered report exceeds **40 lines** (fences, headers and footer all counted), do not send it whole. Write the full report to `{run-dir}/report.md` (Bash append — the same write path as `decisions.md`; the run dir lives under the main checkout) and send a digest of at most ~20 lines instead: the `## Tidy Report` line; **Applied automatically** collapsed to one line with its count; **Approve ({N})** in full — it is the click surface, and nothing is approved unseen; **Yours ({N})** as group heads with counts, each followed by its batch or ref-less line when the group has one (paste blocks stay in `report.md`); **Clean:** collapsed to `{n} scans clean`; and a footer `Full report: {run-dir}/report.md` in place of the decisions.md line (the full report carries that one). Below 40 lines nothing extra is written and the report is sent whole.
```

- [ ] **Step 4: Insert the Conformance scan section**

Immediately after the new bullet list (before the `#### Hard gate (report before question)` heading), insert:

```markdown
#### Conformance scan (before the hard gate)

Run this scan over the literal markdown about to be sent — the whole report, or the digest plus `report.md` when the digest rule fired — before the hard gate below. Every row is a check and a remedy; a failing row is fixed and the scan re-run. A non-conformant render is never shipped as-is, and a clean pass logs nothing (mirrors `multi-spec.md`'s pre-flight verify sweep, which stays silent on a clean sweep).

| Rule | Check | Remedy on failure |
|---|---|---|
| Width | no line longer than 100 characters | truncate the title to 50 + `…`; shorten the trailing column; never wrap a row |
| Titles | every title column ≤ 50 characters, `…` when truncated | truncate |
| One record per row | every Applied / Approve / Yours row carries exactly one `#{N}` | split into one row per record |
| No shorthand | none of `(likewise`, `(also`, `(and {n} more`, `(+{n}`, `et al` appear anywhere | expand into one row per record and one command line per row |
| Command alone | a command line holds only the command — no leading `—`/`→`, no trailing prose | move the annotation to the row line above |
| Every Yours row covered | each Yours group closes with one batch or ref-less line, or a paste block with exactly one line per row | add the missing command line(s) |
| Batch only where allowed | a batch line's target skill accepts multiple refs per its `argument-hint` (`flow`, `dispatch` today) | expand into a paste block |
| Fenced, no box art | every non-empty section's rows sit inside a ```text fence; no `┌ ─ ┐ │ ├ ┤ └ ┘` characters anywhere | re-render inside the fence |
| Group order | Yours groups run `specify`, `demo`, `git`, `capture`, `backlog refine`, then alphabetical | reorder |
| Clean shape | `**Clean:**` followed by a fence of `{scan}  {count} checked` lines, or the literal `**Clean:** nothing — every scan surfaced findings` | re-render |
| Footer once | `{run-dir}/decisions.md` appears exactly once, in the footer | dedupe |
| Digest | a report over 40 lines was written to `{run-dir}/report.md` and the chat carries the digest, not the whole | apply the digest rule |

```

- [ ] **Step 5: Amend the Hard gate sentence**

Find in the `#### Hard gate (report before question)` paragraph:

```markdown
Check the response you are about to send: does it already contain the report above as literal rendered markdown — every non-empty section of **Applied automatically**, **Approve ({N})**, **Yours ({N})**, and the **Clean:** line? If not, render it now, in this response, before any `AskUserQuestion` call.
```

Replace with:

```markdown
Check the response you are about to send: does it already contain the report above — or, when the digest rule fired, the digest — as literal rendered markdown — every non-empty section of **Applied automatically**, **Approve ({N})**, **Yours ({N})**, and the **Clean:** line? If not, render it now, in this response, before any `AskUserQuestion` call.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/tidy-report-rules.test.js`
Expected: PASS (8/8). Run: `node --test tests/sweep-backstop.test.js` — Expected: PASS. Run: `wc -c skills/tidy/step-6-auto.md` — Expected: well under 40960.

- [ ] **Step 7: Commit**

```bash
git add skills/tidy/step-6-auto.md tests/tidy-report-rules.test.js
git commit -m "Add width discipline, the 40-line digest rule, and a conformance scan gating the tidy report render — refs #685"
```

---

### Task 3: Mirror the fenced template in `step-6-interactive.md`

**Files:**
- Modify: `skills/tidy/step-6-interactive.md` (the template block, the "Section semantics" paragraph's Yours clause, the Hard gate paragraph)
- Modify: `tests/tidy-report-rules.test.js` (append tests)

**Interfaces:**
- Consumes: Task 1's template shape and `#### Yours grouping` heading; Task 2's digest rule.

- [ ] **Step 1: Append failing tests**

```js
// --- Task 3: interactive mirror ---

const INTERACTIVE = read('skills', 'tidy', 'step-6-interactive.md');

test('step-6-interactive.md: template mirrors the fenced shape and still cites step-6-auto.md\'s rules instead of restating', () => {
  assert.match(INTERACTIVE, /\*\*Applied automatically\*\*\n```text/);
  assert.match(INTERACTIVE, /\*\*Approve \(\{N\}\)\*\*\n```text/);
  assert.match(INTERACTIVE, /\*\*Yours \(\{N\}\)\*\*\n```text/);
  assert.match(INTERACTIVE, /\*\*Clean:\*\*\n```text/);
  assert.match(INTERACTIVE, /stated once there — not restated here/);
  assert.match(INTERACTIVE, /Yours grouping/);
  assert.match(INTERACTIVE, /when the digest rule fired, the digest/);
  assert.doesNotMatch(INTERACTIVE, /\*\*Clean:\*\* \{comma list/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tidy-report-rules.test.js`
Expected: FAIL — the new interactive test fails on the first assertion.

- [ ] **Step 3: Replace the interactive template block**

Find this exact block in `skills/tidy/step-6-interactive.md`:

````markdown
```markdown
## Tidy Report — {date}

**Applied automatically**
- {what was done}: #{N} "{title}" — {one-line outcome} ({reversibility: commit {hash} | reconcile-converged})
- …

**Approve ({N})**
1. [{tag}] #{N} "{title}" — {recommended action, one line}. Approve executes:
   `{the exact command or mutation}`
2. …

**Yours ({N})**
- #{N} "{title}" — {why it needs the human}
  `{paste-ready command}`
- …

**Clean:** {comma list of scans with nothing to report, each with its count}
```
````

Replace with:

`````markdown
````markdown
## Tidy Report — {date}

**Applied automatically**
```text
{verb}       #{N}  {title ≤50, …-truncated}                        {commit abc1234 | reconcile-converged}
```

**Approve ({N})**
```text
1  [{tag}]  #{N}  {title ≤50}
   {recommended action, one line}
   {the exact command or mutation}
2  …
```

**Yours ({N})**
```text
{command} ({k})
   #{N}  {title ≤50}                                                {why it needs the human}
   {batch command, or a paste block with one line per row}
```

**Clean:**
```text
{scan}             {count} checked
```

Full decision log: {run-dir}/decisions.md
````
`````

- [ ] **Step 4: Update the Section semantics paragraph and the Hard gate**

In the paragraph beginning "Section semantics follow `step-6-auto.md`'s Bucket mapping and are bound by its "Report rules" section (stated once there — not restated here):", find:

```markdown
findings that only a human can act on (needs-scoring, re-triage, acceptance gaps, trigger-met parked records, unsettled runs, ungranted PRs, cross-spec patterns, design-record drift) render in **Yours ({N})** with their paste-ready command;
```

Replace with:

```markdown
findings that only a human can act on (needs-scoring, re-triage, acceptance gaps, trigger-met parked records, unsettled runs, ungranted PRs, cross-spec patterns, design-record drift) render in **Yours ({N})** grouped per `step-6-auto.md`'s Yours grouping, each group closing with its batch line or paste block;
```

Then in the `**Hard gate.**` paragraph, find:

```markdown
does it already contain the `## Tidy Report` block above as literal rendered markdown, with every non-empty section
```

Replace with:

```markdown
does it already contain the `## Tidy Report` block above — or, when the digest rule fired, the digest — as literal rendered markdown, with every non-empty section
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/tidy-report-rules.test.js`
Expected: PASS (9/9).

- [ ] **Step 6: Commit**

```bash
git add skills/tidy/step-6-interactive.md tests/tidy-report-rules.test.js
git commit -m "Mirror the fenced tidy report template on the interactive surface — grouped Yours, digest-aware hard gate — refs #685"
```

---

### Task 4: Next Actions derives from Yours groups (`skills/tidy/SKILL.md`, byte-neutral)

**Files:**
- Modify: `skills/tidy/SKILL.md` (two substrings in the `## Next Actions` section — pre-measured to land the file at 40890 bytes; ceiling 40960)
- Modify: `tests/tidy-report-rules.test.js` (append tests)

**Interfaces:**
- Consumes: Task 1's `#### Yours grouping` heading (cited as "`step-6-auto.md`'s Yours grouping").

- [ ] **Step 1: Append failing tests**

```js
// --- Task 4: SKILL.md Next Actions derives from Yours groups, under the ceiling ---

const TIDY_SKILL = read('skills', 'tidy', 'SKILL.md');

test('tidy/SKILL.md: Next Actions derives one option per Yours group and stays under the 40 KB ceiling', () => {
  const na = section(TIDY_SKILL, '## Next Actions', '## Component-Skill Contract');
  assert.match(na, /Then take Yours \*\*groups\*\* \(`step-6-auto\.md`'s Yours grouping\)/);
  assert.match(na, /one per Yours group as derived above/);
  assert.doesNotMatch(na, /one per Yours item/);
  assert.ok(Buffer.byteLength(TIDY_SKILL, 'utf8') <= 40 * 1024, `tidy/SKILL.md is ${Buffer.byteLength(TIDY_SKILL, 'utf8')} bytes — over the 40 KB ceiling`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tidy-report-rules.test.js`
Expected: FAIL — `Then take Yours **groups**` not found.

- [ ] **Step 3: Apply the two substitutions in `skills/tidy/SKILL.md`**

Substitution A — in the first paragraph under `## Next Actions`, find exactly:

```
Then take Yours items, in report order, one option each — `label` naming the item's action (≤5 words), `description` carrying the item's own paste-ready command verbatim (fully-qualified `/claude-tweaks:{skill}` form):
```

Replace with exactly:

```
Then take Yours **groups** (`step-6-auto.md`'s Yours grouping), in report order, one option each — `label` naming the group's command (≤5 words), `description` carrying the group's batch command verbatim, or a paste-block group's first line verbatim (the report holds the rest):
```

Substitution B — in the `AskUserQuestion` bullet list, find exactly:

```
- Up to 3 more options (when Yours items exist and the Approve option is absent) or up to 2 more options (when Yours items exist and the Approve option is present) — one per Yours item as derived above, first option overall suffixed `(Recommended)` only when the "Approve ({N})" option is absent
```

Replace with exactly:

```
- Up to 3 more options (Approve absent) or 2 (Approve present) — one per Yours group as derived above; the first option overall is suffixed `(Recommended)` only when the Approve option is absent
```

- [ ] **Step 4: Verify the byte count and run the tests**

Run: `wc -c skills/tidy/SKILL.md`
Expected: `40890` (≤ 40960). If it prints anything above 40960, the substitution was not exact — diff against the strings above; do not add text elsewhere.

Run: `node --test tests/tidy-report-rules.test.js`
Expected: PASS (10/10). Run: `node --test tests/sweep-backstop.test.js` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/tidy/SKILL.md tests/tidy-report-rules.test.js
git commit -m "Derive tidy Next Actions from Yours groups — one option per group, byte-neutral under the SKILL.md ceiling — refs #685"
```

---

### Task 5: Journey doc — new report shape, grouped Yours, digest step, worked example

**Files:**
- Modify: `docs/journeys/tidy-standalone-auto-report.md` (frontmatter `files:` gains `skills/tidy/step-6-interactive.md`; Success state; Step 3 Expect; Step 4 Action; new Step 5; new `## Example render` section)
- Modify: `tests/tidy-report-rules.test.js` (append tests)

**Interfaces:**
- Consumes: every literal from Tasks 1–4.

- [ ] **Step 1: Append failing tests**

```js
// --- Task 5: journey doc pins the new shape ---

const JOURNEY = read('docs', 'journeys', 'tidy-standalone-auto-report.md');

test('journey doc: Step 3 expects fenced aligned columns, grouped Yours, no shorthand; Step 5 covers the digest', () => {
  assert.match(JOURNEY, /skills\/tidy\/step-6-interactive\.md/);
  assert.match(JOURNEY, /aligned columns inside ```text fences/);
  assert.match(JOURNEY, /grouped by the command the human runs/);
  assert.match(JOURNEY, /no `\(likewise …\)` shorthand/);
  assert.match(JOURNEY, /### 5\. A wide sweep digests/);
  assert.match(JOURNEY, /\{run-dir\}\/report\.md/);
  assert.match(JOURNEY, /## Example render/);
  // The example render itself must obey the width rule it demonstrates.
  const example = JOURNEY.slice(JOURNEY.indexOf('## Example render'));
  const fenced = example.split('\n').filter((l) => !l.startsWith('#') && !l.startsWith('**') && !l.startsWith('```') && !l.startsWith('Full ') && l.trim() !== '' && !l.startsWith('An example') && !l.startsWith('The 16 Yours'));
  for (const line of fenced) assert.ok(line.length <= 100, `example line over 100 chars: ${line}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tidy-report-rules.test.js`
Expected: FAIL — journey lacks `step-6-interactive.md` in `files:` and the new phrases.

- [ ] **Step 3: Edit the journey doc**

(a) Frontmatter — find:

```yaml
files:
  - skills/tidy/step-6-auto.md
  - skills/tidy/SKILL.md
```

Replace with:

```yaml
files:
  - skills/tidy/step-6-auto.md
  - skills/tidy/step-6-interactive.md
  - skills/tidy/SKILL.md
```

(b) Success state — find:

```markdown
**Success state:** The report renders the four literal sections — **Applied automatically**, **Approve ({N})**, **Yours ({N})**, **Clean:** — empty sections omitted (Clean always present); reconcile-converged outcomes (released claims on closed issues, archived/deleted abandoned branches) appear under Applied with their evidence reason; every Yours line carries its fully-qualified command; Next Actions derives from Approve/Yours (Apply-all-staged first when Approve is non-empty, capped at 4 options total).
```

Replace with:

```markdown
**Success state:** The report renders the four literal sections — **Applied automatically**, **Approve ({N})**, **Yours ({N})**, **Clean:** — empty sections omitted (Clean always present), each section's rows as aligned columns inside ```text fences, no line over 100 characters; reconcile-converged outcomes (released claims on closed issues, archived/deleted abandoned branches) appear under Applied with their reversibility token; Yours is grouped by the command the human runs and every group closes with a batch line or a paste block (one command per row); a report over 40 lines arrives as a digest with the full report at `{run-dir}/report.md`; Next Actions derives from Approve/Yours groups (Approve first when non-empty, capped at 4 options total).
```

(c) Step 3 Expect — find:

```markdown
- **Expect:** No box-drawing tables; records as `#{N} "{title}"` (titles from the scan agents' own findings — no per-row `gh issue view`); `{run-dir}/decisions.md` referenced by path exactly once.
```

Replace with:

```markdown
- **Expect:** The conformance scan ran first — no `┌─┐` box art, but aligned columns inside ```text fences (the "no box-drawing tables" rule bans drawn borders, not alignment); no line over 100 characters, titles truncated to 50 with `…`; records as `#{N}` plus a title column (titles from the scan agents' own findings — no per-row `gh issue view`); Yours grouped by the command the human runs in the fixed order `specify`, `demo`, `git`, `capture`, `backlog refine`, then alphabetical, one row per record and no `(likewise …)` shorthand, each group closing with one batch line (`flow`/`dispatch` — multi-ref `argument-hint`) or a paste block of single commands; Clean as one `{scan}  {count} checked` line per scan; `{run-dir}/decisions.md` referenced by path exactly once.
```

(d) Step 4 Action — find:

```markdown
- **Action:** The closing question derives from the report: "Apply all staged ({N})" first when Approve is non-empty, then up to Yours items (capped so the total never exceeds 4 options), then the help dashboard.
```

Replace with:

```markdown
- **Action:** The closing question derives from the report: "Approve ({N})" first when Approve is non-empty, then up to Yours *groups* — one option per group, its description the group's batch line or the first line of its paste block (capped so the total never exceeds 4 options) — then the help dashboard.
```

(e) Append after Step 4's Expect bullet (before `## Example render`, which is also new):

```markdown

### 5. A wide sweep digests instead of flooding the chat
- **Action:** A full sweep whose report would exceed 40 lines (a dozen-plus Yours records across several groups is enough — every single-ref record costs a row plus a paste line) writes the whole report to `{run-dir}/report.md` and sends a ~20-line digest: Approve in full, Yours as group heads with counts (plus batch lines), Applied and Clean collapsed to counts, and a `Full report:` footer.
- **Expect:** Nothing is lost — every row and every paste block is in `report.md`; the digest is what the hard gate checks for, and Next Actions still derives from the groups. Below 40 lines no `report.md` is written and the report arrives whole.

## Example render

An example of the post-#685 shape for a sweep with 3 auto-applied cleanups, no staged items, 16 Yours records across four groups, and six clean scans (fictional records). The 16 Yours records fit in 37 lines; the whole report is 58, so this render ships as a digest with this full form in `report.md`:

```markdown
## Tidy Report — 2026-08-16

**Applied automatically**
```text
released     #612  Reclaim net-empty branches after merge — reconci…    reconcile-converged
archived     #588  Retire the legacy effort:* label family                 reconcile-converged
deleted      #601  Terminal track for design-wrapper — plan file          commit 3f9c1a2
```

**Yours (16)**
```text
/claude-tweaks:specify (6)
   #640  Backlog overview funnel: stage counts per lane                  ready, missing risk/size
   #652  Reconcile red-tip detection for stale mirror refs               ready, missing risk/size
   #655  Routine kickoff kernel self-heal fallback                       ready, missing risk/size
   #661  Dispatch two-call gate: settle before teardown                  ready, missing risk/size
   #663  Help dashboard trust table render                               ready, missing risk/size
   #670  Capture born-ready chain: --chained shaping                     ready, missing risk/size
   /claude-tweaks:specify #640
   /claude-tweaks:specify #652
   /claude-tweaks:specify #655
   /claude-tweaks:specify #661
   /claude-tweaks:specify #663
   /claude-tweaks:specify #670
/claude-tweaks:demo (5)
   #598  Merge verification policy key                                   closed, no acceptance
   #599  Reference card argument-hint pin                                closed, no acceptance
   #608  Specify native sub_issues linking                               closed, no acceptance
   #610  Specify native blocked_by linking                               closed, no acceptance
   #647  permittedGrants per-grant reasons                               closed, no acceptance
   /claude-tweaks:demo #598
   /claude-tweaks:demo #599
   /claude-tweaks:demo #608
   /claude-tweaks:demo #610
   /claude-tweaks:demo #647
git (2)
   #617  Design exhaust deferral gate                                    PR closed unmerged, wt kept
   #620  Revive needs-definition sweep                                   PR closed unmerged, wt kept
   git -C .claude/worktrees/design-exhaust-deferral-gate log --oneline -5
   git -C .claude/worktrees/revive-needs-definition log --oneline -5
/claude-tweaks:backlog refine (3)
   #571  Tidy reconcile routing for build+ worktrees                     bot:blocked, retry ceiling
   #574  Sweep backstop unarmed PR grant                                 bot:blocked, retry ceiling
   #589  Docs-health depth mismatch judge                                bot:blocked, retry ceiling
   /claude-tweaks:backlog refine
```

**Clean:**
```text
parked             3 checked
worktrees          9 checked
doc registry       —
design docs        2 checked
plans              4 checked
issue claims       12 checked
```

Full decision log: .claude-tweaks/pipelines/2026-08-16T203000-tidy-standalone/decisions.md
```
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/tidy-report-rules.test.js`
Expected: PASS (11/11). Also run any journey-doc conformance suite: `node --test tests/journey-frontmatter.test.js` if it exists (`ls tests | grep -i journey`); Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/journeys/tidy-standalone-auto-report.md tests/tidy-report-rules.test.js
git commit -m "Update the tidy standalone-auto report journey — fenced columns, grouped Yours, digest step, worked example — refs #685"
```

---

## Self-review

**Spec coverage.** A (width rules + conformance scan) → Task 2. B (fenced columns, box-drawing restatement, clickable-link tradeoff) → Task 1 (+ Task 3 mirror). C (grouped Yours, batch-vs-paste keyed to `argument-hint`, no shorthand, Next Actions still resolves) → Task 1 + Task 4. D (digest + `report.md`, threshold, below-threshold no-op) → Task 2 (+ Task 3 hard gate, Task 5 Step 5). Journey doc → Task 5. Test pins → every task. SKILL.md ceiling → Task 4 (measured 40890). Runnable-commands convention stays tidy-local — no `_shared/` file created (spec's Gotchas). Follow-on batch argument for specify/demo → explicitly not bundled; nothing here depends on it.

**AC "16 Yours items ≤ ~40 lines" reading.** The Yours section for the 16-item worked example is 37 lines (head + row + command per single-ref record); the whole report is 57, which is exactly the case D's digest exists for. The journey's Example render states both numbers so a reader sees the interpretation rather than infers it.

**Placeholder scan.** No `TBD`/`TODO`; every code step carries the literal text.

**Type/name consistency.** Headings cited across tasks — `#### Yours grouping (by the command the human runs)`, `#### Conformance scan (before the hard gate)`, `#### Hard gate (report before question)`, `### Report rules`, `#### Bucket mapping`, `#### The report template (standalone auto)` — are spelled identically in every task and in the test regexes. The Task 1 test slices `#### Yours grouping…` to `### Report rules`; that order holds because Yours grouping is inserted at the end of the Bucket mapping section, which precedes Report rules in the file.
