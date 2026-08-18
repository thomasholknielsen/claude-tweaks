---
record: 339
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: parent-issue-vocabulary-rename:contract-layer-rename-to-parent-issue-vocabulary
surface: backend
---
# 339: Contract-layer rename to parent-issue vocabulary

Surface: backend

## Overview

Contract layer of the parent-issue vocabulary rename (parent #338): rename the `family:parent` label's code-side vocabulary, the local-files frontmatter key, the facet key, and the two gate functions — with a permanent read-side legacy fallback so adopter repos whose issues still carry `family:parent` (and whose local records still carry `family-parent: true`) keep working, per the `effort:` → `size:` rename precedent (#217) already encoded in `record.js`.

Verified current state (2026-08-12): `parseRecordFacets` does **not** parse `family:parent` today — the `familyParent` facet is local-files-only (`facet-shape.js`'s header comment), and GitHub-driver consumers reach parents purely via `--label family:parent` queries in skill prose. This leaf therefore *adds* label-derived `isParentIssue` parsing to `parseRecordFacets` (both new and legacy labels), centralizing the fallback in code where a test pins it; the prose queries' own dual-label form is the sibling sweep leaf's job.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No skill-prose edits (`skills/**/*.md` beyond `_shared/label-bootstrap.md`'s `LABELS_JSON`) — the sibling sweep leaf owns those, including every `node -e` snippet that calls the renamed functions.
- No live-label migration on this or any repo — the release leaf owns `gh label edit`.
- No behavior change to gate logic — `parentGateState` must be `familyGateState` byte-for-byte in behavior; only names and comments change.
- No rename of `facets.parent` / `hasParent` / frontmatter `parent:` — leaf-side vocabulary is already correct and must not be touched.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| — | none — this is the foundation leaf | — |

## Current State

- `bin/lib/issues/record.js` — `parseRecordFacets(labels)` parses stage/risk/size/ceremony/bot/demo labels; carries the `effort:*` permanent read-side fallback with its `[IL-85]` removal-condition comment (the pattern to copy); `parseFamilyLeaves(body)` parses body-text task lists into leaf numbers; `TYPE_LABELS`; no "family" string anywhere (verified).
- `bin/lib/issues/facet-shape.js` — shared facet defaults; header comment says `familyParent`/`blockedBy`/`type`/`unsynced`/`closed`/`closedAt` are local-files-only (becomes wrong for `isParentIssue` once label parsing lands — update it).
- `bin/lib/issues/local-store.js` — serializes `family-parent: true` (line ~199), parses it (line ~125) into `facets.familyParent`; `queryRecords('specs', { familyParent: true })` filter; header comments document the key set.
- `bin/lib/issues/acceptance.js` — `familyGateState({leaves, parentLabels})` reads only `demo:*` dispositions from `parentLabels` (never `family:parent` itself — verified); `needsBackstop({state, labels, hasParent})`; comments use family/leaf vocabulary.
- `bin/lib/issues/trust.js` — comment-level "family" mentions only.
- `skills/_shared/label-bootstrap.md` — canonical `LABELS_JSON` carries `["family:parent", "Structure: decomposition parent — carries the family's acceptance gate"]` (line ~106). NOTE: `skills/specify/record-creation.md` inlines a second copy of this pair — that copy is the sweep leaf's job; the two must end up identical.
- Tests: `bin/lib/issues/tests/acceptance.test.js`, `tests/` local-store and record suites; the `effort:` fallback test is the model for the new legacy-fallback tests.

## Deliverables

- [ ] `parseRecordFacets` gains an `isParentIssue` boolean facet: `true` when the labels include `parent-issue` **or** legacy `family:parent`. Implementation shape (red-team resolved): this is a plain boolean flag like `grants.build`/`bot.inProgress` — two exact equality checks (`if (name === LABELS.PARENT_ISSUE) ...` / `if (name === 'family:parent') ...`), each setting `facets.isParentIssue = true`. Do NOT copy the `effort:*` fallback's regex/vocabulary/held-aside machinery (`EFFORT_LABEL_RE` + `TIERS` + null-sentinel) — copy only its comment style and permanence rationale. Add `PARENT_ISSUE: 'parent-issue'` to the `LABELS` constant object (matching existing style); the legacy string stays a raw literal beside its comment. Both legacy branches (here and local-store.js below) must carry a comment containing the literal substrings `[IL-85]` and `PERMANENT cross-project support` — record.js's text: "Read-side family:parent fallback — PERMANENT cross-project support (other repos' records keep family:parent labels); removable only at a major version that drops pre-rename repo support. [IL-85]"; local-store.js's text: "Read-side family-parent: fallback — PERMANENT cross-project support (pre-rename local records keep family-parent: lines); removable only at a major version that drops pre-rename repo support. [IL-85]"
- [ ] `facet-shape.js` shared defaults: `familyParent` → `isParentIssue` (default `false`); header comment updated — the facet is no longer local-files-only.
- [ ] `local-store.js`: serializes `is-parent-issue: true`; parses both `is-parent-issue:` (new) and `family-parent:` (legacy, comment text pinned above) into `facets.isParentIssue`, new-beats-legacy when both lines are present. **Precedence mechanism (red-team resolved):** a boolean default (`false`) cannot serve as the "wasn't set" sentinel the way `facets.size === null` does for the effort fallback — `is-parent-issue: false` plus a stray legacy `family-parent: true` must resolve to `false`, and a naive OR resolves it to `true`. Track presence with a held-aside flag (e.g. `let sawNewParentLine = false`) and apply the legacy value only when the new line was never seen. **Write behavior:** serialization emits from facets, new key only — `writeRecord` on a record parsed from legacy frontmatter drops the `family-parent:` line and emits `is-parent-issue:`; legacy lines are migrated-on-rewrite, never preserved alongside. **Filter key:** `queryRecords` filter key becomes `isParentIssue`, rename-only, no compat shim — a stale `{familyParent: true}` filter silently matches nothing; the skills sweep (#340) removes every prose caller, and no code caller exists outside this repo (verified: rename scope is self-contained in bin/).
- [ ] `acceptance.js`: `familyGateState` → `parentGateState` (export renamed, no alias — the plugin ships atomically and skill prose renames in the sibling leaf, same release); comments move to parent-issue/sub-issue vocabulary.
- [ ] `record.js`: `parseFamilyLeaves` → `parseSubIssues` (export renamed, no alias); comments updated.
- [ ] `trust.js`: sweep every family-vocabulary comment in the file (its mentions are comment-level only — verified; an independent deliverable, not scoped to `parseFamilyLeaves` mentions).
- [ ] `skills/_shared/label-bootstrap.md` `LABELS_JSON`: the pair becomes `["parent-issue", "Structure: parent issue — carries the acceptance gate for its sub-issues"]`.
- [ ] New tests: (a) `parseRecordFacets([{name:'family:parent'}]).isParentIssue === true` (legacy label fallback), (b) same for `parent-issue`, (c) local-store fixture with legacy `family-parent: true` frontmatter parses to `isParentIssue: true`, (d) round-trip: `{isParentIssue: true}` serializes to `is-parent-issue: true` and parses back, (e) both-present precedence: a fixture carrying `is-parent-issue: false` AND legacy `family-parent: true` parses to `isParentIssue === false` — this is the test that pins the held-aside-flag mechanism; a future edit reverting to naive OR must fail it. Existing family-named test references renamed.

## Acceptance Criteria

1. `node -e "const {parseRecordFacets}=require('./bin/lib/issues/record.js'); console.log(parseRecordFacets([{name:'family:parent'}]).isParentIssue, parseRecordFacets([{name:'parent-issue'}]).isParentIssue, parseRecordFacets([]).isParentIssue)"` prints `true true false`.
2. `acceptance.js` exports `parentGateState` and not `familyGateState`; the pre-rename gate test suite passes against the renamed function with zero behavioral edits to assertions (rename-only edits allowed).
3. A local record file written with `facets.isParentIssue: true` round-trips through `writeRecord`/`readRecord` carrying `is-parent-issue: true` frontmatter; a hand-written fixture with legacy `family-parent: true` reads back as `isParentIssue: true`.
4. `grep -rn "familyParent\|familyGateState\|parseFamilyLeaves" bin/` returns zero matches. `grep -rn "family:parent\|family-parent" bin/ --exclude-dir=tests` returns only the legacy-compat parse branches, each on or within one line of a comment carrying `[IL-85]` (tombstone-scoped grep per spec-template's Delete + Tombstone rule). **Test fixtures are explicitly exempt** — the legacy-fallback tests (a), (c), (e) necessarily carry bare `family:parent`/`family-parent: true` literals with no tombstone comment; they are the tests OF the legacy path, under `bin/lib/issues/tests/` and `tests/`, both outside this grep's scope by the `--exclude-dir=tests` and the `bin/`-only anchor respectively.
5. Full `npm test` passes ([IL-120] — never just the touched suites).

## Technical Approach

Copy the `effort:*` fallback's exact structure in `record.js` (`EFFORT_LABEL_RE`, its comment, its precedence note) for the label fallback. The rename itself is mechanical; the new capability is label-derived `isParentIssue` on the GitHub driver, which downstream prose (sweep leaf) will rely on. Keep `parentGateState`'s signature `{leaves, parentLabels}` — parameter names are part of the skill-prose call sites the sweep leaf updates, so coordinate: this leaf renames only the function, not its parameter shape.

### Data / API Surface

- `parseRecordFacets(labels) -> { ..., isParentIssue: boolean }` (new field, both drivers' facet shape via `facet-shape.js`)
- `parentGateState({ leaves, parentLabels }) -> 'resolved' | 'gated' | 'due' | 'incomplete'` (rename of `familyGateState`, behavior identical)
- `parseSubIssues(body) -> number[]` (rename of `parseFamilyLeaves`)
- local-files frontmatter: `is-parent-issue: true` (new emit), `family-parent: true` (legacy read-only)
- GitHub label: `parent-issue` (new), `family:parent` (legacy read-only)

### Key Files

- `bin/lib/issues/record.js` — isParentIssue parsing + legacy fallback; parseSubIssues rename
- `bin/lib/issues/facet-shape.js` — default + comment
- `bin/lib/issues/local-store.js` — emit/parse/filter + comments
- `bin/lib/issues/acceptance.js` — parentGateState rename + comments
- `bin/lib/issues/trust.js` — comment sweep only
- `skills/_shared/label-bootstrap.md` — LABELS_JSON pair
- `bin/lib/issues/tests/*.test.js`, `tests/` — renames + 4 new fallback tests

## Gotchas

- `facets.parent` (the leaf-side "id of my parent") is a different facet — do not touch it; the `is-` prefix exists precisely because `parentIssue` would read as another reference next to it.
- **No-alias atomicity has a concrete enforcement, not just intent:** build #339 → #340 → #341 as one sequential pipeline (`/claude-tweaks:flow #339,#340,#341`) so all three land on `main` in one release window; #341's negative sweeps are the release gate proving zero callers of the old names survive anywhere. Never ship a release containing #339 without #340 — skill-prose `node -e` call sites would fail at runtime (`familyGateState is not a function`) with no compile-time signal.
- #324 ("Observation-plan briefs") is `ready` and its Key Files include `bin/lib/issues/acceptance.js` — re-verify the file's state immediately before building ([IL-109]); a concurrent build may have landed. **Fallback if it has:** if `familyGateState`'s signature or surrounding code differs from Current State's description, stop and re-derive the edit against the live file — never apply this record's description over drifted code.
- The `[IL-85]` comment is load-bearing, not decoration — CLAUDE.md forbids a compatibility path without a recorded removal condition.
- AC 4's grep is tombstone-scoped by design (the legacy parse branches ARE matches for the raw token) — do not "fix" it to a bare zero-matches grep; that fails every time per spec-template's Delete + Tombstone rule.
- [IL-90]: the rename touching N call sites agreeing is exactly when a shared bug reads as the spec — the new fallback tests must be derived from the written contract above, not from what the renamed code happens to do.
- Verify new tests discriminate: revert the fallback branch locally and confirm the legacy-label test fails before trusting it (verify-test-discrimination memory).


<!-- work-fingerprint: parent-issue-vocabulary-rename:contract-layer-rename-to-parent-issue-vocabulary -->
