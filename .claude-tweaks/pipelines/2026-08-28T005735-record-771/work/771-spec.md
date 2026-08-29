---
record: 771
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 771: local-merge + auto mode: finishing-a-development-branch has no auto-mode awareness, blocks on a human answer

Surface: backend

## Current State

Under `integration-model: local-merge` + `auto` mode, `cleanup-procedures.md` Section C calls `/superpowers:finishing-a-development-branch`, which has no auto-mode awareness and blocks on a real human answer even when the rest of the pipeline runs hands-off. `pr-first`'s integration model already has a no-prompt path via `_shared/pr-first-merge.md`; `local-merge` has no equivalent. Discovered while building #688 (folding the merge decision into the Wrap-Up Review Console's terminal options); confirmed by reading the shipped superpowers skill source directly. Related: #688, #689, #693.

## Deliverables

- [ ] Confirm (by reading `superpowers:finishing-a-development-branch`'s current shipped source) that it has no auto-mode parameter or bypass today.
- [ ] Add a `local-merge` + `auto` mode no-prompt path, mirroring `pr-first`'s `_shared/pr-first-merge.md` mechanism — either via a superpowers-side auto-mode parameter (if superpowers accepts a contribution/config), or a claude-tweaks-side branch that bypasses the interactive prompt specifically for `local-merge` + `auto`.
- [ ] Wire the new no-prompt path into `cleanup-procedures.md` Section C so `auto` mode under `local-merge` never blocks on a human answer.

## Acceptance Criteria

1. Running the pipeline finish flow under `integration-model: local-merge` + `auto` mode completes without any interactive prompt from `/superpowers:finishing-a-development-branch` or its replacement path.
2. The auto-mode decision (merge/keep/discard) is logged per `_shared/auto-decision-log.md`'s canonical entry schema, mirroring how `pr-first`'s no-prompt path already logs its own auto decisions.
3. Interactive mode under `local-merge` is unaffected — the existing human-answer prompt still fires exactly as today when not running in `auto` mode.

## Technical Approach

Two candidate mechanisms, per the original scope note: (a) a superpowers-side auto-mode parameter passed into `/superpowers:finishing-a-development-branch` itself, if superpowers is willing to accept that surface change, or (b) a claude-tweaks-side bypass in `cleanup-procedures.md` Section C that skips the superpowers call entirely under `local-merge` + `auto`, replicating whatever default `pr-first`'s `_shared/pr-first-merge.md` no-prompt path already applies (most likely: merge with a default policy, log the decision). Prefer (b) if superpowers' finishing-a-development-branch skill is out of this repo's control to modify — a claude-tweaks-side branch keeps the fix entirely within this plugin's own maintenance surface.

### Key Files

- `plugin/skills/_shared/cleanup-procedures.md` (Section C) — add the `local-merge` + `auto` no-prompt branch
- `plugin/skills/_shared/pr-first-merge.md` — reference implementation for the no-prompt pattern to mirror
- `plugin/skills/_shared/auto-decision-log.md` — log entry schema for the new auto-decision

## Gotchas

- Don't modify `/superpowers:finishing-a-development-branch` directly unless confirmed that's an acceptable/expected contribution surface — it's a third-party (superpowers plugin) skill; prefer the claude-tweaks-side bypass approach unless investigation shows otherwise.
- This must not silently skip the merge decision — the auto-mode default must still make an explicit, logged choice (matching `pr-first`'s own no-prompt default policy), not just suppress the prompt and do nothing.

## Original request

local-merge + auto mode: finishing-a-development-branch has no auto-mode awareness, blocks on a human answer

**Related:** #688, #689, #693

Context: Discovered while building #688 (folding the merge decision into the Wrap-Up Review Console's terminal options). Confirmed by reading the shipped superpowers skill source.

Scope: Under `integration-model: local-merge` + `auto` mode, `cleanup-procedures.md` Section C still calls `/superpowers:finishing-a-development-branch`, which has no auto-mode awareness and will block on a real human answer even when the pipeline is otherwise running hands-off. `pr-first` already has a no-prompt path via `_shared/pr-first-merge.md`; `local-merge` has no equivalent. Likely needs either a superpowers-side auto-mode parameter, or a claude-tweaks-side auto-mode branch that bypasses the interactive prompt for `local-merge`.

