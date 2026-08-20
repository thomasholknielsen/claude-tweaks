---
record: 827
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build]
---
# 827: docs/skill-authoring.md: the paste-ready report-line convention only documents the producer side

Origin: session evaluation of this /claude-tweaks:feedback bare-invocation run (self-reference routed the finding to local records)

Defer-reason: tangential

## Current State

`docs/skill-authoring.md`'s Skill handoffs convention documents how a skill should render report lines — one paste-ready fully-qualified command per line, no inline comments, recommended option bolded — but says nothing about how the assistant should interpret a user's own message when it consists of exactly such a line, pasted back. Observed live in this session: the user's opening message was `- /claude-tweaks:specify #763 — needs:definition — waiting ~9h; deciding releases nothing tracked (...)` — a report row copied from an earlier dashboard-style listing — and it was read as passive session context rather than an invocation request, producing a "No task was included in your message" reply. The user then had to retype the same content as an explicit `/claude-tweaks:specify #763` slash command to get the work started.

## Deliverables

- [ ] Add a line to `docs/skill-authoring.md`'s Skill handoffs / report-line convention stating the consumer-side half: a user message that opens with (or consists of) a fully-qualified report row in the `- /claude-tweaks:{skill} {ref} — ...` shape is an invocation request for that command, not background context, even when no leading slash-command marker is present.

## Acceptance Criteria

1. `docs/skill-authoring.md` documents the consumer-side reading rule alongside the existing producer-side convention.
2. `npm test` passes (any conformance tests over this doc's prose remain green).

## Technical Approach

A short addition adjacent to the existing "report lines must carry runnable commands" convention text.

## Gotchas

This is a behavioral instruction for the assistant reading a user's pasted text — it belongs in whichever doc other report-line behavior already lives, to keep the contract in one place rather than splitting it.

_Filed by `capture` via specShapedBody._
