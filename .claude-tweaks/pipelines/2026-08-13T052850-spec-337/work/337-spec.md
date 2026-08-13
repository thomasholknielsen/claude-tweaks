---
record: 337
origin: docs-health
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: infra
---
# 337: Doc staleness: decisions/0005-health-state-durable-storage-branch — Context

**Doc:** decisions/0005-health-state-durable-storage-branch | **Section:** Context | **Category:** staleness | **Misleads:** human engineer + coding agent | **Classification:** additive | **Confidence:** high

## Current State

Verified by direct filesystem check: `ls docs/superpowers/specs/2026-07-12-health-state-durable-storage-design.md` returns 'No such file or directory', and `git log --all --oneline -- <path>` returns no commits touching that path. GitHub issues #7 and #8 (also cited in the same Context line) were independently verified via the GitHub API and match the ADR's description, so only the design-doc path is stale. The same class of broken reference (a cited `docs/superpowers/specs/*-design.md` path that no longer exists) also appears in `docs/decisions/0003-worktree-always-init-rollout.md`, consistent with ADR 0007's periodic archive-pruning policy leaving ADR citations dangling after a prune — out of scope for this finding, which is limited to the audited target (0005).

## Deliverables

**Current:**
```
- **Context:** GitHub issues #7, #8 — see `docs/superpowers/specs/2026-07-12-health-state-durable-storage-design.md` for the full design
```

**Proposed:**
```
- **Context:** GitHub issues #7, #8 (the design doc originally cited here no longer exists in the repository)
```

## Acceptance Criteria

The ADR's Context line cites `docs/superpowers/specs/2026-07-12-health-state-durable-storage-design.md` as the source for the full design, but that file does not exist anywhere in the repository (confirmed via `ls` and `git log --all -- <path>` returning zero history). A reader or agent following this citation for design detail hits a dead path. Replace the citation with a note that the referenced design doc no longer exists in the repository, rather than pointing at a path that cannot be opened.

_Filed by `/claude-tweaks:docs-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._

<!-- work-fingerprint: docshealth-015b3320 -->
