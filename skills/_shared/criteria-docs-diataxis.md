# Criteria: Docs Diátaxis Genre-Drift + Staleness

Shared, criteria-only fragment — the "what is worth flagging in `docs/**`" knowledge for `/claude-tweaks:docs-health`. No workflow, no subagent dispatch, no Next Actions. Encodes the Diátaxis framework (tutorial / how-to / reference / explanation) as a genre-drift check, plus a factual-staleness check, plus dual-persona misleading-risk tagging — the three dimensions a manual one-off Diátaxis audit found real drift with in a downstream project (two "reference" docs that were secretly how-to walkthroughs, unmarked roadmap content in a reference doc, a section index stating a stale item count for 4+ months).

## Dimension 1 — Genre-drift (implied type vs. found type)

Every doc has an **implied type** — inferred from its location (a file under a directory or section named "reference", "guide", "how-to", "tutorial", "explanation", "concepts", "background") or its own heading/title language ("Reference:", "How to...", "Getting Started", "Understanding..."). Compare the implied type against the **found type** — what the content actually does:

| Diátaxis type | What it actually does |
|---|---|
| Tutorial | Walks a beginner through a concrete learning exercise, start to finish |
| How-to guide | Gives goal-directed steps to accomplish a specific task, assumes some competence |
| Reference | States facts — API shapes, config keys, field tables — with no narrative or step sequence |
| Explanation | Discusses why, context, background, tradeoffs — no steps, no fact tables |

A doc whose implied type and found type diverge is genre-drift. The canonical failure shape from the original audit: a "reference"-section doc that is actually 1000+ lines of procedural how-to instructions before a single reference-shaped paragraph. Also flag: unmarked forward-looking/roadmap content in a doc that reads as describing shipped, current functionality — a reader (human or agent) cannot tell the difference between "this exists" and "this is planned" without an explicit marker.

## Dimension 2 — Staleness (stated facts vs. live reality)

Docs assert facts that can go stale independently of prose quality: item counts ("N skills," "M endpoints"), "as of {date}" markers, version numbers, feature-availability claims, links to files/paths that may have moved or been deleted. Check each stated fact against the live repository state:

- A stated count — grep/count the actual thing and compare.
- A referenced file/path — confirm it still exists at that location.
- A version or "as of" marker — compare against the current state; flag if stale by more than a trivial margin.
- A "coming soon" / "not yet implemented" marker on something that has since shipped (or vice versa).

The canonical failure shape from the original audit: a section index page stating a stale item count for 4+ months, self-acknowledging the gap in its own text the whole time.

## Dimension 3 — Misleading-risk tagging (dual persona)

For every finding, judge who it misleads and how badly, as a fact independent of category:

- **`human`** — a human reader skims the title, catches inconsistencies from surrounding context, or notices a caveat buried in prose. Misleading risk is real but partially self-correcting.
- **`agent`** — a coding agent consuming this doc via retrieval (a chunked search hit, not a full read-through) has no "skim the title, notice the caveat" safety net. A stale fact or wrong genre-shaped chunk is taken at face value. This is the higher-stakes case — weight it accordingly when judging `classification`/`confidence`.
- **`both`** — misleads either reader equally.

In the original audit, 2 of 5 findings flagged agent-risk as primary — treat this as a real, common outcome, not an edge case.

## Emitting a finding

Each finding carries: `target` (the doc's id, e.g. `decisions/0007-foo`), `assetType` (always `"doc"`), `section` (the heading within the doc, or `"Freshness"` for a whole-doc staleness finding with no single section), `category` (`"genre-drift"` | `"staleness"` — Dimension 1 or Dimension 2, pick whichever the finding is actually about), `misleads` (`"human"` | `"agent"` | `"both"` — Dimension 3), `classification` (`"additive"` | `"restructural"` — same vocabulary as harness-health: a one-line fact correction or an added disclaimer is `additive`; reorganizing a doc that mixes genres, or splitting a doc, is `restructural`), `confidence`, `reversibility`, `oldString`/`newString` (the patch itself — `oldString` may be empty for a pure addition).

## What is worth flagging

- A doc whose implied type (by location/heading) doesn't match its found type (by content shape).
- Unmarked forward-looking/roadmap content presented as shipped.
- A stated fact (count, date, path, version, availability) that no longer matches live repository state.
- A doc that has explicitly and visibly acknowledged its own staleness in its own text without being fixed (the "self-acknowledging gap" pattern).

## Constraints (what NOT to flag)

- **Content quality is not this check's job.** Judging whether prose is well-written, whether an explanation is clear, or whether a tutorial's pacing is good is not genre-drift or staleness — don't flag it here. This mirrors `_shared/work-record.md`'s spec-shaped-body check: structural-plus-minimal, not editorial.
- **Don't flag mechanical/unambiguous issues.** Broken links, malformed frontmatter, and missing structural metadata belong in the consuming project's own build/CI pipeline — the same "CI stays reactive" boundary `code-health` already draws for code. Only flag genre-drift and factual staleness, which require holistic judgment.
- **`docs/superpowers/**` is out of scope entirely** — it is never in the rotation pool `bin/lib/docs-health/scope.js` builds, so this fragment never sees it. If it somehow appears in a batch, do not judge it: it is ephemeral `/specify` + `/superpowers:writing-plans` build history, not Diátaxis-portal content.
- **`.claude/skills/**`, `.claude/rules/**`, and `CLAUDE.md` are `harness-health`'s territory**, not this fragment's — docs-health's rotation pool structurally never includes them (it only ever walks `docs/`), so this should never come up, but if a project mirrors skill docs into `docs/**` as a portal section, judge that copy's genre-shape and staleness like any other doc — never its harness-accuracy or template-conformance, which stays `harness-health`'s job.
