# Document worktree-isolated-session compound-Bash guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the Claude Code CLI harness's worktree-isolated-session Bash guard (its refusal boundary and a workaround pattern), clearly distinguished from this plugin's own `worktree.always` PreToolUse gate, so it's discoverable instead of rediscovered cold.

**Architecture:** Pure documentation change. Add one canonical section to `docs/skill-authoring.md` (the file that already carries a passing, undercited mention of this fact). Update the existing citation to point at it instead of restating. Add a one-line cross-reference from `skills/_shared/worktree-setup.md`, the canonical worktree-procedure file every worktree-creation call site already reads.

**Tech Stack:** Markdown only. No code.

**Spec:** `.claude-tweaks/pipelines/2026-08-15T112834-record-174/work/174-spec.md`

## Global Constraints

- No changes to any file under `bin/lib/hooks/` — this is a documentation-only record (spec Acceptance Criteria).
- The new section states the refusal boundary as empirically observed, not as a guaranteed harness contract (spec Gotchas: "read as 'the shape as last observed,' not a guaranteed contract").
- Existing test suite (`npm test`) must still pass unchanged — no test additions needed since nothing executable changed.

---

### Task 1: Add the canonical section and its cross-references

**Files:**
- Modify: `docs/skill-authoring.md` — insert new `## Worktree-isolated sessions and compound Bash commands` section after the existing `## Plugin-root references (\`CLAUDE_PLUGIN_ROOT\`)` section (currently ends around line 80, immediately before `## Interaction style directive`); also modify the bullet at (currently) line 77 of that same section.
- Modify: `skills/_shared/worktree-setup.md` — add one cross-reference line near the top (after the intro paragraph, before `## Resolving \`{integration-branch}\``).
- Test: none (documentation-only; verification is by grep, not by a test runner).

**Interfaces:** N/A — no code, no functions, no signatures. This task is self-contained.

- [ ] **Step 1: Insert the new section in `docs/skill-authoring.md`**

  Find this exact existing text (the end of the "Plugin-root references" section, immediately before `## Interaction style directive`):

  ```markdown
  - A `Cannot find module '/bin/…'` / `'undefined/bin/…'` failure means the placeholder reached the shell unsubstituted — re-issue with the resolved absolute path; do not diagnose the CLI itself.

  ## Interaction style directive
  ```

  Replace it with (inserting the new section between the two):

  ```markdown
  - A `Cannot find module '/bin/…'` / `'undefined/bin/…'` failure means the placeholder reached the shell unsubstituted — re-issue with the resolved absolute path; do not diagnose the CLI itself.

  ## Worktree-isolated sessions and compound Bash commands

  A session working inside a worktree created by `EnterWorktree` (or entered into one) is subject to a Claude Code CLI harness-level guard on the Bash tool — separate from, and unrelated to, this plugin's own `worktree.always` PreToolUse gate (`bin/lib/hooks/pre-tool-use.js`). The two are easy to conflate when triaging feedback (`#174` was originally filed against the wrong one). When the harness cannot cheaply verify that a command's effects stay inside the worktree, it refuses the whole call outright: `this command is too complex to verify that it stays inside the worktree; break it into plain, separate commands.` This is harness code the plugin has no access to and cannot alter from `bin/hooks.js` or any hook — the plugin's own gate produces entirely different deny text (`claude-tweaks: this project requires an isolated worktree for...`, `claude-tweaks working-directory discipline: ...`), which is how the two are told apart in practice.

  Empirically observed boundary (2026-08-15, tested live against the harness build available then — read this as "the shape as last observed," not a guaranteed contract, since the harness may change independently of this plugin):

  - A single command — including one with a `$(...)` substitution, or a `|` pipeline — passes.
  - A 2-command `&&` chain of simple commands passes.
  - Two or more independent `$(...)` substitutions in one command (e.g. comparing `$(git rev-parse A)` against `$(git rev-parse B)` inside a `[ ]` test), a `;`-separated sequence of top-level commands, and any `for`/`while` loop are all refused — even when every command inside is a pure read, or the loop body has no filesystem access at all.
  - A heredoc (`cat > file <<EOF`) is a single command and passes on its own, regardless of whether the write target is inside or outside the worktree.

  **Workaround:** default to one plain command per Bash call inside a worktree session. When real multi-step logic is unavoidable, write it to a scratch script with the `Write` tool (not a Bash heredoc chained to anything else) and invoke that script with a single plain command (`node script.mjs`, `bash script.sh`).

  ## Interaction style directive
  ```

- [ ] **Step 2: Update the existing citation clause in the same file**

  Find this exact existing bullet (in the "Plugin-root references" section, the rule about not hardcoding `CLAUDE_PLUGIN_ROOT`):

  ```markdown
  - Keep writing the `${CLAUDE_PLUGIN_ROOT}` spelling in skill prose. It is the greppable, install-location-independent convention. Do not hardcode an absolute path (plugin cache locations differ per machine and per account config dir), and do not add a shell lookup ladder to resolve it at runtime — a glob over cache directories is fragile across those same layouts, and worktree-isolated sessions refuse compound commands, so the ladder is unrunnable exactly where builds happen.
  ```

  Replace it with:

  ```markdown
  - Keep writing the `${CLAUDE_PLUGIN_ROOT}` spelling in skill prose. It is the greppable, install-location-independent convention. Do not hardcode an absolute path (plugin cache locations differ per machine and per account config dir), and do not add a shell lookup ladder to resolve it at runtime — a glob over cache directories is fragile across those same layouts, and worktree-isolated sessions refuse multi-step commands (see "Worktree-isolated sessions and compound Bash commands" below), so the ladder is unrunnable exactly where builds happen.
  ```

- [ ] **Step 3: Verify Steps 1-2 with grep**

  Run: `grep -n "Worktree-isolated sessions and compound Bash commands" docs/skill-authoring.md`
  Expected: two matches — the new `##` heading and the updated citation clause's parenthetical.

  Run: `grep -c "worktree-isolated sessions refuse compound commands" docs/skill-authoring.md`
  Expected: `0` (the old inline phrasing is gone, replaced by the citation).

- [ ] **Step 4: Add the cross-reference in `skills/_shared/worktree-setup.md`**

  Find this exact existing text (end of the file's intro paragraph, immediately before the `## Resolving` section):

  ```markdown
  Canonical home for the two staleness-protection procedures every worktree-creation call site
  needs: catching a freshly created worktree up with the integration branch (unconditional), and
  warning the owner of the *current* branch before creating one, when that branch may itself be
  behind the integration branch. Consolidates what were two byte-identical copies
  (`skills/flow/validation.md` Step 2.5, `skills/build/worktree-setup.md` Step 1) — see CLAUDE.md's
  `[IL-32]`. `skills/_shared/scratch-worktree.md` Section 3 cites the Post-creation catch-up section
  below instead of carrying its own copy.

  ## Resolving `{integration-branch}`
  ```

  Replace it with (adding one sentence to the intro paragraph):

  ```markdown
  Canonical home for the two staleness-protection procedures every worktree-creation call site
  needs: catching a freshly created worktree up with the integration branch (unconditional), and
  warning the owner of the *current* branch before creating one, when that branch may itself be
  behind the integration branch. Consolidates what were two byte-identical copies
  (`skills/flow/validation.md` Step 2.5, `skills/build/worktree-setup.md` Step 1) — see CLAUDE.md's
  `[IL-32]`. `skills/_shared/scratch-worktree.md` Section 3 cites the Post-creation catch-up section
  below instead of carrying its own copy. For the harness's separate worktree-session compound-Bash
  guard (a different mechanism from anything in this file), see `docs/skill-authoring.md`'s
  "Worktree-isolated sessions and compound Bash commands" section.

  ## Resolving `{integration-branch}`
  ```

- [ ] **Step 5: Verify Step 4 with grep**

  Run: `grep -n "Worktree-isolated sessions and compound Bash commands" skills/_shared/worktree-setup.md`
  Expected: one match.

- [ ] **Step 6: Run the full test suite to confirm nothing broke**

  Run: `npm test 2>&1 | tail -20`
  Expected: the same pass count as this build's clean baseline (3574 passed, 0 failed) — a docs-only change touches no test-covered code path.

- [ ] **Step 7: Commit**

  ```bash
  git add docs/skill-authoring.md skills/_shared/worktree-setup.md
  git commit -m "Document Claude Code's worktree-session compound-Bash guard (#174)"
  ```
