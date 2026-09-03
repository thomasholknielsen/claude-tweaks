---
record: 548
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 548: Reconcile archive-tag namespace collision: build/foo vs build/foo/bar produce D/F-conflicting tags

Surface: backend

## Current State

`bin/lib/reconcile/archive-branches.js`'s branch-archival path names an aging-protection tag `archive/{branch}` — a 1:1, unencoded translation of the branch name into a tag ref suffix (`archiveBranches()`, tag-and-delete case, `git tag -a -f -m ... archive/${branch} ${tip}`, line 122). Because git refs form a hierarchical namespace, this only works when no two branches, across time, share a common `/`-delimited path prefix. `archive/*` tags are never deleted by ordinary use — they persist until `shouldAgeTag()`'s `TAG_AGE_DAYS` (90 days) window ages them out via prefix-listing (`for-each-ref refs/tags/archive`, line 137).

Two branches never coexist simultaneously under a prefix relationship — git itself refuses to create `refs/heads/build/foo/bar` while `refs/heads/build/foo` exists, and vice versa — but they can exist sequentially: `build/foo` gets archived and tagged `archive/build/foo`, is deleted, and up to 90 days later an unrelated branch `build/foo/bar` reaches archival age. Creating `archive/build/foo/bar` now requires `archive/build/foo` to become a directory — but it's still a live tag ref (a file) — so `git tag -a -f` fails with a directory/file (D/F) ref conflict.

The tag-creation failure is fail-closed and non-destructive (`{action: 'skip', reason: 'tag-failed'}`, the branch is never deleted without a tag) but it is a *permanent* convergence skip: every subsequent reconcile run re-derives the same `archive/{branch}` name, hits the same conflict, and the branch is stuck forever, unarchived. Surfaced by #517's final whole-branch review (Recommendation 5). Refs #517.

Confirmed in scope investigation: `archive/*` tags are created in exactly one place (`archive-branches.js:122`) — no other file in `bin/lib/reconcile/` (`prune-remote.js`, `archive-merged.js`, `reap-merged.js`, `release-merged.js`, `mirror-ff.js`) creates or reconstructs an `archive/{branch}`-shaped tag name, and the tag-aging read path (line 137) lists by prefix rather than reconstructing a name, so it is agnostic to any change in how the branch-name suffix is encoded. Nothing else in the codebase treats the exact `archive/{original-branch}` string as a stable external contract to look up by name.

## Deliverables

- A reversible, collision-free encoding function (e.g. `encodeArchiveTagSuffix(branch)`) that maps any legal git branch name to a flat (single-segment, no internal `/`) tag suffix, added to `bin/lib/reconcile/archive-branches.js` and exported alongside the module's other pure functions.
- The tag-creation call site (`archiveBranches()`'s tag-and-delete case) updated to create `archive/${encodeArchiveTagSuffix(branch)}` instead of `archive/${branch}`.
- Existing literal nested-tag-name test assertions in `tests/bin-lib/reconcile/archive-branches.test.js` (`archive/build/aged`, `archive/build/veryold`, `archive/build/retry`) updated to the new flat form.
- New test coverage proving the fix: (a) the exact reported scenario — archiving `build/foo` then (after deletion) `build/foo/bar` both succeed, producing two distinct tags, neither `tag-failed`; (b) the encoding is injective — two different branch names, including an adversarial pair constructed to collide under naive `/`→`-` substitution alone (`build/foo-bar` vs `build/foo/bar`), never produce the same encoded suffix.

## Acceptance Criteria

- [ ] `encodeArchiveTagSuffix()` (or equivalent) is a pure function, unit-tested directly, that never returns a string containing `/`.
- [ ] For any two distinct legal branch names, `encodeArchiveTagSuffix()` never returns the same output — proven by at least one adversarial pair specifically constructed to collide under simple `/`→`-` substitution (`build/foo-bar` and `build/foo/bar`), not just the reported example (which happens to not collide even under the naive scheme).
- [ ] Archiving `build/foo`, deleting it, then archiving an unrelated `build/foo/bar` both succeed end-to-end (via `archiveBranches()` or the underlying git tag call) with no `tag-failed` skip — the reported D/F-collision scenario is fixed.
- [ ] The existing test assertions pinning nested literal tag names (`archive/build/aged`, `archive/build/veryold`, `archive/build/retry`) are updated to the new encoded form, not deleted or loosened — they still assert a specific literal string.
- [ ] `decideArchive()`'s decision table, `isCherryEquivalent()`, `shouldAgeTag()`, and the tag-aging prefix-listing path are unchanged — this fix touches only how the tag *name* is derived, never archival eligibility or aging logic.
- [ ] `npm test` passes, including the full `tests/bin-lib/reconcile/archive-branches.test.js` suite.

## Technical Approach

Add a small, pure, reversible encoding function rather than a lossy one. A naive `branch.replace(/\//g, '-')` — mirroring `bin/lib/worktree/name.js`'s `sanitizeWorktreeName`, the codebase's existing precedent for a similar `/`-in-derived-name problem — is not safe here: it can map two *different* branch names to the *same* tag suffix (`build/foo-bar` and `build/foo/bar` both become `build-foo-bar`), which, combined with this call site's `-f` force flag, would silently overwrite one branch's archive tag with another's — trading a loud, fail-closed skip for a silent, undetectable loss of one branch's recovery tag. `sanitizeWorktreeName` gets away with lossiness because worktree names only need local uniqueness at creation time, not permanent collision-freedom across arbitrary historical inputs — a different problem shape than a 90-day-persistent, cross-time archival tag.

Instead, escape the one character that already means something to the encoding (`-`, the chosen replacement for `/`) before doing the replacement: double every literal `-` to `--`, then replace every remaining single `/` with a single `-`. This is a standard reversible path-flattening idiom. The result is always flat (no `/`) and always injective (no two distinct inputs collide), which structurally eliminates the whole D/F-conflict class rather than only the one reported instance of it. Decoding is not needed by this fix — the original branch name is separately preserved verbatim in the tag's own annotation message (`archive of ${branch}`, unchanged) — but the encoding stays reversible in principle, which is also what makes injectivity provable rather than merely observed.

The issue's other named alternative, detect-and-report (leave the tag name as-is; just fail with a clearer message), is rejected: it would make the failure diagnosable but not fix it — the branch would still hit the same conflict on every future run and remain permanently unarchived, which defeats the actual purpose of branch archival (eventually cleaning up abandoned branches). Since scope investigation found no code anywhere that reconstructs or depends on the exact unencoded `archive/{branch}` tag name (aging reads by prefix only), there is no compatibility cost to changing the naming scheme outright, and no reason to settle for a diagnosable-but-still-broken fix when a structural one is equally cheap.

No change is needed to `decideArchive()`, `isCherryEquivalent()`, `shouldAgeTag()`, or the tag-aging prefix-listing read path — aging lists tags by prefix and never reconstructs a name from a branch, so it is unaffected by the encoding change. Pre-existing tags created under the old, unencoded scheme (e.g. `archive/build/foo` from before this fix ships) remain readable and age out normally under the existing logic; they cannot conflict with any tag created under the new scheme, since every new tag is a flat single-segment leaf directly under `archive/` and can never itself be mistaken for a directory.

## Gotchas

- The bug is time-displaced, not simultaneous: `build/foo` and `build/foo/bar` can never exist as branches at the same moment (git refuses that ref-prefix overlap), so a repro/test needs to archive-then-delete one before creating and archiving the other — not create both branches together.
- The encoding must be exercised against an adversarial pair, not just the reported example, to prove injectivity — the reported `build/foo` vs `build/foo/bar` pair happens not to collide even under a naive `-`-substitution scheme (neither name has a pre-existing `-`), so a test using only the reported pair would pass on the unsafe naive fix too and hide the deeper bug.
- Renaming or migrating old-format tags already sitting in a real checkout is explicitly out of scope — the fix only changes how *new* tags are named going forward; old ones age out on their own 90-day clock via the unchanged prefix-based reader.

## Original request

Reconcile archive-tag namespace collision: build/foo vs build/foo/bar produce D/F-conflicting tags

Origin: ledger resolve gate (run 2026-08-16T010137-spec-517-518-519, item 2 — auto-routed at unattended ceiling)

Branches `build/foo` and `build/foo/bar` produce conflicting `archive/*` tag paths (a ref can't be both a file and a directory); the second archival attempt reports `tag-failed` forever — fails closed, never destroys data, but is a permanent convergence skip for that branch. Surfaced by #517's final whole-branch review (Recommendation 5).

Blocker at fix time: needs a design decision on tag-name encoding for nested branch names (e.g. sanitize `/` in the tag suffix vs detect-and-report), plus scope expansion beyond the reviewed diff.

Key file: `bin/lib/reconcile/archive-branches.js` (tag creation site + `tag-failed` skip path). Refs #517.

