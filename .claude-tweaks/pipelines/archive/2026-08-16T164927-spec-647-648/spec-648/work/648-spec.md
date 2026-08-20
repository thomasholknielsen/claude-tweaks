---
record: 648
origin: capture
ceremony: fast-lane
grants: []
---
# 648: feedback session-evaluation: frontier --unattended can never resolve to Frontier — the judge singleton slot is dead at its only call site

**Related:** #221, #509, #215

Origin: /claude-tweaks:feedback session evaluation (Trust calibration lens), 2026-08-16 session

## Current State

`skills/feedback/session-evaluation.md` ("The judge dispatch", Model paragraph) prescribes `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" frontier --unattended`, annotated as "the contract's standalone-invocation cap for this skill's Frontier singleton, enforced by this skill rather than a run-dir tally." `bin/lib/model-profiles/profiles.js` (lines ~114–120) reads the flag differently: when the resolved profile is `frontier`, `opts.unattended` degrades **unconditionally**, checked before the `frontier-run-cap` branch. Consequence: the judge — `/feedback`'s one Frontier singleton slot (record #221's enumerated list) — can never resolve to Frontier from its only call site. Observed in a fully interactive session (a human typed `/claude-tweaks:feedback`): the resolver returned `{"model":"opus","effort":"high","source":"degraded:unattended"}`. The skill uses `--unattended` to mean "no run-dir tally to consult"; the resolver means "no human is present". `skills/feedback/SKILL.md` Step 6's scrub call passes `capable --unattended` too (harmless there — Capable never degrades on that flag — but the same conflation).

## Deliverables

- [ ] `skills/feedback/session-evaluation.md`: express the singleton cap without `--unattended` — omit the flag (a standalone `/feedback` has no run dir, so `frontierUsed` is 0 and the cap branch passes) and state that `--unattended` is passed only when the invocation is genuinely headless (a scheduled Routine or `claude -p`), resolved from session state, never a literal in skill text.
- [ ] `skills/feedback/SKILL.md` Step 6: same treatment for the scrub call's flag (drop the literal; add the same headless-only rule).
- [ ] `_shared/subagent-output-contract.md` Model Selection: one sentence separating the two meanings — `--frontier-used N` / `--run-dir` express the singleton tally; `--unattended` expresses "no human present" — and naming that a Frontier singleton call site must never hard-code `--unattended`.
- [ ] Sweep: `grep -rn "frontier --unattended" skills/` — every hit is either removed or guarded by a headless-detection sentence; conformance test pins zero unguarded literals.
- [ ] If the intended behavior is instead that the judge never runs at Frontier: delete the Frontier claim from `session-evaluation.md` and #221's enumerated singleton list, and prescribe `capable` directly. (Decide one; the record's default is the first.)

## Acceptance Criteria

1. In an interactive session, the judge's resolver call returns `source` of `default` (or `ceiling`/`cap`) — never `degraded:unattended` — verified by running the prescribed command as written in the updated skill text.
2. `grep -rn "frontier --unattended" skills/` returns no unguarded literal; `npm test` passes.

