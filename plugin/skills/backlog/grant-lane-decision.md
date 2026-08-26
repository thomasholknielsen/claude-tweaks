# Backlog Refine/Grant — Grant-lane Decision (RECOMMEND_BUILD: false branch)

Referenced by `refine-mode.md`'s Step 3 (the branch this file documents) and Step 3.5 (which of the
two outcomes below also needs body-shape re-verification) and Step 5 (the write mechanics), by
`refine-lanes.md`'s Needs-decision lane (the rendered row + annotation template), and by
`grant-mode.md`'s Step 4 (the headless gate-4 refusal that reaches the identical `needs:decision`
outcome). Split out to keep `refine-mode.md` under the 40 KB per-file lazy-load ceiling
(`tests/bin-lib/skill-audit/context-cost.test.js`) rather than duplicating this branch and its
bash snippets inline at every call site.

## The branch

`grant-check` (`/claude-tweaks:assess-agent-autonomy` in `grant-check` mode) returns
`RECOMMEND_BUILD: false` for a record. Two outcomes, mutually exclusive:

- **`risk:*` or `size:*` is missing** — a genuine scoring gap, not a content refusal — flag back
  exactly as before this record existed: remove `ready`, post the flag-back comment
  (`refine-mode.md` Step 5's Flag-back-rows mechanics, unchanged by this file).
- **Both `risk:*` and `size:*` are already present, and the record passes Step 3.5's body-shape
  re-verification** — a content-based denial (risk:high merge-authority work, a body naming a
  human-present-only deliverable, a record already resolved live), not a scoring gap. This is the
  outcome this file documents: stamp `needs:decision`, keep `ready`, add no `auto:*`.

`refine-mode.md` Step 1's fetch already carries `facets.risk`/`facets.size` for every selected
record — this check reads already-fetched facts, no new API call.

**`/backlog grant`'s identical outcome (`grant-mode.md` Step 4):** Phase C's `evaluateGrantGate`
returns `grant: false, failedKey: 'grant-check'` — gate 4 denied a candidate that already cleared
gates 1-3. Unlike `refine`'s path, no risk/size precondition applies here — every other `failedKey`
at any phase stays a silent Skip row (`grant-mode.md` Step 4, unchanged).

## Idempotence check (before laning/applying)

Query whether this record already carries an *unresolved* decision comment from this unit:

```bash
gh issue view "$ISSUE" --json comments -q '.comments[] | select(.body | contains("<!-- needs-decision: {unit} -->")) | select(.body | contains("**Resolved:**") | not) | .id'
```

`{unit}` is `backlog-refine` or `backlog-grant`, per caller. A resolved comment's `**Resolved:**`
line is prepended above the marker (`_shared/work-record.md`'s resolution rule), so a resolved
comment never matches this query even though the marker text is still present in its body — that's
deliberate: a resolved comment must never gate a fresh one.

- **Non-empty** — an earlier run already marked this record for this unit. Render one annotation
  line only, never a fresh row, and write nothing this run — as its own bare line under the
  caller's own Needs-decision lane heading (`refine-lanes.md`'s Needs-decision lane, or
  `grant-mode.md`'s Needs-decision rows), since a record on this branch has no higher-precedence
  lane row to attach beneath.
- **Empty** — lane/apply it as a fresh row.
- **Query failed** (network error, non-zero `gh` exit) — fail closed, the same as a mismatch in
  `refine-mode.md`'s own pre-write reverify: never treat an unreadable result as "no unresolved
  comment exists." Skip this record this run, log `AUTO … skipped …` with `{what changed}` =
  `live-state fetch failed: {error}`, and report it.

## Write mechanics (`needs:decision` outcome only)

Keep `ready`, add no `auto:*` grant, add `needs:decision` (bootstrap per
`_shared/label-bootstrap.md`), post one marker comment:

```
<!-- needs-decision: {unit} -->
## Decision needed
**Proposed:** grant despite the flag, or build it yourself
**Why:** {grant-check RATIONALE, verbatim}
**Command:** `/claude-tweaks:backlog refine #{n}`
```

`{unit}` is `backlog-refine` or `backlog-grant` — the literal skill/mode name that wrote it, per
`_shared/work-record.md`'s decision-comment template. `**Command:**` is always
`/claude-tweaks:backlog refine #{n}`, regardless of which unit wrote the comment — `grant-mode.md`
is a headless unit with no human-facing apply step of its own, so a record it stamps
`needs:decision` is resolved the same way as one `refine` stamped directly: through `/backlog
refine`'s own Needs-decision lane, the only place this outcome is ever applied.

```bash
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" "BACKLOG_NEEDS_DECISION=backlog-needs-decision-${ISSUE}.md")"
gh issue edit "$ISSUE" --add-label needs:decision
gh issue comment "$ISSUE" --body-file "$BACKLOG_NEEDS_DECISION"
```

`refine-mode.md`'s batched application (`refine-lanes.md`'s Needs-decision lane): write
`{issue, addLabels: ["needs:decision"], commentFile}` per row to
`$ST_BACKLOG_REFINE_ACTIONS_NEEDSDECISION`, then one `bin/apply-refine-labels.js` call applies the
whole lane — same batching every other lane uses (`apply-refine-labels.js` already accepts
`addLabels` + `commentFile` together in one action, the identical shape Flag-back already uses with
`removeLabels` + `commentFile`). `grant-mode.md`'s Step 4 applies its own single-record write
inline — that mode has no batched-lane apply step at all.
