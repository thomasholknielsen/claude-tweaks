# Phase 2: Profile and Drift Report Templates

## Initial Mode: Stack Profile

Synthesize Phase 1 findings into a structured profile:

```markdown
## Stack Profile: {project name}

### Identity
- **Domain:** {what the project does}
- **Type:** {monorepo | single app | library | CLI tool | API service}
- **Age:** {first commit date}
- **Activity:** {commits last 90 days, approx contributors}
- **Size:** {approximate file count, lines of code if easily available}

### Stack Table
| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Language | {e.g., TypeScript 5.x} | {version} | {strict mode, etc.} |
| Runtime | {e.g., Node 22, Python 3.12} | {version} | {from .node-version, etc.} |
| ... | ... | ... | ... |

### Architecture
- **Pattern:** {MVC, Clean Architecture, feature-based, hexagonal, etc.}
- **API style:** {REST, GraphQL, tRPC, etc.}
- **Data flow:** {brief description}

### Conventions (observed)
- **Naming:** {patterns detected}
- **Testing:** {framework, co-located vs separate, naming}
- **Commits:** {conventional? format?}
- **Errors:** {custom classes? raw throws?}
- **Imports:** {absolute/relative, aliases, barrel files}

### Workflows
- **CI/CD:** {what runs, where}
- **Deploy:** {target, method}
- **Key scripts:** {list most important}

### Health Indicators
- **Type safety:** {strict TS? assertion count? JS files in TS project?}
- **Test coverage:** {rough estimate — which dirs have tests, which don't}
- **Debt signals:** {TODO count, disabled rules, type assertion hotspots}
- **Inconsistencies:** {patterns done multiple ways}

### Existing AI Config
- {what was found, or "None"}

### Skill Candidates
{Prioritized list — see Phase 3}
```

Present as numbered options:

```
Does this profile look accurate?
1. Looks good — proceed to skill generation
2. Needs corrections — I'll tell you what to fix
3. Missing context — let me add team conventions you can't see in the code
```

Also ask: **"Are there team conventions or preferences that aren't visible in the code?"** (e.g., PR review process, deploy cadence, on-call expectations, style preferences debated but never codified)

Wait for confirmation before proceeding.

## Update Mode: Drift Report

Compare the Phase 0u inventory against Phase 1 findings. Classify every finding:

```markdown
## Configuration Health Report

### Summary
- **Covered:** {N} patterns accurately documented
- **Stale:** {N} references to things that changed or no longer exist
- **Drifted:** {N} documented patterns the codebase has moved away from
- **Gaps:** {N} codebase patterns with no config coverage

### Stale (fix or remove)

Things the config references that no longer match reality:

| Location | What's Stale | Current Reality |
|----------|-------------|-----------------|
| CLAUDE.md line {N} | Lists `{command}` | Script removed/renamed to `{new}` |
| Skill `{name}` | References `{path}` | File moved to `{new path}` / deleted |
| Skill `{name}` | Describes `{pattern}` | Pattern replaced by `{new pattern}` |
| Rule `{name}` | Scoped to `{path}` | Directory renamed/restructured |

### Drifted (update to match reality)

The config describes something correctly as of when it was written, but the codebase has evolved:

| Location | Documented Convention | Actual Current Practice | Evidence |
|----------|----------------------|------------------------|----------|
| CLAUDE.md | "{convention}" | Now does "{new way}" | {N} files sampled |
| Skill `{name}` | Uses `{old pattern}` | Codebase migrated to `{new}` | grep count |

### Gaps (new config needed)

Patterns found in the codebase with no corresponding config:

| Pattern | Category | Why It Needs a Skill/Rule | Suggested Action |
|---------|----------|--------------------------|------------------|
| {pattern} | {stack/convention/workflow} | {reason} | New skill / CLAUDE.md addition / new rule |

### Healthy (no action needed)

| Config Item | Status |
|------------|--------|
| CLAUDE.md Stack table | Accurate |
| Skill `{name}` | Patterns match codebase |
| ... | ... |
```

Ask: **"Here's what I found. Which items should I fix? All stale + drifted? Specific ones?"**

Wait for confirmation before proceeding.
