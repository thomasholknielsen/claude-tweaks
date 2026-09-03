---
record: 355
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 355: init: claude-md-template.md's claude-tweaks Pipeline section could keep Auto-mode and Spec-close-out guidance

Surface: backend

## Current State

`skills/init/claude-md-template.md`'s `## claude-tweaks Pipeline` section (currently four paragraphs: Artifacts, Entry point, `/claude-tweaks:flow` behavior, Superpowers overrides) is the byte-compared, plugin-authored section that `/claude-tweaks:init update`'s Phase 1u.5 drift check enforces verbatim against every project's local CLAUDE.md — confirmed by `tests/bin-lib/init/claude-md-conformance.test.js`, which asserts `claude-tweaks Pipeline` is in the template's plugin-authored section set. Mature projects running the pipeline in default `auto` mode have independently authored two additional paragraphs of pipeline-generic guidance the template doesn't cover: an Auto-mode bookend-architecture explanation (the Pipeline Config Manifesto's role vs. the Wrap-Up Review Console's role, and what `confirm` mode changes) and a Spec close-out convention (`specs/` as a working directory, not a permanent index; promote durable content out; delete the spec file once shipped). Because the template is silent on both, every `/init update` re-sync on such a project flags this section as drifted, forcing a choice between matching the template (discarding the content) or diverging from it (keeping the content but never syncing clean again).

## Deliverables

- Add an Auto-mode paragraph to `skills/init/claude-md-template.md`'s `## claude-tweaks Pipeline` section, describing the bookend architecture: the Pipeline Config Manifesto's behavior in default `auto` vs. what changes under `confirm`, and the Wrap-Up Review Console's role as the consolidating stop.
- Add a Spec close-out paragraph to the same section, describing the `specs/` working-directory convention: not a permanent historical index, durable content promotes to `docs/reference/*.md` or a skill, by-number citations elsewhere repoint to the closing commit/PR, and the spec file is deleted once shipped and verified.
- Verify both paragraphs' claims against the actual current behavior they describe (`skills/_shared/auto-mode-contract.md` and the current `/claude-tweaks:flow`/`/claude-tweaks:wrap-up` Review Console step for the bookend paragraph; this project's own spec-lifecycle convention/history for the close-out paragraph) rather than copying the issue's paraphrased text verbatim — see Gotchas.

## Acceptance Criteria

- `skills/init/claude-md-template.md`'s `## claude-tweaks Pipeline` section includes both new paragraphs, each accurately describing current pipeline behavior rather than the issue reporter's paraphrase (which may have drifted from actual behavior by build time).
- `tests/bin-lib/init/claude-md-conformance.test.js` continues to pass unmodified — the byte-compare mechanism itself doesn't change, only the template content it compares against.
- The added paragraphs are written as pipeline-generic guidance (no project-specific detail), matching the register of the section's four existing paragraphs, so a project that has independently authored equivalent local content can adopt the template's wording without losing meaning.

## Technical Approach

Insert the two new paragraphs into `skills/init/claude-md-template.md`'s `## claude-tweaks Pipeline` section (currently lines 79-87), inside the fenced Initial Mode Template block that `extractTemplateBody` parses (`bin/lib/init/claude-md-conformance.js`). Placement relative to the four existing paragraphs (Artifacts / Entry point / `/claude-tweaks:flow` / Superpowers overrides) is an authoring judgment call at build time — group each new paragraph near the existing paragraph it elaborates on (e.g. the Auto-mode paragraph near the `/claude-tweaks:flow` paragraph) rather than appending both at the end.

## Gotchas

- The issue's suggested paragraph text is the reporter's own paraphrase from a private project's locally-diverged CLAUDE.md, not a citation of this repo's canonical source — re-derive both paragraphs from this repo's own `_shared/auto-mode-contract.md` and the current Review Console step rather than copying the issue body's wording verbatim. The issue's specific claim that the Manifesto is "a read-only FYI that doesn't stop" in default `auto` should be checked against this repo's own CLAUDE.md, which currently describes the Manifesto as one of "at most two stops" — reconcile before wording the new paragraph, don't assume the issue's phrasing is authoritative.
- `## claude-tweaks Pipeline` is byte-compared verbatim by the conformance test and by Update Mode's drift check. This repo's own CLAUDE.md already carries a project-specific "Integration model" paragraph in this section beyond the template baseline — that paragraph is expected to keep diverging from the template after this change; only the two newly-added generic paragraphs are expected to match a project's local copy exactly once it re-syncs.
- Check `skills/init/claude-md-template.md`'s current size (201 lines / 15,404 bytes as of this shaping) against any documented ceiling before adding — no ceiling is currently referenced for this file (unlike the project's own CLAUDE.md's 150-line budget), but confirm at build time rather than assuming headroom is unlimited.

## Original request

init: claude-md-template.md's claude-tweaks Pipeline section could keep Auto-mode and Spec-close-out guidance

**Summary:** claude-md-template.md's `## claude-tweaks Pipeline` section could keep two paragraphs of Auto-mode and Spec-close-out guidance instead of forcing projects to discard them on every template re-sync.

**Type:** Feature request

**Affected component:** `skills/init/claude-md-template.md` — the `## claude-tweaks Pipeline` section

**Use case:**
While running `/claude-tweaks:init update` on a mature project, Phase 1u.5's contract-drift check flagged the `## claude-tweaks Pipeline` section as drifted from the current template. The project's local version had accumulated two paragraphs of genuinely useful, non-project-specific content beyond what the template documents:

1. An **Auto mode** explanation of the bookend architecture: in default `auto`, the Pipeline Config Manifesto (`/flow` Step 1.6) is a read-only FYI that computes and displays policy levers but doesn't stop; the one user-facing stop is the Wrap-Up Review Console at the end (`/wrap-up` Step 9.6). Passing `/flow … confirm` turns the Manifesto back into a real approval gate.
2. A **Spec close-out** convention: `specs/` is a working directory, normally empty between pipeline runs, not a permanent historical index. Once a spec ships and is verified, by-number citations elsewhere in the repo should repoint to the closing commit range or PR link, durable reference material should be promoted to `docs/reference/*.md` or a skill, and the spec file should then be deleted — a permanent `specs/INDEX.md` tracker was explicitly removed as an anti-pattern in this project's own history.

Neither paragraph describes anything specific to the project it was written in — both describe how the claude-tweaks pipeline itself behaves in default auto mode, and a spec-lifecycle convention that seems broadly applicable to any project using this pipeline. When re-syncing the section to match the template exactly, this content had no other home (not in a skill, not in a rule, not in docs/) and had to be discarded.

**Expected vs. actual:**
Expected: the template's own `## claude-tweaks Pipeline` section would already document this behavior, so a re-sync wouldn't force a choice between matching the template and keeping the guidance.
Actual: the template is silent on both points, so any project that has locally documented them faces contract drift on every `/init` re-run, with re-syncing meaning losing the content (or diverging from the template to keep it).

**Environment:**
- Reported from project: a private project

---
Filed via repo-feedback (lab-holknielsen/claude-user-config).

