# Staged: docs/donts.md rule — IL-127 shadow-copy hazard recurs at new call sites

Invariant: IL-127's relative-path shadow-copy hazard (a worktree-local mirror silently diverges
from $RUN_ROOT) recurred at a new call site — record #1219's build/test phases wrote decisions.md
AUTO entries only to the worktree-local mirror, splitting the audit trail across two files.

Proposed docs/donts.md addition:

> **Every new decisions.md / run-dir write site must resolve $RUN_ROOT explicitly, never a bare
> relative path.** [IL-127] A bare relative path from inside a worktree silently writes to the
> worktree-local mirror instead of the main-checkout run dir, splitting the audit trail with no
> error. Recurred at a second site (record #1219's build/test AUTO-entry writes) after the
> original incident. New write sites should cite `_shared/pipeline-run-dir.md`'s Anchoring section
> directly rather than re-deriving the resolution.

Source: .claude-tweaks/pipelines/archive/2026-08-26T055917-record-1219/staged/reflect-1.md
