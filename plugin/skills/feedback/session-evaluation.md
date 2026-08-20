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

## Skip check (before dispatch) — #701

Runs after Transcript resolution (`_shared/transcript-judge.md`), before the judge dispatch —
**only on the branch where a transcript path actually resolved.** Self-assessment (no transcript
resolves at all) has nothing to compare against and always runs; see "Self-assessment is exempted"
below.

1. Stat the resolved transcript path's current size in bytes (`wc -c` or equivalent).
2. Read the watermark for this path (`readWatermark`, consumer key `feedback`).
3. Call `isTranscriptUnchanged(watermark, currentBytes)` (`bin/lib/transcript-judge/watermark.js`).
   `true` means the transcript has not grown since the watermark was recorded — the cheap `>=`
   check `[record #701]`'s Deliverables call for, so this run doesn't pay for a Task agent that
   would evaluate zero new bytes via the offset clause.

**When `true` (unchanged) and `--full` was not passed:** skip the judge dispatch entirely — no
Task agent, no self-assessment. Gather 2 contributes nothing new to this invocation's merged
batch. Report a pointer to the prior watermark's `issueUrls` (below) in the Step 0 run summary
instead of a fresh finding list: "session evaluation unchanged since {evaluatedAt} — prior filings:
{issueUrls, or "none" if empty}." `--full` bypasses this check entirely (SKILL.md's Input table)
and always dispatches fresh, exactly as today.

**When `false` (grown, or no watermark exists):** proceed to the judge dispatch as today —
`_shared/transcript-judge.md`'s own offset clause (item 5 of the Prompt contents) already scopes
the dispatch to only the bytes after the watermark, when one exists. This skip check and the
offset clause are complementary, not redundant: the offset clause narrows an unavoidable dispatch;
this check avoids the dispatch altogether when narrowing it would leave nothing to evaluate.

**Self-assessment is exempted, explicitly (not an oversight).** `_shared/transcript-judge.md`'s
Degradation section states self-assessment "never reads or writes a watermark — there is no
resolved transcript path to key one on." This skip check inherits that same exemption rather than
inventing a parallel mechanism for it: self-assessment only fires when no transcript file resolves
at all, so there is no `currentBytes` to compare and no stamp to check. A self-assessment run
therefore always runs in full (self-assessment already runs in-thread, so the dispatch cost this
check exists to avoid does not apply there) and never writes a stamp — duplicate filings across two
self-assessment runs remain guarded only by Step 4's dedup fingerprint and Step 8's fingerprint
marker, the same safety net that already covers a transcript-judged run's non-duplicate findings.

## Watermark payload

On a `DONE`/`DONE_WITH_CONCERNS` return (per `_shared/transcript-judge.md`'s watermark protocol,
consumer key `feedback`), the payload is:

```
{
  transcriptPath,
  bytesAtDispatch,
  evaluatedAt,
  sessionId,               // $CLAUDE_CODE_SESSION_ID at dispatch time — the transcript path
                           // is the load-bearing lookup key (per _shared/transcript-judge.md's
                           // Watermark key note), but a human or a future consumer reading the
                           // watermark file directly needs the session id without re-deriving it
                           // from the path's basename
  filedRecords,            // the record numbers this run actually filed, from Step 8
  findingsFiled,           // count of Gather-2-sourced findings that reached Step 8's
                           // `gh issue create` this run — filedRecords.length, carried
                           // explicitly so a skip-check summary can report a count without
                           // re-deriving it
  issueUrls,               // the URLs Step 8's `gh issue create` calls produced for this run's
                           // Gather-2-sourced findings, in filing order — what the Skip check
                           // above points a later invocation at instead of re-evaluating
  dismissedFingerprints,   // fingerprints of findings the human declined at Step 7, if
                           // tracked; nothing in this skill currently tracks declined-
                           // finding fingerprints, so this is an empty array today, not
                           // an invented data source
}
```

`filedRecords`/`findingsFiled`/`issueUrls` are populated after Step 8 completes, scoped to **this
invocation's Gather-2-sourced items only** — never Gather 1's queue candidates, which have their
own local issue to close and are not what a later skip-check summary should point at. Read Step
8's per-draft result table (SKILL.md Step 8 item 3) and keep the rows whose source item came from
this gather; a row's status of `filed` or `dedup-hit` contributes its issue URL to `issueUrls` and
its record identifier to `filedRecords`. `findingsFiled` is that filtered set's length. No stamp is
written at all when Gather 2's dispatch was reported as failed in the run summary (per SKILL.md's
failure-isolation rule) — an empty or all-failed batch still writes a stamp with `filedRecords: []`
/ `findingsFiled: 0` / `issueUrls: []` only when the dispatch itself succeeded (`DONE`/
`DONE_WITH_CONCERNS`) and simply found nothing to file, which is the ordinary "NO FINDING
everywhere" case, not a failure.

## After the judge returns

Hand each returned finding to `skills/feedback/SKILL.md`'s existing per-finding routing —
classify, dedup, draft, scrub, confirm — per `_shared/transcript-judge.md`'s "After the judge
returns" section.
