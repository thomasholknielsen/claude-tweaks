---
record: 247
origin: human
risk: medium
effort: medium
ceremony: standard
grants: []
surface: backend
---
# 247: Trim issue-claims.md's prose back toward #241's under-half word-count target

Surface: backend

## Current State

#241 unified the claim lock on one blob keyspace (`claims/issue-<n>.json` on `claims-registry`) for both the gh-CLI and MCP transports, but its acceptance criterion "prose word count drops substantially (target: under half)" was not met: `skills/_shared/issue-claims.md` grew from ~23.2 KB to ~29.4 KB (29,357 bytes today). Two causes: fully parallel gh-CLI and MCP prose blocks per step, and the new "Deprecation window — the retired `refs/claims/issue-<n>` keyspace" subsection.

That subsection's own End condition (IL-85) is now satisfiable: it closes once "the first `claims-registry`-only release after this change ships" — #241 shipped in v6.73.0 (`53e8924d`), which is released. Per the End condition, deleting the subsection also deletes the `git/matching-refs/claims/` compatibility read, the Failure posture table's legacy-ref row, and `claimRef`/`claimFilePath`'s now-unused compatibility exports in `bin/lib/issues/claims.js` — all in the same change.

## Deliverables

1. Verify the End condition holds against the live tree: v6.73.0 present in `docs/shipped-versions.tsv`, and no in-flight legacy refs (`gh api "repos/{owner}/{repo}/git/matching-refs/claims/"` returns empty).
2. Delete the Deprecation window subsection, the legacy-ref compatibility read, the Failure posture table's legacy row, and the `claimRef`/`claimFilePath` exports plus their tests — one change.
3. Editorial pass over the remaining file: collapse the parallel gh-CLI/MCP prose blocks into single numbered procedures with per-step "gh CLI: … / MCP: …" asides where the mechanics genuinely coincide.
4. Re-measure prose word count against #241's under-half target, using the pre-#241 file's actual word count (from git history) as the baseline — not the 23.2 KB byte figure. If the target is unreachable without losing mechanical detail a consumer needs, record an explicit downgrade of the criterion in the closing disposition instead of leaving it silently unmet.

## Acceptance Criteria

- `grep -rn "refs/claims/issue\|claimRef\|claimFilePath"` across skills/ bin/ tests/ returns no live references (incident log, changelog, and archived material excluded).
- `npm test` passes, including the claims suite (`bin/lib/issues/tests/claims.test.js`) with legacy-path tests removed rather than skipped.
- Word count measured with the same command against both the pre-#241 baseline (via `git show <pre-241-sha>:skills/_shared/issue-claims.md`) and the result; the numbers and verdict (met / explicitly downgraded, with reason) recorded in the closing disposition.
- Every consumer of the claim contract still resolves its cross-references (dispatch claim/settle call sites, /tidy Step 4.7, /wrap-up Section E) — both sides of each reference checked.
- No consumer-facing mechanical detail lost: each step a consumer executes today remains executable from the rewritten text alone.

## Technical Approach

Order matters: delete the deprecation content first (pure subtraction, shrinks the file on its own), then do the editorial merge on what remains, then measure. Measure the baseline via `git show` against the pre-#241 tree, never by stashing or checking out.

### Key Files

- skills/_shared/issue-claims.md
- bin/lib/issues/claims.js
- bin/lib/issues/tests/claims.test.js

## Gotchas

- The End condition's practical reading (its own parenthetical) equates closure with v6.73.0 having shipped — but run the `matching-refs` check anyway before deleting the compatibility read; a non-empty result means an older-build session is mid-claim and the window must wait (IL-92: a fail-open branch's cause list grows silently).
- IL-93: deleting the subsection changes the mechanism's described reach — sweep other files' prose referencing the deprecation window or the legacy ref keyspace (skills/, docs/), not just this file.
- IL-76: the target is what consumers actually load — don't split the file into sub-files to hit the number; the goal is genuine prose reduction, and a stub-plus-header split can cost more than it saves.
- IL-77/IL-110: the 23.2/29.4 figures are kilobytes, not word counts — re-derive the real word-count baseline from git history before claiming anything about "under half"; never let a byte figure supply a word-count total.

## Original request

Trim issue-claims.md's prose back toward #241's under-half word-count target

Context: #241 unified the claim lock on one blob keyspace (claims/issue-<n>.json on
claims-registry) for both the gh-CLI and MCP transports, closing the dual-keyspace
double-claim hazard and the everReleased identity-vs-lock split. Fixture-level tests
(bin/lib/issues/tests/claims.test.js, classifyClaimBlob suite) prove the CAS-collision
guarantee. _shared/issue-claims.md, bin/lib/issues/claims.js, dispatch's claim/settle call
sites, and /tidy's Step 4.7 sweep were all rewired to the new mechanism.

One acceptance criterion was not met: "the prose word count of the claim contract drops
substantially (target: under half) as the split-brain rows disappear." The rewrite instead
grew the file (~23.2 KB -> ~29.4 KB) because unifying the mechanism meant writing explicit
parallel gh-CLI-and-MCP bash snippets for several steps that were previously more terse on
one side, plus a new "Deprecation window" subsection covering the transition off the retired
refs/claims/issue-<n> keyspace.

Scope: an editorial pass over _shared/issue-claims.md once the deprecation window itself has
closed and its subsection is deleted (see that section's own End condition) — at that point
the gh-CLI and MCP procedures can likely share more text (a single numbered procedure with a
"gh CLI: ... / MCP: ..." aside per step, rather than fully parallel prose blocks), and the
Failure posture table's now-permanent legacy-ref row goes away too. Re-measure against the
under-half target at that point; if it's still not achievable without losing the mechanical
detail a consumer needs, downgrade the acceptance criterion explicitly rather than leaving it
silently unmet.

Related: #241

## Build Finding — Word-count measurement

**End-condition correction:** the plan's premise notes flagged this at plan time and it holds
after the build: `claimFilePath` is not a "now-unused compatibility export" — it formats the
*live* `claims/issue-<n>.json` blob keyspace and both `claimPayload`/`releasePayload` still call
it. Only `claimRef` (the retired `refs/claims/issue-<n>` git-ref keyspace), `claimStatus`,
`parseClaimMarker`, and the `RELEASE_RE`/`CLAIM_RE` regexes were removed, along with the `ref`
field on both payloads' returns and the legacy `sha` param on `claimPayload`. `claimFilePath`
itself was untouched.

**Word count:** baseline (pre-#241, `git show d2ed600a:skills/_shared/issue-claims.md | wc -w`)
= 3173. Post-#241, pre-this-change = 4038. After this change (deprecation-window deletion +
editorial trim) = 2915. Target (under-half of baseline) = ≤1586.

**Verdict: explicitly downgraded — target not met.** 2915 words is a real ~28% cut from
baseline and a ~28% cut from the pre-trim 4038, but well short of ≤1586. Reason: the file's
current shape documents one protocol across *two* transports (gh CLI and MCP) for every
operation — bootstrap, claim, release, list, read — where the pre-#241 baseline had no MCP
transport to describe at all, so the file is structurally carrying more executable surface than
the number it's being measured against ever had to cover. Every remaining paragraph is either a
numbered procedure step with a gh-CLI/MCP pair, a state-machine definition consumers branch on,
or one of three tables (Release triggers, Failure posture, Consumers) that downstream skills
(`dispatch/SKILL.md`, `dispatch/claim-outcomes.md`, `dispatch/mcp-transport.md`,
`wrap-up/cleanup-procedures.md`, `tidy/scan-procedures.md`, `flow/failure-cards.md`) read and
depend on verbatim. Cutting further would mean dropping one transport's mechanics, a state
branch, or a table row — all forbidden by this record's own "no consumer-facing mechanical
detail lost" acceptance criterion and the plan's "do not change the protocol" constraint.
Accepting this downgrade over a mechanically-incomplete ≤1586-word file.
