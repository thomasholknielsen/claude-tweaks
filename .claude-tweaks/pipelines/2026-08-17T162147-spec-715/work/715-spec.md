---
record: 715
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 715: Merge authorization at unattended: Manifesto-time lever, or one-click Recommended at the terminal summary?

Surface: backend

## Current State

A run with `merge-verification: merge-when-green` (derived), `autonomy: unattended`, every HARD-GATE green, and a just-proven full suite still ended with "the merge is yours" prose — the human's entire contribution was the four-word turn "merge PR #634", and the wait cost a 22-commit catch-up merge plus a third full-suite run before the merge could land. No `auto:merge` grants existed on the records (correct per the permission model), but nothing let the human pre-authorize the merge at run start, when they were already present.

## Deliverables

- [ ] Add a merge-authorization lever to the Pipeline Config Manifesto (e.g. `merge-when-green: yes/no`) letting the human pre-authorize "merge automatically once every HARD-GATE is green and the full suite has just passed," answered interactively at run start
- [ ] When pre-authorized, the finishing step (`/superpowers:finishing-a-development-branch` / `design-wrapper` merge step, whichever owns the actual `gh pr merge` call) executes the merge automatically as soon as the last HARD-GATE clears, and logs the auto-resolution per `_shared/auto-decision-log.md`
- [ ] When declined or left unanswered at Manifesto time, the terminal Wrap-Up Review Console offers a one-click Recommended `AskUserQuestion` merge option instead, so the just-proven green state is still current when the merge lands
- [ ] Update `_shared/auto-mode-contract.md` and `_shared/autonomy-ceiling.md` to document both paths and make explicit that a Manifesto-time answer is a live, interactive human grant — not a headless auto-grant — so the existing `auto:*` invariant (interactive-human-only grants) is preserved under both paths

## Acceptance Criteria

- [ ] A merge-authorization lever appears in the Pipeline Config Manifesto's structured numbered-options block, with a stated default
- [ ] Answering yes at Manifesto time results in the run merging automatically once every HARD-GATE is green and the suite is proven, with zero further human clicks, and a `decisions.md` entry recording the auto-merge
- [ ] Declining (or not answering) at Manifesto time results in the terminal Review Console presenting a one-click Recommended merge option instead of silent no-op prose
- [ ] `_shared/auto-mode-contract.md` states explicitly that both paths preserve the interactive-human-only `auto:*` grant invariant
- [ ] Runs in `confirm`/`interactive`/`hybrid` mode are unaffected by this lever

## Technical Approach

Likely touch points: the Pipeline Config Manifesto's option set (wherever it's assembled — `/claude-tweaks:flow` and/or `design-wrapper`), the finishing/merge step that currently emits "the merge is yours" prose, `_shared/auto-decision-log.md` (new decision-log entry shape for an auto-merge), `_shared/autonomy-ceiling.md`'s bookkeeping-capability list, and the Wrap-Up Review Console's existing one-click `AskUserQuestion` pattern (reuse rather than invent a second mechanism).

## Gotchas

- The interactive-human-only invariant must hold on both paths: a Manifesto-time "yes" is fine because it's a live answer at run start, but this must never become a project-policy default that answers itself — that would be a non-interactive auto-grant, exactly what the invariant exists to prevent.
- Even in the pre-authorized path, the green state can still decay if anything delays the interval between the last HARD-GATE clearing and the merge call executing — merge as close to that boundary as possible, don't batch it behind other terminal-step work.
- Don't build two independent merge-execution code paths for the Manifesto-authorized and terminal-click cases — both should call the same underlying merge action, differing only in what triggers it and whether a click is shown.

## Original request

Merge authorization at unattended: Manifesto-time lever, or one-click Recommended at the terminal summary?

Origin: session evaluation of the #620-#625 /flow run (via /claude-tweaks:feedback; self-reference routed the findings to local records)

Defer-reason: needs-human-decision

## Current State

A run with `merge-verification: merge-when-green` (derived), `autonomy: unattended`, every HARD-GATE green, and a just-proven full suite still ended with "the merge is yours" prose — the human's entire contribution was the four-word turn "merge PR #634", and the wait cost a 22-commit catch-up merge plus a third full-suite run before the merge could land. No `auto:merge` grants existed on the records (correct per the permission model), but nothing let the human pre-authorize the merge at run start, when they were already present.

## Deliverables

- [ ] Decide and implement one road (or both): (a) surface the merge grant as a Pipeline Config Manifesto lever at run start — "merge it yourself when green" expressible in one up-front answer; (b) the terminal summary offers merge as a one-click Recommended `AskUserQuestion` option so the just-proven green state is still current when the merge lands

## Open Question

Open choice: pre-authorization at the Manifesto (a run-start lever, human present, zero drift risk but authorizes before the diff exists) vs a one-click Recommended merge at the terminal summary (human sees the finished state but the suite's freshness decays while they read) — or both, with the lever gating whether the summary click is even needed. The permission model's auto:* invariant (interactive-human-only grants) must survive either road.

_Filed by `capture` via specShapedBody._
