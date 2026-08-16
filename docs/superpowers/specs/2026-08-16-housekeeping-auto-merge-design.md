# Housekeeping Auto-Merge — arm at creation, autonomy-derived default

**Record:** #571 · **Date:** 2026-08-16 · **Status:** design approved in brainstorming, awaiting decomposition via `/claude-tweaks:specify`

## Problem

The 2026-08-16 tidy run opened PR #567 — green, non-draft, `<!-- tidy-housekeeping-pr -->`
marker-stamped — and stopped. The operator, running this repo at `autonomy: unattended` with
`auto-mode: default-on`, expected the merge to land unattended; it sat unarmed until merged by
hand 17 minutes later. Two design gaps compound here:

1. **Nothing arms `--auto` at PR creation.** Tidy Step 7.5 opens the PR and tears the worktree
   down. Arming only ever happens when a *later* sweep's `repo-wide` item 9
   (`_shared/github-pr-scan.md`) finds the PR — and item 9's candidate filter has an age gate
   (`pr-unarmed-age-hours`, default 24h). So even with `housekeeping-auto-merge: true`, the
   shipped lever is a delayed backstop, not "tidy PRs land unattended."
2. **The `false` default is self-undermining at high autonomy.** #414 shipped it opt-in to keep
   human eyes on housekeeping merges. But Step 7.5's own text argues the opposite when justifying
   why the PR opens non-draft: "the judgment layer is behind it, not ahead" — Step 6's approval
   (or auto-mode routing under declared policy) already decided the content. An unarmed PR at
   `autonomy: unattended` protects nothing; it strands an already-approved commit.

Rejected alternative: flipping the raw schema default to `true` — blunt (changes behavior for
every marketplace project including attended ones) and, per gap 1, still doesn't deliver prompt
unattended landing.

## Decision

Three coordinated changes: **derive the default from the autonomy ceiling**, **arm at creation**,
and **always report arm state with paste-ready remedies**.

## The lever: autonomy-derived default

`bin/lib/policy-schema.js` drops `housekeeping-auto-merge`'s static `default: false`. When the
key is unset at every precedence rank, resolution derives it from the same pass's resolved
`autonomy` (`_shared/autonomy-ceiling.md`):

| Resolved `autonomy` | Derived `housekeeping-auto-merge` |
|---|---|
| `supervised` (default) | `false` |
| `trusted` | `true` |
| `unattended` | `true` |

An explicit key wins in both directions at any precedence rank (CLI arg > run config > policy) —
`housekeeping-auto-merge: false` at `unattended` stays false. The derivation lives in the
resolution path (`bin/lib/policy-schema.js#resolvePolicyKeys`, same module that already owns
`detectIntegrationModel`), so every consumer that reads through `bin/resolve-policy.js` — item
9's scan, tidy Step 7.5 — inherits it with no per-consumer edits.

Rationale for including `trusted`, not just `unattended`: the ceiling's existing semantics
already let bookkeeping capabilities resolve click-free at `trusted`, and a housekeeping PR is
bookkeeping whose content judgment passed at Step 6.

Docs: `_shared/policy-schema.md`'s row (default column becomes "derived from `autonomy`: `true`
at `trusted`/`unattended`, else `false`"), `_shared/autonomy-ceiling.md`'s consumer list gains
this lever. Blast radius: behavior changes **only** for projects that explicitly declared
`trusted`/`unattended`; the `supervised` default sees nothing — which is why derivation is safe
where a raw default flip wasn't.

## Arm at creation (tidy Step 7.5)

After the `pr-first` branch creates or reopens the marker-stamped PR, Step 7.5 resolves
`housekeeping-auto-merge` and `tidy-aggressiveness` fresh and routes:

| Grant | Aggressiveness | Action |
|---|---|---|
| `true` | `moderate`+ | Arm `--auto` via `_shared/pr-first-merge.md` Step 3, with the creation-time guard below |
| `true` | `conservative` | Stage an arm proposal to the Review Console — mirrors `step-6-auto.md`'s existing Arm-ready-PR tier row |
| `false` | any | Nothing; the report line carries it |

Every outcome logs to the run's `decisions.md` per `_shared/auto-decision-log.md`, with lever
attribution (#535's field) distinguishing *derived-from-autonomy* from *explicit* as the
grant's source.

**Creation-time guard — no immediate-merge fallback.** Step 3's degrade chain includes
"immediate merge on repos without auto-merge enabled." That is safe in the sweep context (item 9
already verified the PR green) but wrong at creation time — checks just started, and an immediate
merge would land unverified, exactly #540's failure mode. Creation-time arming uses Step 3 with
the immediate-merge fallback replaced by **leave unarmed + report**; the sweep backstop picks the
PR up once green and aged. This also keeps the arm path forward-compatible with #558: whatever
merge-verification gating lands in `pr-first-merge.md` applies to housekeeping PRs for free.

**The sweep stays, as backstop.** Item 9 is unchanged behaviorally (derivation reaches it through
`resolve-policy`). `tidy/SKILL.md`'s Step 7 lever paragraph and `step-6-auto.md`'s Arm-ready-PR
housekeeping row are reworded to state the new division: creation-time arming is primary, the
sweep catches stragglers (arm failures, pre-derivation PRs, lever flipped after open).

## Report line

Step 7.5's report line for the opened PR always states arm state and attribution: armed
(`--auto` armed — housekeeping-auto-merge, derived from `autonomy: unattended`) or unarmed with
the reason (lever resolves `false` / staged at `conservative` / arm failed, degrade). Every
unarmed outcome carries paste-ready remedies, each on its own line per the report-line
conventions: the one-shot `gh pr merge {n} --auto` and the durable policy edit. Item 9's
ungranted-row wording is untouched — it already names the lever.

## Out of scope

- Non-housekeeping unarmed PRs — `step-6-auto.md`'s anomaly row (already-granted PR the dispatch
  pipeline failed to arm) keeps its Stage-at-every-tier posture.
- `local-merge` and no-`worktree.always` paths — no PR exists; the lever stays moot there, per
  `tidy/SKILL.md`'s existing statement.
- Flipping the raw schema default (rejected above).
- Changing `pr-unarmed-age-hours` or item 9's candidate filter.
- The merge-verification lever itself (#558) — this design only preserves the shared arm path so
  that work composes.

## Phase 1 — Derived default

`bin/lib/policy-schema.js`: remove the static default, implement the derivation in
`resolvePolicyKeys` (explicit-wins at every rank), update the module's #414 comment.
`_shared/policy-schema.md` row + `_shared/autonomy-ceiling.md` consumer list. Tests in
`tests/policy-schema.test.js`: five-case matrix (unset × three autonomy levels; explicit `false`
at `unattended`; explicit `true` at `supervised`). No consumer behavior change beyond what the
derived value itself flips.

## Phase 2 — Arm at creation + report line

`tidy/SKILL.md` Step 7.5 `pr-first` branch: the routing table above, the creation-time guard,
`decisions.md` logging with lever attribution, and the always-present arm-state report line with
paste-ready remedies. Reword `tidy/SKILL.md`'s Step 7 lever paragraph and `step-6-auto.md`'s
housekeeping Arm-ready-PR row for the primary/backstop division. Update `docs/skill-graph.md`
only if an edge actually changes (none expected — the tidy → `pr-first-merge.md` edge exists).
Closes #571 when it lands with Phase 1.
