# execution.always Policy Lever Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `execution.always: subagent` policy lever (mirroring the existing `worktree.always`) that guarantees `/claude-tweaks:build` never offers or accepts `batched` execution and never prompts for execution strategy, in any mode — closing the two gaps identified during design: the `/build` strategy prompt not checking policy before asking, and `/flow` relying on prose rather than an explicit argument to guarantee subagent execution.

**Architecture:** One new flat-key policy value in `.claude-tweaks/policy.yml`, read the same way `worktree.always` already is — by the assistant, following markdown instructions, not by any hook or code path. Three skill-documentation files get updated to check and honor the new key. No new code, no new tests (this is prompt-driven behavior, not compiled logic — see "Verification" in the design doc).

**Tech Stack:** Markdown skill files (YAML frontmatter + prose), flat-key YAML-like policy file, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-07-08-execution-always-policy-design.md`

## Global Constraints

- Exact new policy key and value, verbatim in all docs: `execution.always: subagent`
- File: `.claude-tweaks/policy.yml` (flat dotted-key format, no YAML parser — see `bin/lib/policy.js`'s header comment for why)
- No `PreToolUse` hook or any `bin/lib/` code change — this lever has no interceptable tool call to gate on and is intentionally soft-enforced, same as every other auto-mode-contract lever
- No changes to `/superpowers:brainstorming`'s design-approval or spec-review gates, the wrap-up ops-item acknowledgment gate, or the Wrap-Up Review Console — all explicitly out of scope per the design doc
- No `/init` Phase 0 bootstrap offer for this lever — explicitly deferred, see design doc's "Out of scope"
- No attempt to make the softer CLAUDE.md `## Build\nexecution-strategy:` setting suppress the prompt — the fix works through the new hard policy lever only, not that pre-existing path
- No push to the separate `thomasholknielsen/claude-tweaks-marketplace` repo — that's a "Releasing" action requiring explicit user confirmation (pushing to a repo affects shared state), out of scope for this plan; only this repo's `plugin.json` version is bumped here
- Commit message style: imperative voice, no Conventional Commit prefixes (`skills/_shared/git-discipline.md`)
- Working directory: this worktree is already active at `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/execution-always-policy` on branch `worktree-execution-always-policy` — every task must `pwd` and `git rev-parse --show-toplevel` to confirm it lands there before committing

---

### Task 1: Add and document the `execution.always` policy lever

**Files:**
- Modify: `.claude-tweaks/policy.yml`
- Modify: `skills/_shared/git-discipline.md:9` (insert new paragraph immediately after)

**Interfaces:**
- Produces: the policy key `execution.always: subagent` and its canonical documentation location (`git-discipline.md`), which Tasks 2 and 3 reference by name.

- [ ] **Step 1: Add the lever to policy.yml**

Current full file content:
```yaml
worktree.always: true
```

New full file content:
```yaml
worktree.always: true
execution.always: subagent
```

- [ ] **Step 2: Verify**

Run: `cat "$(git rev-parse --show-toplevel)/.claude-tweaks/policy.yml"`
Expected output exactly:
```
worktree.always: true
execution.always: subagent
```

- [ ] **Step 3: Document the lever in git-discipline.md**

In `skills/_shared/git-discipline.md`, insert a new paragraph immediately after the existing `worktree.always` paragraph (the one starting "Independent of any pipeline run...") and before the `## Rules — NON-NEGOTIABLE` heading.

Old text (this exact paragraph, verbatim — matches the current file):
```
Independent of any pipeline run, a project can opt into `worktree.always: true` in `.claude-tweaks/policy.yml` — when set, the same PreToolUse hook denies any `Edit`, `Write`, `NotebookEdit`, or `git commit` whose target isn't already inside a linked git worktree, even before `/build` or `/flow` has ever run. Unlike E1, this check needs no recorded run state; it fires from the first prompt of a session. `/init` Phase 0 Step 6 offers this opt-in during bootstrap (recommended by default, re-offered on later re-runs if declined) — the flag can also be hand-edited into `policy.yml` directly. Set up the worktree first via `/superpowers:using-git-worktrees`, then retry the edit inside it.
```

New text (old paragraph unchanged, followed by a blank line and the new paragraph):
```
Independent of any pipeline run, a project can opt into `worktree.always: true` in `.claude-tweaks/policy.yml` — when set, the same PreToolUse hook denies any `Edit`, `Write`, `NotebookEdit`, or `git commit` whose target isn't already inside a linked git worktree, even before `/build` or `/flow` has ever run. Unlike E1, this check needs no recorded run state; it fires from the first prompt of a session. `/init` Phase 0 Step 6 offers this opt-in during bootstrap (recommended by default, re-offered on later re-runs if declined) — the flag can also be hand-edited into `policy.yml` directly. Set up the worktree first via `/superpowers:using-git-worktrees`, then retry the edit inside it.

A sibling lever, `execution.always: subagent` in the same file, pins `/claude-tweaks:build`'s execution-strategy axis to `subagent` — `batched` is never offered by the build-strategy prompt and is rejected if passed explicitly (see `/claude-tweaks:build`'s Build Options). Unlike `worktree.always`, this lever has no mechanical `PreToolUse` backstop: there is no interceptable tool call for "which execution strategy did the assistant choose," the way there is for "which directory did this edit land in." Enforcement here is the same as every other lever in the auto-mode-contract system (scope-creep, review-severity-floor, etc.) — the assistant reads `.claude-tweaks/policy.yml` and follows it, with no code-level fallback if it doesn't.
```

- [ ] **Step 4: Verify**

Run: `grep -c "execution.always" "$(git rev-parse --show-toplevel)/skills/_shared/git-discipline.md"`
Expected output: `1` (the new paragraph introduces the key exactly once, in "A sibling lever, `execution.always: subagent`")

Run: `grep -n "no mechanical .PreToolUse. backstop" "$(git rev-parse --show-toplevel)/skills/_shared/git-discipline.md"`
Expected: one match, on the new paragraph's second sentence.

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add .claude-tweaks/policy.yml skills/_shared/git-discipline.md
git commit -m "Add execution.always policy lever, mirroring worktree.always"
git log --oneline -3
```
Expected: the new commit is HEAD, on branch `worktree-execution-always-policy`.

---

### Task 2: Make `/claude-tweaks:build` respect `execution.always`

**Files:**
- Modify: `skills/build/build-options.md`
- Modify: `skills/build/SKILL.md`

**Interfaces:**
- Consumes: the policy key name `execution.always: subagent` established in Task 1.

- [ ] **Step 1: Add the Execution-axis collapse note in build-options.md**

In `skills/build/build-options.md`, immediately after the existing `worktree.always` paragraph and before the invocation-examples code block.

Old text (exact, matches current file):
```
When `.claude-tweaks/policy.yml` sets `worktree.always: true`, the Git axis above collapses to `worktree` only — `current-branch` is not offered by the prompt, is rejected if passed explicitly, and every invocation example and default-resolution rule below that mentions `current-branch` is inapplicable for a project with this policy on. The mechanical PreToolUse gate denies any edit outside a worktree regardless of what this file's defaults say (see `_shared/git-discipline.md`).
```

New text (old paragraph unchanged, blank line, new paragraph):
```
When `.claude-tweaks/policy.yml` sets `worktree.always: true`, the Git axis above collapses to `worktree` only — `current-branch` is not offered by the prompt, is rejected if passed explicitly, and every invocation example and default-resolution rule below that mentions `current-branch` is inapplicable for a project with this policy on. The mechanical PreToolUse gate denies any edit outside a worktree regardless of what this file's defaults say (see `_shared/git-discipline.md`).

When `.claude-tweaks/policy.yml` sets `execution.always: subagent`, the Execution axis above collapses to `subagent` only — `batched` is not offered by the prompt and is rejected if passed explicitly. Unlike `worktree.always`, this has no mechanical backstop — there is no interceptable tool call for "which execution strategy did the assistant choose" — so this lever is honored by the assistant reading `.claude-tweaks/policy.yml`, the same as every other auto-mode-contract lever (see `_shared/git-discipline.md` for the full enforcement-asymmetry note).
```

- [ ] **Step 2: Add the policy-lever-lock item to Default resolution**

Old text (exact, matches current file):
```
### Default resolution

1. Explicit arguments (`/claude-tweaks:build 42 batched current-branch`) — always win
```

New text:
```
### Default resolution

0. **Policy lever lock** (checked first): `.claude-tweaks/policy.yml`'s `execution.always: <value>` and/or `worktree.always: true` fix their respective axis outright — a locked axis is never asked about, and an explicit CLI argument that contradicts it (`batched` under `execution.always`, `current-branch` under `worktree.always`) is rejected rather than silently honored. The remaining precedence order below applies only to axes not locked by policy.
1. Explicit arguments (`/claude-tweaks:build 42 batched current-branch`) — always win
```

- [ ] **Step 3: Rewrite the "Prompt for build options" trigger to check policy first**

Old text (exact, matches current file):
```
### Prompt for build options

When execution strategy AND git strategy are both missing from arguments, ask once — the two choices are correlated (the 2x2 above already enumerates the combinations), so they are one decision. Call `AskUserQuestion` with:

- `question`: `"How should this build run?"`, `header`: `"Build strategy"`, `multiSelect`: `false`
- Option 1 — `label`: `"Subagent + worktree (Recommended)"`, `description`: `"Automated review chain, isolated workspace"`
- Option 2 — `label`: `"Subagent + current-branch"`, `description`: `"Automated review chain, no isolation"`
- Option 3 — `label`: `"Batched + worktree"`, `description`: `"Human reviews every 3 tasks, isolated workspace"`
- Option 4 — `label`: `"Batched + current-branch"`, `description`: `"Human reviews every 3 tasks, no isolation"`

When only ONE was provided as an argument (e.g., `/build 42 batched`), call `AskUserQuestion` for just the missing one with a simple 2-option question instead. Skip the call entirely if both were provided.

**In `auto` mode**, skip this prompt and use the CLAUDE.md / fallback values without asking (per the Pipeline Config Manifesto contract — see `_shared/auto-mode-contract.md`).
```

New text:
```
### Prompt for build options

Before checking `$ARGUMENTS`, resolve any axis locked by policy: `execution.always` fixes Execution to `subagent`; `worktree.always: true` fixes Git to `worktree`. A policy-locked axis is never asked about, in any mode — auto or interactive — and counts as already resolved for the rest of this section.

When execution strategy AND git strategy are both still unresolved after policy and arguments, ask once — the two choices are correlated (the 2x2 above already enumerates the combinations), so they are one decision. Call `AskUserQuestion` with:

- `question`: `"How should this build run?"`, `header`: `"Build strategy"`, `multiSelect`: `false`
- Option 1 — `label`: `"Subagent + worktree (Recommended)"`, `description`: `"Automated review chain, isolated workspace"`
- Option 2 — `label`: `"Subagent + current-branch"`, `description`: `"Automated review chain, no isolation"`
- Option 3 — `label`: `"Batched + worktree"`, `description`: `"Human reviews every 3 tasks, isolated workspace"`
- Option 4 — `label`: `"Batched + current-branch"`, `description`: `"Human reviews every 3 tasks, no isolation"`

When only ONE axis is still unresolved (whether because an argument supplied the other, or policy locked it), call `AskUserQuestion` for just that one with a simple 2-option question instead. Skip the call entirely if both are resolved.

**In `auto` mode**, skip this prompt and use the CLAUDE.md / fallback values for any axis not already resolved by policy or an explicit argument (per the Pipeline Config Manifesto contract — see `_shared/auto-mode-contract.md`).
```

- [ ] **Step 4: Verify build-options.md edits**

Run: `grep -n "Policy lever lock\|resolve any axis locked by policy\|Execution axis above collapses to .subagent" "$(git rev-parse --show-toplevel)/skills/build/build-options.md"`
Expected: three matches, one per phrase, confirming all three edits landed.

- [ ] **Step 5: Add the parallel summary-table note in build/SKILL.md**

Old text (exact, matches current file):
```
When `.claude-tweaks/policy.yml` sets `worktree.always: true`, the Git axis has only one value: `current-branch` is not offered and is rejected if passed explicitly — the mechanical PreToolUse gate would deny any edit outside a worktree regardless (see `_shared/git-discipline.md`).
```

New text (old sentence unchanged, blank line, new sentence):
```
When `.claude-tweaks/policy.yml` sets `worktree.always: true`, the Git axis has only one value: `current-branch` is not offered and is rejected if passed explicitly — the mechanical PreToolUse gate would deny any edit outside a worktree regardless (see `_shared/git-discipline.md`).

When `.claude-tweaks/policy.yml` sets `execution.always: subagent`, the Execution axis has only one value: `batched` is not offered and is rejected if passed explicitly — unlike the Git axis, there is no mechanical backstop for this one (see `_shared/git-discipline.md`).
```

- [ ] **Step 6: Verify build/SKILL.md edit**

Run: `grep -n "Execution axis has only one value" "$(git rev-parse --show-toplevel)/skills/build/SKILL.md"`
Expected: one match.

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/build/build-options.md skills/build/SKILL.md
git commit -m "Make /build respect execution.always — collapse the strategy prompt and reject batched"
git log --oneline -3
```
Expected: the new commit is HEAD.

---

### Task 3: Make `/claude-tweaks:flow` pass `subagent` explicitly to `/build`

**Files:**
- Modify: `skills/flow/SKILL.md`

**Interfaces:**
- Consumes: nothing new from Tasks 1-2 (this is a defense-in-depth change independent of the policy lever — it holds even in a project with no `execution.always` set).

- [ ] **Step 1: Extend the git-strategy resolution bullet in Step 1**

Old text (exact, matches current file — this is item 3 of the numbered list under `### Step 1: Validate Input`):
```
3. **Git strategy defaults to `worktree`** — same default as `/build`, flow never prompts. Resolution order:
   1. Explicit argument: `worktree` or `current-branch` in `$ARGUMENTS` — always wins
   2. CLAUDE.md `git-strategy` setting — project-level default (see `/claude-tweaks:build` default resolution)
   3. Fallback: `worktree`

   Do NOT prompt the user for git strategy — resolve it silently from the above. This is passed through to `/claude-tweaks:build` and controls isolation. Flow always uses `subagent` execution — no prompt needed for execution strategy.
```

New text:
```
3. **Git strategy defaults to `worktree`** — same default as `/build`, flow never prompts. Resolution order:
   1. Explicit argument: `worktree` or `current-branch` in `$ARGUMENTS` — always wins
   2. CLAUDE.md `git-strategy` setting — project-level default (see `/claude-tweaks:build` default resolution)
   3. Fallback: `worktree`

   Do NOT prompt the user for git strategy — resolve it silently from the above. This is passed through to `/claude-tweaks:build` and controls isolation. Flow always uses `subagent` execution — no prompt needed for execution strategy. Pass `subagent` as an explicit argument in the `/claude-tweaks:build` invocation (Step 4) rather than relying on `/build`'s own default-resolution chain — this keeps flow's execution-strategy guarantee independent of whatever CLAUDE.md or `.claude-tweaks/policy.yml` might otherwise resolve to for a standalone `/build` call.
```

- [ ] **Step 2: Verify**

Run: `grep -n "keeps flow's execution-strategy guarantee independent" "$(git rev-parse --show-toplevel)/skills/flow/SKILL.md"`
Expected: one match.

- [ ] **Step 3: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/flow/SKILL.md
git commit -m "Have /flow pass subagent explicitly to /build instead of relying on default resolution"
git log --oneline -3
```
Expected: the new commit is HEAD.

---

### Task 4: Bump the plugin version

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: nothing (pure administrative step, done last per this project's documented lesson that version bumps left implicit get silently absorbed by unrelated concurrent bumps).

- [ ] **Step 1: Check for a concurrent bump before touching the file**

Run: `cd "$(git rev-parse --show-toplevel)" && git log --oneline -3 -- .claude-plugin/plugin.json`
If the most recent entry is not `750e465 Fix ledger resolve-gate apply-all discoverability regression` (version `5.19.1`), stop and re-derive the next version number from whatever is actually current — do not assume `5.19.1` → `5.20.0` still applies.

- [ ] **Step 2: Bump the version**

Old text (exact, matches current file):
```json
  "version": "5.19.1",
```

New text:
```json
  "version": "5.20.0",
```

- [ ] **Step 3: Verify**

Run: `grep '"version"' "$(git rev-parse --show-toplevel)/.claude-plugin/plugin.json"`
Expected output: `  "version": "5.20.0",`

- [ ] **Step 4: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add .claude-plugin/plugin.json
git commit -m "Bump version to 5.20.0 — execution.always policy lever"
git log --oneline -5
```
Expected: the new commit is HEAD; the four task commits from this plan are the most recent four entries.

**Note for the human partner (not a task — do not automate):** this bump is local to this repo only. Mirroring the version into the separate `thomasholknielsen/claude-tweaks-marketplace` repo is a "Releasing" action (per this repo's own CLAUDE.md "Releasing (two repos)" section) that pushes to a repository outside this checkout — do that deliberately, when you're ready to actually publish this release, not as part of this plan's automated execution.
