---
record: 572
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 572: tidy Next Actions says Apply-all-staged while the report section it executes is named Approve

Surface: backend

## Current State

The tidy report's staged-items section is named **Approve ({N})**, but the `AskUserQuestion` option that executes exactly that section is labeled differently on both surfaces, so the operator cannot tie the option to the report (observed on the 2026-08-16 run):

- `skills/tidy/SKILL.md` Next Actions (auto surface): derives an option labeled `"Apply all staged ({N})"` with description "Execute Step 7 over the {N} staged items in Approve" — the section name appears only in the description, and the label vocabulary ("staged") matches nothing the report renders as a section heading.
- `skills/tidy/step-6-auto.md`, the "How **Approve ({N})** resolves" paragraph: cross-references the option by its "Apply all staged ({N})" name.
- `skills/tidy/step-6-interactive.md`: Option 1 is labeled `"Apply all (Recommended)"`, and the surrounding prose (the dry-run note near the top, the section-semantics paragraph, and the "Only items in **Approve ({N})** are executed" note) refers to it as "Apply all".

The section name **Approve ({N})** is the anchor — it appears in the report template, the bucket-mapping table, the Report rules, and both surfaces' hard gates. The option names are the strays.

## Deliverables

- [ ] Rename the derived option in `skills/tidy/SKILL.md`'s Next Actions so its label carries the report's section name — e.g. `"Approve ({N})"` or `"Apply Approve ({N})"` — with a description that still states it executes Step 7 over the report's **Approve ({N})** section. Update the same paragraph's derivation prose and the option-count/cap wording that currently says "Apply-all-staged".
- [ ] Update `skills/tidy/step-6-auto.md`'s "How **Approve ({N})** resolves" paragraph to cite the renamed option.
- [ ] Align `skills/tidy/step-6-interactive.md`'s Option 1 label and every "Apply all" prose mention (dry-run note, section-semantics paragraph, execution note) to the same Approve-anchored name.
- [ ] Update any conformance tests pinning the old option wording; `npm test` passes.

## Acceptance Criteria

- [ ] On both surfaces, the option that executes the staged items carries "Approve ({N})" (the report section's name) in its label, and its description names the section.
- [ ] `grep -rn "Apply all staged" skills/` returns nothing; `step-6-interactive.md`'s remaining "Apply all" references are renamed consistently with its Option 1 label.
- [ ] The report section heading **Approve ({N})** itself is unchanged everywhere (template, bucket mapping, Report rules, hard gates).
- [ ] `npm test` passes, including any updated conformance tests.

## Technical Approach

Vocabulary-only markdown edit across three files under `skills/tidy/`. Rename the options toward the section name, never the section toward the options — the section name is load-bearing in the bucket-mapping table, Report rules, and hard-gate prose on both surfaces. Pick one option name and use it verbatim in every cross-reference.

## Gotchas

- Record #570 is in flight (PR #578) and edits `step-6-auto.md`; record #569 (report own-line command rule) touches the same report-template sections. Coordinate ordering or expect small rebases.
- Conformance tests pin skill prose repo-wide — run the full suite before merging, and check `wc -c` on `skills/tidy/SKILL.md` if it is near the size ceiling before adding wording.
- `AskUserQuestion` labels render best short (1–5 words) — keep the renamed label within that while still carrying "Approve ({N})".

## Original request

tidy Next Actions says Apply-all-staged while the report section it executes is named Approve

**Related:** #506

Context: 2026-08-16 run — the operator could not tie the AskUserQuestion option 'Apply all staged (N)' to the report; it executes exactly the Approve (N) section's items but names them differently.

Scope: align tidy SKILL.md's Next Actions label/description with the report template's section vocabulary on both surfaces (auto + interactive).
