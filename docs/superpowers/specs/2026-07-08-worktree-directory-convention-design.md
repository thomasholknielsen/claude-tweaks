# Worktree directory convention — two-domain fix — Design

**Date:** 2026-07-08
**Status:** Approved — ready for planning
**Scope:** Fix `bootstrap-steps.md`'s dangerous "migrate to `.worktrees/`" instruction, replace the single-winner "the standard directory is X" framing with an accurate two-domain description, and fix a related correctness bug in `/code-health`'s directory-skip list. Doc-only for `skills/`; a minimal existing-array fix for `bin/`.

## Problem

`skills/init/bootstrap-steps.md` Step 6 documents `.worktrees/` as "the standard worktree directory... matches superpowers v5.1.0's preferred path and is the only directory `/superpowers:finishing-a-development-branch` will clean up," and instructs: "If a legacy `.claude/worktrees/` directory exists, suggest migrating to `.worktrees/` so superpowers's cleanup step owns the path." `skills/init/SKILL.md`'s Step 6 summary repeats the same migration instruction.

This was discovered incidentally (during the `worktree.always` `/init` rollout, this same session) to be backwards. `.claude/worktrees/` is not legacy — it's what the native `EnterWorktree` harness tool produces *right now, by design*, every time it's available (confirmed live: this repo currently has 4 active worktrees under `.claude/worktrees/`, 0 under `.worktrees/`). Following the documented migration advice would relocate a live, harness-registered worktree into the one path where a different, unrelated cleanup mechanism (superpowers' `finishing-a-development-branch`) will later `git worktree remove` it — deleting it out from under the harness's own bookkeeping, which has no way to know the directory it's tracking just vanished.

`/superpowers:using-git-worktrees` Step 1 already separates these into two mutually exclusive creation paths — Step 1a (native tool, e.g. `EnterWorktree` → `.claude/worktrees/`, harness-owned) and Step 1b (git fallback, used *only if no native tool exists* → `.worktrees/`, superpowers-owned) — and states outright: "Using `git worktree add` when you have a native tool creates phantom state your harness can't see or manage." `bootstrap-steps.md` Step 6 collapses this two-branch design into a single "the standard directory is X" sentence, which is what produces both the wrong-direction migration advice and a genuine internal contradiction: `skills/_shared/subagent-output-contract.md:39` already documents `.claude/worktrees/<name>/` as the *normal, expected* location a dispatcher runs from, while the init files call the same path "legacy."

A debiasing pass (`/claude-tweaks:challenge`, brief at `docs/plans/2026-07-08-worktree-directory-convention-brief.md`) confirmed this reframe across all seven lenses and additionally verified: the "provenance-based ownership" model this fix relies on (harness owns non-`.worktrees/` cleanup, superpowers owns `.worktrees/`) is real in the *currently shipped* `finishing-a-development-branch` skill (its "Otherwise: the host environment owns this workspace. Do NOT remove it" branch), but a more thorough upstream redesign of the same area (`2026-04-06-worktree-rototill-design.md`, cached in every superpowers version 5.1.0 through 6.1.1) has sat in Draft status with 0 of 22 implementation tasks checked since April — upstream itself acknowledges this exact class of bug ("harness-created worktrees at `.claude/worktrees/` are invisible to the skill") without having shipped a fix. This means the doc fix here must describe current behavior conservatively, not assert a stronger contract than what's actually shipped.

A follow-up grep across the whole plugin (`skills/` and `bin/`) for other hardcoded worktree-path assumptions found two more real issues beyond the two already-known migration-instruction locations:

- `skills/init/summary-templates.md`'s Phase 9 "Verified & Consistent" health-check table lists `.worktrees/` as a "Workflow dir" that should be "present" — misleading, since it's legitimately absent on any project using the native tool (this repo included).
- `bin/lib/code-health/lenses/{dependency-freshness,todo-comments,dead-export,oversized-file}.js` all hardcode an identical `SKIP_DIRS` set containing `.worktrees` but not `.claude` — so `/code-health`'s scanners currently walk *into* live, other-session-owned worktrees under `.claude/worktrees/`, scanning code and in-progress work that isn't part of the codebase being reviewed.

Five other files matched a broader grep (`_shared/auto-decision-log.md`, `flow/multi-spec.md`, `flow/multispec-review-console.md`, `wrap-up/SKILL.md`, `wrap-up/cleanup-procedures.md`, `tidy/SKILL.md`, `help/context-flow.md`) but all use generic, path-agnostic phrasing or illustrative example text — no further changes needed there.

## Approach

Replace the single-winner framing with an explicit two-domain description everywhere it appears, and point any consumer that needs to detect a worktree at `git worktree list` (the pattern already used by `wrap-up`/`tidy`) or the existing structural check (`bin/lib/hooks/worktree-detect.js`'s `GIT_DIR != GIT_COMMON`), rather than asserting a directory name as fact.

Two alternatives considered and rejected during brainstorming:
- **Minimal patch** (fix only the dangerous migration line, leave the rest of Step 6's "standard directory" framing intact) — rejected: leaves the root single-winner framing in place, which is what produced the wrong-direction migration advice in the first place; a future edit to Step 6 could easily reintroduce the same bug.
- **Broader still — new `ExitWorktree`-invoking cleanup step, or track upstream's rototill design in an INBOX item** — rejected: the cleanup logic lives inside superpowers, a separate plugin this repo doesn't own; no code change inside claude-tweaks can alter superpowers' cleanup behavior, and upstream's own design for this area is unfinished (0/22 tasks), so committing this repo to track or depend on it is premature. Doc-only within claude-tweaks stays correctly scoped to what this repo actually controls.

## Components

| File | Change |
|---|---|
| `skills/init/bootstrap-steps.md` | Step 6 intro paragraph: replace "the standard worktree directory is `.worktrees/`... matches superpowers v5.1.0's preferred path" with a two-domain description. Item 3: replace the migration instruction with a statement that `.claude/worktrees/` is a separate, harness-owned convention that needs no migration. Items 1-2 (create `.worktrees/`, verify gitignored) stay unchanged — the git-fallback path remains legitimate infrastructure to keep ready. |
| `skills/init/SKILL.md` | Step 6 summary line: same fix as above, condensed to match the summary's existing length. |
| `skills/init/summary-templates.md` | Phase 9 "Workflow dirs" health-check row: drop `.worktrees/` from the row entirely — check `specs/`/`docs/` only. A worktree directory's presence or absence isn't a meaningful health signal (it's legitimately empty when the native tool is in use), so there's nothing to replace it with; the row is more accurate with fewer items. |
| `skills/_shared/subagent-output-contract.md` | No change — already correct; serves as the reference other files must now match. |
| `bin/lib/code-health/lenses/dependency-freshness.js`, `todo-comments.js`, `dead-export.js`, `oversized-file.js` | Add `'.claude'` to each file's `SKIP_DIRS` set (identical one-line change, 4 files) — blanket-skips `.claude/` the same way `.claude-tweaks` and `.git` are already skipped, consistent with skipping non-primary-source infrastructure directories. |

No changes to `bin/lib/hooks/worktree-detect.js` or the `worktree.always` policy gate — both are already structural (`GIT_DIR != GIT_COMMON`) and convention-agnostic; this fix doesn't touch them and doesn't need to.

## Out of scope

- Any change to superpowers itself (`using-git-worktrees`, `finishing-a-development-branch`) — this repo doesn't own that plugin.
- Building a claude-tweaks-side worktree cleanup mechanism independent of superpowers or the harness's own `ExitWorktree` — the debiasing brief's constraint section is explicit that this is out of this repo's control to fix, only to describe accurately.
- Tracking or waiting on upstream's `2026-04-06-worktree-rototill-design.md` — it's superpowers' unexecuted plan to act on, not a claude-tweaks dependency to monitor.
- The five files that matched the broader grep but only contain generic/illustrative worktree-path mentions (`auto-decision-log.md`, `flow/multi-spec.md`, `flow/multispec-review-console.md`, `wrap-up/SKILL.md`, `wrap-up/cleanup-procedures.md`, `tidy/SKILL.md`, `help/context-flow.md`) — verified during brainstorming to need no change.

## Testing

`skills/` changes are prose-only — no automated tests apply; verification is manual re-read for internal consistency (the two-domain description must read the same way in both `bootstrap-steps.md` and `init/SKILL.md`, and must no longer contradict `subagent-output-contract.md:39`).

The four `bin/lib/code-health/lenses/*.js` changes are one-line array edits to existing, already-tested modules. Existing tests under `bin/lib/code-health/tests/` cover `SKIP_DIRS` behavior for other entries (`node_modules`, `.git`, etc.) — the implementation plan should add one test per lens confirming a file under a `.claude/` subdirectory is skipped, following the existing test pattern for `.claude-tweaks`/`node_modules` exclusion in the same suite.
