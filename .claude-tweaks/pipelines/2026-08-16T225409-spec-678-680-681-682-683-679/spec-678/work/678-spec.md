---
record: 678
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 678: pr-first-merge / flow closure: a merge swept into another session's version bump ships with no CHANGELOG record and nothing notices — add a post-merge "which release carried this" check

Surface: backend

## Current State

- `skills/_shared/pr-first-merge.md` Step 4 ("Post-merge reconcile") runs `node bin/hooks.js reconcile` — mirror ff, claim release, run-dir archive — and nothing else. No step asks *where the merge landed relative to the version history*.
- `docs/releasing.md` already defines the recovery convention: a `### also carried in this build` subsection under a version's CHANGELOG entry documents work a bump swept in without naming. `CHANGELOG.md` has three such subsections today, each hand-written after the fact.
- The version of record is `.claude-plugin/plugin.json#version`; shipped values are recorded in `docs/shipped-versions.tsv` (appended in the same commit as each bump). `tests/changelog-coverage.test.js` checks that every shipped version has a CHANGELOG entry — it does not check that every merged record is named under some version.
- `bin/release.js` performs the bump; its modules live in `bin/lib/release/` (tests under `tests/bin-lib/release/`).
- Observed incident: PR #603 merged to `main` minutes before a sibling session's v6.87.1 patch bump; the bump commit's ancestry swept #603 in, so three records shipped to every install with no CHANGELOG line. Recovery cost ~20 tool calls (worktree, edit, coverage test, PR, CI, merge, teardown) for one paragraph.
- `/claude-tweaks:flow`'s closing report (`skills/flow/summary-template.md`) has no release-status line at all — #680 consumes this record's check for its Next Actions row.

## Deliverables

- [ ] A `bin/` subcommand (suggested: `node bin/release.js status --merge <sha> --records 603,604` — or a sibling `bin/release-status.js`; pick one and register it in `docs/plugin-structure.md`'s CLI list) that, given a merge commit and the record numbers it carried, resolves: (a) the newest commit that changed `.claude-plugin/plugin.json#version` and the version it set; (b) whether the merge commit is an ancestor of that bump commit; (c) whether `CHANGELOG.md` names each record number under that version's heading. Machine-readable output (`--json`) plus a one-line human form: `not yet in a release — bump pending` or `already carried by vX.Y.Z — CHANGELOG backfill needed: #A, #B`.
- [ ] `_shared/pr-first-merge.md` Step 4 invokes the subcommand after reconcile and, on the "already carried" outcome, generates the `### also carried in this build` subsection text (per `docs/releasing.md`'s convention) and **stages** it as a Review Console row (`staged/`, auto-decision-logged) — never writes `CHANGELOG.md` directly from Step 4.
- [ ] `/claude-tweaks:flow`'s closing report gains a release-status line carrying the subcommand's one-line human form verbatim.
- [ ] `docs/releasing.md` documents the check and how the staged backfill row is applied.
- [ ] Tests under `tests/bin-lib/release/` covering both outcomes and the "every record already named" no-op.

## Acceptance Criteria

1. Given a fixture repo where commit M merges records #A,#B and a later commit bumps `plugin.json` version to X with a CHANGELOG entry that omits #A, the subcommand exits 0 and reports `already carried by vX — CHANGELOG backfill needed: #A` (JSON: `{ "shipped": true, "version": "X", "missing": ["A"] }`).
2. Given the same fixture with no bump after M, it reports `not yet in a release — bump pending` (JSON: `{ "shipped": false }`).
3. Given a bump whose CHANGELOG entry names every merged record, it reports shipped with an empty `missing` list, and Step 4 stages nothing.
4. Record numbers are passed explicitly (`--records`) from the run's materialized header / PR closing keywords — the subcommand never guesses them.
5. `pr-first-merge.md` Step 4 shows the invocation and the staged-row path; on the "already carried" outcome a Review Console row exists (not a direct CHANGELOG write) and the auto-decision log carries one entry for it.
6. `skills/flow/summary-template.md` renders the release-status line; `docs/releasing.md` links the subcommand.
7. `npm test` passes; the new tests fail when the ancestry check is inverted.

## Technical Approach

- Ancestry: `git merge-base --is-ancestor <merge> <bump>`. Newest bump commit: walk `git log --format=%H -- .claude-plugin/plugin.json` and take the first commit whose diff changes the `"version"` line (a `plugin.json` edit that doesn't touch `version` is not a bump).
- CHANGELOG lookup: slice from the `## X` heading to the next `## ` heading and grep `#N` tokens.
- Follow `bin/lib/release/`'s module style and injectable git runner (see `tests/bin-lib/release/`); no `gh` needed.
- Staging: reuse the `staged/` + `decisions.md` mechanics in `_shared/auto-decision-log.md` and `_shared/pipeline-run-dir.md`; the row's applied action is a CHANGELOG edit + PR through the normal pr-first path.

### Key Files
- `bin/release.js`, `bin/lib/release/` — new subcommand/module
- `skills/_shared/pr-first-merge.md` — Step 4
- `skills/flow/summary-template.md` — release-status line
- `docs/releasing.md`, `docs/plugin-structure.md`
- `tests/bin-lib/release/`

## Gotchas

- This fixes detection, not prevention. A release-time gate in `bin/release.js` ("every merge since the last bump is named in the summary/CHANGELOG") would prevent the gap at source and is a legitimate companion — build it too, or file it via `/claude-tweaks:capture`; never drop it silently.
- The bump can land in a *sibling* session while this run's PR is being merged (project memory: version collision, re-check after every pause). Read the newest bump commit **after** the merge is confirmed, on a fresh `git fetch`.
- `pr-first-merge.md` Step 4 forbids any `git merge`/`commit`/`push` in the main checkout — the staged row must be applied by a later worktree-based PR, never inline.
- Under `local-merge` (no forge) the same check applies to the local merge commit; don't make the subcommand `gh`-dependent.
- #680 depends on this subcommand's output for its Next Actions row — build #678 first, or in the same run.

## Original request

pr-first-merge / flow closure: a merge swept into another session's version bump ships with no CHANGELOG record and nothing notices — add a post-merge "which release carried this" check

**Summary:** PR #603 merged to `main` minutes before another session's patch bump (v6.87.1) landed and swept it in; no plugin step checks whether a just-merged commit became an ancestor of a version-bump commit, so three records shipped to every install with no CHANGELOG entry until a human went looking.

**Kind:** Gap

**Affected component:** `_shared/pr-first-merge.md` (post-merge), `/claude-tweaks:flow` closing report, `docs/releasing.md`

**Objective:** Automation efficiency

**Use case:** After a pr-first merge the operator needs to know where the work landed: "not yet in a release — bump pending" or "already carried by vX.Y.Z — CHANGELOG backfill needed". Today the recovery is a fully manual "also carried in this build" backfill (worktree, edit, coverage test, PR, CI, merge, teardown — ~20 tool calls for one paragraph).

**Proposed fix:** A `bin/` subcommand run at `pr-first-merge.md` Step 4: given the merge commit, resolve whether it is an ancestor of the newest commit that changed `.claude-plugin/plugin.json#version`; if so and `CHANGELOG.md` names none of the merged record numbers, generate the "also carried in this build" subsection under that version and stage it as a Review Console row (auto-decision-logged); otherwise print "not yet in a release — bump pending" in the closing report.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-8e008cb9 -->


## Architecture alignment (build, Common Step 4.5)

Beneficial deviations applied to this materialized spec so it matches what shipped (auto-applied under `auto`; the two "spec premise was wrong" rows are staged separately at `staged/build-deviation-{1,2}.md`):

- **Carrying release = oldest bump that still contains the merge**, not "the newest commit that changed `version`" (Deliverable 1a/1b). Walking newest→oldest with `--topo-order` and keeping the last bump that has the merge as an ancestor names the release that *first* carried the work; the newest bump is only the answer when it is also the first. `bin/lib/release/status.js` `carryingBump`/`iterBumpCommits`.
- **JSON is a superset of AC 1's shape** — `{ shipped, version, bumpCommit, entryFound, named, missing }` with record numbers as numbers (they arrive numeric from `--records`); `{ shipped: false }` unchanged.
- **Applicability + no-manifest hard-fail** — the subcommand throws (exit 1) when the ref carries no `.claude-plugin/plugin.json`, and Step 4.1 gates on the manifest + `CHANGELOG.md` existing at the ref (`n/a — no plugin manifest at {ref}`); a `pr-first` project without a plugin manifest never gets a false "bump pending".
- **Range notation** — `#A-#B` / `#A-B` in a CHANGELOG entry names every member (capped at 500 per range), so this repo's `#620-#625` style entries do not trigger false backfills.
- **`local-merge`** — Step 4.1 is reachable from the three citing files' own local-merge sections (Gotcha 4), invoked with `--ref {integration-branch}` against the recorded local merge commit.
