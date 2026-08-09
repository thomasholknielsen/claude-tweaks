# Criteria: Docs Diátaxis Genre-Drift + Depth-Mismatch + Staleness + Findability

Shared, criteria-only fragment — the "what is worth flagging in `docs/**`" knowledge for `/claude-tweaks:docs-health` and `/claude-tweaks:wrap-up` (its Docs curation row's D1 reuses the identical procedure inline, judging docs touched by the current work plus a domain-overlap top-N). No workflow, no subagent dispatch, no Next Actions. Encodes the Diátaxis framework (tutorial / how-to / reference / explanation) as a genre-drift check, plus a factual-staleness check, plus dual-persona misleading-risk tagging — three dimensions a manual one-off Diátaxis audit found real drift with in a downstream project (two "reference" docs that were secretly how-to walkthroughs, unmarked roadmap content in a reference doc, a section index stating a stale item count for 4+ months) — plus a depth-mismatch check, added in a later refinement informed by independently-converged prior art in a sibling project's docs-portal build. A further refinement, informed by the same sibling project, strengthened genre-drift with a placement-fit sub-check, strengthened staleness with author-declared freshness-dependencies, and added a findability dimension (informed by that project's own build-time nav-coverage gate).

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

**Placement-fit — a second, independent comparison.** The implied-type derivation above combines location and heading language into one signal, so a correctly-labeled doc (heading matches content) can still be filed under the wrong directory without ever being flagged — e.g. a genuinely how-to-shaped doc, correctly titled "How to X," sitting under `docs/reference/`. Derive a second implied type from directory alone (ignoring heading language entirely, using the same location-based mapping above) and compare it against found type independently of the heading comparison. A divergence here is still `category: "genre-drift"`, but is typically `classification: "restructural"` since the fix is moving the file to the directory matching its actual genre, not editing a sentence.

## Dimension 2 — Staleness (stated facts vs. live reality)

Docs assert facts that can go stale independently of prose quality: item counts ("N skills," "M endpoints"), "as of {date}" markers, version numbers, feature-availability claims, links to files/paths that may have moved or been deleted. Check each stated fact against the live repository state:

- A stated count — grep/count the actual thing and compare.
- A referenced file/path — confirm it still exists at that location.
- A version or "as of" marker — compare against the current state; flag if stale by more than a trivial margin.
- A "coming soon" / "not yet implemented" marker on something that has since shipped (or vice versa).

The canonical failure shape from the original audit: a section index page stating a stale item count for 4+ months, self-acknowledging the gap in its own text the whole time.

**Freshness-dependencies — an author-declared alternative to inferred grep targets.** A doc may declare a `files:` frontmatter list (the same field and shape journey docs already use for `/review`'s regression detection — see `journeys/journey-template.md`) naming repo-relative paths it depends on. Check each declared path via `bin/lib/docs-health/freshness.js#checkTrackedFreshness`: does it still exist (a missing path is its own staleness finding), and has it changed more recently than this doc's last-audit cursor? A tracked path that changed since the last audit is strong staleness evidence — judge whether the change is substantive enough to actually invalidate what the doc claims (a trivial reformat doesn't; a rewritten function signature does), the same "would this actually mislead" bar this fragment uses throughout.

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

## Dimension 5 — Findability (reachability)

A doc that's factually accurate, correctly genred, and appropriately deep is still unhealthy if nobody — human or agent — can ever find it. Check the doc's inbound-reference count via `bin/lib/docs-health/findability.js#computeInboundReferences`: how many files under `docs/**`, `README.md`, or `CLAUDE.md` — the actual places a reader would navigate from — reference this doc's filename. This is a mechanical, repo-scoped signal, not a whole-web search — it can't detect an external inbound link, and it isn't meant to.

A near-zero count is a candidate orphan, not an automatic finding. Judge whether it's genuinely unreachable in a way that would block a real reader or agent from finding it when they need it, or whether it's intentionally standalone — an explicit draft/archived/template marker, or a doc that's meant to be reached only via direct link from outside this check's scope. The canonical failure shape: a doc that was clearly written to be read (full prose, a real heading, real content) but has zero paths leading to it from anywhere in the project's own docs, README, or CLAUDE.md — indistinguishable, from a reader's perspective, from a doc that was never written at all.

Emit as `category: "findability"`.

## Emitting a finding

Each finding carries: `target` (the doc's id, e.g. `decisions/0007-foo`), `assetType` (always `"doc"`), `section` (the heading within the doc, or `"Freshness"` for a whole-doc staleness finding with no single section), `category` (`"genre-drift"` — Dimension 1, including placement-fit; `"staleness"` — Dimension 2, including freshness-dependencies; `"depth-mismatch"` — Dimension 3; `"findability"` — Dimension 5; pick whichever the finding is actually about), `misleads` (`"human"` | `"agent"` | `"both"` — Dimension 4), `classification` (`"additive"` | `"restructural"` — same vocabulary as harness-health: a one-line fact correction or an added disclaimer is `additive`; reorganizing a doc that mixes genres, or splitting a doc, is `restructural`), `confidence`, `reversibility`, `description` (the acceptance criteria — what "fixed" looks like), `reason` (the evidence — why this was flagged), `oldString`/`newString` (the patch itself — `oldString` may be empty for a pure addition), and may optionally carry `relatedSections` (an array of non-empty strings — sibling `section` values sharing this finding's root cause; see `/claude-tweaks:docs-health`'s bundling rule).

## What is worth flagging

- A doc whose implied type (by location/heading) doesn't match its found type (by content shape), where the mismatch would actually mislead a reader.
- A doc with a non-Diátaxis-native genre (ADR, structured spec/journey, retrospective/log) that has drifted out of its own native genre into something else.
- Unmarked forward-looking/roadmap content presented as shipped.
- A doc whose actual word count would surprise a reader given what its location, heading, and native genre imply (e.g., an "Overview" that's actually deep reference-depth content).
- A stated fact (count, date, path, version, availability) that no longer matches live repository state.
- A doc filed under a directory that doesn't match its actual content genre, independent of what its own heading claims.
- A doc whose declared `files:` dependency no longer exists, or has changed substantively since the doc's last audit.
- A doc with a near-zero inbound-reference count that would genuinely block discovery — not an intentionally standalone doc.
- A doc that has explicitly and visibly acknowledged its own staleness in its own text without being fixed (the "self-acknowledging gap" pattern).

## Constraints (what NOT to flag)

- **Content quality is not this check's job.** Judging whether prose is well-written, whether an explanation is clear, or whether a tutorial's pacing is good is not genre-drift, depth-mismatch, findability, or staleness — don't flag it here. This mirrors `_shared/work-record.md`'s spec-shaped-body check: structural-plus-minimal, not editorial.
- **Length alone is never a finding.** A doc that's long — or short — but correctly signals its depth (a Reference or Deep-dive doc being long, an Overview being short) is not a depth-mismatch finding regardless of its absolute word count. Only the *mismatch* between implied and found depth is judged.
- **Findability is repo-scoped, not a link-checker.** The inbound-reference count only searches `docs/**`, `README.md`, and `CLAUDE.md` — it cannot detect external links, and a doc reachable only via a link outside that scope will read as an orphan. This is a deliberate simplicity tradeoff, not a bug to fix by expanding the search scope. Common basenames (`index.md`, `README.md`) are especially prone to over-counting — a link to a *different* folder's same-named file still registers as a reference, which is a safe direction for a report-only signal (it can miss orphans, never invent them) but worth knowing about.
- **Don't flag mechanical/unambiguous issues.** Broken links, malformed frontmatter, and missing structural metadata belong in the consuming project's own build/CI pipeline — the same "CI stays reactive" boundary `code-health` already draws for code. Only flag genre-drift, depth-mismatch, findability, and factual staleness, which require holistic judgment (the word count itself is computed mechanically; only the judgment of whether it's surprising given context is holistic).
- **`docs/superpowers/**` is out of scope entirely** — it is never in the rotation pool `bin/lib/docs-health/scope.js` builds, so this fragment never sees it. If it somehow appears in a batch, do not judge it: it is ephemeral `/specify` + `/superpowers:writing-plans` build history, not Diátaxis-portal content.
- **`.claude/skills/**`, `.claude/rules/**`, and `CLAUDE.md` are `harness-health`'s territory**, not this fragment's — docs-health's rotation pool structurally never includes them (it only ever walks `docs/`), so this should never come up, but if a project mirrors skill docs into `docs/**` as a portal section, judge that copy's genre-shape, depth, and staleness like any other doc — never its harness-accuracy or template-conformance, which stays `harness-health`'s job.
