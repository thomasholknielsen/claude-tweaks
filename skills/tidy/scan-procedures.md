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

Every record returned by the `local-files` driver's fetch already carries its parsed `.facets` — no separate parse pass needed. The shapes below are not all driver-universal, in both directions. Three never fire under this driver: no Sync finding (`facets.unsynced` is a github-issues-fallback-only concept — see `_shared/work-record.md`), no `bot:blocked` finding (the local driver "carries no bot state"), and no legacy-taxonomy finding (its frontmatter schema never held the retired label vocabulary in the first place — that vocabulary is GitHub-label-only). Conversely, Shape 7 (family gate due) fires **only** under this driver — its `github-issues` counterpart is Step 4.8's `family-gate` scope, which reads GitHub issues.

**Staleness clock**, either driver: per `_shared/record-queue-fetch.md`'s Staleness clock and
Threshold resolution sections (`{REPO_ROOT}` resolves the same way Step 4.5 below already
documents). Bands are computed by `classifyStaleness(ageMs, thresholdMs)`
(`bin/lib/issues/record-buckets.js`) against the resolved `record-staleness-weeks` threshold
(default 4 weeks): `fresh` below half the threshold, `review` from half the threshold up to
and including the threshold itself, `stale` beyond it. Shapes 1 and 2 below are the only
consumers of this scale — Step 3's design-doc age rows and Step 4.7's claim-staleness
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

**Decomposition parents are exempt — always `Keep`, at every age.** A record carrying `family:parent` (`github-issues`) or `facets.familyParent === true` (`local-files`) is `isBacklog` by construction and forever: `/claude-tweaks:specify` never gives a parent a stage label and nothing ever promotes one, so every live parent crosses the staleness threshold and lands on `Delete or Promote` while its family is still being built — and `Delete` here is `gh issue close --reason "not planned"`, which destroys the family's only acceptance checkpoint. Leaves landing weeks apart is the dominant workflow, so a parent going stale mid-family is the common case, not the edge one. Give the row the reason inline (`Keep — decomposition parent, gated by the family-gate sweep, not by staleness`) rather than dropping it silently, so a reader sees why one stale-looking record is being left alone. **Name the sweep the resolved driver actually uses** — Step 4.8's `family-gate` scope under `github-issues`, **Shape 7 below** under `local-files` — since citing Step 4.8 on a project that never runs it points the reader at a sweep that will never produce the row it promises. Either way, that sweep is what acts on parents and this shape must not race it with a contradictory recommendation for the same record; under `local-files` they are not even separate agents — Shape 7 runs in this same Step 1 prompt, so a `Delete or Promote` row here would contradict a `[family-gate]` row this same agent emits in the same reply.

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

Not scanned here. This is Step 4.8's code-health/harness-health/journey-health/docs-health issue judgment (`_shared/github-pr-scan.md`'s `repo-wide` scope, items 3/5/6/7) — unchanged by this merge. It's listed in this file only so the finding shapes the record-scan design replaces (former Steps 1 and 2, plus former Step 4.8's backlog-issue item) stay documented in one place; the mechanics that actually judge "is the flagged code gone" continue to live where they already did.

### Shape 7 — decomposition family gate due

**`work-backend: local-files` only.** Finds decomposition families whose every leaf has closed
but whose parent carries no acceptance disposition yet — the population
`/claude-tweaks:wrap-up`'s Family-Gate Procedure (`wrap-up/verification-brief.md`) gates eagerly
when it closes a family's last leaf. A family whose last leaf closes any other way — by hand, or
by a run that ended before wrap-up — never reaches that eager path; this shape catches it after.

It is the local twin of Step 4.8's `family-gate` scope (`_shared/github-pr-scan.md`) — same
finding, same `[family-gate]` prefix, same `Open family gate` action; only the store differs. It
lives in this step rather than that file because that file is skipped whole whenever `gh` is
absent, and a sweep needing no `gh` must not inherit that skip; that scope's own header states
the full reasoning, including what its Detection Ladder does and does not gate on.

Classification is entirely `familyGateState`'s (`bin/lib/issues/acceptance.js`) — do not
reimplement it. That predicate is backend-agnostic: it takes `{leaves, parentLabels}`, and a
local parent's disposition translates to the one-element `['demo:' + facets.acceptance]` (empty
when unset), exactly as `wrap-up/verification-brief.md`'s **Evaluate the gate** does for this
driver.

It needs its own query, not Step 1's shared fetch: that fetch returns open records only and
carries no leaf-to-parent index, and a family's leaves are closed by definition when its gate is
due.

```bash
node -e "
  const { queryRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
  const { familyGateState } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/acceptance.js');
  const parents = queryRecords('specs', { familyParent: true });
  const families = parents.map((p) => {
    const leafRecords = [
      ...queryRecords('specs', { parent: p.id }),
      ...queryRecords('specs', { parent: p.id, closed: true }),
    ];
    return {
      id: p.id,
      title: p.title,
      path: p.path,
      parentLabels: p.facets.acceptance ? ['demo:' + p.facets.acceptance] : [],
      leaves: leafRecords.map((r) => ({ number: r.id, state: r.facets.closed ? 'CLOSED' : 'OPEN' })),
    };
  });
  families
    .filter((f) => familyGateState({ leaves: f.leaves, parentLabels: f.parentLabels }) === 'due')
    .forEach((f) => console.log(f.path + '\t[family-gate] ' + f.id + ': ' + f.title + ' — family complete, no acceptance disposition — Open family gate, then /claude-tweaks:demo ' + f.id));
"
```

Each line is `{path}<TAB>{finding}` — the path fills the row's `Path:Line` column (`SKILL.md`'s
Tidy-specific column semantics: the local record path on this driver, where `github-issues` rows
carry `#{n}`), the rest is the finding.

Both `queryRecords` shapes are deliberate. `{ familyParent: true }` returns **open** parents only
(closed records are excluded unless the filter names `closed`) — the right set, since a closed
parent was already dispositioned and closed by `/claude-tweaks:demo`, and it mirrors the
`github-issues` scope's `--state open` fetch. The leaf listing is the open+closed two-call merge
for the same reason: one call alone drops every closed leaf, exactly the ones that make a gate
due. No fetch-limit or truncation warning applies, unlike the API-paging twin — `queryRecords`
reads the whole `specs/` directory every call.

→ Collect each as: `[family-gate] {id}: {title} — family complete, no acceptance disposition — Open family gate, then /claude-tweaks:demo {id}`

Severity `info` — with several open decompositions this is a standing backlog, not a defect
count, and Step 6 caps rows highest-severity-first (the same tier and reason as its
`github-issues` twin). The recommendation is the `Open family gate` action, staged at every
aggressiveness tier and never writing `demo:approved`/`demo:changes-requested`, which is why the
row still ends with `/claude-tweaks:demo {id}`; `actions-local-files.md`'s `## Open family gate`
and `step-6-auto.md`'s row carry that action's execution, its staging reasoning, and what it
does not cover.

## Step 3: Audit Design Docs

Scan `docs/superpowers/specs/*-design.md`.

**Design doc classification** — for each file in `docs/superpowers/specs/*-design.md`:

| Status | Recommendation |
|--------|---------------|
| Marked as specified, derived specs complete | Delete |
| No status, matches existing specs | Mark as specified |
| No status, no matching specs | Run `/claude-tweaks:specify` |
| Very old (4+ weeks), no specs | Delete |

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

A **locked** worktree will refuse to remove. Do not force it: a live lock means a session
is using it. Surface it as `locked — manual review required`.

`SessionStart`'s reaper (`bin/lib/hooks/worktree-reap.js`) collects *some* of these
unattended, but its reach is deliberately narrower than this step's, so do not read a
still-locked worktree as one the reaper has already judged. It only considers worktrees
under `{REPO_ROOT}/.claude/worktrees/` (ADR-0004's harness-owned domain — `.worktrees/`
belongs to superpowers' `finishing-a-development-branch`), it unlocks only when the lock's
owning pid is provably dead **and** nothing in the worktree has been modified for 24h, and
it reaps nothing at all on a repo where its own integration-branch resolution comes up empty
(`_shared/integration-branch.md` — the reaper's row in the per-consumer fallback table; it
may consult only the `integration-branch:` policy key and `origin/HEAD`, never the checked-out
branch). Anything still locked at `/tidy` time is therefore in use, unrecognized, recently
active, out of the reaper's domain, or on a repo where the reaper is inert.

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

**Working-directory discipline:** every command in this step (and in any dispatched parallel agent) MUST be anchored, but the three commands below do not all take the *same* anchor:

- The claim-ref listing and the `gh issue list` backstop take `{REPO_ROOT}` — `git rev-parse --show-toplevel`, the same resolution Step 4.5 documents. `gh` infers the target repo from the cwd's git remote, and either checkout has the same remote.
- **Both backstops that run `find .claude-tweaks/pipelines` take `{RUN_ROOT}` instead** — the **main checkout** root, resolved as `RUN_ROOT=$(git rev-parse --git-common-dir); RUN_ROOT=$(cd "$(dirname "$RUN_ROOT")" && pwd)` (`_shared/pipeline-run-dir.md`'s Anchoring section). Run directories are anchored to the main checkout at creation, so from inside a linked worktree `--show-toplevel` names the worktree — which holds no `.claude-tweaks/pipelines/` at all — and the `find` returns zero. Resolved from the main checkout the two are the same path, so this only ever matters when `/tidy` runs from a worktree.

Anchor with `cd "{REPO_ROOT}" &&` / `cd "{RUN_ROOT}" &&` at the start of each command. CWD does not propagate reliably to dispatched Task agents (see `_shared/subagent-output-contract.md`'s Working Directory Discipline section) — an un-anchored (or wrongly-anchored) `find .claude-tweaks/pipelines/...` doesn't error, it silently returns zero matches, which reads identically to "no missed restorations found," the opposite of the loud failure this anchor is meant to guarantee. A wrong cwd can also point `gh issue list`/`gh api` at an unrelated repo entirely, not just fail to find files.

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
cd "{RUN_ROOT}" && find .claude-tweaks/pipelines -path "*/work/*-spec.md" 2>/dev/null | while read -r header; do
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
cd "{RUN_ROOT}" && find .claude-tweaks/pipelines -maxdepth 1 -type d -name "*-standalone" 2>/dev/null | while read -r RUN_DIR; do
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

Scan per `_shared/github-pr-scan.md`, **`repo-wide`** scope, plus that file's **`acceptance-gap`** and **`family-gate`** scopes. The dispatcher inlines all three scope sections (the `repo-wide` findings table, the `acceptance-gap` procedure, and the `family-gate` procedure), the Detection Ladder, and the Output Contract into this agent's prompt. Each scope section goes in **whole** — the `acceptance-gap` and `family-gate` sections' `work-links` resolution and fetch-limit sub-sections are part of the procedure, not preamble around it. Both of those scopes branch on `work-links: body-text` vs `native`, and an agent given only the branches and no way to resolve the key silently takes the first-listed one: on a `native` repo that returns zero leaves from every parent, so every leaf re-enters `acceptance-gap` as a false row and `family-gate` emits nothing at all. The detection ladder makes this fail-open — skip with a single info row when `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.

The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads → Capture or a suggested local command; still-valid vs. superseded code-health, harness-health, journey-health, and docs-health issues → Close (GitHub) when the flagged code is demonstrably gone (Shape 6 above) or a suggested `/claude-tweaks:backlog refine` run when still valid; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly). Backlog-record findings (stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) are Step 1's job now, not this step's — `repo-wide` no longer queries the `backlog` label (see `_shared/github-pr-scan.md`).

The `acceptance-gap` scope finds closed records with no acceptance label at all — a different gap than the `acceptance-queue` scope `/help` Stage 4.7 uses, which only sees records already flagged `demo:pending`. Its recommendation is always "run `/claude-tweaks:demo #{n}`" — never one of the Action Vocabulary's atomic actions, since disposing a closed record is a judgment call for a human, not this step.

The `family-gate` scope finds decomposition families whose every leaf has closed but whose parent carries no acceptance disposition — the backstop for a family that missed `/claude-tweaks:wrap-up`'s eager gate (a leaf closed via `auto:merge`, by hand, or by a dispatch run that ended early never reaches that eager path). Unlike `acceptance-gap`, its recommendation **is** one of the Action Vocabulary's atomic actions — `Open family gate` — which composes and posts the parent's Verification Brief and applies `demo:pending`, reusing `wrap-up/verification-brief.md`'s Family-Gate Procedure rather than a second copy of that logic (`tidy/actions-github-issues.md`'s `## Open family gate`). It never applies `demo:approved`/`demo:changes-requested` — that verdict stays exclusively `/claude-tweaks:demo`'s job, so the finding still ends with "then run `/claude-tweaks:demo #{n}`" even once approved.

GitHub mutations recommended here (Close (GitHub), Resolve thread) execute only after Step 6 batch approval and are staged at every aggressiveness level in auto mode — outward-facing actions are never autonomous in /tidy. `acceptance-gap` findings are staged the same way, at every aggressiveness level, for the same reason — see `_shared/github-pr-scan.md`'s `acceptance-gap` scope for why. `family-gate`'s `Open family gate` action is staged the same way too, at every aggressiveness level: it posts a comment and adds a label, an outward-facing GitHub API write that fails the auto-mode contract's reversibility floor regardless of how mechanical or precondition-only the write is — see `_shared/github-pr-scan.md`'s `family-gate` scope and `tidy/step-6-auto.md`'s Open family gate row for the full reasoning. Staging governs the write itself here, not just the disposition it precedes; the disposition (`demo:approved`/`demo:changes-requested`) stays exclusively `/claude-tweaks:demo`'s job either way.

→ Collect each as: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
→ Collect each as: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
→ Collect each as: `[acceptance-gap] #{n}: {title} — closed with no acceptance disposition — recommend /claude-tweaks:demo #{n}`
→ Collect each as: `[family-gate] #{n}: {title} — family complete, no acceptance disposition — Open family gate, then /claude-tweaks:demo #{n}`

## Step 4.9: Audit Impeccable Design Record

Main thread, parallel with the agent batch — like Steps 4 and 4.6, this is one Skill-tool call that shells out to a JSON-emitting script, and dispatching it as an agent would pay the full inherited `CLAUDE.md` cost to run it.

Invoke `/claude-tweaks:design-wrapper doctor --source tidy` via the Skill tool. It takes **no target**: `doctor` audits the project's own Impeccable artifacts (`PRODUCT.md`, `DESIGN.md` + sidecar, `.impeccable/config.json`, surface briefs, the design hook), not a diff. `--source tidy` is unconditional — /tidy is standalone-only and never has a `$PIPELINE_RUN_DIR` to forward (see `design-wrapper/SKILL.md`'s Component-Skill Contract).

### Degrade silently

**On `{skipped: ...}`, collect nothing and render nothing.** No row, no "unavailable" note, no info line in the Summary. /tidy runs on every project and most have no Impeccable context at all — a scan step that reports its own absence every run trains users to skim past the report. This is the one step whose skip is invisible; every other step's fail-open surfaces an info row.

### The finding schema

`skills/design-wrapper/modes/doctor.md` **owns** the schema — its `## Finding schema` section is the single source of truth for the six fields, their types, and the three severity values. Read it there; do not restate it here. Two properties matter for the mapping below and are easy to get wrong:

- `path` is **nullable**, and when present may be a **comma-joined list** of paths rather than one path.
- `artifact` is always present but is a human label, not always a filename (`hook manifest`, `live state`, `surface brief`).

### Mapping to the report table

Each finding becomes one Template A row, read through this skill's own column semantics (`SKILL.md`'s "Tidy-specific column semantics"):

| Column | Value |
|---|---|
| `Severity` | Tidy's own urgency scale, mapped from `severity` per the table below |
| `Path:Line` | The finding's `path`; when `path` is `null`, fall back to `artifact` — never render an empty cell |
| `Finding` | `[doctor] {id} ({severity}) — {summary}` |
| `Evidence` | The finding's `fix` text, verbatim |

Upstream's `route`/`mention`/`auto` is preserved **verbatim inside the `Finding` cell**. That is deliberate: upstream's `--fix` boundary is defined in terms of those exact strings, so the tidy-severity value is a display convenience and never the authority.

| `severity` | Tidy severity | Why |
|---|---|---|
| `route` | `medium` | Needs a real Impeccable command to resolve — the same urgency tier as Promote/Absorb/Defer. |
| `auto` | `low` | A mechanical migration with no judgment in it — "routine cleanup" exactly. |
| `mention` | `info` | Worth saying; no action strictly required. |

This ordering puts `auto` above `mention`, inverting upstream's `route`/`mention`/`auto` display order. That order is a reading order for upstream's own text renderer, not a ranking: an `auto` finding is a concrete, safe, ready-to-apply fix being deliberately withheld, which is more actionable than an informational `mention`. Both keep their upstream word in the `Finding` cell, so nothing is lost either way.

### Nothing here is ever applied

These rows are **surface-or-suppress**, not apply-or-skip. This step edits no project file under any condition: `route` and `mention` findings have no mechanical fix by construction, and `auto` findings are staged proposals carrying their own `fix` text — applying them means `doctor.mjs --fix`, which rewrites `PRODUCT.md` and is the user's call, per `_shared/auto-mode-contract.md`'s staging model. The Step 6 decision is only whether the row is worth showing.

That is why `[doctor]` routes to its own report section and **not** the Actions table: every row in the Actions table carries a recommendation from the Action Vocabulary, and every one of those mutates something.

→ Collect each as: `[doctor] {id} ({severity}) — {summary} — {fix}`

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
| `[backlog]`, `[parked]`, `[unsynced]`, `[scoring]`, `[blocked]`, `[legacy]`, `[doc]`, `[plan]`, `[git]`, `[registry]`, `[claim]`, `[pr]`, `[gh-issue]`, `[acceptance-gap]`, `[family-gate]`, `[sizing]` | Actions table | Each row gets a pre-filled recommendation. |
| `[pattern]` | Cross-Spec Patterns table | Informational; presented separately. |
| `[doctor]` | Design Record Drift table | Surface-or-suppress, never apply — this step mutates nothing. Deliberately **not** the Actions table, whose every row carries a mutating Action Vocabulary recommendation. Section omitted entirely when the scan skipped or found nothing. |
| `[health]` | Summary section | Project-level observations. |
