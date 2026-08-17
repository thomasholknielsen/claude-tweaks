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

**Fallback — whenever the id-derived path does not resolve:** `$CLAUDE_CODE_SESSION_ID` unset, or
set but no file exists at the derived path (a stale or rotated session id) — pick the newest
`.jsonl` file in the resolved project-slug directory by mtime. Whenever this fallback ran at all,
the rendered report names the chosen file together with its mtime; when the directory holds more
than one `.jsonl` file, of any age, it also lists the ones ignored — never silent newest-wins.
Only when no candidate `.jsonl` exists at all (or the directory itself doesn't exist) does the
self-assessment degradation below apply.

**Scope statement:** this resolves the **main session's own transcript only.** Any Task agent
dispatched during this session wrote its own separate transcript file, which is out of scope here
— a named coverage gap, so a reader of the judge's output does not infer that dispatched-agent
work was evaluated.

**Watermark key:** the path resolved above is also the lookup key for
`bin/lib/feedback/watermark.js`'s watermark — key on path, not session id, since a worktree switch
changes the transcript directory slug mid-session.

## The judge dispatch

Exactly one Task agent per invocation.

**Model:** resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" frontier` (no
`--run-dir` — a standalone `/feedback` has no run dir, so `frontierUsed` is 0 and the resolver's
cap branch passes; one judge dispatch per invocation is the contract's standalone-invocation cap
for this skill's Frontier singleton, enforced by this skill rather than a run-dir tally). Append
`--unattended` only when this invocation is genuinely headless — a scheduled Routine or a
`claude -p` run — resolved from session state, never a literal in skill text: the resolver reads
that flag as "no human is present" and unconditionally degrades Frontier on it.
Degradation to Capable on a missed precondition is the resolver's own job,
logged in its `source` — never re-enumerated here. The cap counts evaluations, not retries: a
`NEEDS_CONTEXT` or `BLOCKED` return may be re-dispatched once with the missing context supplied;
a second failure degrades to the self-assessment path below rather than dispatching again.

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
5. **Conditional — the watermark offset clause.** When `bin/lib/feedback/watermark.js`'s
   `readWatermark` returns non-null for the resolved transcript path, append
   `formatOffsetClause(...)`'s literal output as this 5th item, verbatim:

   ```
   Evaluate from byte offset {bytesAtDispatch} (line {line}); these records already exist: {filedRecords joined by ", ", or "none" if empty}; omit findings they cover.
   ```

   When no watermark exists (first invocation) or `--full` was passed, item 5 is omitted
   entirely — no offset clause, no empty placeholder.

**Output template (fenced below, inlined into the dispatch prompt verbatim — one block per rubric
objective, in rubric order):**

```
DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED

## {objective name — one block per rubric objective, in rubric order}
NO FINDING
— or —
NOT EVALUATED — {reason}
— or —
**Finding:** {symptom, one sentence}
**Evidence:** {transcript excerpt or precise pointer}
**Measurement:** {counts with a session-sizing denominator — countable lenses only; omit the line for judgment lenses}
**Cost this session:** {one line — retries, hand-work, a reverted decision; "unclear" is valid}
**Proposed fix:** {concrete solution idea}

Template note (applies to the Avoidable interactions block only, whichever outcome it renders):
end that block with a Measurement line stating the session total, e.g.
**Measurement:** total AskUserQuestion calls: {N}; {M} of {N} resolved to the pre-marked
Recommended option.
```

The status line is the contract's usual `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`
first line, per `_shared/subagent-output-contract.md`.

## Degradation: self-assessment

Two routes land here: no transcript file resolves at all (Transcript resolution's fallback finds
nothing in the project-slug directory, or the directory itself doesn't exist — skip the Task
dispatch entirely), or the judge dispatch terminally failed (see After the judge returns). Either
way, evaluate in the main thread instead, over its own conversational
context. Reuse the identical per-objective output template, with `(self-assessment)` appended to
each block's header line — e.g. `## Avoidable interactions (self-assessment)`.

The `(self-assessment)` tag is the full mitigation, deliberately. No separate confidence
machinery, no lowered evidentiary bar: every finding this mode produces still passes through
`/feedback`'s human-gated Step 7 confirm exactly like a transcript-judged finding does.

The self-assessment path never reads or writes a watermark — there is no resolved transcript path
to key one on.

## After the judge returns

Hand each returned finding to `skills/feedback/SKILL.md`'s existing per-finding routing —
classify, dedup, draft, scrub, confirm — unchanged by whether the finding came from the judge or
from self-assessment. A `NOT EVALUATED` block is not a finding: report it in the run summary and
never file it.

A reply that violates the template — missing the status line, or missing per-objective blocks —
is re-prompted once on format, per `_shared/subagent-output-contract.md`. A terminal failure —
the format retry also fails, the re-dispatch above was already spent, or the dispatch itself
hard-errors (e.g. a model usage-limit failure) — records the failed model via
`node bin/resolve-profile.js record-failure {model}` per `_shared/subagent-output-contract.md`'s
Model Selection section, then degrades to the self-assessment path above, noted in the run
summary: the evaluation is never silently dropped, and the queue gather proceeds unaffected
either way, per `skills/feedback/SKILL.md`'s failure-isolation rule.

**Watermark write.** On a `DONE` or `DONE_WITH_CONCERNS` return from the judge (not
`NEEDS_CONTEXT`/`BLOCKED`, and not the self-assessment degradation path above), call
`writeWatermark` with:

```
{
  transcriptPath,
  bytesAtDispatch,        // captured BEFORE dispatch — the judge's own tool calls append
                           // to the transcript while it runs, so re-stat-ing after return
                           // would race
  evaluatedAt,             // now
  filedRecords,            // the record numbers this run actually filed, from Step 8
  dismissedFingerprints,   // fingerprints of findings the human declined at Step 7, if
                           // tracked; nothing in this skill currently tracks declined-
                           // finding fingerprints, so this is an empty array today, not
                           // an invented data source
}
```

On a write failure: degrade open — the evaluation result itself is unaffected, report the write
failure in Step 0's output as a one-line note, and never abort or retry the evaluation because the
watermark write failed.
