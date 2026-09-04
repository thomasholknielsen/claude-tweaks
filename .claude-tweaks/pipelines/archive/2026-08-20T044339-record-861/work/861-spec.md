---
record: 861
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
---
# 861: Worktree PreToolUse guard over-matches — blocks git commits in out-of-repo scratch dirs

Origin: reflect full from #418
Defer-reason: tangential

## Current State

The worktree-session PreToolUse Bash guard matches `git commit` (and sibling verbs) by command text alone, so it also denies commits targeting git repos entirely OUTSIDE this repository — observed twice in the #418 run when probe subagents committed scratch fixture repos under the session scratchpad and had to wrap the commit in a `cd`+`exec` script to proceed. The guard's purpose (keep THIS repo's edits in the worktree) does not require denying operations on foreign repos.

## Deliverables

- The guard resolves the target repo (cwd's `git rev-parse --show-toplevel` or `-C` argument) before denying, and permits git write commands whose target repo is not this repository.
- A regression test covering: commit in an out-of-repo scratch dir (allowed), commit in the main checkout (still denied), commit in the session worktree (allowed).

## Acceptance Criteria

- A `git commit` run with cwd inside a scratch repo under the session temp dir is not denied by the guard.
- Existing worktree-enforcement denials (main-checkout commit from a worktree session) still fire — pinned by test.
- `npm test` green.

_Filed by `reflect` via specShapedBody._

