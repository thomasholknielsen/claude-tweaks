---
record: 438
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 438: github-pr-scan.md item 9's green-check filter treats a permanently-conditional-skip check as non-green on every PR

Surface: backend

## Current State

`_shared/github-pr-scan.md`'s `repo-wide` item 9 (Unarmed ready PR) originally computed "green" as
`checks.every((c) => (c.conclusion || c.state) === 'SUCCESS')`, which treated the
default-branch-only `cleanup-fix-labels` job's permanent `SKIPPED` conclusion on every
feature-branch PR as non-green — making item 9 structurally unable to ever flag a candidate,
repo-wide.

**The production fix already shipped** — commit `93a701e8` ("Fix item 9's green-check treating
SKIPPED conclusions as failures", refs #424, merged to `main` 2026-08-14, ~2h after this issue was
filed) rewrote the filter in `skills/_shared/github-pr-scan.md` (current lines 92-98) to:

```js
const NON_BLOCKING = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL']);
const green = checks.every((c) => NON_BLOCKING.has(c.conclusion || c.state));
```

with an inline comment naming the exact `cleanup-fix-labels` scenario this issue's Reproduction
section documented. The commit never referenced this issue number, which is why it stayed open
despite the fix landing.

**Verified: no duplicate filter shape exists elsewhere.** Grepped `skills/_shared/github-pr-scan.md`
for every `every(` call — the only other hit (line 138) is `linked.every((n) =>
(labelsByIssue.get(n) || []).includes('auto:merge'))`, an unrelated label check on linked issues,
not a CI-conclusion green check. The `current-pr` scope's own CI check (item 3) shells out to `gh pr
checks {number}` directly rather than computing green from `statusCheckRollup` itself, so it never
had this bug. The second deliverable from the original report (audit for the same shape elsewhere)
is therefore already satisfied — no code change needed for it.

**What's actually missing:** the third original deliverable, a regression test, was never added.
`tests/sweep-backstop.test.js`'s two item-9 tests (`assertAllSyntaxValid`) only run `node --check`
against the extracted embedded script — they prove it parses, never that it produces the right
candidate set. No test in the repo executes item 9's actual filter logic against a fixture
`statusCheckRollup` and asserts a SKIPPED-bearing PR is still found.

## Deliverables

- Add a regression test to `tests/sweep-backstop.test.js` that executes item 9's actual embedded
  candidate-filter script (not just syntax-checks it) against a fixture PR list and asserts the
  filter's real behavior:
  - **Positive case:** a PR whose `statusCheckRollup` is `[{conclusion: 'SUCCESS'}, {conclusion:
    'SKIPPED'}]`, with every other filter condition satisfied (not draft, no `autoMergeRequest`,
    `updatedAt` old enough to clear `pr-unarmed-age-hours`, body containing the
    `` or `` marker) — asserted present
    in the written candidates output.
  - **Negative control:** an otherwise-identical fixture PR with one conclusion changed to
    `FAILURE` — asserted absent from the candidates output. Per this project's test-discrimination
    convention, a test that can't go red proves nothing; the control isolates the SKIPPED-handling
    behavior as the one varying dimension.
- No production code change — the filter itself is already fixed and no duplicate shape exists
  elsewhere (see Current State).

## Acceptance Criteria

- `tests/sweep-backstop.test.js` gains a test that runs item 9's embedded `node -e` script itself
  (extracted the same way the existing `extractNodeScripts` helper already does) against a written
  fixture `statusCheckRollup` containing one `SUCCESS` and one `SKIPPED` conclusion, and asserts the
  PR is present in the resulting candidates file.
- The same test (or a paired one) asserts a fixture PR carrying a real `FAILURE` conclusion is
  correctly excluded from candidates — proving the assertion actually discriminates.
- The test isolates its fixture I/O to a session-scoped temp directory rather than writing to the
  script's hardcoded `/tmp/pr-scan-unarmed.json` / `/tmp/pr-scan-unarmed-candidates.json` paths
  directly, so it cannot race a concurrent live sweep or another test run using those same paths.
- `npm test` passes with the new test included.

## Technical Approach

- Reuse `tests/sweep-backstop.test.js`'s existing `extractItemSection`/`extractNodeScripts` helpers
  to pull item 9's embedded script source (already extracted as `ITEM9` in that file).
- The extracted script hardcodes its I/O paths (`/tmp/pr-scan-unarmed.json` in,
  `/tmp/pr-scan-unarmed-candidates.json` out) and reads `UNARMED_AGE` from the environment — it
  takes no CLI args for its paths. Before writing the script to a temp `.js` file and executing it
  with `execFileSync('node', [tmpFile], { env: { ...process.env, UNARMED_AGE: '24' } })`, string-
  substitute both hardcoded paths to point at a fresh `fs.mkdtempSync` directory (the same isolation
  pattern `assertAllSyntaxValid` already uses for its own temp files), then write the fixture PR
  array to the substituted input path before running.
- Compute fixture `updatedAt` as comfortably older than the `pr-unarmed-age-hours` default (24h,
  per `tests/sweep-backstop.test.js`'s own pinned default) to avoid the age filter tripping first
  and masking the conclusion-filter behavior under test.
- After execution, read back the substituted candidates JSON path and assert on PR number presence/
  absence for the positive/negative cases.

## Gotchas

- The embedded script's hardcoded `/tmp/*` paths are shared with a live sweep-backstop run — do not
  execute the unmodified script against those literal paths from a test; always substitute to an
  isolated temp directory first.
- The script closes over its file paths as literals inside its own source (not via `process.argv`),
  so isolation has to be a source-text substitution before writing the temp `.js` file, not an argv
  injection.
- Keep the fixture minimal but complete: every filter condition other than the one being tested
  (conclusion set) must independently pass, or the test will fail for the wrong reason and give a
  false negative on the actual regression being guarded.

## Original request

github-pr-scan.md item 9's green-check filter treats a permanently-conditional-skip check as non-green on every PR

`_shared/github-pr-scan.md`'s `repo-wide` item 9 (Unarmed ready PR) computes "green" as:

```js
const checks = pr.statusCheckRollup || [];
const green = checks.every((c) => (c.conclusion || c.state) === 'SUCCESS');
if (checks.length && !green) return false;
```

`.github/workflows/track-issue-fixes.yml`'s `cleanup-fix-labels` job is conditioned
`if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)` — it never
runs on a feature branch by design, so it reports `conclusion: "SKIPPED"` on the
`statusCheckRollup` of **every open PR in this repository**, unconditionally.

`every(c => conclusion === 'SUCCESS')` treats `SKIPPED` as failing (not `SUCCESS`), so `green` is
`false` for every PR that has this check attached — which today is all of them, since the workflow
runs on every PR. Item 9 can therefore never find a candidate PR to arm, repo-wide, regardless of
actual CI state, until this filter is fixed.

## Reproduction

Verified live against a real, currently-open PR (#436, this repo) whose only substantive check
(`test`) is `SUCCESS`: `statusCheckRollup` still carries `cleanup-fix-labels` at
`conclusion: "SKIPPED"` (by-design branch-conditional skip), and re-running item 9's exact embedded
filter script against the live `gh pr list --json ... statusCheckRollup` output returns zero
candidates — confirmed the culprit is specifically the `SKIPPED` conclusion, not the marker/age
logic (both otherwise matched).

## Deliverables (if picked up)

- Treat `SKIPPED`/`NEUTRAL` conclusions as non-blocking in item 9's green check (e.g.
  `['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(conclusion)`), matching how GitHub's own required-checks
  UI treats a conditionally-skipped job — never blocking on it.
- Check whether the same `every(...)` shape appears elsewhere in `github-pr-scan.md` (`current-pr`
  scope's own CI-green check) and fix consistently if so.
- Add a regression test with a fixture `statusCheckRollup` containing one `SUCCESS` and one
  `SKIPPED` entry, asserting the candidate is still found.

## Origin

Discovered live while demonstrating #424's tidy Step 7.5 pr-first PR-open path — the mechanism
under test in #424 (push, PR-open, marker-stamp) worked correctly; this filter bug is unrelated
pre-existing logic in item 9 that happened to be exercised by the same live demonstration. Not
fixed as part of #424 — out of that record's scope (item 9 is "consumed, not modified" there) and
this bug is repo-wide, not tidy-specific.
