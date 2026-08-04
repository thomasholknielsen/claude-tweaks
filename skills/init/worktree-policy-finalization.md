# Init worktree.always Finalization — the deferred policy write

Loaded by `/claude-tweaks:init` when Step 6 (`bootstrap/step-06-worktree-configuration.md`) queued
a `worktree.always` decision and this invocation is about to end. One lazy-load unit: the single
write, plus both places it can happen — the normal Phase 9 path, and every path that exits before
Phase 9 ever runs. Cited by `SKILL.md`'s Phase 0 stub (Finalizing the worktree.always Decision) and
its Phase 9 stub (Worktree Policy Finalization); both need this whole file. Section names in the
body below (Input, Actions Performed, Step 6, Step 17) name sections of `SKILL.md`; "below" and
"above" between the two halves resolve within this file.

## Every exit path (the rule)

If Step 6 (`bootstrap/step-06-worktree-configuration.md`) queued a `worktree.always` decision, it must be written to `.claude-tweaks/policy.yml` exactly once, as the very last filesystem action before this `/init` invocation ends — for whatever reason it ends. Phase 9's "Worktree Policy Finalization" (below) is the normal place this happens: per "Input" above, every scope reaches Phase 9 except `bootstrap`, including the goal-based Phase scopes (`config`/`skills`/`journeys`/`docs`) even though none of them list Phase 9 in their own phase subset. The known early-exit paths that stop the invocation before Phase 9 ever runs are: `$ARGUMENTS` was `bootstrap` (stops after Phase 0); the Scope Selection Gate's Option 4 ("Done"); or Option 2 (Interactive)'s own per-phase gate, if the user selects "Done" ("Stop here") after any phase. These are the known cases, not necessarily an exhaustive list of every way this invocation could ever end — whatever the actual reason this invocation is ending, write the decision right there, immediately before it ends: create `.claude-tweaks/` if it doesn't exist, then write or update the `worktree.always:` line in `.claude-tweaks/policy.yml` (merge into existing content — preserve every other line in the file untouched; create the file with just that one line if it didn't exist). If the decision was "Yes," tell the user: "`worktree.always` is now enforced — your next edit requires an isolated worktree; run `/superpowers:using-git-worktrees` first."

If this invocation instead reaches Phase 9, the decision is finalized there — see "Worktree Policy Finalization."

## The Phase 9 path (Worktree Policy Finalization)

Write this AFTER every write in the Actions Performed table above has completed — it must be the very last filesystem action of the entire `/init` invocation. If Step 6 (`bootstrap/step-06-worktree-configuration.md`) queued a `worktree.always` decision, write it now: this is the deferred write described in Step 6, deferred specifically so this run's own Steps 7-17, Phases 1-8.5, and this same Phase 9's own confirmed generated-file writes (the Actions Performed table above) were never blocked by a policy that turned on mid-run. (The `bootstrap`-only scope already wrote its queued decision immediately after Step 17 — the last Optional Companion step Phase 0 runs through — see "Finalizing the worktree.always Decision" after Phase 0 — so there is nothing to do here for that scope.)

Create `.claude-tweaks/` if it doesn't exist. Read `.claude-tweaks/policy.yml` if present; if it has an existing `worktree.always:` line, replace that line, otherwise append a new `worktree.always: {true|false}` line (create the file with just that line if it didn't exist). Preserve every other line in the file untouched.

If the decision was "Yes," tell the user the same confirmation message quoted in "Finalizing the worktree.always Decision" above.
