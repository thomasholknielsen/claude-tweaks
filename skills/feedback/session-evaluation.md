# Session Evaluation — transcript judge dispatch

Loaded by `skills/feedback/SKILL.md`'s session-evaluation step on bare (or `--queue`) invocation.
Never loaded on free-text invocation — a free-text learning has no transcript to judge.

## Transcript resolution

Runs in the main thread, before dispatch.

**Path:** `~/.claude/projects/<project-slug>/<session-id>.jsonl`.

- **`<project-slug>`:** derived from the session's absolute working-directory path — each `/`,
  space, and `.` in that path is replaced by `-`. Worked example: `/Users/alice/projects/my-app`
  becomes `-Users-alice-projects-my-app`. A path segment starting with `.` (e.g. a `.claude`
  segment inside a worktree path) produces a doubled hyphen where the directory separator and the
  leading dot both convert — that doubling is correct, not a bug to normalize away.
- **`<session-id>`:** the value of `$CLAUDE_CODE_SESSION_ID`.

**Fallback when `$CLAUDE_CODE_SESSION_ID` is unset:** pick the newest `.jsonl` file in the
resolved project-slug directory by mtime. When two or more files in that directory were modified
within the last 24 hours, the rendered report must name the chosen file together with its mtime
and list the ignored siblings — never silent newest-wins.

**Scope statement:** this resolves the **main session's own transcript only.** Any Task agent
dispatched during this session wrote its own separate transcript file, which is out of scope here
— a named coverage gap, so a reader of the judge's output does not infer that dispatched-agent
work was evaluated.

## The judge dispatch

Exactly one Task agent per invocation.

**Model:** resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" frontier
--unattended` (no `--run-dir` — the same standalone-invocation cap framing `/feedback`'s scrub
step already uses: one dispatch per invocation, enforced by this skill rather than a run-dir
tally). Degradation to Capable on a missed precondition is the resolver's own job, logged in its
`source` — never re-enumerated here.

**Prompt contents, in this order:**

1. The full body of `skills/_shared/feedback-objectives.md`, inlined verbatim.
2. The literal output template below, inlined verbatim.
3. The resolved transcript path from the previous section.
4. Slicing guidance: use Grep/Read to slice the transcript rather than reading it sequentially — a
   full sequential read is neither required nor expected on a long transcript. Per-objective
   evidence hints:
   - **Countable lenses** — anchor on keywords: `AskUserQuestion`, error/denial strings, tool
     names, repeated file paths.
   - **Judgment lenses** — sample rather than anchor: user turns plus each turn's final assistant
     text.
   - An objective the available slicing genuinely cannot reach renders `NOT EVALUATED — {reason}`,
     not a guess.

**Output template (fenced below, inlined into the dispatch prompt verbatim — one block per rubric
objective, in rubric order):**

```
DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED

## {objective name}
NO FINDING
— or —
NOT EVALUATED — {reason}
— or —
**Finding:** {symptom, one sentence}
**Evidence:** {transcript excerpt or precise pointer}
**Measurement:** {counts — countable lenses only; omit the line for judgment lenses}
**Proposed fix:** {concrete solution idea}
```

The status line is the contract's usual `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`
first line, per `_shared/subagent-output-contract.md`. The Avoidable interactions block always
states the total `AskUserQuestion` count for the session, even when that block otherwise renders
`NO FINDING` — the count is evidence in its own right, not conditional on a finding existing.

## Degradation: self-assessment

Some cloud sandboxes resolve no transcript file at all (Transcript resolution's fallback finds
nothing in the project-slug directory, or the directory itself doesn't exist). When that happens,
skip the Task dispatch and evaluate in the main thread instead, over its own conversational
context. Reuse the identical per-objective output template, with `(self-assessment)` appended to
each block's header line — e.g. `## Avoidable interactions (self-assessment)`.

The `(self-assessment)` tag is the full mitigation, deliberately. No separate confidence
machinery, no lowered evidentiary bar: every finding this mode produces still passes through
`/feedback`'s human-gated Step 7 confirm exactly like a transcript-judged finding does.

## After the judge returns

Hand each returned finding to `skills/feedback/SKILL.md`'s existing per-finding routing —
classify, dedup, draft, scrub, confirm — unchanged by whether the finding came from the judge or
from self-assessment. A `NOT EVALUATED` block is not a finding: report it in the run summary and
never file it.
