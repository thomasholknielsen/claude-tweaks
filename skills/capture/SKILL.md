---
name: claude-tweaks:capture
description: Use when capturing ideas that need specification later — brain dumps, half-formed features, things to not forget
---
> **Interaction style:** Present choices as numbered options (1, 2, 3…) so the user can reply with just a number. Do the same when suggesting the next skill to run.


# Capture

Quick capture for ideas that aren't ready for full specification. Part of the workflow lifecycle:

```
[ /claude-tweaks:capture ] → /claude-tweaks:challenge → brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
  ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- User mentions something that should be a feature but isn't specified
- Discovery during implementation reveals something that needs its own spec
- "We should probably..." or "Don't forget to..." moments
- Anything that would otherwise be lost or forgotten

> **INBOX vs DEFERRED:** Use `/claude-tweaks:capture` for new ideas and half-formed features. Work deferred from an active build/review goes to `specs/DEFERRED.md` instead — it carries origin context, file references, and timing triggers that INBOX entries don't have.

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

If it takes more than 5 lines to describe, it's past the inbox stage — run `brainstorming` on it instead.

## Adding an Entry

1. Open `specs/INBOX.md`
2. Append new entry at the bottom
3. Don't overthink — capture the essence, move on

**Good entries:**

- "Voice command to add item to shopping list" — context explains the need
- "Recipe nutrition facts display" — scope hints at UI + data needs

**Bad entries:**

- Just "nutrition" — too vague to act on later
- Full spec with 20 tasks — that's a spec, not an inbox item
- Notes about an existing spec ("spec 50 needs review") — put that on the spec itself

## Review Workflow

Periodically (or when inbox gets long), use `/claude-tweaks:tidy` or manually review:

Present numbered options for each item:

```
INBOX: "{item title}"
1. Promote — Run brainstorming, then /claude-tweaks:specify
2. Merge into spec {N} — Add to existing spec's scope
3. Delete — No longer relevant
4. Keep — Not ready yet
```

## Anti-Patterns

- Using inbox for stuff that already has a spec (add to that spec instead)
- Writing full specs in the inbox (just create the spec directly)
- Never reviewing the inbox (becomes a graveyard — use `/claude-tweaks:tidy` periodically)
- Adding implementation details (inbox = what, not how)
- Skipping brainstorming and going straight to specs (brainstorming catches assumptions)
- Putting notes about existing specs in INBOX (annotate the spec file instead)

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:challenge` | Debiases INBOX items before brainstorming — /claude-tweaks:help flags candidates |
| `brainstorming` (Superpowers) | Explores promoted INBOX items — produces design docs |
| `/claude-tweaks:specify` | Converts brainstorming output into specs |
| `/claude-tweaks:tidy` | Reviews INBOX for stale items — promotes, merges, or deletes |
| `/claude-tweaks:review` | May create INBOX items for new ideas discovered during review |
| `/claude-tweaks:wrap-up` | May create INBOX items for genuinely new ideas; leftover work goes to DEFERRED.md |
| `specs/DEFERRED.md` | Structured deferral for build/review work — carries origin, files, and triggers that INBOX doesn't |
