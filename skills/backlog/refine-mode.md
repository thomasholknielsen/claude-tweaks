# Backlog — Refine Mode

The comprehensive "ensure every issue has the right labels" sweep: `priority:*`/`**Related:**` suggestions plus `auto:build`/`auto:merge` grants, presented together and confirmed once.

## Step 1: Fetch

*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line, per `overview-mode.md`'s convention this file shares.)*

Resolve the `autonomy` ceiling and `trust-revert-window-days` once, before any fetch below — the
same canonical read the Trust signal section further down and Step 3.6's born-ready check both
need, so resolving it here means neither has to run its own `resolve-policy.js` call:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values autonomy trust-revert-window-days
# line 1: autonomy -> {resolved-ceiling}; line 2: trust-revert-window-days -> {resolved-window}
```

**Substitute the literal values** for `{resolved-ceiling}` and `{resolved-window}` everywhere
below in this file. Do **not** `export` them in an earlier Bash call and read `process.env` in a
later one: shell environment does not survive between Bash calls and never reaches a subagent, so
that expansion always resolves empty and a later block would report `supervised` on a repo
configured for `trusted`. Resolving `trust-revert-window-days` even when the Trust signal section's
fetch ends up skipped (ceiling below `trusted` and no `--trust`) is accepted overhead — one
canonical read is simpler than conditioning the resolve call itself on the value it exists to
produce.

**Priority/Related fetch (both drivers).** Fetch and facet-parse the full open-issue queue per `_shared/record-queue-fetch.md` (`{tmp-records-file}` = `/tmp/backlog-refine-open.json`, `{tmp-faceted-file}` = `/tmp/backlog-refine-faceted.json`) — reading through the session-scoped record snapshot, whose union field set always carries `body` (no `{EXTRA_FIELDS}` request needed) for this pass's synthesis. Under `work-backend: github-issues`, also fold in `unsynced: true` local fallback records the same way the retired `/claude-tweaks:review-backlog` skill's old Step 1 did:

```bash
node -e "
  const { queryRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
  const records = queryRecords('specs', { unsynced: true });
  console.log(JSON.stringify(records));
" > /tmp/backlog-refine-unsynced.json
```

For each unsynced record, attach a `createdAt` from its own last-commit date (the local driver carries no timestamp facet — same approach `/claude-tweaks:tidy`'s Step 1 staleness clock already uses) via `backlog.js`'s shared `deriveCreatedAtFromGit` helper (the same staleness-clock approach `_shared/record-queue-fetch.md` documents for the `local-files` driver):

```bash
node -e "
  const { deriveCreatedAtFromGit } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/backlog.js');
  const records = require('/tmp/backlog-refine-unsynced.json');
  console.log(JSON.stringify(deriveCreatedAtFromGit(records)));
" > /tmp/backlog-refine-unsynced-dated.json
node -e "
  const { mergeUnsyncedRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/backlog.js');
  const github = require('/tmp/backlog-refine-faceted.json');
  const unsynced = require('/tmp/backlog-refine-unsynced-dated.json');
  console.log(JSON.stringify(mergeUnsyncedRecords(github, unsynced)));
" > /tmp/backlog-refine-faceted.json
```

This last script reads `{tmp-faceted-file}`'s github-only content and overwrites the same path with the fully merged (github + unsynced) set — Step 2 below reads `/tmp/backlog-refine-faceted.json` expecting the merge to already be complete. Tag every fetched record with a **not yet synced** marker in rendered output wherever `facets.unsynced === true`.

**Grant fetch (`work-backend: github-issues` only, skipped per Preflight under `local-files`).** Fetch per the same shared fragment, this time server-side filtered:

```bash
LIMIT="${BACKLOG_FETCH_LIMIT:-1000}"
export FETCH_LIMIT="$LIMIT"
gh issue list --label ready --state open --json number,title,labels,updatedAt --limit "$LIMIT" > /tmp/backlog-refine-ready.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/backlog-refine-ready.json');
  if (issues.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + issues.length + ' ready-labeled issues (backlog-fetch-limit) — there may be more. See .claude-tweaks/policy.yml.');
  }
  const originFilter = process.env.BACKLOG_ORIGIN || '';
  let rows = issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }));
  if (originFilter) {
    rows = rows.filter((r) => (originFilter === 'human' ? r.facets.origin === null : r.facets.origin === originFilter));
  }
  console.log(JSON.stringify(rows));
" > /tmp/backlog-refine-ready-faceted.json
```

Immediately after, compute the whole refine worklist in one pass — this is what Step 2 and Step 3 below both read, in place of their own inline split/slice scripts:

```bash
node -e "
  const { refineWorklist } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/backlog.js');
  const fs = require('fs');
  const allRows = require('/tmp/backlog-refine-faceted.json');
  const p = '/tmp/backlog-refine-ready-faceted.json';
  const readyRows = fs.existsSync(p) ? require(p) : [];
  console.log(JSON.stringify(refineWorklist({
    allRows, readyRows,
    priorityBudget: Number(process.env.PRIORITY_BUDGET || 40),
    grantBudget: Number(process.env.GRANT_BUDGET || 40),
  })));
" > /tmp/backlog-refine-worklist.json
```

Under `work-backend: local-files`, the grant fetch above never ran (Preflight skips it), so `/tmp/backlog-refine-ready-faceted.json` doesn't exist; `readyRows` defaults to `[]` and the compute block still produces every priority-path field (`missingPriority`, `missingRiskSize`, `prioritySlice`) from `allRows` — the grant lanes (`fresh`/`blocked`/`inProgress`/`grantSlice`) are simply empty.

**Decomposition parents are in the priority population, deliberately.** `refineWorklist`'s `missingPriority` and `missingRiskSize` are computed over `allRows` with no `facets.isParentIssue` filter, so an open decomposition parent reaches the Priority lane like any other unlabelled record. This is the one place `refine` and `overview` treat parents differently: `funnelBuckets` routes parents to their own mutually-exclusive `parents` bucket (`overview-mode.md`'s third annotation line), keeping them out of `captured`/`scored` and therefore out of the Score and Shape paste blocks — a parent is never `ready` and never scored (`_shared/work-record.md`'s Decomposition rules: "Only sub-issue records get `ready` (+ scoring)"). Priority is not scoring: a parent legitimately carries a `priority:*` tier to rank the decomposition as a whole, so it stays in this lane. What must NOT happen here is a risk/size ask or a `flag back (needs scoring)` recommendation against a parent — those are sub-issue-only, and `missingRiskSize` counting parents is a count artifact, not a work item. Never emit a `/claude-tweaks:specify #{N}` grooming command for a parent from any lane; its close-out path is `wrap-up/verification-brief.md`'s Parent-Gate Procedure (backstopped by `/claude-tweaks:tidy`'s `Open parent gate`) or `/claude-tweaks:demo`.

(If the intended behavior is instead that parents leave the Priority lane entirely, that is a code change to `refineWorklist` and belongs in its own work record rather than in this note.)

When `--budget <n>` was passed (see `SKILL.md`'s Input), set `PRIORITY_BUDGET=<n> GRANT_BUDGET=<n>` in the **same Bash invocation** as the compute block above (e.g. `PRIORITY_BUDGET=<n> GRANT_BUDGET=<n> node -e "..."`) — shell environment does not survive between separate Bash calls, so exporting them in an earlier call and relying on the compute block's later call to inherit them silently resolves both to the `|| 40` default instead. Omitted, both are unset and the block's own `|| 40` defaults apply — Step 2's priority/Related synthesis pass and Step 3's grant-check pass stay independently budgeted, exactly as before.

When `--origin <name>` was passed (see `SKILL.md`'s Input), export `BACKLOG_ORIGIN=<name>` before running the fetch script above; omitted, it's unset and the script runs unfiltered. The origin-agnostic default and the `blocked` lane mirror the retired `/claude-tweaks:triage` skill's old Step 1; the compute block above resolves the split three ways: `blocked` = hit the retry ceiling (`bot:blocked`), a re-authorization candidate; `inProgress` = actively claimed by a live run (`bot:in-progress`) — excluded from grant checks entirely, mirroring `grant-mode.md`'s own not-already-claimed exclusion, because a grant-check dispatch is wasted on a record mid-build and a grant written mid-run changes nothing the executing pipeline reads; `fresh` = neither, the only lane grant checks run over.

**These are two separate fetches, not one.** The priority/Related fetch is unfiltered (needs the whole backlog); the grant fetch is server-side filtered to `--label ready` (preserves today's exact starvation-avoidance guarantee — an unfiltered pull risks pushing older `ready`-labeled issues out of a shared result window on a large backlog). Both route through the same `backlog-fetch-limit` config key and truncation-warning pattern, just as two independent invocations of it.

## Step 2: Priority/Related synthesis (bounded)

*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line.)*

Over the **missing-priority** population — records carrying no `priority:*` label at all, the
population Step 1's compute block actually keys on via `refineWorklist`'s `missingPriority` (refs
#460: the old split kept scored-on-any-facet records out of this pass even when they still lacked
a `priority:*` label; keying on the label directly is the fix) — read `.prioritySlice.selected` and
`.prioritySlice.remaining` from `/tmp/backlog-refine-worklist.json`, already bounded to `--budget`
(default 40, independent of the grant pass's own budget in Step 3) by Step 1's compute block. No
separate script runs here.

Read every selected body in one pass and produce:

- A narrative summary + thematic clusters (group by shared theme/origin/root cause, not just by label — the same read a human gets from reading a handful of related issues side by side).
- A per-record `priority:*` suggestion with a one-line rationale.
- A per-record, **non-binding** tier guess (`quick`/`full`) — purely to help a human eyeball a batch before deciding what to send to `/specify` next. This is never written as a label; only `/specify`'s own `ceremony-check` (a separate, authoritative computation with deeper context — the record's fully shaped Deliverables/Acceptance Criteria, not this pass's rougher read) writes `ceremony:*`. Rationale was `docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md`, deleted `70849915`.
- Detected `**Related:**` cross-references — pairs of selected records whose bodies reference each other's context in prose without a formal link (`**Related:**` is `/capture`'s own body-template line; nothing else reads or maintains it — `_shared/work-record.md`). Never suggest `Blocked by #N` here — that's the formally-parsed hard-dependency mechanism, out of scope for this skill (`_shared/work-record.md`'s permission matrix).

If `.prioritySlice.remaining > 0`, state it plainly in the report: "`{remaining}` more records missing priority exist beyond this run's `--budget {N}` — re-run to continue." Never silently drop them.

## Step 3: Grant-check (bounded, `work-backend: github-issues` only)

*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line.)*

Bound the grant-check LLM pass independently of Step 2's budget. Read `.grantSlice.selected` and
`.grantSlice.remaining` (already bounded to `--budget`, default 40, by Step 1's compute block) and
`.blocked` from `/tmp/backlog-refine-worklist.json` — no separate script runs here. Below, `selected`
and `blocked` refer to these two fields.

For every record in `selected`, invoke `/claude-tweaks:assess-agent-autonomy` in `grant-check` mode, once per record, every backlog refine session — never pre-filtered to "borderline" records:

```
Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "grant-check #{n}")
```

Each invocation returns `RECOMMEND_BUILD`/`RECOMMEND_MERGE`/`RATIONALE` (see
`skills/assess-agent-autonomy/grant-check.md`). Derive the Grant lane's Recommended value for
grant rows directly from this output, and carry `RATIONALE` through to the lane's own Evidence
column (Step 4) and the `decisions.md` log line (Step 5) — a content-aware judgment the
human is about to act on must stay visible at decision time and stay in the audit trail
afterward, not be computed and then silently discarded. `blocked` rows (below) have no
`assess-agent-autonomy` call to draw a rationale from — their Evidence column reads a fixed
string instead, per Step 4.

- **`RECOMMEND_BUILD: true`** → `auto:build` (append `+ auto:merge` when `RECOMMEND_MERGE` is also
  `true`).
- **`RECOMMEND_BUILD: false`** → `flag back (needs scoring)`. The human may supply scoring inline as
  a free-text override instead of flagging back — the gate then stamps the supplied `risk:*`/
  `size:*` labels alongside the grant (Step 5).

For every record in `blocked` (unaffected by the budget — the retry-ceiling population is
typically small and its re-authorization recommendation needs no `grant-check` call at all), skip
`grant-check` and recommend **`re-authorize (bot:blocked)`** directly, regardless of content — a
prior failure means the human's renewed judgment is the point, not a mechanical (or
judgment-driven) replay: applying this row grants `auto:build` only, never bundling `auto:merge`
automatically. Restoring `auto:merge` too requires an explicit override. A `bot:blocked` record
whose grants are still intact was parked by the merge-verification gate (checks red or timed out on
its PR — `_shared/pr-first-merge.md`'s Step 2.5), not failed; re-triage there means checking the
PR's checks, not re-authorizing a build.

If `.grantSlice.remaining > 0`, state it plainly in the report: "`{remaining}`
more ready records awaiting grant-check exist beyond this run's `--budget {N}` — re-run to
continue."

When Step 1's compute block's `.counts.inProgress` is non-zero (those records are excluded from
the grant worklist entirely — see the split description in Step 1), the Grant lane (`refine-lanes.md`)
states that plainly in the report — not repeated here.

### Trust signal (advisory, `github-issues` only)

Gate on the `{resolved-ceiling}` value Step 1 already resolved: fetch and render this run's trust
table only when `{resolved-ceiling}` is `trusted` or higher, **or** `--trust` was passed (see
`SKILL.md`'s Input). Below `trusted` with no `--trust`, skip everything else in this section —
`_shared/trust-table.md`'s Fetch section, including its per-parent branches and its `git log`
read, never runs this session — Trust evidence is omitted from the report for this run, and Step
4's footer renders the skip wording given there instead of the ceiling-description wording. On this
skip path, delete or ignore any pre-existing `/tmp/backlog-refine-trust.json` left over from an
earlier run in the same environment (`rm -f /tmp/backlog-refine-trust.json`, or simply never read
it) — this run must never render a stale trust table left behind by a prior `--trust` invocation.

When fetching: run `_shared/trust-table.md`'s Fetch section in full (including its
`backlog-fetch-limit` resolution, its `work-links` resolution — which decides which of the two
parent-issue branches to run — and its truncation warning), then look up each worklist record's
class. `{resolved-ceiling}` and `{resolved-window}` below are the literal values Step 1 already
resolved — do not re-run `resolve-policy.js` here, and do not `export` them in an earlier Bash call
and read `process.env` here: shell environment does not survive between Bash calls and never
reaches a subagent, so that expansion always resolves empty and this block would report
`supervised` on a repo configured for `trusted`. It is the same hazard, and the same fix, as the
`backlog-fetch-limit` substitution in the Fetch section this step already cites. The failure is
quiet and in the safe direction, which is exactly why it needs stating: nothing errors, the console
simply renders a false claim about live policy.

This trust block reuses `/tmp/trust-table-git-log.txt`, already written by the Fetch section above — it must never shell its own separate `git log` call, or its verdicts could silently disagree with the trust table this same run just rendered from the identical underlying evidence.
`{resolved-window}` reaches the script as a `process.argv` arg after `--`, never spliced into the
JS source — a value containing a quote character would otherwise break out of the string literal,
the same reason `code-health/focus-mode.md`'s F1 block passes its own values that way.

```bash
node -e "
  const fs = require('fs');
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const { trustRows, riskBand, parseGitLog } = require(root + '/bin/lib/issues/trust.js');
  const { resolveProvenance } = require(root + '/bin/lib/issues/provenance.js');
  const { resolveCeiling, permittedGrants } = require(root + '/bin/lib/issues/autonomy.js');
  const issues = require('/tmp/trust-table-records.json').map((i) => ({ ...i, labels: i.labels.map((l) => l.name) }));
  const gitLog = parseGitLog(fs.readFileSync('/tmp/trust-table-git-log.txt', 'utf8'));
  const policy = { 'trust-revert-window-days': process.argv[1] };
  const rows = new Map(trustRows(issues, gitLog, Date.now(), policy).map((r) => [r.key, r]));
  const ceiling = resolveCeiling({ policy: '{resolved-ceiling}' });
  const out = {};
  for (const issue of issues.filter((i) => i.state === 'OPEN')) {
    const { kind, source } = resolveProvenance({ labels: issue.labels, body: issue.body });
    const row = rows.get(kind + ':' + source + '|' + riskBand(issue.labels));
    const permitted = permittedGrants({ ceiling, row });
    // Fallback to the flat keys: repo-HEAD skill text can run against an older
    // installed build's autonomy.js (no grants key yet). Remove with #647's
    // transitional twin (see bin/lib/issues/autonomy.js module header).
    const gBornReady = (permitted.grants || {}).bornReady || { granted: permitted.bornReady, reason: permitted.reason };
    out[issue.number] = {
      ceiling,
      provenance: row ? row.provenance : kind + ':' + source,
      band: riskBand(issue.labels),
      verdict: row ? row.verdict : 'no-cell',
      coverage: row ? row.coverage : null,
      bornReady: gBornReady.granted,
      reason: gBornReady.reason,
    };
  }
  console.log(JSON.stringify(out));
" -- "{resolved-window}" > /tmp/backlog-refine-trust.json
```

**This signal never changes what the gate recommends.** `/claude-tweaks:assess-agent-autonomy`'s
`grant-check` remains the sole source of the Recommended column — it reads *this record's* content,
where trust describes *this record's class*, and a class verdict is not evidence about a specific
record's shape. Trust rides along as context for the human making the batch decision. The one thing
the ceiling does change is described in Step 3.6.

## Step 3.5: Body-shape re-verification (before granting)

*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line.)*

For every record the grant-check pass recommends **granting** (not flag-back/blocked rows) — fetch the body and re-verify spec shape immediately before writing any label, using the same cached-body-reuse trick the retired `/claude-tweaks:triage` skill's old Step 3.5 used (`grant-check` already fetched and cached the body at `/tmp/assess-grant-{n}.json`; reuse it instead of a second API round-trip).

```bash
if [ -f "/tmp/assess-grant-${ISSUE}.json" ]; then
  # Fresh row already went through Step 3's grant-check, which fetched and cached the
  # body — reuse it instead of a second GitHub API round-trip for the same content.
  node -e "console.log(require('/tmp/assess-grant-${ISSUE}.json').body)" > /tmp/backlog-refine-body-${ISSUE}.md
else
  # Blocked row skipped grant-check entirely (Step 3), so no cached body exists yet.
  gh issue view "$ISSUE" --json body -q .body > /tmp/backlog-refine-body-${ISSUE}.md
fi
```

Check per `_shared/work-record.md`'s spec-shaped body definition: the sections `## Current State`, `## Deliverables`, and `## Acceptance Criteria` are present and each non-empty, and no unresolved placeholder marker (`TBD`, `TODO`, `<!-- ambiguity:`) remains anywhere in the body. This is structural-plus-minimal — whether the deliverables are the *right* ones stays human judgment (the batch table just confirmed), not this check.

A failing row auto-downgrades to flag-back, using Step 5's flag-back mechanics with this exact comment (substitute the missing/empty section list and issue number):

```
Flagged back by /claude-tweaks:backlog refine: body is not spec-shaped — missing/empty: {list}. Run /claude-tweaks:specify #{n} to shape it, then re-add 'ready'.
```

```bash
node -e "console.log(\`Flagged back by /claude-tweaks:backlog refine: body is not spec-shaped — missing/empty: \${process.argv[1]}. Run /claude-tweaks:specify #\${process.argv[2]} to shape it, then re-add 'ready'.\`)" "$MISSING_LIST" "$ISSUE" > /tmp/backlog-refine-flagback-${ISSUE}.md
```

Report every downgrade to the user before proceeding — a silent downgrade would look like the grant simply never happened.

## Step 3.6: Ceiling-authorized born-ready (`autonomy: trusted`+)

*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line.)*

The ceiling's only effect inside this skill is on **which records reach the worklist at all**, not
on what is recommended for them once here. At `trusted` or higher, a record `/claude-tweaks:capture`
filed while `producer:capture` carried a `clean` verdict arrives with `ready` already applied by
the `/claude-tweaks:specify --chained` shaping pass its filing triggered (see
`_shared/autonomy-ceiling.md`, which names `/claude-tweaks:capture` as the only actor this covers
today), so it appears in Step 1's fetch shaped by machinery rather than by a human-invoked
`/claude-tweaks:specify` session.

Those records are not exempt from anything here. Step 3.5's body-shape re-verification is exactly
the check that catches a born-`ready` record whose body is not actually spec-shaped, and it runs on
them unchanged — `_shared/work-record.md`'s "labels are projection, not truth" rule is what makes
the born-`ready` grant safe to give, because this gate re-derives shape rather than trusting the
label.

At `supervised` — the default, and the state of any repo that has not opted in — no record is ever
born-`ready` by this path and this step does nothing.

## Step 4: Decision lanes

*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line.)*

One lane per record, precedence: Re-authorize → Grant → Flag-back → Priority → Dependency repair →
Needs you. A record already laned above (Re-authorize/Grant/Flag-back) keeps its priority/Related
suggestion as an annotation line under its row — a suggestion is never silently dropped.

Read `refine-lanes.md` in this skill's directory for the full rendering procedure — the lane tables
and paste-block templates, the consequence-line trust and `solution:unjustified` annotation templates, the
count-summary line, the Needs-you lane, the ceiling/skip-case footers, the closing `Next:` line
rule, and the confirm gate (`<!-- refine-confirm-gate -->`).

## Step 5: Apply

*(Narration allowance: no "running"/"passed" line for this step — only the run's one opening line and any failure/degradation line; the closing summary below is the report, not narration.)*

**Priority/Related rows:** For every record the priority decision resolved to apply:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['priority:high', 'Priority: dispatch picks this band first'],
#  ['priority:medium', 'Priority: dispatch picks after priority:high'],
#  ['priority:low', 'Priority: dispatch picks last among prioritized records']]
CURRENT_PRIORITY=$(gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -E '^priority:' || true)
if [ -n "$CURRENT_PRIORITY" ] && [ "$CURRENT_PRIORITY" != "priority:$TIER" ]; then
  gh issue edit "$ISSUE" --remove-label "$CURRENT_PRIORITY" --add-label "priority:$TIER"
else
  gh issue edit "$ISSUE" --add-label "priority:$TIER"
fi
```

A record can already carry a different-tier `priority:*` label from an earlier run or a human edit — swap it out rather than adding the new tier alongside it, the same way every other label-state transition in this skill family pairs `--remove-label` with `--add-label` (demo's `demo:pending`→`demo:approved`, this same skill's own grant rows' `bot:blocked`→`auto:build` below, dispatch's `auto:build`→`bot:blocked`). Two contradictory `priority:*` labels on one record would corrupt `/claude-tweaks:dispatch`'s `next` tie-break ordering, which reads `facets.priority` as a single value via `parseRecordFacets`.

Local-files driver: recompose the record's full facets (`priority: $TIER`, replacing any prior value) and call `writeRecord` (`bin/lib/issues/local-store.js`) — same compose-then-write-once pattern `/claude-tweaks:specify`'s local-driver path already uses. `writeRecord` writes a tracked file, not a GitHub issue edit, so immediately follow it with:

```bash
git add "$RECORD_PATH"
git commit -m "Backlog Refine: set priority:$TIER on {id}"
```

— the same commit-after-write step `/claude-tweaks:specify`'s local-driver path takes for the identical reason (an uncommitted `specs/*.md` edit has no audit trail and risks being lost or swept into an unrelated later commit).

A record carrying `facets.unsynced === true` (Step 1's local fallback fold-in) has no `$ISSUE` GitHub number to edit even under `work-backend: github-issues` — it exists only as a local `specs/{id}-{slug}.md` file (its `.path`, from `queryRecords`). For these records, regardless of the project-wide driver, take the local-files branch above instead: `writeRecord` against the record's own `.path`, then `git add`/`git commit` the same way.

For every record the `**Related:**` decision resolved to apply, replace the existing `**Related:** {...}` line in the body (github: `gh issue edit "$ISSUE" --body-file`, rewriting the fetched body with the line replaced; local-files, and any `facets.unsynced === true` record regardless of driver: `writeRecord` with the updated body against the record's `.path`, followed by the same `git add`/`git commit` step).

**Grant rows:** When Step 4 resolved to `"Grant auto:build only, hold merge"` (Option 3 of the confirm gate, `refine-lanes.md`), skip every `auto:merge` grant below for the remainder of this session — apply `auto:build`/re-authorize exactly as the Grant lane recommended, but never the `gh issue edit "$ISSUE" --add-label auto:merge` line, regardless of what the row's own Recommended column said. This is a session-wide override, not a per-row judgment call — it doesn't change what Step 3 recommended or what the Grant lane displayed, only what Step 5 writes.

For every row still marked for granting after Step 3.5:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['auto:build', 'Grant: agents may build this record autonomously (human-granted; machinery only removes)'],
#  ['auto:merge', 'Grant: a clean autonomous run may merge unreviewed (stacks on auto:build; alone inert)']]
# — add the matching risk:low|medium|high / size:low|medium|high pair too, only for a row where
# the human supplied scoring inline during the override step (Step 4).

if gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -qx bot:blocked; then
  gh issue edit "$ISSUE" --remove-label bot:blocked --add-label auto:build
else
  gh issue edit "$ISSUE" --add-label auto:build
fi
# Row also grants auto:merge:
gh issue edit "$ISSUE" --add-label auto:merge
# Row's scoring came from an inline override in Step 4 (a grant row missing risk/size the human
# supplied risk:$RISK_TIER / size:$SIZE_TIER for directly, rather than flagging back or accepting the
# default "needs scoring" recommendation) — persist the human-supplied scoring as labels too,
# not just the grant, so the record doesn't re-enter later batch views (e.g.
# /claude-tweaks:backlog overview risk-value's ranked table) still showing as missing risk/size:
gh issue edit "$ISSUE" --add-label "risk:$RISK_TIER" --add-label "size:$SIZE_TIER"
```

Stripping `bot:blocked` in the same edit as the grant matters: without it, the record carries both `bot:blocked` and a fresh `auto:build`, and `/claude-tweaks:dispatch`'s skip rule ignores anything `bot:blocked` forever regardless of the new grant.

**Dependency-repair rows:**

- Refine runs the detection itself — it does not consume overview's output. After Step 1's fetch (which already carries `,body`), and after performing the same `work-links: native` blocked-by attachment overview's Step 3 specifies (one aliased `buildNativeDependencyQuery` call over the fetched candidates; per-node failures attach nothing), run `findUnresolvedDependencyProse` via the same `{ flags }` output shape. Attaching native blockers first means already-natively-wired records resolve non-empty and are never flagged for re-wiring. The same per-node failure narration line applies here — when any alias in an otherwise-successful batch failed, render one failure-only narration line naming exactly those ids (e.g. `blocker data incomplete for #12, #40 — node fetch failed; they rank on body-text fallback this run`) — and probe unavailability or whole-fetch failure degrades to the body-text fallback with one failure-only narration line, never a hard stop (restated here at point of use rather than left to the cross-reference). Under `work-links: body-text`, no attachment is needed — the body fallback resolves canonical lines on its own. Offer the mode-aware repair as a new confirmable item type in the existing Step 4 lanes + confirm gate — surfaced and applied exactly like every other write in this step, never bypassing or altering when the gate fires or that it blocks until confirmed.
- **`work-links: native`**: wire the native blocked-by link via the same dependency API `/claude-tweaks:specify`'s Step 4 linking uses.
- **`work-links: body-text`**: append a canonical line-start `Blocked by #N` line to the record body (`gh issue edit --body-file` under `github-issues`; `writeRecord` + `git add`/`git commit` under `local-files`, same as the Related-line path above).
- **Never write both representations for one edge.**

**Flag-back rows:** For every row flagged back — Step 3.5's auto-downgrade, a row missing risk/size accepted as recommended, or a human override in Step 4 — remove `ready` and post a comment. Step 3.5's downgrade always uses its exact wording above; every other flag-back uses a shorter comment: `Flagged back by /claude-tweaks:backlog refine: {reason}. Re-add 'ready' once addressed.`, where `{reason}` is `needs scoring` for the recommended case or the human's own free-text reason for an explicit override.

```bash
gh issue edit "$ISSUE" --remove-label ready
gh issue comment "$ISSUE" --body-file /tmp/backlog-refine-flagback-${ISSUE}.md
```

Check each write's own result before logging it — a non-zero exit from any `gh`/`writeRecord` call
above is a failure, not a success, regardless of which lane produced it. Log every action to this
run's `decisions.md` (standalone-auto run dir per `_shared/pipeline-run-dir.md`) via the matching
template below, success or failure:

```
AUTO {time} — Backlog refine: set priority:{tier} on #{n}.
AUTO {time} — Backlog refine: updated **Related:** on #{n} to reference #{m}.
AUTO {time} — Backlog refine: granted auto:build{ + auto:merge} to #{n} (risk:{riskTier}, size:{sizeTier}). Rationale: {grant-check RATIONALE}.
AUTO {time} — Backlog refine: re-authorized #{n} — stripped bot:blocked, granted auto:build{ + auto:merge}.
AUTO {time} — Backlog refine: flagged back #{n} — {missing sections | needs scoring}.
FAILED {time} — Backlog refine: {priority | Related | grant | dependency-repair | flag-back} write failed on #{n}: {error}.
```

The closing summary below counts these lines by type — a `FAILED` line is the only source for both
the tally's `failed` count and the per-failure lines; a write with no matching `AUTO`/`FAILED` line
was never attempted, so it counts toward neither.

**Closing summary (required, rendered as assistant text — never delegated to tool output; a
shell print of the tally does not satisfy this):** after the apply pass above completes, render
a closing block from the same per-write outcomes already logged to `decisions.md` above — no
second bookkeeping channel:

1. **Per-type tally line** — one count per write type applied this run, with `failed` always
   present, even at zero:

   ```
   34 priority set · 2 Related updated · 7 granted · 5 flagged back · 0 failed
   ```

2. **One line per failed write** — the record ref and the error, followed by a paste-ready retry
   command on its own line (this repo's report-line convention: no inline/same-line comments).
   The retry command reproduces that write type's own Step 5 mechanics above, not a generic
   `gh issue edit --add-label`:

   ```
   #123 — priority write failed: {error}
   gh issue edit 123 --add-label priority:high
   ```

   (shown assuming the removal already landed and only the add failed — see the swap-safety
   caveat immediately below before pasting this literally)

   For a priority write, re-derive the conditional swap from the failure point: re-read the
   record's current `priority:*` label state, and emit the add-only form only when no prior-tier
   label remains. Add-only is safe when the removal already landed and the add is what failed;
   after a failure *before* any removal it leaves two contradictory `priority:*` labels — exactly
   what the **Priority/Related rows** swap above exists to prevent. Grant rows (up to four chained
   `gh` calls) and Related/Flag-back rows (a `--body-file` edit) retry as the single failed call
   from that row's own mechanics above, not the whole row.

3. **The run-directory path, absolute** — never relative (a bare relative
   `.claude-tweaks/pipelines/` path silently shadows the main-checkout copy when run from a
   worktree):

   ```
   Audit trail: /abs/path/to/.claude-tweaks/pipelines/{run-id}/decisions.md
   ```

A fully clean run still renders `0 failed` explicitly and omits the per-failure lines — the
tally line's `0 failed` is the only signal a clean run needs.

**Close the run dir.** After the closing summary above renders, close this run's standalone run
directory so resume/reconcile paths can classify it as terminal instead of `status: unknown`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run <absolute-run-dir>
```

Always pass an explicit `--run <absolute-run-dir>` — the run directory itself: the closing summary's
audit-trail line above names the `decisions.md` *file* inside it, so strip the trailing
`/decisions.md` to get the directory `close-run` requires (it rejects a file path outright).
Omitting `--run` falls back to the newest non-terminal run dir under the
project's `.claude-tweaks/pipelines/`, which can belong to a different, still-active session, and
closing that one would silently disarm that session's own worktree enforcement. `close-run`
creates `run-state.json` when the run dir never had one — every refine standalone run — and stamps
it `status: clean`, so no separate direct write is needed. A "no recorded wrap-up invocation"
warning line is expected here and not an error; refine runs standalone and never invokes
`/claude-tweaks:wrap-up`.

## Concurrency

Two humans running `/claude-tweaks:backlog refine` at the same time is safe by construction — every label add is idempotent, so two overlapping grants on the same record just repeat the same write. The one sharp edge is a genuine race between a grant and a flag-back landing on the *same* record in the same window: last-writer-wins on GitHub's own label state. This is acceptable, not engineered around — it is a narrow, self-correcting window (the next `/claude-tweaks:backlog refine` run reads whatever state won and proceeds from there), not worth a lock.
