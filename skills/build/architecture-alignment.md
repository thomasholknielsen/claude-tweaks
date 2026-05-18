# Architecture Alignment Check — full procedure

Common Step 4.5 of `/claude-tweaks:build`. Compare what was actually built to what the spec or design doc said to build. Implementation often drifts from the plan — sometimes for good reasons, sometimes not. Catch it here before verification locks it in.

## Check

1. Read the spec (or design doc) and identify its stated architectural approach — the "how" decisions: patterns chosen, boundaries defined, data flow described
2. Compare against the actual implementation — scan the files created/modified for structural alignment
3. Note any deviations

## Classification

Classify every deviation, then present ONE batch decision table (per CLAUDE.md "Multi-item decisions" convention). Pre-fill a recommended classification per row and offer "apply all / override."

For each deviation, the three valid classifications are:

| Classification | Meaning | Effect on the spec | Effect on the implementation |
|---|---|---|---|
| **Beneficial** | The deviation is an improvement on the spec's intent | Update spec to match reality; document why in commit message so /wrap-up can reflect | Keep as-built |
| **Fix now** | The deviation contradicts the spec's intent | Spec unchanged | Revert/fix the implementation to match the spec |
| **Update the spec** | The spec was wrong or incomplete; reality is correct | Update spec to match reality | Keep as-built |

## Interactive mode — single batch table

```
Architecture deviations — {N} found. Recommended classifications pre-filled:

| # | Deviation | What the spec said | What was built | Recommended |
|---|-----------|--------------------|----------------|-------------|
| 1 | {short label} | {spec text} | {actual} | {Beneficial / Fix now / Update the spec} |
| 2 | ... | ... | ... | ... |

1. Apply all **(Recommended)**
2. Override specific rows (tell me which #s to reclassify and to what)
```

After resolution, apply each row's classification per the table above. "Beneficial" still requires action — never just "note it"; that loses the insight.

## In `auto` mode

Apply the `Architecture alignment (/build Common Step 4.5)` row from the silences table in `_shared/auto-mode-contract.md`. Stage non-AUTO rows to `staged/build-deviation-{N}.md` and surface them at the Wrap-Up Review Console. Log every auto-applied and staged row to the auto-decision log per the standard skill-integration pattern.

## Skip this step if

- Design mode with no formal spec (no stated architecture to compare against)
- The plan was trivial (< 3 tasks, single-file changes)

## Skill Observation

While checking architectural alignment, also compare against relevant project skills:

1. Identify 0-3 skill files in `.claude/skills/` covering patterns related to what was built
2. Quick-scan their Key Patterns and Project Conventions sections only
3. If the implementation diverges from or extends what the skill documents, append a ledger entry with phase `build/skill`
4. Keep it light — one sentence per entry; `/claude-tweaks:wrap-up` does the deep analysis
5. Skip if no `.claude/skills/` directory exists or the build is trivial
