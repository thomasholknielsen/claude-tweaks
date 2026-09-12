---
type: bug
origin: capture
unsynced: true
---

# PR #2035 merged only the spec-materialization commit — #1882's actual CRLF fix never landed on main

## Current State

Issue #1882 (splitFrontmatterFence returns null on every CRLF checkout) is closed, and the PR that closed it (#2035) shows as merged — but the merge only carries commit 92a6ff1a, "Materialize spec for #1882", which added `work/1882-spec.md` (49 lines). The actual code fix was never committed to that PR.

Sequence of events: a `/claude-tweaks:dispatch next` firing selected #1882 and dispatched a build,test Task agent. That agent wrote the real fix (`content.split('\n')` -> `content.split(/\r?\n/)` in `plugin/bin/lib/health-core/frontmatter-list.js`) plus two CRLF-fixture regression tests, but had not yet committed them when the session's container was reclaimed for inactivity mid-run. The pipeline run (`.claude-tweaks/pipelines/2026-09-07T121938-record-1882`) was left parked with status `interrupted`. Five days later the repo owner manually marked the still-draft PR #2035 ready for review and merged it directly, without the automated test/review/wrap-up phases ever running (the PR body's phases checklist — build/test/review/wrap-up — was still fully unchecked at merge time). GitHub auto-closed #1882 via the PR's "Fixes #1882" line.

Verified directly against `origin/main`: `plugin/bin/lib/health-core/frontmatter-list.js` still contains the buggy `content.split('\n')` line (`git show origin/main:plugin/bin/lib/health-core/frontmatter-list.js`). The CRLF bug is still live on main, affecting all six call sites #1882 originally listed (skill-audit description/argument-hint measurement, journey/harness/docs-health scope fields, and `work-backend: local-files` record frontmatter parsing).

The orphaned fix has been recovered and preserved: pushed to branch `worktree-record-1882` at commit 9a883f98 (2 commits ahead of the merged PR's head 92a6ff1a): `6ec86bd5` (the actual fix + 2 regression tests) and `9a883f98` (the implementation plan doc). `node --test tests/bin-lib/health-core/frontmatter-list.test.js` passes all 14 tests on that branch, including the 2 new CRLF regression tests. Per the standing instruction not to reopen #2035 or open a new PR for the same change without being asked, no new PR was opened.

Separately, this points at a process gap: `integration-model: pr-first` has no safeguard today against a human merging a draft PR before the automated build/test/review/wrap-up phases push their commits — the phases checklist showing all-unchecked at merge time was a visible signal that went unheeded.

## Deliverables

- [ ] Open a PR from branch `worktree-record-1882` (or cherry-pick commits `6ec86bd5` and `9a883f98` onto a fresh branch) against `main`, verify CI, and merge it so the actual fix lands
- [ ] Decide whether to add a safeguard (e.g. a merge-time check, or a Claude Approvals rule) against merging a `pr-first` draft PR whose phases checklist isn't fully checked

## Acceptance Criteria

1. `plugin/bin/lib/health-core/frontmatter-list.js`'s `splitFrontmatterFence` uses `content.split(/\r?\n/)` on `main`
2. `tests/bin-lib/health-core/frontmatter-list.test.js` carries the two CRLF-fixture regression tests on `main`, passing
3. The premature-merge process gap is either addressed or explicitly declined with reasoning recorded

