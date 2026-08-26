# Backlog Refine — Human-only Outcome

Referenced by `refine-mode.md`'s Step 3 (the branch that reaches this outcome and the idempotence
check gating it) and Step 5 (the write mechanics) and by `refine-lanes.md`'s Human-only lane
(the rendered row + annotation template). Split out to keep `refine-mode.md` under the 40 KB
per-file lazy-load ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`) rather than
duplicating the bash snippet and comment template inline at both call sites.

## When this fires

Step 3's grant-check pass returns `RECOMMEND_BUILD: false` for a record that already carries
**both** `risk:*` and `size:*` — a content-based denial (risk:high merge-authority work, a
`Defer-reason: needs-human-decision` body, a deliverable needing a human-present session, a record
already resolved live), not a scoring gap. A record **missing** either label keeps the existing
`flag back (needs scoring)` outcome instead — see `refine-mode.md` Step 3.

## Idempotence check (before lanning)

Query whether this record already carries the marker comment:

```bash
gh issue view "$ISSUE" --json comments -q '.comments[] | select(.body | startswith("<!-- backlog-refine-human-only -->")) | .id'
```

- **Non-empty** — an earlier refine run already marked this record. Render one annotation line
  only (`refine-lanes.md`'s Human-only lane), never a fresh lane row, and write nothing this run —
  the whole point of this check is that a repeat pass over an already-marked record produces zero
  label/comment writes.
- **Empty** — lane it as a fresh Human-only row (Step 4 / `refine-lanes.md`).

## Write mechanics (Step 5)

For every row lanned Human-only — leave `ready`, add no `auto:*` grant, post one marker comment:

```
<!-- backlog-refine-human-only -->
Marked human-only by /claude-tweaks:backlog refine: {grant-check RATIONALE}

Kept `ready` — still selectable by /claude-tweaks:dispatch #{n} / /claude-tweaks:flow #{n} for a
human-driven build.
```

```bash
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" "BACKLOG_REFINE_HUMANONLY=backlog-refine-humanonly-${ISSUE}.md")"
gh issue comment "$ISSUE" --body-file "$BACKLOG_REFINE_HUMANONLY"
```

The `<!-- backlog-refine-human-only -->` marker — the comment's first line, unconditionally — is
what the idempotence check above greps for on a later run; never hand-write or omit it. No label
edit accompanies this write. Local-files driver: this outcome never fires (Step 3's grant-check
pass is `github-issues` only).

Batched application (`refine-lanes.md`'s Human-only lane): write `{issue, commentFile}` per row to
`$ST_BACKLOG_REFINE_ACTIONS_HUMANONLY` (no `addLabels`/`removeLabels`), then one
`bin/apply-refine-labels.js` call applies the whole lane — same batching every other lane uses.
