---
files:
  - plugin/bin/lib/hooks/skill-invocation.js
  - plugin/bin/lib/hooks/run-integrity.js
  - plugin/bin/lib/hooks/pre-tool-use.js
  - plugin/bin/lib/hooks/session-start.js
  - plugin/bin/hooks.js
---

# Run-Integrity Lifecycle: Detect, Remediate, and Gate Bypassed Pipeline Closures

**Persona:** claude-tweaks maintainer or Claude session working a repo where a prior pipeline run shipped its work without ever closing its bookkeeping (the #364 shape: PR merged, `run-state.json` stuck `active`), or about to tear down a worktree a live run still owns.
**Goal:** The runtime itself surfaces shipped-but-unclosed runs at session start, names the remediation, and refuses a teardown that would destroy an open run's state — no manual `.claude-tweaks/pipelines/` spelunking.
**Entry point:** Starting any session in the repo (detection), or attempting `ExitWorktree` / `git worktree remove` (gate), or running `close-run` (warn).
**Success state:** A shipped-unclosed run is flagged with both remediations at SessionStart; a teardown of an assigned worktree is denied until `close-run` clears the assignment; a raw Bash `git worktree remove` targeting the session's own cwd (or an ancestor of it) is denied independent of any run assignment, with `ExitWorktree` as the unaffected remediation; a wrap-up-less close still succeeds but records `close-without-wrapup`.

## Steps

### 1. Work happens — the ledger writes itself
- **Action:** Run any pipeline (`/claude-tweaks:flow`, `/claude-tweaks:build`): every model-initiated Skill-tool call is appended to the owned run's `events.jsonl` as `{"skill": ..., "ts": ..., "type": "skill_invoked"}` by the PostToolUse hook.
- **Expect:** No visible output — log tier. Boundary (measured): user-typed slash commands and failed calls leave no event; subagent Skill calls do land, so a flow-driven wrap-up always registers.

### 2. A bypassed closure is flagged — next SessionStart
- **Action:** Start a session in a repo whose newest non-terminal run's branch has actually merged (ancestry or squash/rebase patch-equivalence) while its ledger holds skill activity but no wrap-up event.
- **Expect:** The unfinished-runs block's line for that run reads "work appears shipped … no wrap-up recorded" and names both remediations: `/claude-tweaks:wrap-up`, or bookkeeping-only `node ".../bin/hooks.js" close-run --run "<dir>"`. A genuinely in-progress run's line is unchanged; every indeterminate answer (deleted branch, no worktree, pre-ledger run) stays quiet — fail-open by design.

### 3. Teardown while the run is open — denied with the path out
- **Action:** Attempt `ExitWorktree` (`action: "remove"`) or `git worktree remove <path>` targeting a worktree recorded by an `active`/`interrupted` run.
- **Expect:** Deny naming the run dir and `cleanup-procedures-execution.md` Section C. Non-destructive exits (`action: "keep"`), unassigned worktrees, and unparseable commands pass. A worktree owned by a *different* session's run allows with a warning and a `wd-foreign-teardown` event instead.

### 4. Close, then tear down — the sanctioned exit
- **Action:** Run `node ".../bin/hooks.js" close-run --run "<dir>"` (wrap-up's Section C step 3.6 does this for you), then retry the teardown.
- **Expect:** The removal now passes. If the run's ledger never recorded a wrap-up invocation, close-run still closes but prints an informational warning (expected for hand-typed wrap-ups) and appends `close-without-wrapup` as the run's final event — the audit trail of how the run ended.

### 5. A second, independent deny — a raw `git worktree remove` on your own cwd
- **Action:** From inside a worktree, run a raw Bash `git worktree remove <that-worktree-path>` (never `ExitWorktree`) whose target is the session's own cwd, or a directory containing it — including via a `cd <elsewhere> && git worktree remove <own-cwd>` compound.
- **Expect:** Denied, naming `ExitWorktree` as the sanctioned remediation. This own-cwd guard fires independent of any pipeline-run assignment: unlike Step 3's deny, Step 4's `close-run` does NOT lift it — `close-run` only clears the run-assignment deny, and deleting the shell's own live working directory is the failure regardless of whether a run owns it. The `cd` in the compound form does not launder the target; it is still denied. The same raw `git worktree remove` targeting a *different* worktree from elsewhere (e.g. the main checkout) is unaffected and allowed, and `ExitWorktree` removing the session's own cwd is unaffected by this guard — it remains the one sanctioned way to do exactly that.
