# pre-build craft assembly (#384) — execution plan

For agentic workers: executed inline under `/claude-tweaks:flow` (run dir `2026-08-14T104804-spec-383-384-385-387/spec-384`).

Spec: `.claude-tweaks/pipelines/2026-08-14T104804-spec-383-384-385-387/spec-384/work/384-spec.md`. Prerequisite #383 landed on this branch (`skills/_shared/design-craft.md`, commit ae43567f) — section structure re-verified: Gating / The two source classes / The authority rule / Assembly is unconditional / Emil skill resolution / Relevance map / Degradation posture / Subagent Contract compliance.

Facts verified: `modes/pre-build.md` Step 3 always-load line + four keyword rules and the classifier note; Step 4 canonical-paths + fallback bullet; Output-to-caller JSON `{mode, result, loaded, context_size, missed, description}`; `design-prebuild.md` Result handling table + "Where the loaded references go".

## Task 1 — `skills/design-wrapper/modes/pre-build.md`

- Step 3: move `motion-design.md`, `interaction-design.md` onto the always-load line; delete their two "Add …" rules; keep `responsive-design.md`/`ux-writing.md` rules and the classifier note verbatim.
- Step 4: add the sidecar bullet — `.impeccable/design.json`, root only, no fallback glob, missing-not-error, single `missed` permutation (`DESIGN.md` found + sidecar absent), all other combos silent, counted by `context_size`.
- New `### Step 5`: load Emil skills per `_shared/design-craft.md` (all selection logic delegated), resolved paths join `loaded`, absent relevance-selected skills join `missed`; append `${CLAUDE_PLUGIN_ROOT}/skills/_shared/design-craft.md` itself to `loaded`; absent-Emil = `missed` note + normal `result: "ok"`.
- Touch-ups for internal truth: intro line and the Step 3 parallel-execution blockquote widen to cover Steps 3–5's reads. Output-to-caller JSON block: byte-unchanged.

## Task 2 — `skills/build/design-prebuild.md`

One paragraph after Result handling: the `loaded` set now also carries principles (Emil skills when installed), the sidecar, and the contract file — forwarded exactly like existing references, no separate handling.

## Verification

AC1 grep (Add-rules gone, always-load line updated); AC2 grep `design.json`; AC3 grep `design-craft` (no trigger conditions restated); AC4 JSON block unchanged; AC5 no write ops; AC6 diff-stat = the two files only.
