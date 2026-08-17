---
type: bug
origin: capture
needs-definition: true
unsynced: true
---

# specify: shaping-mode has no guard against decomposition-parent records

**Related:** #140, #416

Context: A bare #N reference always enters /claude-tweaks:specify's shaping mode (SKILL.md case 1), even when the record is a decomposition parent whose leaves are already built/accepted. Observed live this session: #140 needed manual judgment to skip; #416 was incorrectly shaped and marked ready, requiring manual label cleanup.

Scope: Add a guard in shaping-mode's Resolve-the-input case 1 — detect a parent-issue label or existing Leaves table before the compose/write step.
