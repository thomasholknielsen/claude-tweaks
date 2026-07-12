# Drop Artifact-Tool Dependency

## Purpose

`/claude-tweaks:visualize` currently offers, as an optional Step 6, to publish a generated diagram via the `Artifact` tool (a claude.ai-hosted publish/share mechanism). This is the plugin's only call site for that tool. Remove it:

- **Portability** — `Artifact` isn't guaranteed available across environments (Agent SDK, headless/cloud Routines, some plans/orgs), the same reasoning that already bars `mcp__claude-in-chrome__*` calls from plugin skills in favor of `agent-browser`.
- **No off-machine publishing** — even opt-in, the plugin should not be capable of shipping project content to a third-party hosted link.
- **Reduce surface area** — the feature is already gated and skip-silent, but it's still a whole sub-file, a Step, and doc mentions that can drift or break with no functional payoff proportional to that cost.

The shareable-link capability is dropped with no replacement. The standalone HTML file `/visualize` already writes to disk (Steps 4-5, unaffected by this change) remains the durable output; opening it locally covers the "show me the diagram" need.

## Scope

**Delete:**
- `skills/visualize/artifact-publish.md` (the whole Artifact-tool adapter)

**Edit (strip Artifact-tool references only — no other behavior changes):**

| File | Change |
|---|---|
| `skills/visualize/SKILL.md` | Remove Step 6 ("Offer to publish via Artifact") entirely; renumber old Step 7 (Registry update) to Step 6. Drop "and optionally publishable via the `Artifact` tool" from the description line. Drop the Anti-Pattern row about auto-invoking Artifact; reword the "drift apart" row to reference only the standalone file and markdown embed. Drop "(and, if accepted, publishing)" from the Next Actions intro. |
| `skills/visualize/d2-enhanced-path.md` | Step 4: "Placement, wrapper generation, and the Artifact offer proceed identically..." → "Placement and wrapper generation proceed identically...". |
| `skills/_shared/visual-html-output.md` | Drop "the `Artifact` publish adapter" from the file's opening description. Remove the "Artifact publish" row from the Step 4 wrapper table (2 rows remain: standalone file, markdown embed). Delete old Step 6 ("Artifact publish (delegate)") entirely; renumber old Step 7 (Persist-vs-ephemeral) to Step 6. Reword the "drift apart" line and the "Just show me now" rationale — currently justified by "the Artifact tool needs a real file on disk" — to instead justify the scratch-file write as producing something the user can open locally. |
| `CLAUDE.md` | Structure table row for `visualize`'s sub-files: drop `artifact-publish.md` from the file list and its description clause. Add a new "Don'ts" guardrail bullet (below). |
| `README.md` | Both mentions (changelog entry, skill catalog entry) drop the "optional `Artifact`-publish channel" clause. |

**Explicitly out of scope** (generic English "artifact" = produced file/output, unrelated to the `Artifact` tool): `skills/help/context-flow.md`, `skills/help/reference-card.md`, `skills/specify/SKILL.md`, `skills/init/claude-md-template.md`, `bin/lib/harness-health/scope.js` (`design-artifact` kind label) and its tests, and the historical `docs/superpowers/plans/2026-07-11-visualize-diagram-generation.md` / `docs/superpowers/specs/2026-07-11-visualize-diagram-generation-design.md` — these are frozen design-history records of when the feature was originally built and are left as-is, the same way git history isn't rewritten.

## New Guardrail

Add to CLAUDE.md's "Don'ts" list:

> Don't call the `Artifact` tool from plugin skills — it requires claude.ai-hosted availability that isn't guaranteed across environments (Agent SDK, headless/cloud Routines, some plans/orgs), and publishing pushes project content to a third-party hosted link even when opt-in. `/claude-tweaks:visualize` writes a self-contained standalone HTML file to disk instead — that's the durable, portable output.

## Versioning and Release

This removes a documented skill capability (a whole Step + sub-file + doc mentions), so it's a minor bump per CLAUDE.md's convention (feature-shaped change, not a fix): `5.27.2` → `5.28.0`.

Full release: bump `.claude-plugin/plugin.json`, commit + push this repo's `main`, then mirror the version (and matching description, if changed) into `thomasholknielsen/claude-tweaks-marketplace`'s `.claude-plugin/marketplace.json` `plugins[].version`, commit + push that repo's `main` too. `metadata.version` in the marketplace repo is its own independent catalog-versioning scheme — not touched by this change unless the catalog itself changes.

## Testing / Verification

This is a documentation/skill-content-only change — no `bin/` code paths touch the `Artifact` tool, so `npm test` is unaffected and is run only as a baseline/regression check, not because this change is expected to alter any test outcome. Verification is manual: grep the touched files afterward for a case-insensitive `` `Artifact` `` (backtick-wrapped, tool-reference form) to confirm zero remaining hits outside the explicitly-out-of-scope list above.
