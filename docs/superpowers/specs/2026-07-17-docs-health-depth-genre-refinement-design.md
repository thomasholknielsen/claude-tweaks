# docs-health: depth-mismatch + genre-drift refinement — Design

**Goal:** Sharpen `docs-health`'s existing genre-drift judgment (avoid false positives on docs whose
native genre isn't one of the four Diátaxis types) and add a new, mechanically-anchored
depth-mismatch dimension — both in service of what "docs health" actually means: not just facts
being correct, but docs being structurally shaped the way their location/heading leads a reader
(human or agent) to expect.

**Architecture:** Two changes to `_shared/criteria-docs-diataxis.md`'s judgment prose (native-genre
exemption + misleading-risk bar for Dimension 1; a new Dimension 3 for depth-mismatch), one new
mechanical helper (`bin/lib/docs-health/depth.js`, word-count-only, no LLM), one new `category` enum
value, and matching `docs-health/SKILL.md` Step 3 procedure updates. No changes to target selection,
dedup, fingerprinting, or scoring — a depth-mismatch finding flows through the exact same
SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline every other finding already uses.

## Motivation

`docs-health` (shipped for issue #36) currently judges two dimensions: genre-drift (implied
Diátaxis type vs. found type) and staleness (stated facts vs. live repo state), with an explicit
non-goal: "content quality is not this check's job."

Two gaps surfaced from a forward-looking brainstorm about what "docs health" should mean for a
skill designed to be **project-agnostic** — general enough to run against any project, not tuned to
this repo:

1. **Genre-drift's current trigger is too blunt.** It assumes every doc has an implied Diátaxis
   type inferable from location/heading, and flags any implied-vs-found mismatch. But some docs
   have a genuinely different native genre — a decision record (ADR-shaped: Status/Context/
   Decision/Consequences), a structured spec or journey (Persona/Goal/Steps/Acceptance-Criteria),
   a dated retrospective/log — and forcing a tutorial/how-to/reference/explanation classification
   onto them produces false positives. This repo's own `docs/decisions/*.md` is exactly this case
   today.

2. **"Digestibility" — is a doc structurally shaped for how much reading investment it demands —
   isn't judged at all.** An "Overview"-implied doc that's secretly 2,000 words of dense reference
   material misleads a skimming reader the same structural way a genre mismatch does, but the
   current criteria fragment has no dimension for it.

**Prior art.** A sibling project (memenu-app's Nextra docs portal, specs 299-302) independently
built a mechanical depth classifier (`content-depth.ts` — Overview/Reference/Deep-dive computed
from word count, frontmatter-overridable) as build-once portal infrastructure. Separately, an
in-progress content-quality audit there (spec 318, unmerged) ran a near-identical genre-drift check
against a much larger corpus and converged on the same two refinements independently: only flag a
type mismatch when it would *actually* mislead a reader, and exempt non-Diátaxis-native genres from
forced classification rather than assuming every doc has one. That the same fixes emerged
independently from real production use is good signal they generalize, not just fit one corpus.

Both improvements below are refinements to the existing report-only, LLM-judged, per-doc
architecture — not a new mechanism. See Non-Goals for the two related ideas that came up during
the brainstorm and were deliberately left out of this design.

## Non-Goals

- **Orphan/unreachable-doc detection** (a doc nobody links to, invisible regardless of content
  quality) — genuinely useful, but it needs the whole doc graph, not just the one target doc the
  current SELECT→JUDGE loop reads. It's also purely mechanical (a grep-for-inbound-references
  problem, no LLM judgment needed) — a different kind of check than either existing dimension.
  Parked as a possible small addition to `next-target`'s selection heuristics (a `why: "orphan"`
  signal), not built here.
- **Agent-chunk self-containment** (does a section depend on unstated context from elsewhere in the
  doc, such that an isolated retrieval hit would mislead a chunk-consuming agent) — the most
  interesting idea raised, and deliberately left out. It's a craft/writing judgment, not a
  fact-check, and sits closest to the "content quality is not this check's job" line the original
  design drew on purpose. Left as an open question pending a concrete, bounded trigger condition —
  not committed to.
- **No hardcoded per-project depth thresholds or section-to-genre tables.** Unlike memenu's
  `content-depth.ts` (tuned to their specific nav sections) this stays project-agnostic: the
  mechanical helper computes a raw word count, and the LLM interprets it against what *this* doc's
  own location/heading/genre implies — no universal "300 words = overview" style bucket that
  wouldn't generalize across projects with very different normal doc lengths.
- **No changes to fingerprinting, dedup, cursors, or scoring.** `depth-mismatch` findings reuse the
  existing `additive`/`restructural` → risk/effort mapping unchanged; a new `category` value doesn't
  need a new scoring branch.

## Dimension 1 refinement (genre-drift)

Two changes to the existing Dimension 1 prose in `_shared/criteria-docs-diataxis.md`:

**Native-genre exemption.** Before comparing implied type to found type, first check whether the
doc has a self-evident non-Diátaxis-native genre: ADR/decision-record shaped, structured
spec/journey shaped, or dated retrospective/log shaped. This is a content-shape check — directory
naming (`decisions/`, `adr/`, `journeys/`, `retrospectives/`) is a hint that raises attention, never
a verdict on its own, so this doesn't regress into a project-specific path table the way memenu's
per-section override table is. If the doc matches one of these native shapes, don't force a
Diátaxis classification — spot-check that it still reads as its own native genre, and flag only if
it's drifted *out* of that genre into something else.

**Misleading-risk bar.** For docs that do get compared against implied type, only flag a mismatch
when it would actually mislead a reader or leave the doc's purpose unserved — not any abstract type
mismatch. A reference doc with a short embedded quick-start is not automatically a finding.

## Dimension 3 (new): depth-mismatch

**Mechanical anchor.** `bin/lib/docs-health/depth.js` exports `computeWordCount(content)` — a pure,
testable function, no LLM involved, no separate caller-supplied override parameter. It parses and
strips YAML frontmatter first, then checks the frontmatter for a `depth-hint:` key (docs-health's
own field name — chosen to avoid colliding with a project's pre-existing `depth:` convention, e.g.
memenu's own portal, which uses `depth:` for its own different tier-override semantics). If
`depth-hint:` is present, its literal string value is returned as-is (ground truth, no further
computation — mirrors how genre-drift already treats explicit signals as authoritative over
inference). Otherwise, fenced code blocks are stripped from the remaining body and a plain integer
word count is returned.

**No universal tier buckets.** The LLM receives the raw word count as a data point, not a
pre-labeled tier (unlike memenu's fixed-threshold buckets — see Non-Goals). It judges whether *this*
doc's word count is surprising given what its location, heading, and native genre (as determined by
Dimension 1's now-explicit check) lead a reader to expect walking in — the same "would this
actually mislead" bar Dimension 1 uses.

**What this catches:** an "Overview"/"Getting Started"-implied doc that's actually dense
multi-thousand-word reference material with no signal to a skimming reader that they're not in
Kansas anymore. **What this explicitly does not catch:** a doc that's long *and* correctly signals
it (a Reference or Deep-dive doc being long is expected, not a finding). This stays a structural/
expectation check, not a backdoor into "this doc is too long" prose-quality judgment — same
constraint Dimension 1 already states.

**Finding shape:** new `category: "depth-mismatch"` value alongside `genre-drift`/`staleness`.
`misleads` and `classification` apply exactly as before — a fix might be `additive` (a one-line
scope disclaimer, trimming a tangential section) or `restructural` (splitting an overloaded doc into
an overview + a separate deep-dive).

## Code changes

| File | Change |
|---|---|
| `bin/lib/docs-health/validate-finding.js` | Add `"depth-mismatch"` to `CATEGORY_VALUES` |
| `bin/lib/docs-health/depth.js` (new) | `computeWordCount(content)` — strips frontmatter, returns `depth-hint:` value if present else strips fenced code blocks and returns a plain integer word count |
| `skills/docs-health/SKILL.md` Step 3 | New sub-step: native-genre-exemption check (before implied/found comparison). New sub-step: depth-mismatch computation (call `depth.js`) + judgment. Finding-shape JSON comment's `category` enum line updated. |
| `_shared/criteria-docs-diataxis.md` | Dimension 1 rewritten per above; new "Dimension 3 — Depth-mismatch" inserted; existing "Dimension 3 — Misleading-risk tagging" renumbers to Dimension 4; `category` enum and "What is worth flagging"/"Constraints" bullets updated. |

No changes to `fingerprint.js`, `cache.js`, or `issue-payload.js`'s `CLASSIFICATION_SCORING` — all
three are category-agnostic already.

## Testing

- New `bin/lib/docs-health/tests/depth.test.js`: word count with/without code fences, `depth-hint:`
  frontmatter precedence, empty-doc edge case.
- `validate-finding.test.js` gets one added case accepting `category: "depth-mismatch"`.
- No new integration/E2E surface — this reuses the existing SELECT→JUDGE→VERIFY→DEDUP→FILE pipeline
  unchanged, so `cli-validate-findings.test.js`/`skill-md.test.js` need no structural changes beyond
  fixture updates if either enumerates the category enum literally.
- `npm test` must stay green including the new file.

## Known Touch Points

- `skills/help/reference-card.md`, `README.md` — docs-health's one-line description doesn't name
  specific dimensions, so likely no change needed; verify at plan time.
- `skills/docs-health/SKILL.md`'s own "Anti-Patterns" table — may need a row for the new
  "flagging prose length as a finding" boundary, mirroring the existing "flagging prose quality"
  row, so the depth-mismatch/content-quality distinction is explicit there too, not just in the
  criteria fragment.
