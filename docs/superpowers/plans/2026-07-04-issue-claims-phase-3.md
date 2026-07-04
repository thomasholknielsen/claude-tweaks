# Issue Claims Phase 3 (Generic Ingestion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/flow` can batch-build ANY GitHub issues — `--from-issues <n,...>` and `--from-label <label>` join `--from-recon` (now an alias) — with human-filed issues made pipeline-ready by an issue form template `/init` offers to install, and freeform issues translated to briefs with the translation surfaced for review.

**Architecture:** New pure module `bin/lib/issues/ingest.js` owns `issuesToBriefs()` (label/numbers/severity filters + form-shape detection); recon's `pullReconIssues` becomes a thin wrapper over it (its test suite is the regression gate). `skills/flow/from-recon.md` generalizes into the issue-sourced batch procedure for all three selectors. The Phase 2 carry-over lands too: current-branch mode gets its closing-keyword carrier (Fixes lines in the final wrap-up commit).

**Tech Stack:** Node 18+ (CommonJS), `node --test`, GitHub CLI, GitHub issue forms YAML, markdown skill files.

**Spec:** `docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md` — "Phase 3 — Generic ingestion" + its "Carried from Phase 2 review" note.

## Global Constraints

- `bin/lib/` modules never call the network; no `Date.now()` in module logic (ingest has no time dependence at all).
- Recon compatibility is a hard gate: `bin/lib/recon/tests/pull-issues-v2.test.js` must pass UNCHANGED — do not edit that file.
- Form-shape detection accepts BOTH heading levels: recon bodies use `## Current State` etc.; GitHub issue forms render textarea labels as `### Current State` etc. A body is form-shaped iff all three of Current State / Deliverables / Acceptance Criteria appear as `##` or `###` headings.
- Severity comes from `recon:<sev>` labels only; unlabeled issues default to `info` (matching recon's existing behavior, so `--min-severity` naturally excludes them unless the floor is `info`).
- Claiming (Phase 1, from-recon Step 2.5) applies to ALL ingested issues identically — no selector bypasses it.
- The agent never runs `gh issue close`; closing keywords ride merge artifacts (Phase 2). Current-branch carrier: `Fixes #{issue}` lines in the final wrap-up commit message — GitHub closes when that commit reaches the default branch.
- Placeholder vocabulary: `${ISSUE}`/`#{issue}` (issue numbers), `{spec}` (spec numbers), `<label>` (label argument).
- No emojis in skill files. `npm test` green at every commit. Known load flake: `tests/statusline.test.js` "render under 500ms" — if it alone fails, re-run that file in isolation and report both results.
- Version bump: `.claude-plugin/plugin.json` `5.4.0` → `5.5.0` and CLAUDE.md intro `(v5.4.0)` → `(v5.5.0)` (Task 6 only).
- Commit style: `{Verb} {what} — {detail}`.

---

### Task 1: Module — `bin/lib/issues/ingest.js` + recon wrapper rewire

**Files:**
- Create: `bin/lib/issues/ingest.js`
- Create: `bin/lib/issues/tests/ingest.test.js`
- Modify: `bin/lib/recon/pull-issues.js` (becomes a thin wrapper)
- Test (must stay green, unmodified): `bin/lib/recon/tests/pull-issues-v2.test.js`

**Interfaces:**
- Consumes: nothing new (standalone pure module).
- Produces (Tasks 2-3 snippets rely on these):
  - `issuesToBriefs({issuesJson, label?, numbers?, minSeverity?}) → brief[]` where brief = `{number, title, body, fingerprint, severity, shape: 'form'|'freeform'}`. `label` filters to issues carrying that label; `numbers` (array of ints) filters to those issue numbers; both absent → all issues pass the filter stage. `minSeverity` floors on the `recon:<sev>` label scale.
  - `isFormShaped(body) → boolean` — all three section headings present at `##` or `###` level.
  - `SEVERITY_RANK` — moved here; re-exported from `bin/lib/recon/pull-issues.js` for compatibility.
  - `pullReconIssues({label = 'recon', minSeverity, issuesJson})` — unchanged signature/behavior, now `issuesToBriefs` + recon's default label. Returned briefs gain the extra `shape` field (additive; existing consumers read named fields only).

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/issues/tests/ingest.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { issuesToBriefs, isFormShaped, SEVERITY_RANK } = require('../ingest');

function issue({ number = 1, title = 'A task', labels = [], body = '' } = {}) {
  return { number, title, state: 'open', labels: labels.map((n) => ({ name: n })), body };
}

const FORM_BODY_H2 = '## Current State\nX is broken.\n\n## Deliverables\nFix X.\n\n## Acceptance Criteria\nX works.';
const FORM_BODY_H3 = '### Current State\nX is broken.\n\n### Deliverables\nFix X.\n\n### Acceptance Criteria\nX works.';

test('isFormShaped accepts both heading levels and rejects partial bodies', () => {
  assert.strictEqual(isFormShaped(FORM_BODY_H2), true);
  assert.strictEqual(isFormShaped(FORM_BODY_H3), true);
  assert.strictEqual(isFormShaped('## Current State\nonly one section'), false);
  assert.strictEqual(isFormShaped('please fix the login button'), false);
  assert.strictEqual(isFormShaped(''), false);
});

test('issuesToBriefs classifies shape per brief', () => {
  const briefs = issuesToBriefs({ issuesJson: [
    issue({ number: 1, body: FORM_BODY_H2 }),
    issue({ number: 2, body: 'freeform prose request' }),
  ] });
  assert.strictEqual(briefs.length, 2);
  assert.strictEqual(briefs[0].shape, 'form');
  assert.strictEqual(briefs[1].shape, 'freeform');
});

test('numbers filter selects exactly the requested issues', () => {
  const briefs = issuesToBriefs({ numbers: [3, 5], issuesJson: [
    issue({ number: 3 }), issue({ number: 4 }), issue({ number: 5 }),
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [3, 5]);
});

test('label filter includes only issues carrying the label', () => {
  const briefs = issuesToBriefs({ label: 'bug', issuesJson: [
    issue({ number: 1, labels: ['bug'] }), issue({ number: 2, labels: ['recon'] }),
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
});

test('no label and no numbers → all issues pass the filter stage', () => {
  const briefs = issuesToBriefs({ issuesJson: [issue({ number: 1 }), issue({ number: 2 })] });
  assert.strictEqual(briefs.length, 2);
});

test('minSeverity floors on recon:<sev> labels; unlabeled defaults to info', () => {
  const briefs = issuesToBriefs({ minSeverity: 'high', issuesJson: [
    issue({ number: 1, labels: ['recon:critical'] }),
    issue({ number: 2, labels: ['recon:low'] }),
    issue({ number: 3 }), // unlabeled → info → excluded by high floor
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
});

test('fingerprint extracted when the recon marker is present, else null', () => {
  const withFp = issue({ number: 1, body: FORM_BODY_H2 + '\n<!-- recon-fingerprint: recon-abcd1234 -->' });
  const briefs = issuesToBriefs({ issuesJson: [withFp, issue({ number: 2 })] });
  assert.strictEqual(briefs[0].fingerprint, 'recon-abcd1234');
  assert.strictEqual(briefs[1].fingerprint, null);
});

test('SEVERITY_RANK is exported and recon pull-issues re-exports it', () => {
  assert.strictEqual(SEVERITY_RANK.critical, 0);
  const recon = require('../../recon/pull-issues');
  assert.strictEqual(recon.SEVERITY_RANK, SEVERITY_RANK);
});

test('pullReconIssues still defaults to the recon label (wrapper behavior)', () => {
  const { pullReconIssues } = require('../../recon/pull-issues');
  const briefs = pullReconIssues({ issuesJson: [
    issue({ number: 1, labels: ['recon', 'recon:high'], body: FORM_BODY_H2 }),
    issue({ number: 2, labels: ['bug'], body: FORM_BODY_H2 }),
  ] });
  assert.deepStrictEqual(briefs.map((b) => b.number), [1]);
  assert.strictEqual(briefs[0].severity, 'high');
  assert.strictEqual(briefs[0].shape, 'form');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/issues/tests/ingest.test.js`
Expected: FAIL with `Cannot find module '../ingest'`.

- [ ] **Step 3: Implement `ingest.js`**

Create `bin/lib/issues/ingest.js`:

```js
// bin/lib/issues/ingest.js
// Pure: turn `gh issue list/view --json number,title,body,labels` output into
// pipeline briefs for any selector (--from-issues, --from-label, --from-recon).
// The SKILL.md runs gh and passes the parsed array — no network here.
// Contract: skills/_shared/issue-claims.md; consumed by skills/flow/from-recon.md.
'use strict';

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const FP_RE = /<!--\s*recon-fingerprint:\s*([^\s>]+)\s*-->/;
const SEV_LABEL_RE = /^recon:(critical|high|medium|low|info)$/;
// GitHub issue forms render textarea labels as ### headings; recon writes ##.
const SECTION_RES = [
  /^###?\s+Current State\s*$/m,
  /^###?\s+Deliverables\s*$/m,
  /^###?\s+Acceptance Criteria\s*$/m,
];

function labelNames(issue) {
  return (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
}

function severityOf(names) {
  for (const n of names) {
    const m = SEV_LABEL_RE.exec(n);
    if (m) return m[1];
  }
  return 'info';
}

function isFormShaped(body) {
  if (typeof body !== 'string' || !body) return false;
  return SECTION_RES.every((re) => re.test(body));
}

// opts: { issuesJson = [], label?, numbers?, minSeverity? }. Returns brief[]:
// [{ number, title, body, fingerprint, severity, shape }].
function issuesToBriefs({ issuesJson = [], label, numbers, minSeverity } = {}) {
  const floor = minSeverity != null ? SEVERITY_RANK[minSeverity] : null;
  const wanted = numbers != null ? new Set(numbers) : null;
  const briefs = [];
  for (const issue of issuesJson) {
    if (wanted && !wanted.has(issue.number)) continue;
    const names = labelNames(issue);
    if (label && !names.includes(label)) continue;

    const severity = severityOf(names);
    if (floor != null && (SEVERITY_RANK[severity] ?? SEVERITY_RANK.info) > floor) continue;

    const body = issue.body || '';
    const fpMatch = FP_RE.exec(body);
    briefs.push({
      number: issue.number,
      title: issue.title,
      body,
      fingerprint: fpMatch ? fpMatch[1] : null,
      severity,
      shape: isFormShaped(body) ? 'form' : 'freeform',
    });
  }
  return briefs;
}

module.exports = { issuesToBriefs, isFormShaped, SEVERITY_RANK };
```

- [ ] **Step 4: Rewire `bin/lib/recon/pull-issues.js` as a thin wrapper**

Replace the entire file content with:

```js
// bin/lib/recon/pull-issues.js
// Thin wrapper over bin/lib/issues/ingest.js — recon's briefs are the generic
// ingestion with the `recon` label default. Kept for the recon.js CLI and
// existing consumers; SEVERITY_RANK re-exported for compatibility.
'use strict';

const { issuesToBriefs, SEVERITY_RANK } = require('../issues/ingest');

// opts: { label = 'recon', minSeverity?, issuesJson }. Returns brief[]:
// [{ number, title, body, fingerprint, severity, shape }].
function pullReconIssues({ label = 'recon', minSeverity, issuesJson = [] } = {}) {
  return issuesToBriefs({ issuesJson, label, minSeverity });
}

module.exports = { pullReconIssues, SEVERITY_RANK };
```

- [ ] **Step 5: Run the regression gates**

Run: `node --test bin/lib/issues/tests/ingest.test.js`
Expected: PASS (9 tests).
Run: `node --test bin/lib/recon/tests/pull-issues-v2.test.js`
Expected: PASS (6 tests, file unmodified — `git status` must show no change to it).
Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/ingest.js bin/lib/issues/tests/ingest.test.js bin/lib/recon/pull-issues.js
git commit -m "Add generic issue ingestion — issuesToBriefs with shape detection, recon as thin wrapper"
```

---

### Task 2: `/flow` arguments — the two new selectors

**Files:**
- Modify: `skills/flow/SKILL.md` (Arguments table + Input resolution list)

**Interfaces:**
- Consumes: Task 1's selector semantics.
- Produces: the argument names Task 3's procedure documents.

- [ ] **Step 1: Update the Arguments table**

In `skills/flow/SKILL.md`'s Arguments table:

1. Replace the `--from-recon` row's Description with:

```markdown
**Alternative spec source.** Alias for `--from-label recon` — pull open `recon`-labelled GitHub issues, turn each into a `/claude-tweaks:specify` brief, and run the derived specs through the multi-spec batch. Pair with `--min-severity <sev>` to filter. Needs the `gh` CLI (hard gate if absent). See `from-recon.md`.
```

2. Insert two new rows after the `--from-recon` row:

```markdown
| `--from-label <label>` | No | **Alternative spec source.** Pull ALL open issues carrying `<label>` and run them as an issue-sourced batch (claim → brief → `/specify` → multi-spec). Form-shaped bodies (Current State / Deliverables / Acceptance Criteria) convert with zero translation; freeform bodies get an LLM translation surfaced at the Review Console. Needs `gh`. See `from-recon.md`. |
| `--from-issues <n,...>` | No | **Alternative spec source.** Pull specific open issues by number (comma-separated) regardless of labels, and run them as an issue-sourced batch. Same claim/translation behavior as `--from-label`. Needs `gh`. See `from-recon.md`. |
```

3. Update the `--min-severity <sev>` row's Description to:

```markdown
**Issue-sourced batches only.** Filter pulled issues by the `recon:<sev>` label (`critical`/`high`/`medium`/`low`). Issues without a `recon:<sev>` label rank as `info` and are excluded by any higher floor. Default: no floor. |
```

- [ ] **Step 2: Update Input resolution item 5**

Replace item 5 of "Input resolution" with:

```markdown
5. **`--from-recon` / `--from-label <label>` / `--from-issues <n,...>`** → **Issue-batch mode** — ignore any spec numbers; assemble the spec list by pulling the selected GitHub issues → claim each → `/specify` briefs → derived specs, then run the standard multi-spec batch. `--from-recon` is an alias for `--from-label recon`. See `from-recon.md` for the full procedure.
```

- [ ] **Step 3: Verify and commit**

Run: `grep -c "from-label\|from-issues" skills/flow/SKILL.md` — Expected ≥ 4.

```bash
git add skills/flow/SKILL.md
git commit -m "Add --from-label and --from-issues selectors — from-recon becomes an alias"
```

---

### Task 3: Generalize the issue-sourced batch procedure

**Files:**
- Modify: `skills/flow/from-recon.md`

**Interfaces:**
- Consumes: Task 1's `issuesToBriefs` (exact signature), Task 2's argument names.
- Produces: the Step 2.6 translation staging Task 5's design-doc status note mentions.

- [ ] **Step 1: Retitle and generalize the intro**

Replace the file's H1 and first paragraph (through "…derived from issues at the start of the run.") with:

```markdown
# Flow — Issue-sourced batches (`--from-recon` / `--from-label` / `--from-issues`)

`/claude-tweaks:flow` can assemble its spec list from GitHub issues instead of spec numbers:
`--from-recon` (alias for `--from-label recon`) pulls the issues `/claude-tweaks:recon` filed;
`--from-label <label>` pulls any labelled set; `--from-issues <n,...>` pulls specific issue
numbers. Each pulled issue is claimed (Step 2.5), turned into a `/claude-tweaks:specify`
brief, and run through the existing multi-spec batch pipeline + consolidated Review Console.
These are the only `/flow` entry points that do not take spec numbers up front — the specs
are *derived* from issues at the start of the run.
```

Replace the Syntax block with:

```markdown
```
/claude-tweaks:flow --from-recon        [--min-severity high] [worktree | current-branch] [keep-going] [auto | confirm | hybrid]
/claude-tweaks:flow --from-label <label> [--min-severity high] [...same]
/claude-tweaks:flow --from-issues <n,...>                      [...same]
```

`--min-severity` floors on the `recon:<sev>` label (unlabeled issues rank `info`). All other
`/flow` arguments behave as normal — the selectors only change how the spec list is assembled.
```

- [ ] **Step 2: Generalize Step 1 (pull) and Step 2 (parse)**

Replace Step 1's command block and intro sentence with:

```markdown
1. **Pull issues (through-tool).** Run the GitHub CLI for the active selector:

   ```bash
   # --from-recon (alias) and --from-label <label>:
   gh issue list --label "<label>" --state open \
     --json number,title,body,labels --limit 100

   # --from-issues <n,...> — one gh call per number; skip non-open issues with a log entry:
   gh issue view "${ISSUE}" --json number,title,body,labels,state
   ```
```

(Keep the existing `gh`-unavailable hard-gate paragraph, updating its message's `/flow --from-recon` mention to "issue-sourced `/flow` runs".)

Replace Step 2's title, command, and call-signature sentences with:

```markdown
2. **Parse to briefs (pure).** Pass the parsed JSON array to `issuesToBriefs`:

   ```bash
   node -e "const i=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/ingest.js');
     const issues=require(process.argv[1]);
     console.log(JSON.stringify(i.issuesToBriefs({issuesJson:issues,
       label:process.argv[2]||undefined,
       numbers:process.argv[3]?process.argv[3].split(',').map(Number):undefined,
       minSeverity:process.argv[4]||undefined})))" \
     /tmp/flow-issues.json "<label-or-empty>" "<numbers-or-empty>" "<min-severity-or-empty>"
   ```

   Call signature: `issuesToBriefs({ issuesJson, label?, numbers?, minSeverity? })`. For
   `--from-recon`, `label` is `recon` (the `bin/recon.js pull-issues` CLI remains equivalent).
   Each brief is `{ number, title, body, fingerprint, severity, shape }` — `shape` is `form`
   when the body carries the three sections (at `##` or `###` level — GitHub issue forms
   render `###`), else `freeform`.
```

Keep the existing "v2 label set" sub-block, prefixed with: "**Labels (recon-filed issues).**" — it applies to `--from-recon`; other selectors may pull issues with no recon labels at all.

- [ ] **Step 3: Insert Step 2.6 (freeform translation) after Step 2.5**

```markdown
2.6. **Translate freeform briefs.** Briefs with `shape: freeform` (no Current State /
   Deliverables / Acceptance Criteria sections) are translated before spec derivation: write
   a three-section brief body from the issue's title + prose, citing the issue number. The
   original body is preserved in the issue itself; the translated body feeds `/specify`.

   Translation is a judgment call the user must be able to inspect: once the pipeline run
   directory exists (after the Config Manifesto), write each translation to
   `{run-dir}/staged/translation-{issue}.md` (original body, translated body, one-line
   rationale) and log `STAGED — translated freeform issue #{issue} to a three-section brief`
   to `decisions.md`. The consolidated Review Console surfaces these staged translations so
   the user sees what the model inferred each issue meant. Form-shaped briefs skip this step
   entirely.
```

- [ ] **Step 4: Current-branch closing carrier (Phase 2 carry-over)**

In Step 5, after the sentence ending "(see `wrap-up/cleanup-procedures.md` Section C).", add:

```markdown
   In `current-branch` mode there is no merge commit or PR — the carrier is the **final
   wrap-up commit message**: include one `Fixes #{issue}` line per resolved issue in the
   wrap-up commit; GitHub closes the issues when that commit reaches the default branch
   (immediately on push if the current branch IS the default branch, otherwise at the
   eventual merge).
```

- [ ] **Step 5: Retitle anti-pattern rows that say "recon" but now apply to all selectors**

In the Anti-Patterns table: change `| Filing or closing \`recon\` issues from inside \`/flow\` |` to `| Filing or closing issues from inside \`/flow\` |` (rationale cell unchanged), and change `| Pulling issues without \`--state open\` |` rationale's "Closed/`wontfix` issues" sentence — no change needed (already generic). Leave the other rows as-is.

- [ ] **Step 6: Verify and commit**

Run: `grep -c "from-label\|from-issues\|shape" skills/flow/from-recon.md` — Expected ≥ 6.
Run: `grep -n "issuesToBriefs" skills/flow/from-recon.md` — Expected ≥ 2 hits.
Run: `npm test` — Expected: PASS.

```bash
git add skills/flow/from-recon.md
git commit -m "Generalize issue-sourced batches — three selectors, freeform translation, current-branch carrier"
```

---

### Task 4: Issue form template — `/init` install offer

**Files:**
- Modify: `skills/init/bootstrap-steps.md` (new Step 0.5, following the Step 0.4 gitignore-offer pattern)

**Interfaces:**
- Consumes: the three section names Task 1's `isFormShaped` detects.
- Produces: the template `/init` installs; Task 6's docs mention it.

- [ ] **Step 1: Add Step 0.5 after the Step 0.4 section**

Insert after the end of the "Step 0.4 — .gitignore suggestions" section (before whatever section follows it):

````markdown
## Step 0.5 — GitHub issue form template (agent-task)

Offer only when the project has a GitHub remote (`git remote get-url origin` matches
`github.com`). Check whether `.github/ISSUE_TEMPLATE/agent-task.yml` exists; if absent,
offer to install it. The form makes human-filed issues pipeline-ready at filing time: its
three sections match what `/claude-tweaks:flow`'s issue-sourced batches consume with zero
translation (`bin/lib/issues/ingest.js` `isFormShaped` — GitHub renders the labels as `###`
headings, which the detector accepts).

```yaml
name: Agent task
description: File a task an agent pipeline can build directly (claude-tweaks issue-sourced batch)
title: "[task] "
body:
  - type: textarea
    id: current-state
    attributes:
      label: Current State
      description: What exists today, and what is wrong or missing
    validations:
      required: true
  - type: textarea
    id: deliverables
    attributes:
      label: Deliverables
      description: What should exist when this is done
    validations:
      required: true
  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance Criteria
      description: How to verify it is done
    validations:
      required: true
```

Write the YAML exactly as above to `.github/ISSUE_TEMPLATE/agent-task.yml`. Declining is
fine — freeform issues still work via the translation step (`from-recon.md` Step 2.6); the
form just removes the translation judgment.
````

- [ ] **Step 2: Check `skills/init/SKILL.md` references Step 0.4 by name anywhere**

Run: `grep -n "0\.4\|bootstrap-steps" skills/init/SKILL.md | head -5`. If SKILL.md enumerates bootstrap steps by number, add Step 0.5 to that enumeration with the one-line description "GitHub issue form template offer (agent-task.yml)". If it only references `bootstrap-steps.md` generically, no SKILL.md edit is needed.

- [ ] **Step 3: Verify and commit**

Run: `grep -c "agent-task" skills/init/bootstrap-steps.md` — Expected ≥ 2.

```bash
git add skills/init/bootstrap-steps.md
# add skills/init/SKILL.md too if Step 2 edited it
git commit -m "Offer GitHub issue form template at init — human-filed issues become pipeline-ready"
```

---

### Task 5: Cleanup Section C carrier note + design-doc status

**Files:**
- Modify: `skills/wrap-up/cleanup-procedures.md` (Section C)
- Modify: `docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md`

**Interfaces:**
- Consumes: Task 3's current-branch carrier definition (must match verbatim in semantics).
- Produces: nothing downstream.

- [ ] **Step 1: Extend Section C's Fixes-lines paragraph**

In `skills/wrap-up/cleanup-procedures.md` Section C, the Phase 2 paragraph ends "…the agent never runs `gh issue close`." Append to that paragraph:

```markdown
In `current-branch` mode (no worktree, no branch finish) the carrier is the final wrap-up
commit message — include the same `Fixes #{issue}` lines there; GitHub closes the issues
when that commit reaches the default branch.
```

- [ ] **Step 2: Design-doc status notes**

In `docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md`:
1. Under `## Phase 3 — Generic ingestion`, add the line: `**Status: implemented in v5.5.0** (selectors, ingest module, issue form, freeform translation, current-branch carrier).`
2. In the "Carried from Phase 2 review" paragraph at the end of the Phase 3 section, append: `**Resolved in v5.5.0:** the carrier is defined — `Fixes #{issue}` lines in the final wrap-up commit message.`

- [ ] **Step 3: Verify and commit**

Run: `grep -c "current-branch" skills/wrap-up/cleanup-procedures.md` — Expected ≥ 1.

```bash
git add skills/wrap-up/cleanup-procedures.md docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md
git commit -m "Define the current-branch closing carrier — Fixes lines in the wrap-up commit"
```

---

### Task 6: Docs ripple + version 5.5.0

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `.claude-plugin/plugin.json`
- Modify: `skills/help/reference-card.md` (only if it documents `--from-recon`)
- Modify: `skills/recon/SKILL.md` (relationship row)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing — closes the phase.

- [ ] **Step 1: CLAUDE.md**

1. Intro `(v5.4.0)` → `(v5.5.0)`.
2. Skills-with-sub-files table, `flow` row: change the from-recon.md clause's opening to reference all selectors — replace `` `--from-recon` pull-issues → /specify briefs → multi-spec batch procedure `` with `` issue-sourced batches (`--from-recon`/`--from-label`/`--from-issues`) → claim → /specify briefs → multi-spec batch procedure, freeform-issue translation ``. Keep the rest of the cell (Step 2.5 claims, close-via-merge clauses) intact.
3. Skills-with-sub-files table, `init` row: append `; Step 0.5 GitHub issue form offer (agent-task.yml)` to the bootstrap-steps clause.
4. Structure block `bin/lib/` parenthetical: `(color, deps, coordination, issue claims)` → `(color, deps, coordination, issue claims + ingestion)`.

- [ ] **Step 2: README.md**

Extend the recon paragraph (after the Phase 2 close-via-merge sentence) with:

```markdown
Any issues — not just recon's — can feed the pipeline: `/flow --from-label <label>` or `--from-issues <n,...>` batch-build labelled or hand-picked issues, and `/init` offers a GitHub issue form so human-filed issues arrive pipeline-ready.
```

- [ ] **Step 3: `/help` reference card**

Run: `grep -n "from-recon" skills/help/reference-card.md`. If present, extend that entry to mention `--from-label <label>` and `--from-issues <n,...>` with the same one-line description shape the card uses. If absent, no edit.

- [ ] **Step 4: recon relationship row**

In `skills/recon/SKILL.md`'s Relationship table, the `/claude-tweaks:flow` row: replace "pulls the `recon`-labelled issues this skill files and runs them as a multi-spec batch" with "pulls the `recon`-labelled issues this skill files (via `--from-recon`, now one of three issue-sourced selectors) and runs them as a multi-spec batch". Keep the claiming sentence intact.

- [ ] **Step 5: Version bump + full verification**

`.claude-plugin/plugin.json`: `"version": "5.4.0"` → `"version": "5.5.0"`. Validate: `node -e "require('./.claude-plugin/plugin.json')"`.
Run: `npm test` — Expected: PASS.
Run: `grep -rn "pullReconIssues" bin/ skills/ | grep -v "issues/ingest\|pull-issues\|test"` — Expected: only documentation mentions that remain accurate (from-recon.md now says issuesToBriefs; the recon.js CLI keeps pullReconIssues).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md .claude-plugin/plugin.json skills/help/reference-card.md skills/recon/SKILL.md
git commit -m "Document generic issue ingestion across consumers — bump to 5.5.0"
```

---

## Post-plan notes

- **Marketplace release**: mirror `5.5.0` after landing — user-driven.
- **Phase 4 (dispatch)** remains: `agent:eligible` policy gate, `agent:go` routine template, `--from-milestone` selector.
- Deliberately NOT done: renaming `from-recon.md` (every cross-reference keeps working; the file now documents all three selectors under its historical name — Phase 4 may revisit if a fourth selector lands); milestone selector (Phase 4); PR-awareness coordination with the parallel design doc (`2026-07-05-github-pr-awareness-design.md`) — flagged for the user before Phase 4.
