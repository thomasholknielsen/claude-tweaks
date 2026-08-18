# Auto-Merge Short-Circuit

Cited from `wrap-up/review-console.md`'s "Auto-merge short-circuit" heading — read this file
whenever that heading's applicability condition (below) holds. Extracted out of
`review-console.md` (#552) so a run for a record with no `auto:merge` grant and no
`merge-authorization: pre-authorized` override never loads this procedure at all — the
common case, since most records carry `auto:build` alone.

When this run's spec has a materialized header (`record:` field present in
`${RUN_DIR}/work/*-spec.md` — see `skills/flow/materialize.md`) AND EITHER the issue's **live**
labels carry `auto:merge` (re-fetch via `gh issue view --json labels` — the header's `grants:`
field is a snapshot for audit only) OR `manifesto-authorized-merge.md`'s applicability check
passes (the `merge-authorization` lever, #715), check the two-layer gate below — the single-record
version of `skills/dispatch/SKILL.md`'s own group-scoped "Auto-merge gate," whether or not
`/claude-tweaks:dispatch` was involved:

1. **Authorization** — `auto:merge` is present on the live-fetched labels, OR `manifesto-authorized-merge.md`'s applicability check passed (true by construction once this branch is reached under either condition)
2. **Content judgment** — invoke `/claude-tweaks:assess-agent-autonomy` in `merge-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "merge-check #{n}")`), which weighs the diff's content, `/review`'s findings, and a test-exclusion-aware blast-radius summary holistically. The verdict must be `auto-merge` to proceed.

**Both layers pass — acceptance labeling runs first, before the merge.** This branch bypasses
Phase 4's execution step, which is where acceptance labeling normally happens, so this branch must
perform it itself. Run `verification-brief.md` now, starting from its **Routing** section, exactly as
execution would. This short-circuit closes exactly one record, so pass that record's own number as
`$CLOSING_SUB_ISSUES` — the one-element closing sub-issue set that file's **Self-inclusion rule**
reads. That file owns the routing: a record with a resolvable parent goes to its
Parent-Gate Procedure (the parent gets the one gate; this sub-issue gets none), and
everything else goes through its Steps 1-4 — bootstrap, observation-plan authoring, the Step 2.5
safety-net gate, sourcing, posting, then `demo:pending`. Do not apply `demo:pending` to this record
independently of that routing: an `auto:merge`'d sub-issue is exactly the population
`_shared/github-pr-scan-acceptance.md`'s `parent-gate` backstop scope exists to catch.

Order is load-bearing: the merge below carries the `Fixes #{issue}` closing keyword, so once it
lands the record is closed. Labeling before the merge is what keeps the record's acceptance state
correct on a path where no human ever sees the console.

The record-mode precondition is satisfied by construction — this short-circuit already requires a
materialized header with a `record:` field. `auto:merge` governs merge timing only and has no
bearing on whether the record gets `demo:pending`; `_shared/work-record.md` states that an
`auto:merge`'d record still gets it on its now-closed issue, enabling retrospective sign-off, and
this branch is the only place that can honor it.

**Dispatch-claim branch — check this before merging anything.** Read the claim blob at
`claims/issue-${ISSUE}.json` on `claims-registry` (per `_shared/issue-claims.md`'s "The lock")
and check whether its `runId` equals `basename($PIPELINE_RUN_DIR)`. A match means this record is
claimed under the very run this session is executing — either `/claude-tweaks:dispatch` Step 4
minting `PIPELINE_RUN_DIR` before its Task calls, or a human resuming that same claimed run — this
call is (or stands in for) one of dispatch's own Task() calls: cwd-pinned to the worktree it
inherited, with no path to the main checkout. This is what routes a dispatched **singleton**'s
merge decision through this file's own short-circuit rather than `settle-and-merge.md`'s
group-scoped Auto-merge gate. No claim, or a claim held under a different run id, means this is a
genuine top-level human-run session — fall through to the interactive path below.

**`integration-model: pr-first`:** the checkout restriction below doesn't apply — `gh pr merge`
needs no checkout. Run the merge procedure below exactly as the interactive path does — the
dispatch-claim branch matching changes nothing about how this branch merges, only that
`task-prompt.md`'s reporting format carries the outcome back (`merged`/`armed`/`pending-review`)
instead of this file's own `PushNotification`.

**`integration-model: local-merge`:** the checkout restriction is real — do not run the merge
procedure below. Stop here instead: report `OUTCOME: ready-to-merge` per `task-prompt.md`'s
second-call template — `dispatch/settle-and-merge.md`'s local-merge fallback is what actually
merges, in dispatch's own thread.

Everything from here through "Release-reason mapping" below applies when the dispatch-claim branch
does **not** match (a genuine top-level, human-run session) **or** matches under `pr-first` — the
local-merge stop-and-relay branch above is the one exception.

Skip the blocking wait and merge directly — bypass the interactive
`/superpowers:finishing-a-development-branch` handoff entirely; a verdict already exists.

**`integration-model: pr-first` (`_shared/integration-model.md`):** run `_shared/pr-first-merge.md`'s
procedure now — `tag: {tag}` (see `manifesto-authorized-merge.md`'s Tag selection section) (distinct from dispatch's `auto-merge` tag; `/help`'s
auto-merged-this-week count keys on all three, `_shared/github-pr-scan.md` `triage-queue` item 3),
`issue-list` this one record, `summary` the record's own title. No checkout is needed — `gh pr
merge` runs directly, which is what retires this section's pre-#411 `git -C "$RUN_DIR"`
worktree/branch resolution (#299: that resolution anchored against the run dir, not the worktree —
a defect that simply cannot recur once there is no checkout resolution step to get wrong; see the
local-merge branch below for that defect's full account, since local-merge still uses the
resolution it fixed). Still generate this console's full content (Auto-applied / Skill updates /
Configuration updates sections, per `review-console-interactive.md`'s "Present the console") and
attach it to a
`PushNotification` as a non-blocking FYI — nothing this console would have shown is discarded,
only the wait for a live approval is skipped. Log to `decisions.md`:
`AUTO {time} — Fast-lane auto-merge: issue #{n}, assess-agent-autonomy verdict auto-merge (see RATIONALE), pr-first-merge outcome {merged|armed|pending-review}. {Merge commit: {sha}. Reversibility: high (git revert). | Reversibility: n/a (nothing merged yet).} [lever: auto-merge-max-lines={value} ({source}); auto-merge-max-files={value} ({source}); merge-sensitive-paths={value} ({source})]`

**`integration-model: local-merge`:** before merging, clear this run's worktree
assignment as `flow/worktree-merge.md`'s reconciliation does
(`node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"`) so
the merge, landing in the main checkout, isn't denied as a wrong-checkout
commit.

`close-run` satisfies E1 only. Under `worktree-always: true` the separate,
run-independent gate applies, covering `git push` and `git commit` — so
the push below **cannot** run from the main checkout and **must not** be
chained onto the merge (the gate inspects the whole command string up front,
so a compound call is denied and the merge never runs either). `git merge`
itself isn't covered, so it runs in the main checkout normally. Same two-call
shape as `dispatch/settle-and-merge.md`'s local-merge fallback;
`_shared/policy-schema.md`'s `worktree-always` block lists what the gate
intercepts.

**Shell state does not survive between the two calls** — each Bash call gets
a fresh shell, so a variable set in the first is empty in the second. Read
the values first and substitute them **literally** into the second call;
don't carry them in shell variables.

```bash
node -e "console.log(require('$RUN_DIR/run-state.json').worktree)"   # -> {worktree-path}
git -C "{worktree-path}" branch --show-current   # -> {branch}
node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values integration-branch
gh api "repos/{owner}/{repo}" -q .default_branch # only when the line above came back empty
```

The first command reads `{worktree-path}` from `run-state.json`'s own `worktree` field —
`record-worktree` (`build/worktree-setup.md` Step 4.5) stamped it there; it is the one value that
actually names the worktree, unlike `$RUN_DIR` itself (**#299**: `$RUN_DIR` sits inside the main
checkout per `_shared/pipeline-run-dir.md`'s anchoring rule, so a bare `git -C "$RUN_DIR"`
silently resolves the main checkout's own toplevel/branch — never the feature branch). The third
and fourth commands together resolve `{integration-branch}` — the branch this project integrates
work into, which is not always the GitHub default (see `skills/_shared/integration-branch.md` for
the full precedence, including its git-inference rank, deliberately skipped here, which would
consider whatever branch the main checkout currently has checked out — a concurrent session
switching that is precisely what the guard below catches). Take the resolver's output when
non-empty; otherwise fall back to `gh api`. Substituting the wrong one here merges into a branch
nobody develops on (#132).

**First call — merge, from the main checkout.** `{integration-branch}` is the value
just resolved:

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "{integration-branch}" ]; then
  echo "Main checkout is on '$CURRENT', not '{integration-branch}' — a concurrent session switched it. Abort, do not merge." >&2
  exit 1
fi
git merge --no-ff {branch} -m "[{tag}] {one-line summary}

Fixes #{issue}"
```

**Second call — push, from inside the worktree.** Both placeholders are the
literal values read above:

```bash
git -C "{worktree-path}" push origin {integration-branch}
```

Naming the branch explicitly is required: a bare `git push` from the worktree would push the
*feature* branch, since that is what is checked out there. Pushing the same branch the first call
merged into is what publishes the merge; a different one leaves it stranded locally.

The explicit `--no-ff` guarantees a real merge commit exists even when the
branch would otherwise fast-forward — this is what the `{tag}` tag
lands on, and the same commit message carries the `Fixes #{issue}` closing
keyword per "Close-via-merge" in `_shared/issue-claims.md`. Still generate
this console's full content (Auto-applied / Skill updates / Configuration
updates sections, per `review-console-interactive.md`'s "Present the console") and attach it to a
`PushNotification` as a non-blocking FYI. Nothing this console would have
shown is discarded — only the wait for a live approval is skipped. After the
push, run `_shared/pr-first-merge-post-merge.md` Step 4.1 with `--ref {integration-branch}` (staged file + closing-report line only).

Console content is not all of Phase 4's execution step — acceptance labeling is neither console
content nor a `cleanup-procedures.md` cleanup item, which is why it was silently dropped from
auto-merge until the labeling step above was added. Check any future addition to that execution
step against this branch explicitly; a claim true about one category is not evidence about another.

**If the merge conflicts:** conflict resolution requires judgment a headless
run can't supply — abort the merge (`git merge --abort`) and fall back to
rendering the console normally, exactly as an `auto:build`-only record would,
logging why the auto-merge path was abandoned.

Log to `decisions.md`:
`AUTO {time} — Fast-lane auto-merge: issue #{n}, assess-agent-autonomy verdict auto-merge (see RATIONALE). Merge commit: {sha}. Reversibility: high (git revert). [lever: auto-merge-max-lines={value} ({source}); auto-merge-max-files={value} ({source}); merge-sensitive-paths={value} ({source})]` — or, on the `manifesto-authorized-merge.md` path, its own tag and log line instead

**Release-reason mapping.** A `merged` outcome (either model) counts as Section E's `merged:`
outcome (`skills/wrap-up/cleanup-procedures-execution.md` Section E step 2) — the fast-lane path never runs
`/superpowers:finishing-a-development-branch`, so treat it exactly as if that skill had reported
`merged`, with `$LINK` set to the merge commit sha (local-merge) or the PR url (pr-first). Grant
removal (Section E step 6) follows the same `merged:` outcome. **`pr-first`'s `armed`/`pending-review`
outcomes are not `merged`** — nothing in Section E runs yet on either; claim, worktree, and run-dir
cleanup all wait for `merged` evidence, which the reconciler picks up convergently later
(`_shared/pr-first-merge.md`), same as any other pr-first run whose merge hasn't landed
synchronously.

**Any layer fails:** proceed to render the console normally, exactly as an
`auto:build`-only record would — no different from any other pipeline run.

This check does not apply to `MULTISPEC_REVIEW_DEFER=1` runs — an `auto:merge`-granted
record still gets the normal, fully-blocking consolidated Review Console, same as any other spec
in the batch. No dispatch-claim branch or equivalent auto-merge gate exists for the multi-spec
console today — it is exclusively a human-run-batch surface, never a dispatch one (dispatch
Step 5 dispatches groups one at a time). `skills/dispatch/SKILL.md`'s own "Auto-merge gate" is
the mechanism a dispatched group actually uses: a singleton via the dispatch-claim branch above,
a bundle via `settle-and-merge.md`'s own group-scoped gate directly; this file's own direct-merge
procedure is reachable only by an interactive, human-run single-record `/flow` (or, per the
dispatch-claim branch above, a session standing in for one).

The trailing `[lever: …]` field on both log lines above follows `_shared/auto-decision-log.md`'s Lever attribution section — these are the levers the Content judgment layer's `merge-check` invocation reads (`skills/assess-agent-autonomy/merge-check.md`); `{value}` comes from that invocation's own resolver call; `{source}` needs the envelope form — re-resolve with `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" merge-sensitive-paths auto-merge-max-lines auto-merge-max-files` (no `--values`) when writing either line.
