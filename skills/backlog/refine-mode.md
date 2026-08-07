# Backlog — Refine Mode

The comprehensive "ensure every issue has the right labels" sweep: `priority:*`/`**Related:**` suggestions plus `auto:build`/`auto:merge` grants, presented together and confirmed once.

## Step 1: Fetch

**Priority/Related fetch (both drivers).** Fetch and facet-parse the full open-issue queue per `_shared/record-queue-fetch.md` (`{tmp-records-file}` = `/tmp/backlog-refine-open.json`, `{tmp-faceted-file}` = `/tmp/backlog-refine-faceted.json`, `{EXTRA_FIELDS}` = `,body` — this pass needs bodies for synthesis). Under `work-backend: github-issues`, also fold in `unsynced: true` local fallback records the same way the retired `/claude-tweaks:review-backlog` skill's old Step 1 did:

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
  const worklist = rows.filter((r) => !r.facets.grants.build && !r.facets.grants.merge);
  const fresh = worklist.filter((r) => !r.facets.bot.blocked);
  const blocked = worklist.filter((r) => r.facets.bot.blocked);
  console.log(JSON.stringify({ fresh, blocked }));
" > /tmp/backlog-refine-worklist.json
```

When `--origin <name>` was passed (see `SKILL.md`'s Input), export `BACKLOG_ORIGIN=<name>` before running the script above; omitted, it's unset and the script runs unfiltered. This mirrors the retired `/claude-tweaks:triage` skill's old Step 1 exactly, including the origin-agnostic default and the fresh/blocked split (`blocked` = hit the retry ceiling, `bot:blocked`, a re-authorization candidate).

**These are two separate fetches, not one.** The priority/Related fetch is unfiltered (needs the whole backlog); the grant fetch is server-side filtered to `--label ready` (preserves today's exact starvation-avoidance guarantee — an unfiltered pull risks pushing older `ready`-labeled issues out of a shared result window on a large backlog). Both route through the same `backlog-fetch-limit` config key and truncation-warning pattern, just as two independent invocations of it.

## Step 2: Priority/Related synthesis (bounded)

Over the priority/Related fetch's `unscored` split (`bin/lib/issues/backlog.js`'s `splitScoredUnscored`), bound the LLM read to `--budget` (default 40, independent of the grant pass's own budget in Step 3). When `--budget <n>` was passed (see `SKILL.md`'s Input), export `PRIORITY_BUDGET=<n>` before running the script below; omitted, it's unset and the script's own `:-40` default applies:

```bash
node -e "
  const bl = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/backlog.js');
  const all = require('/tmp/backlog-refine-faceted.json');
  const { unscored } = bl.splitScoredUnscored(all);
  const { selected, remaining } = bl.selectBudgetSlice(unscored, ${PRIORITY_BUDGET:-40});
  console.log(JSON.stringify({ selected, remaining }));
" > /tmp/backlog-refine-priority-budget.json
```

Read every selected body in one pass and produce:

- A narrative summary + thematic clusters (group by shared theme/origin/root cause, not just by label — the same read a human gets from reading a handful of related issues side by side).
- A per-record `priority:*` suggestion with a one-line rationale.
- A per-record, **non-binding** tier guess (`quick`/`full`) — purely to help a human eyeball a batch before deciding what to send to `/specify` next. This is never written as a label; only `/specify`'s own `ceremony-check` (a separate, authoritative computation with deeper context — the record's fully shaped Deliverables/Acceptance Criteria, not this pass's rougher read) writes `ceremony:*`. See `docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md`.
- Detected `**Related:**` cross-references — pairs of selected records whose bodies reference each other's context in prose without a formal link (`**Related:**` is `/capture`'s own body-template line; nothing else reads or maintains it — `_shared/work-record.md`). Never suggest `Blocked by #N` here — that's the formally-parsed hard-dependency mechanism, out of scope for this skill (`_shared/work-record.md`'s permission matrix).

If `remaining > 0`, state it plainly in the report: "`{remaining}` more unscored records exist beyond this run's `--budget {N}` — re-run to continue." Never silently drop them.

## Step 3: Grant-check (bounded, `work-backend: github-issues` only)

Bound the grant-check LLM pass independently of Step 2's budget. When `--budget <n>` was passed (see `SKILL.md`'s Input), export `GRANT_BUDGET=<n>` before running the script below; omitted, it's unset and the script's own `:-40` default applies:

```bash
node -e "
  const bl = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/backlog.js');
  const data = require('/tmp/backlog-refine-worklist.json');
  const { selected, remaining } = bl.selectBudgetSlice(data.fresh || [], ${GRANT_BUDGET:-40});
  console.log(JSON.stringify({ selected, remaining, blocked: data.blocked || [] }));
" > /tmp/backlog-refine-grant-budget.json
```

For every record in `selected`, invoke `/claude-tweaks:assess-agent-autonomy` in `grant-check` mode, once per record, every backlog refine session — never pre-filtered to "borderline" records:

```
Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "grant-check #{n}")
```

Each invocation returns `RECOMMEND_BUILD`/`RECOMMEND_MERGE`/`RATIONALE` (see
`skills/assess-agent-autonomy/SKILL.md`'s `grant-check` mode). Derive the unified table's
Recommended column directly from this output, and carry `RATIONALE` through to the table's own
Rationale column (Step 4) and the `decisions.md` log line (Step 5) — a content-aware judgment the
human is about to act on must stay visible at decision time and stay in the audit trail
afterward, not be computed and then silently discarded. `blocked` rows (below) have no
`assess-agent-autonomy` call to draw a rationale from — their Rationale column reads a fixed
string instead, per Step 4.

- **`RECOMMEND_BUILD: true`** → `auto:build` (append `+ auto:merge` when `RECOMMEND_MERGE` is also
  `true`).
- **`RECOMMEND_BUILD: false`** → `flag back (needs scoring)`. The human may supply scoring inline as
  a free-text override instead of flagging back — the gate then stamps the supplied `risk:*`/
  `effort:*` labels alongside the grant (Step 5).

For every record in `blocked` (unaffected by the budget — the retry-ceiling population is
typically small and its re-authorization recommendation needs no `grant-check` call at all), skip
`grant-check` and recommend **`re-authorize (bot:blocked)`** directly, regardless of content — a
prior failure means the human's renewed judgment is the point, not a mechanical (or
judgment-driven) replay: applying this row grants `auto:build` only, never bundling `auto:merge`
automatically. Restoring `auto:merge` too requires an explicit override.

If `remaining > 0` (from the `fresh` budget slice), state it plainly in the report: "`{remaining}`
more ready records awaiting grant-check exist beyond this run's `--budget {N}` — re-run to
continue."

## Step 3.5: Body-shape re-verification (before granting)

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

## Step 4: Unified table

```markdown
### Backlog Refine — {N} suggested label changes

| # | Record | Type | Origin | Current | Recommended | Suggested Tier | Rationale |
|---|---|---|---|---|---|---|---|
| 1 | #123: {title} | priority | by:code-health | (none) | priority:high | quick? (guess) | {synthesis rationale} |
| 2 | #16: {title} | related | by:capture | (none) | Add **Related:** #23 | — | {synthesis rationale} |
| 3 | #124: {title} | grant | by:capture | — | auto:build + auto:merge | — | {grant-check RATIONALE} |
| 4 | #118: {title} | grant | by:harness-health | bot:blocked | re-authorize (bot:blocked) | — | Prior failure — human judgment required, not a mechanical replay |
```

The `Type` column (`priority`/`related`/`grant`) is what keeps grant rows visually distinguishable within the single table — a human scanning it can still see at a glance which rows are security-relevant, even though there is only one confirm gate for the whole batch. For 10 or more rows, lead with a one-line count summary before the table (e.g. "18 suggestions: 6 priority, 3 related, 7 grants, 2 re-authorizations") so the human sees the batch's shape before the row detail.

The `Suggested Tier` column is populated only for `priority`-type rows — a byproduct of Step 2's per-record LLM read, which runs only over unscored records; `related` and `grant` rows always render `—`. Render the two sources distinguishably — a real `ceremony:*` label (already-scored records, per Step 1's mechanical display) plainly (`fast-lane`/`standard`); this step's own LLM guess suffixed (`quick? (guess)`/`full? (guess)`) — so a human scanning the batch never mistakes an unscored guess for `/specify`'s authoritative verdict. The `Suggested Tier` column is informational only — it rides along with the unified table, never gated behind its own `AskUserQuestion`, and is never itself written anywhere.

Then one `AskUserQuestion`:

- `question`: `"Apply these label changes, or override specific items?"`, `header`: `"Backlog refine"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Set priority/Related/grants exactly per the table above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"I'll specify #-by-# corrections in my next message"`
- Option 3 — `label`: `"Grant auto:build only, hold merge"`, `description`: `"Apply every non-grant suggestion normally, and apply auto:build/re-authorize to every grant row, but withhold auto:merge session-wide — even rows recommended for it. Useful for a first supervised run."`
- Option 4 — `label`: `"Skip all suggestions"`, `description`: `"Leave every record untouched for now"`

Overrides (including inline scoring for an unscored grant row) are ordinary free-text in the user's next message, not the `Other` field.

## Step 5: Apply

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

**Grant rows:** When Step 4 resolved to `"Grant auto:build only, hold merge"` (Option 3 above), skip every `auto:merge` grant below for the remainder of this session — apply `auto:build`/re-authorize exactly as the table recommended, but never the `gh issue edit "$ISSUE" --add-label auto:merge` line, regardless of what the row's own Recommended column said. This is a session-wide override, not a per-row judgment call — it doesn't change what Step 3 recommended or what the unified table displayed, only what Step 5 writes.

For every row still marked for granting after Step 3.5:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['auto:build', 'Grant: agents may build this record autonomously (human-granted; machinery only removes)'],
#  ['auto:merge', 'Grant: a clean autonomous run may merge unreviewed (stacks on auto:build; alone inert)']]
# — add the matching risk:low|medium|high / effort:low|medium|high pair too, only for a row where
# the human supplied scoring inline during the override step (Step 4).

if gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -qx bot:blocked; then
  gh issue edit "$ISSUE" --remove-label bot:blocked --add-label auto:build
else
  gh issue edit "$ISSUE" --add-label auto:build
fi
# Row also grants auto:merge:
gh issue edit "$ISSUE" --add-label auto:merge
# Row's scoring came from an inline override in Step 4 (an unscored "—" row the human supplied
# risk:$RISK_TIER / effort:$EFFORT_TIER for directly, rather than flagging back or accepting the
# default "needs scoring" recommendation) — persist the human-supplied scoring as labels too,
# not just the grant, so the record doesn't re-enter later batch views (e.g.
# /claude-tweaks:backlog overview risk-value's ranked table) still showing as unscored:
gh issue edit "$ISSUE" --add-label "risk:$RISK_TIER" --add-label "effort:$EFFORT_TIER"
```

Stripping `bot:blocked` in the same edit as the grant matters: without it, the record carries both `bot:blocked` and a fresh `auto:build`, and `/claude-tweaks:dispatch`'s skip rule ignores anything `bot:blocked` forever regardless of the new grant.

**Flag-back rows:** For every row flagged back — Step 3.5's auto-downgrade, an unscored row accepted as recommended, or a human override in Step 4 — remove `ready` and post a comment. Step 3.5's downgrade always uses its exact wording above; every other flag-back uses a shorter comment: `Flagged back by /claude-tweaks:backlog refine: {reason}. Re-add 'ready' once addressed.`, where `{reason}` is `needs scoring` for the recommended case or the human's own free-text reason for an explicit override.

```bash
gh issue edit "$ISSUE" --remove-label ready
gh issue comment "$ISSUE" --body-file /tmp/backlog-refine-flagback-${ISSUE}.md
```

Log every action to this run's `decisions.md` (standalone-auto run dir per `_shared/pipeline-run-dir.md`):

```
AUTO {time} — Backlog refine: set priority:{tier} on #{n}.
AUTO {time} — Backlog refine: updated **Related:** on #{n} to reference #{m}.
AUTO {time} — Backlog refine: granted auto:build{ + auto:merge} to #{n} (risk:{riskTier}, effort:{effortTier}). Rationale: {grant-check RATIONALE}.
AUTO {time} — Backlog refine: re-authorized #{n} — stripped bot:blocked, granted auto:build{ + auto:merge}.
AUTO {time} — Backlog refine: flagged back #{n} — {missing sections | needs scoring}.
```

## Concurrency

Two humans running `/claude-tweaks:backlog refine` at the same time is safe by construction — every label add is idempotent, so two overlapping grants on the same record just repeat the same write. The one sharp edge is a genuine race between a grant and a flag-back landing on the *same* record in the same window: last-writer-wins on GitHub's own label state. This is acceptable, not engineered around — it is a narrow, self-correcting window (the next `/claude-tweaks:backlog refine` run reads whatever state won and proceeds from there), not worth a lock.
