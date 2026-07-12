---
name: claude-tweaks:triage
description: Use when you want to authorize GitHub issues for autonomous building, or when a scheduled routine needs to pick up already-authorized issues and hand them to /flow. Bare invocation is interactive batch authorization (needs-review / approved / fast-track); `triage dispatch` is the headless mode a routine fires. Keywords - triage, authorize, dispatch, tier:approved, tier:fast-track, autonomous issue building.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Triage — Issue Authorization & Headless Dispatch

Decides which GitHub issues are safe to build autonomously, at what tier, and
hands authorized work off to `/flow` for pure execution.

```
code-health / harness-health (file issues)
              |
              v
   [ /claude-tweaks:triage ] <- utility (no fixed lifecycle position)
              |
   bare invocation: human tiers issues (needs-review / approved / fast-track)
   `triage dispatch`: headless — pulls tiered issues, claims, hands off
              |
              v
   /claude-tweaks:flow #{issue}  (pure executor: /specify -> build -> test -> review -> wrap-up)
```

## When to Use

- You want to review a batch of code-health/harness-health issues and decide
  which get authorized for autonomous building, and at what tier — run the
  bare invocation.
- A scheduled routine needs to pick up already-tiered issues and hand them to
  `/flow` headlessly, with no human present — that's `triage dispatch`.

Not for: building anything yourself. Triage only ever labels issues and hands
off — it never derives a spec or writes application code.

## Input

`$ARGUMENTS`:

| Argument | Behavior |
|---|---|
| *(none)* | Bare invocation — interactive batch triage |
| `dispatch` | Headless mode — pulls tiered issues, claims each, hands off to `/flow` |

## Workflow — Bare invocation (interactive triage)

### Step 1: Pull untiered issues

```bash
gh issue list --label code-health --state open --json number,title,body,labels --limit 100 > /tmp/triage-code-health.json
gh issue list --label harness-health --state open --json number,title,body,labels --limit 100 > /tmp/triage-harness-health.json
node -e "console.log(JSON.stringify([...require('/tmp/triage-code-health.json'), ...require('/tmp/triage-harness-health.json')]))" > /tmp/triage-all.json
```

Filter out any issue already carrying `tier:needs-review`, `tier:approved`,
or `tier:fast-track` — those have already been tiered by a prior triage run.

### Step 2: Compute the recommended tier

```bash
node -e "
  const { extractRiskEffort, recommendTier } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/tier.js');
  const issues = require('/tmp/triage-all.json');
  const rows = issues.map(i => {
    const { riskTier, effortTier } = extractRiskEffort(i.labels);
    return { number: i.number, title: i.title, riskTier, effortTier, recommended: recommendTier({ riskTier, effortTier }) };
  });
  console.log(JSON.stringify(rows));
" > /tmp/triage-rows.json
```

### Step 3: Present the batch table

```markdown
### Triage — {N} issues awaiting authorization

| # | Issue | Risk | Effort | Recommended |
|---|---|---|---|---|
| 1 | #123: {title} | low | low | Fast-track |
| 2 | #124: {title} | medium | high | Approved |
```

Then one `AskUserQuestion`:

- `question`: `"Apply the recommended tier to all, or override specific issues?"`, `header`: `"Triage batch"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Write tier:approved / tier:fast-track per the table above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"I'll specify #-by-# corrections in my next message"`
- Option 3 — `label`: `"Flag some for review instead"`, `description`: `"Mark specific issues tier:needs-review rather than authorizing them"`

Overrides are ordinary free-text in the user's next message, not the `Other`
field (which answers this one batch question, not a per-item list).

### Step 4: Apply

```bash
node -e "
  const { ensureLabelPayload } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/labels.js');
  const labels = [
    ['tier:approved', 'Triage authorized this for building - human approves the merge'],
    ['tier:fast-track', 'Triage authorized this for building - auto-merges if the run comes back clean'],
    ['tier:needs-review', 'Triage flagged this - needs a closer human look before authorizing'],
  ];
  console.log(JSON.stringify(labels.map(([n, d]) => ensureLabelPayload(n, d))));
" > /tmp/triage-tier-label-payloads.json
node -e "const ls=require('/tmp/triage-tier-label-payloads.json'); ls.forEach(l => console.log(l.name + '\t' + l.description))" | while IFS=$'\t' read -r NAME DESCRIPTION; do
  gh label list --search "$NAME" --json name -q '.[].name' | grep -qx "$NAME" || \
    gh label create "$NAME" --description "$DESCRIPTION"
done
if gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -qx status:blocked; then
  gh issue edit "$ISSUE" --remove-label status:blocked --add-label "tier:{tier}"
else
  gh issue edit "$ISSUE" --add-label "tier:{tier}"
fi
```

A `status:blocked` issue reaching this step means a human is re-tiering something that
previously hit its retry ceiling — always strip `status:blocked` when granting a new tier, or
the issue ends up carrying both labels and `dispatch`'s Step 1 skip rule silently ignores it
forever despite the fresh authorization.

Log each to `decisions.md` (this run's standalone-auto run dir per
`_shared/pipeline-run-dir.md` — triage has no parent pipeline):
`AUTO {time} — Triage: applied tier:{tier} to issue #{n} (risk:{riskTier}, effort:{effortTier}).`

## Workflow — `dispatch` (headless)

Resolve this firing's `$RUN_ID` once, before Step 1, via the standalone-auto run-dir
resolution in `_shared/pipeline-run-dir.md` (triage has no parent pipeline) — `$RUN_ID` is
that run directory's basename (e.g. `2026-07-11T140322-triage-standalone`). Every claim this
firing makes in Step 2 embeds this same value as `claimPayload`'s `runId`, and every group's
Task agent in Step 3 receives it explicitly (Task agents don't inherit shell variables — per
`_shared/subagent-output-contract.md`'s Input Discipline, a dispatched agent is a clean room)
so Step 4's ownership check (`claim.runId === $RUN_ID`), now performed inside that agent
rather than in this thread, compares against the firing that actually claimed the issue.

### Step 1: Pull tiered, unclaimed issues

```bash
gh issue list --label tier:approved --state open --json number,title,labels --limit 100 > /tmp/dispatch-approved.json
gh issue list --label tier:fast-track --state open --json number,title,labels --limit 100 > /tmp/dispatch-fast-track.json
node -e "console.log(JSON.stringify([...require('/tmp/dispatch-approved.json'), ...require('/tmp/dispatch-fast-track.json')]))" > /tmp/dispatch-all.json
```

Skip any issue already carrying `status:in-progress` (claimed by an
overlapping firing) or `status:blocked` (hit its retry ceiling — needs a
human, never auto-retried).

### Step 2: Claim each (per `_shared/issue-claims.md`)

Resolve the sha once per run, then for each issue attempt the atomic ref creation exactly as
`_shared/issue-claims.md`'s "The lock" section describes:

```bash
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
SHA=$(gh api "repos/{owner}/{repo}/commits/${DEFAULT_BRANCH}" -q .sha)
gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${ISSUE}" -f "sha=${SHA}"
```

**On success (201):** bootstrap-then-add `status:in-progress`, then post the claim comment
(`claimPayload`):

```bash
DESCRIPTION=$(node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/labels.js').ensureLabelPayload('status:in-progress', 'Claimed and being built by an autonomous claude-tweaks run').description)")
gh label list --search "status:in-progress" --json name -q '.[].name' | grep -qx status:in-progress || \
  gh label create status:in-progress --description "$DESCRIPTION"
gh issue edit "$ISSUE" --add-label status:in-progress
```

**On 422 (contested):** fetch comments and fold through `claimStatus` exactly as
`_shared/issue-claims.md`'s "Reading claim state" section describes, then branch on the full
returned shape — do not collapse to a two-way live/stale fold, the fourth row below is not the
same as the third even though a bare `claimed:false` looks identical without it:

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

### Step 2.5: Group claimed issues by file overlap

Claimed issues that touch the same code should build on each other's commits in one shared worktree, not diverge across isolated parallel worktrees. Extract each claimed issue's key files straight from its body (no spec exists yet at this point — extraction happens before any spec derivation) and partition:

```bash
> /tmp/dispatch-claimed-issues.ndjson
for ISSUE in $CLAIMED_ISSUES; do   # $CLAIMED_ISSUES: issue numbers successfully claimed in Step 2
  gh api "repos/{owner}/{repo}/issues/${ISSUE}" --jq '{id:.number,body:.body,labels:[.labels[].name]}' >> /tmp/dispatch-claimed-issues.ndjson
done
node -e "
  const fs = require('fs');
  const { extractKeyFiles, groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const issues = fs.readFileSync('/tmp/dispatch-claimed-issues.ndjson', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const items = issues.map((i) => ({ id: i.id, keyFiles: extractKeyFiles(i) }));
  console.log(JSON.stringify(groupByFileOverlap(items)));
" > /tmp/dispatch-groups.json
```

`/tmp/dispatch-groups.json` is an array of groups, each an array of issue numbers. A group of size 1 is a **singleton** (dispatched as plain issue-mode `/flow #{issue}`, unchanged from before this design); a group of size 2+ is a **bundle** (each member gets its own spec derived first, then the bundle runs as one multi-spec `/flow` invocation — see Step 3).

### Step 3: Dispatch groups, capped-concurrent

Work through `/tmp/dispatch-groups.json` at up to `triage-dispatch-max-concurrent` groups running at once (default 3 — see Configuration). Each group becomes one Task agent with its own worktree (created via `/superpowers:using-git-worktrees` exactly as a normal `/flow` invocation would — do not pre-create or share a worktree path across groups). Queued groups start as soon as a slot frees up; there is no per-firing timeout, only the concurrency throttle — nothing elsewhere in this codebase imposes one (existing parallel-Task dispatch sites, e.g. `/help`'s Stage 1-7, already wait for all dispatched agents regardless of duration).

Export `CLAIM_RUN_ID="{RUN_ID}"` (this dispatch firing's run id — the same value already embedded
in each issue's claim marker by Step 2) before invoking `/flow`, for both shapes below. `/flow`
threads it through to `/wrap-up`'s release step (`cleanup-procedures.md` Section E /
`multispec-review-console.md`) so the success-path ownership check compares against the run that
actually made the claim, not `/flow`'s own (different, later-created) pipeline run dir — see
`_shared/issue-claims.md`'s Identity section.

**Singleton group** `[123]` — the agent's job is exactly today's single-issue dispatch: invoke
`CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #123` (issue-mode derives its own spec internally,
per `flow/SKILL.md`).

**Bundle group** `[123, 456]` — `/flow` has no multi-issue form (verified: multi-spec mode takes spec numbers, not issue references — `flow/SKILL.md`'s multi-spec syntax is `/claude-tweaks:flow 42,45,48`). The agent derives a spec per member first, then runs the bundle as one multi-spec invocation:

```bash
for ISSUE in 123 456; do
  /claude-tweaks:specify "#${ISSUE}"   # derives a spec, carries recon-issue/recon-fingerprint frontmatter forward
  # capture the resulting spec number from specify's own summary output
done
# once every member has a spec:
CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "${SPEC_1},${SPEC_2}"   # multi-spec, one shared worktree — see multi-spec.md
```

Each group's `Task()` prompt (per `_shared/subagent-output-contract.md`'s input discipline — minimal input, literal output template inlined, no conversation history):

```
Task scope: Execute claude-tweaks pipeline work for this group of already-claimed GitHub
issues: {issue list}. This dispatch firing's run id, for the ownership check in Step 4, is:
{RUN_ID} -- the same value already embedded as runId in each of this group's issues' claim
markers by Step 2. Singleton -> run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{issue}`.
Bundle (2+ issues) -> for each issue run `/claude-tweaks:specify "#{issue}"` to derive a spec,
then run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "{spec1},{spec2},..."` once with the
resulting spec numbers comma-joined. The `CLAIM_RUN_ID` export matters on the success path too,
not just failures below -- `/flow` threads it to `/wrap-up`'s release step so its ownership
check compares against the run that actually claimed the issue. Handle any HARD-GATE failure
per skills/triage/SKILL.md's Step 4 (retry ceiling / failure-downgrade rule) before finishing --
do not leave a failed issue's claim or label state unresolved. Step 4's ownership check compares
each issue's claim.runId against the {RUN_ID} given above, not any run id you generate yourself.

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

This is a new dispatch shape for this codebase -- none of Templates A/B/C in `_shared/subagent-output-contract.md` fit an agent that executes a full pipeline rather than returning findings/locations/a yes-no, so this task defines its own minimal template inline here rather than forcing a template mismatch. The universal parts of the contract still apply: the four-value status line, minimal input, and literal (not referenced) output format.

### Step 4: On pipeline failure — retry ceiling

This procedure now runs inside each group's own Task agent (Step 3), against that agent's own issue(s) — not in dispatch's main thread. The mechanics below (ownership check, release, retry-ceiling math, failure-downgrade rule) are unchanged; only who executes them changed.

When a handed-off `/flow` run fails a HARD-GATE (never reaches `/wrap-up`):

1. Before releasing, fold this issue's comments through `claimStatus` (per `_shared/issue-claims.md`'s
   Ownership rule) and confirm `claim.runId` equals this run's `$RUN_ID`. A mismatch means a
   successor already broke the stale claim and now holds the lock — skip the rest of this step
   entirely (no release, no label changes, no comment), log, and move to the next issue.
2. Release the claim (reason: `failed: {gate}`, per `_shared/issue-claims.md`'s
   Release triggers table), then remove `status:in-progress`
   (`gh issue edit "$ISSUE" --remove-label status:in-progress`, best-effort — log a warning and
   continue on failure, the same as every other release site).
3. Fetch existing comments and compute this attempt's number and whether it
   hits the ceiling (read `triage-retry-ceiling` from CLAUDE.md/`policy.yml`,
   default 3), in one pass — fetching comments *before* posting this attempt's
   comment is what makes the attempt number and ceiling check correct:

   ```bash
   gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100" > "/tmp/dispatch-comments-${ISSUE}.json"
   node -e "
     const { countFailedAttempts, hasHitRetryCeiling } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
     const comments = require(process.argv[1]);
     const attemptNumber = countFailedAttempts(comments) + 1;
     const ceiling = Number(process.argv[2] || 3);
     // hasHitRetryCeiling counts existing comments only — call it against attemptNumber's
     // equivalent by treating this attempt as already-counted (attemptNumber IS that count).
     const ceilingHit = attemptNumber >= ceiling; // equivalent to hasHitRetryCeiling if comments included this attempt's own (not-yet-posted) comment
     console.log(JSON.stringify({ attemptNumber, ceilingHit }));
   " "/tmp/dispatch-comments-${ISSUE}.json" "$TRIAGE_RETRY_CEILING" > "/tmp/attempt-info-${ISSUE}.json"
   ```

4. Post the failure comment, using the `attemptNumber` and `ceilingHit` just computed:

   ```bash
   node -e "
     const { attemptFailedCommentBody } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
     const { attemptNumber, ceilingHit } = require(process.argv[1]);
     console.log(attemptFailedCommentBody({ attemptNumber, reason: process.argv[2], ceilingHit }));
   " "/tmp/attempt-info-${ISSUE}.json" "$REASON" > /tmp/attempt-comment.md
   gh issue comment "$ISSUE" --body-file /tmp/attempt-comment.md
   ```

5. **If `ceilingHit` was `true`:** bootstrap `status:blocked` if it doesn't already exist —
   `gh label create` does not auto-vivify a label on first `--add-label`, and nothing else in
   this file creates this one:

   ```bash
   DESCRIPTION=$(node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/labels.js').ensureLabelPayload('status:blocked', 'Hit its retry ceiling under autonomous dispatch - needs a human look').description)")
   gh label list --search "status:blocked" --json name -q '.[].name' | grep -qx status:blocked || \
     gh label create status:blocked --description "$DESCRIPTION"
   ```

   Then strip whichever tier label the issue carries, add `status:blocked`, send a
   `PushNotification` ("Issue #{n} hit its retry ceiling — needs a look: {title}"). The
   Failure-downgrade rule below is moot here — whatever tier existed is already being stripped.
6. **If `false`:** apply the Failure-downgrade rule first, *then* leave the
   (possibly just-downgraded) tier label in place — the next `dispatch`
   firing pulls it again naturally (the claim was already released):

   ```bash
   if gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -qx tier:fast-track; then
     gh issue edit "$ISSUE" --remove-label tier:fast-track --add-label tier:approved
   fi
   ```

**Failure-downgrade rule:** whenever a `tier:fast-track` issue's run fails for *any* reason —
including a sub-ceiling failure handled by item 6 above, not only the ceiling-hit case — downgrade
it to `tier:approved` before the next retry. A retry that didn't come back clean the first
time never gets another unsupervised shot at auto-merge. This is not a separate, optional step:
item 6's "leave the tier label in place" refers to whatever tier remains *after* this downgrade
runs, never to `tier:fast-track` unconditionally.

## Consolidated Review Console (dispatch only)

After every group from Step 3 reports back (`DONE`, `DONE_WITH_CONCERNS`, or `BLOCKED`), render **one** Review Console for the whole firing instead of the human seeing one per issue. Reuse `flow/multispec-review-console.md`'s table format and Hard Requirements (every entry surfaced, `Spec`/`Issue` column mandatory, sort order: reversibility:low first, then severity:high first, tiebreaker issue number ascending) — read every group's manifest/`decisions.md` and consolidate:

- **A bundle's** run dir already has the standard multi-spec layout (`manifest.yml` enumerating `spec-{N}/` subdirectories, each with its own `decisions.md`/`staged/`) — read it exactly as `multispec-review-console.md` describes.
- **A singleton's** run dir is an ordinary, unchanged single-spec run — its `decisions.md`/`staged/` live at the run dir's *top level*, not under a `spec-{N}/` subdirectory (there is no `manifest.yml`). Read those top-level files directly. For the mandatory `Spec`/`Issue` column, use the issue number from the group's `GROUP:` output line (Step 3's template) — a singleton has no spec-based attribution scheme to fall back on.

The auto-merge gate (below) is evaluated per issue, not per group, before this console renders — a bundle where one issue auto-merged cleanly and the other didn't shows the auto-merged one as an FYI row (already merged) and the other as a normal pending-approval row in the same console.

If every group's manifest shows zero decisions, zero staged items, and zero HARD-GATE failures across the whole firing, skip the console entirely — log "Dispatch firing: nothing to review" (same empty-console fast path as `multispec-review-console.md`).

## Auto-merge gate (fast-track only)

When a `tier:fast-track` issue's `/flow` run reaches `/wrap-up`'s Review
Console, check all four layers before presenting it for approval:

1. **Authorization** — `tier:fast-track` was present when dispatched
   (true by construction).
2. **Pre-scored eligibility** — true by construction (the Tier Rule only
   ever recommends `fast-track` for `risk:low`+`effort:low`).
3. **Runtime cleanliness** — `/review`'s Step 3 Routing produced nothing at
   Medium severity or above for this spec.
4. **Blast radius** — the diff touches only files the original issue's
   fingerprint/anchor pointed at, and stays under `triage-fast-track-max-lines`
   (default 40) changed lines across `triage-fast-track-max-files` (default 2)
   files.

**All four pass:** merge directly, bypassing the interactive
`/superpowers:finishing-a-development-branch` handoff entirely (there is no
human present to answer its merge/PR/discard prompt during a headless
`dispatch` run). Before merging, clear this run's worktree assignment the
same way `flow/worktree-merge.md`'s reconciliation does (`node
"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"`) so the
merge itself, landing in the main checkout, isn't denied as a wrong-checkout
commit. Then, from the main checkout:

```bash
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$DEFAULT_BRANCH" ]; then
  echo "Main checkout is on '$CURRENT', not '$DEFAULT_BRANCH' — a concurrent session switched it. Abort, do not merge." >&2
  exit 1
fi
git merge --no-ff "$BRANCH" -m "[fast-lane] {one-line summary}

Fixes #{issue}"
git push
```

The explicit `--no-ff` guarantees a real merge commit exists even when the
branch would otherwise fast-forward — this is what the `[fast-lane]` tag
lands on, and the same commit message carries the `Fixes #{issue}` closing
keyword per "Close-via-merge" in `_shared/issue-claims.md`, so no separate
carrier commit is needed for this path. **If the merge conflicts:** conflict
resolution requires judgment a headless run can't supply — abort the merge
(`git merge --abort`) and fall back to the normal `tier:approved` path
(present the Review Console, wait for a human), logging why the fast-lane
path was abandoned.

Log to `decisions.md`:
`AUTO {time} — Fast-lane auto-merge: issue #{n}, {lines} lines across {files} files, zero findings >= medium. Merge commit: {sha}. Reversibility: high (git revert).`
Attach the full Review-Console-equivalent summary (whatever Auto-applied /
Skill updates / Configuration updates sections wrap-up already produced) to a
`PushNotification` as a non-blocking FYI — nothing wrap-up found is dropped,
only the wait for a click is skipped.

**Any layer fails:** proceed exactly as `tier:approved` would — present the
normal Review Console, wait for a human.

## Configuration

Read from CLAUDE.md or `.claude-tweaks/policy.yml`:

| Flag | Default | Meaning |
|---|---|---|
| `triage-retry-ceiling` | `3` | Consecutive failures before a dispatched issue gets `status:blocked` and stops auto-retrying. |
| `triage-fast-track-max-lines` | `40` | Blast-radius cap on changed lines for a fast-track auto-merge. |
| `triage-fast-track-max-files` | `2` | Blast-radius cap on changed files for a fast-track auto-merge. |
| `triage-dispatch-max-concurrent` | `3` | Maximum groups (bundles or singleton issues) a dispatch firing runs at once; remaining groups queue for a freed slot. |

## Next Actions

Render only for the bare (interactive) invocation — there is no human present
to answer `AskUserQuestion` during a headless `dispatch` firing, so `dispatch`
mode never renders this block:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Run triage again (Recommended)"`, `description`: `"/claude-tweaks:triage — review any remaining untiered issues"`
- Option 2 — `label`: `"Set up the dispatch routine"`, `description`: `"/claude-tweaks:routine create triage — schedule triage dispatch as a recurring headless routine"`
- Option 3 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — see pending-authorization count and status:blocked issues"`

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| `dispatch` mode granting a tier an issue didn't already have (newly applying `tier:needs-review`/`tier:approved`/`tier:fast-track`) | Only the interactive, human-confirmed bare invocation ever grants a tier — this is the security boundary (GitHub's own triage-permission model), not a discretionary nicety. `dispatch` mode may only downgrade or strip a tier it reads (`fast-track`→`approved` on failure, or removed + `status:blocked` at the retry ceiling) — it revokes trust, it never grants it. |
| Deriving the recommended tier from anything other than `risk-<tier>`/`effort-<tier>` | The Tier Rule is deliberately narrow and mechanical — no LLM judgment re-enters at the gate itself. |
| Skipping the batch-confirm because the recommendation "looks obviously right" | The human action, however trivial, is the load-bearing security signature — never skip it, even for an all-"Fast-track" batch. |
| Letting a fast-track issue auto-merge on a retry after a prior failure | The failure-downgrade rule exists specifically to prevent this — any failure permanently downgrades that issue's current authorization to `approved`. |
| Auto-merging when the diff exceeds the blast-radius cap, even with zero review findings | Tests and review can't catch everything a human glance would — the cap is an independent check, not redundant with cleanliness. |
| Retrying a failed issue indefinitely with no ceiling | Wastes routine cycles on something fundamentally stuck and never surfaces it to a human — the retry ceiling exists to force a checkpoint. |
| Filing or closing issues from inside triage | Triage is a *consumer* of code-health/harness-health's issues — filing belongs to those skills; closing is a user decision at Review Console. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:flow` | `triage dispatch` claims issues and hands each to `/flow #{issue}` for pure execution — `/flow` never selects, filters, or sorts issues itself. `/flow`'s own routine template was retired; `/claude-tweaks:routine create triage` is the scheduled headless entry point now. |
| `/claude-tweaks:code-health` | Triage's bare invocation is the primary consumer of code-health's `risk-<tier>`/`effort-<tier>` labels — the Tier Rule reads them directly. Triage never files or closes code-health issues. |
| `/claude-tweaks:specify` | `/flow`'s issue-reference form derives a spec via `/claude-tweaks:specify #{issue}` (the existing issue-ingestion path) before running the normal pipeline. |
| `_shared/issue-claims.md` | `dispatch` mode claims each issue it pulls before handing off, per this shared protocol; releases follow the same triggers table. |
| `/claude-tweaks:tidy` | Step 4.8 surfaces the pending-authorization queue size (issues with no tier label yet) as a maintenance signal, including in the `--scope=github` routine's rolling digest; `/tidy` never applies a tier label itself. `status:blocked` counts are `/help`'s signal, not `/tidy`'s — see the `/claude-tweaks:help` row below. |
| `/claude-tweaks:wrap-up` | The auto-merge gate checks run against `/wrap-up`'s own Review Console output before it renders — a clean fast-track run merges without the console's blocking wait, but the console's other sections (skill updates, config updates) still generate and attach to the notification. |
| `/claude-tweaks:help` | Surfaces pending-authorization count, `status:blocked` count, and a rolling auto-merge count on the dashboard. |
| `/claude-tweaks:routine` | `/routine create triage` instantiates `skills/triage/routine-template.yml` as a scheduled headless dispatcher (`prompt: /claude-tweaks:triage dispatch`). |
