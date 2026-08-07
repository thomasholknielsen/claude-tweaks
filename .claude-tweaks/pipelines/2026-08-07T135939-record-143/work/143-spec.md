---
record: 143
origin: human
risk: medium
effort: medium
ceremony: standard
grants: [build]
blocked-by: [141, 142]
surface: backend
---
# 143: upstream-drift: runner, version-driven triggers, and issue filing
Surface: backend
Parent: #140
Blocked by #141
Blocked by #142

## Overview

Wires the two halves of the upstream-drift auditor into something runnable: a CLI entry point that reads the manifest, runs the deterministic checks, hands their output plus the contract-path diff to the judge, and files deduplicated `by:upstream-drift` issues.

Also establishes the trigger model, which is the one place this auditor deliberately departs from the four shipped health sweeps: those rotate through targets on a cursor because there is always more repo to audit. Here there is nothing to look at until a version changes, and everything to look at the moment one does.

**Complexity:** Medium
**Estimated tasks:** 5-7

## Non-Goals

- The manifest, the checks, or the judge procedure — #141 and #142 own those.
- A cloud Routine schedule. This is maintainer-local tooling run on demand; scheduling is a later decision, not a deliverable here.
- Any change to the four shipped health sweeps, including #117's staleness fix.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #141 | upstream-drift: manifest schema and the deterministic checks | ready |
| #142 | upstream-drift: the capability-triage skill | ready |

## Current State

- `bin/lib/health-core/` — cache, fingerprint, dedup and issue-filing helpers used by the four shipped sweeps. Import from here; do not reimplement.
- `bin/code-health.js` and siblings — the shape of a sweep's CLI entry point. Follow the argument and output conventions, not the rotation logic.
- `[IL-73]` — running a health CLI with real arguments pushes durable state to the shared `health-state` branch and stamps a 90-day rotation cursor. Whatever this leaf builds must be exercisable without that side effect.
- Labels: `by:upstream-drift` does not exist yet and must be created.

## Deliverables

- [ ] `tools/upstream-drift/run.js` — CLI entry point
- [ ] Version-driven trigger logic (below), with no rotation cursor
- [ ] Issue filing via `bin/lib/health-core/`, under a new `by:upstream-drift` label
- [ ] A `--dry-run` mode that reports findings without filing anything
- [ ] Tests, with the glob registered in `package.json`

## Acceptance Criteria

1. Triggers are version-driven. A target is due when a version moved, never on a cursor:

| Condition | Finding |
|---|---|
| `installed != pinned` | Contract breach, highest severity |
| `latest != installed` | Upgrade available; diff `contract-paths` across tags for a capability report |
| Assertion fails to resolve | Drift |
| Fixture replay mismatch | Runtime contract breach |

2. When no version moved and every assertion and fixture holds, the run files nothing and says so. No-delta must not produce a "nothing found" issue.
3. `--dry-run` performs every check and prints findings without creating, editing or closing any issue. Verify by running it against a deliberately breached manifest and confirming `gh issue list` is unchanged.
4. Filed issues are deduplicated by fingerprint against existing open `by:upstream-drift` issues — a second run over the same unresolved drift updates rather than duplicates.
5. A finding names both versions involved, so a reader can tell a stale finding from a fresh one without re-deriving it.
6. Running the entry point in dry-run mode writes nothing to the `health-state` branch and stamps no cursor.
7. Nothing under `bin/` imports from `tools/`. Verify by grep.

## Technical Approach

### Key Files

- `tools/upstream-drift/run.js` — new
- `tools/upstream-drift/tests/run.test.js` — new
- `package.json` — register the test glob (`[IL-84]`)

### Package Dependencies

- `bin/lib/health-core/` — cache, fingerprint, dedup, issue filing. One-way import only.

## Gotchas

- Do not copy the rotation cursor from the four shipped sweeps. It is the wrong trigger model here and would sit on a real breaking bump for up to a rotation period.
- `[IL-73]`: never test this by running it with real arguments. Exercise the module directly or through its unit suite.
- A `--dry-run` that still writes cache or fingerprint state is not a dry run. Gate every write, not just the issue-filing call.
- The `by:upstream-drift` label must be created before the first real run, or filing fails at the last step after all the work is done.
- Findings that report "upgrade available" are not defects and must not read as defects — an upgrade report and a contract breach are different severities and should not be filed identically.

