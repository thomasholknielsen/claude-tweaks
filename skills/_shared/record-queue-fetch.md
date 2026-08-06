# Record Queue Fetch — Shared Procedure

Single source of truth for the first read every open-work-record scan performs: resolve
`work-backend`, fetch the queue, and facet-parse it. Consumed by `/claude-tweaks:help`
(`status-scan.md` Stage 1), `/claude-tweaks:tidy` (`scan-procedures.md` Step 1),
`/claude-tweaks:backlog` (both `refine-mode.md`'s and `overview-mode.md`'s Step 1), and
`/claude-tweaks:visualize` (`visualize/record-graph.md` Step A) — every one of these scans
starts from the identical fetch below before branching into its own consumer-specific
classification (dashboard bucket counts for `/help`; the seven finding shapes for `/tidy`;
priority/Related synthesis plus the grant worklist for `/backlog refine`, lens routing plus the
build recommendation for `/backlog overview`; stage-column bucketing plus six-axis encoding for
`/visualize record-graph`).
Subagents cannot read this file — the dispatcher inlines this section into the scan agent's
prompt, the same pattern already used for `_shared/github-pr-scan.md`.

## `work-backend` resolution

Read the `work-backend` field from the project's CLAUDE.md (`_shared/work-record.md`'s Config
keys table, written by `/claude-tweaks:init`). A missing flag is treated as `local-files`.

Every consumer reads `work-backend` directly, with no alias fallback.

## `work-backend: github-issues` fetch

Before running the fetch script below, read `backlog-fetch-limit` from the project's `.claude-tweaks/policy.yml`
(per `_shared/work-record.md`'s Config keys table) and export it as `BACKLOG_FETCH_LIMIT`; if
the key is absent, leave the variable unset so the script's own `:-1000` default applies.

```bash
LIMIT="${BACKLOG_FETCH_LIMIT:-1000}"
export FETCH_LIMIT="$LIMIT"
gh issue list --state open --json number,title,labels,milestone,updatedAt{,EXTRA_FIELDS} --limit "$LIMIT" > {tmp-records-file}
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('{tmp-records-file}');
  if (issues.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + issues.length + ' open issues (the configured backlog-fetch-limit) — there may be more beyond this cap. Consider raising backlog-fetch-limit in .claude-tweaks/policy.yml, or running /claude-tweaks:tidy to reduce backlog volume.');
  }
  console.log(JSON.stringify(issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }))));
" > {tmp-faceted-file}
```

`backlog-fetch-limit` (default `1000`) replaces the previous hardcoded 200/500 per-consumer limits — `gh issue list --limit N` auto-paginates internally regardless of how large `N` is, so raising the default doesn't change the fetch mechanism, only how much it's willing to pull before stopping. A consumer whose own population is naturally small (e.g. a `--label ready` filtered fetch) still uses this same limit and the same truncation check — the limit bounds "how many rows before we assume there might be more," not a per-consumer tuning knob.

`{EXTRA_FIELDS}` — a consumer appends its own extra `--json` fields to the base list above
rather than opening a second round-trip. `/claude-tweaks:help` appends `body` (its own
Conflict-detection sub-section reads the record body from this same fetch).
`/claude-tweaks:backlog` also appends `,body` in both modes — `refine` needs bodies for Step 2's
priority/Related synthesis pass, `overview` needs them for `rankNextToBuild`'s internal
`parseDependencies` call in its Step 3 recommendation (see `refine-mode.md` and
`overview-mode.md`'s own Step 1 fetch lines). `/claude-tweaks:visualize` also appends
`body` — `record-graph.md` Step A needs it for the `Blocked by #N` parsing that becomes the
diagram's dependency edges. `/claude-tweaks:tidy`
needs no extra field for this fetch — it pulls unsynced local-fallback records via a separate,
already-documented `queryRecords('specs', { unsynced: true })` call in its own Step 1.

`parseRecordFacets` silently ignores any label it doesn't recognize (`bin/lib/issues/record.js`)
— a consumer that also needs the raw `labels` array (not just the parsed `facets`) keeps both,
since the spread above (`...i`) preserves every original field alongside the derived `facets`.

## `work-backend: local-files` fetch

```bash
node -e "
  const { queryRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
  console.log(JSON.stringify(queryRecords('specs', {})));
" > {tmp-faceted-file}
```

Every record returned already carries its parsed `.facets` — no separate parse pass needed.
Both drivers land in the same faceted-record shape (`{ ..., facets }`) at `{tmp-faceted-file}`
— only the fetch varies per driver; a consumer's own classification logic runs identically
against either driver's output.

## Staleness clock (either driver)

`github-issues` uses the query's own `updatedAt`, straight from the fetch above. `local-files`
has no timestamp facet (`local-store.js`'s schema carries none), so use the record file's own
last-commit date instead:

```bash
git -C "{REPO_ROOT}" log -1 --format=%cI -- "{path}"
```

An empty result — an uncommitted/brand-new record — is treated as fresh, not stale.
`{REPO_ROOT}` resolves via `git rev-parse --show-toplevel` in the dispatcher before the agent
fires (see Working Directory Discipline in `_shared/subagent-output-contract.md`).

### Threshold resolution

Before computing staleness, read `record-staleness-weeks` from the project's CLAUDE.md (per
`_shared/work-record.md`'s Config keys table) and export it as `RECORD_STALENESS_WEEKS`; if
the key is absent, leave the variable unset so each consumer's own default (4) applies —
the same read-with-shell-default pattern this file already uses for `backlog-fetch-limit`
above. Each consumer's own classification script converts this to milliseconds
(`weeks * 7 * 24 * 60 * 60 * 1000`) and passes the result as `thresholdMs` to
`classifyStaleness(ageMs, thresholdMs)` (`bin/lib/issues/record-buckets.js`) — the conversion
is per-consumer inline code, not part of the shared module itself.

## See also

- `_shared/work-record.md` — the record taxonomy this fetch's `facets` are parsed against
- `_shared/github-pr-scan.md` — the analogous shared fragment for PR/issue-state scanning
  (Stage/Step 4.5-4.8), the precedent this file follows
- `bin/lib/issues/record-buckets.js` — the shared bucket predicates (`isBacklog`, `isParked`,
  `isBotBlocked`, `isBotInProgress`) and `classifyStaleness`, consumed by `/claude-tweaks:help`'s
  Stage 1 and `/claude-tweaks:tidy`'s Step 1 Shapes 1/2/5 (`/claude-tweaks:backlog` consumes this
  fetch too, but does its own classification without this module)
