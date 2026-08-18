---
record: 581
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: 2026-08-16-housekeeping-auto-merge-design:tidy-step-7-5-arm-auto-at-creation-with-an-arm-state-report
blocked-by: [570, 580]
surface: backend
---
# 581: tidy Step 7.5: arm --auto at creation with an arm-state report line

Surface: backend

## Overview

Tidy Step 7.5 opens its housekeeping PR ready (non-draft, `<!-- tidy-housekeeping-pr -->`-stamped) and tears the worktree down — nothing arms `--auto`, even when `housekeeping-auto-merge` resolves `true`. Arming today only happens when a later sweep's `repo-wide` item 9 rediscovers the PR, behind the `pr-unarmed-age-hours` (24h) age gate — so the lever as shipped is a delayed backstop, not "housekeeping PRs land unattended" (#571's incident: PR #567, merged by hand 17 minutes after opening; parent #579). This unit makes Step 7.5 arm its own PR at creation under the grant, stage the arm at `conservative` aggressiveness, and always report the arm state with paste-ready remedies. The sweep row becomes the explicit backstop.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Item 9's scan is untouched — filter, age gate, ungranted-row wording, and both `[pr-unarmed]` flavors stay as they are. Its re-surfacing of a PR whose creation-time staged arm was never approved is intentional backstop behavior, not a defect this unit de-dups (the sweep's `## Arm ready PR` action re-verifies fresh state, its item-9 filter already excludes armed PRs via `autoMergeRequest`, so double-application is structurally impossible; a duplicate staged row across two runs is accepted)
- Non-housekeeping unarmed PRs: `step-6-auto.md`'s anomaly row (already-granted PR the dispatch pipeline failed to arm) keeps its Stage-at-every-tier posture
- `local-merge` and no-`worktree.always` paths: no PR is ever opened there — the lever stays moot, per `tidy/SKILL.md`'s existing statement
- `skills/_shared/pr-first-merge.md` Step 3 stays canonical and behaviorally untouched — the sole edit there is a one-line caller note (see Deliverables) so a future Step 3 editor knows a creation-time variant exists
- Not #558/#560's merge-verification gating — this unit only preserves the shared arm path so that work composes

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #580 | housekeeping-auto-merge: derive the default from the autonomy ceiling | ready (sibling under #579) — native Blocked-by link wired; the attribution mechanic below reads the resolver `source` field that #580 pins |
| #570 | tidy routing: reconcile-converge merged remote-branch deletes; add a routing row for Mark-as-specified | bot:in-progress — edits the same routing rows in `step-6-auto.md`; native Blocked-by link wired. If it stalls, re-check its state at build start and rebase manually on whatever its branch merged |

## Current State

- `skills/tidy/SKILL.md` (~line 203, Step 7.5's `pr-first` branch): pushes the branch, opens/reopens the marker-stamped PR non-draft (reusing `_shared/pr-early-run-lifecycle.md` Steps 1+3), then `ExitWorktree` — never arms; contains the "judgment layer is behind it, not ahead" rationale for opening non-draft
- `skills/tidy/SKILL.md` (~line 209): the lever paragraph — "a green, marker-stamped PR may arm `--auto` at `moderate`+ aggressiveness" via the sweep (`tidy/actions-github-issues.md`'s `## Arm ready PR`); unset, it stages like any other unarmed PR
- `skills/tidy/step-6-auto.md` (~line 23): "Arm ready PR" housekeeping row — Stage at `conservative`, Auto-apply at `moderate`+ under the grant
- `skills/tidy/actions-github-issues.md` `## Arm ready PR`: fresh re-verification then `_shared/pr-first-merge.md` Step 3's degrade chain (`--auto` arm → immediate merge on repos without auto-merge enabled → ready-and-comment)
- A standalone tidy run owns a pipeline run dir (`.claude-tweaks/pipelines/{ts}-tidy-standalone/`) holding `decisions.md` and `staged/` — in the **main checkout**, not the scratch worktree
- `skills/_shared/auto-decision-log.md`: canonical entry schema; lever-attribution field shipped in #535
- `bin/resolve-policy.js` JSON mode returns per-entry `source`; after #580, `source === 'default'` on `housekeeping-auto-merge` means the value was autonomy-derived
- Report-line conventions: every actionable report line carries a paste-ready command on its own line (see #569, related — this unit's new lines comply; neither depends on the other)

## Deliverables

- [ ] Step 7.5 `pr-first` branch: after the PR create/reopen succeeds — and **before `ExitWorktree`** — resolve `housekeeping-auto-merge` and `tidy-aggressiveness` fresh (`bin/resolve-policy.js`, JSON mode, capturing `source`), then route: grant `true` ∧ `moderate`+ → arm now; grant `true` ∧ `conservative` → write a staged arm proposal to the run dir's `staged/`; grant `false` → no action, report line carries it. The fresh resolution is authoritative for this action even if it diverges from what Step 6 resolved earlier in the run (same never-trust-the-snapshot rule as `actions-github-issues.md`'s own re-verify); the freshly resolved values are what the decisions.md entry records
- [ ] Creation-time arm procedure, stated in Step 7.5's text: run `gh pr merge {n} --auto` per `_shared/pr-first-merge.md` Step 3's arm step only — **the rest of Step 3's degrade chain does not apply at creation time**. On any arm failure the outcome is leave-unarmed + report: never immediate-merge (checks are still pending — an immediate merge would land unverified, #540's failure mode), and never ready-and-comment (the PR already opened non-draft; the report line plus the sweep backstop replace the comment). The sweep backstop re-arms once the PR is green and aged
- [ ] One-line caller note added to `_shared/pr-first-merge.md` Step 3 (its only edit): tidy Step 7.5 invokes the arm step at creation time with the degrade chain replaced by leave-unarmed + report
- [ ] `decisions.md` entry per outcome — `armed` / `staged` / `skipped` (grant false) / `arm-unsupported` (repo has auto-merge disabled — the identifiable GraphQL/API rejection, expected repo config) / `arm-failed` (any other failure — transient, auth, network) — per `_shared/auto-decision-log.md`'s schema, with #535's lever-attribution field distinguishing `derived-from-autonomy` (resolver `source === 'default'`) from `explicit` (any other `source`). All run-dir writes (staged proposal + decisions.md) use the absolutely-resolved run-dir path in the main checkout and complete before `ExitWorktree`
- [ ] Report line: Step 7.5's PR line always states arm state and attribution. Literal shapes to include in the skill text: armed — `PR #{n} opened and armed --auto (housekeeping-auto-merge: derived from autonomy: unattended)`; unarmed — `PR #{n} opened, NOT armed — {reason}` followed by two paste-ready lines, each on its own line: `gh pr merge {n} --auto` and the durable policy edit (`housekeeping-auto-merge: true` in `.claude-tweaks/policy.yml`)
- [ ] Reword `tidy/SKILL.md`'s ~line-209 lever paragraph and `step-6-auto.md`'s housekeeping Arm-ready-PR row: creation-time arming is primary, the sweep is the backstop (arm failures, pre-existing PRs, lever flipped after open)

## Acceptance Criteria

1. `grep -n "immediate merge" skills/tidy/SKILL.md` shows Step 7.5's guard sentence excluding both the immediate-merge and ready-and-comment fallbacks at creation time (wording may vary; both exclusions must be explicit)
2. Step 7.5's text names both remedies for the unarmed case as separate paste-ready lines (one-shot arm command, durable policy edit) and contains the literal armed/unarmed report-line shapes (or equivalents preserving state + attribution + own-line commands)
3. `skills/tidy/SKILL.md`'s lever paragraph and `skills/tidy/step-6-auto.md`'s housekeeping row both describe the sweep as backstop to creation-time arming, with no remaining sentence implying the sweep is the only arm path
4. `skills/_shared/pr-first-merge.md`'s diff is exactly the one-line caller note; `skills/_shared/github-pr-scan.md` item 9 has zero edits
5. Step 7.5's text explicitly sequences run-dir writes (staged proposal, decisions.md) before `ExitWorktree`, using an absolute run-dir path
6. `npm test` passes in full (conformance suites pin skill prose repo-wide)

## Technical Approach

All substantive edits are skill prose in `skills/tidy/` — no executable code changes. The routing, guard, logging, and report-line content live in Step 7.5's `pr-first` branch text (`tidy/SKILL.md`), written to the same density and citation style as the surrounding Step 7.5 paragraphs (cite `_shared/pr-first-merge.md` Step 3's arm step and `_shared/auto-decision-log.md`; restate nothing they own). The `step-6-auto.md` row edit is a rewording of the existing row's parenthetical, not a new row. The `pr-first-merge.md` edit is the single caller-note line.

### Key Files

- `skills/tidy/SKILL.md` — Step 7.5 `pr-first` branch (arm routing, guard, run-dir write sequencing, report line) + ~line-209 lever paragraph rewording
- `skills/tidy/step-6-auto.md` — housekeeping Arm-ready-PR row rewording (primary → backstop)
- `skills/_shared/pr-first-merge.md` — one-line caller note in Step 3, nothing else

## Gotchas

- #570 (in progress) is editing `step-6-auto.md`'s routing rows — the native Blocked-by link serializes this; rebase on its merged form before starting
- `skills/tidy/SKILL.md` is a large skill file — check `wc -c` against the repo's skill-size conformance budgets before and after editing (near-ceiling skill files have broken the suite before)
- Run-dir writes from inside a worktree: a bare relative `.claude-tweaks/pipelines/` path silently shadows the main-checkout run dir with a worktree-local copy nobody reads — re-derive the absolute run-dir path at write time (this exact failure is in project memory)
- Worktree-session shell constraint (`_shared/scratch-worktree.md` §7): every new command the text prescribes (resolve-policy read, `gh pr merge --auto`) must be a single plain command per call, matching how the surrounding Step 7.5 text already words its push/create calls
- The arm happens after Step 6's approval/auto-routing has already passed — do not add any new mid-flow prompt; `conservative`'s staging goes through the existing staged/Review Console mechanics, never a fresh AskUserQuestion (auto-mode contract's no-new-mid-flow-stops rule)
- Attribution wording in `decisions.md` must use #535's lever-attribution field format — read `_shared/auto-decision-log.md`'s entry schema rather than inventing a variant

## Decision Rationale

See parent #579's Decision Rationale (arm-at-creation over report-only, creation-time guard, sweep-as-backstop).

<!-- work-fingerprint: 2026-08-16-housekeeping-auto-merge-design:tidy-step-7-5-arm-auto-at-creation-with-an-arm-state-report -->

