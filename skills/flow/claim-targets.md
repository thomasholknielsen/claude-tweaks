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
  This one condition covers three distinct callers without branching on which one it is: a
  dispatched group's *second* Task call (already claimed by the first call's Step 2.8 run under
  the same minted directory), a failure-path `wrap-up`-only teardown call
  (`dispatch/two-call-gate.md` section 5's `PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow
  {target} wrap-up`), and a human resuming a parked run
  (`PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" wrap-up` per
  `dispatch/SKILL.md`'s Reporting section). Do not special-case these three separately — they
  collapse to this one check by construction, since all three inherit the same
  `PIPELINE_RUN_DIR` the original claim was written under.

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
to Step 3 for any of them. For each target, read-classify-write exactly as
`_shared/issue-claims.md`'s "The lock" section describes (`gh` path shown; MCP path is the same
read-then-classify-then-write over the MCP tools — see `_shared/github-write-transport.md`):

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
post the claim comment (`claimPayload`'s `commentBody`):

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
  far this step (reason `never-started: file-overlap group partial claim`, mirroring
  `claim-outcomes.md`'s original partial-claim rule), then stop with the same message shape as
  above, naming every contested target.

- **Multi-target run with `keep-going`** — downgrade the contested target to a skip (drop it from
  the target list, note it, proceed with the remainder), consistent with `keep-going`'s existing
  meaning elsewhere in flow (`multi-spec.md`) — continue past a per-target failure rather than
  aborting the whole run.

Any other `gh`/MCP failure during claim (not a classification-based contest): skip that target,
log, continue to the next — same as `claim-outcomes.md`'s original "Any other `gh` failure"
handling.
