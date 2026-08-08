---
record: 217
origin: human
risk: medium
effort: high
ceremony: standard
grants: []
fingerprint: 2026-08-08-model-profile-strategy:rename-the-effort-record-facet-to-size
surface: skills
---
# 217: Rename the effort: record facet to size:

Surface: skills
Parent: #215

## Overview

Rename the work-record facet `effort:` (values low/medium/high — it has always meant **task size**) to `size:`, freeing the word "effort" to mean exclusively what the harness means by it: reasoning depth (`effort:` frontmatter, `/effort`, the statusline's `eff:` segment). Without this rename, the profile system's effort axis gives "effort" two unrelated meanings in the same ecosystem. The rename covers the GitHub labels (renamed in place — `gh label edit` propagates to all existing records), the parsing/emitting code in `bin/lib/issues/` **and every live consumer of `facets.effort`**, the local-files frontmatter key, and a bounded prose/diagram sweep.

**Complexity:** Medium-High
**Estimated tasks:** 8

## Non-Goals

- `review-effort` / `review-effort-floor` keep their names — they describe review thoroughness (the reasoning-depth side), which is exactly what "effort" should mean after this rename.
- The `/build` bridge's *behavior* (size→profile mapping) — the wording updates here; the `tier=frontier` extension is #223.
- Migrating other projects' existing `effort:*` labels — the read-side fallback below covers them permanently.

## Current State

- Labels live on this repo: `effort:low|medium|high` (`gh label list`).
- Parse/emit: `bin/lib/issues/record.js` — `parseRecordFacets` reads `effort:*` labels; `recordPayload({effort})` emits them; `CLASSIFICATION_SCORING` (~lines 79-82) carries an internal `effort` key. Tests in `bin/lib/issues/tests/`.
- **Live `facets.effort` consumers (verified during red-team):** `bin/lib/issues/backlog.js` (~line 71, cleanup-lane filter `r.facets.effort === 'low'`) and `bin/lib/issues/ranking.js` (~lines 18-20, `EFFORT_ORDER`/`effortBandOf`). Their tests (`tests/backlog.test.js`, `tests/ranking.test.js`) hand-construct `facets: {effort}` fixtures, so they stay green through a parser-only rename while production silently breaks — both files and both suites are in scope.
- **`recordPayload({effort})` callers:** the four health-skill payload builders `bin/lib/{code,docs,harness,journey}-health/issue-payload.js` and their `tests/issue-payload.test.js` suites, which assert `effort:*` labels via `deepStrictEqual`.
- Local driver: `bin/lib/issues/local-store.js` serializes `facets.effort` as an `effort:` frontmatter line.
- Taxonomy + consumers by name: `skills/_shared/work-record.md`, `skills/flow/materialize.md`, `skills/build/SKILL.md` (~184), `skills/backlog/SKILL.md`, `skills/assess-agent-autonomy/SKILL.md`, `skills/specify/shaping-mode.md`, `skills/specify/record-creation.md`, `skills/_shared/record-queue-fetch.md`, `skills/dispatch/SKILL.md`, `skills/_shared/label-bootstrap.md` (verify whether it enumerates label names), and the live diagram `docs/diagrams/github-issues-lifecycle.html` (`effort:*` rows at ~291/510/633).

## Deliverables

- [ ] `gh label edit effort:{low,medium,high} --name size:{low,medium,high}` with descriptions reworded to "size"
- [ ] `bin/lib/issues/record.js`: `parseRecordFacets` returns `size`, reading `size:*` labels with `effort:*` as read-side fallback — **`size:*` wins when both are present** (tested); `recordPayload` takes `size` and emits only `size:*`; `CLASSIFICATION_SCORING`'s internal key renamed
- [ ] `bin/lib/issues/backlog.js` (cleanup-lane filter) and `bin/lib/issues/ranking.js` (`EFFORT_ORDER` → `SIZE_ORDER`, `effortBandOf` → `sizeBandOf`) read `facets.size`; their tests updated to exercise the real parser's dual-read output, not only hand-built fixtures
- [ ] The four `bin/lib/*/issue-payload.js` builders pass `size`; their four test suites updated
- [ ] `bin/lib/issues/local-store.js`: frontmatter key `size:` (read-side `effort:` fallback, same precedence), plus tests
- [ ] Prose/diagram sweep, case-insensitive per IL-21, across the consumer files in Current State — facet-meaning "effort" becomes "size"; reasoning-depth "effort" untouched; `argument-hint` updated on any skill whose `## Input` names the facet
- [ ] CHANGELOG entry notes the stale-installed-version limitation (below)
- [ ] Acceptance greps run with `find`+`xargs` (gitignored dirs hide hits from bare recursive grep)

## Acceptance Criteria

1. `gh label list` shows `size:low|medium|high` with size-worded descriptions and no `effort:*` labels; a previously `effort:medium` record shows `size:medium`.
2. `parseRecordFacets(["size:high"])` = `parseRecordFacets(["effort:high"])` = size high; `parseRecordFacets(["size:low","effort:high"])` returns **low** (size wins); `recordPayload({size:"low"})` emits `size:low`, never `effort:low`.
3. Case-insensitive sweep greps across `skills/ bin/ tests/ docs/` for (a) the colon forms `effort:low|effort:medium|effort:high`, (b) `facets.effort`, and (c) the bare-word restatements `effort label|effort tier|effort-based|effort band` return zero matches outside: the two read-side fallback lines and their tests, `review-effort*` identifiers, and `docs/incident-log.md` history. Path-anchored exclusions per IL-34/IL-39.
4. `npm test` green — including backlog, ranking, and the four issue-payload suites, whose assertions now name `size`.
5. Both read-side fallbacks (record.js, local-store.js) carry the same code comment stating the retention rationale and removal condition (IL-85): **retained permanently for cross-project reads** — other projects' records keep `effort:*` labels forever — removable only at a major version that drops pre-rename repo support. No dependency on any `/init` upgrade-notice work.

## Technical Approach

### Key Files

- `bin/lib/issues/record.js`, `backlog.js`, `ranking.js`, `local-store.js` + `bin/lib/issues/tests/`, `tests/backlog.test.js`, `tests/ranking.test.js`
- `bin/lib/{code,docs,harness,journey}-health/issue-payload.js` + their `tests/`
- `skills/_shared/work-record.md`, `skills/flow/materialize.md`, `skills/build/SKILL.md`, `skills/backlog/SKILL.md`, `skills/assess-agent-autonomy/SKILL.md`, `skills/specify/shaping-mode.md`, `skills/specify/record-creation.md`, `skills/_shared/record-queue-fetch.md`, `skills/dispatch/SKILL.md`, `skills/_shared/label-bootstrap.md`
- `docs/diagrams/github-issues-lifecycle.html`
- GitHub labels via `gh label edit` (auto-executable; not a Manual Step)

## Gotchas

- **Known limitation, not a mitigated one:** sessions running an older installed plugin version still emit `effort:*` on create; after the rename, their `gh issue create --label effort:low` fails against this repo until the session picks up the new version (there is no auto-update mechanism — `claude plugin update` is version-string-only). The CHANGELOG entry states this plainly.
- Other projects using the plugin keep `effort:*` labels this rename cannot touch — the permanent read-side fallback is what keeps their records scored; `_shared/label-bootstrap.md` creates `size:*` labels in those repos on first filing.
- IL-103: `size:*` keeps `risk:*`'s always-present-when-scored idiom — a rename, not a presence-marker change.
- IL-62: when updating backlog/ranking tests, derive expected values independently — don't re-derive them from the renamed implementation.


<!-- work-fingerprint: 2026-08-08-model-profile-strategy:rename-the-effort-record-facet-to-size -->
