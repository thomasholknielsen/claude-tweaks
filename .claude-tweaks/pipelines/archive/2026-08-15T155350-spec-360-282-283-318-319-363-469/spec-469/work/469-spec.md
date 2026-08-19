---
record: 469
origin: human
risk: low
size: medium
ceremony: fast-lane
grants: []
fingerprint: feedback-f0553920
surface: backend
---
# 469: claude-tweaks:init: Optional Enhancements batch table hides available alternatives per row

Surface: backend

## Current State

The canonical "Multi-item decisions" batch-table convention (`docs/skill-authoring.md`, Interaction patterns section, the "Multi-item decisions" bullet) instructs skills to render a markdown table with "pre-filled recommendations" — this is the single canonical definition, cited rather than restated by every skill that uses the pattern (`CLAUDE.md`'s "every relationship stated once" rule). The convention as currently worded says nothing about surfacing the alternative(s) a recommendation was chosen over.

`/claude-tweaks:init`'s Optional Enhancement steps (`skills/init/SKILL.md` Steps 9-20, detailed procedures under `skills/init/bootstrap/step-*.md`) render recommendation-style prompts and tables following this convention — the report names Step 17 (Work-Record Backend, `skills/init/bootstrap/step-17-work-record-backend.md`) as the concrete example: a reader who doesn't already know the skill's internal option set has no way to discover, from a row showing only the recommended value, that a real alternative (e.g. `local-files` vs. `github-issues`) existed at all.

## Deliverables

- Update the canonical Multi-item-decisions convention in `docs/skill-authoring.md` so a table row for a decision with more than one meaningful value surfaces both the recommended value and its alternative(s), not the recommendation alone.
- Audit existing recommendation-style tables that follow this convention — starting with `/claude-tweaks:init`'s Optional Enhancement steps and any other per-step table across the plugin using the same "batch table with recommendations pre-filled" convention for a decision with real alternatives — and apply the corrected row format wherever a genuine hidden-alternative case is confirmed.
- Leave alone any table whose rows aren't a recommendation-vs-alternative choice in the first place (e.g. a candidate-selection list where every row is independently selectable, not a single decision with a winner and a runner-up) — verify per instance rather than blanket-reformatting every table that merely cites the convention.

## Acceptance Criteria

- `docs/skill-authoring.md`'s Multi-item decisions convention explicitly documents that a row for a decision with more than one meaningful value must show both the recommended value and the alternative(s). A row format is documented (the report's example — `"Work-record backend: **github-issues** (Recommended) — alt: local-files"` — is one acceptable format, not a mandated verbatim string).
- Every audited multi-item recommendation table in `/claude-tweaks:init` that genuinely presents a recommendation-vs-alternative decision renders the alternative alongside the recommendation, after implementation confirms which rendering path(s) actually exhibit the reported behavior (see Gotchas).
- Tables confirmed to have no meaningful alternative per row (e.g. a routine-candidate selection list) are left unchanged, with the reasoning noted at the point of decision so a future editor doesn't "fix" them again.
- No regression to the separate "Single decisions → one `AskUserQuestion` call" convention (`docs/skill-authoring.md`'s adjacent bullet) — that pattern already surfaces every option natively via the tool's own option list and is out of scope here.

## Technical Approach

- Primary edit point: `docs/skill-authoring.md`'s Interaction patterns section, the "Multi-item decisions" bullet — the single canonical definition every skill's batch-table convention cites. Do not restate the corrected format independently inside individual skill files; they should keep citing the shared convention.
- Known candidate instance to re-examine: `skills/init/bootstrap/step-17-work-record-backend.md` (Work-Record Backend, the row named in the report). As currently written, its "gate fails" path (no GitHub remote) already renders the choice as two distinct `AskUserQuestion` options with their own labels/descriptions rather than a markdown table row, and its "gate succeeds" path (GitHub remote already configured — the report's actual repro condition) skips the prompt entirely and writes `github-issues` silently, with no table or option rendered at all. Confirm during implementation which rendering path (if any) actually reproduces the reported hidden-alternative behavior before changing it — the report was filed against plugin v6.81.0 and the repo is now at v6.82.0, so behavior may have shifted since filing.
- Also check other skills across the plugin that render a "batch table with recommendations pre-filled" for a decision with real alternatives per the `docs/skill-authoring.md` convention, not only `/claude-tweaks:init` — the fix targets the shared convention, so its effect should be plugin-wide once applied at the source.

## Gotchas

- The report's literal repro (Step 17, GitHub remote already configured) does not reproduce against the current `skills/init/bootstrap/step-17-work-record-backend.md` — that path renders no prompt/table at all today. Treat the report as evidence the *convention* needs fixing, not as a guarantee that its named example still reproduces verbatim; re-verify against live skill content before editing.
- The report also cites Step 15's routine candidate table (`skills/init/bootstrap/step-15-routine-installation.md`) as another instance of the same convention. That table's rows are independently selectable routine candidates (name, default schedule, notes) via a multiSelect prompt — not a recommendation with a hidden alternative — so it likely needs no change; confirm rather than assume it's in scope.
- `skills/init/bootstrap-steps.md` documents Steps 9-19(20) as append-only/order-agnostic except two historical renumbering exceptions — don't assume a step number named in an older report still maps to the same content; re-derive the current step/file for any cited example before editing it.

## Original request

claude-tweaks:init: Optional Enhancements batch table hides available alternatives per row

**Summary:** /claude-tweaks:init's Optional Enhancements batch table (and other per-step recommendation tables sharing the same convention, e.g. Step 15's routine candidate table) shows only the recommended value per row, not the other options available for that decision.

**Kind:** Defect

**Affected component:** claude-tweaks:init skill — the "Multi-item -> batch table with recommendations pre-filled" interaction-style convention used across Steps 9-20's Optional Enhancements, and any other per-step table following the same pattern.

**Repro steps:**
1. Run /claude-tweaks:init on a project with a GitHub-flavored remote already configured.
2. Reach the Optional Enhancements batch presentation (Steps 9-20).
3. Observe the rendered table: each row shows one recommended value only (e.g. the Step 17 Work-Record Backend row shows "local-files" as the recommendation, with no indication that "github-issues" is also a valid, available choice).

**Expected vs. actual:**
Expected: a row for a decision with more than one meaningful value (e.g. Work-Record Backend: github-issues vs local-files) should surface both options — e.g. "Work-record backend: **github-issues** (Recommended) — alt: local-files" — so the reader can see what's available without already knowing the skill's internal option set from memory.
Actual: only the chosen recommendation is shown per row; the alternative is invisible until the user asks or already knows it exists. In a live run, the user only discovered github-issues was an option (arguably the stronger choice once a GitHub remote already exists) because they happened to already know the skill offered it.

**Plugin version:** 6.81.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-f0553920 -->

