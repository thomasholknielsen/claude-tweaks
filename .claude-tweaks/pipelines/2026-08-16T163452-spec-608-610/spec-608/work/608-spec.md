---
record: 608
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 608: specify record-creation.md Step 4: sub_issues link passes the issue number where the API needs databaseId, and the blocked_by write endpoint is never named

Surface: backend

## Current State

`skills/specify/record-creation.md` Step 4 "Linking" (`work-backend: github-issues`, `work-links: native`) has two defects at the write sites, both hit live during the #592 decomposition:

- **Line 235** — `gh api repos/{owner}/{repo}/issues/$PARENT_NUM/sub_issues -f sub_issue_id=$SUB_ISSUE_NUM`. The REST sub-issues endpoint takes the sub-issue's **database ID** (the integer `id`/`databaseId`, e.g. `5164237962`), not its issue number. Passing the number fails; the working call is `-F sub_issue_id=<databaseId>`. This is the only *write* call site for `sub_issues` in the repo — the reads in `wrap-up/verification-brief.md`, `_shared/trust-table.md`, and `_shared/github-pr-scan-acceptance.md` use `--jq '.[].number'` on the GET and are unaffected.
- **Line 238** — the sub-issue ↔ sub-issue / pre-existing-record dependency edge is described only as "the blocked-by dependency endpoint (the same GitHub issue-dependencies feature `capabilities-probe.js`'s `probeSchema` checks for, via the `blockedBy` GraphQL field …)". No path, no method, no identifier kind is given; the working call — `gh api -X POST repos/{owner}/{repo}/issues/{dependent}/dependencies/blocked_by -F issue_id=<blocker databaseId>` — had to be guessed.
- No test in `tests/` pins `record-creation.md`'s prose, so a future edit could reintroduce either mistake silently.
- `bin/lib/issues/capabilities-probe.js` already resolves `subIssues`/`dependencies` availability via GraphQL; nothing resolves numbers → database IDs.

## Deliverables

- [ ] `record-creation.md` line ~235: replace the snippet with a two-step form — one batched GraphQL lookup that maps every sub-issue number (and the parent) to `databaseId` (aliases per number: `i595: issue(number:595){databaseId}` …), written to `/tmp/specify-database-ids.json`, then the per-sub-issue `gh api -X POST repos/{owner}/{repo}/issues/$PARENT_NUM/sub_issues -F sub_issue_id=$SUB_ISSUE_DB_ID`. State in one sentence why the number is wrong (endpoint takes the internal `id`).
- [ ] `record-creation.md` line ~238: name the endpoint and identifier literally — `gh api -X POST repos/{owner}/{repo}/issues/$DEPENDENT_NUM/dependencies/blocked_by -F issue_id=$BLOCKER_DB_ID` — reusing the same database-ID map (extend the GraphQL aliases to cover any pre-existing blocking record from Step 1/2). Keep the existing `capabilities-probe.js` cross-reference as the availability check.
- [ ] `docs/incident-log.md` is not touched (no `[IL-nn]` tag needed — this is a doc correction, not a discipline rule).
- [ ] New test `tests/specify-record-creation-linking.test.js`: reads `skills/specify/record-creation.md` and asserts (a) the `sub_issues` write snippet uses `sub_issue_id=$SUB_ISSUE_DB_ID` and **not** `$SUB_ISSUE_NUM`; (b) the literal string `dependencies/blocked_by` is present; (c) `-F issue_id=` appears with a `_DB_ID` variable. Follow the shape of an existing prose-pin test (e.g. `tests/integration-branch-conformance.test.js`).

## Acceptance Criteria

1. `grep -n 'sub_issue_id=\$SUB_ISSUE_NUM' skills/specify/record-creation.md` returns nothing; `grep -n 'sub_issue_id=\$SUB_ISSUE_DB_ID' skills/specify/record-creation.md` returns the write snippet.
2. `grep -n 'dependencies/blocked_by' skills/specify/record-creation.md` returns the dependency-edge call with `-F issue_id=$BLOCKER_DB_ID`.
3. `grep -n 'databaseId' skills/specify/record-creation.md` shows the batched GraphQL lookup preceding both write calls.
4. `node --test tests/specify-record-creation-linking.test.js` passes, and reverting the line-235 fix makes it fail (verify by reverting locally before committing the fix — the test must discriminate).
5. `npm test` passes.
6. `git diff --stat` touches only `skills/specify/record-creation.md` and the new test file.

## Technical Approach

Prose correction plus one prose-pin test. The GraphQL batch is the cheap path — one call resolves every id in the decomposition regardless of N — and it is the pattern the #592 run used successfully. If #610 (`bin/link-records.js` helper) lands first, this record's snippets become the helper's one-line invocation instead; the test then pins that invocation. Build whichever is picked up first; the other adapts.

### Key Files

- `skills/specify/record-creation.md` — lines ~235 and ~238
- `tests/specify-record-creation-linking.test.js` — new

## Gotchas

- `gh api -f` sends the value as a string; `-F` coerces numerics. Both work for `sub_issue_id`, but use `-F` consistently so the id is sent as an integer.
- The GraphQL `id` field is the node ID (`I_kwDO…`); the REST endpoints want `databaseId`. Ask for `databaseId` explicitly — do not pass the node ID.
- Do not touch the read call sites (`--jq '.[].number'` on GET `sub_issues`) — they are correct.
- Related: #610 proposes a `bin/link-records.js` helper that would absorb both snippets; this record is the minimal doc fix and can ship independently.

## Original request

specify record-creation.md Step 4: sub_issues link passes the issue number where the API needs databaseId, and the blocked_by write endpoint is never named

**Related:** #592 (the decomposition run that hit both)

Context: During /specify decomposition, the documented `gh api repos/{owner}/{repo}/issues/$PARENT_NUM/sub_issues -f sub_issue_id=$SUB_ISSUE_NUM` call fails — the endpoint takes the sub-issue's database ID, not its number; and the sub-issue↔sub-issue linking paragraph names "the blocked-by dependency endpoint" without ever giving it, so `POST issues/{n}/dependencies/blocked_by -F issue_id=<databaseId>` had to be guessed live.

Scope: Fix the sub_issues snippet to fetch databaseId first (one GraphQL call for the whole batch), name the blocked_by endpoint and its identifier explicitly, and add a test pin so a future edit cannot regress the identifier kind.

