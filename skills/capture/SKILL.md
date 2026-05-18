---
name: claude-tweaks:capture
description: Use when capturing ideas that need specification later — brain dumps, half-formed features, things to not forget
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Capture — Quickly note an idea for later specification

Quick capture for ideas that aren't ready for full specification. Part of the workflow lifecycle:

```
/claude-tweaks:init → [ /claude-tweaks:capture ] → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:stories → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                        ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- User mentions something that should be a feature but isn't specified
- Discovery during implementation reveals something that needs its own spec
- "We should probably..." or "Don't forget to..." moments
- Anything that would otherwise be lost or forgotten

> **INBOX vs DEFERRED:** Use `/claude-tweaks:capture` for new ideas and half-formed features. Work deferred from an active build/review goes to `specs/DEFERRED.md` instead — it carries origin context, file references, and timing triggers that INBOX entries don't have.

## Input

`$ARGUMENTS` is parsed as `<idea text> [--route=<value>]`:

| Argument | Behavior |
|----------|----------|
| Free-text idea | The body of the INBOX entry (title is derived from the first phrase or supplied via `--title=`). |
| `--route=challenge` / `--route=brainstorm` / `--route=inbox` / `--route=merge:N` | Skip the post-capture routing prompt; apply the route directly. |
| `--title="..."` | Override the auto-derived title. |

When `$ARGUMENTS` is empty, prompt the user for the idea body.

## Workflow

| Step | What |
|------|------|
| 1 | Append entry to `specs/INBOX.md` per the Entry Format below. |
| 2 | Route per `--route` arg, or via the Routing Prompt below. |
| 3 | Commit (when this is a standalone invocation; component-skill callers commit themselves). |

## File Location

`specs/INBOX.md` — single file, append-only during capture.

## Entry Format

```markdown
## [Short Title]

**Added:** YYYY-MM-DD | **Category:** {product | technical | legal | infrastructure} | **Related:** (optional spec numbers or "none")

Context: 1-2 sentences on why this came up or what triggered it

Scope: Rough sense of what it might involve (can be vague)
```

### Hard cap: ~5 lines per entry

If it takes more than 5 lines to describe, it's past the inbox stage — run `/superpowers:brainstorming` on it instead.

## Adding an Entry

1. Open `specs/INBOX.md`
2. Append new entry at the bottom
3. Don't overthink — capture the essence

## Immediate Routing

After adding the entry, route the item per the `--route` arg or by asking.

### Routing via `--route` arg (front-loaded)

`/claude-tweaks:capture` accepts `--route={challenge|brainstorm|inbox|merge:N}` to skip the post-capture prompt:

| `--route` value | Action |
|---|---|
| `challenge` | Open `/claude-tweaks:challenge` with the new INBOX item as input |
| `brainstorm` | Open `/superpowers:brainstorming` with the new INBOX item as input |
| `inbox` | Keep in INBOX; no further routing |
| `merge:42` | Merge the entry into spec 42; remove from INBOX |

When `--route` is provided, log:
```
AUTO {time} — Routing: applied --route={value} for INBOX entry "{title}".
```
No further prompt. Proceed directly to the routed skill or commit.

### Routing prompt (when `--route` not provided)

In auto mode, apply the silences-table row for /capture from `_shared/auto-mode-contract.md`: if `--route` was passed, honor it; otherwise default to `inbox` (the most conservative route — the item stays parked for periodic review at `/tidy`, no INBOX/DEFERRED write that wouldn't have happened anyway). Log:
```
AUTO {time} — Routing: defaulted to inbox (no --route provided). Reversibility: high (entry stays in INBOX; user can re-route via /tidy at any time).
```

In interactive mode (or when explicitly opted in), present:

```
Added to INBOX: "{item title}"

What should happen with this?
1. Challenge first — Run /claude-tweaks:challenge to stress-test assumptions, then /superpowers:brainstorming, then /claude-tweaks:specify
2. Brainstorm directly — Run /superpowers:brainstorming to explore the idea now, then /claude-tweaks:specify
3. Keep in INBOX — Not ready yet, will be reviewed during /claude-tweaks:tidy
4. Merge into spec {N} — This belongs in an existing spec (if a related spec is obvious)
```

> **Option 4 visibility:** Only show option 4 when a spec name in `specs/` matches the topic keywords from the INBOX item. Without a candidate match, option 4 is omitted entirely — manual disambiguation against an unspecified spec number is worse than no option at all.

This ensures every captured idea has an explicit next step — either immediate action or a conscious decision to park it.

**Good entries:**

- "Voice command to add item to shopping list" — context explains the need
- "Recipe nutrition facts display" — scope hints at UI + data needs

**Bad entries:**

- Just "nutrition" — too vague to act on later
- Full spec with 20 tasks — that's a spec, not an inbox item
- Notes about an existing spec ("spec 50 needs review") — put that on the spec itself

## Review Workflow

Periodically (or when inbox gets long), use `/claude-tweaks:tidy` to batch-review all INBOX items with recommended actions.

## Next Actions

When invoked by a parent skill, omit this block — the parent owns the handoff. When invoked directly by a user:

1. `/claude-tweaks:capture {next idea}` — capture another idea while you're in brainstorming flow **(Recommended)**
2. `/claude-tweaks:tidy` — review and triage INBOX (promote, merge, or drop stale items)
3. `/claude-tweaks:specify "{title}"` — promote this idea straight to a spec (uses the entry's title — INBOX entries are addressed by title, not numeric index)
4. `/claude-tweaks:challenge "{title}"` — debias and stress-test assumptions before specifying

## Component-Skill Contract

This skill is a **component skill** — directly invoked by `/claude-tweaks:build` (Common Step 4, design-mode follow-up capture). `/claude-tweaks:visual-review`, `/claude-tweaks:reflect`, and `/claude-tweaks:wrap-up` write to `specs/INBOX.md` directly without going through this skill, so they are NOT capture parents — they only recommend `/capture` in Next Actions for the user's next session.

Capture is also a parent of `/challenge` when `--route=challenge` is set — when invoking `/challenge`, capture sets `$PIPELINE_RUN_DIR` to a standalone run dir (per `_shared/pipeline-run-dir.md` step 3) if not already set, so the child's auto-mode and audit-log behavior resolves correctly.

Parent invocation of `/capture` is signaled by `$PIPELINE_RUN_DIR` being set in the environment (`/build` running inside `/flow`). When invoked from within a parent's workflow, omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (no `PIPELINE_RUN_DIR`), render Next Actions as shown above.

**Side effect of `$PIPELINE_RUN_DIR`-based detection:** if a user invokes `/capture` directly while an active `/flow` pipeline is running, Next Actions are suppressed because the env var is set. This is intentional — pipeline-mid-flow handoff suggestions would conflict with the orchestrator's flow.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Using INBOX for ideas that already have a spec | Duplicates intent across two files — annotate the spec directly instead so the durable record stays the source of truth |
| Writing full specs in INBOX | INBOX is for half-formed ideas; a fully-formed spec belongs in `specs/` where `/build` and `/flow` can act on it |
| Never reviewing INBOX | Without periodic triage via `/claude-tweaks:tidy`, INBOX becomes a graveyard and captured ideas lose context over time |
| Adding implementation details to an INBOX entry | INBOX captures *what* and *why* — *how* is brainstorming + spec territory and changes faster than the idea itself |
| Skipping `/superpowers:brainstorming` and jumping straight to specs | Brainstorming surfaces assumptions and constraints that specs need; without it, specs encode unchallenged premises |
| Putting notes about existing specs in INBOX | Notes drift from the spec they describe — annotate the spec file directly so the note moves with the work |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:challenge` | Debiases INBOX items before `/superpowers:brainstorming` — /claude-tweaks:help flags candidates |
| `/superpowers:brainstorming` | Explores promoted INBOX items — produces design docs |
| `/claude-tweaks:specify` | Converts `/superpowers:brainstorming` output into specs |
| `/claude-tweaks:tidy` | Reviews INBOX for stale items — promotes, merges, or deletes |
| `/claude-tweaks:review` | May create INBOX items for new ideas discovered during review |
| `/claude-tweaks:wrap-up` | May create INBOX items for genuinely new ideas; leftover work goes to DEFERRED.md |
| `/claude-tweaks:build` | Calls /capture during Common Step 4 (design mode) to file blocked items and follow-up ideas before they slip |
| `/claude-tweaks:init` | After bootstrap, /init suggests /capture as the entry point for parking ideas that surface during setup but aren't ready to specify |
| `/claude-tweaks:reflect` | Surfaces tangential ideas at the Wrap-Up Review Console (writes direct to INBOX, not via /capture) |
| `/claude-tweaks:visual-review` | UI ideas surfaced during visual review (creative improvements, follow-ups) land in INBOX via /capture instead of inflating the current spec |
| `specs/DEFERRED.md` | Structured deferral for build/review work — carries origin, files, and triggers that INBOX doesn't |
| `/claude-tweaks:research` | Research findings can be captured as INBOX items; invoke `/research` when an INBOX idea needs evidence before specifying. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
