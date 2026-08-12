---
record: 342
origin: human
risk: low
size: low
ceremony: standard
grants: []
surface: backend
---
# 342: Wrap-up's residue sweep pulls in repo-wide, unrelated cleanup — should default to blast-radius scope

## Current State

`skills/wrap-up/residue-sweep.md`'s documented invocation is:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/residue.js" --base {base} --integration-branch {ref} --scope repo
```

`--scope repo` renders every finding the CLI's probes surface, repo-wide, regardless of whether it
has anything to do with the work this wrap-up run is actually closing out. During this session's
wrap-up for a small, two-commit dispatch/Auto-merge fix, this surfaced 5 residue items: 3 other
sessions' worktrees (2 of them not mine, one locked and live), a stale merged branch, and an
unrelated open PR from "another lane." Only 1 of those 5 had any real connection to the work being
wrapped up. The user's feedback: this is `/claude-tweaks:tidy`'s job, not wrap-up's — wrap-up
should only address what's related to the work it just did, and pulling in repo-wide residue
creates developer friction (a five-item ledger drill, a merge-conflict resolution on someone
else's PR, worktree/branch cleanup for other lanes) for what should have been a two-line report.

## Why this is an easy fix

`bin/residue.js` already has the mechanism: a `--scope blast-radius` option
(`bin/lib/residue/scope-filter.js`) that narrows findings to those tagged `scope: 'blast-radius'`
by their own probe, dropping everything tagged `scope: 'observed'`. Checked each probe's tagging
directly:

- `bin/lib/residue/probes/worktrees.js` — every finding is unconditionally `scope: 'observed'`.
  Under `--scope blast-radius`, none of this run's 3 worktree findings would have surfaced at all.
- `bin/lib/residue/probes/forge.js` (the open-PR probe) — tags `scope: mine ? 'blast-radius' :
  'observed'`. PR #305 (opened by a different dispatch run, not this session's work) would have
  resolved `mine: false` and been excluded.
- `bin/lib/residue/probes/branches.js` and `bin/lib/residue/probes/release.js` — always
  `scope: 'blast-radius'` (a merged-but-undeleted branch, a missing release-triple entry are
  treated as this work's own footprint regardless).

So `--scope blast-radius` already implements almost exactly the boundary the user described —
wrap-up's own residue-sweep procedure simply never asks for it.

## Deliverables

- Change `skills/wrap-up/residue-sweep.md`'s documented invocation to `--scope blast-radius`
  instead of `--scope repo`, or make the scope conditional (blast-radius for wrap-up's own use,
  leaving `--scope repo` available for a genuinely repo-wide caller like `/claude-tweaks:tidy` — check
  whether `/tidy` calls this CLI at all before assuming it needs the wider scope; if it doesn't,
  `repo` may only exist for this CLI's own default/back-compat and `blast-radius` could become the
  sole caller-facing option).
- Confirm `bin/lib/residue/probes/worktrees.js`'s unconditional `'observed'` tag is intentional
  (a worktree finding is never "mine" in the way a branch or PR can be) rather than a gap that
  should also gain a `mine` check — read the probe before assuming either way.
- Re-run this session's own before/after: confirm `--scope blast-radius` against the same base
  used in this run would have reported 0-1 findings instead of 5.

## Acceptance Criteria

- [ ] Wrap-up's residue sweep no longer surfaces another session's worktrees or another lane's open
      PR as items requiring this run's own ledger drill.
- [ ] A genuinely work-related residue item (e.g. a branch this run's own worktree left behind)
      still surfaces correctly.
- [ ] `npm test` passes.

Refs #293.
