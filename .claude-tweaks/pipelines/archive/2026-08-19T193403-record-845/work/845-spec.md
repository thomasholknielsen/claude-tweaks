---
record: 845
origin: capture
risk: low
size: medium
ceremony: fast-lane
grants: [build, merge]
surface: infra
---
# 845: skills/backlog/refine-mode.md is at its 40KB ceiling — 14 bytes headroom, split needed

Origin: session evaluation during /claude-tweaks:flow #764's review phase (via /claude-tweaks:review's fix-round report; self-reference routed the findings to local records)

Defer-reason: genuinely-larger

## Current State

`skills/backlog/refine-mode.md` is at its 40KB hard ceiling — 40,946 of 40,960 bytes, 14 bytes of headroom — enforced by `bin/lib/skill-audit/context-cost.js` (`CEILING_BYTES = 40 * 1024`). This is the end state of #764's own build: it started the branch at 40,843 bytes (117 bytes headroom, itself already flagged as thin by that build's whole-branch review), then a `/claude-tweaks:review` fix round needed 7 more findings addressed and had to trim unrelated prose (the Concurrency section, the priority-write retry mechanics paragraph, the close-run-dir fallback explanation, and a verbatim tidy citation shortened to a paraphrase) just to fit inside the ceiling. 14 bytes is not real headroom — the next edit to this file, for any reason, will fail the ceiling test before it can land, forcing an emergency trim-or-split under time pressure instead of a planned one.

## Deliverables

- [ ] Split `skills/backlog/refine-mode.md` — likely candidate: extract Step 5's closing-summary section (the AUTO/FAILED log-line templates, the per-type tally, the retry-line guidance — roughly lines 385-460, a self-contained procedure already referenced by name from Step 5's write blocks) into its own lazy-loaded sub-file (`skills/backlog/refine-closing-summary.md` or similar), following this repo's own "one file per mode/section, lazy-loaded" convention already used elsewhere in this skill directory (`refine-lanes.md` is the precedent — Step 4's own lazy-loaded sub-file, split out for the identical reason: "to clear the context-cost ceiling", per `docs/plugin-structure.md`'s backlog row).
- [ ] Verify the split preserves every claim `tests/backlog-refine-closing-render.test.js` and `tests/backlog-refine-reverify-before-write.test.js` pin (both regex-match against `skills/backlog/refine-mode.md`'s prose directly — either update their target path to the new sub-file, or confirm the split leaves the pinned sentences in whichever file actually gets read).

## Acceptance Criteria

1. `wc -c skills/backlog/refine-mode.md` shows meaningful headroom restored (at least a few KB, not single-digit bytes).
2. `tests/backlog-refine-closing-render.test.js` and `tests/backlog-refine-reverify-before-write.test.js` both still pass, reading from wherever the pinned content now lives.
3. `npm test` passes.

_Filed by `capture` via specShapedBody._
