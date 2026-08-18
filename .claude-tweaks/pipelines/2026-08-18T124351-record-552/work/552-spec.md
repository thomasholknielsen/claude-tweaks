---
record: 552
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 552: Split or slim both Review Console files — review-console.md and multispec-review-console.md sit 11 B / 4 B under the 40 KB sub-file ceiling

Surface: backend

## Current State

`skills/wrap-up/review-console.md` is currently 40,193 of 40,960 bytes (767 B headroom, ~1.9%) — up from the 61 B headroom cited when this issue was filed, because two intervening commits already did partial mitigation (`bbd52a19` compressed the local-merge pointer; a related trim landed on the multispec file too). `skills/flow/multispec-review-console.md` is now 30,281 of 40,960 bytes (10,679 B headroom) — commit `0ca8c1c3` ("Trim multispec-review-console.md prose to stay under the 40 KB ceiling") already resolved its near-ceiling state. **Scope note (fact-checked at shaping time, deviates from the issue title):** only `review-console.md` is still actually near the ceiling; `multispec-review-console.md` is out of scope for this record.

The two deferred adoptions this issue named are still outstanding, confirmed present in the current file: the fast-lane auto-merge log templates at `skills/wrap-up/review-console.md:100` and `:189` (`` `AUTO {time} — Fast-lane auto-merge: issue #{n}, assess-agent-autonomy verdict auto-merge...` ``) do not carry the `[lever: …]` field, even though the generic "Lever attribution suffix" mechanism they'd consume (`_shared/auto-decision-log.md`'s Lever attribution section, referenced at `review-console.md:285`) already exists and is used elsewhere. They were left out originally because adding the field would have breached the byte ceiling.

Two tests pin the ceiling deterministically and will fail loudly on any edit that pushes either file over 40,960 bytes: `tests/console-on-pr.test.js` and `tests/bin-lib/skill-audit/context-cost.test.js`.

## Deliverables

1. Extract one cohesive section of `skills/wrap-up/review-console.md` into a new lazy-loaded sub-file (e.g. the Auto-resolution short-circuit block or the dry-run block — final choice left to the build agent's judgment on what extracts cleanly with a single load-point reference), following this repo's existing lazy-load convention (see `docs/skill-authoring.md` and the sub-file pattern already used elsewhere in `skills/wrap-up/`).
2. In the same change, land the two deferred lever-attribution adoptions: add the `[lever: …]` field (per `_shared/auto-decision-log.md`'s Lever attribution section) to both fast-lane auto-merge log templates (`review-console.md:100` and `:189`), consulting the same levers `merge-check`/dispatch already reads (`merge-sensitive-paths`/`automerge-max-lines`/`automerge-max-files`).
3. Update any cross-references (`docs/skill-graph.md`, other skills citing `review-console.md` by section or line number) that the extraction moves.

## Acceptance Criteria

- `skills/wrap-up/review-console.md` is reduced to a byte count that leaves at least 3,000 B of headroom under the 40,960 B ceiling (up from today's 767 B) — verified via `wc -c`.
- The extracted section lives in a new sub-file under `skills/wrap-up/`, is lazy-loaded (referenced, not inlined) from `review-console.md`, and that sub-file itself is well under the 40,960 B ceiling.
- Both fast-lane auto-merge log template lines (currently `:100` and `:189`) include a `[lever: …]` field per `_shared/auto-decision-log.md`'s Lever attribution section, consulting `merge-sensitive-paths`/`automerge-max-lines`/`automerge-max-files`.
- `node --test tests/console-on-pr.test.js tests/bin-lib/skill-audit/context-cost.test.js` passes.
- `npm test` passes in full (no regressions from the extraction or cross-reference updates).
- `skills/flow/multispec-review-console.md` is left untouched — it is not near the ceiling as of this record's shaping and is out of scope.

## Technical Approach

Follow this repo's established "extract a cohesive block into a lazy-loaded sub-file, cite it from the parent with a load-point reference" pattern (the same shape CLAUDE.md itself uses — see its own "moved out of this always-loaded file to fit the 150-line budget" precedent, and the sibling `docs/skill-authoring.md` split). Pick the extraction target by cohesion and byte yield, not by re-litigating which block "belongs" where — either the Auto-resolution short-circuit block or the dry-run block (both suggested in the original issue) should free enough headroom on its own; extract whichever is more self-contained. Add the `[lever: …]` field adoptions as a second, small diff in the same commit/PR once headroom exists, verifying byte count after each step rather than batching both changes before checking.

## Gotchas

- The byte-ceiling numbers in the original issue (61 B / 4 B headroom) are stale — re-verify current byte counts with `wc -c` at build time rather than trusting the numbers here, since sibling work may land between shaping and build.
- `review-console.md` is heavily cross-referenced by line number from other skills and docs (the issue's own `:113`/`:209` references had already drifted to `:100`/`:189` by shaping time) — grep for citations of the extracted section's old line range before considering the extraction done, not just within this file.
- Extracting a section changes it from always-loaded to lazy-loaded content; confirm nothing downstream assumed the extracted content was already in context at a point where it's now only loaded on demand.

## Original request

Split or slim both Review Console files — review-console.md and multispec-review-console.md sit 11 B / 4 B under the 40 KB sub-file ceiling

After #535's adoption paragraph (already minimized to ~280 bytes in commit 8048cfb9), `skills/wrap-up/review-console.md` sits at 40,899 of 40,960 bytes — 61 bytes of headroom. The next edit of nearly any size fails `tests/console-on-pr.test.js` and `tests/bin-lib/skill-audit/context-cost.test.js` deterministically.

Two known deferred adoptions are blocked on exactly this: the fast-lane auto-merge log templates at `review-console.md:113`/`:209` consult the same levers as the dispatch line #535 adopted (`merge-sensitive-paths`/`automerge-max-lines`/`automerge-max-files` via merge-check) but could not take the `[lever: …]` field without breaching the ceiling.

Suggested shape: move a cohesive section (e.g. the Auto-resolution short-circuit or the dry-run block) into a lazy-loaded sub-file, then land the deferred lever-attribution adoptions in the same change.

Origin: #535 wrap-up (reflect hindsight, structural-debt lens + final-review deferral).
