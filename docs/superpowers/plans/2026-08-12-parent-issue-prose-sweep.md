# Parent-Issue Skills Prose Sweep Implementation Plan (spec 340)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sweep `skills/**/*.md` from family/leaves vocabulary to parent-issue/sub-issue: scope rename `family-gate` → `parent-gate`, report prefix `[family-gate]` → `[parent-gate]`, "Family-Gate Procedure" → "Parent-Gate Procedure", "Open family gate" → "Open parent gate", dual-label adopter-compat queries, every `node -e` snippet onto the renamed exports (`parentGateState`, `parseSubIssues`, `isParentIssue`), and the member noun leaf/leaves → sub-issue(s) where it names the record class.

**Architecture:** Read-and-judge sweep, clustered by consumer graph: taxonomy home first (`work-record.md`), then the scan cluster (`github-pr-scan.md` + `skills/tidy/*`), then the gate cluster (wrap-up + dispatch), then specify + trust-table, then remaining mentions, then a whole-spec verification gate. The contract layer (#339) already shipped: `parentGateState({leaves, parentLabels})`, `parseSubIssues`, `isParentIssue` facet, `LABELS.PARENT_ISSUE='parent-issue'`, local frontmatter `is-parent-issue:` — confirmed against the built tree (pre-build reconciliation done by the controller; no drift).

**Tech Stack:** Markdown skill prose; verification via grep + `npm test` (prose-pinning suites).

## Global Constraints

- **Judgment rules (every task):** rename family/leaf/leaves ONLY where the word names the record class (a decomposition parent, its member records, or the acceptance gate). KEEP: plain-English verb usage ("leaves the record in place", "leaves it unchanged"), "label families" (label-namespace sense, e.g. `_shared/label-bootstrap.md:73`), "Claude 5 family" (model sense), and quoted historical text (incident quotes, changelog citations).
- Read each assigned file WHOLE before editing ([IL-17] — paraphrased "family" claims like "carries the family's acceptance gate" don't grep).
- Member noun mapping: "leaf"/"leaves" (noun, record class) → "sub-issue"/"sub-issues"; "family" (the group) → the parent issue and its sub-issues (rephrase, e.g. "family gate" → "parent acceptance gate", "the family's parent" → "the parent issue"); "decomposition parent" may stay (it names the parent role, not the retired label).
- Every legacy `family:parent` literal that must remain (dual fetches, the `[legacy]` retired-label table) carries `[IL-85]` and `PERMANENT` in its own construct (same line, same fence, or the table's intro sentence).
- The user-facing `--scope=github` argument name and tidy SKILL.md's `--scope` table row `github → 4.8` do NOT change (scope-argument vocabulary, not the gate). The internal scan-scope NAME `family-gate` DOES change to `parent-gate` everywhere.
- Scan prompts' `+N more` cap discipline and Template A wording must not change — vocabulary only.
- `parentGateState`'s parameter names `{leaves, parentLabels}` are the shipped signature — `node -e` snippets keep passing `{ leaves, parentLabels }` keys; do not "fix" the parameter name in snippets.
- Do NOT edit: `bin/**`, `docs/**` (except the one skill-graph edge check in Task 6), CHANGELOG, version, `docs/incident-log.md`, `docs/decisions/`, `skills/_shared/label-bootstrap.md` (already done by #339), `bin/lib/model-profiles/`.
- Commits: `refs #340` — NEVER `closes`/`fixes`. One commit per task, staging only that task's files.
- Each task ends by running its own verification greps (listed per task) and reporting per-file: raw leaf/leaves hits remaining + disposition (renamed / verb-kept / quoted-history-kept / different-sense-kept) — the controller compiles these into AC5's disposition table.

---

### Task 1: `_shared/work-record.md` — the taxonomy home

**Files:** Modify: `skills/_shared/work-record.md` (8 token hits + assorted family/leaf prose)

**Interfaces:** Produces the canonical vocabulary every later task cites: label `parent-issue` in the Label taxonomy table (with a retired-vocabulary note for `family:parent`), parent-issue/sub-issue phrasing in the permission matrix and prose.

- [ ] Read the file whole. Rename: the `family:parent` label row becomes `parent-issue` (description: "Structure: parent issue — carries the acceptance gate for its sub-issues" — must match label-bootstrap.md's canonical pair, already updated); add a one-line retired-vocabulary note beside it: "Retired name: `family:parent` — [IL-85] PERMANENT read-side support remains for adopter repos; removable only at a major version that drops pre-rename repo support." Sweep permission-matrix rows and prose (decomposition-parent/leaf phrasing → parent-issue/sub-issue per Global Constraints).
- [ ] Verify: `grep -n -iE "famil|\bleaf\b|\bleaves\b" skills/_shared/work-record.md` — every remaining hit is verb/quoted/different-sense or the tombstoned retired-name note; report the disposition list.
- [ ] Commit: `git add skills/_shared/work-record.md` then `git commit -m "Sweep work-record.md taxonomy to parent-issue vocabulary — refs #340"`

### Task 2: `_shared/github-pr-scan.md` — the scan-scope core

**Files:** Modify: `skills/_shared/github-pr-scan.md` (47 token hits; ~190-line `## Scope: family-gate` section; 40 KB soft ceiling — had ~1.7 KB headroom at #204)

**Interfaces:** Produces the scope name `parent-gate` and prefix `[parent-gate]` that Task 3's tidy references cite. Consumes Task 1's vocabulary.

- [ ] Read the file whole; note current byte size (`wc -c`). Region boundaries for dispatcher-inlining are the scope headings ([IL-82]) — confirm which regions get inlined before editing; edits stay inside the same regions.
- [ ] Rename the scope: heading `## Scope: family-gate` → `## Scope: parent-gate`; every `[family-gate]` output-contract/severity/routing row → `[parent-gate]`; prose "family gate" → "parent acceptance gate"; leaf-enumeration prose → sub-issue.
- [ ] Every `--label family:parent` fetch (family-gate scope AND acceptance-gap scope) becomes a dual fetch: one `--label parent-issue` call plus a second `--label family:parent` call (two calls — gh's repeated `--label` is AND, not OR), merged on issue number with duplicates dropped (state number-keyed dedup in the merge snippet; the rows are identical so which fetch wins is immaterial). Each legacy fetch line/block carries a comment with `[IL-85]` and `PERMANENT cross-project support`. Keep the additions lean (ceiling). **Ceiling fallback:** if an edit would push the file past 40 KB, STOP on this file — leave the scope un-renamed there, report DONE_WITH_CONCERNS naming #204 as blocker. Do not split the file yourself.
- [ ] `node -e` snippets: `familyGateState` → `parentGateState`, `parseFamilyLeaves` → `parseSubIssues` (body-text branches); keys `{ leaves, parentLabels }` unchanged.
- [ ] Verify: `grep -n "family-gate\|Family-Gate\|familyGateState\|parseFamilyLeaves" skills/_shared/github-pr-scan.md` → zero. `grep -n "family:parent" skills/_shared/github-pr-scan.md` → only dual-fetch legacy lines, each with `[IL-85]`/`PERMANENT` in the same construct. `wc -c` ≤ 40960. Report leaf/leaves dispositions.
- [ ] Commit: `"Rename family-gate scan scope to parent-gate with dual-label adopter fetches — refs #340"`

### Task 3: `skills/tidy/*` — the scan consumers + the `[legacy]` shape

**Files:** Modify: `skills/tidy/step-1-records.md` (12 hits), `skills/tidy/scan-procedures.md` (7), `skills/tidy/SKILL.md` (4), `skills/tidy/actions-github-issues.md` (5), `skills/tidy/actions-local-files.md` (6), `skills/tidy/step-6-auto.md` (1 + the ~350-word "Open family gate" row), `skills/tidy/step-6-interactive.md`

**Interfaces:** Consumes Task 2's `parent-gate` scope name and `[parent-gate]` prefix. Produces the `## Open parent gate` action headings Task 4's verification-brief references cite, and the `[legacy]` shape definition.

- [ ] Read each file whole. Sweep: Shape 7 (family-gate's local twin — prose + its `node -e` snippet `familyGateState`→`parentGateState`, `queryRecords(..., { familyParent: true })` → `{ isParentIssue: true }`), Shape 1's decomposition-parent exemption prose, Shape 8's leaf-exclusion prose, Step 4.8 body + Collection-routing `[family-gate]` row → `[parent-gate]`, Action Vocabulary row "Open family gate" → "Open parent gate", both `## Open family gate` headings → `## Open parent gate`, step-6-auto's dense row (rename carefully — it cites [IL-96], wrap-up, both action files, the auto-mode contract; verify every cross-reference it names still resolves after rename), step-6-interactive row, SKILL.md permission-matrix line + step table. The `--scope` table row `github → 4.8` stays `github`.
- [ ] **Define the `[legacy]` shape in `step-1-records.md`** (closes the three-citations-no-definition gap): a new minimal shape block with a retired-label table whose intro sentence reads: "Retired labels — [IL-85] PERMANENT adopter-compat list; entries removable only at a major version dropping pre-rename repo support:" with `family:parent` as its first entry, and the finding template: `[legacy] {title} — carries retired label {label} — recommend: gh label edit "family:parent" --name "parent-issue"`. Confirm the three citing locations (tidy SKILL.md output-prefix table, scan-procedures.md routing table + repo-wide note, step-1-records.md fetch note) now point at it truthfully — adjust their wording if they described a shape that didn't exist.
- [ ] Verify: `grep -rn "family-gate\|Family-Gate\|familyGateState\|parseFamilyLeaves\|familyParent" skills/tidy/` → zero. `grep -rn "family:parent" skills/tidy/` → only the `[legacy]` table + its finding template, all under the [IL-85]/PERMANENT intro. `grep -rn "\[parent-gate\]" skills/tidy/` → routing + Shape 7 emit lines present. Report leaf/leaves dispositions per file.
- [ ] Commit: `"Sweep tidy cluster to parent-gate vocabulary and define the [legacy] retired-label shape — refs #340"`

### Task 4: wrap-up + dispatch — the gate cluster

**Files:** Modify: `skills/wrap-up/verification-brief.md` (19 hits, "Family-Gate Procedure" — post-#324 rewrite, re-read whole), `skills/wrap-up/SKILL.md`, `skills/wrap-up/execution-and-verification.md` (2), `skills/wrap-up/review-console.md` (2), `skills/dispatch/settle-and-merge.md` (1)

**Interfaces:** Consumes Task 3's `## Open parent gate` headings (references must match the new heading text). Produces "Parent-Gate Procedure" as the canonical gate-procedure name.

- [ ] Read each file whole. `verification-brief.md`: "Family-Gate Procedure" → "Parent-Gate Procedure" (heading + every in-file reference), "family gate" → "parent acceptance gate", "parent-linked leaves" → "parent-linked sub-issues", `familyGateState({leaves, parentLabels})` → `parentGateState({leaves, parentLabels})` (both the prose mention ~line 164 and the call ~line 225), "Open family gate" action references → "Open parent gate", leaf/leaves noun → sub-issue(s) per Global Constraints. Callers: wrap-up SKILL.md, execution-and-verification.md, review-console.md, settle-and-merge.md — update their references to the procedure and action by the new names.
- [ ] Verify: `grep -rn "family-gate\|Family-Gate\|familyGateState\|parseFamilyLeaves\|familyParent\|family:parent\|family-parent" skills/wrap-up/ skills/dispatch/` → zero. Report leaf/leaves dispositions per file.
- [ ] Commit: `"Rename Family-Gate Procedure to Parent-Gate Procedure across the gate cluster — refs #340"`

### Task 5: specify cluster + trust-table

**Files:** Modify: `skills/specify/record-creation.md` (11 hits), `skills/specify/spec-template.md` (facet table, `Parent:` line prose), `skills/specify/SKILL.md` (anti-pattern rows), `skills/specify/shaping-mode.md`, `skills/_shared/trust-table.md` (18 hits)

**Interfaces:** Consumes Task 1's taxonomy. `record-creation.md`'s inline LABELS_JSON copy must end byte-identical to `skills/_shared/label-bootstrap.md`'s canonical pair: `["parent-issue",      "Structure: parent issue — carries the acceptance gate for its sub-issues"],`.

- [ ] Read each file whole. `record-creation.md`: `--label "family:parent"` create calls → `--label "parent-issue"`; the inline LABELS_JSON pair → identical to label-bootstrap's canonical (verify with a diff of the two fences' shared rows); local-files createRecord snippet `facets: { familyParent: true }` → `{ isParentIssue: true }`; family prose → parent-issue/sub-issue. `spec-template.md`: facet table + `Parent:` line prose. `SKILL.md`: anti-pattern rows ("Marking a parent record ready" etc.). `shaping-mode.md`: sweep per rules. `trust-table.md`: sweep all 18 hits (parent/sub-issue grading vocabulary).
- [ ] Verify: `grep -rn "family-gate\|Family-Gate\|familyGateState\|parseFamilyLeaves\|familyParent\|family:parent\|family-parent" skills/specify/ skills/_shared/trust-table.md` → zero. The two LABELS_JSON `parent-issue` rows are identical: extract both lines and `diff`. Report leaf/leaves dispositions per file.
- [ ] Commit: `"Sweep specify cluster and trust-table to parent-issue vocabulary — refs #340"`

### Task 6: remaining mentions + skill-graph edge check

**Files:** Modify (judge each; some may need no edit): `skills/demo/SKILL.md` (8 hits), `skills/demo/legacy-brief-compatibility.md`, `skills/help/status-scan.md` (1), `skills/backlog/refine-mode.md` (1), `skills/backlog/overview-mode.md` (1), `skills/init/SKILL.md`, `skills/init/summary-templates.md`, `skills/init/bootstrap/step-17-work-record-backend.md`, `skills/harness-health/SKILL.md`, `skills/visual-review/SKILL.md` (1), `skills/_shared/subagent-output-contract.md`, `skills/_shared/pending-review-durability.md`, `skills/_shared/design-contract.md`, `skills/_shared/visual-html-output.md`. Check-only: `docs/skill-graph.md` (edit ONLY if an edge names the gate/scope by the old name).

**Interfaces:** Consumes the renamed vocabulary from Tasks 1-4 (references must match the new names exactly).

- [ ] Read each file whole; rename record-class usages per Global Constraints; every remaining `node -e` snippet calls `parentGateState`/`parseSubIssues`/`isParentIssue`. `demo/SKILL.md` post-#324: re-read fresh, its 8 hits may include the acceptance-gap/parent-gate references. `legacy-brief-compatibility.md`: quoted legacy-brief content is historical — keep quotes, rename only live instruction prose.
- [ ] `docs/skill-graph.md`: `grep -n "family" docs/skill-graph.md` — edit only edges naming the old gate/scope names.
- [ ] Verify: `grep -rn "family-gate\|Family-Gate\|familyGateState\|parseFamilyLeaves\|familyParent" skills/` → zero across ALL of skills/ (this is the whole-sweep AC1 check — earlier clusters are done). `grep -rn "family:parent" skills/` → only Task 2's dual-fetch lines + Task 3's [legacy] table. Report leaf/leaves dispositions per file.
- [ ] Commit: `"Sweep remaining skills prose to parent-issue vocabulary — refs #340"`

### Task 7: Whole-spec verification gate (controller)

- [ ] AC1: `grep -rn "family-gate\|Family-Gate\|familyGateState\|parseFamilyLeaves\|familyParent" skills/` → zero matches.
- [ ] AC2: `grep -rn "family:parent" skills/` → only dual-fetch legacy lines + [legacy] retired-label table entries, each construct carrying `[IL-85]` or `PERMANENT`.
- [ ] AC3: `grep -rn "\[family-gate\]" skills/` → zero; `grep -rn "\[parent-gate\]" skills/` → output-contract row, severity rows, routing rows, Shape 7 emit lines.
- [ ] AC4: the `[legacy]` shape exists in `step-1-records.md` with `family:parent` in its table; the three citing locations point at it truthfully.
- [ ] AC5: `grep -rniE "\bleaf\b|\bleaves\b" skills/` — paste the literal hit count and compile the per-file disposition table (renamed / verb-usage-kept / quoted-history-kept / different-sense-kept) from the per-task reports into the pipeline ledger / review summary.
- [ ] AC6: full `npm test` (prose-pinning suites; [IL-120]).

## Self-Review Notes

- Spec deliverable coverage: pre-build reconciliation → done pre-plan (controller); work-record.md → T1; github-pr-scan → T2; tidy + [legacy] shape → T3; verification-brief + callers → T4; specify + spec-template + SKILL anti-patterns → T5 (trust-table folded here — 18 hits, same taxonomy cluster); remaining files + skill-graph → T6; ACs → T7.
- The plan deliberately prescribes rules + verification per task rather than inline replacement text: the sweep is judgment over ~400 hits in files that moved as recently as v6.78.0 — the live file is the source of truth, per the spec's own "the list is the map" rule.
- Plan-grep self-check: T2/T3 verification greps expect the legacy literals they themselves prescribe (dual fetches, [legacy] table) — the greps are tombstone-scoped to match, not zero-count. No plan text prescribes a raw legacy token outside those constructs.
