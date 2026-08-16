# Init worktree-always Finalization — the deferred policy write

Loaded by `/claude-tweaks:init` when Step 6 (`bootstrap/step-06-worktree-configuration.md`) queued
a `worktree-always` decision and this invocation is about to end. One lazy-load unit: the single
write, plus both places it can happen — the normal Phase 9 path, and every path that exits before
Phase 9 ever runs. Cited by `SKILL.md`'s Phase 0 stub (Finalizing the worktree-always Decision) and
its Phase 9 stub (Worktree Policy Finalization); both need this whole file. Section names in the
body below (Input, Actions Performed, Step 6, Step 17) name sections of `SKILL.md`; "below" and
"above" between the two halves resolve within this file.

## Every exit path (the rule)

If Step 6 (`bootstrap/step-06-worktree-configuration.md`) queued a `worktree-always` decision, it must be written to `.claude-tweaks/policy.yml` exactly once, as the very last filesystem action before this `/init` invocation ends — for whatever reason it ends. Phase 9's "Worktree Policy Finalization" (below) is the normal place this happens: per "Input" above, every scope reaches Phase 9 except `bootstrap`, including the goal-based Phase scopes (`config`/`skills`/`journeys`/`docs`) even though none of them list Phase 9 in their own phase subset. The known early-exit paths that stop the invocation before Phase 9 ever runs are: `$ARGUMENTS` was `bootstrap` (stops after Phase 0); the Scope Selection Gate's Option 4 ("Done"); or Option 2 (Interactive)'s own per-phase gate, if the user selects "Done" ("Stop here") after any phase. These are the known cases, not necessarily an exhaustive list of every way this invocation could ever end — whatever the actual reason this invocation is ending, write the decision right there, immediately before it ends, via the isolated-worktree write procedure below (§ "How the write itself happens") — never a direct `Edit` against the main checkout's `.claude-tweaks/policy.yml`. If the decision was "Yes," tell the user: "`worktree-always` is now enforced — your next edit requires an isolated worktree; run `/superpowers:using-git-worktrees` first."

If this invocation instead reaches Phase 9, the decision is finalized there — see "Worktree Policy Finalization."

## The Phase 9 path (Worktree Policy Finalization)

Write this AFTER every write in the Actions Performed table above has completed — it must be the very last filesystem action of the entire `/init` invocation. If Step 6 (`bootstrap/step-06-worktree-configuration.md`) queued a `worktree-always` decision, write it now, bundled into the same worktree/commit/merge as this same Phase 9's own confirmed generated-file writes (the Actions Performed table above) — see "Isolated Write Step" in `SKILL.md`'s Phase 9 for that mechanism. It is still deferred to this point in the run for the same reason as before: this run's own Steps 7-17, Phases 1-8.5, and Phase 9's writes must never be blocked by a policy that turned on mid-run — but under the isolated-worktree mechanism, only Steps 7-17's *direct-to-main-checkout* writes are actually at risk; Phase 9's own writes were never at risk in the first place, since they isolate themselves in a worktree unconditionally regardless of what this policy says. (The `bootstrap`-only scope already wrote its queued decision immediately after Step 17 — the last Optional Companion step Phase 0 runs through — see "Finalizing the worktree-always Decision" after Phase 0 — so there is nothing to do here for that scope.)

## How the write itself happens

Wherever in the run this write lands — bundled into Phase 9's batch, or standalone at one of the early-exit paths above — it is made via the same isolated-worktree procedure Phase 9 uses for its own writes, never a direct `Edit` against the main checkout: `_shared/scratch-worktree.md`'s provisioning (native `EnterWorktree` or git-fallback `.worktrees/`) and `_shared/worktree-setup.md`'s post-creation catch-up, requiring the valid HEAD Step 5 (`bootstrap/step-05-verify-git.md`) already guarantees. When this write is standalone (not bundled into Phase 9's batch), it still gets the full cycle for itself alone — worktree, one-line write, one commit, ff-only merge back into whatever branch was checked out when the invocation started, teardown — there is no lighter-weight path just because it's one line.

Inside the worktree: create `.claude-tweaks/` if it doesn't exist. Read `.claude-tweaks/policy.yml` if present; if it has an existing `worktree-always:` line, replace that line; otherwise, if it has an existing pre-#602 `worktree.always:` line, replace that line in place with the new-spelling `worktree-always: {true|false}` line (migrate, never append a second key beside it — a second key beside the old one would silently make the new line win under the alias rule, leaving the stale old line to confuse the next reader); otherwise append a new `worktree-always: {true|false}` line (create the file with just that line if it didn't exist). Preserve every other line in the file untouched. Commit that one change, then land it exactly as "Isolated Write Step" describes — ff-only merge into the checked-out branch, never pushed to `origin`.

If the decision was "Yes," tell the user the same confirmation message quoted in "Finalizing the worktree-always Decision" above.
