# Always-Worktree Enforcement — Design

**Date:** 2026-07-06
**Status:** Approved — ready for planning
**Scope:** A repo-scoped opt-in policy that mechanically enforces isolated-worktree work from the first prompt of a session, plus this repo becoming the first adopter.

## Problem

`worktree` mode already exists as the default for `/build` and `/flow` pipelines, but it's opt-in at the pipeline level in two ways that leave a gap:

1. **`current-branch` is a fully supported alternative mode** — a pipeline can explicitly choose direct commits with no isolation.
2. **Ad-hoc, non-pipeline prompts bypass the concept entirely.** If a session never invokes `/build`/`/flow`, nothing about the plugin's git-discipline machinery ever engages — Claude can edit files and commit directly to the main checkout from the very first message.

The existing `E1` `PreToolUse` hook (`bin/lib/hooks/pre-tool-use.js`) proves mechanical enforcement is workable, but it only fires once a pipeline run has recorded a worktree assignment (`ctx.runDir && ctx.runState.worktree`) — it protects a pipeline's *own* worktree from wrong-checkout commits, it does not require a worktree to exist in the first place. Nothing closes that gap today, which matters because concurrent sessions sharing one main checkout have already caused real collisions (see `shared-checkout-branch-volatility` in project memory).

## Core insight

The gap isn't "which worktree" (E1's job) — it's "is there a worktree at all, before the very first edit." That's a strictly simpler, run-independent check: for a given target path, is it inside a linked git worktree (`GIT_DIR != GIT_COMMON`, not a submodule) or the main checkout? This test needs no pipeline run state, no recorded assignment, and no bookkeeping — it can fire on literally the first `Edit`/`Write` of a session, before any skill has run.

Building it as a **general, opt-in, per-project policy** (rather than something hardcoded to this repo) fits the plugin's existing policy convention (`.claude-tweaks/policy.yml`, flat dotted keys like the already-documented `issues.autonomous-eligibility`) and lets other projects adopt the same guarantee later. This repo turns it on for itself as the first adopter, since it's the one that has already hit concurrent-session collisions.

Given the "always worktree" framing, `current-branch` as a pipeline-selectable mode is retired: this repo has exactly one supported mode going forward. The mechanical gate enforces this at the tool-call layer regardless of what a pipeline's config happens to say, so removing the `current-branch` menu option is a documentation/UX cleanup, not the actual safety mechanism.

## Architecture

Two independent layers, both gated by the same policy read, sharing one detection helper:

1. **Mechanical gate (new).** A precondition check added alongside the existing E1 check inside `bin/lib/hooks/pre-tool-use.js` — still one module per `PreToolUse` event, per the plugin's hook-dispatcher convention. Unlike E1, it needs no pipeline run state: for any `Edit`/`Write`/`NotebookEdit` call, or a `Bash` call containing a `git commit`, it resolves the target path's own repo root, checks whether that repo has opted into `worktree.always`, and if so, denies unless the target is inside a linked worktree.
2. **Advisory nudge (extends existing).** `bin/lib/hooks/session-start.js` runs the same "already isolated?" check for the session's cwd; if the policy is on and the session isn't yet isolated, it appends `additionalContext` telling Claude to invoke `/superpowers:using-git-worktrees` before editing anything. Purely to avoid a wasted deny/retry round-trip on turn one — the mechanical gate is the actual backstop, not this nudge.

**Blast radius, accepted:** `hooks.json` has no `PreToolUse` matchers for `Edit`/`Write`/`NotebookEdit` today — only `Bash`. This design adds them globally, for every project using the plugin, not only ones that opt in. The check no-ops in under a millisecond (a single `fs.existsSync` on the policy file) when the flag is absent, so the added cost elsewhere is one extra cheap node-process fork per edit — accepted as consistent with the existing Bash-matcher hook overhead.

## Components

**Policy file** — `.claude-tweaks/policy.yml`, one line, following the existing flat dotted-key convention:
```yaml
worktree.always: true
```
Read two ways: by the **model**, as prose, when running Manifesto/build/flow skills (to stop *offering* `current-branch` as a menu choice); and by a new **hook-side reader** that does a plain regex line-scan — no YAML dependency, consistent with the plugin shipping zero runtime npm deps and no existing hook parsing YAML.

| File | Change |
|------|--------|
| `bin/lib/policy.js` | New. `isWorktreeAlwaysOn(repoRoot)` — regex-reads `.claude-tweaks/policy.yml` at that repo root for `^worktree\.always:\s*true$`. Missing file or no match → `false` (fail open). |
| `bin/lib/hooks/worktree-detect.js` | New. `isLinkedWorktree(dir)` — the `GIT_DIR != GIT_COMMON` + submodule-guard check, ported from `using-git-worktrees` Step 0 so the hook and the skill never disagree about what counts as isolated. Also exports a helper that walks up to the nearest existing ancestor directory (for `Write` targets whose parent doesn't exist yet) and resolves a path's own repo root. |
| `bin/lib/hooks/pre-tool-use.js` | Extended. Alongside the existing E1 check: if `tool_name` is `Edit`/`Write`/`NotebookEdit`, or `Bash` with a `git commit` target (reusing `gitTargets` from `git-command.js`), resolve the target's repo root, check `isWorktreeAlwaysOn` there, and if on and not `isLinkedWorktree`, deny. |
| `hooks/hooks.json` | Add `PreToolUse` matchers for `Edit`, `Write`, `NotebookEdit` — no `if` filter needed; the module itself no-ops cheaply when the policy is off. |
| `bin/lib/hooks/session-start.js` | Extended. If `isWorktreeAlwaysOn` for cwd's repo and not already `isLinkedWorktree`, append advisory `additionalContext`. |
| `.claude-tweaks/policy.yml` (this repo) | New. Sets `worktree.always: true`. |
| `skills/build/SKILL.md`, `skills/flow/manifesto.md` | Doc update: when the policy is on, the Git lever collapses to worktree-only (no `current-branch` menu item). Cosmetic — the mechanical gate denies a current-branch attempt regardless, so this is defense-in-depth, not the load-bearing part. |

## Edge cases & error handling

Following the hook layer's existing "ambiguity resolves to allow" philosophy:

- **Not a git repo** (e.g. brand-new `/init` on an empty dir) → `git rev-parse` fails → allow.
- **Submodule** → treated as "not isolated" (same as `using-git-worktrees` Step 0) → denied if the policy is on, same as the main checkout — a submodule checkout is exactly as exposed to concurrent-session collision.
- **`Write` to a not-yet-existing file/directory** → walk up to the nearest existing ancestor before running `git rev-parse`.
- **Edit/Write target in a different repo than the session's cwd** → policy is read from the *target's own repo root*, not cwd, so an unrelated project without the flag is unaffected mid-session.
- **`git worktree add` itself, and any read-only Bash** (tests, `ls`, `grep`, `npm install`) → untouched; the gate only inspects `Edit`/`Write`/`NotebookEdit` and `git commit`.
- **`git push` is not separately gated** — a push always follows a preceding local commit in the same directory, and that commit was already denied or allowed by this gate; by the time a push is possible, the directory was necessarily already a linked worktree.
- **Any hook error** → caught, fail open, matching the dispatcher's "never break a session" invariant (garbage-stdin test in `tests/hooks-dispatcher.test.js`).
- **`current-branch` selected anyway** (stale config, model error) → still denied mechanically at the first `Edit`/`Write`/commit.

## Testing

- `bin/lib/policy.test.js` — flag on / off / missing file / malformed line, all resolve correctly (missing → `false`).
- `bin/lib/hooks/worktree-detect.test.js` — linked worktree → `true`; main checkout → `false`; submodule → `false`; nonexistent path walk-up resolves to nearest ancestor.
- `bin/lib/hooks/pre-tool-use.test.js` (extend existing) — policy off → allow everywhere (regression guard for existing E1 behavior); policy on + `Edit` in main checkout → deny; policy on + `Edit` inside linked worktree → allow; policy on + `git commit` in main checkout with **no pipeline run dir at all** → denied by the new check independent of run state (today this path returns `{}` early since E1 requires `ctx.runDir`); `Write` to a new file whose parent directory doesn't exist yet.
- `tests/hooks-dispatcher.test.js` — extend the garbage-stdin invariant coverage to the new `Edit`/`Write`/`NotebookEdit` matcher paths.

## Out of scope

- Enforcing `worktree.always` via CLAUDE.md prose alone (rejected — advisory-only was considered and explicitly rejected in favor of the mechanical gate).
- Reading policy from CLAUDE.md as an alternate location (existing docs mention this for other policies, but this design only reads `.claude-tweaks/policy.yml`, to keep the hook-side parser to a single simple convention).
- Gating arbitrary file-mutating Bash (`rm`, `mv`, `mkdir`, shell redirection) — only `Edit`/`Write`/`NotebookEdit` and `git commit` are covered; broader Bash mutation detection is unprovable from command text alone and out of scope, consistent with the existing hook philosophy.
