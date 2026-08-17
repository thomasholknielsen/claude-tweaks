# Flow — Pipeline Summary Template

Loaded by `/claude-tweaks:flow` Step 5 **only on successful completion of all steps** (`wrap-up` in the step list). Never rendered on the failure path — see `failure-cards.md` for that template.

On successful completion of all steps (`wrap-up` in the step list):

```markdown
## Flow: Pipeline Complete

### Spec {number}: {title}

| Step | Outcome |
|------|---------|
| build | Verification passed |
| stories | {Generated N stories | Skipped — no UI changes | Skipped — no-stories} |
| test | {Passed (types + lint + tests) | Passed (QA: N stories) | Passed (verification skipped — passed in build, QA: N stories)} |
| review | Verdict: PASS {(code + visual) | (code only — no browser)} |
| polish | {Invoked N commands ({list}); re-verify passed | Skipped — non-frontend | Skipped — no-polish | Skipped — Impeccable not installed | No changes to apply | re-verify failed (see failure card)} |
| wrap-up | Learnings captured, artifacts cleaned, ledger resolved |

### Key Outputs
- {summary of what was built}
- {summary of review findings, if any}
- {summary of wrap-up actions taken}

### Manual Steps Required
| # | What | Where |
|---|------|-------|
| 1 | {description} | {source} |
(or: No manual steps — nothing to do outside the codebase.)

> Complete these after merging. The pipeline detected them but cannot execute them.

### Actions Performed

{Rolled-up table from all phases. When >15 rows, collapse to per-phase summaries.}

| Action | Detail | Ref |
|--------|--------|-----|
| {rows from build, stories, review, polish, wrap-up phases} | ... | ... |

### Creative Opportunities

The polish phase ran the refinement set + suggestion-driven + intent-driven commands. These could enhance the result further:

| Command | Why it might help |
|---------|------------------|
| `/impeccable:impeccable colorize dashboard` | Heavy monochrome — strategic accent color recommended |
| `/impeccable:impeccable animate settings` | Toggle interactions are static |

Each is a one-shot manual command; flow does not run these automatically.

> Render this block only when `survey` returned `recommendations` non-empty. When the wrapper reports `suppressed > 0`, append: `> N suggestion(s) hidden — previously declined for this spec. Reset with /claude-tweaks:design-wrapper reset-recommendations <spec>.` Omit the entire section when the wrapper returned `recommendations: []` or `{skipped}`, or when `no-creative` was set (the survey never ran).

### Depth Opportunities

The depth survey analyzed the changed modules. These are shallow abstractions worth restructuring — `/flow` did **not** refactor them (architecture is low-reversibility; the depth refactor is a deliberate, interactive pass):

| Module | Kind | Why it's shallow | Leverage |
|--------|------|------------------|----------|
| `src/services/user.ts` | collapse | Pass-through wrapper — every method forwards one call to the DB | 4 callers simpler |
| `src/jobs/runner.ts` | deepen | Callers must call `init()`→`configure()`→`run()` in order; the module could own the sequence | smaller surface, 3 callers |

Run `/claude-tweaks:deepen <changed-paths>` to act on these — it presents candidates, then walks the interface design for the ones you pick. Flow never runs this automatically.

> Render this block only when the depth survey returned candidates. Cap at the top 3 by leverage; if more exist append `> N more lower-leverage candidates — run /claude-tweaks:deepen for the full list.` Omit the entire section when the survey found no shallow modules, the pre-check skipped it (no source modules changed), or `no-deepen` was set.
```

### Next Actions

Close the template's fence above, then assemble the applicable lines (the base 2 always; the two conditional lines only when their trigger condition holds) and render them as plain markdown (docs/skill-authoring.md's Skill handoffs convention), unfenced prose:

**`/claude-tweaks:flow {next spec}`** — full pipeline on spec {N}: "{title}" (recommended)
`/claude-tweaks:help` — full pipeline status
`/claude-tweaks:build {N}` — spec {N} "{title}" now unblocked — when unblocked specs exist
`/claude-tweaks:deepen {changed-paths}` — act on the {N} depth opportunit{y/ies} surfaced above — when the depth survey surfaced candidates
