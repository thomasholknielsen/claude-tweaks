# Trust Table — Shared Procedure

Single source of truth for rendering `bin/lib/issues/trust.js`'s per-class trust table. Consumed
by `/claude-tweaks:help` (`status-scan.md` Stage 4.8) and `/claude-tweaks:backlog overview`
(`overview-mode.md` Step 1.5). Subagents cannot read this file — `/help`'s dispatcher inlines this
file's Fetch and Render sections into Stage 4.8's agent prompt, the same pattern already used for
`_shared/github-pr-scan.md`.

**Read-only, and read-only for a reason.** This procedure reports what evidence exists and
nothing else — it never grants a label, changes a label, merges anything, or recommends an
autonomous action. `_shared/policy-schema.md`'s `autonomy` lever (default `supervised`) is the
only thing that will ever act on this table's verdicts, and nothing reads that lever yet
(`trusted`/`unattended` are declared, not wired — Phase 3 of
`docs/superpowers/specs/2026-08-07-earned-autonomy-tier-design.md`). Do not attach a "next step"
suggestion to a verdict here — that is exactly the mid-flow autonomy this phase withholds on
purpose.

**Omit entirely under `work-backend: local-files`.** `demo:approved`/`demo:changes-requested` are
GitHub Issue labels this table reads directly; there is no local-record equivalent to fetch.

## Fetch

One `gh issue list --state all` call supplies everything `trustRows` needs — closed records form
the cells, and open records are still scanned for follow-up `Origin:` references naming a closed
record's number:

```bash
gh issue list --state all --json number,labels,body,state,stateReason \
  --limit "${BACKLOG_FETCH_LIMIT:-1000}" > /tmp/trust-table-records.json
node -e "
  const { trustRows } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/trust.js');
  const issues = require('/tmp/trust-table-records.json');
  const records = issues.map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
  console.log(JSON.stringify(trustRows(records)));
"
```

## Render

One row per cell, in the module's own `key` sort order (already stable — do not re-sort, and
never cap or truncate the row count; the taxonomy is finite and every row's Undispositioned count
matters, see below):

| Provenance | Risk | Total | Approved | Changes Requested | Undispositioned | Not Planned | Follow-ups | Verdict |
|---|---|---|---|---|---|---|---|---|
| {provenance} | {band} | {total} | {approved} | {changesRequested} | {undispositioned} | {notPlanned} | {followUps} | {verdict} |

**Undispositioned is never omitted, hidden, or folded into another column.** It is the count of
closed records carrying no `demo:*` disposition at all — not a count of failures, a count of
unknowns. It is the measure of how blind the system currently is, and on a repo with no
acceptance-verdict discipline yet it is the largest number on the table.

**All-insufficient collapse.** When every row's Verdict reads `insufficient-evidence`, do not
render the table — render one line instead: "No cell has enough dispositioned evidence yet — {N}
classes, {M} closed records, 0 approved, 0 changes-requested. Every closed record's acceptance
disposition is still unknown." Render the full table as soon as at least one row's Verdict is
`clean` or `mixed`.
