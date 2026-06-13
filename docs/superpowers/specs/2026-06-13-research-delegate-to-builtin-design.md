# Design — Migrate `/claude-tweaks:research` to delegate to the built-in `/deep-research`

**Date:** 2026-06-13
**Status:** Approved (brainstorming) — ready for implementation planning
**Target version:** 4.15.0 (minor bump; baseline is 4.14.0 after the bash-filter removal)

## Problem

The `/claude-tweaks:research` skill is the largest and only dependency-bearing skill in the
plugin: 32 files, ~7,065 lines, vendored from
[199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill)
(MIT). It carries a Python engine (10 scripts, ~3,400 lines), JSON schemas, HTML/PDF
templates, Python unit tests, and a vendoring contract (`UPSTREAM.md`) with a recurring
upstream-sync maintenance burden.

Claude Code now ships a native **`/deep-research`** command as part of the **Dynamic
Workflows** feature. We want the plugin to adopt that built-in approach and shed the
vendored machinery.

## Research findings (what `/deep-research` actually is)

Verified via web research and a local filesystem scan (2026-06-13):

- `/deep-research` is **not a markdown skill** — no `SKILL.md` for it exists anywhere on
  disk. It is a **bundled Dynamic Workflow** baked into the Claude Code runtime (Claude
  writes a JS orchestration script that fans out parallel subagents, cross-checks sources,
  votes on claim reliability, returns a cited report).
- It is **gated and in research preview** (launched 2026-05-28, requires Claude Code
  ≥ 2.1.154):
  - Paid plans only (Pro / Max / Team / Enterprise; not Free).
  - **Default on:** Max, Team. **Pro:** manual activation via `/config`. **Enterprise:**
    admin enablement.
  - Disable via `/config` toggle, `"disableWorkflows": true` in `settings.json`, or
    `CLAUDE_CODE_DISABLE_WORKFLOWS=1`.
  - When disabled, the command **simply does not exist** in the registry (no error — it is
    absent).
- **Invocation:** not cleanly callable via the Skill tool (it is a workflow, not a skill);
  a SKILL.md cannot "type" a slash command. The automated route is to dispatch a subagent
  whose prompt runs `/deep-research <topic>`. This path is **undocumented for the
  plugin→Task case** — per the approved design we **assume invocation works** and do not
  gate on a spike.
- **Detection:** no official runtime API. A Bash pre-check (version + settings + env)
  catches explicit disables but cannot detect plan-gating or "Pro user never enabled it,"
  so a try-and-fallback is still required.
- **Plugin dependency posture:** Claude Code provides no mechanism for a plugin to declare
  a dependency on a preview/workflow feature. Official guidance: treat it as an **optional
  optimization** and build to work with and without it.

Source docs: `code.claude.com/docs/en/workflows.md`, `.../tools-reference.md`,
`.../agent-sdk/slash-commands.md`, `.../skills.md`, `.../commands.md`.

## Goals

1. Remove the vendored Python engine and its maintenance/vendoring burden.
2. Make `/claude-tweaks:research` **delegate to the built-in `/deep-research`** when
   available, preserving the plugin's namespace, output convention, and lifecycle handoffs.
3. **Fall back to a lean inline model-driven method** when the built-in is unavailable
   (Free plan / workflows disabled / older Claude Code), so the skill never hard-breaks.
4. Preserve markdown report artifacts under `.claude-tweaks/research/`.

## Non-goals

- HTML/PDF report generation (dropped).
- Deterministic Python citation/DOI validation (replaced by a model self-check).
- Continuation/resume state and `evidence.jsonl` persistence (dropped).
- Source-credibility scoring scripts (dropped).
- A spike to prove the subagent-runs-slash-command path (we assume it works per approval).

## Design

### New skill shape (2 files, was 32)

- **`skills/research/SKILL.md`** (rewritten) — frontmatter, When to Use, input + mode
  picker, the delegate→fallback workflow, an "Enabling the built-in path" setup note,
  Anti-Patterns, Relationship table, Component-Skill Contract, Next Actions.
- **`skills/research/reference/methodology.md`** (rewritten, lean) — the inline fallback
  loop plus the salvaged citation discipline.

**Delete:** `scripts/` (10 `.py`), `schemas/`, `templates/`, `tests/*.py` + fixtures,
`requirements.txt`, `UPSTREAM.md`, `LICENSE-UPSTREAM`, and
`reference/{continuation,html-generation,report-assembly,weasyprint-guidelines,quality-gates}.md`.
Salvage the citation rules out of `quality-gates.md` into `methodology.md` before deleting.

### Core workflow

1. Resolve topic + depth tier from `$ARGUMENTS` (mode picker if no `--mode=`).
2. **Availability pre-check (Bash):** Claude Code ≥ 2.1.154 ·
   `CLAUDE_CODE_DISABLE_WORKFLOWS` ≠ 1 · no `disableWorkflows: true` in user/project/local
   `settings.json`.
3. **Available → delegate:** dispatch a subagent that runs `/deep-research <topic>` (assume
   invocation works); capture its cited report.
4. **Unavailable or empty result → inline fallback:** run the lean loop in
   `methodology.md` — decompose into 5–10 angles → parallel `WebSearch` → `WebFetch`
   extract evidence → adversarial-verify subagents per major claim → synthesize.
5. **Write** `report.md` (+ `sources.json`) under
   `.claude-tweaks/research/[YYYY-MM-DD]-[topic-slug]/` — identical path for both branches.
6. **Next Actions** → `/capture`, `/challenge`, `/specify`.

### Decisions

- **Inline fallback = lean ~6-step loop**, not the heavyweight 8 phases. The built-in
  covers the high end; the fallback only needs to be solid, not exhaustive.
- **Keep all 4 depth tiers** (quick / standard / deep / ultradeep). They shape the
  delegation prompt (how hard to ask the built-in to dig) and the fallback's fan-out budget.
  Retaining them preserves the current UX and avoids churn in the existing tests.
- **Output: markdown `report.md` + `sources.json`** under `.claude-tweaks/research/`. Drop
  HTML/PDF. Keeps the existing output-path test green.
- **Citation validation = model self-check** (replaces `verify_citations.py`): every `[N]`
  in the body resolves to a bibliography entry and vice versa; no fabricated URLs; flag
  single-source claims. No DOI network resolution.
- **Subagent dispatch** (delegation step and fallback verification) follows the plugin
  Subagent Contract (`skills/_shared/subagent-output-contract.md`).

### Salvaged citation discipline (from `quality-gates.md` → `methodology.md`)

Anti-hallucination protocol, "no vague attributions" (never "studies show"; cite
`Smith et al. (2024) [1]`), "label speculation" ("This suggests…" not stated as fact),
admit uncertainty ("No sources found for X") over fabrication, and the precision examples
table.

### Setup documentation

The skill includes an "Enabling the built-in path" note with the gating table (CC version,
plan defaults, how to enable on Pro via `/config`) so users on the manual-activation path
know how to get the better engine. The fallback works regardless.

## File-level migration

- **Cross-references** (keep bidirectional):
  - `CLAUDE.md:37` (utility list — keep), `CLAUDE.md:59` (structure-table row — rewrite: no
    more "Python pipeline / vendored").
  - `README.md` (~L9–20 "What's new" + vendoring note + diagram-design comparison; L174
    catalog entry) — rewrite to the delegation model.
  - `skills/help/reference-card.md:39`, `skills/help/context-flow.md:51` (outputs now
    markdown + sources.json only), `skills/help/SKILL.md:142`.
  - Relationship tables in `capture`, `challenge`, `specify`, `browse` — keep, light edits.
- **Tests:**
  - `tests/research/skill-md.test.js` — drop the Python-invocation assertion; keep the
    `.claude-tweaks/research/` output-path assertion.
  - `tests/research/cross-refs.test.js` — unchanged (skill still exists and cross-refs).
  - `node --test tests/` must pass.
- **Version:** bump `.claude-plugin/plugin.json` to `4.15.0`; add a `## v4.15.0` entry to `CHANGELOG.md`.

## Open implementation risk

The subagent-runs-`/deep-research` invocation path is undocumented for the plugin→Task
case. Per approval we assume it works. If, during implementation, it proves not to execute,
the cheapest degradation is **user-mediated handoff** (skill instructs the user to run
`/deep-research` and ingests the result) — no redesign needed, the fallback method and
output contract are unchanged.

## Acceptance criteria

1. `skills/research/` contains exactly `SKILL.md` and `reference/methodology.md`; no `.py`,
   no `scripts/`, `schemas/`, or `templates/`, no `UPSTREAM.md` or `LICENSE-UPSTREAM`.
2. SKILL.md workflow: pre-check → delegate-when-available → inline-fallback → write markdown
   → Next Actions; includes the setup note and follows the standard SKILL.md structure
   (frontmatter, interaction directive, anti-patterns, relationship table, CSC).
3. Running the skill with workflows enabled delegates to `/deep-research`; with workflows
   disabled it runs the inline method; both write `report.md` under `.claude-tweaks/research/`.
4. All cross-references updated and bidirectional; `README.md` and `/help` in sync.
5. `node --test tests/` passes.
6. `.claude-plugin/plugin.json` version is `4.15.0` and `CHANGELOG.md` has a `## v4.15.0` entry.
