# Skill Health Analysis — Shared Procedure

Canonical procedure for judging whether a `.claude/skills/*.md` file still accurately describes the codebase, and for detecting a cohesive, reusable pattern with no skill covering it. Read by three consumers, each supplying its own scope model:

| Consumer | Supplies |
|---|---|
| `/claude-tweaks:skill-health` | One skill-target per firing, selected by churn/staleness rotation (`next-target`) |
| `/claude-tweaks:wrap-up` Step 7 | A finished spec's changed files + ledger/reflection seeds |
| `/claude-tweaks:init` Phase 3/6 | Whole-codebase Phase 2 reconnaissance |

This file owns the judgment. It does not own scope selection, staging destination, or cursor/cache mechanics — those are each consumer's own job.

## Finding Shape

Emit each finding as a JSON object in exactly this shape:

```json
{
  "kind": "patch",
  "skill": "auth",
  "section": "Key Patterns",
  "classification": "additive",
  "confidence": "high",
  "reversibility": "high",
  "description": "The referenced example at src/auth/login.js no longer exists",
  "oldString": "See `src/auth/login.js` for the canonical flow.",
  "newString": "See `src/auth/session.js` for the canonical flow.",
  "reason": "src/auth/login.js was renamed to src/auth/session.js in a prior refactor; the skill still points at the old path."
}
```

For a new-skill candidate, use `"kind": "new-skill"` and replace `section`/`oldString`/`newString` with `"proposedBody"` (the full proposed SKILL.md content, using the Initial Mode template from `/claude-tweaks:init`'s `skill-template.md`):

```json
{
  "kind": "new-skill",
  "skill": "queue-retry-pattern",
  "classification": "additive",
  "confidence": "med",
  "reversibility": "high",
  "description": "Three files under src/jobs/ implement the same retry-with-backoff pattern with no skill documenting it",
  "proposedBody": "---\nname: queue-retry-pattern\ndescription: ...\n---\n...",
  "reason": "src/jobs/emailQueue.js, src/jobs/webhookQueue.js, and src/jobs/syncQueue.js all implement retry-with-exponential-backoff independently — a reusable pattern with no skill covering it."
}
```

Required fields for every finding: `kind` (`patch` | `new-skill`), `skill`, `classification` (`additive` | `restructural`), `confidence` (`high` | `med` | `low`), `reversibility` (`high` | `med` | `low`), `description`, `reason`. `kind: "patch"` additionally requires `section`, `oldString` (empty string `""` allowed for a pure addition with nothing to replace), and `newString`. `kind: "new-skill"` additionally requires `proposedBody`.

**`oldString`/`newString` must be exact, unique, verbatim quotes from the skill file** — not paraphrased "Current/Proposed" prose. The consuming skill applies additive+high-confidence+high-reversibility patches directly via the `Edit` tool, which requires `oldString` to match uniquely; a paraphrased or non-unique quote will fail to apply or apply to the wrong location.

## Step 1: Evidence Pre-Checks (deterministic, before judging)

Before forming any finding, run these mechanical checks and treat their output as evidence the judgment step weighs — not findings themselves:

1. **Stale-example check.** For every backtick-quoted file path or command referenced in the skill (e.g. `` `src/auth/login.js` ``, `` `npm run build` ``), verify it still exists / still works:
   ```bash
   ls "<referenced-path>" 2>&1
   ```
   For commands, check the command exists in `package.json` scripts, a `Makefile`, or is a known binary. A referenced path or command that no longer resolves is strong evidence for a `stale examples` finding — cite the exact `ls`/check output as the finding's evidence, not just "this looks outdated."

2. **Quantified convention-drift check.** For each documented convention or pattern (e.g., "this project always uses X for Y"), grep how many current files actually match it vs. how many files in the same domain don't:
   ```bash
   grep -rl "<pattern-signature>" <domain-dir> | wc -l
   ```
   A convention followed by a small minority of relevant files (e.g., "2 of 15") is quantified evidence of drift — cite the ratio in the finding's evidence field, not just an impression.

Both checks are optional assists — skip gracefully if a referenced path/command genuinely can't be checked mechanically (e.g., a described convention with no clean grep signature). A finding grounded in one of these checks is higher-confidence than one based on reading alone.

## Step 2: The 6-Dimension Check

For the target skill (or, for wrap-up/init, each skill in their own read set), apply all six dimensions:

| Check | Question |
|-------|----------|
| **Pattern accuracy** | Do the skill's Key Patterns still match how the codebase works? |
| **Convention drift** | Do Project Conventions reflect current practice, or has the codebase diverged? (Use the quantified check from Step 1 where a clean grep signature exists.) |
| **Missing patterns** | Has the codebase introduced patterns that belong in this skill but aren't documented? |
| **Stale examples** | Do code examples still exist at the referenced file paths? (Use the stale-example check from Step 1.) |
| **Anti-pattern gaps** | Has the codebase revealed new anti-patterns worth documenting? |
| **Decision framework completeness** | Does the Decision Framework cover the choices the codebase actually makes? |

**Bounded sub-file reads.** If the skill references sub-files (lazy-loaded content, e.g. `init`'s 11 sub-files or `build`'s 6), do not read all of them by default — read only the sub-files whose content plausibly relates to what changed (matched by filename/section keyword against the change source: churned domain paths for the routine, the spec's changed files for wrap-up, Phase 2 findings for init). Note explicitly which sub-files were skipped and why, so a human reviewing the finding can request a deeper read if needed.

## Step 3: New-Skill Gap Detection

Independent of any specific skill's audit, look for a **cohesive** set of files implementing one reusable pattern with **no** skill covering it. "Cohesive" means multiple files implementing the same pattern, not scattered one-off edits — ground this in concrete signals, not impression alone:

- A new top-level directory with 3+ files sharing a naming convention (e.g. `*.queue.js`, `*Repository.ts`).
- A recurring import combination (the same 2+ modules imported together) appearing in 3+ files with no matching skill.
- A commit-message keyword or phrase recurring across 3+ commits, none of which are covered by an existing skill's domain.

## Step 4: New-Skill Qualification Gate

Evaluate each gap candidate (from Step 3, or seeded by a caller — e.g. wrap-up's `[skill: NEW - {name}]` ledger tags) against three criteria:

1. **Reusability** — the pattern applies to 2+ future builds, not a one-off.
2. **Complexity** — the pattern is non-obvious (simple conventions belong in CLAUDE.md, not a skill).
3. **Project-specific** — the pattern is specific to this project, not generic best practice.

**Propose the candidate when at least 2 of the 3 criteria are clearly met.** A candidate meeting all three is a strong recommendation; one meeting exactly two is proposed for human review. A candidate meeting ≤1 criterion is dropped — note which criteria were missing so the decision is auditable.

## Step 5: Verify Gate (adversarial, before staging)

Before a finding is emitted, re-examine it and answer three questions — same discipline `/recon` already applies:

1. **Is it real?** Does the skill actually diverge from the codebase, or did the judge misread the skill's prose or the code's structure?
2. **Is it actionable?** For a patch: is `oldString` an exact, unique quote from the skill file, and does `newString` concretely fix the drift (not "consider updating this")? For a new-skill candidate: is `proposedBody` a real, codebase-grounded SKILL.md, not a generic template?
3. **Does it reproduce?** Given the evidence cited, would a reviewer applying `newString` (or creating the proposed skill) end up with content that's actually correct, without further investigation?

Drop any finding that fails any of the three questions. Log the drop reason. This gate is a judgment step, not mechanical — do not skip it even for a routine firing under no time pressure to rush.

## Step 6: Quality Gates (before finalizing any patch or new skill)

- [ ] Every code example is adapted from actual codebase patterns (not generic).
- [ ] File paths referenced actually exist (post-patch).
- [ ] Commands referenced actually work.
- [ ] Conventions described match what the codebase actually does.
- [ ] No generic advice that adds no project-specific value.
- [ ] Anti-patterns cite project-specific reasons, not textbook warnings.
- [ ] A `kind: "new-skill"` finding's `proposedBody` description starts with "Use when..." and names a clear trigger.

## Anchor Requirement

Every finding must trace to a concrete anchor — a specific referenced path/command that failed the Step 1 check, a quantified drift ratio, a ledger entry, a reflection insight, or a specific changed-file/commit observation. A finding with no concrete anchor is indistinguishable from a hallucinated one — discard it, and note what was discarded and why.
