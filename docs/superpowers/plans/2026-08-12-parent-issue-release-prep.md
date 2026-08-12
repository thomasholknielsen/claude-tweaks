# Parent-Issue Label Migration + Docs + Release Prep Plan (spec 341)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sweep the living non-skills docs to parent-issue vocabulary, add the adopter-facing CHANGELOG migration entry, run the verified-red negative sweeps, take the minor version bump — and STAGE the live `gh label edit` for execution immediately after the shared branch merges to main (the spec's own gotcha forbids running it before #339/#340 are merged; in this bundled run, merge happens once at the end).

**Architecture:** #339 (contract) and #340 (prose sweep) are already on this branch. Precondition gate checks CONTENT on the branch HEAD (the integration point in a bundled run). Negative sweeps run red-first against the pre-rename tree via checkout-free `git grep <token> bfdf8a77`, then green against the working tree with the documented exclusions plus two run-artifact exclusions (materialized specs under `.claude-tweaks/pipelines/`, the run ledger under `docs/plans/` — both are this run's own audit trail, deleted/archived at close).

**Tech Stack:** Markdown, `gh` CLI (staged), git grep, npm test.

## Global Constraints

- Docs sweep judgment rules identical to #340: rename record-class usages only; keep verbs, "Claude 5 family", "label families", quoted history. Immutable: docs/incident-log.md, docs/decisions/, existing CHANGELOG entries, shipped-versions.tsv history rows.
- Commits `refs #341`, never closing keywords.
- Version: minor bump over origin/main's tip AT PUSH TIME (currently 6.78.0 → 6.79.0); re-verify before the final push (version-must-be-ahead-of-tip); collision fallback: next minor, update CHANGELOG heading, one retry.
- The `gh label edit` is NOT executed in this spec's build — staged to `{run-dir}/staged/` for post-merge execution (spec gotcha: "never before" #339/#340 are merged).

### Task 1: Docs sweep + CHANGELOG + stale-plan removal (implementer)

**Files:** Modify: README.md, docs/getting-started.md, docs/plugin-structure.md, docs/skill-graph.md (re-check — #340 already swept its edges), CHANGELOG.md (new 6.79.0 entry at top). Delete: docs/superpowers/plans/2026-08-07-parent-acceptance-gate.md (consumed plan for shipped work, carries retired tokens — wrap-up convention says consumed plans are deleted; its survival is pre-existing residue).

- [ ] Read each doc whole; sweep per judgment rules. Run `grep -rniE "famil|\bleaf\b|\bleaves\b" docs/ --exclude=incident-log.md --exclude-dir=decisions --exclude-dir=plans --exclude-dir=superpowers --exclude-dir=diagrams` and disposition EVERY hit (the four-file list is the expected result, not the search itself); also fix docs/plugin-structure.md's reference to record-creation.md's renamed "Leaves" section (~line 54) and any journey-file record-class nouns (docs/journeys/).
- [ ] CHANGELOG 6.79.0 entry: the rename; the one-command adopter migration `gh label edit "family:parent" --name "parent-issue"` (literal); the permanent read-side fallback note ([IL-85]); `[family-gate]` report rows are now `[parent-gate]`. Wording precedent: #255's effort→size entry.
- [ ] `git rm docs/superpowers/plans/2026-08-07-parent-acceptance-gate.md`
- [ ] Commit: `Sweep living docs to parent-issue vocabulary and add the 6.79.0 migration entry — refs #341`

### Task 2: Verified-red negative sweeps + version bump (controller)

- [ ] RED first ([IL-105]): for each token in {`family:parent`, `familyParent`, `family-parent`, `familyGateState`, `parseFamilyLeaves`, `[family-gate]`, `Family-Gate`} run checkout-free `git grep -F "<token>" bfdf8a77 -- <same exclusion pathspec>` and record non-zero hits (proves the sweep bites).
- [ ] GREEN: run the spec's literal grep template against the working tree, with the spec's exclusions PLUS `--exclude-dir=pipelines` (materialized spec audit files) and excluding the run ledger `docs/plans/2026-08-12-parent-issue-vocabulary-rename-ledger.md` (run bookkeeping, archived at close) — extensions recorded in decisions.md, per ledger item 3. Zero output per token after the `grep -v IL-85 | grep -v PERMANENT` filter.
- [ ] Confirm model-profiles exclusion is the unrelated sense (one targeted read).
- [ ] Version bump: read `.claude-plugin/plugin.json` (6.78.0 post-merge) → 6.79.0; package.json version if present follows release.js convention (check — do not touch if release.js owns it). Commit: `Bump version to 6.79.0 — parent-issue vocabulary rename (refs #341)`
- [ ] Full `npm test`.

### Task 3: Stage the label edit + AC gate (controller)

- [ ] Precondition gate (content, branch HEAD): `git grep -c "parentGateState" HEAD -- bin/lib/issues/acceptance.js` ≥1 AND `git grep -c "parent-gate" HEAD -- skills/_shared/github-pr-scan.md` ≥1.
- [ ] Stage `{run-dir}/staged/ops-label-edit.md`: the exact command `gh label edit "family:parent" --name "parent-issue" --description "Structure: parent issue — carries the acceptance gate for its sub-issues"`, its post-merge execution point, and its verification (`gh label list` shows parent-issue not family:parent; #338 carries parent-issue).
- [ ] AC3 check: CHANGELOG contains the literal adopter command. AC2: sweeps recorded red+green. AC4: version ahead of tip re-checked at push time (finish step).
