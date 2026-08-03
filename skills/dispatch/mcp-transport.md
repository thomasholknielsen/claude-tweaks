# Dispatch — GitHub MCP Transport (`gh` absent)

Loaded by `/claude-tweaks:dispatch` only when Preflight's Detection Ladder check 2 resolves `gh` as
absent. Every call site in `SKILL.md` runs its `gh` CLI form unchanged when `gh` is present, so a
normal run never reads this file.

Live as of Task 10 of `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md`, which verified the
whole chain against a live cloud run and flipped Preflight's check 2 from a hard gate to a branch.
CRUD mappings throughout are per `_shared/github-write-transport.md`. Settle and the Auto-merge gate
have their own MCP notes in `settle-and-merge.md`; the self-report block's MCP mapping lives with
that block, in `headless-self-report.md`.

---

## Preflight — check 3 on the MCP transport

When `gh` is absent, check 3 (authenticated + repo reachable) is
satisfied via a bounded `list_issues` call (e.g. `list_issues {owner, repo, state: "open", perPage:
1}`) — a lightweight, confirmed-working read (per `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md`'s
Task 2 live verification) that fails identically to `gh repo view --json owner,name` when auth or
repo access is broken. This is dispatch-specific documentation: only dispatch treats check 3 as a
hard gate that needs an MCP equivalent — `_shared/github-pr-scan.md` itself defines check 3 purely
as `gh repo view`, unchanged, since its other consumers (`/help`, `/tidy`) fail-open on this ladder
and don't need one.

## Preflight — why check 2 no longer gates on its own

Check 2 no longer gates on its own as of the MCP-bridge plan's Task 10 — every call site that used to be
`gh`-only end to end (Step 2's queue pull and dependency checks, the contested-claim comment
fetch, all of `settle-and-merge.md`) now has a confirmed, live-verified MCP path
(`docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md`, Tasks 1-2's diagnostic Routine). A
prior attempt at this same bridge (`274e30e`, reverted the next day as `d4bdfb9`) shipped this
exact gate change without finishing the read-path bridge first, producing an unstructured
`gh: command not found` crash instead of a clean stop — this version does not repeat that
mistake, since every call site was bridged and verified before this line changed.

## Step 2 — queue pull and per-dependency open-state check

The queue pull uses the confirmed "list issues by label" mapping; the per-dependency open-state check (the `gh issue view "$DEP" --json state` loop) uses the confirmed "get single issue by number" mapping, checking the returned state field for `OPEN`. Both replace their `gh`-CLI equivalent one-for-one — no change to the surrounding `node -e` eligibility/dependency logic, which only consumes the fetched JSON shape, not how it was fetched.

## Step 4 — claiming a group

Replaces `SKILL.md` Step 4's `gh`-path atomic ref creation (`gh api .../git/refs`), not the
bootstrap-then-add `bot:in-progress` and claim-comment steps that follow it — those are plain label
and comment operations and use the standard CRUD mapping on either transport.

For each member of the selected group, generate the claim payload and follow
`_shared/issue-claims.md`'s "The lock" section's MCP claim procedure — read the claim file
first, then branch on missing / tombstone-or-stale / live, rather than a bare create-only
write:

```bash
for ISSUE in "${GROUP_MEMBERS[@]}"; do
  node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
    console.log(JSON.stringify(c.claimPayload({issueNumber:Number(process.argv[1]),
    sha:process.argv[2],runId:process.argv[3],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
    host:require('os').hostname(),now:Date.now()})))" "$ISSUE" "$SHA" "$RUN_ID" > "/tmp/claim-payload-${ISSUE}.json"
  # Then run _shared/issue-claims.md's "The lock" MCP claim procedure against this payload's
  # claimPath on CLAIMS_BRANCH: read the file first; missing -> create_or_update_file omitting
  # sha; tombstone or TTL-stale -> the same call WITH sha = the file's current blob sha;
  # live and non-stale -> contested. Branch on that outcome back in SKILL.md's Step 4, per
  # member, exactly as the gh path branches on 201 vs 422.
done
```

## Step 4 — contested-claim comment fetch (on 422)

Use the confirmed "list issue comments" mapping from `_shared/github-write-transport.md`, then fold the result through `claimStatus` exactly as the `gh` path does — `claimStatus` accepts either raw `gh` comment objects or the MCP tool's comment objects, since it only reads a `.body` string field off each.

## Step 4 — `--claim-only` release

`SKILL.md` prints the `gh` release form at its `--claim-only` stop point. The MCP-path release follows `_shared/issue-claims.md`'s Release procedure directly — resolve the claim file's current sha, then `create_or_update_file` with the payload's `tombstoneContent` and that sha. This is tool calls, not shell commands, so there is no bash block for it.
