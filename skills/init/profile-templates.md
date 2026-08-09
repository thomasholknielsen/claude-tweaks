# Phase 3 / Phase 4: Profile, Drift Report, and Skill Manifest Templates

## Initial Mode: Stack Profile

Synthesize Phase 2 findings into a structured profile:

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

### Maturity Signals
- **Classification:** {greenfield/pre-launch/early-production/established}
- **Key signals:** {age, migrations, production infra, contributors, etc.}

### Skill Candidates
{Prioritized list — see Phase 4}
```

Call `AskUserQuestion`:

- `question`: `"Does this profile look accurate?"`, `header`: `"Profile review"`, `multiSelect`: `false`
- Option 1 — `label`: `"Looks good"`, `description`: `"Proceed to skill generation"`
- Option 2 — `label`: `"Needs corrections"`, `description`: `"I'll tell you what to fix"`
- Option 3 — `label`: `"Missing context"`, `description`: `"Let me add team conventions you can't see in the code"`

Also ask: **"Are there team conventions or preferences that aren't visible in the code?"** (e.g., PR review process, deploy cadence, on-call expectations, style preferences debated but never codified)

Wait for confirmation before proceeding.

## Update Mode: Drift Report

Compare the Phase 1u inventory against Phase 2 findings. Classify every finding:

```markdown
## Configuration Health Report

### Summary
- **Covered:** {N} patterns accurately documented
- **Stale:** {N} references to things that changed or no longer exist
- **Drifted:** {N} documented patterns the codebase has moved away from
- **Gaps:** {N} codebase patterns with no config coverage
- **Contract Drift:** {N} plugin-authored sections missing from or drifted in CLAUDE.md

### Contract Drift (claude-tweaks template conformance)

Plugin-authored CLAUDE.md sections that are missing entirely, or present but drifted from the current template. Patches come verbatim from `claude-md-template.md` — no judgment calls.

| Section | Status | Patch source |
|---|---|---|
| {one row per entry in Phase 1u.5's `missing` and `drifted` results — see `update-mode.md`, the canonical owner of the conformance check} | {missing \| drifted} | {the entry's `expected` body} |

Call `AskUserQuestion`:

- `question`: `"How do you want to handle the Contract Drift patches?"`, `header`: `"Contract drift"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all"`, `description`: `"Apply all contract patches"`
- Option 2 — `label`: `"Choose per-item"`, `description`: `"Tell me which patches to apply"`
- Option 3 — `label`: `"Skip"`, `description`: `"Don't apply contract patches"`

Patch bodies are template-sourced.

**Sequencing:** Present Contract Drift batch first; after resolution, present Stale/Drifted/Gaps batch. Per docs/skill-authoring.md's Interaction patterns, never present more than one batch decision table per message.

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

Call `AskUserQuestion`. This site has no existing enumerated options to port — a genuine new-but-consistent option set matching the sibling Contract Drift decision's "Apply all / per-item override / Skip" vocabulary above, not a straight reformat:

- `question`: `"Here's what I found. Which items should I fix?"`, `header`: `"Stale / drifted / gaps"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended fixes (Recommended)"`, `description`: `"Fix all stale and drifted items"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which items to fix"`
- Option 3 — `label`: `"Skip — review later"`, `description`: `"Leave these for a future /init update run"`

Wait for confirmation before proceeding.

## Phase 4: Skill Manifest

Use this template when presenting scored skill candidates (see `phase-4-scoring.md` for the scoring rubric):

```markdown
## Skill Manifest

### Priority 1 (score 6+) — Generate now
| Skill | Freq | Cmplx | Danger | Score | Rationale |
|-------|------|-------|--------|-------|-----------|
| data-access | 3 | 3 | 3 | 9 | Heavy DB usage, complex query patterns, migration risk |
| ... | ... | ... | ... | ... | ... |

### Priority 2 (score 4-5) — Generate if time permits
| ... |

### Priority 3 (score 3) — Defer
| ... |

### Not needed
- {technology} — too standard, no project-specific patterns to encode

### Meta-skills to consider
- `/claude-tweaks:wrap-up` — captures learnings after completing features (keeps skills alive)
- `/claude-tweaks:review` — validates implementation quality against project conventions
```

Call `AskUserQuestion`:

- `question`: `"Which skills should I generate?"`, `header`: `"Skill manifest"`, `multiSelect`: `false`
- Option 1 — `label`: `"All Priority 1 (Recommended)"`, `description`: `"Generate all Priority 1 skills"`
- Option 2 — `label`: `"Priority 1 + 2"`, `description`: `"Generate all Priority 1 and Priority 2 skills"`
- Option 3 — `label`: `"Pick specific ones"`, `description`: `"List the skill names to generate"`
- Option 4 — `label`: `"None for now"`, `description`: `"I'll generate them later"`
