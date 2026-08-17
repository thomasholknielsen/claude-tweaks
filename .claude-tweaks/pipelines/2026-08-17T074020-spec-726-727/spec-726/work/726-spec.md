---
record: 726
origin: human
ceremony: standard
grants: []
surface: backend
---
# 726: /challenge: bare-#N evidence-or-accept-risk mode for solution:unjustified records

Defer-reason: tangential

Surface: backend

Origin: wrap-up reflect (hindsight, Approach lens) from #677

## Current State

#471 designed the needs-you lane's remedy for a `solution:unjustified` record as a bare-ref `/claude-tweaks:challenge #N` launcher — a one-step "supply evidence or accept the risk" call. `/claude-tweaks:challenge` has only two input forms today: `framing-check` (component mode, invoked by `/specify`, reads the body the caller holds) and `--lens=<n[,n...]> <#n|topic|problem>` (human-invoked debiasing lens). #677 (rename `framing:baked` → `solution:unjustified`) un-dormanted the lane and shipped the launcher as the runnable proxy `/claude-tweaks:challenge --lens=1 #N` (Lens 1, Surface Hidden Assumptions), whose Next Actions route to `/claude-tweaks:specify #N` to re-run `framing-check` and clear the label on an `open` verdict. Sites carrying the proxy: `skills/backlog/overview-mode.md` (needs-you launcher bullet + the caveat paragraph that names this record's remedy as future work), `skills/backlog/refine-lanes.md` (Needs-you launcher), `skills/backlog/SKILL.md` (Next Actions option 1), `docs/skill-graph.md` rows for `/challenge`↔`/backlog`, and the two backlog journeys.

The proxy works but is not the designed remedy: nothing reads the record's `## Gotchas` assumption bullets, searches the repo for evidence per assumption, and lets the human record "evidence supplied" or "risk accepted" in one step.

## Deliverables

- [ ] `skills/challenge/SKILL.md`: a third, human-invoked input form — a bare `#N` record reference — that (1) fetches the record per `work-backend` (same resolution `--lens` already uses), (2) reads the `## Gotchas` assumption bullets `framing-check` wrote, (3) runs a bounded in-repo evidence search per assumption (grep/read, no subagents, capped), (4) renders the findings and offers the one-line call via `AskUserQuestion`: **supply evidence** (append the evidence to the record body under `## Gotchas`, remove `solution:unjustified` — and its pre-rename spelling if present) or **accept the risk** (post a comment stating the acceptance, remove the label) or **leave it**. Component-Skill Contract: human-only, always renders Next Actions.
- [ ] `docs/skill-graph.md`: the `/challenge`↔`/backlog` reciprocal rows describe the bare-`#N` form as live; `skills/help/reference-card.md` and `docs/getting-started.md`'s `/challenge` entries name the third form.
- [ ] Flip the launcher sites back from `--lens=1 #N` to `#N`: `skills/backlog/overview-mode.md` (bullet + retire the caveat paragraph that defers to this record), `skills/backlog/refine-lanes.md`, `skills/backlog/SKILL.md`, `docs/journeys/triage-backlog-via-funnel-overview.md`, `docs/journeys/refine-the-backlog-through-decision-lanes.md`.
- [ ] Tests: any conformance pin on the launcher form (grep `tests/` for `--lens=1 #`) updated; a prose pin that `skills/challenge/SKILL.md`'s Input section names three forms.

## Acceptance Criteria

1. `/claude-tweaks:challenge #N` on a record carrying `solution:unjustified` renders the assumption list with per-assumption evidence findings and one `AskUserQuestion` offering supply-evidence / accept-risk / leave; choosing either resolving option removes the label (and posts the comment on accept) — verified against a throwaway issue.
2. `grep -rn 'challenge --lens=1 #' skills docs` returns nothing; every needs-you launcher reads `/claude-tweaks:challenge #N`.
3. `npm test` green.

## Technical Approach

Add the mode beside `--lens` in `skills/challenge/SKILL.md`'s Input/Mode sections; reuse `_shared/work-record-config.md`'s backend resolution and the label-edit shape `skills/specify/shaping-mode.md` already documents for removing the label. Keep the evidence search bounded (one pass, named caps) — this is not #175's verification subsystem.

## Gotchas

- Do not re-add a hard gate: `solution:unjustified` stays non-gating (#471's decision); this mode is the remedy surface, not a gate.
- The pre-rename spelling `framing:baked` is still readable on adopter repos — the remove step should strip either spelling.

