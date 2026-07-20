# Design Mode — live

Invoked via `/claude-tweaks:design-wrapper live <target>`. Returns `{mode, result: "ok", session: "completed"}` or `{mode, skipped, ...}` to caller. **Interactive-only — has no auto-mode branch.**

## When this runs

Called by `/claude-tweaks:specify` (shape-time throwaway-scaffold exploration) and `/claude-tweaks:visual-review` (standalone Boost gate, "Explore alternatives"). Both callers are already gated to interactive, no-`$PIPELINE_RUN_DIR` contexts before reaching this mode — this mode performs no additional mode-gating of its own.

`<target>` is a URL: either an ephemeral scaffold server (`/specify`'s caller) or the already-running app under review (`/visual-review`'s caller).

## Preconditions

Run the universal preconditions from `../SKILL.md` (Layers 1+3 — Layer 2 does not apply, same as `shape` mode, since a `live` session isn't necessarily tied to one spec — and availability for the Impeccable plugin, extended per Step 2 below).

## Procedure

### Step 1: Run preconditions

On any skip, return the skip object.

### Step 2: Availability check (live-specific)

In addition to the standard `/impeccable:impeccable*` skill-resolution check, live mode depends on scripts under `.claude/skills/impeccable/scripts/` (`live.mjs` et al.) shipping with the installed Impeccable plugin version. If `/impeccable:impeccable*` resolves at all, treat these scripts as present — they ship together as one plugin release; there is no separate installation step to check.

### Step 3: Hand off to live mode

Invoke via the Skill tool: `/impeccable:impeccable live`, passing `<target>` as the page to open (per `live.md`'s own "Navigate to the URL that serves `pageFile`" contract). Follow `live.md`'s own procedure verbatim — boot, poll loop, generate/accept/discard/exit handling. This wrapper does not reimplement any of live mode's mechanics; it only gates whether the mode is reachable at all, matching every other mode's role in this skill.

### Step 4: Return

When the session ends (user says "stop"/"exit live", closes the tab, or the poll returns `exit` and cleanup completes): return `{mode: "live", result: "ok", session: "completed"}`. There is no "declined" return from this mode — the caller's own front-door-confirm gate is what decides whether to invoke this mode at all; once invoked, the mode always runs to a real session.

## Output to caller

```json
{
  "mode": "live",
  "result": "ok",
  "session": "completed"
}
```
