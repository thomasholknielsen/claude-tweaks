# Issue Claims — Cross-Agent Coordination Contract

Prevents concurrent agents — a scheduled cloud routine, a second machine, another
collaborator's agent — from double-building the same GitHub issue. One arbiter (the GitHub
API) covers all topologies: ref creation is an atomic test-and-set.

Helper module: `bin/lib/issues/claims.js` (emit-only, no network — skills run `gh`).
Consumers reference this file; do not restate the protocol inline.

## The lock

`refs/claims/issue-<number>` — a ref in a dedicated namespace (never `refs/heads/`, so
claims are issue-granular regardless of how work batches into branches, and never clutter
the branch list).

```bash
# Resolve a sha once per run (any valid remote sha works; ref existence is the lock):
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
SHA=$(gh api "repos/{owner}/{repo}/commits/${DEFAULT_BRANCH}" -q .sha)

# Claim (201 = claimed, HTTP 422 = already claimed by someone):
gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${ISSUE}" -f "sha=${SHA}"

# Release:
gh api -X DELETE "repos/{owner}/{repo}/git/refs/claims/issue-${ISSUE}"

# List all claims:
gh api "repos/{owner}/{repo}/git/matching-refs/claims/" -q '.[].ref'
```

## The mirror

The ref is authoritative but invisible in the GitHub UI, so every claim/release also posts
an issue comment with a machine-readable marker plus one human-readable line. Generate
bodies with the module — never hand-write markers:

```bash
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(c.claimPayload({issueNumber:Number(process.argv[1]),sha:process.argv[2],
  runId:process.argv[3],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()}).commentBody)" "$ISSUE" "$SHA" "$RUN_ID" > /tmp/claim-${ISSUE}.md
gh issue comment "$ISSUE" --body-file /tmp/claim-${ISSUE}.md
```

Marker shapes (emitted by `claimPayload` / `releasePayload`):

```
<!-- agent-claim: {"runId":"...","sessionId":"...","claimedAt":"<ISO>","ttlHours":72,"host":"..."} -->
<!-- agent-claim-release: {"runId":"...","reason":"...","releasedAt":"<ISO>"} -->
```

Identity: `runId` is the pipeline run directory id (`{ISO-timestamp}-{spec-slug}`, or the
routine's run id when headless); `sessionId` is `CLAUDE_CODE_SESSION_ID` — the same identity
`record-worktree` stamps. If the comment post fails after the ref succeeds, the claim stands:
retry once, warn, proceed.

## Reading claim state

Fetch comments and fold them through `claimStatus` (accepts raw `gh` comment objects):

```bash
gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100" > /tmp/comments-${ISSUE}.json
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimStatus(require(process.argv[1]),Date.now())))" /tmp/comments-${ISSUE}.json
```

Paths in these snippets must be absolute (`/tmp/...` or a run-dir path) — `require()` inside
`node -e` resolves relative paths against the eval context, not the working directory.

Output: `{claimed, claim, stale}`. `claimed: true` with `stale: true` means the claim is
breakable, not absent.

## TTL and staleness

Default TTL 72h from `claimedAt`; stale iff `now >= claimedAt + ttlHours`. No heartbeat in
v1 (runs last hours, not days; a renewal comment is a reserved future extension).

**Breaking a stale claim:** delete the ref, recreate it (atomicity applies again — of two
racing breakers, exactly one gets 201), post a new claim comment noting the takeover and the
prior run id.

Generate the takeover comment with `claimPayload`'s `note` param (e.g.
`note: "Broke stale claim from run {priorRunId} (expired {expiry})."`) — the note becomes a
third human-readable line. Never hand-edit or append to the marker line itself.

**A claim whose comment is unreadable or missing is never stale** — treat as
live, skip the issue, and let `/tidy`'s sweep surface it for human judgment.

## Release triggers

| Trigger | Owner | Reason string |
|---|---|---|
| Spec merged / PR opened / discarded | `/wrap-up` cleanup item 8 | `merged: spec {spec}` / `pr-opened: spec {spec}` / `abandoned: spec {spec}` |
| User declines the brief at the Review Console | `/flow` | `declined at review console` |
| Pipeline stops at a gate, user chooses not to resume | `/flow` failure card (offered, not automatic) | `failed: {gate}` |
| Stale or orphaned claim in hygiene pass | `/tidy` Step 4.7 (after batch approval) | `swept: stale claim` / `swept: issue closed` |
| `agent:go` removal after a `merged:`/`pr-opened:` release | Console dispatch-label step (multi-spec) / `/wrap-up` Section E step 6 (single-spec) | — (label edit, not a claim release) |
| Interrupted session | nobody — TTL ages it out; `/tidy` sweeps it | — |

**Ownership rule.** Before a this-run release deletes the ref, fold the issue's comments
through `claimStatus` and confirm `claim.runId` equals this run's `$RUN_ID`. A mismatch means
a successor broke the stale claim and now holds the lock — skip the delete, log, and post
nothing. `/tidy`'s sweep is exempt: it releases *other* runs' stale claims by design, after
batch approval.

**Work-ready evidence.** Pass `releasePayload` a `link` (merge commit URL/sha or PR URL) when
one exists — it lands in the release marker and human line, making the issue's comment trail
point at the shipped change.

Every claim, skip, break, and release is logged to the run's `decisions.md` per
`_shared/auto-decision-log.md` (status `AUTO`, reversible: release deletes the ref).

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
  carrier commit on the branch itself works uniformly across all four of that skill's options
  (fast-forward merge, `--no-ff` merge, push+PR — even a PR the user creates manually
  afterward — or keep-as-is) because GitHub scans every commit reaching the default branch,
  not just a merge commit or PR body.
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
permission, so a label is a maintainer's signature**:

- `agent:eligible` — authorization. Autonomous (headless/routine) runs only build issues
  carrying it; they pass `--require-eligible` so ingestion filters on it (`requireLabels` in
  `bin/lib/issues/ingest.js`). Interactive runs are unrestricted — the user is present to
  judge each issue.
- `agent:go` — the standing dispatch request a scheduled dispatcher selects on
  (`--from-label agent:go`). Label = standing request, claim = in flight: the claim ref
  prevents double-dispatch across firings, and the label persists until *successful*
  wrap-up — a failed run retries at a later firing once its claim ages out. Removing
  `agent:go` on success is a reversible write, logged to `decisions.md`.

The agent never applies either label itself — that would forge the signature. The shipped
dispatcher template (`skills/flow/routine-template.yml`) always passes `--require-eligible`;
a project relaxes the gate only by editing its instantiated routine's prompt.

## Failure posture

Fail-closed on claiming; never block the session.

| Failure | Behavior |
|---|---|
| `gh` missing/unauthenticated | Consumer's existing hard gate (auto never silences a missing dependency) |
| Claim ref 422, live claim | Skip the issue, log `AUTO`, continue |
| Claim ref 422, stale claim | Break: delete ref → recreate → takeover comment |
| Claim ref 422, unreadable claim | Treat as live: skip, log; `/tidy` surfaces it |
| Claim ref 422, comments fold to released (ref delete failed earlier) | Treat as stale: break (delete ref, recreate, takeover comment) |
| Comment fails after ref succeeds | Ref is the lock — retry once, warn, proceed |
| Release fails | Log; TTL is the backstop |
| Release attempted but claim's `runId` is not this run's | Skip the delete, log — a successor holds the lock (ownership rule) |
| Ref listing fails in `/tidy` | Skip the sweep step, note it in the report |
| Any other `gh` failure during claim | Drop that issue, log, continue — partial batch over hung batch |

## Consumers

| Skill | Role |
|---|---|
| `/claude-tweaks:flow` (`from-recon.md` Step 2.5) | Claims each pulled issue before spec derivation; releases on console decline; failure cards offer release |
| `/claude-tweaks:wrap-up` (`cleanup-procedures.md` item 8 / Section E) | Releases claims with the branch outcome as reason |
| `/claude-tweaks:tidy` (`scan-procedures.md` Step 4.7) | Sweeps stale/orphaned claims; releases only after batch approval |

**Non-consumers (deliberate):** `/recon` files issues but never works them — a concurrent-
filing race costs at worst one duplicate issue, caught by dedup next run. Interactive
single-spec `/build` does not claim — the user is present and collision is visible.
