# Subagent Contract

Canonical input/output rules for parallel-dispatched subagents. Referenced from every Form B / Form C parallel-execution site across skills.

This file is the single source of truth. Skills include the relevant template **literally** in their `Task()` prompts — agents only see what's in their prompt, they cannot read sibling files.

## Why this exists

Three forces compound when dispatching parallel agents:

1. **Input bloat** — passing the conversation history or "all relevant context" to N agents multiplies token cost by N. Each agent should get a clean room.
2. **Output bloat** — three agents each returning 800 tokens of prose is 2400 tokens of overhead before the main thread does anything. Structured templates cut that by 60-80%.
3. **Model mismatch** — dispatching every agent at the strongest available model wastes cost and latency. Most subagent jobs are mechanical.

The contract addresses all three: **input discipline** (below), **output templates** (Templates A/B/C), and **model selection** (per-dispatch tier guidance).

## Input Discipline

A dispatched agent is a clean room. Don't pass the conversation. Pass exactly:

1. **The task scope** — one sentence: "Audit `src/auth.ts` for the OWASP top 10."
2. **The file/path the agent should read** — explicit paths, not "the relevant code."
3. **The output template** — literally, inline. Agents only see what's in their prompt; they cannot read sibling files.
4. **Constraints that prevent overreach** — "Do not modify other files." "Read-only."

Do NOT pass: prior messages, the user's original phrasing, your own findings so far, or "background context for completeness." Each of those compounds across N agents.

When in doubt, give less context. If the agent comes back with `NEEDS_CONTEXT`, give it more on the re-dispatch.

## Working Directory Discipline

Agents do not inherit the dispatcher's CWD reliably. When a dispatch will run `git`, `node --test`, or any path-sensitive command, **anchor the working directory explicitly** in the prompt. Both forms work; pick one and use it consistently:

- **Explicit cd**: every shell step begins with `cd "/absolute/path/to/worktree" && ...`
- **`git -C` form**: every git command is `git -C "/absolute/path/to/worktree" <subcommand>`

Before any commit step, the implementer must echo `pwd` and `git rev-parse --show-toplevel` and verify both match the expected worktree. A mismatch means the commit is about to land on the wrong branch — `BLOCKED` is the correct response.

**Why this matters:** When the dispatcher is itself inside a worktree (e.g., running from `.claude/worktrees/<name>/`), a dispatched agent can resolve a different CWD and commit to the parent repo's checked-out branch instead of the worktree branch. The branches diverge silently — the dispatcher's `git status` looks fine, but the commit went to `main`. The same risk applies to reviewer agents that run `node --test` from the parent repo where the new test files don't exist and report false failures.

When the dispatch is for a verification or test-running agent (no commits), the working directory still matters: results depend on which files are visible.

During worktree-mode pipeline runs this rule is mechanically enforced — the plugin's PreToolUse hook denies commits whose resolved checkout differs from the run's recorded worktree assignment.

## Implementer Status Protocol

Every dispatched agent reports one of four statuses as the first line of its reply (before the output template):

| Status | Meaning | Dispatcher response |
|---|---|---|
| `DONE` | Task complete, no concerns | Accept output; proceed. |
| `DONE_WITH_CONCERNS` | Task complete, but the agent flagged doubts | Read the concerns. If correctness/scope → address before proceeding. If observational ("this file is getting large") → note and proceed. |
| `NEEDS_CONTEXT` | Information was missing from the dispatch | Provide what was missing; re-dispatch. |
| `BLOCKED` | Cannot complete the task | Diagnose: more context (re-dispatch), more capable model (upgrade), smaller scope (split), or wrong plan (escalate). Never force-retry with no changes. |

For review-style agents (Template A) the status line is followed by the findings table. For search-style (B) and scout-style (C), the status replaces any "no findings" sentinel.

```
DONE
| Severity | Path:Line | Finding | Evidence |
|---|---|---|---|
| ...
```

```
BLOCKED
Reason: couldn't locate the auth middleware referenced in the task scope.
Tried: grep -r "authMiddleware" src/, grep -r "requireAuth" src/
Need: actual file path of the auth middleware, or confirmation it doesn't exist.
```

SubagentStop hook (E3) logs replies missing the status line to the run dir's `events.jsonl` (best-effort — the event fires unreliably for Task dispatches, claude-code#27755).

## Model Selection

Match the model to the work. Specify the tier in the `Task()` dispatch.

| Tier | When to use | Examples |
|---|---|---|
| **Fast** (Haiku) | Mechanical: file location, pattern grep, structured extraction, single-file checks | `/journeys` per-journey extraction, `/stories` per-flow probe, `/test` parallel scouts, `/review` lens 3a (convention check), lens 3f (test quality on isolated files) |
| **Standard** (Sonnet) | Integration: multi-file analysis, cross-cutting findings, format-sensitive transforms | `/review` lenses 3b-3e (security, errors, perf, architecture), `/browse` agents, `/tidy` reviewers |
| **Capable** (Opus) | Judgment-heavy: design synthesis, UX analysis, ambiguous calibration, plan-quality review | `/review` lens 3h (UX analysis), `/challenge` Mode 4 aggregator (Layered MoA), `/specify` red-team synthesis |

Default to the cheapest model that can do the job. Upgrade explicitly when the agent comes back `BLOCKED` for reasoning reasons (not for context reasons).

When dispatching, name the tier in the prompt: `[Use: Fast model — this is a mechanical extraction task]`. The dispatcher (you) selects the actual model.

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

**Used by:** `/review` (review angles), `/visual-review` (per-page review agents), `/specify` (per-persona red-team findings).

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

## Not every consumer uses A/B/C

`/challenge`'s per-lens proposers follow this contract's input discipline, status-line protocol, and model-tier selection, but their output is a free-form 2-4 paragraph debiasing perspective (per `challenge/SKILL.md` Process Step 3), not Template A/B/C — the aggregator (Layered MoA, Step 4) synthesizes prose perspectives, not structured findings/locations/yes-no answers. When a dispatch's output genuinely doesn't fit A/B/C, define the format explicitly in the dispatch prompt rather than forcing it into one of the three.

## Re-prompt on violation

When an agent returns malformed output (no table, narration before the table, wrong columns), the dispatcher re-prompts:

```
Your output didn't match the required format. Re-emit using only this format:
{template repeated}
Do not add explanation.
```

Cap at one retry. If still malformed, accept what you got and move on (do not loop).

## Anti-Patterns

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
> **Contract:** Each agent follows the Subagent Contract — minimal input (scope + path + output template, no conversation), one of {DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED} as its first line, then Template A. Pick the cheapest model tier that fits ({Fast | Standard | Capable}). Inline the template literally; reject and re-prompt on format violations.
```

In the actual `Task()` call, the prompt body must contain the literal template — not a reference to it. Concrete example:

```
Task scope: Review src/auth.ts and src/api.ts for security issues.

Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required):
Return ONLY a markdown table, no preamble:

| Severity | Path:Line | Finding | Evidence |
|---|---|---|---|
| critical | src/auth.ts:42 | Missing token expiry check | uses `<` not `<=` |

Severity scale: critical / high / medium / low / info
If no findings: return literal text "No findings."
Do not add narration, headers, or summaries before or after the table.

[Use: Standard model.]
```

The blockquote above is the dispatch-site directive; the fenced block is what each `Task()` call's prompt actually contains.

## Related primitives

- `skills/_shared/multi-agent-coordination.md` — inter-agent coordination patterns (Reproduction, Debate, Multi-persona red-team, Layered MoA) that compose with these templates.
