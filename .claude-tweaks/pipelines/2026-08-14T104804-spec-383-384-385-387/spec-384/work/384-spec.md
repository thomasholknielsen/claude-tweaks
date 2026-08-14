---
record: 384
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: design-craft-integration:design-wrapper-pre-build-always-load-motion-refs-sidecar-and
blocked-by: [383]
surface: backend
---
# 384: design-wrapper pre-build: always-load motion refs, sidecar, and Emil skill resolution

Surface: backend

## Overview

Make `skills/design-wrapper/modes/pre-build.md` the main implementation of the craft contract (`skills/_shared/design-craft.md`, #383). Three deltas close the verified structural hole — today Step 3 keyword-gates `motion-design.md` and `interaction-design.md` on the spec's own text, so a spec that never says "animation" produces UI built with zero motion craft, and Step 4 loads `PRODUCT.md`/`DESIGN.md` but not the sidecar where Impeccable keeps motion tokens.

**Do not start before #383 merges** — the Emil resolution procedure, relevance map, and rule block this sub-issue loads are defined there (native Blocked-by link recorded). At pickup, re-verify #383's merged file for its actual section structure before citing anchors.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- No change to the wrapper's other modes, its detection layers (the existing frontend/surface classification is consumed as-is — its reliability is out of scope by design), or `skills/design-wrapper/SKILL.md` (the explore-mode family #377/#378/#379 is editing SKILL.md concurrently — this sub-issue stays out of that file).
- No change to the output contract's field set — `{mode, result, loaded, context_size, missed, description}` stays as is.
- `pre-build` stays read-only — no new write operations of any kind.
- No duplication of the contract's relevance map or resolution logic at authoring time — the file references `_shared/design-craft.md` and states only what is pre-build-specific. (Loading the contract file at runtime is not duplication; restating its rules in this file's prose is.)

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #383 | Design craft contract: decisions vs principles assembly for UI-writing dispatches | open — hard prerequisite, build strictly after it lands |

## Current State

- `skills/design-wrapper/modes/pre-build.md` — Step 3's selection rules: always-load when frontend is `typography.md`, `color-and-contrast.md`, `spatial-design.md`, `new-work.md`; `motion-design.md`, `responsive-design.md`, `interaction-design.md`, `ux-writing.md` are keyword-gated. Step 3 carries a deliberate note that the keyword rules must not grow into a job-type classifier. Step 4 loads `PRODUCT.md` + `DESIGN.md` via the canonical-paths-then-fallback-glob procedure; missing files are not errors. The Output-to-caller block documents `loaded` as an array of file paths.
- `skills/build/design-prebuild.md` — the caller: invokes the mode at `/claude-tweaks:build` Common Step 1.7, forwards `loaded`/`description` into implementer subagent prompts (per-task system prompt for UI-file tasks under the subagent strategy; summarized into the batch handoff under the batched strategy), and reads `Visual-reference:` directly.
- `.impeccable/design.json` — Impeccable 4.x's sidecar: motion tokens, shadow/elevation tokens, breakpoints, component snippets, narrative — "what Stitch's schema can't hold" (per the installed plugin's `document.md`). Audited by `doctor`; read by nothing in claude-tweaks today. It is JSON, potentially large (component snippets); it is forwarded exactly like any other loaded file and counted by `context_size`, whose summarize path handles it like the rest.
- `skills/_shared/design-craft.md` (#383) — the authority rule, Emil resolution procedure, relevance map, degradation posture. The Emil skill files and Step 3's Impeccable reference files are **disjoint sets from two different upstreams** — no overlap, no precedence between them; both simply join `loaded`.

## Deliverables

- [ ] Step 3: promote `motion-design.md` and `interaction-design.md` into the frontend always-load set; delete their two keyword rules. `responsive-design.md` and `ux-writing.md` keep their keyword rules unchanged. The existing "not a job-type classifier" note stays intact and true.
- [ ] Step 4: additionally load the sidecar at its single canonical path `.impeccable/design.json` (project root; **no fallback glob — deliberate**, upstream fixes its location). Missing sidecar is not an error. Exactly one permutation writes a `missed` note: `DESIGN.md` found but sidecar absent — that is the only state where a sidecar is expected to exist, since upstream's `document` flow creates it alongside `DESIGN.md`; all other found/absent combinations stay silent, by design.
- [ ] New step (after Step 4): resolve and load Emil's skills per `_shared/design-craft.md`'s resolution procedure and relevance map — loaded skill files join `loaded`, absent relevance-map-selected skills join `missed`. The step references the contract for all selection logic; only the pre-build-specific mechanics (which output fields the results land in) are stated here.
- [ ] Same new step: add the contract file itself to `loaded` — the literal path `${CLAUDE_PLUGIN_ROOT}/skills/_shared/design-craft.md` — so the implementer receives the authority rule verbatim as part of the loaded set. This is the mechanism (a path string appended to `loaded`, exactly like every other entry; no schema change, no excerpting): the contract file is written to be safely includable whole (#383).
- [ ] `skills/build/design-prebuild.md`: one short addition noting the enriched `loaded` set now carries principles (Emil skills when installed), the sidecar, and the contract file, forwarded to implementers exactly like the existing references — no separate handling.

## Acceptance Criteria

1. In `modes/pre-build.md`, `motion-design.md` and `interaction-design.md` appear on the always-load line and `grep -n "Add \`motion-design.md\`\|Add \`interaction-design.md\`" skills/design-wrapper/modes/pre-build.md` returns nothing.
2. `grep -n "design.json" skills/design-wrapper/modes/pre-build.md` shows the sidecar loaded in Step 4 with the root-only path, the missing-is-not-an-error posture, and the single `missed` permutation stated.
3. `grep -n "design-craft" skills/design-wrapper/modes/pre-build.md` shows the Emil step referencing `_shared/design-craft.md` and the contract file's own path joining `loaded`; the relevance map's trigger conditions are not restated in this file.
4. The Output-to-caller JSON block is unchanged in field names and shape.
5. The file still contains no write operations; the "does not modify code" statement stands.
6. `git diff --stat` touches only `skills/design-wrapper/modes/pre-build.md` and `skills/build/design-prebuild.md`.

## Technical Approach

Prose-procedure edits only. The always-load promotion is a one-line move plus two rule deletions; the sidecar is a Step 4 addition alongside the existing canonical-path reads; the Emil step is a new short section delegating to the contract and appending path strings to `loaded`.

### Key Files

- `skills/design-wrapper/modes/pre-build.md` — Steps 3/4 + new Emil step
- `skills/build/design-prebuild.md` — one-paragraph caller note

## Gotchas

- #377/#378/#379 (in-flight explore-mode family) edit `skills/design-wrapper/SKILL.md` and `impeccable-plugin.md` — do not touch either file here; the mode file and the caller file are conflict-free territory.
- The `context_size` (bytes/4) summarize-vs-inline mechanism in `/build` is size-generic and needs no change for the larger loaded set — deliberately no new size handling. This is a deferred-risk acceptance, not a verified measurement: if dogfooding shows the summarize path degrading craft signal, that is a follow-up record, not scope here.
- Degradation is informational, never a gate: an absent Emil install must produce a `missed` note and a normal `result: "ok"`, not a skip object.
- The keyword rules that remain (`responsive-design.md`, `ux-writing.md`) select reference files only — preserve the existing note that forbids growing them into a job-type classifier.
- At runtime in a user project, `_shared/design-craft.md` lives in the plugin cache — resolve it via `${CLAUDE_PLUGIN_ROOT}`, never via a project-relative path.


<!-- work-fingerprint: design-craft-integration:design-wrapper-pre-build-always-load-motion-refs-sidecar-and -->
