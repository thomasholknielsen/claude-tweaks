# Docs Curation Elevation (Step 7.7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate `/claude-tweaks:wrap-up`'s documentation curation from a batched Step 6.1 sub-scan (touched-docs only) to a standalone Step 7.7, adding a domain-overlap scan that reads relevant-but-untouched docs, a `--doc-budget` cap, its own Review Console section, and mandatory null-result logging — mirroring the standalone treatment `/claude-tweaks:wrap-up` Step 7 (skill curation) already gets.

**Architecture:** `skills/wrap-up/SKILL.md` gets a new `## Step 7.7: Documentation Curation` heading that delegates to a rewritten `docs-health-integration.md` (adds a new D0 domain-overlap scan section ahead of the existing D1/D2 checks, retargets their output from Step 6's generic batch table to Step 7.7's own). Step 6 shrinks from three sub-items to two (CLAUDE.md/Rules, Decision Records), renumbered 6.1/6.2. `review-console.md` gains a "Documentation updates" section between "Skill updates" and "Configuration updates". `CLAUDE.md`'s Structure table reflects the new step reference.

**Tech Stack:** Markdown skill files only — no code, no `npm test` impact (verify it stays green as a no-op check, not a target).

## Global Constraints

- `--doc-budget <n>` default is **3** (distinct from `--skill-budget`'s default of 5).
- Fast-lane narrows the domain-overlap scan's cap; it never skips the scan outright (mirrors `skill-curation.md`'s "fast-lane narrows breadth, never gates existence" principle).
- Do **not** touch the "up to seven named batch sections" / "Queue writes is an eighth" cardinality prose in either `review-console.md` or `SKILL.md` (Step 8.6 summary line) — record #56 lands before its sibling "journey drift-audit" leaf (#58), which is responsible for updating that literal count once both new sections exist. Grep for `"up to seven"` before editing either file to confirm the sibling hasn't already landed (if it has, treat that as new information and re-derive the plan for this specific point — don't blindly proceed).
- Do **not** split `SKILL.md`'s Step 9 standalone "Present Consolidated Summary" template (`### Configuration Updates (from Step 6)` heading and its batch-decision table) — that low-traffic path deliberately keeps folding doc items into the generic Configuration Updates table per the record's own Gotcha. Only the Step 8.6 Review Console (`review-console.md`) and Step 10's execution bullets get the split.
- After every file edit in this plan, re-run this grep from the repo root and **judge each hit's context** — a literal zero-count is impossible and not the goal, because `### 6.2: Decision Records (ADRs)` is now a legitimate, correct heading and prose correctly says "Step 6.2" when it means ADRs post-renumbering:
  ```bash
  grep -rn "Step 6\.1\|Step 6\.2\|Step 6\.3" --include="*.md" . \
    | grep -v "docs/superpowers/plans/\|docs/superpowers/specs/\|CHANGELOG.md\|\.claude-tweaks/pipelines/"
  ```
  The excluded paths are historical/frozen content that must **never** be edited by this record: `docs/superpowers/plans/*` and `docs/superpowers/specs/*` are permanent historical artifacts (this project's own convention — old plans/specs are never rewritten after the fact, even when they quote since-changed step numbers), `CHANGELOG.md` entries are dated snapshots of what shipped in a past version, and `.claude-tweaks/pipelines/**/work/*-spec.md` is this run's own pinned, already-committed materialized record body (immutable once written, per `flow/materialize.md`). Read every surviving hit's surrounding sentence: a hit is **stale** (needs fixing) only if it describes what Step 6.1 or Step 6.3 used to mean (Documentation, or ADRs pre-renumbering) — a hit correctly describing the *new* Step 6.2 (ADRs, post-renumbering) or Step 6.1 (CLAUDE.md/Rules, post-renumbering) is correct and must be left alone.
  A discovery pass run mid-plan-authoring found **7 live files outside this plan's original Key Files list** with genuinely stale "Step 6.3" (ADRs) or "Step 6.1" (Documentation) cross-references: `skills/deepen/SKILL.md`, `skills/docs-health/SKILL.md`, `skills/_shared/criteria-docs-diataxis.md`, `skills/_shared/decision-records.md`, `skills/challenge/SKILL.md`, `skills/help/context-flow.md`, `skills/init/docs-structure.md` — these are fixed in the new Task 5 below, added after that discovery. Task 4's final sweep exists to catch anything even Task 5 missed, not to be the first time this check runs.

---

### Task 1: `skills/wrap-up/SKILL.md` — Step 6 shrink, new Step 7.7, `--doc-budget` flag

**Files:**
- Modify: `skills/wrap-up/SKILL.md`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: a `## Step 7.7: Documentation Curation` heading between the existing `## Step 7: Skill Curation` section (ends at line 200) and `## Step 8: Analyze Next Steps` (line 202) — later tasks reference this heading's existence and exact wording when updating `review-console.md` and `CLAUDE.md`. Also produces the renumbered `### 6.1: CLAUDE.md and Rules` / `### 6.2: Decision Records (ADRs)` headings and the `--doc-budget <n>` flag (default `3`) — later tasks' cross-references must match these exact strings.

- [ ] **Step 1: Shrink Step 6's intro blockquotes from three sub-scans to two**

Read `skills/wrap-up/SKILL.md` lines 120-124. Replace:

```markdown
## Step 6: Assess Configuration Updates

> **Batch collection.** Step 6 collects potential documentation, CLAUDE.md/rules, and decision-record updates in a single pass across three sub-scans (Documentation, CLAUDE.md and Rules, Decision Records). No decisions are made here — everything is presented together in Step 9 for batch approval. Skill updates are handled separately in Step 7.

> **Parallel execution:** Run all three sub-scans (documentation, CLAUDE.md/rules, decision records) as parallel tool calls — each checks independent sources and collects findings in the `[type] target — change` format.
```

with:

```markdown
## Step 6: Assess Configuration Updates

> **Batch collection.** Step 6 collects potential CLAUDE.md/rules and decision-record updates in a single pass across two sub-scans (CLAUDE.md and Rules, Decision Records). No decisions are made here — everything is presented together in Step 9 for batch approval. Skill updates are handled separately in Step 7; documentation updates are handled separately in Step 7.7.

> **Parallel execution:** Run both sub-scans (CLAUDE.md/rules, decision records) as parallel tool calls — each checks independent sources and collects findings in the `[type] target — change` format.
```

- [ ] **Step 2: Remove the `### 6.1: Documentation` sub-item entirely**

Read lines 136-157 (from `### 6.1: Documentation` through the blank line before `### 6.2: CLAUDE.md and Rules`). Delete this entire block:

```markdown
### 6.1: Documentation

> **Parallel execution:** Read `docs/REGISTRY.md` and all doc files referenced in it as parallel Read calls.

Check if the work requires updates to project documentation, using the doc registry as a guide:

1. **Registry-guided check** — Read `docs/REGISTRY.md`. For each entry:
   - Match Auto-detect patterns against all files changed in this work (`git diff --name-only`)
   - If matched: check if `/build` Step 6.5 already updated this doc (look for doc commits in git log)
   - If not yet updated: read the doc, assess whether it needs changes
2. **Non-registry docs** — Also check setup guides, architecture references, API documentation, and ADRs as before (catches docs not yet in the registry, or projects without a registry)
3. **Registry maintenance** — Check if:
   - New docs were created during this work (e.g., ADR for a significant decision) → propose adding to registry
   - Existing docs were deleted or moved → propose removing/updating registry entries
   - Auto-detect patterns need adjustment (directories renamed, new code areas)

4. **Docs-health check on touched docs, and missing-doc detection** — read `docs-health-integration.md` in this skill's directory for the full procedure: D1 judges every doc this work edited or created against the shared docs-health criteria (genre-drift, depth-mismatch, findability, staleness), routing `additive` findings into this step's own `[doc]` collection and filing `restructural` findings as GitHub issues; D2 detects when this work introduced a new subsystem with zero doc coverage anywhere and proposes scaffolding a new doc from the genre-template library. Both fold their output into this step's `[doc]` collection and the Step 9 batch table alongside items 1-3 above.

→ Collect each needed update as: `[doc] {file} — {what to add/change}`
→ Collect registry updates as: `[registry] {action} — {detail}`

Registry updates are included in the Step 9 consolidated batch table alongside other config changes.

```

(All of it, including the registry-guided check, non-registry docs, registry maintenance, and the docs-health/missing-doc pointer — this content now lives in the new Step 7.7 section written in Step 4 below, adapted for the domain-overlap broadening.)

- [ ] **Step 3: Renumber the two remaining Step 6 sub-items**

Change `### 6.2: CLAUDE.md and Rules` to `### 6.1: CLAUDE.md and Rules`.

Change `### 6.3: Decision Records (ADRs)` to `### 6.2: Decision Records (ADRs)`.

Leave the body text of both sections unchanged — only the headings' numbers change.

- [ ] **Step 4: Insert the new `## Step 7.7: Documentation Curation` section**

After the existing Step 7 section ends (the line `Skill curation declares "No skill updates needed" only when seeds, the independent scan, and gap detection all come up empty — never merely because no ledger entry was tagged, and even then a mandatory \`SCANNED\` summary line (naming the seed count, skills read, and gap-detection outcome — see \`skill-curation.md\` 7.6) is logged so the null result is auditable. Staged updates and new-skill candidates surface at the Wrap-Up Review Console (Step 8.6), or the interactive batch table per \`skill-curation.md\`.`) and before `## Step 8: Analyze Next Steps (record- or spec-based only)`, insert:

```markdown

## Step 7.7: Documentation Curation

Analyze whether project documentation needs updating, and detect documentation this work should have produced but didn't — based on what was actually built. This step runs standalone (not batched with Step 6) because it now includes a domain-overlap scan across existing docs (reading relevant docs even when this work didn't touch them directly) in addition to the docs this work directly edited or created — a heavier weight of analysis than Step 6's CLAUDE.md/rules/ADR scans.

**Fast-lane narrows breadth, never gates existence.** Same principle as Step 7's skill curation (`skill-curation.md`'s opening paragraph) — under `ceremony-profile: fast-lane`, the domain-overlap scan's cap shrinks (top-1 instead of top-3) but the scan itself always runs.

For the full procedure — the registry-guided touched-docs check, the domain-overlap scan (D0) with its `docs/REGISTRY.md`-absent fallback and `--doc-budget` cap, the shared JUDGE application (D1) across both touched and domain-overlap docs, missing-documentation gap detection (D2), and the mandatory null-result summary line — read `docs-health-integration.md` in this skill's directory.

Documentation curation declares "No documentation updates needed" only when the domain-overlap scan (D0), the touched-docs judgment (D1), and the missing-doc gap detection (D2) all come up empty — never merely because nothing was flagged elsewhere — and even then a mandatory `SCANNED` summary line (naming docs touched, domain-overlap docs read, and gap-detection outcome — see `docs-health-integration.md`) is logged so the null result is auditable. Staged updates and restructural filings surface at the Wrap-Up Review Console (Step 8.6) in the "Documentation updates" section, or Step 9's generic Configuration Updates batch table in interactive/standalone mode (Step 9's template is intentionally not split further — see `docs-health-integration.md`'s own Gotcha note).
```

- [ ] **Step 5: Add the `--doc-budget <n>` flag**

Change the `argument-hint` frontmatter field (line 4) from:

```
argument-hint: "[#N|<spec>|<context>|resume] [--dry-run] [--skill-budget <n>]"
```

to:

```
argument-hint: "[#N|<spec>|<context>|resume] [--dry-run] [--skill-budget <n>] [--doc-budget <n>]"
```

In the `### Flags` section (after the `--skill-budget <n>` bullet, currently the last bullet at line 50), add:

```markdown
- **`--doc-budget <n>`** — override Step 7.7's default domain-overlap doc-read cap (top ~3, or top ~1 under a `fast-lane` ceremony profile) for this invocation only. See `docs-health-integration.md`'s domain-overlap scan (D0).
```

Update line 41 (`Flags (`--dry-run`, `--skill-budget <n>`) may appear anywhere in \`$ARGUMENTS\`...`) to also list `--doc-budget <n>`:

```markdown
Flags (`--dry-run`, `--skill-budget <n>`, `--doc-budget <n>`) may appear anywhere in `$ARGUMENTS` alongside any of the above forms — strip them before applying the branches above. See "Flags" below.
```

- [ ] **Step 6: Fix the remaining `Step 6.3` cross-references (renumbered to `Step 6.2`)**

Grep the file for `Step 6.3` after Steps 1-5 above:

```bash
grep -n "Step 6\.3" skills/wrap-up/SKILL.md
```

Expect exactly 4 hits (pre-edit line numbers 380, 458, 482, 483 — verified directly against the live file during plan authoring; re-derive exact numbers from the live grep output after Steps 1-5 run, since those steps shift line numbers). For each hit, replace `Step 6.3` with `Step 6.2` in place, preserving surrounding text exactly. The four sentences (verify each still reads correctly after the substitution):
- `- **Decision records (ADRs)** — write the approved \`docs/decisions/NNNN-{slug}.md\` files (Step 6.3) using the template in \`_shared/decision-records.md\`, and add them to \`docs/REGISTRY.md\` if a registry exists` → `(Step 6.2)`
- `| Writing an ADR for every decision | ADRs are valuable because they are rare — Step 6.3's 3-factor gate (hard-to-reverse AND surprising AND a real trade-off) keeps them so. Most wrap-ups produce zero ADRs, and that is correct |` → `Step 6.2's 3-factor gate`
- `| \`/claude-tweaks:deepen\` | Interface trade-offs /deepen flags \`[ADR-candidate]\` are picked up by Step 6.3 and run through the 3-factor gate for possible ADR creation |` → `Step 6.2`
- `| \`_shared/decision-records.md\` | Canonical 3-factor ADR gate, location convention, and template applied by Step 6.3 |` → `Step 6.2`

- [ ] **Step 7: Fix the `Step 6.1 item 4` Relationship-table reference**

Find the row:

```markdown
| `/claude-tweaks:docs-health` and `_shared/criteria-docs-diataxis.md`, `docs-health-integration.md` | Step 6.1 item 4 applies this shared judgment inline to docs touched by the current work (same reuse pattern as `_shared/harness-health-analysis.md` in Step 7), and detects missing documentation from the diff. |
```

Replace with:

```markdown
| `/claude-tweaks:docs-health` and `_shared/criteria-docs-diataxis.md`, `docs-health-integration.md` | Step 7.7 applies this shared judgment inline to docs touched by the current work plus a domain-overlap top-N (same reuse pattern as `_shared/harness-health-analysis.md` in Step 7), and detects missing documentation from the diff. |
```

- [ ] **Step 8: Split Step 10's execution bullet for documentation vs. CLAUDE.md/rules**

Find (around what was originally line 377, re-derive the live line number):

```markdown
- **Documentation, CLAUDE.md, rules** — apply the registry / doc / rule edits collected in Step 6 and approved at the Console or batch
```

Replace with two bullets:

```markdown
- **Documentation** — apply the registry / doc edits collected in Step 7.7 and approved at the Console or batch
- **CLAUDE.md, rules** — apply the edits collected in Step 6 and approved at the Console or batch
```

- [ ] **Step 9: Add Anti-Patterns rows for documentation curation**

In the `## Anti-Patterns` table, after the row `| Declaring "no skill updates needed" with no logged scan scope | ... |` (currently the row right after "Skipping skill curation because nothing was ledger-tagged"), add two new rows:

```markdown
| Skipping documentation curation because nothing was directly touched | Step 7.7's domain-overlap scan (D0) reads relevant docs even when this work didn't edit them directly — declaring "no documentation updates needed" without running D0 skips exactly the check this step exists to add |
| Declaring "no documentation updates needed" with no logged scan scope | The null result is unfalsifiable without a record of what was scanned — Step 7.7's mandatory `SCANNED` summary line (`docs-health-integration.md`) exists precisely so "nothing needed updating" is auditable, not just asserted |
```

- [ ] **Step 10: Verify and commit**

This file alone should now be internally consistent — confirm no stale `Step 6.1` or `Step 6.3` reference remains inside `skills/wrap-up/SKILL.md` itself (Tasks 2-5 handle the other files; the repo-wide sweep only makes sense once all tasks have run, in Task 4 Step... actually Task 4's own scope narrowed — the full repo-wide sweep now lives implicitly in Task 5's Step 8 plus this per-task check; don't expect zero matches repo-wide yet, only within this one file):

```bash
grep -n "Step 6\.1\|Step 6\.3" skills/wrap-up/SKILL.md
```

Expect zero matches (the only sub-numbers that should remain in this file are the new, correct `Step 6.2` ADR references and the `### 6.1`/`### 6.2` headings without the word "Step"). Then:

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/wrap-up-drift-prevention" && pwd && git rev-parse --show-toplevel
```

Confirm both point at the worktree (not the main checkout) before committing. Then:

```bash
git add skills/wrap-up/SKILL.md
git commit -m "wrap-up: elevate documentation curation to Step 7.7, renumber Step 6

refs #56"
```

---

### Task 2: `skills/wrap-up/docs-health-integration.md` — domain-overlap scan (D0), step-reference updates, mandatory summary

**Files:**
- Modify: `skills/wrap-up/docs-health-integration.md`

**Interfaces:**
- Consumes: Task 1's `## Step 7.7: Documentation Curation` heading text (this file's header must match — "Loaded by `/claude-tweaks:wrap-up` Step 7.7") and the `--doc-budget <n>` flag name/default (`3`, fast-lane `1`) Task 1 documented.
- Produces: the D0/D1/D2 section structure and the `SCANNED` summary-line format that Task 3 (`review-console.md`) and Task 4 (`CLAUDE.md`) reference when describing what Step 7.7 does.

- [ ] **Step 1: Update the header and intro**

Replace the file's first three lines:

```markdown
# Docs-Health Integration for /wrap-up Step 6.1

Loaded by `/claude-tweaks:wrap-up` Step 6.1 to judge the health of docs this work actually touched, and to detect documentation this work should have produced but didn't. Two independent checks — D1 judges existing docs, D2 judges the diff for missing coverage.
```

with:

```markdown
# Docs-Health Integration for /wrap-up Step 7.7

Loaded by `/claude-tweaks:wrap-up` Step 7.7 to judge the health of docs this work actually touched or is closely related to, and to detect documentation this work should have produced but didn't. Three checks — D0 broadens which existing docs get judged beyond the touched set via a domain-overlap scan, D1 applies the shared docs-health judgment to that combined scope, D2 judges the diff for missing coverage.
```

- [ ] **Step 2: Insert the new `## D0: Domain-Overlap Scan` section before `## D1: Inline JUDGE application`**

Insert this new section immediately before the `## D1: Inline JUDGE application` heading:

```markdown
## D0: Domain-Overlap Scan

**Purpose:** rank existing docs by how much they cover the changed subsystem, so D1 also judges docs that weren't directly touched but are still relevant — the documentation equivalent of skill curation's independent domain-scoped scan (`skill-curation.md` 7.2).

1. Read `docs/REGISTRY.md`. **Explicit fallback:** if it doesn't exist, or exists with no Auto-detect patterns, skip this scan for the run entirely — do not fall back to scanning the whole `docs/` tree (that's `/claude-tweaks:docs-health`'s own rotation's job, not this leaf's). Note this in the mandatory summary below as `"registry absent/empty — domain-overlap scan skipped"`; this is not an error.
2. Otherwise, score each registry entry by how much its Auto-detect patterns intersect this work's `git diff --name-only` — reuse `bin/lib/issues/blast-radius.js`'s `classifyDiffFiles` the same way `SKILL.md`'s Step 6 fast-lane pre-check does (map each bare filename to `{path: f}` first, since the function reads `f.path`), passing the registry's own Auto-detect patterns as the `sensitivePaths` argument. A result's `isSensitive: true` means a registry-pattern hit here.
3. Rank descending by overlap-hit count. Take the **top-N**, where N is `--doc-budget` if passed to the invoking `/claude-tweaks:wrap-up` call (see `wrap-up/SKILL.md`'s Flags), else **3** — or **1** when `config.yml`'s `ceremony-profile` is `fast-lane` (read fresh — see `wrap-up/SKILL.md` Step 3.5). Exclude any doc already in D1's touched-docs scope below — it's already covered, don't double-judge it.
4. If more docs than the applicable cap have a nonzero overlap score, **note the overflow explicitly** in the mandatory summary below (name the cap and how many were left unread) — never silently truncate. `/claude-tweaks:tidy` and future wrap-ups pick up the remainder.
5. Add the selected top-N docs to D1's scope below — they go through the identical JUDGE procedure (D1 Steps 1-3) as touched docs, with no special-casing.

```

- [ ] **Step 3: Update D1's scope paragraph to union with D0**

Replace:

```markdown
## D1: Inline JUDGE application

**Scope:** every doc under `docs/**` that this work edited or newly created (`git diff --name-only` against the run's base, filtered to `docs/**/*.md`). Registry-matched-but-unedited docs are Step 6.1's existing "should this have been updated" concern — not this check's job; don't re-scope this to include them.
```

with:

```markdown
## D1: Inline JUDGE application

**Scope:** every doc under `docs/**` that this work edited or newly created (`git diff --name-only` against the run's base, filtered to `docs/**/*.md`), **unioned with D0's domain-overlap top-N** above. Registry-matched-but-unedited docs outside D0's selected top-N are `/claude-tweaks:docs-health`'s own rotation's concern — don't re-scope this to include them.
```

- [ ] **Step 4: Retarget D1's routing from Step 6 to Step 7.7**

Replace:

```markdown
Route surviving findings by `classification`:

- **`additive`** → collect as `[doc] {file} — {description}` rows, folded into Step 6's existing configuration-update batch table (Step 9's Configuration Updates section) — applied inline in Step 10 exactly like any other approved doc edit.
```

with:

```markdown
Route surviving findings by `classification`:

- **`additive`** → collect as `[doc] {file} — {description}` rows, surfaced in the Wrap-Up Review Console's own "Documentation updates" section (Step 8.6) or, in interactive/standalone mode, folded into Step 9's generic Configuration Updates batch table (that lower-traffic template is intentionally not split further — see the Gotcha at the bottom of this file) — applied inline in Step 10 exactly like any other approved doc edit.
```

Leave the `restructural` bullet's own content unchanged (it already files as a GitHub issue independent of which step number owns the flow) — just re-read it once to confirm no other "Step 6" text appears in that bullet requiring an update. It does not.

- [ ] **Step 5: Retarget D2's routing from Step 6 to Step 7.7**

Replace:

```markdown
2. Propose a `[doc] {new-file-path} — Create: {one-line rationale}` row, folded into the same Step 6 batch table as D1's additive findings.
```

with:

```markdown
2. Propose a `[doc] {new-file-path} — Create: {one-line rationale}` row, folded into the same Documentation updates collection as D1's additive findings (see D1's routing above).
```

- [ ] **Step 6: Add the mandatory null-result summary line as a new final section**

At the end of the file (after the existing final paragraph, "Never propose more than one new doc per genuinely new subsystem..."), append:

```markdown

## Mandatory summary (always, regardless of outcome)

Emit exactly one summary line every Step 7.7 run, auto mode or interactive:

```
SCANNED {time} — Step 7.7 documentation curation summary: {T} docs touched, {D} domain-overlap docs read
(top-{cap}: {names}, or "registry absent/empty — domain-overlap scan skipped"), gap detection: {what was
examined, found/not found}.
Result: {N} applied, {M} staged, {K} restructural filed.
Reversibility: N/A.
```

`{T}` counts docs in D1's touched-docs sub-scope (`git diff` against `docs/**/*.md`). `{D}` counts D0's domain-overlap docs actually read — `0` when the registry is absent/empty, in which case render the parenthetical as the literal fallback text instead of `top-{cap}: {names}`. `{cap}` is D0's own default-3/fast-lane-1/`--doc-budget`-override value. When D0 noted an overflow (Step 3 above), append it to the summary: `; {V} additional domain-overlap doc(s) over cap, deferred to /claude-tweaks:tidy`. Auto mode appends this line to `decisions.md` under the `SCANNED` tag (see `_shared/auto-decision-log.md`); interactive mode prints the equivalent line inline instead of `decisions.md`.

Declare **"No documentation updates needed"** only when D0 finds no domain-overlap docs (or the registry is absent/empty), D1's full scope (touched + domain-overlap) produces no findings, and D2 finds no missing-doc gap — and even then, the mandatory summary line above is still emitted, naming the docs-touched count, domain-overlap docs read, and gap-detection outcome. A "no updates needed" outcome that skips the summary line is a Step 7.7 defect, not a valid completion.

## Gotcha: Step 9's standalone template is not split

`wrap-up/SKILL.md`'s Step 9 "Present Consolidated Summary" standalone template (the non-Review-Console path, used in interactive mode or standalone wrap-up) still folds doc items into one generic `### Configuration Updates (from Step 6)` table alongside CLAUDE.md/rule/ADR items. This is deliberate — Step 9 is a lower-traffic path (Step 8.6's Review Console already covers the console-driven flow with its own dedicated "Documentation updates" section), and splitting Step 9's template is out of scope for this change. Only Step 8.6 (`review-console.md`) gets the dedicated section.
```

- [ ] **Step 7: Verify and commit**

```bash
grep -n "Step 6\.1\|Step 6\.2\|Step 6\.3" skills/wrap-up/docs-health-integration.md
```

Expect zero matches. Then:

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/wrap-up-drift-prevention" && pwd && git rev-parse --show-toplevel
git add skills/wrap-up/docs-health-integration.md
git commit -m "wrap-up: add domain-overlap scan (D0) to docs-health-integration, retarget to Step 7.7

refs #56"
```

---

### Task 3: `skills/wrap-up/review-console.md` — "Documentation updates" section

**Files:**
- Modify: `skills/wrap-up/review-console.md`

**Interfaces:**
- Consumes: Task 1's `Step 7.7` heading name and Task 2's `SCANNED` summary-line format (this task's SCANNED-entry sentence must describe both Step 7's and Step 7.7's summary lines).
- Produces: the "Documentation updates" section renders at item `13` in the console's global sequence — the record's own Deliverable 5 explicitly forbids this task from updating the "up to seven named batch sections" cardinality prose; that stays for the sibling leaf (#58) to fix when it lands.

- [ ] **Step 1: Confirm the sibling leaf ("journey drift-audit", #58) hasn't already landed**

```bash
grep -n "Journey updates" skills/wrap-up/review-console.md
```

Expect zero matches (per this session's earlier read of the file — confirm it's still true before editing, since another process could theoretically have landed it). If a match is found, STOP this task and re-derive the insertion point from the file's actual current structure instead of assuming "immediately after Skill updates" — do not blindly proceed with a stale assumption.

- [ ] **Step 2: Split the "Configuration updates" example table into two sections**

Replace:

```markdown
#### Configuration updates (from Step 6)

| # | Type | Target | Change |
|---|---|---|---|
| 13 | doc | docs/api.md | Document new /auth/refresh endpoint |
| 14 | claude.md | Commands | Add `npm run lint:fix` to test workflow |
```

with:

```markdown
#### Documentation updates (from Step 7.7)

| # | Type | Target | Change |
|---|---|---|---|
| 13 | doc | docs/api.md | Document new /auth/refresh endpoint |

#### Configuration updates (from Step 6)

| # | Type | Target | Change |
|---|---|---|---|
| 14 | claude.md | Commands | Add `npm run lint:fix` to test workflow |
```

(Item numbers 13 and 14 are unchanged from the original — this is a pure split of one table into two, so nothing downstream that references items 15-21 or 1-21 needs renumbering.)

- [ ] **Step 3: Broaden the SCANNED-entry sentence to cover both Step 7 and Step 7.7**

Find (in the "Auto-applied" section, immediately after the Auto-applied example table):

```markdown
A `SCANNED` entry (skill-curation's scan-summary log line — see `_shared/auto-decision-log.md`) also renders in this section, but with `Status` = `Informational` and `Where` = the step/location it ran at (no commit ref, since nothing was applied) — there is nothing to revert for these rows.
```

Replace with:

```markdown
A `SCANNED` entry (skill curation's scan-summary log line from Step 7, or documentation curation's from Step 7.7 — see `_shared/auto-decision-log.md`) also renders in this section, but with `Status` = `Informational` and `Where` = the step/location it ran at (no commit ref, since nothing was applied) — there is nothing to revert for these rows.
```

- [ ] **Step 4: Add a dedicated "On approval" step for Documentation updates**

Find the numbered "On approval (option 1)" list:

```markdown
## On approval (option 1)

1. Apply all staged patches in `staged/` for items 5–7 (run `git apply` or equivalent for each)
2. Apply skill updates and create new skills (items 11–12, from Step 7)
3. Apply config updates (items 13–14: docs, CLAUDE.md, rules)
4. Execute cleanup actions (items 15–21) — Step 10 picks these up
5. For each `Q#` queue write, prompt the user per item via its own `AskUserQuestion` call. On Apply (or Edit, after the modification): create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file (`staged/leftover-{slug}.md` for leftover-routed items; other sources use their own staged-file shape). Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
6. Commit with a wrap-up message
7. Proceed to Step 9 (Present Consolidated Summary)
```

Replace with:

```markdown
## On approval (option 1)

1. Apply all staged patches in `staged/` for items 5–7 (run `git apply` or equivalent for each)
2. Apply skill updates and create new skills (items 11–12, from Step 7)
3. Apply documentation updates (item 13, from Step 7.7) — including any approved missing-doc scaffolding (D2) and restructural docs-health filings (D1)
4. Apply config updates (item 14: CLAUDE.md, rules, ADRs)
5. Execute cleanup actions (items 15–21) — Step 10 picks these up
6. For each `Q#` queue write, prompt the user per item via its own `AskUserQuestion` call. On Apply (or Edit, after the modification): create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file (`staged/leftover-{slug}.md` for leftover-routed items; other sources use their own staged-file shape). Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
7. Commit with a wrap-up message
8. Proceed to Step 9 (Present Consolidated Summary)
```

- [ ] **Step 5: Verify and commit**

```bash
grep -n "Step 6\.1\|Step 6\.2\|Step 6\.3" skills/wrap-up/review-console.md
```

Expect zero matches. Then confirm the "up to seven named batch sections" sentence (Numbering rules section) is untouched:

```bash
grep -n "up to seven" skills/wrap-up/review-console.md
```

Expect exactly 1 match, unchanged from before this task. Then:

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/wrap-up-drift-prevention" && pwd && git rev-parse --show-toplevel
git add skills/wrap-up/review-console.md
git commit -m "wrap-up: add Documentation updates section to Review Console

refs #56"
```

---

### Task 4: `CLAUDE.md` — Structure table update, final repo-wide sweep

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1's Step 7.7 heading, Task 2's D0/domain-overlap/`--doc-budget` vocabulary — this task's CLAUDE.md sentence must accurately describe what Tasks 1-3 actually shipped, not a paraphrase written in advance.
- Produces: nothing consumed by later tasks (last task in this plan).

- [ ] **Step 1: Update the wrap-up row in the Structure table**

Find (in the "Skills with sub-files" table, the `wrap-up` row):

```
| wrap-up | leftover-routing.md, review-console.md, cleanup-procedures.md, skill-curation.md, verification-brief.md, docs-health-integration.md, unblocked-records.md | Leftover routing rules for unfinished work; Review Console consolidation template; Step 5 cleanup procedures (design wrapper caches, pipeline run dir archival, worktree teardown, issue-claim release (item 8) with ownership check); Step 7 skill curation (seed gather, independent domain-scoped scan + gap detection, 8-dimension analysis, ≥2-of-3 new-skill gate, stage/present) — generates candidates from the work itself, not only ledger-tagged seeds; Step 10 Verification Brief procedure (bootstrap demo:pending, testability check, priority-ordered sourcing, post/append); Step 6.1 item 4 docs-health-on-touched-docs judgment + missing-doc (D2) scaffolding proposal; Step 8's newly-unblocked-records bash/node procedure (github-issues body-text, github-issues native GraphQL, local-files variants) — record/spec-mode only |
```

Replace the `Step 6.1 item 4 docs-health-on-touched-docs judgment + missing-doc (D2) scaffolding proposal;` clause with:

```
Step 7.7 documentation curation (domain-overlap scan D0 with REGISTRY.md-absent fallback and `--doc-budget` cap default 3, docs-health-on-touched-docs judgment D1, missing-doc D2 scaffolding proposal, mandatory SCANNED summary) — same standalone treatment as Step 7 skill curation;
```

so the full row reads (verify by reading the edited line back):

```
| wrap-up | leftover-routing.md, review-console.md, cleanup-procedures.md, skill-curation.md, verification-brief.md, docs-health-integration.md, unblocked-records.md | Leftover routing rules for unfinished work; Review Console consolidation template; Step 5 cleanup procedures (design wrapper caches, pipeline run dir archival, worktree teardown, issue-claim release (item 8) with ownership check); Step 7 skill curation (seed gather, independent domain-scoped scan + gap detection, 8-dimension analysis, ≥2-of-3 new-skill gate, stage/present) — generates candidates from the work itself, not only ledger-tagged seeds; Step 10 Verification Brief procedure (bootstrap demo:pending, testability check, priority-ordered sourcing, post/append); Step 7.7 documentation curation (domain-overlap scan D0 with REGISTRY.md-absent fallback and `--doc-budget` cap default 3, docs-health-on-touched-docs judgment D1, missing-doc D2 scaffolding proposal, mandatory SCANNED summary) — same standalone treatment as Step 7 skill curation; Step 8's newly-unblocked-records bash/node procedure (github-issues body-text, github-issues native GraphQL, local-files variants) — record/spec-mode only |
```

- [ ] **Step 2: Confirm `npm test` is unaffected**

```bash
npm test 2>&1 | tail -20
```

Expect the same pass count as before this record's changes (markdown-only edits should not change test output at all — this is a sanity check, not a target).

- [ ] **Step 3: Verify and commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/wrap-up-drift-prevention" && pwd && git rev-parse --show-toplevel
git add CLAUDE.md
git commit -m "CLAUDE.md: reflect Step 7.7 documentation curation in wrap-up's Structure row

refs #56"
```

---

### Task 5: Fix stale cross-references in 7 live files outside the original Key Files list

**Files:**
- Modify: `skills/deepen/SKILL.md`
- Modify: `skills/docs-health/SKILL.md`
- Modify: `skills/_shared/criteria-docs-diataxis.md`
- Modify: `skills/_shared/decision-records.md`
- Modify: `skills/challenge/SKILL.md`
- Modify: `skills/help/context-flow.md`
- Modify: `skills/init/docs-structure.md`

**Interfaces:**
- Consumes: Task 1's renumbered `Step 6.2` (Decision Records/ADRs) and Task 1's new `Step 7.7` (Documentation Curation) — this task's edits must reference those exact identities, not invent new ones.
- Produces: nothing consumed by later tasks (Task 4's final sweep runs after this task and should find these clean).

This task exists because a discovery grep run during plan authoring (see Global Constraints) found these 7 files were never touched by records #54/#55 and are not in this record's own Key Files list, yet each contains a live, currently-accurate-sounding sentence that goes stale the moment Task 1 renumbers `wrap-up`'s Step 6.3 → 6.2 and moves Step 6.1's documentation content to Step 7.7. This is the exact "second, non-adjacent location" pattern this project's own CLAUDE.md warns about — grep alone found them; each was verified by reading its surrounding sentence before this task was written, confirming all are genuinely live (not historical/frozen content).

- [ ] **Step 1: `skills/deepen/SKILL.md` — ADR pickup reference (Step 6.3 → 6.2)**

Read line 210 (re-derive the live line number via `grep -n "Step 6\.3" skills/deepen/SKILL.md` first — do not assume the number above still applies). Find:

```markdown
| `/claude-tweaks:wrap-up` | Hard-to-reverse interface trade-offs /deepen flags `[ADR-candidate]` in Step 4 are picked up by /wrap-up's Step 6.3 and run through the 3-factor gate for possible ADR creation — see the `_shared/decision-records.md` row below. |
```

Replace `Step 6.3` with `Step 6.2` in place (only that substring changes; the rest of the row is unchanged).

- [ ] **Step 2: `skills/docs-health/SKILL.md` — wrap-up relationship row (Step 6.1 → 7.7)**

Read the live `Step 6\.1` line via `grep -n "Step 6\.1" skills/docs-health/SKILL.md`. Find:

```markdown
| `/claude-tweaks:wrap-up` | Step 6.1 applies the same `_shared/criteria-docs-diataxis.md` procedure inline to docs touched by the just-completed work (see `docs-health-integration.md` in that skill's directory), and separately detects missing documentation from the diff — the same reuse pattern `/wrap-up` Step 7 applies to `_shared/harness-health-analysis.md`. |
```

Replace with:

```markdown
| `/claude-tweaks:wrap-up` | Step 7.7 applies the same `_shared/criteria-docs-diataxis.md` procedure inline to docs touched by the just-completed work plus a domain-overlap top-N (see `docs-health-integration.md` in that skill's directory), and separately detects missing documentation from the diff — the same reuse pattern `/wrap-up` Step 7 applies to `_shared/harness-health-analysis.md`. |
```

- [ ] **Step 3: `skills/_shared/criteria-docs-diataxis.md` — shared-fragment intro (Step 6.1 item 4 → 7.7)**

Read the live line via `grep -n "Step 6\.1" skills/_shared/criteria-docs-diataxis.md`. Find (in the file's opening paragraph):

```markdown
Shared, criteria-only fragment — the "what is worth flagging in `docs/**`" knowledge for `/claude-tweaks:docs-health` and `/claude-tweaks:wrap-up` (Step 6.1 item 4 reuses the identical procedure inline, judging docs touched by the current work). No workflow, no subagent dispatch, no Next Actions.
```

Replace `Step 6.1 item 4 reuses the identical procedure inline, judging docs touched by the current work` with `Step 7.7's D1 reuses the identical procedure inline, judging docs touched by the current work plus a domain-overlap top-N` (the "item 4" numbering no longer exists post-renumbering — Step 7.7 restructures the procedure into D0/D1/D2, so the reference must name D1 directly rather than an item number).

- [ ] **Step 4: `skills/_shared/decision-records.md` — 3 occurrences (Step 6.3 → 6.2)**

Read the live lines via `grep -n "Step 6\.3" skills/_shared/decision-records.md` (expect 3 hits — 2 in the opening paragraph, 1 in the "who reads/writes" table). Find and fix each:

```markdown
Canonical contract for when and how the workflow captures an Architecture Decision Record. Referenced by `/claude-tweaks:wrap-up` (Step 6.3, writes ADRs for qualifying decisions) and `/claude-tweaks:challenge` (flags ADR candidates in the brief). `/claude-tweaks:init` Phase 8.5 may flag `docs/decisions/` as a missing doc and backlog a pointer to this file's template (it never creates the folder or a file itself); the `docs/decisions/` folder is first created in practice when `/claude-tweaks:wrap-up` Step 6.3 writes the first ADR file into it.
```

Both `Step 6.3` occurrences in this paragraph → `Step 6.2`. And:

```markdown
| `/claude-tweaks:wrap-up` | **Applies the gate and writes.** Step 6.3 collects decisions surfaced during build/review/reflection (plus any `[ADR-candidate]` from the brief or from `/deepen`), runs the 3-factor gate, and proposes ADR creation. Proposed ADRs are routed through the Step 9 batch table / Review Console like any other configuration update — never written silently. |
```

`Step 6.3` → `Step 6.2`.

- [ ] **Step 5: `skills/challenge/SKILL.md` — 2 occurrences (Step 6.3 → 6.2)**

Read the live lines via `grep -n "Step 6\.3" skills/challenge/SKILL.md` (expect 2 hits). Find and fix each:

```markdown
{Tag any constraint that encodes a hard-to-reverse, non-obvious, genuinely-traded-off decision with `[ADR-candidate]` — `/claude-tweaks:wrap-up` Step 6.3 runs the 3-factor gate on these and records the survivors as ADRs. Do not write the ADR here; the decision isn't final pre-brainstorm.}
```

`Step 6.3` → `Step 6.2`. And:

```markdown
| `_shared/decision-records.md` | /challenge tags hard-to-reverse framing decisions `[ADR-candidate]` in the brief; /wrap-up Step 6.3 applies the 3-factor gate and records the survivors. |
```

`Step 6.3` → `Step 6.2`.

- [ ] **Step 6: `skills/help/context-flow.md` — artifact-flow table (Step 6.3 → 6.2)**

Read the live line via `grep -n "Step 6\.3" skills/help/context-flow.md`. Find:

```markdown
| `/wrap-up` | `specs/NN-*.md`, review output, plan files, ledger, `.claude/skills/*.md` (relevant skills from ledger entries) | CLAUDE.md updates, skill updates, a new backlog or `parked` work record (GitHub issue or local file, per `work-backend`) for leftover work, `docs/decisions/*.md` (ADRs, Step 6.3). Invokes `/reflect` (full mode). | Plan files, ledger. A legacy spec file is deleted too; a record-mode build's materialized file stays committed as audit trail instead. |
```

`Step 6.3` → `Step 6.2` (only that substring; the rest of the row is unchanged).

- [ ] **Step 7: `skills/init/docs-structure.md` — folder-taxonomy comment (Step 6.3 → 6.2)**

Read the live line via `grep -n "Step 6\.3" skills/init/docs-structure.md`. Find:

```markdown
  decisions/               ← ADRs (0001-chose-postgres.md) — written by /wrap-up Step 6.3 per the 3-factor gate in `_shared/decision-records.md`
```

`Step 6.3` → `Step 6.2` (preserve the exact leading whitespace/indentation — this line is inside a fenced folder-tree diagram).

- [ ] **Step 8: Verify each file individually**

```bash
for f in skills/deepen/SKILL.md skills/docs-health/SKILL.md skills/_shared/criteria-docs-diataxis.md skills/_shared/decision-records.md skills/challenge/SKILL.md skills/help/context-flow.md skills/init/docs-structure.md; do
  echo "=== $f ==="
  grep -n "Step 6\.3\|Step 6\.1" "$f"
done
```

Expect **zero output** for every file (no `Step 6.3` or `Step 6.1` should remain in any of the 7 — each was fully retargeted to `Step 6.2` or `Step 7.7`).

- [ ] **Step 9: Full repo-wide final sweep (this is the record's own Acceptance Criteria check, run now that Tasks 1-5 have all landed)**

```bash
grep -rn "Step 6\.1\|Step 6\.3" --include="*.md" . \
  | grep -v "docs/superpowers/plans/\|docs/superpowers/specs/\|CHANGELOG.md\|\.claude-tweaks/pipelines/"
```

Note this scopes to `Step 6\.1` and `Step 6\.3` only (not `Step 6\.2`, which now legitimately exists as the renumbered ADR step and will always produce hits — see this plan's Global Constraints for why a `Step 6\.2` grep can never be zero). Expect **zero output**. If anything survives, it is a location none of Tasks 1-5 anticipated — fix it in place, following the same pattern (does it mean the old Documentation sub-step → retarget to `Step 7.7`; does it mean the old ADR sub-step → retarget to `Step 6.2`), then re-run this exact grep until clean, before committing.

- [ ] **Step 10: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/wrap-up-drift-prevention" && pwd && git rev-parse --show-toplevel
git add skills/deepen/SKILL.md skills/docs-health/SKILL.md skills/_shared/criteria-docs-diataxis.md skills/_shared/decision-records.md skills/challenge/SKILL.md skills/help/context-flow.md skills/init/docs-structure.md
git commit -m "Fix stale wrap-up Step 6.1/6.3 cross-references in 7 sibling skill files

Discovered via repo-wide sweep during #56 planning — none of these 7 files
are in #56's own Key Files list, but each held a live cross-reference to
wrap-up's pre-renumbering Step 6.1 (Documentation) or Step 6.3 (ADRs).

refs #56"
```

---

## Self-Review Notes (completed during plan authoring, updated after a mid-authoring discovery pass)

1. **Spec coverage** — all 9 acceptance criteria map to a task: Step 7.7 heading (Task 1 Step 4), Step 6 renumbering (Task 1 Steps 1-3), docs-health-integration.md header (Task 2 Step 1), domain-overlap scan with cap/fallback/overflow (Task 2 Step 2), `--doc-budget` flag with default 3 (Task 1 Step 5), review-console.md section + apply-step (Task 3 Steps 2 & 4), CLAUDE.md Structure row (Task 4 Step 1), repo-wide 6.1/6.3 grep re-run after every edit (baked into every task's own verify step, with the true final sweep at Task 5 Step 9), `npm test` unaffected (Task 4 Step 2).
2. **Placeholder scan** — no TBD/TODO; every step shows literal before/after text.
3. **Type consistency** — N/A (markdown-only, no functions/types).
4. **Deliverable 5 (cardinality prose)** — deliberately NOT touched in either file; Task 3 Step 1 adds a live re-check (grep for "Journey updates") before editing, per the record's own coordination Gotcha, since this plan was authored before dispatching Task 3 and the sibling leaf's landing state could change between planning and execution.
5. **Numbering collision check** — verified `skill-curation.md` already claims "(7.1)" through "(7.6)" as internal shorthand, confirming 7.7 is collision-free (this plan does not introduce any 7.1-7.6 references).
6. **Mid-authoring discovery (Task 5 added after this point)** — running this plan's own Global Constraints grep against the live repo *before* dispatching any task (rather than trusting the record's own Key Files list) surfaced 7 live files with genuine stale cross-references the record's own Deliverables/Key Files never named: `skills/deepen/SKILL.md`, `skills/docs-health/SKILL.md`, `skills/_shared/criteria-docs-diataxis.md`, `skills/_shared/decision-records.md`, `skills/challenge/SKILL.md`, `skills/help/context-flow.md`, `skills/init/docs-structure.md`. It also surfaced that a literal "zero matches repo-wide" verification target is impossible once `Step 6.2` becomes a legitimate, correct identity — the Global Constraints section and every task's own verify step were corrected in place to grep only `Step 6\.1`/`Step 6\.3` (the retired identities) rather than all three numbers, and to exclude historical/frozen paths (`docs/superpowers/plans/`, `docs/superpowers/specs/`, `CHANGELOG.md`, `.claude-tweaks/pipelines/`) that must never be rewritten. This is exactly the failure mode this project's own CLAUDE.md Don't describes ("Don't assume a phase's own file list is complete just because every task's diff is internally consistent — grep the wider repo for prose that assumes the OLD state") — caught here at plan-authoring time instead of at final whole-branch review, because the verification grep was run against the live repo before writing Task 4 as originally scoped.

## Execution Handoff

Executing via **Subagent-Driven Development** (`superpowers:subagent-driven-development`) — fresh subagent per task, task-scoped review + fix-and-re-review loop, followed by a final whole-branch review, matching the pattern already used for records #54 and #55 in this same multi-record `/flow` run. SDD progress/briefs/reports namespaced under `.superpowers/sdd/r56/` to avoid collision with #54/#55's own SDD state. Five tasks total (SKILL.md, docs-health-integration.md, review-console.md, CLAUDE.md, and the 7-file cross-reference sweep) — task order matters for Tasks 1-4 (each consumes the prior task's exact wording), but Task 5 only depends on Task 1's renumbering having landed, so it may run any time after Task 1.
