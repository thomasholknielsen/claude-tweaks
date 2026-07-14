# Phase 5: Pain Point Routing

Loaded by `/init` Phase 5 (Generate / Update CLAUDE.md). Phase 2f findings split into two destinations based on their category (see `detection-tables.md`):

- **Convention conflicts and anti-patterns** → CLAUDE.md Don'ts (guardrails for existing patterns)
- **Missing infrastructure, practices, stale deps, dead code** → backlog work records with Phase 2 context baked in

## Backlog work-record templates

Backlog work records for improvement work follow the same format as doc work items from Phase 8.5 (`_shared/work-record.md`; no `by:*` label — an `Origin: /init pain-point routing (Phase 5)` body line records provenance instead):

```markdown
### Set up CI pipeline
Project deploys to {target} using {framework} but has no CI.
Scripts available: `lint` ({tool}), `test` ({framework}), `build`, `typecheck`.
Suggested pipeline: lint → typecheck → test → build.
```

```markdown
### Add test coverage for src/utils/
{N} utility functions with no test coverage. Complex functions: {list with line counts}.
Testing framework: {framework}. Test location convention: {co-located / separate dir}.
```

```markdown
### Upgrade {dependency} (v{current} → v{latest})
{N} major versions behind. Key breaking changes: {list}.
Files importing this dep: {count} across {dirs}.
```

## Routed summary template

Present a summary of routed pain points after CLAUDE.md generation:

```
### Pain Points Routed

**→ CLAUDE.md Don'ts ({N}):** {list of convention conflicts / anti-patterns added}
**→ Backlog ({N}):** {list of improvement items captured}
```
