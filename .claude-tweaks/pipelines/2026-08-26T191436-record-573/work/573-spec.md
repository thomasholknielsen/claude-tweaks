---
record: 573
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 573: design-wrapper: no extension point for project-local design-quality skills beyond Impeccable

Surface: backend

## Current State

`design-wrapper`'s dispatch (pre-build/review/polish/survey modes) hardcodes exactly one design-quality provider — Impeccable. A project that also maintains its own local design-critique skill (e.g. one encoding a named designer's UI/animation philosophy, with its own Before/After review-table contract, similar in shape to Impeccable's critique/audit output) has no way to get it auto-dispatched alongside Impeccable at the same lifecycle points — it has to be invoked manually every time, separately from the pipeline. Today's only two workarounds are inadequate: (a) editing the plugin's own dispatch logic directly isn't viable per-project since the installed plugin is shared, non-durable cache state; (b) ad-hoc CLAUDE.md instructions asking the agent to "also remember to run X" are unenforced — nothing in `design-wrapper`'s own dispatch logic verifies the extra skill actually ran. Related: #592.

**Use case:** a project keeps a project-local skill under `.claude/skills/` — for example, one named `emil-design-eng`, encoding a specific design engineer's philosophy on UI polish, animation decisions, and component craft, with its own Before/After markdown-table review format — and wants it to run automatically at the same points Impeccable runs today: `/review`'s code+visual pass, `/build`'s pre-build/polish phases, `/flow`'s polish step.

## Deliverables

- A project-level extension point naming one or more additional project-local design-quality skills to dispatch alongside Impeccable at specific modes (review/polish/pre-build/survey) — analogous to how Impeccable itself is already wired in via the `design-integration` flag under CLAUDE.md's `## Design integration` section.
- Wiring in `skills/design-wrapper/SKILL.md`'s mode dispatch table and `command-map.md`'s per-command categorization so a declared project-local skill is actually invoked at the declared mode(s), not just documented as configurable.
- Documentation of the new extension point's schema and how it composes with Impeccable (runs alongside, not instead of).

## Acceptance Criteria

- A project can declare a project-local design-quality skill (by name) against one or more of review/polish/pre-build/survey modes, and `design-wrapper` dispatches it at those points without manual invocation.
- Declaring no additional skills preserves today's Impeccable-only behavior exactly — the extension point is additive and opt-in.
- The declared skill's absence (uninstalled, misnamed) is surfaced clearly rather than silently skipped, consistent with this plugin's Anti-Patterns guidance on distinguishing unavailable/failed/empty results.

## Technical Approach

Extend CLAUDE.md's `## Design integration` section schema with a field naming additional project-local design-quality skills per mode (review/polish/pre-build/survey), mirroring the existing `design-integration` flag's wiring for Impeccable. In `skills/design-wrapper/SKILL.md`'s mode dispatch table, read the new field alongside the existing Impeccable dispatch logic and invoke each declared skill at its declared mode(s) via the `Skill` tool, following the same availability-check discipline this plugin's Subagent Contract already establishes for third-party agents (check at the skill level, not just plugin presence; distinguish unavailable/failed/empty/unparseable rather than reporting a clean result). `command-map.md`'s per-command categorization needs a corresponding entry so the new dispatch path is discoverable the same way Impeccable's is today.

### Key Files

- `plugin/skills/design-wrapper/SKILL.md` — mode dispatch table; add the extension-point read + invocation
- `plugin/skills/design-wrapper/command-map.md` — per-command categorization; add an entry for the new dispatch path
- `CLAUDE.md` (this repo's own, and the template `/claude-tweaks:init` generates) — `## Design integration` section schema, new field
- `docs/` — document the new extension point's schema and composition-with-Impeccable behavior

## Gotchas

- The two rejected workarounds (editing the shared plugin cache directly; unenforced CLAUDE.md prose instructions) are explicitly why this needs a real extension point rather than a documentation-only fix — a documentation-only "fix" would just be workaround (b) formalized, which the filer already identified as inadequate.
- "Possible shape" in the original feedback (a project-level manifest field, analogous to the `design-integration` flag) is one option, not a mandate — the Technical Approach above adopts it as the most direct fit with the existing Impeccable wiring, but an implementer should confirm no better mechanism already exists in `design-wrapper`'s dispatch logic before committing to it.
- Related to #592 — check that record before implementing, in case it already covers part of this extension point or constrains its shape.
- Plugin version at filing: 6.84.0 — confirm `design-wrapper`'s current dispatch table still matches what this record's Current State describes before implementing.

## Original request

design-wrapper: no extension point for project-local design-quality skills beyond Impeccable

**Related:** #592

**Summary:** `design-wrapper`'s dispatch (pre-build/review/polish/survey modes) hardcodes exactly one design-quality provider — Impeccable. A project that also maintains its own local design-critique skill (e.g. one encoding a named designer's UI/animation philosophy, with its own Before/After review-table contract, similar in shape to Impeccable's critique/audit output) has no way to get it auto-dispatched alongside Impeccable at the same lifecycle points — it has to be invoked manually every time, separately from the pipeline.

**Kind:** Gap

**Affected component:** `skills/design-wrapper/` (SKILL.md's mode dispatch table, `command-map.md`'s per-command categorization) — currently Impeccable-only, with no extension point for additional design-quality skills.

**Use case:** A project keeps a project-local skill under `.claude/skills/` — for example, one named `emil-design-eng`, encoding a specific design engineer's philosophy on UI polish, animation decisions, and component craft, with its own Before/After markdown-table review format. The user wants that skill to run automatically at the same points Impeccable runs today — `/review`'s code+visual pass, `/build`'s pre-build/polish phases, `/flow`'s polish step — instead of remembering to invoke it manually after every design-relevant change. Today the only two workarounds are: (a) editing the plugin's own dispatch logic directly, which isn't viable per-project since the installed plugin is shared, non-durable cache state; or (b) ad-hoc CLAUDE.md instructions asking the agent to "also remember to run X," which nothing in `design-wrapper`'s own dispatch logic enforces or verifies.

Possible shape: a project-level manifest (e.g. a field under CLAUDE.md's existing `## Design integration` section, or a small config file) naming one or more additional project-local skills to dispatch alongside Impeccable at specific modes (review/polish/pre-build/survey), analogous to how Impeccable itself is already wired in via the `design-integration` flag.

**Plugin version:** 6.84.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-designwrapper-ext -->

