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

**One keyspace, one classifier, both transports.** `claims/issue-<number>.json`, a blob on the
`claims-registry` branch — the *only* lock, checked and written identically whether this run has
`gh` on PATH or is going through the MCP bridge. `bin/lib/issues/claims.js`'s
`classifyClaimBlob(content, now)` is the one function either transport's write path calls to
turn a fresh read into a create-only / conditional-update / contested decision; it never branches
on which transport is running. This is what makes the collision this file used to leave open
structurally impossible now: a gh-CLI session and an MCP session contending for the same issue
read and write the *same* file, so exactly one of their writes lands regardless of which
transport either one is running.

*Reachability, per consumer:* `/claude-tweaks:dispatch`'s Preflight check 2 (`gh` installed) no
longer gates on its own as of `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md`'s
Task 10 — its full read path (queue pull, dependency checks, settle/merge) is fully documented
and live on both transports: `gh` present → proceed via the gh-CLI blob calls below; `gh` absent
→ proceed via the MCP tool calls below, verified end-to-end against a live cloud Routine run.
`/tidy`'s Step 4.7 claims-audit sweep is a separate consumer of this same protocol and was never
affected by that gate either way.

Build the payload once, from either transport, the same way:

```bash
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimPayload({issueNumber:Number(process.argv[1]),
  runId:process.argv[2],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()})))" "$ISSUE" "$RUN_ID" > /tmp/claim-payload-${ISSUE}.json
```

(`sha` is no longer part of the claim payload's own identity — the blob store needs no default-
branch commit sha the way the retired ref-creation call did. `claimPayload` still accepts a `sha`
param for backward-compatible callers; it flows into the returned `p.sha` field, unused by
anything below.)

- **Bootstrap the branch** (once per run, before the first claim/release write). Branch
  creation is a distinct call on either transport — never an implicit side effect of a content
  write — so `CLAIMS_BRANCH` must exist before the first write: check whether it already exists
  (a cheap read attempt against a known path on it), and if not, create it from the repository's
  default branch, tolerating an "already exists" rejection (a concurrent agent may have created
  it first — the same 422-tolerance the claim write itself has).
  - **gh CLI:** `gh api "repos/{owner}/{repo}/git/refs/heads/${CLAIMS_BRANCH}"` to check;
    `DEFAULT_SHA=$(gh api "repos/{owner}/{repo}/commits/$(gh api "repos/{owner}/{repo}" -q .default_branch)" -q .sha)`
    then `gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/heads/${CLAIMS_BRANCH}" -f "sha=${DEFAULT_SHA}"`
    to create.
  - **MCP:** call `create_branch` with name = `CLAIMS_BRANCH` (`claims-registry`,
    `node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js').CLAIMS_BRANCH)"`)
    and source = the repository's default branch (`create_branch` confirmed live:
    `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md`'s Task 2 diagnostic exercised
    branch creation directly and it succeeded).

  Either bootstrap leaves `claims-registry` carrying the default branch's history underneath
  it — harmless, since the branch is a registry nobody merges, but not equivalent to an orphan
  branch.
- **Claim:** read first, then write — a create-only write cannot tell a live claim apart from a
  release tombstone, and a tombstone is never deleted, only overwritten, so treating
  file-exists as "contested" would reject every re-claim of that issue forever after its first
  release.

  1. Read the claim file at the payload's `claimPath` on `CLAIMS_BRANCH`, capturing both its
     content (or absence) and its current **blob sha** when it exists.
     - **gh CLI:** `gh api "repos/{owner}/{repo}/contents/${CLAIM_PATH}?ref=${CLAIMS_BRANCH}" -q '{content: (.content | @base64d), sha: .sha}'`
       (404 = file does not exist, a normal outcome, not an error).
     - **MCP:** the equivalent "get file contents" tool call against `claimPath` on
       `CLAIMS_BRANCH`; not-found is a normal outcome.
  2. Classify what step 1 read (or its absence) with `classifyClaimBlob`:
     ```bash
     node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
       const content = process.argv[1] === '__ABSENT__' ? null : require('fs').readFileSync(process.argv[1],'utf8');
       console.log(JSON.stringify(c.classifyClaimBlob(content, Date.now())))" \
       "${CONTENT_PATH_OR_ABSENT_SENTINEL}"
     ```
  3. **`state: 'absent'`** — no prior claim. Write **create-only** (no `sha`): the payload's
     `fileContent` at `claimPath` on `CLAIMS_BRANCH`.
     - **gh CLI:** `gh api --method PUT "repos/{owner}/{repo}/contents/${CLAIM_PATH}" -f "message=Claim issue #${ISSUE}" -f "content=$(base64 <<<"$FILE_CONTENT")" -f "branch=${CLAIMS_BRANCH}"`
       — omitting `sha` on this endpoint means create-only; a 422 means someone else's
       create-only write landed first between the read and this write.
     - **MCP:** `create_or_update_file` with `path` = `claimPath`, `content` = `fileContent`,
       `branch` = `CLAIMS_BRANCH`, omitting `sha`; a file-already-exists rejection is the same
       race.
     A rejection on either transport is **contested** — same handling as `'live'` below, not a
     retry.
  4. **`state: 'tombstone'` or `'stale'`** — a legitimate re-claim, not a contest. Write
     **conditionally** (**with** `sha` = the current file's blob sha from step 1) — the
     conditional-update form, not create-only:
     - **gh CLI:** the same `PUT contents` call as step 3, adding `-f "sha=${CURRENT_SHA}"`.
     - **MCP:** the same `create_or_update_file` call as step 3, adding `sha: currentSha`.
     A rejection here means someone else re-claimed or broke it first between the read and this
     write — contested.
  5. **`state: 'live'`** — contested. Do not attempt any write.
  6. **`state: 'unreadable'`** — fails closed to *live* (`classifyClaimBlob` reports
     `reclaimable: false`) — treat identically to step 5: do not attempt any write. `/tidy`'s
     sweep surfaces it for human judgment, per the standing "a claim you cannot read is not
     yours to break" posture.

  **Never pass a payload's `sha` field to either transport's contents write.** `claimPayload`'s
  optional `sha` is a legacy commit-sha field with no bearing on the blob store; the only `sha`
  either write above ever uses is the target **file's** current blob sha, and it only ever comes
  from step 1's fresh read.
- **Release:** the same read-then-classify (steps 1-2 above), then write the payload's
  `tombstoneContent` with `sha` = the current file's blob sha — structurally the same
  conditional-overwrite as step 4's re-claim, differing only in what content it writes. A sha
  mismatch means someone else already broke/re-claimed it; treat as a release race (log, TTL is
  the backstop, per the Failure posture table below).
- **List all claims:** list the `claims/` directory on `CLAIMS_BRANCH`.
  - **gh CLI:** `gh api "repos/{owner}/{repo}/contents/claims?ref=${CLAIMS_BRANCH}" -q '.[].name'`
  - **MCP:** the equivalent read-tree/list-directory tool call against `claims/` on
    `CLAIMS_BRANCH`.

### Deprecation window — the retired `refs/claims/issue-<n>` keyspace

Before this unification, the gh-CLI transport locked via `refs/claims/issue-<n>` (an atomic ref
create/delete under a dedicated namespace, never `refs/heads/`). Nothing above writes there
anymore. A claim made under the old mechanism, by a gh-CLI session still running an older build
during rollout, is real and must not be silently orphaned — so **reads** additionally check the
old ref keyspace until the window closes, while every write goes only to the blob store:

```bash
gh api "repos/{owner}/{repo}/git/matching-refs/claims/" -q '.[].ref' 2>/dev/null
```

A non-empty result here for an issue whose blob read (step 1 above) came back `absent` means an
in-flight legacy claim exists — treat the issue as `live`/contested, the same as
`classifyClaimBlob`'s own `'live'` verdict, rather than proceeding to a create-only blob write
that would race it. `bin/lib/issues/claims.js`'s `claimRef`/`claimFilePath` stay exported for
this read-only compatibility check; nothing constructs a *write* against `claimRef` anymore.

**End condition (IL-85):** this dual-read stays until every consumer listed in "Consumers"
below has run at least once against the blob-only write path in production — in practice, the
first `claims-registry`-only release after this change ships (the version recorded in
`CHANGELOG.md`/`docs/shipped-versions.tsv` for the record that shipped it). After that release,
delete this subsection, the `git/matching-refs` read call, and `claimRef`/`claimFilePath`'s
now-unused compatibility exports in the same change that removes the subsection — a stale ref
namespace nobody reads is a broken promise, not a harmless leftover.

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
issue comment this section posts is purely a human-visibility mirror for the GitHub UI (nobody
browses `claims-registry`'s blob tree from an issue page); it carries no identity that the blob
doesn't already carry authoritatively, and its own failure never affects claim state. Generate
bodies with the module — never hand-write markers:

```bash
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
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

Identity: `runId` is the pipeline run directory id (`{ISO-timestamp}-{spec-slug}`) for a
pipeline-owned run. For a headless routine with no pipeline (`/claude-tweaks:dispatch`,
the one such consumer today), `runId` is that firing's standalone-auto run dir basename per
`_shared/pipeline-run-dir.md` (e.g. `{ISO-timestamp}-dispatch-standalone`) — not a separately
maintained "routine id." `sessionId` is `CLAUDE_CODE_SESSION_ID` — the same identity
`record-worktree` stamps. **If the comment post fails after the blob write succeeded, the claim
still stands** — retry once, warn, proceed; the blob is the lock, and this comment never gates
anything. This is exactly the property that closes the pre-unification `everReleased` limbo (see
"Reading claim state" below): a comment-post failure used to leave the ref's identity mirror out
of sync with the ref itself, with no atomic guarantee tying them together. Now there is nothing
to fall out of sync — the blob write that establishes the lock *is* the identity write.

## The bot:in-progress label

`bot:in-progress` is a second, purely cosmetic visibility layer on top of the blob lock — a
label so the claim shows up in GitHub's own issue list/board UI, not just via a `claims/`
directory listing on `claims-registry`. It carries no locking semantics: the blob claim/release
is atomic regardless of whether the label add/remove succeeds. (This was already true before
this file's blob unification — restated here only because it's an easy thing to assume changed
along with the lock mechanism. It didn't; this label's role was never coupled to which keyspace
the lock lived in.)

- **Added** alongside claim acquisition — bootstrap-then-add, the same check-then-create
  pattern every label in this codebase uses (see `_shared/label-bootstrap.md` for the
  canonical snippet and the full work-record `LABELS_JSON`; `/dispatch` is the
  claim-acquiring consumer).
- **Removed** alongside claim release — every release removes it, regardless of outcome
  (`wrap-up/cleanup-procedures.md` Section E, its duplicate in
  `flow/multispec-review-console.md`, and — for a single-spec issue-mode run the user chooses
  not to merge — the same Section E `abandoned:` path any single-spec `/wrap-up` already uses;
  there is no separate flow-owned "console decline" mechanism for issue-mode).
- Best-effort in both directions: a failed add/remove never blocks the claim, the release, or
  the pipeline. `/tidy` Step 4.7 flags an issue that still carries the label with no active
  claim as a backstop.
- Generic to the protocol, like the blob/comment mechanism above — any future claim consumer
  gets this for free, not just backlog-originated issues.

## Reading claim state

**Authoritative: read the blob, classify with `classifyClaimBlob`** — "The lock" step 1-2 above
(read `claimPath` on `CLAIMS_BRANCH`, classify the content or its absence). This is the single
source of truth for whether an issue is claimed, by whom, and whether the claim is breakable.

```bash
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  const content = process.argv[1] === '__ABSENT__' ? null : require('fs').readFileSync(process.argv[1],'utf8');
  const classified = c.classifyClaimBlob(content, Date.now());
  const identity = content ? JSON.parse(content) : null;
  console.log(JSON.stringify({ ...classified, claim: classified.state === 'live' || classified.state === 'stale' ? identity : null }))" \
  "${CONTENT_PATH_OR_ABSENT_SENTINEL}"
```

`state: 'absent'` — never claimed (or fully released and swept — a tombstone still reads
`'tombstone'`, not `'absent'`, so "never claimed" and "claimed then released" stay
distinguishable, unlike the pre-unification `everReleased: false` ambiguity this replaces).
`state: 'live'` — claimed, not breakable; `claim` carries the full identity (`runId`,
`sessionId`, `claimedAt`, `ttlHours`, `host`). `state: 'stale'` — claimed, breakable (past TTL).
`state: 'tombstone'` — released, breakable (a fresh claim, not a takeover). `state: 'unreadable'`
— fails closed to not-breakable, same as `'live'`; `/tidy`'s sweep surfaces it for human
judgment.

**No more `everReleased` split.** Before unification, `claimStatus` (below) had to distinguish
two `claimed: false` outcomes a bare 422 couldn't tell apart — `everReleased: true` (the
ref-delete failed after the release comment posted; safe to break) vs. `everReleased: false` (no
marker ever found at all; treat as live). That distinction existed only because identity (the
comment) and the lock (the ref) were two separate writes that could fall out of sync. They can't
anymore — the blob write that releases a claim writes the tombstone content and clears the lock
in the same call, so `classifyClaimBlob` always sees exactly one of `'absent'` (nothing to find)
or `'tombstone'` (found, and it says released) — there is no third, ambiguous outcome to name.

**Legacy fallback, `claimStatus` (comment-fold), during the deprecation window only.**
`bin/lib/issues/claims.js` still exports `claimStatus`, which folds an issue's comment history
into the same `{claimed, claim, stale, everReleased}` shape the pre-unification protocol used.
Consult it **only** when the blob read above comes back `'absent'` **and** the ref
compatibility check ("Deprecation window" above) found a matching `refs/claims/issue-<n>` —
i.e., only to recover the identity of an in-flight *legacy* claim, never as a routine
cross-check of a blob-store claim. Once the deprecation window closes (see its own End
condition), delete this paragraph and `claimStatus` together — it has no remaining caller.

```bash
gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100" > /tmp/comments-${ISSUE}.json
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimStatus(require(process.argv[1]),Date.now())))" /tmp/comments-${ISSUE}.json
```

Paths in these snippets must be absolute (`/tmp/...` or a run-dir path) — `require()` inside
`node -e` resolves relative paths against the eval context, not the working directory.

## TTL and staleness

Default TTL 72h from `claimedAt`; stale iff `now >= claimedAt + ttlHours`. No heartbeat in
v1 (runs last hours, not days; a renewal comment is a reserved future extension).

**Breaking a stale claim:** conditionally overwrite the blob (the `'stale'` write path under
"The lock" step 4 — `sha` = the current file's blob sha, content = a fresh `claimPayload`'s
`fileContent`; atomicity applies again — of two racing breakers, exactly one write lands), post
a new claim comment noting the takeover and the prior run id.

Generate the takeover comment with `claimPayload`'s `note` param (e.g.
`note: "Broke stale claim from run {priorRunId} (expired {expiry})."`) — the note becomes a
third human-readable line. Never hand-edit or append to the marker line itself.

**A claim blob that is unreadable is never stale** — `classifyClaimBlob` reports
`reclaimable: false` for `'unreadable'` the same as `'live'` — treat as live, skip the issue,
and let `/tidy`'s sweep surface it for human judgment.

## Release triggers

| Trigger | Owner | Reason string |
|---|---|---|
| Spec merged / PR opened / discarded | `/wrap-up` cleanup item 7 | `merged: spec {spec}` / `pr-opened: spec {spec}` / `abandoned: spec {spec}` |
| Interactive `/flow` run stops at a gate, user chooses not to resume | `/flow` failure card (offered, not automatic) | `failed: {gate}` |
| Handed-off issue-mode run fails a HARD-GATE (headless `dispatch`, no human present) | `/claude-tweaks:dispatch` settle step (automatic, unconditional) | `failed: {gate}` |
| Stale or orphaned claim in hygiene pass | `/tidy` Step 4.7 (after batch approval) | `swept: stale claim` / `swept: issue closed` |
| Grant removal (`auto:build`/`auto:merge`) after a `merged:`/`pr-opened:` release | Console dispatch-label step (multi-spec) / `/wrap-up`'s `cleanup-procedures.md` Section E step 6 (single-spec) | — (label edit, not a claim release) |
| Interrupted session | nobody — TTL ages it out; `/tidy` sweeps it | — |

**Ownership rule.** Before a this-run release overwrites the blob, read it fresh and confirm
`claim.runId` (the current blob content's `runId`) equals this run's `$RUN_ID`. A mismatch means
a successor broke the stale claim and now holds the lock — skip the write, log, and post
nothing. `/tidy`'s sweep is exempt: it releases *other* runs' stale claims by design, after
batch approval.

**Dispatch's success path.** `/claude-tweaks:dispatch` claims with the *dispatch firing's*
`$RUN_ID`, but a successful run's release happens inside `/wrap-up` (cleanup Section E), running
under the handed-off `/flow`/`/specify` pipeline's *own*, later, differently-named run dir — a
different `$RUN_ID` than the one that made the claim, if `/wrap-up` used its own `PIPELINE_RUN_DIR`
for the comparison. It doesn't: `dispatch/SKILL.md`'s execution step exports `CLAIM_RUN_ID`
(the dispatch firing's run id) before invoking `/flow`, `/flow` threads it through unchanged to
every per-spec `/wrap-up` it runs (see `flow/multi-spec.md`'s env-var table for the
multi-spec/bundle case), and `cleanup-procedures.md` Section E resolves `$RUN_ID` as
`${CLAIM_RUN_ID:-$(basename "$PIPELINE_RUN_DIR")}` — the dispatch-provided value when present,
falling back to the pipeline's own run id for any non-dispatch-originated release (a human
running `/flow #{issue}` directly, or a spec merely *derived from* an issue with no live claim).
The failure path (dispatch's own `dispatch/SKILL.md` settle step) already worked the same way —
releasing with the same `$RUN_ID` that made the claim, threaded explicitly into the group's Task
agent — this closes the equivalent gap on the success path.

**Work-ready evidence.** Pass `releasePayload` a `link` (merge commit URL/sha or PR URL) when
one exists — it lands in the release marker and human line, making the issue's comment trail
point at the shipped change.

Every claim, skip, break, and release is logged to the run's `decisions.md` per
`_shared/auto-decision-log.md` (status `AUTO`, reversible: release overwrites the blob with a
tombstone).

## Close-via-merge

The agent never runs `gh issue close` (non-reversible network write — see
`_shared/auto-mode-contract.md`). Issues close through the user's own merge action instead —
by making sure the closing keyword already exists in a commit that will reach the default
branch, regardless of *how* that happens:

- **Worktree path (single-spec, the common case):** before handing off to
  `/superpowers:finishing-a-development-branch`, `/wrap-up` cleanup Section C commits an empty
  carrier commit on the feature branch — `git commit --allow-empty -m "Fixes #{issue}"`, one
  line per issue — *before* that skill runs. This is necessary, not just convenient: that
  skill's own "Merge locally" option runs a bare `git merge` with no `--no-ff`, which
  fast-forwards and creates no merge commit to carry a message into; its "Push and Create PR"
  option only runs `git push` and never calls `gh pr create`, so there is no PR body either. A
  carrier commit on the branch itself works uniformly across every option that skill offers —
  merge locally (whether that merge fast-forwards or creates a `--no-ff` merge commit),
  push+PR (even a PR the user creates manually afterward), or keep-as-is — because GitHub
  scans every commit reaching the default branch, not just a merge commit or PR body.
- **Worktree path (multi-terminal parallel):** `flow/worktree-merge.md` performs the merge
  directly rather than delegating — `git merge --no-ff {branch} -m "... Fixes #{issue} ..."`.
  The explicit `--no-ff` guarantees a real merge commit exists to carry the keyword, so no
  separate carrier commit is needed on this path.
- **Current-branch path:** no merge commit, PR, or branch finish exists — the same
  `Fixes #{issue}` lines go in the final wrap-up commit message (per spec, in multi-spec runs);
  GitHub closes the issues when that commit reaches the default branch.

One line per issue. Direct `gh issue close` commands surface only for issues resolved
*without* a merge (wontfix, duplicate), and the user runs them.

## Dispatch authorization

Headless agents building arbitrary issue content is a prompt-injection surface: an issue
body is untrusted input, and a drive-by issue must not be able to opt itself into autonomous
execution. The gate is GitHub's own permission model — **applying a label requires triage
permission, so a label is a maintainer's signature**. Authorization is two stackable grants
(see `_shared/work-record.md`, the taxonomy home, for full semantics), *granted* exclusively
by `/claude-tweaks:backlog refine`'s interactive invocation. Machinery may remove or downgrade
grants; it never adds them:

- `auto:build` — authorized to build. `/dispatch` selects on this, claims the record's whole
  file-overlap group, and hands it to `/flow #{n}`. Label = standing request, claim = in
  flight: the claim blob prevents double-dispatch across firings, and the grant persists until
  *successful* wrap-up — a failed run retries at a later firing once its claim ages out, up
  to the `dispatch-retry-ceiling` config key.
- `auto:merge` — additionally authorized to auto-merge without a live Review Console
  approval, but only when `/claude-tweaks:assess-agent-autonomy`'s `merge-check` mode verdicts
  `auto-merge` (the two-layer gate defined in `skills/dispatch/SKILL.md`). Additive on
  `auto:build`; alone it is inert.

**Grant revocation (machinery-owned, the only direction machinery moves):** the
correctness/ambiguous-vs-transient failure classification and the retry-ceiling
`auto:*`-removal + `bot:blocked` rule are `_shared/work-record.md`'s "Grant semantics"
section (the taxonomy home cited above) — see that section for the full rule rather than a
second restatement here. The one addition specific to this gate, not covered there:

- Flag-back at the gate (remove `ready`, comment why) returns an unshaped record to backlog
  state for more shaping — the gate's equivalent of "not yet."

These are reversible label writes, logged to `decisions.md`. Removing grants on *success* is
a different owner's job — `/wrap-up` (or the consolidated console) after a `merged:`/
`pr-opened:` release, per the Release triggers table above.

## Failure posture

Fail-closed on claiming; never block the session.

| Failure | Behavior |
|---|---|
| `gh` missing | Use the MCP path (see "The lock" above) — not a hard gate at the protocol level. `/dispatch` no longer gates on `gh` missing alone either, per the Reachability note above; an individual consumer could still choose to gate on its own for reasons unrelated to this protocol, but none currently does |
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
| **Deprecation window only:** the legacy `refs/claims/issue-<n>` check finds a ref with no matching blob | Treat as `'live'` — an in-flight claim made under the retired mechanism; do not attempt a create-only blob write that would race it |

## Consumers

| Skill | Role |
|---|---|
| `/claude-tweaks:dispatch` | Claims each authorized record's whole file-overlap group before handing off to `/flow`; releases + revokes on failure (per the retry-ceiling procedure) |
| `/claude-tweaks:flow` (issue-reference mode) | Releases via `/wrap-up`'s generic Section E `abandoned:` path when the user doesn't merge, and via failure-card-offered release on a gate failure. Never claims — `/claude-tweaks:dispatch` always claims before invoking `/flow #{n}`. |
| `/claude-tweaks:wrap-up` (`cleanup-procedures.md` item 7 / Section E) | Releases claims with the branch outcome as reason |
| `/claude-tweaks:tidy` (`scan-procedures.md` Step 4.7) | Sweeps stale/orphaned claims; releases only after batch approval |

**Non-consumers (deliberate):** `/code-health` files issues but never works them — a concurrent-
filing race costs at worst one duplicate issue, caught by dedup next run. Interactive
single-spec `/build` does not claim — the user is present and collision is visible.
