# Dispatch — Claim Outcomes Other Than a Clean Success

Loaded by `/claude-tweaks:dispatch` Step 4 when the write attempt on any member of the selected group returns something other than a clean success (a rejected create-only/conditional write, an unresolvable `gh`/MCP failure, or a group that can only be partly claimed), and by the `--claim-only` modifier's stop point. A group that claimed cleanly on every member and carries no `--claim-only` never needs this file — it goes straight to Step 5.

Step and section references below (`Step 3`, `Step 5`, "Input table above") resolve against this skill's `SKILL.md`, not against this file.

**On a rejected write (contested):** re-read the claim file at `claimPath` on `claims-registry` and classify with `classifyClaimBlob`, exactly as `_shared/issue-claims.md`'s "Reading claim state" section describes, then branch on the full returned shape — do not collapse to a two-way live/stale fold:

```bash
gh api "repos/{owner}/{repo}/contents/claims/issue-${ISSUE}.json?ref=claims-registry" -q '.content' | base64 -d > "/tmp/dispatch-claim-${ISSUE}.json"
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  const content = require('fs').readFileSync(process.argv[1],'utf8');
  console.log(JSON.stringify(c.classifyClaimBlob(content, Date.now())))" "/tmp/dispatch-claim-${ISSUE}.json"
```

**MCP path** (`gh` unavailable): see `mcp-transport.md` in this skill's directory — the same read-then-classify, over the MCP tools.

**Deprecation window only:** when the blob read above comes back absent (no file, no rejection possible — meaning the rejection came from the ref-listing pre-check, not the blob write), fall back to the legacy comment fold: fetch comments and fold through `claimStatus`, per `_shared/issue-claims.md`'s "Reading claim state" legacy-fallback paragraph. This branch should not fire once the deprecation window has closed.

Resolve the returned classification per `_shared/issue-claims.md`'s own "Failure posture" table (not restated here — that file's header explicitly asks consumers not to duplicate it inline): `'live'` (skip), `'stale'` (break: conditional overwrite, takeover comment), `'unreadable'` (treat as live), `'tombstone'` (treat as a fresh reclaim: conditional overwrite, new claim comment).

Any other `gh` failure during claim: skip, log, continue.

**Partial claim.** If any member of the group resolves to Skip (a live claim held elsewhere) or hits an unresolvable `gh` failure, the group cannot be fully claimed: release every member this firing already claimed this round (`releasePayload`, reason `never-started: file-overlap group partial claim`), log, and move to the next candidate group (bare, and `#N,#M,...` — per Step 3, an explicit-list group proceeds "exactly as a bare-mode pick would," so a partial-claim failure on one named group moves to the next named group rather than aborting the rest of the list) or report nothing eligible this firing (`next` / `#N`, which each name only one group to begin with). A Break outcome (stale-claim takeover) is not a partial-claim failure — it succeeds in claiming that member, so it never triggers the abort path on its own.

**`--claim-only` stop point.** When this modifier is present (Input table above), stop here for every successfully claimed group — do not proceed to Step 5. Report each claimed group's members, confirm `bot:in-progress` and the claim comment landed, and print the manual-release commands for each member (mirrors `_shared/issue-claims.md`'s "The lock" → Release — resolve the blob's current sha first, then overwrite it with the tombstone content):

(the `gh` form; for the gh-absent claim and release equivalents see `mcp-transport.md` in this
skill's directory):

```bash
CURRENT_SHA=$(gh api "repos/{owner}/{repo}/contents/claims/issue-{n}.json?ref=claims-registry" -q .sha)
gh api --method PUT "repos/{owner}/{repo}/contents/claims/issue-{n}.json" \
  -f "message=Release claim on issue #{n}" -f "content=$(base64 <<<"$TOMBSTONE_CONTENT")" \
  -f "branch=claims-registry" -f "sha=${CURRENT_SHA}"
gh issue edit {n} --remove-label bot:in-progress
```

Every Skip/Break/partial-claim outcome above is unaffected by this modifier — it only short-circuits the path between a *successful* claim and Step 5's Task-agent dispatch.
