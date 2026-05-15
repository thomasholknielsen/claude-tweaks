# Common Step 1.5 — Plan Audit

Audit the plan against the actual repo before dispatching execution work. Catches the failure mode where the plan's "Files" sections omit a relevant file and the omission isn't noticed until a late cross-reference audit.

**Skip this step entirely when** the plan has fewer than 3 file references (trivial plans don't benefit from audit) AND no `Scope keywords:` field is present.

## Check A — Plan files exist (always runs)

For each path mentioned in the plan's "Files:" sections (under "Create:", "Modify:", "Delete:"), verify it exists (for Modify/Delete) or that its parent directory exists (for Create). List any missing paths.

**On Check A failure:** Stop. Present the missing paths. The plan needs revision before execution starts.

## Check B — Scope-keyword sweep (conditional)

Runs when the plan or design doc declares `Scope keywords:`. When the plan or design doc has a `Scope keywords:` line listing patterns (e.g., `Scope keywords: playwright-cli, claude_in_chrome, PLAYWRIGHT_MCP`), grep the repo for each keyword and list any files containing matches that aren't in the plan's file list.

```bash
# Example for a removal/migration plan
grep -rln -E "playwright-cli|claude_in_chrome|PLAYWRIGHT_MCP" skills/ agents/ hooks/ README.md .claude-plugin/ CLAUDE.md docs/ 2>/dev/null
```

Read the project's `Plan audit / scope-keywords-required` CLAUDE.md setting:
- `scope-keywords-required: false` (default) — Check B is informational; surface missing-from-plan files as a warning, proceed.
- `scope-keywords-required: true` — Check B is gating; if any matched files aren't in the plan AND the plan/design has no `Scope keywords:` field, refuse to start. Tells the user: "This project requires scope keywords. Add `Scope keywords: <pattern1, pattern2>` to the plan or design doc and re-run."

## On Check B finding files outside the plan

### Auto mode (pipeline run dir exists)

Read `scope-creep` from `config.yml` (default `add-to-plan` per Manifesto). Apply:

| Policy | Action | Log entry |
|---|---|---|
| `add-to-plan` (default) | Auto-add matched files to the plan as new tasks. Commit the plan update. | `AUTO {time} — Step 1.5: scope-creep — added {N} files to plan ({list}). Reversibility: high (commit {hash}).` |
| `stop-and-ask` | Stop. Present the list inline. (Falls through to interactive prompt below.) | `KEPT-PROMPT {time} — Step 1.5: scope-creep matched {N} files, policy is stop-and-ask. Surfaced inline.` |
| `drop` | Note the matched files in `decisions.md` as `STAGED` for Review Console; proceed without adding to plan. | `STAGED {time} — Step 1.5: scope-creep matched {N} files, policy is drop. Files: {list}. Surface at Review Console.` |

### Interactive mode (or `stop-and-ask` policy)

Present the list and ask:

```
Scope keywords match {N} file(s) not in the plan:
- {file 1}
- {file 2}

1. Add to plan and continue **(Recommended)** — I'll add these as new tasks to the plan
2. Continue without — I've checked, these are intentionally excluded
3. Stop — let me revise the plan manually
```
