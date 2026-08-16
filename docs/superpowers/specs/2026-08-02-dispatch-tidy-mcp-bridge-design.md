# Dispatch + Tidy: GitHub MCP Bridge (closing #60, #61)

> **Status:** specified — derived work complete (#60 and #61 both closed; Slice 1 plan executed and archived). Marked by /claude-tweaks:tidy 2026-08-16.

## Context

`/claude-tweaks:dispatch` and `/claude-tweaks:tidy`'s `--scope=github` repo-wide scan both hard-gate on the `gh` CLI being present. Claude Code cloud Routine sandboxes have no `gh` CLI on PATH — only GitHub MCP tools (confirmed directly from a live cloud firing's own self-report, filed as issue #1201 in `memenu-io/memenu-app`: *"You do NOT have access to the `gh` CLI... use the GitHub MCP server tools... for ALL GitHub interactions"*). Net effect: `dispatch`'s scheduled Routine has never once reached its actual queue/build logic, and `tidy`'s GitHub-triage scan silently no-ops on every cloud firing.

### What was already tried, and what actually happened

A prior branch (`docs/superpowers/plans/2026-07-28-gh-cli-mcp-fallback.md`, ADR [0008](../../decisions/0008-gh-cli-locally-github-mcp-in-cloud-capability-detected.md)) attempted exactly this bridge. Verified against git history, not the plan's own (unreliable — all 46 checkboxes unchecked) status:

- **Dispatch's MCP Preflight** (`274e30e`) was reverted the next day (`d4bdfb9`): *"nothing bridges dispatch's read path (Step 2's `gh issue list` queue pull, the dependency-check `gh issue view` / `gh api graphql` calls, the contested-claim comments fetch, all of `settle-and-merge.md`), so the run no longer failed cleanly at Preflight — it failed unstructured, deep inside Step 2."* This is a real regression, not a stylistic revert: a partially-bridged path is worse than the original hard gate, because it turns a clean, informative stop into a confusing mid-execution crash.
- **Tidy's MCP digest doc** (`skills/tidy/github-routine-procedures.md`) was deleted (`f9db8b8`) when the `github-triage` routine was folded into tidy's base sweep — an unrelated refactor orphaned the file, not a finding that the approach was wrong.
- **Health-state's MCP-fallback layer** was superseded, not fixed: `durable-state.js` was rewritten to plain git-native plumbing (`hash-object`/`mktree`/`commit-tree`/`push`, `ddfde50`), which needs neither `gh` nor MCP, and the now-dead MCP code was deleted as confirmed-unused (`cd56497`). This is the strongest positive precedent in this history: the best fix for a "needs GitHub API" problem is sometimes discovering it doesn't, in fact, need the GitHub API at all.

**What's already solved, just not wired up:** issue #61's own text flagged *"no MCP tool creates an arbitrary ref outside `refs/heads/*`"* as the hard part of the claim mechanism. `skills/_shared/issue-claims.md` already documents the actual fix — a file-based compare-and-set on a dedicated `claims-registry` branch via `create_or_update_file`'s sha-gated write semantics, which needs no ref creation at all. Dispatch's Step 4 already has this MCP procedure written out in full; it's just marked "not reachable in practice today" because Preflight stops before reaching it.

**What was never verified, even for the parts that shipped:** ADR 0008's own Consequences section: *"The MCP branch-bootstrap step... has not been verified against a live GitHub MCP connection — logged as a known open risk."* Careful call-site tracing was already the standard the first attempt held itself to; it wasn't sufficient. This design treats live verification as a first-class deliverable, not an assumed side effect of careful design.

## Decision

Two independently-shippable slices, same principle applied to each:

1. For every `gh`-only call site in scope, first check whether it's genuinely GitHub-hosted state or just data derivable from the local git checkout. If the latter, replace it with plain `git` — removing the dependency entirely, per the health-state precedent — rather than writing an MCP mapping for something that doesn't need one.
2. For what's genuinely GitHub-hosted (issue/PR/comment state), fill the missing row in `_shared/github-write-transport.md`'s CRUD mapping table.
3. Wire the consuming skill's Preflight/Detection Ladder to branch on the same capability probe the claim mechanism already uses (`gh` present → `gh`, unchanged; absent → MCP).
4. Build a small diagnostic Routine that exercises every MCP primitive the slice now depends on, against disposable test data, in a real cloud sandbox.
5. Only once that Routine reports a clean pass, in the same change, flip the gate from hard-fail to conditional.

**Update (post-Slice-1):** steps 4-5 originally assumed a throwaway Routine, deleted after use. Slice 1's own implementation discovered `RemoteTrigger` has no delete action at all, and built `skills/_shared/routine-diagnostic-probe.md` instead — a reusable, one-per-project diagnostic slot that stays in the account (disabled, at rest) and is updated/re-fired for each new diagnostic rather than created-then-deleted. Slice 2 should use that same shared procedure rather than re-deriving a throwaway-Routine mechanism from this section.

**The `gh`-CLI path is unchanged everywhere, byte-for-byte, for every call site.** This is additive, per ADR 0008's standing decision (MCP calls cost meaningfully more context/tokens than the equivalent `gh api` call, so the cheaper path stays the default whenever it's available).

**Verification is a one-time, development-time gate, not a runtime feature.** Each slice's own plan bridges every call site with that slice's hard gate left exactly as it is today (mirroring how Step 4's claim block already exists, documented but dormant). That slice's diagnostic Routine gets built and fired for real, against `memenu-app`'s existing cloud environment, as the plan's second-to-last task. Only if every primitive passes does the plan's final task flip that slice's gate and delete the Routine. If anything fails, the plan stops there: the gate stays exactly as today, the specific failure gets filed, and dropping the gate becomes separately-scoped future work informed by what broke — deliberately mirroring how `d4bdfb9` handled its own failure, except this time the failure surfaces before merging, not after.

**This design produces two separate implementation plans, not one.** Slice 1 gets written, executed, and verified (including its own live Routine firing) as a complete, independently-mergeable unit before Slice 2's plan is even written — not just implemented-then-merged-together. This is the direct consequence of rejecting the "one combined slice" alternative below: if Slice 2's plan existed already, a delay or failure in its own diagnostic Routine would create pressure to hold Slice 1's already-verified, already-working fix hostage to it. Writing Slice 2's plan is out of scope for the immediate next step (`writing-plans`, below) — it starts only after Slice 1 has shipped and its own gate has actually dropped.

## Slice 1: Dispatch's queue/claim/settle/merge path (#61)

**Files:** `skills/dispatch/SKILL.md`, `skills/dispatch/settle-and-merge.md`, `skills/_shared/github-write-transport.md` (new CRUD rows), `skills/_shared/issue-claims.md` (drop the "not reachable" caveat once wired).

| Call site | Today | Bridge |
|---|---|---|
| Step 2: queue pull (`gh issue list --label auto:build`) | `gh`-only | Already mapped (`list_issues`) — wire the branch |
| Step 2: open-numbers pull + per-dependency state check (`gh issue view --json state`) | `gh`-only | **New CRUD row**: get single issue by number |
| Step 2: native `work-links` GraphQL dependency query | `gh`-only, no passthrough | No new mapping — when `gh` is absent, skip attempting the call at all and go straight to the same outcome the existing on-error fallback already produces (no native filtering this run, warn). Same outcome, reached via a capability check instead of a failed call. |
| Step 4: claim/release (`create_or_update_file` CAS) | Fully documented, dormant | Wire only — no redesign |
| Step 4 / Settle: contested-claim & retry-ceiling comment fetch (`gh api .../comments`) | `gh`-only | **New CRUD row**: list issue comments |
| Settle: label edits | `gh`-only | Already mapped (`issue_write`) |
| Auto-merge gate: default-branch lookup (`gh api repos/{owner}/{repo}`) | `gh`-only | **Removed, not mapped** — `git remote show origin` / `git symbolic-ref refs/remotes/origin/HEAD`, needs neither `gh` nor MCP |
| Auto-merge gate: merge + push | Already plain `git` | Unchanged |

**Preflight change:** Detection Ladder check 2 (`gh` installed) stops being an unconditional hard gate — but only in the version of `dispatch/SKILL.md` that ships *after* the diagnostic Routine (below) has verified clean. There is no runtime "has this been verified" check anywhere in the shipped prose; verification gates *whether this edit gets written and merged at all*, not something Preflight evaluates at firing time. Once shipped, the rule is unconditional: `gh` present → today's behavior, unchanged; `gh` absent → proceed via the now-verified MCP path. If the diagnostic Routine fails, this edit is simply never made — the plan stops with the hard gate exactly as it is today.

### Slice 1 diagnostic Routine

Originally planned as throwaway, created via `/claude-tweaks:routine` against `memenu-app`, deleted after use — actually built and fired via `skills/_shared/routine-diagnostic-probe.md`'s reusable slot instead (see the Decision section's post-Slice-1 update above). Runs in a real cloud sandbox (no `gh`) and, using data it creates and destroys itself:

1. Create a test issue (clearly marked as a diagnostic probe).
2. Get single issue by number — re-fetch the one just created.
3. List issues by label — confirm the queue-pull query pattern works.
4. List issue comments on the test issue (starts empty).
5. Add a comment, then list comments again — confirms the exact read-after-write pattern the contested-claim check depends on.
6. Edit labels — add then remove a test label.
7. `create_or_update_file` CAS sequence against a dedicated scratch path (not the real `claims-registry` data): write without `sha` (should succeed), write again without `sha` (should fail — proves create-only semantics), write with the correct `sha` (should succeed). This is the single most important probe — it's the exact mechanism the claim lock's correctness depends on.
8. `git remote show origin` — confirms the default-branch replacement resolves in the sandbox.
9. Close the test issue, remove the scratch CAS path.

Reports one PASS/FAIL line per primitive. Touches no real backlog state anywhere in the sequence.

## Slice 2: Tidy's repo-wide PR/issue scan (#60)

Sequenced after Slice 1 verifies clean. Genuinely new ground: no PR-related MCP tool has ever been mapped in this codebase (only issues have a documented mapping today). This design commits to discovering and confirming those tool names/schemas against a live cloud session at implementation time — not guessing them now.

**Files:** `skills/_shared/github-pr-scan.md` (`repo-wide` scope + Detection Ladder), `skills/_shared/github-write-transport.md` (new PR-related CRUD rows).

| Call site | Bridge |
|---|---|
| Open PR list (`gh pr list --json ...`) | **New CRUD row**: list pull requests — MCP tool name confirmed at implementation time |
| PR checks / CI status (`gh pr checks`) | **New CRUD row**: get PR status/checks |
| Merged/closed PR list (local-remnant cross-check) | Same PR-list mapping, filtered by state |
| Unresolved review-thread count (custom GraphQL) | **Highest-uncertainty item in this whole design** — may not have a clean MCP equivalent; see Open Risks |
| Grant-queue counts (`gh issue list --state open`) | Already mapped (`list_issues`) |
| Auto-merged-this-week commit scan (`gh api .../commits?since=`) | Git-native candidate — a cloud sandbox has the repo checked out, so `git log --since=... --grep="\[auto-merge\]\|\[fast-lane\]"` against the default branch likely replaces this entirely |

Tidy's repo-wide scope is read-only except closing stale/superseded findings (already-mapped `issue_write`) — it never creates PRs.

### Slice 2 diagnostic Routine

Simpler than Slice 1's: read-only probes against real, already-existing open PRs in `memenu-app` (list PRs, get checks for one, attempt the review-thread query) rather than creating/tearing down PR fixtures. Same PASS/FAIL reporting shape.

## Error handling

- Diagnostic Routine fails on any primitive → gate stays exactly as today for that slice; the specific failure is filed as a finding; nothing ships flipped.
- A tool schema differs from documented assumptions (the exact risk ADR 0008 flagged and never closed) → implementation inspects the live MCP tool list in the actual target cloud session first, writes call-site prose against the confirmed schema — never the reverse.
- If the review-thread MCP equivalent genuinely doesn't exist → that one sub-check degrades to "unavailable under MCP, skipped" (logged, non-blocking) rather than failing Slice 2's whole repo-wide scope — the same fail-open philosophy the Detection Ladder already applies at the whole-scan level, applied at finer grain to one sub-check.

## Testing

Any new JS helper code gets `node --test` coverage per this repo's convention; `npm test` stays green throughout. The diagnostic Routine's live firing is the integration test for the MCP paths themselves — there is no way to unit-test a real MCP tool call from a normal local session (no GitHub MCP server is connected in an ordinary interactive session).

## Alternatives considered

- **One combined slice, single diagnostic Routine, single gate-drop.** Same technical content, ties dispatch's well-understood fix to tidy's uncharted PR/MCP-tool discovery — if that discovery drags, dispatch's already-ready fix waits on it too. Rejected in favor of sequencing.
- **Dispatch only, defer #60 as unscoped future work.** Solves the more urgent, better-understood problem sooner; leaves #60 open (acceptable, since it already fails open gracefully). Rejected because the user explicitly wants both closed in this effort — captured here as the honest fallback if Slice 2's tool discovery turns out to be a dead end.
- **A code-level transport abstraction (one function that picks `gh` or MCP internally).** Not viable: MCP tools can only be invoked from the calling agent's own conversational turn, never from a spawned subprocess (confirmed by this codebase's own prior design work on `durable-state.js`). A module that shells out for its own I/O cannot attempt the MCP call itself — it must signal what needs writing and let the calling skill's own prose drive the actual call. The existing per-call-site "gh path / MCP path documented in prose, executed by the calling agent's own turn" pattern is a platform constraint, not a stylistic choice.

## Open risks

- **Review-thread MCP equivalent may not exist cleanly.** No GitHub MCP tool for PR review-thread resolution state has been confirmed anywhere in this codebase's history. If implementation-time discovery comes up empty, this sub-check degrades per the Error Handling section rather than blocking Slice 2.
- **Live verification requires a real cloud environment and real wall-clock time.** Neither can be simulated from a normal local/interactive session. The plan will have a genuine human-checkpoint task here (build + fire the diagnostic Routine against `memenu-app`, wait for/trigger a firing, inspect the result) rather than a fully autonomous one.
