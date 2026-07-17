---
record: 36
origin: human
risk: low
effort: high
grants: []
surface: backend
---
# 36: New skill: docs-health — recurring Diátaxis genre-drift + staleness sweep for docs/**, mirroring code-health/harness-health

Surface: backend

## Current State

- `code-health` (`skills/code-health/SKILL.md`, `bin/code-health.js`, `bin/lib/code-health/*`) and `harness-health` (`skills/harness-health/SKILL.md`, `bin/harness-health.js`, `bin/lib/harness-health/*`) both run a SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline: pick a rotation target (`next-slice`/`next-target`), read it, judge it against calibration criteria (`skills/_shared/criteria-*.md` fragments for code-health; the shared `_shared/harness-health-analysis.md` 8-dimension check for harness-health), apply a 5-question adversarial verify gate, fingerprint+dedup against open `by:{skill}` issues, and file a `by:{skill}`-labelled, born-`ready` GitHub issue via the unified work-record contract (`_shared/work-record.md`). Both persist rotation cursors, run logs, and a filing retry queue on the durable `health-state` git branch (`_shared/health-state.md`, `bin/lib/health-core/durable-state.js`) so a scheduled cloud Routine's stateless container recycling doesn't lose progress; `bin/lib/health-core/retry-cli.js` gives both skills' retry-queue drain/update CLI commands one shared implementation.
- `harness-health`'s scope is exactly `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md (per its own SKILL.md description) — it never reads `docs/**`. There is no file-glob overlap with this project's `docs/` tree today.
- This repo's own `docs/` tree: `docs/decisions/` (5 files, ADR-shaped), `docs/diagrams/` (1 file), `docs/plans/` (2 brainstorming briefs), `docs/superpowers/{specs,plans}/` (114 files — ephemeral or permanently-retained build artifacts from `/superpowers:brainstorming` + `/superpowers:writing-plans`, not Diátaxis-portal-shaped reference/how-to content). No existing skill judges genre-drift or factual staleness across any of this.
- No project-level one-shot sampling-based Diátaxis audit skill exists in this repo today — the "downstream project" manual audit described in the original request below is external prior art, not a shipped tool here. The "absorb/deprecate" non-goal from the original request is moot for this codebase; it only matters if such a skill is ever added separately.

## Deliverables

- [ ] `skills/docs-health/SKILL.md` — new skill following the code-health/harness-health SKILL.md structure (frontmatter, interaction directive, workflow steps, Routine Configuration, Next Actions, Component-Skill Contract, Anti-Patterns, Relationship to Other Skills tables).
- [ ] `skills/docs-health/routine-template.yml` — one-target-per-firing template, mirroring `skills/harness-health/routine-template.yml`, wired to `/claude-tweaks:routine create docs-health`.
- [ ] `bin/docs-health.js` — CLI entry point (`next-target`, `validate-findings`, `mark`, `churn-report`, retry-queue drain/update — matching harness-health's command surface).
- [ ] `bin/lib/docs-health/scope.js` — target rotation over `docs/**`, adapted from `bin/lib/harness-health`'s file-based (not directory-slice) target model: force-stale floor, git-churn hotspot scoring, content-hash change-skip. Excludes `.claude/skills/**`, `.claude/rules/**`, and `CLAUDE.md` (harness-health's exclusive territory) and `docs/superpowers/**` (ephemeral/historical build artifacts — specs, plans — not portal-shaped reference content).
- [ ] `bin/lib/docs-health/{cache.js,dedup.js,fingerprint.js,issue-payload.js,score.js,validate-finding.js}` — reusing `bin/lib/health-core/durable-state.js` and `bin/lib/health-core/retry-cli.js` for cursor/retry-queue persistence exactly as harness-health does (per the original request: "no new persistence mechanism needed").
- [ ] `skills/_shared/criteria-docs-diataxis.md` — new criteria fragment encoding the Diátaxis method: implied-type-by-location vs. found-type mismatch, dual-persona "misleads: human engineer" / "misleads: coding agent" tagging, and factual-staleness checking (stated counts/facts vs. live repo reality).
- [ ] Fingerprint shape `assetType + target + section`, modeled on harness-health's (`bin/lib/harness-health/fingerprint.js`), not code-health's `relfile#Symbol` anchor shape — docs are prose with no named symbols.
- [ ] Filing via the unified work-record contract (`_shared/work-record.md`): `by:docs-health` origin label, `risk:*`/`effort:*` scoring, `ready` stage — born-`ready` and spec-shaped by construction, matching code-health/harness-health's own born-ready rule.
- [ ] `README.md` and `skills/help/reference-card.md` updated to list the new skill; `skills/help/SKILL.md`'s workflow diagram updated per CLAUDE.md's cross-reference rule.
- [ ] CLAUDE.md's skill-directory table (`## Structure` → "Utility" row) updated to include `docs-health`.

## Acceptance Criteria

1. `docs-health` ships with `SKILL.md`, `routine-template.yml`, and an engine module following the existing `bin/lib/<skill>/` + `bin/<skill>.js` layout — verified by `node --test bin/lib/docs-health/tests/*.test.js` passing and `node bin/docs-health.js next-target --root .` returning valid JSON against this repo's own `docs/` tree.
2. `skills/_shared/criteria-docs-diataxis.md` exists and is calibrated so its dual-persona ("misleads: human engineer" / "misleads: coding agent") + factual-staleness checks would flag the two failure modes named in the original request's downstream audit (a "reference" doc that's secretly a how-to walkthrough; a stale stated item count) if run against equivalent fixture content.
3. `docs-health`'s rotation pool (`bin/lib/docs-health/scope.js`) explicitly excludes `.claude/skills/**`, `.claude/rules/**`, and `CLAUDE.md` — confirmed by a unit test asserting zero overlap with `harness-health`'s own target list — and explicitly excludes `docs/superpowers/**`.
4. `docs-health` never edits `docs/**` content — every finding files as a `by:docs-health`-labelled GitHub issue via `gh issue create`, matching code-health/harness-health's report-only contract. No `Edit`/`Write` call appears anywhere in the documented workflow.
5. `SKILL.md` includes `## Anti-Patterns` and `## Relationship to Other Skills` sections per CLAUDE.md's skill-authoring convention, with a bidirectional cross-reference added to `harness-health/SKILL.md`'s own Relationship table (CLAUDE.md: "Every skill's Relationship table must be bidirectional").
6. `/claude-tweaks:routine create docs-health` successfully instantiates a routine configuration from `routine-template.yml` (verified via `--dry-run`, matching the existing pattern documented in `skills/code-health/SKILL.md`'s Routine Configuration section).

## Technical Approach

Mirror code-health/harness-health's SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline, reusing the shared engine primitives rather than rebuilding them:

- **SELECT** (`next-target`): closer to harness-health's file-target model than code-health's directory-slice model, since a "target" here is one doc file, not a directory. Adapt `bin/lib/harness-health/scope.js`'s stale-floor + git-churn-hotspot + content-hash-skip logic (the same shape as `bin/lib/code-health/scope.js`'s `selectSlice`) over a `docs/**` file list instead of `.claude/skills/*.md` + `.claude/rules/*.md` + `CLAUDE.md`.
- **Scope boundary decision (resolves the original request's open question):** ship as a fully separate skill (matching the issue's own title and the Deliverables list's specificity — a complete parallel SKILL.md/engine/routine-template, not a 9th dimension bolted onto harness-health's existing 8-dimension check). `docs-health`'s rotation pool is `docs/**` minus `.claude/skills/**`, `.claude/rules/**`, `CLAUDE.md` (harness-health's exclusive territory — zero glob overlap by construction) and minus `docs/superpowers/**` (ephemeral/historical `/specify` + `/superpowers:writing-plans` artifacts, not portal-shaped content). If a project ever mirrors `.claude/skills/*.md` into its own `docs/**` portal, that mirrored copy is still fair game for docs-health's genre/staleness judgment (a different lens — content genre-shape, not harness-accuracy/template-conformance) — document this explicitly in the new skill's "Not for" line, matching the pattern already used in harness-health's own "Not for" line.
- **JUDGE**: new `skills/_shared/criteria-docs-diataxis.md` fragment, read the same way code-health's judge step loads `criteria-*.md` fragments — implied-type-by-location (a file under a "reference"-shaped section path) vs. found-type (the file's actual content shape: procedural walkthrough vs. lookup table vs. explanation), dual-persona misleading-risk tagging, and stated-fact-vs-live-reality staleness checking (item counts, "as of" dates, feature-availability claims).
- **VERIFY GATE**: reuse code-health's exact 5-question discipline verbatim — is it real, is it actionable, does it reproduce, is likelihood justified, is effort consistent.
- **FINGERPRINT/DEDUP**: `assetType + target + section` (harness-health's shape), not code-health's `relfile#Symbol` anchor — a doc finding anchors to a target file + section heading, no named code symbol exists to anchor on.
- **PERSISTENCE**: reuse `bin/lib/health-core/durable-state.js` (`createDurableState('docs-health')`, `includeRemembered: false` — no code-health-style sub-threshold cache needed) and `bin/lib/health-core/retry-cli.js` unchanged, per `_shared/health-state.md`'s contract — `docs-health/{cursors,retry-queue,runs}.json` on the `health-state` branch.
- **FILE**: `_shared/work-record.md`'s unified contract — `by:docs-health` origin, `risk:*`/`effort:*` scoring (judge blast-radius/reversibility the same way harness-health's classification-to-scoring table does — most docs-health findings are pure prose edits, so expect `risk:low` to dominate), `ready` stage, Type `task`. Bootstrap `by:docs-health` plus whichever `risk:*`/`effort:*` pairs a run applies, per `_shared/label-bootstrap.md`'s check-then-create snippet, before first filing.

### Key Files

- `skills/docs-health/SKILL.md` (new) — full skill definition, structured like `skills/harness-health/SKILL.md`.
- `skills/docs-health/routine-template.yml` (new) — copy `skills/harness-health/routine-template.yml`'s structure, retarget to `docs-health`.
- `bin/docs-health.js` (new) — CLI entry point mirroring `bin/harness-health.js`'s command set.
- `bin/lib/docs-health/scope.js`, `cache.js`, `dedup.js`, `fingerprint.js`, `issue-payload.js`, `score.js`, `validate-finding.js` (new) — engine modules, mirroring `bin/lib/harness-health/*.js`'s file set, each paired with a `tests/*.test.js`.
- `skills/_shared/criteria-docs-diataxis.md` (new) — Diátaxis genre-drift + staleness criteria fragment.
- `bin/lib/health-core/durable-state.js`, `bin/lib/health-core/retry-cli.js` (existing, read-only reuse) — durable cross-firing persistence; no changes needed.
- `skills/_shared/work-record.md`, `skills/_shared/label-bootstrap.md` (existing, read-only reuse) — filing contract and label bootstrap snippet.
- `README.md`, `skills/help/reference-card.md`, `skills/help/SKILL.md`, `CLAUDE.md` (existing, edited) — cross-reference updates per CLAUDE.md's cross-reference rule.

## Gotchas

- Resolved scope-boundary decision (see Technical Approach): ship as a fully separate skill, not an additive dimension on harness-health. Revisit only if a future project's `docs/**` turns out to duplicate harness-health's exact file set wholesale.
- No existing project-level sampling-based audit skill exists in this repo to absorb or deprecate — the original request's "absorb/deprecate" non-goal is not actionable here; don't spend build time on it.
- `docs/superpowers/**` (114 files) is this repo's largest `docs/` subtree by file count but is explicitly OUT of scope — it's ephemeral/historical `/specify` + `/superpowers:writing-plans` output, not Diátaxis-portal content. Don't let a naive `docs/**` glob accidentally rotate through it.
- Content *quality* is explicitly not what the spec-shaped-body check verifies (`_shared/work-record.md`) — the same principle applies to docs-health's own judge step: judge genre-shape and factual staleness, not prose quality/style, matching code-health/harness-health's own "judge, don't nitpick" discipline.
- Every `by:*` origin label and every `risk:*`/`effort:*` pair this skill's filing step uses must be bootstrapped via `_shared/label-bootstrap.md`'s check-then-create loop before the first `gh issue create` — a bare `gh label create` on an already-existing label 422s.
- `harness-health/SKILL.md`'s own Relationship-to-Other-Skills table needs the bidirectional cross-reference added back (CLAUDE.md's bidirectional-relationship rule) — don't stop at documenting the boundary one-directionally in docs-health's own file.

## Original request

New skill: docs-health — recurring Diátaxis genre-drift + staleness sweep for docs/**, mirroring code-health/harness-health

**Current State**

`code-health` and `harness-health` both give recurring, LLM-judged, deduplicated GitHub-issue-filing drift detection — one for code quality, one for `.claude/skills/*.md` + `.claude/rules/*.md` + CLAUDE.md accuracy/template-conformance. Neither covers a project's own `docs/**` content (reference docs, guides, ADRs, journeys, retrospectives) for documentation-genre drift or factual staleness.

A downstream project (private) hand-ran a one-off Diátaxis-framework content audit across its docs portal and found real, concrete drift with no mechanism catching it: two "reference"-section docs that were secretly how-to walkthroughs (one 1,150+ lines of procedural instructions before its one reference-shaped paragraph), a reference doc with unmarked forward-looking roadmap content indistinguishable from shipped features, and a section index page that stated a stale item count for 4+ months, self-acknowledging the gap in its own text the whole time without anyone fixing it. Findings explicitly tracked "misleads: human engineer" vs. "misleads: coding agent" as separate risk categories — 2 of 5 flagged agent-risk as primary, since retrieval-style docs consumption by an agent has no "skim the title, notice the caveat" safety net a human reader gets for free. The method worked but is one-shot and manual — nothing stops drift from silently reaccumulating, the exact problem code-health/harness-health already solve for their own domains.

**Deliverables**

A new `docs-health` skill, engineered as a close mirror of `code-health`/`harness-health` rather than a fresh design:

- SELECT: `next-target` rotation over `docs/**` (hotspot-by-churn / stale-by-time / manual `--target` override) — reuse the existing rotation/cursor engine shape.
- JUDGE: a new criteria fragment encoding the Diátaxis method the manual audit proved out — implied-type-by-location vs. found-type, dual-persona "misleads: human engineer" / "misleads: coding agent" tagging, plus factual-staleness checking (stated counts/facts vs. live reality).
- VERIFY GATE: the same 5-question adversarial discipline code-health already applies before filing.
- FINGERPRINT/DEDUP: model on harness-health's `assetType + target + section` shape, not code-health's `relfile#Symbol` shape — docs are prose, no named symbols to anchor on.
- FILE: same unified work-record contract (`by:docs-health`, `risk:*`, `effort:*`, `ready`, spec-shaped body) and the same durable `health-state`-branch cursor/retry-queue persistence — no new persistence mechanism needed.
- `routine-template.yml` + `/claude-tweaks:routine create docs-health`, one-target-per-firing.

**Explicit non-goals** (resolve these boundaries as part of the design, don't presume):

- Not for mechanical/unambiguous checks (broken links, malformed frontmatter, missing structural metadata) — those belong in the consuming project's own build/CI pipeline, same "CI stays reactive" boundary code-health already draws for code.
- Needs an explicit scope line against `harness-health` for projects where `.claude/skills/*.md` is *also* synced into a docs portal's own Skill-Reference-shaped section. Open question to resolve during build, not before: does docs-health's rotation pool simply exclude `.claude/skills/**`, with the Diátaxis-genre angle added as an additive dimension to harness-health's existing 8-dimension check instead of a second skill covering the same files?
- Decide whether this absorbs/deprecates a project-level one-shot sampling-based audit skill, or coexists with it (rotation for ongoing prevention; sampling for an occasional whole-corpus snapshot). If both survive, extract the Diátaxis criteria into one shared fragment both read, matching how code-health's criteria are already reused by `/review`/`/deepen`/`/simplify`.

**Acceptance Criteria**

- [ ] `docs-health` ships with `SKILL.md`, `routine-template.yml`, and an engine module following the existing `bin/lib/<skill>/` + `bin/<skill>.js` layout.
- [ ] New Diátaxis-genre + staleness criteria fragment lives under `skills/_shared/`, calibrated so it can be checked against the downstream project's real 5-finding audit as a regression test.
- [ ] Scope boundary against `harness-health` is explicitly resolved and documented.
- [ ] Report-only — never edits docs content, only files issues.
- [ ] Includes `Anti-Patterns` and `Relationship to Other Skills` sections, matching the existing skill-authoring convention.
