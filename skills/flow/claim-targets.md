# Flow — Claim the Targets (Step 2.8)

Loaded by `/claude-tweaks:flow` Step 2.8, after materialize's shape gate (2.7) and before the
Config Manifesto (Step 3). Relocated from `skills/dispatch/claim-outcomes.md` — the posture
logic below is unchanged from that file; only the call site moved, per #463's identity
unification (claim identity is `basename($PIPELINE_RUN_DIR)`, never a separate variable).

## Skip-guard

Skip this step entirely (log nothing beyond a one-line note, proceed straight to Step 3) when
any of:

- The project's `work-backend` is `local-files` (per `_shared/work-record-config.md`'s config
  key table) — no claim infrastructure exists on that backend.
- The input has not yet resolved to a record reference (topic-name mode, before resolution —
  `SKILL.md`'s Input resolution case 2, still mid-search).
- **Every** named target's claim already shows `claim.runId === basename($PIPELINE_RUN_DIR)` —
  read each target's claim blob (`_shared/issue-claims.md`'s "Reading claim state") and compare.
  This catches a resume invocation whose step list still contains `build` or `test` (so the
  condition below doesn't apply) where this same run already holds the claim from an earlier,
  interrupted pass — e.g. `PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow {target} test` resuming
  after a build-gate failure that left the claim held per `failure-cards.md`. The resumed
  invocation inherits the same `PIPELINE_RUN_DIR` the original claim was written under, so the
  blob still reads `'live'`/`'stale'` under this run's *own* identity and "Reading claim state"
  exposes a non-null `claim` to compare against — without this check, the claim attempt below
  would read that as contested and self-block a run that already owns the record. If a target's
  claim-blob read is itself unreadable or fails during this check, treat that target as **not**
  already owned by this run — fall through to the claiming procedure below, whose own fail-closed
  handling (`'unreadable'` fails closed to contested) then applies; a read failure at this
  skip-guard stage must never cause an incorrect skip of a target this run doesn't verifiably
  already own.
- **The resolved step list (`SKILL.md` Step 1, item 4) contains neither `build` nor `test`** — a
  teardown-only or resume-from-review-onward invocation has nothing left to build, so there is
  nothing left to lock. This covers the invocation shapes that would otherwise reach the claim
  attempt below with no self-owned `runId` to match against the condition above: a dispatched
  group's *second* Task call (`review,polish,wrap-up` — already claimed by the first call's
  Step 2.8 run), and any `wrap-up`-only invocation, whether a human resuming a parked run
  (`PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" wrap-up` per
  `dispatch/SKILL.md`'s Reporting section) or the failure-path teardown-only call
  (`dispatch/two-call-gate.md` section 5's identical invocation shape).

  Keying this on step-list shape rather than on claim state is deliberate, and closes a real
  window. Settle releases the claim before the teardown call reaches this step, so that call would
  otherwise find no `runId` to match and fall through to a reclaim — but between Settle's release
  and that reclaim the record sits genuinely unclaimed and re-eligible, and a concurrent
  `dispatch next` firing could claim it first. This step would then see `'live'` under someone
  else's `runId` and contest, stopping the pipeline before Step 3 with wrap-up never run and the
  worktree never torn down, stalling `dispatch/SKILL.md`'s sequential per-group worktree loop
  (`[IL-116]` forbids a raw removal as an escape hatch). Skipping Step 2.8 outright for any
  `wrap-up`-only step list closes that window entirely rather than narrowing it.

  Skipping loses no safety: `wrap-up`'s own Section E release step still ownership-checks
  (`claim.runId === basename($PIPELINE_RUN_DIR)`) before releasing and correctly no-ops when this
  run doesn't own the claim — this only stops re-acquiring a lock nobody needs for a run that will
  only run cleanup. The condition is also deliberately broad, so it matches a human directly
  invoking `/flow #{n}` with a hand-picked non-build/test step list (e.g. `review,polish`) against
  a record this run has never claimed. That's intentional: a step list lacking both `build` and
  `test` has nothing to build regardless of who invoked it, so there is no work here a lock would
  need to protect.

Otherwise, proceed below.

## Resolve this run's identity

Step 2.8 runs *before* Step 3 (Config Manifesto) would otherwise create or adopt a run
directory, so the claim needs an identity to claim under before one necessarily exists yet:

- **`$PIPELINE_RUN_DIR` already set** (a dispatched run — `dispatch/SKILL.md` Step 4 mints the
  group's directory, mkdir-only, before either Task call) — use it as-is. Do not create
  anything; Step 3 will adopt this same directory per `steps-and-gates.md`'s
  Adopting-an-inherited-run-directory case 1 or 2.
- **`$PIPELINE_RUN_DIR` unset** (a direct human invocation) — mint it now, the same mkdir-only
  operation `dispatch/SKILL.md` Step 4 performs for a dispatched group: derive `$RUN_ROOT` via
  `_shared/pipeline-run-dir.md`'s Anchoring section (`git rev-parse --git-common-dir`, then its
  parent directory), create `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`
  (mkdir only — no `config.yml`, no `decisions.md`; Step 3 writes those when it adopts the now-set
  `PIPELINE_RUN_DIR` per case 2). Export it as `PIPELINE_RUN_DIR` for the rest of this pipeline
  invocation. `{spec-slug}` follows `manifesto.md`'s Path conventions (`spec-{N}` single, dash-joined
  multi, or a topic slug).

Either way, `basename($PIPELINE_RUN_DIR)` is this run's claim identity for every target below.

## File-overlap warning (never a gate)

Before claiming, check whether any named target file-overlaps an open, unclaimed record via
`groupByFileOverlap` (`bin/lib/issues/grouping.js`) run against the same open-queue read
`dispatch/SKILL.md` Step 2 uses (open + no `bot:*`, not filtered to `auto:build` here — this is
informational, not a selection). On a hit, surface one line per overlapping pair:

```
Note: #{target} overlaps open #{other} (untracked file overlap) — consider
/claude-tweaks:flow #{target},#{other} to claim and build them together.
```

Proceed with only the named target(s) regardless — this is a warning, never a gate, and never
auto-expands the human's explicitly named list. No new grouping computation is added to flow:
this reuses the existing module dispatch and `/help` already call; flow gains no queue-wide
knowledge beyond this one warning check.

## Claim every named target, all-or-abort

Per `_shared/issue-claims.md`'s group-claim rule: claim **all** named targets before proceeding
to Step 3 for any of them.

**Before attempting to claim, per target:** check whether this run already owns it — read that
target's claim blob (the same "Reading claim state" procedure the skip-guard above uses) and
compare `claim.runId === basename($PIPELINE_RUN_DIR)`. If it matches, this run already holds the
claim for that target: skip claiming it and move to the next target in the loop, rather than
re-attempting a claim, since `classifyClaimBlob` has no self-claim exemption and would classify
this run's own `'live'` blob as contested against itself. This is a per-target check inside the
claiming loop, distinct from the skip-guard's own all-targets check above (which decides whether
to enter Step 2.8 at all) — a multi-target run resumed after a partial interruption can have some
targets already owned by this run and others not yet claimed, in which case the skip-guard's
all-targets condition correctly doesn't fire (there is still real claiming work to do for the
unowned targets) and this per-target check is what prevents a redundant, spuriously-contested
reclaim of the targets already held.

For every remaining target in one call, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/claims.js" claim "$(IFS=,; echo "${TARGETS[*]}")" --run-id "$(basename "$PIPELINE_RUN_DIR")" ${KEEP_GOING:+--keep-going}
```

`bin/claims.js claim` (`bin/lib/issues/claim-engine.js`) is the read-classify-write loop in one
command: branch bootstrap, the read-classify-write per target described below, the bootstrap-then-add
`bot:in-progress` label + claim-comment mirror on success, and this section's own
group-claim-all-or-abort release-and-stop (or, with `--keep-going`, the downgrade-to-skip) — all
mechanical, replacing the hand-scripted per-run loop this section used to describe inline. It
prints one JSON envelope (`{claimed, contested, errored, released}`) — branch the pipeline's own
success/contest handling on that envelope rather than re-deriving classification state by hand.
`gh` absent falls back to the MCP path: the same read-then-classify-then-write over the MCP tools
— see `_shared/github-write-transport.md`.

The read-classify-write mechanics the CLI implements, unchanged from before it existed (kept here
as the contract of record — `_shared/issue-claims.md`'s "The lock" section is the canonical
description; this is not a second, independently-maintained copy of the algorithm, only of the
call shape a manual/MCP-fallback session would need):

```bash
gh api "repos/{owner}/{repo}/contents/claims/issue-${ISSUE}.json?ref=claims-registry" -q '.content' | base64 -d > "/tmp/flow-claim-${ISSUE}.json"
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  const content = require('fs').readFileSync(process.argv[1],'utf8');
  console.log(JSON.stringify(c.classifyClaimBlob(content, Date.now())))" "/tmp/flow-claim-${ISSUE}.json"
```

Branch on the classification, per `_shared/issue-claims.md`'s "Failure posture" table (not
restated here): `'absent'` → create-only write, succeeds. `'tombstone'`/`'stale'` → conditional
write (sha from the read), succeeds — a legitimate re-claim, not a contest. `'live'` → contested.
`'unreadable'` → fails closed to contested (treat as live).

**On success for a target:** bootstrap-then-add `bot:in-progress` (per `_shared/label-bootstrap.md`),
post the claim comment (`claimPayload`'s `commentBody`) — both best-effort mirror steps `bin/claims.js`
already performs for you:

```bash
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(c.claimPayload({issueNumber:Number(process.argv[1]),
  runId:process.argv[2],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()}).commentBody)" "$ISSUE" "$(basename "$PIPELINE_RUN_DIR")" > /tmp/flow-claim-comment-${ISSUE}.md
gh issue edit "$ISSUE" --add-label bot:in-progress
gh issue comment "$ISSUE" --body-file /tmp/flow-claim-comment-${ISSUE}.md
```

**On contest for a target** (rejected write, or classification `'live'`/`'unreadable'`):

- **Single-target run** — release nothing (nothing else was claimed), then stop the pipeline
  before Step 3 (no worktree, no run directory left behind beyond the mint from Step above, which
  the reconciler's `isOrphanedMint` sweep reclaims after 24h if it was freshly minted here):

  ```markdown
  ## Flow: Claim contested

  #{target} is already claimed by run {holder-runId} (host: {holder-host}, claimed
  {holder-claimedAt}, expires {holder-claimedAt + holder-ttlHours}).

  Wait for the claim to expire, or resume once it releases.
  ```

  No `AskUserQuestion` — there is nothing to choose between here; the pipeline cannot proceed
  with a target it cannot claim.

- **Multi-target run, default (no `keep-going`)** — release every target this run *did* claim so
  far this step (reason `never-started: file-overlap group partial claim`, per
  `_shared/issue-claims.md`'s Failure-posture table), then stop with the same message shape as
  above, naming every contested target.

- **Multi-target run with `keep-going`** — downgrade the contested target to a skip (drop it from
  the target list, note it, proceed with the remainder), consistent with `keep-going`'s existing
  meaning elsewhere in flow (`multi-spec.md`) — continue past a per-target failure rather than
  aborting the whole run.

**A transient `gh`/MCP failure during claim (not a classification-based contest)** — a network
timeout, a transport error, or any other unclassified failure while reading, writing, or posting
for a target — gets the identical all-or-abort treatment as a classification-based contest above,
not a silent skip-and-continue: **single-target run** releases nothing and stops before Step 3;
**multi-target run, default** releases every target this run *did* claim so far this step and
stops; **multi-target run with `keep-going`** downgrades just the failing target to a skip and
proceeds with the remainder. Use the same three bullets above for the release/stop mechanics —
the only difference is the message, which names the transient failure instead of a holder
identity (there is no holder to report):

```markdown
## Flow: Claim failed

#{target} could not be claimed due to a transient failure ({error-summary}), not a competing
claim. Retry once the underlying `gh`/MCP issue clears.
```

This supersedes, for this file specifically, `_shared/issue-claims.md`'s general Failure-posture
line "Any other `gh`/MCP failure during claim: drop that issue, log, continue" — that line was
written for independent-batch contexts (dispatch's old multi-group loop, `/tidy`'s sweep) where
dropping one issue and continuing is safe because each issue in that context is independent. This
section's group-claim **all-or-abort** invariant is exactly the case that general line doesn't
fit: silently proceeding to Step 3 with one named target unclaimed reopens the double-build race
this step exists to prevent.
