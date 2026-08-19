---
record: 635
origin: human
risk: low
size: medium
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 635: Split skills/_shared/policy-schema.md before it hits the 40 KB sub-file ceiling (40,411 B after #580)

Surface: backend

## Current State

`skills/_shared/policy-schema.md` is 39,692 bytes as of this shaping pass (`wc -c`) — within `tests/sweep-backstop.test.js` / `tests/console-on-pr.test.js`'s enforced `CEILING_BYTES = 40 * 1024` (40,960 B) sub-file ceiling, but only ~1,268 bytes of headroom. It was 40,411 bytes (over the ceiling) immediately after #580's derived-default paragraph rewrite; it has since dropped somewhat, presumably from unrelated edits, but the record's own headroom math is still live — the next lever row or coverage block pushes it over again. Two same-shape splits already exist in this repo as direct precedent: `github-pr-scan.md` (#204) and `review-console.md` (#552). A third, narrower sibling split has already landed directly off this file: `skills/_shared/policy-schema-model-profiles.md` carries the "## Model profiles" lever-table detail, split out per IL-70 when merged branch content pushed the parent over the ceiling — so the split mechanism and citation convention for this exact file are already established, not novel.

## Deliverables

- [ ] Decide the split boundary. Leading candidate: move the per-key coverage blocks (integration-model, merge-verification, worktree.always) into a new `skills/_shared/policy-schema-coverage.md`, keeping the canonical read path, `resolveValue` contract, metadata fields, and the lever tables in the parent — mirroring how `policy-schema-model-profiles.md` was split out for the Model profiles section
- [ ] Update every citation of the moved content. Sweep `grep -rn "policy-schema.md" skills docs tests` (repo-wide — the pattern already used in past `policy-schema.md` splits) and repoint any reference that names content that moved into the new file; leave references to content that stayed in the parent unchanged. Also update `docs/plugin-structure.md`'s sub-file table if it enumerates `_shared/*.md` files
- [ ] Register the new file wherever this repo's existing per-spec 40 KB ceiling tests enumerate split-out `_shared/*.md` siblings (the pattern in `tests/sweep-backstop.test.js` / `tests/console-on-pr.test.js`), the same way the `github-pr-scan.md` (#204) and `review-console.md` (#552) splits did

## Acceptance Criteria

1. `wc -c skills/_shared/policy-schema.md` < 30 KB with the split landed
2. `grep -rn "policy-schema.md" skills docs tests` shows no citation pointing at content that moved to the new file
3. `npm test` green

## Technical Approach

Follow the same split pattern already used for `policy-schema-model-profiles.md` on this same parent file: extract the chosen section(s) verbatim into the new sibling file with a one-line provenance comment at its top (``, matching the existing sibling's header), leave a short pointer stub in the parent where the section used to be, then run the citation sweep before touching tests. No code changes — this is a pure content/doc reorganization inside `skills/_shared/`.

## Gotchas

- The byte count has moved since the issue was filed (40,411 B → 39,692 B) — re-measure with `wc -c` at build time rather than trusting the number in this record, since it drifts with every unrelated edit to the file in the meantime.
- Citations exist in both `skills/**/*.md` prose and `tests/*.test.js` fixtures (e.g. `POLICY_SCHEMA_MD` in `tests/sweep-backstop.test.js`) — the sweep grep command in Deliverables covers `skills docs tests`, but double-check any test that reads the file's raw text for a section-specific string match, since those will break silently (wrong assertion, not a crash) if the matched text moves to the new file without the test being updated.

## Original request

Split skills/_shared/policy-schema.md before it hits the 40 KB sub-file ceiling (40,411 B after #580)

Origin: wrap-up Review Console (#580 run 2026-08-16T114842-spec-580), Skills curation row

## Current State

`skills/_shared/policy-schema.md` is 40,411 bytes after #580's derived-default paragraph rewrite (two shapes documented, per `staged/wrap-up-skill-1.md`) — about 550 bytes under the plugin's 40 KiB sub-file ceiling that `tests/sweep-backstop.test.js` and `tests/console-on-pr.test.js` enforce on other files (`CEILING_BYTES = 40 * 1024`). The next lever row or coverage block pushes it over. Same shape as #204 (`github-pr-scan.md`) and #552 (`review-console.md`).

## Deliverables

- [ ] Decide the split boundary — candidates: move the per-key coverage blocks (integration-model, merge-verification, worktree.always) into `skills/_shared/policy-schema-coverage.md`, keeping the canonical read path, resolveValue contract, metadata fields, and the lever tables in the parent
- [ ] Update every citation (`_shared/policy-schema.md`'s coverage block) repo-wide via a sweep grep, plus `docs/plugin-structure.md`'s sub-file table
- [ ] Add the new file to the ceiling test set the way sibling splits did

## Acceptance Criteria

1. `wc -c skills/_shared/policy-schema.md` < 30 KB with the split landed
2. `grep -rn "policy-schema.md" skills docs tests` shows no citation pointing at content that moved
3. `npm test` green
