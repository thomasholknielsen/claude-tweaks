# Trust Table — Shared Procedure

Single source of truth for rendering `bin/lib/issues/trust.js`'s per-class trust table. Consumed
by `/claude-tweaks:help` (`status-scan.md` Stage 4.8), `/claude-tweaks:backlog overview`
(`overview-mode.md` Step 1.5), and `/claude-tweaks:backlog refine` (`refine-mode.md` Step 3, which
reuses the Fetch section for its advisory Trust column). Subagents cannot read this file —
`/help`'s dispatcher inlines this file's Fetch and Render sections into Stage 4.8's agent prompt,
the same pattern already used for `_shared/github-pr-scan.md`. The Fetch section goes in
**whole**, its `backlog-fetch-limit` and `work-links` resolution sub-sections included: the
family-parent fetch has two mutually exclusive branches, and an agent that cannot resolve
`work-links` cannot choose between them.

**Read-only, and read-only for a reason.** This procedure reports what evidence exists and
nothing else — it never grants a label, changes a label, merges anything, or recommends an
autonomous action. `_shared/policy-schema.md`'s `autonomy` lever (default `supervised`) is the
only thing that acts on this table's verdicts, and it does so through
`bin/lib/issues/autonomy.js` in its own consumers — `_shared/autonomy-ceiling.md` names them —
never here. **Rendering and acting stay separate surfaces on purpose:** do not attach a "next
step" suggestion to a verdict in this table, whatever the ceiling is set to. That is exactly the
mid-flow autonomy the bookend architecture withholds.

**Omit entirely under `work-backend: local-files`.** `demo:approved`/`demo:changes-requested` are
GitHub Issue labels this table reads directly; there is no local-record equivalent to fetch.

## Fetch

`trustRows` reads one record set — closed records form the cells, and open records are still
scanned for follow-up `Origin:` references naming a closed record's number — and one derived
input, the set of record numbers that are decomposed leaves. The record set is a single
`gh issue list --state all` call; the leaf set costs a second one (plus, under
`work-links: native`, one `sub_issues` call per parent). Both are fetched below before anything
is rendered.

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
silently returns nothing under the other — and fetches parents `--state all` for the
same reason that scope does: an approved family's parent is closed, so an open-only fetch would
miss exactly the parents this filter needs to see.

This table grades the **entire** historical closed-record set with no recency bound at all — and
so does the `--state all` family-parent fetch that feeds it. A fixed `--limit 200` here would let
`gh issue list`'s newest-first ordering silently drop the **oldest** `family:parent` issues first —
and older families are exactly the ones most likely to already sit inside a `total >= 8` cell, so
truncation would reopen the exact defect this filter exists to close, with no warning. The
family-parent fetches below therefore use the same `{resolved-limit}` and the same
truncation-warning discipline as the main record fetch further down, not a separate hardcoded cap.
(`acceptance-gap`'s own *closed-record* fetch keeps a hardcoded `--limit 200` because its record
set is bounded to the last 30 days; that reasoning covers only that one call, not its
`--state all` family-parent fetch, which is bounded the same way this one is.)

### `work-links` resolution

**Read `work-links` before choosing between the two branches below** — they are mutually
exclusive, and nothing in the fetched data reveals which one applies. It lives in the project's
`.claude-tweaks/policy.yml` (per `_shared/work-record-config.md`'s key table; a missing key means
`body-text`, the documented default), so read it directly rather than assuming the first-listed
branch:

```bash
grep -E "^work-links:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*work-links:[[:space:]]*//; s/[[:space:]]*#.*$//'
```

An empty result means `body-text`. Taking the `body-text` branch on a `work-links: native` repo
is not a degraded read but a silent total failure: a native parent's body carries no task list by
construction, so `parseFamilyLeaves` returns `[]` for every parent,
`/tmp/trust-table-family-leaves.json` is empty, and every decomposed leaf re-enters `cell.total`
as ungraded evidence — reinstating exactly the manufactured-`clean` path this filter exists to
close, in the one direction this table must never fail in.

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

Resolve the integration branch per `_shared/integration-branch.md`'s resolution ladder, substituting
its value for `{integration-branch}` below. Dump the full history once, in a form the operational
evidence path can scan for `(refs|closes|fixes) #N` references and revert trailers — `%x1f`/`%x1e`
are unit/record separator bytes, never appearing in real commit text, so a multi-line commit
message can never be mistaken for a SHA or split across records. `trust.js`'s own `parseGitLog`
turns that raw dump into the `[{ sha, message }]` shape `trustRows` expects; never hand-roll the
split, or two call sites can silently disagree about identical evidence:

```bash
git log "{integration-branch}" --format='%H%x1f%B%x1e' > /tmp/trust-table-git-log.txt
```

```bash
LIMIT="{resolved-limit}"
export FETCH_LIMIT="$LIMIT"
gh issue list --state all --json number,labels,body,state,stateReason,closedAt \
  --limit "$LIMIT" > /tmp/trust-table-records.json
node -e "
  const fs = require('fs');
  const { trustRows, parseGitLog } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/trust.js');
  const issues = require('/tmp/trust-table-records.json');
  const familyLeaves = new Set(require('/tmp/trust-table-family-leaves.json'));
  if (issues.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + issues.length + ' records (the configured backlog-fetch-limit) — history beyond this cap was dropped, so every cell below may be under-counted. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before reading any verdict.');
  }
  const records = issues.map((i) => ({ ...i, labels: i.labels.map((l) => l.name), hasParent: familyLeaves.has(i.number) }));
  const gitLog = parseGitLog(fs.readFileSync('/tmp/trust-table-git-log.txt', 'utf8'));
  const policy = { 'trust-revert-window-days': '{resolved-window}' };
  console.log(JSON.stringify(trustRows(records, gitLog, Date.now(), policy)));
"
```

Read `trust-revert-window-days` from `.claude-tweaks/policy.yml` and substitute its literal value
for `{resolved-window}` above — an empty substitution is fine, `trustRows` and the policy-schema
resolver it calls both treat an absent/empty value as "use the default (14)".

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

| Provenance | Risk | Total | Approved | Changes Requested | Operational | Undispositioned | Coverage | Not Planned | Follow-ups | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| {provenance} | {band} | {total} | {approved} | {changesRequested} | {operationalGood} | {undispositioned} | {coverage} | {notPlanned} | {followUps} | {verdict} |

Render `{coverage}` as a percentage with no decimals (`row.coverage`, e.g. `0.125` renders `13%`).

**Undispositioned is never omitted, hidden, or folded into another column.** It is the count of
closed records carrying no `demo:*` disposition at all — not a count of failures, a count of
unknowns. It is the measure of how blind the system currently is, and on a repo with no
acceptance-verdict discipline yet it is the largest number on the table.

**Operational is a second, independent evidence source** — a closed record with no `demo:*`
disposition still counts as known-good when it was merged and stayed unreverted for at least
`trust-revert-window-days` (default 14 days, `bin/lib/issues/trust.js`). It folds into `Coverage`
the same way `Approved`/`Changes Requested` do (all three sum into `dispositioned`), so
`Total = Approved + Changes Requested + Operational + Undispositioned` always holds. A record with
a `demo:*` verdict is never double-counted here — demo-descent evidence is tried first, and the
operational path only runs when it found nothing.

**Coverage is the fraction of a class's closed records that carry any verdict at all**
(`dispositioned / total`), and it is the figure that says whether a Verdict column can be
believed. A cell needs `trust.js`'s `MIN_VERDICTS` real dispositions before it grades at all, so
a graded cell is never resting on one lucky record — but a `clean` verdict at 12% coverage and
one at 90% are different claims, and only this column distinguishes them.

**Not Planned is counted and rendered, and is deliberately not a verdict input.** A record closed
`NOT_PLANNED` was declined before any work happened, so there is no work product for the class to
be judged on. It stays on the row because it says something real about a class's filing precision
— a class that files a lot of work nobody wants is worth seeing — but treating it as a quality
failure would be a category error, and with no time window in this table an unrecoverable one.

It does still count toward `total`, and therefore toward `MIN_SAMPLES`. That is the exact inverse
of its old effect: a declined record used to hard-block `clean`, and now it helps a cell reach the
size floor while contributing no evidence at all. `MIN_VERDICTS` is what stops that mattering —
the evidence floor is counted on dispositions alone, so a cell of 5 approvals and 35 declines
grades on those 5 — but it grades at 12% coverage, and the Coverage column is the only place a
reader sees that. Read the two columns together; a `clean` verdict sitting on low coverage and a
high Not Planned count is a class whose work is mostly being turned away, not one that is mostly
succeeding.

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
cell can read `insufficient-evidence` on either floor alone — `total` under `trust.js`'s
`MIN_SAMPLES` however good its dispositions look, or `dispositioned` under its `MIN_VERDICTS` —
so real approvals and rejections can already exist under this collapse; printing a hard-coded zero
would erase the first acceptance evidence the repo ever produces, which is the single thing
`autonomy: supervised` exists to let the operator watch.

Append the sentence "Every closed record's acceptance disposition is still unknown." only when
`{approved}` and `{changesRequested}` are both `0`. When any collapsed row is an `unstructured:*`
one, also append "{K} of those classes are unclassifiable and will never reach a verdict," where
`{K}` is the count of collapsed rows whose `kind` is `unstructured`. A pinned row cannot lift the
collapse by itself, so it would otherwise stay invisible for as long as every other cell is small,
which is exactly while it is accumulating.

Render the full table as soon as at least one row's Verdict is `clean` or `mixed`.

## Known limitation: no time window

Every count on this table is all-time. `changesRequested` and `followUps` are permanent, so a
class that earns one rejection is `mixed` from then on, with no path back however well it
performs afterward. That is the right failure direction for now — it is conservative, and on this
repo both counts are currently zero everywhere, so nothing is pinned yet. It stops being right as
soon as a class accumulates its first rejection and then improves.

The fix is a trailing evaluation window (grade on records closed in the last N days, keep the
all-time counts for display), which also subsumes the reason `notPlanned` had to leave the verdict
above. **Revisit when any cell first reads `mixed`** — that is the point at which the limitation
becomes observable rather than theoretical.
