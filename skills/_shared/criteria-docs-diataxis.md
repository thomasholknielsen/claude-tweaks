# Criteria: Docs Diátaxis Genre-Drift + Staleness

Shared, criteria-only fragment — the "what is worth flagging in `docs/**`" knowledge for `/claude-tweaks:docs-health`. No workflow, no subagent dispatch, no Next Actions. Encodes the Diátaxis framework (tutorial / how-to / reference / explanation) as a genre-drift check, plus a factual-staleness check, plus dual-persona misleading-risk tagging — the three dimensions a manual one-off Diátaxis audit found real drift with in a downstream project (two "reference" docs that were secretly how-to walkthroughs, unmarked roadmap content in a reference doc, a section index stating a stale item count for 4+ months).

## Dimension 1 — Genre-drift (implied type vs. found type)

**First, check for a non-Diátaxis-native genre.** Some docs have a genuinely different native genre that was never meant to fit tutorial/how-to/reference/explanation at all: an ADR/decision-record (Status/Context/Decision/Consequences shaped), a structured spec or journey (Persona/Goal/Steps/Acceptance-Criteria shaped), or a dated retrospective/log. This is a content-shape check — a doc's directory name (`decisions/`, `adr/`, `journeys/`, `retrospectives/`) is a hint that raises attention, never a verdict on its own. If the doc matches one of these native shapes, do not force a Diátaxis classification onto it: spot-check that it still reads as its own native genre, and flag only if it has drifted *out* of that genre into something else (e.g., an ADR that's actually a how-to walkthrough with no Status/Context/Decision structure at all).

Otherwise, every doc has an **implied type** — inferred from its location (a file under a directory or section named "reference", "guide", "how-to", "tutorial", "explanation", "concepts", "background") or its own heading/title language ("Reference:", "How to...", "Getting Started", "Understanding..."). Compare the implied type against the **found type** — what the content actually does:

| Diátaxis type | What it actually does |
|---|---|
| Tutorial | Walks a beginner through a concrete learning exercise, start to finish |
| How-to guide | Gives goal-directed steps to accomplish a specific task, assumes some competence |
| Reference | States facts — API shapes, config keys, field tables — with no narrative or step sequence |
| Explanation | Discusses why, context, background, tradeoffs — no steps, no fact tables |

Flag a mismatch only when the implied type and found type diverge **and** the divergence would actually mislead a reader or leave the doc's purpose unserved — not any abstract type mismatch. A reference doc with a short embedded quick-start is not automatically a finding. The canonical failure shape from the original audit: a "reference"-section doc that is actually 1000+ lines of procedural how-to instructions before a single reference-shaped paragraph. Also flag: unmarked forward-looking/roadmap content in a doc that reads as describing shipped, current functionality — a reader (human or agent) cannot tell the difference between "this exists" and "this is planned" without an explicit marker.

## Dimension 2 — Staleness (stated facts vs. live reality)

Docs assert facts that can go stale independently of prose quality: item counts ("N skills," "M endpoints"), "as of {date}" markers, version numbers, feature-availability claims, links to files/paths that may have moved or been deleted. Check each stated fact against the live repository state:

- A stated count — grep/count the actual thing and compare.
- A referenced file/path — confirm it still exists at that location.
- A version or "as of" marker — compare against the current state; flag if stale by more than a trivial margin.
- A "coming soon" / "not yet implemented" marker on something that has since shipped (or vice versa).

The canonical failure shape from the original audit: a section index page stating a stale item count for 4+ months, self-acknowledging the gap in its own text the whole time.

## Dimension 3 — Depth-mismatch (implied depth vs. found depth)

A doc's location and heading imply not just a genre but a **depth** — how much reading investment a reader should expect before opening it (an "Overview" or "Getting Started" promises a quick read; a "Reference" or "Deep-dive" promises a longer one). Check the doc's actual word count (via `bin/lib/docs-health/depth.js#computeWordCount`, frontmatter and fenced code blocks stripped) against what its location, heading, and native genre (as determined by Dimension 1) lead a reader to expect walking in.

There are no universal word-count thresholds — a "reference" doc might reasonably run 5,000 words of dense tables in one project and be absurd at 500 words in another. Judge whether *this* doc's computed word count is surprising given what *this* doc's own context implies, using the same "would this actually mislead" bar as Dimension 1. If the doc's frontmatter declares an explicit `depth-hint:` value, `computeWordCount` returns that string directly instead of a count — treat it as ground truth and skip the word-count judgment entirely.

The canonical failure shape: an "Overview"/"Getting Started"-implied doc that is actually dense multi-thousand-word reference material, with no signal to a skimming reader that they're not in Kansas anymore. Do NOT flag a doc that is long *and* correctly signals it — a Reference or Deep-dive doc being long is expected, not a finding. This stays a structural/expectation check, not a backdoor into "this doc is too long" prose-quality judgment — see Constraints below.

## Dimension 4 — Misleading-risk tagging (dual persona)

For every finding, judge who it misleads and how badly, as a fact independent of category:

- **`human`** — a human reader skims the title, catches inconsistencies from surrounding context, or notices a caveat buried in prose. Misleading risk is real but partially self-correcting.
- **`agent`** — a coding agent consuming this doc via retrieval (a chunked search hit, not a full read-through) has no "skim the title, notice the caveat" safety net. A stale fact or wrong genre-shaped chunk is taken at face value. This is the higher-stakes case — weight it accordingly when judging `classification`/`confidence`.
- **`both`** — misleads either reader equally.

In the original audit, 2 of 5 findings flagged agent-risk as primary — treat this as a real, common outcome, not an edge case.

## Emitting a finding

Each finding carries: `target` (the doc's id, e.g. `decisions/0007-foo`), `assetType` (always `"doc"`), `section` (the heading within the doc, or `"Freshness"` for a whole-doc staleness finding with no single section), `category` (`"genre-drift"` — Dimension 1, `"staleness"` — Dimension 2, `"depth-mismatch"` — Dimension 3; pick whichever the finding is actually about), `misleads` (`"human"` | `"agent"` | `"both"` — Dimension 4), `classification` (`"additive"` | `"restructural"` — same vocabulary as harness-health: a one-line fact correction or an added disclaimer is `additive`; reorganizing a doc that mixes genres, or splitting a doc, is `restructural`), `confidence`, `reversibility`, `oldString`/`newString` (the patch itself — `oldString` may be empty for a pure addition).

## What is worth flagging

- A doc whose implied type (by location/heading) doesn't match its found type (by content shape), where the mismatch would actually mislead a reader.
- A doc with a non-Diátaxis-native genre (ADR, structured spec/journey, retrospective/log) that has drifted out of its own native genre into something else.
- Unmarked forward-looking/roadmap content presented as shipped.
- A doc whose actual word count would surprise a reader given what its location, heading, and native genre imply (e.g., an "Overview" that's actually deep reference-depth content).
- A stated fact (count, date, path, version, availability) that no longer matches live repository state.
- A doc that has explicitly and visibly acknowledged its own staleness in its own text without being fixed (the "self-acknowledging gap" pattern).

## Constraints (what NOT to flag)

- **Content quality is not this check's job.** Judging whether prose is well-written, whether an explanation is clear, or whether a tutorial's pacing is good is not genre-drift, depth-mismatch, or staleness — don't flag it here. This mirrors `_shared/work-record.md`'s spec-shaped-body check: structural-plus-minimal, not editorial.
- **Length alone is never a finding.** A doc that's long — or short — but correctly signals its depth (a Reference or Deep-dive doc being long, an Overview being short) is not a depth-mismatch finding regardless of its absolute word count. Only the *mismatch* between implied and found depth is judged.
- **Don't flag mechanical/unambiguous issues.** Broken links, malformed frontmatter, and missing structural metadata belong in the consuming project's own build/CI pipeline — the same "CI stays reactive" boundary `code-health` already draws for code. Only flag genre-drift, depth-mismatch, and factual staleness, which require holistic judgment (the word count itself is computed mechanically; only the judgment of whether it's surprising given context is holistic).
- **`docs/superpowers/**` is out of scope entirely** — it is never in the rotation pool `bin/lib/docs-health/scope.js` builds, so this fragment never sees it. If it somehow appears in a batch, do not judge it: it is ephemeral `/specify` + `/superpowers:writing-plans` build history, not Diátaxis-portal content.
- **`.claude/skills/**`, `.claude/rules/**`, and `CLAUDE.md` are `harness-health`'s territory**, not this fragment's — docs-health's rotation pool structurally never includes them (it only ever walks `docs/`), so this should never come up, but if a project mirrors skill docs into `docs/**` as a portal section, judge that copy's genre-shape and staleness like any other doc — never its harness-accuracy or template-conformance, which stays `harness-health`'s job.
