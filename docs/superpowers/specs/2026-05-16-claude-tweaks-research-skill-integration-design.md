# Design — `/claude-tweaks:research` (deep-research integration)

**Date:** 2026-05-16
**Author:** Thomas Holk Nielsen
**Status:** Approved (brainstorming complete)
**Target version:** 4.7.0 (minor — feature addition)

## Summary

Add a new standalone utility skill `/claude-tweaks:research` to claude-tweaks by vendoring [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill) wholesale and wrapping it in claude-tweaks conventions (interaction style, Anti-Patterns table, Relationship table, Next Actions). Functional with zero deps via Claude's built-in `WebSearch`; enhanced when `search-cli` + provider API keys are installed.

## Goals

- Give claude-tweaks users a ChatGPT-Deep-Research-like capability without leaving their workflow.
- Preserve the upstream skill's strongest design choices: 8-phase pipeline, validate-fix-retry loop, disk-persisted `sources.json`, multi-persona red-team in UltraDeep mode, citation-audited reports.
- Integrate the skill stylistically with the rest of claude-tweaks (interaction style, Next Actions, bidirectional cross-references) without invasively rewriting the upstream pipeline.
- Keep maintenance burden low: pin upstream at a commit; document the few patches we apply; upstream stays the source of truth for pipeline logic.

## Non-goals

- Reimplementing the upstream pipeline in markdown.
- Hooking into the v4.6 bookend architecture (Manifesto + Review Console). `/research` is a single-skill utility, not a multi-phase pipeline.
- Auto-mode contract integration beyond the trivial case (no decision-worthy mid-flow stops; nothing to log).
- Authoring our own search-provider integrations.
- PDF/HTML output customization beyond what upstream already supports.

## User-facing behavior

### Invocation

```
$ /claude-tweaks:research GraphQL federation

? Mode for "GraphQL federation":
  1. quick      (~2-5 min,    5+ sources)
  2. standard   (~5-10 min,  10+ sources)   ← recommended
  3. deep       (~10-20 min, 15+ sources)
  4. ultradeep  (~20-45 min, red-team pass)

> 3

Mode: deep
Output: .claude-tweaks/research/2026-05-16-graphql-federation/

Phase 0/8: decomposing query...
Phase 1/8: dispatching 8 parallel searchers...
...
```

- Single `AskUserQuestion` for mode selection (the one knob with ~10× runtime variance).
- Topic comes from `$ARGUMENTS`; if empty, prompt for it before asking mode.
- Power-user flags: `--mode=<quick|standard|deep|ultradeep>` skips the mode prompt; `--output=<path>` overrides the default output root.

### Outputs

- Project-local: `.claude-tweaks/research/[YYYY-MM-DD]-[topic-slug]/`
- Files produced (unchanged from upstream): markdown report (primary), HTML (McKinsey-style, auto-opened), PDF via WeasyPrint, `sources.json`.
- `.claude-tweaks/research/` is added to `.gitignore` — reports are immutable user artifacts, not version-controlled.

### Next Actions block

Context-aware suggestions at the end of every run:
1. **Promote findings into INBOX** — `/claude-tweaks:capture` (Recommended when topic was exploratory).
2. **Use findings to debias a problem** — `/claude-tweaks:challenge`.
3. **Cite findings in a new spec** — `/claude-tweaks:specify`.
4. **Re-run in deeper mode** — `/claude-tweaks:research --mode=deep <topic>`.

## Architecture

### Vendoring strategy

Copy the 199-biotech repository wholesale into `skills/research/` at a pinned commit SHA. The upstream pipeline (`research_engine.py` + 6 sub-files + 7 Python scripts + templates) runs as-is.

We adapt three surfaces only:
1. `SKILL.md` — rewritten to match claude-tweaks conventions.
2. Output path — patched from `~/Documents/[Topic]_Research_[Date]/` to `.claude-tweaks/research/[YYYY-MM-DD]-[slug]/`.
3. Kickoff — single `AskUserQuestion` for mode selection instead of natural-language mode inference.

### File layout

```
skills/research/
├── SKILL.md                    # ADAPTED — claude-tweaks conventions
├── UPSTREAM.md                 # NEW — attribution, pinned commit, modifications
├── LICENSE-UPSTREAM            # NEW — upstream MIT notice
├── reference/                  # COPIED verbatim except report-assembly.md and continuation.md (sed-patched, see Patch points)
│   ├── methodology.md
│   ├── report-assembly.md
│   ├── quality-gates.md
│   ├── html-generation.md
│   ├── continuation.md
│   └── weasyprint_guidelines.md
├── templates/                  # COPIED verbatim
│   ├── report_template.md
│   └── mckinsey_report_template.html
├── scripts/                    # COPIED verbatim except research_engine.py (patched)
│   ├── research_engine.py
│   ├── validate_report.py
│   ├── verify_citations.py
│   ├── source_evaluator.py
│   ├── citation_manager.py
│   ├── md_to_html.py
│   └── verify_html.py
├── tests/                      # COPIED verbatim
│   └── fixtures/
└── requirements.txt            # COPIED verbatim
```

### `SKILL.md` shape

Standard claude-tweaks skill structure:

- YAML frontmatter: `name: research`, `description: Use when conducting in-depth web research — multi-source synthesis, citation-audited reports, 4 runtime modes from quick (~2-5 min) to ultradeep (~20-45 min, multi-persona red-team).`
- Interaction style directive (verbatim from convention).
- H1 + one-line description.
- ASCII position diagram: utility skill (parallel to `/browse`, `/visual-review`).
- **When to Use** — research a topic; audit prior art before specifying; debias an INBOX item; gather sources for a journey or design decision.
- **Input resolution** — `$ARGUMENTS` is the topic; mode via `AskUserQuestion`; flags `--mode`, `--output`.
- **Workflow steps** — delegating: "Read `reference/methodology.md` for the 8-phase pipeline. Invoke `scripts/research_engine.py` with mode and output dir. Surface progress as phases complete. On finish, write `### Next Actions` block."
- **Anti-Patterns table** — examples:
  - Invoking `deep`/`ultradeep` without scoping the topic → burns 20+ min on a fuzzy query.
  - Treating WebSearch fallback as failure → skill is designed to run zero-config.
  - Editing reports in place → reports are dated immutable artifacts; re-run for updates.
- **Relationship to Other Skills table** — bidirectional entries for `/capture`, `/challenge`, `/specify`, `/browse`.
- **Next Actions block** (see User-facing behavior above).

### Patch points

Exactly two surfaces edited after copying upstream:

1. **`scripts/research_engine.py`** — change output root constant. Likely a single function or constant near the top of the file. Captured in `UPSTREAM.md` with line numbers and exact diff so re-applying is mechanical when pulling a new upstream commit.
2. **`reference/report-assembly.md` and `reference/continuation.md`** — `sed` any hardcoded `~/Documents` strings to `.claude-tweaks/research`.

After vendoring, run `grep -r "Documents" skills/research/` to confirm no further occurrences slipped through.

### Bidirectional cross-references

The following SKILL.md files get a new row in their Relationship table pointing to `/research`:
- `skills/capture/SKILL.md`
- `skills/challenge/SKILL.md`
- `skills/specify/SKILL.md`
- `skills/browse/SKILL.md`

Also updated:
- `skills/help/reference-card.md` and `skills/help/context-flow.md` — add `/research` under utility skills + workflow diagram.
- `README.md` — add `/research` to the skills list with one-line description + upstream credit.

## Auto-mode posture

`/research` is a single-skill utility. The v4.6 bookend architecture (Manifesto + Review Console + pipeline run dir) does **not** apply: there is no multi-phase claude-tweaks pipeline here, only the upstream skill's internal 8-phase pipeline (which is mechanical, not decision-worthy).

The auto-mode contract applies trivially: no decision-worthy mid-flow stops means nothing to log to the auto-decision log. The upstream's own validate-fix-retry loop is fully internal and does not surface user decisions.

This is documented explicitly in `UPSTREAM.md` so a future reader doesn't try to retrofit Manifesto integration.

## Attribution & licensing

**Upstream license verification (blocking):** confirm 199-biotechnologies/claude-deep-research-skill is MIT-licensed before merge. If it is not MIT-compatible, fall back to the reference-only integration approach (option 4 from brainstorming) and revisit this design.

**`skills/research/LICENSE-UPSTREAM`** — full upstream MIT notice preserved.

**`skills/research/UPSTREAM.md`** — attribution + maintenance runbook:
- Source URL + pinned commit SHA + date pulled.
- License: MIT (full text in `LICENSE-UPSTREAM`).
- "Modifications from upstream" — exact list: SKILL.md rewritten; `research_engine.py` output path patched (with diff); mode picker added via `AskUserQuestion`.
- "Updating from upstream" runbook: how to re-pull, re-apply patches, smoke-test.

**`README.md`** — credit line: *"Built on [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill) (MIT) — see `skills/research/UPSTREAM.md`."*

**Version bump:** `4.6.4` → `4.7.0` in `.claude-plugin/plugin.json`.

## Testing & verification

### Automated (`node --test tests/research/`)

- `SKILL.md` frontmatter is valid YAML with required fields.
- Mode picker presents 4 options with `standard` as the recommended.
- Output path constructor produces `.claude-tweaks/research/[YYYY-MM-DD]-[slug]/` correctly.
- Slug generation handles spaces, unicode, special chars, very long topics (truncation).
- Bidirectional Relationship table entries exist in `/capture`, `/challenge`, `/specify`, `/browse`.
- Python smoke (if `python3` on PATH): `python3 -m py_compile skills/research/scripts/*.py`.

### Manual (documented in `UPSTREAM.md` "First-run checklist")

- End-to-end run in `quick` mode without API keys → produces a markdown report at the expected path.
- End-to-end run with `search-cli` installed → confirms parallel multi-provider retrieval is active.
- Smoke after pulling a new upstream commit → re-apply patches, re-run quick mode.

### Out of scope

- Validating report content quality (the upstream skill's own validators handle this).
- Testing every search provider (configuration is the user's responsibility).

## Risks

1. **Upstream restructures `research_engine.py`** → our output-path patch breaks. Mitigation: `UPSTREAM.md` captures exact line numbers and diff; re-application is mechanical.
2. **Upstream license is not MIT** → vendoring is invalid. Mitigation: license check is the first step of the implementation plan; abort to reference-only on failure.
3. **`search-cli` install friction** for users wanting full power → unavoidable; documented as optional with WebSearch fallback noted prominently.
4. **Python dependency unfamiliar to claude-tweaks users** → previously markdown + Node only. The skill installation does not require Python; users who want the full pipeline (validators, PDF, multi-provider search) install Python deps from `requirements.txt` themselves. The zero-deps fallback path must be verified during implementation — if `research_engine.py` requires Python to even decide to fall back to WebSearch, that's a real friction point we need to address.
5. **`~/Documents` references in upstream beyond the two known patch points** → reports land in wrong place. Mitigation: `grep -r "Documents" skills/research/` after vendoring; patch any further hits.

## Open questions (none blocking)

- Whether `/research` should write a one-line entry to a global research index (`.claude-tweaks/research/INDEX.md`) for easy discovery across many topics. Defer to post-merge.
- Whether `/wrap-up` and `/tidy` should surface stale research reports. Defer.

## Implementation outline (handed to /writing-plans)

1. License check — verify upstream is MIT.
2. Pin upstream commit; vendor `skills/research/` wholesale.
3. Write `UPSTREAM.md` + `LICENSE-UPSTREAM`.
4. Patch `research_engine.py` output path + `reference/` doc references; `grep` for stragglers.
5. Author `skills/research/SKILL.md` per claude-tweaks conventions.
6. Add bidirectional cross-references to `/capture`, `/challenge`, `/specify`, `/browse`.
7. Update `/help` reference-card, context-flow, and workflow diagram.
8. Update `README.md` (skill list + credit).
9. Add `.claude-tweaks/research/` to `.gitignore`.
10. Author Node tests in `tests/research/`.
11. Bump version to `4.7.0` in `.claude-plugin/plugin.json`.
12. Manual first-run checklist (zero-config + with `search-cli`).
