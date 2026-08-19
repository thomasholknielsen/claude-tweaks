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

## Blocked / Future Work

Both Deliverables are operational, not code-level — there is no source diff for this record.

- **Credential rotation** (`/logout` then `/login`) requires an interactive human OAuth flow — an
  autonomous agent cannot drive it, and this session must not log its own credential out from
  within itself. Seeded to the ledger as `build/ops` item #1
  (`docs/plans/2026-08-19-record-862-ledger.md`), `reason-not-auto: requires-signoff`. Unblocks
  when a human runs `/logout` then `/login` and confirms the pre-rotation refresh token no longer
  works.
- **Transcript deletion**: searched this repo's archived `#418` run artifacts
  (`.claude-tweaks/pipelines/2026-08-17T150123-spec-418/work/probe-1-findings.md`) for the specific
  transcript path the record's Deliverables text claims is "recorded in the #418 run's
  ledger/archive" — no concrete path is recorded there; that run's own findings state the tokens
  "were not written to any file" (they appeared only in the agent's own Claude Code session
  transcript, not a file the probe created). With no locatable path, and the Deliverables line
  offering an explicit alternative ("or let the temp dir cycle"), this half of the deliverable is
  satisfied by that alternative — no ledger item needed, nothing further to do here.

