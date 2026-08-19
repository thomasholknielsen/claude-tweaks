---
record: 862
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
---
# 862: Rotate the Claude Code OAuth credential exposed to a local probe transcript

Origin: wrap-up of #418 (ops acknowledgment)
Defer-reason: requires-signoff

## Current State

During #418's Probe 1, a subagent ran `security find-generic-password -s "Claude Code-credentials" -g`, printing the live Claude Code OAuth access+refresh tokens into its local transcript file under the session temp dir. Nothing left the machine and the tokens were not reused — but the credential should be rotated and the transcript purged.

## Deliverables

- Sign out and back in to Claude Code (`/logout` then `/login`) to rotate the OAuth credential.
- Delete the transcript file (path recorded in the #418 run's ledger/archive) or let the temp dir cycle.

## Acceptance Criteria

- The pre-rotation refresh token no longer works (rotation confirmed by a fresh login).

_Filed by `wrap-up` via specShapedBody._

