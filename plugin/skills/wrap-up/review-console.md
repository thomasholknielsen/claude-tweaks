# Wrap-Up Review Console — Phase 4 (CLOSE)

The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). One consolidated batch surfaces everything that was auto-decided or staged during the pipeline, plus skill update proposals, leftover-work routing, queue writes, and end-of-pipeline cleanup — all the friction that used to live mid-flow now lands here.

## When to run

- **Every mode — `auto`, `hybrid`, interactive, standalone** — run whenever a pipeline run directory exists for this work, which is every run from Phase 1 onward (`SKILL.md`'s "Establish the run directory (unconditional)"). Mode is not a condition on this console; the run directory is.
- **`MULTISPEC_REVIEW_DEFER=1`** — the one exception: **skip**. The consolidated multi-spec Review Console at `/flow` end-of-run will read this spec's `decisions.md` + `staged/` and surface everything in one place. See `flow/multispec-review-console.md` in the `/claude-tweaks:flow` skill's directory, and the Multi-spec defer protocol below.

In interactive and standalone runs this console replaces the batch decision the report template used to present after it — same tables, same single terminal `AskUserQuestion` (Approve all / Override / Stop). Approve all now resolves `Q#`/`M#`/`U#` to their own stated defaults directly, with no further prompts; choosing Override is what still drills each item — `_shared/batched-item-drill.md` for `Q#`/`M#`, `_shared/upstream-feedback-batch.md` for `U#` (see `review-console-interactive.md`'s Hard requirements). `summary-template.md` now renders only the record of what was decided here, never a second decision point.

**Hard gate.** Check the response you are about to send: does it already contain the numbered console tables as literal rendered markdown, with a row for every item? If not, render them now, in this response, before the tool call.

## Dry-run mode (`--dry-run`)

When `--dry-run` was passed (see `SKILL.md`'s Phase 1 Flags subsection), run every analysis step normally — Phases 1-3, and the Auto-merge short-circuit's content-judgment verdict below — but treat everything from this point forward as preview-only:

- Skip the Auto-merge short-circuit's actual `git merge --no-ff` / `git push` even when both layers pass — log the verdict and what would have merged, then fall through to rendering the console below as a normal (non-merging) run.
- Skip that same branch's acceptance labeling — no `demo:pending` label write and no Verification Brief comment. Compose the brief and print it as a preview line instead. It is a network write to a live record, so it is preview-only for the same reason the merge is; the bullet above names only the two git commands because they were the only writes on that path when it was written.
- Present the console tables exactly as usual, but every action under "On approval" and "On override" becomes a printed preview line instead of an executed one — no `git apply`, no `git revert`, no `git commit`, no `gh issue create` / `local-store.js` write, no cleanup deletion, no skill-file write.
- Queue writes (`Q#`), Memory updates (`M#`), and Upstream feedback (`U#`, via `_shared/upstream-feedback-batch.md`'s chunked presentation) all still render for visibility, but their `AskUserQuestion` call(s) are skipped — each item renders as "would create: {content}" instead. Under `--dry-run`, no memory file is ever written and `/claude-tweaks:feedback --pre-confirmed` is never invoked.
- Log to `decisions.md`: `AUTO {time} — Dry-run: {N} items would have been applied; 0 applied (--dry-run).`
- After presenting, stop — do not proceed to the phase-trace report or Phase 4's real execution step; report the preview as the run's final output.

## Auto-merge short-circuit

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
`AUTO {time} — Fast-lane auto-merge: issue #{n}, assess-agent-autonomy verdict auto-merge (see RATIONALE), pr-first-merge outcome {merged|armed|pending-review}. {Merge commit: {sha}. Reversibility: high (git revert). | Reversibility: n/a (nothing merged yet).}`

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
`AUTO {time} — Fast-lane auto-merge: issue #{n}, assess-agent-autonomy verdict auto-merge (see RATIONALE). Merge commit: {sha}. Reversibility: high (git revert).` — or, on the `manifesto-authorized-merge.md` path, its own tag and log line instead

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

## Multi-spec defer protocol

When `MULTISPEC_REVIEW_DEFER=1` is set (by `/flow` multi-spec orchestration):

1. Do NOT present the console
2. Do NOT apply or revert any staged items — leave `staged/` and `decisions.md` untouched in the per-spec subdirectory
3. Append a final entry to this spec's `decisions.md`:
   ```
   AUTO {time} — Review Console deferred to multi-spec consolidated console. Per-spec staged items: {count}. Auto-decisions: {count}. Parent run dir: {MULTISPEC_PARENT_DIR}.
   ```
4. Proceed to the phase-trace report — the per-spec summary still renders, but its "Review Console" row reads `deferred — see multi-spec consolidated console`
5. Skip the run-directory archival in Phase 4's cleanup planning — the parent `/flow` orchestration owns archival of the multi-spec parent dir after its consolidated console completes

This is the *only* condition under which `/wrap-up` skips the Review Console when a run directory exists. Every single-spec run — in any mode — always runs the per-spec console.

## Locate the pipeline run directory

See `_shared/pipeline-run-dir.md` for the resolution order and bash snippet. Resolution is unchanged; an empty result is **unreachable after Phase 1**, which creates a run directory on every run when none was inherited. If it happens anyway, do not skip the console — treat it as the prose-fallback case: present the same findings inline in this response, gathered from what this run itself produced rather than from `decisions.md` and `staged/`, and take the same terminal decision below.

## Read inputs

1. `decisions.md` — auto-decision log
2. `staged/` directory — patches and proposals awaiting decisions
3. `config.yml` — the Manifesto answers (for context)
4. `events.jsonl` — hook-recorded typed events; surface `wd-deny`, `wd-push-mismatch`, `contract-violation`, and `gate-denial` events

## Ledger narrowing auto-file (runs before rendering)

Read `ledger-narrowing-auto-file.md` and follow it before building the tables below — when `_shared/autonomy-ceiling.md`'s `queueWriteAutoFile` capability is unlocked, a staged queue-write proposal is created directly and logged as `AUTO` (under **Auto-applied**) instead of waiting for Queue writes' per-item approval.

## Pending-review branch durability

No longer a separate step. Under `integration-model: pr-first`, `_shared/pr-early-run-lifecycle.md` opens this run's draft PR at run start, and every phase-exit push since (`_shared/git-discipline.md`) keeps it current — a run parking at `pending-review` already has a live, up-to-date PR with nothing left to push. The old dispatch-only durability procedure protected exactly these runs, which now get this for free, so nothing runs here.

<!-- local-merge-fallback --> Under `local-merge` this was never populated either — its scope guard required the dispatch-claim branch to match and dispatch requires a forge, which `local-merge` runs don't have. A `local-merge` run that parks stays resident in the session that built it, unchanged.

## Auto-resolution short-circuit (`consoleAutoResolve`)

This is the tier split for headless firings: `supervised`/`trusted` keep today's resting state — the console below renders as a blocking prompt that a headless run never answers, landing on `pending-review`. `unattended` is the only tier that completes without a human.

Resolve the ceiling once — `CEILING=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values autonomy)` — and check `bookkeepingPermissions(ceiling).consoleAutoResolve` (`bin/lib/issues/autonomy.js`, granted at `unattended` only — see `_shared/autonomy-ceiling.md`). When **not** granted, skip this section entirely and proceed to "Present a real stop" below — the ordinary `supervised`/`trusted`/interactive path, unchanged. When `--dry-run` was also passed, its preview-only behavior (above) takes precedence regardless of ceiling — nothing here executes a real write.

When granted, render the console as an **informational report**, not a prompt: every section below still appears (Auto-applied through Cleanup actions, `Q#`/`M#`/`U#`, Refused rows), each row stamped `AUTO-RESOLVED` — nothing dropped. Then resolve every item per its stated default, **zero** `AskUserQuestion` calls:

- Every batch-section item (Auto-applied through Cleanup actions) resolves as if "Approve all" had been chosen. **The merge half of that decision defaults to merge** (`integration-model: pr-first`'s "Approve all + merge" variant, never "leave PR open") — `unattended` authorizes full completion, not a park; `local-merge` proceeds to branch-finish the same way.
- Every `Q#`/`M#` item resolves to `Apply` — its pre-checked default in `_shared/batched-item-drill.md`. Refused rows are never auto-resolved (`refused-proposals.md`).
- Every `U#` item resolves to **filed**, not its usual unchecked/declined default. `consoleAutoResolve` means "apply the Approve-all default to everything," not "apply the Override-drill defaults" — and Thomas's explicit direction (#347's Decision Rationale) is that upstream feedback auto-files at `unattended` exactly like `M#`/`Q#`. This is the one point where `unattended`'s resolution diverges from what "Approve all" resolves at every other tier, where `U#` stays unchecked/declined by default (see `review-console-interactive.md`'s Hard requirements).

Execute each resolution via the normal "On approval" procedure below. Two differences from a human-driven "Approve all": log one `AUTO {time} — Review Console: auto-resolved {item}. Reversibility: {…}.` line per item to `decisions.md` instead of relying on a user answer to imply it, and **retain `staged/` files** rather than deleting/consuming them on apply — they stay as revert artifacts, the same way the auto-merge short-circuit's own commit is still revertible. Send one consolidated `PushNotification` summarizing the run, at the same point the auto-merge short-circuit sends its own FYI (`_shared/autonomy-ceiling.md`'s Notification section) — one notification for the whole run, never one per item.

After resolving, proceed directly to the phase-trace report — skip "Present the console" (`review-console-interactive.md`) and its `AskUserQuestion` call entirely.

## Present a real stop

Reached only when the Auto-resolution short-circuit above did not resolve and return, and
`--dry-run` did not already stop. Read `review-console-interactive.md` in this skill's directory
and follow it in full: Console-on-PR routing, the Numbering rules, "Present the console"'s table
render + terminal `AskUserQuestion`, "On override," "On stop," and the full Hard requirements.
That file's "On approval" branch invokes this file's own "On approval" section below — the two
files share that one procedure since the Auto-resolution short-circuit above also depends on it.

## On approval (option 1)

1. Apply all staged items in `staged/` for items 5–7 per `_shared/staged-patch.md`: `git apply` while the diff still fits; a stale diff — expected once `/simplify`, polish, or a fix wave moved the target — is re-derived from its `Target:`/`Invariant:` preamble, never dropped silently
2. Apply skill updates and create new skills (items 11–12, from the Skills curation row)
3. Apply documentation updates (item 13, from the Docs curation row) — including any approved missing-doc scaffolding (D2) and restructural docs-health filings (D1)
4. Apply journey updates (item 14, from the Journeys curation row) — including any approved missing-journey scaffolding (J2) and self-review fixes (J1)
5. Apply config updates (item 15: CLAUDE.md, rules, ADRs) — including any CLAUDE.md findings staged by the CLAUDE.md & rules curation row, which are always offered, never auto-applied
6. Execute cleanup actions (items 18 onward — one per row in `cleanup-procedures.md`'s canonical list, which is what sets the last number) — Phase 4's execution step picks these up. Under `pr-first`, the worktree/branch-finish row (`cleanup-procedures-execution.md` Section C) routes on which Approve-all variant was chosen: "Approve all + merge" runs `_shared/pr-first-merge.md`'s procedure (`tag: fast-lane`, no prompt — same procedure the Auto-merge short-circuit above uses); "Approve all, leave PR open" skips the merge attempt, landing on `pending-review` with the PR left ready. Under `local-merge`, cleanup runs unchanged (Section C's own `/superpowers:finishing-a-development-branch` handoff)
7. For each `Q#` queue write, choosing Approve all resolves it to its pre-checked `Apply` default directly — no separate prompt; choosing Override instead resolves it via the multiSelect chunk (or the free-text Edit override). On Apply (or Edit, after the modification): run `refused-proposals.md`'s check first (a refused item is never created), then create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file (`staged/leftover-{slug}.md` for leftover-routed items; other sources use their own staged-file shape). Skip (Override only) drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
8. For each `M#` memory update, choosing Approve all resolves it to its pre-checked `Apply` default directly — no separate prompt; choosing Override instead resolves it via the multiSelect chunk (or the free-text Edit override). On Apply (or Edit, after the modification): write the memory file and append its `MEMORY.md` index line per `_shared/learning-routing.md`'s "Memory write procedure (D4)" at batch approval (or auto-resolution — see the Auto-resolution short-circuit above), reading the proposed file and index line from the item's staged file (`staged/wrap-up-memory-{N}.md`). The memory directory comes from the invoking assistant's own system prompt — never derived or guessed. This write lands outside the repository, so it is not part of the wrap-up commit below. Skip (Override only) drops the proposal — log the decline as in step 7.
9. For the `U#` upstream feedback rows, choosing Approve all resolves every row to its unchecked/declined default directly — no separate prompt, and nothing is filed (see `review-console-interactive.md`'s Hard requirements; the Auto-resolution short-circuit above is the one exception, where `unattended` files every `U#` row instead). Choosing Override instead presents them via `_shared/upstream-feedback-batch.md`'s shared batch contract (chunked `multiSelect` calls) — the body rendered in that table (read from `staged/wrap-up-upstream-{N}.md` when the table was built) **is** the approved snapshot. For each item checked in the resulting chunk(s): invoke `/claude-tweaks:feedback --pre-confirmed`, passing both the staged-file path and that approved snapshot for its drift check; its Step 6 scrub always reruns as a separate safety net regardless of the drift result; on drift it falls back to its own normal `AskUserQuestion` confirm for that one item. An item left unchecked (Override) or resolved by the Approve all default is declined per the shared contract's decline rule — log the decline as in step 7.
10. Commit with a wrap-up message
11. Proceed to the phase-trace report

For "On override" and "On stop" (options 2 and 3 — reachable only from a real rendered stop), and
the full Hard requirements, see `review-console-interactive.md`.

## Empty-console fast path

If `decisions.md` has zero entries AND `staged/` is empty AND there are no skill/config updates AND no cleanup actions apply AND no queue writes, memory updates, or upstream feedback proposals are pending, skip the console entirely. Log "Review Console: nothing to review" and proceed to the phase-trace report.

Cleanup rows that are unconditional bookkeeping — run-dir archival, `cleanup-procedures.md` item 8 — do **not** count as cleanup actions for this test; archival executes regardless, undisplayed. Without that carve-out the fast path could never fire, since item 8's condition now holds on every run.
