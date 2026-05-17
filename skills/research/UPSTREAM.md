# Upstream — claude-deep-research-skill

This skill is vendored from [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill).

| Field | Value |
|-------|-------|
| Source | https://github.com/199-biotechnologies/claude-deep-research-skill |
| Pinned commit | `f2f2c0fa4e7617ca84c86b63f4bb40f77a746933` |
| Commit date | 2026-04-11 |
| Retrieved | 2026-05-16 |
| License | MIT (per README declaration — see `LICENSE-UPSTREAM`) |

## Vendored layout

The upstream tree as vendored at this commit contains:

- `SKILL.md` (replaced by our claude-tweaks-conventions version — see Modifications below)
- `reference/` — 6 markdown files: `methodology.md`, `report-assembly.md`, `quality-gates.md`, `html-generation.md`, `continuation.md`, `weasyprint_guidelines.md`
- `scripts/` — Python tooling: `citation_manager.py`, `evidence_store.py`, `extract_claims.py`, `md_to_html.py`, `research_engine.py`, `source_evaluator.py`, `validate_report.py`, `verify_citations.py`, `verify_claim_support.py`, `verify_html.py`
- `schemas/` — JSON Schemas used by the Python pipeline: `claim.schema.json`, `evidence.schema.json`, `run_manifest.schema.json`, `source.schema.json`
- `templates/` — `report_template.md`, `mckinsey_report_template.html`
- `tests/` — upstream fixtures (untouched)
- `requirements.txt`

## Modifications from upstream

Three surfaces are adapted. All other files run verbatim.

### 1. `SKILL.md` rewritten for claude-tweaks conventions

The upstream `SKILL.md` is replaced wholesale with a claude-tweaks-style skill file (frontmatter, interaction style directive, Anti-Patterns table, Relationship table, Next Actions block). The upstream methodology lives in `reference/methodology.md` (untouched); our SKILL.md delegates to it.

### 2. Output path patched from `~/Documents/` to `.claude-tweaks/research/`

Patched files and the exact diffs are captured below. Re-apply mechanically when pulling a new upstream commit.

**`scripts/research_engine.py`** — line 134:

```diff
-        self.output_dir = Path.home() / ".claude" / "research_output"
+        self.output_dir = Path.cwd() / ".claude-tweaks" / "research"
```

Note: the upstream code uses `pathlib.Path` throughout; the patch stays consistent with that convention. The upstream path was `~/.claude/research_output/` (not `~/Documents/` as the section heading implies — the heading reflects the reference-doc path, not the engine path).

**`reference/report-assembly.md`** — three occurrences patched:

```diff
-# Create folder: ~/Documents/[TopicName]_Research_[YYYYMMDD]/
-mkdir -p ~/Documents/[folder_name]
+# Create folder: .claude-tweaks/research/[YYYYMMDD]-[topic-slug]/
+mkdir -p .claude-tweaks/research/[folder_name]
```

```diff
-- Location: `~/Documents/[TopicName]_Research_[YYYYMMDD]/`
+- Location: `.claude-tweaks/research/[YYYYMMDD]-[topic-slug]/`
```

```diff
-**3. Also save copy to:** `~/.claude/research_output/` (internal tracking)
+**3. Also save copy to:** `.claude-tweaks/research/` (internal tracking)
```

**`reference/continuation.md`** — two occurrences of `~/.claude/research_output/` → `.claude-tweaks/research/` (continuation state location and continuation agent prompt instruction).

**`SKILL.md`** — one occurrence patched (output files section):

```diff
-**Output files (all to `~/Documents/[Topic]_Research_[YYYYMMDD]/`):**
+**Output files (all to `.claude-tweaks/research/[YYYYMMDD]-[topic-slug]/`):**
```

### 3. Mode picker via `AskUserQuestion`

Upstream infers mode from natural-language phrasing ("deep research in ultradeep mode: X"). Our `SKILL.md` instead asks one structured question with 4 options (`standard` recommended).

## Style deviations from claude-tweaks house style

The vendored research skill content is preserved verbatim from upstream, including:

- **Emoji usage** in `templates/report_template.md`, `reference/methodology.md`, `scripts/validate_report.py`, and `scripts/verify_html.py` (status markers like ✅ / ❌ / ⚠️ for PASS/FAIL/WARNING output, GOOD/BAD examples in the report template, and DO/DON'T lists in methodology). claude-tweaks-authored SKILL.md files do NOT use emojis (CLAUDE.md "Don'ts"), but vendored content stays as-is to keep upstream diffs manageable.
- **Voice and section conventions** in `reference/*.md` — long-form prose, heading hierarchy, and instructional style follow upstream's documentation conventions rather than the claude-tweaks SKILL.md template (frontmatter / interaction directive / Anti-Patterns / Relationship tables). Only the top-level `SKILL.md` is rewritten to claude-tweaks conventions; everything under `reference/`, `scripts/`, `schemas/`, and `templates/` stays upstream-shaped.
- **No Anti-Patterns / Relationship tables** in vendored sub-files — those are SKILL.md-level conventions. Sub-files document the pipeline, not the skill's lifecycle position.

When updating the vendored content (see "Updating from upstream" below), do NOT strip emojis, refactor for claude-tweaks voice, or impose Anti-Patterns / Relationship tables on vendored files — preserve upstream exactly so future merges stay mechanical.

## Auto-mode posture

`/research` is a single-skill utility, not a multi-phase pipeline. The v4.6 bookend architecture (Manifesto + Review Console) does NOT apply. The auto-mode contract applies trivially — no decision-worthy mid-flow stops, nothing to log. Do not retrofit Manifesto integration.

## Updating from upstream

1. Fetch the new upstream tarball:
   ```bash
   curl -sL "https://github.com/199-biotechnologies/claude-deep-research-skill/archive/<NEW-SHA>.tar.gz" \
     -o /tmp/upstream.tar.gz
   ```
2. Extract to a scratch dir and `diff -r` against `skills/research/` to see what changed upstream.
3. Re-apply the three modifications above:
   - Keep our `SKILL.md`, `UPSTREAM.md`, `LICENSE-UPSTREAM` (do not let them be overwritten).
   - Re-apply the `research_engine.py` output-path patch using the diff captured in this file.
   - Re-run `grep -r "~/Documents\|Documents/" skills/research/` to catch any new straggler references and patch them.
4. Update the pinned commit + date in the table above.
5. Run the first-run checklist below.

## First-run checklist (manual)

After vendoring or updating:

- [ ] `python3 -m py_compile skills/research/scripts/*.py` — no syntax errors.
- [ ] `grep -r "~/Documents\|Documents/" skills/research/` — empty output.
- [ ] Invoke `/claude-tweaks:research quick test` in a scratch repo with no API keys → produces a markdown report under `.claude-tweaks/research/`.
- [ ] (If `search-cli` is installed) Invoke `/claude-tweaks:research quick test` → confirms parallel multi-provider retrieval is active.
