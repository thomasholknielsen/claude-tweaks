---
record: 803
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 803: session-start unfinished-runs banner has no designated consumer

Surface: backend

## Current State

The SessionStart hook already surfaces an unfinished-pipeline-runs banner (a `claude-tweaks: unfinished pipeline run(s) detected under .claude-tweaks/pipelines/:` block naming each run dir and a ready-made `close-run` command) when unfinished runs exist. Nothing in the banner, or anywhere else, assigns a consumer the job of acting on it. A `/feedback` session evaluation (2026-08-17) found a live case: the banner surfaced 3 unfinished pipeline run dirs, and the session neither triaged them nor relayed the list to the user — 0 of 3 were mentioned. Related: #743.

## Deliverables

- Give the banner a defined consumer, via one of:
  1. Instruct the model to relay the list once, in its first reply, as one line carrying the ready-made `close-run` command per stale run — no triage, just visibility.
  2. Route stale-run cleanup into `/tidy`'s suggestion surface instead, so a human-invoked sweep picks up unfinished runs as part of its normal report rather than relying on the model to self-prompt from a SessionStart banner.

## Acceptance Criteria

- The chosen consumer path is documented at the point the banner is emitted (or in the skill/doc governing session-start behavior), naming explicitly who acts on the banner and when.
- A session that receives the banner (chosen path 1) relays the run list in its first reply, or (chosen path 2) the stale runs appear in `/tidy`'s next suggestion surface — whichever path is chosen is independently verifiable, not just asserted.
- `npm test` green if the chosen path touches tested code (`/tidy`'s scan procedures, or session-start prompt-shaping logic).

## Technical Approach

Two independent implementation paths exist for this record's Deliverable — pick one rather than building both. Path 1 (banner relay) is the lighter touch: add an explicit instruction to the session-start prompt-shaping logic (or the harness-facing guidance that governs how a model should react to a SessionStart banner) telling the model to relay the unfinished-run list once, in its first reply, one line per run with its `close-run` command. Path 2 (route into `/tidy`) is heavier but more durable: extend `/tidy`'s scan procedures to independently detect the same unfinished-run condition the SessionStart banner already detects, and surface it in `/tidy`'s own suggestion output, so the banner's information reaches a human even when no session happens to relay it. Either path closes the "banner has no consumer" gap; Path 2 also covers the case where a session never gets asked anything and the banner scrolls by unread.

### Key Files

- `plugin/bin/lib/hooks/session-start.js` (or wherever the unfinished-runs banner is emitted) — Path 1's instruction addition
- `plugin/skills/tidy/scan-procedures.md` — Path 2's new detection + suggestion-surface entry
- `tests/` — coverage for whichever path is chosen

## Gotchas

- Related to #743 — check that record before choosing an implementation path, in case it already resolves part of this gap or constrains which path fits.
- This record's own filing is a live instance of the gap it describes: this batch-shaping session received exactly this banner (3 unfinished pipeline runs) and had not yet relayed it before reaching this record — worth surfacing to the user once this shaping pass completes, independent of which implementation path is eventually chosen.
- Path 1 depends on session-start prompt-shaping conventions this plugin doesn't fully control (the model's own behavior on receiving a SessionStart banner) — if that proves unreliable in practice, Path 2 is the more durable fix and should be preferred.

## Original request

session-start unfinished-runs banner has no designated consumer

**Related:** #743

Context: /feedback session evaluation (2026-08-17) — the SessionStart hook surfaced 3 unfinished pipeline run dirs; the session neither triaged them nor relayed the list to the user (0 of 3), and nothing in the banner assigns anyone that job.

Scope: give the banner a defined consumer — instruct the model to relay the list once in its first reply (one line, with the ready-made close-run command), or route stale-run cleanup into /tidy's suggestion surface.

