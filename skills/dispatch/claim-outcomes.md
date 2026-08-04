# Dispatch — Claim Outcomes Other Than a Clean Success

Loaded by `/claude-tweaks:dispatch` Step 4 when the atomic claim attempt on any member of the selected group returns something other than a clean success (a 422 contested result, an unresolvable `gh`/MCP failure, or a group that can only be partly claimed), and by the `--claim-only` modifier's stop point. A group that claimed cleanly on every member and carries no `--claim-only` never needs this file — it goes straight to Step 5.

Step and section references below (`Step 3`, `Step 5`, "Input table above") resolve against this skill's `SKILL.md`, not against this file.

**On 422 (contested):** fetch comments and fold through `claimStatus` exactly as `_shared/issue-claims.md`'s "Reading claim state" section describes, then branch on the full returned shape — do not collapse to a two-way live/stale fold:

```bash
gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100" > "/tmp/dispatch-claim-${ISSUE}.json"
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(JSON.stringify(c.claimStatus(require(process.argv[1]),Date.now())))" "/tmp/dispatch-claim-${ISSUE}.json"
```

**MCP path** (`gh` unavailable): see `mcp-transport.md` in this skill's directory — the confirmed "list issue comments" mapping, folded through `claimStatus` exactly as the `gh` path does.

Resolve the returned `{claimed, stale, everReleased}` shape per `_shared/issue-claims.md`'s own "Failure posture" table (not restated here — that file's header explicitly asks consumers not to duplicate it inline) — its `Claim ref 422` rows cover live claim (skip), stale claim (break: delete ref, recreate, takeover comment), unreadable/never-claimed (treat as live), and released-but-undeleted (treat as stale).

Any other `gh` failure during claim: skip, log, continue.

**Partial claim.** If any member of the group resolves to Skip (a live claim held elsewhere) or hits an unresolvable `gh` failure, the group cannot be fully claimed: release every member this firing already claimed this round (`releasePayload`, reason `never-started: file-overlap group partial claim`), log, and move to the next candidate group (bare, and `#N,#M,...` — per Step 3, an explicit-list group proceeds "exactly as a bare-mode pick would," so a partial-claim failure on one named group moves to the next named group rather than aborting the rest of the list) or report nothing eligible this firing (`next` / `#N`, which each name only one group to begin with). A Break outcome (stale-claim takeover) is not a partial-claim failure — it succeeds in claiming that member, so it never triggers the abort path on its own.

**`--claim-only` stop point.** When this modifier is present (Input table above), stop here for every successfully claimed group — do not proceed to Step 5. Report each claimed group's members, confirm `bot:in-progress` and the claim comment landed, and print the manual-release commands for each member (mirrors `_shared/issue-claims.md`'s "The lock" → Release):

(the `gh` form; for the gh-absent claim and release equivalents see `mcp-transport.md` in this
skill's directory):

```bash
gh api -X DELETE "repos/{owner}/{repo}/git/refs/claims/issue-{n}"
gh issue edit {n} --remove-label bot:in-progress
```

Every Skip/Break/partial-claim outcome above is unaffected by this modifier — it only short-circuits the path between a *successful* claim and Step 5's Task-agent dispatch.
