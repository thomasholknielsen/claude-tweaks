# /init Offers worktree.always — Design

**Date:** 2026-07-08
**Status:** Approved — ready for planning
**Scope:** `/init` bootstrap asks new and existing projects whether to enable `worktree.always`, so the mechanical enforcement built in `2026-07-06-always-worktree-enforcement-design.md` is no longer limited to this repo hand-authoring its own `policy.yml`.

## Problem

The `worktree.always` mechanism (`bin/lib/policy.js`, `bin/lib/hooks/pre-tool-use.js`, `bin/lib/hooks/session-start.js`) already ships with every install of the plugin — the hook code runs everywhere. But the policy only activates when a project's `.claude-tweaks/policy.yml` contains `worktree.always: true`, and nothing writes that file automatically. The original design deliberately scoped this repo as "the first adopter" and left broader rollout as future work:

> "Building it as a general, opt-in, per-project policy... lets other projects adopt the same guarantee later. This repo turns it on for itself as the first adopter."

Every other project using the plugin has the enforcement code installed but dormant, because nothing ever prompts them to opt in. `/init` is the one skill every project runs to bootstrap claude-tweaks — it's the natural place to close this gap.

## Approach

Extend `/init` Phase 0 Step 6 (Worktree Configuration) — already the home of the analogous `worktree.baseRef` question — with a new sub-step that asks whether to enable `worktree.always`, defaulting to the recommended "yes." This keeps the decision opt-in (a project can still decline) while making the recommended path active by default, rather than requiring a user to know the feature exists and hand-edit `policy.yml`.

Two alternatives were considered and rejected:
- **Silent default-on** (flip `isWorktreeAlwaysOn()` to return `true` when no policy file exists at all) — rejected as too high blast radius: it would change behavior for every existing installed project the next time its hooks fire, with no prompt and no migration step.
- **Silent write during bootstrap, no question asked** — rejected because enabling worktree isolation is a workflow-wide commitment; the user should see and approve it, the same way Impeccable/diagram-design/shadcn integrations (Steps 10-12) always ask rather than silently enabling.

## The question

Placed in Step 6, immediately after the existing `baseRef` sub-step.

**Idempotency check** — read `.claude-tweaks/policy.yml` if present:

| State found | Behavior |
|---|---|
| No `worktree.always:` line at all (no file, or file missing the key) | Ask the question |
| `worktree.always: true` | No-op — already enabled, skip silently |
| `worktree.always: false` | Re-offer the upgrade path (matches the existing Impeccable/diagram-design/shadcn re-offer convention for a declined integration) |

**AskUserQuestion:**
- `question`: `"Require an isolated git worktree for every file edit in this project?"`
- `header`: `"Worktree policy"`
- Option 1 — `label`: `"Yes — enforce worktree.always (Recommended)"`, `description`: `"Mechanically denies Edit/Write/NotebookEdit/git commit outside a linked worktree from the first prompt of every future session. Prevents concurrent sessions from colliding on the main checkout."`
- Option 2 — `label`: `"No — allow direct edits in the main checkout"`, `description`: `"Leaves the main checkout open for direct edits. You can enable this later by re-running /init."`

On "Yes," queue `worktree.always: true` for write. On "No," queue `worktree.always: false` (written explicitly, not left unset, so the re-offer logic above has a signal to detect on the next run).

## Write timing — avoiding self-lockout

The decision is *asked* in Step 6, but the actual write to `.claude-tweaks/policy.yml` must not happen there. `/init` performs many more `Edit`/`Write` calls after Step 6 — Steps 7-14 write files (GitHub templates, shadcn `components.json`, workflow YAML, etc.), and for any scope beyond `bootstrap`, Phases 1-9 write CLAUDE.md, skills, rules, journeys, and the doc registry. The hook re-reads `policy.yml` fresh on every `PreToolUse` call with no caching — so writing `worktree.always: true` mid-run would cause `/init` to deny its own remaining writes for the rest of the invocation. The original design's implementation plan hit this exact hazard for its own Task 6 and worked around it by executing the whole plan inside a worktree; `/init`'s bootstrap run has no equivalent detour available, so the fix has to be in the write's timing instead.

**Rule:** write `.claude-tweaks/policy.yml` only after every other filesystem write this `/init` invocation will perform has already happened.

For the `bootstrap`-only scope (Phase 0 only, then stops), that resolves unambiguously: write immediately after Step 14 completes, since nothing else runs this invocation.

For every other scope, the implementation must identify the actual last file-write action for that scope rather than assume it's uniformly "Phase 9" — `/init`'s own Input section defines `config`/`skills`/`journeys`/`docs` as running specific phase subsets (e.g. `journeys` = Phases 0+8, `docs` = 0+2+3+8.5) without explicitly naming Phase 9 in each list, so whether Phase 9 is genuinely the universal terminal write-gate across all of them needs to be confirmed against the live skill file during planning, not assumed here. Whatever that terminal point turns out to be per scope, the deferred write attaches there, plus one summary line when the policy was just turned on: a note that the *next* edit (in a future turn, once this session's response finishes) requires an isolated worktree, pointing at `/superpowers:using-git-worktrees` — mirroring the hook's own deny message so there's no surprise on the next turn.

## Components

| File | Change |
|---|---|
| `skills/init/bootstrap-steps.md` | Step 6: add the idempotency check, the question, and the explicit "queue the decision, do not write policy.yml yet" instruction, cross-referencing where the deferred write actually happens |
| `skills/init/SKILL.md` | Step 6 summary line mentions the new sub-step; Phase 9 section documents the deferred write (the `bootstrap`-only tail case, plus whichever terminal write point applies per scope — confirmed against the live phase mechanics during planning, not assumed) plus the "next edit needs a worktree" note; Actions Performed table gets a `Worktree policy` row |
| `skills/_shared/git-discipline.md` | One-line update: opting into `worktree.always: true` now happens via `/init`, not only by hand-editing `policy.yml` |

No `bin/` code changes. The mechanical hook (`policy.js`, `pre-tool-use.js`, `session-start.js`) already exists and needs nothing new — this is `/init` learning to ask and write the file it already knows how to read.

## Out of scope

- Changing `isWorktreeAlwaysOn()`'s default-off behavior — a project with no `policy.yml` still resolves to `false`; only an explicit `/init`-driven (or hand-authored) `true` line turns enforcement on.
- Retroactively nudging already-`/init`-ed projects outside of their next `/init` re-run — there is no separate out-of-band notification mechanism; the re-offer-on-decline behavior (via the idempotency table above) is the only mechanism, and it only fires when `/init` runs again.
- Any change to `/build`'s or `/flow`'s existing `worktree.always`-aware Git-lever collapsing (`skills/build/SKILL.md`, `skills/build/build-options.md`, `skills/flow/manifesto.md`) — those already correctly react to the flag once it's set, regardless of how it got set.

## Testing

This is a prose-only change to skill markdown files (`bootstrap-steps.md`, `SKILL.md`, `git-discipline.md`) — no `bin/lib` code is added or modified, so `npm test` is unaffected and no new automated tests apply. Verification is manual: re-read the edited sections for internal consistency (the idempotency table, the write-timing rule, and the cross-references between `bootstrap-steps.md` and `SKILL.md` Phase 9 all agreeing on the same mechanism).
