---
record: 172
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 172: github-pr-scan's Detection Ladder still hard-skips on missing gh, while /tidy Step 4.7 no longer does

Surface: backend

## Current State

The file layout has moved since this issue was originally filed — verified against the live repo during this shaping pass, not assumed from the issue text. Check 2 ("gh CLI installed") no longer lives inline in `skills/_shared/github-pr-scan.md`; it was extracted to `skills/_shared/forge-detection.md` (commit `31df65dc`, "Cut ~300 KB of core-loop re-reads … forge-detection extraction"), and `github-pr-scan.md`'s own "Detection Ladder" heading is now a one-line stub pointing there. The extraction *also* already added the general transport-aware conditional the issue asks for — `forge-detection.md` now reads:

> **Check 2 does not gate on its own for a transport-aware consumer.** `gh` present → proceed via the `gh` CLI. `gh` absent → a consumer with a documented MCP fallback … proceeds via that path instead of stopping; a consumer with no MCP fallback still stops at check 2.

So the framework exists, but the concrete gap the issue is really about is still open: `skills/_shared/github-pr-scan.md` — the file that owns every scope `/help` Stages 4.5-4.7 and `/tidy` Step 4.8 (`repo-wide` scope) actually consume — contains **zero** MCP references anywhere (verified by grep). None of its `gh issue list`/`gh pr list` calls have a documented MCP fallback, so by `forge-detection.md`'s own rule, every one of these consumers currently takes the "no MCP fallback → stop at check 2" branch — i.e., the practical behavior is still the old hard-skip, just routed through a general-purpose conditional instead of a scope-specific one. `/tidy` Step 4.7 (`scan-procedures.md:164`, confirmed present) is different: it has a *real*, working MCP fallback, because it delegates to `_shared/issue-claims.md`'s own documented MCP-path "List all claims" mechanism for reading the `claims/` blob keyspace. Step 4.8, one step later, has no equivalent for `github-pr-scan.md`'s scope sections.

This was left out of #163's fix because the consequence differs: #163's defect silently re-filed a `wontfix`-suppressed finding as a new born-`ready` issue reachable by an unattended implementer via `/claude-tweaks:dispatch`. This one degrades a read-only report and says so in its own output (`GitHub scan skipped` / `gh CLI not installed`, severity `info`) — visible, not silent or destructive — which is why it's a separate, lower-urgency fix rather than part of #163.

A related but distinct gap, confirmed present at the cited location: `skills/wrap-up/docs-health-integration.md:41` builds a fifth `by:docs-health` issue index for D1's `restructural` filing path (`gh issue list --label by:docs-health --state all …`). It carries no "skip when gh absent" wording at all — no branch of any kind — so a `gh`-absent sandbox can invoke `validate-findings --issues` against a file that was never written. Lower risk than the Routine-reachable path above (wrap-up is interactive, so a human sees the failure), but it's the same missing branch, just unguarded rather than mis-guarded.

## Deliverables

1. **Primary fix — `skills/_shared/github-pr-scan.md`'s scope sections:** give the scopes consumed by `/help` Stages 4.5-4.7 and `/tidy` Step 4.8 (`repo-wide`) a real MCP fallback for their `gh issue list`/`gh pr list` calls, so `forge-detection.md`'s existing transport-aware conditional actually has a documented path to take instead of always falling through to "stop at check 2." Before implementing, settle the design question below — it changes the shape of this fix.
2. **Design decision to settle first:** `_shared/github-write-transport.md`'s CRUD mapping covers issues (`list_issues`, `issue_write`, `issue_read`, `add_issue_comment`), not pull requests — confirmed no `list_pull_requests` (or any PR) row exists. `github-pr-scan.md`'s `current-pr` and `repo-wide` scopes both call `gh pr list`/`gh pr view`/`gh pr checks`. Choose one:
   - (a) add a PR row (or rows) to the MCP CRUD mapping so PR-list/PR-view items route through MCP too, or
   - (b) degrade the ladder per-item — issue-list items route via MCP, PR-scoped items skip individually with a narrower message, rather than the whole scan skipping wholesale.
   The issue reporter's own assessment is that (b) is probably right and is the smaller change, but flags it as a decision to make deliberately rather than assume.
3. **Consumers to verify after the fix:** `/claude-tweaks:help` Stages 4.5/4.6/4.7 (which consume `github-pr-scan.md`'s scope sections directly) and `/claude-tweaks:tidy` Step 4.8's `repo-wide` scope — confirm each produces a correct (non-skipped, or correctly narrowed) scan in a `gh`-absent environment after the change. Stage 4.8 of `/help` and `/tidy`'s `acceptance-gap`/`parent-gate` scopes consume `forge-detection.md`'s ladder directly rather than a `github-pr-scan.md` scope section — out of scope for this fix, since they carry no `gh issue list`/`gh pr list` calls of their own to route.
4. **Secondary fix — `docs-health-integration.md`:** add a `gh`-absent branch to the fifth `by:docs-health` issue index build at `skills/wrap-up/docs-health-integration.md:41`, so `validate-findings --issues` is never invoked against a file that was never written. Lower priority than items 1-3 (flagged as "also worth a look" in the original report, not the core ask) — include if it fits the same change cleanly; otherwise capture it as a separate follow-up rather than silently dropping it.

## Acceptance Criteria

- [ ] `skills/_shared/github-pr-scan.md`'s `current-pr` and `repo-wide` scope sections (the ones actually consumed by `/help` Stages 4.5-4.7 and `/tidy` Step 4.8's `repo-wide` scope) no longer resolve to a full scan skip solely because `command -v gh` fails; they route through a documented MCP path per the chosen design (item 2 above), giving `forge-detection.md`'s existing transport-aware conditional a real fallback to select.
- [ ] The PR-vs-issue MCP mapping gap is explicitly resolved one way or the other (new PR row(s) in `_shared/github-write-transport.md`, or a per-item degrade in the affected scope sections) — not left implicit.
- [ ] `/claude-tweaks:help` (Stages 4.5-4.7) and `/claude-tweaks:tidy` (Step 4.8, `repo-wide` scope) both exercised (manually or via existing test coverage) in a `gh`-absent condition and confirmed to no longer wholesale-skip when the mapping (or per-item degrade) covers their calls.
- [ ] `skills/wrap-up/docs-health-integration.md:41`'s fifth issue-index build either gains a `gh`-absent branch guarding the `validate-findings --issues` call, or a follow-up work record is filed for it if not addressed in this change.
- [ ] Any prose changes to `skills/_shared/github-pr-scan.md`, `skills/_shared/forge-detection.md`, `skills/_shared/github-write-transport.md`, and/or `skills/wrap-up/docs-health-integration.md` pass the existing skill-prose-conformance test suite (`node --test tests/`).

## Technical Approach

Read `_shared/github-write-transport.md`'s current CRUD mapping, `_shared/forge-detection.md`'s full ladder text, and `_shared/github-pr-scan.md`'s `current-pr`/`repo-wide` scope sections in full before editing — this shaping pass already confirmed the extraction and the transport-aware conditional exist, but re-verify at build time in case either has moved again. Mirror `/tidy` Step 4.7's existing gh-absent-but-MCP-available branch (via `issue-claims.md`'s MCP path) as the template for how a scope section should describe its own fallback. Keep the fix scoped to the detection/routing logic — this is a skill-prose change, not new `bin/` code, so verification is `node --test tests/` (the skill-prose-conformance suite) plus a manual trace of the ladder against a simulated `gh`-absent state.

## Gotchas

- The files this touches (`github-pr-scan.md`, `forge-detection.md`, `github-write-transport.md`, and optionally `docs-health-integration.md`) are all skill-prose consumed by multiple call sites (`/help`, `/tidy`, `/wrap-up`, `/dispatch`) — a change to the shared ladder or CRUD mapping must be re-verified against every consumer's step reference, not just the file being edited directly.
- This record's Current State was rewritten during shaping to match the file layout as of this pass (post `31df65dc` extraction) — the original report below still describes the pre-extraction layout (`github-pr-scan.md` as a single 39 KB file with the ladder inline) and is kept verbatim for provenance, not as the current file map.

## Original request

github-pr-scan's Detection Ladder still hard-skips on missing gh, while /tidy Step 4.7 no longer does

**Related:** #237

**Origin:** the repo-wide sweep requested in the #163 fix — "check whether the same 'skip when gh absent' wording exists anywhere I did not grep." This is the one surviving instance of the wording class that was not fixed, because its blast radius differs from #163's.

## The inconsistency

`skills/_shared/github-pr-scan.md`'s Detection Ladder, check 2:

| # | Check | Command | On failure, emit |
|---|-------|---------|------------------|
| 2 | gh CLI installed | `command -v gh` exits 0 | `GitHub scan skipped` / `gh CLI not installed` |

A missing `gh` skips the entire scan. That contradicts `_shared/github-write-transport.md`'s standing rule — "This is a capability probe, not an environment classification" — in the same way #163's four health skills did.

The same skill has already been fixed for this elsewhere. `/tidy` Step 4.7 (`scan-procedures.md:168`):

> Skip silently when the repo has no GitHub remote (pre-check, before any listing attempt) — `gh` being unavailable alone no longer skips this step, per `_shared/github-write-transport.md`; use the MCP path instead.

But `/tidy` Step 4.8 routes through `github-pr-scan.md`'s ladder and still hard-skips. So one skill currently handles a `gh`-absent sandbox two different ways in two adjacent steps.

## Why it was not fixed with #163

Different consequence. #163's defect re-filed a `wontfix`-suppressed finding as a new born-`ready` issue, reachable by an unattended implementer via `/claude-tweaks:dispatch`. This one skips a read-only report and says so in its own output (`GitHub scan skipped` / `gh CLI not installed`, severity `info`) — degraded, but neither silent nor destructive.

## Ask

Give check 2 the MCP path rather than a skip, matching Step 4.7. Consumers are `/claude-tweaks:help` Stages 4.5/4.6/4.7/4.8 and `/claude-tweaks:tidy` Step 4.8.

One thing to settle first: `_shared/github-write-transport.md`'s CRUD mapping covers **issues**, not pull requests — there is no `list_pull_requests` row. Items 1-2 of the `repo-wide` scope section are `gh pr list` calls. So either the mapping gains a PR row, or the ladder degrades per-item (issues via MCP, PR items skipped with a narrower message) rather than skipping wholesale. The second is probably right, and is a smaller change, but it needs deciding rather than assuming.

## Also worth a look while in here

`skills/wrap-up/docs-health-integration.md:41` builds a **fifth** `by:docs-health` issue index for D1's `restructural` filing path. It carries no skip wording, but also no `gh`-absent branch at all, so it can invoke `validate-findings --issues` against a file that was never written. Lower risk than the Routine path (wrap-up is interactive), but it is the same missing branch.

