# Parent-Issue Vocabulary Rename — Design

- **Date:** 2026-08-12
- **Origin:** Brainstorm session — "family" wording flagged as not easily understood by
  first-time plugin users
- **Status:** approved in-session, pending written-spec review

## Problem

The decomposition structure — one parent record plus N independently-built child records,
whose acceptance is judged as a whole on the parent — is named with a **mixed metaphor**:
the collective is a "family" (`family:parent` label, "family gate"), but the members are
"leaves" (tree vocabulary). A first-time user has to hold "a family whose children are
leaves," which is neither metaphor working. The vocabulary is user-facing: `[family-gate]`
rows appear in tidy reports, the /help dashboard, and demo flows.

Meanwhile the platform itself already teaches the right words: under `work-links: native`,
the parent issue displays GitHub's own **sub-issues** panel, and the plugin literally calls
the `sub_issues` API. The plugin's vocabulary can match the one users already see on screen.

The leaf side is already half-correct — `facets.parent`, `hasParent`, `parent: <id>`
frontmatter all use parent/child vocabulary. Only the collective noun ("family") and the
member noun ("leaves") deviate.

## Decision

Adopt GitHub's own two-word vocabulary, uniformly on both work-record backends
(user decision: uniform "issue" everywhere, including `local-files`, accepting the slight
backend-purity cost for a single vocabulary). **No collective noun** — the parent stands
for the set ("a parent issue and its sub-issues"), which sidesteps the crowded namespace
(dispatch owns "group", flow/dispatch own "batch"/"bundle").

The gate reverts to its original design name: **parent acceptance gate** (see
`docs/superpowers/plans/2026-08-07-parent-acceptance-gate.md` — the "family" wording crept
in at implementation).

### Vocabulary map

| Layer | Today | Becomes |
|---|---|---|
| Concept (prose) | "decomposition family" | "a parent issue and its sub-issues"; "decomposition" survives only as the verb for what `/specify` does |
| Member noun | "leaf" / "leaves" | "sub-issue(s)" |
| Parent noun | "decomposition parent" / "family's parent" | "parent issue" |
| Gate (prose) | "family gate" / "Family-Gate Procedure" | "parent acceptance gate" / "Parent-Gate Procedure" |
| Report prefix | `[family-gate]` | `[parent-gate]` |
| Scan scope | `family-gate` scope (`_shared/github-pr-scan.md`), tidy Shape 7 | `parent-gate` scope; Shape 7 prose updated |
| GitHub label | `family:parent` ("Structure: decomposition parent — carries the family's acceptance gate") | `parent-issue` ("Structure: parent issue — carries the acceptance gate for its sub-issues") |
| local-files frontmatter | `family-parent: true` | `is-parent-issue: true` |
| Facet key (JS) | `facets.familyParent`, filter `{ familyParent: true }` | `facets.isParentIssue`, `{ isParentIssue: true }` |
| Functions | `familyGateState()` (`bin/lib/issues/acceptance.js`), `parseFamilyLeaves()` (`bin/lib/issues/record.js`) | `parentGateState()`, `parseSubIssues()` |

**Why the `is-` prefix on the boolean only:** leaf records already carry `facets.parent` /
frontmatter `parent: <id>` meaning "the id of my parent." A parent's own boolean named
`parentIssue` would sit beside it and read as another reference. `isParentIssue` can only
be read as class membership. The label needs no prefix — a label on an issue already reads
as "this issue is a …".

**Explicitly untouched:** `facets.parent` / `hasParent` (already correct), the `/stories`
skill, "Claude 5 model family" in `bin/lib/model-profiles/` and CLAUDE.md (unrelated sense),
`demo:*` / acceptance-disposition vocabulary, and `label-bootstrap.md`'s "label families"
phrasing (label-namespace groups like `risk:*` — same word, different concept).

## Contract migration

Precedent: the `effort:` → `size:` rename (#217), whose pattern is already established in
`record.js` — read-side legacy fallback marked permanent with a recorded removal condition
(`[IL-85]`), emit-side new-vocabulary-only (old input throws), documented precedence.

**The one distributed surface is the GitHub label** — adopter repos carry `family:parent`
on their own issues and the plugin updates out from under them. Everything else (code +
skill prose, including `node -e` snippets inlined in agent prompts) ships atomically with
the plugin and renames in one change-set with no aliases.

1. **Read side, permanent fallback.** `parseRecordFacets` recognizes `parent-issue` (new)
   and `family:parent` (legacy) → `facets.isParentIssue`; new beats legacy when both
   present. Same for `local-store.js`'s read of `is-parent-issue:` / legacy
   `family-parent:` frontmatter. Both carry the `[IL-85]` removal-condition comment:
   permanent cross-project support, removable only at a major version that drops
   pre-rename repo support.
2. **Emit side, new-only.** `label-bootstrap.md`'s `LABELS_JSON` swaps in `parent-issue`;
   no code path writes the old label/key again. Following `recordPayload`'s effort
   pattern, the old facet name as input throws with a message naming the rename.
3. **This repo's live labels, one command.**
   `gh label edit "family:parent" --name "parent-issue"` renames the label object itself,
   migrating every issue carrying it — open and closed — atomically. Closed matters: the
   acceptance-gap scope's leaf-suppression queries the label `--state all`.
4. **Adopter nudge.** `family:parent` joins tidy Step 1's legacy-taxonomy retired-label
   list (`[legacy]` shape, GitHub-label-only by design), so adopters get a tidy row
   recommending the same one-command rename. CHANGELOG migration note (the #217 ops-record
   precedent).
5. **Internal renames, no aliases.** `familyGateState()` → `parentGateState()`,
   `parseFamilyLeaves()` → `parseSubIssues()`, plus every skill-prose `node -e` call site —
   same release renames both sides, so an alias would be a compatibility path with no
   consumer.

## Prose sweep

Read-and-judge, not mechanical: ~513 raw case-insensitive "family" hits across ~40 files
include false positives, and "leaves" is an ordinary English verb. Case-insensitive,
bare-word (`[IL-21]`), over `skills/`, `bin/` (comments included), living `docs/`, README,
/help diagrams, and tests.

**Exclusions, path-anchored (`[IL-34]`/`[IL-39]`):**

- `bin/lib/model-profiles/` and CLAUDE.md's "Claude 5 family" — different sense, stays.
- `docs/incident-log.md`, `docs/decisions/*.md`, CHANGELOG, `docs/shipped-versions.tsv` —
  immutable history, never retro-edited.
- This design doc — it necessarily quotes the retired terms (`[IL-28]`).
- `label-bootstrap.md`'s "label families" (label-namespace sense) — flagged so the sweep
  doesn't churn it.

**Cross-reference obligations** (CLAUDE.md rules): `docs/skill-graph.md` edges if any name
the gate; README ↔ /help artifact-lifecycle sync; `_shared/work-record.md` as taxonomy
home updates first so everything else cites it.

## Verification

Named red, per `[IL-105]` — the closing check is not "grep returns nothing" (new terms
legitimately appear everywhere, `[IL-55]`):

1. Exclusion-anchored negative sweep for each retired token — `family:parent`,
   `familyParent`, `family-parent`, `familyGateState`, `parseFamilyLeaves`,
   `[family-gate]` — each verified to fail **before** the rename lands, so the check
   discriminates.
2. A new read-side fallback test proving a legacy `family:parent` label still parses to
   `isParentIssue: true`, mirroring the existing `effort:` fallback test. Same for the
   legacy frontmatter key on the local driver.
3. Full `npm test`, never just the touched suites (`[IL-120]`).

## Version and non-goals

- Minor version bump as its own explicit step (`[IL-12]`); CHANGELOG entry carries the
  adopter migration note.
- **Zero behavior change** — this is a pure rename. `facets.parent`/`hasParent`,
  `/stories`, `demo:*`, and the acceptance-gap machinery are untouched.

## Alternatives considered

- **Epic / stories (Jira vocabulary)** — rejected: hard collision with the plugin's own
  `/stories` skill (user-story YAML for UI testing); "story" meaning two unrelated things
  in one plugin is worse than "family".
- **Decomposition-centric ("a decomposition", members "parts")** — rejected: heavier,
  more abstract; names the origin of the structure rather than the thing users interact
  with, and forgoes the GitHub-UI word match.
- **Keep "family", rename only "leaves" → "children"** — rejected: cheapest and makes the
  metaphor internally consistent, but keeps the word the rename exists to remove.
- **Bare "parent" as the class noun** — rejected: doesn't read as a class of record
  ("parent of what?"); "parent issue" does, and is GitHub's own term.
- **Driver-split phrasing ("parent record"/"sub-record" on local-files)** — offered with a
  recommendation, declined by user in favor of one uniform vocabulary; the slight
  backend-purity cost is accepted.
- **User-facing-only or user-facing+label rename depths** — rejected: prose saying one
  thing while the label or code says another means a first-time user meets both words,
  arguably worse than today.
