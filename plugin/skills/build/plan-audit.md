# Common Step 1.5 — Plan Audit

Audit the plan against the actual repo before dispatching execution work. Catches the failure mode where the plan's "Files" sections omit a relevant file and the omission isn't noticed until a late cross-reference audit.

**Skip condition lives in `build/SKILL.md`'s Common Step 1.5 stub, not here** (the re-read cut: a caller deciding skip-vs-run must never need to load this file to make that decision). This file loads only once the step is confirmed to run.

## Check A — Plan files exist (always runs)

For each path mentioned in the plan's "Files:" sections (under "Create:", "Modify:", "Delete:"), verify it exists (for Modify/Delete) or that its parent directory exists (for Create). List any missing paths.

**On Check A failure:** Stop. Present the missing paths. The plan needs revision before execution starts.

## Check B — Scope-keyword sweep (conditional)

Runs when the plan or design doc declares `Scope keywords:`. When the plan or design doc has a `Scope keywords:` line listing patterns (e.g., `Scope keywords: playwright-cli, claude_in_chrome, PLAYWRIGHT_MCP`), grep the repo for each keyword and list any files containing matches that aren't in the plan's file list.

```bash
# Example for a removal/migration plan
grep -rln -E "playwright-cli|claude_in_chrome|PLAYWRIGHT_MCP" plugin/skills/ plugin/agents/ plugin/hooks/ plugin/.claude-plugin/ README.md CLAUDE.md docs/ 2>/dev/null
```

Resolve the `scope-keywords-required` setting — `SCOPE_KEYWORDS_REQUIRED=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values scope-keywords-required)`:
- `scope-keywords-required: false` — Check B is informational; surface missing-from-plan files as a warning, proceed.
- `scope-keywords-required: true` — Check B is gating; if any matched files aren't in the plan AND the plan/design has no `Scope keywords:` field, refuse to start. Tells the user: "This project requires scope keywords. Add `Scope keywords: <pattern1, pattern2>` to the plan or design doc and re-run."

## On Check B finding files outside the plan

### Auto mode (resolved mode is `auto`, including a standalone `/claude-tweaks:build {N} auto` invocation with no `/flow` parent)

Resolve `scope-creep` with ONE resolver call — `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" scope-creep` (resolve the run dir per `_shared/pipeline-run-dir.md` — spawned by `/flow`, or record-mode's own standalone run dir per its materialization exception) — which executes the standard precedence in `_shared/auto-mode-contract.md` (run `config.yml` → project `.claude-tweaks/policy.yml` → schema default) mechanically; apply the envelope's `value`, and carry the envelope's `source` into the row template's `[lever: …]` field (`_shared/auto-decision-log.md`'s Lever attribution section). Log the decision to whatever run dir resolves, per `_shared/pipeline-run-dir.md`'s resolution order — an explicit `auto` CLI arg always applies this branch, never the Interactive-mode prompt below, regardless of whether a Manifesto-computed `config.yml` exists. Apply:

| Policy | Action | Log entry |
|---|---|---|
| `add-to-plan` | Auto-add matched files to the plan as new tasks. Commit the plan update. | `AUTO {time} — Step 1.5: scope-creep — added {N} files to plan ({list}). Reversibility: high (commit {hash}). [lever: scope-creep=add-to-plan ({source})]` |
| `stop-and-ask` | Stop. Present the list inline. (Falls through to interactive prompt below.) | `KEPT-PROMPT {time} — Step 1.5: scope-creep matched {N} files, policy is stop-and-ask. Surfaced inline. [lever: scope-creep=stop-and-ask ({source})]` |
| `drop` | Note the matched files in `decisions.md` as `STAGED` for Review Console; proceed without adding to plan. | `STAGED {time} — Step 1.5: scope-creep matched {N} files, policy is drop. Files: {list}. Surface at Review Console. [lever: scope-creep=drop ({source})]` |

### Interactive mode (or `stop-and-ask` policy)

Present the list:

```
Scope keywords match {N} file(s) not in the plan:
- {file 1}
- {file 2}
```

Then call `AskUserQuestion` with:

- `question`: `"Scope keywords match {N} file(s) not in the plan. What do you want to do?"`, `header`: `"Scope creep"`, `multiSelect`: `false`
- Option 1 — `label`: `"Add to plan (Recommended)"`, `description`: `"I'll add these as new tasks to the plan"`
- Option 2 — `label`: `"Continue without"`, `description`: `"I've checked, these are intentionally excluded"`
- Option 3 — `label`: `"Stop"`, `description`: `"Let me revise the plan manually"`

## Check C — Verification-command pre-check (always runs)

Neither Check A nor Check B executes any command the plan itself declares — both are static content checks. Check C closes that gap: it pre-runs each task's own stated acceptance/verification command once, read-only, against current repo state, before Common Step 2 hands off to any execution strategy — i.e. before any task's own implementation has landed.

**Extraction:** for each `### Task N: ...` block in the plan, find its `- [ ] **Step 2: Run test to verify it fails**` sub-step and read the `Run: {command}` / `Expected: {text}` lines immediately following it — the literal template shape defined by the superpowers `writing-plans` skill's Task Structure section (cite it; do not restate its template here, since it lives in a different plugin and can drift independently). A task with no Step 2 `Run:`/`Expected:` pair — a non-code task (pure config/doc/manual work) — is skipped by Check C; there is nothing to pre-run.

**Execution:** run each extracted `{command}` once via Bash, against the plan's own worktree at its current HEAD, before Common Step 2 hands off to the execution strategy. This reuses the "run a plan-dictated command once, read-only, and record the output" discipline `skills/build/SKILL.md`'s Spec Step 3 "Verbatim-command run-once check" bullet already establishes; cite it rather than duplicating the discipline.

**Finding:** the only thing Check C flags is a command that already exhibits a passing/success signature — exit code 0 for a test runner, or output matching a success pattern (e.g. `PASS`, `0 failing`, `✓`) with no corresponding failure marker — despite the task declaring `Expected: FAIL ...`. A command erroring or cleanly failing pre-dispatch is **not** a Check C finding — only an already-passing result is. A hard error (missing module, import error, file not found) is common and expected for a later task in a plan whose tasks build on each other sequentially — running task 5's Step 2 command before any of tasks 1-4 have landed will often hard-error rather than assert-fail, and that's fine; do not widen this into flagging errors too, which would produce constant false positives on any plan with inter-task dependencies.

**On Check C failure:** Stop, unconditionally. Present the flagged task(s), their commands, and the actual output that already looks like a pass. The plan needs revision before execution starts — the same shape as Check A's stop above, not routed through Check B's auto-mode `scope-creep` policy table and with no `AskUserQuestion` branch: a non-discriminating verification command is a correctness gap the `_shared/auto-mode-contract.md` HARD-GATE exemption already covers (test failures), not a scope decision with a policy lever.

Check C shares Check A/B's existing skip gate (fewer than 3 file references and no `Scope keywords:` field, or `ceremony-profile: fast-lane`) — it introduces no new skip condition of its own.
