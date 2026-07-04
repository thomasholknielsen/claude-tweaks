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
gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${N}" -f "sha=${SHA}"

# Release:
gh api -X DELETE "repos/{owner}/{repo}/git/refs/claims/issue-${N}"

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
  host:require('os').hostname(),now:Date.now()}).commentBody)" "$N" "$SHA" "$RUN_ID" > "$TMP/claim-$N.md"
gh issue comment "$N" --body-file "$TMP/claim-$N.md"
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
gh api "repos/{owner}/{repo}/issues/${N}/comments?per_page=100" > "$TMP/comments-$N.json"
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimStatus(require(process.argv[1]),Date.now())))" "$TMP/comments-$N.json"
```

Output: `{claimed, claim, stale}`. `claimed: true` with `stale: true` means the claim is
breakable, not absent.

## TTL and staleness

Default TTL 72h from `claimedAt`; stale iff `now >= claimedAt + ttlHours`. No heartbeat in
v1 (runs last hours, not days; a renewal comment is a reserved future extension).

**Breaking a stale claim:** delete the ref, recreate it (atomicity applies again — of two
racing breakers, exactly one gets 201), post a new claim comment noting the takeover and the
prior run id. **A claim whose comment is unreadable or missing is never stale** — treat as
live, skip the issue, and let `/tidy`'s sweep surface it for human judgment.

## Release triggers

| Trigger | Owner | Reason string |
|---|---|---|
| Spec merged / PR opened / discarded | `/wrap-up` cleanup item 8 | `merged: spec {N}` / `pr-opened: spec {N}` / `abandoned: spec {N}` |
| User declines the brief at the Review Console | `/flow` | `declined at review console` |
| Pipeline stops at a gate, user chooses not to resume | `/flow` failure card (offered, not automatic) | `failed: {gate}` |
| Stale or orphaned claim in hygiene pass | `/tidy` Step 4.7 (after batch approval) | `swept: stale claim` / `swept: issue closed` |
| Interrupted session | nobody — TTL ages it out; `/tidy` sweeps it | — |

Every claim, skip, break, and release is logged to the run's `decisions.md` per
`_shared/auto-decision-log.md` (status `AUTO`, reversible: release deletes the ref).

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
