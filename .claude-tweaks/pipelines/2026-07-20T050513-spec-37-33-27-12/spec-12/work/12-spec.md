---
record: 12
origin: capture
risk: low
effort: medium
grants: []
surface: backend
---
# 12: [task] Split README.md (304 lines) — over the doc-registry 200-line threshold

Surface: backend

## Current State

`README.md` is 430 lines (grown from the 304 lines that originally triggered `/init` Phase 8.5's 200-line doc-registry threshold flag). Breakdown by section:

| Section | Lines | Note |
|---|---|---|
| `## What this does` (incl. `### What's new in vX.Y.Z` changelog entries) | 122 | Only the first 3 lines (before the first `### What's new` subsection) are actual "what this does" prose. The remaining ~117 lines are 13 version-changelog blocks (`v4.7` through `v6.10.0`). |
| `## Skills` (`### Plan phase`, `### Pipeline`, `### Component skills`, `### Utility skills`) | 129 | The full skill reference table |
| `## Installation` | 9 |
| `## How it works` | 63 |
| `## Work Records` | 25 |
| `## Common workflows` | 35 |
| `## Dependencies` | 9 |
| `## Migrating from 5.x` | 4 |
| `## Configuration` | 21 |
| `## Local development` | 6 |
| `## License` | 3 |

`CHANGELOG.md` (118 lines, top-level) already exists as this repo's canonical changelog — but it has diverged from README's `### What's new` blocks rather than being a superset of them. `CHANGELOG.md`'s versions: `v6.7.0, v6.6.0, v4.15.0, v4.14.0, v4.13.0, v4.7.1, v4.6, v4.5, v4.2, v4.1, v4.0`. README's `### What's new` versions: `v6.10.0, v6.9.0, v6.7.0, v6.5.0, v6.4.0, v6.3.0, v6.0.0, v5.27.0, v5.18.0, v5.15.0, v5.1.0, v5.0.0, v4.7`. Only `v6.7.0` appears in both — the two lists are two separate, incomplete partial histories, not simple duplicates of each other. `docs/` currently has no `REGISTRY.md` (no doc registry exists yet in this project despite `/init` having flagged the threshold) — `docs/decisions/`, `docs/diagrams/`, `docs/plans/`, and `docs/superpowers/` already exist as subdirectories.

No `docs/getting-started.md` or similar top-level guide currently exists.

## Deliverables

- [ ] Reconcile `CHANGELOG.md` and README's `### What's new` blocks into one canonical, complete changelog in `CHANGELOG.md`: merge all 13 README version blocks into `CHANGELOG.md`'s existing 11 entries, deduplicating `v6.7.0` (keep the more complete of the two descriptions — compare both before picking), and sort the merged list newest-first.
- [ ] Delete all 13 `### What's new in vX.Y.Z` subsections from README's `## What this does` section, leaving only the existing 3-line intro paragraph, followed by one line linking to `CHANGELOG.md` (e.g. `See [CHANGELOG.md](CHANGELOG.md) for release history.`).
- [ ] Move the `## Skills` section's full reference content (`### Plan phase`, `### Pipeline`, `### Component skills`, `### Utility skills` — 129 lines) to a new `docs/getting-started.md`, per the Tier 3 doc taxonomy `/init`'s Phase 8.5 flagged this against. Replace the `## Skills` section in README with a short summary paragraph plus a link to `docs/getting-started.md`.
- [ ] Verify README.md's resulting line count is under the 200-line doc-registry threshold.

## Acceptance Criteria

1. `CHANGELOG.md` contains all 23 unique version entries (13 from README + 11 from CHANGELOG.md, minus 1 duplicate `v6.7.0`), sorted newest-first, with no version appearing twice.
2. `grep -c "^### What's new" README.md` returns `0`.
3. `README.md`'s `## What this does` section is 5 lines or fewer (3-line intro + blank line + CHANGELOG.md link).
4. `docs/getting-started.md` exists and contains the full skill reference content (all four subsections: Plan phase, Pipeline, Component skills, Utility skills) that was previously under README's `## Skills` section.
5. README's `## Skills` section is replaced by a short summary (2-4 sentences) plus a link to `docs/getting-started.md`.
6. `wc -l README.md` reports fewer than 200 lines.
7. No content is lost — every version's changelog description and every skill's reference-table row from the original README still exists somewhere (`CHANGELOG.md` or `docs/getting-started.md`), just relocated.

## Technical Approach

Three independent content-relocation deliverables, no shared logic, no functional code touched. Order doesn't matter between deliverables 1-2 (changelog reconciliation) and deliverable 3 (Skills move), but deliverable 1 must complete before deliverable 2 (can't safely delete README's `### What's new` blocks until their content is confirmed present in `CHANGELOG.md`).

### Key Files

- `README.md` — remove `### What's new` subsections (lines ~9-121 currently) from `## What this does`; remove `## Skills` section content (lines ~224-352 currently), replacing both with short summaries + links
- `CHANGELOG.md` — receives the merged, deduplicated, newest-first version history
- `docs/getting-started.md` — new file, receives the full skill reference table content

## Gotchas

- The `v6.7.0` entry exists in both sources with likely-different wording (README's is a condensed "what's new" blurb; `CHANGELOG.md`'s is the fuller original entry) — read both before merging, don't just concatenate or arbitrarily pick one; check whether either version has drifted out of accuracy relative to the actual shipped feature.
- Do not delete any version's content outright — every `### What's new` block in README must land in `CHANGELOG.md` even if reworded/condensed to match that file's existing style.
- `/init`'s doc-registry threshold check (Phase 8.5) is what originally flagged this — after this record lands, a future `/init` re-run (or `/claude-tweaks:docs-health`) may recommend creating `docs/REGISTRY.md` now that `docs/getting-started.md` exists; that's out of scope here (no registry currently exists in this project at all, and this record's own acceptance criteria don't require creating one).
- Per this project's own recorded lesson (CLAUDE.md), verify README's actual current section boundaries by re-running the section-size check (`awk` over `^## ` headings) immediately before editing — line numbers cited above were correct at spec-shaping time but will shift as soon as any of the three deliverables lands.

## Original request

[task] Split README.md (304 lines) — over the doc-registry 200-line threshold

**Related:** none

Context: /init Phase 8.5 (doc registry creation) flagged README.md at 304 lines, over the standard 200-line threshold that suggests splitting out getting-started/API-reference sections into docs/*.md. README currently covers project overview, setup, usage, and the full skill catalog in one file.

Scope: Identify splittable sections (e.g. the full skill reference table, common workflows) and move them to docs/getting-started.md or docs/*.md per the Tier 3 taxonomy, leaving README as a high-level overview that links into docs/.
