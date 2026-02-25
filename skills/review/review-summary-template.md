# Review Summary Template

Present this summary after completing all review steps.

```markdown
## Review: {spec number or description}

### Spec Compliance (spec-based only)
| Deliverable | Status |
|-------------|--------|
| {deliverable} | {done/partial/missing} |

| Acceptance Criterion | Status |
|---------------------|--------|
| {criterion} | {met/partially met/not met} |
(or: No spec — file/commit-based review.)

### Verification
- Type check: {pass/fail}
- Lint: {pass/fail}
- Tests: {pass/fail}

### QA Validation
- **Status:** {ALL PASSED (N stories) | Skipped — no stories | Skipped — no dev server}

### Code Review Findings
| Category | Finding | Severity | Action |
|----------|---------|----------|--------|
| {convention/security/error/perf/arch/test} | {finding} | {low/medium/high} | {fixed/captured/accepted} |
(or: No findings — code is clean.)

### Implementation Hindsight
- {finding} → {change now / capture to INBOX / accept as-is — not an improvement because {reason}}
(or: No changes needed — approach is sound.)

### Tradeoffs Accepted
| Tradeoff | Rationale |
|----------|-----------|
| {what was accepted} | {why — the reasoning that made this acceptable} |
(or: No tradeoffs — all findings were addressed or trivial.)

> `/claude-tweaks:wrap-up` uses this section to decide whether accepted tradeoffs should be documented in CLAUDE.md, skills, or memory files. A tradeoff worth accepting once may be worth documenting as a project convention.

### Visual Review
- **Status:** {Completed / Recommended / Skipped — no UI changes / Skipped — browser tools not configured}
- {If completed: summary of visual/UX findings}
- {If recommended: `/claude-tweaks:review journey:{name}` or `/claude-tweaks:review visual {url}`}

### Code Simplification
- {summary of simplifier changes, or "No simplifications needed"}

### Verdict
**{PASS}** or **{BLOCKED — issues need fixing}**

### Recommended Next

- If **PASS**: `/claude-tweaks:wrap-up {number}` — capture learnings and clean up.
- If **BLOCKED**: Resume `/claude-tweaks:build {number}` to address the gaps listed above.
```
