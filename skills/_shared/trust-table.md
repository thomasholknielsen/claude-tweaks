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

Before running anything below, read `backlog-fetch-limit` from the project's
`.claude-tweaks/policy.yml` (per `_shared/work-record.md`'s Config keys table, the same value
`_shared/record-queue-fetch.md` resolves) and substitute it for `{resolved-limit}` in **every**
block below that references it; use `1000` when the key is absent. Substitute the literal number
independently in each block — do **not** rely on a `${BACKLOG_FETCH_LIMIT:-1000}` expansion
reading an `export` from an earlier step, and do not factor the `LIMIT="{resolved-limit}"` line
out into a block of its own either. Shell environment does not survive between Bash calls and
never reaches a subagent, so any cross-block reliance on a shell variable — an env expansion or a
variable set in a prior fenced block — silently resolves empty or falls back to `1000` even when
the project configures a higher limit. Every fenced block below that uses `$LIMIT` or
`process.env.FETCH_LIMIT` sets both at its own top for exactly this reason.

A decomposed leaf must not form a cell of its own — its family's parent already carries the one
graded verdict, and counting the leaf too would let `total >= MIN_SAMPLES` be satisfied by records
nobody judged (`trust.js`'s `hasParent !== true` filter). Resolving which closed records are leaves
reuses the same parent-side enumeration `_shared/github-pr-scan.md`'s `acceptance-gap` scope
already documents in full — never the leaf side, which works under one `work-links` mode and
silently returns nothing under the other (`[IL-64]`) — and fetches parents `--state all` for the
same reason that scope does: an approved family's parent is closed, so an open-only fetch would
miss exactly the parents this filter needs to see.

Unlike `acceptance-gap` (whose record set is bounded to closed records from the last 30 days, so
its own hardcoded `--limit 200` is in practice never truncated), this table grades the **entire**
historical closed-record set with no recency bound at all. A fixed `--limit 200` here would let
`gh issue list`'s newest-first ordering silently drop the **oldest** `family:parent` issues first —
and older families are exactly the ones most likely to already sit inside a `total >= 8` cell, so
truncation would reopen the exact defect this filter exists to close, with no warning. The
family-parent fetches below therefore use the same `{resolved-limit}` and the same
truncation-warning discipline as the main record fetch further down, not a separate hardcoded cap.

**`work-links: body-text`** — one fetch supplies every parent's task list:

```bash
LIMIT="{resolved-limit}"
export FETCH_LIMIT="$LIMIT"
gh issue list --label family:parent --state all --json number,body --limit "$LIMIT" \
  > /tmp/trust-table-family-parents.json
node -e "
  const { parseFamilyLeaves } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const fs = require('fs');
  const parents = require('/tmp/trust-table-family-parents.json');
  if (parents.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + parents.length + ' family:parent records (the configured backlog-fetch-limit) — older families were dropped, so their leaves may silently re-enter cell totals as ungraded evidence. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before reading any verdict.');
  }
  const leafNumbers = parents.flatMap((p) => parseFamilyLeaves(p.body));
  fs.writeFileSync('/tmp/trust-table-family-leaves.json', JSON.stringify(leafNumbers));
"
```

**`work-links: native`** — the parent body carries no task list, so fetch parent numbers alone and
query the sub-issues API instead, one call per parent:

```bash
LIMIT="{resolved-limit}"
export FETCH_LIMIT="$LIMIT"
gh issue list --label family:parent --state all --json number --limit "$LIMIT" \
  > /tmp/trust-table-family-parents.json

: > /tmp/trust-table-family-leaf-numbers.jsonl
node -e "require('/tmp/trust-table-family-parents.json').forEach(p => console.log(p.number))" | while read -r N; do
  gh api "repos/{owner}/{repo}/issues/$N/sub_issues" --jq '.[].number' >> /tmp/trust-table-family-leaf-numbers.jsonl
done

node -e "
  const fs = require('fs');
  const parents = require('/tmp/trust-table-family-parents.json');
  if (parents.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + parents.length + ' family:parent records (the configured backlog-fetch-limit) — older families were dropped, so their leaves may silently re-enter cell totals as ungraded evidence. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before reading any verdict.');
  }
  const leafNumbers = fs.readFileSync('/tmp/trust-table-family-leaf-numbers.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(Number);
  fs.writeFileSync('/tmp/trust-table-family-leaves.json', JSON.stringify(leafNumbers));
"
```

With `/tmp/trust-table-family-leaves.json` written by whichever branch applies, fetch the record
set itself — this block resolves its own `$LIMIT`/`FETCH_LIMIT` too, for the same reason:

```bash
LIMIT="{resolved-limit}"
export FETCH_LIMIT="$LIMIT"
gh issue list --state all --json number,labels,body,state,stateReason \
  --limit "$LIMIT" > /tmp/trust-table-records.json
node -e "
  const { trustRows } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/trust.js');
  const issues = require('/tmp/trust-table-records.json');
  const familyLeaves = new Set(require('/tmp/trust-table-family-leaves.json'));
  if (issues.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + issues.length + ' records (the configured backlog-fetch-limit) — history beyond this cap was dropped, so every cell below may be under-counted. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before reading any verdict.');
  }
  const records = issues.map((i) => ({ ...i, labels: i.labels.map((l) => l.name), hasParent: familyLeaves.has(i.number) }));
  console.log(JSON.stringify(trustRows(records)));
"
```

Note the spread order: derived fields (`labels`, `hasParent`) come after the parsed spread, never
before (`[IL-01]`).

**Report every truncation warning emitted above verbatim above the table, and never suppress
any of them.** `gh issue list` returns newest-first, so the cap drops the **oldest** records, and
the dropped window is not a random sample of a cell's evidence. Where a class improved over time
its rejections sit precisely in that window, so truncation can strip a `changes-requested` while
keeping every approval — leaving a cell looking cleaner than it is, the one direction this table
must never fail in. The same reasoning applies to the family-parent fetches: a dropped `oldest`
parent silently un-suppresses its leaves back into `total`, the same failure direction.

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
