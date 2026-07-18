# Docs-Health Expansion, Wrap-Up Integration, and Genre Templates — Design

## Goal

Extend `/claude-tweaks:docs-health`'s judgment beyond genre-drift/depth-mismatch/staleness with three new signals (findability, placement-fit, freshness-dependencies); wire the existing judge into `/claude-tweaks:wrap-up` so drift introduced by the just-completed work surfaces immediately instead of waiting for the next rotation sweep; and give doc authors project-agnostic scaffolding (a unified genre-template library, per-folder landing pages, diagram sync markers) that reduces drift at the source. Everything stays strictly project-agnostic — no portal/site-generator, no prescribed rendering technology, no formalized linting.

## Motivation

The shipped docs-health skill (genre-drift + depth-mismatch + staleness) only judges docs that happen to come up in its rotation. Two gaps surfaced during this brainstorm, both grounded in real prior art from a sibling project's independently-built Nextra docs portal (`memenu-app/.claude/skills/docs-portal`):

1. **Timing gap.** A build session can introduce genre-drift, depth-mismatch, or staleness into a doc it just edited, and nothing catches it until that doc happens to rotate up in a later, unrelated firing. `/wrap-up` already has the right moment (context still loaded, doc-registry check already running in Step 6.1) but doesn't apply docs-health's actual judgment — it only checks whether code changes imply a doc *should* be updated, not whether the doc *as it now stands* is healthy.
2. **Coverage gap.** Three real signals from memenu's working system have no analog here: whether a doc is discoverable at all (memenu's build-time nav-coverage gate), whether a doc's genre matches where it's *filed*, not just what its heading claims (memenu's directory-driven nav sync), and whether a doc's freshness can be checked against an author-declared dependency instead of only inferred grep targets (memenu's "kept in sync with" diagram comment).

A third, adjacent gap surfaced independently: new docs (whether backlogged by `/init` or authored fresh by `/wrap-up`'s new missing-doc detection) start from a blank page. Diátaxis's four genres already have two working template precedents in this codebase (the ADR template in `_shared/decision-records.md`, the journey template in `journeys/journey-template.md`) but no template for the four core genres themselves.

## Architecture

### A. `_shared/criteria-docs-diataxis.md` — three dimension changes

**New Dimension 5 — Findability** (new `category: "findability"`). Mechanical signal: a new helper counts inbound references to a doc from `docs/**`, `README.md`, and `CLAUDE.md` — the actual places a human or agent would navigate from (chosen over a whole-repo grep, which would catch incidental code-comment mentions that aren't real navigation paths). The LLM judges whether a near-zero count means a genuine orphan (blocks discovery) or an intentionally standalone doc (explicit draft/archived marker, or a doc excluded from rotation entirely, e.g. `docs/superpowers/**`).

**Dimension 1 (genre-drift) strengthened — placement-fit.** Today's Dimension 1 derives one "implied type" from location-*or*-heading combined, so a correctly-labeled how-to doc sitting under `docs/reference/` currently passes (heading matches content; nobody checks the folder alone). New sub-check: derive a *directory-only* implied type, ignoring heading language entirely, and compare it against found type independently of the existing heading-vs-content comparison. Still `category: "genre-drift"` (still a genre question), typically `classification: "restructural"` since the fix is moving the file, not editing a sentence. No new mechanical helper — this reuses Dimension 1's existing found-type determination and adds a second independent comparison.

**Dimension 2 (staleness) strengthened — freshness-dependencies.** A `files:` frontmatter list (repo-relative paths) declares what a doc depends on — reusing the field name and shape journey docs already use for `/review`'s regression detection (`journeys/journey-template.md`), rather than inventing a competing `tracks:` field with near-identical meaning. A new mechanical helper checks, for each declared path: does it exist (a missing path is its own staleness finding), and has it changed more recently than the doc's last-audit cursor? `sinceTimestamp` comes from the doc's existing audit cursor (already read at `next-target` selection time); the helper returns which tracked paths changed since then — a deterministic signal, same "mechanical signal → LLM contextual judgment" split as depth-mismatch (a trivial reformat to a tracked file may not actually invalidate the doc; the LLM decides whether the change is substantive enough to flag). `bin/lib/docs-health/scope.js`'s hotspot heuristic also starts prioritizing `files:`-declared paths over its current incidental backtick-path sniffing.

### B. `/visualize` — diagram sync integration

`/visualize` doesn't currently own writing into the doc that embeds its output — it generates the diagram file and hands the caller (`/journeys`, `/specify`, the user) a snippet to paste in. Step 5 (Write wrapper outputs) gains one more piece of output alongside the existing standalone-file and markdown-embed-snippet: a suggested `files:` frontmatter line naming the diagram's depicted source dependencies. The calling skill applies it when it pastes the embed snippet into the doc it already owns — same handoff pattern already in use, just one more line in what gets handed off.

### C. `skills/_shared/diataxis-genre-templates.md` — unified genre-template library (new file)

One shared file, six sections: Tutorial, How-To, Reference, Explanation (newly authored, matching Diátaxis's own published skeleton guidance for each genre) plus ADR and Journey (migrated). Mirrors how `criteria-docs-diataxis.md` already bundles multiple dimensions in one fragment rather than one file per dimension.

**Migration, not duplication:**
- `_shared/decision-records.md` keeps the 3-factor gate, location convention, and "who reads/writes" table (lines 1-30, 58-71 of the current file) — its literal "## Template" section (lines 31-56) is replaced with a one-line pointer to the shared file's ADR section. `/claude-tweaks:wrap-up` Step 6.3 keeps its existing reference to `decision-records.md` unchanged; that file forwards to the shared template, so no other skill needs to change.
- `journeys/journey-template.md` keeps "Key Principles" and "File location" (its actual differentiating content) — its literal "## Template" section is replaced with the same kind of pointer. `/claude-tweaks:journeys` Step 2 keeps its existing reference to `journey-template.md` unchanged, for the same reason.

This keeps the blast radius to the two template-holding files themselves — no changes needed to `wrap-up/SKILL.md` or `journeys/SKILL.md`.

**Consumers, different depth:**
- `/init` Phase 8.5's missing-doc backlog items (docs-structure.md's "Identify missing docs" step) point to the matching template section, genre inferred from the existing folder-taxonomy mapping (`getting-started.md`→Tutorial, `api.md`→Reference, `guides/*`→How-To, `architecture.md`→Explanation). Backlog-only, no auto-write — matches `/init`'s existing "fast-start, don't do doc content work" philosophy; it never writes doc content itself today and this doesn't change that.
- `/wrap-up`'s new missing-doc gap-detection (D, below) *does* write the file, since Step 10 already executes approved batch items — and unlike `/init` scanning an unfamiliar codebase, wrap-up has full session context on what was just built, so it scaffolds from the matching template and fills in real content immediately.

**Explicitly not built this pass:** a Retrospective template (a seventh genre docs-health already recognizes as native-exempt, per Dimension 1's non-Diátaxis-native-genre check, but with no template anywhere) — see Non-Goals.

### D. `/wrap-up` Step 6.1 — two extensions (new sub-file: `skills/wrap-up/docs-health-integration.md`)

Given the size of this addition, it becomes its own lazy-loaded sub-file (matching the existing pattern of `leftover-routing.md`, `review-console.md`, etc. — heavy step-specific procedure split out of `SKILL.md`), referenced from Step 6.1 with a short pointer.

**D1 — Inline JUDGE application.** Apply `_shared/criteria-docs-diataxis.md`'s full JUDGE procedure to every doc edited or newly created during this work — reusing the existing `_shared/harness-health-analysis.md` reuse pattern (Step 7 already applies that shared procedure inline rather than re-invoking `/harness-health` as a nested call; this does the identical thing against the docs criteria fragment). Scope is edited + newly created docs only — registry-matched-but-unedited docs remain Step 6.1's existing, separate "should this have been updated" concern, not this check's job.

Findings route by `classification`:
- `additive` → becomes a `[doc]` row in Step 6's existing configuration-update batch table, applied inline in Step 10 like any other approved doc edit.
- `restructural` → filed as a `by:docs-health` GitHub issue via the existing dedup/filing CLI machinery (`validate-findings`, `GATHER OPEN ISSUES`, `FILE` from `skills/docs-health/SKILL.md` Steps 4-6), scoped to exactly the touched-doc IDs instead of a `next-target` rotation pick — restructural work (reorganizing, splitting a doc) deserves its own spec/plan cycle, not a same-session inline patch.

**D2 — Missing-documentation gap-detection.** A distinct check from D1 — its input is the *diff*, not an existing doc, so it doesn't belong in the docs-health criteria fragment (which only ever takes a doc as input). Fires only when this work introduces a new subsystem, skill, or architectural pattern with zero existing doc coverage anywhere — a deliberately high bar, met by "this work added something with no doc slot anywhere in the project," not merely "these changed files don't match any registry Auto-detect pattern" (which `/init` Phase 8.5 already handles differently, via fixed Tier-based taxonomy slots like getting-started/api/contributing — a narrower, checklist-driven gap check this doesn't attempt to generalize). On a hit, proposes creating a new doc as a `[doc]` batch row; on approval, Step 10 scaffolds it from the matching genre template (C) and fills in real content from session context, the same way D1's additive findings apply.

### E. `docs-structure.md` (init) — per-folder landing pages

New Tier 2/3 convention: any subfolder with 3+ files gets `index.md` listing its contents with one-line descriptions and links (memenu had to retrofit this after hitting first-click 404s on section nav links). Non-invasive, backlog-only — Phase 8.5's existing assessment step (item 4, "Quick-assess existing docs") gains a "missing landing page" check alongside its existing stale/thin/misplaced checks, filed as a backlog item the same way any other gap is. No rendering technology implied — this is a plain markdown convention, not a portal.

This mechanically strengthens Dimension 5 (Findability): a doc linked from its folder's landing page goes from 0 inbound references to 1+.

## Code Changes

| File | Change |
|---|---|
| `bin/lib/docs-health/findability.js` | New — `computeInboundReferences(docId, root)` |
| `bin/lib/docs-health/freshness.js` | New — `checkTrackedFreshness(filesList, root, sinceTimestamp)`; shares frontmatter-block parsing with `depth.js` rather than duplicating it (extract if the existing parsing isn't already reusable) |
| `bin/docs-health.js` | New CLI subcommands wrapping the two helpers above (mirrors the existing `word-count` subcommand's pattern) |
| `bin/lib/docs-health/validate-finding.js` | `CATEGORY_VALUES` gains `"findability"` |
| `bin/lib/docs-health/scope.js` | Hotspot heuristic prioritizes `files:`-declared paths |
| `skills/_shared/criteria-docs-diataxis.md` | New Dimension 5; Dimension 1 and 2 strengthened per above; finding-shape category enum updated; H1/intro updated |
| `skills/docs-health/SKILL.md` | Step 3 JUDGE procedure gains the two new mechanical-check invocations; header, description, When-to-Use, finding-shape JSON schema updated |
| `skills/visualize/SKILL.md` | Step 5 gains the suggested `files:` output |
| `skills/_shared/diataxis-genre-templates.md` | New — 6 genre sections |
| `skills/_shared/decision-records.md` | Template section replaced with pointer |
| `skills/journeys/journey-template.md` | Template section replaced with pointer |
| `skills/wrap-up/docs-health-integration.md` | New — D1 + D2 full procedure |
| `skills/wrap-up/SKILL.md` | Step 6.1 gains a pointer to the new sub-file |
| `skills/init/docs-structure.md` | Per-folder landing-page convention; missing-doc backlog items reference the genre-template library |
| Sibling-file sweep | Same pattern as the prior depth-mismatch pass — files that describe docs-health's dimension count/list need the new dimension mentioned (exact file list determined during planning, not enumerated here) |

## Testing

Each new mechanical helper (`findability.js`, `freshness.js`) gets a unit test file mirroring `depth.test.js`'s structure, plus an end-to-end CLI test mirroring `cli-word-count.test.js`. `validate-finding.test.js` gains a case accepting `category: "findability"`. No new tests needed for the criteria-fragment prose changes or the template migration (markdown content, not executable code) — those are covered by the sibling-file sweep's grep-based verification, same as the prior session's approach.

## Non-Goals (explicitly parked / out of scope)

- **Agent-chunk self-containment** — still an open, unbuilt question from the prior session; unchanged.
- **In-depth templating exploration** — versioning, per-project customization, richer per-genre metadata schemas. A separate future brainstorm, not folded into this pass.
- **A Retrospective template** — a recognized native-exempt genre with no template anywhere in the codebase. A real, noted gap; not fixed here.
- **A docs-portal/site-generator** (à la memenu's Nextra build) — would break project-agnosticism; not every consuming project is even a web app.
- **Formatting/linting conventions** (heading depth, code-fence tags, frontmatter schema enforcement) — matches the project's existing "CI stays reactive" boundary; a linter is the right tool, not an LLM-judged health sweep.
- **arc42-style enrichment of the Explanation template** — considered as a richer architecture-doc skeleton, not adopted this pass.

## Known Touch Points

- `_shared/harness-health-analysis.md` — the reuse-pattern precedent D1 follows (shared judgment logic consumed inline by `/init`, `/wrap-up`, and the standalone routine, rather than re-invoked as a nested skill call).
- `_shared/work-record.md` — D1's restructural-finding filing path reuses the existing `by:docs-health` origin, scoring, and born-`ready` conventions unchanged.
- `_shared/auto-mode-contract.md` — D1's additive-finding batch rows and D2's new-doc proposals both route through Step 6's existing batch table / Review Console, never auto-applied without approval, consistent with the contract's existing rules for configuration-class changes.
- `/claude-tweaks:review` — Lens 3i-diagram already flags missing diagrams for structurally complex diffs; the freshness-dependency mechanism (A) is deliberately scoped to *existing* diagrams' staleness, not "should this doc have a diagram it doesn't" — that judgment stays `/review`'s job, avoiding overlap.
