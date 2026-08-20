# Session Evaluation — transcript judge dispatch

Loaded by `skills/feedback/SKILL.md`'s session-evaluation step on bare (or `--queue`) invocation.
Never loaded on free-text invocation — a free-text learning has no transcript to judge.

Follows `_shared/transcript-judge.md`'s shared dispatch harness (transcript resolution, the judge
dispatch's mechanics, slicing guidance, finding norms, self-assessment degradation, and the
watermark protocol) with feedback's own four parameters:

1. **Rubric** — the full body of `skills/_shared/feedback-objectives.md`, inlined verbatim.
2. **Output template** — the literal template below, inlined verbatim.
3. **Model profile** — `frontier`, resolved via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js"
   frontier` (no `--run-dir` — a standalone `/feedback` has no run dir, so `frontierUsed` is 0 and
   the resolver's cap branch passes; one judge dispatch per invocation is the contract's
   standalone-invocation cap for this skill's Frontier singleton, enforced by this skill rather
   than a run-dir tally).
4. **Watermark consumer key** — `feedback`.

## Output template

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

## Watermark payload

On a `DONE`/`DONE_WITH_CONCERNS` return (per `_shared/transcript-judge.md`'s watermark protocol,
consumer key `feedback`), the payload is:

```
{
  transcriptPath,
  bytesAtDispatch,
  evaluatedAt,
  filedRecords,            // the record numbers this run actually filed, from Step 8
  dismissedFingerprints,   // bin/lib/declined-learning/store.js's
                           // listDeclinedFingerprints({ source: 'feedback' }) — every fingerprint
                           // a human declined at Step 7 across every /feedback run to date, not
                           // just this one. Filtered to source: 'feedback' so a reflect-sourced
                           // decline never suppresses a feedback finding by accident.
}
```

## After the judge returns

Hand each returned finding to `skills/feedback/SKILL.md`'s existing per-finding routing —
classify, dedup, draft, scrub, confirm — per `_shared/transcript-judge.md`'s "After the judge
returns" section.
