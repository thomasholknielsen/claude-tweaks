# GitHub PR Scan — Shared Procedure

Single source of truth for scanning GitHub pull-request and issue state. Consumed by `/claude-tweaks:help` (Stage 4.5, **`current-pr`** scope; Stage 4.6, **`triage-queue`** scope; Stage 4.7, **`acceptance-queue`** scope; Stage 4.8, which inlines the Detection Ladder alone — its fetch and render come from `_shared/trust-table.md`, so it consumes no scope section below) and `/claude-tweaks:tidy` (Step 4.8, **`repo-wide`** scope; Step 4.8, **`acceptance-gap`** scope; Step 4.8, **`family-gate`** scope). Subagents cannot read this file — the dispatcher inlines the relevant scope section, plus the Detection Ladder and Output Contract, into the scan agent's prompt (the same pattern as `tidy/scan-procedures.md`). A scope section is inlined **whole**, its `work-links` resolution and fetch-limit sub-sections included: the `acceptance-gap` and `family-gate` scopes each carry a `work-links: body-text` / `work-links: native` branch pair, and an agent that cannot resolve `work-links` cannot choose between them — taking the first-listed `body-text` branch on a `native` repo returns zero leaves from every parent and makes both scopes silently wrong (see each scope's own resolution sub-section for the failure it produces).

Every `gh issue list`/`gh pr list` call below carries an explicit `--limit` — `gh`'s implicit default is 30, which silently truncates instead of erroring. A result count landing exactly at the stated limit means the scan may be incomplete; treat that as a signal to narrow the query (a tighter label/state filter) or re-run with a higher `--limit`, not as a final count.

## Detection Ladder (fail-open)

Run these checks in order before any scan. On the first failure, emit the single info row shown and stop — a skipped GitHub scan is normal, never a `BLOCKED` status, never a hard gate.

| # | Check | Command | On failure, emit Finding / Evidence |
|---|-------|---------|-------------------------------------|
| 1 | GitHub remote exists | `git -C "{REPO_ROOT}" remote get-url origin` exits 0 (any host — no longer string-matched against `github.com`, which false-negated on GitHub Enterprise hosts like `github.mycompany.com`) | `GitHub scan skipped` / `no GitHub remote` |
| 2 | gh CLI installed | `command -v gh` exits 0 | `GitHub scan skipped` / `gh CLI not installed` |
| 3 | gh authenticated + repo reachable | `gh repo view --json owner,name` exits 0 (resolves the host from the remote automatically — works identically for github.com and GitHub Enterprise once authenticated for that host; replaces the old bare `gh auth status` check) | `GitHub scan skipped` / `gh not authenticated or repo unreachable` |

The skip row uses severity `info` and Path:Line `(github)`.

Individual `gh` command failures mid-scan (rate limit, network, transient API errors) degrade to a `DONE_WITH_CONCERNS` status line with whatever partial results exist — never `BLOCKED`.

`{REPO_ROOT}` resolves via `git rev-parse --show-toplevel` in the dispatcher before the agent fires (see Working Directory Discipline in `_shared/subagent-output-contract.md`).

## Staleness Thresholds

Keyed on `updatedAt`. Same scale as /tidy's backlog-record audit:

| Age since last update | Classification |
|----------------------|----------------|
| < 2 weeks | Fresh |
| 2-4 weeks | Review |
| > 4 weeks | Stale |

## Scope: `current-pr` (consumed by /help Stage 4.5)

Deep scan of the current branch's PR only, plus one cheap repo-wide count.

1. **PR lookup** — `gh pr view --json number,title,isDraft,reviewDecision,statusCheckRollup,closingIssuesReferences,url`. Non-zero exit means no PR for the current branch → emit one info row (`No open PR for current branch`), then run item 4 only.
2. **Unresolved review threads** — resolve `{owner}` and `{repo}` via `gh repo view --json owner,name -q '.owner.login + " " + .name'`, `{number}` from item 1, then run exactly:

   ```bash
   gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100){nodes{isResolved}}}}}' -f owner='{owner}' -f repo='{repo}' -F pr={number} --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)] | length'
   ```

3. **CI checks** — `gh pr checks {number}` → count failing / pending / passing. Exit code 8 means checks are still pending; a non-zero exit that still lists checks is valid output, not a scan failure.
4. **Repo-wide stale count (maintenance signal only)** — `gh pr list --state open --json number,updatedAt --limit 100` → total open PRs + count stale per the thresholds above. This row is routed to the caller's maintenance-signals rendering, not the Current PR dashboard section.

Emit `[pr]` rows per the Output Contract.

## Scope: `repo-wide` (consumed by /tidy Step 4.8)

Full sweep of open PRs, `by:code-health`-labelled issues, `by:harness-health`-labelled issues, `by:journey-health`-labelled issues, and `by:docs-health`-labelled issues. Backlog-record findings (stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) are `/tidy` Step 1's job now, not this scope's — `repo-wide` no longer queries the retired `backlog` label (see `tidy/step-1-records.md`).

> **Parallel execution:** Use parallel tool calls aggressively — items 1, 3, 4, 5, 6, 7, and 8 below, plus each open PR's own review-thread query in item 2, are independent gh/bash calls with no dependency on one another and should run concurrently.

1. **Open PRs** — `gh pr list --state open --json number,title,updatedAt,isDraft,reviewDecision,headRefName,url --limit 100` → classify each per the Staleness Thresholds. A PR that is simultaneously not draft, not yet `Stale` (< 4 weeks since `updatedAt` — spans both the `Fresh` and `Review` bands, since neither currently has its own finding for a PR with nothing wrong), has zero unresolved review threads (item 2 below), and has no failing/pending CI (`gh pr checks`) gets its own finding: `[pr] PR #{n}: {title} — awaiting review — last updated {age} ago, CI {status}, 0 unresolved threads`. This is informational only — see the Severity mapping and `tidy/SKILL.md`'s Step 6 routing below. A PR with failing/pending CI (`gh pr checks`) or `reviewDecision: CHANGES_REQUESTED` instead gets its own finding, regardless of staleness: `[pr] PR #{n}: {title} — CI failing/pending or changes requested — CI {status}, review {reviewDecision}`. This is `high` severity per the Severity mapping below, not informational — see the Findings and recommendations table below.
2. **Unresolved threads per open PR** — the same GraphQL query as `current-pr` item 2, once per open PR.
3. **Code-health issues** — `gh issue list --label by:code-health --state open --json number,title,labels,updatedAt,url --limit 100`.
4. **Merged/closed PRs with local remnants** — `gh pr list --state merged --limit 50 --json number,headRefName` AND `gh pr list --state closed --limit 50 --json number,headRefName` (GitHub's PR `state` is `OPEN`/`CLOSED`/`MERGED` — mutually exclusive — so `--state closed` never overlaps `--state merged`; both queries are needed to cover "merged or closed without merging"); cross-check each `headRefName` from either result against `git -C "{REPO_ROOT}" branch --list` output.
5. **Harness-health issues** — `gh issue list --label by:harness-health --state open --json number,title,labels,updatedAt,url --limit 100`.
6. **Journey-health issues** — `gh issue list --label by:journey-health --state open --json number,title,updatedAt,url --limit 100`.
7. **Docs-health issues** — `gh issue list --label by:docs-health --state open --json number,title,labels,updatedAt,url --limit 100`.
8. **Grant-queue counts** — one self-contained query feeds three maintenance-signal counts, per `_shared/work-record.md`'s record taxonomy. Not gated on `work-backend` — this scope only runs once the Detection Ladder already confirmed a reachable GitHub remote, regardless of which driver stores records:

   ```bash
   gh issue list --state open --json number,title,labels --limit 200 > /tmp/pr-scan-records.json
   node -e "
     const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
     const { isPendingAuthorization } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/pending-authorization.js');
     const issues = require('/tmp/pr-scan-records.json');
     const faceted = issues.map((i) => parseRecordFacets(i.labels));
     const withFacets = issues.map((i, idx) => ({ number: i.number, title: i.title, facets: faceted[idx] }));
     const pending = withFacets.filter((i) => i.facets.stage === 'ready' && isPendingAuthorization(i.facets)).length;
     const blocked = withFacets.filter((i) => i.facets.bot.blocked).length;
     const backlog = withFacets.filter((i) => i.facets.stage === 'backlog').length;
     console.log(JSON.stringify({ pending, blocked, backlog }));
   "
   ```

   - **Pending authorization** — `ready` ∧ no `auto:*` ∧ no `bot:*` (neither `bot:in-progress` nor `bot:blocked`). Origin-agnostic: any record any health skill, `/claude-tweaks:capture`, or a human filed counts, with or without a `by:*` label — matching `/claude-tweaks:backlog refine`'s own origin-agnostic `ready`-queue pull (`skills/backlog/refine-mode.md`), which no longer tiers any health-skill origin specially. This is a maintenance signal only — `/tidy` never grants authorization itself (`/claude-tweaks:backlog refine` owns that).
   - **`bot:blocked`** — records that hit their retry ceiling and need a human's renewed judgment at `/claude-tweaks:backlog refine` before re-entering the autonomous queue (same definition as `tidy/step-1-records.md`'s Shape 5).
   - **Backlog-state** — open records carrying neither `ready` nor `parked` — the default, unasserted state per `_shared/work-record.md`'s lifecycle spine.

   Surface all three as the `[queue]` Output Contract row below — bare counts only, per the Output Contract's own documented shape. No per-record enumeration is produced or needed here.

Findings and recommendations (tidy Action Vocabulary):

| Finding | Recommendation |
|---------|---------------|
| Open PR has failing/pending CI or `CHANGES_REQUESTED` (item 1's second finding) | Investigate the CI failure or address the requested changes — local action |
| Open PR stale (>4 weeks, no updates) | Close (GitHub) or Resume — judgment call |
| Open PR superseded (related spec complete, equivalent changes merged) | Close (GitHub) |
| Merged/closed PR whose head branch or worktree still exists locally | Corroborates Step 4.5 `[git]` cleanup — dispatcher merges at assembly |
| Unresolved review thread addressed by a later commit (evidence: commit touching the flagged lines) | Resolve thread |
| Unresolved review thread not addressed | Capture to backlog or run `/claude-tweaks:review` — local action |
| `by:{skill}` issue stale (>4 weeks, the flagged code/target/journey/doc has since changed or been removed) — `{skill}` is any of `code-health`/`harness-health`/`journey-health`/`docs-health` | Close (GitHub) — superseded |
| `by:{skill}` issue still valid | Suggest `/claude-tweaks:backlog refine` or Capture to backlog — all four health skills are report-only and never apply patches directly (see each skill's own SKILL.md Anti-Patterns table), so a still-valid issue always needs a human-routed fix regardless of which skill filed it |

Emit `[pr]` and `[gh-issue]` rows per the Output Contract. Backlog-record findings (the record-scan shapes: stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) no longer originate from this scope — see `tidy/step-1-records.md` for their findings table and `[backlog]`/`[parked]`/`[unsynced]`/`[scoring]`/`[blocked]`/`[legacy]` row prefixes.

## Scope: `triage-queue` (consumed by /help Stage 4.6)

Three cheap counts for the dashboard's Triage Queue section. This scope exists so `/help` never hand-writes its own query for these numbers — see the fix this closes: Stage 4.6 previously computed "pending authorization" without excluding `bot:blocked` records, so a blocked record counted as both pending AND blocked on the same dashboard.

1. **Pending authorization** — `ready` ∧ no `auto:*` ∧ no `bot:*` (neither `bot:in-progress` nor `bot:blocked`). Origin-agnostic: matches `/claude-tweaks:backlog refine`'s own `ready`-queue pull (`skills/backlog/refine-mode.md`), which tiers no health-skill origin specially — every `ready` record, with or without a `by:*` label, is in scope.

   ```bash
   gh issue list --label ready --state open --json number,labels --limit 200 > /tmp/triage-queue-ready.json
   node -e "
     const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
     const { isPendingAuthorization } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/pending-authorization.js');
     const issues = require('/tmp/triage-queue-ready.json');
     const pending = issues.filter((i) => isPendingAuthorization(parseRecordFacets(i.labels))).length;
     console.log(pending);
   "
   ```

2. **Blocked** — `gh issue list --label bot:blocked --state open --json number --limit 200 -q 'length'`

3. **Auto-merged this week** — `[fast-lane]`-tagged (wrap-up's single-record Auto-merge short-circuit, `wrap-up/review-console.md`) or `[auto-merge]`-tagged (dispatch's group-scoped bundle gate, `dispatch/SKILL.md`) — both headless autonomous merges, distinguished by scope, not by which is current — commits on the *default* branch (never the current worktree's own branch — see the note on `worktree.always` below), last 7 days:

   ```bash
   SINCE=$(node -e "console.log(new Date(Date.now() - 7*24*60*60*1000).toISOString())")
   gh api "repos/{owner}/{repo}/commits?since=${SINCE}&per_page=100" -q '[.[] | select(.commit.message | contains("[fast-lane]") or contains("[auto-merge]"))] | length'
   ```

   The commits endpoint defaults to the default branch when no `sha=` param is given — correct regardless of which branch/worktree `/help` itself runs from under `worktree.always`. `SINCE` is computed via `node`, not shell `date` arithmetic, which differs between BSD/macOS and GNU date.

Render as three lines: `Pending authorization: **{N}** records awaiting your decision` / `Blocked: **{N}** records hit their retry ceiling` / `Auto-merged this week: **{N}** auto-merges` — omit any line whose count is 0.

## Scope: `acceptance-queue` (consumed by /help Stage 4.7)

One cheap list for the dashboard's Acceptance Queue section — deliberately `--state all`, unlike
every other count in this file, since `demo:pending` persists independent of open/closed state
(an `auto:merge`'d record's issue can already be closed while still awaiting sign-off). `/demo`
no longer sweeps this backlog itself (it resolves one item per invocation), so this is the sole
place the outstanding set is enumerated.

```bash
gh issue list --label demo:pending --state all --json number,title --limit 200
```

Render as one line listing every matching record: `Awaiting sign-off: **{N} records** — #{n1}
({title1}), #{n2} ({title2}), ... — run /demo #N on any of these` — omit entirely when the count
is 0.

## Scope: `acceptance-gap` (consumed by /tidy Step 4.8)

Finds closed records that carry no acceptance label at all — the case `acceptance-queue` above
cannot see, since that scope only lists records already flagged `demo:pending`. A record closed
without ever receiving a `demo:*` label is invisible to `acceptance-queue` and would otherwise
disappear from the backlog with no disposition on record. Classification is entirely
`needsBackstop`'s (`bin/lib/issues/acceptance.js`) — this scope does not reimplement the
label taxonomy; see that module or `_shared/work-record.md` for what the labels mean.

**This scope finds `work-backend: github-issues` records only**, for the same reason the
`family-gate` scope below does: it reads GitHub labels, and the Detection Ladder above skips this
whole file whenever `gh` is unreachable — it checks remote/install/auth, never `work-backend`. The
`local-files` twin of this sweep is `tidy/step-1-records.md`'s Shape 8, reading the record store
through `queryRecords` and translating `facets.closed`/`facets.acceptance`/`facets.parent` into
the same `needsBackstop` call. It emits the identical `[acceptance-gap]` row at the identical
severity and recommends the identical `/claude-tweaks:demo` invocation, so no consumer
distinguishes the two.

Record set: closed records from the last 30 days. The `date` fallback covers both platforms this
plugin runs on — BSD `date` (macOS, this project's development platform) uses `-v-30d`; GNU `date`
(Linux, cloud Routine sandboxes) uses `-d '30 days ago'`.

```bash
gh issue list --state closed --limit 200 \
  --json number,title,state,labels,closedAt \
  --jq '[.[] | select(.closedAt > "'"$(date -u -v-30d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)"'")]' \
  > /tmp/tidy-closed-records.json
```

A closed record whose acceptance lives on a `/claude-tweaks:specify` decomposition parent must
not count as a gap — `needsBackstop`'s `hasParent` field exists precisely to suppress it. Resolving
which closed records are leaves reuses the same parent-side enumeration the `family-gate` scope
below already documents in full — never the leaf side, which works under one `work-links` mode and
silently returns nothing under the other. This step only needs leaf *existence*, not
per-leaf state, so it skips that scope's state-map plumbing; and it fetches `--state all` rather
than `family-gate`'s `--state open`, because a leaf whose family was already gated and approved —
which closes the parent (`demo/SKILL.md`'s Approve step) — must still be suppressed here, and an
open-only fetch would miss it.

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
`/tmp/tidy-acceptance-gap-leaves.json` is empty, and every decomposed leaf re-enters this scope
as a false `[acceptance-gap]` row — the
exact flood `hasParent` exists to stop, with no error anywhere to say so.

### Fetch limit

Both branches below bound the `family:parent` fetch with `{resolved-limit}` rather than a
hardcoded cap. Read `backlog-fetch-limit` from the project's `.claude-tweaks/policy.yml`
(`_shared/work-record-config.md`'s key table) and substitute the literal number into **every**
block below that names it; use `1000` when the key is absent. Substitute it independently per
block and never carry it across blocks in a shell variable — shell environment does not survive
between Bash calls and never reaches a subagent, so a cross-block `export` silently resolves
empty (the same discipline `_shared/trust-table.md` states for its own identical fetches).

This scope's own closed-record fetch above keeps its hardcoded `--limit 200`: its record set is
bounded to the last 30 days, so 200 is in practice never reached. The `family:parent` fetches are
not — they are `--state all` over the repo's entire history, and `gh issue list` returns
newest-first, so a fixed cap drops the **oldest** families first. Those are precisely the families
whose leaves have already closed, so truncation silently re-floods this scope with exactly the
rows the filter exists to remove.

**`work-links: body-text`** — every parent's task list comes back in the same fetch:

```bash
LIMIT="{resolved-limit}"
export FETCH_LIMIT="$LIMIT"
gh issue list --label family:parent --state all --json number,body --limit "$LIMIT" \
  > /tmp/tidy-family-parents-for-gap.json

node -e "
  const { parseFamilyLeaves } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const fs = require('fs');
  const parents = require('/tmp/tidy-family-parents-for-gap.json');
  if (parents.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + parents.length + ' family:parent records (the configured backlog-fetch-limit) — older families were dropped, so their leaves re-enter this scope as false acceptance-gap rows. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before acting on any row below.');
  }
  const leafNumbers = parents.flatMap((p) => parseFamilyLeaves(p.body));
  fs.writeFileSync('/tmp/tidy-acceptance-gap-leaves.json', JSON.stringify(leafNumbers));
"
```

**`work-links: native`** — one `sub_issues` call per parent, same endpoint as `family-gate`'s
native branch:

```bash
LIMIT="{resolved-limit}"
export FETCH_LIMIT="$LIMIT"
gh issue list --label family:parent --state all --json number --limit "$LIMIT" \
  > /tmp/tidy-family-parents-for-gap.json

: > /tmp/tidy-acceptance-gap-leaf-numbers.jsonl
node -e "require('/tmp/tidy-family-parents-for-gap.json').forEach(p => console.log(p.number))" | while read -r N; do
  gh api "repos/{owner}/{repo}/issues/$N/sub_issues" --jq '.[].number' >> /tmp/tidy-acceptance-gap-leaf-numbers.jsonl
done

node -e "
  const fs = require('fs');
  const parents = require('/tmp/tidy-family-parents-for-gap.json');
  if (parents.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + parents.length + ' family:parent records (the configured backlog-fetch-limit) — older families were dropped, so their leaves re-enter this scope as false acceptance-gap rows. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before acting on any row below.');
  }
  const leafNumbers = fs.readFileSync('/tmp/tidy-acceptance-gap-leaf-numbers.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(Number);
  fs.writeFileSync('/tmp/tidy-acceptance-gap-leaves.json', JSON.stringify(leafNumbers));
"
```

With `/tmp/tidy-acceptance-gap-leaves.json` written by whichever branch applies, filter the
closed-record set — note the filename: this scope's leaf list and the `family-gate` scope's
`/tmp/tidy-families.json` are different artifacts written by different procedures in the same
agent prompt, so they never share a path:

```bash
node -e "
  const { needsBackstop } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/acceptance.js');
  const records = require('/tmp/tidy-closed-records.json');
  const familyLeaves = new Set(require('/tmp/tidy-acceptance-gap-leaves.json'));
  const gaps = records
    .map(r => ({ ...r, labels: r.labels.map(l => l.name), hasParent: familyLeaves.has(r.number) }))
    .filter(r => needsBackstop({ state: 'CLOSED', labels: r.labels, hasParent: r.hasParent }));
  gaps.forEach(r => console.log('[acceptance-gap] #' + r.number + ': ' + r.title + ' — closed with no acceptance disposition — recommend /claude-tweaks:demo #' + r.number));
"
```

Note the spread order: derived fields come after the parsed spread, never before (`[IL-01]`).

Un-dispositioned closed records are **staged, never auto-applied**, regardless of
`tidy-aggressiveness`. Applying a disposition is a judgment about whether shipped work actually
solved the problem — not a mechanical cleanup — and `_shared/auto-mode-contract.md` places that
kind of work-record judgment outside what `auto` silences. Do not fold this finding into any
auto-apply tier.

Emit `[acceptance-gap]` rows per the Output Contract, at severity `info` — not `medium`, and
not `low`. This is the one finding in this file whose row count is a standing backlog rather
than a defect count: on a repo that closes records ad hoc it returns a three-digit set on every
run, indefinitely. `/claude-tweaks:tidy` runs this scope in the same agent as `repo-wide`
(`tidy/scan-procedures.md` Step 4.8) under one 15-row, highest-severity-first cap, so any tier
above `info` would permanently evict every actionable `repo-wide` finding beneath it. `info` is
also where its behavioural sibling already sits — "Open PR awaiting review", the other
no-mutation, always-surfaced row (`tidy/step-6-auto.md`).

## Scope: `family-gate` (consumed by /tidy Step 4.8)

Finds decomposition families whose every leaf has closed but whose parent carries no
acceptance disposition yet — the population `/claude-tweaks:wrap-up`'s own family-gate
procedure (`wrap-up/verification-brief.md`) applies eagerly when it closes a family's last leaf.
A leaf closed via `auto:merge`, by hand, or by a dispatch run that ended early never reaches
that eager path at all, so its family's gate never fires on its own; this scope is the backstop
sweep that catches it later.

Classification is entirely `familyGateState`'s
(`bin/lib/issues/acceptance.js`) — this scope does not reimplement the gate logic, and leaf
enumeration reuses the same parent-side resolution `wrap-up/verification-brief.md`'s
family-gate procedure already documents rather than inventing a second one.

**This scope finds `work-backend: github-issues` families only** — because it queries the
`family:parent` label, which exists on that driver alone. Nothing switches it off elsewhere: the
Detection Ladder above checks a reachable GitHub remote, an installed `gh`, and an authenticated
one — never `work-backend` — so a `local-files` project that has a GitHub remote (the normal
case, and why `repo-wide`'s PR scan runs there at all) passes the Ladder, runs this scope, and
simply gets zero rows back. Item 8 above states the same posture for its own counts.

What the Ladder does decide is the genuinely `gh`-absent case — no remote, `gh` not installed, or
not authenticated — where it skips this entire file, this scope included. That is what makes a
`gh`-gated file the wrong home for a sweep needing no `gh` at all, so the `local-files` twin of
this sweep lives in `tidy/step-1-records.md` (Shape 7), reading the record store through
`queryRecords`. It emits the identical `[family-gate]` row and feeds the identical
`Open family gate` action, so no consumer distinguishes the two.

Record set: open records carrying `family:parent` (`/claude-tweaks:specify` labels every
decomposition parent this way — see `specify/record-creation.md`'s Parent record section),
plus every issue's current state, fetched once.

### Fetch limit

**Both fetches are bounded by `{resolved-limit}`, never a hardcoded cap.** Read
`backlog-fetch-limit` from the project's `.claude-tweaks/policy.yml`
(`_shared/work-record-config.md`'s key table) and substitute the literal number into **every**
block below that names it; use `1000` when the key is absent. Substitute it independently per
block and never carry it across blocks in a shell variable — shell environment does not survive
between Bash calls and never reaches a subagent, so a cross-block `export` silently resolves
empty (the same discipline `_shared/trust-table.md` states for its own identical fetches). The
state map in particular is `--state all` over the repo's entire lifetime with no recency bound,
which is why it cannot carry a fixed cap: past that cap every truncated leaf defaults to `OPEN`,
so every family containing one reads `incomplete` and this backstop stops firing — permanently,
and with nothing on the output to say it did.

```bash
LIMIT="{resolved-limit}"
export FETCH_LIMIT="$LIMIT"
gh issue list --label family:parent --state open --json number,title,body,labels --limit "$LIMIT" \
  > /tmp/tidy-family-parents.json

gh issue list --state all --json number,state --limit "$LIMIT" \
  > /tmp/tidy-all-issue-states.json

node -e "
  const parents = require('/tmp/tidy-family-parents.json');
  const states = require('/tmp/tidy-all-issue-states.json');
  if (parents.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + parents.length + ' family:parent records (the configured backlog-fetch-limit) — older families were dropped and are invisible to this scope entirely. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before treating this scope as complete.');
  }
  if (states.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + states.length + ' issue states (the configured backlog-fetch-limit) — every leaf beyond this cap defaults to OPEN, so any family containing one reads incomplete and this backstop silently never fires for it. Raise backlog-fetch-limit in .claude-tweaks/policy.yml and re-run before treating this scope as complete.');
  }
"
```

**Report every warning emitted above verbatim beside this scope's rows, and never suppress
either of them.** Both truncations fail in the *quiet* direction — fewer rows, not wrong ones —
which is exactly the direction a backstop must never fail in silently, since a scope that emits
nothing is indistinguishable from a repo with no un-gated families.

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
construction, so `parseFamilyLeaves` returns `[]` for every parent, every family reads
`incomplete` (`familyGateState` never reports `due` for a family with no discoverable leaves),
and this backstop emits nothing at all — on a repo where it is the only thing that gates a
family whose last leaf closed outside `/claude-tweaks:wrap-up`.

### Leaf enumeration

For each parent, enumerate its leaves from the **parent** side — never the leaf side, which
works under one `work-links` mode and silently returns nothing under the other.
Leaf **state** is read from the state map just fetched above in both branches below, never from
a leaf's own `state` field wherever one happens to already be present in a response — GitHub's
REST responses (the `sub_issues` endpoint included) report lowercase `open`/`closed`, while
`familyGateState` and the state map both use the `gh issue list --json state` uppercase
`OPEN`/`CLOSED` form; reading from one source only avoids a silent casing mismatch. A leaf
number absent from the state map (the fetch above truncated before reaching it — the warning
above fires when that is possible) defaults to `OPEN`, the fail-safe direction — an unresolved
leaf must never let a family read as `due` (mirrors `familyGateState`'s own "never reports `due`
for a family with no discoverable leaves" rule).

**`work-links: body-text`** — every parent's task list is already in hand from the first fetch
above; no further `gh` calls:

```bash
node -e "
  const { parseFamilyLeaves } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const fs = require('fs');
  const parents = require('/tmp/tidy-family-parents.json');
  const stateOf = new Map(require('/tmp/tidy-all-issue-states.json').map(i => [i.number, i.state]));
  const families = parents.map(p => ({
    number: p.number,
    title: p.title,
    parentLabels: p.labels.map(l => l.name),
    leaves: parseFamilyLeaves(p.body).map(n => ({ number: n, state: stateOf.get(n) || 'OPEN' })),
  }));
  fs.writeFileSync('/tmp/tidy-families.json', JSON.stringify(families));
"
```

**`work-links: native`** — the parent body carries no task list, so leaf numbers come from the
sub-issues API instead, one call per parent (exactly `wrap-up/verification-brief.md`'s own
native command, `gh api repos/{owner}/{repo}/issues/{n}/sub_issues --jq '.[].number'`, run once
per parent in the fetched set — each result appended as one JSON line rather than assembled by
hand, so no shell-side JSON construction is needed):

```bash
: > /tmp/tidy-family-leaves.jsonl
node -e "require('/tmp/tidy-family-parents.json').forEach(p => console.log(p.number))" | while read -r N; do
  gh api "repos/{owner}/{repo}/issues/$N/sub_issues" --jq "{number: $N, leafNumbers: [.[].number]}" \
    >> /tmp/tidy-family-leaves.jsonl
done

node -e "
  const fs = require('fs');
  const parents = require('/tmp/tidy-family-parents.json');
  const stateOf = new Map(require('/tmp/tidy-all-issue-states.json').map(i => [i.number, i.state]));
  const byNumber = new Map(parents.map(p => [p.number, p]));
  const leafRows = fs.readFileSync('/tmp/tidy-family-leaves.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const families = leafRows.map(({ number, leafNumbers }) => {
    const p = byNumber.get(number);
    return {
      number,
      title: p.title,
      parentLabels: p.labels.map(l => l.name),
      leaves: leafNumbers.map(n => ({ number: n, state: stateOf.get(n) || 'OPEN' })),
    };
  });
  fs.writeFileSync('/tmp/tidy-families.json', JSON.stringify(families));
"
```

With `/tmp/tidy-families.json` assembled by whichever branch above applies, filter to families
whose gate is due:

```bash
node -e "
  const { familyGateState } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/acceptance.js');
  const families = require('/tmp/tidy-families.json'); // [{number, title, leaves, parentLabels}]
  families
    .filter(f => familyGateState({ leaves: f.leaves, parentLabels: f.parentLabels }) === 'due')
    .forEach(f => console.log('[family-gate] #' + f.number + ': ' + f.title + ' — family complete, no acceptance disposition — Open family gate, then /claude-tweaks:demo #' + f.number));
"
```

Un-gated families recommend the `Open family gate` action (`tidy/SKILL.md`'s Action Vocabulary,
executed for this scope's rows via `tidy/actions-github-issues.md`'s `## Open family gate`) — never applied without
going through `/tidy`'s own Step 6 batch approval first, at **every** aggressiveness tier in auto
mode (`step-6-auto.md`'s Open family gate row is `Stage`/`Stage`/`Stage`), the same as
`acceptance-gap` — though for a related but distinct reason. `Open family gate` posts a comment
and adds a label: an outward-facing GitHub API write. `_shared/auto-mode-contract.md`'s
reversibility floor requires `high` — "undoable via file edit or `git revert`" — before anything
may auto-resolve, and its never-reversible list separately forbids "network calls beyond reads
(no API writes, no message sends)" at every tier regardless of mode. Neither bar is clearable by
this write, however mechanical or precondition-only it is; `/claude-tweaks:wrap-up` applying the
identical write with zero staging is not a counter-example, since that write is an unconditional
step of a pipeline a human already launched against one named record and sits in no tier table at
all, unlike this action. Separately, and independent of the write-level reasoning above, this
scope and the `Open family gate` action it feeds never write `demo:approved` or
`demo:changes-requested` under any circumstance — that disposition stays exclusively
`/claude-tweaks:demo`'s job, staged and human-only, which is why the recommendation always still
ends with "then `/claude-tweaks:demo #{n}`" even once the gate is open.

Emit `[family-gate]` rows per the Output Contract, at severity `info` — the same severity
`acceptance-gap` uses and for the same reason: `/claude-tweaks:tidy` runs this scope in the same
agent as `repo-wide` and `acceptance-gap` under one 15-row, highest-severity-first cap
(`tidy/scan-procedures.md` Step 4.8), and this can be a standing backlog on a repo with several
open decompositions, not a one-off defect count.

## Output Contract

Two collection prefixes for PR/code-health/harness-health/journey-health/docs-health findings, one grant-queue-metrics prefix (`repo-wide` scope only, unconditional — the grant-queue counts exist regardless of which driver stores records), one un-dispositioned-closed-record prefix (`acceptance-gap` scope only), and one un-gated-family prefix (`family-gate` scope only) — all emitted as standard Template A rows (`_shared/subagent-output-contract.md`) so existing dispatchers consume them unchanged:

- `[pr]` — pull-request findings: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
- `[gh-issue]` — code-health/harness-health/journey-health/docs-health issue findings: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
- `[queue]` — grant-queue metrics (item 8 above, `repo-wide` scope only, derived from the single `gh issue list --state open` query already fetched): `[queue] {N} pending authorization, {M} bot:blocked, {K} backlog`
- `[acceptance-gap]` — closed records with no acceptance disposition (`acceptance-gap` scope above): `[acceptance-gap] #{n}: {title} — closed with no acceptance disposition — recommend /claude-tweaks:demo #{n}`
- `[family-gate]` — decomposition families with every leaf closed and no acceptance disposition on the parent (`family-gate` scope above): `[family-gate] #{n}: {title} — family complete, no acceptance disposition — Open family gate, then /claude-tweaks:demo #{n}`

Backlog-record findings (the record-scan shapes: stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) no longer emit from this scope — they are `/tidy` Step 1's `[backlog]` / `[parked]` / `[unsynced]` / `[scoring]` / `[blocked]` / `[legacy]` rows now (`tidy/scan-procedures.md`).

Severity mapping (Template A Severity column):

| Signal | Severity |
|--------|----------|
| Failing CI or `CHANGES_REQUESTED` on any open PR (current branch's or repo-wide) | high |
| Unresolved review threads | medium |
| Stale open PR (>4 weeks) | medium |
| Open PR superseded (related work already merged) | medium |
| Merged/closed PR with local branch/worktree remnants | medium |
| Code-health/harness-health/journey-health/docs-health issue stale/superseded | medium |
| Code-health/harness-health/journey-health/docs-health issue still valid, awaiting `/claude-tweaks:backlog refine` | low |
| Open PR awaiting review (not draft, not yet `Stale`, 0 unresolved threads, CI clean) | info |
| Closed record with no acceptance disposition (`acceptance-gap` scope) | info |
| Decomposition family complete with no acceptance disposition (`family-gate` scope) | info |
| Fresh draft PR / no PR / scan skipped | info |
