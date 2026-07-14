# Design Pre-Build — lazy-loading Impeccable references and project design context

Common Step 1.7 of `/claude-tweaks:build`. Loaded only when the build is in record or spec mode with a frontend surface and the plan is non-trivial.

## Purpose

Before dispatching implementation, invoke the design wrapper to lazy-load Impeccable's reference files plus any project-specific design context (root `PRODUCT.md` from `/impeccable:impeccable init`, root `DESIGN.md` from `/impeccable:impeccable document`). The wrapper handles its own detection (non-frontend specs skip cleanly) and availability checks (no Impeccable installed → skip cleanly).

**Surface source:** `surface` (the gate condition SKILL.md's Common Step 1.7 checks before invoking this file's procedure) comes from the materialized header's `surface:` field in record mode — lifted from the record body's `Surface:` metadata line per `skills/flow/materialize.md`'s Surface/Design-intent lift rule — or the legacy spec file's own `surface:` frontmatter under the spec-file alias. `design-intent` lifts from the same header/body source but is consumed downstream by `/claude-tweaks:design polish`, not by this pre-build gate.

## Skip this step entirely when

- The build is in design mode with no spec or materialized record to inspect (the wrapper needs that context for surface detection — pure design-mode builds proceed without pre-load)
- The plan is trivial (< 3 file references, no UI files in the plan)

## Invocation

Invoke `/claude-tweaks:design pre-build <spec>`. Pass the record/spec number — the wrapper resolves it to the materialized header (record mode) or the legacy spec file (spec-file alias) the same way Common Step 1.7's own surface check does — or the design doc path as a fallback.

## Result handling

| Wrapper return | Build behavior |
|----------------|----------------|
| `{result: "ok", loaded: [...], context_size: <n>}` | Inject the loaded reference paths and contents into the implementer subagent's prompt as additional context. When `context_size` exceeds the implementer's budget (rough threshold: 8000 tokens), summarize the references rather than passing them whole. |
| `{skipped: ...}` | Note the skip in the build log and proceed without lazy-loaded design references. |
| `{deferred: ...}` (should not happen for `pre-build`) | Treat as skip and proceed. |

See `_shared/design-wrapper-handling.md` for the canonical return-shape contract and the "why skips don't fail" rationale.

## Where the loaded references go

- **Subagent execution strategy** — the loaded reference text is appended to the implementer subagent's system prompt for each task that touches a UI file (paths matched against the spec's Key Files entries with frontend extensions/path patterns).
- **Batched execution strategy** — the loaded references are summarized and surfaced in the batch handoff message so the human reviewer sees what design context is in play.
