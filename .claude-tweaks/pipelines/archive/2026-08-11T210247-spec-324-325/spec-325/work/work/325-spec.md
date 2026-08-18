---
record: 325
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: 2026-08-11-demo-observation-plan-design:sweep-retired-ask-first-demo-prose-verify-skill-graph-edges
blocked-by: [324]
surface: backend
---
# 325: Sweep retired ask-first demo prose, verify skill-graph edges, bump version

Surface: backend

## Overview

The sibling leaf (#324) retires the Verification Brief's `### See it yourself (optional)` / `### Verify it yourself (manual)` section pair and `/claude-tweaks:demo`'s ask-first walkthrough, editing only its own Key Files. This leaf closes the loop everywhere else: verify #324 actually landed, sweep the rest of the repo for prose that still describes the retired shape, verify the skill-graph edges and top-level docs against the new flow, and bump the plugin version. Widening or retiring a mechanism owes a sweep of the prose describing its old reach — and because keyword search can't catch reworded descriptions, the literal sweep is paired with a full read of the enumerated describer files.

**Complexity:** Low
**Estimated tasks:** 5

## Non-Goals

- No re-editing of #324's files beyond fixing a stale reference the sweep finds that it missed
- No backfill of already-posted briefs on GitHub records
- No edits to `docs/incident-log.md`, `.claude-tweaks/pipelines/archive/`, or `docs/shipped-versions.tsv` — historical records legitimately describe the old shape
- No `bin/lib/issues/acceptance.js` changes — the classifier and its tidy-sweep consumers are out of scope here (#324 already corrected its header comment)

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #324 | Observation-plan briefs: wrap-up authors the surface plan, /demo walks it show-first | must be merged into this leaf's build base before the first task — verified by content (Deliverable 1), not by label |

## Current State

- Known candidate referencers (verified 2026-08-11 by grep, before #324 lands — Deliverable 1 re-verifies against its actual landed diff): `skills/_shared/github-pr-scan.md` and `skills/tidy/step-1-records.md` cite the `verificationSurface` *classifier* (which is unchanged) — check whether their prose also describes the brief's retired section pair; `skills/_shared/design-contract.md` describes demo's Step 2 rendering; `skills/help/*.md` and `README.md` carry workflow/lifecycle descriptions that may narrate the ask-first flow; `docs/skill-graph.md` holds the demo↔wrap-up and demo↔browse edges.
- #324 also creates `skills/_shared/observation-plan.md`, a new sub-file that `docs/plugin-structure.md`'s table must list.
- `docs/skill-graph.md` is also named in the Key Files of open records #276, #221, #220, #179 — unrelated content, but merge `origin/main` immediately before editing it.
- Recursive `grep -r` honors `.gitignore` in this repo, silently skipping run dirs and local state — a clean sweep from it proves nothing.
- Version state: 6.76.0 shipped at `origin/main` as of 2026-08-11; concurrent sessions ship frequently, so the number is computed at ship time, never reserved. #324 deliberately carries no version bump — this leaf owns the family's single minor bump.

## Deliverables

- [ ] **Precondition — verify #324 landed, then derive the sweep from its diff.** Confirm by content that #324 is merged into this leaf's build base: `grep -c '### Observation plan' skills/wrap-up/verification-brief.md` ≥ 1 and the retired headings absent from that file's Step 4 template. Then read #324's actual merged diff (`git log --grep` for its closing commit, or the merge on the default branch) to extract: the exact retired-heading survivors it deliberately kept (its compatibility branch states its own exemption inline — cite that text, do not guess), and any sub-file extraction it performed. The sweep's patterns and exemption list come from this landed diff, never from this record's predictions alone. If the content check fails, stop — the blocked-by link was bypassed.
- [ ] Case-insensitive repo-wide **literal sweep** for the retired shape — the section headings ("See it yourself", "Verify it yourself"), the live-vs-steps question text ("Open a live session and show you"), and ask-first walkthrough phrases — over markdown and JS sources: `find . -type f \( -name "*.md" -o -name "*.js" \) -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./evals/node_modules/*" | xargs grep -il {pattern}` (not bare `grep -r`), with a planted-token positive control proving the pipeline finds matches under gitignored paths. Every hit fixed, or accepted with a stated reason (expected survivors: #324's self-declared compatibility exemption, `docs/incident-log.md`, pipeline archives).
- [ ] **Reworded-prose read pass** (literal grep can't catch paraphrase): read in full — `docs/skill-graph.md`'s demo↔wrap-up and demo↔browse edges, `README.md`'s lifecycle/workflow prose, `skills/help/*.md`'s diagrams and stage descriptions, `skills/_shared/design-contract.md`, `skills/_shared/github-pr-scan.md`, and `skills/tidy/step-1-records.md` — fixing any description of the ask-first flow regardless of wording. Where prose partially describes the old flow, rewrite by reference to `skills/demo/SKILL.md` rather than restating the procedure; never restate list cardinalities as literals.
- [ ] `docs/plugin-structure.md`: sub-file table updated for `skills/_shared/observation-plan.md` and any further extraction #324's landed diff shows.
- [ ] Minor version bump in `.claude-plugin/plugin.json`, computed immediately before push: fetch origin, read the tip's version and `docs/shipped-versions.tsv`, check sibling worktree branches (`git worktree list --porcelain`) for unshipped bumps, and pick the next minor strictly ahead of the tip.

## Acceptance Criteria

1. The literal sweep reports zero unaccounted hits: every remaining occurrence of the retired headings/phrases outside #324's own files is enumerated in the run's summary with its acceptance reason. Presence alone is not staleness — each survivor is judged for topic-consistency, not matched against an expect-no-output grep. The zero-unaccounted claim is explicitly scoped to literal matches; reworded descriptions are covered by criterion 3.
2. The positive control ran: a planted token in a scratch file under a gitignored path is found by the `find`+`xargs` pipeline (proving it bypasses `.gitignore`) and the scratch file is removed afterward.
3. The read pass covered every file the Deliverables enumerate, and the run's summary states per file either "consistent with show-first" or what was changed.
4. `.claude-plugin/plugin.json`'s version is strictly greater than the version at `origin/main`'s tip at push time, verified by a fetch immediately before the push, not by the local checkout's state.
5. `npm test` passes in full.

## Technical Approach

Mechanical consistency pass — no behavioral decisions. The one judgment call per hit is topic-consistency: does this sentence describe the current show-first flow or the retired ask-first one?

### Key Files

- `docs/skill-graph.md` — demo/wrap-up/browse edge text (verify; modify only if stale)
- `README.md`, `skills/help/*.md` — lifecycle/workflow prose (verify; modify only if stale)
- `skills/_shared/design-contract.md`, `skills/_shared/github-pr-scan.md`, `skills/tidy/step-1-records.md` — read pass (modify only if stale)
- `docs/plugin-structure.md` — sub-file table
- `.claude-plugin/plugin.json` — minor version bump
- Any additional prose file the sweep surfaces (small edits; enumerate in the summary)

### Package Dependencies

None.

## Gotchas

- Use `find`+`xargs` with a control grep, never bare recursive grep — gitignored files audit as clean otherwise.
- Anchor sweep exclusions to the path position (`grep -v "^./docs/incident-log.md"` against `find` output), never as bare content substrings — a substring exclusion drops real hits whose content mentions the path.
- Do not write the sweep as an expect-no-output check — after #324, the new section name is legitimate content everywhere, and the compatibility branch legitimately names the old ones. Verify topic-consistency per hit.
- The version pre-check's visible sources (branches, plans, `git log origin/main`) are incomplete — an executed bump on unpushed local `main` is invisible to all three; check `git worktree list --porcelain` siblings too, and re-fetch right before push.
- A skipped version number passes every "is it claimed" check while moving `plugin.json` backwards relative to the tip — the bump must be ahead of the tip, not merely unclaimed.
- Merge `origin/main` into the worktree immediately before editing `docs/skill-graph.md` — four open records also name it.

<!-- work-fingerprint: 2026-08-11-demo-observation-plan-design:sweep-retired-ask-first-demo-prose-verify-skill-graph-edges -->

