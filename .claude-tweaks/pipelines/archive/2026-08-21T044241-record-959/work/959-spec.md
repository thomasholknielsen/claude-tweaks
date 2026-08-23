---
record: 959
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
---
# 959: checkPipelineShadowGuard denies the documented work/{n}-spec.md worktree exception

Origin: wrap-up leftover from #315

Defer-reason: pre-existing-outside-diff

## Current State

`_shared/pipeline-run-dir.md`'s Anchoring section documents `work/{n}-spec.md` as the one exception meant to write inside a linked worktree (git-tracked, committed onto the feature branch). `bin/lib/hooks/pre-tool-use.js`'s `checkPipelineShadowGuard` (#692) denies ANY write under `.claude-tweaks/pipelines/{run-id}/...` inside a worktree when that run-id directory doesn't already exist there, with no carve-out for the `work/` path specifically. `bin/materialize.js`'s own `--run-dir` anchoring check (#790/[IL-127]) independently refuses to write to a worktree-relative path at all, so the sanctioned CLI route never triggers the guard (it simply can't target a worktree path in the first place) while a hand-composed write to the identical documented path is denied outright. Reproduced during #315 (2026-08-19): materializing a spec directly into an externally-provisioned worktree (not created via `/build`'s own worktree-setup flow) required a git-plumbing workaround (`hash-object`/`update-index`/`commit`/`checkout`) to bypass both guards, since neither pattern-matches git plumbing — itself now a documented Don't (staged from #315's wrap-up) precisely because it's an unaudited bypass of every PreToolUse gate.

## Deliverables

1. Give `checkPipelineShadowGuard` (or the mkdir/write-target detection it uses) an explicit carve-out for a path ending in `work/{n}-spec.md` (or the multi-record `spec-{N}/work/{n}-spec.md` form), matching `pipeline-run-dir.md`'s documented exception.
2. Confirm `bin/materialize.js`'s own anchoring check has (or gets) an equivalent allowance so the CLI route and the guard agree — today the CLI refuses a worktree-relative `--run-dir` unconditionally, which sidesteps rather than resolves the contradiction.
3. Once fixed, supersede or update the #315-wrap-up-staged `docs/donts.md` entry about the git-plumbing bypass, since the documented workaround becomes unnecessary.

## Acceptance Criteria

Given an already-existing linked worktree (however provisioned) and a resolved `$PIPELINE_RUN_DIR`, writing `{worktree}/.claude-tweaks/pipelines/{run-id}/work/{n}-spec.md` via a normal Write/Bash mkdir is permitted by `checkPipelineShadowGuard` without requiring a git-plumbing workaround, and a new test in `tests/hooks-*.test.js` pins this.

_Filed by `wrap-up leftover routing` via specShapedBody._
