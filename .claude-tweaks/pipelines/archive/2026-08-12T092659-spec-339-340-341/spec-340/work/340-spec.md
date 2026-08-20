---
record: 340
origin: human
risk: medium
size: high
ceremony: standard
grants: []
fingerprint: parent-issue-vocabulary-rename:skills-prose-sweep-to-parent-issue-vocabulary
blocked-by: [339]
surface: backend
---
# 340: Skills prose sweep to parent-issue vocabulary

Surface: backend

## Overview

Skill-prose half of the parent-issue vocabulary rename (parent #338): sweep `skills/**/*.md` from family/leaves vocabulary to parent-issue/sub-issue — the scan-scope rename (`family-gate` → `parent-gate`), the report prefix (`[family-gate]` → `[parent-gate]`), the gate's prose name ("Family-Gate Procedure" → "Parent-Gate Procedure", "family gate" → "parent acceptance gate"), the Action Vocabulary row ("Open family gate" → "Open parent gate"), dual-label queries for adopter compatibility, every `node -e` snippet calling the functions the contract leaf renamed, and the member noun ("leaf"/"leaves" → "sub-issue(s)") wherever it names the record class.

This is a read-and-judge sweep, not mechanical replace: "leaves" is an ordinary English verb ("leaves the record in place"), and ~30 files carry ~500 raw case-insensitive hits including false positives.

**Complexity:** High
**Estimated tasks:** 8

## Non-Goals

- No `bin/` edits — the contract leaf (prerequisite) owns code; by the time this leaf builds, `parentGateState`/`parseSubIssues`/`isParentIssue` already exist.
- No live-label migration, no `docs/` (non-skills) edits, no CHANGELOG, no version bump — the release leaf owns those.
- Excluded as immutable history: `docs/incident-log.md`, `docs/decisions/*.md`, CHANGELOG, `docs/shipped-versions.tsv` (never retro-edited).
- Excluded as a different sense of the word: `bin/lib/model-profiles/` and CLAUDE.md's "Claude 5 family"; `_shared/label-bootstrap.md`'s "label families" (label-namespace groups like `risk:*` — same word, different concept).
- The `2026-08-12-parent-issue-vocabulary-rename-design.md` design doc is deleted by /specify itself — not this leaf's concern.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #339 | Contract-layer rename to parent-issue vocabulary | open (blocks this leaf) |

## Current State

**Re-derive this whole file list at build time** — it is a grep-verified snapshot as of 2026-08-12, and files move; the list is the map, not the territory.

- `skills/_shared/work-record.md` — the record-taxonomy home; family:parent in its label table and permission matrix. Update FIRST so every other file cites current vocabulary.
- `skills/_shared/github-pr-scan.md` — `## Scope: family-gate` section (~190 lines), `[family-gate]` output-contract row, severity-table row, `--label family:parent` fetches in both the family-gate and acceptance-gap scopes' leaf-enumeration blocks.
- `skills/tidy/` — `step-1-records.md` (Shape 7 = family-gate's local twin; Shape 1's decomposition-parent exemption prose; Shape 8's leaf-exclusion prose), `scan-procedures.md` (Step 4.8 body + Collection routing `[family-gate]` row), `step-6-auto.md` (Open family gate row — the longest row in the table), `step-6-interactive.md`, `actions-github-issues.md` + `actions-local-files.md` (`## Open family gate` sections), `SKILL.md` (Action Vocabulary row, permission-matrix line, step table).
- `skills/wrap-up/` — `verification-brief.md` (Family-Gate Procedure, the canonical gate procedure both drivers reuse), `SKILL.md`, `execution-and-verification.md`, `review-console.md`.
- `skills/specify/record-creation.md` — `--label family:parent` create calls, the INLINE `LABELS_JSON` copy of label-bootstrap's pair (must end identical to the contract leaf's canonical edit), `facets: { familyParent: true }` in the local-files createRecord snippet, "family"-vocabulary prose throughout; `spec-template.md` (facet table, Parent: line prose); `SKILL.md` (anti-pattern rows "Marking a parent record ready").
- `skills/demo/SKILL.md`, `skills/help/status-scan.md`, `skills/backlog/{refine,overview}-mode.md`, `skills/dispatch/settle-and-merge.md`, `skills/init/{SKILL.md,summary-templates.md,bootstrap/step-17-work-record-backend.md}`, `skills/harness-health/SKILL.md`, `skills/visual-review/SKILL.md`, `skills/_shared/{trust-table,pending-review-durability,design-contract,subagent-output-contract,visual-html-output}.md` — assorted family/leaf mentions (grep-verified list as of 2026-08-12; re-derive at build time, files move).
- `node -e` snippets calling `familyGateState` (tidy step-1 Shape 7 block, github-pr-scan family-gate scope block, wrap-up verification-brief) and `parseFamilyLeaves` (github-pr-scan body-text branches) — these ship inlined into agent prompts, versioned with the plugin.
- **Verified gap (2026-08-12):** the `[legacy]` taxonomy shape is cited in three places (tidy `SKILL.md`'s output-prefix table, `scan-procedures.md`'s routing table + repo-wide note, `step-1-records.md`'s fetch note "the legacy-taxonomy shape below") but **defined nowhere** — `step-1-records.md` contains no such shape. The adopter-nudge deliverable below must close this gap, not cite it.

## Deliverables

- [ ] **Pre-build reconciliation (first, before any edit):** read #339's landed diff and confirm the exported names this leaf's snippets will call (`parentGateState`, `parseSubIssues`, `isParentIssue`, label constant `parent-issue`) match what actually shipped — the names here are asserted from the shared design, not confirmed against a merged diff. Any drift: reconcile this record's snippets to the shipped names before sweeping ([IL-109]).
- [ ] `_shared/work-record.md` updated first: `parent-issue` label, parent-issue/sub-issue vocabulary, permission-matrix rows, retired-vocabulary note for `family:parent`.
- [ ] `_shared/github-pr-scan.md`: scope heading/name `family-gate` → `parent-gate`; `[parent-gate]` prefix in output contract + severity table; every `--label family:parent` fetch becomes a dual fetch — `--label parent-issue` plus a second `--label family:parent` legacy fetch (two calls, never one: gh's repeated `--label` is AND, not OR), **merged on issue number, duplicates dropped** (an issue carrying both labels appears once; the rows are identical so which fetch wins is immaterial — state number-keyed dedup in the merge snippet). Each legacy fetch carries a comment containing `[IL-85]` and `PERMANENT cross-project support`. **Why the dual fetch exists:** this repo's own label migrates atomically via #341's `gh label edit` (every existing issue immediately carries `parent-issue` — no two-label window here); the legacy fetch is for adopter repos that haven't run their own one-command migration yet, and it is permanent for the same reason the read-side facet fallback is. Consumers' scope-name references updated (tidy scan-procedures Step 4.8, tidy SKILL.md data-source table).
- [ ] `skills/tidy/*`: Shape 7/Shape 1/Shape 8 prose, `[parent-gate]` prefix, "Open parent gate" action (Vocabulary table + both `actions-*.md` `## Open parent gate` headings + step-6-auto/interactive rows), `queryRecords({ familyParent: true })` snippet → `{ isParentIssue: true }`, `familyGateState` → `parentGateState` in Shape 7's snippet.
- [ ] Legacy-taxonomy adopter nudge: **define** the `[legacy]` shape in `step-1-records.md` (a minimal retired-label table with `family:parent` as its first entry — finding: `[legacy] {title} — carries retired label {label} — recommend: gh label edit "family:parent" --name "parent-issue"`), closing the verified three-citations-no-definition gap. The retired-label table's own intro sentence must carry `[IL-85]` and "PERMANENT" (e.g. "Retired labels — [IL-85] PERMANENT adopter-compat list; entries removable only at a major version dropping pre-rename repo support:"), which is what satisfies AC2's proximity rule for the table's own `family:parent` literal — without it the shape's finding template fails this record's own acceptance grep by construction.
- [ ] `wrap-up/verification-brief.md` "Family-Gate Procedure" → "Parent-Gate Procedure" + its callers by name (wrap-up SKILL.md, execution-and-verification.md, review-console.md, dispatch/settle-and-merge.md, tidy actions files, github-pr-scan).
- [ ] `specify/record-creation.md`: `--label parent-issue` create calls, inline LABELS_JSON pair identical to label-bootstrap's post-contract-leaf canonical, `facets: { isParentIssue: true }`, prose; `spec-template.md` facet table; `specify/SKILL.md` anti-pattern rows.
- [ ] Remaining files from Current State: family/leaf mentions moved to parent-issue/sub-issue where they name the record class; every `node -e` snippet calls `parentGateState`/`parseSubIssues`/`isParentIssue`.
- [ ] `docs/skill-graph.md` edges checked for gate-name mentions (edit only if an edge names it).

## Acceptance Criteria

1. `grep -rn "family-gate\|Family-Gate\|familyGateState\|parseFamilyLeaves\|familyParent" skills/` returns zero matches (function/scope/procedure names have no legacy-compat exemption in prose — snippets ship with the plugin and rename atomically).
2. `grep -rn "family:parent" skills/` returns only dual-fetch legacy lines and the `[legacy]` shape's own retired-label table entries, each on or immediately adjacent to (same block — the 3-line window is advisory formatting guidance, not the enforced anchor; the enforced pattern is "the legacy literal's own construct carries the marker") an `[IL-85]` or "PERMANENT" comment. Tombstone-scoped grep per spec-template's Delete + Tombstone rule.
3. `grep -rn "\[family-gate\]" skills/` returns zero matches; `grep -rn "\[parent-gate\]" skills/` returns the output-contract row, severity rows, routing rows, and Shape 7's emit lines.
4. The `[legacy]` shape exists in `step-1-records.md` with `family:parent` in its table, and the three citing locations point at it truthfully.
5. `grep -rniE "\bleaf\b|\bleaves\b" skills/` reviewed hit-by-hit: remaining hits are plain-English verb usage or quoted historical text only. Judgment check, not zero-count — the build's review summary (the pipeline ledger / review-summary artifact, which is where "build notes" live) must paste the literal grep hit count AND a per-file disposition line (renamed / verb-usage-kept / quoted-history-kept) so the claim is diffable against the actual grep output, not self-reported prose.
6. `node --test` sync-surface/pin suites pass (tests pin prose fragments — e.g. hooks-gate-coverage, context-cost ceiling; full `npm test` per [IL-120]).

## Technical Approach

Order: work-record.md (taxonomy home) → github-pr-scan.md + tidy (the scan cluster) → wrap-up/demo/specify (the gate cluster) → remaining mentions → verification greps. Dual-label queries: two `gh issue list` calls, merged on issue number with duplicates dropped (see the github-pr-scan deliverable). The 40 KB per-file soft ceiling binds: `github-pr-scan.md` had ~1.7 KB headroom (#204) — the dual-fetch additions must stay lean. **Ceiling fallback (resolved):** if the addition would breach the ceiling, STOP on that file — do not inline past the ceiling and do not perform #204's split inline (it is its own scoped record); leave the scope un-renamed in that file, flag the leaf DONE_WITH_CONCERNS naming #204 as the blocker, and let the pipeline surface it. A partially-renamed scan cluster is detectable by this record's own AC1/AC3 greps, so the stop is loud, not silent.

**On "PERMANENT" vs [IL-85]'s removal-condition rule (resolved):** PERMANENT here is not a missing end date — the removal condition is stated and inherited from the #217 precedent verbatim: "removable only at a major version that drops pre-rename repo support." That is a condition, not a schedule; [IL-85] requires the former, not the latter.

### Key Files

(see Current State — the list is the map; re-derive with `grep -rli "family" skills/` at build time and judge each)

## Gotchas

- Blocked by the contract leaf: building this first leaves prose calling functions that don't exist yet. Both ship in the same release; no aliasing window exists.
- File collisions with open records — re-verify each premise immediately before building ([IL-109]): #325 (`ready`, touches github-pr-scan.md + step-1-records.md, bumps version), #204 (github-pr-scan split proposal), #335 (settle-and-merge.md + review-console.md), #113/#334 (tidy scan/step-6 files), #81 (help/status-scan.md).
- [IL-17]: the same fact recurs reworded — read each file whole; keyword grep alone cannot find a paraphrased "family" claim (e.g. "carries the family's acceptance gate" in a label description).
- [IL-93]: this widens/renames an enforcement-adjacent vocabulary — sweep the prose describing the old reach, don't just rename the mechanism.
- [IL-82]: `step-1-records.md` and `github-pr-scan.md` scope sections are dispatcher-inlined — confirm which region gets inlined before editing; the region boundaries are the scope headings.
- step-6-auto.md's "Open family gate" row is the densest single cell in the repo (~350 words) — rename inside it carefully; it cites `[IL-96]`, wrap-up, both action files, and the auto-mode contract.
- The `+N more` cap discipline and Template A wording inside scan prompts must not be touched — only vocabulary.
- tidy SKILL.md's `--scope` table row `github → 4.8` is scope-*argument* vocabulary, not the gate — the user-facing `--scope=github` argument name does NOT change.


<!-- work-fingerprint: parent-issue-vocabulary-rename:skills-prose-sweep-to-parent-issue-vocabulary -->
