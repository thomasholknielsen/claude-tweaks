# Harness Health Analysis — Shared Procedure

Canonical procedure for judging whether a project's harness documentation — `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md — still accurately describes the codebase, still conforms to its own origin template, and still follows known best practices for getting an LLM harness to perform well; and for detecting a cohesive, reusable pattern with no skill covering it. Read by three consumers, each supplying its own scope model:

| Consumer | Supplies |
|---|---|
| `/claude-tweaks:harness-health` | One target per firing (skill/rule/claude-md/design-artifact via churn/staleness rotation, `next-target`); memory only via an explicit `--kind memory --memory-dir <path>` invocation, never auto-selected |
| `/claude-tweaks:wrap-up` Step 7 | A finished spec's changed skill files + ledger/reflection seeds (skill-only this phase — see Scope note below) |
| `/claude-tweaks:init` Phase 3/6 | Whole-codebase Phase 2 reconnaissance (skill-only this phase — see Scope note below) |

**Scope note:** all three consumers can read every section of this procedure. `/claude-tweaks:wrap-up` and `/claude-tweaks:init` currently only invoke it against skills (their own scope-selection logic hasn't been extended to pass rule/CLAUDE.md files in) — extending them is a separate, smaller follow-on, not required by the harness-health design. `/claude-tweaks:harness-health` is the only consumer that exercises the rule/claude-md paths today.

This file owns the judgment. It does not own scope selection, staging destination, or cursor/cache mechanics — those are each consumer's own job.

## Finding Shape

Emit each finding as a JSON object in exactly this shape:

```json
{
  "kind": "patch",
  "target": "auth",
  "assetType": "skill",
  "category": "drift",
  "section": "Key Patterns",
  "relatedSections": "<optional array of sibling section names sharing this finding's root cause; omit if there's only one occurrence — patch findings only, see /claude-tweaks:harness-health's bundling rule>",
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
  "target": "queue-retry-pattern",
  "assetType": "skill",
  "category": "drift",
  "classification": "additive",
  "confidence": "med",
  "reversibility": "high",
  "description": "Three files under src/jobs/ implement the same retry-with-backoff pattern with no skill documenting it",
  "proposedBody": "---\nname: queue-retry-pattern\ndescription: ...\n---\n...",
  "reason": "src/jobs/emailQueue.js, src/jobs/webhookQueue.js, and src/jobs/syncQueue.js all implement retry-with-exponential-backoff independently — a reusable pattern with no skill covering it."
}
```

Required fields for every finding: `kind` (`patch` | `new-skill`), `target` (the artifact's id — a skill/rule filename stem, `"CLAUDE"` for CLAUDE.md, `"PRODUCT"`/`"DESIGN"` for a design artifact, or a memory entry's filename stem), `assetType` (`skill` | `rule` | `claude-md` | `design-artifact` | `memory`), `category` (`drift` | `template-conformance` | `best-practice`), `classification` (`additive` | `restructural`), `confidence` (`high` | `med` | `low`), `reversibility` (`high` | `med` | `low`), `description`, `reason`. `kind: "patch"` additionally requires `section`, `oldString` (empty string `""` allowed for a pure addition with nothing to replace), and `newString`, and may optionally carry `relatedSections` (an array of non-empty strings — sibling `section` values sharing this finding's root cause; see `/claude-tweaks:harness-health`'s bundling rule). `kind: "new-skill"` additionally requires `proposedBody` and never carries `relatedSections` — new-skill candidates have no `section` to bundle by. **`new-skill` is the only artifact-creation kind** — rules and CLAUDE.md never get a `"new-rule"` or `"new-claude-md-section"` kind; a "missing pattern" finding against an existing rule or CLAUDE.md is always a `kind: "patch"` addition to that file's existing content (see Step 3).

`category` distinguishes *why* a finding exists, so a human skimming filed issues can tell them apart at a glance:
- **`drift`** — the document no longer matches the codebase's current reality.
- **`template-conformance`** — the document no longer matches the structure its own generator established.
- **`best-practice`** — the document is accurate and well-structured, but not written in a way that gets the harness to perform well.

**`oldString`/`newString` must be exact, unique, verbatim quotes from the target file** — not paraphrased "Current/Proposed" prose. A consuming skill that still applies patches directly (e.g. `/init` Phase 6, `/wrap-up` Step 7) does so via the `Edit` tool, which requires `oldString` to match uniquely; a paraphrased or non-unique quote will fail to apply or apply to the wrong location. **Exception: CLAUDE.md findings never auto-apply regardless of classification/confidence/reversibility.** CLAUDE.md governs every future session's behavior; an unattended routine editing it carries outsized blast radius compared to a single skill's documentation. (`/claude-tweaks:harness-health` itself no longer applies anything, to CLAUDE.md or anything else — it always files, per its own `SKILL.md` Step 7.)

## Step 1: Evidence Pre-Checks (deterministic, before judging)

Before forming any finding, run these mechanical checks and treat their output as evidence the judgment step weighs — not findings themselves:

> **Parallel execution:** Use parallel tool calls aggressively — checks 1-8 below are independent read-only ls/grep/find/wc/sed calls against the same target with no dependency on one another and should run concurrently.

1. **Stale-example check.** For every backtick-quoted file path or command referenced in the target (e.g. `` `src/auth/login.js` ``, `` `npm run build` ``), verify it still exists / still works:
   ```bash
   ls "<referenced-path>" 2>&1
   ```
   For commands, check the command exists in `package.json` scripts, a `Makefile`, or is a known binary. A referenced path or command that no longer resolves is strong evidence for a `stale examples` finding — cite the exact `ls`/check output as the finding's evidence, not just "this looks outdated."

2. **Quantified convention-drift check.** For each documented convention or pattern (e.g., "this project always uses X for Y"), grep how many current files actually match it vs. how many files in the same domain don't:
   ```bash
   grep -rl "<pattern-signature>" <domain-dir> | wc -l
   ```
   A convention followed by a small minority of relevant files (e.g., "2 of 15") is quantified evidence of drift — cite the ratio in the finding's evidence field, not just an impression.

3. **Rule glob-resolution check** (rules only, new). Expand the rule's `paths:` frontmatter glob(s) against the actual filesystem:
   ```bash
   find "<root>" -path "<glob>" 2>&1
   ```
   Zero matches is strong, mechanical evidence the rule's domain no longer exists (a renamed/removed directory) — a high-confidence `drift` finding proposing either an updated glob or retiring the rule.

4. **Tiered line-budget check** (CLAUDE.md and rules, revised). Budget scales with how unconditionally a file loads, not with what kind of file it is:
   - **Always-loaded tier** — CLAUDE.md, and any `.claude/rules/*.md` file whose `paths:` frontmatter is absent or empty (`parseRulePaths` in `bin/lib/harness-health/scope.js` already returns `[]` for exactly this case — it loads every session identically to CLAUDE.md). Budget: the `harness-health.always-loaded-budget` line in `.claude-tweaks/policy.yml`, or 150 if the file or key is absent.
   - **Scoped tier** — any rule with a non-empty `paths:` list. Budget: the `harness-health.scoped-rule-budget` line in `.claude-tweaks/policy.yml`, or 30 if the file or key is absent.

   ```bash
   wc -l <target-path>
   cat .claude-tweaks/policy.yml 2>/dev/null | grep '^harness-health\.'
   ```

   Classify the target's tier, resolve its budget from the grep output (falling back to the stated default when the file or key is absent — exactly how `execution.always` is already read elsewhere in this plugin, no code involved), then compare. Over budget is mechanical, high-confidence evidence for a `template-conformance` finding — content belongs in a skill instead (always-loaded tier), or needs tightening/splitting (scoped tier), per `skills/init/claude-md-template.md`'s "Under 150 lines" principle and `skills/init/rules-template.md`'s budget guidance.
5. **Unscoped-rule structural check** (rules only, new). Parse the rule's frontmatter for a `paths:` key:
   ```bash
   sed -n '/^---$/,/^---$/p' "<rule-path>"
   ```
   A rule with no `paths:` key, or an empty list, is a mechanical, always-high-confidence `template-conformance` finding on its own — independent of line count — citing `skills/init/rules-template.md`'s "Only create rules for conventions that are path-specific; project-wide conventions belong in CLAUDE.md" contract. A 10-line unscoped rule still gets flagged; it is a structural violation regardless of size, just a cheap one to fix.
6. **Self-referential count/date check** (any kind, new). Grep the target for a hand-typed, self-tracking claim:
   ```bash
   grep -nE 'as of [0-9]{4}-[0-9]{2}-[0-9]{2}|currently [0-9]+ (items?|entries|rules)|pruned from [0-9]+' "<target-path>"
   ```
   A match is mechanical evidence for a `best-practice` finding — a hand-typed count or date claim drifts the moment reality changes, because nothing recomputes it. Recommend removing the claim, or replacing it with a pointer to a live check (`/claude-tweaks:harness-health --target <name>`) instead of a hardcoded number.
7. **Narrative-density heuristic** (any kind, new, approximate). For a file or section whose stated shape is a terse list (a rule file's body; a `## Don'ts`-style section), compute average words-per-bullet-line — when the terse-list shape is only *part* of the target file (e.g. CLAUDE.md's `## Don'ts` section among many other sections), extract just that section first, since running `wc -w` over the whole file dilutes the ratio with unrelated prose and produces a meaningless number:
   ```bash
   # Whole-file target (e.g. a rule file whose entire body is the terse list):
   grep -c '^- ' "<target-path>"
   wc -w "<target-path>"

   # Section-scoped target (e.g. CLAUDE.md's `## Don'ts` section specifically) — isolate the
   # section first, from its heading up to (not including) the next `## ` heading. Use awk, not
   # a `sed` range + trailing `sed '$d'`: when the target section is the LAST one in the file
   # (no following `## ` heading to end the range on), a range print runs to EOF and an
   # unconditional `$d` then deletes the genuine last content line instead of a heading.
   awk '/^## {section heading}$/{p=1; print; next} /^## /{ if (p) exit } p' "<target-path>" > /tmp/harness-health-section.txt
   grep -c '^- ' /tmp/harness-health-section.txt
   wc -w /tmp/harness-health-section.txt
   ```
   Divide word count by bullet count for a rough average, computing both counts over the same extracted content. Above roughly 40 words/bullet is evidence — not a verdict — that specific bullets have drifted from a terse constraint into an incident narrative. Feed this as an anchor into dimension 8's existing best-practice judgment rather than treating it as a standalone finding; tune the threshold from real findings over time.
8. **Bare skill-invocation reference check** (skills only, new). Grep the target skill's actionable instruction text — `## Step N` bodies and `## Next Actions` blocks — for a bare `/{other-skill-name}` referencing another skill in the same project, without a `claude-tweaks:`-style fully-qualified prefix:
   ```bash
   grep -nE '/[a-z][a-z0-9-]*\b' "<target-path>"
   ```
   A bare reference sitting inside imperative instruction text ("Run `/X`", "`/X` handles it") — as opposed to a Relationship-to-Other-Skills table row or other descriptive prose, where a bare short name is never passed to a tool call — is evidence for a `best-practice` finding: the `Skill` tool requires the fully-qualified name, and a bare short form fails at invocation time. Distinguishing actionable text from descriptive prose requires reading the surrounding section, not just the grep hit — treat this as a candidate list to triage, not a verdict. Feed confirmed hits into dimension 8's best-practice judgment.

Checks 1-2 are optional assists — skip gracefully if a referenced path/command genuinely can't be checked mechanically (e.g., a described convention with no clean grep signature). A finding grounded in one of these checks is higher-confidence than one based on reading alone.

## Step 2: The 8-Dimension Check

For the target (or, for wrap-up/init, each skill in their own read set), apply the dimensions that meaningfully apply to its kind:

| Check | Question | Skill | Rule | CLAUDE.md |
|-------|----------|:---:|:---:|:---:|
| **1. Pattern accuracy** | Do documented examples/patterns still match how the codebase works? | ✓ | ✓ (does the stated convention still hold for files matching `paths:`?) | ✓ |
| **2. Convention drift** | Do documented conventions reflect current practice, or has the codebase diverged? (Use the quantified check from Step 1 where a clean grep signature exists.) | ✓ | ✓ (the adherence-ratio check — see guard below) | ✓ |
| **3. Missing patterns** | Has the codebase introduced patterns that belong here but aren't documented? | ✓ | — | ✓ (always a `patch` to an existing section, never a new one) |
| **4. Stale examples** | Do referenced file paths/commands still exist? (Use the stale-example check from Step 1.) | ✓ | ✓ (the glob-resolution check) | ✓ |
| **5. Anti-pattern gaps** | Has the codebase revealed new anti-patterns worth documenting? | ✓ | — | ✓ (Don'ts) |
| **6. Decision framework completeness** | Does the Decision Framework cover the choices the codebase actually makes? | ✓ | — | rarely (only if the project's CLAUDE.md happens to have one) |
| **7. Template/structural conformance** (new) | Does this artifact still match the structure its own generator established? | ✓ (CLAUDE.md's own "SKILL.md structure" convention + `skills/init/skill-template.md`) | ✓ (`skills/init/rules-template.md`'s frontmatter shape) | ✓ (`skills/init/claude-md-template.md`'s "Principles" — 150-line budget, observed-not-aspirational, required sections, Working Approach present verbatim) |
| **8. Best-practice/harness-performance fit** (new) | Does it follow known practices for getting an LLM harness to perform well (clear triggers, no cross-skill overlap, right-sized scope, concision)? | ✓ (`superpowers:writing-skills`) | ✓ (`skills/init/rules-template.md`'s own "path-specific only; project-wide belongs in CLAUDE.md" guidance — a suspiciously broad glob should be a CLAUDE.md convention instead) | ✓ (`skills/init/claude-md-template.md`'s Principles, same source as dimension 7 for this kind) |

For rules and CLAUDE.md, dimensions 7 and 8 read from the *same* origin-template file — for those two kinds the structural template and the best-practice guidance are the same document, since the project's own author already encoded best-practice judgment into the template. Read these templates **live** each time, not from a frozen copy of their content — a future tightening of `skill-template.md`/`rules-template.md`/`claude-md-template.md` is picked up automatically by every subsequent audit.

**Rule adherence-ratio guard (dimension 2).** A low adherence ratio (few files matching `paths:` actually follow the stated convention) has two different causes, and only one belongs to this procedure:
- **The codebase's shape moved on** (the glob now matches files the rule was never meant to cover, e.g. a newer sibling directory) → this is documentation drift, a real finding here.
- **Files that should comply, don't** (the rule is still correct; code violates it) → this is a code-quality/compliance problem, `/claude-tweaks:code-health`'s job, not this procedure's. Do not emit a finding for this case.

Always reason about *why* the ratio is low before emitting a finding — never report the raw ratio as if a low number were self-evidently a documentation problem.

**CLAUDE.md-specific checks unlocked by dimension 7/8 (concrete, largely mechanical):**
- **Line budget** — Step 1's tiered `wc -l` check vs. the `harness-health.always-loaded-budget` policy line (default 150).
- **Observed-not-aspirational** — flag language ("should", "TODO", "need to add") describing infrastructure that doesn't exist yet; that belongs in the project's backlog, not CLAUDE.md.
- **Working Approach present verbatim** — `skills/init/claude-md-template.md` mandates this section be included unmodified in every generated CLAUDE.md; a structural presence check.
- **Don'ts are guardrails, not wishes** — every Don't must describe an *existing* pattern (grep-checkable, same evidence style as dimension 2), never aspirational infrastructure.
- **Philosophy matches current maturity** — re-derive today's maturity signal (the classification `/claude-tweaks:init` Phase 2h would compute right now) and compare it to what the Philosophy section says; flags e.g. a project that shipped to real users since the CLAUDE.md was written but still reads "Greenfield."
- **Project Defaults / claude-tweaks Pipeline sections in sync with the installed plugin version** — does the documented auto-mode-policy lever list match what the currently installed claude-tweaks plugin version actually supports? This one is checked against the plugin's own evolving contract (its bundled `_shared/auto-mode-contract.md`), not the target project's own source — a genuinely different kind of drift from every other check in this file.

## Memory-Specific Checks (`assetType: memory` targets)

A `memory` target skips the 8-dimension check above entirely — its checks are narrower and more mechanical, closer in spirit to the `design-artifact` branch than to a full skill/rule/CLAUDE.md audit. `assetType` is `"memory"`; `target` is the memory file's id (its filename stem, from `MEMORY.md`'s link).

1. **Index line-length check.** Each `MEMORY.md` bullet line has a fixed 150-character budget — not project-configurable like the checks above, since this is a cross-project harness convention rather than a per-project stylistic choice:
   ```bash
   awk '{ if (length($0) > 150) print NR": "length($0)" chars" }' MEMORY.md
   ```
   A flagged line is mechanical evidence for a `template-conformance` finding — tighten the index entry to a true one-line hook.
2. **Fact-currency check.** Read the memory file's full body and extract concrete, checkable claims: referenced file/skill paths, specific IDs, status words (`pending`, `shipped`, `scheduled`, `in progress`), dated claims. Verify each against current reality:
   - A referenced path/command is exactly Step 1's stale-example check, applied to this file's body instead of a skill's.
   - A status word (`pending`, `shipped`) is checked against `git log --oneline --grep` for the described change, or against whether the file/skill it predicts now actually exists.
   Where a claim genuinely cannot be checked mechanically, skip it — the same opportunistic-assist caveat Step 1 already states for checks 1-2. A contradicted claim is high-confidence evidence for a `drift` finding.
3. **Duplication-with-checked-in-content check.** Grep the memory file's distinctive phrases (named files, function names, specific facts) against skill/rule content:
   ```bash
   grep -rl "<distinctive phrase from the memory file>" skills/ .claude/rules/ 2>/dev/null
   ```
   A hit is evidence for a `drift` finding recommending the memory entry shrink to a pointer/reference rather than a restated copy.
4. **Runbook-shape heuristic** (informational only — this phase detects and flags, it does not promote). Count fenced code blocks:
   ```bash
   grep -c '^```' "<memory-file-path>"
   ```
   Two or more fenced blocks, or several lines that look like shell commands, is evidence worth noting in the finding's `reason` field: "reads like an operational runbook, consider promoting to `docs/`" — no automated doc creation this phase.

**Filing posture for memory findings.** Memory is audited exclusively by `/claude-tweaks:harness-health` (never by `/init` or `/wrap-up`, both skill-only), and `/claude-tweaks:harness-health` is report-only — additive and restructural memory findings alike always file as a `harness-health`-labelled issue for human review, the same posture CLAUDE.md findings get, per `skills/harness-health/SKILL.md` Step 7.

**Bounded sub-file reads.** If the target references sub-files (lazy-loaded content, e.g. `init`'s 11 sub-files or `build`'s 6), do not read all of them by default — read only the sub-files whose content plausibly relates to what changed (matched by filename/section keyword against the change source: churned domain paths for the routine, the spec's changed files for wrap-up, Phase 2 findings for init). Note explicitly which sub-files were skipped and why, so a human reviewing the finding can request a deeper read if needed.

## Step 3: New-Skill Gap Detection

Independent of any specific target's audit, look for a **cohesive** set of files implementing one reusable pattern with **no** skill covering it. This step is skill-only — rules and CLAUDE.md never get an equivalent "new-rule" or "new-claude-md-section" gap scan this phase; their dimension 3 ("missing patterns") is the closest analog, and it always produces a `patch` against existing content instead. "Cohesive" means multiple files implementing the same pattern, not scattered one-off edits — ground this in concrete signals, not impression alone:

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

Before a finding is emitted, re-examine it and answer three questions — same discipline `/code-health` already applies:

1. **Is it real?** Does the target actually diverge from the codebase (or its own origin template, or known best practice), or did the judge misread the target's prose, the code's structure, or the template's requirements?
2. **Is it actionable?** For a patch: is `oldString` an exact, unique quote from the target file, and does `newString` concretely fix the issue (not "consider updating this")? For a new-skill candidate: is `proposedBody` a real, codebase-grounded SKILL.md, not a generic template?
3. **Does it reproduce?** Given the evidence cited, would a reviewer applying `newString` (or creating the proposed skill) end up with content that's actually correct, without further investigation?

Drop any finding that fails any of the three questions. Log the drop reason. This gate is a judgment step, not mechanical — do not skip it even for a routine firing under no time pressure to rush.

## Step 6: Quality Gates (before finalizing any patch or new skill)

- [ ] Every code example is adapted from actual codebase patterns (not generic).
- [ ] File paths referenced actually exist (post-patch).
- [ ] Commands referenced actually work.
- [ ] Conventions described match what the codebase actually does.
- [ ] No generic advice that adds no project-specific value.
- [ ] Anti-patterns/Don'ts cite project-specific reasons, not textbook warnings.
- [ ] A `kind: "new-skill"` finding's `proposedBody` description starts with "Use when..." and names a clear trigger.
- [ ] A `category: "template-conformance"` or `"best-practice"` finding cites the specific origin-template requirement it's checking against (not a vague "this could be better").

## Anchor Requirement

Every finding must trace to a concrete anchor — a specific referenced path/command that failed the Step 1 check, a quantified drift ratio, a zero-match glob expansion, a line-count over budget, a ledger entry, a reflection insight, or a specific changed-file/commit observation. A finding with no concrete anchor is indistinguishable from a hallucinated one — discard it, and note what was discarded and why.
