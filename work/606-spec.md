---
record: 606
origin: human
risk: low
size: low
ceremony: standard
grants: [build]
surface: backend
---
# 606: specify: lever-adding specs cite the lever checklist; third-party-behavior deliverables get a blocking empirical Task 0

Surface: backend

Origin: /claude-tweaks:flow run 2026-08-16T101528-spec-559-560 — learnings staged by /review (spec 559) and batch reflect (reflect-3), routed as a project-skill change to /claude-tweaks:specify

## Current State

Two spec-authoring gaps surfaced by a single flow run, both caught only at whole-branch review after every task-level review missed them:

1. #559's Deliverables named only `skills/flow/manifesto.md`'s lever row, but `_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist has five items (bookend list, flow/SKILL.md Step 3 sentence, help/reference-card.md, help/context-flow.md, enforcement files) — three were missed. `/specify`'s spec template gives no reader a reason to go look for that checklist.
2. #560's spec had a blocking empirical Task 0 (probe PR against a throwaway base, mandatory teardown, literal captures) that reversed the plan's core premise (`gh pr merge --auto` merges immediately on unprotected repos) — a shape `/specify`'s template doesn't currently name as an option, so it gets rediscovered per-record rather than chosen deliberately.

## Deliverables

- `skills/specify/spec-template.md` (Deliverables guidance): (a) a lever-adding record's Deliverables guidance cites `_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist by reference; (b) a Deliverable that encodes third-party CLI/API behavior gets a named option: a blocking empirical Task 0 with a safe probe target + teardown + literal-capture rule.
- `skills/specify/SKILL.md` if the template guidance is referenced there; keep sizes under 40 KB.

## Acceptance Criteria

- A spec authored for a lever-adding record, following the updated template guidance, references `_shared/auto-mode-contract.md`'s checklist rather than restating or omitting it.
- The template names the blocking-empirical-Task-0 shape as a deliberate option for third-party-behavior deliverables.
- `npm test` green.

## Technical Approach

Add the two guidance additions to `skills/specify/spec-template.md`'s Deliverables section: a short pointer sentence for the lever-checklist case, and a named pattern (with the Task 0 shape's constituent parts: safe probe target, mandatory teardown, literal-capture rule) for the third-party-behavior case. Check whether `skills/specify/SKILL.md` needs its own cross-reference, and re-measure `wc -c` on both files before committing given the plugin's byte-ceiling convention on skill files.

### Key Files

- `plugin/skills/specify/spec-template.md`
- `plugin/skills/specify/SKILL.md`

## Gotchas

- Keep both additions to guidance/reference only — this record does not itself add a new Manifesto lever or rewrite `_shared/auto-mode-contract.md`'s checklist, it just makes `/specify`'s template surface it.
- Watch the byte ceiling on whichever skill file is edited; re-measure before committing.

## Original request

specify: lever-adding specs cite the lever checklist; third-party-behavior deliverables get a blocking empirical Task 0

Origin: /claude-tweaks:flow run 2026-08-16T101528-spec-559-560 — learnings staged by /review (spec 559) and batch reflect (reflect-3), routed as a project-skill change to /claude-tweaks:specify

## Two spec-authoring gaps this run exposed

1. **A spec that adds a Manifesto lever must cite the lever-addition checklist.** #559's Deliverables named only `skills/flow/manifesto.md`'s lever row; `_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist has five items (bookend list, flow/SKILL.md Step 3 sentence, help/reference-card.md, help/context-flow.md, enforcement files) — three were missed by every task-level review and caught only at whole-branch review, exactly the failure that checklist's own text warns about. `/specify`'s spec template should make a lever-adding record carry that checklist by reference in Deliverables.
2. **A Deliverable that encodes third-party CLI/API behavior gets a blocking empirical Task 0.** #560's spec did (probe PR against a throwaway base, mandatory teardown, literal captures) and it reversed the plan's core premise (`gh pr merge --auto` merges immediately on unprotected repos). Make that shape a named option in `/specify`'s template guidance so it is chosen deliberately, not rediscovered.

## Scope

- `skills/specify/spec-template.md` (Deliverables guidance): (a) lever-adding records cite `_shared/auto-mode-contract.md`'s checklist; (b) third-party-behavior deliverables get a blocking empirical Task 0 with a safe probe target + teardown + literal-capture rule.
- `skills/specify/SKILL.md` if the template guidance is referenced there; keep sizes under 40 KB.
- Companion memory (staged separately at the same console): empirical-premise-check-before-contract-text.

