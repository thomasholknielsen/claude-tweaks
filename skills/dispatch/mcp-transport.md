# Dispatch — GitHub MCP Transport (`gh` absent)

Loaded by `/claude-tweaks:dispatch` only when Preflight's Detection Ladder check 2 resolves `gh` as
absent. Every call site in `SKILL.md` runs its `gh` CLI form unchanged when `gh` is present, so a
normal run never reads this file.

Live as of Task 10 of the dispatch MCP bridge plan (was `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md` — deleted `d83f0720`), which verified the
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

`_shared/issue-claims.md`'s "The lock" now defines one blob-store claim procedure both
transports follow — this section is the MCP tool-call form of it, not a separate mechanism.
`SKILL.md` Step 4's gh-CLI form uses the equivalent `gh api contents` calls against the same
`claims/issue-<n>.json` path on `claims-registry`; the bootstrap-then-add `bot:in-progress` and
claim-comment steps that follow either form are plain label and comment operations and use the
standard CRUD mapping on either transport.

For each member of the selected group, generate the claim payload and follow
`_shared/issue-claims.md`'s "The lock" section's read-then-classify-then-write procedure — read
the claim file first, classify with `classifyClaimBlob`, then branch on
absent/tombstone-or-stale/live/unreadable:

```bash
for ISSUE in "${GROUP_MEMBERS[@]}"; do
  node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
    console.log(JSON.stringify(c.claimPayload({issueNumber:Number(process.argv[1]),
    runId:process.argv[2],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
    host:require('os').hostname(),now:Date.now()})))" "$ISSUE" "$RUN_ID" > "/tmp/claim-payload-${ISSUE}.json"
  # Then run _shared/issue-claims.md's "The lock" procedure against this payload's claimPath on
  # CLAIMS_BRANCH: read the file first, classify with classifyClaimBlob; absent ->
  # create_or_update_file omitting sha; tombstone or stale -> the same call WITH sha = the
  # file's current blob sha; live or unreadable -> contested, no write. Branch on that outcome
  # back in SKILL.md's Step 4, per member, exactly as the gh path branches.
done
```

## Step 4 — contested-claim classification (on a rejected write)

Read the claim file at `claimPath` on `CLAIMS_BRANCH` and classify with `classifyClaimBlob`,
exactly as the `gh` path does — this is the authoritative read; see `claim-outcomes.md` for the
full branch table.

## Step 4 — `--claim-only` release

`SKILL.md` prints the `gh` release form at its `--claim-only` stop point. The MCP-path release follows `_shared/issue-claims.md`'s Release procedure directly — resolve the claim file's current sha, then `create_or_update_file` with the payload's `tombstoneContent` and that sha. This is tool calls, not shell commands, so there is no bash block for it.
