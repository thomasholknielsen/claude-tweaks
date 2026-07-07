# Code-Health Downstream Efficiency Implementation Plan (Phase 4 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the `effort` and `risk` signals Phases 2-3 already produce into four downstream levers: effort drives model-tier selection when `/build` implements a code-health-derived spec; `/flow --from-code-health` batches the highest-risk issues first; a new `--quick-wins` selector isolates the `risk:high AND effort:low` intersection; and `/specify` flags high-effort issues to consider decomposing. This is Phase 4 of the 5-phase design in `docs/superpowers/specs/2026-07-07-code-health-rename-risk-triage-design.md`, building on Phases 1-3 (all merged to `main`).

**Architecture:** This phase is documentation-only — it edits skill instructions (`SKILL.md`/`spec-template.md`/`from-code-health.md` files), not application code. There is no corresponding unit-test suite for skill-instruction content (confirmed: no test file references `specify`, `flow`, or `build` skill content anywhere in `tests/`), so each task's verification is `npm test` (confirming the unrelated code suite still passes — these are markdown-only edits, a regression here would mean an edit accidentally touched a code file) plus an internal-consistency grep, not a red/green TDD cycle.

**Tech Stack:** Markdown skill files. No code, no new dependencies.

## Global Constraints

- Run `npm test` after every task; it must be 100% green (the one known pre-existing flaky test, `tests/statusline.test.js`'s "render under 500ms," may intermittently fail under system load — re-run in isolation if it's the only failure). Since this phase touches no `.js` file, any test failure at all is a signal something went wrong (e.g., a stray edit landed in the wrong file).
- The frontmatter field is `code-health-effort:` (not `recon-effort:` or `effort:` bare) — mirrors the existing `recon-issue:`/`recon-fingerprint:` naming, which despite the Phase 1 rename were deliberately left as-is (a separate, already-settled cross-file contract, not touched by any phase of this design).
- `bin/lib/issues/ingest.js`'s generic `issuesToBriefs` function is NOT modified in this phase — extracting `effort` from a `code-health:effort-<tier>` label is code-health-specific, not a generic `/flow` concern, so it happens in `from-code-health.md`'s own glue code, consistent with the scope boundary Phase 3 Task 4 already established for `severity`/`risk` extraction.
- `SEVERITY_RANK` (from `bin/lib/issues/ingest.js`, already `{critical:0, high:1, medium:2, low:3, info:4}`) is reused for risk-ordered sorting — no new ranking table is introduced. Since code-health-filed issues carry `code-health:risk-<tier>` labels (Phase 3), and Phase 3 Task 4 already made `issuesToBriefs`'s `severity` field extract from either the old or new label shape, sorting briefs by `SEVERITY_RANK[brief.severity]` ascending already produces risk-first ordering for code-health issues with zero new code.

---

### Task 1: Extract `effort` onto pulled briefs; sort by risk before deriving specs

**Files:**
- Modify: `skills/flow/from-code-health.md`

**Interfaces:**
- Consumes: `bin/lib/issues/ingest.js`'s existing `SEVERITY_RANK` export (unchanged) and the `code-health:effort-<tier>` label Phase 3 Task 2 already attaches to filed issues.
- Produces: each brief gains an `effort` field (`'low' | 'medium' | 'high' | undefined` — `undefined` when the issue carries no `code-health:effort-<tier>` label, e.g. issues pulled via `--from-label`/`--from-milestone` that aren't code-health's own). The brief list is sorted by risk (most urgent first) before Step 2.5's claim step. Task 2 (frontmatter stamping) and Task 4 (quick-wins) both depend on the `effort` field this task adds.

- [ ] **Step 1: Add effort extraction after the existing `issuesToBriefs` call in Step 2**

Read `skills/flow/from-code-health.md`. Find Step 2 (`grep -n "2\. \*\*Parse to briefs" skills/flow/from-code-health.md`). Replace the whole of Step 2 (its code block AND the prose paragraph immediately after it):

```
old_string:
2. **Parse to briefs (pure).** Pass the parsed JSON array to `issuesToBriefs`:

   ```bash
   node -e "const i=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/ingest.js');
     const issues=require(process.argv[1]);
     console.log(JSON.stringify(i.issuesToBriefs({issuesJson:issues,
       label:process.argv[2]||undefined,
       numbers:process.argv[3]?process.argv[3].split(',').map(Number):undefined,
       minSeverity:process.argv[4]||undefined,
       requireLabels:process.argv[5]?process.argv[5].split(','):undefined})))" \
     /tmp/flow-issues.json "<label-or-empty>" "<numbers-or-empty>" "<min-severity-or-empty>" "<require-labels-csv-or-empty>"
   ```

   Call signature: `issuesToBriefs({ issuesJson, label?, numbers?, minSeverity?, requireLabels? })`. For
   `--from-code-health`, `label` is `code-health` (the `bin/code-health.js pull-issues` CLI remains equivalent
   absent `--require-eligible`, which it does not pass through).
   With `--require-eligible`, pass `agent:eligible` as the fifth argument — autonomous dispatch
   always does (see "Dispatch authorization" in `_shared/issue-claims.md`).
   Each brief is `{ number, title, body, fingerprint, severity, shape }` — `shape` is `form`
   when the body carries the three sections (at `##` or `###` level — GitHub issue forms
   render `###`), else `freeform`.
```
```
new_string:
2. **Parse to briefs (pure).** Pass the parsed JSON array to `issuesToBriefs`, redirecting its
   output to a file so the steps below can chain off it:

   ```bash
   node -e "const i=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/ingest.js');
     const issues=require(process.argv[1]);
     console.log(JSON.stringify(i.issuesToBriefs({issuesJson:issues,
       label:process.argv[2]||undefined,
       numbers:process.argv[3]?process.argv[3].split(',').map(Number):undefined,
       minSeverity:process.argv[4]||undefined,
       requireLabels:process.argv[5]?process.argv[5].split(','):undefined})))" \
     /tmp/flow-issues.json "<label-or-empty>" "<numbers-or-empty>" "<min-severity-or-empty>" "<require-labels-csv-or-empty>" \
     > /tmp/flow-briefs.json
   ```

   Call signature: `issuesToBriefs({ issuesJson, label?, numbers?, minSeverity?, requireLabels? })`. For
   `--from-code-health`, `label` is `code-health` (the `bin/code-health.js pull-issues` CLI remains equivalent
   absent `--require-eligible`, which it does not pass through).
   With `--require-eligible`, pass `agent:eligible` as the fifth argument — autonomous dispatch
   always does (see "Dispatch authorization" in `_shared/issue-claims.md`).
   Each brief is `{ number, title, body, fingerprint, severity, shape }` — `shape` is `form`
   when the body carries the three sections (at `##` or `###` level — GitHub issue forms
   render `###`), else `freeform`.

   **Effort extraction (code-health-specific, not part of `issuesToBriefs`).** For `--from-code-health`
   and `--from-label code-health` runs, also extract `effort` directly from each raw issue's labels
   (this is code-health-specific glue, not a generic `/flow` concern, so it stays here rather than
   in `bin/lib/issues/ingest.js`):

   ```bash
   node -e "
     const issues = require('/tmp/flow-issues.json');
     const briefs = require('/tmp/flow-briefs.json');
     const byNumber = new Map(issues.map(i => [i.number, i]));
     const EFFORT_RE = /^code-health:effort-(low|medium|high)\$/;
     for (const b of briefs) {
       const issue = byNumber.get(b.number);
       const names = (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name)).filter(Boolean);
       const m = names.map(n => EFFORT_RE.exec(n)).find(Boolean);
       b.effort = m ? m[1] : undefined;
     }
     console.log(JSON.stringify(briefs));
   " > /tmp/flow-briefs-with-effort.json
   mv /tmp/flow-briefs-with-effort.json /tmp/flow-briefs.json
   ```

   For selectors other than `--from-code-health`/`--from-label code-health` (i.e. issues that never
   carry code-health's own labels), every brief's `effort` is `undefined` — this is expected, not
   an error; Task 4's `--quick-wins` filter and Task 2's frontmatter stamping both treat `undefined`
   as "not applicable," the same convention `code-health-effort:` frontmatter already uses for
   non-code-health-derived specs.

   **Risk-ordered batching.** Before Step 2.5's claim step, sort `/tmp/flow-briefs.json` by risk —
   most urgent first — reusing `issuesToBriefs`'s own `SEVERITY_RANK` export (no new ranking table):

   ```bash
   node -e "
     const { SEVERITY_RANK } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/ingest.js');
     const briefs = require('/tmp/flow-briefs.json');
     briefs.sort((a, b) => (SEVERITY_RANK[a.severity] ?? SEVERITY_RANK.info) - (SEVERITY_RANK[b.severity] ?? SEVERITY_RANK.info));
     console.log(JSON.stringify(briefs));
   " > /tmp/flow-briefs-sorted.json
   mv /tmp/flow-briefs-sorted.json /tmp/flow-briefs.json
   ```

   Since Phase 3 widened `issuesToBriefs`'s severity extraction to also match `code-health:risk-<tier>`
   labels, a code-health-filed issue's `severity` field already holds its risk tier — this sort is
   risk-ordering in practice for code-health issues, and a harmless no-op ordering-by-`info` for
   issues from other selectors that carry no severity/risk label at all. If a run doesn't finish
   every derived spec, the highest-value work was attempted first.
```

- [ ] **Step 2: Verify no other file needs a corresponding change for this step**

```bash
grep -rn "SEVERITY_RANK" bin/lib/issues/ingest.js
```

Expected: confirms `SEVERITY_RANK` is still exported unchanged (this task only reads it, never modifies `ingest.js`).

- [ ] **Step 3: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only) — this task touches no `.js` file, so any other failure means an edit landed somewhere unintended.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Extract effort onto pulled code-health briefs; sort issue-sourced batches by risk before deriving specs"
```

---

### Task 2: Stamp `code-health-effort:` frontmatter (both derivation paths) + spec-sizing signal

**Files:**
- Modify: `skills/specify/spec-template.md`, `skills/specify/SKILL.md`, `skills/flow/from-code-health.md`

**Interfaces:**
- Consumes: Task 1's `brief.effort` field (for the `/flow --from-code-health` batch path) and a new direct-issue extraction in `/specify` itself (for the `/specify <issue-url>` single-issue path — this path never goes through `from-code-health.md`, so it needs its own extraction from the issue's labels, mirroring the existing `recon-issue:`/`recon-fingerprint:` dual-path pattern).
- Produces: `code-health-effort:` frontmatter on any spec derived from a code-health issue, via either path. Task 3 (model-tier dispatch) consumes this field.

- [ ] **Step 1: Add the frontmatter field to `spec-template.md`**

```
old_string:
recon-issue: {GitHub issue number, only when derived from one — omit otherwise}
recon-fingerprint: {fingerprint marker from the issue body, when present — omit otherwise}
---
```
```
new_string:
recon-issue: {GitHub issue number, only when derived from one — omit otherwise}
recon-fingerprint: {fingerprint marker from the issue body, when present — omit otherwise}
code-health-effort: {low | medium | high — only when derived from a code-health issue carrying a code-health:effort-<tier> label; omit otherwise}
---
```

Add documentation for the new field alongside the existing `recon-issue:`/`recon-fingerprint:` explanation:

```
old_string:
| Field | Meaning | Consumer |
|-------|---------|----------|
| `recon-issue:` | The GitHub issue number to close when this spec's work merges | `/wrap-up` cleanup item 8 (issue-claim release, `cleanup-procedures.md` Section E) checks for this field's presence; cleanup item 5 (`cleanup-procedures.md` Section C) stamps the `Fixes #{issue}` closing-keyword carrier commit when it's present |
| `recon-fingerprint:` | The finding's fingerprint at issue-filing time, for future reverse-reconciliation (comparing against a freshly recomputed fingerprint to tell whether the flagged code has since changed) | Not yet consumed by any skill — write-only today; `recon-issue:` alone is sufficient for closure |

Omit both fields for specs not derived from a GitHub issue — there is no "none" sentinel; absence is the signal (same convention as `design-intent:`'s missing-field handling, but unlike it, absence here means "not applicable" rather than a default value).
```
```
new_string:
| Field | Meaning | Consumer |
|-------|---------|----------|
| `recon-issue:` | The GitHub issue number to close when this spec's work merges | `/wrap-up` cleanup item 8 (issue-claim release, `cleanup-procedures.md` Section E) checks for this field's presence; cleanup item 5 (`cleanup-procedures.md` Section C) stamps the `Fixes #{issue}` closing-keyword carrier commit when it's present |
| `recon-fingerprint:` | The finding's fingerprint at issue-filing time, for future reverse-reconciliation (comparing against a freshly recomputed fingerprint to tell whether the flagged code has since changed) | Not yet consumed by any skill — write-only today; `recon-issue:` alone is sufficient for closure |
| `code-health-effort:` | The judged fix-cost tier from the originating code-health finding | `/claude-tweaks:build` Common Step 2 reads it to select the per-task implementer model tier (low→Fast, medium→Standard, high→Capable) when invoking `/superpowers:subagent-driven-development` |

Omit all three fields for specs not derived from a GitHub issue — there is no "none" sentinel; absence is the signal (same convention as `design-intent:`'s missing-field handling, but unlike it, absence here means "not applicable" rather than a default value). `code-health-effort:` is additionally omitted for specs derived from a non-code-health issue (e.g. a hand-filed bug report pulled via `--from-label`) even when `recon-issue:`/`recon-fingerprint:` are present, since only code-health's own findings carry an effort judgment.
```

- [ ] **Step 2: Update `specify/SKILL.md`'s "Resolve the input" case 1 to extract effort**

```
old_string:
1. **GitHub issue reference** — a URL matching `https://github.com/{owner}/{repo}/issues/{n}`, or a shorthand like `#123` / `issue 123` / `gh-123`. Checked *before* case 2's path/topic disambiguation, since an issue URL contains `/` and would otherwise misparse as a design-doc path. Fetch it directly: `gh issue view {n} --json number,title,body,url`. Treat the issue's title + body as the design doc content — code-health-filed issues are already `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so this needs near-zero translation; a human-filed issue without that shape still works, just with more editorializing in Step 2. Extract the fingerprint marker from the body if present (`<!-- code-health-fingerprint: ([^\s>]+) -->` — same regex as `bin/lib/issues/ingest.js`'s `FP_RE`). Carry `{issueNumber, fingerprint}` forward to Step 3, which stamps `recon-issue:` (and `recon-fingerprint:`, when a marker was found) frontmatter on the generated spec — this is what lets `/wrap-up`'s close-via-merge and issue-claim-release steps engage. (This is a distinct path from `/flow --from-code-health`, which pulls issues itself and passes `/specify` the already-extracted title + body text directly, then stamps this same frontmatter in `from-code-health.md` Step 3 — it never reaches this case.)
```
```
new_string:
1. **GitHub issue reference** — a URL matching `https://github.com/{owner}/{repo}/issues/{n}`, or a shorthand like `#123` / `issue 123` / `gh-123`. Checked *before* case 2's path/topic disambiguation, since an issue URL contains `/` and would otherwise misparse as a design-doc path. Fetch it directly: `gh issue view {n} --json number,title,body,url,labels`. Treat the issue's title + body as the design doc content — code-health-filed issues are already `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so this needs near-zero translation; a human-filed issue without that shape still works, just with more editorializing in Step 2. Extract the fingerprint marker from the body if present (`<!-- code-health-fingerprint: ([^\s>]+) -->` — same regex as `bin/lib/issues/ingest.js`'s `FP_RE`). Also extract effort from the issue's labels if a `code-health:effort-<tier>` label is present (`low|medium|high`; absent for non-code-health issues). Carry `{issueNumber, fingerprint, effort}` forward to Step 3, which stamps `recon-issue:` (and `recon-fingerprint:`/`code-health-effort:`, when present) frontmatter on the generated spec — this is what lets `/wrap-up`'s close-via-merge, issue-claim-release, and `/build`'s effort-based model-tier selection all engage. (This is a distinct path from `/flow --from-code-health`, which pulls issues itself and passes `/specify` the already-extracted title + body text directly, then stamps this same frontmatter in `from-code-health.md` Step 3 — it never reaches this case.)
```

- [ ] **Step 3: Update the Rules section's frontmatter-writing instruction**

```
old_string:
- **Write issue-tracking frontmatter when the input resolved from a GitHub issue reference** (Resolve-the-input case 1) — write `recon-issue: <number>` on the generated spec, plus `recon-fingerprint: <fp>` when a fingerprint marker was found in the issue body. This is what lets `/wrap-up`'s close-via-merge and issue-claim-release steps engage for specs built directly from a single issue, not just via `/flow --from-code-health`'s batch path.
```
```
new_string:
- **Write issue-tracking frontmatter when the input resolved from a GitHub issue reference** (Resolve-the-input case 1) — write `recon-issue: <number>` on the generated spec, plus `recon-fingerprint: <fp>` when a fingerprint marker was found in the issue body, plus `code-health-effort: <tier>` when the issue carried a `code-health:effort-<tier>` label. This is what lets `/wrap-up`'s close-via-merge and issue-claim-release steps, and `/build`'s effort-based model-tier selection, engage for specs built directly from a single issue, not just via `/flow --from-code-health`'s batch path.
- **Flag high-effort code-health issues for possible decomposition** — when `code-health-effort: high` would be stamped, add a note to the generated spec's Overview section (e.g. "Originating finding was judged high-effort — consider whether this should decompose into multiple specs rather than one oversized unit.") rather than silently producing a single spec that may be too large for `/superpowers:writing-plans` to size well. This is a surfaced consideration, not an automatic split — the human or a later `/specify` pass decides.
```

- [ ] **Step 4: Update `from-code-health.md` Step 3 to stamp the new field**

```
old_string:
3. **Derive specs via `/specify`.** For each brief, invoke `/claude-tweaks:specify` with the
   brief's title + body as the design input. `/specify` produces a numbered spec under `specs/`.
   Carry the issue `number` and `fingerprint` forward as spec frontmatter (`recon-issue: <number>`,
   `recon-fingerprint: <fp>`) so wrap-up can close the issue on merge.
```
```
new_string:
3. **Derive specs via `/specify`.** For each brief, invoke `/claude-tweaks:specify` with the
   brief's title + body as the design input. `/specify` produces a numbered spec under `specs/`.
   Carry the issue `number`, `fingerprint`, and (when present) `effort` forward as spec frontmatter
   (`recon-issue: <number>`, `recon-fingerprint: <fp>`, `code-health-effort: <tier>`) so wrap-up
   can close the issue on merge and `/build` can select the model tier for this spec's
   implementer dispatches. When `effort` is `high`, also carry forward the same
   possible-decomposition note `/specify`'s own Rules section describes for its direct-issue path.
```

- [ ] **Step 5: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Stamp code-health-effort frontmatter on derived specs (both direct-issue and batch paths); flag high-effort issues for possible decomposition"
```

---

### Task 3: Effort → model tier when `/build` dispatches implementation

**Files:**
- Modify: `skills/build/SKILL.md`

**Interfaces:**
- Consumes: Task 2's `code-health-effort:` spec frontmatter.
- Produces: when `/build` invokes `/superpowers:subagent-driven-development` (the default `subagent` execution strategy) for a spec carrying `code-health-effort:`, it now explicitly instructs that skill to default every per-task implementer dispatch to the corresponding model tier, overriding the skill's own per-task complexity heuristic for that spec's tasks. Specs without the frontmatter are unaffected — this is purely additive.

- [ ] **Step 1: Update Common Step 2's subagent-strategy instruction**

```
old_string:
**subagent** (default): Invoke `/superpowers:subagent-driven-development`. After the final code review completes, **stop the skill and return here** — do not let it invoke `/superpowers:finishing-a-development-branch`. `/build` handles post-execution steps (simplification, alignment, verification) before any branch finishing.
```
```
new_string:
**subagent** (default): Check the spec's frontmatter for `code-health-effort:`. If present, invoke `/superpowers:subagent-driven-development` with an explicit instruction to default every per-task implementer dispatch in this spec to the corresponding model tier — `low` → Fast, `medium` → Standard, `high` → Capable — overriding that skill's own per-task complexity heuristic for this spec's tasks specifically (a spec whose originating finding was already judged cheap or expensive to fix doesn't need re-deriving that signal from file-count heuristics). Specs with no `code-health-effort:` frontmatter invoke `/superpowers:subagent-driven-development` exactly as before, with no tier override. After the final code review completes, **stop the skill and return here** — do not let it invoke `/superpowers:finishing-a-development-branch`. `/build` handles post-execution steps (simplification, alignment, verification) before any branch finishing.
```

- [ ] **Step 2: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Read code-health-effort frontmatter to select the implementer model tier in /build's subagent strategy"
```

---

### Task 4: Quick-wins selector (`--quick-wins`)

**Files:**
- Modify: `skills/flow/SKILL.md`, `skills/flow/from-code-health.md`

**Interfaces:**
- Consumes: Task 1's `brief.effort` field and the existing `brief.severity` field (which holds the risk tier for code-health issues per Phase 3).
- Produces: a new `--quick-wins` flag, usable with `--from-code-health` (or any issue-selector flag, though it's a no-op filter for issues without code-health's risk/effort labels), that narrows the pulled batch to `risk:high AND effort:low` before Step 2.5's claim step.

- [ ] **Step 1: Document the flag in `flow/SKILL.md`'s Arguments table**

```
old_string:
| `--min-severity <sev>` | No | **Issue-sourced batches only.** Filter pulled issues by the `code-health:<sev>` label (`critical`/`high`/`medium`/`low`). Issues without a `code-health:<sev>` label rank as `info` and are excluded by any higher floor. Default: no floor. |
```
```
new_string:
| `--min-severity <sev>` | No | **Issue-sourced batches only.** Filter pulled issues by the `code-health:<sev>` label (`critical`/`high`/`medium`/`low`). Issues without a `code-health:<sev>` label rank as `info` and are excluded by any higher floor. Default: no floor. |
| `--quick-wins` | No | **Issue-sourced batches only.** Narrow the pulled batch to `risk:high AND effort:low` — a deliberate "just the easy high-value stuff" run. Issues without both a `code-health:risk-<tier>` and a `code-health:effort-<tier>` label never match (this is a no-op filter for non-code-health issue sources). Combines with `--min-severity`/`--require-eligible` as an additional AND condition, not a replacement. See `from-code-health.md`. |
```

- [ ] **Step 2: Update `from-code-health.md`'s Syntax section**

```
old_string:
```
/claude-tweaks:flow --from-code-health  [--min-severity high] [--require-eligible] [worktree | current-branch] [keep-going] [auto | confirm | hybrid]
/claude-tweaks:flow --from-label <label> [--min-severity high] [--require-eligible] [...same]
/claude-tweaks:flow --from-issues <n,...>       [--min-severity high] [--require-eligible] [...same]
/claude-tweaks:flow --from-milestone <m>          [--min-severity high] [--require-eligible] [...same]
```

`--min-severity` floors on the `code-health:<sev>` label (unlabeled issues rank `info`). All other
`/flow` arguments behave as normal — the selectors only change how the spec list is assembled.
Note: `--min-severity` with a non-code-health label set is empty by construction unless those issues
also carry `code-health:<sev>` labels.
```
```
new_string:
```
/claude-tweaks:flow --from-code-health  [--min-severity high] [--quick-wins] [--require-eligible] [worktree | current-branch] [keep-going] [auto | confirm | hybrid]
/claude-tweaks:flow --from-label <label> [--min-severity high] [--quick-wins] [--require-eligible] [...same]
/claude-tweaks:flow --from-issues <n,...>       [--min-severity high] [--quick-wins] [--require-eligible] [...same]
/claude-tweaks:flow --from-milestone <m>          [--min-severity high] [--quick-wins] [--require-eligible] [...same]
```

`--min-severity` floors on the `code-health:<sev>` label (unlabeled issues rank `info`). `--quick-wins`
narrows to `risk:high AND effort:low` (see Step 2.4 below). All other `/flow` arguments behave as
normal — the selectors only change how the spec list is assembled. Note: `--min-severity` and
`--quick-wins` are both empty-by-construction filters for a non-code-health label set unless those
issues also carry the relevant `code-health:<sev>`/`code-health:risk-<tier>`/`code-health:effort-<tier>`
labels.
```

- [ ] **Step 3: Add the filter step after Task 1's risk-ordered sort, before Step 2.5's claim step**

```
old_string:
2.5. **Claim each issue (per `_shared/issue-claims.md`).** Before any `/specify` invocation,
```
```
new_string:
2.4. **Filter to quick wins (only when `--quick-wins` is passed).** After sorting (above), narrow
   the brief list to the intersection of `risk:high` and `effort:low`:

   ```bash
   node -e "
     const briefs = require('/tmp/flow-briefs.json');
     const quickWins = briefs.filter(b => b.severity === 'high' && b.effort === 'low');
     console.log(JSON.stringify(quickWins));
   " > /tmp/flow-briefs-quickwins.json
   mv /tmp/flow-briefs-quickwins.json /tmp/flow-briefs.json
   ```

   (Recall `severity` holds the risk tier for code-health issues per Phase 3's label-extraction
   widening.) If this empties the list, stop and report: "No open code-health issues currently
   match risk:high AND effort:low — nothing to build for --quick-wins." Skip this step entirely
   when `--quick-wins` was not passed. Numbered `2.4` so it reads, in document order, between
   Step 2's brief-parsing/sorting content and the existing `2.5` claim step.

2.5. **Claim each issue (per `_shared/issue-claims.md`).** Before any `/specify` invocation,
```

- [ ] **Step 4: Run the full suite and confirm it's green**

```bash
npm test
```

Expected: 100% pass (or the one known pre-existing flaky perf test only).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add --quick-wins issue-sourced batch selector (risk:high AND effort:low)"
```

---

## What this plan does not cover

Per the design doc's phasing, the closing-keyword safety-net hook remains a separate, final Phase 5 plan.
