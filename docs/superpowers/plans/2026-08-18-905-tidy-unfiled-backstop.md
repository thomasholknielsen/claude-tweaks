# Tidy Backstop Scan for Unfiled Upstream Drafts (#905) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/claude-tweaks:tidy` backstop scan that enumerates preserved-but-unfiled `staged/upstream-unfiled-*.md` drafts (live and archived run dirs) and hands each to the human with paste-ready re-file/discard commands.

**Architecture:** Prose-only addition, following the existing "Backstop:" sub-pattern already established under Step 4.7 of `tidy/scan-procedures.md` (missed `parked` restoration, missed `bot:in-progress` removal, empty `decisions.md`) — same `find`-based, live+archived enumeration shape, same "flag only, human executes" semantics. A new `[unfiled]` collection tag routes to **Yours ({N})** alongside `[sizing]`/`[acceptance-gap]` (no mutation exists to stage). Separately, `feedback/SKILL.md` Step 1 gains one sentence: verified at plan-authoring time that its Gather step, as currently written, has no provision for treating a caller-supplied preserved-draft path as the report's substance — the free-text `re-file the preserved draft at {abs path}` instruction names a file to read, which is not the same thing as "the substance of the report" the Input table already handles. `docs/skill-graph.md` gets one new `/tidy` row under `## feedback`.

**Tech Stack:** Markdown skill prose; Node built-in test runner (`node --test`), no external deps.

**Spec:** `.claude-tweaks/pipelines/2026-08-18T144500-spec-906-901-902-905/spec-905/work/905-spec.md`

## Global Constraints

- Build after #901 (calibration read-out) lands — both edit `plugin/skills/tidy/scan-procedures.md`; #905 is Blocked-by #901 for exactly this reason (sequential same-file builds).
- Enumeration is `find`-based, never grep — run dirs are gitignored and grep-family tools skip them silently (recursive-grep-skips-gitignored-files). Anchor at `{RUN_ROOT}` (main checkout), not `{REPO_ROOT}` — matches the existing Step 4.7 backstops' own anchoring rule, since run dirs live at the main checkout regardless of which worktree is active.
- Every paste-ready command renders on its own line, no inline trailing comment (report-lines-must-carry-runnable-commands).
- `/claude-tweaks:feedback`'s `--pre-confirmed` flag is legitimate only from the Review Console / multi-spec console (`feedback/SKILL.md`'s Component-Skill Contract) — the re-file command this scan hands to a human is always the free-text form, never `--pre-confirmed`.
- Tidy never deletes or files anything from this scan — report-only, both options (re-file, discard) are human-paste actions.
- Commits reference `refs #905` (the PR body carries `Fixes #905`). One plain Bash command per invocation (worktree session constraint).

---

### Task 1: Backstop scan procedure in `scan-procedures.md`

**Files:**
- Modify: `plugin/skills/tidy/scan-procedures.md` — new `### Backstop: preserved but unfiled upstream feedback drafts` subsection, inserted after the existing "Backstop: empty decisions.md on a completed standalone run" subsection (currently ending at line 278) and before `## Step 4.8` (currently line 280); one new row in the "Collection routing" table (currently lines 398-407)
- Test: `tests/tidy-unfiled-backstop.test.js` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the `[unfiled]` collection tag Task 2 need not touch; the scan text Task 3's full-suite run verifies alongside everything else.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
// Pins #905's tidy backstop scan for preserved-but-unfiled upstream feedback
// drafts: the scan subsection exists with its find command, its paste-ready
// re-file/discard commands, the clean-scan explicit-zero rule, and the
// [unfiled] tag's Collection routing row.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SCAN = path.join(__dirname, '..', 'plugin', 'skills', 'tidy', 'scan-procedures.md');

test('scan-procedures.md carries the unfiled-drafts backstop', () => {
  const text = fs.readFileSync(SCAN, 'utf8');
  assert.ok(
    text.includes('### Backstop: preserved but unfiled upstream feedback drafts'),
    'backstop subsection heading missing',
  );
  assert.ok(
    text.includes('find .claude-tweaks/pipelines -path "*/staged/upstream-unfiled-*.md"'),
    'find enumeration command missing or does not match the live+archived glob shape',
  );
  assert.ok(
    text.includes('/claude-tweaks:feedback re-file the preserved draft at'),
    're-file paste-ready command template missing',
  );
  assert.ok(
    /rm '\{abs path\}'|rm "\{abs path\}"/.test(text),
    'discard paste-ready rm command template missing',
  );
  assert.ok(
    text.includes('0 unfiled upstream drafts'),
    'explicit clean-scan report line missing',
  );
  assert.ok(
    text.includes('run still live'),
    'live non-terminal run annotation missing',
  );
});

test('scan-procedures.md routes [unfiled] to Yours, no mutation staged', () => {
  const text = fs.readFileSync(SCAN, 'utf8');
  const routingSection = text.slice(text.indexOf('## Collection routing'));
  assert.ok(
    /\[unfiled\]/.test(routingSection),
    '[unfiled] tag missing from the Collection routing table',
  );
});

test('the backstop cites --pre-confirmed as illegitimate for its own command', () => {
  const text = fs.readFileSync(SCAN, 'utf8');
  const section = text.slice(
    text.indexOf('### Backstop: preserved but unfiled upstream feedback drafts'),
    text.indexOf('## Step 4.8'),
  );
  assert.ok(
    !section.includes('--pre-confirmed'),
    'the re-file command in this scan must never carry --pre-confirmed (console-callers-only)',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tidy-unfiled-backstop.test.js`
Expected: FAIL — all three tests fail (subsection absent).

- [ ] **Step 3: Commit the red test**

```bash
git add tests/tidy-unfiled-backstop.test.js
git commit -m "Add pin suite for tidy's unfiled-upstream-drafts backstop scan (refs #905)"
```

- [ ] **Step 4: Insert the backstop subsection**

Insert immediately after the existing line `→ Collect each as: \`[claim] {run-dir} — clean standalone run, empty decisions.md — possible skipped audit-log write (manual review)\`` (the close of the "empty decisions.md" backstop) and before the `## Step 4.8: Audit GitHub PRs and Issues` heading:

```
### Backstop: preserved but unfiled upstream feedback drafts

`/claude-tweaks:feedback`'s Step 8 preserves a draft as `staged/upstream-unfiled-{N}.md` when
filing fails — deliberately outside the `staged/wrap-up-upstream-*.md` glob the consoles
re-enumerate, so a resume never re-files it, and there is no automatic retry. Enumerate every
surviving preserved draft, live and archived, `find`-only (run dirs are gitignored):

```bash
cd "{RUN_ROOT}" && find .claude-tweaks/pipelines -path "*/staged/upstream-unfiled-*.md" 2>/dev/null
```

For each match:

- **Run id** — the path segment naming the run directory (one level under `pipelines/archive/`
  for an archived run, directly under `pipelines/` for a live one).
- **Title** — the file's first `**Summary:**` line (the field `feedback/SKILL.md` Step 5's draft
  template guarantees on every drafted body); when absent, `{filename} (run {run id})`.
- **Age** — parse the run id's leading `{ISO-timestamp}-{slug}` prefix and report elapsed time;
  `age unknown` when the run id doesn't parse as one.
- **Live-run check** — a path under `pipelines/archive/` is archived, no further check needed.
  Otherwise read that run's `run-state.json`: a `status` in `run-integrity.js`'s `NON_TERMINAL`
  set (`active`, `interrupted`) means the run is still live.

A live, non-terminal run's draft gets the annotation "run still live — leave unless abandoned"
in place of the two action options below — the race with an active session is accepted, since
every action here is a human paste and nothing destructive runs automatically. Every other match
(archived, or live-but-terminal) gets two paste-ready commands, each on its own line:

    /claude-tweaks:feedback re-file the preserved draft at {abs path}
    rm '{abs path}'

No matches at all: report "0 unfiled upstream drafts" explicitly — a scan that ran and found
nothing is a different fact from a scan that never ran.

→ Collect each as: `[unfiled] {title} (run {run id}, {age}) — {abs path} — re-file or discard (see options above)` — or, for a live non-terminal run, `[unfiled] {title} (run {run id}, {age}) — {abs path} — run still live, leave unless abandoned`

```

- [ ] **Step 5: Add the `[unfiled]` Collection routing row**

In the "Collection routing" table, extend the existing row whose prefix list starts with
`` `[scoring]`, `[blocked]`, `[legacy]` ... `` (the row reading "Auto (no-op, always surfaced) at
every aggressiveness tier — no mutation exists to stage; each finding carries its own paste-ready
command") to also list `` `[unfiled]` `` in its prefix column — same routing, same semantics,
one more tag joining the list.

- [ ] **Step 6: Run to verify pass**

Run: `node --test tests/tidy-unfiled-backstop.test.js`
Expected: PASS — all three tests.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/tidy/scan-procedures.md
git commit -m "Add tidy backstop scan for preserved-but-unfiled upstream drafts (refs #905)"
```

### Task 2: `feedback/SKILL.md` Step 1 gather-source sentence + `skill-graph.md` edge

**Files:**
- Modify: `plugin/skills/feedback/SKILL.md` — one sentence appended to `### Step 1: Gather`
- Modify: `docs/skill-graph.md` — one new `/tidy` row under `## feedback`'s relationship table
- Test: extend `tests/tidy-unfiled-backstop.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing further (terminal task before verification).

- [ ] **Step 1: Failing prose pins**

Append to `tests/tidy-unfiled-backstop.test.js`:

```js
const FEEDBACK = path.join(__dirname, '..', 'plugin', 'skills', 'feedback', 'SKILL.md');
const GRAPH = path.join(__dirname, '..', 'docs', 'skill-graph.md');

test('feedback/SKILL.md Step 1 names a preserved-draft path as a valid gather source', () => {
  const text = fs.readFileSync(FEEDBACK, 'utf8');
  const step1 = text.slice(text.indexOf('### Step 1: Gather'), text.indexOf('### Step 2: Classify the kind'));
  assert.ok(
    step1.includes('preserved') && step1.includes('draft'),
    'Step 1 must state that a free-text preserved-draft path is read and used as the gathered content',
  );
});

test('skill-graph.md documents the tidy -> feedback unfiled-drafts edge', () => {
  const text = fs.readFileSync(GRAPH, 'utf8');
  const feedbackSection = text.slice(text.indexOf('## feedback'), text.indexOf('## flow'));
  assert.ok(
    /`\/tidy`.*unfiled/s.test(feedbackSection) || feedbackSection.includes('upstream-unfiled'),
    'skill-graph.md ## feedback section must document the /tidy backstop-scan edge',
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/tidy-unfiled-backstop.test.js`
Expected: the two new tests FAIL; the three from Task 1 still PASS.

- [ ] **Step 3: Add the Step 1 sentence**

In `feedback/SKILL.md`, at the end of `### Step 1: Gather` (after the existing "Definition" judgment paragraph, before `### Step 2: Classify the kind`), add:

```
When the free-text names a preserved unfiled draft by absolute path (the
`/claude-tweaks:feedback re-file the preserved draft at {abs path}` form `/claude-tweaks:tidy`'s
backstop scan hands out), read that file and use its body directly as the gathered summary,
affected component, and repro-steps-or-use-case content — the draft was already fully composed
once; Step 6's scrub reruns unconditionally as the standing safety net regardless of this shortcut.
```

- [ ] **Step 4: Add the skill-graph.md row**

In `docs/skill-graph.md`'s `## feedback` relationship table, insert a new row after the
`` `/docs-health` `` row and before the `` `_shared/learning-routing.md` `` row:

```
| `/tidy` | `/tidy`'s backstop scan (`scan-procedures.md`, Step 4.7) enumerates preserved-but-unfiled `staged/upstream-unfiled-*.md` drafts and hands each to the human as a paste-ready `/claude-tweaks:feedback re-file the preserved draft at {abs path}` command — report-only, `/tidy` never re-files or deletes. |
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/tidy-unfiled-backstop.test.js`
Expected: PASS — all five tests.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/feedback/SKILL.md docs/skill-graph.md tests/tidy-unfiled-backstop.test.js
git commit -m "Wire feedback's Step 1 gather source and the skill-graph edge for the unfiled-drafts backstop (refs #905)"
```

### Task 3: Full-suite verification

**Files:**
- Test: whole repo (no edits)

**Interfaces:**
- Consumes: Tasks 1-2 committed.
- Produces: green baseline for this multi-spec run's next step (consolidated review / wrap-up).

- [ ] **Step 1: Run the full suite**

Run: `npm test` (redirect to a log file and grep the `# pass` / `# fail` summary lines — prose pins live in suites whose filenames don't match the edited files)
Expected: 0 failures.

- [ ] **Step 2: No commit** — nothing changed; a failure here means a byte-pinned suite elsewhere pins the old text: fix that suite's expectation (never revert this spec's changes), then re-run.
