# `execution.always` Policy Lever — Design

**Date:** 2026-07-08
**Status:** Approved for planning

## Goal

Guarantee that this project (and any project that opts in) always executes plans via `/superpowers:subagent-driven-development`, never `/superpowers:executing-plans` (batched), and never stops to ask "which execution strategy?" — without touching any legitimate human checkpoint (design approval, spec review, HARD-GATE failures, the Wrap-Up Review Console, or the ops-item acknowledgment gate).

## Background

The user's actual workflow is: brainstorm → `/claude-tweaks:specify` → `/clear` → `/claude-tweaks:flow <specs>`. Investigation during brainstorming confirmed that `/flow` in its default `auto` mode **already** does what was asked: it hardcodes subagent execution (batched isn't even an available argument), renders the Pipeline Config Manifesto as a read-only FYI with no approval stop, and runs build → test → review → polish → wrap-up with no admin-level interruptions. The only things designed to stop a run are HARD-GATE failures, an ops-item acknowledgment gate that fires only when ops items actually exist (explicitly protected from `auto` silencing per `_shared/auto-mode-contract.md`), and the Wrap-Up Review Console at the very end — all of which are intentional and out of scope for removal.

Auditing every `AskUserQuestion` call site across the `flow`/`build`/`test`/`review`/`wrap-up` skills found two narrow, real gaps, both specific to `/claude-tweaks:build` used **outside** `/flow`:

1. **`build-options.md`'s "How should this build run?" prompt only checks `$ARGUMENTS` and the literal `auto` keyword** — it does not check a CLAUDE.md `execution-strategy:` default before deciding whether to ask, even though the file's own "Default resolution" section documents CLAUDE.md settings as a valid source. A bare `/claude-tweaks:build 42` (no `/flow`, no `auto`) still asks the strategy question every time, regardless of project defaults.
2. **`/flow` never explicitly passes `subagent` into its own `/build` invocation** — it currently relies on prose ("flow always uses subagent") rather than forcing the value through `/build`'s own precedence chain. This is currently harmless only because nothing today sets a conflicting default; it is not defended against a future divergence (e.g., a CLAUDE.md `execution-strategy: batched` set for some unrelated standalone-`/build` use case).

Both gaps are closed by a single new policy lever, following the precedent already established by `worktree.always`.

## Design

### The lever

```yaml
# .claude-tweaks/policy.yml
worktree.always: true
execution.always: subagent
```

`execution.always: subagent` collapses the Execution axis to a single value, the same way `worktree.always: true` already collapses the Git axis. When set:

- The Build Options table (in `/build`'s SKILL.md and `build-options.md`) shows Execution as a single fixed row, not a 2-way choice.
- `/build`'s "How should this build run?" prompt never fires, in any mode — not just `auto`.
- An explicit `batched` argument to `/build` is rejected with an error, mirroring how `current-branch` is already rejected under `worktree.always: true`.

**Enforcement is soft, by design, and this is stated explicitly rather than glossed over.** `worktree.always` has a second, mechanical enforcement layer — a `PreToolUse` hook that denies Edit/Write/commit calls outside a worktree, because "which directory did this edit land in" is an interceptable tool call. "Which execution strategy did the assistant narrate choosing" has no equivalent interceptable action, so `execution.always` — like every other lever in the auto-mode-contract system (scope-creep, review-severity-floor, etc.) — is enforced by the assistant reading `.claude-tweaks/policy.yml` and following it, with no mechanical backstop. This is consistent with the existing risk profile of the rest of the policy system, not a new weakness specific to this lever.

### `/build` changes

`skills/build/build-options.md`:
- Build Options table: Execution axis collapses to one row (`subagent`) when `execution.always` is set, exactly parallel to the existing Git-axis collapse under `worktree.always`.
- Rewrite the "Prompt for build options" trigger condition to check `execution.always` (and the existing `worktree.always`) *before* evaluating whether anything is still undecided from `$ARGUMENTS` — so with the lever set, the prompt never fires, in any mode. This is the fix for gap 1 above; it also closes the pre-existing inconsistency where CLAUDE.md defaults were documented as authoritative but not actually consulted by the prompt trigger.
- Invocation grammar: an explicit `batched` argument becomes a rejected/error case when the lever is set.
- Default resolution list: `execution.always` sits at the top of the precedence order (same standing as the existing "Git lever override" note for `worktree.always`).

`skills/build/SKILL.md`:
- Build Options summary table and the `worktree.always` paragraph get a parallel one-line mention of `execution.always`.

### `/flow` changes

`skills/flow/SKILL.md` Step 1.3: `/flow` explicitly passes `subagent` as an argument when it invokes `/claude-tweaks:build`, rather than relying on `/build`'s own default-resolution chain. This is defense in depth, not a behavior change — `/flow` already only ever produces subagent-executed builds in practice. Putting `subagent` at the top of `/build`'s precedence order (explicit arguments always win) makes that fact independent of `/build`'s resolution logic instead of coincidental to it. This closes gap 2.

No other changes to `/flow` — its Manifesto, gate behavior, and Anti-Patterns table already correctly document and enforce "flow is always subagent, batched is unavailable."

### Documentation and cross-references

- `skills/_shared/git-discipline.md:9` is where `worktree.always` is canonically explained as a policy-lever pattern (its opt-in mechanics, `/init` Phase 0 Step 6 offer, and the PreToolUse hook it feeds). Add a sibling paragraph immediately after it introducing `execution.always`, explicitly noting the enforcement asymmetry (no PreToolUse hook backs this lever) so a future reader who finds one finds both and understands why they're not identical in strength.
- No new Relationship-table rows are needed in `/build` or `/flow` — no new skill is introduced, only an existing lever pattern extended.

### Dogfooding

Add `execution.always: subagent` to this repo's own `.claude-tweaks/policy.yml`, alongside the existing `worktree.always: true`. This project already only ever wants subagent execution; there's no reason to defer adopting the feature it ships.

### Versioning

The implementation plan includes an explicit task to bump `.claude-plugin/plugin.json`'s minor version and mirror it to the marketplace repo — not left implicit, per this project's own documented lesson that version bumps left to "remembering" get silently absorbed by a concurrent unrelated bump.

## Verification

This is markdown-prompt behavior, not compiled code — there is no unit test that can observe "did the assistant ask a question." Verification is inspection-based:
- Self-review during planning: confirm every `AskUserQuestion` site touched by this change has its trigger condition read `execution.always`/`worktree.always` before falling through to a live prompt.
- A dry-run walkthrough: read `/build 42` (no args, no `auto`) against a policy.yml with both levers set, and confirm by inspection that no prompt fires per the updated trigger text.
- No `npm test` coverage is expected or added — `bin/lib/policy.js` is not touched (no hook consumes this lever, unlike `worktree.always`'s `isWorktreeAlwaysOn` reader used by `pre-tool-use.js`), so there is nothing for `node --test` to exercise.

## Out of scope

- Removing or altering the design-approval / spec-review gates inside `/superpowers:brainstorming` — these are legitimate collaborative checkpoints, not administrative friction, and were explicitly kept per the user's scoping decision during brainstorming.
- Removing or altering the ops-item acknowledgment gate or the Wrap-Up Review Console — both are intentional, documented, un-silenceable checkpoints (`_shared/auto-mode-contract.md`).
- A mechanical `PreToolUse`-style hook for execution strategy — no interceptable tool call exists for this choice; see the Enforcement note above.
- Extending `/flow` to accept design docs directly (bypassing `/claude-tweaks:specify`) — considered during brainstorming and explicitly declined; the user's actual workflow deliberately breaks at the spec boundary (`/clear` between spec creation and `/flow`), so no chaining across that boundary was requested.
- An `/init` Phase 0 bootstrap offer for `execution.always`, parallel to the existing Step 6 offer for `worktree.always`. `worktree.always`'s bootstrap offer exists because `/init` is a new project's first touchpoint with the plugin; `execution.always` is being introduced here as a targeted fix for an already-`worktree.always`-adopting project (this one), not as a new-project-onboarding concern. Worth a follow-up if this lever proves broadly useful, but not bundled into this change.
