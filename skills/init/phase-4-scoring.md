# Phase 4: Skill Manifest Scoring + Presentation

Loaded by `/init` Phase 4. Contains the scoring rubric (Frequency × Complexity × Danger), the manifest presentation template, the selection prompt, and the deferred-skills backlog work-record format.

## Scoring

**Frequency** (how often will this skill be invoked?):

| Score | Meaning | Example |
|-------|---------|---------|
| 3 | Daily / every session | data-access for a DB-heavy app |
| 2 | Weekly / regular | migrations, testing patterns |
| 1 | Occasional | deployment, CI config changes |

**Complexity** (how much project-specific knowledge does the pattern require?):

| Score | Meaning |
|-------|---------|
| 3 | High — many project-specific conventions, easy to get wrong |
| 2 | Medium — some project conventions, some general knowledge |
| 1 | Low — mostly standard, little project-specific knowledge needed |

**Danger** (how bad is it if you get this wrong without a skill?):

| Score | Meaning | Example |
|-------|---------|---------|
| 3 | Data loss, security holes, broken prod | migrations, auth, deployment |
| 2 | Bugs, test failures, CI breakage | testing conventions, API patterns |
| 1 | Style issues, minor friction | naming, import style |

**Priority = Frequency + Complexity + Danger** (max 9). Generate skills scoring 6+ first.

## Skill Categories

Map detected stack to skill categories using the canonical Detected-Pattern → Skill table in `skill-categories.md` in this skill's directory. Only generate skills for patterns that **actually exist and are actively used** in the codebase. Mark aspirational skills as `[aspirational]` — they become backlog work records, not SKILL.md files.

## Present the Manifest

Use the **Skill Manifest** template in `profile-templates.md` (this skill's directory) for the manifest presentation format and the selection prompt.

## Deferred Skills → Backlog

Skills not selected for generation (Priority 2-3, or aspirational skills marked `[aspirational]`) are captured as backlog work records with their scoring rationale and Phase 2 evidence (`_shared/work-record.md`; no `by:*` label — an `Origin: /init skill scoring (Phase 4)` body line records provenance instead):

```markdown
### Create data-access skill (Priority 2, score 5)
Freq: 2, Complexity: 2, Danger: 1.
Detected: Prisma ORM with 12 models, query patterns in `src/lib/db/`,
custom transaction wrapper in `src/lib/db/transaction.ts`.
Convention: repository pattern with co-located queries.
```

```markdown
### Create testing skill [aspirational]
No tests exist yet. Framework detected: Vitest (in devDependencies, unused).
Test config: `vitest.config.ts` exists but `src/**/*.test.*` returns 0 files.
When tests are added, this skill should encode: {patterns from similar stacks}.
```

This ensures no reconnaissance is wasted — the Phase 2 context is preserved for when the user is ready to create these skills.
