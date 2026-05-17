---
name: claude-tweaks:research
description: Use when conducting in-depth web research — multi-source synthesis, citation-audited reports with 4 runtime modes from quick (~2-5 min) to ultradeep (~20-45 min, multi-persona red-team). Keywords - research, deep research, web research, sources, citations, literature review.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Research — Deep Web Research with Citation-Audited Reports

ChatGPT-Deep-Research-style multi-source web research. An 8-phase pipeline decomposes the topic, dispatches parallel searchers, validates citations, and synthesizes a structured report. Vendored from [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill) (MIT) — see `UPSTREAM.md`.

```
                             [ /claude-tweaks:research ] ← utility (no fixed lifecycle position)
                                        ↑
   Used by: /claude-tweaks:capture (research INBOX items),
            /claude-tweaks:challenge (back debiasing lenses),
            /claude-tweaks:specify (prior-art lookup),
            ad-hoc research tasks
```

## When to Use

- Research a topic in depth before committing to a design direction.
- Audit prior art / state-of-the-art before authoring a spec.
- Debias an INBOX item with evidence from multiple sources.
- Gather citations for a user journey, RFC, or technical decision.
- Generate a structured report (markdown + HTML + PDF) with audited citations.

## Input

- `$ARGUMENTS` is the research topic. If empty, ask the user for it before proceeding.
- Mode is selected via a single numbered-options prompt (see Mode Picker below). **`standard` is the recommended default** — it balances depth and runtime.
- Power-user flags (parsed from `$ARGUMENTS`):
  - `--mode=<quick|standard|deep|ultradeep>` — skip the mode prompt.
  - `--output=<path>` — override the default output root (defaults to `.claude-tweaks/research/`).

## Mode Picker

If no `--mode=` flag is present, ask exactly this question:

```
? Mode for "<topic>":
  1. quick      (~2-5 min,    5+ sources)
  2. standard   (~5-10 min,  10+ sources)   ← recommended
  3. deep       (~10-20 min, 15+ sources)
  4. ultradeep  (~20-45 min, red-team pass + multi-persona critique)
```

Reply with the user's selection. Then proceed.

## Workflow

1. **Read the methodology.** Open `reference/methodology.md` in this skill's directory for the canonical 8-phase pipeline (decompose → parallel search → citation registry → evidence-mapped outline → section drafting → counter-review → validation → report assembly).
2. **Construct the output directory.** Path is `{cwd}/.claude-tweaks/research/[YYYY-MM-DD]-[topic-slug]/` unless `--output=` overrides. Create it before invoking the engine.
3. **Invoke the engine.** Run `scripts/research_engine.py` with the topic, mode, and output dir. The engine handles phase orchestration, parallel search dispatch, citation tracking via `sources.json`, validate-fix-retry (max 3 cycles) using `scripts/validate_report.py` + `scripts/verify_citations.py`, and HTML/PDF assembly via `scripts/md_to_html.py`.
4. **Surface progress.** As each phase completes, echo a single status line ("Phase N/8: <name> — <status>").
5. **On finish, write the Next Actions block** with the produced report path.

## Dependency posture

- **Zero-config baseline.** Built-in `WebSearch` is the fallback retrieval provider. The skill runs end-to-end without any external installs.
- **Enhanced.** Install `search-cli` (Homebrew: `brew tap 199-biotechnologies/tap && brew install search-cli`) for parallel multi-provider retrieval across Brave / Serper / Exa / Jina / Firecrawl. Configure provider API keys via `search config set keys.<provider> <KEY>`.
- **Optional.** Python 3 + `requirements.txt` for the upstream validators, citation manager, and HTML/PDF generation. Install with `pip install -r skills/research/requirements.txt`.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Invoking `deep` or `ultradeep` on a fuzzy single-word topic | Burns 20+ minutes on under-scoped queries. Add 1 clarifying sentence to the topic, or use `quick`/`standard` first to refine the scope before going deep. |
| Treating the `WebSearch` fallback as failure | The skill is designed to run zero-config. Install `search-cli` only when source breadth is genuinely insufficient — not by default. |
| Editing reports in place after generation | Reports are dated immutable artifacts. Re-run the skill with the updated topic; the new report gets a fresh dated directory. |
| Skipping the mode prompt by guessing | The 4 modes differ in runtime by ~10×. Always ask unless `--mode=` is passed; this is the one decision that genuinely matters. |
| Retrofitting Manifesto / Review Console wrapping | `/research` is a single-skill utility, not a pipeline. The v4.6 bookend architecture does not apply. See `UPSTREAM.md`. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|--------------|
| `/claude-tweaks:capture` | Research findings can be promoted into INBOX items via the Next Actions block; `/capture` references `/research` as a way to enrich a captured idea before specifying. |
| `/claude-tweaks:challenge` | `/challenge` invokes `/research` to back debiasing lenses with evidence; this skill's reports can be cited as challenge sources. |
| `/claude-tweaks:specify` | `/specify` uses `/research` outputs for prior-art sections; this skill's Next Actions block offers a direct "cite findings in a new spec" path. |
| `/claude-tweaks:browse` | Both are utility skills (no fixed lifecycle position). `/browse` covers interactive browser automation; `/research` covers autonomous multi-source research. |
| `UPSTREAM.md` (in this skill's directory) | Captures the vendoring contract — pinned commit, modifications, update runbook, auto-mode posture rationale. |
| `_shared/auto-mode-contract.md` | `/research` opts out of the bookend architecture (no Manifesto, no Review Console). The contract still applies trivially — credentials prompts and BLOCKED states are honored. See UPSTREAM.md for the opt-out rationale. |

### Next Actions

After the report completes, present these options:

1. **Promote findings into INBOX** — `/claude-tweaks:capture <findings-summary>` **(Recommended when topic was exploratory)**.
2. **Use findings to debias a problem** — `/claude-tweaks:challenge <inbox-item>`.
3. **Cite findings in a new spec** — `/claude-tweaks:specify <spec-name>`.
4. **Re-run in deeper mode** — `/claude-tweaks:research --mode=deep <topic>` (only if current mode left obvious gaps).
