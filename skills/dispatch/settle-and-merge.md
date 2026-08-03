# Dispatch — Settle + Auto-merge Gate

Loaded by `/claude-tweaks:dispatch` Step 6 (a `/flow` HARD-GATE failure) and the Auto-merge gate (an `auto:merge`-granted group reaching `/wrap-up`'s Review Console) — both are conditional branches that don't run on the common clean-pending-review path, so they're kept out of `SKILL.md`'s always-loaded body.

**MCP path, file-wide.** Every label read/edit and comment operation in this file that isn't called out individually below (e.g. the `gh issue view --json labels` / `gh issue edit --remove-label` pair in Settle step 3, and the failure-comment post in step 5) uses the standard CRUD mapping from `_shared/github-write-transport.md`: `issue_write` (update mode) for label edits, `add_issue_comment` for comments, `issue_read` for reads. The one call site with special MCP-path handling — the retry-ceiling comment fetch (step 4 below) — already has its own dedicated note.

## Step 6: Settle — on pipeline failure

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

4. Fetch existing comments and compute this attempt's number and whether it hits the ceiling (read `dispatch-retry-ceiling` from CLAUDE.md/`policy.yml`, default 3, falling back to the legacy `triage-retry-ceiling` alias per `SKILL.md`'s Configuration table when the new key is absent), in one pass — fetching comments *before* posting this attempt's comment is what makes the attempt number and ceiling check correct:

   ```bash
   DISPATCH_RETRY_CEILING=$(grep -E "^dispatch-retry-ceiling:" CLAUDE.md .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*dispatch-retry-ceiling:[[:space:]]*//')
   if [ -z "$DISPATCH_RETRY_CEILING" ]; then
     DISPATCH_RETRY_CEILING=$(grep -E "^triage-retry-ceiling:" CLAUDE.md .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*triage-retry-ceiling:[[:space:]]*//')
   fi
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

**MCP path** (`gh` unavailable, same live-as-of-Task-10 status as `dispatch/SKILL.md`'s Step 4): use the confirmed "list issue comments" mapping from `_shared/github-write-transport.md` in place of the `gh api` call above — `countFailedAttempts` and the rest of this step's logic consume the same comment-body-string shape regardless of transport.

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

   Then remove `auto:build` and, if still present (a `transient`-classified attempt preserves it per step 3 above, so it can still be there at the ceiling), `auto:merge` too — per `_shared/issue-claims.md`'s canonical rule, the retry ceiling removes **all** `auto:*` labels, not just whichever one step 3 didn't already strip. Add `bot:blocked`, and send a `PushNotification` ("Record #{n} hit its retry ceiling — needs a look: {title}").
7. **If `false`:** leave `auto:build` in place — the next `dispatch next` firing pulls it again naturally (the claim was already released). There is nothing further to downgrade in the common case: step 3 revoked `auto:merge` unless the failure was classified transient, and that conditional revocation *is* the failure-downgrade rule in this model. Unlike the pre-grants design there is no separate two-tier label to step down between — a record either still has `auto:build` (and can retry) or, at the ceiling, has neither.

A `correctness`- or `ambiguous`-classified failure revokes `auto:merge` before the next retry, per step 3 above — that record doesn't get another unsupervised shot at auto-merge until a human re-grants it at `/claude-tweaks:backlog refine`. A `transient`-classified failure preserves `auto:merge` — the retry-ceiling counting below still runs unconditionally regardless of classification (an attempt is an attempt), but classification alone no longer determines merge trust the way it did before.

## Auto-merge gate (`auto:merge` groups only)

Because a bundle shares one branch/worktree, the merge decision is necessarily group-wide even though blast radius is attributed per record below: **every member of the group must carry `auto:merge`** for the gate to apply at all — a group with even one `auto:build`-only member falls back to the normal pending-review path for the whole group; mixed grants inside one bundle are never split at merge time.

When a qualifying group's `/flow` run reaches `/wrap-up`'s Review Console, check two layers before presenting it for approval:

1. **Authorization** — `auto:merge` was present on every member of the group when Step 4 claimed it (true by construction).
2. **Content judgment** — for each member of the group, invoke `/claude-tweaks:assess-agent-autonomy` in `merge-check` mode: `Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "merge-check #{n}")`. This weighs the diff's content, `/review`'s findings, and a test-exclusion-aware blast-radius summary (`bin/lib/issues/blast-radius.js`) holistically, replacing the old three independent mechanical checks (scoring eligibility, runtime cleanliness, blast radius) that stood in for one real question — see `docs/superpowers/specs/2026-08-03-mechanical-vs-substantive-merge-judgment-design.md`. **Every member's verdict must be `auto-merge`** for the group to proceed — a single `needs-human` verdict anywhere in the group falls the whole group back to the normal pending-review path.

**Both layers pass:** merge directly, bypassing the interactive `/superpowers:finishing-a-development-branch` handoff entirely (there is no human present to answer its merge/PR/discard prompt during a headless firing). Before merging, clear this run's worktree assignment the same way `flow/worktree-merge.md`'s reconciliation does:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"
```

so the merge itself, landing in the main checkout, isn't denied as a wrong-checkout commit (E1). That only satisfies E1, though — if the project also has `worktree.always: true` set, the separate, run-independent `checkWorktreeRequired` policy gate in `bin/lib/hooks/pre-tool-use.js` still applies, and it denies any `git push` issued from the main checkout regardless of `close-run` (that gate keys off whether the command's target is a linked worktree, not run state — `close-run` never touches it). `git merge` itself is never flagged by that gate (only `commit`/`push` targets are), so the merge below is safe to run from the main checkout either way. The push after it is not — it must run from inside this group's own linked worktree instead, as a **separate** Bash call: chaining merge-then-push into one compound command still gets the whole invocation denied before either half runs, since the gate inspects the full command string up front (see CLAUDE.md's Don'ts list on this exact shape). Capture the worktree path before leaving it — this agent's own `pwd` from Step 5 is already inside it:

```bash
GROUP_WORKTREE=$(git rev-parse --show-toplevel)
```

Then, from the main checkout:

Resolved via plain `git`, not `gh`/MCP — this is local repository metadata (the remote's `HEAD` pointer), not GitHub-hosted state, so it works identically regardless of transport with no branching needed at all.

```bash
DEFAULT_BRANCH=$(git remote show origin | sed -n '/HEAD branch/s/.*: //p')
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$DEFAULT_BRANCH" ]; then
  echo "Main checkout is on '$CURRENT', not '$DEFAULT_BRANCH' — a concurrent session switched it. Abort, do not merge." >&2
  exit 1
fi
git merge --no-ff "$BRANCH" -m "[auto-merge] {one-line summary}

Fixes #{issue}
Fixes #{second-issue}"
```

Then, back inside `$GROUP_WORKTREE` — not the main checkout, which the `worktree.always` gate denies a push from even after `close-run` (both checkouts share the same underlying `.git`, so pushing the just-merged `$DEFAULT_BRANCH` ref from the worktree pushes exactly what the main checkout just merged):

```bash
git -C "$GROUP_WORKTREE" push origin "$DEFAULT_BRANCH"
```

One `Fixes #{issue}` line per record in the group. The explicit `--no-ff` guarantees a real merge commit exists even when the branch would otherwise fast-forward — this is what the `[auto-merge]` tag lands on, and the same commit message carries the closing keyword per "Close-via-merge" in `_shared/issue-claims.md`, so no separate carrier commit is needed for this path. **If the merge conflicts:** conflict resolution requires judgment a headless run can't supply — abort the merge (`git merge --abort`) and fall back to the normal `auto:build`-only path (present the Review Console, wait for a human), logging why the auto-merge path was abandoned.

Log to `decisions.md`:
`AUTO {time} — Auto-merge: group [{issues}], assess-agent-autonomy verdict auto-merge for every member (see each member's RATIONALE). Merge commit: {sha}. Reversibility: high (git revert).`
Attach the full Review-Console-equivalent summary (whatever `/wrap-up` already produced) to a `PushNotification` as a non-blocking FYI — nothing wrap-up found is dropped, only the wait for a click is skipped.

**Any layer fails:** proceed exactly as the `auto:build`-only path would — present the normal Review Console, wait for a human.
