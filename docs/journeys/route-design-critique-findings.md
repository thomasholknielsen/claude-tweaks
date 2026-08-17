---
files:
  - plugin/skills/design-wrapper/critics.md
  - plugin/skills/design-wrapper/modes/review.md
  - plugin/skills/design-wrapper/modes/polish.md
  - plugin/skills/review/review-summary-template.md
  - plugin/skills/flow/polish-execution.md
---

# Route Design-Critique Findings to Their Consumers

**Persona:** claude-tweaks user running `/claude-tweaks:flow #N` (or a standalone `/claude-tweaks:review N`) on a web-frontend record in a project with the Emil critic skills installed, who wants review-time craft critique to actually reach the places that can act on it.
**Goal:** See a critic's `code` findings show up as context inside polish's refinement pass automatically, and see its `decisions` findings (pushback against `DESIGN.md`) reach a human with a runnable remedy — without the pipeline ever editing `DESIGN.md` itself.
**Entry point:** `/claude-tweaks:review` reaches design-wrapper `review` mode Step 3.8 on a web-track diff with the `design-critique` lever at `auto` (default) or `full`.
**Success state:** In a pipeline run, polish's `decision_summary` carries a `craft-context: {N} critic findings inlined` clause and every `decisions` finding sits in `{run-dir}/staged/design-decision-*.md` awaiting the Review Console; in a standalone review, the `decisions` findings render under the summary's **Decisions** sub-heading with their `Remedy:` commands. `DESIGN.md` is byte-identical throughout.

## Steps

### 1. Watch the critic dispatch in the review output — terminal
- **URL:** none — `/claude-tweaks:review {N} full` (or the `/flow` review phase) logs Step 3.8's lever resolution to `decisions.md` and returns `craft_critics` in the wrapper output.
- **Action:** Confirm the roster selection matched expectations: `critics.md`'s worked-example table says which critics fire for your lever × decisions-present × motion combination (e.g. `auto` + `DESIGN.md` present + no motion → `emil-design-eng` only).
- **Should feel:** Deterministic — the same three signals always select the same rows; no critic appears that the roster doesn't list.
- **Should understand:** `craft_critics` is the evidence ledger, not the findings: an entry with `ran: false, missed` or `parsed: false, reason` means absence of evidence, never a clean bill. A clean critic reply is `parsed: true` with the literal "No findings.".
- **Red flags:** A critic dispatched on a non-web, non-terminal track (the roster has no native critic yet); findings from a critic whose `craft_critics` entry says `parsed: false` (unparseable replies are never mined for findings).

### 2. Confirm `code` findings became polish context — `decisions.md` + polish output
- **URL:** `{run-dir}/decisions.md` and the polish phase's logged `decision_summary` (pipeline runs only).
- **Action:** After polish runs, check the `AUTO … Polish phase: …` line — when review cached craft-critic `code` findings whose files overlap the refinement dispatch, the sentence ends `; craft-context: {N} critic findings inlined`.
- **Should feel:** Automatic — critique → polish → re-verify closed the loop with no prompt; the existing re-verify gate and one-cycle cap contain polish exactly as before.
- **Should understand:** The findings ride as a "Known craft issues" *context* block beside the design-craft principles in each refinement dispatch — they never select an Impeccable command, are never staged, and never appear in `commands_invoked`. The audit cache's `suggestion` field remains the only command-selection key.
- **Red flags:** A `craft-{provider}-{n}` cache entry appearing as a `kind: "unclassified"` staged suggestion (polish's Step 5 loop is scoped to `source: "audit"`); a polish command whose trigger cites a critic finding.

### 3. Act on a `decisions` finding — Review Console (pipeline) or the summary's Decisions sub-heading (standalone)
- **URL:** pipeline: `{run-dir}/staged/design-decision-{n}.md` (or `design-decision-nudge.md` for the wrapper's absence-nudge), surfaced at the Wrap-Up/consolidated Review Console; standalone: the review summary's `#### Decisions` table.
- **Action:** Read the finding (`Provider:`, `File:`, `Severity:`, `Message:`, `Evidence:`) and run its `Remedy:` line yourself if you agree — `/impeccable:impeccable document` for a critic's pushback, `/claude-tweaks:design-wrapper explore` for the no-`DESIGN.md` nudge — or decline it.
- **Should feel:** Like being challenged, not overridden — build honored the decisions, review challenged them, and the edit to `DESIGN.md` is yours to make or refuse.
- **Should understand:** The remedy is provider-keyed and mechanical, never inferred from the finding's prose; a standalone review's decisions findings are deliberately non-persistent (rendered once, nothing staged, no backlog record auto-filed).
- **Red flags:** `DESIGN.md` or `.impeccable/design.json` modified by the pipeline itself; duplicate `design-decision-*.md` files for the same provider+file+message after a re-review (content dedupe overwrites in place); a `decisions` finding rendered in the main Design Quality table (it belongs under the sub-heading only).
