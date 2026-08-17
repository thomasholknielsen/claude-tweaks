---
record: 713
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: infra
---
# 713: Worktree hook refuses read-only compounds by shape; suite runs race pending upstream merges

Origin: session evaluation of the #620-#625 /flow run (via /claude-tweaks:feedback; self-reference routed the findings to local records)

Defer-reason: genuinely-larger

## Current State

In a worktree-isolated session, the E1 hook rejected five Bash calls purely on command shape — read-only compounds (`for f in …; do sed`, `SK=…; cat`, `sed; ls; sed`) refused as "too complex to verify", and a read-only `git -C` to the shared checkout refused outright — forcing one-command-per-call re-issues and causing duplicate reads. Separately, `flow` guidance nowhere forbids starting a background full-suite run while an upstream catch-up merge is pending; one run discarded two complete `npm test` runs (~10 min) because a merge changed the tree mid-run.

## Deliverables

- [ ] `bin/lib/hooks/` E1: make the compound-command check path-aware for read-only verbs (`cat`/`sed`/`grep`/`ls`/`wc`/`awk` with no redirect into the shared checkout), or explicitly publish the one-plain-command rule in `docs/hooks.md` so skills stop emitting compounds they cannot run
- [ ] `flow/worktree-merge.md` (or `multi-spec.md`'s finish step): sequence merge-then-suite — never start a background full-suite run with a catch-up merge pending

## Acceptance Criteria

1. A worktree session can run `sed -n 1,20p skills/a.md; ls skills/` in one call (or docs/hooks.md documents why not, and skills contain no such compounds — verify by grep over skills/ for `; ` inside bash fences).
2. `grep -n "merge-then-suite\|catch-up merge is pending" skills/flow/` matches the new rule.

_Filed by `capture` via specShapedBody._
