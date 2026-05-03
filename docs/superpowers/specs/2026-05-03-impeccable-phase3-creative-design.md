# Impeccable Integration — Phase 3: Creative Surfacing System

**Status:** Draft
**Target version:** claude-tweaks v4.5.0 (Phase 3 of 3)
**Date:** 2026-05-03
**Parent design:** [2026-05-03-impeccable-integration-design.md](2026-05-03-impeccable-integration-design.md)
**Depends on:** [Phase 2](2026-05-03-impeccable-phase2-polish-design.md) (must be merged first)

## Background

Phase 3 of the Impeccable integration. Phase 1 shipped foundation + read-only integration; Phase 2 shipped polish phase + polymorphic specify. Phase 3 activates the creative surfacing system — the three independent anchors that ensure creative commands (`bolder`, `delight`, `animate`, `colorize`, etc.) cannot get buried.

Read the parent design for full context. This phase doc only specifies what Phase 3 ships.

## Goals

- Activate intent-driven dispatch in `polish` mode: read `design-intent:` frontmatter, dispatch matching creative commands.
- Activate `survey` mode: analyze rendered UI + diff, produce ranked Creative Opportunities recommendations.
- Add Creative Opportunities block to `/visual-review` output (anchor 2).
- Add Creative Opportunities block to `/flow` pipeline summary (anchor 3).
- Track declined recommendations per spec to suppress noise on re-runs.

## Non-goals

- Per-anchor user-preference settings (e.g., "always show survey, never show summary block"). Defer until requested.
- Creative-command effectiveness scoring. Recommendations are heuristic, not measured.
- Auto-running creative commands without explicit intent. Creative commands remain manually-invoked or intent-fit only.

## Files touched (Phase 3)

| File | Action |
|------|--------|
| `skills/design/SKILL.md` | Modify — activate `survey` mode, expand `polish` mode with intent-driven dispatch |
| `skills/design/command-map.md` | Modify — add intent-driven dispatch table |
| `skills/visual-review/SKILL.md` | Modify — invoke `/claude-tweaks:design survey`, render Creative Opportunities block |
| `skills/visual-review/browser-review.md` | Modify — document survey integration in browser review procedure |
| `skills/flow/SKILL.md` | Modify — add Creative Opportunities block to pipeline summary |
| `.claude-plugin/plugin.json` | Modify — bump version to v4.5.0 (final) |
| `README.md` | Modify — document creative surfacing system |

Total: 7 files (under `/flow`'s 10-file scope-check threshold).

## Components (Phase 3)

### Intent-driven dispatch in `polish` mode

Wrapper's `polish <spec>` mode (Phase 2: auto-fit + issue-driven only) gains intent-driven dispatch as a third dispatch class:

After auto-fit and issue-driven commands run:

1. Read spec's `design-intent:` frontmatter (written by Phase 2's `/specify`).
2. Dispatch matching creative commands per the table below. Multiple intents → multiple commands (e.g., `design-intent: bold,delightful` → `/impeccable bolder` + `/impeccable delight`).
3. `none` or absent → skip intent-driven dispatch.

**Intent → command mapping (in `command-map.md`):**

| `design-intent:` value | Commands invoked |
|------------------------|------------------|
| `bold` | `/impeccable bolder <changed-files>` |
| `quiet` | `/impeccable quieter <changed-files>` |
| `minimal` | `/impeccable distill <changed-files>` |
| `delightful` | `/impeccable delight <changed-files>` + `/impeccable animate <changed-files>` |
| `onboarding` | `/impeccable onboard <changed-files>` |
| `none` | (no commands) |

Note: `colorize`, `extract`, `overdrive` are not intent-driven in this phase — they remain manual-only. Add later if user demand surfaces.

### `survey` mode activation

Wrapper's `survey <files>` mode (stub in Phase 1/2) becomes:

1. Run universal preconditions.
2. If invoked from `/visual-review`: read screenshot paths from caller; analyze each (LLM call) for opportunities matching creative commands' "would help" criteria (e.g., "monochrome page → colorize would help").
3. If invoked from `/flow` summary: analyze full diff (no screenshots); apply heuristic per-file checks (e.g., "page with no animations + complex interactions → animate could help").
4. Read declined-recommendations cache at `~/.claude-tweaks/cache/declined-{spec}.json`. Suppress recommendations the user previously declined for this spec.
5. Return `{recommendations: [{page, observation, command, rationale}, ...]}`.

### `/visual-review` Creative Opportunities block (anchor 2)

`skills/visual-review/SKILL.md` updates:

After existing visual review procedure completes (browser review, screenshot capture, page-level findings), invoke `/claude-tweaks:design survey <files>` with screenshot paths.

Append to visual review report:

```markdown
### Creative Opportunities (from /visual-review)

| Page | Observation | Suggested command |
|------|------------|-------------------|
| /pricing | Hero feels generic — pure black on white, no personality | `/impeccable bolder pricing` |
| /empty-cart | Empty state shows only "No items" text | `/impeccable delight empty-cart` |

> These are recommendations only. Run any command manually if you want to apply it.
```

If wrapper returns `{recommendations: []}`, omit the block. If skipped, omit the block.

### `/flow` pipeline summary Creative Opportunities block (anchor 3)

`skills/flow/SKILL.md` Step 3 (Pipeline Summary) updates:

Before the existing Next Actions block in the pipeline summary, invoke `/claude-tweaks:design survey <full-diff>` and render:

```markdown
### Creative Opportunities

The polish phase ran the auto-fit + issue-driven + intent-driven commands. These could enhance the result further:

| Command | Why it might help |
|---------|------------------|
| `/impeccable colorize dashboard` | Heavy monochrome — strategic accent color recommended |
| `/impeccable animate settings` | Toggle interactions are static |

Each is a one-shot manual command; flow does not run these automatically.
```

If wrapper returns `{recommendations: []}`, omit the block. If skipped, omit the block.

### Declined-recommendations tracking

When a user declines a recommendation (by not running the suggested command before the next `/flow` run on the same spec), the wrapper records the decline.

**Detection mechanism:**
- After `/flow` completes, the wrapper writes the surfaced recommendations to `~/.claude-tweaks/cache/recommended-{spec}.json`.
- On the next `/flow` run for the same spec, the wrapper compares the new diff against the recommendations file. If a recommended command was not invoked (no commits matching its expected file changes), increment its decline counter.
- After 2 declines, suppress the recommendation for that spec.

**Reset mechanism:** User can clear declined recommendations by deleting `~/.claude-tweaks/cache/declined-{spec}.json` or via `/claude-tweaks:design reset-recommendations <spec>`.

## Open items

- **Survey LLM cost** — analyzing each screenshot for creative opportunities is an LLM call per screenshot. Build step must measure cost on a representative spec and decide whether to gate behind `--with-survey` flag for users on tight budgets. Default: enabled; flag to disable.
- **Decline detection accuracy** — file-change comparison may produce false positives (e.g., user ran the command and edited the result, masking the original change). Build step must validate; if accuracy is poor, switch to explicit user opt-out (e.g., `/claude-tweaks:design decline <command>`).
- **Multi-intent dispatch ordering** — when `design-intent: bold,delightful` triggers both `/impeccable bolder` and `/impeccable delight`, the order may matter (one may undo the other's work). Build step must test and document recommended ordering; potentially run them in a defined sequence with re-verify between (cap re-verify cycles to total of 1 across all design dispatch).

## Anti-patterns

| Pattern | Why It Fails |
|---------|--------------|
| Surfacing recommendations user has already declined | Annoying noise | Decline tracking suppresses after 2 declines |
| Auto-running creative commands from survey output | Removes user agency over creative direction | Survey is read-only; only intent-fit auto-dispatches creative commands |
| Pipeline summary block firing on non-frontend specs | Irrelevant noise | Wrapper skips at detection layer; block omitted |
| Treating recommendation absence as "design is brilliant" | Survey can miss opportunities | Block clearly says "could enhance further", not "design is complete" |

## Acceptance gates (for `/flow` to declare PASS)

- All 7 files in the file table modified.
- `node --test tests/` passes (new tests for intent dispatch, survey, decline tracking).
- `/flow` on a spec with `design-intent: bold` invokes `/impeccable bolder` in polish phase.
- `/flow` on a spec with `design-intent: delightful` invokes both `delight` and `animate`.
- `/flow` on a spec with `design-intent: none` skips intent-driven dispatch.
- `/visual-review` on a frontend spec produces a Creative Opportunities block.
- `/flow` pipeline summary produces a Creative Opportunities block.
- Declined recommendation suppressed after 2 `/flow` runs without invocation.
- Plugin version bumped to v4.5.0 (final).
- README documents the three anchors.

## Relationship to other skills (Phase 3)

| Skill | Relationship |
|-------|--------------|
| `/visual-review` | Invokes `survey` mode for Creative Opportunities block |
| `/flow` | Pipeline summary invokes `survey`; intent-driven dispatch in polish phase |
| `/specify` | `design-intent:` frontmatter (written in Phase 2) consumed by polish |
| Impeccable plugin | Creative commands (`bolder`, `delight`, `animate`, etc.) invoked by intent dispatch |
