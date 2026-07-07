# Review — Step 3 Routing (Code Review Findings)

Loaded by `/claude-tweaks:review` Step 3 after lenses 3a-3i have produced findings. Contains the full routing rules — severity-based auto routing, the interactive batch table, recommendation rules, deferral gate, and parallel-fix dispatch contract. Lazy-loaded only when findings actually exist (skip the load entirely when all lenses returned "No findings.").

## Per-lens Calibration + Output template (dispatch contract)

The CALIBRATION filter and severity scale below are the canonical copy from `_shared/criteria-review-quality.md`, reproduced here because dispatched agents cannot read sibling files. Keep them byte-identical to the fragment.

The Calibration and Output template MUST be reproduced byte-identical in every dispatched per-lens reviewer agent's prompt. Do NOT adapt, summarize, or paraphrase — the cross-lens reproduction logic in Step 3.5 depends on every agent applying the same filter.

```markdown
CALIBRATION (required):
Only flag issues where:
- the user will hit a bug, broken state, or unsafe behavior
- the code will fail under realistic load, edge cases, or future maintenance
- a project convention is violated in a way that compounds (not isolated stylistic choices)

Do NOT flag:
- alternate naming you'd prefer ("`fetchUser` would read better as `getUser`")
- formatting, whitespace, or import ordering quibbles
- "could be DRYer" without a concrete second caller that proves the duplication is real
- hypothetical edge cases the spec didn't require ("what if the input is a 4GB string?")
- missing comments on self-explanatory code

When in doubt: would a calibrated senior engineer block a PR on this finding alone? If no, drop it.

OUTPUT FORMAT (required):
Return ONLY a markdown table, no preamble:

| Severity | Path:Line | Finding | Evidence |
|---|---|---|---|
| critical | src/auth.ts:42 | Missing token expiry check | uses `<` not `<=` |
| medium | src/api.ts:180 | Unhandled rejection | line 184: `await fetch(...)` no try/catch |

Severity scale: critical / high / medium / low / info
If no findings: return literal text "No findings."
Do not add narration, headers, or summaries before or after the table.
```

Each agent's first reply line must be one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`, then the table. The dispatcher merges findings into the Step 3 Routing table below — Severity maps directly, Path:Line maps to the Affected column, Finding maps to the Finding column, and the dispatcher fills the Category column from the lens that produced it. Re-prompt once on format violation.

## Inputs

- Findings table merged from lenses 3a-3i, plus open QA ledger entries with phase `test/qa`.
- Pipeline run directory (when in auto/hybrid mode).
- `review-severity-floor` value from `config.yml` (default `low`).

**Every finding from lenses 3a-3i must be explicitly resolved.** When lenses were dispatched as parallel Task agents, merge their results into a single table here: combine all findings, preserve their category labels, and de-duplicate — if two lenses flag the same issue, keep the entry with the higher severity. UX findings from lens 3h, coverage findings from lens 3g-cov, and documentation findings from lens 3i are merged into the batch table alongside code review findings with their respective categories ("UX", "Coverage", "Docs").

Unresolved QA ledger entries (status `open`, phase `test/qa`) are included in the code review findings table alongside code review findings. Use the category and severity from the ledger entry. This ensures QA failures flow through the same resolution process as code review findings — they must be explicitly fixed, deferred, or accepted before the review can pass.

## Auto mode (severity-based routing)

When a pipeline run directory exists (see `_shared/pipeline-run-dir.md` for the resolution order and bash snippet), read `review-severity-floor` from `config.yml` (default `low`).

Per the `/review` Step 3 Routing row in `_shared/auto-mode-contract.md`, severity routes to: low → AUTO, medium → STAGED, high → STAGED, critical → KEPT-PROMPT (rare; security/correctness hard-fails the bookend). Append every entry to `decisions.md` under the `## /review` heading.

| Severity | Default action under `review-severity-floor: low` | Log entry |
|---|---|---|
| **Critical** | Stage as patch + `KEPT-PROMPT` — surface inline ALSO. Critical findings always interrupt. | `KEPT-PROMPT {time} — Step 3 Routing: critical finding {category} at {file:line}. Surfaced inline. Reversibility: high.` |
| **High** | Stage as patch in `staged/review-{n}.patch`. Surface at Review Console. | `STAGED {time} — Step 3 Routing: high-severity finding {category} at {file:line}. Stage path: staged/review-{n}.patch. Reversibility: high.` |
| **Medium** | Stage as patch in `staged/review-{n}.patch`. Surface at Review Console. | `STAGED {time} — Step 3 Routing: medium-severity finding {category} at {file:line}. Stage path: staged/review-{n}.patch. Reversibility: high.` |
| **Low** | Auto-apply the fix. Commit. | `AUTO {time} — Step 3 Routing: applied low-severity {category} fix at {file:line}. Reversibility: high; commit: {hash}.` |

When `review-severity-floor: medium`: auto-apply Low AND Medium; stage High; prompt Critical.
When `review-severity-floor: none`: stage everything; never auto-apply.

After routing, append all findings to the ledger as usual (status `open` for staged, `fixed` for auto-applied). The Review Console at `/wrap-up` Step 8.6 surfaces staged items for batch approval.

## Interactive mode (per-batch user input)

Present all findings as a single batch table with recommended actions pre-filled:

```
### Code Review Findings

| # | Finding | Severity | Category | Affected | Recommended |
|---|---------|----------|----------|----------|-------------|
| 1 | {description} | Critical | Security | {files} | Fix now |
| 2 | {description} | High | Error | {files} | Fix now |
| 3 | {description} | Medium | Convention | {files} | Fix now |
| 4 | {description} | Low | Perf | {files} | Fix now |
```

The table renders as markdown, as above. Immediately below it, call `AskUserQuestion` with:

- `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply all recommended fixes"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

**Recommendation rules** (interactive mode — severity-to-route mapping in `auto` mode is the table at the top of this file):

- **Critical** (security vulnerabilities, data loss risks) — always "Fix now". Non-negotiable.
- **High** (broken behavior, missing validation) — default "Fix now".
- **Medium** — default "Fix now". Even if effort is moderate, close the gap now.
- **Low** — default "Fix now". Most low-severity findings are trivial to fix.
- **"Don't fix"** — only for false positives or intentional patterns. If the finding is a genuine improvement, it must be fixed or routed — never silently dismissed.

**When "Fix now" isn't possible**, route to the right destination:

- **Defer** (DEFERRED.md) — the fix is understood but it's bigger and not relevant to the current work. Include origin spec, affected files, and trigger for when to revisit.
- **Capture to INBOX** — the finding is complex or uncertain and needs brainstorming/exploration before it can be acted on. This enters the full capture → challenge → `/superpowers:brainstorming` pipeline.

**Deferral gate:** An item may only be deferred if it meets ALL of these:

- Pre-existing (not introduced by this build), OR requires design discussion that can't be resolved in the current session
- Has a clear trigger documented for when to revisit

Items introduced by this build that are fixable now must be fixed now — even if the fix is imperfect, closing the gap is better than deferring.

If any findings are "Fix now", make the changes, re-run `/claude-tweaks:test`, and verify fixes didn't introduce new findings.

## Parallel fix dispatch (3+ independent fixes)

> **Working Directory Discipline (applies to every fix-agent Task() dispatch):** Resolve `WORKTREE = $(git rev-parse --show-toplevel)` once in the dispatcher. Anchor every git command in the agent prompt as `git -C "$WORKTREE" …`, and prefix any path-sensitive shell command with `cd "$WORKTREE" && …`. CWD does not propagate reliably to parallel agents; without the anchor, fix-agents can edit the wrong checkout. See `_shared/git-discipline.md` and the Working Directory Discipline section in `_shared/subagent-output-contract.md`.

> **Parallel execution (conditional):** When there are 3+ "Fix now" findings across different files with no shared file dependencies, dispatch fixes as parallel agents using the `/superpowers:dispatching-parallel-agents` pattern — one agent per independent fix domain. Each agent gets: specific file scope, finding details, constraint to not modify other files. Returns summary of changes. After all agents complete, check for conflicts between agent changes, then re-run `/claude-tweaks:test`. When fixes overlap files or there are fewer than 3 findings, fix sequentially in the main thread.
>
> **Model tier:** Standard (Sonnet) — fix agents make targeted code edits constrained to their assigned files. Upgrade to Capable (Opus) only when the fix requires architectural redesign rather than localized correction.
>
> **Output template (each agent must follow exactly):**
>
> ```markdown
> OUTPUT FORMAT (required):
> First line: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
> Then per change made:
> - {path}:{line} — {change description}
> If no changes made: return literal text 'No changes.'
> ```
>
> The dispatcher inspects the bullets for cross-file conflicts before re-running `/claude-tweaks:test`.

**Write all findings to the open items ledger** (see `/claude-tweaks:ledger`). Use the appropriate `review/*` phase. Status: `open` for "Fix now" items, `deferred` for DEFERRED.md routes, `accepted` for "Don't fix" items (with reason). After fixing, update status to `fixed`.

## Routing bias

Fix it now — always the recommended default, regardless of severity. Defer when the fix is understood but bigger and not relevant now. Capture to INBOX when the finding needs exploration before it can be acted on. The goal is to close gaps early, not accumulate a backlog.

## Wait-for-resolution + auto-advance

**Wait for resolution** (interactive mode only). When code review findings exist, present the findings table and wait for the user's response before proceeding to Step 4. In `auto` mode, findings are auto-routed per the severity table above and the skill proceeds without waiting.

**Auto-advance on zero findings:** When there are zero code review findings AND zero unresolved QA ledger entries (`open` items with phase `test/qa`), auto-advance to Step 4 without waiting for user input. Present "No code review findings" as a note within the Step 4 hindsight message.

**Small batch consolidation:** When total findings across Step 3 Routing and Step 4 combined are 5 or fewer items, consolidate into a single batch table with a "Type" column (`Code Review` / `Hindsight`) instead of two sequential tables. This saves one interaction. When more than 5 total, present sequentially (one per message) to keep each decision manageable.
