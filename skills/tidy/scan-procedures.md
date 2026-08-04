# Tidy — Scan Procedures

Per-step scan rules for `/claude-tweaks:tidy`. Each scan reads a single data source and collects findings in the `[type] item — detail — recommendation` format. The parallel dispatcher inlines the relevant section into each agent's prompt so agents have everything they need (subagents cannot read sibling files).

Step numbering matches `SKILL.md`. The order below mirrors execution order. There is no Step 2 — Steps 1 and 2 merged into one record scan (below); the rest of the numbering is unchanged so existing cross-references from other skills (`/claude-tweaks:dispatch`, `wrap-up/cleanup-procedures.md`) keep pointing at the right step.

---

## Step 1: Audit Work Records

Read the `work-backend` field from the project's CLAUDE.md (under a `## Work records` section, written by `/claude-tweaks:init`). A missing flag is treated as `local-files`.

One query per driver feeds every finding shape below — the record store itself is the current landscape; there is no separate directory or index file to read (`_shared/work-record.md`). This single step replaces the old file-scan (former Step 1), spec-directory scan (former Step 2), and the backlog-issue portion of Step 4.8's `repo-wide` scan — all three read from the same record taxonomy now, so they collapse into one query + one facet parse.

Fetch and facet-parse the queue per `_shared/record-queue-fetch.md` — the dispatcher inlines that file's `work-backend` resolution, both drivers' fetch commands, and the Staleness clock and Threshold resolution sections into this agent's prompt (the same pattern already used for `_shared/github-pr-scan.md`), with `{tmp-records-file}` = `/tmp/tidy-records.json`, `{tmp-faceted-file}` = `/tmp/tidy-records-faceted.json`, and no `{EXTRA_FIELDS}` needed for this fetch — the legacy-taxonomy shape below needs the raw `labels` array, not just the parsed `facets`, and the shared fetch's script already preserves both (its spread keeps `labels` alongside the derived `facets`).

Also pull any local fallback records left behind by a failed GitHub write — these feed the Sync shape below:

```bash
node -e "
  const { queryRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
  console.log(JSON.stringify(queryRecords('specs', { unsynced: true })));
" > /tmp/tidy-unsynced.json
```

Every record returned by the `local-files` driver's fetch already carries its parsed `.facets` — no separate parse pass needed. Three of the seven shapes below don't apply under this driver: no Sync finding (`facets.unsynced` is a github-issues-fallback-only concept — see `_shared/work-record.md`), no `bot:blocked` finding (the local driver "carries no bot state"), and no legacy-taxonomy finding (its frontmatter schema never held the retired label vocabulary in the first place — that vocabulary is GitHub-label-only).

**Staleness clock**, either driver: per `_shared/record-queue-fetch.md`'s Staleness clock and
Threshold resolution sections (`{REPO_ROOT}` resolves the same way Step 4.5 below already
documents). Bands are computed by `classifyStaleness(ageMs, thresholdMs)`
(`bin/lib/issues/record-buckets.js`) against the resolved `record-staleness-weeks` threshold
(default 4 weeks): `fresh` below half the threshold, `review` from half the threshold up to
and including the threshold itself, `stale` beyond it. Shapes 1 and 2 below are the only
consumers of this scale — Step 3's design-doc/brief age rows and Step 4.7's claim-staleness
rows read different data sources and are not governed by `record-staleness-weeks`.

The predicates referenced below (`isBacklog`, `isParked`, `isBotBlocked`) and `classifyStaleness`
come from `require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record-buckets.js')`
(`bin/lib/issues/record-buckets.js`).

### Shape 1 — backlog record stale

`isBacklog(record)` (`bin/lib/issues/record-buckets.js`) — no stage label (`github-issues`) or no `stage:` frontmatter (`local-files`); the default state, per `_shared/work-record.md`'s lifecycle spine. Classify by the staleness clock above:

| Age | Default Recommendation |
|-----|----------------------|
| Fresh | Keep |
| Review | Keep (unless clearly stale) |
| Stale | Delete or Promote |

→ Collect each as: `[backlog] {title} — {age} — {recommendation}`

### Shape 2 — parked trigger met

`isParked(record)` (`bin/lib/issues/record-buckets.js`). Judge the trigger live — the same evidence `_shared/github-pr-scan.md`'s `repo-wide` scope already reads, so this shape and that procedure never disagree:

| Trigger status | Default Recommendation |
|---------------|----------------------|
| Milestone attached, `milestoneDueOn` is in the past | Promote (re-run `/claude-tweaks:specify`) |
| A `**Watched paths:**` line in the body names a path with a matching commit since the record was parked (per `git log`), and that commit's own diff/message does not already resolve the record's described problem | Promote |
| A `**Watched paths:**` line in the body names a path with a matching commit since the record was parked (per `git log`), **and that commit's own diff/message already resolves the record's described problem** | Delete — already implemented (cite the resolving commit SHA in the closing comment) |
| Neither trigger met, not yet `Stale` (per the staleness clock above) | Keep |
| Neither trigger met, `Stale` (per the staleness clock above) | Re-evaluate or delete |
| Prose-only trigger, no clear date/path condition | Judge live each sweep — Keep, or move back to backlog state |

A watched-path match is a signal to look again, not proof the record still needs work — read the matching commit's diff and message before recommending Promote. A commit that merely touches the watched path is not evidence the underlying problem is solved; only a commit whose content demonstrably addresses what the record describes counts as resolved. Conflating the two risks recommending `/claude-tweaks:specify` on a record whose work is already done, producing a redundant decomposition.

→ Collect each as: `[parked] {title} — {recommendation}`

`local-files`: the same trigger lives as body prose — `local-store.js`'s facet schema carries no dedicated trigger/milestone/watched-paths keys, so a locally parked record's `**Trigger:**` (and, when file-shaped, `**Watched paths:**`) line is read straight out of the record body, judged exactly the same way.

### Shape 3 — unsynced local record

`work-backend: github-issues` only. Every record `/tmp/tidy-unsynced.json` returned (`facets.unsynced === true`) is a local fallback from a failed GitHub write — `/claude-tweaks:capture`'s or `/claude-tweaks:specify`'s failure path (`_shared/work-record.md`). This is F9 from the program promise register: it covers `specs/{id}-{slug}.md` records with `unsynced: true` facets, exactly the artifact `/capture` and `/specify` already promise `/tidy` reconciles.

→ Collect each as: `[unsynced] {title} — local-only, not yet mirrored to GitHub — Sync to GitHub`

### Shape 4 — ready record missing scoring

`facets.stage === 'ready'` and (`facets.risk === null` or `facets.effort === null`). Labels are projection, not truth (`_shared/work-record.md`) — a `ready` record reaching this state without scoring usually means the label was hand-added on GitHub rather than stamped by `/claude-tweaks:specify`'s Shaping mode or a health skill's born-ready filing. `/claude-tweaks:backlog refine`'s own grant sub-stage would flag the identical gap reactively when it next pulls the `ready` queue; this surfaces it proactively during hygiene instead of waiting for a refine run.

→ Collect each as: `[scoring] {title} — missing {risk|effort|both} — flag for scoring (/claude-tweaks:specify re-stamps it)`

### Shape 5 — `bot:blocked` needing re-triage

`isBotBlocked(record)` (`bin/lib/issues/record-buckets.js`; `work-backend: github-issues` only — the local driver's `facets.bot.blocked` is always `false`, per `facet-shape.js`'s shared defaults, so this predicate never fires there). The record hit its retry ceiling (`_shared/issue-claims.md`, `dispatch/SKILL.md`'s Settle step) and needs a human's renewed judgment at `/claude-tweaks:backlog refine` before it can re-enter the autonomous queue.

→ Collect each as: `[blocked] {title} — hit its retry ceiling — re-authorize at /claude-tweaks:backlog refine`

### Shape 6 — flagged code demonstrably gone

Not scanned here. This is Step 4.8's code-health/harness-health/journey-health/docs-health issue judgment (`_shared/github-pr-scan.md`'s `repo-wide` scope, items 3/5/6/7) — unchanged by this merge. It's listed in this file only so the seven finding shapes the record-scan design replaces (former Steps 1 and 2, plus former Step 4.8's backlog-issue item) stay documented in one place; the mechanics that actually judge "is the flagged code gone" continue to live where they already did.

### Shape 7 — legacy taxonomy present

`work-backend: github-issues` only. Scan the RAW `labels` array (not the parsed facets, which silently drop anything they don't recognize) for any label matching the retired families: `tier:*` (the pre-grants three-tier vocabulary — needs-review, approved, fast-track), `status:*` (the pre-grants bot-state vocabulary — blocked, and the state now mirrored by the claim ref instead of a label), or `backlog`-era labels (the bare `backlog` label plus its `backlog:category-*`/`backlog:priority-*` sub-labels). A record carrying any of these is invisible to the current grants pipeline — `/claude-tweaks:backlog` only ever reads/writes the current label vocabulary (see `_shared/work-record.md`'s axes table), so a pre-6.0 record stuck on the old labels never surfaces at the gate on its own.

This is a **read-only flag** — `/tidy` never relabels it. A dedicated migration plan does the relabeling; this finding exists so a pre-6.0 record can never be silently orphaned in the meantime.

→ Collect each as: `[legacy] #{n}: {title} — carries {label list} — retired vocabulary, invisible to the grants pipeline — needs migration/re-triage`

## Step 3: Audit Design Docs and Briefs

Scan `docs/superpowers/specs/*-design.md` and `docs/plans/*-brief.md`.

**Design doc classification** — for each file in `docs/superpowers/specs/*-design.md`:

| Status | Recommendation |
|--------|---------------|
| Marked as specified, derived specs complete | Delete |
| No status, matches existing specs | Mark as specified |
| No status, no matching specs | Run `/claude-tweaks:specify` |
| Very old (4+ weeks), no specs | Delete |

**Brief classification** — for each file in `docs/plans/*-brief.md`:

| Status | Recommendation |
|--------|---------------|
| Matching design doc exists | Keep |
| No matching design doc, specs exist | Delete |
| No matching design doc, no specs | Delete |
| Very old (4+ weeks), no design doc | Delete |

→ Collect each as: `[doc] {filename} — {recommendation}`

## Step 4: Audit Execution Plans

Scan `docs/superpowers/plans/` for execution plan files and `~/.claude/plans/`.

| Status | Recommendation |
|--------|---------------|
| Related spec is complete | Delete |
| Related spec is in progress | Keep |
| No related spec found | Delete (orphan) |
| Very old, spec not started | Delete |

→ Collect each as: `[plan] {filename} — {recommendation}`

## Step 4.5: Audit Git Worktrees and Build Branches

**Working-directory discipline:** every `git` command in this step (and in any dispatched parallel agent) MUST be anchored with `git -C "{REPO_ROOT}"` (or run after `cd "{REPO_ROOT}"`). `{REPO_ROOT}` resolves via `git rev-parse --show-toplevel` in the dispatcher before any agent fires. See `_shared/git-discipline.md` and the Working Directory Discipline section in `_shared/subagent-output-contract.md`. CWD does not propagate reliably across parallel agents — without the anchor, branch deletions and worktree removals can land in the wrong checkout.

**Worktrees:** Run `git -C "{REPO_ROOT}" worktree list`. Any worktree beyond the main working tree is a candidate.

**Build branches:** Run `git -C "{REPO_ROOT}" branch --list "build/*"`.

| Status | Recommendation |
|--------|---------------|
| Related spec complete + changes merged | Remove/delete |
| Related spec in progress | Keep |
| No related spec found | Remove/delete (orphan) |
| Unmerged changes | Keep (flag for attention) |

→ Collect each as: `[git] {worktree/branch} — {recommendation}`

Use `git -C "{REPO_ROOT}" branch -d {branch}` (safe delete, refuses if unmerged). Use `git -C "{REPO_ROOT}" worktree remove {path}` for worktrees. If `-d` refuses, surface the branch as **`unmerged — manual review required`** rather than escalating to `-D` — destructive deletes are never autonomous in /tidy.

## Step 4.6: Audit Doc Registry

Scan `docs/REGISTRY.md` for health issues. Skip if the file doesn't exist.

| Issue | Recommendation |
|-------|---------------|
| Registry entry points to non-existent file | Delete entry |
| Doc file exists in `docs/` but not in registry | Add entry (with Auto-detect patterns) |
| Auto-detect pattern references non-existent directory | Update pattern |
| Registry tier doesn't match project complexity | Update tier (suggest `/claude-tweaks:init update`) — apply tier-detection signals from `detection-tables.md` in `/claude-tweaks:init` skill's directory |

→ Collect each as: `[registry] {issue} — {recommendation}`

## Step 4.7: Audit Issue Claims

**Working-directory discipline:** every command in this step (and in any dispatched parallel agent) — the claim-ref listing below and both backstops that use `find .claude-tweaks/pipelines` — MUST be anchored to `{REPO_ROOT}` (resolved via `git rev-parse --show-toplevel` in the dispatcher before any agent fires, the same resolution Step 4.5 already documents). Anchor with `cd "{REPO_ROOT}" &&` at the start of each command. CWD does not propagate reliably to dispatched Task agents (see `_shared/subagent-output-contract.md`'s Working Directory Discipline section) — an un-anchored `find .claude-tweaks/pipelines/...` doesn't error from the wrong cwd, it silently returns zero matches, which reads identically to "no missed restorations found," the opposite of the loud failure this anchor is meant to guarantee. `gh` commands need the same anchor: `gh` infers the target repo from the cwd's git remote, so a wrong cwd can point `gh issue list`/`gh api` at an unrelated repo entirely, not just fail to find files.

Skip silently when the repo has no GitHub remote (pre-check, before any listing attempt) —
`gh` being unavailable alone no longer skips this step, per `_shared/github-write-transport.md`;
use the MCP path instead. If the ref-listing call itself fails mid-scan (rate limit, transient
API error) after passing that pre-check, skip the rest of this step and note it in the
report — per `_shared/issue-claims.md`'s Failure posture table ("Ref listing fails in /tidy
→ skip the sweep step, note it in the report"), not silently. See `_shared/issue-claims.md`
for the full protocol.

List claim refs; for each, fetch the issue's state and comments, and fold through
`claimStatus`:

```bash
gh api "repos/{owner}/{repo}/git/matching-refs/claims/" -q '.[].ref'
# for each refs/claims/issue-<n>:
gh issue view <n> --json state -q .state
gh api "repos/{owner}/{repo}/issues/<n>/comments?per_page=100" > /tmp/tidy-claims-<n>.json
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimStatus(require(process.argv[1]),Date.now())))" /tmp/tidy-claims-<n>.json
```

(gh path shown above; use `_shared/issue-claims.md`'s MCP-path "List all claims" when `gh` is
unavailable — a directory listing of `claims/` on the `claims-registry` branch instead of
`git/matching-refs`.)

| Status | Recommendation |
|--------|---------------|
| Issue closed (any claim state) | Release (orphan — the work is done or dismissed) |
| Claim stale (`stale: true`) | Release (crashed or abandoned run) |
| Ref exists, `claimed: false, everReleased: true`, issue open | Release (orphaned ref — a prior release's comment posted but the ref-delete failed; safe to break, per `_shared/issue-claims.md`'s Failure posture table) |
| Ref exists, `claimed: false, everReleased: false`, issue open | Manual review (never break a claim you cannot read) |
| Ref exists, `claimed: true, stale: false`, but `claim.claimedAt` fails to parse as a date | Manual review (per `bin/lib/issues/claims.js`'s `isStale` fail-closed contract — a corrupted-but-JSON-valid claim is never automatically stale; flag it explicitly rather than keeping it silently forever) |
| Claim live, issue open | Keep |

Releasing = delete the ref + post the release comment generated by `releasePayload`
(reason `swept: stale claim` or `swept: issue closed`). Releases execute only after Step 6
batch approval — breaking a lock is never autonomous in /tidy.

→ Collect each as: `[claim] refs/claims/issue-{n} — {status} — {recommendation}`

### Backstop: missed `parked` restoration

Find materialized build-time headers (`flow/materialize.md`) that recorded `parked-at-shaping:
true` but never got the restoration finished — a defense-in-depth flag for a mutation that
silently failed at claim release (`wrap-up/cleanup-procedures.md` Section E, step 7), same shape
as the `bot:in-progress` missed-removal backstop below. Both checks below are flagged only —
recommendations execute after Step 6 batch approval, same as every other Step 4.7 mutation.

Materialized headers are committed, never gitignored (`flow/materialize.md`'s "Committed as
audit trail" section), so they survive on disk at `.claude-tweaks/pipelines/**/work/*-spec.md`
(single-record runs) and `.claude-tweaks/pipelines/**/spec-*/work/*-spec.md` (multi-record
runs) — in both live and archived (`.claude-tweaks/pipelines/archive/`) run directories:

```bash
cd "{REPO_ROOT}" && find .claude-tweaks/pipelines -path "*/work/*-spec.md" 2>/dev/null | while read -r header; do
  grep -q "^parked-at-shaping: true$" "$header" || continue
  n=$(grep -m1 "^record:" "$header" | sed 's/^record: *//')
  [ -z "$n" ] && continue
  gh issue view "$n" --json state,labels,closedByPullRequestsReferences
done
```

(`closedByPullRequestsReferences` is a native `gh issue view --json` field — no raw GraphQL
needed; the issue-side mirror of `closingIssuesReferences`, which `_shared/github-pr-scan.md`
already reads from the PR side via `gh pr view --json`.)

For each result: flag as a likely missed restoration when the issue is `OPEN`, its labels do
not include `parked`, `closedByPullRequestsReferences` is empty (no linked PR, open or
merged — a linked PR means the outcome was `merged:`/`pr-opened:`, where skipping restoration
is correct behavior, not a missed one), and it has no active claim (cross-reference against
this step's own claim listing above — `claimed && !stale` for `refs/claims/issue-{n}`).
Recommend the same `gh issue edit {n} --add-label parked` command the release step itself
would run.

→ Collect each as: `[claim] issue #{n} — materialized header {path} has parked-at-shaping: true, no parked label, no active claim, no linked PR — likely missed parked restoration`

### Backstop: missed `bot:in-progress` removal

```bash
cd "{REPO_ROOT}" && gh issue list --label bot:in-progress --state open --json number,title -q '.[] | "\(.number) \(.title)"'
```

For each result, cross-reference against this step's own claim listing above: flag as a likely
missed removal when the issue carries `bot:in-progress` but has no active claim (`claimed &&
!stale`) for its number. Recommend the same `gh issue edit {n} --remove-label bot:in-progress`
command the release step itself would run.

→ Collect each as: `[claim] issue #{n} — bot:in-progress present, no active claim — likely missed bot:in-progress removal`

### Backstop: empty decisions.md on a completed standalone run

Same audit-trail-integrity concern as the two backstops above, applied to every standalone-auto
run directory on disk — this includes the human-gate skills' runs (`/claude-tweaks:backlog`,
`/claude-tweaks:dispatch`), but also `/tidy`'s own past
standalone-auto firings, `/claude-tweaks:init`, and `/claude-tweaks:capture` (the full
standalone-auto allowlist per `_shared/pipeline-run-dir.md`'s step 4 — all five skills use the
identical `{ISO-timestamp}-{skill-name}-standalone` naming, and the glob below has no
skill-name filter, so it matches all of them equally). A `worktree.always`-blocked or otherwise
silently-skipped log write leaves no trace anywhere except an empty file:

```bash
cd "{REPO_ROOT}" && find .claude-tweaks/pipelines -maxdepth 1 -type d -name "*-standalone" 2>/dev/null | while read -r RUN_DIR; do
  STATUS=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.argv[1]+'/run-state.json','utf8')).status)}catch(e){console.log('unknown')}" "$RUN_DIR")
  [ "$STATUS" = "clean" ] || continue
  SIZE=$(wc -c < "$RUN_DIR/decisions.md" 2>/dev/null || echo 0)
  [ "$SIZE" -eq 0 ] && echo "$RUN_DIR"
done
```

A standalone-auto run whose `run-state.json` reports `clean` (completed) but whose `decisions.md`
is empty means either the skill that ran there took auto-decisions with no audit trail (forbidden
per `_shared/auto-decision-log.md`'s Anti-Patterns table) or the run genuinely made zero
auto-decisions (legitimate — e.g. a `/backlog refine` session where every row was flagged back). File
state alone can't distinguish the two; flag for manual review rather than auto-resolving either
way.

→ Collect each as: `[claim] {run-dir} — clean standalone run, empty decisions.md — possible skipped audit-log write (manual review)`

## Step 4.8: Audit GitHub PRs and Issues

Scan per `_shared/github-pr-scan.md`, **`repo-wide`** scope. The dispatcher inlines that file's Detection Ladder, `repo-wide` scope section (including its findings table), and Output Contract into this agent's prompt. The detection ladder makes this fail-open — skip with a single info row when `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.

The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads → Capture or a suggested local command; still-valid vs. superseded code-health, harness-health, journey-health, and docs-health issues → Close (GitHub) when the flagged code is demonstrably gone (Shape 6 above) or a suggested `/claude-tweaks:backlog refine` run when still valid; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly). Backlog-record findings (stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) are Step 1's job now, not this step's — `repo-wide` no longer queries the `backlog` label (see `_shared/github-pr-scan.md`).

GitHub mutations recommended here (Close (GitHub), Resolve thread) execute only after Step 6 batch approval and are staged at every aggressiveness level in auto mode — outward-facing actions are never autonomous in /tidy.

→ Collect each as: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
→ Collect each as: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`

## Step 5: Record Sizing Review

For `ready` records not yet claimed — `facets.bot.inProgress === false` (from Step 1's already-fetched facets under `work-backend: github-issues`; every `ready` local record qualifies, since the local driver carries no bot state) — fetch each body and check sizing:

- **Too large** (10+ tasks implied by Deliverables/Acceptance Criteria): recommend splitting
- **Too small** (1-2 trivial tasks): recommend absorbing into a related record
- **Too vague** (no concrete deliverables or acceptance criteria): recommend re-running `/claude-tweaks:specify {ref}` to re-shape it

→ Collect each as: `[sizing] {ref}: {title} — {issue} — {recommendation}`

## Step 5.5: Cross-Spec Pattern Detection

Scan recent git history for recurring findings across review summaries and wrap-up reflections. Patterns that appear in 2+ specs signal systemic issues worth addressing at the project level rather than per-spec. This step is self-contained via git log — it does not depend on Step 1's record scan.

### How to scan

1. Search recent commits for review and wrap-up artifacts:
   - `git log --all --oneline --grep="review" --grep="wrap-up" --since="4 weeks ago"` (or check `docs/plans/*-review-summary*` and recent wrap-up commits)
2. **Cap the read** — order the artifacts found in item 1 by commit date, most recent first, and read at most the **5 most recent**. Where the artifact is a review summary, read only its `### Code Review Findings` and `### Design Quality` sections (`skills/review/review-summary-template.md`'s headings — the exact sections item 3 below extracts from), not the whole file: review summaries average ~25 KB, and a category-recurrence signal doesn't need the rest (Spec Compliance, Verification, Tradeoffs Accepted, Next Actions). For any other referenced artifact (e.g. a wrap-up reflection embedded directly in a commit message rather than a standalone file), the 5-item cap alone bounds it. If 5 artifacts turn up too few data points for a signal (e.g. only 1-2 exist in the window), that's a legitimate "not enough history yet" result — widen `--since` or the 5-item cap deliberately for a one-off deeper sweep rather than reading past-cap files by default.
3. Extract findings by category (Security, Convention, Performance, Error Handling, Architecture, Test Quality) from the Code Review Findings section. Also read each review summary's Design Quality section (present when `/claude-tweaks:review` Step 6.5 ran and Impeccable returned findings) and extract those findings by their own `category` field — a separate vocabulary (Impeccable's categories: typography, spacing, color, component, and others), not the Code Review Findings taxonomy above.

### What to look for

| Signal | Example | Recommendation |
|--------|---------|---------------|
| Same finding category in 3+ reviews | "Convention: import from shared package" in specs 41, 43, 45 | Add rule to CLAUDE.md or `.claude/rules/` |
| Same file flagged across specs | `src/utils/validate.ts` modified and reviewed in 4 specs | Refactor — this file may be a responsibility magnet |
| Same gotcha rediscovered | "Use upsert not delete+insert" in 3 spec Gotchas | Add to CLAUDE.md as a project convention |
| Recurring deferred items with similar themes | "Add error boundary" deferred in 3 specs | Promote to its own record — it's not going away |
| Same Design Quality category recurring in 3+ reviews | "component" findings in specs 41, 44, 47's Design Quality sections (a card/button/layout pattern reimplemented each time) | Run `/impeccable:impeccable extract` — this pattern is being reimplemented, not reused |

→ Collect each as: `[pattern] {description} — seen in {spec list} — {recommendation}`

### Project Health Summary

When 3+ specs have shipped (`git log --all --oneline --grep="wrap-up" --since="8 weeks ago"`, or the same commit window this step's own scan above already searched), include a brief project health summary in the tidy report:

1. **Velocity** — count shipped (git log for wrap-up/merge commits) vs. `ready`-or-building vs. `backlog`/`parked` (the latter two from Step 1's facet counts, when Step 1 is in scope)
2. **Recurring themes** — conventions worth codifying if they appear in 3+ specs' wrap-up reflections
3. **Convention candidates** — suggest: "This pattern shows up in {N} specs — consider adding to CLAUDE.md: `{pattern}`"

→ Collect each as: `[health] {observation} — {recommendation}`

Patterns and health observations are informational — they surface systemic issues the user may want to address. They appear in the tidy report alongside actionable items but don't require immediate action.

---

## Collection routing

| Collection prefix | Renders in Step 6 table | Notes |
|---|---|---|
| `[backlog]`, `[parked]`, `[unsynced]`, `[scoring]`, `[blocked]`, `[legacy]`, `[doc]`, `[plan]`, `[git]`, `[registry]`, `[claim]`, `[pr]`, `[gh-issue]`, `[sizing]` | Actions table | Each row gets a pre-filled recommendation. |
| `[pattern]` | Cross-Spec Patterns table | Informational; presented separately. |
| `[health]` | Summary section | Project-level observations. |
