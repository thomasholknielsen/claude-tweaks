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

### Verification (from /test)
- Type check: {pass/fail}
- Lint: {pass/fail}
- Tests: {pass/fail}

### QA Validation (from /test)
- **Status:** {ALL PASSED (N stories, M caveats) | PASSED WITH OBSERVATIONS (N stories, M caveats) | PARTIAL FAILURE (N passed, M failed) | Skipped — no stories | Skipped — no dev server | Not run}

Possible QA statuses:
- **ALL PASSED** — all stories passed with no caveats
- **ALL PASSED (N stories, M caveats)** — all stories passed, some had caveats (informational, not blocking)
- **PASSED WITH OBSERVATIONS** — all stories passed but at least one reported PASS_WITH_CAVEATS
- **PARTIAL FAILURE** — some stories failed (see findings in QA report)
- **Skipped** / **Not run** — QA did not execute

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
- **Status:** {Completed (code + visual) | Completed (code + visual, QA-enriched) | Completed (code only — no browser) | Recommended | Skipped — no UI changes | Skipped — browser tools not configured}
- {If completed: summary of visual/UX findings and ideas from Reimagine step}
- {If completed with QA data: note QA data enrichment — caveats surfaced, page inventories consumed, findings confirmed/resolved}
- {If recommended: `/claude-tweaks:review journey:{name}` or `/claude-tweaks:review visual {url}`}

### Code Simplification
- {summary of simplifier changes, or "No simplifications needed"}

### Manual Steps Required
| # | What | Where |
|---|------|-------|
| 1 | {description} | {source} |
(or: No manual steps — nothing to do outside the codebase.)

> These require action after merging. The pipeline detected them but cannot execute them.
> **In `/flow` pipeline context:** Skip this section — flow's pipeline summary handles it.

### Verdict
**{PASS}** or **{BLOCKED — issues need fixing}**

### Actions Performed

{Include when review fixed findings, simplified code, or resolved ledger items. Omit when review was purely observational.}

| Action | Detail | Ref |
|--------|--------|-----|
| Bug fix | {finding fixed} — `{file}` | `{hash}` |
| Simplified | {simplification} — `{file}` | `{hash}` |
| Ledger fix | {item resolved} ({phase}) — `{file}` | `{hash}` |

Generate from: git log since review start, findings with status `fixed`, ledger entries resolved during review.

### Next Actions

**When PASS:**

| Signal | Option |
|--------|--------|
| Always | `/claude-tweaks:wrap-up {N}` — capture learnings and clean up **(Recommended)** |
| Visual not done + journeys affected + browser | `/claude-tweaks:review journey:{name}` — walk affected journey before wrapping up |
| Visual not done + UI changed + browser | `/claude-tweaks:review visual {url}` — visual pass before wrapping up |

**When BLOCKED:**

| Signal | Option |
|--------|--------|
| Always | `/claude-tweaks:build {N}` — fix gaps listed above **(Recommended)** |
| Test failures | `/claude-tweaks:test` — re-verify after fixes |
```
