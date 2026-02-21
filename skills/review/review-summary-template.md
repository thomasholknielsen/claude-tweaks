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

### Code Review Findings
| Category | Finding | Severity | Action |
|----------|---------|----------|--------|
| {convention/security/error/perf/arch/test} | {finding} | {low/medium/high} | {fixed/captured/accepted} |
(or: No findings — code is clean.)

### Implementation Hindsight
- {finding} → {change now / capture for later / accept as-is}
(or: No changes needed — approach is sound.)

### Tradeoffs Accepted
| Tradeoff | Rationale |
|----------|-----------|
| {what was accepted} | {why — the reasoning that made this acceptable} |
(or: No tradeoffs — all findings were addressed or trivial.)

> `/claude-tweaks:wrap-up` uses this section to decide whether accepted tradeoffs should be documented in CLAUDE.md, skills, or memory files. A tradeoff worth accepting once may be worth documenting as a project convention.

### Code Simplification
- {summary of simplifier changes, or "No simplifications needed"}

### Verdict
**{PASS}** or **{BLOCKED — issues need fixing}**

### What's Next?

Pick an action (reply with the number):

1. `/claude-tweaks:wrap-up {number}` — Capture learnings and clean up ⭐ **(Recommended)**
2. `/claude-tweaks:build {number}` — Back to build (if BLOCKED)
3. `/claude-tweaks:help` — See full workflow status
4. Done for now
```
