---
record: 692
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 692: flow: pipeline run-dir anchoring rule was loaded then violated, creating a worktree-local shadow copy

Surface: backend

## Current State

- `_shared/pipeline-run-dir.md`'s Anchoring section requires `$RUN_ROOT` from `git rev-parse --git-common-dir` and ships a Bash snippet — but it's a snippet that ~13 citing files restate or paraphrase (`wrap-up/cleanup-procedures.md`, `wrap-up/SKILL.md`, `dispatch/SKILL.md`, `tidy/scan-procedures.md`, `_shared/dev-url-detection.md`, `_shared/auto-mode-contract.md`, `_shared/integration-branch.md`, `_shared/scratch-worktree.md`, `help/policy.md`, `flow/claim-targets.md`, `flow/steps-and-gates.md`, `flow/manifesto.md`), and 36 files cite the rule. In one run the rule was read and then violated: a relative `.claude-tweaks/pipelines/…` read from inside the worktree created/used a worktree-local shadow, splitting run state across two locations and costing 6 blind-rediscovery commands after a compaction (`[IL-127]`).
- `bin/lib/hooks/worktree-detect.js` already exports `mainCheckoutRoot()` / `repoInfo()`; `bin/hooks.js` has `record-worktree` / `close-run` but no run-dir resolver command. `bin/lib/hooks/pre-tool-use.js` guards writes under `worktree-always` but does not refuse creating `.claude-tweaks/pipelines/` under a linked-worktree path.
- **Related:** #658 (worktree-always gate should exempt the plugin's own hooks.js launcher — prerequisite for calling this from a worktree without a permission stall), #637, #644.

## Deliverables

1. `node bin/hooks.js resolve-run-dir [--spec-slug <s>] [--mode auto] [--standalone <skill>] [--create]` — implements `pipeline-run-dir.md`'s resolution order (env var with adoption-time anchoring check → newest matching dir → standalone fallback) on top of `mainCheckoutRoot()`, prints the anchored absolute path, exits non-zero with a loud message when `PIPELINE_RUN_DIR` or a candidate resolves inside a linked worktree (a shadow) or when nothing resolves; never creates a directory unless `--create` is passed.
2. Guard: `bin/lib/hooks/pre-tool-use.js` denies a Bash/Write call whose target creates or writes under `<linked-worktree>/.claude-tweaks/pipelines/` (path-anchored — realpath compared against `mainCheckoutRoot()`, not a string match), with a deny message pointing at `resolve-run-dir`.
3. Sweep: every run-dir-touching step in the ~13 files above calls `resolve-run-dir` instead of composing `$RUN_ROOT` inline; `pipeline-run-dir.md` keeps its Bash snippet only as the reference implementation the command mirrors (or deletes it and points at the command).
4. Tests under `tests/` covering: main-checkout cwd, linked-worktree cwd, env var pointing into a worktree (rejected), env var anchored (accepted), guard deny/allow.

## Acceptance Criteria

- From inside a linked worktree with `PIPELINE_RUN_DIR` set to a worktree-local path, `resolve-run-dir` exits non-zero and names the shadow; with it unset and a matching main-checkout run present, it prints that absolute path.
- Guard test: a simulated `mkdir <worktree>/.claude-tweaks/pipelines/x` is denied; the same under the main checkout is allowed.
- `grep -rn "git-common-dir" skills/ | grep -v _shared/pipeline-run-dir.md` returns zero lines (each site now cites the command).
- `npm test` green.

## Technical Approach

Reuse `worktree-detect.js`; keep the resolver pure and testable (`bin/lib/hooks/run-dir-resolve.js`), thin dispatch in `hooks.js`. The guard extends the existing pre-tool-use path checks.

## Gotchas

- `${CLAUDE_PLUGIN_ROOT}` isn't reliably set in Bash tool calls (#170) — cite the invocation the same way `close-run` is cited today.
- The worktree-always gate may block running `node bin/hooks.js` from a worktree when the launcher path is in the main checkout — coordinate with #658.
- Pre-anchoring run dirs still inside worktrees (`cleanup-procedures.md` step 3.5's transitional guard, sunset 2026-11-07) must not be flagged as violations by the guard — only new creations.

## Original request

flow: pipeline run-dir anchoring rule was loaded then violated, creating a worktree-local shadow copy

**Related:** none

Context: `_shared/pipeline-run-dir.md`'s anchoring rule was read and then violated -- a relative-path read from inside the worktree silently created/used a worktree-local shadow of `.claude-tweaks/pipelines/`, splitting run state across two locations and costing 6 blind-rediscovery commands after a context compaction.

Scope: Have `bin/hooks.js` expose a `resolve-run-dir` command that prints the anchored absolute path and fails loudly on a worktree-shadow candidate; require every run-dir-touching skill step to call it instead of composing a relative path; add a guard refusing to create `.claude-tweaks/pipelines/` under a worktree path.
