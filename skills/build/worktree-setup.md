# Common Step 1 — Worktree Setup

Runs only when the user specified `worktree` (or it's the default). Skipped entirely in `current-branch` mode.

**Skip when already in a shared worktree (multi-spec).** If `MULTISPEC_SHARED_WORKTREE=1` is set, or superpowers Step 0 detects the session is already inside a linked worktree (`GIT_DIR != GIT_COMMON`, and not a submodule), the run's single shared worktree already exists and the pipeline is running inside it. **Skip this entire procedure** — do not create a nested worktree and do not finish the branch between specs. `/flow` created the worktree once up front and finishes it once at the end of the multi-spec run (see `skills/flow/multi-spec.md`, "Shared worktree").

## Base ref — branch from local HEAD, not stale origin

For why `worktree.baseRef` matters and what `fresh` vs `head` do, see
`_shared/worktree-base-ref.md` — the canonical explanation, shared with
`init/bootstrap/step-06-worktree-configuration.md`'s provisioning-time offer. Set
`worktree.baseRef: "head"` in `settings.json`. Because the plugin cannot pass
the base ref through the tool, Step 4 below **unconditionally catches the new
worktree up** with the integration branch instead of verifying the base and
stopping on a mismatch — see `_shared/worktree-setup.md`'s `## Post-creation
catch-up` for why the unconditional form is correct either way. That catch-up
protects the "worktree fell behind" direction on its own; the other direction
(local-only commits on the branch this worktree starts from, not yet on
`origin`) needs Step 0's capture below to also merge — `worktree.baseRef: fresh`
has been observed to resolve against a stale local branch ref rather than the
freshly fetched `origin/<default-branch>` its own name implies, so a caller
cannot assume which direction, if any, is stale.

## Procedure

0. **Capture the expected base** — before creating anything, record the commit the worktree should start from:
   ```bash
   EXPECTED_BASE=$(git rev-parse HEAD)
   ```
   This is a cheap value capture only — no verification, no STOP. It exists solely to feed Step 4's `{EXPECTED_BASE}` merge; nothing here compares it against the worktree's actual base.
1. **Pre-flight branch-divergence check** — resolve the `branch-divergence-check` setting: `BRANCH_DIVERGENCE_CHECK=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values branch-divergence-check)`.

   **Skip when already stamped by `/flow` (re-read cut).** When this invocation received `MERGE_CHECK_PASSED=true UPSTREAM_SHA={sha}` from `/flow`'s Step 2.5 (per `flow/validation.md`'s "Memo stamp" note), resolve `$UPSTREAM` the same way `_shared/worktree-setup.md`'s `## Pre-flight divergence check` does and compare `git rev-parse "$UPSTREAM"` against the stamped `{sha}`. A match means `/flow` already ran this exact check moments ago in this same run — skip the fetch and the divergence prompt entirely, and proceed straight to Step 2. A mismatch (the ref moved since the stamp — rare, but possible under a slow Manifesto or materialize step) or a missing stamp (standalone `/claude-tweaks:build`, no `/flow` parent) runs the full check below — **fail-open, never fail-skip**: an absent or stale stamp is not a reason to skip the safety check, only a matching one is.

   Otherwise, run `_shared/worktree-setup.md`'s `## Pre-flight divergence check` in full — the same procedure `/flow`'s own Step 2.5 runs (`flow/validation.md`), consolidated into one canonical copy rather than two independently maintained ones.
2. Invoke `/superpowers:using-git-worktrees` to create an isolated workspace
3. The skill handles: branch creation, dependency install, baseline test verification
4. **Catch up with the integration branch** — immediately after creation, before any commits, run `_shared/worktree-setup.md`'s `## Post-creation catch-up` unconditionally, passing Step 0's `{EXPECTED_BASE}` so both merges run (origin/{integration-branch} for the behind direction, `{EXPECTED_BASE}` for the ahead direction). This is the correctness net regardless of whether Step 1's divergence check ran or was skipped, and regardless of which direction (or neither, or both) `worktree.baseRef`'s actual behavior through `EnterWorktree` turned out stale. There is no separate base-ref verification-and-STOP step here anymore — the unconditional catch-up makes that moot rather than removing a safety net (the branch has no commits yet, so there is nothing either merge could destroy). Fetch/merge command failures (no network, no `origin` remote) fail open per that section's own note — don't block worktree setup on them. When either merge actually advances the branch, log it to `decisions.md` per that section's logging note.
4.5. **Record the assignment** — `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree --run "$RUN_DIR" "$WORKTREE"` so the working-directory hook (E1) can enforce commits land in this worktree. Pass `--run "$RUN_DIR"` explicitly — resolve `$RUN_DIR` per `_shared/pipeline-run-dir.md` immediately before this command, do not rely on the command's own fallback resolver (`resolveRunDir`'s "newest non-terminal run" heuristic), which any stale never-closed run elsewhere in the project can win over this one; a Bash tool call does not inherit environment exports from an earlier, separate call, so `$RUN_DIR` must be re-resolved (or read back from wherever this run tracked it) in the same command that invokes `record-worktree`, not assumed to already be in the process environment. Either cwd works — the main checkout or the worktree. Run-dir resolution is anchored to the main checkout (`bin/lib/hooks/context.js`'s `iterRunDirsWithState`, per `_shared/pipeline-run-dir.md`'s Anchoring section), so a session inside a linked worktree resolves the same run set as one in the main checkout, and the `worktree-always` gate's one exemption permits the resulting write to `.claude-tweaks/pipelines/` from either. (Before anchoring shipped, the worktree held no `.claude-tweaks/` directory at all and resolution failed from inside it — hence the older instruction to run this from the main checkout, which is no longer needed.) On success the command prints `claude-tweaks: worktree recorded for <run-id>` to stdout (or `claude-tweaks: no pipeline run dir found — worktree not recorded` if resolution failed); verify that confirmation line before proceeding. The command also stamps the current session as the run's owner (from `CLAUDE_CODE_SESSION_ID`), which scopes E1 enforcement to this session — commits from other sessions in the main checkout get a warning instead of a deny. If a different session later continues this pipeline (e.g. after a session fork), re-run `record-worktree --run "$RUN_DIR"` to reclaim ownership — from either cwd, for the anchoring reason above; it is an idempotent restamp.
5. All subsequent work happens in the worktree
6. **Open the draft PR (`integration-model: pr-first` only)** — called from `build/SKILL.md`
   Spec Step 1, immediately after that step's materialize commit lands (not from within this
   numbered procedure, which ends at Step 5 — the materialize commit that must exist first is a
   Spec Step 1 concern, not a worktree-creation one). Route on `_shared/integration-model.md`;
   `local-merge` runs skip this step entirely, unchanged from today. Full procedure —
   push-then-create, the draft PR body template, idempotent resume, and degrade behavior for a
   failed push or a `gh`-absent environment — lives in `_shared/pr-early-run-lifecycle.md`; this
   step cites it rather than restating it.

## Consent prompt (v5.1.0+)

`/superpowers:using-git-worktrees` now asks the user before creating a worktree (fixes superpowers #991). In `auto` mode, the consent is **pre-authorized** — the user passed `worktree` (or it's the default for `/flow`) which is an explicit opt-in. Answer affirmatively without surfacing the prompt to the user. Log entry:

```
AUTO {time} — Common Step 1: worktree consent pre-authorized by auto mode. Worktree created at {path}.
```

In interactive mode, surface the consent prompt as the skill normally would.

## If worktree creation fails

| Failure | Recovery |
|---------|----------|
| **Superpowers not installed** | Stop. Tell the user: "Superpowers plugin required for worktree mode. Install: `/plugin install superpowers@claude-plugins-official`" — or fall back to current-branch with confirmation. |
| **Git state prevents worktree** (uncommitted changes, dirty index) | Stop. Present the git issue and suggest: `git stash` or commit first, then retry. |
| **Branch already exists** | Offer: (1) Use existing worktree, (2) Remove and recreate, (3) Fall back to current-branch. |
| **Anything else** (disk full, permissions error on the target path, corrupted `.git/worktrees` metadata, or any failure not matching a row above) | Stop. Present the actual error text verbatim — do not guess at a cause. Offer: (1) Retry, (2) Fall back to current-branch with confirmation, (3) Let the user resolve it manually and re-invoke. Never silently retry or improvise an unreviewed recovery. |
| **Step 4's catch-up fails** (`git fetch`/`git merge` error, not a merge conflict) | Fail open per `_shared/worktree-setup.md`'s Post-creation catch-up note — log distinctly and proceed. This is the one row here that does *not* stop: a connectivity failure at this step is not a reason to block worktree setup entirely, only to skip the staleness protection for this run. A genuine merge *conflict* (base and integration branch actually diverged) is not a creation failure — resolve it per `_shared/git-discipline.md`, same as any other conflict. |

## Impeccable hook consent (per-worktree)

If Impeccable's automatic design hook is enabled (`/impeccable:impeccable hooks on` — see `skills/init/bootstrap/step-11-impeccable-design-integration.md`), its consent lives in `.impeccable/config.local.json` in the **working tree**, not `.git/`. A freshly created worktree starts with the hook off even when the main checkout has it enabled — re-run `/impeccable:impeccable hooks on` inside the new worktree if you want it active there too.

This is informational only. claude-tweaks does not auto-propagate Impeccable's hook consent into new worktrees — doing so would create an ongoing dependency on Impeccable's internal config file shape for a one-time, low-cost manual step.
