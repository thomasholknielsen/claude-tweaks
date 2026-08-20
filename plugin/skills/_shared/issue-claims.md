# Issue Claims — Cross-Agent Coordination Contract

Prevents concurrent agents — a scheduled cloud routine, a second machine, another
collaborator's agent, whether running the `gh` CLI or the GitHub MCP bridge — from
double-building the same GitHub issue. One arbiter (a content blob on the `claims-registry`
branch) covers all topologies and both transports: a create-only or sha-conditional write to
that one file is an atomic test-and-set, and both transports write the same file.

Helper module: `bin/lib/issues/claims.js` (emit-only, no network — skills run `gh` or the MCP
tools). Consumers reference this file; do not restate the protocol inline.
Label taxonomy home: `_shared/work-record.md` — this file defines the claim protocol; the
record contract defines what the labels mean.

## The lock

**`bin/claims.js claim|release <n,n,...> --run-id <id>`** (`bin/lib/issues/claim-engine.js`) is
the gh-CLI-transport implementation of every read-classify-write step below, plus the group-claim-
all-or-abort semantics `flow/claim-targets.md`'s Step 2.8 needs — the command every `gh`-present
consumer of this section runs instead of hand-scripting the loop per pipeline run. The MCP
transport (`gh` absent) still runs the algorithm as written below, over the MCP tools.

**One keyspace, one classifier, both transports.** `claims/issue-<number>.json`, a blob on the
`claims-registry` branch, is the *only* lock — checked and written identically whether this run
has `gh` on PATH or is going through the MCP bridge. `bin/lib/issues/claims.js`'s
`classifyClaimBlob(content, now)` turns a fresh read into a create-only / conditional-update /
contested decision without branching on transport, so a gh-CLI session and an MCP session
contending for the same issue read and write the same file — exactly one write lands regardless
of transport.

*Reachability:* `/claude-tweaks:dispatch`'s Preflight check 2 (`gh` installed) does not gate on
its own — `gh` present proceeds via the gh-CLI calls below, `gh` absent via the MCP calls below.
`/tidy`'s Step 4.7 sweep is a separate consumer of this same protocol, unaffected either way.

Build the payload once, from either transport, the same way:

```bash
node -e "const c=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimPayload({issueNumber:Number(process.argv[1]),
  runId:process.argv[2],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()})))" "$ISSUE" "$RUN_ID" > /tmp/claim-payload-${ISSUE}.json
```

- **Bootstrap the branch** (once per run, before the first claim/release write). Branch creation
  is a distinct call on either transport, never an implicit side effect of a content write —
  check whether `CLAIMS_BRANCH` already exists (a cheap read against a known path on it) and, if
  not, create it from the repository's default branch, tolerating an "already exists" rejection
  (a concurrent agent may have created it first — the same 422-tolerance the claim write itself
  has).
  - **gh CLI:** `gh api "repos/{owner}/{repo}/git/refs/heads/${CLAIMS_BRANCH}"` to check;
    `DEFAULT_SHA=$(gh api "repos/{owner}/{repo}/commits/$(gh api "repos/{owner}/{repo}" -q .default_branch)" -q .sha)`
    then `gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/heads/${CLAIMS_BRANCH}" -f "sha=${DEFAULT_SHA}"`
    to create.
  - **MCP:** call `create_branch` with name = `CLAIMS_BRANCH` (`claims-registry`,
    `node -e "console.log(require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/claims.js').CLAIMS_BRANCH)"`)
    and source = the repository's default branch.

  Either bootstrap leaves `claims-registry` carrying the default branch's history underneath it
  — harmless, since the branch is a registry nobody merges, but not equivalent to an orphan
  branch.
- **Claim:** read first, then write — a create-only write cannot tell a live claim apart from a
  release tombstone, and a tombstone is never deleted, only overwritten, so treating file-exists
  as "contested" would reject every re-claim forever after its first release.

  1. Read the claim file at the payload's `claimPath` on `CLAIMS_BRANCH`, capturing both its
     content (or absence) and its current **blob sha** when it exists.
     - **gh CLI:** `gh api "repos/{owner}/{repo}/contents/${CLAIM_PATH}?ref=${CLAIMS_BRANCH}" -q '{content: (.content | @base64d), sha: .sha}'`
       (404 = file does not exist, a normal outcome, not an error).
     - **MCP:** the equivalent "get file contents" tool call against `claimPath` on
       `CLAIMS_BRANCH`; not-found is a normal outcome.
  2. Classify what step 1 read (or its absence) with `classifyClaimBlob`:
     ```bash
     node -e "const c=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/claims.js');
       const content = process.argv[1] === '__ABSENT__' ? null : require('fs').readFileSync(process.argv[1],'utf8');
       console.log(JSON.stringify(c.classifyClaimBlob(content, Date.now())))" \
       "${CONTENT_PATH_OR_ABSENT_SENTINEL}"
     ```
  3. **`state: 'absent'`** — no prior claim. Write **create-only** (no `sha`): the payload's
     `fileContent` at `claimPath` on `CLAIMS_BRANCH`.
     - **gh CLI:** `gh api --method PUT "repos/{owner}/{repo}/contents/${CLAIM_PATH}" -f "message=Claim issue #${ISSUE}" -f "content=$(base64 <<<"$FILE_CONTENT")" -f "branch=${CLAIMS_BRANCH}"`
       — omitting `sha` means create-only; a 422 means someone else's create-only write landed
       first between the read and this write.
     - **MCP:** `create_or_update_file` with `path` = `claimPath`, `content` = `fileContent`,
       `branch` = `CLAIMS_BRANCH`, omitting `sha`; a file-already-exists rejection is the same
       race.
     A rejection on either transport is **contested** — same handling as `'live'` below, not a
     retry.
  4. **`state: 'tombstone'` or `'stale'`** — a legitimate re-claim, not a contest. Write
     **conditionally** (**with** `sha` = the current file's blob sha from step 1):
     - **gh CLI:** the same `PUT contents` call as step 3, adding `-f "sha=${CURRENT_SHA}"`.
     - **MCP:** the same `create_or_update_file` call as step 3, adding `sha: currentSha`.
     A rejection here means someone else re-claimed or broke it first — contested.
  5. **`state: 'live'`** — contested. Do not attempt any write.
  6. **`state: 'unreadable'`** — fails closed to *live* (`classifyClaimBlob` reports
     `reclaimable: false`) — treat identically to step 5. `/tidy`'s sweep surfaces it for human
     judgment, per the standing "a claim you cannot read is not yours to break" posture.

  The only `sha` either write above ever uses is the target **file's** current blob sha, from
  step 1's fresh read.
- **Release:** the same read-then-classify (steps 1-2 above), then write the payload's
  `tombstoneContent` with `sha` = the current file's blob sha — structurally the same
  conditional-overwrite as step 4's re-claim, differing only in what content it writes. A sha
  mismatch means someone else already broke/re-claimed it; treat as a release race (log, TTL is
  the backstop, per the Failure posture table below). **`bin/release-claim.js`** performs this
  whole sequence (read → classify → ownership check → tombstone `PUT` → comment → optional
  label removals) in one command on the `gh` path — `node "${CLAUDE_PLUGIN_ROOT}/bin/release-claim.js"
  <issue> --run <run-dir> --reason <reason> [--link <url>] [--remove-grants] [--remove-in-progress]`,
  exit `0` released / `3` already released or swept / `4` held by another run / `1` failed / `2`
  malformed or `gh` absent. The MCP path stays the manual read-classify-write above.
- **List all claims:** list the `claims/` directory on `CLAIMS_BRANCH`.
  - **gh CLI:** `gh api "repos/{owner}/{repo}/contents/claims?ref=${CLAIMS_BRANCH}" -q '.[].name'`
  - **MCP:** the equivalent read-tree/list-directory tool call against `claims/` on
    `CLAIMS_BRANCH`.

### Group claiming

Records whose key files overlap form a **file-overlap group** (`bin/lib/issues/grouping.js`'s
`groupByFileOverlap`). A dispatcher claims **all members of the group before starting any** —
building one member alone would leave the branch and its overlap partners racing each other.
Per-member acquisition uses the same 201/422 handling; on a partial group claim (some members
contested live mid-acquisition), release the members this run just claimed, log, and skip the
whole group this firing. Group membership is computed over *unclaimed* records only, so two
racing dispatchers converge: exactly one wins each contested member, and the loser backs off
group-wide.

## The mirror (human visibility only — never identity)

Identity and lock are now **one write** — the blob's own content, per "The lock" above. The
issue comment this section posts is purely a human-visibility mirror for the GitHub UI; it
carries no identity the blob doesn't already carry authoritatively, and its own failure never
affects claim state. Generate bodies with the module — never hand-write markers:

```bash
node -e "const c=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/claims.js');
  console.log(c.claimPayload({issueNumber:Number(process.argv[1]),
  runId:process.argv[2],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()}).commentBody)" "$ISSUE" "$RUN_ID" > /tmp/claim-${ISSUE}.md
gh issue comment "$ISSUE" --body-file /tmp/claim-${ISSUE}.md
```

Marker shapes (emitted by `claimPayload` / `releasePayload` — the same JSON shape the blob
content itself carries, so the comment is a legible copy of the blob, not a second source):

```
<!-- agent-claim: {"runId":"...","sessionId":"...","claimedAt":"<ISO>","ttlHours":72,"host":"..."} -->
<!-- agent-claim-release: {"runId":"...","reason":"...","releasedAt":"<ISO>"} -->
```

Identity: `runId` is the pipeline run directory id (`{ISO-timestamp}-{spec-slug}`) — for a
directly-run or human-resumed `/flow`, the run directory it creates or adopts itself
(`basename($PIPELINE_RUN_DIR)`); for a `/claude-tweaks:dispatch`-originated claim, the
per-group run directory dispatch Step 4 mints (`{ISO-timestamp}-record-{n}`,
keyed to the group's representative record — see `dispatch/SKILL.md` Step 4) and passes to
both of that group's Task calls as `PIPELINE_RUN_DIR`. One identity either way: the directory
the claim was written under is always the same directory the pipeline itself resolves as
`$PIPELINE_RUN_DIR`, so no separate variable threads the two together. Dispatch's own
firing-level standalone-auto run dir (`_shared/pipeline-run-dir.md`, e.g.
`{ISO-timestamp}-dispatch-standalone`) is a different thing entirely — it holds that firing's
own `decisions.md` (queue pull, selection, per-group minting log), never a claim's `runId`.
`sessionId` is `CLAUDE_CODE_SESSION_ID` — the same
identity `record-worktree` stamps. **If the comment post fails after the blob write succeeded,
the claim still stands** — retry once, warn, proceed; the blob is the lock, and this comment
never gates anything.

## The bot:in-progress label

`bot:in-progress` is a second, purely cosmetic visibility layer on top of the blob lock — a
label so the claim shows up in GitHub's own issue list/board UI, not just via a `claims/`
directory listing on `claims-registry`. It carries no locking semantics: the blob claim/release
is atomic regardless of whether the label add/remove succeeds.

- **Added** alongside claim acquisition — bootstrap-then-add, the same check-then-create
  pattern every label in this codebase uses (see `_shared/label-bootstrap.md` for the
  canonical snippet and the full work-record `LABELS_JSON`; `/dispatch` is the
  claim-acquiring consumer).
- **Removed** alongside claim release — every release removes it, regardless of outcome
  (`wrap-up/cleanup-procedures-execution.md` Section E, its duplicate in `flow/multispec-review-console.md`,
  and — for a single-spec issue-mode run the user chooses not to merge — the same Section E
  `abandoned:` path any single-spec `/wrap-up` already uses).
- Best-effort in both directions: a failed add/remove never blocks the claim, the release, or
  the pipeline. `/tidy` Step 4.7 flags an issue that still carries the label with no active
  claim as a backstop.
- Generic to the protocol — any future claim consumer gets this for free, not just
  backlog-originated issues.

## Reading claim state

**Authoritative: read the blob, classify with `classifyClaimBlob`** — "The lock" step 1-2 above.
This is the single source of truth for whether an issue is claimed, by whom, and whether the
claim is breakable.

```bash
node -e "const c=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/claims.js');
  const content = process.argv[1] === '__ABSENT__' ? null : require('fs').readFileSync(process.argv[1],'utf8');
  const classified = c.classifyClaimBlob(content, Date.now());
  const identity = content ? JSON.parse(content) : null;
  console.log(JSON.stringify({ ...classified, claim: classified.state === 'live' || classified.state === 'stale' ? identity : null }))" \
  "${CONTENT_PATH_OR_ABSENT_SENTINEL}"
```

`state: 'absent'` — never claimed (a tombstone still reads `'tombstone'`, not `'absent'`, so
"never claimed" and "claimed then released" stay distinguishable). `state: 'live'` — claimed,
not breakable; `claim` carries the full identity (`runId`, `sessionId`, `claimedAt`, `ttlHours`,
`host`). `state: 'stale'` — claimed, breakable (past TTL). `state: 'tombstone'` — released,
breakable (a fresh claim, not a takeover). `state: 'unreadable'` — fails closed to
not-breakable, same as `'live'`; `/tidy`'s sweep surfaces it for human judgment.

Paths in these snippets must be absolute (`/tmp/...` or a run-dir path) — `require()` inside
`node -e` resolves relative paths against the eval context, not the working directory.

## TTL and staleness

Default TTL 72h from `claimedAt`; stale iff `now >= claimedAt + ttlHours`. No heartbeat in v1.

**Breaking a stale claim:** conditionally overwrite the blob (the `'stale'` write path under
"The lock" step 4 — `sha` = the current file's blob sha, content = a fresh `claimPayload`'s
`fileContent`), then post a new claim comment noting the takeover and the prior run id.

Generate the takeover comment with `claimPayload`'s `note` param (e.g. `note: "Broke stale claim
from run {priorRunId} (expired {expiry})."`) — the note becomes a third human-readable line.
Never hand-edit or append to the marker line itself.

**A claim blob that is unreadable is never stale** — `classifyClaimBlob` reports
`reclaimable: false` for `'unreadable'` the same as `'live'` — treat as live, skip the issue,
and let `/tidy`'s sweep surface it for human judgment.

## Release triggers

| Trigger | Owner | Reason string |
|---|---|---|
| Spec merged / PR opened / discarded | `/wrap-up` cleanup item 7 | `merged: spec {spec}` / `pr-opened: spec {spec}` / `abandoned: spec {spec}` |
| Interactive `/flow` run stops at a gate, user chooses not to resume | `/flow` failure card (offered, not automatic) | `failed: {gate}` |
| Handed-off issue-mode run fails a HARD-GATE (headless `dispatch`, no human present) | `/claude-tweaks:dispatch` settle step (automatic, unconditional) | `failed: {gate}` |
| Headless `specify next` shapes the claimed record (success), routes it to `needs:definition` (success), or fails during shaping | `specify/next-mode.md` Release step (automatic, unconditional, always before that path's self-report) | `shaped: #{n}` / `routed: needs:definition #{n}` / `failed: shaping` |
| Stale or orphaned claim in hygiene pass | `/tidy` Step 4.7 (after batch approval) | `swept: stale claim` / `swept: issue closed` |
| Grant removal (`auto:build`/`auto:merge`) after a `merged:`/`pr-opened:` release | Console dispatch-label step (multi-spec) / `/wrap-up`'s `cleanup-procedures-execution.md` Section E step 6 (single-spec) | — (label edit, not a claim release) |
| Interrupted session | nobody — TTL ages it out; `/tidy` sweeps it | — |

**Ownership rule.** Before a this-run release overwrites the blob, read it fresh and confirm
`claim.runId` equals this run's `$RUN_ID`. A mismatch means a successor broke the stale claim and
now holds the lock — skip the write, log, and post nothing. `/tidy`'s sweep is exempt: it
releases *other* runs' stale claims by design, after batch approval.

**Dispatch's success path.** `/claude-tweaks:dispatch` Step 4 mints the group's run directory;
the first Task call's own `/claude-tweaks:flow` invocation claims it at Step 2.8
(`flow/claim-targets.md`) with the group's minted directory's basename as identity, and a
successful run's release happens inside `/wrap-up` (cleanup Section E) under that same
directory — `/flow` adopts it
directly as `$PIPELINE_RUN_DIR` rather than creating a separate one of its own, so
`cleanup-procedures-execution.md` Section E resolves `$RUN_ID` as `basename($PIPELINE_RUN_DIR)`
directly, no separate variable to thread through. A dispatched bundle is the one exception:
each spec's own `$PIPELINE_RUN_DIR` is a `spec-{N}/` subdirectory of the group's minted
parent, so Section E is deferred per-spec and the actual release happens once, at end-of-run,
against `basename($MULTISPEC_PARENT_DIR)` — see `flow/multispec-review-console.md`'s "Shared
teardown." The failure path (dispatch's own settle step) already releases with the same
identity that made the claim.

**Work-ready evidence.** Pass `releasePayload` a `link` (merge commit URL/sha or PR URL) when one
exists — it lands in the release marker and human line.

**In-flight detection at claim time (#315).** A `pr-opened:` tombstone's `link` field points at
the PR that build produced — before reclaiming such a tombstone, a claim-time reader may check
`gh pr view <link> --json state --jq .state`; a still-`OPEN` result means a build for this issue
already exists and reclaiming would race it. `bin/lib/issues/claim-engine.js`'s `claimOne` runs
this check (`tombstoneInFlightPr`), returning `outcome: 'in-flight'` instead of proceeding to a
fresh claim; any other reason, a missing `link`, or a failed/closed/merged check falls through to
the reclaim behavior below unchanged (fail open). `link` is untrusted (any session with
registry-branch write access can set it), so `tombstoneInFlightPr` validates it — a well-formed
`https://github.com/{owner}/{repo}/pull/{number}` URL for the SAME owner/repo as the issue being
claimed — before ever calling `gh pr view`; anything else (wrong repo, malformed, non-string) is
treated the same as a missing `link` and never reaches `gh` at all.
`bin/lib/claim-targets/claim-targets.js` — the group-claim loop `/claude-tweaks:flow` Step 2.8 and
`/claude-tweaks:dispatch` actually call, a separate implementation from `claim-engine.js` — runs
the same `tombstoneInFlightPr` check inline and reports the stopped target via
`inFlight`/`reason: 'in-flight'` instead of `outcome` (`flow/claim-targets.md`'s "Branch on exit
code").

Every claim, skip, break, and release is logged to the run's `decisions.md` per
`_shared/auto-decision-log.md` (status `AUTO`, reversible: release overwrites the blob with a
tombstone) — `bin/release-claim.js` appends its own line; claim-side entries go through
`bin/log-decision.js`.

## Close-via-merge

The agent never runs `gh issue close` (non-reversible network write — see
`_shared/auto-mode-contract.md`). Issues close through the user's own merge action instead, by
ensuring the closing keyword already exists in a commit that will reach the default branch:

- **Worktree path (single-spec, the common case):** before handing off to
  `/superpowers:finishing-a-development-branch`, `/wrap-up` cleanup Section C commits an empty
  carrier commit on the feature branch — `git commit --allow-empty -m "Fixes #{issue}"`, one
  line per issue — *before* that skill runs. This is necessary: that skill's "Merge locally"
  option runs a bare `git merge` with no `--no-ff` (no merge commit to carry a message into),
  and its "Push and Create PR" option never calls `gh pr create` (no PR body either). A carrier
  commit on the branch itself works across every option that skill offers, because GitHub scans
  every commit reaching the default branch, not just a merge commit or PR body.
- **Worktree path (multi-terminal parallel):** `flow/worktree-merge.md` merges directly —
  `git merge --no-ff {branch} -m "... Fixes #{issue} ..."`. The explicit `--no-ff` guarantees a
  real merge commit to carry the keyword, so no separate carrier commit is needed.
- **Current-branch path:** no merge commit, PR, or branch finish exists — the same
  `Fixes #{issue}` lines go in the final wrap-up commit message (per spec, in multi-spec runs).

One line per issue. Direct `gh issue close` commands surface only for issues resolved *without*
a merge (wontfix, duplicate), and the user runs them.

## Dispatch authorization

Headless agents building arbitrary issue content is a prompt-injection surface: an issue body
is untrusted input, and a drive-by issue must not be able to opt itself into autonomous
execution. The gate is GitHub's own permission model — **applying a label requires triage
permission, so a label is a maintainer's signature**. Authorization is two stackable grants
(see `_shared/work-record.md`, the taxonomy home, for full semantics), *granted* exclusively
by `/claude-tweaks:backlog refine`'s interactive invocation. Machinery may remove or downgrade
grants; it never adds them:

- `auto:build` — authorized to build. `/dispatch` selects on this, mints the run directory for
  the record's whole file-overlap group, and hands it to `/flow #{n}`, which claims the group at
  Step 2.8. Label = standing request, claim = in flight: the claim blob prevents double-dispatch
  across firings, and the grant persists until *successful* wrap-up — a failed run retries at a
  later firing once its claim ages out, up to the `dispatch-retry-ceiling` config key.
- `auto:merge` — additionally authorized to auto-merge without a live Review Console
  approval, but only when `/claude-tweaks:assess-agent-autonomy`'s `merge-check` mode verdicts
  `auto-merge` (the two-layer gate defined in `skills/dispatch/SKILL.md`). Additive on
  `auto:build`; alone it is inert.

**Grant revocation (machinery-owned, the only direction machinery moves):** the
correctness/ambiguous-vs-transient failure classification and the retry-ceiling
`auto:*`-removal + `bot:blocked` rule live in `_shared/work-record.md`'s "Grant semantics"
section — see that section for the full rule. The one addition specific to this gate:

- Flag-back at the gate (remove `ready`, comment why) returns an unshaped record to backlog
  state for more shaping — the gate's equivalent of "not yet."

These are reversible label writes, logged to `decisions.md`. Removing grants on *success* is
a different owner's job — `/wrap-up` (or the consolidated console) after a `merged:`/
`pr-opened:` release, per the Release triggers table above.

## Failure posture

Fail-closed on claiming; never block the session.

| Failure | Behavior |
|---|---|
| `gh` missing | Use the MCP path (see "The lock" above) — not a hard gate at the protocol level |
| `gh` present but unauthenticated | Consumer's existing hard gate (auto never silences a missing dependency) |
| Claim write rejected, blob classified `'live'` | Skip the issue, log `AUTO`, continue |
| Claim write rejected, blob classified `'stale'` | Break: conditional overwrite (`sha` from the fresh read) → takeover comment |
| Claim write rejected, blob classified `'unreadable'` | Treat as live: skip, log; `/tidy` surfaces it |
| Claim write rejected, blob classified `'tombstone'` | Treat as a fresh reclaim: conditional overwrite (`sha` from the fresh read) → new claim comment |
| Comment fails after blob write succeeds | The blob is the lock — retry the comment once, warn, proceed; claim stands either way |
| Release fails | Log; TTL is the backstop |
| Release attempted but the blob's current `runId` is not this run's | Skip the write, log — a successor holds the lock (ownership rule) |
| Blob listing fails in `/tidy` | Skip the sweep step, note it in the report |
| Any other `gh`/MCP failure during claim | Drop that issue, log, continue — partial batch over hung batch |

**Recognition.** A `gh`/MCP failure in the table above is classified per
`_shared/github-rate-limit.md` before applying that row's outcome — a rate-limit response
follows that file's taxonomy; every other failure class in this table applies exactly as
stated.

**Group-claim-all-or-abort exception.** The row above assumes an independent-batch context (dispatch's per-issue loop, `/tidy`'s sweep), where dropping one issue and continuing is safe. A consumer claiming multiple targets under the group-claim-all-or-abort invariant (`flow/claim-targets.md`'s Step 2.8) gets different treatment: any transient `gh`/MCP failure during a claim read or write — not just a classification-based contest — triggers the same all-or-abort release-and-stop (or `keep-going` skip) as a live contest, since silently continuing with one named target unclaimed reopens the double-build race group-claiming exists to prevent.

## Deliverable-name collisions (bin/ CLIs)

The lock above claims the *issue number* being worked, not the *deliverable* (a named `bin/`
CLI, module, or artifact) a record proposes to build — two different issues that each
independently propose a same-named `bin/` CLI never collide here; the first collision point is a
`git merge` add/add conflict, discovered only after both sides have already built, tested, and
relied on diverging designs (the #637/spec-686-vs-"Ship bin/ CLIs"-PR incident this section
exists to prevent a repeat of).

**Where this fires:** at capture or specify time, whenever a record's title or body proposes
building a new `bin/` CLI (a `bin/{name}.js` filename, or prose like "build a CLI for X"/"ship a
`bin/` script for X"). Before filing or shaping such a record, grep both the shipped tree and the
open queue for the proposed name:

```bash
ls plugin/bin/{name}.js 2>/dev/null; gh issue list --search "{name} in:title,body" --state open
```

A hit in either — an existing implementation, or another open record proposing the same
deliverable — means resolve the collision (reuse, rename, or explicitly supersede the other
record) before the record is shaped `ready`. `capture/SKILL.md`'s Adding-an-Entry step cites this
section rather than restating it.

Would this have caught the #637 incident? Yes — grepping `log-decision` against the open-issue
titles at the time spec 686 was shaped would have surfaced "Ship bin/ CLIs for the hand-scripted
per-run procedures" proposing the same `bin/log-decision.js` filename, before either side wrote
code — the collision was visible from issue/PR titles alone, well before the eventual merge
conflict.

## Consumers

| Skill | Role |
|---|---|
| `/claude-tweaks:dispatch` | Selects each authorized record's whole file-overlap group, mints the run directory, and hands off to `/flow` (which claims at Step 2.8); the settle procedure it dispatches releases + revokes on failure (per the retry-ceiling procedure) |
| `/claude-tweaks:flow` (issue-reference mode) | Claims its named targets at Step 2.8 (`flow/claim-targets.md`), whether the invocation came from dispatch's hand-off or a human running `/flow #{n}` directly. Releases via `/wrap-up`'s generic Section E `abandoned:` path when the user doesn't merge, and via failure-card-offered release on a gate failure. |
| `/claude-tweaks:wrap-up` (`cleanup-procedures.md` item 7 / `cleanup-procedures-execution.md` Section E) | Releases claims with the branch outcome as reason |
| `/claude-tweaks:tidy` (`scan-procedures.md` Step 4.7) | Sweeps stale/orphaned claims; releases only after batch approval |
| `/claude-tweaks:specify` `next` form (`specify/next-mode.md`) | Claims the selected record before shaping (Claim step); releases on every path that actually acquired a claim — the shaping-success path and a post-claim shaping-stage failure. A zero-eligible exit or a contested/ineligible-on-re-read exit never acquires a claim, so there is nothing to release on those paths. |

**Non-consumers (deliberate):** `/code-health` files issues but never works them — a concurrent-
filing race costs at worst one duplicate issue, caught by dedup next run. Interactive
single-spec `/build` does not claim — the user is present and collision is visible.
