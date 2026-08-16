---
record: 531
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 531: Resuming a parked/pending-review merge outside the Review Console has no AskUserQuestion confirmation gate

Surface: backend

## Current State

When a human resumes a pending-review dispatch run outside the actual Review Console (e.g. replying "merge!" in chat instead of resuming via the parked run's own console), `dispatch/SKILL.md`'s "Resuming a parked run" section just documents re-invoking `/claude-tweaks:flow`'s wrap-up step directly. There is no structured `AskUserQuestion` confirming what is about to be merged before that re-invocation runs — unlike every other decision point in these skills, which follow this project's `AskUserQuestion`-first interaction style (CLAUDE.md's Interaction style directive).

## Deliverables

- Add an `AskUserQuestion` confirmation step before the resume-to-merge path executes, presenting: PR number, CI status, and files changed.
- Wire it into the resume-to-merge path described in `dispatch/SKILL.md`'s "Resuming a parked run" section and/or `wrap-up/review-console.md`, matching the interaction style already used elsewhere in dispatch/wrap-up (single decision → one `AskUserQuestion` call, one option marked Recommended).

## Acceptance Criteria

- Resuming a parked/pending-review run outside the Review Console (via the documented resume command) now renders an `AskUserQuestion` confirmation showing PR number, CI status, and changed files before the merge executes.
- Declining the confirmation stops the resume without merging.
- The confirmation's wording and structure match the existing single-decision `AskUserQuestion` pattern used elsewhere in dispatch/wrap-up.

## Technical Approach

Locate the resume-to-merge instructions in `dispatch/SKILL.md`'s "Resuming a parked run" section (and/or `wrap-up/review-console.md` if the actual merge execution point lives there) and insert an `AskUserQuestion` step immediately before the `/claude-tweaks:flow "{target}" wrap-up` re-invocation, sourcing PR number/CI status/files-changed from the same data the Review Console itself already surfaces.

## Gotchas

- This only affects the resume-outside-the-console path — the normal Review Console flow already has its own confirmation and is unaffected.
- Keep the added question in the "Single decisions → one AskUserQuestion call" style — don't turn this into a multi-step wizard.

## Original request

Resuming a parked/pending-review merge outside the Review Console has no AskUserQuestion confirmation gate

**Related:** none

Context: When a human resumes a pending-review dispatch run outside the actual Review Console (e.g. replying "merge!" in chat), dispatch/wrap-up docs just say to re-invoke /flow's wrap-up step directly -- no structured AskUserQuestion confirming what's being merged, unlike every other decision point in these skills.

Scope: Add an AskUserQuestion confirmation (PR number, CI status, files changed) before the resume-to-merge path runs, matching the interaction style already used elsewhere in dispatch/wrap-up. Likely touches dispatch/SKILL.md's "Resuming a parked run" section and/or wrap-up/review-console.md.
