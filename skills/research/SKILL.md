---
name: claude-tweaks:research
description: Use when conducting in-depth web research — multi-source synthesis, citation-audited reports with 4 runtime modes from quick (~2-5 min) to ultradeep (~20-45 min, multi-persona red-team). Delegates to Claude Code's built-in /deep-research when available; falls back to an inline method otherwise. Keywords - research, deep research, web research, sources, citations, literature review.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Research — Deep Web Research with Citation-Audited Reports

Multi-source web research that produces a citation-audited markdown report. When Claude Code's
built-in `/deep-research` **Dynamic Workflow** is available, this skill delegates to it;
otherwise it runs a lean inline method (`reference/methodology.md`). Either path writes the
report under `.claude-tweaks/research/`.

```
                             [ /claude-tweaks:research ] ← utility (no fixed lifecycle position)
                                        ↑
   Used by: /claude-tweaks:capture (research backlog items),
            /claude-tweaks:challenge (back debiasing lenses),
            /claude-tweaks:specify (prior-art lookup),
            ad-hoc research tasks
```

## When to Use

- Research a topic in depth before committing to a design direction.
- Audit prior art / state-of-the-art before authoring a spec.
- Debias a backlog work record with evidence from multiple sources.
- Gather citations for a user journey, RFC, or technical decision.
- Generate a citation-audited markdown report.

## Input

- `$ARGUMENTS` is the research topic. If empty, ask the user for it before proceeding.
- Mode is selected via a single numbered-options prompt (see Mode Picker). **`standard` is the recommended default** — it balances depth and runtime.
- Flags parsed from `$ARGUMENTS`:
  - `--mode=<quick|standard|deep|ultradeep>` — skip the mode prompt.
  - `--output=<path>` — override the default output root (defaults to `.claude-tweaks/research/`).

## Mode Picker

If no `--mode=` flag is present, call `AskUserQuestion` with `question`: `'Mode for "<topic>":'`, `header`: `"Research mode"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Quick"`, `description`: `"~2-5 min, 5+ sources"`
- Option 2 — `label`: `"Standard (Recommended)"`, `description`: `"~5-10 min, 10+ sources"`
- Option 3 — `label`: `"Deep"`, `description`: `"~10-20 min, 15+ sources"`
- Option 4 — `label`: `"Ultradeep"`, `description`: `"~20-45 min, red-team pass + multi-persona critique"`

Then proceed with the selected mode.

## Workflow

1. **Resolve** topic + depth tier from `$ARGUMENTS` (or the Mode Picker).
2. **Construct the output directory:** `{cwd}/.claude-tweaks/research/[YYYY-MM-DD]-[topic-slug]/` unless `--output=` overrides. Create it before researching.
3. **Availability pre-check (built-in path).** Decide whether the built-in `/deep-research` Dynamic Workflow is usable:

   ```bash
   # Built-in /deep-research needs Claude Code >= 2.1.154 and Dynamic Workflows enabled.
   test "${CLAUDE_CODE_DISABLE_WORKFLOWS:-0}" = "1" && echo "workflows: OFF (env)" || echo "workflows: env-ok"
   grep -sq '"disableWorkflows"[[:space:]]*:[[:space:]]*true' \
     ~/.claude/settings.json .claude/settings.json .claude/settings.local.json \
     && echo "workflows: OFF (settings)" || echo "workflows: settings-ok"
   ```

   Treat the built-in as **available** only when neither check reports OFF. (The pre-check catches explicit disables; plan-gating and "never enabled on Pro" are caught by the fallback in Step 5.)
4. **Delegate to the built-in (when available).** Invoke `/deep-research` with the topic, passing depth guidance derived from the tier (for `deep`/`ultradeep`, ask it to dig broadly and cross-check more sources). Capture the cited report it returns. If the command is absent or returns nothing, fall through to Step 5.
5. **Inline fallback (when unavailable or empty).** Read `reference/methodology.md` in this skill's directory and run the lean inline method (decompose → parallel `WebSearch` → `WebFetch` extract → adversarial-verify subagents → synthesize), scaled to the depth tier.
6. **Write the report** to `report.md` (plus a `sources.json` provenance list) in the output directory — identical location for both paths.
7. **Surface progress** with a single status line per phase, then present **Next Actions** with the produced report path.

## Enabling the built-in path

The built-in `/deep-research` produces the highest-quality result. It ships as a **Dynamic
Workflows** feature (research preview) — nothing to install, but it is gated:

| Requirement | Detail |
|-------------|--------|
| Claude Code | ≥ 2.1.154 |
| Plan | Pro / Max / Team / Enterprise (not Free) |
| Default | On for Max & Team · **Pro: enable in `/config` → Dynamic workflows** · Enterprise: admin-enabled |
| Disabled by | `/config` toggle · `"disableWorkflows": true` in settings · `CLAUDE_CODE_DISABLE_WORKFLOWS=1` |

When unavailable, the inline fallback runs automatically — no setup required, lower ceiling.

## Dependency posture

- **Zero-config baseline.** The inline fallback uses built-in `WebSearch`/`WebFetch` and runs
  end-to-end without any external install or the built-in workflow.
- **Enhanced.** When Dynamic Workflows are enabled, the skill delegates to `/deep-research`
  for cross-checked, vote-validated synthesis.

## Next Actions

After the report completes, call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Promote to backlog"`, `description`: `"/claude-tweaks:capture <findings-summary> — promote findings into a backlog work record"`. Suffix the label `(Recommended)` when the topic was exploratory; when it wasn't, leave this — and every other option in this call — unmarked (`AskUserQuestion` doesn't require a Recommended option).
- Option 2 — `label`: `"Debias a problem"`, `description`: `"/claude-tweaks:challenge <record-ref> — use findings to debias a problem"`
- Option 3 — `label`: `"Cite in a new spec"`, `description`: `"/claude-tweaks:specify <spec-name> — cite findings in a new spec"`
- Option 4 (include only if current mode left obvious gaps — otherwise this is a 3-option call, not a 4-option call with a greyed-out or caveated choice) — `label`: `"Re-run deeper"`, `description`: `"/claude-tweaks:research --mode=deep <topic> — re-run in deeper mode"`

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Invoking `deep`/`ultradeep` on a fuzzy one-word topic | Burns time on under-scoped queries. Add a clarifying sentence, or use `quick`/`standard` first to refine scope. |
| Skipping the mode prompt by guessing | The 4 modes differ in runtime by ~10×. Always ask unless `--mode=` is passed. |
| Treating the inline fallback as failure | The fallback is a first-class path, not an error state. Most users without Dynamic Workflows rely on it. |
| Editing reports in place after generation | Reports are dated immutable artifacts. Re-run the skill; the new report gets a fresh dated directory. |
| Hard-depending on the built-in | `/deep-research` is a gated preview feature absent for many users. Never remove the fallback or assume the command exists. |

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:research` is running inside a pipeline (invoked by `/claude-tweaks:capture`, `/claude-tweaks:challenge`, `/claude-tweaks:specify`, or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal).

## Relationship to Other Skills

| Skill | Relationship |
|-------|--------------|
| `/claude-tweaks:capture` | Research findings can be promoted into a backlog work record via the Next Actions block; `/capture` references `/research` as a way to enrich a captured idea before specifying. |
| `/claude-tweaks:challenge` | `/challenge` invokes `/research` to back debiasing lenses with evidence; this skill's reports can be cited as challenge sources. |
| `/claude-tweaks:specify` | `/specify` uses `/research` outputs for prior-art sections; this skill's Next Actions block offers a direct "cite findings in a new spec" path. |
| `/claude-tweaks:browse` | Both are utility skills (no fixed lifecycle position). `/browse` covers interactive browser automation; `/research` covers autonomous multi-source research. |
| `/claude-tweaks:help` | Utility skill — /help lists it in the utility skills table. /research has no fixed lifecycle position; /help may surface it as an option when a backlog record or pending spec would benefit from prior-art research. |
