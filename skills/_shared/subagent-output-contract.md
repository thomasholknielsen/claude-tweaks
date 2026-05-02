# Subagent Output Contract

Canonical output formats for parallel-dispatched subagents. Referenced from every Form B / Form C parallel-execution site across skills.

This file is the single source of truth. Skills include the relevant template **literally** in their `Task()` prompts — agents only see what's in their prompt, they cannot read sibling files.

## Why this exists

Subagent output gets re-injected into the main thread's context. Three agents each returning 800 tokens of prose is 2400 tokens of overhead before the main thread does anything. Structured templates cut that by 60-80% while improving the consistency of findings.

## Template A — Review-style (returns findings)

Use when an agent audits code, designs, or specs and returns findings to be acted on.

```
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

**Used by:** `/review` (review angles), `/visual-review` (per-page review agents), `/reflect` (per-lens reflection).

## Template B — Search-style (returns locations)

Use when an agent locates code, files, or references.

```
OUTPUT FORMAT (required):
Return ONLY bullet lines, one per match:

- {path}:{line} — {one-line context}

If no matches: return literal text "No matches."
Do not add narration or grouping headers.
```

**Used by:** `/journeys` (per-journey extraction), `/stories` (per-flow probe), `/build` (search subagents).

## Template C — Scout-style (returns yes/no + evidence)

Use when an agent answers a binary question with brief evidence.

```
OUTPUT FORMAT (required):
First line: "yes" or "no"
Second line onward: up to 3 bullet lines of evidence (path:line — context).
Maximum 200 tokens total.
```

**Used by:** `/test` (parallel verification scouts), pre-checks before larger parallel dispatch.

## Re-prompt on violation

When an agent returns malformed output (no table, narration before the table, wrong columns), the dispatcher re-prompts:

```
Your output didn't match the required format. Re-emit using only this format:
{template repeated}
Do not add explanation.
```

Cap at one retry. If still malformed, accept what you got and move on (do not loop).

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Padding the template with optional sections "if relevant" | Agents include them every time, defeating the compression. |
| Using soft directives like "be concise" or "summarize" | Too soft — agents drift back to prose. |
| Asking for both narration AND a table | Agents pick narration. The contract must be exclusive. |
| Omitting the severity scale | Agents invent their own scales (P0/P1, MUST/SHOULD, urgent/normal), making aggregation impossible. |
| Letting agents read sibling files for the template | Agents only see their prompt. Always inline the template literally. |
| Skipping the "if no findings" literal text | Without it, agents pad empty results with explanation. |

## How to integrate at a dispatch site

In a Form B blockquote:

```
> **Parallel execution:** Dispatch {scope} as parallel Task agents — each runs independently and returns findings in Template A format. Assemble results after all agents complete.
> **Output contract:** Each agent must follow Template A from `skills/_shared/subagent-output-contract.md`. Inline the template literally in the dispatch prompt; reject and re-prompt on format violations.
```

In the actual `Task()` call, the prompt body must contain the literal template — not a reference to it.
