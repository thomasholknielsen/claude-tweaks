---
name: claude-tweaks:dispatch
description: Use when you want to claim and build already-authorized GitHub work records — the queue consumer between the human gate and the executor. Bare picklist, next for the headless routine unit, or #N direct; claims the whole file-overlap group, hands off to /flow, and settles the result. Keywords - dispatch, queue, claim, auto:build, auto:merge, bot:in-progress, bot:blocked, autonomous build, routine.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Dispatch — the Queue Consumer

The thin protocol wrapper between the authorization gate and the executor: select → claim group → invoke /flow → settle. Sits outside the main brainstorm-to-build chain, downstream of the gate:

```
capture / code-health / harness-health / journey-health   (file records)
                              │
                              v
                /claude-tweaks:specify   (shapes to ready)
                              │
                              v
                  /claude-tweaks:triage   (grants auto:build / auto:merge)
                              │
                              v
              [ /claude-tweaks:dispatch ]   <- utility (no fixed lifecycle position)
                              │
                              v
          /claude-tweaks:flow #{n}[,#{m}...]   (claims whole group, executes)
                              │
                              v
                    close-via-merge   (record closes)
```

## When to Use

- Something is already authorized (`auto:build`, optionally `+ auto:merge`) and you want to build it now — run bare `/dispatch` to pick from the queue, or `/dispatch #N` for a specific record.
- A scheduled Routine needs a single, deterministic unit of headless work to fire on a cadence — that's `/dispatch next`.
- A prior dispatched build failed and you want the retry/ceiling bookkeeping to run — this happens automatically inside the Settle step (Step 6), not as a separate invocation.

Not for: granting authorization (`/claude-tweaks:triage`'s job), deriving a spec, or building anything yourself. Dispatch only ever claims, hands off to `/claude-tweaks:flow`, and settles the result.

**Why no `drain` mode.** There is no mode that shepherds every authorized group to completion in one session. A session babysitting N pipeline runs accumulates context until it rots; throughput comes from routine cadence × single-group firings (a Routine firing `next` on a schedule), not session breadth. The old design's consolidated multi-group Review Console existed to aggregate a drain session's N outcomes into one table; a single-group firing has nothing to consolidate, so it dies with drain — see Reporting below.

## Input

`$ARGUMENTS`:

| Argument | Behavior |
|---|---|
| *(none)* | Bare — interactive batch pick over the authorized queue, grouped by file overlap; up to `dispatch-pick-max-concurrent` groups per firing |
| `next` | Headless-safe — claim + dispatch exactly one group, chosen by priority-then-age ordering; the unit a scheduled Routine fires |
| `#N` | Direct — claim + dispatch record `#N`'s whole file-overlap group |

## Preflight

Read the project's `work-backend` config key (per `_shared/work-record.md`'s Config keys table). **`work-backend: local-files`** — report that headless dispatch is github-issues only (GitHub's RBAC + atomic refs are the mechanism this protocol depends on, not a policy choice) and stop; point the user at running `/claude-tweaks:flow` or `/claude-tweaks:build` manually against a chosen record instead. Only `work-backend: github-issues` proceeds.

Before any `gh` command, run the Detection Ladder from `_shared/github-pr-scan.md` (checks 1-3: GitHub remote exists, `gh` CLI installed, `gh` authenticated + repo reachable). Unlike `/tidy`/`/help`'s use of this ladder, which fails open into a skipped scan, `/claude-tweaks:dispatch` treats any ladder failure as a hard gate — this skill's entire purpose is writing GitHub state (claims, labels, merges), so there is no meaningful degraded mode to fall back into. Report the specific failing check and stop.

## Workflow

### Step 1: Resolve this firing's run id

Resolve this firing's `$RUN_ID` once, before Step 2, via the standalone-auto run-dir resolution in `_shared/pipeline-run-dir.md` (dispatch is on the allowlist) — `$RUN_ID` is that run directory's basename (e.g. `2026-07-14T140322-dispatch-standalone`). Every claim this firing makes in Step 4 embeds this same value as `claimPayload`'s `runId`, and every group's Task agent in Step 5 receives it explicitly as `CLAIM_RUN_ID` (Task agents don't inherit shell variables — per `_shared/subagent-output-contract.md`'s Input Discipline, a dispatched agent is a clean room), so Step 6's ownership check (`claim.runId === $RUN_ID`), performed inside that agent rather than in this thread, compares against the firing that actually claimed the record.

### Step 2: Pull the authorized queue and group by file overlap

Common to all three selection forms — group membership must be computed over the full current pool *before* anything is claimed (per `_shared/issue-claims.md`'s group-claim rule: group membership is computed over **unclaimed** records only, so two racing firings converge on the same winner instead of splitting a group between them).

The queue: **open + `auto:build` + no `bot:*` + no open `Blocked by #N` dependency + unclaimed**. Dispatch never adds `auto:build`, `auto:merge`, or `ready` — see Anti-Patterns.

```bash
gh issue list --label auto:build --state open --json number,title,body,labels,createdAt --limit 100 > /tmp/dispatch-queue-raw.json
gh issue list --state open --json number --limit 200 > /tmp/dispatch-open-numbers.json
node -e "
  const { parseRecordFacets, parseDependencies } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const { extractKeyFiles, groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const issues = require('/tmp/dispatch-queue-raw.json');
  const openNumbers = new Set(require('/tmp/dispatch-open-numbers.json').map((i) => i.number));
  const eligible = issues
    .map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }))
    .filter((i) => i.facets.grants.build && !i.facets.bot.inProgress && !i.facets.bot.blocked)
    .filter((i) => !parseDependencies(i.body).some((dep) => openNumbers.has(dep)));
  const items = eligible.map((i) => ({ id: i.number, keyFiles: extractKeyFiles(i) }));
  const byId = new Map(eligible.map((i) => [i.number, i]));
  const groups = groupByFileOverlap(items).map((ids) => ids.map((id) => byId.get(id)));
  console.log(JSON.stringify(groups));
" > /tmp/dispatch-groups.json
```

Two bulk calls, not per-issue re-fetches — the second pull is a cheap existence check for `parseDependencies`' targets (an open blocker under `work-links: body-text`; a record isn't eligible while any `Blocked by #N` line still names an open issue). Grouping still runs before claiming, unlike the pre-grants design, so the full issue body/labels/createdAt needed for eligibility, dependency-checking, and `extractKeyFiles` is already in hand from the first pull.

**`work-links: native` gap.** `parseDependencies` reads only `Blocked by #N` body-text lines — a record whose blocker is expressed via GitHub's native sub-issue/dependency relationship (`work-links: native`) is not filtered by this check. Widening this to also query the native relationship is a follow-up, not covered here.

The `bot:*` filter here is the cheap label-based pre-filter — labels are projection, not truth (`_shared/work-record.md`). The authoritative unclaimed check is Step 4's atomic 201/422 claim attempt; a record can pass this pre-filter and still turn out contested by the time it's actually claimed. A group of size 1 is a **singleton**; size 2+ is a **bundle** — both dispatch the same way in Step 5, with a different `/flow` invocation shape only.

### Step 3: Select

**Bare** `/dispatch` — render a batch table, one row per group from Step 2:

```markdown
### Dispatch — {N} groups in the authorized queue

| # | Group | Records | Priority | Auto-merge? |
|---|---|---|---|---|
| 1 | bundle (2) | #123, #124 | high | no |
| 2 | singleton | #130 | — | yes |
```

Then one `AskUserQuestion`:

- `question`: `"Which groups should this firing dispatch (up to {dispatch-pick-max-concurrent} concurrently)?"`, `header`: `"Dispatch pick"`, `multiSelect`: `true`
- One option per group — `label`: the group's record numbers (e.g. `"#123, #124"`), `description`: titles + priority + whether it carries `auto:merge`. Pre-mark the top `dispatch-pick-max-concurrent` groups, ranked by the `next` ordering below, as `(Recommended)`.

Selecting more groups than `dispatch-pick-max-concurrent` is not an error — the extra selections queue and start as slots free (Step 5), same as overlapping `next` firings do across routine windows.

**`next`** — no human decision. Pick exactly ONE group by this literal ordering: `priority:high` > `priority:medium` > `priority:low` > unprioritized, oldest-first within each band. **A group's rank = its highest-priority member** — find each group's highest-priority (then oldest) member as its representative, then sort groups by that representative's priority band and `createdAt`:

```bash
node -e "
  const RANK = { high: 0, medium: 1, low: 2 };
  const bandOf = (r) => (r.facets.priority ? RANK[r.facets.priority] : 3);
  const groups = require('/tmp/dispatch-groups.json');
  const representative = (g) => g.slice().sort((a, b) =>
    bandOf(a) - bandOf(b) || new Date(a.createdAt) - new Date(b.createdAt))[0];
  const ranked = groups
    .map((g) => ({ group: g, rep: representative(g) }))
    .sort((x, y) => bandOf(x.rep) - bandOf(y.rep) || new Date(x.rep.createdAt) - new Date(y.rep.createdAt));
  console.log(JSON.stringify(ranked.length ? ranked[0].group : null));
" > /tmp/dispatch-next-pick.json
```

`next` is the headless-safe unit — the only selection form a scheduled Routine ever fires (see Routine Configuration below), since it needs no `AskUserQuestion` answer to resolve.

**`#N`** — direct. Fetch issue `#N`, confirm it currently carries `auto:build` and no `bot:*` label (re-verify against Step 2's live queue, not a cached table); if it doesn't qualify, report why (no grant, already claimed, or blocked) and stop. Otherwise pull its **whole file-overlap group** from Step 2's output — claiming a single member of a group alone is forbidden; every one of that record's overlap partners comes along, whether or not the user named them.

### Step 4: Claim the selected group (whole group, or none)

Per `_shared/issue-claims.md`'s group-claim rule: claim **all members of the group before starting any**. Resolve the sha once per run, then for each member of the selected group attempt the atomic ref creation exactly as `_shared/issue-claims.md`'s "The lock" section describes:

```bash
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
SHA=$(gh api "repos/{owner}/{repo}/commits/${DEFAULT_BRANCH}" -q .sha)
for ISSUE in "${GROUP_MEMBERS[@]}"; do
  gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${ISSUE}" -f "sha=${SHA}"
  # ... branch on the result below, per member
done
```

**On success (201):** bootstrap-then-add `bot:in-progress`, then post the claim comment (`claimPayload`):

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['bot:in-progress', 'Bot state: an agent currently holds the claim on this record']]
gh issue edit "$ISSUE" --add-label bot:in-progress
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(c.claimPayload({issueNumber:Number(process.argv[1]),sha:process.argv[2],
  runId:process.argv[3],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()}).commentBody)" "$ISSUE" "$SHA" "$RUN_ID" > /tmp/claim-${ISSUE}.md
gh issue comment "$ISSUE" --body-file /tmp/claim-${ISSUE}.md
```

**On 422 (contested):** fetch comments and fold through `claimStatus` exactly as `_shared/issue-claims.md`'s "Reading claim state" section describes, then branch on the full returned shape — do not collapse to a two-way live/stale fold:

```bash
gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100" > "/tmp/dispatch-claim-${ISSUE}.json"
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimStatus(require(process.argv[1]),Date.now())))" "/tmp/dispatch-claim-${ISSUE}.json"
```

| Result | Meaning | Action |
|---|---|---|
| `claimed:true, stale:false` | Live claim | Skip, log, continue |
| `claimed:true, stale:true` | Stale claim | Break: delete ref, recreate, post takeover comment |
| `claimed:false, everReleased:false` | Unreadable/never-claimed | Treat as live: skip, log, continue — `/tidy` surfaces it |
| `claimed:false, everReleased:true` | Comments fold to released (ref delete failed on an earlier release) | Treat as stale: break (delete ref, recreate, takeover comment) |

Any other `gh` failure during claim: skip, log, continue.

**Partial claim.** If any member of the group resolves to Skip (a live claim held elsewhere) or hits an unresolvable `gh` failure, the group cannot be fully claimed: release every member this firing already claimed this round (`releasePayload`, reason `never-started: file-overlap group partial claim`), log, and move to the next candidate group (bare) or report nothing eligible this firing (`next` / `#N`). A Break outcome (stale-claim takeover) is not a partial-claim failure — it succeeds in claiming that member, so it never triggers the abort path on its own.

### Step 5: Dispatch — one Task agent per group

Work through the selected group(s) — bare: as many as were picked, up to `dispatch-pick-max-concurrent` running at once, remainder queued for a freed slot; `next` / `#N`: exactly one. Each group becomes one Task agent with its own worktree (created via `/superpowers:using-git-worktrees` exactly as a normal `/flow` invocation would — do not pre-create or share a worktree path across groups). There is no per-firing timeout, only the concurrency throttle — nothing elsewhere in this codebase imposes one (existing parallel-Task dispatch sites, e.g. `/help`'s Stage 1-7, already wait for all dispatched agents regardless of duration).

Export `CLAIM_RUN_ID="{RUN_ID}"` (this firing's run id — the same value already embedded in each member's claim marker by Step 4) before invoking `/flow`. `/flow` threads it through to `/wrap-up`'s release step (`cleanup-procedures.md` Section E) so the success-path ownership check compares against the run that actually made the claim, not `/flow`'s own (different, later-created) `PIPELINE_RUN_DIR` — see `_shared/issue-claims.md`'s Identity section.

**Singleton group** `[123]` — the agent's job is exactly today's single-record dispatch: invoke `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #123`.

**Bundle group** `[123, 456]` — a granted record is already spec-shaped (`ready` + spec-shaped body per `_shared/work-record.md`); there is no per-member `/specify` pre-step to run first. That derivation loop is deleted — bundle materialization is `/flow`'s own concern (an opaque executor from dispatch's point of view):

```bash
CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#123,#456"
```

Each group's `Task()` prompt (per `_shared/subagent-output-contract.md`'s input discipline — minimal input, literal output template inlined, no conversation history):

```
Task scope: Execute claude-tweaks pipeline work for this already-claimed file-overlap group of
GitHub records: {issue list}. This firing's run id, for the ownership check in the Settle step,
is: {RUN_ID} -- the same value already embedded as runId in each of this group's claim markers
by Step 4. Singleton -> run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{issue}`. Bundle (2+
issues) -> run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#{n1},#{n2},..."` once, comma-joined.
The CLAIM_RUN_ID export matters on the success path too, not just failures below -- /flow threads
it to /wrap-up's release step so its ownership check compares against the run that actually
claimed the record, not /flow's own later PIPELINE_RUN_DIR. Handle any HARD-GATE failure per
skills/dispatch/SKILL.md's Settle step (retry ceiling / unconditional auto:merge revocation)
before finishing -- do not leave a failed record's claim or label state unresolved. Step 6's
ownership check compares each record's claim.runId against the {RUN_ID} given above, not any run
id you generate yourself. If you reference any of these issue numbers in an intermediate commit
message during this run, write "refs #N" -- never "closes #N" or "fixes #N". The real closing
keyword is stamped once, at the end, by wrap-up's carrier commit or the merge commit
(close-via-merge, `_shared/issue-claims.md`) -- an early closing keyword on an intermediate commit
would close the record before the work is actually done.

Working directory: create your own worktree via /superpowers:using-git-worktrees; do not
reuse a path from another group. Echo `pwd` and `git rev-parse --show-toplevel` before any
commit and verify both resolve to your own worktree.

Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS
/ NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required), after the status line -- return ONLY these lines, no preamble:

GROUP: {comma-joined issue numbers}
OUTCOME: {merged | pr-opened | pending-review | failed | blocked}
MANIFEST: {path to this group's run-dir manifest.yml/decisions.md; for a singleton, the
  single-spec run dir path}

One line per issue in this group that hit a HARD-GATE or the retry ceiling (omit if none):
ISSUE #{n}: {failed:{gate} | blocked:retry-ceiling}

[Use: Standard model -- this dispatch wraps full pipeline execution, not analysis; the
pipeline's own steps select their own models as usual.]
```

None of Templates A/B/C in `_shared/subagent-output-contract.md` fit an agent that executes a full pipeline rather than returning findings/locations/a yes-no, so this is its own minimal template, inlined verbatim at every dispatch site. The universal parts of the contract still apply: the four-value status line, minimal input, and literal (not referenced) output format.

### Step 6: Settle — on pipeline failure

This procedure runs inside each group's own Task agent (Step 5), against that agent's own record(s) — not in dispatch's main thread.

When a handed-off `/flow` run fails a HARD-GATE (never reaches `/wrap-up`):

1. Before releasing, fold this record's comments through `claimStatus` (per `_shared/issue-claims.md`'s Ownership rule) and confirm `claim.runId` equals this run's `$RUN_ID`. A mismatch means a successor already broke the stale claim and now holds the lock — skip the rest of this step entirely (no release, no label changes, no comment), log, and move to the next record.
2. Release the claim (reason: `failed: {gate}`, per `_shared/issue-claims.md`'s Release triggers table), then remove `bot:in-progress` the same way `wrap-up/cleanup-procedures.md` Section E's claim-mirror removal does (best-effort — log a warning and continue on failure). This is a cross-reference, not a restatement — if Section E's mechanics for this step ever change, this step must be re-verified against it rather than assumed still correct.
3. **Classify the failure and act on `auto:merge` accordingly.** Invoke `/claude-tweaks:assess-agent-autonomy` in `failure-check` mode: `Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "failure-check #{n}")`. If `CLASSIFICATION` is `correctness` or `ambiguous`, revoke `auto:merge` if present — today's behavior for this class, unchanged:

   ```bash
   if gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -qx auto:merge; then
     gh issue edit "$ISSUE" --remove-label auto:merge
   fi
   ```

   If `CLASSIFICATION` is `transient`, **preserve** `auto:merge` — do not remove it. This is the one behavior change from the old rule: a transient/infrastructure failure no longer permanently strips merge trust from a record that was never at fault. If `NOTIFY_NOW` is `true`, send a `PushNotification` immediately ("Record #{n} may be stuck — same failure recurred: {rationale}"), in addition to (not instead of) the retry-ceiling notification in step 6 below if the ceiling is also hit on this same attempt.

4. Fetch existing comments and compute this attempt's number and whether it hits the ceiling (read `dispatch-retry-ceiling` from CLAUDE.md/`policy.yml`, default 3), in one pass — fetching comments *before* posting this attempt's comment is what makes the attempt number and ceiling check correct:

   ```bash
   gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100" > "/tmp/dispatch-comments-${ISSUE}.json"
   node -e "
     const { countFailedAttempts } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
     const comments = require(process.argv[1]);
     const attemptNumber = countFailedAttempts(comments) + 1;
     const ceiling = Number(process.argv[2] || 3);
     const ceilingHit = attemptNumber >= ceiling; // equivalent to hasHitRetryCeiling if comments included this attempt's own (not-yet-posted) comment
     console.log(JSON.stringify({ attemptNumber, ceilingHit }));
   " "/tmp/dispatch-comments-${ISSUE}.json" "$DISPATCH_RETRY_CEILING" > "/tmp/attempt-info-${ISSUE}.json"
   ```

5. Post the failure comment, using the `attemptNumber` and `ceilingHit` just computed:

   ```bash
   node -e "
     const { attemptFailedCommentBody } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
     const { attemptNumber, ceilingHit } = require(process.argv[1]);
     console.log(attemptFailedCommentBody({ attemptNumber, reason: process.argv[2], ceilingHit }));
   " "/tmp/attempt-info-${ISSUE}.json" "$REASON" > /tmp/attempt-comment.md
   gh issue comment "$ISSUE" --body-file /tmp/attempt-comment.md
   ```

6. **If `ceilingHit` was `true`:** bootstrap `bot:blocked` if it doesn't already exist:

   ```bash
   # Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
   # [['bot:blocked', 'Bot state: retry ceiling reached - needs human re-triage before autonomous retry']]
   ```

   Then remove `auto:build` (the only `auto:*` label that could still be present — step 3 above already stripped `auto:merge` unconditionally), add `bot:blocked`, and send a `PushNotification` ("Record #{n} hit its retry ceiling — needs a look: {title}").
7. **If `false`:** leave `auto:build` in place — the next `dispatch next` firing pulls it again naturally (the claim was already released). There is nothing further to downgrade: step 3 already revoked `auto:merge` unconditionally, and that revocation *is* the failure-downgrade rule in this model. Unlike the pre-grants design there is no separate two-tier label to step down between — a record either still has `auto:build` (and can retry) or, at the ceiling, has neither.

A `correctness`- or `ambiguous`-classified failure revokes `auto:merge` before the next retry, per step 3 above — that record doesn't get another unsupervised shot at auto-merge until a human re-grants it at `/claude-tweaks:triage`. A `transient`-classified failure preserves `auto:merge` — the retry-ceiling counting below still runs unconditionally regardless of classification (an attempt is an attempt), but classification alone no longer determines merge trust the way it did before.

## Auto-merge gate (`auto:merge` groups only)

Because a bundle shares one branch/worktree, the merge decision is necessarily group-wide even though blast radius is attributed per record below: **every member of the group must carry `auto:merge`** for the gate to apply at all — a group with even one `auto:build`-only member falls back to the normal pending-review path for the whole group; mixed grants inside one bundle are never split at merge time.

When a qualifying group's `/flow` run reaches `/wrap-up`'s Review Console, check two layers before presenting it for approval:

1. **Authorization** — `auto:merge` was present on every member of the group when Step 4 claimed it (true by construction).
2. **Content judgment** — for each member of the group, invoke `/claude-tweaks:assess-agent-autonomy` in `merge-check` mode: `Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "merge-check #{n}")`. This weighs the diff's content, `/review`'s findings, and a test-exclusion-aware blast-radius summary (`bin/lib/issues/blast-radius.js`) holistically, replacing the old three independent mechanical checks (scoring eligibility, runtime cleanliness, blast radius) that stood in for one real question — see `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md`. **Every member's verdict must be `auto-merge`** for the group to proceed — a single `needs-human` verdict anywhere in the group falls the whole group back to the normal pending-review path.

**All four pass:** merge directly, bypassing the interactive `/superpowers:finishing-a-development-branch` handoff entirely (there is no human present to answer its merge/PR/discard prompt during a headless firing). Before merging, clear this run's worktree assignment the same way `flow/worktree-merge.md`'s reconciliation does:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"
```

so the merge itself, landing in the main checkout, isn't denied as a wrong-checkout commit. Then, from the main checkout:

```bash
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$DEFAULT_BRANCH" ]; then
  echo "Main checkout is on '$CURRENT', not '$DEFAULT_BRANCH' — a concurrent session switched it. Abort, do not merge." >&2
  exit 1
fi
git merge --no-ff "$BRANCH" -m "[auto-merge] {one-line summary}

Fixes #{issue}
Fixes #{second-issue}"
git push
```

One `Fixes #{issue}` line per record in the group. The explicit `--no-ff` guarantees a real merge commit exists even when the branch would otherwise fast-forward — this is what the `[auto-merge]` tag lands on, and the same commit message carries the closing keyword per "Close-via-merge" in `_shared/issue-claims.md`, so no separate carrier commit is needed for this path. **If the merge conflicts:** conflict resolution requires judgment a headless run can't supply — abort the merge (`git merge --abort`) and fall back to the normal `auto:build`-only path (present the Review Console, wait for a human), logging why the auto-merge path was abandoned.

Log to `decisions.md`:
`AUTO {time} — Auto-merge: group [{issues}], assess-agent-autonomy verdict auto-merge for every member (see each member's RATIONALE). Merge commit: {sha}. Reversibility: high (git revert).`
Attach the full Review-Console-equivalent summary (whatever `/wrap-up` already produced) to a `PushNotification` as a non-blocking FYI — nothing wrap-up found is dropped, only the wait for a click is skipped.

**Any layer fails:** proceed exactly as the `auto:build`-only path would — present the normal Review Console, wait for a human.

## Reporting

Per-firing output is one group's outcome (bare mode with M ≤ `dispatch-pick-max-concurrent` groups: one report block per dispatched group) — there is **no consolidated multi-group console**. The old design's console existed to support `drain`; it dies with it (see When to Use above).

A headless (Routine-fired) firing's report has nobody live to read it — the durable trace is the label state change, the claim-comment trail, and `decisions.md`, not a rendered console. Over time, a human sees the aggregate picture via `/claude-tweaks:tidy`'s own `--scope=github` rolling digest (the "Tidy GitHub-Triage Digest" issue, `tidy/SKILL.md`) — it scans GitHub state independently on its own cadence and surfaces `bot:blocked` records and stale claims without dispatch having to push anything to it directly.

`pending-review` outcomes park: the branch (and, for the group's `/flow`-created run dir) sit waiting for a human — an unanswered Review Console `AskUserQuestion` during a headless firing is not an error, it is the expected resting state until a human resumes that session or the branch directly, or the claim's TTL expires and a later firing supersedes it.

`PushNotification` fires only at the retry ceiling and for auto-merge FYIs (Settle step 6, Auto-merge gate above) — never per-firing just because a firing happened, to avoid notification fatigue.

## Configuration

Read from CLAUDE.md or `.claude-tweaks/policy.yml`:

| Flag | Default | Meaning |
|---|---|---|
| `dispatch-retry-ceiling` | `3` | Consecutive failures before a dispatched record gets `bot:blocked` and stops auto-retrying. |
| `automerge-max-lines` | `40` | Auto-merge blast-radius cap on changed lines. |
| `automerge-max-files` | `2` | Auto-merge blast-radius cap on changed files. |
| `dispatch-pick-max-concurrent` | `3` | Maximum groups (bundles or singleton records) a firing runs at once; remaining groups queue for a freed slot. |

**Legacy aliases:** the pre-grants keys `triage-retry-ceiling`, `triage-fast-track-max-lines`, `triage-fast-track-max-files`, and `triage-dispatch-max-concurrent` are still read as aliases for the four rows above, in that order, when the new key is absent — no project should have to rename its policy file just because this skill was renamed.

## Routine Configuration

`/dispatch` ships a routine template (`skills/dispatch/routine-template.yml`) whose prompt is `/claude-tweaks:dispatch next` — the headless-safe selection form from Step 3. Instantiate it for the current project with:

```
/claude-tweaks:routine create dispatch
```

**Migration note.** A cloud Routine created from `/claude-tweaks:triage`'s old template still fires `triage dispatch` — that workflow no longer exists (`/claude-tweaks:triage` is now the pure interactive gate; see Relationship below). This cannot be detected or fixed from inside a `/dispatch` run — a live routine referencing a retired prompt isn't visible here. If you have a routine scheduled before this skill existed, re-create it now via the command above; the old one keeps firing a prompt that no longer does anything until you replace or delete it.

## Next Actions

Render only when a human is present to answer — the bare form is definitionally interactive (its own Step 3 pick already required one answer); `next` / `#N` render this block when a human typed the command directly, never when this firing came from a scheduled Routine (nobody is present to answer, and an unanswered question at the very end of a headless run is just noise):

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Dispatch again (Recommended)"`, `description`: `"/claude-tweaks:dispatch — pick from what's left in the authorized queue"`
- Option 2 — `label`: `"Set up the dispatch routine"`, `description`: `"/claude-tweaks:routine create dispatch — schedule 'dispatch next' as a recurring headless routine"`
- Option 3 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — see the authorized-queue size and bot:blocked records"`

## Component-Skill Contract

`/claude-tweaks:dispatch` is never invoked as a pipeline component by another skill — a human runs one of its three forms directly, or a scheduled Routine fires `/claude-tweaks:dispatch next` headlessly (see Routine Configuration above). See Next Actions above for the render/suppress rule.

`$PIPELINE_RUN_DIR` is not this skill's own state. Dispatch resolves its own standalone-auto run dir (per `_shared/pipeline-run-dir.md`'s allowlist) purely to write its own `decisions.md` — the claim/release/downgrade audit trail for this firing. Each dispatched group's `/claude-tweaks:flow` invocation creates a separate, later `PIPELINE_RUN_DIR` of its own for the actual pipeline execution; the two are never the same directory, which is exactly why Step 5 threads `CLAIM_RUN_ID` explicitly into the Task agent rather than relying on `/flow` inheriting dispatch's run id.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Adding `auto:build`, `auto:merge`, or `ready` from inside dispatch | Machinery may only remove or downgrade grants, never add them — the permission matrix's hard line (`_shared/work-record.md`). Dispatch selects on grants a human already gave; it never originates one. |
| Claiming a single member of a file-overlap group without its partners | Building one member alone would leave the branch and its overlap partners racing each other — `_shared/issue-claims.md`'s group-claim rule requires the whole group before starting any. |
| Letting a group auto-merge on a retry after a prior `correctness`-classified failure | The failure-downgrade rule exists specifically to prevent this — a `correctness` or `ambiguous` classification unconditionally revokes `auto:merge` before the next retry; only a `transient` classification preserves it. |
| Auto-merging when the diff exceeds the blast-radius cap, even with zero review findings | Review can't catch everything a human glance would — the cap is an independent check, not redundant with cleanliness. |
| Retrying a failed record indefinitely with no ceiling | Wastes routine cycles on something fundamentally stuck and never surfaces it to a human — the retry ceiling exists to force a checkpoint. |
| Building a session that shepherds every authorized group to completion in one run | Context rot — a session babysitting N pipeline runs accumulates context until it degrades. Throughput comes from routine cadence × single-group firings, not session breadth. |
| Filing, closing, or granting authorization on records from inside dispatch | Dispatch is a *consumer* of what `/claude-tweaks:triage` already granted — filing belongs to the health skills/`/claude-tweaks:capture`, granting belongs to `/claude-tweaks:triage`. |
| Deriving a spec per bundle member before invoking `/flow` | A granted record is already spec-shaped (`ready` + spec-shaped body) — `/flow #A,#B` materializes directly. The old per-member `/specify` pre-step is deleted; don't reintroduce it. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:triage` | The human gate upstream — grants `auto:build` (optionally `+ auto:merge`) that dispatch selects on. Dispatch never grants; it only strips or downgrades a grant on failure or at the retry ceiling. Triage never claims or dispatches. |
| `/claude-tweaks:flow` | The executor dispatch hands claimed groups to — `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{n}[,#{m}...]`. `/flow` is opaque to dispatch: materialization (spec derivation, multi-issue bundling) is `/flow`'s own concern, not dispatch's. |
| `_shared/issue-claims.md` | Defines the claim protocol (the lock, the mirror, the group-claim rule, release triggers, the ownership rule) that dispatch implements start to finish — claim in Step 4, release in Settle. |
| `_shared/work-record.md` | Taxonomy home — the six-axis label contract and the permission-matrix row dispatch implements (`bot:in-progress` / `bot:blocked` add; `auto:merge` / `auto:*` / `bot:in-progress` remove; never add `auto:*` or `ready`). |
| `/claude-tweaks:tidy` | Surfaces orphaned or stale claims dispatch left behind (Step 4.7) and `bot:blocked` records as re-authorization candidates; a headless firing's outcome ultimately surfaces on `/tidy`'s own rolling GitHub-triage digest rather than a console dispatch renders itself — see Reporting above. |
| `/claude-tweaks:wrap-up` | Releases the claim on success (cleanup Section E) using the `CLAIM_RUN_ID` dispatch threaded through `/flow`, not its own `PIPELINE_RUN_DIR` — the ownership check depends on this. The auto-merge gate's checks run against wrap-up's own Review Console output before it would otherwise render. |
| `/claude-tweaks:help` | Surfaces the authorized-queue size, `bot:blocked` count, and a rolling auto-merge count on the dashboard. |
| `/claude-tweaks:routine` | `/routine create dispatch` instantiates `skills/dispatch/routine-template.yml` as a scheduled headless dispatcher (`prompt: /claude-tweaks:dispatch next`). |
| `_shared/subagent-output-contract.md` | Each group's `Task()` prompt follows the contract's Input Discipline and status-line protocol; the GROUP/OUTCOME/MANIFEST template is this skill's own minimal shape (none of Templates A/B/C fit a full-pipeline-execution agent). |
| `_shared/label-bootstrap.md` | Canonical check-then-create snippet for `bot:in-progress` / `bot:blocked` — the only two labels dispatch itself ever adds. |
| `_shared/pipeline-run-dir.md` | Dispatch resolves a standalone-auto run dir (allowlist) for its own `decisions.md`; distinct from the `PIPELINE_RUN_DIR` each dispatched `/flow` run creates for its own build — see Component-Skill Contract above. |
| `bin/lib/issues/{claims,retry,grouping,record}.js` | The pure helpers behind claim/release payloads, retry-ceiling math, file-overlap grouping, and grant/bot-state facet parsing — dispatch calls all four, unchanged. Step 2 also calls record.js's `parseDependencies` to drop records with an open `Blocked by #N` line from the queue. |
| `/claude-tweaks:assess-agent-autonomy` | Called inline (not a fresh Task dispatch) at two points: the Auto-merge gate (`merge-check` mode, replacing the old three-layer mechanical check) and the Settle step (`failure-check` mode, replacing unconditional `auto:merge` revocation). Dispatch still owns authorization, claim mechanics, and retry-ceiling counting directly — assess-agent-autonomy only ever returns a verdict, never writes a label itself. |
