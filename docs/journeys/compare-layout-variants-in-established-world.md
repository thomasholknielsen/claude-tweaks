---
files:
  - plugin/skills/design-wrapper/modes/explore.md
  - plugin/skills/design-wrapper/SKILL.md
---

# Compare Layout Variants of a New Surface in an Established World

**Persona:** Developer adding a new feature page to an app whose visual identity is already locked in `DESIGN.md` — they want to compare rendered composition variants (what's on the page, how it's arranged, where the primary action sits) before building for real, with the identity held fixed.
**Goal:** Pick a composition from dealt staging variants, all dressed in the established `DESIGN.md` tokens, and carry the winner forward as a `Visual-reference:` for the build.
**Entry point:** `/claude-tweaks:design-wrapper explore <surface-topic> --scope layout` standalone (scope also auto-resolves to layout when `DESIGN.md` exists), or `/claude-tweaks:specify`'s Step 2.5b-ii pre-check offering it ahead of `live` once an identity is locked.
**Success state:** The winning markup kept on disk, its path returned as `visual_reference` for the caller to persist; `DESIGN.md` untouched throughout; losing markups deleted.

## Steps

### 1. Name the surface — terminal
- **URL:** `/claude-tweaks:design-wrapper explore "team activity digest — must show recent events, per-member filters; primary action: jump to an event"`
- **Action:** Supply the surface topic (free text + content requirements). Standalone with no argument, the mode asks once before dealing.
- **Should feel:** One question, then dealing — the committed direction's seed key resolves silently (record `Design-seed:` line, else a built artifact's direction-contract FORM block) or degrades to a seedless deal with the offer saying so.
- **Should understand:** The seed key is never in `DESIGN.md` — its homes are the record line and the artifact contract; a missing or ambiguous key degrades the deal, never blocks it.
- **Red flags:** The mode globbing for candidate artifacts on its own; a hard failure on a missing seed key.

### 2. Compare compositions — browser
- **URL:** The ephemeral server URL (switcher cycling whole markup documents, e.g. iframe `src` swaps)
- **Action:** Cycle variants — each is a different markup composing the same surface, all in the locked identity's tokens.
- **Should feel:** A comparison of arrangements, not identities — nothing restyles; palette, type, and component character are identical across variants.
- **Should understand:** Variants differ in framing only (modal vs inline form for the same save action is fine); behavior variation (autosave vs explicit save) is spec territory and never appears here.
- **Red flags:** A variant introducing a new palette/type voice/motif; variants that differ in actual behavior.

### 3. Pick and carry forward — browser + terminal
- **URL:** The same reused verdict question: pick / reroll / steer / canon standing exit (listed last).
- **Action:** Pick a winner — the mode returns its path as `visual_reference`; the caller writes the `Visual-reference:` body-metadata line. Or exit without picking — the explore dir is deleted and the mode returns a skip.
- **Should feel:** `DESIGN.md` is never at risk — this scope reads it and never writes it; approval refines the task concept, not the identity.
- **Should understand:** A layout `ok` only exists on a pick and always carries the winner's path; declining is a skip, not an ok variant. The winning markup must survive — `/claude-tweaks:build`'s design pre-build reads that path later.
- **Red flags:** Any write to `DESIGN.md`; the winning markup deleted along with the losers.
