---
record: 550
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 550: Add a consumer-grep clause to spec-template's Key Files guidance for surface renames

Surface: backend

## Current State

`skills/specify/spec-template.md`'s `### Key Files` guidance (the `Technical Approach` subsection, currently four lines: a two-item placeholder list with no authoring rule attached) tells a spec author only to list "what changes or new file purpose" per path — it has no rule for the case where the work **renames** a contract surface (report sections, headings, check names, exported symbols). A spec author composing Key Files from "what will this work write?" omits any file that only *reads* the old name, because that file never appears in the diff the author is imagining.

IL-132 (`docs/incident-log.md`) records the resulting guardrail Don't: spec #518 (tidy report redesign) renamed `/claude-tweaks:tidy`'s report sections. Its Key Files listed `skills/tidy/SKILL.md`, `step-6-auto.md`, `step-6-interactive.md` — the files the work would author — but omitted `skills/tidy/scan-procedures.md`, whose Collection routing table binds each scan tag to a report section *by that section's literal name*. Nothing upstream named that file, the implementer never opened it, and the rename shipped with the routing table still pointing at the old section names — caught only as a Critical finding in the branch's whole-branch review, fixed in-wave (`97363bca`, `6d8cf6ac`) before it reached `main`. The cost was a review cycle plus two follow-up commits on a spec that had already passed its own task-scoped review.

This record is the mechanism fix IL-132 calls for: the binding must land in the artifact the implementer actually receives (the spec's Key Files list), not in a post-hoc verification pass that can only find the miss after it has become a finding.

## Deliverables

- [ ] Add a clause to `skills/specify/spec-template.md`'s `### Key Files` guidance (in the `## Technical Approach` section of the record-body template, immediately following the existing two-item placeholder list) stating: when the work **renames** a contract surface (report section headings, check names, exported symbols, or other names other files reference by literal text), the spec author must grep the repo for the surface's exact old literal text and list every consumer file the grep finds in Key Files — not only the files the work itself will author.
- [ ] Include a short worked example in the new clause naming the IL-132 pattern concretely (a renamed report-section heading and the routing-table file that binds a tag to it by name), so a future spec author recognizes the shape of the gap without having to read the incident log entry itself.

## Acceptance Criteria

1. `skills/specify/spec-template.md`'s `### Key Files` guidance contains an explicit instruction to grep the repo for a renamed surface's old literal text and list every consumer file found, phrased as a rule the spec author must follow — not left implicit in surrounding prose.
2. The new clause is scoped to renames specifically (report sections, headings, check names, exported symbols) — it does not turn into a blanket "grep everything" instruction that would apply to every spec regardless of whether anything is being renamed.
3. The new clause does not introduce any of the placeholder tokens already forbidden by the `## No Placeholders` section of this same file.
4. `grep -n "Key Files" skills/specify/spec-template.md` still resolves to the same `### Key Files` heading — the addition extends the existing section rather than relocating or renaming it.

## Technical Approach

Edit `skills/specify/spec-template.md` only. The template's `### Key Files` subsection currently reads:

```
### Key Files

- `{path}` — {what changes or new file purpose}
- `{path}` — {what changes}
```

Insert new guidance prose directly below the two-item placeholder list (inside the same `### Key Files` subsection, still within the fenced record-body template block that starts at this file's line 13), in the same instructional voice the rest of the template uses for its bracketed placeholder guidance (e.g. the `## Non-Goals`, `## Current State` sections' bracketed instruction text) — not a new top-level section, and not a rule enforced by tooling. This is authoring guidance for the human/agent composing a spec, read at spec-authoring time; it does not add a new structural or mechanical check (unlike, say, the `## No Placeholders` section's grep-checkable prohibitions).

### Key Files

- `skills/specify/spec-template.md` — add the consumer-grep clause to the `### Key Files` guidance inside the record-body template, with a short IL-132-shaped worked example

## Gotchas

- This is authoring guidance only — it does not add a new mechanical/structural check to `_shared/work-record.md`'s spec-shaped-body verification, and no other file's check logic needs to change. Do not add a grep-based structural check as part of this record; that would be a different, larger change than what IL-132 asks for (a guidance clause an author reads, not a gate a machine enforces).
- The clause must stay scoped to *renames* of contract surfaces. A spec that adds a brand-new file, or edits a file's internals without changing any name other files reference, doesn't trigger this guidance — over-scoping it into "always grep the whole repo" would make every future spec's Key Files list bloat with irrelevant files and dilute the guidance's usefulness for the actual rename case.
- IL-132's own text (`docs/incident-log.md`) is the authoritative source for the worked example's specifics — quote or closely paraphrase spec #518's actual gap (the `scan-procedures.md` routing table bound to tidy's report section names) rather than inventing a different illustrative example, since the real incident is more concrete and won't need future correction.

## Original request

Add a consumer-grep clause to spec-template's Key Files guidance for surface renames

Origin: wrap-up batch curation (run 2026-08-16T010137-spec-517-518-519; the durable-fix half of IL-132)

IL-132 (docs/incident-log.md) records the guardrail Don't; this record is the mechanism: `skills/specify/spec-template.md`'s Key Files guidance should require that when a work unit RENAMES a contract surface (report sections, headings, check names, exported symbols), the spec author greps the repo for the surface's literal old text and lists every consumer file in Key Files — so the binding lands in the artifact the implementer actually receives, not in a post-hoc verification pass.

Evidence: spec #518 renamed tidy's report sections and its Key Files omitted `skills/tidy/scan-procedures.md` (the Collection routing table that binds scan tags to those section names) — shipped as a Critical whole-branch-review finding, fixed in-wave.

Key file: `skills/specify/spec-template.md` (Key Files guidance). Refs #518.


