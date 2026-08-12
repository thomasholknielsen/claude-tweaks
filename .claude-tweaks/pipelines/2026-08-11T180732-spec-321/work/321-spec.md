---
record: 321
origin: docs-health
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
---
# 321: Doc staleness: decisions/0004-worktree-two-domain-convention — Context

**Doc:** decisions/0004-worktree-two-domain-convention | **Section:** Context | **Category:** staleness | **Misleads:** human engineer + coding agent | **Classification:** additive | **Confidence:** high

## Current State

`git log --all --diff-filter=A --name-only` for the exact path returns nothing, and a repo-wide search for any file matching '2026-07-0[89]*worktree-directory-convention*design*' in docs/superpowers/specs/ finds no match. The brief (`docs/plans/2026-07-08-worktree-directory-convention-brief.md`) does exist and is correctly cited. A reader or agent following the design-doc citation for deeper rationale hits a nonexistent file.

## Deliverables

**Current:**
```
- **Context:** `/claude-tweaks:challenge` debiasing brief `docs/plans/2026-07-08-worktree-directory-convention-brief.md`; design `docs/superpowers/specs/2026-07-08-worktree-directory-convention-design.md`
```

**Proposed:**
```
- **Context:** `/claude-tweaks:challenge` debiasing brief `docs/plans/2026-07-08-worktree-directory-convention-brief.md`
```

## Acceptance Criteria

The Context line's 'design' citation points to `docs/superpowers/specs/2026-07-08-worktree-directory-convention-design.md`, which has no commit in this repo's history under that or any similar name (only the debiasing brief was ever committed). Remove the dangling design-doc citation, or replace it with the actual source this ADR was authored from if one exists under a different name/date.

_Filed by `/claude-tweaks:docs-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._
