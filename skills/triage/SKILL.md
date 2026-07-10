---
name: claude-tweaks:triage
description: Use when you want to authorize GitHub issues for autonomous building, or when a scheduled routine needs to pick up already-authorized issues and hand them to /flow. Bare invocation is interactive batch authorization (needs-review / approved / fast-track); `triage dispatch` is the headless mode a routine fires. Keywords - triage, authorize, dispatch, status:approved, status:fast-track, autonomous issue building.
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

Filter out any issue already carrying `status:needs-review`, `status:approved`,
or `status:fast-track` — those have already been tiered by a prior triage run.

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
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Write status:approved / status:fast-track per the table above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"I'll specify #-by-# corrections in my next message"`
- Option 3 — `label`: `"Flag some for review instead"`, `description`: `"Mark specific issues status:needs-review rather than authorizing them"`

Overrides are ordinary free-text in the user's next message, not the `Other`
field (which answers this one batch question, not a per-item list).

### Step 4: Apply

```bash
gh label list --search "status:approved" --json name -q '.[].name' | grep -qx status:approved || \
  gh label create status:approved --description "Triage authorized this for building - human approves the merge"
gh label list --search "status:fast-track" --json name -q '.[].name' | grep -qx status:fast-track || \
  gh label create status:fast-track --description "Triage authorized this for building - auto-merges if the run comes back clean"
gh label list --search "status:needs-review" --json name -q '.[].name' | grep -qx status:needs-review || \
  gh label create status:needs-review --description "Triage flagged this - needs a closer human look before authorizing"
gh issue edit "$ISSUE" --add-label "status:{tier}"
```

Log each to `decisions.md` (this run's standalone-auto run dir per
`_shared/pipeline-run-dir.md` — triage has no parent pipeline):
`AUTO {time} — Triage: applied status:{tier} to issue #{n} (risk:{riskTier}, effort:{effortTier}).`

## Workflow — `dispatch` (headless)

### Step 1: Pull tiered, unclaimed issues

```bash
gh issue list --label status:approved --state open --json number,title,labels --limit 100 > /tmp/dispatch-approved.json
gh issue list --label status:fast-track --state open --json number,title,labels --limit 100 > /tmp/dispatch-fast-track.json
node -e "console.log(JSON.stringify([...require('/tmp/dispatch-approved.json'), ...require('/tmp/dispatch-fast-track.json')]))" > /tmp/dispatch-all.json
```

Skip any issue already carrying `status:in-progress` (claimed by an
overlapping firing) or `status:blocked` (hit its retry ceiling — needs a
human, never auto-retried).

### Step 2: Claim each (per `_shared/issue-claims.md`)

Resolve the sha once per run, then for each issue attempt the atomic ref
creation exactly as `_shared/issue-claims.md`'s "The lock" section describes.
On success: bootstrap-then-add `status:in-progress`, post the claim comment
(`claimPayload`). On 422 (contested): fold through `claimStatus` — live claim
→ skip; stale claim → break and take over. Any other failure → skip, log,
continue.

### Step 3: Hand off to `/flow`

For each successfully claimed issue, invoke `/claude-tweaks:flow #{issue}`
(the pure-executor issue-reference form — see `flow/SKILL.md`). `/flow`
derives a spec via `/claude-tweaks:specify #{issue}` (the existing
issue-ingestion path) and runs the standard pipeline.

### Step 4: On pipeline failure — retry ceiling

When a handed-off `/flow` run fails a HARD-GATE (never reaches `/wrap-up`):

1. Release the claim (reason: `failed: {gate}`, per `_shared/issue-claims.md`'s
   Release triggers table).
2. Post a failure comment:

   ```bash
   node -e "
     const { attemptFailedCommentBody } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
     console.log(attemptFailedCommentBody({ attemptNumber: process.argv[1], reason: process.argv[2] }));
   " "$ATTEMPT_NUMBER" "$REASON" > /tmp/attempt-comment.md
   gh issue comment "$ISSUE" --body-file /tmp/attempt-comment.md
   ```

3. Check the ceiling (read `triage-retry-ceiling` from CLAUDE.md/`policy.yml`, default 3):

   ```bash
   gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100" > "/tmp/dispatch-comments-${ISSUE}.json"
   node -e "
     const { hasHitRetryCeiling } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
     const comments = require(process.argv[1]);
     console.log(hasHitRetryCeiling(comments, Number(process.argv[2] || 3)));
   " "/tmp/dispatch-comments-${ISSUE}.json" "$TRIAGE_RETRY_CEILING"
   ```

4. **If the ceiling was hit:** strip whichever tier label the issue carries,
   add `status:blocked`, send a `PushNotification` ("Issue #{n} hit its retry
   ceiling — needs a look: {title}").
5. **If not:** leave the tier label in place — the next `dispatch` firing
   pulls it again naturally (the claim was already released).

**Failure-downgrade rule:** whenever a `status:fast-track` issue's run fails
for *any* reason, downgrade it to `status:approved` before the next retry —
remove `status:fast-track`, add `status:approved`. A retry that didn't come
back clean the first time never gets another unsupervised shot at auto-merge.

## Auto-merge gate (fast-track only)

When a `status:fast-track` issue's `/flow` run reaches `/wrap-up`'s Review
Console, check all four layers before presenting it for approval:

1. **Authorization** — `status:fast-track` was present when dispatched
   (true by construction).
2. **Pre-scored eligibility** — true by construction (the Tier Rule only
   ever recommends `fast-track` for `risk:low`+`effort:low`).
3. **Runtime cleanliness** — `/review`'s Step 3 Routing produced nothing at
   Medium severity or above for this spec.
4. **Blast radius** — the diff touches only files the original issue's
   fingerprint/anchor pointed at, and stays under `triage-fast-track-max-lines`
   (default 40) changed lines across `triage-fast-track-max-files` (default 2)
   files.

**All four pass:** merge without waiting for a live approval. Tag the merge
commit `[fast-lane]`. Log to `decisions.md`:
`AUTO {time} — Fast-lane auto-merge: issue #{n}, {lines} lines across {files} files, zero findings >= medium. Reversibility: high (git revert).`
Attach the full Review-Console-equivalent summary (whatever Auto-applied /
Skill updates / Configuration updates sections wrap-up already produced) to a
`PushNotification` as a non-blocking FYI — nothing wrap-up found is dropped,
only the wait for a click is skipped.

**Any layer fails:** proceed exactly as `status:approved` would — present the
normal Review Console, wait for a human.

## Configuration

Read from CLAUDE.md or `.claude-tweaks/policy.yml`:

| Flag | Default | Meaning |
|---|---|---|
| `triage-retry-ceiling` | `3` | Consecutive failures before a dispatched issue gets `status:blocked` and stops auto-retrying. |
| `triage-fast-track-max-lines` | `40` | Blast-radius cap on changed lines for a fast-track auto-merge. |
| `triage-fast-track-max-files` | `2` | Blast-radius cap on changed files for a fast-track auto-merge. |

## Next Actions

When invoked by a parent skill, omit this block. When invoked directly:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Run triage again (Recommended)"`, `description`: `"/claude-tweaks:triage — review any remaining untiered issues"`
- Option 2 — `label`: `"Set up the dispatch routine"`, `description`: `"/claude-tweaks:routine create triage — schedule triage dispatch as a recurring headless routine"`
- Option 3 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — see pending-authorization count and status:blocked issues"`

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Applying `status:approved`/`status:fast-track`/`status:needs-review` from inside `dispatch` mode | Only the interactive, human-confirmed bare invocation ever writes a tier label — this is the security boundary (GitHub's own triage-permission model), not a discretionary nicety. `dispatch` mode only ever reads tier labels. |
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
| `/claude-tweaks:tidy` | Step 4.8 surfaces `status:blocked` counts and the pending-authorization queue size (issues with no tier label yet) as maintenance signals; `/tidy` never applies a tier label itself. |
| `/claude-tweaks:wrap-up` | The auto-merge gate checks run against `/wrap-up`'s own Review Console output before it renders — a clean fast-track run merges without the console's blocking wait, but the console's other sections (skill updates, config updates) still generate and attach to the notification. |
| `/claude-tweaks:help` | Surfaces pending-authorization count, `status:blocked` count, and a rolling auto-merge count on the dashboard. |
| `/claude-tweaks:routine` | `/routine create triage` instantiates `skills/triage/routine-template.yml` as a scheduled headless dispatcher (`prompt: /claude-tweaks:triage dispatch`). |
