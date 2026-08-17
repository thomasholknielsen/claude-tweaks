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
  multi, or a topic slug). `{ISO-timestamp}` is UTC, per `_shared/pipeline-run-dir.md`'s
  ISO-timestamp rule (`date -u`).

Either way, `basename($PIPELINE_RUN_DIR)` is this run's claim identity for every target below.

## File-overlap warning (never a gate)

Before claiming, check whether any named target file-overlaps an open, unclaimed record. Read
the same open-queue set `dispatch/SKILL.md` Step 2 uses (open + no `bot:*`, not filtered to
`auto:build` here — this is informational, not a selection), then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/preflight-records.js" {target}[,{target}…] {other-open-issue}[,…] [--repo owner/name]
```

passing every named target together with that open-queue's issue numbers as positional
arguments — its `overlapGroups` output field (`groupByFileOverlap`, `bin/lib/issues/grouping.js`,
run over each fetched record's key files) is this computation; read the CLI's `--help` for the
remaining flags. On a hit — an `overlapGroups` entry pairing a named target with a number that
isn't one — surface one line per overlapping pair:

```
Note: #{target} overlaps open #{other} (untracked file overlap) — consider
/claude-tweaks:flow #{target},#{other} to claim and build them together.
```

Proceed with only the named target(s) regardless — this is a warning, never a gate, and never
auto-expands the human's explicitly named list. No new grouping computation is added to flow:
this reuses the same `bin/preflight-records.js` primitive dispatch's queue pull and `/help`
already call; flow gains no queue-wide knowledge beyond this one warning check.

## Claim every named target, all-or-abort

Per `_shared/issue-claims.md`'s group-claim rule: claim **all** named targets before proceeding
to Step 3 for any of them. One invocation claims the whole list:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/claim-targets.js" --run-id "$(basename "$PIPELINE_RUN_DIR")" \
  --targets {n}[,{m}…] [--keep-going]
```

Pass `--keep-going` only when this run is in `keep-going` mode (below); a default-mode run
(single- or multi-target) omits the flag. The CLI implements `_shared/issue-claims.md`'s "The
lock" steps 1-6 — read, classify, and the create-only/conditional/contested branch — via
`bin/lib/issues/claim-store.js`, the one contents-API implementation this CLI and
`reconcile/release-merged.js`'s release path both delegate to: the absent branch that
`_shared/issue-claims.md`'s bash prose renders as the `__ABSENT__` sentinel is, inside the CLI, a
404-status read (a normal outcome for a never-claimed target) — same classification, different
mechanism — and the `@base64d`+sha single-read (one `gh api` call decoding GitHub's
newline-embedded base64 and keeping the blob sha the conditional write needs) live inside that
one module, not restated here. It classifies each
read exactly per `_shared/issue-claims.md`'s "Failure posture" table: `'absent'` → create-only
write; `'tombstone'`/`'stale'` → conditional write (a legitimate re-claim, not a contest);
`'live'` → contested, holder identity attached; `'unreadable'` → fails closed to contested with no
holder identity (`null`). It also applies the per-target self-owned check first, scoped to
`'live'`/`'stale'` blobs: a target whose live or stale claim blob already reads
`claim.runId === basename($PIPELINE_RUN_DIR)` — this run resuming after a partial interruption —
lands in the JSON envelope's `alreadyOwned` array rather than being reclaimed or contested against
itself, since `classifyClaimBlob` has no self-claim exemption and would otherwise classify this
run's own `'live'` blob as contested against itself. A self-owned `'tombstone'` is not routed to
`alreadyOwned` — a released claim is not still held, so it falls through to the ordinary
`'tombstone'`/`'stale'` conditional-write branch and is legitimately re-claimed like any other
tombstone. On a
successful claim it bootstraps `bot:in-progress` (per `_shared/label-bootstrap.md`) and posts the
claim comment (`claimPayload`'s `commentBody`) for that target — best-effort: a label or comment
failure is logged to stderr and never un-claims the target.

This CLI is the `gh` transport only — its `deps.gh`/`deps.ghApi` shell to real `gh` (per
`gh-api-module-pattern`'s injectable-runner convention). In a `gh`-absent environment
(`_shared/github-write-transport.md`'s MCP routing), this CLI does not apply: follow
`_shared/issue-claims.md`'s "The lock" steps 1-6 directly via the MCP contents-API calls, per
target, exactly as before this CLI existed.

**Branch on exit code:**

- **0** — every target claimed (default mode), or every non-skipped target claimed
  (`--keep-going` — see below). Proceed to Step 3.
- **3** — contested. The CLI ran without `--keep-going` and stopped at the first target it could
  not claim; stdout carries `{contested: [{issue, holder}], released, releaseFailed}` —
  `released` lists every target *this invocation* had already claimed and successfully released
  before hitting the contest (empty for a single-target run, or when the contested target was
  first in the list); `releaseFailed` (`[{issue, error}]`, empty when none) names any of those
  targets whose fresh read or tombstone write failed during that release — still claimed under
  this run's identity, left to expire via the claim's own TTL rather than dropped silently. The
  CLI already attempted the all-or-abort release — nothing further to release here. Gather
  liveness evidence (below) and render the contest card using the reported `holder`.
- **4** — transient `gh` failure, same fail-fast/all-or-abort shape as exit 3: stdout carries
  `{transient: [{issue, error}], released, releaseFailed}`, release already attempted. Render the
  transient-failure card below.
- **2** — malformed invocation or missing dependency (a bad `--run-id`/`--targets` value, or repo
  resolution failed) — a bug in this call, not a claim outcome. Treat as a hard stop.

**On exit 3 or 4** — release nothing further (the CLI's `released`/`releaseFailed` already covers
the attempt; a non-empty `releaseFailed` is not this step's problem to retry — the named claim
simply rides out its TTL). When this
invocation minted the run dir itself (`PIPELINE_RUN_DIR` was unset on entry) and it still holds no
`config.yml` (never adopted), remove the minted directory immediately — an empty mint left in
place sorts newest and steals the hook fallback resolver's attribution until the reconciler's
`isOrphanedMint` sweep catches it (~24h); a dispatch-minted dir (`PIPELINE_RUN_DIR` set on entry)
belongs to the caller and is left in place. Then stop the pipeline before Step 3 (no worktree,
nothing else left behind).

Before rendering the exit-3 card, gather holder-liveness evidence — read-only, best-effort, never
more than a few seconds; absence of any artifact is evidence, not an error, and the card must
render a verdict either way — never block on the lookup:

  1. The reported `holder` JSON already carries the identity fields (`runId`, `sessionId`,
     `claimedAt`, `ttlHours`, `host`) — no extra read needed (`null` on `'unreadable'`; render
     the card's holder fields as `unknown` in that case).
  2. **Same host?** Compare the blob's `host` to `hostname` — string equality only, no
     network probing. Different → verdict is **Remote holder**; skip steps 3-4.
  3. **Worktree match:** derive the bare `spec-{ids}` portion of the holder's `runId` (strip
     the `{ISO-timestamp}-` prefix — e.g. runId `…T210742-spec-686-687` → `spec-686-687`) and
     grep `git worktree list` for that substring, locked or not — it matches both the native
     `.claude/worktrees/flow-spec-{ids}` naming (illustrated above) and the documented
     git-fallback naming (`.worktrees/flow/spec-{ids}`, `.worktrees/spec-{ids}`).
  4. **Transcript freshness:** the holder's transcript lives at
     `~/.claude/projects/<project-slug>/<sessionId>.jsonl` (path rule per
     `feedback/session-evaluation.md` — slug is the session's absolute cwd with `/`, space,
     and `.` each replaced by `-`). A session inside a linked worktree writes under the
     *worktree's* slug, not the main checkout's — check the main-checkout slug AND the
     worktree-derived slug (from step 3's match, when one exists) before declaring no
     transcript. Take the file's mtime.
  5. **Verdict:** transcript mtime within the last 60 minutes (a judgment default, not a
     protocol constant) → **Live sibling**; same host but no transcript activity within that
     window (or no transcript found) → **Stale holder**; different host → **Remote holder**. The
     worktree match from step 3 still counts for a Stale-holder verdict: a matched worktree
     (locked or not) means the holder may still be alive even without a findable transcript, so
     the card's Stale-holder next step must not recommend reclaim in that case — it directs the
     user to inspect the matched worktree instead.

  ```markdown
  ## Flow: Claim contested

  #{target} is already claimed by run {holder-runId} (session {holder-sessionId}, host:
  {holder-host}, claimed {holder-claimedAt}, expires {holder-claimedAt + holder-ttlHours}).

  {one of:
    - Live sibling on this machine — {worktree-path-or-"no worktree found"}, last active
      {age}. Next: wait for it to finish or release; re-run afterward.
    - Remote holder ({holder-host}). Next: inspect that session on its own machine, or wait
      for the claim to expire.
    - Stale holder — no activity since {transcript-mtime-or-"unknown (no transcript found)"}.
      Next: {if step 3 matched a worktree: a worktree for this run still exists — inspect it
      before any reclaim; a locked worktree usually means a live session. | else:
      `/claude-tweaks:tidy` to sweep and reclaim, or wait for the TTL to expire.}}
  ```

  No `AskUserQuestion` — there is nothing to choose between here; the pipeline cannot proceed
  with a target it cannot claim.

The `released` array's write (default mode, no `--keep-going`) uses the reason
`never-started: file-overlap group partial claim` internally, per `_shared/issue-claims.md`'s
Failure-posture table — the CLI's own `ABORT_REASON`, not something this flow step writes itself.

**`--keep-going`** — the CLI never exits 3 or 4; a per-target contest or transient failure is
downgraded to a `skipped` entry in the exit-0 JSON envelope (`{issue, reason: 'contested', holder}`
or `{issue, reason: 'transient', error}`) and the CLI proceeds to the remaining targets rather than
releasing and aborting — consistent with `--keep-going`'s existing meaning elsewhere in flow
(`multi-spec.md`): continue past a per-target failure rather than aborting the whole run. Drop each
skipped target from the target list for Step 3 onward. For a `reason: 'contested'` entry, gather
liveness evidence (steps 1-5 above) and render the contest card using that entry's `holder`; for a
`reason: 'transient'` entry, render the transient-failure card below. Each renders as one
informational block per skipped target, not a pipeline stop, since the run proceeds with the
remainder.

**A transient `gh` failure during claim (exit 4, not a classification-based contest)** — a network
timeout, a transport error, or any other unclassified failure the CLI hit while reading, writing,
or posting for a target — gets the identical all-or-abort treatment as a classification-based
contest above: the difference is only the message, which names the transient failure instead of a
holder identity (there is no holder to report):

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
