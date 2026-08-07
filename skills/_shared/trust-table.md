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
record's number.

Before running it, read `backlog-fetch-limit` from the project's `.claude-tweaks/policy.yml` (per
`_shared/work-record.md`'s Config keys table, the same value `_shared/record-queue-fetch.md`
resolves) and substitute it for `{resolved-limit}` below; use `1000` when the key is absent.
Substitute the literal number — do **not** rely on a `${BACKLOG_FETCH_LIMIT:-1000}` expansion
reading an `export` from an earlier step. Shell environment does not survive between Bash calls
and never reaches a subagent, so that expansion always resolves to `1000` and a project
configured for `3000` would silently fetch a third of its history.

```bash
LIMIT="{resolved-limit}"
export FETCH_LIMIT="$LIMIT"
gh issue list --state all --json number,labels,body,state,stateReason \
  --limit "$LIMIT" > /tmp/trust-table-records.json
node -e "
  const { trustRows } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/trust.js');
  const issues = require('/tmp/trust-table-records.json');
  if (issues.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + issues.length + ' records (the configured backlog-fetch-limit) — history beyond this cap was dropped, so every cell below may be under-counted. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before reading any verdict.');
  }
  const records = issues.map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
  console.log(JSON.stringify(trustRows(records)));
"
```

**Report that truncation warning verbatim above the table, and never suppress it.** `gh issue
list` returns newest-first, so the cap drops the **oldest** records, and the dropped window is not
a random sample of a cell's evidence. Where a class improved over time its rejections sit
precisely in that window, so truncation can strip a `changes-requested` while keeping every
approval — leaving a cell looking cleaner than it is, the one direction this table must never fail
in.

## Render

One row per cell, in the module's own `key` sort order (already stable — do not re-sort, and
never cap or truncate the row count; see the row-count note below):

| Provenance | Risk | Total | Approved | Changes Requested | Undispositioned | Not Planned | Follow-ups | Verdict |
|---|---|---|---|---|---|---|---|---|
| {provenance} | {band} | {total} | {approved} | {changesRequested} | {undispositioned} | {notPlanned} | {followUps} | {verdict} |

**Undispositioned is never omitted, hidden, or folded into another column.** It is the count of
closed records carrying no `demo:*` disposition at all — not a count of failures, a count of
unknowns. It is the measure of how blind the system currently is, and on a repo with no
acceptance-verdict discipline yet it is the largest number on the table.

**Row count is bounded in practice, not by the taxonomy.** The `producer:*`, `human:*`, and
`unstructured:*` provenances are enumerable (`record.js`'s `ORIGINS`, plus two singletons) and the
risk band is binary, but `side-effect:{source}` is free text derived from a record's `Origin:`
body line, so the row count has no formal ceiling. What holds it down is `provenance.js`'s
normalization — clause truncation and trailing-`from #N` stripping collapse per-record detail into
one class per emitted context, and anything still overflowing its length cap funnels into the
single `unstructured:unstructured` cell. A repo whose skills emit a handful of `Origin:` contexts
therefore gets a handful of rows. Capping the render anyway is still the wrong trade: a repo that
did produce many rows is one whose classes are fragmenting, which is exactly what the operator
needs to see, and the cap would land on the Undispositioned counts this table exists to surface.

**Any `unstructured:*` row is structurally ungradable, not merely short of evidence.** Its Verdict
is pinned to `insufficient-evidence` at every sample count (`trust.js`'s `UNGRADABLE_KIND`) —
`unstructured` is `provenance.js`'s classifier reporting that it could not reduce those records'
`Origin:` lines to a class at all (`unstructured:unstructured` for text past its length cap,
`unstructured:empty-origin` for text that normalized to nothing). A bucket whose only shared
property is that nobody knows what is in it has no coherent class to earn trust for. Say so when
rendering the row — a reader must not read its permanent `insufficient-evidence` as a cell that is
one more month of samples away from a verdict.

**All-insufficient collapse.** When every row's Verdict reads `insufficient-evidence`, do not
render the table — render one line instead: "No cell has enough dispositioned evidence yet — {N}
classes, {M} closed records, {approved} approved, {changesRequested} changes-requested." `{N}` is
the row count, `{M}` the sum of every row's `total`, and `{approved}`/`{changesRequested}` the
sums of those two columns across all rows. **Compute all four — none of them is a literal.** A
cell can read `insufficient-evidence` on sample count alone (`total` under `trust.js`'s
`MIN_SAMPLES`, whatever its dispositions say), so real approvals and rejections can already exist
under this collapse; printing a hard-coded zero would erase the first acceptance evidence the repo
ever produces, which is the single thing `autonomy: supervised` exists to let the operator watch.

Append the sentence "Every closed record's acceptance disposition is still unknown." only when
`{approved}` and `{changesRequested}` are both `0`. When any collapsed row is an `unstructured:*`
one, also append "{K} of those classes are unclassifiable and will never reach a verdict," where
`{K}` is the count of collapsed rows whose `kind` is `unstructured`. A pinned row cannot lift the
collapse by itself, so it would otherwise stay invisible for as long as every other cell is small,
which is exactly while it is accumulating.

Render the full table as soon as at least one row's Verdict is `clean` or `mixed`.
