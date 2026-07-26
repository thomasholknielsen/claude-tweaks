# Record Queue Fetch — Shared Procedure

Single source of truth for the first read every open-work-record scan performs: resolve
`work-backend`, fetch the queue, and facet-parse it. Consumed by `/claude-tweaks:help`
(`status-scan.md` Stage 1) and `/claude-tweaks:tidy` (`scan-procedures.md` Step 1) — both
scans start from the identical fetch below before branching into their own consumer-specific
classification (dashboard bucket counts for `/help`; the seven finding shapes for `/tidy`).
Subagents cannot read this file — the dispatcher inlines this section into the scan agent's
prompt, the same pattern already used for `_shared/github-pr-scan.md`.

## `work-backend` resolution

Read the `work-backend` field from the project's CLAUDE.md (`_shared/work-record.md`'s Config
keys table, written by `/claude-tweaks:init`). A missing flag is treated as `local-files`.

**Legacy alias (consumer-specific):** `/claude-tweaks:tidy` additionally accepts
`backlog-backend` — the pre-migration flag name, under `## Backlog integration` — as a
read-only alias when `work-backend` is absent (see `_shared/work-record.md`'s Config keys
section, "Legacy alias exception," for the full current list). `/claude-tweaks:help` does not
read this alias — it reads `work-backend` directly with no fallback.

## `work-backend: github-issues` fetch

```bash
LIMIT="${BACKLOG_FETCH_LIMIT:-1000}"
gh issue list --state open --json number,title,labels,milestone,updatedAt{,EXTRA_FIELDS} --limit "$LIMIT" > {tmp-records-file}
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('{tmp-records-file}');
  if (issues.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + issues.length + ' open issues (the configured backlog-fetch-limit) — there may be more beyond this cap. Consider raising backlog-fetch-limit in CLAUDE.md, or running /claude-tweaks:tidy to reduce backlog volume.');
  }
  console.log(JSON.stringify(issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }))));
" > {tmp-faceted-file}
```

`backlog-fetch-limit` (default `1000`) replaces the previous hardcoded 200/500 per-consumer limits — `gh issue list --limit N` auto-paginates internally regardless of how large `N` is, so raising the default doesn't change the fetch mechanism, only how much it's willing to pull before stopping. A consumer whose own population is naturally small (e.g. a `--label ready` filtered fetch) still uses this same limit and the same truncation check — the limit bounds "how many rows before we assume there might be more," not a per-consumer tuning knob.

`{EXTRA_FIELDS}` — a consumer appends its own extra `--json` fields to the base list above
rather than opening a second round-trip. `/claude-tweaks:help` appends `body` (its own
Conflict-detection sub-section reads the record body from this same fetch). `/claude-tweaks:tidy`
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

## See also

- `_shared/work-record.md` — the record taxonomy this fetch's `facets` are parsed against
- `_shared/github-pr-scan.md` — the analogous shared fragment for PR/issue-state scanning
  (Stage/Step 4.5-4.8), the precedent this file follows
