---
name: capture
description: Use when capturing ideas that need specification later - brain dumps, half-formed features, things to not forget
---

# Capture

Quick capture for ideas that aren't ready for full specification. Part of the workflow lifecycle:

```
/capture → /challenge → brainstorming → /specify → /build → /review → /wrap-up
```

## When to Use

- User mentions something that should be a feature but isn't specified
- Discovery during implementation reveals something that needs its own spec
- "We should probably..." or "Don't forget to..." moments
- Anything that would otherwise be lost or forgotten

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

Periodically (or when inbox gets long), use `/tidy` or manually review:

1. **Promote** — Ready for brainstorming? Run `brainstorming` on this topic, then `/specify` to create work units
2. **Merge** — Fits into existing spec? Add to that spec's scope, delete from inbox
3. **Delete** — No longer relevant or duplicate? Just delete
4. **Keep** — Not ready yet? Leave it

## Anti-Patterns

- Using inbox for stuff that already has a spec (add to that spec instead)
- Writing full specs in the inbox (just create the spec directly)
- Never reviewing the inbox (becomes a graveyard — use `/tidy` periodically)
- Adding implementation details (inbox = what, not how)
- Skipping brainstorming and going straight to specs (brainstorming catches assumptions)
- Putting notes about existing specs in INBOX (annotate the spec file instead)
