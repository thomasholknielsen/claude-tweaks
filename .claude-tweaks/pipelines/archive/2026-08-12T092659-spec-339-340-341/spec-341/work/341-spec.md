---
record: 341
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: parent-issue-vocabulary-rename:label-migration-docs-and-release-for-the-parent-issue-rename
blocked-by: [340]
surface: backend
---
# 341: Label migration, docs, and release for the parent-issue rename

Surface: backend

## Overview

Release half of the parent-issue vocabulary rename (parent #338): migrate this repo's live `family:parent` label to `parent-issue` with one atomic command, sweep the living non-skills docs, add the adopter-facing CHANGELOG migration note, run the verified-red negative sweeps, and take the minor version bump. Runs after the contract leaf (#339) and prose-sweep leaf (#340) so it verifies and ships the finished state.

**Complexity:** Low
**Estimated tasks:** 5

## Non-Goals

- No `bin/` or `skills/` edits beyond what a verification-grep failure forces back (a failure here means #339/#340 left residue — fix belongs in a follow-up to those, not silent absorption here, unless it is a one-line miss).
- Immutable history untouched: `docs/incident-log.md`, `docs/decisions/*.md`, existing CHANGELOG entries, `docs/shipped-versions.tsv` history rows.
- No adopter-repo migration beyond the CHANGELOG note — the tidy `[legacy]` nudge (#340) and permanent read fallback (#339) carry adopters.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #339 | Contract-layer rename to parent-issue vocabulary | open (blocks) |
| #340 | Skills prose sweep to parent-issue vocabulary | open (blocks) |

## Current State

- Live labels: `family:parent` exists on this repo (verified via `gh label list`, 2026-08-12), carried by open decomposition parents (#265, #293, #306, #323, #338 among others) and closed ones; the acceptance-gap scope queries it `--state all`, so closed issues matter too.
- `docs/`: README.md, getting-started.md, plugin-structure.md, skill-graph.md carry family/leaf vocabulary in their skill descriptions and artifact-lifecycle text.
- CHANGELOG.md: per-release entries; #255 tracks the analogous `effort:`→`size:` migration note (precedent for wording).
- Version: `.claude-plugin/plugin.json` — read the CURRENT value at build time; concurrent sessions ship frequently (version-collision memory: re-fetch origin/main immediately before push; the number must be ahead of the tip, not merely free).

## Deliverables

- [ ] **Precondition gate (first, before anything else):** verify #339 and #340 actually landed on the integration branch by **content**, not by issue state ([IL-45] — closed ≠ merged, and SHAs rewrite): against origin/main's fetched tip, `git grep -c "parentGateState" origin/main -- bin/lib/issues/acceptance.js` returns ≥1 AND `git grep -c "parent-gate" origin/main -- skills/_shared/github-pr-scan.md` returns ≥1. Either grep zero → STOP; do not run the label edit (a renamed label with un-renamed queries breaks every parent-gate scan in the window).
- [ ] `gh label edit "family:parent" --name "parent-issue" --description "Structure: parent issue — carries the acceptance gate for its sub-issues"` executed on this repo; label state re-queried: `gh label list` shows `parent-issue`, not `family:parent`, and a spot-checked parent (e.g. #338) carries `parent-issue`.
- [ ] Living docs swept: README.md, docs/getting-started.md, docs/plugin-structure.md, docs/skill-graph.md — family/leaves → parent-issue/sub-issue **where the word names the record class** (a decomposition parent, its member records, or the gate); leave untouched: plain-English verb/noun usage ("leaves the record in place"), the model-family sense ("Claude 5 family"), and quoted historical text. Same rule as #340, restated here so this leaf is self-contained. Before closing the deliverable, run `grep -rniE "famil|\bleaf\b|\bleaves\b" docs/ --exclude=incident-log.md --exclude-dir=decisions` and disposition every hit — the four-file list is the expected result, not the search itself.
- [ ] CHANGELOG entry: the rename, the one-command adopter migration (`gh label edit "family:parent" --name "parent-issue"`), the permanent read-side fallback note, and that `[family-gate]` report rows are now `[parent-gate]`.
- [ ] Verified-red negative sweeps — literal command template, one run per token in {`family:parent`, `familyParent`, `family-parent`, `familyGateState`, `parseFamilyLeaves`, `[family-gate]`, `Family-Gate`}:

  ```
  grep -rn --fixed-strings "TOKEN" . \
    --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=tests \
    --exclude-dir=decisions --exclude-dir=model-profiles \
    --exclude=incident-log.md --exclude=CHANGELOG.md --exclude=shipped-versions.tsv \
    | grep -v "IL-85" | grep -v "PERMANENT"
  ```

  Zero output = pass per token. Exclusion rationale: `decisions/`+`incident-log.md`+CHANGELOG+`shipped-versions.tsv` are immutable history; `tests/` holds the legacy-path fixtures (#339's exemption); `model-profiles/` carries the unrelated "Claude 5 model family" sense — confirm that with one targeted read before trusting the exclusion; the trailing `grep -v` pair passes the [IL-85]-commented legacy-compat lines. Each token's sweep must have been confirmed to FAIL against the pre-rename tree first ([IL-105] — a check whose red was never seen proves nothing); record both runs' outputs in the build's review summary.
- [ ] Minor version bump in `.claude-plugin/plugin.json` as its own explicit step ([IL-12]), re-checked against origin/main immediately before push.

## Acceptance Criteria

1. `gh label list --json name -q '.[].name' | grep -c "^parent-issue$"` prints 1 and `grep -c "^family:parent$"` prints 0; `gh issue view 338 --json labels -q '.labels[].name'` includes `parent-issue`.
2. The negative sweep for every listed token, with the stated exclusions, returns zero matches — and the build notes record the pre-rename red run for each ([IL-105]).
3. CHANGELOG's new entry contains the literal adopter command `gh label edit "family:parent" --name "parent-issue"`.
4. `.claude-plugin/plugin.json` version is a minor bump over the value at origin/main's tip at push time (not merely over the value when this leaf started — version-must-be-ahead-of-tip).
5. Full `npm test` passes ([IL-120]).

## Technical Approach

Label edit is one API call and atomic across open+closed issues — never a relabel loop. Docs sweep mirrors #340's read-and-judge discipline. The negative sweeps are the rename's closing gate: run them before the version bump so residue is caught while the tree is still open.

### Key Files

- README.md, docs/getting-started.md, docs/plugin-structure.md, docs/skill-graph.md
- CHANGELOG.md, `.claude-plugin/plugin.json`
- (live GitHub label state — not a file)

## Gotchas

- The label rename is outward-facing and effectively irreversible-in-place (renaming back is possible but churns every watcher) — do it once, after #339/#340 are merged, never before (a renamed label with un-renamed queries breaks every family-gate scan in the window).
- #325 is `ready` and also bumps the version — version-collision hazard; re-check plans and sibling worktree branches before writing a number ([IL-12], version-claimed-at-ship memory). **Collision fallback (resolved):** if the push is rejected or origin/main's tip already carries the chosen number, fetch, re-read `.claude-plugin/plugin.json` at the new tip, take the next minor above it, update the CHANGELOG heading to match, and retry the push once; a second collision → stop and surface rather than looping.
- `docs/shipped-versions.tsv` gains a NEW row at release time as normal — the exclusion covers history rows, not the file's future.
- Release procedure (two repos, marketplace mirror) is `/wrap-up` + `bin/release.js`'s job, not this leaf's — this leaf ends at the bump + green suite; do not run `node bin/release.js` from inside the pipeline.


<!-- work-fingerprint: parent-issue-vocabulary-rename:label-migration-docs-and-release-for-the-parent-issue-rename -->
