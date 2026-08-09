---
record: 243
origin: docs-health
risk: low
effort: low
ceremony: fast-lane
grants: [build]
fingerprint: docshealth-5a521643
---
# 243: Doc staleness: decisions/0001-deepen-standalone-and-flow-survey — Alternatives considered

**Doc:** decisions/0001-deepen-standalone-and-flow-survey | **Section:** Alternatives considered | **Category:** staleness | **Misleads:** human engineer + coding agent | **Classification:** additive | **Confidence:** high

## Current State

The fallback plan for collapsing /deepen into a /review mode is described as 'tracked in `specs/INBOX.md`.' No such file exists anywhere in the repo (verified via `find . -iname "INBOX*"` and a repo-wide grep for `INBOX.md`, both empty outside this ADR's own line). CLAUDE.md declares this project's backlog backend as `work-backend: github-issues` / `work-types: labels`, and its Don'ts section requires deferred work to be filed via `/claude-tweaks:capture` — a flat INBOX.md file is not this project's current backlog mechanism. A reader or agent trying to find or update that tracked fallback would hit a nonexistent path.

## Deliverables

**Current:**
```
- **A `/review deepen` mode** — rejected *for now*, but the weakest point of this decision and explicitly revisitable. `/review` is a gate, not a refactoring tool, so the two-stage apply loop sits awkwardly there. If the skill count starts feeling heavy, collapsing `/deepen` into a `/review` mode is the fallback (tracked in `specs/INBOX.md`).
```

**Proposed:**
```
- **A `/review deepen` mode** — rejected *for now*, but the weakest point of this decision and explicitly revisitable. `/review` is a gate, not a refactoring tool, so the two-stage apply loop sits awkwardly there. If the skill count starts feeling heavy, collapsing `/deepen` into a `/review` mode is the fallback — file it as a backlog work record via `/claude-tweaks:capture` if revisited (this project's backlog now lives in GitHub issues, not a `specs/INBOX.md` file).
```

## Acceptance Criteria

Replace the dead `specs/INBOX.md` pointer with how this project actually tracks a deferred/fallback decision today.

_Filed by `/claude-tweaks:docs-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._

<!-- work-fingerprint: docshealth-5a521643 -->
